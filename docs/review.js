/**
 * 리뷰 관리 대시보드 v6
 * - 네이버, 배달의민족, 쿠팡이츠 3개 플랫폼 지원
 * - 전 플랫폼 무한 스크롤 적용 (성능 개선)
 * - 플랫폼별 독립 스크롤 상태 관리
 */

// 플랫폼별 데이터
var naverData = null;
var baeminData = null;
var coupangData = null;

// 필터 상태
var currentPlatform = 'naver';
var currentStore = '';
var currentReviewType = 'all';
var currentSort = 'recent';
var searchQuery = '';

// 플랫폼별 무한 스크롤 상태
var REVIEWS_PER_PAGE = 20;

var scrollState = {
    naver: { filtered: [], displayed: [], page: 1, loading: false, hasMore: true },
    baemin: { filtered: [], displayed: [], page: 1, loading: false, hasMore: true },
    coupangeats: { filtered: [], displayed: [], page: 1, loading: false, hasMore: true }
};

// IntersectionObserver 인스턴스
var scrollObservers = {};

// ============================================
// 초기화
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    await loadAllData();
    initEventListeners();
    initAllScrollSentinels();
    renderCurrentPlatform();
});

// ============================================
// 데이터 로드
// ============================================

async function loadAllData() {
    try {
        var naverResponse = await fetch('review_data.json?t=' + Date.now());
        if (naverResponse.ok) {
            naverData = await naverResponse.json();
        }
    } catch (e) {}

    try {
        var baeminResponse = await fetch('review_baemin_data.json?t=' + Date.now());
        if (baeminResponse.ok) {
            baeminData = await baeminResponse.json();
        }
    } catch (e) {}

    try {
        var coupangResponse = await fetch('review_coupangeats_data.json?t=' + Date.now());
        if (coupangResponse.ok) {
            coupangData = await coupangResponse.json();
        }
    } catch (e) {}

    updateTimestamp();
}

function updateTimestamp() {
    var latestTime = null;

    if (naverData && naverData.generated_at) {
        latestTime = new Date(naverData.generated_at);
    }
    if (baeminData && baeminData.generated_at) {
        var t = new Date(baeminData.generated_at);
        if (!latestTime || t > latestTime) latestTime = t;
    }
    if (coupangData && coupangData.generated_at) {
        var t2 = new Date(coupangData.generated_at);
        if (!latestTime || t2 > latestTime) latestTime = t2;
    }

    if (latestTime) {
        document.getElementById('updateTime').textContent =
            '마지막 업데이트: ' + formatDateTime(latestTime);
    }
}

// ============================================
// 무한 스크롤 (전 플랫폼 공통)
// ============================================

function initAllScrollSentinels() {
    var sentinels = document.querySelectorAll('.scroll-sentinel');
    sentinels.forEach(function(sentinel) {
        var platform = sentinel.getAttribute('data-platform');
        if (!platform) return;

        var observer = new IntersectionObserver(function(entries) {
            if (entries[0].isIntersecting) {
                loadMoreForPlatform(platform);
            }
        }, { rootMargin: '300px' });

        observer.observe(sentinel);
        scrollObservers[platform] = observer;
    });
}

function loadMoreForPlatform(platform) {
    var state = scrollState[platform];
    if (!state || state.loading || !state.hasMore) return;
    if (platform !== currentPlatform) return;

    state.loading = true;
    showPlatformLoading(platform, true);

    setTimeout(function() {
        state.page++;
        var startIdx = (state.page - 1) * REVIEWS_PER_PAGE;
        var endIdx = startIdx + REVIEWS_PER_PAGE;
        var newReviews = state.filtered.slice(startIdx, endIdx);

        if (newReviews.length > 0) {
            appendReviewCards(platform, newReviews, startIdx);
        }

        state.hasMore = endIdx < state.filtered.length;
        state.loading = false;
        showPlatformLoading(platform, false);
        updateReviewCount(platform);
    }, 50);
}

