/**
 * 리뷰 관리 대시보드
 * - 네이버 방문자 리뷰 + 블로그 리뷰
 * - 지점별/플랫폼별 필터
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

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initEventListeners();
    renderDashboard();
});

// ============================================
// 데이터 로드
// ============================================

async function loadData() {
    try {
        const response = await fetch('review_data.json?t=' + Date.now());
        
        if (!response.ok) {
            throw new Error('데이터 파일 없음');
        }
        
        reviewData = await response.json();
        console.log('Review data loaded:', reviewData.summary);
        
        if (reviewData.generated_at) {
            const date = new Date(reviewData.generated_at);
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
    const content = document.getElementById('naverContent');
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
    document.querySelectorAll('.platform-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.classList.contains('disabled')) return;
            switchPlatform(tab.dataset.platform);
        });
    });
    
    // 배달 하위 탭
    document.querySelectorAll('.delivery-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.delivery-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });
    
    // 지점 선택
    document.getElementById('storeSelect')?.addEventListener('change', (e) => {
        currentStore = e.target.value;
        filterAndRender();
    });
    
    // 리뷰 타입 선택
    document.getElementById('reviewTypeSelect')?.addEventListener('change', (e) => {
        currentReviewType = e.target.value;
        filterAndRender();
    });
    
    // 정렬
    document.getElementById('sortSelect')?.addEventListener('change', (e) => {
        currentSort = e.target.value;
        filterAndRender();
    });
    
    // 검색
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        filterAndRender();
    });
    
    // 모달
    document.querySelector('#reviewModal .modal-close')?.addEventListener('click', closeModal);
    document.getElementById('reviewModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'reviewModal') closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// ============================================
// 플랫폼 전환
// ============================================

function switchPlatform(platform) {
    currentPlatform = platform;
    
    document.querySelectorAll('.platform-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.platform === platform);
    });
    
    document.querySelectorAll('.platform-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    document.getElementById(platform + 'Content')?.classList.add('active');
    
    const deliverySubtabs = document.getElementById('deliverySubtabs');
    if (deliverySubtabs) {
        deliverySubtabs.style.display = platform === 'delivery' ? 'flex' : 'none';
    }
}

// ============================================
// 필터 초기화
// ============================================

function initStoreSelect() {
    const select = document.getElementById('storeSelect');
    if (!select || !reviewData) return;
    
    const stores = reviewData.stores || [];
    
    select.innerHTML = '<option value="">전체 지점</option>';
    stores.forEach(store => {
        const visitorCount = store.visitor_count || 0;
        const blogCount = store.blog_count || 0;
        select.innerHTML += '<option value="' + store.store_name + '">' + store.store_name + ' (' + (visitorCount + blogCount) + ')</option>';
    });
}

// ============================================
// 대시보드 렌더링
// ============================================

function renderDashboard() {
    if (!reviewData) return;
    
    renderSummaryCards();
    filterAndRender();
}

function renderSummaryCards() {
    const summary = reviewData.summary || {};
    
    document.getElementById('totalReviews').textContent = formatNumber(summary.total_reviews || 0);
    document.getElementById('totalStores').textContent = formatNumber(summary.total_stores || 0);
    document.getElementById('visitorReviews').textContent = formatNumber(summary.total_visitor_reviews || 0);
    document.getElementById('blogReviews').textContent = formatNumber(summary.total_blog_reviews || 0);
}

// ============================================
// 필터링 및 렌더링
// ============================================

function filterAndRender() {
    if (!reviewData) return;
    
    let allReviews = [];
    
    (reviewData.stores || []).forEach(store => {
        // 방문자 리뷰
        if (currentReviewType === 'all' || currentReviewType === 'visitor') {
            (store.visitor_reviews || []).forEach(review => {
                allReviews.push({
                    ...review,
                    store_name: store.store_name
                });
            });
        }
        
        // 블로그 리뷰
        if (currentReviewType === 'all' || currentReviewType === 'blog') {
            (store.blog_reviews || []).forEach(review => {
                allReviews.push({
                    ...review,
                    store_name: store.store_name
                });
            });
        }
    });
    
    // 지점 필터
    if (currentStore) {
        allReviews = allReviews.filter(r => r.store_name === currentStore);
    }
    
    // 검색 필터
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        allReviews = allReviews.filter(r => 
            (r.content || '').toLowerCase().includes(query) ||
            (r.author || '').toLowerCase().includes(query) ||
            (r.title || '').toLowerCase().includes(query) ||
            (r.tags || []).some(t => t.toLowerCase().includes(query)) ||
            (r.keywords || []).some(k => k.toLowerCase().includes(query))
        );
    }
    
    // 정렬
    allReviews.sort((a, b) => {
        const dateA = a.visit_date || a.write_date || '';
        const dateB = b.visit_date || b.write_date || '';
        
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
    const container = document.getElementById('tagCloud');
    if (!container) return;
    
    const tagCounts = {};
    
    filteredReviews.forEach(review => {
        (review.tags || []).forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
    });
    
    const topTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    if (topTags.length === 0) {
        container.innerHTML = '<span style="color: #666;">태그 데이터가 없습니다.</span>';
        return;
    }
    
    container.innerHTML = topTags.map(function(item) {
        const tag = item[0];
        const count = item[1];
        return '<div class="tag-item" data-tag="' + escapeHtml(tag) + '">' +
            '<span>' + escapeHtml(tag) + '</span>' +
            '<span class="tag-count">' + count + '</span>' +
        '</div>';
    }).join('');
    
    container.querySelectorAll('.tag-item').forEach(item => {
        item.addEventListener('click', () => {
            const tag = item.dataset.tag;
            document.getElementById('searchInput').value = tag;
            searchQuery = tag;
            filterAndRender();
        });
    });
}

// ============================================
// 리뷰 목록 렌더링
// ============================================

function renderReviewList() {
    const container = document.getElementById('reviewList');
    const countEl = document.getElementById('reviewCount');
    
    if (!container) return;
    
    if (countEl) {
        countEl.textContent = '(' + filteredReviews.length + '개)';
    }
    
    if (filteredReviews.length === 0) {
        container.innerHTML = 
            '<div class="empty-reviews">' +
                '<div class="empty-icon">리뷰</div>' +
                '<p>리뷰가 없습니다.</p>' +
            '</div>';
        return;
    }
    
    container.innerHTML = filteredReviews.map(function(review, idx) {
        const isBlog = review.type === 'blog';
        const dateRaw = review.visit_date_raw || review.write_date_raw || '';
        
        let html = '<div class="review-card ' + (isBlog ? 'blog-review' : 'visitor-review') + '" data-index="' + idx + '">';
        
        // 헤더
        html += '<div class="review-header">';
        html += '<div class="review-author">';
        html += '<div class="author-avatar">' + (isBlog ? 'B' : 'V') + '</div>';
        html += '<div class="author-info">';
        html += '<span class="author-name">' + escapeHtml(review.author || '익명') + '</span>';
        if (isBlog && review.blog_name) {
            html += '<span class="blog-name">' + escapeHtml(review.blog_name) + '</span>';
        }
        if (review.visit_info && review.visit_info.length > 0) {
            html += '<span class="author-meta">' + review.visit_info.join(' / ') + '</span>';
        }
        html += '</div></div>';
        
        html += '<div class="review-meta">';
        html += '<span class="type-badge ' + (isBlog ? 'type-blog' : 'type-visitor') + '">' + (isBlog ? '블로그' : '방문자') + '</span>';
        html += '<span class="store-badge">' + escapeHtml(review.store_name || '') + '</span>';
        html += '<span class="review-date">' + escapeHtml(dateRaw) + '</span>';
        html += '</div></div>';
        
        // 블로그 제목
        if (isBlog && review.title) {
            html += '<div class="review-title">' + escapeHtml(review.title) + '</div>';
        }
        
        // 이미지
        if (review.images && review.images.length > 0) {
            html += '<div class="review-images">';
            review.images.slice(0, 4).forEach(function(img) {
                html += '<img src="' + escapeHtml(img) + '" class="review-image" alt="리뷰 이미지" loading="lazy">';
            });
            if (review.images.length > 4) {
                html += '<span class="more-images">+' + (review.images.length - 4) + '</span>';
            }
            html += '</div>';
        }
        
        // 내용
        html += '<div class="review-content truncated">' + escapeHtml(review.content || '') + '</div>';
        
        // 키워드
        if (review.keywords && review.keywords.length > 0) {
            html += '<div class="review-keywords">';
            review.keywords.forEach(function(kw) {
                html += '<span class="keyword-badge">' + escapeHtml(kw) + '</span>';
            });
            html += '</div>';
        }
        
        // 태그
        if (review.tags && review.tags.length > 0) {
            html += '<div class="review-tags">';
            review.tags.forEach(function(tag) {
                html += '<span class="review-tag">' + escapeHtml(tag) + '</span>';
            });
            html += '</div>';
        }
        
        // 블로그 링크
        if (isBlog && review.blog_url) {
            html += '<a href="' + escapeHtml(review.blog_url) + '" target="_blank" class="blog-link">블로그 원문 보기</a>';
        }
        
        html += '</div>';
        
        return html;
    }).join('');
    
    container.querySelectorAll('.review-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('blog-link')) return;
            const idx = parseInt(card.dataset.index);
            showReviewModal(filteredReviews[idx]);
        });
    });
}

// ============================================
// 리뷰 상세 모달
// ============================================

function showReviewModal(review) {
    const modal = document.getElementById('reviewModal');
    const body = document.getElementById('reviewModalBody');
    
    if (!modal || !body || !review) return;
    
    const isBlog = review.type === 'blog';
    const dateRaw = review.visit_date_raw || review.write_date_raw || '';
    
    let html = '<div class="review-detail">';
    
    // 헤더
    html += '<div class="review-header">';
    html += '<div class="review-author">';
    html += '<div class="author-avatar">' + (isBlog ? 'B' : 'V') + '</div>';
    html += '<div class="author-info">';
    html += '<span class="author-name">' + escapeHtml(review.author || '익명') + '</span>';
    if (isBlog && review.blog_name) {
        html += '<span class="blog-name">' + escapeHtml(review.blog_name) + '</span>';
    }
    if (review.visit_info && review.visit_info.length > 0) {
        html += '<span class="author-meta">' + review.visit_info.join(' / ') + '</span>';
    }
    html += '</div></div>';
    
    html += '<div class="review-meta">';
    html += '<span class="type-badge ' + (isBlog ? 'type-blog' : 'type-visitor') + '">' + (isBlog ? '블로그' : '방문자') + '</span>';
    html += '<span class="store-badge">' + escapeHtml(review.store_name || '') + '</span>';
    html += '<span class="review-date">' + escapeHtml(dateRaw) + '</span>';
    html += '</div></div>';
    
    // 블로그 제목
    if (isBlog && review.title) {
        html += '<div class="review-title">' + escapeHtml(review.title) + '</div>';
    }
    
    // 이미지
    if (review.images && review.images.length > 0) {
        html += '<div class="review-images">';
        review.images.forEach(function(img) {
            html += '<img src="' + escapeHtml(img) + '" class="review-image" alt="리뷰 이미지">';
        });
        html += '</div>';
    }
    
    // 내용
    html += '<div class="review-content">' + escapeHtml(review.content || '') + '</div>';
    
    // 키워드
    if (review.keywords && review.keywords.length > 0) {
        html += '<div class="review-keywords">';
        review.keywords.forEach(function(kw) {
            html += '<span class="keyword-badge">' + escapeHtml(kw) + '</span>';
        });
        html += '</div>';
    }
    
    // 태그
    if (review.tags && review.tags.length > 0) {
        html += '<div class="review-tags">';
        review.tags.forEach(function(tag) {
            html += '<span class="review-tag">' + escapeHtml(tag) + '</span>';
        });
        html += '</div>';
    }
    
    // 블로그 링크
    if (isBlog && review.blog_url) {
        html += '<a href="' + escapeHtml(review.blog_url) + '" target="_blank" class="blog-link-modal">블로그 원문 보기</a>';
    }
    
    html += '</div>';
    
    body.innerHTML = html;
    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('reviewModal')?.classList.remove('active');
}

// ============================================
// 유틸리티 함수
// ============================================

function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return new Intl.NumberFormat('ko-KR').format(num);
}

function formatDateTime(date) {
    return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
