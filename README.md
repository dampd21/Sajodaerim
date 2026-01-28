# 📊 사조 주문 데이터 크롤러 & 대시보드

## 🔐 GitHub Secrets 설정 (필수!)

**Repository → Settings → Secrets and variables → Actions → New repository secret**

| Name | Description |
|------|-------------|
| `SAJO_LOGIN_ID` | 사조 로그인 ID |
| `SAJO_LOGIN_PWD` | 사조 로그인 비밀번호 |

## 🚀 사용 방법

### 1. 크롤러 수동 실행

1. **Actions** 탭 클릭
2. **Sajo Order Data Crawler** 선택
3. **Run workflow** 클릭
4. 시작/종료 날짜 입력
5. 실행!

### 2. 자동 실행

- 매일 오전 9시(KST) 전날 데이터 자동 수집

### 3. 대시보드 확인

크롤링 후 자동으로 GitHub Pages에 배포됩니다:

👉 **`https://[username].github.io/[repository-name]/`**

## 📁 결과물
