#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
배달의민족 리뷰 크롤러
- Selenium으로 로그인하여 세션 생성
- API 호출은 requests 없이, 브라우저 컨텍스트(fetch)로만 수행
- 핵심: 리뷰 페이지가 실제로 self-api를 호출할 때의 동적 헤더(x-e-request 등)를
       Chrome performance log에서 캡처하여 동일 헤더로 API를 호출한다.

주의: 본인 계정/권한 범위 내에서만 사용하세요.
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


# -----------------------------
# 지점/계정 설정
# -----------------------------
STORES = [
    {"name": "역대짬뽕 본점", "shop_id": "13352293", "id_env": "BAEMIN_ID_MAIN", "pwd_env": "BAEMIN_PWD_MAIN"},
    {"name": "역대짬뽕 다산1호점", "shop_id": "14232160", "id_env": "BAEMIN_ID_DASAN", "pwd_env": "BAEMIN_PWD_DASAN"},
    {"name": "역대짬뽕 송파점", "shop_id": "14811818", "id_env": "BAEMIN_ID_SONGPA", "pwd_env": "BAEMIN_PWD_SONGPA"},
    {"name": "역대짬뽕 두정점", "shop_id": "14830987", "id_env": "BAEMIN_ID_DUJEONG", "pwd_env": "BAEMIN_PWD_DUJEONG"},
]

API_BASE_URL = "https://self-api.baemin.com/v1/review/shops"
LOGIN_URL = "https://biz-member.baemin.com/login?returnUrl=https%3A%2F%2Fself.baemin.com"

OUTPUT_DIR = "docs"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "review_baemin_data.json")

# 크롬 프로필 저장 위치(한글 경로/권한 이슈 회피용)
CHROME_PROFILE_BASE = os.environ.get("CHROME_PROFILE_BASE", r"C:\actions-runner\_chrome_profiles")

# 페이지네이션/속도 튜닝 (워크플로우 env로 조절)
API_LIMIT = int(os.environ.get("API_LIMIT", "50"))
API_SLEEP_SEC = float(os.environ.get("API_SLEEP_SEC", "1.2"))
STORE_COOLDOWN_SEC = float(os.environ.get("STORE_COOLDOWN_SEC", "6"))

# 오래 돌 때 동적 헤더가 바뀌거나 만료될 수 있어서 주기적으로 재캡처
HEADER_REFRESH_EVERY = int(os.environ.get("HEADER_REFRESH_EVERY", "200"))  # API 페이지 요청 N번마다 헤더 갱신
HEADER_CAPTURE_TIMEOUT = int(os.environ.get("HEADER_CAPTURE_TIMEOUT", "20"))  # 헤더 캡처 타임아웃(초)


# -----------------------------
# 공통 유틸
# -----------------------------
def _mask(s: str, keep: int = 16) -> str:
    if not s:
        return ""
    if len(s) <= keep:
        return s
    return s[:keep] + "..."


def _clear_performance_logs(driver):
    try:
        driver.get_log("performance")
    except Exception:
        pass


def _read_performance_logs(driver):
    try:
        return driver.get_log("performance")
    except Exception:
        return []


def _extract_msg(entry):
    """performance log entry -> dict 형태의 CDP message"""
    try:
        return json.loads(entry.get("message", "{}")).get("message", {}) or {}
    except Exception:
        return {}


def _is_target_reviews_api(url: str, shop_id: str) -> bool:
    if not url:
        return False
    return url.startswith(f"{API_BASE_URL}/{shop_id}/reviews")


def _pick_needed_headers(raw_headers: dict) -> dict:
    """
    raw_headers: CDP에서 받은 headers(dict)
    필요한 헤더만 case-insensitive로 추출하여 lower-case key로 리턴
    """
    out = {}
    if not raw_headers:
        return out

    lower = {str(k).lower(): v for k, v in raw_headers.items()}

    # 실제로 DevTools에서 확인한 핵심 헤더들
    keys = [
        "accept",
        "accept-language",
        "service-channel",
        "x-e-request",
        "x-pathname-trace-key",
        "x-web-version",
    ]

    for k in keys:
        v = lower.get(k)
        if v:
            out[k] = v

    return out


# -----------------------------
# Driver / 로그인
# -----------------------------
def setup_driver():
    """Chrome 드라이버 설정 (Windows self-hosted 안정화 + performance log 활성화)"""
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

    # ★ performance log 활성화(네트워크 요청에서 동적 헤더 캡처)
    options.set_capability("goog:loggingPrefs", {"performance": "ALL"})

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
        driver._baemin_api_headers = None
        driver._baemin_api_header_captured_at = None

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
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass
        shutil.rmtree(profile_dir, ignore_errors=True)
        raise


