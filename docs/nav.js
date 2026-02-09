document.addEventListener('DOMContentLoaded', () => {
  const current = (location.pathname.split('/').pop() || 'index.html').split('?')[0];

  const links = document.querySelectorAll('.main-nav .nav-link');
  links.forEach(a => a.classList.remove('active'));

  // 현재 페이지와 href가 같은 링크 active
  links.forEach(a => {
    const href = (a.getAttribute('href') || '').split('?')[0];
    if (href === current) a.classList.add('active');
  });
});
