/*!
 * KEEPITIL Save + Badges — keepitil-save.js  v1.0
 * Self-injecting. Adds a KEEPITIL-X save icon (top-left) and high-confidence
 * auto-badges (max 3) to every .ev-flyer-card. Save state persists in
 * localStorage. Designed to overlay the frozen card template without editing
 * individual cards.
 */
(function () {
  if (window.__kilSaveInit) return;
  window.__kilSaveInit = true;

  var STORE = 'kilSavedEvents';

  /* ── Inject CSS ─────────────────────────────────────────────────────────── */
  var css = document.createElement('style');
  css.setAttribute('data-kil', 'save');
  css.textContent =
    /* save button */
    '.kil-save{position:absolute;top:8px;left:8px;z-index:6;width:28px;height:28px;' +
      'border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;' +
      'background:rgba(6,6,10,.55);border:1.5px solid #00ff88;color:#00ff88;font-size:.82rem;' +
      'font-weight:900;line-height:1;padding:0;backdrop-filter:blur(4px);' +
      '-webkit-backdrop-filter:blur(4px);transition:background .18s,color .18s,box-shadow .18s,transform .12s;}' +
    '.kil-save:hover{background:rgba(0,255,136,.18);transform:scale(1.06);}' +
    '.kil-save:active{transform:scale(.94);}' +
    '.kil-save.saved{background:#00ff88;color:#06120a;box-shadow:0 0 10px rgba(0,255,136,.55);}' +
    /* shift the date chip right on non-pick cards so it sits beside the save icon */
    '.ev-flyer-card:not(.ev-pick).has-kilsave .ev-fc-date{left:44px;}' +
    /* badges */
    '.kil-badges{position:absolute;left:8px;z-index:5;display:flex;flex-direction:column;gap:4px;' +
      'align-items:flex-start;pointer-events:none;}' +
    '.ev-flyer-card:not(.ev-pick) .kil-badges{top:44px;}' +
    '.ev-pick .kil-badges{top:66px;}' +
    '.kil-badge{font-size:.5rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;' +
      'padding:2px 6px;border-radius:3px;background:rgba(6,6,10,.72);color:#fff;' +
      'backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);white-space:nowrap;line-height:1.4;}' +
    '.kil-badge.free{background:rgba(0,200,90,.92);color:#04120a;}' +
    '.kil-badge.festival{background:rgba(180,0,220,.85);}' +
    '.kil-badge.warehouse{background:rgba(150,95,20,.9);}' +
    '.kil-badge.afterhours{background:rgba(30,30,80,.9);}';
  document.head.appendChild(css);

  /* ── State helpers ──────────────────────────────────────────────────────── */
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function save(obj) {
    try { localStorage.setItem(STORE, JSON.stringify(obj)); } catch (e) {}
  }

  /* ── Badge derivation (high-confidence keyword matches only) ─────────────── */
  function badgesFor(title, venue, price) {
    var t = (title + ' ' + venue).toLowerCase();
    var p = (price || '').toLowerCase();
    var out = [];
    if (/\bfree\b|free rsvp|free entry|rsvp/.test(p) || /\bfree\b/.test(t)) out.push(['free', '🆓 FREE']);
    if (/festival|\bfest\b|wonderland|\bcrssd\b|hard summer|escape/.test(t)) out.push(['festival', '🎪 FESTIVAL']);
    if (/warehouse|boiler room|\bindstrl\b/.test(t)) out.push(['warehouse', '🏭 WAREHOUSE']);
    if (/afterhours|after hours|\bafters\b|late night|open to close/.test(t)) out.push(['afterhours', '🌙 AFTERHOURS']);
    return out.slice(0, 3);
  }

  /* ── Enhance a single card ──────────────────────────────────────────────── */
  function enhance(card, saved) {
    if (card.__kilDone) return;
    card.__kilDone = true;

    var titleEl = card.querySelector('.ev-fc-title');
    var key = titleEl ? titleEl.textContent.trim() : '';
    if (!key) return;

    card.classList.add('has-kilsave');

    /* Save button */
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kil-save' + (saved[key] ? ' saved' : '');
    btn.setAttribute('aria-label', saved[key] ? 'Saved — tap to remove' : 'Save event');
    btn.setAttribute('aria-pressed', saved[key] ? 'true' : 'false');
    btn.textContent = '✕'; /* KEEPITIL X */
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var store = load();
      if (store[key]) { delete store[key]; btn.classList.remove('saved'); btn.setAttribute('aria-pressed', 'false'); btn.setAttribute('aria-label', 'Save event'); }
      else { store[key] = true; btn.classList.add('saved'); btn.setAttribute('aria-pressed', 'true'); btn.setAttribute('aria-label', 'Saved — tap to remove'); }
      save(store);
    });
    card.appendChild(btn);

    /* Badges (skip pick/partner cards' banner area duplication is fine — banner is separate) */
    var venueEl = card.querySelector('.ev-fc-venue');
    var priceEl = card.querySelector('.ev-fc-price');
    var venue = venueEl ? venueEl.textContent : '';
    var price = priceEl ? priceEl.textContent : '';
    var list = badgesFor(key, venue, price);
    if (list.length) {
      var wrap = document.createElement('div');
      wrap.className = 'kil-badges';
      list.forEach(function (b) {
        var el = document.createElement('span');
        el.className = 'kil-badge ' + b[0];
        el.textContent = b[1];
        wrap.appendChild(el);
      });
      card.appendChild(wrap);
    }
  }

  /* ── Run ────────────────────────────────────────────────────────────────── */
  function run() {
    var saved = load();
    document.querySelectorAll('.ev-flyer-card').forEach(function (c) { enhance(c, saved); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
