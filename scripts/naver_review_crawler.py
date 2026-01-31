#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
네이버 플레이스 리뷰 크롤러 v5
- 자동 수집: 2일 전까지, 더보기 10회
- 메타태그에서 실제 리뷰수 수집
- 하이브리드 감성 분석
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
print("네이버 플레이스 리뷰 크롤러 v5", flush=True)
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

try:
    import requests
    print("[INFO] Requests 로드 완료", flush=True)
except ImportError:
    requests = None
    print("[WARN] Requests 없음 - AI 분석 비활성화", flush=True)

# ============================================
# 설정
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

# 부정적 키워드 (가중치 포함)
NEGATIVE_KEYWORDS = {
    "최악": 3, "비추": 3, "후회": 3, "다시 안": 3, "다신 안": 3,
    "재방문 의사 없": 3, "맛없": 3, "맛이 없": 3, "불결": 3,
    "환불": 3, "신고": 3, "사기": 3,
    "실망": 2, "별로": 2, "불친절": 2, "더럽": 2, "위생": 2,
    "비싸": 2, "비쌌": 2, "짜다": 2, "짰": 2, "싱겁": 2,
    "느끼": 2, "식었": 2, "차갑": 2, "늦": 2, "오래 걸": 2,
    "기다": 2, "웨이팅": 2, "퍽퍽": 2, "질겨": 2,
    "아쉽": 1, "아쉬웠": 1, "적었": 1, "적다": 1, "양이 적": 1,
    "그닥": 1, "그저 그": 1, "평범": 1, "보통": 1, "애매": 1,
    "기대 이하": 1, "안 좋": 1, "글쎄": 1
}

POSITIVE_KEYWORDS = {
    "맛있": -2, "맛있었": -2, "최고": -3, "추천": -2, "강추": -3,
    "또 올": -2, "또 가": -2, "또 방문": -2, "재방문 의사 있": -2,
    "친절": -1, "깔끔": -1, "청결": -1, "좋았": -1, "좋아요": -1,
    "만족": -2, "감사": -1, "훌륭": -2, "대박": -2, "존맛": -3,
    "JMT": -3, "인생": -2
}

NEGATION_PATTERNS = ["않", "안 ", "없", "아니", "못 ", "절대"]

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


# ============================================
# 메타태그에서 리뷰수 수집
# ============================================

def get_review_counts_from_meta(driver, place_id):
    """
    플레이스 홈 페이지의 og:description 메타태그에서 리뷰수 추출
    예: "방문자리뷰 2,984 · 블로그리뷰 410"
    """
    visitor_count = 0
    blog_count = 0
    
    try:
        home_url = f"https://m.place.naver.com/restaurant/{place_id}/home"
        print(f"[META] 메타태그 수집: {home_url}", flush=True)
        
        driver.get(home_url)
        time.sleep(2)
        
        # og:description 메타태그 찾기
        try:
            meta = driver.find_element(By.CSS_SELECTOR, 'meta[property="og:description"]')
            content = meta.get_attribute('content') or ''
            print(f"[META] og:description: {content}", flush=True)
            
            # "방문자리뷰 2,984 · 블로그리뷰 410" 파싱
            visitor_match = re.search(r'방문자리뷰\s*([\d,]+)', content)
            blog_match = re.search(r'블로그리뷰\s*([\d,]+)', content)
            
            if visitor_match:
                visitor_count = int(visitor_match.group(1).replace(',', ''))
            if blog_match:
                blog_count = int(blog_match.group(1).replace(',', ''))
                
            print(f"[META] 파싱 결과: 방문자 {visitor_count}, 블로그 {blog_count}", flush=True)
            
        except NoSuchElementException:
            print("[META] og:description 메타태그 없음", flush=True)
            
    except Exception as e:
        print(f"[META] 메타태그 수집 오류: {e}", flush=True)
    
    return visitor_count, blog_count


# ============================================
# 감성 분석
# ============================================

