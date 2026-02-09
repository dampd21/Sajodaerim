/**
 * AI 채팅 위젯 (공통)
 * - 기본: proxy 모드 (키를 브라우저에 두지 않기 위함)
 * - direct 모드는 로컬 테스트 용도 (운영에선 비권장)
 * - 이모지 사용 금지 준수
 */

(function () {
  let AI_MODE = 'disabled';
  let GEMINI_PROXY_URL = '';
  let GEMINI_API_KEY = '';
  let GEMINI_API_URL = '';

  let salesData = null;
  let orderData = null;

  let isOpen = false;
  let isLoading = false;
  let configLoaded = false;

  function loadConfig() {
    return new Promise((resolve) => {
      if (typeof AI_CONFIG !== 'undefined') {
        applyConfig(AI_CONFIG);
        configLoaded = true;
        resolve(true);
        return;
      }

      const script = document.createElement('script');
      script.src = 'ai-config.js?t=' + Date.now();
      script.onload = () => {
        if (typeof AI_CONFIG !== 'undefined') {
          applyConfig(AI_CONFIG);
          configLoaded = true;
          resolve(true);
        } else {
          resolve(false);
        }
      };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  function applyConfig(cfg) {
    AI_MODE = (cfg.AI_MODE || 'disabled').toLowerCase();
    GEMINI_PROXY_URL = cfg.GEMINI_PROXY_URL || '';
    GEMINI_API_KEY = cfg.GEMINI_API_KEY || '';
    GEMINI_API_URL = cfg.GEMINI_API_URL || '';
  }

  function createWidget() {
    const widget = document.createElement('div');
    widget.id = 'aiChatWidget';
    widget.innerHTML = `
      <button id="aiChatToggle" class="ai-chat-toggle" title="AI Assistant">
        <span class="ai-chat-icon">AI</span>
        <span class="ai-chat-close">X</span>
      </button>

      <div id="aiChatPopup" class="ai-chat-popup">
        <div class="ai-chat-header">
          <div class="ai-chat-title">
            <span class="ai-title-badge">AI</span>
            <span>어시스턴트</span>
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
            안녕하세요. 데이터 분석 AI입니다.<br>
            매출/발주 데이터 기반으로 질문해 주세요.
          </div>
        </div>

        <div class="ai-chat-input-area">
          <input type="text"
                 id="aiChatInput"
                 class="ai-chat-input"
                 placeholder="질문을 입력하세요..."
                 autocomplete="off">
          <button id="aiChatSend" class="ai-chat-send" aria-label="send">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(widget);
  }

  function injectStyles() {
    const style = document.createElement('style');
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
        box-shadow: 0 4px 20px rgba(0, 212, 255, 0.4);
        z-index: 9999;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-weight: 800;
        letter-spacing: 0.02em;
      }

      .ai-chat-toggle:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 30px rgba(0, 212, 255, 0.6);
      }

      .ai-chat-toggle.disabled {
        background: #666;
        cursor: not-allowed;
        box-shadow: none;
      }

      .ai-chat-toggle.disabled:hover { transform: none; }

      .ai-chat-icon, .ai-chat-close {
        font-size: 16px;
        transition: all 0.3s ease;
      }

      .ai-chat-close {
        position: absolute;
        opacity: 0;
        transform: rotate(-90deg);
      }

      .ai-chat-toggle.open .ai-chat-icon {
        opacity: 0;
        transform: rotate(90deg);
      }

      .ai-chat-toggle.open .ai-chat-close {
        opacity: 1;
        transform: rotate(0deg);
      }

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
        transform: translateY(20px) scale(0.98);
        transition: all 0.3s ease;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .ai-chat-popup.open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
      }

      .ai-chat-header {
        padding: 16px;
        background: linear-gradient(135deg, rgba(0, 212, 255, 0.2), rgba(123, 44, 191, 0.2));
        border-radius: 16px 16px 0 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .ai-chat-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 800;
        color: #fff;
        font-size: 1.05rem;
      }

      .ai-title-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255,255,255,0.12);
        font-size: 12px;
      }

      .ai-chat-status {
        font-size: 0.75rem;
        color: #4ecdc4;
        margin-top: 4px;
      }

      .ai-chat-status.error { color: #ff6b6b; }
      .ai-chat-status.warning { color: #ffe66d; }

      .ai-chat-quick {
        display: flex;
        gap: 6px;
        padding: 12px;
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
        transition: all 0.2s;
        white-space: nowrap;
      }

      .ai-quick-btn:hover {
        background: rgba(0, 212, 255, 0.2);
        border-color: #00d4ff;
        color: #fff;
      }

      .ai-quick-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      .ai-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .ai-msg {
        padding: 12px 14px;
        border-radius: 12px;
        max-width: 85%;
        font-size: 0.9rem;
        line-height: 1.5;
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

      .ai-msg.loading { display: flex; align-items: center; gap: 8px; }
      .ai-loading-dots { display: flex; gap: 4px; }
      .ai-loading-dots span {
        width: 6px;
        height: 6px;
        background: #00d4ff;
        border-radius: 50%;
        animation: aiBounce 1.4s infinite ease-in-out both;
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
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.2);
        border-radius: 0 0 16px 16px;
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
        transition: border-color 0.2s;
      }

      .ai-chat-input:focus { border-color: #00d4ff; }
      .ai-chat-input::placeholder { color: #666; }
      .ai-chat-input:disabled { opacity: 0.5; cursor: not-allowed; }

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
        transition: all 0.2s;
      }

      .ai-chat-send:hover { transform: scale(1.03); }
      .ai-chat-send:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

      .ai-chat-messages::-webkit-scrollbar { width: 6px; }
      .ai-chat-messages::-webkit-scrollbar-track { background: transparent; }
      .ai-chat-messages::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 3px; }

      @media (max-width: 480px) {
        .ai-chat-popup {
          width: calc(100vw - 32px);
          height: 70vh;
          right: 16px;
          bottom: 90px;
        }
        .ai-chat-toggle { right: 16px; bottom: 16px; width: 54px; height: 54px; }
        .ai-quick-btn { font-size: 0.7rem; padding: 5px 8px; }
      }
    `;
    document.head.appendChild(style);
  }

  async function loadData() {
    const statusEl = document.getElementById('aiDataStatus');
    const loaded = [];

    try {
      const salesResponse = await fetch('sales_data.json?t=' + Date.now());
      if (salesResponse.ok) {
        salesData = await salesResponse.json();
        loaded.push('매출');
      }
    } catch (e) {}

    try {
      const orderResponse = await fetch('report_data.json?t=' + Date.now());
      if (orderResponse.ok) {
        orderData = await orderResponse.json();
        loaded.push('발주');
      }
    } catch (e) {}

    // 상태 표시
    if (!configLoaded) {
      statusEl.textContent = 'AI 설정을 불러올 수 없습니다';
      statusEl.className = 'ai-chat-status error';
      disableChat('AI 설정을 불러올 수 없습니다. 관리자에게 문의하세요.');
      return;
    }

    if (AI_MODE === 'disabled') {
      statusEl.textContent = 'AI 비활성화 상태입니다';
      statusEl.className = 'ai-chat-status warning';
      disableChat('AI 기능이 비활성화되어 있습니다.');
      return;
    }

    if (AI_MODE === 'proxy' && !GEMINI_PROXY_URL) {
      statusEl.textContent = 'AI 프록시 URL이 설정되지 않았습니다';
      statusEl.className = 'ai-chat-status warning';
      disableChat('AI 프록시 URL이 필요합니다.');
      return;
    }

    if (AI_MODE === 'direct' && (!GEMINI_API_KEY || !GEMINI_API_URL)) {
      statusEl.textContent = 'AI direct 모드 설정이 부족합니다';
      statusEl.className = 'ai-chat-status warning';
      disableChat('AI direct 모드 설정이 부족합니다.');
      return;
    }

    if (loaded.length > 0) {
      statusEl.textContent = loaded.join(', ') + ' 데이터 준비됨';
      statusEl.className = 'ai-chat-status';
    } else {
      statusEl.textContent = '데이터를 불러올 수 없습니다';
      statusEl.className = 'ai-chat-status error';
    }
  }

  function disableChat(message) {
    const input = document.getElementById('aiChatInput');
    const sendBtn = document.getElementById('aiChatSend');
    const quickBtns = document.querySelectorAll('.ai-quick-btn');
    const welcomeMsg = document.getElementById('aiWelcomeMsg');
    const toggle = document.getElementById('aiChatToggle');

    if (toggle) toggle.classList.add('disabled');
    if (input) {
      input.disabled = true;
      input.placeholder = 'AI 기능을 사용할 수 없습니다';
    }
    if (sendBtn) sendBtn.disabled = true;
    quickBtns.forEach(btn => (btn.disabled = true));
    if (welcomeMsg) welcomeMsg.innerHTML = escapeHtml(message || 'AI 기능을 사용할 수 없습니다.');
  }

  function generateDataContext() {
    let context = "## 현재 데이터 현황\n\n";

    if (salesData && salesData.summary) {
      const s = salesData.summary;
      context += `### 매출 데이터\n`;
      context += `- 기간: ${s.date_range?.start} ~ ${s.date_range?.end}\n`;
      context += `- 총 매출: ${(s.total_sales || 0).toLocaleString()}원\n`;
      context += `- 홀 매출: ${(s.total_hall || 0).toLocaleString()}원\n`;
      context += `- 배달 매출: ${(s.total_delivery || 0).toLocaleString()}원\n`;
      context += `- 영업일수: ${s.total_days || 0}일\n`;
      context += `- 지점수: ${s.total_stores || 0}개\n\n`;
    }

    if (orderData && orderData.summary) {
      const o = orderData.summary;
      context += `### 발주 데이터\n`;
      context += `- 기간: ${o.date_range?.start} ~ ${o.date_range?.end}\n`;
      context += `- 총 발주금액: ${(o.total_sales || 0).toLocaleString()}원\n`;
      context += `- 총 발주건수: ${(o.total_records || 0).toLocaleString()}건\n`;
      context += `- 상품종류: ${o.total_products || 0}개\n`;
      context += `- 지점수: ${o.total_stores || 0}개\n\n`;
    }

    return context;
  }

  async function askAI(question) {
    const dataContext = generateDataContext();

    const systemPrompt = `당신은 "역대짬뽕" 프랜차이즈의 데이터 분석 AI 어시스턴트입니다.

아래 데이터를 기반으로 질문에 친절하고 간결하게 답변하세요.
- 숫자는 천 단위 구분자 사용
- 핵심 정보를 먼저 제공
- 답변은 3-5문장으로 간결하게
- 비교나 트렌드 언급 시 구체적 수치 포함
- 한국어로 답변

${dataContext}`;

    if (AI_MODE === 'proxy') {
      const r = await fetch(GEMINI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          systemPrompt
        })
      });

      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(`프록시 오류: ${r.status} ${t.slice(0, 200)}`);
      }

      const data = await r.json().catch(() => ({}));
      if (!data || !data.text) throw new Error('프록시 응답 형식 오류');
      return data.text;
    }

    // direct 모드 (운영 비권장)
    const requestBody = {
      contents: [{ parts: [{ text: `${systemPrompt}\n\n사용자 질문: ${question}` }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API 오류: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('응답을 받지 못했습니다');

    return text;
  }

  function toggleChat() {
    isOpen = !isOpen;
    document.getElementById('aiChatToggle')?.classList.toggle('open', isOpen);
    document.getElementById('aiChatPopup')?.classList.toggle('open', isOpen);

    if (isOpen) {
      const input = document.getElementById('aiChatInput');
      if (input && !input.disabled) input.focus();
    }
  }

  function addMessage(content, isUser) {
    const messagesDiv = document.getElementById('aiChatMessages');
    if (!messagesDiv) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-msg ${isUser ? 'user' : 'ai'}`;

    const html = escapeHtml(content)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');

    msgDiv.innerHTML = html;
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function showLoading() {
    const messagesDiv = document.getElementById('aiChatMessages');
    if (!messagesDiv) return;

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'ai-msg ai loading';
    loadingDiv.id = 'aiLoadingMsg';
    loadingDiv.innerHTML = `
      <div class="ai-loading-dots">
        <span></span><span></span><span></span>
      </div>
      <span>분석 중...</span>
    `;
    messagesDiv.appendChild(loadingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function hideLoading() {
    document.getElementById('aiLoadingMsg')?.remove();
  }

  async function sendMessage(question) {
    if (!question?.trim() || isLoading) return;

    // 비활성 조건
    if (!configLoaded || AI_MODE === 'disabled') return;

    const input = document.getElementById('aiChatInput');
    const sendBtn = document.getElementById('aiChatSend');

    addMessage(question, true);
    if (input) input.value = '';

    isLoading = true;
    if (sendBtn) sendBtn.disabled = true;
    showLoading();

    try {
      const answer = await askAI(question);
      hideLoading();
      addMessage(answer, false);
    } catch (error) {
      hideLoading();
      addMessage(`오류: ${error.message}`, false);
    }

    isLoading = false;
    if (sendBtn) sendBtn.disabled = false;
    if (input && !input.disabled) input.focus();
  }

  function bindEvents() {
    document.getElementById('aiChatToggle')?.addEventListener('click', toggleChat);

    document.getElementById('aiChatSend')?.addEventListener('click', () => {
      sendMessage(document.getElementById('aiChatInput')?.value || '');
    });

    document.getElementById('aiChatInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(document.getElementById('aiChatInput')?.value || '');
      }
    });

    document.querySelectorAll('.ai-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!btn.disabled) sendMessage(btn.dataset.q || '');
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) toggleChat();
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
  }

  async function init() {
    injectStyles();
    createWidget();
    bindEvents();
    await loadConfig();
    await loadData();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
