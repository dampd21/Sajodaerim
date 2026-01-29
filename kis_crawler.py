# -*- coding: utf-8 -*-
"""
KIS POS 매출 데이터 크롤러
- OKPos KIS 시스템에서 일별 매출 데이터 수집
- IBSheet(mySheet1)에서 데이터 추출
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime, timedelta
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import TimeoutException
from webdriver_manager.chrome import ChromeDriverManager


def setup_driver():
    """Chrome 드라이버 설정"""
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')
    
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    return driver


def login_to_kis(driver):
    """KIS 시스템 로그인"""
    user_id = os.environ.get('KIS_USER_ID')
    user_pwd = os.environ.get('KIS_USER_PWD')
    
    if not user_id or not user_pwd:
        raise ValueError("로그인 정보가 설정되지 않았습니다. GitHub Secrets를 확인하세요.")
    
    wait = WebDriverWait(driver, 15)
    
    print("[LOGIN] 로그인 페이지 접속 중...")
    driver.get("https://kis.okpos.co.kr/login/login_form.jsp")
    time.sleep(2)
    
    print("[LOGIN] 아이디 입력...")
    user_id_input = wait.until(
        EC.presence_of_element_located((By.ID, "user_id"))
    )
    user_id_input.clear()
    user_id_input.send_keys(user_id)
    
    print("[LOGIN] 비밀번호 입력...")
    user_pwd_input = driver.find_element(By.ID, "user_pwd")
    user_pwd_input.clear()
    user_pwd_input.send_keys(user_pwd)
    
    print("[LOGIN] 로그인 버튼 클릭...")
    login_button = driver.find_element(
        By.XPATH, 
        "//img[@onclick='doSubmit();']"
    )
    login_button.click()
    time.sleep(3)
    
    # 패스워드 변경 팝업 닫기
    try:
        close_button = WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable(
                (By.XPATH, "//button[@onclick=\"fnDivPopupHide();\"]")
            )
        )
        print("[LOGIN] 패스워드 변경 팝업 닫기...")
        close_button.click()
        time.sleep(1)
    except TimeoutException:
        print("[LOGIN] 패스워드 변경 팝업 없음")
    
    print("[LOGIN] 로그인 완료!")
    return True


def navigate_to_sales_page(driver):
    """매출관리 > 일자별 페이지로 이동"""
    wait = WebDriverWait(driver, 15)
    
    print("\n[NAV] 매출관리 메뉴 이동...")
    
    # 1. 매출관리 메뉴 클릭
    print("[NAV] 1. 매출관리 클릭...")
    sales_menu = wait.until(
        EC.element_to_be_clickable((By.ID, "cswmMenuButtonGroup_15"))
    )
    sales_menu.click()
    time.sleep(1)
    
    # 2. 일자별 메뉴 클릭
    print("[NAV] 2. 일자별 클릭...")
    daily_menu = wait.until(
        EC.element_to_be_clickable((By.ID, "cswmItem8_51"))
    )
    daily_menu.click()
    time.sleep(3)
    
    print("[NAV] 일자별 매출 페이지 이동 완료!")
    return True


def set_date_and_search(driver, start_date, end_date):
    """날짜 설정 및 조회 실행"""
    wait = WebDriverWait(driver, 15)
    
    print(f"\n[SEARCH] 조회 기간: {start_date} ~ {end_date}")
    
    # 시작일 설정
    date1_input = wait.until(
        EC.presence_of_element_located((By.ID, "date1_1"))
    )
    driver.execute_script(f"arguments[0].value = '{start_date}';", date1_input)
    time.sleep(0.3)
    
    # 종료일 설정
    date2_input = driver.find_element(By.ID, "date1_2")
    driver.execute_script(f"arguments[0].value = '{end_date}';", date2_input)
    time.sleep(0.3)
    
    # 조회 버튼 클릭
    print("[SEARCH] 조회 버튼 클릭...")
    search_button = wait.until(
        EC.element_to_be_clickable(
            (By.XPATH, "//button[@onclick='fnSearch();']")
        )
    )
    search_button.click()
    
    # 데이터 로딩 대기
    print("[SEARCH] 데이터 로딩 중...")
    time.sleep(5)
    
    return True


def extract_sales_data(driver):
    """IBSheet에서 매출 데이터 추출"""
    
    data = driver.execute_script("""
        var data = [];
        var rowCount = mySheet1.RowCount();
        
        for (var i = 1; i <= rowCount; i++) {
            var row = mySheet1.GetRowData(i);
            
            // 헤더 행 제외 (SALE_DATE가 "일자"인 경우)
            if (row.SALE_DATE === "일자") continue;
            
            // 소계 행 제외 (SALE_DATE가 "소계:"로 시작하는 경우)
            if (row.SALE_DATE && row.SALE_DATE.toString().startsWith("소계:")) continue;
            
            // 합계 행 제외
            if (row.SALE_DATE && row.SALE_DATE.toString().includes("합계")) continue;
            
            data.push(row);
        }
        return data;
    """)
    
    print(f"[EXTRACT] 추출된 데이터: {len(data)}건")
    return data


def load_existing_data(file_path):
    """기존 데이터 로드"""
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []


def save_data(data, file_path):
    """데이터 저장"""
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[SAVE] 데이터 저장: {file_path} ({len(data)}건)")


def merge_data(existing_data, new_data, force=False):
    """기존 데이터와 새 데이터 병합"""
    if force:
        # 강제 재수집: 새 데이터의 날짜 범위에 해당하는 기존 데이터 삭제
        new_dates = set(row.get('SALE_DATE') for row in new_data if row.get('SALE_DATE'))
        existing_data = [row for row in existing_data if row.get('SALE_DATE') not in new_dates]
        print(f"[MERGE] 강제 모드: {len(new_dates)}일 데이터 교체")
    
    # 기존 데이터를 (날짜, 매장코드)로 인덱싱
    existing_keys = set()
    for row in existing_data:
        key = (row.get('SALE_DATE'), row.get('SHOP_CD'))
        existing_keys.add(key)
    
    # 새 데이터 중 중복되지 않는 것만 추가
    added_count = 0
    for row in new_data:
        key = (row.get('SALE_DATE'), row.get('SHOP_CD'))
        if key not in existing_keys:
            existing_data.append(row)
            existing_keys.add(key)
            added_count += 1
    
    print(f"[MERGE] 새로 추가: {added_count}건")
    
    # 날짜순 정렬
    existing_data.sort(key=lambda x: (x.get('SALE_DATE', ''), x.get('SHOP_CD', '')))
    
    return existing_data


def main():
    parser = argparse.ArgumentParser(description='KIS POS 매출 데이터 크롤러')
    parser.add_argument('--start-date', type=str, help='시작일 (YYYY-MM-DD)')
    parser.add_argument('--end-date', type=str, help='종료일 (YYYY-MM-DD)')
    parser.add_argument('--force', action='store_true', help='강제 재수집')
    args = parser.parse_args()
    
    # 기본값: 어제 ~ 오늘
    today = datetime.now()
    if args.start_date:
        start_date = args.start_date
    else:
        start_date = (today - timedelta(days=1)).strftime('%Y-%m-%d')
    
    if args.end_date:
        end_date = args.end_date
    else:
        end_date = today.strftime('%Y-%m-%d')
    
    print("=" * 60)
    print("KIS POS 매출 데이터 크롤러")
    print("=" * 60)
    print(f"수집 기간: {start_date} ~ {end_date}")
    print(f"강제 재수집: {args.force}")
    print("=" * 60)
    
    driver = None
    try:
        # 드라이버 설정
        driver = setup_driver()
        
        # 로그인
        login_to_kis(driver)
        
        # 매출 페이지 이동
        navigate_to_sales_page(driver)
        
        # 날짜 설정 및 조회
        set_date_and_search(driver, start_date, end_date)
        
        # 데이터 추출
        new_data = extract_sales_data(driver)
        
        if not new_data:
            print("[WARN] 수집된 데이터가 없습니다.")
            return
        
        # 기존 데이터 로드
        data_file = 'output/data/sales_data.json'
        existing_data = load_existing_data(data_file)
        print(f"[INFO] 기존 데이터: {len(existing_data)}건")
        
        # 데이터 병합
        merged_data = merge_data(existing_data, new_data, args.force)
        print(f"[INFO] 전체 데이터: {len(merged_data)}건")
        
        # 저장
        save_data(merged_data, data_file)
        
        print("\n" + "=" * 60)
        print("크롤링 완료!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n[ERROR] 오류 발생: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
        
    finally:
        if driver:
            driver.quit()


if __name__ == "__main__":
    main()
