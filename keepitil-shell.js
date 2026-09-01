/* KEEPITIL V3.1 — TRIMMED public shell (fork of v3-shell.js, Founder 2026-07-17).
   V3.1 = the simplified live face: nav is ONLY Home / Scene / Login (My Tickets when
   signed in). All shell links stay inside /; V3 keeps its own shell untouched. */
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
      if(/\/v31\/(tickets|ticket|event-chat)\.html$/.test(p)) return 'checkout';
      if(/\/v31\/scene\.html$/.test(p)) return 'scene';
      if(/\/v31\/event\.html$/.test(p)) return 'event';
      if(/\/v31\/culture\.html$/.test(p)) return 'culture';
      if(/\/v31\/profile\.html$/.test(p)) return 'profile';
      if(/^\/v31\/(index\.html)?$/.test(p)) return 'home';
      return 'standard';
    }catch(e){ return 'standard'; }
  })();
  /* Mirrors public.page_standards (corrected 2026-07-16): DESKTOP radio on EVERY page type
     except system; checkout (tickets/ticket/scan) is chromeless — nav:false, back-link only. */
  var PAGE_STD={
    home:{radio:true,bell:'never',gear:'none',nav:true}, culture:{radio:true,bell:'signed_in',gear:'none',nav:true},
    scene:{radio:true,bell:'never',gear:'none',nav:true}, shop:{radio:true,bell:'never',gear:'none',nav:true},
    event:{radio:true,bell:'never',gear:'none',nav:true}, profile:{radio:true,bell:'signed_in',gear:'hamburger',nav:true},/* Founder 2026-07-27: universal header nav + footer on EVERY page, no exception — event & checkout no longer chromeless */
    standard:{radio:true,bell:'never',gear:'none',nav:true}, tool:{radio:true,bell:'never',gear:'none',nav:true},
    dashboard:{radio:true,bell:'never',gear:'none',nav:true}, checkout:{radio:true,bell:'never',gear:'none',nav:true},
    system:{radio:false,bell:'never',gear:'none',nav:false}
  };
  var RULES=PAGE_STD[PAGE_TYPE]||PAGE_STD.standard;
  /* STRICT desktop/mobile separation (Founder 2026-07-16): mobile behavior is decided ONCE here.
     IN_IFRAME guard: embedded frames (e.g. the event chat) NEVER get bottom-nav/radio/banner —
     this was the "mobile filter bar" leaking into the desktop chat card. */
  var IN_IFRAME=false; try{ IN_IFRAME=(window.self!==window.top); }catch(e){ IN_IFRAME=true; }
  var IS_MOBILE=false; try{ IS_MOBILE=window.matchMedia('(max-width:860px)').matches; }catch(e){}
  try{ window.KIL=window.KIL||{}; window.KIL.pageType=PAGE_TYPE; window.KIL.pageRules=RULES; window.KIL.isMobile=IS_MOBILE; }catch(e){}
  /* LEGACY URL PRETTIFIER REMOVED 2026-08-26. This ran history.replaceState() to rewrite
     /v3/... and /v31/... paths into clean forms. Both namespaces were deleted on
     2026-08-25, so not one of its branches could ever match again — and the clean forms
     it produced (/article/<slug>, /blog/<slug>) are exactly the 404-rescue routes the
     Founder's direct-route rule forbids. Dead code that manufactured redirect
     dependencies. */
  /* Radio: DESKTOP = bar+audio on every page (standards). MOBILE = no bar anywhere;
     background AUDIO only on the homepage. Iframes: never. */
  try{
    /* A page may DECLARE itself a radio surface with <html data-radio="page">. The mobile rule
       below exists to stop background audio leaking onto pages nobody asked to hear music on;
       it is not meant to silence a page whose entire purpose is the radio. /earn styles
       #kil-radio for mobile and calls it "the one place it must stay visible", while this rule
       deleted the element — so that mini-player, and now the station carousel, could never play
       on a phone. Opt-in by attribute rather than a path test, so the shell does not have to
       learn every future radio surface. */
    var RADIO_PAGE = false;
    try{ RADIO_PAGE = document.documentElement.getAttribute('data-radio') === 'page'; }catch(e){}
    var RADIO_ALLOWED = RULES.radio && !IN_IFRAME && (!IS_MOBILE || PAGE_TYPE==='home' || RADIO_PAGE);
    if(!RADIO_ALLOWED){
      var _rk=document.createElement('style'); _rk.textContent='#kil-radio,#kil-sc{display:none!important}'; document.head.appendChild(_rk);
      /* kill the BAR and the AUDIO ENGINE (#kil-sc soundcloud iframe survives bar removal —
         that leaked background audio onto non-home mobile pages). */
      var _kill=function(){ try{ document.querySelectorAll('#kil-radio,#kil-sc,iframe[src*="soundcloud"]').forEach(function(b){b.remove();}); }catch(e){} };
      window.__kilRadioKill=_kill;   /* self-heal loop re-runs this */
      document.addEventListener('DOMContentLoaded',function(){ _kill(); setTimeout(_kill,1200); setTimeout(_kill,4000); });
    } else {
      document.addEventListener('DOMContentLoaded',function(){ try{
        if(!document.getElementById('kil-radio') && !document.querySelector('script[src*="keepitil-radio"]')){
          /* ⚠ THIS VERSION MUST TRACK v3/keepitil-radio.js (Atlas 2026-08-23). Pages that do not
             load the radio themselves get it from here — and this was pinned at ?v=20260718,
             so every one of them ran a build from JULY while the pages with their own <script>
             tag ran the current one. Two different radio bars on one site, and the stale half
             was invisible to a cache bump because the URL never changed. Bump this WITH the
             page tags whenever keepitil-radio.js changes. */
          var _rs=document.createElement('script'); _rs.defer=true; _rs.src='/assets/js/keepitil-radio.js?v=20260826a'; document.body.appendChild(_rs);
        }
      }catch(e){} });
    }
  }catch(e){}
  /* ── ANALYTICS, DEFERRED PAST THE LOAD EVENT ────────────────────────────────────────────────
     GA4 and Microsoft Clarity used to be injected during parse. `async` keeps them from blocking
     DOMContentLoaded, but it does NOT stop them holding the LOAD event — and Clarity is a
     session recorder that keeps posting for the life of the page. Measured on /create:
     domInteractive 39ms, every KEEPITIL-owned resource finished by 89ms, domComplete 35762ms,
     with only these two alive in the gap. /culture and /connect behaved the same way.
     Everything that waits on document_idle therefore hung — devtools, automated checks, and any
     tooling that verifies the page — which is why several "fixed" claims could not be confirmed.
     Now both mount AFTER the window load event (or immediately, if load already fired), so they
     can no longer gate it. Tracking behaviour is otherwise unchanged: same property, same
     project, same gtag/clarity globals and queues. Diagnosis: KODE, 2026-08-19. */
  /* Clarity is gated to desktop, with a per-tab opt-out.
     Deferring the injection stopped it holding the load event, but the STREAMING is what made
     phones untestable: 90-110s to first paint on an iPhone 17 Pro simulator and a wedge roughly
     every 15 minutes. GA4 stays ungated — it is beacons, not a continuous recorder.
     The boundary is the shell's existing desktop-header breakpoint (861px), not a new number.
     Storage is consulted, never depended on: a browser that refuses sessionStorage (private
     mode) must still get the width gate, so every storage access is individually guarded. */
  function __kilClarityAllowed(){
    var optOut=false;
    try{ optOut = /(?:^|[?&])noclarity=1(?:&|$)/.test(location.search||''); }catch(e){}
    try{ if(optOut){ sessionStorage.setItem('kil_noclarity','1'); } }catch(e){}
    if(!optOut){ try{ optOut = sessionStorage.getItem('kil_noclarity')==='1'; }catch(e){} }
    if(optOut) return false;
    var w=0;
    try{ w = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 0; }catch(e){}
    return w >= 861;
  }
  function __kilMountAnalytics(){
    /* GA4 */
    try{ if(!window.__kilGA4){ window.__kilGA4='G-ZR36NRE4MT';
      var _g=document.createElement('script'); _g.async=true; _g.src='https://www.googletagmanager.com/gtag/js?id=G-ZR36NRE4MT'; document.head.appendChild(_g);
      window.dataLayer=window.dataLayer||[]; window.gtag=function(){dataLayer.push(arguments);}; gtag('js',new Date()); gtag('config','G-ZR36NRE4MT');
    } }catch(e){}
    /* Microsoft Clarity */
    try{ if(!window.__kilClarity && __kilClarityAllowed()){ window.__kilClarity='xk5iwishve';
      (function(c,l,a,r,i){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};var t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;var y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","xk5iwishve");
    } }catch(e){}
  }
  /* gtag() must exist BEFORE the tag loads or early calls are lost, so the queue shim is set up
     now and the network request is what gets deferred. */
  try{ window.dataLayer=window.dataLayer||[]; if(!window.gtag){ window.gtag=function(){dataLayer.push(arguments);}; } }catch(e){}
  try{
    if(document.readyState === 'complete'){ setTimeout(__kilMountAnalytics, 0); }
    else { window.addEventListener('load', function(){ setTimeout(__kilMountAnalytics, 0); }, { once:true }); }
  }catch(e){ __kilMountAnalytics(); }
  /* Customer feedback widget — V3 only (floating "Feedback" pill -> Supabase feedback table). Added 2026-07-10. */
  try{ if(!window.__kilFeedbackLoad){ window.__kilFeedbackLoad=1;
    var _fb=document.createElement('script'); _fb.defer=true; _fb.src='/assets/js/keepitil-feedback.js?v=20260826a'; document.head.appendChild(_fb);
  } }catch(e){}
  /* Universal social: share-to-any-platform + save, site-wide on V3. Added 2026-07-11. */
  try{ if(!window.__kilSocialLoad){ window.__kilSocialLoad=1;
    var _so=document.createElement('script'); _so.defer=true; _so.src='/assets/js/keepitil-social.js?v=20260826a'; document.head.appendChild(_so);
  } }catch(e){}
  /* In-app notification center (bell + panel + opt-in) — logged-in members only.
     Standards-driven (page_standards.bell_visibility): bell loads only where the page type allows. */
  try{ if(!window.__kilNotifyLoad && RULES.bell==='signed_in'){ window.__kilNotifyLoad=1;
    var _no=document.createElement('script'); _no.defer=true; _no.src='/assets/js/keepitil-notify.js?v=20260826a'; document.head.appendChild(_no);
  } }catch(e){}
  /* ── PWA: manifest + iOS install meta + service worker + install hint. Added 2026-07-16.
     SW is conservative: never caches page HTML or Supabase — see /sw.js. ── */
  try{
    if(!document.querySelector('link[rel="manifest"]')){ var _mf=document.createElement('link'); _mf.rel='manifest'; _mf.href='/manifest.webmanifest'; document.head.appendChild(_mf); }
    [['theme-color','#0b0b0b'],['apple-mobile-web-app-capable','yes'],['apple-mobile-web-app-status-bar-style','black-translucent'],['apple-mobile-web-app-title','KEEPITIL']].forEach(function(m){
      if(!document.querySelector('meta[name="'+m[0]+'"]')){ var t=document.createElement('meta'); t.name=m[0]; t.content=m[1]; document.head.appendChild(t); }
    });
    if(!document.querySelector('link[rel="apple-touch-icon"]')){ var _ai=document.createElement('link'); _ai.rel='apple-touch-icon'; _ai.href='/apple-touch-icon.png'; document.head.appendChild(_ai); }
    /* SOUND PERMISSION IS SITE-WIDE (Founder 2026-08-22: "dont have any of the videos muted").
       Recorded here, in the shell, so ANY page counts as the first interaction — tap CONNECT,
       then open CULTURE, and the first video already plays with audio instead of starting muted
       and waiting for another tap. Browsers only block unmuted autoplay BEFORE a gesture; this
       just makes sure the gesture the visitor already made is not forgotten on navigation. */
    (function(){
      try{ if(sessionStorage.getItem('kil_sound_ok')==='1'){ window.__kilSoundOK = true; return; } }catch(e){}
      var arm = function(){
        window.__kilSoundOK = true;
        try{ sessionStorage.setItem('kil_sound_ok','1'); }catch(e){}
      };
      ['pointerdown','keydown','touchstart'].forEach(function(ev){
        document.addEventListener(ev, arm, {once:true, passive:true, capture:true});
      });
    })();

    if('serviceWorker' in navigator){
      /* VERSIONED SW URL (Atlas 2026-08-22). Registering the bare '/sw.js' relies on the browser
         noticing the file's bytes changed on its own update check — which an installed PWA on iOS
         may defer for up to a day, so a shipped fix can sit unseen on a phone while the desktop
         has it. A different URL is a different worker: the new one installs immediately, and
         because sw.js already calls skipWaiting() on install and clients.claim() on activate, it
         takes over without waiting for every tab to close. Bump this ?v= with the cache names in
         sw.js whenever a release must reach returning users. */
      navigator.serviceWorker.register('/sw.js?v=20260822b').catch(function(){});
      /* An older worker may still be in control from a previous registration of the bare URL.
         Asking every registration to update forces that one to re-check now rather than on its
         own schedule. */
      navigator.serviceWorker.getRegistrations().then(function(rs){
        rs.forEach(function(r){ try{ r.update(); }catch(e){} });
      }).catch(function(){});
    }
  }catch(e){}
  /* Install banner: Android/desktop via beforeinstallprompt; iOS gets a one-time Share hint. */
  try{
    var _IK='kil-pwa-hint-2026';
    /* The capacitor:// arm is why the banner was appearing INSIDE the native app: the WKWebView
       wrapper reports neither display-mode:standalone nor navigator.standalone, so both original
       tests passed and it offered to install an app the user was already standing in. */
    var _standalone=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)
      ||window.navigator.standalone===true
      ||/capacitor|ionic/i.test(location.protocol);
    /* FOUNDER DIRECTIVE 2026-08-07: install UI is ON — ship the free installable PWA now,
       native Expo app later. (Supersedes the 2026-07-16 "off until App Store launch" hold.)
       Banner is dismissible and remembers the dismissal via localStorage key _IK. */
    var _INSTALL_UI=true;
    if(_INSTALL_UI && !_standalone && !localStorage.getItem(_IK)){
      var _dismiss=function(){ try{localStorage.setItem(_IK,'1');}catch(e){} var b=document.getElementById('kil-pwa-banner'); if(b)b.remove(); };
      var _show=function(msg,btnLabel,onBtn){
        if(document.getElementById('kil-pwa-banner'))return;
        var b=document.createElement('div'); b.id='kil-pwa-banner';
        /* Bottom-docked, ABOVE the chat button (Founder 2026-08-21 — it was covering the middle
           of every page on a phone).
           History: it was bottom:104px/z-index:900 and sat UNDER the chat button, so on 2026-08-15
           it was centred to escape by geometry. That traded a small overlap for a worse one — a
           fixed, undismissed banner parked over the centre of the viewport on every page, following
           the scroll, hiding whatever the visitor came to read.
           This keeps the geometric fix and drops the collision: the banner is a full-width bar
           stacked above the chat FAB and the bottom nav, so nothing overlaps at any z-index and
           the content it interrupts is empty page margin instead of the middle of the feed. */
        var _lift = 'calc(var(--kil-bnav-h,62px) + 86px + env(safe-area-inset-bottom,0px))';
        b.style.cssText='position:fixed;left:12px;right:12px;bottom:'+_lift+';margin:0 auto;'
          +'max-width:520px;z-index:1150;background:#12121c;border:1px solid #2a2a3a;border-radius:14px;'
          +'padding:14px;display:flex;align-items:center;gap:10px;box-shadow:0 18px 48px rgba(0,0,0,.6);'
          +'font-family:Inter,system-ui,sans-serif;font-size:.85rem;color:#f0f0f0';
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
          ? '1. Tap the <b>&#8943;</b> menu in Safari, then <b>Share</b> <span style="font-size:1.1em">&#x2191;</span>. On older iOS the Share icon is in the bottom bar instead.<br>2. Scroll down and tap <b>Add to Home Screen</b>.<br>3. Tap <b>Add</b> — KEEPITIL lands on your home screen.'
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
  /* The V3.1 template (Founder 2026-07-17: LOGO=Home · Culture · SCENE · LOGIN/PROFILE) was
     marked immutable so features could not each bolt a link onto the nav. SUPERSEDED by the
     Founder's K1 directive (2026-08-14): add Radio and VS, relabel the five bottom slots, move
     Create off the bar and Profile to contextual. The rule it was protecting still holds —
     adding a feature does not entitle it to a slot. Changing this list is a Founder decision. */
/* K1 — ONE destination list. Every navigation surface in this shell reads it: the desktop
   header links, the desktop burger menu, the mobile bottom bar, the footer, and the active
   state for all of them. Radio and VS were finished products reachable only by typing the
   URL, because this array was the whole map and it had two entries.
   `home:true` marks the slot the bottom bar renders as the logo and the desktop header
   omits — the brand mark already links to '/', and listing it twice is noise. */
/* ── K3: THE ICON COMPONENTS ───────────────────────────────────────────────────────────────
   Each icon contributes GEOMETRY ONLY. The wrapper supplies the viewBox, stroke weight, caps
   and currentColor, so the set cannot drift: it is structurally impossible to ship an icon
   with a different stroke weight from its neighbours. That had already happened — `settings`
   was drawn at 1.7 against everything else's 1.8, and radio, scene and profile were missing
   stroke-linejoin, so their corners rendered differently at the same size.

   Swappable, which is the point of the ticket. To replace one without touching this file:

       KIL_ICONS.set('radio', '<path d="..."/>');   // geometry only, re-renders in place

   Geometry is validated rather than trusted: a full <svg>, a <script>, an on* handler or a
   foreignObject is refused. These strings go through innerHTML, so an icon is an injection
   point, and "it is only an icon" is exactly how that gets missed. */
var ICON_GEOMETRY = {
  home: '<circle cx="10.8" cy="10.8" r="6.2"/><path d="M15.4 15.4L20 20"/><path d="M6.2 12.4c1.6-1.5 3.1-2.2 4.6-2.2s3 .7 4.6 2.2"/>',
  /* CULTURE (Founder 2026-08-31): was a compass, which said 'explore' — that is DISCOVER's
     job. Culture is the living content feed: stacked layers of published work with a
     creative pulse running through the front one. Deliberately not the KEEPITIL mark
     (that is the CHO button) and not a people glyph (COMMUNITY lives under CONNECT). */
  culture: '<path d="M6.5 4.8h11"/><path d="M4.6 7.6h14.8"/>'
         + '<rect x="3" y="10.4" width="18" height="9.8" rx="2.2"/>'
         + '<path d="M6.6 16.6l2.3-2.9 2.2 2.6 2.1-3.6 2.4 3.9"/>',
  radio: '<circle cx="12" cy="12" r="1.6"/><path d="M7.8 7.8a5.9 5.9 0 0 0 0 8.4M16.2 7.8a5.9 5.9 0 0 1 0 8.4"/><path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>',
  scene: '<path d="M8 8l3 6M16 8l-3 6M8.4 6.6h7.2"/><circle cx="6" cy="6" r="2.1"/><circle cx="18" cy="6" r="2.1"/><circle cx="12" cy="17" r="2.1"/>',
  vs: '<path d="M4 6l3.4 12L10.8 6"/><path d="M13.6 18h5l-4.6-6h5"/>',
  profile: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.6 3.2-5.6 7-5.6s7 2 7 5.6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l1.7-1.3-1.7-3-2 .8a7.6 7.6 0 0 0-2.6-1.5L14.2 3H9.8l-.3 2a7.6 7.6 0 0 0-2.6 1.5l-2-.8-1.7 3L4.6 10.5a7.6 7.6 0 0 0 0 3l-1.7 1.3 1.7 3 2-.8a7.6 7.6 0 0 0 2.6 1.5l.3 2h4.4l.3-2a7.6 7.6 0 0 0 2.6-1.5l2 .8 1.7-3-1.7-1.3z"/>',
  shop: '<path d="M5.2 8h13.6l-1.1 12.2H6.3L5.2 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'
};

/* One wrapper, one set of attributes, applied to every icon in the set. */
var ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

/* Geometry may only be drawing instructions. Anything that could execute, load, or bring its
   own attributes is refused — and refused LOUDLY, because a silently dropped icon looks like
   a styling bug and gets chased for hours. */
function validIconGeometry(g){
  if(typeof g!=='string' || !g.trim()) return false;
  if(/<\s*(script|foreignObject|image|use|iframe|style)\b/i.test(g)) return false;
  if(/\bon[a-z]+\s*=/i.test(g)) return false;
  if(/<\s*svg\b/i.test(g)) return false;          /* geometry only — the wrapper owns the svg */
  if(/(javascript:|data:text\/html)/i.test(g)) return false;
  return true;
}

/* Render one icon. An unknown name returns '' rather than throwing: a missing icon must not
   take the nav down with it, and the console line names what was asked for. */
function icon(name){
  var g = ICON_GEOMETRY[name];
  if(!g){ try{ console.warn('[keepitil-shell] no icon named "'+name+'"'); }catch(e){} return ''; }
  return '<svg '+ICON_ATTRS+' aria-hidden="true" focusable="false" data-icon="'+name+'">'+g+'</svg>';
}

/* Explore renders the brand mark by default rather than a line icon, but through the same
   component path — so registering a `home` geometry swaps it like any other icon.
   mix-blend-mode:screen on the nav logo remains a binding V3.1 rule; see the stylesheet. */
/* Founder 2026-08-19: Discovery renders its own icon like every other destination.
   Was true, which swapped in the KEEPITIL X logo and left the slot unlabelled as a place. */
var HOME_USES_LOGO = false;
function destinationIcon(d){
  if(d.home && HOME_USES_LOGO) return '<img class="kb-logo" src="/keepitil-x-blue.png" alt="">';
  return icon(d.icon);
}

/* The public swap API. Re-renders any mounted nav immediately rather than on the next load. */
window.KIL_ICONS = {
  set: function(name, geometry){
    if(!validIconGeometry(geometry)) throw new Error('KIL_ICONS.set("'+name+'"): geometry rejected — drawing elements only; no <svg>, script, use, image or on* handlers');
    ICON_GEOMETRY[name] = geometry;
    if(name==='home') HOME_USES_LOGO = false;   /* an explicit home icon replaces the logo */
    this.refresh();
    return true;
  },
  get: function(name){ return ICON_GEOMETRY[name] || null; },
  list: function(){ return Object.keys(ICON_GEOMETRY); },
  render: function(name){ return icon(name); },
  /* Re-render every mounted icon in place, keeping each anchor's classes and active state. */
  refresh: function(){
    try{
      document.querySelectorAll('svg[data-icon]').forEach(function(svg){
        var name = svg.getAttribute('data-icon');
        if(ICON_GEOMETRY[name]) svg.innerHTML = ICON_GEOMETRY[name];
      });
    }catch(e){}
  }
};

/* `pill` is the VISIBLE bottom-nav word (Founder 2026-08-15 — the Five Pillars).
   `label` stays the destination's real name and is kept in the accessible name:
   a screen-reader user hearing only "EARN" has no idea it goes to VS, and WCAG 2.5.3
   wants the visible text to be part of the accessible name — so it reads "EARN — VS". */
/* ORDER AND NAMES ARE THE OWNER'S, 2026-08-15 — array order IS nav order, on both breakpoints.
   Reassigned from the earlier mapping: CONNECT moved from Culture to Scene, CREATE from Radio
   to VS, EARN from VS to Radio, GROW dropped, and Culture keeps its own name.
   `pill` is what renders in both navs; `label` stays the real page name for the footer sitemap
   and the accessible name, so "EARN" still announces as "EARN — Radio". */
var DESTINATIONS=[
  {href:'/',             label:'Discover',  pill:'DISCOVER',  icon:'home',   home:true,
   match:/^\/((index|v31)(\.html)?)?$/},
  /* Founder 2026-08-18 — clean URLs. Each `match` accepts BOTH the new path and the retired
     .html one, because the old files still exist as redirect stubs and an installed app bundle
     may still request them. A nav that fails to highlight on the legacy path would look broken
     for exactly the users on the oldest build. */
  {href:'/connect/', label:'Connect', pill:'CONNECT',  icon:'scene',   match:/(^|\/)(connect|scene)(\.html)?\/?$/,
   tint:'#22e07a', glow:'rgba(34,224,122,.75)'},
  {href:'/create/',  label:'Create',  pill:'CREATE',   icon:'vs',      match:/(^|\/)(create|vs)(\.html)?\/?$/,
   tint:'#ff5c8a', glow:'rgba(255,92,138,.75)'},
  {href:'/culture/', label:'Culture', pill:'CULTURE',  icon:'culture', match:/(^|\/)culture(\.html)?\/?$/,
   tint:'#a06bff', glow:'rgba(160,107,255,.75)'},
  {href:'/earn/',    label:'Earn',    pill:'EARN',     icon:'radio',   match:/(^|\/)(earn|radio)(\.html)?\/?$/,
   tint:'#ff9f43', glow:'rgba(255,159,67,.75)'}
];
/* ── K4: the destination rail, for pages that want to surface the map in their own body ────
   Explore's own content was 93 event links, 1 to Culture, 1 to Scene, and ZERO to Radio or VS.
   K1 put all five in the nav; the landing page itself still did not mention two of them. This
   renders the same DESTINATIONS list into any element, so a page-level rail cannot drift from
   the nav — adding a destination stays a one-line change in one array.

   Opt-in: a page mounts it by including <div data-kil-destinations></div>. Nothing renders
   anywhere it is not asked for. */
/* ── FLOATING CONTROLS — one config, not a rule buried in each page (Founder 2026-08-15) ──
   The chat button reached five different positions because five files each owned a copy.
   The scroll-to-top arrow was worse: it existed ONLY in index.html, so "show it on Culture"
   would have meant a sixth copy. Both are declared here and mounted by the shell, so adding
   a page is a line in this table rather than a new stylesheet rule.
   `test` is matched against location.pathname; first match wins, DEFAULT catches the rest. */
var KIL_FLOATING=[
  {name:'profile',  test:/profile|\/u\//,     chat:true,  arrow:true },
  {name:'culture',  test:/culture/,           chat:false, arrow:true },
  {name:'vs',       test:/(^|\/)vs(\.html)?$/,chat:false, arrow:true },
  {name:'radio',    test:/radio/,             chat:true,  arrow:true },
  {name:'scene',    test:/scene/,             chat:true,  arrow:true },
  {name:'event',    test:/event/,             chat:true,  arrow:true },
  {name:'home',     test:/^\/((index|v31)(\.html)?)?$/, chat:true, arrow:true },
  {name:'DEFAULT',  test:/./,                 chat:true,  arrow:true }
];
/* ── SOFT-404s ──────────────────────────────────────────────────────────────────────────────
   event.html?e=anything and profile.html?slug=anything both return HTTP 200 with a
   byte-identical shell — verified: 47423 bytes either way, generic <title>, zero noindex. To a
   crawler that is one page duplicated once per query string, which is the definition of a soft
   404 and why they read as thin duplicates.

   A real 404 STATUS is impossible here: GitHub Pages serves a static file and always answers
   200. (Unknown PATHS do 404 correctly — it is only the query-string pages.) So the supported
   route on a static host is the one Google documents for JS-rendered pages: render a genuine
   not-found state and inject `noindex`, which is honoured after the page renders.

   One implementation in the shell, called by the pages, rather than a copy per page. */
window.KIL_NOT_FOUND = function(opts){
  opts = opts || {};
  var what = opts.what || 'page';

  /* noindex,follow — the page should drop out of the index while its links stay crawlable, so
     a wrong URL still passes authority to the real destinations below. */
  if(!document.querySelector('meta[name="robots"][data-kil-404]')){
    var m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex,follow';
    m.setAttribute('data-kil-404','1');
    document.head.appendChild(m);
  }
  /* A distinct title, so it is not one more copy of "Event — KEEPITIL" in search results. */
  document.title = (opts.title || ('Not found — ' + what)) + ' | KEEPITIL';
  var can = document.querySelector('link[rel="canonical"]');
  if(can) can.remove();   /* never point a dead URL at itself as canonical */

  var host = opts.into && document.querySelector(opts.into);
  if(!host) host = document.querySelector('main') || document.body;
  host.innerHTML =
    '<div class="kil-404" role="status" style="max-width:560px;margin:12vh auto;padding:0 20px;text-align:center">'
    + '<div style="font-size:2.6rem;margin-bottom:10px" aria-hidden="true">🔍</div>'
    + '<h1 style="font-family:\'Bebas Neue\',Inter,sans-serif;font-size:2rem;letter-spacing:.04em;margin:0 0 10px;color:#fff">'
    + (opts.heading || ('That ' + what + ' isn’t here')) + '</h1>'
    + '<p style="color:rgba(255,255,255,.7);line-height:1.6;margin:0 0 22px">'
    + (opts.body || ('It may have been removed, or the link may be wrong.')) + '</p>'
    + (opts.links || [['/', 'Discover'], ['/culture/','Culture'], ['/connect/','Connect']])
        .map(function(l){ return '<a href="'+l[0]+'" style="display:inline-block;margin:0 7px 10px;padding:12px 20px;'
          + 'border-radius:999px;border:1px solid rgba(255,255,255,.25);color:#fff;min-height:44px;line-height:20px">'+l[1]+'</a>'; })
        .join('')
    + '</div>';
  return true;
};

window.KIL_FLOATING_FOR = function(path){
  var p=path||location.pathname;
  for(var i=0;i<KIL_FLOATING.length;i++){ if(KIL_FLOATING[i].test.test(p)) return KIL_FLOATING[i]; }
  return {name:'DEFAULT',chat:true,arrow:true};
};

window.KIL_DESTINATIONS = function(){
  return DESTINATIONS.map(function(d){
    return { href:d.href, label:d.label, icon:d.icon, home:!!d.home, tint:d.tint||null };
  });
};

function renderDestinationRail(el){
  if(!el || el.getAttribute('data-kil-mounted')==='1') return;
  var here = location.pathname;
  el.setAttribute('data-kil-mounted','1');
  el.className = (el.className ? el.className+' ' : '') + 'kil-drail';
  /* The page you are already on is not a useful link out of itself. */
  el.innerHTML = namedDestinations().map(function(d){
    if(d.match.test(here)) return '';
    return '<a class="kil-drail-item" href="'+d.href+'" style="--d-tint:'+d.tint+'">'
      + '<span class="kil-drail-ico">'+icon(d.icon)+'</span>'
      + '<span class="kil-drail-label">'+d.label+'</span></a>';
  }).join('');
}

function mountDestinationRails(){
  try{ document.querySelectorAll('[data-kil-destinations]').forEach(renderDestinationRail); }catch(e){}
}

/* Everything except the home slot — what the header and footer list as words. */
function namedDestinations(){ return DESTINATIONS.filter(function(d){ return !d.home; }); }
  var THEMES=[['default','Default','#00b4ff'],['spring','Spring','#22e39b'],['summer','Summer','#ff7a1a'],['fall','Fall','#ff3b4e'],['winter','Winter','#00b4ff'],['halloween','Halloween','#ff7a1a'],['holidays','Holidays','#e63946']];
  function build(){
    try{
      /* K2: styles BEFORE DOM. The shell used to mount the bottom nav and then inject
         its stylesheet on the next line, so every element existed for a moment with no
         rules — a flash of unstyled nav on every page load, and the reason the active
         state could not be verified: the anchors kept their pre-stylesheet computed
         values. Removing the inline colour from one changed nothing, while re-inserting
         the same node immediately resolved to the correct rule. style() is idempotent. */
      style();
      // remove existing header nav(s) + footer(s) + any injected mobile nav
      document.querySelectorAll('#main-nav, nav#main-nav, nav.main-nav, #v3shell-nav, footer, #kil-mnav, .kil-mnav').forEach(function(el){ el.remove(); });
      /* Desktop header shows the SAME words as the bottom nav (owner 2026-08-15) — one naming
         scheme, not one per breakpoint. Home is the wordmark here, so DISCOVER isn't repeated. */
      var links = namedDestinations().map(function(d){ return '<a href="'+d.href+'" title="'+d.label+'">'+(d.pill||d.label)+'</a>'; }).join('');
      var cur=document.documentElement.getAttribute('data-theme')||'default';
      var swatches = THEMES.map(function(t){return '<button class="v3t-sw'+(t[0]===cur?' on':'')+'" data-t="'+t[0]+'" title="'+t[1]+'" style="background:'+t[2]+'"></button>';}).join('');
      /* NOTE: `.v3s-icons` is `display:none` at every width today — the desktop header shows
         `.v3s-links` and the header itself is hidden below 861px. It is still built from the
         same list so it cannot drift out of sync if it is ever turned back on. */
      var iconRow='<div class="v3s-icons">'
        +namedDestinations().map(function(d){
          return '<a href="'+d.href+'" aria-label="'+d.label+'">'+destinationIcon(d)+'</a>';
        }).join('')
        +'<a href="/apply.html" id="v3s-iconprof" class="v3s-contextual" aria-label="Profile">'+icon('profile')+'</a>'
        +'</div>';
      var hdr = document.createElement('nav'); hdr.id='v3shell-nav';
      if(RULES.gear==='hamburger') hdr.classList.add('on-profile');
      hdr.innerHTML =
        '<div class="v3s-inner">'
        +'<div class="v3s-brand">'
          +'<button class="v3s-logobtn" id="v3s-logobtn" title="Change style" aria-label="Home / change site style"><img class="v3s-logo" src="/keepitil-x-blue.png" alt="KEEPITIL"></button>'
          /* Founder 2026-08-19: the wordmark IS the home slot (see the note above — Discovery is
             deliberately not repeated in the links row), so renaming the destination means
             renaming this text. It read KEEPITIL, which is why the footer said Discovery and the
             header still said KEEPITIL. The logo mark to its left still carries the brand. */
          +'<a href="/" class="v3s-brandtext'+(/^\/((index|v31)(\.html)?)?$/.test(location.pathname)?' on':'')+'">DISCOVERY</a>'
          +'<div class="v3t-pop" id="v3t-pop">'+swatches+'</div>'
        +'</div>'
        +'<div class="v3s-links">'+links+'</div>'
        +iconRow
        /* P0c (Founder 2026-07-16): NO settings gear in the shell nav — Settings is reachable ONLY via the profile-page hamburger. */
        +'<a href="/apply.html" class="v3s-cta">LOGIN</a>'
        +'<button class="v3s-burger" aria-label="menu"><span></span><span></span><span></span></button>'
        +'</div>'
        +'<div class="v3s-menu">'+links+'<a href="/apply.html" id="v3s-mlogin">Login</a></div>';
      /* checkout/system pages are chromeless (page_standards.loads_shell_nav=false): no top nav.
         Mobile: the top bar is REMOVED entirely (bottom-nav only) — desktop keeps it as-is. */
      if(RULES.nav!==false){
        document.body.insertBefore(hdr, document.body.firstChild);
        try{ if(!IS_MOBILE) document.body.style.paddingTop='66px'; }catch(e){}  // desktop offset for the fixed nav
      }

      var f = document.createElement('footer'); f.id='v3-footer';
      f.innerHTML =
        '<div class="v3-foot-inner">'
        +'<div class="v3-foot-about"><a href="/" class="v3-foot-brand">KEEPITIL</a>'
          +'<p class="v3-foot-addr">'
          +'<span class="fa-l1">9252 Garden Grove Blvd, Ste 19</span>'
          +'<span class="fa-pmb"> PMB 1066,</span> '
          +'<span class="fa-l2">Garden Grove, CA 92844</span>'
          +'<span class="fa-mail"> · <a href="mailto:info@keepitil.com">info@keepitil.com</a></span></p></div>'
        +'<nav class="v3-foot-links">'
        +DESTINATIONS.map(function(d){ return '<a href="'+d.href+'">'+d.label+'</a>'; }).join('')
        +'<a href="/apply.html">Login</a></nav>'
        +'<div class="v3-foot-social">'
          +'<a href="https://instagram.com/keepitil" target="_blank" rel="noopener" aria-label="Instagram"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2.2c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2zm0 3.2A6.6 6.6 0 1012 18.6 6.6 6.6 0 0012 5.4zm0 10.9a4.3 4.3 0 110-8.6 4.3 4.3 0 010 8.6zm6.85-11.2a1.54 1.54 0 11-3.08 0 1.54 1.54 0 013.08 0z"/></svg></a>'
          +'<a href="https://soundcloud.com/keepitil" target="_blank" rel="noopener" aria-label="SoundCloud"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M1.5 13.6c-.1 0-.15.07-.16.17l-.19 1.63.19 1.6c.01.1.06.17.16.17s.15-.07.16-.17l.22-1.6-.22-1.63c-.01-.1-.06-.17-.16-.17zm2.02.62c-.11 0-.18.08-.19.19l-.16 1 .16.97c.01.11.08.19.19.19s.18-.08.19-.19l.19-.97-.19-1c-.01-.11-.08-.19-.19-.19zm13.24-4.72c-.5 0-.98.1-1.41.29-.29-3.24-3.02-5.79-6.35-5.79-.82 0-1.62.16-2.32.44-.27.11-.34.22-.34.43v10.06c0 .22.17.4.38.42h10.04a2.94 2.94 0 002.94-2.94 2.94 2.94 0 00-2.94-2.91z"/></svg></a>'
          +'<a href="https://tiktok.com/@keepitil" target="_blank" rel="noopener" aria-label="TikTok"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16.6 5.82a4.28 4.28 0 01-1.06-2.82h-3.11v12.34a2.34 2.34 0 01-2.34 2.28 2.34 2.34 0 01-2.34-2.34 2.34 2.34 0 013.02-2.24V9.87a5.44 5.44 0 00-.68-.04A5.45 5.45 0 003.6 15.28a5.45 5.45 0 0010.9 0V8.9a7.35 7.35 0 004.3 1.38V7.16a4.28 4.28 0 01-2.2-1.34z"/></svg></a>'
          +'<a href="https://youtube.com/@keepitil" target="_blank" rel="noopener" aria-label="YouTube"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M23 12s0-3.4-.43-5.02a2.62 2.62 0 00-1.84-1.85C19.1 4.7 12 4.7 12 4.7s-7.1 0-8.73.43A2.62 2.62 0 001.43 6.98C1 8.6 1 12 1 12s0 3.4.43 5.02a2.62 2.62 0 001.84 1.85C4.9 19.3 12 19.3 12 19.3s7.1 0 8.73-.43a2.62 2.62 0 001.84-1.85C23 15.4 23 12 23 12zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg></a>'
          +'<a href="https://open.spotify.com/user/keepitil" target="_blank" rel="noopener" aria-label="Spotify"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.6 14.44a.62.62 0 01-.86.21c-2.35-1.44-5.3-1.76-8.79-.96a.62.62 0 11-.28-1.22c3.8-.87 7.07-.5 9.71 1.11.3.18.39.58.22.86zm1.23-2.74a.78.78 0 01-1.07.26c-2.69-1.65-6.79-2.13-9.97-1.17a.78.78 0 11-.45-1.5c3.63-1.09 8.15-.55 11.24 1.34.36.22.48.7.25 1.07zm.1-2.85C14.8 8.99 9.5 8.82 6.42 9.75a.94.94 0 11-.54-1.8c3.53-1.06 9.38-.86 13.08 1.34a.94.94 0 01-.96 1.62z"/></svg></a>'
          +'<a href="https://x.com/keepitil" target="_blank" rel="noopener" aria-label="X"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.22-6.82-5.97 6.82H1.66l7.73-8.84L1.24 2.25h6.83l4.71 6.23 5.46-6.23zm-1.16 17.52h1.83L7.01 4.13H5.05l12.03 15.64z"/></svg></a>'
          +'<a href="https://facebook.com/keepitil" target="_blank" rel="noopener" aria-label="Facebook"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0022 12z"/></svg></a>'
          +'<a href="mailto:info@keepitil.com" aria-label="Email KEEPITIL"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg></a>'
        +'</div></div>'
        +'<div class="v3-foot-legal" style="max-width:var(--maxw,1400px);margin:14px auto 0;font-size:.78rem;opacity:.7;display:flex;gap:14px;flex-wrap:wrap;align-items:center">'
        +'<a href="/terms.html">Terms</a><a href="/privacy.html">Privacy</a><a href="/refund.html">Refunds</a>'
        +'<a href="/ticket-terms.html"><span class="lg-f">Ticket Terms</span><span class="lg-s">Tickets</span></a>'
        +'<a href="/community-guidelines.html"><span class="lg-f">Community Guidelines</span><span class="lg-s">Rules</span></a>'
        +'<span style="margin-left:auto">© '+(new Date().getFullYear())+' KEEPITIL</span></div>';
      if(RULES.nav!==false) document.body.appendChild(f);

      // active state on the mobile top-bar icon nav
      /* Matchers come from DESTINATIONS so the header and the bottom bar can never disagree
         about which page you are on. Profile keeps its own, since it is contextual. */
      try{ var p=location.pathname;
        var amap={'/apply.html':/(profile\.html|my-tickets\.html|apply\.html)/};
        DESTINATIONS.forEach(function(d){ amap[d.href]=d.match; });
        hdr.querySelectorAll('.v3s-icons a').forEach(function(a){ var h=a.getAttribute('href'); var rx=amap[h]; if(rx&&rx.test(p)) a.classList.add('on'); }); }catch(e){}

      // Theme-style switcher now lives on the top-left LOGO. Click the logo image -> popup of swatches.
      // The "KEEPITIL" text is the home link only. (Old bottom-left 🎨 fab removed.)
      var lb=hdr.querySelector('#v3s-logobtn'), pop=hdr.querySelector('#v3t-pop');
      if(lb&&pop){
        lb.addEventListener('click',function(e){ e.stopPropagation();
          /* on mobile the logo is HOME (no theme filter); on desktop it opens the style switcher */
          if(window.matchMedia('(max-width:860px)').matches){ location.href='/'; return; }
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
      /* Re-callable mount: the self-heal loop re-asserts the bottom nav if a page script
         (or an earlier silent exception) leaves it missing — the "nav disappears on pillar
         pages" class of bug. Isolated try so nothing upstream can starve it. */
      /* M2 — one switch for "a full-surface sheet is open". Any sheet should call it, not just
         Create: the rule is that a pinned control never covers the surface it summoned. */
      function kilSheetOpen(open){
        try{ document.body.classList.toggle('kil-sheet-open', !!open); }catch(e){}
      }
      window.__kilSheetOpen = kilSheetOpen;
      window.__kilCreateMenu=function(){
        if(document.getElementById('kil-createmenu'))return;
        var ov=document.createElement('div'); ov.id='kil-createmenu';
        /* M2: z-index 1000 put this sheet UNDER every pinned control — the Create button
           (1002), the account button (1002) and KILO's chat button (99998) all drew on
           top of it, including the `+` covering the menu it had just opened. Above all
           of them now, and the controls are hidden as well, so this does not silently
           break again if some future control claims a higher layer. */
        ov.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;font-family:Inter,system-ui,sans-serif';
        var item=function(label,href){return '<a href="'+href+'" style="display:block;color:#e8e8f0;padding:15px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-decoration:none;font-weight:700;font-size:1.02rem">'+label+'</a>';};
        ov.innerHTML='<div style="background:#15151f;border-radius:18px 18px 0 0;width:100%;max-width:520px;padding:14px 18px 26px">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="color:#fff;font-size:1.08rem">Create</b><button id="kilCX" style="background:none;border:0;color:#888;font-size:1.6rem;line-height:1;cursor:pointer">&times;</button></div>'
          +item('Feed post','/profile.html?create=feed')
          /* /create-event.html is admin-only — it runs rpc('is_admin') and bounces everyone
             else to submit-event, dropping query params. The public create path is
             submit-event. §C's chat surface must use this same destination. */
          +item('Event','/submit-event.html')
          +item('Collection','/profile.html?tab=saved&create=collection')
          +'<a href="/profile.html?tab=chat&create=chat" style="display:block;color:#e8e8f0;padding:15px 8px;text-decoration:none;font-weight:700;font-size:1.02rem">Chat</a>'
          +'</div>';
        document.body.appendChild(ov);
        kilSheetOpen(true);
        var closeSheet=function(){ ov.remove(); kilSheetOpen(false); };
        ov.addEventListener('click',function(e){ if(e.target===ov) closeSheet(); });
        var x=document.getElementById('kilCX'); if(x) x.onclick=closeSheet;
        /* Escape closes it too — a sheet you can only dismiss by hitting the right pixel
           is a trap on a phone, and the controls stay hidden until it is gone. */
        document.addEventListener('keydown',function esc(e){
          if(e.key==='Escape'){ closeSheet(); document.removeEventListener('keydown',esc); }
        });
      };
      /* Mount the shared scroll-to-top and apply the KIL_FLOATING rules for this page. */
      window.__kilMountFloating=function(){
        try{
          if(IN_IFRAME) return;
          var cfg=window.KIL_FLOATING_FOR();
          var r=document.documentElement;
          if(!cfg.chat)  r.classList.add('kil-nochat');
          if(!cfg.arrow) r.classList.add('kil-noarrow');
          if(!cfg.arrow || document.getElementById('kil-top')) return;
          var b=document.createElement('button');
          b.id='kil-top'; b.type='button'; b.setAttribute('aria-label','Back to top');
          b.innerHTML='<span aria-hidden="true">&#8593;</span>';
          b.addEventListener('click',function(){ window.scrollTo({top:0,behavior:'smooth'}); });
          document.body.appendChild(b);
          /* Passive listener — this fires on every scroll frame and must never block it. */
          var tick=function(){ b.classList.toggle('on', (window.scrollY||document.documentElement.scrollTop||0) > 400); };
          window.addEventListener('scroll',tick,{passive:true});
          tick();
        }catch(e){}
      };

      window.__kilMountBnav=function(){
        try{
          if(IN_IFRAME) return;   /* NEVER inside embedded frames — this leaked into the desktop chat card */

          /* ── STATUS BAR IS ITS OWN LAYER (Founder 2026-08-24) ────────────────────────────
             "Make the iOS status area its own permanent black layer ... It should not belong
             to the page header, hero, filters, or content."

             This replaces the grow-and-pad pattern documented in M1 below. That pattern was
             correct but it made the safe area every page's problem: each sticky row had to
             grow upward and pad itself, so a page that forgot (or a NEW page) rendered its
             content under the clock, and a page that remembered twice left a dead band. The
             per-page rules for #culMTabs, #radMTabs, .pf-tabs and friends all exist to solve
             the same one problem five times.
             Now the shell paints the strip once, in black, above everything, and publishes its
             height as --kil-safe-top. A surface's only job is to start below it.
             Inert on any device without a notch: env() resolves to 0 and the layer has no
             height. */
          if(!document.getElementById('kil-statusbar')){
            var sbl=document.createElement('div'); sbl.id='kil-statusbar';
            sbl.setAttribute('aria-hidden','true');
            document.body.appendChild(sbl);
          }

          if(document.getElementById('kil-bnav')) return;
          var bn=document.createElement('nav'); bn.id='kil-bnav';
          /* K1: five slots, five destinations. Create WAS the centre slot — it is an action,
             not a place, and mixing it in is what left no room for Radio and VS. It moves to
             a floating button above the bar, calling the same __kilCreateMenu as before.
             Profile leaves the bar for the contextual slot: it is account state, not a
             destination, and it was the fifth thing competing for five slots. */
          /* K2 active state — the tint stays INLINE, and the muting is what carries
             !important.
             The bug: `#kil-bnav a.on{color:var(--brand)}` never applied, because an inline
             color beats any stylesheet rule. Measured on /connect: the active anchor
             computed rgb(34,224,122) — its own tint — identical to its inactive self, so
             there was no visible active state on any coloured slot.
             The first fix moved the tint into a custom property and let `.on` read it. That
             is the tidier cascade, and it did not work: the mounted anchor kept computing
             the inherited colour while a CLONE of the same element in the same parent, with
             the same attributes and the same variables, computed the tint correctly — a
             style-invalidation quirk around adding the class right after mount. An active
             state is not worth betting on that.
             So: inline stays the ACTIVE appearance, and `:not(.on)` mutes with !important,
             which beats a non-important inline declaration. No var() substitution, nothing
             that depends on when the class lands. */
          /* The active slot is known BEFORE the markup exists — it is a path match — so it is
             emitted as class="on", not added afterwards. Adding it post-hoc meant the anchor
             was born matching `:not(.on)` and had to be re-resolved; born with the class, it
             is correct from its first style resolution and nothing depends on invalidation. */
          var _bp=location.pathname;
          bn.innerHTML=DESTINATIONS.map(function(d){
            var on=d.match.test(_bp);
            var mark=(on?' class="on" aria-current="page"':'');
            /* K3: every slot renders through destinationIcon(), including Explore — the home
               slot used to hardcode the logo, which is why it was the one destination whose
               mark could not be swapped. The anchor carries the accessible name; the icon
               inside is aria-hidden, so a screen reader announces the destination once. */
            var pill='<span class="kb-l">'+(d.pill||d.label)+'</span>';
            var an=(d.pill&&d.pill!==d.label)?(d.pill+' — '+d.label):d.label;
            if(d.home) return '<a href="'+d.href+'" id="kb-home" aria-label="'+an+'"'+mark+'>'
              +destinationIcon(d)+pill+'</a>';
            return '<a href="'+d.href+'" aria-label="'+an+'"'+mark+' style="color:'+d.tint
              +';filter:drop-shadow(0 0 5px '+d.glow+')">'+destinationIcon(d)+pill+'</a>';
          }).join('');
          document.body.appendChild(bn);
          /* Publish the bar's real height. Everything that has to sit clear of it — the
             page's bottom padding, the Create button, the account button — reads this one
             number instead of each carrying its own guess. */
          /* MEASURED 1639px on the first attempt. The bar is appended before the shell's own
             stylesheet is injected, so at that instant it is an unstyled block with five
             stacked anchors — and that absurd number went straight into the page's bottom
             padding. The CSS caps the bar at max-height:96px, so anything above that is
             a measurement taken too early and must be discarded, not published. */
          var BNAV_MAX_H=96;
          /* M3 — content must clear the WHOLE pinned stack, not just the bar.
             The bar is only the bottom of it: the Create button, the account button and KILO's
             chat button all float above it, and they were sitting over the footer address on VS,
             a card on Radio, a profile card on Scene. So the padding is measured from the
             topmost pinned control, not from the bar alone.
             This extends the K2 measurement rather than adding a second one — the earlier
             re-derivation published 1639px of padding because it measured before the stylesheet
             landed, so the same clamp applies here: anything past PINNED_MAX_H is a measurement
             taken too early and is discarded, not published. */
          var PINNED_MAX_H=260;
          /* The page's own bottom padding, read once before the shell touches it. */
          var KIL_BASE_PAD=null;
          /* Both floating controls are gone (§B). What is left to clear is the nav and
             the chat button, which §C keeps. */
          var PINNED_IDS=['kil-bnav','kilo-btn'];
          var publishBarHeight=function(){
            var h=Math.round(bn.getBoundingClientRect().height);
            if(h>0 && h<=BNAV_MAX_H) document.documentElement.style.setProperty('--kil-bnav-h', h+'px');

            /* ── SHELL GEOMETRY, ONE SOURCE OF TRUTH (Founder 2026-08-24) ──────────────────
               "whether KEEPITIL is opened from Safari, installed to the Home Screen, or
               eventually wrapped natively, Discovery, Connect, Create, Culture and Earn
               maintain the same geometry."

               MEASURED, not assumed. env(safe-area-inset-top) is not readable from JS and its
               value differs between Safari with a URL bar, a Home Screen PWA and a native
               wrapper — the same device reports three numbers. Reading the painted height of
               the status layer gives whichever one is actually true right now, so the pages
               never have to care which context they are in.

                 --kil-safe-top  black status layer (0 on non-notched devices)
                 --kil-bnav-h    fixed bottom nav, measured above
                 --kil-ctl-h     sticky control deck, published by .kil-deck when one mounts
                 --kil-vh        what is left for the page: the usable viewport

               --kil-vh is what Culture's full-bleed card consumes, and it is why that card can
               sit flush against both boundaries without guessing at either one. */
            var de=document.documentElement;
            var sb=document.getElementById('kil-statusbar');
            var safeTop=sb?Math.round(sb.getBoundingClientRect().height):0;
            if(safeTop>=0 && safeTop<=120) de.style.setProperty('--kil-safe-top', safeTop+'px');
            var bnavH=(h>0 && h<=BNAV_MAX_H)?h:0;
            /* innerHeight already excludes browser chrome; subtracting the two shell layers
               leaves exactly the band the active page owns. */
            var usable=Math.round(window.innerHeight - safeTop - bnavH);
            if(usable>120) de.style.setProperty('--kil-vh', usable+'px');

            /* Distance from the bottom of the viewport to the highest pinned control. */
            var vh=window.innerHeight, top=vh;
            PINNED_IDS.forEach(function(id){
              var el=document.getElementById(id);
              if(!el) return;
              var cs=getComputedStyle(el);
              if(cs.display==='none' || cs.visibility==='hidden') return;
              var r=el.getBoundingClientRect();
              if(r.height<=0) return;
              if(r.top<top) top=r.top;
            });
            var stack=Math.round(vh-top);
            if(!(stack>0 && stack<=PINNED_MAX_H)) return;
            document.documentElement.style.setProperty('--kil-pinned-h', stack+'px');

            /* Applied inline rather than from the stylesheet. radio.html carries
               `body.rad-m{padding-bottom:...!important}` at (0,1,1) — more specific than any
               `body` rule the shell can write — so a shell rule simply lost there, and matching
               each page's specificity would be an arms race. An inline !important wins outright.

               MAX, not replace: 120px on radio is the page reserving room for its mini player.
               Overwriting that would fix one collision by causing another, so the page's own
               intent is captured once, before anything is applied, and honoured as a floor. */
            try{
              if(window.matchMedia('(max-width:860px)').matches){
                if(KIL_BASE_PAD===null){
                  var cur=parseFloat(getComputedStyle(document.body).paddingBottom);
                  KIL_BASE_PAD=isFinite(cur)?cur:0;
                }
                /* ── DO NOT RESERVE THE NAV TWICE (Founder/KODE 2026-08-24) ──────────────
                   Symptom: a 57pt strip of page backdrop between the footer and the bottom nav
                   on /connect. KODE measured it — footer background ended at 701pt, nav at
                   758pt.

                   Cause: this padding sits OUTSIDE the footer, on the body box. On a short page
                   `body{min-height:100dvh}` + `footer{margin-top:auto}` pushes the footer to the
                   bottom of the CONTENT box, and with border-box sizing that box stops
                   `padding-bottom` short of the viewport — so the reserved strip renders as bare
                   `body::before`. Meanwhile the shell's own stylesheet ALREADY gives
                   `#v3-footer` a `padding-bottom:calc(12px + var(--kil-bnav-h))`, which reserves
                   the same space correctly, INSIDE the footer, painted in the footer's colour.
                   Two reservations, one of them visible as a hole.

                   So: when a visible #v3-footer is present it owns the clearance and the body
                   gets none. Pages WITHOUT that footer (radio, and anything mounting its own
                   chrome) still need the body padding, which is why this is a condition and not
                   a deletion — removing it outright would put content under the nav there.
                   This is the smaller relative of the 128pt band from Part C; the
                   flex-body + margin-top:auto fix shrank it but could not close it, because the
                   remainder was never the footer's margin — it was this. */
                var _ft=document.getElementById('v3-footer');
                var _ftOwns = !!_ft && getComputedStyle(_ft).display!=='none' && _ft.getBoundingClientRect().height>0;
                var want=_ftOwns ? KIL_BASE_PAD : Math.max(KIL_BASE_PAD, stack+12);
                document.body.style.setProperty('padding-bottom', Math.round(want)+'px', 'important');
              } else if(KIL_BASE_PAD!==null){
                document.body.style.removeProperty('padding-bottom');
                KIL_BASE_PAD=null;   /* re-measure if we come back to mobile */
              }
            }catch(e){}
          };
          /* Re-measure once styles have actually landed, and keep the same late cadence the
             Create button uses for its own after-the-fact positioning. */
          if(window.requestAnimationFrame) requestAnimationFrame(publishBarHeight);
          [0,200,800,2000].forEach(function(ms){ setTimeout(publishBarHeight, ms); });
          window.addEventListener('resize', publishBarHeight);
          window.addEventListener('orientationchange', publishBarHeight);
          window.addEventListener('load', publishBarHeight);
          try{ if(window.ResizeObserver) new ResizeObserver(publishBarHeight).observe(bn); }catch(e){}
          /* §B: the + Create FAB is DELETED, not restacked.
             It and the account button were the controls colliding with content in the
             owner's screenshots; deleting them resolves that class at source, which is why
             M2/M3 are superseded. Creation moves to the chat surface (§C).
             window.__kilCreateMenu stays defined and callable so §C can route to it rather
             than rebuild the sheet. */

          /* §B: the floating profile icon is DELETED.
             It was held while the profile route was undecided — removing it left no way to
             reach your own account on mobile, since the bottom bar is Explore · Culture ·
             Radio · Scene · VS and the desktop header is hidden below 861px. That is now
             answered: the route lives in chat (§C), whose first slot becomes Profile once
             signed in. The deletion ships in the SAME change as those two options, so the
             gap never exists on main. */
          /* mobile-only floating Settings hamburger on profile pages (top bar is gone on mobile) */
          if(RULES.gear==='hamburger' && !document.getElementById('kil-mhamb')){
            var mh=document.createElement('a'); mh.id='kil-mhamb'; mh.href='/settings.html'; mh.setAttribute('aria-label','Settings');
            mh.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
            document.body.appendChild(mh);
          }
        }catch(e){}
      };
      /* §C: the profile page is the one place chat must not appear. */
      try{ document.body.classList.toggle('kil-profile', /(^|\/)profile\.html$/i.test(location.pathname)); }catch(e){}
      window.__kilMountBnav();
      window.__kilMountFloating();
      mountDestinationRails();
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
  /* Published so the click tracker (assets/js/kt-analytics.js) can log outbound clicks first-party
     without loading the whole supabase client. Anon key only — same key already shipped in this
     file and in every page's markup; it grants nothing beyond RLS. Set here rather than duplicated
     in the tracker so there is ONE copy of the key in the shell. */
  try{ window.KIL_ANON = SB_KEY; window.KIL_SB_URL = SB_URL; }catch(e){}
  function ensureSB(cb){ if(window.supabase){cb();return;} var s=document.createElement('script'); s.src="/assets/js/vendor/supabase-js.min.js"; s.onload=cb; s.onerror=cb; document.head.appendChild(s); }
  function shellClient(){ try{ if(!window.__kilShellSB && window.supabase) window.__kilShellSB=window.supabase.createClient(SB_URL,SB_KEY); }catch(e){} return window.__kilShellSB||null; }
  /* profile hamburger dropdown: Edit profile · Settings */
  function kilProfMenu(ev){ try{ ev.preventDefault(); ev.stopPropagation(); }catch(e){}
    var ex=document.getElementById('kil-profmenu'); if(ex){ ex.remove(); return; }
    var m=document.createElement('div'); m.id='kil-profmenu';
    m.style.cssText='position:absolute;z-index:10050;min-width:190px;background:#12121c;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:6px;box-shadow:0 16px 40px rgba(0,0,0,.55)';
    m.innerHTML='<button data-a="edit" style="display:block;width:100%;text-align:left;background:none;border:0;color:#eceefb;font:600 .9rem Inter,sans-serif;padding:11px 13px;border-radius:8px;cursor:pointer">Edit profile</button>'
      +'<button data-a="settings" style="display:block;width:100%;text-align:left;background:none;border:0;color:#eceefb;font:600 .9rem Inter,sans-serif;padding:11px 13px;border-radius:8px;cursor:pointer">Settings</button>'
      +'<button data-a="signout" style="display:block;width:100%;text-align:left;background:none;border:0;border-top:1px solid rgba(255,255,255,.09);margin-top:4px;color:#ff6b6b;font:700 .9rem Inter,sans-serif;padding:11px 13px;border-radius:8px;cursor:pointer">Sign out</button>';
    document.body.appendChild(m);
    var btn=(ev&&(ev.currentTarget||ev.target.closest&&ev.target.closest('a,button')))||null;
    if(btn&&btn.getBoundingClientRect){ var r=btn.getBoundingClientRect(); m.style.top=(r.bottom+window.scrollY+8)+'px'; m.style.left=Math.max(8,(r.right+window.scrollX-m.offsetWidth))+'px'; }
    m.querySelectorAll('button').forEach(function(b){ b.onmouseover=function(){b.style.background='rgba(255,255,255,.07)';}; b.onmouseout=function(){b.style.background='none';}; });
    m.querySelector('[data-a=edit]').onclick=function(){ m.remove(); if(typeof window.openEditProfile==='function'){ window.openEditProfile(); } else { location.href='/profile.html?edit=1'; } };
    m.querySelector('[data-a=settings]').onclick=function(){ m.remove(); location.href='/settings.html'; };
    m.querySelector('[data-a=signout]').onclick=function(){ m.remove(); try{ if(window.supabase&&window.supabase.createClient){ window.supabase.createClient('https://ovmqtzjfpzrbzrlkxwgw.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ').auth.signOut(); } }catch(e){} try{ Object.keys(localStorage).forEach(function(k){ if(/^sb-.*-auth-token/.test(k)) localStorage.removeItem(k); }); }catch(e){} location.href='/'; };
    setTimeout(function(){ document.addEventListener('click',function h(e){ var mm=document.getElementById('kil-profmenu'); if(mm&&!mm.contains(e.target)){ mm.remove(); } document.removeEventListener('click',h); }); },0);
  }
  window.kilProfMenu=kilProfMenu;
  function applyAuthState(hdr, s){
    /* mobile floating hamburger: profile pages, signed-in, mobile viewport only */
    try{ var mh=document.getElementById('kil-mhamb'); if(mh) mh.style.display=(s&&IS_MOBILE)?'flex':'none'; }catch(e){}
    /* The bottom bar no longer carries Profile (K1), so the mobile account control is the
       thing that has to track auth state. Runs whether or not the header exists. */
    /* The floating account control is gone (§B); chat carries the profile route now. */
    if(!hdr) return;
    /* On the profile page (and only there), the top-right control becomes a hamburger -> Settings.
       Applies to BOTH desktop (.v3s-cta) and mobile (top icon row). Founder directive 2026-07-16. */
    var onProfile=(RULES.gear==='hamburger');   /* standards-driven: page_standards.gear_rule */
    var HAMB='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    var cta=hdr.querySelector('.v3s-cta'), mlog=hdr.querySelector('#v3s-mlogin');
    if(cta){
      if(s && onProfile){ cta.innerHTML=HAMB; cta.setAttribute('href','#'); cta.setAttribute('title','Menu'); cta.setAttribute('aria-label','Profile menu'); cta.classList.add('v3s-hamb'); cta.style.cssText='color:var(--text,#fff);display:inline-flex;align-items:center;justify-content:center;padding:8px 12px';
        var _sv=cta.querySelector('svg'); if(_sv){ _sv.style.width='22px'; _sv.style.height='22px'; }
        try{ cta.onclick=kilProfMenu; }catch(e){} }
      else { cta.textContent = s?'PROFILE':'LOGIN'; cta.setAttribute('href', s?'/profile.html':'/apply.html'); cta.classList.remove('v3s-hamb'); }
    }
    if(mlog){ mlog.textContent = s?'Profile':'Login'; mlog.setAttribute('href', s?'/profile.html':'/apply.html'); }
    var iprof=document.getElementById('v3s-iconprof');
    if(iprof){
      if(s && onProfile){ iprof.innerHTML=HAMB; iprof.setAttribute('href','/settings.html'); iprof.setAttribute('aria-label','Settings'); }
      else iprof.setAttribute('href', s?'/profile.html':'/apply.html');
    }

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
      var mm=v.match(/url\(([^)]+)\)/); return mm?mm[1].replace(/['"]/g,''):'/assets/images/logo-blue-nav.png';
    }catch(e){ return '/assets/images/logo-blue-nav.png'; }
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
    +'#v3shell-nav .v3s-brandtext.on{color:var(--brand-2,#5cc8ff)}'
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
    /* Mobile account control. Sits left of the Settings hamburger when that is also up, so
       the two never stack on the same pixels. */
    /* M2: every pinned control steps aside while a sheet is open. KILO's button is included
       deliberately — it is not ours, but it was sitting on top of the Create sheet too. */
    /* ── §C: ONE OWNER FOR THE CHAT BUTTON ────────────────────────────────────────────────
       #kilo-btn is injected by keepitil-ai.js on 46 pages, and five different places were
       overriding where it sat: index.html set `bottom` TWICE with !important and the two
       disagreed (68px vs calc(62px + inset)); culture.html moved it right AND down AND scaled
       it to .85; keepitil-radio.js — loaded on culture, radio and index — added four more. The
       ticket found four pages; it was really three positions and two sizes across five sources.

       All of those are deleted. This is the only rule now, and it is anchored to the MEASURED
       nav height rather than a pixel guess, so it survives the nav changing size.

       Deliberately --kil-bnav-h and not --kil-pinned-h: the pinned measurement INCLUDES this
       button, so positioning from it would be circular — the button's position feeding the
       measurement that sets the button's position. The nav height is independent, and content
       clearance still uses the full --kil-pinned-h (M3). */
    /* Founder-tuned 2026-08-15: 40px button, 30px glyph, 5px from the right edge, 5px above the nav.
       A 30px glyph in a 40px circle leaves 5px of padding — deliberate, but it means the icon
       must not carry its own box: width/height are forced to the glyph size so a 26px default
       can't quietly re-inflate the button. */
    +'#kilo-btn{right:5px!important;left:auto!important;top:auto!important;bottom:calc(var(--kil-bnav-h,56px) + 5px)!important;width:40px!important;height:40px!important;min-width:0!important;min-height:0!important;padding:0!important;border-radius:50%!important;background:linear-gradient(135deg,#00b4ff,#22e39b)!important;display:flex!important;align-items:center;justify-content:center;overflow:hidden}'
/* Founder-tuned 2026-08-22 in the floating-button editor: 40px button, 20px glyph. */
    +'#kilo-btn svg,#kilo-btn img,#kilo-btn i{width:20px!important;height:20px!important;font-size:20px!important;line-height:1!important;display:block}'
    /* Chat visibility is now driven by KIL_FLOATING, not a single hardcoded page rule.
       The class is applied to <html> at mount. NOTE: the owner turned chat ON for profile
       (reversing §C) and OFF for Culture and VS on 2026-08-15. */
    +'html.kil-nochat #kilo-btn,html.kil-nochat #kilo-panel{display:none!important}'
    /* Scroll-to-top. Founder-tuned 2026-08-22 in the floating-button editor: 35px SQUARE
       (border-radius 0 — deliberate, it is no longer a disc), 25px glyph, left, 5px from the
       edge, 5px above the nav. The glyph now fits inside the box, so overflow:visible is no
       longer load-bearing, but it is kept: it costs nothing and a later glyph bump would clip. */
    +'#kil-top{position:fixed;left:5px;right:auto;bottom:calc(var(--kil-bnav-h,56px) + 5px);width:35px;height:35px;border-radius:0;background:#0aa2e8;color:#fff;border:0;cursor:pointer;z-index:940;display:flex;align-items:center;justify-content:center;font-size:25px;line-height:0;padding:0;opacity:0;pointer-events:none;transform:translateY(16px);transition:opacity .28s,transform .28s;overflow:visible}'
    +'#kil-top.on{opacity:1;transform:none;pointer-events:auto}'
    +'html.kil-noarrow #kil-top{display:none!important}'
    /* R4.5 (Founder 2026-08-24: "remove the up blue arrow in the bottom left corner").
       Culture mobile ONLY. On a snap feed there is no scroll position to return from, and the
       control sits over the card's action rail. It stays on long pages like / and /earn, which
       the Founder signed off in the same round — removing it globally would change pages he
       has just approved. Lives here rather than in culture/index.html because the shell owns
       this control and a page rule would only be fighting it. */
    +'body.cul-m #kil-top{display:none!important}'
    /* ── BUTTON SIZES, Founder-locked 2026-08-19 via the sizing preview ──────────────────────
       desktop up 50 · desktop chat 50 · mobile up 30 · mobile chat 30.
       #kil-top had NO desktop rule at all — its only declaration lived inside the ≤860px block,
       so on desktop it fell back to intrinsic button sizing and was never actually specified.
       #kilo-btn is injected by v3/keepitil-ai.js, which loads after this shell, so overriding
       it needs !important at equal specificity — the same reason the mobile override already
       carried one. The glyph is scaled with the button; at 30px the stock 26px icon would fill
       the disc edge to edge. */
    /* The per-breakpoint SIZES that used to live here (desktop 50/22, mobile 30/15, locked
       2026-08-19 via the older sizing preview) are REMOVED. The Founder re-tuned both buttons on
       2026-08-22 in the floating-button editor and specified ONE set of values for every width:
       chat 40/20, arrow 35 square/25. Leaving the media queries in place would have silently
       beaten those values at both breakpoints — the base rules above would never have applied at
       any screen size. One size, one rule; re-add a query only if a width genuinely needs to
       differ. */
    +'body.kil-sheet-open #kilo-btn,body.kil-sheet-open #kil-mhamb{display:none!important}'
    /* K4 destination rail. Horizontal scroll on narrow screens rather than wrapping, so it
       never pushes the page's own content down a phone screen. */
    +'.kil-drail{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin:22px auto 0;max-width:760px;padding:0 12px}'
    +'.kil-drail-item{display:inline-flex;align-items:center;gap:8px;padding:9px 15px;min-height:44px;box-sizing:border-box;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(10,10,16,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;text-decoration:none;font-family:"Bebas Neue",sans-serif;letter-spacing:.13em;font-size:1rem;line-height:1;transition:border-color .15s,color .15s,transform .1s}'
    +'.kil-drail-item:hover{border-color:var(--d-tint,#00b4ff);color:var(--d-tint,#00b4ff)}'
    +'.kil-drail-item:active{transform:scale(.96)}'
    +'.kil-drail-item:focus-visible{outline:2px solid var(--d-tint,#fff);outline-offset:2px}'
    +'.kil-drail-ico svg{width:19px;height:19px;display:block;color:var(--d-tint,#fff)}'
    /* Narrow: cap the rail so four items break 2+2 rather than 3+1, which reads as an
       accident. Each pill is also stretched to an even width so the two columns line up. */
    +'@media(max-width:520px){.kil-drail{gap:8px;max-width:300px}.kil-drail-item{flex:1 1 128px;justify-content:center;padding:9px 10px;font-size:.92rem}.kil-drail-ico svg{width:17px;height:17px}}'
    +'#v3shell-nav .v3s-cta.v3s-hamb{display:inline-flex;align-items:center;padding:7px 12px}'
    +'#v3shell-nav .v3s-cta.v3s-hamb svg{width:22px;height:22px;display:block}'
    /* mobile bottom nav (Instagram model) — replaces the radio bar UI on ≤860px; radio audio keeps playing off-screen */
    +'#kil-bnav{display:none;position:fixed;top:auto!important;height:auto!important;min-height:0!important;max-height:96px;left:0;right:0;bottom:0;z-index:950;background:rgba(10,10,16,.97);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid rgba(255,255,255,.08);padding:6px 10px calc(6px + env(safe-area-inset-bottom,0px));align-items:center;justify-content:space-around}'
    /* Equal spacing (Founder 2026-08-15): flex:1 1 0 gives every slot an identical share of the
       bar, so the five icon+label columns are evenly distributed regardless of how long the
       words are. justify-content alone could not do this — space-around distributes the LEFTOVER
       space around items of differing intrinsic width, so "DISCOVER" and "EARN" pushed their
       neighbours off-centre. min-width:0 stops a long word from widening its own slot. */
    +'#kil-bnav a{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:6px 2px;color:rgba(255,255,255,.72);text-decoration:none;transition:color .15s,transform .1s}'
    +'#kil-bnav a svg{width:23px;height:23px;display:block}'
    +'#kil-bnav .kb-l{font-size:8px;line-height:1;letter-spacing:.06em;font-weight:700;text-transform:uppercase;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    +'#kil-bnav a img{height:23px;width:auto;mix-blend-mode:screen;display:block}'
    +'#kil-bnav a#kb-home img.kb-logo{display:block;height:23px!important;width:auto!important;max-width:none!important;mix-blend-mode:screen}'
    /* No visible scrollbars on any horizontal rail (Founder 2026-08-15). */
    +'.kil-drail,.evx-nav-row,#evx .evx-row,.rad-scroll,.cul-scroll,.sc-scroll,#kil-bnav{scrollbar-width:none;-ms-overflow-style:none}'
    +'.kil-drail::-webkit-scrollbar,.evx-nav-row::-webkit-scrollbar,#evx .evx-row::-webkit-scrollbar,.rad-scroll::-webkit-scrollbar,.cul-scroll::-webkit-scrollbar,.sc-scroll::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}'
    /* K2 active state. Inactive is muted; active is the destination's own tint plus its
       glow. Colour alone is not the only signal — aria-current is set too, so the state
       is available to a screen reader and not just to sighted users. */
    /* !important is load-bearing here: it is the only thing that beats the inline tint,
       and inverting it this way means the ACTIVE state needs no override at all. */
    +'#kil-bnav a:not(.on){color:rgba(255,255,255,.55)!important;filter:none!important}'
    +'#kil-bnav a{transition:color .15s,filter .15s,opacity .15s}'
    +'#kil-bnav a#kb-home img.kb-logo{opacity:1}'
    +'#kil-bnav a#kb-home:not(.on) img.kb-logo{opacity:.55}'
    +'#kil-bnav a:focus-visible{outline:2px solid #fff;outline-offset:-3px;border-radius:8px}'
    +'#kil-bnav a:active{transform:scale(.9)}'
    /* K1: Create is a floating action. env(safe-area-inset-bottom) keeps it above the home
       indicator, and it clears the 5-slot bar rather than sitting inside it. */
    /* Profile is contextual, not a destination — it sits with the account controls. */
    +'.v3s-icons a.v3s-contextual{margin-left:14px;padding-left:14px;border-left:1px solid rgba(255,255,255,.12)}'
    +'#kil-bnav a.kb-plus{color:#00b4ff;font-size:2.3rem;font-weight:800;line-height:1;background:transparent;border:0;border-radius:0;box-shadow:none;width:auto;height:auto;padding:0;margin:0 4px;text-shadow:0 0 10px rgba(0,180,255,.85)}'
    +'#kil-createmenu a:active{background:rgba(255,255,255,.06)}'
    /* K2: 72px was a guess at the bar's height. The bar is `height:auto` with its own
       safe-area padding, so the real figure moves with the inset and with the icon size.
       --kil-bnav-h is measured from the mounted element (see placeBar) and this is the
       fallback for the first paint. The inset is NOT added again here: the bar already
       includes it in its own padding, and adding it twice left a visible dead band. */
    /* ── M1: TOP SAFE AREA ─────────────────────────────────────────────────────────────────
       K2 added viewport-fit=cover so the BOTTOM insets would stop evaluating to zero. The same
       flag also moves the viewport origin up under the status bar, and nothing compensated for
       that — grep for safe-area-inset-top across this file before this change: zero matches.
       Result on the owner's device: the ECHO header sat on the clock, and Radio's sticky tab
       row rendered over it.

       Compensated from HERE rather than in each page, because the cause is global: one flag
       moved the origin for every page at once, so one block should move it back. env() is 0 on
       every device without a notch, so this is inert everywhere else.

       The pattern for a sticky row is grow-and-pad, not offset: pushing it down with `top`
       would leave a transparent strip with content scrolling through the status bar. It grows
       upward to fill that strip with its own background, and pads its content clear of the
       clock. Anything sticking BELOW it then shifts by the same amount, or it overlaps. */
    /* !important is required, not decorative: the shell's stylesheet is NOT last in the
       document. radio.html injects its own <style> after the shell mounts, so a shell
       rule for #radMTabs lost on source order even though it was correct — measured:
       the substituted rule was present in v3shell-style and computed height stayed 38px.
       Specificity/order cannot be relied on across pages that add styles at runtime. */
    /* ── THE BLACK STATUS LAYER (Founder 2026-08-24) ───────────────────────────────────────
       Solid black, edge to edge, above every page layer including the bottom nav (950) and the
       radio bar (9998) — nothing may ever paint over the clock. pointer-events:none because it
       covers the iOS pull-down region and swallowing that would break Control Centre.
       PHONE ONLY: on desktop there is no inset, and a stray fixed strip at z-index 2147483000
       is not worth the risk. */
    +'@media(max-width:860px){'
    +  '#kil-statusbar{position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top,0px);'
    +    'background:#000;z-index:2147483000;pointer-events:none}'
    /* ── STICKY CONTROL DECK (Founder 2026-08-24) ────────────────────────────────────────
       "the filters sit naturally underneath the page name/metrics. As the user scrolls and
       the hero disappears, the filter deck sticks directly underneath the black iOS status
       bar. No additional blank spacer."
       One class, used by Discovery, Connect, Create and Earn, so the four surfaces cannot
       drift apart again. `top` is the measured layer height, NOT a hardcoded 46/38/66 — that
       is the whole point of publishing --kil-safe-top.
       z-index 940: BELOW the bottom nav (950), because the Founder's rule is that the nav is
       an app-shell layer that page content passes behind, never in front of. */
    +  '.kil-deck{position:sticky;top:var(--kil-safe-top,0px);z-index:940;'
    +    'background:#0b0b12;width:100vw;margin-left:calc(50% - 50vw);'
    +    'padding:8px 14px;display:flex;flex-direction:column;gap:8px}'
    /* Full-bleed opaque, so no backdrop shows above it or down either side as the page scrolls
       underneath (Founder 2026-08-21). The ::before closes the sub-pixel seam that opens
       between a sticky element and the layer above it while momentum-scrolling on iOS —
       without it a thin bright line of backdrop flickers through. */
    +  '.kil-deck::before{content:"";position:absolute;left:0;right:0;top:-14px;height:14px;background:#0b0b12}'
    +  '.kil-deck-row{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none}'
    +  '.kil-deck-row::-webkit-scrollbar{display:none}'
    /* The leading chip is the scope of the row — DATE, TYPE, MUSIC, or the active geography
       (CA · OC). It is visually distinct because it is a label, not one of the options. */
    +  '.kil-deck-row>.kd-k{flex:0 0 auto;font-weight:800;letter-spacing:.08em;text-transform:uppercase;'
    +    'font-size:.68rem;color:#0b0b12;background:var(--brand,#00b4ff);border:0;border-radius:999px;'
    +    'padding:7px 13px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}'
    +  '.kil-deck-row>button:not(.kd-k){flex:0 0 auto;font-weight:700;letter-spacing:.06em;text-transform:uppercase;'
    +    'font-size:.68rem;color:#cfd6e4;background:transparent;border:1px solid rgba(255,255,255,.16);'
    +    'border-radius:999px;padding:7px 13px;cursor:pointer;white-space:nowrap}'
    +  '.kil-deck-row>button.on{color:var(--brand,#00b4ff);border-color:var(--brand,#00b4ff)}'
    +'}'
    +'#v3shell-nav{padding-top:env(safe-area-inset-top,0px)!important}'
    +'#kil-mhamb{top:max(12px,env(safe-area-inset-top,0px))!important}'
    /* culture.html — #culMTabs(46) -> .cul-typebar(46) -> #culSwToast(96) */
    +'#culMTabs{box-sizing:border-box!important;height:calc(46px + env(safe-area-inset-top,0px))!important;padding-top:env(safe-area-inset-top,0px)!important}'
    +'body.cul-m .cul-typebar{top:calc(46px + env(safe-area-inset-top,0px))!important}'
    +'#culSwToast{top:calc(96px + env(safe-area-inset-top,0px))!important}'
    /* radio.html — #radMTabs(38) -> #radMSecs(38) -> #radSwToast(38+36+10) */
    +'#radMTabs{box-sizing:border-box!important;height:calc(38px + env(safe-area-inset-top,0px))!important;padding-top:env(safe-area-inset-top,0px)!important}'
    +'#radMSecs{top:calc(38px + env(safe-area-inset-top,0px))!important}'
    +'#radSwToast{top:calc(38px + 36px + 10px + env(safe-area-inset-top,0px))!important}'
    /* profile.html — the back control and its tab stack */
    +'#pfBack{top:env(safe-area-inset-top,0px)!important}'
    /* §D.6 — the profile filter bar locks to the TOP on mobile.
       My M1 pass wrote calc(66px + inset) here unconditionally, and that was wrong: the
       66px is the height of the desktop header, which is display:none below 861px. The
       page already had `@media(max-width:768px){.pf-tabs{top:0!important}}` and my rule
       beat it, so on a phone the bar stuck 66px down the screen with content sliding
       through the gap above it. Measured: computed top 66px at 390px wide.
       Scoped now — the inset alone on mobile, header + inset on desktop. */
    +'@media(max-width:860px){.pf-tabs{top:env(safe-area-inset-top,0px)!important}}'
    +'@media(min-width:861px){.pf-tabs{top:calc(66px + env(safe-area-inset-top,0px))!important}}'
    +'@media(max-width:860px){#kil-bnav{display:flex}#kil-radio{transform:translateY(220%)!important;pointer-events:none!important}}'
    +'#v3-footer{border-top:1px solid var(--line,rgba(255,255,255,.08));background:var(--bg,#0a0a0f);color:var(--muted,#888);padding:40px 20px;margin-top:56px;font-family:var(--font,Inter,sans-serif);font-size:.85rem;text-align:left}'
    /* FOOTER GAP — Founder 2026-08-19: "there is a gap after the footer section" on Connect and
       Create. Cause: each page reserves room for the fixed bottom nav with its own
       body{padding-bottom} (Connect 72px, Create 96px + safe-area). That padding renders BELOW
       the footer, so the page ends with a strip of empty background under it.
       The clearance is still needed — it just belongs to the footer, not to the body. The footer
       now absorbs it as padding, so its background runs all the way down to the bottom nav and
       there is nothing after it. */
    +'@media(max-width:860px){'
    +  'body{padding-bottom:0!important}'
    /* Clearance trimmed 2026-08-20: 40px of padding ON TOP of the 56px nav and the safe area
       read as a large empty band under the footer. The nav still needs clearing — that part is
       not optional — but the extra 40 was arbitrary. 12px is enough to breathe. */
    +  '#v3-footer{margin-top:24px;margin-bottom:0;padding-top:24px;'
    /* ⚠ THE INSET IS NOT ADDED HERE (Founder 2026-08-24: "there is still a gap between the
       bottom of the content and the bottom nav bar"). --kil-bnav-h is MEASURED from the mounted
       bar, and that bar carries `padding-bottom:calc(6px + env(safe-area-inset-bottom))` — so
       the inset is already inside the number. Adding env() again reserved it twice and the
       second copy rendered as empty background between the content and the nav. Same mistake
       the Culture card made on 2026-08-23; see keepitil-shell-geometry-variables. */
    +    'padding-bottom:calc(12px + var(--kil-bnav-h,56px))}'
    +'}'
    +'#v3-footer .v3-foot-inner{max-width:var(--maxw,1400px);margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap}'
    +'#v3-footer .v3-foot-brand{font-weight:900;letter-spacing:.14em;font-size:1.05rem;background:linear-gradient(90deg,var(--brand,#00b4ff),var(--brand-2,#5cc8ff));-webkit-background-clip:text;background-clip:text;color:transparent;text-decoration:none}'
    +'#v3-footer .v3-foot-links{display:flex;gap:16px;font-weight:600;flex-wrap:wrap}#v3-footer a{color:inherit;text-decoration:none}#v3-footer .v3-foot-links a:hover{color:var(--brand,#00b4ff)}'
    +'#v3-footer .v3-foot-social{display:flex;gap:14px;align-items:center;flex-wrap:wrap}#v3-footer .v3-foot-social a{color:var(--muted,#888);display:inline-flex;transition:color .2s,transform .2s}#v3-footer .v3-foot-social a:hover{color:var(--brand,#00b4ff);transform:translateY(-2px)}'
    +'#v3-footer .v3-foot-inner{align-items:flex-start}#v3-footer .v3-foot-about{max-width:420px;flex:1 1 300px;text-align:left}#v3-footer .v3-foot-brand,#v3-footer .v3-foot-addr{text-align:left;display:block}'
    +'#v3-footer .v3-foot-desc{margin:10px 0 0;font-size:.82rem;line-height:1.55;color:var(--muted,#9a94b4);opacity:.9}'
    +'#v3-footer .v3-foot-addr{margin:8px 0 0;font-size:.74rem;line-height:1.5;color:var(--muted,#888);opacity:.7}#v3-footer .v3-foot-addr a{color:var(--brand-2,#5cc8ff)}'
    /* ── MOBILE FOOTER, SIX ROWS (Founder 2026-08-26) ────────────────────────────────────
       1 KEEPITIL · 2 street · 3 city · 4 social, full width · 5 legal, full width · 6 space.
       Desktop is untouched — every rule below is inside the ≤860px block.
       The short legal labels and the split address are markup that already exists on both
       breakpoints; only which half is shown changes, so there is no second copy of the
       footer to keep in sync. */
    /* Desktop default: long labels only. ⚠ THIS MUST PRECEDE THE MEDIA BLOCK. It was written
       after it, and with equal specificity the later rule wins at EVERY width — so .lg-s stayed
       display:none on mobile too and TICKETS and RULES rendered as empty links. Verified on the
       deployed page: legal labels read ["TERMS","PRIVACY","REFUNDS","",""]. */
    +'#v3-footer .lg-s{display:none}'
    +'@media(max-width:860px){'
    +  '#v3-footer .v3-foot-inner{flex-direction:column;align-items:center;gap:14px;text-align:center}'
    +  '#v3-footer .v3-foot-about{max-width:none;flex:0 0 auto;text-align:center}'
    +  '#v3-footer .v3-foot-brand{display:block;text-align:center;font-size:1.05rem;letter-spacing:.14em}'
    /* rows 2 and 3: two clean address lines. PMB and the email address are for the desktop
       one-liner; on a phone they push the street onto three ragged lines. */
    +  '#v3-footer .v3-foot-addr{text-align:center;text-transform:uppercase;letter-spacing:.06em;'
    +    'font-size:.7rem;line-height:1.7;opacity:.75}'
    +  '#v3-footer .fa-l1,#v3-footer .fa-l2{display:block}'
    +  '#v3-footer .fa-pmb,#v3-footer .fa-mail{display:none}'
    /* the destination links are the bottom nav on a phone — repeating them here is furniture */
    +  '#v3-footer .v3-foot-links{display:none}'
    /* row 4: icons stretched edge to edge, and big enough to hit. 44px is the minimum
       comfortable touch target; space-between spreads them across the full width. */
    +  '#v3-footer .v3-foot-social{display:flex;width:100%;justify-content:space-between;'
    +    'align-items:center;gap:0;margin:2px 0 0}'
    +  '#v3-footer .v3-foot-social a{flex:1 1 0;display:flex;align-items:center;justify-content:center;'
    +    'min-height:44px;padding:0}'
    +  '#v3-footer .v3-foot-social a svg{width:26px!important;height:26px!important}'
    /* row 5: the same treatment for legal, with the short labels */
    +  '#v3-footer .v3-foot-legal{display:flex!important;width:100%;flex-wrap:wrap;gap:6px 4px;'
    +    'justify-content:space-between;align-items:center;margin-top:14px!important;font-size:.66rem}'
    +  '#v3-footer .v3-foot-legal a{flex:1 1 0;text-align:center;white-space:nowrap;'
    +    'text-transform:uppercase;letter-spacing:.05em;min-height:34px;display:flex;'
    +    'align-items:center;justify-content:center}'
    +  '#v3-footer .lg-f{display:none}#v3-footer .lg-s{display:inline}'
    /* the copyright drops to its own centred line rather than fighting for width in row 5 */
    +  '#v3-footer .v3-foot-legal>span{flex:1 0 100%;margin-left:0!important;text-align:center;'
    +    'opacity:.6;padding-top:6px}'
    /* row 6: deliberate empty space so the floating up-arrow (left) and chat (right) buttons
       have somewhere to sit that is not on top of a link. */
    +  '#v3-footer{padding-bottom:calc(84px + var(--kil-bnav-h,62px))!important}'
    +'}'
    +'#v3-theme{position:fixed;left:16px;bottom:124px;z-index:600;display:flex;flex-direction:column-reverse;align-items:center;gap:8px}'
    +'#v3-theme .v3t-btn{width:44px;height:44px;border-radius:50%;background:var(--surface,#15151f);border:1px solid var(--line,rgba(255,255,255,.14));color:var(--text,#f0f0f0);font-size:1.15rem;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.4);line-height:1}'
    +'#v3-theme .v3t-pop{display:none;flex-direction:column;gap:9px;background:var(--surface,#15151f);border:1px solid var(--line,rgba(255,255,255,.14));border-radius:26px;padding:10px;box-shadow:0 12px 30px rgba(0,0,0,.5)}'
    +'#v3-theme.open .v3t-pop{display:flex}'
    +'#v3-theme .v3t-sw{width:26px;height:26px;border-radius:50%;border:2px solid rgba(255,255,255,.22);cursor:pointer;padding:0;transition:transform .15s}'
    +'#v3-theme .v3t-sw:hover{transform:scale(1.12)}#v3-theme .v3t-sw.on{border-color:var(--text,#fff);box-shadow:0 0 0 2px var(--text,#fff)}';
    document.head.appendChild(s);
  }
  if(document.body) build(); else document.addEventListener('DOMContentLoaded', build);
  /* ── SELF-HEAL (P0 nav bug, 2026-07-17): pillar pages intermittently lost their chrome
     (bottom nav missing on giveback.html after click-through; silent page-script exceptions
     can starve the mount). Re-assert every 2.5s + on history navigation:
     top nav rebuilt if absent, bottom nav re-mounted if absent, radio kill re-applied on
     pages where audio is not allowed. All idempotent, all no-ops when everything is present. */
  try{
    var _heal=function(){
      try{
        if(IN_IFRAME) return;
        if(RULES.nav!==false && !document.getElementById('v3shell-nav')) build();
        if(window.__kilMountBnav) window.__kilMountBnav();
        if(window.__kilMountFloating) window.__kilMountFloating();
        mountDestinationRails();
        if(window.__kilRadioKill) window.__kilRadioKill();
      }catch(e){}
    };
    window.addEventListener('popstate', function(){ setTimeout(_heal, 60); });
    setInterval(_heal, 2500);
  }catch(e){}
})();
