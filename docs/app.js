let reportData = null;
let charts = {};
let currentStore = '';
let currentPeriod = '';
let filteredPriceData = [];

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

// 유틸리티 함수
function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return new Intl.NumberFormat('ko-KR').format(num);
}

function formatCurrency(num) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return new Intl.NumberFormat('ko-KR').format(num) + '원';
}

function formatDateKorean(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[0]}년 ${parseInt(parts[1])}월 ${parseInt(parts[2])}일`;
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

// 데이터 로드
async function loadData() {
    try {
        const response = await fetch('report_data.json?t=' + Date.now());
        if (!response.ok) throw new Error('Data load failed');
        reportData = await response.json();
        
        console.log('=== Data Loaded ===');
        console.log('Records:', reportData.summary?.total_records);
        console.log('Stores:', reportData.store_list?.length);
        console.log('Store price changes:', Object.keys(reportData.store_price_changes || {}).length);
        
        initDashboard();
    } catch (error) {
        console.error('Error:', error);
        document.querySelector('.tab-content').innerHTML = 
            '<div class="no-data">데이터를 불러올 수 없습니다.</div>';
    }
}

// 대시보드 초기화
function initDashboard() {
    if (!reportData) return;
    
    document.getElementById('updateTime').textContent = 
        '마지막 업데이트: ' + new Date(reportData.generated_at).toLocaleString('ko-KR');
    
    initStoreSelect();
    initPeriodSelect();
    initTabs();
    initFilters();
    initModal();
    initZoomResetButtons();
    
    updateDashboard();
}

function initZoomResetButtons() {
    document.getElementById('resetDailyZoom')?.addEventListener('click', () => {
        if (charts.dailySales) charts.dailySales.resetZoom();
    });
    
    document.getElementById('resetModalZoom')?.addEventListener('click', () => {
        if (charts.priceHistory) charts.priceHistory.resetZoom();
    });
}

// 지점 선택 초기화
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
        console.log('=== Store Changed ===');
        console.log('Selected:', currentStore || '(전체)');
        
        updatePeriodSelect();
        updateDashboard();
    });
}

// 기간 선택 초기화
function initPeriodSelect() {
    updatePeriodSelect();
    
    document.getElementById('periodSelect')?.addEventListener('change', (e) => {
        currentPeriod = e.target.value;
        console.log('=== Period Changed ===');
        console.log('Selected:', currentPeriod || '(전체)');
        
        updateDashboard();
    });
}

// 기간 드롭다운 업데이트
function updatePeriodSelect() {
    const select = document.getElementById('periodSelect');
    if (!select) return;
    
    const months = new Set();
    
    // 지점이 선택된 경우 해당 지점의 날짜만, 아니면 전체
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
    
    currentPeriod = '';
}

// 대시보드 업데이트
function updateDashboard() {
    console.log('=== Update Dashboard ===');
    console.log('Store:', currentStore || '(전체)');
    console.log('Period:', currentPeriod || '(전체)');
    
    updateSummary();
    updateSalesTab();
    updatePricesTab();
}

// 필터된 일별 데이터 가져오기
function getFilteredDailyData() {
    let dailyData = {};
    
    // 지점이 선택된 경우
    if (currentStore) {
        // 해당 지점 데이터가 있으면 사용
        if (reportData.store_details?.[currentStore]?.daily) {
            dailyData = JSON.parse(JSON.stringify(reportData.store_details[currentStore].daily));
            console.log('Daily: Using store data for', currentStore, '-', Object.keys(dailyData).length, 'days');
        } else {
            // 지점 데이터가 없으면 빈 객체 (전체 데이터 사용하지 않음)
            console.log('Daily: No store data for', currentStore);
            dailyData = {};
        }
    } else {
        // 지점 미선택 = 전체 데이터
        dailyData = JSON.parse(JSON.stringify(reportData.daily || {}));
        console.log('Daily: Using all data -', Object.keys(dailyData).length, 'days');
    }
    
    // 기간 필터링
    if (currentPeriod && Object.keys(dailyData).length > 0) {
        const filtered = {};
        Object.keys(dailyData).forEach(date => {
            if (date.startsWith(currentPeriod)) {
                filtered[date] = dailyData[date];
            }
        });
        console.log('Daily: Filtered by period -', Object.keys(filtered).length, 'days');
        return filtered;
    }
    
    return dailyData;
}

// 필터된 가격 데이터 가져오기
function getFilteredPriceData() {
    let priceData = [];
    
    // 지점이 선택된 경우
    if (currentStore) {
        // 해당 지점 데이터가 있으면 사용
        if (reportData.store_price_changes?.[currentStore]) {
            priceData = JSON.parse(JSON.stringify(reportData.store_price_changes[currentStore]));
            console.log('Price: Using store data for', currentStore, '-', priceData.length, 'items');
        } else {
            // 지점 데이터가 없으면 빈 배열 (전체 데이터 사용하지 않음)
            console.log('Price: No store data for', currentStore);
            priceData = [];
        }
    } else {
        // 지점 미선택 = 전체 데이터
        priceData = JSON.parse(JSON.stringify(reportData.price_changes || []));
        console.log('Price: Using all data -', priceData.length, 'items');
    }
    
    // 기간 필터링
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
        
        console.log('Price: Filtered by period -', priceData.length, 'items');
    }
    
    filteredPriceData = priceData;
    return priceData;
}

// 요약 카드 업데이트
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
    
    let priceSum = 0;
    let priceCount = 0;
    priceData.forEach(p => {
        if (p.last_price > 0) {
            priceSum += p.last_price;
            priceCount++;
        }
    });
    
    document.getElementById('totalCount').textContent = formatNumber(totalCount);
    document.getElementById('totalSales').textContent = formatCurrency(totalSales);
    document.getElementById('totalProducts').textContent = formatNumber(productSet.size);
    document.getElementById('avgPrice').textContent = priceCount > 0 
        ? formatCurrency(Math.round(priceSum / priceCount)) 
        : '-';
}

// 매출 탭 업데이트
function updateSalesTab() {
    const dailyData = getFilteredDailyData();
    updateSalesCharts(dailyData);
    updateSalesTable(dailyData);
}

// 매출 차트 업데이트
function updateSalesCharts(dailyData) {
    if (charts.dailySales) charts.dailySales.destroy();
    if (charts.categorySales) charts.categorySales.destroy();
    if (charts.topProducts) charts.topProducts.destroy();
    
    const dates = Object.keys(dailyData).sort();
    const values = dates.map(d => dailyData[d]?.total || 0);
    
    const dailyCtx = document.getElementById('dailySalesChart')?.getContext('2d');
    if (dailyCtx) {
        if (dates.length > 0) {
            charts.dailySales = new Chart(dailyCtx, {
                type: 'line',
                data: {
                    labels: dates.map(d => {
                        const parts = d.split('-');
                        return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
                    }),
                    datasets: [{
                        label: '매출액',
                        data: values,
                        borderColor: '#00d4ff',
                        backgroundColor: 'rgba(0, 212, 255, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    interaction: { mode: 'index', intersect: false },
                    plugins: { 
                        legend: { display: false },
                        zoom: zoomOptions,
                        tooltip: {
                            callbacks: {
                                title: (items) => formatDateKorean(dates[items[0].dataIndex]),
                                label: (ctx) => '매출: ' + formatCurrency(ctx.parsed.y)
                            }
                        }
                    },
                    scales: {
                        x: { 
                            ticks: { color: '#888', maxRotation: 45 },
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
    
    // 대분류별 차트 - 지점 선택시에도 전체 카테고리 표시 (또는 해당 지점 카테고리)
    const categories = reportData.categories || [];
    const categoryCtx = document.getElementById('categorySalesChart')?.getContext('2d');
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
                plugins: {
                    legend: { 
                        position: 'right',
                        labels: { color: '#fff', font: { size: 11 } }
                    }
                }
            }
        });
    }
    
    // 상위 품목 차트
    const priceData = getFilteredPriceData();
    const topProducts = priceData
        .filter(p => p.last_price > 0)
        .map(p => ({ name: p.name, total: p.last_price * (p.count || 1) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);
    
    const productsCtx = document.getElementById('topProductsChart')?.getContext('2d');
    if (productsCtx && topProducts.length > 0) {
        charts.topProducts = new Chart(productsCtx, {
            type: 'bar',
            data: {
                labels: topProducts.map(p => p.name.length > 15 ? p.name.slice(0, 15) + '...' : p.name),
                datasets: [{
                    label: '금액',
                    data: topProducts.map(p => p.total),
                    backgroundColor: 'rgba(123, 44, 191, 0.7)'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { 
                        ticks: { color: '#888', callback: v => formatNumber(v) },
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

// 매출 테이블 업데이트
function updateSalesTable(dailyData) {
    const tbody = document.querySelector('#salesTable tbody');
    if (!tbody) return;
    
    const dates = Object.keys(dailyData).sort().reverse();
    
    if (dates.length === 0) {
        let msg = '데이터가 없습니다.';
        if (currentStore) {
            msg = `"${currentStore}" 지점의 매출 데이터가 없습니다.`;
        }
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#666;padding:40px;">${msg}</td></tr>`;
        return;
    }
    
    tbody.innerHTML = dates.map(date => {
        const data = dailyData[date];
        return `
            <tr>
                <td>${formatDateKorean(date)}</td>
                <td>${formatNumber(data.items || '-')}</td>
                <td>${formatNumber(data.count)}</td>
                <td>${formatCurrency(data.total)}</td>
            </tr>
        `;
    }).join('');
}

