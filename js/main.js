(function () {
  const DEFAULT_PAGE = 'introduction';
  const PAGES_DIR = 'pages';
  const CONTENT_ID = 'content';
  const NAV_SELECTOR = '.nav a';
  const SIDEBAR_TOGGLE_SELECTOR = '.sidebar-toggle';

  // Utility: safe fetch text
  async function fetchText(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return await res.text();
  }

  // Load a page into the content area
  async function loadPage(page, push = true) {
    const contentEl = document.getElementById(CONTENT_ID);
    if (!contentEl) return;

    const pageFile = `${PAGES_DIR}/${page}.html`;

    // show a minimal loading state
    contentEl.innerHTML = `<div class="loading">Loading…</div>`;

    try {
      const html = await fetchText(pageFile);
      contentEl.innerHTML = html;

      // highlight code blocks (Prism)
      if (window.Prism && typeof Prism.highlightAll === 'function') {
        Prism.highlightAll();
      }

      // update active nav link
      setActiveLink(page);

      // update document title if page contains a <title> or h1
      updateTitleFromContent(page);

      // push history state
      if (push) {
        const url = buildUrlForPage(page);
        history.pushState({ page }, '', url);
      }

      // scroll to top of content
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (err) {
      console.error(err);
      contentEl.innerHTML = renderError(page, err);
      setActiveLink(null);
      if (push) {
        history.pushState({ page }, '', buildUrlForPage(page));
      }
    }
  }

  // Build a friendly URL for a page (keeps root clean)
  function buildUrlForPage(page) {
    // Use hash-free pretty URLs if hosting supports it; otherwise fallback to hash
    // For static hosting like GitHub Pages, using `?page=` is safest without server config
    return `${location.pathname}?page=${encodeURIComponent(page)}`;
  }

  // Read page from URL (query param ?page=)
  function pageFromUrl() {
    const params = new URLSearchParams(location.search);
    const p = params.get('page');
    if (p) return p;
    // fallback to default
    return DEFAULT_PAGE;
  }

  // Set active nav link visually
  function setActiveLink(page) {
    const links = document.querySelectorAll(NAV_SELECTOR);
    links.forEach(a => {
      const target = a.dataset.page || extractPageFromHref(a.getAttribute('href')) || null;
      if (page && target === page) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
      } else {
        a.classList.remove('active');
        a.removeAttribute('aria-current');
      }
    });
  }

  // Extract page name from href like "pages/syntax.html" or "#syntax"
  function extractPageFromHref(href) {
    if (!href) return null;
    // pages/syntax.html -> syntax
    const m = href.match(/pages\/([a-z0-9\-\_]+)\.html/i);
    if (m) return m[1];
    // ?page=syntax
    const q = href.match(/[?&]page=([a-z0-9\-\_]+)/i);
    if (q) return q[1];
    // #syntax
    const h = href.match(/#([a-z0-9\-\_]+)/i);
    if (h) return h[1];
    return null;
  }

  // Update document title from first h1 in loaded content or fallback
  function updateTitleFromContent(page) {
    const contentEl = document.getElementById(CONTENT_ID);
    if (!contentEl) return;
    const h1 = contentEl.querySelector('h1, h2');
    if (h1 && h1.textContent.trim()) {
      document.title = `${h1.textContent.trim()} — PyFlux`;
    } else {
      document.title = `PyFlux — ${capitalize(page)}`;
    }
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Render a friendly error message
  function renderError(page, err) {
    return `
      <div class="error">
        <h2>Unable to load page</h2>
        <p>We couldn't load <strong>${escapeHtml(page)}</strong>. The file may be missing or the network failed.</p>
        <pre><code>${escapeHtml(err.message || String(err))}</code></pre>
        <p>If this persists, check that <code>pages/${escapeHtml(page)}.html</code> exists.</p>
      </div>
    `;
  }

  // Basic HTML escape
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Attach click handlers to nav links
  function wireNavLinks() {
    const links = document.querySelectorAll(NAV_SELECTOR);
    links.forEach(a => {
      // prevent double-binding
      a.removeEventListener('click', navClickHandler);
      a.addEventListener('click', navClickHandler);
    });
  }

  function navClickHandler(ev) {
    // allow ctrl/cmd click to open in new tab
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    ev.preventDefault();
    const a = ev.currentTarget;
    const page = a.dataset.page || extractPageFromHref(a.getAttribute('href')) || DEFAULT_PAGE;
    loadPage(page, true);
    // close mobile nav if open
    closeMobileNavIfOpen();
  }

  // Support inline onclick="loadPage('...')" from older markup
  window.loadPage = function (page) {
    if (!page) page = DEFAULT_PAGE;
    loadPage(page, true);
  };

  // Handle browser back/forward
  function handlePopState() {
    window.addEventListener('popstate', (ev) => {
      const state = ev.state;
      const page = (state && state.page) ? state.page : pageFromUrl();
      loadPage(page, false);
    });
  }

  // Mobile sidebar toggle helpers
  function wireSidebarToggle() {
    const btn = document.querySelector(SIDEBAR_TOGGLE_SELECTOR);
    if (!btn) return;
    btn.addEventListener('click', () => {
      const nav = document.querySelector('.nav');
      if (!nav) return;
      nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
    });
  }

  function closeMobileNavIfOpen() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    if (nav.classList.contains('open')) nav.classList.remove('open');
  }

  // Initialize the app
  function init() {
    // wire nav links
    wireNavLinks();

    // wire sidebar toggle
    wireSidebarToggle();

    // handle popstate
    handlePopState();

    // load initial page from URL or default
    const initialPage = pageFromUrl();
    // Replace state so popstate has something consistent
    history.replaceState({ page: initialPage }, '', buildUrlForPage(initialPage));
    loadPage(initialPage, false);

    // delegate clicks on internal links inside content to the loader
    document.addEventListener('click', (ev) => {
      const a = ev.target.closest('a');
      if (!a) return;
      // only intercept same-origin links that point to pages/*.html or ?page=
      const href = a.getAttribute('href') || '';
      const isInternalPage = href.startsWith('pages/') || href.includes('?page=') || a.dataset.page;
      if (isInternalPage) {
        // allow ctrl/cmd to open in new tab
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
        ev.preventDefault();
        const page = a.dataset.page || extractPageFromHref(href) || DEFAULT_PAGE;
        loadPage(page, true);
        closeMobileNavIfOpen();
      }
    });
  }

  // Run init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
