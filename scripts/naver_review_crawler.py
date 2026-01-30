#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
네이버 플레이스 리뷰 크롤러 v3
- 타임아웃 재시도 로직 추가
- 파싱 전 스크롤 초기화
- 더 안정적인 요소 대기
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
print("네이버 플레이스 리뷰 크롤러 v3", flush=True)
print("=" * 60, flush=True)

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from selenium.common.exceptions import TimeoutException, NoSuchElementException, ElementClickInterceptedException, StaleElementReferenceException
    print("[INFO] Selenium 로드 완료", flush=True)
except ImportError as e:
    print(f"[ERROR] Selenium 필요: {e}", flush=True)
    sys.exit(1)

try:
    from webdriver_manager.chrome import ChromeDriverManager
    print("[INFO] WebDriver Manager 로드 완료", flush=True)
except ImportError as e:
    print(f"[ERROR] WebDriver Manager 필요: {e}", flush=True)
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
    "기대 이하", "평범", "보통", "애매"
]


def setup_driver():
    print("[SETUP] Chrome 드라이버 설정 중...", flush=True)
    
    options = Options()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_argument('--disable-web-security')
    options.add_argument('--allow-running-insecure-content')
    options.add_argument(
        '--user-agent=Mozilla/5.0 (Linux; Android 10; SM-G975F) '
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    )
    
    try:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
        driver.set_page_load_timeout(30)
        print("[SETUP] Chrome 드라이버 설정 완료", flush=True)
        return driver
    except Exception as e:
        print(f"[ERROR] Chrome 드라이버 설정 실패: {e}", flush=True)
        raise


def parse_date(date_str):
    """날짜 문자열 파싱"""
    if not date_str:
        return None
    
    parts = re.findall(r'\d+', date_str)
    
    if len(parts) >= 3:
        year = int(parts[0])
        if year < 100:
            year += 2000
        month = int(parts[1])
        day = int(parts[2])
        return f"{year:04d}-{month:02d}-{day:02d}"
    elif len(parts) >= 2:
        current_year = datetime.now().year
        month = int(parts[0])
        day = int(parts[1])
        return f"{current_year:04d}-{month:02d}-{day:02d}"
    
    return None


def wait_for_page_load(driver, timeout=15):
    """페이지 완전 로딩 대기"""
    try:
        WebDriverWait(driver, timeout).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
        time.sleep(2)  # 추가 대기
        return True
    except:
        return False


def scroll_to_top(driver):
    """페이지 맨 위로 스크롤"""
    driver.execute_script("window.scrollTo(0, 0);")
    time.sleep(0.5)


def scroll_to_bottom(driver):
    """페이지 맨 아래로 스크롤"""
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(1)


def load_all_reviews(driver, max_clicks=200):
    """더보기 버튼 클릭하여 모든 리뷰 로드"""
    click_count = 0
    no_button_count = 0
    
    while click_count < max_clicks:
        try:
            # 더보기 버튼 찾기 (여러 셀렉터 시도)
            more_button = None
            selectors = [
                'a.fvwqf',
                'a[class*="fvwqf"]',
                'button[class*="more"]',
                'a[data-pui-click-code="rvshowmore"]'
            ]
            
            for sel in selectors:
                try:
                    buttons = driver.find_elements(By.CSS_SELECTOR, sel)
                    for btn in buttons:
                        if btn.is_displayed() and btn.is_enabled():
                            more_button = btn
                            break
                    if more_button:
                        break
                except:
                    continue
            
            if not more_button:
                no_button_count += 1
                if no_button_count >= 3:
                    print(f"[MORE] 더보기 버튼 없음 - 완료", flush=True)
                    break
                scroll_to_bottom(driver)
                time.sleep(1)
                continue
            
            no_button_count = 0
            
            # 버튼 클릭
            try:
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", more_button)
                time.sleep(0.3)
                driver.execute_script("arguments[0].click();", more_button)
                click_count += 1
                
                if click_count % 10 == 0:
                    print(f"[MORE] 클릭 {click_count}회", flush=True)
                
                time.sleep(1.0)
                
            except StaleElementReferenceException:
                time.sleep(0.5)
                continue
            except ElementClickInterceptedException:
                scroll_to_bottom(driver)
                time.sleep(0.5)
                continue
                
        except Exception as e:
            print(f"[MORE] 오류: {e}", flush=True)
            break
    
    print(f"[MORE] 총 {click_count}회 클릭", flush=True)
    return click_count


