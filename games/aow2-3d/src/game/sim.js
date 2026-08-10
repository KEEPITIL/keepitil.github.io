/* =============================================================================
 * AOW2-3D  —  src/game/sim.js  —  global: AOW.Sim
 * -----------------------------------------------------------------------------
 * The gameplay brain: roster, counters, formations, stances, combat, physics,
 * projectiles, wave director, bosses, comeback levers, self-test.
 *
 * Depends ONLY on AOW.Core (event bus / rng / loop / state). Never touches the
 * renderer, never allocates in hot loops, never uses Math.random.
 * ========================================================================== */
(function (global) {
  'use strict';

  var AOW = global.AOW || (global.AOW = {});

  if (AOW.Sim && AOW.Sim.__isAowSim) {
    try { console.warn('[AOW.Sim] already initialised — ignoring duplicate include.'); } catch (e) {}
    return;
  }

  var C = AOW.Core;

  /* ---------------------------------------------------------------------------
   * 0. Hard dependency guard — degrade to a stub rather than crash the page.
   * ------------------------------------------------------------------------ */
  if (!C || !C.__isAowCore) {
    try { console.warn('[AOW.Sim] AOW.Core is missing — Sim runs in stub mode (no simulation).'); } catch (e) {}
    AOW.Sim = {
      __isAowSim: true,
      version: '1.0.0',
      ready: false,
      failed: true,
      init: function () { return false; },
      start: function () {}, stop: function () {}, reset: function () {},
      spawn: function () { return null; },
      requestSpawn: function () { return false; },
      setStance: function () {}, charge: function () {}, setFormation: function () {},
      castPower: function () { return false; },
      selfTest: function () {
        return { balanceOk: false, notes: ['AOW.Core unavailable — balance tables were never built.'] };
      }
    };
    return;
  }

  var W        = AOW.W || 420;
  var LANE_MIN = AOW.LANE_MIN !== undefined ? AOW.LANE_MIN : -16;
  var LANE_MAX = AOW.LANE_MAX !== undefined ? AOW.LANE_MAX : 16;
  var EDGE_PAD = AOW.EDGE_PAD || 6;
  var FORT_X   = AOW.FORT_X  || { 1: 20, '-1': 400 };
  var SPAWN_X  = AOW.SPAWN_X || { 1: 34, '-1': 386 };
  var ERAS     = AOW.ERAS || ['Stone'];
  var TEAMS    = [1, -1];

  function warn(k, m, e) { C.warnOnce ? C.warnOnce('sim:' + k, m, e) : null; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  var state = C.state;

  /* =========================================================================
   * 1. DAMAGE MODEL
   * -------------------------------------------------------------------------
   *  three damage types, each with a different relationship to armour and to
   *  shields. This is what makes "armour vs pierce vs blunt" a real decision
   *  rather than a label.
   *
   *   slash : the honest baseline. Full armour mitigation, fully blocked by a
   *           raised shield. Great into unarmoured targets, awful into plate.
   *   pierce: armour-piercing. Only 45% of armour counts, but a shield still
   *           eats a good share of it — spears go through mail, not through a
   *           tower shield.
   *   blunt : goes around shields (they only stop 30% of it) and gains a bonus
   *           against heavy armour, but wastes most of its force on light,
   *           fast targets.
   * ====================================================================== */
  var DMG_SLASH = 'slash', DMG_PIERCE = 'pierce', DMG_BLUNT = 'blunt';

  /* armourFactor: how much of the target's armour rating applies. */
  var ARMOR_FACTOR  = { slash: 1.00, pierce: 0.45, blunt: 0.80 };
  /* shieldFactor: how much of a frontal shield's blocking applies. */
  var SHIELD_FACTOR = { slash: 1.00, pierce: 0.72, blunt: 0.30 };
  /* blunt bonus scales in once the target is genuinely armoured. */
  var BLUNT_HEAVY_AT = 0.45;     // armour ratio at which blunt starts to shine
  var BLUNT_HEAVY_MAX = 0.30;    // +30% at full plate

  var BASE_ARMOR_K = 30;         // mitigation = A/(A+K)
  var ERA_K = 1.28;              // per-era stat multiplier (hp, dmg, armour, K)

  /** Era-scaled armour constant. Keeps mitigation ratios era-invariant. */
  function armorK(era) {
    return BASE_ARMOR_K * Math.pow(ERA_K, era > 0 ? era : 0);
  }

  /* Fraction of a hit a raised shield absorbs before armour is considered. */
  var SHIELD_ABSORB = 0.55;

  /* =========================================================================
   * 2. THE COUNTER TRIANGLE
   * -------------------------------------------------------------------------
   *  defender > assault > ranged > defender, with specialists as the soft
   *  underbelly of any army and champions punished by massed cheap troops.
   *  These multipliers are the *only* place class identity is hard-coded; the
   *  self-test proves every unit has at least one answer.
   * ====================================================================== */
  var BONUS = {
    defender:   { assault: 1.45, champion: 1.16, specialist: 1.10, ranged: 0.90 },
    assault:    { ranged: 1.72, specialist: 1.58, defender: 0.70, champion: 0.90 },
    ranged:     { defender: 1.58, champion: 1.24, assault: 0.72, boss: 1.10 },
    specialist: { boss: 1.35, defender: 1.10, champion: 1.10 },
    champion:   { defender: 1.18, specialist: 1.25, ranged: 1.10, assault: 0.95 },
    boss:       { defender: 0.85, assault: 1.10, ranged: 1.30, specialist: 1.30 }
  };

  function classBonus(srcCls, dstCls) {
    var row = BONUS[srcCls];
    if (!row) { return 1; }
    var v = row[dstCls];
    return (typeof v === 'number') ? v : 1;
  }

  /* =========================================================================
   * 3. ARCHETYPES  (era-0 baseline; every era is derived from these)
   * ====================================================================== */
  var ARCH = [
    {
      key: 'defender', cls: 'defender', tag: 'Shield Wall',
      hp: 240, armor: 15, shield: 100, dmg: 15, dmgType: DMG_BLUNT,
      range: 2.3, wind: 0.34, strike: 0.10, recover: 0.52,
      speed: 2.55, mass: 1.60, radius: 0.62, maxAttackers: 3,
      knockback: 3.2, crit: 0.05, critMult: 1.6, siegeMul: 0.70,
      cost: 55, train: 3.2, rank: 0, valueBias: 1.06,
      supportDps: 0, hold: 1.0,
      blurb: 'Slow, armoured, immovable. Blunts an assault charge and anchors the line.'
    },
    {
      key: 'assault', cls: 'assault', tag: 'Shock',
      hp: 158, armor: 6, shield: 0, dmg: 27, dmgType: DMG_PIERCE,
      range: 2.0, wind: 0.20, strike: 0.08, recover: 0.30,
      speed: 5.10, mass: 1.00, radius: 0.55, maxAttackers: 2,
      knockback: 2.0, crit: 0.14, critMult: 2.0, siegeMul: 1.00,
      cost: 70, train: 2.6, rank: 1, valueBias: 1.06,
      supportDps: 0, hold: 0.5, backstab: 1.65, sprint: 1.35,
      blurb: 'Fast, armour-piercing, fragile. Runs down archers and support — dies on shields.'
    },
    {
      key: 'ranged', cls: 'ranged', tag: 'Skirmisher',
      hp: 100, armor: 3, shield: 0, dmg: 26, dmgType: DMG_SLASH,
      range: 24, minRange: 6, wind: 0.46, strike: 0.06, recover: 0.54,
      speed: 3.30, mass: 0.85, radius: 0.50, maxAttackers: 2,
      knockback: 0.8, crit: 0.10, critMult: 2.2, siegeMul: 0.55,
      cost: 50, train: 2.4, rank: 3, valueBias: 0.86,
      projSpeed: 32, projArc: 1.0, supportDps: 0, hold: 0.35, kite: 0.60,
      blurb: 'Glass. Picks a shield wall apart from 24m — evaporates if anything reaches it.'
    },
    {
      key: 'spec_heal', cls: 'specialist', mode: 'heal', tag: 'Medic',
      hp: 122, armor: 6, shield: 0, dmg: 9, dmgType: DMG_SLASH,
      range: 14, wind: 0.5, strike: 0.06, recover: 0.84,
      speed: 3.00, mass: 0.90, radius: 0.52, maxAttackers: 2,
      knockback: 0.6, crit: 0.04, critMult: 1.5, siegeMul: 0.25,
      cost: 95, train: 4.0, rank: 4, valueBias: 0.95,
      projSpeed: 26, supportDps: 20, hold: 0.4,
      ability: { kind: 'heal', cd: 3.2, radius: 15, targets: 3, amount: 0.13 },
      blurb: 'Keeps the front rank standing. Fold it into a line and the line stops dissolving.'
    },
    {
      key: 'spec_buff', cls: 'specialist', mode: 'buff', tag: 'Warchanter',
      hp: 116, armor: 5, shield: 0, dmg: 11, dmgType: DMG_SLASH,
      range: 13, wind: 0.46, strike: 0.06, recover: 0.78,
      speed: 3.10, mass: 0.90, radius: 0.52, maxAttackers: 2,
      knockback: 0.6, crit: 0.05, critMult: 1.5, siegeMul: 0.25,
      cost: 90, train: 3.8, rank: 4, valueBias: 0.95,
      projSpeed: 26, supportDps: 18, hold: 0.4,
      ability: { kind: 'buff', cd: 1.0, radius: 13, dmgMul: 1.26, speedMul: 1.10, dur: 1.6 },
      blurb: 'An aura of +26% damage. Cheap force multiplier — worth killing first.'
    },
    {
      key: 'spec_siege', cls: 'specialist', mode: 'siege', tag: 'Siege Crew',
      hp: 132, armor: 7, shield: 0, dmg: 42, dmgType: DMG_BLUNT,
      range: 30, minRange: 10, wind: 1.10, strike: 0.10, recover: 1.40,
      speed: 2.20, mass: 1.10, radius: 0.60, maxAttackers: 2,
      knockback: 5.0, crit: 0.03, critMult: 1.4, siegeMul: 3.20,
      cost: 110, train: 5.0, rank: 4, valueBias: 0.95,
      projSpeed: 26, projArc: 1.35, splash: 4.2, supportDps: 6, hold: 0.2,
      blurb: 'Arcing splash. The only sane way to break a fort or a packed shield wall.'
    },
    {
      key: 'spec_trap', cls: 'specialist', mode: 'trap', tag: 'Sapper',
      hp: 120, armor: 6, shield: 0, dmg: 12, dmgType: DMG_PIERCE,
      range: 12, wind: 0.44, strike: 0.06, recover: 0.80,
      speed: 3.20, mass: 0.90, radius: 0.52, maxAttackers: 2,
      knockback: 0.6, crit: 0.06, critMult: 1.6, siegeMul: 0.40,
      cost: 100, train: 4.2, rank: 4, valueBias: 0.95,
      projSpeed: 28, supportDps: 15, hold: 0.4,
      ability: { kind: 'trap', cd: 5.0, max: 4, dmg: 95, radius: 3.0, trigger: 2.4, arm: 1.0 },
      blurb: 'Seeds the ground ahead. Turns a careless enemy charge into a crater.'
    },
    {
      key: 'champion', cls: 'champion', tag: 'Hero',
      hp: 780, armor: 19, shield: 180, dmg: 62, dmgType: DMG_SLASH,
      range: 2.9, wind: 0.30, strike: 0.10, recover: 0.46,
      speed: 3.70, mass: 2.80, radius: 0.82, maxAttackers: 5,
      knockback: 5.0, crit: 0.16, critMult: 2.0, siegeMul: 1.60,
      cost: 650, train: 9.0, rank: 1, valueBias: 0.88,
      supportDps: 0, hold: 0.8, backstab: 1.4, unique: 1,
      blurb: 'One hero, one active ability, one last act when it falls.'
    }
  ];

  /* Boss chassis — never purchasable, therefore outside the dominance cap. */
  var BOSS_ARCH = {
    key: 'boss', cls: 'boss', tag: 'Boss',
    hp: 6400, armor: 34, shield: 0, dmg: 118, dmgType: DMG_BLUNT,
    range: 4.4, wind: 0.62, strike: 0.16, recover: 0.80,
    speed: 2.35, mass: 14.0, radius: 1.85, maxAttackers: 10,
    knockback: 12.0, crit: 0.08, critMult: 1.8, siegeMul: 4.0,
    cost: 0, train: 0, rank: 0, valueBias: 1,
    supportDps: 0, hold: 1.0, splash: 3.4,
    blurb: 'Telegraphed, phased, and soft in the back.'
  };

  /* ---- per-era flavour ---------------------------------------------------- */
  var ERA_NAMES = {
    defender:   ['Bone Shield', 'Hoplite', 'Legionary', 'Man-at-Arms', 'Pikeman', 'Trench Guard', 'Riot Trooper', 'Aegis Sentinel'],
    assault:    ['Club Brute', 'Bronze Axeman', 'Gladius Raider', 'Berserker', 'Grenadier', 'Shock Trooper', 'Breacher', 'Plasma Reaver'],
    ranged:     ['Rock Thrower', 'Slinger', 'Archer', 'Longbowman', 'Musketeer', 'Rifleman', 'Marksman', 'Railgunner'],
    specialist: ['Shaman', 'Oracle', 'Ballista Crew', 'Sapper', 'Field Medic', 'Mortar Team', 'Combat Engineer', 'Nano Priest'],
    champion:   ['Mammoth Lord', 'Bronze Champion', 'Centurion', 'Black Knight', 'Dragoon Captain', 'Iron Marshal', 'Ghost Operative', 'Titan Prime'],
    boss:       ['Cave Titan', 'Minotaur King', 'War Elephant', 'Dragon Knight', 'Siege Baron', 'Land Dreadnought', 'Gunship Walker', 'Omega Colossus']
  };

  /* which specialist archetype each era fields */
  var ERA_SPEC = ['spec_heal', 'spec_buff', 'spec_siege', 'spec_trap', 'spec_heal', 'spec_siege', 'spec_trap', 'spec_buff'];
  /* champion active ability per era */
  var ERA_CHAMP_ABILITY = ['stomp', 'rally', 'whirlwind', 'whirlwind', 'barrage', 'barrage', 'leap', 'shieldaura'];
  /* champion ultimate, fired on death */
  var ERA_CHAMP_ULT = ['deathblast', 'lastrally', 'deathblast', 'martyr', 'deathblast', 'lastrally', 'martyr', 'deathblast'];
  /* boss ability pool per era */
  var ERA_BOSS_KIT = [
    ['slam', 'summon', 'charge'],
    ['charge', 'sweep', 'summon'],
    ['charge', 'slam', 'summon'],
    ['sweep', 'barrage', 'slam'],
    ['barrage', 'slam', 'summon'],
    ['barrage', 'charge', 'sweep'],
    ['barrage', 'sweep', 'summon'],
    ['slam', 'barrage', 'charge']
  ];

  /* =========================================================================
   * 4. ROSTER BUILD + DOMINANCE NORMALISATION
   * -------------------------------------------------------------------------
   *  Every unit is scored  value = dps * effectiveHp / cost.  Costs are then
   *  solved so that no unit's value can run away from the pack. This is the
   *  structural fix for "one dominant unit made the roster fake" — it is not a
   *  hand-tuned table that drifts, it is an invariant the build enforces and
   *  selfTest() re-proves.
   * ====================================================================== */

  function cycleTime(a) { return (a.wind || 0) + (a.strike || 0) + (a.recover || 0); }

  /** Weapon damage per second. This is what actually kills things. */
  function weaponDps(a) {
    var t = cycleTime(a);
    if (!(t > 0)) { t = 1; }
    var d = a.dmg / t;
    /* crits are part of the damage, not a bonus on top of it */
    return d * (1 + (a.crit || 0) * ((a.critMult || 1) - 1));
  }

  /** Total gold-worth per second: weapon damage plus support contribution. */
  function rawDps(a) { return weaponDps(a) + (a.supportDps || 0); }

  /** Effective hit points including armour mitigation and a frontal shield. */
  function rawEhp(a) {
    var mit = (a.armor || 0) / ((a.armor || 0) + BASE_ARMOR_K);
    var ehp = (a.hp || 1) / (1 - mit);
    ehp += (a.shield || 0) * 0.80;   // shields only face one way
    return ehp;
  }

  /** Standing off is a survivability stat. Capped so it cannot dominate. */
  function reachFactor(a) {
    return 1 + clamp((a.range || 2) / 45, 0, 0.62);
  }

  function archValue(a) { return rawDps(a) * rawEhp(a) * reachFactor(a); }

  function roundCost(c) {
    if (c < 100) { return Math.max(10, Math.round(c)); }
    if (c < 600) { return Math.round(c / 5) * 5; }
    return Math.round(c / 10) * 10;
  }

  /**
   * Solve base costs so that value/cost sits in a deliberately narrow band,
   * shaped only by each archetype's designer valueBias.
   */
  function normaliseCosts() {
    var vals = [], i;
    for (i = 0; i < ARCH.length; i++) { vals.push(archValue(ARCH[i]) / ARCH[i].cost); }
    var sorted = vals.slice().sort(function (a, b) { return a - b; });
    var median = sorted[(sorted.length / 2) | 0];
    if (!(median > 0)) { median = 1; }
    for (i = 0; i < ARCH.length; i++) {
      var a = ARCH[i];
      var target = median * (a.valueBias || 1);
      a.cost = roundCost(archValue(a) / target);
    }
  }
  normaliseCosts();

  /* ---- build the era-expanded type table ---------------------------------- */
  var TYPES = Object.create(null);   // id -> def
  var TYPE_LIST = [];
  var ERA_ROSTER = [];               // eraIndex -> [def, def, ...] (buyable)
  var ERA_BOSS = [];

  function eraName(cls, era) {
    var row = ERA_NAMES[cls];
    if (!row) { return cls; }
    return row[clamp(era, 0, row.length - 1)] || row[row.length - 1];
  }

  function buildType(a, era, opts) {
    var k = Math.pow(ERA_K, era);
    var costK = k * k;                       // keeps value/cost era-invariant
    var d = {
      id: a.key + '_' + era,
      key: a.key,
      cls: a.cls,
      mode: a.mode || null,
      era: era,
      name: eraName(a.cls, era),
      tag: a.tag,
      blurb: a.blurb,

      hp:     Math.round(a.hp * k),
      armor:  a.armor * k,
      shield: Math.round((a.shield || 0) * k),
      dmg:    a.dmg * k,
      dmgType: a.dmgType,

      range:    a.range,
      minRange: a.minRange || 0,
      wind:     a.wind,
      strike:   a.strike,
      recover:  a.recover,

      speed:  a.speed,
      mass:   a.mass,
      radius: a.radius,
      maxAttackers: a.maxAttackers,

      knockback: a.knockback,
      crit:      a.crit,
      critMult:  a.critMult,
      backstab:  a.backstab || 1.35,
      sprint:    a.sprint || 1.0,
      kite:      a.kite || 0,
      hold:      a.hold,
      siegeMul:  a.siegeMul,
      splash:    a.splash || 0,

      projSpeed: a.projSpeed || 0,
      projArc:   a.projArc || 1,
      ranged:    (a.range || 0) > 6,

      cost:  Math.max(5, Math.round(a.cost * costK)),
      train: a.train,
      rank:  a.rank,
      unique: a.unique || 0,

      supportDps: (a.supportDps || 0) * k,
      ability: null,
      ult: null,

      /* scoring snapshot — used by selfTest and by the wave director */
      _dps: 0, _cdps: 0, _ehp: 0, _value: 0
    };

    if (a.ability) {
      d.ability = {
        kind: a.ability.kind, cd: a.ability.cd,
        radius: a.ability.radius || 0, targets: a.ability.targets || 0,
        amount: a.ability.amount || 0, dmg: (a.ability.dmg || 0) * k,
        dmgMul: a.ability.dmgMul || 1, speedMul: a.ability.speedMul || 1,
        dur: a.ability.dur || 0, max: a.ability.max || 0,
        trigger: a.ability.trigger || 0, arm: a.ability.arm || 0
      };
    }
    if (opts && opts.championAbility) {
      d.ability = { kind: opts.championAbility, cd: CHAMP_CD[opts.championAbility] || 9, radius: 0, dur: 0 };
      d.ult = opts.championUlt;
    }
    if (opts && opts.boss) {
      d.boss = true;
      d.kit = ERA_BOSS_KIT[clamp(era, 0, ERA_BOSS_KIT.length - 1)];
      d.cost = 0;
    }

    d._dps = rawDps(d);          // for pricing
    d._cdps = weaponDps(d);      // for killing
    d._ehp = (d.hp / (1 - d.armor / (d.armor + armorK(era)))) + d.shield * 0.8;
    d._value = d._dps * d._ehp * reachFactor(d) / Math.max(1, d.cost);
    return d;
  }

  var CHAMP_CD = {
    stomp: 8.5, rally: 11, whirlwind: 8, barrage: 7.5, leap: 10, shieldaura: 12
  };

  (function buildRoster() {
    var archByKey = Object.create(null);
    for (var i = 0; i < ARCH.length; i++) { archByKey[ARCH[i].key] = ARCH[i]; }

    for (var e = 0; e < ERAS.length; e++) {
      var roster = [];
      var order = ['defender', 'assault', 'ranged', ERA_SPEC[clamp(e, 0, ERA_SPEC.length - 1)], 'champion'];
      for (var j = 0; j < order.length; j++) {
        var a = archByKey[order[j]];
        if (!a) { continue; }
        var opts = null;
        if (a.cls === 'champion') {
          opts = {
            championAbility: ERA_CHAMP_ABILITY[clamp(e, 0, ERA_CHAMP_ABILITY.length - 1)],
            championUlt: ERA_CHAMP_ULT[clamp(e, 0, ERA_CHAMP_ULT.length - 1)]
          };
        }
        var d = buildType(a, e, opts);
        /* stable, class-based id so UI/Economy can address "the era's archer" */
        d.id = d.cls + '_' + e;
        TYPES[d.id] = d;
        TYPE_LIST.push(d);
        roster.push(d);
      }
      ERA_ROSTER[e] = roster;

      var b = buildType(BOSS_ARCH, e, { boss: true });
      b.id = 'boss_' + e;
      TYPES[b.id] = b;
      TYPE_LIST.push(b);
      ERA_BOSS[e] = b;
    }
  })();

  function typeOf(id) { return TYPES[id] || null; }
  function rosterFor(era) { return ERA_ROSTER[clamp(era | 0, 0, ERA_ROSTER.length - 1)] || []; }
  function typeFor(cls, era) {
    var r = rosterFor(era), i;
    for (i = 0; i < r.length; i++) { if (r[i].cls === cls) { return r[i]; } }
    return r[0] || null;
  }

  /* =========================================================================
   * 5. DUEL PREDICTION
   * -------------------------------------------------------------------------
   *  One shared model used by BOTH the self-test ("does every unit have an
   *  answer?") and the wave director ("what beats what the player is fielding?").
   *  Because they share it, the AI can never send a counter the balance test
   *  does not believe in.
   * ====================================================================== */

  /** Damage a single unit of `a` lands per second on a single unit of `b`. */
  function effDps(a, b) {
    var d = a._cdps;
    d *= classBonus(a.cls, b.cls);
    var f = ARMOR_FACTOR[a.dmgType] || 1;
    var aEff = b.armor * f;
    var K = armorK(b.era);
    d *= (1 - aEff / (aEff + K));
    if (a.dmgType === DMG_BLUNT) {
      var ratio = b.armor / (b.armor + K);
      if (ratio > BLUNT_HEAVY_AT) {
        d *= 1 + BLUNT_HEAVY_MAX * clamp01((ratio - BLUNT_HEAVY_AT) / (1 - BLUNT_HEAVY_AT));
      }
    }
    return d;
  }

  /** Effective hit points of `b` against `a`'s specific damage type. */
  function effEhp(a, b) {
    var ehp = b.hp;
    if (b.shield > 0) {
      var sf = SHIELD_FACTOR[a.dmgType] || 1;
      ehp += b.shield * (0.55 + 0.45 * sf);
    }
    return ehp;
  }

  /**
   * Reach advantage, deliberately capped. In a real line battle a longer weapon
   * buys you a window, not immunity — uncapped range advantage is exactly how
   * ranged units become the one dominant pick.
   */
  function reachAdv(a, b) {
    var gap = (a.range || 0) - (b.range || 0);
    if (gap <= 0.5) { return 0; }
    var close = Math.max(1.0, (b.speed * (b.sprint || 1)) - (a.speed * (a.kite || 0)));
    var freeSec = clamp(gap / close, 0, 4.0);   // hard cap: 4 seconds of free fire
    return clamp(freeSec * 0.12, 0, 0.48);
  }

  /** Gold-normalised kill rate of army-of-`a` against army-of-`b`. */
  function killRate(a, b) {
    var na = 100 / Math.max(1, a.cost);
    var nb = 100 / Math.max(1, b.cost);
    var dps = effDps(a, b) * na;
    var ehp = effEhp(a, b) * nb;
    if (!(ehp > 0)) { return 0; }
    return (dps / ehp) * (1 + reachAdv(a, b));
  }

  /** >1 means `a` beats `b` at equal gold. */
  function duel(a, b) {
    var ra = killRate(a, b), rb = killRate(b, a);
    if (!(rb > 0)) { return ra > 0 ? 9 : 1; }
    return ra / rb;
  }

  /* =========================================================================
   * 6. UNIT POOL + FACTORY
   * ====================================================================== */
  function newUnitObj() {
    return {
      /* --- contract shape --- */
      id: 0, team: 1, cls: 'defender', x: 0, z: 0, y: 0, vx: 0, vz: 0, face: 1,
      hp: 1, maxHp: 1, armor: 0, shield: 0, era: 0,
      state: 'idle', anim: { t: 0, phase: 0, speed: 1 },
      target: null, dead: false, ragdoll: null,

      /* --- sim internals --- */
      def: null, type: '', name: '', mode: null,
      shieldMax: 0, shieldBroken: false, shieldRegenT: 0,
      vy: 0, kx: 0, kz: 0, mvx: 0, mvz: 0,
      mass: 1, radius: 0.5, speed: 3, maxAttackers: 2,
      atkPhase: 'idle', atkT: 0, cd: 0, retargetT: 0,
      hitStop: 0, stunT: 0, hurtT: 0, chargeT: 0,
      buffT: 0, buffDmg: 1, buffSpd: 1,
      slotX: 0, slotZ: 0, slotOk: false, formed: 0, rank: 0,
      attackers: 0, aimUnit: null, siegeMode: false,
      abilityCd: 0, abilityT: 0, abilityKind: null, ultKind: null,
      leapT: 0, leapX: 0, leapZ: 0, leapFrom: 0, leapFromZ: 0,
      boss: false, bossPhase: 0, kit: null, tellT: 0, tellKind: null,
      weakOpen: 0, elite: 0, militia: false,
      deathT: 0, killer: null, age: 0, jitter: 0,
      lastHitT: 0, dmgTaken: 0, kills: 0, spawnT: 0
    };
  }

  var unitPool = C.pool(newUnitObj, null, 96);

  var units = state.units;
  var projectiles = state.projectiles;
  var fx = state.fx;

  /* live per-team indices (rebuilt each step, never reallocated) */
  var alive = { 1: [], '-1': [] };
  var allAlive = [];

  /* reusable event payloads — emit() must never allocate */
  var evSpawn  = { unit: null };
  var evDeath  = { unit: null, killer: null };
  var evHit    = { unit: null, dmg: 0, from: null, crit: false, type: 'slash', blocked: false, weak: false };
  var evAttack = { unit: null, target: null, weapon: 'melee' };
  var evBlock  = { unit: null };
  var evFortHit = { team: 1, dmg: 0, hp: 0, max: 0 };
  var evFortDes = { team: 1 };
  var evFortTier = { team: 1, tier: 0 };
  var evWaveStart = { wave: 0, comp: null };
  var evWaveClear = { wave: 0, reward: 0 };
  var evPower  = { type: '', x: 0, z: 0, team: 1 };
  var evBoss   = { boss: null };
  var evPhase  = { n: 0, boss: null };
  var evToast  = { msg: '', kind: 'info' };
  var evTell   = { unit: null, ability: '', time: 0 };
  var evPreview = { wave: 0, comp: null, seconds: 0, boss: false };
  var evShake  = { amount: 0 };

  function emit(n, p) { C.emit(n, p); }
  function toast(msg, kind) { evToast.msg = msg; evToast.kind = kind || 'info'; emit('ui:toast', evToast); }
  function shake(a) { evShake.amount = a; emit('camera:shake', evShake); }

  /* =========================================================================
   * 7. LIGHTWEIGHT FX CHANNEL (VFX module reads state.fx)
   * ====================================================================== */
  var FX_CAP = 320;
  var fxPool = C.pool(function () {
    return { kind: '', x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, a: 0, team: 1, t: 0, ttl: 0, dead: false };
  }, null, 64);

  function pushFx(kind, x, y, z, dx, dy, dz, amount, team, ttl) {
    if (fx.length >= FX_CAP) { return null; }
    var f = fxPool.get();
    f.kind = kind; f.x = x; f.y = y; f.z = z;
    f.dx = dx || 0; f.dy = dy || 0; f.dz = dz || 0;
    f.a = amount || 1; f.team = team || 1;
    f.t = 0; f.ttl = ttl || 0.6; f.dead = false;
    fx.push(f);
    return f;
  }

  function stepFx(dt) {
    var i, f, w = 0;
    for (i = 0; i < fx.length; i++) {
      f = fx[i];
      if (!f) { continue; }
      f.t += dt;
      if (f.dead || f.t >= f.ttl) { fxPool.put(f); continue; }
      fx[w++] = f;
    }
    fx.length = w;
  }

  /* =========================================================================
   * 8. SPATIAL HASH
   * -------------------------------------------------------------------------
   *  Fixed grid over the whole battlefield. Buckets are allocated once and
   *  reused forever — the per-step cost is `length = 0`, never a new array.
   * ====================================================================== */
  var CELL = 5;
  var GX = Math.ceil((W + 2 * CELL) / CELL);
  var GZ = Math.ceil((LANE_MAX - LANE_MIN + 2 * CELL) / CELL);
  var grid = new Array(GX * GZ);
  (function () { for (var i = 0; i < grid.length; i++) { grid[i] = []; } })();

  function cellIx(x) { return clamp(((x + CELL) / CELL) | 0, 0, GX - 1); }
  function cellIz(z) { return clamp(((z - LANE_MIN + CELL) / CELL) | 0, 0, GZ - 1); }

  function gridClear() {
    for (var i = 0; i < grid.length; i++) { grid[i].length = 0; }
  }

  function gridInsert(u) {
    var b = grid[cellIz(u.z) * GX + cellIx(u.x)];
    if (b) { b.push(u); }
  }

  function gridBuild() {
    gridClear();
    for (var i = 0; i < allAlive.length; i++) { gridInsert(allAlive[i]); }
  }

  /* Neighbour iteration without allocating: caller supplies a visit function
     that is hoisted out of the loop (never a closure created per unit). */
  var _visitCtx = { u: null, dt: 0, best: null, bestScore: 0, team: 0, r2: 0, acc: 0 };

  function forEachNear(x, z, radius, visit, ctx) {
    var cx0 = cellIx(x - radius), cx1 = cellIx(x + radius);
    var cz0 = cellIz(z - radius), cz1 = cellIz(z + radius);
    var ix, iz, k, b, n;
    for (iz = cz0; iz <= cz1; iz++) {
      var row = iz * GX;
      for (ix = cx0; ix <= cx1; ix++) {
        b = grid[row + ix];
        if (!b) { continue; }
        for (k = 0, n = b.length; k < n; k++) { visit(b[k], ctx); }
      }
    }
  }

  /* =========================================================================
   * 9. TARGET ACQUISITION  (with real target distribution)
   * -------------------------------------------------------------------------
   *  Every candidate is scored, not just "nearest". The score penalises targets
   *  that already have attackers, so 20 soldiers spread across the enemy line
   *  instead of all piling onto the one poor spearman at the front.
   * ====================================================================== */
  function validTarget(t, u) {
    if (!t || t.dead || t.hp <= 0) { return false; }
    if (t.team === u.team) { return false; }
    var dx = t.x - u.x, dz = t.z - u.z;
    var lim = u.def.range + 34;
    return (dx * dx + dz * dz) < lim * lim;
  }

  function visitTarget(t, ctx) {
    var u = ctx.u;
    if (!t || t.dead || t.team === u.team) { return; }
    var dx = t.x - u.x, dz = t.z - u.z;
    var d2 = dx * dx + dz * dz;
    if (d2 > ctx.r2) { return; }
    var d = Math.sqrt(d2);

    var score = d;

    /* crowd control: soft-cap attackers per target, hard penalty past the cap */
    var occ = t.attackers;
    score += occ * 3.4;
    if (occ >= t.maxAttackers) { score += 26; }

    /* seek out the things you are built to kill */
    var bon = classBonus(u.cls, t.cls);
    if (bon > 1.15) { score -= 9; }
    else if (bon < 0.85) { score += 7; }

    /* support and heroes are worth walking past a spearman for */
    if (t.cls === 'specialist') { score -= 5; }
    if (t.cls === 'champion') { score -= 3; }
    if (t.boss) { score += 4; }

    /* wounded targets finish faster — small, so it never becomes dog-piling */
    score -= (1 - t.hp / t.maxHp) * 4;

    /* don't chase across the whole lane if something is right here */
    score += Math.abs(t.z - u.z) * 0.35;

    if (ctx.best === null || score < ctx.bestScore) { ctx.best = t; ctx.bestScore = score; }
  }

  function acquireTarget(u) {
    var searchR = u.def.range > 6 ? (u.def.range + 8) : 17;
    if (u.chargeT > 0) { searchR += 10; }
    _visitCtx.u = u; _visitCtx.best = null; _visitCtx.bestScore = 0;
    _visitCtx.r2 = searchR * searchR;
    forEachNear(u.x, u.z, searchR, visitTarget, _visitCtx);

    var next = _visitCtx.best;
    if (next === u.target) { return; }
    if (u.target && !u.target.dead) { u.target.attackers--; if (u.target.attackers < 0) { u.target.attackers = 0; } }
    u.target = next;
    if (next) { next.attackers++; }
  }

  function dropTarget(u) {
    if (u.target && !u.target.dead) { u.target.attackers--; if (u.target.attackers < 0) { u.target.attackers = 0; } }
    u.target = null;
  }

  /* =========================================================================
   * 10. DAMAGE RESOLUTION
   * -------------------------------------------------------------------------
   *  Order of operations, and each step exists for a reason:
   *    class bonus -> frontal shield -> armour (type-weighted) -> formation
   *    -> crit / backstab / weak point -> knockback -> hit-stop -> events.
   * ====================================================================== */
  var _dmgOpts = { ignoreShield: false, crit: false, weapon: 'melee', knock: -1, splash: false };

  var _splashOpts = { ignoreShield: true, crit: false, weapon: 'splash', knock: 2.2, splash: true };

  function resetDmgOpts() {
    _dmgOpts.ignoreShield = false; _dmgOpts.crit = false;
    _dmgOpts.weapon = 'melee'; _dmgOpts.knock = -1; _dmgOpts.splash = false;
    return _dmgOpts;
  }

  /** true when `src` is in front of `tgt` (shields only work one way). */
  function fromFront(srcX, tgt) { return ((srcX - tgt.x) * tgt.face) > 0; }

  /** Formation grants an armour multiplier — and only while you hold the line. */
  function formArmorMul(u) {
    if (u.formed <= 0) { return 1; }
    var army = armies[u.team];
    var f = FORMATIONS[army.formation] || FORMATIONS.line;
    return 1 + f.def * u.formed * army.stanceFormMul;
  }

  /**
   * Apply damage. Returns the amount actually dealt.
   * `src` may be null (traps, fort turrets, environmental).
   */
  function applyDamage(src, tgt, raw, dmgType, opts) {
    if (!tgt || tgt.dead || tgt.hp <= 0 || !(raw > 0)) { return 0; }
    opts = opts || _dmgOpts;
    var d = raw;
    var srcX = src ? src.x : tgt.x - tgt.face * 5;
    var crit = !!opts.crit;
    var weak = false;
    var blocked = false;

    /* ---- 1. class counter ------------------------------------------------ */
    if (src) { d *= classBonus(src.cls, tgt.cls); }

    /* ---- 2. backstab / weak point ---------------------------------------- */
    var behind = src ? !fromFront(srcX, tgt) : false;
    if (behind && src) {
      d *= (src.def.backstab || 1.35);
      if (tgt.boss) { weak = true; d *= 1.55; }
    }
    if (tgt.boss && tgt.weakOpen > 0) { weak = true; d *= 2.1; }

    /* ---- 3. shield: front arc only, and it breaks ------------------------ */
    if (tgt.shield > 0 && !opts.ignoreShield && !behind) {
      var sf = SHIELD_FACTOR[dmgType] || 1;
      var absorb = d * SHIELD_ABSORB * sf;
      if (absorb > tgt.shield) { absorb = tgt.shield; }
      tgt.shield -= absorb;
      d -= absorb;
      blocked = absorb > 0.5;
      tgt.shieldRegenT = 6.5;
      if (blocked) {
        evBlock.unit = tgt; emit('unit:block', evBlock);
        pushFx('block', tgt.x + tgt.face * 0.5, 1.15, tgt.z, tgt.face, 0, 0, absorb, tgt.team, 0.32);
      }
      if (tgt.shield <= 0.001) {
        tgt.shield = 0;
        if (!tgt.shieldBroken) {
          tgt.shieldBroken = true;
          pushFx('shieldbreak', tgt.x, 1.1, tgt.z, tgt.face, 0, 0, 1, tgt.team, 0.5);
          shake(0.10);
        }
      }
    }

    /* ---- 4. armour, weighted by damage type ------------------------------ */
    if (d > 0) {
      var f = ARMOR_FACTOR[dmgType] || 1;
      var aEff = tgt.armor * formArmorMul(tgt) * f;
      var K = armorK(tgt.era);
      var ratio = aEff / (aEff + K);
      d *= (1 - ratio);
      if (dmgType === DMG_BLUNT) {
        var hard = tgt.armor / (tgt.armor + K);
        if (hard > BLUNT_HEAVY_AT) {
          d *= 1 + BLUNT_HEAVY_MAX * clamp01((hard - BLUNT_HEAVY_AT) / (1 - BLUNT_HEAVY_AT));
        }
      }
    }

    /* ---- 5. stance / buff modifiers on the attacker ---------------------- */
    if (src) {
      d *= src.buffDmg;
      var sarmy = armies[src.team];
      if (sarmy) { d *= sarmy.dmgMul; }
      if (src.chargeT > 0) { d *= 1.20; }
    }
    /* Defend stance costs gold, so it had better be worth something. */
    var tarmy = armies[tgt.team];
    if (tarmy) { d *= tarmy.takenMul; }

    if (crit) { d *= (src ? src.def.critMult : 1.8); }

    if (d < 0.5) { d = 0.5; }

    /* ---- 6. commit ------------------------------------------------------- */
    tgt.hp -= d;
    tgt.dmgTaken += d;
    tgt.lastHitT = 0;
    if (src) { src.kills += 0; }

    /* comeback charge builds from punishment taken, deterministically */
    if (tarmy) { tarmy.powerRaw += d; }
    if (tgt.team === 1) { state.stats.dmgTaken += d; }
    else { state.stats.dmgDealt += d; }

    /* ---- 7. reaction: knockback, hit-stop, stagger ------------------------ */
    var knock = (opts.knock >= 0) ? opts.knock : (src ? src.def.knockback : 1.5);
    if (knock > 0) {
      var dirx = (tgt.x - srcX);
      if (dirx === 0) { dirx = tgt.face * -1; }
      dirx = dirx > 0 ? 1 : -1;
      var imp = knock * (crit ? 1.6 : 1) / Math.max(0.35, tgt.mass);
      tgt.kx += dirx * imp;
      if (src) { tgt.kz += (tgt.z - src.z) * 0.16 * imp; }
      if (imp > 3.2) { tgt.stunT = Math.max(tgt.stunT, clamp(imp * 0.05, 0, 0.45)); }
    }

    var big = crit || weak || d > tgt.maxHp * 0.18;
    if (big) {
      tgt.hitStop = Math.max(tgt.hitStop, weak ? 0.10 : 0.07);
      if (src) { src.hitStop = Math.max(src.hitStop, 0.05); }
    }
    tgt.hurtT = big ? 0.30 : 0.16;

    /* ---- 8. feedback ----------------------------------------------------- */
    evHit.unit = tgt; evHit.dmg = d; evHit.from = src; evHit.crit = crit;
    evHit.type = dmgType; evHit.blocked = blocked; evHit.weak = weak;
    emit('unit:hit', evHit);

    pushFx(blocked ? 'sparks' : 'impact', tgt.x, 1.0 + (tgt.radius), tgt.z,
           (tgt.x - srcX) > 0 ? 1 : -1, 0.4, 0, d, tgt.team, 0.3);
    if (crit || weak) { shake(weak ? 0.22 : 0.13); }

    if (tgt.hp <= 0) { killUnit(tgt, src); }
    return d;
  }

  /* =========================================================================
   * 11. ATTACK TIMING: windup -> strike -> recovery
   * -------------------------------------------------------------------------
   *  Nothing snaps. A unit commits to a swing and can be punished during the
   *  windup — which is what makes knockback, hit-stop and charges readable.
   * ====================================================================== */
  function inAttackRange(u, t) {
    if (!t) { return false; }
    var dx = t.x - u.x, dz = t.z - u.z;
    var r = u.def.range + u.radius + t.radius;
    return (dx * dx + dz * dz) <= r * r;
  }

  function beginAttack(u) {
    u.atkPhase = 'wind';
    u.atkT = u.def.wind / u.buffSpd;
    u.state = 'attack';
    u.anim.phase = 0;
    evAttack.unit = u; evAttack.target = u.target;
    evAttack.weapon = u.def.ranged ? 'ranged' : 'melee';
    emit('unit:attack', evAttack);
  }

  function resolveStrike(u) {
    var t = u.target;
    if (u.def.ranged && u.def.projSpeed > 0) {
      fireProjectile(u, t);
      return;
    }
    if (!t || t.dead) {
      /* Siege swing: no target left, so the swing lands on the gate. */
      if (u.siegeMode && fortReach(u)) {
        var fteam = -u.team;
        damageFort(fteam, u.def.dmg * u.def.siegeMul * u.buffDmg * armies[u.team].dmgMul, u);
        shake(0.12);
      }
      return;
    }
    if (!inAttackRange(u, t)) { return; }   // they slipped the swing — earned it

    var o = resetDmgOpts();
    o.crit = C.rngChance(u.def.crit);
    o.weapon = 'melee';
    var dmg = u.def.dmg;
    applyDamage(u, t, dmg, u.def.dmgType, o);

    /* melee splash (bosses, siege) */
    if (u.def.splash > 0) { splashDamage(u, t.x, t.z, u.def.splash, dmg * 0.5, u.def.dmgType, false); }
  }

  /* A splash can kill a champion whose ultimate is another splash, all while the
     outer iteration is still running — so the context is a small fixed stack. */
  var _splashStack = [], _splashDepth = 0;
  (function () { for (var i = 0; i < 4; i++) { _splashStack.push({ src: null, x: 0, z: 0, r2: 0, dmg: 0, type: '', team: 0, friendly: false }); } })();
  function visitSplash(v, ctx) {
    if (!v || v.dead) { return; }
    if (!ctx.friendly && v.team === ctx.team) { return; }
    var dx = v.x - ctx.x, dz = v.z - ctx.z;
    var d2 = dx * dx + dz * dz;
    if (d2 > ctx.r2) { return; }
    var fall = 1 - Math.sqrt(d2 / ctx.r2) * 0.6;
    _splashOpts.splash = true; _splashOpts.ignoreShield = true;
    _splashOpts.knock = 2.2; _splashOpts.crit = false; _splashOpts.weapon = 'splash';
    applyDamage(ctx.src, v, ctx.dmg * fall, ctx.type, _splashOpts);
  }

  /**
   * @param {object|null} src   attacker (null = fort / power / trap)
   * @param {number} team       team that OWNS the blast; enemies of it are hit
   * @param {boolean} hitOwn    true = friendly fire (meteors do not care)
   */
  function splashAt(src, team, x, z, radius, dmg, type, hitOwn) {
    if (_splashDepth >= _splashStack.length) { return; }
    var ctx = _splashStack[_splashDepth++];
    ctx.src = src; ctx.x = x; ctx.z = z;
    ctx.r2 = radius * radius; ctx.dmg = dmg; ctx.type = type;
    ctx.team = team; ctx.friendly = !!hitOwn;
    forEachNear(x, z, radius, visitSplash, ctx);
    _splashDepth--;
    pushFx('splash', x, 0.4, z, 0, 0, 0, radius, team, 0.4);
  }

  function splashDamage(src, x, z, radius, dmg, type, hitOwn) {
    splashAt(src, src ? src.team : 0, x, z, radius, dmg, type, hitOwn);
  }

  function stepAttack(u, dt) {
    if (u.atkPhase === 'idle') { return false; }
    u.atkT -= dt;
    if (u.atkPhase === 'wind') {
      u.anim.phase = 1 - clamp01(u.atkT / Math.max(0.001, u.def.wind / u.buffSpd));
      if (u.atkT <= 0) {
        resolveStrike(u);
        u.atkPhase = 'rec';
        u.atkT = (u.def.recover + u.def.strike) / u.buffSpd;
      }
      return true;
    }
    /* recovery */
    u.anim.phase = 1 - clamp01(u.atkT / Math.max(0.001, (u.def.recover + u.def.strike) / u.buffSpd));
    if (u.atkT <= 0) { u.atkPhase = 'idle'; u.state = 'idle'; }
    return true;
  }

  /* =========================================================================
   * 12. DEATH + RAGDOLL
   * ====================================================================== */
  function killUnit(u, killer) {
    if (u.dead) { return; }
    u.dead = true;
    u.hp = 0;
    u.state = 'die';
    u.deathT = 0;
    u.killer = killer || null;
    u.attackers = 0;
    dropTarget(u);

    /* ragdoll impulse: direction away from the killer, scaled by the last hit */
    var dirx = killer ? ((u.x - killer.x) > 0 ? 1 : -1) : -u.face;
    var p = 2.6 + C.rngRange(0, 2.2);
    u.ragdoll = u.ragdoll || { vx: 0, vy: 0, vz: 0, spin: 0, t: 0 };
    u.ragdoll.vx = dirx * p / Math.max(0.4, u.mass * 0.6);
    u.ragdoll.vy = 2.2 + C.rngRange(0, 2.0);
    u.ragdoll.vz = C.rngRange(-1.2, 1.2);
    u.ragdoll.spin = C.rngRange(-7, 7);
    u.ragdoll.t = 0;
    u.vy = u.ragdoll.vy;
    u.kx += u.ragdoll.vx * 0.5;
    u.kz += u.ragdoll.vz * 0.5;

    var army = armies[u.team];
    if (army) { army.losses++; army.formDirty = true; if (u.def.unique) { army.uniqueAlive[u.def.id] = 0; } }
    var foe = armies[-u.team];
    if (foe) { foe.kills++; }

    if (u.team === 1) { state.stats.losses++; } else { state.stats.kills++; }

    /* champion ultimate fires on death — losing your hero is a play, not a loss */
    if (u.cls === 'champion' && u.ultKind) { championUltimate(u); }
    if (u.boss) { onBossDeath(u); }

    /* bounty */
    if (killer && killer.team === 1 && !u.militia) { awardKillGold(u); }
    if (killer) { killer.kills++; }

    evDeath.unit = u; evDeath.killer = killer || null;
    emit('unit:death', evDeath);
    pushFx('death', u.x, 0.9, u.z, dirx, 1, 0, u.mass, u.team, 0.8);
  }

  function awardKillGold(u) {
    var army = armies[1];
    var g = Math.round(u.def.cost * 0.5 * (army ? army.goldMul : 1) * (u.boss ? 6 : 1));
    if (g > 0) { C.addGold(g, 'kill'); }
  }

  /* =========================================================================
   * 13. PROJECTILES — real ballistics, real travel time, real leading
   * -------------------------------------------------------------------------
   *  Arrows are not hitscan. They arc under gravity, take time to arrive, and
   *  are aimed where the target WILL be. That is why a moving assault squad
   *  eats fewer arrows than a static shield wall — the counter emerges from
   *  the physics instead of being asserted by a table.
   * ====================================================================== */
  var GRAV = 19.6;
  var PROJ_CAP = 260;

  var projPool = C.pool(function () {
    return {
      id: 0, team: 1, kind: 'arrow', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      dmg: 0, type: 'slash', src: null, target: null, ttl: 0, t: 0,
      splash: 0, siegeMul: 1, crit: false, knock: -1, dead: false, spin: 0, grav: 1
    };
  }, null, 48);

  function fireProjectile(u, t) {
    if (projectiles.length >= PROJ_CAP) { return null; }
    var d = u.def;
    var px = u.x + u.face * 0.5;
    var py = 1.35 + u.radius * 0.4;
    var pz = u.z;

    var tx, tz, ty;
    if (t) {
      /* two-pass lead: guess flight time, refine with the target's velocity */
      var sp = d.projSpeed;
      var gx = t.x - px, gz = t.z - pz;
      var fl = Math.sqrt(gx * gx + gz * gz) / Math.max(4, sp);
      gx = (t.x + t.vx * fl) - px; gz = (t.z + t.vz * fl) - pz;
      fl = Math.sqrt(gx * gx + gz * gz) / Math.max(4, sp);
      tx = t.x + t.vx * fl;
      tz = t.z + t.vz * fl;
      ty = 0.95 + t.radius * 0.5;
    } else {
      tx = u.x + u.face * d.range; tz = u.z; ty = 1.0;
    }

    var dx = tx - px, dz = tz - pz;
    var horiz = Math.sqrt(dx * dx + dz * dz);
    if (horiz < 0.001) { horiz = 0.001; }
    var speed = d.projSpeed;
    var T = horiz / speed;
    if (T < 0.06) { T = 0.06; }

    var p = projPool.get();
    p.id = C.nextId();
    p.team = u.team;
    p.kind = d.cls === 'specialist' && d.mode === 'siege' ? 'boulder'
           : (d.era >= 4 ? 'bullet' : 'arrow');
    p.x = px; p.y = py; p.z = pz;
    p.grav = d.projArc;
    p.vx = dx / T;
    p.vz = dz / T;
    p.vy = (ty - py) / T + 0.5 * GRAV * p.grav * T;
    p.dmg = d.dmg;
    p.type = d.dmgType;
    p.src = u;
    p.target = t || null;
    p.ttl = T * 2.4 + 0.6;
    p.t = 0;
    p.splash = d.splash;
    p.siegeMul = d.siegeMul;
    p.crit = C.rngChance(d.crit);
    p.knock = -1;
    p.dead = false;
    p.spin = C.rngRange(-6, 6);
    projectiles.push(p);
    pushFx('shoot', px, py, pz, u.face, 0, 0, 1, u.team, 0.2);
    return p;
  }

  /** Fort turret / power projectile: no unit source. */
  function fireBolt(team, x, y, z, tx, tz, dmg, type, speed, splash) {
    if (projectiles.length >= PROJ_CAP) { return null; }
    var dx = tx - x, dz = tz - z;
    var horiz = Math.sqrt(dx * dx + dz * dz);
    if (horiz < 0.001) { horiz = 0.001; }
    var T = Math.max(0.08, horiz / speed);
    var p = projPool.get();
    p.id = C.nextId();
    p.team = team; p.kind = 'bolt';
    p.x = x; p.y = y; p.z = z; p.grav = 0.75;
    p.vx = dx / T; p.vz = dz / T;
    p.vy = (1.0 - y) / T + 0.5 * GRAV * p.grav * T;
    p.dmg = dmg; p.type = type; p.src = null; p.target = null;
    p.ttl = T * 2.2 + 0.5; p.t = 0;
    p.splash = splash || 0; p.siegeMul = 1; p.crit = false; p.knock = 2.5;
    p.dead = false; p.spin = 0;
    projectiles.push(p);
    return p;
  }

  var _projCtx = { p: null, hit: null, r2: 0 };
  function visitProjHit(v, ctx) {
    var p = ctx.p;
    if (!v || v.dead || v.team === p.team) { return; }
    var dx = v.x - p.x, dz = v.z - p.z;
    var dy = (v.y + v.radius * 1.1) - p.y;
    var r = v.radius + 0.42;
    if (dx * dx + dz * dz > r * r) { return; }
    if (dy < -1.4 || dy > 1.9) { return; }
    if (ctx.hit === null) { ctx.hit = v; }
  }

  function stepProjectiles(dt) {
    var w = 0, i, p;
    for (i = 0; i < projectiles.length; i++) {
      p = projectiles[i];
      if (!p) { continue; }
      if (p.dead) { projPool.put(p); continue; }

      p.t += dt;
      p.vy -= GRAV * p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      var done = false;

      /* ground */
      if (p.y <= 0.08) {
        if (p.splash > 0) {
          splashDamage(p.src, p.x, p.z, p.splash, p.dmg * 0.8, p.type, false);
          shake(0.10);
        }
        pushFx('projland', p.x, 0.1, p.z, 0, 0, 0, p.splash || 1, p.team, 0.35);
        done = true;
      } else if (p.t > p.ttl) {
        done = true;
      } else {
        /* unit collision */
        _projCtx.p = p; _projCtx.hit = null;
        forEachNear(p.x, p.z, 1.6, visitProjHit, _projCtx);
        var hit = _projCtx.hit;
        if (hit) {
          var o = resetDmgOpts();
          o.crit = p.crit; o.weapon = 'ranged'; o.knock = p.knock;
          applyDamage(p.src, hit, p.dmg, p.type, o);
          if (p.splash > 0) { splashDamage(p.src, p.x, p.z, p.splash, p.dmg * 0.55, p.type, false); }
          done = true;
        } else {
          /* fort collision */
          var ft = fortAt(p.x, p.team);
          if (ft !== 0) {
            damageFort(ft, p.dmg * p.siegeMul * 0.7, p.src);
            pushFx('projland', p.x, p.y, p.z, 0, 0, 0, 1, p.team, 0.3);
            done = true;
          }
        }
      }

      if (done) { projPool.put(p); continue; }
      projectiles[w++] = p;
    }
    projectiles.length = w;
  }

  /* =========================================================================
   * 14. MINES / TRAPS  (specialist 'trap' mode)
   * ====================================================================== */
  var mines = [];
  var minePool = C.pool(function () {
    return { id: 0, team: 1, x: 0, z: 0, dmg: 0, radius: 3, trigger: 2.4, arm: 1, t: 0, ttl: 40, owner: null, dead: false };
  }, null, 12);

  function plantMine(u) {
    var ab = u.def.ability;
    if (!ab) { return; }
    var live = 0, i;
    for (i = 0; i < mines.length; i++) { if (mines[i].owner === u && !mines[i].dead) { live++; } }
    if (live >= ab.max) { return; }
    var m = minePool.get();
    m.id = C.nextId(); m.team = u.team;
    m.x = u.x + u.face * C.rngRange(3, 9); m.z = u.z + C.rngRange(-3, 3);
    m.dmg = ab.dmg; m.radius = ab.radius; m.trigger = ab.trigger;
    m.arm = ab.arm; m.t = 0; m.ttl = 45; m.owner = u; m.dead = false;
    mines.push(m);
    pushFx('mineplant', m.x, 0.08, m.z, 0, 0, 0, 1, m.team, 0.4);
  }

  var _mineCtx = { m: null, hit: null };
  function visitMine(v, ctx) {
    var m = ctx.m;
    if (!v || v.dead || v.team === m.team) { return; }
    var dx = v.x - m.x, dz = v.z - m.z;
    if (dx * dx + dz * dz <= m.trigger * m.trigger) { ctx.hit = v; }
  }

  function stepMines(dt) {
    var w = 0, i, m;
    for (i = 0; i < mines.length; i++) {
      m = mines[i];
      if (!m) { continue; }
      m.t += dt;
      if (m.dead || m.t > m.ttl) { minePool.put(m); continue; }
      if (m.t >= m.arm) {
        _mineCtx.m = m; _mineCtx.hit = null;
        forEachNear(m.x, m.z, m.trigger + 1, visitMine, _mineCtx);
        if (_mineCtx.hit) {
          splashDamage(m.owner, m.x, m.z, m.radius, m.dmg, DMG_BLUNT, false);
          pushFx('explosion', m.x, 0.3, m.z, 0, 1, 0, m.radius, m.team, 0.5);
          shake(0.24);
          minePool.put(m);
          continue;
        }
      }
      mines[w++] = m;
    }
    mines.length = w;
  }

  /* =========================================================================
   * 15. FORMATIONS
   * -------------------------------------------------------------------------
   *  A formation is a set of rank/file slots measured back from the army's
   *  anchor line. Units are assigned slots in a stable order, so when a soldier
   *  dies the survivors close the gap instead of leaving a hole. Holding your
   *  slot pays an armour bonus; breaking ranks to charge throws it away. That
   *  trade is the whole point.
   * ====================================================================== */
  var FORMATIONS = {
    line:      { name: 'Line',        ranks: 3, fileGap: 2.30, rankGap: 3.0, def: 0.34, speed: 1.00, wedge: 0.0, spread: 1.00 },
    wedge:     { name: 'Wedge',       ranks: 4, fileGap: 2.05, rankGap: 2.6, def: 0.16, speed: 1.14, wedge: 1.6, spread: 0.85 },
    shieldwall:{ name: 'Shield Wall', ranks: 2, fileGap: 1.45, rankGap: 2.3, def: 0.72, speed: 0.72, wedge: 0.0, spread: 0.72 },
    skirmish:  { name: 'Skirmish',    ranks: 4, fileGap: 3.60, rankGap: 4.2, def: 0.10, speed: 1.10, wedge: 0.0, spread: 1.45 },
    column:    { name: 'Column',      ranks: 8, fileGap: 2.60, rankGap: 2.4, def: 0.24, speed: 1.22, wedge: 0.0, spread: 0.45 }
  };
  var FORMATION_LIST = ['line', 'wedge', 'shieldwall', 'skirmish', 'column'];

  /* Which rank a class wants: 0 = front. Formation depth clamps it. */
  function classRank(cls) {
    if (cls === 'defender') { return 0; }
    if (cls === 'champion') { return 0; }
    if (cls === 'assault') { return 1; }
    if (cls === 'boss') { return 0; }
    if (cls === 'ranged') { return 2; }
    return 3;   // specialist
  }

  /* scratch buckets for slot assignment — allocated once */
  var _rankBuckets = [[], [], [], [], [], [], [], []];

  function assignSlots(army) {
    var list = alive[army.team];
    var f = FORMATIONS[army.formation] || FORMATIONS.line;
    var i, r;

    for (r = 0; r < _rankBuckets.length; r++) { _rankBuckets[r].length = 0; }

    for (i = 0; i < list.length; i++) {
      var u = list[i];
      if (u.boss) { u.slotOk = false; continue; }
      r = classRank(u.cls);
      if (r >= f.ranks) { r = f.ranks - 1; }
      _rankBuckets[r].push(u);
    }

    var laneHalf = (LANE_MAX - LANE_MIN) * 0.5 - 1.2;
    for (r = 0; r < f.ranks; r++) {
      var b = _rankBuckets[r];
      if (b.length === 0) { continue; }
      /* stable ordering: by id. Deterministic, and gaps close inwards. */
      b.sort(byId);
      var n = b.length;
      var gap = f.fileGap * f.spread;
      var width = (n - 1) * gap;
      var maxW = laneHalf * 2;
      if (width > maxW) { gap = maxW / Math.max(1, n - 1); width = maxW; }
      var z0 = -width * 0.5;
      for (i = 0; i < n; i++) {
        var uu = b[i];
        var wedgeBack = f.wedge > 0 ? Math.abs(i - (n - 1) * 0.5) * f.wedge : 0;
        uu.rank = r;
        uu.slotZ = clamp(z0 + i * gap, LANE_MIN + 1.0, LANE_MAX - 1.0);
        uu.slotX = army.anchorX - army.team * (r * f.rankGap + wedgeBack);
        uu.slotOk = true;
      }
    }
    army.formDirty = false;
    army.formT = 0;
  }

  function byId(a, b) { return a.id - b.id; }

  /* =========================================================================
   * 16. STANCES
   * -------------------------------------------------------------------------
   *  The old build's cardinal sin: Defend was strictly better, so "stance"
   *  was decoration. Here every stance pays for its upside in a currency the
   *  player feels — gold, damage, or ground.
   * ====================================================================== */
  var STANCES = {
    defend: {
      name: 'Defend',
      armorMul: 1.25,        // on top of the formation bonus
      formMul: 1.50,         // formations are worth 50% more while dug in
      dmgMul: 0.92,
      takenMul: 1.00,
      speedMul: 0.85,
      goldMul: 0.65,         // <- the cost: you starve your economy
      advance: -1,           // hold the line in front of your own fort
      turretMul: 2.10,       // fort guns get full crews
      desc: 'Armour +25%, formation bonus +50%, fort turrets doubled. Kill gold -35%.'
    },
    march: {
      name: 'March',
      armorMul: 1.06,
      formMul: 1.00,
      dmgMul: 1.00,
      takenMul: 1.00,
      speedMul: 1.00,
      goldMul: 1.40,         // <- the payoff: taking ground pays
      advance: 1,
      turretMul: 1.00,
      desc: 'Advance in formation. Kill gold +40%. The economic stance.'
    },
    attack: {
      name: 'Attack',
      armorMul: 1.00,
      formMul: 0.00,         // <- no formation bonus at all
      dmgMul: 1.22,
      takenMul: 1.10,
      speedMul: 1.16,
      goldMul: 1.10,
      advance: 2,
      turretMul: 0.70,
      desc: 'Damage +22%, speed +16%. No formation bonus, take 10% more.'
    },
    retreat: {
      name: 'Retreat',
      armorMul: 1.10,
      formMul: 0.35,
      dmgMul: 0.70,
      takenMul: 0.90,
      speedMul: 1.45,
      goldMul: 0.80,
      advance: -2,
      turretMul: 1.60,
      desc: 'Fall back fast under turret cover and heal at the fort. Damage -30%.'
    }
  };
  var STANCE_LIST = ['defend', 'march', 'attack', 'retreat'];

  /* =========================================================================
   * 17. ARMY STATE
   * ====================================================================== */
  function newArmy(team) {
    return {
      team: team,
      stance: team === 1 ? 'march' : 'march',
      formation: 'line',
      anchorX: SPAWN_X[team],
      anchorTarget: SPAWN_X[team],
      frontX: SPAWN_X[team],

      armorMul: 1, stanceFormMul: 1, dmgMul: 1, takenMul: 1,
      speedMul: 1, goldMul: 1, turretMul: 1, advance: 1,

      charge: { defender: 0, assault: 0, ranged: 0, specialist: 0, champion: 0 },
      formDirty: true, formT: 0,

      queue: [], trainT: 0,
      uniqueAlive: Object.create(null),

      kills: 0, losses: 0,
      powerRaw: 0, power: 0, powerReady: false,
      lastStand: false,

      /* composition census, refreshed each second — no allocation */
      census: { defender: 0, assault: 0, ranged: 0, specialist: 0, champion: 0, boss: 0, total: 0, cost: 0 },

      turretT: 0
    };
  }

  var armies = { 1: newArmy(1), '-1': newArmy(-1) };

  function applyStance(army) {
    var s = STANCES[army.stance] || STANCES.march;
    army.armorMul = s.armorMul;
    army.stanceFormMul = s.formMul;
    army.dmgMul = s.dmgMul;
    army.takenMul = s.takenMul;
    army.speedMul = s.speedMul;
    army.goldMul = s.goldMul;
    army.turretMul = s.turretMul;
    army.advance = s.advance;
  }
  applyStance(armies[1]); applyStance(armies[-1]);

  function setStance(team, stance) {
    var army = armies[team];
    if (!army) { return false; }
    if (!STANCES[stance]) { return false; }
    if (army.stance === stance) { return true; }
    army.stance = stance;
    applyStance(army);
    army.formDirty = true;
    if (team === 1) {
      C.setStance(stance);
      toast(STANCES[stance].name + ' — ' + STANCES[stance].desc, 'stance');
    }
    C.emit('sim:stance', army);
    return true;
  }

  function setFormation(team, formation) {
    var army = armies[team];
    if (!army || !FORMATIONS[formation]) { return false; }
    if (army.formation === formation) { return true; }
    army.formation = formation;
    army.formDirty = true;
    if (team === 1) { toast(FORMATIONS[formation].name + ' formation', 'stance'); }
    C.emit('sim:formation', army);
    return true;
  }

  /** Per-class charge order: that class breaks ranks and commits. */
  function chargeOrder(team, cls, seconds) {
    var army = armies[team];
    if (!army || army.charge[cls] === undefined) { return false; }
    var dur = seconds > 0 ? seconds : 6;
    army.charge[cls] = dur;
    var list = alive[team], i;
    for (i = 0; i < list.length; i++) {
      if (list[i].cls === cls) { list[i].chargeT = dur; list[i].formed = 0; }
    }
    if (team === 1) { toast(cls.toUpperCase() + ' — CHARGE!', 'order'); }
    shake(0.14);
    C.emit('sim:charge', army);
    return true;
  }

  /* =========================================================================
   * 18. SPAWNING
   * ====================================================================== */
  var MAX_PER_TEAM = 130;

  function countTeam(team) { return alive[team].length; }

  function spawn(typeId, team, opts) {
    var def = (typeof typeId === 'string') ? TYPES[typeId] : typeId;
    // A malformed def (wrong arg order, stale id) used to sail through here and
    // produce a unit with undefined x/z/hp — NaN poison that silently corrupts
    // steering, targeting and the renderer. Reject anything that isn't a real
    // unit definition.
    if (!def || typeof def !== 'object' || !def.id || typeof def.hp !== 'number') {
      warn('spawn:type', 'invalid unit type ' + JSON.stringify(typeId) +
           ' — expected spawn(typeId, team, opts). Spawn ignored.');
      return null;
    }
    if (team !== 1 && team !== -1) { team = 1; }
    if (countTeam(team) >= MAX_PER_TEAM && !def.boss) { return null; }

    var army = armies[team];
    if (def.unique && army.uniqueAlive[def.id]) { return null; }

    var u = unitPool.get();
    u.id = C.nextId();
    u.team = team;
    u.cls = def.cls;
    u.def = def;
    u.type = def.id;
    u.name = def.name;
    u.mode = def.mode;
    u.era = def.era;

    u.maxHp = def.hp;
    u.hp = def.hp;
    u.armor = def.armor;
    u.shieldMax = def.shield;
    u.shield = def.shield;
    u.shieldBroken = false;
    u.shieldRegenT = 0;

    u.mass = def.mass;
    u.radius = def.radius;
    u.speed = def.speed;
    u.maxAttackers = def.maxAttackers;

    u.x = (opts && typeof opts.x === 'number') ? opts.x : SPAWN_X[team];
    u.z = (opts && typeof opts.z === 'number') ? opts.z : C.rngRange(LANE_MIN + 3, LANE_MAX - 3);
    u.y = 0; u.vx = 0; u.vz = 0; u.vy = 0; u.kx = 0; u.kz = 0; u.mvx = 0; u.mvz = 0;
    u.face = team;

    u.state = 'idle';
    u.anim.t = C.rngRange(0, 4); u.anim.phase = 0; u.anim.speed = 1;
    u.target = null; u.dead = false; u.ragdoll = null;

    u.atkPhase = 'idle'; u.atkT = 0; u.cd = 0;
    u.retargetT = C.rngRange(0, 0.3);
    u.hitStop = 0; u.stunT = 0; u.hurtT = 0; u.chargeT = 0;
    u.buffT = 0; u.buffDmg = 1; u.buffSpd = 1;
    u.slotOk = false; u.formed = 0; u.rank = classRank(def.cls);
    u.attackers = 0; u.aimUnit = null; u.siegeMode = false;
    u.abilityCd = def.ability ? def.ability.cd * C.rngRange(0.35, 0.9) : 0;
    u.abilityT = 0;
    u.abilityKind = def.ability ? def.ability.kind : null;
    u.ultKind = def.ult || null;
    u.leapT = 0;
    u.boss = !!def.boss; u.bossPhase = 0; u.kit = def.kit || null;
    u.tellT = 0; u.tellKind = null; u.weakOpen = 0;
    u.elite = (opts && opts.elite) ? opts.elite : 0;
    u.militia = !!(opts && opts.militia);
    u.deathT = 0; u.killer = null; u.age = 0; u.spawnT = 0;
    u.jitter = C.rngRange(0, 1);
    u.lastHitT = 99; u.dmgTaken = 0; u.kills = 0;

    if (u.elite > 0) {
      var m = 1 + 0.25 * u.elite;
      u.maxHp *= m; u.hp = u.maxHp; u.armor *= m; u.shieldMax *= m; u.shield = u.shieldMax;
    }
    if (u.militia) {
      u.maxHp *= 0.7; u.hp = u.maxHp;
    }

    if (def.unique) { army.uniqueAlive[def.id] = 1; }
    army.formDirty = true;

    units.push(u);
    evSpawn.unit = u;
    emit('unit:spawn', evSpawn);
    if (u.boss) {
      evBoss.boss = u;
      emit('boss:spawn', evBoss);
      toast(def.name + ' has entered the field', 'boss');
    }
    return u;
  }

  /**
   * Player-facing purchase. Spends gold and puts the unit in the training
   * queue so spam-tapping cannot outrun the barracks.
   */
  function requestSpawn(clsOrId, team) {
    team = (team === -1) ? -1 : 1;
    var def = TYPES[clsOrId] || typeFor(clsOrId, state.eraIndex);
    if (!def) { return false; }
    var army = armies[team];
    if (def.unique && (army.uniqueAlive[def.id] || hasQueued(army, def))) {
      if (team === 1) { toast('Only one ' + def.name + ' at a time', 'warn'); }
      return false;
    }
    if (countTeam(team) + army.queue.length >= MAX_PER_TEAM) {
      if (team === 1) { toast('Army is at full strength', 'warn'); }
      return false;
    }
    if (team === 1) {
      if (!C.spendGold(def.cost, 'unit:' + def.id)) {
        toast('Not enough gold (' + def.cost + ')', 'warn');
        return false;
      }
    }
    army.queue.push(def);
    C.emit('sim:queue', army);
    return true;
  }

  function hasQueued(army, def) {
    for (var i = 0; i < army.queue.length; i++) { if (army.queue[i] === def) { return true; } }
    return false;
  }

  function stepQueue(army, dt) {
    if (army.queue.length === 0) { army.trainT = 0; return; }
    army.trainT -= dt;
    if (army.trainT > 0) { return; }
    var def = army.queue.shift();
    var trainMul = (army.stance === 'defend') ? 0.85 : 1;
    army.trainT = def.train * trainMul;
    spawn(def, army.team, null);
    C.emit('sim:queue', army);
  }

  /* =========================================================================
   * 19. FORTS + TURRETS
   * ====================================================================== */
  var FORT_HALF = 11;
  var FORT_BASE_HP = 5200;

  /** Returns the team whose fort occupies x, or 0. `attacker` filters own fort. */
  function fortAt(x, attackerTeam) {
    if (x <= FORT_X[1] + FORT_HALF && attackerTeam !== 1) { return 1; }
    if (x >= FORT_X[-1] - FORT_HALF && attackerTeam !== -1) { return -1; }
    return 0;
  }

  function fortReach(u) {
    var enemy = -u.team;
    var fx = FORT_X[enemy];
    var d = Math.abs(u.x - fx) - FORT_HALF;
    return d <= u.def.range + u.radius;
  }

  function damageFort(team, dmg, src) {
    var f = state.forts[team];
    if (!f || f.hp <= 0 || !(dmg > 0)) { return 0; }
    var army = armies[team];
    if (army && army.stance === 'defend') { dmg *= 0.82; }
    f.hp -= dmg;
    if (f.hp < 0) { f.hp = 0; }
    if (army) { army.powerRaw += dmg * 0.55; }

    evFortHit.team = team; evFortHit.dmg = dmg; evFortHit.hp = f.hp; evFortHit.max = f.max;
    emit('fort:hit', evFortHit);
    pushFx('forthit', FORT_X[team] + (team === 1 ? FORT_HALF : -FORT_HALF), 3.0,
           C.rngRange(LANE_MIN * 0.4, LANE_MAX * 0.4), -team, 0.3, 0, dmg, team, 0.4);

    if (f.hp <= 0) { destroyFort(team); }
    return dmg;
  }

  var _fortDown = { 1: false, '-1': false };
  function destroyFort(team) {
    if (_fortDown[team]) { return; }
    _fortDown[team] = true;
    evFortDes.team = team;
    emit('fort:destroyed', evFortDes);
    pushFx('fortdestroy', FORT_X[team], 4, 0, 0, 1, 0, 1, team, 2.0);
    shake(1.0);
    director.running = false;
    C.gameOver(team === -1 ? 'victory' : 'defeat');
  }

  function setFortTier(team, tier) {
    var f = state.forts[team];
    if (!f) { return false; }
    tier = clamp(tier | 0, 0, 8);
    var ratio = f.max > 0 ? f.hp / f.max : 1;
    f.tier = tier;
    f.max = Math.round(FORT_BASE_HP * Math.pow(1.42, tier) * Math.pow(ERA_K, state.eraIndex));
    f.hp = Math.max(1, Math.round(f.max * ratio));
    evFortTier.team = team; evFortTier.tier = tier;
    emit('fort:tier', evFortTier);
    return true;
  }

  /* --- turrets: the mechanical payoff for the Defend stance ---------------- */
  var _turretCtx = { team: 0, x: 0, best: null, bestD: 0 };
  function visitTurret(v, ctx) {
    if (!v || v.dead || v.team === ctx.team) { return; }
    var d = Math.abs(v.x - ctx.x);
    if (ctx.best === null || d < ctx.bestD) { ctx.best = v; ctx.bestD = d; }
  }

  function stepTurrets(army, dt) {
    var f = state.forts[army.team];
    if (!f || f.hp <= 0) { return; }
    var tier = f.tier | 0;
    var guns = 1 + Math.floor(tier * 0.5);
    var rate = 1.9 / (army.turretMul * (1 + tier * 0.12));
    army.turretT -= dt;
    if (army.turretT > 0) { return; }
    army.turretT = rate;

    var reach = 50 + tier * 6;
    var ox = FORT_X[army.team] + army.team * FORT_HALF;
    _turretCtx.team = army.team; _turretCtx.x = ox;
    _turretCtx.best = null; _turretCtx.bestD = 0;
    forEachNear(ox + army.team * reach * 0.5, 0, reach * 0.6, visitTurret, _turretCtx);
    var t = _turretCtx.best;
    if (!t || Math.abs(t.x - ox) > reach) { return; }

    var dmg = 24 * Math.pow(ERA_K, state.eraIndex) * (1 + tier * 0.22);
    var i;
    for (i = 0; i < guns; i++) {
      fireBolt(army.team, ox, 6.5 + i * 1.6, C.rngRange(-5, 5),
               t.x + t.vx * 0.4, t.z, dmg, DMG_PIERCE, 40, tier >= 3 ? 2.4 : 0);
    }
    pushFx('turret', ox, 6.5, 0, -army.team, 0, 0, guns, army.team, 0.25);
  }

  /* =========================================================================
   * 20. SPECIALIST ABILITIES
   * ====================================================================== */
  var _healCtx = { u: null, r2: 0, left: 0, amount: 0 };
  function visitHeal(v, ctx) {
    var u = ctx.u;
    if (!v || v.dead || v.team !== u.team || v === u) { return; }
    if (v.hp >= v.maxHp) { return; }
    if (ctx.left <= 0) { return; }
    var dx = v.x - u.x, dz = v.z - u.z;
    if (dx * dx + dz * dz > ctx.r2) { return; }
    var amt = v.maxHp * ctx.amount;
    v.hp = Math.min(v.maxHp, v.hp + amt);
    /* a heal also props a broken shield back up — support that feels alive */
    if (v.shieldMax > 0 && v.shield < v.shieldMax) {
      v.shield = Math.min(v.shieldMax, v.shield + v.shieldMax * 0.22);
      if (v.shield > 0) { v.shieldBroken = false; }
    }
    ctx.left--;
    pushFx('heal', v.x, 1.4, v.z, 0, 1, 0, amt, v.team, 0.5);
  }

  var _buffCtx = { u: null, r2: 0, dmgMul: 1, spdMul: 1, dur: 0 };
  function visitBuff(v, ctx) {
    var u = ctx.u;
    if (!v || v.dead || v.team !== u.team) { return; }
    var dx = v.x - u.x, dz = v.z - u.z;
    if (dx * dx + dz * dz > ctx.r2) { return; }
    if (ctx.dmgMul > v.buffDmg || v.buffT < ctx.dur * 0.5) {
      v.buffDmg = Math.max(v.buffDmg, ctx.dmgMul);
      v.buffSpd = Math.max(v.buffSpd, ctx.spdMul);
      v.buffT = Math.max(v.buffT, ctx.dur);
    }
  }

  function stepSpecialist(u, dt) {
    var ab = u.def.ability;
    if (!ab) { return; }
    u.abilityCd -= dt;
    if (u.abilityCd > 0) { return; }
    u.abilityCd = ab.cd;

    if (ab.kind === 'heal') {
      _healCtx.u = u; _healCtx.r2 = ab.radius * ab.radius;
      _healCtx.left = ab.targets; _healCtx.amount = ab.amount;
      forEachNear(u.x, u.z, ab.radius, visitHeal, _healCtx);
      pushFx('healpulse', u.x, 1.2, u.z, 0, 0, 0, ab.radius, u.team, 0.55);
    } else if (ab.kind === 'buff') {
      _buffCtx.u = u; _buffCtx.r2 = ab.radius * ab.radius;
      _buffCtx.dmgMul = ab.dmgMul; _buffCtx.spdMul = ab.speedMul; _buffCtx.dur = ab.dur;
      forEachNear(u.x, u.z, ab.radius, visitBuff, _buffCtx);
      pushFx('buffpulse', u.x, 1.2, u.z, 0, 0, 0, ab.radius, u.team, 0.4);
    } else if (ab.kind === 'trap') {
      plantMine(u);
    }
  }

  /* =========================================================================
   * 21. CHAMPION — active ability + ultimate on death
   * ====================================================================== */
  var _rallyCtx = { u: null, r2: 0, dmgMul: 1, spdMul: 1, dur: 0, shield: 0, armor: 0 };
  function visitRally(v, ctx) {
    var u = ctx.u;
    if (!v || v.dead || v.team !== u.team) { return; }
    var dx = v.x - u.x, dz = v.z - u.z;
    if (dx * dx + dz * dz > ctx.r2) { return; }
    if (ctx.dmgMul > 1) {
      v.buffDmg = Math.max(v.buffDmg, ctx.dmgMul);
      v.buffSpd = Math.max(v.buffSpd, ctx.spdMul);
      v.buffT = Math.max(v.buffT, ctx.dur);
    }
    if (ctx.shield > 0 && v.shieldMax > 0) {
      v.shield = Math.min(v.shieldMax, v.shield + v.shieldMax * ctx.shield);
      if (v.shield > 0) { v.shieldBroken = false; }
    }
    pushFx('rally', v.x, 1.5, v.z, 0, 1, 0, 1, v.team, 0.45);
  }

  var _clusterCtx = { team: 0, x: 0, z: 0, r2: 0, n: 0, sx: 0, sz: 0 };
  function visitCluster(v, ctx) {
    if (!v || v.dead || v.team === ctx.team) { return; }
    var dx = v.x - ctx.x, dz = v.z - ctx.z;
    if (dx * dx + dz * dz > ctx.r2) { return; }
    ctx.n++; ctx.sx += v.x; ctx.sz += v.z;
  }

  /** Centre of mass of enemies near a point. Returns count; result in ctx. */
  function enemyCluster(team, x, z, r) {
    _clusterCtx.team = team; _clusterCtx.x = x; _clusterCtx.z = z;
    _clusterCtx.r2 = r * r; _clusterCtx.n = 0; _clusterCtx.sx = 0; _clusterCtx.sz = 0;
    forEachNear(x, z, r, visitCluster, _clusterCtx);
    if (_clusterCtx.n > 0) { _clusterCtx.sx /= _clusterCtx.n; _clusterCtx.sz /= _clusterCtx.n; }
    return _clusterCtx.n;
  }

  function championAbility(u) {
    var k = u.abilityKind;
    var d = u.def;
    var pow = d.dmg;

    if (k === 'stomp') {
      splashDamage(u, u.x + u.face * 2, u.z, 7.0, pow * 0.95, DMG_BLUNT, false);
      var l = alive[-u.team], i;
      for (i = 0; i < l.length; i++) {
        var e = l[i];
        if (Math.abs(e.x - u.x) < 7 && Math.abs(e.z - u.z) < 7) { e.stunT = Math.max(e.stunT, 0.65); }
      }
      pushFx('shockwave', u.x, 0.2, u.z, u.face, 0, 0, 7, u.team, 0.6);
      shake(0.42);
    } else if (k === 'whirlwind') {
      u.abilityT = 1.25;   // multi-hit handled in stepChampion
      pushFx('whirl', u.x, 1.0, u.z, u.face, 0, 0, 4.5, u.team, 1.25);
    } else if (k === 'rally' || k === 'shieldaura') {
      _rallyCtx.u = u;
      var r = (k === 'rally') ? 20 : 14;
      _rallyCtx.r2 = r * r;
      _rallyCtx.dmgMul = (k === 'rally') ? 1.35 : 1.0;
      _rallyCtx.spdMul = (k === 'rally') ? 1.20 : 1.0;
      _rallyCtx.dur = (k === 'rally') ? 6 : 0;
      _rallyCtx.shield = (k === 'shieldaura') ? 0.45 : 0;
      forEachNear(u.x, u.z, r, visitRally, _rallyCtx);
      pushFx(k, u.x, 1.6, u.z, 0, 1, 0, r, u.team, 0.7);
      shake(0.18);
    } else if (k === 'barrage') {
      var n = enemyCluster(u.team, u.x + u.face * 20, u.z, 22);
      var tx = n > 0 ? _clusterCtx.sx : u.x + u.face * 20;
      var tz = n > 0 ? _clusterCtx.sz : u.z;
      var j;
      for (j = 0; j < 5; j++) {
        fireBolt(u.team, u.x, 2.2, u.z,
                 tx + C.rngRange(-4, 4), tz + C.rngRange(-4, 4),
                 pow * 0.62, DMG_BLUNT, 30, 3.4);
      }
      pushFx('barrage', u.x, 2.2, u.z, u.face, 0, 0, 5, u.team, 0.5);
      shake(0.2);
    } else if (k === 'leap') {
      var cn = enemyCluster(u.team, u.x + u.face * 16, u.z, 20);
      u.leapX = cn > 0 ? _clusterCtx.sx : u.x + u.face * 14;
      u.leapZ = cn > 0 ? _clusterCtx.sz : u.z;
      u.leapFrom = u.x; u.leapFromZ = u.z;
      u.leapT = 0.85;
      u.state = 'run';
      pushFx('leap', u.x, 0.5, u.z, u.face, 1, 0, 1, u.team, 0.4);
    }
  }

  function stepChampion(u, dt) {
    /* leap arc */
    if (u.leapT > 0) {
      u.leapT -= dt;
      var t = 1 - clamp01(u.leapT / 0.85);
      u.x = lerp(u.leapFrom, u.leapX, t);
      u.z = lerp(u.leapFromZ, u.leapZ, t);
      u.y = Math.sin(t * Math.PI) * 4.2;
      if (u.leapT <= 0) {
        u.y = 0;
        splashDamage(u, u.x, u.z, 6.5, u.def.dmg * 1.15, DMG_BLUNT, false);
        pushFx('shockwave', u.x, 0.2, u.z, u.face, 0, 0, 6.5, u.team, 0.6);
        shake(0.45);
      }
      return true;   // busy
    }

    /* whirlwind ticks */
    if (u.abilityT > 0) {
      var prev = u.abilityT;
      u.abilityT -= dt;
      var tickA = Math.ceil(prev / 0.31), tickB = Math.ceil(u.abilityT / 0.31);
      if (tickB < tickA) {
        splashDamage(u, u.x, u.z, 4.5, u.def.dmg * 0.52, u.def.dmgType, false);
        shake(0.12);
      }
      u.state = 'attack';
      return true;
    }

    u.abilityCd -= dt;
    if (u.abilityCd <= 0 && u.target && !u.target.dead) {
      var dx = u.target.x - u.x, dz = u.target.z - u.z;
      var want = (u.abilityKind === 'barrage' || u.abilityKind === 'leap') ? 26 : 9;
      if (dx * dx + dz * dz < want * want || u.abilityKind === 'rally' || u.abilityKind === 'shieldaura') {
        u.abilityCd = (u.def.ability ? u.def.ability.cd : 9);
        evTell.unit = u; evTell.ability = u.abilityKind; evTell.time = 0;
        C.emit('sim:ability', evTell);
        championAbility(u);
        return true;
      }
    }
    return false;
  }

  function championUltimate(u) {
    var k = u.ultKind;
    if (k === 'deathblast') {
      splashDamage(u, u.x, u.z, 9.0, u.def.dmg * 2.1, DMG_BLUNT, false);
      pushFx('explosion', u.x, 1.0, u.z, 0, 1, 0, 9, u.team, 0.9);
      shake(0.7);
      toast(u.name + ' detonates!', 'ult');
    } else if (k === 'lastrally') {
      _rallyCtx.u = u; _rallyCtx.r2 = 32 * 32;
      _rallyCtx.dmgMul = 1.5; _rallyCtx.spdMul = 1.25; _rallyCtx.dur = 8; _rallyCtx.shield = 0.5;
      forEachNear(u.x, u.z, 32, visitRally, _rallyCtx);
      pushFx('rally', u.x, 2.0, u.z, 0, 1, 0, 32, u.team, 1.2);
      shake(0.4);
      toast(u.name + ' falls — the army roars!', 'ult');
    } else if (k === 'martyr') {
      var def = typeFor('assault', Math.max(0, u.era - 1));
      var i;
      for (i = 0; i < 4; i++) {
        spawn(def, u.team, { x: u.x + C.rngRange(-3, 3), z: u.z + C.rngRange(-3, 3), militia: true });
      }
      pushFx('summon', u.x, 0.6, u.z, 0, 1, 0, 4, u.team, 0.8);
      toast(u.name + '’s honour guard answers', 'ult');
    }
    C.emit('sim:ultimate', u);
  }

  /* =========================================================================
   * 22. BOSS ENCOUNTERS — telegraph, weak point, phases
   * ====================================================================== */
  var BOSS_TELL = { slam: 1.35, sweep: 1.10, summon: 1.55, barrage: 1.20, charge: 1.45 };

  function bossPhaseFor(u) {
    var r = u.hp / u.maxHp;
    if (r <= 0.33) { return 2; }
    if (r <= 0.66) { return 1; }
    return 0;
  }

  function stepBoss(u, dt) {
    /* --- phase transitions --- */
    var ph = bossPhaseFor(u);
    if (ph > u.bossPhase) {
      u.bossPhase = ph;
      u.armor = u.def.armor * (1 + ph * 0.12);
      u.buffSpd = 1 + ph * 0.18;
      u.weakOpen = 3.0;                       // the core is exposed on transition
      u.abilityCd = 0.6;
      evPhase.n = ph + 1; evPhase.boss = u;
      emit('boss:phase', evPhase);
      toast(u.name + ' — phase ' + (ph + 1) + '. Strike the core!', 'boss');
      pushFx('bossphase', u.x, 2.4, u.z, 0, 1, 0, ph + 1, u.team, 1.2);
      shake(0.6);
    }

    if (u.weakOpen > 0) {
      u.weakOpen -= dt;
      if (u.weakOpen <= 0) { u.weakOpen = 0; }
      else if (((u.weakOpen * 8) | 0) % 2 === 0) {
        pushFx('weakpoint', u.x - u.face * u.radius, 2.0, u.z, -u.face, 0, 0, 1, u.team, 0.12);
      }
    }

    /* --- telegraphed ability --- */
    if (u.tellT > 0) {
      u.tellT -= dt;
      u.state = 'block';   // wind-up pose; readable at a glance
      if (u.tellT <= 0) {
        bossExecute(u, u.tellKind);
        u.tellKind = null;
        u.abilityCd = 5.4 - u.bossPhase * 1.1;
      }
      return true;
    }

    u.abilityCd -= dt;
    if (u.abilityCd <= 0 && u.kit && u.kit.length) {
      var k = u.kit[C.rngInt(u.kit.length)];
      u.tellKind = k;
      u.tellT = BOSS_TELL[k] || 1.2;
      u.atkPhase = 'idle';
      evTell.unit = u; evTell.ability = k; evTell.time = u.tellT;
      C.emit('boss:telegraph', evTell);
      toast(u.name + ': ' + k.toUpperCase() + ' incoming', 'warn');
      pushFx('telegraph', u.x, 2.6, u.z, u.face, 0, 0, u.tellT, u.team, u.tellT);
      return true;
    }
    return false;
  }

  function bossExecute(u, k) {
    var pow = u.def.dmg;
    if (k === 'slam') {
      splashDamage(u, u.x + u.face * 3, u.z, 9.5, pow * 1.5, DMG_BLUNT, false);
      pushFx('shockwave', u.x + u.face * 3, 0.2, u.z, u.face, 0, 0, 9.5, u.team, 0.8);
      shake(0.75);
      u.weakOpen = Math.max(u.weakOpen, 1.6);   // over-committed: punish window
    } else if (k === 'sweep') {
      var l = alive[-u.team], i;
      for (i = 0; i < l.length; i++) {
        var e = l[i];
        var dx = (e.x - u.x) * u.face;
        if (dx > 0 && dx < 11 && Math.abs(e.z - u.z) < 6.5) {
          var o = resetDmgOpts(); o.knock = 14; o.ignoreShield = false;
          applyDamage(u, e, pow * 1.1, DMG_SLASH, o);
        }
      }
      pushFx('sweep', u.x, 1.6, u.z, u.face, 0, 0, 11, u.team, 0.5);
      shake(0.5);
      u.weakOpen = Math.max(u.weakOpen, 1.2);
    } else if (k === 'summon') {
      var d1 = typeFor('assault', u.era), j;
      for (j = 0; j < 4; j++) {
        spawn(d1, u.team, { x: u.x - u.face * C.rngRange(2, 6), z: u.z + C.rngRange(-5, 5) });
      }
      pushFx('summon', u.x, 0.6, u.z, 0, 1, 0, 4, u.team, 0.9);
      u.weakOpen = Math.max(u.weakOpen, 2.4);   // summoning leaves it wide open
    } else if (k === 'barrage') {
      var n = enemyCluster(u.team, u.x + u.face * 24, u.z, 26);
      var tx = n > 0 ? _clusterCtx.sx : u.x + u.face * 24;
      var tz = n > 0 ? _clusterCtx.sz : u.z;
      var m;
      for (m = 0; m < 7; m++) {
        fireBolt(u.team, u.x, 3.2, u.z, tx + C.rngRange(-6, 6), tz + C.rngRange(-6, 6),
                 pow * 0.55, DMG_BLUNT, 28, 3.6);
      }
      shake(0.35);
    } else if (k === 'charge') {
      u.kx += u.face * 26;
      u.chargeT = 1.6;
      splashDamage(u, u.x + u.face * 4, u.z, 5.0, pow * 0.9, DMG_BLUNT, false);
      shake(0.4);
    }
  }

  function onBossDeath(u) {
    toast(u.name + ' has fallen!', 'victory');
    shake(0.9);
    state.stats.bossesKilled++;
    pushFx('bossdeath', u.x, 2.0, u.z, 0, 1, 0, 1, u.team, 2.0);
    if (u.team === -1) {
      C.addGold(Math.round(400 * Math.pow(ERA_K, u.era)), 'boss');
      C.addGems(3, 'boss');
    }
  }

  /* =========================================================================
   * 23. TEMPO — the dead-time killer
   * -------------------------------------------------------------------------
   *  Armies double-time across empty ground and settle into a fighting pace as
   *  they close. The 352m battlefield stops being 40 seconds of watching backs
   *  of heads, and contact happens on a schedule the director can guarantee.
   * ====================================================================== */
  var TEMPO_FAR = 55, TEMPO_NEAR = 20, TEMPO_MAX = 4.4;

  function tempoMul(u, nearestGap) {
    var m = 1;
    if (nearestGap > TEMPO_NEAR) {
      var t = clamp01((nearestGap - TEMPO_NEAR) / (TEMPO_FAR - TEMPO_NEAR));
      m = 1 + (TEMPO_MAX - 1) * t * t;
    }
    /* The watchdog escalation applies at ANY range — a stalled line at 11m is
       exactly as much dead time as an empty field at 200m. */
    return m * director.tempoBoost;
  }

  /* =========================================================================
   * 24. UNIT STEP
   * ====================================================================== */
  function updateUnit(u, dt) {
    var def = u.def;
    var army = armies[u.team];

    /* ---- hit-stop: the frame where a hit actually lands ------------------ */
    if (u.hitStop > 0) {
      u.hitStop -= dt;
      u.kx *= 0.90; u.kz *= 0.90;
      integrate(u, dt);
      return;
    }

    u.age += dt;
    u.spawnT += dt;
    u.lastHitT += dt;
    if (u.cd > 0) { u.cd -= dt; }
    if (u.stunT > 0) { u.stunT -= dt; }
    if (u.hurtT > 0) { u.hurtT -= dt; }
    if (u.chargeT > 0) { u.chargeT -= dt; }
    if (u.buffT > 0) {
      u.buffT -= dt;
      if (u.buffT <= 0) { u.buffDmg = 1; u.buffSpd = 1; }
    }

    /* shields recover out of contact — retreat and shield-wall have a purpose */
    if (u.shieldMax > 0 && u.shield < u.shieldMax) {
      if (u.shieldRegenT > 0) { u.shieldRegenT -= dt; }
      else {
        u.shield = Math.min(u.shieldMax, u.shield + u.shieldMax * 0.16 * dt * (u.formed > 0 ? 1.8 : 1));
        if (u.shield > u.shieldMax * 0.25) { u.shieldBroken = false; }
      }
    }

    /* ---- retarget ------------------------------------------------------- */
    u.retargetT -= dt;
    if (u.retargetT <= 0 || !validTarget(u.target, u)) {
      acquireTarget(u);
      u.retargetT = 0.26 + u.jitter * 0.12;
    }

    /* ---- boss / champion scripted behaviour ----------------------------- */
    var busy = false;
    if (u.boss) { busy = stepBoss(u, dt); }
    else if (u.cls === 'champion') { busy = stepChampion(u, dt); }
    else if (u.cls === 'specialist') { stepSpecialist(u, dt); }

    if (u.stunT > 0) {
      u.state = 'hurt';
      u.mvx = 0; u.mvz = 0;
      integrate(u, dt);
      return;
    }
    if (busy) { u.mvx = 0; u.mvz = 0; integrate(u, dt); return; }

    /* ---- mid-swing? finish it ------------------------------------------- */
    if (stepAttack(u, dt)) {
      /* ranged units shuffle a little while reloading; melee are rooted */
      u.mvx = 0; u.mvz = 0;
      if (def.ranged && u.atkPhase === 'rec' && u.target) { kiteStep(u, def); }
      integrate(u, dt);
      return;
    }

    /* ---- decide where to be --------------------------------------------- */
    var t = u.target;
    var gap = t ? Math.abs(t.x - u.x) : 999;
    var mode = movementMode(u, army);

    if (t) { u.face = (t.x - u.x) >= 0 ? 1 : -1; u.siegeMode = false; }
    else { u.face = u.team; }

    if (t && inAttackRange(u, t) && u.atkPhase === 'idle' && u.cd <= 0) {
      if (!def.ranged || gap >= def.minRange - 0.5) {
        beginAttack(u);
        u.mvx = 0; u.mvz = 0;
        integrate(u, dt);
        return;
      }
    }

    var tx, tz, spd = def.speed * u.buffSpd * army.speedMul;

    if (mode === 'formation' && u.slotOk) {
      tx = u.slotX; tz = u.slotZ;
      var f = FORMATIONS[army.formation] || FORMATIONS.line;
      spd *= f.speed;
      /* an enemy inside reach outranks the parade ground */
      if (t && gap < def.range + 2.5) { tx = t.x - u.face * (def.range * 0.75); tz = t.z; }
    } else if (mode === 'retreat') {
      tx = FORT_X[u.team] + u.team * (16 + u.rank * 3);
      tz = u.slotOk ? u.slotZ : u.z;
      u.face = u.team;   // face the way you are running, not the enemy
    } else if (t) {
      if (def.ranged) {
        var want = clamp(def.range * 0.82, def.minRange + 1.5, def.range);
        var dirs = (t.x - u.x) >= 0 ? 1 : -1;
        tx = t.x - dirs * want;
        tz = t.z + (u.z - t.z) * 0.6;
      } else {
        tx = t.x; tz = t.z;
      }
    } else {
      tx = FORT_X[-u.team] - u.team * (FORT_HALF + def.range * 0.6);
      tz = u.slotOk ? u.slotZ : u.z;
    }

    /* double-time across empty ground */
    var nearestGap = t ? gap : Math.abs(tx - u.x);
    spd *= tempoMul(u, nearestGap);
    if (u.chargeT > 0 && (!t || gap > 3)) { spd *= def.sprint; }
    if (u.chargeT > 0) { spd *= 1.18; }

    /* fort assault: nothing left to fight, so break the gate */
    if (!t && fortReach(u)) {
      u.face = -u.team;
      if (u.atkPhase === 'idle' && u.cd <= 0) {
        u.atkPhase = 'wind'; u.atkT = def.wind / u.buffSpd; u.state = 'attack';
        u.siegeMode = true;
        evAttack.unit = u; evAttack.target = null; evAttack.weapon = 'siege';
        emit('unit:attack', evAttack);
      }
      u.mvx = 0; u.mvz = 0;
      integrate(u, dt);
      return;
    }

    steerTo(u, tx, tz, spd, dt);
    integrate(u, dt);
  }

  /** Ranged units drift backwards while reloading if something is too close. */
  function kiteStep(u, def) {
    var t = u.target;
    if (!t) { return; }
    var dx = t.x - u.x, dz = t.z - u.z;
    var d2 = dx * dx + dz * dz;
    var mr = def.minRange > 0 ? def.minRange : 5;
    if (d2 > mr * mr) { return; }
    var d = Math.sqrt(d2) || 1;
    var s = def.speed * def.kite;
    u.mvx = -dx / d * s;
    u.mvz = -dz / d * s;
    u.state = 'walk';
  }

  function movementMode(u, army) {
    if (u.boss) { return 'free'; }
    if (army.stance === 'retreat') { return 'retreat'; }
    if (u.chargeT > 0) { return 'free'; }
    if (army.stance === 'attack') { return 'free'; }
    return 'formation';
  }

  function steerTo(u, tx, tz, spd, dt) {
    var dx = tx - u.x, dz = tz - u.z;
    var d2 = dx * dx + dz * dz;
    var stop = 0.45;
    if (d2 <= stop * stop) {
      u.mvx = 0; u.mvz = 0;
      u.state = (u.atkPhase === 'idle') ? 'idle' : u.state;
      return;
    }
    var d = Math.sqrt(d2);
    /* ease into the last metre so nobody snaps to a slot */
    var s = spd * clamp01(d / 1.6);
    u.mvx = dx / d * s;
    u.mvz = dz / d * s;
    u.state = (s > u.def.speed * 1.25) ? 'run' : 'walk';
  }

  /* ---- integration: movement + knockback + gravity ------------------------ */
  function integrate(u, dt) {
    /* knockback decays exponentially; mass makes bosses immovable */
    var decay = Math.exp(-6.5 * dt);
    u.kx *= decay; u.kz *= decay;
    if (Math.abs(u.kx) < 0.02) { u.kx = 0; }
    if (Math.abs(u.kz) < 0.02) { u.kz = 0; }

    u.vx = u.mvx + u.kx;
    u.vz = u.mvz + u.kz;

    u.x += u.vx * dt;
    u.z += u.vz * dt;

    if (u.y > 0 || u.vy !== 0) {
      u.vy -= GRAV * dt;
      u.y += u.vy * dt;
      if (u.y <= 0) { u.y = 0; u.vy = 0; }
    }

    if (u.x < EDGE_PAD) { u.x = EDGE_PAD; if (u.kx < 0) { u.kx = 0; } }
    if (u.x > W - EDGE_PAD) { u.x = W - EDGE_PAD; if (u.kx > 0) { u.kx = 0; } }
    if (u.z < LANE_MIN + 0.6) { u.z = LANE_MIN + 0.6; if (u.kz < 0) { u.kz = 0; } }
    if (u.z > LANE_MAX - 0.6) { u.z = LANE_MAX - 0.6; if (u.kz > 0) { u.kz = 0; } }

    /* animation clock, driven by actual movement so nothing foot-slides */
    var spd = Math.sqrt(u.vx * u.vx + u.vz * u.vz);
    u.anim.speed = (u.state === 'walk' || u.state === 'run') ? clamp(spd / 3.2, 0.35, 2.4) : 1;
    u.anim.t += dt * u.anim.speed;

    /* formation cohesion: 1 when in your slot, 0 when you have left the line */
    if (u.slotOk && u.chargeT <= 0) {
      var dx = u.x - u.slotX, dz = u.z - u.slotZ;
      var dd = Math.sqrt(dx * dx + dz * dz);
      var want = dd < 3.2 ? 1 : (dd < 6.5 ? 1 - (dd - 3.2) / 3.3 : 0);
      u.formed += (want - u.formed) * clamp01(dt * 4);
    } else {
      u.formed += (0 - u.formed) * clamp01(dt * 6);
    }
  }

  /* ---- corpses ------------------------------------------------------------ */
  function updateCorpse(u, dt) {
    u.deathT += dt;
    var r = u.ragdoll;
    if (r) {
      r.t += dt;
      r.vy -= GRAV * dt;
      u.x += r.vx * dt;
      u.z += r.vz * dt;
      u.y += r.vy * dt;
      if (u.y <= 0) {
        u.y = 0;
        if (r.vy < -1) { r.vy *= -0.28; } else { r.vy = 0; }
        r.vx *= 0.72; r.vz *= 0.72; r.spin *= 0.7;
      }
      u.x = clamp(u.x, EDGE_PAD, W - EDGE_PAD);
      u.z = clamp(u.z, LANE_MIN + 0.6, LANE_MAX - 0.6);
    }
    u.vx = 0; u.vz = 0;
    u.anim.t += dt;
  }

  /* =========================================================================
   * 25. PHYSICS — separation and mass-based shoving
   * -------------------------------------------------------------------------
   *  Two relaxation passes over the spatial hash. Heavier units win the push,
   *  which is why a boss walks through a crowd and a skirmisher gets shoved
   *  out of the way. No unit ever occupies another unit's space.
   * ====================================================================== */
  var SEP_ITER = 2;

  function separate() {
    var pass, ci, b, i, j, n, a, c;
    for (pass = 0; pass < SEP_ITER; pass++) {
      for (ci = 0; ci < grid.length; ci++) {
        b = grid[ci];
        n = b.length;
        if (n < 2) { continue; }
        for (i = 0; i < n - 1; i++) {
          a = b[i];
          for (j = i + 1; j < n; j++) {
            c = b[j];
            resolvePair(a, c);
          }
        }
      }
      /* cross-cell: only against the +x neighbour so each pair is seen once */
      for (ci = 0; ci < grid.length; ci++) {
        b = grid[ci];
        if (b.length === 0) { continue; }
        if ((ci % GX) === GX - 1) { continue; }
        var nb = grid[ci + 1];
        if (nb.length === 0) { continue; }
        for (i = 0; i < b.length; i++) {
          a = b[i];
          for (j = 0; j < nb.length; j++) { resolvePair(a, nb[j]); }
        }
      }
    }
  }

  function resolvePair(a, c) {
    if (a === c) { return; }
    var dx = c.x - a.x, dz = c.z - a.z;
    var r = a.radius + c.radius;
    var d2 = dx * dx + dz * dz;
    if (d2 >= r * r || d2 < 0.000001) {
      if (d2 < 0.000001) { c.x += 0.05; c.z += 0.05; }
      return;
    }
    var d = Math.sqrt(d2);
    var overlap = (r - d);
    var nx = dx / d, nz = dz / d;

    var ma = a.mass, mc = c.mass;
    var total = ma + mc;
    var wa = mc / total, wc = ma / total;

    /* enemies press harder into each other than allies do — lines stay lines */
    var press = (a.team === c.team) ? 0.5 : 0.62;
    var push = overlap * press;

    a.x -= nx * push * wa; a.z -= nz * push * wa;
    c.x += nx * push * wc; c.z += nz * push * wc;

    /* a heavy unit moving forward shoves lighter ones aside with real force */
    if (a.team !== c.team) {
      var relv = (a.vx - c.vx) * nx;
      if (relv > 1.5) {
        var shove = clamp((relv - 1.5) * 0.06, 0, 0.9);
        if (ma > mc * 1.4) { c.kx += nx * shove * (ma / mc); c.kz += nz * shove * 0.4; }
        else if (mc > ma * 1.4) { a.kx -= nx * shove * (mc / ma); a.kz -= nz * shove * 0.4; }
      }
    }
  }

  /* =========================================================================
   * 26. COMEBACK LEVERS + POWERS
   * -------------------------------------------------------------------------
   *  Deterministic, visible, and earned. The power meter fills from damage you
   *  TAKE, so a losing fight hands you a tool instead of silently buffing your
   *  units behind your back. No rubber-banding: the enemy budget curve never
   *  looks at how you are doing.
   * ====================================================================== */
  var POWERS = {
    meteor:  { name: 'Meteor', cost: 1.0, radius: 11, dmg: 520, type: DMG_BLUNT, desc: 'Crushing splash at a point.' },
    rally:   { name: 'Rally',  cost: 0.8, radius: 40, dur: 9, desc: '+45% damage, +25% speed to your army.' },
    freeze:  { name: 'Hold',   cost: 0.7, radius: 26, dur: 3.4, desc: 'Stun every enemy in the blast.' },
    reinforce: { name: 'Reinforce', cost: 1.0, desc: 'A free squad marches out of the gate.' }
  };

  function powerCharge(team) { return armies[team] ? armies[team].power : 0; }

  function stepPower(army, dt) {
    var f = state.forts[army.team];
    var need = Math.max(1, (f ? f.max : 1000) * 0.55);
    if (army.powerRaw > 0) {
      army.power = clamp01(army.power + (army.powerRaw / need));
      army.powerRaw = 0;
    }
    /* a slow trickle so a stalemate still eventually hands you a button */
    army.power = clamp01(army.power + dt * 0.008);
    if (!army.powerReady && army.power >= 1) {
      army.powerReady = true;
      if (army.team === 1) { toast('POWER READY', 'power'); }
      C.emit('sim:power', army);
    }
  }

  var _freezeCtx = { team: 0, x: 0, z: 0, r2: 0, dur: 0 };
  function visitFreeze(v, ctx) {
    if (!v || v.dead || v.team === ctx.team) { return; }
    var dx = v.x - ctx.x, dz = v.z - ctx.z;
    if (dx * dx + dz * dz > ctx.r2) { return; }
    v.stunT = Math.max(v.stunT, ctx.dur * (v.boss ? 0.4 : 1));
    v.atkPhase = 'idle';
    pushFx('frozen', v.x, 1.0, v.z, 0, 0, 0, 1, v.team, ctx.dur);
  }

  function castPower(type, x, z, team) {
    team = (team === -1) ? -1 : 1;
    var army = armies[team];
    var p = POWERS[type];
    if (!army || !p) { return false; }
    var cost = p.cost;
    if (army.power < cost) {
      if (team === 1) { toast('Power not charged', 'warn'); }
      return false;
    }
    army.power -= cost;
    army.powerReady = army.power >= 1;

    if (typeof x !== 'number') { x = army.frontX; }
    if (typeof z !== 'number') { z = 0; }

    if (type === 'meteor') {
      splashAt(null, team, x, z, p.radius,
               p.dmg * Math.pow(ERA_K, state.eraIndex), p.type, false);
      pushFx('meteor', x, 0.4, z, 0, 1, 0, p.radius, team, 1.4);
      shake(1.0);
    } else if (type === 'rally') {
      _rallyCtx.u = { x: x, z: z, team: team, dead: false };
      _rallyCtx.r2 = p.radius * p.radius;
      _rallyCtx.dmgMul = 1.45; _rallyCtx.spdMul = 1.25; _rallyCtx.dur = p.dur; _rallyCtx.shield = 0.6;
      forEachNear(x, z, p.radius, visitRally, _rallyCtx);
      shake(0.4);
    } else if (type === 'freeze') {
      _freezeCtx.team = team; _freezeCtx.x = x; _freezeCtx.z = z;
      _freezeCtx.r2 = p.radius * p.radius; _freezeCtx.dur = p.dur;
      forEachNear(x, z, p.radius, visitFreeze, _freezeCtx);
      shake(0.35);
    } else if (type === 'reinforce') {
      spawnSquad(team, state.eraIndex, 6, true);
    }

    evPower.type = type; evPower.x = x; evPower.z = z; evPower.team = team;
    emit('power:cast', evPower);
    return true;
  }

  /** Free emergency troops when the wall is about to come down. Once per wave. */
  function checkLastStand(army) {
    if (army.lastStand) { return; }
    var f = state.forts[army.team];
    if (!f || f.hp > f.max * 0.25) { return; }
    army.lastStand = true;
    var n = 6 + Math.min(6, (state.wave / 3) | 0);
    spawnSquad(army.team, state.eraIndex, n, true);
    army.power = clamp01(army.power + 0.45);
    if (army.team === 1) {
      toast('LAST STAND — the militia takes the field!', 'power');
      shake(0.5);
    }
    C.emit('sim:laststand', army);
  }

  function spawnSquad(team, era, n, militia) {
    var mix = ['defender', 'assault', 'ranged'];
    var i;
    for (i = 0; i < n; i++) {
      var d = typeFor(mix[i % mix.length], era);
      spawn(d, team, {
        x: SPAWN_X[team] + team * C.rngRange(-3, 3),
        z: C.rngRange(LANE_MIN + 3, LANE_MAX - 3),
        militia: !!militia
      });
    }
    pushFx('gate', SPAWN_X[team], 1.0, 0, team, 0, 0, n, team, 0.8);
  }

  /* =========================================================================
   * 27. WAVE DIRECTOR
   * -------------------------------------------------------------------------
   *  Fixes, in order, the four things the audit killed the old build for:
   *   - dead time: pulses spawn immediately and tempo guarantees contact
   *   - 2:1 scaling: the budget curve is fixed and published, never adaptive
   *   - no counters: composition is chosen with the SAME duel model the
   *     balance test uses, against what the player is actually fielding
   *   - unreadable pushes: every wave is previewed and every push telegraphed
   * ====================================================================== */
  var director = {
    running: false,
    phase: 'idle',        // 'idle' | 'preview' | 'battle' | 'clear'
    t: 0,
    prepT: 0,
    wave: 0,
    budget: 0,
    spent: 0,
    pulses: 0,
    pulseT: 0,
    pulseGap: 3.2,
    comp: null,           // {defender, assault, ranged, specialist, champion, boss, total}
    plan: [],             // flat list of defs still to send this wave
    planI: 0,
    bossWave: false,
    contactT: 0,
    tempoBoost: 1,
    pushT: 0,
    lastPush: 0
  };

  /* --- sim-local delayed callbacks (deterministic, pause-aware) ---------- */
  var _delays = [];
  function simAfter(sec, fn) {
    _delays.push({ t: sec > 0 ? sec : 0, fn: fn, dead: false });
  }
  function stepDelays(dt) {
    if (_delays.length === 0) { return; }
    var i, w = 0, d;
    for (i = 0; i < _delays.length; i++) {
      d = _delays[i];
      if (!d || d.dead) { continue; }
      d.t -= dt;
      if (d.t <= 0) {
        d.dead = true;
        try { d.fn(); }
        catch (e) { warn('delay', 'delayed callback threw — dropped.', e); }
        continue;
      }
      _delays[w++] = d;
    }
    _delays.length = w;
  }

  var comp = { defender: 0, assault: 0, ranged: 0, specialist: 0, champion: 0, boss: 0, total: 0, era: 0, wave: 0 };

  /** Gentle start, smooth ramp, no cliff. Wave 1 is 12-15 bodies. */
  function waveBudget(n) {
    var base = 1300;                     // ~14 era-0 units at era-0 prices
    return Math.round(base * Math.pow(1.20, n - 1) * (1 + 0.025 * (n - 1)));
  }

  function isBossWave(n) { return n > 0 && (n % 5) === 0; }

  /** Census of a team's fielded + queued army, by class. */
  function censusOf(team) {
    var army = armies[team], c = army.census, i;
    c.defender = 0; c.assault = 0; c.ranged = 0; c.specialist = 0; c.champion = 0; c.boss = 0;
    c.total = 0; c.cost = 0;
    var l = alive[team];
    for (i = 0; i < l.length; i++) {
      var u = l[i];
      if (c[u.cls] !== undefined) { c[u.cls]++; }
      c.total++; c.cost += u.def.cost;
    }
    for (i = 0; i < army.queue.length; i++) {
      var d = army.queue[i];
      if (c[d.cls] !== undefined) { c[d.cls]++; }
      c.total++; c.cost += d.cost;
    }
    return c;
  }

  /* weights scratch — reused */
  var _w = { defender: 0, assault: 0, ranged: 0, specialist: 0, champion: 0 };
  var CLASSES = ['defender', 'assault', 'ranged', 'specialist', 'champion'];

  /**
   * Pick a composition that actually answers what the player is fielding.
   * For each of our options we sum duel() against the player's census; the
   * better the answer, the more of them we send. Early waves are deliberately
   * dulled so the player is not counter-picked before they own a roster.
   */
  function planComposition(wave, era, budget) {
    var pc = censusOf(1);
    var roster = rosterFor(era);
    var i, j, cls, def;

    /* baseline shape: a real army, not a blob */
    _w.defender = 1.00; _w.assault = 1.00; _w.ranged = 0.95;
    _w.specialist = 0.45; _w.champion = wave >= 4 ? 0.35 : 0;

    /* how hard the director is allowed to counter-pick, 0 -> 1 over 8 waves */
    var smart = clamp01((wave - 1) / 8) * 0.85;

    if (pc.total > 0) {
      for (i = 0; i < roster.length; i++) {
        def = roster[i];
        cls = def.cls;
        if (_w[cls] === undefined) { continue; }
        var score = 0, weight = 0;
        for (j = 0; j < CLASSES.length; j++) {
          var pCls = CLASSES[j];
          var n = pc[pCls];
          if (!n) { continue; }
          var pDef = typeFor(pCls, era);
          if (!pDef) { continue; }
          score += duel(def, pDef) * n;
          weight += n;
        }
        if (weight > 0) {
          var adv = score / weight;            // >1 means this beats their army
          _w[cls] *= (1 - smart) + smart * clamp(adv, 0.45, 1.9);
        }
      }
    }

    /* champions are rationed by wave, not by weight */
    if (wave < 4) { _w.champion = 0; }

    var total = 0;
    for (j = 0; j < CLASSES.length; j++) { total += _w[CLASSES[j]]; }
    if (!(total > 0)) { total = 1; }

    director.plan.length = 0;
    director.planI = 0;
    comp.defender = 0; comp.assault = 0; comp.ranged = 0;
    comp.specialist = 0; comp.champion = 0; comp.boss = 0; comp.total = 0;
    comp.era = era; comp.wave = wave;

    var spend = 0;
    var guard = 0;
    var champCap = wave >= 8 ? 2 : 1;
    var champCount = 0;

    /* deterministic weighted fill until the budget is gone */
    while (spend < budget && guard++ < 400) {
      var r = C.rng() * total, acc = 0, pick = null;
      for (j = 0; j < CLASSES.length; j++) {
        acc += _w[CLASSES[j]];
        if (r <= acc) { pick = CLASSES[j]; break; }
      }
      if (!pick) { pick = 'assault'; }
      if (pick === 'champion') {
        if (champCount >= champCap) { continue; }
        champCount++;
      }
      def = typeFor(pick, era);
      if (!def) { break; }
      if (spend + def.cost > budget * 1.06) {
        /* try to top up with something cheap before giving up */
        var cheap = typeFor('ranged', era);
        if (cheap && spend + cheap.cost <= budget) { def = cheap; }
        else { break; }
      }
      director.plan.push(def);
      spend += def.cost;
      if (comp[def.cls] !== undefined) { comp[def.cls]++; }
      comp.total++;
    }

    if (isBossWave(wave)) {
      var b = ERA_BOSS[clamp(era, 0, ERA_BOSS.length - 1)];
      if (b) { director.plan.push(b); comp.boss = 1; comp.total++; }
    }

    /* front-load the line so the first contact is a real fight, not a trickle */
    director.plan.sort(planOrder);
    director.spent = spend;
    return comp;
  }

  function planOrder(a, b) {
    var ra = a.boss ? 9 : classRank(a.cls);
    var rb = b.boss ? 9 : classRank(b.cls);
    if (ra !== rb) { return ra - rb; }
    return a.cost - b.cost;
  }

  function startWave(n) {
    director.wave = n;
    state.wave = n;
    var era = clamp(state.eraIndex + (isBossWave(n) ? 0 : 0), 0, ERAS.length - 1);
    director.budget = waveBudget(n);
    director.bossWave = isBossWave(n);
    planComposition(n, era, director.budget);

    director.phase = 'preview';
    director.prepT = (n === 1) ? 5.0 : 3.6;
    evPreview.wave = n; evPreview.comp = comp;
    evPreview.seconds = director.prepT; evPreview.boss = director.bossWave;
    C.emit('wave:preview', evPreview);
    toast('Wave ' + n + ' — ' + describeComp(comp), director.bossWave ? 'boss' : 'info');
    C.setPhase('prep');
  }

  var _descBuf = '';
  function describeComp(c) {
    _descBuf = '';
    if (c.defender) { _descBuf += c.defender + ' shield '; }
    if (c.assault) { _descBuf += c.assault + ' shock '; }
    if (c.ranged) { _descBuf += c.ranged + ' ranged '; }
    if (c.specialist) { _descBuf += c.specialist + ' support '; }
    if (c.champion) { _descBuf += c.champion + ' champion '; }
    if (c.boss) { _descBuf += 'BOSS '; }
    return _descBuf.length ? _descBuf : 'unknown';
  }

  function beginBattle() {
    director.phase = 'battle';
    director.t = 0;
    director.pulseT = 0;
    director.pulses = 0;
    director.contactT = 0;
    director.tempoBoost = 1;
    director.pushT = 12;
    armies[-1].lastStand = false;
    armies[1].lastStand = false;
    C.setPhase('battle');
    evWaveStart.wave = director.wave; evWaveStart.comp = comp;
    emit('wave:start', evWaveStart);
    /* the enemy commits immediately: no 40 seconds of standing around */
    setStance(-1, 'march');
  }

  function stepDirector(dt) {
    if (!director.running) { return; }

    if (director.phase === 'preview') {
      director.prepT -= dt;
      if (director.prepT <= 0) { beginBattle(); }
      return;
    }
    if (director.phase !== 'battle') { return; }

    director.t += dt;

    /* ---- spawn pulses ---------------------------------------------------- */
    if (director.planI < director.plan.length) {
      director.pulseT -= dt;
      if (director.pulseT <= 0) {
        var per = 3 + Math.min(5, (director.wave / 2) | 0);
        var i;
        for (i = 0; i < per && director.planI < director.plan.length; i++) {
          var d = director.plan[director.planI++];
          spawn(d, -1, {
            x: SPAWN_X[-1] + C.rngRange(-2, 2),
            z: C.rngRange(LANE_MIN + 2.5, LANE_MAX - 2.5),
            elite: director.wave > 12 ? 1 : 0
          });
        }
        director.pulses++;
        director.pulseT = director.pulseGap;
      }
    }

    /* ---- contact watchdog: the anti-dead-time guarantee ------------------ */
    var gap = frontGap();
    if (gap < 6) {
      director.contactT = 0;
      director.tempoBoost = 1;
    } else {
      director.contactT += dt;
      if (director.contactT > 6) {
        /* nobody is fighting: wind the whole field forward, harder over time */
        director.tempoBoost = clamp(1 + (director.contactT - 6) * 0.35, 1, 2.6);
        if (director.contactT > 10 && armies[-1].stance !== 'attack') {
          setStance(-1, 'attack');
          toast('The enemy charges!', 'warn');
          shake(0.3);
        }
      }
    }

    /* ---- telegraphed enemy pushes --------------------------------------- */
    director.pushT -= dt;
    if (director.pushT <= 0) {
      director.pushT = 16 + C.rngRange(0, 8);
      enemyPush();
    }

    /* ---- adaptive enemy stance ------------------------------------------ */
    enemyStanceLogic(dt);

    /* ---- wave clear ------------------------------------------------------ */
    if (director.planI >= director.plan.length && alive[-1].length === 0 && armies[-1].queue.length === 0) {
      clearWave();
    }
  }

  function frontGap() {
    var a = armies[1], b = armies[-1];
    if (alive[1].length === 0 || alive[-1].length === 0) { return 999; }
    return Math.max(0, b.frontX - a.frontX);
  }

  var _tele = { team: -1, cls: '', delay: 0 };
  function enemyPush() {
    if (alive[-1].length < 3) { return; }
    /* choose the class with the most bodies and commit it — and SAY SO first */
    var c = censusOf(-1);
    var best = 'assault', bestN = -1, i;
    for (i = 0; i < CLASSES.length; i++) {
      if (c[CLASSES[i]] > bestN) { bestN = c[CLASSES[i]]; best = CLASSES[i]; }
    }
    if (bestN <= 0) { return; }
    toast('Enemy ' + best + ' are massing — a charge is coming', 'warn');
    _tele.cls = best; _tele.delay = 2.2;
    C.emit('sim:telegraph', _tele);
    simAfter(2.2, function () {
      if (!director.running) { return; }
      chargeOrder(-1, best, 7);
      setStance(-1, 'attack');
      simAfter(7, function () { if (director.running) { setStance(-1, 'march'); } });
    });
  }

  function enemyStanceLogic(dt) {
    var army = armies[-1];
    var f = state.forts[-1];
    if (!f) { return; }
    var hpFrac = f.hp / f.max;
    var mine = alive[-1].length, theirs = alive[1].length;

    if (hpFrac < 0.3 && mine < theirs * 0.6) {
      if (army.stance !== 'defend') { setStance(-1, 'defend'); setFormation(-1, 'shieldwall'); }
    } else if (mine > theirs * 1.35 && director.contactT < 4) {
      if (army.stance !== 'attack') { setStance(-1, 'attack'); setFormation(-1, 'wedge'); }
    } else if (army.stance === 'defend' && mine >= theirs) {
      setStance(-1, 'march'); setFormation(-1, 'line');
    }
  }

  function clearWave() {
    director.phase = 'clear';
    var reward = Math.round(60 + director.wave * 34 * Math.pow(ERA_K, state.eraIndex));
    C.addGold(reward, 'wave');
    state.stats.wavesCleared++;
    if (director.wave > state.stats.bestWave) { state.stats.bestWave = director.wave; }
    evWaveClear.wave = director.wave; evWaveClear.reward = reward;
    emit('wave:clear', evWaveClear);
    C.setPhase('wave-clear');
    toast('Wave ' + director.wave + ' cleared  +' + reward + 'g', 'good');

    /* era progression, unless another module has taken it over */
    if (Sim.autoEra && director.wave % 4 === 0 && state.eraIndex < ERAS.length - 1) {
      C.setEra(state.eraIndex + 1);
      toast('EVOLVED — ' + ERAS[state.eraIndex] + ' age', 'era');
    }

    var next = director.wave + 1;
    simAfter(2.4, function () {
      if (!director.running || state.over) { return; }
      startWave(next);
    });
  }

  /* =========================================================================
   * 28. ARMY STEP  (anchor, formation upkeep, economy, training)
   * ====================================================================== */
  var PASSIVE_INCOME = 3.0;
  var passiveOn = true;

  function stepArmy(army, dt) {
    var team = army.team;
    var enemy = -team;

    /* charge orders tick down at the army level too, so the UI can show them */
    var k;
    for (k in army.charge) {
      if (army.charge[k] > 0) {
        army.charge[k] -= dt;
        if (army.charge[k] < 0) { army.charge[k] = 0; }
      }
    }

    /* --- front line ------------------------------------------------------- */
    var l = alive[team], i, front = FORT_X[team], any = false;
    for (i = 0; i < l.length; i++) {
      var u = l[i];
      if (!any || (u.x - front) * team > 0) { front = u.x; any = true; }
    }
    army.frontX = any ? front : SPAWN_X[team];

    /* --- anchor: where the formation wants its front rank ----------------- */
    var el = alive[enemy], eFront = FORT_X[enemy], eAny = false;
    for (i = 0; i < el.length; i++) {
      var e = el[i];
      if (!eAny || (e.x - eFront) * enemy > 0) { eFront = e.x; eAny = true; }
    }

    var want;
    var adv = army.advance;
    if (adv <= -2) {
      want = FORT_X[team] + team * 18;                       // retreat
    } else if (adv === -1) {
      want = FORT_X[team] + team * 42;                       // defend: hold a line
    } else if (adv === 1) {
      /* March: put the front rank 1.5m PAST their front rank. Aiming short is
         how two armies end up staring at each other across ten metres. */
      want = eAny ? (eFront + team * 1.5) : (FORT_X[enemy] - team * (FORT_HALF + 6));
    } else {
      want = eAny ? (eFront + team * 7) : (FORT_X[enemy] - team * (FORT_HALF + 4));
    }
    want = clamp(want, EDGE_PAD + 4, W - EDGE_PAD - 4);
    army.anchorTarget = want;

    var f = FORMATIONS[army.formation] || FORMATIONS.line;
    var anchorSpeed = 3.0 * f.speed * army.speedMul;
    if (adv <= -2) { anchorSpeed *= 1.6; }
    var gapToWant = Math.abs(want - army.anchorX);
    if (gapToWant > 40) { anchorSpeed *= 2.6; }        // no dead time for the line either
    var stepA = anchorSpeed * dt;
    if (Math.abs(want - army.anchorX) <= stepA) { army.anchorX = want; }
    else { army.anchorX += (want > army.anchorX ? 1 : -1) * stepA; }

    /* --- formation slots -------------------------------------------------- */
    army.formT -= dt;
    if (army.formDirty || army.formT <= 0) { assignSlots(army); army.formT = 0.35; }
    else {
      /* cheap slide: keep slots glued to the moving anchor between rebuilds */
      var fdef = FORMATIONS[army.formation] || FORMATIONS.line;
      for (i = 0; i < l.length; i++) {
        var uu = l[i];
        if (!uu.slotOk) { continue; }
        uu.slotX = army.anchorX - team * (uu.rank * fdef.rankGap);
      }
    }

    stepQueue(army, dt);
    stepTurrets(army, dt);
    stepPower(army, dt);
    checkLastStand(army);

    /* --- retreat healing: the stance has to give you something ------------ */
    if (army.stance === 'retreat') {
      var fx0 = FORT_X[team];
      for (i = 0; i < l.length; i++) {
        var r = l[i];
        if (Math.abs(r.x - fx0) < 26 && r.hp < r.maxHp) {
          r.hp = Math.min(r.maxHp, r.hp + r.maxHp * 0.06 * dt);
        }
      }
    }
  }

  /* =========================================================================
   * 29. THE STEP
   * ====================================================================== */
  var _corpseTtl = 4.5;

  function step(dt) {
    if (!Sim.ready) { return; }

    /* ---- rebuild the live indices (in place, never reallocated) --------- */
    alive[1].length = 0; alive[-1].length = 0; allAlive.length = 0;
    var i, u, w = 0;
    for (i = 0; i < units.length; i++) {
      u = units[i];
      if (!u) { continue; }
      if (u.dead) {
        if (u.deathT > _corpseTtl) { unitPool.put(u); continue; }
        units[w++] = u;
        continue;
      }
      alive[u.team].push(u);
      allAlive.push(u);
      units[w++] = u;
    }
    units.length = w;

    gridBuild();

    /* ---- armies ---------------------------------------------------------- */
    stepArmy(armies[1], dt);
    stepArmy(armies[-1], dt);

    /* ---- units ----------------------------------------------------------- */
    for (i = 0; i < units.length; i++) {
      u = units[i];
      if (u.dead) { updateCorpse(u, dt); }
      else { updateUnit(u, dt); }
    }

    /* ---- physics --------------------------------------------------------- */
    separate();

    /* ---- world ----------------------------------------------------------- */
    stepProjectiles(dt);
    stepMines(dt);
    stepFx(dt);
    stepDelays(dt);
    stepDirector(dt);

    /* keep the camera's fort hints fresh (Render reads these, never writes) */
    state.forts.playerX = FORT_X[1];
    state.forts.enemyX = FORT_X[-1];

    /* passive trickle so the player is never stuck with nothing to do */
    if (passiveOn && director.running && !state.over) {
      _incomeAcc += dt * (PASSIVE_INCOME + state.wave * 0.45) * Math.pow(ERA_K, state.eraIndex);
      if (_incomeAcc >= 1) {
        var g = Math.floor(_incomeAcc);
        _incomeAcc -= g;
        C.addGold(g, 'income');
      }
    }
  }
  var _incomeAcc = 0;

  /* =========================================================================
   * 30. LIFECYCLE
   * ====================================================================== */
  function resetSim(hard) {
    var i;
    for (i = 0; i < units.length; i++) { if (units[i]) { unitPool.put(units[i]); } }
    units.length = 0;
    for (i = 0; i < projectiles.length; i++) { if (projectiles[i]) { projPool.put(projectiles[i]); } }
    projectiles.length = 0;
    for (i = 0; i < mines.length; i++) { if (mines[i]) { minePool.put(mines[i]); } }
    mines.length = 0;
    for (i = 0; i < fx.length; i++) { if (fx[i]) { fxPool.put(fx[i]); } }
    fx.length = 0;

    alive[1].length = 0; alive[-1].length = 0; allAlive.length = 0;
    _fortDown[1] = false; _fortDown[-1] = false;
    _incomeAcc = 0;

    armies[1] = newArmy(1);
    armies[-1] = newArmy(-1);
    applyStance(armies[1]); applyStance(armies[-1]);
    if (hard) {
      setStance(1, 'march');
      setFormation(1, 'line');
    }

    director.running = false;
    director.phase = 'idle';
    director.plan.length = 0;
    director.planI = 0;
    director.wave = 0;
    director.tempoBoost = 1;
    director.contactT = 0;
    _delays.length = 0;
  }

  function startRun(wave) {
    resetSim(true);
    passiveOn = !(AOW.Economy && AOW.Economy.ownsIncome);
    director.running = true;
    var n = (wave | 0) > 0 ? (wave | 0) : 1;
    startWave(n);
  }

  function stopRun() {
    director.running = false;
    director.phase = 'idle';
  }

  /* =========================================================================
   * 31. SELF-TEST
   * -------------------------------------------------------------------------
   *  Two invariants, both of which the old build violated:
   *    (1) dominance cap  — sorted by value, no unit exceeds 1.3x the next
   *    (2) counter-completeness — every unit has an answer at equal gold
   * ====================================================================== */
  var DOMINANCE_CAP = 1.30;
  var COUNTER_MIN = 1.06;

  function selfTest(verbose) {
    var notes = [];
    var ok = true;
    var e, i, j;

    /* ---- 1. dominance cap, per era ------------------------------------- */
    var worstRatio = 0, worstWhere = '';
    for (e = 0; e < ERA_ROSTER.length; e++) {
      var roster = ERA_ROSTER[e];
      if (!roster || roster.length < 2) { continue; }
      var scored = [];
      for (i = 0; i < roster.length; i++) {
        var d = roster[i];
        scored.push({ id: d.id, name: d.name, v: d._value });
      }
      scored.sort(function (a, b) { return b.v - a.v; });
      for (i = 0; i + 1 < scored.length; i++) {
        var ratio = scored[i + 1].v > 0 ? (scored[i].v / scored[i + 1].v) : 99;
        if (ratio > worstRatio) {
          worstRatio = ratio;
          worstWhere = ERAS[e] + ': ' + scored[i].name + ' vs ' + scored[i + 1].name;
        }
        if (ratio > DOMINANCE_CAP) {
          ok = false;
          notes.push('DOMINANCE FAIL — ' + ERAS[e] + ': ' + scored[i].name +
                     ' is ' + ratio.toFixed(2) + 'x the value of ' + scored[i + 1].name +
                     ' (cap ' + DOMINANCE_CAP + ').');
        }
      }
      /* also check the whole spread, not just neighbours */
      var spread = scored[scored.length - 1].v > 0 ? scored[0].v / scored[scored.length - 1].v : 99;
      if (spread > DOMINANCE_CAP) {
        ok = false;
        notes.push('SPREAD FAIL — ' + ERAS[e] + ': best/worst value spread is ' +
                   spread.toFixed(2) + 'x (cap ' + DOMINANCE_CAP + ').');
      }
    }
    notes.push('Dominance: worst adjacent ratio ' + worstRatio.toFixed(3) +
               'x (cap ' + DOMINANCE_CAP.toFixed(2) + ') at ' + (worstWhere || 'n/a') + '.');

    /* ---- 2. every unit has a counter ------------------------------------ */
    for (e = 0; e < ERA_ROSTER.length; e++) {
      var r2 = ERA_ROSTER[e];
      if (!r2) { continue; }
      for (i = 0; i < r2.length; i++) {
        var victim = r2[i];
        var bestId = '', best = 0;
        for (j = 0; j < r2.length; j++) {
          if (i === j) { continue; }
          var q = duel(r2[j], victim);
          if (q > best) { best = q; bestId = r2[j].name; }
        }
        if (best < COUNTER_MIN) {
          ok = false;
          notes.push('COUNTER FAIL — ' + ERAS[e] + ': nothing beats ' + victim.name +
                     ' at equal gold (best answer ' + bestId + ' at ' + best.toFixed(2) + 'x).');
        } else if (verbose) {
          notes.push(ERAS[e] + ': ' + victim.name + ' is answered by ' + bestId +
                     ' (' + best.toFixed(2) + 'x).');
        }
      }
    }

    /* ---- 3. the triangle actually closes -------------------------------- */
    var era0 = 0;
    var D = typeFor('defender', era0), A = typeFor('assault', era0), R = typeFor('ranged', era0);
    if (D && A && R) {
      var dvA = duel(D, A), avR = duel(A, R), rvD = duel(R, D);
      if (!(dvA > 1 && avR > 1 && rvD > 1)) {
        ok = false;
        notes.push('TRIANGLE FAIL — defender>assault=' + dvA.toFixed(2) +
                   ', assault>ranged=' + avR.toFixed(2) +
                   ', ranged>defender=' + rvD.toFixed(2) + ' (all must exceed 1.00).');
      } else {
        notes.push('Counter triangle: defender>assault ' + dvA.toFixed(2) +
                   'x, assault>ranged ' + avR.toFixed(2) +
                   'x, ranged>defender ' + rvD.toFixed(2) + 'x.');
      }
    }

    /* ---- 4. wave 1 is a gentle 12-15 bodies ----------------------------- */
    var b1 = waveBudget(1);
    var cheapest = 1e9, dearest = 0, rr = rosterFor(0);
    for (i = 0; i < rr.length; i++) {
      if (rr[i].cls === 'champion') { continue; }
      if (rr[i].cost < cheapest) { cheapest = rr[i].cost; }
      if (rr[i].cost > dearest) { dearest = rr[i].cost; }
    }
    var minN = Math.floor(b1 / dearest), maxN = Math.floor(b1 / cheapest);
    notes.push('Wave 1 budget ' + b1 + 'g = ' + minN + '-' + maxN + ' units (target 12-15 typical).');
    if (maxN < 10 || minN > 22) {
      ok = false;
      notes.push('CURVE FAIL — wave 1 size ' + minN + '-' + maxN + ' is outside the gentle-start band.');
    }

    /* ---- 5. difficulty ramp is smooth ----------------------------------- */
    var worstJump = 0;
    for (i = 2; i <= 30; i++) {
      var jump = waveBudget(i) / waveBudget(i - 1);
      if (jump > worstJump) { worstJump = jump; }
    }
    notes.push('Difficulty ramp: worst wave-to-wave jump ' + worstJump.toFixed(3) + 'x over 30 waves.');
    if (worstJump > 1.35) { ok = false; notes.push('RAMP FAIL — a wave more than 35% harder than the last is a cliff.'); }

    /* ---- 6. no stance Pareto-dominates another -------------------------- */
    /* The old build died on this exact line: Defend was better on every axis,
       so "stance" was a label. A stance may only win an axis by losing one. */
    function stanceVec(s) {
      return [s.armorMul, s.formMul, s.dmgMul, 1 / s.takenMul, s.speedMul, s.goldMul, s.turretMul];
    }
    var stanceDom = 0;
    for (i = 0; i < STANCE_LIST.length; i++) {
      for (j = 0; j < STANCE_LIST.length; j++) {
        if (i === j) { continue; }
        var va = stanceVec(STANCES[STANCE_LIST[i]]);
        var vb = stanceVec(STANCES[STANCE_LIST[j]]);
        var geAll = true, gtAny = false, q;
        for (q = 0; q < va.length; q++) {
          if (va[q] < vb[q] - 1e-9) { geAll = false; break; }
          if (va[q] > vb[q] + 1e-9) { gtAny = true; }
        }
        if (geAll && gtAny) {
          ok = false;
          stanceDom++;
          notes.push('STANCE FAIL — ' + STANCES[STANCE_LIST[i]].name + ' dominates ' +
                     STANCES[STANCE_LIST[j]].name + ' on every axis; that is how Defend ate the last build.');
        }
      }
    }
    if (stanceDom === 0) {
      notes.push('Stances: ' + STANCE_LIST.length + ' checked, none Pareto-dominates another.');
    }

    /* ---- 7. formations are differentiated ------------------------------- */
    var seen = Object.create(null), dupe = false;
    for (i = 0; i < FORMATION_LIST.length; i++) {
      var ff = FORMATIONS[FORMATION_LIST[i]];
      var sig = ff.def.toFixed(2) + '/' + ff.speed.toFixed(2) + '/' + ff.ranks;
      if (seen[sig]) { dupe = true; }
      seen[sig] = 1;
    }
    if (dupe) { ok = false; notes.push('FORMATION FAIL — two formations are mechanically identical.'); }
    else { notes.push('Formations: ' + FORMATION_LIST.length + ' distinct defence/speed/depth profiles.'); }

    /* ---- 8. contact time ------------------------------------------------- */
    var closingGap = SPAWN_X[-1] - SPAWN_X[1];
    var baseSpeed = (typeFor('defender', 0).speed + typeFor('assault', 0).speed) * 0.5;
    var closeRate = 2 * baseSpeed * TEMPO_MAX;
    var contact = closingGap / closeRate;
    notes.push('Time to first contact ≈ ' + contact.toFixed(1) + 's at full tempo (watchdog escalates past 6s).');
    if (contact > 16) { ok = false; notes.push('DEAD-TIME FAIL — armies take longer than 16s to meet.'); }

    notes.push(ok ? 'ALL BALANCE INVARIANTS HOLD.' : 'BALANCE INVARIANTS VIOLATED — see failures above.');
    return { balanceOk: ok, notes: notes };
  }

  /* =========================================================================
   * 32. PUBLIC API
   * ====================================================================== */
  var Sim = {
    __isAowSim: true,
    version: '1.0.0',
    ready: false,
    failed: false,
    autoEra: true,

    /* data */
    TYPES: TYPES,
    TYPE_LIST: TYPE_LIST,
    ERA_ROSTER: ERA_ROSTER,
    ERA_BOSS: ERA_BOSS,
    FORMATIONS: FORMATIONS,
    FORMATION_LIST: FORMATION_LIST,
    STANCES: STANCES,
    STANCE_LIST: STANCE_LIST,
    POWERS: POWERS,
    BONUS: BONUS,
    DMG_TYPES: { slash: DMG_SLASH, pierce: DMG_PIERCE, blunt: DMG_BLUNT },

    /* live state (read-only for everyone else) */
    armies: armies,
    director: director,
    mines: mines,
    alive: alive,

    /* lookups */
    getType: typeOf,
    roster: rosterFor,
    typeFor: typeFor,
    cost: function (clsOrId) {
      var d = TYPES[clsOrId] || typeFor(clsOrId, state.eraIndex);
      return d ? d.cost : 0;
    },
    duel: duel,
    counterFor: function (cls, era) {
      era = (era === undefined) ? state.eraIndex : era;
      var r = rosterFor(era), victim = typeFor(cls, era), best = null, bv = 0, i;
      if (!victim) { return null; }
      for (i = 0; i < r.length; i++) {
        if (r[i] === victim) { continue; }
        var q = duel(r[i], victim);
        if (q > bv) { bv = q; best = r[i]; }
      }
      return best;
    },

    /* orders */
    setStance: setStance,
    setFormation: setFormation,
    charge: chargeOrder,
    castPower: castPower,
    power: powerCharge,
    setFortTier: setFortTier,

    /* spawning */
    spawn: spawn,
    requestSpawn: requestSpawn,
    spawnSquad: spawnSquad,
    queue: function (team) { return armies[team === -1 ? -1 : 1].queue; },
    countTeam: countTeam,

    /* lifecycle */
    init: init,
    start: startRun,
    stop: stopRun,
    reset: resetSim,
    startWave: startWave,
    step: step,

    /* introspection */
    census: censusOf,
    waveBudget: waveBudget,
    frontGap: frontGap,
    selfTest: selfTest,
    applyDamage: applyDamage
  };

  /* Fix up the forward references used before Sim existed. */
  function init(opts) {
    if (Sim.ready) { return true; }
    try {
      opts = opts || {};
      if (opts.seed !== undefined && opts.seed !== null) { C.setSeed(opts.seed); }

      setFortTier(1, state.forts[1].tier | 0);
      setFortTier(-1, state.forts[-1].tier | 0);
      state.forts[1].hp = state.forts[1].max;
      state.forts[-1].hp = state.forts[-1].max;
      state.forts.playerX = FORT_X[1];
      state.forts.enemyX = FORT_X[-1];

      C.registerSim(step, 0);

      /* --- bus wiring ---------------------------------------------------- */
      C.on('game:new', function () { startRun(1); });
      C.on('game:reset', function (hard) { resetSim(!!hard); });
      C.on('stance:change', function (s) {
        var army = armies[1];
        if (army && STANCES[s] && army.stance !== s) { army.stance = s; applyStance(army); army.formDirty = true; }
      });
      C.on('game:over', function () { director.running = false; });
      C.on('era:evolve', function () {
        /* forts scale with the age so a Stone gate is not a Future gate */
        setFortTier(1, state.forts[1].tier);
        setFortTier(-1, state.forts[-1].tier);
      });

      /* --- save slice ----------------------------------------------------- */
      C.registerSave('sim', function () {
        return {
          stance: armies[1].stance,
          formation: armies[1].formation,
          power: armies[1].power,
          wave: director.wave,
          autoEra: Sim.autoEra
        };
      }, function (d) {
        if (!d) { return; }
        if (d.stance) { setStance(1, d.stance); }
        if (d.formation) { setFormation(1, d.formation); }
        if (typeof d.power === 'number') { armies[1].power = clamp01(d.power); }
        if (typeof d.autoEra === 'boolean') { Sim.autoEra = d.autoEra; }
      });

      Sim.ready = true;

      /* Prove the roster before the player ever sees it. A failed invariant is
         a loud console error, not a silent live balance bug. */
      var t = selfTest(false);
      if (!t.balanceOk) {
        try {
          console.error('[AOW.Sim] BALANCE SELF-TEST FAILED:');
          for (var i = 0; i < t.notes.length; i++) { console.error('  ' + t.notes[i]); }
        } catch (e) {}
      } else {
        try { console.info('[AOW.Sim] balance self-test passed — ' + TYPE_LIST.length + ' unit types across ' + ERAS.length + ' eras.'); } catch (e2) {}
      }

      C.emit('sim:ready', Sim);
      return true;
    } catch (err) {
      Sim.failed = true;
      Sim.ready = false;
      warn('init', 'init failed — Sim disabled, the game will run without simulation.', err);
      return false;
    }
  }
  Sim.init = init;

  AOW.Sim = Sim;

  /* =========================================================================
   * 33. AUTO-INIT SAFETY NET
   *  The integrator normally calls AOW.Sim.init(). If nothing does, bring
   *  ourselves up so the game still has a brain. init() is idempotent.
   * ====================================================================== */
  try {
    if (!global.AOW_NO_SIM_AUTOINIT) {
      if (global.document && global.document.readyState === 'complete') { init({}); }
      else if (typeof global.addEventListener === 'function') {
        global.addEventListener('load', function () { init({}); }, false);
      } else { init({}); }
    }
  } catch (e) {
    warn('autoinit', 'auto-init failed — call AOW.Sim.init() manually.', e);
  }

})(typeof window !== 'undefined' ? window : this);
