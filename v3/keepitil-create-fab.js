/* KEEPITIL — floating "+ CREATE" event button (EDMTrain-style FAB). V3 events page only.
   Two paths: Create on KEEPITIL (native, member-gated) OR Sell on Posh (organizer referral).
   Load: <script src="/v3/keepitil-create-fab.js" defer></script> */
(function(){
  if(window.__kilCreateFab) return; window.__kilCreateFab=1;
  var POSH='https://posh.vip/create_group?ref=S-referral-mp9itc5j-wb9dbt';
  function el(t,a,h){var e=document.createElement(t);if(a)for(var k in a)e.setAttribute(k,a[k]);if(h!=null)e.innerHTML=h;return e;}
  function css(){
    if(document.getElementById('kil-cfab-style'))return;
    var s=el('style',{id:'kil-cfab-style'});
    s.textContent=
      '#kil-cfab{position:fixed;right:16px;bottom:66px;z-index:99997;display:flex;flex-direction:column-reverse;align-items:flex-end;gap:10px;font-family:var(--font,Inter,system-ui,sans-serif)}'
     +'#kil-cfab .cfab-btn{display:flex;align-items:center;gap:8px;background:linear-gradient(90deg,var(--brand,#00b4ff),var(--brand-2,#5cc8ff));color:#04121b;border:0;border-radius:999px;padding:13px 20px;font-weight:900;letter-spacing:.04em;font-size:.9rem;cursor:pointer;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.45)}'
     +'#kil-cfab .cfab-btn .plus{font-size:1.15rem;line-height:1}'
     +'#kil-cfab .cfab-menu{display:none;flex-direction:column;gap:8px;background:var(--surface,#15151f);border:1px solid var(--line,rgba(255,255,255,.14));border-radius:16px;padding:10px;box-shadow:0 14px 34px rgba(0,0,0,.55);min-width:240px}'
     +'#kil-cfab.open .cfab-menu{display:flex}'
     +'#kil-cfab .cfab-opt{display:flex;align-items:flex-start;gap:11px;background:transparent;border:1px solid var(--line,rgba(255,255,255,.12));border-radius:12px;padding:12px 13px;text-decoration:none;color:var(--text,#f0f0f0);cursor:pointer;text-align:left}'
     +'#kil-cfab .cfab-opt:hover{border-color:var(--brand,#00b4ff)}'
     +'#kil-cfab .cfab-opt .ic{font-size:1.3rem;line-height:1.1}'
     +'#kil-cfab .cfab-opt .t{font-weight:800;font-size:.9rem}'
     +'#kil-cfab .cfab-opt .d{color:var(--muted,#9a9aa6);font-size:.76rem;line-height:1.35;margin-top:2px}'
     +'@media(max-width:600px){#kil-cfab{bottom:74px;right:12px}#kil-cfab .cfab-menu{min-width:210px}}';
    document.head.appendChild(s);
  }
  function build(){
    css();
    var wrap=el('div',{id:'kil-cfab'});
    // Single button that navigates to the dedicated Create page (chooser: KEEPITIL vs Posh).
    wrap.innerHTML=
      '<a class="cfab-btn" href="/v3/create.html" aria-label="Create an event"><span class="plus">+</span>CREATE</a>';
    document.body.appendChild(wrap);
  }
  if(document.body) build(); else document.addEventListener('DOMContentLoaded',build);
})();
