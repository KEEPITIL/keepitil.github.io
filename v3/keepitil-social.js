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
  if (document.readyState !== "loading") autoInject();
  else document.addEventListener("DOMContentLoaded", autoInject);
})();