def calculate_negative_score(review):
    content = (review.get('content') or '').lower()
    tags = review.get('tags') or []
    
    score = 0
    matched_keywords = []
    
    for keyword, weight in NEGATIVE_KEYWORDS.items():
        if keyword in content:
            idx = content.find(keyword)
            context = content[max(0, idx-15):idx+len(keyword)+15]
            
            negated = False
            for neg in NEGATION_PATTERNS:
                neg_idx = context.find(neg)
                kw_idx = context.find(keyword)
                if neg_idx != -1 and neg_idx < kw_idx:
                    negated = True
                    break
            
            if not negated:
                score += weight
                matched_keywords.append(f"-{keyword}({weight})")
    
    for keyword, weight in POSITIVE_KEYWORDS.items():
        if keyword in content:
            score += weight
            matched_keywords.append(f"+{keyword}({weight})")
    
    tag_text = ' '.join(tags).lower()
    
    positive_tags = ["맛있어요", "음식이 맛있어요", "양이 많아요", "친절해요", 
                     "재방문 의사 있음", "분위기가 좋아요", "가성비가 좋아요"]
    for pt in positive_tags:
        if pt in tag_text:
            score -= 2
            matched_keywords.append(f"+tag:{pt}")
    
    for keyword, weight in NEGATIVE_KEYWORDS.items():
        if keyword in tag_text:
            score += weight
            matched_keywords.append(f"-tag:{keyword}")
    
    return score, matched_keywords


def analyze_with_ai(content, api_key):
    if not requests or not api_key:
        return None
    
    try:
        prompt = f"""다음 음식점 리뷰의 감성을 분석해주세요.

리뷰: "{content[:500]}"

판단 기준:
1. 음식 맛에 대한 평가 (긍정/부정)
2. 서비스/친절도 평가
3. 가격 대비 만족도
4. 재방문 의사
5. 전체적인 톤

반드시 아래 JSON 형식으로만 응답하세요:
{{"is_negative": true 또는 false, "confidence": 0.0~1.0 사이 숫자, "reason": "한 줄 이유"}}"""

        response = requests.post(
            f"{GEMINI_API_URL}?key={api_key}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1, "maxOutputTokens": 100}
            },
            timeout=10
        )
        
        if response.ok:
            result = response.json()
            text = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
            
            json_match = re.search(r'\{[^}]+\}', text)
            if json_match:
                data = json.loads(json_match.group())
                return data.get('is_negative', None)
        
        return None
        
    except Exception as e:
        print(f"[AI] 분석 오류: {e}", flush=True)
        return None


def is_negative_review_hybrid(review, use_ai=True):
    content = review.get('content') or ''
    
    score, matched = calculate_negative_score(review)
    
    if score >= 5:
        return True, score, "keyword_strong_negative", matched
    
    if score <= -3:
        return False, score, "keyword_strong_positive", matched
    
    if use_ai and GEMINI_API_KEY and 1 <= score <= 4 and len(content) > 20:
        ai_result = analyze_with_ai(content, GEMINI_API_KEY)
        if ai_result is not None:
            return ai_result, score, "ai_analyzed", matched
    
    is_neg = score >= 2
    return is_neg, score, "keyword_threshold", matched


# ============================================
# 드라이버 설정
# ============================================

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
        driver.set_page_load_timeout(30)
        print("[SETUP] Chrome 드라이버 설정 완료", flush=True)
        return driver
    except Exception as e:
        print(f"[ERROR] Chrome 드라이버 설정 실패: {e}", flush=True)
        raise


# ============================================
# 유틸리티 함수
# ============================================

def parse_date(date_str):
    if not date_str:
        return None
    
    parts = re.findall(r'\d+', date_str)
    
    if len(parts) >= 3:
        year = int(parts[0])
        if year < 100:
            year += 2000
        return f"{year:04d}-{int(parts[1]):02d}-{int(parts[2]):02d}"
    elif len(parts) >= 2:
        return f"{datetime.now().year:04d}-{int(parts[0]):02d}-{int(parts[1]):02d}"
    
    return None


