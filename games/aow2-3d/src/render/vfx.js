/* =============================================================================
 * AOW2-3D — src/render/vfx.js  →  global AOW.VFX
 * -----------------------------------------------------------------------------
 * FEEL. This module is the difference between "a number went down" and "that
 * hit LANDED". Everything here is pooled, instanced, allocation-free in the
 * frame loop, and degrades to a no-op rather than crashing.
 *
 * WHAT LIVES HERE
 *   1. Two GPU particle layers (additive + alpha), each ONE draw call, fully
 *      integrated in the vertex shader (analytic drag + gravity + turbulence).
 *      Families: sparks, blood, dust, smoke, fire, embers, magic, energy,
 *      water, debris chunks, ground rings, muzzle flashes, frost, leaves.
 *   2. Two ground-decal layers (alpha + additive), instanced: blood pools,
 *      scorch, craters, shockwave rings, telegraphs, arrow shadows.
 *   3. Ribbon trails (weapon swings, arrow fletching, tracers, lightning).
 *   4. Energy beams with bloom-friendly emissive cores.
 *   5. Instanced arrows that fly, stick in the ground and fade.
 *   6. Signature powers: meteor barrage, arrow rain, lightning storm, fire
 *      wall, freeze, orbital beam — telegraph → cast → impact → aftermath.
 *   7. Ambient life: dust motes, embers, wind-blown leaves, heat shimmer.
 *   8. Damage numbers / floating text as instanced glyph quads with real depth.
 *
 * HARD RULES HONOURED (see CONTRACT.md)
 *   - three.js r128 UMD (global THREE). No modules, no npm, no network.
 *   - No external assets: every texture is drawn procedurally into a canvas.
 *   - Attaches exactly ONE global: AOW.VFX.
 *   - Cross-module talk only through AOW.Core.on / AOW.Core.emit.
 *   - Zero per-frame allocation: every vector/colour/descriptor is a scratch.
 *
 * COLOUR PIPELINE
 *   Renderer.js imposes a manual colour pipeline: author in sRGB, store LINEAR,
 *   let the ShaderMaterial prefix apply tone mapping + output encoding. Our
 *   shaders therefore end with <tonemapping_fragment> + <encodings_fragment>,
 *   exactly like three's built-in materials, so particles sit in the same
 *   space as everything else — with or without the composer.
 * ========================================================================== */
