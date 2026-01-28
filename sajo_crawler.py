# -*- coding: utf-8 -*-
"""
사조 주문 데이터 크롤러 (GitHub Actions)
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
        
        self.login_id = os.environ.get('SAJO_LOGIN_ID')
        self.login_pwd = os.environ.get('SAJO_LOGIN_PWD')
        
        if not self.login_id or not self.login_pwd:
            print("[ERROR] Login credentials not set.")
            print("       Set SAJO_LOGIN_ID and SAJO_LOGIN_PWD in GitHub Secrets.")
            sys.exit(1)
        
        self.script_dir = os.path.dirname(os.path.abspath(__file__))
        self.output_dir = os.path.join(self.script_dir, "output")
        self.data_dir = os.path.join(self.output_dir, "data")
        os.makedirs(self.data_dir, exist_ok=True)
        
        self.headers = [
            '조회일자', '주문코드', '지점명', '상품코드', '상품명', '규격',
            '수량', '단위', '단가', '공급가', '부가세', '합계', '대분류'
        ]
    
    def setup_driver(self):
        print("[INFO] Setting up Chrome WebDriver...")
        
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
            
            print("[SUCCESS] WebDriver ready.")
            return True
        except Exception as e:
            print(f"[ERROR] WebDriver setup failed: {e}")
            return False
    
    def login(self):
        print("[INFO] Logging in...")
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
                print("[SUCCESS] Login successful.")
                return True
            return False
            
        except Exception as e:
            print(f"[ERROR] Login failed: {e}")
            return False
    
    def set_date_and_search(self, target_date):
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
            print(f"[ERROR] Parse error: {e}")
        
        return data_list
    
    def load_existing_data(self):
        master_file = os.path.join(self.data_dir, "master_data.json")
        if os.path.exists(master_file):
            try:
                with open(master_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                pass
        return []
    
    def save_master_data(self, all_data):
        master_file = os.path.join(self.data_dir, "master_data.json")
        with open(master_file, 'w', encoding='utf-8') as f:
            json.dump(all_data, f, ensure_ascii=False, indent=2)
        print(f"[SAVE] Master data: {len(all_data):,} records")
    
    def save_csv_files(self, all_data, start_date, end_date):
        if not all_data:
            return
        
        csv_file = os.path.join(self.output_dir, f"full_data_{start_date}_{end_date}.csv")
        with open(csv_file, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=self.headers)
            writer.writeheader()
            writer.writerows(all_data)
        
        by_category = defaultdict(list)
        for item in all_data:
            by_category[item.get('대분류', 'etc')].append(item)
        
        cat_dir = os.path.join(self.output_dir, "by_category")
        os.makedirs(cat_dir, exist_ok=True)
        for cat, items in by_category.items():
            safe_name = re.sub(r'[\\/*?:"<>|]', '_', cat)
            with open(os.path.join(cat_dir, f"{safe_name}.csv"), 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.DictWriter(f, fieldnames=self.headers)
                writer.writeheader()
                writer.writerows(items)
        
        by_store = defaultdict(list)
        for item in all_data:
            by_store[item.get('지점명', 'etc')].append(item)
        
        store_dir = os.path.join(self.output_dir, "by_store")
        os.makedirs(store_dir, exist_ok=True)
        for store, items in by_store.items():
            safe_name = re.sub(r'[\\/*?:"<>|]', '_', store)
            with open(os.path.join(store_dir, f"{safe_name}.csv"), 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.DictWriter(f, fieldnames=self.headers)
                writer.writeheader()
                writer.writerows(items)
        
        print(f"[SAVE] CSV files saved.")
    
    def run(self, start_date_str, end_date_str):
        print("=" * 70)
        print("  Sajo Order Data Crawler")
        print("=" * 70)
        print(f"  Period: {start_date_str} ~ {end_date_str}")
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
            
            existing_data = self.load_existing_data()
            existing_dates = set(item['조회일자'] for item in existing_data)
            
            new_data = []
            current_date = start_date
            day_count = 0
            
            print(f"\n[START] Collecting data ({total_days} days)")
            print("-" * 70)
            
            while current_date <= end_date:
                day_count += 1
                date_str = current_date.strftime("%Y-%m-%d")
                progress = (day_count / total_days) * 100
                
                if date_str in existing_dates:
                    print(f"[{day_count:4}/{total_days}] {date_str} ({progress:5.1f}%) -> Already exists (skip)")
                    current_date += timedelta(days=1)
                    continue
                
                print(f"[{day_count:4}/{total_days}] {date_str} ({progress:5.1f}%)", end="")
                
                if self.set_date_and_search(date_str):
                    daily_data = self.parse_order_data(date_str)
                    new_data.extend(daily_data)
                    print(f" -> {len(daily_data):4} records")
                else:
                    print(" -> Failed")
                
                current_date += timedelta(days=1)
                time.sleep(0.3)
            
            print("-" * 70)
            print(f"[COMPLETE] New data: {len(new_data):,} records")
            
            all_data = existing_data + new_data
            all_data.sort(key=lambda x: x['조회일자'])
            
            self.save_master_data(all_data)
            self.save_csv_files(new_data, start_date_str, end_date_str)
            
            print(f"[INFO] Total data: {len(all_data):,} records")
            print("\n" + "=" * 70)
            print("  Crawling Complete!")
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
        print("[ERROR] Invalid date format (YYYY-MM-DD)")
        sys.exit(1)
    
    crawler = SajoCrawler()
    crawler.run(start_date, end_date)


if __name__ == "__main__":
    main()
