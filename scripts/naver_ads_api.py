#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
네이버 검색광고 API 클라이언트
- 캠페인/광고그룹/키워드 조회
- 키워드 입찰가 수정
- 키워드 검색량 조회
"""

import os
import sys
import json
import time
import hmac
import hashlib
import base64
import argparse
from datetime import datetime, timedelta

try:
    import requests
except ImportError:
    print("requests 모듈이 필요합니다: pip install requests")
    sys.exit(1)


class NaverAdsAPI:
    """네이버 검색광고 API 클라이언트"""
    
    BASE_URL = "https://api.searchad.naver.com"
    
    def __init__(self, api_key=None, secret_key=None, customer_id=None):
        self.api_key = api_key or os.environ.get('NAVER_AD_API_KEY')
        self.secret_key = secret_key or os.environ.get('NAVER_AD_SECRET_KEY')
        self.customer_id = customer_id or os.environ.get('NAVER_AD_CUSTOMER_ID')
        
        if not all([self.api_key, self.secret_key, self.customer_id]):
            raise ValueError("API 인증 정보가 설정되지 않았습니다.")
        
        print(f"[INFO] 네이버 광고 API 초기화 (Customer ID: {self.customer_id})")
    
    def _generate_signature(self, timestamp, method, path):
        """API 서명 생성"""
        message = f"{timestamp}.{method}.{path}"
        signature = hmac.new(
            self.secret_key.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).digest()
        return base64.b64encode(signature).decode('utf-8')
    
    def _request(self, method, path, params=None, data=None):
        """API 요청"""
        timestamp = str(int(time.time() * 1000))
        signature = self._generate_signature(timestamp, method, path)
        
        headers = {
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Timestamp': timestamp,
            'X-API-KEY': self.api_key,
            'X-Customer': str(self.customer_id),
            'X-Signature': signature
        }
        
        url = f"{self.BASE_URL}{path}"
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method == 'POST':
                response = requests.post(url, headers=headers, json=data, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, headers=headers, json=data, timeout=30)
            else:
                raise ValueError(f"지원하지 않는 HTTP 메서드: {method}")
            
            if response.status_code == 200:
                return response.json() if response.text else {}
            elif response.status_code == 204:
                return {}
            else:
                print(f"[ERROR] API 오류: {response.status_code}")
                print(f"[ERROR] 응답: {response.text}")
                return None
                
        except requests.exceptions.RequestException as e:
            print(f"[ERROR] 요청 실패: {e}")
            return None
    
    # ============================================
    # 캠페인 관련
    # ============================================
    
    def get_campaigns(self):
        """캠페인 목록 조회"""
        print("[API] 캠페인 목록 조회...")
        result = self._request('GET', '/ncc/campaigns')
        if result:
            print(f"[API] 캠페인 {len(result)}개 조회됨")
        return result or []
    
    # ============================================
    # 광고그룹 관련
    # ============================================
    
    def get_adgroups(self, campaign_id=None):
        """광고그룹 목록 조회"""
        print("[API] 광고그룹 목록 조회...")
        params = {}
        if campaign_id:
            params['nccCampaignId'] = campaign_id
        result = self._request('GET', '/ncc/adgroups', params=params)
        if result:
            print(f"[API] 광고그룹 {len(result)}개 조회됨")
        return result or []
    
    # ============================================
    # 키워드 관련
    # ============================================
    
    def get_keywords(self, adgroup_id):
        """키워드 목록 조회"""
        print(f"[API] 키워드 목록 조회 (광고그룹: {adgroup_id[:8]}...)...")
        params = {'nccAdgroupId': adgroup_id}
        result = self._request('GET', '/ncc/keywords', params=params)
        if result:
            print(f"[API] 키워드 {len(result)}개 조회됨")
        return result or []
    
    def update_keyword(self, keyword_id, bid_amt=None, use_group_bid=None):
        """키워드 입찰가 수정"""
        print(f"[API] 키워드 수정 (ID: {keyword_id[:8]}..., 입찰가: {bid_amt})...")
        
        data = {'nccKeywordId': keyword_id}
        if bid_amt is not None:
            data['bidAmt'] = int(bid_amt)
        if use_group_bid is not None:
            data['useGroupBidAmt'] = use_group_bid
        
        result = self._request('PUT', f'/ncc/keywords/{keyword_id}', data=data)
        if result:
            print(f"[API] 키워드 수정 완료")
        return result
    
    def update_keywords_batch(self, keywords_data):
        """키워드 일괄 수정"""
        print(f"[API] 키워드 일괄 수정 ({len(keywords_data)}개)...")
        result = self._request('PUT', '/ncc/keywords', data=keywords_data)
        if result:
            print(f"[API] 키워드 일괄 수정 완료")
        return result
    
    # ============================================
    # 키워드 도구 (검색량)
    # ============================================
    
    def get_keyword_stats(self, keywords, show_detail=True):
        """키워드 검색량 조회"""
        print(f"[API] 키워드 검색량 조회 ({len(keywords)}개)...")
        
        data = {
            'hintKeywords': keywords,
            'showDetail': '1' if show_detail else '0'
        }
        
        result = self._request('POST', '/keywordstool', data=data)
        if result and 'keywordList' in result:
            print(f"[API] 검색량 데이터 {len(result['keywordList'])}개 조회됨")
        return result
    
    def get_estimate_average_bid(self, keywords):
        """키워드별 평균 입찰가 조회"""
        print(f"[API] 평균 입찰가 조회 ({len(keywords)}개)...")
        
        data = [{'keyword': kw} for kw in keywords]
        result = self._request('POST', '/estimate/average-position-bid/keyword', data=data)
        return result


def collect_all_data(api):
    """모든 광고 데이터 수집"""
    all_data = {
        'generated_at': datetime.now().isoformat(),
        'campaigns': [],
        'adgroups': [],
        'keywords': [],
        'keyword_stats': {},
        'summary': {
            'total_campaigns': 0,
            'total_adgroups': 0,
            'total_keywords': 0,
            'active_keywords': 0
        }
    }
    
    # 1. 캠페인 조회
    campaigns = api.get_campaigns()
    all_data['campaigns'] = campaigns
    all_data['summary']['total_campaigns'] = len(campaigns)
    
    # 2. 광고그룹 및 키워드 조회
    all_keywords = []
    keyword_texts = []
    
    for campaign in campaigns:
        campaign_id = campaign.get('nccCampaignId')
        campaign_name = campaign.get('name', '')
        
        adgroups = api.get_adgroups(campaign_id)
        
        for adgroup in adgroups:
            adgroup['campaignName'] = campaign_name
            all_data['adgroups'].append(adgroup)
            
            adgroup_id = adgroup.get('nccAdgroupId')
            adgroup_name = adgroup.get('name', '')
            
            keywords = api.get_keywords(adgroup_id)
            
            for keyword in keywords:
                keyword['campaignName'] = campaign_name
                keyword['adgroupName'] = adgroup_name
                all_keywords.append(keyword)
                
                kw_text = keyword.get('keyword', '')
                if kw_text and kw_text not in keyword_texts:
                    keyword_texts.append(kw_text)
                
                if keyword.get('userLock', False) == False:
                    all_data['summary']['active_keywords'] += 1
            
            time.sleep(0.1)  # API 요청 제한 방지
    
    all_data['keywords'] = all_keywords
    all_data['summary']['total_adgroups'] = len(all_data['adgroups'])
    all_data['summary']['total_keywords'] = len(all_keywords)
    
    # 3. 키워드 검색량 조회 (100개씩 나눠서)
    print(f"\n[INFO] 총 {len(keyword_texts)}개 키워드 검색량 조회 중...")
    
    for i in range(0, len(keyword_texts), 100):
        batch = keyword_texts[i:i+100]
        stats = api.get_keyword_stats(batch)
        
        if stats and 'keywordList' in stats:
            for kw_stat in stats['keywordList']:
                rel_keyword = kw_stat.get('relKeyword', '')
                all_data['keyword_stats'][rel_keyword] = {
                    'monthlyPcQcCnt': kw_stat.get('monthlyPcQcCnt', 0),
                    'monthlyMobileQcCnt': kw_stat.get('monthlyMobileQcCnt', 0),
                    'monthlyAvePcClkCnt': kw_stat.get('monthlyAvePcClkCnt', 0),
                    'monthlyAveMobileClkCnt': kw_stat.get('monthlyAveMobileClkCnt', 0),
                    'monthlyAvePcCtr': kw_stat.get('monthlyAvePcCtr', 0),
                    'monthlyAveMobileCtr': kw_stat.get('monthlyAveMobileCtr', 0),
                    'plAvgDepth': kw_stat.get('plAvgDepth', 0),
                    'compIdx': kw_stat.get('compIdx', '')
                }
        
        time.sleep(0.2)
    
    return all_data


def save_data(data, output_path):
    """데이터 저장"""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"[SAVE] {output_path}")


def main():
    parser = argparse.ArgumentParser(description='네이버 검색광고 API')
    parser.add_argument('--action', type=str, default='collect',
                        choices=['collect', 'update'],
                        help='실행할 작업')
    parser.add_argument('--keyword-id', type=str, help='수정할 키워드 ID')
    parser.add_argument('--bid-amt', type=int, help='새 입찰가')
    parser.add_argument('--output', type=str, default='docs/ads_data.json',
                        help='출력 파일 경로')
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("네이버 검색광고 API")
    print("=" * 60)
    
    try:
        api = NaverAdsAPI()
        
        if args.action == 'collect':
            data = collect_all_data(api)
            
            # docs 폴더에 저장
            save_data(data, args.output)
            
            # output 폴더에도 저장 (백업)
            save_data(data, 'output/ads_data.json')
            
            print("\n" + "=" * 60)
            print("수집 완료!")
            print(f"  - 캠페인: {data['summary']['total_campaigns']}개")
            print(f"  - 광고그룹: {data['summary']['total_adgroups']}개")
            print(f"  - 키워드: {data['summary']['total_keywords']}개")
            print(f"  - 활성 키워드: {data['summary']['active_keywords']}개")
            print("=" * 60)
            
        elif args.action == 'update':
            if not args.keyword_id or not args.bid_amt:
                print("[ERROR] --keyword-id와 --bid-amt가 필요합니다.")
                sys.exit(1)
            
            result = api.update_keyword(args.keyword_id, args.bid_amt)
            if result:
                print(f"[SUCCESS] 키워드 입찰가 수정 완료: {args.bid_amt}원")
            else:
                print("[ERROR] 키워드 수정 실패")
                sys.exit(1)
    
    except Exception as e:
        print(f"[ERROR] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
