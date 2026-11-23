// Enhancements for every page: auto-hiding fixed header, mobile menu overlay,
// left sticky TOC with sliding active dot and wide-figure collision avoidance,
// heading anchors, code language badges, copy buttons, and '/' search shortcut.
(function () {
  'use strict';

  // ---- Auto-hiding fixed header -------------------------------------------
  var header = document.getElementById('site-header');
  var hamburger = document.querySelector('.hamburger');
  var mobileMenu = document.getElementById('mobile-menu');

  function setMenuOpen(open) {
    if (!hamburger || !mobileMenu) return;
    hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    hamburger.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    mobileMenu.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
    if (open && header) {
      header.removeAttribute('data-scroll-hidden');
      document.body.classList.remove('header-hidden');
    }
  }

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', function () {
      setMenuOpen(mobileMenu.hidden);
    });
    mobileMenu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setMenuOpen(false); });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !mobileMenu.hidden) {
        setMenuOpen(false);
        hamburger.focus();
      }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 640 && !mobileMenu.hidden) setMenuOpen(false);
    }, { passive: true });
  }

  if (header) {
    var lastY = window.scrollY;
    var headerTicking = false;
    var updateHeader = function () {
      headerTicking = false;
      if (mobileMenu && !mobileMenu.hidden) return;
      var y = Math.max(0, window.scrollY);
      var dy = y - lastY;
      if (y <= 60) {
        header.removeAttribute('data-scroll-hidden');
        document.body.classList.remove('header-hidden');
      } else if (dy > 5 && y > 80) {
        header.setAttribute('data-scroll-hidden', '');
        document.body.classList.add('header-hidden');
      } else if (dy < -5) {
        header.removeAttribute('data-scroll-hidden');
        document.body.classList.remove('header-hidden');
      }
      lastY = y;
    };
    window.addEventListener('scroll', function () {
      if (!headerTicking) {
        headerTicking = true;
        requestAnimationFrame(updateHeader);
      }
    }, { passive: true });
  }

  // ---- Search shortcut ('/' from non-home pages jumps to home search) -----
  var searchInput = document.getElementById('post-search');
  if (!searchInput) {
    var homeLink = document.querySelector('.site-name');
    if (homeLink) {
      document.addEventListener('keydown', function (event) {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.key !== '/') return;
        if (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
        event.preventDefault();
        window.location.href = homeLink.href + '#post-search';
      });
    }
  }

  // ---- Article heading anchors & left sticky TOC --------------------------
  var shell = document.querySelector('.post-content-shell');
  var article = shell ? shell.querySelector('.post-content') : null;
  if (shell && article) {
    var heads = Array.prototype.slice.call(article.querySelectorAll(':scope > h2[id], :scope > h3[id]'));
    heads.forEach(function (h) {
      var a = document.createElement('a');
      a.className = 'heading-anchor';
      a.href = '#' + h.id;
      a.setAttribute('aria-label', 'Link to “' + h.textContent.trim() + '”');
      a.textContent = '#';
      h.insertBefore(a, h.firstChild);
    });

    var tocNav = null;
    var marker = null;
    var links = [];
    var wideEls = Array.prototype.slice.call(article.querySelectorAll('figure.wide, .wide-table'));

    if (heads.length >= 2) {
      var buildList = function (listClass) {
        var ol = document.createElement('ol');
        if (listClass) ol.className = listClass;
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

      var rail = buildList('left-toc-list');
      links = rail.links;
      marker = document.createElement('span');
      marker.className = 'toc-active-marker';
      marker.setAttribute('aria-hidden', 'true');
      rail.ol.insertBefore(marker, rail.ol.firstChild);

      tocNav = document.createElement('nav');
      tocNav.className = 'left-toc';
      tocNav.setAttribute('aria-label', 'Table of contents');
      tocNav.appendChild(rail.ol);
      shell.insertBefore(tocNav, article);

      if (heads.length >= 4) {
        var inline = document.createElement('details');
        inline.className = 'toc-inline';
        var summary = document.createElement('summary');
        summary.textContent = 'Contents';
        var count = document.createElement('span');
        count.textContent = heads.length + ' sections';
        summary.appendChild(count);
        inline.appendChild(summary);
        var inlineList = buildList('');
        inlineList.links.forEach(function (a) {
          a.addEventListener('click', function () { inline.open = false; });
        });
        inline.appendChild(inlineList.ol);
        shell.insertBefore(inline, article);
      }
    }

    var current = -1;
    var positionMarker = function (index) {
      if (!marker || !links.length) return;
      if (index < 0) {
        marker.classList.remove('is-visible');
        return;
      }
      var activeLink = links[index];
      var lh = parseFloat(window.getComputedStyle(activeLink).lineHeight) || 18;
      var y = activeLink.offsetTop + Math.round(lh / 2) - 2;
      marker.style.transform = 'translate3d(0, ' + y + 'px, 0)';
      marker.classList.add('is-visible');
    };

    var updateCollision = function () {
      if (!tocNav || !wideEls.length || window.innerWidth < 1280) {
        if (tocNav) tocNav.classList.remove('is-collision-hidden');
        return;
      }
      var tocRect = tocNav.getBoundingClientRect();
      if (!tocRect.width || !tocRect.height) return;
      var collides = false;
      for (var i = 0; i < wideEls.length; i++) {
        var r = wideEls[i].getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.left < tocRect.right + 14 && r.top < tocRect.bottom + 8 && r.bottom > tocRect.top - 8) {
          collides = true;
          break;
        }
      }
      tocNav.classList.toggle('is-collision-hidden', collides);
    };

    var updateToc = function () {
      if (links.length) {
        var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        var i = 0;
        if (maxScroll > 0 && window.scrollY >= maxScroll - 24) {
          i = heads.length - 1;
        } else {
          for (var k = 0; k < heads.length; k++) {
            if (heads[k].getBoundingClientRect().top <= 140) i = k;
          }
        }
        if (i !== current) {
          if (current >= 0) links[current].classList.remove('active');
          links[i].classList.add('active');
          current = i;
        }
        positionMarker(current);
      }
      updateCollision();
    };

    var tocQueued = false;
    var queueToc = function () {
      if (tocQueued) return;
      tocQueued = true;
      requestAnimationFrame(function () {
        tocQueued = false;
        updateToc();
      });
    };

    window.addEventListener('scroll', queueToc, { passive: true });
    window.addEventListener('resize', queueToc, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(queueToc);
    }
    updateToc();
  }

  // ---- Code blocks: language badge, keyboard scroll, and copy button ------
  document.querySelectorAll('.post-content pre').forEach(function (pre) {
    if (pre.scrollWidth > pre.clientWidth + 1 && !pre.hasAttribute('tabindex')) {
      pre.tabIndex = 0;
      pre.setAttribute('role', 'region');
      pre.setAttribute('aria-label', 'Code');
    }
  });

  document.querySelectorAll('div.highlight').forEach(function (block) {
    var wrapper = block.closest('[class*="language-"]');
    if (wrapper && !block.dataset.lang) {
      var m = wrapper.className.match(/\blanguage-([a-z0-9_+-]+)\b/i);
      if (m) block.dataset.lang = m[1].toLowerCase();
    }

    if (navigator.clipboard) {
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
    }
  });
})();
