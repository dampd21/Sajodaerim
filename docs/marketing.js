/**
 * 마케팅 관리 대시보드
 * - 순위 추적
 * - 경쟁사 분석 (Cloudflare Workers 프록시 경유)
 * - 키워드 설정 (localStorage 저장)
 */

let marketingData = null;
let configData = null;
let rankChart = null;

const STORE_LIST = [
    "역대짬뽕 본점",
    "역대짬뽕 병점점",
    "역대짬뽕 송파점",
    "역대짬뽕 다산1호점",
    "역대짬뽕 화성반월점",
    "역대짬뽕 오산시청점",
    "역대짬뽕 두정점",
    "역대짬뽕 송탄점",
    "역대짬뽕 여수국동점"
];

const PROXY_URL = "https://naver-place-proxy.dampd21.workers.dev";

// ============================================
// 초기화
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    loadProxyUrl();
    await loadData();
    initEventListeners();
    initFilters();
    renderDashboard();
});

function loadProxyUrl() {
    var saved = localStorage.getItem('marketing_proxy_url');
    if (saved) {
        window.NAVER_PROXY_URL = saved;
    } else {
        window.NAVER_PROXY_URL = PROXY_URL;
    }
}

function recreateCanvas(containerId, canvasId) {
    var container = document.getElementById(containerId);
    if (!container) return null;
    var oldCanvas = document.getElementById(canvasId);
    if (oldCanvas) oldCanvas.remove();
    var newCanvas = document.createElement('canvas');
    newCanvas.id = canvasId;
    container.appendChild(newCanvas);
    return newCanvas.getContext('2d');
}

// ============================================
// 데이터 로드
// ============================================

async function loadData() {
    try {
        var dataResponse = await fetch('marketing_data.json?t=' + Date.now());
        if (dataResponse.ok) {
            marketingData = await dataResponse.json();
            if (marketingData.generated_at) {
                var date = new Date(marketingData.generated_at);
                document.getElementById('updateTime').textContent =
                    'Last update: ' + formatDateTime(date);
            }
        }
    } catch (error) {
        console.log('Marketing data not found');
    }

    if (!marketingData) {
        marketingData = { tracking_history: {}, competitor_analysis: {} };
    }

    var localConfig = localStorage.getItem('marketing_config');
    if (localConfig) {
        try { configData = JSON.parse(localConfig); } catch (e) { configData = null; }
    }

    if (!configData) {
        try {
            var configResponse = await fetch('marketing_config.json?t=' + Date.now());
            if (configResponse.ok) configData = await configResponse.json();
        } catch (error) { /* ignore */ }
    }

    if (!configData) configData = { tracking_keywords: {} };
}

// ============================================
// 이벤트 리스너
// ============================================

function initEventListeners() {
    document.querySelectorAll('.tabs .tab').forEach(function(tab) {
        tab.addEventListener('click', function() { switchTab(tab.dataset.tab); });
    });

    var storeSelect = document.getElementById('storeSelect');
    if (storeSelect) storeSelect.addEventListener('change', function() { updateKeywordFilter(); filterAndRender(); });

    var keywordSelect = document.getElementById('keywordSelect');
    if (keywordSelect) keywordSelect.addEventListener('change', filterAndRender);

    var periodSelect = document.getElementById('periodSelect');
    if (periodSelect) periodSelect.addEventListener('change', filterAndRender);

    document.querySelectorAll('.view-btn').forEach(function(btn) {
        btn.addEventListener('click', function() { switchView(btn.dataset.view); });
    });

    var runBtn = document.getElementById('runAnalysisBtn');
    if (runBtn) runBtn.addEventListener('click', runCompetitorAnalysis);

    var analysisInput = document.getElementById('analysisKeyword');
    if (analysisInput) analysisInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') runCompetitorAnalysis(); });

    var saveBtn = document.getElementById('saveSettingsBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveKeywordSettings);

    var modalClose = document.querySelector('#detailModal .modal-close');
    if (modalClose) modalClose.addEventListener('click', closeModal);

    var modal = document.getElementById('detailModal');
    if (modal) modal.addEventListener('click', function(e) { if (e.target.id === 'detailModal') closeModal(); });

    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });
}

