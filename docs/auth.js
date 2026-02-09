/**
 * 인증 체크 (모든 페이지 상단에 포함)
 * - sessionStorage의 토큰을 auth-config.js의 session_token과 비교
 * - 미인증 시 login.html로 리다이렉트
 * - 로그아웃 버튼을 네비바에 추가
 *
 * v10.1 안정화:
 * - AUTH_CONFIG 누락/disabled/필드 누락을 안전하게 처리
 * - 설정 누락이면 login.html로 reason과 함께 이동(무한루프 방지)
 */
(function() {
    var currentPage = (location.pathname || '').split('/').pop() || '';

    // login.html에서는 실행하지 않음
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

    function checkAuth() {
        var state = getAuthState();

        // 설정 누락/비활성/손상 → 로그인 페이지로 이동(보안상 open-access 방지)
        if (!state.ok) {
            redirectToLogin(state.reason);
            return;
        }

        var token = sessionStorage.getItem('auth_token');
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
                sessionStorage.removeItem('auth_token');
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
