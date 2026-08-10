/* =============================================================================
 * AOW2-3D — src/render/renderer.js  →  global AOW.Render
 * -----------------------------------------------------------------------------
 * The three.js backbone: renderer, scene, fog, cinematic camera rig, lighting,
 * post-processing stack, frame loop integration, procedural-texture factory and
 * the perf HUD hook.
 *
 * HARD RULES honoured here (see CONTRACT.md):
 *  - three.js r128 UMD, global THREE. No modules, no npm, no network, no assets.
 *  - Attaches exactly ONE global: AOW.Render.
 *  - Cross-module talk only through AOW.Core.on / AOW.Core.emit.
 *  - No per-frame allocation: every Vector3/Color/Matrix4 used in the frame loop
 *    is a module-level scratch object.
 *  - Everything is guarded: if a sub-system can't init we console.warn and no-op.
 *
 * -----------------------------------------------------------------------------
 * COLOUR PIPELINE — read this before touching anything colour related.
 * -----------------------------------------------------------------------------
 * three r128 has no colour management, so we impose one by hand:
 *
 *   • All hand-authored colours are written as sRGB hex and converted to LINEAR
 *     via AOW.Render.color(hex). Other modules MUST use that helper so lighting
 *     maths stays physically sane. Colour textures get encoding = sRGBEncoding.
 *
 *   • r128 applies tone mapping based on `material.toneMapped` (NOT on whether we
 *     render to a render target), but it applies output encoding only when
 *     rendering to the default framebuffer. So inside the EffectComposer chain
 *     the image is ACES-tonemapped but *not* sRGB-encoded. That is exactly the
 *     space UnrealBloomPass's 0..1 threshold expects — and it means our final
 *     grade pass is responsible for the linear→sRGB encode. It does it, last.
 *
 *   • The clear colour is written raw to the framebuffer: it is neither tone
 *     mapped nor encoded. To make fog melt EXACTLY into the horizon we therefore
 *     push the fog colour through the same transform the geometry will receive,
 *     in JS, and use *that* as the clear colour. With post on  → ACES(fog).
 *     With post off → sRGB(ACES(fog)). See _applyHorizon().
 * ========================================================================== */
