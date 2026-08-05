/* ═══════════════════════════════════════════════════════════════════════════════════════
   KEEPITIL VS — V1 front end (KODE 2026-08-05, handoff #46/#50)
   Renders into #vs-app inside Atlas's /culture/vs shell. Talks ONLY to the vs_* RPCs; it
   never computes a vote total itself — totals and the 5-vote rule are server-owned (§17).
   Views: feed · competition · submission · my entries · my votes · admin manager.
   ═══════════════════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var SUPA_URL = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  var SB = window.supabase ? window.supabase.createClient(SUPA_URL, SUPA_KEY) : null;
  var APP = document.getElementById('vs-app');
  var ME = null, IS_ADMIN = false, FILTER = 'all';

  function h(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function q(k){ try{ return new URLSearchParams(location.search).get(k); }catch(e){ return null; } }
  function go(params){ var u=new URL(location.href); u.search=''; Object.keys(params||{}).forEach(function(k){ if(params[k]!=null) u.searchParams.set(k,params[k]); }); history.pushState({},'',u); route(); }
  window.addEventListener('popstate', function(){ route(); });

  function busy(msg){ APP.innerHTML = '<div class="vs-busy">'+h(msg||'Loading…')+'</div>'; }
  function empty(title, sub, cta){
    APP.innerHTML = '<div class="soon"><div class="i">⚔️</div><h2>'+h(title)+'</h2><p>'+h(sub||'')+'</p>'+(cta||'')+'</div>';
  }
  function err(e){ APP.innerHTML = '<div class="vs-err">Something went wrong. <span>'+h(String(e&&e.message||e))+'</span></div>'; }

  /* ── styles (scoped to #vs-app so the shell is untouched) ───────────────────────── */
  var CSS = ''
   + '#vs-app{--vsb:#00b4ff;--vsl:rgba(255,255,255,.1)}'
   + '#vs-app .vs-busy,#vs-app .vs-err{padding:40px 6px;color:#9aa0b0;text-align:center}'
   + '#vs-app .vs-err span{display:block;font-size:.8rem;opacity:.7;margin-top:6px}'
   + '#vs-app .vs-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 16px}'
   + '#vs-app .vs-bar button,#vs-app .vs-bar a{background:rgba(255,255,255,.05);border:1px solid var(--vsl);color:#e8e6f2;border-radius:999px;padding:8px 15px;font:700 .78rem Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;text-decoration:none}'
   + '#vs-app .vs-bar .on{background:linear-gradient(90deg,var(--vsb),#5cc8ff);border-color:transparent;color:#04121b}'
   + '#vs-app .vs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}'
   + '#vs-app .vs-card{background:rgba(12,12,20,.92);border:1px solid var(--vsl);border-radius:14px;overflow:hidden;cursor:pointer;transition:border-color .18s,transform .18s}'
   + '#vs-app .vs-card:hover{border-color:rgba(0,180,255,.5);transform:translateY(-2px)}'
   + '#vs-app .vs-card .cov{width:100%;aspect-ratio:4/3;background:#0a0a0f center/cover no-repeat;display:block}'
   + '#vs-app .vs-card .bd{padding:11px 13px 13px}'
   + '#vs-app .vs-card h3{font-size:1rem;font-weight:600;color:#fff;margin:0 0 3px;line-height:1.25}'
   + '#vs-app .vs-card .by{color:#9aa0b0;font-size:.78rem}'
   + '#vs-app .vs-card .vt{margin-top:8px;font:800 .74rem Inter,sans-serif;letter-spacing:.08em;color:var(--vsb)}'
   + '#vs-app .vs-detail{max-width:760px;margin:0 auto}'
   + '#vs-app .vs-detail .big{width:100%;border-radius:16px;background:#0a0a0f center/cover no-repeat;aspect-ratio:16/10;margin-bottom:14px}'
   + '#vs-app .vs-detail .big.nomedia{aspect-ratio:auto;height:74px;display:flex;align-items:center;justify-content:center;border:1px dashed var(--vsl);color:#66727e;font:700 .75rem Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase}'
   + '#vs-app h2.vs-h{font-family:var(--fs,inherit);font-size:1.5rem;color:#fff;margin:0 0 4px}'
   + '#vs-app .vs-meta{color:#9aa0b0;font-size:.85rem;margin-bottom:14px}'
   /* the 5-action vote bar — sticky on mobile per §28 */
   + '#vs-app .vs-votes{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0;padding:12px;border:1px solid var(--vsl);border-radius:14px;background:rgba(12,12,20,.9)}'
   + '#vs-app .vs-votes button{flex:1 1 0;min-width:92px;display:flex;flex-direction:column;align-items:center;gap:4px;background:rgba(255,255,255,.05);border:1px solid var(--vsl);color:#e8e6f2;border-radius:11px;padding:10px 6px;cursor:pointer;font:700 .72rem Inter,sans-serif;letter-spacing:.05em}'
   + '#vs-app .vs-votes button .em{font-size:1.1rem;line-height:1}'
   /* active state is NOT colour-only (§28): a ✓ is added too */
   + '#vs-app .vs-votes button.on{border-color:var(--vsb);color:var(--vsb);background:rgba(0,180,255,.12)}'
   + '#vs-app .vs-votes button[disabled]{opacity:.45;cursor:not-allowed}'
   + '#vs-app .vs-prog{font:800 .78rem Inter,sans-serif;letter-spacing:.06em;color:#fff;margin-bottom:8px}'
   + '#vs-app .vs-prog small{color:#9aa0b0;font-weight:600;letter-spacing:0}'
   + '#vs-app .vs-lb{width:100%;border-collapse:collapse;margin-top:10px}'
   + '#vs-app .vs-lb th,#vs-app .vs-lb td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--vsl);font-size:.85rem}'
   + '#vs-app .vs-lb th{color:#9aa0b0;font:800 .7rem Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase}'
   + '#vs-app .vs-form{max-width:620px;margin:0 auto;display:grid;gap:10px}'
   + '#vs-app .vs-form label{font:800 .7rem Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#9aa0b0}'
   + '#vs-app .vs-form input,#vs-app .vs-form textarea,#vs-app .vs-form select{width:100%;background:#0a0a0f;border:1px solid var(--vsl);border-radius:10px;padding:10px 12px;color:#f0f0f0;font:400 .92rem Inter,sans-serif}'
   + '#vs-app .vs-cta{background:linear-gradient(90deg,var(--vsb),#5cc8ff);color:#04121b;border:0;border-radius:999px;padding:13px 26px;font:800 .9rem Inter,sans-serif;cursor:pointer}'
   + '#vs-app .vs-note{color:#9aa0b0;font-size:.8rem;line-height:1.5}'
   + '#vs-app .vs-pill{display:inline-block;font:800 .66rem Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--vsl);border-radius:999px;padding:3px 9px;color:#9aa0b0;margin-right:6px}'
   + '#vs-app .vs-pill.ok{color:#22e39b;border-color:rgba(34,227,155,.45)}'
   + '#vs-app .vs-pill.warn{color:#ffb43c;border-color:rgba(255,180,60,.45)}'
   + '@media(max-width:860px){#vs-app .vs-votes{position:sticky;bottom:calc(66px + env(safe-area-inset-bottom,0px));z-index:30}}';
  (function(){ var s=document.createElement('style'); s.textContent=CSS; document.head.appendChild(s); })();

  /* ── session ───────────────────────────────────────────────────────────────────── */
  function loadMe(){
    if(!SB) return Promise.resolve();
    return SB.auth.getSession().then(function(r){
      ME = r && r.data && r.data.session ? r.data.session.user : null;
      if(!ME) return;
      return SB.rpc('vs_is_admin').then(function(a){ IS_ADMIN = !!(a && a.data); });
    }).catch(function(){});
  }

  /* ── nav ───────────────────────────────────────────────────────────────────────── */
  function navBar(active){
    var b = [['feed','Feed'],['mine','My Entries'],['votes','My Votes']];
    if(IS_ADMIN) b.push(['admin','Manage']);
    return '<div class="vs-bar">'
      + b.map(function(x){ return '<button class="'+(active===x[0]?'on':'')+'" data-nav="'+x[0]+'">'+h(x[1])+'</button>'; }).join('')
      + '</div>';
  }
  APP.addEventListener('click', function(e){
    var n = e.target.closest && e.target.closest('[data-nav]');
    if(n){ go({view:n.dataset.nav}); }
  });

  /* ── FEED (§3-4) ───────────────────────────────────────────────────────────────── */
  window.vsFilter = function(kind, el){
    FILTER = kind;
    try{
      var rail = document.getElementById('vsVRail');
      if(rail && el){ [].forEach.call(rail.querySelectorAll('.cvr.sf'), function(b){ b.classList.toggle('on', b===el); }); }
    }catch(x){}
    if((q('view')||'feed')==='feed') renderFeed(); else go({view:'feed'});
  };

  function renderFeed(){
    busy('Loading competitions…');
    var sort = FILTER==='winners' ? 'top' : 'new';
    SB.rpc('vs_feed', { p_sort: sort, p_limit: 30 }).then(function(r){
      if(r.error) throw r.error;
      var rows = r.data || [];
      if(FILTER==='voting') rows = rows.filter(function(x){ return x.voting_open; });
      if(FILTER==='open')   rows = rows.filter(function(x){ return !x.voting_open; });
      if(!rows.length){
        APP.innerHTML = navBar('feed')
          + '<div class="soon"><div class="i">⚔️</div><h2>No entries yet</h2><p>'
          + (IS_ADMIN ? 'Create the first competition from <b>Manage</b>.' : 'Competitions are opening soon — check back shortly.')
          + '</p></div>';
        return;
      }
      APP.innerHTML = navBar('feed') + '<div class="vs-grid">' + rows.map(function(x){
        return '<div class="vs-card" data-entry="'+x.entry_id+'">'
          + '<div class="cov"'+(x.thumb_url?(' style="background-image:url('+h(x.thumb_url)+')"'):'')+'></div>'
          + '<div class="bd"><h3>'+h(x.title)+'</h3>'
          + '<div class="by">'+(x.creator_handle?('@'+h(x.creator_handle)):'Creator')+' · '+h(x.competition_title||'')+'</div>'
          + '<div class="vt">'+(x.total_votes||0)+' vote'+((x.total_votes||0)===1?'':'s')
          + (x.voting_open?' · voting open':' · voting closed')+'</div></div></div>';
      }).join('') + '</div>';
      [].forEach.call(APP.querySelectorAll('[data-entry]'), function(c){
        c.onclick = function(){ go({view:'entry', e:c.dataset.entry}); };
      });
    }).catch(err);
  }

  /* ── SUBMISSION DETAIL + the 5 vote actions (§9-17, §21) ───────────────────────── */
  var ACTIONS = [['like','♥','Like'],['comment','💬','Comment'],['repost','🔁','Repost'],['share','➦','Share'],['save','🔖','Save']];

  function renderEntry(id){
    busy('Loading entry…');
    Promise.all([
      SB.from('vs_entries').select('*').eq('id', id).maybeSingle(),
      SB.rpc('vs_entry_totals', { p_entry: Number(id) }),
      ME ? SB.rpc('vs_my_progress', { p_entry: Number(id) }) : Promise.resolve({ data: null })
    ]).then(function(res){
      var e = res[0].data, totals = res[1].data || {}, prog = res[2].data || {};
      if(!e){ empty('Entry not found', 'It may have been withdrawn.'); return; }
      var open = true;
      return SB.from('vs_competitions').select('title,vote_display_mode,voting_closes_at,status,results_locked_at')
        .eq('id', e.competition_id).maybeSingle().then(function(cr){
          var c = cr.data || {};
          open = c.status !== 'closed' && !c.results_locked_at &&
                 (!c.voting_closes_at || new Date(c.voting_closes_at) > new Date());
          var blind = c.vote_display_mode === 'blind' && open;
          var used = prog.used || 0;

          APP.innerHTML = navBar('feed')
            + '<div class="vs-detail">'
            + '<button class="vs-pill" data-nav="feed">‹ Back</button>'
            /* no thumbnail = no giant empty block; a slim placeholder instead */
            + (e.thumb_url
                ? '<div class="big" style="background-image:url('+h(e.thumb_url)+')"></div>'
                : '<div class="big nomedia"><span>No preview yet</span></div>')
            + '<h2 class="vs-h">'+h(e.title)+'</h2>'
            + '<div class="vs-meta">'+(e.creator_handle?('@'+h(e.creator_handle)+' · '):'')+h(c.title||'')
            + ' · <span class="vs-pill '+(open?'ok':'')+'">'+(open?'Voting open':'Voting closed')+'</span></div>'
            + (e.description ? '<p class="vs-note">'+h(e.description)+'</p>' : '')
            + (e.creator_statement ? '<p class="vs-note"><b>Creator statement:</b> '+h(e.creator_statement)+'</p>' : '')
            + (e.ai_disclosure ? '<p class="vs-note"><b>AI disclosure:</b> '+h(e.ai_disclosure)+'</p>' : '')
            /* the user ALWAYS sees their own progress, even in blind mode */
            + '<div class="vs-prog" id="vsProg">Your votes: '+used+' of 5 <small>'
            + (ME ? 'each action counts once' : '— sign in to vote') + '</small></div>'
            + '<div class="vs-votes" id="vsVotes">'
            + ACTIONS.map(function(a){
                var on = !!prog[a[0]];
                return '<button data-a="'+a[0]+'" class="'+(on?'on':'')+'"'
                  + (!ME || !open ? ' disabled' : '')
                  + ' aria-pressed="'+(on?'true':'false')+'">'
                  + '<span class="em" aria-hidden="true">'+a[1]+'</span>'
                  + '<span>'+a[2]+(on?' ✓':'')+'</span></button>';
              }).join('')
            + '</div>'
            + '<div class="vs-note" id="vsTot">'
            + (blind ? 'Totals are hidden until winners are announced.'
                     : 'Total votes: <b>'+(totals.total||0)+'</b> — '
                       + 'like '+(totals.like||0)+' · comment '+(totals.comment||0)+' · repost '+(totals.repost||0)
                       + ' · share '+(totals.share||0)+' · save '+(totals.save||0))
            + '</div>'
            + '<p class="vs-note" style="margin-top:10px">Your first share counts as one permanent vote. Additional shares help the creator but do not add more votes.</p>'
            + '</div>';

          bindVotes(id, open);
        });
    }).catch(err);
  }

  function bindVotes(entryId, open){
    var box = document.getElementById('vsVotes'); if(!box) return;
    box.addEventListener('click', function(ev){
      var b = ev.target.closest('button'); if(!b || b.disabled) return;
      var action = b.dataset.a;
      if(!ME){ location.href = '/v31/apply.html'; return; }
      b.disabled = true;                                   // §29 stop duplicate presses
      var p;
      if(action === 'comment'){
        var txt = window.prompt('Add a comment (this counts as ONE vote no matter how many you leave):');
        if(!txt){ b.disabled = false; return; }
        p = SB.rpc('vs_comment_add', { p_entry: Number(entryId), p_body: txt });
      } else {
        var turningOff = b.classList.contains('on') && action !== 'share';
        p = SB.rpc('vs_vote', { p_entry: Number(entryId), p_action: action, p_desired: !turningOff });
      }
      p.then(function(r){
        if(r.error) throw r.error;
        return refreshVoteState(entryId);
      }).catch(function(e){
        alert(String(e && e.message || e));
      }).then(function(){ if(open) b.disabled = false; });
    });
  }

  /* re-read state from the SERVER after every action — the UI never guesses a total */
  function refreshVoteState(entryId){
    return Promise.all([
      SB.rpc('vs_entry_totals', { p_entry: Number(entryId) }),
      SB.rpc('vs_my_progress', { p_entry: Number(entryId) })
    ]).then(function(r){
      var totals = r[0].data || {}, prog = r[1].data || {};
      var pg = document.getElementById('vsProg');
      if(pg) pg.innerHTML = 'Your votes: '+(prog.used||0)+' of 5 <small>each action counts once</small>';
      [].forEach.call(document.querySelectorAll('#vsVotes button'), function(b){
        var on = !!prog[b.dataset.a];
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        var lbl = ACTIONS.filter(function(a){ return a[0]===b.dataset.a; })[0];
        if(lbl) b.querySelector('span:last-child').textContent = lbl[2] + (on ? ' ✓' : '');
      });
      var t = document.getElementById('vsTot');
      if(t && t.textContent.indexOf('hidden') < 0){
        t.innerHTML = 'Total votes: <b>'+(totals.total||0)+'</b> — like '+(totals.like||0)+' · comment '+(totals.comment||0)
          + ' · repost '+(totals.repost||0)+' · share '+(totals.share||0)+' · save '+(totals.save||0);
      }
    });
  }

  /* ── MY ENTRIES (§22) / MY VOTES (§23) ─────────────────────────────────────────── */
  function renderMine(){
    if(!ME){ APP.innerHTML = navBar('mine') + '<div class="soon"><div class="i">🔐</div><h2>Sign in</h2><p>Your VS entries live here.</p><a class="vs-cta" href="/v31/apply.html">Sign in</a></div>'; return; }
    busy('Loading your entries…');
    SB.rpc('vs_my_entries').then(function(r){
      if(r.error) throw r.error;
      var rows = r.data || [];
      APP.innerHTML = navBar('mine') + (rows.length
        ? '<div class="vs-grid">' + rows.map(function(x){
            return '<div class="vs-card" data-entry="'+x.entry_id+'"><div class="cov"'+(x.thumb_url?(' style="background-image:url('+h(x.thumb_url)+')"'):'')+'></div>'
              + '<div class="bd"><h3>'+h(x.title)+'</h3><div class="by">'+h(x.competition_title||'')+'</div>'
              + '<div style="margin-top:7px"><span class="vs-pill '+(x.status==='approved'?'ok':(x.status==='rejected'||x.status==='disqualified'?'warn':''))+'">'+h(x.status)+'</span>'
              + '<span class="vs-pill '+(x.payment_status==='paid'?'ok':'')+'">'+h(x.payment_status)+'</span></div>'
              + '<div class="vt">'+(x.total_votes||0)+' votes</div>'
              + (x.admin_message ? '<div class="vs-note" style="margin-top:6px">'+h(x.admin_message)+'</div>' : '')
              + '</div></div>';
          }).join('') + '</div>'
        : '<div class="soon"><div class="i">📥</div><h2>No entries yet</h2><p>When you enter a competition it appears here with its status, votes and any note from the review team.</p></div>');
      [].forEach.call(APP.querySelectorAll('[data-entry]'), function(c){ c.onclick=function(){ go({view:'entry', e:c.dataset.entry}); }; });
    }).catch(err);
  }

  function renderVotes(){
    if(!ME){ APP.innerHTML = navBar('votes') + '<div class="soon"><div class="i">🔐</div><h2>Sign in</h2><p>Your voting history lives here.</p><a class="vs-cta" href="/v31/apply.html">Sign in</a></div>'; return; }
    busy('Loading your votes…');
    SB.rpc('vs_my_votes').then(function(r){
      if(r.error) throw r.error;
      var rows = r.data || [];
      APP.innerHTML = navBar('votes') + (rows.length
        ? '<table class="vs-lb"><thead><tr><th>Entry</th><th>Competition</th><th>Your actions</th><th>Votes</th></tr></thead><tbody>'
          + rows.map(function(x){
              var acts = [['like',x.like_v],['comment',x.comment_v],['repost',x.repost_v],['share',x.share_v],['save',x.save_v]]
                .filter(function(a){ return a[1]; }).map(function(a){ return a[0]; });
              return '<tr><td><a href="?view=entry&e='+x.entry_id+'" style="color:var(--vsb)">'+h(x.entry_title)+'</a></td>'
                + '<td>'+h(x.competition_title||'')+'</td>'
                + '<td>'+(acts.length?acts.join(', '):'—')+(x.voting_open?'':' <span class="vs-pill">locked</span>')+'</td>'
                + '<td>'+(x.contributed||0)+' of 5</td></tr>';
            }).join('')
          + '</tbody></table>'
        : '<div class="soon"><div class="i">🗳️</div><h2>No votes yet</h2><p>Vote on an entry and it shows here — you can change reversible votes until voting closes.</p></div>');
    }).catch(err);
  }

  /* ── ADMIN: Competition Manager (§6-7, §32, §34.1) ─────────────────────────────── */
  function renderAdmin(){
    if(!IS_ADMIN){ empty('Admins only', 'Competition creation is restricted to the KEEPITIL team.'); return; }
    busy('Loading manager…');
    SB.from('vs_competitions').select('*').order('id', { ascending: false }).then(function(r){
      var comps = r.data || [];
      APP.innerHTML = navBar('admin')
        + '<div class="vs-form" id="vsNew">'
        + '<h2 class="vs-h">New competition</h2>'
        + '<label>Title</label><input id="nTitle" placeholder="e.g. Summer Mix Battle">'
        + '<label>Description</label><textarea id="nDesc" rows="2"></textarea>'
        + '<label>Entry fee (USD, 0 = free)</label><input id="nFee" type="number" min="0" step="1" value="0">'
        + '<label>Submissions close</label><input id="nSubClose" type="datetime-local">'
        + '<label>Voting opens</label><input id="nVoteOpen" type="datetime-local">'
        + '<label>Voting closes</label><input id="nVoteClose" type="datetime-local">'
        + '<label>Vote display</label><select id="nMode"><option value="transparent">Transparent — live totals</option>'
        + '<option value="hidden_ranking">Hidden ranking — totals hidden until close</option>'
        + '<option value="blind">Blind — nothing shown until winners</option></select>'
        + '<button class="vs-cta" id="nGo">Create as draft</button>'
        + '<p class="vs-note">Created as a draft. Set dates and publish when ready — entries and votes are never copied by duplication.</p>'
        + '</div>'
        + '<h2 class="vs-h" style="margin-top:26px">Competitions</h2>'
        + (comps.length ? '<table class="vs-lb"><thead><tr><th>Title</th><th>Status</th><th>Fee</th><th>Voting closes</th><th></th></tr></thead><tbody>'
            + comps.map(function(c){
                return '<tr><td>'+h(c.title)+'</td><td><span class="vs-pill '+(c.status==='published'?'ok':'')+'">'+h(c.status)+'</span></td>'
                  + '<td>'+(c.entry_fee_cents ? '$'+(c.entry_fee_cents/100).toFixed(2) : 'Free')+'</td>'
                  + '<td>'+(c.voting_closes_at ? new Date(c.voting_closes_at).toLocaleString() : '—')+'</td>'
                  + '<td><button class="vs-pill" data-dup="'+c.id+'">Duplicate</button>'
                  + (c.status==='draft' ? ' <button class="vs-pill" data-pub="'+c.id+'">Publish</button>' : '')
                  + '</td></tr>';
              }).join('') + '</tbody></table>'
          : '<p class="vs-note">No competitions yet.</p>')
        + '<h2 class="vs-h" style="margin-top:26px">Awaiting review</h2><div id="vsQueue"><p class="vs-note">Loading…</p></div>';

      document.getElementById('nGo').onclick = function(){
        var fee = Math.max(0, parseInt(document.getElementById('nFee').value || '0', 10)) * 100;
        var payload = {
          title: document.getElementById('nTitle').value.trim(),
          description: document.getElementById('nDesc').value.trim(),
          entry_fee_cents: fee,
          submissions_close_at: document.getElementById('nSubClose').value || null,
          voting_opens_at: document.getElementById('nVoteOpen').value || null,
          voting_closes_at: document.getElementById('nVoteClose').value || null,
          vote_display_mode: document.getElementById('nMode').value
        };
        if(!payload.title){ alert('Title is required'); return; }
        SB.rpc('vs_create_competition', { p: payload }).then(function(r){
          if(r.error) throw r.error;
          renderAdmin();
        }).catch(function(e){ alert(String(e && e.message || e)); });
      };
      APP.addEventListener('click', function(ev){
        var d = ev.target.closest && ev.target.closest('[data-dup]');
        if(d){ SB.rpc('vs_duplicate_competition', { p_source: Number(d.dataset.dup) })
                 .then(function(r){ if(r.error) throw r.error; renderAdmin(); })
                 .catch(function(e){ alert(String(e && e.message || e)); }); }
        var p = ev.target.closest && ev.target.closest('[data-pub]');
        if(p){ SB.from('vs_competitions').update({ status: 'published' }).eq('id', Number(p.dataset.pub))
                 .then(function(){ renderAdmin(); }); }
      });

      SB.from('vs_entries').select('id,title,creator_handle,status,competition_id').in('status', ['submitted','under_review'])
        .then(function(qr){
          var rows = qr.data || [], box = document.getElementById('vsQueue'); if(!box) return;
          box.innerHTML = rows.length
            ? rows.map(function(x){
                return '<div style="display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--vsl)">'
                  + '<div style="flex:1"><b>'+h(x.title)+'</b><div class="vs-note">@'+h(x.creator_handle||'')+'</div></div>'
                  + '<button class="vs-pill ok" data-ok="'+x.id+'">Approve</button>'
                  + '<button class="vs-pill warn" data-no="'+x.id+'">Reject</button></div>';
              }).join('')
            : '<p class="vs-note">Nothing awaiting review.</p>';
          box.onclick = function(ev){
            var ok = ev.target.closest('[data-ok]'), no = ev.target.closest('[data-no]');
            var id = ok ? ok.dataset.ok : (no ? no.dataset.no : null); if(!id) return;
            SB.rpc('vs_review_entry', { p_entry: Number(id), p_decision: ok ? 'approved' : 'rejected' })
              .then(function(r){ if(r.error) throw r.error; renderAdmin(); })
              .catch(function(e){ alert(String(e && e.message || e)); });
          };
        });
    }).catch(err);
  }

  /* ── router ────────────────────────────────────────────────────────────────────── */
  function route(){
    if(!SB){ err('Supabase client unavailable'); return; }
    var v = q('view') || 'feed';
    if(v === 'entry' && q('e')) return renderEntry(q('e'));
    if(v === 'mine')  return renderMine();
    if(v === 'votes') return renderVotes();
    if(v === 'admin') return renderAdmin();
    return renderFeed();
  }

  loadMe().then(route);
})();