def login_and_open_review_page(driver, login_id, login_pwd, shop_id):
    """로그인 후 리뷰 페이지로 이동"""
    print("  [LOGIN] 로그인 시도 중...", flush=True)

    driver.get(LOGIN_URL)
    time.sleep(6)

    inputs = driver.find_elements(By.TAG_NAME, "input")
    if len(inputs) < 2:
        print("  [LOGIN] 입력 필드 부족", flush=True)
        return False

    # id/pw 찾기(최대한 보수적으로)
    id_input = None
    pwd_input = None
    for inp in inputs:
        if inp.get_attribute("type") == "password":
            pwd_input = inp
        if inp.get_attribute("name") == "id" or inp.get_attribute("data-testid") == "id":
            id_input = inp

    if id_input is None:
        # fallback
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

    # 로그인 버튼
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

    # ★ 캡처 성공률 올리려고: 이동 직전 로그 비우기
    _clear_performance_logs(driver)

    driver.get(review_url)
    time.sleep(5)

    print(f"  [LOGIN] 리뷰페이지 URL: {driver.current_url}", flush=True)
    print(f"  [LOGIN] 리뷰페이지 Title: {driver.title}", flush=True)
    print(f"  [LOGIN] 쿠키 {len(driver.get_cookies())}개 획득", flush=True)

    return True


# -----------------------------
# 동적 헤더 캡처 (중요)
# -----------------------------
def capture_api_headers_from_page(driver, shop_id, timeout=HEADER_CAPTURE_TIMEOUT):
    """
    리뷰 페이지가 self-api를 호출할 때의 request headers에서 필요한 값을 캡처한다.
    - Network.requestWillBeSent 로 URL(requestId)을 잡고
    - Network.requestWillBeSentExtraInfo 로 헤더를 requestId에 결합한다.
    """
    print("    [HDR] self-api 요청 헤더 캡처 시도...", flush=True)

    start = time.time()

    # requestId -> url / headers 조합
    target_reqids = set()
    headers_by_id = {}

    while time.time() - start < timeout:
        logs = _read_performance_logs(driver)

        for entry in logs:
            msg = _extract_msg(entry)
            if not msg:
                continue

            method = msg.get("method")
            params = msg.get("params", {}) or {}

            # 1) URL/reqid 식별
            if method == "Network.requestWillBeSent":
                rid = params.get("requestId")
                req = params.get("request", {}) or {}
                url = req.get("url", "")

                if rid and _is_target_reviews_api(url, shop_id):
                    target_reqids.add(rid)

                    # 가끔 requestWillBeSent에도 headers 일부가 담겨옴
                    hdrs = req.get("headers", {}) or {}
                    picked = _pick_needed_headers(hdrs)
                    if picked:
                        headers_by_id.setdefault(rid, {}).update(picked)

            # 2) 헤더 extra info (여기에 x-e-request가 오는 케이스가 많음)
            elif method == "Network.requestWillBeSentExtraInfo":
                rid = params.get("requestId")
                if rid and rid in target_reqids:
                    hdrs = params.get("headers", {}) or {}
                    picked = _pick_needed_headers(hdrs)
                    if picked:
                        headers_by_id.setdefault(rid, {}).update(picked)

        # 성공 조건: x-e-request만 잡혀도(가장 중요) 성공으로 처리
        for rid in list(target_reqids):
            h = headers_by_id.get(rid, {})
            if h.get("x-e-request"):
                # 기본값 보정(없으면 넣어줌)
                h.setdefault("accept", "application/json, text/plain, */*")
                h.setdefault("accept-language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7")
                h.setdefault("service-channel", "SELF_SERVICE_PC")
                h.setdefault("x-pathname-trace-key", "/shops/reviews")

                print(
                    "    [HDR] 캡처 성공: "
                    f"x-web-version={h.get('x-web-version')} "
                    f"x-pathname-trace-key={h.get('x-pathname-trace-key')} "
                    f"x-e-request={_mask(h.get('x-e-request'))}",
                    flush=True
                )
                return h

        time.sleep(0.2)

    print("    [HDR] 캡처 실패(페이지에서 self-api 호출을 못 잡음).", flush=True)
    return None


def prime_api_headers(driver, shop_id):
    """
    리뷰 페이지 진입 직후 선(先)캡처.
    실패하면 refresh 후 1회 재시도.
    """
    hdr = capture_api_headers_from_page(driver, shop_id)
    if hdr:
        driver._baemin_api_headers = hdr
        driver._baemin_api_header_captured_at = time.time()
        return hdr

    print("    [HDR] 선캡처 실패 -> refresh 후 재시도", flush=True)
    try:
        _clear_performance_logs(driver)
        driver.refresh()
        time.sleep(5)
    except Exception:
        pass

    hdr = capture_api_headers_from_page(driver, shop_id)
    driver._baemin_api_headers = hdr
    driver._baemin_api_header_captured_at = time.time()
    return hdr


def ensure_api_headers(driver, shop_id):
    if getattr(driver, "_baemin_api_headers", None):
        return driver._baemin_api_headers
    return prime_api_headers(driver, shop_id)


