/**
 * 광고 관리 대시보드 v4
 * - 다중 지점 지원
 * - 지점 필터 연동
 * - 순위별 CPC 단가 표시
 * - 순위 클릭 -> 예상 비용 자동 계산
 */

let adsData = null;
let filteredKeywords = [];
let changedKeywords = {};
let selectedKeywords = new Set();
let selectedRanks = {};
let currentPlatform = 'naver';
let currentSort = { column: 'bidAmt', direction: 'desc' };

let searchVolumeChart = null;
let deviceChart = null;
let compChart = null;

const ESTIMATED_CTR = {
    1: 0.05,
    2: 0.035,
    3: 0.025,
    4: 0.015,
    5: 0.01
};

// ============================================
// 초기화
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initEventListeners();
    initStoreSelect();
    renderDashboard();
});

function recreateCanvas(containerId, canvasId) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const oldCanvas = document.getElementById(canvasId);
    if (oldCanvas) oldCanvas.remove();

    const newCanvas = document.createElement('canvas');
    newCanvas.id = canvasId;
    container.appendChild(newCanvas);

    return newCanvas.getContext('2d');
}

// ============================================
// 데이터 로드
// ============================================

async function loadData() {
    try {
        const response = await fetch('ads_data.json?t=' + Date.now());

        if (!response.ok) {
            throw new Error('데이터 파일 없음');
        }

        adsData = await response.json();
        console.log('Ads data loaded:', adsData.summary);
        console.log('Stores:', (adsData.stores || []).map(s => s.store_name));
        console.log('Rank bids available:', Object.keys(adsData.keyword_rank_bids || {}).length);

        if (adsData.generated_at) {
            const date = new Date(adsData.generated_at);
            document.getElementById('updateTime').textContent =
                '마지막 업데이트: ' + formatDateTime(date);
        }

        initCampaignSelect();

    } catch (error) {
        console.error('Failed to load ads data:', error);
        showNoDataMessage();
    }
}

function showNoDataMessage() {
    const content = document.getElementById('naverContent');
    if (content) {
        content.innerHTML =
            '<div class="coming-soon-box">' +
                '<div class="coming-soon-icon">AD</div>' +
                '<h2>광고 데이터 없음</h2>' +
                '<p>아직 수집된 광고 데이터가 없습니다.<br>' +
                'GitHub Actions에서 Naver Ads Data Collector를 실행해주세요.</p>' +
            '</div>';
    }
}

// ============================================
// 이벤트 리스너
// ============================================

function initEventListeners() {
    document.querySelectorAll('.platform-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.classList.contains('disabled')) return;
            switchPlatform(tab.dataset.platform);
        });
    });

    document.querySelectorAll('.delivery-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.delivery-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });

    document.querySelectorAll('.tabs .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
        });
    });

    document.getElementById('storeSelect')?.addEventListener('change', () => {
        initCampaignSelect();
        initAdgroupSelect();
        filterAndRender();
    });
    document.getElementById('campaignSelect')?.addEventListener('change', () => {
        initAdgroupSelect();
        filterAndRender();
    });
    document.getElementById('adgroupSelect')?.addEventListener('change', filterAndRender);
    document.getElementById('statusSelect')?.addEventListener('change', filterAndRender);

    document.getElementById('keywordSearch')?.addEventListener('input', (e) => {
        filterAndRender(e.target.value);
    });

    document.getElementById('selectAll')?.addEventListener('change', (e) => {
        toggleSelectAll(e.target.checked);
    });

    document.getElementById('saveChangesBtn')?.addEventListener('click', showConfirmModal);

    document.getElementById('bulkApplyBtn')?.addEventListener('click', applyBulkBid);
    document.getElementById('bulkIncreaseBtn')?.addEventListener('click', () => adjustBulkBid(1.1));
    document.getElementById('bulkDecreaseBtn')?.addEventListener('click', () => adjustBulkBid(0.9));

    document.querySelector('#confirmModal .modal-close')?.addEventListener('click', closeConfirmModal);
    document.getElementById('cancelConfirmBtn')?.addEventListener('click', closeConfirmModal);
    document.getElementById('applyConfirmBtn')?.addEventListener('click', applyChanges);

    document.getElementById('confirmModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'confirmModal') closeConfirmModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeConfirmModal();
    });

    document.querySelectorAll('#keywordTable .sortable-header').forEach(header => {
        header.addEventListener('click', () => {
            handleSort(header.dataset.sort);
        });
    });
}

// ============================================
// 플랫폼/탭 전환
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

function switchTab(tabId) {
    document.querySelectorAll('.tabs .tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabId);
    });

    document.querySelectorAll('#naverContent .tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === tabId);
    });

    if (tabId === 'searchVolume') {
        renderSearchVolumeCharts();
    } else if (tabId === 'bidSuggestion') {
        renderBidSuggestionTable();
    }
}

