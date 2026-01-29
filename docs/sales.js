/**
 * 매출 관리 대시보드
 * - 지점별/기간별(월/주) 필터
 * - 직선 그래프, 세로 막대 차트
 * - 매출 대비 발주율 섹션
 * - 기본값: 최근 1달
 */

let salesData = null;
let orderData = null;  // 발주 데이터
let filteredData = null;
let currentStore = '';
let currentPeriodType = 'monthly';
let currentPeriod = '';
let currentSort = { column: 'total', direction: 'desc' };

let salesTrendChart = null;
let channelChart = null;
let storeRankChart = null;
let orderRateChart = null;

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initEventListeners();
    setDefaultPeriod();
    renderDashboard();
});

// Canvas 재생성 함수
function recreateCanvas(containerId, canvasId) {
    const container = document.getElementById(containerId);
    const oldCanvas = document.getElementById(canvasId);
    
    if (oldCanvas) {
        oldCanvas.remove();
    }
    
    const newCanvas = document.createElement('canvas');
    newCanvas.id = canvasId;
    container.appendChild(newCanvas);
    
    return newCanvas.getContext('2d');
}

// 데이터 로드
async function loadData() {
    try {
        // 매출 데이터
        const salesResponse = await fetch('sales_data.json?t=' + Date.now());
        salesData = await salesResponse.json();
        console.log('Sales data loaded:', salesData);
        
        // 발주 데이터 (매출 대비 발주율용)
        try {
            const orderResponse = await fetch('report_data.json?t=' + Date.now());
            orderData = await orderResponse.json();
            console.log('Order data loaded:', orderData);
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
    }
}

// 기본 기간 설정 (최근 1달)
function setDefaultPeriod() {
    if (!salesData || !salesData.month_list || salesData.month_list.length === 0) return;
    
    // 최근 월 자동 선택
    const latestMonth = salesData.month_list[0];
    currentPeriod = latestMonth;
    
    const periodSelect = document.getElementById('periodSelect');
    if (periodSelect) {
        periodSelect.value = latestMonth;
    }
}

// 이벤트 리스너 초기화
function initEventListeners() {
    // 지점 선택
    document.getElementById('storeSelect').addEventListener('change', (e) => {
        currentStore = e.target.value;
        renderDashboard();
    });
    
    // 기간 유형 변경
    document.getElementById('periodType').addEventListener('change', (e) => {
        currentPeriodType = e.target.value;
        initPeriodSelect();
        renderDashboard();
    });
    
    // 기간 선택
    document.getElementById('periodSelect').addEventListener('change', (e) => {
        currentPeriod = e.target.value;
        renderDashboard();
    });
    
    // 지점 검색
    document.getElementById('storeSearch').addEventListener('input', (e) => {
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
    document.getElementById('resetChartZoom').addEventListener('click', () => {
        if (salesTrendChart) {
            salesTrendChart.resetZoom();
        }
    });
    
    // 발주율 기간 유형
    document.getElementById('orderRatePeriodType')?.addEventListener('change', () => {
        renderOrderRateSection();
    });
    
    // 모달
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('dailyModal').addEventListener('click', (e) => {
        if (e.target.id === 'dailyModal') closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// 지점 선택 초기화
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

// 기간 드롭다운 초기화
function initPeriodSelect() {
    const select = document.getElementById('periodSelect');
    if (!select || !salesData) return;
    
    select.innerHTML = '<option value="">전체 기간</option>';
    
    if (currentPeriodType === 'monthly') {
        // 월별: 1월 ~ 12월
        (salesData.month_list || []).forEach(month => {
            const [year, mon] = month.split('-');
            select.innerHTML += `<option value="${month}">${year}년 ${parseInt(mon)}월</option>`;
        });
    } else if (currentPeriodType === 'weekly') {
        // 주별: 연도-W주차
        const weeks = getWeekList();
        weeks.forEach(week => {
            select.innerHTML += `<option value="${week.key}">${week.label}</option>`;
        });
    }
    
    // 기본값 복원
    if (currentPeriod && select.querySelector(`option[value="${currentPeriod}"]`)) {
        select.value = currentPeriod;
    } else {
        currentPeriod = '';
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

// 주차 키 계산
function getWeekKey(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const days = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000));
    const week = Math.ceil((days + oneJan.getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

// 필터링된 데이터 가져오기
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
    
    // 지점 필터 (지점별 데이터 집계)
    const storeMap = {};
    const dates = new Set(dailyData.map(d => d.date));
    
    dates.forEach(date => {
        const detail = salesData.daily_detail?.[date] || [];
        detail.forEach(store => {
            // 지점 필터 적용
            if (currentStore && store.name !== currentStore) return;
            
            if (!storeMap[store.code]) {
                storeMap[store.code] = {
                    code: store.code,
                    name: store.name,
                    hall: 0,
                    delivery: 0,
                    deliveryExternal: 0,  // 포스 미연동 (추후 추가)
                    total: 0
                };
            }
            storeMap[store.code].hall += store.hall || 0;
            storeMap[store.code].delivery += store.delivery || 0;
            storeMap[store.code].total += store.total || 0;
        });
    });
    
    result.stores = Object.values(storeMap);
    
    // 일별 데이터 (지점 필터 적용)
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

// 대시보드 렌더링
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

// 요약 카드 렌더링
function renderSummaryCards() {
    const summary = filteredData.summary;
    
    document.getElementById('totalSales').textContent = formatCurrency(summary.total);
    document.getElementById('hallSales').textContent = formatCurrency(summary.hall);
    document.getElementById('deliverySales').textContent = formatCurrency(summary.delivery);
    document.getElementById('totalDays').textContent = `${summary.days}일`;
}

// 매출 현황 차트 (직선 그래프)
function renderTrendChart() {
    if (salesTrendChart) {
        salesTrendChart.destroy();
        salesTrendChart = null;
    }
    
    const ctx = recreateCanvas('trendChartContainer', 'salesTrendChart');
    
    const daily = filteredData.daily;
    if (!daily || daily.length === 0) return;
    
    const labels = daily.map(d => formatDateShort(d.date));
    
    salesTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '홀',
                    data: daily.map(d => d.hall),
                    borderColor: '#4ecdc4',
                    backgroundColor: 'rgba(78, 205, 196, 0.1)',
                    fill: true,
                    tension: 0,  // 직선
                    borderWidth: 2
                },
                {
                    label: '배달(포스연동)',
                    data: daily.map(d => d.delivery),
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    fill: true,
                    tension: 0,  // 직선
                    borderWidth: 2
                },
                {
                    label: '합계',
                    data: daily.map(d => d.total),
                    borderColor: '#00d4ff',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0,  // 직선
                    borderWidth: 3
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
                    labels: { color: '#e0e0e0' }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => formatDateKorean(daily[items[0].dataIndex]?.date),
                        label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw)}`
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
                    ticks: { color: '#a0a0a0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
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

// 매출 비중 현황 차트
function renderChannelChart() {
    if (channelChart) {
        channelChart.destroy();
        channelChart = null;
    }
    
    const ctx = recreateCanvas('channelChartContainer', 'channelChart');
    
    const summary = filteredData.summary;
    
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

// 지점별 매출 TOP 10 (세로 막대 그래프)
function renderStoreRankChart() {
    if (storeRankChart) {
        storeRankChart.destroy();
        storeRankChart = null;
    }
    
    const ctx = recreateCanvas('storeRankChartContainer', 'storeRankChart');
    
    const topStores = [...filteredData.stores]
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
    
    if (topStores.length === 0) return;
    
    const colors = topStores.map((_, i) => {
        if (i === 0) return '#ffd700';  // 금
        if (i === 1) return '#c0c0c0';  // 은
        if (i === 2) return '#cd7f32';  // 동
        return '#00d4ff';
    });
    
    storeRankChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topStores.map(s => {
                const name = s.name.replace('역대짬뽕 ', '');
                return name.length > 8 
