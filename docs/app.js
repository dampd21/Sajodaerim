let reportData = null;
let charts = {};
let currentStore = '';
let currentPeriod = '';
let filteredPriceData = [];
let currentDailyDetails = [];

// Zoom/Pan 옵션
const zoomOptions = {
    pan: {
        enabled: true,
        mode: 'x',
    },
    zoom: {
        wheel: {
            enabled: true,
        },
        pinch: {
            enabled: true
        },
        mode: 'x',
    },
    limits: {
        x: { minRange: 3 }
    }
};

// ============================================
// Canvas 재생성 함수 (차트 증식 방지)
// ============================================
function recreateCanvas(containerId, canvasId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error('Container not found:', containerId);
        return null;
    }
    
    const oldCanvas = document.getElementById(canvasId);
    if (oldCanvas) {
        oldCanvas.remove();
    }
    
    const newCanvas = document.createElement('canvas');
    newCanvas.id = canvasId;
    container.appendChild(newCanvas);
    
    return newCanvas.getContext('2d');
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
    if (value >= 100000000) {
        return (value / 100000000).toFixed(1) + '억';
    } else if (value >= 10000) {
        return (value / 10000).toFixed(0) + '만';
    }
    return value.toLocaleString();
}

function formatDateKorean(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[0]}년 ${parseInt(parts[1])}월 ${parseInt(parts[2])}일`;
}

function formatDateShort(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

function getMonthKey(dateStr) {
    if (!dateStr || dateStr.length < 7) return '';
    return dateStr.substring(0, 7);
}

function formatMonthKorean(monthKey) {
    if (!monthKey) return '';
    const parts = monthKey.split('-');
    if (parts.length !== 2) return monthKey;
    return `${parts[0]}년 ${parseInt(parts[1])}월`;
}

function round(num, decimals) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// ============================================
// 데이터 로드
// ============================================
async function loadData() {
    try {
        const response = await fetch('report_data.json?t=' + Date.now());
        if (!response.ok) throw new Error('Data load failed');
        reportData = await response.json();
        
        console.log('=== Data Loaded ===');
        console.log('Records:', reportData.summary?.total_records);
        console.log('Stores:', reportData.store_list?.length);
        
        initDashboard();
    } catch (error) {
        console.error('Error:', error);
        document.querySelector('.tab-content').innerHTML = 
            '<div class="no-data">데이터를 불러올 수 없습니다.</div>';
    }
}

// ============================================
// 대시보드 초기화
// ============================================
function initDashboard() {
    if (!reportData) return;
    
    document.getElementById('updateTime').textContent = 
        '마지막 업데이트: ' + new Date(reportData.generated_at).toLocaleString('ko-KR');
    
    initStoreSelect();
    initPeriodSelect();
    initTabs();
    initFilters();
    initModal();
    initDailyDetailModal();
    initZoomResetButtons();
    
    // 기본값: 최근 1달 설정
    setDefaultPeriod();
    
    updateDashboard();
}

// 기본 기간 설정 (최근 1달)
function setDefaultPeriod() {
    const select = document.getElementById('periodSelect');
    if (!select) return;
    
    const options = select.querySelectorAll('option');
    if (options.length > 1) {
        const latestMonth = options[1]?.value;
        if (latestMonth) {
            select.value = latestMonth;
            currentPeriod = latestMonth;
        }
    }
}

function initZoomResetButtons() {
    document.getElementById('resetDailyZoom')?.addEventListener('click', () => {
        if (charts.dailySales) charts.dailySales.resetZoom();
    });
    
    document.getElementById('resetModalZoom')?.addEventListener('click', () => {
        if (charts.priceHistory) charts.priceHistory.resetZoom();
    });
}

// ============================================
// 지점 선택 초기화
// ============================================
function initStoreSelect() {
    const select = document.getElementById('storeSelect');
    if (!select) return;
    
    let storeList = reportData.store_list || [];
    if (storeList.length === 0 && reportData.stores) {
        storeList = reportData.stores.map(s => s.name);
    }
    if (storeList.length === 0 && reportData.store_price_changes) {
        storeList = Object.keys(reportData.store_price_changes);
    }
    
    storeList = [...new Set(storeList)].sort();
    
    select.innerHTML = '<option value="">전체 지점</option>';
    storeList.forEach(store => {
        const option = document.createElement('option');
        option.value = store;
        option.textContent = store;
        select.appendChild(option);
    });
    
    select.addEventListener('change', () => {
        currentStore = select.value;
        updatePeriodSelect();
        updateDashboard();
    });
}

// ============================================
// 기간 선택 초기화
// ============================================
function initPeriodSelect() {
    updatePeriodSelect();
    
    document.getElementById('periodSelect')?.addEventListener('change', (e) => {
        currentPeriod = e.target.value;
        updateDashboard();
    });
}

function updatePeriodSelect() {
    const select = document.getElementById('periodSelect');
    if (!select) return;
    
    const months = new Set();
    
    let dailyData = {};
    if (currentStore && reportData.store_details?.[currentStore]?.daily) {
        dailyData = reportData.store_details[currentStore].daily;
    } else if (!currentStore) {
        dailyData = reportData.daily || {};
    }
    
    Object.keys(dailyData).forEach(date => {
        const monthKey = getMonthKey(date);
        if (monthKey) months.add(monthKey);
    });
    
    const sortedMonths = Array.from(months).sort().reverse();
    
    select.innerHTML = '<option value="">전체 기간</option>';
    sortedMonths.forEach(month => {
        const option = document.createElement('option');
        option.value = month;
        option.textContent = formatMonthKorean(month);
        select.appendChild(option);
    });
    
    if (sortedMonths.length > 0 && !currentPeriod) {
        currentPeriod = sortedMonths[0];
        select.value = currentPeriod;
    }
}

// ============================================
// 대시보드 업데이트
// ============================================
function updateDashboard() {
    updateSummary();
    updateSalesTab();
    updatePricesTab();
}

// ============================================
// 필터된 데이터 가져오기
// ============================================
function getFilteredDailyData() {
    let dailyData = {};
    
    if (currentStore) {
        if (reportData.store_details?.[currentStore]?.daily) {
            dailyData = JSON.parse(JSON.stringify(reportData.store_details[currentStore].daily));
        } else {
            dailyData = {};
        }
    } else {
        dailyData = JSON.parse(JSON.stringify(reportData.daily || {}));
    }
    
    if (currentPeriod && Object.keys(dailyData).length > 0) {
        const filtered = {};
        Object.keys(dailyData).forEach(date => {
            if (date.startsWith(currentPeriod)) {
                filtered[date] = dailyData[date];
            }
        });
        return filtered;
    }
    
    return dailyData;
}

function getFilteredPriceData() {
    let priceData = [];
    
    if (currentStore) {
        if (reportData.store_price_changes?.[currentStore]) {
            priceData = JSON.parse(JSON.stringify(reportData.store_price_changes[currentStore]));
        } else {
            priceData = [];
        }
    } else {
        priceData = JSON.parse(JSON.stringify(reportData.price_changes || []));
    }
    
    if (currentPeriod && priceData.length > 0) {
        priceData = priceData.map(item => {
            const filteredHistory = (item.history || []).filter(h => 
                h.date && h.date.startsWith(currentPeriod)
            );
            
            if (filteredHistory.length === 0) return null;
            
            const prices = filteredHistory.map(h => h.price).filter(p => p > 0);
            if (prices.length === 0) return null;
            
            const firstPrice = prices[0];
            const lastPrice = prices[prices.length - 1];
            const change = lastPrice - firstPrice;
            const changePct = firstPrice > 0 ? round((change / firstPrice) * 100, 2) : 0;
            
            return {
                ...item,
                first_price: firstPrice,
                last_price: lastPrice,
                min_price: Math.min(...prices),
                max_price: Math.max(...prices),
                change: change,
                change_pct: changePct,
                history: filteredHistory,
                count: filteredHistory.length,
                first_date: filteredHistory[0].date,
                last_date: filteredHistory[filteredHistory.length - 1].date
            };
        }).filter(item => item !== null);
    }
    
    filteredPriceData = priceData;
    return priceData;
}

// ============================================
// 요약 카드 업데이트
// ============================================
function updateSummary() {
    const dailyData = getFilteredDailyData();
    const priceData = getFilteredPriceData();
    
    let totalCount = 0;
    let totalSales = 0;
    
    Object.values(dailyData).forEach(d => {
        totalCount += d.count || 0;
        totalSales += d.total || 0;
    });
    
    const productSet = new Set(priceData.map(p => p.code));
    
    document.getElementById('totalCount').textContent = formatNumber(totalCount);
    document.getElementById('totalSales').textContent = formatCurrency(totalSales);
    document.getElementById('totalProducts').textContent = formatNumber(productSet.size);
}

// ============================================
// 매출 탭 업데이트
// ============================================
function updateSalesTab() {
    const dailyData = getFilteredDailyData();
    updateSalesCharts(dailyData);
    updateSalesTable(dailyData);
}

// ============================================
// 차트 업데이트 (Canvas 재생성 방식)
// ============================================
function updateSalesCharts(dailyData) {
    // 1. 기존 차트 파괴
    if (charts.dailySales) {
        charts.dailySales.destroy();
        charts.dailySales = null;
    }
    if (charts.categorySales) {
        charts.categorySales.destroy();
        charts.categorySales = null;
    }
    if (charts.topProducts) {
        charts.topProducts.destroy();
        charts.topProducts = null;
    }
    
    const dates = Object.keys(dailyData).sort();
    const totals = dates.map(d => dailyData[d]?.total || 0);
    const counts = dates.map(d => dailyData[d]?.count || 0);
    
    // 2. 발주 현황 그래프 (Canvas 재생성!)
    const dailyCtx = recreateCanvas('dailySalesChartContainer', 'dailySalesChart');
    if (dailyCtx && dates.length > 0) {
        charts.dailySales = new Chart(dailyCtx, {
            type: 'bar',
            data: {
                labels: dates.map(d => formatDateShort(d)),
                datasets: [{
                    label: '발주 금액',
                    data: totals,
                    backgroundColor: '#00d4ff',
                    borderRadius: {
                        topLeft: 4,
                        topRight: 4,
                        bottomLeft: 0,
                        bottomRight: 0
                    },
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { 
                    legend: { display: false },
                    zoom: zoomOptions,
                    tooltip: {
                        callbacks: {
                            title: (items) => formatDateKorean(dates[items[0].dataIndex]),
                            label: (ctx) => `발주 금액: ${formatCurrency(ctx.parsed.y)}`,
                            afterLabel: (ctx) => {
                                const idx = ctx.dataIndex;
                                return `발주 수량: ${formatNumber(counts[idx])}건`;
                            }
                        }
                    }
                },
                scales: {
                    x: { 
                        ticks: { 
                            color: '#888', 
                            maxRotation: 45,
                            font: { size: 11 }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: { 
                        ticks: { 
                            color: '#888', 
                            callback: v => formatCompact(v) 
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const date = dates[index];
                        showDailyDetailModal(date);
                    }
                }
            }
        });
    }
    
    // 3. 대분류별 차트 (Canvas 재생성!)
    const categories = reportData.categories || [];
    const categoryCtx = recreateCanvas('categorySalesChartContainer', 'categorySalesChart');
    if (categoryCtx && categories.length > 0) {
        charts.categorySales = new Chart(categoryCtx, {
            type: 'doughnut',
            data: {
                labels: categories.map(c => c.name),
                datasets: [{
                    data: categories.map(c => c.total),
                    backgroundColor: [
                        '#00d4ff', '#7b2cbf', '#ff6b6b', '#51cf66', 
                        '#ffd43b', '#ff922b', '#845ef7', '#20c997'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'right',
                        labels: { color: '#fff', font: { size: 11 } }
                    }
                }
            }
        });
    }
    
    // 4. 상위 품목 차트 (Canvas 재생성!)
    const priceData = getFilteredPriceData();
    const topProducts = priceData
        .filter(p => p.last_price > 0)
        .map(p => ({ name: p.name, total: p.last_price * (p.count || 1) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);
    
    const productsCtx = recreateCanvas('topProductsChartContainer', 'topProductsChart');
    if (productsCtx && topProducts.length > 0) {
        charts.topProducts = new Chart(productsCtx, {
            type: 'bar',
            data: {
                labels: topProducts.map(p => p.name.length > 15 ? p.name.slice(0, 15) + '...' : p.name),
                datasets: [{
                    label: '금액',
                    data: topProducts.map(p => p.total),
                    backgroundColor: 'rgba(123, 44, 191, 0.7)',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { 
                        ticks: { color: '#888', callback: v => formatCompact(v) },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: { 
                        ticks: { color: '#888', font: { size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }
}

// ============================================
// 매출 테이블 업데이트
// ============================================
function updateSalesTable(dailyData) {
    const tbody = document.querySelector('#salesTable tbody');
    if (!tbody) return;
    
    const dates = Object.keys(dailyData).sort().reverse();
    
    if (dates.length === 0) {
        let msg = '데이터가 없습니다.';
        if (currentStore) {
            msg = `"${currentStore}" 지점의 발주 데이터가 없습니다.`;
        }
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#666;padding:40px;">${msg}</td></tr>`;
        return;
    }
    
    tbody.innerHTML = dates.map(date => {
        const data = dailyData[date];
        return `
            <tr class="clickable" data-date="${date}">
                <td>${formatDateKorean(date)}</td>
                <td>${formatNumber(data.items || '-')}</td>
                <td>${formatNumber(data.count)}</td>
                <td>${formatCurrency(data.total)}</td>
            </tr>
        `;
    }).join('');
    
    tbody.querySelectorAll('tr.clickable').forEach(row => {
        row.addEventListener('click', () => {
            const date = row.dataset.date;
            showDailyDetailModal(date);
        });
    });
}