(function (global) {
  'use strict';

  var AOW = global.AOW || (global.AOW = {});
  if (AOW.VFX && AOW.VFX.__isAowVfx) {
    try { console.warn('[AOW.VFX] already initialised — ignoring duplicate script include.'); } catch (e) {}
    return;
  }

  var THREE = global.THREE;

  /* --------------------------------------------------------------------------
   * Warn-once plumbing. Nothing in this file is allowed to throw upward.
   * ------------------------------------------------------------------------ */
  var _warned = Object.create(null);
  function warnOnce(key, msg, err) {
    try {
      if (_warned[key]) { return; }
      _warned[key] = 1;
      if (err) { console.warn('[AOW.VFX] ' + msg, err); }
      else { console.warn('[AOW.VFX] ' + msg); }
    } catch (e) { /* console is gone; nothing to do */ }
  }

  /* --------------------------------------------------------------------------
   * Hard dependency guard — publish a complete no-op API so every caller is
   * safe even when three.js never loaded.
   * ------------------------------------------------------------------------ */
  if (!THREE || !THREE.InstancedBufferGeometry || !THREE.ShaderMaterial) {
    console.warn('[AOW.VFX] THREE (r128 UMD) not found — VFX disabled, publishing no-op API.');
    AOW.VFX = (function () {
      var noop = function () { return null; };
      var stub = { __isAowVfx: true, version: '1.0.0', ready: false, failed: true };
      ['init', 'spawn', 'burst', 'decal', 'text', 'damage', 'shake', 'hitstop', 'trail',
        'beam', 'tracer', 'power', 'addFire', 'removeFire', 'setQuality', 'clear',
        'update', 'dispose', 'stats'].forEach(function (k) { stub[k] = noop; });
      return stub;
    })();
    return;
  }

  var Core = AOW.Core || null;
  var R = null;                 // AOW.Render, resolved at init

  /* ==========================================================================
   * 0. MATH / COLOUR HELPERS
   * ======================================================================== */

  var PI = Math.PI, TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

  /* Visual RNG. Prefer Core's visual stream (never perturbs sim determinism). */
  var rnd = (Core && typeof Core.vrng === 'function')
    ? Core.vrng
    : function () { return Math.random(); };
  function rr(a, b) { return a + (b - a) * rnd(); }
  function rsign() { return rnd() < 0.5 ? -1 : 1; }
  /* Cheap approx normal(0,1) — three uniforms, no allocation. */
  function rgauss() { return ((rnd() + rnd() + rnd()) - 1.5) * 2.309401; }

  /* Deterministic RNG for texture generation, so the same build always draws
     the same atlas (helps when eyeballing regressions). */
  var texRnd = (Core && typeof Core.makeRng === 'function')
    ? Core.makeRng('aow-vfx-textures')
    : (function () { var s = 0x2f6e2b1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  function trr(a, b) { return a + (b - a) * texRnd(); }

  function srgbToLinear(c) {
    return c < 0.04045 ? (c < 0 ? 0 : c * 0.0773993808) : Math.pow((c + 0.055) * 0.9478672986, 2.4);
  }

  /**
   * sRGB hex → cached LINEAR [r,g,b] triple.
   * Every colour in this file goes through here so lighting maths stays sane
   * and particles match the rest of the frame.
   */
  var _colCache = Object.create(null);
  function LC(hex) {
    var key = '' + hex;
    var c = _colCache[key];
    if (c) { return c; }
    var h;
    if (typeof hex === 'number') { h = hex >>> 0; }
    else {
      var s = String(hex).replace('#', '');
      h = parseInt(s, 16);
      if (!isFinite(h)) { h = 0xffffff; }
    }
    c = [
      srgbToLinear(((h >> 16) & 255) / 255),
      srgbToLinear(((h >> 8) & 255) / 255),
      srgbToLinear((h & 255) / 255)
    ];
    _colCache[key] = c;
    return c;
  }

  /* ==========================================================================
   * 1. QUALITY TIERS
   * --------------------------------------------------------------------------
   * Buffers are always allocated at the high-tier capacity (about 1.1 MB total)
   * so a runtime tier change never reallocates or hitches. Only spawn counts,
   * decal caps and ambient density move.
   * ======================================================================== */

  var CAP = {
    partAdd: 5000,      // additive particles (sparks, fire, magic, embers…)
    partAlpha: 5000,    // alpha particles (blood, dust, smoke, debris…)
    decalAlpha: 256,    // blood pools, scorch, craters
    decalAdd: 192,      // rings, telegraphs, light pools
    glyphs: 640,        // characters across all live floating text
    trails: 40,
    beams: 8,
    arrows: 192,
    meteors: 10,
    powers: 12
  };

  var QCFG = {
    high:   { count: 1.00, decals: 200, ambient: 1.00, motes: 110, leaves: 26, shimmer: true,  trails: 30, lights: 3, decalLife: 1.00, bigPowers: 1.00 },
    medium: { count: 0.60, decals: 120, ambient: 0.55, motes: 55,  leaves: 14, shimmer: true,  trails: 20, lights: 2, decalLife: 0.75, bigPowers: 0.70 },
    low:    { count: 0.32, decals: 48,  ambient: 0.00, motes: 0,   leaves: 0,  shimmer: false, trails: 10, lights: 0, decalLife: 0.55, bigPowers: 0.45 }
  };

  var Q = QCFG.high;
  var qTier = 'high';

  function normTier(t) {
    if (t === 'med' || t === 'medium') { return 'medium'; }
    if (t === 'low') { return 'low'; }
    if (t === 'high') { return 'high'; }
    return null;
  }

  /* Scale a base particle count by the tier, never below 1 for a visible burst. */
  function N(base) {
    var n = Math.round(base * Q.count);
    return n < 1 ? (base > 0 ? 1 : 0) : n;
  }

  /* ==========================================================================
   * 2. PALETTES
   * ======================================================================== */

  var PAL = {
    bloodA:   LC('#a3160f'), bloodB:   LC('#38080a'),
    bloodDark:LC('#5e0d0b'),
    sparkA:   LC('#fff8d8'), sparkB:   LC('#ff7a12'),
    steelA:   LC('#ffffff'), steelB:   LC('#8fd0ff'),
    dustA:    LC('#cdbb9c'), dustB:    LC('#7e6f59'),
    stoneA:   LC('#cfc7b8'), stoneB:   LC('#645d52'),
    smokeA:   LC('#9c9c9c'), smokeB:   LC('#2f2f31'),
    smokeDkA: LC('#4a4642'), smokeDkB: LC('#161618'),
    fireA:    LC('#fff2b0'), fireB:    LC('#ff3a06'),
    emberA:   LC('#ffbe57'), emberB:   LC('#7e1600'),
    magicA:   LC('#e6c6ff'), magicB:   LC('#6a1fd0'),
    energyA:  LC('#d8fbff'), energyB:  LC('#1e7bff'),
    waterA:   LC('#e2f6ff'), waterB:   LC('#4f9ec9'),
    frostA:   LC('#f0fbff'), frostB:   LC('#69c4ff'),
    leafA:    LC('#8fae52'), leafB:    LC('#4e6a2c'),
    goldA:    LC('#fff3ba'), goldB:    LC('#ffab1f'),
    scorch:   LC('#241c16'),
    white:    LC('#ffffff'),
    warn:     LC('#ff5a2b'),
    heal:     LC('#7dffa8')
  };

  /* Per-era accent — magic, energy, trails and power tints ride this so era 8
     genuinely looks like a different weapon set, not medieval with new hats. */
  var ERA_TINT = [
    LC('#e8d5a8'),  // Stone
    LC('#ffc27a'),  // Bronze
    LC('#dfe6ef'),  // Iron
    LC('#cfe0ff'),  // Medieval
    LC('#ffd28a'),  // Gunpowder
    LC('#c6d2da'),  // Industrial
    LC('#bfe6ff'),  // Modern
    LC('#8ef0ff')   // Future
  ];
  function eraTint() {
    var st = Core && Core.state;
    var i = st ? (st.eraIndex | 0) : 3;
    return ERA_TINT[clamp(i, 0, ERA_TINT.length - 1)];
  }
  function eraIdx() {
    var st = Core && Core.state;
    return st ? clamp(st.eraIndex | 0, 0, 7) : 3;
  }

  /* ==========================================================================
   * 3. ATLAS TILE INDICES
   * --------------------------------------------------------------------------
   * Row 0 of every atlas is drawn at the BOTTOM of the canvas, because three's
   * CanvasTexture flips Y — so tile index maths in the shader stays trivial.
   * ======================================================================== */

  var P_GLOW = 0, P_SPARK = 1, P_STREAK = 2, P_SMOKE = 3,
      P_DUST = 4, P_DROP = 5, P_SPLAT = 6, P_FLAME = 7,
      P_CHUNK = 8, P_STAR = 9, P_RING = 10, P_ARC = 11,
      P_LEAF = 12, P_CRYSTAL = 13, P_BUBBLE = 14, P_HAZE = 15;

  var D_POOL = 0, D_SPLATTER = 1, D_SCORCH = 2, D_CRATER = 3,
      D_RING = 4, D_DISC = 5, D_TARGET = 6, D_SHADOW = 7,
      D_FROST = 8, D_CRACKS = 9, D_LIGHT = 10, D_SOFTRING = 11,
      D_STREAK = 12, D_HEX = 13, D_SPECK = 14, D_WHITE = 15;

  /* ==========================================================================
   * 4. PROCEDURAL TEXTURE FACTORY
   * ======================================================================== */

  var _texCache = Object.create(null);

  function makeTex(key, w, h, drawFn, opts) {
    if (_texCache[key]) { return _texCache[key]; }
    opts = opts || {};
    try {
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d');
      if (!ctx) { throw new Error('2D context unavailable'); }
      drawFn(ctx, w, h);

      var tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = opts.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      // Atlases never get mipmaps: mip levels blend neighbouring tiles into each
      // other and you get ghost sparks inside your smoke puffs.
      tex.generateMipmaps = !!opts.mipmaps;
      tex.minFilter = opts.mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      // These are masks/ramps multiplied by LINEAR vertex colours, never colour
      // sources — declaring sRGB here would double-apply the curve.
      tex.encoding = THREE.LinearEncoding;
      tex.anisotropy = 1;
      tex.premultiplyAlpha = false;
      tex.name = 'AOW.VFX.' + key;
      tex.needsUpdate = true;
      _texCache[key] = tex;
      return tex;
    } catch (err) {
      warnOnce('tex:' + key, 'could not build texture "' + key + '" — that effect family will be invisible.', err);
      return null;
    }
  }

  /** Radial alpha gradient helper: stops is an array of [offset, alpha]. */
  function radial(ctx, r, stops, rgb) {
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    var c = rgb || '255,255,255';
    for (var i = 0; i < stops.length; i++) {
      g.addColorStop(clamp01(stops[i][0]), 'rgba(' + c + ',' + stops[i][1] + ')');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
  }

  /** Draw an irregular closed blob of radius r with `lobes` wobble. */
  function blob(ctx, r, lobes, wobble, steps) {
    steps = steps || 40;
    var ph = trr(0, TAU), ph2 = trr(0, TAU);
    ctx.beginPath();
    for (var i = 0; i <= steps; i++) {
      var a = (i / steps) * TAU;
      var k = 1 + Math.sin(a * lobes + ph) * wobble + Math.sin(a * (lobes * 2 + 1) + ph2) * wobble * 0.45;
      var rr2 = r * k;
      var x = Math.cos(a) * rr2, y = Math.sin(a) * rr2;
      if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
    }
    ctx.closePath();
  }

  /* ---- particle atlas ----------------------------------------------------- */

  function drawParticleAtlas(ctx, W, H) {
    var cols = 4, rows = 4, cw = W / cols, ch = H / rows;
    ctx.clearRect(0, 0, W, H);

    function cell(i, fn) {
      var cx = (i % cols) * cw;
      var cy = (rows - 1 - Math.floor(i / cols)) * ch;   // row 0 at the bottom
      ctx.save();
      ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip();
      ctx.translate(cx + cw * 0.5, cy + ch * 0.5);
      fn(cw * 0.5, ch * 0.5);
      ctx.restore();
    }

    // 0 — soft glow. The workhorse: light pools, flashes, magic cores.
    cell(P_GLOW, function (r) {
      radial(ctx, r * 0.98, [[0, 1], [0.16, 0.92], [0.42, 0.42], [0.72, 0.10], [1, 0]]);
    });

    // 1 — spark: tiny hot core inside a tight halo. Reads at 2px.
    cell(P_SPARK, function (r) {
      radial(ctx, r * 0.95, [[0, 0.55], [0.30, 0.16], [1, 0]]);
      radial(ctx, r * 0.30, [[0, 1], [0.55, 0.95], [1, 0]]);
    });

    // 2 — streak: runs along +v (the shader stretches the quad on its v axis).
    cell(P_STREAK, function (r) {
      var g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0.00, 'rgba(255,255,255,0)');
      g.addColorStop(0.28, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.52, 'rgba(255,255,255,1)');
      g.addColorStop(0.74, 'rgba(255,255,255,0.45)');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      // Lens-shaped so the streak has a waist rather than being a flat bar.
      ctx.beginPath();
      for (var i = 0; i <= 28; i++) {
        var t = i / 28, y = -r + 2 * r * t;
        var w = Math.sin(t * PI) * r * 0.30;
        if (i === 0) { ctx.moveTo(w, y); } else { ctx.lineTo(w, y); }
      }
      for (var j = 28; j >= 0; j--) {
        var t2 = j / 28, y2 = -r + 2 * r * t2;
        ctx.lineTo(-Math.sin(t2 * PI) * r * 0.30, y2);
      }
      ctx.closePath();
      ctx.fill();
    });

    // 3 — smoke puff: overlapping lobes so silhouettes never repeat obviously.
    cell(P_SMOKE, function (r) {
      var i;
      for (i = 0; i < 7; i++) {
        var a = trr(0, TAU), d = trr(0, r * 0.42);
        ctx.save();
        ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
        radial(ctx, r * trr(0.42, 0.72), [[0, 0.30], [0.45, 0.20], [1, 0]]);
        ctx.restore();
      }
      radial(ctx, r * 0.9, [[0, 0.34], [0.5, 0.20], [1, 0]]);
    });

    // 4 — dust: flatter, wider, much softer edge than smoke.
    cell(P_DUST, function (r) {
      var i;
      for (i = 0; i < 5; i++) {
        var a = trr(0, TAU), d = trr(0, r * 0.5);
        ctx.save();
        ctx.translate(Math.cos(a) * d, Math.sin(a) * d * 0.6);
        radial(ctx, r * trr(0.5, 0.85), [[0, 0.17], [0.55, 0.09], [1, 0]]);
        ctx.restore();
      }
    });

    // 5 — droplet: teardrop pointing along +v so blood reads as thrown, not fog.
    cell(P_DROP, function (r) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.92);
      ctx.bezierCurveTo(r * 0.52, -r * 0.28, r * 0.44, r * 0.55, 0, r * 0.86);
      ctx.bezierCurveTo(-r * 0.44, r * 0.55, -r * 0.52, -r * 0.28, 0, -r * 0.92);
      ctx.closePath();
      var g = ctx.createRadialGradient(-r * 0.18, r * 0.12, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.94)');
      g.addColorStop(1, 'rgba(255,255,255,0.55)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    });

    // 6 — splat: irregular blob plus satellite droplets.
    cell(P_SPLAT, function (r) {
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      blob(ctx, r * 0.56, 4, 0.30);
      ctx.fill();
      for (var i = 0; i < 7; i++) {
        var a = trr(0, TAU), d = trr(r * 0.55, r * 0.95);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, trr(r * 0.05, r * 0.14), 0, TAU);
        ctx.fill();
      }
    });

    // 7 — flame: teardrop pointing UP with a hot core; colour ramp does the rest.
    cell(P_FLAME, function (r) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.98);
      ctx.bezierCurveTo(r * 0.62, -r * 0.10, r * 0.50, r * 0.62, 0, r * 0.92);
      ctx.bezierCurveTo(-r * 0.50, r * 0.62, -r * 0.62, -r * 0.10, 0, -r * 0.98);
      ctx.closePath();
      var g = ctx.createRadialGradient(0, r * 0.30, 0, 0, 0, r);
      g.addColorStop(0.00, 'rgba(255,255,255,1)');
      g.addColorStop(0.38, 'rgba(255,255,255,0.78)');
      g.addColorStop(0.80, 'rgba(255,255,255,0.28)');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    });

    // 8 — chunk: angular debris silhouette with a lit facet.
    cell(P_CHUNK, function (r) {
      ctx.beginPath();
      var pts = 6, i;
      for (i = 0; i <= pts; i++) {
        var a = (i / pts) * TAU + 0.3;
        var rad = r * trr(0.52, 0.86);
        var x = Math.cos(a) * rad, y = Math.sin(a) * rad;
        if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();
      // facet highlight — gives the chunk a readable "top"
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      var lg = ctx.createLinearGradient(0, -r, 0, r);
      lg.addColorStop(0, 'rgba(255,255,255,1)');
      lg.addColorStop(0.55, 'rgba(255,255,255,0.55)');
      lg.addColorStop(1, 'rgba(255,255,255,0.28)');
      ctx.fillStyle = lg;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    });

    // 9 — four-point star flare, for hero sparks and crit pops.
    cell(P_STAR, function (r) {
      radial(ctx, r * 0.42, [[0, 0.95], [0.35, 0.45], [1, 0]]);
      ctx.save();
      var k;
      for (k = 0; k < 2; k++) {
        ctx.rotate(k === 0 ? 0 : PI * 0.5);
        var g = ctx.createLinearGradient(-r, 0, r, 0);
        g.addColorStop(0.00, 'rgba(255,255,255,0)');
        g.addColorStop(0.50, 'rgba(255,255,255,0.85)');
        g.addColorStop(1.00, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(0, -r * 0.085);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r * 0.085);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // faint 45° secondary spikes
      ctx.save();
      ctx.rotate(PI * 0.25);
      ctx.globalAlpha = 0.4;
      var g2 = ctx.createLinearGradient(-r * 0.7, 0, r * 0.7, 0);
      g2.addColorStop(0.00, 'rgba(255,255,255,0)');
      g2.addColorStop(0.50, 'rgba(255,255,255,0.7)');
      g2.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, 0); ctx.lineTo(0, -r * 0.05);
      ctx.lineTo(r * 0.7, 0); ctx.lineTo(0, r * 0.05);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    });

    // 10 — thin billboard ring (air shockwaves, cast pulses).
    cell(P_RING, function (r) {
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0.00, 'rgba(255,255,255,0)');
      g.addColorStop(0.62, 'rgba(255,255,255,0)');
      g.addColorStop(0.80, 'rgba(255,255,255,1)');
      g.addColorStop(0.92, 'rgba(255,255,255,0.35)');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    });

    // 11 — crescent arc, for directional shockwaves and swing whooshes.
    cell(P_ARC, function (r) {
      ctx.save();
      ctx.lineCap = 'round';
      var steps = 26, i;
      for (i = 0; i < steps; i++) {
        var t = i / (steps - 1);
        var a = -PI * 0.42 + t * PI * 0.84;
        var alpha = Math.sin(t * PI);
        ctx.strokeStyle = 'rgba(255,255,255,' + (alpha * 0.9).toFixed(3) + ')';
        ctx.lineWidth = r * 0.16 * alpha + r * 0.02;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.72, a - 0.03, a + 0.03);
        ctx.stroke();
      }
      ctx.restore();
    });

    // 12 — leaf / petal.
    cell(P_LEAF, function (r) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.85);
      ctx.quadraticCurveTo(r * 0.66, -r * 0.10, 0, r * 0.85);
      ctx.quadraticCurveTo(-r * 0.66, -r * 0.10, 0, -r * 0.85);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.8); ctx.lineTo(0, r * 0.8);
      ctx.stroke();
      ctx.restore();
    });

    // 13 — ice crystal, six-armed.
    cell(P_CRYSTAL, function (r) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineCap = 'round';
      var i;
      for (i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i / 6) * TAU);
        ctx.lineWidth = Math.max(1, r * 0.09);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.82); ctx.stroke();
        ctx.lineWidth = Math.max(1, r * 0.06);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.46); ctx.lineTo(r * 0.22, -r * 0.66);
        ctx.moveTo(0, -r * 0.46); ctx.lineTo(-r * 0.22, -r * 0.66);
        ctx.stroke();
        ctx.restore();
      }
      radial(ctx, r * 0.28, [[0, 0.85], [1, 0]]);
      ctx.restore();
    });

    // 14 — water droplet / bubble with a rim highlight.
    cell(P_BUBBLE, function (r) {
      radial(ctx, r * 0.92, [[0, 0.30], [0.62, 0.16], [0.86, 0.62], [0.96, 0.22], [1, 0]]);
      ctx.save();
      ctx.translate(-r * 0.24, -r * 0.26);
      radial(ctx, r * 0.22, [[0, 0.9], [1, 0]]);
      ctx.restore();
    });

    // 15 — haze: very soft, low-contrast noise for heat shimmer.
    cell(P_HAZE, function (r) {
      var i;
      for (i = 0; i < 14; i++) {
        var a = trr(0, TAU), d = trr(0, r * 0.62);
        ctx.save();
        ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
        radial(ctx, r * trr(0.22, 0.5), [[0, 0.09], [1, 0]]);
        ctx.restore();
      }
      radial(ctx, r * 0.95, [[0, 0.05], [0.7, 0.03], [1, 0]]);
    });
  }

  /* ---- decal atlas -------------------------------------------------------- */

  function drawDecalAtlas(ctx, W, H) {
    var cols = 4, rows = 4, cw = W / cols, ch = H / rows;
    ctx.clearRect(0, 0, W, H);

    function cell(i, fn) {
      var cx = (i % cols) * cw;
      var cy = (rows - 1 - Math.floor(i / cols)) * ch;
      ctx.save();
      ctx.beginPath(); ctx.rect(cx, cy, cw, ch); ctx.clip();
      ctx.translate(cx + cw * 0.5, cy + ch * 0.5);
      fn(cw * 0.5, ch * 0.5);
      ctx.restore();
    }

    // 0 — blood pool: dense irregular centre, feathered rim, a few outliers.
    cell(D_POOL, function (r) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      blob(ctx, r * 0.62, 3, 0.22, 56); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      blob(ctx, r * 0.80, 5, 0.20, 56); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      var i;
      for (i = 0; i < 9; i++) {
        var a = trr(0, TAU), d = trr(r * 0.6, r * 0.95);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, trr(r * 0.03, r * 0.10), 0, TAU);
        ctx.fill();
      }
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      radial(ctx, r, [[0, 1], [0.72, 1], [1, 0]]);
      ctx.restore();
    });

    // 1 — splatter: no core, all droplets. Layered over pools for variety.
    cell(D_SPLATTER, function (r) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      var i;
      for (i = 0; i < 26; i++) {
        var a = trr(0, TAU), d = trr(r * 0.08, r * 0.95);
        var s = trr(r * 0.02, r * 0.11) * (1 - d / (r * 1.2));
        ctx.save();
        ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.8, s, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    });

    // 2 — scorch: burnt earth, hot-ish rim, sooty centre.
    cell(D_SCORCH, function (r) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      blob(ctx, r * 0.74, 4, 0.18, 60); ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      radial(ctx, r, [[0, 1], [0.45, 0.95], [0.78, 0.55], [1, 0]]);
      ctx.restore();
      ctx.globalAlpha = 0.35;
      var i;
      for (i = 0; i < 16; i++) {
        var a = trr(0, TAU), d = trr(r * 0.3, r * 0.85);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, trr(r * 0.02, r * 0.07), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });

    // 3 — crater: dark bowl, bright displaced-earth rim, radial ejecta.
    cell(D_CRATER, function (r) {
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0.00, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.42, 'rgba(255,255,255,0.80)');
      g.addColorStop(0.62, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.78, 'rgba(255,255,255,0.42)');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      blob(ctx, r * 0.95, 3, 0.10, 60); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      var i;
      for (i = 0; i < 14; i++) {
        var a = trr(0, TAU);
        ctx.lineWidth = trr(r * 0.012, r * 0.04);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
        ctx.lineTo(Math.cos(a) * r * trr(0.8, 0.99), Math.sin(a) * r * trr(0.8, 0.99));
        ctx.stroke();
      }
    });

    // 4 — hard thin ring (shockwaves).
    cell(D_RING, function (r) {
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0.00, 'rgba(255,255,255,0)');
      g.addColorStop(0.70, 'rgba(255,255,255,0)');
      g.addColorStop(0.84, 'rgba(255,255,255,1)');
      g.addColorStop(0.93, 'rgba(255,255,255,0.30)');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    });

    // 5 — soft disc (glow pools under fire, magic ground light).
    cell(D_DISC, function (r) {
      radial(ctx, r, [[0, 0.95], [0.30, 0.66], [0.62, 0.24], [1, 0]]);
    });

    // 6 — telegraph target: dashed outer ring, inner ring, crosshair ticks.
    cell(D_TARGET, function (r) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = r * 0.05;
      var seg = 24, i;
      for (i = 0; i < seg; i++) {
        if (i % 2) { continue; }
        var a0 = (i / seg) * TAU, a1 = a0 + (TAU / seg) * 0.85;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.88, a0, a1); ctx.stroke();
      }
      ctx.lineWidth = r * 0.035;
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.60, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.30, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = r * 0.045;
      for (i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate((i / 4) * TAU);
        ctx.beginPath(); ctx.moveTo(0, -r * 0.94); ctx.lineTo(0, -r * 0.70); ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    });

    // 7 — soft elliptical shadow (falling-object ground shadows).
    cell(D_SHADOW, function (r) {
      radial(ctx, r * 0.95, [[0, 0.85], [0.42, 0.55], [0.75, 0.16], [1, 0]]);
    });

    // 8 — frost patch: crystalline spokes over a soft disc.
    cell(D_FROST, function (r) {
      radial(ctx, r * 0.92, [[0, 0.55], [0.55, 0.30], [1, 0]]);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineCap = 'round';
      var i, j;
      for (i = 0; i < 11; i++) {
        var a = trr(0, TAU), len = trr(r * 0.35, r * 0.9);
        ctx.save(); ctx.rotate(a);
        ctx.lineWidth = trr(r * 0.015, r * 0.04);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len); ctx.stroke();
        for (j = 1; j <= 3; j++) {
          var y = -len * (j / 4), b = len * 0.16;
          ctx.beginPath();
          ctx.moveTo(0, y); ctx.lineTo(b, y - b * 0.8);
          ctx.moveTo(0, y); ctx.lineTo(-b, y - b * 0.8);
          ctx.stroke();
        }
        ctx.restore();
      }
    });

    // 9 — radial ground cracks (heavy impacts, boss slams).
    cell(D_CRACKS, function (r) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineCap = 'round';
      var i, k;
      for (i = 0; i < 10; i++) {
        var a = (i / 10) * TAU + trr(-0.2, 0.2);
        var x = 0, y = 0, len = trr(r * 0.45, r * 0.95), steps = 6;
        ctx.beginPath(); ctx.moveTo(0, 0);
        for (k = 1; k <= steps; k++) {
          var t = k / steps;
          var aa = a + trr(-0.28, 0.28) * t;
          x = Math.cos(aa) * len * t;
          y = Math.sin(aa) * len * t;
          ctx.lineWidth = Math.max(0.6, r * 0.05 * (1 - t));
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      radial(ctx, r * 0.22, [[0, 0.7], [1, 0]]);
    });

    // 10 — pure light pool (very soft, for point-light fakes on the ground).
    cell(D_LIGHT, function (r) {
      radial(ctx, r, [[0, 0.7], [0.22, 0.44], [0.55, 0.14], [1, 0]]);
    });

    // 11 — soft wide ring (dust shockwave, feathered both sides).
    cell(D_SOFTRING, function (r) {
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0.00, 'rgba(255,255,255,0)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.05)');
      g.addColorStop(0.72, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.88, 'rgba(255,255,255,0.22)');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    });

    // 12 — directional streak (skid marks, beam scorch trails).
    cell(D_STREAK, function (r) {
      var g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0.00, 'rgba(255,255,255,0)');
      g.addColorStop(0.30, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.70, 'rgba(255,255,255,0.85)');
      g.addColorStop(1.00, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      var i;
      for (i = 0; i <= 24; i++) {
        var t = i / 24, y = -r + 2 * r * t;
        ctx.lineTo(Math.sin(t * PI) * r * 0.34, y);
      }
      for (i = 24; i >= 0; i--) {
        var t2 = i / 24, y2 = -r + 2 * r * t2;
        ctx.lineTo(-Math.sin(t2 * PI) * r * 0.34, y2);
      }
      ctx.closePath(); ctx.fill();
    });

    // 13 — hex tech ring (future-era telegraphs and orbital marks).
    cell(D_HEX, function (r) {
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = r * 0.045;
      var i, k;
      for (k = 0; k < 2; k++) {
        var rad = k === 0 ? r * 0.9 : r * 0.55;
        ctx.beginPath();
        for (i = 0; i <= 6; i++) {
          var a = (i / 6) * TAU + (k ? 0.5 : 0);
          var x = Math.cos(a) * rad, y = Math.sin(a) * rad;
          if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
        }
        ctx.closePath(); ctx.stroke();
      }
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = r * 0.025;
      for (i = 0; i < 6; i++) {
        var a2 = (i / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a2) * r * 0.55, Math.sin(a2) * r * 0.55);
        ctx.lineTo(Math.cos(a2) * r * 0.9, Math.sin(a2) * r * 0.9);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      radial(ctx, r * 0.28, [[0, 0.5], [1, 0]]);
    });

    // 14 — small speck cluster (gravel, chips, shell casings on the ground).
    cell(D_SPECK, function (r) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      var i;
      for (i = 0; i < 18; i++) {
        var a = trr(0, TAU), d = trr(0, r * 0.9);
        ctx.save();
        ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
        ctx.rotate(trr(0, TAU));
        var s = trr(r * 0.03, r * 0.09);
        ctx.fillRect(-s, -s * 0.6, s * 2, s * 1.2);
        ctx.restore();
      }
    });

    // 15 — plain feathered disc (utility).
    cell(D_WHITE, function (r) {
      radial(ctx, r, [[0, 1], [0.80, 1], [0.95, 0.5], [1, 0]]);
    });
  }

  /* ---- glyph atlas -------------------------------------------------------- */

  var GLYPH_COLS = 16, GLYPH_ROWS = 8, GLYPH_FIRST = 32;   // ASCII 32..159 slots

  function drawGlyphAtlas(ctx, W, H) {
    var cw = W / GLYPH_COLS, ch = H / GLYPH_ROWS;
    ctx.clearRect(0, 0, W, H);
    var fontPx = Math.floor(ch * 0.72);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    for (var i = 0; i < GLYPH_COLS * GLYPH_ROWS; i++) {
      var code = GLYPH_FIRST + i;
      if (code > 126) { break; }
      var chr = String.fromCharCode(code);
      var cx = (i % GLYPH_COLS) * cw + cw * 0.5;
      var cy = (GLYPH_ROWS - 1 - Math.floor(i / GLYPH_COLS)) * ch + ch * 0.5;

      ctx.save();
      ctx.translate(cx, cy);
      // Heavy weight + a fat dark outline: damage numbers have to survive being
      // drawn over a bright fire wall AND over dark mud.
      ctx.font = '900 ' + fontPx + 'px "Arial Black", "Helvetica Neue", Arial, sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = Math.max(3, fontPx * 0.22);
      ctx.strokeText(chr, 0, 0);
      ctx.lineWidth = Math.max(2, fontPx * 0.11);
      ctx.strokeText(chr, 0, 0);
      // RGB carries the body/outline mask: white body, black outline. The shader
      // multiplies the tint by .r so outlines stay black at any tint.
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillText(chr, 0, 0);
      ctx.restore();
    }
  }

  /* ---- utility strip textures --------------------------------------------- */

  function drawTrailStrip(ctx, W, H) {
    ctx.clearRect(0, 0, W, H);
    // v runs across the ribbon width: hot core, feathered edges.
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.00, 'rgba(255,255,255,0)');
    g.addColorStop(0.26, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.50, 'rgba(255,255,255,1)');
    g.addColorStop(0.74, 'rgba(255,255,255,0.55)');
    g.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBeamNoise(ctx, W, H) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    // Vertically-tiling banded noise: scrolls to sell energy flow inside a beam.
    var i, y;
    for (i = 0; i < 90; i++) {
      var a = trr(0.10, 0.85);
      var h = trr(1, H * 0.08);
      y = trr(0, H);
      ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      ctx.fillRect(0, y, W, h);
      if (y + h > H) { ctx.fillRect(0, y - H, W, h); }   // wrap for seamless v
    }
    // soften with horizontal streaks
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + trr(0.03, 0.14).toFixed(3) + ')';
      ctx.fillRect(trr(0, W), 0, trr(1, W * 0.25), H);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ==========================================================================
   * 5. SHADERS
   * --------------------------------------------------------------------------
   * Every particle is integrated ANALYTICALLY in the vertex shader:
   *
   *     v' = -k·v + g      →     v(t) = v₀e^{-kt} + g·(1-e^{-kt})/k
   *                              p(t) = p₀ + v₀·f + (g/k)(t - f),  f = (1-e^{-kt})/k
   *
   * so the CPU touches a particle exactly ONCE (at spawn) and never again.
   * That is what lets a meteor barrage throw 2000 particles without a hitch.
   *
   * Attribute budget is 9 (position + 8 instanced) — comfortably inside the
   * 16-attribute floor every real WebGL1 device ships.
   * ======================================================================== */

  var PARTICLE_VS = [
    'uniform float uTime;',
    'uniform vec2  uGrid;',
    'uniform float uInset;',
    'uniform float uSizeMul;',
    'uniform float uAlphaMul;',
    '',
    'attribute vec3 iStart;',    // spawn position
    'attribute vec3 iVel;',      // spawn velocity
    'attribute vec4 iTime;',     // t0, 1/life, fadeIn, fadeOutStart
    'attribute vec4 iSizeRot;',  // size0, size1, rot0, rotSpeed
    'attribute vec3 iColA;',     // colour at birth   (LINEAR)
    'attribute vec3 iColB;',     // colour at death   (LINEAR)
    'attribute vec4 iParams;',   // drag, gravity, tile, stretch
    'attribute vec4 iExtra;',    // alpha, turbulence, groundY, flicker
    '',
    'varying vec2  vUv;',
    'varying vec4  vCol;',
    'varying float vFogDepth;',
    '',
    'void main() {',
    '  float age = uTime - iTime.x;',
    '  float t01 = age * iTime.y;',
    // Dead / unborn particles get a clip-space position that is always culled.
    // Cheaper and more reliable than zero-sizing the quad.
    '  if ( t01 < 0.0 || t01 >= 1.0 ) {',
    '    vUv = vec2( 0.0 ); vCol = vec4( 0.0 ); vFogDepth = 0.0;',
    '    gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );',
    '    return;',
    '  }',
    '',
    '  float k = iParams.x;',
    '  float g = iParams.y;',
    '  vec3  p;',
    '  vec3  v;',
    '  if ( k > 0.001 ) {',
    '    float e = exp( -k * age );',
    '    float f = ( 1.0 - e ) / k;',
    '    p = iStart + iVel * f + vec3( 0.0, g * ( ( age - f ) / k ), 0.0 );',
    '    v = iVel * e + vec3( 0.0, g * f, 0.0 );',
    '  } else {',
    '    p = iStart + iVel * age + vec3( 0.0, 0.5 * g * age * age, 0.0 );',
    '    v = iVel + vec3( 0.0, g * age, 0.0 );',
    '  }',
    '',
    // Curl-ish turbulence. Scaled by age so particles leave the emitter cleanly
    // and only start wandering once they are big and slow — which is how real
    // smoke behaves and why cheap effects that wobble from frame 1 look wrong.
    '  float turb = iExtra.y;',
    '  if ( turb > 0.0001 ) {',
    '    float s = iStart.x * 3.7 + iStart.z * 2.3 + iStart.y * 1.9;',
    '    p += vec3( sin( age * 2.7 + s ), sin( age * 2.1 + s * 1.7 ) * 0.55, cos( age * 2.3 + s * 0.7 ) ) * ( turb * age );',
    '  }',
    '',
    // Ground plane stop — blood, gibs and debris settle instead of sinking.
    '  float gy = iExtra.z;',
    '  if ( p.y < gy ) { p.y = gy; v = vec3( v.x * 0.2, 0.0, v.z * 0.2 ); }',
    '',
    '  vec4 mv = modelViewMatrix * vec4( p, 1.0 );',
    '  vFogDepth = -mv.z;',
    '',
    '  float size = mix( iSizeRot.x, iSizeRot.y, t01 ) * uSizeMul;',
    '  vec2 corner;',
    '  float stretch = iParams.w;',
    '  if ( stretch > 0.0001 ) {',
    // Velocity-aligned stretch: sparks and blood become streaks whose length
    // tracks their real speed, so a fast spark IS a longer streak.
    '    vec3 vv = ( modelViewMatrix * vec4( v, 0.0 ) ).xyz;',
    '    vec2 d = vv.xy;',
    '    float dl = length( d );',
    '    vec2 ax = ( dl > 0.0001 ) ? ( d / dl ) : vec2( 0.0, 1.0 );',
    '    vec2 ay = vec2( -ax.y, ax.x );',
    '    float st = 1.0 + stretch * dl;',
    '    corner = ay * ( position.x * size ) + ax * ( position.y * size * st );',
    '  } else {',
    '    float ang = iSizeRot.z + iSizeRot.w * age;',
    '    float sa = sin( ang ), ca = cos( ang );',
    '    corner = vec2( position.x * ca - position.y * sa, position.x * sa + position.y * ca ) * size;',
    '  }',
    '  mv.xy += corner;',
    '  gl_Position = projectionMatrix * mv;',
    '',
    '  float tile = iParams.z;',
    '  float cx = mod( tile, uGrid.x );',
    '  float cy = floor( tile / uGrid.x );',
    '  vec2 cell = mix( vec2( uInset ), vec2( 1.0 - uInset ), position.xy + 0.5 );',
    '  vUv = ( vec2( cx, cy ) + cell ) / uGrid;',
    '',
    '  float a = iExtra.x * uAlphaMul;',
    '  a *= smoothstep( 0.0, max( iTime.z, 0.0001 ), t01 );',
    '  a *= 1.0 - smoothstep( iTime.w, 1.0, t01 );',
    '  float fl = iExtra.w;',
    '  if ( fl > 0.0001 ) {',
    '    a *= 1.0 - fl * 0.5 * ( 1.0 + sin( uTime * 34.0 + iStart.x * 7.3 + iStart.y * 3.1 ) );',
    '  }',
    '  vCol = vec4( mix( iColA, iColB, t01 ), a );',
    '}'
  ].join('\n');

  var PARTICLE_FS = [
    'uniform sampler2D uMap;',
    'uniform vec3  uFogColor;',
    'uniform float uFogDensity;',
    '',
    'varying vec2  vUv;',
    'varying vec4  vCol;',
    'varying float vFogDepth;',
    '',
    'void main() {',
    '  vec4 t = texture2D( uMap, vUv );',
    '  float a = vCol.a * t.a;',
    '  if ( a < 0.004 ) discard;',
    '  vec3 c = vCol.rgb * t.rgb;',
    // Exponential-squared fog, matched to the scene's FogExp2 by hand: a
    // ShaderMaterial gets no automatic fog, and unfogged particles floating in
    // front of fogged geometry is the loudest "this is a hack" tell there is.
    '  float f = clamp( 1.0 - exp( -uFogDensity * uFogDensity * vFogDepth * vFogDepth ), 0.0, 1.0 );',
    '  #ifdef ADDITIVE_FOG',
    '    c *= ( 1.0 - f );',           // additive light is absorbed, not tinted
    '  #else',
    '    c = mix( c, uFogColor, f );',
    '  #endif',
    '  gl_FragColor = vec4( c, a );',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '}'
  ].join('\n');

  /* ---- ground decals ------------------------------------------------------ */

  var DECAL_VS = [
    'uniform float uTime;',
    'uniform vec2  uGrid;',
    'uniform float uInset;',
    'uniform float uAlphaMul;',
    '',
    'attribute vec3 iPos;',     // world anchor (y is the decal height)
    'attribute vec4 iTime;',    // t0, 1/life, fadeIn, fadeOutStart
    'attribute vec4 iSize;',    // r0, r1, rotation, tile
    'attribute vec3 iColA;',
    'attribute vec3 iColB;',
    'attribute vec4 iExtra;',   // alpha, aspect, easeOutGrowth, spin
    '',
    'varying vec2  vUv;',
    'varying vec4  vCol;',
    'varying float vFogDepth;',
    '',
    'void main() {',
    '  float age = uTime - iTime.x;',
    '  float t01 = age * iTime.y;',
    '  if ( t01 < 0.0 || t01 >= 1.0 ) {',
    '    vUv = vec2( 0.0 ); vCol = vec4( 0.0 ); vFogDepth = 0.0;',
    '    gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );',
    '    return;',
    '  }',
    // Shockwaves must decelerate or they read as a flat wipe; ease-out growth is
    // the entire difference between "ring" and "impact".
    '  float e = ( iExtra.z > 0.5 ) ? ( 1.0 - pow( 1.0 - t01, 3.0 ) ) : t01;',
    '  float r = mix( iSize.x, iSize.y, e );',
    '  float rot = iSize.z + iExtra.w * age;',
    '  vec2 q = vec2( position.x, position.y * iExtra.y ) * r;',
    '  float sa = sin( rot ), ca = cos( rot );',
    '  q = vec2( q.x * ca - q.y * sa, q.x * sa + q.y * ca );',
    '  vec3 wp = iPos + vec3( q.x, 0.0, q.y );',
    '  vec4 mv = modelViewMatrix * vec4( wp, 1.0 );',
    '  vFogDepth = -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '',
    '  float tile = iSize.w;',
    '  float cx = mod( tile, uGrid.x );',
    '  float cy = floor( tile / uGrid.x );',
    '  vec2 cell = mix( vec2( uInset ), vec2( 1.0 - uInset ), position.xy + 0.5 );',
    '  vUv = ( vec2( cx, cy ) + cell ) / uGrid;',
    '',
    '  float a = iExtra.x * uAlphaMul;',
    '  a *= smoothstep( 0.0, max( iTime.z, 0.0001 ), t01 );',
    '  a *= 1.0 - smoothstep( iTime.w, 1.0, t01 );',
    '  vCol = vec4( mix( iColA, iColB, t01 ), a );',
    '}'
  ].join('\n');

  /* ---- floating text ------------------------------------------------------ */

  var TEXT_VS = [
    'uniform float uTime;',
    'uniform vec2  uGrid;',
    'uniform float uInset;',
    'uniform float uAlphaMul;',
    '',
    'attribute vec3 iAnchor;',  // world anchor of the whole string
    'attribute vec2 iOff;',     // this glyph's offset in em, relative to centre
    'attribute vec3 iTime;',    // t0, 1/life, unused
    'attribute vec3 iCol;',
    'attribute vec4 iInfo;',    // scale, glyph, riseHeight, drift
    '',
    'varying vec2  vUv;',
    'varying vec4  vCol;',
    '',
    'void main() {',
    '  float age = uTime - iTime.x;',
    '  float t01 = age * iTime.y;',
    '  if ( t01 < 0.0 || t01 >= 1.0 ) {',
    '    vUv = vec2( 0.0 ); vCol = vec4( 0.0 );',
    '    gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );',
    '    return;',
    '  }',
    // Rise fast then settle (ease-out quad-ish) — numbers that rise linearly
    // look like a spreadsheet scrolling; this reads as "knocked loose".
    '  float rise = iInfo.z * ( 1.0 - pow( 1.0 - t01, 2.4 ) );',
    '  float drift = iInfo.w * t01;',
    '  vec3 wp = iAnchor + vec3( drift, rise, 0.0 );',
    '  vec4 mv = modelViewMatrix * vec4( wp, 1.0 );',
    '',
    // easeOutBack pop-in, then a slight shrink on the way out.
    '  float tp = clamp( t01 / 0.16, 0.0, 1.0 );',
    '  float u = tp - 1.0;',
    '  float back = 1.0 + 2.70158 * u * u * u + 1.70158 * u * u;',
    '  float pop = mix( 0.35, 1.0, back );',
    '  pop *= 1.0 - 0.30 * smoothstep( 0.72, 1.0, t01 );',
    '  float s = iInfo.x * pop;',
    '  mv.xy += ( iOff + position.xy ) * s;',
    '  gl_Position = projectionMatrix * mv;',
    '',
    '  float glyph = iInfo.y;',
    '  float cx = mod( glyph, uGrid.x );',
    '  float cy = floor( glyph / uGrid.x );',
    '  vec2 cell = mix( vec2( uInset ), vec2( 1.0 - uInset ), position.xy + 0.5 );',
    '  vUv = ( vec2( cx, cy ) + cell ) / uGrid;',
    '',
    '  float a = uAlphaMul;',
    '  a *= smoothstep( 0.0, 0.06, t01 );',
    '  a *= 1.0 - smoothstep( 0.68, 1.0, t01 );',
    '  vCol = vec4( iCol, a );',
    '}'
  ].join('\n');

  var TEXT_FS = [
    'uniform sampler2D uMap;',
    'varying vec2 vUv;',
    'varying vec4 vCol;',
    'void main() {',
    '  vec4 t = texture2D( uMap, vUv );',
    '  float a = t.a * vCol.a;',
    '  if ( a < 0.01 ) discard;',
    // t.r is the body/outline mask: 1 = glyph body (take the tint), 0 = outline
    // (stay black). One texture gives readable text over any background.
    '  vec3 c = vCol.rgb * t.r;',
    '  gl_FragColor = vec4( c, a );',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '}'
  ].join('\n');

  /* ---- ribbons (trails, lightning, tracers) -------------------------------- */

  var RIBBON_VS = [
    'attribute vec4 aCol;',
    'varying vec2 vUv;',
    'varying vec4 vCol;',
    'varying float vFogDepth;',
    'void main() {',
    '  vUv = uv;',
    '  vCol = aCol;',
    '  vec4 mv = modelViewMatrix * vec4( position, 1.0 );',
    '  vFogDepth = -mv.z;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var RIBBON_FS = [
    'uniform sampler2D uMap;',
    'uniform vec3  uFogColor;',
    'uniform float uFogDensity;',
    'varying vec2 vUv;',
    'varying vec4 vCol;',
    'varying float vFogDepth;',
    'void main() {',
    '  vec4 t = texture2D( uMap, vUv );',
    '  float a = t.a * vCol.a;',
    '  if ( a < 0.004 ) discard;',
    '  vec3 c = vCol.rgb * t.rgb;',
    '  float f = clamp( 1.0 - exp( -uFogDensity * uFogDensity * vFogDepth * vFogDepth ), 0.0, 1.0 );',
    '  #ifdef ADDITIVE_FOG',
    '    c *= ( 1.0 - f );',
    '  #else',
    '    c = mix( c, uFogColor, f );',
    '  #endif',
    '  gl_FragColor = vec4( c, a );',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '}'
  ].join('\n');

  /* ---- energy beams -------------------------------------------------------- */

  var BEAM_VS = [
    'uniform float uTime;',
    'varying vec2  vUv;',
    'varying float vRim;',
    'void main() {',
    '  vUv = uv;',
    '  vec4 mv = modelViewMatrix * vec4( position, 1.0 );',
    '  vec3 n = normalize( normalMatrix * normal );',
    // Silhouette-weighted alpha turns a flat tube into a volume: bright where
    // we graze the surface, transparent where we look straight through it.
    '  vRim = 1.0 - abs( dot( n, normalize( -mv.xyz ) ) );',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var BEAM_FS = [
    'uniform sampler2D uMap;',
    'uniform float uTime;',
    'uniform float uAlpha;',
    'uniform float uScroll;',
    'uniform vec3  uColA;',
    'uniform vec3  uColB;',
    'varying vec2  vUv;',
    'varying float vRim;',
    'void main() {',
    '  float n1 = texture2D( uMap, vec2( vUv.x * 2.0, vUv.y * 1.3 - uTime * uScroll ) ).r;',
    '  float n2 = texture2D( uMap, vec2( vUv.x * 3.7 + 0.37, vUv.y * 0.7 - uTime * uScroll * 0.55 ) ).r;',
    '  float n = n1 * 0.65 + n2 * 0.55;',
    '  float rim = pow( clamp( vRim, 0.0, 1.0 ), 1.35 );',
    // Ends taper so the beam does not stop with a hard disc in mid-air.
    '  float caps = smoothstep( 0.0, 0.06, vUv.y ) * ( 1.0 - smoothstep( 0.90, 1.0, vUv.y ) );',
    '  float a = uAlpha * caps * ( 0.30 + 0.70 * rim ) * ( 0.45 + 0.75 * n );',
    '  if ( a < 0.004 ) discard;',
    // Hot white core toward the middle of the tube, saturated colour at the rim.
    '  vec3 c = mix( uColA, uColB, clamp( rim * 1.15, 0.0, 1.0 ) ) * ( 0.75 + 0.9 * n );',
    '  gl_FragColor = vec4( c, clamp( a, 0.0, 1.0 ) );',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '}'
  ].join('\n');

  /* ==========================================================================
   * 6. INSTANCED PARTICLE LAYER
   * --------------------------------------------------------------------------
   * One draw call per layer. Slots are handed out from a ring cursor: when we
   * wrap, the oldest particles are the ones overwritten, which is exactly the
   * behaviour you want under burst pressure.
   * ======================================================================== */

  var QUAD_POS = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
  var QUAD_IDX = new Uint16Array([0, 1, 2, 0, 2, 3]);

  function makeQuadGeometry() {
    var g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(QUAD_POS.slice(), 3));
    g.setIndex(new THREE.BufferAttribute(QUAD_IDX.slice(), 1));
    g.instanceCount = 0;
    // Instanced geometry has no meaningful bounds; culling it by the unit quad
    // would pop the entire layer out of view the moment the camera pans.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);
    return g;
  }

  function InstancedLayer(cap, specs) {
    this.cap = cap;
    this.cursor = 0;
    this.count = 0;            // instanceCount high-water
    this.wrapped = false;
    this.dMin = cap; this.dMax = -1;
    this.live = 0;             // rough estimate for the perf HUD
    this.lastSpawn = -1e9;
    this.maxLife = 0;
    this.mesh = null;          // wired up in init(); lets flush() hide an idle layer
    this.geo = makeQuadGeometry();
    this.arr = {};
    this.attr = {};
    this.itemSize = {};
    for (var i = 0; i < specs.length; i++) {
      var nm = specs[i][0], sz = specs[i][1];
      var data = new Float32Array(cap * sz);
      var at = new THREE.InstancedBufferAttribute(data, sz);
      if (at.setUsage) { at.setUsage(THREE.DynamicDrawUsage); }
      else { at.dynamic = true; }
      this.geo.setAttribute(nm, at);
      this.arr[nm] = data;
      this.attr[nm] = at;
      this.itemSize[nm] = sz;
    }
    this.names = [];
    for (var k in this.arr) { if (Object.prototype.hasOwnProperty.call(this.arr, k)) { this.names.push(k); } }
  }

  /** Claim the next ring slot and mark it dirty. Returns the slot index. */
  InstancedLayer.prototype.slot = function (life, now) {
    var i = this.cursor++;
    if (this.cursor >= this.cap) { this.cursor = 0; this.wrapped = true; }
    if (!this.wrapped && this.cursor > this.count) { this.count = this.cursor; }
    else if (this.wrapped) { this.count = this.cap; }
    if (i < this.dMin) { this.dMin = i; }
    if (i > this.dMax) { this.dMax = i; }
    this.lastSpawn = now;
    if (life > this.maxLife) { this.maxLife = life; }
    return i;
  };

  /** Upload only the slice we touched this frame. */
  InstancedLayer.prototype.flush = function (now) {
    if (this.dMax >= this.dMin) {
      var lo = this.dMin, hi = this.dMax;
      for (var i = 0; i < this.names.length; i++) {
        var nm = this.names[i], sz = this.itemSize[nm], at = this.attr[nm];
        at.updateRange.offset = lo * sz;
        at.updateRange.count = (hi - lo + 1) * sz;
        at.needsUpdate = true;
      }
      this.dMin = this.cap; this.dMax = -1;
    }
    // Everything has expired and nothing new arrived: collapse the draw range
    // back to zero so idle frames cost nothing at all.
    if (this.count > 0 && now > this.lastSpawn + this.maxLife + 0.05) {
      this.count = 0; this.cursor = 0; this.wrapped = false; this.maxLife = 0;
    }
    this.geo.instanceCount = this.count;
    // three still issues a draw call for a zero-instance geometry, so hide the
    // whole mesh instead: an idle battlefield costs literally nothing.
    if (this.mesh) { this.mesh.visible = this.count > 0; }
  };

  InstancedLayer.prototype.clear = function () {
    var arr = this.arr, k, i;
    for (k in arr) {
      if (Object.prototype.hasOwnProperty.call(arr, k)) {
        arr[k].fill(0);
        this.attr[k].updateRange.offset = 0;
        this.attr[k].updateRange.count = -1;
        this.attr[k].needsUpdate = true;
      }
    }
    // Zeroing iTime would leave 1/life = 0, i.e. t01 pinned at 0 — a particle
    // that never expires. Stamp every record as long-dead instead, so that if
    // the ring ever draws these slots again they are culled in the vertex
    // shader rather than lingering as invisible-but-shaded quads.
    if (arr.iTime) {
      var stride = this.itemSize.iTime, t = arr.iTime;
      for (i = 0; i < this.cap; i++) {
        t[i * stride] = -1e9;
        t[i * stride + 1] = 1;
      }
    }
    this.cursor = 0; this.count = 0; this.wrapped = false;
    this.dMin = this.cap; this.dMax = -1;
    this.maxLife = 0; this.lastSpawn = -1e9;
    this.geo.instanceCount = 0;
  };

  InstancedLayer.prototype.dispose = function () {
    try { this.geo.dispose(); } catch (e) { /* ignore */ }
  };

  /* ==========================================================================
   * 7. MODULE STATE + SCRATCH (never allocate any of this per frame)
   * ======================================================================== */

  var ready = false, failed = false, initing = false;
  var scene = null, camera = null, fxRoot = null;
  var vtime = 0;                 // VFX clock: pause-aware and speed-aware
  var realTime = 0;
  var hitstopT = 0;
  var lastDt = 1 / 60;

  var layerAdd = null, layerAlpha = null;      // particles
  var decalAlpha = null, decalAdd = null;      // ground decals
  var textLayer = null;

  var matAdd = null, matAlpha = null, matDecalA = null, matDecalAdd = null, matText = null;
  var matRibbonAdd = null, matRibbonAlpha = null, matBeam = null;
  var meshAdd = null, meshAlpha = null, meshDecalA = null, meshDecalAdd = null, meshText = null;

  var texParticles = null, texDecals = null, texGlyphs = null, texStrip = null, texBeamNoise = null;

  var _v1 = new THREE.Vector3();
  var _v2 = new THREE.Vector3();
  var _v3 = new THREE.Vector3();
  var _v4 = new THREE.Vector3();
  var _v5 = new THREE.Vector3();
  var _q1 = new THREE.Quaternion();
  var _m1 = new THREE.Matrix4();
  var _sc1 = new THREE.Vector3(1, 1, 1);
  var _UP = new THREE.Vector3(0, 1, 0);
  var _camPos = new THREE.Vector3();

  var stats = { particles: 0, decals: 0, trails: 0, texts: 0, powers: 0, drawCalls: 0 };

  /* --------------------------------------------------------------------------
   * The particle descriptor. ONE object, reused for every single spawn in the
   * game — this is why a 400-particle explosion allocates nothing.
   * ------------------------------------------------------------------------ */
  var pd = {
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    life: 1,
    s0: 1, s1: 1,
    rot: 0, rotV: 0,
    cA: PAL.white, cB: PAL.white,
    drag: 0, grav: 0, tile: P_GLOW, stretch: 0,
    alpha: 1, fadeIn: 0.06, fadeOut: 0.55,
    turb: 0, groundY: -1000, flicker: 0
  };

  function pdReset() {
    pd.x = 0; pd.y = 0; pd.z = 0;
    pd.vx = 0; pd.vy = 0; pd.vz = 0;
    pd.life = 1;
    pd.s0 = 1; pd.s1 = 1;
    pd.rot = 0; pd.rotV = 0;
    pd.cA = PAL.white; pd.cB = PAL.white;
    pd.drag = 0; pd.grav = 0; pd.tile = P_GLOW; pd.stretch = 0;
    pd.alpha = 1; pd.fadeIn = 0.06; pd.fadeOut = 0.55;
    pd.turb = 0; pd.groundY = -1000; pd.flicker = 0;
    return pd;
  }

  /** Write the descriptor into a layer slot. */
  function emitP(layer) {
    if (!layer) { return -1; }
    var life = pd.life > 0.001 ? pd.life : 0.001;
    var i = layer.slot(life, vtime);
    var a = layer.arr, i3 = i * 3, i4 = i * 4;

    var s = a.iStart; s[i3] = pd.x; s[i3 + 1] = pd.y; s[i3 + 2] = pd.z;
    var v = a.iVel;   v[i3] = pd.vx; v[i3 + 1] = pd.vy; v[i3 + 2] = pd.vz;

    var t = a.iTime;
    t[i4] = vtime; t[i4 + 1] = 1 / life;
    t[i4 + 2] = pd.fadeIn; t[i4 + 3] = pd.fadeOut;

    var sr = a.iSizeRot;
    sr[i4] = pd.s0; sr[i4 + 1] = pd.s1; sr[i4 + 2] = pd.rot; sr[i4 + 3] = pd.rotV;

    var ca = a.iColA, cb = a.iColB, A = pd.cA, B = pd.cB;
    ca[i3] = A[0]; ca[i3 + 1] = A[1]; ca[i3 + 2] = A[2];
    cb[i3] = B[0]; cb[i3 + 1] = B[1]; cb[i3 + 2] = B[2];

    var pp = a.iParams;
    pp[i4] = pd.drag; pp[i4 + 1] = pd.grav; pp[i4 + 2] = pd.tile; pp[i4 + 3] = pd.stretch;

    var ex = a.iExtra;
    ex[i4] = pd.alpha; ex[i4 + 1] = pd.turb; ex[i4 + 2] = pd.groundY; ex[i4 + 3] = pd.flicker;

    return i;
  }

  /* --------------------------------------------------------------------------
   * The decal descriptor.
   * ------------------------------------------------------------------------ */
  var dd = {
    x: 0, y: 0.02, z: 0,
    r0: 1, r1: 1, life: 6,
    rot: 0, tile: D_POOL, aspect: 1, spin: 0,
    cA: PAL.white, cB: PAL.white,
    alpha: 1, fadeIn: 0.02, fadeOut: 0.55, ease: 0
  };

  function ddReset() {
    dd.x = 0; dd.y = 0.02; dd.z = 0;
    dd.r0 = 1; dd.r1 = 1; dd.life = 6;
    dd.rot = 0; dd.tile = D_POOL; dd.aspect = 1; dd.spin = 0;
    dd.cA = PAL.white; dd.cB = PAL.white;
    dd.alpha = 1; dd.fadeIn = 0.02; dd.fadeOut = 0.55; dd.ease = 0;
    return dd;
  }

  function emitD(layer) {
    if (!layer) { return -1; }
    var life = dd.life > 0.001 ? dd.life : 0.001;
    var i = layer.slot(life, vtime);
    var a = layer.arr, i3 = i * 3, i4 = i * 4;

    var p = a.iPos; p[i3] = dd.x; p[i3 + 1] = dd.y; p[i3 + 2] = dd.z;

    var t = a.iTime;
    t[i4] = vtime; t[i4 + 1] = 1 / life; t[i4 + 2] = dd.fadeIn; t[i4 + 3] = dd.fadeOut;

    var sz = a.iSize;
    sz[i4] = dd.r0; sz[i4 + 1] = dd.r1; sz[i4 + 2] = dd.rot; sz[i4 + 3] = dd.tile;

    var ca = a.iColA, cb = a.iColB, A = dd.cA, B = dd.cB;
    ca[i3] = A[0]; ca[i3 + 1] = A[1]; ca[i3 + 2] = A[2];
    cb[i3] = B[0]; cb[i3 + 1] = B[1]; cb[i3 + 2] = B[2];

    var ex = a.iExtra;
    ex[i4] = dd.alpha; ex[i4 + 1] = dd.aspect; ex[i4 + 2] = dd.ease; ex[i4 + 3] = dd.spin;

    return i;
  }

  /* ==========================================================================
   * 8. MATERIAL CONSTRUCTION
   * ======================================================================== */

  function commonUniforms(map, grid, inset) {
    return {
      uTime:       { value: 0 },
      uMap:        { value: map },
      uGrid:       { value: new THREE.Vector2(grid[0], grid[1]) },
      uInset:      { value: inset },
      uSizeMul:    { value: 1 },
      uAlphaMul:   { value: 1 },
      uFogColor:   { value: new THREE.Color(0.05, 0.06, 0.08) },
      uFogDensity: { value: 0.003 }
    };
  }

  function makeParticleMaterial(map, additive) {
    var m = new THREE.ShaderMaterial({
      uniforms: commonUniforms(map, [4, 4], 0.004),
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide
    });
    if (additive) { m.defines = { ADDITIVE_FOG: '' }; }
    return m;
  }

  function makeDecalMaterial(map, additive) {
    var m = new THREE.ShaderMaterial({
      uniforms: commonUniforms(map, [4, 4], 0.004),
      vertexShader: DECAL_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
      // Ground decals sit microscopically above y=0 AND get a polygon offset:
      // belt and braces, because z-fighting on a 400 m ground plane at a
      // grazing camera angle is otherwise guaranteed.
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8
    });
    if (additive) { m.defines = { ADDITIVE_FOG: '' }; }
    return m;
  }

  function makeTextMaterial(map) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime:     { value: 0 },
        uMap:      { value: map },
        uGrid:     { value: new THREE.Vector2(GLYPH_COLS, GLYPH_ROWS) },
        uInset:    { value: 0.002 },
        uAlphaMul: { value: 1 }
      },
      vertexShader: TEXT_VS,
      fragmentShader: TEXT_FS,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide
    });
  }

  function makeRibbonMaterial(additive) {
    var m = new THREE.ShaderMaterial({
      uniforms: {
        uMap:        { value: texStrip },
        uFogColor:   { value: new THREE.Color(0.05, 0.06, 0.08) },
        uFogDensity: { value: 0.003 }
      },
      vertexShader: RIBBON_VS,
      fragmentShader: RIBBON_FS,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide
    });
    if (additive) { m.defines = { ADDITIVE_FOG: '' }; }
    return m;
  }

  /* ==========================================================================
   * 9. INIT
   * ======================================================================== */

  function resolveRender() {
    var Rr = AOW.Render;
    if (!Rr || !Rr.ready || !Rr.scene || !Rr.camera) { return null; }
    return Rr;
  }

  function init(opts) {
    if (ready) { return true; }
    if (failed || initing) { return false; }
    initing = true;
    opts = opts || {};

    try {
      R = resolveRender();
      if (!R) { initing = false; return false; }     // try again next frame

      scene = R.scene;
      camera = R.camera;

      // Pick the starting tier from whatever the renderer negotiated.
      var t = normTier(opts.tier) || normTier(R.perf && R.perf.tier) ||
              normTier(Core && Core.perf && Core.perf.tier) || 'high';
      qTier = t; Q = QCFG[t];

      // ---- textures --------------------------------------------------------
      texParticles = makeTex('particles', 512, 512, drawParticleAtlas);
      texDecals    = makeTex('decals', 512, 512, drawDecalAtlas);
      texGlyphs    = makeTex('glyphs', 1024, 512, drawGlyphAtlas);
      texStrip     = makeTex('strip', 64, 64, drawTrailStrip);
      texBeamNoise = makeTex('beamnoise', 64, 256, drawBeamNoise, { repeat: true });
      if (!texParticles || !texDecals) {
        throw new Error('particle/decal atlas could not be generated');
      }

      // ---- host group ------------------------------------------------------
      fxRoot = new THREE.Group();
      fxRoot.name = 'AOW.VFX';
      fxRoot.matrixAutoUpdate = false;               // it never moves
      if (typeof R.addObject === 'function') { R.addObject(fxRoot, 'fx'); }
      else { scene.add(fxRoot); }

      // ---- particle layers -------------------------------------------------
      var pSpecs = [
        ['iStart', 3], ['iVel', 3], ['iTime', 4], ['iSizeRot', 4],
        ['iColA', 3], ['iColB', 3], ['iParams', 4], ['iExtra', 4]
      ];
      layerAlpha = new InstancedLayer(CAP.partAlpha, pSpecs);
      layerAdd   = new InstancedLayer(CAP.partAdd, pSpecs);

      matAlpha = makeParticleMaterial(texParticles, false);
      matAdd   = makeParticleMaterial(texParticles, true);

      meshAlpha = new THREE.Mesh(layerAlpha.geo, matAlpha);
      meshAdd   = new THREE.Mesh(layerAdd.geo, matAdd);

      // ---- decal layers ----------------------------------------------------
      var dSpecs = [
        ['iPos', 3], ['iTime', 4], ['iSize', 4],
        ['iColA', 3], ['iColB', 3], ['iExtra', 4]
      ];
      decalAlpha = new InstancedLayer(CAP.decalAlpha, dSpecs);
      decalAdd   = new InstancedLayer(CAP.decalAdd, dSpecs);

      matDecalA   = makeDecalMaterial(texDecals, false);
      matDecalAdd = makeDecalMaterial(texDecals, true);

      meshDecalA   = new THREE.Mesh(decalAlpha.geo, matDecalA);
      meshDecalAdd = new THREE.Mesh(decalAdd.geo, matDecalAdd);

      // ---- text layer ------------------------------------------------------
      var tSpecs = [
        ['iAnchor', 3], ['iOff', 2], ['iTime', 3], ['iCol', 3], ['iInfo', 4]
      ];
      textLayer = new InstancedLayer(CAP.glyphs, tSpecs);
      matText = makeTextMaterial(texGlyphs);
      meshText = new THREE.Mesh(textLayer.geo, matText);

      // ---- ribbon + beam materials ----------------------------------------
      matRibbonAdd   = makeRibbonMaterial(true);
      matRibbonAlpha = makeRibbonMaterial(false);
      matBeam = new THREE.ShaderMaterial({
        uniforms: {
          uMap:    { value: texBeamNoise },
          uTime:   { value: 0 },
          uAlpha:  { value: 1 },
          uScroll: { value: 1.2 },
          uColA:   { value: new THREE.Vector3(1, 1, 1) },
          uColB:   { value: new THREE.Vector3(0.2, 0.6, 1) }
        },
        vertexShader: BEAM_VS,
        fragmentShader: BEAM_FS,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });

      // ---- render order ----------------------------------------------------
      // Decals hug the ground and must not occlude the particles above them;
      // text is always last so a damage number is never eaten by smoke.
      meshDecalA.renderOrder   = 5;
      meshDecalAdd.renderOrder = 6;
      meshAlpha.renderOrder    = 12;
      meshAdd.renderOrder      = 14;
      meshText.renderOrder     = 40;

      layerAlpha.mesh = meshAlpha;
      layerAdd.mesh = meshAdd;
      decalAlpha.mesh = meshDecalA;
      decalAdd.mesh = meshDecalAdd;
      textLayer.mesh = meshText;

      var meshes = [meshDecalA, meshDecalAdd, meshAlpha, meshAdd, meshText];
      for (var i = 0; i < meshes.length; i++) {
        meshes[i].frustumCulled = false;
        meshes[i].matrixAutoUpdate = false;
        meshes[i].castShadow = false;
        meshes[i].receiveShadow = false;
        meshes[i].visible = false;         // flush() turns them on when populated
        fxRoot.add(meshes[i]);
      }

      buildTrailPool();
      buildBeamPool();
      buildArrowPool();
      buildMeteorPool();
      buildLightPool();

      wireEvents();

      ready = true;
      initing = false;
      AOW.VFX.ready = true;
      console.info('[AOW.VFX] ready — tier=' + qTier +
        ' particles=' + (CAP.partAdd + CAP.partAlpha) +
        ' decals=' + (CAP.decalAlpha + CAP.decalAdd) +
        ' lights=' + Q.lights);
      busEmit('vfx:ready', { tier: qTier });
      return true;

    } catch (err) {
      failed = true;
      initing = false;
      console.warn('[AOW.VFX] init failed — the game runs without effects.', err);
      return false;
    }
  }

  function busOn(name, fn) {
    try {
      if (Core && typeof Core.on === 'function') { Core.on(name, fn); return true; }
    } catch (e) { /* fall through */ }
    return false;
  }

  function busEmit(name, payload) {
    try {
      if (Core && typeof Core.emit === 'function') { Core.emit(name, payload); }
    } catch (e) { /* a listener must never kill the frame */ }
  }

  /* ==========================================================================
   * 10. RIBBON TRAILS
   * --------------------------------------------------------------------------
   * A trail is a camera-facing strip rebuilt on the CPU each frame from a ring
   * of position samples. At 30 trails × 20 samples that is 600 vertices of work
   * per frame — nothing — and it buys sword arcs, arrow fletching, bullet
   * tracers and lightning from one code path.
   * ======================================================================== */

  var TRAIL_SEG = 22;
  var trails = [];        // pool
  var trailFree = [];

  function Trail(maxSeg) {
    this.maxSeg = maxSeg;
    this.px = new Float32Array(maxSeg);
    this.py = new Float32Array(maxSeg);
    this.pz = new Float32Array(maxSeg);
    this.pt = new Float32Array(maxSeg);
    this.n = 0;
    this.head = -1;

    this.active = false;
    this.life = 0.30;          // how long a sample survives
    this.width = 0.18;
    this.alpha = 1;
    this.col = PAL.white;
    this.colTail = null;       // optional gradient toward the tail
    this.additive = true;
    this.idle = 0;             // seconds since the last push
    this.autoFree = 1.0;
    this.taper = 0.65;
    this.owner = null;

    var vcount = maxSeg * 2;
    this.pos = new Float32Array(vcount * 3);
    this.uvs = new Float32Array(vcount * 2);
    this.cols = new Float32Array(vcount * 4);

    var idx = new Uint16Array((maxSeg - 1) * 6);
    for (var i = 0; i < maxSeg - 1; i++) {
      var a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      var o = i * 6;
      idx[o] = a; idx[o + 1] = b; idx[o + 2] = c;
      idx[o + 3] = b; idx[o + 4] = d; idx[o + 5] = c;
    }
    for (var j = 0; j < maxSeg; j++) {
      var u = j / (maxSeg - 1);
      this.uvs[j * 4] = u;     this.uvs[j * 4 + 1] = 0;
      this.uvs[j * 4 + 2] = u; this.uvs[j * 4 + 3] = 1;
    }

    var g = new THREE.BufferGeometry();
    var pa = new THREE.BufferAttribute(this.pos, 3);
    var ca = new THREE.BufferAttribute(this.cols, 4);
    if (pa.setUsage) { pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage); }
    g.setAttribute('position', pa);
    g.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    g.setAttribute('aCol', ca);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

    this.geo = g;
    this.mesh = new THREE.Mesh(g, matRibbonAdd);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 16;
    this.mesh.visible = false;
  }

  Trail.prototype.reset = function (o) {
    this.n = 0; this.head = -1; this.idle = 0;
    this.life = num(o && o.life, 0.30);
    this.width = num(o && o.width, 0.18);
    this.alpha = num(o && o.alpha, 1);
    this.col = (o && o.color) ? LC(o.color) : ((o && o.colorLinear) || PAL.white);
    this.colTail = (o && o.colorTail) ? LC(o.colorTail) : null;
    this.additive = (o && o.additive === false) ? false : true;
    this.taper = num(o && o.taper, 0.65);
    this.autoFree = num(o && o.autoFree, this.life + 0.15);
    this.mesh.material = this.additive ? matRibbonAdd : matRibbonAlpha;
    this.mesh.renderOrder = this.additive ? 16 : 13;
    this.mesh.visible = true;
    this.active = true;
    this.geo.setDrawRange(0, 0);
  };

  Trail.prototype.push = function (x, y, z) {
    if (!this.active) { return; }
    // Skip samples that barely moved: duplicate points make degenerate quads
    // whose normals flip and flicker.
    if (this.n > 0) {
      var h = this.head;
      var dx = x - this.px[h], dy = y - this.py[h], dz = z - this.pz[h];
      if (dx * dx + dy * dy + dz * dz < 1e-6) { this.pt[h] = vtime; this.idle = 0; return; }
    }
    this.head = (this.head + 1) % this.maxSeg;
    this.px[this.head] = x; this.py[this.head] = y; this.pz[this.head] = z;
    this.pt[this.head] = vtime;
    if (this.n < this.maxSeg) { this.n++; }
    this.idle = 0;
  };

  Trail.prototype.free = function () {
    if (!this.active) { return; }
    this.active = false;
    this.n = 0; this.head = -1;
    this.mesh.visible = false;
    this.geo.setDrawRange(0, 0);
    trailFree.push(this);
  };

  Trail.prototype.sampleIndex = function (i) {
    return (this.head - this.n + 1 + i + this.maxSeg * 2) % this.maxSeg;
  };

  /** Rebuild the strip. Returns false when the trail has fully expired. */
  Trail.prototype.build = function () {
    var n = this.n;
    if (n < 2) { this.geo.setDrawRange(0, 0); return this.idle < this.autoFree; }

    var pos = this.pos, cols = this.cols;
    var maxSeg = this.maxSeg;
    var i, idx, idxN, idxP, alive = 0;
    var colHead = this.col, colTail = this.colTail || this.col;

    for (i = 0; i < n; i++) {
      idx = this.sampleIndex(i);
      idxN = this.sampleIndex(i < n - 1 ? i + 1 : i);
      idxP = this.sampleIndex(i > 0 ? i - 1 : i);

      _v1.set(this.px[idx], this.py[idx], this.pz[idx]);
      _v2.set(this.px[idxN] - this.px[idxP], this.py[idxN] - this.py[idxP], this.pz[idxN] - this.pz[idxP]);
      if (_v2.lengthSq() < 1e-9) { _v2.set(0, 1, 0); }
      _v2.normalize();

      _v3.copy(_camPos).sub(_v1);
      _v4.crossVectors(_v2, _v3);
      if (_v4.lengthSq() < 1e-9) { _v4.set(1, 0, 0); }
      _v4.normalize();

      var t = (n > 1) ? (i / (n - 1)) : 1;          // 0 = tail, 1 = head
      var age = clamp01((vtime - this.pt[idx]) / Math.max(0.001, this.life));
      var ageF = 1 - age;
      if (ageF > 0.001) { alive++; }

      var w = this.width * Math.pow(t, this.taper) * (0.25 + 0.75 * ageF);
      var a = this.alpha * ageF * ageF * (0.35 + 0.65 * t);

      var vi = i * 6;
      pos[vi]     = _v1.x + _v4.x * w;
      pos[vi + 1] = _v1.y + _v4.y * w;
      pos[vi + 2] = _v1.z + _v4.z * w;
      pos[vi + 3] = _v1.x - _v4.x * w;
      pos[vi + 4] = _v1.y - _v4.y * w;
      pos[vi + 5] = _v1.z - _v4.z * w;

      var r = lerp(colTail[0], colHead[0], t);
      var g = lerp(colTail[1], colHead[1], t);
      var b = lerp(colTail[2], colHead[2], t);
      var ci = i * 8;
      cols[ci] = r; cols[ci + 1] = g; cols[ci + 2] = b; cols[ci + 3] = a;
      cols[ci + 4] = r; cols[ci + 5] = g; cols[ci + 6] = b; cols[ci + 7] = a;
    }

    // Park the unused tail of the buffer on top of the last real vertex so no
    // stale geometry from a previous owner can flash for one frame.
    for (i = n; i < maxSeg; i++) {
      var vi2 = i * 6, src = (n - 1) * 6;
      pos[vi2] = pos[src]; pos[vi2 + 1] = pos[src + 1]; pos[vi2 + 2] = pos[src + 2];
      pos[vi2 + 3] = pos[src]; pos[vi2 + 4] = pos[src + 1]; pos[vi2 + 5] = pos[src + 2];
      var ci2 = i * 8;
      cols[ci2 + 3] = 0; cols[ci2 + 7] = 0;
    }

    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aCol.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
    return alive > 0 || this.idle < this.autoFree;
  };

  function buildTrailPool() {
    var i;
    for (i = 0; i < CAP.trails; i++) {
      var tr = new Trail(TRAIL_SEG);
      fxRoot.add(tr.mesh);
      trails.push(tr);
      trailFree.push(tr);
    }
  }

  function acquireTrail(o) {
    if (!ready) { return null; }
    var liveCount = trails.length - trailFree.length;
    if (liveCount >= Q.trails) { return null; }
    var tr = trailFree.pop();
    if (!tr) { return null; }
    tr.reset(o);
    return tr;
  }

  /* --- auto-driven trails (swing arcs, scripted sweeps) --------------------- */

  var autoTrails = [];       // {trail, t, dur, kind, params...}
  var autoTrailPool = [];

  function autoTrailGet() {
    var a = autoTrailPool.pop();
    if (!a) {
      a = { trail: null, t: 0, dur: 0, x: 0, y: 0, z: 0, r: 1, a0: 0, a1: 0, face: 1, tilt: 0, dead: false };
    }
    a.t = 0; a.dead = false;
    return a;
  }

  function updateAutoTrails(dt) {
    var i, a;
    for (i = autoTrails.length - 1; i >= 0; i--) {
      a = autoTrails[i];
      a.t += dt;
      var k = clamp01(a.t / a.dur);
      if (a.trail && a.trail.active) {
        if (k < 1) {
          // Ease-in-out sweep: the blade accelerates through the middle of the
          // arc and decelerates at both ends. Anticipation → action → recovery.
          var e = k < 0.5 ? (2 * k * k) : (1 - Math.pow(-2 * k + 2, 2) / 2);
          var ang = lerp(a.a0, a.a1, e);
          var ca = Math.cos(ang), sa = Math.sin(ang);
          a.trail.push(
            a.x + ca * a.r * a.face,
            a.y + sa * a.r,
            a.z + sa * a.r * a.tilt
          );
        } else {
          a.trail.free();
          a.trail = null;
        }
      }
      if (a.t > a.dur + 0.4) {
        if (a.trail) { a.trail.free(); a.trail = null; }
        autoTrails.splice(i, 1);
        autoTrailPool.push(a);
      }
    }
  }

  function updateTrails(dt) {
    var i, tr, live = 0;
    for (i = 0; i < trails.length; i++) {
      tr = trails[i];
      if (!tr.active) { continue; }
      tr.idle += dt;
      live++;
      if (!tr.build()) { tr.free(); }
    }
    stats.trails = live;
  }

  /* ==========================================================================
   * 11. ENERGY BEAMS
   * ======================================================================== */

  var beams = [];

  function buildBeamPool() {
    var geo = new THREE.CylinderBufferGeometry(1, 1, 1, 14, 1, true);
    var i;
    for (i = 0; i < CAP.beams; i++) {
      var mat = matBeam.clone();
      var mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 18;
      fxRoot.add(mesh);
      beams.push({
        mesh: mesh, mat: mat, active: false,
        t: 0, life: 1, fadeIn: 0.05, alpha: 1,
        radius: 0.4, pulse: 0, core: null
      });
    }
  }

  function orientBetween(mesh, ax, ay, az, bx, by, bz, radius) {
    _v1.set(bx - ax, by - ay, bz - az);
    var len = _v1.length();
    if (len < 1e-5) { len = 1e-5; }
    _v2.copy(_v1).multiplyScalar(1 / len);
    _q1.setFromUnitVectors(_UP, _v2);
    mesh.quaternion.copy(_q1);
    mesh.position.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
    mesh.scale.set(radius, len, radius);
    mesh.updateMatrix();
    mesh.updateMatrixWorld(true);
    return len;
  }

  function fireBeam(ax, ay, az, bx, by, bz, o) {
    if (!ready) { return null; }
    o = o || EMPTY;
    var b = null, i;
    for (i = 0; i < beams.length; i++) { if (!beams[i].active) { b = beams[i]; break; } }
    if (!b) { b = beams[0]; }        // steal the oldest rather than drop the cast

    var cA = o.colorA ? LC(o.colorA) : PAL.energyA;
    var cB = o.colorB ? LC(o.colorB) : eraTint();
    b.active = true;
    b.t = 0;
    b.life = num(o.life, 0.55);
    b.fadeIn = num(o.fadeIn, 0.05);
    b.alpha = num(o.alpha, 1);
    b.radius = num(o.radius, 0.4);
    b.pulse = num(o.pulse, 0);
    b.mat.uniforms.uColA.value.set(cA[0], cA[1], cA[2]);
    b.mat.uniforms.uColB.value.set(cB[0], cB[1], cB[2]);
    b.mat.uniforms.uScroll.value = num(o.scroll, 1.4);
    b.mesh.visible = true;
    b.ax = ax; b.ay = ay; b.az = az;
    b.bx = bx; b.by = by; b.bz = bz;
    orientBetween(b.mesh, ax, ay, az, bx, by, bz, b.radius);
    return b;
  }

  function updateBeams(dt) {
    var i, b;
    for (i = 0; i < beams.length; i++) {
      b = beams[i];
      if (!b.active) { continue; }
      b.t += dt;
      var k = b.t / b.life;
      if (k >= 1) {
        b.active = false;
        b.mesh.visible = false;
        continue;
      }
      var a = b.alpha;
      a *= clamp01(b.t / Math.max(0.001, b.fadeIn));
      a *= 1 - clamp01((k - 0.55) / 0.45);
      if (b.pulse > 0) { a *= 0.75 + 0.25 * Math.sin(vtime * 26 + i); }
      b.mat.uniforms.uAlpha.value = a;
      b.mat.uniforms.uTime.value = vtime;
      // Beams breathe: a thin sustained core that flares on impact reads as
      // energy under pressure rather than a static neon tube.
      var rk = 1 + 0.25 * Math.sin(vtime * 18 + i * 1.7) * (b.pulse > 0 ? 1 : 0.3);
      b.mesh.scale.x = b.radius * rk;
      b.mesh.scale.z = b.radius * rk;
      b.mesh.updateMatrix();
      b.mesh.updateMatrixWorld(true);
    }
  }

  /* ==========================================================================
   * 12. INSTANCED ARROWS (fly → stick → fade)
   * ======================================================================== */

  var arrowMesh = null, arrowMat = null;
  var arrows = [];          // packed active list
  var arrowFree = [];
  var _dummy = new THREE.Object3D();

  /** Concatenate several BufferGeometries. No BufferGeometryUtils is vendored. */
  function mergeGeoms(list) {
    var i, g, total = 0, geos = [];
    for (i = 0; i < list.length; i++) {
      g = list[i].index ? list[i].toNonIndexed() : list[i];
      geos.push(g);
      total += g.attributes.position.count;
    }
    var pos = new Float32Array(total * 3);
    var nor = new Float32Array(total * 3);
    var uv = new Float32Array(total * 2);
    var off = 0;
    for (i = 0; i < geos.length; i++) {
      g = geos[i];
      var pa = g.attributes.position.array;
      var na = g.attributes.normal ? g.attributes.normal.array : null;
      var ua = g.attributes.uv ? g.attributes.uv.array : null;
      var c = g.attributes.position.count;
      pos.set(pa, off * 3);
      if (na) { nor.set(na, off * 3); }
      if (ua) { uv.set(ua, off * 2); }
      off += c;
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  }

  function buildArrowGeometry() {
    var shaft = new THREE.CylinderBufferGeometry(0.022, 0.022, 1.0, 5, 1);
    var head = new THREE.ConeBufferGeometry(0.055, 0.20, 5);
    head.translate(0, 0.58, 0);
    var f1 = new THREE.BoxBufferGeometry(0.005, 0.20, 0.09);
    f1.translate(0, -0.40, 0.045);
    var f2 = new THREE.BoxBufferGeometry(0.09, 0.20, 0.005);
    f2.translate(0.045, -0.40, 0);
    return mergeGeoms([shaft, head, f1, f2]);
  }

  function buildArrowPool() {
    try {
      var geo = buildArrowGeometry();
      arrowMat = new THREE.MeshStandardMaterial({
        color: (R && R.color) ? R.color('#6b543a') : new THREE.Color(0x6b543a),
        roughness: 0.82, metalness: 0.08
      });
      arrowMesh = new THREE.InstancedMesh(geo, arrowMat, CAP.arrows);
      arrowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      arrowMesh.frustumCulled = false;
      arrowMesh.castShadow = false;
      arrowMesh.receiveShadow = false;
      arrowMesh.count = 0;
      arrowMesh.visible = false;
      fxRoot.add(arrowMesh);
      var i;
      for (i = 0; i < CAP.arrows; i++) {
        arrowFree.push({
          x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
          state: 0, t: 0, life: 8, spin: 0, scale: 1, groundY: 0,
          fletch: false, acc: 0
        });
      }
    } catch (e) {
      warnOnce('arrows', 'arrow pool unavailable — arrow rain will fall back to particles.', e);
      arrowMesh = null;
    }
  }

  function spawnArrow(x, y, z, vx, vy, vz, o) {
    if (!arrowMesh || arrows.length >= CAP.arrows) { return null; }
    var a = arrowFree.pop();
    if (!a) { return null; }
    a.x = x; a.y = y; a.z = z;
    a.vx = vx; a.vy = vy; a.vz = vz;
    a.state = 0; a.t = 0;
    a.life = num(o && o.life, 9);
    a.scale = num(o && o.scale, 1);
    a.groundY = num(o && o.groundY, 0);
    a.acc = 0;
    // Fletching trails go through the particle layer, NOT the ribbon pool: a
    // 45-arrow volley would otherwise cost 45 extra draw calls and starve the
    // weapon swings, which actually need real ribbons.
    a.fletch = !!(o && o.trail) && Q.count > 0.4;
    arrows.push(a);
    return a;
  }

  function updateArrows(dt) {
    var i, a, n = arrows.length;
    if (!arrowMesh) { return; }
    for (i = n - 1; i >= 0; i--) {
      a = arrows[i];
      a.t += dt;
      if (a.state === 0) {
        a.vy -= 28 * dt;                    // heavier than real gravity: arcs read faster
        a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
        if (a.fletch) {
          a.acc += dt * 26;
          while (a.acc >= 1) {
            a.acc -= 1;
            pdReset();
            pd.x = a.x; pd.y = a.y; pd.z = a.z;
            pd.vx = a.vx * 0.06; pd.vy = a.vy * 0.06; pd.vz = a.vz * 0.06;
            pd.life = 0.14;
            pd.s0 = 0.055 * a.scale; pd.s1 = 0.012;
            pd.cA = PAL.goldA; pd.cB = PAL.emberB;
            pd.tile = P_STREAK; pd.stretch = 0.22;
            pd.drag = 1.5; pd.alpha = 0.5; pd.fadeIn = 0.02; pd.fadeOut = 0.2;
            emitP(layerAdd);
          }
        }
        if (a.y <= a.groundY) {
          a.y = a.groundY;
          a.state = 1; a.t = 0;
          onArrowLand(a);
        }
      } else if (a.t > a.life) {
        arrows.splice(i, 1);
        arrowFree.push(a);
        continue;
      }
    }

    // Rewrite the packed instance matrices. Only the live prefix is drawn.
    var count = arrows.length;
    for (i = 0; i < count; i++) {
      a = arrows[i];
      _dummy.position.set(a.x, a.y, a.z);
      if (a.state === 0) {
        _v1.set(a.vx, a.vy, a.vz);
        if (_v1.lengthSq() < 1e-6) { _v1.set(0, -1, 0); }
        _v1.normalize().negate();          // arrow's +Y is its nock end
      } else {
        // Stuck: keep the impact angle, sink and shrink out at end of life.
        _v1.set(0, 1, 0);
      }
      _q1.setFromUnitVectors(_UP, _v1);
      _dummy.quaternion.copy(_q1);
      var s = a.scale;
      if (a.state === 1) {
        var k = clamp01((a.t - a.life * 0.75) / Math.max(0.001, a.life * 0.25));
        s *= (1 - k);
        _dummy.position.y = a.y + 0.42 * s;     // half-buried
      }
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      arrowMesh.setMatrixAt(i, _dummy.matrix);
    }
    arrowMesh.count = count;
    // A count-0 InstancedMesh still costs a draw call; hide it outright.
    arrowMesh.visible = count > 0;
    if (count > 0) { arrowMesh.instanceMatrix.needsUpdate = true; }
  }

  /* ==========================================================================
   * 13. METEOR / BOULDER PROJECTILES
   * ======================================================================== */

  var meteors = [];

  function buildMeteorPool() {
    try {
      var geo = new THREE.IcosahedronBufferGeometry(1, 1);
      var i;
      for (i = 0; i < CAP.meteors; i++) {
        var mat = new THREE.MeshStandardMaterial({
          color: (R && R.color) ? R.color('#3a2a22') : new THREE.Color(0x3a2a22),
          emissive: (R && R.color) ? R.color('#ff5a12') : new THREE.Color(0xff5a12),
          emissiveIntensity: 1.6,
          roughness: 0.95,
          metalness: 0.0,
          flatShading: true
        });
        var mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        mesh.castShadow = false;
        fxRoot.add(mesh);
        meteors.push({
          mesh: mesh, mat: mat, active: false,
          x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
          r: 1, t: 0, spinX: 0, spinZ: 0, trail: null, light: null,
          groundY: 0, onImpact: null, power: null
        });
      }
    } catch (e) {
      warnOnce('meteors', 'meteor pool unavailable', e);
    }
  }

  function spawnMeteor(x, y, z, vx, vy, vz, r, onImpact, power) {
    var m = null, i;
    for (i = 0; i < meteors.length; i++) { if (!meteors[i].active) { m = meteors[i]; break; } }
    if (!m) { return null; }
    m.active = true;
    m.x = x; m.y = y; m.z = z;
    m.vx = vx; m.vy = vy; m.vz = vz;
    m.r = r; m.t = 0;
    m.spinX = rr(-4, 4); m.spinZ = rr(-4, 4);
    m.groundY = 0;
    m.onImpact = onImpact || null;
    m.power = power || null;
    m.mesh.visible = true;
    m.mesh.scale.set(r, r * rr(0.82, 1.15), r);
    m.trail = acquireTrail({ life: 0.35, width: r * 0.85, additive: true, color: '#ffb14a', colorTail: '#ff2d00', alpha: 0.85, taper: 0.4 });
    m.light = acquireLight('#ff7a22', 2.4, r * 22);
    return m;
  }

  function updateMeteors(dt) {
    var i, m;
    for (i = 0; i < meteors.length; i++) {
      m = meteors[i];
      if (!m.active) { continue; }
      m.t += dt;
      m.vy -= 34 * dt;
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
      m.mesh.position.set(m.x, m.y, m.z);
      m.mesh.rotation.x += m.spinX * dt;
      m.mesh.rotation.z += m.spinZ * dt;
      if (m.trail) { m.trail.push(m.x, m.y, m.z); }
      if (m.light) { setLight(m.light, m.x, m.y, m.z, 2.4 + Math.sin(vtime * 30) * 0.5); }

      // burning ablation
      if (rnd() < 0.9) {
        pdReset();
        pd.x = m.x + rr(-m.r, m.r) * 0.5; pd.y = m.y + rr(-m.r, m.r) * 0.5; pd.z = m.z + rr(-m.r, m.r) * 0.5;
        pd.vx = rr(-2, 2) - m.vx * 0.12; pd.vy = rr(1, 4) - m.vy * 0.06; pd.vz = rr(-2, 2);
        pd.life = rr(0.35, 0.8); pd.s0 = m.r * rr(0.5, 1.0); pd.s1 = m.r * rr(0.1, 0.3);
        pd.cA = PAL.fireA; pd.cB = PAL.fireB; pd.tile = P_FLAME;
        pd.drag = 2.2; pd.grav = 3; pd.alpha = 0.85; pd.fadeOut = 0.35; pd.rot = rr(0, TAU);
        emitP(layerAdd);
      }
      if (rnd() < 0.55) {
        pdReset();
        pd.x = m.x + rr(-m.r, m.r) * 0.6; pd.y = m.y; pd.z = m.z + rr(-m.r, m.r) * 0.6;
        pd.vx = rr(-1.5, 1.5) - m.vx * 0.2; pd.vy = rr(0.5, 2.5); pd.vz = rr(-1.5, 1.5);
        pd.life = rr(1.1, 2.2); pd.s0 = m.r * 0.9; pd.s1 = m.r * 3.0;
        pd.cA = PAL.smokeDkA; pd.cB = PAL.smokeDkB; pd.tile = P_SMOKE;
        pd.drag = 1.2; pd.grav = 0.6; pd.alpha = 0.32; pd.turb = 0.5;
        pd.rot = rr(0, TAU); pd.rotV = rr(-0.6, 0.6); pd.fadeIn = 0.15;
        emitP(layerAlpha);
      }

      if (m.y <= m.groundY + m.r * 0.5 || m.t > 12) {
        m.active = false;
        m.mesh.visible = false;
        if (m.trail) { m.trail.free(); m.trail = null; }
        if (m.light) { releaseLight(m.light); m.light = null; }
        if (m.onImpact) { m.onImpact(m.x, Math.max(m.groundY, m.y), m.z, m.r, m.power); }
      }
    }
  }

  /* ==========================================================================
   * 14. FLASH LIGHT POOL
   * --------------------------------------------------------------------------
   * The lights are created ONCE at init and never added or removed afterwards:
   * changing the light count in a three.js scene recompiles every program in
   * it, and doing that mid-battle is a guaranteed multi-frame stall.
   * ======================================================================== */

  var lights = [];

  function buildLightPool() {
    var n = Q.lights;
    var i;
    for (i = 0; i < n; i++) {
      var l = new THREE.PointLight(0xffffff, 0, 60, 2);
      l.castShadow = false;
      l.position.set(0, -500, 0);
      scene.add(l);
      lights.push({ light: l, busy: false, decay: 0, base: 0, t: 0, auto: false });
    }
  }

  function acquireLight(hex, intensity, distance) {
    var i;
    for (i = 0; i < lights.length; i++) {
      if (!lights[i].busy) {
        var e = lights[i];
        e.busy = true;
        e.decay = 0;
        e.t = 0;
        e.auto = false;          // callers that want a decay call flashLight()
        e.base = intensity;
        e.light.color.copy((R && R.color) ? R.color(hex) : new THREE.Color(hex));
        e.light.intensity = intensity;
        e.light.distance = distance || 60;
        return e;
      }
    }
    return null;
  }

  function setLight(e, x, y, z, intensity) {
    if (!e || !e.busy) { return; }
    e.light.position.set(x, y, z);
    if (typeof intensity === 'number') { e.light.intensity = intensity; }
  }

  function releaseLight(e) {
    if (!e) { return; }
    e.busy = false;
    e.auto = false;      // or a later acquire() inherits a stale decay ramp
    e.decay = 0;
    e.t = 0;
    e.light.intensity = 0;
    e.light.position.set(0, -500, 0);
  }

  /** Fire-and-forget flash: bright now, gone in `dur` seconds. */
  function flashLight(hex, x, y, z, intensity, distance, dur) {
    var e = acquireLight(hex, intensity, distance);
    if (!e) { return null; }
    e.light.position.set(x, y, z);
    e.decay = dur > 0 ? dur : 0.2;
    e.t = 0;
    e.auto = true;
    return e;
  }

  function updateLights(dt) {
    var i, e;
    for (i = 0; i < lights.length; i++) {
      e = lights[i];
      if (!e.busy || !e.auto) { continue; }
      e.t += dt;
      var k = e.t / e.decay;
      if (k >= 1) { e.auto = false; releaseLight(e); continue; }
      // Sharp attack, exponential-ish falloff — a real flash, not a fade.
      e.light.intensity = e.base * (1 - k) * (1 - k) * (0.75 + 0.25 * rnd());
    }
  }

  var EMPTY = {};

  /* ==========================================================================
   * 15. SETTINGS SHORTCUTS
   * ======================================================================== */

  function settings() {
    var st = Core && Core.state;
    return (st && st.settings) ? st.settings : null;
  }
  function bloodOn() {
    var s = settings();
    return s ? s.blood !== false : true;
  }
  function numbersOn() {
    var s = settings();
    return s ? s.damageNumbers !== false : true;
  }
  function shakeScale() {
    var s = settings();
    var v = s ? num(s.shake, 1) : 1;
    return clamp(v, 0, 1.5);
  }

  /** Emit a camera shake request through the bus (Render owns the trauma rig). */
  function shake(amount) {
    var a = num(amount, 0.25) * shakeScale();
    if (a <= 0.0001) { return; }
    busEmit('camera:shake', clamp(a, 0, 1));
  }

  /**
   * Ask for hit-stop. We also apply it locally so particles, trails and powers
   * freeze with the sim — a hit-stop that only pauses the units and lets the
   * blood keep flying reads as a stutter, not as impact.
   */
  function hitstop(sec) {
    var s = clamp(num(sec, 0.06), 0, 0.16);
    if (s <= 0) { return; }
    if (s > hitstopT) { hitstopT = s; }
    busEmit('game:hitstop', { duration: s });
  }

  /* ==========================================================================
   * 16. GROUND DECALS
   * ======================================================================== */

  /**
   * Persistent decals (pools, scorch, craters) are rationed by tier, because a
   * 200-unit rout would otherwise carpet the field in blood and cost a full
   * screen of overdraw. Additive decals (rings, telegraphs) are exempt: they
   * live under a second and are the readability layer, not the dressing.
   *
   * `decalExp[slot]` is the vtime at which that ring slot frees up, so the live
   * count is exact and costs one 256-entry scan per frame.
   */
  var decalExp = new Float32Array(CAP.decalAlpha);
  var decalLive = 0;

  function recountDecals() {
    var n = 0, i;
    for (i = 0; i < CAP.decalAlpha; i++) { if (decalExp[i] > vtime) { n++; } }
    decalLive = n;
  }

  function decalAllowed() {
    if (Q.decals <= 0) { return false; }
    return decalLive < Q.decals;
  }

  /**
   * AOW.VFX.decal(type, x, z, opts) — pooled, fading, oriented on the ground.
   * Types: 'blood' | 'splatter' | 'scorch' | 'crater' | 'ring' | 'softring' |
   *        'target' | 'shadow' | 'frost' | 'cracks' | 'light' | 'hex' |
   *        'speck' | 'streak' | 'disc'
   */
  var DECAL_KIND = {
    blood:    { tile: D_POOL,     add: false, cA: PAL.bloodA,  cB: PAL.bloodB,   life: 22, alpha: 0.85, fadeOut: 0.65 },
    splatter: { tile: D_SPLATTER, add: false, cA: PAL.bloodA,  cB: PAL.bloodB,   life: 16, alpha: 0.7,  fadeOut: 0.6 },
    scorch:   { tile: D_SCORCH,   add: false, cA: PAL.scorch,  cB: PAL.scorch,   life: 26, alpha: 0.8,  fadeOut: 0.7 },
    crater:   { tile: D_CRATER,   add: false, cA: PAL.dustB,   cB: PAL.scorch,   life: 30, alpha: 0.85, fadeOut: 0.72 },
    cracks:   { tile: D_CRACKS,   add: false, cA: PAL.scorch,  cB: PAL.scorch,   life: 18, alpha: 0.7,  fadeOut: 0.6 },
    shadow:   { tile: D_SHADOW,   add: false, cA: PAL.scorch,  cB: PAL.scorch,   life: 1.2, alpha: 0.5, fadeOut: 0.5 },
    speck:    { tile: D_SPECK,    add: false, cA: PAL.stoneB,  cB: PAL.stoneB,   life: 14, alpha: 0.6,  fadeOut: 0.6 },
    frost:    { tile: D_FROST,    add: false, cA: PAL.frostA,  cB: PAL.frostB,   life: 9,  alpha: 0.7,  fadeOut: 0.5 },
    streak:   { tile: D_STREAK,   add: false, cA: PAL.scorch,  cB: PAL.scorch,   life: 12, alpha: 0.6,  fadeOut: 0.6 },
    ring:     { tile: D_RING,     add: true,  cA: PAL.white,   cB: PAL.white,    life: 0.5, alpha: 1,   fadeOut: 0.25 },
    softring: { tile: D_SOFTRING, add: true,  cA: PAL.dustA,   cB: PAL.dustB,    life: 0.9, alpha: 0.6, fadeOut: 0.2 },
    target:   { tile: D_TARGET,   add: true,  cA: PAL.warn,    cB: PAL.warn,     life: 1.2, alpha: 0.9, fadeOut: 0.55 },
    hex:      { tile: D_HEX,      add: true,  cA: PAL.energyA, cB: PAL.energyB,  life: 1.2, alpha: 0.9, fadeOut: 0.55 },
    light:    { tile: D_LIGHT,    add: true,  cA: PAL.white,   cB: PAL.white,    life: 0.6, alpha: 0.7, fadeOut: 0.3 },
    disc:     { tile: D_DISC,     add: true,  cA: PAL.white,   cB: PAL.white,    life: 0.6, alpha: 0.7, fadeOut: 0.3 }
  };

  function addDecal(type, x, z, o) {
    if (!ready) { return null; }
    var k = DECAL_KIND[type];
    if (!k) { warnOnce('decal:' + type, 'unknown decal type "' + type + '" — ignored.'); return null; }
    o = o || EMPTY;
    var persistent = !k.add;
    if (persistent && !decalAllowed()) { return null; }

    ddReset();
    dd.x = x; dd.z = z;
    dd.y = num(o.y, k.add ? 0.06 : 0.03);
    dd.tile = k.tile;
    dd.r0 = num(o.r0, num(o.r, 1));
    dd.r1 = num(o.r1, dd.r0);
    dd.life = num(o.life, k.life) * (persistent ? Q.decalLife : 1);
    dd.alpha = num(o.alpha, k.alpha);
    dd.fadeIn = num(o.fadeIn, k.add ? 0.02 : 0.05);
    dd.fadeOut = num(o.fadeOut, k.fadeOut);
    dd.rot = num(o.rot, rr(0, TAU));
    dd.aspect = num(o.aspect, 1);
    dd.spin = num(o.spin, 0);
    dd.ease = o.ease ? 1 : 0;
    dd.cA = o.colorA ? LC(o.colorA) : (o.colorLinearA || k.cA);
    dd.cB = o.colorB ? LC(o.colorB) : (o.colorLinearB || (o.colorA ? LC(o.colorA) : k.cB));
    var slot = emitD(k.add ? decalAdd : decalAlpha);
    if (persistent && slot >= 0) {
      decalExp[slot] = vtime + dd.life;
      decalLive++;
    }
    return slot;
  }

  /* ==========================================================================
   * 17. FLOATING TEXT
   * ======================================================================== */

  var _txtBuf = [];

  /**
   * AOW.VFX.text(str, x, y, z, opts) — instanced glyph quads, real depth,
   * easeOutBack pop, ease-out rise. One draw call for every number on screen.
   */
  function addText(str, x, y, z, o) {
    if (!ready || !textLayer) { return; }
    o = o || EMPTY;
    str = String(str === undefined || str === null ? '' : str);
    if (!str.length) { return; }
    if (str.length > 12) { str = str.slice(0, 12); }

    var scale = num(o.scale, 1.0);
    var life = num(o.life, 1.1);
    var col = o.color ? LC(o.color) : (o.colorLinear || PAL.white);
    var rise = num(o.rise, 2.2);
    var drift = num(o.drift, rr(-0.5, 0.5));
    var advance = num(o.advance, 0.60) * scale;
    var n = str.length;
    var x0 = -((n - 1) * 0.5) * advance;

    for (var i = 0; i < n; i++) {
      var code = str.charCodeAt(i);
      if (code < GLYPH_FIRST || code > 126) { code = 63; }   // '?'
      var glyph = code - GLYPH_FIRST;

      var slot = textLayer.slot(life, vtime);
      var a = textLayer.arr;
      var i2 = slot * 2, i3 = slot * 3, i4 = slot * 4;

      a.iAnchor[i3] = x; a.iAnchor[i3 + 1] = y; a.iAnchor[i3 + 2] = z;
      a.iOff[i2] = x0 + i * advance; a.iOff[i2 + 1] = 0;
      a.iTime[i3] = vtime; a.iTime[i3 + 1] = 1 / life; a.iTime[i3 + 2] = 0;
      a.iCol[i3] = col[0]; a.iCol[i3 + 1] = col[1]; a.iCol[i3 + 2] = col[2];
      a.iInfo[i4] = scale; a.iInfo[i4 + 1] = glyph;
      a.iInfo[i4 + 2] = rise; a.iInfo[i4 + 3] = drift;
    }
    stats.texts++;
  }

  /** Damage number with the house style: crits are bigger, hotter and slower. */
  function damageText(value, x, y, z, o) {
    if (!numbersOn()) { return; }
    o = o || EMPTY;
    var v = Math.round(num(value, 0));
    if (v <= 0 && !o.force) { return; }
    var crit = !!o.crit;
    var friendly = !!o.friendly;
    var str = (o.prefix || '') + v + (o.suffix || '');
    addText(str, x, y, z, {
      scale: (crit ? 1.35 : 0.85) * num(o.scale, 1),
      life: crit ? 1.45 : 1.0,
      rise: crit ? 3.0 : 2.1,
      drift: rr(-0.7, 0.7),
      color: o.color || (crit ? '#ffd24a' : (friendly ? '#ff8272' : '#ffffff'))
    });
  }

  /* ==========================================================================
   * 18. SPAWN RECIPES
   * --------------------------------------------------------------------------
   * Every recipe reads the shared descriptor, writes straight into a layer and
   * allocates nothing. `dir` is a direction hint (usually the attack vector);
   * `power` scales count/size/speed together so one number drives intensity.
   * ======================================================================== */

  var RECIPES = Object.create(null);

  function dirOf(o, out) {
    var dx = num(o.dx, o.dir ? num(o.dir.x, 0) : 0);
    var dy = num(o.dy, o.dir ? num(o.dir.y, 0) : 0);
    var dz = num(o.dz, o.dir ? num(o.dir.z, 0) : 0);
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 1e-5) { out.set(0, 1, 0); }
    else { out.set(dx / l, dy / l, dz / l); }
    return out;
  }

  /** Cone sample around a direction: spread 0 = laser, 1 = hemisphere-ish. */
  function coneVel(dirV, speed, spread, out) {
    out.set(
      dirV.x + rgauss() * spread,
      dirV.y + rgauss() * spread,
      dirV.z + rgauss() * spread
    );
    var l = out.length();
    if (l < 1e-5) { out.copy(dirV); l = 1; }
    out.multiplyScalar(speed / l);
    return out;
  }

  /* ---- sparks -------------------------------------------------------------- */
  RECIPES.sparks = function (o) {
    var n = N(num(o.n, 14) * num(o.power, 1));
    var x = num(o.x, 0), y = num(o.y, 1), z = num(o.z, 0);
    var speed = num(o.speed, 9) * num(o.power, 1);
    var spread = num(o.spread, 0.55);
    var cA = o.colorA ? LC(o.colorA) : PAL.sparkA;
    var cB = o.colorB ? LC(o.colorB) : PAL.sparkB;
    dirOf(o, _v5);
    var scale = num(o.scale, 1);
    for (var i = 0; i < n; i++) {
      coneVel(_v5, speed * rr(0.35, 1.35), spread, _v1);
      pdReset();
      pd.x = x; pd.y = y; pd.z = z;
      pd.vx = _v1.x; pd.vy = _v1.y; pd.vz = _v1.z;
      pd.life = rr(0.22, 0.6);
      pd.s0 = rr(0.10, 0.26) * scale; pd.s1 = pd.s0 * 0.25;
      pd.cA = cA; pd.cB = cB;
      pd.tile = P_STREAK;
      pd.stretch = num(o.stretch, 0.14);
      pd.drag = 2.6; pd.grav = -16;
      pd.alpha = 1; pd.fadeIn = 0.01; pd.fadeOut = 0.42;
      pd.groundY = num(o.groundY, -1000);
      emitP(layerAdd);
    }
    // A couple of hero star-flares sell the hit far more than 20 more dots.
    var hero = Math.min(3, Math.max(1, (n / 6) | 0));
    for (var h = 0; h < hero; h++) {
      coneVel(_v5, speed * rr(0.2, 0.6), spread * 0.7, _v1);
      pdReset();
      pd.x = x; pd.y = y; pd.z = z;
      pd.vx = _v1.x; pd.vy = _v1.y; pd.vz = _v1.z;
      pd.life = rr(0.14, 0.26);
      pd.s0 = rr(0.5, 0.95) * scale; pd.s1 = pd.s0 * 0.3;
      pd.cA = cA; pd.cB = cB; pd.tile = P_STAR;
      pd.rot = rr(0, TAU); pd.rotV = rr(-6, 6);
      pd.drag = 5; pd.alpha = 0.9; pd.fadeIn = 0.01; pd.fadeOut = 0.3;
      emitP(layerAdd);
    }
    return n;
  };

  /* ---- blood --------------------------------------------------------------- */
  RECIPES.blood = function (o) {
    if (!bloodOn()) {
      // Blood off: still give the hit a physical read with a dust puff.
      RECIPES.dust({ x: o.x, y: o.y, z: o.z, n: 5, power: 0.6, scale: 0.5 });
      return 0;
    }
    var power = num(o.power, 1);
    var n = N(num(o.n, 16) * power);
    var x = num(o.x, 0), y = num(o.y, 1.1), z = num(o.z, 0);
    var speed = num(o.speed, 7) * (0.6 + 0.6 * power);
    var spread = num(o.spread, 0.5);
    dirOf(o, _v5);
    var scale = num(o.scale, 1);
    var gy = num(o.groundY, 0.02);
    var i;
    for (i = 0; i < n; i++) {
      coneVel(_v5, speed * rr(0.3, 1.4), spread, _v1);
      _v1.y += rr(0.5, 3.5);
      pdReset();
      pd.x = x + rr(-0.12, 0.12); pd.y = y + rr(-0.14, 0.14); pd.z = z + rr(-0.12, 0.12);
      pd.vx = _v1.x; pd.vy = _v1.y; pd.vz = _v1.z;
      pd.life = rr(0.5, 1.15);
      pd.s0 = rr(0.07, 0.20) * scale; pd.s1 = pd.s0 * 0.7;
      pd.cA = PAL.bloodA; pd.cB = PAL.bloodB;
      pd.tile = (rnd() < 0.75) ? P_DROP : P_SPLAT;
      pd.stretch = 0.10;
      pd.drag = 0.9; pd.grav = -22;
      pd.alpha = 0.95; pd.fadeIn = 0.01; pd.fadeOut = 0.72;
      pd.groundY = gy;
      pd.rot = rr(0, TAU); pd.rotV = rr(-8, 8);
      emitP(layerAlpha);
    }
    // A short-lived mist gives the spray volume without more droplets.
    var mist = N(3 * power);
    for (i = 0; i < mist; i++) {
      coneVel(_v5, speed * rr(0.1, 0.4), spread * 1.4, _v1);
      pdReset();
      pd.x = x; pd.y = y; pd.z = z;
      pd.vx = _v1.x; pd.vy = _v1.y + 0.6; pd.vz = _v1.z;
      pd.life = rr(0.28, 0.5);
      pd.s0 = rr(0.30, 0.55) * scale; pd.s1 = pd.s0 * 2.1;
      pd.cA = PAL.bloodA; pd.cB = PAL.bloodDark;
      pd.tile = P_SMOKE;
      pd.drag = 4.5; pd.grav = -3;
      pd.alpha = 0.34; pd.fadeIn = 0.02; pd.fadeOut = 0.25;
      pd.rot = rr(0, TAU);
      emitP(layerAlpha);
    }
    return n;
  };

  /* ---- dust ---------------------------------------------------------------- */
  RECIPES.dust = function (o) {
    var power = num(o.power, 1);
    var n = N(num(o.n, 8) * power);
    var x = num(o.x, 0), y = num(o.y, 0.15), z = num(o.z, 0);
    var speed = num(o.speed, 2.6) * power;
    var scale = num(o.scale, 1);
    var cA = o.colorA ? LC(o.colorA) : PAL.dustA;
    var cB = o.colorB ? LC(o.colorB) : PAL.dustB;
    var flat = o.flat !== false;
    for (var i = 0; i < n; i++) {
      var a = rr(0, TAU), sp = speed * rr(0.25, 1);
      pdReset();
      pd.x = x + rr(-0.2, 0.2); pd.y = y; pd.z = z + rr(-0.2, 0.2);
      pd.vx = Math.cos(a) * sp;
      pd.vy = flat ? rr(0.3, 1.5) : rr(1, 3.5);
      pd.vz = Math.sin(a) * sp;
      pd.life = rr(0.7, 1.6);
      pd.s0 = rr(0.4, 0.8) * scale; pd.s1 = pd.s0 * rr(2.4, 4.0);
      pd.cA = cA; pd.cB = cB;
      pd.tile = P_DUST;
      pd.drag = 2.4; pd.grav = -0.6;
      pd.alpha = num(o.alpha, 0.42); pd.fadeIn = 0.08; pd.fadeOut = 0.28;
      pd.turb = 0.35; pd.rot = rr(0, TAU); pd.rotV = rr(-0.8, 0.8);
      emitP(layerAlpha);
    }
    return n;
  };

  /* ---- smoke --------------------------------------------------------------- */
  RECIPES.smoke = function (o) {
    var power = num(o.power, 1);
    var n = N(num(o.n, 7) * power);
    var x = num(o.x, 0), y = num(o.y, 0.6), z = num(o.z, 0);
    var scale = num(o.scale, 1);
    var dark = !!o.dark;
    var cA = o.colorA ? LC(o.colorA) : (dark ? PAL.smokeDkA : PAL.smokeA);
    var cB = o.colorB ? LC(o.colorB) : (dark ? PAL.smokeDkB : PAL.smokeB);
    for (var i = 0; i < n; i++) {
      pdReset();
      pd.x = x + rr(-0.3, 0.3) * scale; pd.y = y; pd.z = z + rr(-0.3, 0.3) * scale;
      pd.vx = rr(-0.8, 0.8) + num(o.wind, 0.5);
      pd.vy = rr(1.2, 3.0) * num(o.rise, 1);
      pd.vz = rr(-0.8, 0.8);
      pd.life = rr(1.6, 3.4) * num(o.lifeMul, 1);
      pd.s0 = rr(0.7, 1.3) * scale; pd.s1 = pd.s0 * rr(2.6, 4.4);
      pd.cA = cA; pd.cB = cB;
      pd.tile = P_SMOKE;
      pd.drag = 0.9; pd.grav = 0.35;
      pd.alpha = num(o.alpha, 0.4); pd.fadeIn = 0.16; pd.fadeOut = 0.3;
      pd.turb = 0.55; pd.rot = rr(0, TAU); pd.rotV = rr(-0.5, 0.5);
      emitP(layerAlpha);
    }
    return n;
  };

  /* ---- fire ---------------------------------------------------------------- */
  RECIPES.fire = function (o) {
    var power = num(o.power, 1);
    var n = N(num(o.n, 10) * power);
    var x = num(o.x, 0), y = num(o.y, 0.2), z = num(o.z, 0);
    var scale = num(o.scale, 1);
    var rad = num(o.radius, 0.4);
    for (var i = 0; i < n; i++) {
      pdReset();
      var a = rr(0, TAU), d = rr(0, rad);
      pd.x = x + Math.cos(a) * d; pd.y = y + rr(0, 0.2); pd.z = z + Math.sin(a) * d;
      pd.vx = rr(-0.6, 0.6); pd.vy = rr(1.8, 4.2) * num(o.rise, 1); pd.vz = rr(-0.6, 0.6);
      pd.life = rr(0.4, 0.95);
      pd.s0 = rr(0.35, 0.8) * scale; pd.s1 = pd.s0 * rr(0.25, 0.6);
      pd.cA = PAL.fireA; pd.cB = PAL.fireB;
      pd.tile = P_FLAME;
      pd.drag = 1.6; pd.grav = 2.4;
      pd.alpha = num(o.alpha, 0.95); pd.fadeIn = 0.06; pd.fadeOut = 0.38;
      pd.turb = 0.25; pd.flicker = 0.25;
      emitP(layerAdd);
    }
    if (o.smoke !== false) {
      RECIPES.smoke({ x: x, y: y + 0.6, z: z, n: Math.max(1, n * 0.25), scale: scale * 1.2, dark: true, alpha: 0.22 });
    }
    return n;
  };

  /* ---- embers -------------------------------------------------------------- */
  RECIPES.embers = function (o) {
    var n = N(num(o.n, 6) * num(o.power, 1));
    var x = num(o.x, 0), y = num(o.y, 0.4), z = num(o.z, 0);
    var rad = num(o.radius, 0.6);
    var scale = num(o.scale, 1);
    for (var i = 0; i < n; i++) {
      var a = rr(0, TAU), d = rr(0, rad);
      pdReset();
      pd.x = x + Math.cos(a) * d; pd.y = y; pd.z = z + Math.sin(a) * d;
      pd.vx = rr(-0.5, 0.9); pd.vy = rr(1.0, 3.2); pd.vz = rr(-0.5, 0.5);
      pd.life = rr(1.2, 2.8);
      pd.s0 = rr(0.05, 0.13) * scale; pd.s1 = pd.s0 * 0.5;
      pd.cA = PAL.emberA; pd.cB = PAL.emberB;
      pd.tile = P_SPARK;
      pd.drag = 0.7; pd.grav = 1.4;
      pd.alpha = 1; pd.fadeIn = 0.1; pd.fadeOut = 0.45;
      pd.turb = 0.6; pd.flicker = 0.55;
      emitP(layerAdd);
    }
    return n;
  };

  /* ---- magic / energy ------------------------------------------------------- */
  RECIPES.magic = function (o) {
    var power = num(o.power, 1);
    var n = N(num(o.n, 18) * power);
    var x = num(o.x, 0), y = num(o.y, 1), z = num(o.z, 0);
    var rad = num(o.radius, 0.8);
    var scale = num(o.scale, 1);
    var cA = o.colorA ? LC(o.colorA) : PAL.magicA;
    var cB = o.colorB ? LC(o.colorB) : (o.era ? eraTint() : PAL.magicB);
    var inward = !!o.inward;
    for (var i = 0; i < n; i++) {
      var a = rr(0, TAU), d = rad * (inward ? rr(0.9, 1.6) : rr(0, 0.5));
      var sp = num(o.speed, 3) * rr(0.4, 1.3) * (inward ? -1 : 1);
      pdReset();
      pd.x = x + Math.cos(a) * d; pd.y = y + rr(-0.4, 0.6); pd.z = z + Math.sin(a) * d;
      pd.vx = Math.cos(a) * sp; pd.vy = rr(0.5, 2.6) * (inward ? 0.3 : 1); pd.vz = Math.sin(a) * sp;
      pd.life = rr(0.6, 1.4);
      pd.s0 = rr(0.12, 0.3) * scale; pd.s1 = pd.s0 * (inward ? 0.2 : 0.55);
      pd.cA = cA; pd.cB = cB;
      pd.tile = (rnd() < 0.3) ? P_STAR : P_GLOW;
      pd.drag = 1.3; pd.grav = inward ? 0 : 1.2;
      pd.alpha = 0.9; pd.fadeIn = 0.08; pd.fadeOut = 0.4;
      pd.turb = 0.5; pd.rot = rr(0, TAU); pd.rotV = rr(-3, 3);
      pd.flicker = 0.2;
      emitP(layerAdd);
    }
    return n;
  };

  RECIPES.energy = function (o) {
    var oo = o || EMPTY;
    return RECIPES.magic({
      x: oo.x, y: oo.y, z: oo.z, n: num(oo.n, 14), power: num(oo.power, 1),
      radius: num(oo.radius, 0.6), scale: num(oo.scale, 1), speed: num(oo.speed, 5),
      colorA: oo.colorA || '#e8feff', colorB: oo.colorB || '#1f7bff', inward: oo.inward
    });
  };

  /* ---- water --------------------------------------------------------------- */
  RECIPES.water = function (o) {
    var n = N(num(o.n, 14) * num(o.power, 1));
    var x = num(o.x, 0), y = num(o.y, 0.1), z = num(o.z, 0);
    var speed = num(o.speed, 5) * num(o.power, 1);
    var scale = num(o.scale, 1);
    dirOf(o, _v5);
    for (var i = 0; i < n; i++) {
      coneVel(_v5, speed * rr(0.3, 1.2), num(o.spread, 0.7), _v1);
      _v1.y = Math.abs(_v1.y) + rr(1, 4);
      pdReset();
      pd.x = x; pd.y = y; pd.z = z;
      pd.vx = _v1.x; pd.vy = _v1.y; pd.vz = _v1.z;
      pd.life = rr(0.5, 1.1);
      pd.s0 = rr(0.08, 0.2) * scale; pd.s1 = pd.s0 * 0.8;
      pd.cA = PAL.waterA; pd.cB = PAL.waterB;
      pd.tile = P_BUBBLE;
      pd.drag = 0.6; pd.grav = -20;
      pd.alpha = 0.75; pd.fadeIn = 0.03; pd.fadeOut = 0.6;
      pd.groundY = num(o.groundY, 0.02);
      pd.stretch = 0.06;
      emitP(layerAlpha);
    }
    // spray sheet
    RECIPES.smoke({ x: x, y: y + 0.2, z: z, n: 3, scale: scale * 0.7, alpha: 0.18,
      colorA: '#e8f7ff', colorB: '#9fc4d8', rise: 0.6, lifeMul: 0.4 });
    return n;
  };

  /* ---- debris -------------------------------------------------------------- */
  RECIPES.debris = function (o) {
    var power = num(o.power, 1);
    var n = N(num(o.n, 10) * power);
    var x = num(o.x, 0), y = num(o.y, 0.3), z = num(o.z, 0);
    var speed = num(o.speed, 6) * power;
    var scale = num(o.scale, 1);
    var cA = o.colorA ? LC(o.colorA) : PAL.stoneA;
    var cB = o.colorB ? LC(o.colorB) : PAL.stoneB;
    dirOf(o, _v5);
    for (var i = 0; i < n; i++) {
      coneVel(_v5, speed * rr(0.3, 1.3), num(o.spread, 0.8), _v1);
      _v1.y = Math.abs(_v1.y) * 0.6 + rr(2, 7);
      pdReset();
      pd.x = x + rr(-0.2, 0.2); pd.y = y; pd.z = z + rr(-0.2, 0.2);
      pd.vx = _v1.x; pd.vy = _v1.y; pd.vz = _v1.z;
      pd.life = rr(1.0, 2.2);
      pd.s0 = rr(0.09, 0.26) * scale; pd.s1 = pd.s0 * 0.9;
      pd.cA = cA; pd.cB = cB;
      pd.tile = P_CHUNK;
      pd.drag = 0.35; pd.grav = -26;
      pd.alpha = 1; pd.fadeIn = 0.01; pd.fadeOut = 0.82;
      pd.groundY = num(o.groundY, 0.05);
      pd.rot = rr(0, TAU); pd.rotV = rr(-12, 12);
      emitP(layerAlpha);
    }
    return n;
  };

  /* ---- rings & shockwaves --------------------------------------------------- */
  RECIPES.ring = function (o) {
    var x = num(o.x, 0), z = num(o.z, 0);
    addDecal('ring', x, z, {
      y: num(o.y, 0.08),
      r0: num(o.r0, 0.4), r1: num(o.r1, num(o.r, 4)),
      life: num(o.life, 0.45), alpha: num(o.alpha, 0.9),
      fadeOut: num(o.fadeOut, 0.2), ease: true,
      colorA: o.color || o.colorA, colorB: o.colorB || o.color
    });
    return 1;
  };

  RECIPES.shockwave = function (o) {
    var x = num(o.x, 0), z = num(o.z, 0), power = num(o.power, 1);
    addDecal('ring', x, z, {
      y: 0.09, r0: 0.5 * power, r1: num(o.r, 6) * power,
      life: num(o.life, 0.55), alpha: 0.95, fadeOut: 0.25, ease: true,
      colorA: o.color || '#fff2cf', colorB: o.color || '#ffb15a'
    });
    addDecal('softring', x, z, {
      y: 0.07, r0: 0.4 * power, r1: num(o.r, 6) * power * 1.35,
      life: num(o.life, 0.55) * 1.6, alpha: 0.55, fadeOut: 0.2, ease: true
    });
    // vertical air ring — sells the wave as 3D rather than a floor sticker
    pdReset();
    pd.x = x; pd.y = num(o.y, 0.5); pd.z = z;
    pd.life = num(o.life, 0.5) * 0.8;
    pd.s0 = 0.6 * power; pd.s1 = num(o.r, 6) * power * 1.1;
    pd.cA = o.color ? LC(o.color) : PAL.sparkA;
    pd.cB = o.colorB ? LC(o.colorB) : PAL.sparkB;
    pd.tile = P_RING; pd.alpha = 0.55; pd.fadeIn = 0.02; pd.fadeOut = 0.15;
    emitP(layerAdd);
    return 1;
  };

  /* ---- flash / muzzle ------------------------------------------------------- */
  RECIPES.flash = function (o) {
    var x = num(o.x, 0), y = num(o.y, 1), z = num(o.z, 0);
    var s = num(o.scale, 1);
    pdReset();
    pd.x = x; pd.y = y; pd.z = z;
    pd.life = num(o.life, 0.13);
    pd.s0 = 1.5 * s; pd.s1 = 3.2 * s;
    pd.cA = o.color ? LC(o.color) : PAL.white;
    pd.cB = o.colorB ? LC(o.colorB) : (o.color ? LC(o.color) : PAL.sparkB);
    pd.tile = P_GLOW; pd.alpha = num(o.alpha, 0.85);
    pd.fadeIn = 0.01; pd.fadeOut = 0.1;
    emitP(layerAdd);
    if (o.star !== false) {
      pdReset();
      pd.x = x; pd.y = y; pd.z = z;
      pd.life = num(o.life, 0.13) * 1.2;
      pd.s0 = 2.6 * s; pd.s1 = 1.2 * s;
      pd.cA = o.color ? LC(o.color) : PAL.white;
      pd.cB = pd.cA;
      pd.tile = P_STAR; pd.alpha = 0.7; pd.rot = rr(0, TAU);
      pd.fadeIn = 0.01; pd.fadeOut = 0.05;
      emitP(layerAdd);
    }
    return 1;
  };

  RECIPES.muzzle = function (o) {
    var x = num(o.x, 0), y = num(o.y, 1.2), z = num(o.z, 0);
    var s = num(o.scale, 1);
    dirOf(o, _v5);
    // cone of hot gas along the barrel
    var i, n = N(8);
    for (i = 0; i < n; i++) {
      coneVel(_v5, rr(6, 20) * s, 0.22, _v1);
      pdReset();
      pd.x = x; pd.y = y; pd.z = z;
      pd.vx = _v1.x; pd.vy = _v1.y; pd.vz = _v1.z;
      pd.life = rr(0.06, 0.16);
      pd.s0 = rr(0.2, 0.5) * s; pd.s1 = pd.s0 * 1.6;
      pd.cA = PAL.fireA; pd.cB = PAL.fireB;
      pd.tile = P_FLAME; pd.stretch = 0.05;
      pd.drag = 7; pd.alpha = 1; pd.fadeIn = 0.005; pd.fadeOut = 0.3;
      emitP(layerAdd);
    }
    RECIPES.flash({ x: x + _v5.x * 0.3, y: y + _v5.y * 0.3, z: z + _v5.z * 0.3,
      scale: 0.55 * s, life: 0.09, color: '#fff0c0', colorB: '#ff9a30' });
    RECIPES.sparks({ x: x, y: y, z: z, dx: _v5.x, dy: _v5.y, dz: _v5.z,
      n: 5, speed: 13 * s, spread: 0.35, scale: 0.7 });
    // barrel smoke drifting off the muzzle
    RECIPES.smoke({ x: x + _v5.x * 0.5, y: y + 0.1, z: z + _v5.z * 0.5,
      n: 3, scale: 0.35 * s, alpha: 0.22, dark: false, rise: 0.5, lifeMul: 0.55,
      wind: _v5.x * 1.5 });
    if (Q.lights > 0) { flashLight('#ffcf8a', x, y, z, 2.2 * s, 14, 0.09); }
    return 1;
  };

  /* ---- frost --------------------------------------------------------------- */
  RECIPES.frost = function (o) {
    var n = N(num(o.n, 14) * num(o.power, 1));
    var x = num(o.x, 0), y = num(o.y, 0.8), z = num(o.z, 0);
    var rad = num(o.radius, 1);
    var scale = num(o.scale, 1);
    for (var i = 0; i < n; i++) {
      var a = rr(0, TAU), d = rr(0, rad);
      pdReset();
      pd.x = x + Math.cos(a) * d; pd.y = y + rr(-0.5, 0.8); pd.z = z + Math.sin(a) * d;
      pd.vx = Math.cos(a) * rr(0.4, 2); pd.vy = rr(-0.4, 1.4); pd.vz = Math.sin(a) * rr(0.4, 2);
      pd.life = rr(0.7, 1.6);
      pd.s0 = rr(0.12, 0.3) * scale; pd.s1 = pd.s0 * 0.4;
      pd.cA = PAL.frostA; pd.cB = PAL.frostB;
      pd.tile = (rnd() < 0.5) ? P_CRYSTAL : P_SPARK;
      pd.drag = 1.6; pd.grav = -1.5;
      pd.alpha = 0.9; pd.fadeIn = 0.06; pd.fadeOut = 0.45;
      pd.rot = rr(0, TAU); pd.rotV = rr(-4, 4);
      emitP(layerAdd);
    }
    RECIPES.smoke({ x: x, y: y - 0.4, z: z, n: 4, scale: scale * 1.4, alpha: 0.2,
      colorA: '#dff2ff', colorB: '#9dc8e0', rise: 0.25, lifeMul: 0.8 });
    return n;
  };

  /* ---- combined impacts ----------------------------------------------------- */

  /** Generic weapon impact: sparks + dust + a tiny ring. */
  RECIPES.impact = function (o) {
    var x = num(o.x, 0), y = num(o.y, 1), z = num(o.z, 0);
    var power = num(o.power, 1);
    RECIPES.sparks({ x: x, y: y, z: z, dx: o.dx, dy: o.dy, dz: o.dz,
      n: 10 * power, speed: 9 * power, spread: 0.6, scale: 0.9 });
    RECIPES.dust({ x: x, y: Math.max(0.1, y - 0.6), z: z, n: 3 * power, power: 0.7, scale: 0.6, alpha: 0.3 });
    RECIPES.flash({ x: x, y: y, z: z, scale: 0.35 * power, life: 0.09, alpha: 0.6, star: false });
    return 1;
  };

  RECIPES.explosion = function (o) {
    var x = num(o.x, 0), y = num(o.y, 0.6), z = num(o.z, 0);
    var power = num(o.power, 1) * Q.bigPowers;
    var scale = num(o.scale, 1) * (0.7 + 0.5 * power);

    RECIPES.flash({ x: x, y: y + 0.6, z: z, scale: 2.2 * scale, life: 0.16, alpha: 1 });
    RECIPES.fire({ x: x, y: y, z: z, n: 26 * power, radius: 0.9 * scale, scale: 1.6 * scale, rise: 1.5, smoke: false });
    RECIPES.smoke({ x: x, y: y + 0.5, z: z, n: 12 * power, scale: 1.8 * scale, dark: true, alpha: 0.42, lifeMul: 1.4 });
    RECIPES.sparks({ x: x, y: y + 0.4, z: z, n: 26 * power, speed: 18 * scale, spread: 1.0, scale: 1.2, groundY: 0.05 });
    RECIPES.debris({ x: x, y: y, z: z, n: 12 * power, speed: 12 * scale, spread: 1.0, scale: 1.2 });
    RECIPES.dust({ x: x, y: 0.15, z: z, n: 14 * power, power: 1.6, scale: 1.9 * scale, alpha: 0.5 });
    RECIPES.shockwave({ x: x, z: z, y: y, r: 6 * scale, power: 1, life: 0.55 });
    addDecal('scorch', x, z, { r: 2.6 * scale, alpha: 0.75 });
    if (Q.lights > 0) { flashLight('#ff9a3c', x, y + 1, z, 6 * scale, 40 * scale, 0.32); }
    shake(0.35 * power);
    return 1;
  };

  /* ---- tracers & bolts ------------------------------------------------------ */

  /** Straight-line tracer: a stretched additive streak + a muzzle-side flash. */
  RECIPES.tracer = function (o) {
    var ax = num(o.x, 0), ay = num(o.y, 1), az = num(o.z, 0);
    var bx = num(o.x2, ax + 10), by = num(o.y2, ay), bz = num(o.z2, az);
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var speed = num(o.speed, 140);
    var life = clamp(len / speed, 0.03, 0.6);
    var col = o.color ? LC(o.color) : PAL.sparkA;
    var colB = o.colorB ? LC(o.colorB) : PAL.sparkB;
    pdReset();
    pd.x = ax; pd.y = ay; pd.z = az;
    pd.vx = dx / life; pd.vy = dy / life; pd.vz = dz / life;
    pd.life = life;
    pd.s0 = num(o.width, 0.09); pd.s1 = pd.s0 * 0.7;
    pd.cA = col; pd.cB = colB;
    pd.tile = P_STREAK; pd.stretch = num(o.stretch, 0.05);
    pd.alpha = 1; pd.fadeIn = 0.02; pd.fadeOut = 0.55;
    emitP(layerAdd);
    return 1;
  };

  /**
   * Lightning bolt as a jittered ribbon. Recursion depth is capped and the
   * branch count scales with tier so a storm on a phone still runs.
   */
  var _boltPts = new Float32Array(TRAIL_SEG * 3);

  RECIPES.bolt = function (o) {
    var ax = num(o.x, 0), ay = num(o.y, 40), az = num(o.z, 0);
    var bx = num(o.x2, ax), by = num(o.y2, 0), bz = num(o.z2, az);
    var jitter = num(o.jitter, 2.2);
    var segs = clamp(num(o.segments, 14) | 0, 4, TRAIL_SEG);
    var tr = acquireTrail({
      life: num(o.life, 0.22), width: num(o.width, 0.28), additive: true,
      color: o.color || '#dceaff', colorTail: o.colorTail || '#6aa8ff',
      alpha: 1, taper: 0.25, autoFree: num(o.life, 0.22) + 0.1
    });
    if (!tr) { return 0; }
    var i;
    for (i = 0; i < segs; i++) {
      var t = i / (segs - 1);
      var j = (i === 0 || i === segs - 1) ? 0 : jitter * (0.35 + 0.65 * Math.sin(t * PI));
      tr.push(
        lerp(ax, bx, t) + rgauss() * j,
        lerp(ay, by, t) + rgauss() * j * 0.3,
        lerp(az, bz, t) + rgauss() * j
      );
    }
    // Branches: one or two forks from the middle third, half length.
    var branches = (Q.count > 0.5) ? (rnd() < 0.8 ? 2 : 1) : 0;
    for (i = 0; i < branches; i++) {
      var bt = rr(0.25, 0.7);
      var sx = lerp(ax, bx, bt), sy = lerp(ay, by, bt), sz = lerp(az, bz, bt);
      var br = acquireTrail({
        life: num(o.life, 0.22) * 0.7, width: num(o.width, 0.28) * 0.5, additive: true,
        color: o.color || '#dceaff', colorTail: '#4d84ff', alpha: 0.8, taper: 0.3,
        autoFree: 0.3
      });
      if (!br) { break; }
      var ex = sx + rr(-8, 8), ey = Math.max(by, sy - rr(6, 18)), ez = sz + rr(-6, 6);
      var bs = 7, k;
      for (k = 0; k < bs; k++) {
        var tt = k / (bs - 1);
        br.push(lerp(sx, ex, tt) + rgauss() * 0.9,
                lerp(sy, ey, tt) + rgauss() * 0.4,
                lerp(sz, ez, tt) + rgauss() * 0.9);
      }
    }
    return 1;
  };

  /* ---- swing arc ------------------------------------------------------------ */
  RECIPES.swing = function (o) {
    if (Q.trails <= 0) { return 0; }
    var tr = acquireTrail({
      life: num(o.life, 0.20),
      width: num(o.width, 0.16) * num(o.scale, 1),
      additive: o.additive !== false,
      color: o.color || '#ffffff',
      colorTail: o.colorTail || '#9fc8ff',
      alpha: num(o.alpha, 0.85),
      taper: 0.5,
      autoFree: 0.45
    });
    if (!tr) { return 0; }
    var a = autoTrailGet();
    a.trail = tr;
    a.dur = num(o.duration, 0.17);
    a.x = num(o.x, 0); a.y = num(o.y, 1.15); a.z = num(o.z, 0);
    a.r = num(o.radius, 1.05) * num(o.scale, 1);
    a.face = num(o.face, 1) >= 0 ? 1 : -1;
    a.a0 = num(o.a0, 1.05);
    a.a1 = num(o.a1, -0.95);
    a.tilt = num(o.tilt, 0.25);
    autoTrails.push(a);
    return 1;
  };

  /* ---- ground arrow (stuck) -------------------------------------------------- */
  function onArrowLand(a) {
    RECIPES.dust({ x: a.x, y: 0.08, z: a.z, n: 3, power: 0.6, scale: 0.45, alpha: 0.35 });
    if (rnd() < 0.45) { addDecal('speck', a.x, a.z, { r: 0.5, alpha: 0.4, life: 8 }); }
  }

  /* ==========================================================================
   * 19. PUBLIC SPAWN DISPATCH
   * ======================================================================== */

  function spawn(type, o) {
    if (!ready) { if (!init()) { return null; } }
    var fn = RECIPES[type];
    if (!fn) {
      warnOnce('recipe:' + type, 'unknown effect type "' + type + '" — ignored.');
      return null;
    }
    try { return fn(o || EMPTY); }
    catch (e) { warnOnce('recipe:err:' + type, 'effect "' + type + '" threw — disabled for this frame.', e); return null; }
  }

  /* ==========================================================================
   * 20. THE IMPACT LIBRARY
   * --------------------------------------------------------------------------
   * Everything here is driven by the canonical event bus. Sim never has to know
   * this file exists — it emits `unit:hit` and the hit feels like a hit.
   * ======================================================================== */

  function unitY(u) { return num(u && u.y, 0); }
  function torsoY(u) { return unitY(u) + (u && u.cls === 'boss' ? 2.2 : 1.05); }

  /** Direction of the blow: away from the attacker, with an upward kick. */
  function blowDir(u, from, out) {
    var dx = 0, dz = 0;
    if (from && typeof from.x === 'number') {
      dx = num(u.x, 0) - from.x;
      dz = num(u.z, 0) - num(from.z, 0);
    }
    if (dx * dx + dz * dz < 0.0004) {
      dx = -num(u.face, u.team === -1 ? -1 : 1);
      dz = rr(-0.2, 0.2);
    }
    var l = Math.sqrt(dx * dx + dz * dz) || 1;
    out.set(dx / l, 0.55, dz / l).normalize();
    return out;
  }

  function hitIntensity(u, dmg) {
    var maxHp = num(u && u.maxHp, 100);
    var frac = clamp01(num(dmg, 5) / Math.max(1, maxHp));
    // sqrt curve: chip damage still registers, huge hits do not go off-scale
    return clamp(0.45 + Math.sqrt(frac) * 1.9, 0.45, 2.6);
  }

  function onUnitHit(p) {
    if (!ready || !p || !p.unit) { return; }
    var u = p.unit;
    var dmg = num(p.dmg, 0);
    var crit = !!p.crit;
    var power = hitIntensity(u, dmg) * (crit ? 1.7 : 1);
    var x = num(u.x, 0), z = num(u.z, 0), y = torsoY(u);

    blowDir(u, p.from, _v5);

    // --- blood spray, directional, intensity-scaled -------------------------
    RECIPES.blood({
      x: x, y: y, z: z,
      dx: _v5.x, dy: _v5.y, dz: _v5.z,
      n: (crit ? 24 : 13) * (0.6 + 0.5 * power),
      power: power,
      speed: crit ? 9 : 7,
      spread: crit ? 0.65 : 0.45,
      scale: crit ? 1.3 : 1,
      groundY: unitY(u) + 0.02
    });

    // --- hit flash: a bright pop exactly on the contact point ---------------
    RECIPES.flash({
      x: x + _v5.x * 0.25, y: y, z: z + _v5.z * 0.25,
      scale: (crit ? 0.7 : 0.36) * power,
      life: crit ? 0.16 : 0.10,
      alpha: crit ? 0.95 : 0.6,
      color: crit ? '#fff0c4' : '#ffffff',
      colorB: crit ? '#ff9c2e' : '#ffd9a8',
      star: crit
    });
    // Units3D owns the rigs; it can tint the mesh off this if it wants to.
    busEmit('vfx:flash', { unit: u, crit: crit, amount: clamp01(power * 0.5) });

    // --- small dust puff at the feet: weight transfer ----------------------
    RECIPES.dust({
      x: x + _v5.x * 0.3, y: unitY(u) + 0.08, z: z,
      n: crit ? 6 : 3, power: 0.6 * power, scale: 0.55, alpha: 0.3
    });

    if (crit) {
      // --- the full crit package -------------------------------------------
      RECIPES.shockwave({ x: x, z: z, y: unitY(u) + 0.5, r: 2.6 * power, power: 0.9, life: 0.45,
        color: '#ffe6b0' });
      RECIPES.sparks({ x: x, y: y, z: z, dx: _v5.x, dy: _v5.y, dz: _v5.z,
        n: 12, speed: 12, spread: 0.8, scale: 1.1, colorA: '#fff4d0', colorB: '#ff9a30' });
      hitstop(clamp(0.05 + power * 0.02, 0.05, 0.11));
      shake(clamp(0.14 + power * 0.06, 0.14, 0.4));
      if (Q.lights > 0) { flashLight('#ffd9a0', x, y, z, 2.4, 16, 0.14); }
    } else {
      shake(clamp(0.03 + power * 0.02, 0.03, 0.12));
    }

    // --- damage number ------------------------------------------------------
    if (dmg > 0) {
      damageText(dmg, x, y + 0.55, z, {
        crit: crit,
        friendly: (u.team === 1),
        scale: crit ? 1 : clamp(0.75 + power * 0.18, 0.75, 1.15)
      });
    }
  }

  function onUnitBlock(p) {
    if (!ready || !p) { return; }
    var u = p.unit || p;
    if (!u || typeof u.x !== 'number') { return; }
    var x = num(u.x, 0), z = num(u.z, 0), y = torsoY(u) - 0.05;
    // Shield normal points at the attacker: the unit's facing direction.
    var face = num(u.face, u.team === -1 ? -1 : 1) >= 0 ? 1 : -1;
    var nx = face, nz = rr(-0.15, 0.15);

    RECIPES.sparks({
      x: x + nx * 0.45, y: y, z: z + nz * 0.45,
      dx: nx, dy: 0.42, dz: nz,
      n: 18, speed: 11, spread: 0.42, scale: 1.05,
      colorA: '#ffffff', colorB: '#ffcf6a', stretch: 0.18
    });
    RECIPES.flash({ x: x + nx * 0.5, y: y, z: z + nz * 0.5, scale: 0.34, life: 0.09,
      color: '#e9f4ff', colorB: '#9fd0ff', alpha: 0.7, star: false });
    // A tight vertical ring — the "clang" made visible.
    pdReset();
    pd.x = x + nx * 0.5; pd.y = y; pd.z = z + nz * 0.5;
    pd.life = 0.24; pd.s0 = 0.35; pd.s1 = 1.9;
    pd.cA = PAL.steelA; pd.cB = PAL.steelB;
    pd.tile = P_RING; pd.alpha = 0.7; pd.fadeIn = 0.01; pd.fadeOut = 0.15;
    emitP(layerAdd);
    shake(0.05);
  }

  function onUnitDeath(p) {
    if (!ready || !p) { return; }
    var u = p.unit || p;
    if (!u || typeof u.x !== 'number') { return; }
    var x = num(u.x, 0), z = num(u.z, 0), gy = unitY(u);
    var boss = (u.cls === 'boss' || u.cls === 'champion');
    var s = boss ? 2.0 : 1;

    // --- dust burst: the body hits the ground ------------------------------
    RECIPES.dust({ x: x, y: gy + 0.1, z: z, n: 10 * s, power: 1.1 * s, scale: 0.95 * s, alpha: 0.42 });
    RECIPES.debris({ x: x, y: gy + 0.2, z: z, n: 4 * s, speed: 4 * s, spread: 1,
      scale: 0.75 * s, colorA: '#7d6c56', colorB: '#463c30', groundY: gy + 0.04 });

    // --- final blood + a pool that stays ------------------------------------
    if (bloodOn()) {
      RECIPES.blood({ x: x, y: gy + 0.9, z: z, dx: rr(-1, 1), dy: 0.8, dz: rr(-1, 1),
        n: 18 * s, power: 1.2 * s, speed: 6, spread: 0.9, groundY: gy + 0.02 });
      addDecal('blood', x, z, {
        r: rr(0.7, 1.15) * s, alpha: 0.8,
        life: 20 * (boss ? 1.6 : 1)
      });
      if (rnd() < 0.6) {
        addDecal('splatter', x + rr(-0.6, 0.6), z + rr(-0.6, 0.6), { r: rr(0.9, 1.6) * s, alpha: 0.55 });
      }
    } else {
      addDecal('speck', x, z, { r: 0.8 * s, alpha: 0.4, life: 8 });
    }

    // --- weapon drop: a tumbling chunk that lands and leaves a mark ----------
    var wx = rr(-1, 1), wz = rr(-1, 1);
    pdReset();
    pd.x = x; pd.y = gy + 1.0; pd.z = z;
    pd.vx = wx * 3.2; pd.vy = rr(3, 6); pd.vz = wz * 2.4;
    pd.life = 2.6;
    pd.s0 = 0.34 * s; pd.s1 = 0.30 * s;
    pd.cA = LC('#c8cdd4'); pd.cB = LC('#5c6068');
    pd.tile = P_STREAK; pd.stretch = 0.03;
    pd.drag = 0.25; pd.grav = -24; pd.groundY = gy + 0.05;
    pd.alpha = 1; pd.fadeIn = 0.01; pd.fadeOut = 0.86;
    pd.rot = rr(0, TAU); pd.rotV = rr(-14, 14);
    emitP(layerAlpha);

    if (boss) {
      RECIPES.explosion({ x: x, y: gy + 1.2, z: z, power: 1.2, scale: 1.3 });
      hitstop(0.1);
      shake(0.55);
    } else {
      shake(0.04);
    }
  }

  function onUnitAttack(p) {
    if (!ready || !p || !p.unit) { return; }
    var u = p.unit;
    var w = p.weapon || '';
    var x = num(u.x, 0), z = num(u.z, 0), y = unitY(u);
    var face = num(u.face, u.team === -1 ? -1 : 1) >= 0 ? 1 : -1;
    var tint = eraTint();

    if (/gun|rifle|musket|cannon|smg|laser|blaster|plasma/.test(w)) {
      RECIPES.muzzle({
        x: x + face * 0.7, y: y + 1.25, z: z,
        dx: face, dy: 0.04, dz: 0, scale: /cannon/.test(w) ? 1.8 : 1
      });
      if (/cannon/.test(w)) { shake(0.16); }
      return;
    }
    if (/bow|cross|sling|throw|javelin/.test(w)) {
      RECIPES.dust({ x: x + face * 0.5, y: y + 1.1, z: z, n: 2, power: 0.4, scale: 0.3, alpha: 0.2 });
      return;
    }
    if (/staff|wand|magic|spell|orb/.test(w)) {
      RECIPES.magic({ x: x + face * 0.7, y: y + 1.3, z: z, n: 10, radius: 0.35, scale: 0.7, era: true });
      return;
    }
    // Melee: a swung ribbon arc, era-tinted so bronze and future read apart.
    RECIPES.swing({
      x: x + face * 0.15, y: y + 1.12, z: z,
      face: face,
      radius: /axe|hammer|maul|club/.test(w) ? 1.25 : 1.05,
      duration: /axe|hammer|maul|club/.test(w) ? 0.22 : 0.16,
      width: /axe|hammer|maul|club/.test(w) ? 0.22 : 0.15,
      color: '#ffffff',
      colorTail: tint === ERA_TINT[7] ? '#5fe6ff' : '#a9c8ff',
      alpha: 0.8,
      tilt: rr(0.1, 0.4) * (rnd() < 0.5 ? 1 : -1)
    });
  }

  function fortX(team) {
    var t = (num(team, 1) >= 0) ? 1 : -1;
    if (AOW.FORT_X && typeof AOW.FORT_X[t] === 'number') { return AOW.FORT_X[t]; }
    return t === 1 ? 20 : 400;
  }

  function onFortHit(p) {
    if (!ready || !p) { return; }
    var team = num(p.team, 1) >= 0 ? 1 : -1;
    var fx = fortX(team);
    var dmg = num(p.dmg, 10);
    var maxHp = Math.max(1, num(p.max, 1000));
    var power = clamp(0.5 + Math.sqrt(clamp01(dmg / maxHp)) * 5, 0.5, 2.6);
    // Hit the face of the wall that the attackers are on.
    var side = (team === 1) ? 1 : -1;
    var x = fx + side * 4.2;
    var z = rr(-6, 6);
    var y = rr(2.2, 6.5);

    RECIPES.sparks({ x: x, y: y, z: z, dx: side, dy: 0.3, dz: 0,
      n: 8 * power, speed: 8, spread: 0.8, scale: 0.8,
      colorA: '#fff0d0', colorB: '#c99b60', groundY: 0.05 });
    RECIPES.debris({ x: x, y: y, z: z, dx: side, dy: 0.4, dz: 0,
      n: 7 * power, speed: 7 * power, spread: 0.7, scale: 1.0,
      colorA: '#cfc7b8', colorB: '#645d52', groundY: 0.06 });

    // A sheet of dust running DOWN the wall — the tell that it is stone,
    // not a health bar.
    var i, n = N(6 * power);
    for (i = 0; i < n; i++) {
      pdReset();
      pd.x = x + rr(-0.4, 0.4); pd.y = y - i * 0.35 + rr(-0.4, 0.4); pd.z = z + rr(-2.5, 2.5);
      pd.vx = side * rr(0.2, 1.2); pd.vy = rr(-2.5, -0.4); pd.vz = rr(-0.4, 0.4);
      pd.life = rr(1.0, 2.0);
      pd.s0 = rr(0.5, 1.1); pd.s1 = pd.s0 * rr(2, 3.4);
      pd.cA = PAL.dustA; pd.cB = PAL.dustB;
      pd.tile = P_DUST;
      pd.drag = 1.4; pd.grav = -1.2;
      pd.alpha = 0.4; pd.fadeIn = 0.1; pd.fadeOut = 0.3;
      pd.turb = 0.3; pd.rot = rr(0, TAU);
      emitP(layerAlpha);
    }
    RECIPES.dust({ x: x, y: 0.1, z: z, n: 5 * power, power: power, scale: 1.2, alpha: 0.35 });
    if (rnd() < 0.5) { addDecal('speck', x + side * rr(0.5, 2.5), z, { r: rr(0.6, 1.2), alpha: 0.45 }); }

    shake(clamp(0.10 + power * 0.09, 0.1, 0.45));
    if (dmg > maxHp * 0.06) { hitstop(0.045); }
  }

  function onFortDestroyed(p) {
    if (!ready) { return; }
    var team = num(p && p.team, p);
    var fx = fortX(team);
    var i;
    // Staggered secondary blasts: one explosion reads as a firework, a ripple
    // of them reads as a building coming apart.
    for (i = 0; i < 5; i++) {
      (function (k) {
        scheduleLocal(k * 0.13, function () {
          RECIPES.explosion({
            x: fx + rr(-7, 7), y: rr(1, 9), z: rr(-8, 8),
            power: k === 0 ? 1.6 : 1.0, scale: k === 0 ? 1.7 : 1.1
          });
        });
      })(i);
    }
    scheduleLocal(0.0, function () {
      RECIPES.smoke({ x: fx, y: 4, z: 0, n: 26, scale: 4.5, dark: true, alpha: 0.5, lifeMul: 2.2 });
      RECIPES.dust({ x: fx, y: 0.2, z: 0, n: 26, power: 2.4, scale: 4, alpha: 0.55 });
    });
    addDecal('scorch', fx, 0, { r: 9, alpha: 0.7, life: 40 });
    hitstop(0.14);
    shake(1);
  }

  /* --- tiny local scheduler (visual time, pause-aware) ---------------------- */
  var localTimers = [];
  var localTimerPool = [];

  function scheduleLocal(delay, fn) {
    var t = localTimerPool.pop() || { t: 0, fn: null };
    t.t = delay; t.fn = fn;
    localTimers.push(t);
    return t;
  }

  function updateLocalTimers(dt) {
    var i, t;
    for (i = localTimers.length - 1; i >= 0; i--) {
      t = localTimers[i];
      t.t -= dt;
      if (t.t <= 0) {
        localTimers.splice(i, 1);
        var fn = t.fn;
        t.fn = null;
        localTimerPool.push(t);
        try { fn(); } catch (e) { warnOnce('timer', 'scheduled effect threw', e); }
      }
    }
  }

  /* ==========================================================================
   * 21. SIGNATURE POWERS
   * --------------------------------------------------------------------------
   * Every power follows the same four-beat structure, because that structure is
   * what makes a power feel EARNED rather than dropped on the field:
   *
   *   TELEGRAPH  ground marks + an audio cue, so the player reads the shape
   *   CAST       the delivery — things fall, strike, ignite
   *   IMPACT     the payoff: light, shake, hit-stop, debris
   *   AFTERMATH  scorch, embers, settling dust — proof it happened
   * ======================================================================== */

  var POWERS = Object.create(null);
  var activePowers = [];
  var powerPool = [];

  function powerGet() {
    var p = powerPool.pop();
    if (!p) {
      p = {
        type: '', x: 0, z: 0, t: 0, phase: 0, timer: 0, idx: 0, n: 0,
        r: 10, dur: 1, scale: 1, era: 3, tint: PAL.white, done: false,
        tx: new Float32Array(16), tz: new Float32Array(16), team: 1,
        beam: null, sweep: 1, span: 12, lastMarkX: 0
      };
    }
    p.t = 0; p.phase = 0; p.timer = 0; p.idx = 0; p.done = false;
    p.beam = null; p.sweep = 1; p.span = 12; p.n = 0; p.lastMarkX = -1e9;
    return p;
  }

  function cue(p, phase) {
    busEmit('vfx:cue', { type: p.type, phase: phase, x: p.x, z: p.z, era: p.era });
  }

  function scatterTargets(p, count, spreadX, spreadZ) {
    p.n = Math.min(count, p.tx.length);
    for (var i = 0; i < p.n; i++) {
      p.tx[i] = p.x + rr(-spreadX, spreadX);
      p.tz[i] = p.z + rr(-spreadZ, spreadZ);
    }
  }

  /* ---- METEOR / BOULDER BARRAGE -------------------------------------------- */
  POWERS.meteor = {
    start: function (p) {
      p.r = 16 * p.scale;
      p.dur = 1.15;
      scatterTargets(p, Math.max(3, Math.round(6 * Q.bigPowers)), p.r * 0.85, 9);
      for (var i = 0; i < p.n; i++) {
        addDecal('target', p.tx[i], p.tz[i], {
          r: 3.0, life: p.dur + 0.35, alpha: 0.85, spin: 0.9,
          colorA: '#ff7a2e', colorB: '#ff3a10'
        });
        addDecal('light', p.tx[i], p.tz[i], { r: 3.4, life: p.dur + 0.3, alpha: 0.4,
          colorA: '#ff6a20', colorB: '#ff3a10' });
      }
      cue(p, 'telegraph');
      shake(0.08);
    },
    update: function (p, dt) {
      if (p.phase === 0) {
        // Telegraph: dust starts lifting off the marks as the pressure wave
        // arrives ahead of the rock.
        if (rnd() < dt * 14) {
          var k = (rnd() * p.n) | 0;
          RECIPES.dust({ x: p.tx[k], y: 0.1, z: p.tz[k], n: 2, power: 0.5, scale: 0.7, alpha: 0.25 });
        }
        if (p.t >= p.dur) {
          p.phase = 1; p.timer = 0; p.idx = 0;
          cue(p, 'cast');
        }
      } else if (p.phase === 1) {
        p.timer -= dt;
        if (p.timer <= 0 && p.idx < p.n) {
          var i = p.idx++;
          p.timer = rr(0.10, 0.26);
          var tx = p.tx[i], tz = p.tz[i];
          var fall = 62;
          var vy = -rr(34, 44);
          var tt = fall / -vy;
          spawnMeteor(
            tx - rr(4, 12), fall, tz - rr(2, 6),
            rr(4, 12) / tt, vy * 0.35, rr(2, 6) / tt,
            rr(0.85, 1.5) * p.scale,
            meteorImpact, p
          );
        }
        if (p.idx >= p.n && p.timer <= -1.6) { p.phase = 2; p.timer = 2.4; }
      } else {
        p.timer -= dt;
        // Aftermath: the field keeps burning for a beat.
        if (rnd() < dt * 8 && p.n > 0) {
          var j = (rnd() * p.n) | 0;
          RECIPES.embers({ x: p.tx[j], y: 0.3, z: p.tz[j], n: 2, radius: 1.6 });
        }
        if (p.timer <= 0) { p.done = true; }
      }
    }
  };

  function meteorImpact(x, y, z, r, p) {
    var s = r * 1.5;
    RECIPES.explosion({ x: x, y: 0.5, z: z, power: 1.3 * r, scale: 1.35 * r });
    addDecal('crater', x, z, { r: 3.2 * s, alpha: 0.9, life: 34 });
    addDecal('cracks', x, z, { r: 4.6 * s, alpha: 0.55, life: 22 });
    RECIPES.fire({ x: x, y: 0.2, z: z, n: 16, radius: 1.5 * s, scale: 1.6 * s, rise: 1.1 });
    RECIPES.embers({ x: x, y: 0.4, z: z, n: 12, radius: 2 * s });
    addFire(x, 0.25, z, 1.6 * s, 4.5);
    hitstop(0.07);
    shake(0.55 * r);
    busEmit('vfx:impact', { type: 'meteor', x: x, z: z, r: 3.2 * s });
  }

  /* ---- ARROW RAIN ----------------------------------------------------------- */
  POWERS.arrows = {
    start: function (p) {
      p.r = 15 * p.scale;
      p.dur = 0.85;
      p.n = 1;
      // A wide soft shadow reads as "something is above you" far better than
      // a target ring, and it is exactly what the arrows will darken.
      addDecal('shadow', p.x, p.z, {
        r: p.r, aspect: 0.55, life: p.dur + 1.5, alpha: 0.35,
        fadeIn: 0.25, fadeOut: 0.55
      });
      addDecal('target', p.x, p.z, { r: p.r * 0.9, aspect: 0.55, life: p.dur + 0.2,
        alpha: 0.6, colorA: '#ffd68a', colorB: '#ff9a3a', spin: 0.35 });
      cue(p, 'telegraph');
    },
    update: function (p, dt) {
      if (p.phase === 0) {
        if (p.t >= p.dur) { p.phase = 1; p.timer = 0; p.idx = 0; cue(p, 'cast'); }
      } else if (p.phase === 1) {
        p.timer -= dt;
        var volleys = Math.round(9 * Q.bigPowers);
        if (p.timer <= 0 && p.idx < volleys) {
          p.idx++;
          p.timer = 0.085;
          var per = Math.max(2, Math.round(5 * Q.bigPowers));
          for (var i = 0; i < per; i++) {
            var tx = p.x + rr(-p.r, p.r);
            var tz = p.z + rr(-p.r * 0.55, p.r * 0.55);
            var h = rr(34, 46);
            // Solve the arc so it actually lands on the mark.
            var vy0 = -rr(6, 12);
            var tt = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * 28 * h)) / 28;
            spawnArrow(
              tx - rr(6, 14), h, tz - rr(1, 4),
              rr(6, 14) / tt, vy0, rr(1, 4) / tt,
              { trail: true, life: rr(7, 11), scale: rr(0.85, 1.15) }
            );
          }
          if (p.idx === 1) { shake(0.12); }
        }
        if (p.idx >= volleys) { p.phase = 2; p.timer = 2.6; }
      } else {
        p.timer -= dt;
        if (p.timer <= 0) { p.done = true; }
      }
    }
  };

  /* ---- LIGHTNING STORM ------------------------------------------------------ */
  POWERS.lightning = {
    start: function (p) {
      p.r = 14 * p.scale;
      p.dur = 0.9;
      scatterTargets(p, Math.max(3, Math.round(7 * Q.bigPowers)), p.r, 8);
      for (var i = 0; i < p.n; i++) {
        addDecal('hex', p.tx[i], p.tz[i], {
          r: 2.4, life: p.dur + 0.3, alpha: 0.85, spin: -1.2,
          colorA: '#cfe6ff', colorB: '#4f9dff'
        });
      }
      // Static build-up: sparks crawling UP off the ground before the strike.
      cue(p, 'telegraph');
    },
    update: function (p, dt) {
      var i;
      if (p.phase === 0) {
        if (rnd() < dt * 26 && p.n > 0) {
          i = (rnd() * p.n) | 0;
          pdReset();
          pd.x = p.tx[i] + rr(-2, 2); pd.y = 0.05; pd.z = p.tz[i] + rr(-2, 2);
          pd.vx = rr(-0.5, 0.5); pd.vy = rr(3, 8); pd.vz = rr(-0.5, 0.5);
          pd.life = rr(0.25, 0.5);
          pd.s0 = 0.09; pd.s1 = 0.02;
          pd.cA = PAL.energyA; pd.cB = PAL.energyB;
          pd.tile = P_STREAK; pd.stretch = 0.12; pd.drag = 1.5;
          pd.alpha = 1; pd.fadeIn = 0.02; pd.fadeOut = 0.4;
          emitP(layerAdd);
        }
        if (p.t >= p.dur) { p.phase = 1; p.timer = 0; p.idx = 0; cue(p, 'cast'); }
      } else if (p.phase === 1) {
        p.timer -= dt;
        if (p.timer <= 0 && p.idx < p.n) {
          i = p.idx++;
          p.timer = rr(0.12, 0.30);
          strikeLightning(p.tx[i], p.tz[i], p.scale);
        }
        if (p.idx >= p.n && p.timer <= -0.8) { p.phase = 2; p.timer = 1.6; }
      } else {
        p.timer -= dt;
        if (p.timer <= 0) { p.done = true; }
      }
    }
  };

  function strikeLightning(x, z, scale) {
    var h = 52;
    RECIPES.bolt({ x: x + rr(-4, 4), y: h, z: z + rr(-3, 3), x2: x, y2: 0.1, z2: z,
      jitter: 2.6, segments: 18, life: 0.24, width: 0.34 * scale });
    // A second, thinner strike a frame later doubles the perceived voltage.
    scheduleLocal(0.05, function () {
      RECIPES.bolt({ x: x + rr(-3, 3), y: h, z: z + rr(-2, 2), x2: x, y2: 0.1, z2: z,
        jitter: 1.8, segments: 14, life: 0.16, width: 0.16 * scale, color: '#ffffff' });
    });
    RECIPES.flash({ x: x, y: 1.2, z: z, scale: 3 * scale, life: 0.14, alpha: 1,
      color: '#e8f2ff', colorB: '#7fb4ff' });
    RECIPES.shockwave({ x: x, z: z, y: 0.6, r: 7 * scale, power: 1, life: 0.5, color: '#cfe6ff' });
    RECIPES.sparks({ x: x, y: 0.3, z: z, dx: 0, dy: 1, dz: 0,
      n: 28, speed: 15 * scale, spread: 1.2, scale: 1.1,
      colorA: '#ffffff', colorB: '#5fa0ff', groundY: 0.05 });
    RECIPES.dust({ x: x, y: 0.1, z: z, n: 10, power: 1.4, scale: 1.6, alpha: 0.45 });
    addDecal('scorch', x, z, { r: 2.2 * scale, alpha: 0.85, life: 24 });
    addDecal('cracks', x, z, { r: 3.4 * scale, alpha: 0.5, life: 18 });
    if (Q.lights > 0) { flashLight('#cfe2ff', x, 8, z, 9, 90, 0.22); }
    hitstop(0.06);
    shake(0.5 * scale);
    busEmit('vfx:impact', { type: 'lightning', x: x, z: z, r: 4 * scale });
  }

  /* ---- FIRE WALL ------------------------------------------------------------ */
  POWERS.firewall = {
    start: function (p) {
      p.r = 15 * p.scale;         // half-length along z
      p.dur = 0.7;
      p.timer = 0;
      addDecal('streak', p.x, p.z, {
        r: p.r, aspect: 0.10, rot: 0, life: p.dur + 0.2, alpha: 0.8,
        colorA: '#ff7a2e', colorB: '#ff3a10'
      });
      cue(p, 'telegraph');
    },
    update: function (p, dt) {
      var zz;
      if (p.phase === 0) {
        if (rnd() < dt * 30) {
          zz = p.z + rr(-p.r, p.r);
          RECIPES.embers({ x: p.x + rr(-0.4, 0.4), y: 0.1, z: zz, n: 1, radius: 0.3 });
        }
        if (p.t >= p.dur) {
          p.phase = 1; p.timer = 5.5;
          cue(p, 'cast');
          // Ignition runs OUT from the centre so the wall reads as spreading.
          var seg = Math.max(4, Math.round(10 * Q.bigPowers)), i;
          for (i = 0; i < seg; i++) {
            (function (k) {
              var f = (k / (seg - 1)) * 2 - 1;
              scheduleLocal(Math.abs(f) * 0.28, function () {
                var az = p.z + f * p.r;
                RECIPES.explosion({ x: p.x, y: 0.4, z: az, power: 0.45, scale: 0.7 });
                addFire(p.x, 0.2, az, 1.5 * p.scale, 6.0);
                addDecal('scorch', p.x, az, { r: 2.0 * p.scale, alpha: 0.7, life: 26 });
              });
            })(i);
          }
          shake(0.3);
        }
      } else if (p.phase === 1) {
        p.timer -= dt;
        // Sustained burn: the fires registry handles flame/ember/shimmer.
        if (rnd() < dt * 18) {
          zz = p.z + rr(-p.r, p.r);
          RECIPES.fire({ x: p.x + rr(-0.5, 0.5), y: 0.15, z: zz, n: 3, radius: 0.6,
            scale: 1.5 * p.scale, rise: 1.4, smoke: false });
        }
        if (p.timer <= 0) { p.phase = 2; p.timer = 2.5; }
      } else {
        p.timer -= dt;
        if (p.timer <= 0) { p.done = true; }
      }
    }
  };

  /* ---- FREEZE --------------------------------------------------------------- */
  POWERS.freeze = {
    start: function (p) {
      p.r = 17 * p.scale;
      p.dur = 0.55;
      addDecal('hex', p.x, p.z, { r: p.r * 0.5, life: p.dur + 0.2, alpha: 0.8,
        colorA: '#dff6ff', colorB: '#69c4ff', spin: 0.8 });
      cue(p, 'telegraph');
    },
    update: function (p, dt) {
      if (p.phase === 0) {
        if (p.t >= p.dur) {
          p.phase = 1; p.timer = 1.2;
          cue(p, 'cast');
          // The freeze front: a fast ring that grows and STOPS, plus a frost
          // patch that stays as proof the ground is iced.
          addDecal('ring', p.x, p.z, { r0: 1, r1: p.r, life: 0.7, alpha: 1, ease: true,
            colorA: '#f2fcff', colorB: '#6fc8ff' });
          addDecal('frost', p.x, p.z, { r: p.r * 0.95, life: 8 * Q.decalLife, alpha: 0.75,
            fadeIn: 0.12, fadeOut: 0.45 });
          var rings = 3, i;
          for (i = 1; i <= rings; i++) {
            (function (k) {
              scheduleLocal(k * 0.09, function () {
                RECIPES.frost({ x: p.x, y: 0.9, z: p.z, n: 22, radius: p.r * (0.35 + k * 0.22),
                  power: 1, scale: 1.2 });
              });
            })(i);
          }
          RECIPES.flash({ x: p.x, y: 1.2, z: p.z, scale: 2.4 * p.scale, life: 0.2,
            color: '#eafaff', colorB: '#79cbff' });
          // Sim/Units3D decide what "frozen" means mechanically; we just say
          // where and for how long.
          busEmit('vfx:freeze', { x: p.x, z: p.z, r: p.r, duration: 3.5 });
          shake(0.28);
          if (Q.lights > 0) { flashLight('#bfe8ff', p.x, 3, p.z, 4, 50, 0.3); }
        }
      } else if (p.phase === 1) {
        p.timer -= dt;
        if (rnd() < dt * 22) {
          var a = rr(0, TAU), d = rr(0, p.r);
          RECIPES.frost({ x: p.x + Math.cos(a) * d, y: rr(0.2, 1.6), z: p.z + Math.sin(a) * d,
            n: 2, radius: 0.4, scale: 0.7 });
        }
        if (p.timer <= 0) { p.done = true; }
      }
    }
  };

  /* ---- ORBITAL / ENERGY BEAM ------------------------------------------------- */

  /* Site-owned option objects for the sweep, which runs every frame while the
     beam is walking the lane. */
  var _oBShock  = { x: 0, z: 0, y: 0.4, r: 4.5, power: 0.6, life: 0.35, color: '#cfeaff' };
  var _oBDebris = { x: 0, y: 0.3, z: 0, n: 5, speed: 12, spread: 1.2, scale: 1.1,
                    colorA: '#8a939c', colorB: '#3a3f45' };
  var _oBEnergy = { x: 0, y: 1.2, z: 0, n: 8, radius: 1.4, speed: 7,
                    colorA: '#e8feff', colorB: '#1f7bff' };
  var _oBSmoke  = { x: 0, y: 0.6, z: 0, n: 3, scale: 1.6, dark: true, alpha: 0.35 };
  var _oBScorch = { r: 2.4, alpha: 0.8, life: 30 };
  var _oBLight  = { r: 5, life: 0.25, alpha: 0.7, colorA: '#bfe4ff', colorB: '#2e8bff' };

  POWERS.beam = {
    start: function (p) {
      p.r = 3.2 * p.scale;
      p.dur = 1.0;
      p.sweep = rr(-1, 1) >= 0 ? 1 : -1;
      p.span = 12 * p.scale;
      addDecal('hex', p.x, p.z, { r: p.r * 2.2, life: p.dur + 0.2, alpha: 0.9, spin: 1.4,
        colorA: '#d8fbff', colorB: '#1e7bff' });
      addDecal('target', p.x, p.z, { r: p.r * 3.0, life: p.dur, alpha: 0.5, spin: -0.7,
        colorA: '#9fe8ff', colorB: '#1e7bff' });
      cue(p, 'telegraph');
    },
    update: function (p, dt) {
      var cx;
      if (p.phase === 0) {
        // Charge-in: motes rushing to the strike point.
        if (rnd() < dt * 40) {
          RECIPES.magic({ x: p.x, y: 0.6, z: p.z, n: 3, radius: p.r * 3, inward: true,
            colorA: '#e8feff', colorB: '#1f7bff', speed: 9 });
        }
        if (p.t >= p.dur) {
          p.phase = 1; p.timer = 1.6;
          cue(p, 'cast');
          p.beam = fireBeam(p.x, 160, p.z, p.x, 0, p.z, {
            life: 1.75, radius: p.r, alpha: 1.15, pulse: 1, scroll: 2.2,
            colorA: '#ffffff', colorB: '#2e8bff'
          });
          RECIPES.flash({ x: p.x, y: 1, z: p.z, scale: 4 * p.scale, life: 0.25, alpha: 1,
            color: '#ffffff', colorB: '#3f9cff' });
          if (Q.lights > 0) { flashLight('#bfe0ff', p.x, 6, p.z, 8, 110, 0.5); }
          hitstop(0.08);
          shake(0.7);
        }
      } else if (p.phase === 1) {
        p.timer -= dt;
        // The beam walks along the lane, chewing up the ground under it.
        var k = 1 - clamp01(p.timer / 1.6);
        cx = p.x + p.sweep * p.span * k;
        // Our own beam, not "whichever beam happens to be first" — two powers
        // overlapping must not drag each other's beams across the map.
        if (p.beam && p.beam.active) {
          orientBetween(p.beam.mesh, cx, 160, p.z, cx, 0, p.z, p.beam.radius);
        }
        // Per-frame during the sweep: reuse the site objects, never allocate.
        _oBShock.x = cx; _oBShock.z = p.z; _oBShock.r = 4.5 * p.scale;
        RECIPES.shockwave(_oBShock);
        _oBDebris.x = cx; _oBDebris.z = p.z;
        RECIPES.debris(_oBDebris);
        _oBEnergy.x = cx; _oBEnergy.z = p.z; _oBEnergy.radius = 1.4 * p.scale;
        RECIPES.magic(_oBEnergy);
        _oBSmoke.x = cx; _oBSmoke.z = p.z;
        RECIPES.smoke(_oBSmoke);
        // Scorch is a PERSISTENT decal: laying one every frame would burn the
        // whole tier budget in under a second and starve the blood pools. Gate
        // it on distance travelled so the burn line is continuous but sparse.
        if (Math.abs(cx - p.lastMarkX) > 1.3) {
          p.lastMarkX = cx;
          _oBScorch.r = 2.4 * p.scale;
          addDecal('scorch', cx, p.z, _oBScorch);
        }
        _oBLight.r = 5 * p.scale;
        addDecal('light', cx, p.z, _oBLight);
        shake(0.10);
        if (p.timer <= 0) { p.phase = 2; p.timer = 2.0; }
      } else {
        p.timer -= dt;
        if (p.timer <= 0) { p.done = true; }
      }
    }
  };

  /* --- alias table so Sim can name powers however it likes ------------------ */
  var POWER_ALIAS = {
    meteor: 'meteor', meteors: 'meteor', boulder: 'meteor', boulders: 'meteor',
    rocks: 'meteor', barrage: 'meteor', catapult: 'meteor', artillery: 'meteor',
    arrow: 'arrows', arrows: 'arrows', arrowrain: 'arrows', volley: 'arrows', rain: 'arrows',
    lightning: 'lightning', storm: 'lightning', thunder: 'lightning', shock: 'lightning',
    fire: 'firewall', firewall: 'firewall', flame: 'firewall', napalm: 'firewall', burn: 'firewall',
    freeze: 'freeze', ice: 'freeze', frost: 'freeze', blizzard: 'freeze',
    beam: 'beam', orbital: 'beam', laser: 'beam', railgun: 'beam', strike: 'beam'
  };

  function castPower(type, x, z, o) {
    if (!ready) { if (!init()) { return null; } }
    o = o || EMPTY;
    var key = POWER_ALIAS[String(type || '').toLowerCase()] || null;
    if (!key || !POWERS[key]) {
      // Unknown power: still give the player a real, readable payoff.
      warnOnce('power:' + type, 'unknown power "' + type + '" — falling back to a generic blast.');
      RECIPES.explosion({ x: num(x, 0), y: 0.8, z: num(z, 0), power: 1.4, scale: 1.5 });
      return null;
    }
    if (activePowers.length >= CAP.powers) { return null; }

    var p = powerGet();
    p.type = key;
    p.x = num(x, 0);
    p.z = num(z, 0);
    p.era = eraIdx();
    p.tint = eraTint();
    p.team = num(o.team, 1);
    // Era scaling: the same spell at era 8 is bigger and brighter than at era 1.
    p.scale = num(o.scale, 1) * (0.78 + p.era * 0.055) * (0.65 + 0.35 * Q.bigPowers);
    activePowers.push(p);
    try { POWERS[key].start(p); }
    catch (e) { warnOnce('power:start:' + key, 'power "' + key + '" failed to start', e); p.done = true; }
    return p;
  }

  function updatePowers(dt) {
    var i, p;
    for (i = activePowers.length - 1; i >= 0; i--) {
      p = activePowers[i];
      p.t += dt;
      if (!p.done) {
        try { POWERS[p.type].update(p, dt); }
        catch (e) { warnOnce('power:upd:' + p.type, 'power "' + p.type + '" threw — ended early', e); p.done = true; }
      }
      if (p.done || p.t > 30) {
        activePowers.splice(i, 1);
        powerPool.push(p);
      }
    }
    stats.powers = activePowers.length;
  }

  /* ==========================================================================
   * 22. AMBIENT LIFE
   * --------------------------------------------------------------------------
   * The cheap trick that separates a "3D game" from a WORLD: nothing on screen
   * is ever perfectly still. Motes drift in the key light, embers rise off
   * fires, leaves blow through, heat bends the air.
   * ======================================================================== */

  var fires = [];
  var firePool = [];
  var moteAcc = 0, leafAcc = 0;
  var _moteCol = [1, 1, 1];
  var _moteColB = [1, 1, 1];

  /** Register a burning spot. Ambient embers/shimmer follow it automatically. */
  function addFire(x, y, z, r, life) {
    if (!ready) { return null; }
    if (fires.length >= 32) { fires.shift(); }
    var f = firePool.pop() || { x: 0, y: 0, z: 0, r: 1, t: 0, life: 5, acc: 0, accE: 0, accH: 0 };
    f.x = num(x, 0); f.y = num(y, 0.2); f.z = num(z, 0);
    f.r = num(r, 1); f.life = num(life, 5); f.t = 0;
    f.acc = 0; f.accE = 0; f.accH = 0;
    fires.push(f);
    return f;
  }

  function removeFire(f) {
    var i = fires.indexOf(f);
    if (i >= 0) { fires.splice(i, 1); firePool.push(f); }
  }

  /* Per-call-site option objects. updateFires runs EVERY frame for EVERY fire,
     so building option literals here would be the one place in this file that
     genuinely allocates in a hot loop. Each site owns its own object, so nested
     recipe calls can never clobber a caller's arguments. */
  var _oFire  = { x: 0, y: 0, z: 0, n: 1, radius: 1, scale: 1, rise: 1.2, smoke: false };
  var _oEmber = { x: 0, y: 0, z: 0, n: 1, radius: 1 };
  var _oFireLight = { r: 1, life: 0.35, alpha: 0.35, colorA: '#ff9c46', colorB: '#ff4a10' };
  var _oFireOut = { x: 0, y: 0, z: 0, n: 3, scale: 1, dark: true, alpha: 0.25, lifeMul: 1.4 };

  function updateFires(dt) {
    var i, f;
    for (i = fires.length - 1; i >= 0; i--) {
      f = fires[i];
      f.t += dt;
      if (f.t >= f.life) {
        // Dying fire: a last breath of smoke so it does not just switch off.
        _oFireOut.x = f.x; _oFireOut.y = f.y + 0.4; _oFireOut.z = f.z;
        _oFireOut.scale = f.r * 1.4;
        RECIPES.smoke(_oFireOut);
        fires.splice(i, 1);
        firePool.push(f);
        continue;
      }
      var fade = 1 - clamp01((f.t - (f.life - 1.2)) / 1.2);

      // flames
      f.acc += dt * 26 * Q.ambient * fade * clamp(f.r, 0.4, 3);
      if (f.acc >= 1) {
        _oFire.x = f.x; _oFire.y = f.y; _oFire.z = f.z;
        _oFire.radius = f.r * 0.7; _oFire.scale = f.r * 1.15;
        while (f.acc >= 1) { f.acc -= 1; RECIPES.fire(_oFire); }
      }
      // embers
      f.accE += dt * 7 * Q.ambient * fade;
      if (f.accE >= 1) {
        _oEmber.x = f.x; _oEmber.y = f.y + 0.2; _oEmber.z = f.z;
        _oEmber.radius = f.r * 0.9;
        while (f.accE >= 1) { f.accE -= 1; RECIPES.embers(_oEmber); }
      }
      // heat shimmer — stylised: a very low-alpha additive haze column that
      // wobbles. No render target is available for real refraction, and a fake
      // that reads correctly beats a broken grab-pass.
      if (Q.shimmer) {
        f.accH += dt * 3.4 * Q.ambient * fade;
        while (f.accH >= 1) {
          f.accH -= 1;
          pdReset();
          pd.x = f.x + rr(-f.r, f.r) * 0.5;
          pd.y = f.y + rr(0.4, 1.4);
          pd.z = f.z + rr(-f.r, f.r) * 0.5;
          pd.vy = rr(1.6, 3.0);
          pd.vx = rr(-0.3, 0.3); pd.vz = rr(-0.3, 0.3);
          pd.life = rr(0.9, 1.7);
          pd.s0 = f.r * rr(1.0, 1.6); pd.s1 = pd.s0 * rr(1.6, 2.4);
          pd.cA = LC('#ffd8a8'); pd.cB = LC('#ff8a3a');
          pd.tile = P_HAZE;
          pd.alpha = 0.16; pd.fadeIn = 0.25; pd.fadeOut = 0.3;
          pd.turb = 1.3; pd.drag = 0.6; pd.grav = 1.2;
          pd.rot = rr(0, TAU); pd.rotV = rr(-0.7, 0.7);
          emitP(layerAdd);
        }
      }
      // ground light pool under the fire
      if (rnd() < dt * 6) {
        _oFireLight.r = f.r * rr(2.0, 2.8);
        _oFireLight.alpha = 0.35 * fade;
        addDecal('light', f.x, f.z, _oFireLight);
      }
    }
  }

  function updateAmbient(dt) {
    if (Q.ambient <= 0) { return; }

    var focus = 0;
    try { focus = (R && typeof R.getFocusX === 'function') ? R.getFocusX() : 0; }
    catch (e) { focus = 0; }

    // Motes take their colour from the key light, so they genuinely look like
    // dust caught in the sun rather than white confetti.
    try {
      if (R && R.sky && R.sky.keyColor) {
        _moteCol[0] = R.sky.keyColor.r * 0.9;
        _moteCol[1] = R.sky.keyColor.g * 0.9;
        _moteCol[2] = R.sky.keyColor.b * 0.9;
        _moteColB[0] = _moteCol[0] * 0.25;
        _moteColB[1] = _moteCol[1] * 0.25;
        _moteColB[2] = _moteCol[2] * 0.3;
      }
    } catch (e2) { /* keep the previous colour */ }

    // --- dust motes ---------------------------------------------------------
    var moteLife = 7.5;
    moteAcc += dt * (Q.motes / moteLife);
    while (moteAcc >= 1) {
      moteAcc -= 1;
      pdReset();
      pd.x = focus + rr(-55, 55);
      pd.y = rr(0.4, 13);
      pd.z = rr(-19, 19);
      pd.vx = rr(-0.35, 0.55); pd.vy = rr(-0.12, 0.30); pd.vz = rr(-0.25, 0.25);
      pd.life = moteLife * rr(0.7, 1.3);
      pd.s0 = rr(0.035, 0.085); pd.s1 = pd.s0;
      pd.cA = _moteCol; pd.cB = _moteColB;
      pd.tile = P_SPARK;
      pd.drag = 0.15; pd.grav = -0.05;
      pd.alpha = rr(0.22, 0.55); pd.fadeIn = 0.18; pd.fadeOut = 0.55;
      pd.turb = 0.18; pd.flicker = 0.35;
      emitP(layerAdd);
    }

    // --- wind-blown leaves / petals ----------------------------------------
    var leafLife = 6.0;
    leafAcc += dt * (Q.leaves / leafLife);
    while (leafAcc >= 1) {
      leafAcc -= 1;
      var era = eraIdx();
      pdReset();
      pd.x = focus - rr(35, 60);
      pd.y = rr(1.5, 11);
      pd.z = rr(-18, 18);
      pd.vx = rr(6, 12); pd.vy = rr(-1.2, 0.6); pd.vz = rr(-1, 1);
      pd.life = leafLife * rr(0.8, 1.2);
      pd.s0 = rr(0.14, 0.26); pd.s1 = pd.s0;
      pd.cA = (era >= 5) ? LC('#9aa3ab') : PAL.leafA;
      pd.cB = (era >= 5) ? LC('#5b636a') : PAL.leafB;
      pd.tile = P_LEAF;
      pd.drag = 0.55; pd.grav = -1.6;
      pd.alpha = 0.8; pd.fadeIn = 0.12; pd.fadeOut = 0.7;
      pd.turb = 1.5;
      pd.rot = rr(0, TAU); pd.rotV = rr(-5, 5);
      pd.groundY = 0.03;
      emitP(layerAlpha);
    }
  }

  /* ==========================================================================
   * 23. EVENT WIRING
   * ======================================================================== */

  function wireEvents() {
    busOn('unit:hit', onUnitHit);
    busOn('unit:block', onUnitBlock);
    busOn('unit:death', onUnitDeath);
    busOn('unit:attack', onUnitAttack);
    busOn('fort:hit', onFortHit);
    busOn('fort:destroyed', onFortDestroyed);

    busOn('power:cast', function (p) {
      if (!p) { return; }
      castPower(p.type, num(p.x, 0), num(p.z, 0), p);
    });

    busOn('boss:spawn', function (p) {
      var b = p && (p.boss || p);
      var x = num(b && b.x, 0), z = num(b && b.z, 0);
      RECIPES.shockwave({ x: x, z: z, y: 0.6, r: 12, power: 1.2, life: 0.8, color: '#ff9a5a' });
      RECIPES.dust({ x: x, y: 0.15, z: z, n: 26, power: 2.2, scale: 3, alpha: 0.5 });
      RECIPES.debris({ x: x, y: 0.3, z: z, n: 14, speed: 9, spread: 1.2, scale: 1.3 });
      addDecal('cracks', x, z, { r: 6, alpha: 0.6, life: 26 });
      hitstop(0.09);
      shake(0.6);
    });

    busOn('boss:phase', function (p) {
      var b = p && (p.boss || p);
      var x = num(b && b.x, 0), z = num(b && b.z, 0);
      RECIPES.magic({ x: x, y: 1.6, z: z, n: 40, radius: 3.5, inward: true, era: true, speed: 12 });
      RECIPES.flash({ x: x, y: 1.6, z: z, scale: 3, life: 0.25, color: '#ffe7c0' });
      shake(0.4);
    });

    busOn('era:evolve', function () {
      // A quick wash of era-tinted motes so the evolve reads instantly.
      var focus = 0;
      try { focus = (R && typeof R.getFocusX === 'function') ? R.getFocusX() : 0; } catch (e) {}
      var t = eraTint(), i;
      for (i = 0; i < N(60); i++) {
        pdReset();
        pd.x = focus + rr(-45, 45); pd.y = rr(0.2, 12); pd.z = rr(-18, 18);
        pd.vx = rr(-1, 1); pd.vy = rr(2, 7); pd.vz = rr(-1, 1);
        pd.life = rr(1.2, 2.6);
        pd.s0 = rr(0.1, 0.28); pd.s1 = pd.s0 * 0.2;
        pd.cA = PAL.white; pd.cB = t;
        pd.tile = (rnd() < 0.4) ? P_STAR : P_GLOW;
        pd.drag = 1.0; pd.grav = 1.5;
        pd.alpha = 0.9; pd.fadeIn = 0.1; pd.fadeOut = 0.4;
        pd.turb = 0.6; pd.rot = rr(0, TAU); pd.rotV = rr(-3, 3);
        emitP(layerAdd);
      }
      shake(0.3);
    });

    busOn('game:reset', function () { clearAll(); });
    busOn('game:new', function () { clearAll(); });

    busOn('perf:tier', function (t) { setQuality(t); });
    busOn('render:quality', function (p) { if (p && p.tier) { setQuality(p.tier); } });

    busOn('gold:change', function (p) {
      // Only celebrate meaningful income, never a 1-gold trickle.
      if (!p || !numbersOn()) { return; }
      var d = num(p.delta, 0);
      if (d < 25) { return; }
      var focus = 0;
      try { focus = (R && typeof R.getFocusX === 'function') ? R.getFocusX() : 0; } catch (e) {}
      addText('+' + Math.round(d), focus + rr(-6, 6), rr(3.5, 5), rr(-4, 4), {
        color: '#ffd75e', scale: 0.8, life: 1.3, rise: 2.4
      });
    });
  }

  /* ==========================================================================
   * 24. FRAME UPDATE
   * ======================================================================== */

  var _fogCol = new THREE.Color();

  function syncFrameUniforms() {
    var mats = [matAdd, matAlpha, matDecalA, matDecalAdd];
    var i, u;
    for (i = 0; i < mats.length; i++) {
      u = mats[i].uniforms;
      u.uTime.value = vtime;
    }
    matText.uniforms.uTime.value = vtime;

    // Mirror the scene's FogExp2 into our shaders. Doing it every frame is one
    // uniform write and it means a time-of-day change never leaves the
    // particles hanging in clear air while the world greys out.
    var fog = scene && scene.fog;
    if (fog && fog.color) {
      _fogCol.copy(fog.color);
      var d = num(fog.density, 0.003);
      for (i = 0; i < mats.length; i++) {
        u = mats[i].uniforms;
        u.uFogColor.value.copy(_fogCol);
        u.uFogDensity.value = d;
      }
      matRibbonAdd.uniforms.uFogColor.value.copy(_fogCol);
      matRibbonAdd.uniforms.uFogDensity.value = d;
      matRibbonAlpha.uniforms.uFogColor.value.copy(_fogCol);
      matRibbonAlpha.uniforms.uFogDensity.value = d;
    }
  }

  function update(dtReal) {
    if (!ready) {
      if (failed) { return; }
      // Render may not have come up yet — retry cheaply until it does.
      if (!init()) { return; }
    }

    var d = num(dtReal, 1 / 60);
    if (d <= 0 || d > 0.25) { d = 1 / 60; }
    lastDt = d;
    realTime += d;

    var st = Core && Core.state;
    var paused = st ? !!st.paused : false;
    var speed = st ? clamp(num(st.speed, 1), 1, 3) : 1;

    var dt = paused ? 0 : d * speed;

    // Hit-stop: crush our own clock so particles, trails, powers and the sim
    // all hold still together. Anything less and impact turns into a stutter.
    if (hitstopT > 0) {
      hitstopT -= d;
      dt *= 0.14;
      if (hitstopT < 0) { hitstopT = 0; }
    }

    vtime += dt;

    try {
      if (camera) { camera.getWorldPosition(_camPos); }

      syncFrameUniforms();
      recountDecals();          // frees the persistent-decal budget as they fade

      updateLocalTimers(dt);
      updatePowers(dt);
      updateMeteors(dt);
      updateArrows(dt);
      updateFires(dt);
      updateAmbient(dt);
      updateAutoTrails(dt);
      updateBeams(dt);
      updateLights(dt);
      updateTrails(dt);

      // Uploads happen LAST so everything spawned this frame ships in one go.
      layerAdd.flush(vtime);
      layerAlpha.flush(vtime);
      decalAlpha.flush(vtime);
      decalAdd.flush(vtime);
      textLayer.flush(vtime);

      stats.particles = layerAdd.count + layerAlpha.count;
      stats.decals = decalAlpha.count + decalAdd.count;
      stats.texts = textLayer.count;

      // Honest draw-call count for the perf HUD: the five instanced layers only
      // cost anything when populated, and everything else is a hidden pool.
      var calls = 0, j;
      if (layerAdd.count > 0) { calls++; }
      if (layerAlpha.count > 0) { calls++; }
      if (decalAlpha.count > 0) { calls++; }
      if (decalAdd.count > 0) { calls++; }
      if (textLayer.count > 0) { calls++; }
      calls += stats.trails;
      for (j = 0; j < beams.length; j++) { if (beams[j].active) { calls++; } }
      for (j = 0; j < meteors.length; j++) { if (meteors[j].active) { calls++; } }
      if (arrowMesh && arrowMesh.visible) { calls++; }
      stats.drawCalls = calls;

    } catch (err) {
      warnOnce('update', 'frame update threw — effects continue at reduced fidelity.', err);
    }
  }

  /* ==========================================================================
   * 25. QUALITY / LIFECYCLE
   * ======================================================================== */

  function setQuality(tier) {
    var t = normTier(tier);
    if (!t || t === qTier) { return qTier; }
    qTier = t;
    Q = QCFG[t];

    // The light COUNT is fixed at init (changing it recompiles every shader in
    // the scene). On a downgrade we simply stop using them.
    var i;
    if (Q.lights <= 0) {
      for (i = 0; i < lights.length; i++) { releaseLight(lights[i]); }
    }
    // Retire trails above the new budget so the cost drops immediately.
    var live = 0;
    for (i = 0; i < trails.length; i++) {
      if (!trails[i].active) { continue; }
      live++;
      if (live > Q.trails) { trails[i].free(); }
    }
    if (!Q.shimmer) { /* shimmer emitters simply stop being fed */ }
    return qTier;
  }

  function clearAll() {
    if (!ready) { return; }
    var i;
    try {
      layerAdd.clear(); layerAlpha.clear();
      decalAlpha.clear(); decalAdd.clear();
      textLayer.clear();

      for (i = 0; i < trails.length; i++) { if (trails[i].active) { trails[i].free(); } }
      autoTrails.length = 0;
      for (i = 0; i < beams.length; i++) { beams[i].active = false; beams[i].mesh.visible = false; }
      for (i = 0; i < meteors.length; i++) {
        if (meteors[i].active) {
          meteors[i].active = false;
          meteors[i].mesh.visible = false;
          if (meteors[i].trail) { meteors[i].trail.free(); meteors[i].trail = null; }
          if (meteors[i].light) { releaseLight(meteors[i].light); meteors[i].light = null; }
        }
      }
      for (i = arrows.length - 1; i >= 0; i--) { arrowFree.push(arrows[i]); }
      arrows.length = 0;
      if (arrowMesh) { arrowMesh.count = 0; arrowMesh.visible = false; }
      for (i = 0; i < lights.length; i++) { releaseLight(lights[i]); }
      for (i = activePowers.length - 1; i >= 0; i--) { powerPool.push(activePowers[i]); }
      activePowers.length = 0;
      for (i = fires.length - 1; i >= 0; i--) { firePool.push(fires[i]); }
      fires.length = 0;
      localTimers.length = 0;
      hitstopT = 0;
      moteAcc = 0; leafAcc = 0;
      decalExp.fill(0);
      decalLive = 0;
    } catch (e) {
      warnOnce('clear', 'clear() partially failed', e);
    }
  }

  function dispose() {
    if (!ready) { return; }
    try {
      clearAll();
      var i;
      for (i = 0; i < lights.length; i++) { scene.remove(lights[i].light); }
      lights.length = 0;
      if (fxRoot && fxRoot.parent) { fxRoot.parent.remove(fxRoot); }
      var mats = [matAdd, matAlpha, matDecalA, matDecalAdd, matText, matRibbonAdd, matRibbonAlpha, matBeam];
      for (i = 0; i < mats.length; i++) { if (mats[i]) { mats[i].dispose(); } }
      for (i = 0; i < beams.length; i++) { if (beams[i].mat) { beams[i].mat.dispose(); } }
      layerAdd.dispose(); layerAlpha.dispose();
      decalAlpha.dispose(); decalAdd.dispose(); textLayer.dispose();
      for (i = 0; i < trails.length; i++) { trails[i].geo.dispose(); }
      for (var k in _texCache) {
        if (Object.prototype.hasOwnProperty.call(_texCache, k) && _texCache[k]) { _texCache[k].dispose(); }
      }
    } catch (e) {
      warnOnce('dispose', 'dispose issue', e);
    }
    ready = false;
    if (AOW.VFX) { AOW.VFX.ready = false; }
  }

  /* ==========================================================================
   * 26. PUBLIC API
   * ======================================================================== */

  var VFX = {
    __isAowVfx: true,
    version: '1.0.0',
    ready: false,
    failed: false,

    /** Bring the system up. Safe to call repeatedly; no-ops once ready. */
    init: init,

    /**
     * spawn(type, opts) — the universal entry point.
     * Types: sparks, blood, dust, smoke, fire, embers, magic, energy, water,
     *        debris, ring, shockwave, flash, muzzle, frost, impact, explosion,
     *        tracer, bolt, swing.
     * Common opts: x, y, z, dx/dy/dz (direction), n, power, speed, spread,
     *              scale, colorA, colorB, alpha, groundY.
     */
    spawn: spawn,
    burst: spawn,          // alias

    /** decal(type, x, z, opts) — pooled, fading ground decals. */
    decal: addDecal,

    /** text(str, x, y, z, opts) — instanced floating text with real depth. */
    text: addText,
    /** damage(value, x, y, z, {crit, friendly}) — the house-style number. */
    damage: damageText,

    /** shake(amount) — emits 'camera:shake', scaled by the player's setting. */
    shake: shake,
    /** hitstop(seconds) — freezes VFX locally and emits 'game:hitstop'. */
    hitstop: hitstop,

    /** trail(opts) → handle with .push(x,y,z) and .free(). Returns null when
     *  the tier budget is spent, so ALWAYS null-check the handle. */
    trail: acquireTrail,

    /** beam(ax,ay,az, bx,by,bz, opts) — additive energy tube with a hot core. */
    beam: fireBeam,
    /** tracer(opts) — straight-line bullet streak. */
    tracer: function (o) { return spawn('tracer', o); },
    /** bolt(opts) — jagged lightning ribbon between two points. */
    bolt: function (o) { return spawn('bolt', o); },

    /** power(type, x, z, opts) — the full telegraph→cast→impact→aftermath show. */
    power: castPower,
    /** Names accepted by power(): meteor, arrows, lightning, firewall, freeze, beam. */
    powerTypes: ['meteor', 'arrows', 'lightning', 'firewall', 'freeze', 'beam'],

    /** addFire(x,y,z,radius,seconds) — registers a burning spot for ambient. */
    addFire: addFire,
    removeFire: removeFire,

    /** arrow(x,y,z, vx,vy,vz, opts) — an instanced arrow that flies and sticks. */
    arrow: spawnArrow,

    setQuality: setQuality,
    getQuality: function () { return qTier; },
    clear: clearAll,
    dispose: dispose,

    /** Driven by Core's render loop; exposed for manual integration. */
    update: update,

    /** Live counters for the perf HUD. One object, reused — poll freely. */
    stats: stats,
    /** Current pause/speed-aware VFX clock, in seconds. */
    time: function () { return vtime; }
  };

  AOW.VFX = VFX;

  /* ==========================================================================
   * 27. LOOP REGISTRATION + AUTO-INIT
   * --------------------------------------------------------------------------
   * Order -5 puts us ahead of Render's own frame hook (order 0), so everything
   * spawned this frame is uploaded before the draw rather than one frame late.
   * ======================================================================== */

  (function bootstrap() {
    try {
      if (Core && typeof Core.registerRender === 'function') {
        Core.registerRender(function (dtReal) { update(dtReal); }, -5);
      } else {
        warnOnce('noloop', 'AOW.Core is absent — driving VFX from our own rAF loop.');
        var last = (global.performance && performance.now) ? performance.now() : Date.now();
        var tick = function () {
          global.requestAnimationFrame(tick);
          var now = (global.performance && performance.now) ? performance.now() : Date.now();
          var dt = (now - last) / 1000;
          last = now;
          update(dt);
        };
        if (typeof global.requestAnimationFrame === 'function') { global.requestAnimationFrame(tick); }
      }
    } catch (e) {
      warnOnce('bootstrap', 'could not register the VFX update hook — call AOW.VFX.update(dt) yourself.', e);
    }

    // Render usually comes up before us; if it does not, latch onto its event.
    try {
      if (Core && typeof Core.on === 'function') {
        Core.on('render:ready', function () { init(); });
      }
    } catch (e2) { /* the update hook retries anyway */ }

    // And take one immediate shot in case Render is already live.
    try { init(); } catch (e3) { /* the update hook retries */ }
  })();

})(typeof window !== 'undefined' ? window : this);
