/* ==========================================================================
   KEEPITIL — Seasonal Background Rotation (page-agnostic, self-injecting)
   Shows the right holiday/season background per date: desktop 16:9 or mobile 9:16.
   Images live in /v3/seasons/<slug>-desktop.jpg and /v3/seasons/<slug>-mobile.jpg
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
    ['new-years-eve','New Year’s Eve', D(12,30), D(12,31), 7]
  ].map(function(a){return {slug:a[0],name:a[1],start:a[2],end:a[3],pri:a[4]};});

  function pick(t){
    var best=null;
    S.forEach(function(s){ if(t>=s.start && t<=s.end){ if(!best||s.pri>best.pri) best=s; } });
    return best;
  }
  // manual preview override: ?season=<slug> (or 'off' to force none)
  var qs=(new URLSearchParams(location.search)).get('season');
  var active;
  if(qs==='off'){ return; }
  else if(qs){ active=S.filter(function(s){return s.slug===qs;})[0]||{slug:qs,name:qs}; }
  else { active=pick(new Date()); }
  if(!active) return; // no seasonal window today → default page background stays

  var isMobile=Math.min(window.innerWidth,window.innerHeight)<=640 || window.innerHeight>window.innerWidth;
  var url='/v3/seasons/'+active.slug+'-'+(isMobile?'mobile':'desktop')+'.jpg';

  // preload; only paint if the image actually exists
  var img=new Image();
  img.onload=function(){
    var layer=document.createElement('div');
    layer.id='kil-season-bg';
    layer.setAttribute('data-season',active.slug);
    layer.style.cssText='position:fixed;inset:0;z-index:-3;pointer-events:none;background:url("'+url+'") center center / cover no-repeat;opacity:.14';
    document.body.appendChild(layer);
  };
  img.onerror=function(){}; // image not produced yet → nothing shows
  img.src=url;
})();
