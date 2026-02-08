/**
 * ROAS 분석 대시보드
 * 100% 클라이언트 사이드 (API 없음)
 * localStorage 누적 저장
 * Excel/CSV 파일 파싱 (XLSX 라이브러리)
 */

const STORAGE_KEY = 'roas_dashboard_data';

let currentDailyData = [];
let currentCampaignData = [];
let currentDateFilter = 'all';
let manualDataBuffer = [];
let currentMemoTarget = null;

let trendChart = null;
let salesDistChart = null;
let budgetPieChart = null;
let funnelChart = null;
let weekdayChart = null;

// ============================================
// 초기화
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initFileUpload();
    initDateInputListeners();
    loadAndDisplay();
});

function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });
}

function initFileUpload() {
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
            fileInput.value = '';
        }
    });
}

function initDateInputListeners() {
    const s = document.getElementById('dateStart');
    const e = document.getElementById('dateEnd');
    s.addEventListener('change', () => { if (s.value && e.value) applyCustomDateRange(); });
    e.addEventListener('change', () => { if (s.value && e.value) applyCustomDateRange(); });
}

// ============================================
// 가이드 토글
// ============================================

function toggleGuide() {
    const body = document.getElementById('guideBody');
    const icon = document.getElementById('guideToggleIcon');
    body.classList.toggle('open');
    icon.textContent = body.classList.contains('open') ? '접기' : '펼치기';
}

// ============================================
// localStorage 관리
// ============================================

function saveToStorage(newData) {
    const existing = loadFromStorage();
    const merged = mergeData(existing, newData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
}

function loadFromStorage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) { return []; }
}

function mergeData(existing, newData) {
    const merged = [...existing];
    newData.forEach(item => {
        const idx = merged.findIndex(m => m.date === item.date && m.campaign_name === item.campaign_name);
        if (idx >= 0) merged[idx] = item;
        else merged.push(item);
    });
    merged.sort((a, b) => a.date.localeCompare(b.date));
    return merged;
}

function clearAllData() {
    if (!confirm('모든 누적 데이터를 삭제하시겠습니까?')) return;
    localStorage.removeItem(STORAGE_KEY);
    currentDailyData = [];
    currentCampaignData = [];
    displayAll(null);
    alert('데이터가 초기화되었습니다.');
}

// ============================================
// 데이터 로드 및 표시
// ============================================

function loadAndDisplay() {
    const data = loadFromStorage();
    if (data.length > 0) {
        currentDailyData = data;
        displayAll(calculateMetrics(data));
    }
}

function displayAll(metrics) {
    displaySummaryCards(metrics);
    displayMetricCards(metrics);
    displayTrendChart(metrics);
    displaySalesDistribution(metrics);
    displayLeadSummary(metrics);
    displayBudgetPie(metrics);
    displayFunnel(metrics);
    displayWeekday(metrics);
    displayCampaignTable(metrics);
    displayTopTables(metrics);
}

// ============================================
// 지표 계산
// ============================================

function calculateMetrics(dailyData) {
    if (!dailyData || dailyData.length === 0) return null;

    const totals = dailyData.reduce((acc, row) => {
        acc.spend += parseFloat(row.spend) || 0;
        acc.revenue += parseFloat(row.revenue) || 0;
        acc.clicks += parseInt(row.clicks) || 0;
        acc.conversions += parseInt(row.conversions) || 0;
        acc.impressions += parseInt(row.impressions) || 0;
        return acc;
    }, { spend: 0, revenue: 0, clicks: 0, conversions: 0, impressions: 0 });

    const campaigns = calculateCampaigns(dailyData);

    const dailyMap = {};
    dailyData.forEach(row => {
        if (!dailyMap[row.date]) dailyMap[row.date] = { date: row.date, spend: 0, revenue: 0, clicks: 0, conversions: 0, impressions: 0 };
        dailyMap[row.date].spend += parseFloat(row.spend) || 0;
        dailyMap[row.date].revenue += parseFloat(row.revenue) || 0;
        dailyMap[row.date].clicks += parseInt(row.clicks) || 0;
        dailyMap[row.date].conversions += parseInt(row.conversions) || 0;
        dailyMap[row.date].impressions += parseInt(row.impressions) || 0;
    });

    const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
    dailyTrend.forEach(d => {
        d.roas = d.spend > 0 ? d.revenue / d.spend : 0;
        d.ctr = d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0;
        d.cvr = d.clicks > 0 ? (d.conversions / d.clicks) * 100 : 0;
    });

    return {
        total_spend: totals.spend, total_revenue: totals.revenue,
        total_clicks: totals.clicks, total_conversions: totals.conversions,
        total_impressions: totals.impressions,
        avg_roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
        avg_ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
        avg_cpa: totals.conversions > 0 ? totals.spend / totals.conversions : 0,
        cvr: totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0,
        daily_trend: dailyTrend, campaigns: campaigns, raw: dailyData
    };
}