def get_all_images(item):
    """리뷰 아이템에서 모든 이미지 URL 수집"""
    images = []
    
    try:
        img_selectors = [
            'img.K0PDV',
            'img[class*="K0PDV"]',
            '.place_thumb img',
            '.HH5sZ img',
            '.MKLdN img',
            'img[alt*="리뷰"]',
            'img[alt*="사진"]'
        ]
        
        for selector in img_selectors:
            try:
                img_elements = item.find_elements(By.CSS_SELECTOR, selector)
                for img in img_elements:
                    src = img.get_attribute('src')
                    if src and 'pstatic.net' in src and src not in images:
                        # 고화질 이미지 URL로 변환
                        if 'type=' in src:
                            src = re.sub(r'type=\w+', 'type=w1500_60_sharpen', src)
                        images.append(src)
            except:
                continue
    except Exception as e:
        pass
    
    return images


def is_date_in_range(date_str, start_date, end_date):
    """날짜가 범위 내인지 확인"""
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
    """부정적 리뷰 판별"""
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
    
    raw = f"{author}_{content}_{date}"
    return hashlib.md5(raw.encode()).hexdigest()[:16]


def find_elements_safe(driver, selectors, context=None):
    """안전하게 요소 찾기 (여러 셀렉터 시도)"""
    target = context if context else driver
    
    for selector in selectors:
        try:
            elements = target.find_elements(By.CSS_SELECTOR, selector)
            if elements:
                return elements, selector
        except:
            continue
    
    return [], None


