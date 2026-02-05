/**
 * 리뷰 관리 대시보드 v5
 * - 네이버, 배달의민족, 쿠팡이츠 3개 플랫폼 지원
 * - 플랫폼별 데이터 파일 분리
 */

// 플랫폼별 데이터
let naverData = null;
let baeminData = null;
let coupangData = null;

// 필터 상태
let currentPlatform = 'naver';
let currentStore = '';
let currentReviewType = 'all';
let currentSort = 'recent';
let searchQuery = '';

// 네이버 무한 스크롤용
let filteredReviews = [];
let displayedReviews = [];
const REVIEWS_PER_PAGE = 20;
let currentPage = 1;
let isLoading = false;
let hasMoreReviews = true;

// ============================================
// 초기화
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    await loadAllData();
    initEventListeners();
    initInfiniteScroll();
    renderCurrentPlatform();
});

// ============================================
// 데이터 로드
// ============================================

async function loadAllData() {
    // 네이버 데이터
    try {
        const naverResponse = await fetch('review_data.json?t=' + Date.now());
        if (naverResponse.ok) {
            naverData = await naverResponse.json();
            console.log('Naver data loaded:', naverData.summary);
        }
    } catch (e) {
        console.log('Naver data not available');
    }
    
    // 배달의민족 데이터
    try {
        const baeminResponse = await fetch('review_baemin_data.json?t=' + Date.now());
        if (baeminResponse.ok) {
            baeminData = await baeminResponse.json();
            console.log('Baemin data loaded:', baeminData.summary);
        }
    } catch (e) {
        console.log('Baemin data not available');
    }
    
    // 쿠팡이츠 데이터
    try {
        const coupangResponse = await fetch('review_coupangeats_data.json?t=' + Date.now());
        if (coupangResponse.ok) {
            coupangData = await coupangResponse.json();
            console.log('Coupang data loaded:', coupangData.summary);
        }
    } catch (e) {
        console.log('Coupang data not available');
    }
    
    // 업데이트 시간 표시
    updateTimestamp();
}

function updateTimestamp() {
    let latestTime = null;
    
    if (naverData?.generated_at) {
        latestTime = new Date(naverData.generated_at);
    }
    if (baeminData?.generated_at) {
        const t = new Date(baeminData.generated_at);
        if (!latestTime || t > latestTime) latestTime = t;
    }
    if (coupangData?.generated_at) {
        const t = new Date(coupangData.generated_at);
        if (!latestTime || t > latestTime) latestTime = t;
    }
    
    if (latestTime) {
        document.getElementById('updateTime').textContent = 
            '마지막 업데이트: ' + formatDateTime(latestTime);
    }
}

// ============================================
// 무한 스크롤 (네이버용)
// ============================================

function initInfiniteScroll() {
    const sentinel = document.getElementById('scrollSentinel');
    if (!sentinel) return;
    
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMoreReviews && currentPlatform === 'naver') {
            loadMoreReviews();
        }
    }, { rootMargin: '200px' });
    
    observer.observe(sentinel);
}

function loadMoreReviews() {
    if (isLoading || !hasMoreReviews) return;
    
    isLoading = true;
    showLoadingIndicator(true);
    
    setTimeout(() => {
        currentPage++;
        const startIdx = (currentPage - 1) * REVIEWS_PER_PAGE;
        const endIdx = startIdx + REVIEWS_PER_PAGE;
        const newReviews = filteredReviews.slice(startIdx, endIdx);
        
        if (newReviews.length > 0) {
            appendNaverReviewCards(newReviews, startIdx);
        }
        
        hasMoreReviews = endIdx < filteredReviews.length;
        isLoading = false;
        showLoadingIndicator(false);
        
        updateNaverReviewCount();
    }, 100);
}