function calculateCampaigns(dailyData) {
    const map = {};
    dailyData.forEach(row => {
        const name = row.campaign_name || 'Unknown';
        if (!map[name]) map[name] = { campaign_name: name, ad_type: row.ad_type || 'sales', spend: 0, revenue: 0, clicks: 0, conversions: 0, impressions: 0 };
        map[name].spend += parseFloat(row.spend) || 0;
        map[name].revenue += parseFloat(row.revenue) || 0;
        map[name].clicks += parseInt(row.clicks) || 0;
        map[name].conversions += parseInt(row.conversions) || 0;
        map[name].impressions += parseInt(row.impressions) || 0;
    });

    const campaigns = Object.values(map).map(c => {
        c.roas = c.spend > 0 ? c.revenue / c.spend : 0;
        c.ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
        c.cpa = c.conversions > 0 ? c.spend / c.conversions : 0;
        c.cvr = c.clicks > 0 ? (c.conversions / c.clicks) * 100 : 0;
        c.status = getStatus(c);
        return c;
    });
    campaigns.sort((a, b) => b.roas - a.roas);
    campaigns.forEach((c, i) => c.rank = i + 1);
    currentCampaignData = campaigns;
    return campaigns;
}

function getStatus(c) {
    if (c.ad_type === 'lead') {
        if (c.cpa > 0 && c.cpa <= 30000) return 'excellent';
        if (c.cpa <= 50000) return 'good';
        return 'poor';
    }
    if (c.roas >= 4.0) return 'excellent';
    if (c.roas >= 3.0) return 'good';
    return 'poor';
}

// ============================================
// 카드 표시
// ============================================

function displaySummaryCards(m) {
    const ids = ['summarySpend','summaryConversions','summaryRevenue','summaryRoas','summaryImpressions','summaryClicks','summaryCtr','summaryCvr'];
    if (!m) { ids.forEach(id => { document.getElementById(id).textContent = '-'; }); return; }
    document.getElementById('summarySpend').textContent = formatCompact(m.total_spend);
    document.getElementById('summaryConversions').textContent = (m.total_conversions || 0).toLocaleString();
    document.getElementById('summaryRevenue').textContent = formatCompact(m.total_revenue);
    document.getElementById('summaryRoas').textContent = (m.avg_roas * 100).toFixed(0);
    document.getElementById('summaryImpressions').textContent = formatCompact(m.total_impressions);
    document.getElementById('summaryClicks').textContent = (m.total_clicks || 0).toLocaleString();
    document.getElementById('summaryCtr').textContent = (m.avg_ctr || 0).toFixed(1);
    document.getElementById('summaryCvr').textContent = (m.cvr || 0).toFixed(1);
}

function displayMetricCards(m) {
    if (!m) { ['metricRoas','metricCtr','metricCpa','metricCvr'].forEach(id => { document.getElementById(id).textContent = '-'; }); return; }
    document.getElementById('metricRoas').textContent = (m.avg_roas * 100).toFixed(0) + '%';
    document.getElementById('metricCtr').textContent = (m.avg_ctr || 0).toFixed(1) + '%';
    document.getElementById('metricCpa').textContent = (m.avg_cpa || 0).toLocaleString() + '원';
    document.getElementById('metricCvr').textContent = (m.cvr || 0).toFixed(1) + '%';
}

// ============================================
// 차트 1: 일별 트렌드
// ============================================

