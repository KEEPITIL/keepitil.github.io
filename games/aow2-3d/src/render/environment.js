/* =============================================================================
 * AOW2-3D — src/render/environment.js  →  global AOW.Env
 * -----------------------------------------------------------------------------
 * The WORLD. Terrain, sky, distance, props, weather, era dressing.
 *
 * HARD RULES honoured (CONTRACT.md):
 *  - three.js r128 UMD (global THREE). No modules, no npm, no build, no network.
 *  - NO external assets: every texture is drawn procedurally into a canvas.
 *  - Attaches exactly ONE global: AOW.Env.
 *  - Cross-module talk only via AOW.Core.on / AOW.Core.emit.
 *  - Zero per-frame allocation in the update path (module scratch objects only).
 *  - Everything guarded: any sub-system that cannot build warns once and no-ops.
 *
 * DESIGN NOTES
 *  - All custom shading is done by INJECTING into three's built-in materials
 *    (onBeforeCompile). That is the only way to keep three's fog, shadows, tone
 *    mapping and sRGB encode consistent with the rest of the frame — a raw
 *    ShaderMaterial would silently skip <tonemapping_fragment> and the horizon
 *    seam between sky and fog would never line up.
 *  - Props are InstancedMesh, bucketed into x-chunks so distant chunks can be
 *    switched off wholesale, with a per-instance `aRand` attribute used as a
 *    density cut so era dressing can grow/shrink props smoothly instead of
 *    popping.
 *  - Height is analytic: heightAt(x,z) re-evaluates the exact function used to
 *    displace the mesh, so other modules can plant things on the ground.
 * ========================================================================== */