// ============================================
// 필터 초기화 (지점은 수집된 데이터 기반)
// ============================================

function initStoreSelect() {
    const select = document.getElementById('storeSelect');
    if (!select) return;

    select.innerHTML = '<option value="">전체 지점</option>';

    if (!adsData || !adsData.stores || adsData.stores.length === 0) {
        // stores 배열이 없으면 기존 keywords의 storeName에서 추출
        var storeNames = [];
        (adsData?.keywords || []).forEach(function(kw) {
            var name = kw.storeName || '';
            if (name && storeNames.indexOf(name) === -1) {
                storeNames.push(name);
            }
        });
        storeNames.forEach(function(name) {
            select.innerHTML += '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>';
        });
    } else {
        adsData.stores.forEach(function(store) {
            select.innerHTML += '<option value="' + escapeHtml(store.store_name) + '">' + escapeHtml(store.store_name) + '</option>';
        });
    }
}

function initCampaignSelect() {
    const select = document.getElementById('campaignSelect');
    if (!select || !adsData) return;

    const selectedStore = document.getElementById('storeSelect')?.value || '';

    var campaigns = adsData.campaigns || [];

    // 지점 필터 적용: 캠페인에 storeName이 있으면 필터링
    if (selectedStore) {
        // 해당 지점의 키워드에서 캠페인 ID 추출
        var storeCampaignIds = [];
        (adsData.keywords || []).forEach(function(kw) {
            if (kw.storeName === selectedStore) {
                var cid = kw.nccCampaignId;
                if (cid && storeCampaignIds.indexOf(cid) === -1) {
                    storeCampaignIds.push(cid);
                }
            }
        });
        campaigns = campaigns.filter(function(c) {
            return storeCampaignIds.indexOf(c.nccCampaignId) !== -1;
        });
    }

    select.innerHTML = '<option value="">전체 캠페인</option>';
    campaigns.forEach(function(campaign) {
        var name = campaign.name || campaign.nccCampaignId;
        select.innerHTML += '<option value="' + campaign.nccCampaignId + '">' + escapeHtml(name) + '</option>';
    });
}

function initAdgroupSelect() {
    const select = document.getElementById('adgroupSelect');
    const campaignId = document.getElementById('campaignSelect')?.value;
    const selectedStore = document.getElementById('storeSelect')?.value || '';
    if (!select || !adsData) return;

    var adgroups = adsData.adgroups || [];

    if (selectedStore) {
        adgroups = adgroups.filter(function(ag) {
            return ag.storeName === selectedStore;
        });
    }

    if (campaignId) {
        adgroups = adgroups.filter(function(ag) {
            return ag.nccCampaignId === campaignId;
        });
    }

    select.innerHTML = '<option value="">전체 광고그룹</option>';
    adgroups.forEach(function(adgroup) {
        var name = adgroup.name || adgroup.nccAdgroupId;
        select.innerHTML += '<option value="' + adgroup.nccAdgroupId + '">' + escapeHtml(name) + '</option>';
    });
}

// ============================================
// 대시보드 렌더링
// ============================================

function renderDashboard() {
    if (!adsData) return;

    renderSummaryCards();
    filterAndRender();
}

function renderSummaryCards() {
    var selectedStore = document.getElementById('storeSelect')?.value || '';

    if (selectedStore && adsData.stores && adsData.stores.length > 0) {
        // 선택된 지점의 서머리 표시
        var storeInfo = adsData.stores.find(function(s) { return s.store_name === selectedStore; });
        if (storeInfo) {
            var sm = storeInfo.summary || {};
            document.getElementById('totalCampaigns').textContent = formatNumber(sm.total_campaigns || 0);
            document.getElementById('totalAdgroups').textContent = formatNumber(sm.total_adgroups || 0);
            document.getElementById('totalKeywords').textContent = formatNumber(sm.total_keywords || 0);
            document.getElementById('activeKeywords').textContent = formatNumber(sm.active_keywords || 0);
            return;
        }
    }

    // 전체 서머리
    var summary = adsData.summary || {};
    document.getElementById('totalCampaigns').textContent = formatNumber(summary.total_campaigns || 0);
    document.getElementById('totalAdgroups').textContent = formatNumber(summary.total_adgroups || 0);
    document.getElementById('totalKeywords').textContent = formatNumber(summary.total_keywords || 0);
    document.getElementById('activeKeywords').textContent = formatNumber(summary.active_keywords || 0);
}

// ============================================
// 키워드 필터링 및 렌더링
// ============================================

