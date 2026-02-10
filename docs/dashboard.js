/**
 * 통합 대시보드
 * - 고객 현황: sales_data.json + customer_stats_config.json (비율 기반 추정)
 * - 순위 변동: marketing_data.json tracking_history (최근 3일 비교)
 * - 발주 가격 변동: report_data.json price_changes (변동분만 + 클릭 모달)
 *
 * 원칙:
 * - 필터 없음 (전체 지점, 전체 기간)
 * - 차트 증식 방지: destroy + canvas 재생성
 * - 공통 UI(style.css) 톤 유지
 */

let salesData = null;
let marketingData = null;
let orderData = null;
let customerConfig = null;

const BASE_PRICE = 11000;

let charts = {
    gender: null,
    dailyCustomer: null,
    genderDonut: null,
    ageDonut: null,
    ageBar: null,
    priceHistory: null
};

const DEFAULT_CUSTOMER_CONFIG = {
    base_price: 11000,
    gender_ratio: { male: 53, female: 47 },
    age_ratio: { '20대': 11.7, '30대': 37.0, '40대': 28.0, '50대': 18.7, '60대이상': 4.7 },
    age_gender_detail: {
        male: { '20대': 11.7, '30대': 33.7, '40대': 33.3, '50대': 22.0, '60대이상': 3.7 },
        female: { '20대': 11.7, '30대': 36.3, '40대': 23.0, '50대': 22.0, '60대이상': 6.3 }
    }
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
    await loadAllData();
    renderAll();
    bindModalEvents();
}

/* =========================
   데이터 로딩
   ========================= */

async function loadAllData() {
    var bust = 't=' + Date.now();

    var requests = [
        fetch('sales_data.json?' + bust).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }),
        fetch('marketing_data.json?' + bust).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }),
        fetch('report_data.json?' + bust).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }),
        fetch('customer_stats_config.json?' + bust).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; })
    ];

    var results = await Promise.all(requests);
    salesData = results[0];
    marketingData = results[1];
    orderData = results[2];
    customerConfig = results[3] || DEFAULT_CUSTOMER_CONFIG;

    updateUpdateTime();
}

function updateUpdateTime() {
    var el = document.getElementById('updateTime');
    if (!el) return;

    var times = [];
    if (salesData && salesData.generated_at) times.push(new Date(salesData.generated_at));
    if (marketingData && marketingData.generated_at) times.push(new Date(marketingData.generated_at));
    if (orderData && orderData.generated_at) times.push(new Date(orderData.generated_at));

    var latest = null;
    times.forEach(function(d) {
        if (!latest || d > latest) latest = d;
    });

    if (latest) {
        el.textContent = '마지막 업데이트: ' + formatDateTime(latest);
    } else {
        el.textContent = '마지막 업데이트: -';
    }
}

/* =========================
   렌더링 진입
   ========================= */

function renderAll() {
    renderCustomerSection();
    renderRankChangeTable();
    renderPriceChangeTable();
}

/* =========================
   1) 고객 현황
   ========================= */

