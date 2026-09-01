import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";

/**
 * The chat path must go through nexus-relay, not straight to agent-tool-invoke.
 *
 * WHY IT MATTERS: the NEXUS client credential lives only in the relay. This file is public
 * browser JS, so the credential can never be here — and a widget that calls agent-tool-invoke
 * directly also bypasses the cutover switch, which is what makes rollback one UPDATE instead
 * of a site redeploy.
 */

const widget = readFileSync("assets/js/keepitil-ai.js", "utf8");

test("askAgent posts to nexus-relay", () => {
  const fn = widget.slice(widget.indexOf("function askAgent"), widget.indexOf("function agentCard"));
  assert.match(fn, /fetch\(KIL_RELAY_FN,/, "the chat path must call the relay");
  assert.ok(!/fetch\(KIL_AGENT_FN,/.test(fn), "the chat path must not call agent-tool-invoke directly");
});

test("the relay constant points at the relay function", () => {
  assert.match(widget, /KIL_RELAY_FN\s*=\s*KIL_SUPA_URL \+ '\/functions\/v1\/nexus-relay'/);
});

test("askAgent still sends the canonical slug", () => {
  const fn = widget.slice(widget.indexOf("function askAgent"), widget.indexOf("function agentCard"));
  assert.match(fn, /agent: 'cho'/, "cho is canonical; echo is retired");
  assert.ok(!/agent: 'echo'/.test(fn));
});

test("runReadTool stays on agent-tool-invoke", () => {
  // It sends op:'invoke' with a tool and args. The relay only speaks the ask shape and would
  // reject it as an empty message, so tool execution is deliberately not routed through it.
  const fn = widget.slice(widget.indexOf("function runReadTool"));
  const body = fn.slice(0, fn.indexOf("function fmtWhen"));
  assert.match(body, /fetch\(KIL_AGENT_FN,/);
  assert.match(body, /op: 'invoke'/);
});

test("no NEXUS client credential is present in browser JS", () => {
  // The whole reason the relay exists. A credential here would be readable by anyone.
  for (const pattern of [/x-nexus-client-secret/i, /NEXUS_KEEPITIL_CLIENT_SECRET/, /nxc_[0-9a-f]{16}/]) {
    assert.ok(!pattern.test(widget), `browser JS must never carry ${pattern}`);
  }
});

test("every page loads the widget at the same cache-busted version", () => {
  // A stale stamp on one page serves the old widget from cache, so that page keeps bypassing
  // the relay while every other page is cut over — the hardest kind of partial rollout to spot.
  const stamps = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".html")) {
        for (const m of readFileSync(path, "utf8").matchAll(/keepitil-ai\.js\?v=([a-z0-9]+)/g)) stamps.add(m[1]);
      }
    }
  };
  walk(".");
  assert.equal(stamps.size, 1, `expected one stamp, found: ${[...stamps].join(", ")}`);
});

/**
 * A SUCCESSFUL RELAY RESPONSE IS TERMINAL.
 *
 * THE DEFECT THIS PINS: agentCard() returned the answer only from inside `if (d.escalated)`.
 * nexus-relay adapts the NEXUS envelope with `escalated: !!degradation`, so a clean success —
 * the good case — arrived with escalated:false, fell past that branch and returned null.
 * handleQuery reads null as "the agent had nothing" and continues into runReadTool -> askBrain
 * -> askEcho. Live, that showed as: relay `on`, non-null content, path='relay_on',
 * fallback_used=false, and 146ms later the legacy answer on screen.
 *
 * These run the REAL source of both functions in a sandbox with the legacy chain stubbed, so
 * they assert on which calls happen — not on wording, which would pass against the defect.
 */

import vm from "node:vm";

/** Slice a function out of the widget by brace matching, so a body edit cannot break the test. */
function extract(name) {
  const start = widget.indexOf(`function ${name}(`);
  assert.ok(start > 0, `${name} not found`);
  let depth = 0;
  for (let i = widget.indexOf("{", start); i < widget.length; i++) {
    if (widget[i] === "{") depth++;
    else if (widget[i] === "}" && --depth === 0) return widget.slice(start, i + 1);
  }
  throw new Error(`unbalanced ${name}`);
}

