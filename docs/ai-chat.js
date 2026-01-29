/**
 * AI 채팅 위젯
 * 모든 페이지에서 공통으로 사용
 */

(function() {
    // ============================================
    // 설정
    // ============================================
    const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY'; // ⚠️ 실제 키로 교체
    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    
    let salesData = null;
    let orderData = null;
    let isOpen = false;
    let isLoading = false;
    
    // ============================================
    // 위젯 HTML 생성
    // ============================================
    function createWidget() {
        const widget = document.createElement('div');
        widget.id = 'aiChatWidget';
        widget.innerHTML = `
            <!-- 플로팅 버튼 -->
            <button id="aiChatToggle" class="ai-chat-toggle" title="AI 어시스턴트">
                <span class="ai-chat-icon">🤖</span>
                <span class="ai-chat-close">✕</span>
            </button>
            
            <!-- 채팅 팝업 -->
            <div id="aiChatPopup" class="ai-chat-popup">
                <div class="ai-chat-header">
                    <div class="ai-chat-title">
                        <span>🤖</span>
                        <span>AI 어시스턴트</span>
                    </div>
                    <div class="ai-chat-status" id="aiDataStatus">
                        데이터 로딩중...
                    </div>
                </div>
                
                <div class="ai-chat-quick">
                    <button class="ai-quick-btn" data-q="이번 달 매출 요약해줘">📈 매출 요약</button>
                    <button class="ai-quick-btn" data-q="매출 1위 지점은?">🏆 1위 지점</button>
                    <button class="ai-quick-btn" data-q="발주 현황 알려줘">📦 발주 현황</button>
                    <button class="ai-quick-btn" data-q="홀과 배달 비율은?">🍽️ 채널 비율</button>
                </div>
                
                <div class="ai-chat-messages" id="aiChatMessages">
                    <div class="ai-msg ai">
                        안녕하세요! 역대짬뽕 데이터 분석 AI입니다. 🍜<br>
                        매출, 발주 등에 대해 질문해주세요!
                    </div>
                </div>
                
                <div class="ai-chat-input-area">
                    <input type="text" 
                           id="aiChatInput" 
                           class="ai-chat-input" 
                           placeholder="질문을 입력하세요..."
                           autocomplete="off">
                    <button id="aiChatSend" class="ai-chat-send">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(widget);
    }
    
    // ============================================
    // 스타일 삽입
    // ============================================
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* 플로팅 버튼 */
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
            }
            
            .ai-chat-toggle:hover {
                transform: scale(1.1);
                box-shadow: 0 6px 30px rgba(0, 212, 255, 0.6);
            }
            
            .ai-chat-icon,
            .ai-chat-close {
                font-size: 24px;
                transition: all 0.3s ease;
            }
            
            .ai-chat-close {
                position: absolute;
                opacity: 0;
                transform: rotate(-90deg);
                color: white;
            }
            
            .ai-chat-toggle.open .ai-chat-icon {
                opacity: 0;
                transform: rotate(90deg);
            }
            
            .ai-chat-toggle.open .ai-chat-close {
                opacity: 1;
                transform: rotate(0deg);
            }
            
            /* 채팅 팝업 */
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
                transform: translateY(20px) scale(0.95);
                transition: all 0.3s ease;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .ai-chat-popup.open {
                opacity: 1;
                visibility: visible;
                transform: translateY(0) scale(1);
            }
            
            /* 헤더 */
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
                font-weight: bold;
                color: #fff;
                font-size: 1.1rem;
            }
            
            .ai-chat-status {
                font-size: 0.75rem;
                color: #4ecdc4;
                margin-top: 4px;
            }
            
            .ai-chat-status.error {
                color: #ff6b6b;
            }
            
            /* 빠른 질문 */
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
            
            /* 메시지 영역 */
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
            
            .ai-msg.ai strong {
                color: #00d4ff;
            }
            
            .ai-msg.ai code {
                background: rgba(0, 0, 0, 0.3);
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 0.85em;
            }
            
            /* 로딩 */
            .ai-msg.loading {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .ai-loading-dots {
                display: flex;
                gap: 4px;
            }
            
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
            
            /* 입력 영역 */
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
            
            .ai-chat-input:focus {
                border-color: #00d4ff;
            }
            
            .ai-chat-input::placeholder {
                color: #666;
            }
            
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
            
            .ai-chat-send:hover {
                transform: scale(1.05);
            }
            
            .ai-chat-send:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
            }
            
            /* 스크롤바 */
            .ai-chat-messages::-webkit-scrollbar {
                width: 6px;
            }
            
            .ai-chat-messages::-webkit-scrollbar-track {
                background: transparent;
            }
            
            .ai-chat-messages::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 3px;
            }
            
            /* 모바일 대응 */
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
                
                .ai-quick-btn {
                    font-size: 0.7rem;
                    padding: 5px 8px;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // ============================================
    // 데이터 로드
    // ============================================
    async function loadData() {
        const statusEl = document.getElementById('aiDataStatus');
        let loaded = [];
        
        try {
            const salesResponse = await fetch('sales_data.json?t=' + Date.now());
            salesData = await salesResponse.json();
            loaded.push('매출');
        } catch (e) {
            console.log('Sales data not available');
        }
        
        try {
            const orderResponse = await fetch('report_data.json?t=' + Date.now());
            orderData = await orderResponse.json();
            loaded.push('발주');
        } catch (e) {
            console.log('Order data not available');
        }
        
        if (loaded.length > 0) {
            statusEl.textContent = `✓ ${loaded.join(', ')} 데이터 준비됨`;
            statusEl.classList.remove('error');
        } else {
            statusEl.textContent = '⚠ 데이터를 불러올 수 없습니다';
            statusEl.classList.add('error');
        }
    }
    
    // ============================================
    // 데이터 컨텍스트 생성
    // ============================================
    function generateDataContext() {
        let context = "## 현재 데이터 현황\n\n";
        
        if (salesData) {
            const s = salesData.summary;
            context += `### 매출 데이터\n`;
            context += `- 기간: ${s.date_range?.start} ~ ${s.date_range?.end}\n`;
            context += `- 총 매출: ${(s.total_sales || 0).toLocaleString()}원\n`;
            context += `- 홀 매출: ${(s.total_hall || 0).toLocaleString()}원\n`;
            context += `- 배달 매출: ${(s.total_delivery || 0).toLocaleString()}원\n`;
            context += `- 영업일수: ${s.total_days || 0}일\n`;
            context += `- 지점수: ${s.total_stores || 0}개\n\n`;
            
            if (salesData.stores?.length > 0) {
                context += `### 지점별 매출 TOP 5\n`;
                [...salesData.stores]
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 5)
                    .forEach((store, i) => {
                        context += `${i + 1}. ${store.name}: ${store.total.toLocaleString()}원\n`;
                    });
                context += `\n`;
            }
        }
        
        if (orderData) {
            const o = orderData.summary;
            context += `### 발주 데이터\n`;
            context += `- 기간: ${o.date_range?.start} ~ ${o.date_range?.end}\n`;
            context += `- 총 발주금액: ${(o.total_sales || 0).toLocaleString()}원\n`;
            context += `- 총 발주건수: ${(o.total_records || 0).toLocaleString()}건\n`;
            context += `- 상품종류: ${o.total_products || 0}개\n\n`;
            
            if (orderData.categories?.length > 0) {
                context += `### 대분류별 발주 TOP 5\n`;
                orderData.categories.slice(0, 5).forEach(cat => {
                    context += `- ${cat.name}: ${cat.total.toLocaleString()}원\n`;
                });
                context += `\n`;
            }
        }
        
        return context;
    }
    
    // ============================================
    // Gemini API 호출
    // ============================================
    async function askGemini(question) {
        const dataContext = generateDataContext();
        
        const systemPrompt = `당신은 "역대짬뽕" 프랜차이즈의 데이터 분석 AI 어시스턴트입니다.

아래 데이터를 기반으로 질문에 친절하고 간결하게 답변하세요.
- 숫자는 천 단위 구분자 사용
- 핵심 정보를 먼저 제공
- 답변은 3-4문장으로 간결하게
- 한국어로 답변

${dataContext}`;

        const requestBody = {
            contents: [{
                parts: [{
                    text: `${systemPrompt}\n\n질문: ${question}`
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 512,
            }
        };
        
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            throw new Error(`API 오류: ${response.status}`);
        }
        
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }
    
    // ============================================
    // UI 함수
    // ============================================
    function toggleChat() {
        isOpen = !isOpen;
        document.getElementById('aiChatToggle').classList.toggle('open', isOpen);
        document.getElementById('aiChatPopup').classList.toggle('open', isOpen);
        
        if (isOpen) {
            document.getElementById('aiChatInput').focus();
        }
    }
    
    function addMessage(content, isUser = false) {
        const messagesDiv = document.getElementById('aiChatMessages');
        const msgDiv = document.createElement('div');
        msgDiv.className = `ai-msg ${isUser ? 'user' : 'ai'}`;
        
        // 간단한 마크다운 변환
        let html = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
        
        msgDiv.innerHTML = html;
        messagesDiv.appendChild(msgDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    function showLoading() {
        const messagesDiv = document.getElementById('aiChatMessages');
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
        
        const input = document.getElementById('aiChatInput');
        const sendBtn = document.getElementById('aiChatSend');
        
        addMessage(question, true);
        input.value = '';
        isLoading = true;
        sendBtn.disabled = true;
        
        showLoading();
        
        try {
            const answer = await askGemini(question);
            hideLoading();
            addMessage(answer, false);
        } catch (error) {
            hideLoading();
            addMessage(`⚠️ 오류: ${error.message}`, false);
        }
        
        isLoading = false;
        sendBtn.disabled = false;
        input.focus();
    }
    
    // ============================================
    // 이벤트 바인딩
    // ============================================
    function bindEvents() {
        // 토글 버튼
        document.getElementById('aiChatToggle').addEventListener('click', toggleChat);
        
        // 전송 버튼
        document.getElementById('aiChatSend').addEventListener('click', () => {
            sendMessage(document.getElementById('aiChatInput').value);
        });
        
        // Enter 키
        document.getElementById('aiChatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage(document.getElementById('aiChatInput').value);
            }
        });
        
        // 빠른 질문
        document.querySelectorAll('.ai-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                sendMessage(btn.dataset.q);
            });
        });
        
        // ESC로 닫기
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) {
                toggleChat();
            }
        });
    }
    
    // ============================================
    // 초기화
    // ============================================
    function init() {
        injectStyles();
        createWidget();
        bindEvents();
        loadData();
    }
    
    // DOM 로드 후 실행
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
