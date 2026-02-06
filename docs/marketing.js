/**
 * 마케팅 관리 대시보드
 * - 순위 추적
 * - 경쟁사 분석 (브라우저에서 직접 네이버 API 호출)
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

const NAVER_GRAPHQL_URL = "https://api.place.naver.com/graphql";

// ============================================
// 초기화
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initEventListeners();
    initFilters();
    renderDashboard();
});

function recreateCanvas(containerId, canvasId) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const oldCanvas = document.getElementById(canvasId);
    if (oldCanvas) oldCanvas.remove();

    const newCanvas = document.createElement('canvas');
    newCanvas.id = canvasId;
    container.appendChild(newCanvas);

    return newCanvas.getContext('2d');
}

// ============================================
// 데이터 로드
// ============================================

async function loadData() {
    try {
        const dataResponse = await fetch('marketing_data.json?t=' + Date.now());
        if (dataResponse.ok) {
            marketingData = await dataResponse.json();
            console.log('Marketing data loaded:', marketingData);

            if (marketingData.generated_at) {
                const date = new Date(marketingData.generated_at);
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

    // config 로드: localStorage > 서버 파일 > 기본값
    const localConfig = localStorage.getItem('marketing_config');
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
            const configResponse = await fetch('marketing_config.json?t=' + Date.now());
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
    // 탭 전환
    document.querySelectorAll('.tabs .tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // 필터
    document.getElementById('storeSelect')?.addEventListener('change', () => {
        updateKeywordFilter();
        filterAndRender();
    });
    document.getElementById('keywordSelect')?.addEventListener('change', filterAndRender);
    document.getElementById('periodSelect')?.addEventListener('change', filterAndRender);

    // 뷰 토글
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // 경쟁사 분석
    document.getElementById('runAnalysisBtn')?.addEventListener('click', runCompetitorAnalysis);

    // Enter 키로 분석 시작
    document.getElementById('analysisKeyword')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') runCompetitorAnalysis();
    });

    // 키워드 설정 저장
    document.getElementById('saveSettingsBtn')?.addEventListener('click', saveKeywordSettings);

    // 모달 닫기
    document.querySelector('#detailModal .modal-close')?.addEventListener('click', closeModal);
    document.getElementById('detailModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'detailModal') closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.tabs .tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabId);
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === tabId);
    });

    if (tabId === 'keywordSettings') {
        renderKeywordSettings();
    } else if (tabId === 'competitorAnalysis') {
        renderSavedAnalysis();
    }
}

function switchView(view) {
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    const cardView = document.getElementById('historyCardView');
    const tableView = document.getElementById('historyTableView');

    if (cardView) cardView.style.display = view === 'card' ? 'grid' : 'none';
    if (tableView) tableView.style.display = view === 'table' ? 'block' : 'none';
}

function closeModal() {
    document.getElementById('detailModal')?.classList.remove('show');
}

// ============================================
// 필터 초기화
// ============================================

function initFilters() {
    const storeSelect = document.getElementById('storeSelect');

    if (storeSelect) {
        storeSelect.innerHTML = '<option value="">전체 지점</option>';
        STORE_LIST.forEach(store => {
            storeSelect.innerHTML += `<option value="${store}">${store}</option>`;
        });
    }

    updateKeywordFilter();
}

function updateKeywordFilter() {
    const keywordSelect = document.getElementById('keywordSelect');
    const storeFilter = document.getElementById('storeSelect')?.value;

    if (!keywordSelect || !marketingData) return;

    const keywords = new Set();

    Object.keys(marketingData.tracking_history || {}).forEach(key => {
        const [store, keyword] = key.split('|');
        if (!storeFilter || store === storeFilter) {
            keywords.add(keyword);
        }
    });

    keywordSelect.innerHTML = '<option value="">전체 키워드</option>';
    [...keywords].sort().forEach(kw => {
        keywordSelect.innerHTML += `<option value="${kw}">${kw}</option>`;
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
    const storeFilter = document.getElementById('storeSelect')?.value;
    const keywordFilter = document.getElementById('keywordSelect')?.value;
    const periodDays = parseInt(document.getElementById('periodSelect')?.value || '30');

    const filteredData = [];

    Object.entries(marketingData.tracking_history || {}).forEach(([key, data]) => {
        const [store, keyword] = key.split('|');

        if (storeFilter && store !== storeFilter) return;
        if (keywordFilter && keyword !== keywordFilter) return;

        const history = (data.history || []).slice(0, periodDays);

        if (history.length > 0) {
            filteredData.push({
                key,
                store_name: store,
                keyword,
                place_id: data.place_id,
                history
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

    let totalRank = 0;
    let rankCount = 0;
    let rankUp = 0;
    let rankDown = 0;

    data.forEach(item => {
        const latest = item.history[0];
        const previous = item.history[1];

        if (latest?.rank) {
            totalRank += latest.rank;
            rankCount++;

            if (previous?.rank) {
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

    const ctx = recreateCanvas('rankChartContainer', 'rankChart');
    if (!ctx || data.length === 0) return;

    const dateSet = new Set();
    data.forEach(item => {
        item.history.forEach(h => dateSet.add(h.date));
    });
    const dates = [...dateSet].sort().reverse().slice(0, 30).reverse();

    const colors = ['#00d4ff', '#7b2cbf', '#4ecdc4', '#ff6b6b', '#ffe66d', '#51cf66', '#f59f00', '#e64980'];

    const datasets = data.slice(0, 8).map((item, idx) => {
        return {
            label: item.store_name.replace('역대짬뽕 ', '') + ' | ' + item.keyword,
            data: dates.map(date => {
                const found = item.history.find(h => h.date === date);
                return found?.rank || null;
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
            labels: dates.map(d => {
                const date = new Date(d);
                return (date.getMonth() + 1) + '.' + date.getDate();
            }),
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#e0e0e0',
                        font: { size: 11 },
                        boxWidth: 12,
                        padding: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ctx.dataset.label + ': ' + (ctx.raw ? ctx.raw + '위' : '-')
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
                    ticks: { color: '#888' },
                    grid: { display: false }
                },
                y: {
                    reverse: true,
                    min: 1,
                    ticks: {
                        color: '#888',
                        callback: (v) => v + '위'
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function renderHistoryCards(data) {
    const container = document.getElementById('historyCardView');
    if (!container) return;

    if (data.length === 0) {
        container.innerHTML = '<div class="no-data">추적 중인 키워드가 없습니다.</div>';
        return;
    }

    container.innerHTML = data.map(item => {
        const latest = item.history[0];
        const previous = item.history[1];

        let changeHtml = '';
        if (latest?.rank && previous?.rank) {
            const diff = previous.rank - latest.rank;
            if (diff > 0) {
                changeHtml = '<span class="rank-change up">+' + diff + '</span>';
            } else if (diff < 0) {
                changeHtml = '<span class="rank-change down">' + diff + '</span>';
            } else {
                changeHtml = '<span class="rank-change same">-</span>';
            }
        }

        const timelineHtml = item.history.slice(0, 14).map(h => {
            const date = new Date(h.date);
            const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
            const wd = weekdays[date.getDay()];

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
                '<span class="rank-number">' + (latest?.rank || '-') + '</span>' +
                changeHtml +
                '<div class="rank-label">현재 순위</div>' +
            '</div>' +
            '<div class="history-timeline">' + timelineHtml + '</div>' +
        '</div>';
    }).join('');
}

function renderHistoryTable(data) {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    const rows = [];

    data.forEach(item => {
        item.history.slice(0, 7).forEach(h => {
            rows.push({
                date: h.date,
                weekday: h.weekday,
                store: item.store_name,
                keyword: item.keyword,
                rank: h.rank,
                blog: h.blog_reviews,
                visitor: h.visitor_reviews,
                save: h.save_count,
                score: h.score
            });
        });
    });

    rows.sort((a, b) => b.date.localeCompare(a.date));

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">데이터가 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.slice(0, 100).map(row =>
        '<tr>' +
            '<td>' + row.date + ' ' + (row.weekday || '') + '</td>' +
            '<td>' + row.store + '</td>' +
            '<td>' + row.keyword + '</td>' +
            '<td class="text-center">' + (row.rank ? row.rank + '위' : '-') + '</td>' +
            '<td class="text-right">' + (row.blog || '-') + '</td>' +
            '<td class="text-right">' + (formatNumber(row.visitor) || '-') + '</td>' +
            '<td class="text-right">' + (row.save || '-') + '</td>' +
            '<td class="text-center">' + (row.score || '-') + '</td>' +
        '</tr>'
    ).join('');
}

// ============================================
// 경쟁사 분석 (브라우저에서 직접 API 호출)
// ============================================

async function searchNaverPlace(keyword, maxResults) {
    const payload = [{
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

    const response = await fetch(NAVER_GRAPHQL_URL, {
        method: 'POST',
        headers: {
            'accept': '*/*',
            'accept-language': 'ko',
            'content-type': 'application/json',
            'origin': 'https://m.place.naver.com',
            'referer': 'https://m.place.naver.com/'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error('API 요청 실패: ' + response.status);
    }

    const data = await response.json();
    return data[0]?.data?.restaurants || { items: [], total: 0 };
}

