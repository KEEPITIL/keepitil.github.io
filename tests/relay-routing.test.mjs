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

const widget = readFileSync("v3/keepitil-ai.js", "utf8");

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
