# -*- coding: utf-8 -*-
"""
KIS 매출 데이터 리포트 생성
- 일별/지점별/채널별 매출 집계
- 대시보드용 JSON 생성
"""

import os
import json
from datetime import datetime
from collections import defaultdict


def load_sales_data():
    """매출 데이터 로드"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_file = os.path.join(script_dir, "output", "data", "sales_data.json")
    
    if not os.path.exists(data_file):
        print("[WARN] sales_data.json not found")
        return []
    
    with open(data_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"[LOAD] {len(data):,} records from sales_data.json")
    return data


def parse_int(value):
    """숫자 파싱"""
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    try:
        return int(str(value).replace(',', ''))
    except:
        return 0


def format_date(date_str):
    """날짜 형식 변환 (YYYYMMDD -> YYYY-MM-DD)"""
    if not date_str or len(str(date_str)) != 8:
        return date_str
    d = str(date_str)
    return f"{d[:4]}-{d[4:6]}-{d[6:8]}"


def get_week_key(date_str):
    """주차 키 생성 (YYYY-WXX)"""
    try:
        if len(date_str) == 8:
            dt = datetime.strptime(date_str, '%Y%m%d')
        else:
            dt = datetime.strptime(date_str, '%Y-%m-%d')
        year, week, _ = dt.isocalendar()
        return f"{year}-W{week:02d}"
    except:
        return None


def get_month_key(date_str):
    """월 키 생성 (YYYY-MM)"""
    if not date_str:
        return None
    d = str(date_str).replace('-', '')
    if len(d) >= 6:
        return f"{d[:4]}-{d[4:6]}"
    return None


def generate_report():
    """리포트 생성"""
    data = load_sales_data()
    
    if not data:
        print("[INFO] No data")
        save_report(create_empty_report())
        return
    
    print(f"[INFO] Processing {len(data):,} records...")
    
    # 데이터 구조
    stores = {}  # 지점 정보
    daily_data = defaultdict(lambda: defaultdict(lambda: {
        "hall": 0,
        "delivery": 0,
        "packaging": 0,
        "total": 0,
        "count": 0,
        "customers": 0
    }))
    
    # 전체 집계
    total_stats = {
        "total_sales": 0,
        "total_hall": 0,
        "total_delivery": 0,
        "total_packaging": 0,
        "total_count": 0,
        "total_customers": 0
    }
    
    # 지점별 전체 집계
    store_totals = defaultdict(lambda: {
        "hall": 0,
        "delivery": 0,
        "packaging": 0,
        "total": 0,
        "count": 0,
        "customers": 0,
        "days": set()
    })
    
    # 일별 전체 집계
    daily_totals = defaultdict(lambda: {
        "hall": 0,
        "delivery": 0,
        "packaging": 0,
        "total": 0,
        "count": 0,
        "customers": 0,
        "stores": set()
    })
    
    # 데이터 처리
    all_dates = set()
    
    for item in data:
        date_str = str(item.get('SALE_DATE', '') or '')
        shop_cd = str(item.get('SHOP_CD', '') or '')
        shop_nm = str(item.get('SHOP_NM', '') or '')
        
        if not date_str or not shop_cd:
            continue
        
        all_dates.add(date_str)
        
        # 지점 정보 저장
        if shop_cd not in stores:
            stores[shop_cd] = {
                "code": shop_cd,
                "name": shop_nm
            }
        
        # 매출 데이터 파싱
        hall = parse_int(item.get('GEN_DCM_SALE_AMT', 0))  # 일반(홀)
        delivery = parse_int(item.get('DLV_DCM_SALE_AMT', 0))  # 배달
        packaging = parse_int(item.get('PKG_DCM_SALE_AMT', 0))  # 포장
        total_sale = parse_int(item.get('DCM_SALE_AMT', 0))  # 실매출
        sale_count = parse_int(item.get('TOT_SALE_CNT', 0))  # 영수건수
        customers = parse_int(item.get('FD_GST_CNT_T', 0))  # 고객수
        
        # 실매출이 없으면 합계로 계산
        if total_sale == 0:
            total_sale = hall + delivery + packaging
        
        # 일별-지점별 데이터
        daily_data[date_str][shop_cd]["hall"] += hall
        daily_data[date_str][shop_cd]["delivery"] += delivery
        daily_data[date_str][shop_cd]["packaging"] += packaging
        daily_data[date_str][shop_cd]["total"] += total_sale
        daily_data[date_str][shop_cd]["count"] += sale_count
        daily_data[date_str][shop_cd]["customers"] += customers
        
        # 지점별 전체 집계
        store_totals[shop_cd]["hall"] += hall
        store_totals[shop_cd]["delivery"] += delivery
        store_totals[shop_cd]["packaging"] += packaging
        store_totals[shop_cd]["total"] += total_sale
        store_totals[shop_cd]["count"] += sale_count
        store_totals[shop_cd]["customers"] += customers
        store_totals[shop_cd]["days"].add(date_str)
        
        # 일별 전체 집계
        daily_totals[date_str]["hall"] += hall
        daily_totals[date_str]["delivery"] += delivery
        daily_totals[date_str]["packaging"] += packaging
        daily_totals[date_str]["total"] += total_sale
        daily_totals[date_str]["count"] += sale_count
        daily_totals[date_str]["customers"] += customers
        daily_totals[date_str]["stores"].add(shop_cd)
        
        # 전체 집계
        total_stats["total_sales"] += total_sale
        total_stats["total_hall"] += hall
        total_stats["total_delivery"] += delivery
        total_stats["total_packaging"] += packaging
        total_stats["total_count"] += sale_count
        total_stats["total_customers"] += customers
    
    # 날짜 정렬
    sorted_dates = sorted(all_dates)
    
    # 주별 집계
    weekly_totals = defaultdict(lambda: {
        "hall": 0,
        "delivery": 0,
        "packaging": 0,
        "total": 0,
        "count": 0,
        "customers": 0,
        "days": 0
    })
    
    for date_str, day_data in daily_totals.items():
        week_key = get_week_key(date_str)
        if week_key:
            weekly_totals[week_key]["hall"] += day_data["hall"]
            weekly_totals[week_key]["delivery"] += day_data["delivery"]
            weekly_totals[week_key]["packaging"] += day_data["packaging"]
            weekly_totals[week_key]["total"] += day_data["total"]
            weekly_totals[week_key]["count"] += day_data["count"]
            weekly_totals[week_key]["customers"] += day_data["customers"]
            weekly_totals[week_key]["days"] += 1
    
    # 월별 집계
    monthly_totals = defaultdict(lambda: {
        "hall": 0,
        "delivery": 0,
        "packaging": 0,
        "total": 0,
        "count": 0,
        "customers": 0,
        "days": 0
    })
    
    for date_str, day_data in daily_totals.items():
        month_key = get_month_key(date_str)
        if month_key:
            monthly_totals[month_key]["hall"] += day_data["hall"]
            monthly_totals[month_key]["delivery"] += day_data["delivery"]
            monthly_totals[month_key]["packaging"] += day_data["packaging"]
            monthly_totals[month_key]["total"] += day_data["total"]
            monthly_totals[month_key]["count"] += day_data["count"]
            monthly_totals[month_key]["customers"] += day_data["customers"]
            monthly_totals[month_key]["days"] += 1
    
    # 지점 리스트 생성 (이름순 정렬)
    store_list = []
    for shop_cd, totals in store_totals.items():
        store_info = stores.get(shop_cd, {})
        store_list.append({
            "code": shop_cd,
            "name": store_info.get("name", shop_cd),
            "hall": totals["hall"],
            "delivery": totals["delivery"],
            "packaging": totals["packaging"],
            "total": totals["total"],
            "count": totals["count"],
            "customers": totals["customers"],
            "days": len(totals["days"])
        })
    
    # 일별 데이터 정리
    daily_list = []
    for date_str in sorted_dates:
        day_data = daily_totals[date_str]
        daily_list.append({
            "date": format_date(date_str),
            "date_raw": date_str,
            "hall": day_data["hall"],
            "delivery": day_data["delivery"],
            "packaging": day_data["packaging"],
            "total": day_data["total"],
            "count": day_data["count"],
            "customers": day_data["customers"],
            "stores": len(day_data["stores"])
        })
    
    # 일별-지점별 상세 데이터
    daily_store_data = {}
    for date_str, store_data in daily_data.items():
        formatted_date = format_date(date_str)
        daily_store_data[formatted_date] = []
        for shop_cd, values in store_data.items():
            store_info = stores.get(shop_cd, {})
            daily_store_data[formatted_date].append({
                "code": shop_cd,
                "name": store_info.get("name", shop_cd),
                "hall": values["hall"],
                "delivery": values["delivery"],
                "packaging": values["packaging"],
                "total": values["total"],
                "count": values["count"],
                "customers": values["customers"]
            })
    
    # 주별 리스트
    weekly_list = []
    for week_key in sorted(weekly_totals.keys()):
        week_data = weekly_totals[week_key]
        weekly_list.append({
            "week": week_key,
            "hall": week_data["hall"],
            "delivery": week_data["delivery"],
            "packaging": week_data["packaging"],
            "total": week_data["total"],
            "count": week_data["count"],
            "customers": week_data["customers"],
            "days": week_data["days"]
        })
    
    # 월별 리스트
    monthly_list = []
    for month_key in sorted(monthly_totals.keys()):
        month_data = monthly_totals[month_key]
        monthly_list.append({
            "month": month_key,
            "hall": month_data["hall"],
            "delivery": month_data["delivery"],
            "packaging": month_data["packaging"],
            "total": month_data["total"],
            "count": month_data["count"],
            "customers": month_data["customers"],
            "days": month_data["days"]
        })
    
    print(f"[INFO] Stores: {len(store_list)}")
    print(f"[INFO] Days: {len(daily_list)}")
    print(f"[INFO] Weeks: {len(weekly_list)}")
    print(f"[INFO] Months: {len(monthly_list)}")
    
    # 리포트 생성
    report = {
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_records": len(data),
            "total_stores": len(stores),
            "total_days": len(sorted_dates),
            "date_range": {
                "start": format_date(sorted_dates[0]) if sorted_dates else None,
                "end": format_date(sorted_dates[-1]) if sorted_dates else None
            },
            "total_sales": total_stats["total_sales"],
            "total_hall": total_stats["total_hall"],
            "total_delivery": total_stats["total_delivery"],
            "total_packaging": total_stats["total_packaging"],
            "total_count": total_stats["total_count"],
            "total_customers": total_stats["total_customers"]
        },
        "stores": store_list,
        "daily": daily_list,
        "daily_detail": daily_store_data,
        "weekly": weekly_list,
        "monthly": monthly_list,
        "month_list": sorted(monthly_totals.keys(), reverse=True)
    }
    
    save_report(report)


def create_empty_report():
    """빈 리포트 생성"""
    return {
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_records": 0,
            "total_stores": 0,
            "total_days": 0,
            "date_range": {"start": None, "end": None},
            "total_sales": 0,
            "total_hall": 0,
            "total_delivery": 0,
            "total_packaging": 0,
            "total_count": 0,
            "total_customers": 0
        },
        "stores": [],
        "daily": [],
        "daily_detail": {},
        "weekly": [],
        "monthly": [],
        "month_list": []
    }


def save_report(report):
    """리포트 저장"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # output 폴더
    output_dir = os.path.join(script_dir, "output")
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, "sales_report.json")
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"[SAVE] {output_file}")
    
    # docs 폴더
    docs_dir = os.path.join(script_dir, "docs")
    os.makedirs(docs_dir, exist_ok=True)
    docs_file = os.path.join(docs_dir, "sales_data.json")
    
    with open(docs_file, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False)
    print(f"[SAVE] {docs_file}")
    
    print(f"\n[DONE] Report generated:")
    print(f"  - Stores: {len(report.get('stores', []))}")
    print(f"  - Daily: {len(report.get('daily', []))}")
    print(f"  - Weekly: {len(report.get('weekly', []))}")
    print(f"  - Monthly: {len(report.get('monthly', []))}")


if __name__ == "__main__":
    generate_report()
