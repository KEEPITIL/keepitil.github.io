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
    '.kil-brand-logo{height:28px;width:auto;mix-blend-mode:screen;filter:drop-shadow(0 0 5px rgba(0,255,136,.6));}'+
    '.kil-brand-radio{font-size:.55rem;font-weight:900;letter-spacing:.18em;color:#00ff88;text-transform:uppercase;}'+
    '#kil-track{font-size:.66rem;color:rgba(255,255,255,.5);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'+
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
    '@media(max-width:600px){#kil-track{display:none;}.kil-submit{display:none;}#kr-vol{width:46px;}}'+
    '@media(max-width:480px){#kilo-btn{bottom:66px!important;right:16px!important;}.radio-mini #kilo-btn{bottom:88px!important;right:16px!important;}.radio-mini #kilo-panel{bottom:156px!important;right:12px!important;}}';
  document.head.appendChild(css);

  // ── Inject HTML (skip if already in DOM — e.g. inline on index.html) ─────
  if(!document.getElementById('kil-radio')){
    var bar=document.createElement('div');
    bar.id='kil-radio';
    bar.innerHTML=
      '<div id="kil-mini-dot">♬</div>'+
      '<div class="kil-live off" id="kil-led"></div>'+
      '<div class="kil-brand">'+
        '<span class="kil-brand-live">LIVE</span>'+
        '<img src="/keepitil-mark.png" class="kil-brand-logo" alt="KEEPITIL"/>'+
        '<span class="kil-brand-radio">RADIO</span>'+
      '</div>'+
      '<span class="kil-divider">·</span>'+
      '<span id="kil-track">Loading...</span>'+
      '<div class="kr-controls">'+
        '<button class="kr-btn" id="kr-mute" title="Mute / Unmute">🔊</button>'+
        '<input type="range" id="kr-vol" min="0" max="100" value="5" title="Volume"/>'+
      '</div>'+
      '<a href="/signup.html" class="kil-submit" target="_blank">🎵 Play your song?</a>'+
      '<button class="kr-btn" id="kr-toggle" title="Minimize radio">—</button>';
    document.body.appendChild(bar);

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
  var DEFAULT_VOL=5;
  var SYNC_EPOCH=1735689600000; // 2026-01-01 00:00 UTC — all visitors hear same position

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

  function unmute(){interacted=true;if(!widget||!widgetReady)return;widget.setVolume(getVol());if(!playing)widget.play();}
  function reListenGesture(){['mousemove','scroll','touchstart','keydown'].forEach(function(ev){document.addEventListener(ev,unmute,{passive:true,once:true});});}
  reListenGesture();

  // ── Wake lock (keeps radio alive on mobile) ───────────────────────────────
  function requestWakeLock(){if(!('wakeLock'in navigator))return;navigator.wakeLock.request('screen').then(function(l){wakeLock=l;l.addEventListener('release',function(){wakeLock=null;});}).catch(function(){});}
  requestWakeLock();

  // ── 24/7 keepalive — resume if browser pauses ────────────────────────────
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible'){
      requestWakeLock();
      if(widget&&widgetReady&&interacted){setTimeout(function(){widget.isPaused(function(p){if(p){widget.setVolume(getVol());widget.play();}});},500);}
    }
  });
  setInterval(function(){if(!widget||!widgetReady||!interacted)return;widget.isPaused(function(p){if(p){widget.setVolume(getVol());widget.play();}});},30000);

  // ── Epoch sync: all visitors hear the same track at the same position ─────
  function syncAndPlay(){
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
      widget.skip(trackIndex);
      widget.setVolume(0);
      setTimeout(function(){
        widget.seekTo(trackOffset);
        setTimeout(function(){widget.play();if(interacted)widget.setVolume(getVol());},300);
      },800);
    });
  }

  function initWidget(){
    if(!window.SC)return;
    widget=SC.Widget(frame);
    widget.bind(SC.Widget.Events.READY,function(){widgetReady=true;widget.setVolume(0);syncAndPlay();});
    widget.bind(SC.Widget.Events.PLAY,function(){goLive();reListenGesture();widget.getCurrentSound(function(s){if(s&&s.title&&trackEl)trackEl.textContent=s.title;});});
    widget.bind(SC.Widget.Events.PLAY_PROGRESS,function(){if(interacted&&widget)widget.setVolume(getVol());});
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
    if(muted){muted=false;muteBtn.textContent='🔊';widget.setVolume(savedVol);if(volEl)volEl.value=savedVol;}
    else{savedVol=Math.max(1,parseInt(volEl?volEl.value:DEFAULT_VOL)||DEFAULT_VOL);muted=true;muteBtn.textContent='🔇';widget.setVolume(0);}
  });}
  if(volEl){volEl.addEventListener('input',function(){
    if(widget&&widgetReady){interacted=true;savedVol=parseInt(this.value);muted=false;if(muteBtn)muteBtn.textContent='🔊';widget.setVolume(savedVol);}
  });}

  // ── PJAX: seamless navigation without reloading radio ────────────────────
  (function(){
    function pjaxNav(url){
      fetch(url).then(function(r){return r.text();}).then(function(html){
        var doc=new DOMParser().parseFromString(html,'text/html');
        document.title=doc.title;
        document.head.querySelectorAll('style').forEach(function(s){s.remove();});
        doc.head.querySelectorAll('style').forEach(function(s){var n=document.createElement('style');n.textContent=s.textContent;document.head.appendChild(n);});
        Array.from(document.body.children).forEach(function(c){if(c.id!=='kil-radio'&&c.id!=='kil-sc')c.parentNode.removeChild(c);});
        Array.from(doc.body.children).forEach(function(c){if(c.id!=='kil-radio'&&c.id!=='kil-sc')document.body.appendChild(document.importNode(c,true));});
        doc.body.querySelectorAll('script').forEach(function(s){
          if(!s.src&&s.textContent&&!s.textContent.includes('SC.Widget')&&!s.textContent.includes('kil-radio')&&!s.textContent.includes('__kilRadioInit')){
            try{(new Function(s.textContent))();}catch(ex){}
          }
        });
        history.pushState({pjax:1,url:url},doc.title,url);
        window.scrollTo(0,0);
      }).catch(function(){window.location.href=url;});
    }
    document.addEventListener('click',function(e){
      var a=e.target.closest('a');
      if(!a||a.target==='_blank'||!a.href)return;
      try{var u=new URL(a.href,location.href);}catch(ex){return;}
      if(u.origin!==location.origin)return;
      if(/\.(pdf|zip|png|jpg|gif|svg|mp3|mp4)$/i.test(u.pathname))return;
      if(u.pathname===location.pathname&&u.hash)return;
      e.preventDefault();
      pjaxNav(u.href);
    },true);
    window.addEventListener('popstate',function(e){if(e.state&&e.state.pjax)pjaxNav(e.state.url||location.href);});
  })();
})();
