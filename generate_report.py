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
        return json.load(f)


def get_week_key(date_str):
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    year, week, _ = dt.isocalendar()
    return f"{year}-W{week:02d}"


def get_month_key(date_str):
    return date_str[:7]


def analyze_price_changes(price_data, products):
    """가격 변동 분석"""
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
        report = {
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
            "weekly": {},
            "monthly": {},
            "price_changes": [],
            "store_price_changes": {},
            "stores": [],
            "categories": [],
            "products": [],
            "store_list": []
        }
    else:
        print(f"[INFO] Analyzing {len(data):,} records...")
        
        stores = set()
        categories = set()
        products = {}
        
        daily_sales = defaultdict(lambda: {"count": 0, "total": 0})
        weekly_sales = defaultdict(lambda: {"count": 0, "total": 0})
        monthly_sales = defaultdict(lambda: {"count": 0, "total": 0})
        
        store_sales = defaultdict(lambda: {"count": 0, "total": 0})
        category_sales = defaultdict(lambda: {"count": 0, "total": 0})
        
        product_prices = defaultdict(list)
        store_product_prices = defaultdict(lambda: defaultdict(list))
        
        for item in data:
            date_str = item['조회일자']
            store = item['지점명']
            category = item['대분류']
            product_code = item['상품코드']
            product_name = item['상품명']
            
            try:
                qty = int(item['수량']) if item['수량'] else 0
                price = int(item['단가']) if item['단가'] else 0
                total = int(item['합계']) if item['합계'] else 0
            except:
                qty, price, total = 0, 0, 0
            
            # 지점명 수집
            if store:
                stores.add(store)
            
            if category:
                categories.add(category)
            
            if product_code and product_code not in products:
                products[product_code] = {
                    "code": product_code,
                    "name": product_name,
                    "category": category,
                    "unit": item.get('단위', '')
                }
            
            daily_sales[date_str]["count"] += qty
            daily_sales[date_str]["total"] += total
            
            week_key = get_week_key(date_str)
            weekly_sales[week_key]["count"] += qty
            weekly_sales[week_key]["total"] += total
            
            month_key = get_month_key(date_str)
            monthly_sales[month_key]["count"] += qty
            monthly_sales[month_key]["total"] += total
            
            store_sales[store]["count"] += qty
            store_sales[store]["total"] += total
            
            category_sales[category]["count"] += qty
            category_sales[category]["total"] += total
            
            if price > 0 and product_code:
                product_prices[product_code].append({
                    "date": date_str,
                    "price": price,
                    "store": store
                })
                
                store_product_prices[store][product_code].append({
                    "date": date_str,
                    "price": price
                })
        
        # 전체 가격 변동 분석
        price_changes = analyze_price_changes(product_prices, products)
        
        # 지점별 가격 변동 분석
        store_price_changes = {}
        for store, store_products in store_product_prices.items():
            if store:  # 빈 지점명 제외
                store_changes = analyze_price_changes(store_products, products)
                if store_changes:
                    store_price_changes[store] = store_changes
        
        dates = sorted(daily_sales.keys())
        
        # 지점 리스트 정렬
        store_list = sorted(list(stores))
        
        print(f"[INFO] Found {len(store_list)} stores")
        print(f"[INFO] Stores: {store_list[:5]}..." if len(store_list) > 5 else f"[INFO] Stores: {store_list}")
        
        report = {
            "generated_at": datetime.now().isoformat(),
            "summary": {
                "total_records": len(data),
                "total_stores": len(stores),
                "total_categories": len(categories),
                "total_products": len(products),
                "date_range": {
                    "start": dates[0] if dates else None,
                    "end": dates[-1] if dates else None
                },
                "total_sales": sum(d["total"] for d in daily_sales.values())
            },
            "daily": dict(sorted(daily_sales.items())),
            "weekly": dict(sorted(weekly_sales.items())),
            "monthly": dict(sorted(monthly_sales.items())),
            "stores": [
                {"name": k, "count": v["count"], "total": v["total"]} 
                for k, v in sorted(store_sales.items(), key=lambda x: -x[1]["total"])
                if k  # 빈 지점명 제외
            ],
            "categories": [
                {"name": k, "count": v["count"], "total": v["total"]} 
                for k, v in sorted(category_sales.items(), key=lambda x: -x[1]["total"])
                if k  # 빈 카테고리 제외
            ],
            "price_changes": price_changes[:100],
            "store_price_changes": store_price_changes,
            "products": list(products.values()),
            "store_list": store_list  # 지점 목록
        }
    
    # 저장
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # output 폴더에 저장
    output_dir = os.path.join(script_dir, "output")
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, "report_data.json")
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    print(f"[SAVE] Report: {output_file}")
    
    # docs 폴더에도 복사 (GitHub Pages용)
    docs_dir = os.path.join(script_dir, "docs")
    os.makedirs(docs_dir, exist_ok=True)
    docs_file = os.path.join(docs_dir, "report_data.json")
    
    with open(docs_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False)
    
    print(f"[SAVE] Web report: {docs_file}")
    print(f"[INFO] Store list saved: {len(report['store_list'])} stores")


if __name__ == "__main__":
    generate_report()
