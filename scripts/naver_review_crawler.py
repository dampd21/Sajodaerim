#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
네이버 플레이스 리뷰 크롤러
- 방문자 리뷰 + 블로그 리뷰 수집
- 기간 설정 가능 (펼치면서 기간 체크하여 조기 중단)
- 펼쳐서 더보기 버튼 클릭으로 리뷰 로드
- 기존 데이터와 병합 (증분 수집)
"""

import os
import sys
import json
import time
import re
import hashlib
import argparse
from datetime import datetime, timedelta

print("=" * 60, flush=True)
print("네이버 플레이스 리뷰 크롤러", flush=True)
print("=" * 60, flush=True)

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from selenium.common.exceptions import TimeoutException, NoSuchElementException, ElementClickInterceptedException
    print("[INFO] Selenium 로드 완료", flush=True)
except ImportError as e:
    print("[ERROR] Selenium 필요: " + str(e), flush=True)
    sys.exit(1)

try:
    from webdriver_manager.chrome import ChromeDriverManager
    print("[INFO] WebDriver Manager 로드 완료", flush=True)
except ImportError as e:
    print("[ERROR] WebDriver Manager 필요: " + str(e), flush=True)
    sys.exit(1)

# ============================================
# 지점별 Place ID
# ============================================
STORE_PLACES = {
    "역대짬뽕 본점": "1542530224",
    "역대짬뽕 병점점": "1870047654",
    "역대짬뽕 송파점": "2066998075",
    "역대짬뽕 다산1호점": "1455516190",
    "역대짬뽕 화성반월점": "1474983307",
    "역대짬뽕 오산시청점": "1160136895",
    "역대짬뽕 두정점": "1726445983",
    "역대짬뽕 송탄점": "1147851109",
    "역대짬뽕 여수국동점": "1773140342",
}

# 부정적 키워드 목록
NEGATIVE_KEYWORDS = [
    "별로", "실망", "아쉽", "아쉬웠", "짜다", "짰", "싱겁", "느끼", "늦", "오래 걸", 
    "불친절", "차갑", "식었", "적었", "적다", "비싸", "비쌌", "양이 적", "재방문 의사 없",
    "다시 안", "다신 안", "비추", "최악", "후회", "맛없", "맛이 없", "서비스 별로",
    "위생", "불결", "더럽", "냄새", "이상한 맛", "탔", "안 좋", "그닥", "그저 그", 
    "기대 이하", "평범", "보통", "그저 그", "애매"
]


def setup_driver():
    """Chrome 드라이버 설정"""
    print("[SETUP] Chrome 드라이버 설정 중...", flush=True)
    
    options = Options()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_argument(
        '--user-agent=Mozilla/5.0 (Linux; Android 10; SM-G975F) '
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    )
    
    try:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
        print("[SETUP] Chrome 드라이버 설정 완료", flush=True)
        return driver
    except Exception as e:
        print("[ERROR] Chrome 드라이버 설정 실패: " + str(e), flush=True)
        raise


def parse_date(date_str):
    """날짜 문자열 파싱"""
    if not date_str:
        return None
    
    # 숫자만 추출
    parts = re.findall(r'\d+', date_str)
    
    if len(parts) >= 3:
        year = int(parts[0])
        if year < 100:
            year += 2000
        month = int(parts[1])
        day = int(parts[2])
        return "{:04d}-{:02d}-{:02d}".format(year, month, day)
    elif len(parts) >= 2:
        current_year = datetime.now().year
        month = int(parts[0])
        day = int(parts[1])
        return "{:04d}-{:02d}-{:02d}".format(current_year, month, day)
    
    return None


def get_last_review_date(driver):
    """현재 로드된 리뷰 중 마지막(가장 오래된) 리뷰의 날짜 반환"""
    try:
        date_elements = driver.find_elements(By.CSS_SELECTOR, '.pui__gfuUIT time')
        if not date_elements:
            return None
        
        # 마지막 날짜 요소
        last_date_raw = date_elements[-1].text.strip()
        return parse_date(last_date_raw)
    except:
        return None


def should_stop_loading(driver, start_date):
    """시작일보다 오래된 리뷰가 나왔는지 확인"""
    if not start_date:
        return False
    
    last_date = get_last_review_date(driver)
    if not last_date:
        return False
    
    try:
        last_dt = datetime.strptime(last_date, '%Y-%m-%d')
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        
        # 마지막 리뷰가 시작일보다 이전이면 중단
        if last_dt < start_dt:
            print("[STOP] 마지막 리뷰 날짜(" + last_date + ")가 시작일(" + start_date + ")보다 이전 - 로딩 중단", flush=True)
            return True
    except:
        pass
    
    return False


def click_more_button_with_date_check(driver, start_date=None, max_clicks=200, wait_time=1.5):
    """펼쳐서 더보기 버튼 클릭 (기간 체크하며 진행)"""
    click_count = 0
    
    while click_count < max_clicks:
        # 기간 체크 - 시작일보다 오래된 리뷰가 나왔으면 중단
        if should_stop_loading(driver, start_date):
            print("[MORE] 목표 기간 도달 - 로딩 완료", flush=True)
            break
        
        try:
            # 펼쳐서 더보기 버튼 찾기
            more_button = driver.find_element(By.CSS_SELECTOR, 'a.fvwqf')
            
            # 버튼이 보이는지 확인
            if not more_button.is_displayed():
                print("[MORE] 더보기 버튼이 보이지 않음 - 완료", flush=True)
                break
            
            # 버튼 클릭
            driver.execute_script("arguments[0].click();", more_button)
            click_count += 1
            
            if click_count % 10 == 0:
                last_date = get_last_review_date(driver)
                print("[MORE] 클릭 " + str(click_count) + "회, 마지막 리뷰: " + str(last_date), flush=True)
            
            time.sleep(wait_time)
            
        except NoSuchElementException:
            print("[MORE] 더보기 버튼 없음 - 모든 리뷰 로드 완료", flush=True)
            break
        except ElementClickInterceptedException:
            driver.execute_script("window.scrollBy(0, 300);")
            time.sleep(0.5)
        except Exception as e:
            print("[MORE] 클릭 오류: " + str(e), flush=True)
            break
    
    print("[MORE] 총 " + str(click_count) + "회 클릭", flush=True)
    return click_count


def is_date_in_range(date_str, start_date, end_date):
    """날짜가 범위 내에 있는지 확인"""
    if not date_str:
        return True
    
    try:
        review_date = datetime.strptime(date_str, '%Y-%m-%d')
        
        if start_date:
            start = datetime.strptime(start_date, '%Y-%m-%d')
            if review_date < start:
                return False
        
        if end_date:
            end = datetime.strptime(end_date, '%Y-%m-%d')
            if review_date > end:
                return False
        
        return True
    except:
        return True


def is_negative_review(review):
    """부정적인 리뷰인지 판단"""
    content = (review.get('content') or '').lower()
    tags = review.get('tags') or []
    
    for keyword in NEGATIVE_KEYWORDS:
        if keyword in content:
            return True
    
    for tag in tags:
        tag_lower = tag.lower()
        for keyword in NEGATIVE_KEYWORDS:
            if keyword in tag_lower:
                return True
    
    return False


def generate_review_id(review):
    """리뷰 고유 ID 생성"""
    author = (review.get('author') or '')[:20]
    content = (review.get('content') or '')[:50]
    date = review.get('visit_date') or review.get('write_date') or ''
    
    raw = author + "_" + content + "_" + date
    return hashlib.md5(raw.encode()).hexdigest()[:16]


# ============================================
# 방문자 리뷰 파싱
# ============================================

def parse_visitor_reviews(driver, start_date=None, end_date=None):
    """방문자 리뷰 파싱"""
    reviews = []
    
    try:
        review_items = driver.find_elements(By.CSS_SELECTOR, 'li.pui__X35jYm')
        print("[PARSE] 방문자 리뷰 " + str(len(review_items)) + "개 발견", flush=True)
        
        for item in review_items:
            try:
                review = {'type': 'visitor'}
                
                # 작성자명
                try:
                    review['author'] = item.find_element(By.CSS_SELECTOR, '.pui__NMi-Dp').text.strip()
                except:
                    review['author'] = ''
                
                # 리뷰 내용
                try:
                    review['content'] = item.find_element(By.CSS_SELECTOR, '.pui__vn15t2').text.strip()
                except:
                    review['content'] = ''
                
                # 방문 키워드
                try:
                    keyword_els = item.find_elements(By.CSS_SELECTOR, '.pui__V8F9nN em')
                    review['keywords'] = [el.text.strip() for el in keyword_els if el.text.strip()]
                except:
                    review['keywords'] = []
                
                # 태그
                try:
                    tag_els = item.find_elements(By.CSS_SELECTOR, '.pui__jhpEyP')
                    tags = []
                    for tag_el in tag_els:
                        text = tag_el.text.strip()
                        if text and not text.startswith('+'):
                            tags.append(text)
                    review['tags'] = tags
                except:
                    review['tags'] = []
                
                # 방문일
                try:
                    date_el = item.find_element(By.CSS_SELECTOR, '.pui__gfuUIT time')
                    raw_date = date_el.text.strip()
                    review['visit_date_raw'] = raw_date
                    review['visit_date'] = parse_date(raw_date)
                except:
                    review['visit_date_raw'] = ''
                    review['visit_date'] = ''
                
                # 기간 필터 적용
                if not is_date_in_range(review['visit_date'], start_date, end_date):
                    continue
                
                # 방문 정보
                try:
                    info_els = item.find_elements(By.CSS_SELECTOR, '.pui__gfuUIT')
                    review['visit_info'] = [el.text.strip() for el in info_els if el.text.strip()]
                except:
                    review['visit_info'] = []
                
                # 이미지
                try:
                    img_els = item.find_elements(By.CSS_SELECTOR, '.K0PDV')
                    images = []
                    for img_el in img_els:
                        src = img_el.get_attribute('src')
                        if src and 'pstatic.net' in src:
                            images.append(src)
                    review['images'] = images[:5]
                except:
                    review['images'] = []
                
                # 부정적 리뷰 판단
                review['is_negative'] = is_negative_review(review)
                
                review['id'] = generate_review_id(review)
                
                if review['author'] or review['content']:
                    reviews.append(review)
                    
            except Exception as e:
                continue
        
    except Exception as e:
        print("[ERROR] 방문자 리뷰 파싱 실패: " + str(e), flush=True)
    
    return reviews


# ============================================
# 블로그 리뷰 파싱
# ============================================

def parse_blog_reviews(driver, start_date=None, end_date=None):
    """블로그 리뷰 파싱"""
    reviews = []
    
    try:
        review_items = driver.find_elements(By.CSS_SELECTOR, 'li.pui__X35jYm')
        print("[PARSE] 블로그 리뷰 " + str(len(review_items)) + "개 발견", flush=True)
        
        for item in review_items:
            try:
                review = {'type': 'blog'}
                
                # 블로그 링크
                try:
                    link_el = item.find_element(By.CSS_SELECTOR, 'a.pui__xtsQN-')
                    review['blog_url'] = link_el.get_attribute('href') or ''
                except:
                    review['blog_url'] = ''
                
                # 작성자명
                try:
                    review['author'] = item.find_element(By.CSS_SELECTOR, '.pui__NMi-Dp').text.strip()
                except:
                    review['author'] = ''
                
                # 블로그명
                try:
                    review['blog_name'] = item.find_element(By.CSS_SELECTOR, '.pui__jbWjjD').text.strip()
                except:
                    review['blog_name'] = ''
                
                # 블로그 글 제목
                try:
                    review['title'] = item.find_element(By.CSS_SELECTOR, '.pui__vn15t2').text.strip()
                except:
                    review['title'] = ''
                
                # 리뷰 내용
                try:
                    review['content'] = item.find_element(By.CSS_SELECTOR, '.pui__vn15t2').text.strip()
                except:
                    review['content'] = ''
                
                # 작성일
                try:
                    date_el = item.find_element(By.CSS_SELECTOR, '.pui__gfuUIT time')
                    raw_date = date_el.text.strip()
                    review['write_date_raw'] = raw_date
                    review['write_date'] = parse_date(raw_date)
                except:
                    review['write_date_raw'] = ''
                    review['write_date'] = ''
                
                # 기간 필터 적용
                if not is_date_in_range(review['write_date'], start_date, end_date):
                    continue
                
                # 이미지
                try:
                    img_els = item.find_elements(By.CSS_SELECTOR, '.K0PDV')
                    images = []
                    for img_el in img_els:
                        src = img_el.get_attribute('src')
                        if src and 'pstatic.net' in src:
                            images.append(src)
                    review['images'] = images[:5]
                except:
                    review['images'] = []
                
                # 부정적 리뷰 판단
                review['is_negative'] = is_negative_review(review)
                
                review['id'] = generate_review_id(review)
                
                if review['author'] or review['content'] or review['title']:
                    reviews.append(review)
                    
            except Exception as e:
                continue
        
    except Exception as e:
        print("[ERROR] 블로그 리뷰 파싱 실패: " + str(e), flush=True)
    
    return reviews


# ============================================
# 지점별 리뷰 수집
# ============================================

def crawl_store_reviews(driver, store_name, place_id, start_date=None, end_date=None, max_clicks=200):
    """특정 지점의 방문자 + 블로그 리뷰 수집"""
    print("\n" + "=" * 50, flush=True)
    print("[CRAWL] " + store_name + " (ID: " + place_id + ")", flush=True)
    if start_date:
        print("[CRAWL] 수집 기간: " + start_date + " ~ " + (end_date or "현재"), flush=True)
    print("=" * 50, flush=True)
    
    store_data = {
        'store_name': store_name,
        'place_id': place_id,
        'visitor_reviews': [],
        'blog_reviews': [],
        'visitor_count': 0,
        'blog_count': 0,
        'negative_count': 0,
        'crawled_at': datetime.now().isoformat()
    }
    
    # 1. 방문자 리뷰 수집
    visitor_url = "https://m.place.naver.com/restaurant/" + place_id + "/review/visitor?reviewSort=recent"
    print("[CRAWL] 방문자 리뷰 URL: " + visitor_url, flush=True)
    
    try:
        driver.get(visitor_url)
        time.sleep(3)
        
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'li.pui__X35jYm'))
            )
            print("[CRAWL] 방문자 리뷰 페이지 로딩 완료", flush=True)
        except TimeoutException:
            print("[WARN] 방문자 리뷰 로딩 타임아웃 - 리뷰가 없을 수 있음", flush=True)
        
        # 펼쳐서 더보기 클릭 (기간 체크하며)
        click_more_button_with_date_check(driver, start_date, max_clicks)
        
        visitor_reviews = parse_visitor_reviews(driver, start_date, end_date)
        store_data['visitor_reviews'] = visitor_reviews
        store_data['visitor_count'] = len(visitor_reviews)
        print("[CRAWL] 방문자 리뷰 " + str(store_data['visitor_count']) + "개 수집", flush=True)
        
    except Exception as e:
        print("[ERROR] 방문자 리뷰 수집 실패: " + str(e), flush=True)
    
    time.sleep(2)
    
    # 2. 블로그 리뷰 수집
    blog_url = "https://m.place.naver.com/restaurant/" + place_id + "/review/ugc?reviewSort=recent"
    print("[CRAWL] 블로그 리뷰 URL: " + blog_url, flush=True)
    
    try:
        driver.get(blog_url)
        time.sleep(3)
        
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'li.pui__X35jYm'))
            )
            print("[CRAWL] 블로그 리뷰 페이지 로딩 완료", flush=True)
        except TimeoutException:
            print("[WARN] 블로그 리뷰 로딩 타임아웃 - 리뷰가 없을 수 있음", flush=True)
        
        # 펼쳐서 더보기 클릭 (기간 체크하며)
        click_more_button_with_date_check(driver, start_date, max_clicks)
        
        blog_reviews = parse_blog_reviews(driver, start_date, end_date)
        store_data['blog_reviews'] = blog_reviews
        store_data['blog_count'] = len(blog_reviews)
        print("[CRAWL] 블로그 리뷰 " + str(store_data['blog_count']) + "개 수집", flush=True)
        
    except Exception as e:
        print("[ERROR] 블로그 리뷰 수집 실패: " + str(e), flush=True)
    
    # 부정적 리뷰 수 계산
    negative_count = 0
    for r in store_data['visitor_reviews']:
        if r.get('is_negative'):
            negative_count += 1
    for r in store_data['blog_reviews']:
        if r.get('is_negative'):
            negative_count += 1
    store_data['negative_count'] = negative_count
    
    print("[RESULT] " + store_name + ": 방문자 " + str(store_data['visitor_count']) + "개 + 블로그 " + str(store_data['blog_count']) + "개 (부정 " + str(negative_count) + "개)", flush=True)
    
    return store_data


# ============================================
# 데이터 병합
# ============================================

def merge_reviews(existing_reviews, new_reviews):
    """기존 리뷰와 새 리뷰 병합 (중복 제거)"""
    existing_ids = set()
    for r in existing_reviews:
        if r.get('id'):
            existing_ids.add(r.get('id'))
    
    merged = list(existing_reviews)
    added = 0
    
    for review in new_reviews:
        review_id = review.get('id')
        if review_id and review_id not in existing_ids:
            merged.append(review)
            existing_ids.add(review_id)
            added += 1
    
    # 날짜순 정렬 (최신순)
    def get_date(r):
        return r.get('visit_date') or r.get('write_date') or ''
    
    merged.sort(key=get_date, reverse=True)
    
    return merged, added


def calculate_review_stats(stores):
    """리뷰 통계 계산 (전날/전주/전월 대비)"""
    today = datetime.now().date()
    yesterday = today - timedelta(days=1)
    week_ago = today - timedelta(days=7)
    two_weeks_ago = today - timedelta(days=14)
    month_ago = today - timedelta(days=30)
    two_months_ago = today - timedelta(days=60)
    
    stats = {
        'today': 0,
        'yesterday': 0,
        'this_week': 0,
        'last_week': 0,
        'this_month': 0,
        'last_month': 0,
        'total_negative': 0
    }
    
    for store in stores:
        all_reviews = store.get('visitor_reviews', []) + store.get('blog_reviews', [])
        
        for review in all_reviews:
            date_str = review.get('visit_date') or review.get('write_date')
            if not date_str:
                continue
            
            try:
                review_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            except:
                continue
            
            # 오늘
            if review_date == today:
                stats['today'] += 1
            
            # 어제
            if review_date == yesterday:
                stats['yesterday'] += 1
            
            # 이번 주 (최근 7일)
            if review_date >= week_ago:
                stats['this_week'] += 1
            
            # 지난 주 (7~14일 전)
            if week_ago > review_date >= two_weeks_ago:
                stats['last_week'] += 1
            
            # 이번 달 (최근 30일)
            if review_date >= month_ago:
                stats['this_month'] += 1
            
            # 지난 달 (30~60일 전)
            if month_ago > review_date >= two_months_ago:
                stats['last_month'] += 1
            
            # 부정적 리뷰
            if review.get('is_negative'):
                stats['total_negative'] += 1
    
    # 증감율 계산
    def calc_change(current, previous):
        if previous == 0:
            return 100 if current > 0 else 0
        return round((current - previous) / previous * 100, 1)
    
    stats['daily_change'] = calc_change(stats['today'], stats['yesterday'])
    stats['weekly_change'] = calc_change(stats['this_week'], stats['last_week'])
    stats['monthly_change'] = calc_change(stats['this_month'], stats['last_month'])
    
    return stats


def load_existing_data(file_path):
    """기존 데이터 로드"""
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print("[WARN] 기존 데이터 로드 실패: " + str(e), flush=True)
    return None


def save_data(data, file_path):
    """데이터 저장"""
    dir_path = os.path.dirname(file_path)
    if dir_path:
        os.makedirs(dir_path, exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("[SAVE] " + file_path, flush=True)


# ============================================
# 메인
# ============================================

def main():
    parser = argparse.ArgumentParser(description='네이버 플레이스 리뷰 크롤러')
    parser.add_argument('--start-date', type=str, help='시작일 (YYYY-MM-DD)')
    parser.add_argument('--end-date', type=str, help='종료일 (YYYY-MM-DD)')
    parser.add_argument('--max-clicks', type=int, default=200, help='펼쳐서 더보기 최대 클릭 수')
    parser.add_argument('--store', type=str, help='특정 지점만 수집')
    args = parser.parse_args()
    
    print("\n시작: " + str(datetime.now()), flush=True)
    print("수집 대상: " + str(len(STORE_PLACES)) + "개 지점", flush=True)
    
    if args.start_date:
        print("시작일: " + args.start_date, flush=True)
    if args.end_date:
        print("종료일: " + args.end_date, flush=True)
    print("최대 클릭 수: " + str(args.max_clicks), flush=True)
    
    # 기존 데이터 로드
    existing_data = load_existing_data('docs/review_data.json')
    if existing_data:
        print("[INFO] 기존 데이터 발견 - 병합 모드", flush=True)
    else:
        print("[INFO] 기존 데이터 없음 - 신규 수집", flush=True)
    
    result = {
        'generated_at': datetime.now().isoformat(),
        'platform': 'naver',
        'stores': [],
        'summary': {
            'total_stores': 0,
            'total_visitor_reviews': 0,
            'total_blog_reviews': 0,
            'total_reviews': 0,
            'total_negative': 0,
            'new_visitor_reviews': 0,
            'new_blog_reviews': 0
        },
        'stats': {}
    }
    
    driver = None
    
    try:
        driver = setup_driver()
        
        # 수집할 지점 필터링
        stores_to_crawl = STORE_PLACES
        if args.store:
            if args.store in STORE_PLACES:
                stores_to_crawl = {args.store: STORE_PLACES[args.store]}
            else:
                print("[ERROR] 지점을 찾을 수 없음: " + args.store, flush=True)
                sys.exit(1)
        
        for store_name, place_id in stores_to_crawl.items():
            store_data = crawl_store_reviews(
                driver, 
                store_name, 
                place_id, 
                start_date=args.start_date,
                end_date=args.end_date,
                max_clicks=args.max_clicks
            )
            
            # 기존 데이터와 병합
            if existing_data:
                existing_store = None
                for s in existing_data.get('stores', []):
                    if s['store_name'] == store_name:
                        existing_store = s
                        break
                
                if existing_store:
                    # 방문자 리뷰 병합
                    merged_visitor, added_visitor = merge_reviews(
                        existing_store.get('visitor_reviews', []),
                        store_data['visitor_reviews']
                    )
                    store_data['visitor_reviews'] = merged_visitor
                    store_data['visitor_count'] = len(merged_visitor)
                    result['summary']['new_visitor_reviews'] += added_visitor
                    print("[MERGE] " + store_name + " 방문자: 기존 " + str(len(existing_store.get('visitor_reviews', []))) + " + 신규 " + str(added_visitor) + " = 총 " + str(store_data['visitor_count']), flush=True)
                    
                    # 블로그 리뷰 병합
                    merged_blog, added_blog = merge_reviews(
                        existing_store.get('blog_reviews', []),
                        store_data['blog_reviews']
                    )
                    store_data['blog_reviews'] = merged_blog
                    store_data['blog_count'] = len(merged_blog)
                    result['summary']['new_blog_reviews'] += added_blog
                    print("[MERGE] " + store_name + " 블로그: 기존 " + str(len(existing_store.get('blog_reviews', []))) + " + 신규 " + str(added_blog) + " = 총 " + str(store_data['blog_count']), flush=True)
                    
                    # 부정적 리뷰 재계산
                    negative_count = 0
                    for r in store_data['visitor_reviews']:
                        if r.get('is_negative'):
                            negative_count += 1
                    for r in store_data['blog_reviews']:
                        if r.get('is_negative'):
                            negative_count += 1
                    store_data['negative_count'] = negative_count
            
            result['stores'].append(store_data)
            result['summary']['total_visitor_reviews'] += store_data['visitor_count']
            result['summary']['total_blog_reviews'] += store_data['blog_count']
            result['summary']['total_negative'] += store_data.get('negative_count', 0)
            
            # 지점 간 대기
            time.sleep(3)
        
        result['summary']['total_stores'] = len(result['stores'])
        result['summary']['total_reviews'] = (
            result['summary']['total_visitor_reviews'] + 
            result['summary']['total_blog_reviews']
        )
        
        # 통계 계산
        result['stats'] = calculate_review_stats(result['stores'])
        
        # 저장
        os.makedirs('docs', exist_ok=True)
        os.makedirs('output', exist_ok=True)
        
        save_data(result, 'docs/review_data.json')
        save_data(result, 'output/review_data.json')
        
        print("\n" + "=" * 60, flush=True)
        print("수집 완료!", flush=True)
        print("=" * 60, flush=True)
        print("  지점: " + str(result['summary']['total_stores']) + "개", flush=True)
        print("  방문자 리뷰: " + str(result['summary']['total_visitor_reviews']) + "개", flush=True)
        print("  블로그 리뷰: " + str(result['summary']['total_blog_reviews']) + "개", flush=True)
        print("  총 리뷰: " + str(result['summary']['total_reviews']) + "개", flush=True)
        print("  부정적 리뷰: " + str(result['summary']['total_negative']) + "개", flush=True)
        if existing_data:
            print("  신규 방문자: +" + str(result['summary']['new_visitor_reviews']) + "개", flush=True)
            print("  신규 블로그: +" + str(result['summary']['new_blog_reviews']) + "개", flush=True)
        print("=" * 60, flush=True)
        
    except Exception as e:
        print("\n[ERROR] 크롤링 실패: " + str(e), flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
        
    finally:
        if driver:
            driver.quit()
            print("[CLEANUP] 브라우저 종료", flush=True)


if __name__ == "__main__":
    main()
