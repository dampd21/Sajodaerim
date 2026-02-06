"""
네이버 플레이스 순위 추적 및 대표키워드 수집
- Selenium으로 세션/쿠키 획득 후 GraphQL API 호출
- 키워드별 순위 추적
- 업체 상세 정보 (리뷰수, 저장수 등)
- 대표키워드 및 검색량 조회
"""

import requests
import json
import base64
import os
import re
import time
import hashlib
import hmac as hmac_module
from datetime import datetime, timedelta
from pathlib import Path

# Selenium
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class NaverPlaceTracker:
    def __init__(self):
        self.graphql_url = "https://api.place.naver.com/graphql"
        self.session = requests.Session()
        self.cookies_ready = False
        self.driver = None

        # 지점별 Place ID
        self.store_places = {
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

    def _init_browser(self):
        """Selenium 브라우저 초기화 및 쿠키 획득"""
        if self.cookies_ready:
            return True

        print("[BROWSER] Selenium 브라우저 초기화 중...", flush=True)

        try:
            chrome_options = Options()
            chrome_options.add_argument("--headless=new")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--window-size=1920,1080")
            chrome_options.add_argument(
                "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            )
            chrome_options.add_argument("--lang=ko-KR")
            chrome_options.add_argument("--disable-blink-features=AutomationControlled")
            chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])

            # GitHub Actions 환경
            chrome_binary = os.environ.get("CHROME_BIN")
            if chrome_binary:
                chrome_options.binary_location = chrome_binary

            chromedriver_path = os.environ.get("CHROMEDRIVER_PATH")
            if chromedriver_path:
                service = Service(chromedriver_path)
            else:
                try:
                    from webdriver_manager.chrome import ChromeDriverManager
                    service = Service(ChromeDriverManager().install())
                except Exception:
                    service = Service()

            self.driver = webdriver.Chrome(service=service, options=chrome_options)
            self.driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
                "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            })

            # 1단계: 네이버 플레이스 검색 페이지 방문
            print("[BROWSER] 네이버 플레이스 페이지 로딩...", flush=True)
            self.driver.get("https://m.place.naver.com/restaurant/list?query=%EC%A7%AC%EB%BD%95")
            time.sleep(3)

            # 2단계: 특정 플레이스 페이지 방문 (추가 쿠키 획득)
            print("[BROWSER] 플레이스 상세 페이지 로딩...", flush=True)
            self.driver.get("https://m.place.naver.com/restaurant/1542530224/home")
            time.sleep(3)

            # 3단계: 브라우저 쿠키를 requests 세션으로 복사
            browser_cookies = self.driver.get_cookies()
            print(f"[BROWSER] 브라우저 쿠키 수: {len(browser_cookies)}", flush=True)

            for cookie in browser_cookies:
                self.session.cookies.set(
                    cookie['name'],
                    cookie['value'],
                    domain=cookie.get('domain', ''),
                    path=cookie.get('path', '/')
                )

            cookie_names = [c['name'] for c in browser_cookies]
            print(f"[BROWSER] 쿠키 목록: {', '.join(cookie_names[:10])}", flush=True)

            self.cookies_ready = True
            print("[BROWSER] 쿠키 획득 완료!", flush=True)
            return True

        except Exception as e:
            print(f"[BROWSER] 초기화 실패: {e}", flush=True)
            return False

    def _close_browser(self):
        """브라우저 종료"""
        if self.driver:
            try:
                self.driver.quit()
            except Exception:
                pass
            self.driver = None

    def _get_graphql_headers(self, wtm_arg, referer=None):
        """GraphQL 요청 헤더 생성"""
        headers = {
            "Content-Type": "application/json",
            "Accept": "*/*",
            "Accept-Language": "ko",
            "Origin": "https://m.place.naver.com",
            "Referer": referer or "https://m.place.naver.com/",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
        }

        # x-wtm-graphql 헤더 (없어도 되는 경우 있지만 포함)
        if wtm_arg:
            wtm_data = {"arg": wtm_arg, "type": "restaurant", "source": "place"}
            headers["x-wtm-graphql"] = base64.b64encode(
                json.dumps(wtm_data).encode()
            ).decode()

        return headers

    def _graphql_request(self, payload, wtm_arg=None, referer=None):
        """GraphQL API 요청 (세션 쿠키 사용)"""
        if not self.cookies_ready:
            self._init_browser()

        headers = self._get_graphql_headers(wtm_arg, referer)

        try:
            response = self.session.post(
                self.graphql_url,
                headers=headers,
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                return response.json()

            # 400/403 에러 시 쿠키 재획득 시도
            if response.status_code in [400, 403]:
                print(f"  [GraphQL] HTTP {response.status_code}, 쿠키 재획득 시도...", flush=True)

                # 응답 내용 로깅 (디버깅용)
                try:
                    resp_text = response.text[:200]
                    print(f"  [GraphQL] 응답: {resp_text}", flush=True)
                except Exception:
                    pass

                self.cookies_ready = False
                self._close_browser()
                time.sleep(2)

                if self._init_browser():
                    headers = self._get_graphql_headers(wtm_arg, referer)
                    response = self.session.post(
                        self.graphql_url,
                        headers=headers,
                        json=payload,
                        timeout=30
                    )
                    if response.status_code == 200:
                        return response.json()

                print(f"  [GraphQL] 재시도 후에도 실패: HTTP {response.status_code}", flush=True)
                return None

            response.raise_for_status()

        except requests.exceptions.HTTPError as e:
            print(f"  [GraphQL] HTTP 오류: {e}", flush=True)
            return None
        except Exception as e:
            print(f"  [GraphQL] 요청 오류: {e}", flush=True)
            return None

        return None

    def _execute_in_browser(self, keyword, max_results=100):
        """
        Selenium 브라우저 내에서 직접 GraphQL 호출 (최후의 수단)
        브라우저 콘솔에서 실행하는 것과 동일한 방식
        """
        if not self.driver:
            if not self._init_browser():
                return None

        print(f"  [BROWSER-EXEC] 브라우저 내 직접 실행: {keyword}", flush=True)

        # JavaScript 코드를 브라우저에서 직접 실행
        js_code = """
        return new Promise((resolve, reject) => {
            const searchQuery = arguments[0];
            const maxResults = arguments[1];

            fetch('https://api.place.naver.com/graphql', {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'accept-language': 'ko',
                    'content-type': 'application/json',
                    'origin': 'https://m.place.naver.com',
                    'referer': 'https://m.place.naver.com/'
                },
                body: JSON.stringify([{
                    "operationName": "getRestaurantList",
                    "variables": {
                        "restaurantListInput": {
                            "query": searchQuery,
                            "x": "126.9783882",
                            "y": "37.5666103",
                            "start": 1,
                            "display": maxResults,
                            "isNmap": false,
                            "deviceType": "pc"
                        }
                    },
                    "query": `query getRestaurantList($restaurantListInput: RestaurantListInput) {
                        restaurants: restaurantList(input: $restaurantListInput) {
                            items {
                                id
                                name
                                category
                                roadAddress
                                phone
                                totalReviewCount
                                blogCafeReviewCount
                                visitorReviewCount
                                visitorReviewScore
                                saveCount
                            }
                            total
                        }
                    }`
                }])
            })
            .then(r => r.json())
            .then(data => {
                resolve(JSON.stringify(data));
            })
            .catch(e => {
                reject(e.message);
            });
        });
        """

        try:
            # 네이버 플레이스 도메인에서 실행해야 CORS 통과
            current_url = self.driver.current_url
            if "place.naver.com" not in current_url:
                self.driver.get("https://m.place.naver.com/restaurant/list?query=" + keyword)
                time.sleep(2)

            result = self.driver.execute_async_script(js_code, keyword, max_results)
            data = json.loads(result)

            items = data[0].get('data', {}).get('restaurants', {}).get('items', [])
            total = data[0].get('data', {}).get('restaurants', {}).get('total', 0)

            if items:
                print(f"  [BROWSER-EXEC] {len(items)}개 결과 (총 {total}개)", flush=True)
                return {
                    "success": True,
                    "total": total,
                    "items": items,
                    "method": "browser_exec"
                }
            else:
                print(f"  [BROWSER-EXEC] 결과 없음", flush=True)
                return None

        except Exception as e:
            print(f"  [BROWSER-EXEC] 실행 실패: {e}", flush=True)
            return None

    def search_keyword_ranking(self, keyword, max_results=100):
        """
        키워드로 검색하여 순위 목록 가져오기
        1차: requests + 쿠키 (GraphQL)
        2차: Selenium 브라우저 내 직접 실행
        """
        # 방법 1: GraphQL API (requests + 쿠키)
        result = self._search_via_graphql(keyword, max_results)
        if result and result.get("success"):
            return result

        time.sleep(1)

        # 방법 2: 브라우저 내 직접 JavaScript 실행 (콘솔과 동일)
        result = self._execute_in_browser(keyword, max_results)
        if result and result.get("success"):
            return result

        return {"success": False, "total": 0, "items": []}

    def _search_via_graphql(self, keyword, max_results=100):
        """GraphQL API로 검색 (브라우저 콘솔 코드와 동일한 형식)"""

        # 브라우저 콘솔에서 성공한 것과 완전히 동일한 payload
        payload = [{
            "operationName": "getRestaurantList",
            "variables": {
                "restaurantListInput": {
                    "query": keyword,
                    "x": "126.9783882",
                    "y": "37.5666103",
                    "start": 1,
                    "display": max_results,
                    "isNmap": False,
                    "deviceType": "pc"
                }
            },
            "query": (
                "query getRestaurantList($restaurantListInput: RestaurantListInput) {\n"
                "  restaurants: restaurantList(input: $restaurantListInput) {\n"
                "    items {\n"
                "      id\n"
                "      name\n"
                "      category\n"
                "      roadAddress\n"
                "      phone\n"
                "      totalReviewCount\n"
                "      blogCafeReviewCount\n"
                "      visitorReviewCount\n"
                "      visitorReviewScore\n"
                "      saveCount\n"
                "    }\n"
                "    total\n"
                "  }\n"
                "}\n"
            )
        }]

        try:
            data = self._graphql_request(payload, keyword)
            if data:
                items = data[0].get('data', {}).get('restaurants', {}).get('items', [])
                total = data[0].get('data', {}).get('restaurants', {}).get('total', 0)

                if items:
                    print(f"  [GraphQL] {len(items)}개 결과 (총 {total}개)", flush=True)
                    return {
                        "success": True,
                        "total": total,
                        "items": items,
                        "method": "graphql"
                    }
        except Exception as e:
            print(f"  [GraphQL] 실패: {e}", flush=True)

        return None

    def find_store_rank(self, keyword, place_id):
        """
        특정 키워드에서 특정 업체의 순위 찾기
        """
        result = self.search_keyword_ranking(keyword, max_results=100)

        if not result["success"]:
            return None

        for idx, item in enumerate(result["items"], 1):
            item_id = str(item.get("id", ""))
            if item_id == str(place_id):
                return {
                    "rank": idx,
                    "total": result["total"],
                    "item": item,
                    "method": result.get("method", "unknown")
                }

        # 100위 내에 없음
        return {
            "rank": None,
            "total": result["total"],
            "item": None,
            "method": result.get("method", "unknown")
        }

    def get_place_detail_via_browser(self, place_id):
        """
        Selenium 브라우저에서 플레이스 상세 페이지 방문하여 정보 추출
        """
        if not self.driver:
            if not self._init_browser():
                return {"success": False}

        try:
            url = f"https://m.place.naver.com/restaurant/{place_id}/home"
            self.driver.get(url)
            time.sleep(3)

            # __NEXT_DATA__에서 추출
            try:
                next_data_el = self.driver.find_element(By.ID, "__NEXT_DATA__")
                next_data = json.loads(next_data_el.get_attribute("textContent"))

                props = next_data.get('props', {}).get('pageProps', {})
                initial = props.get('initialState', {})

                # 여러 경로 시도
                place = None

                # 경로 1: place.detail
                place_data = initial.get('place', {})
                if isinstance(place_data, dict):
                    place = place_data.get('detail', {})

                # 경로 2: props 직접
                if not place:
                    place = props.get('detail', {})

                # 경로 3: initialState 직접
                if not place:
                    for key, val in initial.items():
                        if isinstance(val, dict) and val.get('id') == place_id:
                            place = val
                            break

                if place and isinstance(place, dict):
                    return {
                        "success": True,
                        "id": place.get('id', place_id),
                        "name": place.get('name', ''),
                        "category": place.get('category', ''),
                        "address": place.get('roadAddress', ''),
                        "visitor_reviews": place.get('visitorReviewsTotal', 0),
                        "review_score": place.get('visitorReviewsScore', 0),
                        "save_count": str(place.get('saveCount', '0')),
                        "keywords": place.get('keywords', [])
                    }
            except Exception as e:
                print(f"  [Detail-NEXT_DATA] 파싱 실패: {e}", flush=True)

            # JavaScript로 페이지 정보 추출
            try:
                page_data = self.driver.execute_script("""
                    try {
                        var data = window.__APOLLO_STATE__ || {};
                        var keys = Object.keys(data);
                        for (var i = 0; i < keys.length; i++) {
                            var val = data[keys[i]];
                            if (val && val.__typename === 'RestaurantBase') {
                                return JSON.stringify(val);
                            }
                        }
                    } catch(e) {}
                    return null;
                """)

                if page_data:
                    info = json.loads(page_data)
                    return {
                        "success": True,
                        "id": info.get('id', place_id),
                        "name": info.get('name', ''),
                        "category": info.get('category', ''),
                        "address": info.get('roadAddress', ''),
                        "visitor_reviews": info.get('visitorReviewsTotal', 0),
                        "review_score": info.get('visitorReviewsScore', 0),
                        "save_count": str(info.get('saveCount', '0')),
                        "keywords": info.get('keywords', [])
                    }
            except Exception as e:
                print(f"  [Detail-APOLLO] 파싱 실패: {e}", flush=True)

            # 기본 정보 추출 (제목만이라도)
            try:
                title = self.driver.title
                name = title.replace(" : 네이버", "").replace(" - 네이버", "").strip()
                return {
                    "success": True,
                    "id": place_id,
                    "name": name,
                    "category": "",
                    "address": "",
                    "visitor_reviews": 0,
                    "review_score": 0,
                    "save_count": "0",
                    "keywords": []
                }
            except Exception:
                pass

        except Exception as e:
            print(f"  [Detail] 실패: {e}", flush=True)

        return {"success": False}

    def get_review_stats(self, place_id):
        """
        리뷰 통계 조회 (GraphQL)
        """
        payload = [{
            "operationName": "getVisitorReviewStats",
            "variables": {
                "businessType": "restaurant",
                "id": place_id
            },
            "query": (
                "query getVisitorReviewStats($id: String, $businessType: String = \"restaurant\") {\n"
                "  visitorReviewStats(input: {businessId: $id, businessType: $businessType}) {\n"
                "    id\n"
                "    name\n"
                "    review {\n"
                "      avgRating\n"
                "      totalCount\n"
                "      imageReviewCount\n"
                "      starDistribution { count score }\n"
                "    }\n"
                "    analysis {\n"
                "      themes { code label count }\n"
                "      votedKeyword {\n"
                "        details { displayName count }\n"
                "      }\n"
                "    }\n"
                "    visitorReviewsTotal\n"
                "    ratingReviewsTotal\n"
                "  }\n"
                "}\n"
            )
        }]

        try:
            data = self._graphql_request(
                payload,
                place_id,
                referer=f"https://m.place.naver.com/restaurant/{place_id}/review/visitor"
            )

            if data:
                stats = data[0].get('data', {}).get('visitorReviewStats', {})
                if stats:
                    review = stats.get('review', {}) or {}
                    analysis = stats.get('analysis', {}) or {}
                    voted = []
                    if analysis.get('votedKeyword'):
                        voted = analysis['votedKeyword'].get('details', [])

                    return {
                        "success": True,
                        "avg_rating": review.get('avgRating', 0),
                        "total_reviews": review.get('totalCount', 0),
                        "image_reviews": review.get('imageReviewCount', 0),
                        "star_distribution": review.get('starDistribution', []),
                        "themes": analysis.get('themes', []) if analysis else [],
                        "voted_keywords": voted[:10]
                    }
        except Exception as e:
            print(f"  [ReviewStats] 실패 ({place_id}): {e}", flush=True)

        return {"success": False}

    def get_keyword_search_volume(self, keywords):
        """
        네이버 광고 API로 키워드 검색량 조회
        """
        api_key = os.environ.get('NAVER_AD_API_KEY')
        secret_key = os.environ.get('NAVER_AD_SECRET_KEY')
        customer_id = os.environ.get('NAVER_AD_CUSTOMER_ID')

        if not all([api_key, secret_key, customer_id]):
            print("[WARN] 네이버 광고 API 키 없음, 검색량 조회 건너뜀", flush=True)
            return {}

        timestamp = str(int(time.time() * 1000))
        method = "GET"
        path = "/keywordstool"

        sign_str = f"{timestamp}.{method}.{path}"
        signature = hmac_module.new(
            secret_key.encode(),
            sign_str.encode(),
            hashlib.sha256
        ).digest()
        signature = base64.b64encode(signature).decode()

        headers = {
            "X-API-KEY": api_key,
            "X-Customer": customer_id,
            "X-Timestamp": timestamp,
            "X-Signature": signature
        }

        result = {}

        for i in range(0, len(keywords), 5):
            batch = keywords[i:i+5]
            params = {
                "hintKeywords": ",".join(batch),
                "showDetail": "1"
            }

            try:
                response = requests.get(
                    f"https://api.searchad.naver.com{path}",
                    headers=headers,
                    params=params,
                    timeout=30
                )
                response.raise_for_status()
                data = response.json()

                for item in data.get('keywordList', []):
                    kw = item.get('relKeyword', '')
                    pc = item.get('monthlyPcQcCnt', 0)
                    mobile = item.get('monthlyMobileQcCnt', 0)

                    if isinstance(pc, str):
                        pc = 10 if '<' in pc else int(pc.replace(',', ''))
                    if isinstance(mobile, str):
                        mobile = 10 if '<' in mobile else int(mobile.replace(',', ''))

                    result[kw] = {
                        "pc": pc,
                        "mobile": mobile,
                        "total": pc + mobile,
                        "comp": item.get('compIdx', '')
                    }

                time.sleep(0.5)

            except Exception as e:
                print(f"[ERROR] 검색량 조회 실패: {e}", flush=True)

        return result

    def analyze_competitors(self, keyword, top_n=10):
        """
        키워드 검색 상위 N개 업체의 대표키워드 분석
        """
        result = self.search_keyword_ranking(keyword, max_results=top_n)

        if not result["success"]:
            return {"success": False, "error": "검색 실패"}

        competitors = []
        all_keywords = set()

        for idx, item in enumerate(result["items"][:top_n], 1):
            place_id = str(item.get("id"))
            name = item.get("name", "")

            print(f"  [{idx}/{top_n}] {name} 분석 중...", flush=True)

            detail = self.get_place_detail_via_browser(place_id)
            time.sleep(1)

            if detail.get("success"):
                keywords = detail.get("keywords", [])
                all_keywords.update(keywords)

                competitors.append({
                    "rank": idx,
                    "place_id": place_id,
                    "name": name,
                    "category": item.get("category", ""),
                    "blog_reviews": str(item.get("blogCafeReviewCount", "0")),
                    "visitor_reviews": str(item.get("visitorReviewCount", "0")),
                    "save_count": str(item.get("saveCount", "0")),
                    "score": item.get("visitorReviewScore", 0),
                    "keywords": keywords
                })
            else:
                competitors.append({
                    "rank": idx,
                    "place_id": place_id,
                    "name": name,
                    "category": item.get("category", ""),
                    "blog_reviews": str(item.get("blogCafeReviewCount", "0")),
                    "visitor_reviews": str(item.get("visitorReviewCount", "0")),
                    "save_count": str(item.get("saveCount", "0")),
                    "score": item.get("visitorReviewScore", 0),
                    "keywords": []
                })

        keyword_volumes = {}
        if all_keywords:
            print(f"  검색량 조회 중... ({len(all_keywords)}개 키워드)", flush=True)
            keyword_volumes = self.get_keyword_search_volume(list(all_keywords))

        return {
            "success": True,
            "keyword": keyword,
            "analyzed_at": datetime.now().isoformat(),
            "total_results": result["total"],
            "competitors": competitors,
            "keyword_volumes": keyword_volumes
        }


def load_tracking_config():
    """추적 설정 로드"""
    config_path = Path("docs/marketing_config.json")

    if config_path.exists():
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    default_config = {
        "tracking_keywords": {
            "역대짬뽕 본점": ["수원 짬뽕", "장안구 중국집", "수원역 짬뽕"],
            "역대짬뽕 병점점": ["병점 짬뽕", "화성 중국집"],
            "역대짬뽕 송파점": ["송파 짬뽕", "문정동 중국집", "장지역 짬뽕"],
            "역대짬뽕 다산1호점": ["다산 짬뽕", "다산신도시 중국집"],
            "역대짬뽕 화성반월점": ["반월 짬뽕", "화성 중국집"],
            "역대짬뽕 오산시청점": ["오산 짬뽕", "오산 중국집"],
            "역대짬뽕 두정점": ["두정동 짬뽕", "천안 중국집"],
            "역대짬뽕 송탄점": ["송탄 짬뽕", "평택 중국집"],
            "역대짬뽕 여수국동점": ["여수 짬뽕", "여수 중국집"]
        }
    }

    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(default_config, f, ensure_ascii=False, indent=2)

    return default_config


def load_existing_data():
    """기존 데이터 로드"""
    data_path = Path("docs/marketing_data.json")

    if data_path.exists():
        with open(data_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    return {
        "generated_at": None,
        "tracking_history": {},
        "competitor_analysis": {}
    }


def save_data(data):
    """데이터 저장"""
    data_path = Path("docs/marketing_data.json")
    data_path.parent.mkdir(parents=True, exist_ok=True)

    with open(data_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"[OK] 데이터 저장 완료: {data_path}", flush=True)


def run_daily_tracking():
    """일일 순위 추적 실행"""
    print("=" * 60, flush=True)
    print("네이버 플레이스 순위 추적 시작", flush=True)
    print("=" * 60, flush=True)

    tracker = NaverPlaceTracker()
    config = load_tracking_config()
    data = load_existing_data()

    today = datetime.now().strftime("%Y-%m-%d")
    weekday = ["월", "화", "수", "목", "금", "토", "일"][datetime.now().weekday()]

    print(f"날짜: {today} ({weekday})", flush=True)
    print("", flush=True)

    success_count = 0
    fail_count = 0

    try:
        for store_name, place_id in tracker.store_places.items():
            keywords = config.get("tracking_keywords", {}).get(store_name, [])

            if not keywords:
                continue

            print(f"[{store_name}] 추적 중...", flush=True)

            # 리뷰 통계 조회 (지점당 1회)
            review_stats = tracker.get_review_stats(place_id)
            time.sleep(1)

            for keyword in keywords:
                print(f"  키워드: {keyword}", flush=True)

                # 순위 찾기
                rank_result = tracker.find_store_rank(keyword, place_id)
                time.sleep(2)

                if rank_result is not None:
                    rank = rank_result.get("rank")
                    item = rank_result.get("item", {})
                    method = rank_result.get("method", "unknown")

                    history_key = f"{store_name}|{keyword}"

                    if history_key not in data["tracking_history"]:
                        data["tracking_history"][history_key] = {
                            "store_name": store_name,
                            "place_id": place_id,
                            "keyword": keyword,
                            "history": []
                        }

                    today_data = {
                        "date": today,
                        "weekday": weekday,
                        "rank": rank,
                        "blog_reviews": str(item.get("blogCafeReviewCount", "0")) if item else "0",
                        "visitor_reviews": str(item.get("visitorReviewCount", "0")) if item else "0",
                        "save_count": str(item.get("saveCount", "0")) if item else "0",
                        "score": item.get("visitorReviewScore", 0) if item else 0,
                        "method": method
                    }

                    if review_stats.get("success"):
                        today_data["review_stats"] = {
                            "total": review_stats.get("total_reviews", 0),
                            "avg_rating": review_stats.get("avg_rating", 0),
                            "themes": review_stats.get("themes", [])[:5],
                            "voted_keywords": review_stats.get("voted_keywords", [])[:5]
                        }

                    history = data["tracking_history"][history_key]["history"]
                    if not history or history[0].get("date") != today:
                        history.insert(0, today_data)
                        data["tracking_history"][history_key]["history"] = history[:90]
                    else:
                        history[0] = today_data

                    rank_str = f"{rank}위" if rank else "100위 밖"
                    print(f"    -> {rank_str} ({method})", flush=True)
                    success_count += 1
                else:
                    print(f"    -> 조회 실패", flush=True)
                    fail_count += 1

    finally:
        # 브라우저 종료
        tracker._close_browser()

    # 저장
    data["generated_at"] = datetime.now().isoformat()
    save_data(data)

    print("", flush=True)
    print("=" * 60, flush=True)
    print(f"순위 추적 완료! (성공: {success_count}, 실패: {fail_count})", flush=True)
    print("=" * 60, flush=True)


if __name__ == "__main__":
    run_daily_tracking()
