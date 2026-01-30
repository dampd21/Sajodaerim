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
        
        try:
            if method == 'GET':
                r = requests.get(url, headers=headers, params=params, timeout=30)
            elif method == 'POST':
                r = requests.post(url, headers=headers, json=data, timeout=30)
            else:
                return None
            
            if r.status_code == 200:
                return r.json() if r.text else {}
            else:
                print(f"[ERROR] {method} {path} -> {r.status_code}: {r.text[:300]}", flush=True)
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
        """
        키워드 검색량 조회 (관련키워드도구 API)
        
        주의: hintKeywords는 배열이 아니라 문자열로 전달해야 함
        """
        if not keywords:
            return None
        
        # 방법 1: GET 방식으로 시도
        print(f"[API] 검색량 조회 (GET 방식)...", flush=True)
        
        params = {
            'hintKeywords': ','.join(keywords),
            'showDetail': '1'
        }
        
        result = self._request_get_keywordtool(params)
        
        if result:
            return result
        
        # 방법 2: POST 방식 (다른 형식)
        print(f"[API] 검색량 조회 (POST 방식)...", flush=True)
        
        data = {
            'hintKeywords': ','.join(keywords),
            'showDetail': '1'
        }
        
        return self._request('POST', '/keywordstool', data=data)
    
    def _request_get_keywordtool(self, params):
        """GET 방식 키워드 도구 API"""
        timestamp = str(int(time.time() * 1000))
        path = '/keywordstool'
        
        headers = {
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Timestamp': timestamp,
            'X-API-KEY': self.api_key,
            'X-Customer': str(self.customer_id),
            'X-Signature': self._sign(timestamp, 'GET', path)
        }
        
        url = f"{self.BASE_URL}{path}"
        
        try:
            r = requests.get(url, headers=headers, params=params, timeout=30)
            
            print(f"[API] GET {path} -> {r.status_code}", flush=True)
            
            if r.status_code == 200:
                return r.json() if r.text else {}
            else:
                print(f"[API] 응답: {r.text[:300]}", flush=True)
                return None
                
        except Exception as e:
            print(f"[ERROR] GET 요청 실패: {e}", flush=True)
            return None


def parse_volume(val):
    """검색량 파싱 ('< 10' 등 처리)"""
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
    print("=" * 60, flush=True)
    
    api = NaverAdsAPI()
    
    result = {
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
    print("\n[1/3] 캠페인 조회...", flush=True)
    campaigns = api.get_campaigns()
    result['campaigns'] = campaigns
    result['summary']['total_campaigns'] = len(campaigns)
    print(f"  → {len(campaigns)}개 캠페인", flush=True)
    
    # 2. 광고그룹 & 키워드 조회
    print("\n[2/3] 광고그룹 & 키워드 조회...", flush=True)
    keyword_texts = []
    
    for camp in campaigns:
        camp_id = camp.get('nccCampaignId')
        camp_name = camp.get('name', '')
        
        adgroups = api.get_adgroups(camp_id)
        
        for ag in adgroups:
            ag['campaignName'] = camp_name
            result['adgroups'].append(ag)
            
            ag_id = ag.get('nccAdgroupId')
            ag_name = ag.get('name', '')
            
            keywords = api.get_keywords(ag_id)
            
            for kw in keywords:
                kw['campaignName'] = camp_name
                kw['adgroupName'] = ag_name
                result['keywords'].append(kw)
                
                kw_text = kw.get('keyword', '')
                if kw_text and kw_text not in keyword_texts:
                    keyword_texts.append(kw_text)
                
                if not kw.get('userLock', False):
                    result['summary']['active_keywords'] += 1
            
            time.sleep(0.1)
    
    result['summary']['total_adgroups'] = len(result['adgroups'])
    result['summary']['total_keywords'] = len(result['keywords'])
    print(f"  → {len(result['adgroups'])}개 광고그룹, {len(result['keywords'])}개 키워드", flush=True)
    print(f"  → 키워드 목록: {keyword_texts}", flush=True)
    
    # 3. 검색량 조회
    print(f"\n[3/3] 검색량 조회 ({len(keyword_texts)}개 키워드)...", flush=True)
    
    if keyword_texts:
        # 5개씩 나눠서 조회 (API 제한 고려)
        for i in range(0, len(keyword_texts), 5):
            batch = keyword_texts[i:i+5]
            print(f"  배치 {i//5 + 1}: {batch}", flush=True)
            
            stats = api.get_keyword_stats(batch)
            
            if stats:
                print(f"  응답 키: {list(stats.keys())}", flush=True)
                
                if 'keywordList' in stats:
                    for item in stats['keywordList']:
                        rel_kw = item.get('relKeyword', '')
                        if rel_kw:
                            result['keyword_stats'][rel_kw] = {
                                'monthlyPcQcCnt': parse_volume(item.get('monthlyPcQcCnt')),
                                'monthlyMobileQcCnt': parse_volume(item.get('monthlyMobileQcCnt')),
                                'compIdx': item.get('compIdx', '')
                            }
                            print(f"    ✓ {rel_kw}: PC={result['keyword_stats'][rel_kw]['monthlyPcQcCnt']}, M={result['keyword_stats'][rel_kw]['monthlyMobileQcCnt']}", flush=True)
            
            time.sleep(0.3)
    
    print(f"  → {len(result['keyword_stats'])}개 검색량 데이터", flush=True)
    
    # 저장
    os.makedirs('docs', exist_ok=True)
    os.makedirs('output', exist_ok=True)
    
    with open('docs/ads_data.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    with open('output/ads_data.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
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
