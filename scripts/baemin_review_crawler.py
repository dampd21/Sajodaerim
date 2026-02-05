#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
배달의민족 리뷰 크롤러
- Selenium으로 로그인하여 세션 쿠키 획득
- API로 리뷰 데이터 수집
- 지점별 계정 분리
"""

import os
import json
import time
import requests
from datetime import datetime, timedelta
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

# 지점 정보
STORES = [
    {
        "name": "역대짬뽕 본점",
        "shop_id": "13352293",
        "id_env": "BAEMIN_ID_MAIN",
        "pwd_env": "BAEMIN_PWD_MAIN"
    },
    {
        "name": "역대짬뽕 다산1호점",
        "shop_id": "14232160",
        "id_env": "BAEMIN_ID_DASAN",
        "pwd_env": "BAEMIN_PWD_DASAN"
    },
    {
        "name": "역대짬뽕 송파점",
        "shop_id": "14811818",
        "id_env": "BAEMIN_ID_SONGPA",
        "pwd_env": "BAEMIN_PWD_SONGPA"
    },
    {
        "name": "역대짬뽕 두정점",
        "shop_id": "14830987",
        "id_env": "BAEMIN_ID_DUJEONG",
        "pwd_env": "BAEMIN_PWD_DUJEONG"
    }
]

# API 설정
API_BASE_URL = "https://self-api.baemin.com/v1/review/shops"
LOGIN_URL = "https://biz-member.baemin.com/login?returnUrl=https%3A%2F%2Fself.baemin.com"

# 출력 경로
OUTPUT_DIR = "docs"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "review_baemin_data.json")


def setup_driver():
    """Chrome 드라이버 설정"""
    print("[SETUP] Chrome 드라이버 설정 중...", flush=True)
    
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--lang=ko-KR")
    options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    options.add_argument("--disable-web-security")
    options.add_argument("--allow-running-insecure-content")
    
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": """
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
            window.chrome = { runtime: {} };
        """
    })
    
    driver.set_page_load_timeout(60)
    driver.implicitly_wait(10)
    
    print("[SETUP] Chrome 드라이버 설정 완료", flush=True)
    return driver


def wait_for_page_load(driver, timeout=30):
    """페이지 완전 로드 대기"""
    try:
        WebDriverWait(driver, timeout).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
        return True
    except:
        return False


def login_and_get_cookies(driver, login_id, login_pwd, shop_id):
    """로그인하여 세션 쿠키 획득"""
    print(f"  [LOGIN] 로그인 시도 중...", flush=True)
    
    try:
        print(f"  [LOGIN] 로그인 페이지 이동: {LOGIN_URL}", flush=True)
        driver.get(LOGIN_URL)
        
        # 페이지 완전 로드 대기
        wait_for_page_load(driver, 30)
        print(f"  [LOGIN] 페이지 로드 완료", flush=True)
        
        current_url = driver.current_url
        print(f"  [LOGIN] 현재 URL: {current_url}", flush=True)
        
        # React/Vue 앱 렌더링 대기 (최대 30초)
        max_wait = 30
        wait_interval = 2
        elapsed = 0
        
        while elapsed < max_wait:
            inputs = driver.find_elements(By.TAG_NAME, "input")
            forms = driver.find_elements(By.TAG_NAME, "form")
            print(f"  [LOGIN] 대기 중... input: {len(inputs)}, form: {len(forms)} ({elapsed}초)", flush=True)
            
            if len(inputs) >= 2:
                print(f"  [LOGIN] 입력 필드 발견!", flush=True)
                break
            
            time.sleep(wait_interval)
            elapsed += wait_interval
        
        # 최종 확인
        inputs = driver.find_elements(By.TAG_NAME, "input")
        print(f"  [LOGIN] 최종 input 요소 수: {len(inputs)}", flush=True)
        
        if len(inputs) == 0:
            # 페이지 HTML 전체 확인
            body_html = driver.find_element(By.TAG_NAME, "body").get_attribute("innerHTML")
            print(f"  [DEBUG] body HTML 길이: {len(body_html)}", flush=True)
            print(f"  [DEBUG] body HTML: {body_html[:2000]}", flush=True)
            raise Exception("입력 필드를 찾을 수 없음 - 페이지 로딩 실패")
        
        # 입력 필드 정보 출력
        for i, inp in enumerate(inputs):
            attrs = {
                'type': inp.get_attribute('type'),
                'name': inp.get_attribute('name'),
                'placeholder': inp.get_attribute('placeholder'),
                'data-testid': inp.get_attribute('data-testid')
            }
            print(f"    input[{i}]: {attrs}", flush=True)
        
        # ID 입력 필드 찾기
        id_input = None
        for inp in inputs:
            input_type = inp.get_attribute('type')
            name = inp.get_attribute('name')
            testid = inp.get_attribute('data-testid')
            placeholder = inp.get_attribute('placeholder')
            
            if input_type == 'text' or name == 'id' or testid == 'id' or (placeholder and '아이디' in placeholder):
                id_input = inp
                break
        
        if not id_input:
            id_input = inputs[0]  # 첫 번째 input을 ID로 가정
        
        print(f"  [LOGIN] ID 필드 선택됨", flush=True)
        
        # 아이디 입력
        id_input.click()
        time.sleep(0.3)
        id_input.clear()
        time.sleep(0.3)
        id_input.send_keys(login_id)
        print(f"  [LOGIN] 아이디 입력 완료", flush=True)
        time.sleep(0.5)
        
        # 비밀번호 필드 찾기
        pwd_input = None
        for inp in inputs:
            if inp.get_attribute('type') == 'password':
                pwd_input = inp
                break
        
        if not pwd_input and len(inputs) > 1:
            pwd_input = inputs[1]  # 두 번째 input을 PW로 가정
        
        if not pwd_input:
            raise Exception("비밀번호 입력 필드를 찾을 수 없음")
        
        print(f"  [LOGIN] PW 필드 선택됨", flush=True)
        
        pwd_input.click()
        time.sleep(0.3)
        pwd_input.clear()
        time.sleep(0.3)
        pwd_input.send_keys(login_pwd)
        print(f"  [LOGIN] 비밀번호 입력 완료", flush=True)
        time.sleep(0.5)
        
        # 로그인 버튼 찾기
        buttons = driver.find_elements(By.TAG_NAME, "button")
        print(f"  [LOGIN] button 요소 수: {len(buttons)}", flush=True)
        
        login_btn = None
        for btn in buttons:
            btn_type = btn.get_attribute('type')
            btn_text = btn.text
            print(f"    button: type={btn_type}, text={btn_text[:20] if btn_text else ''}", flush=True)
            
            if btn_type == 'submit' or (btn_text and '로그인' in btn_text):
                login_btn = btn
                break
        
        if login_btn:
            login_btn.click()
            print(f"  [LOGIN] 로그인 버튼 클릭", flush=True)
        else:
            pwd_input.send_keys(Keys.RETURN)
            print(f"  [LOGIN] Enter 키로 로그인", flush=True)
        
        time.sleep(10)
        
        # 로그인 후 URL 확인
        current_url = driver.current_url
        print(f"  [LOGIN] 로그인 후 URL: {current_url}", flush=True)
        
        # 로그인 성공 여부 확인
        if "login" in current_url.lower() or "biz-member" in current_url.lower():
            # 에러 메시지 확인
            error_elements = driver.find_elements(By.CSS_SELECTOR, ".is-danger, .error, [role='alert'], .help, p.help")
            for elem in error_elements:
                if elem.text:
                    print(f"  [LOGIN] 에러: {elem.text}", flush=True)
            print(f"  [LOGIN] 로그인 실패: 여전히 로그인 페이지", flush=True)
            return None
        
        # 리뷰 페이지로 이동
        review_url = f"https://self.baemin.com/shops/{shop_id}/reviews"
        print(f"  [LOGIN] 리뷰 페이지 이동: {review_url}", flush=True)
        driver.get(review_url)
        time.sleep(5)
        
        # 쿠키 추출
        cookies = driver.get_cookies()
        cookie_dict = {cookie['name']: cookie['value'] for cookie in cookies}
        
        if cookie_dict:
            print(f"  [LOGIN] 로그인 성공, 쿠키 {len(cookie_dict)}개 획득", flush=True)
            return cookie_dict
        else:
            print(f"  [LOGIN] 로그인 실패: 쿠키 없음", flush=True)
            return None
            
    except Exception as e:
        print(f"  [LOGIN] 로그인 오류: {e}", flush=True)
        import traceback
        traceback.print_exc()
        
        try:
            driver.save_screenshot("/tmp/baemin_error.png")
            print(f"  [DEBUG] 스크린샷 저장됨", flush=True)
        except:
            pass
        
        return None


def fetch_reviews_api(cookies, shop_id, from_date, to_date):
    """API로 리뷰 데이터 수집"""
    reviews = []
    offset = 0
    limit = 50
    
    headers = {
        "accept": "application/json, text/plain, */*",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "origin": "https://self.baemin.com",
        "referer": "https://self.baemin.com/",
        "service-channel": "SELF_SERVICE_PC",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "x-pathname-trace-key": "/shops/reviews"
    }
    
    cookie_str = "; ".join([f"{k}={v}" for k, v in cookies.items()])
    headers["Cookie"] = cookie_str
    
    print(f"    [API] 기간: {from_date} ~ {to_date}", flush=True)
    
    while True:
        url = f"{API_BASE_URL}/{shop_id}/reviews?from={from_date}&to={to_date}&offset={offset}&limit={limit}"
        
        try:
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                
                review_list = data.get("reviews", [])
                has_next = data.get("next", False)
                
                if not review_list:
                    print(f"    [API] 리뷰 없음", flush=True)
                    break
                
                reviews.extend(review_list)
                print(f"    [API] 수집: offset={offset}, 개수={len(review_list)}, next={has_next}", flush=True)
                
                if not has_next:
                    break
                
                offset += limit
                time.sleep(1)
                
            elif response.status_code == 401:
                print(f"    [API] 인증 만료 (401)", flush=True)
                break
            else:
                print(f"    [API] 오류: {response.status_code}", flush=True)
                break
                
        except Exception as e:
            print(f"    [API] 요청 오류: {e}", flush=True)
            break
    
    return reviews


def parse_review(review, store_name):
    """리뷰 데이터 파싱"""
    
    images = []
    for img in review.get("images", []):
        if img.get("displayStatus") == "DISPLAY":
            images.append(img.get("imageUrl", ""))
    
    menus = [menu.get("name", "") for menu in review.get("menus", []) if menu.get("name")]
    
    created_at = review.get("createdAt", "")
    created_date = ""
    if created_at:
        try:
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            created_date = dt.strftime("%Y-%m-%d")
        except:
            created_date = created_at[:10] if len(created_at) >= 10 else ""
    
    rating = review.get("rating", 5.0)
    is_negative = rating <= 3.0
    
    return {
        "id": str(review.get("id", "")),
        "store_name": store_name,
        "platform": "baemin",
        "nickname": review.get("memberNickname", "익명"),
        "rating": rating,
        "content": review.get("contents", ""),
        "menus": menus,
        "images": images,
        "created_at": created_at,
        "created_date": created_date,
        "is_negative": is_negative
    }


def get_date_ranges(mode="daily"):
    """수집 기간 계산"""
    today = datetime.now()
    
    if mode == "daily":
        target_date = today - timedelta(days=2)
        return [(target_date.strftime("%Y-%m-%d"), target_date.strftime("%Y-%m-%d"))]
    
    elif mode == "initial":
        ranges = [
            ("2025-01-01", "2025-06-30"),
            ("2025-07-01", "2025-12-31"),
        ]
        
        if today.year >= 2026:
            start = datetime(2026, 1, 1)
            while start < today:
                end = min(start + timedelta(days=180), today)
                ranges.append((start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")))
                start = end + timedelta(days=1)
        
        return ranges
    
    elif mode == "current_year":
        year_start = datetime(today.year, 1, 1)
        ranges = []
        
        start = year_start
        while start < today:
            end = min(start + timedelta(days=180), today)
            ranges.append((start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")))
            start = end + timedelta(days=1)
        
        return ranges
    
    return []


def load_existing_data():
    """기존 데이터 로드"""
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    
    return {
        "generated_at": None,
        "platform": "baemin",
        "stores": [],
        "summary": {}
    }


def merge_reviews(existing_reviews, new_reviews):
    """중복 제거하여 리뷰 병합"""
    existing_ids = {r["id"] for r in existing_reviews}
    merged = existing_reviews.copy()
    new_count = 0
    
    for review in new_reviews:
        if review["id"] not in existing_ids:
            merged.append(review)
            existing_ids.add(review["id"])
            new_count += 1
    
    merged.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return merged, new_count


def calculate_summary(stores):
    """전체 요약 통계 계산"""
    total_reviews = 0
    total_negative = 0
    rating_sum = 0
    rating_count = 0
    menu_count = {}
    
    for store in stores:
        reviews = store.get("reviews", [])
        total_reviews += len(reviews)
        
        for review in reviews:
            if review.get("is_negative"):
                total_negative += 1
            
            rating = review.get("rating", 0)
            if rating > 0:
                rating_sum += rating
                rating_count += 1
            
            for menu in review.get("menus", []):
                menu_count[menu] = menu_count.get(menu, 0) + 1
    
    avg_rating = round(rating_sum / rating_count, 2) if rating_count > 0 else 0
    popular_menus = sorted(menu_count.items(), key=lambda x: x[1], reverse=True)[:10]
    
    return {
        "total_stores": len(stores),
        "total_reviews": total_reviews,
        "total_negative": total_negative,
        "average_rating": avg_rating,
        "popular_menus": [{"name": m[0], "count": m[1]} for m in popular_menus]
    }


def main():
    """메인 실행"""
    print("=" * 60, flush=True)
    print("배달의민족 리뷰 크롤러 시작", flush=True)
    print("=" * 60, flush=True)
    
    mode = os.environ.get("CRAWL_MODE", "daily")
    print(f"실행 모드: {mode}", flush=True)
    
    date_ranges = get_date_ranges(mode)
    print(f"수집 기간: {date_ranges}", flush=True)
    
    existing_data = load_existing_data()
    
    store_reviews = {}
    for store in existing_data.get("stores", []):
        store_reviews[store["store_name"]] = store.get("reviews", [])
    
    all_stores = []
    total_new_reviews = 0
    
    for store in STORES:
        store_name = store["name"]
        shop_id = store["shop_id"]
        login_id = os.environ.get(store["id_env"])
        login_pwd = os.environ.get(store["pwd_env"])
        
        print(f"\n[{store_name}] (Shop ID: {shop_id})", flush=True)
        
        if not login_id or not login_pwd:
            print(f"  건너뜀: 로그인 정보 없음 ({store['id_env']})", flush=True)
            if store_name in store_reviews:
                all_stores.append({
                    "store_name": store_name,
                    "shop_id": shop_id,
                    "reviews": store_reviews[store_name],
                    "review_count": len(store_reviews[store_name]),
                    "crawled_at": existing_data.get("generated_at")
                })
            continue
        
        driver = setup_driver()
        
        try:
            cookies = login_and_get_cookies(driver, login_id, login_pwd, shop_id)
            
            if not cookies:
                print(f"  실패: 로그인 불가", flush=True)
                driver.quit()
                if store_name in store_reviews:
                    all_stores.append({
                        "store_name": store_name,
                        "shop_id": shop_id,
                        "reviews": store_reviews[store_name],
                        "review_count": len(store_reviews[store_name]),
                        "crawled_at": existing_data.get("generated_at")
                    })
                continue
            
            new_reviews = []
            for from_date, to_date in date_ranges:
                raw_reviews = fetch_reviews_api(cookies, shop_id, from_date, to_date)
                
                for review in raw_reviews:
                    parsed = parse_review(review, store_name)
                    new_reviews.append(parsed)
            
            print(f"  API 수집 완료: {len(new_reviews)}개", flush=True)
            
            existing = store_reviews.get(store_name, [])
            merged, new_count = merge_reviews(existing, new_reviews)
            total_new_reviews += new_count
            
            print(f"  신규 리뷰: {new_count}개, 총 리뷰: {len(merged)}개", flush=True)
            
            store_negative = sum(1 for r in merged if r.get("is_negative"))
            store_rating_sum = sum(r.get("rating", 0) for r in merged if r.get("rating", 0) > 0)
            store_rating_count = sum(1 for r in merged if r.get("rating", 0) > 0)
            store_avg_rating = round(store_rating_sum / store_rating_count, 2) if store_rating_count > 0 else 0
            
            all_stores.append({
                "store_name": store_name,
                "shop_id": shop_id,
                "reviews": merged,
                "review_count": len(merged),
                "negative_count": store_negative,
                "average_rating": store_avg_rating,
                "crawled_at": datetime.now().isoformat()
            })
            
        except Exception as e:
            print(f"  오류: {e}", flush=True)
            import traceback
            traceback.print_exc()
            if store_name in store_reviews:
                all_stores.append({
                    "store_name": store_name,
                    "shop_id": shop_id,
                    "reviews": store_reviews[store_name],
                    "review_count": len(store_reviews[store_name]),
                    "crawled_at": existing_data.get("generated_at")
                })
        
        finally:
            driver.quit()
        
        time.sleep(2)
    
    summary = calculate_summary(all_stores)
    summary["new_reviews"] = total_new_reviews
    
    output_data = {
        "generated_at": datetime.now().isoformat(),
        "platform": "baemin",
        "crawl_mode": mode,
        "stores": all_stores,
        "summary": summary
    }
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print("\n" + "=" * 60, flush=True)
    print(f"수집 완료!", flush=True)
    print(f"총 지점: {summary['total_stores']}개", flush=True)
    print(f"총 리뷰: {summary['total_reviews']}개", flush=True)
    print(f"신규 리뷰: {total_new_reviews}개", flush=True)
    print(f"평균 별점: {summary['average_rating']}", flush=True)
    print(f"부정적 리뷰: {summary['total_negative']}개", flush=True)
    print(f"저장: {OUTPUT_FILE}", flush=True)
    print("=" * 60, flush=True)


if __name__ == "__main__":
    main()
