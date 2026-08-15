/* ============================================================================================
   KEEPITIL — full-screen vertical pager with horizontal filter switching  (§A)
   ONE component. Culture, Radio and VS all mount this with a different filter set.

   The whole reason this is a separate file: Culture's tab row and Radio's tab row were the same
   widget once and are two different widgets today. A second copy of this would diverge inside a
   sprint.

   ── ARCHITECTURE ──────────────────────────────────────────────────────────────────────────
   Two nested CSS scroll-snap containers, no touch interception anywhere:

     .kilp-rail   horizontal, scroll-snap-type: x mandatory   -> one column per FILTER
       .kilp-col  vertical,   scroll-snap-type: y mandatory   -> one slide per ITEM

   Native scrolling on both axes means momentum, the iOS back-gesture, keyboard scrolling and
   assistive tech all keep working. Faking paging by intercepting touchmove breaks every one of
   those, which is why the directive forbids it.

   FILTER COUNT IS NOT FIXED. Radio has 3, VS has 2, Culture has 4. Nothing here hardcodes a
   count, an index range, or a filter name.

   ── VIRTUALIZATION ────────────────────────────────────────────────────────────────────────
   Every slide always occupies its full 100dvh so scroll geometry is correct, but only the
   current item ±1 has its content mounted. Everything else is an empty box of the right size.
   A ten-slide column of live embeds would otherwise mount ten players and stall the phone.
   Exactly one item is ever "active", and only the active one may play.

   ── SAFE AREA ─────────────────────────────────────────────────────────────────────────────
   The locked header pads by env(safe-area-inset-top). A full-viewport pager makes M1 worse, not
   better: locked content with no top inset runs straight under the status bar.

   Bottom edge sits above the nav via --kil-bnav-h, published by keepitil-shell.js.
   ============================================================================================ */
