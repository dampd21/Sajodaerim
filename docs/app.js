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
        console.log('Daily details:', Object.keys(reportData.daily_details || {}).length);
        
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
    initDailyDetailModal();
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
    
    if (currentStore) {
        if (reportData.store_details?.[currentStore]?.daily) {
            dailyData = JSON.parse(JSON.stringify(reportData.store_details[currentStore].daily));
            console.log('Daily: Using store data for', currentStore, '-', Object.keys(dailyData).length, 'days');
        } else {
            console.log('Daily: No store data for', currentStore);
            dailyData = {};
        }
    } else {
        dailyData = JSON.parse(JSON.stringify(reportData.daily || {}));
        console.log('Daily: Using all data -', Object.keys(dailyData).length, 'days');
    }
    
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
    
    if (currentStore) {
        if (reportData.store_price_changes?.[currentStore]) {
            priceData = JSON.parse(JSON.stringify(reportData.store_price_changes[currentStore]));
            console.log('Price: Using store data for', currentStore, '-', priceData.length, 'items');
        } else {
            console.log('Price: No store data for', currentStore);
            priceData = [];
        }
    } else {
        priceData = JSON.parse(JSON.stringify(reportData.price_changes || []));
        console.log('Price: Using all data -', priceData.length, 'items');
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
    if (charts.storeRanking) charts.storeRanking.destroy();
    
    const dates = Object.keys(dailyData).sort();
    const values = dates.map(d => dailyData[d]?.total || 0);
    
    // 일별 매출 차트
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
    
    // 지점별 매출 순위 차트 (전체 지점 선택 시만 표시)
    const storeRankingContainer = document.getElementById('storeRankingContainer');
    const storeRankingCtx = document.getElementById('storeRankingChart')?.getContext('2d');
    
    if (storeRankingContainer && storeRankingCtx) {
        if (!currentStore) {
            storeRankingContainer.style.display = 'block';
            
            let storeData = [];
            
            if (currentPeriod) {
                Object.keys(reportData.store_details || {}).forEach(storeName => {
                    const storeDaily = reportData.store_details[storeName]?.daily || {};
                    let total = 0;
                    let count = 0;
                    
                    Object.keys(storeDaily).forEach(date => {
                        if (date.startsWith(currentPeriod)) {
                            total += storeDaily[date].total || 0;
                            count += storeDaily[date].count || 0;
                        }
                    });
                    
                    if (total > 0) {
                        storeData.push({ name: storeName, total: total, count: count });
                    }
                });
            } else {
                storeData = (reportData.stores || []).map(s => ({
                    name: s.name,
                    total: s.total,
                    count: s.count
                }));
            }
            
            storeData.sort((a, b) => b.total - a.total);
            const topStores = storeData.slice(0, 15);
            
            if (topStores.length > 0) {
                charts.storeRanking = new Chart(storeRankingCtx, {
                    type: 'bar',
                    data: {
                        labels: topStores.map((s, i) => `${i + 1}. ${s.name.length > 12 ? s.name.slice(0, 12) + '...' : s.name}`),
                        datasets: [{
                            label: '매출액',
                            data: topStores.map(s => s.total),
                            backgroundColor: topStores.map((_, i) => {
                                if (i === 0) return 'rgba(255, 215, 0, 0.8)';
                                if (i === 1) return 'rgba(192, 192, 192, 0.8)';
                                if (i === 2) return 'rgba(205, 127, 50, 0.8)';
                                return 'rgba(0, 212, 255, 0.6)';
                            }),
                            borderColor: topStores.map((_, i) => {
                                if (i === 0) return 'rgba(255, 215, 0, 1)';
                                if (i === 1) return 'rgba(192, 192, 192, 1)';
                                if (i === 2) return 'rgba(205, 127, 50, 1)';
                                return 'rgba(0, 212, 255, 1)';
                            }),
                            borderWidth: 1
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        plugins: { 
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    title: (items) => {
                                        const idx = items[0].dataIndex;
                                        return topStores[idx].name;
                                    },
                                    label: (ctx) => {
                                        const idx = ctx.dataIndex;
                                        const store = topStores[idx];
                                        return [
                                            '매출: ' + formatCurrency(store.total),
                                            '주문수량: ' + formatNumber(store.count)
                                        ];
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { 
                                ticks: { color: '#888', callback: v => formatNumber(v) },
                                grid: { color: 'rgba(255,255,255,0.05)' }
                            },
                            y: { 
                                ticks: { color: '#fff', font: { size: 11 } },
                                grid: { display: false }
                            }
                        }
                    }
                });
            }
        } else {
            storeRankingContainer.style.display = 'none';
        }
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
            <tr class="clickable" data-date="${date}">
                <td>${formatDateKorean(date)}</td>
                <td>${formatNumber(data.items || '-')}</td>
                <td>${formatNumber(data.count)}</td>
                <td>${formatCurrency(data.total)}</td>
            </tr>
        `;
    }).join('');
    
    // 클릭 이벤트 추가
    tbody.querySelectorAll('tr.clickable').forEach(row => {
        row.addEventListener('click', () => {
            const date = row.dataset.date;
            showDailyDetailModal(date);
        });
    });
}

// 일별 상세 모달 초기화
function initDailyDetailModal() {
    const modal = document.getElementById('dailyDetailModal');
    const closeBtn = modal?.querySelector('.modal-close');
    
    closeBtn?.addEventListener('click', () => modal.classList.remove('show'));
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
    });
    
    // 검색 필터
    document.getElementById('dailySearch')?.addEventListener('input', (e) => {
        filterAndRenderDailyDetails();
    });
    
    // 정렬
    document.getElementById('dailySort')?.addEventListener('change', (e) => {
        filterAndRenderDailyDetails();
    });
}

// 일별 상세 모달 표시
function showDailyDetailModal(date) {
    const modal = document.getElementById('dailyDetailModal');
    if (!modal) return;
    
    document.getElementById('dailyDetailTitle').textContent = formatDateKorean(date) + ' 상세 내역';
    
    // 상세 데이터 가져오기
    let details = [];
    
    if (currentStore) {
        // 특정 지점 선택 시: 해당 지점의 해당 날짜 데이터
        if (reportData.daily_details?.[date]) {
            details = reportData.daily_details[date].filter(item => 
                item.store === currentStore
            );
        }
    } else {
        // 전체 지점: 해당 날짜의 모든 데이터
        details = reportData.daily_details?.[date] || [];
    }
    
    currentDailyDetails = details;
    
    // 요약 정보
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
    
    // 검색 초기화
    const searchInput = document.getElementById('dailySearch');
    if (searchInput) searchInput.value = '';
    
    // 테이블 렌더링
    filterAndRenderDailyDetails();
    
    modal.classList.add('show');
}

// 일별 상세 필터링 및 렌더링
function filterAndRenderDailyDetails() {
    const query = document.getElementById('dailySearch')?.value.toLowerCase() || '';
    const sortType = document.getElementById('dailySort')?.value || 'store';
    
    let filtered = currentDailyDetails;
    
    // 검색 필터
    if (query) {
        filtered = filtered.filter(item => 
            (item.store || '').toLowerCase().includes(query) ||
            (item.product || '').toLowerCase().includes(query) ||
            (item.category || '').toLowerCase().includes(query)
        );
    }
    
    // 정렬
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

// 일별 상세 테이블 렌더링
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
        if (e.key === 'Escape') {
            document.getElementById('priceModal')?.classList.remove('show');
            document.getElementById('dailyDetailModal')?.classList.remove('show');
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

document.addEventListener('DOMContentLoaded', loadData);
