/**
 * 키워드 마인드맵 v4
 * - D3 Force 마인드맵 + 트리맵 뷰 전환
 * - 출처 한글화, 검색량/경쟁도 표시 개선
 * - 마인드맵 스타일: 방사형 / 트리맵
 */
(function() {
  var WORKER_URL = 'https://keywordjjbb.dampd21.workers.dev';
  var CACHE_TTL = 24 * 60 * 60 * 1000;

  var simulation = null;
  var svg = null;
  var svgGroup = null;
  var zoom = null;
  var currentData = null;
  var showLabels = true;
  var currentView = 'force'; // 'force' | 'treemap'

  var LEVEL_COLORS = {
    0: '#ff6b6b',
    1: '#00d4ff',
    2: '#4ecdc4',
    3: '#ffe66d'
  };

  var SOURCE_LABELS = {
    'ads': '검색광고',
    'auto': '자동완성',
    'blog': '블로그',
    'ads+auto': '광고+자동완성',
    'ads+blog': '광고+블로그',
    'auto+blog': '자동완성+블로그',
    'ads+auto+blog': '광고+자동완성+블로그',
    'gemini': 'AI분석',
    'fallback': '텍스트분석'
  };

  document.addEventListener('DOMContentLoaded', function() {
    initEventListeners();
  });

  function initEventListeners() {
    var searchBtn = document.getElementById('searchBtn');
    var keywordInput = document.getElementById('keywordInput');
    var resetZoomBtn = document.getElementById('resetZoomBtn');
    var toggleLabelsBtn = document.getElementById('toggleLabelsBtn');
    var toggleViewBtn = document.getElementById('toggleViewBtn');

    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    if (keywordInput) {
      keywordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
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

    document.querySelectorAll('.mindmap-hint-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var kw = btn.dataset.keyword;
        if (kw) {
          var input = document.getElementById('keywordInput');
          if (input) input.value = kw;
          doSearch();
        }
      });
    });
  }

  function doSearch() {
    var input = document.getElementById('keywordInput');
    if (!input) return;
    var keyword = input.value.trim();
    if (!keyword) { input.focus(); return; }

    var cached = getCache(keyword);
    if (cached) { renderResult(cached); return; }

    showLoading('4개 소스에서 키워드 수집 중... (5~10초)');

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
    var metadata = data.metadata || {};
    var sources = metadata.sources || {};

    setText('industryType', (industry.type || '일반') +
      (industry.sub_category ? ' / ' + industry.sub_category : ''));
    setText('industryConfidence',
      industry.confidence > 0 ? Math.round(industry.confidence * 100) + '%' : '-');
    setText('totalKeywords', (metadata.total_keywords || 0) + '개');
    setText('genTime', (metadata.generation_time || 0).toFixed(1) + '초');

    var modeLabel = metadata.analysis_mode === 'gemini' ? 'AI분석' : '폴백분석';
    var sourceText = '자동완성 ' + (sources.autocomplete || 0) +
      ' · 블로그 ' + (sources.blog_titles || 0) +
      ' · 본문 ' + (sources.blog_bodies || 0) +
      ' · 검색광고 ' + (sources.naver_ads || 0) +
      ' (' + modeLabel + ')';
    setText('sourceInfo', sourceText);
  }

  // ============================================
  // 시각화 렌더링 (뷰 전환)
  // ============================================
  function renderVisualization(data) {
    if (currentView === 'treemap') {
      renderTreemap(data);
    } else {
      renderMindmap(data);
    }
  }

  // ============================================
  // D3 Force 마인드맵
  // ============================================
  function renderMindmap(data) {
    var container = document.getElementById('mindmapContainer');
    if (!container) return;
    cleanupVisualization(container);

    var width = container.clientWidth || 800;
    var height = container.clientHeight || 550;
    var nodes = data.nodes || [];
    var links = data.links || [];
    if (nodes.length === 0) return;

    var nodesCopy = nodes.map(function(n) { return Object.assign({}, n); });
    var linksCopy = links.map(function(l) { return Object.assign({}, l); });

    var tooltip = createTooltip(container);

    svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('width', '100%')
      .style('height', '100%');

    zoom = d3.zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', function(event) { svgGroup.attr('transform', event.transform); });
    svg.call(zoom);
    svgGroup = svg.append('g');

    // 링크
    var linkEls = svgGroup.append('g').selectAll('line')
      .data(linksCopy).enter().append('line')
      .attr('stroke', function(d) { return 'rgba(255,255,255,' + (d.strength * 0.3 + 0.05) + ')'; })
      .attr('stroke-width', function(d) { return Math.max(0.5, d.strength * 3); });

    // 노드 그룹
    var nodeEls = svgGroup.append('g').selectAll('g')
      .data(nodesCopy).enter().append('g')
      .attr('class', 'mindmap-node')
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', function(event, d) {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', function(event, d) { d.fx = event.x; d.fy = event.y; })
        .on('end', function(event, d) {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
      )
      .on('click', function(event, d) {
        if (d.level > 0) {
          window.open('https://search.naver.com/search.naver?query=' + encodeURIComponent(d.id), '_blank');
        }
      })
      .on('mouseenter', function(event, d) { showTooltip(tooltip, event, d, container); })
      .on('mouseleave', function() { tooltip.style.display = 'none'; });

    // 원
    nodeEls.append('circle')
      .attr('r', function(d) { return d.size / 2.5; })
      .attr('fill', function(d) { return LEVEL_COLORS[d.level] || '#888'; })
      .attr('fill-opacity', function(d) { return d.level === 0 ? 0.9 : 0.65; })
      .attr('stroke', function(d) { return LEVEL_COLORS[d.level] || '#888'; })
      .attr('stroke-width', function(d) { return d.level === 0 ? 3 : 1.5; })
      .attr('stroke-opacity', 0.5);

    // 라벨
    nodeEls.append('text')
      .attr('class', 'mindmap-label')
      .attr('text-anchor', 'middle')
      .attr('dy', function(d) { return d.level === 0 ? 5 : (d.size / 2.5) + 14; })
      .attr('fill', function(d) { return d.level === 0 ? '#fff' : '#ccc'; })
      .attr('font-size', function(d) {
        if (d.level === 0) return '14px';
        if (d.level === 1) return '11px';
        return '10px';
      })
      .attr('font-weight', function(d) { return d.level <= 1 ? '700' : '400'; })
      .text(function(d) {
        return d.id.length > 12 ? d.id.slice(0, 12) + '..' : d.id;
      })
      .style('pointer-events', 'none');

    // 검색량 라벨
    nodeEls.filter(function(d) { return d.level > 0 && d.monthly_search > 0; })
      .append('text')
      .attr('class', 'mindmap-volume-label')
      .attr('text-anchor', 'middle')
      .attr('dy', function(d) { return (d.size / 2.5) + 26; })
      .attr('fill', '#888')
      .attr('font-size', '8px')
      .text(function(d) { return formatVolume(d.monthly_search); })
      .style('pointer-events', 'none');

    // Force Simulation
    simulation = d3.forceSimulation(nodesCopy)
      .force('link', d3.forceLink(linksCopy)
        .id(function(d) { return d.id; })
        .distance(function(d) { return d.distance || 120; })
        .strength(function(d) { return d.strength * 0.3; })
      )
      .force('charge', d3.forceManyBody().strength(function(d) { return d.level === 0 ? -500 : -180; }))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(function(d) { return (d.size / 2.5) + 10; }))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03))
      .on('tick', function() {
        linkEls
          .attr('x1', function(d) { return d.source.x; })
          .attr('y1', function(d) { return d.source.y; })
          .attr('x2', function(d) { return d.target.x; })
          .attr('y2', function(d) { return d.target.y; });
        nodeEls.attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
      });

    setTimeout(resetZoom, 1500);
  }

  // ============================================
  // 트리맵 뷰
  // ============================================
  function renderTreemap(data) {
    var container = document.getElementById('mindmapContainer');
    if (!container) return;
    cleanupVisualization(container);

    var width = container.clientWidth || 800;
    var height = container.clientHeight || 550;
    var nodes = (data.nodes || []).filter(function(n) { return n.level > 0; });
    if (nodes.length === 0) return;

    var tooltip = createTooltip(container);

    // 카테고리별 그룹
    var catMap = {};
    nodes.forEach(function(n) {
      var cat = n.category || '일반';
      if (!catMap[cat]) catMap[cat] = [];
      catMap[cat].push(n);
    });

    var hierarchyData = {
      name: data.center || '키워드',
      children: Object.keys(catMap).map(function(cat) {
        return {
          name: cat,
          children: catMap[cat].map(function(n) {
            return {
              name: n.id,
              value: n.score,
              level: n.level,
              monthly_search: n.monthly_search || 0,
              comp_idx: n.comp_idx || '',
              source: n.source || '',
              category: n.category || '',
              score: n.score
            };
          })
        };
      })
    };

    var root = d3.hierarchy(hierarchyData)
      .sum(function(d) { return d.value || 0; })
      .sort(function(a, b) { return b.value - a.value; });

    d3.treemap()
      .size([width, height])
      .padding(3)
      .paddingTop(20)
      .round(true)(root);

    svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('width', '100%')
      .style('height', '100%');

    // 카테고리 그룹 배경
    var catGroups = svg.selectAll('g.cat-group')
      .data(root.children || [])
      .enter().append('g')
      .attr('class', 'cat-group');

    catGroups.append('rect')
      .attr('x', function(d) { return d.x0; })
      .attr('y', function(d) { return d.y0; })
      .attr('width', function(d) { return d.x1 - d.x0; })
      .attr('height', function(d) { return d.y1 - d.y0; })
      .attr('fill', 'rgba(255,255,255,0.03)')
      .attr('stroke', 'rgba(255,255,255,0.08)')
      .attr('rx', 4);

    catGroups.append('text')
      .attr('x', function(d) { return d.x0 + 6; })
      .attr('y', function(d) { return d.y0 + 14; })
      .attr('fill', '#888')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .text(function(d) { return d.data.name; });

    // 리프 노드
    var leaves = svg.selectAll('g.leaf')
      .data(root.leaves())
      .enter().append('g')
      .attr('class', 'leaf')
      .style('cursor', 'pointer')
      .on('click', function(event, d) {
        window.open('https://search.naver.com/search.naver?query=' + encodeURIComponent(d.data.name), '_blank');
      })
      .on('mouseenter', function(event, d) {
        var nodeData = {
          id: d.data.name,
          level: d.data.level,
          score: d.data.score,
          category: d.data.category,
          source: d.data.source,
          monthly_search: d.data.monthly_search,
          comp_idx: d.data.comp_idx
        };
        showTooltip(tooltip, event, nodeData, container);
      })
      .on('mouseleave', function() { tooltip.style.display = 'none'; });

    leaves.append('rect')
      .attr('x', function(d) { return d.x0; })
      .attr('y', function(d) { return d.y0; })
      .attr('width', function(d) { return Math.max(0, d.x1 - d.x0); })
      .attr('height', function(d) { return Math.max(0, d.y1 - d.y0); })
      .attr('fill', function(d) { return LEVEL_COLORS[d.data.level] || '#888'; })
      .attr('fill-opacity', 0.25)
      .attr('stroke', function(d) { return LEVEL_COLORS[d.data.level] || '#888'; })
      .attr('stroke-opacity', 0.5)
      .attr('rx', 3);

    leaves.append('text')
      .attr('x', function(d) { return d.x0 + 4; })
      .attr('y', function(d) { return d.y0 + 14; })
      .attr('fill', '#e0e0e0')
      .attr('font-size', function(d) {
        var w = d.x1 - d.x0;
        if (w > 120) return '11px';
        if (w > 80) return '9px';
        return '8px';
      })
      .attr('font-weight', function(d) { return d.data.level === 1 ? '700' : '400'; })
      .text(function(d) {
        var w = d.x1 - d.x0;
        var maxChars = Math.floor(w / 8);
        var name = d.data.name;
        return name.length > maxChars ? name.slice(0, maxChars - 1) + '..' : name;
      })
      .style('pointer-events', 'none');

    // 검색량 표시
    leaves.filter(function(d) {
      return d.data.monthly_search > 0 && (d.y1 - d.y0) > 28;
    }).append('text')
      .attr('x', function(d) { return d.x0 + 4; })
      .attr('y', function(d) { return d.y0 + 26; })
      .attr('fill', '#888')
      .attr('font-size', '8px')
      .text(function(d) { return formatVolume(d.data.monthly_search) + '/월'; })
      .style('pointer-events', 'none');
  }


  // ============================================
  // 공통 유틸
  // ============================================
  function cleanupVisualization(container) {
    var oldSvg = container.querySelector('svg');
    if (oldSvg) oldSvg.remove();
    var oldTooltip = document.getElementById('mindmapTooltip');
    if (oldTooltip) oldTooltip.remove();
    if (simulation) { simulation.stop(); simulation = null; }
  }

  function createTooltip(container) {
    var tooltip = document.createElement('div');
    tooltip.id = 'mindmapTooltip';
    tooltip.className = 'mindmap-tooltip';
    tooltip.style.display = 'none';
    container.appendChild(tooltip);
    return tooltip;
  }

  function showTooltip(tooltip, event, d, container) {
    if (d.level === 0) { tooltip.style.display = 'none'; return; }

    var levelLabels = { 1: '핵심', 2: '중간', 3: '세부' };
    var sourceLabel = translateSource(d.source);

    var html = '<div class="mindmap-tooltip-title">' + escapeHtml(d.id) + '</div>';
    html += '<div class="mindmap-tooltip-row"><span>연관도</span><span>' + d.score + '점</span></div>';
    html += '<div class="mindmap-tooltip-row"><span>레벨</span><span>' + (levelLabels[d.level] || '-') + '</span></div>';

    if (d.category && d.category !== '일반') {
      html += '<div class="mindmap-tooltip-row"><span>분류</span><span>' + escapeHtml(d.category) + '</span></div>';
    }
    if (d.monthly_search > 0) {
      html += '<div class="mindmap-tooltip-row mindmap-tooltip-highlight"><span>월간 검색량</span><span>' + formatNumber(d.monthly_search) + '</span></div>';
    }
    if (d.comp_idx) {
      var compClass = d.comp_idx === '높음' ? ' mindmap-comp-high' : (d.comp_idx === '중간' ? ' mindmap-comp-mid' : ' mindmap-comp-low');
      html += '<div class="mindmap-tooltip-row"><span>경쟁도</span><span class="' + compClass + '">' + escapeHtml(d.comp_idx) + '</span></div>';
    }
    html += '<div class="mindmap-tooltip-row mindmap-tooltip-source"><span>출처</span><span>' + escapeHtml(sourceLabel) + '</span></div>';
    html += '<div class="mindmap-tooltip-hint">클릭 → 네이버 검색</div>';

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';

    var rect = container.getBoundingClientRect();
    var x = event.clientX - rect.left + 15;
    var y = event.clientY - rect.top - 10;
    if (x + 250 > rect.width) x = event.clientX - rect.left - 260;
    if (y + 200 > rect.height) y = event.clientY - rect.top - 200;
    tooltip.style.left = Math.max(0, x) + 'px';
    tooltip.style.top = Math.max(0, y) + 'px';
  }

  function translateSource(source) {
    if (!source) return '-';
    if (SOURCE_LABELS[source]) return SOURCE_LABELS[source];
    // 조합 번역
    var parts = source.split('+');
    var translated = parts.map(function(p) {
      var map = { 'ads': '검색광고', 'auto': '자동완성', 'blog': '블로그', 'gemini': 'AI분석', 'fallback': '텍스트' };
      return map[p.trim()] || p.trim();
    });
    return translated.join(' + ');
  }

  function resetZoom() {
    if (!svg || !zoom) return;
    svg.transition().duration(500)
      .call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(1));
  }

  function toggleLabels() {
    showLabels = !showLabels;
    d3.selectAll('.mindmap-label').style('display', showLabels ? 'block' : 'none');
    d3.selectAll('.mindmap-volume-label').style('display', showLabels ? 'block' : 'none');
  }

  // ============================================
  // 상세 테이블
  // ============================================
  function renderDetailTable(data) {
    var section = document.getElementById('detailSection');
    var tbody = document.getElementById('keywordDetailBody');
    if (!section || !tbody) return;

    var nodes = (data.nodes || []).filter(function(n) { return n.level > 0; })
      .sort(function(a, b) { return b.score - a.score; });

    if (nodes.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';

    var levelLabels = { 1: '핵심', 2: '중간', 3: '세부' };
    var levelClasses = { 1: 'mindmap-level-1', 2: 'mindmap-level-2', 3: 'mindmap-level-3' };

    tbody.innerHTML = nodes.map(function(node, idx) {
      var levelLabel = levelLabels[node.level] || '-';
      var levelClass = levelClasses[node.level] || '';
      var category = node.category || '-';
      var searchUrl = 'https://search.naver.com/search.naver?query=' + encodeURIComponent(node.id);
      var sourceLabel = translateSource(node.source);

      var volumeText = node.monthly_search > 0 ? formatNumber(node.monthly_search) : '-';
      var compText = node.comp_idx || '-';
      var compClass = '';
      if (node.comp_idx === '높음') compClass = 'mindmap-comp-high';
      else if (node.comp_idx === '중간') compClass = 'mindmap-comp-mid';
      else if (node.comp_idx === '낮음') compClass = 'mindmap-comp-low';

      return '<tr>' +
        '<td class="text-center">' + (idx + 1) + '</td>' +
        '<td>' + escapeHtml(node.id) +
          (category !== '-' && category !== '일반'
            ? ' <span class="mindmap-category-badge">' + escapeHtml(category) + '</span>' : '') +
        '</td>' +
        '<td class="text-center"><span class="mindmap-level-badge ' + levelClass + '">' + levelLabel + '</span></td>' +
        '<td class="text-right">' + node.score + '</td>' +
        '<td class="text-right">' + volumeText + '</td>' +
        '<td class="text-center"><span class="' + compClass + '">' + escapeHtml(compText) + '</span></td>' +
        '<td>' + escapeHtml(sourceLabel) + '</td>' +
        '<td class="text-center"><a href="' + searchUrl + '" target="_blank" class="mindmap-search-link">검색</a></td>' +
        '</tr>';
    }).join('');
  }

  // ============================================
  // 캐시
  // ============================================
  function getCache(keyword) {
    try {
      var key = 'mindmap_' + keyword;
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (Date.now() - cached.timestamp > CACHE_TTL) {
        localStorage.removeItem(key);
        return null;
      }
      return cached.data;
    } catch (e) { return null; }
  }

  function setCache(keyword, data) {
    try {
      localStorage.setItem('mindmap_' + keyword, JSON.stringify({
        timestamp: Date.now(), data: data
      }));
    } catch (e) {}
  }

  // ============================================
  // UI 헬퍼
  // ============================================
  function showLoading(msg) {
    var overlay = document.getElementById('loadingOverlay');
    var text = document.getElementById('loadingText');
    var placeholder = document.getElementById('placeholder');
    if (placeholder) placeholder.style.display = 'none';
    if (overlay) overlay.style.display = 'flex';
    if (text) text.textContent = msg || '분석 중...';
  }
  function hideLoading() {
    var overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
  }
  function showError(msg) {
    var placeholder = document.getElementById('placeholder');
    if (placeholder) {
      placeholder.style.display = 'flex';
      placeholder.innerHTML =
        '<div class="mindmap-placeholder-icon">!</div>' +
        '<p>' + escapeHtml(msg) + '</p>' +
        '<p class="mindmap-placeholder-sub">잠시 후 다시 시도하세요</p>';
    }
  }
  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  function formatNumber(num) {
    if (num >= 10000) return (num / 10000).toFixed(1) + '만';
    if (num >= 1000) return (num / 1000).toFixed(1) + '천';
    return String(num);
  }
  function formatVolume(num) {
    if (num >= 10000) return Math.round(num / 10000) + '만';
    if (num >= 1000) return Math.round(num / 1000) + 'k';
    return String(num);
  }
})();
