/**
 * 매출 관리 대시보드
 */

let salesData = null;
let filteredData = null;
let currentSort = { column: 'name', direction: 'asc' };
let salesTrendChart = null;
let channelChart = null;
let storeRankChart = null;

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initEventListeners();
    renderDashboard();
});

// 데이터 로드
async function loadData() {
    try {
        const response = await fetch('sales_data.json');
        salesData = await response.json();
        console.log('Data loaded:', salesData);
        
        // 업데이트 시간 표시
        if (salesData.generated_at) {
            const date = new Date(salesData.generated_at);
            document.getElementById('updateTime').textContent = 
                `마지막 업데이트: ${formatDateTime(date)}`;
        }
        
        // 기간 드롭다운 초기화
        initPeriodSelect();
        
    } catch (error) {
        console.error('Failed to load data:', error);
    }
}

// 이벤트 리스너 초기화
function initEventListeners() {
    // 기간 유형 변경
    document.getElementById('periodType').addEventListener('change', (e) => {
        handlePeriodTypeChange(e.target.value);
    });
    
    // 기간 선택 변경
    document.getElementById('periodSelect').addEventListener('change', () => {
        renderDashboard();
    });
    
    // 직접 선택 날짜 변경
    document.getElementById('startDate').addEventListener('change', () => {
        renderDashboard();
    });
    document.getElementById('endDate').addEventListener('change', () => {
        renderDashboard();
    });
    
    // 지점 검색
    document.getElementById('storeSearch').addEventListener('input', (e) => {
        renderStoreTable(e.target.value);
    });
    
    // 테이블 헤더 정렬 클릭
    document.querySelectorAll('.sortable-header').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            handleSort(column);
        });
    });
    
    // 차트 초기화 버튼
    document.getElementById('resetChartZoom').addEventListener('click', () => {
        if (salesTrendChart) {
            salesTrendChart.resetZoom();
        }
    });
    
    // 모달 닫기
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('dailyModal').addEventListener('click', (e) => {
        if (e.target.id === 'dailyModal') closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// 기간 유형 변경 처리
function handlePeriodTypeChange(type) {
    const periodSelect = document.getElementById('periodSelect');
    const customGroup1 = document.getElementById('customDateGroup');
    const customGroup2 = document.getElementById('customDateGroup2');
    
    if (type === 'custom') {
        customGroup1.style.display = 'block';
        customGroup2.style.display = 'block';
        periodSelect.parentElement.style.display = 'none';
        
        // 기본 날짜 설정
        if (salesData && salesData.summary.date_range) {
            document.getElementById('startDate').value = salesData.summary.date_range.start;
            document.getElementById('endDate').value = salesData.summary.date_range.end;
        }
    } else {
        customGroup1.style.display = 'none';
        customGroup2.style.display = 'none';
        periodSelect.parentElement.style.display = 'block';
        initPeriodSelect(type);
    }
    
    renderDashboard();
}

// 기간 드롭다운 초기화
function initPeriodSelect(type = 'monthly') {
    const select = document.getElementById('periodSelect');
    select.innerHTML = '<option value="">전체 기간</option>';
    
    if (!salesData) return;
    
    let options = [];
    
    if (type === 'monthly') {
        options = salesData.month_list || [];
        options.forEach(month => {
            const [year, mon] = month.split('-');
            select.innerHTML += `<option value="${month}">${year}년 ${parseInt(mon)}월</option>`;
        });
    } else if (type === 'weekly') {
        options = (salesData.weekly || []).map(w => w.week).reverse();
        options.forEach(week => {
            select.innerHTML += `<option value="${week}">${week}</option>`;
        });
    } else if (type === 'daily') {
        options = (salesData.daily || []).map(d => d.date).reverse().slice(0, 60);
        options.forEach(date => {
            select.innerHTML += `<option value="${date}">${formatDateKorean(date)}</option>`;
        });
    }
}

// 필터링된 데이터 가져오기
function getFilteredData() {
    if (!salesData) return null;
    
    const periodType = document.getElementById('periodType').value;
    const periodValue = document.getElementById('periodSelect').value;
    
    let result = {
        stores: [],
        daily: [],
        summary: { hall: 0, delivery: 0, packaging: 0, total: 0, days: 0 }
    };
    
    if (periodType === 'custom') {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        
        if (startDate && endDate) {
            result.daily = (salesData.daily || []).filter(d => 
                d.date >= startDate && d.date <= endDate
            );
        } else {
            result.daily = salesData.daily || [];
        }
    } else if (periodValue) {
        if (periodType === 'monthly') {
            result.daily = (salesData.daily || []).filter(d => 
                d.date.startsWith(periodValue)
            );
        } else if (periodType === 'weekly') {
            // 주차에 해당하는 날짜들 필터링
            const weekData = (salesData.weekly || []).find(w => w.week === periodValue);
            if (weekData) {
                result.daily = (salesData.daily || []).filter(d => {
                    const weekKey = getWeekKey(d.date);
                    return weekKey === periodValue;
                });
            }
        } else if (periodType === 'daily') {
            result.daily = (salesData.daily || []).filter(d => d.date === periodValue);
        }
    } else {
        result.daily = salesData.daily || [];
    }
    
    // 필터된 기간의 지점별 합계 계산
    const storeMap = {};
    const dates = new Set(result.daily.map(d => d.date));
    
    dates.forEach(date => {
        const detail = salesData.daily_detail[date] || [];
        detail.forEach(store => {
            if (!storeMap[store.code]) {
                storeMap[store.code] = {
                    code: store.code,
                    name: store.name,
                    hall: 0,
                    delivery: 0,
                    packaging: 0,
                    total: 0
                };
            }
            storeMap[store.code].hall += store.hall || 0;
            storeMap[store.code].delivery += store.delivery || 0;
            storeMap[store.code].packaging += store.packaging || 0;
            storeMap[store.code].total += store.total || 0;
        });
    });
    
    result.stores = Object.values(storeMap);
    
    // 요약 계산
    result.daily.forEach(d => {
        result.summary.hall += d.hall || 0;
        result.summary.delivery += d.delivery || 0;
        result.summary.packaging += d.packaging || 0;
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

// 매출 추이 차트
function renderTrendChart() {
    const ctx = document.getElementById('salesTrendChart').getContext('2d');
    
    if (salesTrendChart) {
        salesTrendChart.destroy();
    }
    
    const daily = filteredData.daily;
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
                    tension: 0.4
                },
                {
                    label: '배달',
                    data: daily.map(d => d.delivery),
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: '합계',
                    data: daily.map(d => d.total),
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    fill: false,
                    tension: 0.4,
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
                        label: (context) => {
                            return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
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
                    const date = filteredData.daily[index].date;
                    showDailyModal(date);
                }
            }
        }
    });
}

// 채널별 차트
function renderChannelChart() {
    const ctx = document.getElementById('channelChart').getContext('2d');
    
    if (channelChart) {
        channelChart.destroy();
    }
    
    const summary = filteredData.summary;
    
    channelChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['홀', '배달', '포장'],
            datasets: [{
                data: [summary.hall, summary.delivery, summary.packaging],
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
                            const total = summary.hall + summary.delivery + summary.packaging;
                            const percent = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                            return `${context.label}: ${formatCurrency(context.raw)} (${percent}%)`;
                        }
                    }
                }
            }
        }
    });
}