function renderCustomerSection() {
    if (!salesData) return;

    var genderRatio = (customerConfig && customerConfig.gender_ratio) ? customerConfig.gender_ratio : DEFAULT_CUSTOMER_CONFIG.gender_ratio;
    var ageRatio = (customerConfig && customerConfig.age_ratio) ? customerConfig.age_ratio : DEFAULT_CUSTOMER_CONFIG.age_ratio;
    var ageGenderDetail = (customerConfig && customerConfig.age_gender_detail) ? customerConfig.age_gender_detail : DEFAULT_CUSTOMER_CONFIG.age_gender_detail;

    // 전체 매출 기반 고객 수
    var totalSales = (salesData.summary && salesData.summary.total_sales) ? salesData.summary.total_sales : 0;
    var totalCustomers = Math.ceil(totalSales / BASE_PRICE) || 0;

    var male = Math.round(totalCustomers * (genderRatio.male / 100));
    var female = Math.max(0, totalCustomers - male);

    // 최근 30일 유입
    var recentMonthCustomers = calcRecentDaysCustomers(30);

    // 최대 일 유입 (최근 1년)
    var maxDayCustomers = calcMaxDayCustomers(365);

    // 주요 고객 연령층
    var topAge = getTopAgeGroup(ageRatio);

    // 카드 값 업데이트
    setText('totalCustomers', formatNumber(totalCustomers) + '명');
    setText('maleCustomers', formatNumber(male) + '명');
    setText('femaleCustomers', formatNumber(female) + '명');
    setText('recentMonthCustomers', formatNumber(recentMonthCustomers) + '명');
    setText('maxDayCustomers', formatNumber(maxDayCustomers) + '명');
    setText('topAgeGroup', topAge);

    // 차트 초기화
    destroyAllCharts();

    // 좌상단: 성별 미니 도넛
    renderGenderMiniChart(male, female);

    // 중앙상단: 일별 유입 추이 (최근 90일)
    renderDailyCustomerChart();

    // 하단좌측: 성별 도넛
    renderGenderDonutChart(male, female);

    // 하단좌측: 연령 도넛
    renderAgeDonutChart(totalCustomers, ageRatio);

    // 하단우측: 연령별 남녀 막대
    renderAgeBarChart(totalCustomers, ageGenderDetail, genderRatio);
}

function calcRecentDaysCustomers(days) {
    if (!salesData || !Array.isArray(salesData.daily)) return 0;

    var dailyArr = salesData.daily;
    var maxDate = getMaxDate(dailyArr.map(function(d) { return d.date; }).filter(Boolean));
    if (!maxDate) return 0;

    var startDate = addDays(maxDate, -(days - 1));
    var totalSales = 0;

    for (var i = 0; i < dailyArr.length; i++) {
        var row = dailyArr[i];
        if (!row || !row.date) continue;
        if (row.date < startDate || row.date > maxDate) continue;
        totalSales += (row.total || 0);
    }

    return Math.ceil(totalSales / BASE_PRICE) || 0;
}

function calcMaxDayCustomers(days) {
    if (!salesData || !Array.isArray(salesData.daily)) return 0;

    var dailyArr = salesData.daily;
    var maxDate = getMaxDate(dailyArr.map(function(d) { return d.date; }).filter(Boolean));
    if (!maxDate) return 0;

    var startDate = addDays(maxDate, -(days - 1));
    var maxSales = 0;

    for (var i = 0; i < dailyArr.length; i++) {
        var row = dailyArr[i];
        if (!row || !row.date) continue;
        if (row.date < startDate || row.date > maxDate) continue;
        if ((row.total || 0) > maxSales) maxSales = row.total;
    }

    return Math.ceil(maxSales / BASE_PRICE) || 0;
}

function getTopAgeGroup(ageRatio) {
    var maxKey = '';
    var maxVal = 0;
    var keys = Object.keys(ageRatio);
    for (var i = 0; i < keys.length; i++) {
        if (ageRatio[keys[i]] > maxVal) {
            maxVal = ageRatio[keys[i]];
            maxKey = keys[i];
        }
    }
    return maxKey ? maxKey + ' (' + maxVal + '%)' : '-';
}

function destroyAllCharts() {
    var keys = Object.keys(charts);
    for (var i = 0; i < keys.length; i++) {
        if (charts[keys[i]]) {
            charts[keys[i]].destroy();
            charts[keys[i]] = null;
        }
    }
}

function recreateCanvas(containerId, canvasId) {
    var container = document.getElementById(containerId);
    if (!container) return null;

    var old = document.getElementById(canvasId);
    if (old) old.remove();

    var c = document.createElement('canvas');
    c.id = canvasId;
    container.appendChild(c);
    return c.getContext('2d');
}