function displayTrendChart(m) {
    if (trendChart) { trendChart.destroy(); trendChart = null; }
    const ctx = document.getElementById('trendChart');
    if (!ctx || !m || !m.daily_trend || m.daily_trend.length === 0) return;
    const d = m.daily_trend;

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: d.map(r => r.date),
            datasets: [
                { label: 'ROAS (%)', data: d.map(r => r.roas * 100), borderColor: '#4ecdc4', backgroundColor: 'rgba(78,205,196,0.1)', borderWidth: 3, pointRadius: 4, pointBackgroundColor: '#4ecdc4', tension: 0.4, fill: true, yAxisID: 'y' },
                { label: '매출 (만원)', data: d.map(r => r.revenue / 10000), borderColor: '#ffe66d', borderWidth: 2, pointRadius: 3, tension: 0.4, yAxisID: 'y2' },
                { label: '전환수', data: d.map(r => r.conversions), borderColor: '#b794f6', borderWidth: 2, pointRadius: 3, tension: 0.4, yAxisID: 'y3' },
                { label: '지출 (만원)', data: d.map(r => r.spend / 10000), type: 'bar', backgroundColor: 'rgba(0,212,255,0.3)', borderColor: '#00d4ff', borderWidth: 1, yAxisID: 'y2' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#e0e0e0', usePointStyle: true, padding: 15 } },
                tooltip: { backgroundColor: 'rgba(26,26,46,0.95)', titleColor: '#00d4ff', bodyColor: '#e0e0e0',
                    callbacks: { label: (c) => { if (c.dataset.label.includes('ROAS')) return 'ROAS: ' + c.parsed.y.toFixed(0) + '%'; if (c.dataset.label.includes('전환')) return '전환: ' + c.parsed.y.toFixed(0) + '건'; return c.dataset.label + ': ' + c.parsed.y.toFixed(0) + '만원'; } }
                }
            },
            scales: {
                x: { ticks: { color: '#a0a0a0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { position: 'left', title: { display: true, text: 'ROAS (%)', color: '#4ecdc4' }, ticks: { color: '#4ecdc4', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y2: { position: 'right', title: { display: true, text: '금액 (만원)', color: '#ffe66d' }, ticks: { color: '#ffe66d' }, grid: { drawOnChartArea: false } },
                y3: { position: 'right', title: { display: true, text: '전환수', color: '#b794f6' }, ticks: { color: '#b794f6' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

// ============================================
// 차트 2: 매출형 캠페인 분포
// ============================================

function displaySalesDistribution(m) {
    if (salesDistChart) { salesDistChart.destroy(); salesDistChart = null; }
    const ctx = document.getElementById('salesDistChart');
    if (!ctx || !m) return;
    const sales = (m.campaigns || []).filter(c => c.ad_type !== 'lead');
    if (sales.length === 0) {
        salesDistChart = new Chart(ctx, { type: 'doughnut', data: { labels: ['데이터 없음'], datasets: [{ data: [1], backgroundColor: ['rgba(255,255,255,0.1)'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
        return;
    }
    const ex = sales.filter(c => c.roas >= 4.0).length;
    const gd = sales.filter(c => c.roas >= 3.0 && c.roas < 4.0).length;
    const pr = sales.filter(c => c.roas < 3.0).length;
    salesDistChart = new Chart(ctx, { type: 'doughnut', data: { labels: ['우수 ' + ex + '개', '보통 ' + gd + '개', '개선필요 ' + pr + '개'], datasets: [{ data: [ex, gd, pr], backgroundColor: ['#4ecdc4', '#ffe66d', '#ff6b6b'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#e0e0e0', padding: 10 } } } } });
}

// ============================================
// 리드형 캠페인 요약
// ============================================

function displayLeadSummary(m) {
    const el = document.getElementById('avgCpaDisplay');
    const cEl = document.getElementById('leadTotalCount');
    const sEl = document.getElementById('leadTotalSpend');
    const nEl = document.getElementById('leadCampaignCount');
    if (!m || !m.campaigns) { el.textContent = '-'; cEl.textContent = '0'; sEl.textContent = '0'; nEl.textContent = '0'; return; }
    const leads = m.campaigns.filter(c => c.ad_type === 'lead');
    if (leads.length === 0) { el.textContent = '데이터 없음'; el.style.fontSize = '1.5rem'; el.style.color = '#888'; cEl.textContent = '-'; sEl.textContent = '-'; nEl.textContent = '0'; return; }
    const ts = leads.reduce((s, c) => s + c.spend, 0);
    const tc = leads.reduce((s, c) => s + c.conversions, 0);
    const avg = tc > 0 ? Math.round(ts / tc) : 0;
    el.textContent = avg > 0 ? avg.toLocaleString() + '원' : '전환 없음';
    el.style.fontSize = avg > 0 ? '2.5rem' : '1.5rem';
    el.style.color = avg > 0 ? '#00d4ff' : '#ff6b6b';
    cEl.textContent = tc.toLocaleString() + '건';
    sEl.textContent = formatCompact(ts);
    nEl.textContent = leads.length + '개';
}

// ============================================
// 차트 3: 예산 배분
// ============================================

function displayBudgetPie(m) {
    if (budgetPieChart) { budgetPieChart.destroy(); budgetPieChart = null; }
    const ctx = document.getElementById('budgetPieChart');
    if (!ctx || !m || !m.campaigns || m.campaigns.length === 0) return;
    const sorted = [...m.campaigns].sort((a, b) => b.spend - a.spend);
    const top5 = sorted.slice(0, 5);
    const other = sorted.slice(5).reduce((s, c) => s + c.spend, 0);
    const labels = top5.map(c => c.campaign_name.length > 12 ? c.campaign_name.slice(0, 12) + '..' : c.campaign_name);
    const data = top5.map(c => c.spend / 10000);
    if (other > 0) { labels.push('기타'); data.push(other / 10000); }
    budgetPieChart = new Chart(ctx, { type: 'pie', data: { labels, datasets: [{ data, backgroundColor: ['#00d4ff', '#4ecdc4', '#ffe66d', '#ff6b6b', '#b794f6', '#666'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#e0e0e0' } }, tooltip: { callbacks: { label: (c) => { const t = c.dataset.data.reduce((a, b) => a + b, 0); return c.label + ': ' + c.parsed.toFixed(0) + '만원 (' + ((c.parsed / t) * 100).toFixed(1) + '%)'; } } } } } });
}

// ============================================
// 차트 4: 전환 퍼널
// ============================================

function displayFunnel(m) {
    if (funnelChart) { funnelChart.destroy(); funnelChart = null; }
    const ctx = document.getElementById('funnelChart');
    if (!ctx || !m) return;
    const imp = m.total_impressions || 0, clk = m.total_clicks || 0, conv = m.total_conversions || 0;
    const ctr = imp > 0 ? ((clk / imp) * 100).toFixed(2) : 0;
    const cvr = clk > 0 ? ((conv / clk) * 100).toFixed(2) : 0;
    funnelChart = new Chart(ctx, { type: 'bar', data: { labels: ['노출 ' + formatCompact(imp), '클릭 (CTR ' + ctr + '%)', '전환 (CVR ' + cvr + '%)'], datasets: [{ data: [imp, clk, conv], backgroundColor: ['#00d4ff', '#4ecdc4', '#ffe66d'], borderWidth: 0 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#a0a0a0', callback: v => formatCompact(v) }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#e0e0e0' }, grid: { display: false } } } } });
}

// ============================================
// 차트 5: 요일별 성과
// ============================================

function displayWeekday(m) {
    if (weekdayChart) { weekdayChart.destroy(); weekdayChart = null; }
    const ctx = document.getElementById('weekdayChart');
    if (!ctx || !m || !m.raw || m.raw.length === 0) return;
    const dn = ['일', '월', '화', '수', '목', '금', '토'];
    const wd = {};
    dn.forEach(d => { wd[d] = { spend: 0, revenue: 0, conversions: 0, count: 0 }; });
    m.raw.forEach(row => {
        const p = row.date.split('-');
        const dt = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
        const day = dn[dt.getDay()];
        wd[day].spend += parseFloat(row.spend) || 0;
        wd[day].revenue += parseFloat(row.revenue) || 0;
        wd[day].conversions += parseInt(row.conversions) || 0;
        wd[day].count += 1;
    });
    weekdayChart = new Chart(ctx, { type: 'bar', data: { labels: dn, datasets: [
        { label: 'ROAS (%)', data: dn.map(d => wd[d].spend > 0 ? (wd[d].revenue / wd[d].spend) * 100 : 0), backgroundColor: 'rgba(78,205,196,0.7)', yAxisID: 'y' },
        { label: '평균 매출(만)', data: dn.map(d => wd[d].count > 0 ? wd[d].revenue / wd[d].count / 10000 : 0), backgroundColor: 'rgba(0,212,255,0.7)', yAxisID: 'y1' },
        { label: '평균 지출(만)', data: dn.map(d => wd[d].count > 0 ? wd[d].spend / wd[d].count / 10000 : 0), backgroundColor: 'rgba(183,148,246,0.7)', yAxisID: 'y1' },
        { label: '평균 전환수', data: dn.map(d => wd[d].count > 0 ? wd[d].conversions / wd[d].count : 0), backgroundColor: 'rgba(255,230,109,0.7)', yAxisID: 'y2' }
    ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { color: '#e0e0e0', usePointStyle: true, padding: 10 } }, tooltip: { backgroundColor: 'rgba(26,26,46,0.95)', callbacks: { label: (c) => { if (c.dataset.label.includes('ROAS')) return 'ROAS: ' + c.parsed.y.toFixed(0) + '%'; if (c.dataset.label.includes('만')) return c.dataset.label + ': ' + c.parsed.y.toFixed(0) + '만원'; return c.dataset.label + ': ' + c.parsed.y.toFixed(1); } } } }, scales: { y: { position: 'left', title: { display: true, text: 'ROAS (%)', color: '#4ecdc4' }, ticks: { color: '#4ecdc4', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }, y1: { position: 'left', title: { display: true, text: '금액(만)', color: '#00d4ff' }, ticks: { color: '#00d4ff' }, grid: { drawOnChartArea: false } }, y2: { position: 'right', title: { display: true, text: '전환수', color: '#ffe66d' }, ticks: { color: '#ffe66d' }, grid: { drawOnChartArea: false } }, x: { ticks: { color: '#e0e0e0' }, grid: { display: false } } } } });
}

// ============================================
// 캠페인 테이블
// ============================================

function displayCampaignTable(m) {
    const tbody = document.getElementById('campaignTableBody');
    if (!m || !m.campaigns || m.campaigns.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="no-data">데이터를 업로드하면 캠페인 분석이 표시됩니다</td></tr>'; return; }
    tbody.innerHTML = m.campaigns.map((c, idx) => {
        const tl = c.ad_type === 'lead' ? '잠재고객' : '매출형';
        const tc = c.ad_type === 'lead' ? 'lead' : 'sales';
        const pm = c.ad_type === 'lead' ? 'CPL ' + (c.cpa || 0).toLocaleString() + '원' : 'ROAS ' + (c.roas * 100).toFixed(0) + '%';
        const hm = localStorage.getItem('roas_memo_' + c.campaign_name) !== null;
        return '<tr class="campaign-row" onclick="showCampaignDetail(' + idx + ')"><td>' + c.rank + '</td><td style="font-weight:500;">' + c.campaign_name + '</td><td><span class="ad-type-tag ' + tc + '">' + tl + '</span></td><td><strong>' + pm + '</strong></td><td>' + (c.ctr || 0).toFixed(1) + '%</td><td>' + (c.cpa || 0).toLocaleString() + '원</td><td>' + formatCompact(c.spend) + '</td><td><button class="memo-btn ' + (hm ? 'has-memo' : '') + '" onclick="event.stopPropagation(); openMemoModal(\'' + c.campaign_name.replace(/'/g, "\\'") + '\')">' + (hm ? '메모' : '메모') + '</button></td></tr>';
    }).join('');
}

// ============================================
// TOP 분석 테이블
// ============================================

function displayTopTables(m) {
    const e6 = '<tr><td colspan="6" class="no-data">데이터를 업로드하세요</td></tr>';
    const e10 = '<tr><td colspan="10" class="no-data">데이터를 업로드하세요</td></tr>';
    if (!m || !m.campaigns || m.campaigns.length === 0) { document.getElementById('roasTopTable').innerHTML = e6; document.getElementById('cvrTopTable').innerHTML = e6; document.getElementById('allCampaignsTable').innerHTML = e10; return; }
    const cp = m.campaigns;

    document.getElementById('roasTopTable').innerHTML = [...cp].sort((a, b) => b.roas - a.roas).slice(0, 10).map((c, i) =>
        '<tr class="campaign-row" onclick="showCampaignDetail(' + cp.indexOf(c) + ')"><td>' + (i + 1) + '</td><td>' + c.campaign_name + '</td><td><span class="ad-type-tag ' + (c.ad_type === 'lead' ? 'lead' : 'sales') + '">' + (c.ad_type === 'lead' ? '리드' : '매출') + '</span></td><td><strong style="color:#4ecdc4;">' + (c.roas * 100).toFixed(0) + '%</strong></td><td>' + formatCompact(c.revenue) + '</td><td>' + formatCompact(c.spend) + '</td></tr>'
    ).join('');

    document.getElementById('cvrTopTable').innerHTML = [...cp].sort((a, b) => b.cvr - a.cvr).slice(0, 10).map((c, i) =>
        '<tr class="campaign-row" onclick="showCampaignDetail(' + cp.indexOf(c) + ')"><td>' + (i + 1) + '</td><td>' + c.campaign_name + '</td><td><span class="ad-type-tag ' + (c.ad_type === 'lead' ? 'lead' : 'sales') + '">' + (c.ad_type === 'lead' ? '리드' : '매출') + '</span></td><td><strong style="color:#b794f6;">' + c.cvr.toFixed(1) + '%</strong></td><td>' + c.conversions + '건</td><td>' + c.clicks + '회</td></tr>'
    ).join('');

    document.getElementById('allCampaignsTable').innerHTML = cp.map((c, idx) => {
        const sl = c.status === 'excellent' ? '우수' : c.status === 'good' ? '보통' : '개선필요';
        return '<tr class="campaign-row" onclick="showCampaignDetail(' + idx + ')"><td style="font-weight:500;">' + c.campaign_name + '</td><td><span class="ad-type-tag ' + (c.ad_type === 'lead' ? 'lead' : 'sales') + '">' + (c.ad_type === 'lead' ? '리드' : '매출') + '</span></td><td>' + (c.roas * 100).toFixed(0) + '%</td><td>' + c.cvr.toFixed(1) + '%</td><td>' + c.ctr.toFixed(1) + '%</td><td>' + c.cpa.toLocaleString() + '원</td><td>' + c.conversions.toLocaleString() + '건</td><td>' + formatCompact(c.spend) + '</td><td>' + formatCompact(c.revenue) + '</td><td><span class="status-badge status-' + c.status + '">' + sl + '</span></td></tr>';
    }).join('');
}

// ============================================
// 캠페인 상세 모달
// ============================================

function showCampaignDetail(index) {
    const c = currentCampaignData[index];
    if (!c) return;
    const ic = c.status === 'excellent' ? 'positive' : c.status === 'poor' ? 'negative' : 'neutral';
    const mh = c.ad_type === 'lead'
        ? '<div class="summary-cards roas-summary"><div class="card highlight-blue"><div class="card-label">CPA</div><div class="card-value">' + (c.cpa / 1000).toFixed(0) + '천원</div></div><div class="card"><div class="card-label">지출액</div><div class="card-value">' + formatCompact(c.spend) + '</div></div><div class="card highlight-green"><div class="card-label">전환수</div><div class="card-value">' + c.conversions.toLocaleString() + '건</div></div><div class="card"><div class="card-label">전환율</div><div class="card-value">' + c.cvr.toFixed(1) + '%</div></div></div>'
        : '<div class="summary-cards roas-summary"><div class="card highlight-blue"><div class="card-label">ROAS</div><div class="card-value">' + (c.roas * 100).toFixed(0) + '%</div></div><div class="card"><div class="card-label">지출액</div><div class="card-value">' + formatCompact(c.spend) + '</div></div><div class="card highlight-green"><div class="card-label">매출액</div><div class="card-value">' + formatCompact(c.revenue) + '</div></div><div class="card"><div class="card-label">전환수</div><div class="card-value">' + c.conversions.toLocaleString() + '건</div></div></div>';
    document.getElementById('campaignDetailContent').innerHTML = '<h2>' + c.campaign_name + '</h2>' + mh + '<div class="insight-box ' + ic + '" style="margin-top:20px;"><strong>권장사항</strong><br><br>' + getRecommendation(c) + '</div>';
    document.getElementById('campaignDetailModal').classList.add('active');
}

function closeCampaignDetailModal() { document.getElementById('campaignDetailModal').classList.remove('active'); }

function getRecommendation(c) {
    var r = c.roas || 0, ctr = c.ctr || 0, cvr = c.cvr || 0, cpa = c.cpa || 0;
    if (c.ad_type === 'lead') {
        if (cpa > 0 && cpa <= 30000) return '<strong>[우수]</strong> 전환당 비용 ' + cpa.toLocaleString() + '원으로 우수합니다. 전환율 ' + cvr.toFixed(1) + '%를 유지하며 예산 확대를 고려하세요.';
        if (cpa <= 50000 && cvr < 2.0) return '<strong>[주의]</strong> 전환율 ' + cvr.toFixed(1) + '%로 낮습니다. 랜딩페이지 개선 또는 타겟팅 조정을 권장합니다.';
        if (cpa <= 50000) return '<strong>[양호]</strong> 전환당 ' + cpa.toLocaleString() + '원으로 양호합니다.';
        if (cpa > 50000) return '<strong>[개선필요]</strong> 전환당 비용 ' + cpa.toLocaleString() + '원으로 높습니다. 타겟팅 재검토 또는 소재 변경을 고려하세요.';
        return '<strong>[주의]</strong> 데이터가 부족합니다.';
    }
    if (r >= 4.0) return '<strong>[우수]</strong> ROAS ' + (r * 100).toFixed(0) + '%로 목표 초과달성 중입니다. 예산을 늘려 더 많은 수익을 창출하세요.';
    if (r >= 3.0 && ctr < 2.0) return '<strong>[주의]</strong> 클릭률 ' + ctr.toFixed(1) + '%로 낮습니다. 광고 소재 개선 또는 타겟팅 조정을 권장합니다.';
    if (r >= 3.0) return '<strong>[양호]</strong> ROAS ' + (r * 100).toFixed(0) + '%로 양호합니다. 예산 확대를 고려하세요.';
    return '<strong>[개선필요]</strong> ROAS ' + (r * 100).toFixed(0) + '%로 목표 미달입니다. 캠페인 재검토 또는 일시 중지를 고려하세요.';
}

// ============================================
// 파일 업로드 (100% 클라이언트)
// ============================================

async function handleFileUpload(file) {
    showLoading('파일 분석 중...', '데이터를 파싱하고 있습니다');
    try {
        var ext = file.name.split('.').pop().toLowerCase();
        var parsed = ext === 'csv' ? await parseCSV(file) : await parseExcel(file);
        updateLoading('데이터 처리 중...', 50);
        if (!parsed || parsed.length === 0) { hideLoading(); alert('파일에서 유효한 데이터를 찾을 수 없습니다.\n\n필수 컬럼: 날짜, 캠페인명, 지출액(비용), 클릭수, 전환수\n선택 컬럼: 광고유형, 노출수, 매출액'); return; }
        var merged = saveToStorage(parsed);
        currentDailyData = merged;
        updateLoading('차트 생성 중...', 80);
        displayAll(calculateMetrics(merged));
        updateLoading('완료!', 100);
        setTimeout(function () { hideLoading(); alert('업로드 완료! ' + parsed.length + '건 추가됨 (총 ' + merged.length + '건)'); }, 300);
    } catch (err) { hideLoading(); alert('파일 처리 중 오류가 발생했습니다.\n\n' + err.message); }
}

function parseExcel(file) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (e) { try { var wb = XLSX.read(e.target.result, { type: 'array' }); resolve(normalizeData(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]))); } catch (err) { reject(err); } };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function parseCSV(file) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var lines = e.target.result.split('\n').filter(function (l) { return l.trim(); });
                if (lines.length < 2) { resolve([]); return; }
                var headers = lines[0].split(',').map(function (h) { return h.trim().replace(/"/g, ''); });
                var json = [];
                for (var i = 1; i < lines.length; i++) {
                    var vals = parseCSVLine(lines[i]);
                    var row = {};
                    headers.forEach(function (h, idx) { row[h] = vals[idx] || ''; });
                    json.push(row);
                }
                resolve(normalizeData(json));
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsText(file, 'UTF-8');
    });
}

function parseCSVLine(line) {
    var result = [], current = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
        if (line[i] === '"') inQ = !inQ;
        else if (line[i] === ',' && !inQ) { result.push(current.trim()); current = ''; }
        else current += line[i];
    }
    result.push(current.trim());
    return result;
}

function normalizeData(jsonData) {
    var colMap = {
        date: ['날짜', 'date', '일자', 'day'],
        campaign_name: ['캠페인명', 'campaign_name', '캠페인', 'campaign', '광고명', '소재명'],
        ad_type: ['광고유형', 'ad_type', '유형', 'type'],
        spend: ['지출액', 'spend', '비용', 'cost', '광고비', '지출', '사용금액'],
        impressions: ['노출수', 'impressions', '노출', 'imp'],
        clicks: ['클릭수', 'clicks', '클릭', 'click'],
        conversions: ['전환수', 'conversions', '전환', 'conversion', '구매수', '구매건수'],
        revenue: ['매출액', 'revenue', '매출', '전환매출', '매출금액', '전환매출액']
    };
    function findCol(row, candidates) {
        for (var ci = 0; ci < candidates.length; ci++) {
            var keys = Object.keys(row);
            for (var ki = 0; ki < keys.length; ki++) { if (keys[ki].trim().toLowerCase() === candidates[ci].toLowerCase()) return keys[ki]; }
        }
        return null;
    }
    if (jsonData.length === 0) return [];
    var sample = jsonData[0], mapping = {};
    Object.keys(colMap).forEach(function (f) { mapping[f] = findCol(sample, colMap[f]); });
    if (!mapping.date || !mapping.campaign_name) throw new Error('필수 컬럼(날짜, 캠페인명)을 찾을 수 없습니다.\n\n지원 컬럼명: 날짜, 캠페인명, 지출액, 클릭수, 전환수, 노출수, 매출액, 광고유형');

    return jsonData.map(function (row) {
        var dv = row[mapping.date] || '';
        if (typeof dv === 'number') { var ep = new Date(1899, 11, 30); var dd = new Date(ep.getTime() + dv * 86400000); dv = dd.toISOString().slice(0, 10); }
        else { dv = String(dv).trim(); if (dv.includes('/')) { var p = dv.split('/'); dv = p[0].length === 4 ? p[0] + '-' + p[1].padStart(2, '0') + '-' + p[2].padStart(2, '0') : p[2] + '-' + p[0].padStart(2, '0') + '-' + p[1].padStart(2, '0'); } else if (dv.includes('.')) { var p2 = dv.split('.'); dv = p2[0] + '-' + p2[1].padStart(2, '0') + '-' + p2[2].padStart(2, '0'); } }
        if (!dv || dv.length < 8) return null;
        var at = 'sales';
        if (mapping.ad_type) { var v = String(row[mapping.ad_type] || '').toLowerCase(); if (v.includes('lead') || v.includes('잠재') || v.includes('리드')) at = 'lead'; }
        return { date: dv, campaign_name: String(row[mapping.campaign_name] || 'Unknown').trim(), ad_type: at, spend: parseFloat(row[mapping.spend]) || 0, impressions: parseInt(row[mapping.impressions]) || 0, clicks: parseInt(row[mapping.clicks]) || 0, conversions: parseInt(row[mapping.conversions]) || 0, revenue: at === 'lead' ? 0 : (parseFloat(row[mapping.revenue]) || 0) };
    }).filter(function (r) { return r !== null && r.date && r.campaign_name; });
}

// ============================================
// 수동 입력
// ============================================

function openManualInputModal() {
    manualDataBuffer = [];
    document.getElementById('manualDataCount').textContent = '0';
    document.getElementById('manualDataPreview').innerHTML = '';
    document.getElementById('manualDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('manualInputModal').classList.add('active');
}

function closeManualInputModal() { document.getElementById('manualInputModal').classList.remove('active'); manualDataBuffer = []; }

function addManualData() {
    var date = document.getElementById('manualDate').value;
    var campaign = document.getElementById('manualCampaign').value.trim();
    var adType = document.getElementById('manualAdType').value;
    var spend = parseFloat(document.getElementById('manualSpend').value) || 0;
    var impressions = parseInt(document.getElementById('manualImpressions').value) || 0;
    var clicks = parseInt(document.getElementById('manualClicks').value) || 0;
    var conversions = parseInt(document.getElementById('manualConversions').value) || 0;
    var revenue = adType === 'lead' ? 0 : (parseFloat(document.getElementById('manualRevenue').value) || 0);
    if (!date || !campaign) { alert('날짜와 캠페인명은 필수입니다.'); return; }
    manualDataBuffer.push({ date: date, campaign_name: campaign, ad_type: adType, spend: spend, impressions: impressions, clicks: clicks, conversions: conversions, revenue: revenue });
    ['manualSpend', 'manualImpressions', 'manualClicks', 'manualConversions', 'manualRevenue'].forEach(function (id) { document.getElementById(id).value = ''; });
    document.getElementById('manualDataCount').textContent = manualDataBuffer.length;
    var last = manualDataBuffer[manualDataBuffer.length - 1];
    document.getElementById('manualDataPreview').innerHTML = '<div style="margin-top:10px;padding:10px;background:rgba(255,255,255,0.03);border-radius:6px;font-size:0.85rem;color:#aaa;"><strong>마지막 입력:</strong> ' + last.date + ' | ' + last.campaign_name + ' | 지출: ' + last.spend.toLocaleString() + '원 | 클릭: ' + last.clicks + '</div>';
    alert('데이터 추가됨 (총 ' + manualDataBuffer.length + '건)');
}

function submitManualData() {
    if (manualDataBuffer.length === 0) { alert('입력된 데이터가 없습니다.'); return; }
    var merged = saveToStorage(manualDataBuffer);
    currentDailyData = merged;
    displayAll(calculateMetrics(merged));
    alert('완료! ' + manualDataBuffer.length + '건 추가됨 (총 ' + merged.length + '건)');
    closeManualInputModal();
}

// ============================================
// 기간 필터
// ============================================

function applyDateFilter(ft) {
    currentDateFilter = ft;
    document.querySelectorAll('.period-btn').forEach(function (b) { b.classList.remove('active'); });
    var btn = document.querySelector('[data-filter="' + ft + '"]');
    if (btn) btn.classList.add('active');
    var all = loadFromStorage();
    if (all.length === 0) { alert('저장된 데이터가 없습니다.'); return; }
    var today = new Date();
    var ts = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    var filtered;
    if (ft === 'all') { filtered = all; document.getElementById('currentDateRange').textContent = '현재 기간: 전체 데이터'; }
    else if (ft === 'today') { filtered = all.filter(function (d) { return d.date === ts; }); document.getElementById('currentDateRange').textContent = '현재 기간: ' + ts; }
    else if (ft === 'week') { var wa = new Date(today); wa.setDate(today.getDate() - 6); var ws = wa.getFullYear() + '-' + String(wa.getMonth() + 1).padStart(2, '0') + '-' + String(wa.getDate()).padStart(2, '0'); filtered = all.filter(function (d) { return d.date >= ws && d.date <= ts; }); document.getElementById('currentDateRange').textContent = '현재 기간: ' + ws + ' ~ ' + ts; }
    else if (ft === 'month') { var ma = new Date(today); ma.setDate(today.getDate() - 29); var ms = ma.getFullYear() + '-' + String(ma.getMonth() + 1).padStart(2, '0') + '-' + String(ma.getDate()).padStart(2, '0'); filtered = all.filter(function (d) { return d.date >= ms && d.date <= ts; }); document.getElementById('currentDateRange').textContent = '현재 기간: ' + ms + ' ~ ' + ts; }
    else if (ft === 'custom') { document.getElementById('dateStart').focus(); return; }
    else { filtered = all; }
    if (filtered.length === 0) { alert('선택한 기간에 데이터가 없습니다.'); return; }
    currentDailyData = filtered;
    displayAll(calculateMetrics(filtered));
}

function applyCustomDateRange() {
    var s = document.getElementById('dateStart').value, e = document.getElementById('dateEnd').value;
    if (!s || !e) { alert('시작일과 종료일을 모두 선택해주세요.'); return; }
    if (s > e) { alert('시작일은 종료일보다 이전이어야 합니다.'); return; }
    currentDateFilter = 'custom';
    document.querySelectorAll('.period-btn').forEach(function (b) { b.classList.remove('active'); });
    var btn = document.querySelector('[data-filter="custom"]'); if (btn) btn.classList.add('active');
    var all = loadFromStorage();
    var filtered = all.filter(function (d) { return d.date >= s && d.date <= e; });
    document.getElementById('currentDateRange').textContent = '현재 기간: ' + s + ' ~ ' + e;
    if (filtered.length === 0) { alert('선택한 기간에 데이터가 없습니다.'); return; }
    currentDailyData = filtered;
    displayAll(calculateMetrics(filtered));
}

// ============================================
// 메모
// ============================================

function openMemoModal(name) {
    currentMemoTarget = name;
    document.getElementById('memoModalTitle').textContent = name + ' 메모';
    document.getElementById('campaignMemoText').value = localStorage.getItem('roas_memo_' + name) || '';
    document.getElementById('campaignMemoModal').classList.add('active');
}

function closeMemoModal() { document.getElementById('campaignMemoModal').classList.remove('active'); currentMemoTarget = null; }

function saveMemo() {
    if (!currentMemoTarget) return;
    var text = document.getElementById('campaignMemoText').value.trim();
    if (text) { localStorage.setItem('roas_memo_' + currentMemoTarget, text); alert('메모 저장!'); }
    else { localStorage.removeItem('roas_memo_' + currentMemoTarget); alert('메모 삭제!'); }
    closeMemoModal();
    displayCampaignTable(calculateMetrics(currentDailyData));
}

// ============================================
// 내보내기
// ============================================

function exportToExcel() {
    var data = loadFromStorage();
    if (data.length === 0) { alert('내보낼 데이터가 없습니다.'); return; }
    var wb = XLSX.utils.book_new();
    var ws1 = XLSX.utils.json_to_sheet(data.map(function (r) { return { '날짜': r.date, '캠페인명': r.campaign_name, '광고유형': r.ad_type === 'lead' ? '잠재고객' : '매출형', '지출액': r.spend, '노출수': r.impressions, '클릭수': r.clicks, '전환수': r.conversions, '매출액': r.revenue }; }));
    XLSX.utils.book_append_sheet(wb, ws1, '일별데이터');
    if (currentCampaignData.length > 0) {
        var ws2 = XLSX.utils.json_to_sheet(currentCampaignData.map(function (c) { return { '캠페인명': c.campaign_name, '광고유형': c.ad_type === 'lead' ? '잠재고객' : '매출형', 'ROAS': (c.roas * 100).toFixed(0) + '%', 'CTR': c.ctr.toFixed(1) + '%', 'CPA': c.cpa, '지출액': c.spend, '매출액': c.revenue, '전환수': c.conversions }; }));
        XLSX.utils.book_append_sheet(wb, ws2, '캠페인요약');
    }
    XLSX.writeFile(wb, 'ROAS분석_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    alert('Excel 다운로드 완료!');
}

function exportToCSV() {
    var data = loadFromStorage();
    if (data.length === 0) { alert('내보낼 데이터가 없습니다.'); return; }
    var headers = ['날짜', '캠페인명', '광고유형', '지출액', '노출수', '클릭수', '전환수', '매출액'];
    var rows = data.map(function (r) { return [r.date, r.campaign_name, r.ad_type === 'lead' ? '잠재고객' : '매출형', r.spend, r.impressions, r.clicks, r.conversions, r.revenue]; });
    var csv = [headers.join(',')].concat(rows.map(function (r) { return r.map(function (cell) { var s = String(cell); return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','); })).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ROAS분석_' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    alert('CSV 다운로드 완료!');
}

// ============================================
// 템플릿 다운로드
// ============================================

function downloadTemplate() {
    var wb = XLSX.utils.book_new();
    var sample = [
        { '날짜': '2025-01-01', '캠페인명': '네이버_브랜드검색', '광고유형': '매출형', '지출액': 150000, '노출수': 45000, '클릭수': 1200, '전환수': 48, '매출액': 720000 },
        { '날짜': '2025-01-01', '캠페인명': '메타_리타겟팅', '광고유형': '매출형', '지출액': 80000, '노출수': 30000, '클릭수': 600, '전환수': 24, '매출액': 360000 },
        { '날짜': '2025-01-01', '캠페인명': '구글_DB수집', '광고유형': '잠재고객', '지출액': 50000, '노출수': 20000, '클릭수': 400, '전환수': 15, '매출액': 0 },
        { '날짜': '2025-01-02', '캠페인명': '네이버_브랜드검색', '광고유형': '매출형', '지출액': 160000, '노출수': 48000, '클릭수': 1300, '전환수': 52, '매출액': 780000 }
    ];
    var ws = XLSX.utils.json_to_sheet(sample);
    ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, '광고데이터');
    XLSX.writeFile(wb, 'ROAS분석_템플릿.xlsx');
    alert('템플릿 다운로드 완료!\n\n데이터를 입력한 후 파일 업로드로 분석하세요.');
}

// ============================================
// 로딩 UI
// ============================================

function showLoading(title, message) {
    document.getElementById('loadingTitle').textContent = title;
    document.getElementById('loadingMessage').textContent = message;
    document.getElementById('progressBar').style.width = '10%';
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

function updateLoading(message, progress) {
    document.getElementById('loadingMessage').textContent = message;
    document.getElementById('progressBar').style.width = progress + '%';
}

function hideLoading() { document.getElementById('loadingOverlay').classList.add('hidden'); }

// ============================================
// 유틸리티
// ============================================

function formatCompact(value) {
    if (!value && value !== 0) return '-';
    if (value >= 100000000) return (value / 100000000).toFixed(1) + '억';
    if (value >= 10000) return (value / 10000).toFixed(0) + '만';
    return value.toLocaleString();
}
