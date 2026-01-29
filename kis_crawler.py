def navigate_to_sales_page(driver):
    """매출관리 > 매출현황 > 일자별 페이지로 이동"""
    wait = WebDriverWait(driver, 15)
    
    print("\n[NAV] 매출관리 > 매출현황 > 일자별 이동...")
    
    # 메인 document로 전환
    driver.switch_to.default_content()
    time.sleep(1)
    
    # 1. 매출관리 메뉴 클릭
    print("[NAV] 1. 매출관리 클릭...")
    try:
        sales_menu = wait.until(
            EC.element_to_be_clickable((By.ID, "cswmMenuButtonGroup_15"))
        )
        sales_menu.click()
        print("[NAV] 매출관리 클릭 성공")
    except:
        driver.execute_script("cswmButtonDown('cswmMenuButtonGroup_15', 'Group_15');")
        print("[NAV] 매출관리 JavaScript 클릭 성공")
    
    time.sleep(2)
    
    # 2. 매출현황 클릭 (메인 document에서 - 프레임 전환 불필요)
    print("[NAV] 2. 매출현황 클릭...")
    driver.switch_to.default_content()
    
    try:
        sales_status = wait.until(
            EC.element_to_be_clickable((By.ID, "cswmItemGroup_15_8"))
        )
        sales_status.click()
        print("[NAV] 매출현황 클릭 성공")
    except:
        try:
            driver.execute_script("""
                var el = document.getElementById('cswmItemGroup_15_8');
                if (el) el.click();
            """)
            print("[NAV] 매출현황 JavaScript 클릭 성공")
        except Exception as e:
            print(f"[NAV] 매출현황 클릭 실패: {e}")
            raise
    
    time.sleep(2)
    
    # 3. 일자별 클릭 (메인 document에서)
    print("[NAV] 3. 일자별 클릭...")
    driver.switch_to.default_content()
    
    try:
        daily_menu = wait.until(
            EC.element_to_be_clickable((By.ID, "cswmItem8_51"))
        )
        daily_menu.click()
        print("[NAV] 일자별 클릭 성공")
    except:
        try:
            driver.execute_script("""
                var el = document.getElementById('cswmItem8_51');
                if (el) el.click();
            """)
            print("[NAV] 일자별 JavaScript 클릭 성공")
        except Exception as e:
            print(f"[NAV] 일자별 클릭 실패: {e}")
            raise
    
    time.sleep(3)
    
    print("[NAV] 일자별 매출 페이지 이동 완료!")
    return True