function showLoadingIndicator(show) {
    let indicator = document.getElementById('loadingIndicator');
    
    if (show) {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'loadingIndicator';
            indicator.className = 'loading-indicator';
            indicator.innerHTML = '<div class="loading-spinner-small"></div><span>리뷰 불러오는 중...</span>';
            const reviewList = document.getElementById('reviewList');
            if (reviewList) {
                reviewList.parentNode.appendChild(indicator);
            }
        }
        indicator.style.display = 'flex';
    } else if (indicator) {
        indicator.style.display = 'none';
    }
}

// ============================================
// 이벤트 리스너
// ============================================

function initEventListeners() {
    // 플랫폼 탭 전환
    document.querySelectorAll('.platform-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            if (this.classList.contains('disabled')) return;
            switchPlatform(this.dataset.platform);
        });
    });
    
    // 필터
    document.getElementById('storeSelect')?.addEventListener('change', function() {
        currentStore = this.value;
        resetAndRender();
    });
    
    document.getElementById('reviewTypeSelect')?.addEventListener('change', function() {
        currentReviewType = this.value;
        resetAndRender();
    });
    
    document.getElementById('sortSelect')?.addEventListener('change', function() {
        currentSort = this.value;
        resetAndRender();
    });
    
    let searchTimeout;
    document.getElementById('searchInput')?.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchQuery = this.value;
            resetAndRender();
        }, 300);
    });
    
    // 모달
    document.querySelector('#reviewModal .modal-close')?.addEventListener('click', closeModal);
    document.getElementById('reviewModal')?.addEventListener('click', function(e) {
        if (e.target.id === 'reviewModal') closeModal();
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeModal();
    });
}

function resetAndRender() {
    currentPage = 1;
    hasMoreReviews = true;
    displayedReviews = [];
    filteredReviews = [];
    renderCurrentPlatform();
}

// ============================================
// 플랫폼 전환
// ============================================

function switchPlatform(platform) {
    currentPlatform = platform;
    
    // 탭 활성화
    document.querySelectorAll('.platform-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.platform === platform);
    });
    
    // 콘텐츠 전환
    document.querySelectorAll('.platform-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    document.getElementById(platform + 'Content')?.classList.add('active');
    
    // 리뷰 타입 필터 업데이트
    updateReviewTypeFilter();
    
    // 지점 목록 업데이트
    updateStoreSelect();
    
    // 데이터 렌더링
    resetAndRender();
}

function updateReviewTypeFilter() {
    const select = document.getElementById('reviewTypeSelect');
    if (!select) return;
    
    if (currentPlatform === 'naver') {
        select.innerHTML = `
            <option value="all">전체</option>
            <option value="visitor">방문자 리뷰</option>
            <option value="blog">블로그 리뷰</option>
            <option value="negative">부정적 리뷰</option>
        `;
    } else {
        select.innerHTML = `
            <option value="all">전체</option>
            <option value="negative">부정적 리뷰</option>
        `;
    }
    currentReviewType = 'all';
}

function updateStoreSelect() {
    const select = document.getElementById('storeSelect');
    if (!select) return;
    
    let stores = [];
    
    if (currentPlatform === 'naver' && naverData) {
        stores = (naverData.stores || []).map(s => s.store_name);
    } else if (currentPlatform === 'baemin' && baeminData) {
        stores = (baeminData.stores || []).map(s => s.store_name);
    } else if (currentPlatform === 'coupangeats' && coupangData) {
        stores = (coupangData.stores || []).map(s => s.store_name);
    }
    
    select.innerHTML = '<option value="">전체 지점</option>';
    stores.forEach(store => {
        select.innerHTML += `<option value="${store}">${store}</option>`;
    });
    
    currentStore = '';
}

// ============================================
// 플랫폼별 렌더링 분기
// ============================================

function renderCurrentPlatform() {
    switch (currentPlatform) {
        case 'naver':
            renderNaverContent();
            break;
        case 'baemin':
            renderBaeminContent();
            break;
        case 'coupangeats':
            renderCoupangContent();
            break;
    }
}

