/**
 * 통합 대시보드
 * - 고객 현황(추정): sales_data.json + customer_stats_config.json(비율)
 * - 순위 변동: marketing_data.json tracking_history (최근 2회 비교)
 * - 발주 가격 변동: report_data.json price_changes
 *
 * 원칙:
 * - 공통 UI(style.css) 톤 유지
 * - 차트 증식 방지: destroy + canvas 재생성
 */

let salesData = null;
let marketingData = null;
let orderData = null;
let customerConfig = null;

let charts = {
  gender: null,
  age: null,
  daily: null,
  visit: null
};

const DEFAULT_CUSTOMER_CONFIG = {
  base_price: 11000,
  gender_ratio: { male: 53, female: 47 },
  age_ratio: { "20대": 11.7, "30대": 37.0, "40대": 28.0, "50대": 18.7, "60대이상": 4.7 },
  visit_frequency: {
    "20회 방문": { male: 12, female: 8 },
    "30회 방문": { male: 15, female: 10 },
    "40회 방문": { male: 18, female: 12 },
    "50회 방문": { male: 20, female: 14 }
  },
  updated_at: ""
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadAllData();
  initFilters();
  renderAll();
}

async function loadAllData() {
  const bust = 't=' + Date.now();

  const requests = [
    fetch('sales_data.json?' + bust).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('marketing_data.json?' + bust).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('report_data.json?' + bust).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('customer_stats_config.json?' + bust).then(r => r.ok ? r.json() : null).catch(() => null)
  ];

  const results = await Promise.all(requests);
  salesData = results[0];
  marketingData = results[1];
  orderData = results[2];
  customerConfig = results[3] || DEFAULT_CUSTOMER_CONFIG;

  updateUpdateTime();
}

function updateUpdateTime() {
  const el = document.getElementById('updateTime');
  if (!el) return;

  const times = [];
  if (salesData && salesData.generated_at) times.push(new Date(salesData.generated_at));
  if (marketingData && marketingData.generated_at) times.push(new Date(marketingData.generated_at));
  if (orderData && orderData.generated_at) times.push(new Date(orderData.generated_at));

  let latest = null;
  times.forEach(d => {
    if (!latest || d > latest) latest = d;
  });

  if (latest) {
    el.textContent = '마지막 업데이트: ' + formatDateTime(latest);
  } else {
    el.textContent = '마지막 업데이트: -';
  }
}

function initFilters() {
  const storeSelect = document.getElementById('storeSelect');
  const periodSelect = document.getElementById('periodSelect');
  const basePriceInput = document.getElementById('basePriceInput');

  if (storeSelect) {
    const stores = getStoreListFromSales();
    storeSelect.innerHTML = '<option value="">전체 지점</option>' +
      stores.map(s => `<option value="${escapeHtmlAttr(s)}">${escapeHtml(s)}</option>`).join('');

    storeSelect.addEventListener('change', () => renderAll());
  }

  if (periodSelect) {
    periodSelect.addEventListener('change', () => renderAll());
  }

  if (basePriceInput) {
    basePriceInput.value = String((customerConfig && customerConfig.base_price) ? customerConfig.base_price : 11000);

    let t = null;
    basePriceInput.addEventListener('input', () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => renderAll(), 200);
    });
  }
}

