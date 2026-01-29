#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
KIS POS 매출 데이터 크롤러
- OKPos KIS 시스템에서 일별 매출 데이터 수집
- 메뉴: 매출관리 > 매출현황 > 일자별 (모두 메인 document)
- 콘텐츠: MainFrm
"""

from __future__ import print_function
import sys
import os

print("=" * 60, flush=True)
print("KIS Crawler Script Started", flush=True)
print("=" * 60, flush=True)
print(f"Python version: {sys.version}", flush=True)
print(f"Current directory: {os.getcwd()}", flush=True)
sys.stdout.flush()

import json
import time
import argparse
from datetime import datetime, timedelta

print("Basic imports completed", flush=True)
sys.stdout.flush()

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.service import Service
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
    print("Selenium imports completed", flush=True)
except ImportError as e:
    print(f"Selenium import error: {e}", flush=True)
    sys.exit(1)

try:
    from webdriver_manager.chrome import ChromeDriverManager
    print("WebDriver Manager import completed", flush=True)
except ImportError as e:
    print(f"WebDriver Manager import error: {e}", flush=True)
    sys.exit(1)

sys.stdout.flush()


def setup_driver():
    """Chrome 드라이버 설정"""
    print("[SETUP] Chrome 드라이버 설정 중...", flush=True)
    
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')
    
    try:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
        print("[SETUP] Chrome 드라이버 설정 완료", flush=True)
        return driver
    except Exception as e:
        print(f"[SETUP] Chrome 드라이버 설정 실패: {e}", flush=True)
        raise


def login_to_kis(driver):
    """KIS 시스템 로그인"""
    user_id = os.environ.get('KIS_USER_ID')
    user_pwd = os.environ.get('KIS_USER_PWD')
    
    print(f"[LOGIN] 환경변수 확인 - ID 설정: {bool(user_id)}, PWD 설정: {bool(user_pwd)}", flush=True)
    
    if not user_id or not user_pwd:
        raise ValueError("로그인 정보가 설정되지 않았습니다. GitHub Secrets를 확인하세요.")
    
    wait = WebDriverWait(driver, 15)
    
    print("[LOGIN] 로그인 페이지 접속 중...", flush=True)
    driver.get("https://kis.okpos.co.kr/login/login_form.jsp")
    time.sleep(2)
    
    print("[LOGIN] 아이디 입력...", flush=True)
    user_id_input = wait.until(
        EC.presence_of_element_located((By.ID, "user_id"))
    )
    user_id_input.clear()
    user_id_input.send_keys(user_id)
    
    print("[LOGIN] 비밀번호 입력...", flush=True)
    user_pwd_input = driver.find_element(By.ID, "user_pwd")
    user_pwd_input.clear()
    user_pwd_input.send_keys(user_pwd)
    
    print("[LOGIN] 로그인 버튼 클릭...", flush=True)
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
        print("[LOGIN] 패스워드 변경 팝업 닫기...", flush=True)
        close_button.click()
        time.sleep(1)
    except TimeoutException:
        print("[LOGIN] 패스워드 변경 팝업 없음", flush=True)
    
    print("[LOGIN] 로그인 완료!", flush=True)
    return True


def navigate_to_sales_page(driver):
    """매출관리 > 매출현황 > 일자별 페이지로 이동"""
    wait = WebDriverWait(driver, 15)
    
    print("\n[NAV] 매출관리 > 매출현황 > 일자별 이동...", flush=True)
    
    # 메인 document로 전환
    driver.switch_to.default_content()
    time.sleep(1)
    
    # 1. 매출관리 메뉴 클릭
    print("[NAV] 1. 매출관리 클릭...", flush=True)
    try:
        sales_menu = wait.until(
            EC.element_to_be_clickable((By.ID, "cswmMenuButtonGroup_15"))
        )
        sales_menu.click()
        print("[NAV] 매출관리 클릭 성공", flush=True)
    except Exception as e:
        print(f"[NAV] 매출관리 일반 클릭 실패: {e}", flush=True)
        try:
            driver.execute_script("cswmButtonDown('cswmMenuButtonGroup_15', 'Group_15');")
            print("[NAV] 매출관리 JavaScript 클릭 성공", flush=True)
        except Exception as e2:
            print(f"[NAV] 매출관리 JavaScript 클릭도 실패: {e2}", flush=True)
            raise
    
    time.sleep(2)
    
    # 2. 매출현황 클릭 (메인 document에서)
    print("[NAV] 2. 매출현황 클릭...", flush=True)
    driver.switch_to.default_content()
    
    try:
        sales_status = wait.until(
            EC.element_to_be_clickable((By.ID, "cswmItemGroup_15_8"))
        )
        sales_status.click()
        print("[NAV] 매출현황 클릭 성공", flush=True)
    except Exception as e:
        print(f"[NAV] 매출현황 일반 클릭 실패: {e}", flush=True)
        try:
            driver.execute_script("""
                var el = document.getElementById('cswmItemGroup_15_8');
                if (el) el.click();
            """)
            print("[NAV] 매출현황 JavaScript 클릭 성공", flush=True)
        except Exception as e2:
            print(f"[NAV] 매출현황 JavaScript 클릭도 실패: {e2}", flush=True)
            raise
    
    time.sleep(2)
    
    # 3. 일자별 클릭 (메인 document에서)
    print("[NAV] 3. 일자별 클릭...", flush=True)
    driver.switch_to.default_content()
    
    try:
        daily_menu = wait.until(
            EC.element_to_be_clickable((By.ID, "cswmItem8_51"))
        )
        daily_menu.click()
        print("[NAV] 일자별 클릭 성공", flush=True)
    except Exception as e:
        print(f"[NAV] 일자별 일반 클릭 실패: {e}", flush=True)
        try:
            driver.execute_script("""
                var el = document.getElementById('cswmItem8_51');
                if (el) el.click();
            """)
            print("[NAV] 일자별 JavaScript 클릭 성공", flush=True)
        except Exception as e2:
            print(f"[NAV] 일자별 JavaScript 클릭도 실패: {e2}", flush=True)
            raise
    
    time.sleep(3)
    
    print("[NAV] 일자별 매출 페이지 이동 완료!", flush=True)
    return True


def switch_to_main_frame(driver):
    """MainFrm으로 전환"""
    driver.switch_to.default_content()
    time.sleep(0.5)
    
    try:
        main_frame = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "MainFrm"))
        )
        driver.switch_to.frame(main_frame)
        print("[FRAME] MainFrm으로 전환 완료", flush=True)
        return True
    except Exception as e:
        print(f"[FRAME] MainFrm 전환 실패: {e}", flush=True)
        return False


def set_date_and_search(driver, start_date, end_date):
    """날짜 설정 및 조회 실행"""
    wait = WebDriverWait(driver, 15)
    
    print(f"\n[SEARCH] 조회 기간: {start_date} ~ {end_date}", flush=True)
    
    # MainFrm으로 전환
    if not switch_to_main_frame(driver):
        raise Exception("MainFrm 전환 실패")
    
    # 페이지 로딩 대기
    time.sleep(2)
    
    # 시작일 설정
    print("[SEARCH] 시작일 설정...", flush=True)
    try:
        date1_input = wait.until(
            EC.presence_of_element_located((By.ID, "date1_1"))
        )
        driver.execute_script(f"arguments[0].value = '{start_date}';", date1_input)
        print(f"[SEARCH] 시작일 설정 완료: {start_date}", flush=True)
    except Exception as e:
        print(f"[SEARCH] 시작일 설정 실패: {e}", flush=True)
        raise
    
    time.sleep(0.3)
    
    # 종료일 설정
    print("[SEARCH] 종료일 설정...", flush=True)
    try:
        date2_input = driver.find_element(By.ID, "date1_2")
        driver.execute_script(f"arguments[0].value = '{end_date}';", date2_input)
        print(f"[SEARCH] 종료일 설정 완료: {end_date}", flush=True)
    except Exception as e:
        print(f"[SEARCH] 종료일 설정 실패: {e}", flush=True)
        raise
    
    time.sleep(0.3)
    
    # 조회 버튼 클릭
    print("[SEARCH] 조회 버튼 클릭...", flush=True)
    try:
        search_button = wait.until(
            EC.element_to_be_clickable(
                (By.XPATH, "//button[@onclick='fnSearch();']")
            )
        )
        search_button.click()
        print("[SEARCH] 조회 버튼 클릭 성공", flush=True)
    except Exception as e:
        print(f"[SEARCH] 조회 버튼 클릭 실패, JavaScript 시도: {e}", flush=True)
        try:
            driver.execute_script("fnSearch();")
            print("[SEARCH] fnSearch() 직접 호출 성공", flush=True)
        except Exception as e2:
            print(f"[SEARCH] fnSearch() 호출 실패: {e2}", flush=True)
            raise
    
    # 데이터 로딩 대기
    print("[SEARCH] 데이터 로딩 중...", flush=True)
    time.sleep(5)
    
    return True


def extract_sales_data(driver):
    """IBSheet에서 매출 데이터 추출"""
    print("\n[EXTRACT] 데이터 추출 시작...", flush=True)
    
    # MainFrm 확인
    switch_to_main_frame(driver)
    
    # mySheet1 존재 확인
    try:
        sheet_exists = driver.execute_script("return typeof mySheet1 !== 'undefined';")
        print(f"[EXTRACT] mySheet1 존재: {sheet_exists}", flush=True)
        
        if not sheet_exists:
            print("[EXTRACT] mySheet1 객체가 없습니다", flush=True)
            return []
        
        row_count = driver.execute_script("return mySheet1.RowCount();")
        print(f"[EXTRACT] 총 행 수: {row_count}", flush=True)
        
    except Exception as e:
        print(f"[EXTRACT] 시트 확인 오류: {e}", flush=True)
        return []
    
    # 데이터 추출
    print("[EXTRACT] 데이터 추출 중...", flush=True)
    data = driver.execute_script("""
        var data = [];
        var rowCount = mySheet1.RowCount();
        
        for (var i = 1; i <= rowCount; i++) {
            var row = mySheet1.GetRowData(i);
            
            // 헤더 행 제외
            if (row.SALE_DATE === "일자") continue;
            
            // 소계 행 제외
            if (row.SALE_DATE && row.SALE_DATE.toString().startsWith("소계:")) continue;
            
            // 합계 행 제외
            if (row.SALE_DATE && row.SALE_DATE.toString().includes("합계")) continue;
            
            data.push(row);
        }
        return data;
    """)
    
    print(f"[EXTRACT] 추출된 데이터: {len(data)}건", flush=True)
    return data


def load_existing_data(file_path):
    """기존 데이터 로드"""
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            print(f"[LOAD] 기존 데이터 로드: {len(data)}건", flush=True)
            return data
    print("[LOAD] 기존 데이터 없음", flush=True)
    return []


def save_data(data, file_path):
    """데이터 저장"""
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"[SAVE] 데이터 저장: {file_path} ({len(data)}건)", flush=True)


def merge_data(existing_data, new_data, force=False):
    """기존 데이터와 새 데이터 병합"""
    print(f"\n[MERGE] 병합 시작 - 기존: {len(existing_data)}건, 신규: {len(new_data)}건", flush=True)
    
    if force:
        new_dates = set(row.get('SALE_DATE') for row in new_data if row.get('SALE_DATE'))
        existing_data = [row for row in existing_data if row.get('SALE_DATE') not in new_dates]
        print(f"[MERGE] 강제 모드: {len(new_dates)}일 데이터 교체", flush=True)
    
    existing_keys = set()
    for row in existing_data:
        key = (row.get('SALE_DATE'), row.get('SHOP_CD'))
        existing_keys.add(key)
    
    added_count = 0
    for row in new_data:
        key = (row.get('SALE_DATE'), row.get('SHOP_CD'))
        if key not in existing_keys:
            existing_data.append(row)
            existing_keys.add(key)
            added_count += 1
    
    print(f"[MERGE] 새로 추가: {added_count}건", flush=True)
    
    existing_data.sort(key=lambda x: (x.get('SALE_DATE', ''), x.get('SHOP_CD', '')))
    
    return existing_data


def main():
    print("\n" + "=" * 60, flush=True)
    print("main() 함수 시작", flush=True)
    print("=" * 60, flush=True)
    sys.stdout.flush()
    
    parser = argparse.ArgumentParser(description='KIS POS 매출 데이터 크롤러')
    parser.add_argument('--start-date', type=str, help='시작일 (YYYY-MM-DD)')
    parser.add_argument('--end-date', type=str, help='종료일 (YYYY-MM-DD)')
    parser.add_argument('--force', action='store_true', help='강제 재수집')
    args = parser.parse_args()
    
    print(f"Arguments parsed: start={args.start_date}, end={args.end_date}, force={args.force}", flush=True)
    
    today = datetime.now()
    if args.start_date:
        start_date = args.start_date
    else:
        start_date = (today - timedelta(days=1)).strftime('%Y-%m-%d')
    
    if args.end_date:
        end_date = args.end_date
    else:
        end_date = today.strftime('%Y-%m-%d')
    
    print("=" * 60, flush=True)
    print("KIS POS 매출 데이터 크롤러", flush=True)
    print("=" * 60, flush=True)
    print(f"수집 기간: {start_date} ~ {end_date}", flush=True)
    print(f"강제 재수집: {args.force}", flush=True)
    print("=" * 60, flush=True)
    sys.stdout.flush()
    
    driver = None
    try:
        driver = setup_driver()
        
        login_to_kis(driver)
        
        navigate_to_sales_page(driver)
        
        set_date_and_search(driver, start_date, end_date)
        
        new_data = extract_sales_data(driver)
        
        if not new_data:
            print("[WARN] 수집된 데이터가 없습니다.", flush=True)
            return
        
        data_file = 'output/data/sales_data.json'
        existing_data = load_existing_data(data_file)
        
        merged_data = merge_data(existing_data, new_data, args.force)
        print(f"[INFO] 전체 데이터: {len(merged_data)}건", flush=True)
        
        save_data(merged_data, data_file)
        
        print("\n" + "=" * 60, flush=True)
        print("크롤링 완료!", flush=True)
        print("=" * 60, flush=True)
        
    except Exception as e:
        print(f"\n[ERROR] 오류 발생: {str(e)}", flush=True)
        import traceback
        traceback.print_exc()
        sys.stdout.flush()
        sys.exit(1)
        
    finally:
        if driver:
            print("[CLEANUP] 브라우저 종료 중...", flush=True)
            driver.quit()
            print("[CLEANUP] 브라우저 종료 완료", flush=True)


if __name__ == "__main__":
    print("__main__ block started", flush=True)
    sys.stdout.flush()
    main()
    print("Script completed", flush=True)
    sys.stdout.flush()