/* ---- 좌상단: 성별 미니 도넛 ---- */
function renderGenderMiniChart(male, female) {
    var ctx = recreateCanvas('genderChartContainer', 'genderChart');
    if (!ctx) return;

    charts.gender = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['남성', '여성'],
            datasets: [{
                data: [male, female],
                backgroundColor: ['#4ecdc4', '#7b2cbf'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(c) {
                            var total = male + female;
                            var pct = total > 0 ? Math.round(c.raw / total * 100) : 0;
                            return c.label + ': ' + formatNumber(c.raw) + '명 (' + pct + '%)';
                        }
                    }
                }
            }
        }
    });
}

/* ---- 중앙상단: 일별 유입 추이 (최근 90일) ---- */
function renderDailyCustomerChart() {
    var ctx = recreateCanvas('dailyCustomerChartContainer', 'dailyCustomerChart');
    if (!ctx) return;

    if (!salesData || !Array.isArray(salesData.daily)) return;

    var dailyArr = salesData.daily;
    var maxDate = getMaxDate(dailyArr.map(function(d) { return d.date; }).filter(Boolean));
    if (!maxDate) return;

    var startDate = addDays(maxDate, -89);
    var filtered = [];

    for (var i = 0; i < dailyArr.length; i++) {
        var row = dailyArr[i];
        if (!row || !row.date) continue;
        if (row.date >= startDate && row.date <= maxDate) {
            filtered.push(row);
        }
    }

    filtered.sort(function(a, b) { return a.date.localeCompare(b.date); });

    var labels = filtered.map(function(d) { return formatDateShort(d.date); });
    var customers = filtered.map(function(d) { return Math.ceil((d.total || 0) / BASE_PRICE); });

    charts.dailyCustomer = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '일별 고객 수(추정)',
                data: customers,
                borderColor: '#00d4ff',
                backgroundColor: 'rgba(0,212,255,0.08)',
                fill: true,
                tension: 0,
                pointRadius: 1,
                pointHoverRadius: 4,
                borderWidth: 1.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: function(items) {
                            var idx = items[0].dataIndex;
                            return formatDateKorean(filtered[idx].date);
                        },
                        label: function(c) {
                            return '고객 수(추정): ' + formatNumber(c.raw) + '명';
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#666', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
                    grid: { display: false }
                },
                y: {
                    ticks: { color: '#666' },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    beginAtZero: true
                }
            }
        }
    });
}

/* ---- 하단좌측: 성별 도넛 ---- */
function renderGenderDonutChart(male, female) {
    var ctx = recreateCanvas('genderDonutContainer', 'genderDonutChart');
    if (!ctx) return;

    charts.genderDonut = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['남성', '여성'],
            datasets: [{
                data: [male, female],
                backgroundColor: ['#4ecdc4', '#7b2cbf'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#ccc', font: { size: 11 }, padding: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: function(c) {
                            var total = male + female;
                            var pct = total > 0 ? Math.round(c.raw / total * 100) : 0;
                            return c.label + ': ' + formatNumber(c.raw) + '명 (' + pct + '%)';
                        }
                    }
                }
            }
        }
    });
}

/* ---- 하단좌측: 연령 도넛 ---- */
function renderAgeDonutChart(totalCustomers, ageRatio) {
    var ctx = recreateCanvas('ageDonutContainer', 'ageDonutChart');
    if (!ctx) return;

    var labels = Object.keys(ageRatio);
    var values = labels.map(function(k) { return Math.round(totalCustomers * (ageRatio[k] / 100)); });

    charts.ageDonut = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: ['#00d4ff', '#7b2cbf', '#4ecdc4', '#ffe66d', '#ff6b6b'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '55%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#ccc', font: { size: 11 }, padding: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: function(c) {
                            return c.label + ': ' + formatNumber(c.raw) + '명';
                        }
                    }
                }
            }
        }
    });
}

