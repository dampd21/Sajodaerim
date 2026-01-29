/**
 * 매출 관리 대시보드
 * - 지점별/기간별(월/주) 필터
 * - 누적 막대 그래프 (세로형)
 * - 매출 대비 발주율 섹션
 * - 기본값: 최근 1달
 */

let salesData = null;
let orderData = null;
let filteredData = null;
let currentStore = '';
let currentPeriodType = 'monthly';
let currentPeriod = '';
let currentSort = { column: 'total', direction: 'desc' };

let salesTrendChart = null;
let channelChart = null;
let storeRankChart = null;
let orderRateChart = null;

// ============================================
// 지점명 매칭 테이블
// 발주(사조) 지점명 → 포스(KIS) 지점명
// ============================================

const STORE_MAPPING = {
    // "발주 지점명": "포스 지점명"
    "역대짬뽕 장안본점(98)": "역대짬뽕 본점",
    "역대짬뽕 오산시청점(99)": "역대짬뽕 오산시청점",
    "역대짬뽕 병점점(99)": "역대짬뽕 병점점",
    "역대짬뽕 송탄점(99)": "역대짬뽕 송탄점",
    "역대짬뽕 화성반월점(99)": "역대짬뽕 화성반월점",
    "역대짬뽕 다산1호점(14)": "역대짬뽕 다산1호점",
    "역대짬뽕 송파점(95)": "역대짬뽕 송파점",
    "역대짬뽕 두정점(101)": "역대짬뽕 두정점"
};

// 역방향 매핑 (포스 → 발주) 자동 생성
const STORE_MAPPING_REVERSE = {};
Object.keys(STORE_MAPPING).forEach(orderName => {
    const posName = STORE_MAPPING[orderName];
    STORE_MAPPING_REVERSE[posName] = orderName;
});

// 발주 지점명 → 포스 지점명 변환
function getPosStoeName(orderStoreName) {
    return STORE_MAPPING[orderStoreName] || orderStoreName;
}

// 포스 지점명 → 발주 지점명 변환
function getOrderStoreName(posStoreName) {
    return STORE_MAPPING_REVERSE[posStoreName] || posStoreName;
}

// ============================================
// 초기화
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initEventListeners();
    setDefaultPeriod();
    renderDashboard();
});

