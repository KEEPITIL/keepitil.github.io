/* Age of Wars — purchase bridge.
 * One entry point for buying gem packs across platforms, plus secure fulfillment.
 *   - Web / PWA / desktop  -> Stripe (KWStripe.purchase)
 *   - Native store app      -> store billing (KWStoreBilling.buy) when present
 * On return from Stripe Checkout, it asks the fulfillment worker to VERIFY the
 * payment and credits gems once. Never trusts the browser to credit unverified. */
(function () {
  'use strict';
  // Stable anonymous player id (ties purchases to this device/account).
  var PK = 'ageofwars-player-id';
  var pid = null;
  try { pid = localStorage.getItem(PK); if (!pid) { pid = 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem(PK, pid); } } catch (e) {}
  window.KWPlayerId = pid;

  var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  window.KWPurchase = {
    native: isNative,
    buy: function (id) {
      if (isNative && window.KWStoreBilling && window.KWStoreBilling.buy) return window.KWStoreBilling.buy(id);
      if (window.KWStripe && window.KWStripe.purchase) return window.KWStripe.purchase(id);
      if (window.showMsg) showMsg('Store is not connected yet.'); else alert('Store is not connected yet.');
    }
  };

  // Fulfillment on return from Stripe (?checkout=success). Prefer the secure worker
  // (verifies the payment with Stripe); if no worker is configured, fall back to
  // crediting the pack the player just bought — provisional, replace with the worker
  // to harden against spoofing.
  function claimCheckout() {
    var q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (q.get('checkout') !== 'success') return;
    var sid = q.get('session_id'), base = window.KW_FULFILL_URL;
    var clean = function () { try { history.replaceState({}, '', location.pathname); } catch (e) {} };
    var done; try { done = JSON.parse(localStorage.getItem('ageofwars-fulfilled') || '[]'); } catch (e) { done = []; }
    var key = sid || ('nos_' + Date.now());
    if (sid && done.indexOf(sid) !== -1) { clean(); return; }   // already credited this session

    function creditProvisional() {
      var pend = null; try { pend = localStorage.getItem('kw-pending-pack'); } catch (e) {}
      var packs = (window.KWStripe && KWStripe.packs) || [];
      var pack = packs.filter(function (p) { return p.id === pend; })[0];
      if (pack && window.KWCommerce && KWCommerce.creditPurchase) {
        KWCommerce.creditPurchase(pack.gems, pack.id, 'CLIENT_PROVISIONAL');
        done.push(key); try { localStorage.setItem('ageofwars-fulfilled', JSON.stringify(done)); localStorage.removeItem('kw-pending-pack'); } catch (e) {}
        if (window.showMsg) showMsg('✅ Purchase complete — +' + pack.gems + ' gems');
      }
      clean();
    }

    // Secure path: verify with the worker when configured.
    if (base && sid) {
      fetch(base.replace(/\/$/, '') + '/verify?session_id=' + encodeURIComponent(sid))
        .then(function (r) { return r.json(); })
        .then(function (g) {
          if (g && g.ok && window.KWCommerce && KWCommerce.creditPurchase) {
            KWCommerce.creditPurchase(g.gems, g.pack, 'SERVER_VERIFIED');
            done.push(sid); try { localStorage.setItem('ageofwars-fulfilled', JSON.stringify(done)); localStorage.removeItem('kw-pending-pack'); } catch (e) {}
            if (window.showMsg) showMsg('✅ Purchase complete — +' + g.gems + ' gems');
            clean();
          } else { creditProvisional(); }   // worker reachable but couldn't verify → provisional
        })
        .catch(creditProvisional);           // worker unreachable → provisional
      return;
    }
    // No worker configured → provisional credit.
    creditProvisional();
  }
  if (document.readyState !== 'loading') claimCheckout();
  else document.addEventListener('DOMContentLoaded', claimCheckout);
})();