function filterAndRender(searchTerm) {
    if (!adsData) return;

    var selectedStore = document.getElementById('storeSelect')?.value || '';
    var campaignId = document.getElementById('campaignSelect')?.value || '';
    var adgroupId = document.getElementById('adgroupSelect')?.value || '';
    var status = document.getElementById('statusSelect')?.value || '';
    var search = searchTerm || document.getElementById('keywordSearch')?.value || '';

    var keywords = adsData.keywords || [];

    // 지점 필터
    if (selectedStore) {
        keywords = keywords.filter(function(kw) {
            return kw.storeName === selectedStore;
        });
    }

    if (campaignId) {
        keywords = keywords.filter(function(kw) {
            var adgroup = (adsData.adgroups || []).find(function(ag) { return ag.nccAdgroupId === kw.nccAdgroupId; });
            return adgroup && adgroup.nccCampaignId === campaignId;
        });
    }

    if (adgroupId) {
        keywords = keywords.filter(function(kw) {
            return kw.nccAdgroupId === adgroupId;
        });
    }

    if (status === 'active') {
        keywords = keywords.filter(function(kw) { return !kw.userLock; });
    } else if (status === 'paused') {
        keywords = keywords.filter(function(kw) { return kw.userLock; });
    }

    if (search) {
        var term = search.toLowerCase();
        keywords = keywords.filter(function(kw) {
            return (kw.keyword || '').toLowerCase().indexOf(term) !== -1 ||
                (kw.campaignName || '').toLowerCase().indexOf(term) !== -1 ||
                (kw.adgroupName || '').toLowerCase().indexOf(term) !== -1 ||
                (kw.storeName || '').toLowerCase().indexOf(term) !== -1;
        });
    }

    keywords = sortKeywords(keywords);
    filteredKeywords = keywords;

    renderSummaryCards();
    renderKeywordTable();
}

