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

// Cloudflare Workers 프록시 URL
const PROXY_URL = "https://naver-place-proxy.dampd21.workers.dev/";

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
            console.log('Marketing data loaded:', marketingData);

            if (marketingData.generated_at) {
                var date = new Date(marketingData.generated_at);
                document.getElementById('updateTime').textContent =
                    'Last update: ' + formatDateTime(date);
            }
        }
    } catch (error) {
        console.log('Marketing data not found, using empty data');
    }

    if (!marketingData) {
        marketingData = {
            tracking_history: {},
            competitor_analysis: {}
        };
    }

    var localConfig = localStorage.getItem('marketing_config');
    if (localConfig) {
        try {
            configData = JSON.parse(localConfig);
            console.log('Config loaded from localStorage');
        } catch (e) {
            configData = null;
        }
    }

    if (!configData) {
        try {
            var configResponse = await fetch('marketing_config.json?t=' + Date.now());
            if (configResponse.ok) {
                configData = await configResponse.json();
                console.log('Config loaded from server');
            }
        } catch (error) {
            console.log('Config not found');
        }
    }

    if (!configData) {
        configData = { tracking_keywords: {} };
    }
}

// ============================================
// 이벤트 리스너
// ============================================

function initEventListeners() {
    document.querySelectorAll('.tabs .tab').forEach(function(tab) {
        tab.addEventListener('click', function() { switchTab(tab.dataset.tab); });
    });

    var storeSelect = document.getElementById('storeSelect');
    if (storeSelect) {
        storeSelect.addEventListener('change', function() {
            updateKeywordFilter();
            filterAndRender();
        });
    }

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
    if (analysisInput) {
        analysisInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') runCompetitorAnalysis();
        });
    }

    var saveBtn = document.getElementById('saveSettingsBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveKeywordSettings);

    var modalClose = document.querySelector('#detailModal .modal-close');
    if (modalClose) modalClose.addEventListener('click', closeModal);

    var modal = document.getElementById('detailModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target.id === 'detailModal') closeModal();
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeModal();
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.tabs .tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.tab === tabId);
    });

    document.querySelectorAll('.tab-pane').forEach(function(pane) {
        pane.classList.toggle('active', pane.id === tabId);
    });

    if (tabId === 'keywordSettings') {
        renderKeywordSettings();
    } else if (tabId === 'competitorAnalysis') {
        renderSavedAnalysis();
    }
}

