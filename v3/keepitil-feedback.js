/* KEEPITIL — customer feedback widget (self-contained, no dependencies).
   Injects a small floating "Feedback" pill -> compact form -> inserts one row
   into the Supabase `feedback` table via REST (anon key is publishable).
   Load once per page:  <script src="/keepitil-feedback.js" defer></script>
   Requires the `feedback` table + insert policy from _scripts/sql/feedback-table.sql.
   NOTE: not deployed until the Founder approves placement (design-freeze rule). */
(function () {
  if (window.__kilFeedback) return; window.__kilFeedback = 1;
  var SUPA_URL = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';

  var CATS = [['bug','🐞 Bug'],['idea','💡 Idea'],['confusing','😕 Confusing'],['praise','❤️ Praise'],['other','💬 Other']];

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }

  function css() {
    if (document.getElementById('kil-fb-style')) return;
    var s = el('style', { id: 'kil-fb-style' });
    s.textContent =
      '#kil-fb-btn{position:fixed;right:16px;bottom:74px;z-index:99998;display:flex;align-items:center;gap:7px;'
      +'background:#111;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:9px 15px;'
      +'font:700 13px/1 Inter,system-ui,sans-serif;letter-spacing:.03em;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.45)}'
      +'#kil-fb-btn:hover{border-color:#00b4ff;color:#00b4ff}'
      +'#kil-fb-ov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;padding:18px}'
      +'#kil-fb-ov.on{display:flex}'
      +'#kil-fb-card{width:100%;max-width:400px;background:#14141b;color:#f0f0f0;border:1px solid rgba(255,255,255,.12);'
      +'border-radius:18px;padding:22px;font-family:Inter,system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.6)}'
      +'#kil-fb-card h3{margin:0 0 4px;font-size:1.15rem;font-weight:900}'
      +'#kil-fb-card p.sub{margin:0 0 14px;color:#9a9aa6;font-size:.85rem}'
      +'.kil-fb-cats{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}'
      +'.kil-fb-cat{border:1px solid rgba(255,255,255,.16);background:transparent;color:#d9d9e0;border-radius:999px;'
      +'padding:7px 12px;font:600 12px Inter,sans-serif;cursor:pointer}'
      +'.kil-fb-cat.on{background:#00b4ff;border-color:#00b4ff;color:#04121b}'
      +'.kil-fb-stars{display:flex;gap:5px;margin-bottom:14px;font-size:1.4rem;cursor:pointer;user-select:none}'
      +'.kil-fb-star{opacity:.35}.kil-fb-star.on{opacity:1}'
      +'#kil-fb-msg{width:100%;min-height:88px;resize:vertical;background:#0d0d13;color:#f0f0f0;border:1px solid rgba(255,255,255,.16);'
      +'border-radius:10px;padding:11px;font:400 14px Inter,sans-serif;box-sizing:border-box;margin-bottom:10px}'
      +'#kil-fb-contact{width:100%;background:#0d0d13;color:#f0f0f0;border:1px solid rgba(255,255,255,.16);border-radius:10px;'
      +'padding:10px;font:400 13px Inter,sans-serif;box-sizing:border-box;margin-bottom:14px}'
      +'.kil-fb-row{display:flex;gap:10px}'
      +'.kil-fb-send{flex:1;background:linear-gradient(90deg,#00b4ff,#5cc8ff);color:#04121b;border:0;border-radius:999px;'
      +'padding:13px;font:800 14px Inter,sans-serif;cursor:pointer}'
      +'.kil-fb-x{background:transparent;color:#9a9aa6;border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:13px 16px;cursor:pointer;font-weight:700}'
      +'#kil-fb-done{text-align:center;padding:12px 0}#kil-fb-done .big{font-size:2.4rem}'
      +'@media(max-width:600px){#kil-fb-btn{bottom:82px;padding:8px 13px;font-size:12px}}';
    document.head.appendChild(s);
  }

  var state = { cat: 'idea', rating: 0 };

  function open() { document.getElementById('kil-fb-ov').classList.add('on'); }
  function close() { document.getElementById('kil-fb-ov').classList.remove('on'); }

  async function submit() {
    var msg = (document.getElementById('kil-fb-msg').value || '').trim();
    if (!msg) { document.getElementById('kil-fb-msg').focus(); return; }
    var contact = (document.getElementById('kil-fb-contact').value || '').trim();
    var send = document.querySelector('.kil-fb-send'); send.disabled = true; send.textContent = 'Sending...';
    var body = {
      category: state.cat, rating: state.rating || null, message: msg,
      page_url: location.href, contact: contact || null,
      user_handle: (window.KEEPITIL_USER && window.KEEPITIL_USER.handle) || null,
      user_agent: navigator.userAgent
    };
    try {
      var r = await fetch(SUPA_URL + '/rest/v1/feedback', {
        method: 'POST',
        headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY,
                   'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      try { if (window.gtag) gtag('event', 'feedback_submit', { category: state.cat }); } catch (e) {}
      document.getElementById('kil-fb-card').innerHTML =
        '<div id="kil-fb-done"><div class="big">🙏</div><h3>Thank you!</h3>'
        + '<p class="sub">Your feedback goes straight to the KEEPITIL team.</p>'
        + '<button class="kil-fb-send" onclick="document.getElementById(\'kil-fb-ov\').classList.remove(\'on\')">Close</button></div>';
    } catch (e) {
      send.disabled = false; send.textContent = 'Send feedback';
      alert('Sorry — could not send right now. Please try again in a moment.');
    }
  }

  function build() {
    css();
    var btn = el('button', { id: 'kil-fb-btn', 'aria-label': 'Send feedback' }, '💬 Feedback');
    btn.addEventListener('click', open);
    document.body.appendChild(btn);

    var ov = el('div', { id: 'kil-fb-ov' });
    var cats = CATS.map(function (c) {
      return '<button class="kil-fb-cat' + (c[0] === state.cat ? ' on' : '') + '" data-c="' + c[0] + '">' + c[1] + '</button>';
    }).join('');
    var stars = [1, 2, 3, 4, 5].map(function (n) { return '<span class="kil-fb-star" data-n="' + n + '">★</span>'; }).join('');
    ov.innerHTML =
      '<div id="kil-fb-card">'
      + '<h3>Help us improve KEEPITIL</h3>'
      + '<p class="sub">Spotted a bug or have an idea? Tell us — it shapes what we build next.</p>'
      + '<div class="kil-fb-cats">' + cats + '</div>'
      + '<div class="kil-fb-stars" title="Optional rating">' + stars + '</div>'
      + '<textarea id="kil-fb-msg" placeholder="What happened, or what would make this better?"></textarea>'
      + '<input id="kil-fb-contact" type="text" placeholder="Email (optional, only if you want a reply)">'
      + '<div class="kil-fb-row"><button class="kil-fb-send">Send feedback</button><button class="kil-fb-x">Cancel</button></div>'
      + '</div>';
    document.body.appendChild(ov);

    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.kil-fb-x').addEventListener('click', close);
    ov.querySelector('.kil-fb-send').addEventListener('click', submit);
    ov.querySelectorAll('.kil-fb-cat').forEach(function (b) {
      b.addEventListener('click', function () {
        state.cat = b.dataset.c;
        ov.querySelectorAll('.kil-fb-cat').forEach(function (x) { x.classList.toggle('on', x === b); });
      });
    });
    ov.querySelectorAll('.kil-fb-star').forEach(function (s) {
      s.addEventListener('click', function () {
        state.rating = +s.dataset.n;
        ov.querySelectorAll('.kil-fb-star').forEach(function (x) { x.classList.toggle('on', +x.dataset.n <= state.rating); });
      });
    });
  }

  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
