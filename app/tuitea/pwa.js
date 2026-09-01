/* ==========================================================================
   TUITEA — web delivery runtime.
   Loaded by BOTH /app/tuitea/ (the install page) and /app/tuitea/app.html
   (the shell). It is the only place that knows about service workers,
   installation, update prompts and feature flags.

   Design notes worth keeping:
   - There is ONE TUITEA experience and one backend. This file delivers the web
     client of it. It contains no business logic and no second data model.
   - Apple exposes NO programmatic install on iOS. Anything that looked like a
     one-tap install button on iPhone would be a lie, so on iOS we show the
     real Share -> Add to Home Screen steps and nothing else.
   ========================================================================== */
(function () {
  'use strict';

  var SCOPE = '/app/tuitea/';
  var SHELL_VERSION = 1;          // bump with sw.js CACHE_VERSION on each deploy

  /* ---------------------------------------------------------------- env --- */
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) ||
              // iPadOS 13+ reports as Mac; touch points give it away.
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // On iOS every browser is WebKit, but ONLY Safari can add a real PWA to the
  // home screen. CriOS/FxiOS/EdgiOS/OPiOS must be told to switch to Safari.
  var isIOSSafari = isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
  var isStandalone = (window.matchMedia &&
                      window.matchMedia('(display-mode: standalone)').matches) ||
                     window.navigator.standalone === true;

  /* ------------------------------------------------------------- cohort --- */
  /* ?cohort=owner is how the owner marks this device once. It only decides
     which flags they see; it grants nothing. */
  function cohort() {
    try {
      var q = new URLSearchParams(location.search).get('cohort');
      if (q && /^[a-z]{1,16}$/.test(q)) localStorage.setItem('tuitea.cohort', q);
      return localStorage.getItem('tuitea.cohort') || 'public';
    } catch (e) { return 'public'; }
  }

  /* -------------------------------------------------------------- flags --- */
  var flagsPromise = null;
  function loadFlags() {
    if (flagsPromise) return flagsPromise;
    flagsPromise = fetch(SCOPE + 'flags.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (doc) {
        var who = cohort();
        var base = doc.flags || {};
        var over = (doc.cohorts || {})[who] || {};
        return {
          raw: doc,
          cohort: who,
          message: doc.message || null,
          stale: typeof doc.minShellVersion === 'number' &&
                 doc.minShellVersion > SHELL_VERSION,
          on: function (name) {
            if (Object.prototype.hasOwnProperty.call(over, name)) return !!over[name];
            return !!base[name];
          }
        };
      });
    return flagsPromise;
  }

  /* ----------------------------------------------------------------- ui --- */
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }

  function ensureStyles() {
    if (document.getElementById('tuitea-pwa-css')) return;
    var s = el('style', { id: 'tuitea-pwa-css' });
    s.textContent = [
      '.tuitea-pwa{background:var(--surface,#FFFDF8);border:1px solid var(--line,#E2D9C6);',
      'border-radius:var(--radius,16px);padding:1.25rem;margin:1.25rem 0}',
      '.tuitea-pwa h2{font-size:1.05rem;margin:0 0 .4rem}',
      '.tuitea-pwa p{margin:.35rem 0;color:var(--muted,#6E7566)}',
      '.tuitea-pwa ol{margin:.75rem 0 0;padding-left:1.15rem}',
      '.tuitea-pwa li{margin:.45rem 0}',
      '.tuitea-btn{display:inline-block;background:var(--forest,#3F7658);color:#fff;',
      'border:0;border-radius:999px;padding:.7rem 1.25rem;font:inherit;font-weight:600;',
      'cursor:pointer;text-decoration:none}',
      '.tuitea-share{display:inline-block;vertical-align:-.2em}',
      '#tuitea-update{position:fixed;left:0;right:0;bottom:0;z-index:9999;',
      'background:var(--forest,#3F7658);color:#fff;padding:.85rem 1rem;',
      'display:flex;gap:.75rem;align-items:center;justify-content:center;',
      'flex-wrap:wrap;font:600 15px/1.3 inherit;',
      'padding-bottom:calc(.85rem + env(safe-area-inset-bottom,0px))}',
      '#tuitea-update button{background:#fff;color:var(--forest-deep,#2F5B41);border:0;',
      'border-radius:999px;padding:.45rem 1rem;font:inherit;cursor:pointer}',
      '#tuitea-update .later{background:transparent;color:#fff;',
      'text-decoration:underline;padding:.45rem .5rem}'
    ].join('');
    document.head.appendChild(s);
  }

  /* The iOS share glyph, inline, so the instruction points at the actual icon
     the user is looking for instead of describing it in words. */
  var SHARE_SVG =
    '<svg class="tuitea-share" width="16" height="20" viewBox="0 0 16 20" ' +
    'aria-label="Share" role="img" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M8 1.5v11"/><path d="M4.5 5 8 1.5 11.5 5"/>' +
    '<path d="M3.5 8.5h-2v10h13v-10h-2"/></svg>';

  function installCard() {
    var card = el('div', { class: 'tuitea-pwa', id: 'tuitea-install' });

    if (isStandalone) {
      card.innerHTML = '<h2>TUITEA is installed</h2>' +
        '<p>You are using the installed app. It updates itself — no reinstalling.</p>';
      return card;
    }

    if (isIOS && !isIOSSafari) {
      card.innerHTML = '<h2>Install on this iPhone</h2>' +
        '<p>Adding TUITEA to the Home Screen only works from <b>Safari</b> on iOS. ' +
        'Open <code>keepitil.com/app/tuitea</code> in Safari and the steps will appear here.</p>';
      return card;
    }

    if (isIOSSafari) {
      /* No beforeinstallprompt exists on iOS and there is no API to trigger
         Add to Home Screen. These are the literal steps, not a fake button. */
      card.innerHTML = '<h2>Install TUITEA on this iPhone</h2>' +
        '<p>Three taps in Safari. It becomes a real icon on your Home Screen and ' +
        'opens without the browser bars.</p>' +
        '<ol>' +
          '<li>Tap the <b>Share</b> button ' + SHARE_SVG +
            ' — the square with an arrow, in the bar at the bottom of Safari.</li>' +
          '<li>Scroll the list and tap <b>Add to Home Screen</b>.</li>' +
          '<li>Tap <b>Add</b> in the top-right corner.</li>' +
        '</ol>' +
        '<p style="margin-top:.9rem">Open it from the new TUITEA icon. ' +
        'Updates arrive on their own — you never reinstall.</p>';
      return card;
    }

    // Android / desktop Chromium. Real button only once the browser has fired
    // beforeinstallprompt; until then, an honest fallback.
    card.innerHTML = '<h2>Install TUITEA</h2>' +
      '<p>Add TUITEA to this device so it opens like an app and updates itself.</p>' +
      '<p id="tuitea-install-slot"><span style="opacity:.8">If your browser offers ' +
      '“Install app” or “Add to Home screen” in its menu, that is this same app.</span></p>';
    return card;
  }

  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();          // WHY: keep the mini-infobar out of the way so
    deferredPrompt = e;          // the install happens from our own button.
    var slot = document.getElementById('tuitea-install-slot');
    if (!slot) return;
    slot.innerHTML = '';
    var b = el('button', { class: 'tuitea-btn', type: 'button' }, 'Install TUITEA');
    b.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (c) {
        if (c && c.outcome === 'accepted') slot.textContent = 'Installing…';
        deferredPrompt = null;
      });
    });
    slot.appendChild(b);
  });

  window.addEventListener('appinstalled', function () {
    var c = document.getElementById('tuitea-install');
    if (c) c.innerHTML = '<h2>TUITEA is installed</h2>' +
      '<p>Open it from your home screen. It updates itself.</p>';
  });

  /* ------------------------------------------------- update notification --- */
  function showUpdateBanner(worker) {
    if (document.getElementById('tuitea-update')) return;
    ensureStyles();
    var bar = el('div', { id: 'tuitea-update', role: 'status' });
    bar.appendChild(el('span', null, 'A new version of TUITEA is ready.'));
    var now = el('button', { type: 'button' }, 'Update now');
    var later = el('button', { type: 'button', class: 'later' }, 'Next time');
    now.addEventListener('click', function () {
      now.disabled = true; now.textContent = 'Updating…';
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
    later.addEventListener('click', function () { bar.remove(); });
    bar.appendChild(now); bar.appendChild(later);
    document.body.appendChild(bar);
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(SCOPE + 'sw.js', { scope: SCOPE })
      .then(function (reg) {
        // Already-waiting worker: an update downloaded on a previous visit.
        if (reg.waiting && navigator.serviceWorker.controller) {
          showUpdateBanner(reg.waiting);
        }
        reg.addEventListener('updatefound', function () {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', function () {
            // controller present => this is an UPDATE, not the first install.
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(sw);
            }
          });
        });

        // Check for a new version on launch and whenever the app is brought
        // back to the foreground. This is what makes "the owner gets updates
        // without reinstalling" true in practice: an installed PWA can sit
        // open for days and would otherwise never re-check.
        var check = function () { reg.update().catch(function () {}); };
        setTimeout(check, 3000);
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') check();
        });
        setInterval(check, 60 * 60 * 1000);
      })
      .catch(function () { /* SW unavailable (private mode, http) — app still works */ });

    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return;          // guard: controllerchange can fire twice
      reloading = true;
      location.reload();
    });
  }

  /* --------------------------------------------------------------- boot --- */
  function boot() {
    ensureStyles();
    cohort();
    registerSW();

    var onInstallPage = /\/app\/tuitea\/(index\.html)?$/.test(location.pathname);

    // Launched from the home screen icon: start_url is /app/tuitea/, so hand
    // straight over to the shell rather than showing the TestFlight page.
    if (onInstallPage && isStandalone) {
      location.replace(SCOPE + 'app.html' + location.search);
      return;
    }

    if (onInstallPage) {
      var wrap = document.querySelector('.wrap');
      var facts = document.querySelector('.facts');
      if (wrap) {
        var card = installCard();
        if (facts) wrap.insertBefore(card, facts); else wrap.appendChild(card);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }

  // Small public surface the shell (and future TUITEA web code) builds on.
  window.TUITEA = window.TUITEA || {};
  window.TUITEA.flags = loadFlags;
  window.TUITEA.cohort = cohort;
  window.TUITEA.env = { isIOS: isIOS, isIOSSafari: isIOSSafari, standalone: isStandalone,
                        shellVersion: SHELL_VERSION };
})();
