/* KEEPITIL LIVE FUNCTIONAL AUDIT — headless browser, runs in GitHub Actions (no Claude).
   Loads real pages on keepitil.com, FOLLOWS JS redirects, and asserts each route lands
   where it should. Catches the class of bug static audits miss (e.g. crew profiles that
   bounce to the wrong page). Exits non-zero on failure so the Action fails and emails the
   Founder. Logged-OUT context (CI has no session) — routes are annotated accordingly. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.QA_BASE || 'https://keepitil.com';
const SETTLE = 2600; // ms to wait out async auth redirects after load

// stay = final URL must still contain this (must NOT bounce away). img = a cover image must decode.
const ROUTES = [
  { label: 'Homepage',            url: '/',              stay: 'index.html' },
  { label: 'Culture',             url: '/culture/',            stay: 'culture' },
  { label: 'Scene',               url: '/connect/',              stay: 'scene' },
  { label: 'Crew index',          url: '/connect/',               stay: 'crew.html', text: 'CREW' },
  { label: 'Events',              url: '/',             stay: 'events' },
  { label: 'Discover',            url: '/',           stay: 'discover' },
  { label: 'Connect',             url: '/connect/',            stay: 'connect' },
  { label: 'Blog: Groove Trooper',url: '/blog-groove-trooper.html',stay: 'blog-groove-trooper' },
  { label: 'Agent blog: Nova',    url: '/blog-agent-nova.html',    stay: 'blog-agent-nova', img: true },
];

async function finalUrl(page, url) {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(SETTLE);
  return page.url();
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = [];
  const rec = (label, status, detail) => results.push({ label, status, detail });

  for (const r of ROUTES) {
    try {
      const landed = await finalUrl(page, r.url);
      if (r.stay && !landed.includes(r.stay)) { rec(r.label, 'FAIL', `bounced to ${landed}`); continue; }
      const probs = [];
      if (r.text) { const t = (await page.innerText('body').catch(() => '')).toLowerCase(); if (!t.includes(r.text.toLowerCase())) probs.push(`missing text "${r.text}"`); }
      if (r.img) { const ok = await page.evaluate(() => { const im = document.querySelector('.cover img,.band img,img'); return !!(im && im.naturalWidth); }).catch(() => false); if (!ok) probs.push('cover image not loaded'); }
      rec(r.label, probs.length ? 'WARN' : 'PASS', probs.length ? `${landed} · ${probs.join('; ')}` : landed);
    } catch (e) { rec(r.label, 'FAIL', 'error: ' + e.message); }
  }

  // Regression test: every crew profile must open its own agent page (not bounce to a user/login page)
  try {
    await finalUrl(page, '/connect/');
    const hrefs = await page.$$eval('a.card', els => els.map(e => e.getAttribute('href')));
    const bad = [];
    for (const h of hrefs) {
      const slug = (h.match(/[?&]a=([a-z0-9-]+)/i) || [])[1] || '?';
      const landed = await finalUrl(page, h.replace(BASE, ''));
      if (!landed.includes('agent.html') || landed.includes('u.html') || landed.includes('apply.html'))
        bad.push(`${slug}->${landed}`);
    }
    rec('Every crew profile link', bad.length ? 'FAIL' : 'PASS',
        bad.length ? `${bad.length}/${hrefs.length} bounced: ${bad.join(', ')}` : `all ${hrefs.length} open their own agent page`);
  } catch (e) { rec('Every crew profile link', 'FAIL', 'error: ' + e.message); }

  await browser.close();

  const date = new Date().toISOString().slice(0, 10);
  const fails = results.filter(r => r.status === 'FAIL');
  const warns = results.filter(r => r.status === 'WARN');
  const md = [
    `# KEEPITIL Live Functional Audit — ${date}`,
    ``,
    `Headless browser vs ${BASE} (logged-out). **PASS ${results.filter(r=>r.status==='PASS').length} · FAIL ${fails.length} · WARN ${warns.length}**`,
    ``,
    ...results.map(r => `- ${r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '🔴' : '🟡'} **${r.label}** — ${r.detail}`),
  ].join('\n') + '\n';
  const dir = path.join(__dirname, '..', '..', '_reports');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `LIVE-QA-${date}.md`), md);
  fs.writeFileSync(path.join(dir, 'LIVE-QA-latest.json'), JSON.stringify(results, null, 2));

  console.log(md);
  if (fails.length) { console.error(`\n${fails.length} FAILED`); process.exit(1); }
})();
