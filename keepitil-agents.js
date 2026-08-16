/* KEEPITIL canonical agent roster — GENERATED. Do not hand-edit.
   Regenerate with:  node _scripts/gen-agents.mjs        (needs SUPABASE_SERVICE_ROLE_KEY)
   Verify in CI with: node _scripts/gen-agents.mjs --check

   Source of truth is public.agent_profiles + public.agent_aliases in keepitil-prod
   (ovmqtzjfpzrbzrlkxwgw). This file is the browser-side mirror of that table, so the
   website and the database always return the same roster. Generated 2026-08-16.

   ── MATCH AGENTS BY EXACT SLUG OR UUID. NEVER BY SUBSTRING. ──
   After the 2026-08-16 rename, 'cho' is a substring of the legacy 'echo', and 'xus' of
   the legacy 'nexus'. Any indexOf / LIKE / regex test over agent slugs will therefore
   match every legacy Echo or Nexus reference still in the corpus (134 roundtable lines,
   104 knowledge answers, and the frozen echo_native telemetry). Every lookup below is
   exact-keyed on purpose. Legacy names resolve ONLY through KIL_AGENT_ALIASES, and only
   in explicit redirect/import paths — never in a routing default.

   Fields marked (db) mirror a column; anything else lives in the repo. agent_profiles has
   no colour column, so per-agent accent colours stay repo-owned in v3/agents-data.js. */