function sortKeywords(keywords) {
    return [].concat(keywords).sort(function(a, b) {
        var aVal, bVal;

        switch (currentSort.column) {
            case 'keyword':
            case 'campaign':
            case 'adgroup':
                var field = currentSort.column === 'keyword' ? 'keyword' :
                    currentSort.column === 'campaign' ? 'campaignName' : 'adgroupName';
                aVal = a[field] || '';
                bVal = b[field] || '';
                return currentSort.direction === 'asc'
                    ? aVal.localeCompare(bVal, 'ko')
                    : bVal.localeCompare(aVal, 'ko');

            case 'bidAmt':
                aVal = a.bidAmt || 0;
                bVal = b.bidAmt || 0;
                break;

            case 'searchVolume':
                var aStats = adsData.keyword_stats?.[a.keyword] || {};
                var bStats = adsData.keyword_stats?.[b.keyword] || {};
                aVal = (aStats.monthlyPcQcCnt || 0) + (aStats.monthlyMobileQcCnt || 0);
                bVal = (bStats.monthlyPcQcCnt || 0) + (bStats.monthlyMobileQcCnt || 0);
                break;

            case 'compIdx':
                var compOrder = { '높음': 3, '중간': 2, '낮음': 1, '': 0 };
                aVal = compOrder[adsData.keyword_stats?.[a.keyword]?.compIdx || ''] || 0;
                bVal = compOrder[adsData.keyword_stats?.[b.keyword]?.compIdx || ''] || 0;
                break;

            default:
                return 0;
        }

        return currentSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
}

function handleSort(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = ['keyword', 'campaign', 'adgroup'].includes(column) ? 'asc' : 'desc';
    }

    filterAndRender();
    updateSortIcons();
}

function updateSortIcons() {
    document.querySelectorAll('#keywordTable .sortable-header').forEach(function(header) {
        var icon = header.querySelector('.sort-icon');
        var column = header.dataset.sort;

        if (column === currentSort.column) {
            icon.textContent = currentSort.direction === 'asc' ? String.fromCharCode(8593) : String.fromCharCode(8595);
            header.classList.add('sorted');
        } else {
            icon.textContent = String.fromCharCode(8597);
            header.classList.remove('sorted');
        }
    });
}

// ============================================
// 키워드 테이블 렌더링
// ============================================

function renderKeywordTable() {
    var tbody = document.getElementById('keywordTableBody');
    if (!tbody) return;

    var selectedStore = document.getElementById('storeSelect')?.value || '';
    var showStoreColumn = !selectedStore;

    if (filteredKeywords.length === 0) {
        var colSpan = showStoreColumn ? 10 : 9;
        tbody.innerHTML =
            '<tr>' +
                '<td colspan="' + colSpan + '" class="text-center" style="padding: 40px; color: #666;">' +
                    '키워드가 없습니다.' +
                '</td>' +
            '</tr>';
        removeRankBidsFooter();
        updateTableHeader(showStoreColumn);
        return;
    }

    updateTableHeader(showStoreColumn);

    tbody.innerHTML = filteredKeywords.map(function(kw) {
        var keywordId = kw.nccKeywordId;
        var keyword = kw.keyword || '';
        var bidAmt = kw.bidAmt || 0;
        var isActive = !kw.userLock;
        var isSelected = selectedKeywords.has(keywordId);
        var isChanged = changedKeywords[keywordId] !== undefined;
        var newBid = changedKeywords[keywordId] || '';
        var storeName = kw.storeName || '-';

        var stats = adsData.keyword_stats?.[keyword] || {};
        var pcVolume = stats.monthlyPcQcCnt || 0;
        var mobileVolume = stats.monthlyMobileQcCnt || 0;
        var totalVolume = pcVolume + mobileVolume;
        var compIdx = stats.compIdx || '-';

        var compClass = '';
        if (compIdx === '높음') compClass = 'comp-high';
        else if (compIdx === '중간') compClass = 'comp-medium';
        else if (compIdx === '낮음') compClass = 'comp-low';

        var rankBids = adsData.keyword_rank_bids?.[keyword] || [];
        var rank1Bid = rankBids[0]?.mobileBid || 0;

        var storeCell = showStoreColumn
            ? '<td class="store-name-cell">' + escapeHtml(storeName) + '</td>'
            : '';

        return '<tr data-keyword-id="' + keywordId + '" data-keyword="' + escapeHtml(keyword) + '">' +
            '<td class="col-checkbox">' +
                '<input type="checkbox" class="keyword-checkbox" data-id="' + keywordId + '"' + (isSelected ? ' checked' : '') + '>' +
            '</td>' +
            '<td>' +
                escapeHtml(keyword) +
                (rank1Bid > 0 ? ' <span class="rank1-hint" title="1위 입찰가">(1위: ' + formatNumber(rank1Bid) + '원)</span>' : '') +
            '</td>' +
            storeCell +
            '<td>' + escapeHtml(kw.campaignName || '-') + '</td>' +
            '<td>' + escapeHtml(kw.adgroupName || '-') + '</td>' +
            '<td class="text-right">' + formatCurrency(bidAmt) + '</td>' +
            '<td class="text-right">' +
                '<input type="number" class="bid-input ' + (isChanged ? 'changed' : '') + '"' +
                ' data-id="' + keywordId + '"' +
                ' data-original="' + bidAmt + '"' +
                ' value="' + newBid + '"' +
                ' placeholder="' + formatNumber(bidAmt) + '"' +
                ' min="70" max="100000" step="10">' +
            '</td>' +
            '<td class="text-right">' +
                (totalVolume > 0 ? formatNumber(totalVolume) : '-') +
                (totalVolume > 0 ? ' <span class="volume-detail">PC:' + formatCompact(pcVolume) + ' / M:' + formatCompact(mobileVolume) + '</span>' : '') +
            '</td>' +
            '<td class="text-center">' +
                '<span class="comp-badge ' + compClass + '">' + compIdx + '</span>' +
            '</td>' +
            '<td class="text-center">' +
                '<span class="status-badge ' + (isActive ? 'status-active' : 'status-paused') + '">' +
                    (isActive ? '활성' : '중지') +
                '</span>' +
            '</td>' +
        '</tr>';
    }).join('');

    tbody.querySelectorAll('.keyword-checkbox').forEach(function(checkbox) {
        checkbox.addEventListener('change', function(e) {
            var id = e.target.dataset.id;
            if (e.target.checked) {
                selectedKeywords.add(id);
            } else {
                selectedKeywords.delete(id);
            }
            updateBulkActionBar();
            updateRankBidsFooter();
        });
    });

    tbody.querySelectorAll('.bid-input').forEach(function(input) {
        input.addEventListener('input', function(e) {
            var id = e.target.dataset.id;
            var original = parseInt(e.target.dataset.original);
            var newValue = e.target.value ? parseInt(e.target.value) : null;

            if (newValue && newValue !== original) {
                changedKeywords[id] = newValue;
                e.target.classList.add('changed');
            } else {
                delete changedKeywords[id];
                e.target.classList.remove('changed');
            }

            updateSaveButton();
        });
    });

    updateSortIcons();
    updateRankBidsFooter();
}

function updateTableHeader(showStoreColumn) {
    var thead = document.querySelector('#keywordTable thead tr');
    if (!thead) return;

    // 기존 지점 컬럼 제거
    var existingStoreHeader = thead.querySelector('.store-header');
    if (existingStoreHeader) existingStoreHeader.remove();

    if (showStoreColumn) {
        // 키워드 컬럼 다음에 지점 컬럼 삽입
        var keywordHeader = thead.querySelectorAll('th')[1];
        if (keywordHeader) {
            var storeHeader = document.createElement('th');
            storeHeader.className = 'store-header';
            storeHeader.textContent = '지점';
            keywordHeader.after(storeHeader);
        }
    }
}

// ============================================
// 선택된 키워드의 순위별 CPC 표시
// ============================================

function updateRankBidsFooter() {
    removeRankBidsFooter();

    if (selectedKeywords.size === 0) return;

    var firstSelectedId = selectedKeywords.values().next().value;
    var selectedKw = filteredKeywords.find(function(kw) { return kw.nccKeywordId === firstSelectedId; });

    if (!selectedKw) return;

    var keyword = selectedKw.keyword;
    var rankBids = adsData.keyword_rank_bids?.[keyword] || [];

    if (rankBids.length === 0) return;

    var footer = document.createElement('div');
    footer.id = 'rankBidsFooter';
    footer.className = 'rank-bids-footer';

    var storeLabel = selectedKw.storeName ? ' [' + escapeHtml(selectedKw.storeName) + ']' : '';

    var html = '<div class="rank-bids-title">"' + escapeHtml(keyword) + '"' + storeLabel + ' 순위별 CPC 단가</div>';
    html += '<div class="rank-bids-list">';

    rankBids.slice(0, 5).forEach(function(item) {
        var rank = item.rank;
        var pcBid = item.pcBid || 0;
        var mobileBid = item.mobileBid || 0;

        html +=
            '<div class="rank-bid-item">' +
                '<span class="rank-label">' + rank + '위</span>' +
                '<span class="rank-pc">PC: ' + formatNumber(pcBid) + '원</span>' +
                '<span class="rank-mobile">M: ' + formatNumber(mobileBid) + '원</span>' +
            '</div>';
    });

    html += '</div>';
    footer.innerHTML = html;

    var tableContainer = document.querySelector('#keywords .table-wrapper');
    if (tableContainer) {
        tableContainer.parentNode.insertBefore(footer, tableContainer.nextSibling);
    }
}

function removeRankBidsFooter() {
    var existing = document.getElementById('rankBidsFooter');
    if (existing) existing.remove();
}

// ============================================
// 선택 및 일괄 작업
// ============================================

function toggleSelectAll(checked) {
    selectedKeywords.clear();

    if (checked) {
        filteredKeywords.forEach(function(kw) { selectedKeywords.add(kw.nccKeywordId); });
    }

    document.querySelectorAll('.keyword-checkbox').forEach(function(cb) {
        cb.checked = checked;
    });

    updateBulkActionBar();
    updateRankBidsFooter();
}

function updateBulkActionBar() {
    var bar = document.getElementById('bulkActionBar');
    var count = selectedKeywords.size;

    if (bar) {
        bar.style.display = count > 0 ? 'flex' : 'none';
        document.getElementById('selectedCount').textContent = count;
    }

    var selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.checked = count > 0 && count === filteredKeywords.length;
        selectAll.indeterminate = count > 0 && count < filteredKeywords.length;
    }
}

