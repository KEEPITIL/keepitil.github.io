/* KEEPITIL — universal social share + save.
   Client-only (no backend, no edge functions). Gives every page a "share to any
   platform" action (native OS share sheet where available, else a link menu:
   X, Facebook, WhatsApp, Telegram, Reddit, LinkedIn, Email, Copy link) plus a
   local Save. Used on event pages, blog articles, and image cards.

   API:  window.KEEPITIL.share({ title, text, url, image })
   Auto: any element with [data-kil-share] (+ optional data-share-title / -url / -text)
         opens the share menu on click. Blog <article> pages auto-get a Share button.
*/
(function () {
  var KE = (window.KEEPITIL = window.KEEPITIL || {});
  if (KE.__socialInit) return; KE.__socialInit = true;

  function enc(s) { return encodeURIComponent(s == null ? "" : String(s)); }

  function css() {
    if (document.getElementById("kil-social-css")) return;
    var s = document.createElement("style"); s.id = "kil-social-css";
    s.textContent =
      ".kil-share-ov{position:fixed;inset:0;z-index:99999;background:rgba(4,4,10,.66);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px}" +
      ".kil-share-card{width:100%;max-width:360px;background:#15151f;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:20px;font-family:Inter,system-ui,sans-serif;color:#f4f2fb;box-shadow:0 20px 60px rgba(0,0,0,.6)}" +
      ".kil-share-card h4{margin:0 0 4px;font-size:1.05rem;font-weight:800}" +
      ".kil-share-card .sub{color:#9a94b4;font-size:.8rem;margin:0 0 14px;word-break:break-all}" +
      ".kil-share-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}" +
      ".kil-share-grid a,.kil-share-copy{display:flex;align-items:center;gap:8px;padding:11px 12px;border-radius:11px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:#f4f2fb;text-decoration:none;font-size:.85rem;font-weight:600;cursor:pointer}" +
      ".kil-share-grid a:hover,.kil-share-copy:hover{background:rgba(0,180,255,.16);border-color:rgba(0,180,255,.4)}" +
      ".kil-share-copy{grid-column:1/-1;justify-content:center;margin-top:2px}" +
      ".kil-share-x{position:absolute;top:14px;right:16px;background:none;border:0;color:#9a94b4;font-size:1.3rem;cursor:pointer}" +
      ".kil-share-btn{display:inline-flex;align-items:center;gap:6px;cursor:pointer}";
    document.head.appendChild(s);
  }

  function openMenu(p) {
    css();
    var url = p.url || location.href;
    var title = p.title || document.title || "KEEPITIL";
    var text = p.text || title;
    var share = text + " " + url;
    var targets = [
      ["🔗 X", "https://twitter.com/intent/tweet?url=" + enc(url) + "&text=" + enc(text)],
      ["📘 Facebook", "https://www.facebook.com/sharer/sharer.php?u=" + enc(url)],
      ["🟢 WhatsApp", "https://wa.me/?text=" + enc(share)],
      ["✈ Telegram", "https://t.me/share/url?url=" + enc(url) + "&text=" + enc(text)],
      ["👽 Reddit", "https://www.reddit.com/submit?url=" + enc(url) + "&title=" + enc(text)],
      ["💼 LinkedIn", "https://www.linkedin.com/sharing/share-offsite/?url=" + enc(url)],
      ["✉ Email", "mailto:?subject=" + enc(text) + "&body=" + enc(share)]
    ];
    var ov = document.createElement("div"); ov.className = "kil-share-ov";
    var links = targets.map(function (t) {
      return '<a href="' + t[1] + '" target="_blank" rel="noopener">' + t[0] + "</a>";
    }).join("");
    ov.innerHTML =
      '<div class="kil-share-card" style="position:relative">' +
      '<button class="kil-share-x" aria-label="Close">✕</button>' +
      "<h4>Share</h4><div class=\"sub\">" + (title || "") + "</div>" +
      '<div class="kil-share-grid">' + links +
      '<button class="kil-share-copy">📋 Copy link</button>' +
      "</div></div>";
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector(".kil-share-x").addEventListener("click", close);
    ov.querySelector(".kil-share-copy").addEventListener("click", function () {
      var done = function () { this.textContent = "✓ Copied!"; }.bind(this);
      try { navigator.clipboard.writeText(url).then(done, function () {}); } catch (e) {}
    });
    ov.querySelectorAll(".kil-share-grid a").forEach(function (a) {
      a.addEventListener("click", function () { setTimeout(close, 150); });
    });
  }

  KE.share = function (p) {
    p = p || {};
    var url = p.url || location.href;
    var title = p.title || document.title || "KEEPITIL";
    var text = p.text || title;
    if (navigator.share) {
      navigator.share({ title: title, text: text, url: url }).catch(function () { openMenu({ url: url, title: title, text: text }); });
    } else {
      openMenu({ url: url, title: title, text: text });
    }
  };

  /* delegate clicks on any [data-kil-share] element */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-kil-share]");
    if (!b) return;
    e.preventDefault();
    KE.share({
      url: b.getAttribute("data-share-url") || location.href,
      title: b.getAttribute("data-share-title") || document.title,
      text: b.getAttribute("data-share-text") || ""
    });
  });

  /* auto-inject a Share button into blog <article> pages (events add their own) */
  function autoInject() {
    try {
      if (document.querySelector("[data-kil-share]")) return; // page provides its own
      var art = document.querySelector("article");
      if (!art) return;
      var h1 = art.querySelector("h1") || document.querySelector("h1");
      if (!h1) return;
      var btn = document.createElement("button");
      btn.className = "kil-share-btn";
      btn.setAttribute("data-kil-share", "");
      btn.style.cssText = "margin:14px 0;padding:9px 16px;border-radius:999px;border:1px solid rgba(0,180,255,.5);background:rgba(0,180,255,.12);color:#5cc8ff;font-weight:700;font-size:.82rem";
      btn.textContent = "↗ Share";
      h1.parentNode.insertBefore(btn, h1.nextSibling);
    } catch (e) {}
  }
  /* ---------- likes / reposts / saves / comments (Supabase-backed, graceful) ---------- */
  var SB_URL = "https://ovmqtzjfpzrbzrlkxwgw.supabase.co";
  var SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ";

  function ensureSupa(cb) {
    if (window.supabase) { cb(); return; }
    var s = document.createElement("script");
    s.src = "/assets/js/vendor/supabase-js.min.js";
    s.onload = cb; s.onerror = cb; document.head.appendChild(s);
  }
  function sbClient() { try { if (!KE.__sb && window.supabase) KE.__sb = window.supabase.createClient(SB_URL, SB_KEY); } catch (e) {} return KE.__sb || null; }

  function socialCss() {
    if (document.getElementById("kil-social2-css")) return;
    var s = document.createElement("style"); s.id = "kil-social2-css";
    s.textContent =
      ".kil-social-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:14px 0}" +
      ".kil-sa{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font:inherit;font-weight:700;font-size:.82rem;color:#cfc9e6;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:8px 14px}" +
      ".kil-sa:hover{border-color:rgba(0,180,255,.5);color:#fff}" +
      ".kil-sa.on{color:#ff3b6b;border-color:rgba(255,59,107,.5);background:rgba(255,59,107,.12)}" +
      ".kil-sa[data-k=save].on,.kil-sa[data-k=repost].on{color:#22e39b;border-color:rgba(34,227,155,.5);background:rgba(34,227,155,.12)}" +
      ".kil-cmt-panel{margin:6px 0 14px;max-width:640px}" +
      ".kil-cmt-new{display:flex;gap:8px;margin-bottom:10px}" +
      ".kil-cmt-in{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#f4f2fb;padding:10px 12px;font:inherit}" +
      ".kil-cmt-post{background:#00b4ff;color:#04121b;border:0;border-radius:10px;padding:0 16px;font-weight:800;cursor:pointer}" +
      ".kil-cmt{padding:9px 0;border-top:1px solid rgba(255,255,255,.06);font-size:.88rem;color:#e7e3f5}" +
      ".kil-cmt b{color:#5cc8ff}" +
      ".kil-cmt-empty,.kil-cmt-login{color:#9a94b4;font-size:.84rem;padding:6px 0}.kil-cmt-login a{color:#5cc8ff}";
    document.head.appendChild(s);
  }

  KE.socialBar = function (container, opts) {
    if (!container) return;
    socialCss();
    opts = opts || {};
    var type = opts.type || "event", id = String(opts.id || location.pathname), title = opts.title || document.title;
    var bar = document.createElement("div"); bar.className = "kil-social-bar";
    bar.innerHTML =
      '<button class="kil-sa" data-k="like"><span class="ic">♡</span> <b>0</b></button>' +
      '<button class="kil-sa" data-k="repost">🔁 <b>0</b></button>' +
      '<button class="kil-sa" data-k="save">🔖 <span class="lbl">Save</span></button>' +
      '<button class="kil-sa" data-k="comment">💬 <b>0</b></button>' +
      '<button class="kil-sa" data-kil-share data-share-title="' + String(title).replace(/"/g, "&quot;") + '">↗ Share</button>';
    container.appendChild(bar);
    var panel = document.createElement("div"); panel.className = "kil-cmt-panel"; panel.style.display = "none"; container.appendChild(panel);

    var sb = null, session = null, mine = { like: false, repost: false, save: false };
    function q(k) { return bar.querySelector('.kil-sa[data-k="' + k + '"]'); }
    function setCount(k, n) { var b = q(k) && q(k).querySelector("b"); if (b) b.textContent = n; }
    function paintMine() {
      var l = q("like"); if (l) { l.classList.toggle("on", mine.like); var ic = l.querySelector(".ic"); if (ic) ic.textContent = mine.like ? "♥" : "♡"; }
      var rp = q("repost"); if (rp) rp.classList.toggle("on", mine.repost);
      var s = q("save"); if (s) { s.classList.toggle("on", mine.save); var lbl = s.querySelector(".lbl"); if (lbl) lbl.textContent = mine.save ? "Saved" : "Save"; }
    }
    function loadCounts() {
      var c = sbClient(); if (!c) return;
      c.rpc("social_counts", { t_type: type, t_id: id }).then(function (r) {
        if (r && r.data && r.data[0]) { var d = r.data[0]; setCount("like", d.likes || 0); setCount("repost", d.reposts || 0); setCount("comment", d.comments || 0); }
      }).catch(function () {});
    }
    function loadMine() {
      if (!sb || !session) return;
      sb.from("social_actions").select("kind").eq("user_id", session.user.id).eq("target_type", type).eq("target_id", id)
        .then(function (r) { if (r && r.data) { r.data.forEach(function (x) { mine[x.kind] = true; }); paintMine(); } }).catch(function () {});
    }
    function toggle(kind) {
      if (!sb || !session) { location.href = "/v3/apply.html"; return; }
      var on = mine[kind]; mine[kind] = !on; paintMine();
      var cel = q(kind) && q(kind).querySelector("b");
      if (cel) cel.textContent = Math.max(0, (parseInt(cel.textContent, 10) || 0) + (on ? -1 : 1));
      if (on) sb.from("social_actions").delete().eq("user_id", session.user.id).eq("kind", kind).eq("target_type", type).eq("target_id", id).then(function () {}).catch(function () {});
      else sb.from("social_actions").insert({ user_id: session.user.id, kind: kind, target_type: type, target_id: id }).then(function () {}).catch(function () {});
    }
    function loadComments() {
      var c = sbClient(); if (!c) return;
      c.from("comments").select("author_handle,body,created_at").eq("target_type", type).eq("target_id", id).order("created_at", { ascending: false }).limit(50)
        .then(function (r) {
          var list = (r && r.data) || [];
          var html = session
            ? '<div class="kil-cmt-new"><input class="kil-cmt-in" maxlength="2000" placeholder="Add a comment…"/><button class="kil-cmt-post">Post</button></div>'
            : '<div class="kil-cmt-login"><a href="/v3/apply.html">Log in</a> to comment.</div>';
          html += list.length
            ? list.map(function (x) { return '<div class="kil-cmt"><b>@' + (x.author_handle || "member") + "</b> " + String(x.body).replace(/</g, "&lt;") + "</div>"; }).join("")
            : '<div class="kil-cmt-empty">Be the first to comment.</div>';
          panel.innerHTML = html;
          var pb = panel.querySelector(".kil-cmt-post");
          if (pb) pb.addEventListener("click", function () {
            var inp = panel.querySelector(".kil-cmt-in"); var body = (inp.value || "").trim(); if (!body) return;
            var handle = (session.user.user_metadata && session.user.user_metadata.handle) || null;
            sb.from("comments").insert({ user_id: session.user.id, author_handle: handle, target_type: type, target_id: id, body: body })
              .then(function () { inp.value = ""; loadComments(); loadCounts(); }).catch(function () {});
          });
        }).catch(function () {});
    }
    bar.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".kil-sa"); if (!b) return;
      var k = b.getAttribute("data-k");
      if (k === "comment") { panel.style.display = panel.style.display === "none" ? "block" : "none"; if (panel.style.display === "block") loadComments(); return; }
      if (k === "like" || k === "repost" || k === "save") toggle(k);
    });
    ensureSupa(function () {
      loadCounts();
      var c = sbClient();
      if (c) c.auth.getSession().then(function (r) { sb = c; session = r && r.data ? r.data.session : null; loadMine(); }, function () {});
    });
  };

  /* auto: put a social bar under blog <article> titles (events call KE.socialBar themselves) */
  function autoSocial() {
    try {
      var art = document.querySelector("article"); if (!art) return;
      var h1 = art.querySelector("h1") || document.querySelector("h1"); if (!h1) return;
      var slug = (location.pathname.split("/").pop() || "").replace(/\.html$/, "") || location.pathname;
      var holder = document.createElement("div");
      h1.parentNode.insertBefore(holder, h1.nextSibling);
      KE.socialBar(holder, { type: "blog", id: slug, title: (h1.textContent || document.title) });
    } catch (e) {}
  }

  /* blog <article> pages get the full social bar (which already includes Share);
     other pages just get the click-delegated [data-kil-share] behavior above. */
  function init() { if (document.querySelector("article")) autoSocial(); else autoInject(); }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