(function (global) {
  'use strict';

  var AOW = global.AOW || (global.AOW = {});
  if (AOW.Env && AOW.Env.__isAowEnv) { return; }

  var THREE = global.THREE;

  /* --------------------------------------------------------------------------
   * Hard dependency guard — publish a complete no-op API if THREE is missing so
   * nobody has to null-check us.
   * ------------------------------------------------------------------------ */
  if (!THREE || !THREE.BufferGeometry) {
    console.warn('[AOW.Env] THREE (r128 UMD) not found — environment disabled, publishing no-op API.');
    AOW.Env = (function () {
      var noop = function () {};
      var stub = {
        __isAowEnv: true, version: '1.0.0', ready: false, failed: true,
        init: function () { return false; },
        heightAt: function () { return 0; },
        groundY: function () { return 0; },
        normalAt: function (x, z, out) { if (out && out.set) { out.set(0, 1, 0); } return out; },
        getWeather: function () { return 'clear'; },
        getEra: function () { return 'tribal'; },
        listWeather: function () { return []; },
        listEras: function () { return []; }
      };
      ['dispose', 'update', 'setWeather', 'setEra', 'setQuality', 'strikeLightning'].forEach(function (k) { stub[k] = noop; });
      return stub;
    })();
    return;
  }

  /* ==========================================================================
   * 0. TINY UTILITIES
   * ======================================================================== */

  var PI = Math.PI, TAU = PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(e0, e1, x) {
    if (e1 === e0) { return x < e0 ? 0 : 1; }
    var t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  }
  function damp(cur, tgt, lambda, dt) { return cur + (tgt - cur) * (1 - Math.exp(-lambda * dt)); }

  var _warned = Object.create(null);
  function warn(key, msg, err) {
    try {
      if (_warned[key]) { return; }
      _warned[key] = 1;
      if (err) { console.warn('[AOW.Env] ' + msg, err); } else { console.warn('[AOW.Env] ' + msg); }
    } catch (e) { /* console gone */ }
  }

  /* --- deterministic RNG (never touches Core's sim stream) ------------------ */
  function makeRng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* --- value noise (CPU) ---------------------------------------------------- */
  var NSEED = 1337;
  function h2(x, y) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + NSEED;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    var a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
    return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
  }
  /** fbm in [-1,1] */
  function fbm(x, y, oct) {
    var amp = 0.5, sum = 0, norm = 0, i;
    oct = oct || 4;
    for (i = 0; i < oct; i++) {
      sum += (vnoise(x, y) * 2 - 1) * amp;
      norm += amp;
      x = x * 2.03 + 17.13; y = y * 2.03 - 9.71;
      amp *= 0.5;
    }
    return norm > 0 ? sum / norm : 0;
  }
  /** ridged fbm in [0,1] — mountains */
  function ridged(x, y, oct) {
    var amp = 0.5, sum = 0, norm = 0, i;
    oct = oct || 4;
    for (i = 0; i < oct; i++) {
      var n = 1 - Math.abs(vnoise(x, y) * 2 - 1);
      sum += n * n * amp;
      norm += amp;
      x = x * 2.07 + 5.7; y = y * 2.07 + 3.1;
      amp *= 0.5;
    }
    return norm > 0 ? sum / norm : 0;
  }
  /** seamless tiling value noise on a `period` grid — for canvas textures */
  function tileNoise(x, y, period) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    function w(a, b) { return h2(((a % period) + period) % period, ((b % period) + period) % period); }
    var a = w(ix, iy), b = w(ix + 1, iy), c = w(ix, iy + 1), d = w(ix + 1, iy + 1);
    return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
  }
  function tileFbm(x, y, period, oct) {
    var amp = 0.5, sum = 0, norm = 0, i, p = period;
    for (i = 0; i < oct; i++) {
      sum += tileNoise(x, y, p) * amp;
      norm += amp;
      x *= 2; y *= 2; p *= 2; amp *= 0.5;
    }
    return norm > 0 ? sum / norm : 0;
  }

  /* ==========================================================================
   * 1. MODULE STATE
   * ======================================================================== */

  var E = {};                                  // public object, filled at the bottom
  var R = null, C = null;                      // AOW.Render, AOW.Core
  var scene = null, camera = null;
  var inited = false, failed = false, disposed = false;

  var root = null;                             // everything we own hangs here
  var skyGroup = null, distGroup = null, propGroup = null, fxGroup = null;

  var tier = 'high';                           // 'high' | 'med' | 'low'
  var tierScale = 1.0;
  var elapsed = 0;

  var rnd = makeRng(0xA0E2D3D);

  /* World footprint. Wider than AOW.W so the camera never frames the void. */
  var W = (typeof AOW.W === 'number' && AOW.W > 0) ? AOW.W : 420;
  var X0 = -90, X1 = 530;                      // terrain x extent
  var Z0 = -170, Z1 = 180;                     // terrain z extent (camera sits at -z)
  var LANE_HALF = 16;                          // contract: lane depth ±16
  var LANE_FLAT = 18;                          // flat out to here, then transition
  var LANE_EDGE = 36;

  /* Scratch — NEVER allocate these inside update(). */
  var _v3a = new THREE.Vector3();
  var _v3b = new THREE.Vector3();
  var _v3c = new THREE.Vector3();
  var _colA = new THREE.Color();
  var _colB = new THREE.Color();
  var _colC = new THREE.Color();
  var _m4 = new THREE.Matrix4();
  var _q = new THREE.Quaternion();
  var _eul = new THREE.Euler();
  var _scl = new THREE.Vector3(1, 1, 1);

  /**
   * sRGB hex → LINEAR colour, routed through Render so the whole project shares
   * one colour pipeline. Memoised: the geometry painters call this per vertex,
   * and building the props otherwise churns tens of thousands of Colors.
   * The returned objects are SHARED — copy or lerp from them, never mutate.
   */
  var _colCache = Object.create(null);
  function col(hex) {
    var key = (typeof hex === 'string') ? hex : ('#' + Number(hex).toString(16));
    var hit = _colCache[key];
    if (hit) { return hit; }
    var c;
    try {
      if (R && typeof R.color === 'function') { c = R.color(hex); }
    } catch (e) { c = null; }
    if (!c) {
      c = new THREE.Color(hex);
      if (typeof c.convertSRGBToLinear === 'function') { c.convertSRGBToLinear(); }
    }
    _colCache[key] = c;
    return c;
  }

  /* ==========================================================================
   * 2. SHARED UNIFORMS
   * --------------------------------------------------------------------------
   * ONE object per uniform, assigned by reference into every injected shader,
   * so a single write per frame updates the whole world.
   * ======================================================================== */

  var U = {
    time:     { value: 0 },
    /** xz = wind direction, w = gust speed */
    wind:     { value: new THREE.Vector4(1, 0, 0.22, 1.0) },
    cam:      { value: new THREE.Vector3(0, 20, -90) },
    /** x = wetness, y = snow cover, z = dust, w = lightning flash */
    weather:  { value: new THREE.Vector4(0, 0, 0, 0) },
    dustCol:  { value: new THREE.Color(0.62, 0.45, 0.26) },
    horizon:  { value: new THREE.Color(0.5, 0.6, 0.75) },
    zenith:   { value: new THREE.Color(0.18, 0.36, 0.72) },
    sunDir:   { value: new THREE.Vector3(-0.5, 0.5, -0.5) },
    sunCol:   { value: new THREE.Color(1, 0.9, 0.75) },
    sunI:     { value: 1.0 },
    night:    { value: 0.0 },
    moonDir:  { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    /** x = coverage, y = darkness, z = drift speed, w = second-layer coverage */
    cloud:    { value: new THREE.Vector4(0.30, 0.12, 1.0, 0.22) },
    /** grass distance fade: x = start, y = end */
    gFade:    { value: new THREE.Vector2(70, 140) }
  };

  /* ==========================================================================
   * 3. SHADER INJECTION HELPER
   * ======================================================================== */

  function inject(mat, spec) {
    if (!mat) { return mat; }
    mat.onBeforeCompile = function (shader) {
      try {
        var k;
        if (spec.uniforms) { for (k in spec.uniforms) { shader.uniforms[k] = spec.uniforms[k]; } }
        if (spec.vsHead) { shader.vertexShader = spec.vsHead + '\n' + shader.vertexShader; }
        if (spec.fsHead) { shader.fragmentShader = spec.fsHead + '\n' + shader.fragmentShader; }
        var i, r;
        if (spec.vs) {
          for (i = 0; i < spec.vs.length; i++) {
            r = spec.vs[i];
            shader.vertexShader = shader.vertexShader.replace(r[0], r[1]);
          }
        }
        if (spec.fs) {
          for (i = 0; i < spec.fs.length; i++) {
            r = spec.fs[i];
            shader.fragmentShader = shader.fragmentShader.replace(r[0], r[1]);
          }
        }
      } catch (e) { warn('inject:' + spec.key, 'shader injection failed for "' + spec.key + '" — material left stock.', e); }
    };
    // Without this three may hand us a cached program compiled from a DIFFERENT
    // injection (same base material, different code) — the classic "my shader
    // randomly doesn't apply" bug.
    mat.customProgramCacheKey = function () { return 'aowenv_' + spec.key; };
    return mat;
  }

  /* Standard chunk: world position + world normal varyings, instancing aware. */
  var VS_WORLD_HEAD =
    'varying vec3 vAowW;\nvarying vec3 vAowN;\n';
  var VS_WORLD_BODY =
    '#include <begin_vertex>\n' +
    '#ifdef USE_INSTANCING\n' +
    '  vAowW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;\n' +
    '  vAowN = normalize( mat3( modelMatrix ) * mat3( instanceMatrix ) * objectNormal );\n' +
    '#else\n' +
    '  vAowW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n' +
    '  vAowN = normalize( mat3( modelMatrix ) * objectNormal );\n' +
    '#endif\n';

  /* MeshBasicMaterial only defines objectNormal under USE_ENVMAP, so anything
     built on `basic` must use this position-only variant or it will not compile. */
  var VS_WORLDPOS_BODY =
    '#include <begin_vertex>\n' +
    '#ifdef USE_INSTANCING\n' +
    '  vAowW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;\n' +
    '#else\n' +
    '  vAowW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n' +
    '#endif\n' +
    '  vAowN = vec3( 0.0, 1.0, 0.0 );\n';

  /* ==========================================================================
   * 4. GEOMETRY HELPERS
   * ======================================================================== */

  var _pc = new THREE.Color();

  /** Give a geometry a vertex-colour attribute. fn(color, x, y, z, ny, i). */
  function paint(g, fn) {
    var pos = g.attributes.position;
    if (!pos) { return g; }
    var nrm = g.attributes.normal;
    var n = pos.count, arr = new Float32Array(n * 3), i;
    for (i = 0; i < n; i++) {
      _pc.setRGB(1, 1, 1);
      fn(_pc, pos.getX(i), pos.getY(i), pos.getZ(i), nrm ? nrm.getY(i) : 1, i);
      arr[i * 3] = _pc.r; arr[i * 3 + 1] = _pc.g; arr[i * 3 + 2] = _pc.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }

  /** Merge a list of geometries into one non-indexed geometry (pos/nrm/uv/col). */
  function mergeGeos(list) {
    var geos = [], i, g, total = 0;
    for (i = 0; i < list.length; i++) {
      g = list[i];
      if (!g || !g.attributes || !g.attributes.position) { continue; }
      if (g.index) {
        var ni = g.toNonIndexed();
        g.dispose();
        g = ni;
      }
      geos.push(g);
      total += g.attributes.position.count;
    }
    if (!geos.length) { return new THREE.BufferGeometry(); }

    var pos = new Float32Array(total * 3);
    var nrm = new Float32Array(total * 3);
    var uv = new Float32Array(total * 2);
    var cl = new Float32Array(total * 3);
    cl.fill(1);
    nrm.fill(0);

    var o = 0;
    for (i = 0; i < geos.length; i++) {
      g = geos[i];
      var c = g.attributes.position.count;
      pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
      if (g.attributes.normal) { nrm.set(g.attributes.normal.array.subarray(0, c * 3), o * 3); }
      if (g.attributes.uv) { uv.set(g.attributes.uv.array.subarray(0, c * 2), o * 2); }
      if (g.attributes.color) { cl.set(g.attributes.color.array.subarray(0, c * 3), o * 3); }
      o += c;
      g.dispose();
    }

    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    out.computeBoundingSphere();
    return out;
  }

  /** Randomly perturb every vertex of a geometry (used to rough up rocks). */
  function jitter(g, amt, rf) {
    var pos = g.attributes.position, n = pos.count, i;
    for (i = 0; i < n; i++) {
      pos.setXYZ(i,
        pos.getX(i) + (rf() - 0.5) * amt,
        pos.getY(i) + (rf() - 0.5) * amt,
        pos.getZ(i) + (rf() - 0.5) * amt);
    }
    pos.needsUpdate = true;
    return g;
  }

  function cyl(rT, rB, h, seg, open) {
    var g = new THREE.CylinderGeometry(rT, rB, h, seg, 1, !!open);
    g.translate(0, h * 0.5, 0);
    return g;
  }
  function box(w, h, d) {
    var g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h * 0.5, 0);
    return g;
  }
  function cone(r, h, seg) {
    var g = new THREE.ConeGeometry(r, h, seg, 1);
    g.translate(0, h * 0.5, 0);
    return g;
  }
  function blob(r, detail) {
    return new THREE.IcosahedronGeometry(r, detail === undefined ? 0 : detail);
  }
  function quadXY(w, h) {
    var g = new THREE.PlaneGeometry(w, h, 1, 1);
    g.translate(0, h * 0.5, 0);
    return g;
  }

  /* ==========================================================================
   * 5. PROCEDURAL TEXTURES
   * --------------------------------------------------------------------------
   * Every texture in this file is drawn here. No downloads, ever.
   * ======================================================================== */

  var TEX = {};

  function mkTex(key, w, h, drawFn, opts) {
    opts = opts || {};
    opts.key = 'aow.env.' + key;
    try {
      if (R && typeof R.makeCanvasTexture === 'function') {
        return R.makeCanvasTexture(w, h, drawFn, opts);
      }
    } catch (e) { warn('tex:' + key, 'makeCanvasTexture failed for ' + key, e); }
    return null;
  }

  function buildTextures() {
    /* Canvas noise generation is the single biggest init cost in this file, and
       it is O(pixels). Half the resolution on low tier halves the hitch. */
    var NS = (tier === 'low') ? 128 : 256;

    /* --- 4-channel tiling noise: the workhorse for clouds + detail --------- */
    TEX.noise = mkTex('noise' + NS, NS, NS, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, x, y, i;
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          i = (y * w + x) * 4;
          var u = x / w * 8, v = y / h * 8;
          d[i]     = (tileFbm(u, v, 8, 3) * 255) | 0;
          d[i + 1] = (tileFbm(u * 2 + 3.1, v * 2 - 1.7, 16, 3) * 255) | 0;
          d[i + 2] = (tileFbm(u * 4 - 5.3, v * 4 + 2.9, 32, 2) * 255) | 0;
          d[i + 3] = (tileFbm(u * 8 + 11.7, v * 8 + 7.3, 64, 2) * 255) | 0;
        }
      }
      ctx.putImageData(img, 0, 0);
    }, { linear: true, anisotropy: 4 });

    /* --- ground detail: grain, pebbles, scratches -------------------------- */
    TEX.detail = mkTex('detail' + NS, NS, NS, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, x, y, i;
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          i = (y * w + x) * 4;
          var u = x / w * 16, v = y / h * 16;
          var n = tileFbm(u, v, 16, 4);
          var g = tileNoise(u * 4, v * 4, 64);
          var val = 0.52 + (n - 0.5) * 0.62 + (g - 0.5) * 0.20;
          val = clamp01(val);
          var c = (val * 255) | 0;
          d[i] = c; d[i + 1] = (c * 0.99) | 0; d[i + 2] = (c * 0.96) | 0; d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      // pebbles
      ctx.globalAlpha = 0.30;
      var rf = makeRng(919), k;
      for (k = 0; k < 260; k++) {
        var px = rf() * w, py = rf() * h, pr = 0.8 + rf() * 2.6;
        var sh = rf() < 0.5 ? 210 : 96;
        ctx.fillStyle = 'rgb(' + sh + ',' + ((sh * 0.98) | 0) + ',' + ((sh * 0.93) | 0) + ')';
        ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }, { linear: true, repeat: [1, 1], anisotropy: 8 });

    /* --- grass blades (alpha tested) --------------------------------------- */
    TEX.grass = mkTex('grass', (tier === 'low') ? 64 : 128, (tier === 'low') ? 64 : 128, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var rf = makeRng(4242), i;
      for (i = 0; i < 16; i++) {
        var bx = 6 + rf() * (w - 12);
        var bw = 3 + rf() * 4.5;
        var bh = h * (0.45 + rf() * 0.55);
        var bend = (rf() - 0.5) * 22;
        var g = ctx.createLinearGradient(0, h, 0, h - bh);
        var dark = 'rgba(38,58,24,1)';
        var lite = 'rgba(' + (120 + ((rf() * 50) | 0)) + ',' + (160 + ((rf() * 55) | 0)) + ',60,1)';
        g.addColorStop(0, dark);
        g.addColorStop(0.55, 'rgba(70,102,38,1)');
        g.addColorStop(1, lite);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx - bw * 0.5, h);
        ctx.quadraticCurveTo(bx - bw * 0.35 + bend * 0.5, h - bh * 0.6, bx + bend, h - bh);
        ctx.quadraticCurveTo(bx + bw * 0.35 + bend * 0.5, h - bh * 0.6, bx + bw * 0.5, h);
        ctx.closePath();
        ctx.fill();
      }
    }, { wrap: THREE.ClampToEdgeWrapping, anisotropy: 4 });

    /* --- soft round dot: snow, smoke, embers, glow ------------------------- */
    TEX.dot = mkTex('dot', 64, 64, function (ctx, w, h) {
      var g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.42, 'rgba(255,255,255,0.72)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { wrap: THREE.ClampToEdgeWrapping, mipmaps: true });

    /* --- smoke puff (soft, slightly lumpy) --------------------------------- */
    TEX.smoke = mkTex('smoke', (tier === 'low') ? 64 : 128, (tier === 'low') ? 64 : 128, function (ctx, w, h) {
      var img = ctx.createImageData(w, h), d = img.data, x, y, i;
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          i = (y * w + x) * 4;
          var dx = (x / w - 0.5) * 2, dy = (y / h - 0.5) * 2;
          var r = Math.sqrt(dx * dx + dy * dy);
          var n = tileFbm(x / w * 5, y / h * 5, 5, 3);
          var a = clamp01((1 - r) * 1.35) * (0.45 + n * 0.85);
          a = clamp01(a) * clamp01(1 - r);
          d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = (a * 255) | 0;
        }
      }
      ctx.putImageData(img, 0, 0);
    }, { wrap: THREE.ClampToEdgeWrapping });

    /* --- flame gradient (additive) ----------------------------------------- */
    TEX.flame = mkTex('flame', 64, 128, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var g = ctx.createRadialGradient(w / 2, h * 0.82, 1, w / 2, h * 0.62, w * 0.72);
      g.addColorStop(0, 'rgba(255,246,204,1)');
      g.addColorStop(0.30, 'rgba(255,186,72,0.95)');
      g.addColorStop(0.66, 'rgba(228,96,24,0.55)');
      g.addColorStop(1, 'rgba(140,32,8,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, 0);
      ctx.quadraticCurveTo(w, h * 0.55, w * 0.78, h);
      ctx.lineTo(w * 0.22, h);
      ctx.quadraticCurveTo(0, h * 0.55, w * 0.5, 0);
      ctx.closePath();
      ctx.fill();
    }, { wrap: THREE.ClampToEdgeWrapping });

    /* --- splash ring -------------------------------------------------------- */
    TEX.ring = mkTex('ring', 64, 64, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var i;
      for (i = 0; i < 5; i++) {
        ctx.strokeStyle = 'rgba(220,236,255,' + (0.5 - i * 0.09) + ')';
        ctx.lineWidth = 2.4 - i * 0.35;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, w * 0.20 + i * 2.4, 0, TAU);
        ctx.stroke();
      }
    }, { wrap: THREE.ClampToEdgeWrapping });

    /* --- sakura petal ------------------------------------------------------- */
    TEX.petal = mkTex('petal', 32, 32, function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,236,244,1)');
      g.addColorStop(1, 'rgba(248,178,206,1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.06);
      ctx.bezierCurveTo(w * 0.98, h * 0.30, w * 0.86, h * 0.92, w * 0.5, h * 0.96);
      ctx.bezierCurveTo(w * 0.14, h * 0.92, w * 0.02, h * 0.30, w * 0.5, h * 0.06);
      ctx.closePath();
      ctx.fill();
    }, { wrap: THREE.ClampToEdgeWrapping });

    /* --- roman cobble road -------------------------------------------------- */
    TEX.cobble = mkTex('cobble', 256, 256, function (ctx, w, h) {
      ctx.fillStyle = '#4a463f';
      ctx.fillRect(0, 0, w, h);
      var rf = makeRng(77), r, c, cw = w / 8, ch = h / 12;
      for (r = 0; r < 12; r++) {
        var off = (r % 2) * cw * 0.5;
        for (c = -1; c < 9; c++) {
          var x = c * cw + off + 1.5, y = r * ch + 1.5;
          var sh = 96 + ((rf() * 58) | 0);
          ctx.fillStyle = 'rgb(' + sh + ',' + ((sh * 0.96) | 0) + ',' + ((sh * 0.88) | 0) + ')';
          ctx.beginPath();
          var rr = 3;
          var ww = cw - 3, hh = ch - 3;
          ctx.moveTo(x + rr, y);
          ctx.lineTo(x + ww - rr, y);
          ctx.quadraticCurveTo(x + ww, y, x + ww, y + rr);
          ctx.lineTo(x + ww, y + hh - rr);
          ctx.quadraticCurveTo(x + ww, y + hh, x + ww - rr, y + hh);
          ctx.lineTo(x + rr, y + hh);
          ctx.quadraticCurveTo(x, y + hh, x, y + hh - rr);
          ctx.lineTo(x, y + rr);
          ctx.quadraticCurveTo(x, y, x + rr, y);
          ctx.fill();
        }
      }
      // grime pass
      ctx.globalAlpha = 0.20;
      var k;
      for (k = 0; k < 200; k++) {
        ctx.fillStyle = rf() < 0.5 ? '#2b2721' : '#7a7365';
        ctx.beginPath();
        ctx.arc(rf() * w, rf() * h, 1 + rf() * 7, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }, { repeat: [1, 1], anisotropy: 8 });

    /* --- future metal plate ------------------------------------------------- */
    TEX.plate = mkTex('plate', 256, 256, function (ctx, w, h) {
      ctx.fillStyle = '#4e565e';
      ctx.fillRect(0, 0, w, h);
      var i, j;
      for (i = 0; i < 2; i++) {
        for (j = 0; j < 2; j++) {
          var x = i * w / 2 + 4, y = j * h / 2 + 4, ww = w / 2 - 8, hh = h / 2 - 8;
          var g = ctx.createLinearGradient(x, y, x + ww, y + hh);
          g.addColorStop(0, '#6b757e');
          g.addColorStop(0.5, '#59636c');
          g.addColorStop(1, '#48515a');
          ctx.fillStyle = g;
          ctx.fillRect(x, y, ww, hh);
          ctx.strokeStyle = '#333a41';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, ww, hh);
          // rivets
          ctx.fillStyle = '#828d96';
          var k;
          for (k = 0; k < 4; k++) {
            var rx = x + 8 + (k % 2) * (ww - 16), ry = y + 8 + ((k / 2) | 0) * (hh - 16);
            ctx.beginPath(); ctx.arc(rx, ry, 2.6, 0, TAU); ctx.fill();
          }
        }
      }
      var rf = makeRng(313), s;
      ctx.globalAlpha = 0.18;
      for (s = 0; s < 90; s++) {
        ctx.strokeStyle = rf() < 0.5 ? '#252a2f' : '#98a3ac';
        ctx.lineWidth = 0.6 + rf();
        ctx.beginPath();
        var sx = rf() * w, sy = rf() * h;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + (rf() - 0.5) * 40, sy + (rf() - 0.5) * 40);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }, { repeat: [1, 1], anisotropy: 8 });
  }

  /* ==========================================================================
   * 6. TERRAIN — analytic heightfield + carved battle lane
   * --------------------------------------------------------------------------
   * heightAt() is THE authority: the mesh is displaced with exactly this
   * function, so anything another module plants with it sits on the ground.
   * The lane (|z| <= 18) is exactly y = 0 because the contract says units walk
   * on the ground plane — the drama comes from what happens either side of it.
   * ======================================================================== */

  function mound(x, z, cx, cz, r, hgt) {
    var dx = (x - cx) / r, dz = (z - cz) / r;
    var d = dx * dx + dz * dz;
    if (d >= 1) { return 0; }
    var t = 1 - d;
    return hgt * t * t;
  }

  /** Un-carved landscape. */
  function hills(x, z) {
    var n = 0;
    n += fbm(x * 0.0041, z * 0.0041, 4) * 8.0;
    n += fbm(x * 0.0152 + 31.2, z * 0.0152 - 11.7, 3) * 2.3;
    n += fbm(x * 0.061 - 7.1, z * 0.061 + 3.3, 2) * 0.6;
    /* The ground climbs away from the camera — that rising back wall is what
       gives the battle line a stage instead of an infinite flat plain. */
    n += sstep(55, 190, z) * (14 + ridged(x * 0.0032, 4.4, 3) * 13);
    /* ...and rises again behind the camera so we never look over an edge. */
    n += sstep(-45, -160, z) * 10.0;
    /* hero mounds behind each fort */
    n += mound(x, z, -20, -46, 62, 9);
    n += mound(x, z, 452, -38, 58, 8);
    n += mound(x, z, 120, 96, 74, 7);
    n += mound(x, z, 305, 108, 68, 8.5);
    return n;
  }

  /** 1 inside the lane, 0 well outside. */
  function laneMask(z) {
    return 1 - sstep(LANE_FLAT, LANE_EDGE, Math.abs(z));
  }

  /** THE height function. */
  function heightAt(x, z) {
    if (typeof x !== 'number' || typeof z !== 'number') { return 0; }
    var h = hills(x, z);
    var a = Math.abs(z);
    var m = laneMask(z);
    /* Shallow berms just outside the walkable strip: they read as the spoil of a
       road cut and they hide the seam where the hills stop. */
    var berm = (1 - sstep(21, 33, a)) * sstep(LANE_FLAT - 1, LANE_FLAT + 5, a) * 1.15;
    return h * (1 - m) + berm * m;
  }

  function normalAt(x, z, out) {
    out = out || new THREE.Vector3();
    var e = 1.2;
    var hL = heightAt(x - e, z), hR = heightAt(x + e, z);
    var hD = heightAt(x, z - e), hU = heightAt(x, z + e);
    out.set(hL - hR, 2 * e, hD - hU).normalize();
    return out;
  }

  var terrainMesh = null, terrainMat = null, outerMesh = null;

  var TERRAIN_RES = { high: 3.0, med: 4.6, low: 7.2 };

  function buildTerrain() {
    var step = TERRAIN_RES[tier] || 4.0;
    var nx = Math.max(24, Math.round((X1 - X0) / step));
    var nz = Math.max(16, Math.round((Z1 - Z0) / step));
    var vw = nx + 1, vh = nz + 1, count = vw * vh;

    var pos = new Float32Array(count * 3);
    var uv = new Float32Array(count * 2);
    var hs = new Float32Array(count);
    var i, j, idx, x, z, y;

    for (j = 0; j < vh; j++) {
      z = Z0 + (Z1 - Z0) * (j / nz);
      for (i = 0; i < vw; i++) {
        x = X0 + (X1 - X0) * (i / nx);
        idx = j * vw + i;
        y = heightAt(x, z);
        /* Skirt: drag the border down so the mesh never shows a paper edge. */
        var edge = Math.min(Math.min(i, nx - i) / 2.0, Math.min(j, nz - j) / 2.0);
        if (edge < 1) { y -= (1 - edge) * 9; }
        hs[idx] = y;
        pos[idx * 3] = x; pos[idx * 3 + 1] = y; pos[idx * 3 + 2] = z;
        uv[idx * 2] = i / nx; uv[idx * 2 + 1] = j / nz;
      }
    }

    var triCount = nx * nz * 6;
    var index = count > 65000 ? new Uint32Array(triCount) : new Uint16Array(triCount);
    var t = 0;
    for (j = 0; j < nz; j++) {
      for (i = 0; i < nx; i++) {
        var a = j * vw + i, b = a + 1, c = a + vw, d = c + 1;
        index[t++] = a; index[t++] = c; index[t++] = b;
        index[t++] = b; index[t++] = c; index[t++] = d;
      }
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeVertexNormals();

    paintTerrain(g, hs, vw, vh, nx, nz);
    g.computeBoundingSphere();
    return g;
  }

  /* Palette (sRGB authored, stored linear). */
  var P = {};
  function buildPalette() {
    P.grassA = col('#5c7a37');
    P.grassB = col('#82a04e');
    P.grassDry = col('#938f4c');
    P.dirt = col('#6d5537');
    P.dirtL = col('#8d7049');
    P.mud = col('#4a3a27');
    P.rock = col('#7c7972');
    P.rockD = col('#585650');
    P.sand = col('#a89468');
    P.moss = col('#4d6b33');
  }

  function paintTerrain(g, hs, vw, vh, nx, nz) {
    var pos = g.attributes.position, nrm = g.attributes.normal;
    var n = pos.count, arr = new Float32Array(n * 3);
    var i, j, idx;
    for (j = 0; j < vh; j++) {
      for (i = 0; i < vw; i++) {
        idx = j * vw + i;
        var x = pos.getX(idx), y = pos.getY(idx), z = pos.getZ(idx);
        var ny = nrm.getY(idx);
        var slope = clamp01(1 - ny);
        var az = Math.abs(z);
        var lane = laneMask(z);

        /* --- base ground: grass with dry patches ------------------------- */
        var gv = fbm(x * 0.021, z * 0.021, 3) * 0.5 + 0.5;
        _colA.copy(P.grassA).lerp(P.grassB, gv);
        var dry = clamp01(fbm(x * 0.0072 + 91, z * 0.0072 - 44, 3) * 0.5 + 0.5);
        dry = sstep(0.52, 0.86, dry);
        _colA.lerp(P.grassDry, dry * 0.7);

        /* --- rock on steep faces and high ridges -------------------------- */
        var rockW = sstep(0.22, 0.55, slope);
        rockW = Math.max(rockW, sstep(17, 27, y) * 0.55);
        _colB.copy(P.rock).lerp(P.rockD, clamp01(fbm(x * 0.09, z * 0.09, 2) * 0.5 + 0.5));
        _colA.lerp(_colB, clamp01(rockW));

        /* --- the lane: dirt at the shoulders, churned mud down the middle -- */
        var dirtW = lane * sstep(34, 14, az);
        var track = Math.abs(Math.sin(x * 0.055 + fbm(x * 0.012, 0, 2) * 2.2));
        var mudW = lane * sstep(15, 4, az) * (0.45 + 0.55 * sstep(0.25, 0.9, track));
        var dv = clamp01(fbm(x * 0.05 + 3, z * 0.05 - 8, 3) * 0.5 + 0.5);
        _colB.copy(P.dirt).lerp(P.dirtL, dv);
        _colA.lerp(_colB, clamp01(dirtW * 0.95));
        _colA.lerp(P.mud, clamp01(mudW * 0.8));

        /* --- sand/gravel right at the berm crest --------------------------- */
        var bermW = (1 - sstep(20, 30, az)) * sstep(17, 22, az);
        _colA.lerp(P.sand, bermW * 0.35);

        /* --- moss in the shaded creases ------------------------------------ */
        var mossN = clamp01(fbm(x * 0.033 - 12, z * 0.033 + 27, 3) * 0.5 + 0.5);
        _colA.lerp(P.moss, sstep(0.62, 0.95, mossN) * 0.35 * (1 - lane));

        /* --- baked AO: concavity from the 4-neighbour height average ------- */
        var hC = hs[idx];
        var hL = hs[j * vw + Math.max(0, i - 1)];
        var hR = hs[j * vw + Math.min(vw - 1, i + 1)];
        var hD = hs[Math.max(0, j - 1) * vw + i];
        var hU = hs[Math.min(vh - 1, j + 1) * vw + i];
        var avg = (hL + hR + hD + hU) * 0.25;
        var concave = clamp01((avg - hC) * 0.26);
        var ao = 1 - concave * 0.55;
        /* extra contact darkening in the lane trench and along the berm foot */
        ao *= 1 - lane * sstep(30, 18, az) * 0.16;
        ao *= 1 - sstep(0.45, 0.95, slope) * 0.12;
        /* subtle large-scale luminance break-up so big fields never read flat */
        ao *= 0.94 + (fbm(x * 0.0105 + 55, z * 0.0105 + 13, 2) * 0.5 + 0.5) * 0.12;

        _colA.multiplyScalar(clamp(ao, 0.35, 1.15));

        arr[idx * 3] = _colA.r; arr[idx * 3 + 1] = _colA.g; arr[idx * 3 + 2] = _colA.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }

  function makeGroundMaterial() {
    var useStd = (tier !== 'low') && !!THREE.MeshStandardMaterial;
    var m = useStd
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.0, dithering: true })
      : new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true });

    var triplanar = (tier === 'high');

    inject(m, {
      key: 'terrain_' + tier,
      uniforms: {
        uDetail: { value: TEX.detail },
        uWeather: U.weather,
        uDustCol: U.dustCol,
        uTime: U.time
      },
      vsHead: VS_WORLD_HEAD,
      vs: [['#include <begin_vertex>', VS_WORLD_BODY]],
      fsHead:
        VS_WORLD_HEAD +
        'uniform sampler2D uDetail;\n' +
        'uniform vec4 uWeather;\n' +
        'uniform vec3 uDustCol;\n' +
        'uniform float uTime;\n',
      fs: [
        ['#include <color_fragment>',
          '#include <color_fragment>\n' +
          '{\n' +
          '  vec3 nw = normalize( vAowN );\n' +
          '  vec3 dMicro = texture2D( uDetail, vAowW.xz * 0.115 ).rgb;\n' +
          '  vec3 dMacro = texture2D( uDetail, vAowW.xz * 0.0138 ).rgb;\n' +
          (triplanar
            ? '  vec3 dSide = texture2D( uDetail, vec2( vAowW.x * 0.7 + vAowW.z * 0.7, vAowW.y ) * 0.14 ).rgb;\n' +
              '  dMicro = mix( dSide, dMicro, smoothstep( 0.35, 0.82, abs( nw.y ) ) );\n'
            : '') +
          '  diffuseColor.rgb *= mix( vec3(1.0), dMicro * 1.62, 0.34 );\n' +
          '  diffuseColor.rgb *= mix( vec3(1.0), dMacro * 1.55, 0.30 );\n' +
          '  float wet = uWeather.x;\n' +
          '  float pool = smoothstep( 0.30, 0.85, dMacro.r ) * wet;\n' +
          '  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3(0.40,0.43,0.50), wet * ( 0.45 + 0.55 * pool ) );\n' +
          '  float snowUp = smoothstep( 0.62, 0.96, nw.y );\n' +
          '  float snowMask = clamp( uWeather.y * snowUp * ( 0.55 + 0.75 * dMacro.g ), 0.0, 1.0 );\n' +
          '  diffuseColor.rgb = mix( diffuseColor.rgb, vec3(0.80,0.86,0.96), snowMask );\n' +
          '  diffuseColor.rgb = mix( diffuseColor.rgb, uDustCol, uWeather.z * 0.45 );\n' +
          '}\n'],
        ['#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n' +
          'roughnessFactor *= mix( 1.0, 0.30, uWeather.x );\n' +
          'roughnessFactor = mix( roughnessFactor, 0.92, uWeather.y * 0.6 );\n']
      ]
    });
    return m;
  }

  function buildGround() {
    var g = buildTerrain();
    terrainMat = makeGroundMaterial();
    terrainMesh = new THREE.Mesh(g, terrainMat);
    terrainMesh.name = 'aow.terrain';
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = false;
    terrainMesh.matrixAutoUpdate = false;
    terrainMesh.updateMatrix();
    root.add(terrainMesh);

    /* Backstop plane far below everything — insurance against ever seeing sky
       through a gap at ground level on an unusually wide aspect ratio. */
    var og = new THREE.PlaneGeometry(4200, 4200, 1, 1);
    og.rotateX(-PI / 2);
    var om = new THREE.MeshBasicMaterial({ color: 0x000000, fog: true });
    om.color.copy(P.grassA).multiplyScalar(0.55);
    outerMesh = new THREE.Mesh(og, om);
    outerMesh.position.set(W * 0.5, -7.5, 30);
    outerMesh.matrixAutoUpdate = false;
    outerMesh.updateMatrix();
    outerMesh.renderOrder = -5;
    root.add(outerMesh);
  }

  /* ==========================================================================
   * 7. SKY DOME
   * --------------------------------------------------------------------------
   * A BackSide sphere that follows the camera, built on MeshBasicMaterial so it
   * still goes through three's tone mapping / encode chunks — that is what makes
   * the horizon melt into the fog instead of sitting a shade off it.
   * It draws LAST among opaque objects with depthWrite off, so every pixel the
   * terrain already covers is depth-rejected before the (fairly expensive) cloud
   * maths ever runs.
   * ======================================================================== */

  var skyMesh = null, skyMat = null;
  /* The dome radius must exceed the radial distance to the furthest ridge (it
     has depthTest on, so anything further away would be painted over by the
     sky) while staying inside the renderer's 900-unit far plane. */
  var SKY_R = 860;

  var SU = {
    cloudLit:  { value: new THREE.Color(1, 1, 1) },
    cloudDark: { value: new THREE.Color(0.35, 0.38, 0.45) },
    ground:    { value: new THREE.Color(0.3, 0.32, 0.3) }
  };

  function skyFragment() {
    var layers = (tier === 'low') ? 1 : 2;
    var s = '';
    s += 'float aowN2( vec2 p ) {\n' +
         '  vec4 t = texture2D( uNoise, p );\n' +
         '  return t.r * 0.54 + t.g * 0.27 + t.b * 0.13 + t.a * 0.06;\n' +
         '}\n';
    s += 'float aowCloud( vec2 p, float sc, float sp ) {\n' +
         '  vec2 w = vec2( uTime * sp * 0.0036, uTime * sp * 0.0013 );\n' +
         '  float v = aowN2( p * sc + w ) * 0.63;\n' +
         (tier === 'low' ? '' : '  v += aowN2( p * sc * 2.37 - w * 1.7 ) * 0.37;\n') +
         (tier === 'low' ? '  v *= 1.59;\n' : '') +
         '  return v;\n' +
         '}\n';

    var body = '';
    body += 'vec3 dir = normalize( vAowDir );\n';
    body += 'float hh = dir.y;\n';
    body += 'vec3 skyc = mix( uHorizon, uZenith, pow( clamp( hh, 0.0, 1.0 ), 0.44 ) );\n';
    body += 'skyc = mix( uGround, skyc, smoothstep( -0.14, 0.015, hh ) );\n';
    /* sun */
    body += 'float sd = dot( dir, uSunDir );\n';
    body += 'float gA = pow( max( sd, 0.0 ), 4.0 );\n';
    body += 'float gB = pow( max( sd, 0.0 ), 110.0 );\n';
    body += 'float disc = smoothstep( 0.99968, 0.99991, sd );\n';
    body += 'skyc += uSunCol * ( gA * 0.26 + gB * 0.80 ) * uSunI;\n';
    /* stars, before clouds so cloud cover occludes them */
    body += 'if ( uNight > 0.012 ) {\n' +
            '  vec3 sp = dir * 88.0;\n' +
            '  vec3 ip = floor( sp );\n' +
            '  float hs = fract( sin( dot( ip, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );\n' +
            '  float st = step( 0.9962, hs );\n' +
            '  vec3 fp = fract( sp ) - 0.5;\n' +
            '  st *= 1.0 - smoothstep( 0.0, 0.24, length( fp ) );\n' +
            '  float tw = 0.55 + 0.45 * sin( uTime * 1.7 + hs * 140.0 );\n' +
            '  skyc += vec3( 0.82, 0.88, 1.0 ) * st * tw * uNight * 2.6 * smoothstep( 0.015, 0.22, hh );\n' +
            '  float md = dot( dir, uMoonDir );\n' +
            '  float mdi = smoothstep( 0.99972, 0.99992, md );\n' +
            '  float mgl = pow( max( md, 0.0 ), 220.0 );\n' +
            '  skyc += vec3( 0.84, 0.89, 1.02 ) * ( mdi * 2.4 + mgl * 0.6 ) * uNight;\n' +
            '}\n';
    /* clouds */
    body += 'if ( hh > 0.012 ) {\n' +
            '  vec2 cuv = dir.xz / max( hh, 0.012 );\n' +
            '  vec2 loff = normalize( vec2( uSunDir.x, uSunDir.z ) + vec2( 0.0001, 0.0001 ) ) * 1.6;\n' +
            '  float d1 = aowCloud( cuv, 0.030, 1.0 );\n' +
            '  float l1 = aowCloud( cuv + loff, 0.030, 1.0 );\n' +
            '  float cov = uCloud.x;\n' +
            '  float a1 = smoothstep( 0.62 - cov * 0.50, 0.90 - cov * 0.44, d1 );\n' +
            '  float lit = clamp( ( d1 - l1 ) * 2.4 + 0.5, 0.0, 1.0 );\n' +
            '  vec3 c1 = mix( uCloudDark, uCloudLit, lit );\n' +
            '  c1 += uSunCol * pow( max( sd, 0.0 ), 26.0 ) * lit * uSunI * 0.55;\n' +
            '  a1 *= smoothstep( 0.015, 0.14, hh );\n' +
            '  skyc = mix( skyc, c1, clamp( a1 * ( 0.55 + 0.45 * uCloud.y + 0.35 ), 0.0, 1.0 ) );\n';
    if (layers > 1) {
      body += '  float d2 = aowCloud( cuv * 2.7 + vec2( 41.0, 17.0 ), 0.030, 2.3 );\n' +
              '  float a2 = smoothstep( 0.70 - uCloud.w * 0.46, 0.95 - uCloud.w * 0.40, d2 );\n' +
              '  a2 *= smoothstep( 0.035, 0.28, hh ) * 0.62;\n' +
              '  skyc = mix( skyc, mix( uCloudDark, uCloudLit, 0.72 ), clamp( a2, 0.0, 1.0 ) );\n';
    }
    body += '}\n';
    /* sun disc last so nothing dims it, then weather */
    body += 'skyc += uSunCol * disc * 7.5 * uSunI;\n';
    body += 'skyc = mix( skyc, uDustCol * ( 0.42 + 0.58 * clamp( hh + 0.25, 0.0, 1.0 ) ), uWeather.z * 0.78 );\n';
    body += 'skyc += vec3( 0.72, 0.80, 1.0 ) * uWeather.w;\n';
    body += 'diffuseColor.rgb = skyc;\n';

    return { head: s, body: body };
  }

  function buildSky() {
    var frag = skyFragment();
    var g = new THREE.SphereGeometry(SKY_R, tier === 'low' ? 24 : 40, tier === 'low' ? 14 : 24);
    skyMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.BackSide, fog: false,
      depthWrite: false, depthTest: true, dithering: true
    });

    inject(skyMat, {
      key: 'sky_' + tier,
      uniforms: {
        uNoise: { value: TEX.noise },
        uHorizon: U.horizon, uZenith: U.zenith, uGround: SU.ground,
        uSunDir: U.sunDir, uSunCol: U.sunCol, uSunI: U.sunI,
        uMoonDir: U.moonDir, uNight: U.night,
        uTime: U.time, uCloud: U.cloud, uWeather: U.weather, uDustCol: U.dustCol,
        uCloudLit: SU.cloudLit, uCloudDark: SU.cloudDark
      },
      vsHead: 'varying vec3 vAowDir;\n',
      vs: [['#include <begin_vertex>', '#include <begin_vertex>\n  vAowDir = position;\n']],
      fsHead:
        'varying vec3 vAowDir;\n' +
        'uniform sampler2D uNoise;\n' +
        'uniform vec3 uHorizon;\nuniform vec3 uZenith;\nuniform vec3 uGround;\n' +
        'uniform vec3 uSunDir;\nuniform vec3 uSunCol;\nuniform float uSunI;\n' +
        'uniform vec3 uMoonDir;\nuniform float uNight;\nuniform float uTime;\n' +
        'uniform vec4 uCloud;\nuniform vec4 uWeather;\nuniform vec3 uDustCol;\n' +
        'uniform vec3 uCloudLit;\nuniform vec3 uCloudDark;\n' + frag.head,
      fs: [['#include <map_fragment>', '{\n' + frag.body + '}\n']]
    });

    skyMesh = new THREE.Mesh(g, skyMat);
    skyMesh.name = 'aow.sky';
    skyMesh.frustumCulled = false;
    skyMesh.renderOrder = 900;          // opaque, but drawn after the world
    skyMesh.matrixAutoUpdate = false;
    skyGroup.add(skyMesh);
  }

  /* ==========================================================================
   * 8. DISTANCE — parallax ridges, treeline, lake, birds
   * ======================================================================== */

  var ridges = [];

  function ridgeMaterial(key, haze, hazeBase, topY) {
    var m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
    inject(m, {
      key: key,
      uniforms: {
        uHorizon: U.horizon, uHaze: { value: haze }, uHazeBase: { value: hazeBase },
        uWeather: U.weather, uDustCol: U.dustCol, uTopY: { value: topY || 100 }
      },
      vsHead: 'varying float vAowY;\n',
      vs: [['#include <begin_vertex>', '#include <begin_vertex>\n  vAowY = position.y;\n']],
      fsHead: 'varying float vAowY;\nuniform vec3 uHorizon;\nuniform float uHaze;\n' +
              'uniform float uHazeBase;\nuniform float uTopY;\nuniform vec4 uWeather;\nuniform vec3 uDustCol;\n',
      fs: [['#include <color_fragment>',
        '#include <color_fragment>\n' +
        '{\n' +
        '  float t = clamp( vAowY / max( uTopY, 1.0 ), 0.0, 1.0 );\n' +
        '  float haze = clamp( uHaze + ( 1.0 - t ) * uHazeBase, 0.0, 1.0 );\n' +
        '  vec3 hz = mix( uHorizon, uDustCol, uWeather.z * 0.7 );\n' +
        '  diffuseColor.rgb = mix( diffuseColor.rgb, hz, haze );\n' +
        '  diffuseColor.rgb += vec3( 0.5, 0.55, 0.7 ) * uWeather.w * 0.45;\n' +
        '}\n']]
    });
    return m;
  }

  /**
   * A ridge "curtain": one strip of quads whose top edge is a ridged-noise
   * silhouette. Cheap (a few hundred tris), and because it is real geometry at a
   * real distance the parallax as the camera pans is correct for free.
   */
  function buildRidge(cfg) {
    var n = cfg.cols;
    var pos = new Float32Array(n * 6 * 3);
    var cl = new Float32Array(n * 6 * 3);
    var i, o = 0;
    var xw = (cfg.x1 - cfg.x0) / n;
    var base = new THREE.Color(), top = new THREE.Color();
    var snow = new THREE.Color().copy(col('#e8eef7'));
    base.copy(col(cfg.colBase));
    top.copy(col(cfg.colTop));

    function silh(x) {
      var r = ridged(x * cfg.freq + cfg.seed, cfg.seed * 3.1, 4);
      var r2 = fbm(x * cfg.freq * 3.7 + cfg.seed, 11.3, 3) * 0.5 + 0.5;
      return cfg.h * (0.30 + 0.70 * r) + r2 * cfg.h * 0.16;
    }

    function put(x, y, ca) {
      pos[o * 3] = x; pos[o * 3 + 1] = y; pos[o * 3 + 2] = 0;
      cl[o * 3] = ca.r; cl[o * 3 + 1] = ca.g; cl[o * 3 + 2] = ca.b;
      o++;
    }

    var cA = new THREE.Color(), cB = new THREE.Color();
    for (i = 0; i < n; i++) {
      var xa = cfg.x0 + i * xw, xb = xa + xw;
      var ha = silh(xa), hb = silh(xb);
      var ta = clamp01(ha / cfg.h), tb = clamp01(hb / cfg.h);
      cA.copy(base).lerp(top, ta);
      cB.copy(base).lerp(top, tb);
      if (cfg.snow > 0) {
        cA.lerp(snow, sstep(cfg.snow, cfg.snow + 0.22, ta) * 0.85);
        cB.lerp(snow, sstep(cfg.snow, cfg.snow + 0.22, tb) * 0.85);
      }
      /* vertical facet shading so the silhouette does not read as a flat cutout */
      var fa = 0.82 + (fbm(xa * cfg.freq * 6.0, 3.7, 2) * 0.5 + 0.5) * 0.36;
      var fb = 0.82 + (fbm(xb * cfg.freq * 6.0, 3.7, 2) * 0.5 + 0.5) * 0.36;
      cA.multiplyScalar(fa); cB.multiplyScalar(fb);
      var bt = base.clone().multiplyScalar(0.72);

      put(xa, cfg.baseY, bt); put(xb, cfg.baseY, bt); put(xb, hb, cB);
      put(xa, cfg.baseY, bt); put(xb, hb, cB); put(xa, ha, cA);
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    g.computeBoundingSphere();

    var m = ridgeMaterial('ridge' + cfg.id, cfg.haze, cfg.hazeBase, cfg.h);
    var mesh = new THREE.Mesh(g, m);
    mesh.position.set(0, 0, cfg.z);
    mesh.renderOrder = -20 + cfg.id;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.userData.topY = cfg.h;
    try { m.userData = m.userData || {}; } catch (e) { /* ignore */ }
    distGroup.add(mesh);
    ridges.push({ mesh: mesh, mat: m, cfg: cfg });
    return mesh;
  }

  function buildDistance() {
    /* Three ridge layers. Haze rises with distance — that gradient IS the sense
       of scale; without it the far range looks like a sticker on the sky. */
    buildRidge({
      id: 0, z: 225, x0: -1100, x1: 1600, cols: tier === 'low' ? 120 : 260,
      baseY: -60, h: 62, freq: 0.0031, seed: 3.7, snow: 0,
      colBase: '#4a5a49', colTop: '#6f7d67', haze: 0.42, hazeBase: 0.22
    });
    buildRidge({
      id: 1, z: 370, x0: -1400, x1: 1900, cols: tier === 'low' ? 100 : 220,
      baseY: -90, h: 118, freq: 0.0019, seed: 11.9, snow: 0.72,
      colBase: '#4d5766', colTop: '#77839a', haze: 0.60, hazeBase: 0.20
    });
    buildRidge({
      id: 2, z: 520, x0: -1700, x1: 2200, cols: tier === 'low' ? 80 : 170,
      baseY: -130, h: 196, freq: 0.0012, seed: 27.3, snow: 0.55,
      colBase: '#5a6474', colTop: '#8e99ad', haze: 0.76, hazeBase: 0.16
    });
    /* Treeline band: sits just past the terrain's far lip and hides its edge. */
    buildRidge({
      id: 3, z: 176, x0: -800, x1: 1250, cols: tier === 'low' ? 150 : 330,
      baseY: -30, h: 24, freq: 0.055, seed: 5.1, snow: 0,
      colBase: '#22331d', colTop: '#3d5730', haze: 0.20, hazeBase: 0.16
    });

    buildLake();
    buildBirds();
  }

  /* --- distant lake: flat, sky-tinted, with a drifting specular shimmer ----- */
  var lakeMesh = null;
  function buildLake() {
    var g = new THREE.PlaneGeometry(1600, 190, 1, 1);
    g.rotateX(-PI / 2);
    var m = new THREE.MeshBasicMaterial({ fog: false, color: 0xffffff });
    inject(m, {
      key: 'lake',
      uniforms: {
        uNoise: { value: TEX.noise }, uHorizon: U.horizon, uZenith: U.zenith,
        uSunDir: U.sunDir, uSunCol: U.sunCol, uSunI: U.sunI, uTime: U.time,
        uCam: U.cam, uWeather: U.weather
      },
      vsHead: VS_WORLD_HEAD,
      vs: [['#include <begin_vertex>', VS_WORLDPOS_BODY]],
      fsHead: VS_WORLD_HEAD +
        'uniform sampler2D uNoise;\nuniform vec3 uHorizon;\nuniform vec3 uZenith;\n' +
        'uniform vec3 uSunDir;\nuniform vec3 uSunCol;\nuniform float uSunI;\n' +
        'uniform float uTime;\nuniform vec3 uCam;\nuniform vec4 uWeather;\n',
      fs: [['#include <map_fragment>',
        '{\n' +
        '  vec3 vd = normalize( vAowW - uCam );\n' +
        '  float fres = pow( 1.0 - clamp( -vd.y, 0.0, 1.0 ), 3.2 );\n' +
        '  vec3 base = mix( uZenith * 0.55, uHorizon, 0.65 );\n' +
        '  vec3 wc = mix( base * 0.62, base, fres );\n' +
        '  vec2 ruv = vAowW.xz * 0.010 + vec2( uTime * 0.010, uTime * 0.004 );\n' +
        '  float rip = texture2D( uNoise, ruv ).g + texture2D( uNoise, ruv * 2.7 - uTime * 0.006 ).b;\n' +
        '  float spark = smoothstep( 1.05, 1.32, rip ) * clamp( uSunDir.y + 0.25, 0.0, 1.0 );\n' +
        '  wc += uSunCol * spark * 1.5 * uSunI * ( 1.0 - uWeather.z );\n' +
        '  diffuseColor.rgb = wc;\n' +
        '}\n']]
    });
    lakeMesh = new THREE.Mesh(g, m);
    lakeMesh.position.set(W * 0.5, 9.5, 205);
    lakeMesh.renderOrder = -18;
    lakeMesh.frustumCulled = false;
    lakeMesh.matrixAutoUpdate = false;
    lakeMesh.updateMatrix();
    distGroup.add(lakeMesh);
  }

  /* --- birds: 6-vertex Vs on lazy circular paths, flapped in the shader ----- */
  var birdMesh = null;
  var birdCentre = { value: new THREE.Vector3(210, 96, 300) };

  function buildBirds() {
    var n = tier === 'low' ? 9 : 20;
    var pos = new Float32Array(n * 6 * 3);
    var seed = new Float32Array(n * 6);
    var i, v, o = 0;
    for (i = 0; i < n; i++) {
      var s = (i + 0.5) / n;
      /* left wing */
      var tri = [
        [0, 0, -0.9], [-3.4, 0, 1.5], [0, 0, 0.9],
        [0, 0, -0.9], [0, 0, 0.9], [3.4, 0, 1.5]
      ];
      for (v = 0; v < 6; v++) {
        pos[o * 3] = tri[v][0]; pos[o * 3 + 1] = tri[v][1]; pos[o * 3 + 2] = tri[v][2];
        seed[o] = s;
        o++;
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.computeBoundingSphere();

    var m = new THREE.MeshBasicMaterial({ color: 0x2b2f36, side: THREE.DoubleSide, fog: false, transparent: true, opacity: 0.55 });
    inject(m, {
      key: 'birds',
      uniforms: { uTime: U.time, uCentre: birdCentre, uHorizon: U.horizon, uWeather: U.weather },
      vsHead: 'attribute float aSeed;\nuniform float uTime;\nuniform vec3 uCentre;\n',
      vs: [['#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        '{\n' +
        '  float ph = aSeed * 6.28318;\n' +
        '  float sp = 0.045 + aSeed * 0.035;\n' +
        '  float t = uTime * sp + ph;\n' +
        '  float rad = 110.0 + aSeed * 150.0;\n' +
        '  vec3 c = uCentre + vec3( cos( t ) * rad, aSeed * 46.0 - 16.0 + sin( t * 2.3 ) * 4.0, sin( t ) * rad * 0.55 );\n' +
        '  float flap = sin( uTime * ( 5.5 + aSeed * 4.0 ) + ph * 3.0 );\n' +
        '  vec3 p = transformed;\n' +
        '  p.y += abs( p.x ) * flap * 0.55;\n' +
        '  float yaw = -t + 1.5707963;\n' +
        '  float cy = cos( yaw ), sy = sin( yaw );\n' +
        '  vec3 rp = vec3( p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy );\n' +
        '  transformed = c + rp * ( 1.6 + aSeed * 0.9 );\n' +
        '}\n']],
      fsHead: 'uniform vec3 uHorizon;\nuniform vec4 uWeather;\n',
      fs: [['#include <color_fragment>',
        '#include <color_fragment>\n' +
        'diffuseColor.rgb = mix( diffuseColor.rgb, uHorizon, 0.45 );\n' +
        'diffuseColor.a *= 1.0 - uWeather.z * 0.9;\n']]
    });

    birdMesh = new THREE.Mesh(g, m);
    birdMesh.frustumCulled = false;
    birdMesh.renderOrder = -12;
    birdMesh.matrixAutoUpdate = false;
    distGroup.add(birdMesh);
  }

  /* ==========================================================================
   * 9. GOD RAYS — additive cones anchored on the sun, occluded by real geometry
   * ======================================================================== */

  var rayMesh = null, rayI = { value: 0 };

  function buildGodRays() {
    var n = 9, i, v;
    var pos = new Float32Array(n * 6 * 3);
    var auv = new Float32Array(n * 6 * 2);
    var seed = new Float32Array(n * 6);
    var rf = makeRng(8123);
    var o = 0;
    for (i = 0; i < n; i++) {
      var ang = (i / n) * TAU + rf() * 0.35;
      var len = 130 + rf() * 240;
      var w0 = 5 + rf() * 9;
      var w1 = w0 * (2.2 + rf() * 2.4);
      var ca = Math.cos(ang), sa = Math.sin(ang);
      /* quad in the local XY plane: base at the origin (the sun), out along +Y */
      var quad = [
        [-w0, 0], [w0, 0], [w1, len],
        [-w0, 0], [w1, len], [-w1, len]
      ];
      var uvs = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
      var sv = rf();
      for (v = 0; v < 6; v++) {
        var lx = quad[v][0], ly = quad[v][1];
        pos[o * 3] = lx * ca - ly * sa;
        pos[o * 3 + 1] = lx * sa + ly * ca;
        pos[o * 3 + 2] = 0;
        auv[o * 2] = uvs[v][0]; auv[o * 2 + 1] = uvs[v][1];
        seed[o] = sv;
        o++;
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aUv', new THREE.BufferAttribute(auv, 2));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.computeBoundingSphere();

    var m = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false,
      side: THREE.DoubleSide
    });
    inject(m, {
      key: 'godray',
      uniforms: { uTime: U.time, uSunCol: U.sunCol, uRayI: rayI },
      vsHead: 'attribute vec2 aUv;\nattribute float aSeed;\nuniform float uTime;\nvarying vec2 vAowUv;\nvarying float vAowS;\n',
      vs: [['#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        'vAowUv = aUv; vAowS = aSeed;\n' +
        'transformed.xy *= 1.0 + 0.20 * sin( uTime * 0.21 + aSeed * 6.2831 );\n']],
      fsHead: 'varying vec2 vAowUv;\nvarying float vAowS;\nuniform vec3 uSunCol;\nuniform float uRayI;\nuniform float uTime;\n',
      fs: [['#include <map_fragment>',
        '{\n' +
        '  float across = 1.0 - abs( vAowUv.x * 2.0 - 1.0 );\n' +
        '  float along = 1.0 - vAowUv.y;\n' +
        '  float a = pow( across, 1.7 ) * pow( along, 1.5 );\n' +
        '  a *= 0.55 + 0.45 * sin( uTime * 0.33 + vAowS * 12.0 );\n' +
        '  diffuseColor.rgb = uSunCol;\n' +
        '  diffuseColor.a = a * uRayI;\n' +
        '}\n']]
    });

    rayMesh = new THREE.Mesh(g, m);
    rayMesh.frustumCulled = false;
    rayMesh.renderOrder = 850;
    rayMesh.visible = false;
    fxGroup.add(rayMesh);
  }

  /* ==========================================================================
   * 10. PROP SYSTEM — instanced, chunked, wind-swayed, era-cross-faded
   * --------------------------------------------------------------------------
   * Every prop type owns:
   *   geo      shared base geometry (vertex-coloured, origin at its base)
   *   mat      one injected material (wind + density cut + era fade)
   *   cut      uniform: instances whose aRand exceeds it shrink away — this is
   *            how era dressing changes DENSITY without popping
   *   fade     uniform: whole-type cross-fade
   *   chunks   one InstancedMesh per x-chunk so distance culling is wholesale
   * ======================================================================== */

  var CHUNKS = 8;
  var chunkW = (X1 - X0) / CHUNKS;
  var PROPS = {};
  var propOrder = [];

  function propMaterial(cfg) {
    var useStd = (tier !== 'low') && !!THREE.MeshStandardMaterial;
    var params = {
      vertexColors: true,
      side: cfg.side || THREE.FrontSide,
      transparent: false
    };
    if (cfg.map) { params.map = cfg.map; params.alphaTest = cfg.alphaTest || 0.42; }
    var m;
    if (useStd) {
      params.roughness = (cfg.roughness === undefined) ? 0.85 : cfg.roughness;
      params.metalness = (cfg.metalness === undefined) ? 0.0 : cfg.metalness;
      m = new THREE.MeshStandardMaterial(params);
      if (cfg.emissive) {
        m.emissive.copy(col(cfg.emissive));
        m.emissiveIntensity = cfg.emissiveIntensity || 1;
      }
    } else {
      m = new THREE.MeshLambertMaterial(params);
      if (cfg.emissive) { m.emissive.copy(col(cfg.emissive)); }
    }

    var uni = {
      uTime: U.time, uWind: U.wind, uCam: U.cam, uWeather: U.weather,
      uCut: cfg.cut, uFade: cfg.fade,
      uSway: { value: new THREE.Vector2(cfg.sway || 0, cfg.swayH || 1) },
      uGFade: U.gFade
    };

    var swayCode = (cfg.sway > 0)
      ? '  float ph = aowIP.x * 0.213 + aowIP.z * 0.171;\n' +
        '  float hn = clamp( transformed.y / uSway.y, 0.0, 1.0 );\n' +
        '  float bend = hn * hn;\n' +
        '  float gust = 0.65 + 0.35 * sin( uTime * 0.21 + aowIP.x * 0.013 );\n' +
        '  float wv = sin( uTime * uWind.w + ph ) * 0.62 + sin( uTime * uWind.w * 2.13 + ph * 1.7 ) * 0.38;\n' +
        '  wv *= gust * ( 1.0 + uWeather.z * 1.4 + uWeather.x * 0.5 );\n' +
        '  transformed.x += uWind.x * wv * bend * uSway.x;\n' +
        '  transformed.z += uWind.z * wv * bend * uSway.x;\n' +
        '  transformed.y -= bend * abs( wv ) * uSway.x * 0.16;\n'
      : '';

    var clothCode = cfg.cloth
      ? '  float clh = clamp( transformed.y / uSway.y, 0.0, 1.0 );\n' +
        '  float rip = sin( transformed.x * 5.5 - uTime * ( 2.4 + uWind.w * 1.7 ) );\n' +
        '  float rip2 = sin( transformed.y * 3.1 - uTime * ( 1.7 + uWind.w ) );\n' +
        '  transformed.z += ( rip * 0.62 + rip2 * 0.38 ) * 0.13 * ( 0.30 + clh ) * ( 0.45 + uWind.w * 0.55 );\n'
      : '';

    var distCode = cfg.distFade
      ? '  aowS *= 1.0 - smoothstep( uGFade.x, uGFade.y, length( aowIP.xz - uCam.xz ) );\n'
      : '';

    var body =
      '#include <begin_vertex>\n' +
      '{\n' +
      '#ifdef USE_INSTANCING\n' +
      '  vec3 aowIP = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );\n' +
      '#else\n' +
      '  vec3 aowIP = vec3( 0.0 );\n' +
      '#endif\n' +
      '  float aowS = 1.0 - smoothstep( uCut.x - uCut.y, uCut.x, aRand );\n' +
      '  aowS *= uFade;\n' +
      distCode +
      swayCode +
      clothCode +
      '  transformed *= aowS;\n' +
      '}\n';

    var head =
      'attribute float aRand;\n' +
      'uniform float uTime;\nuniform vec4 uWind;\nuniform vec3 uCam;\nuniform vec4 uWeather;\n' +
      'uniform vec2 uCut;\nuniform float uFade;\nuniform vec2 uSway;\nuniform vec2 uGFade;\n';

    var fsList = [];
    if (cfg.weatherTint !== false) {
      fsList.push(['#include <color_fragment>',
        '#include <color_fragment>\n' +
        'diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3(0.55,0.58,0.64), uWeather.x * 0.55 );\n' +
        'diffuseColor.rgb = mix( diffuseColor.rgb, vec3(0.80,0.86,0.96), uWeather.y * ' + (cfg.snowTake || 0.35).toFixed(3) + ' );\n' +
        'diffuseColor.rgb = mix( diffuseColor.rgb, uDustCol, uWeather.z * 0.40 );\n']);
    }

    inject(m, {
      key: cfg.key + '_' + tier,
      uniforms: (function () {
        var u = {};
        for (var k in uni) { u[k] = uni[k]; }
        u.uDustCol = U.dustCol;
        return u;
      })(),
      vsHead: head,
      vs: [['#include <begin_vertex>', body]],
      fsHead: 'uniform vec4 uWeather;\nuniform vec3 uDustCol;\n',
      fs: fsList
    });

    /* Matching depth material so shadows sway and fade with the prop instead of
       leaving ghosts on the ground during an era change. */
    var dm = null;
    if (cfg.cast) {
      dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      if (cfg.map) { dm.map = cfg.map; dm.alphaTest = cfg.alphaTest || 0.42; }
      inject(dm, {
        key: cfg.key + '_depth_' + tier,
        uniforms: (function () {
          var u = {};
          for (var k in uni) { u[k] = uni[k]; }
          return u;
        })(),
        vsHead: head,
        vs: [['#include <begin_vertex>', body]]
      });
    }
    return { mat: m, depth: dm };
  }

  function defineProp(name, geo, cfg) {
    cfg = cfg || {};
    cfg.key = name;
    cfg.cut = { value: new THREE.Vector2(1, 0.14) };
    cfg.fade = { value: 1 };
    var mats = propMaterial(cfg);
    var p = {
      name: name, geo: geo, mat: mats.mat, depth: mats.depth,
      cut: cfg.cut, fade: cfg.fade,
      tCut: 1, tFade: 1,
      cast: !!cfg.cast, recv: cfg.recv !== false,
      list: [], chunks: new Array(CHUNKS), maxDensity: 1
    };
    PROPS[name] = p;
    propOrder.push(name);
    return p;
  }

  /* --------------------------------------------------------------------------
   * 10a. GEOMETRY BUILDERS
   * ------------------------------------------------------------------------ */

  function geoPine() {
    var rf = makeRng(101);
    var parts = [];
    var tr = cyl(0.13, 0.30, 3.2, 6);
    paint(tr, function (c, x, y) {
      c.copy(col('#4a3421')).lerp(col('#6b4d31'), (vnoise(x * 9, y * 3)));
      c.multiplyScalar(0.72 + clamp01(y / 3.2) * 0.4);
    });
    parts.push(tr);
    var i, yy = 1.5, r = 1.5, hh = 2.1;
    for (i = 0; i < 4; i++) {
      var c1 = cone(r, hh, 7);
      c1.translate(0, yy, 0);
      (function (base, top) {
        paint(c1, function (c, x, y, z) {
          var t = clamp01((y - base) / Math.max(0.2, top - base));
          c.copy(col('#1d3a1e')).lerp(col('#3f6b32'), t * 0.85 + vnoise(x * 6, z * 6) * 0.28);
          c.multiplyScalar(0.68 + t * 0.44);
        });
      })(yy, yy + hh);
      parts.push(c1);
      yy += hh * 0.62; r *= 0.76; hh *= 0.86;
    }
    var g = mergeGeos(parts);
    g.scale(1, 1, 1);
    return g;
  }

  function geoBroad() {
    var rf = makeRng(202);
    var parts = [];
    var tr = cyl(0.16, 0.38, 2.6, 6);
    paint(tr, function (c, x, y) {
      c.copy(col('#5a4630')).lerp(col('#7d6444'), vnoise(x * 8, y * 4));
      c.multiplyScalar(0.7 + clamp01(y / 2.6) * 0.42);
    });
    parts.push(tr);
    /* two leaning limbs give the silhouette something to read against the sky */
    var l1 = cyl(0.09, 0.16, 1.9, 5);
    l1.rotateZ(0.6); l1.translate(0.35, 2.2, 0.1);
    var l2 = cyl(0.09, 0.16, 1.7, 5);
    l2.rotateZ(-0.7); l2.translate(-0.32, 2.3, -0.15);
    paint(l1, function (c) { c.copy(col('#6b5439')); });
    paint(l2, function (c) { c.copy(col('#634e34')); });
    parts.push(l1, l2);

    var i;
    var centres = [[0, 3.9, 0, 1.65], [1.15, 3.4, 0.25, 1.15], [-1.05, 3.55, -0.3, 1.05], [0.15, 4.7, -0.4, 1.0]];
    for (i = 0; i < centres.length; i++) {
      var cdef = centres[i];
      var b = blob(cdef[3], 1);
      jitter(b, cdef[3] * 0.42, rf);
      b.computeVertexNormals();
      b.translate(cdef[0], cdef[1], cdef[2]);
      (function (cy, rad) {
        paint(b, function (c, x, y, z) {
          var up = clamp01((y - (cy - rad)) / (rad * 2));
          c.copy(col('#33501f')).lerp(col('#7ea343'), up * 0.9 + vnoise(x * 3.3, z * 3.3) * 0.3);
          c.multiplyScalar(0.62 + up * 0.55);
        });
      })(cdef[1], cdef[3]);
      parts.push(b);
    }
    return mergeGeos(parts);
  }

  function geoBamboo() {
    var rf = makeRng(303);
    var parts = [], i, k;
    for (i = 0; i < 5; i++) {
      var h = 4.2 + rf() * 3.4;
      var st = cyl(0.055, 0.075, h, 5);
      var ox = (rf() - 0.5) * 0.85, oz = (rf() - 0.5) * 0.85;
      st.rotateZ((rf() - 0.5) * 0.16);
      st.rotateX((rf() - 0.5) * 0.16);
      st.translate(ox, 0, oz);
      paint(st, function (c, x, y) {
        var seg = Math.abs(Math.sin(y * 3.4));
        c.copy(col('#6f8f3a')).lerp(col('#a8bd63'), clamp01(y / 6) * 0.7);
        c.multiplyScalar(0.82 + seg * 0.3);
      });
      parts.push(st);
      for (k = 0; k < 4; k++) {
        var lf = quadXY(0.16, 0.85);
        lf.rotateX(-PI * 0.5 + 0.7);
        lf.rotateY(rf() * TAU);
        lf.translate(ox, h * (0.55 + rf() * 0.42), oz);
        paint(lf, function (c) { c.copy(col('#5d8a33')).multiplyScalar(0.85 + rf() * 0.4); });
        parts.push(lf);
      }
    }
    return mergeGeos(parts);
  }

  function geoSakura() {
    var rf = makeRng(404);
    var parts = [];
    var tr = cyl(0.13, 0.32, 2.3, 6);
    paint(tr, function (c, x, y) { c.copy(col('#4a3b34')).multiplyScalar(0.72 + clamp01(y / 2.3) * 0.4); });
    parts.push(tr);
    var arms = [[0.5, -0.5], [-0.55, 0.4], [0.1, 0.6]];
    var i;
    for (i = 0; i < arms.length; i++) {
      var a = cyl(0.07, 0.14, 1.6, 5);
      a.rotateZ(arms[i][0]); a.rotateX(arms[i][1]);
      a.translate(0, 2.0, 0);
      paint(a, function (c) { c.copy(col('#54443b')); });
      parts.push(a);
    }
    var centres = [[0, 3.5, 0, 1.5], [1.0, 3.2, 0.3, 1.0], [-0.95, 3.3, -0.25, 0.95], [0.1, 4.1, -0.2, 0.85]];
    for (i = 0; i < centres.length; i++) {
      var cd = centres[i];
      var b = blob(cd[3], 1);
      jitter(b, cd[3] * 0.36, rf);
      b.computeVertexNormals();
      b.translate(cd[0], cd[1], cd[2]);
      (function (cy, rad) {
        paint(b, function (c, x, y, z) {
          var up = clamp01((y - (cy - rad)) / (rad * 2));
          c.copy(col('#d98cb0')).lerp(col('#ffe3ee'), up * 0.85 + vnoise(x * 4, z * 4) * 0.3);
          c.multiplyScalar(0.72 + up * 0.4);
        });
      })(cd[1], cd[3]);
      parts.push(b);
    }
    return mergeGeos(parts);
  }

  function geoRock() {
    var rf = makeRng(505);
    var g = blob(1, 1);
    jitter(g, 0.62, rf);
    g.scale(1.25, 0.82, 1.05);
    g = g.toNonIndexed();
    g.computeVertexNormals();          // non-indexed → hard facets, which is the look
    g.translate(0, 0.55, 0);
    paint(g, function (c, x, y, z, ny) {
      var up = clamp01(ny);
      c.copy(col('#6e6b64')).lerp(col('#8f8c84'), vnoise(x * 2.2, z * 2.2));
      c.lerp(col('#4a5a34'), up * up * 0.30 * (vnoise(x * 3.1 + 9, z * 3.1) > 0.45 ? 1 : 0.2));
      c.multiplyScalar(0.62 + clamp01(y / 1.4) * 0.5);
    });
    return g;
  }

  function geoBush() {
    var rf = makeRng(606);
    var parts = [], i;
    var centres = [[0, 0.42, 0, 0.55], [0.42, 0.34, 0.2, 0.4], [-0.36, 0.3, -0.22, 0.38]];
    for (i = 0; i < centres.length; i++) {
      var cd = centres[i];
      var b = blob(cd[3], 1);
      jitter(b, cd[3] * 0.45, rf);
      b.computeVertexNormals();
      b.translate(cd[0], cd[1], cd[2]);
      (function (cy, rad) {
        paint(b, function (c, x, y, z) {
          var up = clamp01((y - (cy - rad)) / (rad * 2));
          c.copy(col('#2c4419')).lerp(col('#6d8f3c'), up * 0.95 + vnoise(x * 5, z * 5) * 0.3);
          c.multiplyScalar(0.58 + up * 0.62);
        });
      })(cd[1], cd[3]);
      parts.push(b);
    }
    return mergeGeos(parts);
  }

  function geoGrass() {
    var parts = [], i;
    var n = (tier === 'low') ? 2 : 3;
    for (i = 0; i < n; i++) {
      var q = quadXY(0.72, 0.62);
      q.rotateY((i / n) * PI + 0.35);
      parts.push(q);
    }
    var g = mergeGeos(parts);
    paint(g, function (c, x, y) { c.setRGB(1, 1, 1).multiplyScalar(0.78 + clamp01(y / 0.62) * 0.45); });
    return g;
  }

  function geoFence() {
    var parts = [];
    var p1 = box(0.13, 1.25, 0.13); p1.translate(-1.0, 0, 0);
    var p2 = box(0.13, 1.25, 0.13); p2.translate(1.0, 0, 0);
    var r1 = box(2.1, 0.10, 0.07); r1.translate(0, 0.85, 0);
    var r2 = box(2.1, 0.10, 0.07); r2.translate(0, 0.48, 0);
    parts.push(p1, p2, r1, r2);
    var g = mergeGeos(parts);
    paint(g, function (c, x, y, z) {
      c.copy(col('#6b543a')).lerp(col('#8a6f4d'), vnoise(x * 4, y * 9));
      c.multiplyScalar(0.66 + clamp01(y / 1.25) * 0.44);
    });
    return g;
  }

  /* The pole and the cloth are separate props on purpose: instanceColor
     multiplies the WHOLE mesh, so a per-era banner tint on a combined geometry
     would dye the timber red as well. */
  function geoBannerPole() {
    var parts = [];
    var pole = cyl(0.055, 0.07, 3.6, 6);
    paint(pole, function (c, x, y) { c.copy(col('#54432c')).multiplyScalar(0.7 + clamp01(y / 3.6) * 0.4); });
    var cap = cone(0.11, 0.28, 6); cap.translate(0, 3.6, 0);
    paint(cap, function (c) { c.copy(col('#c9a24a')); });
    var arm = cyl(0.035, 0.035, 0.72, 5);
    arm.rotateZ(PI * 0.5); arm.translate(0.02, 3.28, 0);
    paint(arm, function (c) { c.copy(col('#4b3c28')); });
    parts.push(pole, cap, arm);
    return mergeGeos(parts);
  }

  function geoBannerCloth() {
    var cloth = new THREE.PlaneGeometry(0.92, 1.75, 5, 4);
    cloth.translate(0.50, 2.28, 0);
    paint(cloth, function (c, x, y) {
      var t = clamp01((y - 1.40) / 1.75);
      c.setRGB(1, 1, 1).multiplyScalar(0.62 + t * 0.62);
      /* a stitched hem reads at a glance even at 1 metre on screen */
      if (x > 0.86) { c.multiplyScalar(0.7); }
    });
    return cloth;
  }

  function geoColumn() {
    var parts = [];
    var base = box(1.05, 0.28, 1.05); base.translate(0, 0, 0);
    var shaft = cyl(0.33, 0.40, 3.9, 12); shaft.translate(0, 0.28, 0);
    var cap = box(0.98, 0.30, 0.98); cap.translate(0, 4.18, 0);
    parts.push(base, shaft, cap);
    var g = mergeGeos(parts);
    paint(g, function (c, x, y, z) {
      var flute = 0.5 + 0.5 * Math.sin(Math.atan2(z, x) * 12);
      c.copy(col('#cfc6b0')).lerp(col('#9d9482'), vnoise(x * 3, y * 1.5) * 0.7 + flute * 0.25);
      c.multiplyScalar(0.62 + clamp01(y / 4.4) * 0.46);
    });
    return g;
  }

  function geoPylon() {
    var parts = [];
    var b = cyl(0.42, 0.62, 0.5, 8);
    var s = cyl(0.24, 0.32, 4.6, 8); s.translate(0, 0.5, 0);
    var t = cone(0.34, 0.9, 8); t.translate(0, 5.1, 0);
    parts.push(b, s, t);
    var g = mergeGeos(parts);
    paint(g, function (c, x, y) {
      c.copy(col('#59636c')).lerp(col('#8f9aa4'), vnoise(x * 5, y * 5));
      c.multiplyScalar(0.6 + clamp01(y / 6) * 0.5);
    });
    /* glow bands, kept as a separate emissive prop so bloom picks them up */
    return g;
  }

  function geoPylonGlow() {
    var parts = [], i;
    for (i = 0; i < 3; i++) {
      var r = new THREE.TorusGeometry(0.30, 0.055, 5, 12);
      r.rotateX(PI / 2);
      r.translate(0, 1.4 + i * 1.25, 0);
      parts.push(r);
    }
    var tip = blob(0.22, 0); tip.translate(0, 5.35, 0);
    parts.push(tip);
    var g = mergeGeos(parts);
    paint(g, function (c) { c.copy(col('#7fe8ff')); });
    return g;
  }

  function geoFirePit() {
    var rf = makeRng(707);
    var parts = [], i;
    for (i = 0; i < 9; i++) {
      var a = (i / 9) * TAU;
      var s = blob(0.19 + rf() * 0.1, 0);
      jitter(s, 0.1, rf);
      s.computeVertexNormals();
      s.scale(1, 0.7, 1);
      s.translate(Math.cos(a) * 0.72, 0.11, Math.sin(a) * 0.72);
      paint(s, function (c, x, y) { c.copy(col('#6a675f')).multiplyScalar(0.6 + y * 0.9); });
      parts.push(s);
    }
    for (i = 0; i < 4; i++) {
      var lg = cyl(0.07, 0.09, 1.0, 5);
      lg.rotateZ(PI * 0.5 - 0.5);
      lg.rotateY((i / 4) * PI * 1.3);
      lg.translate(0, 0.12, 0);
      paint(lg, function (c, x, y, z) { c.copy(col('#2e241a')).lerp(col('#54402c'), vnoise(x * 8, z * 8)); });
      parts.push(lg);
    }
    return mergeGeos(parts);
  }

  function geoDebris() {
    var rf = makeRng(808);
    var parts = [];
    /* broken shield, half-buried */
    var sh = new THREE.CylinderGeometry(0.44, 0.44, 0.07, 10);
    sh.rotateX(PI * 0.42); sh.rotateZ(0.35);
    sh.translate(0, 0.22, 0);
    paint(sh, function (c, x, y, z) {
      var rr = Math.sqrt(x * x + z * z);
      c.copy(col('#7a3b2c')).lerp(col('#c8b184'), rr > 0.3 ? 0.8 : 0.1);
      c.multiplyScalar(0.7 + clamp01(y) * 0.4);
    });
    parts.push(sh);
    /* two arrows stuck in the dirt */
    var i;
    for (i = 0; i < 2; i++) {
      var sa = cyl(0.018, 0.022, 0.95, 4);
      sa.rotateZ(0.42 - i * 0.9); sa.rotateY(i * 1.9);
      sa.translate(0.55 - i * 0.9, 0, 0.3 * i);
      paint(sa, function (c) { c.copy(col('#7d6242')); });
      parts.push(sa);
      var fl = quadXY(0.10, 0.24);
      fl.rotateZ(0.42 - i * 0.9); fl.rotateY(i * 1.9 + 0.6);
      fl.translate(0.55 - i * 0.9 - (0.42 - i * 0.9) * 0.6, 0.62, 0.3 * i);
      paint(fl, function (c) { c.copy(col('#b9b0a2')); });
      parts.push(fl);
    }
    /* a bone or two */
    var bn = cyl(0.045, 0.045, 0.5, 5);
    bn.rotateZ(PI * 0.5); bn.translate(-0.5, 0.05, 0.45);
    var k1 = blob(0.08, 0); k1.translate(-0.75, 0.06, 0.45);
    var k2 = blob(0.08, 0); k2.translate(-0.25, 0.06, 0.45);
    [bn, k1, k2].forEach(function (gg) { paint(gg, function (c) { c.copy(col('#cfc7b4')).multiplyScalar(0.85); }); parts.push(gg); });
    return mergeGeos(parts);
  }

  /* --------------------------------------------------------------------------
   * 10b. PLACEMENT
   * ------------------------------------------------------------------------ */

  /** Weighted pick of a z band. bands = [[min,max,weight], ...] */
  function pickZ(rf, bands) {
    var total = 0, i;
    for (i = 0; i < bands.length; i++) { total += bands[i][2]; }
    var r = rf() * total;
    for (i = 0; i < bands.length; i++) {
      r -= bands[i][2];
      if (r <= 0) { return bands[i][0] + (bands[i][1] - bands[i][0]) * rf(); }
    }
    return bands[0][0];
  }

  var _slopeV = new THREE.Vector3();

  function scatterProp(name, count, o) {
    var p = PROPS[name];
    if (!p) { return; }
    var rf = makeRng(o.seed || 1234);
    var tries = 0, made = 0;
    var maxSlope = (o.maxSlope === undefined) ? 0.42 : o.maxSlope;
    var minY = (o.minY === undefined) ? -900 : o.minY;
    var maxY = (o.maxY === undefined) ? 900 : o.maxY;
    var tintA = o.tintA ? col(o.tintA) : null;
    var tintB = o.tintB ? col(o.tintB) : null;

    while (made < count && tries < count * 14) {
      tries++;
      var x = (o.xmin === undefined ? X0 + 10 : o.xmin) +
              ((o.xmax === undefined ? X1 - 10 : o.xmax) - (o.xmin === undefined ? X0 + 10 : o.xmin)) * rf();
      var z = pickZ(rf, o.bands);
      if (rf() < 0.5 && o.mirror !== false) { /* bands are authored on +z; mirror some */ }
      var y = heightAt(x, z);
      if (y < minY || y > maxY) { continue; }
      normalAt(x, z, _slopeV);
      if (1 - _slopeV.y > maxSlope) { continue; }
      /* keep the walkable lane clear of anything a unit could clip through */
      if (!o.allowLane && Math.abs(z) < (o.laneClear === undefined ? 19 : o.laneClear)) { continue; }
      /* keep the fort footprints clear */
      if (Math.abs(x - 20) < (o.fortClear || 16) && Math.abs(z) < 26) { continue; }
      if (Math.abs(x - 400) < (o.fortClear || 16) && Math.abs(z) < 26) { continue; }
      /* blue-noise-ish rejection: thin out anything too close to a sibling */
      if (o.minDist) {
        var ok = true, k;
        for (k = p.list.length - 1; k >= 0 && k > p.list.length - 60; k--) {
          var e = p.list[k];
          var dx = e.x - x, dz = e.z - z;
          if (dx * dx + dz * dz < o.minDist * o.minDist) { ok = false; break; }
        }
        if (!ok) { continue; }
      }

      var s = (o.scaleMin || 0.85) + ((o.scaleMax || 1.2) - (o.scaleMin || 0.85)) * rf();
      /* things further from the lane read smaller — cheap depth cue */
      if (o.shrinkFar) { s *= 1 - clamp01((Math.abs(z) - 30) / 170) * 0.28; }

      var e2 = {
        x: x, y: y + (o.sink || 0), z: z,
        rot: rf() * TAU,
        tilt: (o.tilt ? (rf() - 0.5) * o.tilt : 0),
        s: s,
        sy: s * (1 + (rf() - 0.5) * (o.yVar || 0.22)),
        r: 1, g: 1, b: 1,
        rand: rf()
      };
      if (tintA && tintB) {
        _colA.copy(tintA).lerp(tintB, rf());
        e2.r = _colA.r; e2.g = _colA.g; e2.b = _colA.b;
      } else {
        var v = 1 + (rf() - 0.5) * (o.shade || 0.26);
        e2.r = v; e2.g = v * (1 + (rf() - 0.5) * 0.08); e2.b = v * (1 + (rf() - 0.5) * 0.08);
      }
      p.list.push(e2);
      made++;
    }
  }

  /** Share vertex attributes, vary only the per-instance aRand. */
  function chunkGeometry(base, randArr) {
    var g = new THREE.BufferGeometry();
    var k;
    for (k in base.attributes) {
      if (Object.prototype.hasOwnProperty.call(base.attributes, k)) { g.setAttribute(k, base.attributes[k]); }
    }
    if (base.index) { g.setIndex(base.index); }
    g.setAttribute('aRand', new THREE.InstancedBufferAttribute(randArr, 1));
    g.boundingSphere = base.boundingSphere ? base.boundingSphere.clone() : null;
    g.boundingBox = base.boundingBox ? base.boundingBox.clone() : null;
    return g;
  }

  function buildPropChunks(name) {
    var p = PROPS[name];
    if (!p || !p.list.length) { return; }
    var buckets = [], i;
    for (i = 0; i < CHUNKS; i++) { buckets.push([]); }
    for (i = 0; i < p.list.length; i++) {
      var e = p.list[i];
      var ci = clamp(Math.floor((e.x - X0) / chunkW), 0, CHUNKS - 1);
      buckets[ci].push(e);
    }
    for (i = 0; i < CHUNKS; i++) {
      var b = buckets[i];
      if (!b.length) { p.chunks[i] = null; continue; }
      /* sort by rand so the density cut removes an unbiased subset */
      b.sort(function (a, c) { return a.rand - c.rand; });
      var rands = new Float32Array(b.length);
      var k;
      for (k = 0; k < b.length; k++) { rands[k] = b[k].rand; }

      var geo = chunkGeometry(p.geo, rands);
      var im = new THREE.InstancedMesh(geo, p.mat, b.length);
      im.name = 'aow.prop.' + name + '.' + i;
      im.castShadow = p.cast && tier !== 'low';
      im.receiveShadow = p.recv && tier === 'high';
      im.frustumCulled = false;              // chunk visibility is manual + exact
      im.matrixAutoUpdate = false;
      if (p.depth) { im.customDepthMaterial = p.depth; }

      for (k = 0; k < b.length; k++) {
        var it = b[k];
        _eul.set(it.tilt, it.rot, it.tilt * 0.6);
        _q.setFromEuler(_eul);
        _v3a.set(it.x, it.y, it.z);
        _scl.set(it.s, it.sy, it.s);
        _m4.compose(_v3a, _q, _scl);
        im.setMatrixAt(k, _m4);
        if (typeof im.setColorAt === 'function') {
          _colA.setRGB(it.r, it.g, it.b);
          im.setColorAt(k, _colA);
        }
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) { im.instanceColor.needsUpdate = true; }
      im.userData.total = b.length;
      im.userData.cx = X0 + (i + 0.5) * chunkW;
      p.chunks[i] = im;
      propGroup.add(im);
    }
    p.list.length = 0;      // placement data has been baked into the buffers
  }

  /* --------------------------------------------------------------------------
   * 10c. ERA DRESSING
   * ------------------------------------------------------------------------ */

  var ERAS = ['tribal', 'greek', 'rome', 'viking', 'japan', 'future'];

  /* density per prop type, per era (0 = absent). */
  var ERA_DENSITY = {
    /*            tribal greek rome  viking japan future */
    pine:      { tribal: 0.30, greek: 0.06, rome: 0.08, viking: 1.00, japan: 0.22, future: 0.14 },
    broad:     { tribal: 0.95, greek: 1.00, rome: 0.82, viking: 0.22, japan: 0.45, future: 0.18 },
    bamboo:    { tribal: 0.00, greek: 0.00, rome: 0.00, viking: 0.00, japan: 1.00, future: 0.10 },
    sakura:    { tribal: 0.00, greek: 0.00, rome: 0.00, viking: 0.00, japan: 0.90, future: 0.06 },
    rock:      { tribal: 1.00, greek: 0.55, rome: 0.40, viking: 0.85, japan: 0.45, future: 0.30 },
    bush:      { tribal: 0.90, greek: 0.85, rome: 0.70, viking: 0.65, japan: 0.80, future: 0.35 },
    grass:     { tribal: 1.00, greek: 0.95, rome: 0.82, viking: 0.68, japan: 0.92, future: 0.42 },
    fence:     { tribal: 0.18, greek: 0.45, rome: 0.85, viking: 0.75, japan: 0.50, future: 0.10 },
    banner:    { tribal: 0.45, greek: 0.70, rome: 1.00, viking: 0.85, japan: 0.90, future: 0.80 },
    bannerCloth: { tribal: 0.45, greek: 0.70, rome: 1.00, viking: 0.85, japan: 0.90, future: 0.80 },
    column:    { tribal: 0.00, greek: 1.00, rome: 0.75, viking: 0.00, japan: 0.05, future: 0.10 },
    pylon:     { tribal: 0.00, greek: 0.00, rome: 0.00, viking: 0.00, japan: 0.00, future: 1.00 },
    pylonGlow: { tribal: 0.00, greek: 0.00, rome: 0.00, viking: 0.00, japan: 0.00, future: 1.00 },
    firepit:   { tribal: 1.00, greek: 0.80, rome: 0.85, viking: 1.00, japan: 0.70, future: 0.35 },
    debris:    { tribal: 0.85, greek: 0.90, rome: 1.00, viking: 1.00, japan: 0.85, future: 0.90 }
  };

  var ERA_LOOK = {
    tribal: { banner: '#8f4526', snow: 0.00, road: 0, plate: 0, grassTint: '#7f9245', cloud: 0.26, wind: 0.9 },
    greek:  { banner: '#2f6fa8', snow: 0.00, road: 0, plate: 0, grassTint: '#8ea24e', cloud: 0.22, wind: 0.8 },
    rome:   { banner: '#9d2222', snow: 0.00, road: 1, plate: 0, grassTint: '#87994a', cloud: 0.30, wind: 0.9 },
    viking: { banner: '#3d5f7d', snow: 0.55, road: 0, plate: 0, grassTint: '#6e8047', cloud: 0.52, wind: 1.5 },
    japan:  { banner: '#c8323c', snow: 0.00, road: 0, plate: 0, grassTint: '#7fa04a', cloud: 0.34, wind: 1.0 },
    future: { banner: '#2ec6d6', snow: 0.00, road: 0, plate: 1, grassTint: '#6d8a5c', cloud: 0.28, wind: 1.2 }
  };

  var era = 'tribal';
  var eraFade = { t: 1, dur: 1, from: null, to: null };
  var eraSnow = { cur: 0, target: 0 };
  var overlayRoad = null, overlayPlate = null;
  var overlayTarget = { road: 0, plate: 0 };
  var overlayCur = { road: 0, plate: 0 };

  /** Map anything (core era name, index, dressing name) onto a dressing set. */
  function resolveEra(v) {
    if (typeof v === 'number' && isFinite(v)) {
      var coreEras = AOW.ERAS || [];
      if (coreEras.length && v < coreEras.length) { return resolveEra(coreEras[v | 0]); }
      return ERAS[clamp(v | 0, 0, ERAS.length - 1)];
    }
    if (typeof v !== 'string') { return era; }
    var k = v.toLowerCase();
    if (ERA_DENSITY.pine[k] !== undefined) { return k; }
    if (/tribal|stone|cave|prehist|primal/.test(k)) { return 'tribal'; }
    if (/greek|bronze|hellen|sparta|athen/.test(k)) { return 'greek'; }
    if (/rome|roman|iron|legion|imperial/.test(k)) { return 'rome'; }
    if (/viking|norse|medi|castle|knight|dark/.test(k)) { return 'viking'; }
    if (/japan|samurai|sengoku|edo|gunpow|musket|industrial/.test(k)) { return 'japan'; }
    if (/future|sci|space|laser|mech|modern|cyber/.test(k)) { return 'future'; }
    return era;
  }

  function setEra(v, seconds) {
    var name = resolveEra(v);
    if (ERA_DENSITY.pine[name] === undefined) { return era; }
    var immediate = (seconds === 0);
    era = name;
    var look = ERA_LOOK[name];
    var i;
    for (i = 0; i < propOrder.length; i++) {
      var p = PROPS[propOrder[i]];
      var d = ERA_DENSITY[p.name] ? ERA_DENSITY[p.name][name] : 1;
      if (d === undefined) { d = 1; }
      p.tCut = d;
      p.tFade = d > 0.001 ? 1 : 0;
      if (immediate) { p.cut.value.x = d; p.fade.value = p.tFade; }
    }
    eraSnow.target = look.snow;
    overlayTarget.road = look.road;
    overlayTarget.plate = look.plate;
    if (immediate) {
      eraSnow.cur = look.snow;
      overlayCur.road = look.road;
      overlayCur.plate = look.plate;
    }
    /* banner colour is per-era and per-instance-tinted, so recolour in place */
    tintBanners(col(look.banner));
    U.cloud.value.x = Math.max(U.cloud.value.x, 0);        // weather still owns coverage
    eraBaseCloud = look.cloud;
    eraBaseWind = look.wind;
    emit('env:era', { era: name });
    return era;
  }

  var eraBaseCloud = 0.26, eraBaseWind = 0.9;
  var bannerRng = makeRng(9182);

  function tintBanners(c) {
    var p = PROPS.bannerCloth;
    if (!p) { return; }
    var i, k;
    for (i = 0; i < CHUNKS; i++) {
      var im = p.chunks[i];
      if (!im || typeof im.setColorAt !== 'function') { continue; }
      for (k = 0; k < im.count; k++) {
        var v = 0.78 + bannerRng() * 0.44;
        _colA.copy(c).multiplyScalar(v);
        im.setColorAt(k, _colA);
      }
      if (im.instanceColor) { im.instanceColor.needsUpdate = true; }
    }
  }

  /* --- era ground overlays: the roman road and the future plating ---------- */

  function buildOverlay(key, mapTex, repeat, colTint, rough, metal) {
    var g = new THREE.PlaneGeometry(X1 - X0 - 20, 30, 1, 1);
    g.rotateX(-PI / 2);
    var useStd = (tier !== 'low') && !!THREE.MeshStandardMaterial;
    var m = useStd
      ? new THREE.MeshStandardMaterial({ map: mapTex, roughness: rough, metalness: metal, transparent: true, opacity: 1 })
      : new THREE.MeshLambertMaterial({ map: mapTex, transparent: true, opacity: 1 });
    m.color.copy(col(colTint));
    m.polygonOffset = true;
    m.polygonOffsetFactor = -3;
    m.polygonOffsetUnits = -3;
    m.depthWrite = false;
    if (mapTex) { mapTex.repeat.set(repeat[0], repeat[1]); mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping; }

    var fadeU = { value: 0 };
    inject(m, {
      key: 'overlay_' + key + '_' + tier,
      uniforms: { uOFade: fadeU, uWeather: U.weather, uDustCol: U.dustCol },
      fsHead: 'uniform float uOFade;\nuniform vec4 uWeather;\nuniform vec3 uDustCol;\n',
      fs: [['#include <color_fragment>',
        '#include <color_fragment>\n' +
        'float ed = smoothstep( 0.0, 0.14, vUv.y ) * smoothstep( 1.0, 0.86, vUv.y );\n' +
        'diffuseColor.a *= ed * uOFade;\n' +
        'diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3(0.45,0.48,0.55), uWeather.x * 0.6 );\n' +
        'diffuseColor.rgb = mix( diffuseColor.rgb, vec3(0.82,0.87,0.96), uWeather.y * 0.55 );\n' +
        'diffuseColor.rgb = mix( diffuseColor.rgb, uDustCol, uWeather.z * 0.45 );\n']]
    });

    var mesh = new THREE.Mesh(g, m);
    mesh.position.set((X0 + X1) * 0.5, 0.035, 0);
    mesh.receiveShadow = (tier === 'high');
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = -2;
    root.add(mesh);
    return { mesh: mesh, mat: m, fade: fadeU };
  }

  /* ==========================================================================
   * 11. WEATHER
   * --------------------------------------------------------------------------
   * Everything here is GPU-animated: particle systems are built once with a
   * per-particle seed and cycle from a single uTime uniform, so a downpour costs
   * one draw call and zero CPU per frame.
   * ======================================================================== */

  var WEATHER = {
    clear:    { cloud: 0.26, cloudDark: 0.10, rain: 0.0, snow: 0.0, dust: 0.0, wet: 0.00, fog: 1.00, sun: 1.00, wind: 0.55, storm: 0 },
    overcast: { cloud: 0.70, cloudDark: 0.45, rain: 0.0, snow: 0.0, dust: 0.0, wet: 0.08, fog: 1.45, sun: 0.34, wind: 0.95, storm: 0 },
    rain:     { cloud: 0.90, cloudDark: 0.74, rain: 1.0, snow: 0.0, dust: 0.0, wet: 1.00, fog: 2.10, sun: 0.12, wind: 1.70, storm: 1 },
    storm:    { cloud: 0.97, cloudDark: 0.88, rain: 1.3, snow: 0.0, dust: 0.0, wet: 1.00, fog: 2.60, sun: 0.06, wind: 2.60, storm: 2 },
    snow:     { cloud: 0.80, cloudDark: 0.38, rain: 0.0, snow: 1.0, dust: 0.0, wet: 0.12, fog: 2.35, sun: 0.28, wind: 0.85, storm: 0 },
    fog:      { cloud: 0.52, cloudDark: 0.24, rain: 0.0, snow: 0.0, dust: 0.0, wet: 0.22, fog: 4.20, sun: 0.38, wind: 0.25, storm: 0 },
    dust:     { cloud: 0.44, cloudDark: 0.30, rain: 0.0, snow: 0.0, dust: 1.0, wet: 0.00, fog: 3.20, sun: 0.60, wind: 2.90, storm: 0 }
  };

  var wx = { cloud: 0.26, cloudDark: 0.10, rain: 0, snow: 0, dust: 0, wet: 0, fog: 1, sun: 1, wind: 0.55, storm: 0 };
  var wFrom = {}, wTo = null, wT = 1, wDur = 1, wName = 'clear', wPrev = 'clear';

  function copyW(dst, src) {
    dst.cloud = src.cloud; dst.cloudDark = src.cloudDark; dst.rain = src.rain;
    dst.snow = src.snow; dst.dust = src.dust; dst.wet = src.wet;
    dst.fog = src.fog; dst.sun = src.sun; dst.wind = src.wind; dst.storm = src.storm;
    return dst;
  }
  copyW(wFrom, wx);

  function setWeather(name, seconds) {
    if (typeof name !== 'string') { return wName; }
    var key = name.toLowerCase();
    if (!WEATHER[key]) {
      if (/thunder|lightning/.test(key)) { key = 'storm'; }
      else if (/sun|clear|fine/.test(key)) { key = 'clear'; }
      else if (/cloud|grey|gray|dull/.test(key)) { key = 'overcast'; }
      else if (/sand|dust|storm/.test(key)) { key = 'dust'; }
      else if (/mist|haze|fog/.test(key)) { key = 'fog'; }
      else { warn('weather:' + key, 'unknown weather "' + name + '" — ignored.'); return wName; }
    }
    if (key === wName && wT >= 1) { return wName; }
    wPrev = wName;
    wName = key;
    copyW(wFrom, wx);
    wTo = WEATHER[key];
    wDur = (typeof seconds === 'number' && seconds >= 0) ? seconds : 6;
    wT = (wDur <= 0.001) ? 1 : 0;
    if (wT >= 1) { copyW(wx, wTo); applyWeatherImmediate(); }
    emit('env:weather', { weather: key, from: wPrev, seconds: wDur });
    return wName;
  }

  function stepWeather(dt) {
    if (wT >= 1 || !wTo) { return; }
    wT = clamp01(wT + dt / Math.max(0.0001, wDur));
    var e = wT * wT * (3 - 2 * wT);
    wx.cloud = lerp(wFrom.cloud, wTo.cloud, e);
    wx.cloudDark = lerp(wFrom.cloudDark, wTo.cloudDark, e);
    wx.rain = lerp(wFrom.rain, wTo.rain, e);
    wx.snow = lerp(wFrom.snow, wTo.snow, e);
    wx.dust = lerp(wFrom.dust, wTo.dust, e);
    wx.wet = lerp(wFrom.wet, wTo.wet, e);
    wx.fog = lerp(wFrom.fog, wTo.fog, e);
    wx.sun = lerp(wFrom.sun, wTo.sun, e);
    wx.wind = lerp(wFrom.wind, wTo.wind, e);
    wx.storm = lerp(wFrom.storm, wTo.storm, e);
  }

  function applyWeatherImmediate() { /* uniforms are pushed every frame anyway */ }

  /* --------------------------------------------------------------------------
   * 11a. PARTICLE SYSTEMS
   * ------------------------------------------------------------------------ */

  var rainMesh = null, snowMesh = null, dustMesh = null, petalMesh = null;
  var splashMesh = null, smokeMesh = null, emberMesh = null, flameMesh = null;
  var rainA = { value: 0 }, snowA = { value: 0 }, dustA = { value: 0 }, petalA = { value: 0 };
  var splashA = { value: 0 }, smokeA = { value: 0 }, emberA = { value: 0 }, flameA = { value: 1 };
  var pBox = { value: new THREE.Vector3(120, 62, 110) };
  var pCentre = { value: new THREE.Vector3(0, 0, 0) };

  var PCOUNT = {
    high: { rain: 2600, snow: 2200, dust: 1800, petal: 420, splash: 460, smoke: 34, ember: 22 },
    med:  { rain: 1500, snow: 1250, dust: 1000, petal: 240, splash: 260, smoke: 22, ember: 14 },
    low:  { rain: 700,  snow: 620,  dust: 520,  petal: 110, splash: 120, smoke: 12, ember: 8 }
  };

  function pcount(k) { return (PCOUNT[tier] || PCOUNT.med)[k]; }

  /* What we ACTUALLY allocated at build time. Draw ranges and instance counts
     must never exceed these — a tier promotion at runtime would otherwise ask
     the GPU to read past the end of a buffer. */
  var PMAX = { rain: 0, snow: 0, dust: 0, petal: 0, splash: 0 };

  /* --- rain: stretched line segments, wrapped inside a camera-locked box ---- */
  function buildRain() {
    var n = pcount('rain');
    PMAX.rain = n;
    var pos = new Float32Array(n * 2 * 3);
    var seed = new Float32Array(n * 2);
    var tip = new Float32Array(n * 2);
    var rf = makeRng(1717), i;
    for (i = 0; i < n; i++) {
      var x = rf() * 2 - 1, y = rf(), z = rf() * 2 - 1;
      var s = rf();
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x; pos[i * 6 + 4] = y; pos[i * 6 + 5] = z;
      seed[i * 2] = s; seed[i * 2 + 1] = s;
      tip[i * 2] = 0; tip[i * 2 + 1] = 1;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
    g.computeBoundingSphere();

    var m = new THREE.LineBasicMaterial({
      color: 0xc9dcf0, transparent: true, opacity: 1, depthWrite: false, fog: false
    });
    inject(m, {
      key: 'rain',
      uniforms: { uTime: U.time, uWind: U.wind, uBox: pBox, uCentre: pCentre, uAmt: rainA, uHorizon: U.horizon },
      vsHead: 'attribute float aSeed;\nattribute float aTip;\nuniform float uTime;\nuniform vec4 uWind;\n' +
              'uniform vec3 uBox;\nuniform vec3 uCentre;\nvarying float vAowA;\n',
      vs: [['#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        '{\n' +
        '  float sp = 34.0 + aSeed * 22.0;\n' +
        '  float y = mod( position.y * uBox.y - uTime * sp, uBox.y );\n' +
        '  vec3 wp = uCentre + vec3( position.x * uBox.x, y - uBox.y * 0.45, position.z * uBox.z );\n' +
        '  wp.x += uWind.x * ( uBox.y - y ) * 0.055 * uWind.w;\n' +
        '  wp.z += uWind.z * ( uBox.y - y ) * 0.055 * uWind.w;\n' +
        '  float len = 1.6 + aSeed * 1.4;\n' +
        '  wp -= vec3( uWind.x * 0.35 * uWind.w, 1.0, uWind.z * 0.35 * uWind.w ) * aTip * len;\n' +
        '  transformed = wp;\n' +
        '  vAowA = ( 0.35 + 0.65 * aSeed ) * ( 1.0 - aTip * 0.55 );\n' +
        '}\n']],
      fsHead: 'varying float vAowA;\nuniform float uAmt;\nuniform vec3 uHorizon;\n',
      fs: [['#include <color_fragment>',
        '#include <color_fragment>\n' +
        'diffuseColor.rgb = mix( diffuseColor.rgb, uHorizon * 1.6, 0.35 );\n' +
        'diffuseColor.a *= vAowA * uAmt * 0.62;\n']]
    });

    rainMesh = new THREE.LineSegments(g, m);
    rainMesh.frustumCulled = false;
    rainMesh.matrixAutoUpdate = false;
    rainMesh.renderOrder = 700;
    rainMesh.visible = false;
    fxGroup.add(rainMesh);
  }

  /** Shared builder for the soft-sprite point systems. */
  function buildPoints(cfg) {
    var n = cfg.count;
    var pos = new Float32Array(n * 3);
    var seed = new Float32Array(n);
    var rf = makeRng(cfg.seed), i;
    for (i = 0; i < n; i++) {
      if (cfg.place) { cfg.place(pos, i, rf); } else {
        pos[i * 3] = rf() * 2 - 1; pos[i * 3 + 1] = rf(); pos[i * 3 + 2] = rf() * 2 - 1;
      }
      seed[i] = rf();
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.computeBoundingSphere();

    var m = new THREE.PointsMaterial({
      size: cfg.size, map: cfg.map, transparent: true, depthWrite: false,
      sizeAttenuation: true, fog: cfg.fog !== false, opacity: 1,
      blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    m.color.copy(col(cfg.color));

    inject(m, {
      key: cfg.key,
      uniforms: cfg.uniforms,
      vsHead: 'attribute float aSeed;\nvarying float vAowA;\n' + cfg.vsHead,
      vs: [
        ['#include <begin_vertex>', '#include <begin_vertex>\n{\n' + cfg.vs + '}\n'],
        ['gl_PointSize = size;', 'gl_PointSize = size * vAowSz;']
      ],
      fsHead: 'varying float vAowA;\n' + (cfg.fsHead || ''),
      fs: [['#include <color_fragment>', '#include <color_fragment>\n' + (cfg.fs || 'diffuseColor.a *= vAowA;\n')]]
    });

    var pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.matrixAutoUpdate = false;
    pts.renderOrder = cfg.order || 710;
    pts.visible = false;
    fxGroup.add(pts);
    return pts;
  }

  function buildSnow() {
    snowMesh = buildPoints({
      key: 'snow', count: (PMAX.snow = pcount('snow')), size: 0.55, map: TEX.dot,
      color: '#ffffff', seed: 2828, order: 712,
      uniforms: { uTime: U.time, uWind: U.wind, uBox: pBox, uCentre: pCentre, uAmt: snowA },
      vsHead: 'uniform float uTime;\nuniform vec4 uWind;\nuniform vec3 uBox;\nuniform vec3 uCentre;\n' +
              'uniform float uAmt;\nvarying float vAowSz;\n',
      vs:
        '  float sp = 2.2 + aSeed * 2.6;\n' +
        '  float y = mod( position.y * uBox.y - uTime * sp, uBox.y );\n' +
        '  vec3 wp = uCentre + vec3( position.x * uBox.x, y - uBox.y * 0.45, position.z * uBox.z );\n' +
        '  float sw = sin( uTime * ( 0.7 + aSeed ) + aSeed * 31.0 );\n' +
        '  wp.x += sw * 1.9 + uWind.x * ( uBox.y - y ) * 0.045 * uWind.w;\n' +
        '  wp.z += cos( uTime * ( 0.6 + aSeed ) + aSeed * 17.0 ) * 1.5 + uWind.z * ( uBox.y - y ) * 0.045 * uWind.w;\n' +
        '  transformed = wp;\n' +
        '  vAowSz = 0.55 + aSeed * 1.1;\n' +
        '  vAowA = uAmt * ( 0.55 + 0.45 * aSeed );\n'
    });
  }

  function buildDust() {
    dustMesh = buildPoints({
      key: 'dust', count: (PMAX.dust = pcount('dust')), size: 5.5, map: TEX.smoke,
      color: '#c39a63', seed: 3939, order: 714,
      uniforms: { uTime: U.time, uWind: U.wind, uBox: pBox, uCentre: pCentre, uAmt: dustA },
      vsHead: 'uniform float uTime;\nuniform vec4 uWind;\nuniform vec3 uBox;\nuniform vec3 uCentre;\n' +
              'uniform float uAmt;\nvarying float vAowSz;\n',
      vs:
        '  float sp = 16.0 + aSeed * 26.0;\n' +
        '  float x = mod( position.x * uBox.x + uTime * sp * uWind.x, uBox.x * 2.0 );\n' +
        '  float z = mod( position.z * uBox.z + uTime * sp * uWind.z, uBox.z * 2.0 );\n' +
        '  vec3 wp = uCentre + vec3( x - uBox.x, position.y * uBox.y * 0.50 - uBox.y * 0.42, z - uBox.z );\n' +
        '  wp.y += sin( uTime * 0.9 + aSeed * 24.0 ) * 2.4;\n' +
        '  transformed = wp;\n' +
        '  vAowSz = 1.0 + aSeed * 2.4;\n' +
        '  vAowA = uAmt * ( 0.10 + 0.24 * aSeed );\n'
    });
  }

  function buildPetals() {
    petalMesh = buildPoints({
      key: 'petal', count: (PMAX.petal = pcount('petal')), size: 0.42, map: TEX.petal,
      color: '#ffd8e6', seed: 4646, order: 716,
      uniforms: { uTime: U.time, uWind: U.wind, uBox: pBox, uCentre: pCentre, uAmt: petalA },
      vsHead: 'uniform float uTime;\nuniform vec4 uWind;\nuniform vec3 uBox;\nuniform vec3 uCentre;\n' +
              'uniform float uAmt;\nvarying float vAowSz;\n',
      vs:
        '  float sp = 1.3 + aSeed * 1.5;\n' +
        '  float H = uBox.y * 0.5;\n' +
        '  float y = mod( position.y * H - uTime * sp, H );\n' +
        '  vec3 wp = uCentre + vec3( position.x * uBox.x * 0.8, y - uBox.y * 0.45, position.z * uBox.z * 0.8 );\n' +
        '  wp.x += sin( uTime * ( 1.4 + aSeed * 1.2 ) + aSeed * 40.0 ) * 2.6 + uWind.x * ( H - y ) * 0.05;\n' +
        '  wp.z += cos( uTime * ( 1.1 + aSeed ) + aSeed * 22.0 ) * 2.1 + uWind.z * ( H - y ) * 0.05;\n' +
        '  transformed = wp;\n' +
        '  vAowSz = 0.7 + aSeed * 0.8;\n' +
        '  vAowA = uAmt * ( 0.6 + 0.4 * aSeed ) * smoothstep( 0.0, 0.08, y / H );\n'
    });
  }

  /* --- rain splashes: flat instanced rings that pulse on the ground --------- */
  function buildSplashes() {
    var n = pcount('splash');
    PMAX.splash = n;
    var base = new THREE.PlaneGeometry(1, 1, 1, 1);
    base.rotateX(-PI / 2);
    paint(base, function (c) { c.setRGB(1, 1, 1); });
    base.computeBoundingSphere();

    var rands = new Float32Array(n);
    var rf = makeRng(5252), i;
    var g = chunkGeometry(base, rands);

    var m = new THREE.MeshBasicMaterial({
      map: TEX.ring, transparent: true, depthWrite: false, fog: true,
      blending: THREE.NormalBlending, side: THREE.DoubleSide, vertexColors: true
    });
    m.color.copy(col('#dbe9ff'));
    inject(m, {
      key: 'splash',
      uniforms: { uTime: U.time, uAmt: splashA, uCam: U.cam },
      vsHead: 'attribute float aRand;\nuniform float uTime;\nuniform vec3 uCam;\nvarying float vAowA;\n',
      vs: [['#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        '{\n' +
        '#ifdef USE_INSTANCING\n' +
        '  vec3 ip = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );\n' +
        '#else\n' +
        '  vec3 ip = vec3( 0.0 );\n' +
        '#endif\n' +
        '  float life = 0.55;\n' +
        '  float t = fract( uTime / life + aRand * 7.31 );\n' +
        '  transformed *= 0.35 + t * 2.4;\n' +
        '  float d = length( ip.xz - uCam.xz );\n' +
        '  vAowA = ( 1.0 - t ) * ( 1.0 - smoothstep( 55.0, 120.0, d ) );\n' +
        '}\n']],
      fsHead: 'varying float vAowA;\nuniform float uAmt;\n',
      fs: [['#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAowA * uAmt;\n']]
    });

    splashMesh = new THREE.InstancedMesh(g, m, n);
    splashMesh.frustumCulled = false;
    splashMesh.matrixAutoUpdate = false;
    splashMesh.renderOrder = 706;
    splashMesh.visible = false;

    for (i = 0; i < n; i++) {
      var x = X0 + 20 + rf() * (X1 - X0 - 40);
      var z = (rf() * 2 - 1) * 34;
      var y = heightAt(x, z) + 0.04;
      rands[i] = rf();
      _v3a.set(x, y, z);
      _q.set(0, 0, 0, 1);
      var s = 0.5 + rf() * 0.6;
      _scl.set(s, s, s);
      _m4.compose(_v3a, _q, _scl);
      splashMesh.setMatrixAt(i, _m4);
    }
    splashMesh.instanceMatrix.needsUpdate = true;
    g.attributes.aRand.needsUpdate = true;
    fxGroup.add(splashMesh);
  }

  /* ==========================================================================
   * 12. CAMPFIRES — flames, embers, smoke, and real light after dusk
   * ======================================================================== */

  var firePos = [];
  var fireLights = [];
  var fireOn = { value: 0 };

  function buildFires() {
    if (!firePos.length) { return; }

    /* --- flames: additive billboards, one instance per fire ---------------- */
    var fq = quadXY(1.35, 1.9);
    paint(fq, function (c) { c.setRGB(1, 1, 1); });
    fq.computeBoundingSphere();
    var rands = new Float32Array(firePos.length);
    var fg = chunkGeometry(fq, rands);

    var fm = new THREE.MeshBasicMaterial({
      map: TEX.flame, transparent: true, depthWrite: false, fog: true,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, vertexColors: true
    });
    fm.color.copy(col('#ffb45a'));
    inject(fm, {
      key: 'flame',
      uniforms: { uTime: U.time, uCam: U.cam, uAmt: flameA, uWind: U.wind, uWeather: U.weather },
      vsHead: 'attribute float aRand;\nuniform float uTime;\nuniform vec3 uCam;\nuniform vec4 uWind;\nvarying float vAowA;\n',
      vs: [['#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        '{\n' +
        '#ifdef USE_INSTANCING\n' +
        '  vec3 ip = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );\n' +
        '#else\n' +
        '  vec3 ip = vec3( 0.0 );\n' +
        '#endif\n' +
        '  vec3 toCam = uCam - ip; toCam.y = 0.0;\n' +
        '  toCam = normalize( toCam + vec3( 0.0001, 0.0, 0.0001 ) );\n' +
        '  vec3 rt = normalize( cross( vec3( 0.0, 1.0, 0.0 ), toCam ) );\n' +
        '  float fl = 0.80 + 0.32 * sin( uTime * 8.3 + aRand * 41.0 ) + 0.18 * sin( uTime * 17.1 + aRand * 13.0 );\n' +
        '  float lean = sin( uTime * 3.1 + aRand * 9.0 ) * 0.10;\n' +
        '  vec3 p = rt * transformed.x + vec3( 0.0, 1.0, 0.0 ) * transformed.y * fl;\n' +
        '  p.x += uWind.x * transformed.y * ( 0.10 * uWind.w + lean );\n' +
        '  p.z += uWind.z * transformed.y * ( 0.10 * uWind.w + lean );\n' +
        '  transformed = p;\n' +
        '  vAowA = fl;\n' +
        '}\n']],
      fsHead: 'varying float vAowA;\nuniform float uAmt;\nuniform vec4 uWeather;\n',
      fs: [['#include <color_fragment>',
        '#include <color_fragment>\n' +
        'diffuseColor.a *= uAmt * ( 0.72 + 0.28 * vAowA ) * ( 1.0 - uWeather.x * 0.45 );\n' +
        'diffuseColor.rgb *= 1.0 + vAowA * 0.5;\n']]
    });

    flameMesh = new THREE.InstancedMesh(fg, fm, firePos.length);
    flameMesh.frustumCulled = false;
    flameMesh.matrixAutoUpdate = false;
    flameMesh.renderOrder = 720;
    var rf = makeRng(6161), i;
    for (i = 0; i < firePos.length; i++) {
      rands[i] = rf();
      _v3a.set(firePos[i].x, firePos[i].y + 0.28, firePos[i].z);
      _q.set(0, 0, 0, 1);
      var s = 0.85 + rf() * 0.5;
      _scl.set(s, s, s);
      _m4.compose(_v3a, _q, _scl);
      flameMesh.setMatrixAt(i, _m4);
    }
    flameMesh.instanceMatrix.needsUpdate = true;
    fg.attributes.aRand.needsUpdate = true;
    fxGroup.add(flameMesh);

    /* --- smoke + embers: points anchored to the fires ---------------------- */
    var per = pcount('smoke');
    var total = Math.min(firePos.length, 14) * per;
    smokeMesh = buildPoints({
      key: 'smoke', count: total, size: 1.0, map: TEX.smoke,
      color: '#6a6a6a', seed: 7171, order: 718,
      place: function (arr, i, rfn) {
        var f = firePos[(i / per) | 0] || firePos[0];
        arr[i * 3] = f.x + (rfn() - 0.5) * 0.5;
        arr[i * 3 + 1] = f.y + 0.6;
        arr[i * 3 + 2] = f.z + (rfn() - 0.5) * 0.5;
      },
      uniforms: { uTime: U.time, uWind: U.wind, uAmt: smokeA, uCam: U.cam },
      vsHead: 'uniform float uTime;\nuniform vec4 uWind;\nuniform float uAmt;\nuniform vec3 uCam;\nvarying float vAowSz;\n',
      vs:
        '  float life = 5.5;\n' +
        '  float t = fract( uTime / life + aSeed * 3.77 );\n' +
        '  vec3 wp = position;\n' +
        '  wp.y += t * 8.5;\n' +
        '  wp.x += uWind.x * t * t * 6.0 * uWind.w + sin( aSeed * 30.0 + uTime * 0.6 ) * 0.9 * t;\n' +
        '  wp.z += uWind.z * t * t * 6.0 * uWind.w + cos( aSeed * 21.0 + uTime * 0.5 ) * 0.9 * t;\n' +
        '  transformed = wp;\n' +
        '  vAowSz = 1.4 + t * 7.5;\n' +
        '  vAowA = uAmt * smoothstep( 0.0, 0.10, t ) * ( 1.0 - t ) * 0.55;\n'
    });

    var eper = pcount('ember');
    emberMesh = buildPoints({
      key: 'ember', count: Math.min(firePos.length, 14) * eper, size: 0.16, map: TEX.dot,
      color: '#ffb254', seed: 8181, order: 722, additive: true,
      place: function (arr, i, rfn) {
        var f = firePos[(i / eper) | 0] || firePos[0];
        arr[i * 3] = f.x + (rfn() - 0.5) * 0.7;
        arr[i * 3 + 1] = f.y + 0.35;
        arr[i * 3 + 2] = f.z + (rfn() - 0.5) * 0.7;
      },
      uniforms: { uTime: U.time, uWind: U.wind, uAmt: emberA },
      vsHead: 'uniform float uTime;\nuniform vec4 uWind;\nuniform float uAmt;\nvarying float vAowSz;\n',
      vs:
        '  float life = 2.6;\n' +
        '  float t = fract( uTime / life + aSeed * 5.13 );\n' +
        '  vec3 wp = position;\n' +
        '  wp.y += t * 5.2;\n' +
        '  wp.x += sin( aSeed * 44.0 + uTime * 3.1 ) * 0.55 * t + uWind.x * t * 2.2 * uWind.w;\n' +
        '  wp.z += cos( aSeed * 37.0 + uTime * 2.7 ) * 0.55 * t + uWind.z * t * 2.2 * uWind.w;\n' +
        '  transformed = wp;\n' +
        '  vAowSz = 1.0 - t * 0.6;\n' +
        '  vAowA = uAmt * ( 1.0 - t ) * ( 0.5 + 0.5 * sin( uTime * 22.0 + aSeed * 60.0 ) );\n'
    });

    /* --- two real point lights, created once (adding lights later would force
           every material in the scene to recompile mid-battle) -------------- */
    if (tier !== 'low' && firePos.length) {
      var picks = pickLightFires();
      for (i = 0; i < picks.length; i++) {
        var pl = new THREE.PointLight(0xff9a44, 0, 34, 2);
        pl.position.set(picks[i].x, picks[i].y + 1.1, picks[i].z);
        pl.castShadow = false;
        root.add(pl);
        fireLights.push({ light: pl, seed: makeRng(900 + i)() * 10, base: 0 });
      }
    }
  }

  /** Prefer the two fires closest to the middle of the map — they are the ones
      the camera actually spends its time near. */
  function pickLightFires() {
    var sorted = firePos.slice(0).sort(function (a, b) {
      return Math.abs(a.x - W * 0.5) - Math.abs(b.x - W * 0.5);
    });
    return sorted.slice(0, tier === 'high' ? 2 : 1);
  }

  /* ==========================================================================
   * 13. LIGHTNING
   * ======================================================================== */

  var flashLight = null;
  var flash = { t: 0, dur: 0, next: 6, seq: 0, power: 0 };

  function buildFlashLight() {
    flashLight = new THREE.DirectionalLight(0xdce8ff, 0);
    flashLight.castShadow = false;
    flashLight.position.set(W * 0.5 + 120, 220, -60);
    flashLight.target.position.set(W * 0.5, 0, 0);
    root.add(flashLight);
    root.add(flashLight.target);
  }

  function strikeLightning(power) {
    flash.power = clamp(typeof power === 'number' ? power : 1, 0.2, 2);
    flash.t = 0;
    flash.dur = 0.55 + rnd() * 0.35;
    flash.seq = 1;
    emit('env:lightning', { power: flash.power });
    emit('camera:shake', { amount: 0.10 + flash.power * 0.12 });
  }

  function stepLightning(dt) {
    var stormy = wx.storm * clamp01(wx.rain);
    if (stormy > 0.02) {
      flash.next -= dt * (0.5 + stormy * 0.9);
      if (flash.next <= 0) {
        flash.next = 4 + rnd() * 11 / Math.max(0.4, stormy);
        strikeLightning(0.6 + rnd() * 1.2 * stormy);
      }
    }
    if (flash.seq > 0) {
      flash.t += dt;
      var p = flash.t / Math.max(0.0001, flash.dur);
      var v = 0;
      if (p < 1) {
        /* double-strike envelope: bright stab, dip, second stab, fast decay */
        v = Math.exp(-p * 7.0) + 0.55 * Math.exp(-Math.abs(p - 0.22) * 26.0) + 0.35 * Math.exp(-Math.abs(p - 0.42) * 30.0);
        v = clamp01(v) * flash.power;
      } else {
        flash.seq = 0;
      }
      U.weather.value.w = v * 0.55;
      if (flashLight) { flashLight.intensity = v * 3.4; }
    } else {
      U.weather.value.w = damp(U.weather.value.w, 0, 8, dt);
      if (flashLight) { flashLight.intensity = damp(flashLight.intensity, 0, 8, dt); }
    }
  }

  /* ==========================================================================
   * 14. WORLD ASSEMBLY
   * ======================================================================== */

  var SIDE_BANDS = [[22, 78, 5], [78, 165, 3], [-95, -26, 2.6]];
  var NEAR_BANDS = [[20, 52, 6], [-70, -24, 3]];
  var FAR_BANDS = [[70, 168, 1]];

  function buildProps() {
    var d = tierScale;

    defineProp('pine', geoPine(), { sway: 0.13, swayH: 8.5, cast: true, roughness: 0.9 });
    scatterProp('pine', Math.round(150 * d), {
      seed: 11, bands: SIDE_BANDS, scaleMin: 0.75, scaleMax: 1.65, minDist: 5.5,
      shrinkFar: true, tilt: 0.05, maxSlope: 0.55
    });

    defineProp('broad', geoBroad(), { sway: 0.20, swayH: 6.0, cast: true, roughness: 0.88 });
    scatterProp('broad', Math.round(130 * d), {
      seed: 22, bands: SIDE_BANDS, scaleMin: 0.7, scaleMax: 1.5, minDist: 6.5,
      shrinkFar: true, tilt: 0.06, maxSlope: 0.5
    });

    defineProp('bamboo', geoBamboo(), { sway: 0.30, swayH: 7.0, cast: true, roughness: 0.75 });
    scatterProp('bamboo', Math.round(110 * d), {
      seed: 33, bands: NEAR_BANDS, scaleMin: 0.7, scaleMax: 1.25, minDist: 4.0, maxSlope: 0.45
    });

    defineProp('sakura', geoSakura(), { sway: 0.19, swayH: 5.0, cast: true, roughness: 0.85 });
    scatterProp('sakura', Math.round(52 * d), {
      seed: 44, bands: NEAR_BANDS, scaleMin: 0.8, scaleMax: 1.35, minDist: 9, tilt: 0.05
    });

    defineProp('rock', geoRock(), { sway: 0, cast: true, roughness: 0.95 });
    scatterProp('rock', Math.round(190 * d), {
      seed: 55, bands: [[19, 90, 6], [-90, -22, 3], [90, 168, 2]],
      scaleMin: 0.45, scaleMax: 2.4, minDist: 2.4, tilt: 0.35, sink: -0.18,
      maxSlope: 0.85, yVar: 0.4
    });

    defineProp('bush', geoBush(), { sway: 0.10, swayH: 1.0, cast: false, roughness: 0.92 });
    scatterProp('bush', Math.round(230 * d), {
      seed: 66, bands: [[18, 80, 6], [-80, -21, 3]], scaleMin: 0.7, scaleMax: 1.9,
      minDist: 2.0, laneClear: 18, maxSlope: 0.6, yVar: 0.3
    });

    defineProp('grass', geoGrass(), {
      sway: 0.13, swayH: 0.62, cast: false, recv: false, distFade: true,
      map: TEX.grass, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, snowTake: 0.6
    });
    scatterProp('grass', Math.round(3200 * d), {
      seed: 77, bands: [[16, 60, 8], [-60, -18, 4], [60, 120, 1.5]],
      scaleMin: 0.7, scaleMax: 1.9, laneClear: 15, maxSlope: 0.75, yVar: 0.35,
      tintA: '#d5e3b6', tintB: '#fff4dc'
    });

    defineProp('fence', geoFence(), { sway: 0.015, swayH: 1.25, cast: true, roughness: 0.9 });
    (function () {
      /* fences run in short broken lines parallel to the lane — scattered posts
         read as litter, a run reads as a boundary somebody built */
      var p = PROPS.fence, rf = makeRng(88), i, k;
      var runs = Math.round(26 * d);
      for (i = 0; i < runs; i++) {
        var side = rf() < 0.5 ? 1 : -1;
        var z = side * (21 + rf() * 12);
        var x = X0 + 30 + rf() * (X1 - X0 - 60);
        var len = 3 + ((rf() * 6) | 0);
        for (k = 0; k < len; k++) {
          var xx = x + k * 2.05;
          if (xx > X1 - 12) { break; }
          if (Math.abs(xx - 20) < 16 || Math.abs(xx - 400) < 16) { continue; }
          var v = 0.86 + rf() * 0.3;
          p.list.push({
            x: xx, y: heightAt(xx, z) - 0.06, z: z, rot: 0 + (rf() - 0.5) * 0.06,
            tilt: (rf() - 0.5) * 0.05, s: 1, sy: 0.9 + rf() * 0.25,
            r: v, g: v * 0.99, b: v * 0.96, rand: rf()
          });
        }
      }
    })();

    defineProp('banner', geoBannerPole(), { sway: 0.10, swayH: 3.6, cast: true, roughness: 0.8 });
    scatterProp('banner', Math.round(44 * d), {
      seed: 99, bands: [[18, 30, 7], [-34, -19, 3]], scaleMin: 0.85, scaleMax: 1.3,
      minDist: 12, laneClear: 17.5, maxSlope: 0.4, shade: 0.18
    });
    defineProp('bannerCloth', geoBannerCloth(), {
      sway: 0.10, swayH: 3.6, cloth: true, cast: true, roughness: 0.86,
      side: THREE.DoubleSide, snowTake: 0.15
    });
    (function () {
      var a = PROPS.banner.list, b = PROPS.bannerCloth.list, i;
      for (i = 0; i < a.length; i++) {
        var q = a[i];
        b.push({ x: q.x, y: q.y, z: q.z, rot: q.rot, tilt: q.tilt, s: q.s, sy: q.sy, r: 1, g: 1, b: 1, rand: q.rand });
      }
    })();

    defineProp('column', geoColumn(), { sway: 0, cast: true, roughness: 0.7 });
    scatterProp('column', Math.round(40 * d), {
      seed: 111, bands: [[19, 46, 6], [-52, -21, 2]], scaleMin: 0.8, scaleMax: 1.45,
      minDist: 7, tilt: 0.09, maxSlope: 0.35, sink: -0.1
    });

    defineProp('pylon', geoPylon(), { sway: 0, cast: true, roughness: 0.42, metalness: 0.75 });
    scatterProp('pylon', Math.round(26 * d), {
      seed: 122, bands: [[19, 44, 6], [-48, -20, 2]], scaleMin: 0.9, scaleMax: 1.5,
      minDist: 16, maxSlope: 0.35
    });
    defineProp('pylonGlow', geoPylonGlow(), {
      sway: 0, cast: false, recv: false, emissive: '#6fe4ff', emissiveIntensity: 2.4,
      roughness: 0.3, metalness: 0.2, weatherTint: false
    });
    (function () {
      var a = PROPS.pylon.list, b = PROPS.pylonGlow.list, i;
      for (i = 0; i < a.length; i++) {
        var s = a[i];
        b.push({ x: s.x, y: s.y, z: s.z, rot: s.rot, tilt: s.tilt, s: s.s, sy: s.sy, r: 1, g: 1, b: 1, rand: s.rand });
      }
    })();

    defineProp('firepit', geoFirePit(), { sway: 0, cast: false, roughness: 0.95 });
    scatterProp('firepit', Math.max(4, Math.round(11 * d)), {
      seed: 133, bands: [[19, 34, 6], [-40, -20, 3]], scaleMin: 0.9, scaleMax: 1.25,
      minDist: 26, laneClear: 18, maxSlope: 0.3
    });
    (function () {
      var l = PROPS.firepit.list, i;
      for (i = 0; i < l.length; i++) { firePos.push({ x: l[i].x, y: l[i].y, z: l[i].z }); }
    })();

    defineProp('debris', geoDebris(), { sway: 0.02, swayH: 1, cast: false, roughness: 0.9 });
    scatterProp('debris', Math.round(210 * d), {
      seed: 144, bands: [[-16, 16, 7], [16, 40, 3], [-42, -17, 1.5]],
      scaleMin: 0.7, scaleMax: 1.5, allowLane: true, tilt: 0.25, maxSlope: 0.7,
      fortClear: 22, minDist: 3.5, sink: -0.05
    });

    var i;
    for (i = 0; i < propOrder.length; i++) { buildPropChunks(propOrder[i]); }
  }

  /* ==========================================================================
   * 15. QUALITY
   * ======================================================================== */

  function normTier(t) {
    if (t === 'medium') { return 'med'; }
    if (t === 'high' || t === 'med' || t === 'low') { return t; }
    return 'med';
  }

  var TIER_DENSITY = { high: 1.0, med: 0.62, low: 0.30 };

  function applyTierDensity() {
    var f = TIER_DENSITY[tier] || 0.6;
    var i, k;
    for (i = 0; i < propOrder.length; i++) {
      var p = PROPS[propOrder[i]];
      for (k = 0; k < CHUNKS; k++) {
        var im = p.chunks[k];
        if (!im) { continue; }
        var total = im.userData.total || 0;
        var cut = Math.max(p.cut.value.x, p.tCut);
        im.count = clamp(Math.ceil(total * clamp01(cut) * f), 0, total);
        im.castShadow = p.cast && tier !== 'low';
        im.receiveShadow = p.recv && tier === 'high';
      }
    }
    if (rainMesh) { rainMesh.geometry.setDrawRange(0, Math.min(pcount('rain'), PMAX.rain) * 2); }
    if (snowMesh) { snowMesh.geometry.setDrawRange(0, Math.min(pcount('snow'), PMAX.snow)); }
    if (dustMesh) { dustMesh.geometry.setDrawRange(0, Math.min(pcount('dust'), PMAX.dust)); }
    if (petalMesh) { petalMesh.geometry.setDrawRange(0, Math.min(pcount('petal'), PMAX.petal)); }
    if (splashMesh) { splashMesh.count = Math.min(pcount('splash'), PMAX.splash); }
    U.gFade.value.set(tier === 'low' ? 34 : (tier === 'med' ? 55 : 78),
                      tier === 'low' ? 62 : (tier === 'med' ? 100 : 145));
  }

  function setQuality(t) {
    var nt = normTier(t);
    if (nt === tier) { return tier; }
    tier = nt;
    applyTierDensity();
    if (rayMesh) { rayMesh.visible = rayMesh.visible && tier !== 'low'; }
    return tier;
  }

  /* ==========================================================================
   * 16. FRAME UPDATE
   * ======================================================================== */

  var baseFog = 0.003, lastFogApplied = -1;
  var baseHorizon = new THREE.Color(0.5, 0.6, 0.75);
  var lastHorizonHex = -1;
  var horizonTimer = 0;
  var _fwd = new THREE.Vector3();
  var visRadius = 150;

  function captureHorizonBase() {
    try {
      if (R && R.sky) {
        baseHorizon.copy(R.sky.horizon);
        baseFog = R.sky.fogDensity;
        lastFogApplied = -1;
        lastHorizonHex = -1;
      }
    } catch (e) { /* ignore */ }
  }

  function srgbHex(c) {
    _colC.copy(c);
    if (typeof _colC.convertLinearToSRGB === 'function') { _colC.convertLinearToSRGB(); }
    return _colC.getHex();
  }

  function syncSky(dt) {
    if (!R || !R.sky) { return; }
    var s = R.sky;

    /* Horizon + fog are OWNED by the renderer's time-of-day; weather only
       modulates them, through the renderer's public setters, so the fog colour
       and our dome can never drift apart. */
    horizonTimer -= dt;
    if (horizonTimer <= 0) {
      horizonTimer = 0.22;
      var dustAmt = clamp01(wx.dust) * 0.62;
      _colA.copy(baseHorizon).lerp(U.dustCol.value, dustAmt);
      /* snow and heavy overcast wash the horizon out a touch */
      _colA.lerp(_colB.setRGB(0.72, 0.76, 0.82), clamp01(wx.snow) * 0.22);
      var hex = srgbHex(_colA);
      if (hex !== lastHorizonHex) {
        lastHorizonHex = hex;
        if (typeof R.setHorizonColor === 'function') { R.setHorizonColor(hex); }
      }
      var fd = baseFog * (wx.fog || 1);
      if (Math.abs(fd - lastFogApplied) > 1e-6) {
        lastFogApplied = fd;
        if (typeof R.setFogDensity === 'function') { R.setFogDensity(fd); }
      }
    }

    U.horizon.value.copy(s.horizon);
    U.zenith.value.copy(s.skyTop);
    SU.ground.value.copy(s.horizon).multiplyScalar(0.72);
    U.sunDir.value.copy(s.sunDir).normalize();
    U.sunCol.value.copy(s.keyColor);
    U.moonDir.value.set(-s.sunDir.x, Math.abs(s.sunDir.y) * 0.85 + 0.25, -s.sunDir.z).normalize();

    var t = s.t;
    var night = clamp01(Math.max(1 - sstep(0.13, 0.26, t), sstep(0.80, 0.93, t)));
    U.night.value = night;
    U.sunI.value = clamp(s.keyIntensity / 1.35, 0.06, 1.4) * (0.25 + 0.75 * wx.sun);

    /* cloud lighting derived from the live sky so overcast reads as overcast */
    SU.cloudLit.value.copy(s.skyTop).lerp(s.keyColor, 0.55).multiplyScalar(lerp(1.35, 0.55, clamp01(wx.cloudDark)));
    SU.cloudDark.value.copy(s.horizon).multiplyScalar(lerp(0.78, 0.30, clamp01(wx.cloudDark)));
    U.cloud.value.x = clamp01(Math.max(wx.cloud, eraBaseCloud * 0.55));
    U.cloud.value.y = clamp01(wx.cloudDark);
    U.cloud.value.w = clamp01(wx.cloud * 0.7);

    if (skyMesh && camera) {
      skyMesh.position.copy(camera.position);
      skyMesh.updateMatrix();
    }
  }

  function syncWind(dt) {
    var strength = (wx.wind || 0.5) * (eraBaseWind || 1);
    /* slow direction wander so the world never feels metronomic */
    var ang = 0.35 + Math.sin(elapsed * 0.037) * 0.55 + Math.sin(elapsed * 0.0131) * 0.3;
    U.wind.value.x = Math.cos(ang);
    U.wind.value.z = Math.sin(ang) * 0.5;
    U.wind.value.w = 0.9 + strength * 1.35;
    var mag = 0.55 + strength * 0.85;
    U.wind.value.x *= mag;
    U.wind.value.z *= mag;
  }

  function syncWeatherUniforms(dt) {
    U.weather.value.x = clamp01(wx.wet);
    U.weather.value.y = clamp01(Math.max(wx.snow, eraSnow.cur));
    U.weather.value.z = clamp01(wx.dust);

    var rainAmt = clamp01(wx.rain);
    rainA.value = rainAmt;
    splashA.value = rainAmt * 0.9;
    snowA.value = clamp01(wx.snow);
    dustA.value = clamp01(wx.dust);

    if (rainMesh) { rainMesh.visible = rainAmt > 0.01; }
    if (splashMesh) { splashMesh.visible = rainAmt > 0.02; }
    if (snowMesh) { snowMesh.visible = snowA.value > 0.01; }
    if (dustMesh) { dustMesh.visible = dustA.value > 0.01; }

    /* sakura petals belong to the japan dressing, not the weather */
    var pf = PROPS.sakura ? PROPS.sakura.fade.value * (ERA_DENSITY.sakura[era] || 0) : 0;
    petalA.value = clamp01(pf) * (1 - clamp01(wx.snow)) * 0.9;
    if (petalMesh) { petalMesh.visible = petalA.value > 0.01; }
  }

  function syncFires(dt) {
    var night = U.night.value;
    var gloom = clamp01(Math.max(night, wx.cloudDark * 0.8, wx.dust * 0.5, wx.fog > 2.5 ? 0.5 : 0));
    var want = sstep(0.18, 0.55, gloom);
    fireOn.value = damp(fireOn.value, want, 1.4, dt);

    var lit = fireOn.value;
    flameA.value = 0.35 + 0.65 * lit;
    smokeA.value = 0.55 + 0.35 * lit;
    emberA.value = lit;

    if (flameMesh) { flameMesh.visible = flameA.value > 0.02; }
    if (smokeMesh) { smokeMesh.visible = smokeA.value > 0.02; }
    if (emberMesh) { emberMesh.visible = emberA.value > 0.05; }

    var i;
    for (i = 0; i < fireLights.length; i++) {
      var f = fireLights[i];
      var flick = 0.78 + 0.22 * Math.sin(elapsed * 9.1 + f.seed * 7.3) + 0.12 * Math.sin(elapsed * 21.3 + f.seed);
      f.light.intensity = lit * 2.35 * flick;
      f.light.visible = f.light.intensity > 0.02;
    }
  }

  function syncEra(dt) {
    var i;
    for (i = 0; i < propOrder.length; i++) {
      var p = PROPS[propOrder[i]];
      var prevCut = p.cut.value.x;
      p.cut.value.x = damp(p.cut.value.x, p.tCut, 1.5, dt);
      p.fade.value = damp(p.fade.value, p.tFade, 2.2, dt);
      if (Math.abs(prevCut - p.cut.value.x) > 0.01) { p.dirtyCount = true; }
    }
    eraSnow.cur = damp(eraSnow.cur, eraSnow.target, 0.9, dt);
    overlayCur.road = damp(overlayCur.road, overlayTarget.road, 1.6, dt);
    overlayCur.plate = damp(overlayCur.plate, overlayTarget.plate, 1.6, dt);
    if (overlayRoad) {
      overlayRoad.fade.value = overlayCur.road;
      overlayRoad.mesh.visible = overlayCur.road > 0.01;
    }
    if (overlayPlate) {
      overlayPlate.fade.value = overlayCur.plate;
      overlayPlate.mesh.visible = overlayCur.plate > 0.01;
    }
  }

  var countTimer = 0;

  function syncChunks(dt) {
    if (!R || !R.rig) { return; }
    var focus = R.rig.focusX;
    var dist = R.rig.dist || 96;
    visRadius = clamp(dist * 1.15 + chunkW * 0.9, 90, 420);

    countTimer -= dt;
    var recount = false;
    if (countTimer <= 0) { countTimer = 0.35; recount = true; }
    var f = TIER_DENSITY[tier] || 0.6;

    var i, k;
    for (i = 0; i < propOrder.length; i++) {
      var p = PROPS[propOrder[i]];
      var alive = p.fade.value > 0.012;
      for (k = 0; k < CHUNKS; k++) {
        var im = p.chunks[k];
        if (!im) { continue; }
        var near = Math.abs(im.userData.cx - focus) < visRadius;
        im.visible = alive && near;
        if (recount && near && alive) {
          var total = im.userData.total || 0;
          im.count = clamp(Math.ceil(total * clamp01(p.cut.value.x) * f), 0, total);
        }
      }
    }
  }

  function syncGodRays(dt) {
    if (!rayMesh || !camera) { return; }
    var sd = U.sunDir.value;
    /* strongest when the sun is low: that is when real shafts happen */
    var elev = clamp01(sd.y);
    var amt = sstep(0.02, 0.16, elev) * (1 - sstep(0.30, 0.62, elev));
    amt *= (1 - clamp01(wx.cloudDark) * 0.8) * (1 - clamp01(wx.dust) * 0.4);
    amt *= clamp01(U.sunI.value);
    if (tier === 'low') { amt *= 0.5; }
    rayI.value = damp(rayI.value, amt * 0.55, 3.0, dt);
    rayMesh.visible = rayI.value > 0.004 && tier !== 'low';
    if (!rayMesh.visible) { return; }
    _v3a.copy(camera.position).addScaledVector(sd, 260);
    rayMesh.position.copy(_v3a);
    rayMesh.lookAt(camera.position);
    rayMesh.updateMatrix();
    rayMesh.updateMatrixWorld();
  }

  function update(dt) {
    if (!inited || failed || disposed) { return; }
    if (typeof dt !== 'number' || !isFinite(dt) || dt <= 0) { dt = 1 / 60; }
    if (dt > 0.1) { dt = 0.1; }
    elapsed += dt;
    U.time.value = elapsed;

    try {
      if (camera) {
        U.cam.value.copy(camera.position);
        camera.getWorldDirection(_fwd);
        _v3b.copy(camera.position).addScaledVector(_fwd, 46);
        /* Anchor the precipitation volume to the GROUND under the look point.
           Locking it to the camera instead leaves rain hanging in mid-air with a
           visible empty band under it whenever the camera is high. */
        pCentre.value.set(_v3b.x, heightAt(_v3b.x, _v3b.z) + pBox.value.y * 0.45, _v3b.z);
        birdCentre.value.set(camera.position.x + 40, 108, 300);
      }

      stepAutoWeather(dt);
      stepWeather(dt);
      stepLightning(dt);
      syncWind(dt);
      syncSky(dt);
      syncWeatherUniforms(dt);
      syncEra(dt);
      syncFires(dt);
      syncChunks(dt);
      syncGodRays(dt);
    } catch (e) {
      warn('update', 'update failed — environment frozen for this frame.', e);
    }
  }

  /* ==========================================================================
   * 17. AMBIENT WEATHER SCHEDULER (optional, era-weighted)
   * ======================================================================== */

  var autoWeather = true;
  var autoTimer = 40;

  var ERA_WEATHER = {
    tribal: [['clear', 5], ['overcast', 2], ['fog', 1.4], ['rain', 1.2], ['dust', 0.8]],
    greek:  [['clear', 6], ['overcast', 1.6], ['dust', 1.2], ['rain', 0.8], ['fog', 0.6]],
    rome:   [['clear', 5], ['overcast', 2.2], ['rain', 1.6], ['dust', 1.0], ['fog', 0.8]],
    viking: [['overcast', 3], ['snow', 3.2], ['clear', 2], ['fog', 1.6], ['storm', 1.2]],
    japan:  [['clear', 4], ['rain', 2.4], ['fog', 2.0], ['overcast', 1.6], ['storm', 0.8]],
    future: [['clear', 3.5], ['overcast', 2], ['dust', 2.2], ['storm', 1.4], ['fog', 1.0]]
  };

  function pickWeather() {
    var table = ERA_WEATHER[era] || ERA_WEATHER.tribal;
    var total = 0, i;
    for (i = 0; i < table.length; i++) { total += table[i][1]; }
    var r = rnd() * total;
    for (i = 0; i < table.length; i++) {
      r -= table[i][1];
      if (r <= 0) { return table[i][0]; }
    }
    return 'clear';
  }

  function stepAutoWeather(dt) {
    if (!autoWeather) { return; }
    autoTimer -= dt;
    if (autoTimer > 0) { return; }
    autoTimer = 75 + rnd() * 130;
    var next = pickWeather();
    if (next === wName) { autoTimer *= 0.5; return; }
    setWeather(next, 8 + rnd() * 10);
  }

  function setAutoWeather(on) { autoWeather = !!on; return autoWeather; }

  /* ==========================================================================
   * 18. EVENT BUS HELPERS (safe when Core is absent)
   * ======================================================================== */

  function on(name, fn) {
    try {
      if (C && typeof C.on === 'function') { C.on(name, fn); return true; }
    } catch (e) { /* ignore */ }
    return false;
  }
  function emit(name, payload) {
    try {
      if (C && typeof C.emit === 'function') { C.emit(name, payload); }
    } catch (e) { /* a listener must never kill the frame */ }
  }

  function wireEvents() {
    on('era:evolve', function (p) {
      if (!p) { return; }
      setEra(p.era !== undefined ? p.era : p.index, 4.0);
    });
    on('perf:tier', function (t) { setQuality(t); });
    on('render:quality', function (p) { if (p && p.tier) { setQuality(p.tier); } });
    on('render:horizon', function () { captureHorizonBase(); });
    on('render:contextrestored', function () { captureHorizonBase(); });
    on('weather:set', function (p) {
      if (!p) { return; }
      if (typeof p === 'string') { setWeather(p, 6); }
      else { setWeather(p.weather || p.name, p.seconds); }
    });
    on('env:setWeather', function (p) {
      if (!p) { return; }
      if (typeof p === 'string') { setWeather(p, 6); }
      else { setWeather(p.weather || p.name, p.seconds); }
    });
    on('game:new', function () { setWeather('clear', 4); autoTimer = 60; });
  }

  /* ==========================================================================
   * 19. INIT / DISPOSE
   * ======================================================================== */

  var ownLoopId = 0, ownLast = 0;

  function startOwnLoop() {
    if (ownLoopId) { return; }
    ownLast = (global.performance && performance.now) ? performance.now() : Date.now();
    var tick = function () {
      ownLoopId = global.requestAnimationFrame(tick);
      var now = (global.performance && performance.now) ? performance.now() : Date.now();
      var dt = (now - ownLast) / 1000;
      ownLast = now;
      update(dt);
    };
    ownLoopId = global.requestAnimationFrame(tick);
  }

  function init(opts) {
    if (inited) { return true; }
    if (failed) { return false; }
    opts = opts || {};

    R = AOW.Render || null;
    C = AOW.Core || null;

    if (!R || !R.ready || !R.scene || !R.camera) {
      warn('noRender', 'AOW.Render is not ready yet — deferring environment build.');
      return false;
    }

    try {
      scene = R.scene;
      camera = R.camera;

      /* --- tier -------------------------------------------------------- */
      var t = null;
      try { if (typeof R.getQuality === 'function') { t = R.getQuality(); } } catch (e) { t = null; }
      if (!t && C && C.perf) { t = C.perf.tier; }
      tier = normTier(opts.tier || t || 'med');
      tierScale = TIER_DENSITY[tier] || 0.62;

      /* --- groups ------------------------------------------------------- */
      root = new THREE.Group(); root.name = 'aow.env';
      skyGroup = new THREE.Group(); skyGroup.name = 'aow.env.sky';
      distGroup = new THREE.Group(); distGroup.name = 'aow.env.dist';
      propGroup = new THREE.Group(); propGroup.name = 'aow.env.props';
      fxGroup = new THREE.Group(); fxGroup.name = 'aow.env.fx';
      root.add(skyGroup, distGroup, propGroup, fxGroup);
      if (typeof R.addObject === 'function') { R.addObject(root, 'terrain'); }
      else { scene.add(root); }

      /* --- content ------------------------------------------------------ */
      buildPalette();
      buildTextures();
      buildGround();
      buildSky();
      buildDistance();
      buildGodRays();
      buildProps();
      buildFires();
      buildFlashLight();
      buildRain();
      buildSnow();
      buildDust();
      buildPetals();
      buildSplashes();

      if (TEX.cobble) { overlayRoad = buildOverlay('road', TEX.cobble, [26, 1.4], '#b9b2a4', 0.86, 0.0); }
      if (TEX.plate) { overlayPlate = buildOverlay('plate', TEX.plate, [30, 1.6], '#aebcc7', 0.42, 0.65); }

      applyTierDensity();
      captureHorizonBase();

      /* --- initial state ------------------------------------------------ */
      var startEra = opts.era;
      if (startEra === undefined && C && C.state) {
        startEra = (C.state.era !== undefined) ? C.state.era : C.state.eraIndex;
      }
      setEra(startEra === undefined ? 'tribal' : startEra, 0);
      setWeather(opts.weather || 'clear', 0);
      if (opts.autoWeather === false) { autoWeather = false; }

      /* --- frame hook ---------------------------------------------------- */
      if (C && typeof C.registerRender === 'function') {
        /* order -20: the world must be posed BEFORE the renderer draws it */
        C.registerRender(function (dtReal) { update(dtReal); }, -20);
      } else {
        startOwnLoop();
      }

      wireEvents();

      inited = true;
      E.ready = true;
      E.root = root;
      E.groups = { root: root, sky: skyGroup, dist: distGroup, props: propGroup, fx: fxGroup };

      update(0.016);

      emit('env:ready', {
        heightAt: heightAt, era: era, weather: wName, tier: tier,
        bounds: { x0: X0, x1: X1, z0: Z0, z1: Z1 }
      });

      var drawn = 0, i, k;
      for (i = 0; i < propOrder.length; i++) {
        for (k = 0; k < CHUNKS; k++) { if (PROPS[propOrder[i]].chunks[k]) { drawn += PROPS[propOrder[i]].chunks[k].count; } }
      }
      console.info('[AOW.Env] ready — tier=' + tier + ' props=' + drawn +
        ' era=' + era + ' weather=' + wName);
      return true;

    } catch (err) {
      failed = true;
      E.failed = true;
      console.warn('[AOW.Env] init failed — the game will run without an environment.', err);
      try { if (root) { if (typeof R.disposeObject === 'function') { R.disposeObject(root); } else if (root.parent) { root.parent.remove(root); } } } catch (e2) { /* ignore */ }
      return false;
    }
  }

  function dispose() {
    if (disposed) { return; }
    disposed = true;
    try {
      if (ownLoopId) { global.cancelAnimationFrame(ownLoopId); ownLoopId = 0; }
      var i, k;
      for (i = 0; i < propOrder.length; i++) {
        var p = PROPS[propOrder[i]];
        for (k = 0; k < CHUNKS; k++) {
          if (p.chunks[k]) {
            if (p.chunks[k].dispose) { p.chunks[k].dispose(); }
            p.chunks[k] = null;
          }
        }
        if (p.geo && p.geo.dispose) { p.geo.dispose(); }
        if (p.mat && p.mat.dispose) { p.mat.dispose(); }
        if (p.depth && p.depth.dispose) { p.depth.dispose(); }
      }
      for (i = 0; i < fireLights.length; i++) {
        if (fireLights[i].light.parent) { fireLights[i].light.parent.remove(fireLights[i].light); }
      }
      fireLights.length = 0;
      if (root) {
        if (R && typeof R.disposeObject === 'function') { R.disposeObject(root, true); }
        else if (root.parent) { root.parent.remove(root); }
      }
    } catch (e) { warn('dispose', 'dispose issue', e); }
    inited = false;
    E.ready = false;
  }

  /* ==========================================================================
   * 20. PUBLIC API
   * ======================================================================== */

  E.__isAowEnv = true;
  E.version = '1.0.0';
  E.ready = false;
  E.failed = false;
  E.root = null;
  E.groups = null;

  E.init = init;
  E.dispose = dispose;
  E.update = update;

  /** Ground height at a world position — the authority every module should use. */
  E.heightAt = heightAt;
  E.groundY = heightAt;
  E.normalAt = normalAt;
  E.laneHalfWidth = LANE_HALF;
  E.bounds = { x0: X0, x1: X1, z0: Z0, z1: Z1 };

  E.setWeather = setWeather;
  E.getWeather = function () { return wName; };
  E.getWeatherBlend = function () { return wT; };
  E.listWeather = function () { return ['clear', 'overcast', 'rain', 'storm', 'snow', 'fog', 'dust']; };
  E.setAutoWeather = setAutoWeather;
  E.strikeLightning = strikeLightning;

  E.setEra = setEra;
  E.getEra = function () { return era; };
  E.listEras = function () { return ERAS.slice(0); };

  E.setQuality = setQuality;
  E.getQuality = function () { return tier; };

  /** Live wind vector, for VFX that want to drift with the world. */
  E.getWind = function (out) {
    out = out || new THREE.Vector3();
    out.set(U.wind.value.x, 0, U.wind.value.z);
    return out;
  };
  E.getSunDir = function (out) {
    out = out || new THREE.Vector3();
    out.copy(U.sunDir.value);
    return out;
  };
  E.isNight = function () { return U.night.value > 0.5; };
  E.getNightAmount = function () { return U.night.value; };
  E.uniforms = U;

  AOW.Env = E;

  /* ==========================================================================
   * 21. BOOT — the integrator normally calls init(), but we self-start so the
   * world exists even if nobody remembers to.
   * ======================================================================== */

  function boot() {
    if (inited || failed) { return; }
    if (AOW.Render && AOW.Render.ready) { init({}); }
  }

  try {
    if (AOW.Core && typeof AOW.Core.on === 'function') {
      AOW.Core.on('render:ready', function () { setTimeout(boot, 0); });
    }
    if (AOW.Render && AOW.Render.ready) {
      setTimeout(boot, 0);
    } else if (global.addEventListener) {
      global.addEventListener('load', function () { setTimeout(boot, 60); }, false);
    }
    /* last-ditch retry in case Render came up without an event anyone heard */
    setTimeout(boot, 400);
    setTimeout(boot, 1600);
  } catch (e) {
    warn('boot', 'auto-boot failed — call AOW.Env.init() manually.', e);
  }

})(typeof window !== 'undefined' ? window : this);
