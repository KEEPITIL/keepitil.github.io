/* KEEPITIL V3 — single-source SHELL. Injects the universal header nav
   (Culture/Scene/Shop + LOGIN) + footer (links + social icons + legal) on every
   /v3 page. Themed via tokens. Replaces per-page headers/footers; keepitil-ai.js nav is neutralized. */
(function(){
  try{var _st=localStorage.getItem('kil-v3theme'); if(_st) document.documentElement.setAttribute('data-theme',_st);}catch(e){}
  /* ══ P1 STANDARDS REGULATOR (2026-07-16) — the shell OBEYS public.page_standards.
     This map MIRRORS the DB (source of truth); the daily audit enforces both stay in sync.
     One rule source drives radio bar, bell, and gear on every page — pages can no longer diverge.
     Override for a one-off page: set <html data-page-type="..."> ══ */
  var PAGE_TYPE=(function(){
    try{
      var ex=document.documentElement.getAttribute('data-page-type'); if(ex) return ex;
      var p=location.pathname;
      if(/\/v3\/(tickets|ticket|scan)\.html$/.test(p)) return 'checkout';
      if(/\/v3\/(campaigns|create-event|create-profile|create|create-comp|image-tool|post|settings)\.html$/.test(p)) return 'tool';
      if(/\/v3\/(admin-qa|dashboard|golive|qa-audit)\.html$/.test(p)) return 'dashboard';
      if(/\/v3\/offline\.html$/.test(p)) return 'system';
      if(/\/v3\/(agent|p|u)\.html$/.test(p)) return 'profile';
      if(/\/v3\/culture/.test(p)) return 'culture';
      if(/\/v3\/scene\.html$/.test(p)) return 'scene';
      if(/\/v3\/shop\.html$/.test(p)) return 'shop';
      if(/\/v3\/event\.html$/.test(p)) return 'event';
      if(/^\/(v3\/(index\.html)?)?$/.test(p)) return 'home';
      return 'standard';
    }catch(e){ return 'standard'; }
  })();
  /* Mirrors public.page_standards (corrected 2026-07-16): DESKTOP radio on EVERY page type
     except system; checkout (tickets/ticket/scan) is chromeless — nav:false, back-link only. */
  var PAGE_STD={
    home:{radio:true,bell:'never',gear:'none',nav:true}, culture:{radio:true,bell:'signed_in',gear:'none',nav:true},
    scene:{radio:true,bell:'never',gear:'none',nav:true}, shop:{radio:true,bell:'never',gear:'none',nav:true},
    event:{radio:true,bell:'never',gear:'none',nav:false}, profile:{radio:true,bell:'signed_in',gear:'hamburger',nav:true},/* event = chromeless card like checkout (Founder 2026-07-16: shell nav must not show on event page); radio stays on desktop */
    standard:{radio:true,bell:'never',gear:'none',nav:true}, tool:{radio:true,bell:'never',gear:'none',nav:true},
    dashboard:{radio:true,bell:'never',gear:'none',nav:true}, checkout:{radio:true,bell:'never',gear:'none',nav:false},
    system:{radio:false,bell:'never',gear:'none',nav:false}
  };
  var RULES=PAGE_STD[PAGE_TYPE]||PAGE_STD.standard;
  /* STRICT desktop/mobile separation (Founder 2026-07-16): mobile behavior is decided ONCE here.
     IN_IFRAME guard: embedded frames (e.g. the event chat) NEVER get bottom-nav/radio/banner —
     this was the "mobile filter bar" leaking into the desktop chat card. */
  var IN_IFRAME=false; try{ IN_IFRAME=(window.self!==window.top); }catch(e){ IN_IFRAME=true; }
  var IS_MOBILE=false; try{ IS_MOBILE=window.matchMedia('(max-width:860px)').matches; }catch(e){}
  try{ window.KIL=window.KIL||{}; window.KIL.pageType=PAGE_TYPE; window.KIL.pageRules=RULES; window.KIL.isMobile=IS_MOBILE; }catch(e){}
  /* Radio: DESKTOP = bar+audio on every page (standards). MOBILE = no bar anywhere;
     background AUDIO only on the homepage. Iframes: never. */
  try{
    var RADIO_ALLOWED = RULES.radio && !IN_IFRAME && (!IS_MOBILE || PAGE_TYPE==='home');
    if(!RADIO_ALLOWED){
      var _rk=document.createElement('style'); _rk.textContent='#kil-radio{display:none!important}'; document.head.appendChild(_rk);
      var _kill=function(){ try{ var b=document.getElementById('kil-radio'); if(b)b.remove(); }catch(e){} };
      document.addEventListener('DOMContentLoaded',function(){ _kill(); setTimeout(_kill,1200); });
    } else {
      document.addEventListener('DOMContentLoaded',function(){ try{
        if(!document.getElementById('kil-radio') && !document.querySelector('script[src*="keepitil-radio"]')){
          var _rs=document.createElement('script'); _rs.defer=true; _rs.src='/v3/keepitil-radio.js?v=20260718'; document.body.appendChild(_rs);
        }
      }catch(e){} });
    }
  }catch(e){}
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
  /* In-app notification center (bell + panel + opt-in) — logged-in members only.
     Standards-driven (page_standards.bell_visibility): bell loads only where the page type allows. */
  try{ if(!window.__kilNotifyLoad && RULES.bell==='signed_in'){ window.__kilNotifyLoad=1;
    var _no=document.createElement('script'); _no.defer=true; _no.src='/v3/keepitil-notify.js'; document.head.appendChild(_no);
  } }catch(e){}
  /* ── PWA: manifest + iOS install meta + service worker + install hint. Added 2026-07-16.
     SW is conservative: never caches page HTML or Supabase — see /sw.js. ── */
  try{
    if(!document.querySelector('link[rel="manifest"]')){ var _mf=document.createElement('link'); _mf.rel='manifest'; _mf.href='/manifest.webmanifest'; document.head.appendChild(_mf); }
    [['theme-color','#0b0b0b'],['apple-mobile-web-app-capable','yes'],['apple-mobile-web-app-status-bar-style','black-translucent'],['apple-mobile-web-app-title','KEEPITIL']].forEach(function(m){
      if(!document.querySelector('meta[name="'+m[0]+'"]')){ var t=document.createElement('meta'); t.name=m[0]; t.content=m[1]; document.head.appendChild(t); }
    });
    if(!document.querySelector('link[rel="apple-touch-icon"]')){ var _ai=document.createElement('link'); _ai.rel='apple-touch-icon'; _ai.href='/apple-touch-icon.png'; document.head.appendChild(_ai); }
    if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js').catch(function(){}); }
  }catch(e){}
  /* Install banner: Android/desktop via beforeinstallprompt; iOS gets a one-time Share hint. */
  try{
    var _IK='kil-pwa-hint-2026';
    var _standalone=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true;
    /* FOUNDER DIRECTIVE 2026-07-16: install UI is OFF until the real App Store launch.
       PWA plumbing (manifest, SW, push) stays live — only the prompt/banner is suppressed. */
    var _INSTALL_UI=false;
    if(_INSTALL_UI && !_standalone && !localStorage.getItem(_IK)){
      var _dismiss=function(){ try{localStorage.setItem(_IK,'1');}catch(e){} var b=document.getElementById('kil-pwa-banner'); if(b)b.remove(); };
      var _show=function(msg,btnLabel,onBtn){
        if(document.getElementById('kil-pwa-banner'))return;
        var b=document.createElement('div'); b.id='kil-pwa-banner';
        b.style.cssText='position:fixed;left:12px;right:12px;bottom:104px;z-index:900;background:#12121c;border:1px solid #2a2a3a;border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 10px 30px rgba(0,0,0,.5);font-family:Inter,system-ui,sans-serif;font-size:.85rem;color:#f0f0f0;max-width:520px;margin:0 auto';
        b.innerHTML='<img src="/icon-192.png" alt="" style="width:34px;height:34px;border-radius:8px;flex:0 0 34px">'+
          '<span style="flex:1;line-height:1.35">'+msg+'</span>'+
          (btnLabel?'<button id="kil-pwa-go" style="background:linear-gradient(90deg,#00b4ff,#22e39b);color:#04121b;border:0;border-radius:9px;padding:8px 14px;font-weight:800;cursor:pointer;font-family:inherit;white-space:nowrap">'+btnLabel+'</button>':'')+
          '<button id="kil-pwa-x" aria-label="Dismiss" style="background:none;border:0;color:#9aa0b0;font-size:1.1rem;cursor:pointer;padding:4px">&times;</button>';
        document.body.appendChild(b);
        var x=document.getElementById('kil-pwa-x'); if(x)x.addEventListener('click',_dismiss);
        var g=document.getElementById('kil-pwa-go'); if(g&&onBtn)g.addEventListener('click',onBtn);
      };
      var _ios=/iphone|ipad|ipod/i.test(navigator.userAgent||'');
      var _dp=null;
      /* Full-screen step-by-step overlay for when no native prompt is available (iOS always; Android if the prompt was consumed). */
      var _instr=function(){
        if(document.getElementById('kil-pwa-instr'))return;
        var steps=_ios
          ? '1. Tap the <b>Share</b> icon <span style="font-size:1.1em">&#x2191;</span> at the bottom of Safari.<br>2. Scroll down and tap <b>Add to Home Screen</b>.<br>3. Tap <b>Add</b> — KEEPITIL lands on your home screen.'
          : '1. Open your browser menu <b>&#8942;</b> (top-right).<br>2. Tap <b>Install app</b> or <b>Add to Home screen</b>.<br>3. Confirm — KEEPITIL lands on your home screen.';
        var o=document.createElement('div'); o.id='kil-pwa-instr';
        o.style.cssText='position:fixed;inset:0;z-index:1200;background:rgba(4,6,12,.88);display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif';
        o.innerHTML='<div style="background:#12121c;border:1px solid #2a2a3a;border-radius:16px;max-width:360px;width:100%;padding:22px;color:#f0f0f0;box-shadow:0 20px 60px rgba(0,0,0,.6)">'+
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><img src="/icon-192.png" alt="" style="width:38px;height:38px;border-radius:9px">'+
          '<span style="font-weight:800;font-size:1.05rem">Install KEEPITIL</span></div>'+
          '<p style="line-height:1.6;font-size:.9rem;color:#d5d8e2;margin:0 0 16px">'+steps+'</p>'+
          '<button id="kil-pwa-instr-x" style="width:100%;background:linear-gradient(90deg,#00b4ff,#22e39b);color:#04121b;border:0;border-radius:10px;padding:11px;font-weight:800;cursor:pointer;font-family:inherit">Got it</button></div>';
        o.addEventListener('click',function(e){ if(e.target===o||e.target.id==='kil-pwa-instr-x'){ o.remove(); } });
        document.body.appendChild(o);
      };
      /* The banner button ALWAYS does something: native prompt if we have it, else instructions. */
      var _onInstall=function(){
        if(_dp){ try{ _dp.prompt(); _dp.userChoice.then(_dismiss); _dp=null; return; }catch(e){} }
        _instr();
      };
      var _showBanner=function(){ _show('Add <b>KEEPITIL</b> to your home screen — events, scene &amp; radio, one tap away.','Install',_onInstall); };
      window.addEventListener('beforeinstallprompt',function(ev){ ev.preventDefault(); _dp=ev; _showBanner(); });
      window.addEventListener('appinstalled',_dismiss);
      /* iOS never fires beforeinstallprompt, so show the banner ourselves; its button opens the instructions. */
      if(_ios){ setTimeout(_showBanner,2600); }
    }
  }catch(e){}
  /* ── KIL.eventDate / KIL.localDate — THE sitewide event date formatter. Added 2026-07-16.
     Events happen in the VENUE's timezone (events.tz, default America/Los_Angeles) — never the
     viewer's, never UTC. A stored 2026-08-17 04:00Z late-night event is SUN AUG 16 in LA;
     rendering UTC (or slicing the ISO string) shows the wrong weekday + day. Always use these. ── */
  try{
    window.KIL=window.KIL||{};
    window.KIL.TZ_DEFAULT='America/Los_Angeles';
    window.KIL.eventDate=function(iso,tz){
      try{
        if(!iso) return {weekday:'',date:'',time:'',full:'Date TBD'};
        var d=new Date(iso); if(isNaN(d)) return {weekday:'',date:'',time:'',full:''};
        tz=tz||window.KIL.TZ_DEFAULT;
        var f=function(o){ o.timeZone=tz; return new Intl.DateTimeFormat('en-US',o).format(d); };
        var w=f({weekday:'short'}), dt=f({month:'short',day:'numeric',year:'numeric'}), tm=f({hour:'numeric',minute:'2-digit'});
        return {weekday:w,date:dt,time:tm,full:w+', '+dt+' · '+tm};
      }catch(e){ return {weekday:'',date:'',time:'',full:''}; }
    };
    /* local calendar date as YYYY-MM-DD in the event's tz (for grouping/dedupe keys) */
    window.KIL.localDate=function(iso,tz){
      try{
        if(!iso) return '';
        var d=new Date(iso); if(isNaN(d)) return '';
        return new Intl.DateTimeFormat('en-CA',{timeZone:tz||window.KIL.TZ_DEFAULT,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
      }catch(e){ return String(iso).slice(0,10); }
    };
  }catch(e){}
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
      if(RULES.gear==='hamburger') hdr.classList.add('on-profile');
      hdr.innerHTML =
        '<div class="v3s-inner">'
        +'<div class="v3s-brand">'
          +'<button class="v3s-logobtn" id="v3s-logobtn" title="Change style" aria-label="Home / change site style"><img class="v3s-logo" src="/keepitil-x-blue.png" alt="KEEPITIL"></button>'
          +'<a href="/v3/" class="v3s-brandtext">KEEPITIL</a>'
          +'<div class="v3t-pop" id="v3t-pop">'+swatches+'</div>'
        +'</div>'
        +'<div class="v3s-links">'+links+'</div>'
        +iconRow
        /* P0c (Founder 2026-07-16): NO settings gear in the shell nav — Settings is reachable ONLY via the profile-page hamburger. */
        +'<a href="/v3/apply.html" class="v3s-cta">LOGIN</a>'
        +'<button class="v3s-burger" aria-label="menu"><span></span><span></span><span></span></button>'
        +'</div>'
        +'<div class="v3s-menu">'+links+'<a href="/v3/settings.html">Settings</a><a href="/v3/apply.html" id="v3s-mlogin">Login</a></div>';
      /* checkout/system pages are chromeless (page_standards.loads_shell_nav=false): no top nav.
         Mobile: the top bar is REMOVED entirely (bottom-nav only) — desktop keeps it as-is. */
      if(RULES.nav!==false){
        document.body.insertBefore(hdr, document.body.firstChild);
        try{ if(!IS_MOBILE) document.body.style.paddingTop='66px'; }catch(e){}  // desktop offset for the fixed nav
      }

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
      if(RULES.nav!==false) document.body.appendChild(f);

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

      /* ── MOBILE BOTTOM NAV (Instagram model, 2026-07-16): 5 icons pinned bottom on ≤860px.
         Replaces the radio bar UI on mobile — the radio bar is moved off-screen (NOT removed),
         so the audio engine keeps playing in the background. Desktop unchanged. ── */
      try{
        var oldbn=document.getElementById('kil-bnav'); if(oldbn) oldbn.remove();
        if(!IN_IFRAME){   /* NEVER inside embedded frames — this leaked into the desktop chat card */
          var bn=document.createElement('nav'); bn.id='kil-bnav';
          bn.innerHTML=
            '<a href="/v3/" id="kb-home" aria-label="Home"><img src="'+(logoUrl()||'/v3/logo-blue-nav.png')+'" alt="Home" onerror="this.onerror=null;this.src=\'/v3/logo-blue-nav.png\'"></a>'
            +'<a href="/v3/culture" aria-label="Culture">'+ICON.culture+'</a>'
            +'<a href="/v3/scene.html" aria-label="Scene">'+ICON.scene+'</a>'
            +'<a href="/v3/shop.html" aria-label="Shop">'+ICON.shop+'</a>'
            +'<a href="/v3/apply.html" id="kb-prof" aria-label="Profile">'+ICON.profile+'</a>';
          document.body.appendChild(bn);
          var _bp=location.pathname;
          var _bmap=[/^\/v3\/(index\.html)?$/, /culture/, /scene/, /shop/, /(u\.html|apply\.html|dashboard\.html)/];
          bn.querySelectorAll('a').forEach(function(a,i){ if(_bmap[i]&&_bmap[i].test(_bp)) a.classList.add('on'); });
          /* mobile-only floating Settings hamburger on profile pages (top bar is gone on mobile) */
          if(RULES.gear==='hamburger'){
            var mh=document.createElement('a'); mh.id='kil-mhamb'; mh.href='/v3/settings.html'; mh.setAttribute('aria-label','Settings');
            mh.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
            document.body.appendChild(mh);
          }
        }
      }catch(e){}
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
    /* mobile floating hamburger: profile pages, signed-in, mobile viewport only */
    try{ var mh=document.getElementById('kil-mhamb'); if(mh) mh.style.display=(s&&IS_MOBILE)?'flex':'none'; }catch(e){}
    if(!hdr){ var kb0=document.getElementById('kb-prof'); if(kb0) kb0.setAttribute('href', s?'/v3/u.html':'/v3/apply.html'); return; }
    /* On the profile page (and only there), the top-right control becomes a hamburger -> Settings.
       Applies to BOTH desktop (.v3s-cta) and mobile (top icon row). Founder directive 2026-07-16. */
    var onProfile=(RULES.gear==='hamburger');   /* standards-driven: page_standards.gear_rule */
    var HAMB='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    var cta=hdr.querySelector('.v3s-cta'), mlog=hdr.querySelector('#v3s-mlogin');
    if(cta){
      if(s && onProfile){ cta.innerHTML=HAMB; cta.setAttribute('href','/v3/settings.html'); cta.setAttribute('title','Settings'); cta.setAttribute('aria-label','Settings'); cta.classList.add('v3s-hamb'); }
      else { cta.textContent = s?'PROFILE':'LOGIN'; cta.setAttribute('href', s?'/v3/u.html':'/v3/apply.html'); cta.classList.remove('v3s-hamb'); }
    }
    if(mlog){ mlog.textContent = s?'Profile':'Login'; mlog.setAttribute('href', s?'/v3/u.html':'/v3/apply.html'); }
    var iprof=document.getElementById('v3s-iconprof');
    if(iprof){
      if(s && onProfile){ iprof.innerHTML=HAMB; iprof.setAttribute('href','/v3/settings.html'); iprof.setAttribute('aria-label','Settings'); }
      else iprof.setAttribute('href', s?'/v3/u.html':'/v3/apply.html');
    }
    var kb=document.getElementById('kb-prof'); if(kb) kb.setAttribute('href', s?'/v3/u.html':'/v3/apply.html');
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
    /* FOUNDER 2026-07-16 (P1): full Instagram on mobile — bottom nav ONLY. The top icon row is gone;
       the ONLY survivor is the Settings hamburger slot on the profile page (top-right, per directive). */
    /* MOBILE (Founder 2026-07-16): the top bar is REMOVED entirely — bottom nav only.
       Profile pages get a floating Settings hamburger instead (signed-in only, JS-toggled). */
    +'@media(max-width:860px){#v3shell-nav{display:none!important}}'
    +'#kil-mhamb{display:none;position:fixed;top:12px;right:12px;z-index:960;width:40px;height:40px;border-radius:12px;background:rgba(10,10,16,.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.16);color:#fff;align-items:center;justify-content:center;text-decoration:none}'
    +'#kil-mhamb svg{width:20px;height:20px;display:block}'
    +'#v3shell-nav .v3s-cta.v3s-hamb{display:inline-flex;align-items:center;padding:7px 12px}'
    +'#v3shell-nav .v3s-cta.v3s-hamb svg{width:22px;height:22px;display:block}'
    /* mobile bottom nav (Instagram model) — replaces the radio bar UI on ≤860px; radio audio keeps playing off-screen */
    +'#kil-bnav{display:none;position:fixed;left:0;right:0;bottom:0;z-index:950;background:rgba(10,10,16,.97);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid rgba(255,255,255,.08);padding:6px 10px calc(6px + env(safe-area-inset-bottom,0px));align-items:center;justify-content:space-around}'
    +'#kil-bnav a{display:flex;align-items:center;justify-content:center;padding:8px 14px;color:rgba(255,255,255,.72);text-decoration:none;transition:color .15s,transform .1s}'
    +'#kil-bnav a svg{width:26px;height:26px;display:block}'
    +'#kil-bnav a img{height:30px;width:auto;mix-blend-mode:screen;display:block}'
    +'#kil-bnav a.on{color:var(--brand,#00b4ff)}'
    +'#kil-bnav a:active{transform:scale(.9)}'
    +'@media(max-width:860px){#kil-bnav{display:flex}#kil-radio{transform:translateY(220%)!important;pointer-events:none!important}body{padding-bottom:calc(72px + env(safe-area-inset-bottom,0px))!important}}'
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
