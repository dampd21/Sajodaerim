/**
 * 키워드 마인드맵 v5.1
 * - 캐시 1시간 + 강제 새로고침
 * - 트리맵 뷰 전환
 * - 출처 한글화
 * - 60개 키워드 지원
 */
(function() {
  var WORKER_URL = 'https://keywordjjbb.dampd21.workers.dev';
  var CACHE_TTL = 60 * 60 * 1000; // 1시간

  var simulation = null;
  var svg = null;
  var svgGroup = null;
  var zoom = null;
  var currentData = null;
  var showLabels = true;
  var currentView = 'force';

  var LEVEL_COLORS = { 0: '#ff6b6b', 1: '#00d4ff', 2: '#4ecdc4', 3: '#ffe66d' };

  document.addEventListener('DOMContentLoaded', initEventListeners);

  function initEventListeners() {
    var searchBtn = document.getElementById('searchBtn');
    var keywordInput = document.getElementById('keywordInput');
    var resetZoomBtn = document.getElementById('resetZoomBtn');
    var toggleLabelsBtn = document.getElementById('toggleLabelsBtn');
    var toggleViewBtn = document.getElementById('toggleViewBtn');
    var refreshBtn = document.getElementById('refreshBtn');

    if (searchBtn) searchBtn.addEventListener('click', function() { doSearch(false); });
    if (keywordInput) {
      keywordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); doSearch(false); }
      });
    }
    if (resetZoomBtn) resetZoomBtn.addEventListener('click', resetZoom);
    if (toggleLabelsBtn) toggleLabelsBtn.addEventListener('click', toggleLabels);
    if (toggleViewBtn) {
      toggleViewBtn.addEventListener('click', function() {
        currentView = currentView === 'force' ? 'treemap' : 'force';
        toggleViewBtn.textContent = currentView === 'force' ? '트리맵 뷰' : '마인드맵 뷰';
        if (currentData) renderVisualization(currentData);
      });
    }
    // 강제 새로고침 버튼
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() { doSearch(true); });
    }

    document.querySelectorAll('.mindmap-hint-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var kw = btn.dataset.keyword;
        if (kw) {
          var input = document.getElementById('keywordInput');
          if (input) input.value = kw;
          doSearch(false);
        }
      });
    });
  }

  function doSearch(forceRefresh) {
    var input = document.getElementById('keywordInput');
    if (!input) return;
    var keyword = input.value.trim();
    if (!keyword) { input.focus(); return; }

    // 캐시 확인 (강제 새로고침이 아닌 경우)
    if (!forceRefresh) {
      var cached = getCache(keyword);
      if (cached) { renderResult(cached); return; }
    } else {
      // 강제 새로고침이면 캐시 삭제
      clearCache(keyword);
    }

    showLoading('4개 소스에서 키워드 수집 중... (5~15초)');

    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: keyword })
    })
    .then(function(resp) {
      if (!resp.ok) {
        return resp.json().then(function(d) {
          throw new Error(d.error || 'API 오류 (' + resp.status + ')');
        });
      }
      return resp.json();
    })
    .then(function(data) {
      hideLoading();
      setCache(keyword, data);
      renderResult(data);
    })
    .catch(function(err) {
      hideLoading();
      showError(err.message || '분석 중 오류가 발생했습니다.');
    });
  }

  function renderResult(data) {
    currentData = data;
    updateInfoBar(data);
    renderVisualization(data);
    renderDetailTable(data);
    var placeholder = document.getElementById('placeholder');
    if (placeholder) placeholder.style.display = 'none';
  }

  function updateInfoBar(data) {
    var infoBar = document.getElementById('infoBar');
    var legendBar = document.getElementById('legendBar');
    if (infoBar) infoBar.style.display = 'flex';
    if (legendBar) legendBar.style.display = 'flex';

    var industry = data.industry || {};
    var meta = data.metadata || {};
    var src = meta.sources || {};

    setText('industryType', (industry.type || '일반') +
      (industry.sub_category ? ' / ' + industry.sub_category : ''));
    setText('industryConfidence',
      industry.confidence > 0 ? Math.round(industry.confidence * 100) + '%' : '-');
    setText('totalKeywords', (meta.total_keywords || 0) + '개');
    setText('genTime', (meta.generation_time || 0).toFixed(1) + '초');

    var mode = meta.analysis_mode === 'gemini' ? 'AI분석' : '폴백';
    var srcText = '자동완성 ' + (src.autocomplete || 0) +
      ' · 블로그 ' + (src.blog_titles || 0) +
      ' · 본문 ' + (src.blog_bodies || 0) +
      ' · 검색광고 ' + (src.naver_ads || 0);
    if (src.naver_ads_error) srcText += ' ⚠️';
    srcText += ' (' + mode + ')';
    setText('sourceInfo', srcText);
  }

  function renderVisualization(data) {
    if (currentView === 'treemap') renderTreemap(data);
    else renderMindmap(data);
  }

  // ============================================
  // Force 마인드맵
  // ============================================
  function renderMindmap(data) {
    var container = document.getElementById('mindmapContainer');
    if (!container) return;
    cleanup(container);

    var w = container.clientWidth || 800;
    var h = container.clientHeight || 550;
    var nodes = data.nodes || [];
    var links = data.links || [];
    if (nodes.length === 0) return;

    var nc = nodes.map(function(n) { return Object.assign({}, n); });
    var lc = links.map(function(l) { return Object.assign({}, l); });
    var tip = makeTip(container);

    svg = d3.select(container).append('svg')
      .attr('width', w).attr('height', h)
      .style('width', '100%').style('height', '100%');

    zoom = d3.zoom().scaleExtent([0.15, 5])
      .on('zoom', function(e) { svgGroup.attr('transform', e.transform); });
    svg.call(zoom);
    svgGroup = svg.append('g');

    var linkEls = svgGroup.append('g').selectAll('line')
      .data(lc).enter().append('line')
      .attr('stroke', function(d) { return 'rgba(255,255,255,' + (d.strength * 0.25 + 0.03) + ')'; })
      .attr('stroke-width', function(d) { return Math.max(0.3, d.strength * 2.5); });

    var nodeEls = svgGroup.append('g').selectAll('g')
      .data(nc).enter().append('g')
      .attr('class', 'mindmap-node').style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', function(e, d) { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', function(e, d) { d.fx = e.x; d.fy = e.y; })
        .on('end', function(e, d) { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on('click', function(e, d) {
        if (d.level > 0) window.open('https://search.naver.com/search.naver?query=' + encodeURIComponent(d.id), '_blank');
      })
      .on('mouseenter', function(e, d) { showTip(tip, e, d, container); })
      .on('mouseleave', function() { tip.style.display = 'none'; });

    nodeEls.append('circle')
      .attr('r', function(d) { return d.size / 2.5; })
      .attr('fill', function(d) { return LEVEL_COLORS[d.level] || '#888'; })
      .attr('fill-opacity', function(d) { return d.level === 0 ? 0.9 : 0.6; })
      .attr('stroke', function(d) { return LEVEL_COLORS[d.level] || '#888'; })
      .attr('stroke-width', function(d) { return d.level === 0 ? 3 : 1.5; })
      .attr('stroke-opacity', 0.4);

    nodeEls.append('text')
      .attr('class', 'mindmap-label')
      .attr('text-anchor', 'middle')
      .attr('dy', function(d) { return d.level === 0 ? 5 : (d.size / 2.5) + 13; })
      .attr('fill', function(d) { return d.level === 0 ? '#fff' : '#ccc'; })
      .attr('font-size', function(d) { return d.level === 0 ? '13px' : (d.level === 1 ? '10px' : '9px'); })
      .attr('font-weight', function(d) { return d.level <= 1 ? '700' : '400'; })
      .text(function(d) { return d.id.length > 12 ? d.id.slice(0, 12) + '..' : d.id; })
      .style('pointer-events', 'none');

    nodeEls.filter(function(d) { return d.level > 0 && d.monthly_search > 0; })
      .append('text').attr('class', 'mindmap-volume-label')
      .attr('text-anchor', 'middle')
      .attr('dy', function(d) { return (d.size / 2.5) + 24; })
      .attr('fill', '#888').attr('font-size', '7px')
      .text(function(d) { return fmtVol(d.monthly_search); })
      .style('pointer-events', 'none');

    simulation = d3.forceSimulation(nc)
      .force('link', d3.forceLink(lc).id(function(d) { return d.id; })
        .distance(function(d) { return d.distance || 120; })
        .strength(function(d) { return d.strength * 0.25; }))
      .force('charge', d3.forceManyBody().strength(function(d) { return d.level === 0 ? -600 : -120; }))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collision', d3.forceCollide().radius(function(d) { return (d.size / 2.5) + 6; }))
      .force('x', d3.forceX(w / 2).strength(0.02))
      .force('y', d3.forceY(h / 2).strength(0.02))
      .on('tick', function() {
        linkEls.attr('x1', function(d) { return d.source.x; }).attr('y1', function(d) { return d.source.y; })
          .attr('x2', function(d) { return d.target.x; }).attr('y2', function(d) { return d.target.y; });
        nodeEls.attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
      });

    setTimeout(resetZoom, 1200);
  }

  // ============================================
  // 트리맵
  // ============================================
  function renderTreemap(data) {
    var container = document.getElementById('mindmapContainer');
    if (!container) return;
    cleanup(container);

    var w = container.clientWidth || 800;
    var h = container.clientHeight || 550;
    var nodes = (data.nodes || []).filter(function(n) { return n.level > 0; });
    if (nodes.length === 0) return;

    var tip = makeTip(container);

    var catMap = {};
    nodes.forEach(function(n) {
      var c = n.category || '일반';
      if (!catMap[c]) catMap[c] = [];
      catMap[c].push(n);
    });

    var hier = {
      name: data.center || '',
      children: Object.keys(catMap).map(function(c) {
        return { name: c, children: catMap[c].map(function(n) {
          return { name: n.id, value: n.score, level: n.level,
            monthly_search: n.monthly_search || 0, comp_idx: n.comp_idx || '',
            source: n.source || '', category: n.category || '', score: n.score };
        })};
      })
    };

    var root = d3.hierarchy(hier).sum(function(d) { return d.value || 0; })
      .sort(function(a, b) { return b.value - a.value; });

    d3.treemap().size([w, h]).padding(3).paddingTop(18).round(true)(root);

    svg = d3.select(container).append('svg')
      .attr('width', w).attr('height', h).style('width', '100%').style('height', '100%');

    svg.selectAll('g.cat').data(root.children || []).enter().append('g').attr('class', 'cat')
      .each(function(d) {
        d3.select(this).append('rect')
          .attr('x', d.x0).attr('y', d.y0)
          .attr('width', d.x1 - d.x0).attr('height', d.y1 - d.y0)
          .attr('fill', 'rgba(255,255,255,0.03)')
          .attr('stroke', 'rgba(255,255,255,0.08)').attr('rx', 4);
        d3.select(this).append('text')
          .attr('x', d.x0 + 5).attr('y', d.y0 + 13)
          .attr('fill', '#777').attr('font-size', '9px').attr('font-weight', '600')
          .text(d.data.name);
      });

    var leaves = svg.selectAll('g.leaf').data(root.leaves()).enter().append('g')
      .attr('class', 'leaf').style('cursor', 'pointer')
      .on('click', function(e, d) {
        window.open('https://search.naver.com/search.naver?query=' + encodeURIComponent(d.data.name), '_blank');
      })
      .on('mouseenter', function(e, d) {
        showTip(tip, e, { id: d.data.name, level: d.data.level, score: d.data.score,
          category: d.data.category, source: d.data.source,
          monthly_search: d.data.monthly_search, comp_idx: d.data.comp_idx }, container);
      })
      .on('mouseleave', function() { tip.style.display = 'none'; });

    leaves.append('rect')
      .attr('x', function(d) { return d.x0; }).attr('y', function(d) { return d.y0; })
      .attr('width', function(d) { return Math.max(0, d.x1 - d.x0); })
      .attr('height', function(d) { return Math.max(0, d.y1 - d.y0); })
      .attr('fill', function(d) { return LEVEL_COLORS[d.data.level] || '#888'; })
      .attr('fill-opacity', 0.2)
      .attr('stroke', function(d) { return LEVEL_COLORS[d.data.level] || '#888'; })
      .attr('stroke-opacity', 0.4).attr('rx', 3);

    leaves.append('text')
      .attr('x', function(d) { return d.x0 + 3; })
      .attr('y', function(d) { return d.y0 + 13; })
      .attr('fill', '#ddd').attr('font-size', function(d) { return (d.x1 - d.x0) > 100 ? '10px' : '8px'; })
      .attr('font-weight', function(d) { return d.data.level === 1 ? '700' : '400'; })
      .text(function(d) {
        var maxC = Math.floor((d.x1 - d.x0) / 8);
        return d.data.name.length > maxC ? d.data.name.slice(0, maxC - 1) + '..' : d.data.name;
      }).style('pointer-events', 'none');

    leaves.filter(function(d) { return d.data.monthly_search > 0 && (d.y1 - d.y0) > 26; })
      .append('text')
      .attr('x', function(d) { return d.x0 + 3; })
      .attr('y', function(d) { return d.y0 + 24; })
      .attr('fill', '#888').attr('font-size', '7px')
      .text(function(d) { return fmtVol(d.data.monthly_search) + '/월'; })
      .style('pointer-events', 'none');
  }

  // ============================================
  // 공통
  // ============================================
  function cleanup(container) {
    var old = container.querySelector('svg');
    if (old) old.remove();
    var ot = document.getElementById('mindmapTooltip');
    if (ot) ot.remove();
    if (simulation) { simulation.stop(); simulation = null; }
  }

  function makeTip(container) {
    var t = document.createElement('div');
    t.id = 'mindmapTooltip';
    t.className = 'mindmap-tooltip';
    t.style.display = 'none';
    container.appendChild(t);
    return t;
  }

  function showTip(tip, event, d, container) {
    if (d.level === 0) { tip.style.display = 'none'; return; }
    var lvl = { 1: '핵심', 2: '중간', 3: '세부' };
    var srcLabel = translateSrc(d.source);
    var h = '<div class="mindmap-tooltip-title">' + esc(d.id) + '</div>';
    h += '<div class="mindmap-tooltip-row"><span>연관도</span><span>' + d.score + '점</span></div>';
    h += '<div class="mindmap-tooltip-row"><span>레벨</span><span>' + (lvl[d.level] || '-') + '</span></div>';
    if (d.category && d.category !== '일반')
      h += '<div class="mindmap-tooltip-row"><span>분류</span><span>' + esc(d.category) + '</span></div>';
    if (d.monthly_search > 0)
      h += '<div class="mindmap-tooltip-row mindmap-tooltip-highlight"><span>월간 검색량</span><span>' + fmtNum(d.monthly_search) + '</span></div>';
    if (d.comp_idx) {
      var cc = d.comp_idx === '높음' ? ' mindmap-comp-high' : (d.comp_idx === '중간' ? ' mindmap-comp-mid' : ' mindmap-comp-low');
      h += '<div class="mindmap-tooltip-row"><span>경쟁도</span><span class="' + cc + '">' + esc(d.comp_idx) + '</span></div>';
    }
    h += '<div class="mindmap-tooltip-row mindmap-tooltip-source"><span>출처</span><span>' + esc(srcLabel) + '</span></div>';
    h += '<div class="mindmap-tooltip-hint">클릭 → 네이버 검색</div>';
    tip.innerHTML = h;
    tip.style.display = 'block';

    var r = container.getBoundingClientRect();
    var x = event.clientX - r.left + 15;
    var y = event.clientY - r.top - 10;
    if (x + 260 > r.width) x = event.clientX - r.left - 270;
    if (y + 200 > r.height) y = event.clientY - r.top - 200;
    tip.style.left = Math.max(0, x) + 'px';
    tip.style.top = Math.max(0, y) + 'px';
  }

  function translateSrc(s) {
    if (!s) return '-';
    var map = { 'ads': '검색광고', 'auto': '자동완성', 'blog': '블로그', 'gemini': 'AI분석', 'fallback': '텍스트' };
    return s.split('+').map(function(p) { return map[p.trim()] || p.trim(); }).join(' + ');
  }

  function resetZoom() {
    if (!svg || !zoom) return;
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
  }

  function toggleLabels() {
    showLabels = !showLabels;
    d3.selectAll('.mindmap-label').style('display', showLabels ? 'block' : 'none');
    d3.selectAll('.mindmap-volume-label').style('display', showLabels ? 'block' : 'none');
  }

  // ============================================
  // 테이블
  // ============================================
  function renderDetailTable(data) {
    var section = document.getElementById('detailSection');
    var tbody = document.getElementById('keywordDetailBody');
    if (!section || !tbody) return;

    var nodes = (data.nodes || []).filter(function(n) { return n.level > 0; })
      .sort(function(a, b) { return b.score - a.score; });
    if (nodes.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';

    var lvlLabels = { 1: '핵심', 2: '중간', 3: '세부' };
    var lvlClasses = { 1: 'mindmap-level-1', 2: 'mindmap-level-2', 3: 'mindmap-level-3' };

    tbody.innerHTML = nodes.map(function(n, i) {
      var ll = lvlLabels[n.level] || '-';
      var lc = lvlClasses[n.level] || '';
      var cat = n.category || '-';
      var url = 'https://search.naver.com/search.naver?query=' + encodeURIComponent(n.id);
      var srcLabel = translateSrc(n.source);
      var vol = n.monthly_search > 0 ? fmtNum(n.monthly_search) : '-';
      var comp = n.comp_idx || '-';
      var compCls = n.comp_idx === '높음' ? 'mindmap-comp-high' : (n.comp_idx === '중간' ? 'mindmap-comp-mid' : (n.comp_idx === '낮음' ? 'mindmap-comp-low' : ''));

      return '<tr>' +
        '<td class="text-center">' + (i + 1) + '</td>' +
        '<td>' + esc(n.id) +
          (cat !== '-' && cat !== '일반' ? ' <span class="mindmap-category-badge">' + esc(cat) + '</span>' : '') +
        '</td>' +
        '<td class="text-center"><span class="mindmap-level-badge ' + lc + '">' + ll + '</span></td>' +
        '<td class="text-right">' + n.score + '</td>' +
        '<td class="text-right">' + vol + '</td>' +
        '<td class="text-center"><span class="' + compCls + '">' + esc(comp) + '</span></td>' +
        '<td>' + esc(srcLabel) + '</td>' +
        '<td class="text-center"><a href="' + url + '" target="_blank" class="mindmap-search-link">검색</a></td>' +
        '</tr>';
    }).join('');
  }

  // ============================================
  // 캐시 (1시간 + 강제삭제)
  // ============================================
  function getCache(keyword) {
    try {
      var raw = localStorage.getItem('mm_' + keyword);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (Date.now() - c.ts > CACHE_TTL) { localStorage.removeItem('mm_' + keyword); return null; }
      return c.data;
    } catch (e) { return null; }
  }

  function setCache(keyword, data) {
    try { localStorage.setItem('mm_' + keyword, JSON.stringify({ ts: Date.now(), data: data })); }
    catch (e) {}
  }

  function clearCache(keyword) {
    try { localStorage.removeItem('mm_' + keyword); } catch (e) {}
  }

  // ============================================
  // UI
  // ============================================
  function showLoading(msg) {
    var o = document.getElementById('loadingOverlay');
    var t = document.getElementById('loadingText');
    var p = document.getElementById('placeholder');
    if (p) p.style.display = 'none';
    if (o) o.style.display = 'flex';
    if (t) t.textContent = msg || '분석 중...';
  }
  function hideLoading() {
    var o = document.getElementById('loadingOverlay');
    if (o) o.style.display = 'none';
  }
  function showError(msg) {
    var p = document.getElementById('placeholder');
    if (p) {
      p.style.display = 'flex';
      p.innerHTML = '<div class="mindmap-placeholder-icon">!</div><p>' + esc(msg) + '</p><p class="mindmap-placeholder-sub">잠시 후 다시 시도하세요</p>';
    }
  }
  function setText(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }
  function esc(t) { if (!t) return ''; var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  function fmtNum(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + '만';
    if (n >= 1000) return (n / 1000).toFixed(1) + '천';
    return String(n);
  }
  function fmtVol(n) {
    if (n >= 10000) return Math.round(n / 10000) + '만';
    if (n >= 1000) return Math.round(n / 1000) + 'k';
    return String(n);
  }
})();