/* ---- 하단우측: 연령별 남녀 가로 막대 ---- */
function renderAgeBarChart(totalCustomers, ageGenderDetail, genderRatio) {
    var ctx = recreateCanvas('ageBarChartContainer', 'ageBarChart');
    if (!ctx) return;

    var maleTotal = Math.round(totalCustomers * (genderRatio.male / 100));
    var femaleTotal = Math.max(0, totalCustomers - maleTotal);

    var maleDetail = ageGenderDetail.male || {};
    var femaleDetail = ageGenderDetail.female || {};

    var ageLabels = Object.keys(maleDetail);
    if (ageLabels.length === 0) ageLabels = Object.keys(femaleDetail);

    var maleData = ageLabels.map(function(k) { return Math.round(maleTotal * ((maleDetail[k] || 0) / 100)); });
    var femaleData = ageLabels.map(function(k) { return Math.round(femaleTotal * ((femaleDetail[k] || 0) / 100)); });

    charts.ageBar = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ageLabels,
            datasets: [
                {
                    label: '남성',
                    data: maleData,
                    backgroundColor: 'rgba(78,205,196,0.75)',
                    borderWidth: 0,
                    borderRadius: 3
                },
                {
                    label: '여성',
                    data: femaleData,
                    backgroundColor: 'rgba(123,44,191,0.75)',
                    borderWidth: 0,
                    borderRadius: 3
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#ccc', font: { size: 11 }, padding: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: function(c) {
                            return c.dataset.label + ': ' + formatNumber(c.raw) + '명';
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#666' },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    beginAtZero: true
                },
                y: {
                    ticks: { color: '#ccc' },
                    grid: { display: false }
                }
            }
        }
    });
}

/* =========================
   2) 플레이스 순위 변동 (최근 3일)
   ========================= */

function renderRankChangeTable() {
    var tbody = document.getElementById('rankChangeTableBody');
    if (!tbody) return;

    if (!marketingData || !marketingData.tracking_history) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">마케팅 데이터가 없습니다.</td></tr>';
        return;
    }

    var rows = [];
    var keys = Object.keys(marketingData.tracking_history);

    for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        var item = marketingData.tracking_history[key];
        var history = (item && item.history) ? item.history : [];
        if (history.length < 2) continue;

        // 최근 3일치 히스토리만 사용
        var recentHistory = getRecent3DaysHistory(history);
        if (recentHistory.length < 2) continue;

        var latest = recentHistory[0];
        var prev = recentHistory[recentHistory.length - 1];

        var currRank = (latest && latest.rank !== null && latest.rank !== undefined) ? Number(latest.rank) : null;
        var prevRank = (prev && prev.rank !== null && prev.rank !== undefined) ? Number(prev.rank) : null;

        // NaN 처리
        if (currRank !== null && isNaN(currRank)) currRank = null;
        if (prevRank !== null && isNaN(prevRank)) prevRank = null;

        var changed = !(currRank === prevRank);
        if (!changed) continue;

        var store = item.store_name || key.split('|')[0] || '';
        var keyword = item.keyword || key.split('|')[1] || '';
        var date = latest.date || '';

        var delta = calcRankDelta(currRank, prevRank);

        rows.push({
            store: store,
            keyword: keyword,
            currRank: currRank,
            prevRank: prevRank,
            delta: delta,
            date: date
        });
    }

    // 정렬: 변화가 큰 것 우선
    rows.sort(function(a, b) {
        var da = rankDeltaScore(a.delta);
        var db = rankDeltaScore(b.delta);
        if (da !== db) return db - da;

        var ar = a.currRank === null ? 9999 : a.currRank;
        var br = b.currRank === null ? 9999 : b.currRank;
        return ar - br;
    });

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">최근 3일간 순위 변동 내역이 없습니다.</td></tr>';
        return;
    }

    var limit = rows.slice(0, 30);
    var html = '';

    for (var i = 0; i < limit.length; i++) {
        var r = limit[i];
        var curr = r.currRank === null ? '순위권 밖' : r.currRank + '위';
        var prev = r.prevRank === null ? '순위권 밖' : r.prevRank + '위';
        var badgeClass = rankBadgeClass(r.currRank);
        var deltaHtml = renderDeltaBadge(r.delta);

        html += '<tr>'
            + '<td>' + escapeHtml(r.store) + '</td>'
            + '<td>' + escapeHtml(r.keyword) + '</td>'
            + '<td class="text-center"><span class="badge-rank ' + badgeClass + '">' + curr + '</span></td>'
            + '<td class="text-center">' + prev + '</td>'
            + '<td class="text-center">' + deltaHtml + '</td>'
            + '<td>' + escapeHtml(r.date) + '</td>'
            + '</tr>';
    }

    tbody.innerHTML = html;
}