def wait_for_page_load(driver, timeout=15):
    try:
        WebDriverWait(driver, timeout).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
        time.sleep(2)
        return True
    except:
        return False


def scroll_to_top(driver):
    driver.execute_script("window.scrollTo(0, 0);")
    time.sleep(0.5)


def scroll_to_bottom(driver):
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(1)


def load_all_reviews(driver, max_clicks=10):
    """더보기 클릭 (기본 10회)"""
    click_count = 0
    no_button_count = 0
    
    while click_count < max_clicks:
        try:
            more_button = None
            selectors = ['a.fvwqf', 'a[class*="fvwqf"]']
            
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
                    break
                scroll_to_bottom(driver)
                time.sleep(1)
                continue
            
            no_button_count = 0
            
            try:
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", more_button)
                time.sleep(0.3)
                driver.execute_script("arguments[0].click();", more_button)
                click_count += 1
                
                if click_count % 5 == 0:
                    print(f"[MORE] 클릭 {click_count}회", flush=True)
                
                time.sleep(1.0)
                
            except (StaleElementReferenceException, ElementClickInterceptedException):
                time.sleep(0.5)
                continue
                
        except Exception as e:
            break
    
    print(f"[MORE] 총 {click_count}회 클릭", flush=True)
    return click_count


def get_all_images(item):
    images = []
    try:
        img_selectors = ['img.K0PDV', '.place_thumb img', '.HH5sZ img', '.MKLdN img']
        for selector in img_selectors:
            try:
                for img in item.find_elements(By.CSS_SELECTOR, selector):
                    src = img.get_attribute('src')
                    if src and 'pstatic.net' in src and src not in images:
                        if 'type=' in src:
                            src = re.sub(r'type=\w+', 'type=w1500_60_sharpen', src)
                        images.append(src)
            except:
                continue
    except:
        pass
    return images


def is_date_in_range(date_str, start_date, end_date):
    if not date_str:
        return True
    try:
        review_date = datetime.strptime(date_str, '%Y-%m-%d')
        if start_date and review_date < datetime.strptime(start_date, '%Y-%m-%d'):
            return False
        if end_date and review_date > datetime.strptime(end_date, '%Y-%m-%d'):
            return False
        return True
    except:
        return True


def generate_review_id(review):
    author = (review.get('author') or '')[:20]
    content = (review.get('content') or '')[:50]
    date = review.get('visit_date') or review.get('write_date') or ''
    return hashlib.md5(f"{author}_{content}_{date}".encode()).hexdigest()[:16]


def find_elements_safe(driver, selectors, context=None):
    target = context if context else driver
    for selector in selectors:
        try:
            elements = target.find_elements(By.CSS_SELECTOR, selector)
            if elements:
                return elements, selector
        except:
            continue
    return [], None


# ============================================
# 리뷰 파싱
# ============================================