function showPlatformLoading(platform, show) {
    var containerId = getListContainerId(platform);
    var container = document.getElementById(containerId);
    if (!container) return;

    var indicatorId = 'loadingIndicator_' + platform;
    var indicator = document.getElementById(indicatorId);

    if (show) {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = indicatorId;
            indicator.className = 'loading-indicator';
            indicator.innerHTML = '<div class="loading-spinner-small"></div><span>리뷰 불러오는 중...</span>';
            container.parentNode.insertBefore(indicator, container.nextSibling);
        }
        indicator.style.display = 'flex';
    } else if (indicator) {
        indicator.style.display = 'none';
    }
}

function getListContainerId(platform) {
    if (platform === 'naver') return 'reviewList';
    if (platform === 'baemin') return 'baeminReviewList';
    if (platform === 'coupangeats') return 'coupangReviewList';
    return '';
}

function getCountElementId(platform) {
    if (platform === 'naver') return 'reviewCount';
    if (platform === 'baemin') return 'baeminReviewCount';
    if (platform === 'coupangeats') return 'coupangReviewCount';
    return '';
}

function updateReviewCount(platform) {
    var state = scrollState[platform];
    var elId = getCountElementId(platform);
    var el = document.getElementById(elId);
    if (el && state) {
        el.textContent = '(' + state.displayed.length + '/' + state.filtered.length + '개)';
    }
}

function resetScrollState(platform) {
    scrollState[platform] = {
        filtered: [],
        displayed: [],
        page: 1,
        loading: false,
        hasMore: true
    };
}

function appendReviewCards(platform, reviews, startIdx) {
    var containerId = getListContainerId(platform);
    var container = document.getElementById(containerId);
    if (!container) return;

    var state = scrollState[platform];
    var fragment = document.createDocumentFragment();

    for (var i = 0; i < reviews.length; i++) {
        var review = reviews[i];
        var globalIdx = startIdx + i;
        var card;

        if (platform === 'naver') {
            card = createNaverReviewCardElement(review, globalIdx);
        } else {
            card = createDeliveryReviewCardElement(review, platform, globalIdx);
        }

        fragment.appendChild(card);
        state.displayed.push(review);
    }

    container.appendChild(fragment);
    lazyLoadImages();
}

function renderInitialPage(platform) {
    var containerId = getListContainerId(platform);
    var container = document.getElementById(containerId);
    if (!container) return;

    var state = scrollState[platform];
    container.innerHTML = '';
    state.displayed = [];
    state.page = 1;
    state.hasMore = true;

    if (state.filtered.length === 0) {
        container.innerHTML =
            '<div class="empty-reviews">' +
            '<div class="empty-icon">No Reviews</div>' +
            '<p>리뷰가 없습니다.</p>' +
            '</div>';
        state.hasMore = false;
        updateReviewCount(platform);
        return;
    }

    var initial = state.filtered.slice(0, REVIEWS_PER_PAGE);
    appendReviewCards(platform, initial, 0);
    state.hasMore = state.filtered.length > REVIEWS_PER_PAGE;
    updateReviewCount(platform);
}

// ============================================
// 이벤트 리스너
// ============================================

function initEventListeners() {
    document.querySelectorAll('.platform-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            if (this.classList.contains('disabled')) return;
            switchPlatform(this.dataset.platform);
        });
    });

    var storeSelect = document.getElementById('storeSelect');
    if (storeSelect) {
        storeSelect.addEventListener('change', function() {
            currentStore = this.value;
            resetAndRender();
        });
    }

    var typeSelect = document.getElementById('reviewTypeSelect');
    if (typeSelect) {
        typeSelect.addEventListener('change', function() {
            currentReviewType = this.value;
            resetAndRender();
        });
    }

    var sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', function() {
            currentSort = this.value;
            resetAndRender();
        });
    }

    var searchInput = document.getElementById('searchInput');
    var searchTimeout;
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            var self = this;
            searchTimeout = setTimeout(function() {
                searchQuery = self.value;
                resetAndRender();
            }, 300);
        });
    }

    var modalClose = document.querySelector('#reviewModal .modal-close');
    if (modalClose) {
        modalClose.addEventListener('click', closeModal);
    }

    var modal = document.getElementById('reviewModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target.id === 'reviewModal') closeModal();
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeModal();
    });
}