function showNoDataMessage(containerId, message) {
    const container = document.getElementById(containerId);
    if (container) {
        // 요약 카드 영역 제외하고 메시지 표시
        const reviewListSection = container.querySelector('.review-list-section');
        if (reviewListSection) {
            reviewListSection.innerHTML = `
                <div class="coming-soon-box" style="min-height: 300px;">
                    <div class="coming-soon-icon">No Data</div>
                    <h2>데이터 없음</h2>
                    <p>${message}</p>
                </div>`;
        }
    }
}

// ============================================
// 네이버 렌더링
// ============================================

function renderNaverContent() {
    if (!naverData) {
        showNoDataMessage('naverContent', '네이버 리뷰 데이터가 없습니다.');
        return;
    }
    
    renderNaverSummary();
    filterNaverReviews();
    renderNaverTagCloud();
    renderNaverReviewList();
}

function renderNaverSummary() {
    const stores = naverData.stores || [];
    
    if (currentStore) {
        const selectedStore = stores.find(s => s.store_name === currentStore);
        if (selectedStore) {
            const metaVisitor = selectedStore.meta_visitor_count || 0;
            const metaBlog = selectedStore.meta_blog_count || 0;
            const totalReviews = metaVisitor + metaBlog;
            const negativeCount = countNegativeReviews(selectedStore);
            
            document.getElementById('totalReviews').textContent = formatNumber(totalReviews);
            document.getElementById('totalStores').textContent = selectedStore.store_name;
            document.getElementById('visitorReviews').textContent = formatNumber(metaVisitor);
            document.getElementById('blogReviews').textContent = formatNumber(metaBlog);
            document.getElementById('negativeReviews').textContent = formatNumber(negativeCount);
        }
    } else {
        const summary = naverData.summary || {};
        const metaTotalVisitor = summary.meta_total_visitor || 0;
        const metaTotalBlog = summary.meta_total_blog || 0;
        const metaTotal = metaTotalVisitor + metaTotalBlog;
        
        document.getElementById('totalReviews').textContent = formatNumber(metaTotal || summary.total_reviews || 0);
        document.getElementById('totalStores').textContent = formatNumber(summary.total_stores || 0);
        document.getElementById('visitorReviews').textContent = formatNumber(metaTotalVisitor || summary.total_visitor_reviews || 0);
        document.getElementById('blogReviews').textContent = formatNumber(metaTotalBlog || summary.total_blog_reviews || 0);
        document.getElementById('negativeReviews').textContent = formatNumber(summary.total_negative || 0);
    }
}

function countNegativeReviews(store) {
    let count = 0;
    (store.visitor_reviews || []).forEach(r => { if (r.is_negative) count++; });
    (store.blog_reviews || []).forEach(r => { if (r.is_negative) count++; });
    return count;
}

function filterNaverReviews() {
    let allReviews = [];
    const stores = naverData.stores || [];
    
    stores.forEach(store => {
        if (currentStore && store.store_name !== currentStore) return;
        
        if (currentReviewType !== 'blog') {
            (store.visitor_reviews || []).forEach(review => {
                const r = { ...review, store_name: store.store_name };
                if (currentReviewType === 'negative' && !r.is_negative) return;
                if (currentReviewType !== 'negative' || r.is_negative) {
                    allReviews.push(r);
                }
            });
        }
        
        if (currentReviewType !== 'visitor') {
            (store.blog_reviews || []).forEach(review => {
                const r = { ...review, store_name: store.store_name };
                if (currentReviewType === 'negative' && !r.is_negative) return;
                if (currentReviewType !== 'negative' || r.is_negative) {
                    allReviews.push(r);
                }
            });
        }
    });
    
    // 검색 필터
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        allReviews = allReviews.filter(r => {
            const content = (r.content || '').toLowerCase();
            const author = (r.author || '').toLowerCase();
            const title = (r.title || '').toLowerCase();
            const tags = (r.tags || []).join(' ').toLowerCase();
            return content.includes(query) || author.includes(query) || 
                   title.includes(query) || tags.includes(query);
        });
    }
    
    // 정렬
    allReviews.sort((a, b) => {
        const dateA = a.visit_date || a.write_date || '';
        const dateB = b.visit_date || b.write_date || '';
        return currentSort === 'oldest' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    });
    
    filteredReviews = allReviews;
}

