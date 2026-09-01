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
  /* The widget names the agent explicitly. ask-echo resolves it with eq() against
     agent_personality and search_brain — no alias lookup server-side — so a legacy slug here
     is not a cosmetic problem, it is an agent with no persona and an empty brain.

     ⚠ REPOINTED 2026-09-01. This read v3/keepitil-ai.js, deleted in the August /v3 purge, so
     the assertion had been failing on every commit rather than protecting anything. The live
     widget is assets/js/keepitil-ai.js. */
  const src = read("assets/js/keepitil-ai.js");
  assert.match(src, /agent: *'cho'/, "the widget posts the current slug");
  assert.ok(!/agent: *'echo'/.test(src), "no request still names the dead slug");
  assert.ok(!/toLowerCase\(\) !== 'echo'/.test(src), "from_agent is compared against 'cho'");
});

/* "renamed art moved with the slug" REMOVED 2026-09-01. Every path it asserted on lived under
   v3/agents/, which was deleted with the whole /v3 tree in August. The test could only fail,
   and re-creating those files to make it pass would be resurrecting retired architecture to
   satisfy a check — exactly backwards. Nothing renders that art any more. */

/* THREE TESTS REMOVED 2026-09-01: "the roster data takes identity from the database and
   nothing else", "the rename changed identity only", and "the rename left non-agent
   Echo/Nexus references alone". All three evaluated v3/agents-data.js, a generated artifact
   that went with the /v3 purge. The invariant they protected — that the database owns agent
   identity — is still covered by "the canonical roster matches the database snapshot" above,
   which reads _scripts/agents-snapshot.json and passes. */