function switchView(view) {
    document.querySelectorAll('.view-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

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
// 필터 초기화
// ============================================

function initFilters() {
    var storeSelect = document.getElementById('storeSelect');

    if (storeSelect) {
        storeSelect.innerHTML = '<option value="">전체 지점</option>';
        STORE_LIST.forEach(function(store) {
            storeSelect.innerHTML += '<option value="' + store + '">' + store + '</option>';
        });
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
        var store = parts[0];
        var keyword = parts[1];
        if (!storeFilter || store === storeFilter) {
            keywords.add(keyword);
        }
    });

    keywordSelect.innerHTML = '<option value="">전체 키워드</option>';
    Array.from(keywords).sort().forEach(function(kw) {
        keywordSelect.innerHTML += '<option value="' + kw + '">' + kw + '</option>';
    });
}

// ============================================
// 대시보드 렌더링
// ============================================

function renderDashboard() {
    if (!marketingData) return;
    filterAndRender();
}

function filterAndRender() {
    var storeEl = document.getElementById('storeSelect');
    var keywordEl = document.getElementById('keywordSelect');
    var periodEl = document.getElementById('periodSelect');

    var storeFilter = storeEl ? storeEl.value : '';
    var keywordFilter = keywordEl ? keywordEl.value : '';
    var periodDays = parseInt(periodEl ? periodEl.value : '30');

    var filteredData = [];

    Object.entries(marketingData.tracking_history || {}).forEach(function(entry) {
        var key = entry[0];
        var data = entry[1];
        var parts = key.split('|');
        var store = parts[0];
        var keyword = parts[1];

        if (storeFilter && store !== storeFilter) return;
        if (keywordFilter && keyword !== keywordFilter) return;

        var history = (data.history || []).slice(0, periodDays);

        if (history.length > 0) {
            filteredData.push({
                key: key,
                store_name: store,
                keyword: keyword,
                place_id: data.place_id,
                history: history
            });
        }
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

    var totalRank = 0;
    var rankCount = 0;
    var rankUp = 0;
    var rankDown = 0;

    data.forEach(function(item) {
        var latest = item.history[0];
        var previous = item.history[1];

        if (latest && latest.rank) {
            totalRank += latest.rank;
            rankCount++;

            if (previous && previous.rank) {
                if (latest.rank < previous.rank) rankUp++;
                else if (latest.rank > previous.rank) rankDown++;
            }
        }
    });

    document.getElementById('avgRank').textContent =
        rankCount > 0 ? (totalRank / rankCount).toFixed(1) + '위' : '-';
    document.getElementById('rankUp').textContent = rankUp;
    document.getElementById('rankDown').textContent = rankDown;
}

function renderRankChart(data) {
    if (rankChart) {
        rankChart.destroy();
        rankChart = null;
    }

    var ctx = recreateCanvas('rankChartContainer', 'rankChart');
    if (!ctx || data.length === 0) return;

    var dateSet = new Set();
    data.forEach(function(item) {
        item.history.forEach(function(h) { dateSet.add(h.date); });
    });
    var dates = Array.from(dateSet).sort().reverse().slice(0, 30).reverse();

    var colors = ['#00d4ff', '#7b2cbf', '#4ecdc4', '#ff6b6b', '#ffe66d', '#51cf66', '#f59f00', '#e64980'];

    var datasets = data.slice(0, 8).map(function(item, idx) {
        return {
            label: item.store_name.replace('역대짬뽕 ', '') + ' | ' + item.keyword,
            data: dates.map(function(date) {
                var found = item.history.find(function(h) { return h.date === date; });
                return found && found.rank ? found.rank : null;
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
                var date = new Date(d);
                return (date.getMonth() + 1) + '.' + date.getDate();
            }),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#e0e0e0', font: { size: 11 }, boxWidth: 12, padding: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return ctx.dataset.label + ': ' + (ctx.raw ? ctx.raw + '위' : '-');
                        }
                    }
                },
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

function renderHistoryCards(data) {
    var container = document.getElementById('historyCardView');
    if (!container) return;

    if (data.length === 0) {
        container.innerHTML = '<div class="no-data">추적 중인 키워드가 없습니다.</div>';
        return;
    }

    container.innerHTML = data.map(function(item) {
        var latest = item.history[0];
        var previous = item.history[1];

        var changeHtml = '';
        if (latest && latest.rank && previous && previous.rank) {
            var diff = previous.rank - latest.rank;
            if (diff > 0) changeHtml = '<span class="rank-change up">+' + diff + '</span>';
            else if (diff < 0) changeHtml = '<span class="rank-change down">' + diff + '</span>';
            else changeHtml = '<span class="rank-change same">-</span>';
        }

        var timelineHtml = item.history.slice(0, 14).map(function(h) {
            var date = new Date(h.date);
            var weekdays = ['일', '월', '화', '수', '목', '금', '토'];
            var wd = weekdays[date.getDay()];

            return '<div class="timeline-item">' +
                '<div class="timeline-date">' +
                    (date.getMonth() + 1) + '.' + String(date.getDate()).padStart(2, '0') +
                    ' <span class="weekday">' + wd + '</span>' +
                '</div>' +
                '<div class="timeline-rank">' + (h.rank ? h.rank + '위' : '-') + '</div>' +
                '<div class="timeline-stats">' +
                    '<span><span class="stat-label">블</span> ' + (h.blog_reviews || '-') + '</span>' +
                    '<span><span class="stat-label">방</span> ' + (formatNumber(h.visitor_reviews) || '-') + '</span>' +
                    '<span><span class="stat-label">저</span> ' + (h.save_count || '-') + '</span>' +
                '</div>' +
            '</div>';
        }).join('');

        return '<div class="history-card" data-key="' + item.key + '">' +
            '<div class="history-card-header">' +
                '<div class="history-card-store">' + item.store_name + '</div>' +
                '<div class="history-card-keyword">' + item.keyword + '</div>' +
            '</div>' +
            '<div class="history-card-rank">' +
                '<span class="rank-number">' + (latest && latest.rank ? latest.rank : '-') + '</span>' +
                changeHtml +
                '<div class="rank-label">현재 순위</div>' +
            '</div>' +
            '<div class="history-timeline">' + timelineHtml + '</div>' +
        '</div>';
    }).join('');
}

function renderHistoryTable(data) {
    var tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    var rows = [];

    data.forEach(function(item) {
        item.history.slice(0, 7).forEach(function(h) {
            rows.push({
                date: h.date, weekday: h.weekday, store: item.store_name,
                keyword: item.keyword, rank: h.rank, blog: h.blog_reviews,
                visitor: h.visitor_reviews, save: h.save_count, score: h.score
            });
        });
    });

    rows.sort(function(a, b) { return b.date.localeCompare(a.date); });

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">데이터가 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.slice(0, 100).map(function(row) {
        return '<tr>' +
            '<td>' + row.date + ' ' + (row.weekday || '') + '</td>' +
            '<td>' + row.store + '</td>' +
            '<td>' + row.keyword + '</td>' +
            '<td class="text-center">' + (row.rank ? row.rank + '위' : '-') + '</td>' +
            '<td class="text-right">' + (row.blog || '-') + '</td>' +
            '<td class="text-right">' + (formatNumber(row.visitor) || '-') + '</td>' +
            '<td class="text-right">' + (row.save || '-') + '</td>' +
            '<td class="text-center">' + (row.score || '-') + '</td>' +
        '</tr>';
    }).join('');
}

// ============================================
// 네이버 플레이스 API (프록시 경유)
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

    if (!response.ok) {
        throw new Error('API ' + response.status);
    }

    return await response.json();
}

async function searchNaverPlace(keyword, maxResults) {
    var payload = [{
        "operationName": "getRestaurantList",
        "variables": {
            "restaurantListInput": {
                "query": keyword,
                "x": "126.9783882",
                "y": "37.5666103",
                "start": 1,
                "display": maxResults,
                "isNmap": false,
                "deviceType": "pc"
            }
        },
        "query": "query getRestaurantList($restaurantListInput: RestaurantListInput) { restaurants: restaurantList(input: $restaurantListInput) { items { id name category roadAddress phone totalReviewCount blogCafeReviewCount visitorReviewCount visitorReviewScore saveCount } total } }"
    }];

    var data = await proxyGraphQL(payload);
    return data[0] && data[0].data && data[0].data.restaurants
        ? data[0].data.restaurants
        : { items: [], total: 0 };
}

async function getPlaceKeywords(placeId) {
    /**
     * 업체 상세 정보에서 대표키워드 추출
     * 여러 쿼리를 시도하여 키워드를 가져옴
     */

    // 방법 1: 간단한 상세 쿼리
    try {
        var payload1 = [{
            "operationName": "getRestaurantDetail",
            "variables": {
                "input": {
                    "id": placeId,
                    "deviceType": "pc",
                    "isNmap": false
                }
            },
            "query": "query getRestaurantDetail($input: RestaurantDetailInput) { restaurant: restaurantDetail(input: $input) { id name keywords visitorReviewsTotal visitorReviewsScore saveCount microReview } }"
        }];

        var data1 = await proxyGraphQL(payload1);
        var restaurant1 = data1[0] && data1[0].data && data1[0].data.restaurant;
        if (restaurant1 && restaurant1.keywords && restaurant1.keywords.length > 0) {
            return restaurant1.keywords;
        }
    } catch (e) {
        console.log('Detail query 1 failed for ' + placeId + ':', e.message);
    }

    // 방법 2: placeDetail 쿼리
    try {
        var payload2 = [{
            "operationName": "getDetail",
            "variables": {
                "id": placeId,
                "deviceType": "pc"
            },
            "query": "query getDetail($id: String!, $deviceType: String) { business: placeDetail(input: {id: $id, deviceType: $deviceType}) { base { id name keywords } } }"
        }];

        var data2 = await proxyGraphQL(payload2);
        var base2 = data2[0] && data2[0].data && data2[0].data.business && data2[0].data.business.base;
        if (base2 && base2.keywords && base2.keywords.length > 0) {
            return base2.keywords;
        }
    } catch (e) {
        console.log('Detail query 2 failed for ' + placeId + ':', e.message);
    }

    // 방법 3: visitorReview에서 votedKeyword 추출 (대표키워드와 비슷)
    try {
        var payload3 = [{
            "operationName": "getVisitorReviewStats",
            "variables": {
                "businessType": "restaurant",
                "id": placeId
            },
            "query": "query getVisitorReviewStats($id: String, $businessType: String = \"restaurant\") { visitorReviewStats(input: {businessId: $id, businessType: $businessType}) { analysis { votedKeyword { details { displayName count } } themes { label count } } } }"
        }];

        var data3 = await proxyGraphQL(payload3);
        var stats3 = data3[0] && data3[0].data && data3[0].data.visitorReviewStats;
        if (stats3 && stats3.analysis) {
            var keywords = [];

            // votedKeyword에서 추출
            var voted = stats3.analysis.votedKeyword;
            if (voted && voted.details) {
                voted.details.forEach(function(d) {
                    if (d.displayName) keywords.push(d.displayName);
                });
            }

            // themes에서 추출
            var themes = stats3.analysis.themes;
            if (themes) {
                themes.forEach(function(t) {
                    if (t.label && keywords.indexOf(t.label) === -1) {
                        keywords.push(t.label);
                    }
                });
            }

            if (keywords.length > 0) {
                return keywords.slice(0, 15);
            }
        }
    } catch (e) {
        console.log('Review stats query failed for ' + placeId + ':', e.message);
    }

    // 방법 4: microReview에서 해시태그 추출
    try {
        var payload4 = [{
            "operationName": "getRestaurantList",
            "variables": {
                "restaurantListInput": {
                    "query": placeId,
                    "x": "126.9783882",
                    "y": "37.5666103",
                    "start": 1,
                    "display": 1,
                    "isNmap": false,
                    "deviceType": "pc"
                }
            },
            "query": "query getRestaurantList($restaurantListInput: RestaurantListInput) { restaurants: restaurantList(input: $restaurantListInput) { items { id name keywords microReview } total } }"
        }];

        var data4 = await proxyGraphQL(payload4);
        var items4 = data4[0] && data4[0].data && data4[0].data.restaurants && data4[0].data.restaurants.items;
        if (items4 && items4.length > 0) {
            var item4 = items4[0];
            if (item4.keywords && item4.keywords.length > 0) {
                return item4.keywords;
            }
        }
    } catch (e) {
        console.log('Search-based keyword query failed:', e.message);
    }

    return [];
}

// ============================================
// 경쟁사 분석
// ============================================

async function runCompetitorAnalysis() {
    var keywordInput = document.getElementById('analysisKeyword');
    var keyword = keywordInput ? keywordInput.value.trim() : '';
    var topN = parseInt(document.getElementById('analysisTopN').value || '10');

    if (!keyword) {
        showToast('검색 키워드를 입력해주세요.', 'error');
        if (keywordInput) keywordInput.focus();
        return;
    }

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
            btn.disabled = false;
            btn.textContent = '분석 시작';
            return;
        }

        var totalItems = result.items.length;
        showAnalysisProgress(true, totalItems + '개 업체 발견, 대표키워드 분석 중...', 15);

        // 2단계: 각 업체별 대표키워드 수집
        var competitors = [];
        var allKeywords = {};

        for (var i = 0; i < result.items.length; i++) {
            var item = result.items[i];
            var placeId = String(item.id);
            var name = item.name || '';

            var progress = 15 + Math.round((i / totalItems) * 65);
            showAnalysisProgress(true,
                '대표키워드 수집 중... (' + (i + 1) + '/' + totalItems + ') ' + name,
                progress
            );

            // 대표키워드 조회
            var keywords = [];
            try {
                keywords = await getPlaceKeywords(placeId);
            } catch (e) {
                console.log('Keywords fetch failed for ' + name + ':', e.message);
            }

            // 키워드 카운트
            keywords.forEach(function(kw) {
                if (!allKeywords[kw]) {
                    allKeywords[kw] = { keyword: kw, count: 0 };
                }
                allKeywords[kw].count++;
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
                keywords: keywords
            });

            // 요청 간 딜레이 (차단 방지)
            if (i < result.items.length - 1) {
                await delay(800);
            }
        }

        showAnalysisProgress(true, '키워드 검색량 조회 중...', 85);

        // 3단계: 네이버 광고 API로 키워드 검색량 조회 (서버에서만 가능하므로 스킵)
        // 대신 이전에 저장된 검색량 데이터가 있으면 활용
        var keywordVolumes = loadSavedKeywordVolumes(Object.keys(allKeywords));

        showAnalysisProgress(true, '결과 저장 중...', 95);

        var analysisResult = {
            keyword: keyword,
            analyzed_at: new Date().toISOString(),
            total_results: result.total,
            competitors: competitors,
            keyword_volumes: keywordVolumes,
            all_keywords: allKeywords
        };

        // 저장
        var savedKey = keyword + '_' + topN;
        if (!marketingData.competitor_analysis) {
            marketingData.competitor_analysis = {};
        }
        marketingData.competitor_analysis[savedKey] = analysisResult;

        try {
            localStorage.setItem('marketing_competitor_' + savedKey, JSON.stringify(analysisResult));
        } catch (e) {
            console.log('localStorage 저장 실패', e);
        }

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

        if (error.message === 'PROXY_NOT_SET') {
            showProxySetupGuide();
        } else if (error.message.indexOf('Failed to fetch') !== -1) {
            showToast('프록시 서버 연결 실패. URL을 확인해주세요.', 'error');
        } else {
            showToast('분석 중 오류: ' + error.message, 'error');
        }
    }

    btn.disabled = false;
    btn.textContent = '분석 시작';
}