function renderNaverTagCloud() {
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
    
    container.innerHTML = topTags.map(([tag, count]) => `
        <div class="tag-item" data-tag="${escapeHtml(tag)}">
            <span>${escapeHtml(tag)}</span>
            <span class="tag-count">${count}</span>
        </div>
    `).join('');
    
    container.querySelectorAll('.tag-item').forEach(item => {
        item.addEventListener('click', function() {
            document.getElementById('searchInput').value = this.dataset.tag;
            searchQuery = this.dataset.tag;
            resetAndRender();
        });
    });
}

function renderNaverReviewList() {
    const container = document.getElementById('reviewList');
    if (!container) return;
    
    container.innerHTML = '';
    displayedReviews = [];
    currentPage = 1;
    hasMoreReviews = true;
    
    updateNaverReviewCount();
    
    if (filteredReviews.length === 0) {
        container.innerHTML = `
            <div class="empty-reviews">
                <div class="empty-icon">No Reviews</div>
                <p>리뷰가 없습니다.</p>
            </div>`;
        hasMoreReviews = false;
        return;
    }
    
    const initialReviews = filteredReviews.slice(0, REVIEWS_PER_PAGE);
    appendNaverReviewCards(initialReviews, 0);
    
    hasMoreReviews = filteredReviews.length > REVIEWS_PER_PAGE;
}

function appendNaverReviewCards(reviews, startIdx) {
    const container = document.getElementById('reviewList');
    if (!container) return;
    
    const fragment = document.createDocumentFragment();
    
    reviews.forEach((review, i) => {
        const globalIdx = startIdx + i;
        const card = createNaverReviewCard(review, globalIdx);
        fragment.appendChild(card);
        displayedReviews.push(review);
    });
    
    container.appendChild(fragment);
    lazyLoadImages();
}

function createNaverReviewCard(review, idx) {
    const isBlog = review.type === 'blog';
    const isNegative = review.is_negative;
    const dateRaw = review.visit_date_raw || review.write_date_raw || '';
    
    const card = document.createElement('div');
    card.className = `review-card ${isBlog ? 'blog-review' : 'visitor-review'}${isNegative ? ' negative-review' : ''}`;
    card.dataset.index = idx;
    
    card.innerHTML = `
        <div class="review-header">
            <div class="review-author">
                <div class="author-avatar">${isBlog ? 'B' : 'V'}</div>
                <div class="author-info">
                    <span class="author-name">${escapeHtml(review.author || '익명')}</span>
                    ${isBlog && review.blog_name ? `<span class="blog-name">${escapeHtml(review.blog_name)}</span>` : ''}
                </div>
            </div>
            <div class="review-meta">
                ${isNegative ? '<span class="type-badge type-negative">부정</span>' : ''}
                <span class="type-badge ${isBlog ? 'type-blog' : 'type-visitor'}">${isBlog ? '블로그' : '방문자'}</span>
                <span class="store-badge">${escapeHtml(review.store_name || '')}</span>
            </div>
        </div>
        ${isBlog && review.title ? `<div class="review-title">${escapeHtml(review.title)}</div>` : ''}
        ${renderImages(review.images)}
        <div class="review-content">${escapeHtml(review.content || '')}</div>
        ${renderTags(review.tags)}
        <div class="review-footer">
            <span class="review-date">${escapeHtml(dateRaw)}</span>
        </div>
    `;
    
    card.addEventListener('click', function(e) {
        if (e.target.classList.contains('blog-link')) return;
        showNaverReviewModal(filteredReviews[idx]);
    });
    
    return card;
}

function updateNaverReviewCount() {
    const countEl = document.getElementById('reviewCount');
    if (countEl) {
        const displayed = displayedReviews.length;
        const total = filteredReviews.length;
        countEl.textContent = `(${displayed}/${total}개)`;
    }
}