// ============================================
// 일별 상세 모달
// ============================================
function initDailyDetailModal() {
    const modal = document.getElementById('dailyDetailModal');
    const closeBtn = modal?.querySelector('.modal-close');
    
    closeBtn?.addEventListener('click', () => modal.classList.remove('show'));
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
    });
    
    document.getElementById('dailySearch')?.addEventListener('input', (e) => {
        filterAndRenderDailyDetails();
    });
    
    document.getElementById('dailySort')?.addEventListener('change', (e) => {
        filterAndRenderDailyDetails();
    });
}

function showDailyDetailModal(date) {
    const modal = document.getElementById('dailyDetailModal');
    if (!modal) return;
    
    document.getElementById('dailyDetailTitle').textContent = formatDateKorean(date) + ' 상세 내역';
    
    let details = [];
    
    if (currentStore) {
        if (reportData.daily_details?.[date]) {
            details = reportData.daily_details[date].filter(item => 
                item.store === currentStore
            );
        }
    } else {
        details = reportData.daily_details?.[date] || [];
    }
    
    currentDailyDetails = details;
    
    const totalItems = details.length;
    const totalQty = details.reduce((sum, item) => sum + (parseInt(item.qty) || 0), 0);
    const totalAmount = details.reduce((sum, item) => sum + (parseInt(item.total) || 0), 0);
    const storeCount = new Set(details.map(item => item.store)).size;
    
    document.getElementById('dailySummary').innerHTML = `
        <div class="summary-item">
            <span class="summary-label">지점수</span>
            <span class="summary-value">${formatNumber(storeCount)}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">품목수</span>
            <span class="summary-value">${formatNumber(totalItems)}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">총 수량</span>
            <span class="summary-value">${formatNumber(totalQty)}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">총 금액</span>
            <span class="summary-value">${formatCurrency(totalAmount)}</span>
        </div>
    `;
    
    const searchInput = document.getElementById('dailySearch');
    if (searchInput) searchInput.value = '';
    
    filterAndRenderDailyDetails();
    
    modal.classList.add('show');
}

