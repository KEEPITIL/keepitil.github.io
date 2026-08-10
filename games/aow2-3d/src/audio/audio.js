/* =============================================================================
 * AOW2-3D  —  src/audio/audio.js  —  global: AOW.Audio
 * -----------------------------------------------------------------------------
 * 100% procedural WebAudio. No files, no fetches, no modules. Plain <script>.
 *
 *   engine   : master/music/sfx buses -> compressor -> limiter -> destination,
 *              procedural convolution reverb, priority voice pool.
 *   sfx      : ~40 synthesised sounds, all with real envelopes + variance.
 *   space    : pan + attenuation + distance low-pass vs the camera focus.
 *   music    : layered adaptive score, era modes, bar-locked cross-fades.
 *   cues     : gameplay telegraphs (wave, boss windup, gate, low HP, power).
 *   mobile   : gesture unlock, suspend on hidden, settings + mute.
 *
 * Never hard-crashes: if WebAudio is missing every entry point is a no-op.
 * ========================================================================== */
(function (global) {
  'use strict';

  var AOW = global.AOW || (global.AOW = {});
  if (AOW.Audio && AOW.Audio.__isAowAudio) {
    try { console.warn('[AOW.Audio] already initialised — ignoring duplicate include.'); } catch (e) {}
    return;
  }

  var C = null;                       // AOW.Core, resolved lazily
  function core() {
    if (C) return C;
    C = (AOW.Core && AOW.Core.__isAowCore) ? AOW.Core : null;
    return C;
  }

  var _warned = Object.create(null);
  function warn(key, msg, err) {
    try {
      if (_warned[key]) return;
      _warned[key] = 1;
      if (err) console.warn('[AOW.Audio] ' + msg, err);
      else console.warn('[AOW.Audio] ' + msg);
    } catch (e) {}
  }

  /* ---------------------------------------------------------------------------
   * 0. Tiny math (self-contained: Core may not be loaded yet)
   * ------------------------------------------------------------------------ */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* Local RNG — audio jitter must never perturb the sim RNG stream. */
  var _rs = (Date.now() ^ 0x1f123bb5) >>> 0;
  function rnd() {
    _rs = (_rs + 0x6D2B79F5) >>> 0;
    var t = _rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function ri(n) { return (rnd() * n) | 0; }
  function pick(arr) { return arr[(rnd() * arr.length) | 0]; }
  /** Random detune in cents -> frequency multiplier. */
  function cents(c) { return Math.pow(2, c / 1200); }
  function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* ---------------------------------------------------------------------------
   * 1. Engine state
   * ------------------------------------------------------------------------ */
  var ctx = null;
  var ok = false;                  // engine built successfully
  var unlocked = false;            // context is running (post-gesture)
  var suspendedByUs = false;

  var nMaster, nLimiter, nComp, nMusic, nSfx, nSfxDuck, nRevIn, nRevConv, nRevOut;
  var noiseWhite = null, noisePink = null, noiseBrown = null, irBuffer = null;

  var settings = {
    master: 0.9,
    music: 0.5,
    sfx: 0.9,
    muted: false,
    sfxOn: true,
    musicOn: true
  };

  var MAX_VOICES = { high: 56, med: 36, low: 22 };
  var maxVoices = 56;

  /* ---------------------------------------------------------------------------
   * 2. Context creation / unlock
   * ------------------------------------------------------------------------ */
  function AC() {
    return global.AudioContext || global.webkitAudioContext || null;
  }

  function makeNoiseBuffer(kind, seconds) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    var i;
    if (kind === 'white') {
      for (i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
    } else if (kind === 'pink') {
      /* Paul Kellett's economy pink filter. */
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (i = 0; i < len; i++) {
        var w = rnd() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
        if (d[i] > 1) d[i] = 1; else if (d[i] < -1) d[i] = -1;
      }
    } else { /* brown */
      var last = 0;
      for (i = 0; i < len; i++) {
        var wn = rnd() * 2 - 1;
        last = (last + 0.02 * wn) / 1.02;
        d[i] = clamp(last * 3.5, -1, 1);
      }
    }
    return buf;
  }

  /** Procedural impulse response: early reflections + exponentially decaying noise. */
  function makeIR(seconds, decay, damp) {
    var rate = ctx.sampleRate;
    var len = Math.max(1, Math.floor(rate * seconds));
    var buf = ctx.createBuffer(2, len, rate);
    var ch, i;
    /* a handful of early reflections gives the tail a "place" instead of a wash */
    var taps = [];
    for (i = 0; i < 9; i++) {
      taps.push({ t: Math.floor(rr(0.008, 0.085) * rate), g: rr(0.18, 0.6) * (rnd() < 0.5 ? -1 : 1) });
    }
    for (ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      var lp = 0;
      for (i = 0; i < len; i++) {
        var t = i / len;
        var e = Math.pow(1 - t, decay);
        var n = (rnd() * 2 - 1) * e;
        /* progressive damping: highs die before lows, like real air + stone */
        lp += (n - lp) * (damp * (1 - t * 0.75) + 0.02);
        d[i] = lp;
      }
      for (i = 0; i < taps.length; i++) {
        var idx = taps[i].t + (ch ? ri(90) : 0);
        if (idx < len) d[idx] += taps[i].g * (ch ? 0.9 : 1);
      }
      /* soft head so the convolution never clicks */
      for (i = 0; i < 24 && i < len; i++) d[i] *= i / 24;
    }
    return buf;
  }

  function buildGraph() {
    nMaster  = ctx.createGain();
    nComp    = ctx.createDynamicsCompressor();
    nLimiter = ctx.createDynamicsCompressor();
    nMusic   = ctx.createGain();
    nSfx     = ctx.createGain();
    nSfxDuck = ctx.createGain();
    nRevIn   = ctx.createGain();
    nRevOut  = ctx.createGain();
    nRevConv = ctx.createConvolver();

    /* glue compressor: tames a wall of simultaneous hits */
    try {
      nComp.threshold.value = -18;
      nComp.knee.value = 22;
      nComp.ratio.value = 4;
      nComp.attack.value = 0.004;
      nComp.release.value = 0.16;
    } catch (e) { warn('comp', 'compressor params rejected — using defaults.', e); }

    /* brickwall-ish limiter: last line of defence against clipping */
    try {
      nLimiter.threshold.value = -2.2;
      nLimiter.knee.value = 0;
      nLimiter.ratio.value = 20;
      nLimiter.attack.value = 0.001;
      nLimiter.release.value = 0.09;
    } catch (e2) { warn('lim', 'limiter params rejected — using defaults.', e2); }

    irBuffer = makeIR(1.55, 2.6, 0.35);
    try { nRevConv.buffer = irBuffer; } catch (e3) { warn('ir', 'convolver rejected the IR — reverb disabled.', e3); }

    nRevIn.gain.value  = 1;
    nRevOut.gain.value = 0.34;
    nMusic.gain.value  = 0.0001;
    nSfx.gain.value    = 1;
    nSfxDuck.gain.value = 1;
    nMaster.gain.value = 0.0001;

    nSfx.connect(nSfxDuck);
    nSfxDuck.connect(nMaster);
    nMusic.connect(nMaster);
    nRevIn.connect(nRevConv);
    nRevConv.connect(nRevOut);
    nRevOut.connect(nMaster);
    nMaster.connect(nComp);
    nComp.connect(nLimiter);
    nLimiter.connect(ctx.destination);

    noiseWhite = makeNoiseBuffer('white', 2.0);
    noisePink  = makeNoiseBuffer('pink', 2.0);
    noiseBrown = makeNoiseBuffer('brown', 2.0);
  }

  function init() {
    if (ok) return true;
    var Ctor = AC();
    if (!Ctor) { warn('noac', 'WebAudio is unavailable in this browser — all audio is disabled.'); return false; }
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch (e) {
      try { ctx = new Ctor(); }
      catch (e2) { warn('ctx', 'could not create an AudioContext — all audio is disabled.', e2); return false; }
    }
    try {
      buildGraph();
    } catch (e3) {
      warn('graph', 'could not build the audio graph — all audio is disabled.', e3);
      ok = false; ctx = null; return false;
    }
    ok = true;
    applyVolumes(0.01);
    if (ctx.state === 'running') { unlocked = true; onUnlocked(); }
    return true;
  }

  function ready() { return ok && ctx && ctx.state !== 'closed'; }
  function T() { return ctx.currentTime; }

  var _unlockPending = [];
  function onUnlocked() {
    applyVolumes(0.25);
    var q = _unlockPending; _unlockPending = [];
    for (var i = 0; i < q.length; i++) { try { q[i](); } catch (e) {} }
    if (core()) core().emit('audio:ready', Audio);
  }

  function unlock() {
    if (!ok && !init()) return false;
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      try {
        var p = ctx.resume();
        if (p && p.then) {
          p.then(function () { unlocked = true; suspendedByUs = false; onUnlocked(); },
                 function (e) { warn('resume', 'AudioContext.resume() was rejected — waiting for another gesture.', e); });
        } else { unlocked = true; suspendedByUs = false; onUnlocked(); }
      } catch (e) { warn('resume2', 'AudioContext.resume() threw.', e); return false; }
    } else if (ctx.state === 'running') {
      if (!unlocked) { unlocked = true; onUnlocked(); }
    }
    /* iOS sometimes needs a real (silent) render before it believes us */
    try {
      var b = ctx.createBufferSource();
      b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      b.connect(ctx.destination);
      b.start(0);
    } catch (e4) {}
    return true;
  }

  function bindUnlockGestures() {
    if (!global.document || !global.document.addEventListener) return;
    var evs = ['pointerdown', 'touchend', 'mousedown', 'keydown', 'click'];
    function handler() {
      unlock();
      if (unlocked) {
        for (var i = 0; i < evs.length; i++) {
          try { global.document.removeEventListener(evs[i], handler, true); } catch (e) {}
        }
      }
    }
    for (var i = 0; i < evs.length; i++) {
      try { global.document.addEventListener(evs[i], handler, true); } catch (e) {}
    }
  }

  /* ---------------------------------------------------------------------------
   * 3. Volume / mute / settings
   * ------------------------------------------------------------------------ */
  function ramp(param, v, t) {
    if (!param) return;
    var now = T();
    try {
      param.cancelScheduledValues(now);
      param.setValueAtTime(Math.max(0.0001, param.value), now);
      param.exponentialRampToValueAtTime(Math.max(0.0001, v), now + Math.max(0.005, t || 0.05));
    } catch (e) {
      try { param.value = v; } catch (e2) {}
    }
  }

  function applyVolumes(t) {
    if (!ready()) return;
    var m = settings.muted ? 0 : settings.master;
    ramp(nMaster.gain, Math.max(0.0001, m), t === undefined ? 0.12 : t);
    ramp(nSfx.gain, settings.sfxOn ? Math.max(0.0001, settings.sfx) : 0.0001, 0.08);
    ramp(nMusic.gain, (settings.musicOn && music.running) ? Math.max(0.0001, settings.music) : 0.0001, 0.6);
  }

  function pullCoreSettings() {
    var c = core();
    if (!c || !c.state || !c.state.settings) return;
    var s = c.state.settings;
    if (typeof s.volume === 'number') settings.master = clamp01(s.volume);
    if (typeof s.musicVolume === 'number') settings.music = clamp01(s.musicVolume);
    if (typeof s.sfx === 'boolean') settings.sfxOn = s.sfx;
    if (typeof s.music === 'boolean') settings.musicOn = s.music;
    applyVolumes(0.15);
  }

  /* ---------------------------------------------------------------------------
   * 4. Voice pool — priority + max-instances so 200 hits never blow the CPU
   * ------------------------------------------------------------------------ */
  var voices = [];                       // live voice records
  var perKey = Object.create(null);      // key -> {n, last}
  var _vid = 1;

  var DEFAULT_MAX_INST = 4;
  var MAX_INST = {
    swordClash: 5, shieldBlock: 4, armorHit: 5, fleshHit: 5, boneCrunch: 3,
    arrowWhoosh: 6, arrowThunk: 5, bowDraw: 3, bowRelease: 4, spearThrust: 4,
    musketCrack: 4, musketReload: 2, energyWeapon: 5,
    deathCry: 3, warCry: 2, footstep: 8, coin: 4, uiClick: 3,
    explosion: 3, catapult: 2, fireCrackle: 2, thunder: 2
  };
  /* minimum spacing between two instances of the same key, seconds */
  var MIN_GAP = {
    swordClash: 0.022, shieldBlock: 0.03, armorHit: 0.022, fleshHit: 0.02,
    boneCrunch: 0.06, arrowWhoosh: 0.02, arrowThunk: 0.025, bowDraw: 0.06,
    bowRelease: 0.03, spearThrust: 0.03, musketCrack: 0.035, musketReload: 0.2,
    energyWeapon: 0.025, deathCry: 0.11, warCry: 0.9, gateSlam: 0.35,
    wallCrumble: 0.4, catapult: 0.25, explosion: 0.09, thunder: 1.2,
    coin: 0.04, uiClick: 0.035, levelUp: 0.4, purchase: 0.1, footstep: 0.012
  };

  function keyState(k) {
    var s = perKey[k];
    if (!s) { s = perKey[k] = { n: 0, last: -1e9 }; }
    return s;
  }

  /**
   * Reserve a voice. Returns a record or null when the request loses.
   * Higher priority wins; equal priority steals the oldest.
   */
  function alloc(key, priority, dur) {
    if (!ready()) return null;
    var t = T();
    var ks = keyState(key);
    var gap = MIN_GAP[key];
    if (gap === undefined) gap = 0.02;
    if (t - ks.last < gap) return null;                       // rate-limit clones
    var maxI = MAX_INST[key] === undefined ? DEFAULT_MAX_INST : MAX_INST[key];
    if (ks.n >= maxI) {
      /* try to steal the oldest instance of the SAME key rather than drop it */
      var oldest = null;
      for (var i = 0; i < voices.length; i++) {
        if (voices[i].key === key && (!oldest || voices[i].t0 < oldest.t0)) oldest = voices[i];
      }
      if (!oldest) return null;
      killVoice(oldest, 0.03);
    }
    if (voices.length >= maxVoices) {
      /* free anything that has already finished before we start stealing */
      for (var r = voices.length - 1; r >= 0; r--) {
        if (voices[r].end <= t) freeVoice(voices[r]);
      }
    }
    if (voices.length >= maxVoices) {
      var victim = null;
      for (var j = 0; j < voices.length; j++) {
        var v = voices[j];
        if (v.prio > priority) continue;
        if (!victim || v.prio < victim.prio || (v.prio === victim.prio && v.t0 < victim.t0)) victim = v;
      }
      if (!victim) return null;                                // we are the least important
      killVoice(victim, 0.025);
    }
    var rec = {
      id: _vid++, key: key, prio: priority, t0: t,
      end: t + (dur || 0.5), out: null, nodes: null, dead: false
    };
    ks.n++; ks.last = t;
    voices.push(rec);
    return rec;
  }

  function freeVoice(rec) {
    if (!rec || rec.dead) return;
    rec.dead = true;
    var ks = perKey[rec.key];
    if (ks) { ks.n--; if (ks.n < 0) ks.n = 0; }
    var i = voices.indexOf(rec);
    if (i >= 0) voices.splice(i, 1);
    if (rec.out) { try { rec.out.disconnect(); } catch (e) {} }
    rec.out = null; rec.nodes = null;
  }

  function killVoice(rec, fade) {
    if (!rec || rec.dead) return;
    if (rec.out) {
      try {
        var g = rec.out.gain, n = T();
        g.cancelScheduledValues(n);
        g.setValueAtTime(Math.max(0.0001, g.value), n);
        g.exponentialRampToValueAtTime(0.0001, n + (fade || 0.03));
      } catch (e) {}
    }
    var r = rec;
    setTimeout(function () { freeVoice(r); }, Math.ceil(((fade || 0.03) + 0.02) * 1000));
  }

  /** Housekeeping: reap voices whose scheduled end has passed. */
  function reap() {
    if (!ready()) return;
    var t = T();
    for (var i = voices.length - 1; i >= 0; i--) {
      if (voices[i].end <= t) freeVoice(voices[i]);
    }
  }

  /* ---------------------------------------------------------------------------
   * 5. Spatialisation — pan + attenuate + distance low-pass vs camera focus
   * ------------------------------------------------------------------------ */
  var HALF_SCREEN = 62;      // world units either side of focus that map to full pan
  var FALLOFF     = 120;     // world units at which a sound is basically gone

  function focusX() {
    try {
      if (AOW.Render && typeof AOW.Render.getFocusX === 'function') {
        var f = AOW.Render.getFocusX();
        if (typeof f === 'number' && isFinite(f)) return f;
      }
    } catch (e) {}
    return AOW.W ? AOW.W * 0.5 : 210;
  }

  function panFor(x) {
    if (typeof x !== 'number' || !isFinite(x)) return 0;
    return clamp((x - focusX()) / HALF_SCREEN, -1, 1);
  }

  function distFor(x) {
    if (typeof x !== 'number' || !isFinite(x)) return 0;
    return Math.abs(x - focusX());
  }

  /** 0..1 attenuation from world distance (inverse-ish, floored so nothing vanishes). */
  function distGain(d) {
    var n = clamp01(d / FALLOFF);
    return clamp(1 / (1 + n * n * 5.5), 0.03, 1);
  }

  /** Off-screen combat should read as distant: roll the highs off with range. */
  function distCutoff(d) {
    var n = clamp01(d / FALLOFF);
    return lerp(18000, 850, n * n * 0.85 + n * 0.15);
  }

  function makePanner() {
    if (ctx.createStereoPanner) {
      try { return { node: ctx.createStereoPanner(), set: function (n, v) { n.pan.value = clamp(v, -1, 1); } }; }
      catch (e) {}
    }
    try {
      var p = ctx.createPanner();
      p.panningModel = 'equalpower';
      if (p.distanceModel !== undefined) p.distanceModel = 'linear';
      if (p.maxDistance !== undefined) p.maxDistance = 10000;
      return {
        node: p,
        set: function (n, v) {
          var a = clamp(v, -1, 1) * Math.PI * 0.5;
          try { n.setPosition(Math.sin(a), 0, -Math.cos(a)); } catch (e2) {}
        }
      };
    } catch (e3) { return null; }
  }

  /**
   * Build the standard per-sound chain and reserve a voice.
   * Returns { rec, dest, t } or null.  `dest` is what your synth connects into.
   */
  function chain(key, prio, opts, dur) {
    opts = opts || {};
    var rec = alloc(key, prio, dur);
    if (!rec) return null;

    var out = ctx.createGain();
    var vol = (typeof opts.gain === 'number') ? opts.gain : 1;
    var x = opts.x;
    var d = 0;
    if (typeof x === 'number' && isFinite(x)) {
      d = distFor(x);
      vol *= distGain(d);
    }
    out.gain.value = clamp(vol, 0, 4);

    var head = out;
    if (typeof x === 'number' && isFinite(x)) {
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = distCutoff(d);
      lp.Q.value = 0.4;
      out.connect(lp);
      head = lp;
      var pn = makePanner();
      if (pn) {
        pn.set(pn.node, panFor(x));
        head.connect(pn.node);
        head = pn.node;
      }
    }

    head.connect(nSfx);
    var send = (typeof opts.reverb === 'number') ? opts.reverb : 0.16;
    if (send > 0 && nRevConv.buffer) {
      var sg = ctx.createGain();
      sg.gain.value = send * (typeof x === 'number' ? lerp(1, 2.1, clamp01(d / FALLOFF)) : 1);
      head.connect(sg);
      sg.connect(nRevIn);
    }

    rec.out = out;
    return { rec: rec, dest: out, t: T() + (opts.delay || 0) };
  }

  /** Attach lifetime bookkeeping to the last-stopping source of a voice. */
  function finish(v, endT) {
    v.rec.end = endT;
    var r = v.rec;
    var ms = Math.max(20, Math.ceil((endT - T() + 0.06) * 1000));
    setTimeout(function () { freeVoice(r); }, ms);
  }

  /* ---------------------------------------------------------------------------
   * 6. Synth primitives
   * ------------------------------------------------------------------------ */
  function osc(type, freq, t) {
    var o = ctx.createOscillator();
    try { o.type = type; } catch (e) { o.type = 'sine'; }
    o.frequency.setValueAtTime(Math.max(1, freq), t);
    return o;
  }

  function noise(kind, rate) {
    var s = ctx.createBufferSource();
    s.buffer = kind === 'pink' ? noisePink : (kind === 'brown' ? noiseBrown : noiseWhite);
    s.loop = true;
    if (rate) { try { s.playbackRate.value = clamp(rate, 0.05, 8); } catch (e) {} }
    /* start from a random offset so repeats never share a noise fingerprint */
    return s;
  }

  function startNoise(s, t, dur) {
    var off = rnd() * Math.max(0.001, (s.buffer.duration - 0.05));
    try { s.start(t, off); } catch (e) { try { s.start(t); } catch (e2) {} }
    try { s.stop(t + dur); } catch (e3) {}
  }

  function gainNode(v) { var g = ctx.createGain(); g.gain.value = (v === undefined ? 0 : v); return g; }

  function filt(type, freq, q) {
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = Math.max(10, freq);
    if (q !== undefined) f.Q.value = q;
    return f;
  }

  /** Percussive envelope: silence -> peak (attack) -> exponential tail. */
  function perc(param, t, peak, atk, dec) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.0005, atk));
    param.exponentialRampToValueAtTime(0.0001, t + Math.max(0.006, atk + dec));
    return t + atk + dec;
  }

  /** Full ADSR. Returns the end time. */
  function adsr(param, t, peak, a, d, s, hold, r) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(Math.max(0.0002, peak), t + a);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak * s), t + a + d);
    var rel = t + a + d + Math.max(0, hold);
    param.setValueAtTime(Math.max(0.0002, peak * s), rel);
    param.exponentialRampToValueAtTime(0.0001, rel + r);
    return rel + r;
  }

  /** Waveshaper curve for grit/saturation. */
  var _shapeCache = Object.create(null);
  function shaper(amount) {
    var k = String(amount | 0);
    var curve = _shapeCache[k];
    if (!curve) {
      var n = 1024;
      curve = new Float32Array(n);
      var deg = Math.PI / 180;
      for (var i = 0; i < n; i++) {
        var x = (i * 2) / n - 1;
        curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
      }
      _shapeCache[k] = curve;
    }
    var ws = ctx.createWaveShaper();
    ws.curve = curve;
    try { ws.oversample = '2x'; } catch (e) {}
    return ws;
  }

  /* Metallic partials for clangs — inharmonic ratios read as "metal", not "bell". */
  var METAL_RATIOS = [1, 1.72, 2.41, 3.13, 4.07, 5.61];

  function metalBurst(dest, t, f0, dur, level, bright) {
    var i, n = bright ? 6 : 4;
    for (i = 0; i < n; i++) {
      var o = osc(i < 2 ? 'triangle' : 'square', f0 * METAL_RATIOS[i] * cents(rr(-25, 25)), t);
      var g = gainNode(0);
      var amp = level * Math.pow(0.62, i) * rr(0.75, 1.15);
      perc(g.gain, t, amp, 0.0012 + i * 0.0004, dur * (1 - i * 0.11));
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  /* ---------------------------------------------------------------------------
   * 7. SFX library
   *    Every entry: play(opts) -> void.  opts: {x, gain, reverb, delay, ...}
   * ------------------------------------------------------------------------ */
  var SFX = Object.create(null);

  /* --- melee -------------------------------------------------------------- */
  SFX.swordClash = function (o) {
    var v = chain('swordClash', 6, o, 0.7); if (!v) return;
    var t = v.t, d = v.dest;
    var f0 = rr(1450, 2350);
    /* transient: filtered noise crack */
    var ns = noise('white', rr(0.9, 1.3));
    var bp = filt('bandpass', rr(2600, 4200), rr(1.4, 3.2));
    var ng = gainNode(0);
    perc(ng.gain, t, rr(0.5, 0.85), 0.001, rr(0.05, 0.11));
    ns.connect(bp); bp.connect(ng); ng.connect(d);
    startNoise(ns, t, 0.2);
    /* body: inharmonic ring */
    metalBurst(d, t + 0.002, f0, rr(0.28, 0.55), rr(0.16, 0.3), true);
    /* low thud of the two blades meeting */
    var lo = osc('sine', rr(120, 190), t), lg = gainNode(0);
    perc(lg.gain, t, rr(0.18, 0.3), 0.002, 0.09);
    lo.frequency.exponentialRampToValueAtTime(rr(60, 90), t + 0.1);
    lo.connect(lg); lg.connect(d); lo.start(t); lo.stop(t + 0.16);
    finish(v, t + 0.62);
  };

  SFX.shieldBlock = function (o) {
    var v = chain('shieldBlock', 6, o, 0.6); if (!v) return;
    var t = v.t, d = v.dest;
    var wood = (o && o.material === 'wood') || rnd() < 0.45;
    var ns = noise('white', rr(0.7, 1.1));
    var bp = filt('bandpass', wood ? rr(700, 1300) : rr(1800, 3000), wood ? 1.1 : 2.2);
    var ng = gainNode(0);
    perc(ng.gain, t, rr(0.55, 0.9), 0.0012, wood ? rr(0.07, 0.13) : rr(0.045, 0.09));
    ns.connect(bp); bp.connect(ng); ng.connect(d);
    startNoise(ns, t, 0.25);
    /* wood = damped low knock, metal = bright short clang */
    if (wood) {
      var o1 = osc('triangle', rr(160, 240), t), g1 = gainNode(0);
      perc(g1.gain, t, rr(0.3, 0.5), 0.002, rr(0.12, 0.2));
      o1.frequency.exponentialRampToValueAtTime(rr(90, 130), t + 0.14);
      o1.connect(g1); g1.connect(d); o1.start(t); o1.stop(t + 0.28);
    } else {
      metalBurst(d, t, rr(700, 1150), rr(0.18, 0.34), rr(0.2, 0.32), false);
    }
    finish(v, t + 0.5);
  };

  SFX.armorHit = function (o) {
    var v = chain('armorHit', 6, o, 0.55); if (!v) return;
    var t = v.t, d = v.dest;
    var ns = noise('white', rr(0.8, 1.2));
    var bp = filt('bandpass', rr(1100, 2100), rr(0.9, 1.8));
    var ng = gainNode(0);
    perc(ng.gain, t, rr(0.4, 0.7), 0.001, rr(0.04, 0.08));
    ns.connect(bp); bp.connect(ng); ng.connect(d);
    startNoise(ns, t, 0.18);
    metalBurst(d, t, rr(380, 620), rr(0.14, 0.26), rr(0.22, 0.36), false);
    var lo = osc('sine', rr(90, 140), t), lg = gainNode(0);
    perc(lg.gain, t, rr(0.25, 0.42), 0.002, 0.1);
    lo.connect(lg); lg.connect(d); lo.start(t); lo.stop(t + 0.2);
    finish(v, t + 0.45);
  };

  SFX.fleshHit = function (o) {
    var v = chain('fleshHit', 5, o, 0.4); if (!v) return;
    var t = v.t, d = v.dest;
    var ns = noise('brown', rr(0.8, 1.4));
    var lp = filt('lowpass', rr(420, 900), 1.1);
    var ng = gainNode(0);
    perc(ng.gain, t, rr(0.55, 0.95), 0.0015, rr(0.06, 0.12));
    ns.connect(lp); lp.connect(ng); ng.connect(d);
    startNoise(ns, t, 0.22);
    /* wet slap: a fast downward sine chirp under the noise */
    var s = osc('sine', rr(190, 300), t), sg = gainNode(0);
    s.frequency.exponentialRampToValueAtTime(rr(55, 85), t + 0.07);
    perc(sg.gain, t, rr(0.3, 0.5), 0.001, 0.08);
    s.connect(sg); sg.connect(d); s.start(t); s.stop(t + 0.16);
    finish(v, t + 0.35);
  };

  SFX.boneCrunch = function (o) {
    var v = chain('boneCrunch', 7, o, 0.5); if (!v) return;
    var t = v.t, d = v.dest;
    /* a crunch is many micro-cracks, not one — stagger 4-7 grains */
    var n = 4 + ri(4), i;
    for (i = 0; i < n; i++) {
      var tt = t + i * rr(0.004, 0.016);
      var ns = noise('white', rr(0.6, 1.5));
      var bp = filt('bandpass', rr(900, 3400), rr(3, 8));
      var g = gainNode(0);
      perc(g.gain, tt, rr(0.2, 0.55) * (1 - i / (n + 2)), 0.0008, rr(0.012, 0.035));
      ns.connect(bp); bp.connect(g); g.connect(d);
      startNoise(ns, tt, 0.08);
    }
    var lo = osc('triangle', rr(70, 110), t), lg = gainNode(0);
    perc(lg.gain, t, rr(0.3, 0.48), 0.002, 0.13);
    lo.connect(lg); lg.connect(d); lo.start(t); lo.stop(t + 0.22);
    finish(v, t + 0.45);
  };

  SFX.spearThrust = function (o) {
    var v = chain('spearThrust', 5, o, 0.5); if (!v) return;
    var t = v.t, d = v.dest;
    /* whoosh that accelerates, then a short pierce */
    var ns = noise('pink', rr(0.9, 1.3));
    var bp = filt('bandpass', 500, 1.4);
    bp.frequency.setValueAtTime(rr(380, 620), t);
    bp.frequency.exponentialRampToValueAtTime(rr(1600, 2600), t + 0.1);
    var g = gainNode(0);
    perc(g.gain, t, rr(0.3, 0.5), 0.03, 0.09);
    ns.connect(bp); bp.connect(g); g.connect(d);
    startNoise(ns, t, 0.2);
    var hit = t + rr(0.09, 0.13);
    var ns2 = noise('white', 1), bp2 = filt('bandpass', rr(1800, 3200), 2.4), g2 = gainNode(0);
    perc(g2.gain, hit, rr(0.35, 0.6), 0.001, 0.05);
    ns2.connect(bp2); bp2.connect(g2); g2.connect(d);
    startNoise(ns2, hit, 0.12);
    finish(v, t + 0.4);
  };

  /* --- bows / arrows ------------------------------------------------------ */
  SFX.bowDraw = function (o) {
    var v = chain('bowDraw', 4, o, 0.85); if (!v) return;
    var t = v.t, d = v.dest;
    var dur = (o && o.duration) || rr(0.34, 0.52);
    var ns = noise('pink', rr(0.5, 0.8));
    var bp = filt('bandpass', 900, 3.5);
    bp.frequency.setValueAtTime(rr(700, 1000), t);
    bp.frequency.linearRampToValueAtTime(rr(1500, 2100), t + dur);
    var g = gainNode(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(rr(0.16, 0.26), t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    ns.connect(bp); bp.connect(g); g.connect(d);
    startNoise(ns, t, dur + 0.1);
    /* creak: a slow, slightly wobbling low partial */
    var cr = osc('sawtooth', rr(70, 110), t), cg = gainNode(0), clp = filt('lowpass', 700, 1);
    cr.frequency.linearRampToValueAtTime(rr(120, 165), t + dur);
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.linearRampToValueAtTime(rr(0.05, 0.1), t + dur * 0.7);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    cr.connect(clp); clp.connect(cg); cg.connect(d);
    cr.start(t); cr.stop(t + dur + 0.1);
    finish(v, t + dur + 0.2);
  };

  SFX.bowRelease = function (o) {
    var v = chain('bowRelease', 6, o, 0.45); if (!v) return;
    var t = v.t, d = v.dest;
    /* string snap */
    var st = osc('triangle', rr(240, 380), t), sg = gainNode(0);
    st.frequency.exponentialRampToValueAtTime(rr(90, 140), t + 0.05);
    perc(sg.gain, t, rr(0.35, 0.55), 0.0008, 0.07);
    st.connect(sg); sg.connect(d); st.start(t); st.stop(t + 0.14);
    var ns = noise('white', rr(0.9, 1.3)), bp = filt('bandpass', rr(1600, 2800), 1.6), g = gainNode(0);
    perc(g.gain, t, rr(0.28, 0.46), 0.0008, 0.055);
    ns.connect(bp); bp.connect(g); g.connect(d);
    startNoise(ns, t, 0.12);
    finish(v, t + 0.28);
    /* the arrow leaves right after the string */
    SFX.arrowWhoosh({ x: o && o.x, gain: (o && o.gain) || 1, delay: 0.02 });
  };

  SFX.arrowWhoosh = function (o) {
    var v = chain('arrowWhoosh', 3, o, 0.4); if (!v) return;
    var t = v.t, d = v.dest;
    var dur = rr(0.16, 0.3);
    var ns = noise('pink', rr(1.1, 1.7));
    var bp = filt('bandpass', 1400, rr(2.5, 5));
    bp.frequency.setValueAtTime(rr(2600, 3800), t);
    bp.frequency.exponentialRampToValueAtTime(rr(700, 1200), t + dur);
    var g = gainNode(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(rr(0.16, 0.3), t + dur * 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    ns.connect(bp); bp.connect(g); g.connect(d);
    startNoise(ns, t, dur + 0.05);
    finish(v, t + dur + 0.1);
  };

  SFX.arrowThunk = function (o) {
    var v = chain('arrowThunk', 5, o, 0.4); if (!v) return;
    var t = v.t, d = v.dest;
    var into = (o && o.material) || (rnd() < 0.5 ? 'wood' : 'flesh');
    if (into === 'flesh') { SFX.fleshHit({ x: o && o.x, gain: 0.8 }); }
    var f = into === 'wood' ? rr(180, 280) : rr(110, 170);
    var b = osc('triangle', f, t), bg = gainNode(0);
    b.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.08);
    perc(bg.gain, t, rr(0.4, 0.7), 0.001, into === 'wood' ? 0.11 : 0.07);
    b.connect(bg); bg.connect(d); b.start(t); b.stop(t + 0.22);
    var ns = noise('white', 1), bp = filt('bandpass', into === 'wood' ? rr(1300, 2200) : rr(600, 1100), 1.8), g = gainNode(0);
    perc(g.gain, t, rr(0.22, 0.4), 0.0008, 0.04);
    ns.connect(bp); bp.connect(g); g.connect(d);
    startNoise(ns, t, 0.1);
    /* shaft wobble after a wood hit */
    if (into === 'wood') {
      var w = osc('sine', rr(600, 900), t + 0.01), wg = gainNode(0);
      wg.gain.setValueAtTime(0.0001, t + 0.01);
      wg.gain.linearRampToValueAtTime(rr(0.04, 0.09), t + 0.03);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + rr(0.2, 0.34));
      var lfo = osc('sine', rr(18, 34), t), lg2 = gainNode(rr(20, 60));
      lfo.connect(lg2); lg2.connect(w.frequency);
      w.connect(wg); wg.connect(d);
      w.start(t + 0.01); w.stop(t + 0.4); lfo.start(t); lfo.stop(t + 0.4);
    }
    finish(v, t + 0.45);
  };

  /* --- gunpowder / energy ------------------------------------------------- */
  SFX.musketCrack = function (o) {
    var v = chain('musketCrack', 8, o, 1.1); if (!v) return;
    var t = v.t, d = v.dest;
    /* flash-pan hiss */
    var fp = noise('white', 1.4), fbp = filt('highpass', 3500, 0.7), fg = gainNode(0);
    perc(fg.gain, t, rr(0.12, 0.22), 0.001, 0.03);
    fp.connect(fbp); fbp.connect(fg); fg.connect(d);
    startNoise(fp, t, 0.08);
    /* the crack itself */
    var t2 = t + rr(0.006, 0.016);
    var ns = noise('white', rr(0.9, 1.2));
    var lp = filt('lowpass', 9000, 0.9);
    lp.frequency.setValueAtTime(rr(7000, 11000), t2);
    lp.frequency.exponentialRampToValueAtTime(rr(500, 900), t2 + 0.28);
    var g = gainNode(0);
    perc(g.gain, t2, rr(0.85, 1.25), 0.0009, rr(0.22, 0.4));
    var ws = shaper(6);
    ns.connect(lp); lp.connect(ws); ws.connect(g); g.connect(d);
    startNoise(ns, t2, 0.5);
    /* chest-punch body */
    var lo = osc('sine', rr(95, 145), t2), lg = gainNode(0);
    lo.frequency.exponentialRampToValueAtTime(rr(38, 55), t2 + 0.16);
    perc(lg.gain, t2, rr(0.5, 0.8), 0.002, 0.2);
    lo.connect(lg); lg.connect(d); lo.start(t2); lo.stop(t2 + 0.4);
    /* tail slap off the walls */
    var tl = noise('pink', 0.7), tlp = filt('bandpass', rr(600, 1100), 0.8), tg = gainNode(0);
    tg.gain.setValueAtTime(0.0001, t2 + 0.05);
    tg.gain.linearRampToValueAtTime(rr(0.06, 0.13), t2 + 0.1);
    tg.gain.exponentialRampToValueAtTime(0.0001, t2 + rr(0.5, 0.85));
    tl.connect(tlp); tlp.connect(tg); tg.connect(d);
    startNoise(tl, t2 + 0.05, 0.9);
    finish(v, t + 1.05);
  };

  SFX.musketReload = function (o) {
    var v = chain('musketReload', 3, o, 1.5); if (!v) return;
    var t = v.t, d = v.dest;
    /* ramrod scrapes, then a click and a lock snap */
    var i, n = 3;
    for (i = 0; i < n; i++) {
      var tt = t + i * rr(0.16, 0.26);
      var ns = noise('pink', rr(0.8, 1.4)), bp = filt('bandpass', rr(1400, 2600), rr(1.5, 3)), g = gainNode(0);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(rr(0.07, 0.14), tt + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + rr(0.09, 0.16));
      ns.connect(bp); bp.connect(g); g.connect(d);
      startNoise(ns, tt, 0.25);
    }
    var ck = t + rr(0.62, 0.8);
    for (i = 0; i < 2; i++) {
      var ct = ck + i * rr(0.05, 0.11);
      var cn = noise('white', 1), cb = filt('bandpass', rr(2600, 4200), 6), cg = gainNode(0);
      perc(cg.gain, ct, rr(0.16, 0.3), 0.0006, 0.02);
      cn.connect(cb); cb.connect(cg); cg.connect(d);
      startNoise(cn, ct, 0.05);
      var mo = osc('square', rr(900, 1500), ct), mg = gainNode(0);
      perc(mg.gain, ct, rr(0.05, 0.11), 0.0006, 0.03);
      mo.connect(mg); mg.connect(d); mo.start(ct); mo.stop(ct + 0.06);
    }
    finish(v, t + 1.1);
  };

  SFX.energyWeapon = function (o) {
    var v = chain('energyWeapon', 7, o, 0.8); if (!v) return;
    var t = v.t, d = v.dest;
    var f0 = rr(1100, 1800);
    var lp = filt('lowpass', 5200, 6);
    lp.frequency.setValueAtTime(rr(5000, 7500), t);
    lp.frequency.exponentialRampToValueAtTime(rr(300, 600), t + rr(0.2, 0.34));
    var g = gainNode(0);
    perc(g.gain, t, rr(0.5, 0.8), 0.002, rr(0.2, 0.34));
    lp.connect(g); g.connect(d);
    /* two detuned saws diving = classic plasma zap */
    var a = osc('sawtooth', f0, t), b = osc('sawtooth', f0 * cents(rr(-30, 30)) * 1.005, t);
    a.frequency.exponentialRampToValueAtTime(f0 * rr(0.14, 0.24), t + 0.24);
    b.frequency.exponentialRampToValueAtTime(f0 * rr(0.13, 0.23), t + 0.26);
    a.connect(lp); b.connect(lp);
    a.start(t); a.stop(t + 0.4); b.start(t); b.stop(t + 0.42);
    /* ring-modulated shimmer on top */
    var rm = osc('sine', rr(60, 150), t), rg = gainNode(0);
    var car = osc('sine', f0 * 2.02, t);
    perc(rg.gain, t, rr(0.1, 0.2), 0.003, 0.16);
    var mgn = gainNode(0);
    rm.connect(mgn.gain); car.connect(mgn); mgn.connect(rg); rg.connect(d);
    rm.start(t); rm.stop(t + 0.4); car.start(t); car.stop(t + 0.4);
    finish(v, t + 0.7);
  };

  /* --- footsteps ---------------------------------------------------------- */
  var SURFACE = {
    dirt:  { f: 320,  q: 0.9, dec: 0.055, noise: 'brown', hi: 0.25 },
    grass: { f: 480,  q: 1.1, dec: 0.05,  noise: 'pink',  hi: 0.45 },
    stone: { f: 900,  q: 1.6, dec: 0.045, noise: 'white', hi: 0.75 },
    mud:   { f: 240,  q: 0.8, dec: 0.085, noise: 'brown', hi: 0.15 },
    snow:  { f: 1600, q: 0.7, dec: 0.07,  noise: 'white', hi: 0.9 },
    sand:  { f: 1200, q: 0.6, dec: 0.06,  noise: 'white', hi: 0.6 },
    wood:  { f: 560,  q: 2.2, dec: 0.06,  noise: 'pink',  hi: 0.5 },
    metal: { f: 1500, q: 3.0, dec: 0.05,  noise: 'white', hi: 1.0 }
  };
  var surfaceKey = 'dirt';

  /**
   * One footstep. opts: {x, weight 0.4..3 (unit mass), surface, gain}
   */
  SFX.footstep = function (o) {
    o = o || {};
    var v = chain('footstep', 2, o, 0.3); if (!v) return;
    var t = v.t, d = v.dest;
    var s = SURFACE[o.surface || surfaceKey] || SURFACE.dirt;
    var w = clamp(o.weight === undefined ? 1 : o.weight, 0.3, 4);
    var lvl = 0.10 * Math.pow(w, 0.6);
    var ns = noise(s.noise, rr(0.85, 1.2));
    var bp = filt('bandpass', s.f * rr(0.82, 1.22) / Math.pow(w, 0.25), s.q);
    var g = gainNode(0);
    perc(g.gain, t, lvl * rr(0.75, 1.3), 0.0015, s.dec * rr(0.8, 1.3));
    ns.connect(bp); bp.connect(g); g.connect(d);
    startNoise(ns, t, 0.2);
    /* body thump scales with the unit's mass */
    var lo = osc('sine', rr(58, 96) / Math.pow(w, 0.22), t), lg = gainNode(0);
    lo.frequency.exponentialRampToValueAtTime(rr(32, 46), t + 0.07);
    perc(lg.gain, t, lvl * 1.5 * rr(0.8, 1.2), 0.002, 0.075 * w);
    lo.connect(lg); lg.connect(d); lo.start(t); lo.stop(t + 0.2);
    /* armour rattle for heavy units */
    if (w > 1.35 && rnd() < 0.7) {
      var rt = t + rr(0.008, 0.03);
      var rn = noise('white', 1), rb = filt('bandpass', rr(2600, 5200), 4), rg2 = gainNode(0);
      perc(rg2.gain, rt, lvl * rr(0.25, 0.5) * s.hi, 0.001, 0.05);
      rn.connect(rb); rb.connect(rg2); rg2.connect(d);
      startNoise(rn, rt, 0.1);
    }
    finish(v, t + 0.3);
  };

  /**
   * The horde bed: ONE rhythmic march layer that stands in for N footfalls.
   * `count` shapes density and level; we never play 200 individual steps.
   */
  SFX.marchBed = function (o) {
    o = o || {};
    var count = clamp(o.count || 1, 1, 400);
    var v = chain('marchBed', 3, o, 0.6); if (!v) return;
    var t = v.t, d = v.dest;
    var s = SURFACE[o.surface || surfaceKey] || SURFACE.dirt;
    /* level grows logarithmically: 200 men are loud, not 200x loud */
    var lvl = clamp(0.06 + 0.11 * Math.log(1 + count) / Math.log(12), 0.05, 0.34);
    var spread = clamp(0.012 + count * 0.0009, 0.012, 0.075);   // ranks are never perfectly in step
    var grains = clamp(3 + Math.round(Math.log(1 + count) * 2.2), 3, 9);
    var i;
    for (i = 0; i < grains; i++) {
      var tt = t + rr(0, spread);
      var ns = noise(s.noise, rr(0.8, 1.25));
      var bp = filt('bandpass', s.f * rr(0.7, 1.35), s.q * rr(0.7, 1.3));
      var g = gainNode(0);
      perc(g.gain, tt, lvl * rr(0.5, 1.1) / Math.sqrt(grains) * 1.9, 0.0015, s.dec * rr(0.85, 1.5));
      ns.connect(bp); bp.connect(g); g.connect(d);
      startNoise(ns, tt, 0.22);
    }
    /* collective low thud — the part you feel */
    var lo = osc('sine', rr(46, 62), t), lg = gainNode(0);
    lo.frequency.exponentialRampToValueAtTime(rr(28, 38), t + 0.1);
    perc(lg.gain, t, lvl * 1.45, 0.004, rr(0.1, 0.17));
    lo.connect(lg); lg.connect(d); lo.start(t); lo.stop(t + 0.3);
    /* gear/metal wash rising with the crowd size */
    if (count > 6) {
      var rn = noise('white', 1), rb = filt('bandpass', rr(2200, 4600), 1.4), rg = gainNode(0);
      perc(rg.gain, t + 0.008, lvl * 0.4 * s.hi, 0.006, 0.09);
      rn.connect(rb); rb.connect(rg); rg.connect(d);
      startNoise(rn, t + 0.008, 0.16);
    }
    finish(v, t + 0.5);
  };

  /* --- voices (cries) ----------------------------------------------------- */
  /** Crude but effective vocal: pulse-ish source through two formant bandpasses. */
  function vocal(dest, t, f0, dur, level, formants, vibrato) {
    var src = osc('sawtooth', f0, t);
    var sub = osc('square', f0 * 0.5, t);
    var mix = gainNode(1);
    var subG = gainNode(0.25);
    src.connect(mix); sub.connect(subG); subG.connect(mix);
    var out = gainNode(0);
    var i;
    for (i = 0; i < formants.length; i++) {
      var bp = filt('bandpass', formants[i][0] * rr(0.94, 1.06), formants[i][2] || 6);
      var fg = gainNode(formants[i][1]);
      mix.connect(bp); bp.connect(fg); fg.connect(out);
    }
    var thru = gainNode(0.18);
    var lp = filt('lowpass', f0 * 8, 0.7);
    mix.connect(lp); lp.connect(thru); thru.connect(out);
    /* breath */
    var ns = noise('pink', 1), nb = filt('bandpass', rr(1600, 3200), 1.2), ng = gainNode(0);
    perc(ng.gain, t, level * 0.25, dur * 0.15, dur * 0.9);
    ns.connect(nb); nb.connect(ng); ng.connect(out);
    startNoise(ns, t, dur + 0.1);

    var env = gainNode(0);
    out.connect(env); env.connect(dest);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(level, t + dur * 0.12);
    env.gain.setValueAtTime(level, t + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    if (vibrato) {
      var lfo = osc('sine', rr(4.5, 7.5), t), la = gainNode(f0 * rr(0.012, 0.035));
      lfo.connect(la); la.connect(src.frequency); la.connect(sub.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    src.start(t); src.stop(t + dur + 0.05);
    sub.start(t); sub.stop(t + dur + 0.05);
    return src;
  }

  SFX.deathCry = function (o) {
    o = o || {};
    var v = chain('deathCry', 7, o, 1.3); if (!v) return;
    var t = v.t, d = v.dest;
    var deep = o.weight ? o.weight > 1.4 : rnd() < 0.4;
    var f0 = deep ? rr(88, 130) : rr(140, 215);
    var dur = rr(0.5, 0.95);
    var src = vocal(d, t, f0, dur, rr(0.2, 0.34), [[rr(620, 780), 0.9, 7], [rr(1050, 1350), 0.55, 8], [rr(2400, 2900), 0.25, 9]], true);
    /* the pitch collapses as they go down */
    try {
      src.frequency.setValueAtTime(f0, t);
      src.frequency.linearRampToValueAtTime(f0 * rr(1.1, 1.35), t + dur * 0.2);
      src.frequency.exponentialRampToValueAtTime(f0 * rr(0.45, 0.62), t + dur);
    } catch (e) {}
    if (rnd() < 0.45) { SFX.armorHit({ x: o.x, gain: 0.5, delay: dur * 0.8 }); }
    finish(v, t + dur + 0.4);
  };

  SFX.warCry = function (o) {
    o = o || {};
    var v = chain('warCry', 8, o, 2.2); if (!v) return;
    var t = v.t, d = v.dest;
    var n = clamp(o.count || 8, 1, 60);
    var layers = clamp(2 + Math.round(Math.log(1 + n) * 1.6), 2, 7);
    var dur = rr(1.0, 1.6);
    var i;
    for (i = 0; i < layers; i++) {
      var tt = t + rr(0, 0.16);
      var f0 = rr(105, 235);
      var lvl = rr(0.07, 0.15) / Math.sqrt(layers) * 1.8;
      var s = vocal(d, tt, f0, dur * rr(0.8, 1.15), lvl,
                    [[rr(560, 820), 0.9, 6], [rr(1000, 1450), 0.5, 7], [rr(2300, 3000), 0.2, 8]], true);
      try {
        s.frequency.setValueAtTime(f0, tt);
        s.frequency.linearRampToValueAtTime(f0 * rr(1.15, 1.45), tt + dur * 0.35);
        s.frequency.linearRampToValueAtTime(f0 * rr(0.85, 1.05), tt + dur);
      } catch (e) {}
    }
    /* weapons on shields underneath the shout */
    for (i = 0; i < 4; i++) {
      SFX.shieldBlock({ x: o.x, gain: 0.28, delay: rr(0.02, 0.5), material: rnd() < 0.5 ? 'wood' : 'metal' });
    }
    finish(v, t + dur + 0.7);
  };

  /* --- structures / siege ------------------------------------------------- */
  SFX.gateSlam = function (o) {
    var v = chain('gateSlam', 9, o, 2.0); if (!v) return;
    var t = v.t, d = v.dest;
    /* huge timber impact: sub thump + wood crack + iron rattle */
    var lo = osc('sine', rr(70, 100), t), lg = gainNode(0);
    lo.frequency.exponentialRampToValueAtTime(rr(28, 40), t + 0.4);
    perc(lg.gain, t, rr(0.9, 1.25), 0.004, rr(0.5, 0.8));
    lo.connect(lg); lg.connect(d); lo.start(t); lo.stop(t + 1.3);
    var ns = noise('brown', rr(0.6, 0.9)), lp = filt('lowpass', 1400, 1.0), g = gainNode(0);
    lp.frequency.exponentialRampToValueAtTime(280, t + 0.5);
    perc(g.gain, t, rr(0.6, 0.9), 0.002, rr(0.35, 0.6));
    var ws = shaper(4);
    ns.connect(lp); lp.connect(ws); ws.connect(g); g.connect(d);
    startNoise(ns, t, 0.9);
    var i;
    for (i = 0; i < 5; i++) {
      var tt = t + rr(0.01, 0.24);
      var mn = noise('white', 1), mb = filt('bandpass', rr(900, 3000), rr(4, 9)), mg = gainNode(0);
      perc(mg.gain, tt, rr(0.08, 0.2), 0.001, rr(0.05, 0.16));
      mn.connect(mb); mb.connect(mg); mg.connect(d);
      startNoise(mn, tt, 0.25);
    }
    finish(v, t + 1.9);
  };

  SFX.wallCrumble = function (o) {
    o = o || {};
    var v = chain('wallCrumble', 9, o, 3.2); if (!v) return;
    var t = v.t, d = v.dest;
    var dur = rr(1.5, 2.4);
    /* rumble bed */
    var ns = noise('brown', rr(0.5, 0.8)), lp = filt('lowpass', 900, 0.8), g = gainNode(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(rr(0.55, 0.85), t + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.frequency.setValueAtTime(rr(700, 1200), t);
    lp.frequency.exponentialRampToValueAtTime(rr(140, 240), t + dur);
    ns.connect(lp); lp.connect(g); g.connect(d);
    startNoise(ns, t, dur + 0.1);
    /* sub drop */
    var lo = osc('sine', rr(55, 78), t), lg = gainNode(0);
    lo.frequency.exponentialRampToValueAtTime(rr(22, 32), t + 0.7);
    perc(lg.gain, t, rr(0.7, 1.05), 0.01, 1.0);
    lo.connect(lg); lg.connect(d); lo.start(t); lo.stop(t + 1.4);
    /* debris: a shower of stone clacks thinning out over time */
    var n = 16 + ri(14), i;
    for (i = 0; i < n; i++) {
      var frac = Math.pow(rnd(), 0.6);
      var tt = t + 0.05 + frac * dur;
      var dn = noise('white', rr(0.7, 1.4)), db = filt('bandpass', rr(700, 3600), rr(3, 10)), dg = gainNode(0);
      perc(dg.gain, tt, rr(0.05, 0.16) * (1 - frac * 0.7), 0.001, rr(0.02, 0.07));
      dn.connect(db); db.connect(dg); dg.connect(d);
      startNoise(dn, tt, 0.12);
      if (rnd() < 0.4) {
        var ko = osc('triangle', rr(150, 420), tt), kg = gainNode(0);
        perc(kg.gain, tt, rr(0.03, 0.09) * (1 - frac * 0.7), 0.001, rr(0.03, 0.09));
        ko.connect(kg); kg.connect(d); ko.start(tt); ko.stop(tt + 0.15);
      }
    }
    finish(v, t + dur + 0.9);
  };

  SFX.catapult = function (o) {
    var v = chain('catapult', 8, o, 1.4); if (!v) return;
    var t = v.t, d = v.dest;
    /* rope/timber groan, then the arm slams the stop, then the payload flies */
    var cr = osc('sawtooth', rr(55, 85), t), clp = filt('lowpass', 500, 2), cg = gainNode(0);
    cr.frequency.linearRampToValueAtTime(rr(110, 160), t + 0.2);
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.linearRampToValueAtTime(rr(0.1, 0.18), t + 0.16);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    cr.connect(clp); clp.connect(cg); cg.connect(d);
    cr.start(t); cr.stop(t + 0.3);

    var hit = t + rr(0.2, 0.28);
    var lo = osc('sine', rr(90, 130), hit), lg = gainNode(0);
    lo.frequency.exponentialRampToValueAtTime(rr(35, 50), hit + 0.25);
    perc(lg.gain, hit, rr(0.6, 0.95), 0.003, 0.4);
    lo.connect(lg); lg.connect(d); lo.start(hit); lo.stop(hit + 0.7);
    var ns = noise('brown', 0.8), lp = filt('lowpass', 1600, 1), g = gainNode(0);
    perc(g.gain, hit, rr(0.4, 0.65), 0.002, 0.3);
    ns.connect(lp); lp.connect(g); g.connect(d);
    startNoise(ns, hit, 0.5);
    /* payload doppler-ish whoosh away from the camera */
    var wt = hit + 0.03;
    var wn = noise('pink', rr(0.8, 1.2)), wb = filt('bandpass', 900, 1.1), wg = gainNode(0);
    wb.frequency.setValueAtTime(rr(1400, 2200), wt);
    wb.frequency.exponentialRampToValueAtTime(rr(380, 600), wt + 0.5);
    wg.gain.setValueAtTime(0.0001, wt);
    wg.gain.linearRampToValueAtTime(rr(0.14, 0.24), wt + 0.08);
    wg.gain.exponentialRampToValueAtTime(0.0001, wt + 0.55);
    wn.connect(wb); wb.connect(wg); wg.connect(d);
    startNoise(wn, wt, 0.65);
    finish(v, t + 1.3);
  };

  SFX.explosion = function (o) {
    o = o || {};
    var v = chain('explosion', 9, o, 2.4); if (!v) return;
    var t = v.t, d = v.dest;
    var size = clamp(o.size === undefined ? 1 : o.size, 0.35, 2.5);
    var dur = rr(0.9, 1.5) * size;
    /* crack transient */
    var cn = noise('white', 1.2), cf = filt('highpass', 2200, 0.7), cg = gainNode(0);
    perc(cg.gain, t, rr(0.4, 0.7), 0.0008, 0.05);
    cn.connect(cf); cf.connect(cg); cg.connect(d);
    startNoise(cn, t, 0.12);
    /* body: filtered noise sweeping down through a saturator */
    var ns = noise('brown', rr(0.6, 0.95));
    var lp = filt('lowpass', 4000, 0.9);
    lp.frequency.setValueAtTime(rr(3500, 6000), t);
    lp.frequency.exponentialRampToValueAtTime(rr(120, 260), t + dur);
    var g = gainNode(0);
    perc(g.gain, t, rr(0.85, 1.25) * size, 0.004, dur);
    var ws = shaper(8);
    ns.connect(lp); lp.connect(ws); ws.connect(g); g.connect(d);
    startNoise(ns, t, dur + 0.2);
    /* sub boom */
    var lo = osc('sine', rr(78, 115), t), lg = gainNode(0);
    lo.frequency.exponentialRampToValueAtTime(rr(24, 36), t + 0.55 * size);
    perc(lg.gain, t, rr(0.8, 1.2) * size, 0.006, 0.75 * size);
    lo.connect(lg); lg.connect(d); lo.start(t); lo.stop(t + 1.4 * size);
    /* debris tail */
    var i, n = 8 + ri(8);
    for (i = 0; i < n; i++) {
      var tt = t + rr(0.06, 0.7) * size;
      var dn = noise('white', rr(0.8, 1.4)), db = filt('bandpass', rr(800, 4200), rr(3, 9)), dg = gainNode(0);
      perc(dg.gain, tt, rr(0.03, 0.1), 0.001, rr(0.02, 0.07));
      dn.connect(db); db.connect(dg); dg.connect(d);
      startNoise(dn, tt, 0.1);
    }
    finish(v, t + dur + 0.8);
  };

  /* --- ambience ----------------------------------------------------------- */
  SFX.fireCrackle = function (o) {
    o = o || {};
    var v = chain('fireCrackle', 3, o, 0.9); if (!v) return;
    var t = v.t, d = v.dest;
    var n = 3 + ri(5), i;
    for (i = 0; i < n; i++) {
      var tt = t + rnd() * 0.55;
      var ns = noise('white', rr(0.7, 1.5)), bp = filt('bandpass', rr(1200, 5200), rr(4, 12)), g = gainNode(0);
      perc(g.gain, tt, rr(0.04, 0.14), 0.0008, rr(0.008, 0.035));
      ns.connect(bp); bp.connect(g); g.connect(d);
      startNoise(ns, tt, 0.06);
    }
    /* the roar under the crackles */
    var rn = noise('brown', rr(0.4, 0.7)), lp = filt('lowpass', rr(500, 900), 0.7), rg = gainNode(0);
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.linearRampToValueAtTime(rr(0.05, 0.11), t + 0.2);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    rn.connect(lp); lp.connect(rg); rg.connect(d);
    startNoise(rn, t, 0.9);
    finish(v, t + 0.9);
  };

  SFX.thunder = function (o) {
    o = o || {};
    var v = chain('thunder', 8, o, 4.5); if (!v) return;
    var t = v.t, d = v.dest;
    var near = clamp01(o.power === undefined ? rnd() : o.power);
    var dur = lerp(3.4, 1.6, near);
    if (near > 0.55) {
      /* the crack of a close strike */
      var cn = noise('white', 1.1), cf = filt('highpass', rr(1800, 3200), 0.8), cg = gainNode(0);
      perc(cg.gain, t, rr(0.4, 0.7) * near, 0.001, rr(0.09, 0.2));
      cn.connect(cf); cf.connect(cg); cg.connect(d);
      startNoise(cn, t, 0.35);
    }
    /* rolling body: several overlapping low swells */
    var i, n = 3 + ri(3);
    for (i = 0; i < n; i++) {
      var tt = t + (i === 0 ? 0 : rr(0.15, 1.5));
      var ns = noise('brown', rr(0.35, 0.7));
      var lp = filt('lowpass', rr(240, 620), rr(0.6, 1.4));
      var g = gainNode(0);
      var seg = rr(0.7, 1.7);
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(rr(0.18, 0.42) * lerp(0.55, 1.15, near), tt + seg * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + seg);
      ns.connect(lp); lp.connect(g); g.connect(d);
      startNoise(ns, tt, seg + 0.1);
    }
    var lo = osc('sine', rr(30, 46), t), lg = gainNode(0);
    perc(lg.gain, t, rr(0.35, 0.6) * lerp(0.4, 1.1, near), 0.08, dur * 0.6);
    lo.connect(lg); lg.connect(d); lo.start(t); lo.stop(t + dur);
    finish(v, t + dur + 0.5);
  };

  /* --- looping ambience beds (rain / wind / fire) -------------------------- */
  function Bed(name) {
    this.name = name;
    this.gain = null;
    this.nodes = [];
    this.level = 0;
    this.target = 0;
  }
  Bed.prototype.stop = function () {
    var self = this;
    if (this.gain) { ramp(this.gain.gain, 0.0001, 0.8); }
    var nodes = this.nodes, g = this.gain;
    this.nodes = [];
    this.gain = null;
    setTimeout(function () {
      for (var i = 0; i < nodes.length; i++) { try { nodes[i].stop ? nodes[i].stop() : 0; } catch (e) {} try { nodes[i].disconnect(); } catch (e2) {} }
      if (g) { try { g.disconnect(); } catch (e3) {} }
      self.level = 0;
    }, 900);
  };

  var beds = { rain: new Bed('rain'), wind: new Bed('wind'), fire: new Bed('fire') };

  function buildRainBed() {
    var b = beds.rain;
    var g = gainNode(0.0001);
    var hiss = noise('white', 1);
    var hp = filt('highpass', 900, 0.6);
    var lp = filt('lowpass', 7000, 0.7);
    var hg = gainNode(0.34);
    hiss.connect(hp); hp.connect(lp); lp.connect(hg); hg.connect(g);
    hiss.loop = true;
    try { hiss.start(T()); } catch (e) {}
    /* slow filter movement so it never sounds like a static noise file */
    var lfo = osc('sine', 0.07, T()), la = gainNode(1400);
    lfo.connect(la); la.connect(lp.frequency);
    lfo.start(T());
    /* mid-body patter */
    var body = noise('pink', 1), bpF = filt('bandpass', 1500, 0.5), bg = gainNode(0.28);
    body.loop = true; body.connect(bpF); bpF.connect(bg); bg.connect(g);
    try { body.start(T(), rnd()); } catch (e2) {}
    g.connect(nSfx);
    var sendG = gainNode(0.12);
    g.connect(sendG); if (nRevConv.buffer) sendG.connect(nRevIn);
    b.gain = g;
    b.nodes = [hiss, body, lfo];
    return b;
  }

  function buildWindBed() {
    var b = beds.wind;
    var g = gainNode(0.0001);
    var ns = noise('brown', 1);
    ns.loop = true;
    var bp = filt('bandpass', 420, 0.9);
    var lp = filt('lowpass', 2200, 0.6);
    ns.connect(bp); bp.connect(lp); lp.connect(g);
    try { ns.start(T(), rnd()); } catch (e) {}
    /* two slow LFOs on cutoff + level = gusts that never repeat identically */
    var l1 = osc('sine', 0.055, T()), a1 = gainNode(260);
    var l2 = osc('sine', 0.021, T()), a2 = gainNode(150);
    l1.connect(a1); a1.connect(bp.frequency);
    l2.connect(a2); a2.connect(bp.frequency);
    l1.start(T()); l2.start(T());
    var lvl = osc('sine', 0.037, T()), lvlA = gainNode(0.35), lvlG = gainNode(1);
    lvl.connect(lvlA); lvlA.connect(lvlG.gain);
    g.connect(lvlG); lvlG.connect(nSfx);
    lvl.start(T());
    /* a thin whistle on top for exposed, high-wind weather */
    var wh = osc('sine', 1200, T()), whg = gainNode(0.012), whl = osc('sine', 0.09, T()), whla = gainNode(420);
    whl.connect(whla); whla.connect(wh.frequency);
    wh.connect(whg); whg.connect(g);
    wh.start(T()); whl.start(T());
    b.gain = g;
    b.nodes = [ns, l1, l2, lvl, wh, whl];
    return b;
  }

  function buildFireBed() {
    var b = beds.fire;
    var g = gainNode(0.0001);
    var ns = noise('brown', 0.6);
    ns.loop = true;
    var lp = filt('lowpass', 700, 0.8);
    ns.connect(lp); lp.connect(g);
    try { ns.start(T(), rnd()); } catch (e) {}
    var l1 = osc('sine', 0.31, T()), a1 = gainNode(220);
    l1.connect(a1); a1.connect(lp.frequency); l1.start(T());
    g.connect(nSfx);
    b.gain = g;
    b.nodes = [ns, l1];
    return b;
  }

  var BED_BUILD = { rain: buildRainBed, wind: buildWindBed, fire: buildFireBed };

  /** Set a looping bed's level (0 stops it). */
  function setBed(name, level, seconds) {
    if (!ready() || !settings.sfxOn) return;
    var b = beds[name];
    if (!b) return;
    level = clamp01(level);
    b.target = level;
    if (level <= 0.001) { if (b.gain) b.stop(); return; }
    if (!b.gain) {
      try { BED_BUILD[name](); }
      catch (e) { warn('bed:' + name, 'could not build the ' + name + ' bed — skipped.', e); return; }
    }
    if (b.gain) ramp(b.gain.gain, level, seconds === undefined ? 2.0 : seconds);
    b.level = level;
  }

  /* Sparse fire crackle ticker while the fire bed is up. */
  var _crackleAcc = 0;

  /* --- economy / UI ------------------------------------------------------- */
  SFX.coin = function (o) {
    o = o || {};
    var v = chain('coin', 4, o, 0.7); if (!v) return;
    var t = v.t, d = v.dest;
    var n = clamp(o.count || 3, 1, 8), i;
    var base = rr(2100, 2900);
    for (i = 0; i < n; i++) {
      var tt = t + i * rr(0.018, 0.055);
      var f = base * pick([1, 1.19, 1.33, 1.5, 1.78]) * cents(rr(-40, 40));
      var oc = osc('triangle', f, tt), g = gainNode(0);
      perc(g.gain, tt, rr(0.06, 0.14), 0.001, rr(0.06, 0.15));
      var bp = filt('bandpass', f, 9);
      oc.connect(bp); bp.connect(g); g.connect(d);
      oc.start(tt); oc.stop(tt + 0.3);
      var oc2 = osc('sine', f * 2.41, tt), g2 = gainNode(0);
      perc(g2.gain, tt, rr(0.02, 0.06), 0.001, rr(0.03, 0.08));
      oc2.connect(g2); g2.connect(d);
      oc2.start(tt); oc2.stop(tt + 0.2);
    }
    finish(v, t + 0.65);
  };

  SFX.uiClick = function (o) {
    o = o || {};
    var v = chain('uiClick', 5, o, 0.2); if (!v) return;
    var t = v.t, d = v.dest;
    var f = (o.pitch || 1) * rr(1500, 1900);
    var oc = osc('square', f, t), g = gainNode(0);
    oc.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.03);
    perc(g.gain, t, 0.1, 0.0008, 0.035);
    var bp = filt('bandpass', f, 2.5);
    oc.connect(bp); bp.connect(g); g.connect(d);
    oc.start(t); oc.stop(t + 0.08);
    var ns = noise('white', 1), nb = filt('highpass', 3500, 0.7), ng = gainNode(0);
    perc(ng.gain, t, 0.05, 0.0006, 0.012);
    ns.connect(nb); nb.connect(ng); ng.connect(d);
    startNoise(ns, t, 0.04);
    finish(v, t + 0.15);
  };

  SFX.uiBack = function (o) {
    o = o || {}; o.pitch = 0.62;
    SFX.uiClick(o);
  };

  SFX.uiDenied = function (o) {
    o = o || {};
    var v = chain('uiDenied', 6, o, 0.4); if (!v) return;
    var t = v.t, d = v.dest;
    var i;
    for (i = 0; i < 2; i++) {
      var tt = t + i * 0.085;
      var oc = osc('square', 220 - i * 40, tt), g = gainNode(0);
      var lp = filt('lowpass', 1200, 1);
      perc(g.gain, tt, 0.13, 0.002, 0.07);
      oc.connect(lp); lp.connect(g); g.connect(d);
      oc.start(tt); oc.stop(tt + 0.12);
    }
    finish(v, t + 0.3);
  };

  SFX.purchase = function (o) {
    o = o || {};
    var v = chain('purchase', 7, o, 0.9); if (!v) return;
    var t = v.t, d = v.dest;
    /* a short rising 3-note figure + coins */
    var notes = [0, 4, 7], i;
    for (i = 0; i < notes.length; i++) {
      var tt = t + i * 0.065;
      var f = midi(76 + notes[i]);
      var oc = osc('triangle', f, tt), g = gainNode(0);
      var oc2 = osc('sine', f * 2, tt), g2 = gainNode(0);
      perc(g.gain, tt, 0.13, 0.004, 0.22);
      perc(g2.gain, tt, 0.05, 0.003, 0.13);
      oc.connect(g); g.connect(d); oc2.connect(g2); g2.connect(d);
      oc.start(tt); oc.stop(tt + 0.4);
      oc2.start(tt); oc2.stop(tt + 0.3);
    }
    finish(v, t + 0.7);
    SFX.coin({ x: o.x, count: 4, gain: 0.7, delay: 0.02 });
  };

  SFX.levelUp = function (o) {
    o = o || {};
    var v = chain('levelUp', 8, o, 1.6); if (!v) return;
    var t = v.t, d = v.dest;
    var notes = [0, 4, 7, 12, 16], i;
    for (i = 0; i < notes.length; i++) {
      var tt = t + i * 0.075;
      var f = midi(72 + notes[i]);
      var oc = osc('triangle', f, tt), g = gainNode(0);
      perc(g.gain, tt, 0.14, 0.006, 0.5);
      var oc2 = osc('sawtooth', f * cents(6), tt), g2 = gainNode(0);
      var lp = filt('lowpass', 3200, 1.2);
      perc(g2.gain, tt, 0.06, 0.01, 0.45);
      oc.connect(g); g.connect(d);
      oc2.connect(lp); lp.connect(g2); g2.connect(d);
      oc.start(tt); oc.stop(tt + 0.9);
      oc2.start(tt); oc2.stop(tt + 0.9);
    }
    /* shimmer tail */
    var ns = noise('white', 1), bp = filt('bandpass', 5000, 1.2), ng = gainNode(0);
    bp.frequency.exponentialRampToValueAtTime(11000, t + 0.7);
    perc(ng.gain, t + 0.1, 0.05, 0.15, 0.7);
    ns.connect(bp); bp.connect(ng); ng.connect(d);
    startNoise(ns, t + 0.1, 0.9);
    finish(v, t + 1.5);
  };

  SFX.evolve = function (o) {
    o = o || {};
    var v = chain('evolve', 10, o, 3.4); if (!v) return;
    var t = v.t, d = v.dest;
    /* riser */
    var rn = noise('white', 1), rb = filt('bandpass', 400, 3), rg = gainNode(0);
    rb.frequency.setValueAtTime(300, t);
    rb.frequency.exponentialRampToValueAtTime(9000, t + 1.5);
    rg.gain.setValueAtTime(0.0001, t);
    rg.gain.linearRampToValueAtTime(0.18, t + 1.45);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.75);
    rn.connect(rb); rb.connect(rg); rg.connect(d);
    startNoise(rn, t, 1.8);
    /* impact + fanfare on a bright major triad stack */
    var hit = t + 1.5;
    SFX.explosion({ x: o.x, gain: 0.5, size: 0.8, delay: 1.5 });
    var chord = [0, 7, 12, 16, 19, 24], i;
    for (i = 0; i < chord.length; i++) {
      var f = midi(50 + chord[i]);
      var a = osc('sawtooth', f * cents(rr(-8, 8)), hit);
      var b = osc('sawtooth', f * cents(rr(-8, 8)) * 1.004, hit);
      var lp = filt('lowpass', 900, 1.1);
      lp.frequency.exponentialRampToValueAtTime(rr(4200, 6500), hit + 0.35);
      var g = gainNode(0);
      adsr(g.gain, hit, 0.075, 0.05, 0.25, 0.6, 0.7, 0.9);
      a.connect(lp); b.connect(lp); lp.connect(g); g.connect(d);
      a.start(hit); a.stop(hit + 1.9); b.start(hit); b.stop(hit + 1.9);
    }
    /* choir swell */
    for (i = 0; i < 3; i++) {
      vocal(d, hit + 0.05, midi(62 + [0, 7, 12][i]), 1.7, 0.06,
            [[720, 0.9, 8], [1180, 0.5, 9], [2600, 0.2, 10]], true);
    }
    finish(v, t + 3.3);
  };

  SFX.victory = function (o) {
    o = o || {};
    var v = chain('victory', 11, o, 4.0); if (!v) return;
    var t = v.t, d = v.dest;
    var seq = [[0, 0.0, 0.28], [7, 0.28, 0.26], [12, 0.54, 0.5], [12, 1.1, 0.2], [16, 1.3, 0.2], [19, 1.5, 1.6]];
    var i, j;
    for (i = 0; i < seq.length; i++) {
      var tt = t + seq[i][1], dur = seq[i][2];
      var f = midi(57 + seq[i][0]);
      for (j = 0; j < 3; j++) {
        var oo = osc(j === 0 ? 'sawtooth' : (j === 1 ? 'square' : 'sawtooth'), f * (j === 2 ? 2 : 1) * cents(rr(-9, 9)), tt);
        var lp = filt('lowpass', 1200, 1.0);
        lp.frequency.linearRampToValueAtTime(3800, tt + 0.12);
        var g = gainNode(0);
        adsr(g.gain, tt, 0.085 * (j === 2 ? 0.4 : 1), 0.03, 0.12, 0.7, dur, 0.35);
        oo.connect(lp); lp.connect(g); g.connect(d);
        oo.start(tt); oo.stop(tt + dur + 0.5);
      }
    }
    /* timpani hits */
    for (i = 0; i < 4; i++) {
      var kt = t + i * 0.28;
      var ko = osc('sine', rr(78, 96), kt), kg = gainNode(0);
      ko.frequency.exponentialRampToValueAtTime(rr(44, 56), kt + 0.22);
      perc(kg.gain, kt, 0.3, 0.004, 0.34);
      ko.connect(kg); kg.connect(d); ko.start(kt); ko.stop(kt + 0.6);
    }
    /* crowd */
    SFX.warCry({ x: o.x, count: 24, gain: 0.6, delay: 1.2 });
    finish(v, t + 3.9);
  };

  SFX.defeat = function (o) {
    o = o || {};
    var v = chain('defeat', 11, o, 4.2); if (!v) return;
    var t = v.t, d = v.dest;
    /* a descending minor figure, low and slow, with a sub drop */
    var seq = [[0, 0.0, 0.7], [-3, 0.65, 0.7], [-5, 1.3, 0.9], [-12, 2.1, 1.8]];
    var i, j;
    for (i = 0; i < seq.length; i++) {
      var tt = t + seq[i][1], dur = seq[i][2];
      var f = midi(52 + seq[i][0]);
      for (j = 0; j < 2; j++) {
        var oo = osc('sawtooth', f * cents(rr(-14, 14)) * (j ? 1.003 : 1), tt);
        var lp = filt('lowpass', 900, 0.9);
        lp.frequency.exponentialRampToValueAtTime(380, tt + dur);
        var g = gainNode(0);
        adsr(g.gain, tt, 0.09, 0.1, 0.3, 0.6, dur, 0.7);
        oo.connect(lp); lp.connect(g); g.connect(d);
        oo.start(tt); oo.stop(tt + dur + 0.9);
      }
    }
    var lo = osc('sine', 58, t + 2.1), lg = gainNode(0);
    lo.frequency.exponentialRampToValueAtTime(24, t + 3.6);
    perc(lg.gain, t + 2.1, 0.42, 0.06, 1.6);
    lo.connect(lg); lg.connect(d); lo.start(t + 2.1); lo.stop(t + 4.0);
    /* a single funeral-drum thud */
    var kt = t + 0.02;
    var ko = osc('sine', 82, kt), kg = gainNode(0);
    ko.frequency.exponentialRampToValueAtTime(40, kt + 0.4);
    perc(kg.gain, kt, 0.34, 0.006, 0.6);
    ko.connect(kg); kg.connect(d); ko.start(kt); ko.stop(kt + 1.0);
    finish(v, t + 4.1);
  };

  /* --- gameplay telegraphs ------------------------------------------------ */
  SFX.cueWave = function (o) {
    o = o || {};
    var v = chain('cueWave', 11, o, 2.6); if (!v) return;
    var t = v.t, d = v.dest;
    /* two war horns a fifth apart — unmistakable, era-agnostic */
    var i;
    for (i = 0; i < 2; i++) {
      var tt = t + i * 0.42;
      var f = midi(43 + i * 7);
      var a = osc('sawtooth', f * 0.995, tt), b = osc('sawtooth', f * 1.006, tt);
      var lp = filt('lowpass', 700, 2.0);
      lp.frequency.linearRampToValueAtTime(2600, tt + 0.18);
      lp.frequency.linearRampToValueAtTime(1200, tt + 0.9);
      var g = gainNode(0);
      adsr(g.gain, tt, 0.16, 0.07, 0.14, 0.75, 0.55, 0.45);
      a.connect(lp); b.connect(lp); lp.connect(g); g.connect(d);
      a.start(tt); a.stop(tt + 1.5); b.start(tt); b.stop(tt + 1.5);
      /* breath noise makes it a horn, not a synth */
      var ns = noise('pink', 1), nb = filt('bandpass', f * 6, 1.2), ng = gainNode(0);
      perc(ng.gain, tt, 0.035, 0.05, 0.5);
      ns.connect(nb); nb.connect(ng); ng.connect(d);
      startNoise(ns, tt, 0.7);
    }
    finish(v, t + 2.5);
  };

  SFX.cueBossWindup = function (o) {
    o = o || {};
    var v = chain('cueBossWindup', 12, o, 2.2); if (!v) return;
    var t = v.t, d = v.dest;
    var dur = clamp(o.time || 1.2, 0.4, 3.0);
    /* rising dissonant pair + a metallic tick that accelerates */
    var a = osc('sawtooth', 90, t), b = osc('sawtooth', 90 * 1.06, t);
    a.frequency.exponentialRampToValueAtTime(320, t + dur);
    b.frequency.exponentialRampToValueAtTime(345, t + dur);
    var lp = filt('lowpass', 600, 3.5);
    lp.frequency.exponentialRampToValueAtTime(4200, t + dur);
    var g = gainNode(0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.2, t + dur * 0.92);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.16);
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(d);
    a.start(t); a.stop(t + dur + 0.25); b.start(t); b.stop(t + dur + 0.25);
    /* accelerating ticks: reads as "it is about to happen" */
    var tt = 0, gap = dur * 0.26, guard = 0;
    while (tt < dur && guard++ < 40) {
      var ct = t + tt;
      var cn = noise('white', 1), cb = filt('bandpass', rr(2600, 4200), 8), cg = gainNode(0);
      perc(cg.gain, ct, 0.09, 0.0008, 0.02);
      cn.connect(cb); cb.connect(cg); cg.connect(d);
      startNoise(cn, ct, 0.04);
      tt += gap;
      gap *= 0.72;
      if (gap < 0.035) gap = 0.035;
    }
    finish(v, t + dur + 0.5);
  };

  SFX.cueGateAttack = function (o) {
    o = o || {};
    var v = chain('cueGateAttack', 10, o, 1.4); if (!v) return;
    var t = v.t, d = v.dest;
    /* a dull bell-ish alarm, two strikes */
    var i;
    for (i = 0; i < 2; i++) {
      var tt = t + i * 0.32;
      var f = 300 * (i ? 0.84 : 1);
      var j;
      for (j = 0; j < 4; j++) {
        var oo = osc('triangle', f * METAL_RATIOS[j], tt), g = gainNode(0);
        perc(g.gain, tt, 0.11 * Math.pow(0.6, j), 0.002, 0.7 - j * 0.1);
        oo.connect(g); g.connect(d);
        oo.start(tt); oo.stop(tt + 0.9);
      }
    }
    finish(v, t + 1.3);
  };

  SFX.cueLowHealth = function (o) {
    o = o || {};
    var v = chain('cueLowHealth', 12, o, 1.6); if (!v) return;
    var t = v.t, d = v.dest;
    /* slow heartbeat + a sour minor second: instantly reads as "danger" */
    var i;
    for (i = 0; i < 2; i++) {
      var tt = t + i * 0.26;
      var lo = osc('sine', 62, tt), lg = gainNode(0);
      lo.frequency.exponentialRampToValueAtTime(34, tt + 0.16);
      perc(lg.gain, tt, i ? 0.24 : 0.34, 0.005, 0.24);
      lo.connect(lg); lg.connect(d); lo.start(tt); lo.stop(tt + 0.45);
    }
    var a = osc('sawtooth', midi(58), t), b = osc('sawtooth', midi(59), t);
    var lp = filt('lowpass', 900, 2);
    var g = gainNode(0);
    adsr(g.gain, t, 0.055, 0.25, 0.25, 0.6, 0.5, 0.6);
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(d);
    a.start(t); a.stop(t + 1.5); b.start(t); b.stop(t + 1.5);
    finish(v, t + 1.5);
  };

  SFX.cuePowerReady = function (o) {
    o = o || {};
    var v = chain('cuePowerReady', 11, o, 1.4); if (!v) return;
    var t = v.t, d = v.dest;
    /* bright ascending perfect-fifth ping with a shimmer — "you have a tool now" */
    var notes = [0, 7, 12], i;
    for (i = 0; i < notes.length; i++) {
      var tt = t + i * 0.06;
      var f = midi(81 + notes[i]);
      var oo = osc('sine', f, tt), g = gainNode(0);
      perc(g.gain, tt, 0.11, 0.003, 0.55);
      var oo2 = osc('triangle', f * 2.005, tt), g2 = gainNode(0);
      perc(g2.gain, tt, 0.035, 0.003, 0.3);
      oo.connect(g); g.connect(d); oo2.connect(g2); g2.connect(d);
      oo.start(tt); oo.stop(tt + 0.9); oo2.start(tt); oo2.stop(tt + 0.7);
    }
    var ns = noise('white', 1), bp = filt('bandpass', 6000, 2), ng = gainNode(0);
    bp.frequency.exponentialRampToValueAtTime(12000, t + 0.5);
    perc(ng.gain, t, 0.03, 0.02, 0.5);
    ns.connect(bp); bp.connect(ng); ng.connect(d);
    startNoise(ns, t, 0.6);
    finish(v, t + 1.3);
  };

  SFX.powerCast = function (o) {
    o = o || {};
    var kind = o.type || 'meteor';
    if (kind === 'meteor') {
      SFX.explosion({ x: o.x, size: 1.7, gain: 1.0, delay: 0.5 });
      var v = chain('powerCast', 11, o, 0.8); if (!v) return;
      var t = v.t, d = v.dest;
      var ns = noise('brown', 0.8), bp = filt('bandpass', 300, 1.2), g = gainNode(0);
      bp.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      ns.connect(bp); bp.connect(g); g.connect(d);
      startNoise(ns, t, 0.65);
      finish(v, t + 0.7);
    } else if (kind === 'freeze') {
      var v2 = chain('powerCast', 11, o, 1.6); if (!v2) return;
      var t2 = v2.t, d2 = v2.dest;
      var a = osc('sine', midi(88), t2), g2 = gainNode(0);
      a.frequency.exponentialRampToValueAtTime(midi(64), t2 + 0.5);
      perc(g2.gain, t2, 0.18, 0.004, 0.6);
      a.connect(g2); g2.connect(d2); a.start(t2); a.stop(t2 + 0.9);
      var i;
      for (i = 0; i < 10; i++) {
        var tt = t2 + rr(0.02, 0.55);
        var cn = noise('white', 1), cb = filt('bandpass', rr(4000, 11000), 10), cg = gainNode(0);
        perc(cg.gain, tt, rr(0.02, 0.06), 0.001, rr(0.02, 0.08));
        cn.connect(cb); cb.connect(cg); cg.connect(d2);
        startNoise(cn, tt, 0.12);
      }
      var lo = osc('sine', 70, t2), lg = gainNode(0);
      lo.frequency.exponentialRampToValueAtTime(30, t2 + 0.5);
      perc(lg.gain, t2, 0.3, 0.005, 0.7);
      lo.connect(lg); lg.connect(d2); lo.start(t2); lo.stop(t2 + 1.2);
      finish(v2, t2 + 1.5);
    } else if (kind === 'rally') {
      SFX.warCry({ x: o.x, count: 22, gain: 0.85 });
      SFX.cueWave({ x: o.x, gain: 0.5, delay: 0.05 });
    } else {
      SFX.gateSlam({ x: o.x, gain: 0.7 });
      SFX.marchBed({ x: o.x, count: 24, gain: 0.9, delay: 0.35 });
    }
  };

  /* ---------------------------------------------------------------------------
   * 8. Public play()
   * ------------------------------------------------------------------------ */
  var _q = [];   // pre-unlock queue (bounded)

  function play(name, opts) {
    if (!ok) { if (!init()) return false; }
    if (!settings.sfxOn || settings.muted) return false;
    var fn = SFX[name];
    if (!fn) { warn('sfx:' + name, 'unknown sfx "' + name + '" — ignored.'); return false; }
    if (!unlocked) {
      /* keep only the newest few so a pre-gesture battle doesn't dogpile */
      if (_q.length < 6) _q.push({ n: name, o: opts });
      return false;
    }
    if (ctx.state !== 'running') return false;
    try {
      if (opts && opts.delay) {
        /* delay is handled inside chain() via v.t; nothing extra to do */
      }
      fn(opts);
    } catch (e) {
      warn('sfx:play:' + name, 'sfx "' + name + '" threw — disabled for this call.', e);
      return false;
    }
    return true;
  }

  function flushQueue() {
    var q = _q; _q = [];
    for (var i = 0; i < q.length; i++) { play(q[i].n, q[i].o); }
  }

  /* ---------------------------------------------------------------------------
   * 9. Adaptive music
   * ------------------------------------------------------------------------ */
  var SCALES = {
    minorPent:  [0, 3, 5, 7, 10],
    majorPent:  [0, 2, 4, 7, 9],
    aeolian:    [0, 2, 3, 5, 7, 8, 10],
    dorian:     [0, 2, 3, 5, 7, 9, 10],
    phrygian:   [0, 1, 3, 5, 7, 8, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    hirajoshi:  [0, 2, 3, 7, 8],
    lydian:     [0, 2, 4, 6, 7, 9, 11]
  };

  /* One entry per era in AOW.ERAS order. */
  var ERA_MUSIC = [
    { /* Stone — tribal */
      name: 'tribal', root: 45, scale: 'minorPent', bpm: 92,
      lead: 'flute', pad: 'drone', bass: 'sub', drums: 'tribal',
      brass: false, choir: 0.35, swing: 0.06, drumGain: 1.25
    },
    { /* Bronze — greek lyre */
      name: 'greek', root: 50, scale: 'dorian', bpm: 100,
      lead: 'pluck', pad: 'strings', bass: 'pluckbass', drums: 'frame',
      brass: false, choir: 0.2, swing: 0.02, drumGain: 0.9
    },
    { /* Iron — roman brass */
      name: 'roman', root: 43, scale: 'mixolydian', bpm: 108,
      lead: 'horn', pad: 'strings', bass: 'sub', drums: 'march',
      brass: true, choir: 0.25, swing: 0, drumGain: 1.05
    },
    { /* Medieval — viking horns */
      name: 'viking', root: 41, scale: 'aeolian', bpm: 96,
      lead: 'horn', pad: 'strings', bass: 'sub', drums: 'war',
      brass: true, choir: 0.5, swing: 0, drumGain: 1.2
    },
    { /* Gunpowder — japanese koto + taiko */
      name: 'japan', root: 47, scale: 'hirajoshi', bpm: 88,
      lead: 'pluck', pad: 'strings', bass: 'sub', drums: 'taiko',
      brass: false, choir: 0.3, swing: 0.04, drumGain: 1.35
    },
    { /* Industrial — martial strings + brass */
      name: 'industrial', root: 40, scale: 'phrygian', bpm: 112,
      lead: 'horn', pad: 'strings', bass: 'sub', drums: 'march',
      brass: true, choir: 0.2, swing: 0, drumGain: 1.0
    },
    { /* Modern — hybrid */
      name: 'modern', root: 38, scale: 'aeolian', bpm: 124,
      lead: 'synth', pad: 'hybrid', bass: 'saw', drums: 'hybrid',
      brass: true, choir: 0.15, swing: 0, drumGain: 1.1
    },
    { /* Future — synth */
      name: 'future', root: 36, scale: 'lydian', bpm: 132,
      lead: 'synth', pad: 'hybrid', bass: 'saw', drums: 'electro',
      brass: false, choir: 0.25, swing: 0, drumGain: 1.0
    }
  ];

  /* Intensity states -> target layer mix. */
  var MUSIC_STATES = {
    calm:      { i: 0.12, drums: 0.20, bass: 0.35, pad: 0.85, lead: 0.55, brass: 0.00, choir: 0.20, tempo: 0.86 },
    building:  { i: 0.38, drums: 0.60, bass: 0.65, pad: 0.75, lead: 0.60, brass: 0.22, choir: 0.28, tempo: 0.95 },
    combat:    { i: 0.68, drums: 1.00, bass: 0.95, pad: 0.55, lead: 0.70, brass: 0.70, choir: 0.40, tempo: 1.00 },
    desperate: { i: 0.92, drums: 1.15, bass: 1.05, pad: 0.40, lead: 0.55, brass: 1.00, choir: 0.85, tempo: 1.07 },
    victory:   { i: 0.55, drums: 0.75, bass: 0.70, pad: 0.85, lead: 0.90, brass: 0.85, choir: 0.75, tempo: 0.98 },
    defeat:    { i: 0.20, drums: 0.10, bass: 0.45, pad: 1.00, lead: 0.30, brass: 0.10, choir: 0.90, tempo: 0.78 },
    menu:      { i: 0.15, drums: 0.15, bass: 0.40, pad: 0.95, lead: 0.60, brass: 0.05, choir: 0.35, tempo: 0.85 }
  };

  var music = {
    running: false,
    era: 0,
    cfg: ERA_MUSIC[0],
    state: 'menu',
    target: MUSIC_STATES.menu,
    layerGain: {},         // GainNodes
    layerCur: {},          // current gain values (for bar-locked crossfade)
    bpm: 92,
    bar: 0,
    beat: 0,
    nextNoteTime: 0,
    timer: 0,
    bus: null,
    chordIdx: 0,
    pendingEra: -1,
    pendingState: null,
    fill: false
  };

  var LAYERS = ['drums', 'bass', 'pad', 'lead', 'brass', 'choir'];
  /* chord degrees walked per bar (scale-degree offsets, not semitones) */
  var PROGRESSIONS = [
    [0, 5, 3, 4],
    [0, 3, 4, 4],
    [0, 6, 5, 4],
    [0, 4, 5, 3]
  ];
  var progression = PROGRESSIONS[0];

  function scaleNote(cfg, degree, octave) {
    var sc = SCALES[cfg.scale] || SCALES.aeolian;
    var n = sc.length;
    var d = ((degree % n) + n) % n;
    var oct = Math.floor(degree / n) + (octave || 0);
    return midi(cfg.root + sc[d] + oct * 12);
  }

  function buildMusicBus() {
    music.bus = gainNode(1);
    music.bus.connect(nMusic);
    var i;
    for (i = 0; i < LAYERS.length; i++) {
      var g = gainNode(0.0001);
      g.connect(music.bus);
      music.layerGain[LAYERS[i]] = g;
      music.layerCur[LAYERS[i]] = 0.0001;
    }
    /* a little glue reverb on the whole score */
    if (nRevConv.buffer) {
      var s = gainNode(0.22);
      music.bus.connect(s);
      s.connect(nRevIn);
    }
  }

  function layerDest(name) { return music.layerGain[name] || music.bus; }

  /* --- instruments -------------------------------------------------------- */
  function mDrum(kind, t, level, dest) {
    var g, o, ns, f;
    if (kind === 'kick' || kind === 'taiko') {
      var f0 = kind === 'taiko' ? rr(86, 104) : rr(64, 78);
      o = osc('sine', f0, t); g = gainNode(0);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.42, t + (kind === 'taiko' ? 0.22 : 0.13));
      perc(g.gain, t, level * rr(0.85, 1.1), 0.003, kind === 'taiko' ? 0.38 : 0.22);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.6);
      if (kind === 'taiko') {
        ns = noise('brown', rr(0.8, 1.2)); f = filt('bandpass', rr(220, 420), 1.2);
        var ng = gainNode(0);
        perc(ng.gain, t, level * rr(0.25, 0.45), 0.002, 0.14);
        ns.connect(f); f.connect(ng); ng.connect(dest);
        startNoise(ns, t, 0.28);
      }
    } else if (kind === 'snare' || kind === 'frame') {
      ns = noise('white', rr(0.85, 1.2));
      f = filt(kind === 'frame' ? 'bandpass' : 'highpass', kind === 'frame' ? rr(420, 700) : rr(1400, 2200), kind === 'frame' ? 1.1 : 0.8);
      g = gainNode(0);
      perc(g.gain, t, level * rr(0.7, 1.05), 0.0015, kind === 'frame' ? rr(0.09, 0.15) : rr(0.11, 0.19));
      ns.connect(f); f.connect(g); g.connect(dest);
      startNoise(ns, t, 0.3);
      o = osc('triangle', rr(180, 240), t); var g2 = gainNode(0);
      perc(g2.gain, t, level * 0.35, 0.002, 0.08);
      o.connect(g2); g2.connect(dest); o.start(t); o.stop(t + 0.2);
    } else if (kind === 'tom') {
      var ft = rr(120, 220);
      o = osc('sine', ft, t); g = gainNode(0);
      o.frequency.exponentialRampToValueAtTime(ft * 0.55, t + 0.2);
      perc(g.gain, t, level * rr(0.6, 0.95), 0.003, rr(0.2, 0.32));
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.5);
      ns = noise('pink', 1); f = filt('bandpass', ft * 3, 1.4); var ng2 = gainNode(0);
      perc(ng2.gain, t, level * 0.2, 0.002, 0.1);
      ns.connect(f); f.connect(ng2); ng2.connect(dest);
      startNoise(ns, t, 0.2);
    } else if (kind === 'hat') {
      ns = noise('white', rr(0.9, 1.4));
      f = filt('highpass', rr(6000, 9000), 0.8);
      g = gainNode(0);
      perc(g.gain, t, level * rr(0.18, 0.34), 0.0008, rr(0.02, 0.055));
      ns.connect(f); f.connect(g); g.connect(dest);
      startNoise(ns, t, 0.1);
    } else if (kind === 'clap') {
      var i;
      for (i = 0; i < 3; i++) {
        var tt = t + i * 0.011;
        ns = noise('white', 1); f = filt('bandpass', rr(1400, 2200), 1.6); g = gainNode(0);
        perc(g.gain, tt, level * rr(0.3, 0.5), 0.001, rr(0.03, 0.07));
        ns.connect(f); f.connect(g); g.connect(dest);
        startNoise(ns, tt, 0.12);
      }
    } else if (kind === 'noiseperc') {
      ns = noise('white', rr(0.6, 1.6));
      f = filt('bandpass', rr(900, 5000), rr(2, 7));
      g = gainNode(0);
      perc(g.gain, t, level * rr(0.2, 0.4), 0.001, rr(0.03, 0.12));
      ns.connect(f); f.connect(g); g.connect(dest);
      startNoise(ns, t, 0.2);
    }
  }

  function mBass(kind, t, freq, dur, level, dest) {
    var g = gainNode(0), lp = filt('lowpass', kind === 'saw' ? 900 : 500, kind === 'saw' ? 4 : 1.2);
    var o, o2;
    if (kind === 'saw') {
      o = osc('sawtooth', freq, t); o2 = osc('sawtooth', freq * cents(9), t);
      lp.frequency.setValueAtTime(rr(1400, 2200), t);
      lp.frequency.exponentialRampToValueAtTime(rr(320, 620), t + dur * 0.8);
      o.connect(lp); o2.connect(lp);
      o2.start(t); o2.stop(t + dur + 0.15);
    } else if (kind === 'pluckbass') {
      o = osc('triangle', freq, t);
      lp.frequency.setValueAtTime(rr(1200, 1900), t);
      lp.frequency.exponentialRampToValueAtTime(300, t + dur * 0.5);
      o.connect(lp);
    } else { /* sub */
      o = osc('sine', freq, t);
      o2 = osc('triangle', freq * 2, t);
      var sg = gainNode(0.22);
      o.connect(lp); o2.connect(sg); sg.connect(lp);
      o2.start(t); o2.stop(t + dur + 0.15);
    }
    lp.connect(g); g.connect(dest);
    adsr(g.gain, t, level, 0.012, 0.09, 0.72, Math.max(0.02, dur - 0.14), 0.12);
    o.start(t); o.stop(t + dur + 0.2);
  }

  function mPluck(t, freq, dur, level, dest, bright) {
    /* lyre / koto: bright triangle+saw blend, fast decay, tiny detuned twin */
    var i;
    for (i = 0; i < 2; i++) {
      var o = osc(i ? 'sawtooth' : 'triangle', freq * (i ? cents(rr(3, 11)) : 1), t);
      var bp = filt('lowpass', bright ? rr(3800, 6200) : rr(2200, 3600), 1.4);
      bp.frequency.exponentialRampToValueAtTime(rr(700, 1400), t + dur * 0.8);
      var g = gainNode(0);
      perc(g.gain, t, level * (i ? 0.35 : 1), 0.003, dur);
      o.connect(bp); bp.connect(g); g.connect(dest);
      o.start(t); o.stop(t + dur + 0.15);
    }
    /* pick noise */
    var ns = noise('white', 1), f = filt('bandpass', freq * 5, 3), ng = gainNode(0);
    perc(ng.gain, t, level * 0.22, 0.0008, 0.02);
    ns.connect(f); f.connect(ng); ng.connect(dest);
    startNoise(ns, t, 0.05);
  }

  function mFlute(t, freq, dur, level, dest) {
    var o = osc('sine', freq, t);
    var g = gainNode(0);
    adsr(g.gain, t, level, dur * 0.22, dur * 0.12, 0.8, dur * 0.5, dur * 0.3);
    /* breath is most of what makes a bone flute a bone flute */
    var ns = noise('pink', 1), bp = filt('bandpass', freq * 2.1, 2.2), ng = gainNode(0);
    adsr(ng.gain, t, level * 0.5, dur * 0.2, dur * 0.15, 0.7, dur * 0.5, dur * 0.3);
    ns.connect(bp); bp.connect(ng); ng.connect(dest);
    startNoise(ns, t, dur + 0.2);
    var lfo = osc('sine', rr(4.2, 6.2), t), la = gainNode(freq * 0.011);
    lfo.connect(la); la.connect(o.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.2);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.2);
  }

  function mHorn(t, freq, dur, level, dest) {
    var a = osc('sawtooth', freq * cents(rr(-6, 6)), t);
    var b = osc('sawtooth', freq * cents(rr(-6, 6)) * 1.004, t);
    var lp = filt('lowpass', 500, 2.2);
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(rr(1800, 2800), t + Math.min(0.22, dur * 0.4));
    lp.frequency.linearRampToValueAtTime(rr(900, 1400), t + dur);
    var g = gainNode(0);
    adsr(g.gain, t, level, 0.06, 0.1, 0.82, Math.max(0.02, dur - 0.3), 0.25);
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(dest);
    a.start(t); a.stop(t + dur + 0.35); b.start(t); b.stop(t + dur + 0.35);
    var ns = noise('pink', 1), nb = filt('bandpass', freq * 4.5, 1.1), ng = gainNode(0);
    perc(ng.gain, t, level * 0.13, 0.04, dur * 0.7);
    ns.connect(nb); nb.connect(ng); ng.connect(dest);
    startNoise(ns, t, dur + 0.2);
  }

  function mBrass(t, freq, dur, level, dest) {
    var i;
    for (i = 0; i < 3; i++) {
      var o = osc('sawtooth', freq * cents(rr(-11, 11)) * (i === 2 ? 2 : 1), t);
      var lp = filt('lowpass', 600, 1.8);
      lp.frequency.setValueAtTime(500, t);
      lp.frequency.linearRampToValueAtTime(rr(2600, 4000), t + 0.09);
      lp.frequency.linearRampToValueAtTime(rr(1200, 1800), t + dur);
      var g = gainNode(0);
      adsr(g.gain, t, level * (i === 2 ? 0.3 : 1), 0.035, 0.08, 0.85, Math.max(0.02, dur - 0.2), 0.18);
      o.connect(lp); lp.connect(g); g.connect(dest);
      o.start(t); o.stop(t + dur + 0.25);
    }
  }

  function mStrings(t, freq, dur, level, dest) {
    var i;
    for (i = 0; i < 4; i++) {
      var o = osc('sawtooth', freq * cents(rr(-14, 14)), t);
      var lp = filt('lowpass', rr(1700, 2900), 0.9);
      var g = gainNode(0);
      adsr(g.gain, t, level * 0.42, rr(0.18, 0.4), 0.25, 0.8, Math.max(0.05, dur - 0.7), rr(0.5, 0.9));
      o.connect(lp); lp.connect(g); g.connect(dest);
      o.start(t); o.stop(t + dur + 1.0);
      var lfo = osc('sine', rr(3.4, 5.6), t), la = gainNode(freq * rr(0.002, 0.005));
      lfo.connect(la); la.connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 1.0);
    }
  }

  function mDrone(t, freq, dur, level, dest) {
    var i;
    for (i = 0; i < 3; i++) {
      var o = osc(i ? 'sawtooth' : 'triangle', freq * cents(rr(-9, 9)) * (i === 2 ? 1.5 : 1), t);
      var lp = filt('lowpass', rr(700, 1300), 0.8);
      var g = gainNode(0);
      adsr(g.gain, t, level * 0.4, rr(0.6, 1.3), 0.4, 0.85, Math.max(0.1, dur - 1.6), rr(0.8, 1.5));
      o.connect(lp); lp.connect(g); g.connect(dest);
      o.start(t); o.stop(t + dur + 1.6);
    }
  }

  function mHybridPad(t, freq, dur, level, dest) {
    var i;
    for (i = 0; i < 4; i++) {
      var o = osc(i % 2 ? 'sawtooth' : 'square', freq * cents(rr(-16, 16)) * (i === 3 ? 2 : 1), t);
      var lp = filt('lowpass', 800, 3.0);
      lp.frequency.setValueAtTime(rr(500, 900), t);
      lp.frequency.linearRampToValueAtTime(rr(2200, 3800), t + dur * 0.6);
      lp.frequency.linearRampToValueAtTime(rr(700, 1100), t + dur);
      var g = gainNode(0);
      adsr(g.gain, t, level * 0.3, rr(0.25, 0.6), 0.3, 0.8, Math.max(0.05, dur - 1.0), rr(0.5, 1.0));
      o.connect(lp); lp.connect(g); g.connect(dest);
      o.start(t); o.stop(t + dur + 1.2);
    }
  }

  function mSynthLead(t, freq, dur, level, dest) {
    var a = osc('square', freq, t), b = osc('sawtooth', freq * cents(7), t);
    var lp = filt('lowpass', 1200, 7);
    lp.frequency.setValueAtTime(rr(3000, 5200), t);
    lp.frequency.exponentialRampToValueAtTime(rr(500, 1100), t + dur);
    var g = gainNode(0);
    adsr(g.gain, t, level, 0.008, 0.07, 0.6, Math.max(0.02, dur - 0.14), 0.12);
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(dest);
    a.start(t); a.stop(t + dur + 0.2); b.start(t); b.stop(t + dur + 0.2);
  }

  function mChoir(t, freq, dur, level, dest) {
    vocal(dest, t, freq, dur, level, [[rr(680, 800), 0.9, 9], [rr(1080, 1300), 0.45, 10], [rr(2500, 2900), 0.18, 11]], true);
  }

  function leadVoice(cfg, t, freq, dur, level, dest) {
    switch (cfg.lead) {
      case 'flute': mFlute(t, freq, dur, level, dest); break;
      case 'pluck': mPluck(t, freq, dur, level, dest, cfg.name === 'japan'); break;
      case 'horn':  mHorn(t, freq, dur, level, dest); break;
      case 'synth': mSynthLead(t, freq, dur, level, dest); break;
      default:      mPluck(t, freq, dur, level, dest, false);
    }
  }

  function padVoice(cfg, t, freq, dur, level, dest) {
    switch (cfg.pad) {
      case 'drone':   mDrone(t, freq, dur, level, dest); break;
      case 'strings': mStrings(t, freq, dur, level, dest); break;
      case 'hybrid':  mHybridPad(t, freq, dur, level, dest); break;
      default:        mStrings(t, freq, dur, level, dest);
    }
  }

  /* --- patterns ----------------------------------------------------------- */
  /* 16-slot patterns, one bar of 4/4. 0 = rest. */
  var DRUM_PATTERNS = {
    tribal: {
      kick:  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      tom:   [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hat:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    frame: {
      kick:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      frame: [0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1],
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hat:   [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]
    },
    march: {
      kick:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0],
      hat:   [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
      tom:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0]
    },
    war: {
      kick:  [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0],
      tom:   [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hat:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    taiko: {
      taiko: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0],
      tom:   [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      hat:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    hybrid: {
      kick:  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      clap:  [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hat:   [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0],
      noiseperc: [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]
    },
    electro: {
      kick:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
      clap:  [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hat:   [0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
      noiseperc: [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0]
    }
  };

  var BASS_PATTERNS = [
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0]
  ];

  function slotTime(slot) {
    var spb = 60 / music.bpm;
    var t = music.barStart + slot * (spb / 4);
    /* swing the off-8ths a touch for the eras that want it */
    if (music.cfg.swing && (slot % 2) === 1) t += (spb / 4) * music.cfg.swing;
    return t;
  }

  function scheduleBar() {
    var cfg = music.cfg;
    var spb = 60 / music.bpm;
    var barDur = spb * 4;
    var deg = progression[music.bar % progression.length];
    var intensity = music.target.i;
    var i, slot;

    /* ---- drums ---- */
    var dp = DRUM_PATTERNS[cfg.drums] || DRUM_PATTERNS.march;
    var dDest = layerDest('drums');
    var kk;
    for (kk in dp) {
      if (!Object.prototype.hasOwnProperty.call(dp, kk)) continue;
      var pat = dp[kk];
      for (slot = 0; slot < 16; slot++) {
        if (!pat[slot]) continue;
        /* sparser when calm: drop off-beats at low intensity */
        if (intensity < 0.3 && (slot % 4) !== 0 && rnd() > 0.35) continue;
        if (intensity < 0.55 && kk === 'hat' && (slot % 2) === 1 && rnd() > 0.5) continue;
        var lvl = 0.28 * cfg.drumGain * rr(0.85, 1.12) * (slot % 4 === 0 ? 1.12 : 0.86);
        mDrum(kk, slotTime(slot) + rr(-0.006, 0.006), lvl, dDest);
      }
    }
    /* a fill on the last bar of each 4-bar phrase when the fight is hot */
    if (music.fill || (intensity > 0.6 && (music.bar % 4) === 3)) {
      music.fill = false;
      for (i = 0; i < 6; i++) {
        var ft = slotTime(12) + i * (spb / 8) * rr(0.85, 1.15);
        mDrum(cfg.drums === 'taiko' ? 'taiko' : 'tom', ft, 0.26 * cfg.drumGain * (0.6 + i * 0.09), dDest);
      }
    }

    /* ---- bass ---- */
    var bp = BASS_PATTERNS[intensity > 0.75 ? 2 : (intensity > 0.45 ? 1 : (intensity > 0.2 ? 0 : 3))];
    var bDest = layerDest('bass');
    for (slot = 0; slot < 16; slot++) {
      if (!bp[slot]) continue;
      var bd = deg + (slot === 8 && intensity > 0.6 ? 2 : 0);
      var bf = scaleNote(cfg, bd, -2);
      mBass(cfg.bass, slotTime(slot), bf, (spb / 4) * rr(1.4, 2.4), 0.3 * rr(0.9, 1.1), bDest);
    }

    /* ---- pad ---- */
    var pDest = layerDest('pad');
    var chordTones = [0, 2, 4];
    for (i = 0; i < chordTones.length; i++) {
      padVoice(cfg, music.barStart + rr(0, 0.03), scaleNote(cfg, deg + chordTones[i], 0), barDur * 0.98, 0.18, pDest);
    }

    /* ---- brass stabs ---- */
    if (cfg.brass && music.target.brass > 0.05) {
      var brDest = layerDest('brass');
      var stabs = intensity > 0.8 ? [0, 6, 8, 12] : (intensity > 0.55 ? [0, 8] : [0]);
      for (i = 0; i < stabs.length; i++) {
        var bt = slotTime(stabs[i]) + rr(-0.008, 0.008);
        var j;
        for (j = 0; j < 3; j++) {
          mBrass(bt, scaleNote(cfg, deg + chordTones[j], j === 2 ? 1 : 0), spb * rr(0.55, 0.95), 0.11, brDest);
        }
      }
    }

    /* ---- choir ---- */
    if (music.target.choir > 0.05) {
      var cDest = layerDest('choir');
      for (i = 0; i < 3; i++) {
        mChoir(music.barStart + rr(0, 0.08), scaleNote(cfg, deg + chordTones[i], i === 2 ? 1 : 0), barDur * rr(0.85, 1.0), 0.05, cDest);
      }
    }

    /* ---- lead melody: a generated phrase that reuses the bar's chord ---- */
    if (music.target.lead > 0.05) {
      var lDest = layerDest('lead');
      var notes = intensity > 0.6 ? 6 : (intensity > 0.3 ? 4 : 3);
      var cur = deg + (rnd() < 0.5 ? 0 : 2);
      var slotCursor = 0;
      for (i = 0; i < notes; i++) {
        var step = pick([1, 2, 2, 3, 4]);
        slotCursor += step;
        if (slotCursor > 15) break;
        /* stepwise motion with occasional leaps sounds composed, not random */
        cur += pick([-2, -1, -1, 0, 1, 1, 2, 3]);
        if (cur > deg + 9) cur -= 7;
        if (cur < deg - 4) cur += 7;
        var lf = scaleNote(cfg, cur, cfg.lead === 'synth' ? 0 : 1);
        var ldur = (spb / 4) * step * rr(0.7, 1.05);
        leadVoice(cfg, slotTime(slotCursor) + rr(-0.01, 0.01), lf, ldur, 0.11 * rr(0.85, 1.15), lDest);
      }
    }

    /* ---- bar-locked cross-fade of the layer mix ---- */
    var fadeT = music.barStart - T();
    if (fadeT < 0) fadeT = 0;
    for (i = 0; i < LAYERS.length; i++) {
      var L = LAYERS[i];
      var g = music.layerGain[L];
      if (!g) continue;
      var tgt = Math.max(0.0001, music.target[L] === undefined ? 0.5 : music.target[L]);
      if (L === 'brass' && !cfg.brass) tgt = 0.0001;
      if (L === 'choir') tgt = Math.max(0.0001, tgt * cfg.choir * 2);
      if (Math.abs(tgt - music.layerCur[L]) > 0.004) {
        try {
          g.gain.cancelScheduledValues(T());
          g.gain.setValueAtTime(Math.max(0.0001, music.layerCur[L]), T() + fadeT);
          g.gain.exponentialRampToValueAtTime(tgt, T() + fadeT + barDur * 0.95);
        } catch (e) { try { g.gain.value = tgt; } catch (e2) {} }
        music.layerCur[L] = tgt;
      }
    }

    music.barStart += barDur;
    music.bar++;
    /* re-roll the progression every 8 bars so long fights don't loop obviously */
    if ((music.bar % 8) === 0) progression = pick(PROGRESSIONS);
    /* era / tempo changes land on the bar line, never mid-phrase */
    if (music.pendingEra >= 0) {
      applyEra(music.pendingEra);
      music.pendingEra = -1;
    }
    music.bpm = music.cfg.bpm * music.target.tempo;
  }

  function musicTick() {
    if (!ready() || !music.running) return;
    if (ctx.state !== 'running') return;
    var horizon = T() + 0.7;
    var guard = 0;
    while (music.barStart < horizon && guard++ < 4) {
      try { scheduleBar(); }
      catch (e) { warn('music:bar', 'a music bar failed to schedule — score continues.', e); music.barStart = T() + 1.0; }
    }
  }

  function applyEra(index) {
    index = clamp(index | 0, 0, ERA_MUSIC.length - 1);
    music.era = index;
    music.cfg = ERA_MUSIC[index];
    music.bpm = music.cfg.bpm * music.target.tempo;
    progression = pick(PROGRESSIONS);
  }

  function musicStart() {
    if (!ok && !init()) return false;
    if (!settings.musicOn) return false;
    if (music.running) return true;
    if (!unlocked) { _unlockPending.push(musicStart); return false; }
    if (!music.bus) {
      try { buildMusicBus(); }
      catch (e) { warn('music:bus', 'could not build the music bus — music disabled.', e); return false; }
    }
    music.running = true;
    music.bar = 0;
    music.barStart = T() + 0.12;
    music.bpm = music.cfg.bpm * music.target.tempo;
    applyVolumes(1.2);
    if (music.timer) { clearInterval(music.timer); }
    music.timer = setInterval(musicTick, 90);
    musicTick();
    return true;
  }

  function musicStop(fade) {
    if (!music.running) return;
    music.running = false;
    if (music.timer) { clearInterval(music.timer); music.timer = 0; }
    if (nMusic) ramp(nMusic.gain, 0.0001, fade === undefined ? 1.4 : fade);
    var i;
    for (i = 0; i < LAYERS.length; i++) { music.layerCur[LAYERS[i]] = 0.0001; }
  }

  function musicSetState(name, immediate) {
    var s = MUSIC_STATES[name];
    if (!s) return;
    if (music.state === name) return;
    music.state = name;
    music.target = s;
    music.fill = true;
    if (immediate && music.running) {
      /* only used for stingers — otherwise the mix moves on the bar */
      var i;
      for (i = 0; i < LAYERS.length; i++) {
        var g = music.layerGain[LAYERS[i]];
        if (!g) continue;
        var tgt = Math.max(0.0001, s[LAYERS[i]] === undefined ? 0.5 : s[LAYERS[i]]);
        ramp(g.gain, tgt, 0.5);
        music.layerCur[LAYERS[i]] = tgt;
      }
    }
    if (core()) core().emit('audio:music', name);
  }

  function musicSetEra(index) {
    index = clamp(index | 0, 0, ERA_MUSIC.length - 1);
    if (index === music.era) return;
    if (music.running) music.pendingEra = index;   // swap on the next bar line
    else applyEra(index);
  }

  /* Duck the music briefly so a stinger or telegraph cuts through. */
  function duckMusic(amount, seconds) {
    if (!ready() || !music.bus) return;
    var a = clamp01(amount === undefined ? 0.45 : amount);
    var s = seconds === undefined ? 1.2 : seconds;
    try {
      var g = music.bus.gain, n = T();
      g.cancelScheduledValues(n);
      g.setValueAtTime(Math.max(0.0001, g.value), n);
      g.exponentialRampToValueAtTime(Math.max(0.05, 1 - a), n + 0.12);
      g.exponentialRampToValueAtTime(1, n + s);
    } catch (e) {}
  }

  /* ---------------------------------------------------------------------------
   * 10. Battle-state tracking + horde march bed + ambience driver
   * ------------------------------------------------------------------------ */
  var battle = {
    intensity: 0,
    smoothed: 0,
    lastState: 'menu',
    marchAcc: 0,
    marchPeriod: 0.52,
    lowHpCue: 0,
    hits: 0,
    hitDecay: 0
  };

  function unitsSnapshot() {
    var c = core();
    var out = { n: 0, moving: 0, weight: 0, cx: 0, teamCx: [0, 0], teamN: [0, 0], boss: false };
    if (!c || !c.state || !c.state.units) return out;
    var us = c.state.units, i, u, n = us.length;
    var sumx = 0, mw = 0, mx = 0;
    for (i = 0; i < n; i++) {
      u = us[i];
      if (!u || u.dead) continue;
      out.n++;
      sumx += u.x;
      if (u.cls === 'boss') out.boss = true;
      var st = u.state;
      if (st === 'walk' || st === 'run') {
        out.moving++;
        var w = (typeof u.mass === 'number' && u.mass > 0) ? u.mass : 1;
        mw += w;
        mx += u.x;
      }
    }
    if (out.n > 0) out.cx = sumx / out.n;
    out.weight = out.moving > 0 ? mw / out.moving : 1;
    out.marchX = out.moving > 0 ? mx / out.moving : out.cx;
    return out;
  }

  function deriveState(snap) {
    var c = core();
    if (!c) return 'menu';
    var s = c.state;
    if (s.over) return s.result === 'victory' ? 'victory' : 'defeat';
    if (s.phase === 'menu') return 'menu';
    if (s.phase === 'victory') return 'victory';
    if (s.phase === 'defeat') return 'defeat';

    var mine = s.forts && s.forts[1] ? s.forts[1] : null;
    var hpFrac = mine && mine.max > 0 ? mine.hp / mine.max : 1;
    var contact = 0, alive = snap.n;

    /* "contact" = how many units are close to the midpoint of the two armies */
    if (alive > 0) {
      var hits = battle.hits;
      contact = clamp01(hits / 8);
    }
    var pressure = clamp01((1 - hpFrac) * 1.3);
    var mass = clamp01(alive / 34);
    var i = clamp01(contact * 0.55 + mass * 0.3 + pressure * 0.4 + (snap.boss ? 0.25 : 0));

    battle.intensity = i;
    if (hpFrac < 0.28 || i > 0.86) return 'desperate';
    if (i > 0.42) return 'combat';
    if (i > 0.14 || alive > 3) return 'building';
    return 'calm';
  }

  var _tickAcc = 0, _stateAcc = 0;

  function tick(dtReal) {
    if (!ok || !unlocked) return;
    if (ctx.state !== 'running') return;
    var dt = (typeof dtReal === 'number' && dtReal > 0 && dtReal < 0.5) ? dtReal : 0.016;

    _tickAcc += dt;
    if (_tickAcc > 0.5) { _tickAcc = 0; reap(); }

    battle.hitDecay -= dt;
    if (battle.hitDecay <= 0) { battle.hitDecay = 0.5; battle.hits *= 0.55; }

    var c = core();
    if (!c) return;

    /* --- adaptive quality: fewer voices when the frame budget is tight --- */
    if (c.perf && c.perf.tier) {
      var mv = MAX_VOICES[c.perf.tier];
      if (mv) maxVoices = mv;
    }

    _stateAcc += dt;
    var snap = null;
    if (_stateAcc >= 0.35) {
      _stateAcc = 0;
      snap = unitsSnapshot();
      var st = deriveState(snap);
      if (st !== music.state) musicSetState(st);
      battle.snap = snap;
    }
    snap = battle.snap || (battle.snap = unitsSnapshot());

    /* --- horde march bed: one rhythmic layer, never 200 individual steps --- */
    if (!c.state.paused && snap.moving > 0 && settings.sfxOn) {
      /* heavier armies march slower; the bed tempo follows the crowd */
      var w = clamp(snap.weight, 0.5, 3);
      battle.marchPeriod = clamp(0.30 + w * 0.13, 0.28, 0.72) / clamp(c.state.speed || 1, 1, 3);
      battle.marchAcc += dt;
      if (battle.marchAcc >= battle.marchPeriod) {
        battle.marchAcc -= battle.marchPeriod;
        if (snap.moving <= 3) {
          /* a handful of units: real individual steps read better */
          var k;
          for (k = 0; k < snap.moving; k++) {
            play('footstep', { x: snap.marchX + rr(-4, 4), weight: snap.weight, gain: 0.9 });
          }
        } else {
          play('marchBed', { x: snap.marchX, count: snap.moving, gain: 1 });
        }
      }
    } else {
      battle.marchAcc = 0;
    }

    /* --- fire crackle sprinkles while the fire bed is up --- */
    if (beds.fire.gain && beds.fire.level > 0.02) {
      _crackleAcc += dt;
      if (_crackleAcc > rr(0.5, 1.4)) {
        _crackleAcc = 0;
        play('fireCrackle', { gain: beds.fire.level });
      }
    }

    /* --- low fort health telegraph --- */
    var f = c.state.forts && c.state.forts[1];
    if (f && f.max > 0 && !c.state.over && c.state.phase === 'battle') {
      var frac = f.hp / f.max;
      battle.lowHpCue -= dt;
      if (frac < 0.3 && battle.lowHpCue <= 0) {
        battle.lowHpCue = lerp(1.2, 3.4, clamp01(frac / 0.3));
        play('cueLowHealth', { gain: lerp(1.0, 0.6, clamp01(frac / 0.3)) });
        duckMusic(0.25, 0.9);
      }
    }
  }

  /* ---------------------------------------------------------------------------
   * 11. Event wiring — the ONLY coupling to the rest of the game
   * ------------------------------------------------------------------------ */
  var _powerReady = false;
  var _lastGateCue = -1e9;

  function weaponSfxFor(u) {
    if (!u) return 'swordClash';
    var era = (typeof u.era === 'number') ? u.era : (core() ? core().state.eraIndex : 0);
    var def = u.def || {};
    if (def.ranged || def.projSpeed > 0) {
      if (era >= 7) return 'energyWeapon';
      if (era >= 4) return 'musketCrack';
      return 'bowRelease';
    }
    if (era >= 7) return 'energyWeapon';
    if (def.dmgType === 'pierce') return 'spearThrust';
    return 'swordClash';
  }

  function hitSfxFor(p) {
    var u = p.unit;
    if (p.blocked) return 'shieldBlock';
    if (p.crit || (u && p.dmg > (u.maxHp || 100) * 0.28)) return 'boneCrunch';
    if (u && (u.armor || 0) > 10) return 'armorHit';
    if (p.type === 'blunt') return 'armorHit';
    return 'fleshHit';
  }

  function bind() {
    var c = core();
    if (!c) {
      /* Core is not up yet — retry on the next macrotask a few times. */
      if (bind.tries === undefined) bind.tries = 0;
      if (bind.tries++ < 40) { setTimeout(bind, 60); }
      else warn('nocore', 'AOW.Core never appeared — audio is running unwired (manual API still works).');
      return;
    }

    c.on('core:ready', pullCoreSettings);
    c.on('settings:change', pullCoreSettings);
    pullCoreSettings();

    /* --- combat ---------------------------------------------------------- */
    c.on('unit:attack', function (p) {
      if (!p || !p.unit) return;
      var u = p.unit;
      var name = weaponSfxFor(u);
      if (name === 'bowRelease') { play('bowDraw', { x: u.x, gain: 0.5 }); }
      play(name, { x: u.x, gain: u.cls === 'boss' ? 1.5 : (u.cls === 'champion' ? 1.15 : 1) });
      if (name === 'musketCrack') { play('musketReload', { x: u.x, gain: 0.4, delay: 0.5 }); }
      if (u.def && u.def.mode === 'siege') { play('catapult', { x: u.x, gain: 1.1 }); }
    });

    c.on('unit:hit', function (p) {
      if (!p || !p.unit) return;
      battle.hits += 1;
      var u = p.unit;
      play(hitSfxFor(p), { x: u.x, gain: p.crit ? 1.3 : 1, weight: u.mass });
      if (p.type === 'pierce' && !p.blocked && rnd() < 0.35) {
        play('arrowThunk', { x: u.x, gain: 0.5, material: 'flesh' });
      }
    });

    c.on('unit:block', function (p) {
      if (!p || !p.unit) return;
      play('shieldBlock', { x: p.unit.x, gain: 1.05 });
    });

    c.on('unit:death', function (p) {
      if (!p || !p.unit) return;
      var u = p.unit;
      play('deathCry', { x: u.x, weight: u.mass, gain: u.cls === 'boss' ? 1.6 : (u.cls === 'champion' ? 1.3 : 1) });
      if (u.cls === 'boss') {
        play('explosion', { x: u.x, size: 1.5, gain: 1.0, delay: 0.35 });
        duckMusic(0.5, 1.8);
      }
    });

    c.on('unit:spawn', function (p) {
      if (!p || !p.unit) return;
      var u = p.unit;
      if (u.cls === 'champion' || u.cls === 'boss') {
        play('warCry', { x: u.x, count: u.cls === 'boss' ? 20 : 8, gain: u.cls === 'boss' ? 1.3 : 0.9 });
      } else {
        play('footstep', { x: u.x, weight: u.mass, gain: 0.5 });
      }
    });

    c.on('sim:charge', function () {
      var s = c.state;
      play('warCry', { x: focusX(), count: 20, gain: 1.0 });
      musicSetState('combat');
      music.fill = true;
      if (s) { /* keep the linter honest about the unused var */ }
    });

    c.on('sim:ultimate', function (u) {
      play('energyWeapon', { x: u && u.x, gain: 1.3 });
      play('explosion', { x: u && u.x, size: 1.2, gain: 0.9, delay: 0.12 });
      duckMusic(0.4, 1.4);
    });

    c.on('sim:ability', function (p) {
      if (!p || !p.unit) return;
      play('cuePowerReady', { x: p.unit.x, gain: 0.55 });
    });

    /* --- forts / siege --------------------------------------------------- */
    c.on('fort:hit', function (p) {
      if (!p) return;
      var x = (AOW.FORT_X && AOW.FORT_X[p.team] !== undefined) ? AOW.FORT_X[p.team] : focusX();
      play('gateSlam', { x: x, gain: clamp(0.5 + (p.dmg || 0) / 260, 0.5, 1.3) });
      if (p.team === 1) {
        var now = ready() ? T() : 0;
        if (now - _lastGateCue > 6.5) {
          _lastGateCue = now;
          play('cueGateAttack', { x: x, gain: 0.9 });
          duckMusic(0.3, 1.0);
        }
      }
    });

    c.on('fort:destroyed', function (p) {
      var x = (p && AOW.FORT_X && AOW.FORT_X[p.team] !== undefined) ? AOW.FORT_X[p.team] : focusX();
      play('wallCrumble', { x: x, gain: 1.3 });
      play('explosion', { x: x, size: 2.0, gain: 1.1, delay: 0.2 });
      duckMusic(0.6, 2.4);
    });

    c.on('fort:tier', function (p) {
      var x = (p && AOW.FORT_X && AOW.FORT_X[p.team] !== undefined) ? AOW.FORT_X[p.team] : focusX();
      play('levelUp', { x: x, gain: 1.0 });
      play('gateSlam', { x: x, gain: 0.6, delay: 0.25 });
    });

    c.on('fort:heal', function (p) {
      var x = (p && AOW.FORT_X && AOW.FORT_X[p.team] !== undefined) ? AOW.FORT_X[p.team] : focusX();
      play('cuePowerReady', { x: x, gain: 0.6 });
    });

    /* --- waves / bosses -------------------------------------------------- */
    c.on('wave:preview', function () {
      play('cueWave', { gain: 0.85 });
      duckMusic(0.35, 1.6);
      musicSetState('building');
    });

    c.on('wave:start', function () {
      play('cueWave', { gain: 1.0 });
      duckMusic(0.4, 1.8);
      musicSetState('combat');
      music.fill = true;
    });

    c.on('wave:clear', function () {
      play('levelUp', { gain: 0.9 });
      play('warCry', { count: 16, gain: 0.7, delay: 0.4 });
      musicSetState('calm');
    });

    c.on('sim:telegraph', function () {
      play('cueWave', { gain: 0.6 });
    });

    c.on('boss:spawn', function (p) {
      var b = p && p.boss;
      play('cueBossWindup', { x: b && b.x, time: 1.6, gain: 1.2 });
      play('warCry', { x: b && b.x, count: 26, gain: 1.1, delay: 1.5 });
      musicSetState('desperate');
      duckMusic(0.55, 2.6);
    });

    c.on('boss:telegraph', function (p) {
      var u = p && p.unit;
      play('cueBossWindup', { x: u && u.x, time: (p && p.time) || 1.2, gain: 1.3 });
      duckMusic(0.35, ((p && p.time) || 1.2) + 0.4);
    });

    c.on('boss:phase', function (p) {
      var u = p && p.boss;
      play('explosion', { x: u && u.x, size: 1.4, gain: 1.0 });
      play('warCry', { x: u && u.x, count: 18, gain: 1.0, delay: 0.2 });
      music.fill = true;
    });

    /* --- powers ---------------------------------------------------------- */
    c.on('power:cast', function (p) {
      if (!p) return;
      play('powerCast', { x: p.x, type: p.type, gain: 1.2 });
      duckMusic(0.45, 1.6);
      _powerReady = false;
    });

    c.on('sim:power', function (army) {
      /* Sim broadcasts the army whose charge changed — cue only on the 0->1 edge */
      if (!army || army.team !== 1) return;
      var full = (army.power !== undefined) && army.power >= 0.999;
      if (full && !_powerReady) {
        _powerReady = true;
        play('cuePowerReady', { gain: 1.0 });
      } else if (!full) {
        _powerReady = false;
      }
    });

    /* --- economy / UI ---------------------------------------------------- */
    c.on('gold:change', function (p) {
      if (!p || !p.delta) return;
      if (p.delta > 0) { play('coin', { count: clamp(1 + Math.round(p.delta / 40), 1, 7), gain: clamp(0.4 + p.delta / 300, 0.4, 1) }); }
    });
    c.on('econ:income', function () { play('coin', { count: 2, gain: 0.28 }); });
    c.on('store:buy', function () { play('purchase', { gain: 1 }); });
    c.on('meta:buy', function () { play('purchase', { gain: 1 }); });
    c.on('unit:request', function () { play('uiClick', { gain: 0.8 }); });
    c.on('unlock:new', function () { play('levelUp', { gain: 0.9 }); });
    c.on('achievement:unlock', function () { play('levelUp', { gain: 1.0 }); });
    c.on('quest:complete', function () { play('purchase', { gain: 0.9 }); });
    c.on('bp:level', function () { play('levelUp', { gain: 0.85 }); });
    c.on('reward:grant', function () { play('coin', { count: 5, gain: 0.8 }); });

    c.on('ui:toast', function (p) {
      var kind = p && p.kind;
      if (kind === 'warn' || kind === 'boss') play('cueGateAttack', { gain: 0.45 });
      else if (kind === 'error' || kind === 'bad') play('uiDenied', { gain: 0.9 });
      else play('uiClick', { gain: 0.45, pitch: 1.3 });
    });

    c.on('stance:change', function () { play('uiClick', { gain: 0.9, pitch: 0.85 }); });
    c.on('game:speed', function () { play('uiClick', { gain: 0.7, pitch: 1.5 }); });

    /* --- era / progression ------------------------------------------------ */
    c.on('era:evolve', function (p) {
      var idx = (p && typeof p.index === 'number') ? p.index : (c.state.eraIndex || 0);
      play('evolve', { gain: 1.2 });
      duckMusic(0.75, 3.2);
      musicSetEra(idx);
    });
    c.on('units:morph', function () { play('levelUp', { gain: 0.8 }); });
    c.on('era:intro', function (p) {
      if (p && typeof p.index === 'number') musicSetEra(p.index);
    });

    /* --- game lifecycle --------------------------------------------------- */
    c.on('game:over', function (res) {
      musicStop(2.0);
      if (res === 'victory') { play('victory', { gain: 1.2 }); musicSetState('victory'); }
      else { play('defeat', { gain: 1.2 }); musicSetState('defeat'); }
      setBed('rain', 0); setBed('wind', 0); setBed('fire', 0);
    });

    c.on('game:new', function () {
      battle.hits = 0;
      _powerReady = false;
      musicSetState('calm');
      musicSetEra(c.state.eraIndex || 0);
      musicStart();
    });

    c.on('game:phase', function (p) {
      if (p === 'battle') musicSetState('building');
      else if (p === 'menu') musicSetState('menu');
      else if (p === 'prep' || p === 'shop' || p === 'wave-clear') musicSetState('calm');
    });

    c.on('game:pause', function (p) {
      if (!ready()) return;
      if (p) { ramp(nSfxDuck.gain, 0.25, 0.2); duckMusic(0.35, 0.4); }
      else { ramp(nSfxDuck.gain, 1, 0.3); }
    });

    /* --- environment ------------------------------------------------------ */
    c.on('env:weather', function (p) {
      var k = p && p.weather;
      var secs = (p && typeof p.seconds === 'number') ? Math.max(1.5, p.seconds) : 6;
      if (k === 'rain') { setBed('rain', 0.55, secs); setBed('wind', 0.3, secs); surfaceKey = 'mud'; }
      else if (k === 'storm') { setBed('rain', 0.85, secs); setBed('wind', 0.6, secs); surfaceKey = 'mud'; }
      else if (k === 'snow') { setBed('rain', 0); setBed('wind', 0.4, secs); surfaceKey = 'snow'; }
      else if (k === 'dust') { setBed('rain', 0); setBed('wind', 0.75, secs); surfaceKey = 'sand'; }
      else if (k === 'fog') { setBed('rain', 0); setBed('wind', 0.18, secs); surfaceKey = 'dirt'; }
      else if (k === 'overcast') { setBed('rain', 0); setBed('wind', 0.3, secs); surfaceKey = 'dirt'; }
      else { setBed('rain', 0); setBed('wind', 0.16, secs); surfaceKey = 'dirt'; }
    });

    c.on('env:lightning', function (p) {
      play('thunder', { power: (p && p.power) || 0.6, gain: 1.0, delay: rr(0.15, 1.4) });
    });

    c.on('env:era', function () { /* surface is re-derived from weather; nothing to do */ });

    c.on('camera:shake', function (p) {
      /* a hefty shake without its own sound still deserves a low thump */
      var a = p && p.amount;
      if (typeof a === 'number' && a > 0.4 && rnd() < 0.5) {
        play('explosion', { size: clamp(a, 0.4, 1.6), gain: 0.35 });
      }
    });

    /* --- app lifecycle ---------------------------------------------------- */
    c.on('app:hidden', function () { suspendForHidden(); });
    c.on('app:visible', function () { resumeFromHidden(); });

    /* --- per-frame driver -------------------------------------------------- */
    if (typeof c.registerRender === 'function') {
      c.registerRender(function (dtReal) { try { tick(dtReal); } catch (e) { warn('tick', 'audio tick threw — continuing.', e); } }, 90);
    }
  }

  /* ---------------------------------------------------------------------------
   * 12. Tab visibility
   * ------------------------------------------------------------------------ */
  function suspendForHidden() {
    if (!ready() || !unlocked) return;
    if (ctx.state !== 'running') return;
    try {
      ramp(nMaster.gain, 0.0001, 0.15);
      var p = ctx.suspend();
      suspendedByUs = true;
      if (p && p.then) p.then(function () {}, function () { suspendedByUs = false; });
    } catch (e) { suspendedByUs = false; }
  }

  function resumeFromHidden() {
    if (!ready() || !unlocked) return;
    if (!suspendedByUs && ctx.state === 'running') { applyVolumes(0.3); return; }
    try {
      var p = ctx.resume();
      suspendedByUs = false;
      if (p && p.then) {
        p.then(function () {
          applyVolumes(0.4);
          if (music.running) { music.barStart = T() + 0.1; }
        }, function () {});
      } else {
        applyVolumes(0.4);
        if (music.running) music.barStart = T() + 0.1;
      }
    } catch (e) {}
  }

  function bindVisibility() {
    try {
      if (global.document && global.document.addEventListener) {
        global.document.addEventListener('visibilitychange', function () {
          if (global.document.hidden) suspendForHidden();
          else resumeFromHidden();
        }, false);
      }
    } catch (e) { warn('vis', 'could not bind visibilitychange — audio will keep running in the background.', e); }
  }

  /* ---------------------------------------------------------------------------
   * 13. Public API
   * ------------------------------------------------------------------------ */
  var Audio = {
    __isAowAudio: true,
    version: '1.0.0',

    /* engine */
    init: function () { return init(); },
    unlock: function () { var r = unlock(); if (unlocked) flushQueue(); return r; },
    isReady: function () { return ready() && unlocked; },
    context: function () { return ctx; },

    /* sfx */
    play: play,
    has: function (name) { return !!SFX[name]; },
    list: function () { var a = [], k; for (k in SFX) a.push(k); a.sort(); return a; },
    /** Register/override a sound: fn(opts) using Audio.context(). Advanced use. */
    define: function (name, fn) { if (typeof name === 'string' && typeof fn === 'function') SFX[name] = fn; },

    /* ambience beds */
    setBed: setBed,
    setSurface: function (s) { if (SURFACE[s]) surfaceKey = s; return surfaceKey; },
    getSurface: function () { return surfaceKey; },

    /* spatial */
    panFor: panFor,
    setSpatialRange: function (half, falloff) {
      if (typeof half === 'number' && half > 4) HALF_SCREEN = half;
      if (typeof falloff === 'number' && falloff > 10) FALLOFF = falloff;
    },

    /* music */
    music: {
      start: musicStart,
      stop: musicStop,
      setState: musicSetState,
      getState: function () { return music.state; },
      setEra: musicSetEra,
      getEra: function () { return music.era; },
      setIntensity: function (v) {
        v = clamp01(v);
        var name = v > 0.85 ? 'desperate' : (v > 0.5 ? 'combat' : (v > 0.2 ? 'building' : 'calm'));
        musicSetState(name);
      },
      duck: duckMusic,
      isPlaying: function () { return music.running; },
      states: function () { var a = [], k; for (k in MUSIC_STATES) a.push(k); return a; }
    },

    /* telegraph shortcuts (gameplay information, not decoration) */
    cue: function (name, opts) {
      var map = {
        wave: 'cueWave', boss: 'cueBossWindup', gate: 'cueGateAttack',
        lowHealth: 'cueLowHealth', power: 'cuePowerReady'
      };
      return play(map[name] || name, opts);
    },

    /* mixer */
    setMasterVolume: function (v) { settings.master = clamp01(v); applyVolumes(0.1); return settings.master; },
    setMusicVolume:  function (v) { settings.music = clamp01(v); applyVolumes(0.3); return settings.music; },
    setSfxVolume:    function (v) { settings.sfx = clamp01(v); applyVolumes(0.1); return settings.sfx; },
    getVolumes: function () { return { master: settings.master, music: settings.music, sfx: settings.sfx }; },
    setMuted: function (m) {
      settings.muted = !!m;
      applyVolumes(0.12);
      if (core()) core().emit('audio:mute', settings.muted);
      return settings.muted;
    },
    toggleMute: function () { return Audio.setMuted(!settings.muted); },
    isMuted: function () { return settings.muted; },
    setSfxEnabled: function (b) { settings.sfxOn = !!b; if (!settings.sfxOn) { setBed('rain', 0); setBed('wind', 0); setBed('fire', 0); } applyVolumes(0.1); },
    setMusicEnabled: function (b) {
      settings.musicOn = !!b;
      if (!settings.musicOn) musicStop(0.8);
      else musicStart();
      applyVolumes(0.4);
    },

    /* diagnostics */
    stats: function () {
      return {
        state: ctx ? ctx.state : 'none',
        unlocked: unlocked,
        voices: voices.length,
        maxVoices: maxVoices,
        music: music.running ? music.state : 'off',
        era: music.cfg ? music.cfg.name : '-',
        bpm: Math.round(music.bpm),
        bar: music.bar,
        intensity: Math.round(battle.intensity * 100) / 100,
        surface: surfaceKey
      };
    },

    /** Hard stop: kill every live voice (used on scene resets). */
    stopAll: function (fade) {
      for (var i = voices.length - 1; i >= 0; i--) killVoice(voices[i], fade || 0.06);
      setBed('rain', 0); setBed('wind', 0); setBed('fire', 0);
    }
  };

  AOW.Audio = Audio;

  /* ---------------------------------------------------------------------------
   * 14. Boot
   * ------------------------------------------------------------------------ */
  try { init(); } catch (e) { warn('boot', 'audio init failed at boot — audio disabled.', e); }
  try { bindUnlockGestures(); } catch (e2) { warn('boot:gesture', 'could not bind unlock gestures.', e2); }
  try { bindVisibility(); } catch (e3) {}
  try { bind(); } catch (e4) { warn('boot:bind', 'event wiring failed — manual API still works.', e4); }

  /* Once the user touches anything, flush the queue and bring the score in. */
  _unlockPending.push(function () {
    flushQueue();
    var c = core();
    if (c && c.state && c.state.phase !== 'menu') musicStart();
    else musicStart();
  });

  if (core()) core().emit('audio:init', Audio);

})(typeof window !== 'undefined' ? window : this);
