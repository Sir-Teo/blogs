// Quiet enhancements for every page: theme toggle, heading anchors, a contents
// rail on wide screens, and copy buttons on code blocks. The page reads fine
// without any of it.
(function () {
  'use strict';

  var root = document.documentElement;

  // ---- Search shortcut ----------------------------------------------------
  var searchLink = document.querySelector('.search-toggle');
  var searchInput = document.getElementById('post-search');
  if (searchLink) {
    searchLink.hidden = false;
    searchLink.addEventListener('click', function (event) {
      if (searchInput && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        searchInput.focus();
      }
    });
  }
  if (searchInput || searchLink) {
    document.addEventListener('keydown', function (event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.key !== '/') return;
      if (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (searchInput) {
        event.preventDefault();
        searchInput.focus();
      } else if (searchLink) {
        event.preventDefault();
        window.location.href = searchLink.href;
      }
    });
  }

  // ---- Theme --------------------------------------------------------------
  function storedTheme() {
    try { return localStorage.getItem('theme'); } catch (e) { return null; }
  }
  var toggle = document.querySelector('.theme-toggle');
  function syncThemeButton(theme) {
    if (!toggle) return;
    var label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }
  function applyTheme(theme) {
    root.dataset.theme = theme;
    syncThemeButton(theme);
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
  }
  syncThemeButton(root.dataset.theme || 'light');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', next); } catch (e) {}
      applyTheme(next);
    });
  }
  var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function (e) {
      if (!storedTheme()) applyTheme(e.matches ? 'dark' : 'light');
    });
  }

  // ---- Destination icons for links in prose --------------------------------
  var linkIcons = new URL('../icons.svg', document.currentScript.src).href;
  document.querySelectorAll('.post-content a[href]').forEach(function (link) {
    var url = new URL(link.href);
    if (!/^https?:$/.test(url.protocol) || url.origin === window.location.origin || link.querySelector('svg, img')) return;
    var name = 'globe';
    if (url.hostname === 'github.com' || url.hostname === 'www.github.com') name = 'github';
    else if (url.hostname === 'youtube.com' || url.hostname === 'www.youtube.com' || url.hostname === 'youtu.be') name = 'youtube';
    else if (url.hostname === 'bilibili.com' || url.hostname.endsWith('.bilibili.com')) name = 'bilibili';
    var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'link-icon');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', linkIcons + '#' + name);
    icon.appendChild(use);
    link.insertBefore(icon, link.firstChild);
  });

  var article = document.querySelector('.post .post-content');
  if (article) {
    // ---- Heading anchors ---------------------------------------------------
    var heads = Array.prototype.slice.call(article.querySelectorAll('h2[id], h3[id]'));
    heads.forEach(function (h) {
      var a = document.createElement('a');
      a.className = 'heading-anchor';
      a.href = '#' + h.id;
      a.setAttribute('aria-label', 'Link to “' + h.textContent.trim() + '”');
      a.textContent = '#';
      h.insertBefore(a, h.firstChild);
    });

    // ---- Reading progress hairline -----------------------------------------
    var progressBar = document.createElement('div');
    progressBar.className = 'read-progress';
    progressBar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progressBar);

    // ---- Contents rail & narrow-screen disclosure --------------------------
    var links = [];
    if (heads.length >= 3) {
      var buildList = function () {
        var ol = document.createElement('ol');
        var listLinks = heads.map(function (h) {
          var li = document.createElement('li');
          li.className = h.tagName.toLowerCase();
          var a = document.createElement('a');
          a.href = '#' + h.id;
          a.textContent = h.textContent.replace(/^#/, '').trim();
          li.appendChild(a);
          ol.appendChild(li);
          return a;
        });
        return { ol: ol, links: listLinks };
      };

      var rail = buildList();
      links = rail.links;
      var nav = document.createElement('nav');
      nav.className = 'toc';
      nav.setAttribute('aria-label', 'Contents');
      var tocTitle = document.createElement('p');
      tocTitle.className = 'toc-title';
      tocTitle.textContent = 'Contents';
      nav.appendChild(tocTitle);
      nav.appendChild(rail.ol);
      document.body.appendChild(nav);

      if (heads.length >= 4 && article.parentNode) {
        var inline = document.createElement('details');
        inline.className = 'toc-inline';
        var summary = document.createElement('summary');
        summary.textContent = 'Contents';
        var count = document.createElement('span');
        count.textContent = heads.length + ' sections';
        summary.appendChild(count);
        inline.appendChild(summary);
        var inlineList = buildList();
        inlineList.links.forEach(function (a) {
          a.addEventListener('click', function () { inline.open = false; });
        });
        inline.appendChild(inlineList.ol);
        article.parentNode.insertBefore(inline, article);
      }
    }

    var current = -1;
    var updateScroll = function () {
      var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll > window.innerHeight * 0.4) {
        var ratio = Math.max(0, Math.min(1, window.scrollY / maxScroll));
        progressBar.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
        progressBar.classList.toggle('visible', window.scrollY > 120);
      } else {
        progressBar.classList.remove('visible');
      }

      if (!links.length) return;
      var i = -1;
      if (maxScroll > 0 && window.scrollY >= maxScroll - 24) {
        i = heads.length - 1;
      } else {
        for (var k = 0; k < heads.length; k++) if (heads[k].getBoundingClientRect().top < 140) i = k;
      }
      if (i === current) return;
      if (current >= 0) links[current].classList.remove('active');
      if (i >= 0) links[i].classList.add('active');
      current = i;
    };
    var queued = false;
    var queueScroll = function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; updateScroll(); });
    };
    window.addEventListener('scroll', queueScroll, { passive: true });
    window.addEventListener('resize', queueScroll, { passive: true });
    updateScroll();
  }

  // ---- Home index micro-figures --------------------------------------------
  var home = document.querySelector('.home');
  if (home) {
    var figToggle = home.querySelector('[data-toggle-figs]');
    if (figToggle) {
      var pinned = false;
      var syncFigs = function (on) {
        home.classList.toggle('figs-active', on);
        figToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
      };
      figToggle.addEventListener('click', function (e) {
        e.preventDefault();
        pinned = !pinned;
        syncFigs(pinned);
      });
      figToggle.addEventListener('pointerenter', function () {
        if (!pinned) home.classList.add('figs-active');
      });
      figToggle.addEventListener('pointerleave', function () {
        if (!pinned) home.classList.remove('figs-active');
      });
    }
    home.querySelectorAll('.post-index li').forEach(function (li) {
      li.addEventListener('pointermove', function (e) {
        var r = li.getBoundingClientRect();
        var t = Math.max(-1, Math.min(1, ((e.clientX - r.left) / (r.width || 1) - 0.5) * 2));
        li.style.setProperty('--scrub', (t * 5).toFixed(2) + 'px');
        li.style.setProperty('--scrub-deg', (t * 9).toFixed(1) + 'deg');
      });
      li.addEventListener('pointerleave', function () {
        li.style.removeProperty('--scrub');
        li.style.removeProperty('--scrub-deg');
      });
    });
  }

  // ---- Scrollable code blocks ----------------------------------------------
  // A block wider than the column scrolls sideways; give it a tab stop so it
  // can be scrolled from the keyboard.
  document.querySelectorAll('.post-content pre').forEach(function (pre) {
    if (pre.scrollWidth > pre.clientWidth + 1 && !pre.hasAttribute('tabindex')) {
      pre.tabIndex = 0;
      pre.setAttribute('role', 'region');
      pre.setAttribute('aria-label', 'Code');
    }
  });

  // ---- Copy buttons ---------------------------------------------------------
  if (navigator.clipboard) {
    document.querySelectorAll('div.highlight').forEach(function (block) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-code';
      btn.textContent = 'Copy';
      btn.addEventListener('click', function () {
        var pre = block.querySelector('pre');
        navigator.clipboard.writeText(pre ? pre.innerText : '').then(function () {
          btn.textContent = 'Copied';
          btn.dataset.copied = 'true';
          setTimeout(function () {
            btn.textContent = 'Copy';
            delete btn.dataset.copied;
          }, 1500);
        }, function () {});
      });
      block.appendChild(btn);
    });
  }
})();