function getRecent3DaysHistory(history) {
    if (!history || history.length === 0) return [];

    // history는 날짜 내림차순(최신이 [0])으로 가정
    var sorted = history.slice().sort(function(a, b) {
        return (b.date || '').localeCompare(a.date || '');
    });

    var latestDate = sorted[0].date;
    if (!latestDate) return [];

    var cutoffDate = addDays(latestDate, -2); // 최근 3일
    var result = [];

    for (var i = 0; i < sorted.length; i++) {
        if (sorted[i].date && sorted[i].date >= cutoffDate) {
            result.push(sorted[i]);
        }
    }

    return result;
}

function calcRankDelta(currRank, prevRank) {
    if (currRank !== null && prevRank !== null) {
        var diff = prevRank - currRank;
        if (diff > 0) return { type: 'up', value: diff };
        if (diff < 0) return { type: 'down', value: Math.abs(diff) };
        return { type: 'same', value: 0 };
    }
    if (currRank !== null && prevRank === null) {
        return { type: 'new', value: 1 };
    }
    if (currRank === null && prevRank !== null) {
        return { type: 'out', value: 1 };
    }
    return { type: 'same', value: 0 };
}

function rankDeltaScore(delta) {
    if (!delta) return 0;
    if (delta.type === 'up') return 2000 + (delta.value || 0);
    if (delta.type === 'down') return 1000 + (delta.value || 0);
    if (delta.type === 'new') return 1500;
    if (delta.type === 'out') return 1400;
    return 0;
}

function rankBadgeClass(rank) {
    if (rank === null) return 'out';
    if (rank <= 10) return 'good';
    if (rank <= 30) return 'warn';
    return 'bad';
}

function renderDeltaBadge(delta) {
    if (!delta) return '<span class="delta">-</span>';

    if (delta.type === 'up') return '<span class="delta delta-up">+' + delta.value + '</span>';
    if (delta.type === 'down') return '<span class="delta delta-down">-' + delta.value + '</span>';
    if (delta.type === 'new') return '<span class="delta delta-new">진입</span>';
    if (delta.type === 'out') return '<span class="delta delta-out">이탈</span>';
    return '<span class="delta">-</span>';
}

/* =========================
   3) 발주 가격 변동 품목
   ========================= */

