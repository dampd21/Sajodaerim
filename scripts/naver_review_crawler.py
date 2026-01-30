#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
네이버 플레이스 리뷰 크롤러 (2026년 1월 업데이트)
- 방문자 리뷰 + 블로그 리뷰 수집
- 변경된 HTML 구조 대응
- 모든 이미지 수집
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
print("네이버 플레이스 리뷰 크롤러 v2", flush=True)
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
    """날짜 문자열 파싱 (다양한 형식 지원)"""
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
        # "1.30.금" 형식 처리
        current_year = datetime.now().year
        month = int(parts[0])
        day = int(parts[1])
        return "{:04d}-{:02d}-{:02d}".format(current_year, month, day)
    
    return None


def scroll_and_load(driver, max_scrolls=50, wait_time=1.0):
    """스크롤하여 더 많은 리뷰 로드"""
    last_height = driver.execute_script("return document.body.scrollHeight")
    scroll_count = 0
    
    while scroll_count < max_scrolls:
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(wait_time)
        
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            break
        
        last_height = new_height
        scroll_count += 1
        
        if scroll_count % 10 == 0:
            print(f"[SCROLL] {scroll_count}회 스크롤", flush=True)
    
    return scroll_count


def click_more_buttons(driver, start_date=None, max_clicks=200):
    """더보기 버튼 클릭"""
    click_count = 0
    
    while click_count < max_clicks:
        try:
            # 다양한 더보기 버튼 셀렉터 시도
            more_selectors = [
                'a.fvwqf',
                'a[class*="fvwqf"]',
                'button[class*="more"]',
                '.pui__rvshowmore'
            ]
            
            more_button = None
            for selector in more_selectors:
                try:
                    more_button = driver.find_element(By.CSS_SELECTOR, selector)
                    if more_button.is_displayed():
                        break
                except:
                    continue
            
            if not more_button or not more_button.is_displayed():
                break
            
            driver.execute_script("arguments[0].click();", more_button)
            click_count += 1
            
            if click_count % 10 == 0:
                print(f"[MORE] 클릭 {click_count}회", flush=True)
            
            time.sleep(1.0)
            
        except NoSuchElementException:
            break
        except Exception as e:
            print(f"[MORE] 클릭 오류: {e}", flush=True)
            break
    
    print(f"[MORE] 총 {click_count}회 클릭", flush=True)
    return click_count


def get_all_images(item):
    """리뷰 아이템에서 모든 이미지 URL 수집"""
    images = []
    
    try:
        # 다양한 이미지 셀렉터 시도
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
        print(f"[WARN] 이미지 추출 오류: {e}", flush=True)
    
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
    
    raw = author + "_" + content + "_" + date
    return hashlib.md5(raw.encode()).hexdigest()[:16]


