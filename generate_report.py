# -*- coding: utf-8 -*-
"""
시각화용 리포트 데이터 생성
- 지점별 가격 변동 데이터 생성 보장
- 일별 상세 데이터 추가
"""

import os
import json
from datetime import datetime
from collections import defaultdict


def load_master_data():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    master_file = os.path.join(script_dir, "output", "data", "master_data.json")
    
    if not os.path.exists(master_file):
        print("[WARN] master_data.json not found")
        return []
    
    with open(master_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"[LOAD] {len(data):,} records from master_data.json")
    return data


def clean_store_name(name):
    """지점명 정리 - 일관성 유지"""
    if not name:
        return ""
    name = str(name).strip()
    name = name.replace('■ ', '').replace('■', '').strip()
    return name


def generate_report():
    data = load_master_data()
    
    if not data:
        print("[INFO] No data")
        save_report(create_empty_report())
        return
    
    print(f"[INFO] Processing {len(data):,} records...")
    
    # 데이터 구조
    stores_set = set()
    categories_set = set()
    products = {}
    
    daily_sales = defaultdict(lambda: {"count": 0, "total": 0, "items": 0})
    store_sales = defaultdict(lambda: {"count": 0, "total": 0})
    category_sales = defaultdict(lambda: {"count": 0, "total": 0})
    
    # 가격 추적 - defaultdict 사용
    all_product_prices = defaultdict(list)
    store_product_prices = defaultdict(lambda: defaultdict(list))
    store_daily = defaultdict(lambda: defaultdict(lambda: {"count": 0, "total": 0, "items": 0}))
    
    # 일별 상세 데이터
    daily_details = defaultdict(list)
    
    # 데이터 처리
    for idx, item in enumerate(data):
        date_str = str(item.get('조회일자', '') or '').strip()
        store = clean_store_name(item.get('지점명', ''))
        category = str(item.get('대분류', '') or '').strip()
        product_code = str(item.get('상품코드', '') or '').strip()
        product_name = str(item.get('상품명', '') or '').strip()
        spec = str(item.get('규격', '') or '').strip()
        
        # 숫자 파싱
        try:
            qty_str = str(item.get('수량', '0') or '0').replace(',', '')
            qty = int(qty_str) if qty_str else 0
        except:
            qty = 0
        
        try:
            price_str = str(item.get('단가', '0') or '0').replace(',', '')
            price = int(price_str) if price_str else 0
        except:
            price = 0
        
        try:
            total_str = str(item.get('합계', '0') or '0').replace(',', '')
            total = int(total_str) if total_str else 0
        except:
            total = 0
        
        # 지점, 카테고리 수집
        if store:
            stores_set.add(store)
        if category:
            categories_set.add(category)
        
        # 상품 정보
        if product_code and product_code not in products:
            products[product_code] = {
                "code": product_code,
                "name": product_name,
                "category": category,
                "unit": str(item.get('단위', '') or '')
            }
        
        # 전체 일별 매출
        if date_str:
            daily_sales[date_str]["count"] += qty
            daily_sales[date_str]["total"] += total
            daily_sales[date_str]["items"] += 1
            
            # 일별 상세 데이터 추가
            daily_details[date_str].append({
                "store": store,
                "product": product_name,
                "code": product_code,
                "category": category,
                "spec": spec,
                "qty": qty,
                "price": price,
                "total": total
            })
        
        # 지점별 처리
        if store:
            store_sales[store]["count"] += qty
            store_sales[store]["total"] += total
            
            # 지점별 일별 매출
            if date_str:
                store_daily[store][date_str]["count"] += qty
                store_daily[store][date_str]["total"] += total
                store_daily[store][date_str]["items"] += 1
            
            # 지점별 상품 가격 (가격이 0보다 클 때만)
            if product_code and price > 0 and date_str:
                store_product_prices[store][product_code].append({
                    "date": date_str,
                    "price": price
                })
        
        # 전체 상품 가격
        if product_code and price > 0 and date_str:
            all_product_prices[product_code].append({
                "date": date_str,
                "price": price,
                "store": store
            })
        
        # 카테고리별 매출
        if category:
            category_sales[category]["count"] += qty
            category_sales[category]["total"] += total
    
    print(f"[INFO] Stores found: {len(stores_set)}")
    print(f"[INFO] Products found: {len(products)}")
    print(f"[INFO] Categories found: {len(categories_set)}")
    print(f"[INFO] Daily details: {len(daily_details)} days")
    
    # 전체 가격 변동 분석
    print("[INFO] Analyzing all price changes...")
    price_changes = analyze_prices(all_product_prices, products)
    print(f"[INFO] Total price changes: {len(price_changes)}")
    
    # 지점별 가격 변동 분석
    print("[INFO] Analyzing store price changes...")
    store_price_changes = {}
    
    for store in stores_set:
        if store in store_product_prices:
            product_count = len(store_product_prices[store])
            if product_count > 0:
                changes = analyze_prices(store_product_prices[store], products)
                if changes:
                    store_price_changes[store] = changes
    
    print(f"[INFO] Stores with price changes: {len(store_price_changes)}")
    
    # 지점별 상세 데이터
    store_details = {}
    for store in stores_set:
        if store in store_daily and len(store_daily[store]) > 0:
            store_details[store] = {
                "daily": dict(sorted(store_daily[store].items())),
                "total_count": store_sales[store]["count"],
                "total_sales": store_sales[store]["total"]
            }
    
    print(f"[INFO] Stores with details: {len(store_details)}")
    
    # 지점 리스트
    store_list = sorted(list(stores_set))
    
    # 날짜 범위
    dates = sorted(daily_sales.keys())
    
    # 검증 출력
    print("\n[CHECK] Data consistency:")
    print(f"  store_list: {len(store_list)}")
    print(f"  store_details: {len(store_details)}")
    print(f"  store_price_changes: {len(store_price_changes)}")
    print(f"  daily_details: {len(daily_details)} days")
    
    # 일부 지점 상세 확인
    print("\n[CHECK] Sample stores:")
    for store in store_list[:5]:
        has_details = store in store_details
        has_prices = store in store_price_changes
        price_count = len(store_price_changes.get(store, []))
        print(f"  '{store}': details={has_details}, prices={has_prices} ({price_count} items)")
    
    # 리포트 생성
    report = {
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_records": len(data),
            "total_stores": len(stores_set),
            "total_categories": len(categories_set),
            "total_products": len(products),
            "date_range": {
                "start": dates[0] if dates else None,
                "end": dates[-1] if dates else None
            },
            "total_sales": sum(d["total"] for d in daily_sales.values())
        },
        "daily": dict(sorted(daily_sales.items())),
        "daily_details": {k: v for k, v in sorted(daily_details.items())},
        "stores": [
            {"name": k, "count": v["count"], "total": v["total"]} 
            for k, v in sorted(store_sales.items(), key=lambda x: -x[1]["total"])
            if k
        ],
        "categories": [
            {"name": k, "count": v["count"], "total": v["total"]} 
            for k, v in sorted(category_sales.items(), key=lambda x: -x[1]["total"])
            if k
        ],
        "price_changes": price_changes[:500],
        "store_price_changes": store_price_changes,
        "store_details": store_details,
        "products": list(products.values()),
        "store_list": store_list
    }
    
    save_report(report)