def parse_visitor_reviews(driver, start_date=None, end_date=None):
    """방문자 리뷰 파싱"""
    reviews = []
    
    try:
        # 스크롤을 맨 위로 이동
        scroll_to_top(driver)
        time.sleep(1)
        
        # 리뷰 아이템 찾기
        selectors = [
            'li.place_apply_pui.EjjAW',
            'li.EjjAW',
            'li[class*="EjjAW"]',
            'li.pui__X35jYm'
        ]
        
        review_items, used_selector = find_elements_safe(driver, selectors)
        
        if not review_items:
            # 재시도: 페이지 새로고침 없이 잠시 대기 후 다시 시도
            print("[PARSE] 리뷰 요소 찾기 재시도...", flush=True)
            time.sleep(3)
            review_items, used_selector = find_elements_safe(driver, selectors)
        
        if not review_items:
            print("[PARSE] 방문자 리뷰 요소를 찾을 수 없음", flush=True)
            return reviews
        
        print(f"[PARSE] 셀렉터 '{used_selector}'로 {len(review_items)}개 발견", flush=True)
        print(f"[PARSE] 방문자 리뷰 {len(review_items)}개 파싱 중...", flush=True)
        
        for idx, item in enumerate(review_items):
            try:
                review = {'type': 'visitor'}
                
                # 작성자명
                try:
                    author_els, _ = find_elements_safe(item, ['.pui__NMi-Dp', '[class*="NMi-Dp"]'])
                    review['author'] = author_els[0].text.strip() if author_els else ''
                except:
                    review['author'] = ''
                
                # 리뷰 내용
                try:
                    content_els, _ = find_elements_safe(item, ['.pui__vn15t2', '[class*="vn15t2"]'])
                    review['content'] = content_els[0].text.strip() if content_els else ''
                except:
                    review['content'] = ''
                
                # 방문 키워드
                try:
                    keyword_els = item.find_elements(By.CSS_SELECTOR, '.pui__V8F9nN em, [class*="V8F9nN"] em')
                    keywords = []
                    for el in keyword_els:
                        text = el.text.strip()
                        if text and text not in keywords:
                            keywords.append(text)
                    review['keywords'] = keywords
                except:
                    review['keywords'] = []
                
                # 태그
                try:
                    tag_els = item.find_elements(By.CSS_SELECTOR, '.pui__jhpEyP, [class*="jhpEyP"]')
                    tags = []
                    for el in tag_els:
                        text = el.text.strip()
                        if text and not text.startswith('+') and text not in tags:
                            tags.append(text)
                    review['tags'] = tags
                except:
                    review['tags'] = []
                
                # 방문일
                try:
                    date_els = item.find_elements(By.CSS_SELECTOR, '.pui__gfuUIT time, .pui__QKE5Pr time, time')
                    raw_date = date_els[0].text.strip() if date_els else ''
                    review['visit_date_raw'] = raw_date
                    review['visit_date'] = parse_date(raw_date)
                except:
                    review['visit_date_raw'] = ''
                    review['visit_date'] = ''
                
                # 날짜 범위 체크
                if not is_date_in_range(review['visit_date'], start_date, end_date):
                    continue
                
                # 방문 정보
                try:
                    info_els = item.find_elements(By.CSS_SELECTOR, '.pui__gfuUIT, [class*="gfuUIT"]')
                    visit_info = []
                    for el in info_els:
                        text = el.text.strip()
                        if text and text not in visit_info:
                            visit_info.append(text)
                    review['visit_info'] = visit_info[:5]
                except:
                    review['visit_info'] = []
                
                # 이미지
                review['images'] = get_all_images(item)
                
                # 부정적 리뷰 판별
                review['is_negative'] = is_negative_review(review)
                
                # 고유 ID 생성
                review['id'] = generate_review_id(review)
                
                # 유효한 리뷰만 추가
                if review['author'] or review['content']:
                    reviews.append(review)
                    
            except StaleElementReferenceException:
                continue
            except Exception as e:
                continue
        
    except Exception as e:
        print(f"[ERROR] 방문자 리뷰 파싱 실패: {e}", flush=True)
    
    print(f"[PARSE] 방문자 리뷰 {len(reviews)}개 파싱 완료", flush=True)
    return reviews


