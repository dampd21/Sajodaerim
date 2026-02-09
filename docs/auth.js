/**
 * 인증 체크 (모든 페이지 상단에 포함)
 * - sessionStorage의 토큰을 auth-config.js의 session_token과 비교
 * - 미인증 시 login.html로 리다이렉트
 * - 로그아웃 버튼을 네비바에 추가
 */
(function() {
    // login.html에서는 실행하지 않음
    var currentPage = (location.pathname || '').split('/').pop() || '';
    if (currentPage === 'login.html' || currentPage === '') {
        // index가 기본이면 빈 문자열일 수 있으므로 login만 제외
        if (currentPage === 'login.html') return;
    }

    function checkAuth() {
        // auth-config.js가 로드되지 않은 경우
        if (typeof AUTH_CONFIG === 'undefined') {
            // 설정 파일이 없으면 인증 스킵 (개발 모드)
            console.warn('auth-config.js not found - auth skipped');
            return;
        }

        var token = sessionStorage.getItem('auth_token');
        if (!token || token !== AUTH_CONFIG.session_token) {
            // 미인증 - 로그인 페이지로
            location.href = 'login.html';
            return;
        }

        // 인증 완료 - 로그아웃 버튼 추가
        addLogoutButton();
    }

    function addLogoutButton() {
        // DOM 준비 후 실행
        function attach() {
            var nav = document.querySelector('.main-nav');
            if (!nav) return;

            // 이미 추가되어 있으면 스킵
            if (nav.querySelector('.nav-logout')) return;

            var btn = document.createElement('a');
            btn.href = '#';
            btn.className = 'nav-logout';
            btn.textContent = '로그아웃';
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                sessionStorage.removeItem('auth_token');
                location.href = 'login.html';
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
