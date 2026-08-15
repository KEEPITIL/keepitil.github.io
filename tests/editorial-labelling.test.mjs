import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * S2 — editorial profiles must never claim membership.
 *
 * ATLAS §D1: "A venue that never signed up must not appear to have endorsed KEEPITIL." This is
 * the directive's core correctness rule and the one most likely to regress silently, because it
 * regresses through a COPY change — someone adds a friendly default badge and nothing breaks,
 * nothing errors, and four businesses start looking like customers.
 *
 * The defect this locks down: badges fell back to a hardcoded membership badge whenever a
 * profile had none, so every KEEPITIL-authored profile rendered "Member". Four editorial
 * profiles were live in that state.
 */

const profile = readFileSync(new URL("../profile.html", import.meta.url), "utf8");

/** The labelling helpers, lifted out of the page and evaluated in isolation. */
function loadLabeller() {
  const start = profile.indexOf("window.KIL_MEMBERSHIP_WORDS");
  const end = profile.indexOf("</script>", start);
  assert.ok(start > 0 && end > start, "the S2 labelling helpers are missing from profile.html");
  const win = {};
  new Function("window", profile.slice(start, end))(win);
  return win;
}

const MEMBERSHIP_LANGUAGE = /\b(member|subscriber|verified|creator|founder|vip)\b/i;

// ── the labels themselves ─────────────────────────────────────────────────────────────────

test("each editorial type renders its Profile label, not a membership word", () => {
  const w = loadLabeller();
  w.KIL_IS_CLAIMED = false;
  const expected = {
    editorial_artist: "Artist Profile",
    editorial_venue: "Venue Profile",
    editorial_organizer: "Organizer Profile",
    editorial_brand: "Brand Profile"
  };
  for (const [type, label] of Object.entries(expected)) {
    assert.equal(w.KIL_PROFILE_LABEL(type), label);
    assert.doesNotMatch(label, MEMBERSHIP_LANGUAGE, `${type} rendered membership language`);
  }
});

test("an unclaimed profile never renders membership language, whatever its type", () => {
  const w = loadLabeller();
  w.KIL_IS_CLAIMED = false;
  for (const type of ["editorial_artist", "editorial_venue", "editorial_organizer",
                      "editorial_brand", "subscriber_profile", null, "", "legacy_value"]) {
    assert.doesNotMatch(w.KIL_PROFILE_LABEL(type) || "", MEMBERSHIP_LANGUAGE,
      `account_type ${JSON.stringify(type)} produced membership language while unclaimed`);
  }
});

test("Member is only reachable with a profile_owners row", () => {
  const w = loadLabeller();
  w.KIL_IS_CLAIMED = false;
  assert.equal(w.KIL_PROFILE_LABEL("subscriber_profile"), "Profile");
  w.KIL_IS_CLAIMED = true;
  assert.equal(w.KIL_PROFILE_LABEL("subscriber_profile"), "Member");
});

test("an unknown or unclassified type says nothing rather than guessing a status", () => {
  const w = loadLabeller();
  w.KIL_IS_CLAIMED = false;
  assert.equal(w.KIL_PROFILE_LABEL(null), "");
  assert.equal(w.KIL_PROFILE_LABEL("organizer"), "", "the pre-migration value must not label either");
});

// ── badges ────────────────────────────────────────────────────────────────────────────────

test("membership badges are stripped from an unclaimed profile", () => {
  const w = loadLabeller();
  w.KIL_IS_CLAIMED = false;
  const kept = w.KIL_FILTER_BADGES(["Member", "Verified", "DJ", "Founder", "Photographer"]);
  assert.deepEqual(kept, ["DJ", "Photographer"], "only non-membership badges may survive");
  for (const b of kept) assert.doesNotMatch(b, MEMBERSHIP_LANGUAGE);
});

test("a claimed profile keeps the badges it earned", () => {
  const w = loadLabeller();
  w.KIL_IS_CLAIMED = true;
  assert.deepEqual(w.KIL_FILTER_BADGES(["Member", "DJ"]), ["Member", "DJ"]);
});

test("no badges means NO badges, not a default one", () => {
  // The actual regression: an empty list used to become a membership badge.
  const w = loadLabeller();
  w.KIL_IS_CLAIMED = false;
  assert.deepEqual(w.KIL_FILTER_BADGES([]), []);
  assert.deepEqual(w.KIL_FILTER_BADGES(null), []);
  assert.deepEqual(w.KIL_FILTER_BADGES(undefined), []);
});

// ── the page must not reintroduce the default ─────────────────────────────────────────────

test("no render path falls back to a hardcoded membership badge", () => {
  const fallbacks = profile.match(/:\s*\[\s*['"](?:Member|Subscriber|Verified|Creator)['"]\s*\]/gi) ?? [];
  assert.deepEqual(fallbacks, [], `a membership badge is hardcoded as a fallback: ${fallbacks.join(", ")}`);
});

test("the raw account_type is never printed to the public", () => {
  // Post-migration that would read "editorial_brand" on the page.
  assert.ok(!/pfAcctType'\)[^;]*textContent\s*=\s*m\.account_type/.test(profile),
    "account_type is being rendered raw instead of through KIL_PROFILE_LABEL");
  assert.match(profile, /KIL_PROFILE_LABEL\(m\.account_type\)/);
});

test("ownership is read from profile_owners, not inferred from account_type", () => {
  assert.match(profile, /from\('profile_owners'\)[\s\S]{0,160}KIL_IS_CLAIMED/,
    "KIL_IS_CLAIMED must be derived from the profile_owners table");
  assert.ok(!/KIL_IS_CLAIMED\s*=\s*[^;]*account_type/.test(profile),
    "claimed status must never be derived from the type column — the two would disagree");
});
