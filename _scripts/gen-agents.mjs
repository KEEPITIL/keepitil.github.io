#!/usr/bin/env node
/**
 * Regenerate the agent roster from the database.
 *
 * The roster used to be hand-maintained in v3/agents-data.js, which is how it drifted out of
 * step with public.agent_profiles: on 2026-08-16 the database renamed nexus → xus and
 * echo → cho, and the repo kept serving the old names. This script makes agent_profiles the
 * source of truth and the repo a mirror of it.
 *
 *   node _scripts/gen-agents.mjs --pull     refresh the snapshot from the database, then generate
 *   node _scripts/gen-agents.mjs            generate from the committed snapshot
 *   node _scripts/gen-agents.mjs --check    fail if the checked-in files are stale
 *
 * --pull needs SUPABASE_SERVICE_ROLE_KEY: agent_profiles has RLS enabled with no SELECT policy,
 * so the anon key cannot read it. Every other mode reads _scripts/agents-snapshot.json, so
 * generating and checking stay offline and CI needs no secret.
 *
 * Three outputs:
 *   _scripts/agents-snapshot.json  what the database said, and when (--pull only)
 *   keepitil-agents.js             fully generated — canonical roster, aliases, exact-match helpers
 *   v3/agents-data.js              merged — the database owns slug/name/role/genres/subgenres, the
 *                                  repo keeps colour and editorial prose (charge, bio, owns, …),
 *                                  because agent_profiles has no column for either.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = join(ROOT, '_scripts/agents-snapshot.json');
const PROJECT_URL = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
const PULL = process.argv.includes('--pull');
const CHECK = process.argv.includes('--check');

/* What the database actually settled, and therefore all this file overwrites: identity.
   The rename wrote slug and display_name; the uuid was assigned just before it.

   role and genres are NOT on this list, deliberately. Every non-renamed agent_profiles row
   carries updated_at 2026-07-16 — one seed write, no curation since — so for department and
   genre_lane the database is demonstrably older-or-equal to the values authored here, not
   newer. Cho and Xus read 2026-08-16 only because the rename touched the row, which does not
   make their department or lane any more curated than the other twelve. Until someone diffs
   those two columns and writes a decision back to agent_profiles, this file keeps them. */
const DB_OWNED = ['slug', 'name'];

/* Repo-owned keys, in emitted order, so regeneration is byte-stable. */
const REPO_OWNED = ['role', 'color', 'charge', 'bio', 'owns', 'skills', 'thisWeek',
  'initiatives', 'goals', 'genres', 'achievements', 'upcoming', 'gallery'];

