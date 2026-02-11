#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
네이버 검색광고 API - 다중 지점 데이터 수집 v3
- 지점별 API 키로 각각 수집
- 통합 ads_data.json 생성
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


# 지점 설정 (환경변수 접미사 → 지점명 매핑)
STORE_CONFIG = [
    {
        "key": "",
        "name": "역대짬뽕 본부",
        "env_suffix": ""
    },
    {
        "key": "BONJEOM",
        "name": "역대짬뽕 본점",
        "env_suffix": "_BONJEOM"
    },
    {
        "key": "DASAN",
        "name": "역대짬뽕 다산1호점",
        "env_suffix": "_DASAN"
    },
    {
        "key": "SONGPA",
        "name": "역대짬뽕 송파점",
        "env_suffix": "_SONGPA"
    },
    {
        "key": "DUJEONG",
        "name": "역대짬뽕 두정점",
        "env_suffix": "_DUJEONG"
    }
]


class NaverAdsAPI:
    BASE_URL = "https://api.searchad.naver.com"

    def __init__(self, api_key, secret_key, customer_id, store_name=""):
        self.api_key = api_key
        self.secret_key = secret_key
        self.customer_id = customer_id
        self.store_name = store_name

        print(f"[INFO] API 초기화: {store_name} (Customer: {customer_id})", flush=True)

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
        if not keywords:
            return None

        params = {
            'hintKeywords': ','.join(keywords),
            'showDetail': '1'
        }

        result = self._request('GET', '/keywordstool', params=params)

        if result:
            return result

        data = {
            'hintKeywords': ','.join(keywords),
            'showDetail': '1'
        }

        return self._request('POST', '/keywordstool', data=data)

    def get_rank_bids(self, keyword):
        uri = '/estimate/average-position-bid/keyword'

        results = {'PC': [], 'MOBILE': []}

        for device in ['MOBILE', 'PC']:
            items = [{"key": keyword, "position": pos} for pos in range(1, 6)]

            payload = {
                "device": device,
                "items": items
            }

            try:
                response = self._request('POST', uri, data=payload)

                if response:
                    estimates = response.get("estimate", [])
                    results[device] = estimates
                else:
                    pass

            except Exception as e:
                print(f"[ERROR] {device} 순위 조회 오류: {e}", flush=True)

        bid_landscape = []

        mobile_estimates = results.get('MOBILE', [])
        pc_estimates = results.get('PC', [])

        max_len = max(len(mobile_estimates), len(pc_estimates), 5)

        for i in range(min(max_len, 5)):
            rank = i + 1
            mobile_bid = 0
            pc_bid = 0

            if i < len(mobile_estimates):
                mobile_bid = mobile_estimates[i].get('bid', 0)

            if i < len(pc_estimates):
                pc_bid = pc_estimates[i].get('bid', 0)

            bid_landscape.append({
                "rank": rank,
                "mobileBid": mobile_bid,
                "pcBid": pc_bid
            })

        return bid_landscape


def parse_volume(val):
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


def collect_store_data(store_config):
    """단일 지점 데이터 수집"""
    suffix = store_config["env_suffix"]
    store_name = store_config["name"]

    api_key = os.environ.get(f'NAVER_AD_API_KEY{suffix}')
    secret_key = os.environ.get(f'NAVER_AD_SECRET_KEY{suffix}')
    customer_id = os.environ.get(f'NAVER_AD_CUSTOMER_ID{suffix}')

    if not all([api_key, secret_key, customer_id]):
        print(f"[SKIP] {store_name}: API 키가 설정되지 않음 (NAVER_AD_*{suffix})", flush=True)
        return None

    print(f"\n{'=' * 50}", flush=True)
    print(f"[수집 시작] {store_name}", flush=True)
    print(f"{'=' * 50}", flush=True)

    api = NaverAdsAPI(api_key, secret_key, customer_id, store_name)

    store_data = {
        'store_name': store_name,
        'store_key': store_config["key"],
        'customer_id': customer_id,
        'campaigns': [],
        'adgroups': [],
        'keywords': [],
        'keyword_stats': {},
        'keyword_rank_bids': {},
        'summary': {
            'total_campaigns': 0,
            'total_adgroups': 0,
            'total_keywords': 0,
            'active_keywords': 0
        }
    }

    # 1. 캠페인 조회
    print(f"\n  [1/4] 캠페인 조회...", flush=True)
    campaigns = api.get_campaigns()
    store_data['campaigns'] = campaigns
    store_data['summary']['total_campaigns'] = len(campaigns)
    print(f"    -> {len(campaigns)}개 캠페인", flush=True)

    # 2. 광고그룹 & 키워드 조회
    print(f"  [2/4] 광고그룹 & 키워드 조회...", flush=True)
    keyword_texts = []

    for camp in campaigns:
        camp_id = camp.get('nccCampaignId')
        camp_name = camp.get('name', '')

        adgroups = api.get_adgroups(camp_id)

        for ag in adgroups:
            ag['campaignName'] = camp_name
            ag['storeName'] = store_name
            store_data['adgroups'].append(ag)

            ag_id = ag.get('nccAdgroupId')
            ag_name = ag.get('name', '')

            keywords = api.get_keywords(ag_id)

            for kw in keywords:
                kw['campaignName'] = camp_name
                kw['adgroupName'] = ag_name
                kw['storeName'] = store_name
                store_data['keywords'].append(kw)

                kw_text = kw.get('keyword', '')
                if kw_text and kw_text not in keyword_texts:
                    keyword_texts.append(kw_text)

                if not kw.get('userLock', False):
                    store_data['summary']['active_keywords'] += 1

            time.sleep(0.1)

    store_data['summary']['total_adgroups'] = len(store_data['adgroups'])
    store_data['summary']['total_keywords'] = len(store_data['keywords'])
    print(f"    -> {len(store_data['adgroups'])}개 광고그룹, {len(store_data['keywords'])}개 키워드", flush=True)

    # 3. 검색량 조회
    print(f"  [3/4] 검색량 조회 ({len(keyword_texts)}개 키워드)...", flush=True)

    if keyword_texts:
        for i in range(0, len(keyword_texts), 5):
            batch = keyword_texts[i:i+5]
            print(f"    배치 {i//5 + 1}: {batch}", flush=True)

            stats = api.get_keyword_stats(batch)

            if stats:
                if 'keywordList' in stats:
                    for item in stats['keywordList']:
                        rel_kw = item.get('relKeyword', '')
                        if rel_kw:
                            store_data['keyword_stats'][rel_kw] = {
                                'monthlyPcQcCnt': parse_volume(item.get('monthlyPcQcCnt')),
                                'monthlyMobileQcCnt': parse_volume(item.get('monthlyMobileQcCnt')),
                                'compIdx': item.get('compIdx', '')
                            }

            time.sleep(0.3)

    print(f"    -> {len(store_data['keyword_stats'])}개 검색량 데이터", flush=True)

    # 4. 순위별 입찰가 조회
    print(f"  [4/4] 순위별 입찰가 조회 ({len(keyword_texts)}개 키워드)...", flush=True)

    for idx, kw_text in enumerate(keyword_texts):
        print(f"    [{idx+1}/{len(keyword_texts)}] {kw_text}", flush=True)

        try:
            bid_landscape = api.get_rank_bids(kw_text)

            if bid_landscape:
                store_data['keyword_rank_bids'][kw_text] = bid_landscape

                if bid_landscape and len(bid_landscape) > 0:
                    first = bid_landscape[0]
                    print(f"      -> 1위: PC {first.get('pcBid', 0):,}원 / M {first.get('mobileBid', 0):,}원", flush=True)
        except Exception as e:
            print(f"      -> 조회 실패: {e}", flush=True)

        time.sleep(0.5)

    print(f"    -> {len(store_data['keyword_rank_bids'])}개 순위별 입찰가 데이터", flush=True)

    print(f"\n  [완료] {store_name}: 캠페인 {store_data['summary']['total_campaigns']}, "
          f"그룹 {store_data['summary']['total_adgroups']}, "
          f"키워드 {store_data['summary']['total_keywords']} "
          f"(활성 {store_data['summary']['active_keywords']})", flush=True)

    return store_data