function getStoreListFromSales() {
  if (!salesData) return [];

  // salesData.stores: [{code,name,...}]
  if (Array.isArray(salesData.stores) && salesData.stores.length > 0) {
    return [...new Set(salesData.stores.map(s => s.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  }

  // fallback: daily_detail에서 추출
  const names = new Set();
  if (salesData.daily_detail) {
    Object.values(salesData.daily_detail).forEach(list => {
      (list || []).forEach(row => {
        if (row && row.name) names.add(row.name);
      });
    });
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'ko'));
}

function initChartsCleanup() {
  Object.keys(charts).forEach(k => {
    if (charts[k]) {
      charts[k].destroy();
      charts[k] = null;
    }
  });
}

function recreateCanvas(containerId, canvasId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const old = document.getElementById(canvasId);
  if (old) old.remove();

  const c = document.createElement('canvas');
  c.id = canvasId;
  container.appendChild(c);
  return c.getContext('2d');
}

function renderAll() {
  renderCustomerSection();
  renderRankChangeTable();
  renderPriceChangeTable();
}

function getSelectedStore() {
  const s = document.getElementById('storeSelect');
  return s ? (s.value || '') : '';
}

function getSelectedPeriod() {
  const p = document.getElementById('periodSelect');
  return p ? (p.value || '30') : '30';
}

function getBasePrice() {
  const input = document.getElementById('basePriceInput');
  const v = input ? parseInt(input.value, 10) : 11000;
  if (!v || isNaN(v) || v <= 0) return 11000;
  return v;
}

/* =========================
   1) 고객 현황(상단)
   ========================= */

function renderCustomerSection() {
  const basePrice = getBasePrice();
  const store = getSelectedStore();
  const period = getSelectedPeriod();

  const dailySales = computeDailySalesSeries(store, period);
  const totalSales = dailySales.reduce((sum, d) => sum + (d.total || 0), 0);

  const totalCustomers = Math.ceil(totalSales / basePrice) || 0;

  const genderRatio = (customerConfig && customerConfig.gender_ratio) ? customerConfig.gender_ratio : DEFAULT_CUSTOMER_CONFIG.gender_ratio;
  const ageRatio = (customerConfig && customerConfig.age_ratio) ? customerConfig.age_ratio : DEFAULT_CUSTOMER_CONFIG.age_ratio;
  const visitFreq = (customerConfig && customerConfig.visit_frequency) ? customerConfig.visit_frequency : DEFAULT_CUSTOMER_CONFIG.visit_frequency;

  const male = Math.round(totalCustomers * (genderRatio.male / 100));
  const female = Math.max(0, totalCustomers - male);

  const ageCounts = {};
  Object.keys(ageRatio).forEach(k => {
    ageCounts[k] = Math.round(totalCustomers * (ageRatio[k] / 100));
  });

  // 방문 빈도는 샘플 기반이므로 고객 규모에 따라 가볍게 스케일링(최소 1)
  const scale = Math.max(1, Math.round(totalCustomers / 1000));
  const visitLabels = Object.keys(visitFreq);
  const visitMale = visitLabels.map(l => Math.round((visitFreq[l].male || 0) * scale));
  const visitFemale = visitLabels.map(l => Math.round((visitFreq[l].female || 0) * scale));

  setText('totalCustomers', formatNumber(totalCustomers));
  setText('maleCustomers', formatNumber(male));
  setText('femaleCustomers', formatNumber(female));
  setText('totalSales', formatCurrency(totalSales));

  initChartsCleanup();

  renderGenderChart(male, female);
  renderDailyCustomerChart(dailySales, basePrice);
  renderAgeChart(ageCounts);
  renderVisitChart(visitLabels, visitMale, visitFemale);
}

function computeDailySalesSeries(storeName, periodValue) {
  if (!salesData || !Array.isArray(salesData.daily)) return [];

  // 기준 종료일: 데이터의 가장 최신 date
  const maxDate = getMaxDate(salesData.daily.map(d => d.date).filter(Boolean));
  if (!maxDate) return [];

  let days = null;
  if (periodValue !== 'all') {
    const n = parseInt(periodValue, 10);
    if (!isNaN(n) && n > 0) days = n;
  }

  const startDate = (days === null) ? null : addDays(maxDate, -(days - 1));

  const list = [];
  for (let i = 0; i < salesData.daily.length; i++) {
    const row = salesData.daily[i];
    if (!row || !row.date) continue;

    const date = row.date;
    if (startDate && (date < startDate)) continue;
    if (date > maxDate) continue;

    let total = 0;

    if (storeName) {
      const detail = (salesData.daily_detail && salesData.daily_detail[date]) ? salesData.daily_detail[date] : [];
      const found = (detail || []).find(x => x && x.name === storeName);
      if (found) total = found.total || 0;
    } else {
      total = row.total || 0;
    }

    list.push({ date: date, total: total });
  }

  list.sort((a, b) => a.date.localeCompare(b.date));
  return list;
}

function renderGenderChart(male, female) {
  const ctx = recreateCanvas('genderChartContainer', 'genderChart');
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
      plugins: {
        legend: { position: 'bottom', labels: { color: '#e0e0e0' } },
        tooltip: {
          callbacks: {
            label: (c) => `${c.label}: ${formatNumber(c.raw)}`
          }
        }
      }
    }
  });
}