(function () {
  "use strict";

  if (window.KIL_PAGER) return;

  var STYLE_ID = "kilp-style";

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = [
      /* The pager owns the viewport between the status bar and the bottom nav. Note there is no
         overflow:hidden on html anywhere here — that trap blanked the mobile homepage once, and
         a self-contained scroll container does not need it. */
      "#kilp{position:fixed;left:0;right:0;top:0;bottom:var(--kil-bnav-h,56px);z-index:60;background:#0a0a0f;display:none}",
      "body.kilp-on #kilp{display:block}",
      /* While the pager owns the screen the page behind it must not also scroll. body, never
         html — locking html breaks position:fixed on iOS Safari. */
      "body.kilp-on{overflow:hidden;overscroll-behavior:contain}",

      /* Locked header: current filter name only. */
      "#kilp .kilp-head{position:absolute;top:0;left:0;right:0;z-index:3;display:flex;align-items:center;gap:10px;",
      "padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px;pointer-events:none;",
      "background:linear-gradient(180deg,rgba(10,10,15,.92),rgba(10,10,15,0))}",
      "#kilp .kilp-title{margin:0;font:800 1.05rem/1 'Bebas Neue',Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#fff}",
      "#kilp .kilp-count{font:700 .72rem/1 Inter,sans-serif;color:rgba(255,255,255,.6);letter-spacing:.08em}",

      /* Filter stepper — the keyboard/AT route, and a visible affordance. */
      "#kilp .kilp-fnav{margin-left:auto;display:flex;gap:6px;pointer-events:auto}",
      "#kilp .kilp-fnav button,#kilp .kilp-vnav button{width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.22);",
      "background:rgba(10,10,16,.6);color:#fff;font:700 1rem/1 Inter,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center}",
      "#kilp button:focus-visible{outline:2px solid #fff;outline-offset:2px}",
      "#kilp button[disabled]{opacity:.35;cursor:default}",

      /* Item stepper, bottom-LEFT: the chat icon owns bottom-right on every page (§C). */
      "#kilp .kilp-vnav{position:absolute;left:12px;bottom:12px;z-index:3;display:flex;flex-direction:column;gap:8px;pointer-events:auto}",

      "#kilp .kilp-rail{position:absolute;inset:0;display:flex;overflow-x:auto;overflow-y:hidden;",
      "scroll-snap-type:x mandatory;overscroll-behavior:contain;scrollbar-width:none}",
      "#kilp .kilp-rail::-webkit-scrollbar{display:none}",

      /* Explicit reset: the pager is dropped into pages with their own type selectors, and a
         stray padding on the column or the slide silently destroys snap alignment. */
      "#kilp .kilp-col,#kilp .kilp-slide,#kilp .kilp-inner{margin:0;box-sizing:border-box}",
      "#kilp .kilp-col{padding:0!important;flex:0 0 100%;width:100%;height:100%;overflow-y:auto;overflow-x:hidden;",
      "scroll-snap-align:start;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none}",
      "#kilp .kilp-col::-webkit-scrollbar{display:none}",

      /* 100dvh, never vh — vh breaks when the iOS keyboard opens. */
      "#kilp .kilp-slide{height:100%;scroll-snap-align:start;scroll-snap-stop:always;position:relative;",
      "display:flex;align-items:center;justify-content:center;padding:64px 14px calc(20px + env(safe-area-inset-bottom,0px));box-sizing:border-box}",
      /* The slide IS the screen, so its content is centred in it. Radio's cards were drawn for
         a grid and are far shorter than a phone; left top-aligned they read as a broken page
         rather than a deliberate full-screen item. */
      "#kilp .kilp-inner{width:100%;height:100%;display:flex;align-items:center;justify-content:center;",
      "overflow:auto;-webkit-overflow-scrolling:touch}",
      "#kilp .kilp-inner > *{width:100%;max-width:560px;margin:0 auto}",

      "#kilp .kilp-empty{color:rgba(255,255,255,.72);text-align:center;font:600 .95rem/1.5 Inter,sans-serif;max-width:32ch}",
      "#kilp .kilp-empty b{display:block;font-size:1.1rem;margin-bottom:6px;color:#fff}",
      "#kilp .kilp-empty a{color:var(--brand,#00b4ff)}",

      /* The account button is bottom-left too, and it is on death row (§B) pending the profile
         route decision. While the pager owns the screen it is hidden rather than shuffled —
         moving a control that is about to be deleted is wasted work. The chat icon STAYS:
         §A puts it bottom-right on every page, and §C makes it the only way to create. */
      "body.kilp-on #kil-macct{display:none!important}",
      "@media(prefers-reduced-motion:reduce){#kilp .kilp-rail,#kilp .kilp-col{scroll-behavior:auto}}",
      "@media(min-width:861px){body.kilp-on #kilp{display:none}body.kilp-on{overflow:auto}}"
    ].join("");
    document.head.appendChild(s);
  }

  /** Debounced "scrolling has settled" — snap position is only meaningful once it stops. */
  function onSettled(el, fn) {
    var t = null;
    el.addEventListener("scroll", function () {
      if (t) clearTimeout(t);
      t = setTimeout(fn, 90);
    }, { passive: true });
  }

  /**
   * Which slide is actually on screen, observed rather than inferred.
   *
   * Scroll events are the obvious signal and the wrong one to depend on alone: they are
   * throttled, they are not emitted at all for programmatic scrolls in some environments, and
   * the position mid-fling is meaningless anyway. IntersectionObserver reports the state that
   * matters — this slide is the one being looked at — and fires on layout, not on input.
   * The scroll-settle handler stays as a second signal; whichever notices first wins, and both
   * are idempotent.
   */
  function observeActive(root, cb) {
    if (!window.IntersectionObserver) return null;
    return new IntersectionObserver(function (entries) {
      var best = null;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
      });
      if (best) cb(best.target);
    }, { root: root, threshold: [0.55] });
  }

  function Pager(config) {
    this.filters = config.filters || [];
    this.emptyFor = config.emptyFor || function () { return null; };
    this.onActivate = config.onActivate || function () {};
    this.onDeactivate = config.onDeactivate || function () {};
    this.f = 0;      /* active filter index */
    this.i = 0;      /* active item index within that filter */
    this.cols = [];
    this.build();
  }

  Pager.prototype.build = function () {
    injectStyle();
    var self = this;

    var root = document.getElementById("kilp");
    if (root) root.remove();
    root = document.createElement("div");
    root.id = "kilp";

    /* The filter name is a REAL heading, not styled text — screen readers navigate by heading. */
    root.innerHTML =
      '<div class="kilp-head">' +
        '<h1 class="kilp-title" id="kilp-title" aria-live="polite">&nbsp;</h1>' +
        '<span class="kilp-count" id="kilp-count"></span>' +
        '<div class="kilp-fnav" role="group" aria-label="Change filter">' +
          '<button type="button" id="kilp-fprev" aria-label="Previous filter">‹</button>' +
          '<button type="button" id="kilp-fnext" aria-label="Next filter">›</button>' +
        '</div>' +
      '</div>' +
      '<div class="kilp-rail" id="kilp-rail"></div>' +
      '<div class="kilp-vnav" role="group" aria-label="Move through items">' +
        '<button type="button" id="kilp-up" aria-label="Previous item">↑</button>' +
        '<button type="button" id="kilp-down" aria-label="Next item">↓</button>' +
      '</div>';

    document.body.appendChild(root);
    document.body.classList.add("kilp-on");

    this.root = root;
    this.rail = root.querySelector("#kilp-rail");
    this.titleEl = root.querySelector("#kilp-title");
    this.countEl = root.querySelector("#kilp-count");

    this.filters.forEach(function (f, fi) {
      /* A DIV, not a <section>. radio.html styles bare `section`, and that padding leaked
         straight into the column: slides computed 728px inside a 788px container and the
         first slide started at offsetTop 31, so no scroll position was ever a snap point.
         The V3.1 rule against bare type selectors exists for exactly this. */
      var col = document.createElement("div");
      col.className = "kilp-col";
      col.dataset.f = String(fi);
      /* Each column is a labelled region, so the filter name reaches AT even though only one
         name is visible at a time. */
      col.setAttribute("role", "region");
      col.setAttribute("aria-label", f.label);
      self.rail.appendChild(col);
      self.cols.push(col);
      onSettled(col, function () { self.syncItem(); });
      col._io = observeActive(col, function (slide) {
        if (self.cols[self.f] !== col) return;          /* ignore columns we are not on */
        var ii = parseInt(slide.dataset.i, 10);
        if (isNaN(ii) || ii === self.i) return;
        self.i = ii; self.updateCount(); self.virtualize();
      });
    });

    onSettled(this.rail, function () { self.syncFilter(); });
    this._railIo = observeActive(this.rail, function (col) {
      var fi = self.cols.indexOf(col);
      if (fi >= 0 && fi !== self.f) self.setFilter(fi);
    });
    if (this._railIo) this.cols.forEach(function (c) { self._railIo.observe(c); });

    root.querySelector("#kilp-fprev").onclick = function () { self.gotoFilter(self.f - 1); };
    root.querySelector("#kilp-fnext").onclick = function () { self.gotoFilter(self.f + 1); };
    root.querySelector("#kilp-up").onclick    = function () { self.gotoItem(self.i - 1); };
    root.querySelector("#kilp-down").onclick  = function () { self.gotoItem(self.i + 1); };

    /* Arrow keys. Swipe-only navigation fails keyboard users outright. */
    this._key = function (e) {
      if (!document.body.classList.contains("kilp-on")) return;
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
      if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); self.gotoItem(self.i + 1); }
      else if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); self.gotoItem(self.i - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); self.gotoFilter(self.f + 1); }
      else if (e.key === "ArrowLeft")  { e.preventDefault(); self.gotoFilter(self.f - 1); }
    };
    document.addEventListener("keydown", this._key);

    this.renderColumn(0);
    this.setFilter(0, true);
  };

  /** Build the slide boxes for one filter. Boxes always exist; content is mounted lazily. */
  Pager.prototype.renderColumn = function (fi) {
    var f = this.filters[fi];
    var col = this.cols[fi];
    if (!f || !col || col.dataset.built === "1") return;
    col.dataset.built = "1";

    var items = f.items() || [];
    col.dataset.n = String(items.length);

    if (!items.length) {
      var slide = document.createElement("div");
      slide.className = "kilp-slide";
      var msg = this.emptyFor(f) || { title: "Nothing here yet", body: "" };
      slide.innerHTML = '<div class="kilp-empty"><b>' + msg.title + "</b>" + (msg.body || "") + "</div>";
      col.appendChild(slide);
      return;
    }

    items.forEach(function (item, ii) {
      var slide = document.createElement("div");
      slide.className = "kilp-slide";
      slide.dataset.i = String(ii);
      slide.appendChild(document.createElement("div")).className = "kilp-inner";
      col.appendChild(slide);
      if (col._io) col._io.observe(slide);
    });
  };

  /** Mount current ±1 only; unmount the rest. Never more than one item active. */
  Pager.prototype.virtualize = function () {
    var f = this.filters[this.f];
    var col = this.cols[this.f];
    if (!f || !col) return;
    var items = f.items() || [];
    var self = this;

    [].forEach.call(col.children, function (slide) {
      var ii = parseInt(slide.dataset.i, 10);
      if (isNaN(ii)) return;
      var want = Math.abs(ii - self.i) <= 1;
      var inner = slide.querySelector(".kilp-inner");
      if (!inner) return;
      if (want && inner.dataset.mounted !== "1") {
        inner.dataset.mounted = "1";
        try { f.render(items[ii], inner, ii); } catch (e) { inner.textContent = ""; }
      } else if (!want && inner.dataset.mounted === "1") {
        inner.dataset.mounted = "0";
        self.onDeactivate(items[ii], inner, ii);
        inner.innerHTML = "";
      }
    });

    /* Exactly one active item. */
    [].forEach.call(col.children, function (slide) {
      var ii = parseInt(slide.dataset.i, 10);
      var inner = slide.querySelector(".kilp-inner");
      if (isNaN(ii) || !inner) return;
      if (ii === self.i) self.onActivate(items[ii], inner, ii);
      else self.onDeactivate(items[ii], inner, ii);
    });
  };

  Pager.prototype.setFilter = function (fi, force) {
    if (fi < 0 || fi >= this.filters.length) return;
    if (!force && fi === this.f) return;
    /* Stop anything playing in the column we are leaving. */
    if (this.f !== fi) this.unmountColumn(this.f);
    this.f = fi;
    this.i = 0;
    this.renderColumn(fi);
    /* Neighbours get their boxes so the horizontal snap has somewhere to land. */
    this.renderColumn(fi - 1);
    this.renderColumn(fi + 1);
    this.titleEl.textContent = this.filters[fi].label;
    this.updateCount();
    this.virtualize();
    this.root.querySelector("#kilp-fprev").disabled = fi <= 0;
    this.root.querySelector("#kilp-fnext").disabled = fi >= this.filters.length - 1;
  };

  Pager.prototype.unmountColumn = function (fi) {
    var f = this.filters[fi], col = this.cols[fi];
    if (!f || !col) return;
    var items = f.items() || [];
    var self = this;
    [].forEach.call(col.children, function (slide) {
      var ii = parseInt(slide.dataset.i, 10);
      var inner = slide.querySelector(".kilp-inner");
      if (isNaN(ii) || !inner || inner.dataset.mounted !== "1") return;
      inner.dataset.mounted = "0";
      self.onDeactivate(items[ii], inner, ii);
      inner.innerHTML = "";
    });
  };

  Pager.prototype.updateCount = function () {
    var n = parseInt(this.cols[this.f].dataset.n || "0", 10);
    this.countEl.textContent = n ? (this.i + 1) + " / " + n : "";
    var up = this.root.querySelector("#kilp-up"), down = this.root.querySelector("#kilp-down");
    if (up) up.disabled = this.i <= 0;
    if (down) down.disabled = !n || this.i >= n - 1;
  };

  Pager.prototype.gotoFilter = function (fi) {
    if (fi < 0 || fi >= this.filters.length) return;
    this.rail.scrollTo({ left: fi * this.rail.clientWidth, behavior: "smooth" });
    this.setFilter(fi);
  };

  Pager.prototype.gotoItem = function (ii) {
    var col = this.cols[this.f];
    var n = parseInt(col.dataset.n || "0", 10);
    if (ii < 0 || ii >= n) return;
    col.scrollTo({ top: ii * col.clientHeight, behavior: "smooth" });
    this.i = ii;
    this.updateCount();
    this.virtualize();
  };

  /** Read the settled scroll position back — the scroll is the source of truth, not our index. */
  Pager.prototype.syncFilter = function () {
    var w = this.rail.clientWidth || 1;
    var fi = Math.round(this.rail.scrollLeft / w);
    if (fi !== this.f) this.setFilter(fi);
  };

  Pager.prototype.syncItem = function () {
    var col = this.cols[this.f];
    if (!col) return;
    var h = col.clientHeight || 1;
    var ii = Math.round(col.scrollTop / h);
    if (ii !== this.i) { this.i = ii; this.updateCount(); this.virtualize(); }
  };

  Pager.prototype.destroy = function () {
    document.removeEventListener("keydown", this._key);
    this.unmountColumn(this.f);
    document.body.classList.remove("kilp-on");
    if (this.root) this.root.remove();
  };

  window.KIL_PAGER = {
    /**
     * mount({ filters:[{id,label,items(),render(item,el,i)}], emptyFor(f), onActivate, onDeactivate })
     * Mobile only — the pager is a phone interaction, and the desktop layouts stay as they are.
     */
    mount: function (config) {
      if (!window.matchMedia("(max-width:860px)").matches) return null;
      if (!config || !config.filters || !config.filters.length) return null;
      var p = new Pager(config);
      window.__kilPager = p;
      return p;
    },
    isMobile: function () { return window.matchMedia("(max-width:860px)").matches; }
  };
})();
