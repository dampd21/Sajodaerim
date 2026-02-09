/**
 * 마케팅 관리 대시보드
 * - 순위 추적 (새로고침으로 실시간 순위 조회)
 * - 경쟁사 분석 (Cloudflare Workers 프록시)
 * - 키워드 설정 (localStorage)
 * - 정렬 기능 (타임라인/테이블뷰)
 */

let marketingData = null;
let configData = null;
let rankChart = null;

// 정렬 상태
let currentSort = { field: 'store', dir: 'asc' };
let tableSort = { field: 'store', dir: 'asc' };

const STORE_LIST = [
    "역대짬뽕 본점", "역대짬뽕 병점점", "역대짬뽕 송파점",
    "역대짬뽕 다산1호점", "역대짬뽕 화성반월점", "역대짬뽕 오산시청점",
    "역대짬뽕 두정점", "역대짬뽕 송탄점", "역대짬뽕 여수국동점"
];

const STORE_PLACES = {
    "역대짬뽕 본점": "1542530224",
    "역대짬뽕 병점점": "1870047654",
    "역대짬뽕 송파점": "2066998075",
    "역대짬뽕 다산1호점": "1455516190",
    "역대짬뽕 화성반월점": "1474983307",
    "역대짬뽕 오산시청점": "1160136895",
    "역대짬뽕 두정점": "1726445983",
    "역대짬뽕 송탄점": "1147851109",
    "역대짬뽕 여수국동점": "1773140342"
};

const PROXY_URL = "https://naver-place-proxy.dampd21.workers.dev";

let memoData = {};

// ============================================
// 초기화
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    loadProxyUrl();
    loadMemos();
    loadSortState();
    await loadData();
    initEventListeners();
    initFilters();
    renderDashboard();
});

function loadProxyUrl() {
    var saved = localStorage.getItem('marketing_proxy_url');
    window.NAVER_PROXY_URL = saved || PROXY_URL;
}

function loadMemos() {
    try {
        var saved = localStorage.getItem('marketing_memos');
        if (saved) memoData = JSON.parse(saved);
    } catch (e) {}
}

function saveMemos() {
    try { localStorage.setItem('marketing_memos', JSON.stringify(memoData)); } catch (e) {}
}

function loadSortState() {
    try {
        var saved = localStorage.getItem('marketing_sort');
        if (saved) currentSort = JSON.parse(saved);
        var savedTable = localStorage.getItem('marketing_table_sort');
        if (savedTable) tableSort = JSON.parse(savedTable);
    } catch (e) {}
}