function showNaverReviewModal(review) {
    const modal = document.getElementById('reviewModal');
    const body = document.getElementById('reviewModalBody');
    if (!modal || !body || !review) return;
    
    const isBlog = review.type === 'blog';
    const isNegative = review.is_negative;
    const dateRaw = review.visit_date_raw || review.write_date_raw || '';
    
    body.innerHTML = `
        <div class="review-detail">
            <div class="review-header">
                <div class="review-author">
                    <div class="author-avatar">${isBlog ? 'B' : 'V'}</div>
                    <div class="author-info">
                        <span class="author-name">${escapeHtml(review.author || '익명')}</span>
                        ${isBlog && review.blog_name ? `<span class="blog-name">${escapeHtml(review.blog_name)}</span>` : ''}
                    </div>
                </div>
                <div class="review-meta">
                    ${isNegative ? '<span class="type-badge type-negative">부정</span>' : ''}
                    <span class="type-badge ${isBlog ? 'type-blog' : 'type-visitor'}">${isBlog ? '블로그' : '방문자'}</span>
                    <span class="store-badge">${escapeHtml(review.store_name || '')}</span>
                    <span class="review-date">${escapeHtml(dateRaw)}</span>
                </div>
            </div>
            ${isBlog && review.title ? `<div class="review-title" style="-webkit-line-clamp: unset;">${escapeHtml(review.title)}</div>` : ''}
            ${review.images?.length ? `<div class="review-images">${review.images.map(img => 
                `<img src="${escapeHtml(img)}" class="review-image" alt="리뷰 이미지" onerror="this.style.display='none'">`).join('')}</div>` : ''}
            <div class="review-content" style="-webkit-line-clamp: unset;">${escapeHtml(review.content || '')}</div>
            ${review.tags?.length ? `<div class="review-tags">${review.tags.map(t => 
                `<span class="review-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            ${isBlog && review.blog_url ? `<a href="${escapeHtml(review.blog_url)}" target="_blank" class="blog-link-modal">블로그 원문 보기</a>` : ''}
        </div>
    `;
    
    modal.classList.add('active');
}

// ============================================
// 배달의민족 렌더링
// ============================================

function renderBaeminContent() {
    if (!baeminData) {
        showNoDataMessage('baeminContent', '배달의민족 리뷰 데이터가 없습니다.<br>크롤러를 실행하면 데이터가 수집됩니다.');
        return;
    }
    
    renderBaeminSummary();
    renderBaeminMenuCloud();
    renderBaeminReviewList();
}

function renderBaeminSummary() {
    const summary = baeminData.summary || {};
    
    document.getElementById('baeminTotalReviews').textContent = formatNumber(summary.total_reviews || 0);
    document.getElementById('baeminTotalStores').textContent = formatNumber(summary.total_stores || 0);
    document.getElementById('baeminAvgRating').textContent = (summary.average_rating || 0).toFixed(1);
    document.getElementById('baeminNegativeReviews').textContent = formatNumber(summary.total_negative || 0);
}

function renderBaeminMenuCloud() {
    const container = document.getElementById('baeminMenuCloud');
    if (!container) return;
    
    const summary = baeminData.summary || {};
    const popularMenus = summary.popular_menus || [];
    
    if (popularMenus.length === 0) {
        container.innerHTML = '<span style="color: #666;">메뉴 데이터가 없습니다.</span>';
        return;
    }
    
    container.innerHTML = popularMenus.slice(0, 10).map(menu => `
        <div class="tag-item" data-menu="${escapeHtml(menu.name)}">
            <span>${escapeHtml(menu.name)}</span>
            <span class="tag-count">${menu.count}</span>
        </div>
    `).join('');
    
    container.querySelectorAll('.tag-item').forEach(item => {
        item.addEventListener('click', function() {
            document.getElementById('searchInput').value = this.dataset.menu;
            searchQuery = this.dataset.menu;
            resetAndRender();
        });
    });
}

function renderBaeminReviewList() {
    const container = document.getElementById('baeminReviewList');
    if (!container) return;
    
    // 리뷰 필터링
    let reviews = [];
    const stores = baeminData.stores || [];
    
    stores.forEach(store => {
        if (currentStore && store.store_name !== currentStore) return;
        
        (store.reviews || []).forEach(review => {
            if (currentReviewType === 'negative' && !review.is_negative) return;
            reviews.push(review);
        });
    });
    
    // 검색 필터
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        reviews = reviews.filter(r => {
            const content = (r.content || '').toLowerCase();
            const nickname = (r.nickname || '').toLowerCase();
            const menus = (r.menus || []).join(' ').toLowerCase();
            return content.includes(query) || nickname.includes(query) || menus.includes(query);
        });
    }
    
    // 정렬
    reviews.sort((a, b) => {
        if (currentSort === 'rating_high') {
            return (b.rating || 0) - (a.rating || 0);
        } else if (currentSort === 'rating_low') {
            return (a.rating || 0) - (b.rating || 0);
        } else {
            const dateA = a.created_date || '';
            const dateB = b.created_date || '';
            return currentSort === 'oldest' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
        }
    });
    
    // 카운트 업데이트
    const countEl = document.getElementById('baeminReviewCount');
    if (countEl) {
        countEl.textContent = `(${reviews.length}개)`;
    }
    
    if (reviews.length === 0) {
        container.innerHTML = `
            <div class="empty-reviews">
                <div class="empty-icon">No Reviews</div>
                <p>리뷰가 없습니다.</p>
            </div>`;
        return;
    }
    
    container.innerHTML = reviews.map((review, idx) => createDeliveryReviewCard(review, 'baemin', idx)).join('');
    
    // 클릭 이벤트
    container.querySelectorAll('.review-card').forEach((card, idx) => {
        card.addEventListener('click', () => showDeliveryReviewModal(reviews[idx], 'baemin'));
    });
    
    lazyLoadImages();
}

// ============================================
// 쿠팡이츠 렌더링
// ============================================

function renderCoupangContent() {
    if (!coupangData) {
        showNoDataMessage('coupangeatsContent', '쿠팡이츠 리뷰 데이터가 없습니다.<br>크롤러를 실행하면 데이터가 수집됩니다.');
        return;
    }
    
    renderCoupangSummary();
    renderCoupangMenuCloud();
    renderCoupangReviewList();
}

function renderCoupangSummary() {
    const summary = coupangData.summary || {};
    
    document.getElementById('coupangTotalReviews').textContent = formatNumber(summary.total_reviews || 0);
    document.getElementById('coupangTotalStores').textContent = formatNumber(summary.total_stores || 0);
    document.getElementById('coupangAvgRating').textContent = (summary.average_rating || 0).toFixed(1);
    document.getElementById('coupangNegativeReviews').textContent = formatNumber(summary.total_negative || 0);
}

function renderCoupangMenuCloud() {
    const container = document.getElementById('coupangMenuCloud');
    if (!container) return;
    
    const summary = coupangData.summary || {};
    const popularMenus = summary.popular_menus || [];
    
    if (popularMenus.length === 0) {
        container.innerHTML = '<span style="color: #666;">메뉴 데이터가 없습니다.</span>';
        return;
    }
    
    container.innerHTML = popularMenus.slice(0, 10).map(menu => `
        <div class="tag-item" data-menu="${escapeHtml(menu.name)}">
            <span>${escapeHtml(menu.name)}</span>
            <span class="tag-count">${menu.count}</span>
        </div>
    `).join('');
    
    container.querySelectorAll('.tag-item').forEach(item => {
        item.addEventListener('click', function() {
            document.getElementById('searchInput').value = this.dataset.menu;
            searchQuery = this.dataset.menu;
            resetAndRender();
        });
    });
}

function renderCoupangReviewList() {
    const container = document.getElementById('coupangReviewList');
    if (!container) return;
    
    // 리뷰 필터링
    let reviews = [];
    const stores = coupangData.stores || [];
    
    stores.forEach(store => {
        if (currentStore && store.store_name !== currentStore) return;
        
        (store.reviews || []).forEach(review => {
            if (currentReviewType === 'negative' && !review.is_negative) return;
            reviews.push(review);
        });
    });
    
    // 검색 필터
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        reviews = reviews.filter(r => {
            const content = (r.content || '').toLowerCase();
            const nickname = (r.nickname || '').toLowerCase();
            const menus = (r.menus || []).join(' ').toLowerCase();
            return content.includes(query) || nickname.includes(query) || menus.includes(query);
        });
    }
    
    // 정렬
    reviews.sort((a, b) => {
        if (currentSort === 'rating_high') {
            return (b.rating || 0) - (a.rating || 0);
        } else if (currentSort === 'rating_low') {
            return (a.rating || 0) - (b.rating || 0);
        } else {
            const dateA = a.created_date || '';
            const dateB = b.created_date || '';
            return currentSort === 'oldest' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
        }
    });
    
    // 카운트 업데이트
    const countEl = document.getElementById('coupangReviewCount');
    if (countEl) {
        countEl.textContent = `(${reviews.length}개)`;
    }
    
    if (reviews.length === 0) {
        container.innerHTML = `
            <div class="empty-reviews">
                <div class="empty-icon">No Reviews</div>
                <p>리뷰가 없습니다.</p>
            </div>`;
        return;
    }
    
    container.innerHTML = reviews.map((review, idx) => createDeliveryReviewCard(review, 'coupang', idx)).join('');
    
    // 클릭 이벤트
    container.querySelectorAll('.review-card').forEach((card, idx) => {
        card.addEventListener('click', () => showDeliveryReviewModal(reviews[idx], 'coupang'));
    });
    
    lazyLoadImages();
}

