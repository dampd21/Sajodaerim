/**
 * 리뷰 관리 대시보드 v4
 * - 지점 필터 시 메타태그 리뷰수 표시
 * - 이미지 로딩 개선
 * - 무한 스크롤
 */

let reviewData = null;
let filteredReviews = [];
let displayedReviews = [];
let currentPlatform = 'naver';
let currentStore = '';
let currentReviewType = 'all';
let currentSort = 'recent';
let searchQuery = '';

const REVIEWS_PER_PAGE = 20;
let currentPage = 1;
let isLoading = false;
let hasMoreReviews = true;

// ============================================
// 초기화
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    await loadData();
    initEventListeners();
    initInfiniteScroll();
    renderDashboard();
});

// ============================================
// 데이터 로드
// ============================================

async function loadData() {
    try {
        const response = await fetch('review_data.json?t=' + Date.now());
        if (!response.ok) throw new Error('데이터 파일 없음');
        
        reviewData = await response.json();
        console.log('Review data loaded:', reviewData.summary);
        
        if (reviewData.generated_at) {
            document.getElementById('updateTime').textContent = 
                '마지막 업데이트: ' + formatDateTime(new Date(reviewData.generated_at));
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
        content.innerHTML = `
            <div class="coming-soon-box">
                <div class="coming-soon-icon">📝</div>
                <h2>리뷰 데이터 없음</h2>
                <p>GitHub Actions에서 Naver Review Crawler를 실행해주세요.</p>
            </div>`;
    }
}

// ============================================
// 무한 스크롤
// ============================================

function initInfiniteScroll() {
    const reviewList = document.getElementById('reviewList');
    if (!reviewList) return;
    
    const sentinel = document.createElement('div');
    sentinel.id = 'scrollSentinel';
    sentinel.style.height = '1px';
    reviewList.parentNode.appendChild(sentinel);
    
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoading && hasMoreReviews) {
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
            appendReviewCards(newReviews, startIdx);
        }
        
        hasMoreReviews = endIdx < filteredReviews.length;
        isLoading = false;
        showLoadingIndicator(false);
        
        updateReviewCount();
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
            document.getElementById('reviewList').parentNode.appendChild(indicator);
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
    document.querySelectorAll('.platform-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            if (this.classList.contains('disabled')) return;
            switchPlatform(this.dataset.platform);
        });
    });
    
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
    filterAndRender();
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
        // 메타태그에서 수집한 실제 리뷰수 사용
        const metaVisitor = store.meta_visitor_count || 0;
        const metaBlog = store.meta_blog_count || 0;
        const total = metaVisitor + metaBlog;
        select.innerHTML += `<option value="${store.store_name}">${store.store_name} (${formatNumber(total)})</option>`;
    });
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

// ============================================
// 요약 카드 렌더링 (메타태그 리뷰수 사용)
// ============================================

