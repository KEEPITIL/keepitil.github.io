/* KEEPITIL V3 — single-source SHELL. Injects the universal header nav
   (Culture/Scene/Shop + LOGIN) + footer (links + social icons + legal) on every
   /v3 page. Themed via tokens. Replaces per-page headers/footers; keepitil-ai.js nav is neutralized. */
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
  /* Universal social: share-to-any-platform + save, site-wide on V3. Added 2026-07-11. */
  try{ if(!window.__kilSocialLoad){ window.__kilSocialLoad=1;
    var _so=document.createElement('script'); _so.defer=true; _so.src='/v3/keepitil-social.js'; document.head.appendChild(_so);
  } }catch(e){}
  /* In-app notification center (bell + panel + opt-in) — shows for logged-in members. Added 2026-07-12. */
  try{ if(!window.__kilNotifyLoad){ window.__kilNotifyLoad=1;
    var _no=document.createElement('script'); _no.defer=true; _no.src='/v3/keepitil-notify.js'; document.head.appendChild(_no);
  } }catch(e){}
  var NAV=[['/v3/culture','Culture'],['/v3/scene.html','Scene'],['/v3/shop.html','Shop']];
  var THEMES=[['default','Default','#00b4ff'],['spring','Spring','#22e39b'],['summer','Summer','#ff7a1a'],['fall','Fall','#ff3b4e'],['winter','Winter','#00b4ff'],['halloween','Halloween','#ff7a1a'],['holidays','Holidays','#e63946']];
  function build(){
    try{
      // remove existing header nav(s) + footer(s) + any injected mobile nav
      document.querySelectorAll('#main-nav, nav#main-nav, nav.main-nav, #v3shell-nav, footer, #kil-mnav, .kil-mnav').forEach(function(el){ el.remove(); });
      var links = NAV.map(function(n){ return '<a href="'+n[0]+'">'+n[1]+'</a>'; }).join('');
      var cur=document.documentElement.getAttribute('data-theme')||'default';
      var swatches = THEMES.map(function(t){return '<button class="v3t-sw'+(t[0]===cur?' on':'')+'" data-t="'+t[0]+'" title="'+t[1]+'" style="background:'+t[2]+'"></button>';}).join('');
      // KEEPITIL custom icon set (used in the mobile top-bar icon nav — icons only, no words)
      var ICON={
        culture:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c.5 4.2 1.8 5.5 6 6-4.2.5-5.5 1.8-6 6-.5-4.2-1.8-5.5-6-6 4.2-.5 5.5-1.8 6-6z"/></svg>',
        scene:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 8l3 6M16 8l-3 6M8.4 6.6h7.2"/><circle cx="6" cy="6" r="2.1"/><circle cx="18" cy="6" r="2.1"/><circle cx="12" cy="17" r="2.1"/></svg>',
        shop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 8h13.6l-1.1 12.2H6.3L5.2 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
        profile:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.6 3.2-5.6 7-5.6s7 2 7 5.6"/></svg>',
        settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.7-1.3-1.7-3-2 .8a7.6 7.6 0 0 0-2.6-1.5L14.2 3H9.8l-.3 2a7.6 7.6 0 0 0-2.6 1.5l-2-.8-1.7 3L4.6 10.5a7.6 7.6 0 0 0 0 3l-1.7 1.3 1.7 3 2-.8a7.6 7.6 0 0 0 2.6 1.5l.3 2h4.4l.3-2a7.6 7.6 0 0 0 2.6-1.5l2 .8 1.7-3-1.7-1.3z"/></svg>'
      };
      var iconRow='<div class="v3s-icons">'
        +'<a href="/v3/culture" aria-label="Culture">'+ICON.culture+'</a>'
        +'<a href="/v3/scene.html" aria-label="Scene">'+ICON.scene+'</a>'
        +'<a href="/v3/shop.html" aria-label="Shop">'+ICON.shop+'</a>'
        +'<a href="/v3/settings.html" aria-label="Settings">'+ICON.settings+'</a>'
        +'<a href="/v3/apply.html" id="v3s-iconprof" aria-label="Profile">'+ICON.profile+'</a>'
        +'</div>';
      var hdr = document.createElement('nav'); hdr.id='v3shell-nav';
      hdr.innerHTML =
        '<div class="v3s-inner">'
        +'<div class="v3s-brand">'
          +'<button class="v3s-logobtn" id="v3s-logobtn" title="Change style" aria-label="Home / change site style"><img class="v3s-logo" src="/keepitil-x-blue.png" alt="KEEPITIL"></button>'
          +'<a href="/v3/" class="v3s-brandtext">KEEPITIL</a>'
          +'<div class="v3t-pop" id="v3t-pop">'+swatches+'</div>'
        +'</div>'
        +'<div class="v3s-links">'+links+'</div>'
        +iconRow
        +'<a href="/v3/settings.html" class="v3s-gear" aria-label="Settings" title="Settings">'+ICON.settings+'</a>'
        +'<a href="/v3/apply.html" class="v3s-cta">LOGIN</a>'
        +'<button class="v3s-burger" aria-label="menu"><span></span><span></span><span></span></button>'
        +'</div>'
        +'<div class="v3s-menu">'+links+'<a href="/v3/settings.html">Settings</a><a href="/v3/apply.html" id="v3s-mlogin">Login</a></div>';
      document.body.insertBefore(hdr, document.body.firstChild);
      try{ document.body.style.paddingTop='66px'; }catch(e){}  // offset for the fixed universal nav (matches homepage)

      var f = document.createElement('footer'); f.id='v3-footer';
      f.innerHTML =
        '<div class="v3-foot-inner"><a href="/v3/" class="v3-foot-brand">KEEPITIL</a>'
        +'<nav class="v3-foot-links"><a href="/v3/">Home</a><a href="/v3/culture">Culture</a>'
        +'<a href="/v3/scene.html">Scene</a><a href="/v3/shop.html">Shop</a>'
        +'<a href="/v3/compete.html">Seasons</a><a href="/v3/crew.html">AI Crew</a>'
        +'<a href="/v3/apply.html">Login</a></nav>'
        +'<div class="v3-foot-social">'
          +'<a href="https://instagram.com/keepitil" target="_blank" rel="noopener" aria-label="KEEPITIL on Instagram"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2.2c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2zm0 3.2A6.6 6.6 0 1012 18.6 6.6 6.6 0 0012 5.4zm0 10.9a4.3 4.3 0 110-8.6 4.3 4.3 0 010 8.6zm6.85-11.2a1.54 1.54 0 11-3.08 0 1.54 1.54 0 013.08 0z"/></svg></a>'
          +'<a href="https://soundcloud.com/keepitil" target="_blank" rel="noopener" aria-label="KEEPITIL on SoundCloud"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M1.5 13.6c-.1 0-.15.07-.16.17l-.19 1.63.19 1.6c.01.1.06.17.16.17s.15-.07.16-.17l.22-1.6-.22-1.63c-.01-.1-.06-.17-.16-.17zm2.02.62c-.11 0-.18.08-.19.19l-.16 1 .16.97c.01.11.08.19.19.19s.18-.08.19-.19l.19-.97-.19-1c-.01-.11-.08-.19-.19-.19zm13.24-4.72c-.5 0-.98.1-1.41.29-.29-3.24-3.02-5.79-6.35-5.79-.82 0-1.62.16-2.32.44-.27.11-.34.22-.34.43v10.06c0 .22.17.4.38.42h10.04a2.94 2.94 0 002.94-2.94 2.94 2.94 0 00-2.94-2.91z"/></svg></a>'
          +'<a href="https://tiktok.com/@keepitil" target="_blank" rel="noopener" aria-label="KEEPITIL on TikTok"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16.6 5.82a4.28 4.28 0 01-1.06-2.82h-3.11v12.34a2.34 2.34 0 01-2.34 2.28 2.34 2.34 0 01-2.34-2.34 2.34 2.34 0 013.02-2.24V9.87a5.44 5.44 0 00-.68-.04A5.45 5.45 0 003.6 15.28a5.45 5.45 0 0010.9 0V8.9a7.35 7.35 0 004.3 1.38V7.16a4.28 4.28 0 01-2.2-1.34z"/></svg></a>'
        +'</div></div>'
        +'<div class="v3-foot-legal" style="max-width:var(--maxw,1400px);margin:14px auto 0;font-size:.78rem;opacity:.7;display:flex;gap:14px;flex-wrap:wrap;align-items:center">'
        +'<a href="/v3/terms.html">Terms</a><a href="/v3/privacy.html">Privacy</a><a href="/v3/refund.html">Refunds</a>'
        +'<a href="/v3/ticket-terms.html">Ticket Terms</a><a href="/v3/community-guidelines.html">Community Guidelines</a>'
        +'<span style="margin-left:auto">© '+(new Date().getFullYear())+' KEEPITIL</span></div>';
      document.body.appendChild(f);

      // active state on the mobile top-bar icon nav
      try{ var p=location.pathname; var amap={'/v3/culture':/culture/,'/v3/scene.html':/scene/,'/v3/shop.html':/shop/,'/v3/apply.html':/(u\.html|apply\.html|dashboard\.html)/};
        hdr.querySelectorAll('.v3s-icons a').forEach(function(a){ var h=a.getAttribute('href'); var rx=amap[h]; if(rx&&rx.test(p)) a.classList.add('on'); }); }catch(e){}

      // Theme-style switcher now lives on the top-left LOGO. Click the logo image -> popup of swatches.
      // The "KEEPITIL" text is the home link only. (Old bottom-left 🎨 fab removed.)
      var lb=hdr.querySelector('#v3s-logobtn'), pop=hdr.querySelector('#v3t-pop');
      if(lb&&pop){
        lb.addEventListener('click',function(e){ e.stopPropagation();
          /* on mobile the logo is HOME (no theme filter); on desktop it opens the style switcher */
          if(window.matchMedia('(max-width:860px)').matches){ location.href='/v3/'; return; }
          pop.classList.toggle('open'); });
        pop.querySelectorAll('.v3t-sw').forEach(function(sw){ sw.addEventListener('click',function(e){
          e.stopPropagation();
          var k=sw.dataset.t; document.documentElement.setAttribute('data-theme',k);
          try{ localStorage.setItem('kil-v3theme',k); }catch(e){}
          pop.querySelectorAll('.v3t-sw').forEach(function(x){ x.classList.toggle('on',x===sw); });
          pop.classList.remove('open');
        }); });
        document.addEventListener('click',function(){ pop.classList.remove('open'); });
      }

      style();
      var b=hdr.querySelector('.v3s-burger'), m=hdr.querySelector('.v3s-menu');
      if(b&&m) b.addEventListener('click',function(){ m.classList.toggle('open'); });
      authNav(hdr);   // signed in -> LOGIN becomes PROFILE (+ the notification bell shows)
    }catch(e){}
  }
  /* ── AUTH-AWARE NAV: the one CTA is LOGIN when logged out, PROFILE when logged in.
     The session persists (Supabase stores it) — you stay signed in on this device until
     you log out or trigger a global sign-out. The bell (keepitil-notify.js) only mounts
     when signed in, so logged-out visitors see LOGIN only, no bell. ── */
  var SB_URL="https://ovmqtzjfpzrbzrlkxwgw.supabase.co";
  var SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ";
  function ensureSB(cb){ if(window.supabase){cb();return;} var s=document.createElement('script'); s.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"; s.onload=cb; s.onerror=cb; document.head.appendChild(s); }
  function shellClient(){ try{ if(!window.__kilShellSB && window.supabase) window.__kilShellSB=window.supabase.createClient(SB_URL,SB_KEY); }catch(e){} return window.__kilShellSB||null; }
  function applyAuthState(hdr, s){
    if(!hdr) return;
    var cta=hdr.querySelector('.v3s-cta'), mlog=hdr.querySelector('#v3s-mlogin');
    if(cta){ cta.textContent = s?'PROFILE':'LOGIN'; cta.setAttribute('href', s?'/v3/u.html':'/v3/apply.html'); }
    if(mlog){ mlog.textContent = s?'Profile':'Login'; mlog.setAttribute('href', s?'/v3/u.html':'/v3/apply.html'); }
    var iprof=document.getElementById('v3s-iconprof'); if(iprof){ iprof.setAttribute('href', s?'/v3/u.html':'/v3/apply.html'); }
  }
  function authNav(hdr){
    ensureSB(function(){
      var c=shellClient(); if(!c) return;
      try{ c.auth.getSession().then(function(r){ applyAuthState(hdr, r&&r.data?r.data.session:null); }, function(){}); }catch(e){}
      if(!window.__kilShellAuthSub){ window.__kilShellAuthSub=1;
        try{ c.auth.onAuthStateChange(function(_e,session){ applyAuthState(document.getElementById('v3shell-nav'), session); }); }catch(e){}
      }
    });
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
    +'#v3shell-nav .v3s-brand{position:relative;display:flex;align-items:center;gap:10px}'
    +'#v3shell-nav .v3s-logobtn{background:none;border:0;padding:0;margin:0;cursor:pointer;display:flex;align-items:center;line-height:0}'
    +'#v3shell-nav .v3s-logobtn:hover{filter:drop-shadow(0 0 8px var(--brand,#00b4ff))}'
    +'#v3shell-nav .v3s-brandtext{font-family:"Bebas Neue",sans-serif;font-weight:400;letter-spacing:.13em;font-size:1.5rem;text-decoration:none;color:#fff}'
    +'#v3shell-nav .v3s-logo{height:44px;width:auto;mix-blend-mode:screen}'
    +'#v3shell-nav .v3t-pop{display:none;position:absolute;top:52px;left:0;flex-direction:row;gap:9px;background:#15151f;border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:10px 12px;box-shadow:0 12px 30px rgba(0,0,0,.5);z-index:1001}'
    +'#v3shell-nav .v3t-pop.open{display:flex}'
    +'#v3shell-nav .v3t-sw{width:24px;height:24px;border-radius:50%;border:2px solid rgba(255,255,255,.22);cursor:pointer;padding:0;transition:transform .15s}'
    +'#v3shell-nav .v3t-sw:hover{transform:scale(1.12)}'
    +'#v3shell-nav .v3t-sw.on{border-color:#fff;box-shadow:0 0 0 2px #fff}'
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
    +'#v3shell-nav .v3s-icons{display:none;align-items:center;gap:2px;margin-left:auto}'
    +'#v3shell-nav .v3s-icons a svg,#v3shell-nav .v3s-gear svg{width:23px;height:23px}'
    +'#v3shell-nav .v3s-gear{display:flex;align-items:center;color:#fff;opacity:.75;margin-right:12px;transition:opacity .2s}'
    +'#v3shell-nav .v3s-gear:hover{opacity:1}'
    +'#v3shell-nav .v3s-icons a{display:flex;align-items:center;justify-content:center;padding:8px;color:rgba(255,255,255,.72);text-decoration:none;transition:color .15s,transform .1s}'
    +'#v3shell-nav .v3s-icons a svg{width:25px;height:25px;display:block}'
    +'#v3shell-nav .v3s-icons a.on{color:var(--brand,#00b4ff)}'
    +'#v3shell-nav .v3s-icons a:active{transform:scale(.88)}'
    +'@media(max-width:860px){#v3shell-nav .v3s-links,#v3shell-nav .v3s-cta,#v3shell-nav .v3s-gear,#v3shell-nav .v3s-burger,#v3shell-nav .v3s-menu,#v3shell-nav .v3s-brandtext{display:none!important}#v3shell-nav .v3s-icons{display:flex}}'
    +'#v3-footer{border-top:1px solid var(--line,rgba(255,255,255,.08));background:var(--bg,#0a0a0f);color:var(--muted,#888);padding:40px 20px;margin-top:56px;font-family:var(--font,Inter,sans-serif);font-size:.85rem}'
    +'#v3-footer .v3-foot-inner{max-width:var(--maxw,1400px);margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}'
    +'#v3-footer .v3-foot-brand{font-weight:900;letter-spacing:.14em;font-size:1.05rem;background:linear-gradient(90deg,var(--brand,#00b4ff),var(--brand-2,#5cc8ff));-webkit-background-clip:text;background-clip:text;color:transparent;text-decoration:none}'
    +'#v3-footer .v3-foot-links{display:flex;gap:16px;font-weight:600;flex-wrap:wrap}#v3-footer a{color:inherit;text-decoration:none}#v3-footer .v3-foot-links a:hover{color:var(--brand,#00b4ff)}'
    +'#v3-footer .v3-foot-social{display:flex;gap:14px;align-items:center}#v3-footer .v3-foot-social a{color:var(--muted,#888);display:inline-flex;transition:color .2s,transform .2s}#v3-footer .v3-foot-social a:hover{color:var(--brand,#00b4ff);transform:translateY(-2px)}'
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
