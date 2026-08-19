/* KEEPITIL — Click tracking (GA4) · spec: _docs/ANALYTICS-CLICK-TRACKING-SPEC.md
   One delegated listener. Works on dynamically-rendered cards. Staging excluded. */
(function(){
  "use strict";
  if (location.pathname.indexOf('-staging') > -1) return;   // staging pages send nothing

  /* ── FIRST-PARTY ATTRIBUTION (Atlas 2026-08-17) ───────────────────────────────────────────
     Every published event sends the buyer off-site, and until now that click existed ONLY as a
     GA4 event. GA4 is someone else's database: it cannot tell an organizer how many people
     KEEPITIL sent them, it cannot back an affiliate reconciliation, and it disappears behind ad
     blockers. So every click is now ALSO written to page_views via the kil_track RPC.
     GA4 is kept — this is additive, not a replacement. */
  var SB_URL = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  var SB_ANON = (window.KIL_ANON || (window.SB && window.SB.supabaseKey) || '');

  function sessionId(){
    try {
      var k = 'kil_sid', v = localStorage.getItem(k);
      if (!v){ v = (Date.now().toString(36) + Math.random().toString(36).slice(2,10)); localStorage.setItem(k, v); }
      return v;
    } catch(e){ return ''; }   /* private mode / storage disabled — anonymous click still logs */
  }

  function firstParty(name, params){
    if (!SB_ANON) return;                       /* no key on the page → skip silently, never throw */
    var kind = params && params.eventSlug ? 'event' : 'page';
    var body = JSON.stringify({
      p_kind: kind,
      p_target_slug: (params && (params.eventSlug || params.targetSlug)) || location.pathname,
      p_event_type: name,
      p_session_id: sessionId(),
      p_meta: { dest_domain: (params && params.link_domain) || '',
                program:     (params && params.program) || '',
                source_page: (params && params.source_page) || location.pathname }
    });
    try {
      /* keepalive so the request survives the tab navigating away to the ticket seller —
         a normal fetch is cancelled on unload and the click is lost, which is exactly the
         click we most want to keep. */
      fetch(SB_URL + '/rest/v1/rpc/kil_track', {
        method:'POST', keepalive:true,
        headers:{ 'Content-Type':'application/json', 'apikey':SB_ANON, 'Authorization':'Bearer '+SB_ANON },
        body: body
      }).catch(function(){});
    } catch(e){}
  }

  function send(name, params){
    try {
      if (window.gtag) { window.gtag('event', name, params || {}); }
      else if (window.dataLayer) { window.dataLayer.push(['event', name, params || {}]); }
      else if (window.console) { console.debug('[kt]', name, params || {}); }
    } catch(e){}
    firstParty(name, params || {});
  }

  /* ── AFFILIATE REWRITING ──────────────────────────────────────────────────────────────────
     Rules come from platform_config.affiliate_link_rules — vendor params are CONFIG, never code.
     A rule with active:false appends NOTHING and the raw link is used, so an unapproved program
     can never ship a broken or invented affiliate id. Fails open: any error leaves the URL alone. */
  var RULES = null;
  function loadRules(){
    if (RULES || !SB_ANON) return;
    RULES = [];
    try {
      fetch(SB_URL + '/rest/v1/platform_config?key=eq.affiliate_link_rules&select=value',
            { headers:{ 'apikey':SB_ANON, 'Authorization':'Bearer '+SB_ANON } })
        .then(function(r){ return r.json(); })
        .then(function(rows){
          if (!rows || !rows[0]) return;
          var cfg = JSON.parse(rows[0].value);
          RULES = (cfg.rules || []).filter(function(x){ return x.active && x.mode === 'append'; });
        }).catch(function(){});
    } catch(e){}
  }
  function affiliate(url){
    if (!RULES || !RULES.length) return url;
    try {
      var u = new URL(url, location.href), h = u.hostname.replace(/^www\./,'');
      for (var i=0;i<RULES.length;i++){
        var r = RULES[i];
        if (h === r.host || h.slice(-(r.host.length+1)) === '.'+r.host){
          for (var k in r.params){
            if (!u.searchParams.has(k)) u.searchParams.set(k, r.params[k]);
          }
          return u.toString();
        }
      }
    } catch(e){}
    return url;
  }
  loadRules();
  function hostOf(u){ try { return new URL(u, location.href).hostname.replace(/^www\./,''); } catch(e){ return ''; } }
  function isExternal(u){ try { var h = new URL(u, location.href).hostname; return !!h && h !== location.hostname; } catch(e){ return false; } }
  function classify(u){
    var h = hostOf(u);
    if (/posh\.vip|dice\.fm|ra\.co|ticketmaster|axs\.com|tixr|eventbrite|see ?tickets|shotgun|frontgate|ticketweb|eventim|cuetogether|ticketsauce|lacma/i.test(h))
      return { name:'ticket_click', params:{ link_domain:h } };
    if (/amazon\./i.test(u) && /tuitea-20/i.test(u)) return { name:'affiliate_click', params:{ program:'amazon', link_domain:h } };
    if (/distrokid/i.test(h)) return { name:'affiliate_click', params:{ program:'distrokid', link_domain:h } };
    if (/freecash/i.test(h)) return { name:'affiliate_click', params:{ program:'freecash', link_domain:h } };
    return { name:'outbound_click', params:{ link_domain:h } };
  }

  document.addEventListener('click', function(e){
    var el = e.target.closest && e.target.closest('a,[data-kt]');
    if (!el) return;
    var kt = el.getAttribute && el.getAttribute('data-kt');
    if (kt){
      var p = { source_page: location.pathname };
      if (el.dataset){ for (var k in el.dataset){ if (k !== 'kt') p[k] = el.dataset[k]; } }
      send(kt, p);
      return;
    }
    var href = el.getAttribute && el.getAttribute('href');
    if (href && isExternal(href)){
      var c = classify(href);
      c.params.source_page = location.pathname;
      send(c.name, c.params);
      /* rewrite in place, once, so the navigation this click is about to perform carries the
         affiliate params. No-op while every program is still active:false. */
      var rewritten = affiliate(href);
      if (rewritten !== href) el.setAttribute('href', rewritten);
    }
  }, true);   // capture phase → runs before stopPropagation handlers

  window.KT_send = send;
  window.KT_affiliate = affiliate;
})();