function applyBulkBid() {
    var bidAmt = parseInt(document.getElementById('bulkBidAmt')?.value);
    if (!bidAmt || bidAmt < 70) {
        alert('최소 입찰가는 70원입니다.');
        return;
    }

    selectedKeywords.forEach(function(id) {
        changedKeywords[id] = bidAmt;
    });

    renderKeywordTable();
    updateSaveButton();
}

function adjustBulkBid(multiplier) {
    selectedKeywords.forEach(function(id) {
        var kw = filteredKeywords.find(function(k) { return k.nccKeywordId === id; });
        if (kw) {
            var currentBid = changedKeywords[id] || kw.bidAmt || 0;
            var newBid = Math.round(currentBid * multiplier / 10) * 10;
            changedKeywords[id] = Math.max(70, Math.min(100000, newBid));
        }
    });

    renderKeywordTable();
    updateSaveButton();
}

function updateSaveButton() {
    var btn = document.getElementById('saveChangesBtn');
    if (btn) {
        var hasChanges = Object.keys(changedKeywords).length > 0;
        btn.disabled = !hasChanges;
    }
}

// ============================================
// 변경사항 저장 (모달)
// ============================================

function showConfirmModal() {
    var changeList = Object.entries(changedKeywords);
    if (changeList.length === 0) return;

    var confirmList = document.getElementById('confirmList');
    if (confirmList) {
        confirmList.innerHTML = changeList.map(function(entry) {
            var id = entry[0];
            var newBid = entry[1];
            var kw = (adsData.keywords || []).find(function(k) { return k.nccKeywordId === id; });
            var keyword = kw?.keyword || id;
            var oldBid = kw?.bidAmt || 0;
            var storeName = kw?.storeName || '';

            return '<div class="confirm-item">' +
                '<span class="confirm-keyword">' + escapeHtml(keyword) +
                    (storeName ? ' <span class="confirm-store">[' + escapeHtml(storeName) + ']</span>' : '') +
                '</span>' +
                '<div class="confirm-change">' +
                    '<span class="old-value">' + formatNumber(oldBid) + '원</span>' +
                    '<span class="arrow">' + String.fromCharCode(8594) + '</span>' +
                    '<span class="new-value">' + formatNumber(newBid) + '원</span>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    document.getElementById('confirmModal')?.classList.add('active');
}

function closeConfirmModal() {
    document.getElementById('confirmModal')?.classList.remove('active');
}

async function applyChanges() {
    closeConfirmModal();
    showLoading(true);

    try {
        var changes = Object.entries(changedKeywords);

        console.log('변경 요청:', changes);

        await new Promise(function(resolve) { setTimeout(resolve, 1000); });

        alert(changes.length + '개 키워드 입찰가 변경 요청이 완료되었습니다.\n\n※ 실제 반영은 GitHub Actions 워크플로우를 통해 처리됩니다.');

        changedKeywords = {};
        selectedKeywords.clear();
        renderKeywordTable();
        updateSaveButton();
        updateBulkActionBar();

    } catch (error) {
        console.error('Failed to apply changes:', error);
        alert('변경 적용 중 오류가 발생했습니다.');
    }

    showLoading(false);
}

function showLoading(show) {
    var overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
}

// ============================================
// 검색량 분석 차트
// ============================================

function renderSearchVolumeCharts() {
    renderSearchVolumeChart();
    renderDeviceChart();
    renderCompChart();
}

function renderSearchVolumeChart() {
    if (searchVolumeChart) {
        searchVolumeChart.destroy();
        searchVolumeChart = null;
    }

    var ctx = recreateCanvas('searchVolumeChartContainer', 'searchVolumeChart');
    if (!ctx) return;

    var keywordsWithVolume = filteredKeywords.map(function(kw) {
        var stats = adsData.keyword_stats?.[kw.keyword] || {};
        return {
            keyword: kw.keyword,
            storeName: kw.storeName || '',
            pc: stats.monthlyPcQcCnt || 0,
            mobile: stats.monthlyMobileQcCnt || 0,
            total: (stats.monthlyPcQcCnt || 0) + (stats.monthlyMobileQcCnt || 0)
        };
    }).filter(function(k) { return k.total > 0; })
      .sort(function(a, b) { return b.total - a.total; })
      .slice(0, 20);

    if (keywordsWithVolume.length === 0) return;

    searchVolumeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: keywordsWithVolume.map(function(k) {
                var label = k.keyword.length > 12 ? k.keyword.slice(0, 12) + '...' : k.keyword;
                return label;
            }),
            datasets: [
                {
                    label: 'PC',
                    data: keywordsWithVolume.map(function(k) { return k.pc; }),
                    backgroundColor: '#00d4ff',
                    borderRadius: 4
                },
                {
                    label: '모바일',
                    data: keywordsWithVolume.map(function(k) { return k.mobile; }),
                    backgroundColor: '#7b2cbf',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#e0e0e0' }
                },
                tooltip: {
                    callbacks: {
                        title: function(items) {
                            var item = keywordsWithVolume[items[0].dataIndex];
                            var title = item?.keyword || '';
                            if (item?.storeName) title += ' [' + item.storeName + ']';
                            return title;
                        },
                        label: function(ctx) { return ctx.dataset.label + ': ' + formatNumber(ctx.raw); }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#888', maxRotation: 45 },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color: '#888',
                        callback: function(v) { return formatCompact(v); }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function renderDeviceChart() {
    if (deviceChart) {
        deviceChart.destroy();
        deviceChart = null;
    }

    var ctx = recreateCanvas('deviceChartContainer', 'deviceChart');
    if (!ctx) return;

    var totalPc = 0;
    var totalMobile = 0;

    filteredKeywords.forEach(function(kw) {
        var stats = adsData.keyword_stats?.[kw.keyword] || {};
        totalPc += stats.monthlyPcQcCnt || 0;
        totalMobile += stats.monthlyMobileQcCnt || 0;
    });

    if (totalPc === 0 && totalMobile === 0) return;

    deviceChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['PC', '모바일'],
            datasets: [{
                data: [totalPc, totalMobile],
                backgroundColor: ['#00d4ff', '#7b2cbf'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#e0e0e0' }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            var total = totalPc + totalMobile;
                            var pct = ((ctx.raw / total) * 100).toFixed(1);
                            return ctx.label + ': ' + formatNumber(ctx.raw) + ' (' + pct + '%)';
                        }
                    }
                }
            }
        }
    });
}

function renderCompChart() {
    if (compChart) {
        compChart.destroy();
        compChart = null;
    }

    var ctx = recreateCanvas('compChartContainer', 'compChart');
    if (!ctx) return;

    var compCounts = { '높음': 0, '중간': 0, '낮음': 0 };

    filteredKeywords.forEach(function(kw) {
        var stats = adsData.keyword_stats?.[kw.keyword] || {};
        var comp = stats.compIdx || '';
        if (compCounts[comp] !== undefined) {
            compCounts[comp]++;
        }
    });

    var total = compCounts['높음'] + compCounts['중간'] + compCounts['낮음'];
    if (total === 0) return;

    compChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['높음', '중간', '낮음'],
            datasets: [{
                data: [compCounts['높음'], compCounts['중간'], compCounts['낮음']],
                backgroundColor: ['#ff6b6b', '#ffe66d', '#4ecdc4'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#e0e0e0' }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            var pct = ((ctx.raw / total) * 100).toFixed(1);
                            return ctx.label + ': ' + ctx.raw + '개 (' + pct + '%)';
                        }
                    }
                }
            }
        }
    });
}