function resetAndRender() {
    resetScrollState(currentPlatform);
    renderCurrentPlatform();
}

// ============================================
// 플랫폼 전환
// ============================================

function switchPlatform(platform) {
    currentPlatform = platform;

    document.querySelectorAll('.platform-tab').forEach(function(tab) {
        tab.classList.toggle('active', tab.dataset.platform === platform);
    });

    document.querySelectorAll('.platform-pane').forEach(function(pane) {
        pane.classList.remove('active');
    });

    var contentId = platform + 'Content';
    var contentEl = document.getElementById(contentId);
    if (contentEl) contentEl.classList.add('active');

    updateReviewTypeFilter();
    updateStoreSelect();
    resetAndRender();
}

function updateReviewTypeFilter() {
    var select = document.getElementById('reviewTypeSelect');
    if (!select) return;

    if (currentPlatform === 'naver') {
        select.innerHTML =
            '<option value="all">전체</option>' +
            '<option value="visitor">방문자 리뷰</option>' +
            '<option value="blog">블로그 리뷰</option>' +
            '<option value="negative">부정적 리뷰</option>';
    } else {
        select.innerHTML =
            '<option value="all">전체</option>' +
            '<option value="negative">부정적 리뷰</option>';
    }
    currentReviewType = 'all';
}