def parse_visitor_reviews(driver, start_date=None, end_date=None):
    """방문자 리뷰 파싱 (새로운 HTML 구조)"""
    reviews = []
    
    try:
        # 새로운 셀렉터: li.place_apply_pui.EjjAW 또는 li.EjjAW
        review_selectors = [
            'li.place_apply_pui.EjjAW',
            'li.EjjAW',
            'li[class*="EjjAW"]',
            'li.pui__X35jYm'  # 폴백용 기존 셀렉터
        ]
        
        review_items = []
        for selector in review_selectors:
            try:
                items = driver.find_elements(By.CSS_SELECTOR, selector)
                if items:
                    review_items = items
                    print(f"[PARSE] 셀렉터 '{selector}'로 {len(items)}개 발견", flush=True)
                    break
            except:
                continue
        
        if not review_items:
            print("[PARSE] 방문자 리뷰 요소를 찾을 수 없음", flush=True)
            return reviews
        
        print(f"[PARSE] 방문자 리뷰 {len(review_items)}개 파싱 중...", flush=True)
        
        for idx, item in enumerate(review_items):
            try:
                review = {'type': 'visitor'}
                
                # 작성자명
                try:
                    author_selectors = ['.pui__NMi-Dp', '.pui__uslU0d span', '[class*="NMi-Dp"]']
                    for sel in author_selectors:
                        try:
                            review['author'] = item.find_element(By.CSS_SELECTOR, sel).text.strip()
                            if review['author']:
                                break
                        except:
                            continue
                except:
                    review['author'] = ''
                
                # 리뷰 내용
                try:
                    content_selectors = ['.pui__vn15t2', '[class*="vn15t2"]', '.review_content']
                    for sel in content_selectors:
                        try:
                            review['content'] = item.find_element(By.CSS_SELECTOR, sel).text.strip()
                            if review['content']:
                                break
                        except:
                            continue
                except:
                    review['content'] = ''
                
                # 방문 키워드 (점심에 방문, 예약 없이 이용 등)
                try:
                    keyword_selectors = ['.pui__V8F9nN em', '.pui__uqSlGl em', '[class*="V8F9nN"] em']
                    keywords = []
                    for sel in keyword_selectors:
                        try:
                            els = item.find_elements(By.CSS_SELECTOR, sel)
                            for el in els:
                                text = el.text.strip()
                                if text and text not in keywords:
                                    keywords.append(text)
                        except:
                            continue
                    review['keywords'] = keywords
                except:
                    review['keywords'] = []
                
                # 태그 (음식이 맛있어요 등)
                try:
                    tag_selectors = ['.pui__jhpEyP', '[class*="jhpEyP"]', '.review_tag']
                    tags = []
                    for sel in tag_selectors:
                        try:
                            els = item.find_elements(By.CSS_SELECTOR, sel)
                            for el in els:
                                text = el.text.strip()
                                # +4 같은 더보기 버튼 제외
                                if text and not text.startswith('+') and text not in tags:
                                    tags.append(text)
                        except:
                            continue
                    review['tags'] = tags
                except:
                    review['tags'] = []
                
                # 방문일
                try:
                    date_selectors = ['.pui__gfuUIT time', '.pui__QKE5Pr time', 'time']
                    raw_date = ''
                    for sel in date_selectors:
                        try:
                            date_el = item.find_element(By.CSS_SELECTOR, sel)
                            raw_date = date_el.text.strip()
                            if raw_date:
                                break
                        except:
                            continue
                    review['visit_date_raw'] = raw_date
                    review['visit_date'] = parse_date(raw_date)
                except:
                    review['visit_date_raw'] = ''
                    review['visit_date'] = ''
                
                # 날짜 범위 체크
                if not is_date_in_range(review['visit_date'], start_date, end_date):
                    continue
                
                # 방문 정보 (1번째 방문, 영수증 등)
                try:
                    info_selectors = ['.pui__gfuUIT', '.pui__QKE5Pr span', '[class*="gfuUIT"]']
                    visit_info = []
                    for sel in info_selectors:
                        try:
                            els = item.find_elements(By.CSS_SELECTOR, sel)
                            for el in els:
                                text = el.text.strip()
                                if text and text not in visit_info:
                                    visit_info.append(text)
                        except:
                            continue
                    review['visit_info'] = visit_info[:5]
                except:
                    review['visit_info'] = []
                
                # 이미지 (모든 이미지 수집)
                review['images'] = get_all_images(item)
                
                # 부정적 리뷰 판별
                review['is_negative'] = is_negative_review(review)
                
                # 고유 ID 생성
                review['id'] = generate_review_id(review)
                
                # 유효한 리뷰만 추가
                if review['author'] or review['content']:
                    reviews.append(review)
                    
            except Exception as e:
                print(f"[WARN] 방문자 리뷰 {idx} 파싱 오류: {e}", flush=True)
                continue
        
    except Exception as e:
        print(f"[ERROR] 방문자 리뷰 파싱 실패: {e}", flush=True)
    
    print(f"[PARSE] 방문자 리뷰 {len(reviews)}개 파싱 완료", flush=True)
    return reviews