async function runCompetitorAnalysis() {
    const keywordInput = document.getElementById('analysisKeyword');
    const keyword = keywordInput?.value.trim();
    const topN = parseInt(document.getElementById('analysisTopN')?.value || '10');

    if (!keyword) {
        showToast('검색 키워드를 입력해주세요.', 'error');
        keywordInput?.focus();
        return;
    }

    const btn = document.getElementById('runAnalysisBtn');
    btn.disabled = true;
    btn.textContent = '분석 중...';

    showAnalysisProgress(true, '네이버 플레이스 검색 중...', 0);

    try {
        // 1단계: 검색
        showAnalysisProgress(true, '"' + keyword + '" 검색 중...', 20);
        const result = await searchNaverPlace(keyword, topN);

        if (!result.items || result.items.length === 0) {
            showToast('검색 결과가 없습니다.', 'error');
            showAnalysisProgress(false);
            btn.disabled = false;
            btn.textContent = '분석 시작';
            return;
        }

        showAnalysisProgress(true, result.items.length + '개 업체 발견, 분석 중...', 60);

        // 2단계: 결과 가공
        const competitors = result.items.map((item, idx) => ({
            rank: idx + 1,
            place_id: String(item.id),
            name: item.name || '',
            category: item.category || '',
            blog_reviews: String(item.blogCafeReviewCount || 0),
            visitor_reviews: String(item.visitorReviewCount || 0),
            save_count: String(item.saveCount || 0),
            score: item.visitorReviewScore || 0,
            total_reviews: item.totalReviewCount || 0,
            keywords: []
        }));

        const analysisResult = {
            keyword: keyword,
            analyzed_at: new Date().toISOString(),
            total_results: result.total,
            competitors: competitors,
            keyword_volumes: {}
        };

        showAnalysisProgress(true, '분석 완료! 결과 저장 중...', 90);

        // 3단계: 결과 저장
        const savedKey = keyword + '_' + topN;
        if (!marketingData.competitor_analysis) {
            marketingData.competitor_analysis = {};
        }
        marketingData.competitor_analysis[savedKey] = analysisResult;

        // localStorage에 저장
        try {
            localStorage.setItem('marketing_competitor_' + savedKey, JSON.stringify(analysisResult));
        } catch (e) {
            console.log('localStorage 저장 실패 (용량 초과 가능)', e);
        }

        showAnalysisProgress(true, '완료!', 100);

        await delay(500);
        showAnalysisProgress(false);

        // 결과 렌더링
        renderAnalysisResult(analysisResult);
        renderSavedAnalysis();

        showToast(competitors.length + '개 업체 분석 완료', 'success');

    } catch (error) {
        console.error('Analysis failed:', error);

        // CORS 에러일 가능성
        if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
            showToast('네이버 API 접근이 차단되었습니다. 잠시 후 다시 시도해주세요.', 'error');
        } else {
            showToast('분석 중 오류: ' + error.message, 'error');
        }

        showAnalysisProgress(false);
    }

    btn.disabled = false;
    btn.textContent = '분석 시작';
}

