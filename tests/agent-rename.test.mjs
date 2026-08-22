import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

/**
 * Agent rename of 2026-08-16 — repo side.
 *
 * The database renamed two of the fourteen agents in place, keeping the row identity and the
 * uuid: nexus → xus (Xus, Partnerships (CGPO), Latin) and echo → cho (Cho, Strategy (CEO),
 * Hip-Hop). Legacy slugs survive only in public.agent_aliases. Nothing in the repo moved with
 * it, so every page kept sending the dead slugs to ask-echo, whose brain, personality and
 * knowledge rows had already migrated — a live agent with no persona and an empty knowledge
 * base, answering as if nothing were wrong.
 *
 * The trap this file mostly exists to guard: 'cho' is a substring of 'echo' and 'xus' of
 * 'nexus'. Any prefix/indexOf/LIKE test over agent slugs matches every legacy reference in the
 * corpus, and — worse in the other direction — a careless find-and-replace of "echo" rewrites
 * Echo West (a real DJ with a profile, a blog and a directory row) and the Echoplex (a venue).
 * Both directions are asserted below.
 */

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

/** Evaluate a browser script against a stub window and hand back the globals it set. */
function evalBrowser(file) {
  const win = {};
  new Function("window", read(file))(win);
  return win;
}

const RENAMED = [
  { legacy: "echo", slug: "cho", name: "Cho", lane: "Hip-Hop", department: "Strategy (CEO)",
    id: "f599bcd7-3f3b-4c21-a2fc-6f7224ade711" },
  { legacy: "nexus", slug: "xus", name: "Xus", lane: "Latin", department: "Partnerships (CGPO)",
    id: "3c946952-5f48-45ef-b98a-1dc559771416" }
];

test("the canonical roster matches the database snapshot", () => {
  const snap = JSON.parse(read("_scripts/agents-snapshot.json"));
  const { KILAgents } = evalBrowser("keepitil-agents.js");

  assert.equal(KILAgents.list.length, 14, "exactly 14 agents");
  assert.deepEqual(
    KILAgents.list.map((a) => a.slug),
    snap.profiles.map((p) => p.slug),
    "roster slugs track agent_profiles"
  );

  for (const { slug, name, lane, department, id } of RENAMED) {
    const a = KILAgents.get(slug);
    assert.ok(a, `${slug} is in the roster`);
    assert.equal(a.name, name);
    assert.equal(a.lane, lane);
    assert.equal(a.department, department);
    assert.equal(a.id, id, "the row keeps the uuid assigned before the rename");
  }
});

test("legacy slugs resolve, and only exactly", () => {
  const { KILAgents } = evalBrowser("keepitil-agents.js");

  for (const { legacy, slug } of RENAMED) {
    assert.equal(KILAgents.resolveSlug(legacy), slug, `${legacy} resolves to ${slug}`);
    assert.equal(KILAgents.canonical(legacy), slug);
    assert.ok(KILAgents.isLegacy(legacy));
    assert.ok(!KILAgents.isLegacy(slug), "the new slug is not itself a legacy alias");
    assert.equal(KILAgents.resolveSlug(legacy.toUpperCase()), slug, "case-insensitive");
  }

  // Real profile slugs that a substring match would have captured.
  for (const bystander of ["echo-west", "echoplex", "org-echoplex", "nexuses", "cho-cho"]) {
    assert.equal(KILAgents.resolveSlug(bystander), "", `${bystander} is not an agent`);
    assert.equal(KILAgents.canonical(bystander), bystander, `${bystander} passes through unchanged`);
  }

  assert.equal(KILAgents.resolveSlug(""), "");
  assert.equal(KILAgents.resolveSlug(null), "");
});

test("the display convention names the old agent", () => {
  const { KILAgents } = evalBrowser("keepitil-agents.js");
  assert.equal(KILAgents.displayName("cho"), "Cho (was Echo)");
  assert.equal(KILAgents.displayName("xus"), "Xus (was Nexus)");
  assert.equal(KILAgents.displayName("atlas"), "Atlas", "unrenamed agents get no parenthetical");
  assert.equal(KILAgents.legacyName("echo"), "Echo", "resolves through the alias");
});

