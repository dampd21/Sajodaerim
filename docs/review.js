/**
 * 리뷰 관리 대시보드
 * - 네이버 방문자 리뷰 + 블로그 리뷰
 * - 지점별/플랫폼별 필터
 * - 부정적 리뷰 필터
 * - 2단 그리드 레이아웃
 * - 전날/전주/전월 대비 통계
 */

let reviewData = null;
let filteredReviews = [];
let currentPlatform = 'naver';
let currentStore = '';
let currentReviewType = 'all';
let currentSort = 'recent';
let searchQuery = '';
let currentLayout = 'list';

// ============================================
// 초기화
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    await loadData();
    initEventListeners();
    renderDashboard();
});

// ============================================
// 데이터 로드
// ============================================

async function loadData() {
    try {
        var response = await fetch('review_data.json?t=' + Date.now());
        
        if (!response.ok) {
            throw new Error('데이터 파일 없음');
        }
        
        reviewData = await response.json();
        console.log('Review data loaded:', reviewData.summary);
        
        if (reviewData.generated_at) {
            var date = new Date(reviewData.generated_at);
            document.getElementById('updateTime').textContent = 
                '마지막 업데이트: ' + formatDateTime(date);
        }
        
        initStoreSelect();
        
    } catch (error) {
        console.error('Failed to load review data:', error);
        showNoDataMessage();
    }
}

function showNoDataMessage() {
    var content = document.getElementById('naverContent');
    if (content) {
        content.innerHTML = 
            '<div class="coming-soon-box">' +
                '<div class="coming-soon-icon">리뷰</div>' +
                '<h2>리뷰 데이터 없음</h2>' +
                '<p>아직 수집된 리뷰 데이터가 없습니다.<br>' +
                'GitHub Actions에서 Naver Review Crawler를 실행해주세요.</p>' +
            '</div>';
    }
}

// ============================================
// 이벤트 리스너
// ============================================

function initEventListeners() {
    // 플랫폼 탭
    var platformTabs = document.querySelectorAll('.platform-tab');
    for (var i = 0; i < platformTabs.length; i++) {
        platformTabs[i].addEventListener('click', function() {
            if (this.classList.contains('disabled')) return;
            switchPlatform(this.dataset.platform);
        });
    }
    
    // 배달 하위 탭
    var deliveryTabs = document.querySelectorAll('.delivery-tab');
    for (var i = 0; i < deliveryTabs.length; i++) {
        deliveryTabs[i].addEventListener('click', function() {
            var allTabs = document.querySelectorAll('.delivery-tab');
            for (var j = 0; j < allTabs.length; j++) {
                allTabs[j].classList.remove('active');
            }
            this.classList.add('active');
        });
    }
    
    // 지점 선택
    var storeSelect = document.getElementById('storeSelect');
    if (storeSelect) {
        storeSelect.addEventListener('change', function(e) {
            currentStore = e.target.value;
            filterAndRender();
        });
    }
    
    // 리뷰 타입 선택
    var reviewTypeSelect = document.getElementById('reviewTypeSelect');
    if (reviewTypeSelect) {
        reviewTypeSelect.addEventListener('change', function(e) {
            currentReviewType = e.target.value;
            filterAndRender();
        });
    }
    
    // 정렬
    var sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', function(e) {
            currentSort = e.target.value;
            filterAndRender();
        });
    }
    
    // 검색
    var searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            searchQuery = e.target.value;
            filterAndRender();
        });
    }
    
    // 레이아웃 토글
    var layoutBtns = document.querySelectorAll('.layout-btn');
    for (var i = 0; i < layoutBtns.length; i++) {
        layoutBtns[i].addEventListener('click', function() {
            var allBtns = document.querySelectorAll('.layout-btn');
            for (var j = 0; j < allBtns.length; j++) {
                allBtns[j].classList.remove('active');
            }
            this.classList.add('active');
            currentLayout = this.dataset.layout;
            updateListLayout();
        });
    }
    
    // 모달
    var modalClose = document.querySelector('#reviewModal .modal-close');
    if (modalClose) {
        modalClose.addEventListener('click', closeModal);
    }
    
    var reviewModal = document.getElementById('reviewModal');
    if (reviewModal) {
        reviewModal.addEventListener('click', function(e) {
            if (e.target.id === 'reviewModal') closeModal();
        });
    }
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeModal();
    });
}

// ============================================
// 플랫폼 전환
// ============================================

function switchPlatform(platform) {
    currentPlatform = platform;
    
    var tabs = document.querySelectorAll('.platform-tab');
    for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].dataset.platform === platform) {
            tabs[i].classList.add('active');
        } else {
            tabs[i].classList.remove('active');
        }
    }
    
    var panes = document.querySelectorAll('.platform-pane');
    for (var i = 0; i < panes.length; i++) {
        panes[i].classList.remove('active');
    }
    
    var activePane = document.getElementById(platform + 'Content');
    if (activePane) {
        activePane.classList.add('active');
    }
    
    var deliverySubtabs = document.getElementById('deliverySubtabs');
    if (deliverySubtabs) {
        deliverySubtabs.style.display = platform === 'delivery' ? 'flex' : 'none';
    }
}

// ============================================
// 필터 초기화
// ============================================

function initStoreSelect() {
    var select = document.getElementById('storeSelect');
    if (!select || !reviewData) return;
    
    var stores = reviewData.stores || [];
    
    select.innerHTML = '<option value="">전체 지점</option>';
    for (var i = 0; i < stores.length; i++) {
        var store = stores[i];
        var visitorCount = store.visitor_count || 0;
        var blogCount = store.blog_count || 0;
        select.innerHTML += '<option value="' + store.store_name + '">' + store.store_name + ' (' + (visitorCount + blogCount) + ')</option>';
    }
}

// ============================================