function showAnalysisProgress(show, text, percent) {
    let container = document.getElementById('analysisProgress');

    if (!show) {
        if (container) container.remove();
        return;
    }

    if (!container) {
        container = document.createElement('div');
        container.id = 'analysisProgress';
        container.className = 'analysis-progress';

        const resultEl = document.getElementById('analysisResult');
        if (resultEl) {
            resultEl.parentNode.insertBefore(container, resultEl);
        }
    }

    container.innerHTML =
        '<div class="progress-text">' + (text || '처리 중...') + '</div>' +
        '<div class="progress-bar-container">' +
            '<div class="progress-bar" style="width: ' + (percent || 0) + '%"></div>' +
        '</div>';
}

function renderAnalysisResult(result) {
    const container = document.getElementById('analysisResult');
    if (!container) return;

    container.style.display = 'block';

    document.getElementById('competitorCount').textContent = result.competitors?.length || 0;

    const competitorsList = document.getElementById('competitorsList');
    if (competitorsList && result.competitors) {
        competitorsList.innerHTML = result.competitors.map(function(comp, idx) {
            var rankClass = '';
            if (idx === 0) rankClass = 'rank-1';
            else if (idx === 1) rankClass = 'rank-2';
            else if (idx === 2) rankClass = 'rank-3';

            return '<div class="competitor-item" data-place-id="' + comp.place_id + '">' +
                '<div class="competitor-rank ' + rankClass + '">' + comp.rank + '</div>' +
                '<div class="competitor-info">' +
                    '<div class="competitor-name">' + escapeHtml(comp.name) + '</div>' +
                    '<div class="competitor-category">' + escapeHtml(comp.category || '') + '</div>' +
                '</div>' +
                '<div class="competitor-stats">' +
                    '<span>블로그 ' + (comp.blog_reviews || 0) + '</span>' +
                    '<span>방문자 ' + formatNumber(comp.visitor_reviews || 0) + '</span>' +
                    '<span>저장 ' + (comp.save_count || 0) + '</span>' +
                    '<span>평점 ' + (comp.score || '-') + '</span>' +
                '</div>' +
            '</div>';
        }).join('');

        competitorsList.querySelectorAll('.competitor-item').forEach(item => {
            item.addEventListener('click', () => {
                const placeId = item.dataset.placeId;
                const comp = result.competitors.find(c => c.place_id === placeId);
                if (comp) showCompetitorDetail(comp, result.keyword_volumes);
            });
        });
    }

    renderKeywordsAnalysis(result);
}