def analyze_prices(price_data, products):
    """가격 변동 분석"""
    results = []
    
    for code, prices in price_data.items():
        if not prices or len(prices) == 0:
            continue
        
        # 날짜순 정렬
        sorted_prices = sorted(prices, key=lambda x: x.get('date', ''))
        
        # 유효한 가격만
        valid_prices = [p['price'] for p in sorted_prices if p.get('price', 0) > 0]
        
        if not valid_prices:
            continue
        
        first_price = valid_prices[0]
        last_price = valid_prices[-1]
        min_price = min(valid_prices)
        max_price = max(valid_prices)
        
        # 변동 계산
        change = last_price - first_price
        if first_price > 0:
            change_pct = round((change / first_price) * 100, 2)
        else:
            change_pct = 0
        
        # 상품 정보
        product_info = products.get(code, {})
        
        results.append({
            "code": code,
            "name": product_info.get("name", code),
            "category": product_info.get("category", ""),
            "first_date": sorted_prices[0].get("date", ""),
            "last_date": sorted_prices[-1].get("date", ""),
            "first_price": first_price,
            "last_price": last_price,
            "min_price": min_price,
            "max_price": max_price,
            "change": change,
            "change_pct": change_pct,
            "history": sorted_prices,
            "count": len(sorted_prices)
        })
    
    # 변동률 기준 정렬
    results.sort(key=lambda x: abs(x.get('change_pct', 0)), reverse=True)
    
    return results


def create_empty_report():
    return {
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_records": 0,
            "total_stores": 0,
            "total_categories": 0,
            "total_products": 0,
            "date_range": {"start": None, "end": None},
            "total_sales": 0
        },
        "daily": {},
        "daily_details": {},
        "stores": [],
        "categories": [],
        "price_changes": [],
        "store_price_changes": {},
        "store_details": {},
        "products": [],
        "store_list": []
    }


def save_report(report):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # output 폴더
    output_dir = os.path.join(script_dir, "output")
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, "report_data.json")
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n[SAVE] {output_file}")
    
    # docs 폴더
    docs_dir = os.path.join(script_dir, "docs")
    os.makedirs(docs_dir, exist_ok=True)
    docs_file = os.path.join(docs_dir, "report_data.json")
    
    with open(docs_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False)
    print(f"[SAVE] {docs_file}")
    
    # 최종 확인
    print(f"\n[DONE] Report generated:")
    print(f"  - store_list: {len(report.get('store_list', []))} stores")
    print(f"  - store_details: {len(report.get('store_details', {}))} stores")
    print(f"  - store_price_changes: {len(report.get('store_price_changes', {}))} stores")
    print(f"  - price_changes: {len(report.get('price_changes', []))} items")
    print(f"  - daily_details: {len(report.get('daily_details', {}))} days")


if __name__ == "__main__":
    generate_report()