// ============================================
// 입찰가 추천 테이블
// ============================================

function renderBidSuggestionTable() {
    var tbody = document.getElementById('bidSuggestionTableBody');
    var thead = document.querySelector('#bidSuggestionTable thead');
    if (!tbody || !thead) return;

    var selectedStore = document.getElementById('storeSelect')?.value || '';
    var showStoreCol = !selectedStore;

    var storeColHeader = showStoreCol ? '<th rowspan="2">지점</th>' : '';

    thead.innerHTML =
        '<tr class="header-main">' +
            '<th rowspan="2">키워드</th>' +
            storeColHeader +
            '<th rowspan="2" class="text-right">현재 입찰가</th>' +
            '<th rowspan="2" class="text-right">월간 검색량</th>' +
            '<th rowspan="2" class="text-center">경쟁도</th>' +
            '<th colspan="5" class="text-center" style="border-bottom: 1px solid rgba(255,255,255,0.1);">순위별 클릭 입찰가</th>' +
            '<th rowspan="2" class="text-right">예상 클릭비용</th>' +
            '<th rowspan="2" class="text-center">추천</th>' +
        '</tr>' +
        '<tr class="header-sub">' +
            '<th class="text-center col-rank">1위</th>' +
            '<th class="text-center col-rank col-rank-2">2위</th>' +
            '<th class="text-center col-rank col-rank-3">3위</th>' +
            '<th class="text-center col-rank col-rank-4">4위</th>' +
            '<th class="text-center col-rank col-rank-5">5위</th>' +
        '</tr>';

    var keywordsWithData = filteredKeywords.filter(function(kw) {
        var stats = adsData.keyword_stats?.[kw.keyword] || {};
        var rankBids = adsData.keyword_rank_bids?.[kw.keyword] || [];
        return (stats.monthlyPcQcCnt || 0) + (stats.monthlyMobileQcCnt || 0) > 0 || rankBids.length > 0;
    }).sort(function(a, b) {
        var aStats = adsData.keyword_stats?.[a.keyword] || {};
        var bStats = adsData.keyword_stats?.[b.keyword] || {};
        var aVol = (aStats.monthlyPcQcCnt || 0) + (aStats.monthlyMobileQcCnt || 0);
        var bVol = (bStats.monthlyPcQcCnt || 0) + (bStats.monthlyMobileQcCnt || 0);
        return bVol - aVol;
    });

    if (keywordsWithData.length === 0) {
        var colCount = showStoreCol ? 12 : 11;
        tbody.innerHTML =
            '<tr>' +
                '<td colspan="' + colCount + '" class="text-center" style="padding: 40px; color: #666;">' +
                    '데이터가 있는 키워드가 없습니다.' +
                '</td>' +
            '</tr>';
        return;
    }

    tbody.innerHTML = keywordsWithData.map(function(kw) {
        var keyword = kw.keyword;
        var keywordId = kw.nccKeywordId;
        var storeName = kw.storeName || '-';
        var stats = adsData.keyword_stats?.[keyword] || {};
        var totalVolume = (stats.monthlyPcQcCnt || 0) + (stats.monthlyMobileQcCnt || 0);
        var compIdx = stats.compIdx || '-';
        var bidAmt = kw.bidAmt || 0;

        var rankBids = adsData.keyword_rank_bids?.[keyword] || [];

        var compClass = '';
        if (compIdx === '높음') compClass = 'comp-high';
        else if (compIdx === '중간') compClass = 'comp-medium';
        else if (compIdx === '낮음') compClass = 'comp-low';

        var rankCells = '';
        for (var rank = 1; rank <= 5; rank++) {
            var rankData = rankBids.find(function(r) { return r.rank === rank; });
            var mobileBid = rankData?.mobileBid || 0;
            var isRankSelected = selectedRanks[keywordId] === rank;

            var colClass = rank >= 2 ? 'col-rank-' + rank : '';

            rankCells +=
                '<td class="text-center ' + colClass + '">' +
                    '<span class="rank-cell rank-' + rank + (isRankSelected ? ' selected' : '') + '"' +
                    ' data-keyword-id="' + keywordId + '"' +
                    ' data-keyword="' + escapeHtml(keyword) + '"' +
                    ' data-rank="' + rank + '"' +
                    ' data-bid="' + mobileBid + '"' +
                    ' data-volume="' + totalVolume + '"' +
                    ' title="클릭하여 예상 비용 계산">' +
                        (mobileBid > 0 ? formatCompact(mobileBid) : '-') +
                    '</span>' +
                '</td>';
        }

        var estimatedCostHtml = '<span class="select-hint">순위 클릭</span>';
        var estimatedCostClass = 'calculating';

        if (selectedRanks[keywordId]) {
            var selRank = selectedRanks[keywordId];
            var selRankData = rankBids.find(function(r) { return r.rank === selRank; });
            var selectedBid = selRankData?.mobileBid || 0;

            if (selectedBid > 0 && totalVolume > 0) {
                var ctr = ESTIMATED_CTR[selRank] || 0.01;
                var monthlyClicks = Math.round(totalVolume * ctr);
                var monthlyCost = monthlyClicks * selectedBid;
                estimatedCostHtml =
                    '<div>' + formatCompact(monthlyCost) + '원</div>' +
                    '<div class="cost-detail">' + monthlyClicks + '클릭 x ' + formatNumber(selectedBid) + '원</div>';
                estimatedCostClass = '';
            }
        }

        var rank3Bid = rankBids.find(function(r) { return r.rank === 3; })?.mobileBid || 0;
        var recommendation = '-';
        var recommendClass = 'ok';

        if (rank3Bid > 0) {
            if (bidAmt < rank3Bid * 0.7) {
                recommendation = String.fromCharCode(8593) + ' 상향';
                recommendClass = 'up';
            } else if (bidAmt > rank3Bid * 1.5) {
                recommendation = String.fromCharCode(8595) + ' 하향';
                recommendClass = 'down';
            } else {
                recommendation = '적정';
                recommendClass = 'ok';
            }
        }

        var storeCell = showStoreCol ? '<td class="store-name-cell">' + escapeHtml(storeName) + '</td>' : '';

        return '<tr data-row-id="' + keywordId + '">' +
            '<td>' + escapeHtml(keyword) + '</td>' +
            storeCell +
            '<td class="text-right">' + formatCurrency(bidAmt) + '</td>' +
            '<td class="text-right">' + (totalVolume > 0 ? formatNumber(totalVolume) : '-') + '</td>' +
            '<td class="text-center">' +
                '<span class="comp-badge ' + compClass + '">' + compIdx + '</span>' +
            '</td>' +
            rankCells +
            '<td class="text-right estimated-cost ' + estimatedCostClass + '" data-keyword-id="' + keywordId + '">' +
                estimatedCostHtml +
            '</td>' +
            '<td class="text-center">' +
                '<span class="recommendation ' + recommendClass + '">' + recommendation + '</span>' +
            '</td>' +
        '</tr>';
    }).join('');

    tbody.querySelectorAll('.rank-cell').forEach(function(cell) {
        cell.addEventListener('click', handleRankCellClick);
    });
}