def parse_blog_reviews(driver, start_date=None, end_date=None):
    """블로그 리뷰 파싱 (새로운 HTML 구조)"""
    reviews = []
    
    try:
        # 새로운 셀렉터: li.EblIP
        review_selectors = [
            'li.EblIP',
            'li[class*="EblIP"]',
            'li.pui__X35jYm'  # 폴백용 기존 셀렉터
        ]
        
        review_items = []
        for selector in review_selectors:
            try:
                items = driver.find_elements(By.CSS_SELECTOR, selector)
                if items:
                    review_items = items
                    print(f"[PARSE] 셀렉터 '{selector}'로 {len(items)}개 발견", flush=True)
                    break
            except:
                continue
        
        if not review_items:
            print("[PARSE] 블로그 리뷰 요소를 찾을 수 없음", flush=True)
            return reviews
        
        print(f"[PARSE] 블로그 리뷰 {len(review_items)}개 파싱 중...", flush=True)
        
        for idx, item in enumerate(review_items):
            try:
                review = {'type': 'blog'}
                
                # 블로그 URL
                try:
                    link_selectors = ['a.behIY', 'a[class*="behIY"]', 'a[href*="blog.naver.com"]']
                    for sel in link_selectors:
                        try:
                            link_el = item.find_element(By.CSS_SELECTOR, sel)
                            review['blog_url'] = link_el.get_attribute('href') or ''
                            if review['blog_url']:
                                break
                        except:
                            continue
                except:
                    review['blog_url'] = ''
                
                # 작성자명
                try:
                    author_selectors = ['.pui__NMi-Dp', '[class*="NMi-Dp"]']
                    for sel in author_selectors:
                        try:
                            review['author'] = item.find_element(By.CSS_SELECTOR, sel).text.strip()
                            if review['author']:
                                break
                        except:
                            continue
                except:
                    review['author'] = ''
                
                # 블로그명
                try:
                    blog_name_selectors = ['.XR_ao', '.X9yBv span', '[class*="XR_ao"]']
                    for sel in blog_name_selectors:
                        try:
                            review['blog_name'] = item.find_element(By.CSS_SELECTOR, sel).text.strip()
                            if review['blog_name']:
                                break
                        except:
                            continue
                except:
                    review['blog_name'] = ''
                
                # 제목
                try:
                    title_selectors = ['.pui__dGLDWy', '[class*="dGLDWy"]']
                    for sel in title_selectors:
                        try:
                            review['title'] = item.find_element(By.CSS_SELECTOR, sel).text.strip()
                            if review['title']:
                                break
                        except:
                            continue
                except:
                    review['title'] = ''
                
                # 내용
                try:
                    content_selectors = ['.pui__vn15t2', '[class*="vn15t2"]']
                    for sel in content_selectors:
                        try:
                            review['content'] = item.find_element(By.CSS_SELECTOR, sel).text.strip()
                            if review['content']:
                                break
                        except:
                            continue
                except:
                    review['content'] = ''
                
                # 작성일
                try:
                    date_selectors = ['.u5XwJ time', '.X9yBv time', 'time']
                    raw_date = ''
                    for sel in date_selectors:
                        try:
                            date_el = item.find_element(By.CSS_SELECTOR, sel)
                            raw_date = date_el.text.strip()
                            if raw_date:
                                break
                        except:
                            continue
                    review['write_date_raw'] = raw_date
                    review['write_date'] = parse_date(raw_date)
                except:
                    review['write_date_raw'] = ''
                    review['write_date'] = ''
                
                # 날짜 범위 체크
                if not is_date_in_range(review['write_date'], start_date, end_date):
                    continue
                
                # 이미지 (모든 이미지 수집)
                review['images'] = get_all_images(item)
                
                # 부정적 리뷰 판별
                review['is_negative'] = is_negative_review(review)
                
                # 고유 ID 생성
                review['id'] = generate_review_id(review)
                
                # 유효한 리뷰만 추가
                if review['author'] or review['content'] or review['title']:
                    reviews.append(review)
                    
            except Exception as e:
                print(f"[WARN] 블로그 리뷰 {idx} 파싱 오류: {e}", flush=True)
                continue
        
    except Exception as e:
        print(f"[ERROR] 블로그 리뷰 파싱 실패: {e}", flush=True)
    
    print(f"[PARSE] 블로그 리뷰 {len(reviews)}개 파싱 완료", flush=True)
    return reviews


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
    
    # 방문자 리뷰
    visitor_url = f"https://m.place.naver.com/restaurant/{place_id}/review/visitor?reviewSort=recent"
    print(f"[CRAWL] 방문자 리뷰: {visitor_url}", flush=True)
    
    try:
        driver.get(visitor_url)
        time.sleep(3)
        
        # 페이지 로딩 대기
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'li[class*="EjjAW"], li.pui__X35jYm'))
            )
            print("[CRAWL] 방문자 리뷰 페이지 로드 완료", flush=True)
        except TimeoutException:
            print("[WARN] 방문자 리뷰 로딩 타임아웃", flush=True)
        
        # 스크롤하여 더 많은 리뷰 로드
        scroll_and_load(driver, max_scrolls=30)
        
        # 더보기 버튼 클릭
        click_more_buttons(driver, start_date, max_clicks)
        
        # 파싱
        visitor_reviews = parse_visitor_reviews(driver, start_date, end_date)
        store_data['visitor_reviews'] = visitor_reviews
        store_data['visitor_count'] = len(visitor_reviews)
        print(f"[CRAWL] 방문자 리뷰 {store_data['visitor_count']}개 수집", flush=True)
        
    except Exception as e:
        print(f"[ERROR] 방문자 리뷰 실패: {e}", flush=True)
    
    time.sleep(2)
    
    # 블로그 리뷰
    blog_url = f"https://m.place.naver.com/restaurant/{place_id}/review/ugc?reviewSort=recent"
    print(f"[CRAWL] 블로그 리뷰: {blog_url}", flush=True)
    
    try:
        driver.get(blog_url)
        time.sleep(3)
        
        # 페이지 로딩 대기
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'li[class*="EblIP"], li.pui__X35jYm'))
            )
            print("[CRAWL] 블로그 리뷰 페이지 로드 완료", flush=True)
        except TimeoutException:
            print("[WARN] 블로그 리뷰 로딩 타임아웃", flush=True)
        
        # 스크롤하여 더 많은 리뷰 로드
        scroll_and_load(driver, max_scrolls=30)
        
        # 더보기 버튼 클릭
        click_more_buttons(driver, start_date, max_clicks)
        
        # 파싱
        blog_reviews = parse_blog_reviews(driver, start_date, end_date)
        store_data['blog_reviews'] = blog_reviews
        store_data['blog_count'] = len(blog_reviews)
        print(f"[CRAWL] 블로그 리뷰 {store_data['blog_count']}개 수집", flush=True)
        
    except Exception as e:
        print(f"[ERROR] 블로그 리뷰 실패: {e}", flush=True)
    
    # 부정적 리뷰 수
    negative_count = 0
    for r in store_data['visitor_reviews']:
        if r.get('is_negative'):
            negative_count += 1
    for r in store_data['blog_reviews']:
        if r.get('is_negative'):
            negative_count += 1
    store_data['negative_count'] = negative_count
    
    total = store_data['visitor_count'] + store_data['blog_count']
    print(f"[RESULT] {store_name}: 총 {total}개 (부정 {negative_count}개)", flush=True)
    
    return store_data