function renderPriceChangeTable() {
    var tbody = document.getElementById('priceChangeTableBody');
    if (!tbody) return;

    if (!orderData || !Array.isArray(orderData.price_changes)) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">발주 데이터가 없습니다.</td></tr>';
        return;
    }

    // 변동이 있는 품목만
    var changed = [];
    for (var i = 0; i < orderData.price_changes.length; i++) {
        var x = orderData.price_changes[i];
        if (x && typeof x.change === 'number' && x.change !== 0) {
            changed.push(x);
        }
    }

    if (changed.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">가격 변동 품목이 없습니다.</td></tr>';
        return;
    }

    // 변동률 절대값 기준 정렬
    changed.sort(function(a, b) {
        return Math.abs(b.change_pct || 0) - Math.abs(a.change_pct || 0);
    });

    var top = changed.slice(0, 40);
    var html = '';

    for (var j = 0; j < top.length; j++) {
        var item = top[j];
        var first = item.first_price || 0;
        var last = item.last_price || 0;
        var change = item.change || 0;
        var pct = (typeof item.change_pct === 'number') ? item.change_pct : 0;

        var changeText = (change > 0) ? '+' + formatNumber(change) : '-' + formatNumber(Math.abs(change));
        var pctText = (pct > 0) ? '+' + pct + '%' : pct + '%';
        var pctClass = (pct > 0) ? 'change-positive' : 'change-negative';

        html += '<tr data-price-idx="' + j + '">'
            + '<td>' + escapeHtml(item.name || '') + '</td>'
            + '<td>' + escapeHtml(item.category || '') + '</td>'
            + '<td class="text-right">' + formatCurrency(first) + '</td>'
            + '<td class="text-right">' + formatCurrency(last) + '</td>'
            + '<td class="text-right ' + pctClass + '">' + changeText + '</td>'
            + '<td class="text-right ' + pctClass + '">' + pctText + '</td>'
            + '</tr>';
    }

    tbody.innerHTML = html;

    // 클릭 이벤트 바인딩
    var rows = tbody.querySelectorAll('tr[data-price-idx]');
    for (var r = 0; r < rows.length; r++) {
        rows[r].addEventListener('click', function() {
            var idx = parseInt(this.getAttribute('data-price-idx'), 10);
            openPriceDetailModal(top[idx]);
        });
    }
}

/* =========================
   4) 가격 변동 상세 모달
   ========================= */

function bindModalEvents() {
    var modal = document.getElementById('priceDetailModal');
    var closeBtn = document.getElementById('priceModalClose');

    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            closePriceModal();
        });
    }

    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closePriceModal();
            }
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closePriceModal();
        }
    });
}

function openPriceDetailModal(item) {
    var modal = document.getElementById('priceDetailModal');
    if (!modal || !item) return;

    // 제목
    var titleEl = document.getElementById('priceModalTitle');
    if (titleEl) {
        titleEl.textContent = (item.name || '품목') + ' - 가격 변동 상세';
    }

    // 요약 카드
    var summaryEl = document.getElementById('priceModalSummary');
    if (summaryEl) {
        var first = item.first_price || 0;
        var last = item.last_price || 0;
        var change = item.change || 0;
        var pct = (typeof item.change_pct === 'number') ? item.change_pct : 0;
        var pctClass = (pct > 0) ? 'change-positive' : 'change-negative';
        var changeText = (change > 0) ? '+' + formatNumber(change) + '원' : '-' + formatNumber(Math.abs(change)) + '원';
        var pctText = (pct > 0) ? '+' + pct + '%' : pct + '%';

        summaryEl.innerHTML = ''
            + '<div class="detail-item"><div class="detail-label">품목코드</div><div class="detail-value">' + escapeHtml(item.code || '-') + '</div></div>'
            + '<div class="detail-item"><div class="detail-label">대분류</div><div class="detail-value">' + escapeHtml(item.category || '-') + '</div></div>'
            + '<div class="detail-item"><div class="detail-label">시작가</div><div class="detail-value">' + formatCurrency(first) + '</div></div>'
            + '<div class="detail-item"><div class="detail-label">현재가</div><div class="detail-value">' + formatCurrency(last) + '</div></div>'
            + '<div class="detail-item"><div class="detail-label">변동액</div><div class="detail-value ' + pctClass + '">' + changeText + '</div></div>'
            + '<div class="detail-item"><div class="detail-label">변동률</div><div class="detail-value ' + pctClass + '">' + pctText + '</div></div>';
    }

    // 가격 추이 차트
    renderPriceHistoryChart(item);

    // 가격 변동 내역 테이블
    renderPriceHistoryTable(item);

    modal.classList.add('show');
}

