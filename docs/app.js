let reportData = null;
let charts = {};
let currentStore = '';
let currentPeriod = '';
let filteredPriceData = [];

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
    const [year, month, day] = dateStr.split('-');
    return `${year}년 ${parseInt(month)}월 ${parseInt(day)}일`;
}

function getMonthKey(dateStr) {
    return dateStr.substring(0, 7); // YYYY-MM
}

function formatMonthKorean(monthKey) {
    if (!monthKey) return '';
    const [year, month] = monthKey.split('-');
    return `${year}년 ${parseInt(month)}월`;
}

// 데이터 로드
async function loadData() {
    try {
        const response = await fetch('report_data.json?t=' + Date.now());
        if (!response.ok) throw new Error('Data load failed');
        reportData = await response.json();
        console.log('Data loaded:', reportData);
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
    
    // 업데이트 시간
    document.getElementById('updateTime').textContent = 
        '마지막 업데이트: ' + new Date(reportData.generated_at).toLocaleString('ko-KR');
    
    initStoreSelect();
    initPeriodSelect();
    initTabs();
    initFilters();
    initModal();
    
    // 초기 데이터 표시
    updateDashboard();
}

// 지점 선택 초기화
function initStoreSelect() {
    const select = document.getElementById('storeSelect');
    if (!select) return;
    
    let storeList = reportData.store_list || [];
    if (storeList.length === 0 && reportData.stores) {
        storeList = reportData.stores.map(s => s.name).sort();
    }
    
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
    
    document.getElementById('periodSelect').addEventListener('change', (e) => {
        currentPeriod = e.target.value;
        updateDashboard();
    });
}

// 기간 드롭다운 업데이트
function updatePeriodSelect() {
    const select = document.getElementById('periodSelect');
    if (!select) return;
    
    // 해당 지점의 데이터에서 월 목록 추출
    const months = new Set();
    const dailyData = currentStore && reportData.store_details?.[currentStore]?.daily
        ? reportData.store_details[currentStore].daily
        : reportData.daily || {};
    
    Object.keys(dailyData).forEach(date => {
        months.add(getMonthKey(date));
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
    updateSummary();
    updateSalesTab();
    updatePricesTab();
}

// 요약 카드 업데이트
function updateSummary() {
    let totalCount = 0;
    let totalSales = 0;
    let productSet = new Set();
    let priceSum = 0;
    let priceCount = 0;
    
    const dailyData = getFilteredDailyData();
    const priceData = getFilteredPriceData();
    
    Object.values(dailyData).forEach(d => {
        totalCount += d.count || 0;
        totalSales += d.total || 0;
    });
    
    priceData.forEach(p => {
        productSet.add(p.code);
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

// 필터된 일별 데이터 가져오기
function getFilteredDailyData() {
    let dailyData = {};
    
    // 지점 선택 여부에 따라 데이터 소스 결정
    if (currentStore && reportData.store_details?.[currentStore]) {
        dailyData = JSON.parse(JSON.stringify(reportData.store_details[currentStore].daily || {}));
    } else {
        dailyData = JSON.parse(JSON.stringify(reportData.daily || {}));
    }
    
    // 기간이 선택된 경우에만 필터링
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
    let priceData = [];
    
    // 지점 선택 여부에 따라 데이터 소스 결정
    if (currentStore && reportData.store_price_changes?.[currentStore]) {
        priceData = JSON.parse(JSON.stringify(reportData.store_price_changes[currentStore]));
    } else {
        priceData = JSON.parse(JSON.stringify(reportData.price_changes || []));
    }
    
    // 기간이 선택된 경우에만 필터링
    if (currentPeriod) {
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

function round(num, decimals) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// 매출 탭 업데이트
function updateSalesTab() {
    const dailyData = getFilteredDailyData();
    
    // 차트 업데이트
    updateSalesCharts(dailyData);
    
    // 테이블 업데이트
    updateSalesTable(dailyData);
}

// 매출 차트 업데이트
function updateSalesCharts(dailyData) {
    // 기존 차트 제거
    if (charts.dailySales) charts.dailySales.destroy();
    if (charts.categorySales) charts.categorySales.destroy();
    if (charts.topProducts) charts.topProducts.destroy();
    
    const dates = Object.keys(dailyData).sort();
    const values = dates.map(d => dailyData[d]?.total || 0);
    
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
            x: { 
                ticks: { 
                    color: '#888',
                    maxRotation: 45,
                    callback: function(value, index) {
                        const date = dates[index];
                        if (!date) return '';
                        const [y, m, d] = date.split('-');
                        return `${parseInt(m)}/${parseInt(d)}`;
                    }
                },
                grid: { color: 'rgba(255,255,255,0.05)' }
            },
            y: { 
                ticks: { 
                    color: '#888',
                    callback: v => formatNumber(v)
                },
                grid: { color: 'rgba(255,255,255,0.05)' }
            }
        }
    };
    
    // 일별 매출 차트
    const dailyCtx = document.getElementById('dailySalesChart')?.getContext('2d');
    if (dailyCtx && dates.length > 0) {
        charts.dailySales = new Chart(dailyCtx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: '매출액',
                    data: values,
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: chartOptions
        });
    }
    
    // 대분류별 차트
    const categoryData = getCategoryData();
    const categoryCtx = document.getElementById('categorySalesChart')?.getContext('2d');
    if (categoryCtx && categoryData.length > 0) {
        charts.categorySales = new Chart(categoryCtx, {
            type: 'doughnut',
            data: {
                labels: categoryData.map(c => c.name),
                datasets: [{
                    data: categoryData.map(c => c.total),
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
    const topProducts = getTopProducts();
    const productsCtx = document.getElementById('topProductsChart')?.getContext('2d');
    if (productsCtx && topProducts.length > 0) {
        charts.topProducts = new Chart(productsCtx, {
            type: 'bar',
            data: {
                labels: topProducts.map(p => p.name.length > 15 ? p.name.slice(0, 15) + '...' : p.name),
                datasets: [{
                    label: '매출액',
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

// 카테고리별 데이터
function getCategoryData() {
    if (currentStore || currentPeriod) {
        // 필터된 경우 원본 데이터에서 재계산 필요
        // 현재는 전체 카테고리 데이터 반환
        return reportData.categories || [];
    }
    return reportData.categories || [];
}

// 상위 품목
function getTopProducts() {
    const priceData = getFilteredPriceData();
    return priceData
        .map(p => ({
            name: p.name,
            total: p.last_price * (p.count || 1)
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);
}

// 매출 테이블 업데이트
function updateSalesTable(dailyData) {
    const tbody = document.querySelector('#salesTable tbody');
    if (!tbody) return;
    
    const dates = Object.keys(dailyData).sort().reverse();
    
    if (dates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="no-data">데이터가 없습니다.</td></tr>';
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
    
    // 요약 업데이트
    const upCount = priceData.filter(p => p.change > 0).length;
    const downCount = priceData.filter(p => p.change < 0).length;
    const neutralCount = priceData.filter(p => p.change === 0).length;
    
    document.getElementById('totalPriceItems').textContent = formatNumber(priceData.length);
    document.getElementById('priceUpCount').textContent = formatNumber(upCount);
    document.getElementById('priceDownCount').textContent = formatNumber(downCount);
    document.getElementById('priceNeutralCount').textContent = formatNumber(neutralCount);
    
    // 카드 렌더링
    renderPriceCards(priceData);
}

// 가격 카드 렌더링
function renderPriceCards(priceData) {
    const container = document.getElementById('priceCards');
    if (!container) return;
    
    if (!priceData || priceData.length === 0) {
        container.innerHTML = '<div class="no-data">해당 조건의 가격 변동 데이터가 없습니다.</div>';
        return;
    }
    
    container.innerHTML = priceData.map((item, index) => {
        const changeClass = item.change > 0 ? 'up' : item.change < 0 ? 'down' : 'neutral';
        const arrow = item.change > 0 ? '+' : '';
        
        return `
            <div class="price-card" data-index="${index}">
                <div class="price-card-header">
                    <div class="price-card-name">${item.name}</div>
                    <div class="price-card-category">${item.category || ''}</div>
                </div>
                <div class="price-card-body">
                    <div class="price-range">
                        ${formatNumber(item.first_price)} -> ${formatNumber(item.last_price)}원
                    </div>
                    <div class="price-change ${changeClass}">
                        ${arrow}${item.change_pct}%
                    </div>
                </div>
                <div class="price-card-footer">
                    <span>${formatDateKorean(item.first_date).replace('년 ', '.').replace('월 ', '.').replace('일', '')}</span>
                    <span>~</span>
                    <span>${formatDateKorean(item.last_date).replace('년 ', '.').replace('월 ', '.').replace('일', '')}</span>
                    <span>(${item.count}건)</span>
                </div>
            </div>
        `;
    }).join('');
    
    // 클릭 이벤트
    container.querySelectorAll('.price-card').forEach(card => {
        card.addEventListener('click', () => {
            const index = parseInt(card.dataset.index);
            showPriceModal(filteredPriceData[index]);
        });
    });
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
    // 가격 검색
    document.getElementById('priceSearch')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        let filtered = getFilteredPriceData().filter(
            item => item.name.toLowerCase().includes(query) || 
                    item.code.toLowerCase().includes(query)
        );
        filtered = applySortToPrice(filtered);
        renderPriceCards(filtered);
    });
    
    // 가격 정렬
    document.getElementById('priceSort')?.addEventListener('change', (e) => {
        const query = document.getElementById('priceSearch')?.value.toLowerCase() || '';
        let filtered = getFilteredPriceData().filter(
            item => item.name.toLowerCase().includes(query) || 
                    item.code.toLowerCase().includes(query)
        );
        filtered = applySortToPrice(filtered, e.target.value);
        renderPriceCards(filtered);
    });
}

function applySortToPrice(data, sortType) {
    sortType = sortType || document.getElementById('priceSort')?.value || 'change_desc';
    let sorted = [...data];
    
    switch (sortType) {
        case 'change_desc':
            sorted.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
            break;
        case 'change_asc':
            sorted.sort((a, b) => Math.abs(a.change_pct) - Math.abs(b.change_pct));
            break;
        case 'up_only':
            sorted = sorted.filter(item => item.change > 0);
            sorted.sort((a, b) => b.change_pct - a.change_pct);
            break;
        case 'down_only':
            sorted = sorted.filter(item => item.change < 0);
            sorted.sort((a, b) => a.change_pct - b.change_pct);
            break;
        case 'price_desc':
            sorted.sort((a, b) => b.last_price - a.last_price);
            break;
        case 'name_asc':
            sorted.sort((a, b) => a.name.localeCompare(b.name));
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
    
    document.getElementById('modalTitle').textContent = item.name;
    
    // 차트
    const ctx = document.getElementById('priceHistoryChart')?.getContext('2d');
    if (ctx) {
        if (charts.priceHistory) charts.priceHistory.destroy();
        
        const history = item.history || [];
        charts.priceHistory = new Chart(ctx, {
            type: 'line',
            data: {
                labels: history.map(h => {
                    const [y, m, d] = h.date.split('-');
                    return `${parseInt(m)}/${parseInt(d)}`;
                }),
                datasets: [{
                    label: '단가',
                    data: history.map(h => h.price),
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    fill: true,
                    tension: 0.2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => {
                                const idx = items[0].dataIndex;
                                return formatDateKorean(history[idx].date);
                            },
                            label: (ctx) => formatNumber(ctx.parsed.y) + '원'
                        }
                    }
                },
                scales: {
                    x: { 
                        ticks: { color: '#888' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: { 
                        ticks: { 
                            color: '#888',
                            callback: v => formatNumber(v)
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }
    
    // 상세 정보
    const changeClass = item.change > 0 ? 'change-positive' : item.change < 0 ? 'change-negative' : '';
    document.getElementById('priceDetails').innerHTML = `
        <div class="detail-item">
            <div class="detail-label">상품코드</div>
            <div class="detail-value">${item.code}</div>
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
            <div class="detail-value ${changeClass}">${item.change > 0 ? '+' : ''}${formatNumber(item.change)}원</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">변동률</div>
            <div class="detail-value ${changeClass}">${item.change_pct > 0 ? '+' : ''}${item.change_pct}%</div>
        </div>
    `;
    
    // 가격 히스토리 테이블
    const history = item.history || [];
    document.getElementById('priceHistoryTable').innerHTML = `
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
                    const diff = h.price - prevPrice;
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
    `;
    
    modal.classList.add('show');
}

// 초기화
document.addEventListener('DOMContentLoaded', loadData);
