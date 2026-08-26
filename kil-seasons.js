/* ==========================================================================
   KEEPITIL — Seasonal Background Rotation (page-agnostic, self-injecting)
   Shows the right holiday/season background per date: desktop 16:9 or mobile 9:16.
   Images live in /assets/images/seasons/<slug>-desktop.jpg and -mobile.jpg
   Invisible until the image exists (404 → hidden). No layout impact.
   Per-page neon accent: set <html data-accent="blue|purple|green"> (home/culture/scene).
   ========================================================================== */
(function(){
  var Y=new Date().getFullYear();
  // helpers for floating US holidays
  function nth(y,m,wd,n){var d=new Date(y,m,1),add=(wd-d.getDay()+7)%7;return new Date(y,m,1+add+(n-1)*7);}
  function last(y,m,wd){var d=new Date(y,m+1,0),sub=(d.getDay()-wd+7)%7;return new Date(y,m+1,0-sub);}
  function easter(y){var a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,mo=Math.floor((a+11*h+22*l)/451),mon=Math.floor((h+l-7*mo+114)/31),day=((h+l-7*mo+114)%31)+1;return new Date(y,mon-1,day);}
  function D(m,d){return new Date(Y,m-1,d);}       // fixed month/day this year
  function win(s,dd){return new Date(s.getFullYear(),s.getMonth(),s.getDate()-dd);} // s minus dd days (window start)

  // slug, display, start, end, priority (higher wins on overlap)
  var ea=easter(Y);
  var S=[
    ['mlk-day','Martin Luther King Jr. Day', win(nth(Y,0,1,3),2), nth(Y,0,1,3), 5],
    ['lunar-new-year','Lunar New Year', D(2,17), D(2,17), 5],           // approx; Founder can pin per year
    ['super-bowl','Super Bowl', nth(Y,1,0,1), nth(Y,1,0,1), 6],
    ['valentines','Valentine’s Day', D(2,10), D(2,15), 6],
    ['presidents-day','Presidents’ Day', nth(Y,1,1,3), nth(Y,1,1,3), 5],
    ['st-patricks','St. Patrick’s Day', D(3,14), D(3,18), 6],
    ['march-madness','March Madness', D(3,17), D(4,8), 3],
    ['easter','Easter', win(ea,6), ea, 6],
    ['four-twenty','420', D(4,18), D(4,21), 6],
    ['cinco-de-mayo','Cinco de Mayo', D(5,3), D(5,6), 6],
    ['may-the-4th','May the 4th', D(5,4), D(5,4), 7],
    ['mothers-day','Mother’s Day', win(nth(Y,4,0,2),2), nth(Y,4,0,2), 6],
    ['memorial-day','Memorial Day', win(last(Y,4,1),3), last(Y,4,1), 6],
    ['fathers-day','Father’s Day', win(nth(Y,5,0,3),2), nth(Y,5,0,3), 6],
    ['independence-day','Independence Day', D(7,1), D(7,5), 6],
    ['summer-finale','Summer Finale', D(8,20), D(9,1), 3],
    ['labor-day','Labor Day', win(nth(Y,8,1,1),3), nth(Y,8,1,1), 6],
    ['patriot-day','Patriot Day', D(9,11), D(9,11), 6],
    ['oktoberfest','Oktoberfest', D(9,19), D(10,4), 4],
    ['halloween','Halloween', D(10,24), D(10,31), 6],
    ['down-syndrome-awareness','Down Syndrome Awareness Month', D(10,1), D(10,31), 2],
    ['cancer-awareness','Cancer Awareness Month', D(10,1), D(10,31), 2],
    ['veterans-day','Veterans Day', D(11,10), D(11,11), 6],
    ['thanksgiving','Thanksgiving', win(nth(Y,10,4,4),2), nth(Y,10,4,4), 6],
    ['black-friday','Black Friday', new Date(nth(Y,10,4,4).getTime()+864e5), new Date(nth(Y,10,4,4).getTime()+864e5), 7],
    ['christmas','Christmas', D(12,18), D(12,26), 6],
    ['new-years-eve','New Year’s Eve', D(12,30), D(12,31), 7],
    // year-round AMBIENT backdrops (priority 1 — every holiday above overrides them) so the site
    // always shows a season-appropriate background and rotates on a fixed schedule all year.
    ['winter-ambient','Winter', D(1,1),  D(3,19),  1],
    ['spring-ambient','Spring', D(3,20), D(6,20),  1],
    ['summer-ambient','Summer', D(6,21), D(9,21),  1],
    ['autumn-ambient','Autumn', D(9,22), D(11,30), 1],
    ['winter-ambient','Winter', D(12,1), D(12,31), 1]
  ].map(function(a){return {slug:a[0],name:a[1],start:a[2],end:a[3],pri:a[4]};});

  function pick(t){
    var best=null;
    S.forEach(function(s){ if(t>=s.start && t<=s.end){ if(!best||s.pri>best.pri) best=s; } });
    return best;
  }
  // manual preview override: ?season=<slug> (or 'off'). Persists across navigation so a preview
  // stays put page-to-page. Real date-based rotation runs on every page load when no override is set.
  var qs=(new URLSearchParams(location.search)).get('season');
  try{
    if(qs==='off'){ sessionStorage.removeItem('kil_season_preview'); }
    else if(qs){ sessionStorage.setItem('kil_season_preview',qs); }
  }catch(e){}
  var ov=qs; if(!ov){ try{ ov=sessionStorage.getItem('kil_season_preview'); }catch(e){} }

  // per-slug accent (light, readable on the dark bg) — drives the hero-text tint. Mirrors gen_seasons.py.
  var ACCENT={
    'winter-ambient':'159,208,255','spring-ambient':'168,230,176','summer-ambient':'255,207,138','autumn-ambient':'240,164,90',
    'mlk-day':'240,194,74','lunar-new-year':'255,207,90','super-bowl':'207,224,255','valentines':'255,158,194',
    'presidents-day':'205,214,255','st-patricks':'111,224,143','march-madness':'255,176,96','easter':'255,179,230',
    'four-twenty':'143,224,143','cinco-de-mayo':'255,210,74','may-the-4th':'159,216,255','mothers-day':'255,158,194',
    'memorial-day':'205,214,255','fathers-day':'159,208,216','independence-day':'207,224,255','summer-finale':'255,176,122',
    'labor-day':'207,224,255','patriot-day':'188,208,255','oktoberfest':'255,207,107','halloween':'255,154,77',
    'down-syndrome-awareness':'255,213,74','cancer-awareness':'255,154,192','veterans-day':'205,214,255',
    'thanksgiving':'240,164,90','black-friday':'208,160,255','christmas':'127,224,160','new-years-eve':'255,217,122',
    'default':'127,208,255'};
  function setTint(slug){ var rgb=ACCENT[slug]||'127,208,255';
    try{ var r=document.documentElement.style; r.setProperty('--kil-season-tint','rgb('+rgb+')'); r.setProperty('--kil-season-tint-rgb',rgb); }catch(e){} }
  function clearTint(){ try{ var r=document.documentElement.style; r.removeProperty('--kil-season-tint'); r.removeProperty('--kil-season-tint-rgb'); }catch(e){} }

  // paint a given season slug (desktop/mobile variant chosen live) — only if the image exists
  function paintSeason(slug){
    var isMobile=Math.min(window.innerWidth,window.innerHeight)<=640 || window.innerHeight>window.innerWidth;
    var url='/assets/images/seasons/'+slug+'-'+(isMobile?'mobile':'desktop')+'.jpg';
    var img=new Image();
    img.onload=function(){
      var layer=document.getElementById('kil-season-bg');
      if(!layer){ layer=document.createElement('div'); layer.id='kil-season-bg';
        layer.style.cssText='position:fixed;inset:0;z-index:-3;pointer-events:none;background-position:center;background-size:cover;background-repeat:no-repeat;opacity:1';
        document.body.appendChild(layer); }
      layer.setAttribute('data-season',slug);
      layer.style.backgroundImage='url("'+url+'")';
      document.documentElement.classList.add('has-season');
      document.body.style.background='transparent';
      setTint(slug);   // recolor hero text to match this background
    };
    img.onerror=function(){};
    img.src=url;
  }
  function clearSeason(){ var l=document.getElementById('kil-season-bg'); if(l)l.remove(); document.documentElement.classList.remove('has-season'); document.body.style.background=''; clearTint(); }

  // ── public API for the home-page background picker (Founder 2026-08-05) ──
  var _seen={}, _list=[];
  S.forEach(function(s){ if(!_seen[s.slug]){ _seen[s.slug]=1; _list.push({slug:s.slug,name:s.name}); } });
  _list.push({slug:'default',name:'KEEPITIL (default)'});
  window.kilSeason={
    seasons:_list,
    accent:function(slug){ var v=ACCENT[slug]; return v?('rgb('+v+')'):''; },
    current:function(){ var l=document.getElementById('kil-season-bg'); return l?l.getAttribute('data-season'):null; },
    apply:function(slug){ try{sessionStorage.setItem('kil_season_preview',slug);}catch(e){} paintSeason(slug); },
    auto:function(){ try{sessionStorage.removeItem('kil_season_preview');}catch(e){} var a=pick(new Date())||{slug:'default'}; paintSeason(a.slug); },
    off:function(){ try{sessionStorage.setItem('kil_season_preview','off');}catch(e){} clearSeason(); }
  };

  /* FOUNDER DIRECTIVE 2026-08-09: DEFAULT BACKGROUND = NONE, desktop AND mobile.
     The date-driven auto-paint is switched off pending better artwork. Nothing is
     removed — the whole seasonal system stays intact and reversible:

       • a background paints ONLY on an explicit override now
           ?season=<slug>            URL override still works
           kilSeason.apply('<slug>') the home-page logo picker still works
           kilSeason.auto()          re-paints today's season on demand
       • sessionStorage preview still persists a pick across pages in a session
       • TO RESTORE the automatic year-round rotation, revert this block to:
             if (ov !== 'off') { ...pick(new Date())... }

     Deliberately NOT deleting the season table, the images, or the picker — the
     Founder is replacing the artwork, not the feature. */
  if(ov && ov!=='off'){
    var active = S.filter(function(s){return s.slug===ov;})[0] || {slug:ov};
    paintSeason(active.slug);
  }
})();
