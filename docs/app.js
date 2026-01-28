// 전역 변수
let reportData = null;
let charts = {};

// 숫자 포맷
function formatNumber(num) {
    return new Intl.NumberFormat('ko-KR').format(num);
}

function formatCurrency(num) {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num);
}

// 데이터 로드
async function loadData() {
    try {
        const response = await fetch('report_data.json');
        if (!response.ok) throw new Error('데이터 로드 실패');
        reportData = await response.json();
        initDashboard();
    } catch (error) {
        console.error('Error:', error);
        document.querySelector('.tab-content').innerHTML = `
            <div class="loading" style="color: #ff6b6b;">
                데이터를 불러올 수 없습니다.<br>
                크롤러를 먼저 실행해주세요.
            </div>
        `;
    }
}

// 대시보드 초기화
function initDashboard() {
    if (!reportData) return;
    
    // 업데이트 시간
    document.getElementById('updateTime').textContent = 
        `마지막 업데이트: ${new Date(reportData.generated_at).toLocaleString('ko-KR')}`;
    
    // 요약 카드
    const summary = reportData.summary;
    document.getElementById('totalRecords').textContent = formatNumber(summary.total_records || 0);
    document.getElementById('totalStores').textContent = formatNumber(summary.total_stores || 0);
    document.getElementById('totalProducts').textContent = formatNumber(summary.total_products || 0);
    document.getElementById('totalSales').textContent = formatCurrency(summary.total_sales || 0);
    
    // 차트 초기화
    initCharts();
    
    // 테이블 초기화
    initTables();
    
    // 가격 카드 초기화
    initPriceCards();
    
    // 탭 이벤트
    initTabs();
    
    // 검색/필터 이벤트
    initFilters();
    
    // 모달 이벤트
    initModal();
}

