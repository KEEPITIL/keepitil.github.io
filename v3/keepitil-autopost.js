/* KEEPITIL — auto-post emitter.
   Sends new KEEPITIL content (events, blogs, photos, posts, announcements) to a Zapier
   "Catch Hook". Your Zap then fans it out to the connected socials (Instagram, TikTok, X,
   Facebook, etc.). KEEPITIL never stores social passwords — Zapier holds those connections.

   SETUP: paste your Zapier Catch Hook URL below (see _docs/KEEPITIL-ZAPIER-AUTOPOST-SETUP.md).
   USAGE (from any page): window.KEEPITIL.autopost({ type:'event', title, url, image, text });
*/
(function () {
  var ZAP_HOOK = ""; // <-- paste: https://hooks.zapier.com/hooks/catch/XXXXXXX/XXXXXXX/
  window.KEEPITIL = window.KEEPITIL || {};
  window.KEEPITIL.autopostEnabled = function () { return !!ZAP_HOOK; };
  window.KEEPITIL.autopost = function (payload) {
    try {
      if (!ZAP_HOOK) return Promise.resolve({ skipped: true, reason: "no Zapier hook configured" });
      return fetch(ZAP_HOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ source: "keepitil", posted_at: new Date().toISOString() }, payload || {}))
      }).then(function () { return { ok: true }; }).catch(function () { return { ok: false }; });
    } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); }
  };
})();