def main():
    print("=" * 60, flush=True)
    print("네이버 광고 데이터 수집 v3 (다중 지점)", flush=True)
    print("=" * 60, flush=True)

    # 통합 결과
    result = {
        'generated_at': datetime.now().isoformat(),
        'stores': [],
        'campaigns': [],
        'adgroups': [],
        'keywords': [],
        'keyword_stats': {},
        'keyword_rank_bids': {},
        'summary': {
            'total_stores': 0,
            'total_campaigns': 0,
            'total_adgroups': 0,
            'total_keywords': 0,
            'active_keywords': 0
        }
    }

    collected_stores = []

    for store_cfg in STORE_CONFIG:
        store_data = collect_store_data(store_cfg)

        if store_data is None:
            continue

        collected_stores.append({
            'store_name': store_data['store_name'],
            'store_key': store_data['store_key'],
            'customer_id': store_data['customer_id'],
            'summary': store_data['summary']
        })

        # 통합 데이터에 병합
        result['campaigns'].extend(store_data['campaigns'])
        result['adgroups'].extend(store_data['adgroups'])
        result['keywords'].extend(store_data['keywords'])

        # keyword_stats, keyword_rank_bids는 키워드 텍스트 기준이므로 중복 시 덮어쓰기
        result['keyword_stats'].update(store_data['keyword_stats'])
        result['keyword_rank_bids'].update(store_data['keyword_rank_bids'])

        # 서머리 합산
        result['summary']['total_campaigns'] += store_data['summary']['total_campaigns']
        result['summary']['total_adgroups'] += store_data['summary']['total_adgroups']
        result['summary']['total_keywords'] += store_data['summary']['total_keywords']
        result['summary']['active_keywords'] += store_data['summary']['active_keywords']

    result['stores'] = collected_stores
    result['summary']['total_stores'] = len(collected_stores)

    # 저장
    os.makedirs('docs', exist_ok=True)
    os.makedirs('output', exist_ok=True)

    with open('docs/ads_data.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    with open('output/ads_data.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 60, flush=True)
    print("전체 수집 완료!", flush=True)
    print(f"  수집 지점: {len(collected_stores)}개", flush=True)
    for s in collected_stores:
        sm = s['summary']
        print(f"    - {s['store_name']}: 캠페인 {sm['total_campaigns']}, "
              f"그룹 {sm['total_adgroups']}, "
              f"키워드 {sm['total_keywords']} (활성 {sm['active_keywords']})", flush=True)
    print(f"  총 캠페인: {result['summary']['total_campaigns']}개", flush=True)
    print(f"  총 광고그룹: {result['summary']['total_adgroups']}개", flush=True)
    print(f"  총 키워드: {result['summary']['total_keywords']}개", flush=True)
    print(f"  총 활성: {result['summary']['active_keywords']}개", flush=True)
    print(f"  검색량: {len(result['keyword_stats'])}개", flush=True)
    print(f"  순위별 입찰가: {len(result['keyword_rank_bids'])}개", flush=True)
    print("=" * 60, flush=True)


if __name__ == "__main__":
    main()
