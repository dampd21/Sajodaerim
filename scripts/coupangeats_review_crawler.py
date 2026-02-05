#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
쿠팡이츠 리뷰 크롤러
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
        "store_id": "397240",
        "id_env": "COUPANG_ID_MAIN",
        "pwd_env": "COUPANG_PWD_MAIN"
    },
    {
        "name": "역대짬뽕 다산1호점",
        "store_id": "544124",
        "id_env": "COUPANG_ID_DASAN",
        "pwd_env": "COUPANG_PWD_DASAN"
    },
    {
        "name": "역대짬뽕 송파점",
        "store_id": "917624",
        "id_env": "COUPANG_ID_SONGPA",
        "pwd_env": "COUPANG_PWD_SONGPA"
    },
    {
        "name": "역대짬뽕 두정점",
        "store_id": "951763",
        "id_env": "COUPANG_ID_DUJEONG",
        "pwd_env": "COUPANG_PWD_DUJEONG"
    }
]

# API 설정
API_BASE_URL = "https://store.coupangeats.com/api/v1/merchant/reviews/search"
LOGIN_URL = "https://store.coupangeats.com/login"

# 출력 경로
OUTPUT_DIR = "docs"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "review_coupangeats_data.json")


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
    options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    
    # 자동화 감지 우회
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": """
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            })
        """
    })
    
    print("[SETUP] Chrome 드라이버 설정 완료", flush=True)
    return driver


def login_and_get_cookies(driver, login_id, login_pwd, store_id):
    """로그인하여 세션 쿠키 획득"""
    print(f"  [LOGIN] 로그인 시도 중...", flush=True)
    
    try:
        driver.get(LOGIN_URL)
        print(f"  [LOGIN] 페이지 로드 완료", flush=True)
        time.sleep(5)
        
        # 현재 URL 확인
        print(f"  [LOGIN] 현재 URL: {driver.current_url}", flush=True)
        
        # 페이지 소스 일부 출력 (디버깅)
        page_source = driver.page_source
        if "loginId" in page_source:
            print(f"  [LOGIN] loginId 필드 발견", flush=True)
        else:
            print(f"  [LOGIN] loginId 필드 없음, 페이지 확인 필요", flush=True)
        
        # 아이디 입력 - 여러 방법 시도
        id_input = None
        try:
            id_input = WebDriverWait(driver, 15).until(
                EC.presence_of_element_located((By.ID, "loginId"))
            )
            print(f"  [LOGIN] ID 필드 찾음 (By.ID)", flush=True)
        except:
            try:
                id_input = WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "input#loginId"))
                )
                print(f"  [LOGIN] ID 필드 찾음 (By.CSS_SELECTOR)", flush=True)
            except:
                try:
                    id_input = WebDriverWait(driver, 5).until(
                        EC.presence_of_element_located((By.XPATH, "//input[@id='loginId']"))
                    )
                    print(f"  [LOGIN] ID 필드 찾음 (By.XPATH)", flush=True)
                except:
                    # 모든 input 요소 찾기
                    inputs = driver.find_elements(By.TAG_NAME, "input")
                    print(f"  [LOGIN] 페이지의 input 요소 수: {len(inputs)}", flush=True)
                    for i, inp in enumerate(inputs):
                        print(f"    input[{i}]: id={inp.get_attribute('id')}, type={inp.get_attribute('type')}, placeholder={inp.get_attribute('placeholder')}", flush=True)
                    raise Exception("ID 입력 필드를 찾을 수 없음")
        
        # 입력 필드가 보이고 활성화될 때까지 대기
        WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.ID, "loginId")))
        
        id_input.clear()
        time.sleep(0.5)
        id_input.send_keys(login_id)
        print(f"  [LOGIN] 아이디 입력 완료", flush=True)
        time.sleep(0.5)
        
        # 비밀번호 입력
        pwd_input = driver.find_element(By.ID, "password")
        pwd_input.clear()
        time.sleep(0.5)
        pwd_input.send_keys(login_pwd)
        print(f"  [LOGIN] 비밀번호 입력 완료", flush=True)
        time.sleep(0.5)
        
        # 로그인 버튼 클릭
        login_btn = driver.find_element(By.CSS_SELECTOR, "button.merchant-submit-btn")
        login_btn.click()
        print(f"  [LOGIN] 로그인 버튼 클릭", flush=True)
        
        time.sleep(7)
        
        # 로그인 후 URL 확인
        current_url = driver.current_url
        print(f"  [LOGIN] 로그인 후 URL: {current_url}", flush=True)
        
        # 로그인 실패 체크
        if "login" in current_url.lower():
            # 에러 메시지 확인
            try:
                error_msg = driver.find_element(By.CSS_SELECTOR, ".field-error, .login-error, .error-message")
                print(f"  [LOGIN] 에러 메시지: {error_msg.text}", flush=True)
            except:
                pass
            print(f"  [LOGIN] 로그인 실패: 여전히 로그인 페이지", flush=True)
            return None
        
        # 리뷰 페이지로 이동
        review_url = "https://store.coupangeats.com/merchant/management/reviews"
        driver.get(review_url)
        time.sleep(3)
        
        # 쿠키 추출
        cookies = driver.get_cookies()
        cookie_dict = {cookie['name']: cookie['value'] for cookie in cookies}
        
        print(f"  [LOGIN] 쿠키 목록: {list(cookie_dict.keys())}", flush=True)
        
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
        
        # 스크린샷 저장 시도
        try:
            driver.save_screenshot("/tmp/coupang_error.png")
            print(f"  [LOGIN] 스크린샷 저장됨: /tmp/coupang_error.png", flush=True)
        except:
            pass
        
        return None


def fetch_reviews_api(cookies, store_id, from_date, to_date):
    """API로 리뷰 데이터 수집"""
    reviews = []
    page = 1
    size = 50
    
    headers = {
        "accept": "application/json",
        "accept-language": "ko-KR",
        "referer": "https://store.coupangeats.com/merchant/management/reviews",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest"
    }
    
    # 쿠키 문자열 생성
    cookie_str = "; ".join([f"{k}={v}" for k, v in cookies.items()])
    headers["Cookie"] = cookie_str
    
    print(f"    [API] 기간: {from_date} ~ {to_date}", flush=True)
    
    while True:
        url = f"{API_BASE_URL}?storeId={store_id}&page={page}&size={size}&statusType=EXPOSE&startDateTime={from_date}&exclusiveEndDateTime={to_date}"
        
        try:
            response = requests.get(url, headers=headers, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get("code") != "SUCCESS":
                    print(f"    [API] 오류: {data.get('error')}", flush=True)
                    break
                
                content = data.get("data", {})
                review_list = content.get("content", [])
                total = content.get("total", 0)
                
                if not review_list:
                    print(f"    [API] 리뷰 없음", flush=True)
                    break
                
                reviews.extend(review_list)
                print(f"    [API] 수집: page={page}, 개수={len(review_list)}, 전체={total}", flush=True)
                
                if len(reviews) >= total:
                    break
                
                page += 1
                time.sleep(1)
                
            elif response.status_code == 401:
                print(f"    [API] 인증 만료 (401)", flush=True)
                break
            else:
                print(f"    [API] 오류: {response.status_code}", flush=True)
                print(f"    [API] 응답: {response.text[:500]}", flush=True)
                break
                
        except Exception as e:
            print(f"    [API] 요청 오류: {e}", flush=True)
            break
    
    return reviews


def parse_review(review, store_name):
    """리뷰 데이터 파싱"""
    
    images = review.get("images", [])
    menus = [item.get("dishName", "") for item in review.get("orderInfo", []) if item.get("dishName")]
    
    created_at = review.get("createdAt", "")
    created_date = ""
    if created_at:
        try:
            created_date = created_at[:10]
        except:
            pass
    
    rating = review.get("rating", 5.0)
    is_negative = rating <= 3.0
    
    return {
        "id": str(review.get("orderReviewId", "")),
        "store_name": store_name,
        "platform": "coupangeats",
        "nickname": review.get("customerName", "익명"),
        "rating": rating,
        "content": review.get("comment", ""),
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
        end_date = target_date + timedelta(days=1)
        return [(target_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))]
    
    elif mode == "initial":
        ranges = [
            ("2025-01-01", "2025-07-01"),
            ("2025-07-01", "2026-01-01"),
        ]
        
        if today.year >= 2026:
            start = datetime(2026, 1, 1)
            while start < today:
                end = min(start + timedelta(days=180), today + timedelta(days=1))
                ranges.append((start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")))
                start = end
        
        return ranges
    
    elif mode == "current_year":
        year_start = datetime(today.year, 1, 1)
        ranges = []
        
        start = year_start
        while start < today:
            end = min(start + timedelta(days=180), today + timedelta(days=1))
            ranges.append((start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")))
            start = end
        
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
        "platform": "coupangeats",
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
    print("쿠팡이츠 리뷰 크롤러 시작", flush=True)
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
        store_id = store["store_id"]
        login_id = os.environ.get(store["id_env"])
        login_pwd = os.environ.get(store["pwd_env"])
        
        print(f"\n[{store_name}] (Store ID: {store_id})", flush=True)
        
        if not login_id or not login_pwd:
            print(f"  건너뜀: 로그인 정보 없음 ({store['id_env']})", flush=True)
            if store_name in store_reviews:
                all_stores.append({
                    "store_name": store_name,
                    "store_id": store_id,
                    "reviews": store_reviews[store_name],
                    "review_count": len(store_reviews[store_name]),
                    "crawled_at": existing_data.get("generated_at")
                })
            continue
        
        driver = setup_driver()
        
        try:
            cookies = login_and_get_cookies(driver, login_id, login_pwd, store_id)
            
            if not cookies:
                print(f"  실패: 로그인 불가", flush=True)
                driver.quit()
                if store_name in store_reviews:
                    all_stores.append({
                        "store_name": store_name,
                        "store_id": store_id,
                        "reviews": store_reviews[store_name],
                        "review_count": len(store_reviews[store_name]),
                        "crawled_at": existing_data.get("generated_at")
                    })
                continue
            
            new_reviews = []
            for from_date, to_date in date_ranges:
                raw_reviews = fetch_reviews_api(cookies, store_id, from_date, to_date)
                
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
                "store_id": store_id,
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
                    "store_id": store_id,
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
        "platform": "coupangeats",
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
