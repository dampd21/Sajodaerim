const AI_CONFIG = {
  // direct: (로컬에서만) GEMINI_API_KEY를 가진 ai-config.js를 별도로 두고 직접 호출
  // proxy: (권장) 서버/Cloudflare Worker 프록시로 호출 (프론트에는 키 없음)
  AI_MODE: "proxy",

  // proxy 모드에서 사용할 프록시 URL
  // 예: https://your-gemini-proxy.workers.dev
  // 비워두면 localStorage('gemini_proxy_url') 값을 사용
  GEMINI_PROXY_URL: "",

  // direct 모드에서만 사용 (이 파일에는 절대 키를 커밋하지 마세요)
  GEMINI_API_KEY: "",

  GEMINI_API_URL: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
};
