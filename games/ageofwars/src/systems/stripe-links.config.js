/* Age of Wars — Stripe Payment Link URLs (PUBLIC, safe to commit — NOT secret keys).
 * Paste the 5 Payment Link URLs from your Stripe Dashboard here.
 * Each link's "after payment" success URL should be:
 *   https://keepitil.com/games/ageofwars/?checkout=success&session_id={CHECKOUT_SESSION_ID}
 * Until filled, the game shows a safe "not connected yet" message (no charge). */
window.KW_STRIPE_PAYMENT_LINKS = {
  gems_120:  'https://buy.stripe.com/test_fZu00jagB8PM40l3xH14400',   // Scout Pack   $1.99
  gems_650:  'https://buy.stripe.com/test_dRm8wP3Sd7LI68t3xH14401',   // War Chest    $7.99
  gems_1500: 'https://buy.stripe.com/test_28E5kD9cx6HE54pd8h14402',   // Royal Treasury $14.99
  gems_3500: 'https://buy.stripe.com/test_dRm9AT1K5giegN7c4d14403',   // Imperial Vault $29.99
  gems_7500: 'https://buy.stripe.com/test_aFa6oHbkF0jgdAVfgp14404'    // Conquest Vault $49.99
};

/* Fulfillment worker base URL (from deploying platforms/backend/stripe-fulfillment).
 * Leave '' until the worker is deployed; purchases still charge, gems credit once this is set. */
window.KW_FULFILL_URL = '';
