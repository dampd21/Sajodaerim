"""
네이버 플레이스 순위 추적 및 대표키워드 수집
- 키워드별 순위 추적
- 업체 상세 정보 (리뷰수, 저장수 등)
- 대표키워드 및 검색량 조회
- 세션 초기화 + HTML 폴백 포함
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


class NaverPlaceTracker:
    def __init__(self):
        self.graphql_url = "https://api.place.naver.com/graphql"
        self.session = requests.Session()
        self.session_initialized = False

        self.base_headers = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            "Content-Type": "application/json",
            "Origin": "https://m.place.naver.com",
            "Referer": "https://m.place.naver.com/",
            "Connection": "keep-alive",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
            "Sec-Ch-Ua-Mobile": "?1",
            "Sec-Ch-Ua-Platform": '"Android"',
        }

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

    def _init_session(self):
        """세션 초기화 - 쿠키 획득"""
        if self.session_initialized:
            return True

        try:
            print("[SESSION] 세션 초기화 중...", flush=True)

            # 1단계: 모바일 플레이스 메인 페이지 방문
            init_headers = {
                "User-Agent": self.base_headers["User-Agent"],
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
            }

            resp = self.session.get(
                "https://m.place.naver.com/",
                headers=init_headers,
                timeout=15,
                allow_redirects=True
            )
            print(f"[SESSION] 메인 페이지: {resp.status_code}", flush=True)
            time.sleep(1)

            # 2단계: 임의의 검색 페이지 방문하여 추가 쿠키 획득
            search_headers = {
                "User-Agent": self.base_headers["User-Agent"],
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Referer": "https://m.place.naver.com/",
                "Connection": "keep-alive",
            }

            resp2 = self.session.get(
                "https://m.place.naver.com/restaurant/list?query=%EC%A7%AC%EB%BD%95",
                headers=search_headers,
                timeout=15,
                allow_redirects=True
            )
            print(f"[SESSION] 검색 페이지: {resp2.status_code}", flush=True)
            time.sleep(1)

            # 3단계: 특정 플레이스 페이지 방문
            place_headers = {
                "User-Agent": self.base_headers["User-Agent"],
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Referer": "https://m.place.naver.com/",
                "Connection": "keep-alive",
            }

            resp3 = self.session.get(
                "https://m.place.naver.com/restaurant/1542530224/home",
                headers=place_headers,
                timeout=15,
                allow_redirects=True
            )
            print(f"[SESSION] 플레이스 페이지: {resp3.status_code}", flush=True)
            time.sleep(1)

            cookies = dict(self.session.cookies)
            print(f"[SESSION] 쿠키 수: {len(cookies)}", flush=True)

            self.session_initialized = True
            return True

        except Exception as e:
            print(f"[SESSION] 세션 초기화 실패: {e}", flush=True)
            return False

    def _make_wtm_header(self, arg, business_type="restaurant"):
        """x-wtm-graphql 헤더 생성"""
        data = {"arg": arg, "type": business_type, "source": "place"}
        return base64.b64encode(json.dumps(data).encode()).decode()

    def _graphql_request(self, payload, wtm_arg, referer=None):
        """GraphQL 요청 (세션 사용, 재시도 포함)"""
        self._init_session()

        headers = {**self.base_headers}
        headers["x-wtm-graphql"] = self._make_wtm_header(wtm_arg)
        if referer:
            headers["Referer"] = referer

        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = self.session.post(
                    self.graphql_url,
                    headers=headers,
                    json=payload,
                    timeout=30
                )

                if response.status_code == 200:
                    return response.json()

                if response.status_code == 400:
                    print(f"  [RETRY {attempt+1}/{max_retries}] 400 에러, 재시도...", flush=True)

                    # 세션 재초기화
                    if attempt < max_retries - 1:
                        self.session_initialized = False
                        self.session = requests.Session()
                        self._init_session()
                        time.sleep(2)
                        continue

                response.raise_for_status()

            except requests.exceptions.HTTPError as e:
                if attempt < max_retries - 1:
                    print(f"  [RETRY {attempt+1}/{max_retries}] HTTP 에러: {e}", flush=True)
                    time.sleep(2)
                    continue
                raise
            except Exception as e:
                if attempt < max_retries - 1:
                    print(f"  [RETRY {attempt+1}/{max_retries}] 오류: {e}", flush=True)
                    time.sleep(2)
                    continue
                raise

        return None

    def search_keyword_ranking(self, keyword, max_results=100):
        """
        키워드로 검색하여 순위 목록 가져오기
        GraphQL 실패 시 HTML 파싱으로 폴백
        """
        # 방법 1: GraphQL API
        result = self._search_via_graphql(keyword, max_results)
        if result and result.get("success"):
            return result

        print(f"  [FALLBACK] HTML 파싱으로 전환 ({keyword})", flush=True)
        time.sleep(1)

        # 방법 2: HTML 파싱 폴백
        result = self._search_via_html(keyword)
        if result and result.get("success"):
            return result

        # 방법 3: 네이버 검색 API 폴백
        print(f"  [FALLBACK] 네이버 검색으로 전환 ({keyword})", flush=True)
        time.sleep(1)
        result = self._search_via_naver_search(keyword)
        if result and result.get("success"):
            return result

        return {"success": False, "total": 0, "items": []}

    def _search_via_graphql(self, keyword, max_results=100):
        """GraphQL API로 검색"""
        # 쿼리 v1: 간단한 버전
        query_v1 = """
        query getRestaurantList($input: RestaurantListInput) {
            restaurants: restaurantList(input: $input) {
                total
                items {
                    id
                    name
                    category
                    roadAddress
                    commonAddress
                    blogCafeReviewCount
                    visitorReviewCount
                    visitorReviewScore
                    saveCount
                }
            }
        }
        """

        payload_v1 = [{
            "operationName": "getRestaurantList",
            "variables": {
                "input": {
                    "query": keyword,
                    "start": 1,
                    "display": max_results,
                    "deviceType": "mobile",
                    "isPcmap": False
                }
            },
            "query": query_v1
        }]

        try:
            data = self._graphql_request(payload_v1, keyword)
            if data:
                items = data[0].get('data', {}).get('restaurants', {}).get('items', [])
                total = data[0].get('data', {}).get('restaurants', {}).get('total', 0)

                if items:
                    return {
                        "success": True,
                        "total": total,
                        "items": items,
                        "method": "graphql_v1"
                    }
        except Exception as e:
            print(f"  [GraphQL v1] 실패: {e}", flush=True)

        # 쿼리 v2: 다른 형식 시도
        query_v2 = """
        query getPlacesList($input: PlacesInput) {
            places: placesList(input: $input) {
                total
                items {
                    id
                    name
                    category
                    roadAddress
                    blogCafeReviewCount
                    visitorReviewCount
                    visitorReviewScore
                    saveCount
                }
            }
        }
        """

        payload_v2 = [{
            "operationName": "getPlacesList",
            "variables": {
                "input": {
                    "query": keyword,
                    "start": 1,
                    "display": max_results,
                    "deviceType": "mobile"
                }
            },
            "query": query_v2
        }]

        try:
            data = self._graphql_request(payload_v2, keyword)
            if data:
                items = data[0].get('data', {}).get('places', {}).get('items', [])
                total = data[0].get('data', {}).get('places', {}).get('total', 0)

                if items:
                    return {
                        "success": True,
                        "total": total,
                        "items": items,
                        "method": "graphql_v2"
                    }
        except Exception as e:
            print(f"  [GraphQL v2] 실패: {e}", flush=True)

        # 쿼리 v3: restaurantFilter 방식
        query_v3 = """
        query getRestaurants($restaurantListInput: RestaurantListInput, $isNmap: Boolean!, $isBounds: Boolean!) {
            restaurants: restaurantList(input: $restaurantListInput) @skip(if: $isNmap) {
                total
                items {
                    id
                    name
                    category
                    roadAddress
                    blogCafeReviewCount
                    visitorReviewCount
                    visitorReviewScore
                    saveCount
                }
            }
        }
        """

        payload_v3 = [{
            "operationName": "getRestaurants",
            "variables": {
                "restaurantListInput": {
                    "query": keyword,
                    "x": "126.9783882",
                    "y": "37.5666103",
                    "start": 1,
                    "display": max_results,
                    "deviceType": "mobile",
                    "isPcmap": False
                },
                "isNmap": False,
                "isBounds": False
            },
            "query": query_v3
        }]

        try:
            data = self._graphql_request(payload_v3, keyword)
            if data:
                items = data[0].get('data', {}).get('restaurants', {}).get('items', [])
                total = data[0].get('data', {}).get('restaurants', {}).get('total', 0)

                if items:
                    return {
                        "success": True,
                        "total": total,
                        "items": items,
                        "method": "graphql_v3"
                    }
        except Exception as e:
            print(f"  [GraphQL v3] 실패: {e}", flush=True)

        return None

    def _search_via_html(self, keyword):
        """HTML 파싱으로 검색 결과 추출"""
        try:
            import urllib.parse
            encoded_keyword = urllib.parse.quote(keyword)

            url = f"https://m.place.naver.com/restaurant/list?query={encoded_keyword}"

            headers = {
                "User-Agent": self.base_headers["User-Agent"],
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9",
                "Referer": "https://m.naver.com/",
            }

            response = self.session.get(url, headers=headers, timeout=15, allow_redirects=True)

            if response.status_code != 200:
                print(f"  [HTML] HTTP {response.status_code}", flush=True)
                return None

            html = response.text

            # __NEXT_DATA__ 에서 JSON 추출
            items = []

            # 방법 1: __NEXT_DATA__ script 태그에서 추출
            next_data_match = re.search(
                r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
                html, re.DOTALL
            )

            if next_data_match:
                try:
                    next_data = json.loads(next_data_match.group(1))
                    # 여러 경로 시도
                    props = next_data.get('props', {}).get('pageProps', {})

                    # 경로 1
                    initial_data = props.get('initialState', {})
                    place_list = initial_data.get('place', {}).get('list', [])

                    if place_list:
                        for item in place_list:
                            items.append({
                                "id": str(item.get('id', '')),
                                "name": item.get('name', ''),
                                "category": item.get('category', ''),
                                "roadAddress": item.get('roadAddress', ''),
                                "blogCafeReviewCount": str(item.get('blogCafeReviewCount', '0')),
                                "visitorReviewCount": str(item.get('visitorReviewCount', '0')),
                                "visitorReviewScore": item.get('visitorReviewScore', 0),
                                "saveCount": str(item.get('saveCount', '0')),
                            })

                    # 경로 2
                    if not items:
                        search_result = props.get('searchResult', {})
                        result_items = search_result.get('result', {}).get('items', [])

                        for item in result_items:
                            items.append({
                                "id": str(item.get('id', '')),
                                "name": item.get('name', ''),
                                "category": item.get('category', ''),
                                "roadAddress": item.get('roadAddress', ''),
                                "blogCafeReviewCount": str(item.get('blogCafeReviewCount', '0')),
                                "visitorReviewCount": str(item.get('visitorReviewCount', '0')),
                                "visitorReviewScore": item.get('visitorReviewScore', 0),
                                "saveCount": str(item.get('saveCount', '0')),
                            })

                except json.JSONDecodeError:
                    print(f"  [HTML] __NEXT_DATA__ JSON 파싱 실패", flush=True)

            # 방법 2: window.__APOLLO_STATE__ 에서 추출
            if not items:
                apollo_match = re.search(
                    r'window\.__APOLLO_STATE__\s*=\s*(\{.*?\});',
                    html, re.DOTALL
                )

                if apollo_match:
                    try:
                        apollo_data = json.loads(apollo_match.group(1))

                        for key, value in apollo_data.items():
                            if isinstance(value, dict) and value.get('__typename') in ['Restaurant', 'Place']:
                                items.append({
                                    "id": str(value.get('id', '')),
                                    "name": value.get('name', ''),
                                    "category": value.get('category', ''),
                                    "roadAddress": value.get('roadAddress', ''),
                                    "blogCafeReviewCount": str(value.get('blogCafeReviewCount', '0')),
                                    "visitorReviewCount": str(value.get('visitorReviewCount', '0')),
                                    "visitorReviewScore": value.get('visitorReviewScore', 0),
                                    "saveCount": str(value.get('saveCount', '0')),
                                })
                    except json.JSONDecodeError:
                        print(f"  [HTML] APOLLO_STATE JSON 파싱 실패", flush=True)

            # 방법 3: 정규식으로 place ID 및 이름 추출
            if not items:
                place_links = re.findall(
                    r'/restaurant/(\d+)/home[^"]*"[^>]*>([^<]+)',
                    html
                )

                for place_id, name in place_links:
                    if place_id and name.strip():
                        items.append({
                            "id": place_id,
                            "name": name.strip(),
                            "category": "",
                            "roadAddress": "",
                            "blogCafeReviewCount": "0",
                            "visitorReviewCount": "0",
                            "visitorReviewScore": 0,
                            "saveCount": "0",
                        })

            if items:
                # 중복 제거
                seen = set()
                unique_items = []
                for item in items:
                    if item["id"] not in seen and item["id"]:
                        seen.add(item["id"])
                        unique_items.append(item)

                print(f"  [HTML] {len(unique_items)}개 업체 발견", flush=True)
                return {
                    "success": True,
                    "total": len(unique_items),
                    "items": unique_items,
                    "method": "html"
                }

            print(f"  [HTML] 검색 결과 없음", flush=True)
            return None

        except Exception as e:
            print(f"  [HTML] 파싱 실패: {e}", flush=True)
            return None

    def _search_via_naver_search(self, keyword):
        """네이버 통합검색 플레이스 영역에서 추출"""
        try:
            import urllib.parse
            encoded_keyword = urllib.parse.quote(keyword)

            url = f"https://m.search.naver.com/search.naver?query={encoded_keyword}&where=nexearch&sm=top_hty&fbm=0"

            headers = {
                "User-Agent": self.base_headers["User-Agent"],
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9",
                "Referer": "https://m.naver.com/",
            }

            response = self.session.get(url, headers=headers, timeout=15, allow_redirects=True)

            if response.status_code != 200:
                return None

            html = response.text
            items = []

            # 네이버 검색 결과에서 플레이스 ID와 이름 추출
            # 패턴 1: data-sid 속성
            sid_matches = re.findall(
                r'data-sid="(\d+)"[^>]*>.*?class="[^"]*tit[^"]*"[^>]*>([^<]+)',
                html, re.DOTALL
            )

            for place_id, name in sid_matches:
                items.append({
                    "id": place_id,
                    "name": name.strip(),
                    "category": "",
                    "roadAddress": "",
                    "blogCafeReviewCount": "0",
                    "visitorReviewCount": "0",
                    "visitorReviewScore": 0,
                    "saveCount": "0",
                })

            # 패턴 2: place.naver.com 링크
            if not items:
                place_matches = re.findall(
                    r'place\.naver\.com/restaurant/(\d+)',
                    html
                )
                name_matches = re.findall(
                    r'class="[^"]*(?:place_bluelink|tit|name)[^"]*"[^>]*>([^<]+)',
                    html
                )

                for i, place_id in enumerate(place_matches):
                    name = name_matches[i] if i < len(name_matches) else f"업체{i+1}"
                    items.append({
                        "id": place_id,
                        "name": name.strip(),
                        "category": "",
                        "roadAddress": "",
                        "blogCafeReviewCount": "0",
                        "visitorReviewCount": "0",
                        "visitorReviewScore": 0,
                        "saveCount": "0",
                    })

            if items:
                seen = set()
                unique_items = []
                for item in items:
                    if item["id"] not in seen:
                        seen.add(item["id"])
                        unique_items.append(item)

                print(f"  [SEARCH] {len(unique_items)}개 업체 발견", flush=True)
                return {
                    "success": True,
                    "total": len(unique_items),
                    "items": unique_items,
                    "method": "naver_search"
                }

            return None

        except Exception as e:
            print(f"  [SEARCH] 검색 실패: {e}", flush=True)
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

    def get_place_detail(self, place_id):
        """
        플레이스 상세 정보 및 대표키워드 조회
        GraphQL 실패 시 HTML 폴백
        """
        # 방법 1: GraphQL
        detail = self._get_detail_via_graphql(place_id)
        if detail and detail.get("success"):
            return detail

        print(f"  [FALLBACK] 상세 HTML 파싱 ({place_id})", flush=True)
        time.sleep(1)

        # 방법 2: HTML 폴백
        detail = self._get_detail_via_html(place_id)
        if detail and detail.get("success"):
            return detail

        return {"success": False}

    def _get_detail_via_graphql(self, place_id):
        """GraphQL로 상세 정보 조회"""
        query = """
        query getRestaurantDetail($input: RestaurantDetailInput) {
            restaurant: restaurantDetail(input: $input) {
                id
                name
                category
                roadAddress
                visitorReviewsTotal
                visitorReviewsScore
                saveCount
                keywords
            }
        }
        """

        payload = [{
            "operationName": "getRestaurantDetail",
            "variables": {
                "input": {
                    "id": place_id,
                    "deviceType": "mobile"
                }
            },
            "query": query
        }]

        try:
            data = self._graphql_request(
                payload,
                place_id,
                referer=f"https://m.place.naver.com/restaurant/{place_id}/home"
            )

            if data:
                restaurant = data[0].get('data', {}).get('restaurant', {})
                if restaurant:
                    return {
                        "success": True,
                        "id": restaurant.get('id'),
                        "name": restaurant.get('name'),
                        "category": restaurant.get('category'),
                        "address": restaurant.get('roadAddress'),
                        "visitor_reviews": restaurant.get('visitorReviewsTotal', 0),
                        "review_score": restaurant.get('visitorReviewsScore', 0),
                        "save_count": restaurant.get('saveCount', '0'),
                        "keywords": restaurant.get('keywords', [])
                    }
        except Exception as e:
            print(f"  [GraphQL Detail] 실패: {e}", flush=True)

        return None

    def _get_detail_via_html(self, place_id):
        """HTML에서 상세 정보 추출"""
        try:
            url = f"https://m.place.naver.com/restaurant/{place_id}/home"

            headers = {
                "User-Agent": self.base_headers["User-Agent"],
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9",
                "Referer": "https://m.place.naver.com/",
            }

            response = self.session.get(url, headers=headers, timeout=15, allow_redirects=True)

            if response.status_code != 200:
                return None

            html = response.text
            result = {
                "success": False,
                "id": place_id,
                "name": "",
                "category": "",
                "address": "",
                "visitor_reviews": 0,
                "review_score": 0,
                "save_count": "0",
                "keywords": []
            }

            # __NEXT_DATA__에서 추출
            next_data_match = re.search(
                r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
                html, re.DOTALL
            )

            if next_data_match:
                try:
                    next_data = json.loads(next_data_match.group(1))
                    props = next_data.get('props', {}).get('pageProps', {})

                    # initialState에서 찾기
                    initial = props.get('initialState', {})
                    place = initial.get('place', {}).get('detail', {})

                    if not place:
                        place = props.get('detail', {})

                    if place:
                        result["name"] = place.get('name', '')
                        result["category"] = place.get('category', '')
                        result["address"] = place.get('roadAddress', '')
                        result["visitor_reviews"] = place.get('visitorReviewsTotal', 0)
                        result["review_score"] = place.get('visitorReviewsScore', 0)
                        result["save_count"] = str(place.get('saveCount', '0'))
                        result["keywords"] = place.get('keywords', [])
                        result["success"] = True

                except json.JSONDecodeError:
                    pass

            # APOLLO_STATE에서 추출
            if not result["success"]:
                apollo_match = re.search(
                    r'window\.__APOLLO_STATE__\s*=\s*(\{.*?\});',
                    html, re.DOTALL
                )

                if apollo_match:
                    try:
                        apollo_data = json.loads(apollo_match.group(1))

                        for key, value in apollo_data.items():
                            if isinstance(value, dict) and str(value.get('id')) == str(place_id):
                                result["name"] = value.get('name', '')
                                result["category"] = value.get('category', '')
                                result["address"] = value.get('roadAddress', '')
                                result["visitor_reviews"] = value.get('visitorReviewsTotal', 0)
                                result["review_score"] = value.get('visitorReviewsScore', 0)
                                result["save_count"] = str(value.get('saveCount', '0'))
                                result["keywords"] = value.get('keywords', [])
                                result["success"] = True
                                break
                    except json.JSONDecodeError:
                        pass

            # 기본 정보라도 HTML 태그에서 추출
            if not result["success"]:
                name_match = re.search(r'<title>([^<]+)</title>', html)
                if name_match:
                    title = name_match.group(1)
                    result["name"] = title.replace(" : 네이버", "").strip()
                    result["success"] = True

            return result

        except Exception as e:
            print(f"  [HTML Detail] 실패: {e}", flush=True)
            return None

    def get_review_stats(self, place_id):
        """
        리뷰 통계 조회
        """
        query = """
        query getVisitorReviewStats($id: String, $businessType: String = "restaurant") {
            visitorReviewStats(input: {businessId: $id, businessType: $businessType}) {
                id
                name
                review {
                    avgRating
                    totalCount
                    imageReviewCount
                    starDistribution { count score }
                }
                analysis {
                    themes { code label count }
                    votedKeyword {
                        details { displayName count }
                    }
                }
                visitorReviewsTotal
                ratingReviewsTotal
            }
        }
        """

        payload = [{
            "operationName": "getVisitorReviewStats",
            "variables": {
                "businessType": "restaurant",
                "id": place_id
            },
            "query": query
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
                    review = stats.get('review', {})
                    analysis = stats.get('analysis', {})
                    voted = analysis.get('votedKeyword', {}).get('details', []) if analysis else []

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

        # 키워드 5개씩 배치 처리
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
            place_id = item.get("id")
            name = item.get("name", "")

            print(f"  [{idx}/{top_n}] {name} 분석 중...", flush=True)

            # 상세 정보 및 대표키워드 조회
            detail = self.get_place_detail(place_id)
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

        # 대표키워드들의 검색량 조회
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

    # 기본 설정
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

    # 기본 설정 파일 저장
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

    # 각 지점별 키워드 순위 추적
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
            time.sleep(1.5)  # 요청 간 딜레이

            if rank_result is not None:
                rank = rank_result.get("rank")
                item = rank_result.get("item", {})
                method = rank_result.get("method", "unknown")

                # 히스토리 키 생성
                history_key = f"{store_name}|{keyword}"

                if history_key not in data["tracking_history"]:
                    data["tracking_history"][history_key] = {
                        "store_name": store_name,
                        "place_id": place_id,
                        "keyword": keyword,
                        "history": []
                    }

                # 오늘 데이터 생성
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

                # 리뷰 통계 추가
                if review_stats.get("success"):
                    today_data["review_stats"] = {
                        "total": review_stats.get("total_reviews", 0),
                        "avg_rating": review_stats.get("avg_rating", 0),
                        "themes": review_stats.get("themes", [])[:5],
                        "voted_keywords": review_stats.get("voted_keywords", [])[:5]
                    }

                # 중복 체크 후 추가
                history = data["tracking_history"][history_key]["history"]
                if not history or history[0].get("date") != today:
                    history.insert(0, today_data)
                    # 최근 90일만 유지
                    data["tracking_history"][history_key]["history"] = history[:90]
                else:
                    # 같은 날 데이터 업데이트
                    history[0] = today_data

                rank_str = f"{rank}위" if rank else "100위 밖"
                print(f"    -> {rank_str} ({method})", flush=True)
                success_count += 1
            else:
                print(f"    -> 조회 실패", flush=True)
                fail_count += 1

    # 저장
    data["generated_at"] = datetime.now().isoformat()
    save_data(data)

    print("", flush=True)
    print("=" * 60, flush=True)
    print(f"순위 추적 완료! (성공: {success_count}, 실패: {fail_count})", flush=True)
    print("=" * 60, flush=True)


if __name__ == "__main__":
    run_daily_tracking()