function saveSortState() {
    try {
        localStorage.setItem('marketing_sort', JSON.stringify(currentSort));
        localStorage.setItem('marketing_table_sort', JSON.stringify(tableSort));
    } catch (e) {}
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

// ============================================
// 데이터 로드
// ============================================

async function loadData() {
    try {
        var r = await fetch('marketing_data.json?t=' + Date.now());
        if (r.ok) {
            marketingData = await r.json();
            if (marketingData.generated_at) {
                var el = document.getElementById('updateTime');
                if (el) el.textContent = '마지막 업데이트: ' + formatDateTime(new Date(marketingData.generated_at));
            }
        }
    } catch (e) {}

    if (!marketingData) marketingData = { tracking_history: {}, competitor_analysis: {} };

    var lc = localStorage.getItem('marketing_config');
    if (lc) try { configData = JSON.parse(lc); } catch (e) { configData = null; }
    if (!configData) {
        try {
            var cr = await fetch('marketing_config.json?t=' + Date.now());
            if (cr.ok) configData = await cr.json();
        } catch (e) {}
    }
    if (!configData) configData = { tracking_keywords: {} };
}

// ============================================
// 이벤트
// ============================================

function initEventListeners() {
    // 탭
    document.querySelectorAll('.tabs .tab').forEach(function(t) {
        t.addEventListener('click', function() { switchTab(t.dataset.tab); });
    });

    // 필터
    var ss = document.getElementById('storeSelect');
    if (ss) ss.addEventListener('change', function() { updateKeywordFilter(); filterAndRender(); });
    var ks = document.getElementById('keywordSelect');
    if (ks) ks.addEventListener('change', filterAndRender);
    var ps = document.getElementById('periodSelect');
    if (ps) ps.addEventListener('change', filterAndRender);

    // 뷰 토글
    document.querySelectorAll('.view-btn').forEach(function(b) {
        b.addEventListener('click', function() { switchView(b.dataset.view); });
    });

    // 정렬 셀렉트
    var sortSel = document.getElementById('sortSelect');
    if (sortSel) {
        sortSel.value = currentSort.field;
        sortSel.addEventListener('change', function() {
            currentSort.field = sortSel.value;
            saveSortState();
            filterAndRender();
        });
    }

    // 정렬 방향 버튼
    var sortDirBtn = document.getElementById('sortDirBtn');
    if (sortDirBtn) {
        updateSortDirBtn();
        sortDirBtn.addEventListener('click', function() {
            currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
            updateSortDirBtn();
            saveSortState();
            filterAndRender();
        });
    }

    // 테이블 헤더 정렬
    document.querySelectorAll('#historyTable thead th.sortable').forEach(function(th) {
        th.addEventListener('click', function() {
            var field = th.dataset.sort;
            if (tableSort.field === field) {
                tableSort.dir = tableSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                tableSort.field = field;
                tableSort.dir = 'asc';
            }
            saveSortState();
            updateTableSortHeaders();
            filterAndRender();
        });
    });

    // 새로고침
    var refreshBtn = document.getElementById('refreshRankBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshRanking);

    // 경쟁사 분석
    var runBtn = document.getElementById('runAnalysisBtn');
    if (runBtn) runBtn.addEventListener('click', runCompetitorAnalysis);
    var ai = document.getElementById('analysisKeyword');
    if (ai) ai.addEventListener('keydown', function(e) { if (e.key === 'Enter') runCompetitorAnalysis(); });

    // 키워드 설정 저장
    var sb = document.getElementById('saveSettingsBtn');
    if (sb) sb.addEventListener('click', saveKeywordSettings);

    // 모달
    var mc = document.querySelector('#detailModal .modal-close');
    if (mc) mc.addEventListener('click', closeModal);
    var m = document.getElementById('detailModal');
    if (m) m.addEventListener('click', function(e) { if (e.target.id === 'detailModal') closeModal(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });
}

function updateSortDirBtn() {
    var btn = document.getElementById('sortDirBtn');
    if (!btn) return;
    if (currentSort.dir === 'desc') {
        btn.classList.add('desc');
        btn.title = '내림차순 (클릭하여 오름차순)';
    } else {
        btn.classList.remove('desc');
        btn.title = '오름차순 (클릭하여 내림차순)';
    }
}

function updateTableSortHeaders() {
    document.querySelectorAll('#historyTable thead th.sortable').forEach(function(th) {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === tableSort.field) {
            th.classList.add(tableSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

function switchTab(id) {
    document.querySelectorAll('.tabs .tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === id); });
    document.querySelectorAll('.tab-pane').forEach(function(p) { p.classList.toggle('active', p.id === id); });
    if (id === 'keywordSettings') renderKeywordSettings();
    else if (id === 'competitorAnalysis') renderSavedAnalysis();
}

function switchView(v) {
    document.querySelectorAll('.view-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.view === v); });
    var tlv = document.getElementById('historyTimelineView');
    var cv = document.getElementById('historyCardView');
    var tv = document.getElementById('historyTableView');
    if (tlv) tlv.style.display = v === 'timeline' ? 'block' : 'none';
    if (cv) cv.style.display = v === 'card' ? 'grid' : 'none';
    if (tv) tv.style.display = v === 'table' ? 'block' : 'none';
}

function closeModal() {
    var m = document.getElementById('detailModal');
    if (m) m.classList.remove('show');
}

// ============================================
// 필터
// ============================================

function initFilters() {
    var ss = document.getElementById('storeSelect');
    if (ss) {
        ss.innerHTML = '<option value="">전체 지점</option>';
        STORE_LIST.forEach(function(s) { ss.innerHTML += '<option value="' + s + '">' + s + '</option>'; });
    }
    updateKeywordFilter();
}

function updateKeywordFilter() {
    var ks = document.getElementById('keywordSelect');
    var sf = (document.getElementById('storeSelect') || {}).value || '';
    if (!ks || !marketingData) return;

    var kws = new Set();
    Object.keys(marketingData.tracking_history || {}).forEach(function(k) {
        var p = k.split('|');
        if (!sf || p[0] === sf) kws.add(p[1]);
    });

    ks.innerHTML = '<option value="">전체 키워드</option>';
    Array.from(kws).sort().forEach(function(k) { ks.innerHTML += '<option value="' + k + '">' + k + '</option>'; });
}

// ============================================
// 정렬 헬퍼
// ============================================

function getSortValue(item, field) {
    var latest = item.history[0];
    var prev = item.history[1];
    var ranks = item.history.filter(function(h) { return h.rank; }).map(function(h) { return h.rank; });

    switch (field) {
        case 'store':
            return item.store_name;
        case 'keyword':
            return item.keyword;
        case 'rank':
            return latest && latest.rank ? latest.rank : 9999;
        case 'change':
            if (latest && latest.rank && prev && prev.rank) return prev.rank - latest.rank;
            return -9999;
        case 'best':
            return ranks.length ? Math.min.apply(null, ranks) : 9999;
        case 'avg':
            return ranks.length ? ranks.reduce(function(a, b) { return a + b; }, 0) / ranks.length : 9999;
        default:
            return item.store_name;
    }
}

function sortData(data, field, dir) {
    var sorted = data.slice();
    sorted.sort(function(a, b) {
        var va = getSortValue(a, field);
        var vb = getSortValue(b, field);
        var cmp = 0;
        if (typeof va === 'string' && typeof vb === 'string') {
            cmp = va.localeCompare(vb, 'ko');
        } else {
            cmp = va - vb;
        }
        return dir === 'desc' ? -cmp : cmp;
    });
    return sorted;
}

// ============================================
// 대시보드
// ============================================

function renderDashboard() {
    if (marketingData) filterAndRender();
}

function filterAndRender() {
    var sf = (document.getElementById('storeSelect') || {}).value || '';
    var kf = (document.getElementById('keywordSelect') || {}).value || '';
    var pd = parseInt((document.getElementById('periodSelect') || {}).value || '30');
    var fd = [];

    Object.entries(marketingData.tracking_history || {}).forEach(function(e) {
        var k = e[0], d = e[1], p = k.split('|');
        if (sf && p[0] !== sf) return;
        if (kf && p[1] !== kf) return;
        var h = (d.history || []).slice(0, pd);
        if (h.length > 0) fd.push({ key: k, store_name: p[0], keyword: p[1], place_id: d.place_id, history: h });
    });

    // 정렬 적용
    var sortedData = sortData(fd, currentSort.field, currentSort.dir);

    renderSummaryCards(fd);
    renderRankChart(fd);
    renderTimelineView(sortedData);
    renderHistoryCards(sortedData);
    renderHistoryTable(fd);
    updateTableSortHeaders();

    setTimeout(initHiddenCards, 100);
}

function renderSummaryCards(data) {
    document.getElementById('totalKeywords').textContent = data.length;

    if (!data.length) {
        document.getElementById('avgRank').textContent = '-';
        document.getElementById('rankUp').textContent = '-';
        document.getElementById('rankDown').textContent = '-';
        return;
    }

    var tr = 0, rc = 0, ru = 0, rd = 0;
    data.forEach(function(i) {
        var l = i.history[0], p = i.history[1];
        if (l && l.rank) {
            tr += l.rank; rc++;
            if (p && p.rank) {
                if (l.rank < p.rank) ru++;
                else if (l.rank > p.rank) rd++;
            }
        }
    });

    document.getElementById('avgRank').textContent = rc > 0 ? (tr / rc).toFixed(1) + '위' : '-';
    document.getElementById('rankUp').textContent = ru;
    document.getElementById('rankDown').textContent = rd;
}

function renderRankChart(data) {
    if (rankChart) { rankChart.destroy(); rankChart = null; }

    var ctx = recreateCanvas('rankChartContainer', 'rankChart');
    if (!ctx || !data.length) return;

    var ds = new Set();
    data.forEach(function(i) { i.history.forEach(function(h) { ds.add(h.date); }); });

    var dates = Array.from(ds).sort().reverse().slice(0, 30).reverse();
    var colors = ['#00d4ff', '#7b2cbf', '#4ecdc4', '#ff6b6b', '#ffe66d', '#51cf66', '#f59f00', '#e64980'];

    var datasets = data.slice(0, 8).map(function(i, idx) {
        return {
            label: i.store_name.replace('역대짬뽕 ', '') + ' | ' + i.keyword,
            data: dates.map(function(d) {
                var f = i.history.find(function(h) { return h.date === d; });
                return f && f.rank ? f.rank : null;
            }),
            borderColor: colors[idx % colors.length],
            backgroundColor: colors[idx % colors.length] + '20',
            tension: 0,
            fill: false,
            spanGaps: true,
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2
        };
    });

    rankChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(function(d) {
                var dt = new Date(d);
                return (dt.getMonth() + 1) + '.' + dt.getDate();
            }),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { color: '#e0e0e0', font: { size: 11 }, boxWidth: 12, padding: 12 } },
                tooltip: { callbacks: { label: function(c) { return c.dataset.label + ': ' + (c.raw ? c.raw + '위' : '-'); } } },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                }
            },
            scales: {
                x: { ticks: { color: '#888' }, grid: { display: false } },
                y: {
                    reverse: true,
                    min: 1,
                    ticks: { color: '#888', callback: function(v) { return v + '위'; } },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

// ============================================
// 타임라인 뷰
// ============================================

function renderTimelineView(data) {
    var container = document.getElementById('historyTimelineView');
    if (!container) return;

    if (!data.length) {
        container.innerHTML = '<div class="no-data">추적 중인 키워드가 없습니다.</div>';
        return;
    }

    var today = new Date();
    var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    container.innerHTML = data.map(function(item) {
        var latest = item.history[0];
        var prev = item.history[1];
        var currentRank = latest && latest.rank ? latest.rank : null;

        var rankBadgeClass = 'rank-out';
        var rankBadgeText = '순위권 밖';
        if (currentRank) {
            rankBadgeText = '현재 ' + currentRank + '위';
            if (currentRank <= 10) rankBadgeClass = 'rank-good';
            else if (currentRank <= 30) rankBadgeClass = 'rank-normal';
            else rankBadgeClass = 'rank-bad';
        }

        var changeHtml = '';
        if (currentRank && prev && prev.rank) {
            var diff = prev.rank - currentRank;
            if (diff > 0) changeHtml = '<span class="tl-chg up">▲' + diff + '</span>';
            else if (diff < 0) changeHtml = '<span class="tl-chg dn">▼' + Math.abs(diff) + '</span>';
        }

        var ranks = item.history.filter(function(h) { return h.rank; }).map(function(h) { return h.rank; });
        var bestRank = ranks.length ? Math.min.apply(null, ranks) : '-';
        var worstRank = ranks.length ? Math.max.apply(null, ranks) : '-';
        var avgRank = ranks.length ? (ranks.reduce(function(a, b) { return a + b; }, 0) / ranks.length).toFixed(1) : '-';

        var defaultShow = 7;
        var hasMore = item.history.length > defaultShow;

        var cards = item.history.map(function(h, idx) {
            var dt = new Date(h.date);
            var mm = String(dt.getMonth() + 1).padStart(2, '0');
            var dd = String(dt.getDate()).padStart(2, '0');
            var wd = ['일','월','화','수','목','금','토'][dt.getDay()];
            var isToday = h.date === todayStr ? ' tl-today' : '';
            var hiddenClass = idx >= defaultShow ? ' tl-card-hidden' : '';

            var rankHtml = '';
            if (h.rank) {
                rankHtml = '<span class="tl-num">' + h.rank + '</span><span class="tl-sfx">위</span>';
            } else {
                rankHtml = '<span class="tl-num rank-out">순위권밖</span>';
            }

            var dayChgHtml = '';
            var nextItem = item.history[idx + 1];
            if (h.rank && nextItem && nextItem.rank) {
                var dayDiff = nextItem.rank - h.rank;
                if (dayDiff > 0) dayChgHtml = '<span class="tl-chg up">▲' + dayDiff + '</span>';
                else if (dayDiff < 0) dayChgHtml = '<span class="tl-chg dn">▼' + Math.abs(dayDiff) + '</span>';
                else dayChgHtml = '<span class="tl-chg same">-</span>';
            }

            var statsHtml = '';
            if (h.blog_reviews || h.visitor_reviews || h.save_count) {
                statsHtml = '<div class="tl-stats">';
                if (h.blog_reviews) statsHtml += '<span><span class="tl-lbl">블</span> ' + h.blog_reviews + '</span>';
                if (h.visitor_reviews) statsHtml += '<span><span class="tl-lbl">방</span> ' + (formatNumber(h.visitor_reviews) || '-') + '</span>';
                if (h.save_count) statsHtml += '<span><span class="tl-lbl">저</span> ' + h.save_count + '</span>';
                statsHtml += '</div>';
            }

            return '<div class="tl-card' + isToday + hiddenClass + '" data-idx="' + idx + '">' +
                '<div class="tl-date">' + mm + '.' + dd + ' <span class="tl-wd">' + wd + '</span></div>' +
                '<div class="tl-rank">' + rankHtml + dayChgHtml + '</div>' +
                statsHtml +
                '</div>';
        }).join('');

        var expandBtnHtml = '';
        if (hasMore) {
            expandBtnHtml = '<button class="tl-expand-btn" data-key="' + item.key + '" onclick="toggleTimelineExpand(this)">' +
                '<span>더보기 (+' + (item.history.length - defaultShow) + '일) <span class="tl-arrow">▼</span></span>' +
                '</button>';
        }

        var memoValue = memoData[item.key] || '';
        var memoHtml = '<div class="tl-memo">' +
            '<label>메모</label>' +
            '<input type="text" placeholder="메모를 입력해주세요" value="' + escapeHtml(memoValue) + '" data-key="' + item.key + '">' +
            '<button class="btn-memo" onclick="saveMemo(this)">저장</button>' +
            '</div>';

        return '<div class="tl-row">' +
            '<div class="tl-hdr">' +
                '<div class="tl-info">' +
                    '<span class="tl-store">' + item.store_name + '</span>' +
                    '<span class="tl-kw">' + item.keyword + '</span>' +
                    '<span class="tl-pid" title="Place ID: ' + (item.place_id || '') + '">' + (item.place_id || '') + '</span>' +
                    '<span class="tl-current-rank ' + rankBadgeClass + '">' + rankBadgeText + '</span>' +
                    changeHtml +
                '</div>' +
                '<div class="tl-smry">' +
                    '<div class="tl-sg">' +
                        '<span class="best">최고 ' + bestRank + '위</span>' +
                        '<span class="avg">평균 ' + avgRank + '위</span>' +
                        '<span class="wrst">최저 ' + worstRank + '위</span>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="tl-scroll">' + cards + '</div>' +
            expandBtnHtml +
            memoHtml +
            '</div>';
    }).join('');
}

function toggleTimelineExpand(btn) {
    var row = btn.closest('.tl-row');
    var hiddenCards = row.querySelectorAll('.tl-card-hidden');
    var isExpanded = btn.classList.contains('expanded');

    if (isExpanded) {
        hiddenCards.forEach(function(card) { card.style.display = 'none'; });
        btn.classList.remove('expanded');
        var totalHidden = row.querySelectorAll('.tl-card-hidden').length;
        btn.querySelector('span').innerHTML = '더보기 (+' + totalHidden + '일) <span class="tl-arrow">▼</span>';
    } else {
        hiddenCards.forEach(function(card) { card.style.display = ''; });
        btn.classList.add('expanded');
        btn.querySelector('span').innerHTML = '접기 <span class="tl-arrow">▼</span>';
    }
}

function initHiddenCards() {
    document.querySelectorAll('.tl-card-hidden').forEach(function(card) {
        card.style.display = 'none';
    });
}

function saveMemo(btn) {
    var memoDiv = btn.closest('.tl-memo');
    var input = memoDiv.querySelector('input');
    var key = input.dataset.key;
    memoData[key] = input.value;
    saveMemos();
    showToast('메모 저장 완료', 'success');
}

// ============================================
// 카드뷰
// ============================================

function renderHistoryCards(data) {
    var c = document.getElementById('historyCardView');
    if (!c) return;
    if (!data.length) { c.innerHTML = '<div class="no-data">추적 중인 키워드가 없습니다.</div>'; return; }

    c.innerHTML = data.map(function(i) {
        var l = i.history[0], p = i.history[1], ch = '';
        if (l && l.rank && p && p.rank) {
            var d = p.rank - l.rank;
            if (d > 0) ch = '<span class="rank-change up">+' + d + '</span>';
            else if (d < 0) ch = '<span class="rank-change down">' + d + '</span>';
            else ch = '<span class="rank-change same">-</span>';
        }

        var tl = i.history.slice(0, 14).map(function(h) {
            var dt = new Date(h.date);
            var wd = ['일','월','화','수','목','금','토'][dt.getDay()];
            return '<div class="timeline-item">' +
                '<div class="timeline-date">' + (dt.getMonth() + 1) + '.' + String(dt.getDate()).padStart(2,'0') +
                ' <span class="weekday">' + wd + '</span></div>' +
                '<div class="timeline-rank">' + (h.rank ? h.rank + '위' : '-') + '</div>' +
                '<div class="timeline-stats">' +
                    '<span><span class="stat-label">블</span> ' + (h.blog_reviews || '-') + '</span>' +
                    '<span><span class="stat-label">방</span> ' + ((formatNumber(h.visitor_reviews) || '-') ) + '</span>' +
                    '<span><span class="stat-label">저</span> ' + (h.save_count || '-') + '</span>' +
                '</div>' +
            '</div>';
        }).join('');

        return '<div class="history-card">' +
            '<div class="history-card-header">' +
                '<div class="history-card-store">' + i.store_name + '</div>' +
                '<div class="history-card-keyword">' + i.keyword + '</div>' +
            '</div>' +
            '<div class="history-card-rank">' +
                '<span class="rank-number">' + (l && l.rank ? l.rank : '-') + '</span>' +
                ch +
                '<div class="rank-label">현재 순위</div>' +
            '</div>' +
            '<div class="history-timeline">' + tl + '</div>' +
        '</div>';
    }).join('');
}

// ============================================
// 테이블뷰 (지점별 그룹 구분 + 정렬)
// ============================================

function renderHistoryTable(data) {
    var tb = document.getElementById('historyTableBody');
    if (!tb) return;

    // 전체 행 수집
    var rows = [];
    data.forEach(function(i) {
        var storeIdx = STORE_LIST.indexOf(i.store_name);
        if (storeIdx === -1) storeIdx = 99;

        i.history.slice(0, 7).forEach(function(h) {
            rows.push({
                date: h.date,
                weekday: h.weekday,
                store: i.store_name,
                storeIdx: storeIdx,
                keyword: i.keyword,
                rank: h.rank || null,
                blog: h.blog_reviews,
                visitor: h.visitor_reviews,
                save: h.save_count,
                score: h.score
            });
        });
    });

    if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="8" class="text-center">데이터가 없습니다.</td></tr>';
        return;
    }

    // 테이블 정렬
    rows = sortTableRows(rows, tableSort.field, tableSort.dir);

    // 지점별 그룹 인덱스 계산
    var storeGroupMap = {};
    var storeOrder = [];
    rows.forEach(function(r) {
        if (storeOrder.indexOf(r.store) === -1) storeOrder.push(r.store);
    });
    storeOrder.forEach(function(s, idx) { storeGroupMap[s] = idx; });

    // 렌더링
    var html = '';
    var prevStore = null;
    var groupIdx = -1;

    rows.slice(0, 200).forEach(function(r) {
        var isNewGroup = r.store !== prevStore;
        if (isNewGroup) {
            groupIdx++;
            prevStore = r.store;

            var colorIdx = STORE_LIST.indexOf(r.store);
            if (colorIdx === -1) colorIdx = groupIdx;
            colorIdx = colorIdx % 9;

            // 지점 그룹 구분 헤더 행
            var groupCount = rows.filter(function(x) { return x.store === r.store; }).length;
            html += '<tr class="store-group-header">' +
                '<td colspan="8"><span class="store-group-badge">' +
                '<span class="store-color-bar store-color-' + colorIdx + '"></span>' +
                r.store +
                '</span><span class="store-group-count">' + groupCount + '건</span></td></tr>';
        }

        var groupClass = (groupIdx % 2 === 0) ? 'store-group-even' : 'store-group-odd';
        var rankDisplay = r.rank ? r.rank + '위' : '-';

        var rankClass = '';
        if (r.rank && r.rank <= 10) rankClass = ' style="color:#4ecdc4;font-weight:700;"';
        else if (r.rank && r.rank > 40) rankClass = ' style="color:#ff6b6b;"';

        html += '<tr class="' + groupClass + '">' +
            '<td>' + r.date + ' ' + (r.weekday || '') + '</td>' +
            '<td>' + r.store + '</td>' +
            '<td>' + r.keyword + '</td>' +
            '<td class="text-center"' + rankClass + '>' + rankDisplay + '</td>' +
            '<td class="text-right">' + (r.blog || '-') + '</td>' +
            '<td class="text-right">' + (formatNumber(r.visitor) || '-') + '</td>' +
            '<td class="text-right">' + (r.save || '-') + '</td>' +
            '<td class="text-center">' + (r.score || '-') + '</td>' +
            '</tr>';
    });

    tb.innerHTML = html;
}

function sortTableRows(rows, field, dir) {
    var sorted = rows.slice();
    sorted.sort(function(a, b) {
        var va, vb, cmp = 0;
        switch (field) {
            case 'date':
                va = a.date; vb = b.date;
                cmp = va.localeCompare(vb);
                break;
            case 'store':
                va = a.storeIdx; vb = b.storeIdx;
                cmp = va - vb;
                if (cmp === 0) { cmp = a.keyword.localeCompare(b.keyword, 'ko'); }
                if (cmp === 0) { cmp = b.date.localeCompare(a.date); }
                break;
            case 'keyword':
                va = a.keyword; vb = b.keyword;
                cmp = va.localeCompare(vb, 'ko');
                if (cmp === 0) { cmp = a.storeIdx - b.storeIdx; }
                if (cmp === 0) { cmp = b.date.localeCompare(a.date); }
                break;
            case 'rank':
                va = a.rank || 9999; vb = b.rank || 9999;
                cmp = va - vb;
                break;
            case 'blog':
                va = parseInt(String(a.blog || '0').replace(/,/g, '')) || 0;
                vb = parseInt(String(b.blog || '0').replace(/,/g, '')) || 0;
                cmp = va - vb;
                break;
            case 'visitor':
                va = parseInt(String(a.visitor || '0').replace(/,/g, '')) || 0;
                vb = parseInt(String(b.visitor || '0').replace(/,/g, '')) || 0;
                cmp = va - vb;
                break;
            case 'save':
                va = parseInt(String(a.save || '0').replace(/,/g, '')) || 0;
                vb = parseInt(String(b.save || '0').replace(/,/g, '')) || 0;
                cmp = va - vb;
                break;
            case 'score':
                va = parseFloat(a.score) || 0; vb = parseFloat(b.score) || 0;
                cmp = va - vb;
                break;
            default:
                cmp = a.storeIdx - b.storeIdx;
        }
        return dir === 'desc' ? -cmp : cmp;
    });
    return sorted;
}

// ============================================
// 실시간 순위 새로고침
// ============================================

async function refreshRanking() {
    var btn = document.getElementById('refreshRankBtn');
    var btnText = document.getElementById('refreshBtnText');
    var progressEl = document.getElementById('refreshProgress');
    var progressText = document.getElementById('refreshProgressText');
    var progressBar = document.getElementById('refreshProgressBar');

    var proxyUrl = getProxyUrl();
    if (!proxyUrl) { showProxySetupGuide(); return; }

    var storeFilter = (document.getElementById('storeSelect') || {}).value || '';
    var keywordFilter = (document.getElementById('keywordSelect') || {}).value || '';
    var trackingKeywords = configData ? configData.tracking_keywords || {} : {};
    var tasks = [];

    Object.keys(trackingKeywords).forEach(function(store) {
        if (storeFilter && store !== storeFilter) return;
        var placeId = STORE_PLACES[store];
        if (!placeId) return;
        trackingKeywords[store].forEach(function(keyword) {
            if (keywordFilter && keyword !== keywordFilter) return;
            tasks.push({ store: store, placeId: placeId, keyword: keyword });
        });
    });

    if (!tasks.length) { showToast('추적할 키워드가 없습니다.', 'error'); return; }

    btn.disabled = true;
    btn.classList.add('refreshing');
    btnText.textContent = '조회 중...';
    progressEl.style.display = 'block';

    var today = new Date();
    var dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    var weekday = ['일','월','화','수','목','금','토'][today.getDay()];
    var ok = 0, fail = 0;

    for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];
        progressText.textContent = '(' + (i + 1) + '/' + tasks.length + ') ' + task.store.replace('역대짬뽕 ', '') + ' - ' + task.keyword;
        progressBar.style.width = Math.round((i / tasks.length) * 100) + '%';

        try {
            var result = await searchNaverPlace(task.keyword, 100);
            var rank = null, matchedItem = null;
            if (result.items) {
                for (var j = 0; j < result.items.length; j++) {
                    if (String(result.items[j].id) === task.placeId) { rank = j + 1; matchedItem = result.items[j]; break; }
                }
            }

            var hk = task.store + '|' + task.keyword;
            if (!marketingData.tracking_history) marketingData.tracking_history = {};
            if (!marketingData.tracking_history[hk]) marketingData.tracking_history[hk] = { store_name: task.store, place_id: task.placeId, keyword: task.keyword, history: [] };

            var td = {
                date: dateStr, weekday: weekday, rank: rank,
                blog_reviews: matchedItem ? String(matchedItem.blogCafeReviewCount || 0) : '0',
                visitor_reviews: matchedItem ? String(matchedItem.visitorReviewCount || 0) : '0',
                save_count: matchedItem ? String(matchedItem.saveCount || 0) : '0',
                score: matchedItem ? (matchedItem.visitorReviewScore || 0) : 0, method: 'browser_refresh'
            };

            var hist = marketingData.tracking_history[hk].history;
            if (hist.length > 0 && hist[0].date === dateStr) hist[0] = td;
            else { hist.unshift(td); if (hist.length > 90) hist.length = 90; }
            ok++;
        } catch (e) { fail++; }

        if (i < tasks.length - 1) await delay(800);
    }

    progressBar.style.width = '100%';
    progressText.textContent = '완료! (성공 ' + ok + ' / 실패 ' + fail + ')';

    marketingData.generated_at = new Date().toISOString();

    var el = document.getElementById('updateTime');
    if (el) el.textContent = '마지막 업데이트: ' + formatDateTime(new Date());

    filterAndRender();

    setTimeout(function() {
        progressEl.style.display = 'none';
        btn.disabled = false;
        btn.classList.remove('refreshing');
        btnText.textContent = '새로고침';
    }, 2000);

    if (ok > 0) showToast(ok + '개 키워드 순위 업데이트 완료', 'success');
    else showToast('순위 조회 실패', 'error');
}

// ============================================
// 네이버 API (프록시)
// ============================================

function getProxyUrl() {
    var url = window.NAVER_PROXY_URL || PROXY_URL;
    if (!url || url.indexOf('your-name') !== -1) return null;
    return url;
}

async function proxyGraphQL(payload) {
    var proxyUrl = getProxyUrl();
    if (!proxyUrl) throw new Error('PROXY_NOT_SET');
    var r = await fetch(proxyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('API ' + r.status);
    return await r.json();
}

async function searchNaverPlace(keyword, maxResults) {
    var payload = [{
        "operationName": "getRestaurantList",
        "variables": { "restaurantListInput": { "query": keyword, "x": "126.9783882", "y": "37.5666103", "start": 1, "display": maxResults, "isNmap": false, "deviceType": "pc" } },
        "query": "query getRestaurantList($restaurantListInput: RestaurantListInput) { restaurants: restaurantList(input: $restaurantListInput) { items { id name category roadAddress phone totalReviewCount blogCafeReviewCount visitorReviewCount visitorReviewScore saveCount imageCount } total } }"
    }];
    var data = await proxyGraphQL(payload);
    return data[0] && data[0].data && data[0].data.restaurants ? data[0].data.restaurants : { items: [], total: 0 };
}

async function getPlaceKeywords(placeId) {
    var proxyUrl = getProxyUrl();
    if (!proxyUrl) return [];
    var targetUrl = 'https://m.place.naver.com/restaurant/' + placeId;

    try {
        var response = await fetch(proxyUrl + '?url=' + encodeURIComponent(targetUrl), { method: 'GET' });
        if (!response.ok) return [];
        var html = await response.text();

        var match = html.match(/"keywordList"\s*:\s*(\[[^\]]*\])/);
        if (match && match[1]) {
            try {
                var keywords = JSON.parse(match[1]);
                if (Array.isArray(keywords)) return keywords.slice(0, 5);
            } catch (e) {
                var kwMatch = match[1].match(/"([^"]+)"/g);
                if (kwMatch) return kwMatch.map(function(k) { return k.replace(/"/g, ''); }).slice(0, 5);
            }
        }
        return [];
    } catch (e) {
        return [];
    }
}

// ============================================
// 경쟁사 분석
// ============================================

async function runCompetitorAnalysis() {
    var ki = document.getElementById('analysisKeyword');
    var keyword = ki ? ki.value.trim() : '';
    var topN = parseInt(document.getElementById('analysisTopN').value || '10');

    if (!keyword) {
        showToast('검색 키워드를 입력해주세요.', 'error');
        if (ki) ki.focus();
        return;
    }

    var btn = document.getElementById('runAnalysisBtn');
    btn.disabled = true;
    btn.textContent = '분석 중...';
    showAnalysisProgress(true, '"' + keyword + '" 검색 중...', 5);

    try {
        showAnalysisProgress(true, '네이버 플레이스 검색 중...', 10);
        var result = await searchNaverPlace(keyword, topN);

        if (!result.items || !result.items.length) {
            showToast('검색 결과가 없습니다.', 'error');
            showAnalysisProgress(false);
            btn.disabled = false;
            btn.textContent = '분석 시작';
            return;
        }

        var total = result.items.length;
        showAnalysisProgress(true, total + '개 업체 발견, 대표키워드 수집 중...', 15);

        var competitors = [];
        var allKw = {};

        for (var i = 0; i < result.items.length; i++) {
            var item = result.items[i];
            var pid = String(item.id);
            var nm = item.name || '';

            var pct = 15 + Math.round((i / total) * 70);
            showAnalysisProgress(true, '대표키워드 수집 (' + (i + 1) + '/' + total + ') ' + nm, pct);

            var keywords = await getPlaceKeywords(pid);

            keywords.forEach(function(k) {
                if (!allKw[k]) allKw[k] = { keyword: k, count: 0 };
                allKw[k].count++;
            });

            competitors.push({
                rank: i + 1,
                place_id: pid,
                name: nm,
                category: item.category || '',
                blog_reviews: String(item.blogCafeReviewCount || 0),
                visitor_reviews: String(item.visitorReviewCount || 0),
                save_count: String(item.saveCount || 0),
                score: item.visitorReviewScore || 0,
                total_reviews: item.totalReviewCount || 0,
                image_count: item.imageCount || 0,
                keywords: keywords
            });

            if (i < result.items.length - 1) await delay(500);
        }

        showAnalysisProgress(true, '저장 중...', 92);

        var kv = loadSavedKeywordVolumes(Object.keys(allKw));

        var ar = {
            keyword: keyword,
            analyzed_at: new Date().toISOString(),
            total_results: result.total,
            competitors: competitors,
            keyword_volumes: kv,
            all_keywords: allKw
        };

        var sk = keyword + '_' + topN;
        if (!marketingData.competitor_analysis) marketingData.competitor_analysis = {};
        marketingData.competitor_analysis[sk] = ar;

        try { localStorage.setItem('marketing_competitor_' + sk, JSON.stringify(ar)); } catch (e) {}

        showAnalysisProgress(true, '완료!', 100);
        await delay(500);
        showAnalysisProgress(false);

        renderAnalysisResult(ar);
        renderSavedAnalysis();

        var kwCount = Object.keys(allKw).length;
        showToast(competitors.length + '개 업체, ' + kwCount + '개 대표키워드 분석 완료', 'success');

    } catch (error) {
        showAnalysisProgress(false);
        if (error.message === 'PROXY_NOT_SET') showProxySetupGuide();
        else showToast('분석 오류: ' + error.message, 'error');
    }

    btn.disabled = false;
    btn.textContent = '분석 시작';
}

function loadSavedKeywordVolumes(kws) {
    var v = {};
    Object.values(marketingData.competitor_analysis || {}).forEach(function(a) {
        var s = a.keyword_volumes || {};
        Object.keys(s).forEach(function(k) {
            if (kws.indexOf(k) !== -1 && !v[k]) v[k] = s[k];
        });
    });
    return v;
}

function showProxySetupGuide() {
    var modal = document.getElementById('detailModal');
    var title = document.getElementById('modalTitle');
    var body = document.getElementById('modalBody');
    if (!modal || !title || !body) return;

    title.textContent = '프록시 설정 필요';
    body.innerHTML =
        '<div style="color:#ccc;line-height:1.8;">' +
            '<p>프록시 URL 설정이 필요합니다.</p>' +
            '<div style="margin-top:16px;">' +
                '<p style="font-weight:700;color:#00d4ff;margin-bottom:8px;">프록시 URL</p>' +
                '<div style="display:flex;gap:8px;">' +
                    '<input type="text" id="proxyUrlInput" class="form-input" placeholder="https://xxx.workers.dev" value="' + (localStorage.getItem('marketing_proxy_url') || '') + '" style="flex:1;">' +
                    '<button class="btn btn-primary" onclick="saveProxyUrl()">저장</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    modal.classList.add('show');
}

function saveProxyUrl() {
    var input = document.getElementById('proxyUrlInput');
    if (!input) return;

    var url = input.value.trim();
    if (!url || url.indexOf('http') !== 0) {
        showToast('올바른 URL을 입력해주세요.', 'error');
        return;
    }
    if (url.endsWith('/')) url = url.slice(0, -1);

    localStorage.setItem('marketing_proxy_url', url);
    window.NAVER_PROXY_URL = url;

    closeModal();
    showToast('프록시 URL 저장 완료', 'success');
}

function showAnalysisProgress(show, text, pct) {
    var c = document.getElementById('analysisProgress');
    if (!show) {
        if (c) c.remove();
        return;
    }
    if (!c) {
        c = document.createElement('div');
        c.id = 'analysisProgress';
        c.className = 'analysis-progress';
        var r = document.getElementById('analysisResult');
        if (r && r.parentNode) r.parentNode.insertBefore(c, r);
    }
    c.innerHTML =
        '<div class="progress-text">' + (text || '') + '</div>' +
        '<div class="progress-bar-container"><div class="progress-bar" style="width:' + (pct || 0) + '%"></div></div>';
}

// ============================================
// 분석 결과 렌더링
// ============================================

function renderAnalysisResult(result) {
    var c = document.getElementById('analysisResult');
    if (!c) return;

    c.style.display = 'block';
    document.getElementById('competitorCount').textContent = result.competitors ? result.competitors.length : 0;

    var cl = document.getElementById('competitorsList');
    if (cl && result.competitors) {
        cl.innerHTML = result.competitors.map(function(comp, idx) {
            var rc = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
            var kb = (comp.keywords && comp.keywords.length > 0)
                ? ' <span style="font-size:0.78rem;color:#b794f6;background:rgba(123,44,191,0.1);padding:2px 6px;border-radius:6px;">' + comp.keywords.join(', ') + '</span>'
                : '';

            return '<div class="competitor-item" data-place-id="' + comp.place_id + '">' +
                '<div class="competitor-rank ' + rc + '">' + comp.rank + '</div>' +
                '<div class="competitor-info">' +
                    '<div class="competitor-name">' + escapeHtml(comp.name) + kb + '</div>' +
                    '<div class="competitor-category">' + escapeHtml(comp.category || '') + '</div>' +
                '</div>' +
                '<div class="competitor-stats">' +
                    '<span>블로그 ' + (formatNumber(comp.blog_reviews || 0) || '-') + '</span>' +
                    '<span>방문자 ' + (formatNumber(comp.visitor_reviews || 0) || '-') + '</span>' +
                    '<span>저장 ' + (formatNumber(comp.save_count || 0) || '-') + '</span>' +
                    '<span>평점 ' + (comp.score || '-') + '</span>' +
                '</div>' +
            '</div>';
        }).join('');

        cl.querySelectorAll('.competitor-item').forEach(function(item) {
            item.addEventListener('click', function() {
                var pid = item.dataset.placeId;
                var comp = result.competitors.find(function(x) { return x.place_id === pid; });
                if (comp) showCompetitorDetail(comp, result.keyword_volumes);
            });
        });
    }

    renderKeywordsAnalysis(result);
}

function renderKeywordsAnalysis(result) {
    var kc = result.all_keywords || {};
    var kv = result.keyword_volumes || {};
    var kl = Object.values(kc).sort(function(a, b) { return b.count - a.count; });

    document.getElementById('totalRepKeywords').textContent = kl.length;

    var tv = 0, vc = 0;
    kl.forEach(function(k) {
        var v = kv[k.keyword];
        if (v && v.total) { tv += v.total; vc++; }
    });
    document.getElementById('avgSearchVolume').textContent = vc > 0 ? (formatNumber(Math.round(tv / vc)) || '-') : '-';

    var tb = document.getElementById('keywordsTableBody');
    if (!tb) return;

    if (!kl.length) {
        tb.innerHTML = '<tr><td colspan="4" class="text-center" style="color:#666;padding:24px;">대표 키워드를 찾지 못했습니다.</td></tr>';
        return;
    }

    tb.innerHTML = kl.map(function(i) {
        var v = kv[i.keyword];
        var cc = (v && v.comp === '높음') ? 'comp-high' : (v && v.comp === '중간') ? 'comp-medium' : (v && v.comp === '낮음') ? 'comp-low' : '';
        return '<tr>' +
            '<td>' + escapeHtml(i.keyword) + '</td>' +
            '<td class="text-right">' + (v && v.total ? (formatNumber(v.total) || '-') : '-') + '</td>' +
            '<td class="text-center"><span class="comp-badge ' + cc + '">' + (v && v.comp ? v.comp : '-') + '</span></td>' +
            '<td class="text-right">' + i.count + '개</td>' +
        '</tr>';
    }).join('');
}

function showCompetitorDetail(comp, volumes) {
    var modal = document.getElementById('detailModal');
    var title = document.getElementById('modalTitle');
    var body = document.getElementById('modalBody');
    if (!modal || !title || !body) return;

    title.textContent = comp.name;

    var kwH = (comp.keywords || []).map(function(k) {
        var v = volumes ? volumes[k] : null;
        return '<div class="keyword-item">' +
            '<span class="keyword-name">' + escapeHtml(k) + '</span>' +
            (v ? '<span class="keyword-volume">' + (formatNumber(v.total) || '-') + '</span>' : '') +
        '</div>';
    }).join('');

    body.innerHTML =
        '<div class="detail-grid">' +
            '<div class="detail-item"><div class="detail-label">순위</div><div class="detail-value">' + comp.rank + '위</div></div>' +
            '<div class="detail-item"><div class="detail-label">카테고리</div><div class="detail-value">' + escapeHtml(comp.category || '-') + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">평점</div><div class="detail-value">' + (comp.score || '-') + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">블로그</div><div class="detail-value">' + (formatNumber(comp.blog_reviews || 0) || '-') + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">방문자</div><div class="detail-value">' + (formatNumber(comp.visitor_reviews || 0) || '-') + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">저장수</div><div class="detail-value">' + (formatNumber(comp.save_count || 0) || '-') + '</div></div>' +
        '</div>' +
        '<div class="detail-keywords-section" style="margin-top:16px;">' +
            '<h4>대표 키워드 (' + (comp.keywords ? comp.keywords.length : 0) + '개)</h4>' +
            '<div class="keywords-grid">' + (kwH || '<p class="no-data" style="margin:0;font-size:0.85rem;">없음</p>') + '</div>' +
        '</div>';

    modal.classList.add('show');
}

function renderSavedAnalysis() {
    var c = document.getElementById('savedAnalysisList');
    if (!c) return;

    var a = Object.entries(marketingData.competitor_analysis || {});

    for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('marketing_competitor_') === 0) {
            var sk = k.replace('marketing_competitor_', '');
            if (!marketingData.competitor_analysis || !marketingData.competitor_analysis[sk]) {
                try {
                    var d = JSON.parse(localStorage.getItem(k));
                    if (!marketingData.competitor_analysis) marketingData.competitor_analysis = {};
                    marketingData.competitor_analysis[sk] = d;
                    a.push([sk, d]);
                } catch (e) {}
            }
        }
    }

    if (!a.length) {
        c.innerHTML = '<div class="no-data">저장된 분석 결과가 없습니다.</div>';
        return;
    }

    a.sort(function(x, y) { return (y[1].analyzed_at || '').localeCompare(x[1].analyzed_at || ''); });

    c.innerHTML = a.map(function(e) {
        var key = e[0], d = e[1];
        var dt = d.analyzed_at ? formatDateTime(new Date(d.analyzed_at)) : '-';
        var cc = d.competitors ? d.competitors.length : 0;
        var kc = d.all_keywords ? Object.keys(d.all_keywords).length : 0;

        return '<div class="saved-item" data-key="' + key + '">' +
            '<div class="saved-item-info">' +
                '<div class="saved-item-keyword">' + escapeHtml(d.keyword || key) + '</div>' +
                '<div class="saved-item-date">' + dt + '</div>' +
            '</div>' +
            '<div class="saved-item-count">' + cc + '개 업체 / ' + kc + '개 키워드</div>' +
        '</div>';
    }).join('');

    c.querySelectorAll('.saved-item').forEach(function(item) {
        item.addEventListener('click', function() {
            var key = item.dataset.key;
            var d = marketingData.competitor_analysis[key];
            if (d) {
                document.getElementById('analysisKeyword').value = d.keyword || '';
                renderAnalysisResult(d);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });
}

// ============================================
// 키워드 설정
// ============================================

function renderKeywordSettings() {
    var c = document.getElementById('storeKeywordSettings');
    if (!c) return;

    var tk = configData ? configData.tracking_keywords || {} : {};

    c.innerHTML = STORE_LIST.map(function(store) {
        var kws = tk[store] || [];
        var tags = kws.map(function(k) {
            return '<span class="keyword-tag" data-store="' + store + '" data-keyword="' + escapeHtml(k) + '">' +
                escapeHtml(k) +
                '<button class="remove-btn" title="삭제">x</button>' +
            '</span>';
        }).join('');

        return '<div class="store-setting-item">' +
            '<div class="store-setting-header">' +
                '<span class="store-setting-name">' + store + '</span>' +
                '<button class="add-keyword-btn" data-store="' + store + '">+ 추가</button>' +
            '</div>' +
            '<div class="keyword-tags" data-store="' + store + '">' + (tags || '<span class="no-keywords">등록된 키워드 없음</span>') + '</div>' +
            '<div class="keyword-input-wrapper" data-store="' + store + '" style="display:none;">' +
                '<input type="text" class="keyword-input" placeholder="키워드 입력 후 Enter">' +
                '<button class="btn btn-secondary confirm-add-btn">추가</button>' +
                '<button class="btn btn-outline cancel-add-btn">취소</button>' +
            '</div>' +
        '</div>';
    }).join('');

    c.querySelectorAll('.add-keyword-btn').forEach(function(b) {
        b.addEventListener('click', function() {
            var w = c.querySelector('.keyword-input-wrapper[data-store="' + b.dataset.store + '"]');
            if (w) { w.style.display = 'flex'; w.querySelector('.keyword-input').focus(); }
        });
    });

    c.querySelectorAll('.cancel-add-btn').forEach(function(b) {
        b.addEventListener('click', function() {
            var w = b.closest('.keyword-input-wrapper');
            if (w) { w.style.display = 'none'; w.querySelector('.keyword-input').value = ''; }
        });
    });

    c.querySelectorAll('.confirm-add-btn').forEach(function(b) {
        b.addEventListener('click', function() {
            var w = b.closest('.keyword-input-wrapper');
            var s = w ? w.dataset.store : null;
            var inp = w ? w.querySelector('.keyword-input') : null;
            if (s && inp && inp.value.trim()) {
                addKeywordToStore(s, inp.value.trim());
                inp.value = '';
                w.style.display = 'none';
            }
        });
    });

    c.querySelectorAll('.keyword-input').forEach(function(inp) {
        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                var w = inp.closest('.keyword-input-wrapper');
                var s = w ? w.dataset.store : null;
                if (s && inp.value.trim()) {
                    addKeywordToStore(s, inp.value.trim());
                    inp.value = '';
                    w.style.display = 'none';
                }
            } else if (e.key === 'Escape') {
                var w2 = inp.closest('.keyword-input-wrapper');
                if (w2) { w2.style.display = 'none'; inp.value = ''; }
            }
        });
    });

    c.querySelectorAll('.keyword-tag .remove-btn').forEach(function(b) {
        b.addEventListener('click', function(e) {
            e.stopPropagation();
            var t = b.closest('.keyword-tag');
            if (t) removeKeywordFromStore(t.dataset.store, t.dataset.keyword);
        });
    });
}

function addKeywordToStore(s, k) {
    if (!configData.tracking_keywords) configData.tracking_keywords = {};
    if (!configData.tracking_keywords[s]) configData.tracking_keywords[s] = [];

    if (configData.tracking_keywords[s].indexOf(k) === -1) {
        configData.tracking_keywords[s].push(k);
        saveConfigToLocalStorage();
        renderKeywordSettings();
        showToast('"' + k + '" 추가됨', 'success');
    } else {
        showToast('이미 등록된 키워드', 'error');
    }
}

function removeKeywordFromStore(s, k) {
    if (configData.tracking_keywords && configData.tracking_keywords[s]) {
        configData.tracking_keywords[s] = configData.tracking_keywords[s].filter(function(x) { return x !== k; });
        saveConfigToLocalStorage();
        renderKeywordSettings();
        showToast('"' + k + '" 삭제됨', 'success');
    }
}

function saveConfigToLocalStorage() {
    try { localStorage.setItem('marketing_config', JSON.stringify(configData)); } catch (e) {}
}

function saveKeywordSettings() {
    saveConfigToLocalStorage();
    showToast('키워드 설정 저장 완료', 'success');
}

// ============================================
// 토스트
// ============================================

function showToast(msg, type) {
    var ex = document.querySelector('.toast');
    if (ex) ex.remove();

    var t = document.createElement('div');
    t.className = 'toast' + (type ? ' toast-' + type : '');
    t.textContent = msg;
    document.body.appendChild(t);

    requestAnimationFrame(function() { t.classList.add('show'); });

    setTimeout(function() {
        t.classList.remove('show');
        setTimeout(function() { t.remove(); }, 300);
    }, 3000);
}

// ============================================
// 유틸리티
// ============================================

function formatNumber(n) {
    if (n === null || n === undefined || n === '') return null;
    var v = (typeof n === 'string') ? parseInt(n.replace(/,/g, '')) : n;
    if (isNaN(v)) return null;
    return new Intl.NumberFormat('ko-KR').format(v);
}

function formatDateTime(d) {
    return d.toLocaleString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function escapeHtml(t) {
    if (!t) return '';
    var d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

function delay(ms) {
    return new Promise(function(r) { setTimeout(r, ms); });
}
