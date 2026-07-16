/* KODE embed loader — paste anywhere:
   <script src="https://your-domain/embed.js" data-profile="yourhandle" data-height="480"></script> */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var profile = s.getAttribute('data-profile');
  if (!profile) { console.warn('[KODE] data-profile attribute missing'); return; }
  var height = parseInt(s.getAttribute('data-height'), 10) || 480;
  var base = s.src.replace(/embed\.js(\?.*)?$/, '');
  var f = document.createElement('iframe');
  f.src = base + 'embed.html?profile=' + encodeURIComponent(profile);
  f.title = 'KODE schedule for @' + profile;
  f.loading = 'lazy';
  f.style.cssText = 'width:100%;max-width:560px;height:' + height + 'px;border:2px solid #071522;border-radius:16px;display:block;background:#f4fbff';
  s.parentNode.insertBefore(f, s);
})();
