# -*- coding: utf-8 -*-
"""
사조 주문 데이터 크롤러 (GitHub Actions 버전)
- 헤드리스 모드로 실행
- 환경 변수에서 로그인 정보 로드
- 하루씩 데이터 수집
"""

import os
import sys
import time
import csv
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
        
        # 환경 변수에서 로그인 정보 로드 (GitHub Secrets)
        self.login_id = os.environ.get('LOGIN_ID', '900060')
        self.login_pwd = os.environ.get('LOGIN_PWD', '900060')
        
        # 저장 경로
        self.script_dir = os.path.dirname(os.path.abspath(__file__))
        self.output_dir = os.path.join(self.script_dir, "output")
        os.makedirs(self.output_dir, exist_ok=True)
        
        # CSV 헤더
        self.headers = [
            '조회일자', '주문코드', '지점명', '상품코드', '상품명', '규격',
            '수량', '단위', '단가', '공급가', '부가세', '합계', '대분류'
        ]
    
    def setup_driver(self):
        """Chrome WebDriver 설정 (헤드리스 모드)"""
        print("[INFO] Chrome WebDriver 설정 중...")
        
        try:
            chrome_options = Options()
            
            # 헤드리스 모드 (GitHub Actions에서 필수)
            chrome_options.add_argument("--headless=new")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--window-size=1920,1080")
            chrome_options.add_argument("--disable-blink-features=AutomationControlled")
            chrome_options.add_argument("--disable-extensions")
            chrome_options.add_argument("--disable-plugins")
            chrome_options.add_argument("--disable-images")  # 이미지 로딩 비활성화 (속도 향상)
            chrome_options.add_argument("--log-level=3")
            chrome_options.add_argument("--silent")
            chrome_options.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
            chrome_options.add_experimental_option('useAutomationExtension', False)
            
            # User-Agent 설정
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
        """로그인 수행"""
        print("[INFO] 로그인 시도 중...")
        self.driver.get(self.login_url)
        time.sleep(2)
        
        try:
            # ID 입력
            id_input = WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.ID, "LOGIN_ID"))
            )
            id_input.clear()
            id_input.send_keys(self.login_id)
            
            # Password 입력
            pwd_input = self.driver.find_element(By.ID, "LOGIN_PWD")
            pwd_input.clear()
            pwd_input.send_keys(self.login_pwd)
            
            # 로그인 버튼 클릭
            login_btn = self.driver.find_element(By.ID, "kt_login_signin_submit")
            login_btn.click()
            
            # 대기 후 엔터 (확인 팝업 처리)
            time.sleep(1.5)
            
            try:
                alert = WebDriverWait(self.driver, 2).until(EC.alert_is_present())
                alert.accept()
            except:
                ActionChains(self.driver).send_keys(Keys.ENTER).perform()
            
            time.sleep(2)
            
            # 로그인 확인
            if "Login" not in self.driver.current_url:
                print("[SUCCESS] 로그인 성공!")
                return True
            else:
                print("[ERROR] 로그인 실패 - 여전히 로그인 페이지")
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
            print(f"[ERROR] 조회 실패 ({target_date}): {e}")
            return False
    
    def parse_order_data(self, date_str):
        """주문 데이터 파싱"""
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
                        try:
                            clean = lambda x: x.replace(',', '').strip()
                            
                            data_list.append({
                                '조회일자': date_str,
                                '주문코드': first_td,
                                '지점명': tds[1].get_text(strip=True).replace('■ ', '').replace('■', ''),
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
                        except:
                            continue
        except Exception as e:
            print(f"[ERROR] 파싱 오류: {e}")
        
        return data_list
    
    def save_csv(self, data, filename, subdir=None):
        """CSV 저장"""
        if not data:
            return None
        
        if subdir:
            save_dir = os.path.join(self.output_dir, subdir)
            os.makedirs(save_dir, exist_ok=True)
        else:
            save_dir = self.output_dir
        
        filepath = os.path.join(save_dir, filename)
        
        with open(filepath, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=self.headers)
            writer.writeheader()
            writer.writerows(data)
        
        return filepath
    
    def save_all_results(self, all_data, start_date, end_date):
        """모든 결과 저장"""
        if not all_data:
            print("[WARN] 저장할 데이터 없음")
            return
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 1. 전체 데이터
        filename = f"전체데이터_{start_date}_{end_date}_{timestamp}.csv"
        self.save_csv(all_data, filename)
        print(f"[SAVE] 전체: {len(all_data):,}건")
        
        # 2. 대분류별
        by_category = defaultdict(list)
        for item in all_data:
            by_category[item.get('대분류', '기타')].append(item)
        
        for category, items in by_category.items():
            safe_name = re.sub(r'[\\/*?:"<>|]', '_', category)
            self.save_csv(items, f"{safe_name}.csv", "대분류별")
        print(f"[SAVE] 대분류별: {len(by_category)}개 카테고리")
        
        # 3. 지점별
        by_store = defaultdict(list)
        for item in all_data:
            by_store[item.get('지점명', '기타')].append(item)
        
        for store, items in by_store.items():
            safe_name = re.sub(r'[\\/*?:"<>|]', '_', store)
            self.save_csv(items, f"{safe_name}.csv", "지점별")
        print(f"[SAVE] 지점별: {len(by_store)}개 지점")
        
        # 4. 상품별
        by_product = defaultdict(list)
        for item in all_data:
            key = f"{item.get('상품코드', '')}_{item.get('상품명', '')}"
            by_product[key].append(item)
        
        product_dir = os.path.join(self.output_dir, "상품별")
        os.makedirs(product_dir, exist_ok=True)
        
        for key, items in by_product.items():
            safe_name = re.sub(r'[\\/*?:"<>|()]', '_', key)[:80]
            items_sorted = sorted(items, key=lambda x: x['조회일자'])
            self.save_csv(items_sorted, f"{safe_name}.csv", "상품별")
        print(f"[SAVE] 상품별: {len(by_product)}개 상품")
        
        # 5. 가격 변동 분석
        self.save_price_analysis(all_data)
    
    def save_price_analysis(self, all_data):
        """가격 변동 분석"""
        price_data = defaultdict(list)
        
        for item in all_data:
            key = (item['상품코드'], item['상품명'], item['대분류'])
            try:
                price = int(item['단가']) if item['단가'] else 0
                price_data[key].append({
                    '조회일자': item['조회일자'],
                    '단가': price
                })
            except:
                continue
        
        analysis = []
        
        for (code, name, category), records in price_data.items():
            if len(records) < 1:
                continue
            
            records_sorted = sorted(records, key=lambda x: x['조회일자'])
            prices = [r['단가'] for r in records_sorted if r['단가'] > 0]
            
            if not prices:
                continue
            
            first_price = prices[0]
            last_price = prices[-1]
            
            if first_price > 0:
                change = last_price - first_price
                change_pct = round((change / first_price) * 100, 2)
            else:
                change = 0
                change_pct = 0
            
            analysis.append({
                '상품코드': code,
                '상품명': name,
                '대분류': category,
                '첫날짜': records_sorted[0]['조회일자'],
                '마지막날짜': records_sorted[-1]['조회일자'],
                '첫가격': first_price,
                '마지막가격': last_price,
                '최저가': min(prices),
                '최고가': max(prices),
                '가격변동': change,
                '변동률': change_pct,
                '거래횟수': len(records_sorted)
            })
        
        # 변동률 기준 정렬
        analysis.sort(key=lambda x: abs(x['변동률']), reverse=True)
        
        # 저장
        filepath = os.path.join(self.output_dir, "가격변동_분석.csv")
        headers = ['상품코드', '상품명', '대분류', '첫날짜', '마지막날짜',
                   '첫가격', '마지막가격', '최저가', '최고가', '가격변동', '변동률', '거래횟수']
        
        with open(filepath, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()
            writer.writerows(analysis)
        
        print(f"[SAVE] 가격변동 분석: {len(analysis)}개 상품")
        
        # 상위 변동 출력
        if analysis:
            print("\n[INFO] 가격 변동 TOP 10:")
            for i, item in enumerate(analysis[:10], 1):
                arrow = "↑" if item['가격변동'] > 0 else "↓" if item['가격변동'] < 0 else "-"
                print(f"  {i:2}. {item['상품명'][:25]:25} | {arrow} {item['변동률']:+.1f}%")
    
    def run(self, start_date_str, end_date_str):
        """크롤링 실행"""
        print("=" * 70)
        print("  사조 주문 데이터 크롤러 (GitHub Actions)")
        print("=" * 70)
        print(f"  기간: {start_date_str} ~ {end_date_str}")
        print("=" * 70)
        
        if not self.setup_driver():
            sys.exit(1)
        
        try:
            if not self.login():
                sys.exit(1)
            
            print("\n[INFO] 주문 목록 페이지 이동...")
            self.driver.get(self.order_list_url)
            time.sleep(3)
            
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d")
            total_days = (end_date - start_date).days + 1
            
            all_data = []
            current_date = start_date
            day_count = 0
            
            print(f"\n[START] 수집 시작 (총 {total_days}일)")
            print("-" * 70)
            
            while current_date <= end_date:
                day_count += 1
                date_str = current_date.strftime("%Y-%m-%d")
                progress = (day_count / total_days) * 100
                
                print(f"[{day_count:4}/{total_days}] {date_str} ({progress:5.1f}%)", end="")
                
                if self.set_date_and_search(date_str):
                    daily_data = self.parse_order_data(date_str)
                    all_data.extend(daily_data)
                    print(f" → {len(daily_data):4}건")
                else:
                    print(" → 실패")
                
                current_date += timedelta(days=1)
                time.sleep(0.3)
            
            print("-" * 70)
            print(f"[COMPLETE] 총 수집: {len(all_data):,}건")
            
            if all_data:
                self.save_all_results(all_data, start_date_str, end_date_str)
            
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
    # 기본값
    start_date = "2025-01-01"
    end_date = "2025-01-31"
    
    # 명령행 인수
    if len(sys.argv) >= 3:
        start_date = sys.argv[1]
        end_date = sys.argv[2]
    
    # 날짜 유효성 검사
    try:
        datetime.strptime(start_date, "%Y-%m-%d")
        datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError:
        print("[ERROR] 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)")
        sys.exit(1)
    
    crawler = SajoCrawler()
    crawler.run(start_date, end_date)


if __name__ == "__main__":
    main()