def parse_blog_reviews(driver, start_date=None, end_date=None):
    """블로그 리뷰 파싱"""
    reviews = []
    
    try:
        # 스크롤을 맨 위로 이동
        scroll_to_top(driver)
        time.sleep(1)
        
        # 리뷰 아이템 찾기
        selectors = [
            'li.EblIP',
            'li[class*="EblIP"]',
            'li.pui__X35jYm'
        ]
        
        review_items, used_selector = find_elements_safe(driver, selectors)
        
        if not review_items:
            print("[PARSE] 리뷰 요소 찾기 재시도...", flush=True)
            time.sleep(3)
            review_items, used_selector = find_elements_safe(driver, selectors)
        
        if not review_items:
            print("[PARSE] 블로그 리뷰 요소를 찾을 수 없음", flush=True)
            return reviews
        
        print(f"[PARSE] 셀렉터 '{used_selector}'로 {len(review_items)}개 발견", flush=True)
        print(f"[PARSE] 블로그 리뷰 {len(review_items)}개 파싱 중...", flush=True)
        
        for idx, item in enumerate(review_items):
            try:
                review = {'type': 'blog'}
                
                # 블로그 URL
                try:
                    link_els = item.find_elements(By.CSS_SELECTOR, 'a.behIY, a[class*="behIY"], a[href*="blog.naver.com"]')
                    review['blog_url'] = link_els[0].get_attribute('href') if link_els else ''
                except:
                    review['blog_url'] = ''
                
                # 작성자명
                try:
                    author_els, _ = find_elements_safe(item, ['.pui__NMi-Dp', '[class*="NMi-Dp"]'])
                    review['author'] = author_els[0].text.strip() if author_els else ''
                except:
                    review['author'] = ''
                
                # 블로그명
                try:
                    blog_name_els = item.find_elements(By.CSS_SELECTOR, '.XR_ao, [class*="XR_ao"]')
                    review['blog_name'] = blog_name_els[0].text.strip() if blog_name_els else ''
                except:
                    review['blog_name'] = ''
                
                # 제목
                try:
                    title_els = item.find_elements(By.CSS_SELECTOR, '.pui__dGLDWy, [class*="dGLDWy"]')
                    review['title'] = title_els[0].text.strip() if title_els else ''
                except:
                    review['title'] = ''
                
                # 내용
                try:
                    content_els = item.find_elements(By.CSS_SELECTOR, '.pui__vn15t2, [class*="vn15t2"]')
                    review['content'] = content_els[0].text.strip() if content_els else ''
                except:
                    review['content'] = ''
                
                # 작성일
                try:
                    date_els = item.find_elements(By.CSS_SELECTOR, '.u5XwJ time, .X9yBv time, time')
                    raw_date = date_els[0].text.strip() if date_els else ''
                    review['write_date_raw'] = raw_date
                    review['write_date'] = parse_date(raw_date)
                except:
                    review['write_date_raw'] = ''
                    review['write_date'] = ''
                
                # 날짜 범위 체크
                if not is_date_in_range(review['write_date'], start_date, end_date):
                    continue
                
                # 이미지
                review['images'] = get_all_images(item)
                
                # 부정적 리뷰 판별
                review['is_negative'] = is_negative_review(review)
                
                # 고유 ID 생성
                review['id'] = generate_review_id(review)
                
                # 유효한 리뷰만 추가
                if review['author'] or review['content'] or review['title']:
                    reviews.append(review)
                    
            except StaleElementReferenceException:
                continue
            except Exception as e:
                continue
        
    except Exception as e:
        print(f"[ERROR] 블로그 리뷰 파싱 실패: {e}", flush=True)
    
    print(f"[PARSE] 블로그 리뷰 {len(reviews)}개 파싱 완료", flush=True)
    return reviews


def crawl_with_retry(driver, url, parse_func, start_date, end_date, max_clicks, max_retries=3):
    """재시도 로직이 포함된 크롤링"""
    
    for attempt in range(max_retries):
        try:
            print(f"[CRAWL] 시도 {attempt + 1}/{max_retries}: {url}", flush=True)
            
            driver.get(url)
            
            # 페이지 로딩 대기
            if not wait_for_page_load(driver, timeout=20):
                print("[WARN] 페이지 로딩 타임아웃, 재시도...", flush=True)
                continue
            
            # 리뷰 요소 대기 (더 긴 시간)
            try:
                WebDriverWait(driver, 15).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, 
                        'li[class*="EjjAW"], li[class*="EblIP"], li.pui__X35jYm'))
                )
                print("[CRAWL] 리뷰 요소 로드 완료", flush=True)
            except TimeoutException:
                print("[WARN] 리뷰 요소 로딩 타임아웃", flush=True)
                # 타임아웃이어도 일단 진행
            
            time.sleep(2)
            
            # 더보기 클릭
            load_all_reviews(driver, max_clicks)
            
            # 파싱 전 대기
            time.sleep(2)
            
            # 파싱
            reviews = parse_func(driver, start_date, end_date)
            
            if reviews:
                return reviews
            elif attempt < max_retries - 1:
                print(f"[WARN] 리뷰 0개, 재시도...", flush=True)
                time.sleep(5)  # 재시도 전 대기
            
        except Exception as e:
            print(f"[ERROR] 크롤링 오류: {e}", flush=True)
            if attempt < max_retries - 1:
                time.sleep(5)
    
    return []