function renderDailyCustomerChart(dailySales, basePrice) {
  const ctx = recreateCanvas('dailyCustomerChartContainer', 'dailyCustomerChart');
  if (!ctx) return;

  const labels = dailySales.map(d => formatDateShort(d.date));
  const customers = dailySales.map(d => Math.ceil((d.total || 0) / basePrice) || 0);

  charts.daily = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '일별 고객 수(추정)',
        data: customers,
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0,212,255,0.12)',
        fill: true,
        tension: 0.25,
        pointRadius: 3,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const idx = items[0].dataIndex;
              return formatDateKorean(dailySales[idx].date);
            },
            label: (c) => `고객 수(추정): ${formatNumber(c.raw)}명`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#888' }, grid: { display: false } },
        y: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
      }
    }
  });
}

function renderAgeChart(ageCounts) {
  const ctx = recreateCanvas('ageChartContainer', 'ageChart');
  if (!ctx) return;

  const labels = Object.keys(ageCounts);
  const values = labels.map(k => ageCounts[k] || 0);

  charts.age = new Chart(ctx, {
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
      plugins: {
        legend: { position: 'bottom', labels: { color: '#e0e0e0' } }
      }
    }
  });
}

function renderVisitChart(labels, maleData, femaleData) {
  const ctx = recreateCanvas('visitChartContainer', 'visitChart');
  if (!ctx) return;

  charts.visit = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: '남성', data: maleData, backgroundColor: 'rgba(78,205,196,0.75)', borderWidth: 0 },
        { label: '여성', data: femaleData, backgroundColor: 'rgba(123,44,191,0.75)', borderWidth: 0 }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#e0e0e0' } },
        tooltip: {
          callbacks: { label: (c) => `${c.dataset.label}: ${formatNumber(c.raw)}` }
        }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { stacked: true, ticks: { color: '#888' }, grid: { display: false } }
      }
    }
  });
}

/* =========================
   2) 플레이스 순위 변동
   ========================= */

function renderRankChangeTable() {
  const tbody = document.getElementById('rankChangeTableBody');
  if (!tbody) return;

  if (!marketingData || !marketingData.tracking_history) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">마케팅 데이터가 없습니다.</td></tr>`;
    return;
  }

  const rows = [];

  Object.keys(marketingData.tracking_history).forEach(key => {
    const item = marketingData.tracking_history[key];
    const history = (item && item.history) ? item.history : [];
    if (!history || history.length < 2) return;

    const latest = history[0];
    const prev = history[1];

    const currRank = (latest && latest.rank) ? Number(latest.rank) : null;
    const prevRank = (prev && prev.rank) ? Number(prev.rank) : null;

    const changed = !(currRank === prevRank || (currRank === null && prevRank === null));
    if (!changed) return;

    const store = item.store_name || key.split('|')[0] || '';
    const keyword = item.keyword || key.split('|')[1] || '';
    const date = latest.date || '';

    const delta = calcRankDelta(currRank, prevRank);

    rows.push({
      store,
      keyword,
      currRank,
      prevRank,
      delta,
      date
    });
  });

  // 정렬: 변화가 큰 것 우선, 그 다음 현재순위 좋은 것 우선
  rows.sort((a, b) => {
    const da = rankDeltaScore(a.delta);
    const db = rankDeltaScore(b.delta);
    if (da !== db) return db - da;

    const ar = a.currRank === null ? 9999 : a.currRank;
    const br = b.currRank === null ? 9999 : b.currRank;
    return ar - br;
  });

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">순위 변동 내역이 없습니다.</td></tr>`;
    return;
  }

  const limit = rows.slice(0, 30);

  tbody.innerHTML = limit.map(r => {
    const curr = r.currRank === null ? '순위권 밖' : `${r.currRank}위`;
    const prev = r.prevRank === null ? '순위권 밖' : `${r.prevRank}위`;

    const badgeClass = rankBadgeClass(r.currRank);
    const deltaHtml = renderDeltaBadge(r.delta);

    return `
      <tr>
        <td>${escapeHtml(r.store)}</td>
        <td>${escapeHtml(r.keyword)}</td>
        <td class="text-center"><span class="badge-rank ${badgeClass}">${curr}</span></td>
        <td class="text-center">${prev}</td>
        <td class="text-center">${deltaHtml}</td>
        <td>${escapeHtml(r.date)}</td>
      </tr>
    `;
  }).join('');
}