def parse_visitor_reviews(driver, start_date=None, end_date=None, use_ai=True):
    reviews = []
    ai_analyzed_count = 0
    
    try:
        scroll_to_top(driver)
        time.sleep(1)
        
        selectors = ['li.place_apply_pui.EjjAW', 'li.EjjAW', 'li[class*="EjjAW"]', 'li.pui__X35jYm']
        review_items, used_selector = find_elements_safe(driver, selectors)
        
        if not review_items:
            time.sleep(3)
            review_items, used_selector = find_elements_safe(driver, selectors)
        
        if not review_items:
            print("[PARSE] 방문자 리뷰 요소를 찾을 수 없음", flush=True)
            return reviews, ai_analyzed_count
        
        print(f"[PARSE] 셀렉터 '{used_selector}'로 {len(review_items)}개 발견", flush=True)
        
        for idx, item in enumerate(review_items):
            try:
                review = {'type': 'visitor'}
                
                try:
                    els, _ = find_elements_safe(item, ['.pui__NMi-Dp', '[class*="NMi-Dp"]'])
                    review['author'] = els[0].text.strip() if els else ''
                except:
                    review['author'] = ''
                
                try:
                    els, _ = find_elements_safe(item, ['.pui__vn15t2', '[class*="vn15t2"]'])
                    review['content'] = els[0].text.strip() if els else ''
                except:
                    review['content'] = ''
                
                try:
                    keyword_els = item.find_elements(By.CSS_SELECTOR, '.pui__V8F9nN em')
                    review['keywords'] = list(set(el.text.strip() for el in keyword_els if el.text.strip()))
                except:
                    review['keywords'] = []
                
                try:
                    tag_els = item.find_elements(By.CSS_SELECTOR, '.pui__jhpEyP')
                    review['tags'] = [el.text.strip() for el in tag_els if el.text.strip() and not el.text.startswith('+')]
                except:
                    review['tags'] = []
                
                try:
                    date_els = item.find_elements(By.CSS_SELECTOR, '.pui__gfuUIT time, time')
                    raw_date = date_els[0].text.strip() if date_els else ''
                    review['visit_date_raw'] = raw_date
                    review['visit_date'] = parse_date(raw_date)
                except:
                    review['visit_date_raw'] = ''
                    review['visit_date'] = ''
                
                if not is_date_in_range(review['visit_date'], start_date, end_date):
                    continue
                
                try:
                    info_els = item.find_elements(By.CSS_SELECTOR, '.pui__gfuUIT')
                    review['visit_info'] = [el.text.strip() for el in info_els if el.text.strip()][:5]
                except:
                    review['visit_info'] = []
                
                review['images'] = get_all_images(item)
                
                is_neg, score, method, matched = is_negative_review_hybrid(review, use_ai)
                review['is_negative'] = is_neg
                review['sentiment_score'] = score
                review['sentiment_method'] = method
                
                if method == 'ai_analyzed':
                    ai_analyzed_count += 1
                
                review['id'] = generate_review_id(review)
                
                if review['author'] or review['content']:
                    reviews.append(review)
                    
            except StaleElementReferenceException:
                continue
            except Exception:
                continue
        
    except Exception as e:
        print(f"[ERROR] 방문자 리뷰 파싱 실패: {e}", flush=True)
    
    print(f"[PARSE] 방문자 리뷰 {len(reviews)}개 파싱 (AI 분석: {ai_analyzed_count}개)", flush=True)
    return reviews, ai_analyzed_count


