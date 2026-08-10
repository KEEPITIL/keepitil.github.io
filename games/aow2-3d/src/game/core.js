/* =============================================================================
 * AOW2-3D  —  src/game/core.js  —  global: AOW.Core
 * -----------------------------------------------------------------------------
 * The spine. Namespace, event bus, fixed-step loop, RNG, state, save, math.
 * three.js r128 UMD assumed present as global THREE (optional here — guarded).
 * No modules, no imports, no network, no external assets. Plain <script>.
 *
 * Everything in this file is defensive: if a subsystem cannot initialise it
 * warns once and no-ops. Core must never be the reason a frame dies.
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------------------
   * 0. Namespace bootstrap + shared world constants
   * ------------------------------------------------------------------------ */
  var AOW = global.AOW || (global.AOW = {});

  if (AOW.Core && AOW.Core.__isAowCore) {
    // Double-include guard: keep the first one, never stomp live state.
    try { console.warn('[AOW.Core] already initialised — ignoring duplicate script include.'); } catch (e) {}
    return;
  }

  /* World-space constants. Shared by every module. Do not change at runtime. */
  AOW.W          = 420;          // world length in three.js units (metres)
  AOW.LANE_MIN   = -16;          // lane depth min (z)
  AOW.LANE_MAX   = 16;           // lane depth max (z)
  AOW.LANE_SPAN  = 32;           // LANE_MAX - LANE_MIN
  AOW.GROUND_Y   = 0;            // ground plane height
  AOW.FORT_X     = { 1: 20, '-1': 400 };   // fort centres per team
  AOW.SPAWN_X    = { 1: 34, '-1': 386 };   // where units pop out of the fort
  AOW.EDGE_PAD   = 6;            // keep units off the absolute world edge
  AOW.UNIT_H     = 1.8;          // nominal soldier height, metres
  AOW.TEAM_PLAYER = 1;
  AOW.TEAM_ENEMY  = -1;

  AOW.ERAS = ['Stone', 'Bronze', 'Iron', 'Medieval', 'Gunpowder', 'Industrial', 'Modern', 'Future'];

  var SIM_HZ       = 60;
  var FIXED_DT     = 1 / SIM_HZ;
  var MAX_STEPS    = 6;                       // catch-up clamp (per rAF frame)
  var MAX_FRAME_DT = 0.25;                    // never integrate more than 250ms
  var SAVE_NS      = 'aow2_3d_v1';
  var SAVE_KEY     = SAVE_NS;
  var BACKUP_KEY   = SAVE_NS + '_bak';
  var SAVE_VERSION = 1;

  /* ---------------------------------------------------------------------------
   * 1. Tiny internal helpers
   * ------------------------------------------------------------------------ */
  var _warned = Object.create(null);

  /** Warn at most once for a given key. Never throws. */
  function warnOnce(key, msg, err) {
    try {
      if (_warned[key]) return;
      _warned[key] = 1;
      if (err) console.warn('[AOW.Core] ' + msg, err);
      else console.warn('[AOW.Core] ' + msg);
    } catch (e) { /* console itself is gone; nothing we can do */ }
  }

  /** Warn once per function object (used for bad listeners / callbacks). */
  function warnOnceFn(fn, msg, err) {
    var n = 0;
    try { n = (fn.__aowErrN = (fn.__aowErrN || 0) + 1); } catch (e) { n = 1; }
    if (n === 1) {
      try { console.warn('[AOW.Core] ' + msg + ' — listener disabled from further warnings:', err); } catch (e) {}
    }
  }

  function isFn(f) { return typeof f === 'function'; }

  var _now = (function () {
    try {
      if (global.performance && isFn(global.performance.now)) {
        var p = global.performance;
        return function () { return p.now(); };
      }
    } catch (e) {}
    return function () { return Date.now(); };
  })();

  /* ---------------------------------------------------------------------------
   * 2. Event bus
   *    - on() returns an unsubscribe function
   *    - emit() allocates NOTHING in the common path (no array copies, no args
   *      objects, no closures)
   *    - one throwing listener can never kill the frame; it warns once
   *    - listeners added during an emit run on the NEXT emit (snapshot length)
   *    - removals during an emit are tombstoned and compacted when depth hits 0
   * ------------------------------------------------------------------------ */
  var _bus     = Object.create(null);   // name -> channel
  var _anyList = [];                    // wildcard listeners (debug/telemetry)
  var _anyDepth = 0, _anyDirty = false;
  var _emitDepth = 0;
  var MAX_EMIT_DEPTH = 32;

  function channel(name) {
    var c = _bus[name];
    if (!c) { c = _bus[name] = { l: [], depth: 0, dirty: false }; }
    return c;
  }

  function compact(c) {
    var l = c.l, w = 0, i, n = l.length;
    for (i = 0; i < n; i++) { if (l[i]) { l[w++] = l[i]; } }
    l.length = w;
    c.dirty = false;
  }

  /**
   * Subscribe. Returns an unsubscribe function (idempotent).
   * @param {string} name
   * @param {function(payload, name)} fn
   */
  function on(name, fn) {
    if (typeof name !== 'string' || !isFn(fn)) {
      warnOnce('on:bad', 'on() requires (string, function) — ignored: ' + name);
      return noop;
    }
    if (name === '*') {
      _anyList.push(fn);
      return function offAny() {
        var i = _anyList.indexOf(fn);
        if (i >= 0) { if (_anyDepth > 0) { _anyList[i] = null; _anyDirty = true; } else { _anyList.splice(i, 1); } }
      };
    }
    var c = channel(name);
    c.l.push(fn);
    var live = true;
    return function unsubscribe() {
      if (!live) return;
      live = false;
      offRaw(c, fn);
    };
  }

  function offRaw(c, fn) {
    var l = c.l, i;
    for (i = 0; i < l.length; i++) {
      if (l[i] === fn) {
        if (c.depth > 0) { l[i] = null; c.dirty = true; }
        else { l.splice(i, 1); }
        return true;
      }
    }
    return false;
  }

  /** Unsubscribe by (name, fn). */
  function off(name, fn) {
    if (name === '*') {
      var i = _anyList.indexOf(fn);
      if (i >= 0) { if (_anyDepth > 0) { _anyList[i] = null; _anyDirty = true; } else { _anyList.splice(i, 1); } }
      return true;
    }
    var c = _bus[name];
    if (!c) return false;
    return offRaw(c, fn);
  }

  /** Subscribe for exactly one emit. Returns an unsubscribe function. */
  function once(name, fn) {
    if (!isFn(fn)) { warnOnce('once:bad', 'once() requires a function — ignored: ' + name); return noop; }
    var un = null;
    function wrapper(payload, evName) {
      if (un) { un(); un = null; }
      fn(payload, evName);
    }
    un = on(name, wrapper);
    return function () { if (un) { un(); un = null; } };
  }

  /** Remove every listener for a name (or all names when omitted). */
  function clearListeners(name) {
    if (name === undefined) {
      for (var k in _bus) { delete _bus[k]; }
      _anyList.length = 0;
      return;
    }
    var c = _bus[name];
    if (!c) return;
    if (c.depth > 0) { for (var i = 0; i < c.l.length; i++) c.l[i] = null; c.dirty = true; }
    else c.l.length = 0;
  }

  /**
   * Fire an event. Allocation-free. Never throws.
   * @param {string} name
   * @param {*} payload
   */
  function emit(name, payload) {
    if (_emitDepth >= MAX_EMIT_DEPTH) {
      warnOnce('emit:depth', 'emit recursion depth exceeded at "' + name + '" — event dropped (check for a listener that re-emits itself).');
      return;
    }
    _emitDepth++;

    var c = _bus[name];
    if (c !== undefined) {
      c.depth++;
      var l = c.l, n = l.length, i, fn;
      for (i = 0; i < n; i++) {
        fn = l[i];
        if (fn === null) continue;
        try { fn(payload, name); }
        catch (err) { warnOnceFn(fn, 'listener for "' + name + '" threw', err); }
      }
      c.depth--;
      if (c.depth === 0 && c.dirty) compact(c);
    }

    if (_anyList.length > 0) {
      _anyDepth++;
      var al = _anyList, an = al.length, j, af;
      for (j = 0; j < an; j++) {
        af = al[j];
        if (af === null) continue;
        try { af(payload, name); }
        catch (err2) { warnOnceFn(af, 'wildcard listener threw on "' + name + '"', err2); }
      }
      _anyDepth--;
      if (_anyDepth === 0 && _anyDirty) {
        var w = 0;
        for (j = 0; j < al.length; j++) { if (al[j]) al[w++] = al[j]; }
        al.length = w;
        _anyDirty = false;
      }
    }

    _emitDepth--;
  }

  function noop() {}

  /* ---------------------------------------------------------------------------
   * 3. Math utilities (all branch-light, all allocation-free)
   * ------------------------------------------------------------------------ */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function invLerp(a, b, v) { return b === a ? 0 : (v - a) / (b - a); }
  function mapRange(v, a, b, c, d) { return b === a ? c : c + (d - c) * ((v - a) / (b - a)); }

  /** Frame-rate independent lerp. lambda ≈ "how fast", dt in seconds. */
  function damp(a, b, lambda, dt) { return b + (a - b) * Math.exp(-lambda * dt); }

  /** Move a toward b by at most step. */
  function approach(a, b, step) {
    if (a < b) { a += step; return a > b ? b : a; }
    if (a > b) { a -= step; return a < b ? b : a; }
    return b;
  }

  function smoothstep(e0, e1, x) {
    var t = e1 === e0 ? 0 : clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  }
  function smootherstep(e0, e1, x) {
    var t = e1 === e0 ? 0 : clamp01((x - e0) / (e1 - e0));
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function easeInCubic(t)  { t = clamp01(t); return t * t * t; }
  function easeOutCubic(t) { t = clamp01(t); var u = 1 - t; return 1 - u * u * u; }
  function easeInOutCubic(t) {
    t = clamp01(t);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function easeInQuad(t)  { t = clamp01(t); return t * t; }
  function easeOutQuad(t) { t = clamp01(t); return 1 - (1 - t) * (1 - t); }

  var _BACK_C1 = 1.70158, _BACK_C3 = _BACK_C1 + 1;
  function easeOutBack(t) {
    t = clamp01(t);
    var u = t - 1;
    return 1 + _BACK_C3 * u * u * u + _BACK_C1 * u * u;
  }
  function easeInBack(t) { t = clamp01(t); return _BACK_C3 * t * t * t - _BACK_C1 * t * t; }

  var _ELASTIC_C4 = (2 * Math.PI) / 3;
  function easeOutElastic(t) {
    t = clamp01(t);
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * _ELASTIC_C4) + 1;
  }

  function easeOutBounce(t) {
    t = clamp01(t);
    var n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + 0.75; }
    if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + 0.9375; }
    t -= 2.625 / d1; return n1 * t * t + 0.984375;
  }

  /** Shortest-path angular lerp, radians. */
  function lerpAngle(a, b, t) {
    var d = (b - a) % 6.283185307179586;
    if (d > 3.141592653589793) d -= 6.283185307179586;
    else if (d < -3.141592653589793) d += 6.283185307179586;
    return a + d * t;
  }
  function angleDelta(a, b) {
    var d = (b - a) % 6.283185307179586;
    if (d > 3.141592653589793) d -= 6.283185307179586;
    else if (d < -3.141592653589793) d += 6.283185307179586;
    return d;
  }

  function dist2(ax, az, bx, bz) { var dx = bx - ax, dz = bz - az; return dx * dx + dz * dz; }
  function dist(ax, az, bx, bz)  { return Math.sqrt(dist2(ax, az, bx, bz)); }
  function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }

  /* ---------------------------------------------------------------------------
   * 4. Deterministic RNG — mulberry32
   *    Two independent streams:
   *      sim   : anything that affects gameplay. Saved/restored, deterministic.
   *      visual: VFX only. Free-running, never desyncs the sim.
   * ------------------------------------------------------------------------ */
  function hashSeed(v) {
    if (typeof v === 'number' && isFinite(v)) return (v >>> 0);
    var s = String(v === undefined || v === null ? '' : v), h = 2166136261 >>> 0, i;
    for (i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  var _simSeed = 0x9e3779b9 >>> 0;
  var _simS    = _simSeed;
  var _visS    = (Date.now() ^ 0x5bf03635) >>> 0;

  function rng() {
    _simS = (_simS + 0x6D2B79F5) >>> 0;
    var t = _simS;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function vrng() {
    _visS = (_visS + 0x6D2B79F5) >>> 0;
    var t = _visS;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function rngRange(a, b)  { return a + (b - a) * rng(); }
  function rngInt(n)       { return (rng() * n) | 0; }              // [0, n)
  function rngIntR(a, b)   { return a + ((rng() * (b - a + 1)) | 0); } // [a, b] inclusive
  function rngPick(arr)    { return (arr && arr.length) ? arr[(rng() * arr.length) | 0] : undefined; }
  function rngChance(p)    { return rng() < p; }
  function rngSign()       { return rng() < 0.5 ? -1 : 1; }
  /** Approx normal(0,1) via sum of 3 uniforms — cheap, allocation-free. */
  function rngGauss()      { return ((rng() + rng() + rng()) - 1.5) * 1.1547005383792515 * 2; }

  function vrngRange(a, b) { return a + (b - a) * vrng(); }
  function vrngInt(n)      { return (vrng() * n) | 0; }
  function vrngIntR(a, b)  { return a + ((vrng() * (b - a + 1)) | 0); }
  function vrngPick(arr)   { return (arr && arr.length) ? arr[(vrng() * arr.length) | 0] : undefined; }
  function vrngChance(p)   { return vrng() < p; }
  function vrngSign()      { return vrng() < 0.5 ? -1 : 1; }
  function vrngGauss()     { return ((vrng() + vrng() + vrng()) - 1.5) * 1.1547005383792515 * 2; }

  /** Reseed the SIM stream (deterministic runs). */
  function setSeed(seed) {
    _simSeed = hashSeed(seed);
    _simS = _simSeed;
    return _simSeed;
  }
  function getSeed()      { return _simSeed; }
  function getRngState()  { return _simS >>> 0; }
  function setRngState(s) { _simS = (hashSeed(s)) >>> 0; }
  function setVisualSeed(seed) { _visS = hashSeed(seed); }

  /** Independent named stream — for systems that must not perturb the main one. */
  function makeRng(seed) {
    var s = hashSeed(seed);
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Deterministic value noise (1D + 2D), handy for terrain/wind/idle jitter. */
  function hash2i(x, y) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function noise1(x) {
    var i = Math.floor(x), f = x - i;
    var u = f * f * (3 - 2 * f);
    return lerp(hash2i(i, 0), hash2i(i + 1, 0), u) * 2 - 1;
  }
  function noise2(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    var a = hash2i(ix, iy),     b = hash2i(ix + 1, iy);
    var c = hash2i(ix, iy + 1), d = hash2i(ix + 1, iy + 1);
    return (lerp(lerp(a, b, ux), lerp(c, d, ux), uy)) * 2 - 1;
  }
  function fbm2(x, y, oct) {
    oct = oct || 4;
    var amp = 0.5, sum = 0, norm = 0, i;
    for (i = 0; i < oct; i++) {
      sum += noise2(x, y) * amp;
      norm += amp;
      x *= 2.02; y *= 2.02; amp *= 0.5;
    }
    return norm > 0 ? sum / norm : 0;
  }

  /* ---------------------------------------------------------------------------
   * 5. Game state
   * ------------------------------------------------------------------------ */
  function defaultSettings() {
    return {
      sfx: true,
      music: true,
      volume: 0.8,
      musicVolume: 0.5,
      quality: 'auto',        // 'auto' | 'high' | 'med' | 'low'
      shadows: true,
      bloom: true,
      blood: true,
      shake: 1,               // 0..1.5 multiplier
      damageNumbers: true,
      showFps: false,
      haptics: true,
      autoSpawn: false,
      tutorialDone: false
    };
  }

  function defaultStats() {
    return {
      kills: 0, losses: 0,
      dmgDealt: 0, dmgTaken: 0,
      goldEarned: 0, goldSpent: 0,
      gemsEarned: 0,
      wavesCleared: 0, bestWave: 0,
      bossesKilled: 0,
      runs: 0, wins: 0,
      playtime: 0             // seconds of un-paused sim time, all-time
    };
  }

  var state = {
    /* run state */
    era: AOW.ERAS[0],
    eraIndex: 0,
    wave: 0,
    gold: 0,
    gems: 0,
    phase: 'menu',            // 'menu'|'prep'|'battle'|'wave-clear'|'shop'|'victory'|'defeat'
    over: false,
    result: null,             // 'victory'|'defeat'|null
    time: 0,                  // sim seconds since run start
    paused: false,
    speed: 1,                 // 1 | 2 | 3
    stance: 'attack',         // 'attack'|'defend'|'hold'|'retreat'

    /* live collections — render modules hold these REFERENCES.
       Always mutate in place (length = 0), never reassign. */
    units: [],
    projectiles: [],
    fx: [],

    forts: {
      1:    { hp: 1000, max: 1000, tier: 0 },
      '-1': { hp: 1000, max: 1000, tier: 0 }
    },

    /* persistent-ish */
    settings: defaultSettings(),
    stats: defaultStats(),
    upgrades: {},             // Economy owns contents
    unlocks: {},              // Campaign/Economy own contents
    perks: {},
    persist: {},              // free-form bucket, saved verbatim
    seed: _simSeed
  };

  AOW.state = state;          // convenience alias; AOW.Core.state is canonical

  var _nextId = 1;
  function nextId() { return _nextId++; }

  /* ---------------------------------------------------------------------------
   * 6. Performance monitor + adaptive quality tier
   * ------------------------------------------------------------------------ */
  var perf = {
    ms: 16.7,          // last frame time, ms
    emaMs: 16.7,       // smoothed frame time, ms
    fps: 60,
    tier: 'high',      // 'high' | 'med' | 'low'
    scale: 1.0,        // cost multiplier other modules should apply
    locked: false,     // true when settings.quality !== 'auto'
    longFrames: 0,     // frames > 50ms since start
    frames: 0,
    simSteps: 0,       // sim steps run last frame
    droppedSteps: 0    // sim steps discarded by the catch-up clamp (total)
  };

  var TIER_SCALE = { high: 1.0, med: 0.6, low: 0.32 };
  var _tierHoldUntil = 0;      // real seconds; hysteresis dwell
  var _tierWarmup = 0;         // frames before adaption kicks in

  function applyTier(t) {
    if (perf.tier === t) return;
    perf.tier = t;
    perf.scale = TIER_SCALE[t] || 1;
    emit('perf:tier', t);
  }

  function setQualityMode(mode) {
    if (mode !== 'auto' && mode !== 'high' && mode !== 'med' && mode !== 'low') mode = 'auto';
    state.settings.quality = mode;
    perf.locked = (mode !== 'auto');
    if (perf.locked) applyTier(mode);
    else _tierHoldUntil = 0;
    emit('settings:change', state.settings);
  }

  function updatePerf(frameMs, realSec) {
    perf.ms = frameMs;
    perf.frames++;
    /* EMA — fast enough to react in ~1s, slow enough not to flap. */
    perf.emaMs += (frameMs - perf.emaMs) * 0.06;
    perf.fps = perf.emaMs > 0.0001 ? (1000 / perf.emaMs) : 0;
    if (frameMs > 50) perf.longFrames++;

    if (perf.locked) return;
    if (_tierWarmup < 45) { _tierWarmup++; return; }   // ignore first ~0.75s (shader compiles)
    if (realSec < _tierHoldUntil) return;

    var e = perf.emaMs, t = perf.tier, next = t;

    /* Downgrade quickly, upgrade reluctantly (hysteresis band). */
    if (t === 'high') {
      if (e > 23.5) next = 'med';
    } else if (t === 'med') {
      if (e > 32) next = 'low';
      else if (e < 17.5) next = 'high';
    } else { /* low */
      if (e < 24) next = 'med';
    }

    if (next !== t) {
      applyTier(next);
      _tierHoldUntil = realSec + (next === 'high' ? 4.0 : 2.0);  // don't bounce
    }
  }

  /* ---------------------------------------------------------------------------
   * 7. Fixed-step loop
   * ------------------------------------------------------------------------ */
  var _simFns    = [];
  var _renderFns = [];
  var _simDirty = false, _renderDirty = false, _inSim = false, _inRender = false;

  function registerSim(fn, order) {
    if (!isFn(fn)) { warnOnce('regsim', 'registerSim() needs a function — ignored.'); return noop; }
    fn.__aowOrder = (typeof order === 'number') ? order : 0;
    _simFns.push(fn);
    _simFns.sort(byOrder);
    var live = true;
    return function () {
      if (!live) return;
      live = false;
      var i = _simFns.indexOf(fn);
      if (i >= 0) { if (_inSim) { _simFns[i] = null; _simDirty = true; } else _simFns.splice(i, 1); }
    };
  }

  function registerRender(fn, order) {
    if (!isFn(fn)) { warnOnce('regrender', 'registerRender() needs a function — ignored.'); return noop; }
    fn.__aowOrder = (typeof order === 'number') ? order : 0;
    _renderFns.push(fn);
    _renderFns.sort(byOrder);
    var live = true;
    return function () {
      if (!live) return;
      live = false;
      var i = _renderFns.indexOf(fn);
      if (i >= 0) { if (_inRender) { _renderFns[i] = null; _renderDirty = true; } else _renderFns.splice(i, 1); }
    };
  }

  function byOrder(a, b) {
    var ao = a ? (a.__aowOrder || 0) : 0, bo = b ? (b.__aowOrder || 0) : 0;
    return ao - bo;
  }

  function compactList(list) {
    var w = 0, i;
    for (i = 0; i < list.length; i++) { if (list[i]) list[w++] = list[i]; }
    list.length = w;
  }

  /* --- sim-time timers (deterministic, pause- and speed-aware) ------------- */
  var _timers = [];
  var _timerDirty = false;

  /** Run fn once after `sec` sim-seconds. Returns cancel(). */
  function after(sec, fn) {
    if (!isFn(fn)) return noop;
    var t = { t: (sec > 0 ? sec : 0), every: 0, fn: fn, dead: false };
    _timers.push(t);
    return function () { t.dead = true; _timerDirty = true; };
  }
  /** Run fn every `sec` sim-seconds. Returns cancel(). */
  function every(sec, fn) {
    if (!isFn(fn) || !(sec > 0)) return noop;
    var t = { t: sec, every: sec, fn: fn, dead: false };
    _timers.push(t);
    return function () { t.dead = true; _timerDirty = true; };
  }
  function clearTimers() { _timers.length = 0; _timerDirty = false; }

  function stepTimers(dt) {
    var n = _timers.length, i, t;
    if (n === 0) return;
    for (i = 0; i < n; i++) {
      t = _timers[i];
      if (!t || t.dead) continue;
      t.t -= dt;
      if (t.t <= 0) {
        if (t.every > 0) { t.t += t.every; if (t.t <= 0) t.t = t.every; }
        else { t.dead = true; _timerDirty = true; }
        try { t.fn(); }
        catch (err) { warnOnceFn(t.fn, 'timer callback threw', err); t.dead = true; _timerDirty = true; }
      }
    }
    if (_timerDirty) {
      var w = 0;
      for (i = 0; i < _timers.length; i++) { if (_timers[i] && !_timers[i].dead) _timers[w++] = _timers[i]; }
      _timers.length = w;
      _timerDirty = false;
    }
  }

  /* --- loop driver --------------------------------------------------------- */
  var _running    = false;
  var _rafId      = 0;
  var _lastMs     = 0;
  var _accum      = 0;
  var _realTime   = 0;    // real seconds since start (unpaused or not)
  var _alpha      = 0;    // 0..1 interpolation factor between sim steps
  var _frame      = 0;
  var _pendingSave = false;
  var _lastSaveMs = 0;

  var _raf = (function () {
    try {
      if (isFn(global.requestAnimationFrame)) return global.requestAnimationFrame.bind(global);
    } catch (e) {}
    return function (cb) { return global.setTimeout(function () { cb(_now()); }, 16); };
  })();
  var _caf = (function () {
    try {
      if (isFn(global.cancelAnimationFrame)) return global.cancelAnimationFrame.bind(global);
    } catch (e) {}
    return function (id) { global.clearTimeout(id); };
  })();

  function start() {
    if (_running) return Core;
    _running = true;
    _lastMs = _now();
    _accum = 0;
    _rafId = _raf(tick);
    emit('loop:start', null);
    return Core;
  }

  function stop() {
    if (!_running) return Core;
    _running = false;
    try { _caf(_rafId); } catch (e) {}
    _rafId = 0;
    emit('loop:stop', null);
    return Core;
  }

  function tick(nowMs) {
    if (!_running) return;
    _rafId = _raf(tick);

    var t = (typeof nowMs === 'number') ? nowMs : _now();
    var frameMs = t - _lastMs;
    _lastMs = t;

    /* Tab was backgrounded / debugger paused / massive hitch: don't spiral. */
    if (!(frameMs >= 0) || frameMs > 1000) frameMs = 16.7;

    var dtReal = frameMs / 1000;
    if (dtReal > MAX_FRAME_DT) dtReal = MAX_FRAME_DT;
    _realTime += dtReal;
    _frame++;
    Core.frame = _frame;
    Core.realTime = _realTime;
    Core.dtReal = dtReal;

    updatePerf(frameMs, _realTime);

    /* ---- fixed-step simulation ---- */
    var steps = 0;
    if (!state.paused && !state.over) {
      var spd = state.speed;
      if (!(spd >= 1)) spd = 1;
      if (spd > 3) spd = 3;
      _accum += dtReal * spd;

      var maxAccum = MAX_STEPS * FIXED_DT;
      if (_accum > maxAccum) {
        perf.droppedSteps += Math.floor((_accum - maxAccum) / FIXED_DT);
        _accum = maxAccum;   // catch-up clamp — drop time rather than death-spiral
      }

      _inSim = true;
      while (_accum >= FIXED_DT && steps < MAX_STEPS) {
        _accum -= FIXED_DT;
        steps++;

        state.time += FIXED_DT;
        state.stats.playtime += FIXED_DT;
        Core.time = state.time;

        stepTimers(FIXED_DT);

        var fns = _simFns, n = fns.length, i, f;
        for (i = 0; i < n; i++) {
          f = fns[i];
          if (f === null) continue;
          try { f(FIXED_DT, state); }
          catch (err) { warnOnceFn(f, 'sim callback threw', err); }
        }
      }
      _inSim = false;
      if (_simDirty) { compactList(_simFns); _simDirty = false; }
    } else {
      _accum = 0;
    }

    perf.simSteps = steps;
    _alpha = FIXED_DT > 0 ? clamp01(_accum / FIXED_DT) : 0;
    Core.alpha = _alpha;

    /* ---- render (always runs, even paused, so menus/camera stay alive) ---- */
    _inRender = true;
    var rf = _renderFns, rn = rf.length, ri, g;
    for (ri = 0; ri < rn; ri++) {
      g = rf[ri];
      if (g === null) continue;
      try { g(dtReal, _alpha, state); }
      catch (err2) { warnOnceFn(g, 'render callback threw', err2); }
    }
    _inRender = false;
    if (_renderDirty) { compactList(_renderFns); _renderDirty = false; }

    /* ---- deferred autosave (never inside the sim/render hot path) ---- */
    if (_pendingSave) {
      _pendingSave = false;
      if (t - _lastSaveMs > 900) { _lastSaveMs = t; save(); }
    }
  }

  function setPaused(p) {
    p = !!p;
    if (state.paused === p) return;
    state.paused = p;
    _accum = 0;
    _lastMs = _now();
    emit('game:pause', p);
  }
  function togglePause() { setPaused(!state.paused); return state.paused; }

  function setSpeed(s) {
    s = s | 0;
    if (s < 1) s = 1;
    if (s > 3) s = 3;
    if (state.speed === s) return s;
    state.speed = s;
    emit('game:speed', s);
    return s;
  }
  function cycleSpeed() { return setSpeed(state.speed >= 3 ? 1 : state.speed + 1); }

  /* ---------------------------------------------------------------------------
   * 8. Save / load  (schema-versioned, migrating, corruption-tolerant)
   * ------------------------------------------------------------------------ */
  var _memStore = Object.create(null);   // fallback when localStorage is blocked
  var _lsOk = (function () {
    try {
      var ls = global.localStorage;
      if (!ls) return false;
      var probe = SAVE_NS + '_probe';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return true;
    } catch (e) {
      warnOnce('ls', 'localStorage unavailable — saves are in-memory only for this session.');
      return false;
    }
  })();

  function lsGet(k) {
    try { return _lsOk ? global.localStorage.getItem(k) : (_memStore[k] !== undefined ? _memStore[k] : null); }
    catch (e) { return _memStore[k] !== undefined ? _memStore[k] : null; }
  }
  function lsSet(k, v) {
    _memStore[k] = v;
    if (!_lsOk) return false;
    try { global.localStorage.setItem(k, v); return true; }
    catch (e) { warnOnce('ls:set', 'localStorage write failed (quota or private mode) — keeping save in memory.', e); return false; }
  }
  function lsDel(k) {
    delete _memStore[k];
    if (!_lsOk) return;
    try { global.localStorage.removeItem(k); } catch (e) {}
  }

  /* Module-supplied save slices: Core.registerSave('economy', get, set) */
  var _saveSlices = [];
  function registerSave(key, getFn, setFn) {
    if (typeof key !== 'string' || !isFn(getFn) || !isFn(setFn)) {
      warnOnce('regsave', 'registerSave(key, getFn, setFn) — bad arguments, ignored: ' + key);
      return noop;
    }
    var slice = { key: key, get: getFn, set: setFn };
    _saveSlices.push(slice);
    return function () {
      var i = _saveSlices.indexOf(slice);
      if (i >= 0) _saveSlices.splice(i, 1);
    };
  }

  /* Migration hooks: Core.registerMigration(fromVersion, fn(data) -> data) */
  var _migrations = Object.create(null);
  function registerMigration(fromVersion, fn) {
    if (typeof fromVersion !== 'number' || !isFn(fn)) {
      warnOnce('regmig', 'registerMigration(number, fn) — bad arguments, ignored.');
      return;
    }
    _migrations[fromVersion] = fn;
  }

  function migrate(data) {
    var guard = 0;
    while (data && typeof data.v === 'number' && data.v < SAVE_VERSION && guard++ < 64) {
      var from = data.v, fn = _migrations[from];
      if (isFn(fn)) {
        try {
          var out = fn(data);
          if (out && typeof out === 'object') data = out;
        } catch (e) {
          warnOnce('mig:' + from, 'migration from save v' + from + ' threw — data left as-is.', e);
        }
      }
      if (data.v === from) data.v = from + 1;   // always make progress
    }
    return data;
  }

  function buildSaveObject() {
    var mods = {};
    for (var i = 0; i < _saveSlices.length; i++) {
      var s = _saveSlices[i];
      try {
        var d = s.get();
        if (d !== undefined) mods[s.key] = d;
      } catch (e) {
        warnOnce('save:slice:' + s.key, 'save slice "' + s.key + '" threw — skipped.', e);
      }
    }
    return {
      v: SAVE_VERSION,
      t: Date.now(),
      s: {
        era: state.era,
        eraIndex: state.eraIndex,
        wave: state.wave,
        gold: state.gold,
        gems: state.gems,
        phase: state.phase,
        stance: state.stance,
        speed: state.speed,
        seed: _simSeed,
        rngState: _simS,
        time: state.time,
        forts: {
          '1':  { hp: state.forts[1].hp,     max: state.forts[1].max,     tier: state.forts[1].tier },
          '-1': { hp: state.forts[-1].hp,    max: state.forts[-1].max,    tier: state.forts[-1].tier }
        },
        settings: state.settings,
        stats: state.stats,
        upgrades: state.upgrades,
        unlocks: state.unlocks,
        perks: state.perks,
        persist: state.persist
      },
      mods: mods
    };
  }

  /** Write the save. Returns true on success. Never throws. */
  function save() {
    var json;
    try { json = JSON.stringify(buildSaveObject()); }
    catch (e) { warnOnce('save:str', 'could not serialise save (circular reference in a save slice?) — save skipped.', e); return false; }

    /* Rotate the current save into the backup slot first, but only if it is
       itself parseable — never overwrite a good backup with garbage. */
    try {
      var cur = lsGet(SAVE_KEY);
      if (cur) { JSON.parse(cur); lsSet(BACKUP_KEY, cur); }
    } catch (e2) { /* current save was already corrupt: leave backup alone */ }

    var ok = lsSet(SAVE_KEY, json);
    emit('save:write', ok);
    return ok;
  }

  function requestSave() { _pendingSave = true; }

  function readSlot(key) {
    var raw = lsGet(key);
    if (!raw) return null;
    var data;
    try { data = JSON.parse(raw); }
    catch (e) { return null; }
    if (!data || typeof data !== 'object' || typeof data.v !== 'number' || !data.s) return null;
    return data;
  }

  /**
   * Load and apply the save. Falls back to the backup slot on corruption.
   * Returns the applied save object, or null when there was nothing usable.
   */
  function load() {
    var data = null, usedBackup = false;
    try { data = readSlot(SAVE_KEY); } catch (e) { data = null; }
    if (!data) {
      try { data = readSlot(BACKUP_KEY); } catch (e2) { data = null; }
      if (data) {
        usedBackup = true;
        warnOnce('load:bak', 'primary save was missing or corrupt — restored from backup slot.');
      }
    }
    if (!data) { emit('save:load', null); return null; }

    try { data = migrate(data); }
    catch (e3) { warnOnce('load:mig', 'migration pass failed — loading raw data.', e3); }

    try { applySave(data); }
    catch (e4) {
      warnOnce('load:apply', 'save could not be applied — falling back to a fresh state.', e4);
      resetRun(true);
      emit('save:load', null);
      return null;
    }

    emit('save:load', data);
    if (usedBackup) emit('ui:toast', { msg: 'Save recovered from backup', kind: 'warn' });
    return data;
  }

  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function str(v, d) { return (typeof v === 'string') ? v : d; }
  function obj(v)    { return (v && typeof v === 'object' && !(v instanceof Array)) ? v : null; }

  function applySave(data) {
    var s = obj(data.s);
    if (!s) return;

    state.eraIndex = clamp(num(s.eraIndex, 0) | 0, 0, AOW.ERAS.length - 1);
    state.era      = str(s.era, AOW.ERAS[state.eraIndex]) || AOW.ERAS[state.eraIndex];
    state.wave     = Math.max(0, num(s.wave, 0) | 0);
    state.gold     = Math.max(0, num(s.gold, 0));
    state.gems     = Math.max(0, num(s.gems, 0));
    state.phase    = str(s.phase, 'menu');
    state.stance   = str(s.stance, 'attack');
    state.speed    = clamp(num(s.speed, 1) | 0, 1, 3);
    state.time     = Math.max(0, num(s.time, 0));

    if (num(s.seed, null) !== null) { _simSeed = hashSeed(s.seed); state.seed = _simSeed; }
    if (num(s.rngState, null) !== null) { _simS = hashSeed(s.rngState); }

    var f = obj(s.forts);
    if (f) {
      applyFort(state.forts[1],  obj(f['1']));
      applyFort(state.forts[-1], obj(f['-1']));
    }

    mergeInto(state.settings, obj(s.settings), defaultSettings());
    mergeInto(state.stats,    obj(s.stats),    defaultStats());

    replaceContents(state.upgrades, obj(s.upgrades));
    replaceContents(state.unlocks,  obj(s.unlocks));
    replaceContents(state.perks,    obj(s.perks));
    replaceContents(state.persist,  obj(s.persist));

    setQualityMode(state.settings.quality);

    var mods = obj(data.mods) || {};
    for (var i = 0; i < _saveSlices.length; i++) {
      var sl = _saveSlices[i];
      if (!(sl.key in mods)) continue;
      try { sl.set(mods[sl.key]); }
      catch (e) { warnOnce('load:slice:' + sl.key, 'load slice "' + sl.key + '" threw — that module keeps its defaults.', e); }
    }
  }

  function applyFort(dst, src) {
    if (!dst || !src) return;
    dst.max  = Math.max(1, num(src.max, dst.max));
    dst.hp   = clamp(num(src.hp, dst.max), 0, dst.max);
    dst.tier = Math.max(0, num(src.tier, 0) | 0);
  }

  /** Copy known keys from src onto dst, keeping dst's type for each key. */
  function mergeInto(dst, src, defaults) {
    if (!dst) return;
    var k;
    if (defaults) { for (k in defaults) { if (!(k in dst)) dst[k] = defaults[k]; } }
    if (!src) return;
    for (k in dst) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var v = src[k], t = typeof dst[k];
      if (typeof v === t && v !== null) dst[k] = v;
    }
  }

  /** Wipe and refill an object in place (keeps the reference other modules hold). */
  function replaceContents(dst, src) {
    if (!dst) return;
    var k;
    for (k in dst) { if (Object.prototype.hasOwnProperty.call(dst, k)) delete dst[k]; }
    if (!src) return;
    for (k in src) { if (Object.prototype.hasOwnProperty.call(src, k)) dst[k] = src[k]; }
  }

  function hasSave() { return !!readSlot(SAVE_KEY) || !!readSlot(BACKUP_KEY); }

  function clearSave() {
    lsDel(SAVE_KEY);
    lsDel(BACKUP_KEY);
    emit('save:clear', null);
  }

  /* Autosave triggers required by the contract. */
  on('wave:clear', requestSave);
  on('era:evolve', requestSave);
  on('game:over',  requestSave);

  /* ---------------------------------------------------------------------------
   * 9. Run lifecycle
   * ------------------------------------------------------------------------ */
  /**
   * Reset the live run. Collections are emptied IN PLACE so render modules
   * holding references stay valid.
   * @param {boolean} hard  also reset era/wave/gold and reseed
   */
  function resetRun(hard) {
    state.units.length = 0;
    state.projectiles.length = 0;
    state.fx.length = 0;
    clearTimers();

    state.time = 0;
    state.over = false;
    state.result = null;
    state.paused = false;
    _accum = 0;
    _lastMs = _now();

    state.forts[1].hp  = state.forts[1].max;
    state.forts[-1].hp = state.forts[-1].max;

    if (hard) {
      state.era = AOW.ERAS[0];
      state.eraIndex = 0;
      state.wave = 0;
      state.gold = 0;
      state.phase = 'menu';
      state.stance = 'attack';
      state.forts[1].tier = 0;
      state.forts[-1].tier = 0;
      _simS = _simSeed;
      _nextId = 1;
    }

    emit('game:reset', !!hard);
  }

  /** Start a fresh run with an optional explicit seed (for daily/seeded runs). */
  function newRun(seed) {
    if (seed !== undefined && seed !== null) { setSeed(seed); state.seed = _simSeed; }
    else { _simS = _simSeed; }
    resetRun(true);
    state.stats.runs++;
    state.phase = 'prep';
    emit('game:new', state.seed);
  }

  /* Gold / gems helpers — single source of truth so `gold:change` is never missed. */
  function addGold(delta, reason) {
    delta = num(delta, 0);
    if (delta === 0) return state.gold;
    state.gold += delta;
    if (state.gold < 0) state.gold = 0;
    if (delta > 0) state.stats.goldEarned += delta; else state.stats.goldSpent -= delta;
    _goldEvt.gold = state.gold; _goldEvt.delta = delta; _goldEvt.reason = reason || null;
    emit('gold:change', _goldEvt);
    return state.gold;
  }
  var _goldEvt = { gold: 0, delta: 0, reason: null };   // reused: no per-call allocation

  function spendGold(cost, reason) {
    cost = num(cost, 0);
    if (cost <= 0) return true;
    if (state.gold < cost) return false;
    addGold(-cost, reason || 'spend');
    return true;
  }

  function addGems(delta, reason) {
    delta = num(delta, 0);
    if (delta === 0) return state.gems;
    state.gems += delta;
    if (state.gems < 0) state.gems = 0;
    if (delta > 0) state.stats.gemsEarned += delta;
    _gemEvt.gems = state.gems; _gemEvt.delta = delta; _gemEvt.reason = reason || null;
    emit('gems:change', _gemEvt);
    return state.gems;
  }
  var _gemEvt = { gems: 0, delta: 0, reason: null };

  function setEra(index) {
    index = clamp(index | 0, 0, AOW.ERAS.length - 1);
    if (index === state.eraIndex) return state.eraIndex;
    state.eraIndex = index;
    state.era = AOW.ERAS[index];
    _eraEvt.era = state.era; _eraEvt.index = index;
    emit('era:evolve', _eraEvt);
    return index;
  }
  var _eraEvt = { era: '', index: 0 };

  function setPhase(p) {
    if (typeof p !== 'string' || state.phase === p) return state.phase;
    state.phase = p;
    emit('game:phase', p);
    return p;
  }

  function setStance(s) {
    if (typeof s !== 'string' || state.stance === s) return state.stance;
    state.stance = s;
    emit('stance:change', s);
    return s;
  }

  function gameOver(result) {
    if (state.over) return;
    state.over = true;
    state.result = (result === 'victory') ? 'victory' : 'defeat';
    state.phase = state.result;
    if (state.result === 'victory') state.stats.wins++;
    if (state.wave > state.stats.bestWave) state.stats.bestWave = state.wave;
    emit('game:over', state.result);
  }

  /* ---------------------------------------------------------------------------
   * 10. Object pool helper (so other modules can stay allocation-free)
   * ------------------------------------------------------------------------ */
  function pool(factory, reset, prealloc) {
    if (!isFn(factory)) {
      warnOnce('pool', 'pool(factory) needs a factory function — returning a dummy pool.');
      factory = function () { return {}; };
    }
    var free = [], liveCount = 0, i;
    if (prealloc > 0) { for (i = 0; i < prealloc; i++) free.push(factory()); }
    return {
      get: function () {
        var o = free.length ? free.pop() : factory();
        liveCount++;
        return o;
      },
      put: function (o) {
        if (!o) return;
        if (isFn(reset)) { try { reset(o); } catch (e) { warnOnce('pool:reset', 'pool reset threw', e); } }
        liveCount--;
        if (free.length < 4096) free.push(o);
      },
      size: function () { return free.length; },
      live: function () { return liveCount; },
      drain: function () { free.length = 0; }
    };
  }

  /* ---------------------------------------------------------------------------
   * 11. Scratch objects (THREE optional — guarded)
   * ------------------------------------------------------------------------ */
  var scratch = null;
  (function initScratch() {
    try {
      if (global.THREE && global.THREE.Vector3) {
        var T = global.THREE;
        scratch = {
          v3a: new T.Vector3(), v3b: new T.Vector3(), v3c: new T.Vector3(), v3d: new T.Vector3(),
          v2a: T.Vector2 ? new T.Vector2() : null, v2b: T.Vector2 ? new T.Vector2() : null,
          qa:  T.Quaternion ? new T.Quaternion() : null, qb: T.Quaternion ? new T.Quaternion() : null,
          ma:  T.Matrix4 ? new T.Matrix4() : null, mb: T.Matrix4 ? new T.Matrix4() : null,
          ca:  T.Color ? new T.Color() : null, cb: T.Color ? new T.Color() : null,
          ea:  T.Euler ? new T.Euler() : null
        };
      } else {
        warnOnce('three', 'THREE not present when core.js ran — Core.scratch is null (render modules should make their own).');
      }
    } catch (e) {
      warnOnce('three:scratch', 'could not build THREE scratch objects — Core.scratch is null.', e);
    }
  })();

  /* ---------------------------------------------------------------------------
   * 12. Public API
   * ------------------------------------------------------------------------ */
  var Core = {
    __isAowCore: true,
    version: '1.0.0',

    /* constants */
    SIM_HZ: SIM_HZ,
    FIXED_DT: FIXED_DT,
    SAVE_NS: SAVE_NS,
    SAVE_VERSION: SAVE_VERSION,
    ERAS: AOW.ERAS,

    /* live clock */
    time: 0,          // sim seconds (== state.time)
    dt: FIXED_DT,     // the fixed sim step
    dtReal: 0,        // last real frame delta, seconds
    realTime: 0,      // real seconds since start()
    alpha: 0,         // sub-step interpolation factor for renderers
    frame: 0,

    /* state */
    state: state,
    perf: perf,

    /* bus */
    on: on,
    once: once,
    off: off,
    emit: emit,
    clearListeners: clearListeners,

    /* loop */
    start: start,
    stop: stop,
    registerSim: registerSim,
    registerRender: registerRender,
    isRunning: function () { return _running; },
    setPaused: setPaused,
    togglePause: togglePause,
    isPaused: function () { return state.paused; },
    setSpeed: setSpeed,
    cycleSpeed: cycleSpeed,
    getSpeed: function () { return state.speed; },
    setQuality: setQualityMode,

    /* timers */
    after: after,
    every: every,
    clearTimers: clearTimers,

    /* rng — sim */
    rng: rng, rngRange: rngRange, rngInt: rngInt, rngIntR: rngIntR,
    rngPick: rngPick, rngChance: rngChance, rngSign: rngSign, rngGauss: rngGauss,
    setSeed: setSeed, getSeed: getSeed, getRngState: getRngState, setRngState: setRngState,
    makeRng: makeRng,

    /* rng — visual only (never touches sim determinism) */
    vrng: vrng, vrngRange: vrngRange, vrngInt: vrngInt, vrngIntR: vrngIntR,
    vrngPick: vrngPick, vrngChance: vrngChance, vrngSign: vrngSign, vrngGauss: vrngGauss,
    setVisualSeed: setVisualSeed,

    /* noise */
    noise1: noise1, noise2: noise2, fbm2: fbm2, hash2i: hash2i,

    /* math */
    clamp: clamp, clamp01: clamp01, lerp: lerp, invLerp: invLerp, mapRange: mapRange,
    damp: damp, approach: approach, smoothstep: smoothstep, smootherstep: smootherstep,
    easeInCubic: easeInCubic, easeOutCubic: easeOutCubic, easeInOutCubic: easeInOutCubic,
    easeInQuad: easeInQuad, easeOutQuad: easeOutQuad,
    easeInBack: easeInBack, easeOutBack: easeOutBack,
    easeOutElastic: easeOutElastic, easeOutBounce: easeOutBounce,
    lerpAngle: lerpAngle, angleDelta: angleDelta,
    dist: dist, dist2: dist2, sign: sign,

    /* save */
    save: save,
    requestSave: requestSave,
    load: load,
    hasSave: hasSave,
    clearSave: clearSave,
    registerSave: registerSave,
    registerMigration: registerMigration,

    /* run lifecycle */
    resetRun: resetRun,
    newRun: newRun,
    addGold: addGold,
    spendGold: spendGold,
    addGems: addGems,
    setEra: setEra,
    setPhase: setPhase,
    setStance: setStance,
    gameOver: gameOver,

    /* misc */
    nextId: nextId,
    pool: pool,
    scratch: scratch,
    warnOnce: warnOnce,
    now: _now
  };

  AOW.Core = Core;

  /* ---------------------------------------------------------------------------
   * 13. Environment wiring (all optional, all guarded)
   * ------------------------------------------------------------------------ */
  try {
    if (global.document && isFn(global.document.addEventListener)) {
      global.document.addEventListener('visibilitychange', function () {
        try {
          if (global.document.hidden) {
            _accum = 0;
            emit('app:hidden', null);
            save();                 // best-effort: don't lose progress on tab close
          } else {
            _lastMs = _now();
            _accum = 0;
            emit('app:visible', null);
          }
        } catch (e) { warnOnce('vis', 'visibilitychange handler failed', e); }
      }, false);
    }
  } catch (e) { warnOnce('vis:bind', 'could not bind visibilitychange', e); }

  try {
    if (isFn(global.addEventListener)) {
      global.addEventListener('pagehide', function () { try { save(); } catch (e) {} }, false);
      global.addEventListener('blur', function () { _accum = 0; }, false);
    }
  } catch (e) { warnOnce('life:bind', 'could not bind lifecycle events', e); }

  /* Auto-start the loop once the page is up, unless the integrator opts out or
     has already started it. start() is idempotent, so an explicit call wins. */
  try {
    if (!global.AOW_NO_AUTOSTART) {
      if (global.document && global.document.readyState === 'complete') {
        start();
      } else if (isFn(global.addEventListener)) {
        global.addEventListener('load', function () { start(); }, false);
      } else {
        start();
      }
    }
  } catch (e) {
    warnOnce('autostart', 'auto-start failed — call AOW.Core.start() manually.', e);
  }

  emit('core:ready', Core);

})(typeof window !== 'undefined' ? window : this);
