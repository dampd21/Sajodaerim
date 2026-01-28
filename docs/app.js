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
        modifierKey: null,
    },
    zoom: {
        wheel: {
            enabled: true,
        },
        pinch: {
            enabled: true
        },
        mode: 'x',
        onZoomComplete: function({chart}) {
            chart.update('none');
        }
    },
    limits: {
        x: {
            minRange: 3
        }
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
        
        console.log('Data loaded:', reportData.summary?.total_records, 'records');
        initDashboard();
    } catch (error) {
        console.error('Error:', error);
        document.querySelector('.tab-content').innerHTML = 
            '<div class="no-data">데이터를 불러올 수 없습니다. 크롤러를 먼저 실행해주세요.</div>';
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

// Zoom 리셋 버튼 초기화
function initZoomResetButtons() {
    document.getElementById('resetDailyZoom')?.addEventListener('click', () => {
        if (charts.dailySales) {
            charts.dailySales.resetZoom();
        }
    });
    
    document.getElementById('resetModalZoom')?.addEventListener('click', () => {
        if (charts.priceHistory) {
            charts.priceHistory.resetZoom();
        }
    });
}

// 지점 선택 초기화
function initStoreSelect() {
    const select = document.getElementById('storeSelect');
    if (!select) return;
    
    let storeList = [];
    
    if (reportData.store_list && reportData.store_list.length > 0) {
        storeList = reportData.store_list;
    } else if (reportData.stores && reportData.stores.length > 0) {
        storeList = reportData.stores.map(s => s.name);
    } else if (reportData.store_price_changes) {
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

// 기간 선택 초기화
function initPeriodSelect() {
    updatePeriodSelect();
    
    document.getElementById('periodSelect')?.addEventListener('change', (e) => {
        currentPeriod = e.target.value;
        updateDashboard();
    });
}

// 기간 드롭다운 업데이트
function updatePeriodSelect() {
    const select = document.getElementById('periodSelect');
    if (!select) return;
    
    const months = new Set();
    
    let dailyData = null;
    if (currentStore) {
        dailyData = reportData.store_details?.[currentStore]?.daily;
    }
    if (!dailyData || Object.keys(dailyData).length === 0) {
        dailyData = reportData.daily;
    }
    
    if (dailyData) {
        Object.keys(dailyData).forEach(date => {
            const monthKey = getMonthKey(date);
            if (monthKey) months.add(monthKey);
        });
    }
    
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
    updateSummary();
    updateSalesTab();
    updatePricesTab();
}

// 필터된 일별 데이터 가져오기
function getFilteredDailyData() {
    let dailyData = null;
    
    if (currentStore) {
        if (reportData.store_details && reportData.store_details[currentStore]) {
            dailyData = reportData.store_details[currentStore].daily;
        }
    }
    
    if (!dailyData) {
        dailyData = reportData.daily || {};
    }
    
    dailyData = JSON.parse(JSON.stringify(dailyData));
    
    if (currentPeriod) {
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

// 필터된 가격 데이터 가져오기
function getFilteredPriceData() {
    let priceData = null;
    
    if (currentStore) {
        if (reportData.store_price_changes && reportData.store_price_changes[currentStore]) {
            priceData = reportData.store_price_changes[currentStore];
        } else {
            priceData = [];
        }
    }
    
    if (priceData === null) {
        priceData = reportData.price_changes || [];
    }
    
    priceData = JSON.parse(JSON.stringify(priceData));
    
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
    
    // 일별 매출 차트 (with zoom/pan)
    const dailyCtx = document.getElementById('dailySalesChart')?.getContext('2d');
    if (dailyCtx && dates.length > 0) {
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
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: { 
                    legend: { display: false },
                    zoom: zoomOptions,
                    tooltip: {
                        callbacks: {
                            title: (items) => {
                                const idx = items[0].dataIndex;
                                return formatDateKorean(dates[idx]);
                            },
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
    
    // 대분류별 차트
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
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#666;padding:40px;">데이터가 없습니다.</td></tr>';
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
        const changeClass = item.change > 0 ? 'up' : item.change < 0 ? 'down' : 'neutral';
        const arrow = item.change > 0 ? '+' : '';
        const shortDate = (dateStr) => {
            if (!dateStr) return '';
            const parts = dateStr.split('-');
            return `${parts[0]}.${parts[1]}.${parts[2]}`;
        };
        
        return `
            <div class="price-card" data-index="${index}">
                <div class="price-card-header">
                    <div class="price-card-name">${item.name || ''}</div>
                    <div class="price-card-category">${item.category || ''}</div>
                </div>
                <div class="price-card-body">
                    <div class="price-range">
                        ${formatNumber(item.first_price)} -> ${formatNumber(item.last_price)}원
                    </div>
                    <div class="price-change ${changeClass}">
                        ${arrow}${item.change_pct || 0}%
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

// 현재 표시된 가격 데이터
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
        data = applySortToPrice(data, sortType);
        renderPriceCards(data);
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
        
        data = applySortToPrice(data, e.target.value);
        renderPriceCards(data);
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
    
    // 차트 (with zoom/pan)
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
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: { display: false },
                        zoom: zoomOptions,
                        tooltip: {
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            titleFont: { size: 14 },
                            bodyFont: { size: 13 },
                            padding: 12,
                            callbacks: {
                                title: (items) => {
                                    const idx = items[0].dataIndex;
                                    return formatDateKorean(history[idx]?.date);
                                },
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
    
    // 상세 정보
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
    
    // 가격 히스토리 테이블
    const history = item.history || [];
    document.getElementById('priceHistoryTable').innerHTML = history.length > 0 ? `
        <h4>가격 변동 내역</h4>
        <table>
            <thead>
                <tr>
                    <th>날짜</th>
                    <th>단가</th>
                    <th>변동</th>
                </tr>
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
    ` : '<p style="color:#666;">가격 히스토리가 없습니다.</p>';
    
    modal.classList.add('show');
}

// 초기화
document.addEventListener('DOMContentLoaded', loadData);
