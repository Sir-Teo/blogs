// Filter the existing index, loading article text only when a reader searches.
(function () {
  'use strict';

  var form = document.querySelector('.post-search');
  if (!form) return;

  var input = form.querySelector('input');
  var clear = form.querySelector('.search-clear');
  var shortcut = form.querySelector('.search-shortcut');
  var status = document.getElementById('search-status');
  var empty = document.querySelector('.search-empty');
  var indexRequest = null;
  var indexLoaded = false;
  var indexFailed = false;

  function normalize(text) {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase();
  }

  function keywords(query) {
    // Treat punctuation as separators while preserving names such as C++ and C#.
    return normalize(query).split(/[^\p{L}\p{N}+#]+/u).filter(Boolean);
  }

  function highlight(element, text, terms) {
    if (!terms.length) {
      element.textContent = text;
      return;
    }
    // Map folded characters back to their original positions, including accents.
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
    // Explain matches found deeper in an article with a short passage around one.
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
    var end = Math.min(post.content.length, start + 240);
    if (end < post.content.length) {
      var lastSpace = post.content.lastIndexOf(' ', end);
      if (lastSpace > start + 180) end = lastSpace;
    }
    return (start ? '…' : '') + post.content.slice(start, end) + (end < post.content.length ? '…' : '');
  }

  // Decode entities in Jekyll's stripped HTML without inserting it into the page.
  var decoder = document.createElement('textarea');
  function decode(text) {
    decoder.innerHTML = text;
    return decoder.value;
  }

  var posts = Array.prototype.map.call(document.querySelectorAll('#posts > li'), function (item) {
    var titleElement = item.querySelector('.post-index-title');
    var excerptElement = item.querySelector('.post-index-excerpt');
    var title = titleElement.textContent;
    var excerpt = excerptElement ? excerptElement.textContent : '';
    if (!excerptElement) {
      excerptElement = document.createElement('p');
      excerptElement.className = 'post-index-excerpt';
      item.querySelector('.post-index-body').insertBefore(excerptElement, item.querySelector('.post-index-meta'));
    }
    var summary = normalize(title + ' ' + excerpt);
    return {
      item: item,
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

  function render() {
    var query = input.value.trim();
    var terms = keywords(query);
    var count = 0;

    posts.forEach(function (post) {
      var matches = terms.every(function (term) { return post.text.indexOf(term) !== -1; });
      post.item.hidden = !matches;
      if (matches) {
        count++;
        highlight(post.titleElement, post.title, terms);
        var excerpt = terms.length ? snippet(post, terms) : post.excerpt;
        post.excerptElement.hidden = !excerpt;
        highlight(post.excerptElement, excerpt, terms);
      }
    });

    clear.hidden = !input.value;
    shortcut.hidden = !!input.value;
    empty.hidden = !terms.length || count > 0 || !!indexRequest;
    if (!terms.length) {
      status.textContent = '';
    } else if (indexRequest) {
      status.textContent = 'Searching…';
    } else {
      status.textContent = count + (count === 1 ? ' post' : ' posts') + ' found for “' + query + '”.';
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
      window.history.replaceState(null, '', url);
    }
    loadIndex();
    render();
  }

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
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      input.value = '';
      search(true);
    }
  });
  window.addEventListener('popstate', function () {
    input.value = new URL(window.location.href).searchParams.get('q') || '';
    search(false);
  });

  form.hidden = false;
  input.value = new URL(window.location.href).searchParams.get('q') || '';
  search(false);
  if (window.location.hash === '#post-search') input.focus();
})();
