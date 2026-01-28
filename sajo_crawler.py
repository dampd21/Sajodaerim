# -*- coding: utf-8 -*-
"""
사조 주문 데이터 크롤러 (GitHub Actions 버전)
- 환경변수에서 로그인 정보 로드 (Secrets)
- 헤드리스 모드
- 하루씩 데이터 수집
"""

import os
import sys
import time
import csv
import json
from datetime import datetime, timedelta
from collections import defaultdict
import re

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup


class SajoCrawler:
    def __init__(self):
        self.driver = None
        self.base_url = "https://sajo-order.fusewith.com"
        self.login_url = f"{self.base_url}/Login/User_login.fuse"
        self.order_list_url = f"{self.base_url}/Franchise/Store_OrderList.fuse"
        
        # ⭐ 환경변수에서 로그인 정보 로드 (GitHub Secrets)
        self.login_id = os.environ.get('SAJO_LOGIN_ID')
        self.login_pwd = os.environ.get('SAJO_LOGIN_PWD')
        
        if not self.login_id or not self.login_pwd:
            print("[ERROR] 로그인 정보가 설정되지 않았습니다.")
            print("       GitHub Secrets에 SAJO_LOGIN_ID, SAJO_LOGIN_PWD를 설정하세요.")
            sys.exit(1)
        
        # 저장 경로
        self.script_dir = os.path.dirname(os.path.abspath(__file__))
        self.output_dir = os.path.join(self.script_dir, "output")
        self.data_dir = os.path.join(self.output_dir, "data")
        os.makedirs(self.data_dir, exist_ok=True)
        
        self.headers = [
            '조회일자', '주문코드', '지점명', '상품코드', '상품명', '규격',
            '수량', '단위', '단가', '공급가', '부가세', '합계', '대분류'
        ]
    
    def setup_driver(self):
        """Chrome WebDriver 설정"""
        print("[INFO] Chrome WebDriver 설정 중...")
        
        try:
            chrome_options = Options()
            chrome_options.add_argument("--headless=new")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--window-size=1920,1080")
            chrome_options.add_argument("--disable-blink-features=AutomationControlled")
            chrome_options.add_argument("--disable-extensions")
            chrome_options.add_argument("--disable-images")
            chrome_options.add_argument("--log-level=3")
            chrome_options.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
            chrome_options.add_argument(
                "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            
            service = Service(ChromeDriverManager().install())
            self.driver = webdriver.Chrome(service=service, options=chrome_options)
            self.driver.implicitly_wait(10)
            
            print("[SUCCESS] WebDriver 설정 완료!")
            return True
        except Exception as e:
            print(f"[ERROR] WebDriver 설정 실패: {e}")
            return False
    
    def login(self):
        """로그인"""
        print("[INFO] 로그인 시도 중...")
        self.driver.get(self.login_url)
        time.sleep(2)
        
        try:
            id_input = WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.ID, "LOGIN_ID"))
            )
            id_input.clear()
            id_input.send_keys(self.login_id)
            
            pwd_input = self.driver.find_element(By.ID, "LOGIN_PWD")
            pwd_input.clear()
            pwd_input.send_keys(self.login_pwd)
            
            login_btn = self.driver.find_element(By.ID, "kt_login_signin_submit")
            login_btn.click()
            
            time.sleep(1.5)
            
            try:
                alert = WebDriverWait(self.driver, 2).until(EC.alert_is_present())
                alert.accept()
            except:
                ActionChains(self.driver).send_keys(Keys.ENTER).perform()
            
            time.sleep(2)
            
            if "Login" not in self.driver.current_url:
                print("[SUCCESS] 로그인 성공!")
                return True
            return False
            
        except Exception as e:
            print(f"[ERROR] 로그인 실패: {e}")
            return False
    
    def set_date_and_search(self, target_date):
        """날짜 설정 및 조회"""
        try:
            self.driver.execute_script(f"""
                document.getElementById('SDATE').value = '{target_date}';
                document.getElementById('EDATE').value = '{target_date}';
            """)
            time.sleep(0.3)
            self.driver.execute_script("OnList();")
            time.sleep(1.5)
            return True
        except Exception as e:
            return False
    
    def parse_order_data(self, date_str):
        """데이터 파싱"""
        data_list = []
        
        try:
            soup = BeautifulSoup(self.driver.page_source, 'html.parser')
            rows = soup.find_all('tr')
            
            for row in rows:
                tds = row.find_all('td')
                
                if len(tds) == 12:
                    first_td = tds[0].get_text(strip=True)
                    fourth_td = tds[3].get_text(strip=True)
                    
                    if first_td and first_td.lstrip('-').isdigit() and len(first_td) >= 5 and fourth_td != '소계':
                        clean = lambda x: x.replace(',', '').strip()
                        
                        data_list.append({
                            '조회일자': date_str,
                            '주문코드': first_td,
                            '지점명': tds[1].get_text(strip=True).replace('■ ', '').replace('■', '').strip(),
                            '상품코드': tds[2].get_text(strip=True),
                            '상품명': tds[3].get_text(strip=True),
                            '규격': tds[4].get_text(strip=True),
                            '수량': clean(tds[5].get_text(strip=True)),
                            '단위': tds[6].get_text(strip=True),
                            '단가': clean(tds[7].get_text(strip=True)),
                            '공급가': clean(tds[8].get_text(strip=True)),
                            '부가세': clean(tds[9].get_text(strip=True)),
                            '합계': clean(tds[10].get_text(strip=True)),
                            '대분류': tds[11].get_text(strip=True)
                        })
        except Exception as e:
            print(f"[ERROR] 파싱 오류: {e}")
        
        return data_list
    
    def load_existing_data(self):
        """기존 데이터 로드"""
        master_file = os.path.join(self.data_dir, "master_data.json")
        if os.path.exists(master_file):
            try:
                with open(master_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                pass
        return []
    
    def save_master_data(self, all_data):
        """마스터 데이터 저장 (JSON)"""
        master_file = os.path.join(self.data_dir, "master_data.json")
        with open(master_file, 'w', encoding='utf-8') as f:
            json.dump(all_data, f, ensure_ascii=False, indent=2)
        print(f"[SAVE] 마스터 데이터: {len(all_data):,}건")
    
    def save_csv_files(self, all_data, start_date, end_date):
        """CSV 파일 저장"""
        if not all_data:
            return
        
        # 전체 데이터 CSV
        csv_file = os.path.join(self.output_dir, f"전체데이터_{start_date}_{end_date}.csv")
        with open(csv_file, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=self.headers)
            writer.writeheader()
            writer.writerows(all_data)
        
        # 대분류별
        by_category = defaultdict(list)
        for item in all_data:
            by_category[item.get('대분류', '기타')].append(item)
        
        cat_dir = os.path.join(self.output_dir, "대분류별")
        os.makedirs(cat_dir, exist_ok=True)
        for cat, items in by_category.items():
            safe_name = re.sub(r'[\\/*?:"<>|]', '_', cat)
            with open(os.path.join(cat_dir, f"{safe_name}.csv"), 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.DictWriter(f, fieldnames=self.headers)
                writer.writeheader()
                writer.writerows(items)
        
        # 지점별
        by_store = defaultdict(list)
        for item in all_data:
            by_store[item.get('지점명', '기타')].append(item)
        
        store_dir = os.path.join(self.output_dir, "지점별")
        os.makedirs(store_dir, exist_ok=True)
        for store, items in by_store.items():
            safe_name = re.sub(r'[\\/*?:"<>|]', '_', store)
            with open(os.path.join(store_dir, f"{safe_name}.csv"), 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.DictWriter(f, fieldnames=self.headers)
                writer.writeheader()
                writer.writerows(items)
        
        print(f"[SAVE] CSV 파일 저장 완료")
    
    def run(self, start_date_str, end_date_str):
        """크롤링 실행"""
        print("=" * 70)
        print("  사조 주문 데이터 크롤러")
        print("=" * 70)
        print(f"  기간: {start_date_str} ~ {end_date_str}")
        print("=" * 70)
        
        if not self.setup_driver():
            sys.exit(1)
        
        try:
            if not self.login():
                sys.exit(1)
            
            self.driver.get(self.order_list_url)
            time.sleep(3)
            
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
            total_days = (end_date - start_date).days + 1
            
            # 기존 데이터 로드
            existing_data = self.load_existing_data()
            existing_dates = set(item['조회일자'] for item in existing_data)
            
            new_data = []
            current_date = start_date
            day_count = 0
            
            print(f"\n[START] 수집 시작 (총 {total_days}일)")
            print("-" * 70)
            
            while current_date <= end_date:
                day_count += 1
                date_str = current_date.strftime("%Y-%m-%d")
                progress = (day_count / total_days) * 100
                
                # 이미 수집된 날짜는 스킵
                if date_str in existing_dates:
                    print(f"[{day_count:4}/{total_days}] {date_str} ({progress:5.1f}%) → 이미 수집됨 (스킵)")
                    current_date += timedelta(days=1)
                    continue
                
                print(f"[{day_count:4}/{total_days}] {date_str} ({progress:5.1f}%)", end="")
                
                if self.set_date_and_search(date_str):
                    daily_data = self.parse_order_data(date_str)
                    new_data.extend(daily_data)
                    print(f" → {len(daily_data):4}건")
                else:
                    print(" → 실패")
                
                current_date += timedelta(days=1)
                time.sleep(0.3)
            
            print("-" * 70)
            print(f"[COMPLETE] 신규 수집: {len(new_data):,}건")
            
            # 데이터 병합 및 저장
            all_data = existing_data + new_data
            all_data.sort(key=lambda x: x['조회일자'])
            
            self.save_master_data(all_data)
            self.save_csv_files(new_data, start_date_str, end_date_str)
            
            print(f"[INFO] 전체 데이터: {len(all_data):,}건")
            print("\n" + "=" * 70)
            print("  크롤링 완료!")
            print("=" * 70)
            
        except Exception as e:
            print(f"[ERROR] {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)
        finally:
            if self.driver:
                self.driver.quit()


def main():
    start_date = "2025-01-01"
    end_date = "2025-01-31"
    
    if len(sys.argv) >= 3:
        start_date = sys.argv[1]
        end_date = sys.argv[2]
    
    try:
        datetime.strptime(start_date, "%Y-%m-%d")
        datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError:
        print("[ERROR] 날짜 형식 오류 (YYYY-MM-DD)")
        sys.exit(1)
    
    crawler = SajoCrawler()
    crawler.run(start_date, end_date)


if __name__ == "__main__":
    main()