function loadSavedKeywordVolumes(keywords) {
    /**
     * 이전 분석에서 저장된 검색량 데이터 재활용
     */
    var volumes = {};
    var analyses = marketingData.competitor_analysis || {};

    Object.values(analyses).forEach(function(analysis) {
        var saved = analysis.keyword_volumes || {};
        Object.keys(saved).forEach(function(kw) {
            if (keywords.indexOf(kw) !== -1 && !volumes[kw]) {
                volumes[kw] = saved[kw];
            }
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
            '<p>경쟁사 분석을 위해 CORS 프록시 설정이 필요합니다.</p>' +
            '<p style="color:#888; font-size:0.85rem; margin-top:8px;">' +
                '네이버 API는 다른 도메인에서 직접 호출이 차단됩니다.<br>' +
                'Cloudflare Workers (무료)를 프록시로 사용합니다.' +
            '</p>' +
            '<div style="margin-top:20px;">' +
                '<p style="font-weight:600; color:#00d4ff; margin-bottom:8px;">프록시 URL 입력:</p>' +
                '<div style="display:flex; gap:8px;">' +
                    '<input type="text" id="proxyUrlInput" class="form-input" ' +
                        'placeholder="https://your-worker.workers.dev" ' +
                        'value="' + (localStorage.getItem('marketing_proxy_url') || '') + '" ' +
                        'style="flex:1;">' +
                    '<button class="btn btn-primary" onclick="saveProxyUrl()">저장</button>' +
                '</div>' +
            '</div>' +
            '<div style="margin-top:20px; padding:16px; background:rgba(0,0,0,0.2); border-radius:8px;">' +
                '<p style="font-weight:600; color:#ffe66d; margin-bottom:8px;">Cloudflare Workers 설정:</p>' +
                '<ol style="padding-left:20px; color:#aaa; font-size:0.83rem;">' +
                    '<li>dash.cloudflare.com 접속 (무료 가입)</li>' +
                    '<li>Workers & Pages > Create Worker</li>' +
                    '<li>프록시 코드 붙여넣기 후 Deploy</li>' +
                    '<li>생성된 URL을 위에 입력</li>' +
                '</ol>' +
            '</div>' +
        '</div>';

    modal.classList.add('show');
}

function saveProxyUrl() {
    var input = document.getElementById('proxyUrlInput');
    if (!input) return;

    var url = input.value.trim();
    if (!url) {
        showToast('프록시 URL을 입력해주세요.', 'error');
        return;
    }

    if (url.indexOf('http') !== 0) {
        showToast('올바른 URL을 입력해주세요. (https://...)', 'error');
        return;
    }

    if (url.endsWith('/')) url = url.slice(0, -1);

    localStorage.setItem('marketing_proxy_url', url);
    window.NAVER_PROXY_URL = url;

    closeModal();
    showToast('프록시 URL 저장 완료. 다시 분석을 시작해주세요.', 'success');
}

function showAnalysisProgress(show, text, percent) {
    var container = document.getElementById('analysisProgress');

    if (!show) {
        if (container) container.remove();
        return;
    }

    if (!container) {
        container = document.createElement('div');
        container.id = 'analysisProgress';
        container.className = 'analysis-progress';

        var resultEl = document.getElementById('analysisResult');
        if (resultEl && resultEl.parentNode) {
            resultEl.parentNode.insertBefore(container, resultEl);
        }
    }

    container.innerHTML =
        '<div class="progress-text">' + (text || '처리 중...') + '</div>' +
        '<div class="progress-bar-container">' +
            '<div class="progress-bar" style="width: ' + (percent || 0) + '%"></div>' +
        '</div>';
}

// ============================================
// 분석 결과 렌더링
// ============================================

function renderAnalysisResult(result) {
    var container = document.getElementById('analysisResult');
    if (!container) return;

    container.style.display = 'block';

    document.getElementById('competitorCount').textContent =
        result.competitors ? result.competitors.length : 0;

    var competitorsList = document.getElementById('competitorsList');
    if (competitorsList && result.competitors) {
        competitorsList.innerHTML = result.competitors.map(function(comp, idx) {
            var rankClass = '';
            if (idx === 0) rankClass = 'rank-1';
            else if (idx === 1) rankClass = 'rank-2';
            else if (idx === 2) rankClass = 'rank-3';

            var kwBadge = comp.keywords && comp.keywords.length > 0
                ? '<span style="font-size:0.7rem; color:#7b2cbf; margin-left:6px;">' + comp.keywords.length + '개 키워드</span>'
                : '';

            return '<div class="competitor-item" data-place-id="' + comp.place_id + '">' +
                '<div class="competitor-rank ' + rankClass + '">' + comp.rank + '</div>' +
                '<div class="competitor-info">' +
                    '<div class="competitor-name">' + escapeHtml(comp.name) + kwBadge + '</div>' +
                    '<div class="competitor-category">' + escapeHtml(comp.category || '') + '</div>' +
                '</div>' +
                '<div class="competitor-stats">' +
                    '<span>블로그 ' + formatNumber(comp.blog_reviews || 0) + '</span>' +
                    '<span>방문자 ' + formatNumber(comp.visitor_reviews || 0) + '</span>' +
                    '<span>저장 ' + formatNumber(comp.save_count || 0) + '</span>' +
                    '<span>평점 ' + (comp.score || '-') + '</span>' +
                '</div>' +
            '</div>';
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
    var keywordCounts = {};
    var keywordVolumes = result.keyword_volumes || {};

    (result.competitors || []).forEach(function(comp) {
        (comp.keywords || []).forEach(function(kw) {
            if (!keywordCounts[kw]) {
                keywordCounts[kw] = { keyword: kw, count: 0, volume: keywordVolumes[kw] || null };
            }
            keywordCounts[kw].count++;
        });
    });

    // all_keywords 데이터도 병합
    var allKw = result.all_keywords || {};
    Object.keys(allKw).forEach(function(kw) {
        if (!keywordCounts[kw]) {
            keywordCounts[kw] = {
                keyword: kw,
                count: allKw[kw].count || 0,
                volume: keywordVolumes[kw] || null
            };
        }
    });

    var keywordList = Object.values(keywordCounts).sort(function(a, b) {
        // 사용 업체수 > 검색량 순으로 정렬
        if (b.count !== a.count) return b.count - a.count;
        var volA = a.volume ? a.volume.total || 0 : 0;
        var volB = b.volume ? b.volume.total || 0 : 0;
        return volB - volA;
    });

    document.getElementById('totalRepKeywords').textContent = keywordList.length;

    var totalVolume = 0;
    var volumeCount = 0;
    keywordList.forEach(function(k) {
        if (k.volume && k.volume.total) {
            totalVolume += k.volume.total;
            volumeCount++;
        }
    });
    var avgVolume = volumeCount > 0 ? Math.round(totalVolume / volumeCount) : 0;
    document.getElementById('avgSearchVolume').textContent = avgVolume > 0 ? formatNumber(avgVolume) : '-';

    var tbody = document.getElementById('keywordsTableBody');
    if (tbody) {
        if (keywordList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="color:#666; padding:24px;">대표 키워드를 찾지 못했습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = keywordList.map(function(item) {
            var volume = item.volume;
            var compClass = '';
            if (volume && volume.comp === '높음') compClass = 'comp-high';
            else if (volume && volume.comp === '중간') compClass = 'comp-medium';
            else if (volume && volume.comp === '낮음') compClass = 'comp-low';

            var volumeText = volume && volume.total ? formatNumber(volume.total) : '-';
            var compText = volume && volume.comp ? volume.comp : '-';

            return '<tr>' +
                '<td>' + escapeHtml(item.keyword) + '</td>' +
                '<td class="text-right">' + volumeText + '</td>' +
                '<td class="text-center"><span class="comp-badge ' + compClass + '">' + compText + '</span></td>' +
                '<td class="text-right">' + item.count + '개</td>' +
            '</tr>';
        }).join('');
    }
}

function showCompetitorDetail(comp, volumes) {
    var modal = document.getElementById('detailModal');
    var title = document.getElementById('modalTitle');
    var body = document.getElementById('modalBody');

    if (!modal || !title || !body) return;

    title.textContent = comp.name;

    var keywordsHtml = '';
    if (comp.keywords && comp.keywords.length > 0) {
        keywordsHtml = comp.keywords.map(function(kw) {
            var vol = volumes ? volumes[kw] : null;
            return '<div class="keyword-item">' +
                '<span class="keyword-name">' + escapeHtml(kw) + '</span>' +
                (vol ? '<span class="keyword-volume">' + formatNumber(vol.total) + '</span>' : '') +
            '</div>';
        }).join('');
    }

    body.innerHTML =
        '<div class="detail-grid">' +
            '<div class="detail-item"><div class="detail-label">순위</div><div class="detail-value">' + comp.rank + '위</div></div>' +
            '<div class="detail-item"><div class="detail-label">카테고리</div><div class="detail-value">' + escapeHtml(comp.category || '-') + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">평점</div><div class="detail-value">' + (comp.score || '-') + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">블로그 리뷰</div><div class="detail-value">' + formatNumber(comp.blog_reviews || 0) + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">방문자 리뷰</div><div class="detail-value">' + formatNumber(comp.visitor_reviews || 0) + '</div></div>' +
            '<div class="detail-item"><div class="detail-label">저장수</div><div class="detail-value">' + formatNumber(comp.save_count || 0) + '</div></div>' +
        '</div>' +
        '<div class="detail-keywords-section">' +
            '<h4>대표 키워드 (' + (comp.keywords ? comp.keywords.length : 0) + '개)</h4>' +
            '<div class="keywords-grid">' +
                (keywordsHtml || '<p class="no-data" style="margin:0; font-size:0.85rem;">대표 키워드 없음</p>') +
            '</div>' +
        '</div>';

    modal.classList.add('show');
}

function renderSavedAnalysis() {
    var container = document.getElementById('savedAnalysisList');
    if (!container) return;

    var analyses = Object.entries(marketingData.competitor_analysis || {});

    // localStorage에서 추가 로드
    for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf('marketing_competitor_') === 0) {
            var savedKey = key.replace('marketing_competitor_', '');
            if (!marketingData.competitor_analysis || !marketingData.competitor_analysis[savedKey]) {
                try {
                    var data = JSON.parse(localStorage.getItem(key));
                    if (!marketingData.competitor_analysis) marketingData.competitor_analysis = {};
                    marketingData.competitor_analysis[savedKey] = data;
                    analyses.push([savedKey, data]);
                } catch (e) { /* ignore */ }
            }
        }
    }

    if (analyses.length === 0) {
        container.innerHTML = '<div class="no-data">저장된 분석 결과가 없습니다.<br>위에서 키워드를 입력하고 분석을 시작해보세요.</div>';
        return;
    }

    analyses.sort(function(a, b) {
        var dateA = a[1].analyzed_at || '';
        var dateB = b[1].analyzed_at || '';
        return dateB.localeCompare(dateA);
    });

    container.innerHTML = analyses.map(function(entry) {
        var key = entry[0];
        var data = entry[1];
        var date = data.analyzed_at ? formatDateTime(new Date(data.analyzed_at)) : '-';
        var compCount = data.competitors ? data.competitors.length : 0;
        var kwCount = 0;

        if (data.all_keywords) {
            kwCount = Object.keys(data.all_keywords).length;
        } else if (data.competitors) {
            var kwSet = new Set();
            data.competitors.forEach(function(c) {
                (c.keywords || []).forEach(function(k) { kwSet.add(k); });
            });
            kwCount = kwSet.size;
        }

        return '<div class="saved-item" data-key="' + key + '">' +
            '<div class="saved-item-info">' +
                '<div class="saved-item-keyword">' + escapeHtml(data.keyword || key) + '</div>' +
                '<div class="saved-item-date">' + date + '</div>' +
            '</div>' +
            '<div class="saved-item-count">' + compCount + '개 업체 / ' + kwCount + '개 키워드</div>' +
        '</div>';
    }).join('');

    container.querySelectorAll('.saved-item').forEach(function(item) {
        item.addEventListener('click', function() {
            var key = item.dataset.key;
            var data = marketingData.competitor_analysis[key];
            if (data) {
                document.getElementById('analysisKeyword').value = data.keyword || '';
                renderAnalysisResult(data);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
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

        var keywordTagsHtml = keywords.map(function(kw) {
            return '<span class="keyword-tag" data-store="' + store + '" data-keyword="' + escapeHtml(kw) + '">' +
                escapeHtml(kw) +
                '<button class="remove-btn" title="삭제">x</button>' +
            '</span>';
        }).join('');

        return '<div class="store-setting-item" data-store="' + store + '">' +
            '<div class="store-setting-header">' +
                '<span class="store-setting-name">' + store + '</span>' +
                '<button class="add-keyword-btn" data-store="' + store + '">+ 추가</button>' +
            '</div>' +
            '<div class="keyword-tags" data-store="' + store + '">' +
                (keywordTagsHtml || '<span class="no-keywords">등록된 키워드 없음</span>') +
            '</div>' +
            '<div class="keyword-input-wrapper" data-store="' + store + '" style="display: none;">' +
                '<input type="text" class="keyword-input" placeholder="키워드 입력 후 Enter">' +
                '<button class="btn btn-secondary confirm-add-btn">추가</button>' +
                '<button class="btn btn-outline cancel-add-btn">취소</button>' +
            '</div>' +
        '</div>';
    }).join('');

    // 추가 버튼
    container.querySelectorAll('.add-keyword-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var store = btn.dataset.store;
            var wrapper = container.querySelector('.keyword-input-wrapper[data-store="' + store + '"]');
            if (wrapper) {
                wrapper.style.display = 'flex';
                wrapper.querySelector('.keyword-input').focus();
            }
        });
    });

    // 취소
    container.querySelectorAll('.cancel-add-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var wrapper = btn.closest('.keyword-input-wrapper');
            if (wrapper) {
                wrapper.style.display = 'none';
                wrapper.querySelector('.keyword-input').value = '';
            }
        });
    });

    // 확인
    container.querySelectorAll('.confirm-add-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var wrapper = btn.closest('.keyword-input-wrapper');
            var store = wrapper ? wrapper.dataset.store : null;
            var input = wrapper ? wrapper.querySelector('.keyword-input') : null;

            if (store && input && input.value.trim()) {
                addKeywordToStore(store, input.value.trim());
                input.value = '';
                wrapper.style.display = 'none';
            }
        });
    });

    // Enter
    container.querySelectorAll('.keyword-input').forEach(function(input) {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                var wrapper = input.closest('.keyword-input-wrapper');
                var store = wrapper ? wrapper.dataset.store : null;

                if (store && input.value.trim()) {
                    addKeywordToStore(store, input.value.trim());
                    input.value = '';
                    wrapper.style.display = 'none';
                }
            } else if (e.key === 'Escape') {
                var wrapper2 = input.closest('.keyword-input-wrapper');
                if (wrapper2) {
                    wrapper2.style.display = 'none';
                    input.value = '';
                }
            }
        });
    });

    // 삭제
    container.querySelectorAll('.keyword-tag .remove-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var tag = btn.closest('.keyword-tag');
            var store = tag ? tag.dataset.store : null;
            var keyword = tag ? tag.dataset.keyword : null;

            if (store && keyword) {
                removeKeywordFromStore(store, keyword);
            }
        });
    });
}

