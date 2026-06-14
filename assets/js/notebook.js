/* ============================================================
   Teo's Research Notebook — progressive enhancements.
   Theme toggle, reading progress, table of contents, home filter.
   No dependencies; every feature guards on its own elements.
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var mqDark = window.matchMedia('(prefers-color-scheme: dark)');

  /* ---------- Theme toggle ---------- */
  var toggle = document.querySelector('.theme-toggle');
  function currentTheme() {
    return root.getAttribute('data-theme') || (mqDark.matches ? 'dark' : 'light');
  }
  function syncToggle() {
    if (!toggle) return;
    var dark = currentTheme() === 'dark';
    toggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
    toggle.setAttribute('title', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      syncToggle();
    });
    if (mqDark.addEventListener) {
      mqDark.addEventListener('change', function () {
        var saved = null;
        try { saved = localStorage.getItem('theme'); } catch (e) {}
        if (!saved) syncToggle();
      });
    }
    syncToggle();
  }

  /* ---------- Reading progress (posts only) ---------- */
  var bar = document.querySelector('.reading-progress__bar');
  var article = document.querySelector('.post .post-content');
  if (bar && article) {
    var update = function () {
      var docH = document.documentElement.scrollHeight - window.innerHeight;
      var pct = docH > 0 ? window.scrollY / docH : 0;
      pct = Math.max(0, Math.min(1, pct));
      bar.style.width = (pct * 100).toFixed(2) + '%';
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* ---------- Table of contents ---------- */
  if (article) {
    var headings = Array.prototype.slice.call(article.querySelectorAll('h2'));
    if (headings.length >= 3) {
      var seen = {};
      headings.forEach(function (h) {
        if (!h.id) {
          var base = (h.textContent || 'section').toLowerCase()
            .replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
          if (seen[base]) { base = base + '-' + (++seen[base]); } else { seen[base] = 1; }
          h.id = base;
        }
      });

      var nav = document.createElement('nav');
      nav.className = 'post-toc';
      nav.setAttribute('aria-label', 'Table of contents');
      nav.setAttribute('data-collapsed', window.innerWidth < 1200 ? 'true' : 'false');

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'post-toc__toggle';
      btn.setAttribute('aria-expanded', nav.getAttribute('data-collapsed') === 'true' ? 'false' : 'true');
      btn.innerHTML = '<span class="post-toc__label">Contents</span><span class="post-toc__chevron" aria-hidden="true"></span>';

      var list = document.createElement('ul');
      list.className = 'post-toc__list';
      var byId = {};
      headings.forEach(function (h) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent;
        li.appendChild(a);
        list.appendChild(li);
        byId[h.id] = a;
      });

      btn.addEventListener('click', function () {
        var collapsed = nav.getAttribute('data-collapsed') === 'true';
        nav.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
        btn.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
      });

      nav.appendChild(btn);
      nav.appendChild(list);
      var header = document.querySelector('.post-header');
      if (header && header.parentNode) {
        header.parentNode.insertBefore(nav, header.nextSibling);
      }

      if ('IntersectionObserver' in window) {
        var obs = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              Object.keys(byId).forEach(function (id) { byId[id].removeAttribute('aria-current'); });
              if (byId[e.target.id]) byId[e.target.id].setAttribute('aria-current', 'true');
            }
          });
        }, { rootMargin: '0px 0px -75% 0px', threshold: 0 });
        headings.forEach(function (h) { obs.observe(h); });
      }
    }
  }

  /* ---------- Heading anchors ---------- */
  if (article) {
    var anchorables = Array.prototype.slice.call(article.querySelectorAll('h2, h3'));
    var anchorSeen = {};
    anchorables.forEach(function (h) {
      if (!h.id) {
        var base = (h.textContent || 'section').toLowerCase()
          .replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
        if (anchorSeen[base]) { base = base + '-' + (++anchorSeen[base]); } else { anchorSeen[base] = 1; }
        h.id = base;
      }
      var a = document.createElement('a');
      a.className = 'heading-anchor';
      a.href = '#' + h.id;
      a.setAttribute('aria-label', 'Permalink to this section');
      a.textContent = '#';
      // Appended last: on desktop it is absolutely positioned into the left
      // margin (order is irrelevant); on narrow screens it falls inline after
      // the heading text instead of being hidden.
      h.appendChild(a);
    });
  }

  /* ---------- Home topic filter + search ---------- */
  var chipbar = document.querySelector('.chipbar');
  if (chipbar) {
    var chips = Array.prototype.slice.call(chipbar.querySelectorAll('.chip'));
    var items = Array.prototype.slice.call(document.querySelectorAll('.postlist__item'));
    var empty = document.querySelector('.postlist__empty');
    var searchbox = document.getElementById('postsearch');
    var searchWrap = searchbox ? searchbox.closest('.searchbar') : null;
    var activeCat = 'all';
    var terms = [];

    function apply() {
      var shown = 0;
      items.forEach(function (li) {
        var catMatch = activeCat === 'all' || li.getAttribute('data-category') === activeCat;
        var textMatch = true;
        if (terms.length) {
          var blob = li.getAttribute('data-search') || '';
          textMatch = terms.every(function (t) { return blob.indexOf(t) !== -1; });
        }
        var match = catMatch && textMatch;
        li.hidden = !match;
        if (match) shown++;
      });
      if (empty) empty.hidden = shown !== 0;
    }

    function setCategory(filter) {
      activeCat = filter;
      chips.forEach(function (c) {
        var on = c.getAttribute('data-filter') === filter;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      apply();
    }

    chipbar.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      var f = chip.getAttribute('data-filter');
      setCategory(f);
      if (history.replaceState) {
        history.replaceState(null, '', f === 'all' ? location.pathname + location.search : '#' + f);
      }
    });

    if (searchbox) {
      searchbox.addEventListener('input', function () {
        var q = searchbox.value.trim().toLowerCase();
        terms = q ? q.split(/\s+/) : [];
        if (searchWrap) searchWrap.classList.toggle('has-query', q.length > 0);
        apply();
      });
      searchbox.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && searchbox.value) {
          searchbox.value = '';
          terms = [];
          if (searchWrap) searchWrap.classList.remove('has-query');
          apply();
        }
      });
      // Press "/" anywhere to jump to search.
      document.addEventListener('keydown', function (e) {
        if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
        var el = document.activeElement;
        var tag = el ? el.tagName : '';
        if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tag))) return;
        e.preventDefault();
        searchbox.focus();
      });
    }

    var hash = (location.hash || '').slice(1);
    if (hash && chips.some(function (c) { return c.getAttribute('data-filter') === hash; })) {
      setCategory(hash);
    }
  }

  /* ---------- Code block enhancements (language label + copy) ---------- */
  Array.prototype.slice.call(document.querySelectorAll('.post-content pre')).forEach(function (pre) {
    var wrap = document.createElement('div');
    wrap.className = 'codeblock';
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);

    // Language label, read from Rouge's `language-xxx` wrapper. Plain text and
    // unlabelled blocks (the vast majority here) get no tag, to avoid clutter.
    var langEl = pre.closest('[class*="language-"]');
    var lang = '';
    if (langEl) {
      Array.prototype.forEach.call(langEl.classList, function (c) {
        if (c.indexOf('language-') === 0) lang = c.slice(9);
      });
    }
    if (lang && lang !== 'text' && lang !== 'plaintext' && lang !== 'plain') {
      wrap.classList.add('has-lang');
      var tag = document.createElement('span');
      tag.className = 'code-lang';
      tag.textContent = lang;
      tag.setAttribute('aria-hidden', 'true');
      wrap.appendChild(tag);
    }

    if (!navigator.clipboard) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    wrap.appendChild(btn);

    var resetTimer;
    btn.addEventListener('click', function () {
      var code = pre.querySelector('code') || pre;
      navigator.clipboard.writeText(code.innerText).then(function () {
        btn.textContent = 'Copied';
        btn.classList.add('is-copied');
        clearTimeout(resetTimer);
        resetTimer = setTimeout(function () {
          btn.textContent = 'Copy';
          btn.classList.remove('is-copied');
        }, 1600);
      }).catch(function () {
        btn.textContent = 'Failed';
        clearTimeout(resetTimer);
        resetTimer = setTimeout(function () { btn.textContent = 'Copy'; }, 1600);
      });
    });
  });

  /* ---------- Mark external links ---------- */
  Array.prototype.slice.call(document.querySelectorAll('.post-content a[href]')).forEach(function (a) {
    var href = a.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) return;
    if (a.hostname && a.hostname !== location.hostname) {
      a.classList.add('external-link');
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });

  /* ---------- Back to top ---------- */
  var toTop = document.createElement('button');
  toTop.type = 'button';
  toTop.className = 'to-top';
  toTop.setAttribute('aria-label', 'Back to top');
  toTop.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>';
  document.body.appendChild(toTop);

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      toTop.classList.toggle('is-visible', window.scrollY > 600);
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
  });
})();
