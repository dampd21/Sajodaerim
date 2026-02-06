"""
네이버 플레이스 순위 추적 및 대표키워드 수집
- 키워드별 순위 추적
- 업체 상세 정보 (리뷰수, 저장수 등)
- 대표키워드 및 검색량 조회
"""

import requests
import json
import base64
import os
from datetime import datetime, timedelta
from pathlib import Path

class NaverPlaceTracker:
    def __init__(self):
        self.graphql_url = "https://api.place.naver.com/graphql"
        self.base_headers = {
            "Content-Type": "application/json",
            "Accept": "*/*",
            "Accept-Language": "ko",
            "Origin": "https://m.place.naver.com",
            "Referer": "https://m.place.naver.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
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
    
    def _make_wtm_header(self, arg, business_type="restaurant"):
        """x-wtm-graphql 헤더 생성"""
        data = {"arg": arg, "type": business_type, "source": "place"}
        return base64.b64encode(json.dumps(data).encode()).decode()
    
    def search_keyword_ranking(self, keyword, max_results=100):
        """
        키워드로 검색하여 순위 목록 가져오기
        """
        headers = {**self.base_headers}
        headers["x-wtm-graphql"] = self._make_wtm_header(keyword)
        
        query = """
        query getRestaurantList($restaurantListInput: RestaurantListInput, $isNmap: Boolean!, $isBounds: Boolean!) {
            restaurants: restaurantList(input: $restaurantListInput) {
                total
                items {
                    id
                    name
                    category
                    roadAddress
                    commonAddress
                    imageCount
                    blogCafeReviewCount
                    visitorReviewCount
                    visitorReviewScore
                    saveCount
                    bookingReviewCount
                    microReview
                }
            }
        }
        """
        
        payload = [{
            "operationName": "getRestaurantList",
            "variables": {
                "restaurantListInput": {
                    "query": keyword,
                    "x": "126.9783882",
                    "y": "37.5666103",
                    "start": 1,
                    "display": max_results,
                    "deviceType": "pc"
                },
                "isNmap": False,
                "isBounds": False
            },
            "query": query
        }]
        
        try:
            response = requests.post(self.graphql_url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            items = data[0].get('data', {}).get('restaurants', {}).get('items', [])
            total = data[0].get('data', {}).get('restaurants', {}).get('total', 0)
            
            return {
                "success": True,
                "total": total,
                "items": items
            }
        except Exception as e:
            print(f"[ERROR] 검색 실패 ({keyword}): {e}", flush=True)
            return {"success": False, "total": 0, "items": []}
    
    def find_store_rank(self, keyword, place_id):
        """
        특정 키워드에서 특정 업체의 순위 찾기
        """
        result = self.search_keyword_ranking(keyword, max_results=100)
        
        if not result["success"]:
            return None
        
        for idx, item in enumerate(result["items"], 1):
            if item.get("id") == place_id:
                return {
                    "rank": idx,
                    "total": result["total"],
                    "item": item
                }
        
        # 100위 내에 없음
        return {
            "rank": None,
            "total": result["total"],
            "item": None
        }
    
    def get_place_detail(self, place_id):
        """
        플레이스 상세 정보 및 대표키워드 조회
        """
        headers = {**self.base_headers}
        headers["x-wtm-graphql"] = self._make_wtm_header(place_id)
        headers["Referer"] = f"https://m.place.naver.com/restaurant/{place_id}"
        
        query = """
        query getDetail($id: String!, $deviceType: String) {
            business: placeDetail(input: {id: $id, deviceType: $deviceType}) {
                base {
                    id
                    name
                    category
                    roadAddress
                    visitorReviewsTotal
                    visitorReviewsScore
                    saveCount
                    microReviews
                }
                informationTab(providerSource: [pbp]) {
                    keywordList
                }
            }
        }
        """
        
        payload = [{
            "operationName": "getDetail",
            "variables": {
                "id": place_id,
                "deviceType": "pc"
            },
            "query": query
        }]
        
        try:
            response = requests.post(self.graphql_url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            business = data[0].get('data', {}).get('business', {})
            base = business.get('base', {})
            info_tab = business.get('informationTab', {})
            
            return {
                "success": True,
                "id": base.get('id'),
                "name": base.get('name'),
                "category": base.get('category'),
                "address": base.get('roadAddress'),
                "visitor_reviews": base.get('visitorReviewsTotal', 0),
                "review_score": base.get('visitorReviewsScore', 0),
                "save_count": base.get('saveCount', '0'),
                "keywords": info_tab.get('keywordList', []) if info_tab else []
            }
        except Exception as e:
            print(f"[ERROR] 상세 조회 실패 ({place_id}): {e}", flush=True)
            return {"success": False}
    
    def get_review_stats(self, place_id):
        """
        리뷰 통계 조회 (블로그 리뷰수, 방문자 리뷰수 등)
        """
        headers = {**self.base_headers}
        headers["x-wtm-graphql"] = self._make_wtm_header(place_id)
        headers["Referer"] = f"https://m.place.naver.com/restaurant/{place_id}"
        
        query = """
        query getVisitorReviewStats($id: String, $businessType: String = "place") {
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
            response = requests.post(self.graphql_url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            stats = data[0].get('data', {}).get('visitorReviewStats', {})
            review = stats.get('review', {})
            analysis = stats.get('analysis', {})
            
            # 긍정/부정 키워드 분석 (간단히)
            voted = analysis.get('votedKeyword', {}).get('details', [])
            
            return {
                "success": True,
                "avg_rating": review.get('avgRating', 0),
                "total_reviews": review.get('totalCount', 0),
                "image_reviews": review.get('imageReviewCount', 0),
                "star_distribution": review.get('starDistribution', []),
                "themes": analysis.get('themes', []),
                "voted_keywords": voted[:10]  # 상위 10개
            }
        except Exception as e:
            print(f"[ERROR] 리뷰 통계 조회 실패 ({place_id}): {e}", flush=True)
            return {"success": False}
    
    def get_keyword_search_volume(self, keywords):
        """
        네이버 광고 API로 키워드 검색량 조회
        (환경변수에 API 키가 있어야 함)
        """
        api_key = os.environ.get('NAVER_AD_API_KEY')
        secret_key = os.environ.get('NAVER_AD_SECRET_KEY')
        customer_id = os.environ.get('NAVER_AD_CUSTOMER_ID')
        
        if not all([api_key, secret_key, customer_id]):
            print("[WARN] 네이버 광고 API 키 없음, 검색량 조회 건너뜀", flush=True)
            return {}
        
        import hmac
        import hashlib
        import time
        
        timestamp = str(int(time.time() * 1000))
        method = "GET"
        path = "/keywordstool"
        
        sign_str = f"{timestamp}.{method}.{path}"
        signature = hmac.new(
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
                    
                    # "< 10" 같은 문자열 처리
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
            
            if detail.get("success"):
                keywords = detail.get("keywords", [])
                all_keywords.update(keywords)
                
                competitors.append({
                    "rank": idx,
                    "place_id": place_id,
                    "name": name,
                    "category": item.get("category", ""),
                    "blog_reviews": item.get("blogCafeReviewCount", "0"),
                    "visitor_reviews": item.get("visitorReviewCount", "0"),
                    "save_count": item.get("saveCount", "0"),
                    "score": item.get("visitorReviewScore", 0),
                    "keywords": keywords
                })
            else:
                competitors.append({
                    "rank": idx,
                    "place_id": place_id,
                    "name": name,
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
    return {
        "tracking_keywords": {
            "역대짬뽕 본점": ["수원 짬뽕", "장안구 중국집"],
            "역대짬뽕 송파점": ["송파 짬뽕", "문정동 중국집"],
            "역대짬뽕 병점점": ["병점 짬뽕", "화성 중국집"],
            "역대짬뽕 오산시청점": ["오산 짬뽕", "오산 중국집"],
            "역대짬뽕 다산1호점": ["다산 짬뽕", "다산신도시 중국집"],
            "역대짬뽕 화성반월점": ["반월 짬뽕", "화성 중국집"],
            "역대짬뽕 두정점": ["두정동 짬뽕", "천안 중국집"],
            "역대짬뽕 송탄점": ["송탄 짬뽕", "평택 중국집"],
            "역대짬뽕 여수국동점": ["여수 짬뽕", "여수 중국집"]
        }
    }


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
    
    # 각 지점별 키워드 순위 추적
    for store_name, place_id in tracker.store_places.items():
        keywords = config.get("tracking_keywords", {}).get(store_name, [])
        
        if not keywords:
            continue
        
        print(f"[{store_name}] 추적 중...", flush=True)
        
        # 리뷰 통계 조회
        review_stats = tracker.get_review_stats(place_id)
        
        for keyword in keywords:
            print(f"  키워드: {keyword}", flush=True)
            
            # 순위 찾기
            rank_result = tracker.find_store_rank(keyword, place_id)
            
            if rank_result:
                rank = rank_result.get("rank")
                item = rank_result.get("item", {})
                
                # 히스토리 키 생성
                history_key = f"{store_name}|{keyword}"
                
                if history_key not in data["tracking_history"]:
                    data["tracking_history"][history_key] = {
                        "store_name": store_name,
                        "place_id": place_id,
                        "keyword": keyword,
                        "history": []
                    }
                
                # 오늘 데이터 추가
                today_data = {
                    "date": today,
                    "weekday": weekday,
                    "rank": rank,
                    "blog_reviews": item.get("blogCafeReviewCount", "0") if item else "0",
                    "visitor_reviews": item.get("visitorReviewCount", "0") if item else "0",
                    "save_count": item.get("saveCount", "0") if item else "0",
                    "score": item.get("visitorReviewScore", 0) if item else 0
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
                
                rank_str = f"{rank}위" if rank else "100위 밖"
                print(f"    -> {rank_str}", flush=True)
            else:
                print(f"    -> 조회 실패", flush=True)
    
    # 저장
    data["generated_at"] = datetime.now().isoformat()
    save_data(data)
    
    print("", flush=True)
    print("=" * 60, flush=True)
    print("순위 추적 완료!", flush=True)
    print("=" * 60, flush=True)


if __name__ == "__main__":
    run_daily_tracking()