function updateStoreSelect() {
    var select = document.getElementById('storeSelect');
    if (!select) return;

    var stores = [];

    if (currentPlatform === 'naver' && naverData) {
        stores = (naverData.stores || []).map(function(s) { return s.store_name; });
    } else if (currentPlatform === 'baemin' && baeminData) {
        stores = (baeminData.stores || []).map(function(s) { return s.store_name; });
    } else if (currentPlatform === 'coupangeats' && coupangData) {
        stores = (coupangData.stores || []).map(function(s) { return s.store_name; });
    }

    select.innerHTML = '<option value="">전체 지점</option>';
    stores.forEach(function(store) {
        select.innerHTML += '<option value="' + escapeHtml(store) + '">' + escapeHtml(store) + '</option>';
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
    var container = document.getElementById(containerId);
    if (container) {
        var reviewListSection = container.querySelector('.review-list-section');
        if (reviewListSection) {
            reviewListSection.innerHTML =
                '<div class="coming-soon-box" style="min-height: 300px;">' +
                '<div class="coming-soon-icon">No Data</div>' +
                '<h2>데이터 없음</h2>' +
                '<p>' + message + '</p>' +
                '</div>';
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
    renderInitialPage('naver');
}

function renderNaverSummary() {
    var stores = naverData.stores || [];

    if (currentStore) {
        var selectedStore = null;
        for (var i = 0; i < stores.length; i++) {
            if (stores[i].store_name === currentStore) {
                selectedStore = stores[i];
                break;
            }
        }
        if (selectedStore) {
            var metaVisitor = selectedStore.meta_visitor_count || 0;
            var metaBlog = selectedStore.meta_blog_count || 0;
            var totalReviews = metaVisitor + metaBlog;
            var negativeCount = countNegativeReviews(selectedStore);

            document.getElementById('totalReviews').textContent = formatNumber(totalReviews);
            document.getElementById('totalStores').textContent = selectedStore.store_name;
            document.getElementById('visitorReviews').textContent = formatNumber(metaVisitor);
            document.getElementById('blogReviews').textContent = formatNumber(metaBlog);
            document.getElementById('negativeReviews').textContent = formatNumber(negativeCount);
        }
    } else {
        var summary = naverData.summary || {};
        var metaTotalVisitor = summary.meta_total_visitor || 0;
        var metaTotalBlog = summary.meta_total_blog || 0;
        var metaTotal = metaTotalVisitor + metaTotalBlog;

        document.getElementById('totalReviews').textContent = formatNumber(metaTotal || summary.total_reviews || 0);
        document.getElementById('totalStores').textContent = formatNumber(summary.total_stores || 0);
        document.getElementById('visitorReviews').textContent = formatNumber(metaTotalVisitor || summary.total_visitor_reviews || 0);
        document.getElementById('blogReviews').textContent = formatNumber(metaTotalBlog || summary.total_blog_reviews || 0);
        document.getElementById('negativeReviews').textContent = formatNumber(summary.total_negative || 0);
    }
}

function countNegativeReviews(store) {
    var count = 0;
    (store.visitor_reviews || []).forEach(function(r) { if (r.is_negative) count++; });
    (store.blog_reviews || []).forEach(function(r) { if (r.is_negative) count++; });
    return count;
}

function filterNaverReviews() {
    var allReviews = [];
    var stores = naverData.stores || [];

    stores.forEach(function(store) {
        if (currentStore && store.store_name !== currentStore) return;

        if (currentReviewType !== 'blog') {
            (store.visitor_reviews || []).forEach(function(review) {
                var r = {};
                for (var k in review) r[k] = review[k];
                r.store_name = store.store_name;
                if (currentReviewType === 'negative' && !r.is_negative) return;
                if (currentReviewType !== 'negative' || r.is_negative) {
                    allReviews.push(r);
                }
            });
        }

        if (currentReviewType !== 'visitor') {
            (store.blog_reviews || []).forEach(function(review) {
                var r = {};
                for (var k in review) r[k] = review[k];
                r.store_name = store.store_name;
                if (currentReviewType === 'negative' && !r.is_negative) return;
                if (currentReviewType !== 'negative' || r.is_negative) {
                    allReviews.push(r);
                }
            });
        }
    });

    if (searchQuery) {
        var query = searchQuery.toLowerCase();
        allReviews = allReviews.filter(function(r) {
            var content = (r.content || '').toLowerCase();
            var author = (r.author || '').toLowerCase();
            var title = (r.title || '').toLowerCase();
            var tags = (r.tags || []).join(' ').toLowerCase();
            return content.indexOf(query) >= 0 || author.indexOf(query) >= 0 ||
                   title.indexOf(query) >= 0 || tags.indexOf(query) >= 0;
        });
    }

    allReviews.sort(function(a, b) {
        var dateA = a.visit_date || a.write_date || '';
        var dateB = b.visit_date || b.write_date || '';
        return currentSort === 'oldest' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    });

    scrollState.naver.filtered = allReviews;
}

function renderNaverTagCloud() {
    var container = document.getElementById('tagCloud');
    if (!container) return;

    var state = scrollState.naver;
    var tagCounts = {};
    state.filtered.forEach(function(review) {
        (review.tags || []).forEach(function(tag) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
    });

    var entries = [];
    for (var tag in tagCounts) {
        entries.push([tag, tagCounts[tag]]);
    }
    entries.sort(function(a, b) { return b[1] - a[1]; });
    var topTags = entries.slice(0, 10);

    if (topTags.length === 0) {
        container.innerHTML = '<span style="color: #666;">태그 데이터가 없습니다.</span>';
        return;
    }

    container.innerHTML = topTags.map(function(pair) {
        return '<div class="tag-item" data-tag="' + escapeHtml(pair[0]) + '">' +
            '<span>' + escapeHtml(pair[0]) + '</span>' +
            '<span class="tag-count">' + pair[1] + '</span>' +
            '</div>';
    }).join('');

    container.querySelectorAll('.tag-item').forEach(function(item) {
        item.addEventListener('click', function() {
            document.getElementById('searchInput').value = this.dataset.tag;
            searchQuery = this.dataset.tag;
            resetAndRender();
        });
    });
}

function createNaverReviewCardElement(review, idx) {
    var isBlog = review.type === 'blog';
    var isNegative = review.is_negative;
    var dateRaw = review.visit_date_raw || review.write_date_raw || '';

    var card = document.createElement('div');
    card.className = 'review-card ' + (isBlog ? 'blog-review' : 'visitor-review') + (isNegative ? ' negative-review' : '');
    card.dataset.index = idx;

    card.innerHTML =
        '<div class="review-header">' +
            '<div class="review-author">' +
                '<div class="author-avatar">' + (isBlog ? 'B' : 'V') + '</div>' +
                '<div class="author-info">' +
                    '<span class="author-name">' + escapeHtml(review.author || '익명') + '</span>' +
                    (isBlog && review.blog_name ? '<span class="blog-name">' + escapeHtml(review.blog_name) + '</span>' : '') +
                '</div>' +
            '</div>' +
            '<div class="review-meta">' +
                (isNegative ? '<span class="type-badge type-negative">부정</span>' : '') +
                '<span class="type-badge ' + (isBlog ? 'type-blog' : 'type-visitor') + '">' + (isBlog ? '블로그' : '방문자') + '</span>' +
                '<span class="store-badge">' + escapeHtml(review.store_name || '') + '</span>' +
            '</div>' +
        '</div>' +
        (isBlog && review.title ? '<div class="review-title">' + escapeHtml(review.title) + '</div>' : '') +
        renderImages(review.images) +
        '<div class="review-content">' + escapeHtml(review.content || '') + '</div>' +
        renderTags(review.tags) +
        '<div class="review-footer">' +
            '<span class="review-date">' + escapeHtml(dateRaw) + '</span>' +
        '</div>';

    card.addEventListener('click', function(e) {
        if (e.target.classList.contains('blog-link')) return;
        showNaverReviewModal(scrollState.naver.filtered[idx]);
    });

    return card;
}

function showNaverReviewModal(review) {
    var modal = document.getElementById('reviewModal');
    var body = document.getElementById('reviewModalBody');
    if (!modal || !body || !review) return;

    var isBlog = review.type === 'blog';
    var isNegative = review.is_negative;
    var dateRaw = review.visit_date_raw || review.write_date_raw || '';

    var imagesHtml = '';
    if (review.images && review.images.length > 0) {
        imagesHtml = '<div class="review-images">' +
            review.images.map(function(img) {
                return '<img src="' + escapeHtml(img) + '" class="review-image" alt="리뷰 이미지" onerror="this.style.display=\'none\'">';
            }).join('') + '</div>';
    }

    var tagsHtml = '';
    if (review.tags && review.tags.length > 0) {
        tagsHtml = '<div class="review-tags">' +
            review.tags.map(function(t) {
                return '<span class="review-tag">' + escapeHtml(t) + '</span>';
            }).join('') + '</div>';
    }

    body.innerHTML =
        '<div class="review-detail">' +
            '<div class="review-header">' +
                '<div class="review-author">' +
                    '<div class="author-avatar">' + (isBlog ? 'B' : 'V') + '</div>' +
                    '<div class="author-info">' +
                        '<span class="author-name">' + escapeHtml(review.author || '익명') + '</span>' +
                        (isBlog && review.blog_name ? '<span class="blog-name">' + escapeHtml(review.blog_name) + '</span>' : '') +
                    '</div>' +
                '</div>' +
                '<div class="review-meta">' +
                    (isNegative ? '<span class="type-badge type-negative">부정</span>' : '') +
                    '<span class="type-badge ' + (isBlog ? 'type-blog' : 'type-visitor') + '">' + (isBlog ? '블로그' : '방문자') + '</span>' +
                    '<span class="store-badge">' + escapeHtml(review.store_name || '') + '</span>' +
                    '<span class="review-date">' + escapeHtml(dateRaw) + '</span>' +
                '</div>' +
            '</div>' +
            (isBlog && review.title ? '<div class="review-title" style="-webkit-line-clamp: unset;">' + escapeHtml(review.title) + '</div>' : '') +
            imagesHtml +
            '<div class="review-content" style="-webkit-line-clamp: unset;">' + escapeHtml(review.content || '') + '</div>' +
            tagsHtml +
            (isBlog && review.blog_url ? '<a href="' + escapeHtml(review.blog_url) + '" target="_blank" class="blog-link-modal">블로그 원문 보기</a>' : '') +
        '</div>';

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
    filterDeliveryReviews('baemin');
    renderInitialPage('baemin');
}

function renderBaeminSummary() {
    var summary = baeminData.summary || {};

    document.getElementById('baeminTotalReviews').textContent = formatNumber(summary.total_reviews || 0);
    document.getElementById('baeminTotalStores').textContent = formatNumber(summary.total_stores || 0);
    document.getElementById('baeminAvgRating').textContent = (summary.average_rating || 0).toFixed(1);
    document.getElementById('baeminNegativeReviews').textContent = formatNumber(summary.total_negative || 0);
}

function renderBaeminMenuCloud() {
    var container = document.getElementById('baeminMenuCloud');
    if (!container) return;

    var summary = baeminData.summary || {};
    var popularMenus = summary.popular_menus || [];

    if (popularMenus.length === 0) {
        container.innerHTML = '<span style="color: #666;">메뉴 데이터가 없습니다.</span>';
        return;
    }

    container.innerHTML = popularMenus.slice(0, 10).map(function(menu) {
        return '<div class="tag-item" data-menu="' + escapeHtml(menu.name) + '">' +
            '<span>' + escapeHtml(menu.name) + '</span>' +
            '<span class="tag-count">' + menu.count + '</span>' +
            '</div>';
    }).join('');

    container.querySelectorAll('.tag-item').forEach(function(item) {
        item.addEventListener('click', function() {
            document.getElementById('searchInput').value = this.dataset.menu;
            searchQuery = this.dataset.menu;
            resetAndRender();
        });
    });
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
    filterDeliveryReviews('coupangeats');
    renderInitialPage('coupangeats');
}

function renderCoupangSummary() {
    var summary = coupangData.summary || {};

    document.getElementById('coupangTotalReviews').textContent = formatNumber(summary.total_reviews || 0);
    document.getElementById('coupangTotalStores').textContent = formatNumber(summary.total_stores || 0);
    document.getElementById('coupangAvgRating').textContent = (summary.average_rating || 0).toFixed(1);
    document.getElementById('coupangNegativeReviews').textContent = formatNumber(summary.total_negative || 0);
}

function renderCoupangMenuCloud() {
    var container = document.getElementById('coupangMenuCloud');
    if (!container) return;

    var summary = coupangData.summary || {};
    var popularMenus = summary.popular_menus || [];

    if (popularMenus.length === 0) {
        container.innerHTML = '<span style="color: #666;">메뉴 데이터가 없습니다.</span>';
        return;
    }

    container.innerHTML = popularMenus.slice(0, 10).map(function(menu) {
        return '<div class="tag-item" data-menu="' + escapeHtml(menu.name) + '">' +
            '<span>' + escapeHtml(menu.name) + '</span>' +
            '<span class="tag-count">' + menu.count + '</span>' +
            '</div>';
    }).join('');

    container.querySelectorAll('.tag-item').forEach(function(item) {
        item.addEventListener('click', function() {
            document.getElementById('searchInput').value = this.dataset.menu;
            searchQuery = this.dataset.menu;
            resetAndRender();
        });
    });
}

// ============================================
// 배달 플랫폼 공통 필터/카드/모달
// ============================================

function filterDeliveryReviews(platform) {
    var data = (platform === 'baemin') ? baeminData : coupangData;
    if (!data) return;

    var reviews = [];
    var stores = data.stores || [];

    stores.forEach(function(store) {
        if (currentStore && store.store_name !== currentStore) return;

        (store.reviews || []).forEach(function(review) {
            if (currentReviewType === 'negative' && !review.is_negative) return;
            var r = {};
            for (var k in review) r[k] = review[k];
            if (!r.store_name) r.store_name = store.store_name;
            reviews.push(r);
        });
    });

    if (searchQuery) {
        var query = searchQuery.toLowerCase();
        reviews = reviews.filter(function(r) {
            var content = (r.content || '').toLowerCase();
            var nickname = (r.nickname || '').toLowerCase();
            var menus = (r.menus || []).join(' ').toLowerCase();
            return content.indexOf(query) >= 0 || nickname.indexOf(query) >= 0 || menus.indexOf(query) >= 0;
        });
    }

    reviews.sort(function(a, b) {
        if (currentSort === 'rating_high') {
            return (b.rating || 0) - (a.rating || 0);
        } else if (currentSort === 'rating_low') {
            return (a.rating || 0) - (b.rating || 0);
        } else {
            var dateA = a.created_date || '';
            var dateB = b.created_date || '';
            return currentSort === 'oldest' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
        }
    });

    scrollState[platform].filtered = reviews;
}

function createDeliveryReviewCardElement(review, platform, idx) {
    var isNegative = review.is_negative;
    var rating = review.rating || 0;
    var dateStr = review.created_date || '';

    var platformLabel = (platform === 'baemin') ? '배민' : '쿠팡';
    var platformClass = (platform === 'baemin') ? 'baemin-review' : 'coupang-review';
    var typeClass = (platform === 'baemin') ? 'type-baemin' : 'type-coupang';

    var card = document.createElement('div');
    card.className = 'review-card ' + platformClass + (isNegative ? ' negative-review' : '');
    card.dataset.index = idx;

    var menusHtml = '';
    if (review.menus && review.menus.length > 0) {
        var displayMenus = review.menus.slice(0, 3);
        menusHtml = '<div class="review-menus">' +
            displayMenus.map(function(m) {
                return '<span class="menu-badge">' + escapeHtml(m) + '</span>';
            }).join('');
        if (review.menus.length > 3) {
            menusHtml += '<span class="menu-badge">+' + (review.menus.length - 3) + '</span>';
        }
        menusHtml += '</div>';
    }

    card.innerHTML =
        '<div class="review-header">' +
            '<div class="review-author">' +
                '<div class="author-avatar">' + platformLabel.charAt(0) + '</div>' +
                '<div class="author-info">' +
                    '<span class="author-name">' + escapeHtml(review.nickname || '익명') + '</span>' +
                    '<span class="rating-stars">' + renderStars(rating) + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="review-meta">' +
                (isNegative ? '<span class="type-badge type-negative">부정</span>' : '') +
                '<span class="type-badge ' + typeClass + '">' + platformLabel + '</span>' +
                '<span class="store-badge">' + escapeHtml(review.store_name || '') + '</span>' +
            '</div>' +
        '</div>' +
        renderImages(review.images) +
        '<div class="review-content">' + escapeHtml(review.content || '') + '</div>' +
        menusHtml +
        '<div class="review-footer">' +
            '<span class="review-date">' + escapeHtml(dateStr) + '</span>' +
        '</div>';

    card.addEventListener('click', function() {
        showDeliveryReviewModal(scrollState[platform].filtered[idx], platform);
    });

    return card;
}

function showDeliveryReviewModal(review, platform) {
    var modal = document.getElementById('reviewModal');
    var body = document.getElementById('reviewModalBody');
    if (!modal || !body || !review) return;

    var isNegative = review.is_negative;
    var rating = review.rating || 0;
    var dateStr = review.created_date || '';
    var platformLabel = (platform === 'baemin') ? '배달의민족' : '쿠팡이츠';
    var typeClass = (platform === 'baemin') ? 'type-baemin' : 'type-coupang';

    var imagesHtml = '';
    if (review.images && review.images.length > 0) {
        imagesHtml = '<div class="review-images">' +
            review.images.map(function(img) {
                return '<img src="' + escapeHtml(img) + '" class="review-image" alt="리뷰 이미지" onerror="this.style.display=\'none\'">';
            }).join('') + '</div>';
    }

    var menusDetailHtml = '';
    if (review.menus && review.menus.length > 0) {
        menusDetailHtml =
            '<div class="review-menus-detail">' +
                '<h4>주문 메뉴</h4>' +
                '<div class="menus-list">' +
                    review.menus.map(function(m) {
                        return '<span class="menu-badge">' + escapeHtml(m) + '</span>';
                    }).join('') +
                '</div>' +
            '</div>';
    }

    body.innerHTML =
        '<div class="review-detail">' +
            '<div class="review-header">' +
                '<div class="review-author">' +
                    '<div class="author-avatar">' + platformLabel.charAt(0) + '</div>' +
                    '<div class="author-info">' +
                        '<span class="author-name">' + escapeHtml(review.nickname || '익명') + '</span>' +
                        '<span class="rating-stars">' + renderStars(rating) + ' (' + rating.toFixed(1) + ')</span>' +
                    '</div>' +
                '</div>' +
                '<div class="review-meta">' +
                    (isNegative ? '<span class="type-badge type-negative">부정</span>' : '') +
                    '<span class="type-badge ' + typeClass + '">' + platformLabel + '</span>' +
                    '<span class="store-badge">' + escapeHtml(review.store_name || '') + '</span>' +
                    '<span class="review-date">' + escapeHtml(dateStr) + '</span>' +
                '</div>' +
            '</div>' +
            imagesHtml +
            '<div class="review-content" style="-webkit-line-clamp: unset;">' + escapeHtml(review.content || '') + '</div>' +
            menusDetailHtml +
        '</div>';

    modal.classList.add('active');
}

function renderStars(rating) {
    var fullStars = Math.floor(rating);
    var halfStar = rating % 1 >= 0.5;
    var emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

    var stars = '';
    for (var i = 0; i < fullStars; i++) stars += '<span class="star full">*</span>';
    if (halfStar) stars += '<span class="star half">*</span>';
    for (var i2 = 0; i2 < emptyStars; i2++) stars += '<span class="star empty">*</span>';

    return stars;
}

// ============================================
// 공통 유틸리티
// ============================================

function renderImages(images) {
    if (!images || images.length === 0) return '';

    var maxImages = Math.min(4, images.length);
    var html = '<div class="review-images">';

    for (var i = 0; i < maxImages; i++) {
        var imgUrl = processImageUrl(images[i]);
        html += '<img data-src="' + escapeHtml(imgUrl) + '" class="review-image lazy-image" alt="리뷰 이미지" loading="lazy" onerror="this.style.display=\'none\'">';
    }

    if (images.length > 4) {
        html += '<div class="more-images">+' + (images.length - 4) + '</div>';
    }

    html += '</div>';
    return html;
}

function processImageUrl(url) {
    if (!url) return '';

    if (url.indexOf('pstatic.net') >= 0) {
        if (url.indexOf('type=') >= 0) {
            return url.replace(/type=\w+/, 'type=w300');
        }
        if (url.indexOf('?') >= 0) {
            return url + '&type=w300';
        }
        return url + '?type=w300';
    }

    return url;
}

function renderTags(tags) {
    if (!tags || tags.length === 0) return '';
    var displayTags = tags.slice(0, 4);
    var html = '<div class="review-tags">' +
        displayTags.map(function(t) {
            return '<span class="review-tag">' + escapeHtml(t) + '</span>';
        }).join('');
    if (tags.length > 4) {
        html += '<span class="review-tag">+' + (tags.length - 4) + '</span>';
    }
    html += '</div>';
    return html;
}

function lazyLoadImages() {
    var images = document.querySelectorAll('.lazy-image[data-src]');

    if ('IntersectionObserver' in window) {
        var imageObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    var img = entry.target;
                    loadImage(img);
                    imageObserver.unobserve(img);
                }
            });
        }, { rootMargin: '50px', threshold: 0.01 });

        images.forEach(function(img) { imageObserver.observe(img); });
    } else {
        images.forEach(function(img) { loadImage(img); });
    }
}

function loadImage(img) {
    var src = img.dataset.src;
    if (!src) return;

    var tempImg = new Image();
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
    var modal = document.getElementById('reviewModal');
    if (modal) modal.classList.remove('active');
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
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
