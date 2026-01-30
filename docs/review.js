/**
 * 리뷰 관리 대시보드
 * - 네이버 방문자 리뷰 + 블로그 리뷰
 * - 지점별/플랫폼별 필터
 * - 부정적 리뷰 필터
 * - 항상 2단 그리드 레이아웃
 * - 전날/전주/전월 대비 통계
 */

let reviewData = null;
let filteredReviews = [];
let currentPlatform = 'naver';
let currentStore = '';
let currentReviewType = 'all';
let currentSort = 'recent';
let searchQuery = '';

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
                '<div class="coming-soon-icon">📝</div>' +
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
// 대시보드 렌더링
// ============================================

function renderDashboard() {
    if (!reviewData) return;
    
    renderSummaryCards();
    renderStatsCards();
    filterAndRender();
}

function renderSummaryCards() {
    var summary = reviewData.summary || {};
    
    document.getElementById('totalReviews').textContent = formatNumber(summary.total_reviews || 0);
    document.getElementById('totalStores').textContent = formatNumber(summary.total_stores || 0);
    document.getElementById('visitorReviews').textContent = formatNumber(summary.total_visitor_reviews || 0);
    document.getElementById('blogReviews').textContent = formatNumber(summary.total_blog_reviews || 0);
    document.getElementById('negativeReviews').textContent = formatNumber(summary.total_negative || 0);
}

function renderStatsCards() {
    var stats = reviewData.stats || {};
    
    // 오늘 리뷰
    var todayEl = document.getElementById('todayReviews');
    if (todayEl) {
        todayEl.textContent = formatNumber(stats.today || 0);
    }
    
    // 이번 주 리뷰
    var weeklyEl = document.getElementById('weeklyReviews');
    if (weeklyEl) {
        weeklyEl.textContent = formatNumber(stats.this_week || 0);
    }
    
    // 이번 달 리뷰
    var monthlyEl = document.getElementById('monthlyReviews');
    if (monthlyEl) {
        monthlyEl.textContent = formatNumber(stats.this_month || 0);
    }
    
    // 전일 대비
    renderChangeIndicator('dailyChange', stats.daily_change || 0);
    
    // 전주 대비
    renderChangeIndicator('weeklyChange', stats.weekly_change || 0);
    
    // 전월 대비
    renderChangeIndicator('monthlyChange', stats.monthly_change || 0);
}

function renderChangeIndicator(elementId, changeValue) {
    var container = document.getElementById(elementId);
    if (!container) return;
    
    var changeEl = container.querySelector('.change-value');
    if (!changeEl) return;
    
    var changeClass = 'neutral';
    var changeText = '0%';
    
    if (changeValue > 0) {
        changeClass = 'positive';
        changeText = '+' + changeValue + '%';
    } else if (changeValue < 0) {
        changeClass = 'negative';
        changeText = changeValue + '%';
    }
    
    container.className = 'stats-change ' + changeClass;
    changeEl.textContent = changeText;
}

// ============================================
// 필터링 및 렌더링
// ============================================

function filterAndRender() {
    if (!reviewData) return;
    
    var allReviews = [];
    var stores = reviewData.stores || [];
    
    for (var i = 0; i < stores.length; i++) {
        var store = stores[i];
        
        // 방문자 리뷰
        if (currentReviewType === 'all' || currentReviewType === 'visitor' || currentReviewType === 'negative') {
            var visitorReviews = store.visitor_reviews || [];
            for (var j = 0; j < visitorReviews.length; j++) {
                var review = Object.assign({}, visitorReviews[j]);
                review.store_name = store.store_name;
                
                // 부정적 리뷰 필터
                if (currentReviewType === 'negative' && !review.is_negative) {
                    continue;
                }
                
                if (currentReviewType !== 'blog') {
                    allReviews.push(review);
                }
            }
        }
        
        // 블로그 리뷰
        if (currentReviewType === 'all' || currentReviewType === 'blog' || currentReviewType === 'negative') {
            var blogReviews = store.blog_reviews || [];
            for (var j = 0; j < blogReviews.length; j++) {
                var review = Object.assign({}, blogReviews[j]);
                review.store_name = store.store_name;
                
                // 부정적 리뷰 필터
                if (currentReviewType === 'negative' && !review.is_negative) {
                    continue;
                }
                
                if (currentReviewType !== 'visitor') {
                    allReviews.push(review);
                }
            }
        }
    }
    
    // 지점 필터
    if (currentStore) {
        allReviews = allReviews.filter(function(r) {
            return r.store_name === currentStore;
        });
    }
    
    // 검색 필터
    if (searchQuery) {
        var query = searchQuery.toLowerCase();
        allReviews = allReviews.filter(function(r) {
            var content = (r.content || '').toLowerCase();
            var author = (r.author || '').toLowerCase();
            var title = (r.title || '').toLowerCase();
            var tags = r.tags || [];
            var keywords = r.keywords || [];
            
            if (content.indexOf(query) >= 0) return true;
            if (author.indexOf(query) >= 0) return true;
            if (title.indexOf(query) >= 0) return true;
            
            for (var i = 0; i < tags.length; i++) {
                if (tags[i].toLowerCase().indexOf(query) >= 0) return true;
            }
            for (var i = 0; i < keywords.length; i++) {
                if (keywords[i].toLowerCase().indexOf(query) >= 0) return true;
            }
            
            return false;
        });
    }
    
    // 정렬
    allReviews.sort(function(a, b) {
        var dateA = a.visit_date || a.write_date || '';
        var dateB = b.visit_date || b.write_date || '';
        
        if (currentSort === 'oldest') {
            return dateA.localeCompare(dateB);
        } else {
            return dateB.localeCompare(dateA);
        }
    });
    
    filteredReviews = allReviews;
    
    renderTagCloud();
    renderReviewList();
}

// ============================================
// 태그 클라우드 렌더링
// ============================================

function renderTagCloud() {
    var container = document.getElementById('tagCloud');
    if (!container) return;
    
    var tagCounts = {};
    
    for (var i = 0; i < filteredReviews.length; i++) {
        var review = filteredReviews[i];
        var tags = review.tags || [];
        for (var j = 0; j < tags.length; j++) {
            var tag = tags[j];
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
    }
    
    var tagArray = [];
    for (var tag in tagCounts) {
        tagArray.push([tag, tagCounts[tag]]);
    }
    
    tagArray.sort(function(a, b) {
        return b[1] - a[1];
    });
    
    var topTags = tagArray.slice(0, 10);
    
    if (topTags.length === 0) {
        container.innerHTML = '<span style="color: #666;">태그 데이터가 없습니다.</span>';
        return;
    }
    
    var html = '';
    for (var i = 0; i < topTags.length; i++) {
        var tag = topTags[i][0];
        var count = topTags[i][1];
        html += '<div class="tag-item" data-tag="' + escapeHtml(tag) + '">' +
            '<span>' + escapeHtml(tag) + '</span>' +
            '<span class="tag-count">' + count + '</span>' +
        '</div>';
    }
    container.innerHTML = html;
    
    var tagItems = container.querySelectorAll('.tag-item');
    for (var i = 0; i < tagItems.length; i++) {
        tagItems[i].addEventListener('click', function() {
            var tag = this.dataset.tag;
            
