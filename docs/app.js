let reportData = null;
let charts = {};

function formatNumber(num) {
    return new Intl.NumberFormat('ko-KR').format(num);
}

function formatCurrency(num) {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(num);
}

async function loadData() {
    try {
        const response = await fetch('report_data.json');
        if (!response.ok) throw new Error('Data load failed');
        reportData = await response.json();
        initDashboard();
    } catch (error) {
        console.error('Error:', error);
        document.querySelector('.tab-content').innerHTML = `
            <div class="no-data">
                데이터를 불러올 수 없습니다.<br>
                크롤러를 먼저 실행해주세요.
            </div>
        `;
    }
}

function initDashboard() {
    if (!reportData) return;
    
    document.getElementById('updateTime').textContent = 
        '마지막 업데이트: ' + new Date(reportData.generated_at).toLocaleString('ko-KR');
    
    const summary = reportData.summary;
    document.getElementById('totalRecords').textContent = formatNumber(summary.total_records || 0);
    document.getElementById('totalStores').textContent = formatNumber(summary.total_stores || 0);
    document.getElementById('totalProducts').textContent = formatNumber(summary.total_products || 0);
    document.getElementById('totalSales').textContent = formatCurrency(summary.total_sales || 0);
    
    initCharts();
    initTables();
    initPriceCards();
    initStoreSelect();
    initTabs();
    initFilters();
    initModal();
}

function initCharts() {
    const chartOptions = {
        responsive: true,
        plugins: { legend: { display: false } },
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
    };

    // Daily Chart
    const dailyData = reportData.daily || {};
    const dailyLabels = Object.keys(dailyData).slice(-30);
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
            options: chartOptions
        });
    }
    
    // Category Chart
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
    
    // Top Stores Chart
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
                plugins: { legend: { display: false } },
                scales: {
                    x: { 
                        ticks: { color: '#888', callback: v => formatNumber(v) },
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
    
    // Weekly Chart
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
            options: chartOptions
        });
    }
    
    // Monthly Chart
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
            options: chartOptions
        });
    }
}