// ============================================
// 배달 플랫폼 공통 카드/모달
// ============================================

function createDeliveryReviewCard(review, platform, idx) {
    const isNegative = review.is_negative;
    const rating = review.rating || 0;
    const dateStr = review.created_date || '';
    
    const platformLabel = platform === 'baemin' ? '배민' : '쿠팡';
    const platformClass = platform === 'baemin' ? 'baemin-review' : 'coupang-review';
    
    return `
        <div class="review-card ${platformClass}${isNegative ? ' negative-review' : ''}" data-index="${idx}">
            <div class="review-header">
                <div class="review-author">
                    <div class="author-avatar">${platformLabel.charAt(0)}</div>
                    <div class="author-info">
                        <span class="author-name">${escapeHtml(review.nickname || '익명')}</span>
                        <span class="rating-stars">${renderStars(rating)}</span>
                    </div>
                </div>
                <div class="review-meta">
                    ${isNegative ? '<span class="type-badge type-negative">부정</span>' : ''}
                    <span class="type-badge type-${platform}">${platformLabel}</span>
                    <span class="store-badge">${escapeHtml(review.store_name || '')}</span>
                </div>
            </div>
            ${renderImages(review.images)}
            <div class="review-content">${escapeHtml(review.content || '')}</div>
            ${review.menus?.length ? `<div class="review-menus">${review.menus.slice(0, 3).map(m => 
                `<span class="menu-badge">${escapeHtml(m)}</span>`).join('')}${review.menus.length > 3 ? `<span class="menu-badge">+${review.menus.length - 3}</span>` : ''}</div>` : ''}
            <div class="review-footer">
                <span class="review-date">${escapeHtml(dateStr)}</span>
            </div>
        </div>
    `;
}

