/* AOW2-3D — boot sequencer.
 * Initialises every module in dependency order, reports progress on the loading
 * screen, and NEVER leaves the player staring at a black page: any module that
 * fails is logged, surfaced, and skipped so the rest of the game still runs. */
(function () {
  'use strict';

  var bootEl = document.getElementById('boot'),
      barEl  = document.querySelector('#bar i'),
      msgEl  = document.getElementById('bootMsg'),
      errEl  = document.getElementById('bootErr'),
      canvas = document.getElementById('stage');

  var failures = [], step = 0, TOTAL;

  function say(msg) { if (msgEl) msgEl.textContent = msg; }
  function progress() { step++; if (barEl) barEl.style.width = Math.min(100, (step / TOTAL) * 100) + '%'; }
  function fail(name, e) {
    var line = name + ': ' + (e && e.message ? e.message : e);
    failures.push(line);
    console.error('[AOW boot] ' + line, e);
    if (errEl) { errEl.style.display = 'block'; errEl.textContent = failures.join('\n'); }
  }

  // Pick a starting quality tier before anything allocates GPU memory.
  function detectTier() {
    try {
      var mem = navigator.deviceMemory || 4,
          cores = navigator.hardwareConcurrency || 4,
          mobile = (navigator.maxTouchPoints || 0) > 0 && Math.min(screen.width, screen.height) <= 900;
      if (mobile && (mem <= 3 || cores <= 4)) return 'low';
      if (mobile || mem <= 4 || cores <= 4) return 'med';
      return 'high';
    } catch (e) { return 'med'; }
  }

  function run(name, fn) {
    say(name + '…');
    try { fn(); } catch (e) { fail(name, e); }
    progress();
  }

  function init() {
    if (!window.AOW || !window.AOW.Core) {
      say('fatal: core failed to load');
      fail('AOW.Core', 'global missing — check that src/game/core.js parsed');
      if (bootEl) bootEl.classList.remove('done');
      return;
    }

    var Core = window.AOW.Core, tier = detectTier();
    var A = window.AOW;

    // module → init thunk. Order is dependency order, not preference.
    var seq = [
      ['renderer',    function () { A.Render  && A.Render.init  && A.Render.init({ canvas: canvas, tier: tier }); }],
      ['world',       function () { A.Env     && A.Env.init     && A.Env.init({ tier: tier }); }],
      ['fortresses',  function () { A.Forts   && A.Forts.init   && A.Forts.init({ tier: tier }); }],
      ['armies',      function () { A.Units3D && A.Units3D.init && A.Units3D.init({ tier: tier }); }],
      ['effects',     function () { A.VFX     && A.VFX.init     && A.VFX.init({ tier: tier }); }],
      ['battle',      function () { A.Sim     && A.Sim.init     && A.Sim.init({ seed: 20260806 }); }],
      ['treasury',    function () { A.Economy && A.Economy.init && A.Economy.init(); }],
      ['campaign',    function () { A.Campaign&& A.Campaign.init&& A.Campaign.init(); }],
      ['interface',   function () { A.UI      && A.UI.init      && A.UI.init(); }],
      ['sound',       function () { A.Audio   && A.Audio.init   && A.Audio.init(); }]
    ];
    TOTAL = seq.length + 1;

    for (var i = 0; i < seq.length; i++) run(seq[i][0], seq[i][1]);

    // Kick the run. Prefer the campaign/sim's own entry point; fall back to the
    // canonical 'game:new' event that sim.js already listens for.
    // 'game:new' is the canonical run-start: Sim, Economy and Campaign all
    // listen for it. Calling Sim.start() directly starts the battle but skips
    // the economy's run setup, so the player begins with 0 gold and can't buy
    // anything — always go through the event.
    run('first battle', function () {
      Core.emit('game:new', { wave: 1 });
      if (A.Sim && typeof A.Sim.start === 'function' &&
          (!Core.state.units || Core.state.units.length === 0) &&
          Core.state.wave !== 1) {
        A.Sim.start(1);                       // fallback if nothing picked it up
      }
      if (typeof Core.start === 'function') Core.start();
    });

    // Reveal the battlefield. Keep the panel up if something broke so the
    // failure is visible instead of silently swallowed.
    if (failures.length) {
      say(failures.length + ' module(s) failed — running degraded. Tap to continue.');
      var dismiss = function () { if (bootEl) bootEl.classList.add('done'); };
      bootEl && bootEl.addEventListener('click', dismiss, { once: true });
      setTimeout(dismiss, 8000);
    } else {
      say('to arms!');
      setTimeout(function () { bootEl && bootEl.classList.add('done'); }, 350);
    }

    window.AOW.bootReport = { tier: tier, failures: failures.slice() };
    console.log('[AOW boot] tier=' + tier + ' failures=' + failures.length);
  }

  // Surface uncaught errors on the boot panel too — a black screen tells nobody anything.
  window.addEventListener('error', function (e) {
    if (bootEl && !bootEl.classList.contains('done')) fail('runtime', e.message);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Service worker: register only over http(s), never file://
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
