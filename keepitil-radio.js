/*!
 * KEEPITIL Radio Bar — keepitil-radio.js  v1.0
 * Self-injecting · 24/7 synchronized SoundCloud stream · X-mark logo
 */
(function(){
  if(window.__kilRadioInit)return;
  window.__kilRadioInit=true;

  // ── Inject CSS ────────────────────────────────────────────────────────────
  var css=document.createElement('style');
  css.setAttribute('data-kil','player');
  css.textContent=
    '#kil-radio{position:fixed;bottom:0;left:0;right:0;height:56px;z-index:9998;background:rgba(6,6,6,.97);border-top:1px solid rgba(0,255,136,.2);box-shadow:0 -2px 24px rgba(0,0,0,.7);backdrop-filter:blur(18px);font-family:\'Space Grotesk\',\'Inter\',sans-serif;display:flex;align-items:center;padding:0 16px;gap:12px;overflow:hidden;transition:bottom .3s,left .3s,right .3s,width .3s,height .3s,border-radius .3s,border .3s,padding .3s,box-shadow .3s;}'+
    '#kil-radio.kil-mini{bottom:20px!important;left:auto!important;right:24px!important;width:58px!important;height:58px!important;border-radius:50%!important;border:2px solid rgba(0,255,136,.3)!important;border-top:2px solid rgba(0,255,136,.3)!important;box-shadow:0 4px 24px rgba(0,0,0,.7),0 0 20px rgba(0,255,136,.08)!important;cursor:pointer!important;padding:0!important;justify-content:center!important;gap:0!important;}'+
    '#kil-mini-dot{display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:1.5rem;color:#00ff88;animation:kil-blink 2s ease-in-out infinite;}'+
    '#kil-radio.kil-mini #kil-mini-dot{display:flex!important;}'+
    '#kil-radio.kil-mini .kil-live,#kil-radio.kil-mini .kil-brand,#kil-radio.kil-mini .kil-divider,#kil-radio.kil-mini #kil-track,#kil-radio.kil-mini .kr-controls,#kil-radio.kil-mini .kil-submit,#kil-radio.kil-mini #kr-toggle{display:none!important;}'+
    '.kil-live{width:7px;height:7px;border-radius:50%;background:#00ff88;flex-shrink:0;box-shadow:0 0 6px #00ff88;animation:kil-blink 2s ease-in-out infinite;}'+
    '.kil-live.off{background:#444;box-shadow:none;animation:none;}'+
    '@keyframes kil-blink{0%,100%{opacity:1;}50%{opacity:.35;}}'+
    '.kil-brand{display:flex;align-items:center;gap:6px;flex-shrink:0;}'+
    '.kil-brand-live{font-size:.55rem;font-weight:900;letter-spacing:.18em;color:#00ff88;text-transform:uppercase;}'+
    '.kil-brand-logo{height:28px;width:auto;filter:drop-shadow(0 0 4px rgba(255,80,120,.7));}'+
    '.kil-brand-radio{font-size:.55rem;font-weight:900;letter-spacing:.18em;color:#00ff88;text-transform:uppercase;}'+
    '#kil-track{font-size:.66rem;color:rgba(255,255,255,.5);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'+
    '.kil-hasad #kil-track{flex:0 1 auto;max-width:210px;}'+
    '.kil-ad{flex:1;display:flex;align-items:center;justify-content:center;min-width:0;overflow:hidden;}'+
    '.kil-ad a{display:inline-flex;align-items:center;gap:8px;font-size:1.15rem;font-weight:800;letter-spacing:.01em;background:rgba(0,255,136,.14);border:1px solid rgba(0,255,136,.45);color:#00ff88;padding:8px 22px;border-radius:12px;white-space:nowrap;line-height:1;transition:opacity .5s;}'+
    '.kil-ad .rlabel{opacity:.6;font-weight:600;}'+
    '#kil-radio.kil-mini .kil-ad{display:none!important;}'+
    '.kil-divider{color:rgba(255,255,255,.2);flex-shrink:0;}'+
    '.kr-controls{display:flex;align-items:center;gap:6px;flex-shrink:0;}'+
    '.kr-btn{background:none;border:none;cursor:pointer;color:#00ff88;font-size:.85rem;line-height:1;padding:2px 4px;transition:opacity .2s;flex-shrink:0;}'+
    '.kr-btn:hover{opacity:.6;}'+
    '#kr-vol{width:60px;accent-color:#00ff88;cursor:pointer;opacity:.75;vertical-align:middle;}'+
    '.kil-submit{font-size:.62rem;font-weight:700;color:#00ff88;border:1px solid rgba(0,255,136,.3);border-radius:20px;padding:3px 10px;text-decoration:none;white-space:nowrap;flex-shrink:0;transition:background .2s;}'+
    '.kil-submit:hover{background:rgba(0,255,136,.08);}'+
    '#kil-sc{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;}'+
    // Echo (kilo) — reposition above radio bar
    '#kilo-btn{bottom:66px!important;}'+
    '#kilo-panel{bottom:134px!important;}'+
    '.radio-mini #kilo-btn{bottom:88px!important;right:24px!important;}'+
    '.radio-mini #kilo-panel{bottom:156px!important;right:24px!important;}'+
    // Body padding so content clears the fixed bar
    'body{padding-bottom:56px;}'+
    // Scroll-to-top button: lift above radio bar, move to left to avoid Echo on right
    '#scroll-top{bottom:70px!important;left:24px!important;right:auto!important;}'+
    '.radio-mini #scroll-top{bottom:92px!important;}'+
    // Nav logo: bigger across all pages (overrides inline height:30px)
    'a.nav-logo img,#main-nav img,nav img[src*="keepitil-x-"]{height:44px!important;width:auto!important;}'+
    '@media(max-width:600px){'+
      '.kil-ad{display:none!important;}'+
      '.kil-live,.kil-brand-live,.kil-divider{display:none!important;}'+   /* far left = logo + RADIO only */
      '#kil-track{display:block!important;flex:1 1 auto;min-width:0;text-align:center;font-size:.62rem;padding:0 6px;color:rgba(255,255,255,.7);}'+  /* center: song title + artist */
      '.kil-submit{display:none!important;}'+
      '#kr-toggle{display:none!important;}'+   /* volume + speaker become the far-right controls */
      '.kil-brand{gap:5px;}'+
      '.kr-controls{gap:9px;margin-left:auto;flex-shrink:0;}'+
      '#kr-vol{width:74px;height:20px;}'+
      '#kil-radio{gap:8px;padding:0 12px;}'+
    '}'+
    '@media(max-width:480px){#kilo-btn{bottom:66px!important;right:16px!important;}.radio-mini #kilo-btn{bottom:88px!important;right:16px!important;}.radio-mini #kilo-panel{bottom:156px!important;right:12px!important;}}';
  document.head.appendChild(css);

  // ── Inject HTML (skip if already in DOM — e.g. inline on index.html) ─────
  if(!document.getElementById('kil-radio')){
    var bar=document.createElement('div');
    bar.id='kil-radio';
    var __ad=true; bar.className='kil-hasad';
    var adHTML='<div class="kil-ad"><a href="https://distrokid.com/vip/seven/11538316" id="kil-ad-link" target="_blank" rel="noopener sponsored nofollow" data-kt="affiliate_click"><span id="kil-ad-text">🎵 Release on DistroKid</span></a></div>';
    bar.innerHTML=
      '<div id="kil-mini-dot">♬</div>'+
      '<div class="kil-live off" id="kil-led"></div>'+
      '<div class="kil-brand">'+
        '<span class="kil-brand-live">LIVE</span>'+
        '<img src="/keepitil-x-logo.png" class="kil-brand-logo" alt="KEEPITIL"/>'+
        '<span class="kil-brand-radio">RADIO</span>'+
      '</div>'+
      '<span class="kil-divider">·</span>'+
      '<span id="kil-track">Loading...</span>'+
      adHTML+
      '<div class="kr-controls">'+
        '<button class="kr-btn" id="kr-mute" title="Mute / Unmute">🔊</button>'+
        '<input type="range" id="kr-vol" min="0" max="100" value="5" title="Volume"/>'+
      '</div>'+
      '<a href="/signup.html" class="kil-submit" target="_blank">🎵 Play your song?</a>'+
      '<button class="kr-btn" id="kr-toggle" title="Minimize radio">—</button>';
    document.body.appendChild(bar);
    // ── rotating referral ad (middle of the bar) ──
    (function(){
      var link=document.getElementById('kil-ad-link'),txt=document.getElementById('kil-ad-text');
      if(!link||!txt)return;
      var ads=[
        {t:'🎵 Release on DistroKid',u:'https://distrokid.com/vip/seven/11538316'},
        {t:'🎟 List Your Event · Posh',u:'https://posh.vip/create_group?ref=S-referral-mp9itc5j-wb9dbt'},
        {t:'💸 Earn on FreeCash',u:'https://freecash.com/r/Tuitea'},
        {t:'🛒 Shop Rave Gear',u:'https://www.illestratedlifestyle.com'}
      ];
      var i=0;
      setInterval(function(){
        i=(i+1)%ads.length;link.style.opacity=0;
        setTimeout(function(){txt.textContent=ads[i].t;link.href=ads[i].u;link.style.opacity=1;},400);
      },5000);
    })();

    var sc=document.createElement('iframe');
    sc.id='kil-sc';
    sc.setAttribute('allow','autoplay');
    sc.setAttribute('scrolling','no');
    sc.setAttribute('frameborder','no');
    sc.src='https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/illestrated-lifestyle&color=%2300ff88&auto_play=true&buying=false&liking=false&download=false&sharing=false&show_artwork=false&show_comments=false&show_playcount=false&show_user=false&hide_related=true&continuous_play=true&single_active=false';
    document.body.appendChild(sc);
  }

  // ── Radio init ────────────────────────────────────────────────────────────
  var radio=document.getElementById('kil-radio');
  var frame=document.getElementById('kil-sc');
  var led=document.getElementById('kil-led');
  var trackEl=document.getElementById('kil-track');
  var muteBtn=document.getElementById('kr-mute');
  var volEl=document.getElementById('kr-vol');
  var toggleBtn=document.getElementById('kr-toggle');
  var widget=null,playing=false,muted=false,savedVol=5,interacted=false,widgetReady=false,miniState=false,wakeLock=null;
  var isMobile=('ontouchstart'in window)||(navigator.maxTouchPoints>0);
  var DEFAULT_VOL=isMobile?3:5;
  savedVol=DEFAULT_VOL; if(volEl)volEl.value=DEFAULT_VOL;
  var SYNC_EPOCH=1735689600000; // 2026-01-01 00:00 UTC — fallback only
  var currentTrackIdx=0,currentPosition=0; // kept fresh for beforeunload handoff

  // ── Supabase radio sync ───────────────────────────────────────────────────
  var SUPA_URL='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  var SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  var commercialAudio=null,inCommercial=false;

  // ── Save playback state before navigating away ────────────────────────────
  window.addEventListener('beforeunload',function(){
    if(!widgetReady)return;
    try{
      sessionStorage.setItem('kil_hand',JSON.stringify({idx:currentTrackIdx,pos:currentPosition,ts:Date.now(),vol:muted?0:savedVol,muted:muted}));
    }catch(e){}
  });

  function getVol(){return muted?0:Math.max(0,Math.min(100,parseInt(volEl?volEl.value:DEFAULT_VOL)||DEFAULT_VOL));}

  // ── Mini / expand toggle ──────────────────────────────────────────────────
  function setMini(on){
    miniState=on;
    if(on){radio.classList.add('kil-mini');document.body.classList.add('radio-mini');}
    else{radio.classList.remove('kil-mini');document.body.classList.remove('radio-mini');}
    try{localStorage.setItem('kil_radio_mini',on?'1':'0');}catch(e){}
  }
  try{if(localStorage.getItem('kil_radio_mini')==='1')setMini(true);}catch(e){}
  if(toggleBtn){toggleBtn.addEventListener('click',function(e){e.stopPropagation();setMini(true);});}
  if(radio){radio.addEventListener('click',function(){if(miniState)setMini(false);});}

  // ── LED state ─────────────────────────────────────────────────────────────
  function goLive(){if(led)led.classList.remove('off');playing=true;}
  function goOff(){if(led)led.classList.add('off');playing=false;}

  function unmute(){interacted=true;if(!widget||!widgetReady)return;if(muted)return;widget.setVolume(getVol());if(!playing)widget.play();}
  function reListenGesture(){['mousemove','scroll','touchstart','keydown'].forEach(function(ev){document.addEventListener(ev,unmute,{passive:true,once:true});});}
  reListenGesture();

  // ── Wake lock (keeps radio alive on mobile) ───────────────────────────────
  function requestWakeLock(){if(!('wakeLock'in navigator))return;navigator.wakeLock.request('screen').then(function(l){wakeLock=l;l.addEventListener('release',function(){wakeLock=null;});}).catch(function(){});}
  requestWakeLock();

  // ── 24/7 keepalive — resume if browser pauses ────────────────────────────
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible'){
      requestWakeLock();
      if(widget&&widgetReady&&interacted&&!muted){setTimeout(function(){widget.isPaused(function(p){if(p){widget.setVolume(getVol());widget.play();}});},500);}
    }
  });
  setInterval(function(){if(!widget||!widgetReady||!interacted||muted)return;widget.isPaused(function(p){if(p){widget.setVolume(getVol());widget.play();}});},30000);
  // ── 10-second Supabase radio state poll ──────────────────────────────────
  setInterval(function(){if(widgetReady)fetchRadioState(applyRadioState);},10000);

  // ── Supabase radio sync functions ────────────────────────────────────────
  function fetchRadioState(cb){
    fetch(SUPA_URL+'/rest/v1/radio_state?id=eq.1&select=*',{
      headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY}
    }).then(function(r){return r.json();})
    .then(function(d){if(d&&d[0])cb(d[0]);else epochSync();})
    .catch(function(){epochSync();});
  }

  function applyRadioState(state){
    if(!state||!widgetReady)return;
    var now=Date.now();
    // Commercial check
    if(state.commercial_url&&state.commercial_ends_at){
      var ends=new Date(state.commercial_ends_at).getTime();
      if(now<ends){startCommercial(state.commercial_url,ends-now);return;}
    }
    if(inCommercial)stopCommercial();
    // Only sync tracks for RECENT DJ overrides (< 2 min) — epoch handles normal looping
    var age=now-new Date(state.track_started_at).getTime();
    if(age>120000)return;
    var position=age;if(position<0)position=0;
    widget.getCurrentSoundIndex(function(i){
      if(i!==state.track_index){
        widget.skip(state.track_index);
        setTimeout(function(){widget.seekTo(position);setTimeout(function(){if(interacted){widget.setVolume(muted?0:getVol());widget.play();}},150);},400);
      } else {
        widget.getPosition(function(pos){
          if(Math.abs(pos-position)>5000){widget.seekTo(position);}
          if(interacted&&!muted){widget.setVolume(getVol());widget.isPaused(function(p){if(p)widget.play();});}
        });
      }
    });
    currentTrackIdx=state.track_index;
  }

  function startCommercial(url,durationMs){
    if(inCommercial&&commercialAudio&&commercialAudio.src===url)return;
    inCommercial=true;
    widget.setVolume(0);
    if(commercialAudio){commercialAudio.pause();commercialAudio=null;}
    commercialAudio=new Audio(url);
    commercialAudio.volume=muted?0:Math.min(1,savedVol/100);
    if(trackEl)trackEl.textContent='🎙️ KEEPITIL RADIO — LIVE BREAK';
    if(led)led.classList.remove('off');
    commercialAudio.play().catch(function(){});
    setTimeout(function(){stopCommercial();fetchRadioState(applyRadioState);},durationMs+500);
  }

  function stopCommercial(){
    inCommercial=false;
    if(commercialAudio){commercialAudio.pause();commercialAudio=null;}
    if(!muted&&widgetReady&&widget)widget.setVolume(getVol());
  }

  function epochSync(){
    widget.getSounds(function(sounds){
      if(!sounds||!sounds.length){widget.play();return;}
      var durations=[],totalMs=0;
      for(var i=0;i<sounds.length;i++){var d=sounds[i].duration||240000;durations.push(d);totalMs+=d;}
      var offset=(Date.now()-SYNC_EPOCH)%totalMs;
      var cumulative=0,trackIndex=0,trackOffset=0;
      for(var j=0;j<durations.length;j++){
        if(offset<cumulative+durations[j]){trackIndex=j;trackOffset=offset-cumulative;break;}
        cumulative+=durations[j];
      }
      widget.skip(trackIndex);widget.setVolume(0);
      setTimeout(function(){widget.seekTo(trackOffset);setTimeout(function(){widget.play();if(interacted)widget.setVolume(getVol());},200);},400);
    });
  }

  function syncAndPlay(){
    // 1. sessionStorage handoff (PJAX fallback for full-reload navigation)
    try{
      var h=JSON.parse(sessionStorage.getItem('kil_hand')||'null');
      if(h&&(Date.now()-h.ts)<8000){
        sessionStorage.removeItem('kil_hand');
        var elapsed=Date.now()-h.ts;
        var resumePos=Math.round(h.pos+elapsed);
        if(h.muted){muted=true;if(muteBtn)muteBtn.textContent='🔇';}
        else{savedVol=h.vol||DEFAULT_VOL;if(volEl)volEl.value=savedVol;}
        interacted=true;
        widget.skip(h.idx);widget.setVolume(0);
        setTimeout(function(){widget.seekTo(resumePos);setTimeout(function(){widget.play();if(!muted)widget.setVolume(getVol());},150);},200);
        return;
      }
    }catch(e){}
    // 2. Check Supabase for active commercial or recent DJ override — else epoch sync
    fetchRadioState(function(state){
      if(!state){epochSync();return;}
      var now=Date.now();
      // Active commercial?
      if(state.commercial_url&&state.commercial_ends_at&&new Date(state.commercial_ends_at).getTime()>now){
        startCommercial(state.commercial_url,new Date(state.commercial_ends_at).getTime()-now);
        return;
      }
      // Recent DJ override (within 2 minutes)? → follow it
      if((now-new Date(state.track_started_at).getTime())<120000){
        applyRadioState(state);
        return;
      }
      // Default: epoch sync keeps everyone on same track position 24/7
      epochSync();
    });
  }

  function initWidget(){
    if(!window.SC)return;
    widget=SC.Widget(frame);
    widget.bind(SC.Widget.Events.READY,function(){widgetReady=true;widget.setVolume(0);syncAndPlay();});
    widget.bind(SC.Widget.Events.PLAY,function(){goLive();reListenGesture();widget.getCurrentSoundIndex(function(i){currentTrackIdx=i;});widget.getCurrentSound(function(s){if(s&&s.title&&trackEl)trackEl.textContent=s.title;});});
    widget.bind(SC.Widget.Events.PLAY_PROGRESS,function(e){if(e&&e.currentPosition)currentPosition=e.currentPosition;if(interacted&&widget)widget.setVolume(getVol());});
    widget.bind(SC.Widget.Events.PAUSE,function(){goOff();});
    widget.bind(SC.Widget.Events.FINISH,function(){widget.getSounds(function(s){if(!s||!s.length)return;widget.getCurrentSoundIndex(function(i){widget.skip((i+1)%s.length);widget.play();});});});
    widget.bind(SC.Widget.Events.ERROR,function(){setTimeout(function(){widget.next();widget.play();},1000);});
  }
  var scApi=document.createElement('script');
  scApi.src='https://w.soundcloud.com/player/api.js';
  scApi.onload=initWidget;
  document.head.appendChild(scApi);

  // ── Mute/vol controls ─────────────────────────────────────────────────────
  if(muteBtn){muteBtn.addEventListener('click',function(e){
    e.stopPropagation();
    if(!widget||!widgetReady){interacted=true;return;}
    interacted=true;
    if(muted){muted=false;muteBtn.textContent='🔊';widget.setVolume(savedVol);if(volEl)volEl.value=savedVol;if(isMobile)widget.play();if(commercialAudio)commercialAudio.volume=Math.min(1,savedVol/100);}
    else{savedVol=Math.max(1,parseInt(volEl?volEl.value:DEFAULT_VOL)||DEFAULT_VOL);muted=true;muteBtn.textContent='🔇';widget.setVolume(0);if(isMobile)widget.pause();if(commercialAudio)commercialAudio.volume=0;}
  });}
  if(volEl){volEl.addEventListener('input',function(){
    if(widget&&widgetReady){interacted=true;savedVol=parseInt(this.value);muted=false;if(muteBtn)muteBtn.textContent='🔊';widget.setVolume(savedVol);if(commercialAudio)commercialAudio.volume=Math.min(1,savedVol/100);}
  });}

  // ── Nav logo swap: transparent extracted X marks, no mix-blend-mode ─────
  function swapNavLogos(){
    document.querySelectorAll('a.nav-logo img,#main-nav img,nav img').forEach(function(img){
      var src=img.getAttribute('src')||'';
      var m=src.match(/logo-(\w+)-nav\.png/i);
      if(!m)return;
      img.src='/keepitil-x-'+m[1]+'.png';
      var st=img.getAttribute('style')||'';
      img.setAttribute('style',st.replace(/mix-blend-mode\s*:\s*\w+\s*;?/gi,''));
      img.style.mixBlendMode='';
    });
  }
  swapNavLogos();

  // ── PJAX: keep radio alive during navigation (no iframe reload = no gap) ──
  (function(){
    var SKIP=/\.(pdf|zip|png|jpg|jpeg|gif|svg|mp3|mp4|webm|wav|ogg)$/i;
    var KEEP=['kil-radio','kil-sc','kilo-btn','kilo-panel'];

    function pjaxNav(url){
      fetch(url,{credentials:'same-origin'})
        .then(function(r){if(!r.ok)throw 0;return r.text();})
        .then(function(html){
          var doc=new DOMParser().parseFromString(html,'text/html');
          document.title=doc.title;

          // Swap inline head styles (keep data-kil + kilo-styles — our injected CSS)
          document.head.querySelectorAll('style:not([data-kil]):not(#kilo-styles)').forEach(function(s){s.remove();});
          doc.head.querySelectorAll('style').forEach(function(s){
            var n=document.createElement('style');n.textContent=s.textContent;document.head.appendChild(n);
          });

          // Remove old body content except radio + echo elements
          Array.from(document.body.children).forEach(function(c){
            if(KEEP.indexOf(c.id)===-1)c.remove();
          });
          document.body.className=doc.body.className||'';

          // Insert new content at the BEGINNING of body (before preserved elements)
          // Using a DocumentFragment keeps DOM order and avoids preserved elements ending up mid-page
          var frag=document.createDocumentFragment();
          Array.from(doc.body.children).forEach(function(c){
            if(KEEP.indexOf(c.id)===-1)frag.appendChild(document.importNode(c,true));
          });
          document.body.insertBefore(frag,document.body.firstChild);

          // Re-run page-specific inline scripts (skip external + radio/sc scripts)
          doc.body.querySelectorAll('script').forEach(function(s){
            if(s.getAttribute('src'))return; // already loaded externals
            var code=s.textContent||'';
            if(!code.trim())return;
            if(code.includes('__kilRadioInit')||code.includes('SC.Widget')||code.includes('keepitil-ai'))return;
            try{(new Function(code))();}catch(ex){console.warn('[kil-pjax]',ex);}
          });

          swapNavLogos();
          history.pushState({pjax:1,url:url},document.title,url);
          window.scrollTo(0,0);
          // Resume playback if PJAX accidentally caused a pause
          if(widget&&widgetReady&&interacted&&!muted){
            setTimeout(function(){widget.isPaused(function(p){if(p){widget.setVolume(getVol());widget.play();}});},400);
          }
        })
        .catch(function(){
          // Full reload fallback — save position so next page can hand off
          try{sessionStorage.setItem('kil_hand',JSON.stringify({idx:currentTrackIdx,pos:currentPosition,ts:Date.now(),vol:muted?0:savedVol,muted:muted}));}catch(e){}
          window.location.href=url;
        });
    }

    // Intercept link clicks
    document.addEventListener('click',function(e){
      var a=e.target.closest('a');
      if(!a||!a.href)return;
      var t=a.target;
      if(t==='_blank'||t==='_parent'||t==='_top')return;
      try{
        var u=new URL(a.href,location.href);
        if(u.origin!==location.origin)return;
        if(SKIP.test(u.pathname))return;
        if(u.pathname===location.pathname&&u.hash)return; // same-page anchor
        e.preventDefault();
        pjaxNav(u.href);
      }catch(ex){}
    },true);

    // Handle browser back/forward
    window.addEventListener('popstate',function(e){
      if(e.state&&e.state.pjax)pjaxNav(e.state.url||location.href);
    });
  })();
})();
