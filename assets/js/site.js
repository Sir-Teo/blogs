// Quiet enhancements for every page: theme toggle, heading anchors, a contents
// rail on wide screens, and copy buttons on code blocks. The page reads fine
// without any of it.
(function () {
  'use strict';

  var root = document.documentElement;

  // ---- Theme --------------------------------------------------------------
  function storedTheme() {
    try { return localStorage.getItem('theme'); } catch (e) { return null; }
  }
  function applyTheme(theme) {
    root.dataset.theme = theme;
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
  }
  var toggle = document.querySelector('.theme-toggle');
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

    // ---- Contents rail -----------------------------------------------------
    if (heads.length >= 3) {
      var nav = document.createElement('nav');
      nav.className = 'toc';
      nav.setAttribute('aria-label', 'Contents');
      var ol = document.createElement('ol');
      var links = heads.map(function (h) {
        var li = document.createElement('li');
        li.className = h.tagName.toLowerCase();
        var a = document.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent.replace(/^#/, '').trim();
        li.appendChild(a);
        ol.appendChild(li);
        return a;
      });
      nav.appendChild(ol);
      document.body.appendChild(nav);

      var current = -1;
      var update = function () {
        var i = -1;
        for (var k = 0; k < heads.length; k++) if (heads[k].getBoundingClientRect().top < 140) i = k;
        if (i === current) return;
        if (current >= 0) links[current].classList.remove('active');
        if (i >= 0) links[i].classList.add('active');
        current = i;
      };
      var queued = false;
      window.addEventListener('scroll', function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () { queued = false; update(); });
      }, { passive: true });
      update();
    }
  }

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
          setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
        }, function () {});
      });
      block.appendChild(btn);
    });
  }
})();