// 차트 초기화
function initCharts() {
    // 일별 매출 차트
    const dailyData = reportData.daily || {};
    const dailyLabels = Object.keys(dailyData).slice(-30); // 최근 30일
    const dailyValues = dailyLabels.map(k => dailyData[k]?.total || 0);
    
    const dailyCtx = document.getElementById('dailyChart')?.getContext('2d');
    if (dailyCtx) {
        charts.daily = new Chart(dailyCtx, {
            type: 'line',
            data: {
                labels: dailyLabels,
                datasets: [{
                    label: '매출액',
                    data: dailyValues,
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
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
    
    // 대분류별 차트
    const categories = reportData.categories || [];
    const categoryCtx = document.getElementById('categoryChart')?.getContext('2d');
    if (categoryCtx && categories.length > 0) {
        charts.category = new Chart(categoryCtx, {
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
                        labels: { color: '#fff' }
                    }
                }
            }
        });
    }
    
    // 상위 지점 차트
    const stores = (reportData.stores || []).slice(0, 10);
    const storesCtx = document.getElementById('topStoresChart')?.getContext('2d');
    if (storesCtx && stores.length > 0) {
        charts.stores = new Chart(storesCtx, {
            type: 'bar',
            data: {
                labels: stores.map(s => s.name.length > 15 ? s.name.slice(0, 15) + '...' : s.name),
                datasets: [{
                    label: '매출액',
                    data: stores.map(s => s.total),
                    backgroundColor: 'rgba(0, 212, 255, 0.7)'
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { 
                        ticks: { 
                            color: '#888',
                            callback: v => formatNumber(v)
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: { 
                        ticks: { color: '#888' },
                        grid: { display: false }
                    }
                }
            }
        });
    }
    
    // 주간 차트
    const weeklyData = reportData.weekly || {};
    const weeklyLabels = Object.keys(weeklyData);
    const weeklyValues = weeklyLabels.map(k => weeklyData[k]?.total || 0);
    
    const weeklyCtx = document.getElementById('weeklyChart')?.getContext('2d');
    if (weeklyCtx) {
        charts.weekly = new Chart(weeklyCtx, {
            type: 'bar',
            data: {
                labels: weeklyLabels,
                datasets: [{
                    label: '매출액',
                    data: weeklyValues,
                    backgroundColor: 'rgba(123, 44, 191, 0.7)'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
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
    
    // 월간 차트
    const monthlyData = reportData.monthly || {};
    const monthlyLabels = Object.keys(monthlyData);
    const monthlyValues = monthlyLabels.map(k => monthlyData[k]?.total || 0);
    
    const monthlyCtx = document.getElementById('monthlyChart')?.getContext('2d');
    if (monthlyCtx) {
        charts.monthly = new Chart(monthlyCtx, {
            type: 'bar',
            data: {
                labels: monthlyLabels,
                datasets: [{
                    label: '매출액',
                    data: monthlyValues,
                    backgroundColor: 'rgba(81, 207, 102, 0.7)'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
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
}

// 테이블 초기화
function initTables() {
    // 주간 테이블
    const weeklyData = reportData.weekly || {};
    const weeklyKeys = Object.keys(weeklyData);
    const weeklyTbody = document.querySelector('#weeklyTable tbody');
    
    if (weeklyTbody) {
        weeklyTbody.innerHTML = weeklyKeys.map((key, i) => {
            const data = weeklyData[key];
            const prevData = i > 0 ? weeklyData[weeklyKeys[i-1]] : null;
            const change = prevData ? ((data.total - prevData.total) / prevData.total * 100).toFixed(1) : '-';
            const changeClass = change > 0 ? 'change-positive' : change < 0 ? 'change-negative' : '';
            
            return `
                <tr>
                    <td>${key}</td>
                    <td>${formatNumber(data.count)}</td>
                    <td>${formatCurrency(data.total)}</td>
                    <td class="${changeClass}">${change !== '-' ? (change > 0 ? '+' : '') + change + '%' : '-'}</td>
                </tr>
            `;
        }).join('');
    }
    
    // 월간 테이블
    const monthlyData = reportData.monthly || {};
    const monthlyKeys = Object.keys(monthlyData);
    const monthlyTbody = document.querySelector('#monthlyTable tbody');
    
    if (monthlyTbody) {
        monthlyTbody.innerHTML = monthlyKeys.map((key, i) => {
            const data = monthlyData[key];
            const prevData = i > 0 ? monthlyData[monthlyKeys[i-1]] : null;
            const change = prevData ? ((data.total - prevData.total) / prevData.total * 100).toFixed(1) : '-';
            const changeClass = change > 0 ? 'change-positive' : change < 0 ? 'change-negative' : '';
            
            return `
                <tr>
                    <td>${key}</td>
                    <td>${formatNumber(data.count)}</td>
                    <td>${formatCurrency(data.total)}</td>
                    <td class="${changeClass}">${change !== '-' ? (change > 0 ? '+' : '') + change + '%' : '-'}</td>
                </tr>
            `;
        }).join('');
    }
    
    // 지점 테이블
    renderStoreTable(reportData.stores || []);
}

function renderStoreTable(stores) {
    const totalSales = stores.reduce((sum, s) => sum + s.total, 0);
    const tbody = document.querySelector('#storeTable tbody');
    
    if (tbody) {
        tbody.innerHTML = stores.map((store, i) => {
            const ratio = totalSales > 0 ? ((store.total / totalSales) * 100).toFixed(1) : 0;
            return `
                <tr>
                    <td>${i + 1}</td>
                    <td>${store.name}</td>
                    <td>${formatNumber(store.count)}</td>
                    <td>${formatCurrency(store.total)}</td>
                    <td>${ratio}%</td>
                </tr>
            `;
        }).join('');
    }
}

// 가격 카드 초기화
function initPriceCards() {
    renderPriceCards(reportData.price_changes || []);
}

function renderPriceCards(priceChanges) {
    const container = document.getElementById('priceCards');
    if (!container) return;
    
    container.innerHTML = priceChanges.map(item => {
        const changeClass = item.change > 0 ? 'up' : item.change < 0 ? 'down' : 'neutral';
        const arrow = item.change > 0 ? '↑' : item.change < 0 ? '↓' : '-';
        
        return `
            <div class="price-card" data-code="${item.code}">
                <div class="price-card-header">
                    <div class="price-card-name">${item.name}</div>
                    <div class="price-card-category">${item.category}</div>
                </div>
                <div class="price-card-body">
                    <div class="price-range">
                        ${formatNumber(item.first_price)}원 → ${formatNumber(item.last_price)}원
                    </div>
                    <div class="price-change ${changeClass}">
                        ${arrow} ${Math.abs(item.change_pct)}%
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // 클릭 이벤트
    container.querySelectorAll('.price-card').forEach(card => {
        card.addEventListener('click', () => {
            const code = card.dataset.code;
            const item = priceChanges.find(p => p.code === code);
            if (item) showPriceModal(item);
        });
    });
}

// 탭 이벤트
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab)?.classList.add('active');
        });
    });
}

// 필터 이벤트
function initFilters() {
    // 가격 검색
    document.getElementById('priceSearch')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = (reportData.price_changes || []).filter(
            item => item.name.toLowerCase().includes(query) || 
                    item.code.includes(query)
        );
        renderPriceCards(filtered);
    });
    
    // 가격 정렬
    document.getElementById('priceSort')?.addEventListener('change', (e) => {
        let sorted = [...(reportData.price_changes || [])];
        switch (e.target.value) {
            case 'change_desc':
                sorted.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
                break;
            case 'change_asc':
                sorted.sort((a, b) => Math.abs(a.change_pct) - Math.abs(b.change_pct));
                break;
            case 'price_desc':
                sorted.sort((a, b) => b.last_price - a.last_price);
                break;
            case 'name_asc':
                sorted.sort((a, b) => a.name.localeCompare(b.name));
                break;
        }
        renderPriceCards(sorted);
    });
    
    // 지점 검색
    document.getElementById('storeSearch')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = (reportData.stores || []).filter(
            store => store.name.toLowerCase().includes(query)
        );
        renderStoreTable(filtered);
    });
}

// 모달
function initModal() {
    const modal = document.getElementById('priceModal');
    const closeBtn = modal?.querySelector('.modal-close');
    
    closeBtn?.addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
}

function showPriceModal(item) {
    const modal = document.getElementById('priceModal');
    if (!modal) return;
    
    document.getElementById('modalTitle').textContent = item.name;
    
    // 가격 히스토리 차트
    const ctx = document.getElementById('priceHistoryChart')?.getContext('2d');
    if (ctx) {
        if (charts.priceHistory) {
            charts.priceHistory.destroy();
        }
        
        const history = item.history || [];
        charts.priceHistory = new Chart(ctx, {
            type: 'line',
            data: {
                labels: history.map(h => h.date),
                datasets: [{
                    label: '단가',
                    data: history.map(h => h.price),
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    fill: true,
                    tension: 0.2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { 
                        ticks: { color: '#888' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: { 
                        ticks: { 
                            color: '#888',
                            callback: v => formatNumber(v) + '원'
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
            <div class="detail-value">${item.category}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">첫 가격</div>
            <div class="detail-value">${formatNumber(item.first_price)}원</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">현재 가격</div>
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
            <div class="detail-label">가격 변동</div>
            <div class="detail-value ${changeClass}">${item.change > 0 ? '+' : ''}${formatNumber(item.change)}원</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">변동률</div>
            <div class="detail-value ${changeClass}">${item.change_pct > 0 ? '+' : ''}${item.change_pct}%</div>
        </div>
    `;
    
    modal.classList.add('show');
}

// 초기화
document.addEventListener('DOMContentLoaded', loadData);