(function (global) {
  'use strict';

  var AOW = global.AOW || (global.AOW = {});
  if (AOW.Render) { return; }               // never double-install
  AOW.W = AOW.W || 420;                     // shared world length (contract)

  var THREE = global.THREE;

  /* --------------------------------------------------------------------------
   * Hard dependency guard. If three.js is missing we still publish a complete
   * no-op API so that every other module can call us without exploding.
   * ------------------------------------------------------------------------ */
  if (!THREE || !THREE.WebGLRenderer) {
    console.warn('[AOW.Render] THREE (r128 UMD) not found — renderer disabled, publishing no-op API.');
    AOW.Render = (function () {
      var noop = function () {};
      var stub = {
        version: '1.0.0', ready: false, failed: true,
        scene: null, camera: null, renderer: null, composer: null, canvas: null,
        perf: { tier: 'low', post: false, dpr: 1 },
        stats: { lastFrameMs: 0, fps: 0, drawCalls: 0, triangles: 0, points: 0, lines: 0, programs: 0 },
        lights: {}, groups: {}, textures: null,
        init: function () { return false; },
        color: function () { return null; },
        makeCanvasTexture: function () { return null; },
        worldToScreen: function (v, out) { return out || { x: 0, y: 0, z: 2 }; },
        screenToGround: function (x, y, out) { return out || null; }
      };
      ['dispose', 'render', 'resize', 'addObject', 'removeObject', 'disposeObject', 'clearTextureCache',
        'focusOn', 'setAutoFollow', 'setCamera', 'orbit', 'dolly', 'shake', 'addTrauma',
        'setTimeOfDay', 'setEraMood', 'setPostEnabled', 'setQuality', 'setDefeat', 'setExposure',
        'setHorizonColor', 'getFocusX', 'getTimeOfDay', 'isPostEnabled'].forEach(function (k) { stub[k] = noop; });
      return stub;
    })();
    return;
  }

  /* ==========================================================================
   * 0. SMALL MATH / COLOUR UTILITIES  (no allocations in the hot ones)
   * ======================================================================== */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /** Frame-rate independent smooth damp. lambda = "how fast", in 1/seconds. */
  function damp(cur, target, lambda, dt) {
    return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
  }

  /** sRGB hex → LINEAR THREE.Color. THE colour entry point for every module. */
  function makeColor(hex) {
    var c = new THREE.Color(hex);
    if (typeof c.convertSRGBToLinear === 'function') { c.convertSRGBToLinear(); }
    return c;
  }

  function srgbEncodeChannel(v) {
    // three's LinearToSRGB
    return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 0.41666) - 0.055;
  }

  function rrtAndOdtFit(v) {
    var a = v * (v + 0.0245786) - 0.000090537;
    var b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }

  /**
   * Byte-for-byte JS port of r128's ACESFilmicToneMapping GLSL (ACES in/out
   * matrices + RRTAndODTFit). We need this on the CPU so the clear colour can be
   * pushed through the same curve the geometry gets — that is what makes the
   * fog↔horizon seam invisible instead of "nearly right".
   */
  function acesToneMap(src, exposure, out) {
    var r = src.r * exposure / 0.6, g = src.g * exposure / 0.6, b = src.b * exposure / 0.6;
    // ACESInputMat (GLSL mat3 takes COLUMNS)
    var ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
    var ig = 0.07600 * r + 0.90834 * g + 0.01566 * b;
    var ib = 0.02840 * r + 0.13383 * g + 0.83777 * b;
    ir = rrtAndOdtFit(ir); ig = rrtAndOdtFit(ig); ib = rrtAndOdtFit(ib);
    // ACESOutputMat
    var orr = 1.60475 * ir + -0.53108 * ig + -0.07367 * ib;
    var ogg = -0.10208 * ir + 1.10813 * ig + -0.00605 * ib;
    var obb = -0.00327 * ir + -0.07276 * ig + 1.07602 * ib;
    out.setRGB(clamp01(orr), clamp01(ogg), clamp01(obb));
    return out;
  }

  /**
   * Cheap smooth pseudo-noise built from three offset sines. Deterministic,
   * allocation-free, roughly [-1,1], and — critically for camera shake — C1
   * continuous so the camera never pops. Real Perlin would be overkill here.
   */
  function noise1(x, seed) {
    return Math.sin(x * 1.000 + seed * 7.31) * 0.60 +
           Math.sin(x * 2.170 + seed * 3.11) * 0.30 +
           Math.sin(x * 4.130 + seed * 11.7) * 0.10;
  }

  function isPow2(v) { return (v & (v - 1)) === 0 && v > 0; }

  /* ==========================================================================
   * 1. MODULE STATE + SCRATCH OBJECTS (allocated once, reused forever)
   * ======================================================================== */

  var R = {};                    // the public object, filled in at the bottom

  var renderer = null, scene = null, camera = null, composer = null, canvas = null;
  var renderPass = null, bloomPass = null, gradePass = null, aaPass = null;
  var keyLight = null, hemiLight = null, rimLight = null, fillLight = null;
  var fog = null;
  var groups = {};
  var texCache = new Map();
  var maxAnisotropy = 1;
  var inited = false, failed = false, disposed = false;
  var ownLoopId = 0, drivenByCore = false;
  var paused = false;
  var lastTime = 0;
  var elapsed = 0;

  // --- scratch (NEVER allocate these inside the frame loop) ---
  var _v3a = new THREE.Vector3();
  var _v3b = new THREE.Vector3();
  var _v3c = new THREE.Vector3();
  var _v3d = new THREE.Vector3();
  var _colA = new THREE.Color();
  var _colB = new THREE.Color();
  var _colC = new THREE.Color();
  var _m4a = new THREE.Matrix4();
  var _m4b = new THREE.Matrix4();
  var _size = new THREE.Vector2();
  var _raycaster = new THREE.Raycaster();
  var _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  var _ndc = new THREE.Vector2();
  var _screenOut = { x: 0, y: 0, z: 0, visible: false };
  var _up = new THREE.Vector3(0, 1, 0);

  /* ==========================================================================
   * 2. PERFORMANCE TIERS
   * ======================================================================== */

  var QUALITY = {
    low: {
      dprCap: 1.5,           // 1.5 keeps text/edges readable without murdering fill rate
      antialias: true,       // no post on low → we need MSAA on the backbuffer
      post: false,
      shadows: true,
      shadowType: 'pcf',
      shadowMap: 1024,
      shadowRadius: 1,
      hdrBuffers: false,
      aa: 'fxaa',
      fillLight: false
    },
    medium: {
      dprCap: 2.0,
      antialias: false,      // SMAA/FXAA in the composer does the AA
      post: true,
      shadows: true,
      shadowType: 'pcfsoft',
      shadowMap: 2048,
      shadowRadius: 2,
      hdrBuffers: true,
      aa: 'fxaa',
      fillLight: true
    },
    high: {
      dprCap: 2.0,
      antialias: false,
      post: true,
      shadows: true,
      shadowType: 'pcfsoft',
      shadowMap: 3072,       // 3K over a ~120m band ≈ 4cm texels — armour reads crisp
      shadowRadius: 3,
      hdrBuffers: true,
      aa: 'smaa',
      fillLight: true
    }
  };

  var perf = {
    tier: 'high',
    post: true,
    dpr: 1,
    aa: 'smaa',
    autoTier: true
  };

  /** Guess a sensible tier before we've measured anything. */
  function detectTier() {
    try {
      // 1) Let Core decide if it already has an opinion (settings menu, save file).
      var st = AOW.Core && AOW.Core.state;
      var fromCore = st && st.perf && st.perf.tier;
      if (fromCore && QUALITY[fromCore]) { return fromCore; }

      var nav = global.navigator || {};
      var ua = (nav.userAgent || '');
      var mobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua);
      var cores = nav.hardwareConcurrency || (mobile ? 4 : 8);
      var mem = nav.deviceMemory || (mobile ? 4 : 8);
      var dpr = global.devicePixelRatio || 1;

      // Very small / very weak devices: hard low.
      if (cores <= 4 && mem <= 3) { return 'low'; }
      if (mobile) {
        // High-DPI phones push 3x the pixels; medium is the honest default and
        // we can be promoted later by the adaptive watchdog.
        return (cores >= 6 && mem >= 4 && dpr <= 3) ? 'medium' : 'low';
      }
      if (cores <= 4 || mem <= 4) { return 'medium'; }
      return 'high';
    } catch (e) {
      return 'medium';
    }
  }

  /* ==========================================================================
   * 3. TIME-OF-DAY PRESETS
   * --------------------------------------------------------------------------
   * t ∈ [0,1) is fraction of day, 0 = midnight. Stops are interpolated, so
   * setTimeOfDay() can be driven continuously (mission timers, era transitions)
   * or snapped. Colours are authored in sRGB hex and stored LINEAR.
   * ======================================================================== */

  function todStop(o) {
    return {
      at: o.at,
      horizon: makeColor(o.horizon),   // fog + sky seam colour (the money colour)
      sky: makeColor(o.sky),
      fogDensity: o.fogDensity,
      keyColor: makeColor(o.keyColor),
      keyIntensity: o.keyIntensity,
      sunDir: new THREE.Vector3(o.sunDir[0], o.sunDir[1], o.sunDir[2]).normalize(),
      hemiSky: makeColor(o.hemiSky),
      hemiGround: makeColor(o.hemiGround),
      hemiIntensity: o.hemiIntensity,
      rimColor: makeColor(o.rimColor),
      rimIntensity: o.rimIntensity,
      fillColor: makeColor(o.fillColor),
      fillIntensity: o.fillIntensity,
      exposure: o.exposure,
      bloom: o.bloom
    };
  }

  // Sun directions point FROM the scene TOWARD the light. The camera sits at -z
  // looking toward +z, so a -z component means the key comes from the camera's
  // side of the battle line (readable faces) rather than pure backlight.
  var TOD = [
    todStop({ at: 0.00, horizon: '#151b2e', sky: '#080c18', fogDensity: 0.0044,
      keyColor: '#7d92cf', keyIntensity: 0.30, sunDir: [-0.40, 0.72, -0.55],
      hemiSky: '#26314f', hemiGround: '#090c14', hemiIntensity: 0.38,
      rimColor: '#8fb4ff', rimIntensity: 0.60, fillColor: '#33406b', fillIntensity: 0.18,
      exposure: 1.16, bloom: 0.55 }),

    todStop({ at: 0.20, horizon: '#d98d6b', sky: '#4c6a9e', fogDensity: 0.0038,
      keyColor: '#ffb27c', keyIntensity: 0.95, sunDir: [-0.86, 0.17, -0.46],
      hemiSky: '#7089bb', hemiGround: '#3b3029', hemiIntensity: 0.60,
      rimColor: '#a2caff', rimIntensity: 0.72, fillColor: '#6d7fa8', fillIntensity: 0.22,
      exposure: 1.09, bloom: 0.46 }),

    todStop({ at: 0.35, horizon: '#bed2e2', sky: '#6f9ede', fogDensity: 0.0026,
      keyColor: '#ffe7c6', keyIntensity: 1.38, sunDir: [-0.58, 0.56, -0.50],
      hemiSky: '#a9c7ef', hemiGround: '#4b4237', hemiIntensity: 0.68,
      rimColor: '#c0daff', rimIntensity: 0.50, fillColor: '#93aed4', fillIntensity: 0.24,
      exposure: 1.05, bloom: 0.35 }),

    todStop({ at: 0.50, horizon: '#d2e2ec', sky: '#5f96de', fogDensity: 0.0021,
      keyColor: '#fff5e2', keyIntensity: 1.58, sunDir: [-0.24, 0.92, -0.30],
      hemiSky: '#bed8f3', hemiGround: '#564c3f', hemiIntensity: 0.76,
      rimColor: '#d2e6ff', rimIntensity: 0.42, fillColor: '#9fbadd', fillIntensity: 0.26,
      exposure: 1.02, bloom: 0.30 }),

    todStop({ at: 0.70, horizon: '#e9ba8c', sky: '#7fa4d1', fogDensity: 0.0030,
      keyColor: '#ffcf97', keyIntensity: 1.42, sunDir: [0.72, 0.33, -0.50],
      hemiSky: '#a0b9dd', hemiGround: '#5c4835', hemiIntensity: 0.62,
      rimColor: '#ffdcae', rimIntensity: 0.60, fillColor: '#a2b3d0', fillIntensity: 0.24,
      exposure: 1.06, bloom: 0.42 }),

    todStop({ at: 0.83, horizon: '#c76c56', sky: '#3e5084', fogDensity: 0.0040,
      keyColor: '#ff9463', keyIntensity: 0.78, sunDir: [0.88, 0.12, -0.42],
      hemiSky: '#57699f', hemiGround: '#2f2721', hemiIntensity: 0.46,
      rimColor: '#8caaff', rimIntensity: 0.66, fillColor: '#5a6a9c', fillIntensity: 0.20,
      exposure: 1.12, bloom: 0.50 }),

    todStop({ at: 1.00, horizon: '#151b2e', sky: '#080c18', fogDensity: 0.0044,
      keyColor: '#7d92cf', keyIntensity: 0.30, sunDir: [-0.40, 0.72, -0.55],
      hemiSky: '#26314f', hemiGround: '#090c14', hemiIntensity: 0.38,
      rimColor: '#8fb4ff', rimIntensity: 0.60, fillColor: '#33406b', fillIntensity: 0.18,
      exposure: 1.16, bloom: 0.55 })
  ];

  // Live interpolated time-of-day values (mutated in place — no allocation).
  var sky = {
    t: 0.62,                                   // late afternoon: warm, long shadows, high contrast
    horizon: new THREE.Color(), skyTop: new THREE.Color(),
    fogDensity: 0.003,
    keyColor: new THREE.Color(), keyIntensity: 1,
    sunDir: new THREE.Vector3(),
    hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 0.7,
    rimColor: new THREE.Color(), rimIntensity: 0.5,
    fillColor: new THREE.Color(), fillIntensity: 0.24,
    exposure: 1.05, bloom: 0.35
  };

  /* ==========================================================================
   * 4. ERA MOOD GRADES
   * --------------------------------------------------------------------------
   * Per-era colour science. This is what makes era 5 feel like a different
   * *film* rather than the same field with new hats.
   * ======================================================================== */

  var ERA_MOODS = {
    stone:      { sat: 1.00, contrast: 1.02, filmic: 0.25, tint: '#ffe0b0', tintAmt: 0.12, fogMul: 1.18, bloomMul: 0.85, exposureTrim: 0.00, todBias: 0.36 },
    medieval:   { sat: 1.03, contrast: 1.05, filmic: 0.30, tint: '#dbe6ff', tintAmt: 0.08, fogMul: 1.00, bloomMul: 1.00, exposureTrim: 0.00, todBias: 0.62 },
    renaissance:{ sat: 1.06, contrast: 1.07, filmic: 0.32, tint: '#ffedcd', tintAmt: 0.07, fogMul: 0.95, bloomMul: 1.05, exposureTrim: 0.01, todBias: 0.50 },
    industrial: { sat: 0.90, contrast: 1.11, filmic: 0.38, tint: '#cbd3da', tintAmt: 0.15, fogMul: 1.38, bloomMul: 0.90, exposureTrim: -0.02, todBias: 0.83 },
    modern:     { sat: 1.00, contrast: 1.09, filmic: 0.34, tint: '#e0e9f4', tintAmt: 0.06, fogMul: 1.06, bloomMul: 1.10, exposureTrim: 0.00, todBias: 0.35 },
    future:     { sat: 1.09, contrast: 1.13, filmic: 0.42, tint: '#c2e8ff', tintAmt: 0.17, fogMul: 0.86, bloomMul: 1.45, exposureTrim: 0.02, todBias: 0.00 }
  };
  var ERA_ORDER = ['stone', 'medieval', 'renaissance', 'industrial', 'modern', 'future'];

  var mood = {
    name: 'medieval',
    sat: 1.03, contrast: 1.05, filmic: 0.30,
    tint: makeColor('#dbe6ff'), tintAmt: 0.08,
    fogMul: 1.0, bloomMul: 1.0, exposureTrim: 0.0,
    // targets we damp toward so era changes are a smooth grade shift, not a cut
    tSat: 1.03, tContrast: 1.05, tFilmic: 0.30, tTintAmt: 0.08,
    tTint: makeColor('#dbe6ff'), tFogMul: 1.0, tBloomMul: 1.0, tExposureTrim: 0.0
  };

  var defeat = { value: 0, target: 0 };

  /* ==========================================================================
   * 5. CAMERA RIG
   * --------------------------------------------------------------------------
   * A slight telephoto (fov 32) compresses the battle line so 200 units read as
   * a dense wall instead of a scattered field. That compression, plus the tight
   * shadow band, is 80% of why this looks expensive.
   * ======================================================================== */

  var rig = {
    fov: 32,
    near: 1.2,
    far: 900,

    lookHeight: 3.4,          // aim slightly above the ground so units sit in frame

    focusX: 62, focusTargetX: 62,
    focusY: 3.4,

    yaw: 0.10, yawTarget: 0.10,          // radians; + = orbit right
    yawMin: -0.436, yawMax: 0.436,       // ±25°
    pitch: 0.235, pitchTarget: 0.235,    // radians above horizon (~13.5°)
    pitchMin: 0.06, pitchMax: 0.62,
    dist: 96, distTarget: 96,
    distMin: 26, distMax: 132,

    focusLambda: 3.6,         // how eagerly the look-at chases the front line
    orbitLambda: 5.0,
    dollyLambda: 3.0,

    autoFollow: true,
    deadZone: 7.0,            // world units of slop before the camera bothers to move
    spanMin: 34,              // never zoom tighter than this much battlefield
    // Player feedback: "can't see the battlefield". At the old 165m span a
    // 1.8m soldier was ~1% of the frame — technically visible, actually a
    // speck. Capping the span keeps troops readable; when the two armies are
    // further apart than this the camera frames the FRONT LINE (where the
    // fight will happen) instead of pulling back to show empty ground.
    spanMax: 92,
    spanMargin: 14,
    zoomDeadZone: 0.05,       // 5% — stops zoom hunting when a unit dies

    idleT: Math.random() * 100,
    idleAmp: 1.0,             // 0 disables the idle drift entirely

    trauma: 0,
    traumaDecay: 2.6,         // per second; settles fast so hits punctuate, not blur
    shakeT: 0,
    // Player feedback: shake was overwhelming. A soldier is 1.8m tall, so a
    // 1.35m camera throw was nearly a body-length per hit — and because every
    // hit in a busy melee adds trauma, it pegged at max and never settled.
    // These give a firm punch you feel without losing the battlefield.
    shakePos: 0.26,           // metres at trauma = 1
    shakeRot: 0.014,          // radians at trauma = 1
    traumaBudget: 0,          // rate-limiter: how much trauma was added recently
    shakeScale: 1,            // user setting (0 = off)

    // cached derived values
    hFovHalfTan: 0.3,
    enabled: true
  };

  var fortPlayerX = 20, fortEnemyX = 400;   // contract defaults; refined from Core if present

  /* ==========================================================================
   * 6. THE GRADE SHADER — vignette + chromatic aberration + filmic grade +
   *    grain + defeat desaturation + the sRGB encode, all in ONE pass.
   * ======================================================================== */

  var GradeShader = {
    uniforms: {
      tDiffuse:    { value: null },
      resolution:  { value: new THREE.Vector2(1920, 1080) },
      time:        { value: 0 },
      aspect:      { value: 1.777 },

      contrast:    { value: 1.05 },
      filmic:      { value: 0.30 },
      saturation:  { value: 1.03 },
      tintColor:   { value: new THREE.Vector3(1, 1, 1) },
      tintAmount:  { value: 0.08 },
      lift:        { value: 0.0 },
      gain:        { value: 1.0 },

      vignette:    { value: 0.42 },   // strength
      vignetteFeather: { value: 0.62 },

      caAmount:    { value: 0.0018 }, // radial chromatic aberration at the corners
      grain:       { value: 0.028 },
      defeat:      { value: 0.0 }
    },

    vertexShader: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
      '}'
    ].join('\n'),

    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform vec2  resolution;',
      'uniform float time;',
      'uniform float aspect;',
      'uniform float contrast;',
      'uniform float filmic;',
      'uniform float saturation;',
      'uniform vec3  tintColor;',
      'uniform float tintAmount;',
      'uniform float lift;',
      'uniform float gain;',
      'uniform float vignette;',
      'uniform float vignetteFeather;',
      'uniform float caAmount;',
      'uniform float grain;',
      'uniform float defeat;',
      'varying vec2 vUv;',
      '',
      'const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );',
      '',
      // three's LinearToSRGB — the composer path never applies output encoding,
      // so this pass owns it. Must be the LAST thing before AA.
      'vec3 linearToSRGB( vec3 v ) {',
      '  vec3 lo = v * 12.92;',
      '  vec3 hi = 1.055 * pow( max( v, vec3( 0.0 ) ), vec3( 0.41666 ) ) - 0.055;',
      '  return mix( hi, lo, vec3( lessThanEqual( v, vec3( 0.0031308 ) ) ) );',
      '}',
      '',
      'float hash21( vec2 p ) {',
      '  p = fract( p * vec2( 443.8975, 397.2973 ) );',
      '  p += dot( p.xy, p.yx + 19.19 );',
      '  return fract( p.x * p.y );',
      '}',
      '',
      'void main() {',
      '  vec2 uv = vUv;',
      '  vec2 c  = uv - 0.5;',
      '  float r2 = dot( c, c );',
      '',
      // --- 1. chromatic aberration -----------------------------------------
      // Scaled by r^2 so the centre (where the player is looking) is perfectly
      // clean and only the frame edges get the lens character.
      '  vec2 off = c * ( caAmount * r2 * 4.0 );',
      '  vec3 col;',
      '  col.r = texture2D( tDiffuse, clamp( uv + off, 0.0, 1.0 ) ).r;',
      '  col.g = texture2D( tDiffuse, uv ).g;',
      '  col.b = texture2D( tDiffuse, clamp( uv - off, 0.0, 1.0 ) ).b;',
      '  col = max( col, vec3( 0.0 ) );',
      '',
      // --- 2. to display space, then grade ---------------------------------
      // Grading after the sRGB encode is far more predictable to author against
      // than grading in linear: "contrast 1.1" behaves like it does in Lightroom.
      '  vec3 d = linearToSRGB( col );',
      '',
      '  d = clamp( ( d - 0.5 ) * contrast + 0.5, 0.0, 1.0 );',      // linear contrast
      '  vec3 s = d * d * ( 3.0 - 2.0 * d );',                        // soft filmic S-curve
      '  d = mix( d, s, filmic );',
      '',
      '  float l = dot( d, LUMA );',
      '  d = mix( vec3( l ), d, saturation );',
      '',
      '  d *= mix( vec3( 1.0 ), tintColor, tintAmount );',
      '  d = d * gain + lift;',
      '',
      // --- 3. defeat: drain the world, keep a cold cast --------------------
      '  if ( defeat > 0.001 ) {',
      '    float dl = dot( d, LUMA );',
      '    vec3 dead = vec3( dl ) * vec3( 0.88, 0.92, 1.04 );',
      '    d = mix( d, dead, defeat );',
      '    d *= mix( 1.0, 0.72, defeat );',
      '  }',
      '',
      // --- 4. vignette ------------------------------------------------------
      // Aspect-corrected so it stays circular on ultrawide instead of ovalling.
      '  float vr = length( vec2( c.x * aspect, c.y ) ) * 1.42;',
      '  float vig = smoothstep( 1.0, 1.0 - vignetteFeather, vr );',
      '  d *= mix( 1.0, vig, vignette );',
      '',
      // --- 5. grain ---------------------------------------------------------
      // Weighted toward the shadows: highlights stay clean, darks get the film
      // texture that hides 8-bit banding.
      '  float g = hash21( uv * resolution + fract( time ) * 137.13 ) - 0.5;',
      '  float shadowW = 1.0 - smoothstep( 0.0, 0.75, dot( d, LUMA ) );',
      '  d += g * grain * ( 0.35 + 0.65 * shadowW );',
      '',
      '  gl_FragColor = vec4( clamp( d, 0.0, 1.0 ), 1.0 );',
      '}'
    ].join('\n')
  };

  /* ==========================================================================
   * 7. EVENT BUS HELPERS (safe when Core isn't loaded)
   * ======================================================================== */

  function busOn(name, fn) {
    try {
      if (AOW.Core && typeof AOW.Core.on === 'function') { AOW.Core.on(name, fn); return true; }
    } catch (e) { /* fall through */ }
    return false;
  }

  function busEmit(name, payload) {
    try {
      if (AOW.Core && typeof AOW.Core.emit === 'function') { AOW.Core.emit(name, payload); }
    } catch (e) { /* never let a listener kill the frame */ }
  }

  /* ==========================================================================
   * 8. INIT
   * ======================================================================== */

  function resolveCanvas(opts) {
    if (opts && opts.canvas && opts.canvas.getContext) { return opts.canvas; }
    var ids = ['gl', 'game-canvas', 'gameCanvas', 'canvas', 'game', 'three'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && el.tagName === 'CANVAS') { return el; }
    }
    var found = document.querySelector('canvas#gl, canvas.aow-canvas, canvas');
    if (found) { return found; }
    // Nothing there — make our own and fill the viewport.
    var cv = document.createElement('canvas');
    cv.id = 'gl';
    cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;display:block;z-index:0;touch-action:none;';
    var host = document.getElementById('app') || document.body;
    if (host.firstChild) { host.insertBefore(cv, host.firstChild); } else { host.appendChild(cv); }
    return cv;
  }

  function viewportSize(out) {
    var w = 0, h = 0;
    if (canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      w = canvas.clientWidth; h = canvas.clientHeight;
    } else {
      w = global.innerWidth || 1280;
      h = global.innerHeight || 720;
    }
    out.set(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
    return out;
  }

  function init(opts) {
    if (inited) { return true; }
    if (failed) { return false; }
    opts = opts || {};

    try {
      canvas = resolveCanvas(opts);

      // ---- tier -------------------------------------------------------------
      if (opts.tier && QUALITY[opts.tier]) { perf.tier = opts.tier; perf.autoTier = false; }
      else { perf.tier = detectTier(); }
      var q = QUALITY[perf.tier];

      // ---- renderer ---------------------------------------------------------
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: (opts.antialias !== undefined) ? !!opts.antialias : q.antialias,
        alpha: false,
        stencil: false,
        depth: true,
        powerPreference: 'high-performance',
        // Keeping the drawing buffer lets the UI grab a screenshot for the
        // end-of-battle card without a second render.
        preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
        failIfMajorPerformanceCaveat: false
      });

      perf.dpr = Math.min(q.dprCap, global.devicePixelRatio || 1);
      renderer.setPixelRatio(perf.dpr);
      viewportSize(_size);
      renderer.setSize(_size.x, _size.y, false);

      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = sky.exposure;   // ~1.05: ACES is slightly dark by default
      renderer.physicallyCorrectLights = false;      // stylized: we want art-directable intensities
      renderer.autoClear = true;
      renderer.sortObjects = true;
      renderer.info.autoReset = false;               // we reset once per FRAME, not per pass

      renderer.shadowMap.enabled = q.shadows;
      renderer.shadowMap.type = (q.shadowType === 'pcfsoft') ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      renderer.shadowMap.autoUpdate = true;

      maxAnisotropy = 1;
      try { maxAnisotropy = renderer.capabilities.getMaxAnisotropy() || 1; } catch (e) { maxAnisotropy = 1; }

      // Context loss must degrade, not crash.
      canvas.addEventListener('webglcontextlost', onContextLost, false);
      canvas.addEventListener('webglcontextrestored', onContextRestored, false);

      // ---- scene + fog ------------------------------------------------------
      scene = new THREE.Scene();
      // FogExp2 (exponential-squared) rather than linear: the falloff curve is
      // what makes distance feel like *atmosphere* instead of a grey curtain.
      fog = new THREE.FogExp2(0x000000, sky.fogDensity);
      scene.fog = fog;
      scene.background = null;   // we drive the clear colour ourselves — see _applyHorizon

      groups.world = new THREE.Group();  groups.world.name = 'world';
      groups.terrain = new THREE.Group(); groups.terrain.name = 'terrain';
      groups.units = new THREE.Group();  groups.units.name = 'units';
      groups.forts = new THREE.Group();  groups.forts.name = 'forts';
      groups.fx = new THREE.Group();     groups.fx.name = 'fx';
      groups.ui3d = new THREE.Group();   groups.ui3d.name = 'ui3d';
      scene.add(groups.world);
      groups.world.add(groups.terrain, groups.forts, groups.units, groups.fx, groups.ui3d);

      // ---- camera -----------------------------------------------------------
      var aspect = _size.x / _size.y;
      camera = new THREE.PerspectiveCamera(rig.fov, aspect, rig.near, rig.far);
      camera.position.set(rig.focusX, 24, -90);
      camera.lookAt(rig.focusX, rig.lookHeight, 0);
      scene.add(camera);   // so modules can parent audio listeners / HUD sprites

      if (typeof opts.focusX === 'number') { rig.focusX = rig.focusTargetX = opts.focusX; }
      if (opts.autoFollow === false) { rig.autoFollow = false; }

      // ---- lights -----------------------------------------------------------
      buildLights(q);

      // ---- time of day + mood ----------------------------------------------
      applyTimeOfDay(sky.t, true);
      setEraMood(opts.era || 'medieval', true);

      // ---- post -------------------------------------------------------------
      perf.aa = q.aa;
      perf.post = (opts.post !== undefined) ? !!opts.post : q.post;
      if (perf.post) { buildComposer(q); }
      _applyHorizon();

      // ---- wiring -----------------------------------------------------------
      wireEvents();
      resize();

      inited = true;
      R.ready = true;
      R.scene = scene; R.camera = camera; R.renderer = renderer; R.composer = composer;
      R.canvas = canvas;
      R.lights = { key: keyLight, hemi: hemiLight, rim: rimLight, fill: fillLight };
      R.groups = groups;
      R.maxAnisotropy = maxAnisotropy;

      // ---- frame loop -------------------------------------------------------
      lastTime = (global.performance && performance.now) ? performance.now() : Date.now();
      if (AOW.Core && typeof AOW.Core.registerRender === 'function') {
        AOW.Core.registerRender(coreRenderHook);
        drivenByCore = true;
      } else {
        drivenByCore = false;
        startOwnLoop();
      }

      busEmit('render:ready', { renderer: renderer, scene: scene, camera: camera, tier: perf.tier, post: perf.post });
      busEmit('render:horizon', { color: srgbHexOf(sky.horizon), density: fog.density });

      console.info('[AOW.Render] ready — tier=' + perf.tier + ' dpr=' + perf.dpr.toFixed(2) +
        ' post=' + perf.post + (perf.post ? (' aa=' + perf.aa) : '') +
        ' shadows=' + (q.shadows ? q.shadowMap : 'off'));
      return true;

    } catch (err) {
      failed = true;
      console.warn('[AOW.Render] init failed — the game will run without 3D output.', err);
      try { if (renderer) { renderer.dispose(); } } catch (e2) { /* ignore */ }
      renderer = null; composer = null;
      return false;
    }
  }

  /* ==========================================================================
   * 9. LIGHTING
   * --------------------------------------------------------------------------
   * Three-point-ish rig, because a single sun makes everything look like a
   * student demo:
   *   KEY  — warm directional, casts the only shadow, tightly fitted frustum.
   *   HEMI — sky/ground bounce, gives the ambient a vertical gradient so the
   *          tops of helmets pick up sky and boots pick up dirt.
   *   RIM  — cool back/kicker light. This is the silhouette separator: without
   *          it 200 dark units against a dark fort become one blob.
   *   FILL — very low front-side wash so shadow sides never go fully black.
   * ======================================================================== */

  var shadowState = { radius: 0, quantRadius: 0, mapSize: 2048, distance: 150, texelSnap: true };

  function buildLights(q) {
    // ---- KEY ---------------------------------------------------------------
    keyLight = new THREE.DirectionalLight(0xfff0d8, 1.4);
    keyLight.castShadow = q.shadows;
    keyLight.shadow.mapSize.width = q.shadowMap;
    keyLight.shadow.mapSize.height = q.shadowMap;
    // bias tuning: a small negative constant bias kills acne on the near-flat
    // ground, while normalBias does the heavy lifting on the curved character
    // surfaces without the peter-panning a large constant bias would cause.
    keyLight.shadow.bias = -0.00035;
    keyLight.shadow.normalBias = 0.035;
    keyLight.shadow.radius = q.shadowRadius;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 420;
    keyLight.target.position.set(rig.focusX, 0, 0);
    scene.add(keyLight);
    scene.add(keyLight.target);
    shadowState.mapSize = q.shadowMap;

    // ---- HEMI --------------------------------------------------------------
    hemiLight = new THREE.HemisphereLight(0xbed8f3, 0x564c3f, 0.75);
    hemiLight.position.set(0, 60, 0);
    scene.add(hemiLight);

    // ---- RIM ---------------------------------------------------------------
    // Positioned behind and above the battle line (+z is away from camera) and
    // pushed to one side so the kick lands on one edge, not symmetrically.
    rimLight = new THREE.DirectionalLight(0xcfe4ff, 0.5);
    rimLight.castShadow = false;
    rimLight.position.set(0.55, 0.72, 0.85);
    scene.add(rimLight);
    scene.add(rimLight.target);

    // ---- FILL --------------------------------------------------------------
    if (q.fillLight) {
      fillLight = new THREE.DirectionalLight(0x9fbadd, 0.24);
      fillLight.castShadow = false;
      fillLight.position.set(0.6, 0.35, -0.9);
      scene.add(fillLight);
      scene.add(fillLight.target);
    } else {
      fillLight = null;
    }
  }

  /**
   * Fit the shadow frustum to the visible battle band and snap it to the shadow
   * map's texel grid.
   *
   * WHY: one giant ortho frustum covering all 420m at 2048px gives ~20cm texels —
   * blobby, crawling shadows. Fitting to the ~120m the camera can actually see
   * gives ~6cm texels, which is the difference between "a smudge under the unit"
   * and "you can see the shape of the shield". The texel snap is mandatory once
   * the frustum moves: without it every shadow edge boils as the camera pans.
   */
  function updateShadowFrustum() {
    if (!keyLight || !keyLight.castShadow) { return; }

    // Bounding sphere of the visible band. Using a SPHERE (not a box) makes the
    // fit rotation-invariant, so the frustum size doesn't change as we orbit —
    // which is what lets the texel snap actually hold still.
    var halfW = rig.dist * rig.hFovHalfTan;
    var laneHalf = 22;                      // lane depth ±16 plus prop overhang
    var vertical = 14;                      // tallest siege engines / banners
    var radius = Math.sqrt(halfW * halfW + laneHalf * laneHalf) + vertical;

    // Quantise the radius so tiny dolly changes don't re-create the projection
    // every frame (each change = a full shadow-edge shimmer).
    var quant = Math.max(2, Math.round(radius / 8) * 2);
    var qRadius = Math.ceil(radius / quant) * quant;

    var sc = keyLight.shadow.camera;
    if (qRadius !== shadowState.quantRadius) {
      shadowState.quantRadius = qRadius;
      sc.left = -qRadius; sc.right = qRadius;
      sc.top = qRadius; sc.bottom = -qRadius;
      shadowState.distance = qRadius * 2.2 + 40;
      sc.near = 1;
      sc.far = shadowState.distance + qRadius * 2 + 20;
      sc.updateProjectionMatrix();
    }

    // Centre of the band, on the ground, at the camera focus.
    _v3a.set(rig.focusX, 2.0, 0);

    // Light direction (world → light). sky.sunDir points TOWARD the light.
    _v3b.copy(sky.sunDir).normalize();
    if (_v3b.lengthSq() < 1e-6) { _v3b.set(-0.5, 0.8, -0.4).normalize(); }

    if (shadowState.texelSnap) {
      // Build the light's view basis, snap the centre inside it, transform back.
      _v3c.copy(_v3a).addScaledVector(_v3b, shadowState.distance);   // light pos
      _m4a.lookAt(_v3c, _v3a, _up);                                   // rotation only
      _m4a.setPosition(_v3c);
      _m4b.copy(_m4a).invert();

      var texelWorld = (qRadius * 2) / shadowState.mapSize;
      _v3d.copy(_v3a).applyMatrix4(_m4b);                             // centre in light space
      _v3d.x = Math.round(_v3d.x / texelWorld) * texelWorld;
      _v3d.y = Math.round(_v3d.y / texelWorld) * texelWorld;
      _v3d.applyMatrix4(_m4a);                                        // back to world
      _v3a.copy(_v3d);
    }

    keyLight.target.position.copy(_v3a);
    keyLight.position.copy(_v3a).addScaledVector(_v3b, shadowState.distance);
    keyLight.target.updateMatrixWorld();
    keyLight.updateMatrixWorld();

    // Keep the non-shadow lights anchored to the action so their directions stay
    // consistent (directional lights only care about direction, but three derives
    // it from position→target, and a target 300m away skews it).
    if (rimLight) {
      rimLight.target.position.set(rig.focusX, 2, 0);
      rimLight.position.set(rig.focusX + 30, 42, 48);
      rimLight.target.updateMatrixWorld();
    }
    if (fillLight) {
      fillLight.target.position.set(rig.focusX, 2, 0);
      fillLight.position.set(rig.focusX + 34, 22, -52);
      fillLight.target.updateMatrixWorld();
    }
    if (hemiLight) { hemiLight.position.set(rig.focusX, 60, 0); }
  }

  /* ==========================================================================
   * 10. POST-PROCESSING
   * ======================================================================== */

  function supportsHalfFloatTargets() {
    try {
      if (renderer.capabilities.isWebGL2) { return true; }
      var gl = renderer.getContext();
      return !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('WEBGL_color_buffer_float'));
    } catch (e) { return false; }
  }

  function buildComposer(q) {
    composer = null;
    renderPass = bloomPass = gradePass = aaPass = null;

    if (!THREE.EffectComposer || !THREE.RenderPass || !THREE.ShaderPass || !THREE.CopyShader) {
      console.warn('[AOW.Render] EffectComposer stack unavailable — falling back to direct render.');
      perf.post = false;
      return;
    }

    try {
      viewportSize(_size);
      var cssW = _size.x, cssH = _size.y;

      // HDR-ish buffers: the chain stores ACES-tonemapped LINEAR values. In 8 bit
      // that bands horribly in sky gradients and shadow falloff, and every extra
      // pass compounds it. Half-float costs bandwidth, so low tier never gets here.
      var params = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        encoding: THREE.LinearEncoding,
        stencilBuffer: false,
        depthBuffer: true
      };
      if (q.hdrBuffers && supportsHalfFloatTargets()) { params.type = THREE.HalfFloatType; }

      // Construct at CSS size, then let setPixelRatio scale to device pixels —
      // this is the only ordering that doesn't briefly allocate a dpr² target.
      var rt = new THREE.WebGLRenderTarget(cssW, cssH, params);
      rt.texture.name = 'AOW.Render.rt';

      composer = new THREE.EffectComposer(renderer, rt);
      composer.setPixelRatio(perf.dpr);
      composer.setSize(cssW, cssH);

      renderPass = new THREE.RenderPass(scene, camera);
      composer.addPass(renderPass);

      // --- BLOOM -----------------------------------------------------------
      // strength 0.35 / radius 0.5 / threshold 0.85: bloom should KISS the
      // specular hits on armour and the sparks, and be invisible everywhere
      // else. Anything above ~0.5 strength and the whole frame goes milky and
      // reads as cheap mobile-game glow.
      if (THREE.UnrealBloomPass && THREE.LuminosityHighPassShader) {
        bloomPass = new THREE.UnrealBloomPass(
          new THREE.Vector2(cssW * perf.dpr, cssH * perf.dpr), 0.35, 0.5, 0.85);
        bloomPass.threshold = 0.85;
        applyBloomStrength();
        bloomPass.radius = 0.5;
        composer.addPass(bloomPass);
      } else {
        console.warn('[AOW.Render] UnrealBloomPass unavailable — continuing without bloom.');
      }

      // --- GRADE (tone-mapped linear → graded sRGB) --------------------------
      gradePass = new THREE.ShaderPass(GradeShader);
      composer.addPass(gradePass);

      // --- AA (runs LAST, on the final sRGB LDR image) -----------------------
      // Edge detection is a perceptual operation: running it before the grade,
      // on linear values, misses edges in the shadows and over-blurs highlights.
      // NB: vendor/SMAAShader.js exports SMAAEdgesShader/WeightsShader/BlendShader —
      // there is NO THREE.SMAAShader. Testing for that name silently demotes every
      // high-tier device to FXAA.
      if (perf.aa === 'smaa' && THREE.SMAAPass && THREE.SMAAEdgesShader) {
        aaPass = new THREE.SMAAPass(cssW * perf.dpr, cssH * perf.dpr);
        composer.addPass(aaPass);
      } else if (THREE.FXAAShader) {
        aaPass = new THREE.ShaderPass(THREE.FXAAShader);
        aaPass.material.uniforms.resolution.value.set(1 / (cssW * perf.dpr), 1 / (cssH * perf.dpr));
        composer.addPass(aaPass);
        perf.aa = 'fxaa';
      } else {
        perf.aa = 'none';
      }

      if (gradePass) {
        gradePass.material.uniforms.resolution.value.set(cssW * perf.dpr, cssH * perf.dpr);
        gradePass.material.uniforms.aspect.value = cssW / cssH;
      }
      applyGradeUniforms();

    } catch (err) {
      console.warn('[AOW.Render] post-processing init failed — falling back to direct render.', err);
      try { if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); } } catch (e) { /* ignore */ }
      composer = null; renderPass = bloomPass = gradePass = aaPass = null;
      perf.post = false;
    }
  }

  function destroyComposer() {
    if (!composer) { return; }
    try {
      if (aaPass && aaPass.dispose) { aaPass.dispose(); }
      if (bloomPass && bloomPass.dispose) { bloomPass.dispose(); }
      if (gradePass && gradePass.material) { gradePass.material.dispose(); }
      if (composer.renderTarget1) { composer.renderTarget1.dispose(); }
      if (composer.renderTarget2) { composer.renderTarget2.dispose(); }
    } catch (e) { /* ignore */ }
    composer = null; renderPass = bloomPass = gradePass = aaPass = null;
    R.composer = null;
  }

  function applyGradeUniforms() {
    if (!gradePass) { return; }
    var u = gradePass.material.uniforms;
    u.contrast.value = mood.contrast;
    u.filmic.value = mood.filmic;
    // The shader also desaturates on defeat; this just adds a little extra bite
    // without double-crushing the image to flat grey.
    u.saturation.value = mood.sat * lerp(1, 0.55, defeat.value);
    u.tintColor.value.set(mood.tint.r, mood.tint.g, mood.tint.b);
    u.tintAmount.value = mood.tintAmt;
    u.defeat.value = defeat.value;
  }

  /**
   * Bloom strength, with a hard ceiling.
   *
   * The base is ~0.35, but night/dusk push it up and the "future" era multiplies
   * it by 1.45 — stacked, that reaches 0.72, which is where bloom stops kissing
   * highlights and starts fogging the whole frame. 0.55 is the empirical point
   * where it still reads as glow rather than haze, so we clamp there no matter
   * what combination of time-of-day and era the player reaches.
   */
  var BLOOM_MAX = 0.55;
  function applyBloomStrength() {
    if (!bloomPass) { return; }
    bloomPass.strength = Math.min(BLOOM_MAX, sky.bloom * mood.bloomMul);
  }

  /** Linear THREE.Color → sRGB hex int, for handing colours to other modules. */
  function srgbHexOf(colorLinear) {
    _colB.copy(colorLinear);
    if (typeof _colB.convertLinearToSRGB === 'function') { _colB.convertLinearToSRGB(); }
    return _colB.getHex();
  }

  /* ==========================================================================
   * 11. HORIZON / FOG / CLEAR-COLOUR COUPLING
   * ======================================================================== */

  function _applyHorizon() {
    if (!renderer || !fog) { return; }
    fog.color.copy(sky.horizon);
    fog.density = sky.fogDensity * mood.fogMul;

    var exposure = renderer.toneMappingExposure;

    // The clear colour never goes through a shader, so we replicate — exactly —
    // whatever transform the fully-fogged geometry WILL receive:
    //   post on  : RenderPass tone maps into a linear buffer  → ACES only.
    //   post off : renderer tone maps AND sRGB-encodes to screen → ACES + sRGB.
    acesToneMap(sky.horizon, exposure, _colA);
    if (!perf.post || !composer) {
      _colA.setRGB(srgbEncodeChannel(_colA.r), srgbEncodeChannel(_colA.g), srgbEncodeChannel(_colA.b));
    }
    renderer.setClearColor(_colA, 1);
  }

  /* ==========================================================================
   * 12. TIME OF DAY
   * ======================================================================== */

  function applyTimeOfDay(t, immediate) {
    t = t - Math.floor(t);           // wrap into [0,1)
    sky.t = t;

    // find bracketing stops
    var i = 0;
    for (i = 0; i < TOD.length - 1; i++) {
      if (t >= TOD[i].at && t <= TOD[i + 1].at) { break; }
    }
    if (i >= TOD.length - 1) { i = TOD.length - 2; }
    var a = TOD[i], b = TOD[i + 1];
    var span = (b.at - a.at) || 1;
    var f = clamp01((t - a.at) / span);
    // Smoothstep the blend so dawn/dusk transitions ease rather than ramp linearly.
    f = f * f * (3 - 2 * f);

    sky.horizon.copy(a.horizon).lerp(b.horizon, f);
    sky.skyTop.copy(a.sky).lerp(b.sky, f);
    sky.fogDensity = lerp(a.fogDensity, b.fogDensity, f);
    sky.keyColor.copy(a.keyColor).lerp(b.keyColor, f);
    sky.keyIntensity = lerp(a.keyIntensity, b.keyIntensity, f);
    sky.sunDir.copy(a.sunDir).lerp(b.sunDir, f).normalize();
    sky.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, f);
    sky.hemiGround.copy(a.hemiGround).lerp(b.hemiGround, f);
    sky.hemiIntensity = lerp(a.hemiIntensity, b.hemiIntensity, f);
    sky.rimColor.copy(a.rimColor).lerp(b.rimColor, f);
    sky.rimIntensity = lerp(a.rimIntensity, b.rimIntensity, f);
    sky.fillColor.copy(a.fillColor).lerp(b.fillColor, f);
    sky.fillIntensity = lerp(a.fillIntensity, b.fillIntensity, f);
    sky.exposure = lerp(a.exposure, b.exposure, f);
    sky.bloom = lerp(a.bloom, b.bloom, f);

    if (keyLight) {
      keyLight.color.copy(sky.keyColor);
      keyLight.intensity = sky.keyIntensity;
    }
    if (hemiLight) {
      hemiLight.color.copy(sky.hemiSky);
      hemiLight.groundColor.copy(sky.hemiGround);
      hemiLight.intensity = sky.hemiIntensity;
    }
    if (rimLight) {
      rimLight.color.copy(sky.rimColor);
      rimLight.intensity = sky.rimIntensity;
    }
    if (fillLight) {
      fillLight.color.copy(sky.fillColor);
      fillLight.intensity = sky.fillIntensity;
    }
    if (renderer) {
      renderer.toneMappingExposure = sky.exposure + mood.exposureTrim;
    }
    if (bloomPass) { applyBloomStrength(); }

    shadowState.quantRadius = 0;      // force a frustum refit (sun moved)
    _applyHorizon();

    busEmit('render:horizon', {
      color: srgbHexOf(sky.horizon),
      skyTop: srgbHexOf(sky.skyTop),
      density: fog ? fog.density : 0,
      t: t
    });

    if (immediate && keyLight) { updateShadowFrustum(); }
  }

  /* ==========================================================================
   * 13. ERA MOOD
   * ======================================================================== */

  function resolveEra(era) {
    if (typeof era === 'number') {
      return ERA_ORDER[clamp(Math.floor(era), 0, ERA_ORDER.length - 1)];
    }
    if (typeof era === 'string') {
      var k = era.toLowerCase();
      if (ERA_MOODS[k]) { return k; }
      // tolerate common aliases so Campaign/Economy naming can't break us
      if (/stone|cave|prehist|tribal/.test(k)) { return 'stone'; }
      if (/medi|castle|knight|dark/.test(k)) { return 'medieval'; }
      if (/renai|gunpow|musket|colon/.test(k)) { return 'renaissance'; }
      if (/indus|steam|ww1|victor/.test(k)) { return 'industrial'; }
      if (/modern|ww2|contemp|current/.test(k)) { return 'modern'; }
      if (/future|sci|space|laser|mech/.test(k)) { return 'future'; }
    }
    return mood.name;
  }

  function setEraMood(era, immediate) {
    var name = resolveEra(era);
    var m = ERA_MOODS[name];
    if (!m) { return; }
    mood.name = name;
    mood.tSat = m.sat;
    mood.tContrast = m.contrast;
    mood.tFilmic = m.filmic;
    mood.tTint.copy(makeColor(m.tint));
    mood.tTintAmt = m.tintAmt;
    mood.tFogMul = m.fogMul;
    mood.tBloomMul = m.bloomMul;
    mood.tExposureTrim = m.exposureTrim;

    if (immediate) {
      mood.sat = mood.tSat; mood.contrast = mood.tContrast; mood.filmic = mood.tFilmic;
      mood.tint.copy(mood.tTint); mood.tintAmt = mood.tTintAmt;
      mood.fogMul = mood.tFogMul; mood.bloomMul = mood.tBloomMul;
      mood.exposureTrim = mood.tExposureTrim;
      applyGradeUniforms();
      _applyHorizon();
      if (renderer) { renderer.toneMappingExposure = sky.exposure + mood.exposureTrim; }
      if (bloomPass) { applyBloomStrength(); }
    }
  }

  function updateMood(dt) {
    // 1.6/s ≈ a ~1.5s grade cross-fade: long enough to feel cinematic, short
    // enough that the player connects it to the era-up they just paid for.
    var L = 1.6;
    mood.sat = damp(mood.sat, mood.tSat, L, dt);
    mood.contrast = damp(mood.contrast, mood.tContrast, L, dt);
    mood.filmic = damp(mood.filmic, mood.tFilmic, L, dt);
    mood.tintAmt = damp(mood.tintAmt, mood.tTintAmt, L, dt);
    mood.tint.lerp(mood.tTint, clamp01(1 - Math.exp(-L * dt)));

    var prevFog = mood.fogMul, prevBloom = mood.bloomMul, prevTrim = mood.exposureTrim;
    mood.fogMul = damp(mood.fogMul, mood.tFogMul, L, dt);
    mood.bloomMul = damp(mood.bloomMul, mood.tBloomMul, L, dt);
    mood.exposureTrim = damp(mood.exposureTrim, mood.tExposureTrim, L, dt);

    defeat.value = damp(defeat.value, defeat.target, 1.8, dt);   // ~1.5s to fully drain

    if (Math.abs(prevFog - mood.fogMul) > 1e-5 || Math.abs(prevTrim - mood.exposureTrim) > 1e-5) {
      if (renderer) { renderer.toneMappingExposure = sky.exposure + mood.exposureTrim; }
      _applyHorizon();
    }
    if (bloomPass && Math.abs(prevBloom - mood.bloomMul) > 1e-5) {
      applyBloomStrength();
    }
    applyGradeUniforms();
  }

  /* ==========================================================================
   * 14. CAMERA UPDATE (auto-follow, damping, idle drift, trauma shake)
   * ======================================================================== */

  /** Pull the frontmost unit of each team out of the live sim state. */
  var frontLine = { friendly: 0, enemy: 0, hasF: false, hasE: false };

  function scanFrontLine() {
    frontLine.hasF = false; frontLine.hasE = false;
    frontLine.friendly = fortPlayerX;
    frontLine.enemy = fortEnemyX;

    var st = AOW.Core && AOW.Core.state;
    if (!st) { return; }

    // Fort positions, if Core publishes them.
    if (st.forts) {
      if (typeof st.forts.playerX === 'number') { fortPlayerX = st.forts.playerX; }
      if (typeof st.forts.enemyX === 'number') { fortEnemyX = st.forts.enemyX; }
      frontLine.friendly = fortPlayerX;
      frontLine.enemy = fortEnemyX;
    }

    var units = st.units;
    if (!units) { return; }

    var i, u, n;
    if (Array.isArray(units)) {
      for (i = 0, n = units.length; i < n; i++) {
        u = units[i];
        if (!u || u.dead) { continue; }
        if (u.team === 1) {
          if (!frontLine.hasF || u.x > frontLine.friendly) { frontLine.friendly = u.x; frontLine.hasF = true; }
        } else if (u.team === -1) {
          if (!frontLine.hasE || u.x < frontLine.enemy) { frontLine.enemy = u.x; frontLine.hasE = true; }
        }
      }
    } else if (Array.isArray(units.list)) {
      var L = units.list;
      for (i = 0, n = L.length; i < n; i++) {
        u = L[i];
        if (!u || u.dead) { continue; }
        if (u.team === 1) {
          if (!frontLine.hasF || u.x > frontLine.friendly) { frontLine.friendly = u.x; frontLine.hasF = true; }
        } else if (u.team === -1) {
          if (!frontLine.hasE || u.x < frontLine.enemy) { frontLine.enemy = u.x; frontLine.hasE = true; }
        }
      }
    } else if (typeof units.forEach === 'function') {
      // Map / Set — forEach allocates nothing, so this is still hot-loop safe.
      units.forEach(function (uu) {
        if (!uu || uu.dead) { return; }
        if (uu.team === 1) {
          if (!frontLine.hasF || uu.x > frontLine.friendly) { frontLine.friendly = uu.x; frontLine.hasF = true; }
        } else if (uu.team === -1) {
          if (!frontLine.hasE || uu.x < frontLine.enemy) { frontLine.enemy = uu.x; frontLine.hasE = true; }
        }
      });
    }
  }

  function updateAutoFollow(dt) {
    if (!rig.autoFollow) { return; }
    scanFrontLine();

    var mid, span;

    if (frontLine.hasF && frontLine.hasE) {
      // Both armies on the field: frame the contested gap between the fronts.
      var f = frontLine.friendly;
      var e = frontLine.enemy;
      if (e < f) { var tmp = f; f = e; e = tmp; }   // lines crossed (a raid got through)
      mid = (f + e) * 0.5;
      span = clamp(e - f, rig.spanMin, rig.spanMax);
    } else if (frontLine.hasF) {
      // Only our troops are out — lead them slightly so the player sees where
      // they're marching, not the empty ground they already took.
      mid = frontLine.friendly + 14;
      span = rig.spanMin;
    } else if (frontLine.hasE) {
      mid = frontLine.enemy - 14;
      span = rig.spanMin;
    } else {
      // Nothing alive on either side. Holding position beats snapping to the
      // midpoint of the map and showing the player 400m of empty dirt.
      return;
    }

    // --- horizontal dead zone: only re-aim once the action leaves the box.
    // Without it, one unit dying at the edge would twitch the whole frame.
    var dx = mid - rig.focusTargetX;
    if (dx > rig.deadZone) { rig.focusTargetX = mid - rig.deadZone; }
    else if (dx < -rig.deadZone) { rig.focusTargetX = mid + rig.deadZone; }

    // --- zoom to frame the span (with its own dead zone against hunting).
    var wanted = (span * 0.5 + rig.spanMargin) / Math.max(0.05, rig.hFovHalfTan);
    wanted = clamp(wanted, rig.distMin, rig.distMax);
    if (Math.abs(wanted - rig.distTarget) / Math.max(1, rig.distTarget) > rig.zoomDeadZone) {
      rig.distTarget = wanted;
    }
  }

  function updateCamera(dt) {
    if (!camera) { return; }

    // horizontal half-FOV tangent — needed by auto-follow AND shadow fitting
    var vHalf = THREE.MathUtils.degToRad(camera.fov) * 0.5;
    rig.hFovHalfTan = Math.tan(vHalf) * camera.aspect;

    updateAutoFollow(dt);

    // --- clamp focus so we never frame the void past the map ends -----------
    var halfVisible = rig.distTarget * rig.hFovHalfTan;
    var minF = Math.min(AOW.W * 0.5, halfVisible * 0.55);
    var maxF = Math.max(AOW.W * 0.5, AOW.W - halfVisible * 0.55);
    rig.focusTargetX = clamp(rig.focusTargetX, minF, maxF);

    // --- damp everything ----------------------------------------------------
    rig.focusX = damp(rig.focusX, rig.focusTargetX, rig.focusLambda, dt);
    rig.yaw = damp(rig.yaw, clamp(rig.yawTarget, rig.yawMin, rig.yawMax), rig.orbitLambda, dt);
    rig.pitch = damp(rig.pitch, clamp(rig.pitchTarget, rig.pitchMin, rig.pitchMax), rig.orbitLambda, dt);
    rig.dist = damp(rig.dist, clamp(rig.distTarget, rig.distMin, rig.distMax), rig.dollyLambda, dt);

    // --- idle drift ---------------------------------------------------------
    // Sub-degree, multi-period sway. The player never consciously sees it, but
    // a perfectly static camera is the #1 tell of a cheap 3D game.
    rig.idleT += dt;
    var it = rig.idleT, ia = rig.idleAmp;
    var idleYaw = (Math.sin(it * 0.17) * 0.013 + Math.sin(it * 0.091 + 1.3) * 0.008) * ia;
    var idlePitch = (Math.sin(it * 0.131 + 1.7) * 0.0065) * ia;
    var idleDist = (Math.sin(it * 0.073 + 0.5) * 0.9) * ia;
    var idleX = (Math.sin(it * 0.11 + 2.2) * 0.55) * ia;

    var yaw = rig.yaw + idleYaw;
    var pitch = clamp(rig.pitch + idlePitch, 0.02, 1.35);
    var dist = Math.max(6, rig.dist + idleDist);

    // --- place the rig ------------------------------------------------------
    // yaw 0 puts the camera at -z looking toward +z: the contract's side-on view.
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    _v3a.set(rig.focusX + idleX, rig.lookHeight, 0);              // look-at target
    _v3b.set(sy * cp, sp, -cy * cp);                              // unit offset dir
    camera.position.copy(_v3a).addScaledVector(_v3b, dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(_v3a);

    // --- trauma shake -------------------------------------------------------
    // Trauma decays linearly; the applied shake is trauma², so small hits are
    // nearly invisible and big ones are violent. That non-linearity is what
    // makes a boss slam feel different from a sword hit instead of everything
    // being one generic rumble.
    if (rig.trauma > 0.0005) {
      rig.shakeT += dt;
      var s = rig.trauma * rig.trauma;
      var st = rig.shakeT * 14.0;
      camera.translateX(noise1(st * 0.97, 1) * s * rig.shakePos);
      camera.translateY(noise1(st * 1.11, 2) * s * rig.shakePos * 0.85);
      camera.translateZ(noise1(st * 0.83, 3) * s * rig.shakePos * 0.45);
      camera.rotateZ(noise1(st * 1.23, 4) * s * rig.shakeRot);
      camera.rotateX(noise1(st * 1.07, 5) * s * rig.shakeRot * 0.55);
      camera.rotateY(noise1(st * 0.91, 6) * s * rig.shakeRot * 0.55);
      rig.trauma = Math.max(0, rig.trauma - rig.traumaDecay * dt);
      rig.traumaBudget = Math.max(0, rig.traumaBudget - dt * 1.9);
    } else if (rig.trauma !== 0) {
      rig.trauma = 0;
    }

    camera.updateMatrixWorld();
  }

  /* ==========================================================================
   * 15. FRAME LOOP
   * ======================================================================== */

  var stats = {
    lastFrameMs: 0, fps: 0, drawCalls: 0, triangles: 0,
    points: 0, lines: 0, programs: 0, geometries: 0, textures: 0
  };
  var fpsAccum = 0, fpsFrames = 0;

  function coreRenderHook(a, b) {
    // Core may hand us dt in seconds, dt in ms, or nothing at all. Trust it only
    // if it looks like a sane per-frame delta; otherwise measure it ourselves.
    var dt = null;
    if (typeof a === 'number' && isFinite(a)) {
      if (a > 0 && a <= 0.25) { dt = a; }
      else if (a > 0.25 && a <= 250) { dt = a / 1000; }
    }
    if (dt === null && typeof b === 'number' && isFinite(b) && b > 0 && b <= 0.25) { dt = b; }
    frame(dt);
  }

  function startOwnLoop() {
    if (ownLoopId) { return; }
    var tick = function () {
      ownLoopId = global.requestAnimationFrame(tick);
      frame(null);
    };
    ownLoopId = global.requestAnimationFrame(tick);
  }

  function stopOwnLoop() {
    if (ownLoopId) { global.cancelAnimationFrame(ownLoopId); ownLoopId = 0; }
  }

  function frame(dtIn) {
    if (!inited || failed || disposed || !renderer) { return; }

    var now = (global.performance && performance.now) ? performance.now() : Date.now();
    var dt = dtIn;
    if (dt === null || dt === undefined) {
      dt = (now - lastTime) / 1000;
    }
    lastTime = now;
    // Clamp: a tab that was backgrounded for 30s must not teleport the camera or
    // spike the shake integrator.
    if (!isFinite(dt) || dt <= 0) { dt = 1 / 60; }
    if (dt > 0.1) { dt = 0.1; }
    elapsed += dt;

    if (paused) { return; }

    try {
      updateMood(dt);
      updateCamera(dt);
      updateShadowFrustum();

      if (gradePass) {
        gradePass.material.uniforms.time.value = elapsed;
      }

      renderer.info.reset();

      if (perf.post && composer) {
        composer.render(dt);
      } else {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      }

      // --- perf HUD hook ----------------------------------------------------
      var info = renderer.info;
      stats.drawCalls = info.render.calls;
      stats.triangles = info.render.triangles;
      stats.points = info.render.points;
      stats.lines = info.render.lines;
      stats.programs = info.programs ? info.programs.length : 0;
      stats.geometries = info.memory.geometries;
      stats.textures = info.memory.textures;

      var end = (global.performance && performance.now) ? performance.now() : Date.now();
      stats.lastFrameMs = end - now;

      fpsAccum += dt; fpsFrames++;
      if (fpsAccum >= 0.4) {
        stats.fps = fpsFrames / fpsAccum;
        fpsAccum = 0; fpsFrames = 0;
      }

    } catch (err) {
      // A bad mesh from another module must not permanently kill rendering.
      if (!frame._warned) {
        frame._warned = true;
        console.warn('[AOW.Render] render error (further identical errors suppressed):', err);
      }
    }
  }

  /* ==========================================================================
   * 16. RESIZE / VISIBILITY / CONTEXT
   * ======================================================================== */

  var dprMedia = null;

  function resize() {
    if (!renderer || !camera) { return; }
    try {
      viewportSize(_size);
      var w = _size.x, h = _size.y;

      var dprCap = QUALITY[perf.tier].dprCap;
      var dpr = Math.min(dprCap, global.devicePixelRatio || 1);
      if (Math.abs(dpr - perf.dpr) > 0.01) {
        perf.dpr = dpr;
        renderer.setPixelRatio(dpr);
        if (composer) { composer.setPixelRatio(dpr); }
      }

      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      if (composer) {
        composer.setSize(w, h);
        if (aaPass && perf.aa === 'fxaa' && aaPass.material && aaPass.material.uniforms.resolution) {
          aaPass.material.uniforms.resolution.value.set(1 / (w * perf.dpr), 1 / (h * perf.dpr));
        }
        // NOTE: composer.setSize() already forwarded the new size to every pass,
        // including bloom — calling bloomPass.setSize() again would reallocate
        // its six mip render targets a second time on every single resize.
        if (gradePass) {
          gradePass.material.uniforms.resolution.value.set(w * perf.dpr, h * perf.dpr);
          gradePass.material.uniforms.aspect.value = w / h;
        }
      }

      // Vertical framing changes the horizontal FOV, so the shadow band must refit.
      shadowState.quantRadius = 0;

      watchDpr();
      busEmit('render:resize', { width: w, height: h, dpr: perf.dpr });
    } catch (e) {
      console.warn('[AOW.Render] resize failed', e);
    }
  }

  /**
   * devicePixelRatio changes when the window moves between a retina and a
   * non-retina display, or when the user zooms the browser. There is no resize
   * event for that on its own, so we re-arm a resolution media query each time.
   */
  function watchDpr() {
    try {
      if (!global.matchMedia) { return; }
      if (dprMedia && dprMedia.removeEventListener) { dprMedia.removeEventListener('change', onDprChange); }
      else if (dprMedia && dprMedia.removeListener) { dprMedia.removeListener(onDprChange); }
      var d = global.devicePixelRatio || 1;
      dprMedia = global.matchMedia('(resolution: ' + d + 'dppx)');
      if (dprMedia.addEventListener) { dprMedia.addEventListener('change', onDprChange); }
      else if (dprMedia.addListener) { dprMedia.addListener(onDprChange); }
    } catch (e) { /* not supported — the resize handler still covers most cases */ }
  }

  function onDprChange() { resize(); }

  function onVisibility() {
    var hidden = !!document.hidden;
    paused = hidden;
    if (!hidden) {
      // Reset the clock so the first visible frame doesn't get a huge dt.
      lastTime = (global.performance && performance.now) ? performance.now() : Date.now();
      resize();
    }
  }

  function onContextLost(ev) {
    ev.preventDefault();
    paused = true;
    console.warn('[AOW.Render] WebGL context lost — rendering paused.');
    busEmit('render:contextlost', {});
  }

  function onContextRestored() {
    console.warn('[AOW.Render] WebGL context restored.');
    try {
      shadowState.quantRadius = 0;
      if (keyLight && keyLight.shadow && keyLight.shadow.map) {
        keyLight.shadow.map.dispose();
        keyLight.shadow.map = null;
      }
      resize();
      _applyHorizon();
    } catch (e) { /* ignore */ }
    paused = !!document.hidden;
    busEmit('render:contextrestored', {});
  }

  function wireEvents() {
    global.addEventListener('resize', resize, false);
    global.addEventListener('orientationchange', function () { setTimeout(resize, 120); }, false);
    document.addEventListener('visibilitychange', onVisibility, false);

    // ---- game events -------------------------------------------------------
    busOn('camera:shake', function (p) {
      var amt = (p && (typeof p === 'number' ? p : p.amount)) || 0.25;
      addTrauma(amt);
    });
    busOn('fort:destroyed', function () { addTrauma(0.85); });
    busOn('fort:hit', function (p) {
      var d = (p && p.dmg) || 0;
      addTrauma(clamp(0.06 + d * 0.002, 0.06, 0.35));
    });
    busOn('boss:spawn', function () { addTrauma(0.6); });
    busOn('boss:phase', function () { addTrauma(0.45); });
    busOn('power:cast', function (p) {
      addTrauma(0.35);
      if (p && typeof p.x === 'number') { focusOn(p.x, false); }
    });
    busOn('era:evolve', function (p) {
      if (!p) { return; }
      setEraMood(p.era !== undefined ? p.era : p.index, false);
      var m = ERA_MOODS[resolveEra(p.era !== undefined ? p.era : p.index)];
      if (m && typeof m.todBias === 'number') { applyTimeOfDay(m.todBias, false); }
      addTrauma(0.5);
    });
    busOn('game:over', function (p) {
      var res = p && (p.result || p.outcome);
      var lost = (res === 'defeat' || res === 'lose' || res === 'lost' || res === false);
      setDefeat(lost ? 1 : 0);
      rig.autoFollow = false;
    });
    busOn('game:restart', function () { setDefeat(0); rig.autoFollow = true; });
    busOn('wave:start', function () { setDefeat(0); });
    // Env owns the sky dome; if it publishes a horizon colour we adopt it so the
    // fog seam matches its gradient exactly rather than approximately.
    busOn('env:horizon', function (p) {
      if (!p) { return; }
      var hex = (typeof p === 'number') ? p : p.color;
      if (typeof hex !== 'number') { return; }
      sky.horizon.setHex(hex);
      _applyHorizon();
    });
  }

  /* ==========================================================================
   * 17. PUBLIC HELPERS
   * ======================================================================== */

  function addObject(obj, groupName) {
    if (!obj) { return obj; }
    try {
      var g = (groupName && groups[groupName]) ? groups[groupName] : groups.world;
      if (!g) { if (scene) { scene.add(obj); } return obj; }
      g.add(obj);
    } catch (e) { console.warn('[AOW.Render] addObject failed', e); }
    return obj;
  }

  function removeObject(obj) {
    if (!obj) { return; }
    try { if (obj.parent) { obj.parent.remove(obj); } } catch (e) { /* ignore */ }
  }

  function disposeObject(obj, keepTextures) {
    if (!obj) { return; }
    try {
      removeObject(obj);
      obj.traverse(function (o) {
        if (o.geometry && o.geometry.dispose) { o.geometry.dispose(); }
        var m = o.material;
        if (!m) { return; }
        var mats = Array.isArray(m) ? m : [m];
        for (var i = 0; i < mats.length; i++) {
          var mm = mats[i];
          if (!mm) { continue; }
          if (!keepTextures) {
            for (var k in mm) {
              var v = mm[k];
              if (v && v.isTexture && !texCache.has(v.uuid)) {
                // Never dispose a shared cached texture out from under someone.
                var shared = false;
                texCache.forEach(function (t) { if (t === v) { shared = true; } });
                if (!shared && v.dispose) { v.dispose(); }
              }
            }
          }
          if (mm.dispose) { mm.dispose(); }
        }
      });
    } catch (e) { console.warn('[AOW.Render] disposeObject failed', e); }
  }

  /**
   * Procedural texture factory — THE way every other module makes a texture.
   * No external assets exist in this project, so this is the only source.
   *
   *   AOW.Render.makeCanvasTexture(256, 256, function (ctx, w, h) { ... }, { key: 'rock' })
   *
   * opts: key (cache id), repeat [x,y], wrap, linear (data map, skip sRGB),
   *       mipmaps (default true), anisotropy (default 8), flipY.
   */
  function makeCanvasTexture(w, h, drawFn, opts) {
    opts = opts || {};
    var key = opts.key;
    if (key && texCache.has(key)) { return texCache.get(key); }
    try {
      w = Math.max(1, w | 0); h = Math.max(1, h | 0);
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d');
      if (!ctx) { throw new Error('2D context unavailable'); }
      if (typeof drawFn === 'function') { drawFn(ctx, w, h, cv); }

      var tex = new THREE.CanvasTexture(cv);

      var wantRepeat = (opts.wrap === undefined) ? true : (opts.wrap === THREE.RepeatWrapping ||
        opts.wrap === THREE.MirroredRepeatWrapping);
      var pot = isPow2(w) && isPow2(h);
      var webgl2 = false;
      try { webgl2 = !!(renderer && renderer.capabilities.isWebGL2); } catch (e) { webgl2 = false; }

      // WebGL1 cannot repeat-wrap or mipmap non-power-of-two textures. Silently
      // producing a black texture is the classic mystery bug, so we degrade loudly.
      if (!pot && !webgl2 && wantRepeat) {
        console.warn('[AOW.Render] makeCanvasTexture: non-power-of-two (' + w + 'x' + h +
          ') on WebGL1 — clamping and disabling mipmaps' + (key ? ' for "' + key + '"' : '') + '.');
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
      } else {
        var wrap = opts.wrap || THREE.RepeatWrapping;
        tex.wrapS = opts.wrapS || wrap;
        tex.wrapT = opts.wrapT || wrap;
        tex.generateMipmaps = (opts.mipmaps !== false) && (pot || webgl2);
        tex.minFilter = tex.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      }
      tex.magFilter = opts.magFilter || THREE.LinearFilter;

      // Colour maps must declare sRGB; normal/roughness/AO/alpha maps must not,
      // or three double-applies the curve and everything goes washed out.
      tex.encoding = opts.linear ? THREE.LinearEncoding : THREE.sRGBEncoding;

      if (opts.repeat) {
        tex.repeat.set(opts.repeat[0] || 1, opts.repeat[1] || opts.repeat[0] || 1);
      }
      if (opts.offset) { tex.offset.set(opts.offset[0] || 0, opts.offset[1] || 0); }
      if (opts.flipY !== undefined) { tex.flipY = !!opts.flipY; }

      var aniso = (opts.anisotropy === undefined) ? 8 : opts.anisotropy;
      tex.anisotropy = Math.max(1, Math.min(maxAnisotropy, aniso));
      tex.needsUpdate = true;
      if (key) { tex.name = key; texCache.set(key, tex); }
      return tex;
    } catch (err) {
      console.warn('[AOW.Render] makeCanvasTexture failed' + (key ? ' for "' + key + '"' : ''), err);
      return null;
    }
  }

  function getTexture(key) { return texCache.get(key) || null; }
  function putTexture(key, tex) { if (key && tex) { texCache.set(key, tex); } return tex; }

  function clearTextureCache() {
    texCache.forEach(function (t) { try { if (t && t.dispose) { t.dispose(); } } catch (e) { /* ignore */ } });
    texCache.clear();
  }

  /** World position → CSS pixel coords for HUD overlays (damage numbers, etc). */
  function worldToScreen(v3, out) {
    out = out || _screenOut;
    if (!camera || !v3) { out.x = 0; out.y = 0; out.z = 2; out.visible = false; return out; }
    _v3c.set(v3.x, v3.y, v3.z).project(camera);
    viewportSize(_size);
    out.x = (_v3c.x * 0.5 + 0.5) * _size.x;
    out.y = (-_v3c.y * 0.5 + 0.5) * _size.y;
    out.z = _v3c.z;
    // z > 1 means behind the near plane / off the back of the frustum.
    out.visible = (_v3c.z <= 1 && _v3c.x >= -1.15 && _v3c.x <= 1.15 && _v3c.y >= -1.15 && _v3c.y <= 1.15);
    return out;
  }

  /** CSS pixel coords → the point on the ground plane (y = groundY). */
  function screenToGround(clientX, clientY, out, groundY) {
    if (!camera || !canvas) { return null; }
    try {
      var rect = canvas.getBoundingClientRect();
      var w = rect.width || 1, h = rect.height || 1;
      _ndc.x = ((clientX - rect.left) / w) * 2 - 1;
      _ndc.y = -((clientY - rect.top) / h) * 2 + 1;
      _raycaster.setFromCamera(_ndc, camera);
      _groundPlane.constant = -(groundY || 0);
      out = out || new THREE.Vector3();
      var hit = _raycaster.ray.intersectPlane(_groundPlane, out);
      return hit ? out : null;
    } catch (e) { return null; }
  }

  /* ==========================================================================
   * 18. CAMERA PUBLIC API
   * ======================================================================== */

  function focusOn(x, immediate) {
    if (typeof x !== 'number' || !isFinite(x)) { return; }
    rig.focusTargetX = x;
    if (immediate) { rig.focusX = x; }
  }

  function setAutoFollow(on) { rig.autoFollow = !!on; }

  function setCamera(p) {
    if (!p) { return; }
    if (typeof p.yaw === 'number') { rig.yawTarget = clamp(p.yaw, rig.yawMin, rig.yawMax); }
    if (typeof p.pitch === 'number') { rig.pitchTarget = clamp(p.pitch, rig.pitchMin, rig.pitchMax); }
    if (typeof p.dist === 'number') { rig.distTarget = clamp(p.dist, rig.distMin, rig.distMax); }
    if (typeof p.lookHeight === 'number') { rig.lookHeight = p.lookHeight; }
    if (typeof p.fov === 'number' && camera) {
      camera.fov = clamp(p.fov, 14, 70);
      camera.updateProjectionMatrix();
      shadowState.quantRadius = 0;
    }
    if (typeof p.idle === 'number') { rig.idleAmp = clamp(p.idle, 0, 3); }
    if (typeof p.deadZone === 'number') { rig.deadZone = Math.max(0, p.deadZone); }
    if (p.immediate) {
      rig.yaw = rig.yawTarget; rig.pitch = rig.pitchTarget; rig.dist = rig.distTarget;
    }
  }

  function orbit(dYaw, dPitch) {
    rig.yawTarget = clamp(rig.yawTarget + (dYaw || 0), rig.yawMin, rig.yawMax);
    rig.pitchTarget = clamp(rig.pitchTarget + (dPitch || 0), rig.pitchMin, rig.pitchMax);
  }

  function dolly(delta) {
    // Multiplicative so a pinch feels the same whether you're zoomed in or out.
    rig.distTarget = clamp(rig.distTarget * (1 + (delta || 0)), rig.distMin, rig.distMax);
  }

  function panBy(dx) {
    rig.autoFollow = false;
    rig.focusTargetX += (dx || 0);
  }

  /** Trauma-based shake. amount ∈ [0,1]; trauma accumulates but saturates. */
  function addTrauma(amount) {
    var a = (typeof amount === 'number' && isFinite(amount)) ? amount : 0.25;
    // Callers sometimes pass "pixels" or big numbers; normalise generously.
    if (a > 1) { a = clamp(a / 20, 0, 1); }
    a *= rig.shakeScale;
    if (a <= 0) { return; }
    // Rate-limit: a 200-unit melee fires dozens of shake events per second and
    // used to hold trauma at 1.0 permanently. Each event now contributes less
    // as the recent budget fills, so a single big impact still reads clearly
    // while sustained combat stays watchable.
    var damp = 1 / (1 + rig.traumaBudget * 3.2);
    rig.traumaBudget = Math.min(3, rig.traumaBudget + a);
    rig.trauma = clamp(rig.trauma + a * damp, 0, 0.85);
  }

  /* ==========================================================================
   * 19. QUALITY / POST TOGGLES
   * ======================================================================== */

  function setPostEnabled(on) {
    on = !!on;
    if (on && perf.tier === 'low') {
      // The spec is explicit: post is off on low. Allow a forced override only
      // through setQuality(), never by accident.
      console.warn('[AOW.Render] post-processing requested on low tier — ignored.');
      return;
    }
    if (on === perf.post && (!on || composer)) { return; }
    perf.post = on;
    if (on) {
      if (!composer) { buildComposer(QUALITY[perf.tier]); }
    } else {
      destroyComposer();
    }
    R.composer = composer;
    _applyHorizon();     // the clear-colour transform differs between the two paths
    busEmit('render:quality', { tier: perf.tier, post: perf.post, aa: perf.aa });
  }

  function setQuality(tier, opts) {
    if (!QUALITY[tier]) { console.warn('[AOW.Render] unknown quality tier "' + tier + '"'); return; }
    if (!renderer) { perf.tier = tier; return; }
    opts = opts || {};
    perf.tier = tier;
    perf.autoTier = false;
    var q = QUALITY[tier];

    // pixel ratio
    perf.dpr = Math.min(q.dprCap, global.devicePixelRatio || 1);
    renderer.setPixelRatio(perf.dpr);

    // shadows
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = (q.shadowType === 'pcfsoft') ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (keyLight) {
      keyLight.castShadow = q.shadows;
      if (keyLight.shadow.mapSize.width !== q.shadowMap) {
        keyLight.shadow.mapSize.set(q.shadowMap, q.shadowMap);
        // The GPU-side map must be released or the new size is ignored.
        if (keyLight.shadow.map) { keyLight.shadow.map.dispose(); keyLight.shadow.map = null; }
        shadowState.mapSize = q.shadowMap;
      }
      keyLight.shadow.radius = q.shadowRadius;
    }
    shadowState.quantRadius = 0;

    // fill light
    if (q.fillLight && !fillLight && scene) {
      fillLight = new THREE.DirectionalLight(0x9fbadd, sky.fillIntensity);
      scene.add(fillLight); scene.add(fillLight.target);
      R.lights.fill = fillLight;
    } else if (!q.fillLight && fillLight && scene) {
      scene.remove(fillLight); scene.remove(fillLight.target);
      fillLight = null; R.lights.fill = null;
    }

    // post
    destroyComposer();
    perf.aa = q.aa;
    perf.post = (opts.post !== undefined) ? !!opts.post : q.post;
    if (perf.post) { buildComposer(q); }
    R.composer = composer;

    applyTimeOfDay(sky.t, true);
    resize();
    busEmit('render:quality', { tier: perf.tier, post: perf.post, aa: perf.aa, dpr: perf.dpr });
    console.info('[AOW.Render] quality → ' + tier + ' (post=' + perf.post + ', dpr=' + perf.dpr.toFixed(2) + ')');
  }

  function setDefeat(v) {
    defeat.target = clamp01(typeof v === 'number' ? v : (v ? 1 : 0));
    if (!gradePass) {
      // No post → approximate the mood shift with exposure so defeat still reads.
      if (renderer) { renderer.toneMappingExposure = (sky.exposure + mood.exposureTrim) * lerp(1, 0.8, defeat.target); }
    }
  }

  function setExposure(x) {
    if (!renderer || typeof x !== 'number') { return; }
    sky.exposure = clamp(x, 0.2, 4);
    renderer.toneMappingExposure = sky.exposure + mood.exposureTrim;
    _applyHorizon();
  }

  function setHorizonColor(hex) {
    if (typeof hex !== 'number') { return; }
    sky.horizon.copy(makeColor(hex));
    _applyHorizon();
  }

  function setFogDensity(d) {
    if (typeof d !== 'number') { return; }
    sky.fogDensity = clamp(d, 0, 0.05);
    _applyHorizon();
  }

  /* ==========================================================================
   * 20. DISPOSE
   * ======================================================================== */

  function dispose() {
    if (disposed) { return; }
    disposed = true;
    try {
      stopOwnLoop();
      global.removeEventListener('resize', resize, false);
      document.removeEventListener('visibilitychange', onVisibility, false);
      if (canvas) {
        canvas.removeEventListener('webglcontextlost', onContextLost, false);
        canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
      }
      destroyComposer();
      clearTextureCache();
      if (scene) {
        scene.traverse(function (o) {
          if (o.geometry && o.geometry.dispose) { o.geometry.dispose(); }
          if (o.material) {
            var mats = Array.isArray(o.material) ? o.material : [o.material];
            for (var i = 0; i < mats.length; i++) { if (mats[i] && mats[i].dispose) { mats[i].dispose(); } }
          }
        });
      }
      if (renderer) { renderer.dispose(); }
    } catch (e) { console.warn('[AOW.Render] dispose issue', e); }
    inited = false;
    R.ready = false;
  }

  /* ==========================================================================
   * 21. PUBLIC API
   * ======================================================================== */

  R.version = '1.0.0';
  R.ready = false;
  R.failed = false;

  // live handles (populated by init)
  R.scene = null; R.camera = null; R.renderer = null; R.composer = null; R.canvas = null;
  R.lights = {}; R.groups = {};
  R.perf = perf;
  R.stats = stats;
  R.rig = rig;
  R.sky = sky;
  R.mood = mood;
  R.textures = texCache;
  R.maxAnisotropy = 1;

  R.init = init;
  R.dispose = dispose;
  R.render = frame;
  R.resize = resize;

  R.color = makeColor;                       // sRGB hex → linear THREE.Color
  R.addObject = addObject;
  R.removeObject = removeObject;
  R.disposeObject = disposeObject;
  R.makeCanvasTexture = makeCanvasTexture;
  R.getTexture = getTexture;
  R.putTexture = putTexture;
  R.clearTextureCache = clearTextureCache;

  R.worldToScreen = worldToScreen;
  R.screenToGround = screenToGround;

  R.focusOn = focusOn;
  R.getFocusX = function () { return rig.focusX; };
  R.setAutoFollow = setAutoFollow;
  R.isAutoFollow = function () { return rig.autoFollow; };
  R.setCamera = setCamera;
  R.orbit = orbit;
  R.dolly = dolly;
  R.panBy = panBy;
  R.shake = addTrauma;
  R.addTrauma = addTrauma;
  R.getTrauma = function () { return rig.trauma; };

  R.setTimeOfDay = function (t, immediate) {
    if (typeof t !== 'number' || !isFinite(t)) { return; }
    applyTimeOfDay(t, immediate !== false);
  };
  R.getTimeOfDay = function () { return sky.t; };
  R.setEraMood = setEraMood;
  R.getEraMood = function () { return mood.name; };

  R.setPostEnabled = setPostEnabled;
  R.isPostEnabled = function () { return perf.post && !!composer; };
  R.setQuality = setQuality;
  R.getQuality = function () { return perf.tier; };
  R.setDefeat = setDefeat;
  R.setExposure = setExposure;
  R.setHorizonColor = setHorizonColor;
  R.setFogDensity = setFogDensity;
  R.getHorizonColor = function () { return srgbHexOf(sky.horizon); };   // sRGB hex, symmetric with setHorizonColor()

  /** Perf HUD payload — one object, reused, safe to poll every frame. */
  R.getStats = function () { return stats; };

  AOW.Render = R;

  /* ==========================================================================
   * 22. AUTO-INIT SAFETY NET
   * --------------------------------------------------------------------------
   * The integrator owns index.html and normally calls AOW.Render.init(). If for
   * any reason nothing calls us by the time the page has fully loaded, we bring
   * ourselves up so the game still has a scene. init() is idempotent, so an
   * explicit call always wins the race.
   * ======================================================================== */
  function autoInit() {
    if (inited || failed) { return; }
    setTimeout(function () {
      if (inited || failed) { return; }
      console.info('[AOW.Render] no explicit init() — self-initialising.');
      init({});
    }, 0);
  }

  if (document.readyState === 'complete') { autoInit(); }
  else { global.addEventListener('load', autoInit, { once: true }); }

})(typeof window !== 'undefined' ? window : this);
