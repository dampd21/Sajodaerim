/**
 * 광고 관리 대시보드 v2
 * - 순위별 CPC 단가 표시
 * - 키워드 테이블 하단에 1~5위 CPC 표시
 */

let adsData = null;
let filteredKeywords = [];
let changedKeywords = {};
let selectedKeywords = new Set();
let currentPlatform = 'naver';
let currentSort = { column: 'bidAmt', direction: 'desc' };

let searchVolumeChart = null;
let deviceChart = null;
let compChart = null;

const STORE_LIST = [
    "역대짬뽕 본점",
    "역대짬뽕 오산시청점",
    "역대짬뽕 병점점",
    "역대짬뽕 송탄점",
    "역대짬뽕 화성반월점",
    "역대짬뽕 다산1호점",
    "역대짬뽕 송파점",
    "역대짬뽕 두정점"
];

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
        console.log('Rank bids available:', Object.keys(adsData.keyword_rank_bids || {}).length);
        
        if (adsData.generated_at) {
            const date = new Date(adsData.generated_at);
            document.getElementById('updateTime').textContent = 
                `마지막 업데이트: ${formatDateTime(date)}`;
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
        content.innerHTML = `
            <div class="coming-soon-box">
                <div class="coming-soon-icon">📊</div>
                <h2>광고 데이터 없음</h2>
                <p>아직 수집된 광고 데이터가 없습니다.<br>
                GitHub Actions에서 'Naver Ads Data Collector'를 실행해주세요.</p>
            </div>
        `;
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
    
    document.getElementById('storeSelect')?.addEventListener('change', filterAndRender);
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
    document.getElementById(`${platform}Content`)?.classList.add('active');
    
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
// 필터 초기화
// ============================================

function initStoreSelect() {
    const select = document.getElementById('storeSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">전체 지점</option>';
    STORE_LIST.forEach(store => {
        select.innerHTML += `<option value="${store}">${store}</option>`;
    });
}

function initCampaignSelect() {
    const select = document.getElementById('campaignSelect');
    if (!select || !adsData) return;
    
    const campaigns = adsData.campaigns || [];
    
    select.innerHTML = '<option value="">전체 캠페인</option>';
    campaigns.forEach(campaign => {
        const name = campaign.name || campaign.nccCampaignId;
        select.innerHTML += `<option value="${campaign.nccCampaignId}">${name}</option>`;
    });
}

function initAdgroupSelect() {
    const select = document.getElementById('adgroupSelect');
    const campaignId = document.getElementById('campaignSelect')?.value;
    if (!select || !adsData) return;
    
    let adgroups = adsData.adgroups || [];
    
    if (campaignId) {
        adgroups = adgroups.filter(ag => ag.nccCampaignId === campaignId);
    }
    
    select.innerHTML = '<option value="">전체 광고그룹</option>';
    adgroups.forEach(adgroup => {
        const name = adgroup.name || adgroup.nccAdgroupId;
        select.innerHTML += `<option value="${adgroup.nccAdgroupId}">${name}</option>`;
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
    const summary = adsData.summary || {};
    
    document.getElementById('totalCampaigns').textContent = formatNumber(summary.total_campaigns || 0);
    document.getElementById('totalAdgroups').textContent = formatNumber(summary.total_adgroups || 0);
    document.getElementById('totalKeywords').textContent = formatNumber(summary.total_keywords || 0);
    document.getElementById('activeKeywords').textContent = formatNumber(summary.active_keywords || 0);
}

// ============================================
// 키워드 필터링 및 렌더링
// ============================================

function filterAndRender(searchTerm = '') {
    if (!adsData) return;
    
    const campaignId = document.getElementById('campaignSelect')?.value;
    const adgroupId = document.getElementById('adgroupSelect')?.value;
    const status = document.getElementById('statusSelect')?.value;
    const search = searchTerm || document.getElementById('keywordSearch')?.value || '';
    
    let keywords = adsData.keywords || [];
    
    if (campaignId) {
        keywords = keywords.filter(kw => {
            const adgroup = (adsData.adgroups || []).find(ag => ag.nccAdgroupId === kw.nccAdgroupId);
            return adgroup && adgroup.nccCampaignId === campaignId;
        });
    }
    
    if (adgroupId) {
        keywords = keywords.filter(kw => kw.nccAdgroupId === adgroupId);
    }
    
    if (status === 'active') {
        keywords = keywords.filter(kw => !kw.userLock);
    } else if (status === 'paused') {
        keywords = keywords.filter(kw => kw.userLock);
    }
    
    if (search) {
        const term = search.toLowerCase();
        keywords = keywords.filter(kw => 
            (kw.keyword || '').toLowerCase().includes(term) ||
            (kw.campaignName || '').toLowerCase().includes(term) ||
            (kw.adgroupName || '').toLowerCase().includes(term)
        );
    }
    
    keywords = sortKeywords(keywords);
    filteredKeywords = keywords;
    
    renderKeywordTable();
}

function sortKeywords(keywords) {
    return [...keywords].sort((a, b) => {
        let aVal, bVal;
        
        switch (currentSort.column) {
            case 'keyword':
            case 'campaign':
            case 'adgroup':
                const field = currentSort.column === 'keyword' ? 'keyword' : 
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
                const aStats = adsData.keyword_stats?.[a.keyword] || {};
                const bStats = adsData.keyword_stats?.[b.keyword] || {};
                aVal = (aStats.monthlyPcQcCnt || 0) + (aStats.monthlyMobileQcCnt || 0);
                bVal = (bStats.monthlyPcQcCnt || 0) + (bStats.monthlyMobileQcCnt || 0);
                break;
            
            case 'compIdx':
                const compOrder = { '높음': 3, '중간': 2, '낮음': 1, '': 0 };
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
    document.querySelectorAll('#keywordTable .sortable-header').forEach(header => {
        const icon = header.querySelector('.sort-icon');
        const column = header.dataset.sort;
        
        if (column === currentSort.column) {
            icon.textContent = currentSort.direction === 'asc' ? '↑' : '↓';
            header.classList.add('sorted');
        } else {
            icon.textContent = '↕';
            header.classList.remove('sorted');
        }
    });
}

// ============================================
// 키워드 테이블 렌더링 (CPC 정보 추가)
// ============================================

function renderKeywordTable() {
    const tbody = document.getElementById('keywordTableBody');
    if (!tbody) return;
    
    if (filteredKeywords.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center" style="padding: 40px; color: #666;">
                    키워드가 없습니다.
                </td>
            </tr>
        `;
        removeRankBidsFooter();
        return;
    }
    
    tbody.innerHTML = filteredKeywords.map(kw => {
        const keywordId = kw.nccKeywordId;
        const keyword = kw.keyword || '';
        const bidAmt = kw.bidAmt || 0;
        const isActive = !kw.userLock;
        const isSelected = selectedKeywords.has(keywordId);
        const isChanged = changedKeywords[keywordId] !== undefined;
        const newBid = changedKeywords[keywordId] || '';
        
        const stats = adsData.keyword_stats?.[keyword] || {};
        const pcVolume = stats.monthlyPcQcCnt || 0;
        const mobileVolume = stats.monthlyMobileQcCnt || 0;
        const totalVolume = pcVolume + mobileVolume;
        const compIdx = stats.compIdx || '-';
        
        let compClass = '';
        if (compIdx === '높음') compClass = 'comp-high';
        else if (compIdx === '중간') compClass = 'comp-medium';
        else if (compIdx === '낮음') compClass = 'comp-low';
        
        // 순위별 CPC 정보 가져오기
        const rankBids = adsData.keyword_rank_bids?.[keyword] || [];
        const rank1Bid = rankBids[0]?.mobileBid || 0;
        
        return `
            <tr data-keyword-id="${keywordId}" data-keyword="${escapeHtml(keyword)}">
                <td class="col-checkbox">
                    <input type="checkbox" class="keyword-checkbox" 
                           data-id="${keywordId}" ${isSelected ? 'checked' : ''}>
                </td>
                <td>
                    ${escapeHtml(keyword)}
                    ${rank1Bid > 0 ? `<span class="rank1-hint" title="1위 입찰가">(1위: ${formatNumber(rank1Bid)}원)</span>` : ''}
                </td>
                <td>${escapeHtml(kw.campaignName || '-')}</td>
                <td>${escapeHtml(kw.adgroupName || '-')}</td>
                <td class="text-right">${formatCurrency(bidAmt)}</td>
                <td class="text-right">
                    <input type="number" 
                           class="bid-input ${isChanged ? 'changed' : ''}"
                           data-id="${keywordId}"
                           data-original="${bidAmt}"
                           value="${newBid}"
                           placeholder="${formatNumber(bidAmt)}"
                           min="70" max="100000" step="10">
                </td>
                <td class="text-right">
                    ${totalVolume > 0 ? formatNumber(totalVolume) : '-'}
                    ${totalVolume > 0 ? `<span class="volume-detail">PC:${formatCompact(pcVolume)} / M:${formatCompact(mobileVolume)}</span>` : ''}
                </td>
                <td class="text-center">
                    <span class="comp-badge ${compClass}">${compIdx}</span>
                </td>
                <td class="text-center">
                    <span class="status-badge ${isActive ? 'status-active' : 'status-paused'}">
                        ${isActive ? '활성' : '중지'}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
    
    // 체크박스 이벤트
    tbody.querySelectorAll('.keyword-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const id = e.target.dataset.id;
            if (e.target.checked) {
                selectedKeywords.add(id);
            } else {
                selectedKeywords.delete(id);
            }
            updateBulkActionBar();
            updateRankBidsFooter();
        });
    });
    
    // 입찰가 입력 이벤트
    tbody.querySelectorAll('.bid-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const id = e.target.dataset.id;
            const original = parseInt(e.target.dataset.original);
            const newValue = e.target.value ? parseInt(e.target.value) : null;
            
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
    
    // 행 클릭 시 CPC 정보 표시
    tbody.querySelectorAll('tr[data-keyword]').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT') return;
            const keyword = row.dataset.keyword;
            showKeywordRankBids(keyword);
        });
    });
    
    updateSortIcons();
    updateRankBidsFooter();
}

// ============================================
// 선택된 키워드의 순위별 CPC 표시 (테이블 하단)
// ============================================

function updateRankBidsFooter() {
    removeRankBidsFooter();
    
    if (selectedKeywords.size === 0) return;
    
    // 첫 번째 선택된 키워드의 CPC 표시
    const firstSelectedId = [...selectedKeywords][0];
    const selectedKw = filteredKeywords.find(kw => kw.nccKeywordId === firstSelectedId);
    
    if (!selectedKw) return;
    
    const keyword = selectedKw.keyword;
    const rankBids = adsData.keyword_rank_bids?.[keyword] || [];
    
    if (rankBids.length === 0) return;
    
    const footer = document.createElement('div');
    footer.id = 'rankBidsFooter';
    footer.className = 'rank-bids-footer';
    
    let html = `<div class="rank-bids-title">📊 "${escapeHtml(keyword)}" 순위별 CPC 단가</div>`;
    html += '<div class="rank-bids-list">';
    
    rankBids.slice(0, 5).forEach(item => {
        const rank = item.rank;
        const pcBid = item.pcBid || 0;
        const mobileBid = item.mobileBid || 0;
        
        html += `
            <div class="rank-bid-item">
                <span class="rank-label">${rank}위</span>
                <span class="rank-pc">PC: ${formatNumber(pcBid)}원</span>
                <span class="rank-mobile">M: ${formatNumber(mobileBid)}원</span>
            </div>
        `;
    });
    
    html += '</div>';
    footer.innerHTML = html;
    
    const tableContainer = document.querySelector('#keywords .table-wrapper');
    if (tableContainer) {
        tableContainer.parentNode.insertBefore(footer, tableContainer.nextSibling);
    }
}

function removeRankBidsFooter() {
    const existing = document.getElementById('rankBidsFooter');
    if (existing) existing.remove();
}

function showKeywordRankBids(keyword) {
    const rankBids = adsData.keyword_rank_bids?.[keyword] || [];
    
    if (rankBids.length === 0) {
        console.log(`No rank bids for: ${keyword}`);
        return;
    }
    
    console.log(`Rank bids for ${keyword}:`, rankBids);
}

// ============================================
// 선택 및 일괄 작업
// ============================================

function toggleSelectAll(checked) {
    selectedKeywords.clear();
    
    if (checked) {
        filteredKeywords.forEach(kw => selectedKeywords.add(kw.nccKeywordId));
    }
    
    document.querySelectorAll('.keyword-checkbox').forEach(cb => {
        cb.checked = checked;
    });
    
    updateBulkActionBar();
    updateRankBidsFooter();
}

function updateBulkActionBar() {
    const bar = document.getElementById('bulkActionBar');
    const count = selectedKeywords.size;
    
    if (bar) {
        bar.style.display = count > 0 ? 'flex' : 'none';
        document.getElementById('selectedCount').textContent = count;
    }
    
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.checked = count > 0 && count === filteredKeywords.length;
        selectAll.indeterminate = count > 0 && count < filteredKeywords.length;
    }
}

function applyBulkBid() {
    const bidAmt = parseInt(document.getElementById('bulkBidAmt')?.value);
    if (!bidAmt || bidAmt < 70) {
        alert('최소 입찰가는 70원입니다.');
        return;
    }
    
    selectedKeywords.forEach(id => {
        changedKeywords[id] = bidAmt;
    });
    
    renderKeywordTable();
    updateSaveButton();
}

function adjustBulkBid(multiplier) {
    selectedKeywords.forEach(id => {
        const kw = filteredKeywords.find(k => k.nccKeywordId === id);
        if (kw) {
            const currentBid = changedKeywords[id] || kw.bidAmt || 0;
            const newBid = Math.round(currentBid * multiplier / 10) * 10;
            changedKeywords[id] = Math.max(70, Math.min(100000, newBid));
        }
    });
    
    renderKeywordTable();
    updateSaveButton();
}

function updateSaveButton() {
    const btn = document.getElementById('saveChangesBtn');
    if (btn) {
        const hasChanges = Object.keys(changedKeywords).length > 0;
        btn.disabled = !hasChanges;
    }
}

// ============================================
// 변경사항 저장 (모달)
// ============================================

function showConfirmModal() {
    const changeList = Object.entries(changedKeywords);
    if (changeList.length === 0) return;
    
    const confirmList = document.getElementById('confirmList');
    if (confirmList) {
        confirmList.innerHTML = changeList.map(([id, newBid]) => {
            const kw = (adsData.keywords || []).find(k => k.nccKeywordId === id);
            const keyword = kw?.keyword || id;
            const oldBid = kw?.bidAmt || 0;
            
            return `
                <div class="confirm-item">
                    <span class="confirm-keyword">${escapeHtml(keyword)}</span>
                    <div class="confirm-change">
                        <span class="old-value">${formatNumber(oldBid)}원</span>
                        <span class="arrow">→</span>
                        <span class="new-value">${formatNumber(newBid)}원</span>
                    </div>
                </div>
            `;
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
        const changes = Object.entries(changedKeywords);
        
        console.log('변경 요청:', changes);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        alert(`${changes.length}개 키워드 입찰가 변경 요청이 완료되었습니다.\n\n※ 실제 반영은 GitHub Actions 워크플로우를 통해 처리됩니다.`);
        
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
    const overlay = document.getElementById('loadingOverlay');
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
    
    const ctx = recreateCanvas('searchVolumeChartContainer', 'searchVolumeChart');
    if (!ctx) return;
    
    const keywordsWithVolume = filteredKeywords.map(kw => {
        const stats = adsData.keyword_stats?.[kw.keyword] || {};
        return {
            keyword: kw.keyword,
            pc: stats.monthlyPcQcCnt || 0,
            mobile: stats.monthlyMobileQcCnt || 0,
            total: (stats.monthlyPcQcCnt || 0) + (stats.monthlyMobileQcCnt || 0)
        };
    }).filter(k => k.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);
    
    if (keywordsWithVolume.length === 0) return;
    
    searchVolumeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: keywordsWithVolume.map(k => 
                k.keyword.length > 12 ? k.keyword.slice(0, 12) + '...' : k.keyword
            ),
            datasets: [
                {
                    label: 'PC',
                    data: keywordsWithVolume.map(k => k.pc),
                    backgroundColor: '#00d4ff',
                    borderRadius: 4
                },
                {
                    label: '모바일',
                    data: keywordsWithVolume.map(k => k.mobile),
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
                        title: (items) => keywordsWithVolume[items[0].dataIndex]?.keyword || '',
                        label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.raw)}`
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
                        callback: (v) => formatCompact(v)
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
    
    const ctx = recreateCanvas('deviceChartContainer', 'deviceChart');
    if (!ctx) return;
    
    let totalPc = 0;
    let totalMobile = 0;
    
    filteredKeywords.forEach(kw => {
        const stats = adsData.keyword_stats?.[kw.keyword] || {};
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
                        label: (ctx) => {
                            const total = totalPc + totalMobile;
                            const pct = ((ctx.raw / total) * 100).toFixed(1);
                            return `${ctx.label}: ${formatNumber(ctx.raw)} (${pct}%)`;
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
    
    const ctx = recreateCanvas('compChartContainer', 'compChart');
    if (!ctx) return;
    
    const compCounts = { '높음': 0, '중간': 0, '낮음': 0 };
    
    filteredKeywords.forEach(kw => {
        const stats = adsData.keyword_stats?.[kw.keyword] || {};
        const comp = stats.compIdx || '';
        if (compCounts[comp] !== undefined) {
            compCounts[comp]++;
        }
    });
    
    const total = compCounts['높음'] + compCounts['중간'] + compCounts['낮음'];
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
                        label: (ctx) => {
                            const pct = ((ctx.raw / total) * 100).toFixed(1);
                            return `${ctx.label}: ${ctx.raw}개 (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ============================================
// 입찰가 추천 테이블 (순위별 CPC 기반)
// ============================================

function renderBidSuggestionTable() {
    const tbody = document.getElementById('bidSuggestionTableBody');
    if (!tbody) return;
    
    const keywordsWithData = filteredKeywords.filter(kw => {
        const stats = adsData.keyword_stats?.[kw.keyword] || {};
        const rankBids = adsData.keyword_rank_bids?.[kw.keyword] || [];
        return (stats.monthlyPcQcCnt || 0) + (stats.monthlyMobileQcCnt || 0) > 0 || rankBids.length > 0;
    }).sort((a, b) => {
        const aStats = adsData.keyword_stats?.[a.keyword] || {};
        const bStats = adsData.keyword_stats?.[b.keyword] || {};
        const aVol = (aStats.monthlyPcQcCnt || 0) + (aStats.monthlyMobileQcCnt || 0);
        const bVol = (bStats.monthlyPcQcCnt || 0) + (bStats.monthlyMobileQcCnt || 0);
        return bVol - aVol;
    });
    
    if (keywordsWithData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center" style="padding: 40px; color: #666;">
                    데이터가 있는 키워드가 없습니다.
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = keywordsWithData.map(kw => {
        const stats = adsData.keyword_stats?.[kw.keyword] || {};
        const totalVolume = (stats.monthlyPcQcCnt || 0) + (stats.monthlyMobileQcCnt || 0);
        const compIdx = stats.compIdx || '-';
        const bidAmt = kw.bidAmt || 0;
        
        // 순위별 CPC
        const rankBids = adsData.keyword_rank_bids?.[kw.keyword] || [];
        
        let compClass = '';
        if (compIdx === '높음') compClass = 'comp-high';
        else if (compIdx === '중간') compClass = 'comp-medium';
        else if (compIdx === '낮음') compClass = 'comp-low';
        
        // 순위별 CPC 정보 생성
        let rankBidsHtml = '';
        if (rankBids.length > 0) {
            rankBidsHtml = '<div class="rank-bids-inline">';
            rankBids.slice(0, 5).forEach(item => {
                const mobileBid = item.mobileBid || 0;
                rankBidsHtml += `<span class="rank-bid-chip">${item.rank}위: ${formatNumber(mobileBid)}원</span>`;
            });
            rankBidsHtml += '</div>';
        } else {
            rankBidsHtml = '<span style="color: #666;">-</span>';
        }
        
        // 추천 입찰가 (3위 기준)
        const rank3Bid = rankBids[2]?.mobileBid || 0;
        let recommendation = '';
        let recommendedBid = bidAmt;
        
        if (rank3Bid > 0) {
            if (bidAmt < rank3Bid * 0.8) {
                recommendation = '입찰가 상향 권장';
                recommendedBid = rank3Bid;
            } else if (bidAmt > rank3Bid * 1.5) {
                recommendation = '입찰가 하향 가능';
                recommendedBid = Math.round(rank3Bid * 1.2);
            } else {
                recommendation = '적정';
            }
        }
        
        return `
            <tr>
                <td>${escapeHtml(kw.keyword)}</td>
                <td class="text-right">${formatCurrency(bidAmt)}</td>
                <td class="text-right">${totalVolume > 0 ? formatNumber(totalVolume) : '-'}</td>
                <td class="text-center">
                    <span class="comp-badge ${compClass}">${compIdx}</span>
                </td>
                <td>${rankBidsHtml}</td>
                <td class="text-right">${rank3Bid > 0 ? formatCurrency(recommendedBid) : '-'}</td>
                <td class="text-center">
                    <span class="recommendation ${recommendation === '적정' ? '' : 'highlight'}">${recommendation || '-'}</span>
                </td>
            </tr>
        `;
    }).join('');
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
    if (value >= 10000) {
        return (value / 10000).toFixed(1) + '만';
    } else if (value >= 1000) {
        return (value / 1000).toFixed(1) + '천';
    }
    return value.toString();
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
