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
    '#kil-radio{position:fixed;bottom:0;left:0;right:0;height:40px;z-index:9998;background:rgba(6,6,6,.97);border-top:1px solid rgba(0,255,136,.2);box-shadow:0 -2px 24px rgba(0,0,0,.7);backdrop-filter:blur(18px);font-family:\'Space Grotesk\',\'Inter\',sans-serif;display:flex;align-items:center;padding:0 5px;gap:5px;overflow:hidden;transition:bottom .3s,left .3s,right .3s,width .3s,height .3s,border-radius .3s,border .3s,padding .3s,box-shadow .3s;}'+
    '#kil-radio.kil-mini{bottom:20px!important;left:auto!important;right:24px!important;width:58px!important;height:58px!important;border-radius:50%!important;border:2px solid rgba(0,255,136,.3)!important;border-top:2px solid rgba(0,255,136,.3)!important;box-shadow:0 4px 24px rgba(0,0,0,.7),0 0 20px rgba(0,255,136,.08)!important;cursor:pointer!important;padding:0!important;justify-content:center!important;gap:0!important;}'+
    '#kil-mini-dot{display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:1.5rem;color:#00ff88;animation:kil-blink 2s ease-in-out infinite;}'+
    '#kil-radio.kil-mini #kil-mini-dot{display:flex!important;}'+
    '#kil-radio.kil-mini .krb{display:none!important;}'+
    '.kil-live{width:7px;height:7px;border-radius:50%;background:#00ff88;flex-shrink:0;box-shadow:0 0 6px #00ff88;animation:kil-blink 2s ease-in-out infinite;}'+
    '.kil-live.off{background:#444;box-shadow:none;animation:none;}'+
    '@keyframes kil-blink{0%,100%{opacity:1;}50%{opacity:.35;}}'+
    '.kil-brand-logo{height:28px;width:auto;filter:drop-shadow(0 0 4px rgba(255,80,120,.7));}'+
    '.kil-brand-radio{font-size:.55rem;font-weight:900;letter-spacing:.18em;color:#00ff88;text-transform:uppercase;}'+
    /* ── SHUTTLE (Founder 2026-08-22) ────────────────────────────────────────────────
       << playlist · < song · NOW PLAYING · song > · playlist >>
       The neighbouring titles are a convenience, not the control: they truncate hard and
       disappear below 900px so the arrows and the current track always fit. */
    /* FIXED GEOMETRY (Founder 2026-08-23: "no changing position regardless of song text title
       length"). The centre column was `auto`, so it grew and shrank with the track title and
       dragged both side columns — and therefore every arrow — sideways on each song change.
       A fixed centre width means the three columns never re-measure: the arrows sit at the same
       pixel all night and the title truncates inside its slot instead of pushing the layout. */
    /* ── 7-BUTTON BAR (Founder 2026-08-27) ─────────────────────────────────────────
       The bar is SEVEN buttons on one flex line, each independently weighted:
         1 brand .9 | 2 prev-playlist 1.8 | 3 prev-song 2 | 4 now 4.1 | 5 next-song 2
         | 6 next-playlist 1.8 | 7 mute 1
       Weights, not pixels: the bar always spans the viewport, so the ratio is what holds
       the proportions at every width. Button 4 is the longest by design.
       The old .kr-shuttle grid + .kr-grp wrappers are GONE — they nested the controls two
       levels deep and made per-button width impossible. Every element ID survived the
       move, so every handler below still binds. */
    '.krb{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;'+
      'height:35px;border-radius:5px;padding:0 8px;background:rgba(255,255,255,.05);'+
      'border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.72);'+
      'font-family:inherit;font-size:.7rem;letter-spacing:.05em;white-space:nowrap;'+
      'overflow:hidden;transition:background .18s,border-color .18s;}'+
    'button.krb{cursor:pointer;}'+
    'button.krb:hover{background:rgba(0,255,136,.14);border-color:rgba(0,255,136,.3);}'+
    '.krb-brand{flex:0.9 1 0;}'+
    '#kr-prevpl{flex:1.8 1 0;}'+
    '#kr-prev{flex:2 1 0;}'+
    '.krb-now{flex:4.1 1 0;position:relative;background:rgba(0,255,136,.09);'+
      'border-color:rgba(0,255,136,.28);}'+
    '#kr-next{flex:2 1 0;}'+
    '#kr-nextpl{flex:1.8 1 0;}'+
    '#kr-mute{flex:1 1 0;}'+
    '.krb-g{flex:0 0 auto;color:#00ff88;font-weight:800;font-size:1rem;line-height:1;}'+
    '.kr-side{font-size:.7rem;color:rgba(255,255,255,.55);white-space:nowrap;overflow:hidden;'+
      'text-overflow:ellipsis;min-width:0;}'+
    '.kr-plname{font-weight:800;font-size:.68rem;letter-spacing:.06em;color:rgba(0,255,136,.8);'+
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}'+
    /* Button 4 shows the SONG and the PLAYLIST alternately, 5s each with a half-second
       cross-fade. Both spans are stacked in the same box so neither reflows the bar when
       the other is showing; the whole cycle is CSS, so there is no timer to leak. */
    '.krb-now .kr-now{position:absolute;left:8px;right:8px;text-align:center;'+
      'font-size:.72rem;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;'+
      'text-overflow:ellipsis;animation:kil-swap 10s ease-in-out infinite;}'+
    '.krb-now #kr-nowpl{color:rgba(0,255,136,.9);letter-spacing:.06em;animation-delay:5s;}'+
    '@keyframes kil-swap{0%,45%{opacity:1;}50%,95%{opacity:0;}100%{opacity:1;}}'+
    '@media(prefers-reduced-motion:reduce){.krb-now .kr-now{animation-duration:20s;}}'+
    '@media(max-width:1100px){.kr-plname{display:none;}}'+
    '@media(max-width:900px){.kr-side{display:none;}}'+
    '.kr-btn{background:none;border:none;cursor:pointer;color:#00ff88;font-size:.85rem;line-height:1;padding:2px 4px;transition:opacity .2s;flex-shrink:0;}'+
    '.kr-btn:hover{opacity:.6;}'+
    '#kr-vol{width:60px;accent-color:#00ff88;cursor:pointer;opacity:.75;vertical-align:middle;}'+
    '#kil-sc{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;}'+
    /* The #kilo-btn overrides that lived here are GONE — the shell owns the chat
       button's position now. The PANEL still needs to clear the radio bar. */
    '#kilo-panel{bottom:118px!important;}'+
    '.radio-mini #kilo-panel{bottom:156px!important;right:24px!important;}'+
    // Body padding so content clears the fixed bar
    'body{padding-bottom:40px;}'+
    // Scroll-to-top button: lift above radio bar, move to left to avoid Echo on right
    '#scroll-top{bottom:54px!important;left:24px!important;right:auto!important;}'+
    '.radio-mini #scroll-top{bottom:92px!important;}'+
    // Nav logo: bigger across all pages (overrides inline height:30px)
    'a.nav-logo img,#main-nav img,nav img[src*="keepitil-x-"]{height:44px!important;width:auto!important;}'+
    '@media(max-width:600px){'+
      /* ⚠ MOBILE IS UNCHANGED BY THE 7-BUTTON REBUILD (Founder 2026-08-27: "do not change
         the mobile bar"). The desktop layout stacks the song and playlist absolutely inside
         button 4 and gives every button a flex weight; both are undone here so the small bar
         keeps the shape it already had — logo + RADIO, one centred track line, controls. */
      '.kil-live,.kil-divider{display:none!important;}'+
      '.krb{flex:0 0 auto!important;height:28px;padding:0 6px;gap:4px;}'+
      '.krb-now{flex:1 1 auto!important;position:static;background:none;border-color:transparent;}'+
      '.krb-now .kr-now{position:static;left:auto;right:auto;animation:none;'+
        'font-size:.62rem;font-weight:400;color:rgba(255,255,255,.7);}'+
      '#kr-nowpl{display:none!important;}'+
      '.kr-side,.kr-plname{display:none!important;}'+
      '.kil-brand-logo{height:22px;}'+
      '#kr-mute{margin-left:auto;}'+
      '#kr-vol{width:74px;height:20px;}'+
      '#kil-radio{gap:6px;padding:0 8px;}'+
    '}'+
    '@media(max-width:480px){.radio-mini #kilo-panel{bottom:156px!important;right:12px!important;}}';
  document.head.appendChild(css);

  // ── Inject HTML (skip if already in DOM — e.g. inline on index.html) ─────
  if(!document.getElementById('kil-radio')){
    var bar=document.createElement('div');
    bar.id='kil-radio';
    /* ── BAR LAYOUT (Founder 2026-08-22) ────────────────────────────────────────────────
       << Prev Playlist · < Prev song · CURRENT · Next song > · Next Playlist >> · (mute)
       Every referral and affiliate link is gone: the rotating DistroKid / Posh / FreeCash /
       Illestrated ad that used to sit in the middle of the bar, and the "Play your song?"
       link beside it. The bar is now controls only. */
    bar.innerHTML=
      '<div id="kil-mini-dot">\u266c</div>'+
      /* SEVEN buttons, one flex line. IDs are unchanged from the shuttle layout so every
         handler below still binds; only the nesting and the widths changed. */
      '<div class="krb krb-brand">'+
        '<div class="kil-live off" id="kil-led"></div>'+
        '<img src="/keepitil-x-logo.png" class="kil-brand-logo" alt="KEEPITIL"/>'+
        '<span class="kil-brand-radio">RADIO</span>'+
      '</div>'+
      '<button class="krb" id="kr-prevpl" title="Previous playlist" aria-label="Previous playlist">'+
        '<span class="kr-plname" id="kr-prevpl-t"></span><span class="krb-g">\u00ab</span>'+
      '</button>'+
      '<button class="krb" id="kr-prev" title="Previous song" aria-label="Previous song">'+
        '<span class="kr-side" id="kr-prevt"></span><span class="krb-g">\u2039</span>'+
      '</button>'+
      '<div class="krb krb-now">'+
        '<span class="kr-now" id="kil-track">Loading\u2026</span>'+
        '<span class="kr-now" id="kr-nowpl"></span>'+
      '</div>'+
      '<button class="krb" id="kr-next" title="Next song" aria-label="Next song">'+
        '<span class="krb-g">\u203a</span><span class="kr-side" id="kr-nextt"></span>'+
      '</button>'+
      '<button class="krb" id="kr-nextpl" title="Next playlist" aria-label="Next playlist">'+
        '<span class="krb-g">\u00bb</span><span class="kr-plname" id="kr-nextpl-t"></span>'+
      '</button>'+
      '<button class="krb" id="kr-mute" title="Mute / Unmute" aria-label="Mute">\ud83d\udd0a</button>'+
      '';   /* the minimise button is gone — see setMini() */
    document.body.appendChild(bar);
    /* The rotating referral ad that lived here was removed 2026-08-22 (Founder).
       No affiliate or referral link ships in the radio bar. */

    /* ── IFRAME DEFERRED TO FIRST GESTURE (Founder 2026-08-19) ──────────────────────────────
       This used to be appended on every page load. A SoundCloud player with auto_play=true
       and continuous_play=true is a permanently streaming third-party frame: the document
       never reaches idle, and the tab holds an open connection plus an audio decode for as
       long as it is open. Measured symptom — every /create page failed to finish loading,
       and on a device with less headroom it presented as the page hanging or crashing.
       Nothing about the radio's behaviour changes; it is created the moment the visitor
       makes any gesture, which is also the earliest point a browser would allow it to make
       sound. Before that, a page that nobody has touched costs nothing. */
    window.__kilMountRadio = function(){
      if(document.getElementById('kil-sc')) return;
      var sc=document.createElement('iframe');
      sc.id='kil-sc';
      sc.setAttribute('allow','autoplay');
      sc.setAttribute('scrolling','no');
      sc.setAttribute('frameborder','no');
      sc.src=window.__kilPlayerSrc();
      document.body.appendChild(sc);
      if(window.__kilRadioAttach) window.__kilRadioAttach(sc);
    };
  }

  /* ── PLAYLISTS (Founder 2026-08-22: "all feeds from soundcloud only. keepitil soundcloud
     account music playlist") ───────────────────────────────────────────────────────────────
     Read from platform_config.radio_playlists so adding or reordering a station is a row edit,
     not a code push. The seed below is only a fallback for the first paint and for the case
     where config cannot be reached — the bar must never come up silent. */
  var KIL_PL = [{name:'KEEPITIL', url:'https://soundcloud.com/illestrated-lifestyle'}];
  var KIL_PL_I = 0;
  try{ var _sv=sessionStorage.getItem('kil_pl_i'); if(_sv!=null) KIL_PL_I=Math.max(0,parseInt(_sv,10)||0); }catch(e){}

  window.__kilPlayerSrc = function(){
    var p = KIL_PL[KIL_PL_I] || KIL_PL[0];
    /* Prefer the api.soundcloud.com playlist-id form — it is what SoundCloud's own embed emits
       (see twitter:player on any set page) and it always resolves. A /sets/ permalink is only
       sometimes accepted by the widget, and when it is not the frame loads and simply never
       plays: no error, no sound. That was the silent radio. */
    return 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(p.api || p.url)
      + '&color=%2300ff88&auto_play=true&buying=false&liking=false&download=false&sharing=false'
      + '&show_artwork=false&show_comments=false&show_playcount=false&show_user=false'
      + '&hide_related=true&continuous_play=true&single_active=false';
  };

  // ── Radio init ────────────────────────────────────────────────────────────
  var radio=document.getElementById('kil-radio');
  var frame=document.getElementById('kil-sc');
  var led=document.getElementById('kil-led');
  var trackEl=document.getElementById('kil-track');
  var muteBtn=document.getElementById('kr-mute');
  var volEl=document.getElementById('kr-vol');
  /* toggleBtn removed with the collapse feature 2026-08-22. */
  var widget=null,playing=false,muted=false,savedVol=5,interacted=false,widgetReady=false,miniState=false,wakeLock=null;
  var isMobile=('ontouchstart'in window)||(navigator.maxTouchPoints>0);
  var DEFAULT_VOL=3;
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
  /* COLLAPSE REMOVED (Founder 2026-08-22: "do not allow the radio bar to collapse. remove that
     feature button"). setMini is kept as a no-op because other code — the pager, the shell, the
     mini dot — still calls it; deleting the function would throw instead of doing nothing.
     The stored preference is actively cleared, or anyone who collapsed the bar before today
     would load into a collapsed bar forever with no control left to expand it. */
  function setMini(){
    miniState=false;
    if(radio) radio.classList.remove('kil-mini');
    document.body.classList.remove('radio-mini');
  }
  try{ localStorage.removeItem('kil_radio_mini'); }catch(e){}
  setMini();
  if(radio){
    radio.style.cursor='pointer';
    radio.addEventListener('click',function(e){
      /* clicking the bar opens the Radio page — except the mute button, volume, minimize, or the advertisement */
      if(e.target&&e.target.closest&&e.target.closest('.krb')){return;}
      if(location.pathname.indexOf('/earn')===0)return; /* already on the radio surface */
      location.href='/earn';
    });
  }

  /* ── SHUTTLE CONTROLS ──────────────────────────────────────────────────────────────────
     Song arrows drive the SoundCloud widget. Playlist arrows swap the iframe src, because a
     widget is bound to one playlist for its lifetime — there is no API to repoint it. */
  function kilPlName(offset){
    if(!KIL_PL.length) return '';
    var p = KIL_PL[(KIL_PL_I + offset + KIL_PL.length) % KIL_PL.length];
    return (p && p.name) ? p.name : '';
  }
  /* The two outer labels name the playlists the << and >> arrows lead to. They do not depend on
     the player, so they are painted as soon as config lands — not only once audio starts. */
  function kilPaintPlaylistNames(){
    var solo = KIL_PL.length < 2;   /* one station: nothing to move between, so no labels */
    var a=document.getElementById('kr-prevpl-t'), b=document.getElementById('kr-nextpl-t');
    if(a) a.textContent = solo ? '' : kilPlName(-1);
    if(b) b.textContent = solo ? '' : kilPlName(1);
  }
  window.__kilPaintPlaylistNames = kilPaintPlaylistNames;

  /* ── STATE BROADCAST (EARN radio row + playlist carousel, Founder 2026-08-25) ───────────
     The EARN page needs the SAME state this bar already computes — playlist name, current
     song, next song — and must not start a second player to get it. A widget is bound to one
     playlist for its lifetime and there is only ever one #kil-sc frame, so anything that wants
     to display radio state listens instead of polling or re-fetching.
     Fired on every title repaint and on every playlist change, so a listener that mounts late
     can also just ask for a repaint. */
  function kilBroadcast(cur, nxt){
    try{
      document.dispatchEvent(new CustomEvent('kil-radio-state', {detail:{
        index: KIL_PL_I,
        count: KIL_PL.length,
        playlist: kilPlName(0),
        current: cur || '',
        next: nxt || ''
      }}));
    }catch(e){}
  }
  window.__kilRadioState = kilBroadcast;

  /* Absolute playlist selection. The arrows are relative (dir -1/+1) because that is all a
     two-arrow bar needs; tapping a specific tile in the EARN carousel is not expressible that
     way without the caller doing modulo arithmetic against internal state it cannot see. */
  window.__kilRadioSelect = function(i){
    if(!KIL_PL.length) return;
    i = (((i|0) % KIL_PL.length) + KIL_PL.length) % KIL_PL.length;
    if(i === KIL_PL_I){
      /* Already on this station: restart it at track 1 rather than doing nothing, which is
         what a tap on the artwork means. */
      if(widget && widgetReady){ widget.skip(0); widget.play(); }
      kilBroadcast();
      return;
    }
    kilLoadPlaylist(i - KIL_PL_I);
  };
  window.__kilRadioPlaylists = function(){
    return { list: KIL_PL.slice(), index: KIL_PL_I };
  };

  /* Song transport, exposed for surfaces that draw their own controls (the EARN radio row).
     Those pages hide the shell bar, so proxying a .click() at its buttons would depend on a
     hidden element still existing — this is the same two lines the bar's own arrows run. */
  window.__kilRadioSong = function(dir){
    if(!widget || !widgetReady) return false;
    try{
      if(dir < 0) widget.prev(); else widget.next();
      widget.play();
      /* The widget reports the new track asynchronously; repaint once it has. */
      setTimeout(function(){ try{ kilPaintTitles(); }catch(e){} }, 400);
      return true;
    }catch(e){ return false; }
  };

  function kilPaintTitles(){
    if(!widget || !widgetReady) return;
    widget.getSounds(function(list){
      if(!list || !list.length) return;
      widget.getCurrentSoundIndex(function(i){
        var prevEl=document.getElementById('kr-prevt'),
            nextEl=document.getElementById('kr-nextt'),
            nowEl =document.getElementById('kil-track');
        var here = kilPlName(0);
        /* First or last track has no neighbour inside this playlist. Rather than leave a blank
           slot, name the playlist — the Founder's rule: "if non than use the playlist title". */
        var p = (i > 0) ? list[i-1] : null;
        var n = (i < list.length-1) ? list[i+1] : null;
        if(prevEl) prevEl.textContent = (p && p.title) ? p.title : here;
        if(nextEl) nextEl.textContent = (n && n.title) ? n.title : here;
        /* Current reads "PLAYLIST: SONG" — e.g. "EDM: VHS TAPES". */
        var cur = list[i];
        var t = (cur && cur.title) ? cur.title : '';
        /* Button 4 alternates, so the two values must stay apart — a combined
           "PLAYLIST: SONG" string would show the playlist in both halves of the cycle. */
        var plEl = document.getElementById('kr-nowpl');
        if(nowEl) nowEl.textContent = t || here;
        if(plEl)  plEl.textContent  = here || t;
        /* Same values the bar just painted — no second source of truth. */
        kilBroadcast(t, (n && n.title) ? n.title : '');
      });
    });
    kilPaintPlaylistNames();
  }
  window.__kilPaintTitles = kilPaintTitles;

  function kilLoadPlaylist(dir){
    /* dir 0 = reload the CURRENT entry in place (used when a default playlist is applied). */
    if(dir === 0){ KIL_PL_I = KIL_PL_I; }
    else if(KIL_PL.length < 2){
      if(widget && widgetReady){ widget.skip(0); widget.play(); }
      return;
    }
    KIL_PL_I = (KIL_PL_I + dir + KIL_PL.length) % KIL_PL.length;
    try{ sessionStorage.setItem('kil_pl_i', String(KIL_PL_I)); }catch(e){}
    var old = document.getElementById('kil-sc');
    if(old) old.remove();
    widget=null; widgetReady=false;
    var sc=document.createElement('iframe');
    sc.id='kil-sc'; sc.setAttribute('allow','autoplay');
    sc.setAttribute('scrolling','no'); sc.setAttribute('frameborder','no');
    sc.src=window.__kilPlayerSrc();
    document.body.appendChild(sc);
    if(trackEl) trackEl.textContent = (KIL_PL[KIL_PL_I].name || 'Loading') + '\u2026';
    kilPaintPlaylistNames();
    kilBroadcast();
    if(window.__kilRadioAttach) window.__kilRadioAttach(sc);
  }

  (function(){
    function on(id, fn){ var b=document.getElementById(id); if(b) b.addEventListener('click',function(e){ e.stopPropagation(); fn(); }); }
    on('kr-prev',  function(){ if(widget&&widgetReady){ widget.prev(); widget.play(); } });
    on('kr-next',  function(){ if(widget&&widgetReady){ widget.next(); widget.play(); } });
    on('kr-prevpl',function(){ kilLoadPlaylist(-1); });
    on('kr-nextpl',function(){ kilLoadPlaylist(1); });
  })();

  /* Config load. Failure is silent by design — the seed playlist keeps playing. */
  fetch(SUPA_URL+'/rest/v1/platform_config?select=value&key=eq.radio_playlists',
        {headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY}})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(rows){
      var v = rows && rows[0] && rows[0].value;
      /* platform_config.value is a TEXT column holding JSON, so it arrives as a string, not an
         object. Parsing only when it is a string keeps this working if the column is ever
         migrated to jsonb. */
      if(typeof v === 'string'){ try{ v = JSON.parse(v); }catch(e){ v = null; } }
      var list = v && v.playlists;
      if(list && list.length){
        KIL_PL = list.filter(function(p){ return p && p.url; });
        if(KIL_PL_I >= KIL_PL.length) KIL_PL_I = 0;
      }
      /* More than one station? Show the playlist arrows. One station and they are dead weight. */
      if(KIL_PL.length < 2){
        ['kr-prevpl','kr-nextpl'].forEach(function(id){ var b=document.getElementById(id); if(b) b.style.display='none'; });
      }
      kilPaintPlaylistNames();
      /* Config lands AFTER first paint, so anything listening for radio state (the EARN rows
         and carousel) has until now been looking at the one-entry seed playlist and showing
         its placeholder name. Re-broadcast so those surfaces correct themselves the moment the
         real station list exists, instead of waiting for the SoundCloud widget to report a
         track — which never happens at all if the visitor has not yet interacted. */
      kilBroadcast();
      kilLoadMine();
    })
    .catch(function(){});

  /* ── A SIGNED-IN LISTENER'S OWN PLAYLISTS (Founder 2026-08-22) ──────────────────────────
     Appended AFTER the station playlists, never mixed into them: the KEEPITIL rotation is the
     same for everyone, and these are audible only to the person who saved them. RLS does the
     enforcing — the request carries the user's own token, so it can only ever return their rows.
     Signed out, this is a no-op and the bar behaves exactly as before. */
  function kilLoadMine(){
    var tok = null;
    try{
      /* supabase-js stores its session under a project-scoped key. Reading it here avoids
         pulling the whole SDK into the radio bar for one authenticated GET. */
      for(var i=0;i<localStorage.length;i++){
        var k = localStorage.key(i);
        if(k && k.indexOf('-auth-token') > -1){
          var j = JSON.parse(localStorage.getItem(k) || 'null');
          if(j && j.access_token){ tok = j.access_token; break; }
        }
      }
    }catch(e){}
    if(!tok) return;                       /* signed out — stations only */

    fetch(SUPA_URL + '/rest/v1/user_playlists?select=name,url,api_url,art,is_default&order=created_at.asc',
          { headers:{ apikey:SUPA_KEY, Authorization:'Bearer ' + tok } })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(rows){
        if(!rows || !rows.length) return;
        var mine = rows.map(function(p){
          return { name:p.name, url:p.url, api:p.api_url, art:p.art, mine:true, def:p.is_default };
        });
        KIL_PL = KIL_PL.concat(mine);
        /* A playlist marked default starts the session on it. */
        var d = KIL_PL.findIndex ? KIL_PL.findIndex(function(p){ return p.def; }) : -1;
        if(d > -1 && d !== KIL_PL_I){
          KIL_PL_I = d;
          try{ sessionStorage.setItem('kil_pl_i', String(d)); }catch(e){}
          if(document.getElementById('kil-sc')) kilLoadPlaylist(0);
        }
        ['kr-prevpl','kr-nextpl'].forEach(function(id){ var b=document.getElementById(id); if(b) b.style.display=''; });
        kilPaintPlaylistNames();
      })
      .catch(function(){});
  }

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
    widget.bind(SC.Widget.Events.PLAY,function(){goLive();reListenGesture();widget.getCurrentSoundIndex(function(i){currentTrackIdx=i;});kilPaintTitles();});
    widget.bind(SC.Widget.Events.PLAY_PROGRESS,function(e){if(e&&e.currentPosition)currentPosition=e.currentPosition;if(interacted&&widget)widget.setVolume(getVol());});
    widget.bind(SC.Widget.Events.PAUSE,function(){goOff();});
    /* ── PLAY A PLAYLIST THROUGH, THEN ROLL TO THE NEXT ONE (Founder 2026-08-22) ──────────
       Was `skip((i+1) % length)` — the modulo wrapped back to track 0 of the SAME playlist and
       looped it forever, so the other stations never got reached. On the LAST track it now
       advances to the next playlist instead of wrapping, and after the last playlist it comes
       back round to the first. One continuous programme across every station. */
    widget.bind(SC.Widget.Events.FINISH,function(){
      widget.getSounds(function(s){
        if(!s||!s.length) return;
        widget.getCurrentSoundIndex(function(i){
          if(i >= s.length-1){ kilLoadPlaylist(1); }   /* end of this playlist -> next station */
          else { widget.skip(i+1); widget.play(); }
        });
      });
    });
    widget.bind(SC.Widget.Events.ERROR,function(){setTimeout(function(){widget.next();widget.play();},1000);});
  }
  /* The SoundCloud API script is deferred alongside the iframe — loading it eagerly would
     re-introduce a third-party request on every page load for a player that may never exist.
     __kilRadioAttach is called by __kilMountRadio once the iframe is in the DOM; it rebinds
     `frame` (captured as null at init, because the iframe no longer exists at that point)
     and only then fetches the API. */
  window.__kilRadioAttach = function(el){
    frame = el || document.getElementById('kil-sc');
    if(!frame) return;
    if(window.SC){ initWidget(); return; }
    if(document.getElementById('kil-sc-api')) return;
    var scApi=document.createElement('script');
    scApi.id='kil-sc-api';
    scApi.src='https://w.soundcloud.com/player/api.js';
    scApi.onload=initWidget;
    document.head.appendChild(scApi);
  };
  /* Any gesture mounts it. `once` so the listeners remove themselves; capture+passive so a
     stopPropagation() anywhere in the page cannot swallow the trigger. */
  (function(){
    /* Two shapes to cover: pages where this script injects the bar (__kilMountRadio exists),
       and the handful that inline the bar AND the iframe in their own HTML — there the
       injection block is skipped, so __kilMountRadio is undefined and we attach directly to
       the iframe that is already sitting in the DOM. Without this branch the API script would
       never load on those pages and the radio would be silent. */
    function boot(){
      if(window.__kilMountRadio) window.__kilMountRadio();
      else if(window.__kilRadioAttach) window.__kilRadioAttach(null);
    }
    ['pointerdown','touchstart','keydown'].forEach(function(ev){
      document.addEventListener(ev, boot, { once:true, capture:true, passive:true });
    });
  })();

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
    // Elements preserved across a swap (never removed) → radio never stops, shell never drops.
    var KEEP=['kil-radio','kil-sc','kilo-btn','kilo-panel','kil-cfab','v3shell-nav','v3-footer'];
    // Only these community content pages use pjax; every other link does a normal full load.
    var ALLOW=/^\/v3\/(culture(\.html)?|create-comp\.html|compete\.html|earn\.html|giveback\.html)$/;
    function pjOK(u){try{return ALLOW.test(new URL(u,location.href).pathname);}catch(e){return false;}}

    function pjaxNav(url){
      fetch(url,{credentials:'same-origin'})
        .then(function(r){if(!r.ok)throw 0;return r.text();})
        .then(function(html){
          var doc=new DOMParser().parseFromString(html,'text/html');
          document.title=doc.title;

          // Swap page inline styles only — PRESERVE all widget styles (kil*, kilo-*, shell, data-kil)
          // so the radio/chat/notify/social/feedback widgets keep their CSS across the swap.
          document.head.querySelectorAll('style:not([data-kil]):not([id^="kil"]):not(#v3shell-style)').forEach(function(s){s.remove();});
          doc.head.querySelectorAll('style').forEach(function(s){
            if(s.id&&document.getElementById(s.id))return;  // don't duplicate an already-present (widget) style
            var n=document.createElement('style');if(s.id)n.id=s.id;n.textContent=s.textContent;document.head.appendChild(n);
          });
          // Pull in any stylesheet <link> the new page needs that we don't already have (e.g. fonts)
          doc.head.querySelectorAll('link[rel="stylesheet"]').forEach(function(l){
            var h=l.getAttribute('href');
            if(h&&!document.head.querySelector('link[href="'+h+'"]')){var nl=document.createElement('link');nl.rel='stylesheet';nl.href=h;document.head.appendChild(nl);}
          });

          // Remove old body content except radio + echo elements
          Array.from(document.body.children).forEach(function(c){
            if(KEEP.indexOf(c.id)===-1)c.remove();
          });
          document.body.className=doc.body.className||'';

          // Insert new content right AFTER the universal shell nav (kept alive), before the footer.
          var frag=document.createDocumentFragment();
          Array.from(doc.body.children).forEach(function(c){
            if(KEEP.indexOf(c.id)===-1)frag.appendChild(document.importNode(c,true));
          });
          var _shell=document.getElementById('v3shell-nav');
          if(_shell&&_shell.nextSibling){document.body.insertBefore(frag,_shell.nextSibling);}
          else{document.body.insertBefore(frag,document.body.firstChild);}
          try{document.body.style.paddingTop='66px';}catch(e){}  // keep offset for the fixed shell nav

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

    // Shell-aware PJAX (revived 2026-07-12): intercept clicks ONLY between allow-listed community
    // content pages (culture + 4 pillars). The universal shell nav/footer + radio + FABs are
    // preserved across the swap (see KEEP), so the radio never stops and the nav never drops.
    // Script-heavy pages (agent/crew/event/ticketing/checkout/etc.) are NOT allow-listed — links to
    // them do normal full navigations (radio hands off via sessionStorage), so the old agent.html
    // P0 cannot recur.
    document.addEventListener('click',function(e){
      if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
      var a=e.target.closest&&e.target.closest('a[href]'); if(!a)return;
      if(a.target==='_blank'||a.hasAttribute('download'))return;
      var href=a.getAttribute('href')||'';
      if(!href||href.charAt(0)==='#'||/^(mailto:|tel:|javascript:)/i.test(href))return;
      var u; try{u=new URL(href,location.href);}catch(_){return;}
      if(u.origin!==location.origin||SKIP.test(u.pathname))return;
      if(u.pathname===location.pathname)return;       // same page — let hash/anchor behave
      if(!pjOK(u.href)||!pjOK(location.href))return;   // only pjax between allow-listed content pages
      e.preventDefault(); pjaxNav(u.href);
    },true);

    // Handle browser back/forward
    window.addEventListener('popstate',function(e){
      if(e.state&&e.state.pjax)pjaxNav(e.state.url||location.href);
    });
  })();
})();
