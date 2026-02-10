/**
 * 인증 체크 (모든 페이지 상단에 포함)
 * - sessionStorage/localStorage의 토큰을 auth-config.js의 session_token과 비교
 * - 미인증 시 login.html로 리다이렉트
 * - 로그아웃 버튼을 네비바에 추가
 *
 * 안정화 포인트:
 * - auth-config.js 토큰이 배포마다 바뀌면 로그인 유지가 깨지므로
 *   deploy-pages.yml에서 session_token을 고정 토큰으로 생성하는 것을 권장
 */
(function() {
    var currentPage = (location.pathname || '').split('/').pop() || '';

    if (currentPage === 'login.html') return;

    function getAuthState() {
        if (typeof AUTH_CONFIG === 'undefined') {
            return { ok: false, reason: 'config_missing' };
        }
        if (AUTH_CONFIG && AUTH_CONFIG.disabled === true) {
            return { ok: false, reason: 'auth_disabled' };
        }
        if (!AUTH_CONFIG.password_hash || !AUTH_CONFIG.session_token) {
            return { ok: false, reason: 'config_invalid' };
        }
        return { ok: true, reason: '' };
    }

    function redirectToLogin(reason) {
        var url = 'login.html';
        if (reason) url += '?reason=' + encodeURIComponent(reason);
        location.href = url;
    }

    function getStoredToken() {
        var t = sessionStorage.getItem('auth_token');
        if (t) return t;
        try {
            return localStorage.getItem('auth_token') || '';
        } catch (e) {
            return '';
        }
    }

    function clearStoredToken() {
        sessionStorage.removeItem('auth_token');
        try { localStorage.removeItem('auth_token'); } catch (e) {}
    }

    function checkAuth() {
        var state = getAuthState();
        if (!state.ok) {
            redirectToLogin(state.reason);
            return;
        }

        var token = getStoredToken();
        if (!token || token !== AUTH_CONFIG.session_token) {
            redirectToLogin('not_authenticated');
            return;
        }

        addLogoutButton();
    }

    function addLogoutButton() {
        function attach() {
            var nav = document.querySelector('.main-nav');
            if (!nav) return;

            if (nav.querySelector('.nav-logout')) return;

            var btn = document.createElement('a');
            btn.href = '#';
            btn.className = 'nav-logout';
            btn.textContent = '로그아웃';
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                clearStoredToken();
                redirectToLogin('logged_out');
            });

            nav.appendChild(btn);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', attach);
        } else {
            attach();
        }
    }

    checkAuth();
})();
