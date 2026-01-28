# -*- coding: utf-8 -*-
"""
시각화용 리포트 데이터 생성
- 주간/월간 집계
- 가격 변동 분석
- JSON 출력 (웹페이지용)
"""

import os
import json
from datetime import datetime, timedelta
from collections import defaultdict

def load_master_data():
    """마스터 데이터 로드"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    master_file = os.path.join(script_dir, "output", "data", "master_data.json")
    
    if not os.path.exists(master_file):
        print("[WARN] 마스터 데이터 없음")
        return []
    
    with open(master_file, 'r', encoding='utf-8') as f:
        return json.load(f)

def get_week_key(date_str):
    """날짜를 주차 키로 변환 (YYYY-WXX)"""
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    year, week, _ = dt.isocalendar()
    return f"{year}-W{week:02d}"

def get_month_key(date_str):
    """날짜를 월 키로 변환 (YYYY-MM)"""
    return date_str[:7]

def generate_report():
    """리포트 데이터 생성"""
    data = load_master_data()
    
    if not data:
        print("[INFO] 데이터 없음, 빈 리포트 생성")
        report = {
            "generated_at": datetime.now().isoformat(),
            "summary": {},
            "weekly": {},
            "monthly": {},
            "price_changes": [],
            "stores": [],
            "categories": [],
            "products": []
        }
    else:
        print(f"[INFO] {len(data):,}건 데이터 분석 중...")
        
        # 기본 집계
        stores = set()
        categories = set()
        products = {}
        
        # 일별/주별/월별 집계
        daily_sales = defaultdict(lambda: {"count": 0, "total": 0})
        weekly_sales = defaultdict(lambda: {"count": 0, "total": 0})
        monthly_sales = defaultdict(lambda: {"count": 0, "total": 0})
        
        # 지점별 집계
        store_sales = defaultdict(lambda: {"count": 0, "total": 0})
        
        # 대분류별 집계
        category_sales = defaultdict(lambda: {"count": 0, "total": 0})
        
        # 상품별 가격 추적
        product_prices = defaultdict(list)
        
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
            
            stores.add(store)
            categories.add(category)
            
            # 상품 정보
            if product_code not in products:
                products[product_code] = {
                    "code": product_code,
                    "name": product_name,
                    "category": category,
                    "unit": item['단위']
                }
            
            # 일별
            daily_sales[date_str]["count"] += qty
            daily_sales[date_str]["total"] += total
            
            # 주별
            week_key = get_week_key(date_str)
            weekly_sales[week_key]["count"] += qty
            weekly_sales[week_key]["total"] += total
            
            # 월별
            month_key = get_month_key(date_str)
            monthly_sales[month_key]["count"] += qty
            monthly_sales[month_key]["total"] += total
            
            # 지점별
            store_sales[store]["count"] += qty
            store_sales[store]["total"] += total
            
            # 대분류별
            category_sales[category]["count"] += qty
            category_sales[category]["total"] += total
            
            # 상품별 가격 추적
            if price > 0:
                product_prices[product_code].append({
                    "date": date_str,
                    "price": price,
                    "store": store
                })
        
        # 가격 변동 분석
        price_changes = []
        for code, prices in product_prices.items():
            if len(prices) < 2:
                continue
            
            sorted_prices = sorted(prices, key=lambda x: x['date'])
            price_values = [p['price'] for p in sorted_prices]
            
            first_price = price_values[0]
            last_price = price_values[-1]
            min_price = min(price_values)
            max_price = max(price_values)
            
            if first_price > 0:
                change = last_price - first_price
                change_pct = round((change / first_price) * 100, 2)
            else:
                change, change_pct = 0, 0
            
            price_changes.append({
                "code": code,
                "name": products[code]["name"],
                "category": products[code]["category"],
                "first_date": sorted_prices[0]["date"],
                "last_date": sorted_prices[-1]["date"],
                "first_price": first_price,
                "last_price": last_price,
                "min_price": min_price,
                "max_price": max_price,
                "change": change,
                "change_pct": change_pct,
                "history": sorted_prices
            })
        
        # 변동률 기준 정렬
        price_changes.sort(key=lambda x: abs(x['change_pct']), reverse=True)
        
        # 날짜 범위
        dates = sorted(daily_sales.keys())
        
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
                {"name": k, **v} for k, v in sorted(store_sales.items(), key=lambda x: -x[1]["total"])
            ],
            "categories": [
                {"name": k, **v} for k, v in sorted(category_sales.items(), key=lambda x: -x[1]["total"])
            ],
            "price_changes": price_changes[:100],  # 상위 100개만
            "products": list(products.values())
        }
    
    # 저장
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_file = os.path.join(script_dir, "output", "report_data.json")
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    print(f"[SAVE] 리포트 생성: {output_file}")
    
    # docs 폴더에도 복사 (GitHub Pages용)
    docs_file = os.path.join(script_dir, "docs", "report_data.json")
    os.makedirs(os.path.dirname(docs_file), exist_ok=True)
    with open(docs_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False)
    
    print(f"[SAVE] 웹용 리포트: {docs_file}")


if __name__ == "__main__":
    generate_report()
