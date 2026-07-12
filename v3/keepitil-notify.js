/* KEEPITIL — in-app notification center. Adds a bell + panel + "turn on notifications"
   opt-in into the V3 shell nav, but ONLY when a member is logged in. Reads the
   `notifications` table + app_users.notifications_enabled. Graceful if not signed in. */
(function(){
  if(window.__kilNotifyInit) return; window.__kilNotifyInit=1;
  var SB_URL="https://ovmqtzjfpzrbzrlkxwgw.supabase.co";
  var SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ";
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function ago(iso){ try{ var s=Math.max(0,(Date.now()-new Date(iso).getTime())/1000);
    if(s<60)return 'just now'; if(s<3600)return Math.floor(s/60)+'m ago'; if(s<86400)return Math.floor(s/3600)+'h ago';
    if(s<604800)return Math.floor(s/86400)+'d ago'; return new Date(iso).toLocaleDateString(); }catch(e){return '';} }
  function ensureSupa(cb){ if(window.supabase){cb();return;} var s=document.createElement('script'); s.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"; s.onload=cb; s.onerror=cb; document.head.appendChild(s); }
  function client(){ try{ if(!window.__kilNSB && window.supabase) window.__kilNSB=window.supabase.createClient(SB_URL,SB_KEY);}catch(e){} return window.__kilNSB||null; }

  function css(){
    if(document.getElementById('kiln-css'))return;
    var s=document.createElement('style'); s.id='kiln-css';
    s.textContent=
     '.kiln-wrap{position:relative;margin-right:14px;display:flex;align-items:center}'
    +'.kiln-bell{position:relative;background:none;border:0;color:rgba(255,255,255,.8);font-size:1.15rem;cursor:pointer;line-height:1;padding:6px}'
    +'.kiln-bell:hover{color:#fff}'
    +'.kiln-badge{position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;padding:0 4px;border-radius:9px;background:#ff3b6b;color:#fff;font:800 10px/16px Inter,sans-serif;text-align:center}'
    +'.kiln-panel{display:none;position:absolute;top:40px;right:0;width:320px;max-height:70vh;overflow:auto;background:#12121c;border:1px solid rgba(255,255,255,.14);border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,.55);z-index:1002;font-family:Inter,system-ui,sans-serif}'
    +'.kiln-panel.open{display:block}'
    +'.kiln-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)}'
    +'.kiln-head b{color:#fff;font-size:.95rem;font-weight:800}'
    +'.kiln-toggle{display:flex;align-items:center;gap:6px;font-size:.72rem;color:#b6b2c8;cursor:pointer}'
    +'.kiln-toggle input{accent-color:#00b4ff;width:15px;height:15px}'
    +'.kiln-quick{display:block;padding:11px 16px;color:#5cc8ff;text-decoration:none;font-weight:700;font-size:.85rem;border-bottom:1px solid rgba(255,255,255,.06)}'
    +'.kiln-quick:hover{background:rgba(0,180,255,.08)}'
    +'.kiln-item{display:block;padding:12px 16px;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.05)}'
    +'.kiln-item:hover{background:rgba(255,255,255,.04)}'
    +'.kiln-item.unread{background:rgba(0,180,255,.07)}'
    +'.kiln-t{color:#f4f2fb;font-size:.86rem;font-weight:700}'
    +'.kiln-b{color:#a9a4be;font-size:.8rem;margin-top:2px;line-height:1.45}'
    +'.kiln-ago{color:#6a6678;font-size:.7rem;margin-top:4px}'
    +'.kiln-empty{padding:22px 16px;color:#8a8698;font-size:.83rem;text-align:center}';
    document.head.appendChild(s);
  }

  function waitForNav(cb){
    var n=document.getElementById('v3shell-nav'); if(n&&n.querySelector('.v3s-inner')) return cb(n);
    var tries=0, t=setInterval(function(){ var x=document.getElementById('v3shell-nav'); tries++;
      if(x&&x.querySelector('.v3s-inner')){ clearInterval(t); cb(x); } else if(tries>50){ clearInterval(t); } },120);
  }

  function mount(nav, c, session){
    css();
    var inner=nav.querySelector('.v3s-inner'); if(!inner || inner.querySelector('.kiln-wrap')) return;
    var cta=inner.querySelector('.v3s-cta'), burger=inner.querySelector('.v3s-burger');
    var wrap=document.createElement('div'); wrap.className='kiln-wrap';
    wrap.innerHTML='<button class="kiln-bell" aria-label="Notifications">&#128276;<span class="kiln-badge" style="display:none">0</span></button>'+
      '<div class="kiln-panel">'+
        '<div class="kiln-head"><b>Notifications</b><label class="kiln-toggle"><input type="checkbox" id="kiln-opt"/> <span>Notify me</span></label></div>'+
        '<a class="kiln-quick" href="/v3/tickets.html">&#127903; My Tickets</a>'+
        '<div class="kiln-list" id="kiln-list"><div class="kiln-empty">Loading…</div></div>'+
      '</div>';
    if(cta) inner.insertBefore(wrap, cta); else if(burger) inner.insertBefore(wrap, burger); else inner.appendChild(wrap);
    var bell=wrap.querySelector('.kiln-bell'), panel=wrap.querySelector('.kiln-panel'),
        badge=wrap.querySelector('.kiln-badge'), list=wrap.querySelector('#kiln-list'), opt=wrap.querySelector('#kiln-opt');

    try{ c.from('app_users').select('notifications_enabled').eq('id',session.user.id).maybeSingle().then(function(q){ if(q&&q.data&&q.data.notifications_enabled===false) opt.checked=false; else opt.checked=true; },function(){opt.checked=true;}); }catch(e){opt.checked=true;}
    opt.addEventListener('change',function(){ try{ c.from('app_users').update({notifications_enabled:opt.checked}).eq('id',session.user.id).then(function(){},function(){}); }catch(e){} });

    function load(){
      try{ c.from('notifications').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false}).limit(30).then(function(r){
        var d=(r&&r.data)||[]; var unread=d.filter(function(x){return !x.read;}).length;
        if(unread>0){ badge.textContent=unread>9?'9+':String(unread); badge.style.display='inline-block'; } else badge.style.display='none';
        list.innerHTML = d.length ? d.map(function(x){
          return '<a class="kiln-item'+(x.read?'':' unread')+'" href="'+esc(x.link||'#')+'">'+
            '<div class="kiln-t">'+esc(x.title)+'</div>'+(x.body?('<div class="kiln-b">'+esc(x.body)+'</div>'):'')+
            '<div class="kiln-ago">'+ago(x.created_at)+'</div></a>'; }).join('')
          : '<div class="kiln-empty">No notifications yet.</div>';
      },function(){ list.innerHTML='<div class="kiln-empty">No notifications yet.</div>'; }); }catch(e){ list.innerHTML='<div class="kiln-empty">No notifications yet.</div>'; }
    }
    bell.addEventListener('click',function(e){ e.stopPropagation();
      var open=panel.classList.toggle('open');
      if(open){ try{ c.from('notifications').update({read:true}).eq('user_id',session.user.id).eq('read',false).then(function(){ badge.style.display='none'; },function(){}); }catch(e){} }
    });
    panel.addEventListener('click',function(e){ e.stopPropagation(); });
    document.addEventListener('click',function(){ panel.classList.remove('open'); });
    load();
  }

  function init(){
    ensureSupa(function(){
      var c=client(); if(!c) return;
      try{ c.auth.getSession().then(function(r){
        var s=r&&r.data?r.data.session:null; if(!s) return;   // logged-out → no bell
        waitForNav(function(nav){ mount(nav, c, s); });
      },function(){}); }catch(e){}
    });
  }
  if(document.readyState!=='loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