function showDeliveryReviewModal(review, platform) {
    const modal = document.getElementById('reviewModal');
    const body = document.getElementById('reviewModalBody');
    if (!modal || !body || !review) return;
    
    const isNegative = review.is_negative;
    const rating = review.rating || 0;
    const dateStr = review.created_date || '';
    const platformLabel = platform === 'baemin' ? '배달의민족' : '쿠팡이츠';
    
    body.innerHTML = `
        <div class="review-detail">
            <div class="review-header">
                <div class="review-author">
                    <div class="author-avatar">${platformLabel.charAt(0)}</div>
                    <div class="author-info">
                        <span class="author-name">${escapeHtml(review.nickname || '익명')}</span>
                        <span class="rating-stars">${renderStars(rating)} (${rating.toFixed(1)})</span>
                    </div>
                </div>
                <div class="review-meta">
                    ${isNegative ? '<span class="type-badge type-negative">부정</span>' : ''}
                    <span class="type-badge type-${platform}">${platformLabel}</span>
                    <span class="store-badge">${escapeHtml(review.store_name || '')}</span>
                    <span class="review-date">${escapeHtml(dateStr)}</span>
                </div>
            </div>
            ${review.images?.length ? `<div class="review-images">${review.images.map(img => 
                `<img src="${escapeHtml(img)}" class="review-image" alt="리뷰 이미지" onerror="this.style.display='none'">`).join('')}</div>` : ''}
            <div class="review-content" style="-webkit-line-clamp: unset;">${escapeHtml(review.content || '')}</div>
            ${review.menus?.length ? `
                <div class="review-menus-detail">
                    <h4>주문 메뉴</h4>
                    <div class="menus-list">${review.menus.map(m => 
                        `<span class="menu-badge">${escapeHtml(m)}</span>`).join('')}</div>
                </div>` : ''}
        </div>
    `;
    
    modal.classList.add('active');
}

