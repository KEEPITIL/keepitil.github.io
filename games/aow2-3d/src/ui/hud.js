/* =============================================================================
 * AOW2-3D  —  src/ui/hud.js  —  global: AOW.UI
 * -----------------------------------------------------------------------------
 * The entire DOM/CSS user interface: design system, HUD, unit bar, modal panels,
 * feedback layer, onboarding, accessibility and the dev overlay.
 *
 * Rules honoured here:
 *   - plain <script>, ONE global (window.AOW.UI), no modules, no build step
 *   - no external assets, no network: every glyph is text/CSS/canvas
 *   - cross-module coupling through AOW.Core.on/emit + reading AOW.Core.state
 *   - never hard-crash: every entry point is wrapped, failures warn and no-op
 * ========================================================================== */
(function (global) {
  'use strict';

  var AOW = global.AOW || (global.AOW = {});

  if (AOW.UI && AOW.UI.__isAowUI) {
    try { console.warn('[AOW.UI] already initialised — ignoring duplicate include.'); } catch (e) {}
    return;
  }

  var doc = global.document || null;

  /* ---------------------------------------------------------------------------
   * 0. Micro-helpers — all defensive, none throw
   * ------------------------------------------------------------------------ */
  var _warned = Object.create(null);
  function warn(key, msg, err) {
    try {
      if (_warned[key]) return;
      _warned[key] = 1;
      if (err) console.warn('[AOW.UI] ' + msg, err);
      else console.warn('[AOW.UI] ' + msg);
    } catch (e) {}
  }
  function guard(fn, key) {
    return function () {
      try { return fn.apply(this, arguments); }
      catch (e) { warn(key || 'guard', (key || 'handler') + ' threw — ignored.', e); }
    };
  }
  function isFn(f) { return typeof f === 'function'; }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function Core() { return AOW.Core || null; }
  function ST() { var c = AOW.Core; return (c && c.state) ? c.state : null; }
  function Econ() { return AOW.Economy || null; }
  function Sim() { return AOW.Sim || null; }
  function Camp() { return AOW.Campaign || null; }
  function Rend() { return AOW.Render || null; }

  /** Subscribe to the bus without ever exploding when Core is absent. */
  var _subs = [];
  function on(name, fn) {
    var c = Core();
    if (!c || !isFn(c.on)) { warn('bus', 'AOW.Core missing — UI cannot listen to "' + name + '".'); return function () {}; }
    var off = c.on(name, guard(fn, 'on:' + name));
    _subs.push(off);
    return off;
  }
  function emit(name, payload) {
    var c = Core();
    if (!c || !isFn(c.emit)) return;
    try { c.emit(name, payload); } catch (e) { warn('emit', 'emit("' + name + '") failed', e); }
  }

  /**
   * Fire a player intent. Emits `ui:intent` first so an integrator can veto or
   * handle it, then invokes the owning module's public API defensively.
   * @param {string} action
   * @param {object} data
   * @param {function} run  the fallback module call
   */
  var _intent = { action: '', data: null, handled: false };
  function intent(action, data, run) {
    _intent.action = action; _intent.data = data || null; _intent.handled = false;
    emit('ui:intent', _intent);
    if (_intent.handled) return true;
    if (!isFn(run)) return false;
    try { return run() !== false; }
    catch (e) { warn('intent:' + action, 'intent "' + action + '" failed', e); return false; }
  }

  /* --- DOM sugar ----------------------------------------------------------- */
  function el(tag, cls, txt, parent) {
    if (!doc) return null;
    var n = doc.createElement(tag || 'div');
    if (cls) n.className = cls;
    if (txt !== undefined && txt !== null && txt !== '') n.textContent = String(txt);
    if (parent && parent.appendChild) parent.appendChild(n);
    return n;
  }
  function svg(tag, parent) {
    if (!doc) return null;
    var n = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    if (parent && parent.appendChild) parent.appendChild(n);
    return n;
  }
  function attr(n, k, v) { if (n && n.setAttribute) n.setAttribute(k, v); return n; }
  function clear(n) { if (n) { while (n.firstChild) n.removeChild(n.firstChild); } return n; }
  function show(n, v) { if (n) n.classList[v ? 'add' : 'remove']('is-on'); }
  function txt(n, s) { if (n && n.textContent !== s) n.textContent = s; return n; }
  function cls(n, name, v) { if (n && n.classList) n.classList[v ? 'add' : 'remove'](name); return n; }
  function tap(n, fn, key) {
    if (!n || !n.addEventListener) return n;
    var h = guard(function (ev) {
      if (ev && ev.type === 'keydown') {
        var k = ev.key;
        if (k !== 'Enter' && k !== ' ' && k !== 'Spacebar') return;
        ev.preventDefault();
      }
      haptic('tap');
      fn(ev);
    }, key || 'tap');
    n.addEventListener('click', h, false);
    if (n.tagName !== 'BUTTON' && n.tagName !== 'INPUT' && n.tagName !== 'SELECT') {
      n.addEventListener('keydown', h, false);
      if (!n.hasAttribute('tabindex')) n.setAttribute('tabindex', '0');
      if (!n.hasAttribute('role')) n.setAttribute('role', 'button');
    }
    return n;
  }
  function fmt(n) {
    n = Math.round(num(n, 0));
    if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 10000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(n);
  }
  function fmtTime(s) {
    s = Math.max(0, Math.floor(num(s, 0)));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---------------------------------------------------------------------------
   * 1. UI-local preferences (separate from Core.state.settings, which the game
   *    owns). Stored under their own key so a save wipe keeps accessibility.
   * ------------------------------------------------------------------------ */
  var PREF_KEY = 'aow2_3d_ui_v1';
  var prefs = {
    scale: 1,             // 0.85 .. 1.35
    colorblind: false,    // blue/orange team palette
    reducedMotion: false,
    hand: 'right',        // 'right' | 'left'
    devOverlay: false,
    tutorialDone: false,
    coachSeen: {},
    minimap: true,
    compact: false
  };

  function loadPrefs() {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(PREF_KEY) : null;
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return;
      for (var k in prefs) {
        if (!Object.prototype.hasOwnProperty.call(d, k)) continue;
        if (typeof d[k] === typeof prefs[k] && d[k] !== null) prefs[k] = d[k];
      }
      if (!prefs.coachSeen || typeof prefs.coachSeen !== 'object') prefs.coachSeen = {};
    } catch (e) { warn('prefs:load', 'could not read UI prefs — using defaults.', e); }
  }
  function savePrefs() {
    try {
      if (global.localStorage) global.localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch (e) { warn('prefs:save', 'could not persist UI prefs.', e); }
  }

  function prefersReducedMotion() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  function motionOff() { return prefs.reducedMotion; }

  /* --- haptics ------------------------------------------------------------- */
  var HAPTIC = { tap: 8, soft: 12, hit: 20, heavy: [0, 24, 30, 24], win: [0, 30, 40, 60] };
  var _lastHaptic = 0;
  function haptic(kind) {
    try {
      var s = ST();
      if (s && s.settings && s.settings.haptics === false) return;
      if (!global.navigator || !isFn(global.navigator.vibrate)) return;
      var now = Date.now();
      if (now - _lastHaptic < 40) return;
      _lastHaptic = now;
      global.navigator.vibrate(HAPTIC[kind] || 8);
    } catch (e) { /* vibrate can throw in some embedded views */ }
  }

  /* ---------------------------------------------------------------------------
   * 2. Era skins — the whole UI reskins as you evolve
   * ------------------------------------------------------------------------ */
  var ERA_SKIN = [
    /* Stone      */ { accent: '#d8a15a', accent2: '#8fbf6a', metal: '#6b5a48', metal2: '#4a3d31', ink: '#f3e6cf', glow: '#ffcf8a', name: 'Stone' },
    /* Bronze     */ { accent: '#e6a94b', accent2: '#c98a3a', metal: '#7a5a34', metal2: '#523a20', ink: '#f7e9d2', glow: '#ffc46a', name: 'Bronze' },
    /* Iron       */ { accent: '#cfd6de', accent2: '#8fa2b5', metal: '#54606c', metal2: '#39434d', ink: '#eef3f8', glow: '#bcd4ee', name: 'Iron' },
    /* Medieval   */ { accent: '#e2c15c', accent2: '#a3324a', metal: '#5b4a3c', metal2: '#3c3128', ink: '#f6ecd8', glow: '#ffd978', name: 'Medieval' },
    /* Gunpowder  */ { accent: '#e08d3c', accent2: '#7d5b3a', metal: '#4f4438', metal2: '#332c24', ink: '#f5e7d3', glow: '#ffb35e', name: 'Gunpowder' },
    /* Industrial */ { accent: '#c98a2e', accent2: '#5f7d8c', metal: '#4a4a4a', metal2: '#2f3132', ink: '#eceff1', glow: '#ffc061', name: 'Industrial' },
    /* Modern     */ { accent: '#5fc98b', accent2: '#3f7f9e', metal: '#3c4b44', metal2: '#26302c', ink: '#e9f5ee', glow: '#8dffc0', name: 'Modern' },
    /* Future     */ { accent: '#66e8ff', accent2: '#b06bff', metal: '#2b3550', metal2: '#1a2135', ink: '#e8f6ff', glow: '#8ef0ff', name: 'Future' }
  ];
  function skinFor(i) { return ERA_SKIN[clamp(i | 0, 0, ERA_SKIN.length - 1)] || ERA_SKIN[0]; }

  var RARITY = {
    common:    { name: 'Common',    color: '#c9d2dc' },
    uncommon:  { name: 'Uncommon',  color: '#6fd08a' },
    rare:      { name: 'Rare',      color: '#5aa8ff' },
    epic:      { name: 'Epic',      color: '#b478ff' },
    legendary: { name: 'Legendary', color: '#ffb648' },
    mythic:    { name: 'Mythic',    color: '#ff6a6a' }
  };
  function rarityOf(r) { return RARITY[String(r || 'common').toLowerCase()] || RARITY.common; }

  var CLASS_GLYPH = {
    defender: '◬', assault: '⚔', ranged: '➶',
    specialist: '✦', champion: '♜', boss: '☠'
  };
  var CLASS_NAME = {
    defender: 'Shield', assault: 'Shock', ranged: 'Ranged',
    specialist: 'Support', champion: 'Champion', boss: 'Boss'
  };
  function glyphFor(c) { return CLASS_GLYPH[c] || '◆'; }

  /* ---------------------------------------------------------------------------
   * 3. The design system — tokens, skin, typography, layout primitives
   * ------------------------------------------------------------------------ */
  var CSS_TOKENS = `
#aow-ui, #aow-ui * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
#aow-ui {
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px; --sp-6: 32px; --sp-7: 48px;
  --r-1: 6px; --r-2: 10px; --r-3: 14px; --r-4: 20px; --r-pill: 999px;

  --f-xs: 10px; --f-sm: 12px; --f-md: 14px; --f-lg: 17px; --f-xl: 22px; --f-2xl: 30px; --f-3xl: 44px;
  --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-title: "Trajan Pro", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;

  --accent: #e2c15c; --accent2: #a3324a; --glow: #ffd978;
  --metal: #5b4a3c; --metal2: #3c3128; --ink: #f6ecd8;
  --ink-dim: rgba(246,236,216,.62); --ink-faint: rgba(246,236,216,.34);

  --parch-1: #efe0c0; --parch-2: #d9c49b; --parch-ink: #2b2015;

  --bg-0: rgba(10,9,8,.92); --bg-1: rgba(22,19,16,.90); --bg-2: rgba(34,29,24,.86);
  --stroke: rgba(255,232,190,.16); --stroke-hi: rgba(255,232,190,.34);

  --good: #6fd08a; --warn: #ffc061; --bad: #ff6a6a; --info: #7fc4ff;
  --team-you: #57c7ff; --team-foe: #ff6b4d;
  --gold: #ffcf5c; --gem: #7ce4ff;

  --sh-1: 0 1px 2px rgba(0,0,0,.5);
  --sh-2: 0 4px 14px rgba(0,0,0,.45), 0 1px 0 rgba(255,255,255,.06) inset;
  --sh-3: 0 12px 40px rgba(0,0,0,.6), 0 1px 0 rgba(255,255,255,.08) inset;
  --sh-glow: 0 0 18px rgba(255,207,92,.35);

  --e-out: cubic-bezier(.16,1,.3,1);
  --e-in: cubic-bezier(.4,0,1,1);
  --e-back: cubic-bezier(.34,1.56,.64,1);
  --t-fast: 120ms; --t-mid: 220ms; --t-slow: 420ms;

  --safe-t: env(safe-area-inset-top, 0px); --safe-b: env(safe-area-inset-bottom, 0px);
  --safe-l: env(safe-area-inset-left, 0px); --safe-r: env(safe-area-inset-right, 0px);

  --ui-scale: 1;

  position: fixed; inset: 0; z-index: 40;
  font-family: var(--font-ui); color: var(--ink);
  font-size: calc(14px * var(--ui-scale));
  pointer-events: none; overflow: hidden;
  user-select: none; -webkit-user-select: none; touch-action: manipulation;
  -webkit-font-smoothing: antialiased;
}
#aow-ui[data-cb="1"] { --team-you: #2f8fe0; --team-foe: #ff9e2c; }
#aow-ui[data-motion="reduced"] *,
#aow-ui[data-motion="reduced"] *::before,
#aow-ui[data-motion="reduced"] *::after {
  animation-duration: 1ms !important; animation-iteration-count: 1 !important;
  transition-duration: 1ms !important;
}
#aow-ui .clickable { pointer-events: auto; cursor: pointer; }
#aow-ui button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; pointer-events: auto; }
#aow-ui :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--r-1); }
#aow-ui .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* --- forged metal / parchment surfaces ----------------------------------- */
#aow-ui .plate {
  position: relative; background:
    linear-gradient(180deg, rgba(255,255,255,.07), rgba(0,0,0,.10) 46%, rgba(0,0,0,.26)),
    linear-gradient(180deg, var(--metal), var(--metal2));
  border: 1px solid var(--stroke); border-radius: var(--r-3);
  box-shadow: var(--sh-2);
}
#aow-ui .plate::after {
  content: ''; position: absolute; inset: 1px; border-radius: inherit; pointer-events: none;
  background: linear-gradient(180deg, rgba(255,255,255,.10), transparent 30%);
  mix-blend-mode: overlay;
}
#aow-ui .glass {
  background: linear-gradient(180deg, var(--bg-1), var(--bg-0));
  border: 1px solid var(--stroke); border-radius: var(--r-3);
  box-shadow: var(--sh-2); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px);
}
#aow-ui .parch {
  background:
    radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.5), transparent 60%),
    linear-gradient(160deg, var(--parch-1), var(--parch-2));
  color: var(--parch-ink);
  border: 1px solid rgba(60,42,22,.35); border-radius: var(--r-2);
  box-shadow: inset 0 0 40px rgba(120,84,40,.25), var(--sh-2);
}
#aow-ui .rivet { position: absolute; width: 5px; height: 5px; border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #d9c9a8, #6a5a44 60%, #2c241a);
  box-shadow: 0 1px 1px rgba(0,0,0,.6); opacity: .8; }
#aow-ui .title { font-family: var(--font-title); letter-spacing: .06em; text-transform: uppercase; }
#aow-ui .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
#aow-ui .num { font-variant-numeric: tabular-nums; letter-spacing: .01em; }
#aow-ui .dim { color: var(--ink-dim); }
#aow-ui .faint { color: var(--ink-faint); }
`;

  var CSS_HUD = `
/* ============================ TOP HUD ==================================== */
#aow-ui .top {
  position: absolute; top: calc(var(--safe-t) + var(--sp-2));
  left: calc(var(--safe-l) + var(--sp-2)); right: calc(var(--safe-r) + var(--sp-2));
  display: grid; grid-template-columns: auto 1fr auto; align-items: start; gap: var(--sp-3);
}
#aow-ui .res { display: flex; flex-direction: column; gap: var(--sp-1); }
#aow-ui .res-chip {
  display: flex; align-items: center; gap: var(--sp-2);
  padding: 5px 12px 5px 6px; border-radius: var(--r-pill);
  min-width: 104px; pointer-events: auto;
  transition: transform var(--t-mid) var(--e-back), box-shadow var(--t-mid);
}
#aow-ui .res-chip .coin {
  width: 22px; height: 22px; border-radius: 50%; flex: none;
  display: grid; place-items: center; font-size: 12px; font-weight: 700; color: #4a3208;
  background: radial-gradient(circle at 32% 28%, #fff3c4, var(--gold) 46%, #a5701a);
  box-shadow: 0 1px 2px rgba(0,0,0,.55), inset 0 -2px 3px rgba(0,0,0,.25);
}
#aow-ui .res-chip.gem .coin {
  color: #05343f;
  background: radial-gradient(circle at 32% 28%, #eafcff, var(--gem) 46%, #1c88a5);
}
#aow-ui .res-chip .val { font-size: var(--f-lg); font-weight: 700; letter-spacing: .02em; }
#aow-ui .res-chip .rate { font-size: var(--f-xs); color: var(--ink-dim); margin-left: auto; }
#aow-ui .res-chip.pop { animation: chipPop 420ms var(--e-back); }
#aow-ui .res-chip.pop .coin { animation: coinSpin 520ms var(--e-out); }
@keyframes chipPop { 0% { transform: scale(1); } 34% { transform: scale(1.12); } 100% { transform: scale(1); } }
@keyframes coinSpin { 0% { transform: rotateY(0); } 100% { transform: rotateY(360deg); } }
#aow-ui .res-chip.low { box-shadow: var(--sh-2), 0 0 0 1px rgba(255,106,106,.5); }

#aow-ui .wavebox { justify-self: center; min-width: min(320px, 62vw); padding: var(--sp-2) var(--sp-3); text-align: center; }
#aow-ui .wavebox .wl { display: flex; align-items: baseline; justify-content: center; gap: var(--sp-2); }
#aow-ui .wavebox .wname { font-family: var(--font-title); font-size: var(--f-md); letter-spacing: .12em; color: var(--accent); }
#aow-ui .wavebox .wsub { font-size: var(--f-xs); color: var(--ink-dim); letter-spacing: .08em; text-transform: uppercase; }
#aow-ui .wavebox.boss .wname { color: var(--bad); text-shadow: 0 0 12px rgba(255,80,80,.6); }
#aow-ui .comp { display: flex; gap: var(--sp-1); justify-content: center; flex-wrap: wrap; margin-top: 5px; }
#aow-ui .comp .cchip {
  display: inline-flex; align-items: center; gap: 3px; font-size: var(--f-xs);
  padding: 2px 7px; border-radius: var(--r-pill);
  background: rgba(255,107,77,.14); border: 1px solid rgba(255,107,77,.32); color: #ffd0c4;
  animation: chipIn 320ms var(--e-back) backwards;
}
#aow-ui .comp .cchip.boss { background: rgba(255,60,60,.22); border-color: rgba(255,80,80,.6); color: #ffdede; }
@keyframes chipIn { from { opacity: 0; transform: translateY(-6px) scale(.9); } }
#aow-ui .wtimer { height: 3px; margin-top: 6px; border-radius: 2px; background: rgba(0,0,0,.45); overflow: hidden; }
#aow-ui .wtimer i { display: block; height: 100%; width: 100%; transform-origin: left center;
  background: linear-gradient(90deg, var(--accent), var(--glow)); box-shadow: 0 0 8px var(--glow); }

#aow-ui .topright { display: flex; flex-direction: column; align-items: flex-end; gap: var(--sp-2); }
#aow-ui .erapill {
  display: flex; align-items: center; gap: var(--sp-2); padding: 5px 12px; border-radius: var(--r-pill);
  pointer-events: auto;
}
#aow-ui .erapill .en { font-family: var(--font-title); font-size: var(--f-sm); letter-spacing: .14em; color: var(--accent); }
#aow-ui .erapill .ei { font-size: var(--f-xs); color: var(--ink-faint); }
#aow-ui .erapill .eprog { width: 44px; height: 4px; border-radius: 2px; background: rgba(0,0,0,.5); overflow: hidden; }
#aow-ui .erapill .eprog i { display: block; height: 100%; width: 0%;
  background: linear-gradient(90deg, var(--accent2), var(--accent)); transition: width var(--t-slow) var(--e-out); }
#aow-ui .erapill.ready { box-shadow: var(--sh-2), 0 0 16px var(--glow); animation: pulseSoft 1.8s infinite; }
@keyframes pulseSoft { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.22); } }

#aow-ui .iconrow { display: flex; gap: var(--sp-1); }
#aow-ui .ibtn {
  width: 34px; height: 34px; border-radius: var(--r-2); display: grid; place-items: center;
  font-size: 15px; color: var(--ink); pointer-events: auto;
  transition: transform var(--t-fast) var(--e-out), filter var(--t-fast);
}
#aow-ui .ibtn:hover { filter: brightness(1.18); }
#aow-ui .ibtn:active { transform: scale(.92); }
#aow-ui .ibtn.on { color: #201a10; background: linear-gradient(180deg, var(--glow), var(--accent)); }

/* ============================ FORT BARS ================================== */
#aow-ui .forts {
  position: absolute; top: calc(var(--safe-t) + 64px);
  left: calc(var(--safe-l) + var(--sp-2)); right: calc(var(--safe-r) + var(--sp-2));
  display: flex; justify-content: space-between; gap: var(--sp-3); pointer-events: none;
}
#aow-ui .fort { width: min(230px, 34vw); }
#aow-ui .fort .fhead { display: flex; align-items: center; gap: 6px; font-size: var(--f-xs);
  letter-spacing: .1em; text-transform: uppercase; color: var(--ink-dim); margin-bottom: 3px; }
#aow-ui .fort.foe .fhead { flex-direction: row-reverse; }
#aow-ui .fort .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--team-you); box-shadow: 0 0 8px var(--team-you); }
#aow-ui .fort.foe .dot { background: var(--team-foe); box-shadow: 0 0 8px var(--team-foe); }
#aow-ui .fort .tier { margin-left: auto; color: var(--accent); letter-spacing: .16em; }
#aow-ui .fort.foe .tier { margin-left: 0; margin-right: auto; }
#aow-ui .bar {
  position: relative; height: 13px; border-radius: var(--r-1); overflow: hidden;
  background: linear-gradient(180deg, #16110c, #0b0907);
  border: 1px solid var(--stroke); box-shadow: inset 0 2px 6px rgba(0,0,0,.7);
}
#aow-ui .bar .ghost, #aow-ui .bar .fill {
  position: absolute; inset: 0; transform-origin: left center; will-change: transform;
}
#aow-ui .fort.foe .bar .ghost, #aow-ui .fort.foe .bar .fill { transform-origin: right center; }
#aow-ui .bar .ghost { background: linear-gradient(180deg, #ffe8b0, #ff9d5e); opacity: .55; }
#aow-ui .bar .fill { background: linear-gradient(180deg, #8ef0b4, var(--team-you) 55%, #2a86c7); }
#aow-ui .fort.foe .bar .fill { background: linear-gradient(180deg, #ffc0ae, var(--team-foe) 55%, #b53a20); }
#aow-ui .bar .gloss { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255,255,255,.28), transparent 52%); }
#aow-ui .bar .ticks { position: absolute; inset: 0;
  background: repeating-linear-gradient(90deg, transparent 0 24%, rgba(0,0,0,.35) 24% 25%); }
#aow-ui .bar .hpn { position: absolute; inset: 0; display: grid; place-items: center;
  font-size: var(--f-xs); font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,.9); font-variant-numeric: tabular-nums; }
#aow-ui .fort.hurt .bar { animation: barShake 260ms var(--e-out); }
@keyframes barShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 60% { transform: translateX(2px); } }
#aow-ui .fort.crit .bar { box-shadow: inset 0 2px 6px rgba(0,0,0,.7), 0 0 14px rgba(255,70,70,.65); }

/* ============================ MINIMAP / ARMY ============================= */
/* The minimap used to sit at left:50% — dead centre, directly over the combat
   the player is trying to watch. Competitors keep the centre 60% of frame
   clear for fighting. Moved to the top-left gutter and dimmed until touched. */
#aow-ui .mini {
  position: absolute; left: calc(var(--safe-l) + 10px); transform: none;
  top: calc(var(--safe-t) + 96px); bottom: auto; opacity: .62;
  padding: 5px; border-radius: var(--r-2); pointer-events: auto;
  transition: opacity var(--t-mid);
}
#aow-ui .mini:hover, #aow-ui .mini:active { opacity: 1; }
#aow-ui .mini canvas { display: block; width: 176px; height: 34px; border-radius: 4px; }
#aow-ui .mini.off { display: none; }
#aow-ui .army {
  position: absolute; bottom: calc(var(--safe-b) + 128px); left: calc(var(--safe-l) + var(--sp-2));
  display: flex; align-items: center; gap: var(--sp-2); padding: 4px 10px; border-radius: var(--r-pill);
}
#aow-ui .army .n { font-size: var(--f-md); font-weight: 700; }
#aow-ui .army .cap { font-size: var(--f-xs); color: var(--ink-dim); }
#aow-ui .army .q { font-size: var(--f-xs); color: var(--accent); }
#aow-ui .army.full { box-shadow: var(--sh-2), 0 0 0 1px rgba(255,192,97,.55); }
#aow-ui .streak {
  position: absolute; top: calc(var(--safe-t) + 108px); left: 50%; transform: translateX(-50%);
  font-family: var(--font-title); font-size: var(--f-lg); letter-spacing: .18em; color: var(--glow);
  text-shadow: 0 0 18px var(--glow), 0 2px 4px rgba(0,0,0,.8);
  opacity: 0; pointer-events: none; transition: opacity var(--t-mid);
}
#aow-ui .streak.is-on { opacity: 1; animation: streakPop 380ms var(--e-back); }
@keyframes streakPop { 0% { transform: translateX(-50%) scale(.6); } 60% { transform: translateX(-50%) scale(1.14); } 100% { transform: translateX(-50%) scale(1); } }
`;

  var CSS_BAR = `
/* ============================ UNIT BAR =================================== */
#aow-ui .bottom {
  position: absolute; left: calc(var(--safe-l) + var(--sp-2)); right: calc(var(--safe-r) + var(--sp-2));
  bottom: calc(var(--safe-b) + var(--sp-2));
  display: flex; align-items: flex-end; gap: var(--sp-3); pointer-events: none;
}
#aow-ui[data-hand="left"] .bottom { flex-direction: row-reverse; }
#aow-ui .cards {
  flex: 1 1 auto; display: flex; gap: var(--sp-2); overflow-x: auto; overflow-y: visible;
  padding: 2px; scrollbar-width: none; pointer-events: auto;
}
#aow-ui .cards::-webkit-scrollbar { display: none; }
#aow-ui .card {
  position: relative; flex: 0 0 auto; width: 74px; padding: 6px 6px 7px; border-radius: var(--r-3);
  display: flex; flex-direction: column; align-items: center; gap: 2px; pointer-events: auto;
  transition: transform var(--t-fast) var(--e-out), filter var(--t-mid), opacity var(--t-mid);
  animation: cardIn 340ms var(--e-back) backwards;
}
@keyframes cardIn { from { opacity: 0; transform: translateY(14px) scale(.9); } }
#aow-ui .card:active { transform: translateY(2px) scale(.96); }
#aow-ui .card .icon {
  width: 40px; height: 40px; border-radius: var(--r-2); display: grid; place-items: center;
  font-size: 21px; color: var(--ink);
  background: radial-gradient(circle at 35% 25%, rgba(255,255,255,.16), transparent 62%),
              linear-gradient(180deg, rgba(0,0,0,.18), rgba(0,0,0,.44));
  border: 1px solid var(--stroke); text-shadow: 0 2px 4px rgba(0,0,0,.7);
}
#aow-ui .card[data-cls="defender"] .icon { box-shadow: inset 0 0 18px rgba(90,168,255,.25); }
#aow-ui .card[data-cls="assault"] .icon { box-shadow: inset 0 0 18px rgba(255,106,106,.25); }
#aow-ui .card[data-cls="ranged"] .icon { box-shadow: inset 0 0 18px rgba(111,208,138,.25); }
#aow-ui .card[data-cls="specialist"] .icon { box-shadow: inset 0 0 18px rgba(180,120,255,.25); }
#aow-ui .card[data-cls="champion"] .icon { box-shadow: inset 0 0 18px rgba(255,182,72,.32); }
#aow-ui .card .nm { font-size: var(--f-xs); letter-spacing: .04em; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#aow-ui .card .cost { display: flex; align-items: center; gap: 3px; font-size: var(--f-sm); font-weight: 700; color: var(--gold); }
#aow-ui .card .cost::before { content: ''; width: 9px; height: 9px; border-radius: 50%;
  background: radial-gradient(circle at 32% 28%, #fff3c4, var(--gold) 50%, #a5701a); }
#aow-ui .card .key {
  position: absolute; top: 4px; left: 5px; font-size: 9px; line-height: 1; padding: 2px 4px;
  border-radius: 4px; background: rgba(0,0,0,.55); color: var(--ink-faint); font-family: var(--font-mono);
}
#aow-ui .card .qn {
  position: absolute; top: 3px; right: 3px; min-width: 17px; height: 17px; padding: 0 4px;
  border-radius: var(--r-pill); display: none; place-items: center; font-size: 10px; font-weight: 700;
  color: #22190a; background: linear-gradient(180deg, var(--glow), var(--accent)); box-shadow: var(--sh-1);
}
#aow-ui .card.queued .qn { display: grid; animation: chipPop 300ms var(--e-back); }
#aow-ui .card .cd {
  position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: conic-gradient(rgba(6,6,8,.72) var(--cd, 0turn), transparent 0);
  opacity: 0; transition: opacity var(--t-fast);
}
#aow-ui .card.cooling .cd { opacity: 1; }
#aow-ui .card.poor { filter: grayscale(.75) brightness(.7); }
#aow-ui .card.poor .cost { color: var(--bad); }
#aow-ui .card.locked { opacity: .38; pointer-events: none; filter: grayscale(1); }
#aow-ui .card.flash { animation: cardFlash 380ms var(--e-out); }
@keyframes cardFlash { 0% { box-shadow: 0 0 0 0 var(--glow); } 100% { box-shadow: 0 0 0 14px rgba(255,207,92,0); } }
#aow-ui .card.deny { animation: denyShake 320ms var(--e-out); }
@keyframes denyShake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 45% { transform: translateX(4px); } 70% { transform: translateX(-2px); } }

/* --- action rail --------------------------------------------------------- */
#aow-ui .rail { flex: 0 0 auto; display: flex; flex-direction: column; gap: var(--sp-2); align-items: flex-end; pointer-events: auto; }
#aow-ui .railrow { display: flex; gap: var(--sp-2); }
#aow-ui .act {
  position: relative; min-width: 52px; height: 46px; padding: 0 10px; border-radius: var(--r-3);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
  transition: transform var(--t-fast) var(--e-out), filter var(--t-fast);
}
#aow-ui .act:active { transform: scale(.94); }
#aow-ui .act .g { font-size: 17px; line-height: 1; }
#aow-ui .act .l { font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-dim); }
#aow-ui .act.primary { background: linear-gradient(180deg, var(--accent), var(--accent2)); color: #241a08; border-color: rgba(255,255,255,.2); }
#aow-ui .act.primary .l { color: rgba(30,20,4,.75); }
#aow-ui .act.ready { box-shadow: var(--sh-2), 0 0 20px var(--glow); animation: pulseSoft 1.6s infinite; }
#aow-ui .act.disabled { opacity: .42; pointer-events: none; }
#aow-ui .act .pw {
  position: absolute; left: 4px; right: 4px; bottom: 3px; height: 3px; border-radius: 2px;
  background: rgba(0,0,0,.5); overflow: hidden;
}
#aow-ui .act .pw i { display: block; height: 100%; width: 0%;
  background: linear-gradient(90deg, var(--accent2), var(--glow)); transition: width 180ms linear; }

/* --- hold-for-stats tooltip --------------------------------------------- */
#aow-ui .tip {
  position: absolute; z-index: 6; min-width: 168px; max-width: 260px; padding: var(--sp-3);
  border-radius: var(--r-3); pointer-events: none; opacity: 0; transform: translateY(8px) scale(.96);
  transition: opacity var(--t-mid) var(--e-out), transform var(--t-mid) var(--e-out);
}
#aow-ui .tip.is-on { opacity: 1; transform: translateY(0) scale(1); }
#aow-ui .tip h4 { font-family: var(--font-title); font-size: var(--f-md); letter-spacing: .08em; color: var(--accent); }
#aow-ui .tip .role { font-size: var(--f-xs); text-transform: uppercase; letter-spacing: .12em; color: var(--ink-faint); margin-bottom: 6px; }
#aow-ui .tip .stat { display: flex; justify-content: space-between; gap: var(--sp-3); font-size: var(--f-sm); padding: 2px 0; }
#aow-ui .tip .stat b { font-weight: 700; font-variant-numeric: tabular-nums; }
#aow-ui .tip .sbar { height: 4px; border-radius: 2px; background: rgba(0,0,0,.5); overflow: hidden; margin-top: 2px; }
#aow-ui .tip .sbar i { display: block; height: 100%; background: linear-gradient(90deg, var(--accent2), var(--accent)); }
#aow-ui .tip .traits { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
#aow-ui .tip .traits span { font-size: 9px; letter-spacing: .06em; text-transform: uppercase;
  padding: 2px 6px; border-radius: var(--r-pill); background: rgba(255,255,255,.08); border: 1px solid var(--stroke); }
`;

  var CSS_PANEL = `
/* ============================ MODAL PANELS =============================== */
#aow-ui .scrim {
  position: absolute; inset: 0; background: radial-gradient(120% 100% at 50% 0%, rgba(10,8,6,.62), rgba(4,3,3,.86));
  opacity: 0; pointer-events: none; transition: opacity var(--t-mid) var(--e-out);
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
}
#aow-ui .scrim.is-on { opacity: 1; pointer-events: auto; }
#aow-ui .modal {
  position: absolute; inset: 0; display: grid; place-items: center;
  padding: calc(var(--safe-t) + var(--sp-3)) calc(var(--safe-r) + var(--sp-3))
           calc(var(--safe-b) + var(--sp-3)) calc(var(--safe-l) + var(--sp-3));
  pointer-events: none;
}
#aow-ui .panel {
  position: relative; width: min(720px, 100%); max-height: 100%; display: flex; flex-direction: column;
  pointer-events: auto; opacity: 0; transform: translateY(18px) scale(.97);
  transition: opacity var(--t-mid) var(--e-out), transform var(--t-mid) var(--e-back);
  overflow: hidden;
}
#aow-ui .panel.is-on { opacity: 1; transform: none; }
#aow-ui .panel.wide { width: min(920px, 100%); }
#aow-ui .panel.slim { width: min(440px, 100%); }
#aow-ui .phead {
  display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--stroke);
  background: linear-gradient(180deg, rgba(255,255,255,.06), transparent);
}
#aow-ui .phead h2 { font-family: var(--font-title); font-size: var(--f-lg); letter-spacing: .14em; color: var(--accent); }
#aow-ui .phead .sub { font-size: var(--f-xs); color: var(--ink-dim); letter-spacing: .06em; }
#aow-ui .phead .spacer { flex: 1; }
#aow-ui .pclose { width: 32px; height: 32px; border-radius: var(--r-2); display: grid; place-items: center;
  font-size: 15px; background: rgba(0,0,0,.3); border: 1px solid var(--stroke); }
#aow-ui .pclose:hover { background: rgba(255,80,80,.22); }
#aow-ui .pbody { padding: var(--sp-4); overflow-y: auto; overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; gap: var(--sp-4); }
#aow-ui .pfoot { display: flex; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4);
  border-top: 1px solid var(--stroke); background: rgba(0,0,0,.24); }
#aow-ui .pfoot .spacer { flex: 1; }
#aow-ui .tabs { display: flex; gap: var(--sp-1); flex-wrap: wrap; }
#aow-ui .tabs .tb { padding: 5px 12px; border-radius: var(--r-pill); font-size: var(--f-sm);
  border: 1px solid var(--stroke); background: rgba(0,0,0,.28); color: var(--ink-dim); }
#aow-ui .tabs .tb.on { color: #241a08; background: linear-gradient(180deg, var(--glow), var(--accent)); border-color: transparent; }

#aow-ui .btn {
  padding: 10px 18px; border-radius: var(--r-2); font-size: var(--f-md); font-weight: 600;
  border: 1px solid var(--stroke-hi); background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(0,0,0,.28));
  transition: transform var(--t-fast) var(--e-out), filter var(--t-fast);
}
#aow-ui .btn:hover { filter: brightness(1.18); }
#aow-ui .btn:active { transform: translateY(1px) scale(.985); }
#aow-ui .btn.cta { color: #241a08; background: linear-gradient(180deg, var(--glow), var(--accent)); border-color: rgba(255,255,255,.28);
  box-shadow: var(--sh-2), 0 0 18px rgba(255,207,92,.28); }
#aow-ui .btn.danger { color: #fff; background: linear-gradient(180deg, #c2483a, #7d2a20); }
#aow-ui .btn[disabled] { opacity: .4; pointer-events: none; }
#aow-ui .btn.sm { padding: 6px 12px; font-size: var(--f-sm); }

#aow-ui .grid { display: grid; gap: var(--sp-3); grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
#aow-ui .sect > h3 { font-family: var(--font-title); font-size: var(--f-sm); letter-spacing: .16em;
  color: var(--ink-dim); margin-bottom: var(--sp-2); }
#aow-ui .item {
  padding: var(--sp-3); border-radius: var(--r-2); display: flex; flex-direction: column; gap: 4px;
  border: 1px solid var(--stroke); background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(0,0,0,.26));
  transition: transform var(--t-fast) var(--e-out), border-color var(--t-fast);
}
#aow-ui .item:hover { border-color: var(--stroke-hi); transform: translateY(-2px); }
#aow-ui .item .t { font-size: var(--f-md); font-weight: 600; }
#aow-ui .item .d { font-size: var(--f-sm); color: var(--ink-dim); line-height: 1.36; }
#aow-ui .item .row { display: flex; align-items: center; gap: var(--sp-2); margin-top: auto; padding-top: var(--sp-2); }
#aow-ui .item .price { font-weight: 700; color: var(--gold); font-variant-numeric: tabular-nums; }
#aow-ui .item .price.gem { color: var(--gem); }
#aow-ui .item.owned { border-color: rgba(111,208,138,.45); }
#aow-ui .item.poor .price { color: var(--bad); }

/* --- upgrade tree with connectors --------------------------------------- */
#aow-ui .tree { display: grid; gap: var(--sp-4); grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
#aow-ui .branch { display: flex; flex-direction: column; align-items: stretch; gap: 0; }
#aow-ui .branch > .bh { font-family: var(--font-title); font-size: var(--f-sm); letter-spacing: .14em;
  text-align: center; padding-bottom: var(--sp-2); }
#aow-ui .node {
  position: relative; padding: var(--sp-3); border-radius: var(--r-2); text-align: center;
  border: 1px solid var(--stroke); background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.3));
}
#aow-ui .node + .conn { height: 22px; position: relative; }
#aow-ui .conn i { position: absolute; left: 50%; top: 0; bottom: 0; width: 3px; margin-left: -1.5px;
  background: rgba(255,255,255,.12); border-radius: 2px; overflow: hidden; }
#aow-ui .conn i::after { content: ''; position: absolute; inset: 0; transform: scaleY(var(--fill, 0)); transform-origin: top;
  background: linear-gradient(180deg, var(--accent), var(--accent2)); transition: transform var(--t-slow) var(--e-out); }
#aow-ui .node .nt { font-size: var(--f-md); font-weight: 600; }
#aow-ui .node .nd { font-size: var(--f-xs); color: var(--ink-dim); line-height: 1.35; margin: 3px 0 6px; }
#aow-ui .node .pips { display: flex; gap: 3px; justify-content: center; margin-bottom: 6px; }
#aow-ui .node .pips i { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.16); }
#aow-ui .node .pips i.on { background: var(--accent); box-shadow: 0 0 8px var(--glow); }
#aow-ui .node.maxed { border-color: rgba(255,207,92,.5); box-shadow: 0 0 18px rgba(255,207,92,.16) inset; }
#aow-ui .node.locked { opacity: .55; }

/* --- perk choice --------------------------------------------------------- */
#aow-ui .perks { display: grid; gap: var(--sp-3); grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
#aow-ui .perk {
  position: relative; padding: var(--sp-4) var(--sp-3); border-radius: var(--r-3); text-align: center;
  border: 1px solid var(--rc, var(--stroke)); overflow: hidden;
  background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(0,0,0,.34));
  animation: perkIn 460ms var(--e-back) backwards;
  transition: transform var(--t-mid) var(--e-out), box-shadow var(--t-mid);
}
#aow-ui .perk::before { content: ''; position: absolute; inset: -40% -40% auto -40%; height: 140%;
  background: radial-gradient(closest-side, var(--rc), transparent 70%); opacity: .18; pointer-events: none; }
#aow-ui .perk:hover { transform: translateY(-4px); box-shadow: 0 0 28px -6px var(--rc); }
@keyframes perkIn { from { opacity: 0; transform: translateY(26px) rotateX(18deg); } }
#aow-ui .perk .rar { font-size: 9px; letter-spacing: .18em; text-transform: uppercase; color: var(--rc); }
#aow-ui .perk .pn { font-family: var(--font-title); font-size: var(--f-lg); letter-spacing: .06em; margin: 4px 0 6px; }
#aow-ui .perk .pd { font-size: var(--f-sm); color: var(--ink-dim); line-height: 1.4; min-height: 3.2em; }
#aow-ui .perk .tags { display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; margin-top: var(--sp-2); }
#aow-ui .perk .tags span { font-size: 9px; padding: 2px 6px; border-radius: var(--r-pill);
  background: rgba(255,255,255,.08); border: 1px solid var(--stroke); letter-spacing: .06em; }

/* --- campaign map -------------------------------------------------------- */
#aow-ui .map { position: relative; width: 100%; aspect-ratio: 16 / 9; min-height: 240px;
  border-radius: var(--r-3); overflow: hidden; border: 1px solid var(--stroke);
  background: radial-gradient(120% 90% at 30% 10%, #3a3020, #1a1610 70%); }
#aow-ui .map svg { position: absolute; inset: 0; width: 100%; height: 100%; }
#aow-ui .map .mnode {
  position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
  display: grid; place-items: center; font-size: 14px; pointer-events: auto;
  border: 2px solid var(--stroke-hi); background: linear-gradient(180deg, #4b4032, #241d15);
  transition: transform var(--t-mid) var(--e-back), box-shadow var(--t-mid);
}
#aow-ui .map .mnode:hover { transform: scale(1.16); }
#aow-ui .map .mnode.locked { opacity: .38; filter: grayscale(1); pointer-events: none; }
#aow-ui .map .mnode.cleared { border-color: rgba(111,208,138,.75); box-shadow: 0 0 14px rgba(111,208,138,.4); }
#aow-ui .map .mnode.current { box-shadow: 0 0 0 3px rgba(255,207,92,.5), 0 0 22px var(--glow); animation: pulseSoft 1.6s infinite; }
#aow-ui .map .mnode .st { position: absolute; bottom: -13px; font-size: 9px; color: var(--accent); letter-spacing: .1em; white-space: nowrap; }

/* --- settings controls --------------------------------------------------- */
#aow-ui .setrow { display: flex; align-items: center; gap: var(--sp-3); padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
#aow-ui .setrow:last-child { border-bottom: 0; }
#aow-ui .setrow .lbl { flex: 1; font-size: var(--f-md); }
#aow-ui .setrow .hint { display: block; font-size: var(--f-xs); color: var(--ink-faint); margin-top: 1px; }
#aow-ui .sw { position: relative; width: 46px; height: 26px; border-radius: var(--r-pill); flex: none;
  background: rgba(0,0,0,.5); border: 1px solid var(--stroke); transition: background var(--t-mid); }
#aow-ui .sw i { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%;
  background: linear-gradient(180deg, #f0e6d2, #b3a689); box-shadow: var(--sh-1);
  transition: transform var(--t-mid) var(--e-back); }
#aow-ui .sw.on { background: linear-gradient(90deg, var(--accent2), var(--accent)); }
#aow-ui .sw.on i { transform: translateX(20px); }
#aow-ui .seg { display: flex; gap: 2px; padding: 2px; border-radius: var(--r-pill); background: rgba(0,0,0,.4); border: 1px solid var(--stroke); }
#aow-ui .seg button { padding: 5px 11px; border-radius: var(--r-pill); font-size: var(--f-sm); color: var(--ink-dim); }
#aow-ui .seg button.on { color: #241a08; background: linear-gradient(180deg, var(--glow), var(--accent)); }
#aow-ui input[type="range"] { -webkit-appearance: none; appearance: none; width: 132px; height: 4px; border-radius: 2px;
  background: rgba(0,0,0,.5); pointer-events: auto; }
#aow-ui input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
  background: linear-gradient(180deg, var(--glow), var(--accent)); box-shadow: var(--sh-1); cursor: pointer; }
#aow-ui input[type="range"]::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%;
  background: var(--accent); cursor: pointer; }

/* --- result / summary ---------------------------------------------------- */
#aow-ui .verdict { text-align: center; padding: var(--sp-3) 0 var(--sp-2); }
#aow-ui .verdict .v { font-family: var(--font-title); font-size: var(--f-3xl); letter-spacing: .18em; line-height: 1; }
#aow-ui .verdict.win .v { color: var(--glow); text-shadow: 0 0 34px var(--glow); }
#aow-ui .verdict.lose .v { color: #ff8a7a; text-shadow: 0 0 30px rgba(255,90,70,.55); }
#aow-ui .verdict .r { font-size: var(--f-md); color: var(--ink-dim); margin-top: 6px; }
#aow-ui .stats { display: grid; gap: var(--sp-2); grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); }
#aow-ui .stat-c { padding: var(--sp-3); border-radius: var(--r-2); text-align: center;
  background: rgba(0,0,0,.28); border: 1px solid var(--stroke); }
#aow-ui .stat-c b { display: block; font-size: var(--f-xl); font-variant-numeric: tabular-nums; }
#aow-ui .stat-c span { font-size: var(--f-xs); color: var(--ink-faint); letter-spacing: .1em; text-transform: uppercase; }
#aow-ui .bd { display: flex; flex-direction: column; gap: 6px; }
#aow-ui .bd .r { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--f-sm); }
#aow-ui .bd .r .g { flex: 1; height: 8px; border-radius: 4px; background: rgba(0,0,0,.45); overflow: hidden; }
#aow-ui .bd .r .g i { display: block; height: 100%; background: linear-gradient(90deg, var(--team-foe), #ffb27a);
  transform-origin: left; animation: growX 620ms var(--e-out) backwards; }
@keyframes growX { from { transform: scaleX(0); } }
#aow-ui .tipbox { padding: var(--sp-3); border-radius: var(--r-2); border-left: 3px solid var(--accent);
  background: rgba(255,207,92,.09); font-size: var(--f-sm); line-height: 1.45; }
#aow-ui .tipbox b { display: block; color: var(--accent); letter-spacing: .08em; text-transform: uppercase;
  font-size: var(--f-xs); margin-bottom: 3px; }
`;

  var CSS_FX = `
/* ============================ FEEDBACK =================================== */
#aow-ui .toasts {
  position: absolute; top: calc(var(--safe-t) + 132px); left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 6px; width: min(420px, 88vw); pointer-events: none;
}
#aow-ui .toast {
  display: flex; align-items: center; gap: var(--sp-2); padding: 8px 14px; border-radius: var(--r-pill);
  font-size: var(--f-sm); max-width: 100%; box-shadow: var(--sh-2);
  border-left: 3px solid var(--tc, var(--accent));
  animation: toastIn 320ms var(--e-back);
}
#aow-ui .toast.out { animation: toastOut 260ms var(--e-in) forwards; }
@keyframes toastIn { from { opacity: 0; transform: translateY(-14px) scale(.94); } }
@keyframes toastOut { to { opacity: 0; transform: translateY(-10px) scale(.96); } }
#aow-ui .toast .tg { font-size: 14px; color: var(--tc); }

#aow-ui .floaters { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
#aow-ui .flt {
  position: absolute; font-weight: 800; font-size: var(--f-md); font-variant-numeric: tabular-nums;
  text-shadow: 0 2px 4px rgba(0,0,0,.85); will-change: transform, opacity;
  animation: fltUp 1000ms var(--e-out) forwards;
}
#aow-ui .flt.gold { color: var(--gold); }
#aow-ui .flt.dmg { color: #ffd9d0; }
#aow-ui .flt.crit { color: #ff8f5e; font-size: var(--f-xl); }
#aow-ui .flt.heal { color: var(--good); }
@keyframes fltUp {
  0% { opacity: 0; transform: translate(-50%, 0) scale(.6); }
  16% { opacity: 1; transform: translate(-50%, -14px) scale(1.14); }
  32% { transform: translate(-50%, -20px) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -62px) scale(.95); }
}

#aow-ui .vig {
  position: absolute; inset: 0; pointer-events: none; opacity: 0;
  background: radial-gradient(120% 90% at 50% 50%, transparent 42%, rgba(150,10,10,.55) 100%);
  transition: opacity var(--t-slow) var(--e-out);
}
#aow-ui .vig.is-on { opacity: 1; animation: heartbeat 1.5s ease-in-out infinite; }
@keyframes heartbeat { 0%,100% { opacity: .42; } 12% { opacity: .95; } 26% { opacity: .5; } 40% { opacity: .82; } }
#aow-ui .flash { position: absolute; inset: 0; pointer-events: none; opacity: 0; background: #fff; }
#aow-ui .flash.go { animation: hitFlash 260ms var(--e-out); }
@keyframes hitFlash { 0% { opacity: .5; } 100% { opacity: 0; } }

#aow-ui .banner {
  position: absolute; left: 0; right: 0; top: 34%; text-align: center; pointer-events: none;
  opacity: 0; transform: scale(.9);
}
#aow-ui .banner.is-on { animation: bannerIn 2600ms var(--e-out) forwards; }
@keyframes bannerIn {
  0% { opacity: 0; transform: scale(1.5) translateY(10px); filter: blur(12px); }
  12% { opacity: 1; transform: scale(1); filter: blur(0); }
  78% { opacity: 1; transform: scale(1.02); }
  100% { opacity: 0; transform: scale(1.06); filter: blur(6px); }
}
#aow-ui .banner .bt { font-family: var(--font-title); font-size: var(--f-3xl); letter-spacing: .22em;
  color: var(--glow); text-shadow: 0 0 40px var(--glow), 0 6px 18px rgba(0,0,0,.9); }
#aow-ui .banner .bs { font-size: var(--f-md); letter-spacing: .3em; text-transform: uppercase; color: var(--ink-dim); margin-top: 8px; }
#aow-ui .banner .rays { position: absolute; left: 50%; top: 50%; width: 150vmax; height: 150vmax;
  margin: -75vmax 0 0 -75vmax; pointer-events: none; opacity: .32;
  background: repeating-conic-gradient(from 0deg, rgba(255,214,120,.5) 0deg 3deg, transparent 3deg 12deg);
  mask-image: radial-gradient(closest-side, rgba(0,0,0,.9), transparent 62%);
  -webkit-mask-image: radial-gradient(closest-side, rgba(0,0,0,.9), transparent 62%);
  animation: spin 22s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
#aow-ui .banner.boss .bt { color: #ff7a6a; text-shadow: 0 0 40px rgba(255,60,50,.8), 0 6px 18px rgba(0,0,0,.9); }

#aow-ui .confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
#aow-ui .confetti i { position: absolute; top: -12px; width: 7px; height: 12px; border-radius: 1px;
  animation: fall linear forwards; }
@keyframes fall {
  0% { opacity: 0; transform: translateY(0) rotate(0deg); }
  8% { opacity: 1; }
  100% { opacity: 0; transform: translateY(105vh) rotate(760deg); }
}

/* ============================ TUTORIAL =================================== */
#aow-ui .tut { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity var(--t-mid); }
#aow-ui .tut.is-on { opacity: 1; pointer-events: auto; }
#aow-ui .tut .hole {
  position: absolute; border-radius: var(--r-3); box-shadow: 0 0 0 9999px rgba(4,4,6,.76), 0 0 0 2px var(--glow) inset;
  transition: left var(--t-slow) var(--e-out), top var(--t-slow) var(--e-out),
              width var(--t-slow) var(--e-out), height var(--t-slow) var(--e-out);
  pointer-events: none;
}
#aow-ui .tut .hole::after { content: ''; position: absolute; inset: -6px; border-radius: inherit;
  border: 2px solid var(--glow); opacity: .8; animation: ringPulse 1.6s var(--e-out) infinite; }
@keyframes ringPulse { 0% { transform: scale(.98); opacity: .85; } 100% { transform: scale(1.1); opacity: 0; } }
#aow-ui .tut .coach {
  position: absolute; width: min(320px, 84vw); padding: var(--sp-4); border-radius: var(--r-3);
  transition: left var(--t-slow) var(--e-out), top var(--t-slow) var(--e-out);
}
#aow-ui .tut .coach h4 { font-family: var(--font-title); font-size: var(--f-md); letter-spacing: .1em; color: var(--accent); }
#aow-ui .tut .coach p { font-size: var(--f-sm); line-height: 1.5; color: var(--ink-dim); margin: 6px 0 var(--sp-3); }
#aow-ui .tut .coach .cr { display: flex; align-items: center; gap: var(--sp-2); }
#aow-ui .tut .coach .dots { display: flex; gap: 4px; flex: 1; }
#aow-ui .tut .coach .dots i { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.2); }
#aow-ui .tut .coach .dots i.on { background: var(--accent); }
#aow-ui .coachtip {
  position: absolute; bottom: calc(var(--safe-b) + 172px); left: 50%; transform: translateX(-50%);
  padding: 8px 14px; border-radius: var(--r-pill); font-size: var(--f-sm); pointer-events: none;
  opacity: 0; transition: opacity var(--t-mid);
}
#aow-ui .coachtip.is-on { opacity: 1; animation: toastIn 340ms var(--e-back); }

/* ============================ DEV OVERLAY =============================== */
#aow-ui .dev {
  position: absolute; top: calc(var(--safe-t) + var(--sp-2)); left: 50%; transform: translateX(-50%);
  display: none; padding: 6px 10px; border-radius: var(--r-2); font-family: var(--font-mono);
  font-size: 11px; line-height: 1.5; background: rgba(0,0,0,.72); border: 1px solid var(--stroke);
  pointer-events: none; white-space: pre; z-index: 9; color: #b9f5c8;
}
#aow-ui .dev.is-on { display: block; }
#aow-ui .dev b { color: var(--glow); font-weight: 600; }

/* ============================ RESPONSIVE ================================ */
@media (max-width: 720px) {
  #aow-ui { font-size: calc(13px * var(--ui-scale)); }
  #aow-ui .wavebox { min-width: 0; }
  #aow-ui .comp .cchip { font-size: 9px; padding: 1px 5px; }
  #aow-ui .card { width: 66px; }
  #aow-ui .card .icon { width: 36px; height: 36px; font-size: 18px; }
  #aow-ui .mini canvas { width: 150px; height: 32px; }
  #aow-ui .pbody { padding: var(--sp-3); }
}
@media (max-width: 460px) {
  #aow-ui .army { display: none; }
  #aow-ui .fort { width: 40vw; }
  #aow-ui .verdict .v { font-size: var(--f-2xl); }
  #aow-ui .banner .bt { font-size: var(--f-2xl); }
}
@media (orientation: landscape) and (max-height: 480px) {
  #aow-ui .forts { top: calc(var(--safe-t) + 54px); }
  #aow-ui .mini { top: calc(var(--safe-t) + 84px); bottom: auto; }
  #aow-ui .army { bottom: calc(var(--safe-b) + 104px); }
  #aow-ui .toasts { top: calc(var(--safe-t) + 96px); }
  #aow-ui .card { width: 62px; padding: 4px; }
  #aow-ui .card .icon { width: 32px; height: 32px; font-size: 16px; }
  #aow-ui .act { height: 40px; }
  #aow-ui .panel { max-height: 100%; }
  #aow-ui .pbody { gap: var(--sp-3); }
}
@media (min-width: 1200px) {
  #aow-ui { font-size: calc(15px * var(--ui-scale)); }
  #aow-ui .card { width: 84px; }
  #aow-ui .mini canvas { width: 260px; height: 48px; }
}
@media (hover: none) { #aow-ui .item:hover, #aow-ui .perk:hover { transform: none; } }
`;

  function allCss() { return CSS_TOKENS + CSS_HUD + CSS_BAR + CSS_PANEL + CSS_FX; }

  /* ---------------------------------------------------------------------------
   * 4. Module-level UI handles + live view model
   * ------------------------------------------------------------------------ */
  var root = null, styleTag = null, inited = false, disposed = false;
  var D = {};          // named DOM handles
  var cards = [];      // unit card records
  var cardById = Object.create(null);

  var view = {
    gold: 0, goldShown: 0, goldVel: 0,
    gems: 0, gemsShown: 0,
    fort: { 1: { hp: 1, max: 1, shown: 1, ghost: 1, hurtT: 0 }, '-1': { hp: 1, max: 1, shown: 1, ghost: 1, hurtT: 0 } },
    era: 0, wave: 0, phase: 'menu',
    prepT: 0, prepMax: 0,
    streak: 0, streakT: 0,
    lowT: 0, low: false,
    rosterKey: '', spawnCd: 0, spawnCdMax: 1,
    power: 0, powerReady: false,
    lastFloaterMs: 0, floaters: 0
  };

  /* ---------------------------------------------------------------------------
   * 5. Style injection + theme
   * ------------------------------------------------------------------------ */
  function injectStyle() {
    if (!doc) return false;
    try {
      styleTag = doc.getElementById('aow-ui-style');
      if (!styleTag) {
        styleTag = doc.createElement('style');
        styleTag.id = 'aow-ui-style';
        styleTag.type = 'text/css';
        (doc.head || doc.documentElement).appendChild(styleTag);
      }
      styleTag.textContent = allCss();
      return true;
    } catch (e) {
      warn('style', 'could not inject the stylesheet — the UI will be unstyled.', e);
      return false;
    }
  }

  /** Re-skin every token for an era index. */
  function applyEraSkin(i) {
    if (!root) return;
    var s = skinFor(i);
    try {
      var st = root.style;
      st.setProperty('--accent', s.accent);
      st.setProperty('--accent2', s.accent2);
      st.setProperty('--metal', s.metal);
      st.setProperty('--metal2', s.metal2);
      st.setProperty('--ink', s.ink);
      st.setProperty('--glow', s.glow);
      st.setProperty('--ink-dim', hexA(s.ink, 0.62));
      st.setProperty('--ink-faint', hexA(s.ink, 0.34));
      root.setAttribute('data-era', String(clamp(i | 0, 0, ERA_SKIN.length - 1)));
    } catch (e) { warn('skin', 'era skin could not be applied', e); }
  }

  /** '#rrggbb' + alpha -> 'rgba(...)'. Tolerates junk. */
  function hexA(hex, a) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return 'rgba(255,255,255,' + a + ')';
    var n = parseInt(h, 16);
    if (!isFinite(n)) return 'rgba(255,255,255,' + a + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function applyPrefs() {
    if (!root) return;
    root.style.setProperty('--ui-scale', String(clamp(num(prefs.scale, 1), 0.8, 1.4)));
    root.setAttribute('data-cb', prefs.colorblind ? '1' : '0');
    root.setAttribute('data-motion', prefs.reducedMotion ? 'reduced' : 'full');
    root.setAttribute('data-hand', prefs.hand === 'left' ? 'left' : 'right');
    cls(D.mini, 'off', !prefs.minimap);
    cls(D.dev, 'is-on', !!prefs.devOverlay);
  }

  /* ---------------------------------------------------------------------------
   * 6. HUD construction
   * ------------------------------------------------------------------------ */
  function buildRoot() {
    root = doc.getElementById('aow-ui');
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = el('div');
    root.id = 'aow-ui';
    root.setAttribute('data-era', '0');
    (doc.body || doc.documentElement).appendChild(root);
    return root;
  }

  function resChip(kind, label) {
    var c = el('div', 'res-chip plate ' + kind);
    el('div', 'coin', kind === 'gem' ? '◈' : '', c);
    var v = el('div', 'val num', '0', c);
    var r = el('div', 'rate', '', c);
    attr(c, 'aria-label', label);
    attr(c, 'role', 'status');
    return { root: c, val: v, rate: r };
  }

  function iconBtn(glyph, label, parent, fn, key) {
    var b = el('button', 'ibtn plate', glyph, parent);
    attr(b, 'aria-label', label);
    attr(b, 'title', label);
    tap(b, fn, key || 'ibtn');
    return b;
  }

  function buildTop() {
    var top = el('div', 'top', '', root);
    D.top = top;

    /* --- resources --- */
    var res = el('div', 'res', '', top);
    D.gold = resChip('gold', 'Gold');
    res.appendChild(D.gold.root);
    D.gems = resChip('gem', 'Gems');
    res.appendChild(D.gems.root);
    D.res = res;

    /* --- wave / incoming --- */
    var wb = el('div', 'wavebox glass', '', top);
    var wl = el('div', 'wl', '', wb);
    D.waveName = el('div', 'wname', 'WAVE 1', wl);
    D.waveSub = el('div', 'wsub', 'prepare', wl);
    D.comp = el('div', 'comp', '', wb);
    var wt = el('div', 'wtimer', '', wb);
    D.waveTimer = el('i', '', '', wt);
    D.waveTimerWrap = wt;
    D.wavebox = wb;
    attr(wb, 'role', 'status');
    attr(wb, 'aria-live', 'polite');

    /* --- era + buttons --- */
    var tr = el('div', 'topright', '', top);
    var ep = el('div', 'erapill plate clickable', '', tr);
    D.eraName = el('div', 'en', 'STONE', ep);
    D.eraIdx = el('div', 'ei', '1/8', ep);
    var prog = el('div', 'eprog', '', ep);
    D.eraProg = el('i', '', '', prog);
    D.eraPill = ep;
    attr(ep, 'aria-label', 'Era — tap to evolve');
    tap(ep, doEvolve, 'evolve');

    var row = el('div', 'iconrow', '', tr);
    D.btnPause = iconBtn('❚❚', 'Pause', row, function () { openPanel('pause'); }, 'pause');
    D.btnSpeed = iconBtn('▸', 'Game speed', row, doSpeed, 'speed');
    D.btnMenu  = iconBtn('☰', 'Menu', row, function () { openPanel('store'); }, 'menu');
    D.btnHelp  = iconBtn('?', 'Help', row, function () { openPanel('help'); }, 'help');
    D.iconrow = row;
  }

  function fortBar(team, label) {
    var f = el('div', 'fort ' + (team === 1 ? 'you' : 'foe'));
    var h = el('div', 'fhead', '', f);
    el('span', 'dot', '', h);
    el('span', '', label, h);
    var tier = el('span', 'tier', '', h);
    var bar = el('div', 'bar', '', f);
    var ghost = el('div', 'ghost', '', bar);
    var fill = el('div', 'fill', '', bar);
    el('div', 'ticks', '', bar);
    el('div', 'gloss', '', bar);
    var hpn = el('div', 'hpn num', '', bar);
    attr(bar, 'role', 'progressbar');
    attr(bar, 'aria-label', label + ' fort health');
    return { root: f, bar: bar, ghost: ghost, fill: fill, hpn: hpn, tier: tier };
  }

  function buildForts() {
    var w = el('div', 'forts', '', root);
    D.fortYou = fortBar(1, 'Your Fort');
    D.fortFoe = fortBar(-1, 'Enemy Fort');
    w.appendChild(D.fortYou.root);
    w.appendChild(D.fortFoe.root);
    D.forts = w;
  }

  function buildMini() {
    var m = el('div', 'mini glass clickable', '', root);
    var c = el('canvas', '', '', m);
    attr(c, 'aria-hidden', 'true');
    D.mini = m; D.miniCanvas = c;
    D.miniCtx = null;
    try { D.miniCtx = c.getContext && c.getContext('2d'); }
    catch (e) { warn('mini', 'no 2d context for the minimap — it will stay blank.', e); }
    tap(m, function () { prefs.minimap = !prefs.minimap; savePrefs(); applyPrefs(); }, 'mini');

    var a = el('div', 'army plate', '', root);
    D.armyN = el('div', 'n num', '0', a);
    D.armyCap = el('div', 'cap', '/ 0', a);
    D.armyQ = el('div', 'q', '', a);
    D.army = a;
    attr(a, 'aria-label', 'Army supply');

    D.streak = el('div', 'streak', '', root);
    D.vig = el('div', 'vig', '', root);
    D.flash = el('div', 'flash', '', root);
  }

  var CARD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  function buildBottom() {
    var b = el('div', 'bottom', '', root);
    D.bottom = b;
    D.cards = el('div', 'cards', '', b);
    attr(D.cards, 'role', 'toolbar');
    attr(D.cards, 'aria-label', 'Recruit units');

    var rail = el('div', 'rail', '', b);
    var r1 = el('div', 'railrow', '', rail);
    D.actStance = actBtn(r1, '⚑', 'Stance', cycleStance, 'stance');
    D.actForm   = actBtn(r1, '▦', 'Form', cycleFormation, 'form');
    var r2 = el('div', 'railrow', '', rail);
    D.actPower  = actBtn(r2, '✷', 'Power', castPower, 'power');
    D.powerFill = el('i', '', '', el('div', 'pw', '', D.actPower));
    D.actEvolve = actBtn(r2, '⇪', 'Evolve', doEvolve, 'evolve2');
    cls(D.actEvolve, 'primary', true);
    D.rail = rail;

    D.tip = el('div', 'tip glass', '', root);
    attr(D.tip, 'role', 'tooltip');
  }

  function actBtn(parent, glyph, label, fn, key) {
    var a = el('button', 'act plate', '', parent);
    el('span', 'g', glyph, a);
    el('span', 'l', label, a);
    attr(a, 'aria-label', label);
    tap(a, fn, key);
    return a;
  }

  function buildFeedback() {
    D.toasts = el('div', 'toasts', '', root);
    attr(D.toasts, 'role', 'log');
    attr(D.toasts, 'aria-live', 'polite');
    D.floaters = el('div', 'floaters', '', root);

    var ban = el('div', 'banner', '', root);
    D.bannerRays = el('div', 'rays', '', ban);
    D.bannerT = el('div', 'bt', '', ban);
    D.bannerS = el('div', 'bs', '', ban);
    D.banner = ban;

    D.confetti = el('div', 'confetti', '', root);
    D.coachTip = el('div', 'coachtip glass', '', root);
    D.dev = el('div', 'dev', '', root);
  }

  function buildModal() {
    D.scrim = el('div', 'scrim', '', root);
    tap(D.scrim, function () { if (panelStack.length && currentPanel() && currentPanel().dismissable !== false) closePanel(); }, 'scrim');
    D.modal = el('div', 'modal', '', root);

    /* tutorial layer sits above the modal so it can spotlight panels too */
    var t = el('div', 'tut', '', root);
    D.tutHole = el('div', 'hole', '', t);
    var c = el('div', 'coach glass', '', t);
    D.tutTitle = el('h4', '', '', c);
    D.tutBody = el('p', '', '', c);
    var cr = el('div', 'cr', '', c);
    D.tutDots = el('div', 'dots', '', cr);
    D.tutSkip = el('button', 'btn sm', 'Skip', cr);
    D.tutNext = el('button', 'btn sm cta', 'Next', cr);
    tap(D.tutSkip, function () { endTutorial(true); }, 'tutskip');
    tap(D.tutNext, function () { tutStep(tut.i + 1); }, 'tutnext');
    D.tut = t; D.tutCoach = c;
  }

  /* ---------------------------------------------------------------------------
   * 7. Unit bar
   * ------------------------------------------------------------------------ */
  function rosterKey(list) {
    var k = '', i;
    for (i = 0; i < list.length; i++) k += list[i].id + '|';
    return k;
  }

  function currentRoster() {
    var e = Econ();
    if (!e || !isFn(e.rosterView)) return [];
    try {
      var s = ST();
      var r = e.rosterView(s ? s.eraIndex : 0);
      return (r && r.length) ? r : [];
    } catch (err) { warn('roster', 'Economy.rosterView() failed — the unit bar stays empty.', err); return []; }
  }

  function buildCards(force) {
    if (!D.cards) return;
    var list = currentRoster();
    var key = rosterKey(list);
    if (!force && key === view.rosterKey) return;
    view.rosterKey = key;

    clear(D.cards);
    cards.length = 0;
    cardById = Object.create(null);

    for (var i = 0; i < list.length; i++) {
      (function (d, idx) {
        var c = el('button', 'card plate', '', D.cards);
        c.setAttribute('data-cls', d.cls);
        c.style.animationDelay = (idx * 26) + 'ms';
        attr(c, 'aria-label', d.name + ', ' + d.cost + ' gold, ' + (CLASS_NAME[d.cls] || d.cls));

        el('div', 'cd', '', c);
        if (idx < CARD_KEYS.length) el('div', 'key mono', CARD_KEYS[idx], c);
        var qn = el('div', 'qn num', '0', c);
        el('div', 'icon', glyphFor(d.cls), c);
        el('div', 'nm', d.name, c);
        var cost = el('div', 'cost num', String(d.cost), c);

        var rec = { el: c, def: d, id: d.id, cost: cost, qn: qn, poor: null, idx: idx };
        cards.push(rec);
        cardById[d.id] = rec;

        tap(c, function () { buyUnit(d.id, rec); }, 'card');
        bindHold(c, function () { showTip(rec); }, hideTip);
      })(list[i], i);
    }
    refreshCards(true);
  }

  /** Long-press (or hover) to reveal the stat tooltip; release to hide. */
  function bindHold(node, onHold, onRelease) {
    if (!node || !node.addEventListener) return;
    var timer = 0, moved = false;
    function start(ev) {
      moved = false;
      clearTimeout(timer);
      timer = setTimeout(guard(function () { if (!moved) onHold(); }, 'hold'), 260);
      if (ev && ev.type === 'mouseenter') { clearTimeout(timer); timer = setTimeout(guard(onHold, 'hold'), 380); }
    }
    function end() { clearTimeout(timer); onRelease(); }
    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('touchmove', function () { moved = true; }, { passive: true });
    node.addEventListener('touchend', end, false);
    node.addEventListener('touchcancel', end, false);
    node.addEventListener('mouseenter', start, false);
    node.addEventListener('mouseleave', end, false);
    node.addEventListener('mousedown', start, false);
    node.addEventListener('mouseup', end, false);
    node.addEventListener('focus', function () { onHold(); }, false);
    node.addEventListener('blur', end, false);
  }

  function refreshCards(force) {
    var e = Econ(), s = ST();
    if (!s) return;
    var list = force ? currentRoster() : null;
    var qCount = queueCounts();
    for (var i = 0; i < cards.length; i++) {
      var rec = cards[i], d = rec.def;
      if (list && list[i] && list[i].id === d.id) { d = rec.def = list[i]; txt(rec.cost, String(d.cost)); }
      var cost = num(d.cost, 0);
      var afford = (d.affordable !== undefined) ? !!d.affordable : (s.gold >= cost);
      var supply = true;
      if (e && isFn(e.supplyFree)) { try { supply = e.supplyFree() >= num(d.pop, 1); } catch (er) { supply = true; } }
      cls(rec.el, 'poor', !(afford && supply));
      var q = qCount[d.id] || 0;
      cls(rec.el, 'queued', q > 0);
      if (q > 0) txt(rec.qn, String(q));
    }
  }

  var _qc = Object.create(null);
  function queueCounts() {
    for (var k in _qc) delete _qc[k];
    var sm = Sim();
    if (!sm || !isFn(sm.queue)) return _qc;
    try {
      var q = sm.queue(1);
      if (!q || !q.length) return _qc;
      for (var i = 0; i < q.length; i++) {
        var id = q[i] && q[i].id;
        if (id) _qc[id] = (_qc[id] || 0) + 1;
      }
    } catch (e) { /* Sim may not be up yet */ }
    return _qc;
  }

  function buyUnit(id, rec) {
    var e = Econ();
    var ok = intent('buy-unit', { id: id }, function () {
      if (!e || !isFn(e.buyUnit)) { toast('Economy is not ready', 'warn'); return false; }
      return e.buyUnit(id);
    });
    if (!rec) rec = cardById[id];
    if (!rec) return ok;
    if (ok) {
      pulse(rec.el, 'flash');
      haptic('soft');
      coach('supply', 'Units queue at your gate and march automatically.');
    } else {
      pulse(rec.el, 'deny');
      haptic('hit');
    }
    refreshCards(false);
    return ok;
  }

  function pulse(node, className) {
    if (!node || motionOff()) return;
    cls(node, className, false);
    /* force a reflow so the animation restarts even on repeat taps */
    try { void node.offsetWidth; } catch (e) {}
    cls(node, className, true);
    setTimeout(function () { cls(node, className, false); }, 460);
  }

  /* --- tooltip ------------------------------------------------------------- */
  function statRow(parent, label, value, frac) {
    var r = el('div', 'stat', '', parent);
    el('span', 'dim', label, r);
    el('b', '', value, r);
    if (frac !== undefined) {
      var b = el('div', 'sbar', '', parent);
      el('i', '', '', b).style.width = Math.round(clamp01(frac) * 100) + '%';
    }
  }

  function showTip(rec) {
    if (!D.tip || !rec) return;
    var d = rec.def;
    clear(D.tip);
    el('h4', '', d.name, D.tip);
    el('div', 'role', (CLASS_NAME[d.cls] || d.cls) + ' · ' + num(d.pop, 1) + ' supply', D.tip);
    statRow(D.tip, 'Health', fmt(d.hp), clamp01(num(d.hp, 0) / 900));
    statRow(D.tip, 'Damage', fmt(d.dmg), clamp01(num(d.dmg, 0) / 160));
    statRow(D.tip, 'Range', num(d.range, 0).toFixed(1) + ' m', clamp01(num(d.range, 0) / 60));
    statRow(D.tip, 'Speed', num(d.speed, 0).toFixed(1), clamp01(num(d.speed, 0) / 10));
    statRow(D.tip, 'Cost', fmt(d.cost) + ' g');
    var counter = counterText(d.cls);
    if (counter) el('div', 'role', counter, D.tip);
    if (d.traits && d.traits.length) {
      var t = el('div', 'traits', '', D.tip);
      for (var i = 0; i < d.traits.length; i++) el('span', '', String(d.traits[i]), t);
    }
    positionTip(rec.el);
    show(D.tip, true);
  }

  function counterText(cls) {
    var sm = Sim();
    if (!sm || !isFn(sm.counterFor)) return '';
    try {
      var s = ST();
      var c = sm.counterFor(cls, s ? s.eraIndex : 0);
      if (!c) return '';
      if (typeof c === 'string') return 'Strong vs ' + (CLASS_NAME[c] || c);
      if (c.strongVs) return 'Strong vs ' + (CLASS_NAME[c.strongVs] || c.strongVs);
      if (c.cls) return 'Strong vs ' + (CLASS_NAME[c.cls] || c.cls);
    } catch (e) {}
    return '';
  }

  function positionTip(anchor) {
    if (!D.tip || !anchor || !anchor.getBoundingClientRect) return;
    try {
      var r = anchor.getBoundingClientRect();
      var w = D.tip.offsetWidth || 190, h = D.tip.offsetHeight || 150;
      var vw = global.innerWidth || 800, vh = global.innerHeight || 600;
      var x = clamp(r.left + r.width / 2 - w / 2, 8, vw - w - 8);
      var y = r.top - h - 10;
      if (y < 8) y = clamp(r.bottom + 10, 8, vh - h - 8);
      D.tip.style.left = Math.round(x) + 'px';
      D.tip.style.top = Math.round(y) + 'px';
    } catch (e) {}
  }
  function hideTip() { show(D.tip, false); }

  /* ---------------------------------------------------------------------------
   * 8. Player actions (rail)
   * ------------------------------------------------------------------------ */
  var STANCE_ORDER = ['attack', 'march', 'defend', 'hold'];
  function availableStances() {
    var sm = Sim();
    if (sm && sm.STANCE_LIST && sm.STANCE_LIST.length) return sm.STANCE_LIST;
    return STANCE_ORDER;
  }
  function cycleStance() {
    var sm = Sim(), s = ST();
    var list = availableStances();
    var cur = (sm && sm.armies && sm.armies[1]) ? sm.armies[1].stance : (s ? s.stance : list[0]);
    var i = list.indexOf(cur);
    var next = list[(i + 1 + list.length) % list.length] || list[0];
    intent('stance', { stance: next }, function () {
      if (sm && isFn(sm.setStance)) return sm.setStance(1, next);
      var c = Core();
      if (c && isFn(c.setStance)) { c.setStance(next); return true; }
      return false;
    });
    syncRail();
  }
  function cycleFormation() {
    var sm = Sim();
    var list = (sm && sm.FORMATION_LIST) ? sm.FORMATION_LIST : ['line', 'wedge', 'shieldwall', 'skirmish', 'column'];
    var cur = (sm && sm.armies && sm.armies[1]) ? sm.armies[1].formation : list[0];
    var i = list.indexOf(cur);
    var next = list[(i + 1 + list.length) % list.length] || list[0];
    intent('formation', { formation: next }, function () {
      return sm && isFn(sm.setFormation) ? sm.setFormation(1, next) : false;
    });
    syncRail();
  }
  function castPower(type) {
    var sm = Sim();
    var t = (typeof type === 'string') ? type : 'meteor';
    var ok = intent('power', { type: t }, function () {
      if (!sm || !isFn(sm.castPower)) return false;
      var frontX = 210, s = ST();
      try {
        if (sm.armies && sm.armies[-1]) frontX = num(sm.armies[-1].frontX, frontX);
      } catch (e) {}
      if (s && s.units && s.units.length) {
        /* aim at the densest enemy clump so a tap is never wasted */
        var best = 0, bestX = frontX, i, u, cnt, j, v;
        for (i = 0; i < s.units.length; i += 3) {
          u = s.units[i];
          if (!u || u.dead || u.team === 1) continue;
          cnt = 0;
          for (j = 0; j < s.units.length; j += 3) {
            v = s.units[j];
            if (!v || v.dead || v.team === 1) continue;
            if (Math.abs(v.x - u.x) < 10) cnt++;
          }
          if (cnt > best) { best = cnt; bestX = u.x; }
        }
        frontX = bestX;
      }
      return sm.castPower(1, t, frontX, 0);
    });
    if (ok) { haptic('heavy'); }
    else { pulse(D.actPower, 'deny'); }
    syncRail();
    return ok;
  }
  function doEvolve() {
    var e = Econ();
    var ok = intent('evolve', null, function () {
      if (e && isFn(e.evolve)) return e.evolve();
      var c = Core(), s = ST();
      if (c && isFn(c.setEra) && s) { c.setEra(s.eraIndex + 1); return true; }
      return false;
    });
    if (!ok) { pulse(D.eraPill, 'deny'); pulse(D.actEvolve, 'deny'); }
    return ok;
  }
  function doSpeed() {
    var c = Core();
    intent('speed', null, function () { return c && isFn(c.cycleSpeed) ? c.cycleSpeed() : false; });
    syncSpeed();
  }
  function doPause(v) {
    var c = Core();
    intent('pause', { paused: v }, function () {
      if (!c || !isFn(c.setPaused)) return false;
      c.setPaused(v);
      return true;
    });
  }

  function syncSpeed() {
    var s = ST();
    if (!s || !D.btnSpeed) return;
    var sp = num(s.speed, 1);
    txt(D.btnSpeed, sp >= 3 ? '⏩' : (sp === 2 ? '▶▶' : '▸'));
    attr(D.btnSpeed, 'aria-label', 'Game speed ' + sp + 'x');
    cls(D.btnSpeed, 'on', sp > 1);
  }

  function syncRail() {
    var sm = Sim(), s = ST();
    var army = (sm && sm.armies) ? sm.armies[1] : null;
    if (D.actStance) {
      var stName = army ? army.stance : (s ? s.stance : 'attack');
      var def = (sm && sm.STANCES && sm.STANCES[stName]) ? sm.STANCES[stName] : null;
      setActLabel(D.actStance, def ? def.name : cap(stName));
    }
    if (D.actForm && army) {
      var fdef = (sm && sm.FORMATIONS) ? sm.FORMATIONS[army.formation] : null;
      setActLabel(D.actForm, fdef ? fdef.name : cap(army.formation || 'Line'));
    }
    if (D.actPower) {
      var p = army ? clamp01(num(army.power, 0)) : 0;
      view.power = p;
      view.powerReady = !!(army && army.powerReady);
      if (D.powerFill) D.powerFill.style.width = Math.round(p * 100) + '%';
      cls(D.actPower, 'ready', view.powerReady);
      cls(D.actPower, 'disabled', !view.powerReady);
    }
    syncEvolve();
  }
  function setActLabel(node, s) {
    if (!node) return;
    var l = node.querySelector ? node.querySelector('.l') : null;
    if (l) txt(l, s);
  }

  function syncEvolve() {
    var e = Econ(), s = ST();
    if (!s) return;
    var p = 0, can = false, cost = 0;
    if (e) {
      try {
        p = isFn(e.evolveProgress) ? clamp01(e.evolveProgress()) : 0;
        can = isFn(e.canEvolve) ? !!e.canEvolve() : false;
        cost = isFn(e.evolveCost) ? e.evolveCost() : 0;
      } catch (er) { /* economy still booting */ }
    }
    if (D.eraProg) D.eraProg.style.width = Math.round(p * 100) + '%';
    cls(D.eraPill, 'ready', can);
    cls(D.actEvolve, 'ready', can);
    cls(D.actEvolve, 'disabled', !can && p < 1);
    if (D.eraPill && isFinite(cost) && cost > 0) {
      attr(D.eraPill, 'title', 'Evolve — ' + fmt(cost) + ' gold');
      attr(D.eraPill, 'aria-label', 'Evolve to the next era, ' + fmt(cost) + ' gold');
    }
    if (can) coach('evolve', 'You can EVOLVE — a new era means a stronger roster.');
  }

  /* ---------------------------------------------------------------------------
   * 9. Per-frame HUD refresh (driven by Core.registerRender — never polling
   *    the bus, only smoothing values the events already gave us)
   * ------------------------------------------------------------------------ */
  function tick(dtReal) {
    if (!inited || disposed || !root) return;
    var dt = clamp(num(dtReal, 0.016), 0, 0.1);
    var s = ST();
    if (!s) return;

    tickCounters(dt, s);
    tickForts(dt, s);
    tickPrep(dt);
    tickArmy(s);
    tickCooldown(dt);
    syncRail();
    if (prefs.minimap) drawMini(s);
    if (prefs.devOverlay) drawDev();
    if (view.streakT > 0) {
      view.streakT -= dt;
      if (view.streakT <= 0) { show(D.streak, false); view.streak = 0; }
    }
  }

  function tickCounters(dt, s) {
    /* gold: eased count-up so a +400 payout reads as a payout */
    var g = num(s.gold, 0);
    if (Math.abs(view.goldShown - g) > 0.5) {
      view.goldShown = lerp(view.goldShown, g, 1 - Math.pow(0.0016, dt));
      if (Math.abs(view.goldShown - g) < 1) view.goldShown = g;
      txt(D.gold.val, fmt(view.goldShown));
    } else if (view.goldShown !== g) {
      view.goldShown = g; txt(D.gold.val, fmt(g));
    }
    var gm = num(s.gems, 0);
    if (view.gemsShown !== gm) {
      view.gemsShown = lerp(view.gemsShown, gm, 1 - Math.pow(0.004, dt));
      if (Math.abs(view.gemsShown - gm) < 0.6) view.gemsShown = gm;
      txt(D.gems.val, fmt(view.gemsShown));
    }
    cls(D.gems.root, 'is-hidden', false);

    var e = Econ();
    if (e && isFn(e.incomeRate)) {
      try {
        var r = e.incomeRate();
        if (isFinite(r) && r > 0) txt(D.gold.rate, '+' + fmt(r) + '/s');
      } catch (er) {}
    }
    /* "can't afford anything" is a real state — say so quietly */
    var cheapest = Infinity;
    for (var i = 0; i < cards.length; i++) cheapest = Math.min(cheapest, num(cards[i].def.cost, Infinity));
    cls(D.gold.root, 'low', isFinite(cheapest) && s.gold < cheapest);
  }

  function tickForts(dt, s) {
    updateFort(D.fortYou, view.fort[1], s.forts ? s.forts[1] : null, dt, 1);
    updateFort(D.fortFoe, view.fort[-1], s.forts ? s.forts[-1] : null, dt, -1);

    var f = view.fort[1];
    var low = f.max > 0 && (f.hp / f.max) < 0.28 && !s.over && s.phase !== 'menu';
    if (low !== view.low) {
      view.low = low;
      show(D.vig, low && !motionOff());
      if (low) { toast('Fort critical — defend!', 'bad'); haptic('heavy'); }
    }
  }

  function updateFort(ui, v, src, dt, team) {
    if (!ui || !src) return;
    var max = Math.max(1, num(src.max, 1));
    var hp = clamp(num(src.hp, max), 0, max);
    v.hp = hp; v.max = max;
    var target = hp / max;

    /* the live fill snaps in fast, the ghost trails behind: readable damage */
    v.shown = (v.shown === undefined) ? target : lerp(v.shown, target, 1 - Math.pow(0.0005, dt));
    if (v.ghost === undefined || v.ghost < target) v.ghost = target;
    if (v.hurtT > 0) v.hurtT -= dt;
    else v.ghost = lerp(v.ghost, target, 1 - Math.pow(0.02, dt));
    if (Math.abs(v.shown - target) < 0.002) v.shown = target;
    if (Math.abs(v.ghost - target) < 0.003) v.ghost = target;

    ui.fill.style.transform = 'scaleX(' + v.shown.toFixed(4) + ')';
    ui.ghost.style.transform = 'scaleX(' + v.ghost.toFixed(4) + ')';
    txt(ui.hpn, Math.round(hp) + ' / ' + Math.round(max));
    attr(ui.bar, 'aria-valuenow', String(Math.round(target * 100)));
    cls(ui.root, 'crit', target < 0.28);
    var tier = num(src.tier, 0) | 0;
    txt(ui.tier, tier > 0 ? new Array(tier + 1).join('★') : '');
  }

  function tickPrep(dt) {
    if (view.prepT > 0) {
      view.prepT = Math.max(0, view.prepT - dt);
      var f = view.prepMax > 0 ? (view.prepT / view.prepMax) : 0;
      if (D.waveTimer) D.waveTimer.style.transform = 'scaleX(' + f.toFixed(3) + ')';
      if (view.prepT <= 0) { txt(D.waveSub, 'engaged'); }
      else { txt(D.waveSub, 'incoming in ' + Math.ceil(view.prepT) + 's'); }
    }
  }

  function tickArmy(s) {
    var e = Econ();
    var used = 0, max = 0;
    if (e) {
      try {
        used = isFn(e.supplyUsed) ? e.supplyUsed() : 0;
        max = isFn(e.supplyMax) ? e.supplyMax() : 0;
      } catch (er) {}
    }
    if (!max) {
      /* no economy yet — fall back to a live head count */
      used = 0;
      if (s.units) for (var i = 0; i < s.units.length; i++) { if (s.units[i] && !s.units[i].dead && s.units[i].team === 1) used++; }
      max = used;
    }
    txt(D.armyN, String(Math.round(used)));
    txt(D.armyCap, '/ ' + Math.round(max));
    cls(D.army, 'full', max > 0 && used >= max);
    var q = 0, sm = Sim();
    if (sm && isFn(sm.queue)) { try { q = (sm.queue(1) || []).length; } catch (er) {} }
    txt(D.armyQ, q > 0 ? '+' + q : '');
  }

  function tickCooldown() {
    var e = Econ();
    if (!e || !e.run) return;
    var cd = num(e.run.spawnCd, 0);
    var max = view.spawnCdMax;
    try {
      if (e.TUNE && e.TUNE.army) {
        max = num(e.TUNE.army.spawnCooldown, 1) * num(e.mods ? e.mods.spawnCdMul : 1, 1);
      }
    } catch (er) {}
    if (max <= 0) max = 1;
    view.spawnCdMax = max;
    var f = clamp01(cd / max);
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i].el;
      cls(c, 'cooling', f > 0.01);
      if (f > 0.01) c.style.setProperty('--cd', f.toFixed(3) + 'turn');
    }
  }

  /* ---------------------------------------------------------------------------
   * 10. Minimap — one canvas, redrawn from live state, zero allocations
   * ------------------------------------------------------------------------ */
  var _miniW = 0, _miniH = 0, _miniDpr = 1;
  function sizeMini() {
    var c = D.miniCanvas, ctx = D.miniCtx;
    if (!c || !ctx) return false;
    var dpr = clamp(num(global.devicePixelRatio, 1), 1, 2);
    var w = c.clientWidth || 208, h = c.clientHeight || 40;
    if (w === _miniW && h === _miniH && dpr === _miniDpr) return true;
    _miniW = w; _miniH = h; _miniDpr = dpr;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    return true;
  }

  function drawMini(s) {
    var ctx = D.miniCtx;
    if (!ctx || !sizeMini()) return;
    var W = _miniW, H = _miniH, dpr = _miniDpr;
    var wl = num(AOW.W, 420);
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      /* ground band */
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(255,255,255,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath(); ctx.moveTo(0, H * 0.5); ctx.lineTo(W, H * 0.5); ctx.stroke();

      var you = cssVar('--team-you', '#57c7ff');
      var foe = cssVar('--team-foe', '#ff6b4d');

      /* forts */
      drawFortMark(ctx, (num(AOW.FORT_X ? AOW.FORT_X[1] : 20, 20) / wl) * W, H, you, s.forts ? s.forts[1] : null);
      drawFortMark(ctx, (num(AOW.FORT_X ? AOW.FORT_X[-1] : 400, 400) / wl) * W, H, foe, s.forts ? s.forts[-1] : null);

      /* units */
      var u, i, x, y, r;
      var units = s.units || [];
      for (i = 0; i < units.length; i++) {
        u = units[i];
        if (!u || u.dead) continue;
        x = clamp((num(u.x, 0) / wl) * W, 1, W - 1);
        y = H * 0.5 + (num(u.z, 0) / 32) * (H * 0.62);
        r = (u.cls === 'boss') ? 3.2 : (u.cls === 'champion' ? 2.2 : 1.5);
        ctx.fillStyle = u.team === 1 ? you : foe;
        ctx.globalAlpha = (u.cls === 'boss' || u.cls === 'champion') ? 1 : 0.85;
        ctx.beginPath();
        ctx.arc(x, clamp(y, 2, H - 2), r, 0, 6.283185307179586);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* camera focus marker */
      var R = Rend();
      if (R && isFn(R.getFocusX)) {
        var fx = clamp((num(R.getFocusX(), 0) / wl) * W, 0, W);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(fx) - 12.5, 1.5, 25, H - 3);
      }
    } catch (e) { warn('mini:draw', 'minimap draw failed — disabling it.', e); prefs.minimap = false; applyPrefs(); }
  }

  function drawFortMark(ctx, x, H, color, fort) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 1;
    ctx.fillRect(Math.round(x) - 2, 3, 4, H - 6);
    if (fort && fort.max > 0) {
      var f = clamp01(fort.hp / fort.max);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(Math.round(x) - 2, 3, 4, (H - 6) * (1 - f));
    }
  }

  var _cssVarCache = Object.create(null);
  function cssVar(name, fallback) {
    if (_cssVarCache[name]) return _cssVarCache[name];
    try {
      var v = global.getComputedStyle(root).getPropertyValue(name);
      v = (v || '').trim();
      _cssVarCache[name] = v || fallback;
      return _cssVarCache[name];
    } catch (e) { return fallback; }
  }
  function flushCssVarCache() { _cssVarCache = Object.create(null); }

  /* ---------------------------------------------------------------------------
   * 11. Dev / perf overlay
   * ------------------------------------------------------------------------ */
  var _devT = 0;
  function drawDev() {
    if (!D.dev) return;
    _devT++;
    if (_devT % 10 !== 0) return;
    var c = Core(), R = Rend(), s = ST();
    var lines = [];
    if (c && c.perf) {
      lines.push('fps ' + Math.round(c.perf.fps) + '  ' + c.perf.emaMs.toFixed(1) + 'ms  tier ' + c.perf.tier);
      lines.push('steps ' + c.perf.simSteps + '  dropped ' + c.perf.droppedSteps + '  long ' + c.perf.longFrames);
    }
    if (R && isFn(R.getStats)) {
      var st = R.getStats();
      lines.push('draw ' + st.drawCalls + '  tris ' + fmt(st.triangles) + '  tex ' + st.textures + '  geo ' + st.geometries);
    }
    if (s) {
      var alive = 0, mine = 0, i;
      for (i = 0; i < s.units.length; i++) { if (s.units[i] && !s.units[i].dead) { alive++; if (s.units[i].team === 1) mine++; } }
      lines.push('units ' + alive + ' (you ' + mine + ')  proj ' + s.projectiles.length + '  fx ' + s.fx.length);
      lines.push('wave ' + s.wave + '  era ' + s.era + '  phase ' + s.phase + '  x' + s.speed);
    }
    txt(D.dev, lines.join('\n'));
  }

  /* ---------------------------------------------------------------------------
   * 12. Feedback — toasts, floaters, banners, celebration
   * ------------------------------------------------------------------------ */
  var TOAST_KIND = {
    info:  { c: 'var(--info)', g: 'ℹ' },
    good:  { c: 'var(--good)', g: '✓' },
    warn:  { c: 'var(--warn)', g: '!' },
    bad:   { c: 'var(--bad)',  g: '✕' },
    era:   { c: 'var(--glow)', g: '⇪' },
    boss:  { c: 'var(--bad)',  g: '☠' },
    power: { c: 'var(--glow)', g: '✷' },
    stance:{ c: 'var(--info)', g: '⚑' },
    gold:  { c: 'var(--gold)', g: '◍' }
  };
  var toastQueue = [];
  var MAX_TOASTS = 4;
  var _lastToast = { msg: '', at: 0 };

  function toast(msg, kind) {
    if (!D.toasts || !msg) return;
    msg = String(msg);
    var now = Date.now();
    if (msg === _lastToast.msg && now - _lastToast.at < 900) return;   // no spam
    _lastToast.msg = msg; _lastToast.at = now;

    var k = TOAST_KIND[kind] || TOAST_KIND.info;
    var t = el('div', 'toast glass', '', D.toasts);
    t.style.setProperty('--tc', k.c);
    el('span', 'tg', k.g, t);
    el('span', '', msg, t);
    toastQueue.push(t);
    while (toastQueue.length > MAX_TOASTS) killToast(toastQueue.shift());
    setTimeout(function () {
      var i = toastQueue.indexOf(t);
      if (i >= 0) toastQueue.splice(i, 1);
      killToast(t);
    }, kind === 'bad' || kind === 'boss' ? 3600 : 2600);
  }
  function killToast(t) {
    if (!t || !t.parentNode) return;
    cls(t, 'out', true);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
  }

  /**
   * A number that flies off a world position.
   * @param {string} text  what to show
   * @param {number} wx world x  @param {number} wy world y  @param {number} wz world z
   * @param {string} kind 'gold'|'dmg'|'crit'|'heal'
   */
  var MAX_FLOATERS = 22;
  function floater(text, wx, wy, wz, kind) {
    if (!D.floaters || motionOff()) return;
    if (view.floaters >= MAX_FLOATERS) return;
    var pt = project(wx, wy, wz);
    if (!pt) return;
    var f = el('div', 'flt ' + (kind || 'dmg'), text, D.floaters);
    f.style.left = Math.round(pt.x) + 'px';
    f.style.top = Math.round(pt.y) + 'px';
    view.floaters++;
    setTimeout(function () {
      view.floaters--;
      if (f.parentNode) f.parentNode.removeChild(f);
    }, 1050);
  }

  var _proj = { x: 0, y: 0 };
  function project(x, y, z) {
    var R = Rend();
    if (R && isFn(R.worldToScreen)) {
      try {
        var p = R.worldToScreen(num(x, 0), num(y, 0), num(z, 0));
        if (p && isFinite(p.x) && isFinite(p.y)) {
          if (p.behind) return null;
          _proj.x = p.x; _proj.y = p.y;
          return _proj;
        }
      } catch (e) { /* fall through to the flat approximation */ }
    }
    var vw = global.innerWidth || 800, vh = global.innerHeight || 600;
    var wl = num(AOW.W, 420);
    _proj.x = clamp((num(x, 0) / wl) * vw, 10, vw - 10);
    _proj.y = clamp(vh * 0.56 - num(y, 0) * 8, 40, vh - 40);
    return _proj;
  }

  /** Big centred cinematic banner. */
  function banner(title, sub, kind) {
    if (!D.banner) return;
    txt(D.bannerT, String(title || ''));
    txt(D.bannerS, String(sub || ''));
    cls(D.banner, 'boss', kind === 'boss');
    cls(D.banner, 'is-on', false);
    try { void D.banner.offsetWidth; } catch (e) {}
    cls(D.banner, 'is-on', true);
    show(D.bannerRays, kind !== 'boss');
    setTimeout(function () { cls(D.banner, 'is-on', false); }, 2700);
  }

  var CONF_COLORS = ['#ffd978', '#6fd08a', '#7fc4ff', '#ff8f5e', '#b478ff'];
  function celebrate(count) {
    if (!D.confetti || motionOff()) return;
    var n = clamp(num(count, 40) | 0, 6, 90);
    for (var i = 0; i < n; i++) {
      var p = el('i', '', '', D.confetti);
      p.style.left = (Math.random() * 100).toFixed(2) + '%';
      p.style.background = CONF_COLORS[(Math.random() * CONF_COLORS.length) | 0];
      var dur = 1600 + Math.random() * 1600;
      p.style.animationDuration = dur + 'ms';
      p.style.animationDelay = (Math.random() * 420).toFixed(0) + 'ms';
      p.style.transform = 'rotate(' + ((Math.random() * 90) | 0) + 'deg)';
      (function (node, life) {
        setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, life + 700);
      })(p, dur);
    }
  }

  function screenFlash() {
    if (!D.flash || motionOff()) return;
    cls(D.flash, 'go', false);
    try { void D.flash.offsetWidth; } catch (e) {}
    cls(D.flash, 'go', true);
  }

  function bumpStreak(n) {
    view.streak = n;
    if (n < 3) { show(D.streak, false); return; }
    var word = n >= 20 ? 'UNSTOPPABLE' : (n >= 12 ? 'RAMPAGE' : (n >= 7 ? 'DOMINATING' : 'STREAK'));
    txt(D.streak, word + ' ×' + n);
    show(D.streak, true);
    view.streakT = 2.2;
    if (n === 3 || n === 7 || n === 12 || n === 20) haptic('soft');
  }

  /** One-shot contextual hint; each id shows at most once per install. */
  function coach(id, msg) {
    if (!D.coachTip || !id || prefs.coachSeen[id]) return;
    if (tut.active) return;
    prefs.coachSeen[id] = 1;
    savePrefs();
    txt(D.coachTip, msg);
    show(D.coachTip, true);
    clearTimeout(coach._t);
    coach._t = setTimeout(function () { show(D.coachTip, false); }, 4200);
  }

  /* ---------------------------------------------------------------------------
   * 13. Modal panel framework — accessible, animated, focus-trapped
   * ------------------------------------------------------------------------ */
  var panelStack = [];
  var _lastFocus = null;

  function currentPanel() { return panelStack.length ? panelStack[panelStack.length - 1] : null; }
  function isPanelOpen(id) {
    if (!id) return panelStack.length > 0;
    for (var i = 0; i < panelStack.length; i++) if (panelStack[i].id === id) return true;
    return false;
  }

  /**
   * Open a registered panel.
   * @param {string} id  one of PANELS
   * @param {*} data     panel-specific payload
   */
  function openPanel(id, data) {
    if (!doc || !D.modal) return null;
    var def = PANELS[id];
    if (!def) { warn('panel:' + id, 'unknown panel "' + id + '" — ignored.'); return null; }
    if (isPanelOpen(id)) { return currentPanel(); }

    try { _lastFocus = doc.activeElement; } catch (e) { _lastFocus = null; }

    var rec = { id: id, def: def, data: data, dismissable: def.dismissable !== false, node: null };
    var p = el('div', 'panel glass' + (def.size ? ' ' + def.size : ''), '', D.modal);
    attr(p, 'role', 'dialog');
    attr(p, 'aria-modal', 'true');
    attr(p, 'aria-label', def.title || id);
    rec.node = p;

    var head = el('div', 'phead', '', p);
    var ht = el('div', '', '', head);
    el('h2', '', def.title || cap(id), ht);
    var sub = el('div', 'sub', def.sub || '', ht);
    rec.sub = sub;
    el('div', 'spacer', '', head);
    if (rec.dismissable) {
      var x = el('button', 'pclose', '✕', head);
      attr(x, 'aria-label', 'Close');
      tap(x, function () { closePanel(id); }, 'pclose');
    }

    var body = el('div', 'pbody', '', p);
    var foot = el('div', 'pfoot', '', p);
    rec.body = body; rec.foot = foot;

    try { def.build(body, foot, rec); }
    catch (e) {
      warn('panel:build:' + id, 'panel "' + id + '" failed to build — showing a stub.', e);
      clear(body);
      el('div', 'dim', 'This panel could not be opened.', body);
    }
    if (!foot.childNodes.length) foot.style.display = 'none';

    panelStack.push(rec);
    show(D.scrim, true);
    /* let the browser paint the start state before the transition */
    if (global.requestAnimationFrame) global.requestAnimationFrame(function () { cls(p, 'is-on', true); });
    else cls(p, 'is-on', true);

    if (def.pauses !== false) doPause(true);
    focusFirst(p);
    emit('ui:panel', { id: id, open: true });
    return rec;
  }

  function closePanel(id) {
    if (!panelStack.length) return;
    var rec = null, i;
    if (id) {
      for (i = panelStack.length - 1; i >= 0; i--) { if (panelStack[i].id === id) { rec = panelStack.splice(i, 1)[0]; break; } }
    } else {
      rec = panelStack.pop();
    }
    if (!rec) return;

    var node = rec.node;
    cls(node, 'is-on', false);
    setTimeout(function () { if (node && node.parentNode) node.parentNode.removeChild(node); }, 260);
    if (isFn(rec.def.onClose)) { try { rec.def.onClose(rec); } catch (e) { warn('panel:close', 'onClose threw', e); } }

    if (!panelStack.length) {
      show(D.scrim, false);
      if (rec.def.pauses !== false && !panelWantsPause()) doPause(false);
      try { if (_lastFocus && isFn(_lastFocus.focus)) _lastFocus.focus(); } catch (e) {}
    } else {
      focusFirst(currentPanel().node);
    }
    emit('ui:panel', { id: rec.id, open: false });
  }

  function closeAllPanels() { while (panelStack.length) closePanel(); }

  function panelWantsPause() {
    for (var i = 0; i < panelStack.length; i++) if (panelStack[i].def.pauses !== false) return true;
    return false;
  }

  var FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  function focusables(node) {
    if (!node || !node.querySelectorAll) return [];
    var out = [], list = node.querySelectorAll(FOCUSABLE), i;
    for (i = 0; i < list.length; i++) {
      var n = list[i];
      if (n.disabled) continue;
      if (n.offsetParent === null && n.tagName !== 'BUTTON') continue;
      out.push(n);
    }
    return out;
  }
  function focusFirst(node) {
    var f = focusables(node);
    try { if (f.length) f[0].focus(); else if (node && isFn(node.focus)) { attr(node, 'tabindex', '-1'); node.focus(); } }
    catch (e) {}
  }
  function trapTab(ev) {
    var rec = currentPanel();
    if (!rec) return;
    var f = focusables(rec.node);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1], a = doc.activeElement;
    if (ev.shiftKey && (a === first || !rec.node.contains(a))) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && (a === last || !rec.node.contains(a))) { ev.preventDefault(); first.focus(); }
  }

  /* --- small panel building blocks ---------------------------------------- */
  function section(parent, title) {
    var s = el('div', 'sect', '', parent);
    if (title) el('h3', '', title, s);
    return s;
  }
  function footBtn(foot, label, kind, fn, key) {
    var b = el('button', 'btn' + (kind ? ' ' + kind : ''), label, foot);
    tap(b, fn, key || 'footbtn');
    return b;
  }
  function emptyNote(parent, msg) {
    var n = el('div', 'dim', msg, parent);
    n.style.padding = '18px 0';
    n.style.textAlign = 'center';
    return n;
  }
  function statCard(parent, label, value) {
    var c = el('div', 'stat-c', '', parent);
    el('b', 'num', String(value), c);
    el('span', '', label, c);
    return c;
  }
  function tabsBar(parent, items, initial, onPick) {
    var bar = el('div', 'tabs', '', parent);
    var nodes = [];
    function select(id) {
      for (var i = 0; i < nodes.length; i++) cls(nodes[i].n, 'on', nodes[i].id === id);
      onPick(id);
    }
    for (var i = 0; i < items.length; i++) {
      (function (it) {
        var b = el('button', 'tb', it.label, bar);
        nodes.push({ id: it.id, n: b });
        tap(b, function () { select(it.id); }, 'tab');
      })(items[i]);
    }
    select(initial || (items[0] && items[0].id));
    return bar;
  }

  /* ---------------------------------------------------------------------------
   * 14. The panels
   * ------------------------------------------------------------------------ */
  function buildStore(body, foot, rec) {
    var e = Econ();
    if (!e) { emptyNote(body, 'The store is unavailable right now.'); return; }

    var host = el('div', '', '', body);
    var cats = [
      { id: 'all', label: 'All' },
      { id: 'boost', label: 'Boosts' },
      { id: 'gear', label: 'Gear' },
      { id: 'cosmetic', label: 'Cosmetics' },
      { id: 'utility', label: 'Utility' }
    ];
    var listHost = el('div', '', '', body);

    function render(cat) {
      clear(listHost);

      /* treasury: the single most important purchase in a run */
      if (isFn(e.treasuryCost)) {
        var tsec = section(listHost, 'Treasury');
        var g0 = el('div', 'grid', '', tsec);
        var cost = e.treasuryCost();
        var lvl = isFn(e.treasuryLevel) ? e.treasuryLevel() : 0;
        var inc = isFn(e.treasuryIncome) ? e.treasuryIncome() : 0;
        var it = el('div', 'item', '', g0);
        el('div', 't', 'Treasury  ·  Level ' + lvl, it);
        el('div', 'd', 'Passive income, forever. Currently +' + fmt(inc) + ' gold/s.', it);
        var row = el('div', 'row', '', it);
        if (isFinite(cost)) {
          el('div', 'price num', fmt(cost) + ' g', row);
          var can = isFn(e.canBuyTreasury) ? e.canBuyTreasury() : false;
          var b = el('button', 'btn sm cta', 'Upgrade', row);
          if (!can) b.setAttribute('disabled', 'disabled');
          tap(b, function () {
            if (intent('treasury', null, function () { return e.buyTreasury(); })) { render(cat); haptic('soft'); }
          }, 'treasury');
        } else {
          el('div', 'dim', 'Fully upgraded', row);
        }
      }

      var items = [];
      try { items = e.storeView(cat === 'all' ? null : cat) || []; }
      catch (er) { warn('store', 'Economy.storeView() failed', er); }

      if (!items.length) { emptyNote(listHost, 'Nothing for sale in this category yet.'); return; }
      var sec = section(listHost, cat === 'all' ? 'Everything' : cap(cat));
      var grid = el('div', 'grid', '', sec);
      for (var i = 0; i < items.length; i++) {
        (function (it) {
          var node = el('div', 'item', '', grid);
          cls(node, 'owned', it.owned > 0 && it.owned >= it.max);
          cls(node, 'poor', !it.affordable);
          el('div', 't', it.name + (it.max > 1 && it.owned ? '  ×' + it.owned : ''), node);
          el('div', 'd', it.desc || '', node);
          var r = el('div', 'row', '', node);
          var price = el('div', 'price num' + (it.currency === 'gems' ? ' gem' : ''), fmt(it.price) + (it.currency === 'gems' ? ' ◈' : ' g'), r);
          el('div', 'spacer', '', r).style.flex = '1';
          if (it.owned >= it.max && it.max > 0) {
            el('div', 'dim', 'Owned', r);
          } else {
            var b = el('button', 'btn sm' + (it.affordable ? ' cta' : ''), 'Buy', r);
            if (!it.affordable) b.setAttribute('disabled', 'disabled');
            tap(b, function () {
              if (intent('store-buy', { id: it.id }, function () { return e.buyStore(it.id); })) { render(cat); haptic('soft'); }
              else { pulse(price, 'deny'); }
            }, 'buy');
          }
        })(items[i]);
      }
    }

    tabsBar(host, cats, 'all', render);
    footBtn(foot, 'Upgrades', '', function () { openPanel('upgrades'); }, 'gostore');
    footBtn(foot, 'Loadout', '', function () { openPanel('loadout'); }, 'goload');
    el('div', 'spacer', '', foot);
    footBtn(foot, 'Close', 'cta', function () { closePanel('store'); }, 'closestore');
  }

  function buildUpgrades(body, foot, rec) {
    var e = Econ();
    if (!e || !isFn(e.metaTreeView)) { emptyNote(body, 'The upgrade tree is unavailable.'); return; }

    var head = el('div', '', '', body);
    var renownLine = el('div', 'dim', '', head);

    var treeHost = el('div', '', '', body);

    function render() {
      var renown = isFn(e.renown) ? e.renown() : 0;
      txt(renownLine, 'Renown available: ' + fmt(renown));
      clear(treeHost);
      var branches = [];
      try { branches = e.metaTreeView() || []; } catch (er) { warn('tree', 'metaTreeView() failed', er); }
      if (!branches.length) { emptyNote(treeHost, 'No upgrades yet — clear a mission to earn renown.'); return; }

      var tree = el('div', 'tree', '', treeHost);
      for (var i = 0; i < branches.length; i++) {
        (function (b) {
          var col = el('div', 'branch', '', tree);
          var h = el('div', 'bh', b.name, col);
          if (b.color) h.style.color = b.color;
          for (var j = 0; j < b.nodes.length; j++) {
            var n = b.nodes[j];
            if (j > 0) {
              var conn = el('div', 'conn', '', col);
              var prev = b.nodes[j - 1];
              el('i', '', '', conn).style.setProperty('--fill', String(clamp01(prev.tier / Math.max(1, prev.tiers))));
            }
            (function (nd) {
              var node = el('div', 'node', '', col);
              cls(node, 'maxed', !!nd.maxed);
              cls(node, 'locked', !nd.affordable && !nd.maxed);
              el('div', 'nt', nd.name, node);
              el('div', 'nd', nd.desc || '', node);
              var pips = el('div', 'pips', '', node);
              for (var p = 0; p < nd.tiers; p++) cls(el('i', '', '', pips), 'on', p < nd.tier);
              if (nd.maxed) {
                el('div', 'dim', 'Maxed  ·  ' + nd.value + (nd.unit || ''), node);
              } else {
                var btn = el('button', 'btn sm' + (nd.affordable ? ' cta' : ''), fmt(nd.cost) + ' renown', node);
                if (!nd.affordable) btn.setAttribute('disabled', 'disabled');
                tap(btn, function () {
                  if (intent('meta-buy', { id: nd.id }, function () { return e.buyMeta(nd.id); })) { render(); haptic('soft'); }
                }, 'meta');
              }
            })(n);
          }
        })(branches[i]);
      }
    }
    render();
    rec.render = render;

    footBtn(foot, 'Respec', 'danger', function () {
      if (intent('meta-respec', null, function () { return e.respecMeta(); })) { render(); toast('Upgrades refunded', 'good'); }
    }, 'respec');
    el('div', 'spacer', '', foot);
    footBtn(foot, 'Done', 'cta', function () { closePanel('upgrades'); }, 'closetree');
  }

  function buildPerks(body, foot, rec) {
    var e = Econ();
    var offer = rec.data || (e && isFn(e.currentOffer) ? e.currentOffer() : null);
    var defs = (rec.data && rec.data.perks) ? rec.data.perks : null;
    if (!defs && offer && offer.choices && e && isFn(e.perkDef)) {
      defs = [];
      for (var i = 0; i < offer.choices.length; i++) {
        var d = e.perkDef(offer.choices[i]);
        if (d) defs.push(d);
      }
    }
    if (!defs || !defs.length) { emptyNote(body, 'No perks on offer.'); return; }

    el('div', 'dim', 'Choose one. It lasts for the rest of this run.', body);
    var host = el('div', 'perks', '', body);
    for (var j = 0; j < defs.length; j++) {
      (function (p, idx) {
        var r = rarityOf(p.rarity);
        var c = el('div', 'perk clickable', '', host);
        c.style.setProperty('--rc', r.color);
        c.style.animationDelay = (idx * 90) + 'ms';
        attr(c, 'aria-label', p.name + ', ' + r.name + ' perk');
        el('div', 'rar', r.name, c);
        el('div', 'pn', p.name, c);
        el('div', 'pd', p.desc || '', c);
        if (p.tags && p.tags.length) {
          var t = el('div', 'tags', '', c);
          for (var k = 0; k < p.tags.length; k++) el('span', '', String(p.tags[k]), t);
        }
        tap(c, function () {
          if (intent('perk-take', { id: p.id }, function () { return e && isFn(e.choosePerk) ? e.choosePerk(p.id) : false; })) {
            haptic('heavy');
            celebrate(24);
            closePanel('perks');
          }
        }, 'perk');
      })(defs[j], j);
    }

    var rerolls = num(offer && offer.rerolls, 0);
    if (rerolls > 0 && e && isFn(e.rerollOffer)) {
      footBtn(foot, 'Reroll (' + rerolls + ')', '', function () {
        if (intent('perk-reroll', null, function () { return e.rerollOffer(); })) {
          closePanel('perks');
        }
      }, 'reroll');
    }
    el('div', 'spacer', '', foot);
    footBtn(foot, 'Skip', '', function () {
      intent('perk-decline', null, function () { return e && isFn(e.declineOffer) ? e.declineOffer() : false; });
      closePanel('perks');
    }, 'perkskip');
  }

  function buildLoadout(body, foot, rec) {
    var e = Econ();
    if (!e || !isFn(e.loadouts)) { emptyNote(body, 'Loadouts are unavailable.'); return; }
    var host = el('div', '', '', body);

    function render() {
      clear(host);
      var los = [];
      try { los = e.loadouts() || []; } catch (er) { warn('loadout', 'loadouts() failed', er); }
      if (!los.length) { emptyNote(host, 'No loadouts saved yet.'); return; }

      var sec = section(host, 'Loadouts');
      var grid = el('div', 'grid', '', sec);
      for (var i = 0; i < los.length; i++) {
        (function (lo, idx) {
          var node = el('div', 'item', '', grid);
          el('div', 't', (lo && lo.name) ? lo.name : ('Loadout ' + (idx + 1)), node);
          var gearNames = [];
          if (lo && lo.gear) { for (var k in lo.gear) { if (lo.gear[k]) gearNames.push(gearLabel(lo.gear[k])); } }
          el('div', 'd', gearNames.length ? gearNames.join(' · ') : 'Empty', node);
          var r = el('div', 'row', '', node);
          var apply = el('button', 'btn sm cta', 'Equip', r);
          tap(apply, function () {
            if (intent('loadout-apply', { index: idx }, function () { return e.applyLoadout(idx); })) {
              toast('Loadout equipped', 'good'); render();
            }
          }, 'lo-apply');
          var save = el('button', 'btn sm', 'Save current', r);
          tap(save, function () {
            if (intent('loadout-save', { index: idx }, function () { return e.saveLoadout(idx); })) {
              toast('Loadout saved', 'good'); render();
            }
          }, 'lo-save');
        })(los[i], i);
      }

      /* gear slots */
      var slots = e.GEAR_SLOTS || [];
      if (slots.length) {
        var gs = section(host, 'Gear');
        var gg = el('div', 'grid', '', gs);
        for (var s2 = 0; s2 < slots.length; s2++) {
          (function (slot) {
            var sid = (typeof slot === 'string') ? slot : slot.id;
            var sname = (typeof slot === 'string') ? cap(slot) : (slot.name || cap(slot.id));
            var node = el('div', 'item', '', gg);
            el('div', 't', sname, node);
            var owned = ownedGearFor(sid);
            if (!owned.length) { el('div', 'd', 'Nothing owned for this slot.', node); return; }
            var row = el('div', 'row', '', node);
            for (var g = 0; g < owned.length; g++) {
              (function (gd) {
                var b = el('button', 'btn sm', gd.name || gd.id, row);
                tap(b, function () {
                  if (intent('gear-equip', { id: gd.id, slot: sid }, function () { return e.equipGear(gd.id); })) {
                    toast(gd.name + ' equipped', 'good'); render();
                  }
                }, 'gear');
              })(owned[g]);
            }
          })(slots[s2]);
        }
      }
    }

    function gearLabel(id) {
      try {
        var d = e.gearDef ? e.gearDef(id) : null;
        return d && d.name ? d.name : String(id);
      } catch (er) { return String(id); }
    }
    function ownedGearFor(slot) {
      var out = [], all = e.EQUIPMENT || [];
      for (var i = 0; i < all.length; i++) {
        var g = all[i];
        if (!g || (slot && g.slot && g.slot !== slot)) continue;
        var owns = true;
        try { owns = isFn(e.ownsGear) ? e.ownsGear(g.id) : true; } catch (er) {}
        if (owns) out.push(g);
      }
      return out;
    }

    render();
    el('div', 'spacer', '', foot);
    footBtn(foot, 'Done', 'cta', function () { closePanel('loadout'); }, 'closeload');
  }

  function buildCampaign(body, foot, rec) {
    var C = Camp();
    if (!C || !isFn(C.mapView)) { emptyNote(body, 'The campaign map is unavailable.'); return; }
    var nodes = [];
    try { nodes = C.mapView() || []; } catch (er) { warn('map', 'mapView() failed', er); }
    if (!nodes.length) { emptyNote(body, 'No campaign nodes found.'); return; }

    var info = el('div', 'dim', '', body);
    var map = el('div', 'map', '', body);
    var lines = svg('svg', map);
    attr(lines, 'viewBox', '0 0 100 100');
    attr(lines, 'preserveAspectRatio', 'none');

    var byId = Object.create(null), i, j;
    for (i = 0; i < nodes.length; i++) byId[nodes[i].id] = nodes[i];

    /* connectors first so the pins sit on top */
    for (i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n.links) continue;
      for (j = 0; j < n.links.length; j++) {
        var t = byId[n.links[j]];
        if (!t) continue;
        var ln = svg('line', lines);
        attr(ln, 'x1', pct(n.x)); attr(ln, 'y1', pct(n.y));
        attr(ln, 'x2', pct(t.x)); attr(ln, 'y2', pct(t.y));
        attr(ln, 'stroke', n.cleared ? 'rgba(255,207,92,.55)' : 'rgba(255,255,255,.14)');
        attr(ln, 'stroke-width', '0.6');
        attr(ln, 'vector-effect', 'non-scaling-stroke');
      }
    }

    for (i = 0; i < nodes.length; i++) {
      (function (n) {
        var pin = el('div', 'mnode', n.icon || '⚑', map);
        pin.style.left = pct(n.x) + '%';
        pin.style.top = pct(n.y) + '%';
        cls(pin, 'locked', !n.unlocked);
        cls(pin, 'cleared', !!n.cleared);
        cls(pin, 'current', !!n.current);
        attr(pin, 'aria-label', n.name + ' — ' + n.typeName + (n.cleared ? ', cleared' : (n.unlocked ? '' : ', locked')));
        if (n.stars > 0) el('div', 'st', new Array(n.stars + 1).join('★'), pin);
        pin.addEventListener('mouseenter', function () {
          txt(info, n.name + ' · ' + n.typeName + ' · ' + (n.eraName || '') + (n.lore ? ' — ' + n.lore : ''));
        }, false);
        tap(pin, function () {
          if (!n.unlocked) { toast('Locked — clear the path first', 'warn'); return; }
          if (intent('campaign-start', { node: n.id }, function () { return C.startNode(n.id); })) {
            closeAllPanels();
            banner(n.name, n.typeName || 'Mission');
          }
        }, 'mapnode');
      })(nodes[i]);
    }

    var stats = el('div', 'stats', '', body);
    var cleared = 0, stars = 0;
    for (i = 0; i < nodes.length; i++) { if (nodes[i].cleared) cleared++; stars += num(nodes[i].stars, 0); }
    statCard(stats, 'Cleared', cleared + '/' + nodes.length);
    statCard(stats, 'Stars', stars);
    if (isFn(C.achievementCount)) {
      try { statCard(stats, 'Achievements', C.achievementCount() + '/' + C.achievementTotal); } catch (er) {}
    }
    if (isFn(C.difficulty)) {
      try {
        var d = C.difficultyDef ? C.difficultyDef(C.difficulty()) : null;
        statCard(stats, 'Difficulty', d && d.name ? d.name : cap(C.difficulty()));
      } catch (er) {}
    }

    if (isFn(C.startEndless)) {
      footBtn(foot, 'Endless', '', function () {
        if (intent('endless-start', null, function () { return C.startEndless(); })) { closeAllPanels(); banner('ENDLESS', 'Survive'); }
      }, 'endless');
    }
    if (isFn(C.hasResume) && isFn(C.resume)) {
      try {
        if (C.hasResume()) footBtn(foot, 'Resume', 'cta', function () {
          if (intent('campaign-resume', null, function () { return C.resume(); })) closeAllPanels();
        }, 'resume');
      } catch (er) {}
    }
    el('div', 'spacer', '', foot);
    footBtn(foot, 'Close', '', function () { closePanel('campaign'); }, 'closemap');
  }
  function pct(v) { return clamp(num(v, 50), 0, 100).toFixed(2); }

  /* --- settings ------------------------------------------------------------ */
  function toggleRow(parent, label, hint, get, set) {
    var r = el('div', 'setrow', '', parent);
    var l = el('div', 'lbl', '', r);
    el('span', '', label, l);
    if (hint) el('span', 'hint', hint, l);
    var sw = el('div', 'sw clickable', '', r);
    el('i', '', '', sw);
    attr(sw, 'role', 'switch');
    function sync() {
      var v = !!get();
      cls(sw, 'on', v);
      attr(sw, 'aria-checked', v ? 'true' : 'false');
    }
    attr(sw, 'aria-label', label);
    tap(sw, function () { set(!get()); sync(); }, 'toggle');
    sync();
    return sw;
  }
  function segRow(parent, label, hint, options, get, set) {
    var r = el('div', 'setrow', '', parent);
    var l = el('div', 'lbl', '', r);
    el('span', '', label, l);
    if (hint) el('span', 'hint', hint, l);
    var seg = el('div', 'seg', '', r);
    var btns = [];
    function sync() {
      var v = get();
      for (var i = 0; i < btns.length; i++) cls(btns[i].n, 'on', btns[i].v === v);
    }
    for (var i = 0; i < options.length; i++) {
      (function (o) {
        var b = el('button', '', o.label, seg);
        btns.push({ n: b, v: o.value });
        tap(b, function () { set(o.value); sync(); }, 'seg');
      })(options[i]);
    }
    sync();
    return seg;
  }
  function sliderRow(parent, label, hint, min, max, step, get, set) {
    var r = el('div', 'setrow', '', parent);
    var l = el('div', 'lbl', '', r);
    el('span', '', label, l);
    var h = el('span', 'hint', hint || '', l);
    var input = el('input', '', '', r);
    attr(input, 'type', 'range');
    attr(input, 'min', String(min)); attr(input, 'max', String(max)); attr(input, 'step', String(step));
    attr(input, 'aria-label', label);
    input.value = String(get());
    input.addEventListener('input', guard(function () {
      var v = parseFloat(input.value);
      if (!isFinite(v)) return;
      set(v);
      if (hint !== null) txt(h, Math.round(v * 100) + '%');
    }, 'slider'), false);
    if (hint !== null) txt(h, Math.round(num(get(), 0) * 100) + '%');
    return input;
  }

  function buildSettings(body, foot) {
    var s = ST();
    var settings = (s && s.settings) ? s.settings : {};
    var c = Core();
    function commit() { if (c && isFn(c.emit)) c.emit('settings:change', settings); if (c && isFn(c.requestSave)) c.requestSave(); }

    var a = section(body, 'Accessibility');
    sliderRow(a, 'UI scale', '', 0.85, 1.35, 0.05, function () { return prefs.scale; }, function (v) {
      prefs.scale = v; applyPrefs(); savePrefs();
    });
    toggleRow(a, 'Colour-blind safe teams', 'Blue / orange instead of blue / red',
      function () { return prefs.colorblind; },
      function (v) { prefs.colorblind = v; applyPrefs(); flushCssVarCache(); savePrefs(); });
    toggleRow(a, 'Reduced motion', 'Cuts animation and screen effects',
      function () { return prefs.reducedMotion; },
      function (v) { prefs.reducedMotion = v; applyPrefs(); savePrefs(); });
    segRow(a, 'Handedness', 'Which side the action rail sits on',
      [{ label: 'Right', value: 'right' }, { label: 'Left', value: 'left' }],
      function () { return prefs.hand; },
      function (v) { prefs.hand = v; applyPrefs(); savePrefs(); });
    toggleRow(a, 'Minimap', null, function () { return prefs.minimap; },
      function (v) { prefs.minimap = v; applyPrefs(); savePrefs(); });
    toggleRow(a, 'Haptics', 'Vibration feedback on this device',
      function () { return settings.haptics !== false; },
      function (v) { settings.haptics = v; commit(); if (v) haptic('soft'); });

    var g = section(body, 'Graphics');
    segRow(g, 'Quality', 'Auto adapts to your frame rate',
      [{ label: 'Auto', value: 'auto' }, { label: 'High', value: 'high' }, { label: 'Med', value: 'med' }, { label: 'Low', value: 'low' }],
      function () { return settings.quality || 'auto'; },
      function (v) {
        settings.quality = v;
        if (c && isFn(c.setQuality)) c.setQuality(v);
        var R = Rend();
        if (R && isFn(R.setQuality) && v !== 'auto') { try { R.setQuality(v); } catch (er) {} }
        commit();
      });
    toggleRow(g, 'Shadows', null, function () { return settings.shadows !== false; },
      function (v) { settings.shadows = v; commit(); });
    toggleRow(g, 'Bloom', null, function () { return settings.bloom !== false; },
      function (v) {
        settings.bloom = v;
        var R = Rend();
        if (R && isFn(R.setPostEnabled)) { try { R.setPostEnabled(v); } catch (er) {} }
        commit();
      });
    toggleRow(g, 'Blood', 'Turn off for a cleaner picture',
      function () { return settings.blood !== false; }, function (v) { settings.blood = v; commit(); });
    toggleRow(g, 'Damage numbers', null, function () { return settings.damageNumbers !== false; },
      function (v) { settings.damageNumbers = v; commit(); });
    sliderRow(g, 'Screen shake', '', 0, 1.5, 0.1, function () { return num(settings.shake, 1); },
      function (v) { settings.shake = v; commit(); });

    var au = section(body, 'Audio');
    toggleRow(au, 'Sound effects', null, function () { return settings.sfx !== false; },
      function (v) { settings.sfx = v; commit(); });
    sliderRow(au, 'SFX volume', '', 0, 1, 0.05, function () { return num(settings.volume, 0.8); },
      function (v) { settings.volume = v; commit(); });
    toggleRow(au, 'Music', null, function () { return settings.music !== false; },
      function (v) { settings.music = v; commit(); });
    sliderRow(au, 'Music volume', '', 0, 1, 0.05, function () { return num(settings.musicVolume, 0.5); },
      function (v) { settings.musicVolume = v; commit(); });

    var d = section(body, 'Developer');
    toggleRow(d, 'Performance overlay', 'Also toggled with F3',
      function () { return prefs.devOverlay; },
      function (v) { prefs.devOverlay = v; applyPrefs(); savePrefs(); });
    toggleRow(d, 'Show FPS in HUD', null, function () { return !!settings.showFps; },
      function (v) { settings.showFps = v; commit(); });

    footBtn(foot, 'Replay tutorial', '', function () {
      prefs.tutorialDone = false; prefs.coachSeen = {}; savePrefs();
      closeAllPanels();
      startTutorial(true);
    }, 'retut');
    el('div', 'spacer', '', foot);
    footBtn(foot, 'Done', 'cta', function () { closePanel('settings'); }, 'closeset');
  }

  function buildPause(body, foot) {
    var s = ST();
    var st = el('div', 'stats', '', body);
    if (s) {
      statCard(st, 'Wave', num(s.wave, 0));
      statCard(st, 'Era', s.era || '—');
      statCard(st, 'Gold', fmt(s.gold));
      statCard(st, 'Kills', fmt(s.stats ? s.stats.kills : 0));
    }
    var C = Camp();
    if (C && isFn(C.hud)) {
      try {
        var h = C.hud();
        if (h && h.active) {
          var box = el('div', 'tipbox', '', body);
          el('b', '', h.name || 'Mission', box);
          el('span', '', (h.blurb || '') + (h.tip ? '  ' + h.tip : ''), box);
        }
      } catch (er) {}
    }

    var grid = el('div', 'grid', '', body);
    quickAction(grid, 'Store', 'Buy boosts, gear and cosmetics.', function () { openPanel('store'); });
    quickAction(grid, 'Upgrades', 'Spend renown on permanent power.', function () { openPanel('upgrades'); });
    quickAction(grid, 'Campaign', 'Pick your next battle.', function () { openPanel('campaign'); });
    quickAction(grid, 'Settings', 'Graphics, audio, accessibility.', function () { openPanel('settings'); });
    quickAction(grid, 'Help', 'Controls and how the game works.', function () { openPanel('help'); });

    footBtn(foot, 'Abandon run', 'danger', function () {
      intent('abandon', null, function () {
        var C2 = Camp();
        if (C2 && isFn(C2.abandon)) return C2.abandon();
        var c = Core();
        if (c && isFn(c.gameOver)) { c.gameOver('defeat'); return true; }
        return false;
      });
      closeAllPanels();
    }, 'abandon');
    el('div', 'spacer', '', foot);
    footBtn(foot, 'Resume', 'cta', function () { closePanel('pause'); }, 'resume2');
  }
  function quickAction(parent, title, desc, fn) {
    var n = el('div', 'item clickable', '', parent);
    el('div', 't', title, n);
    el('div', 'd', desc, n);
    tap(n, fn, 'quick');
    return n;
  }

  function buildResult(body, foot, rec) {
    var win = rec.data && rec.data.result === 'victory';
    var C = Camp(), s = ST();
    var pm = null, sum = null;
    try { if (C && isFn(C.postMortem)) pm = C.postMortem(); } catch (er) {}
    try { if (C && isFn(C.sessionSummary)) sum = C.sessionSummary(); } catch (er) {}

    var v = el('div', 'verdict ' + (win ? 'win' : 'lose'), '', body);
    el('div', 'v title', win ? 'VICTORY' : 'DEFEAT', v);
    var reason = win
      ? ((sum && sum.name) ? sum.name : 'The enemy fort has fallen.')
      : ((pm && pm.label) ? pm.label : 'Your fort has fallen.');
    el('div', 'r', reason, v);

    var st = el('div', 'stats', '', body);
    var src = pm || sum || {};
    statCard(st, 'Wave', num(src.wave, s ? s.wave : 0));
    statCard(st, 'Time', src.timeText || fmtTime(src.time || (s ? s.time : 0)));
    statCard(st, 'Kills', fmt(num(src.kills, s && s.stats ? s.stats.kills : 0)));
    statCard(st, 'Losses', fmt(num(src.losses, s && s.stats ? s.stats.losses : 0)));
    if (sum && sum.score) statCard(st, 'Score', fmt(sum.score));
    if (sum && sum.stars) statCard(st, 'Stars', new Array(num(sum.stars, 0) + 1).join('★') || '—');

    /* post-mortem: what actually killed you, biggest first */
    if (pm && pm.breakdown && pm.breakdown.length) {
      var sec = section(body, 'What killed you');
      var bd = el('div', 'bd', '', sec);
      var maxV = 0, i;
      for (i = 0; i < pm.breakdown.length; i++) maxV = Math.max(maxV, num(pm.breakdown[i].value || pm.breakdown[i].dmg || pm.breakdown[i].n, 0));
      for (i = 0; i < Math.min(pm.breakdown.length, 6); i++) {
        var b = pm.breakdown[i];
        var val = num(b.value || b.dmg || b.n, 0);
        var r = el('div', 'r', '', bd);
        el('span', '', String(b.name || b.label || b.id || '?'), r).style.minWidth = '92px';
        var g = el('div', 'g', '', r);
        var fill = el('i', '', '', g);
        fill.style.transform = 'scaleX(' + (maxV > 0 ? (val / maxV).toFixed(3) : '0') + ')';
        fill.style.animationDelay = (i * 70) + 'ms';
        el('b', 'num', b.pct !== undefined ? Math.round(num(b.pct, 0) * 100) + '%' : fmt(val), r);
      }
    }
    if (pm && pm.tip) {
      var t = el('div', 'tipbox', '', body);
      el('b', '', pm.tipTitle || 'Next time', t);
      el('span', '', pm.tip, t);
    }
    if (sum && sum.newAchievements && sum.newAchievements.length) {
      var as = section(body, 'Unlocked');
      var ag = el('div', 'grid', '', as);
      for (var k = 0; k < sum.newAchievements.length; k++) {
        var ach = sum.newAchievements[k];
        var an = el('div', 'item owned', '', ag);
        el('div', 't', (ach && (ach.name || ach.id)) || 'Achievement', an);
        if (ach && ach.desc) el('div', 'd', ach.desc, an);
      }
    }

    if (!win && pm && pm.canRetryCheckpoint && C && isFn(C.retryCheckpoint)) {
      footBtn(foot, 'Retry checkpoint (wave ' + num(pm.checkpointWave, 0) + ')', 'cta', function () {
        if (intent('retry-checkpoint', null, function () { return C.retryCheckpoint(); })) closeAllPanels();
      }, 'retrycp');
    }
    footBtn(foot, win ? 'Continue' : 'Retry', win ? 'cta' : '', function () {
      var done = intent(win ? 'continue' : 'retry', null, function () {
        if (!win && C && isFn(C.retry)) return C.retry();
        if (win && C && isFn(C.mapView)) { closeAllPanels(); openPanel('campaign'); return true; }
        var c = Core();
        if (c && isFn(c.newRun)) { c.newRun(); return true; }
        return false;
      });
      if (done) closePanel('result');
    }, 'again');
    el('div', 'spacer', '', foot);
    footBtn(foot, 'Campaign map', '', function () { closeAllPanels(); openPanel('campaign'); }, 'tomap');
  }

  function buildSummary(body, foot, rec) {
    var sum = rec.data || {};
    var v = el('div', 'verdict ' + (sum.result === 'victory' ? 'win' : 'lose'), '', body);
    el('div', 'v title', sum.result === 'victory' ? 'CLEARED' : 'RUN OVER', v);
    el('div', 'r', (sum.name || '') + (sum.mode ? '  ·  ' + cap(sum.mode) : ''), v);

    var st = el('div', 'stats', '', body);
    statCard(st, 'Waves', num(sum.wave, 0));
    statCard(st, 'Time', sum.timeText || fmtTime(sum.time));
    statCard(st, 'Kills', fmt(num(sum.kills, 0)));
    statCard(st, 'Losses', fmt(num(sum.losses, 0)));
    statCard(st, 'Damage', fmt(num(sum.dmgDealt, 0)));
    statCard(st, 'Gold', fmt(num(sum.goldEarned, 0)));
    if (sum.score) statCard(st, 'Score', fmt(sum.score));
    if (sum.bossKills) statCard(st, 'Bosses', num(sum.bossKills, 0));

    if (sum.newRecord) {
      var box = el('div', 'tipbox', '', body);
      el('b', '', 'New record', box);
      el('span', '', 'Best result yet on this mission.', box);
    }
    if (sum.objectives && sum.objectives.length) {
      var sec = section(body, 'Objectives');
      for (var i = 0; i < sum.objectives.length; i++) {
        var o = sum.objectives[i];
        var r = el('div', 'setrow', '', sec);
        el('div', 'lbl', (o && (o.label || o.text || o.id)) || 'Objective', r);
        el('div', o && o.done ? '' : 'dim', o && o.done ? '✓' : '✕', r);
      }
    }
    if (sum.nextNodeName) {
      var n = el('div', 'tipbox', '', body);
      el('b', '', 'Next', n);
      el('span', '', sum.nextNodeName, n);
    }
    el('div', 'spacer', '', foot);
    footBtn(foot, 'Continue', 'cta', function () { closePanel('summary'); openPanel('campaign'); }, 'sumdone');
  }

  var HELP_ROWS = [
    ['Recruit', 'Tap a unit card, or press its number key. Gold is spent instantly; the unit marches out of your gate.'],
    ['Counters', 'Shields beat shock, shock beats ranged, ranged beats shields. Hold a card to read its stats.'],
    ['Stance', 'Attack pushes, Defend digs in (double turrets, less gold), Hold keeps the line at home.'],
    ['Formation', 'Shield Wall tanks, Wedge charges, Skirmish spreads out against splash.'],
    ['Evolve', 'Filling the era bar unlocks a whole new roster. It is the biggest power spike in the game.'],
    ['Power', 'The ✷ button charges from damage. Spend it when the enemy is clumped.'],
    ['Speed', 'The ▸ button runs the battle at 2× or 3×. Nothing about the outcome changes.']
  ];
  var KEY_ROWS = [
    ['1 – 9', 'Recruit that unit'],
    ['Q / E', 'Cycle stance / formation'],
    ['R', 'Cast power'],
    ['V', 'Evolve era'],
    ['Space', 'Pause'],
    ['Tab', 'Change speed'],
    ['M', 'Toggle minimap'],
    ['Esc', 'Close panel / pause'],
    ['F1', 'Help'],
    ['F3', 'Performance overlay']
  ];

  function buildHelp(body, foot) {
    var a = section(body, 'How to play');
    for (var i = 0; i < HELP_ROWS.length; i++) {
      var n = el('div', 'item', '', a);
      el('div', 't', HELP_ROWS[i][0], n);
      el('div', 'd', HELP_ROWS[i][1], n);
    }
    var k = section(body, 'Keyboard');
    for (var j = 0; j < KEY_ROWS.length; j++) {
      var r = el('div', 'setrow', '', k);
      el('div', 'lbl mono', KEY_ROWS[j][0], r);
      el('div', 'dim', KEY_ROWS[j][1], r);
    }
    footBtn(foot, 'Replay tutorial', '', function () {
      prefs.tutorialDone = false; savePrefs(); closeAllPanels(); startTutorial(true);
    }, 'help-tut');
    el('div', 'spacer', '', foot);
    footBtn(foot, 'Close', 'cta', function () { closePanel('help'); }, 'closehelp');
  }

  var PANELS = {
    store:     { title: 'Store',        sub: 'Spend gold and gems',        size: 'wide', build: buildStore },
    upgrades:  { title: 'Upgrades',     sub: 'Permanent renown upgrades',  size: 'wide', build: buildUpgrades },
    perks:     { title: 'Choose a perk', sub: 'One choice, whole run',     size: '',     build: buildPerks, dismissable: false },
    loadout:   { title: 'Loadout',      sub: 'Gear and saved kits',        size: 'wide', build: buildLoadout },
    campaign:  { title: 'Campaign',     sub: 'Pick your next battle',      size: 'wide', build: buildCampaign },
    settings:  { title: 'Settings',     sub: '',                           size: '',     build: buildSettings },
    pause:     { title: 'Paused',       sub: '',                           size: '',     build: buildPause },
    result:    { title: 'Battle report', sub: '',                          size: '',     build: buildResult, dismissable: false },
    summary:   { title: 'Session summary', sub: '',                        size: '',     build: buildSummary },
    help:      { title: 'Help',         sub: 'Controls and rules',         size: '',     build: buildHelp }
  };

  /* ---------------------------------------------------------------------------
   * 15. Onboarding — spotlight tutorial, 7 steps, skippable, never repeats
   * ------------------------------------------------------------------------ */
  var tut = { active: false, i: -1, wasPaused: false };

  var TUT_STEPS = [
    {
      target: function () { return D.gold.root; },
      title: 'Gold is everything',
      body: 'Gold trickles in and drops from every kill. It buys units, upgrades and eras. Never sit on a pile of it.'
    },
    {
      target: function () { return cards.length ? cards[0].el : D.cards; },
      title: 'Recruit your army',
      body: 'Tap a card to send that unit out of your gate. Hold a card to read its stats and what it counters.'
    },
    {
      target: function () { return D.army; },
      title: 'Supply cap',
      body: 'Your army has a supply limit. Losses free supply back up, so a wiped push is not the end of a run.'
    },
    {
      target: function () { return D.actStance; },
      title: 'Stance and formation',
      body: 'Attack pushes the line forward, Defend digs in and doubles your fort turrets. Formation decides how they stand.'
    },
    {
      target: function () { return D.actPower; },
      title: 'Your power',
      body: 'Damage charges this button. When it glows, spend it on the biggest clump of enemies you can see.'
    },
    {
      target: function () { return D.eraPill; },
      title: 'Evolve',
      body: 'Filling this bar lets you jump an era: a whole new roster, tougher walls, better everything. It is the win condition.'
    },
    {
      target: function () { return D.wavebox; },
      title: 'Read the wave',
      body: 'Every wave is previewed here before it lands — the chips tell you exactly what is coming, so you can counter it.'
    },
    {
      target: function () { return D.fortYou.root; },
      title: 'Hold the line',
      body: 'When this bar goes red, the screen pulses. Switch to Defend, stop buying, and rebuild the wall. Good luck.'
    }
  ];

  function startTutorial(force) {
    if (!inited || tut.active) return;
    if (!force && prefs.tutorialDone) return;
    var s = ST();
    if (s && s.settings && s.settings.tutorialDone && !force) return;
    tut.active = true;
    tut.wasPaused = !!(s && s.paused);
    doPause(true);
    show(D.tut, true);
    emit('ui:tutorial', { state: 'start' });
    tutStep(0);
  }

  function tutStep(i) {
    if (!tut.active) return;
    if (i >= TUT_STEPS.length) { endTutorial(false); return; }
    tut.i = i;
    var step = TUT_STEPS[i];
    var target = null;
    try { target = step.target(); } catch (e) { target = null; }

    txt(D.tutTitle, step.title);
    txt(D.tutBody, step.body);
    txt(D.tutNext, i === TUT_STEPS.length - 1 ? 'Play' : 'Next');

    clear(D.tutDots);
    for (var k = 0; k < TUT_STEPS.length; k++) cls(el('i', '', '', D.tutDots), 'on', k === i);

    placeSpotlight(target);
    emit('ui:tutorial', { state: 'step', index: i, total: TUT_STEPS.length });
  }

  function placeSpotlight(target) {
    var vw = global.innerWidth || 800, vh = global.innerHeight || 600;
    var r = null;
    try { if (target && target.getBoundingClientRect) r = target.getBoundingClientRect(); } catch (e) {}
    if (!r || (!r.width && !r.height)) {
      r = { left: vw / 2 - 60, top: vh / 2 - 30, width: 120, height: 60, bottom: vh / 2 + 30, right: vw / 2 + 60 };
    }
    var pad = 8;
    var h = D.tutHole;
    h.style.left = Math.round(r.left - pad) + 'px';
    h.style.top = Math.round(r.top - pad) + 'px';
    h.style.width = Math.round(r.width + pad * 2) + 'px';
    h.style.height = Math.round(r.height + pad * 2) + 'px';

    var cw = D.tutCoach.offsetWidth || 300, ch = D.tutCoach.offsetHeight || 160;
    var x = clamp(r.left + r.width / 2 - cw / 2, 12, vw - cw - 12);
    var y = r.bottom + 18;
    if (y + ch > vh - 12) y = clamp(r.top - ch - 18, 12, vh - ch - 12);
    D.tutCoach.style.left = Math.round(x) + 'px';
    D.tutCoach.style.top = Math.round(y) + 'px';
  }

  function endTutorial(skipped) {
    if (!tut.active) return;
    tut.active = false;
    tut.i = -1;
    show(D.tut, false);
    prefs.tutorialDone = true;
    savePrefs();
    var s = ST();
    if (s && s.settings) {
      s.settings.tutorialDone = true;
      var c = Core();
      if (c && isFn(c.requestSave)) c.requestSave();
    }
    if (!tut.wasPaused) doPause(false);
    emit('ui:tutorial', { state: skipped ? 'skipped' : 'done' });
    if (!skipped) toast('You are ready. Hold the line.', 'good');
  }

  /* ---------------------------------------------------------------------------
   * 16. Keyboard
   * ------------------------------------------------------------------------ */
  function onKey(ev) {
    if (!inited || !ev) return;
    var t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    var k = ev.key;

    if (k === 'Tab' && panelStack.length) { trapTab(ev); return; }

    if (k === 'Escape') {
      ev.preventDefault();
      if (tut.active) { endTutorial(true); return; }
      if (panelStack.length) {
        var rec = currentPanel();
        if (rec && rec.dismissable === false) return;
        closePanel();
      } else openPanel('pause');
      return;
    }

    if (tut.active) {
      if (k === 'Enter' || k === ' ') { ev.preventDefault(); tutStep(tut.i + 1); }
      return;
    }
    if (panelStack.length) return;

    if (k >= '0' && k <= '9') {
      var idx = (k === '0') ? 9 : (parseInt(k, 10) - 1);
      if (cards[idx]) { ev.preventDefault(); buyUnit(cards[idx].id, cards[idx]); }
      return;
    }
    switch (k) {
      case 'q': case 'Q': ev.preventDefault(); cycleStance(); break;
      case 'e': case 'E': ev.preventDefault(); cycleFormation(); break;
      case 'r': case 'R': ev.preventDefault(); castPower(); break;
      case 'v': case 'V': ev.preventDefault(); doEvolve(); break;
      case 'm': case 'M': ev.preventDefault(); prefs.minimap = !prefs.minimap; applyPrefs(); savePrefs(); break;
      case 'Tab': ev.preventDefault(); doSpeed(); break;
      case ' ': case 'Spacebar':
        ev.preventDefault();
        doPause(!(ST() && ST().paused));
        break;
      case 'F1': ev.preventDefault(); openPanel('help'); break;
      case 'F3':
        ev.preventDefault();
        prefs.devOverlay = !prefs.devOverlay;
        applyPrefs(); savePrefs();
        break;
      default: break;
    }
  }

  /* ---------------------------------------------------------------------------
   * 17. Bus wiring — everything the HUD shows is pushed to it by an event
   * ------------------------------------------------------------------------ */
  var lastKill = { x: 0, y: 2, z: 0, at: 0 };

  function wire() {
    /* --- economy ---------------------------------------------------------- */
    on('gold:change', function (p) {
      var s = ST();
      view.gold = p ? num(p.gold, s ? s.gold : 0) : (s ? s.gold : 0);
      var d = p ? num(p.delta, 0) : 0;
      if (d > 0) {
        pulse(D.gold.root, 'pop');
        if (d >= 8 && Date.now() - lastKill.at < 600) floater('+' + fmt(d), lastKill.x, lastKill.y, lastKill.z, 'gold');
      }
      refreshCards(false);
      syncEvolve();
    });
    on('gems:change', function (p) {
      if (p && num(p.delta, 0) > 0) { pulse(D.gems.root, 'pop'); toast('+' + fmt(p.delta) + ' gems', 'good'); }
    });
    on('econ:income', function () { syncEvolve(); });
    on('econ:mods', function () { buildCards(true); });
    on('econ:treasury', function (p) {
      if (p) toast('Treasury level ' + num(p.level, 0), 'good');
      syncEvolve();
    });
    on('store:buy', function (p) { if (p && p.name) toast(p.name + ' purchased', 'good'); });
    on('renown:change', function (p) { if (p && num(p.delta, 0) > 0) toast('+' + fmt(p.delta) + ' renown', 'good'); });
    on('bp:level', function (p) { if (p) { toast('Battle pass level ' + num(p.level, 0), 'good'); celebrate(20); } });
    on('reward:grant', function (p) {
      if (!p) return;
      toast((p.label ? p.label + ': ' : '') + '+' + fmt(p.amount) + ' ' + (p.kind || 'reward'), 'good');
    });
    on('quest:complete', function (p) { if (p) { toast('Quest complete — ' + (p.name || p.id || ''), 'good'); celebrate(18); } });
    on('daily:available', function () { toast('Daily reward is ready', 'good'); });
    on('unlock:new', function (p) {
      if (!p) return;
      toast('Unlocked: ' + (p.label || p.id), 'era');
      buildCards(true);
    });

    /* --- eras ------------------------------------------------------------- */
    on('era:evolve', function (p) {
      var i = p ? num(p.index, 0) : 0;
      view.era = i;
      applyEraSkin(i);
      flushCssVarCache();
      txt(D.eraName, String((p && p.era) || skinFor(i).name).toUpperCase());
      txt(D.eraIdx, (i + 1) + '/' + ERA_SKIN.length);
      banner((p && p.era ? p.era : skinFor(i).name).toUpperCase() + ' AGE', 'Your army evolves');
      celebrate(46);
      screenFlash();
      haptic('win');
      buildCards(true);
      syncEvolve();
    });
    on('units:morph', function () { buildCards(true); });
    on('era:intro', function (p) { if (p && p.name) banner(String(p.name).toUpperCase(), p.blurb || ''); });

    /* --- waves ------------------------------------------------------------ */
    on('wave:preview', function (p) {
      if (!p) return;
      view.wave = num(p.wave, 0);
      view.prepMax = Math.max(0.001, num(p.seconds, 3));
      view.prepT = view.prepMax;
      txt(D.waveName, 'WAVE ' + view.wave);
      cls(D.wavebox, 'boss', !!p.boss);
      renderComp(p.comp, !!p.boss);
      show(D.waveTimerWrap, true);
      coach('preview', 'The chips above show exactly what is coming. Counter it before it lands.');
    });
    on('wave:start', function (p) {
      view.prepT = 0;
      txt(D.waveSub, 'engaged');
      if (D.waveTimer) D.waveTimer.style.transform = 'scaleX(0)';
      if (p && num(p.wave, 0) % 5 === 0) banner('WAVE ' + num(p.wave, 0), 'Boss incoming', 'boss');
    });
    on('wave:clear', function (p) {
      var w = p ? num(p.wave, 0) : 0;
      banner('WAVE ' + w + ' CLEAR', '+' + fmt(p ? p.reward : 0) + ' gold');
      celebrate(38);
      haptic('win');
      txt(D.waveSub, 'cleared');
      bumpStreak(0);
    });
    on('endless:wave', function (p) { if (p) txt(D.waveName, 'WAVE ' + num(p.wave, 0)); });

    /* --- forts ------------------------------------------------------------ */
    on('fort:hit', function (p) {
      if (!p) return;
      var team = num(p.team, 1);
      var v = view.fort[team === -1 ? -1 : 1];
      if (v) v.hurtT = 0.45;
      var ui = team === 1 ? D.fortYou : D.fortFoe;
      if (ui && !motionOff()) {
        cls(ui.root, 'hurt', false);
        try { void ui.root.offsetWidth; } catch (e) {}
        cls(ui.root, 'hurt', true);
        setTimeout(function () { cls(ui.root, 'hurt', false); }, 280);
      }
      if (team === 1) haptic('hit');
    });
    on('fort:destroyed', function (p) {
      screenFlash();
      haptic('heavy');
      toast(num(p && p.team, 1) === 1 ? 'Your fort has fallen' : 'Enemy fort destroyed',
        num(p && p.team, 1) === 1 ? 'bad' : 'good');
    });
    on('fort:tier', function (p) {
      if (p && num(p.team, 1) === 1) toast('Fort reinforced — tier ' + num(p.tier, 0), 'good');
    });
    on('fort:heal', function (p) {
      if (p && num(p.team, 1) === 1 && num(p.amount, 0) > 0) toast('Fort repaired +' + fmt(p.amount), 'good');
    });

    /* --- units ------------------------------------------------------------ */
    on('unit:spawn', function () { refreshCards(false); });
    on('sim:queue', function () { refreshCards(false); });
    on('unit:hit', function (p) {
      if (!p || !p.unit) return;
      var s = ST();
      if (!s || !s.settings || s.settings.damageNumbers === false) return;
      var d = num(p.dmg, 0);
      if (d < 1) return;
      if (p.unit.team === 1 && !p.crit && d < 12) return;   // keep the screen readable
      floater(Math.round(d) + (p.crit ? '!' : ''), p.unit.x, num(p.unit.y, 0) + 2.2, p.unit.z,
        p.crit ? 'crit' : 'dmg');
    });
    on('unit:death', function (p) {
      var u = p && p.unit;
      if (!u) return;
      if (u.team === -1) {
        lastKill.x = num(u.x, 0); lastKill.y = num(u.y, 0) + 1.6; lastKill.z = num(u.z, 0);
        lastKill.at = Date.now();
        bumpStreak(view.streak + 1);
      } else {
        if (view.streak >= 3) { show(D.streak, false); }
        view.streak = 0;
      }
      refreshCards(false);
    });
    on('boss:spawn', function (p) {
      var b = p && p.boss;
      banner('BOSS', (b && (b.name || b.def && b.def.name)) || 'Brace yourself', 'boss');
      haptic('heavy');
      screenFlash();
    });
    on('boss:phase', function (p) { toast('Boss phase ' + num(p && p.n, 1), 'boss'); haptic('heavy'); });
    on('power:cast', function (p) {
      screenFlash();
      if (p) floater('POWER', num(p.x, 200), 8, num(p.z, 0), 'heal');
      syncRail();
    });
    on('sim:power', function () { syncRail(); toast('Power ready', 'power'); });
    on('sim:stance', function () { syncRail(); });
    on('sim:formation', function () { syncRail(); });
    on('stance:change', function () { syncRail(); });

    /* --- perks ------------------------------------------------------------ */
    on('perk:offer', function (p) {
      if (!p || !p.choices || !p.choices.length) { if (isPanelOpen('perks')) closePanel('perks'); return; }
      openPanel('perks', p);
    });
    on('perk:taken', function (p) {
      if (p && p.perk) toast((p.perk.name || 'Perk') + ' taken', 'good');
      else if (p && p.id) toast('Perk taken', 'good');
    });

    /* --- game flow -------------------------------------------------------- */
    on('game:over', function (r) {
      closeAllPanels();
      var result = (r === 'victory' || (r && r.result === 'victory')) ? 'victory' : 'defeat';
      if (result === 'victory') { celebrate(80); banner('VICTORY', 'The field is yours'); }
      else { banner('DEFEAT', 'Your fort has fallen'); }
      haptic('win');
      setTimeout(function () { openPanel('result', { result: result }); }, 1500);
    });
    on('game:pause', function (p) {
      cls(D.btnPause, 'on', !!p);
      txt(D.btnPause, p ? '▶' : '❚❚');
      attr(D.btnPause, 'aria-label', p ? 'Resume' : 'Pause');
    });
    on('game:speed', syncSpeed);
    on('game:phase', function (ph) {
      view.phase = ph;
      if (ph === 'prep') txt(D.waveSub, 'prepare');
      else if (ph === 'battle') txt(D.waveSub, 'engaged');
      else if (ph === 'wave-clear') txt(D.waveSub, 'cleared');
    });
    on('game:new', function () {
      view.streak = 0; show(D.streak, false);
      closeAllPanels();
      buildCards(true);
      syncAll();
      if (!prefs.tutorialDone) setTimeout(function () { startTutorial(false); }, 900);
    });
    on('game:reset', function () { view.streak = 0; show(D.streak, false); syncAll(); });
    on('save:load', function () { buildCards(true); syncAll(); });
    on('settings:change', function () { syncSpeed(); });

    /* --- campaign --------------------------------------------------------- */
    on('session:summary', function (s) { if (s) setTimeout(function () { openPanel('summary', s); }, 400); });
    on('campaign:map', function () { if (!panelStack.length) openPanel('campaign'); });
    on('mission:start', function (m) { if (m && m.name) banner(String(m.name).toUpperCase(), m.typeName || 'Mission'); });
    on('mission:objective', function (o) {
      if (o && (o.label || o.text)) toast((o.done ? '✓ ' : '') + (o.label || o.text), o.done ? 'good' : 'info');
    });
    on('campaign:unlock', function (p) { if (p) toast('New mission: ' + (p.name || p.node), 'era'); });
    on('achievement:unlock', function (a) {
      if (!a) return;
      toast('Achievement — ' + (a.name || a.id), 'era');
      celebrate(24);
    });
    on('mission:complete', function () { celebrate(60); });
    on('mission:fail', function () { haptic('heavy'); });

    /* --- generic ---------------------------------------------------------- */
    on('ui:toast', function (p) {
      if (!p) return;
      toast(p.msg !== undefined ? p.msg : String(p), p.kind);
    });
    on('perf:tier', function (t) { if (t === 'low') coach('perf', 'Graphics were lowered to keep the frame rate up.'); });
  }

  function renderComp(comp, boss) {
    if (!D.comp) return;
    clear(D.comp);
    if (!comp) return;
    var order = ['defender', 'assault', 'ranged', 'specialist', 'champion'];
    var i = 0, delay = 0;
    for (i = 0; i < order.length; i++) {
      var k = order[i], n = num(comp[k], 0);
      if (n <= 0) continue;
      var c = el('div', 'cchip', '', D.comp);
      c.style.animationDelay = (delay += 40) + 'ms';
      el('span', '', glyphFor(k), c);
      el('span', 'num', String(n), c);
      attr(c, 'title', n + ' ' + (CLASS_NAME[k] || k));
    }
    if (boss || num(comp.boss, 0) > 0) {
      var b = el('div', 'cchip boss', '', D.comp);
      b.style.animationDelay = (delay + 40) + 'ms';
      el('span', '', CLASS_GLYPH.boss, b);
      el('span', '', 'BOSS', b);
    }
    if (!D.comp.childNodes.length) el('div', 'cchip', '—', D.comp);
  }

  /** Push every current value into the HUD (used on boot, load and reset). */
  function syncAll() {
    var s = ST();
    if (!s) return;
    view.era = num(s.eraIndex, 0);
    applyEraSkin(view.era);
    txt(D.eraName, String(s.era || skinFor(view.era).name).toUpperCase());
    txt(D.eraIdx, (view.era + 1) + '/' + ERA_SKIN.length);
    txt(D.waveName, 'WAVE ' + Math.max(1, num(s.wave, 1)));
    view.goldShown = num(s.gold, 0);
    view.gemsShown = num(s.gems, 0);
    txt(D.gold.val, fmt(view.goldShown));
    txt(D.gems.val, fmt(view.gemsShown));
    show(D.gems.root, true);
    syncSpeed();
    syncRail();
    refreshCards(true);
    cls(D.btnPause, 'on', !!s.paused);
  }

  /* ---------------------------------------------------------------------------
   * 18. Init / dispose
   * ------------------------------------------------------------------------ */
  var _unRender = null, _onKey = null, _onResize = null;

  function init() {
    if (inited) return UI;
    if (!doc || !doc.body) { warn('init:dom', 'no document body — the UI cannot mount.'); UI.failed = true; return UI; }
    try {
      loadPrefs();
      if (prefersReducedMotion()) prefs.reducedMotion = true;

      injectStyle();
      buildRoot();
      buildTop();
      buildForts();
      buildMini();
      buildBottom();
      buildFeedback();
      buildModal();
      applyPrefs();

      inited = true;
      disposed = false;

      buildCards(true);
      wire();
      syncAll();

      _onKey = guard(onKey, 'key');
      doc.addEventListener('keydown', _onKey, false);

      _onResize = guard(function () {
        flushCssVarCache();
        _miniW = 0;
        if (tut.active) {
          var step = TUT_STEPS[tut.i];
          var t = null;
          try { t = step && step.target(); } catch (e) {}
          placeSpotlight(t);
        }
      }, 'resize');
      if (isFn(global.addEventListener)) {
        global.addEventListener('resize', _onResize, false);
        global.addEventListener('orientationchange', _onResize, false);
      }

      var c = Core();
      if (c && isFn(c.registerRender)) _unRender = c.registerRender(function (dtReal) { tick(dtReal); }, 100);
      else warn('init:loop', 'Core.registerRender missing — the HUD will not animate.');

      UI.ready = true;
      UI.root = root;
      emit('ui:ready', UI);

      /* first-run onboarding, once the first frame has settled */
      var s = ST();
      if (!prefs.tutorialDone && !(s && s.settings && s.settings.tutorialDone)) {
        setTimeout(guard(function () { startTutorial(false); }, 'tut:auto'), 1400);
      }
    } catch (e) {
      UI.failed = true;
      warn('init', 'the UI failed to initialise — running headless.', e);
    }
    return UI;
  }

  function dispose() {
    if (!inited || disposed) return;
    disposed = true;
    inited = false;
    try {
      closeAllPanels();
      if (_unRender) { _unRender(); _unRender = null; }
      for (var i = 0; i < _subs.length; i++) { try { _subs[i](); } catch (e) {} }
      _subs.length = 0;
      if (_onKey && doc) doc.removeEventListener('keydown', _onKey, false);
      if (_onResize && isFn(global.removeEventListener)) {
        global.removeEventListener('resize', _onResize, false);
        global.removeEventListener('orientationchange', _onResize, false);
      }
      if (root && root.parentNode) root.parentNode.removeChild(root);
      if (styleTag && styleTag.parentNode) styleTag.parentNode.removeChild(styleTag);
    } catch (e) { warn('dispose', 'dispose hit a problem — continuing.', e); }
    root = null; styleTag = null; D = {}; cards.length = 0;
    UI.ready = false;
    UI.root = null;
  }

  /* ---------------------------------------------------------------------------
   * 19. Public API
   * ------------------------------------------------------------------------ */
  var UI = {
    __isAowUI: true,
    version: '1.0.0',
    ready: false,
    failed: false,
    root: null,

    /* lifecycle */
    init: init,
    dispose: dispose,
    refresh: function () { buildCards(true); syncAll(); },

    /* panels */
    openPanel: openPanel,
    closePanel: closePanel,
    closeAll: closeAllPanels,
    isPanelOpen: isPanelOpen,
    panels: function () { var out = [], k; for (k in PANELS) out.push(k); return out; },

    /* feedback */
    toast: toast,
    floater: floater,
    banner: banner,
    celebrate: celebrate,
    flash: screenFlash,
    streak: bumpStreak,
    coach: coach,
    haptic: haptic,

    /* onboarding */
    startTutorial: startTutorial,
    endTutorial: endTutorial,
    isTutorialActive: function () { return tut.active; },

    /* accessibility + prefs */
    prefs: prefs,
    setScale: function (v) { prefs.scale = clamp(num(v, 1), 0.85, 1.35); applyPrefs(); savePrefs(); return prefs.scale; },
    setColorblind: function (v) { prefs.colorblind = !!v; applyPrefs(); flushCssVarCache(); savePrefs(); return prefs.colorblind; },
    setReducedMotion: function (v) { prefs.reducedMotion = !!v; applyPrefs(); savePrefs(); return prefs.reducedMotion; },
    setHandedness: function (v) { prefs.hand = (v === 'left') ? 'left' : 'right'; applyPrefs(); savePrefs(); return prefs.hand; },
    setMinimap: function (v) { prefs.minimap = !!v; applyPrefs(); savePrefs(); return prefs.minimap; },
    setDevOverlay: function (v) { prefs.devOverlay = !!v; applyPrefs(); savePrefs(); return prefs.devOverlay; },
    savePrefs: savePrefs,

    /* theming */
    setEra: function (i) { applyEraSkin(i); flushCssVarCache(); },
    eraSkins: ERA_SKIN,

    /* escape hatches for the integrator */
    el: el,
    dom: D,
    view: view
  };

  AOW.UI = UI;

  /* ---------------------------------------------------------------------------
   * 20. Auto-boot (idempotent — an explicit AOW.UI.init() still wins)
   * ------------------------------------------------------------------------ */
  try {
    if (!global.AOW_NO_UI_AUTOSTART && doc) {
      if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
        setTimeout(guard(init, 'autoboot'), 0);
      } else if (isFn(doc.addEventListener)) {
        doc.addEventListener('DOMContentLoaded', guard(init, 'autoboot'), false);
      }
    }
  } catch (e) {
    warn('autoboot', 'auto-boot failed — call AOW.UI.init() manually.', e);
  }

})(typeof window !== 'undefined' ? window : this);