def refresh_api_headers(driver, shop_id):
    print("    [HDR] 헤더 갱신(리뷰페이지 refresh 후 재캡처)...", flush=True)
    try:
        _clear_performance_logs(driver)
        driver.refresh()
        time.sleep(5)
    except Exception:
        pass

    hdr = capture_api_headers_from_page(driver, shop_id)
    driver._baemin_api_headers = hdr
    driver._baemin_api_header_captured_at = time.time()
    return hdr


# -----------------------------
# API 호출(fetch)
# -----------------------------
def _browser_fetch(driver, url, headers):
    """
    브라우저 컨텍스트에서 fetch 수행.
    참고: fetch에서 forbidden header(Origin/User-Agent 등)는 설정 불가.
    """
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
    """
    브라우저 fetch로 리뷰 데이터 수집.
    - 페이지가 만든 동적 헤더를 캡처해서 사용
    - 실패(-1/403/...)하면 헤더 갱신 후 1회 재시도
    - 대량(initial) 대비: HEADER_REFRESH_EVERY 마다 헤더 갱신
    """
    reviews = []
    offset = 0
    limit = API_LIMIT
    req_count = 0

    print(f"    [API] 기간: {from_date} ~ {to_date}", flush=True)

    headers = ensure_api_headers(driver, shop_id)
    if not headers:
        print("    [API] 헤더 없음 -> 중단", flush=True)
        return reviews

    while True:
        url = f"{API_BASE_URL}/{shop_id}/reviews?from={from_date}&to={to_date}&offset={offset}&limit={limit}"

        # 주기적 헤더 갱신
        if req_count > 0 and (req_count % HEADER_REFRESH_EVERY == 0):
            headers = refresh_api_headers(driver, shop_id) or headers
            if not headers:
                print("    [API] 헤더 갱신 실패 -> 중단", flush=True)
                break

        resp = _browser_fetch(driver, url, headers)
        status = resp.get("status")
        text = resp.get("text", "")

        if status != 200:
            snippet = (text or "")[:200].replace("\n", " ")
            print(f"    [API] 오류: status={status} body={snippet}", flush=True)

            # 헤더 갱신 후 1회 재시도
            headers2 = refresh_api_headers(driver, shop_id)
            if not headers2:
                print("    [API] 헤더 갱신 실패 -> 중단", flush=True)
                break

            headers = headers2
            resp = _browser_fetch(driver, url, headers)
            status = resp.get("status")
            text = resp.get("text", "")

            if status != 200:
                snippet2 = (text or "")[:200].replace("\n", " ")
                print(f"    [API] 재시도 실패: status={status} body={snippet2}", flush=True)
                break

        # status == 200
        try:
            data = json.loads(text)
        except Exception as e:
            snippet = (text or "")[:200].replace("\n", " ")
            print(f"    [API] JSON 파싱 실패: {e} body={snippet}", flush=True)
            break

        review_list = data.get("reviews", [])
        has_next = data.get("next", False)

        if not review_list:
            break

        reviews.extend(review_list)
        print(f"    [API] 수집: offset={offset}, 개수={len(review_list)}", flush=True)

        if not has_next:
            break

        offset += limit
        req_count += 1
        time.sleep(API_SLEEP_SEC)

    return reviews


# -----------------------------
# 데이터 처리/저장
# -----------------------------
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


# -----------------------------
# main
# -----------------------------
def main():
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
            print("  건너뜀: 로그인 정보 없음", flush=True)
            if store_name in store_reviews:
                all_stores.append({
                    "store_name": store_name,
                    "shop_id": shop_id,
                    "reviews": store_reviews[store_name],
                    "review_count": len(store_reviews[store_name]),
                    "crawled_at": existing_data.get("generated_at"),
                })
            continue

        driver = None
        try:
            driver = setup_driver()

            ok = login_and_open_review_page(driver, login_id, login_pwd, shop_id)
            if not ok:
                print("  실패: 로그인 불가", flush=True)
                if store_name in store_reviews:
                    all_stores.append({
                        "store_name": store_name,
                        "shop_id": shop_id,
                        "reviews": store_reviews[store_name],
                        "review_count": len(store_reviews[store_name]),
                        "crawled_at": existing_data.get("generated_at"),
                    })
                continue

            # ★ 리뷰페이지 들어온 직후 선캡처(이때 못 잡으면 refresh 후 1회 재시도)
            prime_api_headers(driver, shop_id)

            new_reviews = []
            for from_date, to_date in date_ranges:
                raw = fetch_reviews_api(driver, shop_id, from_date, to_date)
                for r in raw:
                    new_reviews.append(parse_review(r, store_name))

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
                "crawled_at": datetime.now().isoformat(),
            })

        except Exception as e:
            print(f"  오류: {e}", flush=True)
            if store_name in store_reviews:
                all_stores.append({
                    "store_name": store_name,
                    "shop_id": shop_id,
                    "reviews": store_reviews[store_name],
                    "review_count": len(store_reviews[store_name]),
                    "crawled_at": existing_data.get("generated_at"),
                })
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
