/* KEEPITIL V3 — single-source SHELL. Injects the universal 5-hub header nav
   (Discover/Connect/Create/Grow/Earn) + footer on every /v3 page. Themed via
   tokens. Replaces per-page headers/footers; keepitil-ai.js nav is neutralized. */
(function(){
  var NAV=[['/v3/discover.html','Discover'],['/v3/connect.html','Connect'],
           ['/v3/create.html','Create'],['/v3/grow.html','Grow'],['/v3/earn.html','Earn']];
  function build(){
    try{
      // remove existing header nav(s) + footer(s) + any injected mobile nav
      document.querySelectorAll('#main-nav, nav#main-nav, nav.main-nav, #v3shell-nav, footer, #kil-mnav, .kil-mnav').forEach(function(el){ el.remove(); });
      var links = NAV.map(function(n){ return '<a href="'+n[0]+'">'+n[1]+'</a>'; }).join('');
      var hdr = document.createElement('nav'); hdr.id='v3shell-nav';
      hdr.innerHTML =
        '<div class="v3s-inner">'
        +'<a href="/v3/" class="v3s-brand"><img class="v3s-logo" src="'+logoUrl()+'" alt="KEEPITIL">KEEPITIL</a>'
        +'<div class="v3s-links">'+links+'</div>'
        +'<a href="/v3/apply.html" class="v3s-cta">LOGIN</a>'
        +'<button class="v3s-burger" aria-label="menu"><span></span><span></span><span></span></button>'
        +'</div>'
        +'<div class="v3s-menu">'+links+'<a href="/v3/apply.html">Login</a></div>';
      document.body.insertBefore(hdr, document.body.firstChild);

      var f = document.createElement('footer'); f.id='v3-footer';
      f.innerHTML =
        '<div class="v3-foot-inner"><a href="/v3/" class="v3-foot-brand">KEEPITIL</a>'
        +'<nav class="v3-foot-links"><a href="/v3/discover.html">Discover</a><a href="/v3/connect.html">Connect</a>'
        +'<a href="/v3/create.html">Create</a><a href="/v3/grow.html">Grow</a><a href="/v3/earn.html">Earn</a>'
        +'<a href="/v3/apply.html">Login</a></nav>'
        +'<div class="v3-foot-social">IG · SC · TT</div></div>';
      document.body.appendChild(f);

      style();
      var b=hdr.querySelector('.v3s-burger'), m=hdr.querySelector('.v3s-menu');
      if(b&&m) b.addEventListener('click',function(){ m.classList.toggle('open'); });
    }catch(e){}
  }
  function logoUrl(){
    try{ var v=getComputedStyle(document.documentElement).getPropertyValue('--theme-logo').trim();
      var mm=v.match(/url\(([^)]+)\)/); return mm?mm[1].replace(/['"]/g,''):'/v3/logo-blue-nav.png';
    }catch(e){ return '/v3/logo-blue-nav.png'; }
  }
  function style(){
    if(document.getElementById('v3shell-style'))return;
    var s=document.createElement('style'); s.id='v3shell-style';
    s.textContent=
     '#v3shell-nav{position:sticky;top:0;z-index:500;background:color-mix(in srgb,var(--bg,#0a0a0f) 85%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--line,rgba(255,255,255,.08))}'
    +'#v3shell-nav .v3s-inner{max-width:var(--maxw,1400px);margin:0 auto;height:var(--nav-h,66px);display:flex;align-items:center;gap:20px;padding:0 var(--sp-3,20px)}'
    +'#v3shell-nav .v3s-brand{display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:.14em;font-size:1.15rem;text-decoration:none;background:linear-gradient(90deg,var(--brand,#00b4ff),var(--brand-2,#5cc8ff));-webkit-background-clip:text;background-clip:text;color:transparent}'
    +'#v3shell-nav .v3s-logo{height:30px;width:auto;mix-blend-mode:screen}'
    +'#v3shell-nav .v3s-links{flex:1;display:flex;justify-content:center;gap:34px}'
    +'#v3shell-nav .v3s-links a{color:var(--text,#f0f0f0);opacity:.85;font-weight:700;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;transition:opacity .2s,color .2s}'
    +'#v3shell-nav .v3s-links a:hover{opacity:1;color:var(--brand,#00b4ff)}'
    +'#v3shell-nav .v3s-cta{border:2px solid var(--brand,#00b4ff);color:var(--brand,#00b4ff);padding:8px 18px;border-radius:999px;font-weight:800;font-size:.72rem;letter-spacing:.12em;text-decoration:none}'
    +'#v3shell-nav .v3s-burger{display:none;flex-direction:column;gap:4px;background:none;border:0;cursor:pointer;padding:6px}'
    +'#v3shell-nav .v3s-burger span{width:22px;height:2px;background:var(--text,#f0f0f0);border-radius:2px}'
    +'#v3shell-nav .v3s-menu{display:none;flex-direction:column;padding:10px var(--sp-3,20px) 16px;border-top:1px solid var(--line,rgba(255,255,255,.08));gap:2px}'
    +'#v3shell-nav .v3s-menu.open{display:flex}'
    +'#v3shell-nav .v3s-menu a{color:var(--text,#f0f0f0);text-decoration:none;font-weight:700;font-size:.9rem;letter-spacing:.1em;text-transform:uppercase;padding:8px 0}'
    +'@media(max-width:860px){#v3shell-nav .v3s-links,#v3shell-nav .v3s-cta{display:none}#v3shell-nav .v3s-burger{display:flex}}'
    +'#v3-footer{border-top:1px solid var(--line,rgba(255,255,255,.08));background:var(--bg,#0a0a0f);color:var(--muted,#888);padding:40px 20px;margin-top:56px;font-family:var(--font,Inter,sans-serif);font-size:.85rem}'
    +'#v3-footer .v3-foot-inner{max-width:var(--maxw,1400px);margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}'
    +'#v3-footer .v3-foot-brand{font-weight:900;letter-spacing:.14em;font-size:1.05rem;background:linear-gradient(90deg,var(--brand,#00b4ff),var(--brand-2,#5cc8ff));-webkit-background-clip:text;background-clip:text;color:transparent;text-decoration:none}'
    +'#v3-footer .v3-foot-links{display:flex;gap:16px;font-weight:600;flex-wrap:wrap}#v3-footer a{color:inherit;text-decoration:none}#v3-footer .v3-foot-links a:hover{color:var(--brand,#00b4ff)}';
    document.head.appendChild(s);
  }
  if(document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