function handleRankCellClick(e) {
    var cell = e.currentTarget;
    var keywordId = cell.dataset.keywordId;
    var rank = parseInt(cell.dataset.rank);
    var bid = parseInt(cell.dataset.bid) || 0;
    var volume = parseInt(cell.dataset.volume) || 0;

    if (selectedRanks[keywordId] === rank) {
        delete selectedRanks[keywordId];
    } else {
        selectedRanks[keywordId] = rank;
    }

    var row = cell.closest('tr');
    row.querySelectorAll('.rank-cell').forEach(function(c) {
        var cellRank = parseInt(c.dataset.rank);
        c.classList.toggle('selected', selectedRanks[keywordId] === cellRank);
    });

    updateEstimatedCost(keywordId, bid, volume, rank);
}

function updateEstimatedCost(keywordId, bid, volume, rank) {
    var costCell = document.querySelector('.estimated-cost[data-keyword-id="' + keywordId + '"]');
    if (!costCell) return;

    if (!selectedRanks[keywordId]) {
        costCell.innerHTML = '<span class="select-hint">순위 클릭</span>';
        costCell.classList.add('calculating');
        return;
    }

    if (bid > 0 && volume > 0) {
        var ctr = ESTIMATED_CTR[rank] || 0.01;
        var monthlyClicks = Math.round(volume * ctr);
        var monthlyCost = monthlyClicks * bid;

        costCell.innerHTML =
            '<div>' + formatCompact(monthlyCost) + '원</div>' +
            '<div class="cost-detail">' + monthlyClicks + '클릭 x ' + formatNumber(bid) + '원</div>';
        costCell.classList.remove('calculating');
    } else {
        costCell.innerHTML = '-';
        costCell.classList.add('calculating');
    }
}

// ============================================
// 유틸리티 함수
// ============================================

function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return new Intl.NumberFormat('ko-KR').format(num);
}

function formatCurrency(num) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return new Intl.NumberFormat('ko-KR').format(num) + '원';
}

function formatCompact(value) {
    if (value === null || value === undefined) return '-';
    if (value >= 100000000) {
        return (value / 100000000).toFixed(1) + '억';
    } else if (value >= 10000000) {
        return (value / 10000000).toFixed(1) + '천만';
    } else if (value >= 10000) {
        return (value / 10000).toFixed(1) + '만';
    } else if (value >= 1000) {
        return (value / 1000).toFixed(1) + '천';
    }
    return formatNumber(value);
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
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