function switchTab(tabId) {
    document.querySelectorAll('.tabs .tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === tabId); });
    document.querySelectorAll('.tab-pane').forEach(function(pane) { pane.classList.toggle('active', pane.id === tabId); });
    if (tabId === 'keywordSettings') renderKeywordSettings();
    else if (tabId === 'competitorAnalysis') renderSavedAnalysis();
}

function switchView(view) {
    document.querySelectorAll('.view-btn').forEach(function(btn) { btn.classList.toggle('active', btn.dataset.view === view); });
    var cardView = document.getElementById('historyCardView');
    var tableView = document.getElementById('historyTableView');
    if (cardView) cardView.style.display = view === 'card' ? 'grid' : 'none';
    if (tableView) tableView.style.display = view === 'table' ? 'block' : 'none';
}

function closeModal() {
    var modal = document.getElementById('detailModal');
    if (modal) modal.classList.remove('show');
}

// ============================================
// 필터
// ============================================

function initFilters() {
    var storeSelect = document.getElementById('storeSelect');
    if (storeSelect) {
        storeSelect.innerHTML = '<option value="">전체 지점</option>';
        STORE_LIST.forEach(function(store) { storeSelect.innerHTML += '<option value="' + store + '">' + store + '</option>'; });
    }
    updateKeywordFilter();
}

function updateKeywordFilter() {
    var keywordSelect = document.getElementById('keywordSelect');
    var storeEl = document.getElementById('storeSelect');
    var storeFilter = storeEl ? storeEl.value : '';
    if (!keywordSelect || !marketingData) return;

    var keywords = new Set();
    Object.keys(marketingData.tracking_history || {}).forEach(function(key) {
        var parts = key.split('|');
        if (!storeFilter || parts[0] === storeFilter) keywords.add(parts[1]);
    });

    keywordSelect.innerHTML = '<option value="">전체 키워드</option>';
    Array.from(keywords).sort().forEach(function(kw) { keywordSelect.innerHTML += '<option value="' + kw + '">' + kw + '</option>'; });
}

// ============================================
// 대시보드 렌더링
// ============================================

function renderDashboard() { if (marketingData) filterAndRender(); }

function filterAndRender() {
    var storeFilter = (document.getElementById('storeSelect') || {}).value || '';
    var keywordFilter = (document.getElementById('keywordSelect') || {}).value || '';
    var periodDays = parseInt((document.getElementById('periodSelect') || {}).value || '30');

    var filteredData = [];
    Object.entries(marketingData.tracking_history || {}).forEach(function(entry) {
        var key = entry[0], data = entry[1];
        var parts = key.split('|');
        if (storeFilter && parts[0] !== storeFilter) return;
        if (keywordFilter && parts[1] !== keywordFilter) return;
        var history = (data.history || []).slice(0, periodDays);
        if (history.length > 0) filteredData.push({ key: key, store_name: parts[0], keyword: parts[1], place_id: data.place_id, history: history });
    });

    renderSummaryCards(filteredData);
    renderRankChart(filteredData);
    renderHistoryCards(filteredData);
    renderHistoryTable(filteredData);
}

function renderSummaryCards(data) {
    document.getElementById('totalKeywords').textContent = data.length;
    if (data.length === 0) {
        document.getElementById('avgRank').textContent = '-';
        document.getElementById('rankUp').textContent = '-';
        document.getElementById('rankDown').textContent = '-';
        return;
    }
    var totalRank = 0, rankCount = 0, rankUp = 0, rankDown = 0;
    data.forEach(function(item) {
        var latest = item.history[0], previous = item.history[1];
        if (latest && latest.rank) {
            totalRank += latest.rank; rankCount++;
            if (previous && previous.rank) {
                if (latest.rank < previous.rank) rankUp++;
                else if (latest.rank > previous.rank) rankDown++;
            }
        }
    });
    document.getElementById('avgRank').textContent = rankCount > 0 ? (totalRank / rankCount).toFixed(1) + '위' : '-';
    document.getElementById('rankUp').textContent = rankUp;
    document.getElementById('rankDown').textContent = rankDown;
}

function renderRankChart(data) {
    if (rankChart) { rankChart.destroy(); rankChart = null; }
    var ctx = recreateCanvas('rankChartContainer', 'rankChart');
    if (!ctx || data.length === 0) return;

    var dateSet = new Set();
    data.forEach(function(item) { item.history.forEach(function(h) { dateSet.add(h.date); }); });
    var dates = Array.from(dateSet).sort().reverse().slice(0, 30).reverse();
    var colors = ['#00d4ff', '#7b2cbf', '#4ecdc4', '#ff6b6b', '#ffe66d', '#51cf66', '#f59f00', '#e64980'];

    var datasets = data.slice(0, 8).map(function(item, idx) {
        return {
            label: item.store_name.replace('역대짬뽕 ', '') + ' | ' + item.keyword,
            data: dates.map(function(date) { var f = item.history.find(function(h) { return h.date === date; }); return f && f.rank ? f.rank : null; }),
            borderColor: colors[idx % colors.length], backgroundColor: colors[idx % colors.length] + '20',
            tension: 0, fill: false, spanGaps: true, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2
        };
    });

    rankChart = new Chart(ctx, {
        type: 'line',
        data: { labels: dates.map(function(d) { var dt = new Date(d); return (dt.getMonth()+1) + '.' + dt.getDate(); }), datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', labels: { color: '#e0e0e0', font: { size: 11 }, boxWidth: 12, padding: 12 } },
                tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + (ctx.raw ? ctx.raw + '위' : '-'); } } },
                zoom: { pan: { enabled: true, mode: 'x' }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' } }
            },
            scales: {
                x: { ticks: { color: '#888' }, grid: { display: false } },
                y: { reverse: true, min: 1, ticks: { color: '#888', callback: function(v) { return v + '위'; } }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
}

function renderHistoryCards(data) {
    var container = document.getElementById('historyCardView');
    if (!container) return;
    if (data.length === 0) { container.innerHTML = '<div class="no-data">추적 중인 키워드가 없습니다.</div>'; return; }

    container.innerHTML = data.map(function(item) {
        var latest = item.history[0], previous = item.history[1];
        var changeHtml = '';
        if (latest && latest.rank && previous && previous.rank) {
            var diff = previous.rank - latest.rank;
            if (diff > 0) changeHtml = '<span class="rank-change up">+' + diff + '</span>';
            else if (diff < 0) changeHtml = '<span class="rank-change down">' + diff + '</span>';
            else changeHtml = '<span class="rank-change same">-</span>';
        }
        var timelineHtml = item.history.slice(0, 14).map(function(h) {
            var dt = new Date(h.date); var wd = ['일','월','화','수','목','금','토'][dt.getDay()];
            return '<div class="timeline-item"><div class="timeline-date">' + (dt.getMonth()+1) + '.' + String(dt.getDate()).padStart(2,'0') + ' <span class="weekday">' + wd + '</span></div>' +
                '<div class="timeline-rank">' + (h.rank ? h.rank + '위' : '-') + '</div>' +
                '<div class="timeline-stats"><span><span class="stat-label">블</span> ' + (h.blog_reviews || '-') + '</span><span><span class="stat-label">방</span> ' + (formatNumber(h.visitor_reviews) || '-') + '</span><span><span class="stat-label">저</span> ' + (h.save_count || '-') + '</span></div></div>';
        }).join('');
        return '<div class="history-card"><div class="history-card-header"><div class="history-card-store">' + item.store_name + '</div><div class="history-card-keyword">' + item.keyword + '</div></div>' +
            '<div class="history-card-rank"><span class="rank-number">' + (latest && latest.rank ? latest.rank : '-') + '</span>' + changeHtml + '<div class="rank-label">현재 순위</div></div>' +
            '<div class="history-timeline">' + timelineHtml + '</div></div>';
    }).join('');
}

function renderHistoryTable(data) {
    var tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    var rows = [];
    data.forEach(function(item) {
        item.history.slice(0, 7).forEach(function(h) {
            rows.push({ date: h.date, weekday: h.weekday, store: item.store_name, keyword: item.keyword, rank: h.rank, blog: h.blog_reviews, visitor: h.visitor_reviews, save: h.save_count, score: h.score });
        });
    });
    rows.sort(function(a, b) { return b.date.localeCompare(a.date); });
    if (rows.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="text-center">데이터가 없습니다.</td></tr>'; return; }
    tbody.innerHTML = rows.slice(0, 100).map(function(r) {
        return '<tr><td>' + r.date + ' ' + (r.weekday || '') + '</td><td>' + r.store + '</td><td>' + r.keyword + '</td><td class="text-center">' + (r.rank ? r.rank + '위' : '-') + '</td><td class="text-right">' + (r.blog || '-') + '</td><td class="text-right">' + (formatNumber(r.visitor) || '-') + '</td><td class="text-right">' + (r.save || '-') + '</td><td class="text-center">' + (r.score || '-') + '</td></tr>';
    }).join('');
}

// ============================================
// 네이버 플레이스 API (프록시)
// ============================================

function getProxyUrl() {
    var url = window.NAVER_PROXY_URL || PROXY_URL;
    if (!url || url.indexOf('your-name') !== -1) return null;
    return url;
}

async function proxyGraphQL(payload) {
    var proxyUrl = getProxyUrl();
    if (!proxyUrl) throw new Error('PROXY_NOT_SET');
    var response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('API ' + response.status);
    return await response.json();
}

async function searchNaverPlace(keyword, maxResults) {
    var payload = [{
        "operationName": "getRestaurantList",
        "variables": {
            "restaurantListInput": {
                "query": keyword, "x": "126.9783882", "y": "37.5666103",
                "start": 1, "display": maxResults, "isNmap": false, "deviceType": "pc"
            }
        },
        "query": "query getRestaurantList($restaurantListInput: RestaurantListInput) { restaurants: restaurantList(input: $restaurantListInput) { items { id name category roadAddress phone totalReviewCount blogCafeReviewCount visitorReviewCount visitorReviewScore saveCount } total } }"
    }];
    var data = await proxyGraphQL(payload);
    return data[0] && data[0].data && data[0].data.restaurants ? data[0].data.restaurants : { items: [], total: 0 };
}

async function getPlaceKeywords(placeId) {
    /**
     * getDetail 쿼리로 informationTab.keywordList 파싱
     * 실제 네이버 플레이스에서 사용하는 것과 동일한 쿼리
     */
    var payload = [{
        "operationName": "getDetail",
        "variables": {
            "id": placeId,
            "deviceType": "pc",
            "includeVisitorReviewPhotos": false,
            "includeClips": false
        },
        "query": "query getDetail($id: String!, $deviceType: String, $includeVisitorReviewPhotos: Boolean = false, $includeClips: Boolean = false) { business: placeDetail(input: {id: $id, isNx: false, deviceType: $deviceType}) { base { id name visitorReviewsTotal visitorReviewsScore microReviews } informationTab(providerSource: [pbp]) { keywordList } visitorReviewStats { analysis { themes { code label count } votedKeyword { totalCount details { displayName count } } } } } }"
    }];

    try {
        var data = await proxyGraphQL(payload);

        if (!data || !data[0] || !data[0].data || !data[0].data.business) {
            return { keywords: [], themes: [], votedKeywords: [] };
        }

        var business = data[0].data.business;
        var result = { keywords: [], themes: [], votedKeywords: [] };

        // 1. informationTab.keywordList (대표키워드 - 핵심!)
        if (business.informationTab && business.informationTab.keywordList) {
            result.keywords = business.informationTab.keywordList;
        }

        // 2. visitorReviewStats.analysis.themes (리뷰 테마)
        var stats = business.visitorReviewStats;
        if (stats && stats.analysis) {
            if (stats.analysis.themes) {
                result.themes = stats.analysis.themes.map(function(t) {
                    return { label: t.label, count: t.count };
                });
            }

            // 3. votedKeyword (투표 키워드)
            if (stats.analysis.votedKeyword && stats.analysis.votedKeyword.details) {
                result.votedKeywords = stats.analysis.votedKeyword.details.map(function(d) {
                    return { name: d.displayName, count: d.count };
                });
            }
        }

        return result;

    } catch (e) {
        console.log('getDetail failed for ' + placeId + ':', e.message);
        return { keywords: [], themes: [], votedKeywords: [] };
    }
}

// ============================================
// 경쟁사 분석
// ============================================

async function runCompetitorAnalysis() {
    var keywordInput = document.getElementById('analysisKeyword');
    var keyword = keywordInput ? keywordInput.value.trim() : '';
    var topN = parseInt(document.getElementById('analysisTopN').value || '10');

    if (!keyword) { showToast('검색 키워드를 입력해주세요.', 'error'); if (keywordInput) keywordInput.focus(); return; }

    var btn = document.getElementById('runAnalysisBtn');
    btn.disabled = true;
    btn.textContent = '분석 중...';
    showAnalysisProgress(true, '"' + keyword + '" 검색 중...', 5);

    try {
        // 1단계: 검색
        showAnalysisProgress(true, '네이버 플레이스 검색 중...', 10);
        var result = await searchNaverPlace(keyword, topN);

        if (!result.items || result.items.length === 0) {
            showToast('검색 결과가 없습니다.', 'error');
            showAnalysisProgress(false);
            btn.disabled = false; btn.textContent = '분석 시작';
            return;
        }

        var totalItems = result.items.length;
        showAnalysisProgress(true, totalItems + '개 업체 발견, 대표키워드 수집 중...', 15);

        // 2단계: 각 업체별 대표키워드 수집
        var competitors = [];
        var allKeywords = {};
        var allThemes = {};
        var allVotedKeywords = {};

        for (var i = 0; i < result.items.length; i++) {
            var item = result.items[i];
            var placeId = String(item.id);
            var name = item.name || '';

            var progress = 15 + Math.round((i / totalItems) * 70);
            showAnalysisProgress(true, '대표키워드 수집 (' + (i + 1) + '/' + totalItems + ') ' + name, progress);

            // 대표키워드 + 테마 + 투표키워드 조회
            var placeData = await getPlaceKeywords(placeId);

            // 대표키워드 카운트
            placeData.keywords.forEach(function(kw) {
                if (!allKeywords[kw]) allKeywords[kw] = { keyword: kw, count: 0 };
                allKeywords[kw].count++;
            });

            // 테마 카운트
            placeData.themes.forEach(function(t) {
                if (!allThemes[t.label]) allThemes[t.label] = { label: t.label, totalCount: 0, storeCount: 0 };
                allThemes[t.label].totalCount += t.count;
                allThemes[t.label].storeCount++;
            });

            // 투표키워드 카운트
            placeData.votedKeywords.forEach(function(v) {
                if (!allVotedKeywords[v.name]) allVotedKeywords[v.name] = { name: v.name, totalCount: 0, storeCount: 0 };
                allVotedKeywords[v.name].totalCount += v.count;
                allVotedKeywords[v.name].storeCount++;
            });

            competitors.push({
                rank: i + 1,
                place_id: placeId,
                name: name,
                category: item.category || '',
                blog_reviews: String(item.blogCafeReviewCount || 0),
                visitor_reviews: String(item.visitorReviewCount || 0),
                save_count: String(item.saveCount || 0),
                score: item.visitorReviewScore || 0,
                total_reviews: item.totalReviewCount || 0,
                keywords: placeData.keywords,
                themes: placeData.themes,
                votedKeywords: placeData.votedKeywords
            });

            // 요청 간 딜레이
            if (i < result.items.length - 1) await delay(600);
        }

        showAnalysisProgress(true, '결과 저장 중...', 92);

        // 검색량 데이터 (이전 저장분 활용)
        var keywordVolumes = loadSavedKeywordVolumes(Object.keys(allKeywords));

        var analysisResult = {
            keyword: keyword,
            analyzed_at: new Date().toISOString(),
            total_results: result.total,
            competitors: competitors,
            keyword_volumes: keywordVolumes,
            all_keywords: allKeywords,
            all_themes: allThemes,
            all_voted_keywords: allVotedKeywords
        };

        // 저장
        var savedKey = keyword + '_' + topN;
        if (!marketingData.competitor_analysis) marketingData.competitor_analysis = {};
        marketingData.competitor_analysis[savedKey] = analysisResult;
        try { localStorage.setItem('marketing_competitor_' + savedKey, JSON.stringify(analysisResult)); } catch (e) {}

        showAnalysisProgress(true, '완료!', 100);
        await delay(500);
        showAnalysisProgress(false);

        renderAnalysisResult(analysisResult);
        renderSavedAnalysis();

        var kwCount = Object.keys(allKeywords).length;
        showToast(competitors.length + '개 업체, ' + kwCount + '개 대표키워드 분석 완료', 'success');

    } catch (error) {
        console.error('Analysis failed:', error);
        showAnalysisProgress(false);
        if (error.message === 'PROXY_NOT_SET') showProxySetupGuide();
        else if (error.message.indexOf('Failed to fetch') !== -1) showToast('프록시 서버 연결 실패.', 'error');
        else showToast('분석 오류: ' + error.message, 'error');
    }

    btn.disabled = false;
    btn.textContent = '분석 시작';
}

function loadSavedKeywordVolumes(keywords) {
    var volumes = {};
    Object.values(marketingData.competitor_analysis || {}).forEach(function(analysis) {
        var saved = analysis.keyword_volumes || {};
        Object.keys(saved).forEach(function(kw) {
            if (keywords.indexOf(kw) !== -1 && !volumes[kw]) volumes[kw] = saved[kw];
        });
    });
    return volumes;
}

function showProxySetupGuide() {
    var modal = document.getElementById('detailModal');
    var title = document.getElementById('modalTitle');
    var body = document.getElementById('modalBody');
    if (!modal || !title || !body) return;
    title.textContent = '프록시 설정 필요';
    body.innerHTML =
        '<div style="color:#ccc; line-height:1.8;">' +
            '<p>경쟁사 분석을 위해 프록시 URL 설정이 필요합니다.</p>' +
            '<div style="margin-top:16px;"><p style="font-weight:600; color:#00d4ff; margin-bottom:8px;">프록시 URL:</p>' +
                '<div style="display:flex; gap:8px;"><input type="text" id="proxyUrlInput" class="form-input" placeholder="https://xxx.workers.dev" value="' + (localStorage.getItem('marketing_proxy_url') || '') + '" style="flex:1;"><button class="btn btn-primary" onclick="saveProxyUrl()">저장</button></div>' +
            '</div></div>';
    modal.classList.add('show');
}

function saveProxyUrl() {
    var input = document.getElementById('proxyUrlInput');
    if (!input) return;
    var url = input.value.trim();
    if (!url || url.indexOf('http') !== 0) { showToast('올바른 URL을 입력해주세요.', 'error'); return; }
    if (url.endsWith('/')) url = url.slice(0, -1);
    localStorage.setItem('marketing_proxy_url', url);
    window.NAVER_PROXY_URL = url;
    closeModal();
    showToast('프록시 URL 저장 완료', 'success');
}

function showAnalysisProgress(show, text, percent) {
    var container = document.getElementById('analysisProgress');
    if (!show) { if (container) container.remove(); return; }
    if (!container) {
        container = document.createElement('div');
        container.id = 'analysisProgress';
        container.className = 'analysis-progress';
        var resultEl = document.getElementById('analysisResult');
        if (resultEl && resultEl.parentNode) resultEl.parentNode.insertBefore(container, resultEl);
    }
    container.innerHTML = '<div class="progress-text">' + (text || '') + '</div><div class="progress-bar-container"><div class="progress-bar" style="width:' + (percent || 0) + '%"></div></div>';
}

// ============================================
// 분석 결과 렌더링
// ============================================

function renderAnalysisResult(result) {
    var container = document.getElementById('analysisResult');
    if (!container) return;
    container.style.display = 'block';

    document.getElementById('competitorCount').textContent = result.competitors ? result.competitors.length : 0;

    // 경쟁사 목록
    var competitorsList = document.getElementById('competitorsList');
    if (competitorsList && result.competitors) {
        competitorsList.innerHTML = result.competitors.map(function(comp, idx) {
            var rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
            var kwBadge = comp.keywords && comp.keywords.length > 0
                ? ' <span style="font-size:0.7rem;color:#7b2cbf;background:rgba(123,44,191,0.1);padding:2px 6px;border-radius:4px;">' + comp.keywords.length + '개 키워드</span>' : '';

            return '<div class="competitor-item" data-place-id="' + comp.place_id + '">' +
                '<div class="competitor-rank ' + rankClass + '">' + comp.rank + '</div>' +
                '<div class="competitor-info"><div class="competitor-name">' + escapeHtml(comp.name) + kwBadge + '</div><div class="competitor-category">' + escapeHtml(comp.category || '') + '</div></div>' +
                '<div class="competitor-stats"><span>블로그 ' + formatNumber(comp.blog_reviews || 0) + '</span><span>방문자 ' + formatNumber(comp.visitor_reviews || 0) + '</span><span>저장 ' + formatNumber(comp.save_count || 0) + '</span><span>평점 ' + (comp.score || '-') + '</span></div></div>';
        }).join('');

        competitorsList.querySelectorAll('.competitor-item').forEach(function(item) {
            item.addEventListener('click', function() {
                var placeId = item.dataset.placeId;
                var comp = result.competitors.find(function(c) { return c.place_id === placeId; });
                if (comp) showCompetitorDetail(comp, result.keyword_volumes);
            });
        });
    }

    renderKeywordsAnalysis(result);
}

function renderKeywordsAnalysis(result) {
    var keywordCounts = result.all_keywords || {};

    // competitors에서도 병합
    (result.competitors || []).forEach(function(comp) {
        (comp.keywords || []).forEach(function(kw) {
            if (!keywordCounts[kw]) keywordCounts[kw] = { keyword: kw, count: 0 };
            // 이미 카운트됨, 중복 방지
        });
    });

    var keywordVolumes = result.keyword_volumes || {};
    var keywordList = Object.values(keywordCounts).sort(function(a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return 0;
    });

    document.getElementById('totalRepKeywords').textContent = keywordList.length;

    // 평균 검색량
    var totalVol = 0, volCount = 0;
    keywordList.forEach(function(k) { var v = keywordVolumes[k.keyword]; if (v && v.total) { totalVol += v.total; volCount++; } });
    document.getElementById('avgSearchVolume').textContent = volCount > 0 ? formatNumber(Math.round(totalVol / volCount)) : '-';

    var tbody = document.getElementById('keywordsTableBody');
    if (!tbody) return;

    if (keywordList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="color:#666;padding:24px;">대표 키워드를 찾지 못했습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = keywordList.map(function(item) {
        var vol = keywordVolumes[item.keyword];
        var compClass = '';
        if (vol && vol.comp === '높음') compClass = 'comp-high';
        else if (vol && vol.comp === '중간') compClass = 'comp-medium';
        else if (vol && vol.comp === '낮음') compClass = 'comp-low';

        return '<tr><td>' + escapeHtml(item.keyword) + '</td>' +
            '<td class="text-right">' + (vol && vol.total ? formatNumber(vol.total) : '-') + '</td>' +
            '<td class="text-center"><span class="comp-badge ' + compClass + '">' + (vol && vol.comp ? vol.comp : '-') + '</span></td>' +
            '<td class="text-right">' + item.count + '개</td></tr>';
    }).join('');
}

function showCompetitorDetail(comp, volumes) {
    var modal = document.getElementById('detailModal');
    var title = document.getElementById('modalTitle');
    var body = document.getElementById('modalBody');
    if (!modal || !title || !body) return;

    title.textContent = comp.name;

    // 대표키워드
    var kwHtml = (comp.keywords || []).map(function(kw) {
        var vol = volumes ? volumes[kw] : null;
        return '<div class="keyword-item"><span class="keyword-name">' + escapeHtml(kw) + '</span>' +
            (vol ? '<span class="keyword-volume">' + formatNumber(vol.total) + '</span>' : '') + '</div>';
    }).join('');

    // 리뷰 테마
    var themesHtml = (comp.themes || []).slice(0, 10).map(function(t) {
        return '<span style="display:inline-block;padding:4px 10px;background:rgba(78,205,196,0.1);border:1px solid rgba(78,205,196,0.2);border-radius:6px;font-size:0.8rem;color:#4ecdc4;margin:3px;">' +
            escapeHtml(t.label) + ' <span style="color:#888;font-size:0.7rem;">' + t.count + '</span></span>';
    }).join('');

    // 투표 키워드
    var votedHtml = (comp.votedKeywords || []).slice(0, 10).map(function(v) {
        return '<span style="display:inline-block;padding:4px 10px;background:rgba(255,230,109,0.1);border:1px solid rgba(255,230,109,0.2);border-radius:6px;font-size:0.8rem;color:#ffe66d;margin:3px;">' +
            escapeHtml(v.name) + ' <span style="color:#888;font-size:0.7rem;">' + v.count + '</span></span>';
    }).join('');

    body.innerHTML =
        '<div class="detail-grid">' +
            '<div class="detail-item"><div class="detail-label">순위</div><div class="detail-value">' + comp.rank + '위</div></div>' +
            '<div class="detail-item"><div class="detail-label">카테고리</div><div class="detail-value">' + escapeHtml(comp.category || '-') + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">평점</div><div class="detail-value">' + (comp.score || '-') + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">블로그 리뷰</div><div class="detail-value">' + formatNumber(comp.blog_reviews || 0) + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">방문자 리뷰</div><div class="detail-value">' + formatNumber(comp.visitor_reviews || 0) + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">저장수</div><div class="detail-value">' + formatNumber(comp.save_count || 0) + '</div></div>' +
        '</div>' +
        '<div class="detail-keywords-section" style="margin-top:16px;">' +
            '<h4>대표 키워드 (' + (comp.keywords ? comp.keywords.length : 0) + '개)</h4>' +
            '<div class="keywords-grid">' + (kwHtml || '<p class="no-data" style="margin:0;font-size:0.85rem;">없음</p>') + '</div>' +
        '</div>' +
        (themesHtml ? '<div style="margin-top:16px;"><h4 style="color:#ccc;font-size:0.9rem;margin-bottom:8px;">리뷰 테마</h4><div>' + themesHtml + '</div></div>' : '') +
        (votedHtml ? '<div style="margin-top:16px;"><h4 style="color:#ccc;font-size:0.9rem;margin-bottom:8px;">투표 키워드</h4><div>' + votedHtml + '</div></div>' : '');

    modal.classList.add('show');
}

function renderSavedAnalysis() {
    var container = document.getElementById('savedAnalysisList');
    if (!container) return;
    var analyses = Object.entries(marketingData.competitor_analysis || {});

    for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf('marketing_competitor_') === 0) {
            var savedKey = key.replace('marketing_competitor_', '');
            if (!marketingData.competitor_analysis || !marketingData.competitor_analysis[savedKey]) {
                try {
                    var d = JSON.parse(localStorage.getItem(key));
                    if (!marketingData.competitor_analysis) marketingData.competitor_analysis = {};
                    marketingData.competitor_analysis[savedKey] = d;
                    analyses.push([savedKey, d]);
                } catch (e) {}
            }
        }
    }

    if (analyses.length === 0) { container.innerHTML = '<div class="no-data">저장된 분석 결과가 없습니다.<br>키워드를 입력하고 분석을 시작해보세요.</div>'; return; }

    analyses.sort(function(a, b) { return (b[1].analyzed_at || '').localeCompare(a[1].analyzed_at || ''); });

    container.innerHTML = analyses.map(function(entry) {
        var key = entry[0], data = entry[1];
        var date = data.analyzed_at ? formatDateTime(new Date(data.analyzed_at)) : '-';
        var compCount = data.competitors ? data.competitors.length : 0;
        var kwCount = data.all_keywords ? Object.keys(data.all_keywords).length : 0;
        return '<div class="saved-item" data-key="' + key + '"><div class="saved-item-info"><div class="saved-item-keyword">' + escapeHtml(data.keyword || key) + '</div><div class="saved-item-date">' + date + '</div></div><div class="saved-item-count">' + compCount + '개 업체 / ' + kwCount + '개 키워드</div></div>';
    }).join('');

    container.querySelectorAll('.saved-item').forEach(function(item) {
        item.addEventListener('click', function() {
            var key = item.dataset.key;
            var data = marketingData.competitor_analysis[key];
            if (data) { document.getElementById('analysisKeyword').value = data.keyword || ''; renderAnalysisResult(data); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        });
    });
}

// ============================================
// 키워드 설정
// ============================================

function renderKeywordSettings() {
    var container = document.getElementById('storeKeywordSettings');
    if (!container) return;
    var trackingKeywords = configData ? configData.tracking_keywords || {} : {};

    container.innerHTML = STORE_LIST.map(function(store) {
        var keywords = trackingKeywords[store] || [];
        var tagsHtml = keywords.map(function(kw) {
            return '<span class="keyword-tag" data-store="' + store + '" data-keyword="' + escapeHtml(kw) + '">' + escapeHtml(kw) + '<button class="remove-btn" title="삭제">x</button></span>';
        }).join('');

        return '<div class="store-setting-item"><div class="store-setting-header"><span class="store-setting-name">' + store + '</span><button class="add-keyword-btn" data-store="' + store + '">+ 추가</button></div>' +
            '<div class="keyword-tags" data-store="' + store + '">' + (tagsHtml || '<span class="no-keywords">등록된 키워드 없음</span>') + '</div>' +
            '<div class="keyword-input-wrapper" data-store="' + store + '" style="display:none;"><input type="text" class="keyword-input" placeholder="키워드 입력 후 Enter"><button class="btn btn-secondary confirm-add-btn">추가</button><button class="btn btn-outline cancel-add-btn">취소</button></div></div>';
    }).join('');

    container.querySelectorAll('.add-keyword-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var w = container.querySelector('.keyword-input-wrapper[data-store="' + btn.dataset.store + '"]');
            if (w) { w.style.display = 'flex'; w.querySelector('.keyword-input').focus(); }
        });
    });
    container.querySelectorAll('.cancel-add-btn').forEach(function(btn) {
        btn.addEventListener('click', function() { var w = btn.closest('.keyword-input-wrapper'); if (w) { w.style.display = 'none'; w.querySelector('.keyword-input').value = ''; } });
    });
    container.querySelectorAll('.confirm-add-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var w = btn.closest('.keyword-input-wrapper'); var s = w ? w.dataset.store : null; var inp = w ? w.querySelector('.keyword-input') : null;
            if (s && inp && inp.value.trim()) { addKeywordToStore(s, inp.value.trim()); inp.value = ''; w.style.display = 'none'; }
        });
    });
    container.querySelectorAll('.keyword-input').forEach(function(input) {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { var w = input.closest('.keyword-input-wrapper'); var s = w ? w.dataset.store : null; if (s && input.value.trim()) { addKeywordToStore(s, input.value.trim()); input.value = ''; w.style.display = 'none'; } }
            else if (e.key === 'Escape') { var w2 = input.closest('.keyword-input-wrapper'); if (w2) { w2.style.display = 'none'; input.value = ''; } }
        });
    });
    container.querySelectorAll('.keyword-tag .remove-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) { e.stopPropagation(); var tag = btn.closest('.keyword-tag'); if (tag) removeKeywordFromStore(tag.dataset.store, tag.dataset.keyword); });
    });
}