function renderSummaryCards() {
    if (!reviewData) return;
    
    const stores = reviewData.stores || [];
    
    if (currentStore) {
        // 특정 지점 선택 시
        const selectedStore = stores.find(s => s.store_name === currentStore);
        
        if (selectedStore) {
            // 메타태그에서 수집한 실제 리뷰수
            const metaVisitor = selectedStore.meta_visitor_count || 0;
            const metaBlog = selectedStore.meta_blog_count || 0;
            const totalReviews = metaVisitor + metaBlog;
            
            // 부정적 리뷰는 수집된 데이터에서 계산
            const negativeCount = countNegativeReviews(selectedStore);
            
            document.getElementById('totalReviews').textContent = formatNumber(totalReviews);
            document.getElementById('totalStores').textContent = selectedStore.store_name;
            document.getElementById('visitorReviews').textContent = formatNumber(metaVisitor);
            document.getElementById('blogReviews').textContent = formatNumber(metaBlog);
            document.getElementById('negativeReviews').textContent = formatNumber(negativeCount);
        }
    } else {
        // 전체 지점 - 메타태그 총계 사용
        const summary = reviewData.summary || {};
        
        // 메타태그에서 수집한 실제 총 리뷰수
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
    (store.visitor_reviews || []).forEach(review => {
        if (review.is_negative) count++;
    });
    (store.blog_reviews || []).forEach(review => {
        if (review.is_negative) count++;
    });
    return count;
}

function renderStatsCards() {
    const stats = reviewData.stats || {};
    
    document.getElementById('todayReviews').textContent = formatNumber(stats.today || 0);
    document.getElementById('weeklyReviews').textContent = formatNumber(stats.this_week || 0);
    document.getElementById('monthlyReviews').textContent = formatNumber(stats.this_month || 0);
    
    renderChangeIndicator('dailyChange', stats.daily_change || 0);
    renderChangeIndicator('weeklyChange', stats.weekly_change || 0);
    renderChangeIndicator('monthlyChange', stats.monthly_change || 0);
}

function renderChangeIndicator(elementId, changeValue) {
    const container = document.getElementById(elementId);
    if (!container) return;
    
    const changeEl = container.querySelector('.change-value');
    if (!changeEl) return;
    
    let changeClass = 'neutral';
    let changeText = '0%';
    
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
    
    renderSummaryCards();
    
    let allReviews = [];
    const stores = reviewData.stores || [];
    
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
    
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        allReviews = allReviews.filter(r => {
            const content = (r.content || '').toLowerCase();
            const author = (r.author || '').toLowerCase();
            const title = (r.title || '').toLowerCase();
            const tags = (r.tags || []).join(' ').toLowerCase();
            const keywords = (r.keywords || []).join(' ').toLowerCase();
            
            return content.includes(query) || author.includes(query) || 
                   title.includes(query) || tags.includes(query) || keywords.includes(query);
        });
    }
    
    allReviews.sort((a, b) => {
        const dateA = a.visit_date || a.write_date || '';
        const dateB = b.visit_date || b.write_date || '';
        return currentSort === 'oldest' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    });
    
    filteredReviews = allReviews;
    displayedReviews = [];
    
    renderTagCloud();
    renderInitialReviews();
}

// ============================================
// 태그 클라우드
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

// ============================================
// 리뷰 목록 렌더링
// ============================================

function renderInitialReviews() {
    const container = document.getElementById('reviewList');
    if (!container) return;
    
    container.innerHTML = '';
    currentPage = 1;
    hasMoreReviews = true;
    
    updateReviewCount();
    
    if (filteredReviews.length === 0) {
        container.innerHTML = `
            <div class="empty-reviews">
                <div class="empty-icon">📝</div>
                <p>리뷰가 없습니다.</p>
            </div>`;
        hasMoreReviews = false;
        return;
    }
    
    const initialReviews = filteredReviews.slice(0, REVIEWS_PER_PAGE);
    appendReviewCards(initialReviews, 0);
    
    hasMoreReviews = filteredReviews.length > REVIEWS_PER_PAGE;
}

function appendReviewCards(reviews, startIdx) {
    const container = document.getElementById('reviewList');
    if (!container) return;
    
    const fragment = document.createDocumentFragment();
    
    reviews.forEach((review, i) => {
        const globalIdx = startIdx + i;
        const card = createReviewCard(review, globalIdx);
        fragment.appendChild(card);
        displayedReviews.push(review);
    });
    
    container.appendChild(fragment);
    lazyLoadImages();
}

function createReviewCard(review, idx) {
    const isBlog = review.type === 'blog';
    const isNegative = review.is_negative;
    const dateRaw = review.visit_date_raw || review.write_date_raw || '';
    
    const card = document.createElement('div');
    card.className = `review-card ${isBlog ? 'blog-review' : 'visitor-review'}${isNegative ? ' negative-review' : ''}`;
    card.dataset.index = idx;
    
    const sentimentBadge = review.sentiment_score !== undefined ? 
        `<span class="sentiment-badge ${review.sentiment_score >= 2 ? 'neg' : 'pos'}" title="점수: ${review.sentiment_score}">${review.sentiment_score}</span>` : '';
    
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
                ${sentimentBadge}
                <span class="type-badge ${isBlog ? 'type-blog' : 'type-visitor'}">${isBlog ? '블로그' : '방문자'}</span>
                <span class="store-badge">${escapeHtml(review.store_name || '')}</span>
            </div>
        </div>
        ${isBlog && review.title ? `<div class="review-title">${escapeHtml(review.title)}</div>` : ''}
        ${renderImages(review.images)}
        <div class="review-content">${escapeHtml(review.content || '')}</div>
        ${renderKeywords(review.keywords)}
        ${renderTags(review.tags)}
        <div class="review-footer">
            <span class="review-date">${escapeHtml(dateRaw)}</span>
            ${review.visit_info?.length ? `<span class="visit-info">${escapeHtml(review.visit_info.slice(0, 3).join(' · '))}</span>` : ''}
        </div>
        ${isBlog && review.blog_url ? `<a href="${escapeHtml(review.blog_url)}" target="_blank" class="blog-link" onclick="event.stopPropagation();">블로그 원문 보기 →</a>` : ''}
    `;
    
    card.addEventListener('click', function(e) {
        if (e.target.classList.contains('blog-link')) return;
        showReviewModal(filteredReviews[idx]);
    });
    
    return card;
}

// ============================================
// 이미지 렌더링
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

function renderKeywords(keywords) {
    if (!keywords || keywords.length === 0) return '';
    return `<div class="review-keywords">${keywords.slice(0, 5).map(k => 
        `<span class="keyword-badge">${escapeHtml(k)}</span>`).join('')}</div>`;
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

function updateReviewCount() {
    const countEl = document.getElementById('reviewCount');
    if (countEl) {
        const displayed = displayedReviews.length;
        const total = filteredReviews.length;
        countEl.textContent = `(수집된 ${displayed}/${total}개)`;
    }
}

// ============================================
// 리뷰 상세 모달
// ============================================

function showReviewModal(review) {
    const modal = document.getElementById('reviewModal');
    const body = document.getElementById('reviewModalBody');
    if (!modal || !body || !review) return;
    
    const isBlog = review.type === 'blog';
    const isNegative = review.is_negative;
    const dateRaw = review.visit_date_raw || review.write_date_raw || '';
    
    const modalImages = (review.images || []).map(url => {
        if (url.includes('pstatic.net')) {
            return url.replace(/type=\w+/, 'type=w750');
        }
        return url;
    });
    
    body.innerHTML = `
        <div class="review-detail">
            <div class="review-header">
                <div class="review-author">
                    <div class="author-avatar">${isBlog ? 'B' : 'V'}</div>
                    <div class="author-info">
                        <span class="author-name">${escapeHtml(review.author || '익명')}</span>
                        ${isBlog && review.blog_name ? `<span class="blog-name">${escapeHtml(review.blog_name)}</span>` : ''}
                        ${review.visit_info?.length ? `<span class="author-meta">${review.visit_info.join(' / ')}</span>` : ''}
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
            ${modalImages.length ? `<div class="review-images">${modalImages.map(img => 
                `<img src="${escapeHtml(img)}" class="review-image" alt="리뷰 이미지" onerror="this.style.display='none'">`).join('')}</div>` : ''}
            <div class="review-content" style="-webkit-line-clamp: unset;">${escapeHtml(review.content || '')}</div>
            ${review.keywords?.length ? `<div class="review-keywords">${review.keywords.map(k => 
                `<span class="keyword-badge">${escapeHtml(k)}</span>`).join('')}</div>` : ''}
            ${review.tags?.length ? `<div class="review-tags">${review.tags.map(t => 
                `<span class="review-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            ${review.sentiment_score !== undefined ? `
                <div class="sentiment-info">
                    <span>감성 점수: ${review.sentiment_score}</span>
                    <span>분석 방법: ${review.sentiment_method || 'keyword'}</span>
                </div>` : ''}
            ${isBlog && review.blog_url ? `<a href="${escapeHtml(review.blog_url)}" target="_blank" class="blog-link-modal">블로그 원문 보기 →</a>` : ''}
        </div>
    `;
    
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