/** Run handleQuery against a given relay response; report every downstream call it made. */
function runTurn(relayResponse) {
  const calls = [];
  const sandbox = {
    relayResponse,
    calls,
    kilThreadId: null,
    showTyping() {}, hideTyping() {},
    addMessage(who, card) { calls.push(`addMessage:${who}`); if (who === "bot") sandbox.done(card); },
    askAgent() { calls.push("askAgent"); return Promise.resolve(relayResponse); },
    runReadTool() { calls.push("runReadTool"); return Promise.resolve(null); },
    askBrain() { calls.push("askBrain"); return Promise.resolve(null); },
    brainCard() { return null; },
    askEcho() { calls.push("askEcho"); return Promise.resolve(null); },
    echoCard() { return null; },
    fallbackCard() { calls.push("fallbackCard"); return { title: "canned", text: "canned" }; },
    /* ⚠ ADDED 2026-09-01. handleQuery now consults CHO before the relay; without a stub the
       sandbox threw ReferenceError: choAct is not defined and five real invariants below were
       reported as failures when nothing was actually wrong with the routing. Returning null is
       "CHO had no answer", which is the path these tests are about. */
    choAct() { calls.push("choAct"); return Promise.resolve(null); },
    done: null
  };
  return new Promise((resolve, reject) => {
    sandbox.done = (card) => resolve({ calls, card });
    vm.createContext(sandbox);
    vm.runInContext(`${extract("agentCard")}\n${extract("handleQuery")}\nhandleQuery("when is the next show");`, sandbox);
    setTimeout(() => reject(new Error(`no bot message; calls=${calls.join(",")}`)), 1000);
  });
}

/** What the relay's adapt() actually produces on a clean NEXUS success: escalated is FALSE. */
const RELAY_SUCCESS = {
  ok: true, answer: "The next show is Friday at The Warehouse.", thread_id: "t-1",
  sources: [], from_agent: "cho", escalated: false, human_review: false, resolved: true,
  _nexus: { contractVersion: 1 }
};

test("a successful relay answer ends the turn — every legacy counter stays zero", async () => {
  const { calls, card } = await runTurn(RELAY_SUCCESS);
  assert.equal(card.text, RELAY_SUCCESS.answer, "the visible answer is exactly the relay content");
  const count = (name) => calls.filter((c) => c === name).length;
  for (const legacy of ["runReadTool", "askBrain", "askEcho", "fallbackCard"]) {
    assert.equal(count(legacy), 0, `${legacy} must stay at zero; calls=${calls.join(",")}`);
  }
  assert.equal(count("addMessage:bot"), 1, "exactly one bot message — a second would be the legacy answer arriving late");
});

test("zero calls to askBrain/askEcho means zero requests to ask_crew/ask-echo", () => {
  // Bridges the counters above to the network. The counter test proves the FUNCTIONS are not
  // called; this proves those functions are the only things that can reach those endpoints, so
  // a zero counter really is a zero request.
  for (const [fn, endpoint] of [["askBrain", "/rest/v1/rpc/ask_crew"], ["askEcho", "/functions/v1/ask-echo"]]) {
    const hits = widget.split("\n")
      .map((line, i) => [line, i])
      .filter(([line]) => line.includes(endpoint) && !line.trimStart().startsWith("//"));
    assert.equal(hits.length, 1, `${endpoint} must have exactly one call site; found ${hits.length}`);
    const before = widget.slice(0, widget.indexOf(endpoint));
    assert.ok(before.lastIndexOf(`function ${fn}`) > before.lastIndexOf("function handleQuery"),
      `${endpoint} must be reached only from ${fn}`);
  }
});

test("escalated:false does not discard the answer", async () => {
  // The exact regression. Guarded separately so a future refactor cannot reintroduce a
  // routing-flag gate in front of the answer.
  const { card } = await runTurn({ ...RELAY_SUCCESS, escalated: false, intent: undefined });
  assert.ok(card && card.text === RELAY_SUCCESS.answer);
});

test("an escalated answer is still terminal", async () => {
  const { calls } = await runTurn({ ...RELAY_SUCCESS, escalated: true });
  assert.ok(!calls.includes("askBrain"));
});

test("a relay failure still falls through to the existing chain", async () => {
  for (const failure of [
    null,                                                  // transport failure / not signed in
    { ok: false, answer: null, escalated: true },           // model failed, no route
    { ok: true, answer: null, escalated: false },           // degraded: succeeded with no content
    { ok: true, answer: "   ", escalated: false }           // whitespace is not an answer
  ]) {
    const { calls } = await runTurn(failure);
    assert.ok(calls.includes("askBrain"),
      `${JSON.stringify(failure)} must fall through; calls=${calls.join(",")}`);
  }
});

test("human_review still stops the chain", async () => {
  const { calls } = await runTurn({ ok: false, answer: null, human_review: true });
  assert.ok(!calls.includes("askBrain"));
});

test("a read intent with no prose still reaches runReadTool", async () => {
  // The legacy deterministic shape carries an intent and no answer. Preserved deliberately.
  const { calls } = await runTurn({ ok: true, resolved: true, intent: "search_events", escalated: false });
  assert.ok(calls.includes("runReadTool"));
});