function renderKeywordsAnalysis(result) {
    const keywordCounts = {};
    const keywordVolumes = result.keyword_volumes || {};

    (result.competitors || []).forEach(comp => {
        (comp.keywords || []).forEach(kw => {
            if (!keywordCounts[kw]) {
                keywordCounts[kw] = {
                    keyword: kw,
                    count: 0,
                    volume: keywordVolumes[kw] || null
                };
            }
            keywordCounts[kw].count++;
        });
    });

    const keywordList = Object.values(keywordCounts)
        .sort((a, b) => (b.volume?.total || 0) - (a.volume?.total || 0));

    document.getElementById('totalRepKeywords').textContent = keywordList.length;

    const avgVolume = keywordList.length > 0
        ? keywordList.reduce((sum, k) => sum + (k.volume?.total || 0), 0) / keywordList.length
        : 0;
    document.getElementById('avgSearchVolume').textContent = formatNumber(Math.round(avgVolume));

    const tbody = document.getElementById('keywordsTableBody');
    if (tbody) {
        if (keywordList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="color:#666; padding:24px;">대표 키워드 데이터가 없습니다. (GitHub Actions 크롤링 필요)</td></tr>';
            return;
        }

        tbody.innerHTML = keywordList.map(item => {
            const volume = item.volume;
            let compClass = '';
            if (volume?.comp === '높음') compClass = 'comp-high';
            else if (volume?.comp === '중간') compClass = 'comp-medium';
            else if (volume?.comp === '낮음') compClass = 'comp-low';

            return '<tr>' +
                '<td>' + escapeHtml(item.keyword) + '</td>' +
                '<td class="text-right">' + (volume?.total ? formatNumber(volume.total) : '-') + '</td>' +
                '<td class="text-center"><span class="comp-badge ' + compClass + '">' + (volume?.comp || '-') + '</span></td>' +
                '<td class="text-right">' + item.count + '개</td>' +
            '</tr>';
        }).join('');
    }
}