function calcRankDelta(currRank, prevRank) {
  // 순위는 낮을수록 좋음: (prev - curr) > 0 이면 개선
  if (currRank !== null && prevRank !== null) {
    const diff = prevRank - currRank;
    if (diff > 0) return { type: 'up', value: diff, label: `상승 ${diff}` };
    if (diff < 0) return { type: 'down', value: Math.abs(diff), label: `하락 ${Math.abs(diff)}` };
    return { type: 'same', value: 0, label: '변동없음' };
  }

  if (currRank !== null && prevRank === null) {
    return { type: 'new', value: 1, label: '진입' };
  }

  if (currRank === null && prevRank !== null) {
    return { type: 'out', value: 1, label: '이탈' };
  }

  return { type: 'same', value: 0, label: '변동없음' };
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
  if (!delta) return `<span class="delta">-</span>`;

  if (delta.type === 'up') return `<span class="delta delta-up">+${delta.value}</span>`;
  if (delta.type === 'down') return `<span class="delta delta-down">-${delta.value}</span>`;
  if (delta.type === 'new') return `<span class="delta delta-new">진입</span>`;
  if (delta.type === 'out') return `<span class="delta delta-out">이탈</span>`;
  return `<span class="delta">-</span>`;
}

/* =========================
   3) 발주 가격 변동 품목
   ========================= */

function renderPriceChangeTable() {
  const tbody = document.getElementById('priceChangeTableBody');
  if (!tbody) return;

  if (!orderData || !Array.isArray(orderData.price_changes)) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center">발주 데이터가 없습니다.</td></tr>`;
    return;
  }

  const changed = orderData.price_changes
    .filter(x => x && typeof x.change === 'number' && x.change !== 0)
    .map(x => x);

  if (changed.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center">가격 변동 품목이 없습니다.</td></tr>`;
    return;
  }

  changed.sort((a, b) => Math.abs(b.change_pct || 0) - Math.abs(a.change_pct || 0));

  const top = changed.slice(0, 40);

  tbody.innerHTML = top.map(item => {
    const first = item.first_price || 0;
    const last = item.last_price || 0;
    const change = item.change || 0;
    const pct = (typeof item.change_pct === 'number') ? item.change_pct : 0;

    const changeText = (change > 0)
      ? `+${formatNumber(change)}`
      : `-${formatNumber(Math.abs(change))}`;

    const pctText = (pct > 0) ? `+${pct}%` : `${pct}%`;

    const pctClass = (pct > 0) ? 'change-positive' : 'change-negative';

    const period = (item.first_date && item.last_date)
      ? `${item.first_date} ~ ${item.last_date}`
      : '-';

    return `
      <tr>
        <td>${escapeHtml(item.name || '')}</td>
        <td>${escapeHtml(item.category || '')}</td>
        <td class="text-right">${formatCurrency(first)}</td>
        <td class="text-right">${formatCurrency(last)}</td>
        <td class="text-right ${pctClass}">${changeText}</td>
        <td class="text-right ${pctClass}">${pctText}</td>
        <td>${escapeHtml(period)}</td>
      </tr>
    `;
  }).join('');
}

/* =========================
   Utilities
   ========================= */

function setText(id, text) {
  const el = document.getElementById(id);
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
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[0]}년 ${parseInt(parts[1], 10)}월 ${parseInt(parts[2], 10)}일`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
}

function getMaxDate(dates) {
  if (!dates || dates.length === 0) return null;
  return dates.slice().sort().pop();
}

function addDays(dateStr, deltaDays) {
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  d.setDate(d.getDate() + deltaDays);
  return formatYmd(d);
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const p = String(dateStr).split('-');
  if (p.length !== 3) return null;
  const y = parseInt(p[0], 10);
  const m = parseInt(p[1], 10) - 1;
  const d = parseInt(p[2], 10);
  const dt = new Date(y, m, d);
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function formatYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text || '');
  return div.innerHTML;
}

function escapeHtmlAttr(text) {
  return String(text || '').replace(/"/g, '&quot;');
}
