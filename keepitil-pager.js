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

  /* ── §I3 — the side rail is CONTENT, not chrome ────────────────────────────────────────────
     Which actions appear is a per-item-kind decision the owner can change without a code edit,
     the same principle as KIL_FLOATING. A VIDEO wants reshare; an ARTICLE does not want a
     comment button that opens an empty thread.

     Edit this table, not the pager. `kind` comes from the item (item.kind) or from the filter's
     own `kind`. Anything unmatched falls through to DEFAULT, so a new kind is never actionless.
     The pager only renders; the adapter decides what an action DOES via config.onAction. */
  var KIL_RAIL = {
    /* `open` is the §L open-on-platform action. It is REQUIRED on third-party items — KEEPITIL
       is embedding public content and must not imply ownership — and harmless on our own, so it
       is in the table rather than conditional. Removing it from a kind that carries third-party
       media is a rights regression, not a layout tweak. */
    video:   [{ id: "like", label: "Like", icon: "♥" },
              { id: "comment", label: "Comment", icon: "💬" },
              { id: "reshare", label: "Reshare", icon: "↻" },
              { id: "open", label: "Watch on source platform", icon: "↗" },
              { id: "save", label: "Save", icon: "⌘" }],
    article: [{ id: "like", label: "Like", icon: "♥" },
              { id: "save", label: "Save", icon: "⌘" }],
    pixle:   [{ id: "like", label: "Like", icon: "♥" },
              { id: "reshare", label: "Reshare", icon: "↻" },
              { id: "save", label: "Save", icon: "⌘" }],
    feed:    [{ id: "like", label: "Like", icon: "♥" },
              { id: "comment", label: "Comment", icon: "💬" },
              { id: "save", label: "Save", icon: "⌘" }],
    DEFAULT: [{ id: "like", label: "Like", icon: "♥" },
              { id: "save", label: "Save", icon: "⌘" }]
  };
  window.KIL_RAIL = window.KIL_RAIL || KIL_RAIL;
  window.KIL_RAIL_FOR = function (kind) {
    var t = window.KIL_RAIL || KIL_RAIL;
    var k = String(kind || "").toLowerCase();
    return (k && t[k]) || t.DEFAULT || [];
  };

  /* ── §I1 — the directional header, as a pure function ──────────────────────────────────────
     THIS TRACKS GESTURE DIRECTION, NOT SCROLL POSITION, and the distinction is the whole point.
     A position threshold ("show when scrollTop is near 0") re-shows the header at the top of
     every item, which is every time you land anywhere — the header would be permanently visible
     and the feature would do nothing while appearing to work.

     Kept pure and exported so this can be exercised directly: the browser is not needed to know
     whether swiping up twice in a row leaves the header hidden.

       up    swiping content up = moving to the NEXT item   -> hide, screen becomes pure content
       down  -> show
       left  -> show   (filter change)
       right -> show   (filter change)

     Anything else leaves the state alone; an ambiguous smudge must not toggle chrome. */
  function nextHeaderVisible(visible, dir) {
    if (dir === "up") return false;
    if (dir === "down" || dir === "left" || dir === "right") return true;
    return visible;
  }

  /* Dominant axis of a gesture, or null when it is too small to be an intentional swipe.
     MIN guards against a tap's jitter flickering the header. */
  var GESTURE_MIN = 24;
  function gestureDir(dx, dy) {
    var ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < GESTURE_MIN && ay < GESTURE_MIN) return null;
    if (ax > ay) return dx < 0 ? "left" : "right";
    return dy < 0 ? "up" : "down";
  }

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

      /* §I1 — the header is ONE WORD: the current filter. No page title, no wordmark.
         It FLOATS over the content (§I2), it does not displace it, so the item is full-bleed
         underneath. It still carries env(safe-area-inset-top) because it is the thing that
         would otherwise sit under the status bar — M1 is not superseded (§G). */
      "#kilp .kilp-head{position:absolute;top:0;left:0;right:0;z-index:10;display:flex;align-items:center;gap:10px;",
      "padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px;pointer-events:none;",
      "background:linear-gradient(180deg,rgba(10,10,15,.92),rgba(10,10,15,0));",
      "transform:translateY(0);opacity:1;transition:transform .22s ease,opacity .22s ease}",
      /* Hidden state. translateY(-120%) clears the gradient too, not just the text. */
      "#kilp.kilp-head-hidden .kilp-head{transform:translateY(-120%);opacity:0}",
      /* Reduced motion: it still hides and shows, it just cuts (§I1). */
      "@media(prefers-reduced-motion:reduce){#kilp .kilp-head{transition:none}}",
      "#kilp .kilp-title{margin:0;font:800 1.05rem/1 'Bebas Neue',Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#fff}",
      /* A primary filter reads differently at a glance — colour plus a dot, not size, so the
         header stays one word and the layout does not shift as you swipe onto it. */
      "#kilp.kilp-primary .kilp-title{color:var(--brand,#00b4ff)}",
      "#kilp.kilp-primary .kilp-title::after{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;",
      "background:var(--brand,#00b4ff);margin-left:7px;vertical-align:middle}",
      /* The count is orientation, not a title — it stays in the accessibility tree but off the
         screen, so the visible header really is one word. */
      "#kilp .kilp-count{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;",
      "clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}",

      /* Filter stepper — the keyboard/AT route, and a visible affordance. */
      "#kilp .kilp-fnav{margin-left:auto;display:flex;gap:6px;pointer-events:auto}",
      "#kilp .kilp-fnav button,#kilp .kilp-vnav button{width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.22);",
      "background:rgba(10,10,16,.6);color:#fff;font:700 1rem/1 Inter,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center}",
      "#kilp button:focus-visible{outline:2px solid #fff;outline-offset:2px}",
      "#kilp button[disabled]{opacity:.35;cursor:default}",

      /* Item stepper, bottom-LEFT: the chat icon owns bottom-right on every page (§C). */
      "#kilp .kilp-vnav{position:absolute;left:12px;bottom:12px;z-index:10;display:flex;flex-direction:column;gap:8px;pointer-events:auto}",
      /* CONTROLS REMOVED — Founder 2026-08-19: "remove the arrow icons to show the swipe left,
         right, down, up ... also remove the icons on the right side. they do nothing."
         Hidden rather than deleted: gotoItem(), the keyboard handler and the enable/disable
         logic all querySelector('#kilp-up'/'#kilp-down') and would throw on null. Swiping is
         unaffected — it was never driven by these buttons. The AI chat bubble is #kilo-btn,
         a separate element, so "keep the chat icon" needs no exception here. */
      "#kilp .kilp-vnav,#kilp .kilp-fnav,#kilp .kilp-rail-actions{display:none!important}",

      "#kilp .kilp-rail{position:absolute;inset:0;display:flex;overflow-x:auto;overflow-y:hidden;",
      "scroll-snap-type:x mandatory;overscroll-behavior:contain;scrollbar-width:none}",
      "#kilp .kilp-rail::-webkit-scrollbar{display:none}",

      /* Explicit reset: the pager is dropped into pages with their own type selectors, and a
         stray padding on the column or the slide silently destroys snap alignment. */
      "#kilp .kilp-col,#kilp .kilp-slide,#kilp .kilp-inner{margin:0;box-sizing:border-box}",
      "#kilp .kilp-col{padding:0!important;flex:0 0 100%;width:100%;height:100%;overflow-y:auto;overflow-x:hidden;",
      "scroll-snap-align:start;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none}",
      "#kilp .kilp-col::-webkit-scrollbar{display:none}",

      /* 100dvh, never vh — vh breaks when the iOS keyboard opens.
         §I2: FULL-BLEED. The old 64px top padding existed to clear the header; the header now
         floats over the item instead of displacing it, so that padding is gone. Adapters that
         need to keep text clear of the status bar read --kilp-safe-top rather than re-adding
         padding here, which would put the letterbox back. */
      "#kilp .kilp-slide{height:100%;scroll-snap-align:start;scroll-snap-stop:always;position:relative;",
      "display:flex;align-items:center;justify-content:center;padding:0;box-sizing:border-box;",
      "--kilp-safe-top:calc(52px + env(safe-area-inset-top,0px));",
      "--kilp-safe-bottom:calc(16px + env(safe-area-inset-bottom,0px))}",
      /* The slide IS the screen, so its content is centred in it. Radio's cards were drawn for
         a grid and are far shorter than a phone; left top-aligned they read as a broken page
         rather than a deliberate full-screen item. */
      /* isolation:isolate gives the slide content its own stacking context, so a card's
         internal z-indexes cannot paint over the pager's own chrome. Culture's feed cards
         carry a full-bleed header and a right-hand action rail, and without this they drew
         straight over the locked filter name and the item steppers. */
      "#kilp .kilp-inner{width:100%;height:100%;display:flex;align-items:center;justify-content:center;",
      "position:relative;z-index:0;isolation:isolate;",
      "overflow:auto;-webkit-overflow-scrolling:touch}",
      "#kilp .kilp-inner > *{width:100%;max-width:560px;margin:0 auto}",

      /* §I3 — per-kind action rail. Vertical, right edge, clear of the bottom nav. It sits
         ABOVE the content in z-order but is generated from KIL_RAIL, so what appears is a
         config decision, not a pager decision. */
      "#kilp .kilp-rail-actions{position:absolute;right:10px;bottom:calc(18px + env(safe-area-inset-bottom,0px));",
      "z-index:12;display:flex;flex-direction:column;gap:14px;pointer-events:auto}",
      "#kilp .kilp-act{width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.2);",
      "background:rgba(10,10,16,.55);color:#fff;font:600 1.05rem/1 Inter,sans-serif;cursor:pointer;",
      "display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}",
      "#kilp .kilp-act[aria-pressed=\"true\"]{background:rgba(255,92,138,.9);border-color:transparent}",
      /* The chat icon owns bottom-right on every page (§C/§A). When a page has chat, the rail
         lifts above it rather than stacking on top of it. */
      "body.kilp-chat #kilp .kilp-rail-actions{bottom:calc(78px + env(safe-area-inset-bottom,0px))}",

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
    /* §I3 — the pager renders the rail; the page decides what an action does. */
    this.onAction = config.onAction || function () {};
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

    /* ── §I1 gesture tracking ────────────────────────────────────────────────────────────────
       Passive listeners that only READ the gesture. Nothing is preventDefault'ed: the scroll
       itself stays native (§A forbids JS hijacking), and this rides alongside it.

       Deliberately NOT wired to the stepper buttons or the arrow keys. A pointer or keyboard
       user cannot "swipe down" to bring the header back, so hiding it on their navigation would
       strand them with no way to see which filter they are on. Touch hides it; touch restores
       it. Anyone else keeps the header. */
    var gx = null, gy = null;
    this._ts = function (e) {
      var t = e.touches && e.touches[0];
      if (!t) { gx = null; return; }
      gx = t.clientX; gy = t.clientY;
    };
    this._te = function (e) {
      if (gx == null) return;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) { gx = null; return; }
      var dir = gestureDir(t.clientX - gx, t.clientY - gy);
      gx = null;
      if (dir) self.setHeaderVisible(nextHeaderVisible(self.headerVisible, dir));
    };
    root.addEventListener("touchstart", this._ts, { passive: true });
    root.addEventListener("touchend", this._te, { passive: true });

    this.headerVisible = true;

    this.renderColumn(0);
    this.setFilter(0, true);
  };

  /** Show or hide the locked filter word. Idempotent — called on every settled gesture. */
  Pager.prototype.setHeaderVisible = function (v) {
    v = !!v;
    this.headerVisible = v;
    if (!this.root) return;
    this.root.classList.toggle("kilp-head-hidden", !v);
    /* Hidden chrome must leave the tab order and the a11y tree, not just the screen. */
    var head = this.root.querySelector(".kilp-head");
    if (head) head.setAttribute("aria-hidden", v ? "false" : "true");
    var fnav = this.root.querySelectorAll(".kilp-fnav button");
    [].forEach.call(fnav, function (b) { b.tabIndex = v ? 0 : -1; });
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

    this.renderRail(items[this.i]);
  };

  /**
   * §I3 — draw the action rail for the ACTIVE item's kind.
   *
   * The kind comes from the item first, then the filter — an adapter can mark individual items
   * (a Culture feed carries videos and articles side by side) or declare a whole column's kind
   * where every item is the same. The pager never decides which actions exist; it reads
   * KIL_RAIL_FOR and renders whatever is there.
   */
  Pager.prototype.renderRail = function (item) {
    if (!this.root) return;
    var host = this.root.querySelector(".kilp-rail-actions");
    var kind = (item && item.kind) || (this.filters[this.f] && this.filters[this.f].kind) || "";
    var actions = window.KIL_RAIL_FOR(kind) || [];

    if (!actions.length) { if (host) host.remove(); return; }
    if (!host) {
      host = document.createElement("div");
      host.className = "kilp-rail-actions";
      host.setAttribute("role", "group");
      host.setAttribute("aria-label", "Actions for this item");
      this.root.appendChild(host);
    }

    /* Rebuild only when the action SET changes, so a like stays pressed while scrolling within
       one kind and the buttons do not flicker on every item. */
    var sig = kind + ":" + actions.map(function (a) { return a.id; }).join(",");
    if (host.dataset.sig === sig) return;
    host.dataset.sig = sig;
    host.innerHTML = "";

    var self = this;
    actions.forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "kilp-act";
      b.dataset.act = a.id;
      b.setAttribute("aria-label", a.label || a.id);
      b.textContent = a.icon || "•";
      b.onclick = function () {
        var it = (self.filters[self.f].items() || [])[self.i];
        try { self.onAction(a.id, it, self.i, b); } catch (e) {}
      };
      host.appendChild(b);
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
    /* §D5 — a filter may be marked `primary`, and the header says so. VS's JOIN is the money
       action sitting fourth in a six-item swipe; rendering it identically to MY VOTES is how a
       conversion path disappears in plain sight. This is presentation only — the pager still
       treats every filter the same for navigation. */
    this.root.classList.toggle("kilp-primary", !!this.filters[fi].primary);
    /* §I1 — a filter change always brings the header back, whatever caused it: a left/right
       swipe, the stepper, or an arrow key. Every route lands here, so this is the one place it
       has to be said. Naming the new filter is the entire reason the header exists; changing
       filter while it is hidden would leave the reader on an unlabelled screen. */
    this.setHeaderVisible(true);
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

  /**
   * Programmatic moves are INSTANT, not smooth.
   *
   * Smooth scrolling let the state and the scroll position diverge: gotoFilter would set the
   * header to "Schedule" while the rail stayed parked on Playlist, because a queued smooth
   * animation can be dropped and there is no scroll event to correct it. A header naming a
   * column the user is not looking at is worse than an unanimated jump.
   *
   * Swiping — the primary interaction — is native and keeps its own momentum regardless; this
   * only affects the stepper buttons and arrow keys, where an instant move is arguably better.
   * The position is asserted, then verified and re-asserted once on the next frame.
   */
  Pager.prototype.scrollTo_ = function (el, prop, value) {
    el[prop] = value;
    var check = function () { if (Math.abs(el[prop] - value) > 1) el[prop] = value; };
    if (window.requestAnimationFrame) requestAnimationFrame(check); else setTimeout(check, 16);
  };

  Pager.prototype.gotoFilter = function (fi) {
    if (fi < 0 || fi >= this.filters.length) return;
    this.setFilter(fi);
    this.scrollTo_(this.rail, "scrollLeft", fi * this.rail.clientWidth);
  };

  Pager.prototype.gotoItem = function (ii) {
    var col = this.cols[this.f];
    var n = parseInt(col.dataset.n || "0", 10);
    if (ii < 0 || ii >= n) return;
    this.i = ii;
    this.updateCount();
    this.virtualize();
    this.scrollTo_(col, "scrollTop", ii * col.clientHeight);
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
    if (this.root && this._ts) {
      this.root.removeEventListener("touchstart", this._ts);
      this.root.removeEventListener("touchend", this._te);
    }
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
      /* ── PAGER DISABLED (Founder 2026-08-20) ────────────────────────────────────────────────
         "swipe should not work on any pages. swipe should not change the page either. only
         selecting the filter button changes the page."
         The pager IS the swipe: two nested scroll-snap containers that page horizontally by
         filter and vertically by item. Hiding its arrows (2026-08-19) removed the controls but
         left the gesture, so a swipe still changed filter or item. There is no way to keep the
         pager and lose the swipe — the swipe is the whole mechanism.
         mount() now no-ops, so Culture / Create / Earn fall back to their normal scrolling
         layouts with filter buttons at the top, the same model as the homepage. The file stays
         loaded because three pages call KIL_PAGER.mount() and a missing global would throw. */
      return null;

      /* eslint-disable no-unreachable */
      if (!window.matchMedia("(max-width:860px)").matches) return null;
      if (!config || !config.filters || !config.filters.length) return null;
      var p = new Pager(config);
      window.__kilPager = p;
      return p;
    },
    isMobile: function () { return window.matchMedia("(max-width:860px)").matches; },

    /* Exported so the §I1 rules can be tested as logic rather than as pixels. A test that
       drives a real gesture through a real WebView can only ever assert "the class is there";
       these let a test assert the RULE — that two up-swipes in a row leave the header hidden,
       which is exactly what a scroll-position implementation gets wrong. */
    _nextHeaderVisible: nextHeaderVisible,
    _gestureDir: gestureDir,
    _railFor: function (kind) { return window.KIL_RAIL_FOR(kind); }
  };
})();
