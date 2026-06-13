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

  /* ---------- Home topic filter ---------- */
  var chipbar = document.querySelector('.chipbar');
  if (chipbar) {
    var chips = Array.prototype.slice.call(chipbar.querySelectorAll('.chip'));
    var items = Array.prototype.slice.call(document.querySelectorAll('.postlist__item'));
    var empty = document.querySelector('.postlist__empty');

    function applyFilter(filter) {
      var shown = 0;
      items.forEach(function (li) {
        var match = filter === 'all' || li.getAttribute('data-category') === filter;
        li.hidden = !match;
        if (match) shown++;
      });
      if (empty) empty.hidden = shown !== 0;
      chips.forEach(function (c) {
        var on = c.getAttribute('data-filter') === filter;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    chipbar.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      var f = chip.getAttribute('data-filter');
      applyFilter(f);
      if (history.replaceState) {
        history.replaceState(null, '', f === 'all' ? location.pathname + location.search : '#' + f);
      }
    });

    var hash = (location.hash || '').slice(1);
    if (hash && chips.some(function (c) { return c.getAttribute('data-filter') === hash; })) {
      applyFilter(hash);
    }
  }
})();
