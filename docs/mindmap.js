/**
 * 키워드 마인드맵 v3
 * - Cloudflare Worker API 호출 (4소스: 자동완성+블로그+본문+검색광고)
 * - D3.js Force Simulation 마인드맵
 * - 월간검색량/경쟁도 표시
 * - localStorage 캐싱
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

  var LEVEL_COLORS = {
    0: '#ff6b6b',
    1: '#00d4ff',
    2: '#4ecdc4',
    3: '#ffe66d'
  };

  // ============================================
  // 초기화
  // ============================================

  document.addEventListener('DOMContentLoaded', function() {
    initEventListeners();
  });

  function initEventListeners() {
    var searchBtn = document.getElementById('searchBtn');
    var keywordInput = document.getElementById('keywordInput');
    var resetZoomBtn = document.getElementById('resetZoomBtn');
    var toggleLabelsBtn = document.getElementById('toggleLabelsBtn');

    if (searchBtn) {
      searchBtn.addEventListener('click', function() {
        doSearch();
      });
    }

    if (keywordInput) {
      keywordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSearch();
        }
      });
    }

    if (resetZoomBtn) {
      resetZoomBtn.addEventListener('click', function() {
        resetZoom();
      });
    }

    if (toggleLabelsBtn) {
      toggleLabelsBtn.addEventListener('click', function() {
        toggleLabels();
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


  // ============================================
  // 검색 실행
  // ============================================

  function doSearch() {
    var input = document.getElementById('keywordInput');
    if (!input) return;

    var keyword = input.value.trim();
    if (!keyword) {
      input.focus();
      return;
    }

    // 캐시 확인
    var cached = getCache(keyword);
    if (cached) {
      renderResult(cached);
      return;
    }

    showLoading('키워드 분석 중... (3~8초 소요)');
    hideError();

    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: keyword })
    })
    .then(function(resp) {
      if (!resp.ok) {
        return resp.json().then(function(data) {
          throw new Error(data.error || 'API 오류 (' + resp.status + ')');
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


  // ============================================
  // 결과 렌더링
  // ============================================

  function renderResult(data) {
    currentData = data;

    updateInfoBar(data);
    renderMindmap(data);
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

    var sourceText = '자동완성 ' + (sources.autocomplete || 0) +
      ' / 블로그 ' + (sources.blog_titles || 0) +
      ' / 본문 ' + (sources.blog_bodies || 0) +
      ' / 검색광고 ' + (sources.naver_ads || 0);
    setText('sourceInfo', sourceText);
  }


  // ============================================
  // D3.js 마인드맵
  // ============================================

  function renderMindmap(data) {
    var container = document.getElementById('mindmapContainer');
    if (!container) return;

    // 기존 SVG 제거
    var oldSvg = container.querySelector('svg');
    if (oldSvg) oldSvg.remove();

    // 툴팁 제거
    var oldTooltip = document.getElementById('mindmapTooltip');
    if (oldTooltip) oldTooltip.remove();

    // 시뮬레이션 정리
    if (simulation) {
      simulation.stop();
      simulation = null;
    }

    var width = container.clientWidth || 800;
    var height = container.clientHeight || 600;

    var nodes = data.nodes || [];
    var links = data.links || [];

    if (nodes.length === 0) return;

    // 노드/링크 복사 (D3가 변형하므로)
    var nodesCopy = nodes.map(function(n) {
      return Object.assign({}, n);
    });
    var linksCopy = links.map(function(l) {
      return Object.assign({}, l);
    });

    // 툴팁 생성
    var tooltip = document.createElement('div');
    tooltip.id = 'mindmapTooltip';
    tooltip.className = 'mindmap-tooltip';
    tooltip.style.display = 'none';
    container.appendChild(tooltip);

    // SVG 생성
    svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('width', '100%')
      .style('height', '100%');

    // 줌
    zoom = d3.zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', function(event) {
        svgGroup.attr('transform', event.transform);
      });

    svg.call(zoom);
    svgGroup = svg.append('g');

    // 링크 렌더링
    var linkElements = svgGroup.append('g')
      .attr('class', 'mindmap-links')
      .selectAll('line')
      .data(linksCopy)
      .enter()
      .append('line')
      .attr('stroke', function(d) {
        return 'rgba(255,255,255,' + (d.strength * 0.3) + ')';
      })
      .attr('stroke-width', function(d) {
        return Math.max(0.5, d.strength * 3);
      });

    // 노드 그룹
    var nodeGroups = svgGroup.append('g')
      .attr('class', 'mindmap-nodes')
      .selectAll('g')
      .data(nodesCopy)
      .enter()
      .append('g')
      .attr('class', 'mindmap-node')
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded)
      )
      .on('click', function(event, d) {
        if (d.level > 0) {
          var url = 'https://search.naver.com/search.naver?query=' +
            encodeURIComponent(d.id);
          window.open(url, '_blank');
        }
      })
      .on('mouseenter', function(event, d) {
        showTooltip(tooltip, event, d, container);
      })
      .on('mouseleave', function() {
        tooltip.style.display = 'none';
      });

    // 노드 원
    nodeGroups.append('circle')
      .attr('r', function(d) { return d.size / 2.5; })
      .attr('fill', function(d) { return LEVEL_COLORS[d.level] || '#888'; })
      .attr('fill-opacity', function(d) { return d.level === 0 ? 0.9 : 0.7; })
      .attr('stroke', function(d) { return LEVEL_COLORS[d.level] || '#888'; })
      .attr('stroke-width', function(d) { return d.level === 0 ? 3 : 1.5; })
      .attr('stroke-opacity', 0.5);

    // 노드 라벨
    nodeGroups.append('text')
      .attr('class', 'mindmap-label')
      .attr('text-anchor', 'middle')
      .attr('dy', function(d) {
        return d.level === 0 ? 5 : (d.size / 2.5) + 14;
      })
      .attr('fill', function(d) { return d.level === 0 ? '#fff' : '#ccc'; })
      .attr('font-size', function(d) {
        if (d.level === 0) return '14px';
        if (d.level === 1) return '11px';
        return '10px';
      })
      .attr('font-weight', function(d) { return d.level <= 1 ? '700' : '400'; })
      .text(function(d) {
        var label = d.id;
        if (d.level === 0) return label;
        return label.length > 10 ? label.slice(0, 10) + '..' : label;
      })
      .style('pointer-events', 'none');

    // 검색량 있는 노드에 작은 검색량 라벨 추가
    nodeGroups.filter(function(d) {
      return d.level > 0 && d.monthly_search > 0;
    }).append('text')
      .attr('class', 'mindmap-volume-label')
      .attr('text-anchor', 'middle')
      .attr('dy', function(d) {
        return (d.size / 2.5) + 26;
      })
      .attr('fill', '#888')
      .attr('font-size', '8px')
      .text(function(d) {
        return formatVolume(d.monthly_search);
      })
      .style('pointer-events', 'none');

    // 중심 노드 라벨을 원 안에
    nodeGroups.filter(function(d) { return d.level === 0; })
      .select('text')
      .attr('dy', 5);

    // Force Simulation
    simulation = d3.forceSimulation(nodesCopy)
      .force('link', d3.forceLink(linksCopy)
        .id(function(d) { return d.id; })
        .distance(function(d) { return d.distance || 120; })
        .strength(function(d) { return d.strength * 0.3; })
      )
      .force('charge', d3.forceManyBody()
        .strength(function(d) {
          return d.level === 0 ? -400 : -150;
        })
      )
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide()
        .radius(function(d) { return (d.size / 2.5) + 8; })
      )
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03))
      .on('tick', function() {
        linkElements
          .attr('x1', function(d) { return d.source.x; })
          .attr('y1', function(d) { return d.source.y; })
          .attr('x2', function(d) { return d.target.x; })
          .attr('y2', function(d) { return d.target.y; });

        nodeGroups
          .attr('transform', function(d) {
            return 'translate(' + d.x + ',' + d.y + ')';
          });
      });

    // 초기 줌 맞추기
    setTimeout(function() {
      resetZoom();
    }, 1500);
  }

  // 툴팁 표시
  function showTooltip(tooltip, event, d, container) {
    if (d.level === 0) {
      tooltip.style.display = 'none';
      return;
    }

    var levelLabels = { 1: '핵심', 2: '중간', 3: '세부' };
    var levelLabel = levelLabels[d.level] || '-';

    var html = '<div class="mindmap-tooltip-title">' + escapeHtml(d.id) + '</div>';
    html += '<div class="mindmap-tooltip-row"><span>연관도 점수</span><span>' + d.score + '</span></div>';
    html += '<div class="mindmap-tooltip-row"><span>레벨</span><span>' + levelLabel + '</span></div>';

    if (d.category && d.category !== '일반') {
      html += '<div class="mindmap-tooltip-row"><span>분류</span><span>' + escapeHtml(d.category) + '</span></div>';
    }

    if (d.monthly_search > 0) {
      html += '<div class="mindmap-tooltip-row mindmap-tooltip-highlight"><span>월간 검색량</span><span>' + formatNumber(d.monthly_search) + '</span></div>';
    }

    if (d.comp_idx) {
      var compClass = '';
      if (d.comp_idx === '높음') compClass = ' mindmap-comp-high';
      else if (d.comp_idx === '중간') compClass = ' mindmap-comp-mid';
      else compClass = ' mindmap-comp-low';
      html += '<div class="mindmap-tooltip-row"><span>경쟁도</span><span class="' + compClass + '">' + escapeHtml(d.comp_idx) + '</span></div>';
    }

    if (d.source) {
      html += '<div class="mindmap-tooltip-row mindmap-tooltip-source"><span>출처</span><span>' + escapeHtml(d.source) + '</span></div>';
    }

    html += '<div class="mindmap-tooltip-hint">클릭하면 네이버 검색</div>';

    tooltip.innerHTML = html;
    tooltip.style.display = 'block';

    // 위치 계산
    var rect = container.getBoundingClientRect();
    var x = event.clientX - rect.left + 15;
    var y = event.clientY - rect.top - 10;

    // 오른쪽 넘침 방지
    if (x + 220 > rect.width) {
      x = event.clientX - rect.left - 230;
    }
    // 아래쪽 넘침 방지
    if (y + 200 > rect.height) {
      y = event.clientY - rect.top - 180;
    }

    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  // 드래그 핸들러
  function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  // 줌 리셋
  function resetZoom() {
    if (!svg || !zoom) return;

    svg.transition()
      .duration(500)
      .call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(1));
  }

  // 라벨 토글
  function toggleLabels() {
    showLabels = !showLabels;
    d3.selectAll('.mindmap-label')
      .style('display', showLabels ? 'block' : 'none');
    d3.selectAll('.mindmap-volume-label')
      .style('display', showLabels ? 'block' : 'none');
  }


  // ============================================
  // 상세 테이블
  // ============================================

  function renderDetailTable(data) {
    var section = document.getElementById('detailSection');
    var tbody = document.getElementById('keywordDetailBody');
    if (!section || !tbody) return;

    var nodes = (data.nodes || []).filter(function(n) {
      return n.level > 0;
    }).sort(function(a, b) {
      return b.score - a.score;
    });

    if (nodes.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';

    var levelLabels = { 1: '핵심', 2: '중간', 3: '세부' };
    var levelClasses = { 1: 'mindmap-level-1', 2: 'mindmap-level-2', 3: 'mindmap-level-3' };

    tbody.innerHTML = nodes.map(function(node, idx) {
      var levelLabel = levelLabels[node.level] || '-';
      var levelClass = levelClasses[node.level] || '';
      var category = node.category || '-';
      var searchUrl = 'https://search.naver.com/search.naver?query=' +
        encodeURIComponent(node.id);

      // 월간검색량
      var volumeText = '-';
      if (node.monthly_search > 0) {
        volumeText = formatNumber(node.monthly_search);
      }

      // 경쟁도
      var compText = '-';
      var compClass = '';
      if (node.comp_idx) {
        compText = node.comp_idx;
        if (node.comp_idx === '높음') compClass = 'mindmap-comp-high';
        else if (node.comp_idx === '중간') compClass = 'mindmap-comp-mid';
        else compClass = 'mindmap-comp-low';
      }

      return '<tr>' +
        '<td class="text-center">' + (idx + 1) + '</td>' +
        '<td>' + escapeHtml(node.id) +
          (category !== '-' && category !== '일반'
            ? ' <span class="mindmap-category-badge">' + escapeHtml(category) + '</span>'
            : '') +
        '</td>' +
        '<td class="text-center"><span class="mindmap-level-badge ' + levelClass + '">' + levelLabel + '</span></td>' +
        '<td class="text-right">' + node.score + '</td>' +
        '<td class="text-right">' + volumeText + '</td>' +
        '<td class="text-center"><span class="' + compClass + '">' + escapeHtml(compText) + '</span></td>' +
        '<td>' + escapeHtml(node.source || '-') + '</td>' +
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
    } catch (e) {
      return null;
    }
  }

  function setCache(keyword, data) {
    try {
      var key = 'mindmap_' + keyword;
      localStorage.setItem(key, JSON.stringify({
        timestamp: Date.now(),
        data: data
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

  function hideError() {}

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
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '만';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + '천';
    }
    return String(num);
  }

  function formatVolume(num) {
    if (num >= 10000) {
      return Math.round(num / 10000) + '만';
    }
    if (num >= 1000) {
      return Math.round(num / 1000) + 'k';
    }
    return String(num);
  }

})();
