/* KEEPITIL V3 — shared shell (footer). One source for the footer on every
   page; the header/nav is centralized via keepitil-ai.js. Themed via tokens. */
(function(){
  try{
    // Replace any existing footer(s) with the canonical one
    document.querySelectorAll('footer').forEach(function(f){ f.remove(); });
    var f = document.createElement('footer');
    f.id = 'v3-footer';
    f.innerHTML =
      '<div class="v3-foot-inner">'
      + '<a href="/v3/" class="v3-foot-brand">KEEPITIL</a>'
      + '<nav class="v3-foot-links">'
        + '<a href="/v3/culture">Culture</a>'
        + '<a href="/v3/scene.html">Scene</a>'
        + '<a href="/v3/apply.html">Login</a>'
        + '<a href="/v3/privacy.html">Privacy</a>'
      + '</nav>'
      + '<div class="v3-foot-social">IG · SC · TT</div>'
      + '</div>';
    document.body.appendChild(f);

    if(!document.getElementById('v3-shell-style')){
      var s = document.createElement('style'); s.id = 'v3-shell-style';
      s.textContent =
        '#v3-footer{border-top:1px solid var(--line,rgba(255,255,255,.08));background:var(--bg,#0a0a0f);'
        +'color:var(--muted,#888);padding:40px 20px;margin-top:56px;font-family:var(--font,Inter,sans-serif);font-size:.85rem}'
        +'#v3-footer .v3-foot-inner{max-width:var(--maxw,1400px);margin:0 auto;display:flex;justify-content:space-between;'
        +'align-items:center;gap:18px;flex-wrap:wrap}'
        +'#v3-footer .v3-foot-brand{font-weight:900;letter-spacing:.14em;font-size:1.05rem;'
        +'background:linear-gradient(90deg,var(--brand,#00b4ff),var(--brand-2,#5cc8ff));-webkit-background-clip:text;background-clip:text;color:transparent}'
        +'#v3-footer .v3-foot-links{display:flex;gap:18px;font-weight:600;flex-wrap:wrap}'
        +'#v3-footer a{color:inherit;text-decoration:none}'
        +'#v3-footer .v3-foot-links a:hover{color:var(--brand,#00b4ff)}';
      document.head.appendChild(s);
    }
  }catch(e){}
})();
