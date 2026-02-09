/**
 * 네비게이션 active 상태 관리 (전 페이지 공통)
 * - 현재 URL 기준으로 active 클래스 자동 설정
 * - HTML에 하드코딩된 active를 모두 제거하고 이 스크립트가 처리
 */
(function() {
    function fixNav() {
        var current = (location.pathname || '').split('/').pop() || 'index.html';
        current = current.split('?')[0].split('#')[0];
        if (!current) current = 'index.html';

        var links = document.querySelectorAll('.main-nav .nav-link');
        links.forEach(function(a) {
            a.classList.remove('active');
            var href = (a.getAttribute('href') || '').split('?')[0].split('#')[0];
            if (href === current) {
                a.classList.add('active');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fixNav);
    } else {
        fixNav();
    }
})();
