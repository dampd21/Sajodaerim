#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
네이버 검색광고 API - 데이터 수집
"""

import os
import sys
import json
import time
import hmac
import hashlib
import base64
from datetime import datetime

try:
    import requests
except ImportError:
    print("requests 모듈 필요: pip install requests")
    sys.exit(1)


class NaverAdsAPI:
    BASE_URL = "https://api.searchad.naver.com"
    
    def __init__(self):
        self.api_key = os.environ.get('NAVER_AD_API_KEY')
        self.secret_key = os.environ.get('NAVER_AD_SECRET_KEY')
        self.customer_id = os.environ.get('NAVER_AD_CUSTOMER_ID')
        
        if not all([self.api_key, self.secret_key, self.customer_id]):
            raise ValueError("API 인증 정보가 없습니다. GitHub Secrets를 확인하세요.")
        
        print(f"[INFO] API 초기화 완료 (Customer: {self.customer_id})", flush=True)
    
    def _sign(self, timestamp, method, path):
        message = f"{timestamp}.{method}.{path}"
        sig = hmac.new(
            self.secret_key.encode(),
            message.encode(),
            hashlib.sha256
        ).digest()
        return base64.b64encode(sig).decode()
    
    def _request(self, method, path, params=None, data=None):
        timestamp = str(int(time.time() * 1000))
        
        headers = {
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Timestamp': timestamp,
            'X-API-KEY': self.api_key,
            'X-Customer': str(self.customer_id),
            'X-Signature': self._sign(timestamp, method, path)
        }
        
        url = f"{self.BASE_URL}{path}"
        
        print(f"[API] {method} {path}", flush=True)
        
        try:
            if method == 'GET':
                r = requests.get(url, headers=headers, params=params, timeout=30)
            elif method == 'POST':
                r = requests.post(url, headers=headers, json=data, timeout=30)
            else:
                return None
            
            print(f"[API] Status: {r.status_code}", flush=True)
            
            if r.status_code == 200:
                result = r.json() if r.text else {}
                return result
            else:
                print(f"[ERROR] Response: {r.text[:500]}", flush=True)
                return None
                
        except Exception as e:
            print(f"[ERROR] 요청 실패: {e}", flush=True)
            return None
    
    def get_campaigns(self):
        return self._request('GET', '/ncc/campaigns') or []
    
    def get_adgroups(self, campaign_id):
        return self._request('GET', '/ncc/adgroups', {'nccCampaignId': campaign_id}) or []
    
    def get_keywords(self, adgroup_id):
        return self._request('GET', '/ncc/keywords', {'nccAdgroupId': adgroup_id}) or []
    
    def get_keyword_stats(self, keywords):
        """키워드 검색량 조회"""
        print(f"[API] 검색량 조회: {keywords}", flush=True)
        
        data = {
            'hintKeywords': keywords,
            'showDetail': '1'
        }
        
        result = self._request('POST', '/keywordstool', data=data)
        
        if result:
            print(f"[API] 검색량 응답 키: {list(result.keys())}", flush=True)
            if 'keywordList' in result:
                print(f"[API] keywordList 개수: {len(result['keywordList'])}", flush=True)
        else:
            print(f"[API] 검색량 응답 없음!", flush=True)
        
        return result


def parse_volume(val):
    """검색량 파싱"""
    if val is None:
        return 0
    if isinstance(val, (int, float)):
        return int(val)
    s = str(val).strip()
    if '<' in s:
        return 5
    try:
        return int(s.replace(',', ''))
    except:
        return 0


def main():
    print("=" * 60, flush=True)
    print("네이버 광고 데이터 수집", flush=True)
    print(f"시작: {datetime.now()}", flush=True)
    print("=" * 60, flush=True)
    
    api = NaverAdsAPI()
    
    result = {
        'generated_at': datetime.now().isoformat(),
        'campaigns': [],
        'adgroups': [],
        'keywords': [],
        'keyword_stats': {},  # 빈 딕셔너리로 초기화
        'summary': {
            'total_campaigns': 0,
            'total_adgroups': 0,
            'total_keywords': 0,
            'active_keywords': 0
        }
    }
    
    # 1. 캠페인 조회
    print("\n[STEP 1/3] 캠페인 조회...", flush=True)
    campaigns = api.get_campaigns()
    result['campaigns'] = campaigns
    result['summary']['total_campaigns'] = len(campaigns)
    print(f"  → {len(campaigns)}개 캠페인", flush=True)
    
    # 2. 광고그룹 & 키워드 조회
    print("\n[STEP 2/3] 광고그룹 & 키워드 조회...", flush=True)
    keyword_texts = []
    
    for camp in campaigns:
        camp_id = camp.get('nccCampaignId')
        camp_name = camp.get('name', '')
        print(f"  캠페인: {camp_name}", flush=True)
        
        adgroups = api.get_adgroups(camp_id)
        
        for ag in adgroups:
            ag['campaignName'] = camp_name
            result['adgroups'].append(ag)
            
            ag_id = ag.get('nccAdgroupId')
            ag_name = ag.get('name', '')
            print(f"    광고그룹: {ag_name}", flush=True)
            
            keywords = api.get_keywords(ag_id)
            print(f"      키워드: {len(keywords)}개", flush=True)
            
            for kw in keywords:
                kw['campaignName'] = camp_name
                kw['adgroupName'] = ag_name
                result['keywords'].append(kw)
                
                kw_text = kw.get('keyword', '')
                if kw_text:
                    print(f"        - {kw_text}", flush=True)
                    if kw_text not in keyword_texts:
                        keyword_texts.append(kw_text)
                
                if not kw.get('userLock', False):
                    result['summary']['active_keywords'] += 1
            
            time.sleep(0.1)
    
    result['summary']['total_adgroups'] = len(result['adgroups'])
    result['summary']['total_keywords'] = len(result['keywords'])
    
    print(f"\n  → 총 {len(result['adgroups'])}개 광고그룹", flush=True)
    print(f"  → 총 {len(result['keywords'])}개 키워드", flush=True)
    print(f"  → 고유 키워드: {keyword_texts}", flush=True)
    
    # 3. 검색량 조회
    print(f"\n[STEP 3/3] 검색량 조회 ({len(keyword_texts)}개)...", flush=True)
    
    if keyword_texts:
        try:
            stats_response = api.get_keyword_stats(keyword_texts)
            
            if stats_response:
                print(f"  응답 타입: {type(stats_response)}", flush=True)
                print(f"  응답 키: {list(stats_response.keys()) if isinstance(stats_response, dict) else 'N/A'}", flush=True)
                
                if isinstance(stats_response, dict) and 'keywordList' in stats_response:
                    keyword_list = stats_response['keywordList']
                    print(f"  keywordList 개수: {len(keyword_list)}", flush=True)
                    
                    for item in keyword_list:
                        rel_kw = item.get('relKeyword', '')
                        if rel_kw:
                            pc = parse_volume(item.get('monthlyPcQcCnt'))
                            mobile = parse_volume(item.get('monthlyMobileQcCnt'))
                            comp = item.get('compIdx', '')
                            
                            result['keyword_stats'][rel_kw] = {
                                'monthlyPcQcCnt': pc,
                                'monthlyMobileQcCnt': mobile,
                                'compIdx': comp
                            }
                            
                            print(f"    {rel_kw}: PC={pc}, Mobile={mobile}, 경쟁도={comp}", flush=True)
                else:
                    print(f"  keywordList 없음! 전체 응답:", flush=True)
                    print(f"  {json.dumps(stats_response, ensure_ascii=False)[:1000]}", flush=True)
            else:
                print("  검색량 API 응답 없음!", flush=True)
                
        except Exception as e:
            print(f"  [ERROR] 검색량 조회 실패: {e}", flush=True)
            import traceback
            traceback.print_exc()
    else:
        print("  조회할 키워드가 없습니다.", flush=True)
    
    print(f"\n  → 검색량 데이터: {len(result['keyword_stats'])}개", flush=True)
    
    # 저장
    print("\n[SAVE] 파일 저장...", flush=True)
    os.makedirs('docs', exist_ok=True)
    os.makedirs('output', exist_ok=True)
    
    # JSON 저장
    with open('docs/ads_data.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("  → docs/ads_data.json", flush=True)
    
    with open('output/ads_data.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("  → output/ads_data.json", flush=True)
    
    # 결과 출력
    print("\n" + "=" * 60, flush=True)
    print("완료!", flush=True)
    print(f"  캠페인: {result['summary']['total_campaigns']}개", flush=True)
    print(f"  광고그룹: {result['summary']['total_adgroups']}개", flush=True)
    print(f"  키워드: {result['summary']['total_keywords']}개", flush=True)
    print(f"  활성: {result['summary']['active_keywords']}개", flush=True)
    print(f"  검색량: {len(result['keyword_stats'])}개", flush=True)
    print("=" * 60, flush=True)


if __name__ == "__main__":
    main()