function renderStars(rating) {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
    
    let stars = '';
    for (let i = 0; i < fullStars; i++) stars += '<span class="star full">*</span>';
    if (halfStar) stars += '<span class="star half">*</span>';
    for (let i = 0; i < emptyStars; i++) stars += '<span class="star empty">*</span>';
    
    return stars;
}

// ============================================
// 공통 유틸리티
// ============================================

function renderImages(images) {
    if (!images || images.length === 0) return '';
    
    const maxImages = Math.min(4, images.length);
    let html = '<div class="review-images">';
    
    for (let i = 0; i < maxImages; i++) {
        const imgUrl = processImageUrl(images[i]);
        html += `<img data-src="${escapeHtml(imgUrl)}" class="review-image lazy-image" alt="리뷰 이미지" loading="lazy" onerror="this.style.display='none'">`;
    }
    
    if (images.length > 4) {
        html += `<div class="more-images">+${images.length - 4}</div>`;
    }
    
    html += '</div>';
    return html;
}

function processImageUrl(url) {
    if (!url) return '';
    
    if (url.includes('pstatic.net')) {
        if (url.includes('type=')) {
            return url.replace(/type=\w+/, 'type=w300');
        }
        if (url.includes('?')) {
            return url + '&type=w300';
        }
        return url + '?type=w300';
    }
    
    return url;
}

function renderTags(tags) {
    if (!tags || tags.length === 0) return '';
    const displayTags = tags.slice(0, 4);
    let html = `<div class="review-tags">${displayTags.map(t => 
        `<span class="review-tag">${escapeHtml(t)}</span>`).join('')}`;
    if (tags.length > 4) {
        html += `<span class="review-tag">+${tags.length - 4}</span>`;
    }
    html += '</div>';
    return html;
}

function lazyLoadImages() {
    const images = document.querySelectorAll('.lazy-image[data-src]');
    
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    loadImage(img);
                    imageObserver.unobserve(img);
                }
            });
        }, { rootMargin: '50px', threshold: 0.01 });
        
        images.forEach(img => imageObserver.observe(img));
    } else {
        images.forEach(img => loadImage(img));
    }
}

function loadImage(img) {
    const src = img.dataset.src;
    if (!src) return;
    
    const tempImg = new Image();
    tempImg.onload = function() {
        img.src = src;
        img.removeAttribute('data-src');
        img.classList.remove('lazy-image');
        img.classList.add('loaded');
    };
    tempImg.onerror = function() {
        img.style.display = 'none';
        img.removeAttribute('data-src');
    };
    tempImg.src = src;
}

function closeModal() {
    document.getElementById('reviewModal')?.classList.remove('active');
}

function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return new Intl.NumberFormat('ko-KR').format(num);
}

function formatDateTime(date) {
    return date.toLocaleString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
