# -*- coding: utf-8 -*-
"""
시각화용 리포트 데이터 생성
"""

import os
import json
from datetime import datetime
from collections import defaultdict


def load_master_data():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    master_file = os.path.join(script_dir, "output", "data", "master_data.json")
    
    if not os.path.exists(master_file):
        print("[WARN] No master data found.")
        return []
    
    with open(master_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"[INFO] Loaded {len(data)} records")
    return data


def analyze_price_changes(price_data, products):
    changes = []
    
    for code, prices in price_data.items():
        if len(prices) < 1:
            continue
        
        sorted_prices = sorted(prices, key=lambda x: x['date'])
        price_values = [p['price'] for p in sorted_prices if p['price'] > 0]
        
        if not price_values:
            continue
        
        first_price = price_values[0]
        last_price = price_values[-1]
        min_price = min(price_values)
        max_price = max(price_values)
        
        if first_price > 0:
            change = last_price - first_price
            change_pct = round((change / first_price) * 100, 2)
        else:
            change, change_pct = 0, 0
        
        product_info = products.get(code, {})
        
        changes.append({
            "code": code,
            "name": product_info.get("name", "Unknown"),
            "category": product_info.get("category", ""),
            "first_date": sorted_prices[0]["date"],
            "last_date": sorted_prices[-1]["date"],
            "first_price": first_price,
            "last_price": last_price,
            "min_price": min_price,
            "max_price": max_price,
            "change": change,
            "change_pct": change_pct,
            "history": sorted_prices,
            "count": len(sorted_prices)
        })
    
    changes.sort(key=lambda x: abs(x['change_pct']), reverse=True)
    return changes


def generate_report():
    data = load_master_data()
    
    if not data:
        print("[INFO] No data, generating empty report.")
        report = create_empty_report()
        save_report(report)
        return
    
    print(f"[INFO] Analyzing {len(data):,} records...")
    
    stores_set = set()
    categories_set = set()
    products = {}
    
    daily_sales = defaultdict(lambda: {"count": 0, "total": 0, "items": 0})
    store_sales = defaultdict(lambda: {"count": 0, "total": 0})
    category_sales = defaultdict(lambda: {"count": 0, "total": 0})
    
    product_prices = defaultdict(list)
    store_product_prices = defaultdict(lambda: defaultdict(list))
    store_daily_sales = defaultdict(lambda: defaultdict(lambda: {"count": 0, "total": 0, "items": 0}))
    
    for item in data:
        date_str = item.get('조회일자', '')
        store = item.get('지점명', '').strip()
        category = item.get('대분류', '').strip()
        product_code = item.get('상품코드', '').strip()
        product_name = item.get('상품명', '').strip()
        
        try:
            qty = int(item.get('수량', 0) or 0)
            price = int(item.get('단가', 0) or 0)
            total = int(item.get('합계', 0) or 0)
        except (ValueError, TypeError):
            qty, price, total = 0, 0, 0
        
        if store:
            stores_set.add(store)
        if category:
            categories_set.add(category)
        
        if product_code and product_code not in products:
            products[product_code] = {
                "code": product_code,
                "name": product_name,
                "category": category,
                "unit": item.get('단위', '')
            }
        
        # 일별 매출
        daily_sales[date_str]["count"] += qty
        daily_sales[date_str]["total"] += total
        daily_sales[date_str]["items"] += 1
        
        # 지점별 매출
        if store:
            store_sales[store]["count"] += qty
            store_sales[store]["total"] += total
            
            store_daily_sales[store][date_str]["count"] += qty
            store_daily_sales[store][date_str]["total"] += total
            store_daily_sales[store][date_str]["items"] += 1
        
        # 카테고리별 매출
        if category:
            category_sales[category]["count"] += qty
            category_sales[category]["total"] += total
        
        # 가격 추적
        if price > 0 and product_code:
            product_prices[product_code].append({
                "date": date_str,
                "price": price,
                "store": store
            })
            
            if store:
                store_product_prices[store][product_code].append({
                    "date": date_str,
                    "price": price
                })
    
    # 가격 변동 분석
    price_changes = analyze_price_changes(product_prices, products)
    
    store_price_changes = {}
    for store in stores_set:
        if store in store_product_prices:
            store_changes = analyze_price_changes(store_product_prices[store], products)
            if store_changes:
                store_price_changes[store] = store_changes
    
    dates = sorted(daily_sales.keys())
    store_list = sorted(list(stores_set))
    
    # 지점별 상세 데이터
    store_details = {}
    for store in store_list:
        store_details[store] = {
            "daily": dict(sorted(store_daily_sales[store].items())),
            "total_count": store_sales[store]["count"],
            "total_sales": store_sales[store]["total"]
        }
    
    print(f"[INFO] Found {len(store_list)} stores")
    
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
        "price_changes": price_changes[:300],
        "store_price_changes": store_price_changes,
        "store_details": store_details,
        "products": list(products.values()),
        "store_list": store_list
    }
    
    save_report(report)


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
    
    output_dir = os.path.join(script_dir, "output")
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, "report_data.json")
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    print(f"[SAVE] Report: {output_file}")
    
    docs_dir = os.path.join(script_dir, "docs")
    os.makedirs(docs_dir, exist_ok=True)
    docs_file = os.path.join(docs_dir, "report_data.json")
    
    with open(docs_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False)
    
    print(f"[SAVE] Web report: {docs_file}")
    print(f"[DONE] {len(report.get('store_list', []))} stores saved")


if __name__ == "__main__":
    generate_report()
