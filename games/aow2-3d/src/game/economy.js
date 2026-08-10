/* =============================================================================
 * AOW2-3D  —  src/game/economy.js  —  global: AOW.Economy
 * -----------------------------------------------------------------------------
 * Money, store, upgrades, perks, unlocks, eras, loadouts, quests, battle pass.
 *
 * DESIGN CONTRACT (what other modules may rely on)
 * -----------------------------------------------------------------------------
 * READ-ONLY LIVE OBJECTS (stable references — never reassigned, mutated in place)
 *   AOW.Economy.mods        flat modifier bundle the Sim consults every frame
 *   AOW.Economy.run         run-scoped economy state (treasury, income, perks)
 *   AOW.Economy.meta        persistent meta state (renown, tree tiers, store)
 *   AOW.Economy.TUNE        every balance number in the game, in one table
 *
 * EVENTS EMITTED
 *   gold:change {gold,delta,reason}    (via Core.addGold — single source of truth)
 *   gems:change {gems,delta,reason}
 *   era:evolve  {era,index}            (via Core.setEra)
 *   econ:mods       {mods}             modifier bundle changed — re-read stats
 *   econ:treasury   {level,income}
 *   econ:income     {gold,rate,src}
 *   unit:request    {def,team,cls,era,cost}   ask Sim to spawn a bought unit
 *   units:morph     {team,eraIndex,era,heal}  era spike: upgrade units in place
 *   fort:heal       {team,amount,hp,max}
 *   perk:offer      {choices,reason,rerolls}
 *   perk:taken      {perk,stacks}
 *   meta:buy        {node,tier,cost}
 *   store:buy       {item,currency,price}
 *   unlock:new      {id,label,kind}
 *   quest:progress  {quest}
 *   quest:complete  {quest}
 *   daily:claim     {day,streak,rewards}
 *   bp:level        {level,rewards}
 *   ui:toast        {msg,kind}
 *   camera:shake    {amount}
 *
 * EVENTS CONSUMED
 *   unit:death, unit:hit, unit:block, unit:attack, fort:hit, fort:destroyed,
 *   wave:start, wave:clear, boss:spawn, boss:phase, game:new, game:over,
 *   game:reset, power:cast, era:evolve
 *
 * FAIRNESS RULE (enforced in code, see validateCatalog / FAIRNESS)
 *   Premium currency (gems) may NEVER buy power. Anything flagged power:true is
 *   priced in gold or renown only. Gems themselves are 100% earnable by play.
 *   Renown (the meta-tree currency) can never be bought with gems.
 * ========================================================================== */

