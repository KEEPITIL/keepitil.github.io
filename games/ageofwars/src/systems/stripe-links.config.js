/* Age of Wars — Stripe Payment Link URLs (PUBLIC, safe to commit — NOT secret keys).
 *
 * GOING LIVE IS TWO EDITS IN THIS FILE:
 *   1) Paste your 5 LIVE Payment Link URLs into KW_STRIPE_LINKS.live below.
 *   2) Change KW_STRIPE_MODE from 'test' to 'live'.
 * That's it — the rest of the game reads whichever set the mode selects.
 *
 * Each Payment Link's "after payment" success URL (set in the Stripe Dashboard) must be:
 *   https://keepitil.com/games/ageofwars/?checkout=success&session_id={CHECKOUT_SESSION_ID}
 * and its cancel URL back to https://keepitil.com/games/ageofwars/
 *
 * Until a set is filled, the game shows a safe "not connected yet" message (no charge). */

// ── 1. Which set is active. 'test' = sandbox (no real money). 'live' = real charges. ──
window.KW_STRIPE_MODE = 'test';   // ← flip to 'live' when the live links below are pasted

// ── 2. The two sets of links. Live starts empty; paste the 5 live URLs before flipping. ──
window.KW_STRIPE_LINKS = {
  test: {
    gems_120:  'https://buy.stripe.com/test_fZu00jagB8PM40l3xH14400',   // Scout Pack     $1.99
    gems_650:  'https://buy.stripe.com/test_dRm8wP3Sd7LI68t3xH14401',   // War Chest      $7.99
    gems_1500: 'https://buy.stripe.com/test_28E5kD9cx6HE54pd8h14402',   // Royal Treasury $14.99
    gems_3500: 'https://buy.stripe.com/test_dRm9AT1K5giegN7c4d14403',   // Imperial Vault $29.99
    gems_7500: 'https://buy.stripe.com/test_aFa6oHbkF0jgdAVfgp14404'    // Conquest Vault $49.99
  },
  live: {
    gems_120:  '',   // Scout Pack     $1.99  — paste live Payment Link
    gems_650:  '',   // War Chest      $7.99
    gems_1500: '',   // Royal Treasury $14.99
    gems_3500: '',   // Imperial Vault $29.99
    gems_7500: ''    // Conquest Vault $49.99
  }
};

// ── Resolve the active set (this is the object the rest of the game consumes). ──
(function () {
  var mode = window.KW_STRIPE_MODE === 'live' ? 'live' : 'test';
  var set = (window.KW_STRIPE_LINKS && window.KW_STRIPE_LINKS[mode]) || {};
  // Guardrail: if 'live' is selected but any link is blank, fall back to test and warn
  // (prevents shipping a Buy button that dead-ends). Remove the fallback once live is verified.
  if (mode === 'live') {
    var missing = Object.keys(set).filter(function (k) { return !set[k]; });
    if (missing.length) { console.warn('[Stripe] live mode selected but missing links: ' + missing.join(', ') + ' — using test links.'); set = window.KW_STRIPE_LINKS.test; mode = 'test'; }
  }
  window.KW_STRIPE_ACTIVE_MODE = mode;
  window.KW_STRIPE_PAYMENT_LINKS = set;   // ← unchanged contract read by stripe-commerce.js
})();

/* Fulfillment worker base URL (from deploying platforms/backend/stripe-fulfillment).
 * Leave '' until the worker is deployed; purchases still charge, gems credit once this is set.
 * IMPORTANT for live: deploy the worker and set this BEFORE flipping to live, so real
 * purchases are credited by verified server-side fulfillment, not the client-provisional fallback. */
window.KW_FULFILL_URL = '';