// Canvas 재생성 함수 (차트 증식 방지)
function recreateCanvas(containerId, canvasId) {
    const container = document.getElementById(containerId);
    if (!container) return null;
    
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
// 데이터 로드
// ============================================

async function loadData() {
    try {
        // 매출 데이터
        const salesResponse = await fetch('sales_data.json?t=' + Date.now());
        salesData = await salesResponse.json();
        console.log('Sales data loaded:', salesData.summary);
        
        // 발주 데이터 (매출 대비 발주율용)
        try {
            const orderResponse = await fetch('report_data.json?t=' + Date.now());
            orderData = await orderResponse.json();
            console.log('Order data loaded:', orderData.summary);
        } catch (e) {
            console.log('Order data not available');
            orderData = null;
        }
        
        if (salesData.generated_at) {
            const date = new Date(salesData.generated_at);
            document.getElementById('updateTime').textContent = 
                `마지막 업데이트: ${formatDateTime(date)}`;
        }
        
        initStoreSelect();
        initPeriodSelect();
        
    } catch (error) {
        console.error('Failed to load data:', error);
        document.querySelector('.container').innerHTML = 
            '<div class="no-data">데이터를 불러올 수 없습니다.</div>';
    }
}

// 기본 기간 설정 (최근 1달)
function setDefaultPeriod() {
    if (!salesData || !salesData.month_list || salesData.month_list.length === 0) return;
    
    const latestMonth = salesData.month_list[0];
    currentPeriod = latestMonth;
    
    const periodSelect = document.getElementById('periodSelect');
    if (periodSelect) {
        periodSelect.value = latestMonth;
    }
}

// ============================================
// 이벤트 리스너
// ============================================

function initEventListeners() {
    // 지점 선택
    document.getElementById('storeSelect')?.addEventListener('change', (e) => {
        currentStore = e.target.value;
        renderDashboard();
    });
    
    // 기간 유형 변경
    document.getElementById('periodType')?.addEventListener('change', (e) => {
        currentPeriodType = e.target.value;
        initPeriodSelect();
        setDefaultPeriodForType();
        renderDashboard();
    });
    
    // 기간 선택
    document.getElementById('periodSelect')?.addEventListener('change', (e) => {
        currentPeriod = e.target.value;
        renderDashboard();
    });
    
    // 지점 검색
    document.getElementById('storeSearch')?.addEventListener('input', (e) => {
        renderStoreTable(e.target.value);
    });
    
    // 테이블 정렬
    document.querySelectorAll('.sortable-header').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            handleSort(column);
        });
    });
    
    // 차트 줌 초기화
    document.getElementById('resetChartZoom')?.addEventListener('click', () => {
        if (salesTrendChart) {
            salesTrendChart.resetZoom();
        }
    });
    
    // 발주율 기간 유형
    document.getElementById('orderRatePeriodType')?.addEventListener('change', () => {
        renderOrderRateSection();
    });
    
    // 모달
    const modalClose = document.querySelector('.modal-close');
    modalClose?.addEventListener('click', closeModal);
    
    document.getElementById('dailyModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'dailyModal') closeModal();
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// ============================================
// 필터 초기화
// ============================================

function initStoreSelect() {
    const select = document.getElementById('storeSelect');
    if (!select || !salesData) return;
    
    const stores = salesData.stores || [];
    const storeNames = [...new Set(stores.map(s => s.name))].sort((a, b) => a.localeCompare(b, 'ko'));
    
    select.innerHTML = '<option value="">전체 지점</option>';
    storeNames.forEach(name => {
        select.innerHTML += `<option value="${name}">${name}</option>`;
    });
}

function initPeriodSelect() {
    const select = document.getElementById('periodSelect');
    if (!select || !salesData) return;
    
    select.innerHTML = '<option value="">전체 기간</option>';
    
    if (currentPeriodType === 'monthly') {
        (salesData.month_list || []).forEach(month => {
            const [year, mon] = month.split('-');
            select.innerHTML += `<option value="${month}">${year}년 ${parseInt(mon)}월</option>`;
        });
    } else if (currentPeriodType === 'weekly') {
        const weeks = getWeekList();
        weeks.forEach(week => {
            select.innerHTML += `<option value="${week.key}">${week.label}</option>`;
        });
    }
}

function setDefaultPeriodForType() {
    const select = document.getElementById('periodSelect');
    if (!select) return;
    
    if (currentPeriodType === 'monthly' && salesData.month_list?.length > 0) {
        currentPeriod = salesData.month_list[0];
        select.value = currentPeriod;
    } else if (currentPeriodType === 'weekly') {
        const weeks = getWeekList();
        if (weeks.length > 0) {
            currentPeriod = weeks[0].key;
            select.value = currentPeriod;
        }
    }
}

// 주차 목록 생성
function getWeekList() {
    if (!salesData || !salesData.daily) return [];
    
    const weekMap = new Map();
    
    salesData.daily.forEach(d => {
        const weekKey = getWeekKey(d.date);
        if (weekKey && !weekMap.has(weekKey)) {
            const [year, weekNum] = weekKey.split('-W');
            weekMap.set(weekKey, {
                key: weekKey,
                label: `${year}년 ${parseInt(weekNum)}주차`,
                year: parseInt(year),
                week: parseInt(weekNum)
            });
        }
    });
    
    return Array.from(weekMap.values())
        .sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            return b.week - a.week;
        });
}