function filterAndRenderDailyDetails() {
    const query = document.getElementById('dailySearch')?.value.toLowerCase() || '';
    const sortType = document.getElementById('dailySort')?.value || 'store';
    
    let filtered = currentDailyDetails;
    
    if (query) {
        filtered = filtered.filter(item => 
            (item.store || '').toLowerCase().includes(query) ||
            (item.product || '').toLowerCase().includes(query) ||
            (item.category || '').toLowerCase().includes(query)
        );
    }
    
    filtered = [...filtered];
    switch (sortType) {
        case 'store':
            filtered.sort((a, b) => (a.store || '').localeCompare(b.store || ''));
            break;
        case 'product':
            filtered.sort((a, b) => (a.product || '').localeCompare(b.product || ''));
            break;
        case 'total_desc':
            filtered.sort((a, b) => (parseInt(b.total) || 0) - (parseInt(a.total) || 0));
            break;
        case 'total_asc':
            filtered.sort((a, b) => (parseInt(a.total) || 0) - (parseInt(b.total) || 0));
            break;
        case 'qty_desc':
            filtered.sort((a, b) => (parseInt(b.qty) || 0) - (parseInt(a.qty) || 0));
            break;
    }
    
    renderDailyDetailsTable(filtered);
}

function renderDailyDetailsTable(details) {
    const tbody = document.querySelector('#dailyDetailTable tbody');
    if (!tbody) return;
    
    if (!details || details.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#666;padding:40px;">데이터가 없습니다.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = details.map(item => `
        <tr>
            <td>${item.store || '-'}</td>
            <td>
                ${item.product || '-'}
                <span class="category-tag">${item.category || ''}</span>
            </td>
            <td>${item.spec || '-'}</td>
            <td>${formatNumber(item.qty)}</td>
            <td>${formatCurrency(item.price)}</td>
            <td>${formatCurrency(item.total)}</td>
        </tr>
    `).join('');
}

// ============================================
// 가격 탭 업데이트
// ============================================
function updatePricesTab() {
    const priceData = getFilteredPriceData();
    
    const upCount = priceData.filter(p => p.change > 0).length;
    const downCount = priceData.filter(p => p.change < 0).length;
    const neutralCount = priceData.filter(p => p.change === 0).length;
    
    document.getElementById('totalPriceItems').textContent = formatNumber(priceData.length);
    document.getElementById('priceUpCount').textContent = formatNumber(upCount);
    document.getElementById('priceDownCount').textContent = formatNumber(downCount);
    document.getElementById('priceNeutralCount').textContent = formatNumber(neutralCount);
    
    const searchInput = document.getElementById('priceSearch');
    if (searchInput) searchInput.value = '';
    
    const sortType = document.getElementById('priceSort')?.value || 'change_desc';
    const sortedData = applySortToPrice(priceData, sortType);
    renderPriceCards(sortedData);
}

function renderPriceCards(priceData) {
    const container = document.getElementById('priceCards');
    if (!container) return;
    
    if (!priceData || priceData.length === 0) {
        let message = '가격 변동 데이터가 없습니다.';
        if (currentStore) {
            message = `"${currentStore}" 지점의 가격 변동 데이터가 없습니다.`;
        }
        container.innerHTML = `<div class="no-data">${message}</div>`;
        return;
    }
    
    container.innerHTML = priceData.map((item, index) => {
        const change = item.change || 0;
        const changePct = item.change_pct || 0;
        const changeClass = change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
        
        let changeDisplay = '';
        if (change > 0) {
            changeDisplay = `▲${formatNumber(change)} (+${changePct}%)`;
        } else if (change < 0) {
            changeDisplay = `▼${formatNumber(Math.abs(change))} (${changePct}%)`;
        } else {
            changeDisplay = '변동없음';
        }
        
        const shortDate = (dateStr) => {
            if (!dateStr) return '';
            return dateStr.replace(/-/g, '.');
        };
        
        return `
            <div class="price-card" data-index="${index}">
                <div class="price-card-header">
                    <div class="price-card-name">${item.name || ''}</div>
                    <div class="price-card-category">${item.category || ''}</div>
                </div>
                <div class="price-card-body">
                    <div class="price-range">
                        ${formatNumber(item.first_price)}원 → ${formatNumber(item.last_price)}원
                    </div>
                    <div class="price-change ${changeClass}">
                        ${changeDisplay}
                    </div>
                </div>
                <div class="price-card-footer">
                    <span>${shortDate(item.first_date)} ~ ${shortDate(item.last_date)}</span>
                    <span>(${item.count || 0}건)</span>
                </div>
            </div>
        `;
    }).join('');
    
    container.querySelectorAll('.price-card').forEach(card => {
        card.addEventListener('click', () => {
            const index = parseInt(card.dataset.index);
            const currentData = getCurrentPriceData();
            if (currentData[index]) {
                showPriceModal(currentData[index]);
            }
        });
    });
}

function getCurrentPriceData() {
    const query = document.getElementById('priceSearch')?.value.toLowerCase() || '';
    const sortType = document.getElementById('priceSort')?.value || 'change_desc';
    
    let data = getFilteredPriceData();
    
    if (query) {
        data = data.filter(item => 
            (item.name || '').toLowerCase().includes(query) || 
            (item.code || '').toLowerCase().includes(query)
        );
    }
    
    return applySortToPrice(data, sortType);
}

// ============================================
// 탭 초기화
// ============================================
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            
            tab.classList.add('active');
            const pane = document.getElementById(tab.dataset.tab);
            if (pane) pane.classList.add('active');
        });
    });
}

// ============================================
// 필터 초기화
// ============================================
function initFilters() {
    document.getElementById('priceSearch')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        let data = getFilteredPriceData();
        
        if (query) {
            data = data.filter(item => 
                (item.name || '').toLowerCase().includes(query) || 
                (item.code || '').toLowerCase().includes(query)
            );
        }
        
        const sortType = document.getElementById('priceSort')?.value || 'change_desc';
        renderPriceCards(applySortToPrice(data, sortType));
    });
    
    document.getElementById('priceSort')?.addEventListener('change', (e) => {
        const query = document.getElementById('priceSearch')?.value.toLowerCase() || '';
        let data = getFilteredPriceData();
        
        if (query) {
            data = data.filter(item => 
                (item.name || '').toLowerCase().includes(query) || 
                (item.code || '').toLowerCase().includes(query)
            );
        }
        
        renderPriceCards(applySortToPrice(data, e.target.value));
    });
}

function applySortToPrice(data, sortType) {
    if (!data || data.length === 0) return [];
    
    let sorted = [...data];
    
    switch (sortType) {
        case 'change_desc':
            sorted.sort((a, b) => Math.abs(b.change_pct || 0) - Math.abs(a.change_pct || 0));
            break;
        case 'change_asc':
            sorted.sort((a, b) => Math.abs(a.change_pct || 0) - Math.abs(b.change_pct || 0));
            break;
        case 'up_only':
            sorted = sorted.filter(item => (item.change || 0) > 0);
            sorted.sort((a, b) => (b.change_pct || 0) - (a.change_pct || 0));
            break;
        case 'down_only':
            sorted = sorted.filter(item => (item.change || 0) < 0);
            sorted.sort((a, b) => (a.change_pct || 0) - (b.change_pct || 0));
            break;
        case 'price_desc':
            sorted.sort((a, b) => (b.last_price || 0) - (a.last_price || 0));
            break;
        case 'name_asc':
            sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            break;
    }
    
    return sorted;
}

// ============================================
// 모달 초기화
// ============================================
function initModal() {
    const modal = document.getElementById('priceModal');
    const closeBtn = modal?.querySelector('.modal-close');
    
    closeBtn?.addEventListener('click', () => modal.classList.remove('show'));
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('priceModal')?.classList.remove('show');
            document.getElementById('dailyDetailModal')?.classList.remove('show');
        }
    });
}

// ============================================
// 가격 모달 표시
// ============================================
function showPriceModal(item) {
    if (!item) return;
    
    const modal = document.getElementById('priceModal');
    if (!modal) return;
    
    document.getElementById('modalTitle').textContent = item.name || '';
    
    // Canvas 재생성으로 차트 증식 방지
    const ctx = recreateCanvas('priceHistoryChartContainer', 'priceHistoryChart');
    if (ctx) {
        if (charts.priceHistory) {
            charts.priceHistory.destroy();
            charts.priceHistory = null;
        }
        
        const history = item.history || [];
        
        if (history.length > 0) {
            charts.priceHistory = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: history.map(h => {
                        const parts = (h.date || '').split('-');
                        return parts.length === 3 ? `${parts[1]}/${parts[2]}` : '';
                    }),
                    datasets: [{
                        label: '단가',
                        data: history.map(h => h.price || 0),
                        borderColor: '#00d4ff',
                        backgroundColor: 'rgba(0, 212, 255, 0.1)',
                        fill: true,
                        tension: 0,
                        pointRadius: 5,
                        pointHoverRadius: 8,
                        pointBackgroundColor: '#00d4ff',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: false },
                        zoom: zoomOptions,
                        tooltip: {
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            padding: 12,
                            callbacks: {
                                title: (items) => formatDateKorean(history[items[0].dataIndex]?.date),
                                label: (ctx) => '단가: ' + formatNumber(ctx.parsed.y) + '원',
                                afterLabel: (ctx) => {
                                    const idx = ctx.dataIndex;
                                    if (idx > 0) {
                                        const diff = history[idx].price - history[idx-1].price;
                                        if (diff !== 0) {
                                            const arrow = diff > 0 ? '▲' : '▼';
                                            return `변동: ${arrow}${formatNumber(Math.abs(diff))}원`;
                                        }
                                    }
                                    return '';
                                }
                            }
                        }
                    },
                    scales: {
                        x: { 
                            ticks: { color: '#888' },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        y: { 
                            ticks: { color: '#888', callback: v => formatNumber(v) },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        }
                    }
                }
            });
        }
    }
    
    const change = item.change || 0;
    const changePct = item.change_pct || 0;
    const changeClass = change > 0 ? 'change-positive' : change < 0 ? 'change-negative' : '';
    
    let changeAmountDisplay = '';
    if (change > 0) {
        changeAmountDisplay = `▲${formatNumber(change)}원`;
    } else if (change < 0) {
        changeAmountDisplay = `▼${formatNumber(Math.abs(change))}원`;
    } else {
        changeAmountDisplay = '0원';
    }
    
    let changePctDisplay = '';
    if (changePct > 0) {
        changePctDisplay = `+${changePct}%`;
    } else if (changePct < 0) {
        changePctDisplay = `${changePct}%`;
    } else {
        changePctDisplay = '0%';
    }
    
    document.getElementById('priceDetails').innerHTML = `
        <div class="detail-item">
            <div class="detail-label">상품코드</div>
            <div class="detail-value">${item.code || '-'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">대분류</div>
            <div class="detail-value">${item.category || '-'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">시작가</div>
            <div class="detail-value">${formatNumber(item.first_price)}원</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">현재가</div>
            <div class="detail-value">${formatNumber(item.last_price)}원</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">최저가</div>
            <div class="detail-value">${formatNumber(item.min_price)}원</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">최고가</div>
            <div class="detail-value">${formatNumber(item.max_price)}원</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">변동액</div>
            <div class="detail-value ${changeClass}">${changeAmountDisplay}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">변동률</div>
            <div class="detail-value ${changeClass}">${changePctDisplay}</div>
        </div>
    `;
    
    const history = item.history || [];
    document.getElementById('priceHistoryTable').innerHTML = history.length > 0 ? `
        <h4>가격 변동 내역</h4>
        <table>
            <thead>
                <tr><th>날짜</th><th>단가</th><th>변동</th></tr>
            </thead>
            <tbody>
                ${history.map((h, i) => {
                    const prevPrice = i > 0 ? history[i-1].price : h.price;
                    const diff = (h.price || 0) - (prevPrice || 0);
                    const diffClass = diff > 0 ? 'change-positive' : diff < 0 ? 'change-negative' : '';
                    
                    let diffDisplay = '-';
                    if (i > 0) {
                        if (diff > 0) {
                            diffDisplay = `▲${formatNumber(diff)}원`;
                        } else if (diff < 0) {
                            diffDisplay = `▼${formatNumber(Math.abs(diff))}원`;
                        } else {
                            diffDisplay = '0원';
                        }
                    }
                    
                    return `
                        <tr>
                            <td>${formatDateKorean(h.date)}</td>
                            <td>${formatNumber(h.price)}원</td>
                            <td class="${diffClass}">${diffDisplay}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    ` : '';
    
    modal.classList.add('show');
}

// ============================================
// 앱 시작
// ============================================
document.addEventListener('DOMContentLoaded', loadData);