// 가격 탭 업데이트
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

// 가격 카드 렌더링
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
        
        // 변동 표시: ▲12,000 (+5.5%) 또는 ▼8,000 (-3.2%)
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

// 탭 초기화
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

// 필터 초기화
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

// 모달 초기화
function initModal() {
    const modal = document.getElementById('priceModal');
    const closeBtn = modal?.querySelector('.modal-close');
    
    closeBtn?.addEventListener('click', () => modal.classList.remove('show'));
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.classList.contains('show')) {
            modal.classList.remove('show');
        }
    });
}

// 가격 모달 표시
function showPriceModal(item) {
    if (!item) return;
    
    const modal = document.getElementById('priceModal');
    if (!modal) return;
    
    document.getElementById('modalTitle').textContent = item.name || '';
    
    const ctx = document.getElementById('priceHistoryChart')?.getContext('2d');
    if (ctx) {
        if (charts.priceHistory) charts.priceHistory.destroy();
        
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
                        tension: 0.2,
                        pointRadius: 5,
                        pointHoverRadius: 8,
                        pointBackgroundColor: '#00d4ff',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
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
                                            return `변동: ${diff > 0 ? '+' : ''}${formatNumber(diff)}원`;
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
    
    const changeClass = (item.change || 0) > 0 ? 'change-positive' : (item.change || 0) < 0 ? 'change-negative' : '';
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
            <div class="detail-value ${changeClass}">${(item.change || 0) > 0 ? '+' : ''}${formatNumber(item.change)}원</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">변동률</div>
            <div class="detail-value ${changeClass}">${(item.change_pct || 0) > 0 ? '+' : ''}${item.change_pct || 0}%</div>
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
                    return `
                        <tr>
                            <td>${formatDateKorean(h.date)}</td>
                            <td>${formatNumber(h.price)}원</td>
                            <td class="${diffClass}">${i === 0 ? '-' : (diff > 0 ? '+' : '') + formatNumber(diff) + '원'}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    ` : '';
    
    modal.classList.add('show');
}

document.addEventListener('DOMContentLoaded', loadData);