def merge_reviews(existing_reviews, new_reviews):
    """기존 리뷰와 새 리뷰 병합"""
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
    
    def get_date(r):
        return r.get('visit_date') or r.get('write_date') or ''
    
    merged.sort(key=get_date, reverse=True)
    
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
    
    # 시작일/종료일 계산
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
                existing_store = None
                for s in existing_data.get('stores', []):
                    if s['store_name'] == store_name:
                        existing_store = s
                        break
                
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
                    
                    negative_count = 0
                    for r in store_data['visitor_reviews']:
                        if r.get('is_negative'):
                            negative_count += 1
                    for r in store_data['blog_reviews']:
                        if r.get('is_negative'):
                            negative_count += 1
                    store_data['negative_count'] = negative_count
                    
                    print(f"[MERGE] {store_name}: +{added_visitor} 방문자, +{added_blog} 블로그", flush=True)
            
            result['stores'].append(store_data)
            result['summary']['total_visitor_reviews'] += store_data['visitor_count']
            result['summary']['total_blog_reviews'] += store_data['blog_count']
            result['summary']['total_negative'] += store_data.get('negative_count', 0)
            
            time.sleep(3)
        
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
            print(f"  신규: +{result['summary']['new_visitor_reviews'] + result['summary']['new_blog_reviews']}개", flush=True)
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