def parse_blog_reviews(driver, start_date=None, end_date=None, use_ai=True):
    reviews = []
    ai_analyzed_count = 0
    
    try:
        scroll_to_top(driver)
        time.sleep(1)
        
        selectors = ['li.EblIP', 'li[class*="EblIP"]', 'li.pui__X35jYm']
        review_items, used_selector = find_elements_safe(driver, selectors)
        
        if not review_items:
            time.sleep(3)
            review_items, used_selector = find_elements_safe(driver, selectors)
        
        if not review_items:
            print("[PARSE] 블로그 리뷰 요소를 찾을 수 없음", flush=True)
            return reviews, ai_analyzed_count
        
        print(f"[PARSE] 셀렉터 '{used_selector}'로 {len(review_items)}개 발견", flush=True)
        
        for idx, item in enumerate(review_items):
            try:
                review = {'type': 'blog'}
                
                try:
                    link_els = item.find_elements(By.CSS_SELECTOR, 'a.behIY, a[href*="blog.naver.com"]')
                    review['blog_url'] = link_els[0].get_attribute('href') if link_els else ''
                except:
                    review['blog_url'] = ''
                
                try:
                    els, _ = find_elements_safe(item, ['.pui__NMi-Dp'])
                    review['author'] = els[0].text.strip() if els else ''
                except:
                    review['author'] = ''
                
                try:
                    els = item.find_elements(By.CSS_SELECTOR, '.XR_ao')
                    review['blog_name'] = els[0].text.strip() if els else ''
                except:
                    review['blog_name'] = ''
                
                try:
                    els = item.find_elements(By.CSS_SELECTOR, '.pui__dGLDWy')
                    review['title'] = els[0].text.strip() if els else ''
                except:
                    review['title'] = ''
                
                try:
                    els = item.find_elements(By.CSS_SELECTOR, '.pui__vn15t2')
                    review['content'] = els[0].text.strip() if els else ''
                except:
                    review['content'] = ''
                
                try:
                    date_els = item.find_elements(By.CSS_SELECTOR, '.u5XwJ time, time')
                    raw_date = date_els[0].text.strip() if date_els else ''
                    review['write_date_raw'] = raw_date
                    review['write_date'] = parse_date(raw_date)
                except:
                    review['write_date_raw'] = ''
                    review['write_date'] = ''
                
                if not is_date_in_range(review['write_date'], start_date, end_date):
                    continue
                
                review['images'] = get_all_images(item)
                review['tags'] = []
                review['keywords'] = []
                
                is_neg, score, method, matched = is_negative_review_hybrid(review, use_ai)
                review['is_negative'] = is_neg
                review['sentiment_score'] = score
                review['sentiment_method'] = method
                
                if method == 'ai_analyzed':
                    ai_analyzed_count += 1
                
                review['id'] = generate_review_id(review)
                
                if review['author'] or review['content'] or review['title']:
                    reviews.append(review)
                    
            except StaleElementReferenceException:
                continue
            except Exception:
                continue
        
    except Exception as e:
        print(f"[ERROR] 블로그 리뷰 파싱 실패: {e}", flush=True)
    
    print(f"[PARSE] 블로그 리뷰 {len(reviews)}개 파싱 (AI 분석: {ai_analyzed_count}개)", flush=True)
    return reviews, ai_analyzed_count


# ============================================
# 크롤링 메인 로직
# ============================================

def crawl_with_retry(driver, url, parse_func, start_date, end_date, max_clicks, use_ai, max_retries=2):
    for attempt in range(max_retries):
        try:
            print(f"[CRAWL] 시도 {attempt + 1}/{max_retries}", flush=True)
            
            driver.get(url)
            
            if not wait_for_page_load(driver, timeout=20):
                continue
            
            try:
                WebDriverWait(driver, 15).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, 
                        'li[class*="EjjAW"], li[class*="EblIP"], li.pui__X35jYm'))
                )
            except TimeoutException:
                pass
            
            time.sleep(2)
            load_all_reviews(driver, max_clicks)
            time.sleep(2)
            
            reviews, ai_count = parse_func(driver, start_date, end_date, use_ai)
            
            if reviews:
                return reviews, ai_count
            elif attempt < max_retries - 1:
                time.sleep(5)
            
        except Exception as e:
            print(f"[ERROR] 크롤링 오류: {e}", flush=True)
            if attempt < max_retries - 1:
                time.sleep(5)
    
    return [], 0


