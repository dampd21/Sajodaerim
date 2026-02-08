#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
배달의민족 리뷰 크롤러
- Selenium으로 로그인하여 세션 생성
- API 호출은 requests 없이, 브라우저 컨텍스트(fetch)로만 수행
- TARGET_STORE 지정 시 해당 지점만 갱신하고, 나머지 지점 데이터는 기존 JSON에서 유지
"""

import os
import sys
import json
import time
import uuid
import shutil
from datetime import datetime, timedelta

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import SessionNotCreatedException
from webdriver_manager.chrome import ChromeDriverManager


STORES = [
    {"key": "main",   "name": "역대짬뽕 본점",      "shop_id": "13352293", "id_env": "BAEMIN_ID_MAIN",   "pwd_env": "BAEMIN_PWD_MAIN"},
    {"key": "dasan",  "name": "역대짬뽕 다산1호점",  "shop_id": "14232160", "id_env": "BAEMIN_ID_DASAN",  "pwd_env": "BAEMIN_PWD_DASAN"},
    {"key": "songpa", "name": "역대짬뽕 송파점",     "shop_id": "14811818", "id_env": "BAEMIN_ID_SONGPA", "pwd_env": "BAEMIN_PWD_SONGPA"},
    {"key": "dujeong","name": "역대짬뽕 두정점",     "shop_id": "14830987", "id_env": "BAEMIN_ID_DUJEONG","pwd_env": "BAEMIN_PWD_DUJEONG"},
]

API_BASE_URL = "https://self-api.baemin.com/v1/review/shops"
LOGIN_URL = "https://biz-member.baemin.com/login?returnUrl=https%3A%2F%2Fself.baemin.com"

OUTPUT_DIR = "docs"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "review_baemin_data.json")

CHROME_PROFILE_BASE = os.environ.get("CHROME_PROFILE_BASE", r"C:\actions-runner\_chrome_profiles")

API_LIMIT = int(os.environ.get("API_LIMIT", "50"))
API_SLEEP_SEC = float(os.environ.get("API_SLEEP_SEC", "1.2"))
STORE_COOLDOWN_SEC = float(os.environ.get("STORE_COOLDOWN_SEC", "6"))


def setup_driver():
    print("[SETUP] Chrome 드라이버 설정 중...", flush=True)

    os.makedirs(CHROME_PROFILE_BASE, exist_ok=True)
    profile_dir = os.path.join(CHROME_PROFILE_BASE, f"profile_{uuid.uuid4().hex}")
    os.makedirs(profile_dir, exist_ok=True)

    options = Options()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--lang=ko-KR")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-background-networking")

    headless = os.environ.get("HEADLESS", "1").strip() != "0"
    if headless:
        options.add_argument("--headless=new")

    options.add_argument(f"--user-data-dir={profile_dir}")
    options.add_argument("--remote-debugging-pipe")

    service = Service(ChromeDriverManager().install())

    driver = None
    try:
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

        driver._baemin_profile_dir = profile_dir
        driver.set_page_load_timeout(60)
        driver.implicitly_wait(10)

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
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass
        shutil.rmtree(profile_dir, ignore_errors=True)
        raise


def login_and_open_review_page(driver, login_id, login_pwd, shop_id):
    print("  [LOGIN] 로그인 시도 중...", flush=True)

    driver.get(LOGIN_URL)
    time.sleep(6)

    inputs = driver.find_elements(By.TAG_NAME, "input")
    if len(inputs) < 2:
        print("  [LOGIN] 입력 필드 부족", flush=True)
        return False

    id_input = None
    pwd_input = None
    for inp in inputs:
        if inp.get_attribute("type") == "password":
            pwd_input = inp
        if inp.get_attribute("name") == "id" or inp.get_attribute("data-testid") == "id":
            id_input = inp

    if id_input is None:
        for inp in inputs:
            if inp.get_attribute("type") == "text":
                id_input = inp
                break

    id_input = id_input or inputs[0]
    pwd_input = pwd_input or inputs[1]

    id_input.click()
    time.sleep(0.2)
    id_input.clear()
    id_input.send_keys(login_id)

    pwd_input.click()
    time.sleep(0.2)
    pwd_input.clear()
    pwd_input.send_keys(login_pwd)

    buttons = driver.find_elements(By.TAG_NAME, "button")
    login_btn = None
    for btn in buttons:
        if btn.get_attribute("type") == "submit" or ("로그인" in (btn.text or "")):
            login_btn = btn
            break

    if login_btn:
        login_btn.click()
    else:
        pwd_input.send_keys(Keys.RETURN)

    time.sleep(8)

    if "login" in driver.current_url.lower():
        print(f"  [LOGIN] 실패: URL={driver.current_url}", flush=True)
        return False

    print("  [LOGIN] 로그인 성공!", flush=True)

    review_url = f"https://self.baemin.com/shops/{shop_id}/reviews"
    print(f"  [LOGIN] 리뷰 페이지 이동: {review_url}", flush=True)
    driver.get(review_url)
    time.sleep(5)

    print(f"  [LOGIN] 리뷰페이지 URL: {driver.current_url}", flush=True)
    print(f"  [LOGIN] 리뷰페이지 Title: {driver.title}", flush=True)
    print(f"  [LOGIN] 쿠키 {len(driver.get_cookies())}개 획득", flush=True)
    return True


def _browser_fetch(driver, url):
    headers = {
        "accept": "application/json, text/plain, */*",
        "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "service-channel": "SELF_SERVICE_PC",
        "x-pathname-trace-key": "/shops/reviews",
    }

    script = r"""
        const url = arguments[0];
        const headers = arguments[1];
        const cb = arguments[arguments.length - 1];

        fetch(url, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: headers
        })
        .then(async (r) => {
          const text = await r.text();
          cb({ status: r.status, text: text });
        })
        .catch((e) => cb({ status: -1, text: String(e) }));
    """
    return driver.execute_async_script(script, url, headers)


def fetch_reviews_api(driver, shop_id, from_date, to_date):
    reviews = []
    offset = 0
    limit = API_LIMIT

    print(f"    [API/browser] 기간: {from_date} ~ {to_date}", flush=True)

    while True:
        url = f"{API_BASE_URL}/{shop_id}/reviews?from={from_date}&to={to_date}&offset={offset}&limit={limit}"

        last = None
        backoff = 2
        for attempt in range(1, 4):
            last = _browser_fetch(driver, url)
            status = last.get("status")
            text = last.get("text", "")

            if status == 200:
                break

            snippet = (text or "")[:200].replace("\n", " ")
            print(f"    [API/browser] 실패 attempt={attempt}/3 status={status} body={snippet}", flush=True)

            time.sleep(backoff)
            backoff *= 2
            try:
                driver.refresh()
                time.sleep(3)
            except Exception:
                pass

        if not last or last.get("status") != 200:
            break

        try:
            data = json.loads(last.get("text", ""))
        except Exception as e:
            snippet = (last.get("text", "") or "")[:200].replace("\n", " ")
            print(f"    [API/browser] JSON 파싱 실패: {e} body={snippet}", flush=True)
            break

        review_list = data.get("reviews", [])
        has_next = data.get("next", False)

        if not review_list:
            break

        reviews.extend(review_list)
        print(f"    [API/browser] 수집: offset={offset}, 개수={len(review_list)}", flush=True)

        if not has_next:
            break

        offset += limit
        time.sleep(API_SLEEP_SEC)

    return reviews


def parse_review(review, store_name):
    images = []
    for img in review.get("images", []):
        if img.get("displayStatus") == "DISPLAY":
            images.append(img.get("imageUrl", ""))

    menus = [m.get("name", "") for m in review.get("menus", []) if m.get("name")]

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
        "is_negative": rating <= 3.0,
    }


def get_date_ranges(mode="daily"):
    today = datetime.now()

    if mode == "daily":
        target_date = today - timedelta(days=2)
        return [(target_date.strftime("%Y-%m-%d"), target_date.strftime("%Y-%m-%d"))]

    if mode == "initial":
        ranges = [("2025-01-01", "2025-06-30"), ("2025-07-01", "2025-12-31")]
        if today.year >= 2026:
            start = datetime(2026, 1, 1)
            while start < today:
                end = min(start + timedelta(days=180), today)
                ranges.append((start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")))
                start = end + timedelta(days=1)
        return ranges

    if mode == "current_year":
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
        except Exception:
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
        "popular_menus": [{"name": m[0], "count": m[1]} for m in popular_menus],
    }


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

    mode = os.environ.get("CRAWL_MODE", "daily").strip().lower()
    target_store = os.environ.get("TARGET_STORE", "all").strip().lower()

    print("=" * 60, flush=True)
    print("배달의민족 리뷰 크롤러 시작", flush=True)
    print("=" * 60, flush=True)
    print(f"실행 모드: {mode}", flush=True)
    print(f"TARGET_STORE: {target_store}", flush=True)

    date_ranges = get_date_ranges(mode)
    print(f"수집 기간: {date_ranges}", flush=True)

    existing_data = load_existing_data()

    # 기존 stores를 shop_id 기준으로 맵핑 (부분 실행 시 다른 지점 유지)
    stores_map = {}
    for s in existing_data.get("stores", []):
        sid = str(s.get("shop_id", "")).strip()
        if sid:
            stores_map[sid] = s

    # 실행할 지점 선택
    if target_store == "all":
        run_stores = STORES
    else:
        run_stores = [s for s in STORES if s["key"] == target_store or s["shop_id"] == target_store]
        if not run_stores:
            print(f"[WARN] TARGET_STORE 매칭 실패: {target_store} -> all로 실행", flush=True)
            run_stores = STORES

    total_new_reviews = 0

    for store in run_stores:
        store_name = store["name"]
        shop_id = store["shop_id"]
        login_id = os.environ.get(store["id_env"])
        login_pwd = os.environ.get(store["pwd_env"])

        print(f"\n[{store_name}] (Shop ID: {shop_id})", flush=True)

        # 로그인 정보 없으면 기존 값 유지
        if not login_id or not login_pwd:
            print("  건너뜀: 로그인 정보 없음(기존 데이터 유지)", flush=True)
            continue

        driver = None
        try:
            driver = setup_driver()

            ok = login_and_open_review_page(driver, login_id, login_pwd, shop_id)
            if not ok:
                print("  실패: 로그인 불가(기존 데이터 유지)", flush=True)
                continue

            new_reviews = []
            for from_date, to_date in date_ranges:
                raw = fetch_reviews_api(driver, shop_id, from_date, to_date)
                for r in raw:
                    new_reviews.append(parse_review(r, store_name))

            print(f"  수집 완료: {len(new_reviews)}개", flush=True)

            existing_reviews = stores_map.get(shop_id, {}).get("reviews", [])
            merged, new_count = merge_reviews(existing_reviews, new_reviews)
            total_new_reviews += new_count

            print(f"  신규: {new_count}개, 총: {len(merged)}개", flush=True)

            store_negative = sum(1 for r in merged if r.get("is_negative"))
            store_rating = [r.get("rating", 0) for r in merged if r.get("rating", 0) > 0]
            store_avg = round(sum(store_rating) / len(store_rating), 2) if store_rating else 0

            stores_map[shop_id] = {
                "store_name": store_name,
                "shop_id": shop_id,
                "reviews": merged,
                "review_count": len(merged),
                "negative_count": store_negative,
                "average_rating": store_avg,
                "crawled_at": datetime.now().isoformat(),
            }

        except Exception as e:
            print(f"  오류: {e} (기존 데이터 유지)", flush=True)
        finally:
            try:
                if driver:
                    driver.quit()
            except Exception:
                pass

            try:
                profile_dir = getattr(driver, "_baemin_profile_dir", None)
                if profile_dir:
                    shutil.rmtree(profile_dir, ignore_errors=True)
            except Exception:
                pass

        time.sleep(STORE_COOLDOWN_SEC)

    # 최종 stores는 항상 STORES 순서대로(없으면 빈 구조)
    all_stores = []
    for s in STORES:
        sid = s["shop_id"]
        if sid in stores_map:
            all_stores.append(stores_map[sid])
        else:
            all_stores.append({
                "store_name": s["name"],
                "shop_id": sid,
                "reviews": [],
                "review_count": 0,
                "crawled_at": existing_data.get("generated_at"),
            })

    summary = calculate_summary(all_stores)
    summary["new_reviews"] = total_new_reviews

    output_data = {
        "generated_at": datetime.now().isoformat(),
        "platform": "baemin",
        "crawl_mode": mode,
        "stores": all_stores,
        "summary": summary,
    }

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 60, flush=True)
    print(f"수집 완료! 총: {summary['total_reviews']}개, 신규: {total_new_reviews}개", flush=True)
    print("=" * 60, flush=True)


if __name__ == "__main__":
    main()