async function fetchTable(table, select) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error('--pull needs SUPABASE_SERVICE_ROLE_KEY (agent_profiles has RLS on and no SELECT policy).');
    process.exit(2);
  }
  const res = await fetch(`${PROJECT_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function pull() {
  const profiles = (await fetchTable('agent_profiles', 'id,slug,display_name,genre_lane,subgenres,department,active'))
    .filter((p) => p.active !== false)
    .map(({ id, slug, display_name, genre_lane, subgenres, department }) =>
      ({ id, slug, display_name, genre_lane, subgenres: subgenres || [], department }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const rows = await fetchTable('agent_aliases', 'alias,alias_type,active,agent_id');
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const aliases = rows
    .filter((a) => a.active && a.alias_type === 'legacy_slug')
    .map((a) => {
      const target = byId.get(a.agent_id);
      if (!target) throw new Error(`alias "${a.alias}" points at unknown agent ${a.agent_id}`);
      return { alias: a.alias, canonical: target.slug };
    })
    .sort((a, b) => a.alias.localeCompare(b.alias));

  const snap = { source: 'keepitil-prod (ovmqtzjfpzrbzrlkxwgw)', pulled: new Date().toISOString(), profiles, aliases };
  writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 2) + '\n');
  console.log(`pulled ${profiles.length} agents, ${aliases.length} aliases`);
  return snap;
}

/** Load the current roster by evaluating it against a stub window. */
function readAgentsData(file) {
  const scope = {};
  new Function('window', readFileSync(file, 'utf8'))(scope);
  if (!Array.isArray(scope.KEEPITIL_AGENTS)) throw new Error(`${file} did not define window.KEEPITIL_AGENTS`);
  return scope.KEEPITIL_AGENTS;
}

const j = (v) => JSON.stringify(v);
/** Short string arrays stay on one line, matching the file's existing density. */
const arr = (v) => `[${(v || []).map(j).join(',')}]`;
const pairs = (v) => `[${(v || []).map((g) => `[${g.map(j).join(',')}]`).join(',')}]`;

function renderAgentsData(agents, header) {
  const body = agents.map((a) => {
    const fields = [
      `slug:${j(a.slug)}, name:${j(a.name)}, role:${j(a.role)}, color:${j(a.color)}`,
      `charge:${j(a.charge)}`,
      `bio:${j(a.bio)}`,
      `owns:${arr(a.owns)}`,
      `skills:${arr(a.skills)}`,
      `thisWeek:${j(a.thisWeek)}`,
      `initiatives:${arr(a.initiatives)}`,
      `goals:${arr(a.goals)}`,
      `genres:${arr(a.genres)}`,
      `achievements:${arr(a.achievements)}`,
      `upcoming:${arr(a.upcoming)}`
    ];
    if (a.gallery && a.gallery.length) fields.push(`gallery:${pairs(a.gallery)}`);
    return '  {' + fields.join(',\n   ') + '}';
  }).join(',\n');
  return `${header}window.KEEPITIL_AGENTS = [\n${body}\n];\n`;
}

function renderRoster(profiles, aliases) {
  const rows = profiles.map((p) =>
    `    { id: ${j(p.id)}, slug: ${j(p.slug)}, name: ${j(p.display_name)}, lane: ${j(p.genre_lane)}, ` +
    `department: ${j(p.department)}, subgenres: [${(p.subgenres || []).map(j).join(', ')}] }`
  ).join(',\n');
  const aliasPairs = aliases.map((a) => `${a.alias}: ${j(a.canonical)}`).join(', ');

  /* Rewrite the two data blocks in place; the helpers and the substring warning are hand-written
     and must survive regeneration untouched. */
  const src = readFileSync(join(ROOT, 'keepitil-agents.js'), 'utf8');
  const AGENTS_BLOCK = /(\n  var AGENTS = \[\n)[\s\S]*?(\n  \];\n)/;
  const ALIAS_BLOCK = /(\n  var ALIASES = \{).*?(\};\n)/;
  /* Test the match, not the diff: when the file is already current the replacement is a
     no-op, and comparing strings would report that as a missing block. */
  for (const [re, what] of [[AGENTS_BLOCK, 'AGENTS'], [ALIAS_BLOCK, 'ALIASES']]) {
    if (!re.test(src)) throw new Error(`keepitil-agents.js: could not find the ${what} block to replace`);
  }
  return src.replace(AGENTS_BLOCK, `$1${rows}$2`).replace(ALIAS_BLOCK, `$1 ${aliasPairs} $2`);
}

const snap = PULL ? await pull() : JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const { profiles, aliases } = snap;
const aliasMap = Object.fromEntries(aliases.map((a) => [a.alias, a.canonical]));

/* ⚠ REPOINTED 2026-09-01. This merged repo prose from v3/agents-data.js, which was deleted
   with the whole /v3 tree in August — so `--check` died with ENOENT on every CI run and the
   workflow had been red on every commit since. That file was also the only place the prose
   lived, and nothing loads it any more.
   The database is now the sole source: agent_profiles supplies identity, department and genre
   lane, and there is no second hand-maintained roster to drift out of sync with it, which was
   the whole point of this generator in the first place. */
const repoBySlug = new Map();
const known = new Set(profiles.map((p) => p.slug));
const orphans = [...repoBySlug.keys()].filter((s) => !known.has(s));
if (orphans.length) console.warn(`repo entries with no agent_profiles row: ${orphans.join(', ')}`);

const merged = profiles.map((p) => {
  const repo = repoBySlug.get(p.slug) || {};
  /* name is upper-cased for display: the file has always rendered ATLAS, not Atlas. */
  const out = { slug: p.slug, name: p.display_name.toUpperCase() };
  /* A row with no entry here is a genuinely new agent, so seed role and genres from the
     database rather than emitting undefined. Existing entries keep what they carry. */
  out.role = repo.role !== undefined ? repo.role : p.department;
  out.genres = repo.genres !== undefined ? repo.genres : [p.genre_lane];
  for (const k of REPO_OWNED) if (repo[k] !== undefined) out[k] = repo[k];
  return out;
});
if (DB_OWNED.some((k) => !(k in merged[0]))) throw new Error('a database-owned field went missing');

/* Only one target remains: v3/agents-data.js is gone and is not being recreated. */
const targets = [
  [join(ROOT, 'keepitil-agents.js'), renderRoster(profiles, aliases)]
];

let stale = 0;
for (const [file, next] of targets) {
  const rel = file.replace(ROOT + '/', '');
  if (readFileSync(file, 'utf8') === next) continue;
  stale++;
  if (CHECK) console.error(`stale: ${rel}`);
  else { writeFileSync(file, next); console.log(`wrote: ${rel}`); }
}

if (CHECK && stale) {
  console.error(`\n${stale} file(s) out of step with the snapshot. Run: node _scripts/gen-agents.mjs`);
  process.exit(1);
}
console.log(`${profiles.length} agents · aliases: ${aliases.map((a) => `${a.alias} → ${a.canonical}`).join(', ')}`);