(function (global) {
  'use strict';

  var AOW = global.AOW || (global.AOW = {});

  if (AOW.Economy && AOW.Economy.__isAowEconomy) {
    try { console.warn('[AOW.Economy] already initialised — ignoring duplicate script include.'); } catch (e) {}
    return;
  }

  /* ===========================================================================
   * 0. CORE HANDLE (guarded — the module degrades instead of crashing)
   * ======================================================================== */
  var Core = AOW.Core || null;
  var CORE_OK = !!(Core && Core.on && Core.emit && Core.state);

  if (!CORE_OK) {
    try { console.warn('[AOW.Economy] AOW.Core missing or incomplete — Economy runs in inert mode.'); } catch (e) {}
  }

  function warn(msg, err) {
    try {
      if (Core && Core.warnOnce) { Core.warnOnce('econ:' + msg, msg, err); return; }
      if (err) console.warn('[AOW.Economy] ' + msg, err); else console.warn('[AOW.Economy] ' + msg);
    } catch (e) {}
  }

  function on(name, fn) {
    if (!CORE_OK) return function () {};
    try { return Core.on(name, fn) || function () {}; }
    catch (e) { warn('on(' + name + ') failed', e); return function () {}; }
  }

  function emit(name, payload) {
    if (!CORE_OK) return;
    try { Core.emit(name, payload); } catch (e) { warn('emit(' + name + ') failed', e); }
  }

  function toast(msg, kind) { emit('ui:toast', { msg: String(msg), kind: kind || 'info' }); }

  var state = CORE_OK ? Core.state : {
    gold: 0, gems: 0, eraIndex: 0, era: 'Stone', wave: 0, phase: 'menu',
    units: [], forts: { 1: { hp: 1000, max: 1000, tier: 0 }, '-1': { hp: 1000, max: 1000, tier: 0 } },
    upgrades: {}, unlocks: {}, perks: {}, persist: {}, stats: {}, settings: {}
  };

  /* Local math helpers — never depend on Core being present. */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function int(v, d) { var n = num(v, d); return n | 0; }
  function str(v, d) { return typeof v === 'string' ? v : d; }
  /* Array.isArray is cross-realm safe; `instanceof Array` is not (iframes/workers). */
  var isArr = (typeof Array.isArray === 'function')
    ? Array.isArray
    : function (v) { return Object.prototype.toString.call(v) === '[object Array]'; };
  function isObj(v) { return !!v && typeof v === 'object' && !isArr(v); }
  function round(v) { return Math.round(v); }
  function has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  function rnd() {
    if (CORE_OK && Core.rng) { try { return Core.rng(); } catch (e) {} }
    return Math.random();
  }
  function rndInt(n) { return (rnd() * n) | 0; }

  /* ===========================================================================
   * 1. TUNING TABLE  —  EVERY BALANCE NUMBER LIVES HERE
   *    Edit this block to rebalance the whole game. Nothing else has magic
   *    numbers baked into logic.
   * ======================================================================== */
  var TUNE = {

    /* ---- in-battle gold ------------------------------------------------- */
    gold: {
      startGold:          240,   // gold at the start of a run (before meta grants)
      killBase:           10,    // flat gold for any kill
      killCostShare:      0.26,  // + this share of the dead unit's purchase cost
      killEraBonus:       0.14,  // + this share per era-tier of the dead unit
      overkillPenalty:    0.85,  // multiplier on kills made by the fort/garrison
      assistShare:        0.30,  // share paid to the team for a kill they only chipped
      fortDamageGold:     0.045, // gold per point of damage dealt to the enemy fort
      blockGold:          0,     // base (perk 'Coin of the Shield' turns this on)
      waveClearBase:      95,
      waveClearPerWave:   16,
      waveClearGrowth:    1.035, // compounding per wave on top of the linear term
      bossBonus:          420,
      passiveBase:        3.2,   // gold/sec with zero treasury investment
      passiveTick:        0.25,  // seconds between income ticks (accumulator)
      territoryRate:      7.5,   // gold/sec at total map control
      territoryDeadzone:  0.06,  // |control| below this pays nothing (stalemate)
      territoryPower:     1.25,  // control curve exponent — pushing forward pays more
      softCap:            950,   // above this, income throttles hard
      softCapSlope:       0.85,  // bigger = harsher throttle
      softCapFloor:       0.18,  // income never throttles below this multiplier
      leakStart:          1.6,   // × softCap: hoarding above this actively bleeds
      leakRate:           0.010, // fraction of the excess lost per second
      hardCap:            250000
    },

    /* ---- treasury: the in-battle income-vs-army investment line ---------- */
    treasury: {
      maxLevel:     8,
      costBase:     130,
      costGrowth:   1.52,
      incomePer:    2.35,   // gold/sec added per level
      incomeCurve:  1.06,   // slight super-linear reward for committing
      capPerLevel:  110,    // each level also raises the soft cap
      refundPct:    0       // treasury never refunds — the commitment is the point
    },

    /* ---- era evolution --------------------------------------------------- */
    era: {
      costBase:      360,
      costGrowth:    1.62,
      fortHealPct:   0.34,   // instant fort heal on evolve
      fortMaxGain:   0.16,   // permanent +max fort HP per era
      spikeHealPct:  0.45,   // on-field units heal this much of max on morph
      spikeStatGain: 0.0,    // (unit stats come from the new era table, not a flat buff)
      morphSeconds:  0.9,    // visual morph duration handed to Units3D
      shake:         0.55,
      perkOnEvolve:  true,
      minWave:       0       // eras are gated by gold only, never by wave
    },

    /* ---- persistent meta tree -------------------------------------------- */
    meta: {
      renownPerWave:   3,
      renownPerBoss:   28,
      renownPerEra:    9,
      renownWin:       70,
      renownLoss:      12,     // consolation so a bad run is never a zero
      renownWaveCurve: 1.02,   // deeper waves are worth marginally more
      refundPct:       0.60,   // respec returns this share of spent renown
      respecCostGems:  0       // respec is FREE — never sell a respec
    },

    /* ---- perks ----------------------------------------------------------- */
    perk: {
      offerSize:        3,
      baseRerolls:      1,
      milestoneWaves:   5,     // an offer every N waves
      offerOnEvolve:    true,
      offerOnBoss:      true,
      synergyBias:      2.2,   // weight multiplier per matching owned tag
      rarityWeights:    { common: 100, rare: 42, epic: 15, legendary: 4 },
      rarityWavePush:   0.022, // per wave, shifts weight toward higher rarity
      maxOwned:         24
    },

    /* ---- army / supply --------------------------------------------------- */
    army: {
      supplyBase:       22,
      supplyPerEra:     3,
      spawnCooldown:    0.55,  // seconds between purchases (anti-spam, Sim may use)
      queueMax:         12,
      refundOnCancel:   1.0
    },

    /* ---- store & currencies ---------------------------------------------- */
    store: {
      gemsPerWaveMilestone: 4,    // gems awarded every `gemWaveEvery` waves
      gemWaveEvery:         5,
      gemsPerBoss:          12,
      gemsPerWin:           40,
      gemsDailyLogin:       6,
      gemsPerQuest:         5,
      gemsPerBpLevel:       3
    },

    /* ---- battle pass ------------------------------------------------------ */
    bp: {
      levels:        40,
      xpPerLevel:    100,
      xpGrowth:      1.045,
      xpPerWave:     22,
      xpPerBoss:     140,
      xpPerWin:      260,
      xpPerQuest:    60,
      seasonDays:    28,
      premiumGems:   400          // premium track price — cosmetics ONLY
    },

    /* ---- dailies & quests -------------------------------------------------- */
    daily: {
      ladderDays:   7,
      streakBonus:  0.12,      // +12% rewards per consecutive day, capped
      streakMax:    2.0,
      questsPerDay: 3,
      questReroll:  1
    },

    /* ---- misc ------------------------------------------------------------- */
    misc: {
      autosaveOnBuy:  true,
      toastPurchases: true
    }
  };

  /* ===========================================================================
   * 2. MODIFIER BUNDLE
   *    One flat object the Sim reads. Recomputed only when something changes.
   *    Multiplicative keys default to 1, additive keys to 0, flags to false.
   * ======================================================================== */
  var MOD_DEFAULTS = {
    /* unit combat */
    hpMul: 1, dmgMul: 1, meleeDmgMul: 1, rangedDmgMul: 1, siegeDmgMul: 1,
    speedMul: 1, atkSpeedMul: 1, rangeMul: 1,
    armorFlat: 0, armorMul: 1, shieldFlat: 0,
    critChance: 0.03, critMul: 1.85,
    blockChance: 0, blockReduce: 0.55,
    lifestealPct: 0, thornsPct: 0,
    pierceTargets: 0, cleaveRadius: 0, knockbackMul: 1,
    dmgTakenMul: 1, rangedDmgTakenMul: 1, splashDmgTakenMul: 1,
    veterancyPerKill: 0, veterancyCap: 0,
    reviveCharges: 0, reviveHpPct: 0.5,
    firstStrikeMul: 1, lowHpRageMul: 0, chargeDmgMul: 1,
    healOnKill: 0, moraleAura: 0,
    armorPierceFlat: 0, champDiscount: 0, champDmg: 0, reviveAll: 0,

    /* economy */
    killGoldMul: 1, incomeMul: 1, waveGoldMul: 1, unitCostMul: 1,
    evolveCostMul: 1, treasuryCostMul: 1, softCapAdd: 0, startGoldAdd: 0,
    goldOnBlock: 0, goldOnCrit: 0, fortDamageGoldMul: 1, gemFindMul: 1,
    renownMul: 1, bpXpMul: 1, evolveFullHeal: 0,

    /* fortification */
    fortHpMul: 1, fortRegen: 0, fortArmorFlat: 0, garrisonCount: 0,
    garrisonDmgMul: 1, wallSpikes: 0, homeGroundArmor: 0, homeGroundReduce: 0,
    homeGroundRadius: 40,

    /* arcane / tech */
    powerDmgMul: 1, powerCdMul: 1, manaRegenMul: 1, powerFreeChance: 0,
    powerRadiusMul: 1, extraPowerSlots: 0,

    /* army */
    supplyAdd: 0, spawnCdMul: 1, queueAdd: 0,

    /* meta / flow */
    perkRerollAdd: 0, perkRarityAdd: 0, offerSizeAdd: 0,

    /* derived caches — assigned (never accumulated) at the end of recompute() */
    supplyMax: 0, softCap: 0, eraIndex: 0, eraId: 'stone'
  };

  /* Live bundle — SAME OBJECT FOREVER. Other modules cache this reference. */
  var mods = {};
  (function seedMods() { for (var k in MOD_DEFAULTS) { mods[k] = MOD_DEFAULTS[k]; } })();

  function resetMods() { for (var k in MOD_DEFAULTS) { mods[k] = MOD_DEFAULTS[k]; } }

  function addMod(k, v) { if (has(mods, k)) { mods[k] += v; } else { mods[k] = v; } }
  function mulMod(k, v) { if (has(mods, k)) { mods[k] *= v; } else { mods[k] = v; } }
  function maxMod(k, v) { if (!has(mods, k) || mods[k] < v) { mods[k] = v; } }

  /* ===========================================================================
   * 3. ERAS — 8 eras with genuine behavioural identity, not skins.
   *    `traits` are contract strings the Sim switches on.
   * ======================================================================== */
  var ERA_LIST = (CORE_OK && Core.ERAS) ? Core.ERAS
    : ['Stone', 'Bronze', 'Iron', 'Medieval', 'Gunpowder', 'Industrial', 'Modern', 'Future'];

  var ERAS = [
    {
      index: 0, id: 'stone', name: 'Stone Age', mood: 'stone',
      tag: 'Swarm & Fury',
      blurb: 'Cheap bodies, no armour, and a berserk streak. You win by drowning them.',
      color: 0x8f7a5c, accent: 0xd6a05a,
      traits: ['rage', 'swarm', 'no-armor-pen', 'scavenge'],
      mods: { lowHpRageMul: 0.45, unitCostMul: 0.90, hpMul: 0.94, killGoldMul: 1.10, speedMul: 1.04 },
      power: { id: 'pw_boulder', name: 'Boulder Roll' }
    },
    {
      index: 1, id: 'bronze', name: 'Bronze Age', mood: 'stone',
      tag: 'The Shield Wall',
      blurb: 'Shields appear. Frontal blocks reduce damage and formations actually hold ground.',
      color: 0xb98341, accent: 0xf0c078,
      traits: ['block', 'formation', 'phalanx-push'],
      mods: { blockChance: 0.14, blockReduce: 0.58, dmgMul: 1.10, hpMul: 1.08, speedMul: 0.99 },
      power: { id: 'pw_volley', name: 'Arrow Volley' }
    },
    {
      index: 2, id: 'iron', name: 'Iron Age', mood: 'medieval',
      tag: 'Armour & Discipline',
      blurb: 'Real armour and armour-piercing weapons. Slower, heavier, far harder to break.',
      color: 0x8d949c, accent: 0xd9e2ea,
      traits: ['armor', 'armor-pierce', 'formation', 'discipline'],
      mods: { armorFlat: 3, dmgMul: 1.22, hpMul: 1.20, speedMul: 0.96, dmgTakenMul: 0.94 },
      power: { id: 'pw_pilum', name: 'Pilum Storm' }
    },
    {
      index: 3, id: 'medieval', name: 'Medieval', mood: 'medieval',
      tag: 'Charge & Volley',
      blurb: 'Cavalry charges that trade momentum for impact, and arcing longbow volleys.',
      color: 0x5a6f9c, accent: 0xd8b45a,
      traits: ['charge', 'arcing-fire', 'block', 'armor'],
      mods: { chargeDmgMul: 1.55, dmgMul: 1.34, hpMul: 1.33, rangeMul: 1.12, blockChance: 0.10 },
      power: { id: 'pw_rain', name: 'Rain of Arrows' }
    },
    {
      index: 4, id: 'gunpowder', name: 'Gunpowder', mood: 'renaissance',
      tag: 'Volley Fire',
      blurb: 'Reload cycles replace attack speed. Bullets shred armour; cannons splash.',
      color: 0x6b6257, accent: 0xffb35c,
      traits: ['reload-cycle', 'armor-shred', 'splash', 'suppress'],
      mods: { rangedDmgMul: 1.48, dmgMul: 1.44, hpMul: 1.42, atkSpeedMul: 0.82, rangeMul: 1.28, armorFlat: 2 },
      power: { id: 'pw_barrage', name: 'Cannon Barrage' }
    },
    {
      index: 5, id: 'industrial', name: 'Industrial', mood: 'industrial',
      tag: 'Sustained Fire',
      blurb: 'Automatic fire suppresses and stacks. Trenches give cover; walkers absorb.',
      color: 0x4e5459, accent: 0xff8a3c,
      traits: ['sustained-fire', 'suppress', 'cover', 'repair', 'splash'],
      mods: { rangedDmgMul: 1.55, dmgMul: 1.56, hpMul: 1.55, atkSpeedMul: 1.25, rangeMul: 1.36, rangedDmgTakenMul: 0.90 },
      power: { id: 'pw_shell', name: 'Artillery Strike' }
    },
    {
      index: 6, id: 'modern', name: 'Modern', mood: 'modern',
      tag: 'Combined Arms',
      blurb: 'Full-auto weapons, real cover use, and air support that reaches the back line.',
      color: 0x46584a, accent: 0x8ef0a0,
      traits: ['full-auto', 'cover', 'air-support', 'armor-pierce', 'splash'],
      mods: { dmgMul: 1.70, hpMul: 1.68, rangedDmgMul: 1.30, atkSpeedMul: 1.35, rangeMul: 1.46, armorFlat: 5 },
      power: { id: 'pw_airstrike', name: 'Air Strike' }
    },
    {
      index: 7, id: 'future', name: 'Future', mood: 'future',
      tag: 'Shields & Beams',
      blurb: 'Regenerating energy shields, beam weapons that ignore armour, drones that flank.',
      color: 0x2f6f8f, accent: 0x7fe9ff,
      traits: ['energy-shield', 'beam', 'ignore-armor', 'drones', 'teleport'],
      mods: { dmgMul: 1.92, hpMul: 1.82, shieldFlat: 26, rangeMul: 1.55, atkSpeedMul: 1.20, dmgTakenMul: 0.92 },
      power: { id: 'pw_orbital', name: 'Orbital Lance' }
    }
  ];

  /* Keep the era table exactly as long as Core's era name list. */
  (function alignEras() {
    var i;
    for (i = 0; i < ERAS.length && i < ERA_LIST.length; i++) { ERAS[i].coreName = ERA_LIST[i]; }
    while (ERAS.length > ERA_LIST.length) { ERAS.pop(); }
    for (i = ERAS.length; i < ERA_LIST.length; i++) {
      ERAS.push({
        index: i, id: 'era' + i, name: ERA_LIST[i], coreName: ERA_LIST[i], mood: 'future',
        tag: 'Unknown', blurb: '', color: 0x888888, accent: 0xffffff,
        traits: [], mods: {}, power: null
      });
    }
  })();

  var ERA_MAX = ERAS.length - 1;

  function eraDef(i) { return ERAS[clamp(int(i, 0), 0, ERA_MAX)]; }
  function curEraIndex() { return clamp(int(state.eraIndex, 0), 0, ERA_MAX); }
  function curEra() { return eraDef(curEraIndex()); }

  /* ===========================================================================
   * 4. ROSTER — 5 units per era. Sim may use these as base stats; the values
   *    are already era-scaled so the era `mods` are a flavour layer on top.
   * ======================================================================== */
  function U(id, name, cls, cost, pop, hp, dmg, rng, spd, atkSpd, armor, traits) {
    return {
      id: id, name: name, cls: cls, cost: cost, pop: pop,
      hp: hp, dmg: dmg, range: rng, speed: spd, atkSpeed: atkSpd, armor: armor,
      traits: traits || [], era: 0, tier: 0
    };
  }

  var ROSTER = [
    /* --- 0 Stone: cheap, fast, fragile ---------------------------------- */
    [
      U('st_club',    'Clubman',       'assault',    58,  1,  110,  13, 1.8, 5.6, 1.00, 0, ['rage']),
      U('st_hide',    'Hide Bearer',   'defender',   86,  1,  205,   9, 1.7, 4.4, 0.85, 1, ['taunt']),
      U('st_sling',   'Slinger',       'ranged',     78,  1,   82,  15, 26,  5.0, 0.80, 0, ['arcing-fire']),
      U('st_tamer',   'Beast Tamer',   'specialist',150,  2,  260,  26, 2.2, 6.4, 0.95, 0, ['beast', 'bleed']),
      U('st_chief',   'Chieftain',     'champion',  330,  3,  620,  44, 2.4, 5.2, 0.90, 2, ['aura-rage', 'cleave'])
    ],
    /* --- 1 Bronze: shields, formation ----------------------------------- */
    [
      U('br_spear',   'Spearman',      'assault',    96,  1,  165,  19, 2.6, 5.4, 1.00, 1, ['reach', 'brace']),
      U('br_hoplite', 'Hoplite',       'defender',  132,  1,  330,  14, 1.9, 4.2, 0.85, 3, ['shield', 'phalanx']),
      U('br_archer',  'Bronze Archer', 'ranged',    118,  1,  118,  21, 30,  4.9, 0.90, 0, ['arcing-fire']),
      U('br_chariot', 'War Chariot',   'specialist',236,  2,  400,  33, 2.2, 8.6, 0.90, 2, ['charge', 'trample']),
      U('br_king',    'War-King',      'champion',  440,  3,  880,  58, 2.6, 5.0, 0.95, 4, ['aura-guard', 'shield'])
    ],
    /* --- 2 Iron: armour and armour-piercing ------------------------------ */
    [
      U('ir_legion',  'Legionary',     'assault',   142,  1,  245,  28, 2.2, 5.2, 1.05, 3, ['pilum', 'armor-pierce']),
      U('ir_wall',    'Shieldwall',    'defender',  188,  1,  480,  18, 1.9, 3.9, 0.85, 6, ['shield', 'phalanx', 'brace']),
      U('ir_ballista','Ballista Crew', 'ranged',    178,  2,  160,  46, 40,  3.4, 0.55, 1, ['bolt', 'pierce']),
      U('ir_praet',   'Praetorian',    'specialist',308,  2,  560,  42, 2.3, 5.4, 1.05, 5, ['armor-pierce', 'guard']),
      U('ir_general', 'Iron General',  'champion',  575,  3, 1180,  72, 2.5, 4.9, 1.00, 7, ['aura-discipline', 'cleave'])
    ],
    /* --- 3 Medieval: charge and arcing volleys --------------------------- */
    [
      U('me_maa',     'Man-at-Arms',   'assault',   198,  1,  360,  40, 2.3, 5.3, 1.05, 5, ['armor-pierce']),
      U('me_pavise',  'Pavise Guard',  'defender',  248,  1,  700,  25, 2.0, 3.8, 0.90, 9, ['shield', 'cover']),
      U('me_longbow', 'Longbowman',    'ranged',    234,  1,  215,  40, 46,  4.7, 0.95, 1, ['arcing-fire', 'volley']),
      U('me_knight',  'Knight',        'specialist',408,  2,  820,  62, 2.4, 9.2, 0.95, 8, ['charge', 'trample', 'armor-pierce']),
      U('me_paladin', 'Paladin',       'champion',  735,  3, 1620, 100, 2.6, 5.0, 1.00,10, ['aura-guard', 'heal-aura', 'cleave'])
    ],
    /* --- 4 Gunpowder: reload cycles, splash ------------------------------ */
    [
      U('gp_line',    'Line Infantry', 'assault',   268,  1,  470,  58, 22,  5.0, 0.62, 5, ['reload-cycle', 'armor-shred']),
      U('gp_cuir',    'Cuirassier',    'defender',  324,  1,  930,  36, 2.1, 4.2, 0.90,12, ['shield', 'brace']),
      U('gp_gren',    'Grenadier',     'ranged',    312,  2,  400,  72, 24,  4.4, 0.55, 6, ['splash', 'lob']),
      U('gp_cannon',  'Field Cannon',  'specialist',530,  3,  520, 145, 62,  2.4, 0.34, 3, ['splash', 'siege', 'setup']),
      U('gp_marshal', 'Marshal',       'champion',  915,  3, 2050, 132, 3.0, 5.1, 0.90,13, ['aura-volley', 'armor-shred'])
    ],
    /* --- 5 Industrial: sustained fire, cover ----------------------------- */
    [
      U('in_rifle',   'Rifleman',      'assault',   345,  1,  610,  70, 30,  5.2, 0.95, 7, ['sustained-fire', 'cover']),
      U('in_trench',  'Trench Guard',  'defender',  412,  1, 1220,  48, 2.2, 4.0, 0.95,16, ['cover', 'entrench', 'shield']),
      U('in_maxim',   'Maxim Gunner',  'ranged',    405,  2,  520, 100, 40,  3.6, 1.55, 6, ['sustained-fire', 'suppress', 'setup']),
      U('in_mortar',  'Mortar Team',   'specialist',650,  3,  460, 205, 78,  2.2, 0.38, 4, ['splash', 'siege', 'lob']),
      U('in_walker',  'Ironclad Walker','champion', 1180, 4, 3100, 188, 4.0, 3.8, 0.85,22, ['siege', 'trample', 'armored'])
    ],
    /* --- 6 Modern: combined arms ----------------------------------------- */
    [
      U('mo_marine',  'Assault Marine','assault',   436,  1,  790,  92, 34,  5.6, 1.30, 9, ['full-auto', 'cover']),
      U('mo_riot',    'Riot Bulwark',  'defender',  512,  1, 1580,  62, 2.3, 4.3, 1.00,20, ['shield', 'cover', 'taunt']),
      U('mo_dmr',     'Marksman',      'ranged',    500,  2,  620, 168, 60,  4.4, 0.70, 8, ['pierce', 'headshot']),
      U('mo_at',      'AT Launcher',   'specialist',790,  3,  640, 300, 56,  4.0, 0.40, 6, ['splash', 'siege', 'armor-pierce']),
      U('mo_apc',     'APC',           'champion', 1430,  4, 3900, 235, 42,  6.2, 0.85,28, ['transport', 'suppress', 'armored'])
    ],
    /* --- 7 Future: shields, beams, drones -------------------------------- */
    [
      U('fu_pulse',   'Pulse Trooper', 'assault',   548,  1, 1010, 122, 38,  6.0, 1.25,11, ['beam', 'shield-regen']),
      U('fu_aegis',   'Aegis Sentinel','defender',  648,  1, 2000,  84, 2.4, 4.6, 1.05,26, ['energy-shield', 'projector', 'taunt']),
      U('fu_rail',    'Railgunner',    'ranged',    628,  2,  760, 250, 82,  4.4, 0.55,10, ['pierce', 'ignore-armor']),
      U('fu_drone',   'Drone Swarm',   'specialist',975,  3,  560, 155, 30,  9.5, 1.90, 4, ['flying', 'flank', 'swarm']),
      U('fu_titan',   'Titan Mech',    'champion', 1790,  4, 5200, 330, 46,  4.6, 0.80,34, ['siege', 'beam', 'armored', 'shield-regen'])
    ]
  ];

  /* index the roster: id -> def, and stamp era/tier onto each entry */
  var UNIT_BY_ID = Object.create(null);
  (function indexRoster() {
    for (var e = 0; e < ROSTER.length; e++) {
      var row = ROSTER[e];
      for (var i = 0; i < row.length; i++) {
        var d = row[i];
        d.era = e;
        d.tier = i;                      // 0 assault .. 4 champion
        d.eraId = ERAS[e] ? ERAS[e].id : ('era' + e);
        UNIT_BY_ID[d.id] = d;
      }
    }
  })();

  /* Roster slots unlock progressively so wave 1 is not a wall of buttons. */
  var CLASS_UNLOCK_WAVE = { assault: 0, defender: 1, ranged: 3, specialist: 6, champion: 12 };

  /* ===========================================================================
   * 5. PERSISTENT META TREE — 4 branches, every node 5+ tiers, real numbers.
   *    `fx(m, t)` applies tier `t` of the node to the mod bundle.
   * ======================================================================== */
  function node(id, branch, name, tiers, costBase, costGrowth, desc, fx, per, unit, req) {
    return {
      id: id, branch: branch, name: name, tiers: tiers,
      costBase: costBase, costGrowth: costGrowth,
      desc: desc, fx: fx, per: per || 0, unit: unit || '', req: req || null
    };
  }

  var BRANCHES = [
    { id: 'military', name: 'Military',      color: 0xd05a3a, blurb: 'Raw unit power and roster access.' },
    { id: 'economy',  name: 'Economy',       color: 0xe0b24a, blurb: 'Income, discounts, and reserves.' },
    { id: 'fort',     name: 'Fortification', color: 0x5aa0d0, blurb: 'Walls, garrison, and siege.' },
    { id: 'arcane',   name: 'Arcane / Tech', color: 0x9a6ad0, blurb: 'Powers, cooldowns, and relics.' }
  ];

  var META_NODES = [
    /* ---- MILITARY -------------------------------------------------------- */
    node('mil_might',  'military', 'Weapon Mastery', 6, 60, 1.55,
      'All units deal +4% damage per tier.',
      function (t) { mulMod('dmgMul', 1 + 0.04 * t); }, 4, '% dmg'),
    node('mil_vigor',  'military', 'Conditioning', 6, 60, 1.55,
      'All units gain +5% max health per tier.',
      function (t) { mulMod('hpMul', 1 + 0.05 * t); }, 5, '% hp'),
    node('mil_edge',   'military', 'Sharpened Edge', 5, 90, 1.62,
      '+2% critical chance and +6% critical damage per tier.',
      function (t) { addMod('critChance', 0.02 * t); mulMod('critMul', 1 + 0.06 * t); }, 2, '% crit'),
    node('mil_drill',  'military', 'Drill Sergeant', 5, 85, 1.58,
      'Training is 5% faster per tier and army supply +1 per tier.',
      function (t) { mulMod('spawnCdMul', Math.pow(0.95, t)); addMod('supplyAdd', t); }, 5, '% faster'),
    node('mil_vet',    'military', 'Veterancy', 5, 130, 1.70,
      'Units gain +1.5% damage per kill, up to +12% per tier.',
      function (t) { addMod('veterancyPerKill', 0.015); addMod('veterancyCap', 0.12 * t); }, 12, '% cap'),
    node('mil_reach',  'military', 'Long Reach', 5, 110, 1.60,
      'Ranged units gain +3% range and +4% ranged damage per tier.',
      function (t) { mulMod('rangeMul', 1 + 0.03 * t); mulMod('rangedDmgMul', 1 + 0.04 * t); }, 4, '% rng dmg'),
    node('mil_swift',  'military', 'Forced March', 5, 95, 1.56,
      'All units move +3% faster and attack +2.5% faster per tier.',
      function (t) { mulMod('speedMul', 1 + 0.03 * t); mulMod('atkSpeedMul', 1 + 0.025 * t); }, 3, '% speed'),
    node('mil_champ',  'military', 'Champion Doctrine', 5, 175, 1.72,
      'Champions and specialists cost 4% less and hit 5% harder per tier.',
      function (t) { addMod('champDiscount', 0.04 * t); addMod('champDmg', 0.05 * t); }, 5, '% elite'),

    /* ---- ECONOMY --------------------------------------------------------- */
    node('eco_mines',  'economy', 'Deep Mines', 6, 55, 1.54,
      'Kills yield +7% gold per tier.',
      function (t) { mulMod('killGoldMul', 1 + 0.07 * t); }, 7, '% kill gold'),
    node('eco_trade',  'economy', 'Trade Routes', 6, 65, 1.56,
      'Passive and territory income +8% per tier.',
      function (t) { mulMod('incomeMul', 1 + 0.08 * t); }, 8, '% income'),
    node('eco_quarter','economy', 'Quartermaster', 5, 100, 1.63,
      'Units cost 3% less per tier.',
      function (t) { mulMod('unitCostMul', Math.pow(0.97, t)); }, 3, '% cheaper'),
    node('eco_vault',  'economy', 'Grand Vault', 5, 80, 1.58,
      'Gold soft cap +190 per tier — you can bank more before income throttles.',
      function (t) { addMod('softCapAdd', 190 * t); }, 190, ' cap'),
    node('eco_tribute','economy', 'War Tribute', 5, 90, 1.60,
      'Wave-clear rewards +9% per tier.',
      function (t) { mulMod('waveGoldMul', 1 + 0.09 * t); }, 9, '% wave gold'),
    node('eco_grant',  'economy', 'Founding Grant', 5, 70, 1.52,
      'Start every battle with +65 gold per tier.',
      function (t) { addMod('startGoldAdd', 65 * t); }, 65, ' gold'),
    node('eco_forge',  'economy', 'Evolution Forge', 5, 150, 1.68,
      'Era evolution costs 4% less per tier.',
      function (t) { mulMod('evolveCostMul', Math.pow(0.96, t)); }, 4, '% cheaper'),
    node('eco_prosp',  'economy', 'Prospectors', 5, 140, 1.66,
      '+6% gems from play and +5% renown per tier.',
      function (t) { mulMod('gemFindMul', 1 + 0.06 * t); mulMod('renownMul', 1 + 0.05 * t); }, 6, '% find'),

    /* ---- FORTIFICATION --------------------------------------------------- */
    node('fort_walls', 'fort', 'Reinforced Walls', 6, 60, 1.55,
      'Your fort has +9% maximum health per tier.',
      function (t) { mulMod('fortHpMul', 1 + 0.09 * t); }, 9, '% fort hp'),
    node('fort_masons','fort', 'Master Masons', 5, 95, 1.60,
      'Your fort repairs 0.45 HP/sec per tier during battle.',
      function (t) { addMod('fortRegen', 0.45 * t); }, 0.45, ' hp/s'),
    node('fort_gar',   'fort', 'Garrison', 5, 120, 1.66,
      '+1 garrison marksman on the walls per tier (+8% garrison damage).',
      function (t) { addMod('garrisonCount', t); mulMod('garrisonDmgMul', 1 + 0.08 * t); }, 1, ' archer'),
    node('fort_siege', 'fort', 'Siege Engineers', 5, 110, 1.62,
      '+7% damage to enemy structures per tier.',
      function (t) { mulMod('siegeDmgMul', 1 + 0.07 * t); }, 7, '% siege'),
    node('fort_home',  'fort', 'Home Ground', 5, 105, 1.60,
      'Units near your fort gain +2 armour and take 3% less damage per tier.',
      function (t) { addMod('homeGroundArmor', 2 * t); addMod('homeGroundReduce', 0.03 * t); }, 2, ' armour'),
    node('fort_bulwark','fort', 'Bulwark Training', 5, 130, 1.64,
      '+3% block chance and +2% block strength per tier.',
      function (t) { addMod('blockChance', 0.03 * t); addMod('blockReduce', 0.02 * t); }, 3, '% block'),
    node('fort_spikes','fort', 'Wall Spikes', 5, 115, 1.63,
      'Attackers striking your wall take 4% of their damage back per tier.',
      function (t) { addMod('wallSpikes', 0.04 * t); }, 4, '% thorns'),
    node('fort_plate', 'fort', 'Plated Ranks', 5, 125, 1.64,
      'All units +1 armour and take 2% less ranged damage per tier.',
      function (t) { addMod('armorFlat', t); mulMod('rangedDmgTakenMul', Math.pow(0.98, t)); }, 1, ' armour'),

    /* ---- ARCANE / TECH --------------------------------------------------- */
    node('arc_power',  'arcane', 'Focused Power', 6, 70, 1.57,
      'Battlefield powers deal +9% damage per tier.',
      function (t) { mulMod('powerDmgMul', 1 + 0.09 * t); }, 9, '% power dmg'),
    node('arc_flow',   'arcane', 'Ley Flow', 5, 100, 1.62,
      'Power cooldowns are 6% shorter per tier.',
      function (t) { mulMod('powerCdMul', Math.pow(0.94, t)); }, 6, '% cd'),
    node('arc_font',   'arcane', 'Deep Font', 5, 95, 1.60,
      'Energy regenerates 11% faster per tier.',
      function (t) { mulMod('manaRegenMul', 1 + 0.11 * t); }, 11, '% regen'),
    node('arc_echo',   'arcane', 'Echoing Cast', 5, 165, 1.72,
      '4% chance per tier that a power costs nothing.',
      function (t) { addMod('powerFreeChance', 0.04 * t); }, 4, '% free'),
    node('arc_ward',   'arcane', 'Warding Field', 5, 120, 1.63,
      'Your units take 3% less splash and ranged damage per tier.',
      function (t) { mulMod('splashDmgTakenMul', Math.pow(0.97, t)); mulMod('rangedDmgTakenMul', Math.pow(0.97, t)); }, 3, '% ward'),
    node('arc_wide',   'arcane', 'Wide Resonance', 5, 135, 1.66,
      'Power radius +5% per tier.',
      function (t) { mulMod('powerRadiusMul', 1 + 0.05 * t); }, 5, '% radius'),
    node('arc_relic',  'arcane', 'Relic Hunter', 5, 155, 1.70,
      '+1 perk reroll at tier 1, then +3% rare-or-better perk chance per tier.',
      function (t) { addMod('perkRerollAdd', t >= 1 ? 1 : 0); addMod('perkRarityAdd', 0.03 * t); }, 3, '% rarity'),
    node('arc_slots',  'arcane', 'Command Uplink', 5, 200, 1.78,
      '+1 power slot at tiers 2 and 4; +1 perk choice at tier 5.',
      function (t) {
        addMod('extraPowerSlots', (t >= 2 ? 1 : 0) + (t >= 4 ? 1 : 0));
        if (t >= 5) { addMod('offerSizeAdd', 1); }
      }, 1, ' slot')
  ];

  var META_BY_ID = Object.create(null);
  (function indexMeta() {
    for (var i = 0; i < META_NODES.length; i++) { META_BY_ID[META_NODES[i].id] = META_NODES[i]; }
  })();

  function metaTier(id) { return clamp(int(state.upgrades[id], 0), 0, (META_BY_ID[id] ? META_BY_ID[id].tiers : 0)); }

  function metaCost(id, tierOverride) {
    var n = META_BY_ID[id];
    if (!n) return Infinity;
    var t = (tierOverride === undefined) ? metaTier(id) : int(tierOverride, 0);
    if (t >= n.tiers) return Infinity;
    return Math.round(n.costBase * Math.pow(n.costGrowth, t));
  }

  function metaSpentTotal() {
    var total = 0;
    for (var i = 0; i < META_NODES.length; i++) {
      var n = META_NODES[i], t = metaTier(n.id);
      for (var k = 0; k < t; k++) { total += Math.round(n.costBase * Math.pow(n.costGrowth, k)); }
    }
    return total;
  }

  /* ===========================================================================
   * 6. PERKS / RELICS — 30 entries, 4 rarities, synergy tags.
   *    fx(stacks) mutates the mod bundle. `flags` are read by the Sim directly.
   * ======================================================================== */
  function perk(id, name, rarity, tags, max, desc, fx) {
    return { id: id, name: name, rarity: rarity, tags: tags, max: max, desc: desc, fx: fx };
  }

  var PERKS = [
    /* ---------------------------- COMMON --------------------------------- */
    perk('pk_whetstone', 'Whetstone', 'common', ['offense', 'melee'], 5,
      '+8% melee damage.',
      function (n) { mulMod('meleeDmgMul', 1 + 0.08 * n); }),
    perk('pk_fletching', 'Fine Fletching', 'common', ['offense', 'ranged'], 5,
      '+9% ranged damage.',
      function (n) { mulMod('rangedDmgMul', 1 + 0.09 * n); }),
    perk('pk_rations', 'Iron Rations', 'common', ['defense', 'sustain'], 5,
      '+8% maximum health.',
      function (n) { mulMod('hpMul', 1 + 0.08 * n); }),
    perk('pk_boots', 'Marching Boots', 'common', ['tempo', 'swarm'], 4,
      '+7% movement speed, -4% training time.',
      function (n) { mulMod('speedMul', 1 + 0.07 * n); mulMod('spawnCdMul', Math.pow(0.96, n)); }),
    perk('pk_purse', 'Deep Purse', 'common', ['gold'], 5,
      '+12% gold from kills.',
      function (n) { mulMod('killGoldMul', 1 + 0.12 * n); }),
    perk('pk_ledger', 'Merchant Ledger', 'common', ['gold', 'economy'], 4,
      '+14% passive and territory income.',
      function (n) { mulMod('incomeMul', 1 + 0.14 * n); }),
    perk('pk_scraps', 'Salvaged Scraps', 'common', ['defense', 'armor'], 5,
      '+2 armour on every unit.',
      function (n) { addMod('armorFlat', 2 * n); }),
    perk('pk_drums', 'War Drums', 'common', ['tempo', 'morale'], 3,
      '+7% attack speed.',
      function (n) { mulMod('atkSpeedMul', 1 + 0.07 * n); }),

    /* ----------------------------- RARE ---------------------------------- */
    perk('pk_pierce', 'Piercing Shafts', 'rare', ['ranged', 'pierce', 'spear'], 2,
      'Spears and shots pierce 2 extra targets.',
      function (n) { addMod('pierceTargets', 2 * n); }),
    perk('pk_shieldcoin', 'Coin of the Shield', 'rare', ['gold', 'defense', 'block'], 3,
      'Earn 6 gold every time a unit blocks.',
      function (n) { addMod('goldOnBlock', 6 * n); addMod('blockChance', 0.05); }),
    perk('pk_vampiric', 'Vampiric Edge', 'rare', ['sustain', 'blood', 'melee'], 3,
      'Melee attacks heal for 7% of damage dealt.',
      function (n) { addMod('lifestealPct', 0.07 * n); }),
    perk('pk_thorns', 'Bramble Mail', 'rare', ['defense', 'thorns'], 3,
      'Reflect 12% of melee damage taken.',
      function (n) { addMod('thornsPct', 0.12 * n); }),
    perk('pk_cleave', 'Wide Arc', 'rare', ['offense', 'melee', 'cleave'], 3,
      'Melee attacks cleave a 2.2m arc for 45% damage.',
      function (n) { addMod('cleaveRadius', 2.2 * n); }),
    perk('pk_crit', 'Killer Instinct', 'rare', ['offense', 'crit'], 4,
      '+7% critical chance.',
      function (n) { addMod('critChance', 0.07 * n); }),
    perk('pk_bounty', 'Bounty Hunter', 'rare', ['gold', 'crit'], 3,
      'Critical hits pay 4 gold each.',
      function (n) { addMod('goldOnCrit', 4 * n); }),
    perk('pk_bulwark', 'Bulwark', 'rare', ['defense', 'block', 'armor'], 3,
      '+10% block chance and blocks absorb 8% more.',
      function (n) { addMod('blockChance', 0.10 * n); addMod('blockReduce', 0.08 * n); }),
    perk('pk_quartermaster', 'Field Quartermaster', 'rare', ['economy', 'swarm'], 3,
      'Units cost 8% less.',
      function (n) { mulMod('unitCostMul', Math.pow(0.92, n)); }),
    perk('pk_engineer', 'Siege Engineer', 'rare', ['siege', 'offense'], 3,
      '+22% damage to forts, +12% gold from fort damage.',
      function (n) { mulMod('siegeDmgMul', 1 + 0.22 * n); mulMod('fortDamageGoldMul', 1 + 0.12 * n); }),
    perk('pk_medic', 'Field Medic', 'rare', ['sustain', 'support'], 3,
      'Units heal 6% of max health on every kill.',
      function (n) { addMod('healOnKill', 0.06 * n); }),
    perk('pk_mason', 'Stonecutter', 'rare', ['fort', 'defense'], 3,
      'Fort +12% max HP and repairs 1.2 HP/sec.',
      function (n) { mulMod('fortHpMul', 1 + 0.12 * n); addMod('fortRegen', 1.2 * n); }),

    /* ----------------------------- EPIC ---------------------------------- */
    perk('pk_revive', 'Second Wind', 'epic', ['sustain', 'revive'], 2,
      'The first unit to die each wave revives at 50% health.',
      function (n) { addMod('reviveCharges', n); maxMod('reviveHpPct', 0.5); }),
    perk('pk_berserk', 'Blood Frenzy', 'epic', ['offense', 'blood', 'rage'], 3,
      'Units deal up to +55% damage as their health falls.',
      function (n) { addMod('lowHpRageMul', 0.55 * n); }),
    perk('pk_juggernaut', 'Juggernaut', 'epic', ['defense', 'armor', 'charge'], 2,
      '-14% damage taken, +30% knockback dealt.',
      function (n) { mulMod('dmgTakenMul', Math.pow(0.86, n)); mulMod('knockbackMul', 1 + 0.30 * n); }),
    perk('pk_warchest', 'War Chest', 'epic', ['gold', 'economy'], 2,
      'Gold soft cap +600 and wave rewards +25%.',
      function (n) { addMod('softCapAdd', 600 * n); mulMod('waveGoldMul', 1 + 0.25 * n); }),
    perk('pk_overcharge', 'Overcharge', 'epic', ['arcane', 'power'], 2,
      'Powers deal +35% damage and recharge 18% faster.',
      function (n) { mulMod('powerDmgMul', 1 + 0.35 * n); mulMod('powerCdMul', Math.pow(0.82, n)); }),
    perk('pk_vanguard', 'Vanguard Charge', 'epic', ['offense', 'charge', 'tempo'], 2,
      'First strike after closing deals +80% damage.',
      function (n) { mulMod('firstStrikeMul', 1 + 0.80 * n); mulMod('chargeDmgMul', 1 + 0.35 * n); }),
    perk('pk_conscript', 'Mass Conscription', 'epic', ['swarm', 'economy'], 2,
      '+6 army supply, -22% training time, -6% unit health.',
      function (n) { addMod('supplyAdd', 6 * n); mulMod('spawnCdMul', Math.pow(0.78, n)); mulMod('hpMul', Math.pow(0.94, n)); }),
    perk('pk_garrisoncmd', 'Garrison Command', 'epic', ['fort', 'ranged'], 2,
      '+2 garrison marksmen firing 30% harder.',
      function (n) { addMod('garrisonCount', 2 * n); mulMod('garrisonDmgMul', 1 + 0.30 * n); }),

    /* -------------------------- LEGENDARY -------------------------------- */
    perk('pk_dynasty', 'Dynasty', 'legendary', ['economy', 'era'], 1,
      'Era evolution costs 25% less and heals your fort completely.',
      function (n) { mulMod('evolveCostMul', Math.pow(0.75, n)); addMod('evolveFullHeal', n); }),
    perk('pk_immortal', 'Immortal Legion', 'legendary', ['sustain', 'revive', 'blood'], 1,
      'Every unit revives once per wave at 35% health.',
      function (n) { addMod('reviveCharges', 99 * n); maxMod('reviveHpPct', 0.35); addMod('reviveAll', n); }),
    perk('pk_midas', 'Midas Doctrine', 'legendary', ['gold', 'crit'], 1,
      'All gold income +40%; critical hits pay double bounty.',
      function (n) { mulMod('killGoldMul', 1 + 0.40 * n); mulMod('incomeMul', 1 + 0.40 * n); mulMod('waveGoldMul', 1 + 0.40 * n); addMod('goldOnCrit', 6 * n); }),
    perk('pk_apex', 'Apex Doctrine', 'legendary', ['offense', 'elite'], 1,
      'Champions and specialists deal +45% damage and cost 20% less.',
      function (n) { addMod('champDmg', 0.45 * n); addMod('champDiscount', 0.20 * n); }),
    perk('pk_singularity', 'Singularity Core', 'legendary', ['arcane', 'power', 'era'], 1,
      'Powers cost nothing 20% of the time and hit 45% wider.',
      function (n) { addMod('powerFreeChance', 0.20 * n); mulMod('powerRadiusMul', 1 + 0.45 * n); mulMod('powerDmgMul', 1.25); }),

    /* ------------------- SYNERGY PAYOFF PERKS (scale off tags) ----------- */
    perk('pk_bloodline', 'Bloodline', 'epic', ['blood', 'synergy'], 1,
      '+6% damage and +4% lifesteal for every BLOOD perk you own.',
      function (n) {
        var c = countTag('blood');
        mulMod('dmgMul', 1 + 0.06 * c * n);
        addMod('lifestealPct', 0.04 * c * n);
      }),
    perk('pk_hoard', 'Dragon Hoard', 'epic', ['gold', 'synergy'], 1,
      '+10% income for every GOLD perk you own.',
      function (n) {
        var c = countTag('gold');
        mulMod('incomeMul', 1 + 0.10 * c * n);
        mulMod('killGoldMul', 1 + 0.06 * c * n);
      }),
    perk('pk_aegis', 'Aegis Doctrine', 'epic', ['defense', 'synergy'], 1,
      '-4% damage taken for every DEFENSE perk you own.',
      function (n) {
        var c = countTag('defense');
        mulMod('dmgTakenMul', Math.pow(0.96, c * n));
      })
  ];

  var PERK_BY_ID = Object.create(null);
  (function indexPerks() {
    for (var i = 0; i < PERKS.length; i++) { PERK_BY_ID[PERKS[i].id] = PERKS[i]; }
  })();

  function perkStacks(id) { return clamp(int(state.perks[id], 0), 0, 99); }
  function hasPerk(id) { return perkStacks(id) > 0; }

  function countTag(tag) {
    var c = 0, id, p, n;
    for (id in state.perks) {
      n = int(state.perks[id], 0);
      if (n <= 0) continue;
      p = PERK_BY_ID[id];
      if (!p || !p.tags) continue;
      for (var i = 0; i < p.tags.length; i++) {
        if (p.tags[i] === tag) { c += n; break; }
      }
    }
    return c;
  }

  function ownedPerkTagWeights() {
    var w = Object.create(null), id, p, n, i;
    for (id in state.perks) {
      n = int(state.perks[id], 0);
      if (n <= 0) continue;
      p = PERK_BY_ID[id];
      if (!p) continue;
      for (i = 0; i < p.tags.length; i++) { w[p.tags[i]] = (w[p.tags[i]] || 0) + n; }
    }
    return w;
  }

  /* ===========================================================================
   * 7. EQUIPMENT (loadout slots) — earned, never sold for gems.
   * ======================================================================== */
  function gear(id, slot, name, rarity, desc, fx, unlockWave) {
    return { id: id, slot: slot, name: name, rarity: rarity, desc: desc, fx: fx, unlockWave: unlockWave || 0 };
  }

  var EQUIPMENT = [
    /* weapon */
    gear('eq_honed',   'weapon', 'Honed Blades',    'common', '+6% damage.',
      function () { mulMod('dmgMul', 1.06); }, 0),
    gear('eq_barbed',  'weapon', 'Barbed Heads',    'rare',   '+10% damage, -3% attack speed.',
      function () { mulMod('dmgMul', 1.10); mulMod('atkSpeedMul', 0.97); }, 15),
    gear('eq_light',   'weapon', 'Balanced Arms',   'rare',   '+9% attack speed.',
      function () { mulMod('atkSpeedMul', 1.09); }, 15),
    gear('eq_breaker', 'weapon', 'Armour Breakers', 'epic',   '+18% damage to armoured targets, +12% siege.',
      function () { addMod('armorPierceFlat', 4); mulMod('siegeDmgMul', 1.12); }, 30),
    /* armour */
    gear('eq_padded',  'armor',  'Padded Kit',      'common', '+7% health.',
      function () { mulMod('hpMul', 1.07); }, 0),
    gear('eq_scale',   'armor',  'Scaled Harness',  'rare',   '+3 armour, -2% speed.',
      function () { addMod('armorFlat', 3); mulMod('speedMul', 0.98); }, 20),
    gear('eq_shieldk', 'armor',  'Tower Shields',   'rare',   '+8% block chance.',
      function () { addMod('blockChance', 0.08); }, 20),
    gear('eq_ward',    'armor',  'Warded Cloaks',   'epic',   '-10% ranged and splash damage taken.',
      function () { mulMod('rangedDmgTakenMul', 0.90); mulMod('splashDmgTakenMul', 0.90); }, 35),
    /* trinket */
    gear('eq_charm',   'trinket','Lucky Charm',     'common', '+3% critical chance.',
      function () { addMod('critChance', 0.03); }, 25),
    gear('eq_horn',    'trinket','Rally Horn',      'rare',   '+5% speed and +4% attack speed.',
      function () { mulMod('speedMul', 1.05); mulMod('atkSpeedMul', 1.04); }, 25),
    gear('eq_coinpurse','trinket','Tax Seal',       'rare',   '+12% kill gold.',
      function () { mulMod('killGoldMul', 1.12); }, 25),
    gear('eq_core',    'trinket','Resonant Core',   'epic',   '+15% power damage, -10% power cooldown.',
      function () { mulMod('powerDmgMul', 1.15); mulMod('powerCdMul', 0.90); }, 40),
    /* banner (also a cosmetic slot, but carries a small aura) */
    gear('eq_bnr_gold','banner', 'Banner of Coin',  'common', '+6% passive income.',
      function () { mulMod('incomeMul', 1.06); }, 10),
    gear('eq_bnr_iron','banner', 'Banner of Iron',  'common', '+1 armour, +3% health.',
      function () { addMod('armorFlat', 1); mulMod('hpMul', 1.03); }, 10),
    gear('eq_bnr_fire','banner', 'Banner of Fire',  'rare',   '+6% damage.',
      function () { mulMod('dmgMul', 1.06); }, 30)
  ];

  var GEAR_BY_ID = Object.create(null);
  (function indexGear() {
    for (var i = 0; i < EQUIPMENT.length; i++) { GEAR_BY_ID[EQUIPMENT[i].id] = EQUIPMENT[i]; }
  })();

  var GEAR_SLOTS = ['weapon', 'armor', 'trinket', 'banner'];

  /* ===========================================================================
   * 8. STORE CATALOG
   *    currency: 'gold' | 'gems' | 'renown' | 'free'
   *    power:true  => MUST NOT be priced in gems (validateCatalog enforces this)
   * ======================================================================== */
  var FAIRNESS = {
    rule: 'Premium currency never buys power. Gems are earned by play only.',
    gemsAreEarnable: true,
    powerCurrencies: ['gold', 'renown', 'free'],
    premiumCurrencies: ['gems']
  };

  function item(id, cat, name, currency, price, desc, opts) {
    var it = {
      id: id, cat: cat, name: name, currency: currency, price: price, desc: desc,
      power: false, repeat: false, max: 1, tint: 0xffffff, unlockWave: 0, seasonOnly: false
    };
    if (isObj(opts)) { for (var k in opts) { it[k] = opts[k]; } }
    return it;
  }

  var STORE = [
    /* ---- cosmetics: unit skin sets (pure visuals) ------------------------ */
    item('sk_bone',    'skin', 'Bone Warband',        'gems',   240, 'Bleached bone armour set for every era.', { tint: 0xe8e0cf }),
    item('sk_crimson', 'skin', 'Crimson Legion',      'gems',   240, 'Deep-red lacquer and gold trim.', { tint: 0xc0392b }),
    item('sk_frost',   'skin', 'Frostbound',          'gems',   320, 'Rime-covered plate with a cold mist.', { tint: 0x8fd4ff }),
    item('sk_obsidian','skin', 'Obsidian Order',      'gems',   320, 'Matte black plate with an ember glow.', { tint: 0x2b2b33 }),
    item('sk_verdant', 'skin', 'Verdant Host',        'gold', 18000, 'Living wood and moss. Earned with gold alone.', { tint: 0x4f8f4a }),
    item('sk_gilded',  'skin', 'Gilded Vanguard',     'renown', 900, 'Solid gold. A renown flex, not a purchase.', { tint: 0xf2c14e }),

    /* ---- cosmetics: banners --------------------------------------------- */
    item('bn_wolf',    'banner', 'Wolf Standard',     'gold',  4200, 'A snarling wolf on split field.', { tint: 0x8a8f98 }),
    item('bn_sun',     'banner', 'Sunburst Standard', 'gold',  4200, 'Rayed sun on deep vermilion.', { tint: 0xffb347 }),
    item('bn_kraken',  'banner', 'Kraken Standard',   'gems',   180, 'Ink-black tentacles on storm blue.', { tint: 0x2e5f8a }),
    item('bn_phoenix', 'banner', 'Phoenix Standard',  'gems',   260, 'Animated ember trail.', { tint: 0xff6a2b }),

    /* ---- cosmetics: effects --------------------------------------------- */
    item('fx_embers',  'effect', 'Ember Trails',      'gems',   200, 'Units leave drifting embers.', { tint: 0xff8844 }),
    item('fx_frost',   'effect', 'Frost Steps',       'gems',   200, 'Frost blooms under every footfall.', { tint: 0x9fe0ff }),
    item('fx_gold',    'effect', 'Golden Impact',     'gold', 12000, 'Hits burst into gold sparks.', { tint: 0xffd24a }),
    item('fx_voidkill','effect', 'Void Dissolve',     'gems',   280, 'Slain units dissolve into void motes.', { tint: 0x7a4fd0 }),
    item('fx_evolve',  'effect', 'Ascension Pillar',  'renown', 650, 'A light pillar on every era evolution.', { tint: 0xfff0b0 }),

    /* ---- fort cosmetics -------------------------------------------------- */
    item('ft_ivy',     'fort', 'Ivy-Clad Keep',       'gold',  9000, 'Your keep is overgrown with ivy.', { tint: 0x3f7a3f }),
    item('ft_obsid',   'fort', 'Obsidian Keep',       'gems',   300, 'Volcanic glass masonry.', { tint: 0x1e1e26 }),

    /* ---- convenience: quality of life, never power ----------------------- */
    item('cv_slot2',   'convenience', 'Extra Loadout Slot',  'gems',  120, 'One more saved army preset.', { max: 4, repeat: true }),
    item('cv_fastsim', 'convenience', '4× Speed Unlock',     'gold', 6000, 'Adds a 4× battle speed toggle.', {}),
    item('cv_autocoll','convenience', 'Auto-Collect',        'gems',  150, 'Wave rewards bank themselves.', {}),
    item('cv_questslot','convenience','Third Daily Quest',   'gold', 7500, 'One more daily quest each day.', {}),
    item('cv_reroll',  'convenience', 'Extra Perk Reroll',   'gold', 9000, 'Permanently +1 perk reroll per offer.', { power: true }),
    item('cv_respec',  'convenience', 'Free Respec',         'free',    0, 'Refund the meta tree at 60% any time.', {}),

    /* ---- battle pass premium track (COSMETICS ONLY) ---------------------- */
    item('bp_premium', 'pass', 'Season Pass',          'gems', TUNE.bp.premiumGems,
      'Unlocks the premium cosmetic track for this season. No stat rewards, ever.', { seasonOnly: true })
  ];

  var STORE_BY_ID = Object.create(null);

  /**
   * The monetisation guard. Anything power-bearing priced in premium currency
   * is REMOVED from the catalog at boot with a loud warning. This is the rule
   * the brief asked to be written into the code.
   */
  function validateCatalog() {
    var kept = [], i, it, bad;
    for (i = 0; i < STORE.length; i++) {
      it = STORE[i];
      bad = false;
      if (it.power) {
        for (var c = 0; c < FAIRNESS.premiumCurrencies.length; c++) {
          if (it.currency === FAIRNESS.premiumCurrencies[c]) { bad = true; break; }
        }
      }
      if (bad) {
        warn('FAIRNESS VIOLATION: store item "' + it.id + '" sells power for premium currency — removed from the catalog.');
        continue;
      }
      kept.push(it);
      STORE_BY_ID[it.id] = it;
    }
    STORE.length = 0;
    for (i = 0; i < kept.length; i++) { STORE.push(kept[i]); }
  }
  validateCatalog();

  /* ===========================================================================
   * 9. BATTLE PASS TRACK — free track may grant renown; premium is cosmetic
   *    + earnable currency only (never renown, never stats).
   * ======================================================================== */
  function bpReward(kind, id, amount, label) {
    return { kind: kind, id: id || '', amount: amount || 0, label: label || '' };
  }

  var BP_TRACK = (function buildTrack() {
    var track = [], i, lvl;
    var cosmetics = ['bn_wolf', 'fx_embers', 'sk_bone', 'bn_kraken', 'fx_frost', 'sk_crimson',
                     'ft_obsid', 'fx_voidkill', 'bn_phoenix', 'sk_frost'];
    var cIdx = 0;
    for (i = 1; i <= TUNE.bp.levels; i++) {
      lvl = { level: i, free: null, premium: null };

      /* free track: gold, gems, renown, occasional equipment */
      if (i % 10 === 0)      { lvl.free = bpReward('renown', '', 45, '45 Renown'); }
      else if (i % 5 === 0)  { lvl.free = bpReward('gems', '', 12, '12 Gems'); }
      else if (i % 3 === 0)  { lvl.free = bpReward('renown', '', 12, '12 Renown'); }
      else                   { lvl.free = bpReward('gold', '', 400 + i * 55, (400 + i * 55) + ' Gold'); }

      /* premium track: cosmetics + earnable currency ONLY */
      if (i % 4 === 0 && cIdx < cosmetics.length) {
        lvl.premium = bpReward('cosmetic', cosmetics[cIdx++], 1, 'Cosmetic');
      } else if (i % 2 === 0) {
        lvl.premium = bpReward('gems', '', TUNE.store.gemsPerBpLevel * 2, (TUNE.store.gemsPerBpLevel * 2) + ' Gems');
      } else {
        lvl.premium = bpReward('gold', '', 900 + i * 80, (900 + i * 80) + ' Gold');
      }
      track.push(lvl);
    }
    return track;
  })();

  /* Reject any premium reward that would be power. Belt and braces. */
  (function auditTrack() {
    for (var i = 0; i < BP_TRACK.length; i++) {
      var p = BP_TRACK[i].premium;
      if (p && (p.kind === 'renown' || p.kind === 'meta' || p.kind === 'perk' || p.kind === 'equipment')) {
        warn('FAIRNESS VIOLATION: premium battle-pass level ' + (i + 1) + ' granted power — downgraded to gems.');
        BP_TRACK[i].premium = bpReward('gems', '', 10, '10 Gems');
      }
    }
  })();

  /* ===========================================================================
   * 10. UNLOCK CADENCE — something new roughly every 5 waves for the first hour
   * ======================================================================== */
  var UNLOCKS = [
    { wave: 1,  id: 'un_defender',  kind: 'unit',    label: 'Defenders available' },
    { wave: 2,  id: 'un_stance',    kind: 'feature', label: 'Stance orders unlocked' },
    { wave: 3,  id: 'un_ranged',    kind: 'unit',    label: 'Ranged units available' },
    { wave: 4,  id: 'un_treasury',  kind: 'feature', label: 'Treasury investment unlocked' },
    { wave: 5,  id: 'un_evolve',    kind: 'feature', label: 'ERA EVOLUTION unlocked' },
    { wave: 5,  id: 'un_perks',     kind: 'feature', label: 'Relic offers begin' },
    { wave: 6,  id: 'un_special',   kind: 'unit',    label: 'Specialists available' },
    { wave: 8,  id: 'un_power1',    kind: 'feature', label: 'Battlefield power slot I' },
    { wave: 10, id: 'un_loadout',   kind: 'feature', label: 'Army presets unlocked' },
    { wave: 10, id: 'un_meta',      kind: 'feature', label: 'Warlord tree unlocked' },
    { wave: 12, id: 'un_champion',  kind: 'unit',    label: 'Champions available' },
    { wave: 14, id: 'un_gear1',     kind: 'feature', label: 'Equipment: weapon + armour' },
    { wave: 16, id: 'un_quests',    kind: 'feature', label: 'Daily quests unlocked' },
    { wave: 18, id: 'un_bp',        kind: 'feature', label: 'Seasonal track unlocked' },
    { wave: 20, id: 'un_boss',      kind: 'feature', label: 'Boss waves begin' },
    { wave: 22, id: 'un_power2',    kind: 'feature', label: 'Battlefield power slot II' },
    { wave: 25, id: 'un_gear2',     kind: 'feature', label: 'Equipment: trinket slot' },
    { wave: 28, id: 'un_store',     kind: 'feature', label: 'Full store unlocked' },
    { wave: 30, id: 'un_elite',     kind: 'feature', label: 'Elite enemy modifiers' },
    { wave: 35, id: 'un_power3',    kind: 'feature', label: 'Battlefield power slot III' },
    { wave: 40, id: 'un_endless',   kind: 'feature', label: 'Endless mode unlocked' },
    { wave: 45, id: 'un_gear3',     kind: 'feature', label: 'Equipment: banner slot' },
    { wave: 50, id: 'un_prestige',  kind: 'feature', label: 'Prestige track unlocked' },
    { wave: 60, id: 'un_nightmare', kind: 'feature', label: 'Nightmare difficulty' }
  ];

  function isUnlocked(id) { return !!state.unlocks[id]; }

  function grantUnlock(u, silent) {
    if (!u || state.unlocks[u.id]) return false;
    state.unlocks[u.id] = 1;
    emit('unlock:new', { id: u.id, label: u.label, kind: u.kind });
    if (!silent) toast(u.label, 'unlock');
    return true;
  }

  function checkUnlocks(wave) {
    var w = int(wave, state.wave), i, n = 0;
    for (i = 0; i < UNLOCKS.length; i++) {
      if (UNLOCKS[i].wave <= w && grantUnlock(UNLOCKS[i], false)) { n++; }
    }
    /* Best-wave-based unlocks persist even after a defeat. */
    var best = int(state.stats && state.stats.bestWave, 0);
    if (best > w) {
      for (i = 0; i < UNLOCKS.length; i++) {
        if (UNLOCKS[i].wave <= best) { grantUnlock(UNLOCKS[i], true); }
      }
    }
    return n;
  }

  /* ===========================================================================
   * 11. DAILY REWARDS + QUESTS
   * ======================================================================== */
  var DAILY_LADDER = [
    { day: 1, rewards: [bpReward('gold', '', 800, '800 Gold')] },
    { day: 2, rewards: [bpReward('gems', '', 6, '6 Gems')] },
    { day: 3, rewards: [bpReward('renown', '', 25, '25 Renown')] },
    { day: 4, rewards: [bpReward('gold', '', 2200, '2200 Gold')] },
    { day: 5, rewards: [bpReward('gems', '', 14, '14 Gems')] },
    { day: 6, rewards: [bpReward('renown', '', 55, '55 Renown')] },
    { day: 7, rewards: [bpReward('gems', '', 30, '30 Gems'), bpReward('cosmetic', 'bn_sun', 1, 'Sunburst Standard')] }
  ];

  function quest(id, name, metric, goal, rewards, weight) {
    return { id: id, name: name, metric: metric, goal: goal, rewards: rewards, weight: weight || 1 };
  }

  var QUEST_POOL = [
    quest('q_kill50',   'Cull the Ranks',      'kills',        50,  [bpReward('gold', '', 1400, '1400 Gold'), bpReward('gems', '', 5, '5 Gems')], 3),
    quest('q_kill150',  'Field of Bones',      'kills',       150,  [bpReward('renown', '', 30, '30 Renown')], 2),
    quest('q_wave10',   'Hold the Line',       'waves',        10,  [bpReward('gold', '', 2000, '2000 Gold')], 3),
    quest('q_wave20',   'Long Campaign',       'waves',        20,  [bpReward('renown', '', 45, '45 Renown')], 2),
    quest('q_evolve2',  'March of Ages',       'evolves',       2,  [bpReward('gems', '', 8, '8 Gems')], 3),
    quest('q_evolve4',  'Ascendant',           'evolves',       4,  [bpReward('renown', '', 40, '40 Renown')], 1),
    quest('q_gold8k',   'Full Coffers',        'goldEarned', 8000,  [bpReward('gold', '', 2500, '2500 Gold')], 3),
    quest('q_spend6k',  'Total War Economy',   'goldSpent',  6000,  [bpReward('gems', '', 6, '6 Gems')], 3),
    quest('q_boss1',    'Giant Slayer',        'bosses',        1,  [bpReward('gems', '', 12, '12 Gems')], 2),
    quest('q_boss3',    'Titanfall',           'bosses',        3,  [bpReward('renown', '', 60, '60 Renown')], 1),
    quest('q_perks3',   'Relic Seeker',        'perks',         3,  [bpReward('gold', '', 1800, '1800 Gold')], 3),
    quest('q_powers10', 'Channeller',          'powers',       10,  [bpReward('gems', '', 5, '5 Gems')], 2),
    quest('q_block40',  'Shield Discipline',   'blocks',       40,  [bpReward('gold', '', 1500, '1500 Gold')], 2),
    quest('q_fortdmg',  'Breach the Gate',     'fortDmg',    4000,  [bpReward('renown', '', 28, '28 Renown')], 2),
    quest('q_win1',     'Victor',              'wins',          1,  [bpReward('gems', '', 15, '15 Gems'), bpReward('renown', '', 35, '35 Renown')], 2),
    quest('q_champ5',   'Elite Command',       'champBought',   5,  [bpReward('gold', '', 2600, '2600 Gold')], 2)
  ];

  var QUEST_BY_ID = Object.create(null);
  (function indexQuests() {
    for (var i = 0; i < QUEST_POOL.length; i++) { QUEST_BY_ID[QUEST_POOL[i].id] = QUEST_POOL[i]; }
  })();

  function dayIndex(ms) {
    var t = num(ms, Date.now());
    /* local-day bucket: shift by the timezone offset so a "day" is the player's day */
    var d = new Date(t);
    var off = d.getTimezoneOffset() * 60000;
    return Math.floor((t - off) / 86400000);
  }

  /* ===========================================================================
   * 12. STATE — persistent meta + run-scoped economy
   * ======================================================================== */
  var meta = {
    renown: 0,
    renownLifetime: 0,
    gemsLifetime: 0,

    owned: {},              // storeId -> count
    equipped: { weapon: '', armor: '', trinket: '', banner: '' },
    cosmetics: { skin: '', banner: '', effect: '', fort: '' },

    gearOwned: { eq_honed: 1, eq_padded: 1 },

    loadouts: [],           // [{name, units:[ids], gear:{...}}]
    loadoutSlots: 3,
    activeLoadout: 0,

    daily: { lastDay: -1, streak: 0, claimedDay: 0, questDay: -1, quests: [], rerolls: 1 },

    bp: { season: 1, xp: 0, level: 1, premium: false, claimedFree: {}, claimedPrem: {}, startedDay: -1 },

    lifetime: { evolves: 0, perksTaken: 0, metaBought: 0, storeBought: 0, questsDone: 0, dailyClaims: 0 }
  };

  var run = {
    treasury: 0,
    incomeRate: 0,          // gold/sec, computed
    incomeAcc: 0,           // accumulator for the income tick
    territory: 0,           // -1 .. +1 map control (from the player's view)
    earnedThisRun: 0,
    spentThisRun: 0,
    killGold: 0,
    territoryGold: 0,
    passiveGold: 0,
    siegeGold: 0,
    evolvesThisRun: 0,
    perksThisRun: 0,
    supplyUsed: 0,
    spawnCd: 0,
    lastOfferWave: 0,
    offer: null,            // {choices:[perkIds], reason, rerolls}
    rerollsLeft: 0,
    milestones: {},
    questProgress: {},      // metric -> value accumulated today
    goldLeaked: 0
  };

  /* ===========================================================================
   * 13. MODIFIER RECOMPUTE
   * ======================================================================== */
  var _modsEvt = { mods: mods };
  var _recomputeQueued = false;

  function recompute() {
    resetMods();

    var i, n, t, e, id, p, stacks, g, slot;

    /* --- meta tree (persistent) ---------------------------------------- */
    for (i = 0; i < META_NODES.length; i++) {
      n = META_NODES[i];
      t = metaTier(n.id);
      if (t <= 0) continue;
      try { n.fx(t); } catch (err) { warn('meta node "' + n.id + '" fx threw', err); }
    }

    /* --- era identity ---------------------------------------------------- */
    e = curEra();
    if (e && e.mods) {
      for (id in e.mods) {
        var v = e.mods[id];
        if (!has(MOD_DEFAULTS, id)) { mods[id] = v; continue; }
        /* keys defaulting to 1 are multiplicative; keys defaulting to 0 add. */
        if (MOD_DEFAULTS[id] === 1) { mods[id] *= v; }
        else if (MOD_DEFAULTS[id] === 0) { mods[id] += v; }
        else { mods[id] = Math.max(mods[id], v); }
      }
    }

    /* --- equipment ------------------------------------------------------- */
    for (i = 0; i < GEAR_SLOTS.length; i++) {
      slot = GEAR_SLOTS[i];
      id = meta.equipped[slot];
      if (!id) continue;
      if (!meta.gearOwned[id]) continue;
      g = GEAR_BY_ID[id];
      if (!g) continue;
      try { g.fx(); } catch (err2) { warn('equipment "' + id + '" fx threw', err2); }
    }

    /* --- run perks ------------------------------------------------------- */
    for (id in state.perks) {
      stacks = int(state.perks[id], 0);
      if (stacks <= 0) continue;
      p = PERK_BY_ID[id];
      if (!p) continue;
      if (stacks > p.max) stacks = p.max;
      try { p.fx(stacks); } catch (err3) { warn('perk "' + id + '" fx threw', err3); }
    }

    /* --- store convenience that legitimately touches numbers ------------- */
    if (meta.owned.cv_reroll) { addMod('perkRerollAdd', 1); }

    /* --- clamps / sanity ------------------------------------------------- */
    mods.critChance   = clamp(mods.critChance, 0, 0.85);
    mods.blockChance  = clamp(mods.blockChance, 0, 0.80);
    mods.blockReduce  = clamp(mods.blockReduce, 0, 0.92);
    mods.lifestealPct = clamp(mods.lifestealPct, 0, 0.75);
    mods.thornsPct    = clamp(mods.thornsPct, 0, 1.5);
    mods.dmgTakenMul  = clamp(mods.dmgTakenMul, 0.25, 3);
    mods.spawnCdMul   = clamp(mods.spawnCdMul, 0.25, 3);
    mods.unitCostMul  = clamp(mods.unitCostMul, 0.40, 3);
    mods.evolveCostMul= clamp(mods.evolveCostMul, 0.40, 3);
    mods.powerCdMul   = clamp(mods.powerCdMul, 0.25, 3);
    mods.powerFreeChance = clamp(mods.powerFreeChance, 0, 0.75);

    /* derived, cached so consumers do not recompute per frame */
    mods.supplyMax = TUNE.army.supplyBase + TUNE.army.supplyPerEra * curEraIndex() + mods.supplyAdd;
    mods.softCap   = TUNE.gold.softCap + mods.softCapAdd + TUNE.treasury.capPerLevel * run.treasury;
    mods.eraIndex  = curEraIndex();
    mods.eraId     = e ? e.id : 'stone';

    recomputeIncome();

    _modsEvt.mods = mods;
    emit('econ:mods', _modsEvt);
    return mods;
  }

  /** Coalesce bursts of changes into one recompute per frame. */
  function queueRecompute() {
    if (_recomputeQueued) return;
    _recomputeQueued = true;
    if (CORE_OK && Core.after) {
      Core.after(0, function () { _recomputeQueued = false; recompute(); });
    } else {
      _recomputeQueued = false;
      recompute();
    }
  }

  /* ===========================================================================
   * 14. IN-BATTLE ECONOMY
   * ======================================================================== */
  function treasuryIncome(level) {
    var l = clamp(int(level, 0), 0, TUNE.treasury.maxLevel);
    if (l <= 0) return 0;
    return TUNE.treasury.incomePer * Math.pow(l, TUNE.treasury.incomeCurve);
  }

  function recomputeIncome() {
    run.incomeRate = (TUNE.gold.passiveBase + treasuryIncome(run.treasury)) * mods.incomeMul;
    return run.incomeRate;
  }

  function treasuryCost(levelOverride) {
    var l = (levelOverride === undefined) ? run.treasury : int(levelOverride, 0);
    if (l >= TUNE.treasury.maxLevel) return Infinity;
    return Math.round(TUNE.treasury.costBase * Math.pow(TUNE.treasury.costGrowth, l) * mods.treasuryCostMul);
  }

  function canBuyTreasury() {
    return run.treasury < TUNE.treasury.maxLevel && state.gold >= treasuryCost();
  }

  var _treasuryEvt = { level: 0, income: 0, cost: 0 };

  function buyTreasury() {
    if (run.treasury >= TUNE.treasury.maxLevel) { toast('Treasury is fully built', 'warn'); return false; }
    var cost = treasuryCost();
    if (!spend(cost, 'treasury')) { toast('Not enough gold', 'warn'); return false; }
    run.treasury++;
    recompute();
    _treasuryEvt.level = run.treasury;
    _treasuryEvt.income = run.incomeRate;
    _treasuryEvt.cost = treasuryCost();
    emit('econ:treasury', _treasuryEvt);
    toast('Treasury ' + run.treasury + ' — +' + (Math.round(run.incomeRate * 10) / 10) + ' gold/s', 'good');
    requestSave();
    return true;
  }

  /**
   * The soft cap. Income above the cap is throttled hard, and a genuine hoard
   * actively bleeds — so sitting on gold is strictly worse than spending it.
   */
  function incomeThrottle() {
    var cap = mods.softCap;
    if (cap <= 0) return 1;
    var g = state.gold;
    if (g <= cap) return 1;
    var over = (g - cap) / cap;
    var m = 1 / (1 + over * TUNE.gold.softCapSlope);
    return m < TUNE.gold.softCapFloor ? TUNE.gold.softCapFloor : m;
  }

  function grant(amount, reason) {
    var a = num(amount, 0);
    if (a <= 0) return 0;
    if (state.gold + a > TUNE.gold.hardCap) { a = Math.max(0, TUNE.gold.hardCap - state.gold); }
    if (a <= 0) return 0;
    run.earnedThisRun += a;
    if (CORE_OK && Core.addGold) { Core.addGold(a, reason || 'income'); }
    else { state.gold += a; }
    return a;
  }

  function spend(cost, reason) {
    var c = Math.max(0, num(cost, 0));
    if (!isFinite(c)) return false;
    if (state.gold < c) return false;
    run.spentThisRun += c;
    if (CORE_OK && Core.spendGold) { return Core.spendGold(c, reason || 'spend'); }
    state.gold -= c;
    return true;
  }

  /* --- territory control ------------------------------------------------- */
  function computeTerritory() {
    var units = state.units;
    if (!isArr(units) || units.length === 0) { return run.territory *= 0.985; }

    var W = num(AOW.W, 420);
    var homeX = 20, awayX = 400;
    if (AOW.FORT_X) { homeX = num(AOW.FORT_X[1], 20); awayX = num(AOW.FORT_X['-1'], 400); }

    var pMax = homeX, eMin = awayX, u, i, n = units.length, any = false;
    for (i = 0; i < n; i++) {
      u = units[i];
      if (!u || u.dead) continue;
      any = true;
      if (u.team === 1) { if (u.x > pMax) pMax = u.x; }
      else if (u.team === -1) { if (u.x < eMin) eMin = u.x; }
    }
    if (!any) { return run.territory *= 0.985; }

    var front = (pMax + eMin) * 0.5;
    var mid = (homeX + awayX) * 0.5;
    var half = (awayX - homeX) * 0.5;
    if (half <= 0) half = 1;
    var ctrl = clamp((front - mid) / half, -1, 1);

    /* smooth so a single suicide runner does not spike income */
    run.territory += (ctrl - run.territory) * 0.08;
    return run.territory;
  }

  var _incomeEvt = { gold: 0, rate: 0, src: 'tick' };

  function economyTick(dt) {
    if (state.phase !== 'battle' && state.phase !== 'prep' && state.phase !== 'wave-clear') { return; }
    if (state.over) return;

    if (run.spawnCd > 0) { run.spawnCd -= dt; if (run.spawnCd < 0) run.spawnCd = 0; }

    run.incomeAcc += dt;
    var tick = TUNE.gold.passiveTick;
    if (run.incomeAcc < tick) return;

    var steps = 0;
    while (run.incomeAcc >= tick && steps < 8) {
      run.incomeAcc -= tick;
      steps++;

      computeTerritory();

      var throttle = incomeThrottle();

      /* passive + treasury */
      var passive = run.incomeRate * tick * throttle;

      /* territory: only the share beyond the deadzone pays, curved */
      var terr = 0;
      var c = run.territory;
      var ac = c < 0 ? -c : c;
      if (ac > TUNE.gold.territoryDeadzone) {
        var eff = (ac - TUNE.gold.territoryDeadzone) / (1 - TUNE.gold.territoryDeadzone);
        eff = Math.pow(clamp01(eff), TUNE.gold.territoryPower);
        if (c > 0) { terr = TUNE.gold.territoryRate * eff * tick * mods.incomeMul * throttle; }
        /* losing ground pays nothing — the pressure is the point */
      }

      run.passiveGold += passive;
      run.territoryGold += terr;
      var total = passive + terr;
      if (total > 0) { grant(total, 'income'); }

      /* the hoard leak: above leakStart × softCap the excess bleeds away */
      var leakAt = mods.softCap * TUNE.gold.leakStart;
      if (state.gold > leakAt) {
        var excess = state.gold - leakAt;
        var lost = excess * TUNE.gold.leakRate * tick;
        if (lost > 0.01) {
          run.goldLeaked += lost;
          if (CORE_OK && Core.addGold) { Core.addGold(-lost, 'hoard-leak'); }
          else { state.gold = Math.max(0, state.gold - lost); }
        }
      }

      /* fort regen from the Fortification branch */
      if (mods.fortRegen > 0 && state.forts && state.forts[1]) {
        var f = state.forts[1];
        if (f.hp > 0 && f.hp < f.max) {
          f.hp = Math.min(f.max, f.hp + mods.fortRegen * tick);
        }
      }
    }

    _incomeEvt.gold = state.gold;
    _incomeEvt.rate = run.incomeRate;
    _incomeEvt.src = 'tick';
    emit('econ:income', _incomeEvt);
  }

  /* ===========================================================================
   * 15. UNIT PURCHASING
   * ======================================================================== */
  function unitDef(id) { return UNIT_BY_ID[id] || null; }

  function rosterFor(eraIndex) {
    var e = clamp(int(eraIndex, curEraIndex()), 0, ROSTER.length - 1);
    return ROSTER[e];
  }

  function availableRoster(eraIndex) {
    var row = rosterFor(eraIndex), out = [], i, d, w = int(state.wave, 0);
    var best = Math.max(w, int(state.stats && state.stats.bestWave, 0));
    for (i = 0; i < row.length; i++) {
      d = row[i];
      var gate = num(CLASS_UNLOCK_WAVE[d.cls], 0);
      if (best >= gate) out.push(d);
    }
    return out;
  }

  function isEliteClass(cls) { return cls === 'champion' || cls === 'specialist'; }

  function unitCost(id) {
    var d = (typeof id === 'string') ? unitDef(id) : id;
    if (!d) return Infinity;
    var c = d.cost * mods.unitCostMul;
    if (isEliteClass(d.cls)) {
      var disc = num(mods.champDiscount, 0);
      if (disc > 0) c *= (1 - clamp(disc, 0, 0.6));
    }
    return Math.max(1, Math.round(c));
  }

  function canAfford(id) { return state.gold >= unitCost(id); }

  function supplyMax() { return Math.max(1, Math.round(mods.supplyMax)); }

  function supplyFree() { return Math.max(0, supplyMax() - run.supplyUsed); }

  var _buyEvt = { def: null, id: '', cls: '', team: 1, era: 0, cost: 0, pop: 1, mods: mods };

  /**
   * Buy a unit. Economy owns the money; the Sim owns the body.
   * Emits `unit:request` — the Sim spawns and (optionally) calls
   * Economy.confirmSpawn(id)/refundUnit(id) if it cannot.
   */
  function buyUnit(id, opts) {
    var d = (typeof id === 'string') ? unitDef(id) : id;
    if (!d) { warn('buyUnit: unknown unit "' + id + '"'); return false; }

    if (d.era > curEraIndex()) {
      toast('Evolve to ' + eraDef(d.era).name + ' first', 'warn');
      return false;
    }

    var best = Math.max(int(state.wave, 0), int(state.stats && state.stats.bestWave, 0));
    if (best < num(CLASS_UNLOCK_WAVE[d.cls], 0)) {
      toast(d.cls.charAt(0).toUpperCase() + d.cls.slice(1) + 's unlock at wave ' + CLASS_UNLOCK_WAVE[d.cls], 'warn');
      return false;
    }

    if (run.spawnCd > 0 && !(opts && opts.ignoreCd)) { return false; }

    var pop = Math.max(1, int(d.pop, 1));
    if (supplyFree() < pop) { toast('Army supply full', 'warn'); return false; }

    var cost = unitCost(d);
    if (state.gold < cost) { toast('Not enough gold', 'warn'); return false; }
    if (!spend(cost, 'unit')) return false;

    run.supplyUsed += pop;
    run.spawnCd = TUNE.army.spawnCooldown * mods.spawnCdMul;

    if (isEliteClass(d.cls)) { addQuestProgress('champBought', 1); }

    _buyEvt.def = d;
    _buyEvt.id = d.id;
    _buyEvt.cls = d.cls;
    _buyEvt.team = (opts && opts.team) ? opts.team : 1;
    _buyEvt.era = d.era;
    _buyEvt.cost = cost;
    _buyEvt.pop = pop;
    _buyEvt.mods = mods;
    emit('unit:request', _buyEvt);

    if (TUNE.misc.autosaveOnBuy) requestSave();
    return true;
  }

  /** The Sim calls this when a requested unit could not actually be spawned. */
  function refundUnit(id, reason) {
    var d = (typeof id === 'string') ? unitDef(id) : id;
    if (!d) return false;
    var pop = Math.max(1, int(d.pop, 1));
    run.supplyUsed = Math.max(0, run.supplyUsed - pop);
    grant(unitCost(d) * TUNE.army.refundOnCancel, reason || 'refund');
    return true;
  }

  /** The Sim calls this when one of our units leaves the field (death/despawn). */
  function releaseSupply(popOrDef) {
    var pop = 1;
    if (typeof popOrDef === 'number') { pop = popOrDef; }
    else if (popOrDef && popOrDef.pop) { pop = popOrDef.pop; }
    else if (typeof popOrDef === 'string' && UNIT_BY_ID[popOrDef]) { pop = UNIT_BY_ID[popOrDef].pop; }
    run.supplyUsed = Math.max(0, run.supplyUsed - Math.max(1, int(pop, 1)));
  }

  /* ===========================================================================
   * 16. ERA EVOLUTION — the save-or-spend hook
   * ======================================================================== */
  function evolveCost(fromIndex) {
    var i = (fromIndex === undefined) ? curEraIndex() : clamp(int(fromIndex, 0), 0, ERA_MAX);
    if (i >= ERA_MAX) return Infinity;
    return Math.round(TUNE.era.costBase * Math.pow(TUNE.era.costGrowth, i) * mods.evolveCostMul);
  }

  function canEvolve() {
    if (curEraIndex() >= ERA_MAX) return false;
    if (!isUnlocked('un_evolve') && int(state.wave, 0) < 5 && int(state.stats && state.stats.bestWave, 0) < 5) return false;
    return state.gold >= evolveCost();
  }

  function evolveProgress() {
    var c = evolveCost();
    if (!isFinite(c) || c <= 0) return 1;
    return clamp01(state.gold / c);
  }

  var _morphEvt = { team: 1, eraIndex: 0, era: '', eraId: '', heal: 0, seconds: 0, color: 0, accent: 0 };
  var _healEvt = { team: 1, amount: 0, hp: 0, max: 0 };

  function evolve() {
    var idx = curEraIndex();
    if (idx >= ERA_MAX) { toast('Already at the final era', 'warn'); return false; }
    if (!canEvolve()) {
      var need = Math.max(0, Math.ceil(evolveCost() - state.gold));
      toast(need > 0 ? ('Need ' + need + ' more gold to evolve') : 'Evolution locked', 'warn');
      return false;
    }

    var cost = evolveCost();
    if (!spend(cost, 'evolve')) return false;

    var next = idx + 1;

    /* --- fort: permanent max gain + partial heal ------------------------- */
    var f = state.forts && state.forts[1];
    if (f) {
      var oldMax = f.max;
      f.max = Math.round(oldMax * (1 + TUNE.era.fortMaxGain));
      var healPct = (num(mods.evolveFullHeal, 0) > 0) ? 1 : TUNE.era.fortHealPct;
      var heal = f.max * healPct;
      var before = f.hp;
      f.hp = clamp(f.hp + heal, 0, f.max);
      _healEvt.team = 1; _healEvt.amount = f.hp - before; _healEvt.hp = f.hp; _healEvt.max = f.max;
      emit('fort:heal', _healEvt);
    }

    /* --- advance the era (Core emits era:evolve) ------------------------- */
    if (CORE_OK && Core.setEra) { Core.setEra(next); }
    else { state.eraIndex = next; state.era = ERA_LIST[next] || ('Era ' + next); }

    run.evolvesThisRun++;
    meta.lifetime.evolves++;
    addQuestProgress('evolves', 1);
    addBpXp(60);
    addRenown(TUNE.meta.renownPerEra, 'era');

    recompute();

    /* --- on-field power spike: units upgrade IN PLACE with a visual morph */
    var e = eraDef(next);
    _morphEvt.team = 1;
    _morphEvt.eraIndex = next;
    _morphEvt.era = e.coreName || e.name;
    _morphEvt.eraId = e.id;
    _morphEvt.heal = TUNE.era.spikeHealPct;
    _morphEvt.seconds = TUNE.era.morphSeconds;
    _morphEvt.color = e.color;
    _morphEvt.accent = e.accent;
    emit('units:morph', _morphEvt);

    emit('camera:shake', { amount: TUNE.era.shake });
    toast(e.name.toUpperCase() + ' — ' + e.tag, 'era');

    if (TUNE.era.perkOnEvolve) { offerPerks('evolve'); }

    requestSave();
    return true;
  }

  /* ===========================================================================
   * 17. PERK OFFERS (pick 1 of 3, roguelite)
   * ======================================================================== */
  function rarityWeight(rarity, wave) {
    var base = num(TUNE.perk.rarityWeights[rarity], 1);
    var push = TUNE.perk.rarityWavePush * int(wave, 0) + num(mods.perkRarityAdd, 0);
    if (rarity === 'rare')      base *= (1 + push * 1.2);
    if (rarity === 'epic')      base *= (1 + push * 2.0);
    if (rarity === 'legendary') base *= (1 + push * 3.0);
    return base;
  }

  function eligiblePerks() {
    var out = [], i, p;
    var owned = 0, id;
    for (id in state.perks) { if (int(state.perks[id], 0) > 0) owned++; }
    for (i = 0; i < PERKS.length; i++) {
      p = PERKS[i];
      var s = perkStacks(p.id);
      if (s >= p.max) continue;
      if (s === 0 && owned >= TUNE.perk.maxOwned) continue;
      out.push(p);
    }
    return out;
  }

  function rollOffer(size) {
    var pool = eligiblePerks();
    if (pool.length === 0) return [];
    var tagW = ownedPerkTagWeights();
    var wave = int(state.wave, 0);

    var weights = [], total = 0, i, j, p, w;
    for (i = 0; i < pool.length; i++) {
      p = pool[i];
      w = rarityWeight(p.rarity, wave);
      /* synergy bias — perks sharing tags you already run show up more */
      var syn = 0;
      for (j = 0; j < p.tags.length; j++) { syn += num(tagW[p.tags[j]], 0); }
      if (syn > 0) { w *= (1 + Math.min(syn, 6) * (TUNE.perk.synergyBias - 1) * 0.18); }
      /* stacking an owned perk is slightly less exciting than a new one */
      if (perkStacks(p.id) > 0) { w *= 0.72; }
      weights.push(w);
      total += w;
    }

    var picks = [], used = Object.create(null), guard = 0;
    var want = clamp(int(size, TUNE.perk.offerSize), 1, Math.min(6, pool.length));
    while (picks.length < want && guard++ < 400) {
      var r = rnd() * total, acc = 0, chosen = -1;
      for (i = 0; i < pool.length; i++) {
        if (used[pool[i].id]) continue;
        acc += weights[i];
        if (r <= acc) { chosen = i; break; }
      }
      if (chosen < 0) {
        for (i = 0; i < pool.length; i++) { if (!used[pool[i].id]) { chosen = i; break; } }
      }
      if (chosen < 0) break;
      used[pool[chosen].id] = 1;
      picks.push(pool[chosen].id);
      total -= weights[chosen];
      weights[chosen] = 0;
      if (total <= 0) {
        total = 0;
        for (i = 0; i < pool.length; i++) { if (!used[pool[i].id]) total += weights[i]; }
        if (total <= 0) break;
      }
    }
    return picks;
  }

  var _offerEvt = { choices: [], perks: [], reason: '', rerolls: 0 };

  function offerPerks(reason) {
    if (!isUnlocked('un_perks') && int(state.wave, 0) < 5) { return null; }
    var size = clamp(TUNE.perk.offerSize + int(mods.offerSizeAdd, 0), 1, 6);
    var choices = rollOffer(size);
    if (!choices.length) return null;

    run.offer = {
      choices: choices,
      reason: str(reason, 'wave'),
      rerolls: TUNE.perk.baseRerolls + int(mods.perkRerollAdd, 0)
    };
    run.rerollsLeft = run.offer.rerolls;

    publishOffer();
    return run.offer;
  }

  function publishOffer() {
    if (!run.offer) return;
    _offerEvt.choices = run.offer.choices;
    _offerEvt.perks = perkDefs(run.offer.choices);
    _offerEvt.reason = run.offer.reason;
    _offerEvt.rerolls = run.rerollsLeft;
    emit('perk:offer', _offerEvt);
  }

  function perkDefs(ids) {
    var out = [], i;
    if (!isArr(ids)) return out;
    for (i = 0; i < ids.length; i++) {
      var p = PERK_BY_ID[ids[i]];
      if (p) out.push(p);
    }
    return out;
  }

  function rerollOffer() {
    if (!run.offer) return false;
    if (run.rerollsLeft <= 0) { toast('No rerolls left', 'warn'); return false; }
    run.rerollsLeft--;
    var size = clamp(TUNE.perk.offerSize + int(mods.offerSizeAdd, 0), 1, 6);
    run.offer.choices = rollOffer(size);
    publishOffer();
    return true;
  }

  var _takenEvt = { perk: null, stacks: 0 };

  function choosePerk(id) {
    if (!run.offer) { warn('choosePerk with no active offer'); return false; }
    var ok = false, i;
    for (i = 0; i < run.offer.choices.length; i++) { if (run.offer.choices[i] === id) { ok = true; break; } }
    if (!ok) { warn('choosePerk("' + id + '") is not in the current offer'); return false; }

    var p = PERK_BY_ID[id];
    if (!p) return false;

    var s = perkStacks(id);
    if (s >= p.max) { toast(p.name + ' is already maxed', 'warn'); return false; }
    state.perks[id] = s + 1;

    run.offer = null;
    run.rerollsLeft = 0;
    run.perksThisRun++;
    meta.lifetime.perksTaken++;
    addQuestProgress('perks', 1);

    recompute();

    _takenEvt.perk = p;
    _takenEvt.stacks = state.perks[id];
    emit('perk:taken', _takenEvt);
    toast(p.name + (state.perks[id] > 1 ? ' ×' + state.perks[id] : '') + ' — ' + p.desc, 'perk');
    requestSave();
    return true;
  }

  function declineOffer() {
    if (!run.offer) return false;
    run.offer = null;
    run.rerollsLeft = 0;
    emit('perk:offer', { choices: [], perks: [], reason: 'closed', rerolls: 0 });
    return true;
  }

  /* ===========================================================================
   * 18. META TREE PURCHASES (renown)
   * ======================================================================== */
  var _renownEvt = { renown: 0, delta: 0, reason: '' };

  function addRenown(delta, reason) {
    var d = num(delta, 0);
    if (d === 0) return meta.renown;
    if (d > 0) { d = d * mods.renownMul; }
    meta.renown = Math.max(0, meta.renown + d);
    if (d > 0) meta.renownLifetime += d;
    _renownEvt.renown = meta.renown;
    _renownEvt.delta = d;
    _renownEvt.reason = reason || '';
    emit('renown:change', _renownEvt);
    return meta.renown;
  }

  var _metaEvt = { node: null, tier: 0, cost: 0, renown: 0 };

  function buyMeta(id) {
    var n = META_BY_ID[id];
    if (!n) { warn('buyMeta: unknown node "' + id + '"'); return false; }
    var t = metaTier(id);
    if (t >= n.tiers) { toast(n.name + ' is maxed', 'warn'); return false; }
    if (n.req && !state.upgrades[n.req]) { toast('Requires ' + (META_BY_ID[n.req] ? META_BY_ID[n.req].name : n.req), 'warn'); return false; }

    var cost = metaCost(id);
    if (meta.renown < cost) { toast('Need ' + Math.ceil(cost - meta.renown) + ' more renown', 'warn'); return false; }

    meta.renown -= cost;
    state.upgrades[id] = t + 1;
    meta.lifetime.metaBought++;

    recompute();

    _metaEvt.node = n;
    _metaEvt.tier = t + 1;
    _metaEvt.cost = cost;
    _metaEvt.renown = meta.renown;
    emit('meta:buy', _metaEvt);
    toast(n.name + ' ' + romanNumeral(t + 1), 'good');
    requestSave();
    return true;
  }

  function romanNumeral(n) {
    var R = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    return R[clamp(int(n, 0), 0, 10)] || String(n);
  }

  /** Free respec — we never sell a respec. */
  function respecMeta() {
    var spent = metaSpentTotal();
    if (spent <= 0) { toast('Nothing to refund', 'warn'); return false; }
    var back = Math.floor(spent * TUNE.meta.refundPct);
    for (var i = 0; i < META_NODES.length; i++) { delete state.upgrades[META_NODES[i].id]; }
    meta.renown += back;
    recompute();
    emit('meta:respec', { refunded: back, renown: meta.renown });
    toast('Respec complete — ' + back + ' renown returned', 'good');
    requestSave();
    return true;
  }

  /* ===========================================================================
   * 19. STORE PURCHASES (with the fairness guard on every path)
   * ======================================================================== */
  function currencyBalance(cur) {
    if (cur === 'gold')   return state.gold;
    if (cur === 'gems')   return state.gems;
    if (cur === 'renown') return meta.renown;
    if (cur === 'free')   return Infinity;
    return 0;
  }

  function takeCurrency(cur, amount, reason) {
    var a = Math.max(0, num(amount, 0));
    if (cur === 'free' || a === 0) return true;
    if (currencyBalance(cur) < a) return false;
    if (cur === 'gold')   return spend(a, reason || 'store');
    if (cur === 'gems')   { if (CORE_OK && Core.addGems) Core.addGems(-a, reason || 'store'); else state.gems = Math.max(0, state.gems - a); return true; }
    if (cur === 'renown') { meta.renown = Math.max(0, meta.renown - a); emit('renown:change', { renown: meta.renown, delta: -a, reason: reason || 'store' }); return true; }
    return false;
  }

  var _storeEvt = { item: null, currency: '', price: 0, count: 0 };

  function ownedCount(id) { return int(meta.owned[id], 0); }

  function buyStore(id) {
    var it = STORE_BY_ID[id];
    if (!it) { warn('buyStore: unknown item "' + id + '"'); return false; }

    /* the guard, re-checked at purchase time in case anything mutated it */
    if (it.power && it.currency === 'gems') {
      warn('BLOCKED: refusing to sell power ("' + id + '") for premium currency.');
      toast('That purchase is blocked by the fairness rule', 'warn');
      return false;
    }

    var have = ownedCount(id);
    if (!it.repeat && have > 0) { toast('Already owned', 'warn'); return false; }
    if (it.repeat && have >= it.max) { toast('Maximum reached', 'warn'); return false; }

    if (it.id === 'cv_respec') { return respecMeta(); }

    if (!takeCurrency(it.currency, it.price, 'store:' + id)) {
      toast('Not enough ' + (it.currency === 'gems' ? 'gems' : it.currency), 'warn');
      return false;
    }

    meta.owned[id] = have + 1;
    meta.lifetime.storeBought++;

    applyStoreItem(it);
    recompute();

    _storeEvt.item = it;
    _storeEvt.currency = it.currency;
    _storeEvt.price = it.price;
    _storeEvt.count = meta.owned[id];
    emit('store:buy', _storeEvt);
    if (TUNE.misc.toastPurchases) toast(it.name + ' unlocked', 'good');
    requestSave();
    return true;
  }

  function applyStoreItem(it) {
    if (!it) return;
    if (it.cat === 'skin')   { meta.cosmetics.skin = it.id; }
    if (it.cat === 'banner') { meta.cosmetics.banner = it.id; }
    if (it.cat === 'effect') { meta.cosmetics.effect = it.id; }
    if (it.cat === 'fort')   { meta.cosmetics.fort = it.id; }
    if (it.id === 'cv_slot2') { meta.loadoutSlots = clamp(meta.loadoutSlots + 1, 1, 8); }
    if (it.id === 'bp_premium') { meta.bp.premium = true; }
    if (it.id === 'cv_questslot') { TUNE.daily.questsPerDay = 3; }
    emit('cosmetic:change', meta.cosmetics);
  }

  function equipCosmetic(cat, id) {
    if (!has(meta.cosmetics, cat)) { warn('equipCosmetic: unknown category "' + cat + '"'); return false; }
    if (id && !ownedCount(id)) { toast('Not owned', 'warn'); return false; }
    meta.cosmetics[cat] = id || '';
    emit('cosmetic:change', meta.cosmetics);
    requestSave();
    return true;
  }

  /* ===========================================================================
   * 20. LOADOUTS
   * ======================================================================== */
  function defaultLoadout(name) {
    var row = ROSTER[0];
    return {
      name: str(name, 'Warband'),
      units: [row[0].id, row[1].id, row[2].id, row[3].id, row[4].id],
      gear: { weapon: 'eq_honed', armor: 'eq_padded', trinket: '', banner: '' }
    };
  }

  function ensureLoadouts() {
    if (!isArr(meta.loadouts)) meta.loadouts = [];
    while (meta.loadouts.length < 1) { meta.loadouts.push(defaultLoadout('Warband')); }
    if (meta.loadouts.length > meta.loadoutSlots) { meta.loadouts.length = meta.loadoutSlots; }
    meta.activeLoadout = clamp(int(meta.activeLoadout, 0), 0, meta.loadouts.length - 1);
  }

  function getLoadout(i) {
    ensureLoadouts();
    return meta.loadouts[clamp(int(i, meta.activeLoadout), 0, meta.loadouts.length - 1)] || null;
  }

  function saveLoadout(i, data) {
    ensureLoadouts();
    var idx = clamp(int(i, meta.activeLoadout), 0, meta.loadoutSlots - 1);
    if (idx >= meta.loadouts.length) { meta.loadouts.push(defaultLoadout('Warband ' + (idx + 1))); idx = meta.loadouts.length - 1; }
    var lo = meta.loadouts[idx];
    if (isObj(data)) {
      if (typeof data.name === 'string') lo.name = data.name.slice(0, 24);
      if (isArr(data.units)) {
        var u = [], j;
        for (j = 0; j < data.units.length && u.length < 6; j++) {
          if (UNIT_BY_ID[data.units[j]]) u.push(data.units[j]);
        }
        if (u.length) lo.units = u;
      }
      if (isObj(data.gear)) {
        for (var s = 0; s < GEAR_SLOTS.length; s++) {
          var slot = GEAR_SLOTS[s], gid = data.gear[slot];
          if (gid === undefined) continue;
          if (gid === '' || (GEAR_BY_ID[gid] && GEAR_BY_ID[gid].slot === slot && meta.gearOwned[gid])) {
            lo.gear[slot] = gid || '';
          }
        }
      }
    }
    emit('loadout:save', { index: idx, loadout: lo });
    requestSave();
    return lo;
  }

  function applyLoadout(i) {
    ensureLoadouts();
    var idx = clamp(int(i, 0), 0, meta.loadouts.length - 1);
    meta.activeLoadout = idx;
    var lo = meta.loadouts[idx];
    for (var s = 0; s < GEAR_SLOTS.length; s++) {
      var slot = GEAR_SLOTS[s], gid = lo.gear ? lo.gear[slot] : '';
      meta.equipped[slot] = (gid && meta.gearOwned[gid]) ? gid : '';
    }
    recompute();
    emit('loadout:apply', { index: idx, loadout: lo, mods: mods });
    requestSave();
    return lo;
  }

  function equipGear(slot, id) {
    if (GEAR_SLOTS.indexOf(slot) < 0) { warn('equipGear: bad slot "' + slot + '"'); return false; }
    if (id) {
      var g = GEAR_BY_ID[id];
      if (!g || g.slot !== slot) { warn('equipGear: "' + id + '" is not a ' + slot); return false; }
      if (!meta.gearOwned[id]) { toast('Equipment not owned', 'warn'); return false; }
      var best = Math.max(int(state.wave, 0), int(state.stats && state.stats.bestWave, 0));
      if (best < g.unlockWave) { toast(g.name + ' unlocks at wave ' + g.unlockWave, 'warn'); return false; }
    }
    meta.equipped[slot] = id || '';
    var lo = getLoadout(meta.activeLoadout);
    if (lo && lo.gear) lo.gear[slot] = id || '';
    recompute();
    emit('loadout:apply', { index: meta.activeLoadout, loadout: lo, mods: mods });
    requestSave();
    return true;
  }

  function grantGear(id, silent) {
    var g = GEAR_BY_ID[id];
    if (!g) return false;
    if (meta.gearOwned[id]) return false;
    meta.gearOwned[id] = 1;
    if (!silent) toast('Equipment found: ' + g.name, 'good');
    emit('gear:grant', { id: id, gear: g });
    return true;
  }

  /** Equipment is earned by wave milestones — never sold. */
  function checkGearUnlocks(wave) {
    var best = Math.max(int(wave, state.wave), int(state.stats && state.stats.bestWave, 0));
    for (var i = 0; i < EQUIPMENT.length; i++) {
      var g = EQUIPMENT[i];
      if (best >= g.unlockWave) grantGear(g.id, best !== int(wave, 0));
    }
  }

  /* ===========================================================================
   * 21. GEMS (earned only), BATTLE PASS, QUESTS, DAILIES
   * ======================================================================== */
  function grantGems(amount, reason) {
    var a = Math.max(0, Math.round(num(amount, 0) * mods.gemFindMul));
    if (a <= 0) return 0;
    meta.gemsLifetime += a;
    if (CORE_OK && Core.addGems) { Core.addGems(a, reason || 'play'); }
    else { state.gems = num(state.gems, 0) + a; }
    return a;
  }

  /* --- battle pass ------------------------------------------------------- */
  function bpXpForLevel(level) {
    var l = clamp(int(level, 1), 1, TUNE.bp.levels);
    return Math.round(TUNE.bp.xpPerLevel * Math.pow(TUNE.bp.xpGrowth, l - 1));
  }

  var _bpEvt = { level: 0, xp: 0, need: 0, rewards: null, premium: false };

  function addBpXp(amount) {
    var a = Math.max(0, num(amount, 0) * mods.bpXpMul);
    if (a <= 0) return meta.bp.level;
    meta.bp.xp += a;
    var guard = 0;
    while (meta.bp.level < TUNE.bp.levels && meta.bp.xp >= bpXpForLevel(meta.bp.level) && guard++ < 200) {
      meta.bp.xp -= bpXpForLevel(meta.bp.level);
      meta.bp.level++;
      grantGems(TUNE.store.gemsPerBpLevel, 'bp');
      _bpEvt.level = meta.bp.level;
      _bpEvt.xp = meta.bp.xp;
      _bpEvt.need = bpXpForLevel(meta.bp.level);
      _bpEvt.rewards = bpRewardsFor(meta.bp.level);
      _bpEvt.premium = meta.bp.premium;
      emit('bp:level', _bpEvt);
      toast('Season level ' + meta.bp.level, 'good');
    }
    if (meta.bp.level >= TUNE.bp.levels) { meta.bp.xp = 0; }
    return meta.bp.level;
  }

  function bpRewardsFor(level) {
    var l = clamp(int(level, 1), 1, TUNE.bp.levels);
    return BP_TRACK[l - 1] || null;
  }

  function claimBp(level, track) {
    var l = clamp(int(level, 1), 1, TUNE.bp.levels);
    if (meta.bp.level < l) { toast('Season level ' + l + ' not reached', 'warn'); return false; }
    var row = BP_TRACK[l - 1];
    if (!row) return false;
    var premium = (track === 'premium');
    if (premium && !meta.bp.premium) { toast('Season pass required', 'warn'); return false; }
    var claimed = premium ? meta.bp.claimedPrem : meta.bp.claimedFree;
    if (claimed[l]) { toast('Already claimed', 'warn'); return false; }
    var r = premium ? row.premium : row.free;
    if (!r) return false;
    claimed[l] = 1;
    giveReward(r);
    requestSave();
    return true;
  }

  function giveReward(r) {
    if (!r) return;
    if (r.kind === 'gold')      { grant(r.amount, 'reward'); }
    else if (r.kind === 'gems') { grantGems(r.amount, 'reward'); }
    else if (r.kind === 'renown') { addRenown(r.amount, 'reward'); }
    else if (r.kind === 'cosmetic') {
      var it = STORE_BY_ID[r.id];
      if (it) { meta.owned[r.id] = ownedCount(r.id) + 1; applyStoreItem(it); }
    } else if (r.kind === 'equipment') { grantGear(r.id, false); }
    emit('reward:grant', r);
  }

  /* --- quests ------------------------------------------------------------ */
  function rollDailyQuests(day) {
    var picks = [], used = Object.create(null), guard = 0;
    var want = clamp(int(TUNE.daily.questsPerDay, 3), 1, 5);
    var total = 0, i;
    for (i = 0; i < QUEST_POOL.length; i++) { total += QUEST_POOL[i].weight; }
    while (picks.length < want && guard++ < 200 && picks.length < QUEST_POOL.length) {
      var r = rnd() * total, acc = 0, chosen = -1;
      for (i = 0; i < QUEST_POOL.length; i++) {
        if (used[QUEST_POOL[i].id]) continue;
        acc += QUEST_POOL[i].weight;
        if (r <= acc) { chosen = i; break; }
      }
      if (chosen < 0) { for (i = 0; i < QUEST_POOL.length; i++) { if (!used[QUEST_POOL[i].id]) { chosen = i; break; } } }
      if (chosen < 0) break;
      used[QUEST_POOL[chosen].id] = 1;
      picks.push({ id: QUEST_POOL[chosen].id, progress: 0, done: false, claimed: false });
    }
    meta.daily.quests = picks;
    meta.daily.questDay = day;
    meta.daily.rerolls = TUNE.daily.questReroll;
    run.questProgress = {};
    emit('quest:refresh', { quests: questView() });
    return picks;
  }

  function questView() {
    var out = [], i;
    for (i = 0; i < meta.daily.quests.length; i++) {
      var q = meta.daily.quests[i], def = QUEST_BY_ID[q.id];
      if (!def) continue;
      out.push({
        id: q.id, name: def.name, metric: def.metric, goal: def.goal,
        progress: q.progress, done: q.done, claimed: q.claimed, rewards: def.rewards
      });
    }
    return out;
  }

  var _questEvt = { quest: null };

  function addQuestProgress(metric, amount) {
    var a = num(amount, 0);
    if (a <= 0) return;
    run.questProgress[metric] = num(run.questProgress[metric], 0) + a;
    var changed = false;
    for (var i = 0; i < meta.daily.quests.length; i++) {
      var q = meta.daily.quests[i], def = QUEST_BY_ID[q.id];
      if (!def || def.metric !== metric || q.done) continue;
      q.progress += a;
      changed = true;
      if (q.progress >= def.goal) {
        q.progress = def.goal;
        q.done = true;
        meta.lifetime.questsDone++;
        addBpXp(TUNE.bp.xpPerQuest);
        _questEvt.quest = { id: q.id, name: def.name, goal: def.goal, progress: q.progress, rewards: def.rewards };
        emit('quest:complete', _questEvt);
        toast('Quest complete: ' + def.name, 'good');
      } else {
        _questEvt.quest = { id: q.id, name: def.name, goal: def.goal, progress: q.progress, rewards: def.rewards };
        emit('quest:progress', _questEvt);
      }
    }
    if (changed) requestSave();
  }

  function claimQuest(id) {
    for (var i = 0; i < meta.daily.quests.length; i++) {
      var q = meta.daily.quests[i];
      if (q.id !== id) continue;
      if (!q.done) { toast('Not finished yet', 'warn'); return false; }
      if (q.claimed) { toast('Already claimed', 'warn'); return false; }
      q.claimed = true;
      var def = QUEST_BY_ID[id];
      if (def) { for (var r = 0; r < def.rewards.length; r++) { giveReward(def.rewards[r]); } }
      grantGems(TUNE.store.gemsPerQuest, 'quest');
      requestSave();
      return true;
    }
    return false;
  }

  function rerollQuest(id) {
    if (meta.daily.rerolls <= 0) { toast('No quest rerolls left', 'warn'); return false; }
    var idx = -1, i;
    for (i = 0; i < meta.daily.quests.length; i++) { if (meta.daily.quests[i].id === id) { idx = i; break; } }
    if (idx < 0) return false;
    if (meta.daily.quests[idx].claimed) { toast('Already claimed', 'warn'); return false; }

    var used = Object.create(null);
    for (i = 0; i < meta.daily.quests.length; i++) { used[meta.daily.quests[i].id] = 1; }
    var options = [];
    for (i = 0; i < QUEST_POOL.length; i++) { if (!used[QUEST_POOL[i].id]) options.push(QUEST_POOL[i]); }
    if (!options.length) { toast('No other quests available', 'warn'); return false; }

    meta.daily.rerolls--;
    meta.daily.quests[idx] = { id: options[rndInt(options.length)].id, progress: 0, done: false, claimed: false };
    emit('quest:refresh', { quests: questView() });
    requestSave();
    return true;
  }

  /* --- daily login ------------------------------------------------------- */
  var _dailyEvt = { day: 0, streak: 0, rewards: null, mult: 1 };

  function dailyAvailable() {
    return dayIndex() !== meta.daily.lastDay;
  }

  function checkDaily(autoRoll) {
    var d = dayIndex();
    if (meta.daily.questDay !== d) { rollDailyQuests(d); }
    if (autoRoll && dailyAvailable()) { emit('daily:available', { day: d, next: (meta.daily.claimedDay % TUNE.daily.ladderDays) + 1 }); }
    return dailyAvailable();
  }

  function claimDaily() {
    var d = dayIndex();
    if (meta.daily.lastDay === d) { toast('Already claimed today', 'warn'); return false; }

    /* streak: consecutive local days only */
    if (meta.daily.lastDay === d - 1) { meta.daily.streak++; }
    else { meta.daily.streak = 1; }

    meta.daily.lastDay = d;
    meta.daily.claimedDay = (meta.daily.claimedDay % TUNE.daily.ladderDays) + 1;
    meta.lifetime.dailyClaims++;

    var row = DAILY_LADDER[meta.daily.claimedDay - 1] || DAILY_LADDER[0];
    var mult = clamp(1 + TUNE.daily.streakBonus * (meta.daily.streak - 1), 1, TUNE.daily.streakMax);

    for (var i = 0; i < row.rewards.length; i++) {
      var r = row.rewards[i];
      if (r.kind === 'gold' || r.kind === 'gems' || r.kind === 'renown') {
        giveReward({ kind: r.kind, id: r.id, amount: Math.round(r.amount * mult), label: r.label });
      } else {
        giveReward(r);
      }
    }
    grantGems(TUNE.store.gemsDailyLogin, 'daily');
    if (meta.daily.questDay !== d) rollDailyQuests(d);

    _dailyEvt.day = meta.daily.claimedDay;
    _dailyEvt.streak = meta.daily.streak;
    _dailyEvt.rewards = row.rewards;
    _dailyEvt.mult = mult;
    emit('daily:claim', _dailyEvt);
    toast('Day ' + meta.daily.claimedDay + ' reward — streak ×' + (Math.round(mult * 100) / 100), 'good');
    requestSave();
    return true;
  }

  /* ===========================================================================
   * 22. EVENT WIRING
   * ======================================================================== */
  var _lastKillGold = 0;

  function onUnitDeath(p) {
    if (!p || !p.unit) return;
    var u = p.unit, killer = p.killer;
    if (u.team === 1) {
      /* our loss: free the supply we reserved */
      releaseSupply(u.popCost || (u.defId && UNIT_BY_ID[u.defId] ? UNIT_BY_ID[u.defId].pop : 1));
      return;
    }
    if (u.team !== -1) return;

    /* enemy died — pay the player */
    var def = u.defId ? UNIT_BY_ID[u.defId] : null;
    var baseCost = def ? def.cost : (num(u.maxHp, 100) * 0.55);
    var eraTier = num(u.era, curEraIndex());

    var gold = TUNE.gold.killBase
             + baseCost * TUNE.gold.killCostShare
             + baseCost * TUNE.gold.killEraBonus * eraTier * 0.25;

    gold *= mods.killGoldMul;

    var byFort = killer && (killer.isFort || killer.cls === 'fort' || killer.garrison);
    if (byFort) gold *= TUNE.gold.overkillPenalty;
    if (killer && killer.team !== 1) gold *= TUNE.gold.assistShare;

    gold *= incomeThrottle();
    gold = Math.max(1, Math.round(gold));

    run.killGold += gold;
    _lastKillGold = gold;
    grant(gold, 'kill');
    addQuestProgress('kills', 1);
    addQuestProgress('goldEarned', gold);

    if (u.cls === 'boss') {
      grant(TUNE.gold.bossBonus * mods.killGoldMul, 'boss');
      grantGems(TUNE.store.gemsPerBoss, 'boss');
      addRenown(TUNE.meta.renownPerBoss, 'boss');
      addBpXp(TUNE.bp.xpPerBoss);
      addQuestProgress('bosses', 1);
      if (TUNE.perk.offerOnBoss) offerPerks('boss');
    }
  }

  function onUnitHit(p) {
    if (!p) return;
    if (p.crit && mods.goldOnCrit > 0 && p.from && p.from.team === 1) {
      grant(mods.goldOnCrit * incomeThrottle(), 'crit');
    }
  }

  function onUnitBlock(p) {
    var u = p && (p.unit || p);
    if (!u || u.team !== 1) return;
    addQuestProgress('blocks', 1);
    if (mods.goldOnBlock > 0) { grant(mods.goldOnBlock * incomeThrottle(), 'block'); }
  }

  function onFortHit(p) {
    if (!p) return;
    /* damage TO the enemy fort pays us */
    if (p.team === -1) {
      var d = Math.max(0, num(p.dmg, 0));
      if (d > 0) {
        var g = d * TUNE.gold.fortDamageGold * mods.fortDamageGoldMul * incomeThrottle();
        if (g > 0.01) { run.siegeGold += g; grant(g, 'siege'); }
        addQuestProgress('fortDmg', d);
      }
    }
  }

  function onWaveStart(p) {
    var w = p && p.wave !== undefined ? int(p.wave, state.wave) : int(state.wave, 0);
    checkUnlocks(w);
    checkGearUnlocks(w);
  }

  function onWaveClear(p) {
    var w = p && p.wave !== undefined ? int(p.wave, state.wave) : int(state.wave, 0);

    var reward = (TUNE.gold.waveClearBase + TUNE.gold.waveClearPerWave * w)
               * Math.pow(TUNE.gold.waveClearGrowth, w)
               * mods.waveGoldMul;
    /* the wave reward respects the soft cap too — no banking your way out */
    reward *= incomeThrottle();
    reward = Math.round(reward);
    grant(reward, 'wave');

    addRenown(TUNE.meta.renownPerWave * Math.pow(TUNE.meta.renownWaveCurve, w), 'wave');
    addBpXp(TUNE.bp.xpPerWave);
    addQuestProgress('waves', 1);
    addQuestProgress('goldEarned', reward);

    if (w > 0 && w % TUNE.store.gemWaveEvery === 0) {
      grantGems(TUNE.store.gemsPerWaveMilestone, 'wave');
    }

    checkUnlocks(w);
    checkGearUnlocks(w);

    if (w > 0 && w % TUNE.perk.milestoneWaves === 0 && w !== run.lastOfferWave) {
      run.lastOfferWave = w;
      offerPerks('wave');
    }

    if (p && typeof p === 'object' && p.reward === undefined) { p.reward = reward; }
    requestSave();
  }

  function onGameNew() {
    resetRunEconomy();
  }

  function onGameOver(p) {
    var res = (typeof p === 'string') ? p : (p && (p.result || p.outcome));
    var win = (res === 'victory' || res === 'win');
    addRenown(win ? TUNE.meta.renownWin : TUNE.meta.renownLoss, win ? 'win' : 'loss');
    if (win) {
      grantGems(TUNE.store.gemsPerWin, 'win');
      addBpXp(TUNE.bp.xpPerWin);
      addQuestProgress('wins', 1);
    }
    addQuestProgress('goldSpent', run.spentThisRun);
    requestSave();
  }

  function onGameReset(hard) {
    if (hard) resetRunEconomy();
  }

  function onPowerCast() { addQuestProgress('powers', 1); }

  function onEraEvolveExternal(p) {
    /* Something else advanced the era (campaign script, cheat, load).
       Keep the modifier bundle in sync without charging gold. */
    if (!p) return;
    if (mods.eraIndex !== curEraIndex()) { recompute(); }
  }

  function resetRunEconomy() {
    run.treasury = 0;
    run.incomeAcc = 0;
    run.territory = 0;
    run.earnedThisRun = 0;
    run.spentThisRun = 0;
    run.killGold = 0;
    run.territoryGold = 0;
    run.passiveGold = 0;
    run.siegeGold = 0;
    run.evolvesThisRun = 0;
    run.perksThisRun = 0;
    run.supplyUsed = 0;
    run.spawnCd = 0;
    run.lastOfferWave = 0;
    run.offer = null;
    run.rerollsLeft = 0;
    run.goldLeaked = 0;
    run.milestones = {};

    /* run perks are roguelite — they do NOT carry between runs */
    for (var id in state.perks) { if (has(state.perks, id)) delete state.perks[id]; }

    recompute();

    /* starting purse: base + Founding Grant */
    var startGold = TUNE.gold.startGold + mods.startGoldAdd;
    var delta = startGold - num(state.gold, 0);
    if (CORE_OK && Core.addGold) { Core.addGold(delta, 'run-start'); }
    else { state.gold = startGold; }

    /* fort scaling from the Fortification branch */
    if (state.forts && state.forts[1]) {
      var base = num(state.persist.fortBaseMax, 0);
      if (base <= 0) { base = num(state.forts[1].max, 1000); state.persist.fortBaseMax = base; }
      state.forts[1].max = Math.round(base * mods.fortHpMul);
      state.forts[1].hp = state.forts[1].max;
    }

    recomputeIncome();
    emit('econ:reset', { gold: state.gold, mods: mods });
  }

  /* ===========================================================================
   * 23. SAVE SLICE
   * ======================================================================== */
  function requestSave() {
    if (CORE_OK && Core.requestSave) { try { Core.requestSave(); } catch (e) {} }
  }

  function serialize() {
    return {
      v: 1,
      renown: meta.renown,
      renownLifetime: meta.renownLifetime,
      gemsLifetime: meta.gemsLifetime,
      owned: meta.owned,
      equipped: meta.equipped,
      cosmetics: meta.cosmetics,
      gearOwned: meta.gearOwned,
      loadouts: meta.loadouts,
      loadoutSlots: meta.loadoutSlots,
      activeLoadout: meta.activeLoadout,
      daily: meta.daily,
      bp: meta.bp,
      lifetime: meta.lifetime,
      run: {
        treasury: run.treasury,
        territory: run.territory,
        earned: run.earnedThisRun,
        spent: run.spentThisRun,
        evolves: run.evolvesThisRun,
        perks: run.perksThisRun,
        supplyUsed: run.supplyUsed,
        lastOfferWave: run.lastOfferWave,
        offer: run.offer,
        rerollsLeft: run.rerollsLeft
      }
    };
  }

  function deserialize(d) {
    if (!isObj(d)) return;

    meta.renown         = Math.max(0, num(d.renown, 0));
    meta.renownLifetime = Math.max(0, num(d.renownLifetime, meta.renown));
    meta.gemsLifetime   = Math.max(0, num(d.gemsLifetime, 0));

    if (isObj(d.owned))     { meta.owned = {}; for (var k in d.owned) { if (STORE_BY_ID[k]) meta.owned[k] = int(d.owned[k], 0); } }
    if (isObj(d.gearOwned)) { meta.gearOwned = {}; for (var g in d.gearOwned) { if (GEAR_BY_ID[g]) meta.gearOwned[g] = 1; } }
    if (!meta.gearOwned.eq_honed)  meta.gearOwned.eq_honed = 1;
    if (!meta.gearOwned.eq_padded) meta.gearOwned.eq_padded = 1;

    if (isObj(d.equipped)) {
      for (var s = 0; s < GEAR_SLOTS.length; s++) {
        var slot = GEAR_SLOTS[s], id = str(d.equipped[slot], '');
        meta.equipped[slot] = (id && GEAR_BY_ID[id] && GEAR_BY_ID[id].slot === slot && meta.gearOwned[id]) ? id : '';
      }
    }
    if (isObj(d.cosmetics)) {
      var cats = ['skin', 'banner', 'effect', 'fort'];
      for (var c = 0; c < cats.length; c++) {
        var cid = str(d.cosmetics[cats[c]], '');
        meta.cosmetics[cats[c]] = (cid && STORE_BY_ID[cid]) ? cid : '';
      }
    }

    meta.loadoutSlots = clamp(int(d.loadoutSlots, 3), 1, 8);
    if (isArr(d.loadouts)) {
      meta.loadouts = [];
      for (var i = 0; i < d.loadouts.length && i < meta.loadoutSlots; i++) {
        var src = d.loadouts[i];
        if (!isObj(src)) continue;
        var lo = defaultLoadout(str(src.name, 'Warband ' + (i + 1)));
        if (isArr(src.units)) {
          var uu = [];
          for (var j = 0; j < src.units.length && uu.length < 6; j++) { if (UNIT_BY_ID[src.units[j]]) uu.push(src.units[j]); }
          if (uu.length) lo.units = uu;
        }
        if (isObj(src.gear)) {
          for (var gs = 0; gs < GEAR_SLOTS.length; gs++) {
            var gsl = GEAR_SLOTS[gs], gid = str(src.gear[gsl], '');
            lo.gear[gsl] = (gid && GEAR_BY_ID[gid] && GEAR_BY_ID[gid].slot === gsl) ? gid : '';
          }
        }
        meta.loadouts.push(lo);
      }
    }
    meta.activeLoadout = clamp(int(d.activeLoadout, 0), 0, Math.max(0, meta.loadouts.length - 1));

    if (isObj(d.daily)) {
      meta.daily.lastDay    = int(d.daily.lastDay, -1);
      meta.daily.streak     = Math.max(0, int(d.daily.streak, 0));
      meta.daily.claimedDay = clamp(int(d.daily.claimedDay, 0), 0, TUNE.daily.ladderDays);
      meta.daily.questDay   = int(d.daily.questDay, -1);
      meta.daily.rerolls    = Math.max(0, int(d.daily.rerolls, 1));
      meta.daily.quests     = [];
      if (isArr(d.daily.quests)) {
        for (var q = 0; q < d.daily.quests.length; q++) {
          var sq = d.daily.quests[q];
          if (!isObj(sq) || !QUEST_BY_ID[sq.id]) continue;
          meta.daily.quests.push({
            id: sq.id,
            progress: Math.max(0, num(sq.progress, 0)),
            done: !!sq.done,
            claimed: !!sq.claimed
          });
        }
      }
    }

    if (isObj(d.bp)) {
      meta.bp.season  = Math.max(1, int(d.bp.season, 1));
      meta.bp.xp      = Math.max(0, num(d.bp.xp, 0));
      meta.bp.level   = clamp(int(d.bp.level, 1), 1, TUNE.bp.levels);
      meta.bp.premium = !!d.bp.premium || !!meta.owned.bp_premium;
      meta.bp.claimedFree = isObj(d.bp.claimedFree) ? d.bp.claimedFree : {};
      meta.bp.claimedPrem = isObj(d.bp.claimedPrem) ? d.bp.claimedPrem : {};
      meta.bp.startedDay   = int(d.bp.startedDay, -1);
    }

    if (isObj(d.lifetime)) {
      for (var lk in meta.lifetime) { meta.lifetime[lk] = Math.max(0, int(d.lifetime[lk], meta.lifetime[lk])); }
    }

    if (isObj(d.run)) {
      run.treasury       = clamp(int(d.run.treasury, 0), 0, TUNE.treasury.maxLevel);
      run.territory      = clamp(num(d.run.territory, 0), -1, 1);
      run.earnedThisRun  = Math.max(0, num(d.run.earned, 0));
      run.spentThisRun   = Math.max(0, num(d.run.spent, 0));
      run.evolvesThisRun = Math.max(0, int(d.run.evolves, 0));
      run.perksThisRun   = Math.max(0, int(d.run.perks, 0));
      run.supplyUsed     = Math.max(0, int(d.run.supplyUsed, 0));
      run.lastOfferWave  = Math.max(0, int(d.run.lastOfferWave, 0));
      run.rerollsLeft    = Math.max(0, int(d.run.rerollsLeft, 0));
      run.offer = null;
      if (isObj(d.run.offer) && isArr(d.run.offer.choices)) {
        var ch = [];
        for (var oc = 0; oc < d.run.offer.choices.length; oc++) {
          if (PERK_BY_ID[d.run.offer.choices[oc]]) ch.push(d.run.offer.choices[oc]);
        }
        if (ch.length) {
          run.offer = { choices: ch, reason: str(d.run.offer.reason, 'wave'), rerolls: int(d.run.offer.rerolls, 0) };
        }
      }
    }

    ensureLoadouts();
    recompute();
    if (run.offer) publishOffer();
  }

  /* ===========================================================================
   * 24. READ-ONLY VIEWS FOR THE UI (allocation-free where it matters)
   * ======================================================================== */
  function metaTreeView() {
    var out = [], i, b, nodes, j, n;
    for (i = 0; i < BRANCHES.length; i++) {
      b = BRANCHES[i];
      nodes = [];
      for (j = 0; j < META_NODES.length; j++) {
        n = META_NODES[j];
        if (n.branch !== b.id) continue;
        var t = metaTier(n.id);
        nodes.push({
          id: n.id, name: n.name, desc: n.desc, tier: t, tiers: n.tiers,
          cost: metaCost(n.id), affordable: meta.renown >= metaCost(n.id),
          maxed: t >= n.tiers, per: n.per, unit: n.unit,
          value: n.per * t, nextValue: n.per * (t + 1)
        });
      }
      out.push({ id: b.id, name: b.name, color: b.color, blurb: b.blurb, nodes: nodes });
    }
    return out;
  }

  function storeView(cat) {
    var out = [], i, it;
    for (i = 0; i < STORE.length; i++) {
      it = STORE[i];
      if (cat && it.cat !== cat) continue;
      out.push({
        id: it.id, cat: it.cat, name: it.name, desc: it.desc,
        currency: it.currency, price: it.price, tint: it.tint,
        owned: ownedCount(it.id), max: it.repeat ? it.max : 1,
        affordable: currencyBalance(it.currency) >= it.price,
        power: !!it.power
      });
    }
    return out;
  }

  function perkView() {
    var out = [], id;
    for (id in state.perks) {
      var n = int(state.perks[id], 0);
      if (n <= 0) continue;
      var p = PERK_BY_ID[id];
      if (!p) continue;
      out.push({ id: id, name: p.name, rarity: p.rarity, tags: p.tags, stacks: n, max: p.max, desc: p.desc });
    }
    return out;
  }

  function rosterView(eraIndex) {
    var row = availableRoster(eraIndex), out = [], i, d;
    for (i = 0; i < row.length; i++) {
      d = row[i];
      out.push({
        id: d.id, name: d.name, cls: d.cls, pop: d.pop, traits: d.traits,
        cost: unitCost(d), affordable: canAfford(d),
        hp: Math.round(d.hp * mods.hpMul), dmg: Math.round(d.dmg * mods.dmgMul),
        range: d.range, speed: d.speed
      });
    }
    return out;
  }

  function summary() {
    return {
      gold: state.gold,
      gems: state.gems,
      renown: meta.renown,
      era: curEra().name,
      eraIndex: curEraIndex(),
      eraTag: curEra().tag,
      evolveCost: evolveCost(),
      evolveProgress: evolveProgress(),
      canEvolve: canEvolve(),
      treasury: run.treasury,
      treasuryCost: treasuryCost(),
      treasuryMax: TUNE.treasury.maxLevel,
      income: run.incomeRate,
      throttle: incomeThrottle(),
      softCap: mods.softCap,
      hoarding: state.gold > mods.softCap,
      bleeding: state.gold > mods.softCap * TUNE.gold.leakStart,
      territory: run.territory,
      supplyUsed: run.supplyUsed,
      supplyMax: supplyMax(),
      bpLevel: meta.bp.level,
      bpXp: meta.bp.xp,
      bpNeed: bpXpForLevel(meta.bp.level),
      bpPremium: meta.bp.premium,
      dailyReady: dailyAvailable(),
      offer: run.offer ? run.offer.choices : null,
      rerolls: run.rerollsLeft
    };
  }

  /* ===========================================================================
   * 25. BOOT
   * ======================================================================== */
  function init() {
    if (!CORE_OK) { recompute(); return false; }

    ensureLoadouts();

    Core.registerSave('economy', serialize, deserialize);

    on('unit:death',     onUnitDeath);
    on('unit:hit',       onUnitHit);
    on('unit:block',     onUnitBlock);
    on('fort:hit',       onFortHit);
    on('wave:start',     onWaveStart);
    on('wave:clear',     onWaveClear);
    on('game:new',       onGameNew);
    on('game:over',      onGameOver);
    on('game:reset',     onGameReset);
    on('power:cast',     onPowerCast);
    on('era:evolve',     onEraEvolveExternal);
    on('boss:spawn',     function () { /* the payout lands on the kill, not the spawn */ });

    /* Recompute after a save load so the tree/perks are live immediately. */
    on('save:load', function () {
      ensureLoadouts();
      checkUnlocks(int(state.wave, 0));
      checkGearUnlocks(int(state.wave, 0));
      checkDaily(true);
      recompute();
    });

    Core.registerSim(economyTick, 20);

    recompute();
    checkUnlocks(int(state.wave, 0));
    checkGearUnlocks(int(state.wave, 0));
    checkDaily(true);

    return true;
  }

  /* ===========================================================================
   * 26. PUBLIC API
   * ======================================================================== */
  var Economy = {
    __isAowEconomy: true,
    version: '1.0.0',

    /* tables (read-only by convention) */
    TUNE: TUNE,
    FAIRNESS: FAIRNESS,
    ERAS: ERAS,
    ROSTER: ROSTER,
    PERKS: PERKS,
    EQUIPMENT: EQUIPMENT,
    GEAR_SLOTS: GEAR_SLOTS,
    META_NODES: META_NODES,
    BRANCHES: BRANCHES,
    STORE: STORE,
    BP_TRACK: BP_TRACK,
    UNLOCKS: UNLOCKS,
    QUESTS: QUEST_POOL,
    DAILY_LADDER: DAILY_LADDER,
    MOD_DEFAULTS: MOD_DEFAULTS,

    /* live objects — stable references */
    mods: mods,
    run: run,
    meta: meta,

    /* lifecycle */
    init: init,
    recompute: recompute,
    queueRecompute: queueRecompute,
    reset: resetRunEconomy,

    /* modifiers */
    getMod: function (k, d) { return has(mods, k) ? mods[k] : num(d, 0); },

    /* eras */
    eraDef: eraDef,
    era: curEra,
    eraIndex: curEraIndex,
    eraCount: function () { return ERAS.length; },
    eraTraits: function (i) { return eraDef(i).traits; },
    hasEraTrait: function (t, i) {
      var tr = eraDef(i === undefined ? curEraIndex() : i).traits;
      for (var j = 0; j < tr.length; j++) { if (tr[j] === t) return true; }
      return false;
    },
    evolveCost: evolveCost,
    canEvolve: canEvolve,
    evolveProgress: evolveProgress,
    evolve: evolve,

    /* gold */
    grant: grant,
    spend: spend,
    incomeThrottle: incomeThrottle,
    incomeRate: function () { return run.incomeRate; },
    softCap: function () { return mods.softCap; },
    territory: function () { return run.territory; },
    lastKillGold: function () { return _lastKillGold; },

    /* treasury */
    treasuryLevel: function () { return run.treasury; },
    treasuryCost: treasuryCost,
    treasuryIncome: treasuryIncome,
    canBuyTreasury: canBuyTreasury,
    buyTreasury: buyTreasury,

    /* roster & purchasing */
    unitDef: unitDef,
    roster: rosterFor,
    availableRoster: availableRoster,
    rosterView: rosterView,
    unitCost: unitCost,
    canAfford: canAfford,
    buyUnit: buyUnit,
    refundUnit: refundUnit,
    releaseSupply: releaseSupply,
    supplyMax: supplyMax,
    supplyFree: supplyFree,
    supplyUsed: function () { return run.supplyUsed; },
    spawnReady: function () { return run.spawnCd <= 0; },

    /* perks */
    perkDef: function (id) { return PERK_BY_ID[id] || null; },
    perkStacks: perkStacks,
    hasPerk: hasPerk,
    perkTagCount: countTag,
    currentOffer: function () { return run.offer; },
    offerPerks: offerPerks,
    choosePerk: choosePerk,
    rerollOffer: rerollOffer,
    declineOffer: declineOffer,
    perkView: perkView,

    /* meta tree */
    metaTier: metaTier,
    metaCost: metaCost,
    metaNode: function (id) { return META_BY_ID[id] || null; },
    buyMeta: buyMeta,
    respecMeta: respecMeta,
    metaTreeView: metaTreeView,
    renown: function () { return meta.renown; },
    addRenown: addRenown,

    /* store & cosmetics */
    storeItem: function (id) { return STORE_BY_ID[id] || null; },
    storeView: storeView,
    buyStore: buyStore,
    owns: function (id) { return ownedCount(id) > 0; },
    ownedCount: ownedCount,
    equipCosmetic: equipCosmetic,
    cosmetics: function () { return meta.cosmetics; },

    /* loadouts & equipment */
    loadouts: function () { ensureLoadouts(); return meta.loadouts; },
    getLoadout: getLoadout,
    saveLoadout: saveLoadout,
    applyLoadout: applyLoadout,
    equipGear: equipGear,
    gearDef: function (id) { return GEAR_BY_ID[id] || null; },
    ownsGear: function (id) { return !!meta.gearOwned[id]; },
    grantGear: grantGear,

    /* currencies & progression */
    grantGems: grantGems,
    gems: function () { return state.gems; },
    addBpXp: addBpXp,
    bpLevel: function () { return meta.bp.level; },
    bpRewardsFor: bpRewardsFor,
    claimBp: claimBp,
    bpXpForLevel: bpXpForLevel,

    /* quests & dailies */
    quests: questView,
    questProgress: addQuestProgress,
    claimQuest: claimQuest,
    rerollQuest: rerollQuest,
    dailyAvailable: dailyAvailable,
    claimDaily: claimDaily,
    checkDaily: checkDaily,

    /* unlocks */
    isUnlocked: isUnlocked,
    checkUnlocks: checkUnlocks,
    nextUnlock: function () {
      var w = int(state.wave, 0);
      for (var i = 0; i < UNLOCKS.length; i++) {
        if (!state.unlocks[UNLOCKS[i].id]) return UNLOCKS[i];
      }
      return null;
    },

    /* ui */
    summary: summary,
    stats: function () {
      return {
        killGold: run.killGold, territoryGold: run.territoryGold,
        passiveGold: run.passiveGold, siegeGold: run.siegeGold,
        earned: run.earnedThisRun, spent: run.spentThisRun,
        leaked: run.goldLeaked, evolves: run.evolvesThisRun, perks: run.perksThisRun
      };
    }
  };

  AOW.Economy = Economy;

  /* Boot when Core is ready (or immediately if it already is). */
  try {
    if (CORE_OK) {
      init();
    } else {
      recompute();
      if (global.addEventListener) {
        global.addEventListener('load', function () {
          if (!CORE_OK && AOW.Core && AOW.Core.on) {
            Core = AOW.Core; CORE_OK = true;
            try { init(); } catch (e) { warn('late init failed', e); }
          }
        }, false);
      }
    }
  } catch (e) {
    warn('init failed — Economy is inert but the game will keep running.', e);
  }

})(typeof window !== 'undefined' ? window : this);
