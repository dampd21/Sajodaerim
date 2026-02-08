#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
배달의민족 리뷰 크롤러
- Selenium으로 로그인하여 세션 쿠키 획득
- API로 리뷰 데이터 수집
- 지점별 계정 분리
"""

import os
import sys
import json
import time
import uuid
import shutil
import requests
from datetime import datetime, timedelta

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import SessionNotCreatedException
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

# 크롬 프로필 저장 위치(한글/특수문자 경로 이슈 피하려고 드라이브 루트 근처로 고정)
CHROME_PROFILE_BASE = os.environ.get("CHROME_PROFILE_BASE", r"C:\actions-runner\_chrome_profiles")


def setup_driver():
    """Chrome 드라이버 설정 (Windows self-hosted 안정화 버전)"""
    print("[SETUP] Chrome 드라이버 설정 중...", flush=True)

    os.makedirs(CHROME_PROFILE_BASE, exist_ok=True)

    # 매 실행마다 완전 고유한 프로필 폴더(충돌 방지)
    profile_dir = os.path.join(CHROME_PROFILE_BASE, f"profile_{uuid.uuid4().hex}")
    os.makedirs(profile_dir, exist_ok=True)

    options = Options()
    # 안정성 옵션(일반 범위)
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--lang=ko-KR")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-background-networking")

    # headless on/off (기본 on)
    headless = os.environ.get("HEADLESS", "1").strip() != "0"
    if headless:
        options.add_argument("--headless=new")

    # ★ 프로필 경로를 명시(한글 경로/잠금 문제 회피)
    options.add_argument(f"--user-data-dir={profile_dir}")

    # ★ 디버깅 채널(일부 환경에서 DevTools/포트 이슈 완화)
    options.add_argument("--remote-debugging-pipe")

    # 크롬드라이버 설치/실행
    service = Service(ChromeDriverManager().install())

    driver = None
    try:
        # 가끔 첫 시도가 실패할 수 있어 2~3회 재시도
        last_err = None
        for attempt in range(1, 4):
            try:
                print(f"[SETUP] 프로필 폴더: {profile_dir}", flush=True)
                print(f"[SETUP] 드라이버 생성 시도 {attempt}/3", flush=True)
                driver = webdriver.Chrome(service=service, options=options)
                break
            except SessionNotCreatedException as e:
                last_err = e
                print(f"[SETUP] SessionNotCreatedException (재시도): {e}", flush=True)
                time.sleep(2)

        if driver is None:
            raise last_err if last_err else RuntimeError("Chrome WebDriver 생성 실패")

        # profile_dir을 driver에 저장해두고, quit 이후 삭제
        driver._baemin_profile_dir = profile_dir

        driver.set_page_load_timeout(60)
        driver.implicitly_wait(10)

        # IP 확인(브라우저 기준)
        try:
            driver.get("https://api.ipify.org?format=json")
            time.sleep(2)
            ip_text = driver.find_element(By.TAG_NAME, "body").text
            print(f"[SETUP] 현재 IP: {ip_text}", flush=True)
        except Exception as e:
            print(f"[SETUP] IP 확인 실패: {e}", flush=True)

        print("[SETUP] Chrome 드라이버 설정 완료", flush=True)
        return driver

    except Exception:
        # 드라이버 생성 자체가 실패한 경우도 폴더는 정리
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass
        shutil.rmtree(profile_dir, ignore_errors=True)
        raise


def login_and_get_cookies(driver, login_id, login_pwd, shop_id):
    """로그인하여 세션 쿠키 획득"""
    print(f"  [LOGIN] 로그인 시도 중...", flush=True)

    try:
        print(f"  [LOGIN] 로그인 페이지 이동", flush=True)
        driver.get(LOGIN_URL)
        time.sleep(8)

        current_url = driver.current_url
        print(f"  [LOGIN] 현재 URL: {current_url}", flush=True)

        title = driver.title
        print(f"  [LOGIN] 페이지 타이틀: {title}", flush=True)

        inputs = driver.find_elements(By.TAG_NAME, "input")
        forms = driver.find_elements(By.TAG_NAME, "form")
        print(f"  [LOGIN] input: {len(inputs)}, form: {len(forms)}", flush=True)

        if len(inputs) == 0:
            print(f"  [LOGIN] 입력 필드 대기 중...", flush=True)
            max_wait = 30
            elapsed = 0
            while elapsed < max_wait:
                time.sleep(2)
                elapsed += 2
                inputs = driver.find_elements(By.TAG_NAME, "input")
                print(f"  [LOGIN] 대기 {elapsed}초... input: {len(inputs)}", flush=True)
                if len(inputs) >= 2:
                    break

        if len(inputs) < 2:
            body = driver.find_element(By.TAG_NAME, "body")
            body_text = body.text[:500] if body.text else "(empty)"
            print(f"  [LOGIN] body text: {body_text}", flush=True)

            body_html = body.get_attribute("innerHTML")[:2000]
            print(f"  [LOGIN] body HTML: {body_html}", flush=True)
            return None

        for i, inp in enumerate(inputs[:5]):
            inp_type = inp.get_attribute('type')
            inp_name = inp.get_attribute('name')
            inp_placeholder = inp.get_attribute('placeholder')
            print(f"    input[{i}]: type={inp_type}, name={inp_name}, placeholder={inp_placeholder}", flush=True)

        id_input = None
        for inp in inputs:
            inp_type = inp.get_attribute('type')
            inp_name = inp.get_attribute('name')
            inp_testid = inp.get_attribute('data-testid')
            if inp_type == 'text' or inp_name == 'id' or inp_testid == 'id':
                id_input = inp
                break
        if not id_input:
            id_input = inputs[0]

        id_input.click()
        time.sleep(0.3)
        id_input.clear()
        id_input.send_keys(login_id)
        print(f"  [LOGIN] 아이디 입력 완료", flush=True)
        time.sleep(0.5)

        pwd_input = None
        for inp in inputs:
            if inp.get_attribute('type') == 'password':
                pwd_input = inp
                break
        if not pwd_input and len(inputs) > 1:
            pwd_input = inputs[1]
        if not pwd_input:
            print(f"  [LOGIN] 비밀번호 필드를 찾을 수 없음", flush=True)
            return None

        pwd_input.click()
        time.sleep(0.3)
        pwd_input.clear()
        pwd_input.send_keys(login_pwd)
        print(f"  [LOGIN] 비밀번호 입력 완료", flush=True)
        time.sleep(0.5)

        buttons = driver.find_elements(By.TAG_NAME, "button")
        print(f"  [LOGIN] button 개수: {len(buttons)}", flush=True)

        login_btn = None
        for btn in buttons:
            btn_type = btn.get_attribute('type')
            btn_text = btn.text or ""
            if btn_type == 'submit' or '로그인' in btn_text:
                login_btn = btn
                print(f"  [LOGIN] 로그인 버튼 발견: type={btn_type}, text={btn_text[:20]}", flush=True)
                break

        if login_btn:
            login_btn.click()
            print(f"  [LOGIN] 로그인 버튼 클릭", flush=True)
        else:
            pwd_input.send_keys(Keys.RETURN)
            print(f"  [LOGIN] Enter 키로 로그인", flush=True)

        time.sleep(10)

        current_url = driver.current_url
        print(f"  [LOGIN] 로그인 후 URL: {current_url}", flush=True)

        if "login" in current_url.lower():
            errors = driver.find_elements(By.CSS_SELECTOR, ".is-danger, .error, [role='alert'], .help, p.help")
            for err in errors:
                if err.text:
                    print(f"  [LOGIN] 에러: {err.text}", flush=True)
            print(f"  [LOGIN] 로그인 실패: 여전히 로그인 페이지", flush=True)
            return None

        print(f"  [LOGIN] 로그인 성공!", flush=True)

        review_url = f"https://self.baemin.com/shops/{shop_id}/reviews"
        print(f"  [LOGIN] 리뷰 페이지 이동: {review_url}", flush=True)
        driver.get(review_url)
        time.sleep(5)

        cookies = driver.get_cookies()
        cookie_dict = {cookie['name']: cookie['value'] for cookie in cookies}

        if cookie_dict:
            print(f"  [LOGIN] 쿠키 {len(cookie_dict)}개 획득", flush=True)
            return cookie_dict

        return None

    except Exception as e:
        print(f"  [LOGIN] 오류: {e}", flush=True)
        import traceback
        traceback.print_exc()
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
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"
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
                    break

                reviews.extend(review_list)
                print(f"    [API] 수집: offset={offset}, 개수={len(review_list)}", flush=True)

                if not has_next:
                    break

                offset += limit
                time.sleep(1)
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
    created_date = created_at[:10] if len(created_at) >= 10 else ""

    rating = review.get("rating", 5.0)

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
        "is_negative": rating <= 3.0
    }


def get_date_ranges(mode="daily"):
    today = datetime.now()

    if mode == "daily":
        target_date = today - timedelta(days=2)
        return [(target_date.strftime("%Y-%m-%d"), target_date.strftime("%Y-%m-%d"))]
    elif mode == "initial":
        ranges = [("2025-01-01", "2025-06-30"), ("2025-07-01", "2025-12-31")]
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
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {"generated_at": None, "platform": "baemin", "stores": [], "summary": {}}


def merge_reviews(existing_reviews, new_reviews):
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
    # 로그 한글 안 깨지게(가능한 경우)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print("=" * 60, flush=True)
    print("배달의민족 리뷰 크롤러 시작", flush=True)
    print("=" * 60, flush=True)

    mode = os.environ.get("CRAWL_MODE", "daily")
    print(f"실행 모드: {mode}", flush=True)

    date_ranges = get_date_ranges(mode)
    print(f"수집 기간: {date_ranges}", flush=True)

    existing_data = load_existing_data()
    store_reviews = {s["store_name"]: s.get("reviews", []) for s in existing_data.get("stores", [])}

    all_stores = []
    total_new_reviews = 0

    for store in STORES:
        store_name = store["name"]
        shop_id = store["shop_id"]
        login_id = os.environ.get(store["id_env"])
        login_pwd = os.environ.get(store["pwd_env"])

        print(f"\n[{store_name}] (Shop ID: {shop_id})", flush=True)

        if not login_id or not login_pwd:
            print(f"  건너뜀: 로그인 정보 없음", flush=True)
            if store_name in store_reviews:
                all_stores.append({
                    "store_name": store_name,
                    "shop_id": shop_id,
                    "reviews": store_reviews[store_name],
                    "review_count": len(store_reviews[store_name]),
                    "crawled_at": existing_data.get("generated_at")
                })
            continue

        driver = None
        try:
            driver = setup_driver()
            cookies = login_and_get_cookies(driver, login_id, login_pwd, shop_id)

            if not cookies:
                print(f"  실패: 로그인 불가", flush=True)
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
                    new_reviews.append(parse_review(review, store_name))

            print(f"  수집 완료: {len(new_reviews)}개", flush=True)

            existing = store_reviews.get(store_name, [])
            merged, new_count = merge_reviews(existing, new_reviews)
            total_new_reviews += new_count

            print(f"  신규: {new_count}개, 총: {len(merged)}개", flush=True)

            store_negative = sum(1 for r in merged if r.get("is_negative"))
            store_rating = [r.get("rating", 0) for r in merged if r.get("rating", 0) > 0]
            store_avg = round(sum(store_rating) / len(store_rating), 2) if store_rating else 0

            all_stores.append({
                "store_name": store_name,
                "shop_id": shop_id,
                "reviews": merged,
                "review_count": len(merged),
                "negative_count": store_negative,
                "average_rating": store_avg,
                "crawled_at": datetime.now().isoformat()
            })

        except Exception as e:
            print(f"  오류: {e}", flush=True)
            if store_name in store_reviews:
                all_stores.append({
                    "store_name": store_name,
                    "shop_id": shop_id,
                    "reviews": store_reviews[store_name],
                    "review_count": len(store_reviews[store_name]),
                    "crawled_at": existing_data.get("generated_at")
                })
        finally:
            # driver 종료
            try:
                if driver:
                    driver.quit()
            except Exception:
                pass

            # 임시 프로필 폴더 삭제
            try:
                profile_dir = getattr(driver, "_baemin_profile_dir", None)
                if profile_dir:
                    shutil.rmtree(profile_dir, ignore_errors=True)
            except Exception:
                pass

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
    print(f"수집 완료! 총: {summary['total_reviews']}개, 신규: {total_new_reviews}개", flush=True)
    print("=" * 60, flush=True)


if __name__ == "__main__":
    main()