function showCompetitorDetail(comp, volumes) {
    const modal = document.getElementById('detailModal');
    const title = document.getElementById('modalTitle');
    const body = document.getElementById('modalBody');

    if (!modal || !title || !body) return;

    title.textContent = comp.name;

    const keywordsHtml = (comp.keywords || []).map(kw => {
        const vol = volumes?.[kw];
        return '<div class="keyword-item">' +
            '<span class="keyword-name">' + escapeHtml(kw) + '</span>' +
            (vol ? '<span class="keyword-volume">' + formatNumber(vol.total) + '</span>' : '') +
        '</div>';
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
        '<div class="detail-keywords-section">' +
            '<h4>대표 키워드 (' + (comp.keywords?.length || 0) + '개)</h4>' +
            '<div class="keywords-grid">' +
                (keywordsHtml || '<p class="no-data" style="margin:0; font-size:0.85rem;">대표 키워드 없음</p>') +
            '</div>' +
        '</div>';

    modal.classList.add('show');
}

function renderSavedAnalysis() {
    const container = document.getElementById('savedAnalysisList');
    if (!container) return;

    const analyses = Object.entries(marketingData.competitor_analysis || {});

    // localStorage에서 추가 데이터 로드
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('marketing_competitor_')) {
            const savedKey = key.replace('marketing_competitor_', '');
            if (!marketingData.competitor_analysis?.[savedKey]) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (!marketingData.competitor_analysis) marketingData.competitor_analysis = {};
                    marketingData.competitor_analysis[savedKey] = data;
                    analyses.push([savedKey, data]);
                } catch (e) { /* ignore */ }
            }
        }
    }

    if (analyses.length === 0) {
        container.innerHTML = '<div class="no-data">저장된 분석 결과가 없습니다.<br>위 검색에서 키워드를 입력하고 분석을 시작하세요.</div>';
        return;
    }

    // 최신순 정렬
    analyses.sort((a, b) => {
        const dateA = a[1].analyzed_at || '';
        const dateB = b[1].analyzed_at || '';
        return dateB.localeCompare(dateA);
    });

    container.innerHTML = analyses.map(([key, data]) => {
        const date = data.analyzed_at ? formatDateTime(new Date(data.analyzed_at)) : '-';
        const competitorCount = data.competitors?.length || 0;

        return '<div class="saved-item" data-key="' + key + '">' +
            '<div class="saved-item-info">' +
                '<div class="saved-item-keyword">' + escapeHtml(data.keyword || key) + '</div>' +
                '<div class="saved-item-date">' + date + '</div>' +
            '</div>' +
            '<div class="saved-item-count">' + competitorCount + '개 업체</div>' +
        '</div>';
    }).join('');

    container.querySelectorAll('.saved-item').forEach(item => {
        item.addEventListener('click', () => {
            const key = item.dataset.key;
            const data = marketingData.competitor_analysis[key];
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
    const container = document.getElementById('storeKeywordSettings');
    if (!container) return;

    const trackingKeywords = configData?.tracking_keywords || {};

    container.innerHTML = STORE_LIST.map(store => {
        const keywords = trackingKeywords[store] || [];

        const keywordTagsHtml = keywords.map(kw =>
            '<span class="keyword-tag" data-store="' + store + '" data-keyword="' + escapeHtml(kw) + '">' +
                escapeHtml(kw) +
                '<button class="remove-btn" title="삭제">x</button>' +
            '</span>'
        ).join('');

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

    // 이벤트 바인딩
    container.querySelectorAll('.add-keyword-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const store = btn.dataset.store;
            const wrapper = container.querySelector('.keyword-input-wrapper[data-store="' + store + '"]');
            if (wrapper) {
                wrapper.style.display = 'flex';
                wrapper.querySelector('.keyword-input').focus();
            }
        });
    });

    container.querySelectorAll('.cancel-add-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const wrapper = btn.closest('.keyword-input-wrapper');
            if (wrapper) {
                wrapper.style.display = 'none';
                wrapper.querySelector('.keyword-input').value = '';
            }
        });
    });

    container.querySelectorAll('.confirm-add-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const wrapper = btn.closest('.keyword-input-wrapper');
            const store = wrapper?.dataset.store;
            const input = wrapper?.querySelector('.keyword-input');

            if (store && input?.value.trim()) {
                addKeywordToStore(store, input.value.trim());
                input.value = '';
                wrapper.style.display = 'none';
            }
        });
    });

    container.querySelectorAll('.keyword-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const wrapper = input.closest('.keyword-input-wrapper');
                const store = wrapper?.dataset.store;

                if (store && input.value.trim()) {
                    addKeywordToStore(store, input.value.trim());
                    input.value = '';
                    wrapper.style.display = 'none';
                }
            } else if (e.key === 'Escape') {
                const wrapper = input.closest('.keyword-input-wrapper');
                if (wrapper) {
                    wrapper.style.display = 'none';
                    input.value = '';
                }
            }
        });
    });

    container.querySelectorAll('.keyword-tag .remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tag = btn.closest('.keyword-tag');
            const store = tag?.dataset.store;
            const keyword = tag?.dataset.keyword;

            if (store && keyword) {
                removeKeywordFromStore(store, keyword);
            }
        });
    });
}

