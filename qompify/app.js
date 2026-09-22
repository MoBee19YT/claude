/* ==========================================================================
   Qompify — frontend demo.
   No backend, no API calls: every list below is local placeholder data and
   every action is visual only.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- tiny helpers ---------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- icon set (stroked, inherits currentColor) ---------- */
  var S = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">';
  var ICONS = {
    cpu: S + '<rect x="7" y="7" width="10" height="10" rx="2"/><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/></svg>',
    gpu: S + '<rect x="2" y="7" width="20" height="11" rx="2"/><circle cx="8" cy="12.5" r="2.6"/><circle cx="16" cy="12.5" r="2.6"/><path d="M5 18v3"/></svg>',
    ram: S + '<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 11v2M10 11v2M14 11v2M18 11v2"/><path d="M6 17v2M18 17v2"/></svg>',
    storage: S + '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="12" cy="12" r="3.4"/><path d="M14.4 14.4 17 17"/></svg>',
    monitor: S + '<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M9 20h6M12 16.5V20"/></svg>',
    laptop: S + '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 19h20"/></svg>',
    compare: S + '<rect x="3" y="4" width="7" height="16" rx="2"/><rect x="14" y="4" width="7" height="16" rx="2"/><path d="M11.5 12h1"/></svg>',
    search: S + '<circle cx="11" cy="11" r="7"/><path d="M16.2 16.2 21 21"/></svg>',
    shield: S + '<path d="M12 3l7.5 3v5.4c0 4.3-3.1 8.2-7.5 9.6-4.4-1.4-7.5-5.3-7.5-9.6V6z"/><path d="M9.2 12.2l2 2 3.6-3.9"/></svg>',
    wallet: S + '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2v1"/><rect x="3" y="8.5" width="18" height="11" rx="2.5"/><circle cx="16.5" cy="14" r="1.2"/></svg>',
    bulb: S + '<path d="M9.2 17.5h5.6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 1 3.6 10.8c-.6.5-1 1.2-1 2H9.4c0-.8-.4-1.5-1-2A6 6 0 0 1 12 3z"/></svg>',
    gauge: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-5"/></svg>',
    arrow: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15"/><path d="M13 6l6 6-6 6"/></svg>'
  };

  /* ---------- placeholder data ---------- */
  var CATEGORIES = [
    { icon: 'cpu', name: 'Processors (CPU)', desc: 'Performance, cores, value' },
    { icon: 'gpu', name: 'Graphics Cards (GPU)', desc: 'FPS, VRAM, benchmarks' },
    { icon: 'ram', name: 'RAM', desc: 'Speed, capacity, type' },
    { icon: 'storage', name: 'Storage', desc: 'SSD, HDD, speed' },
    { icon: 'monitor', name: 'Monitors', desc: 'Size, refresh rate, panel' },
    { icon: 'laptop', name: 'Laptops', desc: 'Performance, battery, build' },
    { icon: 'compare', name: 'Compare', desc: 'Side-by-side comparisons' }
  ];

  var COMPARISONS = [
    {
      tag: 'Graphics Cards',
      title: 'RTX 4070 vs RX 7800 XT',
      desc: 'Which card gives you better performance for the price?',
      specs: 'Performance · Price · Value',
      a: 'assets/gpu-rtx.svg',
      b: 'assets/gpu-rx.svg'
    },
    {
      tag: 'Processors',
      title: 'Ryzen 5 7600 vs Intel i5-13400F',
      desc: 'Gaming, productivity and overall value compared.',
      specs: 'Performance · Power · Price',
      a: 'assets/cpu-box-amd.svg',
      b: 'assets/cpu-box-intel.svg'
    },
    {
      tag: 'RAM',
      title: '32GB vs 16GB RAM',
      desc: 'Is 16GB enough or should you go for 32GB?',
      specs: 'Performance · Multitasking · Price',
      a: 'assets/ram-black.svg',
      b: 'assets/ram-silver.svg'
    }
  ];

  var WHY = [
    { icon: 'search', title: 'Real comparisons', desc: 'Side-by-side specs, performance and prices.' },
    { icon: 'shield', title: 'Trusted data', desc: 'Clear information from reliable sources.' },
    { icon: 'wallet', title: 'Save time & money', desc: 'Find the right option without searching for hours.' },
    { icon: 'bulb', title: 'Make smarter choices', desc: 'Understand what hardware actually fits your needs.' }
  ];

  var ARTICLES = [
    {
      img: 'assets/art-ram.svg', tag: 'Memory', meta: '6 min read · Mar 2026',
      title: 'How much RAM do you actually need in 2026?',
      desc: 'Where 16GB still holds up, and when the jump to 32GB is worth paying for.'
    },
    {
      img: 'assets/art-gpu.svg', tag: 'Graphics', meta: '8 min read · Mar 2026',
      title: 'GPU VRAM explained',
      desc: 'What video memory does, how much your resolution needs, and what it does not fix.'
    },
    {
      img: 'assets/art-cpu.svg', tag: 'Processors', meta: '7 min read · Feb 2026',
      title: 'What matters most when choosing a CPU?',
      desc: 'Cores, clocks, cache and power draw — ranked by how much they change daily use.'
    },
    {
      img: 'assets/art-ssd.svg', tag: 'Storage', meta: '5 min read · Feb 2026',
      title: "SSD vs HDD: what's the difference?",
      desc: 'Speed, lifespan and cost per terabyte, and where each type still makes sense.'
    }
  ];

  var CATALOG = [
    { name: 'GeForce RTX 4070', cat: 'Graphics card', price: 'from €579', icon: 'gpu' },
    { name: 'GeForce RTX 4060 Ti', cat: 'Graphics card', price: 'from €409', icon: 'gpu' },
    { name: 'Radeon RX 7800 XT', cat: 'Graphics card', price: 'from €529', icon: 'gpu' },
    { name: 'Ryzen 5 7600', cat: 'Processor', price: 'from €209', icon: 'cpu' },
    { name: 'Ryzen 7 7800X3D', cat: 'Processor', price: 'from €369', icon: 'cpu' },
    { name: 'Intel Core i5-13400F', cat: 'Processor', price: 'from €179', icon: 'cpu' },
    { name: 'Corsair Vengeance 32GB DDR5-6000', cat: 'Memory', price: 'from €99', icon: 'ram' },
    { name: 'Kingston Fury Beast 16GB DDR5', cat: 'Memory', price: 'from €54', icon: 'ram' },
    { name: 'Samsung 990 Pro 2TB', cat: 'SSD', price: 'from €149', icon: 'storage' },
    { name: 'WD Black SN850X 1TB', cat: 'SSD', price: 'from €89', icon: 'storage' },
    { name: 'LG UltraGear 27GP850', cat: 'Monitor', price: 'from €329', icon: 'monitor' },
    { name: 'Dell S2722DGM 27"', cat: 'Monitor', price: 'from €239', icon: 'monitor' },
    { name: 'Lenovo Legion Slim 5', cat: 'Laptop', price: 'from €1,149', icon: 'laptop' },
    { name: 'ASUS TUF Gaming A15', cat: 'Laptop', price: 'from €999', icon: 'laptop' }
  ];

  /* ---------- toast ---------- */
  var toast = $('#toast');
  var toastText = $('#toastText');
  var toastTimer;

  function showToast(message) {
    toastText.textContent = message;
    toast.classList.add('is-open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('is-open'); }, 2600);
  }

  /* ---------- render: categories ---------- */
  $('#cats').innerHTML = CATEGORIES.map(function (c, i) {
    return '<button class="cat reveal" style="transition-delay:' + (i * 45) + 'ms"' +
      ' data-demo="' + escapeHtml(c.name) + ' — category pages are not part of this demo">' +
      '<span class="cat__icon">' + ICONS[c.icon] + '</span>' +
      '<span class="cat__name">' + escapeHtml(c.name) + '</span>' +
      '<span class="cat__desc">' + escapeHtml(c.desc) + '</span>' +
      '<span class="cat__arrow">' + ICONS.arrow + '</span>' +
      '</button>';
  }).join('');

  /* ---------- render: comparisons ---------- */
  $('#compareGrid').innerHTML = COMPARISONS.map(function (c, i) {
    return '<button class="compare-card reveal" style="transition-delay:' + (i * 90) + 'ms"' +
      ' data-demo="' + escapeHtml(c.title) + ' — full comparisons are not part of this demo">' +
      '<span class="compare-card__media">' +
        '<span class="tag compare-card__tag">' + escapeHtml(c.tag) + '</span>' +
        '<img src="' + c.a + '" alt="" loading="lazy" />' +
        '<span class="compare-card__vs">VS</span>' +
        '<img src="' + c.b + '" alt="" loading="lazy" />' +
      '</span>' +
      '<span class="compare-card__body">' +
        '<h3>' + escapeHtml(c.title) + '</h3>' +
        '<p>' + escapeHtml(c.desc) + '</p>' +
      '</span>' +
      '<span class="compare-card__foot">' +
        ICONS.gauge +
        '<span class="spec">' + escapeHtml(c.specs) + '</span>' +
        '<span class="go">' + ICONS.arrow + '</span>' +
      '</span>' +
      '</button>';
  }).join('');

  /* ---------- render: why Qompify ---------- */
  $('#whyList').innerHTML = WHY.map(function (w) {
    return '<div class="why__item">' +
      '<span class="why__icon">' + ICONS[w.icon] + '</span>' +
      '<span><strong>' + escapeHtml(w.title) + '</strong><span>' + escapeHtml(w.desc) + '</span></span>' +
      '</div>';
  }).join('');

  /* ---------- render: articles ---------- */
  $('#articles').innerHTML = ARTICLES.map(function (a, i) {
    return '<button class="article reveal" style="transition-delay:' + (i * 70) + 'ms"' +
      ' data-demo="' + escapeHtml(a.title) + ' — articles are not part of this demo">' +
      '<span class="article__media">' +
        '<img src="' + a.img + '" alt="" loading="lazy" />' +
        '<span class="tag">' + escapeHtml(a.tag) + '</span>' +
      '</span>' +
      '<span class="article__body">' +
        '<span class="article__meta">' + escapeHtml(a.meta) + '</span>' +
        '<h3>' + escapeHtml(a.title) + '</h3>' +
        '<p>' + escapeHtml(a.desc) + '</p>' +
        '<span class="article__read">Read guide ' + ICONS.arrow + '</span>' +
      '</span>' +
      '</button>';
  }).join('');

  /* ---------- theme toggle ---------- */
  var SUN = '<circle cx="12" cy="12" r="4.4" /><path d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M5.8 5.8 4.3 4.3M19.7 19.7l-1.5-1.5M18.2 5.8l1.5-1.5M4.3 19.7l1.5-1.5" />';
  var MOON = '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2z" />';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var dark = theme === 'dark';
    $('#themeIcon').innerHTML = dark ? MOON : SUN;
    $('#themeBtn').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    try { localStorage.setItem('qompify-theme', theme); } catch (e) { /* demo only */ }
  }

  var storedTheme = null;
  try { storedTheme = localStorage.getItem('qompify-theme'); } catch (e) { /* demo only */ }
  if (!storedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    storedTheme = 'dark';
  }
  applyTheme(storedTheme === 'dark' ? 'dark' : 'light');

  $('#themeBtn').addEventListener('click', function () {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  /* ---------- header scroll state ---------- */
  var header = $('#header');
  function onScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 8);
    spy();
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- scroll spy ---------- */
  var spyLinks = $$('.nav__link');
  function spy() {
    var line = window.scrollY + window.innerHeight * 0.32;
    var current = 'home';
    spyLinks.forEach(function (link) {
      var section = document.getElementById(link.dataset.spy);
      if (section && section.offsetTop <= line) current = link.dataset.spy;
    });
    spyLinks.forEach(function (link) {
      link.classList.toggle('is-active', link.dataset.spy === current);
    });
    $$('.mobile-nav a').forEach(function (link, i) {
      link.classList.toggle('is-active', spyLinks[i] && spyLinks[i].dataset.spy === current);
    });
  }

  /* ---------- reveal on scroll ---------- */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('.reveal').forEach(function (node) { io.observe(node); });
  } else {
    $$('.reveal').forEach(function (node) { node.classList.add('is-in'); });
  }

  /* ---------- mobile nav ---------- */
  var menuBtn = $('#menuBtn');
  var mobileNav = $('#mobileNav');

  function setMenu(open) {
    menuBtn.setAttribute('aria-expanded', String(open));
    $('#menuIcon').innerHTML = open
      ? '<path d="M6 6l12 12M18 6L6 18" />'
      : '<path d="M4 7h16M4 12h16M4 17h16" />';
    if (open) {
      mobileNav.hidden = false;
      requestAnimationFrame(function () { mobileNav.classList.add('is-open'); });
    } else {
      mobileNav.classList.remove('is-open');
      setTimeout(function () { if (!mobileNav.classList.contains('is-open')) mobileNav.hidden = true; }, 250);
    }
  }
  menuBtn.addEventListener('click', function () {
    setMenu(menuBtn.getAttribute('aria-expanded') !== 'true');
  });
  mobileNav.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') setMenu(false);
  });

  /* ---------- profile dropdown ---------- */
  var profile = $('#profile');
  var profileBtn = $('#profileBtn');
  profileBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = !profile.classList.contains('is-open');
    profile.classList.toggle('is-open', open);
    profileBtn.setAttribute('aria-expanded', String(open));
  });

  /* ---------- search: suggestions ---------- */
  var searchbox = $('#searchbox');
  var input = $('#searchInput');
  var suggest = $('#suggest');
  var highlighted = -1;
  var matches = [];

  function highlightMatch(text, query) {
    var i = text.toLowerCase().indexOf(query.toLowerCase());
    if (!query || i < 0) return escapeHtml(text);
    return escapeHtml(text.slice(0, i)) + '<mark>' + escapeHtml(text.slice(i, i + query.length)) +
      '</mark>' + escapeHtml(text.slice(i + query.length));
  }

  function renderSuggestions(query) {
    var q = query.trim();
    matches = q
      ? CATALOG.filter(function (p) {
          return (p.name + ' ' + p.cat).toLowerCase().indexOf(q.toLowerCase()) > -1;
        }).slice(0, 6)
      : CATALOG.slice(0, 5);

    var label = q ? 'Matching products' : 'Popular right now';
    if (!matches.length) {
      suggest.innerHTML = '<p class="suggest__empty">No demo product matches “' + escapeHtml(q) + '”.</p>';
      return;
    }
    suggest.innerHTML = '<p class="suggest__label">' + label + '</p>' + matches.map(function (p, i) {
      return '<button class="suggest__item" role="option" data-index="' + i + '">' +
        '<span class="suggest__thumb">' + ICONS[p.icon] + '</span>' +
        '<span class="suggest__text">' +
          '<span class="suggest__name">' + highlightMatch(p.name, q) + '</span>' +
          '<span class="suggest__meta">' + escapeHtml(p.cat) + '</span>' +
        '</span>' +
        '<span class="suggest__price">' + escapeHtml(p.price) + '</span>' +
        '</button>';
    }).join('');
  }

  function openSuggest() {
    renderSuggestions(input.value);
    suggest.classList.add('is-open');
    input.setAttribute('aria-expanded', 'true');
  }
  function closeSuggest() {
    suggest.classList.remove('is-open');
    input.setAttribute('aria-expanded', 'false');
    highlighted = -1;
  }
  function setHighlight(next) {
    var items = $$('.suggest__item', suggest);
    if (!items.length) return;
    highlighted = (next + items.length) % items.length;
    items.forEach(function (item, i) { item.classList.toggle('is-highlighted', i === highlighted); });
    items[highlighted].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('focus', function () { searchbox.classList.add('is-focused'); openSuggest(); });
  input.addEventListener('input', function () { highlighted = -1; openSuggest(); });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(highlighted + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(highlighted - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted > -1 && matches[highlighted]) pickProduct(matches[highlighted]);
      else runSearch();
    } else if (e.key === 'Escape') { closeSuggest(); input.blur(); }
  });

  suggest.addEventListener('mousedown', function (e) {
    var item = e.target.closest('.suggest__item');
    if (!item) return;
    e.preventDefault();
    pickProduct(matches[Number(item.dataset.index)]);
  });

  function pickProduct(product) {
    if (!product) return;
    input.value = product.name;
    closeSuggest();
    showToast(product.name + ' — product pages are not part of this demo');
  }

  function runSearch() {
    var q = input.value.trim();
    closeSuggest();
    showToast(q ? 'Demo search for “' + q + '” — no results are fetched' : 'Type a product name to try the demo search');
  }

  $('#searchGo').addEventListener('click', runSearch);

  $('#searchBtn').addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(function () { input.focus(); }, 350);
  });

  /* ---------- global interactions ---------- */
  document.addEventListener('click', function (e) {
    if (!searchbox.contains(e.target)) {
      searchbox.classList.remove('is-focused');
      closeSuggest();
    }
    if (!profile.contains(e.target)) {
      profile.classList.remove('is-open');
      profileBtn.setAttribute('aria-expanded', 'false');
    }
    var demo = e.target.closest('[data-demo]');
    if (demo) {
      if (demo.tagName === 'A' && demo.getAttribute('href') === '#') e.preventDefault();
      showToast(demo.dataset.demo);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== input && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      input.focus();
    }
    if (e.key === 'Escape') {
      profile.classList.remove('is-open');
      profileBtn.setAttribute('aria-expanded', 'false');
      if (menuBtn.getAttribute('aria-expanded') === 'true') setMenu(false);
    }
  });

  onScroll();
})();