function initTables() {
    // Weekly Table
    const weeklyData = reportData.weekly || {};
    const weeklyKeys = Object.keys(weeklyData);
    const weeklyTbody = document.querySelector('#weeklyTable tbody');
    
    if (weeklyTbody) {
        weeklyTbody.innerHTML = weeklyKeys.map((key, i) => {
            const data = weeklyData[key];
            const prevData = i > 0 ? weeklyData[weeklyKeys[i-1]] : null;
            const change = prevData && prevData.total > 0 
                ? ((data.total - prevData.total) / prevData.total * 100).toFixed(1) 
                : '-';
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
    
    // Monthly Table
    const monthlyData = reportData.monthly || {};
    const monthlyKeys = Object.keys(monthlyData);
    const monthlyTbody = document.querySelector('#monthlyTable tbody');
    
    if (monthlyTbody) {
        monthlyTbody.innerHTML = monthlyKeys.map((key, i) => {
            const data = monthlyData[key];
            const prevData = i > 0 ? monthlyData[monthlyKeys[i-1]] : null;
            const change = prevData && prevData.total > 0 
                ? ((data.total - prevData.total) / prevData.total * 100).toFixed(1) 
                : '-';
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

function initPriceCards() {
    renderPriceCards(reportData.price_changes || [], 'priceCards');
}

function renderPriceCards(priceChanges, containerId, showStore = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (priceChanges.length === 0) {
        container.innerHTML = '<div class="no-data">데이터가 없습니다.</div>';
        return;
    }
    
    container.innerHTML = priceChanges.map(item => {
        const changeClass = item.change > 0 ? 'up' : item.change < 0 ? 'down' : 'neutral';
        const arrow = item.change > 0 ? '+' : item.change < 0 ? '' : '';
        
        return `
            <div class="price-card" data-code="${item.code}" data-store="${item.store || ''}">
                <div class="price-card-header">
                    <div class="price-card-name">${item.name}</div>
                    <div class="price-card-category">${item.category}</div>
                </div>
                <div class="price-card-body">
                    <div class="price-range">
                        ${formatNumber(item.first_price)}원 -> ${formatNumber(item.last_price)}원
                    </div>
                    <div class="price-change ${changeClass}">
                        ${arrow}${item.change_pct}%
                    </div>
                </div>
                <div class="price-card-footer">
                    ${item.first_date} ~ ${item.last_date} (${item.count || item.history?.length || 0}건)
                </div>
            </div>
        `;
    }).join('');
    
    container.querySelectorAll('.price-card').forEach(card => {
        card.addEventListener('click', () => {
            const code = card.dataset.code;
            const store = card.dataset.store;
            let item;
            
            if (store && reportData.store_price_changes && reportData.store_price_changes[store]) {
                item = reportData.store_price_changes[store].find(p => p.code === code);
            } else {
                item = (reportData.price_changes || []).find(p => p.code === code);
            }
            
            if (item) showPriceModal(item);
        });
    });
}

function initStoreSelect() {
    const select = document.getElementById('storeSelect');
    if (!select) return;
    
    const storeList = reportData.store_list || [];
    
    select.innerHTML = '<option value="">지점 선택...</option>' +
        storeList.map(store => `<option value="${store}">${store}</option>`).join('');
    
    select.addEventListener('change', () => {
        const storeName = select.value;
        const storeInfo = document.getElementById('storeInfo');
        const container = document.getElementById('storePriceCards');
        
        if (!storeName) {
            storeInfo.classList.remove('show');
            container.innerHTML = '<div class="no-data">지점을 선택해주세요.</div>';
            return;
        }
        
        const storePrices = reportData.store_price_changes?.[storeName] || [];
        
        if (storePrices.length > 0) {
            const storeData = reportData.stores?.find(s => s.name === storeName);
            storeInfo.innerHTML = `
                <h4>${storeName}</h4>
                <p>총 ${storePrices.length}개 상품 가격 변동 | 
                   매출: ${storeData ? formatCurrency(storeData.total) : '-'}</p>
            `;
            storeInfo.classList.add('show');
            
            // 지점별 가격 데이터에 store 정보 추가
            const pricesWithStore = storePrices.map(p => ({...p, store: storeName}));
            renderPriceCards(pricesWithStore, 'storePriceCards', true);
        } else {
            storeInfo.classList.remove('show');
            container.innerHTML = '<div class="no-data">해당 지점의 가격 변동 데이터가 없습니다.</div>';
        }
    });
}

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

function initFilters() {
    // 전체 가격 검색
    document.getElementById('priceSearch')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = (reportData.price_changes || []).filter(
            item => item.name.toLowerCase().includes(query) || item.code.includes(query)
        );
        applyPriceSort(filtered, document.getElementById('priceSort')?.value || 'change_desc', 'priceCards');
    });
    
    // 전체 가격 정렬
    document.getElementById('priceSort')?.addEventListener('change', (e) => {
        const query = document.getElementById('priceSearch')?.value.toLowerCase() || '';
        let filtered = (reportData.price_changes || []).filter(
            item => item.name.toLowerCase().includes(query) || item.code.includes(query)
        );
        applyPriceSort(filtered, e.target.value, 'priceCards');
    });
    
    // 지점별 가격 검색
    document.getElementById('storePriceSearch')?.addEventListener('input', (e) => {
        const storeName = document.getElementById('storeSelect')?.value;
        if (!storeName) return;
        
        const query = e.target.value.toLowerCase();
        const storePrices = reportData.store_price_changes?.[storeName] || [];
        const filtered = storePrices.filter(
            item => item.name.toLowerCase().includes(query) || item.code.includes(query)
        ).map(p => ({...p, store: storeName}));
        
        applyPriceSort(filtered, document.getElementById('storePriceSort')?.value || 'change_desc', 'storePriceCards');
    });
    
    // 지점별 가격 정렬
    document.getElementById('storePriceSort')?.addEventListener('change', (e) => {
        const storeName = document.getElementById('storeSelect')?.value;
        if (!storeName) return;
        
        const query = document.getElementById('storePriceSearch')?.value.toLowerCase() || '';
        const storePrices = reportData.store_price_changes?.[storeName] || [];
        const filtered = storePrices.filter(
            item => item.name.toLowerCase().includes(query) || item.code.includes(query)
        ).map(p => ({...p, store: storeName}));
        
        applyPriceSort(filtered, e.target.value, 'storePriceCards');
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

function applyPriceSort(data, sortType, containerId) {
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
    
    renderPriceCards(sorted, containerId);
}

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
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.classList.contains('show')) {
            modal.classList.remove('show');
        }
    });
}

function showPriceModal(item) {
    const modal = document.getElementById('priceModal');
    if (!modal) return;
    
    document.getElementById('modalTitle').textContent = item.name;
    
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
                            callback: v => formatNumber(v) + '원'
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }
    
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

document.addEventListener('DOMContentLoaded', loadData);