function addKeywordToStore(store, keyword) {
    if (!configData.tracking_keywords) {
        configData.tracking_keywords = {};
    }
    if (!configData.tracking_keywords[store]) {
        configData.tracking_keywords[store] = [];
    }

    if (!configData.tracking_keywords[store].includes(keyword)) {
        configData.tracking_keywords[store].push(keyword);
        saveConfigToLocalStorage();
        renderKeywordSettings();
        showToast('"' + keyword + '" 키워드가 추가되었습니다.', 'success');
    } else {
        showToast('이미 등록된 키워드입니다.', 'error');
    }
}

function removeKeywordFromStore(store, keyword) {
    if (configData.tracking_keywords?.[store]) {
        configData.tracking_keywords[store] = configData.tracking_keywords[store].filter(k => k !== keyword);
        saveConfigToLocalStorage();
        renderKeywordSettings();
        showToast('"' + keyword + '" 키워드가 삭제되었습니다.', 'success');
    }
}

function saveConfigToLocalStorage() {
    try {
        localStorage.setItem('marketing_config', JSON.stringify(configData));
    } catch (e) {
        console.error('localStorage 저장 실패:', e);
    }
}

async function saveKeywordSettings() {
    saveConfigToLocalStorage();
    showToast('키워드 설정이 저장되었습니다.', 'success');
}

// ============================================
// 토스트 알림
// ============================================

function showToast(message, type) {
    // 기존 토스트 제거
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' toast-' + type : '');
    toast.textContent = message;
    document.body.appendChild(toast);

    // 표시
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // 자동 숨김
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// 유틸리티 함수
// ============================================

function formatNumber(num) {
    if (num === null || num === undefined || num === '') return null;

    var n = num;
    if (typeof num === 'string') {
        n = parseInt(num.replace(/,/g, ''));
    }
    if (isNaN(n)) return null;

    return new Intl.NumberFormat('ko-KR').format(n);
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

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function showLoading(show, text) {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');

    if (overlay) overlay.style.display = show ? 'flex' : 'none';
    if (loadingText) loadingText.textContent = text || '처리 중...';
}
