/* =============================================================================
 * AOW.Forts — src/render/forts.js
 * -----------------------------------------------------------------------------
 * The castles. Two of them, one per team, at both ends of the lane. They are the
 * visual anchors of the whole game, so they are MODELLED, not painted:
 * foundation, curtain walls, crenellations, gatehouse with a working portcullis
 * and drawbridge, flanking towers with roofs, a keep, banners, braziers, wall
 * walkways, arrow slits and stairs — all assembled from one modular kit so five
 * upgrade tiers and eight era styles rebuild from the same parts.
 *
 * Contract compliance:
 *   - three.js r128 UMD (global THREE). No modules, no build step, no network.
 *   - Every texture is generated procedurally on a <canvas>. Zero external assets.
 *   - Attaches exactly ONE global: AOW.Forts.
 *   - Talks to the rest of the game ONLY through AOW.Core.on / AOW.Core.emit.
 *   - Never touches index.html or another module's file.
 *   - Guarded end to end: if anything cannot init we console.warn and no-op.
 *
 * Public API
 *   AOW.Forts.init(opts)
 *   AOW.Forts.build(team, tier, era)        rebuild (animated when upgrading)
 *   AOW.Forts.setDamage(team, frac)         frac 0 = pristine, 1 = wrecked
 *   AOW.Forts.collapse(team)                staged destruction
 *   AOW.Forts.openGate(team, bool)          portcullis + drawbridge + doors
 *   AOW.Forts.getGateWorldPos(team, out)    THREE.Vector3, world space
 *   AOW.Forts.getGarrisonSlots(team)        wall archers / oil / siege anchors
 *
 * Events consumed: render:ready, fort:hit, fort:destroyed, fort:tier,
 *                  era:evolve, game:reset, game:new, render:quality
 * Events emitted:  fort:built, fort:upgrade, fort:gate, fort:collapsed,
 *                  camera:shake, audio:sfx
 * ========================================================================== */

