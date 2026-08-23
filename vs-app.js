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
  /* Header counters. A real 0 renders as "0", not as an em dash — the placeholder means
     "not loaded yet" and the two must stay distinguishable (BROKEN != EMPTY). */
  function fmtN(n){
    n = Number(n);
    if(!isFinite(n)) return '—';
    return n >= 1000 ? (n/1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/,'') + 'K' : String(n);
  }
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
   + '#vs-app h1.vs-h,#vs-app h2.vs-h{font-family:var(--fs,inherit);font-size:1.5rem;color:#fff;margin:0 0 4px;font-weight:inherit}'
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
   /* ── Posh-style two-column competition page (Founder 2026-08-18) ──────────────────
      DESKTOP: left 1/3 is the flyer + action button, position:sticky so it never scrolls away;
      right 2/3 scrolls. MOBILE: one column, flyer first, everything else beneath. */
   /* Top gap (Founder 2026-08-19): "the top of the flyer and the event is cut off." Removing the
      CREATE hero took the page's only top spacing with it, so the flyer and the organiser row
      started flush against the fixed nav. This restores the breathing room the hero used to
      provide — and the locked-column height below subtracts it, or the column would grow taller
      than the viewport and push the bottom of the flyer out of sight. */
   + '#vs-app .cd2{display:grid;grid-template-columns:1fr;gap:22px;align-items:start;max-width:1120px;margin:20px auto 0}'
   /* Founder-locked 2026-08-19, set in the interactive preview: flyer column 35%, column gap 20. */
   + '@media(min-width:861px){#vs-app .cd2{grid-template-columns:minmax(0,35%) minmax(0,1fr);gap:20px}}'
   + '#vs-app .cd-stick{display:flex;flex-direction:column;gap:12px}'
   /* LOCKED, not sticky (Founder 2026-08-18). position:sticky still travels with the page until
      it reaches its offset — the flyer visibly moved before settling. Posh instead gives the RIGHT
      column its own scroll container, so the left never moves by even a pixel.
      The 196px allows for the shell's fixed top nav (70) and the radio bar + safe area at the
      bottom; without it the inner scroller runs underneath them and the last section is
      unreachable. Mobile is untouched: one column, normal page scroll. */
   + '@media(min-width:861px){'
   +   '#vs-app .cd2{height:calc(100vh - 216px);min-height:520px;overflow:hidden}'
   +   '#vs-app .cd-left{height:100%;overflow:hidden}'
   +   '#vs-app .cd-stick{position:static;height:100%;justify-content:flex-start}'
   +   '#vs-app .cd-flyer{flex:0 1 auto;min-height:0}'
   +   '#vs-app .cd-right{height:100%;overflow-y:auto;overscroll-behavior:contain;padding-right:12px}'
   +   '#vs-app .cd-right::-webkit-scrollbar{width:8px}'
   +   '#vs-app .cd-right::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:4px}'
   + '}'
   /* SAME RATIO AS THE HOMEPAGE EVENT FLYER (Founder 2026-08-18): 2:3 on desktop, 9:16 on
      mobile, radius 14/15 — index.html #evx .evx-flyer. It was 4:5, which matched neither,
      so the same artwork would have cropped differently on the calendar and on this page. */
   + '#vs-app .cd-flyer{width:100%;aspect-ratio:2/3;border-radius:10px;background:#15131f center/cover no-repeat;border:1px solid var(--vsl)}'
   + '#vs-app .cd-flyer-gen{display:flex;flex-direction:column;justify-content:center;gap:10px;padding:26px;text-align:center;'
   +   'background:linear-gradient(150deg,rgba(0,180,255,.22),rgba(160,107,255,.22))}'
   + '#vs-app .cd-flyer-gen .cat{font:800 .72rem Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#bfe3ff}'
   + '#vs-app .cd-flyer-gen .ttl{font-family:var(--fs,inherit);font-size:1.5rem;line-height:1.15;color:#fff}'
   + '#vs-app .cd-flyer-gen .dt{font:700 .74rem Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#9fb2c6}'
   + /* Founder-locked 2026-08-19: 40px tall. Padding is overridden because .vs-cta's 13px
   vertical padding alone makes the button 44px — taller than the locked value. */
   + '#vs-app .cd-buy{width:100%;text-align:center;height:40px;padding:0 26px;border-radius:20px;display:flex;align-items:center;justify-content:center}'
   /* ── SUBMIT PAGE (Founder 2026-08-21) ────────────────────────────────────────────
      Same two-column shell as the competition and entry pages, with one exception: the left
      column is NOT height-locked here. Two 2:3 upload slots plus a button do not fit in
      100vh-216px, and locking it would clip the cover slot out of reach — the exact bug the
      Founder reported on the competition page ("the top of the flyer is cut off"). */
   + '@media(min-width:861px){'
   +   '#vs-app .cd2-sub{height:auto;min-height:0;overflow:visible}'
   +   '#vs-app .cd2-sub .cd-left,#vs-app .cd2-sub .cd-right{height:auto;overflow:visible}'
   + '}'
   + '#vs-app .sf-slot{display:flex;flex-direction:column;gap:7px}'
   + '#vs-app .sf-cap{font:800 .7rem Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#9aa0b0}'
   + '#vs-app .sf-cap b{color:#ff6b6b}'
   + '#vs-app .sf-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}'
   + '#vs-app .sf-drop{position:relative;overflow:hidden;cursor:pointer;display:flex;align-items:center;'
   +   'justify-content:center;border-style:dashed;transition:border-color .15s,background .15s}'
   + '#vs-app .sf-drop:hover{border-color:var(--vsb);background:rgba(0,180,255,.06)}'
   + '#vs-app .sf-drop.has{border-style:solid;background:#0a0a0f}'
   + '#vs-app .sf-ph{display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;padding:18px;color:#9aa0b0;font:600 .84rem Inter,sans-serif}'
   + '#vs-app .sf-ph .ic{font-size:1.7rem;line-height:1;color:var(--vsb)}'
   + '#vs-app .sf-ph small{font-weight:500;font-size:.72rem;color:#6f7686;line-height:1.35}'
   + '#vs-app .sf-media{width:100%;height:100%;object-fit:contain;background:#000;display:block}'
   + '#vs-app .sf-doc{display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px;text-align:center}'
   + '#vs-app .sf-doc .ic{font-size:2.2rem;line-height:1}'
   + '#vs-app .sf-doc b{font:700 .86rem Inter,sans-serif;color:#f0f0f0;word-break:break-all;line-height:1.35}'
   + '#vs-app .sf-doc small{font:500 .72rem Inter,sans-serif;color:#6f7686}'
   + '#vs-app .sf-doc audio{width:100%;margin-top:4px}'
   + '#vs-app .sf-more{position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.72);color:#cfd3df;'
   +   'font:700 .68rem Inter,sans-serif;padding:3px 8px;border-radius:999px}'
   + '#vs-app .sf-swap{position:absolute;right:8px;top:8px;background:rgba(0,0,0,.72);color:#fff;'
   +   'font:800 .66rem Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:999px}'
   + '#vs-app .sf-back{background:none;border:1px solid var(--vsl);cursor:pointer;margin-bottom:10px}'
   + '#vs-app .sf-go{margin-top:16px}'
   /* ── CREATE header stat row (Founder 2026-08-21) — the Connect page's pattern ───── */
   /* LEFT on desktop, matching /connect (Founder 2026-08-21). Centred below 861px, where a
      left-aligned title over a full-width stat row reads as misaligned rather than deliberate. */
   /* Background-first opening panel, matching the homepage (Founder 2026-08-21). */
   /* Bottom-weighted, matching /connect and /earn (Founder 2026-08-21). */
   + '#vs-app .ce-hero{text-align:left;padding:6px 0 40px;display:flex;flex-direction:column;'
   +   'justify-content:flex-end;min-height:calc(100svh - 130px);min-height:calc(100dvh - 130px)}'
   + '@media(max-width:860px){#vs-app .ce-hero{text-align:center}}'
   /* CREATE palette: the pink and violet of the backdrop art. */
   + '#vs-app .ce-hero h1{font-family:var(--fh,inherit);font-size:clamp(3.6rem,13vw,8rem);line-height:.88;'
   +   'letter-spacing:.04em;margin:0;background:linear-gradient(100deg,#FF2E88 18%,#A06BFF);'
   +   '-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;'
   +   'filter:drop-shadow(0 4px 26px rgba(0,0,0,.75))}'
   + '#vs-app .ce-stats{display:flex;justify-content:flex-start;gap:46px;margin-top:22px;flex-wrap:wrap}'
   + '@media(max-width:860px){#vs-app .ce-stats{justify-content:center}}'
   + '#vs-app .ce-stat b{font-family:var(--fh,inherit);font-size:clamp(2.4rem,6vw,3.6rem);letter-spacing:.02em;'
   +   'display:block;line-height:1;text-shadow:0 2px 18px rgba(0,0,0,.7)}'
   + '#vs-app .ce-stat span{display:block;font:800 .78rem Inter,sans-serif;letter-spacing:.18em;'
   +   'text-transform:uppercase;color:#d6c9e0;margin-top:5px;text-shadow:0 1px 8px rgba(0,0,0,.7)}'
   + '#vs-app .ce-stat.a b{color:#FF2E88}#vs-app .ce-stat.v b{color:#A06BFF}#vs-app .ce-stat.e b{color:#FF7AC8}'
   + '@media(max-width:600px){#vs-app .ce-stats{gap:26px}#vs-app .ce-stat b{font-size:2rem}'
   +   '#vs-app .ce-stat span{font-size:.68rem}}'
   /* Entry page: the submitted work sits in the locked flyer slot, and the vote actions take
      the place the buy button occupies on an event page. Two-copy image trick again so a
      submission that is not 2:3 is shown whole instead of centre-cropped. */
   + '#vs-app .cd-flyer-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;'
   +   'filter:blur(16px) brightness(.45) saturate(1.2);transform:scale(1.25);pointer-events:none}'
   + '#vs-app .cd-flyer-im{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}'
   + '#vs-app .cd-buyrow{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;width:100%;margin-top:10px}'
   + '#vs-app .cd-buyrow button{display:flex;flex-direction:column;align-items:center;gap:3px;'
   +   'padding:9px 2px;border-radius:10px;border:1px solid var(--vsl);background:rgba(255,255,255,.04);'
   +   'color:#cfd6e2;font:700 .55rem Inter,sans-serif;cursor:pointer}'
   + '#vs-app .cd-buyrow button.on{background:rgba(0,180,255,.16);border-color:rgba(0,180,255,.5);color:#fff}'
   + '#vs-app .cd-buyrow button:disabled{opacity:.45;cursor:default}'
   + '#vs-app .cd-buyrow .em{font-size:1rem;line-height:1}'
   /* The field grid inside the right column is denser than the browse grid — it sits in 2/3 of
      the width, so 240px cards would show barely two across. */
   + '#vs-app .cd-right .ce-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}'
   /* Measured 44px, not the 40 asked for: a global min-height:44px tap-target floor was winning.
      Released only where there is a mouse — on touch the 44px floor stays, because a 40px target
      is below the minimum comfortable tap size and this is the button that takes the money. */
   + '@media(hover:hover){#vs-app .cd-buy{min-height:40px}}'
   + '#vs-app .cd-right{min-width:0}'
   + '#vs-app .cd-org{display:flex;align-items:center;gap:10px;margin-bottom:12px}'
   + '#vs-app .cd-org .av{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#00b4ff,#a06bff);'
   +   'display:flex;align-items:center;justify-content:center;font:800 1rem Inter,sans-serif;color:#04121b}'
   + '#vs-app .cd-org b{color:#fff;font-size:.95rem}'
   + '#vs-app .cd-org .sub{color:#8b95a3;font-size:.78rem}'
   + '#vs-app .cd-title{font-family:var(--fs,inherit);font-size:2.1rem;line-height:1.12;color:#fff;margin:0 0 8px}'
   + '#vs-app .cd-when{color:#c8cedb;font-size:.95rem;margin-bottom:10px}'
   + '#vs-app .cd-people{margin:14px 0 4px}'
   + '#vs-app .cd-avs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:4px}'
   + '#vs-app .cd-avs::-webkit-scrollbar{display:none}'
   + '#vs-app .cd-av{flex:0 0 auto;width:42px;height:42px;border-radius:50%;background:#22202e center/cover no-repeat;'
   +   'border:1px solid rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;'
   +   'font:800 .85rem Inter,sans-serif;color:#9fb2c6}'
   + '#vs-app .cd-people-n{color:#8b95a3;font-size:.78rem;margin-top:6px}'
   + '#vs-app .cd-nopeople{color:#8b95a3;font-size:.82rem}'
   + '#vs-app .cd-feed{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}'
   + '#vs-app .cd-work{display:block;text-decoration:none;color:inherit}'
   + '#vs-app .cd-work .im{width:100%;aspect-ratio:1/1;border-radius:10px;background:#15131f center/cover no-repeat}'
   + '#vs-app .cd-work .tt{font-size:.84rem;color:#e8e6f2;margin-top:6px;line-height:1.25}'
   + '#vs-app .cd-work .by{font-size:.74rem;color:#8b95a3}'
   /* competition landing page (Founder 2026-08-18) */
   + '#vs-app .cd{max-width:760px;margin:0 auto}'
   + '#vs-app .cd-hero{margin-bottom:14px}'
   + '#vs-app .cd-cat{font:800 .68rem Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--vsb);margin-bottom:6px}'
   + '#vs-app .cd-pills{margin-top:8px}'
   + '#vs-app .cd-cta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:16px 0}'
   + '#vs-app .cd-sec{border-top:1px solid var(--vsl);padding:20px 0}'
   + '#vs-app .cd-sec h3{font:800 .72rem Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#8b95a3;margin:0 0 8px}'
   + '#vs-app .cd-sec p{color:#c8cedb;font-size:.93rem;line-height:1.6;margin:0}'
   + '#vs-app .cd-list{margin:0;padding-left:18px;color:#c8cedb;font-size:.9rem;line-height:1.7}'
   + '#vs-app .cd-time{display:grid;gap:6px}'
   + '#vs-app .cd-step{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:.88rem;color:#c8cedb}'
   + '#vs-app .cd-step b{color:#8b95a3;font-weight:700;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase}'
   /* competitions browser — month row + type row + card cover (Founder 2026-08-18) */
      /* LOCKED TO THE TOP WHEN SCROLLING (Founder 2026-08-20), same as the homepage filter bar.
      top:0 rather than an offset: the mobile shell has no fixed top bar, so an offset would
      leave a transparent strip that cards scroll through. */
   /* FULL-BLEED AND OPAQUE, matching /connect (Founder 2026-08-21). The bar breaks out of the
      1120px .wrap with a 50vw margin trick so it spans the viewport, and it is a SOLID colour —
      at 97% the pink backdrop still showed through it while the page scrolled underneath.
      The chip rows keep the page measure so they stay aligned with the competition grid. */
   + '#vs-app .ce-bar{display:flex;flex-direction:column;gap:7px;margin:0 0 16px;'
   +   'position:sticky;top:0;z-index:940;background:#0b0b12;'
   +   'padding-top:calc(8px + env(safe-area-inset-top,0px));padding-bottom:8px;'
   +   'width:100vw;margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);'
   +   'border-bottom:1px solid rgba(255,255,255,.06);box-shadow:0 10px 24px rgba(0,0,0,.45)}'
   + '#vs-app .ce-row{max-width:1120px;margin-left:auto;margin-right:auto;padding-left:16px;padding-right:16px;width:100%}'
   + '@media(min-width:861px){#vs-app .ce-bar{top:70px}}'
   + '#vs-app .ce-row{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}'
   + '#vs-app .ce-row::-webkit-scrollbar{display:none}'
   + '#vs-app .ce-chip{flex:0 0 auto;height:30px;padding:0 11px;border-radius:5px;cursor:pointer;white-space:nowrap;'
   +   'background:transparent;color:#8b95a3;border:1px solid rgba(255,255,255,.14);'
   +   'font:500 11px Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase}'
   + '#vs-app .ce-chip i{font-style:normal;opacity:.55;margin-left:5px}'
   + '#vs-app .ce-chip.on{background:rgba(0,180,255,.14);color:var(--vsb);border-color:rgba(0,180,255,.5)}'
   /* ── COMPETITION FLYER — mirrors #evx .evx-flyer in index.html ────────────────────────────
      Values copied from the homepage rules, not re-invented: 240px wide, 2:3, radius 14,
      1px white-8% border, lift-on-hover, and the same four-stop bottom shade. Mobile drops
      to 220px / radius 15 exactly as #evx does at 860px. Kept in sync by hand — see ceCard(). */
   + '#vs-app .ce-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:15px}'
   + '@media(max-width:860px){#vs-app .ce-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}}'
   + '#vs-app .ce-fly{position:relative;aspect-ratio:2/3;border-radius:14px;overflow:hidden;cursor:pointer;'
   +   'background:#15131f center/cover no-repeat;border:1px solid rgba(255,255,255,.08);'
   +   'transition:transform .25s,border-color .25s,box-shadow .25s}'
   + '#vs-app .ce-fly:hover{transform:translateY(-5px);border-color:rgba(0,255,136,.45);box-shadow:0 16px 44px rgba(0,0,0,.6)}'
   + '@media(max-width:860px){#vs-app .ce-fly{border-radius:15px}}'
   + '#vs-app .ce-fly-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;border:0;'
   +   'filter:blur(16px) brightness(.45) saturate(1.2);transform:scale(1.25);pointer-events:none}'
   + '#vs-app .ce-fly-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:0;border:0}'
   + '#vs-app .ce-shade{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,'
   +   'rgba(0,0,0,.02) 0%,rgba(0,0,0,.12) 40%,rgba(0,0,0,.8) 76%,rgba(0,0,0,.96) 100%)}'
   + '#vs-app .ce-badge{position:absolute;z-index:3;top:10px;right:10px;font:800 .5rem Inter,sans-serif;'
   +   'letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:11px;'
   +   'background:rgba(0,0,0,.62);color:#fff;border:1px solid rgba(255,255,255,.22);backdrop-filter:blur(4px)}'
   + '#vs-app .ce-fee{position:absolute;z-index:3;top:10px;left:10px;font:800 .5rem Inter,sans-serif;'
   +   'letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:11px;'
   +   'background:rgba(0,255,136,.92);color:#06120a;border:1px solid rgba(0,255,136,.5)}'
   + '#vs-app .ce-fee.paid{background:rgba(0,0,0,.62);color:#fff;border-color:rgba(255,255,255,.22);backdrop-filter:blur(4px)}'
   + '#vs-app .ce-mark{position:absolute;left:10px;bottom:10px;z-index:6;width:46px;height:31px;'
   +   'object-fit:contain;opacity:.92;filter:drop-shadow(0 1px 3px rgba(0,0,0,.85));pointer-events:none}'
   + '#vs-app .ce-body{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:13px 13px 14px}'
   + '#vs-app .ce-date{font:800 .6rem Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#00ff88;margin-bottom:4px}'
   + '#vs-app .ce-title{font-family:var(--fs,inherit);font-size:1.18rem;line-height:1;letter-spacing:.03em;color:#fff;'
   +   'margin-bottom:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'
   + '@media(max-width:860px){#vs-app .ce-title{font-size:15px;line-height:1.05}}'
   + '#vs-app .ce-meta{font-size:.63rem;color:rgba(255,255,255,.72);line-height:1.32;margin-bottom:10px;'
   +   'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'
   + '#vs-app .ce-foot{display:flex;align-items:center;justify-content:space-between;gap:6px}'
   + '#vs-app .ce-price{font:800 .7rem Inter,sans-serif;color:#fff;white-space:nowrap}'
   + '#vs-app .ce-cta{font:800 .54rem Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#06120a;'
   +   'background:#00ff88;padding:6px 11px;border-radius:5px;white-space:nowrap;flex-shrink:0}'
   + '#vs-app .ce-actions{position:absolute;left:0;right:0;bottom:0;z-index:4;display:flex;flex-direction:column;'
   +   'gap:6px;padding:12px;background:linear-gradient(0deg,rgba(0,0,0,.95),rgba(0,0,0,.78) 72%,transparent);'
   +   'transform:translateY(101%);transition:transform .25s ease,opacity .2s;opacity:0}'
   + '#vs-app .ce-fly:hover .ce-actions{transform:translateY(0);opacity:1}'
   + '#vs-app .ce-act{display:block;text-align:center;font:800 .62rem Inter,sans-serif;letter-spacing:.08em;'
   +   'text-transform:uppercase;padding:9px;border-radius:7px}'
   + '#vs-app .ce-act-enter{background:#00ff88;color:#06120a}'
   + '#vs-app .ce-act-info{background:rgba(0,180,255,.16);color:var(--vsb);border:1px solid rgba(0,180,255,.45)}'
   /* Touch devices have no hover, so the drawer can never open — hide it rather than leave a
      permanently invisible layer over the card swallowing taps. The whole card is tappable and
      the DETAILS chip already reads as the action, same as the homepage on mobile. */
   + '@media(hover:none){#vs-app .ce-actions{display:none}}'
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
    /* In-app nav retired 2026-08-05 (Founder): the /culture/vs vertical rail is the nav now
       (window.vsGo). Kept as a no-op so existing call sites need no change. */
    return '';
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
        /* JOIN is the default view now, so this only fires if someone asks for ?view=feed
           explicitly. Still routes to the competitions rather than a dead end — an empty feed
           with 36 live competitions elsewhere is a wrong answer, however you arrived at it. */
        return renderEnter();
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

  /* BACK GOES TO THE PROFILE'S EVENTS SECTION (Founder 2026-08-19), not to /create/?view=mine —
     that view is being retired because entries and tickets both live on the profile now.
     ME.user_metadata.handle is not guaranteed, so this resolves the slug at click time and falls
     back to /profile.html, which self-resolves for a signed-in user. A back button that lands
     nowhere is worse than no back button. */
  function backToProfileBtn(){
    return '<button type="button" class="vsp-join" id="vsBackProfile">‹ Back to my events</button>';
  }
  document.addEventListener('click', function(ev){
    var b = ev.target && ev.target.closest && ev.target.closest('#vsBackProfile');
    if(!b) return;
    ev.preventDefault();
    var go2 = function(slug){ location.href = slug ? ('/profile.html?slug='+encodeURIComponent(slug)+'&tab=tagged')
                                                   : '/profile.html?tab=tagged'; };
    try{
      SB.rpc('my_profile_slug').then(function(r){ go2(r && !r.error ? r.data : null); })
        .catch(function(){ go2(null); });
    }catch(e){ go2(null); }
  });

  /* ── ENTRY PAGE = COMPETITION PAGE TEMPLATE (Founder 2026-08-20) ─────────────────────────
     Same two-column shell as renderComp(), with two substitutions:
       LEFT  (locked, 1/3): the entrant's own submitted work in place of the competition flyer,
                            with the vote actions pinned beneath it exactly where the buy button
                            sits on an event page.
       RIGHT (scrolls, 2/3): the entry's details, then the FEED of every other approved entry in
                            the same competition — so a voter can work through the whole field
                            without going back to a grid and losing their place.
     Reuses the cd-* classes rather than inventing a parallel set: the locked-column behaviour,
     the scroll container and the mobile single-column collapse are already solved there, and a
     second implementation would drift from it. */
  function renderEntry(id){
    busy('Loading entry…');
    Promise.all([
      SB.from('vs_entries').select('*').eq('id', id).maybeSingle(),
      SB.rpc('vs_entry_totals', { p_entry: Number(id) }),
      ME ? SB.rpc('vs_my_progress', { p_entry: Number(id) }) : Promise.resolve({ data: null })
    ]).then(function(res){
      var e = res[0].data, totals = res[1].data || {}, prog = res[2].data || {};
      if(!e){ empty('Entry not found', 'It may have been withdrawn.'); return; }

      /* UNAPPROVED ENTRIES ARE NOT PUBLIC. The owner sees their own; nobody else does until a
         human approves it. Kept from the 2026-08-19 fix — this view used to render the full
         voting UI for any id, including drafts. */
      var isOwner = !!(ME && e.creator_user_id && ME.id === e.creator_user_id);
      if(e.status !== 'approved'){
        if(!isOwner){
          empty('Not available', 'This entry has not been approved for public voting yet.');
          return;
        }
        APP.innerHTML = navBar('mine')
          + '<div class="soon"><div class="i">🕓</div><h2>'+h(e.title||'Your entry')+'</h2>'
          + '<p>Status: <b>'+h(e.status)+'</b>'+(e.entitlement?' · entry paid':'')+'.<br>'
          + 'It becomes public and votable once the review team approves it.</p>'
          + (e.admin_message ? '<p class="vs-note">'+h(e.admin_message)+'</p>' : '')
          + '<p>'+backToProfileBtn()+'</p></div>';
        return;
      }

      return Promise.all([
        SB.from('vs_competitions').select('id,title,vote_display_mode,voting_closes_at,status,results_locked_at')
          .eq('id', e.competition_id).maybeSingle(),
        /* The rest of the field. Approved only — the same gate the single entry passes. */
        SB.from('vs_entries')
          .select('id,title,thumb_url,creator_handle,status')
          .eq('competition_id', e.competition_id).eq('status','approved')
          .order('submitted_at', { ascending:false }).limit(60)
      ]).then(function(rs){
        var c = (rs[0] && rs[0].data) || {};
        var field = ((rs[1] && rs[1].data) || []).filter(function(x){ return String(x.id) !== String(id); });
        var open = c.status !== 'closed' && !c.results_locked_at &&
                   (!c.voting_closes_at || new Date(c.voting_closes_at) > new Date());
        var blind = c.vote_display_mode === 'blind' && open;
        var used = prog.used || 0;

        /* LEFT — the work itself, locked. Blurred backdrop + contained image so a submission
           that is not 2:3 is shown whole rather than centre-cropped. */
        var art = e.thumb_url
          ? '<img class="cd-flyer-bg" src="'+h(e.thumb_url)+'" alt="" aria-hidden="true">'
            + '<img class="cd-flyer-im" src="'+h(e.thumb_url)+'" alt="'+h(e.title||'')+'">'
          : '<div class="cd-flyer-gen"><span class="cat">'+h(c.title||'CREATE')+'</span>'
            + '<span class="ttl">'+h(e.title||'Untitled')+'</span></div>';

        var left = '<div class="cd-stick">'
          + '<div class="cd-flyer" style="position:relative;overflow:hidden">'+art+'</div>'
          + '<div class="vs-votes cd-buyrow" id="vsVotes">'
          +   ACTIONS.map(function(a){
                var on = !!prog[a[0]];
                return '<button data-a="'+a[0]+'" class="'+(on?'on':'')+'"'
                  + (!ME || !open ? ' disabled' : '')
                  + ' aria-pressed="'+(on?'true':'false')+'">'
                  + '<span class="em" aria-hidden="true">'+a[1]+'</span>'
                  + '<span>'+a[2]+(on?' ✓':'')+'</span></button>';
              }).join('')
          + '</div>'
          + '<div class="vs-note" id="vsProg" style="text-align:center">Your votes: '+used+' of 5 · '
          +   (ME ? 'each action counts once' : 'sign in to vote') + '</div>'
          + '</div>';

        /* RIGHT — details, then the rest of the field. */
        var right = ''
          + '<div class="cd-org"><div class="av"></div><div><b>'+h(e.creator_handle?('@'+e.creator_handle):'Entrant')+'</b>'
          +   '<div class="vs-note" style="margin:0">'+h(c.title||'')+'</div></div></div>'
          + '<h1 class="cd-title">'+h(e.title||'Untitled')+'</h1>'
          + '<div style="margin:0 0 12px"><span class="vs-pill '+(open?'ok':'')+'">'
          +   (open?'Voting open':'Voting closed')+'</span></div>'
          + (e.description ? '<div class="cd-sec"><h3>About this entry</h3><p>'+h(e.description)+'</p></div>' : '')
          + (e.creator_statement ? '<div class="cd-sec"><h3>Creator statement</h3><p>'+h(e.creator_statement)+'</p></div>' : '')
          + (e.tools ? '<div class="cd-sec"><h3>Tools</h3><p>'+h(e.tools)+'</p></div>' : '')
          + (e.ai_disclosure ? '<div class="cd-sec"><h3>AI disclosure</h3><p>'+h(e.ai_disclosure)+'</p></div>' : '')
          + '<div class="cd-sec"><h3>Votes</h3><p>'
          +   (blind ? 'Totals are hidden until winners are announced.'
                     : 'Total <b>'+(totals.total||0)+'</b> — like '+(totals.like||0)
                       +' · comment '+(totals.comment||0)+' · repost '+(totals.repost||0)
                       +' · share '+(totals.share||0)+' · save '+(totals.save||0))
          + '</p></div>'
          + '<div class="cd-sec"><h3>All submitted work'+(field.length?' ('+field.length+')':'')+'</h3>'
          +   (field.length
                ? '<div class="ce-grid">'+field.map(function(x){
                     return '<div class="ce-fly" data-entry="'+x.id+'">'
                       + (x.thumb_url
                           ? '<img class="ce-fly-bg" src="'+h(x.thumb_url)+'" alt="" aria-hidden="true" loading="lazy">'
                             +'<img class="ce-fly-img" src="'+h(x.thumb_url)+'" alt="'+h(x.title||'')+'" loading="lazy">'
                           : '')
                       + '<div class="ce-shade"></div>'
                       + '<div class="ce-body"><div class="ce-title">'+h(x.title||'Untitled')+'</div>'
                       +   '<div class="ce-meta">'+h(x.creator_handle?('@'+x.creator_handle):'')+'</div>'
                       +   '<div class="ce-foot"><span class="ce-price"></span><span class="ce-cta">View</span></div>'
                       + '</div></div>';
                   }).join('')+'</div>'
                : '<p>No other approved entries yet — this is the first.</p>')
          + '</div>';

        APP.innerHTML = navBar('feed')
          + '<div style="max-width:1120px;margin:0 auto 10px">'+backToProfileBtn()+'</div>'
          + '<div class="cd2"><div class="cd-left">'+left+'</div>'
          + '<div class="cd-right">'+right+'</div></div>';

        [].forEach.call(APP.querySelectorAll('[data-entry]'), function(el){
          el.onclick = function(){ go({ view:'entry', e: el.dataset.entry }); };
        });
        bindVotes(id, open);
      });
    }).catch(err);
  }

  function bindVotes(entryId, open){
    var box = document.getElementById('vsVotes'); if(!box) return;
    box.addEventListener('click', function(ev){
      var b = ev.target.closest('button'); if(!b || b.disabled) return;
      var action = b.dataset.a;
      if(!ME){ location.href = '/apply.html'; return; }
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
    if(!ME){ APP.innerHTML = navBar('mine') + '<div class="soon"><div class="i">🔐</div><h2>Sign in</h2><p>Your VS entries live here.</p><a class="vs-cta" href="/apply.html">Sign in</a></div>'; return; }
    /* RETIRED AS A DESTINATION (Founder 2026-08-19: "page is not needed since everything will be
       on the users profile page under events"). It REDIRECTS rather than 404s, because this is
       still Stripe's success_url — a buyer returning from checkout must never land on a dead page,
       and that exact failure already happened once today with /v31/vs.html.
       If the slug cannot be resolved we fall through and render the list rather than stranding
       a paid entrant on a blank page. */
    if(!window.__vsMineRedirected){
      window.__vsMineRedirected = 1;
      try{
        SB.rpc('my_profile_slug').then(function(r){
          var slug = (r && !r.error) ? r.data : null;
          if(slug){ location.replace('/profile.html?slug='+encodeURIComponent(slug)+'&tab=tagged'); }
          else { renderMine(); }                      // no slug → show the list rather than strand
        }).catch(function(){ renderMine(); });
        return;
      }catch(e){ /* fall through to the list */ }
    }
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
    if(!ME){ APP.innerHTML = navBar('votes') + '<div class="soon"><div class="i">🔐</div><h2>Sign in</h2><p>Your voting history lives here.</p><a class="vs-cta" href="/apply.html">Sign in</a></div>'; return; }
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
    /* definer RPC, not a direct select: drafts are invisible to a client SELECT by design,
       which is exactly what dead-ended the admin at "Create as draft" (handoff #54). */
    SB.rpc('vs_admin_competitions').then(function(r){
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
        if(p){ SB.rpc('vs_publish_competition', { p_comp: Number(p.dataset.pub) })
                 .then(function(r){ if(r.error) throw r.error; renderAdmin(); })
                 .catch(function(e){ alert(String(e && e.message || e)); }); }
      });

      /* same reason: submitted/under_review entries are not client-readable, so the queue
         was always empty. Definer RPC returns them for admins only. */
      SB.rpc('vs_admin_review_queue')
        .then(function(qr){
          var rows = qr.data || [], box = document.getElementById('vsQueue'); if(!box) return;
          box.innerHTML = rows.length
            ? rows.map(function(x){
                return '<div style="display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--vsl)">'
                  + '<div style="flex:1"><b>'+h(x.title)+'</b><div class="vs-note">@'+h(x.creator_handle||'')+'</div></div>'
                  + '<button class="vs-pill ok" data-ok="'+x.entry_id+'">Approve</button>'
                  + '<button class="vs-pill warn" data-no="'+x.entry_id+'">Reject</button></div>';
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

  /* ── ENTER A COMPETITION (§8, §25, §27) ────────────────────────────────────────────
     Self-serve path: pick an open competition -> read rules + accept terms -> free comps
     grant the entitlement directly / paid comps go through the vs_entry checkout branch ->
     fill the form + upload media -> submit for review. Every gate is re-checked server-side;
     this screen only collects. */
  /* ── COMPETITIONS BROWSER (Founder 2026-08-18) ────────────────────────────────────────────
     Modelled on the homepage events calendar: a month row, a type filter, and a card grid.
     TWO THINGS DIFFER FROM EVENTS, deliberately:
       · A competition has no single date — it has a submissions DEADLINE. The month row is
         therefore keyed on submissions_close_at ("closing in OCT"), not a start date. Anything
         with no deadline is grouped under ALL and never invents a month.
       · Type comes from the competition CATEGORY (27 of them across 36 competitions). Both the
         month list and the type list are built from the rows actually returned, so neither can
         offer a filter that yields nothing. */
  var CE_MONTH='all', CE_TYPE='all', CE_ROWS=null;

  function ceMonthKey(c){ return c.submissions_close_at ? String(c.submissions_close_at).slice(0,7) : ''; }
  function ceMonthLabel(mk){
    var M=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return M[parseInt(mk.slice(5,7),10)-1] + ' ' + mk.slice(0,4);
  }
  function ceMatch(c){
    if(CE_MONTH!=='all' && ceMonthKey(c)!==CE_MONTH) return false;
    if(CE_TYPE!=='all'  && (c.category||'')!==CE_TYPE) return false;
    return true;
  }
  /* ── COMPETITION CARD = HOMEPAGE EVENT CARD ───────────────────────────────────────────────
     Founder 2026-08-19: "the event cards are not the same setup and design as the homepage."
     They were a different component entirely — landscape cover, white body panel, pill row.
     This is now a structural clone of flyer() in index.html: same 240px / 2:3 frame, same
     blurred-backdrop + contained-image pair, same corner badge, same bottom gradient with
     date / title / meta / price+CTA, same hover action drawer.
     Class names are ce-* rather than evx-* on purpose: /create does not load the homepage's
     #evx stylesheet, so the rules are duplicated below under #vs-app. If the homepage card
     changes, BOTH have to change — that is the cost of the two pages not sharing a stylesheet. */
  function ceCard(c){
    var fee    = c.entry_fee_cents ? '$' + (c.entry_fee_cents/100).toFixed(2) : 'Free';
    var closes = c.submissions_close_at
      ? 'Closes ' + new Date(c.submissions_close_at).toLocaleDateString(undefined,
          {weekday:'short', month:'short', day:'numeric'}).toUpperCase().replace(',','') + ''
      : 'Open — no deadline';
    var n   = Number(c.entry_count || 0);
    var meta = (c.category ? c.category + ' · ' : '') + (n === 1 ? '1 entry' : n + ' entries');
    var alt = h(c.title + ' — ' + (c.category || 'KEEPITIL') + ' competition cover');

    /* Same two-copy trick as the homepage: a blurred fill behind, the real art contained on
       top, so a cover that is not exactly 2:3 is never centre-cropped. */
    var im = c.cover_url
      ? '<img class="ce-fly-bg" src="'+h(c.cover_url)+'" alt="" aria-hidden="true" loading="lazy" decoding="async"/>'
        + '<img class="ce-fly-img" src="'+h(c.cover_url)+'" alt="'+alt+'" loading="lazy" decoding="async"/>'
      : '';

    return '<div class="ce-fly" data-enter="'+c.id+'" data-title="'+h(c.title)+'">'
      + im + '<div class="ce-shade"></div>'
      + '<span class="ce-badge">'+h((c.category || 'KEEPITIL').slice(0,22))+'</span>'
      /* Fee reads top-LEFT, opposite the category badge. It cannot live in the footer next to
         the brand mark — the mark is 46px wide at bottom-left and "$10.00" printed straight
         through it. The homepage only avoids that collision because its price field is
         usually empty; every competition has a fee, so it needs its own corner. */
      + '<span class="ce-fee'+(c.entry_fee_cents ? ' paid' : '')+'">'+h(fee)+'</span>'
      /* Brand mark only — the homepage's bottom-left glyph is a working Save button, and
         competitions have no save endpoint. Rendering a button that does nothing is worse
         than rendering none, so this is a plain image. */
      + '<img class="ce-mark" src="https://keepitil.com/keepitil-x-green.png" alt="" aria-hidden="true" loading="lazy"/>'
      + '<div class="ce-body">'
      +   '<div class="ce-date">'+h(closes)+'</div>'
      +   '<div class="ce-title">'+h(c.title)+'</div>'
      +   '<div class="ce-meta">🏆 '+h(meta)+'</div>'
      +   '<div class="ce-foot"><span class="ce-price"></span>'
      +     '<span class="ce-cta">Details</span></div>'
      + '</div>'
      + '<div class="ce-actions">'
      +   '<span class="ce-act ce-act-enter">🎟 Enter Competition</span>'
      +   '<span class="ce-act ce-act-info">ℹ️ Rules &amp; Prizes</span>'
      + '</div></div>';
  }
  function ceRender(){
    var rows=CE_ROWS||[];
    /* Counts ignore the OTHER filter's own value so a filter never hides its alternatives —
       same rule as the homepage location dropdown. */
    var months={}, types={};
    rows.forEach(function(c){
      var mk=ceMonthKey(c);
      if(mk && (CE_TYPE==='all' || (c.category||'')===CE_TYPE)) months[mk]=(months[mk]||0)+1;
      var t=c.category||'';
      if(t && (CE_MONTH==='all' || ceMonthKey(c)===CE_MONTH)) types[t]=(types[t]||0)+1;
    });
    var mKeys=Object.keys(months).sort();
    var tKeys=Object.keys(types).sort(function(a,b){ return types[b]-types[a] || a.localeCompare(b); });
    var shown=rows.filter(ceMatch);

    var html='<div class="ce-bar">'
      + '<div class="ce-row">'
        /* Founder 2026-08-20: "Remove ALL, just use DATE and TYPE." The reset chip keeps its
           job — it clears the filter — but it is labelled for the axis it controls, not with a
           second word that repeated what the row already was. */
        + '<button class="ce-chip'+(CE_MONTH==='all'?' on':'')+'" data-m="all">DATE</button>'
        + mKeys.map(function(mk){ return '<button class="ce-chip'+(CE_MONTH===mk?' on':'')+'" data-m="'+mk+'">'
            + ceMonthLabel(mk)+' <i>'+months[mk]+'</i></button>'; }).join('')
      + '</div>'
      + '<div class="ce-row">'
        + '<button class="ce-chip'+(CE_TYPE==='all'?' on':'')+'" data-t="all">TYPE</button>'
        + tKeys.map(function(t){ return '<button class="ce-chip'+(CE_TYPE===t?' on':'')+'" data-t="'+h(t)+'">'
            + h(t)+' <i>'+types[t]+'</i></button>'; }).join('')
      + '</div></div>';

    html += shown.length
      ? '<div class="ce-grid">'+shown.map(ceCard).join('')+'</div>'
      : '<div class="soon"><div class="i">🔎</div><h2>Nothing matches those filters</h2>'
        + '<p>Try a different month or type — there are '+rows.length+' competitions open.</p></div>';

    /* HEADER (Founder 2026-08-21): the Connect page's stat row, not a sentence. "7 of 7
       competitions — pick one to read its rules and enter" restated what the grid underneath
       already showed. h1, not h2 — the page-level <h1>CREATE</h1> hero was removed 2026-08-19,
       so this view is the top of the document outline. */
    APP.innerHTML = navBar('enter')
      + '<header class="ce-hero"><h1>CREATE</h1>'
      + '<div class="ce-stats">'
      +   '<div class="ce-stat a"><b id="ceA">—</b><span>Artist</span></div>'
      +   '<div class="ce-stat v"><b id="ceV">—</b><span>Vs</span></div>'
      +   '<div class="ce-stat e"><b id="ceE">—</b><span>Entry</span></div>'
      + '</div></header>'
      + html;

    /* Counts are fetched, never derived from what is on screen — a filtered grid would otherwise
       silently report a smaller platform than the one that exists. */
    SB.rpc('create_page_stats').then(function(sr){
      var s = (sr && sr.data && (Array.isArray(sr.data) ? sr.data[0] : sr.data)) || null;
      if(!s) return;
      var set = function(id,n){ var el=document.getElementById(id); if(el) el.textContent = fmtN(n); };
      set('ceA', s.artists); set('ceV', s.vs); set('ceE', s.entries);
    }).catch(function(){});

    APP.querySelectorAll('[data-m]').forEach(function(b){
      b.onclick=function(){ CE_MONTH=b.dataset.m; ceRender(); };
    });
    APP.querySelectorAll('[data-t]').forEach(function(b){
      b.onclick=function(){ CE_TYPE=b.dataset.t; ceRender(); };
    });
    APP.querySelectorAll('[data-enter]').forEach(function(el){
      el.onclick=function(){ go({view:'enter', c: el.dataset.enter}); };
    });
  }

  function renderEnter(compId){
    /* The sign-in gate used to sit HERE, hiding the whole list from anyone logged out.
       vs_open_competitions() is anon-readable — verified, 36 rows — so a public list sat behind
       a login and a visitor saw "sign in" where they should have seen 36 things to enter. The
       gate now lives on renderEntryForm. Browse freely, sign in to submit. */
    if(compId) return renderComp(Number(compId));   /* landing page, not the form */

    if(CE_ROWS){ return ceRender(); }          /* filters re-render without refetching */
    busy('Loading open competitions…');
    SB.rpc('vs_open_competitions').then(function(r){
      if(r.error) throw r.error;
      CE_ROWS = r.data || [];
      if(!CE_ROWS.length){
        APP.innerHTML = navBar('enter')
          + '<div class="soon"><div class="i">📥</div><h2>Nothing open right now</h2>'
          + '<p>No competition is accepting entries at the moment. Check back soon.</p></div>';
        return;
      }
      ceRender();
    }).catch(err);
  }

  /* ── COMPETITION LANDING PAGE (Founder 2026-08-18) ───────────────────────────────────
     Clicking a competition used to drop you straight into a bare upload form — the entry form
     WAS the landing page. This is the Eventbrite/Posh order instead: show what it is, what you
     can win, what the deadlines are and what to upload; ask for the entry last.
     Every block renders only if the underlying field exists — 10 of 36 competitions carry rules,
     prizes and upload specs, so a section that would be empty is omitted rather than shown blank. */
  function fmtD(d){
    if(!d) return '';
    try{ return new Date(d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
    catch(e){ return String(d).slice(0,10); }
  }
  function daysLeft(d){
    if(!d) return null;
    var ms = Date.parse(d) - Date.now();
    if(isNaN(ms) || ms < 0) return null;
    return Math.ceil(ms/86400000);
  }
  function prizeLines(p){
    if(!p || typeof p!=='object') return [];
    var out=[];
    if(p.monthly_finalists) out.push(p.monthly_finalists+' monthly finalists advance');
    if(p.quarterly_winners) out.push(p.quarterly_winners+' quarterly winner'+(p.quarterly_winners>1?'s':''));
    if(p.annual_champion)   out.push('Annual champion title');
    if(p.badge)             out.push('Winner badge on your profile');
    if(p.cash_cents)        out.push('$'+(p.cash_cents/100).toFixed(2)+' cash prize');
    if(p.note)              out.push(p.note);
    return out;
  }
  function uploadLines(u){
    if(!u || typeof u!=='object') return [];
    var out=[];
    if(Array.isArray(u.accept) && u.accept.length) out.push('Accepted formats: '+u.accept.join(', ').toUpperCase());
    if(u.max_files)     out.push('Up to '+u.max_files+' file'+(u.max_files>1?'s':''));
    if(u.max_file_mb)   out.push('Max '+u.max_file_mb+'MB per file');
    if(u.min_audio_sec && u.max_audio_sec)
      out.push('Length '+Math.round(u.min_audio_sec/60)+'–'+Math.round(u.max_audio_sec/60)+' minutes');
    if(u.require_thumb) out.push('Cover image required');
    return out;
  }
  function renderComp(compId){
    busy('Loading competition…');
    Promise.all([
      SB.rpc('vs_open_competitions'),
      /* Promise.resolve() FIRST: SB.rpc() returns a Postgrest builder, which is thenable but
         has no .catch — calling .catch on it throws synchronously and the page never leaves
         "Loading competition…". A failed feed must degrade to an empty list, never take the
         whole page down with it. */
      Promise.resolve(SB.rpc('vs_feed',{p_sort:'new',p_limit:24})).catch(function(){ return {data:[]}; })
    ]).then(function(res){
      var r=res[0], feed=(res[1]&&res[1].data)||[];
      if(r.error) throw r.error;
      var c = (r.data||[]).filter(function(x){ return x.id===compId; })[0];
      if(!c){ empty('Not open for entries','This competition is closed or unavailable.'); return; }
      var mine = feed.filter(function(f){ return f.competition_title===c.title; });

      var paid = c.entry_fee_cents > 0;
      var dl   = daysLeft(c.submissions_close_at);
      var cta  = '<button type="button" class="vs-cta cd-buy" id="cd-go">'
               + (paid ? 'Enter — $'+(c.entry_fee_cents/100).toFixed(2) : 'Enter this competition')+'</button>';

      /* LEFT — flyer + action button, locked. A real cover_url wins; otherwise a DESIGNED panel
         built from the category and title, never a stock placeholder. */
      var flyer = c.cover_url
        ? '<div class="cd-flyer" style="background-image:url('+h(c.cover_url)+')"></div>'
        : '<div class="cd-flyer cd-flyer-gen"><span class="cat">'+h(c.category||'CREATE')+'</span>'
          + '<span class="ttl">'+h(c.title)+'</span>'
          + (c.submissions_close_at?'<span class="dt">Closes '+h(fmtD(c.submissions_close_at))+'</span>':'')
          + '</div>';
      var left = '<aside class="cd-left"><div class="cd-stick">'+flyer+cta+'</div></aside>';

      /* RIGHT — single scrolling column, in the order specified */
      var right = '<div class="cd-right">';

      /* 1 organizer */
      right += '<div class="cd-org"><span class="av">K</span><div><b>KEEPITIL</b>'
             + '<div class="sub">Competition organizer</div></div></div>';
      /* 2 title */
      right += '<h1 class="cd-title">'+h(c.title)+'</h1>';
      /* 3 start / end */
      var span = [c.submissions_open_at?('Opens '+fmtD(c.submissions_open_at)):'',
                  c.submissions_close_at?('Closes '+fmtD(c.submissions_close_at)):'']
                 .filter(Boolean).join(' — ');
      right += '<div class="cd-when">'+h(span)+'</div>'
             + '<div class="cd-pills">'
             + '<span class="vs-pill '+(paid?'':'ok')+'">'+(paid?('$'+(c.entry_fee_cents/100).toFixed(2)+' entry'):'Free to enter')+'</span>'
             + (dl!==null?'<span class="vs-pill warn">'+dl+' day'+(dl===1?'':'s')+' left</span>':'')
             + '</div>';
      /* 4 voters — profile images, one scrollable row */
      right += '<div class="cd-people" id="cd-people"></div>';
      /* 5 about */
      if(c.description) right += '<div class="cd-sec"><h3>About this competition</h3><p>'+h(c.description)+'</p></div>';
      /* key dates + rules + prizes + what to submit + judging */
      var tl='';
      function step(l,d){ if(d) tl+='<div class="cd-step"><b>'+l+'</b><span>'+h(fmtD(d))+'</span></div>'; }
      step('Submissions open',c.submissions_open_at); step('Submissions close',c.submissions_close_at);
      step('Voting opens',c.voting_opens_at);         step('Voting closes',c.voting_closes_at);
      if(tl) right += '<div class="cd-sec"><h3>Key dates</h3><div class="cd-time">'+tl+'</div></div>';
      var pl=prizeLines(c.prize_structure);
      if(pl.length) right += '<div class="cd-sec"><h3>Prizes</h3><ul class="cd-list">'+pl.map(function(x){return '<li>'+h(x)+'</li>';}).join('')+'</ul></div>';
      var ul=uploadLines(c.upload_settings);
      if(c.requirements||ul.length) right += '<div class="cd-sec"><h3>What to submit</h3>'
        + (c.requirements?'<p>'+h(c.requirements)+'</p>':'')
        + (ul.length?'<ul class="cd-list">'+ul.map(function(x){return '<li>'+h(x)+'</li>';}).join('')+'</ul>':'')+'</div>';
      if(c.rules) right += '<div class="cd-sec"><h3>Rules</h3><p style="white-space:pre-wrap">'+h(c.rules)+'</p></div>';
      var judge='';
      if(c.winner_method==='public_vote') judge='Winners are decided by public vote.';
      else if(c.winner_method) judge='Winner method: '+c.winner_method.replace(/_/g,' ')+'.';
      if(c.vote_display_mode==='blind') judge+=' Vote totals stay hidden until winners are announced.';
      else if(c.vote_display_mode==='transparent') judge+=' Vote totals are visible throughout.';
      if(judge) right += '<div class="cd-sec"><h3>How judging works</h3><p>'+h(judge)+'</p></div>';

      /* 6 LOCATION — omitted on purpose. A competition is online; it has no venue column, and an
         invented address is worse than no map. The block belongs to KEEPITIL-hosted EVENTS. */
      right += '<div class="cd-sec"><h3>Where</h3><p>Online — enter from anywhere.</p></div>';

      /* 7 FEED — competitor submitted work */
      right += '<div class="cd-sec"><h3>Submitted work</h3>'
        + (mine.length
            ? '<div class="cd-feed">'+mine.map(function(f){
                return '<a class="cd-work" href="?view=entry&e='+f.entry_id+'">'
                  + '<div class="im"'+(f.thumb_url?(' style="background-image:url('+h(f.thumb_url)+')"'):'')+'></div>'
                  + '<div class="tt">'+h(f.title)+'</div>'
                  + '<div class="by">'+(f.creator_handle?('@'+h(f.creator_handle)):'Creator')+'</div></a>';
              }).join('')+'</div>'
            : '<p class="vs-note">No entries yet — be the first. Submitted work appears here as it is approved.</p>')
        + '</div>';
      right += '</div>';

      APP.innerHTML = '<div class="cd2">'+left+right+'</div>';

      /* voters row: profile images of people who have voted in this competition */
      SB.rpc('vs_competition_voters',{p_comp:compId}).then(function(vr){
        var box=document.getElementById('cd-people'); if(!box) return;
        var people=(vr&&vr.data)||[];
        if(!people.length){ box.innerHTML='<div class="cd-nopeople">No votes yet — voting opens '
          + h(fmtD(c.voting_opens_at))+'.</div>'; return; }
        box.innerHTML='<div class="cd-avs">'+people.map(function(u){
          var init=(u.handle||'?').slice(0,1).toUpperCase();
          return '<span class="cd-av"'+(u.avatar_url?(' style="background-image:url('+h(u.avatar_url)+')"'):'')+'>'
               + (u.avatar_url?'':h(init))+'</span>';
        }).join('')+'</div><div class="cd-people-n">'+people.length+' voting</div>';
      }).catch(function(){});

      var goBtn=document.getElementById('cd-go');
      if(goBtn) goBtn.onclick=function(){ go({view:'submit', c:compId}); };
    }).catch(err);
  }

  function renderEntryForm(compId){
    /* The gate moved here from renderEnter (2026-08-18) — submitting needs an account, browsing
       does not. Kept BEFORE the fetch so a signed-out user is not made to wait for a form they
       cannot use. */
    if(!ME){
      APP.innerHTML = navBar('enter')
        + '<div class="soon"><div class="i">🔐</div><h2>Sign in to enter</h2>'
        + '<p>You can browse every competition without an account — you just need one to submit an entry.</p>'
        + '<a class="vs-cta" href="/apply.html">Sign in</a>'
        + '<p><button type="button" class="vsp-join" data-nav="enter">‹ Back to competitions</button></p></div>';
      return;
    }
    busy('Loading competition…');
    SB.rpc('vs_open_competitions').then(function(r){
      var comp = (r.data || []).filter(function(c){ return c.id === compId; })[0];
      if(!comp){ empty('Not open for entries', 'This competition is closed or unavailable.'); return; }
      var paid = comp.entry_fee_cents > 0;

      /* TEMPLATE (Founder 2026-08-21): the submit page now uses the same two-column shell as the
         competition page and the entry page. LEFT = two upload slots (the work, then the cover).
         RIGHT = the information section. The rules and requirements are NOT repeated here — the
         competitor just read them on the competition page they clicked through from. */

      /* LEFT — slot 1: the work itself. Preview is by file type: video and audio play in place,
         an image shows, and a manuscript (Short Story) shows its file name, because there is
         nothing to render and a blank grey box would read as a failed upload. */
      var slotWork = '<div class="sf-slot">'
        + '<div class="sf-cap">Your work <b id="sfWorkReq">*</b></div>'
        + '<label class="cd-flyer sf-drop" id="sfWorkBox" for="sfWork">'
        +   '<div class="sf-ph"><span class="ic">＋</span><span>Add your submission</span>'
        +   '<small>Image, video, audio or manuscript · 500MB max</small></div>'
        + '</label>'
        + '<input id="sfWork" type="file" multiple class="sf-file" '
        +   'accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.rtf,.txt,.md,.epub">'
        + '</div>';

      /* LEFT — slot 2: the cover. Separate from the work on purpose: a video or a manuscript has
         no still image to show in the feed, and the competition rules require a 2:3 cover. */
      var slotCover = '<div class="sf-slot">'
        + '<div class="sf-cap">Cover image</div>'
        + '<label class="cd-flyer sf-drop" id="sfCoverBox" for="sfCover">'
        +   '<div class="sf-ph"><span class="ic">＋</span><span>Add a cover</span>'
        +   '<small>2:3 image — how your entry appears in the feed</small></div>'
        + '</label>'
        + '<input id="sfCover" type="file" class="sf-file" accept="image/*">'
        + '</div>';

      /* Cover FIRST, work second (Founder 2026-08-21, mobile order). Mobile collapses cd2 to one
         column in DOM order, so the DOM order IS the mobile order — no CSS reordering needed and
         nothing to keep in sync between breakpoints. */
      var left = '<aside class="cd-left"><div class="cd-stick">'
        + slotCover + slotWork
        + '</div></aside>';

      /* RIGHT — the information section. */
      var right = '<div class="cd-right">'
        + '<button type="button" class="vs-pill sf-back" id="sfBack">‹ Back</button>'
        + '<h1 class="cd-title">'+h(comp.title)+'</h1>'
        + '<div class="cd-pills">'
        +   '<span class="vs-pill '+(paid?'':'ok')+'">'
        +   (paid?('$'+(comp.entry_fee_cents/100).toFixed(2)+' entry'):'Free to enter')+'</span>'
        +   (comp.submissions_close_at?'<span class="vs-pill warn">Closes '+h(fmtD(comp.submissions_close_at))+'</span>':'')
        + '</div>'
        + '<div class="vs-form">'
        + '<label>Entry title *</label><input id="eTitle" maxlength="120" placeholder="Name your entry">'
        + '<label>Description</label><textarea id="eDesc" rows="3"></textarea>'
        + '<label>Creator statement</label><textarea id="eStmt" rows="2" placeholder="What is this piece about?"></textarea>'
        + '<label>Tools / software</label><input id="eTools" maxlength="160">'
        + '<label>AI disclosure</label><input id="eAI" maxlength="160" placeholder="Describe any AI use, if required by the rules">'
        + '<label>Collaborators</label><input id="eCollab" maxlength="160">'
        + '<label style="display:flex;gap:9px;align-items:flex-start;text-transform:none;letter-spacing:0;color:#cfd3df;font-weight:500">'
        + '<input type="checkbox" id="eTerms" style="width:auto;margin-top:3px">'
        + '<span>I own this work or have permission to submit it, I accept the competition rules and terms'
        + (paid ? ', and I understand the entry fee is governed by the published refund policy' : '')
        + '.</span></label>'
        /* The submit button belongs at the END of the information section, not in the upload
           column (Founder 2026-08-21: "there is no submission of entry at the end of the
           description section"). It was the last thing in the left column, so on mobile it
           appeared BEFORE the form you have to fill in, and on desktop it sat in a column you
           had already finished with. */
        + '<button class="vs-cta cd-buy sf-go" id="eGo">'+(paid ? 'Continue to payment' : 'Submit entry')+'</button>'
        + '<p class="vs-note" id="eMsg"></p>'
        + '</div></div>';

      APP.innerHTML = navBar('enter') + '<div class="cd2 cd2-sub">'+left+right+'</div>';

      /* Back goes to the page you came from. Falls back to this competition rather than the list,
         because arriving here by a shared link and being sent to "all competitions" loses the
         competition you were actually looking at. */
      document.getElementById('sfBack').onclick = function(){
        if(history.length > 1){ history.back(); return; }
        go({ view:'enter', c: compId });
      };

      var picked = [], coverFile = null;

      function isDoc(f){ return !/^(image|video|audio)\//.test(f.type || ''); }
      function paintWork(){
        var box = document.getElementById('sfWorkBox');
        if(!box) return;
        if(!picked.length){
          box.className = 'cd-flyer sf-drop';
          box.innerHTML = '<div class="sf-ph"><span class="ic">＋</span><span>Add your submission</span>'
            + '<small>Image, video, audio or manuscript · 500MB max</small></div>';
          return;
        }
        var f = picked[0], url = URL.createObjectURL(f), inner;
        if(/^video\//.test(f.type))      inner = '<video class="sf-media" src="'+url+'" controls playsinline></video>';
        else if(/^image\//.test(f.type)) inner = '<img class="sf-media" src="'+url+'" alt="">';
        else if(/^audio\//.test(f.type)) inner = '<div class="sf-doc"><span class="ic">♫</span>'
                                               + '<b>'+h(f.name)+'</b><audio src="'+url+'" controls></audio></div>';
        else                             inner = '<div class="sf-doc"><span class="ic">📄</span><b>'+h(f.name)+'</b>'
                                               + '<small>'+(f.size/1048576).toFixed(1)+' MB</small></div>';
        box.className = 'cd-flyer sf-drop has';
        box.innerHTML = inner
          + (picked.length>1 ? '<div class="sf-more">+'+(picked.length-1)+' more file'+(picked.length>2?'s':'')+'</div>' : '')
          + '<div class="sf-swap">Change</div>';
      }
      function paintCover(){
        var box = document.getElementById('sfCoverBox');
        if(!box) return;
        if(!coverFile){
          box.className = 'cd-flyer sf-drop';
          box.innerHTML = '<div class="sf-ph"><span class="ic">＋</span><span>Add a cover</span>'
            + '<small>2:3 image — how your entry appears in the feed</small></div>';
          return;
        }
        box.className = 'cd-flyer sf-drop has';
        box.innerHTML = '<img class="sf-media" src="'+URL.createObjectURL(coverFile)+'" alt="">'
          + '<div class="sf-swap">Change</div>';
      }
      document.getElementById('sfWork').onchange = function(){
        picked = [].slice.call(this.files || []); paintWork();
      };
      document.getElementById('sfCover').onchange = function(){
        coverFile = (this.files || [])[0] || null; paintCover();
      };

      document.getElementById('eGo').onclick = function(){
        var btn = this, msg = document.getElementById('eMsg');
        var title = document.getElementById('eTitle').value.trim();
        if(!title){ msg.textContent = 'A title is required.'; return; }
        if(!picked.length){ msg.textContent = 'Add your submission before continuing.'; return; }
        if(!document.getElementById('eTerms').checked){ msg.textContent = 'Please accept the terms to continue.'; return; }
        btn.disabled = true; msg.textContent = 'Creating your entry…';

        var payload = {
          title: title,
          description: document.getElementById('eDesc').value.trim(),
          creator_statement: document.getElementById('eStmt').value.trim(),
          tools: document.getElementById('eTools').value.trim(),
          ai_disclosure: document.getElementById('eAI').value.trim(),
          collaborators: document.getElementById('eCollab').value.trim(),
          /* the ownership checkbox IS the rights declaration the Q4 rules require */
          rights_declared: !!document.getElementById('eTerms').checked
        };
        var entryId = null;

        SB.rpc('vs_create_entry', { p_comp: compId, p: payload })
          .then(function(res){
            if(res.error) throw res.error;
            var row = Array.isArray(res.data) ? res.data[0] : res.data;
            entryId = row.id;
            msg.textContent = 'Uploading media…';
            return uploadAll(entryId, picked, msg);
          })
          .then(function(){
            /* cover second — it needs the entry id for its storage path, and it is optional, so a
               cover that fails to upload must not lose an entry that is otherwise complete. */
            if(!coverFile) return null;
            msg.textContent = 'Uploading cover…';
            return uploadOne(entryId, coverFile, 'cover')
              .then(function(url){ return SB.rpc('vs_set_entry_cover', { p_entry: entryId, p_url: url }); })
              .catch(function(){ return null; });
          })
          .then(function(){
            msg.textContent = paid ? 'Opening secure checkout…' : 'Finishing up…';
            // Free OR paid both go through create-checkout: the FUNCTION decides, using the
            // fee stored on the competition. A free comp returns {free:true} and never touches
            // Stripe; the client never asserts the price.
            return SB.functions.invoke('create-checkout', {
              body: { kind: 'vs_entry', vs_entry_id: entryId, return_base: 'v31' }
            });
          })
          .then(function(fn){
            if(fn && fn.error) throw fn.error;
            var d = fn && fn.data;
            if(d && d.url){ location.href = d.url; return; }          // paid -> Stripe
            // free -> entitlement already granted; submit for review now
            return SB.rpc('vs_submit_entry', { p_entry: entryId, p_terms_version: comp.terms_version || 'v1' })
              .then(function(sr){
                if(sr.error) throw sr.error;
                go({ view: 'mine' });
              });
          })
          .catch(function(e){
            msg.textContent = String(e && e.message || e);
            btn.disabled = false;
          });
      };
    }).catch(err);
  }

  /* sequential upload so a slow connection cannot fire a burst of parallel requests (§29) */
  function uploadAll(entryId, files, msg){
    var i = 0;
    function next(){
      if(i >= files.length) return Promise.resolve();
      var f = files[i++];
      if(msg) msg.textContent = 'Uploading ' + i + ' of ' + files.length + '…';
      var path = ME.id + '/' + entryId + '/' + Date.now() + '-' + f.name.replace(/[^a-zA-Z0-9.\-_]+/g, '_');
      return SB.storage.from('vs-entries').upload(path, f, { upsert: false })
        .then(function(up){
          if(up.error) throw up.error;   // bucket enforces type + 500MB, so this is a real gate
          var url = SB.storage.from('vs-entries').getPublicUrl(path).data.publicUrl;
          return SB.rpc('vs_add_entry_media', { p_entry: entryId, p_url: url, p_mtype: mediaKind(f), p_thumb: null });
        })
        .then(next);
    }
    return next();
  }

  /* 'doc' covers the Short Story manuscript formats the bucket now accepts. Anything that is not
     image/video/audio is a document — there is no fourth kind, and defaulting to 'image' (the old
     behaviour) made a PDF render as a broken <img> everywhere downstream. */
  function mediaKind(f){
    var t = f.type || '';
    if(t.indexOf('video') === 0) return 'video';
    if(t.indexOf('audio') === 0) return 'audio';
    if(t.indexOf('image') === 0) return 'image';
    return 'doc';
  }

  /* Single upload that returns the public URL without registering a media row — used for the
     cover, which lives on vs_entries.cover_url, not in the entry's media list. */
  function uploadOne(entryId, f, tag){
    var path = ME.id + '/' + entryId + '/' + (tag ? tag + '-' : '') + Date.now() + '-'
             + f.name.replace(/[^a-zA-Z0-9.\-_]+/g, '_');
    return SB.storage.from('vs-entries').upload(path, f, { upsert: false })
      .then(function(up){
        if(up.error) throw up.error;
        return SB.storage.from('vs-entries').getPublicUrl(path).data.publicUrl;
      });
  }

  function renderWinnersSoon(){
    empty('Winners', 'Season highlights, category spotlights (season & all-time) and per-competition leaderboards land here once the first monthly round is scored.');
  }

  /* Rail contract (window.vsGo) — the /culture/vs vertical rail drives views through this.
     Interim mapping until KODE builds the full Vote/Join/Winners screens:
       feed→feed · vote→feed(entries to vote on) · join→enter · winners→soon · votes/mine→as-is.
     Manage(admin) is intentionally NOT exposed here — it is moving to the profile dashboard. */
  window.vsGo = function(view){ go({ view: view || 'feed' }); };

  /* ── router ────────────────────────────────────────────────────────────────────── */
  function route(){
    if(!SB){ err('Supabase client unavailable'); return; }
    /* DEFAULT VIEW = JOIN (Founder 2026-08-18). It used to be the entries FEED, which is empty
       until somebody enters — so the landing screen of a page with 36 live competitions showed
       nothing, and visitors concluded the product was empty. Landing on the competitions makes
       the first thing you see the thing you can act on. /create/?view=feed still works. */
    var v = q('view') || 'join';
    /* The desktop "Enter a competition →" bar exists so a visitor on the FEED has a route to the
       competitions. On a single competition page it is noise sitting under a page that already
       has its own locked "Enter this competition" button — two different-looking entry buttons
       on one screen make the primary action look uncertain. Hide it there. */
    try{
      var jb = document.getElementById('vsJoinBar');
      if(jb) jb.style.display = (q('c') ? 'none' : '');
    }catch(e){}

    if(v === 'entry' && q('e')) return renderEntry(q('e'));
    if(v === 'mine')  return renderMine();
    if(v === 'votes') return renderVotes();
    if(v === 'submit' && q('c')) return renderEntryForm(Number(q('c')));   /* the form itself */
    if(v === 'enter' || v === 'join') return renderEnter(q('c'));
    if(v === 'vote')  return renderFeed();
    if(v === 'winners') return renderWinnersSoon();
    if(v === 'admin') return renderAdmin();   // reachable by URL for admins; not linked from VS
    return renderFeed();
  }

  loadMe().then(route);
})();