// 지점 순위 차트
function renderStoreRankChart() {
    const ctx = document.getElementById('storeRankChart').getContext('2d');
    
    if (storeRankChart) {
        storeRankChart.destroy();
    }
    
    // 매출순 상위 10개
    const topStores = [...filteredData.stores]
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
    
    const colors = topStores.map((_, i) => {
        if (i === 0) return '#ffd700';
        if (i === 1) return '#c0c0c0';
        if (i === 2) return '#cd7f32';
        return '#00d4ff';
    });
    
    storeRankChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topStores.map(s => s.name.replace('역대짬뽕 ', '')),
            datasets: [{
                data: topStores.map(s => s.total),
                backgroundColor: colors,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => formatCurrency(context.raw)
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#a0a0a0',
                        callback: (value) => formatCompact(value)
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: { color: '#e0e0e0' },
                    grid: { display: false }
                }
            }
        }
    });
}

// 지점 테이블 렌더링
function renderStoreTable(searchTerm = '') {
    const tbody = document.getElementById('storeTableBody');
    tbody.innerHTML = '';
    
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
    
    // 전체 합계 계산
    const totalSum = stores.reduce((sum, s) => sum + s.total, 0);
    
    // 테이블 행 생성
    stores.forEach(store => {
        const percent = totalSum > 0 ? ((store.total / totalSum) * 100).toFixed(1) : 0;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${store.name}</td>
            <td class="text-right">${formatCurrency(store.hall)}</td>
            <td class="text-right">${formatCurrency(store.delivery)}</td>
            <td class="text-right">${formatCurrency(store.total)}</td>
            <td class="text-right">${percent}%</td>
        `;
        tbody.appendChild(tr);
    });
    
    // 정렬 아이콘 업데이트
    updateSortIcons();
}

// 정렬 처리
function handleSort(column) {
    if (currentSort.column === column) {
        // 같은 컬럼 클릭: 방향 전환
        if (column === 'name') {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // 숫자 컬럼은 기본 내림차순
            currentSort.direction = currentSort.direction === 'desc' ? 'asc' : 'desc';
        }
    } else {
        // 다른 컬럼 클릭
        currentSort.column = column;
        currentSort.direction = column === 'name' ? 'asc' : 'desc';
    }
    
    renderStoreTable(document.getElementById('storeSearch').value);
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

// 일별 상세 모달
function showDailyModal(date) {
    const modal = document.getElementById('dailyModal');
    const title = document.getElementById('modalTitle');
    const summary = document.getElementById('modalSummary');
    const tbody = document.getElementById('modalTableBody');
    
    const detail = salesData.daily_detail[date] || [];
    const dayData = (salesData.daily || []).find(d => d.date === date) || {};
    
    title.textContent = `${formatDateKorean(date)} 매출 상세`;
    
    summary.innerHTML = `
        <div class="summary-item">
            <span class="label">총 매출</span>
            <span class="value">${formatCurrency(dayData.total || 0)}</span>
        </div>
        <div class="summary-item">
            <span class="label">홀</span>
            <span class="value hall">${formatCurrency(dayData.hall || 0)}</span>
        </div>
        <div class="summary-item">
            <span class="label">배달</span>
            <span class="value delivery">${formatCurrency(dayData.delivery || 0)}</span>
        </div>
        <div class="summary-item">
            <span class="label">영업 지점</span>
            <span class="value">${detail.length}개</span>
        </div>
    `;
    
    // 매출순 정렬
    const sortedDetail = [...detail].sort((a, b) => b.total - a.total);
    
    tbody.innerHTML = '';
    sortedDetail.forEach(store => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${store.name}</td>
            <td class="text-right">${formatCurrency(store.hall)}</td>
            <td class="text-right">${formatCurrency(store.delivery)}</td>
            <td class="text-right">${formatCurrency(store.packaging)}</td>
            <td class="text-right">${formatCurrency(store.total)}</td>
        `;
        tbody.appendChild(tr);
    });
    
    modal.classList.add('active');
}

// 모달 닫기
function closeModal() {
    document.getElementById('dailyModal').classList.remove('active');
}

// 주차 계산
function getWeekKey(dateStr) {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const days = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000));
    const week = Math.ceil((days + oneJan.getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
}

// 유틸리티 함수
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
