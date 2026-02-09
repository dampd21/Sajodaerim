/**
 * AI 채팅 위젯 (공통)
 * - 보안상 권장: proxy 모드(프론트에 API KEY 없음)
 * - nav active 자동 정정 기능 포함
 * - body[data-ai="off"] 인 페이지에서는 위젯 UI는 생성하지 않음(네비 정정만 수행)
 *
 * proxy 기대 규격(권장):
 * POST { question: string, context: string, page: string }
 * 응답: { text: string } 또는 { answer: string }
 */

(function () {
  // ============================================
  // 네비 active 자동 정정 (전 페이지 공통)
  // ============================================
  function fixNavActive() {
    try {
      var current = (location.pathname || "").split("/").pop() || "index.html";
      document.querySelectorAll(".main-nav .nav-link").forEach(function (a) {
        var href = a.getAttribute("href") || "";
        a.classList.toggle("active", href === current);
      });
    } catch (e) {}
  }

  // ============================================
  // 설정
  // ============================================
  var AI_MODE = "proxy"; // proxy | direct
  var GEMINI_PROXY_URL = "";
  var GEMINI_API_KEY = "";
  var GEMINI_API_URL = "";

  var salesData = null;
  var orderData = null;
  var isOpen = false;
  var isLoading = false;
  var configLoaded = false;

  // ============================================
  // 설정 로드
  // ============================================
  function loadConfig() {
    return new Promise(function (resolve) {
      function applyConfig() {
        if (typeof AI_CONFIG !== "undefined") {
          AI_MODE = (AI_CONFIG.AI_MODE || "proxy").toLowerCase();
          GEMINI_PROXY_URL = AI_CONFIG.GEMINI_PROXY_URL || "";
          GEMINI_API_KEY = AI_CONFIG.GEMINI_API_KEY || "";
          GEMINI_API_URL = AI_CONFIG.GEMINI_API_URL || "";
          configLoaded = true;
          resolve(true);
          return;
        }
        resolve(false);
      }

      if (typeof AI_CONFIG !== "undefined") {
        applyConfig();
        return;
      }

      var script = document.createElement("script");
      script.src = "ai-config.js?t=" + Date.now();
      script.onload = applyConfig;
      script.onerror = function () {
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  function getProxyUrl() {
    var url = GEMINI_PROXY_URL || "";
    if (!url) {
      try {
        url = localStorage.getItem("gemini_proxy_url") || "";
      } catch (e) {}
    }
    url = (url || "").trim();
    if (url.endsWith("/")) url = url.slice(0, -1);
    return url;
  }

  // ============================================
  // 위젯 HTML 생성
  // ============================================
  function createWidget() {
    var widget = document.createElement("div");
    widget.id = "aiChatWidget";
    widget.innerHTML = `
      <button id="aiChatToggle" class="ai-chat-toggle" title="AI Assistant">
        <span class="ai-chat-icon">AI</span>
        <span class="ai-chat-close">X</span>
      </button>

      <div id="aiChatPopup" class="ai-chat-popup">
        <div class="ai-chat-header">
          <div class="ai-chat-title">
            <span>AI Assistant</span>
          </div>
          <div class="ai-chat-header-actions">
            <button id="aiChatSettingsBtn" class="ai-chat-settings-btn" type="button">설정</button>
          </div>
          <div class="ai-chat-status" id="aiDataStatus">초기화 중...</div>
        </div>

        <div class="ai-chat-quick">
          <button class="ai-quick-btn" data-q="이번 달 매출 요약해줘">매출 요약</button>
          <button class="ai-quick-btn" data-q="매출 1위 지점은?">1위 지점</button>
          <button class="ai-quick-btn" data-q="발주 현황 알려줘">발주 현황</button>
          <button class="ai-quick-btn" data-q="홀과 배달 비율은?">홀/배달 비율</button>
        </div>

        <div class="ai-chat-messages" id="aiChatMessages">
          <div class="ai-msg ai" id="aiWelcomeMsg">
            안녕하세요. 데이터 분석 도우미입니다.<br>
            매출/발주 데이터 기반으로 질문해주세요.
          </div>
        </div>

        <div class="ai-chat-input-area">
          <input type="text"
                 id="aiChatInput"
                 class="ai-chat-input"
                 placeholder="질문을 입력하세요..."
                 autocomplete="off">
          <button id="aiChatSend" class="ai-chat-send" type="button" aria-label="send">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>

        <div class="ai-settings-modal" id="aiSettingsModal" aria-hidden="true">
          <div class="ai-settings-card">
            <div class="ai-settings-title">AI 설정</div>
            <div class="ai-settings-desc">
              보안상 프록시 URL을 사용하세요. (브라우저에 API 키 저장 금지)
            </div>
            <label class="ai-settings-label">프록시 URL</label>
            <div class="ai-settings-row">
              <input id="aiProxyUrlInput" class="ai-settings-input" type="text" placeholder="https://your-proxy.workers.dev">
              <button id="aiProxySaveBtn" class="ai-settings-save" type="button">저장</button>
            </div>
            <div class="ai-settings-actions">
              <button id="aiProxyCloseBtn" class="ai-settings-close" type="button">닫기</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(widget);
  }

  // ============================================
  // 스타일
  // ============================================
  function injectStyles() {
    var style = document.createElement("style");
    style.textContent = `
      .ai-chat-toggle {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, #00d4ff, #7b2cbf);
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(0, 212, 255, 0.35);
        z-index: 9999;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-weight: 800;
        letter-spacing: 0.02em;
      }
      .ai-chat-toggle:hover { transform: scale(1.06); }
      .ai-chat-toggle.disabled {
        background: #555;
        cursor: not-allowed;
        box-shadow: none;
      }
      .ai-chat-icon, .ai-chat-close {
        font-size: 16px;
        transition: all 0.2s ease;
      }
      .ai-chat-close {
        position: absolute;
        opacity: 0;
        transform: rotate(-90deg);
      }
      .ai-chat-toggle.open .ai-chat-icon { opacity: 0; transform: rotate(90deg); }
      .ai-chat-toggle.open .ai-chat-close { opacity: 1; transform: rotate(0deg); }

      .ai-chat-popup {
        position: fixed;
        bottom: 100px;
        right: 24px;
        width: 380px;
        height: 520px;
        background: #1a1a2e;
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        z-index: 9998;
        display: flex;
        flex-direction: column;
        opacity: 0;
        visibility: hidden;
        transform: translateY(16px) scale(0.97);
        transition: all 0.2s ease;
        border: 1px solid rgba(255, 255, 255, 0.1);
        overflow: hidden;
      }
      .ai-chat-popup.open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
      }

      .ai-chat-header {
        padding: 14px 16px 12px;
        background: linear-gradient(135deg, rgba(0, 212, 255, 0.18), rgba(123, 44, 191, 0.18));
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .ai-chat-title {
        font-weight: 800;
        color: #fff;
        font-size: 1.05rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .ai-chat-header-actions {
        margin-top: 8px;
        display: flex;
        justify-content: flex-end;
      }
      .ai-chat-settings-btn {
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(0,0,0,0.18);
        color: #ddd;
        font-size: 0.78rem;
        cursor: pointer;
      }
      .ai-chat-settings-btn:hover {
        border-color: rgba(0,212,255,0.35);
        color: #fff;
      }

      .ai-chat-status {
        font-size: 0.75rem;
        margin-top: 8px;
        color: #4ecdc4;
      }
      .ai-chat-status.error { color: #ff6b6b; }
      .ai-chat-status.warning { color: #ffe66d; }

      .ai-chat-quick {
        display: flex;
        gap: 6px;
        padding: 10px 12px;
        flex-wrap: wrap;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }
      .ai-quick-btn {
        padding: 6px 10px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        color: #aaa;
        font-size: 0.75rem;
        cursor: pointer;
        transition: all 0.15s;
        white-space: nowrap;
      }
      .ai-quick-btn:hover {
        background: rgba(0, 212, 255, 0.18);
        border-color: rgba(0, 212, 255, 0.35);
        color: #fff;
      }
      .ai-quick-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      .ai-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 14px 14px 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .ai-msg {
        padding: 12px 14px;
        border-radius: 12px;
        max-width: 88%;
        font-size: 0.9rem;
        line-height: 1.55;
        word-break: break-word;
      }
      .ai-msg.user {
        background: linear-gradient(135deg, #00d4ff, #7b2cbf);
        color: #fff;
        align-self: flex-end;
        border-bottom-right-radius: 4px;
      }
      .ai-msg.ai {
        background: rgba(255, 255, 255, 0.08);
        color: #e0e0e0;
        align-self: flex-start;
        border-bottom-left-radius: 4px;
      }
      .ai-msg.ai strong { color: #00d4ff; }
      .ai-msg.ai code {
        background: rgba(0, 0, 0, 0.3);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.85em;
      }

      .ai-msg.loading {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ai-loading-dots { display: flex; gap: 4px; }
      .ai-loading-dots span {
        width: 6px;
        height: 6px;
        background: #00d4ff;
        border-radius: 50%;
        animation: aiBounce 1.2s infinite ease-in-out both;
      }
      .ai-loading-dots span:nth-child(1) { animation-delay: -0.32s; }
      .ai-loading-dots span:nth-child(2) { animation-delay: -0.16s; }
      @keyframes aiBounce {
        0%, 80%, 100% { transform: scale(0); }
        40% { transform: scale(1); }
      }

      .ai-chat-input-area {
        display: flex;
        gap: 8px;
        padding: 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(0, 0, 0, 0.2);
      }
      .ai-chat-input {
        flex: 1;
        padding: 12px 14px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 24px;
        color: #fff;
        font-size: 0.9rem;
        outline: none;
        transition: border-color 0.15s;
      }
      .ai-chat-input:focus { border-color: rgba(0, 212, 255, 0.6); }
      .ai-chat-input::placeholder { color: #666; }
      .ai-chat-input:disabled { opacity: 0.55; cursor: not-allowed; }

      .ai-chat-send {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: linear-gradient(135deg, #00d4ff, #7b2cbf);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        transition: transform 0.15s;
      }
      .ai-chat-send:hover { transform: scale(1.05); }
      .ai-chat-send:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }

      .ai-settings-modal {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.72);
        display: none;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .ai-settings-modal.open { display: flex; }
      .ai-settings-card {
        width: 100%;
        background: #16213e;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 14px;
        padding: 16px;
      }
      .ai-settings-title {
        font-weight: 800;
        color: #fff;
        margin-bottom: 8px;
      }
      .ai-settings-desc {
        color: #aaa;
        font-size: 0.82rem;
        line-height: 1.5;
        margin-bottom: 12px;
      }
      .ai-settings-label {
        display: block;
        color: #888;
        font-size: 0.8rem;
        margin-bottom: 6px;
      }
      .ai-settings-row {
        display: flex;
        gap: 8px;
      }
      .ai-settings-input {
        flex: 1;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06);
        color: #fff;
        outline: none;
      }
      .ai-settings-input:focus { border-color: rgba(0,212,255,0.6); }
      .ai-settings-save {
        padding: 10px 12px;
        border-radius: 10px;
        border: none;
        background: linear-gradient(135deg, #00d4ff, #7b2cbf);
        color: #fff;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      .ai-settings-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 12px;
      }
      .ai-settings-close {
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(0,0,0,0.18);
        color: #ddd;
        cursor: pointer;
      }

      @media (max-width: 480px) {
        .ai-chat-popup {
          width: calc(100vw - 32px);
          height: 70vh;
          right: 16px;
          bottom: 90px;
        }
        .ai-chat-toggle {
          right: 16px;
          bottom: 16px;
          width: 54px;
          height: 54px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================
  // 데이터 로드
  // ============================================
  function safeGetEl(id) {
    try {
      return document.getElementById(id);
    } catch (e) {
      return null;
    }
  }

  async function loadDataFiles() {
    var statusEl = safeGetEl("aiDataStatus");
    var loaded = [];

    try {
      var salesResponse = await fetch("sales_data.json?t=" + Date.now());
      if (salesResponse.ok) {
        salesData = await salesResponse.json();
        loaded.push("매출");
      }
    } catch (e) {}

    try {
      var orderResponse = await fetch("report_data.json?t=" + Date.now());
      if (orderResponse.ok) {
        orderData = await orderResponse.json();
        loaded.push("발주");
      }
    } catch (e) {}

    var proxyUrl = getProxyUrl();
    var hasProxy = !!proxyUrl;

    if (!statusEl) return;

    if (!configLoaded) {
      statusEl.textContent = "AI 설정을 불러올 수 없습니다.";
      statusEl.className = "ai-chat-status error";
      disableChat("AI 설정을 불러올 수 없습니다.");
      return;
    }

    if (AI_MODE === "proxy") {
      if (!hasProxy) {
        statusEl.textContent = "AI 프록시 URL 설정 필요";
        statusEl.className = "ai-chat-status warning";
        disableChat("AI 프록시 URL 설정이 필요합니다.");
        return;
      }
    } else {
      if (!GEMINI_API_KEY || !GEMINI_API_URL) {
        statusEl.textContent = "AI 키 설정 필요(직접 호출 모드)";
        statusEl.className = "ai-chat-status warning";
        disableChat("AI 키 설정이 필요합니다.");
        return;
      }
    }

    if (loaded.length > 0) {
      statusEl.textContent = loaded.join(", ") + " 데이터 준비됨";
      statusEl.className = "ai-chat-status";
    } else {
      statusEl.textContent = "데이터를 불러올 수 없습니다.";
      statusEl.className = "ai-chat-status error";
    }
  }

  // ============================================
  // 채팅 비활성화
  // ============================================
  function disableChat(message) {
    var input = safeGetEl("aiChatInput");
    var sendBtn = safeGetEl("aiChatSend");
    var quickBtns = document.querySelectorAll(".ai-quick-btn");
    var welcomeMsg = safeGetEl("aiWelcomeMsg");
    var toggleBtn = safeGetEl("aiChatToggle");

    if (input) {
      input.disabled = true;
      input.placeholder = "AI 기능을 사용할 수 없습니다";
    }
    if (sendBtn) sendBtn.disabled = true;
    quickBtns.forEach(function (btn) {
      btn.disabled = true;
    });

    if (welcomeMsg) {
      welcomeMsg.innerHTML =
        (message ? message : "AI 기능을 사용할 수 없습니다.") +
        "<br><br>상단 설정에서 프록시 URL을 등록하세요.";
    }

    if (toggleBtn) toggleBtn.classList.add("disabled");
  }

  // ============================================
  // 데이터 컨텍스트 생성
  // ============================================
  function generateDataContext() {
    var context = "## 데이터 현황\n\n";

    if (salesData && salesData.summary) {
      var s = salesData.summary;
      context += "### 매출 데이터\n";
      context += "- 기간: " + (s.date_range && s.date_range.start ? s.date_range.start : "-") + " ~ " + (s.date_range && s.date_range.end ? s.date_range.end : "-") + "\n";
      context += "- 총 매출: " + formatNumber(s.total_sales || 0) + "원\n";
      context += "- 홀 매출: " + formatNumber(s.total_hall || 0) + "원\n";
      context += "- 배달 매출: " + formatNumber(s.total_delivery || 0) + "원\n";
      context += "- 영업일수: " + formatNumber(s.total_days || 0) + "일\n";
      context += "- 지점수: " + formatNumber(s.total_stores || 0) + "개\n\n";

      if (Array.isArray(salesData.stores) && salesData.stores.length > 0) {
        context += "### 지점별 매출 TOP 5\n";
        var top = salesData.stores
          .slice()
          .sort(function (a, b) {
            return (b.total || 0) - (a.total || 0);
          })
          .slice(0, 5);

        top.forEach(function (store, i) {
          context +=
            (i + 1) +
            ". " +
            (store.name || "-") +
            ": " +
            formatNumber(store.total || 0) +
            "원 (홀 " +
            formatNumber(store.hall || 0) +
            ", 배달 " +
            formatNumber(store.delivery || 0) +
            ")\n";
        });
        context += "\n";
      }
    }

    if (orderData && orderData.summary) {
      var o = orderData.summary;
      context += "### 발주 데이터\n";
      context += "- 기간: " + (o.date_range && o.date_range.start ? o.date_range.start : "-") + " ~ " + (o.date_range && o.date_range.end ? o.date_range.end : "-") + "\n";
      context += "- 총 발주금액: " + formatNumber(o.total_sales || 0) + "원\n";
      context += "- 총 발주건수: " + formatNumber(o.total_records || 0) + "건\n";
      context += "- 상품종류: " + formatNumber(o.total_products || 0) + "개\n";
      context += "- 지점수: " + formatNumber(o.total_stores || 0) + "개\n\n";

      if (Array.isArray(orderData.categories) && orderData.categories.length > 0) {
        context += "### 대분류별 발주 TOP 5\n";
        orderData.categories.slice(0, 5).forEach(function (cat) {
          context += "- " + (cat.name || "-") + ": " + formatNumber(cat.total || 0) + "원\n";
        });
        context += "\n";
      }
    }

    return context;
  }

  // ============================================
  // AI 호출
  // ============================================
  async function askAI(question) {
    var dataContext = generateDataContext();
    var page = (location.pathname || "").split("/").pop() || "";

    var systemPrompt =
      '당신은 "역대짬뽕" 프랜차이즈의 데이터 분석 어시스턴트입니다.\n' +
      "- 숫자는 천 단위 구분자 사용\n" +
      "- 핵심 정보를 먼저 제공\n" +
      "- 답변은 3~6문장으로 간결하게\n" +
      "- 한국어로 답변\n\n" +
      dataContext;

    if (AI_MODE === "proxy") {
      var proxyUrl = getProxyUrl();
      if (!proxyUrl) throw new Error("AI 프록시 URL이 설정되지 않았습니다.");

      var resp = await fetch(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question,
          context: systemPrompt,
          page: page
        })
      });

      if (!resp.ok) {
        var t = "";
        try {
          t = await resp.text();
        } catch (e) {}
        throw new Error("프록시 오류: " + resp.status + (t ? " / " + t.slice(0, 120) : ""));
      }

      var json = await resp.json().catch(function () {
        return {};
      });

      var text = json.text || json.answer || "";
      if (!text) throw new Error("응답을 받지 못했습니다.");
      return String(text);
    }

    if (!GEMINI_API_KEY || !GEMINI_API_URL) {
      throw new Error("AI 직접 호출 설정이 없습니다.");
    }

    var requestBody = {
      contents: [
        {
          parts: [
            {
              text: systemPrompt + "\n\n사용자 질문: " + question
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 512
      }
    };

    var response = await fetch(GEMINI_API_URL + "?key=" + encodeURIComponent(GEMINI_API_KEY), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      var errorData = await response.json().catch(function () {
        return {};
      });
      throw new Error((errorData.error && errorData.error.message) ? errorData.error.message : "API 오류: " + response.status);
    }

    var data = await response.json();
    var out = (((data || {}).candidates || [])[0] || {}).content;
    var parts = out && out.parts ? out.parts : [];
    var answer = parts[0] && parts[0].text ? parts[0].text : "";
    if (!answer) throw new Error("응답을 받지 못했습니다.");
    return String(answer);
  }

  // ============================================
  // UI
  // ============================================
  function toggleChat() {
    var toggle = safeGetEl("aiChatToggle");
    var popup = safeGetEl("aiChatPopup");
    if (!toggle || !popup) return;

    isOpen = !isOpen;
    toggle.classList.toggle("open", isOpen);
    popup.classList.toggle("open", isOpen);

    if (isOpen) {
      var input = safeGetEl("aiChatInput");
      if (input && !input.disabled) input.focus();
    }
  }

  function addMessage(content, isUser) {
    var messagesDiv = safeGetEl("aiChatMessages");
    if (!messagesDiv) return;

    var msgDiv = document.createElement("div");
    msgDiv.className = "ai-msg " + (isUser ? "user" : "ai");

    var html = String(content || "")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");

    msgDiv.innerHTML = html;
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function showLoadingMsg() {
    var messagesDiv = safeGetEl("aiChatMessages");
    if (!messagesDiv) return;

    var loadingDiv = document.createElement("div");
    loadingDiv.className = "ai-msg ai loading";
    loadingDiv.id = "aiLoadingMsg";
    loadingDiv.innerHTML = `
      <div class="ai-loading-dots"><span></span><span></span><span></span></div>
      <span>분석 중...</span>
    `;
    messagesDiv.appendChild(loadingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function hideLoadingMsg() {
    var el = safeGetEl("aiLoadingMsg");
    if (el) el.remove();
  }

  async function sendMessage(question) {
    if (!question || !String(question).trim() || isLoading) return;

    var input = safeGetEl("aiChatInput");
    var sendBtn = safeGetEl("aiChatSend");
    if (!input || !sendBtn) return;

    if (input.disabled) return;

    addMessage(question, true);
    input.value = "";
    isLoading = true;
    sendBtn.disabled = true;

    showLoadingMsg();

    try {
      var answer = await askAI(question);
      hideLoadingMsg();
      addMessage(answer, false);
    } catch (error) {
      hideLoadingMsg();
      addMessage("오류: " + (error && error.message ? error.message : "unknown"), false);
    }

    isLoading = false;
    sendBtn.disabled = false;
    input.focus();
  }

  // ============================================
  // 설정 UI
  // ============================================
  function openSettings() {
    var modal = safeGetEl("aiSettingsModal");
    var input = safeGetEl("aiProxyUrlInput");
    if (!modal || !input) return;

    input.value = getProxyUrl() || "";
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    setTimeout(function () {
      input.focus();
    }, 0);
  }

  function closeSettings() {
    var modal = safeGetEl("aiSettingsModal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function saveProxyUrl() {
    var input = safeGetEl("aiProxyUrlInput");
    if (!input) return;

    var url = (input.value || "").trim();
    if (!url || url.indexOf("http") !== 0) {
      addMessage("프록시 URL이 올바르지 않습니다.", false);
      return;
    }
    if (url.endsWith("/")) url = url.slice(0, -1);

    try {
      localStorage.setItem("gemini_proxy_url", url);
    } catch (e) {}

    closeSettings();
    loadDataFiles();
  }

  // ============================================
  // 이벤트 바인딩
  // ============================================
  function bindEvents() {
    var toggleBtn = safeGetEl("aiChatToggle");
    var sendBtn = safeGetEl("aiChatSend");
    var input = safeGetEl("aiChatInput");
    var settingsBtn = safeGetEl("aiChatSettingsBtn");
    var proxySaveBtn = safeGetEl("aiProxySaveBtn");
    var proxyCloseBtn = safeGetEl("aiProxyCloseBtn");

    if (toggleBtn) toggleBtn.addEventListener("click", toggleChat);
    if (sendBtn) sendBtn.addEventListener("click", function () { sendMessage(input.value); });

    if (input) {
      input.addEventListener("keypress", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage(input.value);
        }
      });
    }

    document.querySelectorAll(".ai-quick-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!btn.disabled) sendMessage(btn.dataset.q);
      });
    });

    if (settingsBtn) settingsBtn.addEventListener("click", openSettings);
    if (proxySaveBtn) proxySaveBtn.addEventListener("click", saveProxyUrl);
    if (proxyCloseBtn) proxyCloseBtn.addEventListener("click", closeSettings);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (isOpen) toggleChat();
        closeSettings();
      }
    });

    var modal = safeGetEl("aiSettingsModal");
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target && e.target.id === "aiSettingsModal") closeSettings();
      });
    }
  }

  // ============================================
  // 유틸
  // ============================================
  function formatNumber(num) {
    try {
      return new Intl.NumberFormat("ko-KR").format(num || 0);
    } catch (e) {
      return String(num || 0);
    }
  }

  // ============================================
  // 초기화
  // ============================================
  async function init() {
    fixNavActive();

    // roas 등에서 위젯을 숨기고 싶으면 <body data-ai="off"> 사용
    var aiOff = false;
    try {
      aiOff = (document.body && document.body.dataset && document.body.dataset.ai === "off");
    } catch (e) {}
    if (aiOff) return;

    injectStyles();
    createWidget();
    bindEvents();

    await loadConfig();
    await loadDataFiles();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
