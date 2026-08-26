/* KEEPITIL shared events store — bridges homepage/events/battles saves to the
   profile Events hub (u.html reads these localStorage buckets).
   Buckets: saved -> kil-saved-events, joined -> kil-joined-events, battles -> kil-battles.
   Each entry is a "flyer" object: {id,month,day,dow,title,venue,tags,tix,cover,kind}. */
(function(){
  var KEYS={saved:'kil-saved-events',joined:'kil-joined-events',battles:'kil-battles'};
  var MON=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  var DOW=['SUN','MON','TUE','WED','THU','FRI','SAT'];
  function read(k){try{var a=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(a)?a:[];}catch(e){return[];}}
  function write(k,a){try{localStorage.setItem(k,JSON.stringify(a));}catch(e){} try{window.dispatchEvent(new Event('kil-events-updated'));}catch(e){}}
  function bkt(name){return KEYS[name]||KEYS.saved;}
  function idOf(o){return String(o.id||((o.title||'')+'|'+(o.month||'')+'|'+(o.day||''))).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90);}
  /* Accept a raw event ({title,date,venue,city,genre,img,ticket,price,...}) or an
     already-shaped flyer object; return the flyer shape the profile renders. */
  function normalize(raw){
    raw=raw||{};
    if(raw.month&&raw.title&&!raw.date){ raw.id=idOf(raw); raw.kind=raw.kind||'ext'; return raw; }
    var d=raw.date?new Date(raw.date):null, mo='', day='', dow='';
    if(d&&!isNaN(d.getTime())){ mo=MON[d.getMonth()]; day=String(d.getDate()); dow=DOW[d.getDay()]; }
    var venue=(raw.venue||'')+(raw.city?(' · '+raw.city):'');
    var o={month:mo,day:day,dow:dow,title:raw.title||'Event',venue:venue,tags:raw.genre||raw.tags||'',
           tix:raw.ticket||raw.tix||'',cover:raw.img||raw.cover||'',kind:raw.kind||'ext'};
    o.id=idOf(o); return o;
  }
  var API={
    normalize:normalize,
    list:function(name){return read(bkt(name));},
    has:function(name,o){var id=idOf(normalize(o));return read(bkt(name)).some(function(x){return idOf(x)===id;});},
    add:function(name,o){var k=bkt(name),f=normalize(o),a=read(k);if(!a.some(function(x){return idOf(x)===f.id;})){a.unshift(f);write(k,a);}return true;},
    remove:function(name,o){var k=bkt(name),id=idOf(normalize(o));write(k,read(k).filter(function(x){return idOf(x)!==id;}));return false;},
    toggle:function(name,o){return this.has(name,o)?this.remove(name,o):this.add(name,o);},
    save:function(o){return this.toggle('saved',o);},
    unsave:function(o){return this.remove('saved',o);},
    join:function(o){return this.add('joined',o);},
    battle:function(o){return this.add('battles',o);}
  };
  window.KILEvents=API;
})();
