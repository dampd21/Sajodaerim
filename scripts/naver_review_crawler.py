#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
네이버 플레이스 리뷰 크롤러
- 방문자 리뷰 + 블로그 리뷰 수집
- 지점별 수집
- 기존 데이터와 병합 (증분 수집)
"""

import os
import sys
import json
import time
import re
import hashlib
from datetime import datetime

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
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
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
        print(f"[ERROR] Chrome 드라이버 설정 실패: {e}", flush=True)
        raise


def scroll_to_load(driver, max_scrolls=10, wait_time=2):
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
    
    return scroll_count


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
        return f"{year}-{month:02d}-{day:02d}"
    elif len(parts) >= 2:
        current_year = datetime.now().year
        month = int(parts[0])
        day = int(parts[1])
        return f"{current_year}-{month:02d}-{day:02d}"
    
    return date_str


def generate_review_id(review):
    """리뷰 고유 ID 생성"""
    author = review.get('author', '')[:20]
    content = review.get('content', '')[:50]
    date = review.get('visit_date', '') or review.get('write_date', '')
    
    raw = f"{author}_{content}_{date}"
    return hashlib.md5(raw.encode()).hexdigest()[:16]


# ============================================
# 방문자 리뷰 파싱
# ============================================

def parse_visitor_reviews(driver):
    """방문자 리뷰 파싱"""
    reviews = []
    
    try:
        review_items = driver.find_elements(By.CSS_SELECTOR, 'li.place_apply_pui')
        print(f"[PARSE] 방문자 리뷰 {len(review_items)}개 발견", flush=True)
        
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
                    review['content'] = item.find_element(By.CSS_SELECTOR, '.pui__vn15t2 a').text.strip()
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
                
                review['id'] = generate_review_id(review)
                
                if review['author'] or review['content']:
                    reviews.append(review)
                    
            except Exception as e:
                continue
        
    except Exception as e:
        print(f"[ERROR] 방문자 리뷰 파싱 실패: {e}", flush=True)
    
    return reviews


# ============================================
# 블로그 리뷰 파싱
# ============================================

def parse_blog_reviews(driver):
    """블로그 리뷰 파싱"""
    reviews = []
    
    try:
        review_items = driver.find_elements(By.CSS_SELECTOR, 'li.EblIP')
        print(f"[PARSE] 블로그 리뷰 {len(review_items)}개 발견", flush=True)
        
        for item in review_items:
            try:
                review = {'type': 'blog'}
                
                # 블로그 링크
                try:
                    link_el = item.find_element(By.CSS_SELECTOR, 'a.behIY')
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
                    review['blog_name'] = item.find_element(By.CSS_SELECTOR, '.XR_ao').text.strip()
                except:
                    review['blog_name'] = ''
                
                # 블로그 글 제목
                try:
                    review['title'] = item.find_element(By.CSS_SELECTOR, '.pui__dGLDWy').text.strip()
                except:
                    review['title'] = ''
                
                # 리뷰 내용
                try:
                    review['content'] = item.find_element(By.CSS_SELECTOR, '.pui__vn15t2 span').text.strip()
                except:
                    review['content'] = ''
                
                # 작성일
                try:
                    date_el = item.find_element(By.CSS_SELECTOR, '.u5XwJ time')
                    raw_date = date_el.text.strip()
                    review['write_date_raw'] = raw_date
                    review['write_date'] = parse_date(raw_date)
                except:
                    review['write_date_raw'] = ''
                    review['write_date'] = ''
                
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
                
                review['id'] = generate_review_id(review)
                
                if review['author'] or review['content'] or review['title']:
                    reviews.append(review)
                    
            except Exception as e:
                continue
        
    except Exception as e:
        print(f"[ERROR] 블로그 리뷰 파싱 실패: {e}", flush=True)
    
    return reviews


# ============================================
# 지점별 리뷰 수집
# ============================================

def crawl_store_reviews(driver, store_name, place_id, max_reviews=50):
    """특정 지점의 방문자 + 블로그 리뷰 수집"""
    print(f"\n{'='*50}", flush=True)
    print(f"[CRAWL] {store_name} (ID: {place_id})", flush=True)
    print(f"{'='*50}", flush=True)
    
    store_data = {
        'store_name': store_name,
        'place_id': place_id,
        'visitor_reviews': [],
        'blog_reviews': [],
        'visitor_count': 0,
        'blog_count': 0,
        'crawled_at': datetime.now().isoformat()
    }
    
    # 1. 방문자 리뷰 수집
    visitor_url = f"https://m.place.naver.com/restaurant/{place_id}/review/visitor?reviewSort=recent"
    print(f"[CRAWL] 방문자 리뷰 URL: {visitor_url}", flush=True)
    
    try:
        driver.get(visitor_url)
        time.sleep(3)
        
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'li.place_apply_pui'))
            )
            print("[CRAWL] 방문자 리뷰 페이지 로딩 완료", flush=True)
        except TimeoutException:
            print("[WARN] 방문자 리뷰 로딩 타임아웃 - 리뷰가 없을 수 있음", flush=True)
        
        scroll_count = scroll_to_load(driver, max_scrolls=max(1, max_reviews // 10))
        print(f"[CRAWL] 스크롤 {scroll_count}회 완료", flush=True)
        
        visitor_reviews = parse_visitor_reviews(driver)
        store_data['visitor_reviews'] = visitor_reviews[:max_reviews]
        store_data['visitor_count'] = len(store_data['visitor_reviews'])
        print(f"[CRAWL] 방문자 리뷰 {store_data['visitor_count']}개 수집", flush=True)
        
    except Exception as e:
        print(f"[ERROR] 방문자 리뷰 수집 실패: {e}", flush=True)
    
    time.sleep(2)
    
    # 2. 블로그 리뷰 수집
    blog_url = f"https://m.place.naver.com/restaurant/{place_id}/review/ugc?type=photoView&reviewSort=recent"
    print(f"[CRAWL] 블로그 리뷰 URL: {blog_url}", flush=True)
    
    try:
        driver.get(blog_url)
        time.sleep(3)
        
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'li.EblIP'))
            )
            print("[CRAWL] 블로그 리뷰 페이지 로딩 완료", flush=True)
        except TimeoutException:
            print("[WARN] 블로그 리뷰 로딩 타임아웃 - 리뷰가 없을 수 있음", flush=True)
        
        scroll_count = scroll_to_load(driver, max_scrolls=max(1, max_reviews // 10))
        print(f"[CRAWL] 스크롤 {scroll_count}회 완료", flush=True)
        
        blog_reviews = parse_blog_reviews(driver)
        store_data['blog_reviews'] = blog_reviews[:max_reviews]
        store_data['blog_count'] = len(store_data['blog_reviews'])
        print(f"[CRAWL] 블로그 리뷰 {store_data['blog_count']}개 수집", flush=True)
        
    except Exception as e:
        print(f"[ERROR] 블로그 리뷰 수집 실패: {e}", flush=True)
    
    print(f"[RESULT] {store_name}: 방문자 {store_data['visitor_count']}개 + 블로그 {store_data['blog_count']}개", flush=True)
    
    return store_data


# ============================================
# 데이터 병합
# ============================================

def merge_reviews(existing_reviews, new_reviews):
    """기존 리뷰와 새 리뷰 병합 (중복 제거)"""
    existing_ids = {r.get('id') for r in existing_reviews if r.get('id')}
    
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


# ============================================
# 메인
# ============================================

def main():
    print(f"\n시작: {datetime.now()}", flush=True)
    print(f"수집 대상: {len(STORE_PLACES)}개 지점", flush=True)
    
    # 기존 데이터 로드
    existing_data = load_existing_data('docs/review_data.json')
    if existing_data:
        print(f"[INFO] 기존 데이터 발견 - 병합 모드", flush=True)
    else:
        print(f"[INFO] 기존 데이터 없음 - 신규 수집", flush=True)
    
    result = {
        'generated_at': datetime.now().isoformat(),
        'platform': 'naver',
        'stores': [],
        'summary': {
            'total_stores': 0,
            'total_visitor_reviews': 0,
            'total_blog_reviews': 0,
            'total_reviews': 0,
            'new_visitor_reviews': 0,
            'new_blog_reviews': 0
        }
    }
    
    driver = None
    
    try:
        driver = setup_driver()
        
        for store_name, place_id in STORE_PLACES.items():
            store_data = crawl_store_reviews(driver, store_name, place_id, max_reviews=100)
            
            # 기존 데이터와 병합
            if existing_data:
                existing_store = next(
                    (s for s in existing_data.get('stores', []) if s['store_name'] == store_name),
                    None
                )
                
                if existing_store:
                    # 방문자 리뷰 병합
                    merged_visitor, added_visitor = merge_reviews(
                        existing_store.get('visitor_reviews', []),
                        store_data['visitor_reviews']
                    )
                    store_data['visitor_reviews'] = merged_visitor
                    store_data['visitor_count'] = len(merged_visitor)
                    result['summary']['new_visitor_reviews'] += added_visitor
                    print(f"[MERGE] {store_name} 방문자: 기존 {len(existing_store.get('visitor_reviews', []))} + 신규 {added_visitor} = 총 {store_data['visitor_count']}", flush=True)
                    
                    # 블로그 리뷰 병합
                    merged_blog, added_blog = merge_reviews(
                        existing_store.get('blog_reviews', []),
                        store_data['blog_reviews']
                    )
                    store_data['blog_reviews'] = merged_blog
                    store_data['blog_count'] = len(merged_blog)
                    result['summary']['new_blog_reviews'] += added_blog
                    print(f"[MERGE] {store_name} 블로그: 기존 {len(existing_store.get('blog_reviews', []))} + 신규 {added_blog} = 총 {store_data['blog_count']}", flush=True)
            
            result['stores'].append(store_data)
            result['summary']['total_visitor_reviews'] += store_data['visitor_count']
            result['summary']['total_blog_reviews'] += store_data['blog_count']
            
            # 지점 간 대기
            time.sleep(3)
        
        result['summary']['total_stores'] = len(result['stores'])
        result['summary']['total_reviews'] = (
            result['summary']['total_visitor_reviews'] + 
            result['summary']['total_blog_reviews']
        )
        
        # 저장
        os.makedirs('docs', exist_ok=True)
        os.makedirs('output', exist_ok=True)
        
        save_data(result, 'docs/review_data.json')
        save_data(result, 'output/review_data.json')
        
        print("\n" + "=" * 60, flush=True)
        print("🎉 수집 완료!", flush=True)
        print("=" * 60, flush=True)
        print(f"  📍 지점: {result['summary']['total_stores']}개", flush=True)
        print(f"  👤 방문자 리뷰: {result['summary']['total_visitor_reviews']}개", flush=True)
        print(f"  📝 블로그 리뷰: {result['summary']['total_blog_reviews']}개", flush=True)
        print(f"  📊 총 리뷰: {result['summary']['total_reviews']}개", flush=True)
        if existing_data:
            print(f"  🆕 신규 방문자: +{result['summary']['new_visitor_reviews']}개", flush=True)
            print(f"  🆕 신규 블로그: +{result['summary']['new_blog_reviews']}개", flush=True)
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