test("every inlined copy of the alias table agrees with the generated one", () => {
  const { KIL_AGENT_ALIASES } = evalBrowser("keepitil-agents.js");
  assert.deepEqual(KIL_AGENT_ALIASES, { echo: "cho", nexus: "xus" });

  /* 404.html runs before any script can load and profile.html resolves the slug before its
     own bundle is ready, so both inline the table rather than depend on keepitil-agents.js.
     Inlined means duplicated, and duplicated means it can drift — hence this check. */
  for (const file of ["404.html", "profile.html"]) {
    const m = read(file).match(/AGENT_ALIASES\s*=\s*\{([^}]*)\}/);
    assert.ok(m, `${file} inlines an AGENT_ALIASES table`);
    const inlined = Object.fromEntries(
      m[1].split(",").map((pair) => pair.split(":").map((s) => s.trim().replace(/^['"]|['"]$/g, "")))
    );
    assert.deepEqual(inlined, KIL_AGENT_ALIASES, `${file} matches the generated alias table`);
  }
});

test("no live agent surface still keys on a legacy slug", () => {
  const surfaces = {
    // page, regex over the agent-keyed structure in that page
    "dashboard.html": /var AGENTS=\[(.*?)\];/s,
    /* culture.html was DELETED on 2026-08-18, not moved: a stub at culture.html hijacked
       the extensionless /culture on GitHub Pages and redirected the page to itself. The
       surface itself lives on at culture/index.html with the same agent map. */
    "culture/index.html": /var CUL_AGENTS=\{(.*?)\};/s,
    "profile.html": /var AGENT_INFO=\{(.*?)\};/s
  };
  for (const [file, re] of Object.entries(surfaces)) {
    const m = read(file).match(re);
    assert.ok(m, `${file} still has the agent map this test targets`);
    const block = m[1];
    for (const { slug, legacy } of RENAMED) {
      assert.ok(
        new RegExp(`['"\\[]${slug}['"]`).test(block) || new RegExp(`\\b${slug}\\s*:`).test(block),
        `${file} keys on ${slug}`
      );
      assert.ok(
        !new RegExp(`['"\\[]${legacy}['"]`).test(block) && !new RegExp(`\\b${legacy}\\s*:`).test(block),
        `${file} no longer keys on the dead slug ${legacy}`
      );
    }
  }
});

test("the chat widget sends the canonical slug", () => {
  /* The v3 widget names the agent explicitly. ask-echo resolves it with eq() against
     agent_personality and search_brain — no alias lookup server-side — so a legacy slug here
     is not a cosmetic problem, it is an agent with no persona and an empty brain. */
  const v3 = read("v3/keepitil-ai.js");
  assert.match(v3, /agent: 'cho'/, "askAgent posts the current slug");
  assert.ok(!/agent: 'echo'/.test(v3), "no request still names the dead slug");

  for (const file of ["keepitil-ai.js", "v3/keepitil-ai.js"]) {
    const src = read(file);
    assert.ok(!/toLowerCase\(\) !== 'echo'/.test(src), `${file} compares from_agent against 'cho'`);
    assert.match(src, /toLowerCase\(\) !== 'cho'/, `${file} compares from_agent against 'cho'`);
  }
});

test("renamed art moved with the slug", () => {
  const moved = [
    ["v3/agents/portrait/echo.png", "v3/agents/portrait/cho.png"],
    ["v3/agents/portrait/echo.jpg", "v3/agents/portrait/cho.jpg"],
    ["v3/agents/portrait/nexus.png", "v3/agents/portrait/xus.png"],
    ["v3/agents/bg/echo.jpg", "v3/agents/bg/cho.jpg"],
    ["v3/agents/bg/nexus.jpg", "v3/agents/bg/xus.jpg"],
    ["v3/agents/cutout/echo.png", "v3/agents/cutout/cho.png"],
    ["v3/agents/cutout/echo.jpg", "v3/agents/cutout/cho.jpg"],
    ["v3/agents/gallery/echo-1.png", "v3/agents/gallery/cho-1.png"],
    ["v3/agents/gallery/echo-1.jpg", "v3/agents/gallery/cho-1.jpg"]
  ];
  for (const [before, after] of moved) {
    const url = (f) => new URL(`../${f}`, import.meta.url);
    assert.ok(existsSync(url(after)), `${after} exists`);
    assert.ok(!existsSync(url(before)), `${before} is gone`);
  }

  const { KEEPITIL_AGENTS } = evalBrowser("v3/agents-data.js");
  const cho = KEEPITIL_AGENTS.find((a) => a.slug === "cho");
  assert.deepEqual(cho.gallery, [["cho-1.png", "Strategy war-room"]], "gallery points at the moved file");
});

test("the roster data takes identity from the database and nothing else", () => {
  const { KEEPITIL_AGENTS } = evalBrowser("v3/agents-data.js");
  assert.equal(KEEPITIL_AGENTS.length, 14);

  const snap = JSON.parse(read("_scripts/agents-snapshot.json"));
  for (const p of snap.profiles) {
    const a = KEEPITIL_AGENTS.find((x) => x.slug === p.slug);
    assert.ok(a, `${p.slug} present`);
    assert.equal(a.name, p.display_name.toUpperCase(), `${p.slug} name from the database`);
    // agent_profiles has no column for these, so they have to survive regeneration.
    assert.match(a.color, /^#[0-9a-f]{6}$/i, `${p.slug} keeps its repo-owned colour`);
    assert.ok(a.bio && a.bio.length > 40, `${p.slug} keeps its repo-owned prose`);
    assert.ok(a.role, `${p.slug} keeps its repo-owned role`);
    assert.ok(Array.isArray(a.genres) && a.genres.length, `${p.slug} keeps its repo-owned genres`);
  }

  const xus = KEEPITIL_AGENTS.find((a) => a.slug === "xus");
  assert.ok(/\bXus\b/.test(xus.bio) && !/\bNexus\b/.test(xus.bio), "live copy speaks as Xus");
  const cho = KEEPITIL_AGENTS.find((a) => a.slug === "cho");
  assert.ok(/\bCho\b/.test(cho.bio) && !/\bEcho\b/.test(cho.bio), "live copy speaks as Cho");
});

test("the rename changed identity only — role and genres are untouched", () => {
  /* The database's department and genre_lane columns all carry a single 2026-07-16 seed write,
     so they are not evidence of a later decision than the values authored in the repo. The
     rename is therefore scoped to slug and name, and this test fails if a future regeneration
     quietly widens it — which is exactly what the first pass at this change did. */
  const { KEEPITIL_AGENTS } = evalBrowser("v3/agents-data.js");
  const authored = {
    cho: { role: "CEO · Chief Strategist", genres: ["Melodic techno", "Progressive house"] },
    xus: { role: "Partnerships · Connector", genres: ["House", "Techno"] },
    atlas: { role: "CTO · Engineer", genres: ["Techno", "Drum & bass"] },
    beacon: { role: "Distribution Director", genres: ["Festival mainstage", "Big room"] },
    pulse: { role: "CRO · Revenue", genres: ["Bass house", "Tech house"] }
  };
  for (const [slug, want] of Object.entries(authored)) {
    const a = KEEPITIL_AGENTS.find((x) => x.slug === slug);
    assert.equal(a.role, want.role, `${slug} keeps its authored role`);
    assert.deepEqual(a.genres, want.genres, `${slug} keeps its authored genres`);
  }

  /* And no entry carries a department string, which is how the over-wide version looked. */
  const snap = JSON.parse(read("_scripts/agents-snapshot.json"));
  const departments = new Set(snap.profiles.map((p) => p.department));
  for (const a of KEEPITIL_AGENTS) {
    assert.ok(!departments.has(a.role), `${a.slug}.role is authored, not a copy of department`);
  }
});

test("the rename left non-agent Echo/Nexus references alone", () => {
  /* Echo West is a DJ, the Echoplex is a venue, and the historical prose across the corpus was
     deliberately not rewritten. A find-and-replace would have taken all of it. */
  assert.match(read("roster.html"), /Echo West/, "the DJ keeps their name in the roster");
  assert.match(read("v3/keepitil-directory.js"), /Echo West/, "and in the shared directory");
  assert.match(read("v3/staging.html"), /profile-echo-west\.html/, "their profile page is untouched");
  assert.match(read("v3/staging.html"), /profile-org-echoplex\.html/, "so is the venue's");
  assert.match(read("v3/agents-data.js"), /per Echo \(2026-07-07\)/, "dated attribution stands");
});