function addKeywordToStore(store, keyword) {
    if (!configData.tracking_keywords) configData.tracking_keywords = {};
    if (!configData.tracking_keywords[store]) configData.tracking_keywords[store] = [];
    if (configData.tracking_keywords[store].indexOf(keyword) === -1) {
        configData.tracking_keywords[store].push(keyword);
        saveConfigToLocalStorage(); renderKeywordSettings();
        showToast('"' + keyword + '" 추가됨', 'success');
    } else { showToast('이미 등록된 키워드', 'error'); }
}

function removeKeywordFromStore(store, keyword) {
    if (configData.tracking_keywords && configData.tracking_keywords[store]) {
        configData.tracking_keywords[store] = configData.tracking_keywords[store].filter(function(k) { return k !== keyword; });
        saveConfigToLocalStorage(); renderKeywordSettings();
        showToast('"' + keyword + '" 삭제됨', 'success');
    }
}

function saveConfigToLocalStorage() { try { localStorage.setItem('marketing_config', JSON.stringify(configData)); } catch (e) {} }
function saveKeywordSettings() { saveConfigToLocalStorage(); showToast('키워드 설정 저장 완료', 'success'); }

// ============================================
// 토스트
// ============================================

function showToast(message, type) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' toast-' + type : '');
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(function() { toast.classList.add('show'); });
    setTimeout(function() { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 300); }, 3000);
}

// ============================================
// 유틸리티
// ============================================

function formatNumber(num) {
    if (num === null || num === undefined || num === '') return null;
    var n = typeof num === 'string' ? parseInt(num.replace(/,/g, '')) : num;
    if (isNaN(n)) return null;
    return new Intl.NumberFormat('ko-KR').format(n);
}

function formatDateTime(date) {
    return date.toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div'); div.textContent = text; return div.innerHTML;
}

function delay(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }
