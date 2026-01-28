# 사조 주문 데이터 크롤러

사조 주문 시스템에서 데이터를 자동으로 수집하는 크롤러입니다.

## 🚀 GitHub Actions 사용법

### 1. Secrets 설정 (필수)

Repository → Settings → Secrets and variables → Actions → New repository secret

| Name | Value |
|------|-------|
| `SAJO_LOGIN_ID` | `900060` |
| `SAJO_LOGIN_PWD` | `900060` |

### 2. 수동 실행

1. Repository → **Actions** 탭
2. **Sajo Order Data Crawler** 선택
3. **Run workflow** 클릭
4. 시작/종료 날짜 입력
5. **Run workflow** 버튼 클릭

### 3. 자동 실행 (스케줄)

매일 오전 9시(KST)에 전날 데이터를 자동 수집합니다.

### 4. 결과 다운로드

1. Actions → 완료된 워크플로우 클릭
2. **Artifacts** 섹션에서 `crawl-results-xxx` 다운로드

## 📂 결과물 구조