def crawl_store_reviews(driver, store_name, place_id, start_date=None, end_date=None, max_clicks=10, use_ai=True):
    print("\n" + "=" * 50, flush=True)
    print(f"[CRAWL] {store_name} (ID: {place_id})", flush=True)
    print("=" * 50, flush=True)
    
    # 먼저 메타태그에서 실제 리뷰수 수집
    meta_visitor, meta_blog = get_review_counts_from_meta(driver, place_id)
    
    store_data = {
        'store_name': store_name,
        'place_id': place_id,
        'visitor_reviews': [],
        'blog_reviews': [],
        'visitor_count': 0,
        'blog_count': 0,
        'meta_visitor_count': meta_visitor,  # 메타태그에서 수집한 실제 수
        'meta_blog_count': meta_blog,        # 메타태그에서 수집한 실제 수
        'negative_count': 0,
        'ai_analyzed_count': 0,
        'crawled_at': datetime.now().isoformat()
    }
    
    # 방문자 리뷰
    visitor_url = f"https://m.place.naver.com/restaurant/{place_id}/review/visitor?reviewSort=recent"
    print(f"[CRAWL] 방문자 리뷰: {visitor_url}", flush=True)
    visitor_reviews, ai_count1 = crawl_with_retry(
        driver, visitor_url, parse_visitor_reviews,
        start_date, end_date, max_clicks, use_ai
    )
    store_data['visitor_reviews'] = visitor_reviews
    store_data['visitor_count'] = len(visitor_reviews)
    store_data['ai_analyzed_count'] += ai_count1
    
    time.sleep(3)
    
    # 블로그 리뷰
    blog_url = f"https://m.place.naver.com/restaurant/{place_id}/review/ugc?reviewSort=recent"
    print(f"[CRAWL] 블로그 리뷰: {blog_url}", flush=True)
    blog_reviews, ai_count2 = crawl_with_retry(
        driver, blog_url, parse_blog_reviews,
        start_date, end_date, max_clicks, use_ai
    )
    store_data['blog_reviews'] = blog_reviews
    store_data['blog_count'] = len(blog_reviews)
    store_data['ai_analyzed_count'] += ai_count2
    
    # 부정적 리뷰 집계
    store_data['negative_count'] = sum(
        1 for r in store_data['visitor_reviews'] + store_data['blog_reviews']
        if r.get('is_negative')
    )
    
    total = store_data['visitor_count'] + store_data['blog_count']
    print(f"[RESULT] {store_name}: 수집 {total}개, 실제(메타) 방문자 {meta_visitor} / 블로그 {meta_blog}", flush=True)
    
    return store_data


def merge_reviews(existing_reviews, new_reviews):
    existing_ids = {r.get('id') for r in existing_reviews if r.get('id')}
    merged = list(existing_reviews)
    added = 0
    
    for review in new_reviews:
        if review.get('id') and review['id'] not in existing_ids:
            merged.append(review)
            existing_ids.add(review['id'])
            added += 1
    
    merged.sort(key=lambda r: r.get('visit_date') or r.get('write_date') or '', reverse=True)
    return merged, added


def calculate_review_stats(stores):
    today = datetime.now().date()
    stats = {
        'today': 0, 'yesterday': 0,
        'this_week': 0, 'last_week': 0,
        'this_month': 0, 'last_month': 0,
        'total_negative': 0, 'total_ai_analyzed': 0
    }
    
    for store in stores:
        stats['total_ai_analyzed'] += store.get('ai_analyzed_count', 0)
        
        for review in store.get('visitor_reviews', []) + store.get('blog_reviews', []):
            date_str = review.get('visit_date') or review.get('write_date')
            if not date_str:
                continue
            
            try:
                review_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            except:
                continue
            
            if review_date == today:
                stats['today'] += 1
            if review_date == today - timedelta(days=1):
                stats['yesterday'] += 1
            if review_date >= today - timedelta(days=7):
                stats['this_week'] += 1
            if today - timedelta(days=14) <= review_date < today - timedelta(days=7):
                stats['last_week'] += 1
            if review_date >= today - timedelta(days=30):
                stats['this_month'] += 1
            if today - timedelta(days=60) <= review_date < today - timedelta(days=30):
                stats['last_month'] += 1
            if review.get('is_negative'):
                stats['total_negative'] += 1
    
    def calc_change(c, p):
        return round((c - p) / p * 100, 1) if p else (100 if c else 0)
    
    stats['daily_change'] = calc_change(stats['today'], stats['yesterday'])
    stats['weekly_change'] = calc_change(stats['this_week'], stats['last_week'])
    stats['monthly_change'] = calc_change(stats['this_month'], stats['last_month'])
    
    return stats


def load_existing_data(file_path):
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            pass
    return None


