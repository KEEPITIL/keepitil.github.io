/* KEEPITIL — Click tracking (GA4) · spec: _docs/ANALYTICS-CLICK-TRACKING-SPEC.md
   One delegated listener. Works on dynamically-rendered cards. Staging excluded. */
(function(){
  "use strict";
  if (location.pathname.indexOf('-staging') > -1) return;   // staging pages send nothing

  function send(name, params){
    try {
      if (window.gtag) { window.gtag('event', name, params || {}); }
      else if (window.dataLayer) { window.dataLayer.push(['event', name, params || {}]); }
      else if (window.console) { console.debug('[kt]', name, params || {}); }
    } catch(e){}
  }
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
    }
  }, true);   // capture phase → runs before stopPropagation handlers

  window.KT_send = send;
})();