function closePriceModal() {
    var modal = document.getElementById('priceDetailModal');
    if (modal) modal.classList.remove('show');

    if (charts.priceHistory) {
        charts.priceHistory.destroy();
        charts.priceHistory = null;
    }
}

function renderPriceHistoryChart(item) {
    var ctx = recreateCanvas('priceHistoryChartContainer', 'priceHistoryChart');
    if (!ctx) return;

    var history = (item && item.history) ? item.history : [];
    if (history.length === 0) return;

    // 날짜순 정렬
    var sorted = history.slice().sort(function(a, b) {
        return (a.date || '').localeCompare(b.date || '');
    });

    var labels = sorted.map(function(h) { return formatDateShort(h.date); });
    var prices = sorted.map(function(h) { return h.price || 0; });

    charts.priceHistory = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '단가',
                data: prices,
                borderColor: '#00d4ff',
                backgroundColor: 'rgba(0,212,255,0.1)',
                fill: true,
                tension: 0,
                pointRadius: 3,
                pointHoverRadius: 6,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: function(items) {
                            var idx = items[0].dataIndex;
                            return formatDateKorean(sorted[idx].date);
                        },
                        label: function(c) {
                            return '단가: ' + formatCurrency(c.raw);
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#666', maxRotation: 45 },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color: '#666',
                        callback: function(v) { return formatNumber(v) + '원'; }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function renderPriceHistoryTable(item) {
    var tbody = document.getElementById('priceHistoryTableBody');
    if (!tbody) return;

    var history = (item && item.history) ? item.history : [];
    if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">변동 내역이 없습니다.</td></tr>';
        return;
    }

    // 날짜 내림차순
    var sorted = history.slice().sort(function(a, b) {
        return (b.date || '').localeCompare(a.date || '');
    });

    var html = '';
    for (var i = 0; i < sorted.length; i++) {
        var h = sorted[i];
        html += '<tr>'
            + '<td>' + escapeHtml(h.date || '-') + '</td>'
            + '<td>' + escapeHtml(h.store || '-') + '</td>'
            + '<td class="text-right">' + formatCurrency(h.price || 0) + '</td>'
            + '<td class="text-right">' + formatNumber(h.qty || 0) + '</td>'
            + '<td class="text-right">' + formatCurrency(h.total || 0) + '</td>'
            + '</tr>';
    }

    tbody.innerHTML = html;
}

/* =========================
   유틸리티
   ========================= */

function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
}

function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return new Intl.NumberFormat('ko-KR').format(num);
}

function formatCurrency(num) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return new Intl.NumberFormat('ko-KR').format(num) + '원';
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
    var parts = String(dateStr).split('-');
    if (parts.length !== 3) return dateStr;
    return parts[0] + '년 ' + parseInt(parts[1], 10) + '월 ' + parseInt(parts[2], 10) + '일';
}

function formatDateShort(dateStr) {
    if (!dateStr) return '-';
    var parts = String(dateStr).split('-');
    if (parts.length !== 3) return dateStr;
    return parseInt(parts[1], 10) + '/' + parseInt(parts[2], 10);
}

function getMaxDate(dates) {
    if (!dates || dates.length === 0) return null;
    return dates.slice().sort().pop();
}

function addDays(dateStr, deltaDays) {
    var d = parseDate(dateStr);
    if (!d) return dateStr;
    d.setDate(d.getDate() + deltaDays);
    return formatYmd(d);
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    var p = String(dateStr).split('-');
    if (p.length !== 3) return null;
    var y = parseInt(p[0], 10);
    var m = parseInt(p[1], 10) - 1;
    var d = parseInt(p[2], 10);
    var dt = new Date(y, m, d);
    if (isNaN(dt.getTime())) return null;
    return dt;
}

function formatYmd(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
}