// 주차 키 계산 (ISO 주차)
function getWeekKey(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const days = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000));
    const week = Math.ceil((days + oneJan.getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

// ============================================
// 데이터 필터링
// ============================================

function getFilteredData() {
    if (!salesData) return null;
    
    let result = {
        stores: [],
        daily: [],
        summary: { hall: 0, delivery: 0, deliveryExternal: 0, total: 0, days: 0 }
    };
    
    // 일별 데이터 필터링
    let dailyData = salesData.daily || [];
    
    // 기간 필터
    if (currentPeriod) {
        if (currentPeriodType === 'monthly') {
            dailyData = dailyData.filter(d => d.date && d.date.startsWith(currentPeriod));
        } else if (currentPeriodType === 'weekly') {
            dailyData = dailyData.filter(d => getWeekKey(d.date) === currentPeriod);
        }
    }
    
    // 지점별 데이터 집계
    const storeMap = {};
    const dates = new Set(dailyData.map(d => d.date));
    
    dates.forEach(date => {
        const detail = salesData.daily_detail?.[date] || [];
        detail.forEach(store => {
            if (currentStore && store.name !== currentStore) return;
            
            if (!storeMap[store.code]) {
                storeMap[store.code] = {
                    code: store.code,
                    name: store.name,
                    hall: 0,
                    delivery: 0,
                    deliveryExternal: 0,
                    total: 0
                };
            }
            storeMap[store.code].hall += store.hall || 0;
            storeMap[store.code].delivery += store.delivery || 0;
            storeMap[store.code].total += store.total || 0;
        });
    });
    
    result.stores = Object.values(storeMap);
    
    // 일별 데이터
    if (currentStore) {
        result.daily = dailyData.map(d => {
            const detail = salesData.daily_detail?.[d.date] || [];
            const storeData = detail.find(s => s.name === currentStore);
            if (!storeData) return null;
            return {
                date: d.date,
                hall: storeData.hall || 0,
                delivery: storeData.delivery || 0,
                deliveryExternal: 0,
                total: storeData.total || 0
            };
        }).filter(d => d !== null);
    } else {
        result.daily = dailyData.map(d => ({
            date: d.date,
            hall: d.hall || 0,
            delivery: d.delivery || 0,
            deliveryExternal: 0,
            total: d.total || 0
        }));
    }
    
    // 요약 집계
    result.daily.forEach(d => {
        result.summary.hall += d.hall || 0;
        result.summary.delivery += d.delivery || 0;
        result.summary.deliveryExternal += d.deliveryExternal || 0;
        result.summary.total += d.total || 0;
    });
    result.summary.days = result.daily.length;
    
    return result;
}

// ============================================
// 대시보드 렌더링
// ============================================

function renderDashboard() {
    filteredData = getFilteredData();
    if (!filteredData) return;
    
    renderSummaryCards();
    renderTrendChart();
    renderChannelChart();
    renderStoreRankChart();
    renderOrderRateSection();
    renderStoreTable();
}

// 요약 카드
function renderSummaryCards() {
    const summary = filteredData.summary;
    
    document.getElementById('totalSales').textContent = formatCurrency(summary.total);
    document.getElementById('hallSales').textContent = formatCurrency(summary.hall);
    document.getElementById('deliverySales').textContent = formatCurrency(summary.delivery);
    document.getElementById('totalDays').textContent = `${summary.days}일`;
}

// ============================================
// 매출 현황 차트 (누적 막대 그래프 - 세로형)
// ============================================

function renderTrendChart() {
    if (salesTrendChart) {
        salesTrendChart.destroy();
        salesTrendChart = null;
    }
    
    const ctx = recreateCanvas('trendChartContainer', 'salesTrendChart');
    if (!ctx) return;
    
    const daily = filteredData.daily;
    if (!daily || daily.length === 0) {
        return;
    }
    
    const labels = daily.map(d => formatDateShort(d.date));
    
    salesTrendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '홀',
                    data: daily.map(d => d.hall),
                    backgroundColor: '#4ecdc4',
                    borderRadius: 0,
                    stack: 'sales'
                },
                {
                    label: '배달(포스연동)',
                    data: daily.map(d => d.delivery),
                    backgroundColor: '#ff6b6b',
                    borderRadius: 0,
                    stack: 'sales'
                },
                {
                    label: '배달(포스미연동)',
                    data: daily.map(d => d.deliveryExternal || 0),
                    backgroundColor: '#ffe66d',
                    borderRadius: {
                        topLeft: 4,
                        topRight: 4,
                        bottomLeft: 0,
                        bottomRight: 0
                    },
                    stack: 'sales'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { 
                        color: '#e0e0e0',
                        usePointStyle: true,
                        padding: 20
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => formatDateKorean(daily[items[0].dataIndex]?.date),
                        label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw)}`,
                        afterBody: (items) => {
                            const idx = items[0].dataIndex;
                            const d = daily[idx];
                            const total = (d.hall || 0) + (d.delivery || 0) + (d.deliveryExternal || 0);
                            return `──────────\n합계: ${formatCurrency(total)}`;
                        }
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x'
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: { 
                        color: '#a0a0a0', 
                        maxRotation: 45,
                        font: { size: 11 }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    stacked: true,
                    ticks: {
                        color: '#a0a0a0',
                        callback: (value) => formatCompact(value)
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const date = filteredData.daily[index]?.date;
                    if (date) showDailyModal(date);
                }
            }
        }
    });
}

// ============================================
// 매출 비중 현황 차트
// ============================================

function renderChannelChart() {
    if (channelChart) {
        channelChart.destroy();
        channelChart = null;
    }
    
    const ctx = recreateCanvas('channelChartContainer', 'channelChart');
    if (!ctx) return;
    
    const summary = filteredData.summary;
    const hasData = summary.hall > 0 || summary.delivery > 0 || summary.deliveryExternal > 0;
    
    if (!hasData) return;
    
    channelChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['홀', '배달(포스연동)', '배달(포스미연동)'],
            datasets: [{
                data: [summary.hall, summary.delivery, summary.deliveryExternal],
                backgroundColor: ['#4ecdc4', '#ff6b6b', '#ffe66d'],
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
                        label: (context) => {
                            const total = summary.hall + summary.delivery + summary.deliveryExternal;
                            const percent = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                            return `${context.label}: ${formatCurrency(context.raw)} (${percent}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ============================================
// 지점별 매출 TOP 10 (세로 막대 그래프)
// ============================================

function renderStoreRankChart() {
    if (storeRankChart) {
        storeRankChart.destroy();
        storeRankChart = null;
    }
    
    const ctx = recreateCanvas('storeRankChartContainer', 'storeRankChart');
    if (!ctx) return;
    
    const topStores = [...filteredData.stores]
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
    
    if (topStores.length === 0) return;
    
    const colors = topStores.map((_, i) => {
        if (i === 0) return '#ffd700';
        if (i === 1) return '#c0c0c0';
        if (i === 2) return '#cd7f32';
        return '#00d4ff';
    });
    
    const labels = topStores.map(s => {
        const name = s.name.replace('역대짬뽕 ', '');
        return name.length > 6 ? name.slice(0, 6) + '..' : name;
    });
    
    storeRankChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: topStores.map(s => s.total),
                backgroundColor: colors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => topStores[items[0].dataIndex]?.name || '',
                        label: (context) => formatCurrency(context.raw)
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#e0e0e0', maxRotation: 45 },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color: '#a0a0a0',
                        callback: (value) => formatCompact(value)
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

// ============================================
// 매출 대비 발주율 섹션 (지점명 매칭 적용)
// ============================================

function renderOrderRateSection() {
    if (!orderData) {
        const container = document.getElementById('orderRateChartContainer');
        if (container) {
            container.innerHTML = '<div class="no-data">발주 데이터가 없습니다.</div>';
        }
        const tbody = document.getElementById('orderRateTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">발주 데이터가 없습니다.</td></tr>';
        }
        return;
    }
    
    // 발주 데이터 집계 (발주 지점명 → 포스 지점명으로 변환)
    const orderByPosStore = {};
    const storeDetails = orderData.store_details || {};
    
    Object.keys(storeDetails).forEach(orderStoreName => {
        const storeData = storeDetails[orderStoreName];
        if (!storeData.daily) return;
        
        // 발주 지점명 → 포스 지점명 변환
        const posStoreName = getPosStoeName(orderStoreName);
        
        let total = 0;
        Object.keys(storeData.daily).forEach(date => {
            // 기간 필터 적용
            if (currentPeriod) {
                if (currentPeriodType === 'monthly' && !date.startsWith(currentPeriod)) return;
                if (currentPeriodType === 'weekly' && getWeekKey(date) !== currentPeriod) return;
            }
            total += storeData.daily[date].total || 0;
        });
        
        if (total > 0) {
            // 같은 포스 지점명으로 합산
            if (!orderByPosStore[posStoreName]) {
                orderByPosStore[posStoreName] = 0;
            }
            orderByPosStore[posStoreName] += total;
        }
    });
    
    console.log('=== 발주율 계산 ===');
    console.log('발주 데이터 (포스 지점명 기준):', orderByPosStore);
    console.log('매출 지점:', filteredData.stores.map(s => s.name));
    
    // 매출 대비 발주율 계산
    const rateData = filteredData.stores.map(store => {
        const salesAmount = store.total || 0;
        const orderAmount = orderByPosStore[store.name] || 0;
        const rate = salesAmount > 0 ? (orderAmount / salesAmount * 100) : 0;
        
        return {
            name: store.name,
            sales: salesAmount,
            order: orderAmount,
            rate: rate,
            hasOrder: orderAmount > 0
        };
    }).filter(d => d.sales > 0 || d.order > 0)
      .sort((a, b) => b.rate - a.rate);
    
    console.log('발주율 데이터:', rateData);
    
    // 차트 렌더링
    renderOrderRateChart(rateData);
    
    // 테이블 렌더링
    renderOrderRateTable(rateData);
}

function renderOrderRateChart(rateData) {
    if (orderRateChart) {
        orderRateChart.destroy();
        orderRateChart = null;
    }
    
    const ctx = recreateCanvas('orderRateChartContainer', 'orderRateChart');
    if (!ctx) return;
    
    if (rateData.length === 0) {
        return;
    }
    
    const topData = rateData.slice(0, 15);
    
    const labels = topData.map(d => {
        const name = d.name.replace('역대짬뽕 ', '');
        return name.length > 8 ? name.slice(0, 8) + '..' : name;
    });
    
    orderRateChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '발주율 (%)',
                data: topData.map(d => d.rate.toFixed(1)),
                backgroundColor: topData.map(d => {
                    if (d.rate >= 40) return '#ff6b6b';
                    if (d.rate >= 30) return '#ffe66d';
                    return '#4ecdc4';
                }),
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items) => topData[items[0].dataIndex]?.name || '',
                        label: (context) => {
                            const d = topData[context.dataIndex];
                            return [
                                `발주율: ${d.rate.toFixed(1)}%`,
                                `매출: ${formatCurrency(d.sales)}`,
                                `발주: ${formatCurrency(d.order)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#e0e0e0', maxRotation: 45 },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color: '#a0a0a0',
                        callback: (value) => value + '%'
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function renderOrderRateTable(rateData) {
    const tbody = document.getElementById('orderRateTableBody');
    if (!tbody) return;
    
    if (rateData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">데이터가 없습니다.</td></tr>';
        return;
    }
    
    tbody.innerHTML = rateData.map(d => {
        const rateClass = d.rate >= 40 ? 'rate-high' : d.rate >= 30 ? 'rate-mid' : 'rate-low';
        const orderDisplay = d.order > 0 ? formatCurrency(d.order) : '<span class="no-match">미연동</span>';
        const rateDisplay = d.order > 0 ? `${d.rate.toFixed(1)}%` : '-';
        
        return `
            <tr>
                <td>${d.name}</td>
                <td class="text-right">${formatCurrency(d.sales)}</td>
                <td class="text-right">${orderDisplay}</td>
                <td class="text-right ${d.order > 0 ? rateClass : ''}">${rateDisplay}</td>
            </tr>
        `;
    }).join('');
}

// ============================================
// 지점별 매출 현황 테이블
// ============================================

function renderStoreTable(searchTerm = '') {
    const tbody = document.getElementById('storeTableBody');
    if (!tbody) return;
    
    let stores = [...filteredData.stores];
    
    // 검색 필터
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        stores = stores.filter(s => s.name.toLowerCase().includes(term));
    }
    
    // 정렬
    stores.sort((a, b) => {
        let aVal = a[currentSort.column];
        let bVal = b[currentSort.column];
        
        if (currentSort.column === 'name') {
            aVal = aVal || '';
            bVal = bVal || '';
            return currentSort.direction === 'asc' 
                ? aVal.localeCompare(bVal, 'ko')
                : bVal.localeCompare(aVal, 'ko');
        } else {
            aVal = aVal || 0;
            bVal = bVal || 0;
            return currentSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
    });
    
    if (stores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">데이터가 없습니다.</td></tr>';
        return;
    }
    
    tbody.innerHTML = stores.map(store => `
        <tr>
            <td>${store.name}</td>
            <td class="text-right">${formatCurrency(store.hall)}</td>
            <td class="text-right">${formatCurrency(store.delivery)}</td>
            <td class="text-right">${formatCurrency(store.deliveryExternal)}</td>
            <td class="text-right">${formatCurrency(store.total)}</td>
        </tr>
    `).join('');
    
    updateSortIcons();
}

// 정렬 처리
function handleSort(column) {
    if (currentSort.column === column) {
        if (column === 'name') {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
        }
    } else {
        currentSort.column = column;
        currentSort.direction = column === 'name' ? 'asc' : 'desc';
    }
    
    renderStoreTable(document.getElementById('storeSearch')?.value || '');
}

// 정렬 아이콘 업데이트
function updateSortIcons() {
    document.querySelectorAll('.sortable-header').forEach(header => {
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
// 일별 상세 모달
// ============================================

function showDailyModal(date) {
    const modal = document.getElementById('dailyModal');
    if (!modal) return;
    
    const title = document.getElementById('modalTitle');
    const summary = document.getElementById('modalSummary');
    const tbody = document.getElementById('modalTableBody');
    
    const detail = salesData.daily_detail?.[date] || [];
    
    // 지점 필터 적용
    let filteredDetail = detail;
    if (currentStore) {
        filteredDetail = detail.filter(s => s.name === currentStore);
    }
    
    title.textContent = `${formatDateKorean(date)} 매출 상세`;
    
    const totalHall = filteredDetail.reduce((sum, s) => sum + (s.hall || 0), 0);
    const totalDelivery = filteredDetail.reduce((sum, s) => sum + (s.delivery || 0), 0);
    const totalAmount = filteredDetail.reduce((sum, s) => sum + (s.total || 0), 0);
    
    summary.innerHTML = `
        <div class="summary-item">
            <span class="label">총 매출</span>
            <span class="value">${formatCurrency(totalAmount)}</span>
        </div>
        <div class="summary-item">
            <span class="label">홀</span>
            <span class="value hall">${formatCurrency(totalHall)}</span>
        </div>
        <div class="summary-item">
            <span class="label">배달(포스연동)</span>
            <span class="value delivery">${formatCurrency(totalDelivery)}</span>
        </div>
        <div class="summary-item">
            <span class="label">영업 지점</span>
            <span class="value">${filteredDetail.length}개</span>
        </div>
    `;
    
    const sortedDetail = [...filteredDetail].sort((a, b) => (b.total || 0) - (a.total || 0));
    
    tbody.innerHTML = sortedDetail.map(store => `
        <tr>
            <td>${store.name}</td>
            <td class="text-right">${formatCurrency(store.hall)}</td>
            <td class="text-right">${formatCurrency(store.delivery)}</td>
            <td class="text-right">${formatCurrency(0)}</td>
            <td class="text-right">${formatCurrency(store.total)}</td>
        </tr>
    `).join('');
    
    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('dailyModal')?.classList.remove('active');
}

// ============================================
// 유틸리티 함수
// ============================================

function formatCurrency(value) {
    if (!value && value !== 0) return '-';
    return new Intl.NumberFormat('ko-KR').format(value) + '원';
}

function formatCompact(value) {
    if (value >= 100000000) {
        return (value / 100000000).toFixed(1) + '억';
    } else if (value >= 10000) {
        return (value / 10000).toFixed(0) + '만';
    }
    return value.toLocaleString();
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

function formatDateKorean(dateStr) {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    return `${year}년 ${parseInt(month)}월 ${parseInt(day)}일`;
}

function formatDateShort(dateStr) {
    if (!dateStr) return '-';
    const [year, month, day] = dateStr.split('-');
    return `${parseInt(month)}/${parseInt(day)}`;
}
