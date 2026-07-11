/* KEEPITIL V3 — single-source SHELL. Injects the universal 5-hub header nav
   (Discover/Connect/Create/Grow/Earn) + footer on every /v3 page. Themed via
   tokens. Replaces per-page headers/footers; keepitil-ai.js nav is neutralized. */
(function(){
  try{var _st=localStorage.getItem('kil-v3theme'); if(_st) document.documentElement.setAttribute('data-theme',_st);}catch(e){}
  /* Google Analytics 4 — site-wide on V3 (property "keepitil", stream "KEEPITIL Web"). Added 2026-07-09. */
  try{ if(!window.__kilGA4){ window.__kilGA4='G-ZR36NRE4MT';
    var _g=document.createElement('script'); _g.async=true; _g.src='https://www.googletagmanager.com/gtag/js?id=G-ZR36NRE4MT'; document.head.appendChild(_g);
    window.dataLayer=window.dataLayer||[]; window.gtag=function(){dataLayer.push(arguments);}; gtag('js',new Date()); gtag('config','G-ZR36NRE4MT');
  } }catch(e){}
  /* Microsoft Clarity — heatmaps + session replay, site-wide on V3 (project "KEEPITIL"). Added 2026-07-10. */
  try{ if(!window.__kilClarity){ window.__kilClarity='xk5iwishve';
    (function(c,l,a,r,i){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};var t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;var y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","xk5iwishve");
  } }catch(e){}
  /* Customer feedback widget — V3 only (floating "Feedback" pill -> Supabase feedback table). Added 2026-07-10. */
  try{ if(!window.__kilFeedbackLoad){ window.__kilFeedbackLoad=1;
    var _fb=document.createElement('script'); _fb.defer=true; _fb.src='/v3/keepitil-feedback.js'; document.head.appendChild(_fb);
  } }catch(e){}
  var NAV=[['/v3/culture','Culture'],['/v3/scene.html','Scene'],['/v3/shop.html','Shop']];
  var THEMES=[['default','Default','#00b4ff'],['spring','Spring','#22e39b'],['summer','Summer','#ff7a1a'],['fall','Fall','#ff3b4e'],['winter','Winter','#00b4ff'],['halloween','Halloween','#ff7a1a'],['holidays','Holidays','#e63946']];
  function build(){
    try{
      // remove existing header nav(s) + footer(s) + any injected mobile nav
      document.querySelectorAll('#main-nav, nav#main-nav, nav.main-nav, #v3shell-nav, footer, #kil-mnav, .kil-mnav').forEach(function(el){ el.remove(); });
      var links = NAV.map(function(n){ return '<a href="'+n[0]+'">'+n[1]+'</a>'; }).join('');
      var hdr = document.createElement('nav'); hdr.id='v3shell-nav';
      hdr.innerHTML =
        '<div class="v3s-inner">'
        +'<a href="/v3/" class="v3s-brand"><img class="v3s-logo" src="/keepitil-x-blue.png" alt="KEEPITIL">KEEPITIL</a>'
        +'<div class="v3s-links">'+links+'</div>'
        +'<a href="/v3/apply.html" class="v3s-cta">LOGIN</a>'
        +'<button class="v3s-burger" aria-label="menu"><span></span><span></span><span></span></button>'
        +'</div>'
        +'<div class="v3s-menu">'+links+'<a href="/v3/apply.html">Login</a></div>';
      document.body.insertBefore(hdr, document.body.firstChild);
      try{ document.body.style.paddingTop='66px'; }catch(e){}  // offset for the fixed universal nav (matches homepage)

      var f = document.createElement('footer'); f.id='v3-footer';
      f.innerHTML =
        '<div class="v3-foot-inner"><a href="/v3/" class="v3-foot-brand">KEEPITIL</a>'
        +'<nav class="v3-foot-links"><a href="/v3/">Home</a><a href="/v3/culture">Culture</a>'
        +'<a href="/v3/scene.html">Scene</a><a href="/v3/shop.html">Shop</a>'
        +'<a href="/v3/compete.html">Seasons</a><a href="/v3/crew.html">AI Crew</a>'
        +'<a href="/v3/apply.html">Login</a></nav>'
        +'<div class="v3-foot-social">IG · SC · TT</div></div>';
      document.body.appendChild(f);

      // site-wide theme-style switcher (skip if a page already ships its own, e.g. profile pages)
      if(!document.querySelector('.theme-fab') && !document.getElementById('v3-theme')){
        var cur=document.documentElement.getAttribute('data-theme')||'default';
        var tf=document.createElement('div'); tf.id='v3-theme';
        tf.innerHTML='<button class="v3t-btn" aria-label="Change style" title="Change style">🎨</button>'
          +'<div class="v3t-pop">'+THEMES.map(function(t){return '<button class="v3t-sw'+(t[0]===cur?' on':'')+'" data-t="'+t[0]+'" title="'+t[1]+'" style="background:'+t[2]+'"></button>';}).join('')+'</div>';
        document.body.appendChild(tf);
        tf.querySelector('.v3t-btn').addEventListener('click',function(){ tf.classList.toggle('open'); });
        tf.querySelectorAll('.v3t-sw').forEach(function(sw){ sw.addEventListener('click',function(){
          var k=sw.dataset.t; document.documentElement.setAttribute('data-theme',k);
          try{ localStorage.setItem('kil-v3theme',k); }catch(e){}
          tf.querySelectorAll('.v3t-sw').forEach(function(x){ x.classList.toggle('on',x===sw); });
          tf.classList.remove('open');
        }); });
      }

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
     '#v3shell-nav{position:fixed;top:0;left:0;right:0;z-index:1000;background:rgba(10,10,18,.93);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid rgba(255,255,255,.07)}'
    +'#v3shell-nav .v3s-inner{max-width:1400px;margin:0 auto;height:66px;display:flex;align-items:center;padding:0 32px}'
    +'#v3shell-nav .v3s-brand{display:flex;align-items:center;gap:10px;font-family:"Bebas Neue",sans-serif;font-weight:400;letter-spacing:.13em;font-size:1.5rem;text-decoration:none;color:#fff}'
    +'#v3shell-nav .v3s-logo{height:44px;width:auto;mix-blend-mode:screen}'
    +'#v3shell-nav .v3s-links{flex:1;display:flex;justify-content:space-evenly;align-items:center}'
    +'#v3shell-nav .v3s-links a{font-family:"Bebas Neue",sans-serif;color:rgba(255,255,255,.75);font-weight:400;font-size:1.05rem;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;white-space:nowrap;transition:color .2s}'
    +'#v3shell-nav .v3s-links a:hover{color:#fff}'
    +'#v3shell-nav .v3s-cta{font-family:"Bebas Neue",sans-serif;border:2px solid var(--brand,#00b4ff);color:var(--brand,#00b4ff);padding:7px 22px;border-radius:4px;font-weight:400;font-size:1rem;letter-spacing:.14em;text-decoration:none;white-space:nowrap;transition:background .2s,color .2s}'
    +'#v3shell-nav .v3s-cta:hover{background:var(--brand,#00b4ff);color:#04121b}'
    +'#v3shell-nav .v3s-burger{display:none;flex-direction:column;gap:4px;background:none;border:0;cursor:pointer;padding:6px}'
    +'#v3shell-nav .v3s-burger span{width:22px;height:2px;background:var(--text,#f0f0f0);border-radius:2px}'
    +'#v3shell-nav .v3s-menu{display:none;flex-direction:column;padding:10px var(--sp-3,20px) 16px;border-top:1px solid var(--line,rgba(255,255,255,.08));gap:2px}'
    +'#v3shell-nav .v3s-menu.open{display:flex}'
    +'#v3shell-nav .v3s-menu a{color:var(--text,#f0f0f0);text-decoration:none;font-weight:700;font-size:.9rem;letter-spacing:.1em;text-transform:uppercase;padding:8px 0}'
    +'@media(max-width:860px){#v3shell-nav .v3s-links,#v3shell-nav .v3s-cta{display:none}#v3shell-nav .v3s-burger{display:flex}}'
    +'#v3-footer{border-top:1px solid var(--line,rgba(255,255,255,.08));background:var(--bg,#0a0a0f);color:var(--muted,#888);padding:40px 20px;margin-top:56px;font-family:var(--font,Inter,sans-serif);font-size:.85rem}'
    +'#v3-footer .v3-foot-inner{max-width:var(--maxw,1400px);margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}'
    +'#v3-footer .v3-foot-brand{font-weight:900;letter-spacing:.14em;font-size:1.05rem;background:linear-gradient(90deg,var(--brand,#00b4ff),var(--brand-2,#5cc8ff));-webkit-background-clip:text;background-clip:text;color:transparent;text-decoration:none}'
    +'#v3-footer .v3-foot-links{display:flex;gap:16px;font-weight:600;flex-wrap:wrap}#v3-footer a{color:inherit;text-decoration:none}#v3-footer .v3-foot-links a:hover{color:var(--brand,#00b4ff)}'
    +'#v3-theme{position:fixed;left:16px;bottom:124px;z-index:600;display:flex;flex-direction:column-reverse;align-items:center;gap:8px}'
    +'#v3-theme .v3t-btn{width:44px;height:44px;border-radius:50%;background:var(--surface,#15151f);border:1px solid var(--line,rgba(255,255,255,.14));color:var(--text,#f0f0f0);font-size:1.15rem;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.4);line-height:1}'
    +'#v3-theme .v3t-pop{display:none;flex-direction:column;gap:9px;background:var(--surface,#15151f);border:1px solid var(--line,rgba(255,255,255,.14));border-radius:26px;padding:10px;box-shadow:0 12px 30px rgba(0,0,0,.5)}'
    +'#v3-theme.open .v3t-pop{display:flex}'
    +'#v3-theme .v3t-sw{width:26px;height:26px;border-radius:50%;border:2px solid rgba(255,255,255,.22);cursor:pointer;padding:0;transition:transform .15s}'
    +'#v3-theme .v3t-sw:hover{transform:scale(1.12)}#v3-theme .v3t-sw.on{border-color:var(--text,#fff);box-shadow:0 0 0 2px var(--text,#fff)}';
    document.head.appendChild(s);
  }
  if(document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