function addKeywordToStore(store, keyword) {
    if (!configData.tracking_keywords) configData.tracking_keywords = {};
    if (!configData.tracking_keywords[store]) configData.tracking_keywords[store] = [];

    if (configData.tracking_keywords[store].indexOf(keyword) === -1) {
        configData.tracking_keywords[store].push(keyword);
        saveConfigToLocalStorage();
        renderKeywordSettings();
        showToast('"' + keyword + '" 추가됨', 'success');
    } else {
        showToast('이미 등록된 키워드입니다.', 'error');
    }
}

function removeKeywordFromStore(store, keyword) {
    if (configData.tracking_keywords && configData.tracking_keywords[store]) {
        configData.tracking_keywords[store] = configData.tracking_keywords[store].filter(function(k) { return k !== keyword; });
        saveConfigToLocalStorage();
        renderKeywordSettings();
        showToast('"' + keyword + '" 삭제됨', 'success');
    }
}

function saveConfigToLocalStorage() {
    try {
        localStorage.setItem('marketing_config', JSON.stringify(configData));
    } catch (e) {
        console.error('localStorage 저장 실패:', e);
    }
}

function saveKeywordSettings() {
    saveConfigToLocalStorage();
    showToast('키워드 설정이 저장되었습니다.', 'success');
}

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

    setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
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
    return date.toLocaleString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function delay(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function showLoading(show, text) {
    var overlay = document.getElementById('loadingOverlay');
    var loadingText = document.getElementById('loadingText');
    if (overlay) overlay.style.display = show ? 'flex' : 'none';
    if (loadingText) loadingText.textContent = text || '처리 중...';
}
