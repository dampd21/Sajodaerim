/**
 * 인증 설정 파일 (배포 시 GitHub Actions에서 자동 생성/덮어쓰기 권장)
 * - 이 파일이 없으면(auth-config.js 404) 페이지에서 AUTH_CONFIG를 읽을 수 없습니다.
 * - 기본값은 "설정되지 않음" 상태로 둡니다.
 * - deploy-pages.yml이 DASHBOARD_PASSWORD를 주입할 경우, 이 파일은 배포 시 덮어써집니다.
 */
var AUTH_CONFIG = {
  disabled: true,
  password_hash: "",
  session_token: "",
  generated_at: ""
};