def save_data(data, file_path):
    os.makedirs(os.path.dirname(file_path) or '.', exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[SAVE] {file_path}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--days', type=int, default=2, help='수집 기간 (일) - 기본 2일')
    parser.add_argument('--max-clicks', type=int, default=10, help='더보기 클릭 횟수 - 기본 10회')
    parser.add_argument('--store', type=str, help='특정 지점만 수집')
    parser.add_argument('--no-ai', action='store_true', help='AI 분석 비활성화')
    args = parser.parse_args()
    
    # 기본값: 2일 전부터 오늘까지
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=args.days)).strftime('%Y-%m-%d')
    
    use_ai = not args.no_ai and bool(GEMINI_API_KEY)
    
    print(f"\n시작: {datetime.now()}", flush=True)
    print(f"수집 기간: {start_date} ~ {end_date}", flush=True)
    print(f"더보기 클릭: {args.max_clicks}회", flush=True)
    print(f"AI 분석: {'활성화' if use_ai else '비활성화'}", flush=True)
    
    existing_data = load_existing_data('docs/review_data.json')
    
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
            'total_ai_analyzed': 0,
            'new_visitor_reviews': 0, 
            'new_blog_reviews': 0,
            # 메타태그에서 수집한 실제 총 리뷰수
            'meta_total_visitor': 0,
            'meta_total_blog': 0
        },
        'stats': {}
    }
    
    driver = None
    
    try:
        driver = setup_driver()
        
        stores_to_crawl = {args.store: STORE_PLACES[args.store]} if args.store else STORE_PLACES
        
        for store_name, place_id in stores_to_crawl.items():
            store_data = crawl_store_reviews(
                driver, store_name, place_id,
                start_date, end_date, args.max_clicks, use_ai
            )
            
            if existing_data:
                existing_store = next(
                    (s for s in existing_data.get('stores', []) if s['store_name'] == store_name),
                    None
                )
                if existing_store:
                    merged_v, added_v = merge_reviews(existing_store.get('visitor_reviews', []), store_data['visitor_reviews'])
                    merged_b, added_b = merge_reviews(existing_store.get('blog_reviews', []), store_data['blog_reviews'])
                    
                    store_data['visitor_reviews'] = merged_v
                    store_data['blog_reviews'] = merged_b
                    store_data['visitor_count'] = len(merged_v)
                    store_data['blog_count'] = len(merged_b)
                    store_data['negative_count'] = sum(1 for r in merged_v + merged_b if r.get('is_negative'))
                    
                    result['summary']['new_visitor_reviews'] += added_v
                    result['summary']['new_blog_reviews'] += added_b
                    print(f"[MERGE] +{added_v} 방문자, +{added_b} 블로그", flush=True)
            
            result['stores'].append(store_data)
            result['summary']['total_visitor_reviews'] += store_data['visitor_count']
            result['summary']['total_blog_reviews'] += store_data['blog_count']
            result['summary']['total_negative'] += store_data['negative_count']
            result['summary']['total_ai_analyzed'] += store_data.get('ai_analyzed_count', 0)
            
            # 메타태그 총계
            result['summary']['meta_total_visitor'] += store_data.get('meta_visitor_count', 0)
            result['summary']['meta_total_blog'] += store_data.get('meta_blog_count', 0)
            
            time.sleep(5)
        
        result['summary']['total_stores'] = len(result['stores'])
        result['summary']['total_reviews'] = result['summary']['total_visitor_reviews'] + result['summary']['total_blog_reviews']
        result['stats'] = calculate_review_stats(result['stores'])
        
        save_data(result, 'docs/review_data.json')
        save_data(result, 'output/review_data.json')
        
        print("\n" + "=" * 60, flush=True)
        print("수집 완료!", flush=True)
        print(f"  수집된 리뷰: {result['summary']['total_reviews']}개", flush=True)
        print(f"  실제 리뷰(메타): 방문자 {result['summary']['meta_total_visitor']} / 블로그 {result['summary']['meta_total_blog']}", flush=True)
        print(f"  부정적: {result['summary']['total_negative']}개", flush=True)
        print("=" * 60, flush=True)
        
    except Exception as e:
        print(f"[ERROR] {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        if driver:
            driver.quit()


if __name__ == "__main__":
    main()