(function (root) {
  'use strict';

  /* id, slug, name, lane, department (db) — dept is department with the trailing
     "(CEO)"-style qualifier stripped, for compact display. */
  var AGENTS = [
    { id: "bbeea43f-423e-4a8c-a693-da1e83a262a7", slug: "atlas", name: "Atlas", lane: "Techno", department: "Engineering (CTO)", subgenres: ["hard techno", "industrial", "minimal", "acid", "warehouse"] },
    { id: "54146012-102b-495f-bbc1-7650fc7896aa", slug: "beacon", name: "Beacon", lane: "Reggae / Dancehall", department: "Promotion", subgenres: ["reggae", "dancehall", "dub", "ska", "soca"] },
    { id: "f599bcd7-3f3b-4c21-a2fc-6f7224ade711", slug: "cho", name: "Cho", lane: "Hip-Hop", department: "Strategy (CEO)", subgenres: ["rap", "trap", "boom bap", "drill", "west coast"] },
    { id: "4d5e71c0-2e2f-47c5-be79-584d695c30fa", slug: "fable", name: "Fable", lane: "Indie / Alternative", department: "Specifications / Documentation", subgenres: ["indie dance", "alt electronic", "shoegaze", "post-punk", "dream pop"] },
    { id: "b7495ea9-8aa9-4189-a934-b164105cc779", slug: "luna", name: "Luna", lane: "Pop", department: "Visual Design", subgenres: ["dance pop", "hyperpop", "k-pop", "top 40"] },
    { id: "b1586409-c2b0-4a77-a505-98f0aea2b888", slug: "lyric", name: "Lyric", lane: "R&B / Soul", department: "Editorial", subgenres: ["neo-soul", "slow jams", "future r&b", "classic soul"] },
    { id: "51eaa966-2c43-4c88-b19f-6d5f87880480", slug: "merch", name: "Merch", lane: "Rock / Metal", department: "Merch / Shop", subgenres: ["rock", "metal", "punk", "metalcore", "emo"] },
    { id: "ee1f8907-8468-41ca-8f7c-0ff09bbd2e50", slug: "nova", name: "Nova", lane: "Bass", department: "User-Experience QA", subgenres: ["dubstep", "riddim", "drum and bass", "uk bass", "breaks"] },
    { id: "b050400b-01b3-4122-b902-5cf925697060", slug: "oracle", name: "Oracle", lane: "Trance", department: "Analytics / Insights", subgenres: ["progressive trance", "uplifting", "psytrance", "vocal trance"] },
    { id: "f07d307a-f218-4042-bf4d-8db215725ee0", slug: "pulse", name: "Pulse", lane: "House", department: "Revenue / Growth (CRO)", subgenres: ["deep house", "tech house", "disco", "funky house", "progressive house"] },
    { id: "de340fea-9db5-4bea-834b-a98da0040502", slug: "scout", name: "Scout", lane: "Country / Americana", department: "Talent / Discovery", subgenres: ["country", "americana", "folk", "bluegrass", "country pop"] },
    { id: "e60590c3-95fd-4305-abd0-58d04f6ec824", slug: "sentinel", name: "Sentinel", lane: "Hardcore / Hard Dance", department: "Trust / Safety / QA (COO)", subgenres: ["hardstyle", "gabber", "rawstyle", "uptempo", "frenchcore"] },
    { id: "687482ff-006a-4897-8129-2fa1439d19bc", slug: "vibe", name: "Vibe", lane: "African Dance", department: "Community", subgenres: ["afrobeats", "amapiano", "afro house", "afro tech", "highlife"] },
    { id: "3c946952-5f48-45ef-b98a-1dc559771416", slug: "xus", name: "Xus", lane: "Latin", department: "Partnerships (CGPO)", subgenres: ["reggaeton", "latin house", "cumbia", "dembow", "salsa"] }
  ];

  /* Mirrors public.agent_aliases where active AND alias_type = 'legacy_slug'.
     legacy slug → canonical slug. Consulted only on explicit redirect/import. */
  var ALIASES = { echo: "cho", nexus: "xus" };

  /* Legacy display names, for the "Cho (was Echo)" convention. Historical prose across the
     corpus was deliberately left saying Echo/Nexus, so surfaces that show a live agent next
     to that prose can render the old name rather than rewrite the archive. */
  var LEGACY_NAMES = { cho: 'Echo', xus: 'Nexus' };

  var BY_SLUG = {}, BY_ID = {};
  for (var i = 0; i < AGENTS.length; i++) {
    BY_SLUG[AGENTS[i].slug] = AGENTS[i];
    BY_ID[AGENTS[i].id] = AGENTS[i];
    AGENTS[i].dept = AGENTS[i].department.replace(/\s*\([^)]*\)\s*$/, '');
  }

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

  /* Canonical slug for an agent or a legacy agent slug; '' for anything else.
     Exact match only — a normal profile slug that merely contains 'cho' is not an agent. */
  function resolveSlug(s) {
    var k = norm(s);
    if (BY_SLUG[k]) return k;
    return Object.prototype.hasOwnProperty.call(ALIASES, k) ? ALIASES[k] : '';
  }

  /* Router helper: canonical slug when the input names an agent, otherwise the input
     unchanged, so non-agent profile slugs pass straight through. */
  function canonical(s) { return resolveSlug(s) || norm(s); }

  function isAgent(s) { return !!resolveSlug(s); }
  function isLegacy(s) { return Object.prototype.hasOwnProperty.call(ALIASES, norm(s)); }
  function get(s) { var c = resolveSlug(s); return c ? BY_SLUG[c] : null; }
  function byId(id) { return BY_ID[String(id == null ? '' : id).trim()] || null; }
  function legacyName(s) { var c = resolveSlug(s); return (c && LEGACY_NAMES[c]) || ''; }

  /* "Cho (was Echo)" for renamed agents, plain name for everyone else. */
  function displayName(s) {
    var a = get(s); if (!a) return '';
    var old = LEGACY_NAMES[a.slug];
    return old ? a.name + ' (was ' + old + ')' : a.name;
  }

  root.KIL_AGENTS = AGENTS;
  root.KIL_AGENT_ALIASES = ALIASES;
  root.KIL_AGENT_BY_SLUG = BY_SLUG;
  root.KILAgents = {
    list: AGENTS, aliases: ALIASES, bySlug: BY_SLUG,
    resolveSlug: resolveSlug, canonical: canonical, isAgent: isAgent, isLegacy: isLegacy,
    get: get, byId: byId, legacyName: legacyName, displayName: displayName
  };
})(typeof window !== 'undefined' ? window : globalThis);
