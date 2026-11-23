// On-demand index search and series filter. Stays hidden by default so the blog
// index remains clean and minimal; opens via '/' or ?q= / ?series= URL params.
(function () {
  'use strict';

  var drawer = document.getElementById('search-drawer');
  var form = drawer ? drawer.querySelector('.post-search') : null;
  if (!drawer || !form) return;

  var input = form.querySelector('input');
  var clear = form.querySelector('.search-clear');
  var closeBtn = form.querySelector('.search-close');
  var filters = drawer.querySelector('.post-filters');
  var filterButtons = filters ? Array.prototype.slice.call(filters.querySelectorAll('button[data-series]')) : [];
  var filterLabels = new Map(filterButtons.map(function (btn) {
    var clone = btn.cloneNode(true);
    clone.querySelectorAll('.tab-count').forEach(function (el) { el.remove(); });
    return [btn.dataset.series, clone.textContent.trim()];
  }));
  var activeSeries = 'all';
  var status = document.getElementById('search-status');
  var empty = drawer.querySelector('.search-empty');
  var indexRequest = null;
  var indexLoaded = false;
  var indexFailed = false;

  function normalize(text) {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase();
  }

  function keywords(query) {
    return normalize(query).split(/[^\p{L}\p{N}+#]+/u).filter(Boolean);
  }

  function highlight(element, text, terms) {
    if (!terms.length) {
      element.textContent = text;
      return;
    }
    var folded = '';
    var starts = [];
    var ends = [];
    var offset = 0;
    Array.from(text).forEach(function (character) {
      var normalized = normalize(character);
      for (var i = 0; i < normalized.length; i++) {
        starts.push(offset);
        ends.push(offset + character.length);
      }
      if (!normalized && ends.length) ends[ends.length - 1] = offset + character.length;
      folded += normalized;
      offset += character.length;
    });

    var ranges = [];
    terms.forEach(function (term) {
      var position = folded.indexOf(term);
      while (position !== -1) {
        ranges.push([starts[position], ends[position + term.length - 1]]);
        position = folded.indexOf(term, position + term.length);
      }
    });
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    ranges.forEach(function (range) {
      var previous = merged[merged.length - 1];
      if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
      else merged.push(range);
    });

    var fragment = document.createDocumentFragment();
    var cursor = 0;
    merged.forEach(function (range) {
      fragment.appendChild(document.createTextNode(text.slice(cursor, range[0])));
      var mark = document.createElement('mark');
      mark.textContent = text.slice(range[0], range[1]);
      fragment.appendChild(mark);
      cursor = range[1];
    });
    fragment.appendChild(document.createTextNode(text.slice(cursor)));
    element.replaceChildren(fragment);
  }

  function snippet(post, terms) {
    var bodyTerms = terms.filter(function (term) { return post.summary.indexOf(term) === -1; });
    if (!bodyTerms.length || !post.content) return post.excerpt;
    var folded = normalize(post.content);
    var positions = bodyTerms.map(function (term) { return folded.indexOf(term); })
      .filter(function (position) { return position !== -1; });
    if (!positions.length) return post.excerpt;
    var start = Math.max(0, Math.min.apply(null, positions) - 60);
    if (start > 0) {
      var nextSpace = post.content.indexOf(' ', start);
      if (nextSpace !== -1 && nextSpace - start < 25) start = nextSpace + 1;
    }
    var end = Math.min(post.content.length, start + 220);
    if (end < post.content.length) {
      var lastSpace = post.content.lastIndexOf(' ', end);
      if (lastSpace > start + 160) end = lastSpace;
    }
    return (start ? '…' : '') + post.content.slice(start, end) + (end < post.content.length ? '…' : '');
  }

  var decoder = document.createElement('textarea');
  function decode(text) {
    decoder.innerHTML = text;
    return decoder.value;
  }

  var posts = Array.prototype.map.call(document.querySelectorAll('#posts > li'), function (item) {
    var titleElement = item.querySelector('.post-index-title');
    var excerptElement = item.querySelector('.post-index-excerpt');
    var title = titleElement.textContent;
    var excerpt = excerptElement ? (excerptElement.dataset.excerpt || excerptElement.textContent || '') : '';
    if (!excerptElement) {
      excerptElement = document.createElement('p');
      excerptElement.className = 'post-index-excerpt';
      excerptElement.hidden = true;
      item.querySelector('.post-index-body').appendChild(excerptElement);
    }
    var summary = normalize(title + ' ' + excerpt);
    return {
      item: item,
      series: item.dataset.series || 'standalone',
      url: item.querySelector('.post-index-link').getAttribute('href'),
      title: title,
      titleElement: titleElement,
      excerpt: excerpt,
      excerptElement: excerptElement,
      summary: summary,
      content: '',
      text: summary
    };
  });

  function setSeries(series) {
    activeSeries = filterLabels.has(series) ? series : 'all';
    filterButtons.forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.series === activeSeries ? 'true' : 'false');
    });
  }

  function openDrawer(focusInput) {
    drawer.hidden = false;
    if (focusInput) {
      requestAnimationFrame(function () {
        input.focus();
      });
    }
  }

  function closeDrawer() {
    input.value = '';
    setSeries('all');
    search(true);
    drawer.hidden = true;
    if (window.location.hash === '#post-search') {
      var url = new URL(window.location.href);
      url.hash = '';
      window.history.replaceState(null, '', url);
    }
  }

  function render() {
    var query = input.value.trim();
    var terms = keywords(query);
    var count = 0;

    posts.forEach(function (post) {
      var seriesMatches = activeSeries === 'all' || post.series === activeSeries;
      var textMatches = terms.every(function (term) { return post.text.indexOf(term) !== -1; });
      var matches = seriesMatches && textMatches;
      post.item.hidden = !matches;
      if (matches) {
        count++;
        highlight(post.titleElement, post.title, terms);
        if (terms.length) {
          var text = snippet(post, terms);
          post.excerptElement.hidden = !text;
          highlight(post.excerptElement, text, terms);
        } else {
          post.excerptElement.hidden = true;
          post.excerptElement.textContent = '';
        }
      }
    });

    clear.hidden = !input.value;
    empty.hidden = (!terms.length && activeSeries === 'all') || count > 0 || !!indexRequest;
    var label = filterLabels.get(activeSeries) || '';
    if (!terms.length && activeSeries === 'all') {
      status.textContent = '';
    } else if (indexRequest) {
      status.textContent = 'Searching…';
    } else if (!terms.length) {
      status.textContent = activeSeries === 'standalone'
        ? count + (count === 1 ? ' standalone post.' : ' standalone posts.')
        : count + (count === 1 ? ' post' : ' posts') + ' in “' + label + '”.';
    } else {
      status.textContent = count + (count === 1 ? ' post' : ' posts') + ' found for “' + query + '”'
        + (activeSeries !== 'all' ? (activeSeries === 'standalone' ? ' in standalone posts' : ' in “' + label + '”') : '') + '.';
      if (indexFailed) status.textContent += ' Article text is unavailable; searching titles and summaries.';
    }
  }

  function loadIndex() {
    if (indexLoaded || indexRequest || !input.value.trim()) return;
    indexFailed = false;
    indexRequest = fetch(form.dataset.indexUrl)
      .then(function (response) {
        if (!response.ok) throw new Error('Search index unavailable');
        return response.json();
      })
      .then(function (entries) {
        var content = new Map(entries.map(function (entry) { return [entry.url, entry]; }));
        posts.forEach(function (post) {
          var entry = content.get(post.url);
          post.content = entry ? decode(entry.content) : '';
          post.text = post.summary + ' ' + normalize(post.content + ' ' + (entry ? entry.keywords || '' : ''));
        });
        indexLoaded = true;
        indexRequest = null;
        render();
      })
      .catch(function () {
        indexRequest = null;
        indexFailed = true;
        render();
      });
  }

  function search(updateURL) {
    if (updateURL) {
      var url = new URL(window.location.href);
      if (input.value.trim()) url.searchParams.set('q', input.value.trim());
      else url.searchParams.delete('q');
      if (activeSeries !== 'all') url.searchParams.set('series', activeSeries);
      else url.searchParams.delete('series');
      window.history.replaceState(null, '', url);
    }
    loadIndex();
    render();
  }

  document.addEventListener('keydown', function (event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === '/' && !event.target.isContentEditable && !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) {
      event.preventDefault();
      openDrawer(true);
    } else if (event.key === 'Escape' && !drawer.hidden) {
      event.preventDefault();
      if (input.value) {
        input.value = '';
        search(true);
        input.focus();
      } else {
        closeDrawer();
      }
    }
  });

  filterButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = btn.dataset.series;
      setSeries(next === activeSeries && next !== 'all' ? 'all' : next);
      search(true);
    });
  });

  input.addEventListener('input', function () { search(true); });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    search(true);
  });
  clear.addEventListener('click', function () {
    input.value = '';
    search(true);
    input.focus();
  });
  if (closeBtn) {
    closeBtn.addEventListener('click', closeDrawer);
  }
  window.addEventListener('popstate', function () {
    var params = new URL(window.location.href).searchParams;
    var q = params.get('q') || '';
    var s = params.get('series') || 'all';
    input.value = q;
    setSeries(s);
    if (q || s !== 'all') openDrawer(false);
    search(false);
  });

  var initialParams = new URL(window.location.href).searchParams;
  var initQ = initialParams.get('q') || '';
  var initSeries = initialParams.get('series') || 'all';
  var wantsHash = window.location.hash === '#post-search';
  input.value = initQ;
  setSeries(initSeries);
  if (initQ || initSeries !== 'all' || wantsHash) {
    openDrawer(wantsHash);
    search(false);
  }
})();