(function (global) {
  'use strict';

  var AOW = global.AOW || (global.AOW = {});
  var THREE = global.THREE;

  /* --------------------------------------------------------------------------
   * 0. Hard guard — no THREE means no forts, but the game must still run.
   * ----------------------------------------------------------------------- */
  if (!THREE || !THREE.BufferGeometry) {
    console.warn('[AOW.Forts] THREE is not available — forts disabled (no-op stub installed).');
    AOW.Forts = {
      version: '1.0.0', ready: false, failed: true,
      init: function () { return false; },
      build: function () { return null; },
      setDamage: function () {},
      collapse: function () {},
      openGate: function () {},
      getGateWorldPos: function (team, out) { return out || { x: 0, y: 0, z: 0 }; },
      getGarrisonSlots: function () { return []; },
      occupySlot: function () { return false; },
      releaseSlot: function () {},
      getFort: function () { return null; },
      getBounds: function () { return null; },
      update: function () {},
      reset: function () {},
      dispose: function () {}
    };
    return;
  }

  var F = {};                      // the module we will publish
  var Core = null;                 // resolved lazily — core.js may load after us
  function core() {
    if (!Core && AOW.Core && AOW.Core.__isAowCore) { Core = AOW.Core; }
    return Core;
  }
  function R() { return AOW.Render || null; }

  var _warned = Object.create(null);
  function warn(key, msg, err) {
    if (_warned[key]) { return; }
    _warned[key] = 1;
    if (err) { console.warn('[AOW.Forts] ' + msg, err); }
    else { console.warn('[AOW.Forts] ' + msg); }
  }

  function busOn(name, fn) {
    var c = core();
    if (c && typeof c.on === 'function') { try { return c.on(name, fn); } catch (e) { /* ignore */ } }
    return function () {};
  }
  function busEmit(name, payload) {
    var c = core();
    if (c && typeof c.emit === 'function') { try { c.emit(name, payload); } catch (e) { /* ignore */ } }
  }

  /* --------------------------------------------------------------------------
   * 1. Constants + world placement
   * ----------------------------------------------------------------------- */
  var FORT_X = AOW.FORT_X || { 1: 20, '-1': 400 };
  var TEAMS = [1, -1];

  /* Local build space: +x points OUTWARD, toward the enemy. +z is one flank.
     The whole fort is then yawed so the camera (which sits at -z looking toward
     +z) sees a three-quarter hero angle instead of a flat profile. A castle seen
     dead-on in profile is the #1 tell of a lazy 2.5D game. */
  var YAW = 0.245;                 // ~14 degrees of turn toward the camera

  var L = {                        // local layout, metres
    frontX: 11.0,                  // outer face of the front curtain wall
    backX: -13.5,                  // outer face of the rear wall
    halfZ: 15.0,                   // half depth (flank to flank)
    wallT: 2.2,                    // curtain wall thickness
    gateHalf: 3.4,                 // half width of the gate opening (in z)
    courtY: 0.45                   // courtyard floor height
  };

  /* Per-tier silhouette. Index 0..4 == tier 1..5. */
  var TIER = [
    { wallH: 5.0,  towerH: 7.0,  towerR: 2.0, keepH: 0.0,  merlon: 0.9, walk: false, roofs: false, keep: false, gatehouse: false, bridge: false, banners: 1, braziers: 0, siege: 0, ring: false },
    { wallH: 7.0,  towerH: 10.0, towerR: 2.5, keepH: 9.0,  merlon: 1.4, walk: true,  roofs: false, keep: true,  gatehouse: true,  bridge: false, banners: 2, braziers: 2, siege: 0, ring: false },
    { wallH: 8.6,  towerH: 13.0, towerR: 2.9, keepH: 13.5, merlon: 1.7, walk: true,  roofs: true,  keep: true,  gatehouse: true,  bridge: true,  banners: 5, braziers: 4, siege: 0, ring: false },
    { wallH: 9.8,  towerH: 15.5, towerR: 3.2, keepH: 16.5, merlon: 1.9, walk: true,  roofs: true,  keep: true,  gatehouse: true,  bridge: true,  banners: 7, braziers: 6, siege: 2, ring: false },
    { wallH: 11.2, towerH: 18.5, towerR: 3.6, keepH: 21.0, merlon: 2.1, walk: true,  roofs: true,  keep: true,  gatehouse: true,  bridge: true,  banners: 9, braziers: 8, siege: 4, ring: true }
  ];

  var TEAM_COLOR = { 1: 0x3f7fd6, '-1': 0xc0392b };
  var TEAM_COLOR2 = { 1: 0xe8eef7, '-1': 0xf0d9b5 };

  /* --------------------------------------------------------------------------
   * 2. Tiny math + scratch (no per-frame allocation past this point)
   * ----------------------------------------------------------------------- */
  var _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  var _q1 = new THREE.Quaternion();
  var _m1 = new THREE.Matrix4();
  var _e1 = new THREE.Euler();
  var _sc1 = new THREE.Vector3(1, 1, 1);
  var _axis = new THREE.Vector3(0, 1, 0);

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function damp(a, b, lambda, dt) { return b + (a - b) * Math.exp(-lambda * dt); }
  function easeOutBack(t) {
    t = clamp01(t); var u = t - 1;
    return 1 + 2.70158 * u * u * u + 1.70158 * u * u;
  }
  function easeOutCubic(t) { t = clamp01(t); var u = 1 - t; return 1 - u * u * u; }
  function easeInQuad(t) { t = clamp01(t); return t * t; }

  /* Deterministic per-fort visual RNG so a rebuild looks identical, and two
     forts do not look like clones of each other. */
  function mulberry(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function detail() {
    var t = 'high';
    try {
      var r = R();
      if (r && r.perf && r.perf.tier) { t = r.perf.tier; }
      else { var c = core(); if (c && c.perf && c.perf.tier) { t = c.perf.tier; } }
    } catch (e) { t = 'high'; }
    return t === 'low' ? 0.45 : (t === 'med' ? 0.72 : 1.0);
  }

  /* --------------------------------------------------------------------------
   * 3. Geometry primitives — every one returns a NON-INDEXED BufferGeometry
   *    carrying position/normal/uv, with UVs already scaled to real-world
   *    texel density so a 12m wall and a 0.6m merlon share the same stone size.
   * ----------------------------------------------------------------------- */
  /* ExtrudeGeometry already comes out non-indexed; calling toNonIndexed() on it
     spams a console warning, so ask first. */
  function nonIdx(g) { return g.index ? g.toNonIndexed() : g; }

  function ensureAttrs(g) {
    try {
      if (!g.attributes.normal) { g.computeVertexNormals(); }
      if (!g.attributes.uv) {
        var n = g.attributes.position.count;
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      }
    } catch (e) { /* ignore */ }
    return g;
  }

  function scaleUV(g, su, sv) {
    var uv = g.attributes && g.attributes.uv;
    if (!uv) { return g; }
    var a = uv.array, i, n = a.length;
    for (i = 0; i < n; i += 2) { a[i] *= su; a[i + 1] *= sv; }
    uv.needsUpdate = true;
    return g;
  }

  /* BoxGeometry (non-indexed, 1 segment) lays its 36 verts out face by face in
     the order +X, -X, +Y, -Y, +Z, -Z. Knowing that lets us give every face its
     own UV scale, which is the whole trick behind consistent stone size. */
  function scaleBoxUV(g, w, h, d, tpm) {
    var uv = g.attributes && g.attributes.uv;
    if (!uv) { return g; }
    var a = uv.array;
    if (a.length < 72) { return scaleUV(g, w * tpm, h * tpm); }
    var faces = [d, h, d, h, w, d, w, d, w, h, w, h];
    var f, i, k;
    for (f = 0; f < 6; f++) {
      var su = faces[f * 2] * tpm, sv = faces[f * 2 + 1] * tpm;
      for (i = 0; i < 6; i++) {
        k = (f * 6 + i) * 2;
        if (k + 1 >= a.length) { break; }
        a[k] *= su; a[k + 1] *= sv;
      }
    }
    uv.needsUpdate = true;
    return g;
  }

  function boxG(w, h, d, tpm) {
    var g = nonIdx(new THREE.BoxGeometry(w, h, d));
    ensureAttrs(g);
    if (tpm) { scaleBoxUV(g, w, h, d, tpm); }
    return g;
  }

  /** Square-section prism / frustum, built from a 4-sided cylinder so three.js
   *  owns the winding and normals (hand-rolled frusta are a classic source of
   *  invisible back-faces). rTop = 0 makes a pyramid. */
  function prismG(wTop, wBot, h, tpm, dScale) {
    var rt = wTop * 0.7071067811865476, rb = wBot * 0.7071067811865476;
    var g = nonIdx(new THREE.CylinderGeometry(rt, rb, h, 4, 1, false));
    g.rotateY(Math.PI * 0.25);
    if (dScale && dScale !== 1) { g.scale(1, 1, dScale); }
    ensureAttrs(g);
    if (tpm) { scaleUV(g, Math.max(wTop, wBot) * 4 * tpm, h * tpm); }
    return g;
  }

  function cylG(rTop, rBot, h, seg, tpm, open) {
    var g = nonIdx(new THREE.CylinderGeometry(rTop, rBot, h, seg || 12, 1, !!open));
    ensureAttrs(g);
    if (tpm) { scaleUV(g, Math.max(rTop, rBot) * 6.2831853 * tpm, h * tpm); }
    return g;
  }

  function coneG(r, h, seg, tpm) { return cylG(0.0001, r, h, seg || 12, tpm, true); }

  function sphereG(r, ws, hs, tpm, phiLen, thetaStart, thetaLen) {
    var g = nonIdx(new THREE.SphereGeometry(r, ws || 16, hs || 10, 0, phiLen === undefined ? 6.2831853 : phiLen,
      thetaStart || 0, thetaLen === undefined ? 3.14159265 : thetaLen));
    ensureAttrs(g);
    if (tpm) { scaleUV(g, r * 6.2831853 * tpm, r * 3.14159 * tpm); }
    return g;
  }

  function latheG(pts, seg, tpm, phiStart) {
    var g = nonIdx(new THREE.LatheGeometry(pts, seg || 8, phiStart === undefined ? Math.PI * 0.25 : phiStart));
    ensureAttrs(g);
    if (tpm) { scaleUV(g, 3 * tpm * 4, 3 * tpm * 4); }
    return g;
  }

  function planeG(w, h, tpm) {
    var g = nonIdx(new THREE.PlaneGeometry(w, h, 1, 1));
    ensureAttrs(g);
    if (tpm) { scaleUV(g, w * tpm, h * tpm); }
    return g;
  }

  function torusG(r, tube, rs, ts, tpm, arc) {
    var g = nonIdx(new THREE.TorusGeometry(r, tube, rs || 6, ts || 16, arc === undefined ? 6.2831853 : arc));
    ensureAttrs(g);
    if (tpm) { scaleUV(g, r * 6.2831853 * tpm, tube * 6.2831853 * tpm); }
    return g;
  }

  /** Extruded 2D profile — the right tool for pediments, arches, torii lintels
   *  and dragon-head silhouettes. Guarded: if Shape/Extrude misbehave we fall
   *  back to a box so the fort never comes out with a hole in it. */
  function extrudeG(pts, depth, tpm, bevel) {
    try {
      var shape = new THREE.Shape();
      shape.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) { shape.lineTo(pts[i][0], pts[i][1]); }
      shape.closePath();
      var g = nonIdx(new THREE.ExtrudeGeometry(shape, {
        depth: depth,
        bevelEnabled: !!bevel,
        bevelThickness: bevel ? 0.06 : 0,
        bevelSize: bevel ? 0.06 : 0,
        bevelSegments: 1,
        curveSegments: 2,
        steps: 1
      }));
      g.translate(0, 0, -depth * 0.5);
      ensureAttrs(g);
      if (tpm) { scaleUV(g, tpm, tpm); }   // Extrude UVs are already in world units
      return g;
    } catch (e) {
      warn('extrude', 'ExtrudeGeometry failed — falling back to a box.', e);
      return boxG(1, 1, depth, tpm);
    }
  }

  /* Merge a pile of prepared geometries into one buffer. three r128's core
     build ships no BufferGeometryUtils, so we do the concat ourselves. Build
     time only — never called from the frame loop. */
  function mergeList(list, outRanges) {
    var i, g, n = 0, ok = [], keep = [];
    for (i = 0; i < list.length; i++) {
      g = list[i];
      if (!g || !g.attributes || !g.attributes.position) { continue; }
      ensureAttrs(g);
      n += g.attributes.position.count;
      ok.push(g);
      keep.push(i);
    }
    if (!n) { return null; }
    var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    var po = 0, no = 0, uo = 0, vStart = 0;
    for (i = 0; i < ok.length; i++) {
      g = ok[i];
      var c = g.attributes.position.count;
      if (outRanges) { outRanges.push({ src: keep[i], start: vStart, count: c }); }
      vStart += c;
      pos.set(g.attributes.position.array, po); po += c * 3;
      if (g.attributes.normal && g.attributes.normal.array.length >= c * 3) {
        nor.set(g.attributes.normal.array.subarray ? g.attributes.normal.array.subarray(0, c * 3) : g.attributes.normal.array, no);
      }
      no += c * 3;
      if (g.attributes.uv && g.attributes.uv.array.length >= c * 2) {
        uv.set(g.attributes.uv.array.subarray ? g.attributes.uv.array.subarray(0, c * 2) : g.attributes.uv.array, uo);
      }
      uo += c * 2;
      try { g.dispose(); } catch (e2) { /* ignore */ }
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    try { out.computeBoundingSphere(); out.computeBoundingBox(); } catch (e3) { /* ignore */ }
    return out;
  }

  /* Place a geometry: build in local fort space, bake the transform in. */
  function place(g, x, y, z, rx, ry, rz, sx, sy, sz) {
    _e1.set(rx || 0, ry || 0, rz || 0, 'XYZ');
    _q1.setFromEuler(_e1);
    _sc1.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
    _v1.set(x || 0, y || 0, z || 0);
    _m1.compose(_v1, _q1, _sc1);
    g.applyMatrix4(_m1);
    return g;
  }

  /* ==========================================================================
   * 4. PROCEDURAL TEXTURES
   * --------------------------------------------------------------------------
   * There are no assets in this project, so every surface is drawn here. Each
   * generator runs twice off the SAME seed — once for colour, once for a
   * grayscale height field used as a bumpMap — so the lighting detail lines up
   * exactly with the painted detail. That pairing is what stops the castle from
   * reading as flat-shaded cardboard.
   * ======================================================================== */

  var TSZ = 256;   // power of two: WebGL1 needs POT for repeat + mipmaps

  function hex(c) {
    c = c | 0;
    return '#' + ('000000' + (c & 0xffffff).toString(16)).slice(-6);
  }
  function shade(c, f) {
    var r = clamp(((c >> 16) & 255) * f, 0, 255) | 0;
    var g = clamp(((c >> 8) & 255) * f, 0, 255) | 0;
    var b = clamp((c & 255) * f, 0, 255) | 0;
    return (r << 16) | (g << 8) | b;
  }
  function mix(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return ((((ar + (br - ar) * t) | 0) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | (((ab + (bb - ab) * t) | 0)));
  }
  function gval(v) { v = clamp(v, 0, 255) | 0; return 'rgb(' + v + ',' + v + ',' + v + ')'; }

  /** Fine speckle — the cheapest way to kill the "plastic" look of flat fills. */
  function speckle(ctx, w, h, rnd, n, amt, mode) {
    var i;
    for (i = 0; i < n; i++) {
      var x = rnd() * w, y = rnd() * h, s = 0.6 + rnd() * 1.9;
      var v = (rnd() - 0.5) * amt;
      ctx.fillStyle = mode === 'bump'
        ? 'rgba(' + (128 + v * 255 | 0) + ',' + (128 + v * 255 | 0) + ',' + (128 + v * 255 | 0) + ',0.5)'
        : 'rgba(' + (v > 0 ? 255 : 0) + ',' + (v > 0 ? 255 : 0) + ',' + (v > 0 ? 255 : 0) + ',' + Math.abs(v) + ')';
      ctx.fillRect(x, y, s, s);
    }
  }

  function grime(ctx, w, h, rnd, mode, strength) {
    var i;
    for (i = 0; i < 26; i++) {
      var x = rnd() * w, y = rnd() * h, r = 8 + rnd() * 46;
      var gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      var a = (0.04 + rnd() * 0.10) * (strength === undefined ? 1 : strength);
      if (mode === 'bump') { gr.addColorStop(0, 'rgba(90,90,90,' + a + ')'); }
      else { gr.addColorStop(0, 'rgba(0,0,0,' + a + ')'); }
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
  }

  /** Moss in the crevices — only in colour mode, only near block bottoms. */
  function moss(ctx, w, h, rnd, tint, amount) {
    var i, n = (18 * amount) | 0;
    for (i = 0; i < n; i++) {
      var x = rnd() * w, y = rnd() * h, r = 4 + rnd() * 16;
      var gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(' + ((tint >> 16) & 255) + ',' + ((tint >> 8) & 255) + ',' + (tint & 255) + ',' + (0.10 + rnd() * 0.22) + ')');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
  }

  /* ---- ashlar / rubble stone ---------------------------------------------- */
  function drawStone(ctx, w, h, mode, o) {
    var rnd = mulberry(o.seed || 7);
    var rows = o.rows || 6, rh = h / rows;
    ctx.fillStyle = mode === 'bump' ? gval(56) : hex(o.mortar);
    ctx.fillRect(0, 0, w, h);

    var r, i;
    for (r = 0; r < rows; r++) {
      var y = r * rh;
      var nb = 3 + ((rnd() * 3) | 0);
      var ws = [], sum = 0;
      for (i = 0; i < nb; i++) { var v = 0.6 + rnd(); ws.push(v); sum += v; }
      var xoff = rnd() * w;
      var x = 0;
      for (i = 0; i < nb; i++) {
        var bw = (ws[i] / sum) * w;
        var bx = (x + xoff) % w;
        drawBlock(ctx, bx, y, bw, rh, rnd, mode, o);
        if (bx + bw > w) { drawBlock(ctx, bx - w, y, bw, rh, rnd, mode, o); }
        x += bw;
      }
    }
    if (mode === 'bump') {
      speckle(ctx, w, h, rnd, 900, 0.30, 'bump');
      grime(ctx, w, h, rnd, 'bump', 0.5);
    } else {
      speckle(ctx, w, h, rnd, 1400, 0.20, 'color');
      moss(ctx, w, h, rnd, o.moss === undefined ? 0x4e6b32 : o.moss, o.mossAmt === undefined ? 1 : o.mossAmt);
      grime(ctx, w, h, rnd, 'color', 1);
    }
  }

  function drawBlock(ctx, x, y, bw, bh, rnd, mode, o) {
    var pad = Math.max(1, bh * 0.055);
    var bx = x + pad, by = y + pad, iw = bw - pad * 2, ih = bh - pad * 2;
    if (iw <= 1 || ih <= 1) { return; }
    var t = rnd();
    var col;
    if (mode === 'bump') { col = gval(170 + ((rnd() - 0.5) * 34) | 0); }
    else { col = hex(mix(o.base, o.base2 === undefined ? shade(o.base, 0.82) : o.base2, t)); }
    ctx.fillStyle = col;
    ctx.beginPath();
    var rr = Math.min(iw, ih) * 0.16;
    roundRect(ctx, bx, by, iw, ih, rr);
    ctx.fill();

    // top-lit bevel: bright top edge, dark bottom edge. Sells depth for free.
    ctx.globalAlpha = mode === 'bump' ? 0.55 : 0.30;
    ctx.fillStyle = mode === 'bump' ? gval(215) : '#ffffff';
    ctx.fillRect(bx + rr * 0.5, by, iw - rr, Math.max(1, ih * 0.10));
    ctx.fillStyle = mode === 'bump' ? gval(105) : '#000000';
    ctx.fillRect(bx + rr * 0.5, by + ih - Math.max(1, ih * 0.12), iw - rr, Math.max(1, ih * 0.12));
    ctx.globalAlpha = 1;

    // chips out of the corners so no two blocks read identical
    if (rnd() < 0.34) {
      ctx.fillStyle = mode === 'bump' ? gval(96) : hex(shade(o.mortar, 1.06));
      var cw = 2 + rnd() * (iw * 0.22), ch = 2 + rnd() * (ih * 0.3);
      var cx = rnd() < 0.5 ? bx : bx + iw - cw;
      var cy = rnd() < 0.5 ? by : by + ih - ch;
      ctx.fillRect(cx, cy, cw, ch);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  }

  /* ---- planks / timber ---------------------------------------------------- */
  function drawWood(ctx, w, h, mode, o) {
    var rnd = mulberry(o.seed || 11);
    var n = o.planks || 6, pw = w / n, i, j;
    ctx.fillStyle = mode === 'bump' ? gval(60) : hex(shade(o.base, 0.55));
    ctx.fillRect(0, 0, w, h);
    for (i = 0; i < n; i++) {
      var x = i * pw + 1.2, iw = pw - 2.4;
      var t = rnd();
      ctx.fillStyle = mode === 'bump' ? gval(168 + ((t - 0.5) * 30) | 0) : hex(mix(o.base, shade(o.base, 0.74), t));
      ctx.fillRect(x, 0, iw, h);
      // grain
      for (j = 0; j < 16; j++) {
        var gy = rnd() * h;
        ctx.strokeStyle = mode === 'bump'
          ? 'rgba(90,90,90,' + (0.10 + rnd() * 0.20) + ')'
          : 'rgba(0,0,0,' + (0.05 + rnd() * 0.13) + ')';
        ctx.lineWidth = 0.7 + rnd() * 1.6;
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.bezierCurveTo(x + iw * 0.3, gy + (rnd() - 0.5) * 7, x + iw * 0.7, gy + (rnd() - 0.5) * 7, x + iw, gy + (rnd() - 0.5) * 5);
        ctx.stroke();
      }
      // knot
      if (rnd() < 0.45) {
        var kx = x + iw * (0.25 + rnd() * 0.5), ky = rnd() * h, kr = 2 + rnd() * 4;
        for (j = 3; j > 0; j--) {
          ctx.strokeStyle = mode === 'bump' ? 'rgba(70,70,70,0.5)' : 'rgba(0,0,0,0.28)';
          ctx.lineWidth = 1.1;
          ctx.beginPath(); ctx.ellipse ? ctx.ellipse(kx, ky, kr * j * 0.42, kr * j * 0.7, 0, 0, 6.2832) : ctx.arc(kx, ky, kr * j * 0.5, 0, 6.2832);
          ctx.stroke();
        }
      }
      // edge shading of the plank
      ctx.globalAlpha = mode === 'bump' ? 0.6 : 0.34;
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + iw - 2, 0, 2, h);
      ctx.fillStyle = mode === 'bump' ? gval(220) : '#ffffff';
      ctx.globalAlpha = mode === 'bump' ? 0.4 : 0.14;
      ctx.fillRect(x, 0, 1.6, h);
      ctx.globalAlpha = 1;
    }
    if (mode !== 'bump') { grime(ctx, w, h, rnd, 'color', 0.8); }
  }

  /* ---- raw logs (palisade / tribal) --------------------------------------- */
  function drawLogs(ctx, w, h, mode, o) {
    var rnd = mulberry(o.seed || 23);
    var n = o.logs || 7, lw = w / n, i;
    ctx.fillStyle = mode === 'bump' ? gval(30) : hex(shade(o.base, 0.35));
    ctx.fillRect(0, 0, w, h);
    for (i = 0; i < n; i++) {
      var x = i * lw;
      var g = ctx.createLinearGradient(x, 0, x + lw, 0);
      var c = mix(o.base, shade(o.base, 0.7), rnd() * 0.6);
      if (mode === 'bump') {
        g.addColorStop(0.0, gval(70)); g.addColorStop(0.32, gval(200));
        g.addColorStop(0.62, gval(176)); g.addColorStop(1.0, gval(66));
      } else {
        g.addColorStop(0.0, hex(shade(c, 0.42))); g.addColorStop(0.34, hex(shade(c, 1.08)));
        g.addColorStop(0.66, hex(c)); g.addColorStop(1.0, hex(shade(c, 0.38)));
      }
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, lw - 0.6, h);
      // bark striations
      var j;
      for (j = 0; j < 22; j++) {
        var sx = x + rnd() * lw, sy = rnd() * h, sl = 10 + rnd() * 60;
        ctx.strokeStyle = mode === 'bump' ? 'rgba(60,60,60,0.35)' : 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 0.7 + rnd();
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (rnd() - 0.5) * 3, sy + sl); ctx.stroke();
      }
    }
    if (mode !== 'bump') { moss(ctx, w, h, rnd, 0x3f5a2a, 1.2); grime(ctx, w, h, rnd, 'color', 1); }
    else { speckle(ctx, w, h, rnd, 700, 0.28, 'bump'); }
  }

  /* ---- marble (greek) ------------------------------------------------------ */
  function drawMarble(ctx, w, h, mode, o) {
    var rnd = mulberry(o.seed || 31);
    ctx.fillStyle = mode === 'bump' ? gval(176) : hex(o.base);
    ctx.fillRect(0, 0, w, h);
    var i, j;
    for (i = 0; i < 16; i++) {
      var y = rnd() * h;
      ctx.strokeStyle = mode === 'bump' ? 'rgba(140,140,140,0.35)' : 'rgba(120,116,104,' + (0.06 + rnd() * 0.14) + ')';
      ctx.lineWidth = 0.6 + rnd() * 2.2;
      ctx.beginPath(); ctx.moveTo(-10, y);
      for (j = 0; j <= 6; j++) {
        ctx.lineTo((j / 6) * (w + 20) - 10, y + (rnd() - 0.5) * 22);
      }
      ctx.stroke();
    }
    // joint lines between drums/blocks
    var rows = o.rows || 4, rh = h / rows;
    ctx.strokeStyle = mode === 'bump' ? gval(96) : 'rgba(70,66,58,0.32)';
    ctx.lineWidth = mode === 'bump' ? 2.4 : 1.4;
    for (i = 1; i < rows; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * rh); ctx.lineTo(w, i * rh); ctx.stroke();
    }
    if (mode === 'bump') { speckle(ctx, w, h, rnd, 500, 0.16, 'bump'); }
    else { speckle(ctx, w, h, rnd, 900, 0.10, 'color'); grime(ctx, w, h, rnd, 'color', 0.55); }
  }

  /* ---- roof tiles (rome / japan) ------------------------------------------- */
  function drawTiles(ctx, w, h, mode, o) {
    var rnd = mulberry(o.seed || 41);
    var rows = o.rows || 7, cols = o.cols || 8;
    var rh = h / rows, cw = w / cols;
    ctx.fillStyle = mode === 'bump' ? gval(50) : hex(shade(o.base, 0.5));
    ctx.fillRect(0, 0, w, h);
    var r, c;
    for (r = 0; r < rows; r++) {
      var y = r * rh;
      var off = (r % 2) ? cw * 0.5 : 0;
      for (c = -1; c <= cols; c++) {
        var x = c * cw + off;
        var t = rnd();
        var col = mode === 'bump' ? gval(150 + ((t - 0.5) * 40) | 0) : hex(mix(o.base, shade(o.base, 0.76), t));
        var g = ctx.createLinearGradient(x, 0, x + cw, 0);
        if (mode === 'bump') {
          g.addColorStop(0, gval(86)); g.addColorStop(0.42, gval(206)); g.addColorStop(1, gval(88));
        } else {
          g.addColorStop(0, hex(shade(mix(o.base, shade(o.base, 0.76), t), 0.6)));
          g.addColorStop(0.42, col);
          g.addColorStop(1, hex(shade(mix(o.base, shade(o.base, 0.76), t), 0.55)));
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        roundRect(ctx, x + 0.6, y + 0.6, cw - 1.2, rh * 1.28, cw * 0.42);
        ctx.fill();
        // shadow under the overlap
        ctx.fillStyle = mode === 'bump' ? 'rgba(30,30,30,0.55)' : 'rgba(0,0,0,0.34)';
        ctx.fillRect(x + 0.6, y, cw - 1.2, Math.max(1, rh * 0.16));
      }
    }
    if (mode !== 'bump') { moss(ctx, w, h, rnd, 0x46603a, 0.7); grime(ctx, w, h, rnd, 'color', 0.9); }
  }

  /* ---- wooden shingles (viking) ------------------------------------------- */
  function drawShingles(ctx, w, h, mode, o) {
    var rnd = mulberry(o.seed || 53);
    var rows = o.rows || 8, cols = o.cols || 7;
    var rh = h / rows, cw = w / cols;
    ctx.fillStyle = mode === 'bump' ? gval(46) : hex(shade(o.base, 0.42));
    ctx.fillRect(0, 0, w, h);
    var r, c;
    for (r = 0; r < rows; r++) {
      var y = r * rh, off = (r % 2) ? cw * 0.5 : 0;
      for (c = -1; c <= cols; c++) {
        var x = c * cw + off, t = rnd();
        ctx.fillStyle = mode === 'bump' ? gval(150 + ((t - 0.5) * 44) | 0) : hex(mix(o.base, shade(o.base, 0.66), t));
        ctx.beginPath();
        roundRect(ctx, x + 0.8, y + 0.8, cw - 1.6, rh * 1.4, cw * 0.18);
        ctx.fill();
        ctx.fillStyle = mode === 'bump' ? 'rgba(24,24,24,0.6)' : 'rgba(0,0,0,0.38)';
        ctx.fillRect(x + 0.8, y, cw - 1.6, Math.max(1, rh * 0.2));
        var j;
        for (j = 0; j < 4; j++) {
          ctx.strokeStyle = mode === 'bump' ? 'rgba(70,70,70,0.4)' : 'rgba(0,0,0,0.2)';
          ctx.lineWidth = 0.7;
          var gx = x + 2 + rnd() * (cw - 4);
          ctx.beginPath(); ctx.moveTo(gx, y + 1); ctx.lineTo(gx + (rnd() - 0.5) * 2, y + rh * 1.3); ctx.stroke();
        }
      }
    }
    if (mode !== 'bump') { moss(ctx, w, h, rnd, 0x3d5228, 1.0); }
  }

  /* ---- thatch (tribal) ----------------------------------------------------- */
  function drawThatch(ctx, w, h, mode, o) {
    var rnd = mulberry(o.seed || 61);
    ctx.fillStyle = mode === 'bump' ? gval(90) : hex(shade(o.base, 0.6));
    ctx.fillRect(0, 0, w, h);
    var i;
    for (i = 0; i < 1600; i++) {
      var x = rnd() * w, y = rnd() * h, len = 6 + rnd() * 20;
      var t = rnd();
      ctx.strokeStyle = mode === 'bump' ? gval(110 + (t * 120) | 0) : hex(mix(o.base, shade(o.base, 1.25), t));
      ctx.lineWidth = 0.7 + rnd() * 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 5, y + len); ctx.stroke();
    }
    // banding where the bundles are tied
    var rows = 5;
    for (i = 1; i < rows; i++) {
      ctx.fillStyle = mode === 'bump' ? 'rgba(40,40,40,0.5)' : 'rgba(0,0,0,0.24)';
      ctx.fillRect(0, (i / rows) * h - 2, w, 4);
    }
    if (mode !== 'bump') { grime(ctx, w, h, rnd, 'color', 1); }
  }

  /* ---- white plaster + timber framing (japan) ------------------------------ */
  function drawPlaster(ctx, w, h, mode, o) {
    var rnd = mulberry(o.seed || 71);
    ctx.fillStyle = mode === 'bump' ? gval(178) : hex(o.base);
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rnd, mode === 'bump' ? 1400 : 2000, mode === 'bump' ? 0.10 : 0.07, mode);
    var i;
    // hairline crazing
    for (i = 0; i < 26; i++) {
      var x = rnd() * w, y = rnd() * h;
      ctx.strokeStyle = mode === 'bump' ? 'rgba(120,120,120,0.4)' : 'rgba(120,112,100,0.20)';
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(x, y);
      var j;
      for (j = 0; j < 4; j++) { x += (rnd() - 0.5) * 26; y += (rnd() - 0.5) * 26; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // dark timber frame band
    if (o.frame) {
      ctx.fillStyle = mode === 'bump' ? gval(120) : hex(o.frame);
      ctx.fillRect(0, 0, w, h * 0.09);
      ctx.fillRect(0, h * 0.91, w, h * 0.09);
      ctx.fillRect(0, 0, w * 0.055, h);
      ctx.fillRect(w * 0.945, 0, w * 0.055, h);
      ctx.fillRect(w * 0.47, 0, w * 0.06, h);
    }
    if (mode !== 'bump') { grime(ctx, w, h, rnd, 'color', 0.7); }
  }

  /* ---- brick (industrial) --------------------------------------------------- */
  function drawBrick(ctx, w, h, mode, o) {
    var rnd = mulberry(o.seed || 83);
    var rows = 12, rh = h / rows, cols = 6, cw = w / cols;
    ctx.fillStyle = mode === 'bump' ? gval(58) : hex(o.mortar);
    ctx.fillRect(0, 0, w, h);
    var r, c;
    for (r = 0; r < rows; r++) {
      var y = r * rh, off = (r % 2) ? cw * 0.5 : 0;
      for (c = -1; c <= cols; c++) {
        var x = c * cw + off, t = rnd();
        ctx.fillStyle = mode === 'bump' ? gval(165 + ((t - 0.5) * 26) | 0) : hex(mix(o.base, shade(o.base, 0.7), t));
        ctx.fillRect(x + 1, y + 1, cw - 2, rh - 2);
        ctx.globalAlpha = mode === 'bump' ? 0.5 : 0.22;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 1, y + 1, cw - 2, Math.max(1, rh * 0.14));
        ctx.fillStyle = '#000000';
        ctx.fillRect(x + 1, y + rh - Math.max(1, rh * 0.2), cw - 2, Math.max(1, rh * 0.18));
        ctx.globalAlpha = 1;
      }
    }
    if (mode !== 'bump') { grime(ctx, w, h, rnd, 'color', 1.4); moss(ctx, w, h, rnd, 0x4a4a30, 0.5); }
    else { speckle(ctx, w, h, rnd, 700, 0.2, 'bump'); }
  }

  /* ---- worn riveted metal (industrial / modern / future) -------------------- */
  function drawMetal(ctx, w, h, mode, o) {
    var rnd = mulberry(o.seed || 97);
    var cols = o.panels || 3, rows = o.panelRows || 3;
    var cw = w / cols, rh = h / rows;
    ctx.fillStyle = mode === 'bump' ? gval(150) : hex(o.base);
    ctx.fillRect(0, 0, w, h);
    var r, c, i;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        var x = c * cw, y = r * rh, t = rnd();
        ctx.fillStyle = mode === 'bump' ? gval(158 + ((t - 0.5) * 18) | 0) : hex(mix(o.base, shade(o.base, 0.86), t));
        ctx.fillRect(x + 1.5, y + 1.5, cw - 3, rh - 3);
        // seam
        ctx.fillStyle = mode === 'bump' ? gval(88) : hex(shade(o.base, 0.55));
        ctx.fillRect(x, y, cw, 1.8);
        ctx.fillRect(x, y, 1.8, rh);
        // rivets along the seam
        var nr = 6;
        for (i = 0; i < nr; i++) {
          var rx = x + 4 + (i / (nr - 1)) * (cw - 8), ry = y + 4.5;
          ctx.fillStyle = mode === 'bump' ? gval(226) : hex(shade(o.base, 1.22));
          ctx.beginPath(); ctx.arc(rx, ry, 1.9, 0, 6.2832); ctx.fill();
          ctx.fillStyle = mode === 'bump' ? gval(96) : 'rgba(0,0,0,0.35)';
          ctx.beginPath(); ctx.arc(rx, ry + 1.1, 1.5, 0, 3.1416); ctx.fill();
          var rx2 = x + 4.5, ry2 = y + 5 + (i / (nr - 1)) * (rh - 9);
          ctx.fillStyle = mode === 'bump' ? gval(226) : hex(shade(o.base, 1.22));
          ctx.beginPath(); ctx.arc(rx2, ry2, 1.9, 0, 6.2832); ctx.fill();
        }
      }
    }
    // brushed scratches
    for (i = 0; i < 220; i++) {
      var sx = rnd() * w, sy = rnd() * h;
      ctx.strokeStyle = mode === 'bump' ? 'rgba(190,190,190,0.16)' : 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 6 + rnd() * 40, sy + (rnd() - 0.5) * 3); ctx.stroke();
    }
    if (mode !== 'bump' && o.rust) {
      for (i = 0; i < 16; i++) {
        var ux = rnd() * w, uy = rnd() * h, ur = 6 + rnd() * 26;
        var g2 = ctx.createRadialGradient(ux, uy, 0, ux, uy, ur);
        g2.addColorStop(0, 'rgba(' + ((o.rust >> 16) & 255) + ',' + ((o.rust >> 8) & 255) + ',' + (o.rust & 255) + ',0.5)');
        g2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(ux, uy, ur, 0, 6.2832); ctx.fill();
      }
    }
    if (mode !== 'bump') { grime(ctx, w, h, rnd, 'color', 0.7); }
  }

  /* ---- poured concrete (rome / modern) -------------------------------------- */
  function drawConcrete(ctx, w, h, mode, o) {
    var rnd = mulberry(o.seed || 103);
    ctx.fillStyle = mode === 'bump' ? gval(168) : hex(o.base);
    ctx.fillRect(0, 0, w, h);
    var i;
    for (i = 0; i < 40; i++) {
      var x = rnd() * w, y = rnd() * h, r = 10 + rnd() * 50;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      var v = rnd() < 0.5 ? 1 : -1;
      g.addColorStop(0, mode === 'bump'
        ? 'rgba(' + (168 + v * 22) + ',' + (168 + v * 22) + ',' + (168 + v * 22) + ',0.5)'
        : 'rgba(' + (v > 0 ? 255 : 0) + ',' + (v > 0 ? 255 : 0) + ',' + (v > 0 ? 255 : 0) + ',0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    // form-board joints + tie holes
    ctx.fillStyle = mode === 'bump' ? gval(112) : 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, h * 0.33 - 1, w, 2);
    ctx.fillRect(0, h * 0.66 - 1, w, 2);
    for (i = 0; i < 6; i++) {
      var tx = ((i % 3) + 0.5) * (w / 3), ty = ((i / 3) | 0) * (h * 0.33) + h * 0.16;
      ctx.fillStyle = mode === 'bump' ? gval(76) : 'rgba(0,0,0,0.30)';
      ctx.beginPath(); ctx.arc(tx, ty, 2.6, 0, 6.2832); ctx.fill();
    }
    speckle(ctx, w, h, rnd, mode === 'bump' ? 900 : 1500, 0.14, mode);
    if (mode !== 'bump') { grime(ctx, w, h, rnd, 'color', 1.1); moss(ctx, w, h, rnd, 0x475238, 0.6); }
  }

  /* ---- glowing hex membrane (future energy shield) -------------------------- */
  function drawEnergy(ctx, w, h, mode, o) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    var c = o.base;
    var cols = 8, rows = 9;
    var cw = w / cols, rh = h / rows, r, cc;
    ctx.lineWidth = 1.6;
    for (r = 0; r < rows; r++) {
      for (cc = 0; cc < cols; cc++) {
        var x = cc * cw + ((r % 2) ? cw * 0.5 : 0), y = r * rh;
        ctx.strokeStyle = 'rgba(' + ((c >> 16) & 255) + ',' + ((c >> 8) & 255) + ',' + (c & 255) + ',0.55)';
        ctx.beginPath();
        var k;
        for (k = 0; k < 6; k++) {
          var a = (k / 6) * 6.2832 + 0.5236;
          var px = x + cw * 0.48 * Math.cos(a), py = y + rh * 0.5 * Math.sin(a);
          if (k === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
        }
        ctx.closePath(); ctx.stroke();
      }
    }
    // energy ripples
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(' + ((c >> 16) & 255) + ',' + ((c >> 8) & 255) + ',' + (c & 255) + ',0.22)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(' + ((c >> 16) & 255) + ',' + ((c >> 8) & 255) + ',' + (c & 255) + ',0.28)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  /* ---- damage decal: branching cracks on transparent ----------------------- */
  function drawCracks(ctx, w, h, seed) {
    var rnd = mulberry(seed || 5);
    ctx.clearRect(0, 0, w, h);
    var i, j, k;
    // four independent crack clusters, one per UV quadrant, so a single texture
    // gives four distinct-looking decals just by offsetting UVs.
    for (k = 0; k < 4; k++) {
      var ox = (k % 2) * (w * 0.5), oy = ((k / 2) | 0) * (h * 0.5);
      var cx = ox + w * 0.25, cy = oy + h * 0.25;
      var branches = 5 + ((rnd() * 4) | 0);
      for (i = 0; i < branches; i++) {
        var a = rnd() * 6.2832;
        var x = cx + (rnd() - 0.5) * w * 0.18, y = cy + (rnd() - 0.5) * h * 0.18;
        var segs = 5 + ((rnd() * 6) | 0);
        var wdt = 2.6 + rnd() * 2.4;
        ctx.strokeStyle = 'rgba(10,8,6,0.92)';
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y);
        for (j = 0; j < segs; j++) {
          a += (rnd() - 0.5) * 0.9;
          var len = 5 + rnd() * 13;
          x += Math.cos(a) * len; y += Math.sin(a) * len;
          ctx.lineWidth = Math.max(0.5, wdt * (1 - j / segs));
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, y);
          // spur
          if (rnd() < 0.35) {
            var sa = a + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.7);
            var sl = 4 + rnd() * 10;
            ctx.lineWidth = Math.max(0.4, wdt * 0.4);
            ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(sa) * sl, y + Math.sin(sa) * sl); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x, y);
          }
        }
        ctx.stroke();
      }
      // spall — a shallow chipped-out patch
      for (i = 0; i < 2; i++) {
        var px = ox + w * 0.12 + rnd() * w * 0.26, py = oy + h * 0.12 + rnd() * h * 0.26;
        var pr = 5 + rnd() * 11;
        var g = ctx.createRadialGradient(px, py, 0, px, py, pr);
        g.addColorStop(0, 'rgba(20,16,12,0.75)');
        g.addColorStop(0.7, 'rgba(30,26,20,0.35)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, pr, 0, 6.2832); ctx.fill();
      }
    }
  }

  /* ---- banner cloth -------------------------------------------------------- */
  function drawBanner(ctx, w, h, o) {
    var rnd = mulberry(o.seed || 13);
    var base = o.color, trim = o.trim;
    ctx.fillStyle = hex(base);
    ctx.fillRect(0, 0, w, h);

    // vertical fold shading — a flat colour rectangle reads as paper
    var i;
    for (i = 0; i < 7; i++) {
      var x = (i / 7) * w;
      var g = ctx.createLinearGradient(x, 0, x + w / 7, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.26)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0.24)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, w / 7 + 1, h);
    }
    // border
    ctx.strokeStyle = hex(trim);
    ctx.lineWidth = Math.max(3, w * 0.045);
    ctx.strokeRect(w * 0.06, h * 0.05, w * 0.88, h * 0.90);

    // heraldic device
    ctx.save();
    ctx.translate(w * 0.5, h * 0.42);
    var s = w * 0.30;
    ctx.fillStyle = hex(trim);
    if (o.sigil === 'skull') {
      ctx.beginPath(); ctx.arc(0, -s * 0.12, s * 0.62, 0, 6.2832); ctx.fill();
      ctx.fillRect(-s * 0.42, s * 0.3, s * 0.84, s * 0.42);
      ctx.fillStyle = hex(base);
      ctx.beginPath(); ctx.arc(-s * 0.26, -s * 0.16, s * 0.19, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.26, -s * 0.16, s * 0.19, 0, 6.2832); ctx.fill();
    } else if (o.sigil === 'eagle') {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.7); ctx.lineTo(s * 0.95, -s * 0.1); ctx.lineTo(s * 0.35, 0);
      ctx.lineTo(s * 0.5, s * 0.75); ctx.lineTo(0, s * 0.3); ctx.lineTo(-s * 0.5, s * 0.75);
      ctx.lineTo(-s * 0.35, 0); ctx.lineTo(-s * 0.95, -s * 0.1);
      ctx.closePath(); ctx.fill();
    } else if (o.sigil === 'circuit') {
      ctx.lineWidth = Math.max(2, s * 0.13);
      ctx.strokeStyle = hex(trim);
      ctx.beginPath(); ctx.arc(0, 0, s * 0.62, 0, 6.2832); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s * 0.62, 0); ctx.moveTo(s * 0.62, 0); ctx.lineTo(s, 0);
      ctx.moveTo(0, -s); ctx.lineTo(0, -s * 0.62); ctx.moveTo(0, s * 0.62); ctx.lineTo(0, s);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.24, 0, 6.2832); ctx.fill();
    } else if (o.sigil === 'sun') {
      ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, 6.2832); ctx.fill();
      for (i = 0; i < 12; i++) {
        var a = (i / 12) * 6.2832;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * s * 0.52, Math.sin(a) * s * 0.52);
        ctx.lineTo(Math.cos(a + 0.13) * s * 0.95, Math.sin(a + 0.13) * s * 0.95);
        ctx.lineTo(Math.cos(a - 0.13) * s * 0.95, Math.sin(a - 0.13) * s * 0.95);
        ctx.closePath(); ctx.fill();
      }
    } else {
      // lion rampant, heavily stylised — reads at castle scale
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, s * 0.85); ctx.lineTo(-s * 0.34, s * 0.1);
      ctx.lineTo(-s * 0.6, -s * 0.2); ctx.lineTo(-s * 0.36, -s * 0.28);
      ctx.lineTo(-s * 0.42, -s * 0.72); ctx.lineTo(-s * 0.06, -s * 0.44);
      ctx.lineTo(s * 0.28, -s * 0.62); ctx.lineTo(s * 0.2, -s * 0.22);
      ctx.lineTo(s * 0.62, s * 0.06); ctx.lineTo(s * 0.3, s * 0.2);
      ctx.lineTo(s * 0.36, s * 0.85);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // frayed lower edge + weathering
    ctx.globalCompositeOperation = 'destination-out';
    for (i = 0; i < 26; i++) {
      var fx = rnd() * w, fw = 3 + rnd() * 10, fh = 2 + rnd() * (h * 0.06);
      ctx.fillStyle = '#000';
      ctx.fillRect(fx, h - fh, fw, fh);
    }
    ctx.globalCompositeOperation = 'source-over';
    grime(ctx, w, h, rnd, 'color', 0.7);
  }

  /** Progressive tear masks used as alphaMap when the fort takes real damage. */
  function drawTear(ctx, w, h, level) {
    var rnd = mulberry(400 + level * 37);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#000000';
    var i, j;
    var rips = level * 3;
    for (i = 0; i < rips; i++) {
      var x = rnd() * w, y = h * (0.25 + rnd() * 0.7);
      ctx.beginPath(); ctx.moveTo(x, h + 6);
      var cx = x, cy = h;
      for (j = 0; j < 5; j++) {
        cx += (rnd() - 0.5) * 22; cy -= (h - y) / 5;
        ctx.lineTo(cx, cy);
      }
      ctx.lineTo(cx + 12 + rnd() * 26, h + 6);
      ctx.closePath(); ctx.fill();
    }
    // shot holes
    for (i = 0; i < level * 4; i++) {
      var hx = rnd() * w, hy = h * (0.15 + rnd() * 0.8), hr = 3 + rnd() * 9;
      ctx.beginPath(); ctx.arc(hx, hy, hr, 0, 6.2832); ctx.fill();
    }
  }

  /* ---- viking shield face --------------------------------------------------- */
  function drawShield(ctx, w, h, o) {
    var rnd = mulberry(o.seed || 17);
    ctx.clearRect(0, 0, w, h);
    var cx = w * 0.5, cy = h * 0.5, r = Math.min(w, h) * 0.47;
    ctx.fillStyle = hex(o.color);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    // painted quarters
    ctx.fillStyle = hex(o.trim);
    var i;
    for (i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, i * 1.5708, i * 1.5708 + 0.7854);
      ctx.closePath(); ctx.fill();
    }
    // plank lines
    ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = 1.6;
    for (i = 1; i < 5; i++) {
      var y = cy - r + (i / 5) * r * 2;
      ctx.beginPath(); ctx.moveTo(cx - r, y); ctx.lineTo(cx + r, y); ctx.stroke();
    }
    // iron rim
    ctx.strokeStyle = hex(0x50555c); ctx.lineWidth = Math.max(3, r * 0.10);
    ctx.beginPath(); ctx.arc(cx, cy, r - r * 0.05, 0, 6.2832); ctx.stroke();
    // boss
    var g = ctx.createRadialGradient(cx - r * 0.06, cy - r * 0.08, 0, cx, cy, r * 0.26);
    g.addColorStop(0, '#c9ced6'); g.addColorStop(0.6, '#767d86'); g.addColorStop(1, '#3c4147');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.24, 0, 6.2832); ctx.fill();
    for (i = 0; i < 8; i++) {
      var a = (i / 8) * 6.2832;
      ctx.fillStyle = '#9aa2ab';
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82, r * 0.05, 0, 6.2832); ctx.fill();
    }
    grime(ctx, w, h, rnd, 'color', 0.6);
  }

  /* ---- soft round particle sprite ------------------------------------------ */
  function drawSoftDot(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    var g = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.5);
    g.addColorStop(0.0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.72)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.20)');
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, w * 0.5, 0, 6.2832); ctx.fill();
  }

  /* ---- puffy smoke sprite --------------------------------------------------- */
  function drawPuff(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    var rnd = mulberry(909);
    var i;
    for (i = 0; i < 14; i++) {
      var a = rnd() * 6.2832, d = rnd() * w * 0.22;
      var x = w * 0.5 + Math.cos(a) * d, y = h * 0.5 + Math.sin(a) * d;
      var r = w * (0.16 + rnd() * 0.16);
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.42)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
  }

  /* ---- texture cache wrapper ------------------------------------------------ */
  function mkTex(key, w, h, draw, opts) {
    var r = R();
    if (r && typeof r.makeCanvasTexture === 'function') {
      var t = r.makeCanvasTexture(w, h, draw, opts || { key: key });
      if (t) { return t; }
    }
    // Fallback: renderer not up yet (or failed) — roll our own.
    try {
      if (_localTex[key]) { return _localTex[key]; }
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d');
      if (!ctx) { return null; }
      draw(ctx, w, h, cv);
      var tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.encoding = (opts && opts.linear) ? THREE.LinearEncoding : THREE.sRGBEncoding;
      tex.needsUpdate = true;
      tex.name = key;
      _localTex[key] = tex;
      return tex;
    } catch (e) {
      warn('tex:' + key, 'texture "' + key + '" could not be created', e);
      return null;
    }
  }
  var _localTex = Object.create(null);

  function pairTex(key, drawer, o) {
    var col = mkTex('fort.' + key, TSZ, TSZ, function (c, w, h) { drawer(c, w, h, 'color', o); }, { key: 'fort.' + key });
    var bmp = mkTex('fort.' + key + '.b', TSZ, TSZ, function (c, w, h) { drawer(c, w, h, 'bump', o); }, { key: 'fort.' + key + '.b', linear: true });
    return { map: col, bump: bmp };
  }

  /* ==========================================================================
   * 5. ERA STYLES
   * --------------------------------------------------------------------------
   * Each style has to be recognisable in pure silhouette, so it changes three
   * things at once: the material set, the shape vocabulary (tower profile,
   * roof profile, parapet type) and a signature prop that nothing else has.
   * ======================================================================== */

  var STYLES = {

    tribal: {
      label: 'tribal',
      tower: 'log', roof: 'cone', parapet: 'spike', keepShape: 'hut',
      batter: 0.0, gateArch: 'flat', sign: 'totem',
      wall: { d: drawLogs, o: { base: 0x6d5334, logs: 7, seed: 3 }, rough: 0.95, metal: 0.0, tpm: 0.30, bump: 0.55 },
      wall2: { d: drawWood, o: { base: 0x5a4229, planks: 5, seed: 5 }, rough: 0.96, metal: 0.0, tpm: 0.34, bump: 0.45 },
      roofM: { d: drawThatch, o: { base: 0xb99a5e, seed: 9 }, rough: 0.99, metal: 0.0, tpm: 0.42, bump: 0.5 },
      trim: { d: drawWood, o: { base: 0x8a6b45, planks: 3, seed: 15 }, rough: 0.9, metal: 0.03, tpm: 0.5, bump: 0.4 },
      metalM: { d: drawMetal, o: { base: 0x6f6a5c, rust: 0x7a4a24, panels: 2, panelRows: 2, seed: 21 }, rough: 0.72, metal: 0.5, tpm: 0.7, bump: 0.35 },
      pal: { accent: 0xa8442c, accent2: 0xd8c9a8, glow: 0xff8b3d, dark: 0x241a10, ground: 0x5d4a33 }
    },

    greek: {
      label: 'greek',
      tower: 'square', roof: 'pediment', parapet: 'cornice', keepShape: 'temple',
      batter: 0.0, gateArch: 'post', sign: 'column',
      wall: { d: drawMarble, o: { base: 0xe6e0d1, rows: 4, seed: 33 }, rough: 0.55, metal: 0.02, tpm: 0.26, bump: 0.22 },
      wall2: { d: drawStone, o: { base: 0xd6cfbe, base2: 0xbdb5a2, mortar: 0x9a9384, rows: 5, moss: 0x5c6b3a, mossAmt: 0.4, seed: 35 }, rough: 0.8, metal: 0.02, tpm: 0.3, bump: 0.35 },
      roofM: { d: drawTiles, o: { base: 0xb1533a, rows: 7, cols: 8, seed: 37 }, rough: 0.78, metal: 0.02, tpm: 0.5, bump: 0.45 },
      trim: { d: drawMarble, o: { base: 0xf3efe4, rows: 2, seed: 39 }, rough: 0.42, metal: 0.03, tpm: 0.42, bump: 0.18 },
      metalM: { d: drawMetal, o: { base: 0xc9a227, panels: 2, panelRows: 2, seed: 41 }, rough: 0.35, metal: 0.88, tpm: 0.6, bump: 0.25 },
      pal: { accent: 0x2f5d8a, accent2: 0xc9a227, glow: 0xffb347, dark: 0x2a2822, ground: 0xbfb49b }
    },

    rome: {
      label: 'rome',
      tower: 'square', roof: 'hip', parapet: 'merlon', keepShape: 'basilica',
      batter: 0.04, gateArch: 'arch', sign: 'standard',
      wall: { d: drawConcrete, o: { base: 0xd2c5ac, seed: 43 }, rough: 0.86, metal: 0.02, tpm: 0.28, bump: 0.36 },
      wall2: { d: drawBrick, o: { base: 0x9d4b35, mortar: 0xcbbfa6, seed: 45 }, rough: 0.9, metal: 0.02, tpm: 0.4, bump: 0.42 },
      roofM: { d: drawTiles, o: { base: 0xa8452e, rows: 7, cols: 8, seed: 47 }, rough: 0.76, metal: 0.02, tpm: 0.48, bump: 0.48 },
      trim: { d: drawStone, o: { base: 0xe4dac2, base2: 0xcabfa4, mortar: 0xa39781, rows: 3, moss: 0x5c6b3a, mossAmt: 0.3, seed: 49 }, rough: 0.7, metal: 0.02, tpm: 0.44, bump: 0.3 },
      metalM: { d: drawMetal, o: { base: 0xd4af37, panels: 2, panelRows: 2, seed: 51 }, rough: 0.32, metal: 0.9, tpm: 0.6, bump: 0.25 },
      pal: { accent: 0x8f2b22, accent2: 0xd4af37, glow: 0xffa63d, dark: 0x2b241c, ground: 0xa79a80 }
    },

    viking: {
      label: 'viking',
      tower: 'square', roof: 'steep', parapet: 'palisade', keepShape: 'longhouse',
      batter: 0.05, gateArch: 'post', sign: 'shields',
      wall: { d: drawWood, o: { base: 0x4a3826, planks: 6, seed: 53 }, rough: 0.94, metal: 0.0, tpm: 0.3, bump: 0.5 },
      wall2: { d: drawStone, o: { base: 0x77746c, base2: 0x5d5a53, mortar: 0x4a4740, rows: 5, moss: 0x3f5a2a, mossAmt: 1.5, seed: 55 }, rough: 0.92, metal: 0.02, tpm: 0.3, bump: 0.45 },
      roofM: { d: drawShingles, o: { base: 0x3a2f24, rows: 8, cols: 7, seed: 57 }, rough: 0.93, metal: 0.0, tpm: 0.55, bump: 0.5 },
      trim: { d: drawWood, o: { base: 0x6b5237, planks: 3, seed: 59 }, rough: 0.9, metal: 0.02, tpm: 0.5, bump: 0.42 },
      metalM: { d: drawMetal, o: { base: 0x6d7278, rust: 0x8a5028, panels: 2, panelRows: 2, seed: 61 }, rough: 0.62, metal: 0.75, tpm: 0.65, bump: 0.4 },
      pal: { accent: 0x8c2f24, accent2: 0xe3ddcd, glow: 0xff7a2a, dark: 0x1d160f, ground: 0x4f4535 }
    },

    japan: {
      label: 'japan',
      tower: 'yagura', roof: 'pagoda', parapet: 'plaster', keepShape: 'tenshu',
      batter: 0.30, gateArch: 'post', sign: 'torii',
      wall: { d: drawPlaster, o: { base: 0xf0ece1, frame: 0x2f271f, seed: 63 }, rough: 0.82, metal: 0.01, tpm: 0.24, bump: 0.22 },
      wall2: { d: drawStone, o: { base: 0x8f887a, base2: 0x736c60, mortar: 0x565045, rows: 4, moss: 0x4a6030, mossAmt: 1.1, seed: 65 }, rough: 0.9, metal: 0.02, tpm: 0.24, bump: 0.5 },
      roofM: { d: drawTiles, o: { base: 0x3f4a52, rows: 7, cols: 8, seed: 67 }, rough: 0.6, metal: 0.06, tpm: 0.52, bump: 0.45 },
      trim: { d: drawWood, o: { base: 0x33291f, planks: 3, seed: 69 }, rough: 0.85, metal: 0.02, tpm: 0.5, bump: 0.35 },
      metalM: { d: drawMetal, o: { base: 0xd9b038, panels: 2, panelRows: 2, seed: 71 }, rough: 0.3, metal: 0.92, tpm: 0.6, bump: 0.22 },
      pal: { accent: 0xb3321f, accent2: 0xd9b038, glow: 0xffb060, dark: 0x241d16, ground: 0x847b68 }
    },

    industrial: {
      label: 'industrial',
      tower: 'square', roof: 'flatIron', parapet: 'plate', keepShape: 'factory',
      batter: 0.02, gateArch: 'arch', sign: 'stack',
      wall: { d: drawBrick, o: { base: 0x7a3f30, mortar: 0x9d968a, seed: 73 }, rough: 0.9, metal: 0.02, tpm: 0.3, bump: 0.42 },
      wall2: { d: drawMetal, o: { base: 0x4a4f55, rust: 0x8a5a2a, panels: 3, panelRows: 3, seed: 75 }, rough: 0.66, metal: 0.72, tpm: 0.4, bump: 0.4 },
      roofM: { d: drawMetal, o: { base: 0x555b60, rust: 0x7a4a24, panels: 4, panelRows: 2, seed: 77 }, rough: 0.7, metal: 0.7, tpm: 0.55, bump: 0.42 },
      trim: { d: drawMetal, o: { base: 0x3d4249, rust: 0x8a5a2a, panels: 2, panelRows: 2, seed: 79 }, rough: 0.62, metal: 0.8, tpm: 0.6, bump: 0.4 },
      metalM: { d: drawMetal, o: { base: 0x8e949b, rust: 0x9a5a28, panels: 2, panelRows: 2, seed: 81 }, rough: 0.5, metal: 0.88, tpm: 0.6, bump: 0.35 },
      pal: { accent: 0xc06a1e, accent2: 0xd8d2c4, glow: 0xff9a2e, dark: 0x191b1e, ground: 0x5a544a }
    },

    modern: {
      label: 'modern',
      tower: 'square', roof: 'flat', parapet: 'sandbag', keepShape: 'bunker',
      batter: 0.06, gateArch: 'flat', sign: 'radar',
      wall: { d: drawConcrete, o: { base: 0x9a9a92, seed: 83 }, rough: 0.9, metal: 0.02, tpm: 0.26, bump: 0.34 },
      wall2: { d: drawMetal, o: { base: 0x5b6157, panels: 3, panelRows: 3, seed: 85 }, rough: 0.72, metal: 0.6, tpm: 0.4, bump: 0.35 },
      roofM: { d: drawConcrete, o: { base: 0x86867e, seed: 87 }, rough: 0.92, metal: 0.02, tpm: 0.4, bump: 0.34 },
      trim: { d: drawMetal, o: { base: 0x4a5540, panels: 2, panelRows: 2, seed: 89 }, rough: 0.74, metal: 0.4, tpm: 0.55, bump: 0.32 },
      metalM: { d: drawMetal, o: { base: 0x6a7076, panels: 2, panelRows: 2, seed: 91 }, rough: 0.52, metal: 0.86, tpm: 0.6, bump: 0.32 },
      pal: { accent: 0x4a5540, accent2: 0xb0a078, glow: 0xffd24a, dark: 0x1c1e1c, ground: 0x6e6a5c }
    },

    future: {
      label: 'future',
      tower: 'pylon', roof: 'blade', parapet: 'lume', keepShape: 'monolith',
      batter: 0.10, gateArch: 'flat', sign: 'shield',
      wall: { d: drawMetal, o: { base: 0xb3bcc6, panels: 3, panelRows: 3, seed: 93 }, rough: 0.34, metal: 0.85, tpm: 0.24, bump: 0.28 },
      wall2: { d: drawMetal, o: { base: 0x2b3138, panels: 2, panelRows: 4, seed: 95 }, rough: 0.28, metal: 0.9, tpm: 0.34, bump: 0.3 },
      roofM: { d: drawMetal, o: { base: 0x6d7b88, panels: 3, panelRows: 2, seed: 97 }, rough: 0.3, metal: 0.9, tpm: 0.45, bump: 0.28 },
      trim: { d: drawMetal, o: { base: 0x8d99a6, panels: 2, panelRows: 2, seed: 99 }, rough: 0.22, metal: 0.95, tpm: 0.55, bump: 0.22 },
      metalM: { d: drawMetal, o: { base: 0xd7dee6, panels: 2, panelRows: 2, seed: 101 }, rough: 0.16, metal: 0.98, tpm: 0.6, bump: 0.2 },
      pal: { accent: 0x2ad7ff, accent2: 0xe6f4ff, glow: 0x4fe6ff, dark: 0x0e1318, ground: 0x555f68 }
    }
  };

  /* The contract's eight eras map onto the style set. Aliases let callers pass
     either an era name, an era index, or a style name directly. */
  var ERA_TO_STYLE = {
    stone: 'tribal', tribal: 'tribal', primitive: 'tribal',
    bronze: 'greek', greek: 'greek', hellenic: 'greek', classical: 'greek',
    iron: 'rome', rome: 'rome', roman: 'rome', imperial: 'rome',
    medieval: 'viking', viking: 'viking', norse: 'viking', dark: 'viking',
    gunpowder: 'japan', japan: 'japan', japanese: 'japan', sengoku: 'japan', renaissance: 'japan',
    industrial: 'industrial', steam: 'industrial', victorian: 'industrial',
    modern: 'modern', ww2: 'modern', contemporary: 'modern',
    future: 'future', sci: 'future', scifi: 'future', space: 'future'
  };
  var ERA_ORDER = ['tribal', 'greek', 'rome', 'viking', 'japan', 'industrial', 'modern', 'future'];

  function resolveStyle(era) {
    if (era === undefined || era === null) {
      var c = core();
      era = (c && c.state) ? c.state.era : 'medieval';
    }
    if (typeof era === 'number' && isFinite(era)) {
      var list = AOW.ERAS || [];
      var name = list[clamp(era | 0, 0, list.length - 1)];
      if (name) { era = name; }
      else { return ERA_ORDER[clamp(era | 0, 0, ERA_ORDER.length - 1)]; }
    }
    var k = String(era).toLowerCase().replace(/[^a-z]/g, '');
    if (STYLES[k]) { return k; }
    if (ERA_TO_STYLE[k]) { return ERA_TO_STYLE[k]; }
    var key;
    for (key in ERA_TO_STYLE) {
      if (k.indexOf(key) === 0 || key.indexOf(k) === 0) { return ERA_TO_STYLE[key]; }
    }
    return 'viking';
  }

  /* ==========================================================================
   * 6. MATERIALS
   * ======================================================================== */

  var matCache = Object.create(null);

  function col(hexv) {
    var r = R();
    if (r && typeof r.color === 'function') {
      var c = r.color(hexv);
      if (c) { return c.clone ? c.clone() : c; }
    }
    return new THREE.Color(hexv);
  }

  function stdMat(key, spec, extra) {
    if (matCache[key]) { return matCache[key]; }
    var m;
    try {
      var t = pairTex(key, spec.d, spec.o);
      var params = {
        color: 0xffffff,
        roughness: spec.rough === undefined ? 0.9 : spec.rough,
        metalness: spec.metal === undefined ? 0.02 : spec.metal
      };
      if (t.map) {
        t.map.repeat.set(1, 1);
        params.map = t.map;
      } else {
        params.color = col(spec.o && spec.o.base !== undefined ? spec.o.base : 0x999999);
      }
      if (t.bump) { params.bumpMap = t.bump; params.bumpScale = spec.bump === undefined ? 0.35 : spec.bump; }
      m = new THREE.MeshStandardMaterial(params);
      if (extra) { var k; for (k in extra) { m[k] = extra[k]; } }
      m.name = key;
    } catch (e) {
      warn('mat:' + key, 'material "' + key + '" failed — using a plain fallback.', e);
      m = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.9, metalness: 0.02 });
    }
    matCache[key] = m;
    return m;
  }

  /**
   * Slot names used by the build kit:
   *   wall  primary structural surface      wall2 secondary / base course
   *   roof  roof covering                   trim  timber / dressed stone detail
   *   metal worn metal fittings             dark  openings, tunnels, arrow slits
   *   glow  emissive accent                 earth foundation / rampart
   */
  function M(styleKey, slot) {
    var S = STYLES[styleKey] || STYLES.viking;
    var key = styleKey + '.' + slot;
    if (matCache[key]) { return matCache[key]; }
    var m;
    switch (slot) {
      case 'wall':  m = stdMat(key, S.wall); break;
      case 'wall2': m = stdMat(key, S.wall2); break;
      case 'roof':  m = stdMat(key, S.roofM); break;
      case 'trim':  m = stdMat(key, S.trim); break;
      case 'metal': m = stdMat(key, S.metalM); break;
      case 'earth':
        m = stdMat(key, { d: drawStone, rough: 0.99, metal: 0.0, tpm: 0.2, bump: 0.55,
          o: { base: S.pal.ground, base2: shade(S.pal.ground, 0.7), mortar: shade(S.pal.ground, 0.5), rows: 4, moss: 0x445c2c, mossAmt: 1.4, seed: 111 } });
        break;
      case 'dark':
        m = new THREE.MeshStandardMaterial({ color: col(S.pal.dark), roughness: 1.0, metalness: 0.0 });
        m.name = key; matCache[key] = m;
        break;
      case 'accent':
        m = new THREE.MeshStandardMaterial({ color: col(S.pal.accent), roughness: 0.72, metalness: 0.12 });
        m.name = key; matCache[key] = m;
        break;
      case 'accent2':
        m = new THREE.MeshStandardMaterial({ color: col(S.pal.accent2), roughness: 0.6, metalness: 0.2 });
        m.name = key; matCache[key] = m;
        break;
      case 'glow':
        m = new THREE.MeshStandardMaterial({
          color: col(S.pal.glow), emissive: col(S.pal.glow), emissiveIntensity: 1.4,
          roughness: 0.4, metalness: 0.1
        });
        m.name = key; matCache[key] = m;
        break;
      default:
        m = stdMat(key, S.wall);
    }
    matCache[key] = m;
    return m;
  }

  /** Team-tinted emissive strip / pennant fabric. */
  function teamGlowMat(team) {
    var key = 'team.glow.' + team;
    if (matCache[key]) { return matCache[key]; }
    var c = TEAM_COLOR[team] || 0xffffff;
    var m = new THREE.MeshStandardMaterial({
      color: col(c), emissive: col(c), emissiveIntensity: 1.25, roughness: 0.35, metalness: 0.15
    });
    m.name = key; matCache[key] = m;
    return m;
  }

  function bannerMat(team, styleKey) {
    var key = 'banner.' + team + '.' + styleKey;
    if (matCache[key]) { return matCache[key]; }
    var S = STYLES[styleKey] || STYLES.viking;
    var sig = ({ tribal: 'skull', greek: 'sun', rome: 'eagle', viking: 'lion',
      japan: 'sun', industrial: 'lion', modern: 'lion', future: 'circuit' })[styleKey] || 'lion';
    var tex = mkTex('fort.banner.' + team + '.' + styleKey, 128, 256, function (c, w, h) {
      drawBanner(c, w, h, { color: TEAM_COLOR[team] || 0x888888, trim: S.pal.accent2, sigil: sig, seed: 13 + team });
    }, { key: 'fort.banner.' + team + '.' + styleKey, wrap: THREE.ClampToEdgeWrapping });
    var m = new THREE.MeshStandardMaterial({
      map: tex || null,
      color: tex ? 0xffffff : col(TEAM_COLOR[team] || 0x888888),
      roughness: 0.95, metalness: 0.0,
      side: THREE.DoubleSide
    });
    m.name = key; matCache[key] = m;
    return m;
  }

  function tearMap(level) {
    var key = 'fort.tear.' + level;
    return mkTex(key, 128, 256, function (c, w, h) { drawTear(c, w, h, level); },
      { key: key, linear: true, wrap: THREE.ClampToEdgeWrapping });
  }

  function crackMat() {
    if (matCache['crackMat']) { return matCache['crackMat']; }
    var tex = mkTex('fort.cracks', 512, 512, function (c, w, h) { drawCracks(c, w, h, 5); },
      { key: 'fort.cracks', wrap: THREE.ClampToEdgeWrapping });
    var m = new THREE.MeshBasicMaterial({
      map: tex || null,
      color: tex ? 0xffffff : 0x1a1512,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    });
    m.name = 'fort.crackMat';
    matCache['crackMat'] = m;
    return m;
  }

  function shieldMat(team, styleKey) {
    var key = 'shield.' + team + '.' + styleKey;
    if (matCache[key]) { return matCache[key]; }
    var S = STYLES[styleKey] || STYLES.viking;
    var tex = mkTex('fort.shieldface.' + team + '.' + styleKey, 128, 128, function (c, w, h) {
      drawShield(c, w, h, { color: TEAM_COLOR[team] || 0x888888, trim: S.pal.accent2, seed: 17 + team });
    }, { key: 'fort.shieldface.' + team + '.' + styleKey, wrap: THREE.ClampToEdgeWrapping });
    var m = new THREE.MeshStandardMaterial({
      map: tex || null, color: tex ? 0xffffff : col(TEAM_COLOR[team] || 0x888888),
      roughness: 0.85, metalness: 0.1, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide
    });
    m.name = key; matCache[key] = m;
    return m;
  }

  function flameMat(styleKey) {
    var key = 'flame.' + styleKey;
    if (matCache[key]) { return matCache[key]; }
    var S = STYLES[styleKey] || STYLES.viking;
    var m = new THREE.MeshBasicMaterial({
      color: col(S.pal.glow),
      transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    m.name = key; matCache[key] = m;
    return m;
  }

  function energyMat(team) {
    var key = 'energy.' + team;
    if (matCache[key]) { return matCache[key]; }
    var c = TEAM_COLOR[team] === 0xc0392b ? 0xff6a4a : 0x2ad7ff;
    var tex = mkTex('fort.energy.' + team, 256, 256, function (cx, w, h) {
      drawEnergy(cx, w, h, 'color', { base: c });
    }, { key: 'fort.energy.' + team });
    var m = new THREE.MeshBasicMaterial({
      map: tex || null,
      color: col(c),
      transparent: true, opacity: 0.30,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    m.name = key; matCache[key] = m;
    return m;
  }

  /* ==========================================================================
   * 7. THE BUILD KIT
   * --------------------------------------------------------------------------
   * Everything is authored in fort-local space where +x points at the enemy.
   * Pieces are pushed into (region, material, damage-visibility) buckets and
   * merged at the end, so a whole tower is one or two draw calls but can still
   * topple as a rigid body and shed its crenellations as it takes hits.
   * ======================================================================== */

  function slotMat(fort, slot) {
    if (slot === 'teamglow') { return teamGlowMat(fort.team); }
    if (slot === 'shieldface') { return shieldMat(fort.team, fort.style); }
    return M(fort.style, slot);
  }

  function region(fort, name, px, py, pz, kind) {
    var g = new THREE.Group();
    g.name = 'fort' + fort.team + '.' + name;
    g.position.set(px, py, pz);
    var r = {
      name: name, group: g, px: px, py: py, pz: pz,
      kind: kind || 'static', buckets: Object.create(null), meshes: []
    };
    fort.regions[name] = r;
    fort.regionList.push(r);
    fort.struct.add(g);
    return r;
  }

  /**
   * Pieces are bucketed by MATERIAL ONLY — one draw call per material per
   * region. Damage variants are not separate meshes (that ballooned the draw
   * count past 190 per castle); instead each piece records its vertex range in
   * the merged buffer, and knocking a merlon off collapses that range to a
   * single point. Degenerate triangles rasterise zero pixels, so it is a free
   * hide, and the original positions are kept so repairs can put it back.
   */
  function addG(fort, regionName, slot, g, hideAt, showAt) {
    if (!g) { return; }
    var r = fort.regions[regionName];
    if (!r) { r = fort.regions.base; }
    if (!r) { return; }
    var b = r.buckets[slot];
    if (!b) { b = r.buckets[slot] = { slot: slot, list: [], meta: [] }; }
    b.list.push(g);
    b.meta.push((hideAt || 0) | ((showAt || 0) << 4));
  }

  var _ranges = [];

  function flushRegions(fort) {
    var i, j, k, r, b, merged, mesh;
    for (i = 0; i < fort.regionList.length; i++) {
      r = fort.regionList[i];
      for (k in r.buckets) {
        b = r.buckets[k];
        _ranges.length = 0;
        merged = mergeList(b.list, _ranges);
        b.list.length = 0;
        if (!merged) { continue; }
        merged.translate(-r.px, -r.py, -r.pz);
        mesh = new THREE.Mesh(merged, slotMat(fort, b.slot));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();

        var live = null;
        for (j = 0; j < _ranges.length; j++) {
          var m = b.meta[_ranges[j].src] || 0;
          var hideAt = m & 0x0f, showAt = (m >> 4) & 0x0f;
          if (!hideAt && !showAt) { continue; }
          if (!live) { live = []; }
          live.push({
            start: _ranges[j].start, count: _ranges[j].count,
            hideAt: hideAt, showAt: showAt, hidden: false
          });
        }
        if (live) {
          mesh.userData.ranges = live;
          mesh.userData.basePos = new Float32Array(merged.attributes.position.array);
        }
        r.group.add(mesh);
        r.meshes.push(mesh);
      }
      r.buckets = Object.create(null);
    }
  }

  /** Show/hide the damage-variant vertex ranges of one merged mesh. */
  function applyMeshStage(mesh, stage) {
    var ranges = mesh.userData.ranges;
    if (!ranges) { return false; }
    var base = mesh.userData.basePos;
    var attr = mesh.geometry.attributes.position;
    var a = attr.array;
    var changed = false, i, j, rg, o;
    for (i = 0; i < ranges.length; i++) {
      rg = ranges[i];
      var hide = (rg.hideAt > 0 && stage >= rg.hideAt) || (rg.showAt > 0 && stage < rg.showAt);
      if (hide === rg.hidden) { continue; }
      rg.hidden = hide;
      changed = true;
      o = rg.start * 3;
      if (hide) {
        var px = base[o], py = base[o + 1], pz = base[o + 2];
        for (j = 0; j < rg.count; j++) {
          a[o + j * 3] = px; a[o + j * 3 + 1] = py; a[o + j * 3 + 2] = pz;
        }
      } else {
        for (j = 0; j < rg.count * 3; j++) { a[o + j] = base[o + j]; }
      }
    }
    if (changed) { attr.needsUpdate = true; }
    return changed;
  }

  /* ---- parapets ------------------------------------------------------------ */
  /** hideAt pattern: which merlons get knocked off at damage stages 1/2/3. */
  var MERLON_HIDE = [0, 3, 0, 2, 0, 3, 1, 0];

  function parapetRun(fort, regionName, S, T, axis, a0, a1, fixed, baseY, thick, dir) {
    var len = a1 - a0;
    if (len <= 0.4) { return; }
    var type = S.parapet;
    var D = detail();
    var mw = clamp(T.merlon * 0.62, 0.5, 1.4);          // merlon width
    var gap = mw * 0.92;
    var pitch = mw + gap;
    var n = Math.max(2, Math.round((len / pitch) * (D < 0.6 ? 0.62 : 1)));
    var step = len / n;
    var i, a, g;
    var mh = T.merlon;

    if (type === 'cornice') {
      // Greek: no crenellations at all — a stepped cornice plus acroteria.
      g = boxG(axis === 'z' ? thick + 0.5 : len, 0.42, axis === 'z' ? len : thick + 0.5, S.wall.tpm);
      addG(fort, regionName, 'trim', place(g, axis === 'z' ? fixed : (a0 + a1) * 0.5, baseY + 0.21,
        axis === 'z' ? (a0 + a1) * 0.5 : fixed));
      g = boxG(axis === 'z' ? thick + 0.9 : len, 0.3, axis === 'z' ? len : thick + 0.9, S.wall.tpm);
      addG(fort, regionName, 'trim', place(g, axis === 'z' ? fixed : (a0 + a1) * 0.5, baseY + 0.57,
        axis === 'z' ? (a0 + a1) * 0.5 : fixed));
      for (i = 0; i < n; i += 2) {
        a = a0 + (i + 0.5) * step;
        g = extrudeG([[-0.34, 0], [0.34, 0], [0.22, 0.28], [0, 0.62], [-0.22, 0.28]], thick * 0.7, S.trim.tpm);
        place(g, axis === 'z' ? fixed : a, baseY + 0.72, axis === 'z' ? a : fixed,
          0, axis === 'z' ? Math.PI * 0.5 : 0, 0);
        addG(fort, regionName, 'trim', g, MERLON_HIDE[i % 8]);
      }
      return;
    }

    if (type === 'plaster') {
      // Japanese parapet: solid plaster wall pierced by square / round gun ports.
      g = boxG(axis === 'z' ? thick : len, mh, axis === 'z' ? len : thick, S.wall.tpm);
      addG(fort, regionName, 'wall', place(g, axis === 'z' ? fixed : (a0 + a1) * 0.5, baseY + mh * 0.5,
        axis === 'z' ? (a0 + a1) * 0.5 : fixed));
      g = boxG(axis === 'z' ? thick + 0.5 : len, 0.28, axis === 'z' ? len : thick + 0.5, S.trim.tpm);
      addG(fort, regionName, 'trim', place(g, axis === 'z' ? fixed : (a0 + a1) * 0.5, baseY + mh + 0.12,
        axis === 'z' ? (a0 + a1) * 0.5 : fixed));
      for (i = 0; i < n; i++) {
        a = a0 + (i + 0.5) * step;
        var shp = i % 3;
        if (shp === 0) { g = boxG(thick + 0.3, 0.52, 0.52, 0); }
        else if (shp === 1) { g = cylG(0.3, 0.3, thick + 0.3, 8, 0); place(g, 0, 0, 0, 0, 0, Math.PI * 0.5); }
        else { g = coneG(0.4, thick + 0.3, 3, 0); place(g, 0, 0, 0, 0, 0, -Math.PI * 0.5); }
        if (axis === 'z') { place(g, fixed, baseY + mh * 0.5, a); }
        else { place(g, a, baseY + mh * 0.5, fixed, 0, Math.PI * 0.5, 0); }
        addG(fort, regionName, 'dark', g, MERLON_HIDE[i % 8]);
      }
      return;
    }

    for (i = 0; i < n; i++) {
      a = a0 + (i + 0.5) * step;
      var hideAt = MERLON_HIDE[i % 8];
      if (type === 'spike' || type === 'palisade') {
        // sharpened stakes — tribal palisade and viking timber walls
        var sh = mh * (0.9 + (i % 3) * 0.12);
        g = cylG(0.16, 0.24, sh, 7, S.wall.tpm);
        if (axis === 'z') { place(g, fixed, baseY + sh * 0.5, a, 0, 0, 0.05 * ((i % 2) ? 1 : -1)); }
        else { place(g, a, baseY + sh * 0.5, fixed, 0.05 * ((i % 2) ? 1 : -1), 0, 0); }
        addG(fort, regionName, type === 'spike' ? 'wall' : 'trim', g, hideAt);
        g = coneG(0.24, 0.42, 7, S.wall.tpm);
        if (axis === 'z') { place(g, fixed, baseY + sh + 0.2, a); }
        else { place(g, a, baseY + sh + 0.2, fixed); }
        addG(fort, regionName, type === 'spike' ? 'wall' : 'trim', g, hideAt);
      } else if (type === 'lume') {
        // future: sleek angled plates with a glowing seam
        g = boxG(axis === 'z' ? thick * 0.8 : mw * 1.6, mh, axis === 'z' ? mw * 1.6 : thick * 0.8, S.wall.tpm);
        if (axis === 'z') { place(g, fixed, baseY + mh * 0.5, a, 0.14 * dir, 0, 0); }
        else { place(g, a, baseY + mh * 0.5, fixed, 0, 0, -0.14 * dir); }
        addG(fort, regionName, 'wall', g, hideAt);
        g = boxG(axis === 'z' ? thick * 0.86 : mw * 1.3, 0.10, axis === 'z' ? mw * 1.3 : thick * 0.86, 0);
        if (axis === 'z') { place(g, fixed, baseY + mh * 0.86, a); }
        else { place(g, a, baseY + mh * 0.86, fixed); }
        addG(fort, regionName, 'teamglow', g, hideAt);
      } else if (type === 'sandbag') {
        // modern: stacked sandbags
        var j;
        for (j = 0; j < 2; j++) {
          var bw = mw * 1.5 - j * 0.16;
          g = boxG(axis === 'z' ? thick * 0.85 : bw, mh * 0.5, axis === 'z' ? bw : thick * 0.85, S.trim.tpm);
          if (axis === 'z') { place(g, fixed + (j % 2 ? 0.08 : -0.05), baseY + mh * 0.26 + j * mh * 0.46, a + (j % 2 ? 0.1 : 0)); }
          else { place(g, a + (j % 2 ? 0.1 : 0), baseY + mh * 0.26 + j * mh * 0.46, fixed + (j % 2 ? 0.08 : -0.05)); }
          addG(fort, regionName, 'trim', g, hideAt);
        }
      } else if (type === 'plate') {
        // industrial: riveted iron plate parapet with a girder rail
        g = boxG(axis === 'z' ? thick * 0.55 : mw * 1.7, mh, axis === 'z' ? mw * 1.7 : thick * 0.55, S.wall2.tpm);
        if (axis === 'z') { place(g, fixed + thick * 0.16 * dir, baseY + mh * 0.5, a); }
        else { place(g, a, baseY + mh * 0.5, fixed + thick * 0.16 * dir); }
        addG(fort, regionName, 'wall2', g, hideAt);
      } else {
        // classic square merlon with a chamfered cap
        g = boxG(axis === 'z' ? thick : mw * 1.05, mh, axis === 'z' ? mw * 1.05 : thick, S.wall.tpm);
        if (axis === 'z') { place(g, fixed, baseY + mh * 0.5, a); }
        else { place(g, a, baseY + mh * 0.5, fixed); }
        addG(fort, regionName, 'wall', g, hideAt);
        if (axis === 'z') {
          g = prismG(mw * 0.55, mw * 1.15, 0.3, S.trim.tpm, thick / (mw * 1.15));
          place(g, fixed, baseY + mh + 0.15, a, 0, Math.PI * 0.5, 0);
        } else {
          g = prismG(mw * 0.55, mw * 1.15, 0.3, S.trim.tpm, thick / (mw * 1.15));
          place(g, a, baseY + mh + 0.15, fixed);
        }
        addG(fort, regionName, 'trim', g, hideAt);
      }
    }

    // The wall-walk lip behind the merlons — reads as a real fighting platform.
    if (type !== 'cornice' && type !== 'plaster') {
      g = boxG(axis === 'z' ? 0.3 : len, mh * 0.45, axis === 'z' ? len : 0.3, S.wall.tpm);
      if (axis === 'z') { place(g, fixed - thick * 0.5 * dir - 0.15 * dir, baseY + mh * 0.22, (a0 + a1) * 0.5); }
      else { place(g, (a0 + a1) * 0.5, baseY + mh * 0.22, fixed - thick * 0.5 * dir - 0.15 * dir); }
      addG(fort, regionName, 'wall', g);
    }
  }

  /* ---- arrow slits --------------------------------------------------------- */
  function arrowSlits(fort, regionName, S, axis, a0, a1, fixed, y, thick, dir, count) {
    var i, g, a;
    for (i = 0; i < count; i++) {
      a = a0 + ((i + 0.5) / count) * (a1 - a0);
      // recessed dark cross-slit
      g = boxG(axis === 'z' ? 0.22 : 0.20, 1.5, axis === 'z' ? 0.20 : 0.22, 0);
      if (axis === 'z') { place(g, fixed + thick * 0.5 * dir - 0.06 * dir, y, a); }
      else { place(g, a, y, fixed + thick * 0.5 * dir - 0.06 * dir); }
      addG(fort, regionName, 'dark', g);
      g = boxG(axis === 'z' ? 0.22 : 0.72, 0.22, axis === 'z' ? 0.72 : 0.22, 0);
      if (axis === 'z') { place(g, fixed + thick * 0.5 * dir - 0.06 * dir, y + 0.32, a); }
      else { place(g, a, y + 0.32, fixed + thick * 0.5 * dir - 0.06 * dir); }
      addG(fort, regionName, 'dark', g);
      // dressed stone surround
      g = boxG(axis === 'z' ? 0.16 : 0.62, 2.1, axis === 'z' ? 0.62 : 0.16, S.trim.tpm);
      if (axis === 'z') { place(g, fixed + thick * 0.5 * dir + 0.02 * dir, y, a); }
      else { place(g, a, y, fixed + thick * 0.5 * dir + 0.02 * dir); }
      addG(fort, regionName, 'trim', g);
    }
  }

  /* ---- one curtain wall segment ------------------------------------------- */
  function curtainWall(fort, S, T, regionName, axis, a0, a1, fixed, thick, height, dir, opts) {
    opts = opts || {};
    var len = a1 - a0, mid = (a0 + a1) * 0.5;
    var g;
    var batter = S.batter || 0;

    if (batter > 0.02) {
      // battered (sloping) base — the japanese/roman signature
      var bh = height * 0.42;
      var bw = thick * (1 + batter * 2.2);
      // dScale stretches the prism along its local z; for an x-running wall the
      // ry rotation below swaps that into x, so the same value is correct twice.
      g = prismG(thick, bw, bh, S.wall2.tpm, len / bw);
      if (axis === 'z') { place(g, fixed, bh * 0.5, mid); }
      else { place(g, mid, bh * 0.5, fixed, 0, Math.PI * 0.5, 0); }
      addG(fort, regionName, 'wall2', g);
      g = boxG(axis === 'z' ? thick : len, height - bh, axis === 'z' ? len : thick, S.wall.tpm);
      if (axis === 'z') { place(g, fixed, bh + (height - bh) * 0.5, mid); }
      else { place(g, mid, bh + (height - bh) * 0.5, fixed); }
      addG(fort, regionName, 'wall', g);
    } else {
      g = boxG(axis === 'z' ? thick : len, height, axis === 'z' ? len : thick, S.wall.tpm);
      if (axis === 'z') { place(g, fixed, height * 0.5, mid); }
      else { place(g, mid, height * 0.5, fixed); }
      addG(fort, regionName, 'wall', g);
      // plinth course
      g = boxG(axis === 'z' ? thick + 0.5 : len, 0.8, axis === 'z' ? len : thick + 0.5, S.wall2.tpm);
      if (axis === 'z') { place(g, fixed, 0.4, mid); }
      else { place(g, mid, 0.4, fixed); }
      addG(fort, regionName, 'wall2', g);
    }

    // string course band two thirds up — breaks the slab and catches the key light
    g = boxG(axis === 'z' ? thick + 0.34 : len, 0.3, axis === 'z' ? len : thick + 0.34, S.trim.tpm);
    if (axis === 'z') { place(g, fixed, height * 0.63, mid); }
    else { place(g, mid, height * 0.63, fixed); }
    addG(fort, regionName, 'trim', g);

    // wall walk on the inner face
    if (opts.walk) {
      var ww = 2.6;
      g = boxG(axis === 'z' ? ww : len, 0.42, axis === 'z' ? len : ww, S.wall2.tpm);
      if (axis === 'z') { place(g, fixed - (thick * 0.5 + ww * 0.5) * dir, height - 0.21, mid); }
      else { place(g, mid, height - 0.21, fixed - (thick * 0.5 + ww * 0.5) * dir); }
      addG(fort, regionName, 'wall2', g);
      // corbels holding the walk up
      var nc = Math.max(2, Math.round(len / 2.4));
      var i;
      for (i = 0; i < nc; i++) {
        var a = a0 + ((i + 0.5) / nc) * len;
        g = boxG(axis === 'z' ? ww * 0.8 : 0.34, 0.5, axis === 'z' ? 0.34 : ww * 0.8, S.trim.tpm);
        if (axis === 'z') { place(g, fixed - (thick * 0.5 + ww * 0.45) * dir, height - 0.68, a); }
        else { place(g, a, height - 0.68, fixed - (thick * 0.5 + ww * 0.45) * dir); }
        addG(fort, regionName, 'trim', g);
      }
    }

    // arrow slits facing outward
    if (opts.slits) {
      arrowSlits(fort, regionName, S, axis, a0, a1, fixed, height * 0.45, thick, dir,
        Math.max(1, Math.round(len / 4.2 * (detail() < 0.6 ? 0.6 : 1))));
    }

    parapetRun(fort, regionName, S, T, axis, a0, a1, fixed, height, thick, dir);
  }

  /* ---- tower --------------------------------------------------------------- */
  function tower(fort, S, T, regionName, cx, cz, h, r, faceDir, opts) {
    opts = opts || {};
    var g, i;
    var shape = S.tower;
    var w = r * 2;

    if (shape === 'log') {
      // bundled palisade logs
      var nl = Math.max(7, Math.round(10 * detail()));
      for (i = 0; i < nl; i++) {
        var a = (i / nl) * 6.2831853;
        var lx = cx + Math.cos(a) * r * 0.92, lz = cz + Math.sin(a) * r * 0.92;
        var lh = h * (0.94 + ((i % 3) * 0.04));
        g = cylG(r * 0.20, r * 0.24, lh, 6, S.wall.tpm);
        addG(fort, regionName, 'wall', place(g, lx, lh * 0.5, lz));
        g = coneG(r * 0.24, 0.5, 6, S.wall.tpm);
        addG(fort, regionName, 'wall', place(g, lx, lh + 0.25, lz), MERLON_HIDE[i % 8]);
      }
      g = cylG(r * 0.82, r * 0.86, h * 0.98, 10, S.wall.tpm);
      addG(fort, regionName, 'wall', place(g, cx, h * 0.49, cz));
      // lashing rings
      for (i = 1; i <= 3; i++) {
        g = torusG(r * 1.0, 0.10, 5, 12, S.trim.tpm);
        addG(fort, regionName, 'trim', place(g, cx, h * (i / 4), cz, Math.PI * 0.5, 0, 0));
      }
    } else if (shape === 'pylon') {
      g = prismG(w * 0.55, w, h, S.wall.tpm);
      addG(fort, regionName, 'wall', place(g, cx, h * 0.5, cz));
      g = prismG(w * 0.62, w * 0.62, h * 0.18, S.wall2.tpm);
      addG(fort, regionName, 'wall2', place(g, cx, h * 0.30, cz));
      for (i = 0; i < 4; i++) {
        g = boxG(0.12, h * 0.72, 0.12, 0);
        addG(fort, regionName, 'teamglow', place(g, cx + (i < 2 ? 1 : -1) * w * 0.32, h * 0.5,
          cz + (i % 2 ? 1 : -1) * w * 0.32));
      }
    } else if (shape === 'yagura') {
      var bh = h * 0.44;
      g = prismG(w * 1.0, w * 1.5, bh, S.wall2.tpm);
      addG(fort, regionName, 'wall2', place(g, cx, bh * 0.5, cz));
      g = boxG(w * 1.06, h - bh, w * 1.06, S.wall.tpm);
      addG(fort, regionName, 'wall', place(g, cx, bh + (h - bh) * 0.5, cz));
      // dark timber framing
      for (i = 0; i < 3; i++) {
        g = boxG(w * 1.12, 0.2, w * 1.12, S.trim.tpm);
        addG(fort, regionName, 'trim', place(g, cx, bh + (h - bh) * (0.12 + i * 0.4), cz));
      }
    } else {
      // square with a slight batter + quoins at the corners
      g = prismG(w * 0.94, w * 1.06, h, S.wall.tpm);
      addG(fort, regionName, 'wall', place(g, cx, h * 0.5, cz));
      var nq = Math.max(3, Math.round(h / 1.5 * (detail() < 0.6 ? 0.55 : 1)));
      for (i = 0; i < nq; i++) {
        var qy = 0.6 + (i / nq) * (h - 1.4);
        var qs = (i % 2) ? 0.52 : 0.72;
        var c2;
        for (c2 = 0; c2 < 4; c2++) {
          var sx2 = (c2 < 2 ? 1 : -1), sz2 = (c2 % 2 ? 1 : -1);
          g = boxG(qs, 0.55, qs, S.trim.tpm);
          addG(fort, regionName, 'trim', place(g, cx + sx2 * (w * 0.5 - qs * 0.28), qy, cz + sz2 * (w * 0.5 - qs * 0.28)));
        }
      }
      g = boxG(w * 1.24, 0.34, w * 1.24, S.wall2.tpm);
      addG(fort, regionName, 'wall2', place(g, cx, 0.4, cz));
    }

    // corbelled top ring (the tower's fighting platform)
    if (S.parapet !== 'cornice') {
      g = prismG(w * 1.34, w * 1.06, 0.62, S.trim.tpm);
      addG(fort, regionName, 'trim', place(g, cx, h + 0.31, cz), 3);
    }
    var pr = w * 0.60;
    parapetRun(fort, regionName, S, T, 'z', cz - pr, cz + pr, cx + pr, h + 0.62, 0.42, 1);
    parapetRun(fort, regionName, S, T, 'z', cz - pr, cz + pr, cx - pr, h + 0.62, 0.42, -1);
    parapetRun(fort, regionName, S, T, 'x', cx - pr, cx + pr, cz + pr, h + 0.62, 0.42, 1);
    parapetRun(fort, regionName, S, T, 'x', cx - pr, cx + pr, cz - pr, h + 0.62, 0.42, -1);

    // slits up the shaft
    if (opts.slits !== false) {
      var ns = Math.max(1, Math.round(2 * detail()) + 1);
      for (i = 0; i < ns; i++) {
        var sy = h * (0.34 + i * 0.24);
        g = boxG(0.2, 1.3, 0.2, 0);
        addG(fort, regionName, 'dark', place(g, cx + w * 0.5 * faceDir, sy, cz));
        g = boxG(0.16, 1.8, 0.55, S.trim.tpm);
        addG(fort, regionName, 'trim', place(g, cx + w * 0.52 * faceDir, sy, cz));
        g = boxG(0.2, 1.3, 0.2, 0);
        addG(fort, regionName, 'dark', place(g, cx, sy, cz - w * 0.5));
      }
    }

    // roof
    if (opts.roof) { towerRoof(fort, S, T, regionName, cx, cz, h + 0.9, r); }

    // damaged variant: a jagged rubble cap that appears once the top is blown off
    var rubbleY = h + 0.2;
    for (i = 0; i < 7; i++) {
      var ra = (i / 7) * 6.2831853;
      g = prismG(0.5 + (i % 3) * 0.2, 0.9 + (i % 2) * 0.4, 0.8 + (i % 3) * 0.5, S.wall.tpm);
      addG(fort, regionName, 'wall', place(g,
        cx + Math.cos(ra) * r * 0.66, rubbleY + 0.2, cz + Math.sin(ra) * r * 0.66,
        (i % 3) * 0.2 - 0.2, ra, (i % 2) * 0.3 - 0.15), 0, 2);
    }
  }

  function towerRoof(fort, S, T, regionName, cx, cz, y, r) {
    var g, i;
    var w = r * 2;
    switch (S.roof) {
      case 'cone':
        g = coneG(w * 0.86, w * 1.15, 10, S.roofM.tpm);
        addG(fort, regionName, 'roof', place(g, cx, y + w * 0.575, cz), 3);
        g = cylG(0.09, 0.09, 1.2, 6, S.trim.tpm);
        addG(fort, regionName, 'trim', place(g, cx, y + w * 1.15 + 0.5, cz), 3);
        break;
      case 'pediment':
        g = boxG(w * 1.3, 0.42, w * 1.3, S.trim.tpm);
        addG(fort, regionName, 'trim', place(g, cx, y + 0.21, cz), 3);
        g = extrudeG([[-w * 0.72, 0], [w * 0.72, 0], [0, w * 0.46]], w * 1.44, S.trim.tpm);
        addG(fort, regionName, 'trim', place(g, cx, y + 0.42, cz), 3);
        g = boxG(w * 1.5, 0.26, w * 1.5, S.roofM.tpm);
        addG(fort, regionName, 'roof', place(g, cx, y + 0.42 + w * 0.24, cz, 0, 0, 0), 3);
        break;
      case 'hip':
        g = prismG(w * 0.18, w * 1.42, w * 0.72, S.roofM.tpm);
        addG(fort, regionName, 'roof', place(g, cx, y + w * 0.36, cz), 3);
        g = boxG(w * 0.3, 0.22, w * 0.3, S.metalM.tpm);
        addG(fort, regionName, 'metal', place(g, cx, y + w * 0.72 + 0.1, cz), 3);
        break;
      case 'steep':
        g = prismG(0.02, w * 1.34, w * 1.55, S.roofM.tpm);
        addG(fort, regionName, 'roof', place(g, cx, y + w * 0.775, cz), 3);
        // dragon-head finials on the ridge — pure viking silhouette
        for (i = 0; i < 2; i++) {
          var s = i ? 1 : -1;
          g = extrudeG([[0, 0], [0.9, 0.15], [1.25, 0.62], [0.86, 0.72], [0.98, 1.05],
            [0.5, 0.78], [0.12, 0.86], [0, 0.5]], 0.28, S.trim.tpm);
          addG(fort, regionName, 'trim', place(g, cx + s * w * 0.42, y + w * 1.1, cz,
            0, s > 0 ? 0 : Math.PI, 0.5 * s), 3);
        }
        break;
      case 'pagoda':
        pagodaRoof(fort, S, regionName, cx, cz, y, w * 0.9, 1, 3);
        break;
      case 'flatIron':
        g = boxG(w * 1.34, 0.3, w * 1.34, S.roofM.tpm);
        addG(fort, regionName, 'roof', place(g, cx, y + 0.15, cz), 3);
        for (i = 0; i < 4; i++) {
          g = cylG(0.07, 0.07, 1.1, 6, S.metalM.tpm);
          addG(fort, regionName, 'metal', place(g, cx + (i < 2 ? 1 : -1) * w * 0.6, y + 0.85,
            cz + (i % 2 ? 1 : -1) * w * 0.6), 3);
        }
        g = cylG(w * 0.42, w * 0.42, w * 0.8, 10, S.metalM.tpm);
        addG(fort, regionName, 'metal', place(g, cx, y + 0.3 + w * 0.4, cz), 3);
        break;
      case 'flat':
        g = boxG(w * 1.3, 0.28, w * 1.3, S.roofM.tpm);
        addG(fort, regionName, 'roof', place(g, cx, y + 0.14, cz), 3);
        g = cylG(0.1, 0.1, 2.4, 6, S.metalM.tpm);
        addG(fort, regionName, 'metal', place(g, cx, y + 1.3, cz), 3);
        g = boxG(0.7, 0.5, 0.5, 0);
        addG(fort, regionName, 'glow', place(g, cx, y + 2.3, cz), 3);
        break;
      case 'blade':
        for (i = 0; i < 3; i++) {
          g = prismG(w * 0.2, w * 1.1 - i * 0.3, 0.34, S.roofM.tpm);
          addG(fort, regionName, 'roof', place(g, cx, y + 0.2 + i * 0.5, cz, 0, i * 0.4, 0), 3);
        }
        g = torusG(w * 0.8, 0.11, 5, 18, S.metalM.tpm);
        addG(fort, regionName, 'teamglow', place(g, cx, y + 2.5, cz, Math.PI * 0.5, 0, 0), 3);
        break;
      default:
        g = prismG(0.02, w * 1.3, w * 0.9, S.roofM.tpm);
        addG(fort, regionName, 'roof', place(g, cx, y + w * 0.45, cz), 3);
    }
  }

  /** Curved, tiered roof — LatheGeometry with a concave profile gives the real
   *  japanese sweep instead of a plain pyramid. */
  function pagodaRoof(fort, S, regionName, cx, cz, y, r, tiers, hideAt) {
    var t, i, g;
    for (t = 0; t < tiers; t++) {
      var rr = r * (1 - t * 0.18);
      var yy = y + t * r * 0.62;
      var pts = [];
      var n = 7;
      for (i = 0; i <= n; i++) {
        var u = i / n;
        // concave sweep: wide flared eave, steep near the ridge
        var rad = rr * (1.24 - 1.24 * Math.pow(u, 1.7));
        var hgt = rr * 0.62 * Math.pow(u, 0.82);
        pts.push(new THREE.Vector2(Math.max(0.01, rad), hgt));
      }
      g = latheG(pts, 4, S.roofM.tpm, Math.PI * 0.25);
      addG(fort, regionName, 'roof', place(g, cx, yy, cz), hideAt || 0);
      // upturned corner tips
      for (i = 0; i < 4; i++) {
        var a = i * 1.5707963 + 0.7853982;
        g = extrudeG([[0, 0], [0.7, 0.05], [0.95, 0.42], [0.62, 0.3], [0.1, 0.2]], 0.2, S.trim.tpm);
        addG(fort, regionName, 'trim', place(g,
          cx + Math.cos(a) * rr * 1.14, yy + 0.06, cz + Math.sin(a) * rr * 1.14,
          0, -a + Math.PI * 0.5, 0.35), hideAt || 0);
      }
      // eave board
      g = torusG(rr * 1.2, 0.09, 4, 4, S.trim.tpm);
      addG(fort, regionName, 'trim', place(g, cx, yy + 0.04, cz, Math.PI * 0.5, Math.PI * 0.25, 0), hideAt || 0);
    }
    // golden shachihoko ridge ornaments
    var ty = y + (tiers - 1) * r * 0.62 + r * 0.62;
    for (i = 0; i < 2; i++) {
      g = extrudeG([[0, 0], [0.34, 0.1], [0.44, 0.5], [0.2, 0.86], [-0.06, 0.6], [-0.16, 0.16]], 0.18, S.metalM.tpm);
      addG(fort, regionName, 'metal', place(g, cx + (i ? 1 : -1) * r * 0.34, ty, cz, 0, 0, (i ? -0.25 : 0.25)), hideAt || 0);
    }
  }

  /* ---- foundation, courtyard, ditch ---------------------------------------- */
  function foundation(fort, S, T, rnd) {
    var w = (L.frontX - L.backX) + 3.4;
    var d = L.halfZ * 2 + 3.4;
    var cx = (L.frontX + L.backX) * 0.5;
    var g, i;

    // stepped rock plinth
    g = prismG(w, w * 1.16, 1.9, S.wall2.tpm, d / w);
    addG(fort, 'base', 'wall2', place(g, cx, -0.85, 0));
    g = prismG(w * 1.08, w * 1.3, 1.4, 0.16, (d + 2.6) / (w * 1.3));
    addG(fort, 'base', 'earth', place(g, cx, -1.9, 0));

    // courtyard floor
    g = boxG(w - 1.4, 0.5, d - 1.4, S.wall2.tpm * 0.7);
    addG(fort, 'base', 'wall2', place(g, cx, L.courtY - 0.25, 0));

    // ditch lip in front of the gate so the drawbridge has something to span
    g = boxG(4.6, 1.5, 9.0, 0);
    addG(fort, 'base', 'dark', place(g, L.frontX + 3.0, -0.7, 0));
    g = prismG(5.4, 6.4, 0.7, S.wall2.tpm, 12 / 6.4);
    addG(fort, 'base', 'wall2', place(g, L.frontX + 5.6, -0.3, 0));

    // scattered boulders around the skirt — kills the "floating box" look
    var nb = Math.max(6, Math.round(16 * detail()));
    for (i = 0; i < nb; i++) {
      var a = rnd() * 6.2831853;
      var rx = cx + Math.cos(a) * (w * 0.52 + rnd() * 1.6);
      var rz = Math.sin(a) * (d * 0.52 + rnd() * 1.6);
      var s = 0.5 + rnd() * 1.5;
      g = prismG(s * 0.8, s * 1.25, s, S.wall2.tpm);
      addG(fort, 'base', 'earth', place(g, rx, -0.1 + s * 0.3, rz, rnd() * 0.4 - 0.2, rnd() * 3.14, rnd() * 0.4 - 0.2));
    }
  }

  /* ---- gatehouse ----------------------------------------------------------- */
  function gatehouse(fort, S, T, tierIdx) {
    var g, i;
    var gh = L.gateHalf;
    var wt = L.wallT;
    var fx = L.frontX;
    var pierH = T.wallH + (T.gatehouse ? 3.4 : 0.8);
    var pierW = 2.7;
    var gateH = clamp(T.wallH * 0.62, 3.6, 6.8);
    fort.gateHeight = gateH;

    // flanking piers
    for (i = 0; i < 2; i++) {
      var s = i ? 1 : -1;
      var pz = s * (gh + pierW * 0.5);
      g = prismG(wt + 1.5, wt + 2.1, pierH, S.wall.tpm, pierW / (wt + 2.1));
      addG(fort, 'gate', 'wall', place(g, fx - wt * 0.5 + 0.35, pierH * 0.5, pz));
      g = boxG(wt + 2.4, 0.42, pierW + 0.7, S.trim.tpm);
      addG(fort, 'gate', 'trim', place(g, fx - wt * 0.5 + 0.35, pierH + 0.21, pz), 3);
      g = boxG(wt + 2.0, 0.5, pierW + 0.5, S.wall2.tpm);
      addG(fort, 'gate', 'wall2', place(g, fx - wt * 0.5 + 0.35, 0.5, pz));
    }

    // the tunnel void + jambs
    g = boxG(wt + 2.4, gateH, gh * 2, 0);
    addG(fort, 'gate', 'dark', place(g, fx - wt * 0.5 + 0.2, gateH * 0.5 + L.courtY, 0));

    // head of the opening: arch or lintel
    if (S.gateArch === 'arch') {
      var nv = 9;
      for (i = 0; i < nv; i++) {
        var a = Math.PI * (i + 0.5) / nv;
        var vr = gh + 0.45;
        g = boxG(wt + 1.9, 1.0, (Math.PI * vr) / nv * 1.15, S.trim.tpm);
        place(g, fx - wt * 0.5 + 0.3, gateH + L.courtY + Math.sin(a) * vr, Math.cos(a) * vr, a - Math.PI * 0.5, 0, 0);
        addG(fort, 'gate', 'trim', g);
      }
      g = boxG(wt + 2.2, 0.9, gh * 2 + 2.2, S.wall.tpm);
      addG(fort, 'gate', 'wall', place(g, fx - wt * 0.5 + 0.3, gateH + L.courtY + gh + 1.0, 0));
    } else {
      g = boxG(wt + 2.2, 1.05, gh * 2 + 2.4, S.trim.tpm);
      addG(fort, 'gate', 'trim', place(g, fx - wt * 0.5 + 0.3, gateH + L.courtY + 0.52, 0));
      // relieving beams above the lintel
      for (i = 0; i < 3; i++) {
        g = boxG(wt + 1.7, 0.34, gh * 2 + 1.4, S.trim.tpm);
        addG(fort, 'gate', 'trim', place(g, fx - wt * 0.5 + 0.25, gateH + L.courtY + 1.25 + i * 0.44, 0));
      }
    }

    // wall above the gate, closing the gap between the piers
    var aboveY = gateH + L.courtY + (S.gateArch === 'arch' ? gh + 1.5 : 2.6);
    if (aboveY < pierH - 0.6) {
      g = boxG(wt + 1.2, pierH - aboveY, gh * 2 + 0.4, S.wall.tpm);
      addG(fort, 'gate', 'wall', place(g, fx - wt * 0.5 + 0.15, (aboveY + pierH) * 0.5, 0));
    }

    // machicolation gallery with murder holes (tier 4+)
    if (tierIdx >= 3) {
      var mY = pierH - 1.5;
      g = boxG(1.5, 1.3, gh * 2 + pierW * 2 + 1.0, S.wall.tpm);
      addG(fort, 'gate', 'wall', place(g, fx + 0.95, mY + 0.65, 0), 3);
      var nh = 7;
      for (i = 0; i < nh; i++) {
        var hz = -(gh + 1.4) + ((i + 0.5) / nh) * (gh + 1.4) * 2;
        g = boxG(0.68, 0.5, 0.5, 0);
        addG(fort, 'gate', 'dark', place(g, fx + 0.95, mY + 0.1, hz), 3);
        g = prismG(0.44, 0.8, 1.0, S.trim.tpm);
        addG(fort, 'gate', 'trim', place(g, fx + 0.42, mY - 0.5, hz, 0, 0, -0.35), 3);
      }
      g = boxG(1.9, 0.36, gh * 2 + pierW * 2 + 1.5, S.trim.tpm);
      addG(fort, 'gate', 'trim', place(g, fx + 1.05, mY + 1.45, 0), 3);
      fort.murderY = mY;
    }

    // parapet across the gatehouse top
    parapetRun(fort, 'gate', S, T, 'z', -(gh + pierW), gh + pierW, fx - wt * 0.5 + 0.35, pierH + 0.42, wt + 2.0, 1);

    // small roof over the gatehouse for the roofed styles
    if (T.roofs && (S.roof === 'pagoda' || S.roof === 'steep' || S.roof === 'hip')) {
      if (S.roof === 'pagoda') {
        pagodaRoof(fort, S, 'gate', fx - wt * 0.5 + 0.35, 0, pierH + 1.0, (gh + pierW) * 0.78, 1, 3);
      } else {
        g = prismG(1.2, (gh + pierW) * 1.9, (gh + pierW) * 0.75, S.roofM.tpm, 0.55);
        addG(fort, 'gate', 'roof', place(g, fx - wt * 0.5 + 0.35, pierH + 1.4 + (gh + pierW) * 0.37, 0, 0, Math.PI * 0.5, 0), 3);
      }
    }

    fort.pierH = pierH;
  }

  /* ---- the keep ------------------------------------------------------------ */
  function keep(fort, S, T, tierIdx, rnd) {
    var h = T.keepH;
    if (h <= 0.5) { return; }
    var g, i, j;
    var cx = -3.0, cz = 0;
    var w = 10.5, d = 12.5;
    var shape = S.keepShape;

    if (shape === 'hut') {
      g = cylG(w * 0.5, w * 0.56, h * 0.62, 12, S.wall.tpm);
      addG(fort, 'keep', 'wall', place(g, cx, L.courtY + h * 0.31, cz));
      g = coneG(w * 0.72, h * 0.55, 12, S.roofM.tpm);
      addG(fort, 'keep', 'roof', place(g, cx, L.courtY + h * 0.62 + h * 0.275, cz), 3);
      for (i = 0; i < 8; i++) {
        var a = (i / 8) * 6.2831853;
        g = cylG(0.14, 0.18, h * 0.66, 6, S.trim.tpm);
        addG(fort, 'keep', 'trim', place(g, cx + Math.cos(a) * w * 0.52, L.courtY + h * 0.33, cz + Math.sin(a) * w * 0.52));
      }
      g = cylG(0.12, 0.12, 2.2, 6, S.trim.tpm);
      addG(fort, 'keep', 'trim', place(g, cx, L.courtY + h * 1.17 + 0.6, cz), 3);
    } else if (shape === 'temple') {
      // stylobate
      for (i = 0; i < 3; i++) {
        g = boxG(w + 3.0 - i * 0.7, 0.42, d + 3.0 - i * 0.7, S.wall.tpm);
        addG(fort, 'keep', 'wall', place(g, cx, L.courtY + 0.21 + i * 0.42, cz));
      }
      var baseY = L.courtY + 1.26;
      var ch = h * 0.62;
      g = boxG(w - 2.2, ch, d - 2.2, S.wall.tpm);
      addG(fort, 'keep', 'wall', place(g, cx, baseY + ch * 0.5, cz));
      // peristyle
      var ncx = 4, ncz = 5;
      for (i = 0; i < ncx; i++) {
        for (j = 0; j < ncz; j++) {
          if (i > 0 && i < ncx - 1 && j > 0 && j < ncz - 1) { continue; }
          var px = cx - (w + 1.2) * 0.5 + (i / (ncx - 1)) * (w + 1.2);
          var pz = cz - (d + 1.2) * 0.5 + (j / (ncz - 1)) * (d + 1.2);
          column(fort, S, 'keep', px, baseY, pz, 0.46, ch);
        }
      }
      // entablature + pediment
      g = boxG(w + 2.4, 0.75, d + 2.4, S.trim.tpm);
      addG(fort, 'keep', 'trim', place(g, cx, baseY + ch + 0.38, cz));
      g = boxG(w + 3.0, 0.4, d + 3.0, S.trim.tpm);
      addG(fort, 'keep', 'trim', place(g, cx, baseY + ch + 0.95, cz));
      g = extrudeG([[-(d + 1.5) * 0.5, 0], [(d + 1.5) * 0.5, 0], [0, 2.4]], w + 2.2, S.trim.tpm);
      addG(fort, 'keep', 'trim', place(g, cx, baseY + ch + 1.15, cz, 0, Math.PI * 0.5, 0), 3);
      g = prismG(0.4, w + 3.4, 1.7, S.roofM.tpm, (d + 3.4) / (w + 3.4));
      addG(fort, 'keep', 'roof', place(g, cx, baseY + ch + 1.35 + 2.2, cz), 3);
    } else if (shape === 'longhouse') {
      g = prismG(w * 0.94, w * 1.06, h * 0.5, S.wall.tpm, d / (w * 1.06));
      addG(fort, 'keep', 'wall', place(g, cx, L.courtY + h * 0.25, cz));
      // steep shingle roof running along z
      g = prismG(0.03, w * 1.22, h * 0.62, S.roofM.tpm, (d + 2.6) / (w * 1.22));
      addG(fort, 'keep', 'roof', place(g, cx, L.courtY + h * 0.5 + h * 0.31, cz), 3);
      // carved gable posts + dragon prows
      for (i = 0; i < 2; i++) {
        var s = i ? 1 : -1;
        g = extrudeG([[0, 0], [1.0, 0.2], [1.5, 0.8], [1.0, 0.92], [1.2, 1.4],
          [0.55, 1.02], [0.1, 1.12], [0, 0.6]], 0.34, S.trim.tpm);
        addG(fort, 'keep', 'trim', place(g, cx, L.courtY + h * 1.12, cz + s * (d * 0.5 + 1.0),
          0, s > 0 ? -Math.PI * 0.5 : Math.PI * 0.5, 0.42 * s), 3);
        g = boxG(0.5, h * 0.5, 0.5, S.trim.tpm);
        addG(fort, 'keep', 'trim', place(g, cx - w * 0.5, L.courtY + h * 0.25, cz + s * d * 0.42));
        g = boxG(0.5, h * 0.5, 0.5, S.trim.tpm);
        addG(fort, 'keep', 'trim', place(g, cx + w * 0.5, L.courtY + h * 0.25, cz + s * d * 0.42));
      }
      for (i = 0; i < 4; i++) {
        g = boxG(0.34, h * 0.62, 0.34, S.trim.tpm);
        addG(fort, 'keep', 'trim', place(g, cx + (i < 2 ? 1 : -1) * (w * 0.5 + 0.5), L.courtY + h * 0.31,
          cz + (i % 2 ? 1 : -1) * d * 0.28, 0, 0, (i < 2 ? -1 : 1) * 0.14));
      }
    } else if (shape === 'tenshu') {
      var storeys = 3, sy = L.courtY;
      var bh = h * 0.30;
      g = prismG(w * 1.05, w * 1.7, bh, S.wall2.tpm, d / (w * 1.7));
      addG(fort, 'keep', 'wall2', place(g, cx, sy + bh * 0.5, cz));
      sy += bh;
      for (i = 0; i < storeys; i++) {
        var sw = w * (1 - i * 0.17), sd = d * (1 - i * 0.17);
        var sh = (h - bh) / storeys * 0.62;
        g = boxG(sw, sh, sd, S.wall.tpm);
        addG(fort, 'keep', 'wall', place(g, cx, sy + sh * 0.5, cz));
        g = boxG(sw + 0.24, 0.22, sd + 0.24, S.trim.tpm);
        addG(fort, 'keep', 'trim', place(g, cx, sy + sh * 0.86, cz));
        g = boxG(sw + 0.24, 0.22, sd + 0.24, S.trim.tpm);
        addG(fort, 'keep', 'trim', place(g, cx, sy + sh * 0.14, cz));
        pagodaRoof(fort, S, 'keep', cx, cz, sy + sh, Math.max(sw, sd) * 0.62, 1, i === storeys - 1 ? 3 : 0);
        sy += sh + Math.max(sw, sd) * 0.62 * 0.42;
      }
    } else if (shape === 'basilica') {
      g = boxG(w, h * 0.66, d, S.wall.tpm);
      addG(fort, 'keep', 'wall', place(g, cx, L.courtY + h * 0.33, cz));
      // blind arcade on the visible flank
      for (i = 0; i < 5; i++) {
        var az = cz - d * 0.4 + (i / 4) * d * 0.8;
        g = boxG(0.5, h * 0.34, 1.5, S.wall2.tpm);
        addG(fort, 'keep', 'wall2', place(g, cx - w * 0.5 - 0.2, L.courtY + h * 0.2, az));
        g = cylG(0.85, 0.85, 0.5, 10, S.wall2.tpm, false);
        addG(fort, 'keep', 'wall2', place(g, cx - w * 0.5 - 0.2, L.courtY + h * 0.38, az, 0, 0, Math.PI * 0.5));
      }
      g = prismG(w * 0.2, w * 1.24, h * 0.3, S.roofM.tpm, (d + 1.6) / (w * 1.24));
      addG(fort, 'keep', 'roof', place(g, cx, L.courtY + h * 0.66 + h * 0.15, cz), 3);
      // corner belfry
      g = boxG(3.2, h * 0.55, 3.2, S.wall.tpm);
      addG(fort, 'keep', 'wall', place(g, cx - 1.0, L.courtY + h * 0.66 + h * 0.275, cz - d * 0.32));
      g = prismG(0.15, 4.2, 2.6, S.roofM.tpm);
      addG(fort, 'keep', 'roof', place(g, cx - 1.0, L.courtY + h * 1.21 + 1.3, cz - d * 0.32), 3);
    } else if (shape === 'factory') {
      g = boxG(w, h * 0.62, d, S.wall.tpm);
      addG(fort, 'keep', 'wall', place(g, cx, L.courtY + h * 0.31, cz));
      // sawtooth roof
      for (i = 0; i < 4; i++) {
        var zz = cz - d * 0.38 + (i / 3) * d * 0.76;
        g = extrudeG([[0, 0], [2.2, 0], [2.2, 1.7], [0, 0.3]], w * 0.98, S.roofM.tpm);
        addG(fort, 'keep', 'roof', place(g, cx, L.courtY + h * 0.62, zz - 1.1, 0, Math.PI * 0.5, 0), 3);
        g = boxG(w * 0.9, 1.4, 0.16, 0);
        addG(fort, 'keep', 'dark', place(g, cx, L.courtY + h * 0.62 + 1.0, zz + 1.05), 3);
      }
      // structural girders
      for (i = 0; i < 5; i++) {
        g = boxG(0.34, h * 0.62, 0.34, S.trim.tpm);
        addG(fort, 'keep', 'trim', place(g, cx + w * 0.5, L.courtY + h * 0.31, cz - d * 0.42 + (i / 4) * d * 0.84));
      }
    } else if (shape === 'bunker') {
      g = prismG(w * 0.86, w * 1.1, h * 0.5, S.wall.tpm, d / (w * 1.1));
      addG(fort, 'keep', 'wall', place(g, cx, L.courtY + h * 0.25, cz));
      g = boxG(w * 0.95, 0.6, d * 0.95, S.roofM.tpm);
      addG(fort, 'keep', 'roof', place(g, cx, L.courtY + h * 0.5 + 0.3, cz), 3);
      // firing embrasures
      for (i = 0; i < 4; i++) {
        g = boxG(0.4, 0.7, 2.3, 0);
        addG(fort, 'keep', 'dark', place(g, cx + w * 0.44, L.courtY + h * 0.32, cz - d * 0.3 + (i / 3) * d * 0.6));
      }
      g = boxG(3.0, h * 0.4, 3.0, S.wall.tpm);
      addG(fort, 'keep', 'wall', place(g, cx - 1.4, L.courtY + h * 0.5 + 0.6 + h * 0.2, cz), 3);
    } else {
      // monolith (future)
      g = prismG(w * 0.62, w * 0.96, h, S.wall.tpm, d / (w * 0.96));
      addG(fort, 'keep', 'wall', place(g, cx, L.courtY + h * 0.5, cz));
      g = boxG(1.0, h * 0.9, 1.0, 0);
      addG(fort, 'keep', 'teamglow', place(g, cx, L.courtY + h * 0.5, cz + d * 0.4));
      g = boxG(1.0, h * 0.9, 1.0, 0);
      addG(fort, 'keep', 'teamglow', place(g, cx, L.courtY + h * 0.5, cz - d * 0.4));
      for (i = 0; i < 3; i++) {
        g = torusG(w * 0.62 - i * 0.5, 0.16, 5, 20, S.metalM.tpm);
        addG(fort, 'keep', 'metal', place(g, cx, L.courtY + h + 1.6 + i * 1.5, cz, Math.PI * 0.5, 0, 0), 3);
      }
      g = prismG(0.02, w * 0.5, h * 0.3, S.metalM.tpm);
      addG(fort, 'keep', 'metal', place(g, cx, L.courtY + h, cz), 3);
    }

    // windows / arrow loops on the visible flank of any keep
    for (i = 0; i < 3; i++) {
      for (j = 0; j < 2; j++) {
        g = boxG(0.25, 1.5, 0.7, 0);
        addG(fort, 'keep', 'dark', place(g, cx - w * 0.5, L.courtY + h * (0.28 + j * 0.28), cz - d * 0.3 + i * d * 0.3));
      }
    }
  }

  function column(fort, S, regionName, x, y, z, r, h) {
    var g, i;
    var flutes = Math.max(6, Math.round(12 * detail()));
    g = boxG(r * 2.5, 0.26, r * 2.5, S.trim.tpm);
    addG(fort, regionName, 'trim', place(g, x, y + 0.13, z));
    g = cylG(r * 0.86, r, h - 0.7, flutes, S.wall.tpm);
    addG(fort, regionName, 'wall', place(g, x, y + 0.26 + (h - 0.7) * 0.5, z));
    // fluting: thin vertical grooves cut by dark inserts
    for (i = 0; i < flutes; i++) {
      var a = (i / flutes) * 6.2831853;
      g = boxG(r * 0.16, h - 1.0, r * 0.16, 0);
      addG(fort, regionName, 'dark', place(g, x + Math.cos(a) * r * 0.9, y + 0.26 + (h - 0.7) * 0.5, z + Math.sin(a) * r * 0.9));
    }
    g = boxG(r * 2.6, 0.34, r * 2.6, S.trim.tpm);
    addG(fort, regionName, 'trim', place(g, x, y + h - 0.24, z));
    g = cylG(r * 1.15, r * 0.9, 0.28, flutes, S.trim.tpm);
    addG(fort, regionName, 'trim', place(g, x, y + h - 0.55, z));
  }

  /* ---- stairs from the courtyard to the wall walk -------------------------- */
  function stairs(fort, S, T, x0, z0, dirZ, height) {
    var steps = Math.max(6, Math.round(height / 0.42));
    var run = height * 1.5;
    var i, g;
    for (i = 0; i < steps; i++) {
      var t = (i + 1) / steps;
      var sh = height * t;
      g = boxG(2.2, sh, run / steps + 0.06, S.wall2.tpm);
      addG(fort, 'sideN', 'wall2', place(g, x0, L.courtY + sh * 0.5, z0 + dirZ * (run * (i + 0.5) / steps)));
    }
    // handrail
    g = boxG(0.24, 0.9, run * 1.02, S.trim.tpm);
    addG(fort, 'sideN', 'trim', place(g, x0 - 1.05, L.courtY + height * 0.55, z0 + dirZ * run * 0.5,
      Math.atan2(height, run) * dirZ, 0, 0));
  }

  /* ---- era signature props ------------------------------------------------- */
  function signatureProps(fort, S, T, tierIdx, rnd) {
    var g, i, j;
    var fx = L.frontX;
    if (detail() < 0.5 && tierIdx < 3) { return; }

    switch (S.sign) {
      case 'totem':
        for (i = 0; i < 2; i++) {
          var s = i ? 1 : -1;
          var tz = s * (L.gateHalf + 4.2);
          var th = 5.5 + tierIdx * 0.6;
          g = cylG(0.42, 0.5, th, 8, S.wall.tpm);
          addG(fort, 'props', 'wall', place(g, fx + 2.4, th * 0.5, tz));
          for (j = 0; j < 3; j++) {
            g = prismG(0.9, 1.05, 0.85, S.trim.tpm);
            addG(fort, 'props', 'trim', place(g, fx + 2.4, 1.2 + j * (th - 2.0) / 3, tz, 0, j * 0.4, 0));
            g = boxG(0.24, 0.24, 1.5, 0);
            addG(fort, 'props', 'dark', place(g, fx + 2.4 + 0.5, 1.35 + j * (th - 2.0) / 3, tz));
          }
          g = extrudeG([[0, 0], [1.4, 0.5], [1.9, 1.35], [0.8, 1.1], [0, 1.5], [-0.8, 1.1], [-1.9, 1.35], [-1.4, 0.5]], 0.3, S.trim.tpm);
          addG(fort, 'props', 'trim', place(g, fx + 2.4, th, tz, 0, Math.PI * 0.5, 0), 2);
          // skull rack
          g = boxG(0.2, 0.2, 3.0, S.trim.tpm);
          addG(fort, 'props', 'trim', place(g, fx + 2.4, th * 0.62, tz));
        }
        break;

      case 'column':
        for (i = 0; i < 6; i++) {
          var pz2 = -L.halfZ + 1.8 + (i / 5) * (L.halfZ * 2 - 3.6);
          if (Math.abs(pz2) < L.gateHalf + 1.6) { continue; }
          column(fort, S, 'props', fx + 1.9, L.courtY, pz2, 0.52, T.wallH * 0.82);
        }
        g = boxG(3.0, 0.6, L.halfZ * 2 - 2.0, S.trim.tpm);
        addG(fort, 'props', 'trim', place(g, fx + 1.9, L.courtY + T.wallH * 0.82 + 0.3, 0));
        g = extrudeG([[-(L.halfZ - 1.0), 0], [(L.halfZ - 1.0), 0], [0, 2.6]], 3.2, S.trim.tpm);
        addG(fort, 'props', 'trim', place(g, fx + 1.9, L.courtY + T.wallH * 0.82 + 0.6, 0, 0, Math.PI * 0.5, 0), 2);
        break;

      case 'standard':
        for (i = 0; i < 2; i++) {
          var ss = i ? 1 : -1;
          var sz = ss * (L.gateHalf + 3.4);
          g = cylG(0.13, 0.15, 7.2, 8, S.metalM.tpm);
          addG(fort, 'props', 'metal', place(g, fx + 2.6, 3.6, sz));
          g = extrudeG([[0, 0], [1.0, 0.55], [0.42, 0.72], [0.9, 1.35], [0, 0.95],
            [-0.9, 1.35], [-0.42, 0.72], [-1.0, 0.55]], 0.22, S.metalM.tpm);
          addG(fort, 'props', 'metal', place(g, fx + 2.6, 7.5, sz, 0, Math.PI * 0.5, 0), 2);
          g = boxG(0.1, 0.9, 1.5, S.metalM.tpm);
          addG(fort, 'props', 'metal', place(g, fx + 2.6, 6.4, sz), 2);
        }
        break;

      case 'shields':
        // round shields hung along the camera-facing flank + the front wall
        var nsh = Math.max(5, Math.round(10 * detail()));
        for (i = 0; i < nsh; i++) {
          var hx = L.backX + 2.2 + (i / (nsh - 1)) * (L.frontX - L.backX - 4.4);
          g = planeG(1.5, 1.5, 0);
          addG(fort, 'sideN', 'shieldface', place(g, hx, T.wallH * 0.56 + ((i % 2) * 0.5), -L.halfZ - 0.06, 0, Math.PI, 0));
        }
        for (i = 0; i < 4; i++) {
          var fz = (i < 2 ? -1 : 1) * (L.gateHalf + 1.8 + (i % 2) * 2.6);
          g = planeG(1.5, 1.5, 0);
          addG(fort, 'props', 'shieldface', place(g, L.frontX + 0.06, T.wallH * 0.5 + (i % 2) * 0.6, fz, 0, Math.PI * 0.5, 0));
        }
        break;

      case 'torii':
        var tw = L.gateHalf + 2.6, tyh = 6.6;
        for (i = 0; i < 2; i++) {
          var tz2 = (i ? 1 : -1) * tw;
          g = cylG(0.3, 0.4, tyh, 10, S.trim.tpm);
          addG(fort, 'props', 'accent', place(g, fx + 6.5, tyh * 0.5, tz2, 0, 0, (i ? -1 : 1) * 0.035));
          g = cylG(0.55, 0.62, 0.5, 10, S.wall2.tpm);
          addG(fort, 'props', 'wall2', place(g, fx + 6.5, 0.25, tz2));
        }
        g = boxG(0.6, 0.44, tw * 2 + 2.4, S.trim.tpm);
        addG(fort, 'props', 'accent', place(g, fx + 6.5, tyh - 1.1, 0));
        g = extrudeG([[-(tw + 1.7), 0], [(tw + 1.7), 0], [(tw + 1.2), 0.62], [-(tw + 1.2), 0.62]], 0.85, S.trim.tpm);
        addG(fort, 'props', 'accent', place(g, fx + 6.5, tyh, 0, 0, 0, 0));
        g = boxG(0.34, 0.9, 0.34, S.trim.tpm);
        addG(fort, 'props', 'accent', place(g, fx + 6.5, tyh - 0.7, 0));
        break;

      case 'stack':
        for (i = 0; i < 2; i++) {
          var kx = -6.5, kz = (i ? 1 : -1) * 6.0;
          var kh = 12 + tierIdx * 1.6;
          g = cylG(0.95, 1.35, kh, 12, S.wall.tpm);
          addG(fort, 'keep', 'wall', place(g, kx, L.courtY + kh * 0.5, kz));
          g = torusG(1.0, 0.14, 5, 14, S.metalM.tpm);
          addG(fort, 'keep', 'metal', place(g, kx, L.courtY + kh - 0.9, kz, Math.PI * 0.5, 0, 0), 3);
          g = cylG(1.15, 1.0, 0.6, 12, S.metalM.tpm);
          addG(fort, 'keep', 'metal', place(g, kx, L.courtY + kh + 0.3, kz), 3);
          fort.stackTips.push(new THREE.Vector3(kx, L.courtY + kh + 0.7, kz));
        }
        break;

      case 'radar':
        // razor wire coils along the front + a slow radar dish on the keep
        for (i = 0; i < 8; i++) {
          var wz = -L.halfZ + 1.5 + (i / 7) * (L.halfZ * 2 - 3);
          if (Math.abs(wz) < L.gateHalf + 0.8) { continue; }
          g = torusG(0.75, 0.06, 4, 12, S.metalM.tpm);
          addG(fort, 'props', 'metal', place(g, fx + 1.4, 0.85, wz, 0, Math.PI * 0.5, 0.2), 2);
        }
        for (i = 0; i < 6; i++) {
          var sz3 = -L.halfZ + 2.5 + (i / 5) * (L.halfZ * 2 - 5);
          if (Math.abs(sz3) < L.gateHalf + 1.4) { continue; }
          g = boxG(1.7, 0.55, 1.5, S.trim.tpm);
          addG(fort, 'props', 'trim', place(g, fx + 2.6, 0.3, sz3, 0, 0.1 * (i % 2 ? 1 : -1), 0), 2);
          g = boxG(1.5, 0.5, 1.3, S.trim.tpm);
          addG(fort, 'props', 'trim', place(g, fx + 2.6, 0.78, sz3, 0, -0.1 * (i % 2 ? 1 : -1), 0), 2);
        }
        break;

      case 'shield':
        // handled as a dynamic (animated) object — see buildDynamics
        break;
      default:
        break;
    }
  }

  /* ==========================================================================
   * 8. PARTICLES — dust, smoke, fire, embers
   * --------------------------------------------------------------------------
   * Two THREE.Points systems per fort (one soft/normal-blended, one additive)
   * with per-particle size and alpha. Structure-of-arrays + a ring-buffer
   * spawn cursor, so the update loop allocates nothing.
   * ======================================================================== */

  var PART_VERT = [
    'attribute float aSize;',
    'attribute float aAlpha;',
    'attribute vec3 aColor;',
    'varying float vAlpha;',
    'varying vec3 vPCol;',
    'void main() {',
    '  vAlpha = aAlpha;',
    '  vPCol = aColor;',
    '  vec4 mv = modelViewMatrix * vec4( position, 1.0 );',
    '  gl_PointSize = aSize * ( 340.0 / max( 1.0, -mv.z ) );',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var PART_FRAG = [
    'uniform sampler2D uMap;',
    'varying float vAlpha;',
    'varying vec3 vPCol;',
    // NOTE: do NOT include the tonemapping/encodings *pars* chunks here —
    // three.js already injects them into every ShaderMaterial's fragment
    // prefix, so including them again is a GLSL redefinition error and the
    // whole shader fails to compile. Only the *apply* chunks belong below.
    '#include <common>',
    'void main() {',
    '  vec4 t = texture2D( uMap, gl_PointCoord );',
    '  float a = t.a * vAlpha;',
    '  if ( a < 0.015 ) discard;',
    '  gl_FragColor = vec4( vPCol * t.rgb, a );',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '}'
  ].join('\n');

  function makeParticles(cap, additive, spriteKey, drawer) {
    var sys = null;
    try {
      var geo = new THREE.BufferGeometry();
      var pos = new Float32Array(cap * 3);
      var siz = new Float32Array(cap);
      var alp = new Float32Array(cap);
      var cl = new Float32Array(cap * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
      geo.setAttribute('aColor', new THREE.BufferAttribute(cl, 3));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 8, 0), 80);

      var tex = mkTex(spriteKey, 64, 64, drawer, { key: spriteKey, wrap: THREE.ClampToEdgeWrapping, mipmaps: true });
      var mat;
      try {
        mat = new THREE.ShaderMaterial({
          uniforms: { uMap: { value: tex } },
          vertexShader: PART_VERT,
          fragmentShader: PART_FRAG,
          transparent: true,
          depthWrite: false,
          depthTest: true,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
        });
      } catch (eShader) {
        warn('part:shader', 'particle ShaderMaterial failed — falling back to PointsMaterial.', eShader);
        mat = new THREE.PointsMaterial({
          map: tex, size: 1.6, sizeAttenuation: true, transparent: true,
          depthWrite: false, opacity: 0.7,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
        });
      }

      var pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = additive ? 6 : 5;

      sys = {
        pts: pts, geo: geo, mat: mat, cap: cap,
        pos: pos, siz: siz, alp: alp, cl: cl,
        vx: new Float32Array(cap), vy: new Float32Array(cap), vz: new Float32Array(cap),
        life: new Float32Array(cap), maxLife: new Float32Array(cap),
        s0: new Float32Array(cap), s1: new Float32Array(cap),
        drag: new Float32Array(cap), buoy: new Float32Array(cap),
        act: new Uint8Array(cap),
        cursor: 0, liveCount: 0
      };
    } catch (e) {
      warn('part:init', 'particle system could not be created — smoke/fire disabled.', e);
      sys = null;
    }
    return sys;
  }

  function spawnParticle(sys, x, y, z, vx, vy, vz, s0, s1, life, r, g, b, drag, buoy) {
    if (!sys) { return; }
    var i = sys.cursor, tries = 0;
    while (sys.act[i] && tries < sys.cap) { i = (i + 1) % sys.cap; tries++; }
    if (tries >= sys.cap) { i = sys.cursor; }          // recycle the oldest
    sys.cursor = (i + 1) % sys.cap;
    if (!sys.act[i]) { sys.liveCount++; }
    sys.act[i] = 1;
    var i3 = i * 3;
    sys.pos[i3] = x; sys.pos[i3 + 1] = y; sys.pos[i3 + 2] = z;
    sys.vx[i] = vx; sys.vy[i] = vy; sys.vz[i] = vz;
    sys.life[i] = life; sys.maxLife[i] = life;
    sys.s0[i] = s0; sys.s1[i] = s1;
    sys.cl[i3] = r; sys.cl[i3 + 1] = g; sys.cl[i3 + 2] = b;
    sys.drag[i] = drag === undefined ? 0.9 : drag;
    sys.buoy[i] = buoy === undefined ? 0 : buoy;
    sys.siz[i] = s0;
    sys.alp[i] = 0;
  }

  function updateParticles(sys, dt) {
    if (!sys || !sys.liveCount) { return; }
    var i, i3, n = sys.cap, live = 0;
    var pos = sys.pos, siz = sys.siz, alp = sys.alp;
    for (i = 0; i < n; i++) {
      if (!sys.act[i]) { continue; }
      var l = sys.life[i] - dt;
      if (l <= 0) { sys.act[i] = 0; alp[i] = 0; siz[i] = 0; continue; }
      sys.life[i] = l;
      var ml = sys.maxLife[i];
      var u = 1 - l / ml;
      var d = 1 - sys.drag[i] * dt;
      if (d < 0) { d = 0; }
      sys.vx[i] *= d; sys.vz[i] *= d;
      sys.vy[i] = sys.vy[i] * d + sys.buoy[i] * dt;
      i3 = i * 3;
      pos[i3] += sys.vx[i] * dt;
      pos[i3 + 1] += sys.vy[i] * dt;
      pos[i3 + 2] += sys.vz[i] * dt;
      if (pos[i3 + 1] < 0.05 && sys.buoy[i] <= 0) {
        pos[i3 + 1] = 0.05;
        sys.vy[i] = 0; sys.vx[i] *= 0.86; sys.vz[i] *= 0.86;
      }
      siz[i] = sys.s0[i] + (sys.s1[i] - sys.s0[i]) * u;
      // fast fade in, long fade out — reads as real dispersal
      alp[i] = (u < 0.14 ? (u / 0.14) : (1 - (u - 0.14) / 0.86));
      if (alp[i] < 0) { alp[i] = 0; }
      live++;
    }
    sys.liveCount = live;
    try {
      sys.geo.attributes.position.needsUpdate = true;
      if (sys.geo.attributes.aSize) { sys.geo.attributes.aSize.needsUpdate = true; }
      if (sys.geo.attributes.aAlpha) { sys.geo.attributes.aAlpha.needsUpdate = true; }
      if (sys.geo.attributes.aColor) { sys.geo.attributes.aColor.needsUpdate = true; }
    } catch (e) { /* ignore */ }
  }

  /* Convenience emitters -------------------------------------------------- */
  function puffDust(fort, x, y, z, amount, spread, up) {
    var sys = fort.soft;
    if (!sys) { return; }
    var n = Math.max(1, Math.round(amount * detail()));
    var i;
    for (i = 0; i < n; i++) {
      var a = Math.random() * 6.2831853, r = Math.random() * spread;
      spawnParticle(sys,
        x + Math.cos(a) * r * 0.5, y + Math.random() * 0.6, z + Math.sin(a) * r * 0.5,
        Math.cos(a) * (0.7 + Math.random() * spread), (up || 0.8) * (0.4 + Math.random()), Math.sin(a) * (0.7 + Math.random() * spread),
        0.9 + Math.random() * 0.8, 3.4 + Math.random() * 3.2,
        1.1 + Math.random() * 1.3,
        0.66, 0.60, 0.50, 1.5, 0.45);
    }
  }

  function puffSmoke(fort, x, y, z, n, dark) {
    var sys = fort.soft;
    if (!sys) { return; }
    var i;
    for (i = 0; i < n; i++) {
      var a = Math.random() * 6.2831853;
      var v = dark ? 0.16 : 0.30;
      spawnParticle(sys,
        x + (Math.random() - 0.5) * 1.2, y, z + (Math.random() - 0.5) * 1.2,
        Math.cos(a) * 0.35 + 0.25, 1.5 + Math.random() * 1.6, Math.sin(a) * 0.35,
        1.2 + Math.random() * 0.9, 5.5 + Math.random() * 4.5,
        3.0 + Math.random() * 2.6,
        v, v * 0.96, v * 0.94, 0.55, 1.05);
    }
  }

  function puffFire(fort, x, y, z, n, colr) {
    var sys = fort.add;
    if (!sys) { return; }
    var i;
    for (i = 0; i < n; i++) {
      var a = Math.random() * 6.2831853;
      spawnParticle(sys,
        x + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.8,
        Math.cos(a) * 0.5, 2.2 + Math.random() * 2.0, Math.sin(a) * 0.5,
        0.7 + Math.random() * 0.5, 0.08,
        0.55 + Math.random() * 0.5,
        colr ? colr[0] : 1.0, colr ? colr[1] : 0.55, colr ? colr[2] : 0.16, 1.1, 2.2);
    }
  }

  function puffEmbers(fort, x, y, z, n) {
    var sys = fort.add;
    if (!sys) { return; }
    var i;
    for (i = 0; i < n; i++) {
      var a = Math.random() * 6.2831853;
      spawnParticle(sys,
        x, y, z,
        Math.cos(a) * (1 + Math.random() * 3), 2.5 + Math.random() * 4.5, Math.sin(a) * (1 + Math.random() * 3),
        0.22, 0.05,
        1.1 + Math.random() * 1.4,
        1.0, 0.72, 0.28, 0.75, -2.2);
    }
  }

  /* ==========================================================================
   * 9. DYNAMIC (animated) PARTS
   * ======================================================================== */

  function mkMesh(list, mat, cast) {
    var g = mergeList(list);
    if (!g) { return null; }
    var m = new THREE.Mesh(g, mat);
    m.castShadow = cast !== false;
    m.receiveShadow = true;
    return m;
  }

  function buildDynamics(fort, S, T, tierIdx, rnd) {
    var team = fort.team;
    var fx = L.frontX, wt = L.wallT, gh = L.gateHalf;
    var gateH = fort.gateHeight || 5;
    var list, g, i, j;

    /* ---- portcullis ------------------------------------------------------ */
    if (tierIdx >= 1) {
      list = [];
      var nb = 7, nh = 3;
      for (i = 0; i < nb; i++) {
        var bz = -gh * 0.86 + (i / (nb - 1)) * gh * 1.72;
        g = cylG(0.11, 0.11, gateH * 0.98, 6, S.metalM.tpm);
        list.push(place(g, 0, 0, bz));
        g = coneG(0.15, 0.42, 6, S.metalM.tpm);
        list.push(place(g, 0, -gateH * 0.49 - 0.21, bz, Math.PI, 0, 0));
      }
      for (j = 0; j < nh; j++) {
        g = cylG(0.09, 0.09, gh * 1.9, 6, S.metalM.tpm);
        list.push(place(g, 0, -gateH * 0.36 + j * gateH * 0.36, 0, Math.PI * 0.5, 0, 0));
      }
      var port = mkMesh(list, M(fort.style, 'metal'));
      if (port) {
        port.position.set(fx - wt * 0.5 + 0.9, L.courtY + gateH * 0.5, 0);
        port.name = 'portcullis';
        fort.dyn.add(port);
        fort.portcullis = port;
        fort.portcullisY0 = port.position.y;
        fort.portcullisLift = gateH * 0.94;
      }
    }

    /* ---- gate leaves (behind the portcullis) ----------------------------- */
    for (i = 0; i < 2; i++) {
      var sgn = i ? 1 : -1;
      // Authored so the mesh ORIGIN sits on the hinge (the outer jamb) and the
      // leaf extends inward — otherwise the door swings through the wall.
      list = [];
      g = boxG(0.34, gateH * 0.96, gh * 0.98, S.trim.tpm);
      list.push(place(g, 0, 0, -sgn * gh * 0.49));
      for (j = 0; j < 3; j++) {
        g = boxG(0.44, 0.28, gh * 0.94, S.metalM.tpm);
        list.push(place(g, 0.02, -gateH * 0.32 + j * gateH * 0.32, -sgn * gh * 0.49));
      }
      g = cylG(0.16, 0.16, 0.5, 8, S.metalM.tpm);
      list.push(place(g, 0.25, 0, -sgn * gh * 0.86, 0, 0, Math.PI * 0.5));
      var leaf = mkMesh(list, M(fort.style, 'trim'));
      if (leaf) {
        leaf.position.set(fx - wt * 0.5 - 0.55, L.courtY + gateH * 0.5, sgn * gh);
        leaf.name = 'gateLeaf' + i;
        leaf.userData.sign = sgn;
        fort.dyn.add(leaf);
        fort.gateLeaves.push(leaf);
      }
    }

    /* ---- drawbridge ------------------------------------------------------ */
    if (T.bridge) {
      var bl = 7.6, bw = gh * 1.85;
      var hinge = new THREE.Group();
      hinge.position.set(fx + 0.05, L.courtY + 0.1, 0);
      list = [];
      for (i = 0; i < 7; i++) {
        g = boxG(bl, 0.28, bw / 7 - 0.06, S.trim.tpm);
        list.push(place(g, bl * 0.5, 0, -bw * 0.5 + (i + 0.5) * (bw / 7)));
      }
      g = boxG(bl * 0.96, 0.16, 0.34, S.metalM.tpm);
      list.push(place(g, bl * 0.5, 0.2, -bw * 0.36));
      g = boxG(bl * 0.96, 0.16, 0.34, S.metalM.tpm);
      list.push(place(g, bl * 0.5, 0.2, bw * 0.36));
      g = boxG(0.4, 0.3, bw, S.metalM.tpm);
      list.push(place(g, bl - 0.2, 0.16, 0));
      var deck = mkMesh(list, M(fort.style, 'trim'));
      if (deck) { hinge.add(deck); }
      // Lifting chains live in fort space (not on the hinge) so they can be
      // re-aimed every frame between the moving deck tip and the gatehouse.
      for (i = 0; i < 2; i++) {
        var cz2 = (i ? 1 : -1) * bw * 0.42;
        var chain = new THREE.Mesh(cylG(0.055, 0.055, 1, 5, 0), M(fort.style, 'metal'));
        chain.castShadow = false;
        fort.dyn.add(chain);
        fort.chains.push({
          mesh: chain,
          anchor: new THREE.Vector3(fx - 0.55, (fort.pierH || (T.wallH + 3.4)) - 0.7, cz2),
          tipZ: cz2, tipR: bl * 0.86
        });
      }
      hinge.rotation.z = Math.PI * 0.5;
      hinge.name = 'drawbridge';
      fort.dyn.add(hinge);
      fort.bridge = hinge;
      fort.bridgeLen = bl;
    }

    /* ---- banners --------------------------------------------------------- */
    var bslots = [];
    var pierH = fort.pierH || (T.wallH + 3.4);
    bslots.push([fx + 0.12, T.wallH * 0.94, -(gh + 2.6), 0]);
    bslots.push([fx + 0.12, T.wallH * 0.94, (gh + 2.6), 0]);
    bslots.push([fx + 0.12, T.wallH * 0.72, -(gh + 7.0), 0]);
    bslots.push([fx + 0.12, T.wallH * 0.72, (gh + 7.0), 0]);
    bslots.push([2.0, T.wallH * 0.82, -L.halfZ - 0.12, 1]);
    bslots.push([-4.0, T.wallH * 0.82, -L.halfZ - 0.12, 1]);
    bslots.push([8.0, T.wallH * 0.82, -L.halfZ - 0.12, 1]);
    bslots.push([fx + 0.12, T.wallH * 0.55, -(gh + 11.2), 0]);
    bslots.push([fx + 0.12, T.wallH * 0.55, (gh + 11.2), 0]);
    var nBan = Math.min(bslots.length, Math.max(1, Math.round(T.banners * detail())));
    for (i = 0; i < nBan; i++) {
      var bs = bslots[i];
      makeBanner(fort, bs[0], bs[1], bs[2], bs[3], 1.5, 3.2);
    }
    // tall pennants on the tower tops
    if (tierIdx >= 2) {
      var tp = [
        [fx - T.towerR, T.towerH, -(L.halfZ - T.towerR)],
        [fx - T.towerR, T.towerH, (L.halfZ - T.towerR)]
      ];
      for (i = 0; i < tp.length; i++) {
        fort.barGeos.push(place(cylG(0.08, 0.09, 4.2, 6, S.metalM.tpm),
          tp[i][0], tp[i][1] + 3.4, tp[i][2]));
        makeBanner(fort, tp[i][0] + 0.1, tp[i][1] + 5.0, tp[i][2], 0, 1.1, 2.0, true);
      }
    }
    if (fort.barGeos.length) {
      var bars = mkMesh(fort.barGeos, M(fort.style, 'metal'), false);
      if (bars) { bars.name = 'bannerHardware'; fort.dyn.add(bars); }
      fort.barGeos.length = 0;
    }

    /* ---- braziers -------------------------------------------------------- */
    var brz = [
      [fx + 1.9, L.courtY, -(gh + 1.9)],
      [fx + 1.9, L.courtY, (gh + 1.9)],
      [fx - wt - 1.4, T.wallH, -8.5],
      [fx - wt - 1.4, T.wallH, 8.5],
      [fx - wt - 1.4, T.wallH, -12.6],
      [fx - wt - 1.4, T.wallH, 12.6],
      [1.0, T.wallH, -(L.halfZ - wt - 1.3)],
      [-6.0, T.wallH, -(L.halfZ - wt - 1.3)]
    ];
    var nBrz = Math.min(brz.length, Math.max(0, Math.round(T.braziers * detail())));
    for (i = 0; i < nBrz; i++) { makeBrazier(fort, S, brz[i][0], brz[i][1], brz[i][2], i); }

    /* ---- siege engines (tier 4+) ----------------------------------------- */
    if (T.siege > 0) {
      var sp = [
        [fx - T.towerR, T.towerH + 1.0, -(L.halfZ - T.towerR), 'ballista'],
        [fx - T.towerR, T.towerH + 1.0, (L.halfZ - T.towerR), 'ballista'],
        [L.backX + T.towerR, T.towerH + 1.0, -(L.halfZ - T.towerR), 'catapult'],
        [L.backX + T.towerR, T.towerH + 1.0, (L.halfZ - T.towerR), 'catapult']
      ];
      var nS = Math.min(T.siege, sp.length);
      for (i = 0; i < nS; i++) { makeSiege(fort, S, sp[i][0], sp[i][1], sp[i][2], sp[i][3]); }
    }

    /* ---- future energy shield -------------------------------------------- */
    if (S.sign === 'shield' && tierIdx >= 3) {
      try {
        var rr = Math.max(L.halfZ, (L.frontX - L.backX) * 0.5) + 4.5;
        var dome = new THREE.Mesh(
          sphereG(rr, 26, 14, 0.05, 6.2831853, 0, 1.15),
          energyMat(team)
        );
        dome.position.set((L.frontX + L.backX) * 0.5, 0.2, 0);
        dome.renderOrder = 4;
        dome.castShadow = false; dome.receiveShadow = false;
        fort.dyn.add(dome);
        fort.shieldDome = dome;
        // hover rings
        for (i = 0; i < 2; i++) {
          var ring = new THREE.Mesh(torusG(rr * 0.42 - i * 1.4, 0.22, 5, 22, S.metalM.tpm), teamGlowMat(team));
          ring.position.set((L.frontX + L.backX) * 0.5, T.keepH + 4.0 + i * 2.2, 0);
          ring.rotation.x = Math.PI * 0.5;
          ring.castShadow = false;
          fort.dyn.add(ring);
          fort.hoverRings.push(ring);
        }
      } catch (e) { warn('shielddome', 'energy shield could not be built', e); }
    }

    /* ---- modern radar dish ------------------------------------------------ */
    if (S.sign === 'radar' && tierIdx >= 2) {
      var mast = new THREE.Group();
      var pl = new THREE.Mesh(cylG(0.16, 0.2, 2.4, 6, S.metalM.tpm), M(fort.style, 'metal'));
      pl.position.y = 1.2; mast.add(pl);
      var dish = new THREE.Mesh(
        sphereG(1.9, 16, 8, S.metalM.tpm, 6.2831853, 0, 1.05),
        M(fort.style, 'metal')
      );
      dish.rotation.z = -1.1;
      dish.position.set(0, 2.7, 0);
      mast.add(dish);
      var feed = new THREE.Mesh(cylG(0.07, 0.07, 1.4, 5, S.metalM.tpm), M(fort.style, 'metal'));
      feed.position.set(0.7, 3.3, 0); feed.rotation.z = -1.1;
      mast.add(feed);
      mast.position.set(-4.4, L.courtY + T.keepH * 0.5 + 1.0, 0);
      fort.dyn.add(mast);
      fort.radar = mast;
    }

    /* ---- crack decals ---------------------------------------------------- */
    buildCracks(fort, S, T);
  }

  /* ---- banner factory ------------------------------------------------------ */
  function makeBanner(fort, x, y, z, faceZ, w, h, noBar) {
    try {
      var geo = new THREE.PlaneGeometry(w, h, 4, 6);
      var mesh = new THREE.Mesh(geo, bannerMat(fort.team, fort.style));
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      var arr = geo.attributes.position.array;
      mesh.userData.base = new Float32Array(arr);
      mesh.userData.phase = fort.banners.length * 1.37;
      mesh.userData.h = h;
      var grp = new THREE.Group();
      grp.position.set(x, y, z);
      // faceZ 0 → hangs on the +x facing wall; 1 → hangs on the -z facing wall
      grp.rotation.y = faceZ ? Math.PI : Math.PI * 0.5;
      mesh.position.set(0, -h * 0.5 - 0.16, 0);
      grp.add(mesh);
      if (!noBar) {
        // Bars are static: collect them and merge every fort's hardware into a
        // single mesh at the end rather than paying a draw call per banner.
        var S = STYLES[fort.style] || STYLES.viking;
        var bg = cylG(0.07, 0.07, w * 1.25, 6, S.metalM.tpm);
        place(bg, 0, 0, 0, 0, 0, Math.PI * 0.5);
        place(bg, x, y, z, 0, grp.rotation.y, 0);
        fort.barGeos.push(bg);
      }
      fort.dyn.add(grp);
      fort.banners.push(mesh);
      return mesh;
    } catch (e) {
      warn('banner', 'banner could not be built', e);
      return null;
    }
  }

  /* ---- brazier factory ----------------------------------------------------- */
  function makeBrazier(fort, S, x, y, z, idx) {
    try {
      var grp = new THREE.Group();
      grp.position.set(x, y, z);
      var list = [];
      var g, i;
      for (i = 0; i < 3; i++) {
        var a = (i / 3) * 6.2831853;
        g = cylG(0.07, 0.09, 1.1, 5, S.metalM.tpm);
        list.push(place(g, Math.cos(a) * 0.32, 0.55, Math.sin(a) * 0.32, Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22));
      }
      g = cylG(0.62, 0.36, 0.5, 10, S.metalM.tpm);
      list.push(place(g, 0, 1.32, 0));
      g = torusG(0.62, 0.07, 4, 12, S.metalM.tpm);
      list.push(place(g, 0, 1.56, 0, Math.PI * 0.5, 0, 0));
      var bowl = mkMesh(list, M(fort.style, 'metal'));
      if (bowl) { grp.add(bowl); }

      var coals = new THREE.Mesh(sphereG(0.5, 10, 6, 0, 6.2831853, 0, 1.4), M(fort.style, 'glow'));
      coals.position.y = 1.5;
      coals.scale.y = 0.4;
      coals.castShadow = false;
      grp.add(coals);

      // three nested cones, merged: one draw call, still reads as a live flame
      // because the whole body scales/leans on noise rather than each tongue.
      // Authored around a pivot at the flame ROOT (y = 1.4, sitting in the
      // bowl) so scaling it flickers the flame instead of sliding it.
      var flist = [];
      for (i = 0; i < 3; i++) {
        g = coneG(0.42 - i * 0.09, 1.5 - i * 0.32, 7, 0);
        flist.push(place(g, (i - 1) * 0.09, 0.75 - i * 0.2, (i === 1 ? 0.1 : -0.05)));
      }
      // per-brazier material clone so each fire flickers on its own clock
      var fmat = flameMat(fort.style).clone();
      fmat.userData = fmat.userData || {};
      fmat.userData.perFort = true;
      var flame = mkMesh(flist, fmat, false);
      var flames = [];
      if (flame) {
        flame.position.set(0, 1.4, 0);
        flame.renderOrder = 5;
        flame.receiveShadow = false;
        grp.add(flame);
        flames.push(flame);
      }

      fort.dyn.add(grp);
      fort.braziers.push({ grp: grp, flames: flames, coals: coals, phase: idx * 2.1, x: x, y: y, z: z });

      // one real light for the first two braziers on the best quality tier only
      if (idx < 2 && detail() >= 0.95) {
        try {
          var S2 = STYLES[fort.style] || STYLES.viking;
          var pl = new THREE.PointLight(col(S2.pal.glow), 1.5, 26, 2);
          pl.position.set(0, 2.2, 0);
          pl.castShadow = false;
          grp.add(pl);
          fort.brazierLights.push(pl);
        } catch (e2) { /* ignore */ }
      }
      return grp;
    } catch (e) {
      warn('brazier', 'brazier could not be built', e);
      return null;
    }
  }

  /* ---- siege engines ------------------------------------------------------- */
  function makeSiege(fort, S, x, y, z, kind) {
    try {
      var grp = new THREE.Group();
      grp.position.set(x, y, z);
      var list = [], g, i;
      // turntable + frame
      g = cylG(1.15, 1.25, 0.28, 10, S.trim.tpm); list.push(place(g, 0, 0.14, 0));
      for (i = 0; i < 4; i++) {
        g = boxG(0.24, 0.9, 0.24, S.trim.tpm);
        list.push(place(g, (i < 2 ? 1 : -1) * 0.62, 0.6, (i % 2 ? 1 : -1) * 0.62));
      }
      var base = mkMesh(list, M(fort.style, 'trim'));
      if (base) { grp.add(base); }

      var head = new THREE.Group();
      head.position.y = 1.05;
      list = [];
      if (kind === 'catapult') {
        g = boxG(2.6, 0.3, 1.5, S.trim.tpm); list.push(place(g, 0, 0.15, 0));
        g = boxG(0.26, 1.7, 0.26, S.trim.tpm); list.push(place(g, -0.5, 0.9, -0.6));
        g = boxG(0.26, 1.7, 0.26, S.trim.tpm); list.push(place(g, -0.5, 0.9, 0.6));
        g = boxG(0.3, 0.3, 1.5, S.trim.tpm); list.push(place(g, -0.5, 1.75, 0));
      } else {
        g = boxG(2.9, 0.28, 0.5, S.trim.tpm); list.push(place(g, 0.4, 0.14, 0));
        g = boxG(0.3, 0.5, 3.2, S.trim.tpm); list.push(place(g, 0.9, 0.42, 0, 0, 0, 0.06));
        g = cylG(0.09, 0.09, 3.0, 5, S.metalM.tpm); list.push(place(g, 0.62, 0.42, 0, Math.PI * 0.5, 0, 0));
        g = cylG(0.28, 0.28, 0.5, 8, S.metalM.tpm); list.push(place(g, -0.7, 0.42, 0, 0, 0, Math.PI * 0.5));
      }
      var frame = mkMesh(list, M(fort.style, 'trim'));
      if (frame) { head.add(frame); }

      var armGrp = new THREE.Group();
      if (kind === 'catapult') {
        var arm = new THREE.Mesh(boxG(0.3, 2.8, 0.3, S.trim.tpm), M(fort.style, 'trim'));
        arm.position.set(0, 1.4, 0);
        armGrp.add(arm);
        var bucket = new THREE.Mesh(cylG(0.42, 0.3, 0.42, 8, S.metalM.tpm), M(fort.style, 'metal'));
        bucket.position.set(0, 2.9, 0);
        armGrp.add(bucket);
        armGrp.position.set(-0.5, 0.2, 0);
        armGrp.rotation.z = -0.9;
      } else {
        list = [];
        list.push(place(cylG(0.09, 0.09, 2.6, 6, S.metalM.tpm), 0, 0, 0, 0, 0, Math.PI * 0.5));
        list.push(place(coneG(0.17, 0.5, 6, S.metalM.tpm), 1.55, 0, 0, 0, 0, -Math.PI * 0.5));
        var bolt = mkMesh(list, M(fort.style, 'metal'));
        if (bolt) { armGrp.add(bolt); }
        armGrp.position.set(0.3, 0.45, 0);
      }
      head.add(armGrp);
      grp.add(head);
      grp.castShadow = true;
      fort.dyn.add(grp);
      fort.siege.push({ grp: grp, head: head, arm: armGrp, kind: kind, phase: fort.siege.length * 1.9, recoil: 0 });
      return grp;
    } catch (e) {
      warn('siege', 'siege engine could not be built', e);
      return null;
    }
  }

  /* ---- crack decals -------------------------------------------------------- */
  function buildCracks(fort, S, T) {
    try {
      var list = [], g, i;
      var fx = L.frontX, wt = L.wallT;
      var rnd = mulberry(700 + fort.team * 11 + fort.tierIdx);
      // front wall face
      for (i = 0; i < 8; i++) {
        var z = -L.halfZ + 1.5 + rnd() * (L.halfZ * 2 - 3);
        if (Math.abs(z) < L.gateHalf + 0.8) { z += (z < 0 ? -3 : 3); }
        var s = 3.0 + rnd() * 3.5;
        g = planeG(s, s, 0);
        offsetUV(g, (i % 2) * 0.5, ((i / 2) | 0) % 2 * 0.5, 0.5);
        list.push(place(g, fx + 0.05, 1.6 + rnd() * (T.wallH - 3.0), z, 0, Math.PI * 0.5, rnd() * 6.28));
      }
      // camera-facing flank
      for (i = 0; i < 6; i++) {
        var x = L.backX + 2.5 + rnd() * (L.frontX - L.backX - 5);
        var s2 = 3.0 + rnd() * 3.5;
        g = planeG(s2, s2, 0);
        offsetUV(g, (i % 2) * 0.5, ((i / 2) | 0) % 2 * 0.5, 0.5);
        list.push(place(g, x, 1.6 + rnd() * (T.wallH - 3.0), -L.halfZ - 0.05, 0, Math.PI, rnd() * 6.28));
      }
      var merged = mergeList(list);
      if (!merged) { return; }
      var cm = crackMat().clone();
      cm.userData = cm.userData || {};
      cm.userData.perFort = true;      // safe to dispose with the fort
      var mesh = new THREE.Mesh(merged, cm);
      mesh.material.opacity = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 3;
      mesh.visible = false;
      fort.dyn.add(mesh);
      fort.cracks = mesh;
    } catch (e) {
      warn('cracks', 'crack decals could not be built', e);
    }
  }

  /** Remap a plane's 0..1 UVs into one quadrant of the 4-in-1 crack atlas. */
  function offsetUV(g, ox, oy, scale) {
    var uv = g.attributes && g.attributes.uv;
    if (!uv) { return g; }
    var a = uv.array, i;
    for (i = 0; i < a.length; i += 2) {
      a[i] = ox + a[i] * scale;
      a[i + 1] = oy + a[i + 1] * scale;
    }
    uv.needsUpdate = true;
    return g;
  }

  /* ==========================================================================
   * 10. FORT OBJECT + BUILD
   * ======================================================================== */

  var forts = { 1: null, '-1': null };
  var ready = false, inited = false, failed = false;
  var clock = 0;

  var T1WOOD = {
    tribal: 0x6d5334, greek: 0x8a7550, rome: 0x7d6440, viking: 0x4a3826,
    japan: 0x6b5539, industrial: 0x5f4a35, modern: 0x6a6350, future: 0x8d99a6
  };

  /** Tier 1 is a rough camp in every era — same kit, timber (or prefab) parts. */
  function tier1Style(baseKey) {
    var k = baseKey + '_t1';
    if (STYLES[k]) { return k; }
    var S = STYLES[baseKey] || STYLES.viking;
    var hiTech = (baseKey === 'future' || baseKey === 'modern' || baseKey === 'industrial');
    var wood = T1WOOD[baseKey] || 0x6d5334;
    STYLES[k] = {
      label: k,
      tower: hiTech ? 'square' : 'log',
      roof: hiTech ? 'flat' : 'cone',
      parapet: hiTech ? 'plate' : 'spike',
      keepShape: 'hut',
      batter: 0, gateArch: 'flat', sign: 'none',
      wall: hiTech ? S.wall2 : { d: drawLogs, o: { base: wood, logs: 7, seed: 201 }, rough: 0.95, metal: 0.0, tpm: 0.30, bump: 0.55 },
      wall2: hiTech ? S.wall2 : { d: drawWood, o: { base: shade(wood, 0.82), planks: 5, seed: 203 }, rough: 0.96, metal: 0.0, tpm: 0.34, bump: 0.45 },
      roofM: hiTech ? S.roofM : { d: drawThatch, o: { base: 0xb09258, seed: 205 }, rough: 0.99, metal: 0.0, tpm: 0.42, bump: 0.5 },
      trim: hiTech ? S.trim : { d: drawWood, o: { base: shade(wood, 1.22), planks: 3, seed: 207 }, rough: 0.9, metal: 0.03, tpm: 0.5, bump: 0.4 },
      metalM: S.metalM,
      pal: S.pal
    };
    return k;
  }

  function makeFort(team) {
    var root = new THREE.Group();
    root.name = 'AOW.Fort.' + team;
    root.position.set(FORT_X[team] - 3 * team, 0, 0);
    root.rotation.y = (team === 1) ? YAW : (Math.PI - YAW);

    var struct = new THREE.Group(); struct.name = 'struct';
    var dyn = new THREE.Group(); dyn.name = 'dyn';
    root.add(struct); root.add(dyn);

    var f = {
      team: team,
      root: root, struct: struct, dyn: dyn,
      built: false,
      tierIdx: 0, style: 'viking', styleBase: 'viking', era: null,
      regions: Object.create(null), regionList: [],

      /* dynamics */
      portcullis: null, portcullisY0: 0, portcullisLift: 4,
      gateLeaves: [], bridge: null, bridgeLen: 7.6, chains: [],
      banners: [], braziers: [], brazierLights: [], siege: [],
      shieldDome: null, hoverRings: [], radar: null, cracks: null,
      debris: [], stackTips: [], barGeos: [],

      /* particles */
      soft: null, add: null,

      /* state */
      damage: 0, dmgTarget: 0, stage: 0,
      gateT: 0, gateTarget: 0, gateOpen: false,
      collapsing: false, collapsed: false, collapseT: 0, bodies: [],
      upActive: false, upT: 0, upDur: 2.0, upItems: [],
      hitFlash: 0, shieldFlash: 0,
      firePoints: [], garrison: [],
      gateWorld: new THREE.Vector3(), outward: new THREE.Vector3(1, 0, 0), faceY: 0,
      gateHeight: 5, pierH: 10, murderY: 0,
      bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, top: 0 }
    };

    f.soft = makeParticles(190, false, 'fort.puff', drawPuff);
    f.add = makeParticles(120, true, 'fort.dot', drawSoftDot);
    if (f.soft) { root.add(f.soft.pts); }
    if (f.add) { root.add(f.add.pts); }

    return f;
  }

  function disposeGroup(g) {
    if (!g) { return; }
    var kids = g.children.slice();
    var i;
    for (i = 0; i < kids.length; i++) {
      var o = kids[i];
      g.remove(o);
      try {
        o.traverse(function (n) {
          if (n.geometry && n.geometry.dispose) { n.geometry.dispose(); }
          // materials are shared out of matCache — never disposed here, EXCEPT
          // per-fort clones we explicitly tagged.
          if (n.material && n.material.userData && n.material.userData.perFort && n.material.dispose) {
            n.material.dispose();
          }
        });
      } catch (e) { /* ignore */ }
    }
  }

  function clearFort(fort) {
    disposeGroup(fort.struct);
    disposeGroup(fort.dyn);
    fort.regions = Object.create(null);
    fort.regionList.length = 0;
    fort.gateLeaves.length = 0;
    fort.banners.length = 0;
    fort.braziers.length = 0;
    fort.brazierLights.length = 0;
    fort.siege.length = 0;
    fort.hoverRings.length = 0;
    fort.chains.length = 0;
    fort.bodies.length = 0;
    fort.upItems.length = 0;
    fort.debris.length = 0;
    fort.stackTips.length = 0;
    fort.barGeos.length = 0;
    fort.firePoints.length = 0;
    fort.portcullis = null; fort.bridge = null; fort.shieldDome = null;
    fort.radar = null; fort.cracks = null;
    fort.collapsing = false; fort.collapsed = false; fort.collapseT = 0;
    fort.upActive = false; fort.upT = 0;
    fort.stage = 0;
    fort.struct.visible = true;
    fort.dyn.visible = true;
  }

  function buildStructure(fort) {
    var S = STYLES[fort.style] || STYLES.viking;
    var T = TIER[fort.tierIdx];
    var tierIdx = fort.tierIdx;
    var rnd = mulberry(9000 + fort.team * 137 + tierIdx * 29 + (fort.style.length * 7));
    var wallZc = (L.halfZ + L.gateHalf) * 0.5;
    var tr = T.towerR;

    region(fort, 'base', (L.frontX + L.backX) * 0.5, 0, 0, 'sink');
    region(fort, 'wallN', L.frontX - L.wallT * 0.5, 0, -wallZc, 'fall');
    region(fort, 'wallP', L.frontX - L.wallT * 0.5, 0, wallZc, 'fall');
    region(fort, 'sideN', (L.frontX + L.backX) * 0.5, 0, -(L.halfZ - L.wallT * 0.5), 'fall');
    region(fort, 'sideP', (L.frontX + L.backX) * 0.5, 0, (L.halfZ - L.wallT * 0.5), 'fall');
    region(fort, 'back', L.backX + L.wallT * 0.5, 0, 0, 'fall');
    region(fort, 'gate', L.frontX - L.wallT * 0.5, 0, 0, 'fall');
    region(fort, 'towerFN', L.frontX - tr, 0, -(L.halfZ - tr), 'topple');
    region(fort, 'towerFP', L.frontX - tr, 0, (L.halfZ - tr), 'topple');
    region(fort, 'towerBN', L.backX + tr, 0, -(L.halfZ - tr), 'topple');
    region(fort, 'towerBP', L.backX + tr, 0, (L.halfZ - tr), 'topple');
    region(fort, 'keep', -3.0, 0, 0, 'crush');
    region(fort, 'props', L.frontX + 3, 0, 0, 'fall');

    foundation(fort, S, T, rnd);

    var slits = tierIdx >= 1;
    var walk = T.walk;
    // front curtain, split either side of the gate
    curtainWall(fort, S, T, 'wallN', 'z', -L.halfZ, -L.gateHalf, L.frontX - L.wallT * 0.5,
      L.wallT, T.wallH, 1, { walk: walk, slits: slits });
    curtainWall(fort, S, T, 'wallP', 'z', L.gateHalf, L.halfZ, L.frontX - L.wallT * 0.5,
      L.wallT, T.wallH, 1, { walk: walk, slits: slits });
    // flanks
    curtainWall(fort, S, T, 'sideN', 'x', L.backX, L.frontX - L.wallT, -(L.halfZ - L.wallT * 0.5),
      L.wallT, T.wallH * 0.94, -1, { walk: walk, slits: slits });
    curtainWall(fort, S, T, 'sideP', 'x', L.backX, L.frontX - L.wallT, (L.halfZ - L.wallT * 0.5),
      L.wallT, T.wallH * 0.94, 1, { walk: walk, slits: slits });
    // rear
    curtainWall(fort, S, T, 'back', 'z', -(L.halfZ - L.wallT), (L.halfZ - L.wallT), L.backX + L.wallT * 0.5,
      L.wallT, T.wallH * 0.86, -1, { walk: walk, slits: false });

    gatehouse(fort, S, T, tierIdx);

    // towers — the two front ones always, the rear pair from tier 2
    tower(fort, S, T, 'towerFN', L.frontX - tr, -(L.halfZ - tr), T.towerH, tr, 1, { roof: T.roofs });
    tower(fort, S, T, 'towerFP', L.frontX - tr, (L.halfZ - tr), T.towerH, tr, 1, { roof: T.roofs });
    if (tierIdx >= 1) {
      tower(fort, S, T, 'towerBN', L.backX + tr, -(L.halfZ - tr), T.towerH * 0.86, tr * 0.92, -1, { roof: T.roofs });
      tower(fort, S, T, 'towerBP', L.backX + tr, (L.halfZ - tr), T.towerH * 0.86, tr * 0.92, -1, { roof: T.roofs });
    }

    if (T.keep) { keep(fort, S, T, tierIdx, rnd); }
    if (T.walk) { stairs(fort, S, T, L.frontX - L.wallT - 2.6, -6.0, -1, T.wallH - L.courtY); }

    // tier 5 adds an outer ring wall — the citadel silhouette
    if (T.ring) {
      var rz = L.halfZ + 3.2;
      curtainWall(fort, S, T, 'props', 'z', -6.0, 6.0, L.frontX + 4.6, 1.5, T.wallH * 0.5, 1,
        { walk: false, slits: true });
      curtainWall(fort, S, T, 'sideN', 'x', L.backX - 1.5, L.frontX + 4.6, -rz, 1.4, T.wallH * 0.42, -1,
        { walk: false, slits: false });
      curtainWall(fort, S, T, 'sideP', 'x', L.backX - 1.5, L.frontX + 4.6, rz, 1.4, T.wallH * 0.42, 1,
        { walk: false, slits: false });
    }

    signatureProps(fort, S, T, tierIdx, rnd);
    flushRegions(fort);

    // fire anchors used by the damage system
    fort.firePoints.push([L.frontX - L.wallT * 0.5, T.wallH + 0.6, -6.5]);
    fort.firePoints.push([L.frontX - L.wallT * 0.5, T.wallH + 0.6, 6.5]);
    fort.firePoints.push([L.frontX - tr, T.towerH + 0.8, -(L.halfZ - tr)]);
    fort.firePoints.push([-3.0, L.courtY + Math.max(3, T.keepH * 0.85), 0]);
    fort.firePoints.push([L.frontX - L.wallT * 0.5, fort.pierH || T.wallH, 0]);

    fort.bounds.minX = L.backX - 2; fort.bounds.maxX = L.frontX + 8;
    fort.bounds.minZ = -L.halfZ - 2; fort.bounds.maxZ = L.halfZ + 2;
    fort.bounds.top = Math.max(T.towerH, T.keepH) + 4;
  }

  /* ---- pre-made debris chunks used by the collapse -------------------------- */
  function buildDebris(fort, S) {
    var i, n = Math.max(6, Math.round(14 * detail()));
    var mat = M(fort.style, 'wall');
    for (i = 0; i < n; i++) {
      var s = 0.6 + (i % 4) * 0.35;
      var m = new THREE.Mesh(prismG(s * 0.7, s * 1.15, s * (0.7 + (i % 3) * 0.3), S.wall.tpm), mat);
      m.visible = false;
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.isDebris = true;
      fort.dyn.add(m);
      fort.debris.push({ mesh: m, vx: 0, vy: 0, vz: 0, ax: 0, ay: 1, az: 0, spin: 0, life: 0, rest: 0 });
    }
  }

  function throwDebris(fort, x, y, z, count, power) {
    var i, thrown = 0;
    for (i = 0; i < fort.debris.length && thrown < count; i++) {
      var d = fort.debris[i];
      if (d.life > 0) { continue; }
      var a = Math.random() * 6.2831853;
      d.mesh.visible = true;
      d.mesh.position.set(x, y, z);
      d.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      d.vx = Math.cos(a) * power * (0.5 + Math.random());
      d.vy = power * (0.6 + Math.random() * 0.9);
      d.vz = Math.sin(a) * power * (0.5 + Math.random());
      _v1.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      if (_v1.lengthSq() < 0.001) { _v1.set(0, 1, 0); }
      _v1.normalize();
      d.ax = _v1.x; d.ay = _v1.y; d.az = _v1.z;
      d.spin = 3 + Math.random() * 7;
      d.life = 5 + Math.random() * 3;
      d.rest = 0.25 + Math.random() * 0.3;
      thrown++;
    }
  }

  /* ---- garrison anchors ---------------------------------------------------- */
  function computeGarrison(fort) {
    var T = TIER[fort.tierIdx];
    var slots = fort.garrison;
    slots.length = 0;
    var walkY = T.wallH + 0.42;
    var tr = T.towerR;
    var innerX = L.frontX - L.wallT - 1.3;
    var i, n;

    function push(type, lx, ly, lz, outward) {
      slots.push({
        type: type, index: slots.length, team: fort.team,
        x: 0, y: 0, z: 0, lx: lx, ly: ly, lz: lz,
        ry: 0, outward: outward === undefined ? 1 : outward,
        occupied: false, unit: null
      });
    }

    // front curtain archers, both sides of the gate
    n = Math.max(2, Math.round(4 * detail()) + 2);
    for (i = 0; i < n; i++) {
      var z = -L.halfZ + 1.6 + (i / (n - 1)) * (L.halfZ - L.gateHalf - 3.2);
      push('archer', innerX, walkY, z, 1);
      push('archer', innerX, walkY, -z, 1);
    }
    // flank walk (camera side first so defenders read on screen)
    n = Math.max(2, Math.round(3 * detail()) + 1);
    for (i = 0; i < n; i++) {
      var x = L.backX + 2.4 + (i / (n - 1)) * (L.frontX - L.backX - 6.5);
      push('archer', x, T.wallH * 0.94 + 0.42, -(L.halfZ - L.wallT - 1.3), 0);
      push('archer', x, T.wallH * 0.94 + 0.42, (L.halfZ - L.wallT - 1.3), 0);
    }
    // tower platforms
    push('tower', L.frontX - tr, T.towerH + 0.7, -(L.halfZ - tr), 1);
    push('tower', L.frontX - tr, T.towerH + 0.7, (L.halfZ - tr), 1);
    if (fort.tierIdx >= 1) {
      push('tower', L.backX + tr, T.towerH * 0.86 + 0.7, -(L.halfZ - tr), 1);
      push('tower', L.backX + tr, T.towerH * 0.86 + 0.7, (L.halfZ - tr), 1);
    }
    // gatehouse top
    push('archer', L.frontX - L.wallT * 0.5, (fort.pierH || T.wallH) + 0.42, -1.9, 1);
    push('archer', L.frontX - L.wallT * 0.5, (fort.pierH || T.wallH) + 0.42, 1.9, 1);
    // boiling-oil murder holes
    if (fort.tierIdx >= 3 && fort.murderY) {
      push('oil', L.frontX + 0.4, fort.murderY + 1.0, -1.4, 1);
      push('oil', L.frontX + 0.4, fort.murderY + 1.0, 1.4, 1);
    }
    // siege crews
    for (i = 0; i < fort.siege.length; i++) {
      var sg = fort.siege[i].grp;
      push('siege', sg.position.x - 1.4, sg.position.y, sg.position.z, 1);
    }
    // sortie point in the gate mouth
    push('gate', L.frontX + 2.0, L.courtY, 0, 1);

    // bake to world space
    fort.root.updateMatrixWorld(true);
    fort.outward.set(1, 0, 0).applyQuaternion(fort.root.quaternion);
    fort.faceY = Math.atan2(fort.outward.x, fort.outward.z);
    var sideY = Math.atan2(-fort.outward.z, fort.outward.x) + Math.PI;
    for (i = 0; i < slots.length; i++) {
      var s = slots[i];
      _v1.set(s.lx, s.ly, s.lz);
      fort.root.localToWorld(_v1);
      s.x = _v1.x; s.y = _v1.y; s.z = _v1.z;
      s.ry = s.outward ? fort.faceY : sideY;
    }

    // gate mouth in world space
    _v1.set(L.frontX + 0.6, L.courtY + 0.1, 0);
    fort.root.localToWorld(_v1);
    fort.gateWorld.copy(_v1);
  }

  /* ---- the public build ---------------------------------------------------- */
  function build(team, tier, era) {
    if (failed) { return null; }
    team = (team < 0) ? -1 : 1;
    var fort = forts[team];
    if (!fort) {
      warn('build:noinit', 'build() called before init() — call AOW.Forts.init() first.');
      return null;
    }
    var tierIdx = normTierSmart(tier);
    var baseStyle = resolveStyle(era);
    var styleKey = (tierIdx === 0) ? tier1Style(baseStyle) : baseStyle;

    var wasBuilt = fort.built;
    var isUpgrade = wasBuilt && (tierIdx > fort.tierIdx || baseStyle !== fort.styleBase);

    try {
      clearFort(fort);
      fort.tierIdx = tierIdx;
      fort.style = styleKey;
      fort.styleBase = baseStyle;
      fort.era = era;
      fort.damage = 0; fort.dmgTarget = 0; fort.stage = 0;
      fort.gateT = 0; fort.gateTarget = 0; fort.gateOpen = false;

      var S = STYLES[styleKey];
      buildStructure(fort);
      buildDynamics(fort, S, TIER[tierIdx], tierIdx, mulberry(fort.team * 71 + tierIdx));
      buildDebris(fort, S);
      computeGarrison(fort);
      applyGate(fort, true);
      applyStage(fort, 0, true);
      fort.built = true;

      if (isUpgrade) { startUpgrade(fort); }

      busEmit('fort:built', { team: team, tier: tierIdx + 1, era: baseStyle });
      if (isUpgrade) {
        busEmit('fort:upgrade', { team: team, tier: tierIdx + 1, era: baseStyle });
        busEmit('audio:sfx', { id: 'fort_upgrade', team: team, x: fort.root.position.x, y: 4, z: 0, gain: 0.9 });
        busEmit('camera:shake', { amount: 0.35 });
      }
      return fort;
    } catch (e) {
      warn('build:fail', 'fort build failed for team ' + team + ' — leaving the previous castle in place.', e);
      return fort;
    }
  }

  /* ==========================================================================
   * 11. UPGRADE ANIMATION
   * ======================================================================== */

  var UPGRADE_ORDER = ['base', 'gate', 'wallN', 'wallP', 'towerFN', 'towerFP',
    'sideN', 'sideP', 'back', 'towerBN', 'towerBP', 'keep', 'props'];

  function startUpgrade(fort) {
    fort.upItems.length = 0;
    fort.upActive = true;
    fort.upT = 0;
    fort.upDur = 2.35;
    var i, k, r;
    for (i = 0; i < UPGRADE_ORDER.length; i++) {
      k = UPGRADE_ORDER[i];
      r = fort.regions[k];
      if (!r || !r.group.children.length) { continue; }
      fort.upItems.push({
        obj: r.group, y1: r.group.position.y, drop: 5 + i * 0.4,
        delay: 0.06 + i * 0.085, dur: 0.72, done: false, started: false,
        dx: r.px, dz: r.pz
      });
    }
    // dynamics fade/pop in behind the masonry
    var dynDelay = 0.9;
    for (i = 0; i < fort.dyn.children.length; i++) {
      var o = fort.dyn.children[i];
      if (o === fort.cracks) { continue; }
      fort.upItems.push({
        obj: o, y1: o.position.y, drop: 0, scale: true,
        delay: dynDelay + (i % 6) * 0.05, dur: 0.5, done: false, started: false,
        dx: o.position.x, dz: o.position.z
      });
    }
    // pre-set everything to its "not yet risen" pose
    for (i = 0; i < fort.upItems.length; i++) {
      var it = fort.upItems[i];
      if (it.scale) { it.obj.scale.set(0.001, 0.001, 0.001); }
      else { it.obj.position.y = it.y1 - it.drop; it.obj.scale.y = 0.08; }
    }
  }

  function updateUpgrade(fort, dt) {
    if (!fort.upActive) { return; }
    fort.upT += dt;
    var i, all = true;
    for (i = 0; i < fort.upItems.length; i++) {
      var it = fort.upItems[i];
      if (it.done) { continue; }
      var t = (fort.upT - it.delay) / it.dur;
      if (t < 0) { all = false; continue; }
      if (!it.started) {
        it.started = true;
        if (!it.scale) {
          puffDust(fort, it.dx, 0.3, it.dz, 9, 2.6, 1.2);
          busEmit('audio:sfx', { id: 'fort_piece', team: fort.team, x: fort.root.position.x, y: 2, z: 0, gain: 0.4 });
        }
      }
      if (t >= 1) {
        it.done = true;
        if (it.scale) { it.obj.scale.set(1, 1, 1); }
        else { it.obj.position.y = it.y1; it.obj.scale.y = 1; }
        continue;
      }
      all = false;
      if (it.scale) {
        var s = easeOutBack(t);
        it.obj.scale.set(s, s, s);
      } else {
        var e = easeOutBack(t);
        it.obj.position.y = it.y1 - it.drop * (1 - e);
        it.obj.scale.y = 0.08 + 0.92 * easeOutCubic(Math.min(1, t * 1.5));
      }
    }
    if (all || fort.upT > fort.upDur + 1.6) {
      fort.upActive = false;
      for (i = 0; i < fort.upItems.length; i++) {
        var o = fort.upItems[i];
        o.obj.scale.set(1, 1, 1);
        o.obj.position.y = o.y1;
      }
      fort.upItems.length = 0;
    }
  }

  /* ==========================================================================
   * 12. DAMAGE
   * ======================================================================== */

  var STAGE_AT = [0.30, 0.56, 0.79];

  function stageFor(d) {
    if (d >= STAGE_AT[2]) { return 3; }
    if (d >= STAGE_AT[1]) { return 2; }
    if (d >= STAGE_AT[0]) { return 1; }
    return 0;
  }

  function applyStage(fort, stage, silent) {
    var prev = fort.stage;
    fort.stage = stage;
    var i, j, r;
    for (i = 0; i < fort.regionList.length; i++) {
      r = fort.regionList[i];
      for (j = 0; j < r.meshes.length; j++) { applyMeshStage(r.meshes[j], stage); }
    }
    // banners tear progressively
    for (i = 0; i < fort.banners.length; i++) {
      var b = fort.banners[i];
      if (stage >= 1) {
        var tm = tearMap(Math.min(3, stage));
        if (tm && b.material) {
          if (b.material.userData && b.material.userData.perFort) {
            b.material.alphaMap = tm;
            b.material.transparent = true;
            b.material.alphaTest = 0.45;
            b.material.needsUpdate = true;
          } else if (b.material.clone) {
            var nm = b.material.clone();
            nm.userData = nm.userData || {};
            nm.userData.perFort = true;
            nm.alphaMap = tm;
            nm.transparent = true;
            nm.alphaTest = 0.45;
            nm.needsUpdate = true;
            b.material = nm;
          }
        }
      } else if (b.material && b.material.alphaMap && b.material.userData && b.material.userData.perFort) {
        // repaired back below the first threshold — mend the cloth
        b.material.alphaMap = null;
        b.material.transparent = false;
        b.material.alphaTest = 0;
        b.material.needsUpdate = true;
      }
    }
    if (!silent && stage > prev) {
      // something visibly comes off the castle
      var T = TIER[fort.tierIdx];
      var px = L.frontX - 1.0;
      var pz = (Math.random() - 0.5) * L.halfZ * 1.4;
      var py = T.wallH + 0.5;
      throwDebris(fort, px, py, pz, 3 + stage, 5 + stage * 2);
      puffDust(fort, px, py, pz, 16, 3.2, 1.6);
      busEmit('camera:shake', { amount: 0.22 + stage * 0.12 });
      busEmit('audio:sfx', { id: 'fort_crumble', team: fort.team, x: fort.root.position.x, y: py, z: pz, gain: 0.7 });
    }
  }

  function setDamage(team, frac) {
    team = (team < 0) ? -1 : 1;
    var fort = forts[team];
    if (!fort || !fort.built) { return; }
    var f = Number(frac);
    if (!isFinite(f)) { return; }
    fort.dmgTarget = clamp01(f);
  }

  function updateDamage(fort, dt) {
    if (Math.abs(fort.damage - fort.dmgTarget) > 0.0005) {
      fort.damage = damp(fort.damage, fort.dmgTarget, 5.0, dt);
    } else {
      fort.damage = fort.dmgTarget;
    }
    var st = stageFor(fort.damage);
    if (st !== fort.stage && !fort.collapsing) { applyStage(fort, st, false); }

    // cracks grow with damage
    if (fort.cracks && fort.cracks.material) {
      var o = clamp01((fort.damage - 0.04) / 0.62) * 0.96;
      fort.cracks.visible = o > 0.01;
      fort.cracks.material.opacity = o;
    }

    // smoke and fire — grow as the castle falls apart
    if (fort.damage > 0.16 && fort.firePoints.length) {
      fort.smokeAcc = (fort.smokeAcc || 0) + dt * (fort.damage * 7 + 1) * detail();
      while (fort.smokeAcc >= 1) {
        fort.smokeAcc -= 1;
        var p = fort.firePoints[(Math.random() * Math.min(fort.firePoints.length,
          1 + Math.floor(fort.damage * fort.firePoints.length))) | 0];
        if (p) { puffSmoke(fort, p[0], p[1], p[2], 1, fort.damage > 0.5); }
      }
    }
    if (fort.damage > 0.40 && fort.firePoints.length) {
      fort.fireAcc = (fort.fireAcc || 0) + dt * (fort.damage - 0.3) * 26 * detail();
      while (fort.fireAcc >= 1) {
        fort.fireAcc -= 1;
        var p2 = fort.firePoints[(Math.random() * Math.min(fort.firePoints.length,
          1 + Math.floor(fort.damage * fort.firePoints.length))) | 0];
        if (p2) { puffFire(fort, p2[0], p2[1], p2[2], 1); }
      }
    }
    // industrial smokestacks always smoke
    if (fort.stackTips.length) {
      fort.stackAcc = (fort.stackAcc || 0) + dt * 6 * detail();
      while (fort.stackAcc >= 1) {
        fort.stackAcc -= 1;
        var sp = fort.stackTips[(Math.random() * fort.stackTips.length) | 0];
        if (sp) { puffSmoke(fort, sp.x, sp.y, sp.z, 1, true); }
      }
    }
  }

  /** Localised feedback for a single hit on the wall. */
  function fortHit(fort, dmg) {
    if (!fort.built || fort.collapsing) { return; }
    var T = TIER[fort.tierIdx];
    var z = (Math.random() - 0.5) * (L.halfZ * 1.6);
    var y = 1.5 + Math.random() * Math.max(1, T.wallH - 2);
    puffDust(fort, L.frontX + 0.4, y, z, 5, 1.4, 0.8);
    if (dmg > 24) { throwDebris(fort, L.frontX + 0.3, y, z, 1, 3.5); }
    fort.hitFlash = 1;
    if (fort.shieldDome) { fort.shieldFlash = 1; }
  }

  /* ==========================================================================
   * 13. COLLAPSE
   * ======================================================================== */

  var COLLAPSE_DELAY = {
    gate: 0.0, props: 0.15, wallN: 0.30, wallP: 0.42,
    towerFN: 0.62, towerFP: 0.85, sideN: 1.05, sideP: 1.20,
    keep: 1.45, back: 1.75, towerBN: 1.95, towerBP: 2.10, base: 2.6
  };

  function collapse(team) {
    team = (team < 0) ? -1 : 1;
    var fort = forts[team];
    if (!fort || !fort.built || fort.collapsing) { return; }
    fort.collapsing = true;
    fort.collapseT = 0;
    fort.dmgTarget = 1;
    fort.damage = Math.max(fort.damage, 0.85);
    applyStage(fort, 3, true);
    fort.bodies.length = 0;

    var i, r;
    for (i = 0; i < fort.regionList.length; i++) {
      r = fort.regionList[i];
      if (!r.group.children.length) { continue; }
      var delay = COLLAPSE_DELAY[r.name];
      if (delay === undefined) { delay = 1.0; }
      var outSign = (r.pz < -0.5) ? -1 : ((r.pz > 0.5) ? 1 : 0);
      var body = {
        obj: r.group, kind: r.kind, name: r.name,
        delay: delay, t: 0, started: false, settled: false,
        y0: r.group.position.y,
        vx: 0, vy: 0, vz: 0,
        ang: 0, angVel: 0, angMax: 1.25 + Math.random() * 0.4,
        ax: 0, ay: 0, az: 0,
        spin: 0, bounces: 0, rest: -0.35 - Math.random() * 0.3,
        px: r.px, pz: r.pz, sink: 0, hit: false
      };
      if (r.kind === 'topple') {
        // fall outward, away from the keep — pivoting on the base of the tower
        var dirX = (r.px > 0) ? 1 : -1;
        var lenXZ = Math.sqrt(r.px * r.px + r.pz * r.pz) || 1;
        // rotation axis is horizontal and perpendicular to the fall direction
        var fxn = (r.px / lenXZ) * 0.75 + dirX * 0.25;
        var fzn = (r.pz / lenXZ);
        var an = Math.sqrt(fxn * fxn + fzn * fzn) || 1;
        body.ax = -fzn / an; body.ay = 0; body.az = fxn / an;
        body.angVel = 0.25 + Math.random() * 0.2;
        body.torque = 1.5 + Math.random() * 0.8;
      } else if (r.kind === 'fall') {
        body.vy = -0.4 - Math.random() * 0.8;
        body.vx = (r.px > 0 ? 1 : -1) * (0.4 + Math.random() * 1.1);
        body.vz = outSign * (0.3 + Math.random() * 0.9);
        _v1.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.3, Math.random() - 0.5).normalize();
        body.ax = _v1.x; body.ay = _v1.y; body.az = _v1.z;
        body.spin = 0.6 + Math.random() * 1.3;
      } else if (r.kind === 'crush') {
        body.vy = -1.0;
        body.spin = 0.18;
        _v1.set(0.3, 0.2, 0.9).normalize();
        body.ax = _v1.x; body.ay = _v1.y; body.az = _v1.z;
      } else {
        body.vy = -0.25;
      }
      fort.bodies.push(body);
    }

    // dynamics fall too — banners, braziers, siege engines, portcullis
    var dyn = fort.dyn.children;
    for (i = 0; i < dyn.length; i++) {
      var o = dyn[i];
      if (o === fort.cracks || o === fort.shieldDome) { continue; }
      if (o.userData && o.userData.isDebris) { continue; }
      _v1.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      if (_v1.lengthSq() < 0.0001) { _v1.set(0, 1, 0); }
      _v1.normalize();
      fort.bodies.push({
        obj: o, kind: 'fall', name: 'dyn', delay: 0.1 + Math.random() * 1.6, t: 0,
        started: false, settled: false, y0: o.position.y,
        vx: (Math.random() - 0.5) * 2.4, vy: 0.8 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 2.4,
        ang: 0, angVel: 0, angMax: 0, ax: _v1.x, ay: _v1.y, az: _v1.z,
        spin: 1.5 + Math.random() * 4, bounces: 0, rest: 0.15 + Math.random() * 0.4,
        px: o.position.x, pz: o.position.z, sink: 0, hit: false
      });
    }

    // the opening beat: dust ring, big shake, debris storm
    puffDust(fort, (L.frontX + L.backX) * 0.5, 0.4, 0, 46, 9, 1.4);
    throwDebris(fort, L.frontX - 1, TIER[fort.tierIdx].wallH, 0, 99, 9);
    busEmit('camera:shake', { amount: 0.95 });
    busEmit('audio:sfx', { id: 'fort_collapse', team: team, x: fort.root.position.x, y: 6, z: 0, gain: 1.0 });
    if (fort.shieldDome) { fort.shieldFlash = 1.6; }
  }

  var GRAV = 16.5;

  function updateCollapse(fort, dt) {
    if (!fort.collapsing) { return; }
    fort.collapseT += dt;
    var i, allDone = true;
    for (i = 0; i < fort.bodies.length; i++) {
      var b = fort.bodies[i];
      if (b.settled) { continue; }
      allDone = false;
      if (fort.collapseT < b.delay) { continue; }
      if (!b.started) {
        b.started = true;
        puffDust(fort, b.px, 0.4, b.pz, 14, 3.4, 1.1);
        busEmit('camera:shake', { amount: 0.18 });
      }
      var o = b.obj;

      if (b.kind === 'topple') {
        b.angVel += (b.torque || 1.6) * dt;
        b.ang += b.angVel * dt;
        if (b.ang >= b.angMax) {
          b.ang = b.angMax;
          if (!b.hit) {
            b.hit = true;
            puffDust(fort, b.px + b.ax * 4, 0.3, b.pz + b.az * 4, 26, 6, 1.3);
            throwDebris(fort, b.px, 2, b.pz, 4, 6);
            busEmit('camera:shake', { amount: 0.5 });
            busEmit('audio:sfx', { id: 'fort_impact', team: fort.team, x: fort.root.position.x, y: 2, z: b.pz, gain: 0.85 });
          }
          b.sink += dt * 0.5;
          o.position.y = b.y0 - Math.min(0.8, b.sink);
          if (b.sink > 0.9) { b.settled = true; }
        }
        _v1.set(b.ax, b.ay, b.az);
        if (_v1.lengthSq() < 0.0001) { _v1.set(0, 0, 1); }
        _q1.setFromAxisAngle(_v1.normalize(), b.ang);
        o.quaternion.copy(_q1);
      } else if (b.kind === 'crush') {
        b.vy -= GRAV * 0.25 * dt;
        o.position.y += b.vy * dt;
        o.scale.y = Math.max(0.18, o.scale.y - dt * 0.42);
        o.rotation.z += b.spin * dt * 0.3;
        if (o.position.y <= b.rest) {
          o.position.y = b.rest;
          if (!b.hit) {
            b.hit = true;
            puffDust(fort, b.px, 0.4, b.pz, 34, 7.5, 1.5);
            busEmit('camera:shake', { amount: 0.55 });
          }
          if (o.scale.y <= 0.2) { b.settled = true; }
        }
      } else if (b.kind === 'sink') {
        b.sink += dt * 0.35;
        o.position.y = b.y0 - Math.min(0.55, b.sink);
        if (b.sink > 0.7) { b.settled = true; }
      } else {
        b.vy -= GRAV * dt;
        o.position.x += b.vx * dt;
        o.position.y += b.vy * dt;
        o.position.z += b.vz * dt;
        if (b.spin) {
          _v1.set(b.ax, b.ay, b.az);
          if (_v1.lengthSq() < 0.0001) { _v1.set(0, 1, 0); }
          _q1.setFromAxisAngle(_v1.normalize(), b.spin * dt);
          o.quaternion.premultiply(_q1);
        }
        if (o.position.y <= b.rest) {
          o.position.y = b.rest;
          b.bounces++;
          if (b.bounces === 1) {
            puffDust(fort, o.position.x, 0.3, o.position.z, 12, 3.4, 1.0);
            busEmit('camera:shake', { amount: 0.2 });
          }
          if (Math.abs(b.vy) < 2.2 || b.bounces > 2) {
            b.settled = true;
            b.vx = b.vy = b.vz = 0; b.spin = 0;
          } else {
            b.vy = -b.vy * 0.26;
            b.vx *= 0.5; b.vz *= 0.5; b.spin *= 0.45;
          }
        }
      }
    }
    if (allDone && !fort.collapsed) {
      fort.collapsed = true;
      busEmit('fort:collapsed', { team: fort.team });
      puffDust(fort, (L.frontX + L.backX) * 0.5, 0.5, 0, 30, 11, 0.6);
    }
  }

  function updateDebris(fort, dt) {
    var i, n = fort.debris.length;
    for (i = 0; i < n; i++) {
      var d = fort.debris[i];
      if (d.life <= 0) { continue; }
      d.life -= dt;
      if (d.life <= 0) { d.mesh.visible = false; continue; }
      d.vy -= GRAV * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      if (d.spin) {
        _v1.set(d.ax, d.ay, d.az);
        if (_v1.lengthSq() < 0.0001) { _v1.set(0, 1, 0); }
        _q1.setFromAxisAngle(_v1.normalize(), d.spin * dt);
        d.mesh.quaternion.premultiply(_q1);
      }
      if (d.mesh.position.y <= d.rest) {
        d.mesh.position.y = d.rest;
        if (Math.abs(d.vy) > 2.5) {
          d.vy = -d.vy * 0.3;
          d.vx *= 0.55; d.vz *= 0.55; d.spin *= 0.4;
          puffDust(fort, d.mesh.position.x, 0.2, d.mesh.position.z, 2, 1.0, 0.5);
        } else {
          d.vy = 0; d.vx *= 0.7; d.vz *= 0.7; d.spin *= 0.5;
        }
      }
    }
  }

  /* ==========================================================================
   * 14. GATE
   * ======================================================================== */

  function openGate(team, open) {
    team = (team < 0) ? -1 : 1;
    var fort = forts[team];
    if (!fort || !fort.built) { return; }
    var want = (open === undefined) ? true : !!open;
    if (fort.gateOpen === want) { return; }
    fort.gateOpen = want;
    fort.gateTarget = want ? 1 : 0;
    busEmit('fort:gate', { team: team, open: want });
    busEmit('audio:sfx', { id: want ? 'gate_open' : 'gate_close', team: team,
      x: fort.gateWorld.x, y: fort.gateWorld.y, z: fort.gateWorld.z, gain: 0.7 });
  }

  function applyGate(fort, immediate) {
    if (immediate) { fort.gateT = fort.gateTarget; }
    var t = fort.gateT;
    if (fort.portcullis) {
      fort.portcullis.position.y = fort.portcullisY0 + fort.portcullisLift * t;
    }
    var i;
    for (i = 0; i < fort.gateLeaves.length; i++) {
      var lf = fort.gateLeaves[i];
      lf.rotation.y = lf.userData.sign * t * 1.35;
    }
    if (fort.bridge) {
      fort.bridge.rotation.z = (1 - t) * Math.PI * 0.5;
      // re-aim the lifting chains
      var rz = fort.bridge.rotation.z;
      var tipX = fort.bridge.position.x + Math.cos(rz) * (fort.bridgeLen * 0.86);
      var tipY = fort.bridge.position.y + Math.sin(rz) * (fort.bridgeLen * 0.86);
      for (i = 0; i < fort.chains.length; i++) {
        var ch = fort.chains[i];
        _v1.set(tipX, tipY, ch.tipZ);
        _v2.copy(ch.anchor);
        _v3.subVectors(_v2, _v1);
        var len = _v3.length();
        if (len < 0.05) { ch.mesh.visible = false; continue; }
        ch.mesh.visible = true;
        ch.mesh.position.copy(_v1).addScaledVector(_v3, 0.5);
        ch.mesh.scale.set(1, len, 1);
        _v3.normalize();
        _q1.setFromUnitVectors(_axis.set(0, 1, 0), _v3);
        ch.mesh.quaternion.copy(_q1);
      }
    }
  }

  function updateGate(fort, dt) {
    if (Math.abs(fort.gateT - fort.gateTarget) < 0.0008) {
      if (fort.gateT !== fort.gateTarget) { fort.gateT = fort.gateTarget; applyGate(fort, false); }
      return;
    }
    fort.gateT = damp(fort.gateT, fort.gateTarget, 3.4, dt);
    applyGate(fort, false);
  }

  function getGateWorldPos(team, out) {
    team = (team < 0) ? -1 : 1;
    var fort = forts[team];
    out = out || new THREE.Vector3();
    if (!fort) {
      out.set((FORT_X[team] || 0) + 10 * team, 0.5, 0);
      return out;
    }
    out.copy(fort.gateWorld);
    return out;
  }

  function getGarrisonSlots(team) {
    team = (team < 0) ? -1 : 1;
    var fort = forts[team];
    return fort ? fort.garrison : [];
  }

  function occupySlot(team, index, unit) {
    var slots = getGarrisonSlots(team);
    var s = slots[index | 0];
    if (!s || s.occupied) { return false; }
    s.occupied = true; s.unit = unit || null;
    return true;
  }

  function releaseSlot(team, index) {
    var slots = getGarrisonSlots(team);
    var s = slots[index | 0];
    if (!s) { return; }
    s.occupied = false; s.unit = null;
  }

  /* ==========================================================================
   * 15. PER-FRAME ANIMATION
   * ======================================================================== */

  function updateBanners(fort, dt) {
    var n = fort.banners.length;
    if (!n) { return; }
    var t = clock;
    var wind = 1 + fort.damage * 1.7 + (fort.collapsing ? 1.4 : 0);
    var i, v;
    for (i = 0; i < n; i++) {
      var m = fort.banners[i];
      if (!m.visible || !m.geometry || !m.geometry.attributes.position) { continue; }
      var attr = m.geometry.attributes.position;
      var arr = attr.array, base = m.userData.base, h = m.userData.h || 3;
      if (!base || base.length !== arr.length) { continue; }
      var ph = m.userData.phase;
      for (v = 0; v < arr.length; v += 3) {
        var bx = base[v], by = base[v + 1], bz = base[v + 2];
        var f = (h * 0.5 - by) / h;                   // 0 at the pinned top edge
        if (f < 0) { f = 0; }
        arr[v] = bx + Math.sin(t * 2.55 + ph + by * 0.85) * 0.11 * f * wind;
        arr[v + 2] = bz + Math.sin(t * 4.05 + ph + bx * 2.05 + by * 0.55) * 0.24 * f * wind;
      }
      attr.needsUpdate = true;
    }
  }

  function updateBraziers(fort, dt) {
    var n = fort.braziers.length;
    if (!n) { return; }
    var i, j;
    for (i = 0; i < n; i++) {
      var b = fort.braziers[i];
      var p = clock * 7.3 + b.phase;
      var fl = 0.82 + Math.sin(p) * 0.10 + Math.sin(p * 2.7) * 0.06 + Math.sin(p * 5.1) * 0.04;
      for (j = 0; j < b.flames.length; j++) {
        var f = b.flames[j];
        var k = fl * (1 + j * 0.06);
        f.scale.set(k, k * (1.05 + Math.sin(p * 1.9 + j) * 0.16), k);
        f.rotation.y = Math.sin(p * 0.7 + j) * 0.5;
        f.rotation.z = Math.sin(p * 0.53 + j) * 0.075;
        f.position.x = Math.sin(p * 1.3 + j * 2) * 0.06;
        f.position.z = Math.cos(p * 1.1 + j * 2) * 0.06;
        if (f.material) { f.material.opacity = 0.72 + (fl - 0.82) * 1.1; }
      }
      if (b.coals && b.coals.material) {
        b.coals.material.emissiveIntensity = 1.1 + Math.sin(p * 0.9) * 0.3;
      }
      // embers on a slow drip
      b.acc = (b.acc || 0) + dt * 3.2 * detail();
      while (b.acc >= 1) {
        b.acc -= 1;
        puffEmbers(fort, b.x, b.y + 2.2, b.z, 1);
      }
    }
    for (i = 0; i < fort.brazierLights.length; i++) {
      var pl = fort.brazierLights[i];
      pl.intensity = 1.35 + Math.sin(clock * 8.1 + i * 2.3) * 0.28 + Math.sin(clock * 17.3 + i) * 0.12;
    }
  }

  function updateSiege(fort, dt) {
    var i, n = fort.siege.length;
    for (i = 0; i < n; i++) {
      var s = fort.siege[i];
      // slow aiming sweep toward the lane, plus crew-shift micro motion
      var sweep = Math.sin(clock * 0.32 + s.phase) * 0.24;
      s.head.rotation.y = sweep;
      if (s.recoil > 0) {
        s.recoil = Math.max(0, s.recoil - dt * 3.2);
        var r = easeInQuad(s.recoil);
        if (s.kind === 'catapult') { s.arm.rotation.z = -0.9 + r * 1.7; }
        else { s.arm.position.x = 0.3 - r * 0.9; }
      } else if (s.kind === 'catapult') {
        s.arm.rotation.z = -0.9 + Math.sin(clock * 0.7 + s.phase) * 0.04;
      }
    }
  }

  function updateFuture(fort, dt) {
    var i;
    if (fort.shieldDome) {
      var m = fort.shieldDome.material;
      var pulse = 0.20 + Math.sin(clock * 1.1) * 0.045 + Math.sin(clock * 2.7) * 0.02;
      if (fort.shieldFlash > 0) {
        fort.shieldFlash = Math.max(0, fort.shieldFlash - dt * 2.6);
        pulse += fort.shieldFlash * 0.55;
      }
      // the shield weakens visibly as the fort takes damage — readable feedback
      pulse *= (1 - fort.damage * 0.72);
      m.opacity = clamp(pulse, 0, 1);
      fort.shieldDome.visible = m.opacity > 0.012 && !fort.collapsed;
      if (m.map) {
        m.map.offset.y = (m.map.offset.y + dt * 0.06) % 1;
        m.map.offset.x = (m.map.offset.x + dt * 0.015) % 1;
      }
      fort.shieldDome.rotation.y += dt * 0.05;
    }
    // Once the castle is coming down these are rigid bodies, not machinery —
    // writing their transforms here would fight the collapse integrator.
    if (fort.collapsing) { return; }
    for (i = 0; i < fort.hoverRings.length; i++) {
      var r = fort.hoverRings[i];
      r.rotation.z += dt * (0.35 + i * 0.22) * (i % 2 ? -1 : 1);
      r.position.y = r.userData.y0 === undefined
        ? (r.userData.y0 = r.position.y)
        : r.userData.y0 + Math.sin(clock * 0.9 + i * 1.7) * 0.35;
    }
    if (fort.radar) { fort.radar.rotation.y += dt * 0.55; }
  }

  function updateFort(fort, dt) {
    if (!fort || !fort.built) { return; }
    if (fort.upActive) { updateUpgrade(fort, dt); }
    if (!fort.collapsing) {
      updateGate(fort, dt);
      updateDamage(fort, dt);
    } else {
      updateCollapse(fort, dt);
    }
    updateBanners(fort, dt);
    updateBraziers(fort, dt);
    updateSiege(fort, dt);
    updateFuture(fort, dt);
    updateDebris(fort, dt);
    if (fort.hitFlash > 0) { fort.hitFlash = Math.max(0, fort.hitFlash - dt * 3); }
    updateParticles(fort.soft, dt);
    updateParticles(fort.add, dt);
  }

  function update(dtIn) {
    if (!ready || failed) { return; }
    var dt = (typeof dtIn === 'number' && isFinite(dtIn)) ? dtIn : 1 / 60;
    if (dt <= 0) { dt = 1 / 60; }
    if (dt > 0.1) { dt = 0.1; }
    clock += dt;
    try {
      updateFort(forts[1], dt);
      updateFort(forts[-1], dt);
    } catch (e) {
      warn('update', 'forts update threw (further identical errors suppressed)', e);
    }
  }

  /* ==========================================================================
   * 16. INIT / WIRING / DISPOSE
   * ======================================================================== */

  var tierBase = null;   // inferred: are callers 0-based or 1-based on tier?

  function normTierSmart(tier) {
    var t = Math.round(Number(tier));
    if (!isFinite(t)) { t = 1; }
    if (t <= 0) { if (tierBase === null) { tierBase = 0; } return 0; }
    if (t >= TIER.length) { tierBase = 1; }
    if (tierBase === 0) { return clamp(t, 0, TIER.length - 1); }
    return clamp(t - 1, 0, TIER.length - 1);
  }

  function attach(fort) {
    var r = R();
    try {
      if (r && r.ready && typeof r.addObject === 'function') { r.addObject(fort.root, 'forts'); return true; }
      if (r && r.scene) { r.scene.add(fort.root); return true; }
      if (r && r.groups && r.groups.forts) { r.groups.forts.add(fort.root); return true; }
    } catch (e) { warn('attach', 'could not attach the fort to the scene', e); }
    return false;
  }

  function currentEra() {
    var c = core();
    if (c && c.state && c.state.era !== undefined) { return c.state.era; }
    return 'medieval';
  }

  function currentTier(team) {
    var c = core();
    try {
      if (c && c.state && c.state.forts && c.state.forts[team]) {
        return c.state.forts[team].tier;
      }
    } catch (e) { /* ignore */ }
    return 0;
  }

  var wired = false;
  function wire() {
    if (wired) { return; }
    wired = true;

    busOn('fort:hit', function (p) {
      if (!p) { return; }
      var team = (p.team < 0) ? -1 : 1;
      var fort = forts[team];
      if (!fort || !fort.built) { return; }
      if (typeof p.hp === 'number' && typeof p.max === 'number' && p.max > 0) {
        setDamage(team, 1 - clamp01(p.hp / p.max));
      } else if (typeof p.dmg === 'number') {
        setDamage(team, clamp01(fort.dmgTarget + p.dmg * 0.001));
      }
      fortHit(fort, (typeof p.dmg === 'number') ? p.dmg : 10);
    });

    busOn('fort:destroyed', function (p) {
      var team = (p && p.team !== undefined) ? ((p.team < 0) ? -1 : 1) : ((typeof p === 'number' && p < 0) ? -1 : 1);
      collapse(team);
    });

    busOn('fort:tier', function (p) {
      if (!p) { return; }
      var team = (p.team < 0) ? -1 : 1;
      build(team, p.tier, p.era !== undefined ? p.era : currentEra());
    });

    busOn('era:evolve', function (p) {
      var era = p ? (p.era !== undefined ? p.era : p.index) : currentEra();
      var i, t;
      for (i = 0; i < TEAMS.length; i++) {
        t = TEAMS[i];
        if (forts[t] && forts[t].built && !forts[t].collapsing) {
          // an era change re-skins the castle; it does NOT repair it
          var keepDmg = forts[t].dmgTarget;
          build(t, rawTierOf(forts[t]), era);
          setDamage(t, keepDmg);
        }
      }
    });

    busOn('game:reset', function () { rebuildAll(true); });
    busOn('game:new', function () { rebuildAll(true); });

    busOn('wave:start', function () {
      // brief sortie: the gate opens to let the wave out, then shuts again
      var i;
      for (i = 0; i < TEAMS.length; i++) {
        (function (t) {
          var f = forts[t];
          if (!f || !f.built || f.collapsing) { return; }
          openGate(t, true);
          var c = core();
          if (c && typeof c.after === 'function') {
            c.after(4.0, function () { openGate(t, false); });
          }
        })(TEAMS[i]);
      }
    });
  }

  /** Recover the caller-facing tier number from a built fort. */
  function rawTierOf(fort) {
    return (tierBase === 0) ? fort.tierIdx : (fort.tierIdx + 1);
  }

  function rebuildAll(resetDamage) {
    var i, t;
    for (i = 0; i < TEAMS.length; i++) {
      t = TEAMS[i];
      build(t, currentTier(t), currentEra());
      if (resetDamage) { setDamage(t, 0); }
    }
  }

  function init(opts) {
    opts = opts || {};
    if (inited) { return true; }
    if (failed) { return false; }
    try {
      forts[1] = makeFort(1);
      forts[-1] = makeFort(-1);
      attach(forts[1]);
      attach(forts[-1]);
      inited = true;
      ready = true;
      F.ready = true;

      wire();

      var era = (opts.era !== undefined) ? opts.era : currentEra();
      build(1, (opts.tier !== undefined) ? opts.tier : currentTier(1), era);
      build(-1, (opts.tier !== undefined) ? opts.tier : currentTier(-1), era);

      // The render tick. Registered ahead of the renderer's own hook (negative
      // order) so the castle is posed before the frame is drawn.
      var c = core();
      if (c && typeof c.registerRender === 'function') {
        c.registerRender(function (dtReal) { update(dtReal); }, -20);
        drivenExternally = true;
      } else {
        startOwnLoop();
      }

      console.info('[AOW.Forts] ready — 2 castles, tiers 1-5, style "' + forts[1].styleBase + '".');
      return true;
    } catch (e) {
      failed = true;
      F.failed = true;
      warn('init', 'init failed — the game will run without castles.', e);
      return false;
    }
  }

  /* Standalone loop, only if Core is missing (it normally drives us). */
  var drivenExternally = false, ownRaf = 0, ownLast = 0;
  function startOwnLoop() {
    if (ownRaf || typeof global.requestAnimationFrame !== 'function') { return; }
    ownLast = (global.performance && performance.now) ? performance.now() : Date.now();
    var tick = function () {
      ownRaf = global.requestAnimationFrame(tick);
      var now = (global.performance && performance.now) ? performance.now() : Date.now();
      var dt = (now - ownLast) / 1000;
      ownLast = now;
      update(dt);
    };
    ownRaf = global.requestAnimationFrame(tick);
  }
  function stopOwnLoop() {
    if (ownRaf && typeof global.cancelAnimationFrame === 'function') {
      global.cancelAnimationFrame(ownRaf);
    }
    ownRaf = 0;
  }

  function reset() {
    rebuildAll(true);
  }

  function dispose() {
    try {
      stopOwnLoop();
      var i, t, f;
      for (i = 0; i < TEAMS.length; i++) {
        t = TEAMS[i];
        f = forts[t];
        if (!f) { continue; }
        clearFort(f);
        if (f.soft && f.soft.geo) { f.soft.geo.dispose(); }
        if (f.add && f.add.geo) { f.add.geo.dispose(); }
        if (f.soft && f.soft.mat) { f.soft.mat.dispose(); }
        if (f.add && f.add.mat) { f.add.mat.dispose(); }
        if (f.root.parent) { f.root.parent.remove(f.root); }
        forts[t] = null;
      }
      var k;
      for (k in matCache) {
        try { if (matCache[k] && matCache[k].dispose) { matCache[k].dispose(); } } catch (e2) { /* ignore */ }
      }
      matCache = Object.create(null);
    } catch (e) { warn('dispose', 'dispose issue', e); }
    inited = false; ready = false;
    F.ready = false;
  }

  /* ==========================================================================
   * 17. PUBLIC API
   * ======================================================================== */

  F.version = '1.0.0';
  F.ready = false;
  F.failed = false;

  F.init = init;
  F.dispose = dispose;
  F.reset = reset;
  F.update = update;

  F.build = function (team, tier, era) {
    if (!inited) { init({}); }
    return build(team, tier, era);
  };
  F.setDamage = setDamage;
  F.collapse = collapse;
  F.openGate = openGate;
  F.isGateOpen = function (team) {
    var f = forts[(team < 0) ? -1 : 1];
    return !!(f && f.gateOpen);
  };
  F.getGateWorldPos = getGateWorldPos;
  F.getGarrisonSlots = getGarrisonSlots;
  F.occupySlot = occupySlot;
  F.releaseSlot = releaseSlot;

  F.getFort = function (team) { return forts[(team < 0) ? -1 : 1]; };
  F.getRoot = function (team) { var f = forts[(team < 0) ? -1 : 1]; return f ? f.root : null; };
  F.getTier = function (team) { var f = forts[(team < 0) ? -1 : 1]; return f ? f.tierIdx + 1 : 0; };
  F.getStyle = function (team) { var f = forts[(team < 0) ? -1 : 1]; return f ? f.styleBase : null; };
  F.getDamage = function (team) { var f = forts[(team < 0) ? -1 : 1]; return f ? f.damage : 0; };
  F.isCollapsing = function (team) { var f = forts[(team < 0) ? -1 : 1]; return !!(f && f.collapsing); };

  /** World-space AABB of a fort — handy for camera framing and AI pathing. */
  F.getBounds = function (team, out) {
    var f = forts[(team < 0) ? -1 : 1];
    out = out || { minX: 0, maxX: 0, minZ: 0, maxZ: 0, top: 0 };
    if (!f) { return out; }
    f.root.updateMatrixWorld(true);
    var b = f.bounds;
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    var xs = [b.minX, b.maxX], zs = [b.minZ, b.maxZ], i, j;
    for (i = 0; i < 2; i++) {
      for (j = 0; j < 2; j++) {
        _v1.set(xs[i], 0, zs[j]);
        f.root.localToWorld(_v1);
        if (_v1.x < minX) { minX = _v1.x; }
        if (_v1.x > maxX) { maxX = _v1.x; }
        if (_v1.z < minZ) { minZ = _v1.z; }
        if (_v1.z > maxZ) { maxZ = _v1.z; }
      }
    }
    out.minX = minX; out.maxX = maxX; out.minZ = minZ; out.maxZ = maxZ; out.top = b.top;
    return out;
  };

  /** Let the sim tell a siege engine it just fired, so it recoils on cue. */
  F.fireSiege = function (team, index) {
    var f = forts[(team < 0) ? -1 : 1];
    if (!f || !f.siege.length) { return null; }
    var s = f.siege[(index === undefined ? (Math.random() * f.siege.length) | 0 : index) % f.siege.length];
    if (!s) { return null; }
    s.recoil = 1;
    _v1.set(s.grp.position.x, s.grp.position.y + 1.2, s.grp.position.z);
    puffDust(f, _v1.x, _v1.y, _v1.z, 4, 1.2, 0.6);
    f.root.updateMatrixWorld(true);
    f.root.localToWorld(_v1);
    busEmit('audio:sfx', { id: s.kind === 'catapult' ? 'catapult_fire' : 'ballista_fire',
      team: f.team, x: _v1.x, y: _v1.y, z: _v1.z, gain: 0.8 });
    return _v1;
  };

  /** Fire / smoke anchor points in world space (for VFX or AI targeting). */
  F.getFirePoints = function (team, outArray) {
    var f = forts[(team < 0) ? -1 : 1];
    var out = outArray || [];
    out.length = 0;
    if (!f) { return out; }
    f.root.updateMatrixWorld(true);
    var i;
    for (i = 0; i < f.firePoints.length; i++) {
      var p = f.firePoints[i];
      var v = new THREE.Vector3(p[0], p[1], p[2]);
      f.root.localToWorld(v);
      out.push(v);
    }
    return out;
  };

  /* Introspection for tooling / debug overlays. */
  F.STYLES = STYLES;
  F.ERA_ORDER = ERA_ORDER;
  F.TIERS = TIER.length;
  F.layout = L;
  F.resolveStyle = resolveStyle;

  AOW.Forts = F;

  /* ==========================================================================
   * 18. AUTO-INIT SAFETY NET
   * --------------------------------------------------------------------------
   * The integrator normally calls AOW.Forts.init() after AOW.Render.init().
   * If nobody does, we bring ourselves up as soon as the renderer is ready (or
   * shortly after load) so the castles are never silently missing. init() is
   * idempotent, so an explicit call always wins.
   * ======================================================================== */
  (function autoInit() {
    var tries = 0;
    function attempt() {
      if (inited || failed) { return; }
      var r = R();
      if (r && r.ready) { init({}); return; }
      if (r && r.failed) { return; }          // no 3D at all — stay quiet
      if (++tries > 40) {                     // ~6s: come up anyway if we can
        if (r && (r.scene || r.groups)) { init({}); }
        return;
      }
      setTimeout(attempt, 150);
    }
    try {
      busOn('render:ready', function () { if (!inited && !failed) { init({}); } });
      if (global.document && global.document.readyState === 'complete') { setTimeout(attempt, 0); }
      else if (typeof global.addEventListener === 'function') {
        global.addEventListener('load', function () { setTimeout(attempt, 0); }, false);
      } else { setTimeout(attempt, 0); }
    } catch (e) { warn('autoinit', 'auto-init could not be scheduled', e); }
  })();

})(typeof window !== 'undefined' ? window : this);