def crawl_store_reviews(driver, store_name, place_id, start_date=None, end_date=None, max_clicks=200):
    """지점 리뷰 크롤링"""
    print("\n" + "=" * 50, flush=True)
    print(f"[CRAWL] {store_name} (ID: {place_id})", flush=True)
    if start_date:
        print(f"[CRAWL] 수집 기간: {start_date} ~ {end_date or '현재'}", flush=True)
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
    
    # 방문자 리뷰 (재시도 포함)
    visitor_url = f"https://m.place.naver.com/restaurant/{place_id}/review/visitor?reviewSort=recent"
    visitor_reviews = crawl_with_retry(
        driver, visitor_url, parse_visitor_reviews, 
        start_date, end_date, max_clicks, max_retries=2
    )
    store_data['visitor_reviews'] = visitor_reviews
    store_data['visitor_count'] = len(visitor_reviews)
    print(f"[CRAWL] 방문자 리뷰 {store_data['visitor_count']}개 수집", flush=True)
    
    time.sleep(3)
    
    # 블로그 리뷰 (재시도 포함)
    blog_url = f"https://m.place.naver.com/restaurant/{place_id}/review/ugc?reviewSort=recent"
    blog_reviews = crawl_with_retry(
        driver, blog_url, parse_blog_reviews,
        start_date, end_date, max_clicks, max_retries=2
    )
    store_data['blog_reviews'] = blog_reviews
    store_data['blog_count'] = len(blog_reviews)
    print(f"[CRAWL] 블로그 리뷰 {store_data['blog_count']}개 수집", flush=True)
    
    # 부정적 리뷰 수
    negative_count = sum(1 for r in store_data['visitor_reviews'] if r.get('is_negative'))
    negative_count += sum(1 for r in store_data['blog_reviews'] if r.get('is_negative'))
    store_data['negative_count'] = negative_count
    
    total = store_data['visitor_count'] + store_data['blog_count']
    print(f"[RESULT] {store_name}: 총 {total}개 (부정 {negative_count}개)", flush=True)
    
    return store_data


def merge_reviews(existing_reviews, new_reviews):
    """기존 리뷰와 새 리뷰 병합"""
    existing_ids = {r.get('id') for r in existing_reviews if r.get('id')}
    
    merged = list(existing_reviews)
    added = 0
    
    for review in new_reviews:
        review_id = review.get('id')
        if review_id and review_id not in existing_ids:
            merged.append(review)
            existing_ids.add(review_id)
            added += 1
    
    merged.sort(key=lambda r: r.get('visit_date') or r.get('write_date') or '', reverse=True)
    
    return merged, added


def calculate_review_stats(stores):
    """리뷰 통계 계산"""
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
            
            if review_date == today:
                stats['today'] += 1
            if review_date == yesterday:
                stats['yesterday'] += 1
            if review_date >= week_ago:
                stats['this_week'] += 1
            if week_ago > review_date >= two_weeks_ago:
                stats['last_week'] += 1
            if review_date >= month_ago:
                stats['this_month'] += 1
            if month_ago > review_date >= two_months_ago:
                stats['last_month'] += 1
            if review.get('is_negative'):
                stats['total_negative'] += 1
    
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
            print(f"[WARN] 기존 데이터 로드 실패: {e}", flush=True)
    return None


def save_data(data, file_path):
    """데이터 저장"""
    dir_path = os.path.dirname(file_path)
    if dir_path:
        os.makedirs(dir_path, exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[SAVE] {file_path}", flush=True)


def main():
    parser = argparse.ArgumentParser(description='네이버 플레이스 리뷰 크롤러')
    parser.add_argument('--days', type=int, default=0, help='수집 기간 (일) - 0이면 전체')
    parser.add_argument('--max-clicks', type=int, default=200, help='펼쳐서 더보기 최대 클릭 수')
    parser.add_argument('--store', type=str, help='특정 지점만 수집')
    args = parser.parse_args()
    
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = None
    
    if args.days > 0:
        start_date = (datetime.now() - timedelta(days=args.days)).strftime('%Y-%m-%d')
    
    print(f"\n시작: {datetime.now()}", flush=True)
    print(f"수집 대상: {len(STORE_PLACES)}개 지점", flush=True)
    
    if start_date:
        print(f"수집 기간: {start_date} ~ {end_date} (최근 {args.days}일)", flush=True)
    else:
        print("수집 기간: 전체", flush=True)
    
    print(f"최대 클릭 수: {args.max_clicks}", flush=True)
    
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
        
        stores_to_crawl = STORE_PLACES
        if args.store:
            if args.store in STORE_PLACES:
                stores_to_crawl = {args.store: STORE_PLACES[args.store]}
            else:
                print(f"[ERROR] 지점 없음: {args.store}", flush=True)
                sys.exit(1)
        
        for store_name, place_id in stores_to_crawl.items():
            store_data = crawl_store_reviews(
                driver, 
                store_name, 
                place_id, 
                start_date=start_date,
                end_date=end_date,
                max_clicks=args.max_clicks
            )
            
            # 기존 데이터와 병합
            if existing_data:
                existing_store = next(
                    (s for s in existing_data.get('stores', []) if s['store_name'] == store_name),
                    None
                )
                
                if existing_store:
                    merged_visitor, added_visitor = merge_reviews(
                        existing_store.get('visitor_reviews', []),
                        store_data['visitor_reviews']
                    )
                    store_data['visitor_reviews'] = merged_visitor
                    store_data['visitor_count'] = len(merged_visitor)
                    result['summary']['new_visitor_reviews'] += added_visitor
                    
                    merged_blog, added_blog = merge_reviews(
                        existing_store.get('blog_reviews', []),
                        store_data['blog_reviews']
                    )
                    store_data['blog_reviews'] = merged_blog
                    store_data['blog_count'] = len(merged_blog)
                    result['summary']['new_blog_reviews'] += added_blog
                    
                    store_data['negative_count'] = sum(
                        1 for r in store_data['visitor_reviews'] + store_data['blog_reviews']
                        if r.get('is_negative')
                    )
                    
                    print(f"[MERGE] {store_name}: +{added_visitor} 방문자, +{added_blog} 블로그", flush=True)
            
            result['stores'].append(store_data)
            result['summary']['total_visitor_reviews'] += store_data['visitor_count']
            result['summary']['total_blog_reviews'] += store_data['blog_count']
            result['summary']['total_negative'] += store_data.get('negative_count', 0)
            
            # 지점 간 대기 (봇 감지 회피)
            time.sleep(5)
        
        result['summary']['total_stores'] = len(result['stores'])
        result['summary']['total_reviews'] = (
            result['summary']['total_visitor_reviews'] + 
            result['summary']['total_blog_reviews']
        )
        
        result['stats'] = calculate_review_stats(result['stores'])
        
        os.makedirs('docs', exist_ok=True)
        os.makedirs('output', exist_ok=True)
        
        save_data(result, 'docs/review_data.json')
        save_data(result, 'output/review_data.json')
        
        print("\n" + "=" * 60, flush=True)
        print("수집 완료!", flush=True)
        print("=" * 60, flush=True)
        print(f"  지점: {result['summary']['total_stores']}개", flush=True)
        print(f"  방문자: {result['summary']['total_visitor_reviews']}개", flush=True)
        print(f"  블로그: {result['summary']['total_blog_reviews']}개", flush=True)
        print(f"  총 리뷰: {result['summary']['total_reviews']}개", flush=True)
        print(f"  부정적: {result['summary']['total_negative']}개", flush=True)
        if existing_data:
            new_total = result['summary']['new_visitor_reviews'] + result['summary']['new_blog_reviews']
            print(f"  신규: +{new_total}개", flush=True)
        print("=" * 60, flush=True)
        
    except Exception as e:
        print(f"\n[ERROR] 크롤링 실패: {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
        
    finally:
        if driver:
            driver.quit()
            print("[CLEANUP] 브라우저 종료", flush=True)


if __name__ == "__main__":
    main()
