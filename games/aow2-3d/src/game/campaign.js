/* =============================================================================
 * AOW2-3D  —  src/game/campaign.js  —  global: AOW.Campaign
 * -----------------------------------------------------------------------------
 * Structure and reasons to keep playing.
 *
 *   1. A 33-node branching world map across 8 eras, each with its own faction,
 *      victory conditions, optional hard nodes and rewards.
 *   2. Ten mission types (annihilation, survival, protect, capture-and-hold,
 *      escort, assassination, siege, last stand, boss duel, gauntlet), each
 *      with a real objective machine — not a re-skinned "kill them all".
 *   3. Twenty per-mission mutators so a replayed node is a different fight.
 *   4. Endless mode: four difficulties, escalating waves, milestone bosses
 *      every 10, a score formula, best-wave records and a daily seeded run.
 *   5. The session contract: autosave every wave, instant resume, an era
 *      checkpoint so a wipe rewinds ONE era, and an end-of-session summary.
 *   6. A defeat post-mortem: what killed you, damage by enemy type, one
 *      coaching line generated from the run, and one-tap retry from checkpoint.
 *   7. Records/leaderboard data model, 44 achievements, and unlock gating that
 *      never asks you to re-grind old content.
 *   8. Light narrative: era intro cards and a final-siege climax per era.
 *
 * Depends ONLY on AOW.Core. Talks to everything else through the event bus.
 * No allocations in the per-step hot path. Nothing here may crash a frame.
 * ========================================================================== */
(function (global) {
  'use strict';

  var AOW = global.AOW || (global.AOW = {});

  if (AOW.Campaign && AOW.Campaign.__isAowCampaign) {
    try { console.warn('[AOW.Campaign] already initialised — ignoring duplicate script include.'); } catch (e) {}
    return;
  }

  var C = AOW.Core;

  /* ---------------------------------------------------------------------------
   * 0. Hard dependency guard — degrade to an inert stub, never crash the page.
   * ------------------------------------------------------------------------ */
  if (!C || !C.__isAowCore) {
    try { console.warn('[AOW.Campaign] AOW.Core is missing — Campaign runs in inert mode.'); } catch (e) {}
    var deadArr = [];
    var deadObj = {};
    AOW.Campaign = {
      __isAowCampaign: true, version: '1.0.0', ready: false, failed: true,
      NODES: deadArr, MUTATORS: deadArr, ACHIEVEMENTS: deadArr, DIFFICULTIES: deadArr,
      progress: deadObj, mission: deadObj, mods: deadObj, records: deadObj,
      init: function () { return false; },
      mapView: function () { return deadArr; },
      nodeView: function () { return null; },
      startNode: function () { return false; },
      startEndless: function () { return false; },
      startDaily: function () { return false; },
      abandon: function () {},
      retry: function () { return false; },
      retryCheckpoint: function () { return false; },
      resume: function () { return false; },
      hasResume: function () { return false; },
      hud: function () { return deadObj; },
      objectives: function () { return deadArr; },
      postMortem: function () { return null; },
      sessionSummary: function () { return null; },
      achievementView: function () { return deadArr; },
      leaderboard: function () { return deadArr; },
      selfTest: function () { return { ok: false, notes: ['AOW.Core unavailable.'] }; }
    };
    return;
  }

  var S = C.state;

  var W        = AOW.W || 420;
  var FORT_X   = AOW.FORT_X || { 1: 20, '-1': 400 };
  var SPAWN_X  = AOW.SPAWN_X || { 1: 34, '-1': 386 };
  var ERA_IDS  = ['stone', 'bronze', 'iron', 'medieval', 'gunpowder', 'industrial', 'modern', 'future'];
  var ERA_COUNT = ERA_IDS.length;
  var ERA_K    = 1.28;   /* must match Sim's per-era stat multiplier */

  function warn(k, m, e) { try { C.warnOnce('campaign:' + k, m, e); } catch (x) {} }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function int(v, d) { return (typeof v === 'number' && isFinite(v)) ? (v | 0) : d; }
  function str(v, d) { return (typeof v === 'string') ? v : d; }
  function has(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k); }
  function emit(n, p) { try { C.emit(n, p); } catch (e) { warn('emit', 'emit failed for ' + n, e); } }
  function on(n, f) { try { return C.on(n, f) || noop; } catch (e) { return noop; } }
  function noop() {}
  function eraScale(i) { return Math.pow(ERA_K, clamp(int(i, 0), 0, ERA_COUNT - 1)); }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(num(sec, 0)));
    var m = (sec / 60) | 0, s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  var _toastEv = { msg: '', kind: 'info' };
  function toast(msg, kind) { _toastEv.msg = msg; _toastEv.kind = kind || 'info'; emit('ui:toast', _toastEv); }
  var _shakeEv = { amount: 0 };
  function shake(a) { _shakeEv.amount = a; emit('camera:shake', _shakeEv); }

  /* =========================================================================
   * 1. NARRATIVE — eras, factions, intro cards, climax lines
   *    Short and punchy. One line of lore, one faction, one climax promise.
   * ====================================================================== */
  var ERA_LORE = [
    { index: 0, id: 'stone',      era: 'Stone',      title: 'Ash and Bone',
      faction: 'Ashfang Clans',      banner: '#b8804a',
      lore: 'They have no walls and no mercy. They have numbers, and they have fire.',
      climax: 'Skullspire stands over the valley. Pull it down.',
      tip: 'Bodies beat quality here. Keep the line fed.' },
    { index: 1, id: 'bronze',     era: 'Bronze',     title: 'The Shield Wall',
      faction: 'Sunspear Dominion', banner: '#e0a54a',
      lore: 'Bronze taught men to stand shoulder to shoulder. Now nothing moves them.',
      climax: 'The Gate of Ten Suns has never opened for an enemy. Today it does.',
      tip: 'Frontal shields eat slashes. Go around, or go blunt.' },
    { index: 2, id: 'iron',       era: 'Iron',       title: 'Discipline',
      faction: 'Legion of Vurr',    banner: '#c3ccd6',
      lore: 'The Legion does not charge. It advances, and the ground behind it is empty.',
      climax: 'Ironwall is one gate and ten thousand spears. Break the gate.',
      tip: 'Armour is real now. Pierce it or crush it — do not scratch it.' },
    { index: 3, id: 'medieval',   era: 'Medieval',   title: 'Black Banners',
      faction: 'Blackbanner Order', banner: '#6c7fb5',
      lore: 'Knights ride for a god nobody has seen. The horses are very real.',
      climax: 'Blackbanner Keep has held for two hundred years. Give it a bad day.',
      tip: 'A charge that lands wins. A charge that is braced for dies.' },
    { index: 4, id: 'gunpowder',  era: 'Gunpowder',  title: 'Powder and Patience',
      faction: 'Kellish Line',      banner: '#d8c08a',
      lore: 'They reload in ranks and count to three. Do your dying between counts.',
      climax: 'Fort Kell is a hundred muzzles behind a wall. Get inside the reload.',
      tip: 'Volleys have gaps. Time your push to the gap, not the gun.' },
    { index: 5, id: 'industrial', era: 'Industrial', title: 'The Combine',
      faction: 'Cogwork Combine',   banner: '#9fb0ba',
      lore: 'The Combine does not raise soldiers. It manufactures them, on schedule.',
      climax: 'The Works never stop. Stop them.',
      tip: 'Their production scales with time. Speed is a weapon.' },
    { index: 6, id: 'modern',     era: 'Modern',     title: 'Grey Vanguard',
      faction: 'Grey Vanguard',     banner: '#8fa2b4',
      lore: 'No banners, no horns. Just optics, radios, and a very good plan.',
      climax: 'Grey Bastion coordinates every gun on the continent. Cut the head off.',
      tip: 'Their support units are the fight. Kill the medics and the spotters.' },
    { index: 7, id: 'future',     era: 'Future',     title: 'The Ascendancy',
      faction: 'Halo Ascendancy',   banner: '#7fd8ff',
      lore: 'They uploaded their generals. The generals have been waiting for you.',
      climax: 'The Ascendant is the last mind standing. End the argument.',
      tip: 'Shields regenerate. Burst them down or you fight the same unit twice.' }
  ];
  var ERA_LORE_BY_ID = {};
  (function () { for (var i = 0; i < ERA_LORE.length; i++) { ERA_LORE_BY_ID[ERA_LORE[i].id] = ERA_LORE[i]; } })();

  function eraLore(i) { return ERA_LORE[clamp(int(i, 0), 0, ERA_LORE.length - 1)]; }

  /* =========================================================================
   * 2. MUTATORS — per-mission modifiers. `danger` feeds the score multiplier.
   *    `mods` are merged into Campaign.mods and published on the bus so the
   *    Sim / Economy / Render can consult them without knowing about us.
   * ====================================================================== */
  var MUTATORS = [
    { id: 'fog',        name: 'Blindfog',       icon: '~',  danger: 0.10,
      blurb: 'Thick fog. You see them late.',
      mods: { fog: 0.85, visibility: 0.55 } },
    { id: 'night',      name: 'Nightfall',      icon: 'C',  danger: 0.12,
      blurb: 'Fought in the dark. Ranged units lose reach.',
      mods: { night: 1, visibility: 0.7, rangeMul: 0.82 } },
    { id: 'rain',       name: 'Downpour',       icon: '/',  danger: 0.10,
      blurb: 'Rain. Footing is bad, fire is worse.',
      mods: { rain: 1, playerSpeedMul: 0.93, enemySpeedMul: 0.93, fireMul: 0.4 } },
    { id: 'storm',      name: 'Thunderhead',    icon: '!',  danger: 0.18,
      blurb: 'Rain, wind, and lightning that does not care whose side you are on.',
      mods: { rain: 1, wind: 1, night: 0.5, rangeMul: 0.88, randomStrikes: 1 } },
    { id: 'blizzard',   name: 'Whiteout',       icon: '*',  danger: 0.20,
      blurb: 'Snow. Everything is slower and colder.',
      mods: { snow: 1, fog: 0.6, playerSpeedMul: 0.86, enemySpeedMul: 0.9, visibility: 0.6 } },
    { id: 'no_ranged',  name: 'Close Quarters', icon: 'X',  danger: 0.22,
      blurb: 'No ranged units may be fielded. Bring a knife.',
      mods: { rangedDisabled: 1 } },
    { id: 'no_powers',  name: 'Silence',        icon: 'o',  danger: 0.20,
      blurb: 'Battlefield powers are locked.',
      mods: { powersDisabled: 1 } },
    { id: 'dbl_champ',  name: 'Twin Champions', icon: '&',  danger: 0.26,
      blurb: 'Both sides field double champions.',
      mods: { championMul: 2, enemyChampionMul: 2 } },
    { id: 'sudden',     name: 'Sudden Death',   icon: '#',  danger: 0.35,
      blurb: 'No fort repair, no revives. One mistake ends it.',
      mods: { suddenDeath: 1, reviveDisabled: 1, fortRegen: -1 } },
    { id: 'gold_drought', name: 'Lean Purse',   icon: '$',  danger: 0.24,
      blurb: 'Income is cut by a third.',
      mods: { incomeMul: 0.66, killGoldMul: 0.8 } },
    { id: 'heavy_purse', name: 'War Chest',     icon: '+',  danger: -0.10,
      blurb: 'Income is up by half. A gift — take it.',
      mods: { incomeMul: 1.5, killGoldMul: 1.2 } },
    { id: 'elite_guard', name: 'Elite Guard',   icon: 'E',  danger: 0.28,
      blurb: 'A third of their line are veterans.',
      mods: { enemyEliteChance: 0.34, enemyHpMul: 1.12 } },
    { id: 'iron_hide',  name: 'Iron Hide',      icon: 'A',  danger: 0.22,
      blurb: 'Enemy armour is doubled. Bring blunt or piercing.',
      mods: { enemyArmorMul: 2.0 } },
    { id: 'bloodlust',  name: 'Bloodlust',      icon: 'B',  danger: 0.25,
      blurb: 'Everyone hits harder and dies faster.',
      mods: { enemyDmgMul: 1.35, playerDmgMul: 1.2, enemyHpMul: 0.9, playerHpMul: 0.92 } },
    { id: 'swift_foe',  name: 'Swiftfoot',      icon: '>',  danger: 0.20,
      blurb: 'They move a quarter faster. Kiting will not save you.',
      mods: { enemySpeedMul: 1.25, enemySpawnCdMul: 0.85 } },
    { id: 'reinforce',  name: 'Endless Column', icon: '=',  danger: 0.30,
      blurb: 'Their waves arrive 30% more often.',
      mods: { waveIntervalMul: 0.7, enemyCountMul: 1.15 } },
    { id: 'fragile',    name: 'Cracked Walls',  icon: 'v',  danger: 0.30,
      blurb: 'Your fort has half the hit points.',
      mods: { fortHpMul: 0.5 } },
    { id: 'boss_rush',  name: 'Warlords',       icon: 'W',  danger: 0.34,
      blurb: 'Champions lead every enemy wave.',
      mods: { enemyChampionMul: 2.5, bossHpMul: 1.1 } },
    { id: 'veteran_ai', name: 'Field Marshal',  icon: 'M',  danger: 0.26,
      blurb: 'Their commander is good. Expect focus fire and real retreats.',
      mods: { aiSkill: 1.6, enemyFocusFire: 1 } },
    { id: 'overtime',   name: 'Against the Clock', icon: 'T', danger: 0.24,
      blurb: 'The clock runs 25% faster than it looks.',
      mods: { timeLimitMul: 0.75 } }
  ];
  var MUT_BY_ID = {};
  (function () { for (var i = 0; i < MUTATORS.length; i++) { MUT_BY_ID[MUTATORS[i].id] = MUTATORS[i]; } })();

  /* Mutators safe to roll for endless / daily runs (nothing that hard-locks a
     mission-specific rule the player did not sign up for). */
  var ROLLABLE = ['fog', 'night', 'rain', 'storm', 'blizzard', 'no_ranged', 'no_powers',
    'dbl_champ', 'gold_drought', 'heavy_purse', 'elite_guard', 'iron_hide', 'bloodlust',
    'swift_foe', 'reinforce', 'boss_rush', 'veteran_ai'];

  /* =========================================================================
   * 3. MODIFIER BUNDLE — the flat table other modules read every frame.
   * ====================================================================== */
  var MOD_DEFAULTS = {
    enemyHpMul: 1, enemyDmgMul: 1, enemySpeedMul: 1, enemyCountMul: 1,
    enemyArmorMul: 1, enemyEliteChance: 0, enemyChampionMul: 1, enemySpawnCdMul: 1,
    enemyFocusFire: 0, aiSkill: 1,
    playerHpMul: 1, playerDmgMul: 1, playerSpeedMul: 1, championMul: 1,
    goldMul: 1, incomeMul: 1, killGoldMul: 1,
    fortHpMul: 1, enemyFortHpMul: 1, fortRegen: 0,
    rangedDisabled: 0, powersDisabled: 0, reviveDisabled: 0, suddenDeath: 0,
    bossHpMul: 1, waveIntervalMul: 1, spawnCdMul: 1, supplyMul: 1, rangeMul: 1,
    fireMul: 1, randomStrikes: 0, timeLimitMul: 1,
    fog: 0, night: 0, rain: 0, snow: 0, wind: 0, visibility: 1,
    scoreMul: 1, difficulty: 1
  };

  var mods = {};
  (function () { for (var k in MOD_DEFAULTS) { mods[k] = MOD_DEFAULTS[k]; } })();

  var _weatherEv = { fog: 0, night: 0, rain: 0, snow: 0, wind: 0, visibility: 1 };

  function resetMods() {
    for (var k in MOD_DEFAULTS) { mods[k] = MOD_DEFAULTS[k]; }
  }

  function applyModBundle(src, weight) {
    if (!src) { return; }
    weight = num(weight, 1);
    for (var k in src) {
      if (!has(src, k)) { continue; }
      var v = num(src[k], null);
      if (v === null) { continue; }
      if (!has(mods, k)) { mods[k] = v; continue; }
      var base = MOD_DEFAULTS[k];
      if (base === 1) {
        /* multiplicative channel */
        mods[k] *= (1 + (v - 1) * weight);
      } else if (base === 0) {
        /* additive channel — take the strongest, never stack to nonsense */
        var nv = v * weight;
        if (Math.abs(nv) > Math.abs(mods[k])) { mods[k] = nv; }
      } else {
        mods[k] = v;
      }
    }
  }

  function publishMods() {
    /* clamp the channels that could break the game if a stack went wild */
    mods.enemyHpMul    = clamp(mods.enemyHpMul, 0.25, 12);
    mods.enemyDmgMul   = clamp(mods.enemyDmgMul, 0.2, 10);
    mods.enemySpeedMul = clamp(mods.enemySpeedMul, 0.5, 2.2);
    mods.playerHpMul   = clamp(mods.playerHpMul, 0.4, 4);
    mods.playerDmgMul  = clamp(mods.playerDmgMul, 0.4, 4);
    mods.incomeMul     = clamp(mods.incomeMul, 0.3, 4);
    mods.waveIntervalMul = clamp(mods.waveIntervalMul, 0.4, 2.5);
    mods.fortHpMul     = clamp(mods.fortHpMul, 0.25, 4);
    mods.visibility    = clamp01(mods.visibility);
    mods.fog           = clamp(mods.fog, 0, 1);
    emit('campaign:mods', mods);
    _weatherEv.fog = mods.fog; _weatherEv.night = mods.night; _weatherEv.rain = mods.rain;
    _weatherEv.snow = mods.snow; _weatherEv.wind = mods.wind; _weatherEv.visibility = mods.visibility;
    emit('weather:set', _weatherEv);
  }

  /* =========================================================================
   * 4. DIFFICULTIES (endless + a global campaign difficulty)
   * ====================================================================== */
  var DIFFICULTIES = [
    { id: 'casual',    name: 'Casual',    scoreMul: 0.60, index: 0,
      blurb: 'For the story. Enemies hit softer and gold flows.',
      mods: { enemyHpMul: 0.78, enemyDmgMul: 0.72, incomeMul: 1.30, killGoldMul: 1.15, waveIntervalMul: 1.15 } },
    { id: 'standard',  name: 'Standard',  scoreMul: 1.00, index: 1,
      blurb: 'The fight as designed.',
      mods: {} },
    { id: 'veteran',   name: 'Veteran',   scoreMul: 1.65, index: 2,
      blurb: 'Bigger waves, tougher line, tighter purse.',
      mods: { enemyHpMul: 1.32, enemyDmgMul: 1.28, enemyCountMul: 1.15, incomeMul: 0.9, enemyEliteChance: 0.12, aiSkill: 1.3 } },
    { id: 'nightmare', name: 'Nightmare', scoreMul: 2.60, index: 3,
      blurb: 'Elites everywhere, no slack, no forgiveness.',
      mods: { enemyHpMul: 1.85, enemyDmgMul: 1.75, enemyCountMul: 1.30, incomeMul: 0.82, enemyEliteChance: 0.34,
              enemySpeedMul: 1.08, aiSkill: 1.7, waveIntervalMul: 0.85 } }
  ];
  var DIFF_BY_ID = {};
  (function () { for (var i = 0; i < DIFFICULTIES.length; i++) { DIFF_BY_ID[DIFFICULTIES[i].id] = DIFFICULTIES[i]; } })();
  function diffDef(id) { return DIFF_BY_ID[id] || DIFF_BY_ID.standard; }

  /* =========================================================================
   * 5. MISSION TYPES
   *    Every type owns: its objectives, its tick, and its reaction to events.
   *    They are pure logic over `m` (the live mission) — no rendering, no Sim.
   * ====================================================================== */
  var MISSION_TYPES = {};

  function defType(def) { MISSION_TYPES[def.id] = def; return def; }

  defType({
    id: 'annihilation', name: 'Annihilation', short: 'RAZE', icon: '#',
    blurb: 'Break their fort. Nothing else matters.',
    tip: 'Push when their line thins — a wave that arrives alone dies alone.',
    setup: function (m) {
      addObjective(m, 'fort', 'destroy_fort', 'Destroy the enemy fort', 1, false);
      if (m.params.killGoal > 0) {
        addObjective(m, 'kills', 'kill', 'Cut down ' + m.params.killGoal + ' defenders', m.params.killGoal, true);
      }
      addObjective(m, 'hold', 'protect_fort', 'Keep your fort standing', 1, false);
    },
    tick: function (m) {
      setObjective(m, 'kills', m.stats.kills);
      checkFortObjectives(m);
    }
  });

  defType({
    id: 'survival', name: 'Survival', short: 'HOLD', icon: 'S',
    blurb: 'Survive every wave they send.',
    tip: 'Bank gold between waves. A fat wallet is a second army.',
    setup: function (m) {
      var n = Math.max(1, int(m.params.waves, 5));
      addObjective(m, 'waves', 'survive_waves', 'Survive ' + n + ' waves', n, false);
      addObjective(m, 'hold', 'protect_fort', 'Keep your fort standing', 1, false);
      if (m.params.fortPct > 0) {
        addObjective(m, 'intact', 'fort_above', 'Finish above ' + Math.round(m.params.fortPct * 100) + '% fort HP', 1, true);
      }
      m.wavePacer = num(m.params.waveSeconds, 26);
      m.waveClock = m.wavePacer;
    },
    tick: function (m, dt) {
      pacerTick(m, dt);
      setObjective(m, 'waves', m.wave);
      setObjective(m, 'intact', fortPct(1) >= num(m.params.fortPct, 0) ? 1 : 0);
      if (m.wave >= objTarget(m, 'waves') && !m.resolved) { win(m, 'waves-survived'); return; }
      checkFortObjectives(m);
    }
  });

  defType({
    id: 'protect', name: 'Protect the VIP', short: 'GUARD', icon: 'V',
    blurb: 'Keep one person alive while everything tries to change that.',
    tip: 'Park your line ahead of the VIP, not on top of it. Splash kills carriers.',
    setup: function (m) {
      var hp = num(m.params.vipHp, 1200) * eraScale(m.eraIndex);
      var a = spawnActor(m, 'vip', 1, num(m.params.vipX, FORT_X[1] + 34), hp, 0);
      a.label = str(m.params.vipName, 'The Envoy');
      addObjective(m, 'vip', 'protect_actor', 'Keep ' + a.label + ' alive', 1, false);
      var n = Math.max(1, int(m.params.waves, 4));
      addObjective(m, 'waves', 'survive_waves', 'Hold for ' + n + ' waves', n, false);
      addObjective(m, 'vip90', 'actor_above', a.label + ' finishes above 60% HP', 1, true);
      m.wavePacer = num(m.params.waveSeconds, 28);
      m.waveClock = m.wavePacer;
    },
    tick: function (m, dt) {
      pacerTick(m, dt);
      var a = actorByRole(m, 'vip');
      if (a) {
        setObjective(m, 'vip', a.alive ? 1 : 0);
        setObjective(m, 'vip90', (a.hp / a.maxHp) >= 0.6 ? 1 : 0);
        if (!a.alive && !m.resolved) { lose(m, 'vip-lost', 'Your VIP was killed.'); return; }
      }
      setObjective(m, 'waves', m.wave);
      if (m.wave >= objTarget(m, 'waves') && !m.resolved) { win(m, 'vip-safe'); return; }
      checkFortObjectives(m);
    }
  });

  defType({
    id: 'capture', name: 'Capture and Hold', short: 'HOLD', icon: 'O',
    blurb: 'Take the ground. Then keep it, which is the hard part.',
    tip: 'Numbers inside the ring decide it. Cheap bodies are worth more than heroes here.',
    setup: function (m) {
      var zs = m.params.zones || [{ x: W * 0.5, r: 18 }];
      for (var i = 0; i < zs.length; i++) {
        addZone(m, 'z' + i, num(zs[i].x, W * 0.5), num(zs[i].r, 18), str(zs[i].name, 'Point ' + (i + 1)));
      }
      var hold = Math.max(5, num(m.params.holdSeconds, 45));
      addObjective(m, 'hold', 'hold_zones', 'Hold the ground for ' + Math.round(hold) + 's', hold, false);
      addObjective(m, 'cap', 'capture_all', 'Capture every point', m.zones.length, false);
      addObjective(m, 'fort', 'protect_fort', 'Keep your fort standing', 1, false);
    },
    tick: function (m, dt) {
      zoneTick(m, dt);
      var owned = 0, i;
      for (i = 0; i < m.zones.length; i++) { if (m.zones[i].owner === 1) { owned++; } }
      setObjective(m, 'cap', owned);
      if (owned >= m.zones.length) { m.holdT += dt; }
      else if (m.params.decayHold !== false) { m.holdT = Math.max(0, m.holdT - dt * 0.5); }
      setObjective(m, 'hold', m.holdT);
      if (m.holdT >= objTarget(m, 'hold') && !m.resolved) { win(m, 'ground-held'); return; }
      checkFortObjectives(m);
    }
  });

  defType({
    id: 'escort', name: 'Escort', short: 'MOVE', icon: '>',
    blurb: 'Walk the wagon across. It does not walk fast.',
    tip: 'Clear ahead of the wagon, not behind it. It stops when enemies are close.',
    setup: function (m) {
      var hp = num(m.params.vipHp, 1600) * eraScale(m.eraIndex);
      var fromX = num(m.params.fromX, SPAWN_X[1]);
      var a = spawnActor(m, 'convoy', 1, fromX, hp, num(m.params.speed, 4.0));
      a.label = str(m.params.vipName, 'The Convoy');
      a.goalX = num(m.params.toX, FORT_X[-1] - 30);
      a.startX = fromX;
      addObjective(m, 'reach', 'escort_reach', a.label + ' reaches the crossing', 1, false);
      addObjective(m, 'alive', 'protect_actor', 'Keep ' + a.label + ' intact', 1, false);
      if (m.timeLimit > 0) { addObjective(m, 'time', 'time_left', 'Arrive before the clock', 1, false); }
      m.wavePacer = num(m.params.waveSeconds, 24);
      m.waveClock = m.wavePacer;
    },
    tick: function (m, dt) {
      pacerTick(m, dt);
      var a = actorByRole(m, 'convoy');
      if (!a) { return; }
      setObjective(m, 'alive', a.alive ? 1 : 0);
      if (!a.alive && !m.resolved) { lose(m, 'convoy-lost', 'The convoy was destroyed.'); return; }
      var span = Math.abs(a.goalX - a.startX);
      var done = span > 0 ? clamp01(Math.abs(a.x - a.startX) / span) : 1;
      m.escortPct = done;
      setObjective(m, 'reach', done >= 0.999 ? 1 : 0, done);
      if (m.timeLimit > 0) { setObjective(m, 'time', 0, clamp01(m.timeLeft / m.timeLimit)); }
      if (done >= 0.999 && !m.resolved) { win(m, 'convoy-arrived'); return; }
      checkFortObjectives(m);
    }
  });

  defType({
    id: 'assassination', name: 'Assassination', short: 'KILL', icon: 'X',
    blurb: 'One name on the list. Everything around it is scenery.',
    tip: 'Their champion heals while its guard lives. Strip the guard first.',
    setup: function (m) {
      var hp = num(m.params.targetHp, 3200) * eraScale(m.eraIndex);
      var a = spawnActor(m, 'target', -1, num(m.params.targetX, FORT_X[-1] - 40), hp, num(m.params.targetSpeed, 0));
      a.label = str(m.params.targetName, 'The Warlord');
      a.guarded = true;
      a.guardHp = num(m.params.guardHp, hp * 0.5);
      a.guardMax = a.guardHp;
      addObjective(m, 'kill', 'kill_actor', 'Kill ' + a.label, 1, false);
      addObjective(m, 'guard', 'break_guard', 'Break the honour guard', 1, true);
      addObjective(m, 'fort', 'protect_fort', 'Keep your fort standing', 1, false);
      m.wavePacer = num(m.params.waveSeconds, 30);
      m.waveClock = m.wavePacer;
    },
    tick: function (m, dt) {
      pacerTick(m, dt);
      var a = actorByRole(m, 'target');
      if (a) {
        setObjective(m, 'guard', a.guardHp <= 0 ? 1 : 0, a.guardMax > 0 ? 1 - (a.guardHp / a.guardMax) : 1);
        setObjective(m, 'kill', a.alive ? 0 : 1, 1 - (a.hp / a.maxHp));
        if (!a.alive && !m.resolved) { win(m, 'target-eliminated'); return; }
      }
      checkFortObjectives(m);
    }
  });

  defType({
    id: 'siege', name: 'Siege', short: 'BREAK', icon: 'T',
    blurb: 'Their wall, your clock. Break it before the clock breaks you.',
    tip: 'Siege units out-range the wall. Escort them, do not lead with them.',
    setup: function (m) {
      addObjective(m, 'fort', 'destroy_fort', 'Break the fort before time', 1, false);
      addObjective(m, 'time', 'time_left', 'Time remaining', 1, false);
      addObjective(m, 'hold', 'protect_fort', 'Keep your fort standing', 1, false);
      if (m.params.fastBonus > 0) {
        addObjective(m, 'fast', 'fast_clear', 'Break it inside ' + fmtTime(m.params.fastBonus), 1, true);
      }
    },
    tick: function (m) {
      /* a countdown reads as a draining bar, never as a ticked box */
      setObjective(m, 'time', 0, m.timeLimit > 0 ? clamp01(m.timeLeft / m.timeLimit) : 1);
      setObjective(m, 'fast', (m.t <= num(m.params.fastBonus, 0)) ? 1 : 0);
      checkFortObjectives(m);
      if (m.timeLimit > 0 && m.timeLeft <= 0 && !m.resolved) {
        lose(m, 'timeout', 'The siege ran out of time.');
      }
    }
  });

  defType({
    id: 'laststand', name: 'Last Stand', short: 'STAND', icon: '!',
    blurb: 'No reinforcements, no repairs. Just live longer than they can push.',
    tip: 'Trade space for time. Falling back is not losing.',
    setup: function (m) {
      var sec = Math.max(20, num(m.params.seconds, 120));
      m.standTarget = sec;
      addObjective(m, 'stand', 'survive_time', 'Hold out for ' + fmtTime(sec), sec, false);
      addObjective(m, 'hold', 'protect_fort', 'Keep your fort standing', 1, false);
      addObjective(m, 'wall', 'fort_above', 'Finish above 25% fort HP', 1, true);
      m.wavePacer = num(m.params.waveSeconds, 18);
      m.waveClock = m.wavePacer * 0.6;
      applyModBundle({ fortRegen: -1, reviveDisabled: 1 }, 1);
      publishMods();
    },
    tick: function (m, dt) {
      pacerTick(m, dt);
      m.standT += dt;
      setObjective(m, 'stand', m.standT);
      setObjective(m, 'wall', fortPct(1) >= 0.25 ? 1 : 0);
      if (m.standT >= m.standTarget && !m.resolved) { win(m, 'stood-firm'); return; }
      checkFortObjectives(m);
    }
  });

  defType({
    id: 'bossduel', name: 'Boss Duel', short: 'DUEL', icon: 'B',
    blurb: 'One monster. Three phases. No excuses.',
    tip: 'It telegraphs. Every phase change is a free window — use it, do not panic.',
    setup: function (m) {
      var hp = num(m.params.bossHp, 8000) * eraScale(m.eraIndex);
      var a = spawnActor(m, 'boss', -1, num(m.params.bossX, W * 0.62), hp, num(m.params.bossSpeed, 1.6));
      a.label = str(m.params.bossName, 'The Champion');
      a.boss = true;
      a.phases = Math.max(1, int(m.params.phases, 3));
      a.phase = 0;
      a.goalX = FORT_X[1] + 12;
      addObjective(m, 'boss', 'kill_actor', 'Kill ' + a.label, 1, false);
      addObjective(m, 'phase', 'boss_phase', 'Survive every phase', a.phases, false);
      addObjective(m, 'fort', 'protect_fort', 'Keep your fort standing', 1, false);
      addObjective(m, 'clean', 'no_phase_damage', 'Finish above 50% fort HP', 1, true);
      emit('boss:spawn', { boss: a });
    },
    tick: function (m, dt) {
      var a = actorByRole(m, 'boss');
      if (!a) { return; }
      bossActorTick(m, a, dt);
      setObjective(m, 'boss', a.alive ? 0 : 1, 1 - (a.hp / a.maxHp));
      setObjective(m, 'phase', a.phase);
      setObjective(m, 'clean', fortPct(1) >= 0.5 ? 1 : 0);
      if (!a.alive && !m.resolved) { win(m, 'boss-slain'); return; }
      checkFortObjectives(m);
    }
  });

  defType({
    id: 'gauntlet', name: 'Gauntlet', short: 'RUN', icon: 'G',
    blurb: 'Champion after champion, back to back, no breather.',
    tip: 'Do not overspend on round one. Round three is the one that kills you.',
    setup: function (m) {
      m.rounds = Math.max(1, int(m.params.rounds, 3));
      m.round = 0;
      addObjective(m, 'rounds', 'gauntlet_rounds', 'Clear ' + m.rounds + ' rounds', m.rounds, false);
      addObjective(m, 'fort', 'protect_fort', 'Keep your fort standing', 1, false);
      addObjective(m, 'flawless', 'fort_above', 'Finish above 40% fort HP', 1, true);
      startGauntletRound(m);
    },
    tick: function (m, dt) {
      var a = actorByRole(m, 'boss');
      if (a) {
        bossActorTick(m, a, dt);
        if (!a.alive) {
          removeActor(m, a);
          m.round++;
          setObjective(m, 'rounds', m.round);
          if (m.round >= m.rounds) { if (!m.resolved) { win(m, 'gauntlet-cleared'); } return; }
          toast('Round ' + (m.round + 1) + ' of ' + m.rounds, 'warn');
          m.roundGap = 3.0;
        }
      } else if (m.roundGap > 0) {
        m.roundGap -= dt;
        if (m.roundGap <= 0) { startGauntletRound(m); }
      }
      setObjective(m, 'flawless', fortPct(1) >= 0.4 ? 1 : 0);
      checkFortObjectives(m);
    }
  });

  function startGauntletRound(m) {
    var hp = num(m.params.bossHp, 3600) * eraScale(m.eraIndex) * (1 + m.round * 0.45);
    var a = spawnActor(m, 'boss', -1, W * 0.68, hp, 2.0);
    a.label = 'Champion ' + (m.round + 1);
    a.boss = true;
    a.phases = 2;
    a.phase = 0;
    a.goalX = FORT_X[1] + 12;
    emit('boss:spawn', { boss: a });
  }

  var MISSION_TYPE_LIST = ['annihilation', 'survival', 'protect', 'capture', 'escort',
    'assassination', 'siege', 'laststand', 'bossduel', 'gauntlet'];

  /* =========================================================================
   * 6. THE WORLD MAP — 33 nodes, 8 eras, branching, optional hard nodes.
   *    x/y are normalised map coordinates for whatever draws the map.
   * ====================================================================== */
  function N(o) { return o; }

  var NODES = [
    /* ---------------- Era 0 — Stone / Ashfang Clans ---------------------- */
    N({ id: 'n_s1', era: 0, name: 'The Bone Fords', type: 'annihilation', diff: 1,
      x: 0.045, y: 0.50, links: ['n_s2a', 'n_s2b'], entry: true,
      lore: 'They water their beasts here. Take the water.',
      params: { waves: 3, killGoal: 18 },
      mutators: [], reward: { gold: 150, gems: 1, renown: 8 },
      star: { time: 150, fortPct: 0.75 } }),
    N({ id: 'n_s2a', era: 0, name: 'Emberwood Watch', type: 'survival', diff: 2,
      x: 0.10, y: 0.34, links: ['n_s3'],
      lore: 'Hold the treeline until the fires burn down.',
      params: { waves: 5, waveSeconds: 26, fortPct: 0.5 },
      mutators: ['fog'], reward: { gold: 220, gems: 1, renown: 10 },
      star: { time: 190, fortPct: 0.6 } }),
    N({ id: 'n_s2b', era: 0, name: 'The Tar Pits', type: 'capture', diff: 3, hard: true, optional: true,
      x: 0.10, y: 0.68, links: ['n_s3'],
      lore: 'Slow ground, fast death. Nobody has held it twice.',
      params: { zones: [{ x: 170, r: 20, name: 'North Pit' }, { x: 250, r: 20, name: 'South Pit' }], holdSeconds: 45 },
      mutators: ['rain', 'elite_guard'], reward: { gold: 340, gems: 3, renown: 22 },
      star: { time: 230, fortPct: 0.5 } }),
    N({ id: 'n_s3', era: 0, name: 'Skullspire', type: 'siege', diff: 3, finale: true,
      x: 0.165, y: 0.50, links: ['n_b1'],
      lore: 'A tower of skulls, and a chief who wants one more.',
      params: { timeLimit: 165, fastBonus: 110 },
      mutators: [], reward: { gold: 400, gems: 4, renown: 30, era: 1 },
      star: { time: 130, fortPct: 0.55 } }),

    /* ---------------- Era 1 — Bronze / Sunspear Dominion ----------------- */
    N({ id: 'n_b1', era: 1, name: 'The Salt Flats', type: 'annihilation', diff: 2,
      x: 0.215, y: 0.50, links: ['n_b2a', 'n_b2b'], entry: true,
      lore: 'Flat, bright, and nowhere to hide from a shield wall.',
      params: { waves: 4, killGoal: 26 },
      mutators: [], reward: { gold: 260, gems: 1, renown: 12 },
      star: { time: 165, fortPct: 0.7 } }),
    N({ id: 'n_b2a', era: 1, name: 'Sun Caravan', type: 'escort', diff: 3,
      x: 0.27, y: 0.32, links: ['n_b3'],
      lore: 'Grain for a city that will not survive the winter without it.',
      params: { fromX: 40, toX: 372, speed: 4.2, vipHp: 1500, waveSeconds: 24, vipName: 'The Grain Train' },
      mutators: [], reward: { gold: 300, gems: 2, renown: 16 }, timeLimit: 200,
      star: { time: 160, fortPct: 0.5 } }),
    N({ id: 'n_b2b', era: 1, name: 'Obsidian Terrace', type: 'laststand', diff: 4, hard: true, optional: true,
      x: 0.27, y: 0.70, links: ['n_b3'],
      lore: 'Nowhere left to retreat to. Fitting, really.',
      params: { seconds: 130, waveSeconds: 17 },
      mutators: ['sudden', 'swift_foe'], reward: { gold: 460, gems: 4, renown: 28 },
      star: { time: 999, fortPct: 0.4 } }),
    N({ id: 'n_b3', era: 1, name: 'Gate of Ten Suns', type: 'siege', diff: 4, finale: true,
      x: 0.335, y: 0.50, links: ['n_i1'],
      lore: 'It has never opened for an enemy. It is about to make an exception.',
      params: { timeLimit: 175, fastBonus: 120 },
      mutators: ['iron_hide'], reward: { gold: 520, gems: 5, renown: 34, era: 2 },
      star: { time: 140, fortPct: 0.55 } }),

    /* ---------------- Era 2 — Iron / Legion of Vurr --------------------- */
    N({ id: 'n_i1', era: 2, name: 'Vurr Crossing', type: 'annihilation', diff: 3,
      x: 0.385, y: 0.50, links: ['n_i2a', 'n_i2b'], entry: true,
      lore: 'The Legion built the bridge. The Legion can lose it.',
      params: { waves: 4, killGoal: 34 },
      mutators: [], reward: { gold: 340, gems: 2, renown: 15 },
      star: { time: 170, fortPct: 0.7 } }),
    N({ id: 'n_i2a', era: 2, name: 'The Aqueduct', type: 'capture', diff: 3,
      x: 0.44, y: 0.33, links: ['n_i3'],
      lore: 'Cut the water and the fort argues with itself.',
      params: { zones: [{ x: 200, r: 19, name: 'Span' }, { x: 275, r: 19, name: 'Cistern' }], holdSeconds: 50 },
      mutators: ['night'], reward: { gold: 380, gems: 2, renown: 18 },
      star: { time: 200, fortPct: 0.6 } }),
    N({ id: 'n_i2b', era: 2, name: "The Legate's Head", type: 'assassination', diff: 5, hard: true, optional: true,
      x: 0.44, y: 0.69, links: ['n_i3'],
      lore: 'He signs the orders. Stop the orders.',
      params: { targetHp: 3600, guardHp: 2000, targetName: 'Legate Vurr', targetX: 340, waveSeconds: 28 },
      mutators: ['veteran_ai', 'elite_guard'], reward: { gold: 600, gems: 5, renown: 36 }, timeLimit: 210,
      star: { time: 165, fortPct: 0.5 } }),
    N({ id: 'n_i3', era: 2, name: 'Ironwall', type: 'siege', diff: 5, finale: true,
      x: 0.50, y: 0.50, links: ['n_m1'],
      lore: 'One gate. Ten thousand spears. Bring a bigger hammer.',
      params: { timeLimit: 185, fastBonus: 125 },
      mutators: ['iron_hide', 'reinforce'], reward: { gold: 680, gems: 6, renown: 42, era: 3 },
      star: { time: 150, fortPct: 0.5 } }),

    /* ---------------- Era 3 — Medieval / Blackbanner Order --------------- */
    N({ id: 'n_m1', era: 3, name: 'Ash Meadows', type: 'annihilation', diff: 4,
      x: 0.55, y: 0.50, links: ['n_m2a', 'n_m2b'], entry: true,
      lore: 'Good ground for cavalry. Theirs, unfortunately.',
      params: { waves: 5, killGoal: 44 },
      mutators: [], reward: { gold: 430, gems: 2, renown: 18 },
      star: { time: 180, fortPct: 0.68 } }),
    N({ id: 'n_m2a', era: 3, name: 'The Reliquary', type: 'protect', diff: 4,
      x: 0.605, y: 0.32, links: ['n_m3'],
      lore: 'A monk with a box. Everyone wants the box.',
      params: { vipHp: 1400, waves: 5, waveSeconds: 27, vipName: 'Brother Aldric', vipX: 90 },
      mutators: ['rain'], reward: { gold: 470, gems: 3, renown: 22 },
      star: { time: 210, fortPct: 0.55 } }),
    N({ id: 'n_m2b', era: 3, name: 'The Black Tourney', type: 'bossduel', diff: 6, hard: true, optional: true,
      x: 0.605, y: 0.70, links: ['n_m3'],
      lore: 'Their champion has never been unhorsed. Unhorse him.',
      params: { bossHp: 9500, phases: 3, bossName: 'Ser Havoc', bossX: 300 },
      mutators: ['dbl_champ'], reward: { gold: 760, gems: 6, renown: 44 },
      star: { time: 200, fortPct: 0.5 } }),
    N({ id: 'n_m3', era: 3, name: 'Blackbanner Keep', type: 'siege', diff: 6, finale: true,
      x: 0.66, y: 0.50, links: ['n_g1'],
      lore: 'Two hundred years unbroken. Give it a bad afternoon.',
      params: { timeLimit: 195, fastBonus: 135 },
      mutators: ['boss_rush'], reward: { gold: 820, gems: 7, renown: 50, era: 4 },
      star: { time: 160, fortPct: 0.5 } }),

    /* ---------------- Era 4 — Gunpowder / Kellish Line ------------------- */
    N({ id: 'n_g1', era: 4, name: 'Powder Road', type: 'annihilation', diff: 5,
      x: 0.705, y: 0.50, links: ['n_g2a', 'n_g2b'], entry: true,
      lore: 'Wagons of powder, and men who smoke anyway.',
      params: { waves: 5, killGoal: 52 },
      mutators: [], reward: { gold: 520, gems: 3, renown: 20 },
      star: { time: 185, fortPct: 0.65 } }),
    N({ id: 'n_g2a', era: 4, name: 'The Musket Line', type: 'survival', diff: 5,
      x: 0.755, y: 0.33, links: ['n_g3'],
      lore: 'They fire in ranks. Learn the rhythm or die to it.',
      params: { waves: 7, waveSeconds: 25, fortPct: 0.45 },
      mutators: ['fog'], reward: { gold: 560, gems: 3, renown: 24 },
      star: { time: 230, fortPct: 0.55 } }),
    N({ id: 'n_g2b', era: 4, name: "Sapper's Folly", type: 'escort', diff: 6, hard: true, optional: true,
      x: 0.755, y: 0.70, links: ['n_g3'],
      lore: 'One barrel of powder, one very long walk.',
      params: { fromX: 40, toX: 368, speed: 3.4, vipHp: 1900, waveSeconds: 21, vipName: 'The Powder Cart' },
      mutators: ['storm', 'no_ranged'], reward: { gold: 880, gems: 6, renown: 46 }, timeLimit: 190,
      star: { time: 165, fortPct: 0.45 } }),
    N({ id: 'n_g3', era: 4, name: 'Fort Kell', type: 'siege', diff: 6, finale: true,
      x: 0.805, y: 0.50, links: ['n_d1'],
      lore: 'A hundred muzzles behind a wall. Get inside the reload.',
      params: { timeLimit: 200, fastBonus: 140 },
      mutators: ['reinforce'], reward: { gold: 950, gems: 8, renown: 56, era: 5 },
      star: { time: 165, fortPct: 0.5 } }),

    /* ---------------- Era 5 — Industrial / Cogwork Combine --------------- */
    N({ id: 'n_d1', era: 5, name: 'The Coalworks', type: 'capture', diff: 6,
      x: 0.85, y: 0.50, links: ['n_d2a', 'n_d2b'], entry: true,
      lore: 'Take the coal and the machines get quiet.',
      params: { zones: [{ x: 165, r: 18, name: 'Pit Head' }, { x: 235, r: 18, name: 'Sorting' }, { x: 300, r: 18, name: 'Siding' }], holdSeconds: 55 },
      mutators: [], reward: { gold: 640, gems: 3, renown: 24 },
      star: { time: 220, fortPct: 0.6 } }),
    N({ id: 'n_d2a', era: 5, name: 'Rail Convoy', type: 'escort', diff: 6,
      x: 0.895, y: 0.33, links: ['n_d3'],
      lore: 'Iron on iron, and something big waiting at the cutting.',
      params: { fromX: 40, toX: 370, speed: 4.6, vipHp: 2400, waveSeconds: 22, vipName: 'The Armoured Train' },
      mutators: ['night'], reward: { gold: 700, gems: 4, renown: 28 }, timeLimit: 195,
      star: { time: 165, fortPct: 0.5 } }),
    N({ id: 'n_d2b', era: 5, name: 'Foundry Alarm', type: 'laststand', diff: 7, hard: true, optional: true,
      x: 0.895, y: 0.70, links: ['n_d3'],
      lore: 'The line never stops. Neither do they.',
      params: { seconds: 160, waveSeconds: 15 },
      mutators: ['sudden', 'reinforce', 'blizzard'], reward: { gold: 1050, gems: 7, renown: 54 },
      star: { time: 999, fortPct: 0.35 } }),
    N({ id: 'n_d3', era: 5, name: 'The Combine Works', type: 'siege', diff: 7, finale: true,
      x: 0.94, y: 0.50, links: ['n_x1'],
      lore: 'It builds a soldier every nine seconds. Make it stop.',
      params: { timeLimit: 210, fastBonus: 150 },
      mutators: ['elite_guard'], reward: { gold: 1150, gems: 9, renown: 64, era: 6 },
      star: { time: 175, fortPct: 0.45 } }),

    /* ---------------- Era 6 — Modern / Grey Vanguard --------------------- */
    N({ id: 'n_x1', era: 6, name: 'Highway Nine', type: 'annihilation', diff: 7,
      x: 0.30, y: 0.14, links: ['n_x2a', 'n_x2b'], entry: true, wrap: true,
      lore: 'Four lanes of open ground and nothing that loves you.',
      params: { waves: 6, killGoal: 70 },
      mutators: [], reward: { gold: 780, gems: 4, renown: 26 },
      star: { time: 190, fortPct: 0.62 } }),
    N({ id: 'n_x2a', era: 6, name: 'Signal Post', type: 'protect', diff: 7,
      x: 0.38, y: 0.10, links: ['n_x3'],
      lore: 'One radio. Everything they do goes through it.',
      params: { vipHp: 2600, waves: 6, waveSeconds: 26, vipName: 'The Relay', vipX: 105 },
      mutators: ['storm'], reward: { gold: 840, gems: 5, renown: 30 },
      star: { time: 220, fortPct: 0.5 } }),
    N({ id: 'n_x2b', era: 6, name: 'Decapitation', type: 'assassination', diff: 8, hard: true, optional: true,
      x: 0.38, y: 0.22, links: ['n_x3'],
      lore: 'Their command net has one human in it. Remove the human.',
      params: { targetHp: 7200, guardHp: 4200, targetName: 'Marshal Voss', targetX: 350, waveSeconds: 25 },
      mutators: ['veteran_ai', 'no_powers', 'fog'], reward: { gold: 1350, gems: 8, renown: 68 }, timeLimit: 220,
      star: { time: 170, fortPct: 0.4 } }),
    N({ id: 'n_x3', era: 6, name: 'Grey Bastion', type: 'siege', diff: 8, finale: true,
      x: 0.46, y: 0.14, links: ['n_f1'],
      lore: 'Every gun on the continent answers to this building.',
      params: { timeLimit: 220, fastBonus: 155 },
      mutators: ['boss_rush', 'elite_guard'], reward: { gold: 1500, gems: 10, renown: 78, era: 7 },
      star: { time: 185, fortPct: 0.45 } }),

    /* ---------------- Era 7 — Future / Halo Ascendancy ------------------- */
    N({ id: 'n_f1', era: 7, name: 'Orbital Fall', type: 'annihilation', diff: 8,
      x: 0.55, y: 0.14, links: ['n_f2a', 'n_f2b'], entry: true,
      lore: 'They drop in. You are already there. That is your whole advantage.',
      params: { waves: 6, killGoal: 88 },
      mutators: [], reward: { gold: 1050, gems: 5, renown: 30 },
      star: { time: 195, fortPct: 0.6 } }),
    N({ id: 'n_f2a', era: 7, name: 'The Null Gate', type: 'capture', diff: 8,
      x: 0.63, y: 0.10, links: ['n_f3'],
      lore: 'Stand inside the field long enough and the gate forgets them.',
      params: { zones: [{ x: 185, r: 17, name: 'Anchor A' }, { x: 250, r: 17, name: 'Core' }, { x: 315, r: 17, name: 'Anchor B' }], holdSeconds: 60 },
      mutators: ['no_ranged'], reward: { gold: 1150, gems: 6, renown: 34 },
      star: { time: 235, fortPct: 0.55 } }),
    N({ id: 'n_f2b', era: 7, name: 'Hardlight Gauntlet', type: 'gauntlet', diff: 9, hard: true, optional: true,
      x: 0.63, y: 0.22, links: ['n_f3'],
      lore: 'Three of their best, printed fresh, one after another.',
      params: { rounds: 3, bossHp: 5200 },
      mutators: ['dbl_champ', 'sudden'], reward: { gold: 1900, gems: 12, renown: 92 },
      star: { time: 260, fortPct: 0.45 } }),
    N({ id: 'n_f3', era: 7, name: 'The Ascendant', type: 'bossduel', diff: 10, finale: true,
      x: 0.71, y: 0.14, links: ['n_f4'],
      lore: 'The last mind standing. It has run this fight nine million times.',
      params: { bossHp: 26000, phases: 4, bossName: 'THE ASCENDANT', bossX: 320 },
      mutators: ['night'], reward: { gold: 2400, gems: 16, renown: 130 },
      star: { time: 240, fortPct: 0.4 } }),
    N({ id: 'n_f4', era: 7, name: 'Last Dawn', type: 'laststand', diff: 10, epilogue: true,
      x: 0.79, y: 0.14, links: [],
      lore: 'Everything it built, arriving at once. Hold until sunrise.',
      params: { seconds: 210, waveSeconds: 13 },
      mutators: ['sudden', 'reinforce', 'boss_rush'], reward: { gold: 3000, gems: 25, renown: 200 },
      star: { time: 999, fortPct: 0.3 } })
  ];

  var NODE_BY_ID = {};
  var NODES_BY_ERA = [];
  (function indexNodes() {
    var i, n;
    for (i = 0; i < ERA_COUNT; i++) { NODES_BY_ERA.push([]); }
    for (i = 0; i < NODES.length; i++) {
      n = NODES[i];
      n.index = i;
      n.links = n.links || [];
      n.mutators = n.mutators || [];
      n.params = n.params || {};
      n.reward = n.reward || {};
      n.star = n.star || { time: 180, fortPct: 0.6 };
      n.diff = int(n.diff, 1);
      n.hard = !!n.hard;
      n.optional = !!n.optional;
      n.faction = eraLore(n.era).faction;
      n.eraName = eraLore(n.era).era;
      NODE_BY_ID[n.id] = n;
      if (NODES_BY_ERA[n.era]) { NODES_BY_ERA[n.era].push(n); }
    }
    /* build reverse links once so availability checks are O(1) per node */
    for (i = 0; i < NODES.length; i++) { NODES[i].prev = []; }
    for (i = 0; i < NODES.length; i++) {
      n = NODES[i];
      for (var j = 0; j < n.links.length; j++) {
        var t = NODE_BY_ID[n.links[j]];
        if (t) { t.prev.push(n.id); }
        else { warn('link:' + n.id, 'node "' + n.id + '" links to unknown node "' + n.links[j] + '"'); }
      }
    }
  })();

  /* =========================================================================
   * 7. PERSISTENT PROGRESS — the save slice Campaign owns.
   * ====================================================================== */
  function defaultTotals() {
    return {
      missionsCleared: 0, missionsAttempted: 0, missionsFailed: 0,
      stars: 0, hardCleared: 0, finalesCleared: 0, perfectClears: 0, noLossClears: 0,
      erasReached: 0, kills: 0, losses: 0, bosses: 0, waves: 0,
      dmgDealt: 0, dmgTaken: 0, goldEarned: 0, powers: 0,
      endlessRuns: 0, dailyRuns: 0, retries: 0, mutatorClears: 0,
      comebacks: 0, flawlessSieges: 0, playtime: 0, sessions: 0,
      /* one-off badge counters the achievement tests read */
      speedBest: 0, threeStarNodes: 0, dailyStreakBest: 0,
      suddenClears: 0, noRangedClears: 0, escortPerfect: 0, vipUntouched: 0,
      gauntletClears: 0, captureFast: 0, standFull: 0
    };
  }

  function defaultRecords() {
    return {
      leaderboard: [],          /* newest-best first, capped */
      fastest: {},              /* nodeId -> best seconds */
      bestScoreByNode: {},      /* nodeId -> best score */
      bestEndlessWave: 0,
      bestEndlessScore: 0,
      bestWaveByDiff: { casual: 0, standard: 0, veteran: 0, nightmare: 0 },
      bestScoreByDiff: { casual: 0, standard: 0, veteran: 0, nightmare: 0 },
      longestStand: 0,
      totalScore: 0
    };
  }

  function defaultDaily() {
    return { date: '', score: 0, wave: 0, done: false, best: 0, streak: 0, lastDate: '', seed: 0, mutators: [] };
  }

  var progress = {
    v: 1,
    nodes: {},
    seen: {},
    achievements: {},
    totals: defaultTotals(),
    records: defaultRecords(),
    daily: defaultDaily(),
    endless: { runs: 0, lastDifficulty: 'standard', bestWave: 0, bestScore: 0 },
    session: null,        /* resume payload — the session contract */
    checkpoint: null,     /* era checkpoint — a wipe rewinds one era, not the run */
    lastSummary: null,
    lastPostMortem: null,
    difficulty: 'standard',
    unlockedEra: 0
  };

  function nodeState(id) {
    var st = progress.nodes[id];
    if (!st) {
      st = progress.nodes[id] = {
        cleared: 0, stars: 0, best: 0, attempts: 0, fails: 0, score: 0, lastResult: ''
      };
    }
    return st;
  }

  function serialize() {
    return {
      v: 1,
      nodes: progress.nodes,
      seen: progress.seen,
      ach: progress.achievements,
      totals: progress.totals,
      records: progress.records,
      daily: progress.daily,
      endless: progress.endless,
      session: progress.session,
      checkpoint: progress.checkpoint,
      difficulty: progress.difficulty,
      unlockedEra: progress.unlockedEra
    };
  }

  function copyKnown(dst, src) {
    if (!src || typeof src !== 'object') { return dst; }
    for (var k in dst) {
      if (!has(dst, k) || !has(src, k)) { continue; }
      var a = dst[k], b = src[k];
      if (typeof a === 'number') { dst[k] = num(b, a); }
      else if (typeof a === 'string') { dst[k] = str(b, a); }
      else if (a && typeof a === 'object' && b && typeof b === 'object') { copyKnown(a, b); }
    }
    return dst;
  }

  function deserialize(d) {
    if (!d || typeof d !== 'object') { return; }
    var k;
    if (d.nodes && typeof d.nodes === 'object') {
      progress.nodes = {};
      for (k in d.nodes) {
        if (!has(d.nodes, k) || !NODE_BY_ID[k]) { continue; }
        var s = d.nodes[k] || {};
        progress.nodes[k] = {
          cleared: s.cleared ? 1 : 0,
          stars: clamp(int(s.stars, 0), 0, 3),
          best: Math.max(0, num(s.best, 0)),
          attempts: Math.max(0, int(s.attempts, 0)),
          fails: Math.max(0, int(s.fails, 0)),
          score: Math.max(0, num(s.score, 0)),
          lastResult: str(s.lastResult, '')
        };
      }
    }
    if (d.seen && typeof d.seen === 'object') {
      progress.seen = {};
      for (k in d.seen) { if (has(d.seen, k)) { progress.seen[k] = 1; } }
    }
    if (d.ach && typeof d.ach === 'object') {
      progress.achievements = {};
      for (k in d.ach) { if (has(d.ach, k) && ACH_BY_ID[k]) { progress.achievements[k] = num(d.ach[k], 1); } }
    }
    copyKnown(progress.totals, d.totals);
    copyKnown(progress.records, d.records);
    copyKnown(progress.daily, d.daily);
    copyKnown(progress.endless, d.endless);
    if (d.records && d.records.leaderboard instanceof Array) {
      progress.records.leaderboard = sanitiseBoard(d.records.leaderboard);
    }
    if (d.records && d.records.fastest && typeof d.records.fastest === 'object') {
      progress.records.fastest = {};
      for (k in d.records.fastest) { if (NODE_BY_ID[k]) { progress.records.fastest[k] = num(d.records.fastest[k], 0); } }
    }
    if (d.records && d.records.bestScoreByNode && typeof d.records.bestScoreByNode === 'object') {
      progress.records.bestScoreByNode = {};
      for (k in d.records.bestScoreByNode) { if (NODE_BY_ID[k]) { progress.records.bestScoreByNode[k] = num(d.records.bestScoreByNode[k], 0); } }
    }
    progress.session    = (d.session && typeof d.session === 'object') ? d.session : null;
    progress.checkpoint = (d.checkpoint && typeof d.checkpoint === 'object') ? d.checkpoint : null;
    progress.difficulty = DIFF_BY_ID[str(d.difficulty, 'standard')] ? d.difficulty : 'standard';
    progress.unlockedEra = clamp(int(d.unlockedEra, 0), 0, ERA_COUNT - 1);
    recountTotals();
    emit('campaign:map', null);
  }

  function sanitiseBoard(arr) {
    var out = [], i, e;
    for (i = 0; i < arr.length && out.length < 40; i++) {
      e = arr[i];
      if (!e || typeof e !== 'object') { continue; }
      out.push({
        mode: str(e.mode, 'campaign'),
        node: str(e.node, ''),
        name: str(e.name, ''),
        difficulty: str(e.difficulty, 'standard'),
        score: Math.max(0, int(e.score, 0)),
        wave: Math.max(0, int(e.wave, 0)),
        time: Math.max(0, num(e.time, 0)),
        stars: clamp(int(e.stars, 0), 0, 3),
        seed: int(e.seed, 0),
        date: int(e.date, 0)
      });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  function recountTotals() {
    var stars = 0, cleared = 0, hard = 0, finales = 0, maxEra = 0, id, n, st;
    for (id in progress.nodes) {
      if (!has(progress.nodes, id)) { continue; }
      n = NODE_BY_ID[id];
      st = progress.nodes[id];
      if (!n || !st) { continue; }
      stars += st.stars;
      if (st.cleared) {
        cleared++;
        if (n.hard) { hard++; }
        if (n.finale) { finales++; if (n.era + 1 > maxEra) { maxEra = n.era + 1; } }
      }
    }
    progress.totals.stars = stars;
    progress.totals.missionsCleared = cleared;
    progress.totals.hardCleared = hard;
    progress.totals.finalesCleared = finales;
    progress.totals.erasReached = Math.max(progress.totals.erasReached, clamp(maxEra, 0, ERA_COUNT - 1) + (finales > 0 ? 0 : 0));
    progress.unlockedEra = Math.max(progress.unlockedEra, clamp(maxEra, 0, ERA_COUNT - 1));
  }

  /* =========================================================================
   * 8. UNLOCK GATING
   *    A node opens when ANY predecessor is cleared. Era entries also open
   *    from a star total, so nobody is ever forced back into old content.
   * ====================================================================== */
  var ERA_STAR_GATE = [0, 3, 8, 14, 21, 29, 38, 48];

  function isCleared(id) { var s = progress.nodes[id]; return !!(s && s.cleared); }
  function starsOf(id) { var s = progress.nodes[id]; return s ? s.stars : 0; }

  function isUnlocked(id) {
    var n = NODE_BY_ID[id];
    if (!n) { return false; }
    if (n.index === 0) { return true; }
    var i;
    for (i = 0; i < n.prev.length; i++) { if (isCleared(n.prev[i])) { return true; } }
    if (n.entry) {
      /* era entries also open on stars, and on reaching the era by any route */
      if (progress.unlockedEra >= n.era) { return true; }
      var gate = ERA_STAR_GATE[n.era];
      if (gate !== undefined && progress.totals.stars >= gate) { return true; }
    }
    return false;
  }

  function eraUnlocked(era) {
    var list = NODES_BY_ERA[era] || [], i;
    for (i = 0; i < list.length; i++) { if (isUnlocked(list[i].id)) { return true; } }
    return false;
  }

  /** The node the player should probably play next. */
  function nextNode() {
    var i, n;
    for (i = 0; i < NODES.length; i++) {
      n = NODES[i];
      if (!isCleared(n.id) && isUnlocked(n.id) && !n.optional) { return n; }
    }
    for (i = 0; i < NODES.length; i++) {
      n = NODES[i];
      if (!isCleared(n.id) && isUnlocked(n.id)) { return n; }
    }
    return null;
  }

  var _mapView = [];
  /** Full map payload for the UI. Rebuilt in place — safe to poll. */
  function mapView() {
    _mapView.length = 0;
    var i, n, st, v;
    for (i = 0; i < NODES.length; i++) {
      n = NODES[i];
      st = nodeState(n.id);
      v = n.__view || (n.__view = {});
      v.id = n.id; v.name = n.name; v.era = n.era; v.eraName = n.eraName;
      v.faction = n.faction; v.type = n.type;
      v.typeName = (MISSION_TYPES[n.type] || { name: n.type }).name;
      v.icon = (MISSION_TYPES[n.type] || { icon: '?' }).icon;
      v.diff = n.diff; v.hard = n.hard; v.optional = n.optional;
      v.finale = !!n.finale; v.entry = !!n.entry; v.epilogue = !!n.epilogue;
      v.x = n.x; v.y = n.y; v.links = n.links; v.lore = n.lore;
      v.mutators = n.mutators;
      v.unlocked = isUnlocked(n.id);
      v.cleared = !!st.cleared;
      v.stars = st.stars;
      v.best = st.best;
      v.attempts = st.attempts;
      v.score = st.score;
      v.reward = n.reward;
      v.current = !!(mission.active && mission.nodeId === n.id);
      _mapView.push(v);
    }
    return _mapView;
  }

  function nodeView(id) {
    var n = NODE_BY_ID[id];
    if (!n) { return null; }
    mapView();
    return n.__view || null;
  }

  /* =========================================================================
   * 9. LIVE MISSION STATE
   * ====================================================================== */
  var mission = {
    active: false, resolved: false,
    id: '', nodeId: '', node: null,
    type: '', typeDef: null, name: '', short: '',
    era: 'Stone', eraIndex: 0, faction: '',
    difficulty: 'standard', mutators: [], dangerSum: 0,
    seed: 0, daily: false, endless: false, endlessTier: 0,
    params: {},
    t: 0, timeLimit: 0, timeLeft: 0,
    wave: 0, waveSource: 'pacer', wavePacer: 26, waveClock: 26, lastSimWaveT: -999, lastWaveT: -999,
    holdT: 0, standT: 0, standTarget: 0, escortPct: 0, round: 0, rounds: 0, roundGap: 0,
    objectives: [], actors: [], zones: [],
    stats: null,
    result: null, failReason: null, failLabel: '',
    stars: 0, score: 0,
    uiT: 0, saveT: 0, lowFortSeen: false, daily: false,
    startedAt: 0, checkpointEra: -1
  };

  function newStats() {
    return {
      kills: 0, losses: 0, bossKills: 0, bossSeen: 0,
      dmgDealt: 0, dmgTaken: 0, fortDmg: 0, enemyFortDmg: 0,
      goldEarned: 0, goldSpent: 0, spawned: 0, powers: 0, waves: 0,
      peakArmy: 0, lowFortTime: 0, retreats: 0,
      byEnemy: {},      /* label -> { dmg, kills, cls, n } */
      byClass: {},      /* cls   -> dmg */
      lostClass: {},    /* cls   -> losses */
      lastHurtBy: '', lastHurtCls: '', killingBlow: '', killingBlowCls: ''
    };
  }

  function resetMissionStats(m) {
    if (!m.stats) { m.stats = newStats(); return; }
    var s = m.stats, k;
    s.kills = 0; s.losses = 0; s.bossKills = 0; s.bossSeen = 0;
    s.dmgDealt = 0; s.dmgTaken = 0; s.fortDmg = 0; s.enemyFortDmg = 0;
    s.goldEarned = 0; s.goldSpent = 0; s.spawned = 0; s.powers = 0; s.waves = 0;
    s.peakArmy = 0; s.lowFortTime = 0; s.retreats = 0;
    for (k in s.byEnemy) { if (has(s.byEnemy, k)) { delete s.byEnemy[k]; } }
    for (k in s.byClass) { if (has(s.byClass, k)) { delete s.byClass[k]; } }
    for (k in s.lostClass) { if (has(s.lostClass, k)) { delete s.lostClass[k]; } }
    s.lastHurtBy = ''; s.lastHurtCls = ''; s.killingBlow = ''; s.killingBlowCls = '';
  }

  /* ---- objectives --------------------------------------------------------- */
  var _objEv = { id: '', kind: '', label: '', value: 0, target: 1, done: false, pct: 0, optional: false, failed: false };

  function addObjective(m, id, kind, label, target, optional) {
    var o = {
      id: id, kind: kind, label: label,
      target: Math.max(0.0001, num(target, 1)),
      value: 0, pct: 0, done: false, failed: false,
      optional: !!optional, _bucket: -1
    };
    m.objectives.push(o);
    return o;
  }

  function objById(m, id) {
    for (var i = 0; i < m.objectives.length; i++) { if (m.objectives[i].id === id) { return m.objectives[i]; } }
    return null;
  }
  function objTarget(m, id) { var o = objById(m, id); return o ? o.target : 1; }

  function setObjective(m, id, value, pctOverride) {
    var o = objById(m, id);
    if (!o) { return; }
    var v = num(value, o.value);
    var pct = (pctOverride !== undefined && pctOverride !== null) ? clamp01(num(pctOverride, 0)) : clamp01(v / o.target);
    var wasDone = o.done;
    o.value = v;
    o.pct = pct;
    o.done = (v >= o.target - 1e-6);
    var bucket = (pct * 20) | 0;
    if (o.done !== wasDone || bucket !== o._bucket) {
      o._bucket = bucket;
      _objEv.id = o.id; _objEv.kind = o.kind; _objEv.label = o.label;
      _objEv.value = o.value; _objEv.target = o.target; _objEv.done = o.done;
      _objEv.pct = o.pct; _objEv.optional = o.optional; _objEv.failed = o.failed;
      emit('mission:objective', _objEv);
    }
  }

  function failObjective(m, id) {
    var o = objById(m, id);
    if (!o || o.failed) { return; }
    o.failed = true; o.done = false;
    _objEv.id = o.id; _objEv.kind = o.kind; _objEv.label = o.label;
    _objEv.value = o.value; _objEv.target = o.target; _objEv.done = false;
    _objEv.pct = o.pct; _objEv.optional = o.optional; _objEv.failed = true;
    emit('mission:objective', _objEv);
  }

  function primaryProgress(m) {
    var n = 0, sum = 0, i, o;
    for (i = 0; i < m.objectives.length; i++) {
      o = m.objectives[i];
      if (o.optional || o.kind === 'protect_fort' || o.kind === 'protect_actor' || o.kind === 'time_left') { continue; }
      sum += o.done ? 1 : o.pct; n++;
    }
    return n > 0 ? clamp01(sum / n) : 0;
  }

  function bonusObjectivesMet(m) {
    var i, o, any = false, all = true;
    for (i = 0; i < m.objectives.length; i++) {
      o = m.objectives[i];
      if (!o.optional) { continue; }
      any = true;
      if (!o.done) { all = false; }
    }
    return any && all;
  }

  /* ---- forts -------------------------------------------------------------- */
  function fortHp(team) { var f = S.forts[team]; return f ? num(f.hp, 0) : 0; }
  function fortPct(team) {
    var f = S.forts[team];
    if (!f || !(f.max > 0)) { return 1; }
    return clamp01(f.hp / f.max);
  }

  function checkFortObjectives(m) {
    if (m.resolved) { return; }
    if (fortHp(-1) <= 0) {
      /* Endless has no win condition — their fort is a resource, not a goal. */
      if (m.endless) { rebuildEnemyFort(m); }
      else { win(m, 'fort-broken'); return; }
    }
    if (fortHp(1) <= 0) { lose(m, 'fort-lost', 'Your fort was destroyed.'); }
  }

  /** Endless: their fort comes back so the run never ends on a technicality. */
  function rebuildEnemyFort(m) {
    var f = S.forts[-1];
    if (!f || f.hp > 0) { return; }
    f.hp = f.max;
    f.tier = (f.tier | 0) + 1;
    toast('Their fort is rebuilt — the tide keeps coming.', 'warn');
    emit('fort:tier', { team: -1, tier: f.tier });
  }

  /* ---- actors (VIPs, convoys, assassination targets, virtual bosses) ------ */
  var actorPool = C.pool(function () {
    return {
      id: 0, role: '', label: '', team: 1, boss: false,
      x: 0, z: 0, hp: 1, maxHp: 1, speed: 0, goalX: null, startX: 0,
      alive: true, arrived: false, guarded: false, guardHp: 0, guardMax: 0,
      phase: 0, phases: 1, engageR: 7, blockR: 5.5, unit: null,
      hitT: 0, t: 0, dead: false
    };
  }, null, 8);

  var _actorEv = { actor: null, kind: '', mission: null };

  function spawnActor(m, role, team, x, hp, speed) {
    var a = actorPool.get();
    a.id = C.nextId();
    a.role = role; a.label = role; a.team = team;
    a.x = num(x, FORT_X[team] || 200); a.z = 0;
    a.maxHp = Math.max(1, num(hp, 100)); a.hp = a.maxHp;
    a.speed = Math.max(0, num(speed, 0));
    a.goalX = null; a.startX = a.x;
    a.alive = true; a.arrived = false; a.dead = false;
    a.guarded = false; a.guardHp = 0; a.guardMax = 0;
    a.phase = 0; a.phases = 1;
    a.engageR = 7; a.blockR = 5.5;
    a.unit = null; a.hitT = 0; a.t = 0;
    a.boss = false;
    m.actors.push(a);
    _actorEv.actor = a; _actorEv.kind = 'spawn'; _actorEv.mission = m.id;
    emit('mission:actor', _actorEv);
    /* Ask the Sim for a real body. If it never arrives we simulate the actor
       ourselves so the mission still resolves — never a soft-lock. */
    emit('mission:spawn', {
      role: role, team: team, x: a.x, z: 0, hp: a.maxHp,
      era: m.eraIndex, cls: (role === 'boss' || role === 'target') ? 'champion' : 'specialist',
      count: 1, actorId: a.id, mission: m.id
    });
    return a;
  }

  function actorByRole(m, role) {
    for (var i = 0; i < m.actors.length; i++) { if (m.actors[i].role === role && !m.actors[i].dead) { return m.actors[i]; } }
    return null;
  }

  function removeActor(m, a) {
    var i = m.actors.indexOf(a);
    if (i >= 0) { m.actors.splice(i, 1); }
    a.dead = true;
    a.unit = null;
    actorPool.put(a);
  }

  function clearActors(m) {
    while (m.actors.length) {
      var a = m.actors.pop();
      a.dead = true; a.unit = null;
      actorPool.put(a);
    }
  }

  function simActive() {
    try { return !!(AOW.Sim && AOW.Sim.ready && !AOW.Sim.failed); } catch (e) { return false; }
  }

  /** Units of `team` within `r` of world-x `x`. Reads state, never writes. */
  function countNear(x, r, team) {
    var arr = S.units, n = arr.length, i, u, c = 0, r2 = r * r, dx;
    for (i = 0; i < n; i++) {
      u = arr[i];
      if (!u || u.dead || u.team !== team) { continue; }
      dx = u.x - x;
      if (dx * dx <= r2) { c++; }
    }
    return c;
  }

  var ACTOR_DPS = 24;   /* per engaged unit, per second, at era 0 */

  function actorTick(m, a, dt) {
    a.t += dt;
    if (a.hitT > 0) { a.hitT -= dt; }

    /* A real Sim unit was assigned to this actor — mirror it, do not fight it. */
    if (a.unit) {
      var u = a.unit;
      if (u.dead || !(u.hp > 0)) {
        a.hp = 0;
        if (a.alive) { killActor(m, a); }
        return;
      }
      a.x = num(u.x, a.x);
      a.z = num(u.z, a.z);
      a.hp = num(u.hp, a.hp);
      a.maxHp = Math.max(a.maxHp, num(u.maxHp, a.maxHp));
      return;
    }

    var scale = eraScale(m.eraIndex);
    var hostile = a.team === 1 ? -1 : 1;
    var atk = countNear(a.x, a.engageR, hostile);
    if (atk > 0) {
      var dpsMul = (hostile === -1) ? mods.enemyDmgMul : mods.playerDmgMul;
      var dmg = atk * ACTOR_DPS * scale * dpsMul * dt;
      if (a.guarded && a.guardHp > 0) {
        a.guardHp -= dmg;
        if (a.guardHp <= 0) {
          a.guardHp = 0; a.guarded = false;
          toast(a.label + "'s guard is broken!", 'good');
          shake(0.35);
        }
      } else {
        a.hp -= dmg;
        if (a.hitT <= 0) { a.hitT = 0.35; }
        if (a.hp <= 0) { a.hp = 0; killActor(m, a); return; }
      }
    }

    /* movement — actors stop when hostiles are close enough to block them */
    if (a.speed > 0 && a.goalX !== null) {
      var blocked = countNear(a.x, a.blockR, hostile) > 0;
      if (!blocked) {
        var dir = (a.goalX > a.x) ? 1 : -1;
        var step = a.speed * dt * (a.team === 1 ? mods.playerSpeedMul : mods.enemySpeedMul);
        a.x += dir * step;
        if ((dir > 0 && a.x >= a.goalX) || (dir < 0 && a.x <= a.goalX)) { a.x = a.goalX; a.arrived = true; }
      }
    }
  }

  function killActor(m, a) {
    if (!a.alive) { return; }
    a.alive = false;
    a.hp = 0;
    _actorEv.actor = a; _actorEv.kind = 'death'; _actorEv.mission = m.id;
    emit('mission:actor', _actorEv);
    if (a.team === -1) {
      m.stats.kills++;
      if (a.boss) { m.stats.bossKills++; progress.totals.bosses++; }
      toast(a.label + ' is down!', 'good');
      shake(0.7);
    } else {
      toast(a.label + ' is lost!', 'bad');
      shake(0.9);
    }
  }

  /** Boss actors move on the fort, change phase, and hit harder each phase. */
  function bossActorTick(m, a, dt) {
    actorTick(m, a, dt);
    if (!a.alive) { return; }
    var frac = a.maxHp > 0 ? (a.hp / a.maxHp) : 0;
    var want = clamp(Math.floor((1 - frac) * a.phases), 0, a.phases - 1);
    if (want > a.phase) {
      a.phase = want;
      emit('boss:phase', { n: a.phase + 1, boss: a });
      toast(a.label + ' — phase ' + (a.phase + 1), 'warn');
      shake(0.8);
    }
    if (a.hp <= 0 && !a.alive) { return; }
    /* Only a *virtual* boss touches the fort — a real Sim unit does its own. */
    if (!a.unit && !simActive()) {
      var reach = FORT_X[1] + 16;
      if (a.x <= reach) {
        var f = S.forts[1];
        if (f && f.hp > 0) {
          var dps = 34 * eraScale(m.eraIndex) * mods.enemyDmgMul * (1 + a.phase * 0.35);
          var d = dps * dt;
          f.hp = Math.max(0, f.hp - d);
          m.stats.fortDmg += d;
          addEnemyDamage(m, a.label, 'champion', d);
          if (a.t % 1 < dt) { emit('fort:hit', { team: 1, dmg: d, hp: f.hp, max: f.max }); }
          if (f.hp <= 0) { emit('fort:destroyed', { team: 1 }); }
        }
      }
    }
  }

  /* ---- capture zones ------------------------------------------------------ */
  var _zoneEv = { zone: null, mission: null };

  function addZone(m, id, x, r, name) {
    var z = {
      id: id, name: name || 'Point', x: num(x, W * 0.5), z: 0, r: Math.max(4, num(r, 18)),
      owner: 0, hold: 0, contest: 0, friendly: 0, hostile: 0, pct: 0, _bucket: -1
    };
    m.zones.push(z);
    return z;
  }

  function zoneTick(m, dt) {
    var i, z, f, h, delta;
    for (i = 0; i < m.zones.length; i++) {
      z = m.zones[i];
      f = countNear(z.x, z.r, 1);
      h = countNear(z.x, z.r, -1);
      z.friendly = f; z.hostile = h;
      delta = 0;
      if (f > h) { delta = clamp(0.16 + (f - h) * 0.05, 0, 0.55); }
      else if (h > f) { delta = -clamp(0.16 + (h - f) * 0.05, 0, 0.55); }
      z.contest = clamp(z.contest + delta * dt, -1, 1);
      var newOwner = z.contest >= 0.999 ? 1 : (z.contest <= -0.999 ? -1 : z.owner);
      if (newOwner !== z.owner) {
        z.owner = newOwner;
        toast(z.name + (newOwner === 1 ? ' captured' : ' lost'), newOwner === 1 ? 'good' : 'bad');
        shake(0.25);
      }
      z.pct = (z.contest + 1) * 0.5;
      var b = (z.pct * 16) | 0;
      if (b !== z._bucket) {
        z._bucket = b;
        _zoneEv.zone = z; _zoneEv.mission = m.id;
        emit('mission:zone', _zoneEv);
      }
    }
  }

  /* =========================================================================
   * 10. WAVE PACER
   *     The Sim owns waves when it is running. When it is not (or when a
   *     mission needs its own cadence) Campaign paces them itself so no
   *     objective can ever stall. Both paths funnel through advanceWave().
   * ====================================================================== */
  var _waveEv = { wave: 0, comp: null, seconds: 0, boss: false, era: 0, difficulty: 'standard' };
  var _spawnEv = { team: -1, wave: 0, comp: null, era: 0, elite: 0, count: 0, mission: '' };
  var _comp = [];
  var _compStore = [];
  /** Comp entries are pooled — a wave build allocates nothing. */
  function compSlot(i, cls, n, elite) {
    var e = _compStore[i];
    if (!e) { e = _compStore[i] = { cls: '', n: 0, elite: 0 }; }
    e.cls = cls; e.n = n; e.elite = elite;
    return e;
  }

  var CLASS_MIX = [
    /* era 0..7 — rough shape of an enemy wave, refined by wave number below */
    [['assault', 0.55], ['defender', 0.2], ['ranged', 0.25]],
    [['assault', 0.4], ['defender', 0.3], ['ranged', 0.3]],
    [['assault', 0.35], ['defender', 0.32], ['ranged', 0.25], ['specialist', 0.08]],
    [['assault', 0.33], ['defender', 0.27], ['ranged', 0.25], ['specialist', 0.15]],
    [['assault', 0.3], ['defender', 0.22], ['ranged', 0.33], ['specialist', 0.15]],
    [['assault', 0.28], ['defender', 0.22], ['ranged', 0.32], ['specialist', 0.18]],
    [['assault', 0.26], ['defender', 0.2], ['ranged', 0.34], ['specialist', 0.2]],
    [['assault', 0.24], ['defender', 0.2], ['ranged', 0.32], ['specialist', 0.24]]
  ];

  function buildComp(m, wave) {
    _comp.length = 0;
    var era = clamp(m.eraIndex, 0, ERA_COUNT - 1);
    var mix = CLASS_MIX[era] || CLASS_MIX[0];
    var base = 4 + Math.floor(wave * 0.75) + Math.floor(era * 0.8);
    var count = Math.round(base * mods.enemyCountMul * (m.endless ? (1 + wave * 0.035) : 1));
    count = clamp(count, 3, 42);
    var elite = clamp01(mods.enemyEliteChance + (m.endless ? Math.min(0.3, wave * 0.008) : 0));
    var i, entry, n, given = 0, slot = 0;
    for (i = 0; i < mix.length; i++) {
      entry = mix[i];
      n = (i === mix.length - 1) ? (count - given) : Math.round(count * entry[1]);
      if (n < 0) { n = 0; }
      given += n;
      if (n > 0) { _comp.push(compSlot(slot++, entry[0], n, elite)); }
    }
    var champs = 0;
    if (wave > 0 && (wave % 4 === 0 || (m.node && m.node.hard))) { champs = 1; }
    champs = Math.round(champs * mods.enemyChampionMul);
    if (champs > 0) { _comp.push(compSlot(slot++, 'champion', champs, elite)); }
    return _comp;
  }

  function isBossWave(m, wave) {
    if (!m.endless) { return false; }
    return wave > 0 && (wave % 10 === 0);
  }

  function advanceWave(m, source) {
    if (!m.active || m.resolved) { return; }
    if (m.t - m.lastWaveT < 1.5) { return; }   /* de-dupe pacer vs Sim */
    m.lastWaveT = m.t;
    m.wave++;
    m.stats.waves++;
    progress.totals.waves++;
    S.wave = m.wave;            /* Economy reads state.wave for unlocks/quests */
    if (m.endless) {
      if (m.wave > progress.records.bestEndlessWave) { progress.records.bestEndlessWave = m.wave; }
      var dk = m.difficulty;
      if (has(progress.records.bestWaveByDiff, dk) && m.wave > progress.records.bestWaveByDiff[dk]) {
        progress.records.bestWaveByDiff[dk] = m.wave;
      }
      endlessWaveHook(m);
    }
    _waveEv.wave = m.wave;
    _waveEv.comp = buildComp(m, m.wave);
    _waveEv.seconds = m.wavePacer;
    _waveEv.boss = isBossWave(m, m.wave);
    _waveEv.era = m.eraIndex;
    _waveEv.difficulty = m.difficulty;
    emit('mission:wave', _waveEv);
    if (source !== 'sim') {
      _spawnEv.team = -1; _spawnEv.wave = m.wave; _spawnEv.comp = _waveEv.comp;
      _spawnEv.era = m.eraIndex; _spawnEv.elite = mods.enemyEliteChance;
      _spawnEv.count = _waveEv.comp.length; _spawnEv.mission = m.id;
      emit('mission:spawn', _spawnEv);
    }
    autosaveSession(m, 'wave');
    markAchievementsDirty();
  }

  function pacerTick(m, dt) {
    /* Called centrally by tickMission AND by the mission types that care about
       cadence — pace at most once per sim step whoever asks. */
    if (m._pacerT === m.t) { return; }
    m._pacerT = m.t;
    if (m.waveSource === 'sim') {
      /* If the Sim stops talking to us, take the wheel back rather than stall. */
      if (m.t - m.lastSimWaveT > 75) { m.waveSource = 'pacer'; m.waveClock = 4; }
      else { return; }
    }
    m.waveClock -= dt;
    if (m.waveClock <= 0) {
      m.waveClock += Math.max(6, m.wavePacer * mods.waveIntervalMul);
      advanceWave(m, 'pacer');
    }
  }

  /* =========================================================================
   * 11. MISSION LIFECYCLE
   * ====================================================================== */
  var _selfReset = false;   /* true while our own beginMission() resets the run */
  var _startEv = { node: null, mission: null, resumed: false };
  var _endEv = { node: null, mission: null, result: '', stars: 0, score: 0, reward: null, reason: '' };
  var _eraEv = { era: '', index: 0, title: '', faction: '', lore: '', climax: '', first: false };

  function recomputeMods(m) {
    resetMods();
    var d = diffDef(m ? m.difficulty : progress.difficulty);
    mods.difficulty = d.index;
    mods.scoreMul = d.scoreMul;
    applyModBundle(d.mods, 1);
    if (m) {
      var i, mu;
      for (i = 0; i < m.mutators.length; i++) {
        mu = MUT_BY_ID[m.mutators[i]];
        if (mu) { applyModBundle(mu.mods, 1); }
      }
      if (m.endless) {
        /* escalation: the run gets meaner every wave, hard every ten. */
        var w = Math.max(0, m.wave - 1);
        var tier = Math.floor(w / 10);
        mods.enemyHpMul   *= 1 + w * 0.055 + tier * 0.10;
        mods.enemyDmgMul  *= 1 + w * 0.042 + tier * 0.08;
        mods.enemyCountMul *= 1 + w * 0.030;
        mods.enemyEliteChance = clamp01(mods.enemyEliteChance + Math.min(0.4, w * 0.010));
        mods.waveIntervalMul *= clamp(1 - w * 0.008, 0.55, 1);
        mods.bossHpMul    *= 1 + tier * 0.22;
        mods.scoreMul     *= 1 + tier * 0.05;
      }
      if (m.node && m.node.diff) {
        var dd = (m.node.diff - 1) * 0.045;
        mods.enemyHpMul  *= 1 + dd;
        mods.enemyDmgMul *= 1 + dd * 0.8;
      }
    }
    publishMods();
  }

  function dangerOf(list) {
    var sum = 0, i, mu;
    for (i = 0; i < list.length; i++) {
      mu = MUT_BY_ID[list[i]];
      if (mu) { sum += mu.danger; }
    }
    return Math.max(0, sum);
  }

  function showEraCard(index, force) {
    var L = eraLore(index);
    var key = 'era_' + L.id;
    var first = !progress.seen[key];
    if (!first && !force) { return; }
    progress.seen[key] = 1;
    _eraEv.era = L.era; _eraEv.index = L.index; _eraEv.title = L.title;
    _eraEv.faction = L.faction; _eraEv.lore = L.lore; _eraEv.climax = L.climax;
    _eraEv.first = first;
    emit('era:intro', _eraEv);
  }

  function setMissionEra(m, index) {
    index = clamp(int(index, 0), 0, ERA_COUNT - 1);
    if (m.eraIndex === index && m.era) { return; }
    m.eraIndex = index;
    m.era = (C.ERAS && C.ERAS[index]) || eraLore(index).era;
    m.faction = eraLore(index).faction;
    try { C.setEra(index); } catch (e) { warn('setEra', 'Core.setEra failed', e); }
    emit('env:mood', eraLore(index).id);
    showEraCard(index, false);
    recomputeMods(m);
    if (m.endless) { setCheckpoint(m, 'era'); }
  }

  function cleanupMission(m) {
    clearActors(m);
    m.zones.length = 0;
    m.objectives.length = 0;
    m.active = false;
  }

  function beginMission(cfg) {
    var m = mission;
    if (m.active) { cleanupMission(m); }

    var node = cfg.node || null;
    var typeId = str(cfg.type, node ? node.type : 'annihilation');
    var def = MISSION_TYPES[typeId];
    if (!def) {
      warn('type:' + typeId, 'unknown mission type "' + typeId + '" — falling back to annihilation.');
      def = MISSION_TYPES.annihilation;
      typeId = 'annihilation';
    }

    m.active = true;
    m.resolved = false;
    m.node = node;
    m.nodeId = node ? node.id : '';
    m.id = (node ? node.id : (cfg.endless ? (cfg.daily ? 'daily' : 'endless') : 'freeplay')) + ':' + Date.now();
    m.type = typeId;
    m.typeDef = def;
    m.name = str(cfg.name, node ? node.name : def.name);
    m.short = def.short;
    m.endless = !!cfg.endless;
    m.daily = !!cfg.daily;
    m.difficulty = DIFF_BY_ID[str(cfg.difficulty, progress.difficulty)] ? cfg.difficulty : progress.difficulty;
    m.params = cfg.params || (node ? node.params : {}) || {};
    m.mutators.length = 0;
    var muts = cfg.mutators || (node ? node.mutators : []) || [];
    for (var i = 0; i < muts.length; i++) { if (MUT_BY_ID[muts[i]]) { m.mutators.push(muts[i]); } }
    m.dangerSum = dangerOf(m.mutators);
    m.seed = int(cfg.seed, 0) || (C.getSeed() ^ (Date.now() & 0xffff));

    m.t = 0;
    m.wave = int(cfg.startWave, 0);
    m.waveSource = 'pacer';
    m.wavePacer = num(m.params.waveSeconds, m.endless ? 22 : 26);
    m.waveClock = m.wavePacer;
    m.lastSimWaveT = -999;
    m.lastWaveT = -999;
    m._pacerT = -1;
    m.holdT = 0; m.standT = 0; m.standTarget = 0; m.escortPct = 0;
    m.round = 0; m.rounds = 0; m.roundGap = 0;
    m.result = null; m.failReason = null; m.failLabel = '';
    m.lowFortSeen = false;
    m.stars = 0; m.score = 0;
    m.uiT = 0; m.saveT = 0;
    m.startedAt = Date.now();
    m.objectives.length = 0;
    m.zones.length = 0;
    clearActors(m);
    resetMissionStats(m);

    /* Fresh deterministic run. newRun() emits game:reset — flag it so our own
       reset handler does not tear down the mission we are in the middle of
       building. */
    _selfReset = true;
    try { C.newRun(m.seed); } catch (e) { warn('newrun', 'Core.newRun failed', e); }
    _selfReset = false;
    try { C.setPhase('battle'); } catch (e) {}

    m.eraIndex = -1;
    setMissionEra(m, int(cfg.era, node ? node.era : 0));
    recomputeMods(m);

    /* time limit, after mutators (Against the Clock shortens it) */
    var tl = num(cfg.timeLimit, node ? num(node.timeLimit, num(m.params.timeLimit, 0)) : num(m.params.timeLimit, 0));
    m.timeLimit = tl > 0 ? tl * mods.timeLimitMul : 0;
    m.timeLeft = m.timeLimit;

    /* fort scaling — only when the Sim is not authoritative, so we never
       double-apply a multiplier the Sim is already reading off Campaign.mods */
    if (!simActive()) {
      var pf = S.forts[1], ef = S.forts[-1];
      if (pf && mods.fortHpMul !== 1) { pf.max = Math.max(1, Math.round(pf.max * mods.fortHpMul)); pf.hp = pf.max; }
      if (ef && mods.enemyFortHpMul !== 1) { ef.max = Math.max(1, Math.round(ef.max * mods.enemyFortHpMul)); ef.hp = ef.max; }
    }

    try { def.setup(m); } catch (e) { warn('setup:' + typeId, 'mission setup threw — objectives may be incomplete.', e); }

    if (node) {
      var st = nodeState(node.id);
      st.attempts++;
      progress.totals.missionsAttempted++;
      setCheckpoint(m, 'node');
    } else if (m.endless) {
      progress.totals.endlessRuns++;
      progress.endless.runs++;
      progress.endless.lastDifficulty = m.difficulty;
      if (m.daily) { progress.totals.dailyRuns++; }
      setCheckpoint(m, 'start');
    }

    _startEv.node = node; _startEv.mission = m; _startEv.resumed = !!cfg.resumed;
    emit('mission:start', _startEv);
    if (node && node.lore) { toast(node.name + ' — ' + node.faction, 'info'); }
    autosaveSession(m, 'start');
    C.requestSave();
    return true;
  }

  /* ---- resolution --------------------------------------------------------- */
  function win(m, reason) {
    if (!m.active || m.resolved) { return; }
    resolveMission(m, 'victory', reason, '');
  }

  function lose(m, reason, label) {
    if (!m.active || m.resolved) { return; }
    resolveMission(m, 'defeat', reason, label || '');
  }

  function computeScore(m) {
    var base;
    if (m.endless) {
      base = Math.pow(Math.max(0, m.wave), 1.32) * 110
        + m.stats.kills * 14 + m.stats.bossKills * 900
        + m.stats.dmgDealt * 0.035 + m.t * 1.2;
    } else {
      var d = m.node ? m.node.diff : 3;
      base = 700 + d * 260
        + m.stats.kills * 10 + m.stats.bossKills * 700
        + (m.timeLimit > 0 ? m.timeLeft * 6 : Math.max(0, 260 - m.t) * 2)
        + fortPct(1) * 900
        + (bonusObjectivesMet(m) ? 450 : 0);
      if (m.result !== 'victory') { base *= 0.35 + primaryProgress(m) * 0.4; }
    }
    var mult = diffDef(m.difficulty).scoreMul * (1 + m.dangerSum) * (m.daily ? 1.15 : 1);
    var pen = m.stats.losses * 4;
    return Math.max(0, Math.round(base * mult - pen));
  }

  function computeStars(m) {
    if (!m.node) { return 0; }
    var s = 1;
    var crit = m.node.star || {};
    if (fortPct(1) >= num(crit.fortPct, 0.6)) { s++; }
    if (m.t <= num(crit.time, 180)) { s++; }
    if (s < 3 && bonusObjectivesMet(m)) { s++; }
    return clamp(s, 1, 3);
  }

  function grantRewards(m, firstClear) {
    var node = m.node;
    var r = node ? node.reward : null;
    var gold = 0, gems = 0, renown = 0;
    if (r) {
      gold = num(r.gold, 0) * (firstClear ? 1 : 0.4);
      gems = firstClear ? num(r.gems, 0) : 0;
      renown = num(r.renown, 0) * (firstClear ? 1 : 0.35);
    } else if (m.endless) {
      gold = 40 + m.wave * 12;
      renown = 6 + m.wave * 1.5;
      gems = Math.floor(m.wave / 10);
    }
    var starBonus = 1 + (m.stars - 1) * 0.15;
    gold = Math.round(gold * starBonus * mods.goldMul);
    renown = Math.round(renown * starBonus);
    gems = Math.round(gems);
    if (gold > 0) { try { C.addGold(gold, 'mission'); } catch (e) {} }
    if (gems > 0) { try { C.addGems(gems, 'mission'); } catch (e) {} }
    if (renown > 0) { emit('reward:grant', { kind: 'renown', id: 'campaign', amount: renown, label: 'Campaign' }); }
    progress.totals.goldEarned += gold;
    _rewardOut.gold = gold; _rewardOut.gems = gems; _rewardOut.renown = renown;
    return _rewardOut;
  }
  var _rewardOut = { gold: 0, gems: 0, renown: 0 };

  function unlockedByClearing(node) {
    var out = [], i, t;
    for (i = 0; i < node.links.length; i++) {
      t = NODE_BY_ID[node.links[i]];
      if (t) { out.push(t); }
    }
    return out;
  }

  function resolveMission(m, result, reason, label) {
    if (m.resolved) { return; }
    m.resolved = true;
    m.result = result;
    m.failReason = (result === 'victory') ? null : (reason || 'unknown');
    m.failLabel = label || '';

    var node = m.node;
    var st = node ? nodeState(node.id) : null;
    var firstClear = false;

    m.score = computeScore(m);
    progress.records.totalScore += m.score;

    if (result === 'victory') {
      m.stars = node ? computeStars(m) : 0;
      if (node) {
        firstClear = !st.cleared;
        st.cleared = 1;
        st.lastResult = 'victory';
        if (m.stars > st.stars) { st.stars = m.stars; }
        if (!st.best || m.t < st.best) {
          st.best = m.t;
          progress.records.fastest[node.id] = m.t;
        }
        if (m.score > st.score) { st.score = m.score; progress.records.bestScoreByNode[node.id] = m.score; }
        if (node.finale) { progress.unlockedEra = Math.max(progress.unlockedEra, clamp(node.era + 1, 0, ERA_COUNT - 1)); }
        recountTotals();
        if (m.stats.losses === 0) { progress.totals.noLossClears++; }
        if (m.mutators.length >= 3) { progress.totals.mutatorClears++; }
        if (m.type === 'siege' && fortPct(1) >= 0.9) { progress.totals.flawlessSieges++; }
        if (m.type === 'gauntlet') { progress.totals.gauntletClears++; }
        if (m.type === 'laststand' && fortPct(1) >= 0.75) { progress.totals.standFull++; }
        if (m.type === 'capture' && m.t <= 120) { progress.totals.captureFast++; }
        if (hasMutator(m, 'sudden')) { progress.totals.suddenClears++; }
        if (hasMutator(m, 'no_ranged')) { progress.totals.noRangedClears++; }
        if (m.lowFortSeen) { progress.totals.comebacks++; }
        if (!progress.totals.speedBest || m.t < progress.totals.speedBest) { progress.totals.speedBest = m.t; }
        if (m.stars >= 3) { progress.totals.threeStarNodes = countThreeStars(); }
        var conv = actorByRole(m, 'convoy');
        if (conv && conv.hp / conv.maxHp >= 0.9) { progress.totals.escortPerfect++; }
        var vip = actorByRole(m, 'vip');
        if (vip && vip.hp >= vip.maxHp - 1) { progress.totals.vipUntouched++; }
      }
    } else {
      if (node) { st.fails++; st.lastResult = 'defeat'; }
      progress.totals.missionsFailed++;
      buildPostMortem(m, reason);
    }

    var reward = grantRewards(m, firstClear);
    submitRecord(m);
    /* Achievements resolve BEFORE the summary so the summary can list them. */
    markAchievementsDirty();
    evaluateAchievements(true);
    var summary = buildSummary(m, reward, firstClear);
    progress.lastSummary = summary;
    progress.session = null;          /* the run is over — nothing to resume */

    _endEv.node = node; _endEv.mission = m; _endEv.result = result;
    _endEv.stars = m.stars; _endEv.score = m.score; _endEv.reward = reward;
    _endEv.reason = m.failReason || '';
    emit(result === 'victory' ? 'mission:complete' : 'mission:fail', _endEv);
    emit('session:summary', summary);

    if (result === 'victory' && node) {
      var opened = unlockedByClearing(node), i;
      for (i = 0; i < opened.length; i++) {
        emit('campaign:unlock', { node: opened[i].id, name: opened[i].name });
      }
      if (node.finale && node.era + 1 < ERA_COUNT) { showEraCard(node.era + 1, true); }
      emit('campaign:map', null);
    }

    C.requestSave();

    try { C.gameOver(result === 'victory' ? 'victory' : 'defeat'); } catch (e) { warn('gameover', 'Core.gameOver failed', e); }
    m.active = false;
  }

  function hasMutator(m, id) {
    for (var i = 0; i < m.mutators.length; i++) { if (m.mutators[i] === id) { return true; } }
    return false;
  }

  function countThreeStars() {
    var n = 0, id;
    for (id in progress.nodes) {
      if (has(progress.nodes, id) && progress.nodes[id].stars >= 3) { n++; }
    }
    return n;
  }

  /* =========================================================================
   * 12. SESSION CONTRACT — autosave, resume, era checkpoints
   * ====================================================================== */
  function autosaveSession(m, reason) {
    if (!m.active || m.resolved) { return; }
    var sess = progress.session || (progress.session = {});
    sess.mode = m.endless ? (m.daily ? 'daily' : 'endless') : 'campaign';
    sess.nodeId = m.nodeId;
    sess.type = m.type;
    sess.difficulty = m.difficulty;
    sess.mutators = m.mutators.slice(0);
    sess.seed = m.seed;
    sess.wave = m.wave;
    sess.era = m.eraIndex;
    sess.t = m.t;
    sess.gold = S.gold;
    sess.fort = fortPct(1);
    sess.kills = m.stats.kills;
    sess.score = computeScore(m);
    sess.stamp = Date.now();
    sess.reason = reason || 'auto';
    C.requestSave();
    emit('session:autosave', sess);
  }

  function setCheckpoint(m, why) {
    var cp = progress.checkpoint || (progress.checkpoint = {});
    cp.mode = m.endless ? (m.daily ? 'daily' : 'endless') : 'campaign';
    cp.nodeId = m.nodeId;
    cp.difficulty = m.difficulty;
    cp.mutators = m.mutators.slice(0);
    cp.seed = m.seed;
    cp.era = m.eraIndex;
    cp.wave = m.endless ? Math.max(0, m.wave - 1) : 0;
    cp.gold = S.gold;
    cp.stamp = Date.now();
    cp.why = why || 'era';
    m.checkpointEra = m.eraIndex;
    emit('checkpoint:set', cp);
  }

  function hasResume() {
    var s = progress.session;
    return !!(s && (s.nodeId || s.mode === 'endless' || s.mode === 'daily'));
  }

  function resume() {
    var s = progress.session;
    if (!s) { return false; }
    if (s.mode === 'campaign') {
      var node = NODE_BY_ID[s.nodeId];
      if (!node) { progress.session = null; return false; }
      return beginMission({
        node: node, type: node.type, difficulty: s.difficulty, mutators: s.mutators,
        seed: s.seed, era: node.era, resumed: true
      });
    }
    return beginMission({
      endless: true, daily: (s.mode === 'daily'), type: 'survival',
      name: (s.mode === 'daily' ? 'Daily Challenge' : 'Endless'),
      difficulty: s.difficulty, mutators: s.mutators, seed: s.seed,
      era: s.era, startWave: s.wave, resumed: true,
      params: { waves: 999999, waveSeconds: 22 }
    });
  }

  function retryCheckpoint() {
    var cp = progress.checkpoint;
    if (!cp) { return retry(); }
    progress.totals.retries++;
    if (cp.mode === 'campaign') {
      var node = NODE_BY_ID[cp.nodeId];
      if (!node) { return false; }
      return beginMission({ node: node, type: node.type, difficulty: cp.difficulty,
        mutators: cp.mutators, seed: cp.seed, era: node.era });
    }
    return beginMission({
      endless: true, daily: (cp.mode === 'daily'), type: 'survival',
      name: (cp.mode === 'daily' ? 'Daily Challenge' : 'Endless'),
      difficulty: cp.difficulty, mutators: cp.mutators, seed: cp.seed,
      era: cp.era, startWave: cp.wave,
      params: { waves: 999999, waveSeconds: 22 }
    });
  }

  function retry() {
    var m = mission;
    progress.totals.retries++;
    if (m.node) {
      return beginMission({ node: m.node, type: m.node.type, difficulty: m.difficulty,
        mutators: m.mutators.slice(0), seed: m.seed ^ 0x9e37, era: m.node.era });
    }
    if (m.endless) {
      return beginMission({ endless: true, daily: m.daily, type: 'survival', name: m.name,
        difficulty: m.difficulty, mutators: m.mutators.slice(0), seed: m.seed,
        era: 0, startWave: 0, params: { waves: 999999, waveSeconds: 22 } });
    }
    return false;
  }

  function abandon() {
    var m = mission;
    if (!m.active || m.resolved) { return false; }
    if (m.endless) { resolveMission(m, 'defeat', 'retired', 'You retired the run.'); }
    else { resolveMission(m, 'defeat', 'abandoned', 'You abandoned the mission.'); }
    return true;
  }

  /* =========================================================================
   * 13. ENDLESS MODE + DAILY CHALLENGE
   * ====================================================================== */
  var _endlessEv = { wave: 0, era: 0, difficulty: 'standard', score: 0, boss: false, best: 0 };
  var _mileEv = { wave: 0, boss: null, tier: 0, name: '' };

  var ENDLESS_ERA_EVERY = 8;   /* waves per era step */

  function endlessWaveHook(m) {
    var era = clamp(Math.floor((m.wave - 1) / ENDLESS_ERA_EVERY), 0, ERA_COUNT - 1);
    if (era !== m.eraIndex) { setMissionEra(m, era); }
    else { recomputeMods(m); }

    _endlessEv.wave = m.wave;
    _endlessEv.era = m.eraIndex;
    _endlessEv.difficulty = m.difficulty;
    _endlessEv.score = computeScore(m);
    _endlessEv.boss = isBossWave(m, m.wave);
    _endlessEv.best = progress.records.bestEndlessWave;
    emit('endless:wave', _endlessEv);

    if (isBossWave(m, m.wave) && !actorByRole(m, 'boss')) {
      var tier = Math.floor(m.wave / 10);
      var hp = 2600 * eraScale(m.eraIndex) * mods.bossHpMul * (1 + (tier - 1) * 0.55);
      var a = spawnActor(m, 'boss', -1, W * 0.70, hp, 1.8);
      a.boss = true;
      a.phases = clamp(2 + Math.floor(tier / 2), 2, 5);
      a.phase = 0;
      a.goalX = FORT_X[1] + 12;
      a.label = bossNameFor(m.eraIndex, tier);
      emit('boss:spawn', { boss: a });
      _mileEv.wave = m.wave; _mileEv.boss = a; _mileEv.tier = tier; _mileEv.name = a.label;
      emit('endless:milestone', _mileEv);
      toast('WAVE ' + m.wave + ' — ' + a.label, 'warn');
      shake(1.0);
    }
    setCheckpoint(m, 'wave');
  }

  var BOSS_NAMES = [
    ['Grukk the Ashfang', 'Mother of Tusks', 'The Bone King'],
    ['Sunspear Tyrant', 'The Bronze Bull', 'Helios Guard'],
    ['Legate Vurr', 'The Iron Wall', 'Primus Maximus'],
    ['Ser Havoc', 'The Black Abbot', 'Warhorse Rex'],
    ['Colonel Kell', 'The Powder Baron', 'Grapeshot'],
    ['Foreman Cog', 'The Boilerplate', 'Overseer Nine'],
    ['Marshal Voss', 'Grey Nine', 'The Spotter'],
    ['THE ASCENDANT', 'Halo Prime', 'Null Sovereign']
  ];
  function bossNameFor(era, tier) {
    var list = BOSS_NAMES[clamp(era, 0, BOSS_NAMES.length - 1)];
    return list[clamp((tier - 1) % list.length, 0, list.length - 1)];
  }

  function startEndless(difficulty, seed) {
    var d = DIFF_BY_ID[difficulty] ? difficulty : progress.endless.lastDifficulty || 'standard';
    return beginMission({
      endless: true, type: 'survival', name: 'Endless — ' + diffDef(d).name,
      difficulty: d, mutators: [], seed: int(seed, 0) || ((Date.now() ^ 0x5f3759df) >>> 0),
      era: 0, startWave: 0,
      params: { waves: 999999, waveSeconds: 22 }
    });
  }

  function todayKey(offsetDays) {
    var d = new Date();
    if (offsetDays) { d = new Date(d.getTime() + offsetDays * 86400000); }
    var mo = d.getUTCMonth() + 1, da = d.getUTCDate();
    return d.getUTCFullYear() + '-' + (mo < 10 ? '0' : '') + mo + '-' + (da < 10 ? '0' : '') + da;
  }

  var _dailySpec = { date: '', seed: 0, difficulty: 'standard', mutators: [], era: 0 };
  function dailySpec() {
    var key = todayKey(0);
    if (_dailySpec.date === key) { return _dailySpec; }
    var rnd = C.makeRng('aow2-daily-' + key);
    _dailySpec.date = key;
    _dailySpec.seed = (Math.floor(rnd() * 0xffffffff) >>> 0) || 1;
    var pool = ['standard', 'veteran', 'veteran', 'nightmare'];
    _dailySpec.difficulty = pool[(rnd() * pool.length) | 0];
    _dailySpec.mutators.length = 0;
    var bag = ROLLABLE.slice(0), i, j, tmp;
    for (i = bag.length - 1; i > 0; i--) {
      j = (rnd() * (i + 1)) | 0;
      tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
    }
    var count = 2 + ((rnd() * 2) | 0);
    for (i = 0; i < count && i < bag.length; i++) { _dailySpec.mutators.push(bag[i]); }
    _dailySpec.era = (rnd() * ERA_COUNT) | 0;
    return _dailySpec;
  }

  function startDaily() {
    var spec = dailySpec();
    if (progress.daily.date !== spec.date) {
      progress.daily.date = spec.date;
      progress.daily.score = 0;
      progress.daily.wave = 0;
      progress.daily.done = false;
      progress.daily.seed = spec.seed;
      progress.daily.mutators = spec.mutators.slice(0);
    }
    return beginMission({
      endless: true, daily: true, type: 'survival',
      name: 'Daily — ' + spec.date,
      difficulty: spec.difficulty, mutators: spec.mutators, seed: spec.seed,
      era: 0, startWave: 0,
      params: { waves: 999999, waveSeconds: 22 }
    });
  }

  function finishDaily(m) {
    var spec = dailySpec();
    if (!m.daily) { return; }
    var d = progress.daily;
    if (d.date !== spec.date) { d.date = spec.date; d.score = 0; d.wave = 0; d.done = false; }
    if (m.score > d.score) { d.score = m.score; }
    if (m.wave > d.wave) { d.wave = m.wave; }
    if (!d.done) {
      d.done = true;
      if (d.lastDate === todayKey(-1)) { d.streak++; } else { d.streak = 1; }
      d.lastDate = spec.date;
      if (d.streak > progress.totals.dailyStreakBest) { progress.totals.dailyStreakBest = d.streak; }
    }
    if (m.score > d.best) { d.best = m.score; }
    emit('daily:result', d);
  }

  /* =========================================================================
   * 14. RECORDS / LEADERBOARD  (local first, shaped for a portal upload)
   * ====================================================================== */
  function submitRecord(m) {
    var R = progress.records;
    if (m.endless) {
      if (m.wave > R.bestEndlessWave) { R.bestEndlessWave = m.wave; }
      if (m.score > R.bestEndlessScore) { R.bestEndlessScore = m.score; }
      if (m.wave > progress.endless.bestWave) { progress.endless.bestWave = m.wave; }
      if (m.score > progress.endless.bestScore) { progress.endless.bestScore = m.score; }
      var dk = m.difficulty;
      if (has(R.bestWaveByDiff, dk) && m.wave > R.bestWaveByDiff[dk]) { R.bestWaveByDiff[dk] = m.wave; }
      if (has(R.bestScoreByDiff, dk) && m.score > R.bestScoreByDiff[dk]) { R.bestScoreByDiff[dk] = m.score; }
      if (m.type === 'laststand' || m.endless) {
        if (m.t > R.longestStand) { R.longestStand = m.t; }
      }
      if (m.daily) { finishDaily(m); }
    }
    var entry = {
      mode: m.endless ? (m.daily ? 'daily' : 'endless') : 'campaign',
      node: m.nodeId, name: m.name, difficulty: m.difficulty,
      score: m.score, wave: m.wave, time: Math.round(m.t * 10) / 10,
      stars: m.stars, seed: m.seed, date: Date.now(),
      result: m.result, mutators: m.mutators.join(',')
    };
    R.leaderboard.push(entry);
    R.leaderboard.sort(function (a, b) { return b.score - a.score; });
    if (R.leaderboard.length > 25) { R.leaderboard.length = 25; }
    emit('record:submit', entry);
    return entry;
  }

  function leaderboard(mode) {
    var R = progress.records;
    if (!mode) { return R.leaderboard; }
    _lbOut.length = 0;
    for (var i = 0; i < R.leaderboard.length; i++) {
      if (R.leaderboard[i].mode === mode) { _lbOut.push(R.leaderboard[i]); }
    }
    return _lbOut;
  }
  var _lbOut = [];

  /* =========================================================================
   * 15. DEFEAT POST-MORTEM
   * ====================================================================== */
  function labelOf(u) {
    if (!u) { return 'Unknown'; }
    return str(u.name, null) || str(u.type, null) || str(u.cls, null) || 'Unknown';
  }

  function addEnemyDamage(m, label, cls, dmg) {
    if (!m || !m.stats || !(dmg > 0)) { return; }
    var b = m.stats.byEnemy[label];
    if (!b) { b = m.stats.byEnemy[label] = { label: label, cls: cls || '', dmg: 0, kills: 0, pct: 0 }; }
    b.dmg += dmg;
    if (cls) {
      b.cls = cls;
      m.stats.byClass[cls] = (m.stats.byClass[cls] || 0) + dmg;
    }
  }

  var _pmList = [];
  var _pm = {
    reason: '', label: '', killer: '', killerCls: '',
    time: 0, timeText: '', wave: 0, era: '', faction: '', node: '', name: '',
    fortPct: 0, kills: 0, losses: 0, dmgDealt: 0, dmgTaken: 0,
    breakdown: _pmList, tip: '', tipTitle: '', progress: 0,
    canRetryCheckpoint: false, checkpointWave: 0, checkpointEra: '',
    score: 0, objectives: null
  };

  var FAIL_TEXT = {
    'fort-lost': 'Your fort was destroyed.',
    'vip-lost': 'Your VIP was killed.',
    'convoy-lost': 'The convoy never made it.',
    'timeout': 'The clock beat you.',
    'abandoned': 'You walked away.',
    'retired': 'You retired the run.',
    'unknown': 'It ended badly.'
  };

  function buildPostMortem(m, reason) {
    var s = m.stats, k, b, total = 0;
    _pmList.length = 0;
    for (k in s.byEnemy) {
      if (!has(s.byEnemy, k)) { continue; }
      b = s.byEnemy[k];
      total += b.dmg;
      _pmList.push(b);
    }
    for (var i = 0; i < _pmList.length; i++) {
      _pmList[i].pct = total > 0 ? (_pmList[i].dmg / total) : 0;
    }
    _pmList.sort(function (a, b2) { return b2.dmg - a.dmg; });
    if (_pmList.length > 8) { _pmList.length = 8; }

    _pm.reason = reason || 'unknown';
    _pm.label = m.failLabel || FAIL_TEXT[_pm.reason] || FAIL_TEXT.unknown;
    _pm.killer = s.killingBlow || (_pmList.length ? _pmList[0].label : 'Attrition');
    _pm.killerCls = s.killingBlowCls || (_pmList.length ? _pmList[0].cls : '');
    _pm.time = m.t;
    _pm.timeText = fmtTime(m.t);
    _pm.wave = m.wave;
    _pm.era = m.era;
    _pm.faction = m.faction;
    _pm.node = m.nodeId;
    _pm.name = m.name;
    _pm.fortPct = fortPct(1);
    _pm.kills = s.kills;
    _pm.losses = s.losses;
    _pm.dmgDealt = Math.round(s.dmgDealt);
    _pm.dmgTaken = Math.round(s.dmgTaken);
    _pm.progress = primaryProgress(m);
    _pm.score = m.score;
    _pm.objectives = m.objectives;
    var cp = progress.checkpoint;
    _pm.canRetryCheckpoint = !!cp;
    _pm.checkpointWave = cp ? int(cp.wave, 0) : 0;
    _pm.checkpointEra = cp ? eraLore(int(cp.era, 0)).era : '';
    var tip = coachingTip(m, _pmList, total);
    _pm.tip = tip.text;
    _pm.tipTitle = tip.title;

    progress.lastPostMortem = _pm;
    emit('postmortem', _pm);
    return _pm;
  }

  /* One tip, generated from the run — the first rule that fires, hardest first. */
  var COACH_RULES = [
    { title: 'Ranged did this',
      test: function (m, list, total) { return classShare(m, 'ranged', total) > 0.42; },
      text: function (m, list) {
        return 'Their ranged line did ' + pct(classShare(m, 'ranged', -1)) + ' of the damage to you. ' +
               'Open with shields and close the gap in one push — walking into arrows costs more than sprinting through them.';
      } },
    { title: 'Champions ran you over',
      test: function (m, list, total) { return classShare(m, 'champion', total) + classShare(m, 'boss', total) > 0.35; },
      text: function () {
        return 'A single champion accounted for most of your losses. Do not feed it one unit at a time — ' +
               'stack your damage and burst it during its recovery, or keep a blocker in front and hit the flank.';
      } },
    { title: 'Armour beat you',
      test: function (m) { return m.stats.dmgDealt > 0 && m.stats.kills < m.stats.losses * 0.9 && m.eraIndex >= 2; },
      text: function () {
        return 'You dealt plenty of damage and killed almost nothing — that is armour eating slashes. ' +
               'Bring piercing or blunt units into this era, or your damage number is just a decoration.';
      } },
    { title: 'You were outnumbered',
      test: function (m) { return m.stats.losses > 0 && m.stats.spawned > 0 && (m.stats.losses / Math.max(1, m.stats.spawned)) > 0.7 && m.stats.goldEarned > 0; },
      text: function () {
        return 'You lost nearly everything you fielded. Spend in blocks, not dribbles: two units arriving together ' +
               'trade far better than four arriving one at a time.';
      } },
    { title: 'Banked too much',
      test: function () { return S.gold > 700; },
      text: function () {
        return 'You died holding ' + Math.round(S.gold) + ' gold. Gold in the bank kills nothing — ' +
               'keep one unit in the queue at all times and spend the surplus on the front.';
      } },
    { title: 'The clock, not the enemy',
      test: function (m) { return m.failReason === 'timeout'; },
      text: function (m) {
        return 'You were ' + pct(primaryProgress(m)) + ' of the way there when time ran out. ' +
               'Commit earlier — the first sixty seconds of a timed push are the cheapest ones you get.';
      } },
    { title: 'The VIP was exposed',
      test: function (m) { return m.failReason === 'vip-lost' || m.failReason === 'convoy-lost'; },
      text: function () {
        return 'Your escort died with your army behind it. Hold the line AHEAD of what you are protecting — ' +
               'anything that reaches it has already won the fight.';
      } },
    { title: 'Ground, then held',
      test: function (m) { return m.type === 'capture' && m.holdT > 0; },
      text: function () {
        return 'You took the point and could not keep it. Capture is a body count, not a hero check — ' +
               'cheap units inside the ring beat expensive ones outside it.';
      } },
    { title: 'Too slow off the line',
      test: function (m) { return m.stats.spawned < 6 && m.t > 40; },
      text: function () {
        return 'You barely fielded anything in the opening minute. Get bodies out early — ' +
               'the first wave is the cheapest one you will ever fight.';
      } },
    { title: 'Almost',
      test: function (m) { return primaryProgress(m) > 0.75; },
      text: function (m) {
        return 'You were at ' + pct(primaryProgress(m)) + '. This is a tuning problem, not a strategy problem — ' +
               'one more upgrade tier or one fewer expensive unit closes it.';
      } },
    { title: 'Read the fight',
      test: function () { return true; },
      text: function (m) {
        return 'Watch which of their units your line cannot answer, then buy the counter before the next push. ' +
               'The damage breakdown above is the shopping list.';
      } }
  ];

  function pct(v) { return Math.round(clamp01(num(v, 0)) * 100) + '%'; }

  function classShare(m, cls, total) {
    if (!m || !m.stats) { return 0; }
    if (total === undefined || total === null || total < 0) {
      total = 0;
      for (var k in m.stats.byClass) { if (has(m.stats.byClass, k)) { total += m.stats.byClass[k]; } }
    }
    if (!(total > 0)) { return 0; }
    return (m.stats.byClass[cls] || 0) / total;
  }

  var _tipOut = { title: '', text: '' };
  function coachingTip(m, list, total) {
    for (var i = 0; i < COACH_RULES.length; i++) {
      var r = COACH_RULES[i];
      var ok = false;
      try { ok = !!r.test(m, list, total); } catch (e) { ok = false; }
      if (!ok) { continue; }
      try { _tipOut.text = r.text(m, list, total); } catch (e2) { continue; }
      _tipOut.title = r.title;
      return _tipOut;
    }
    _tipOut.title = 'Try again';
    _tipOut.text = 'Change one thing and run it back.';
    return _tipOut;
  }

  /* =========================================================================
   * 16. SESSION SUMMARY
   * ====================================================================== */
  var _summary = {
    mode: '', name: '', node: '', result: '', reason: '',
    time: 0, timeText: '', wave: 0, era: '', faction: '',
    kills: 0, losses: 0, bossKills: 0, dmgDealt: 0, dmgTaken: 0,
    goldEarned: 0, score: 0, stars: 0, firstClear: false,
    reward: null, objectives: null, bonus: false,
    newRecord: false, newAchievements: [], nextNode: '', nextNodeName: '',
    totalStars: 0, totalCleared: 0, best: 0
  };

  function buildSummary(m, reward, firstClear) {
    var s = m.stats;
    _summary.mode = m.endless ? (m.daily ? 'daily' : 'endless') : 'campaign';
    _summary.name = m.name;
    _summary.node = m.nodeId;
    _summary.result = m.result;
    _summary.reason = m.failReason || '';
    _summary.time = m.t;
    _summary.timeText = fmtTime(m.t);
    _summary.wave = m.wave;
    _summary.era = m.era;
    _summary.faction = m.faction;
    _summary.kills = s.kills;
    _summary.losses = s.losses;
    _summary.bossKills = s.bossKills;
    _summary.dmgDealt = Math.round(s.dmgDealt);
    _summary.dmgTaken = Math.round(s.dmgTaken);
    _summary.goldEarned = Math.round(s.goldEarned);
    _summary.score = m.score;
    _summary.stars = m.stars;
    _summary.firstClear = !!firstClear;
    _summary.reward = reward;
    _summary.objectives = m.objectives;
    _summary.bonus = bonusObjectivesMet(m);
    _summary.totalStars = progress.totals.stars;
    _summary.totalCleared = progress.totals.missionsCleared;
    _summary.best = m.endless ? progress.records.bestEndlessWave : (m.nodeId ? num(progress.records.fastest[m.nodeId], 0) : 0);
    _summary.newRecord = m.endless
      ? (m.score >= progress.records.bestEndlessScore && m.score > 0)
      : (m.nodeId ? (m.score >= num(progress.records.bestScoreByNode[m.nodeId], 0) && m.score > 0) : false);
    _summary.newAchievements = _achJustUnlocked;
    var nn = nextNode();
    _summary.nextNode = nn ? nn.id : '';
    _summary.nextNodeName = nn ? nn.name : '';
    return _summary;
  }

  /* =========================================================================
   * 17. ACHIEVEMENTS — 44 of them. Nothing here asks you to re-grind.
   * ====================================================================== */
  function T() { return progress.totals; }
  function R() { return progress.records; }
  function cleared(id) { return isCleared(id); }

  var ACHIEVEMENTS = [
    { id: 'a_first',      name: 'First Blood',        desc: 'Clear your first mission.',                 gems: 1,  tier: 'bronze',
      test: function () { return T().missionsCleared >= 1; } },
    { id: 'a_stone',      name: 'Ash and Bone',       desc: 'Pull down Skullspire.',                      gems: 2,  tier: 'bronze',
      test: function () { return cleared('n_s3'); } },
    { id: 'a_bronze',     name: 'Sun Breaker',        desc: 'Open the Gate of Ten Suns.',                 gems: 2,  tier: 'bronze',
      test: function () { return cleared('n_b3'); } },
    { id: 'a_iron',       name: 'Wall Breaker',       desc: 'Break Ironwall.',                            gems: 3,  tier: 'silver',
      test: function () { return cleared('n_i3'); } },
    { id: 'a_medieval',   name: 'Banner Down',        desc: 'Take Blackbanner Keep.',                     gems: 3,  tier: 'silver',
      test: function () { return cleared('n_m3'); } },
    { id: 'a_gunpowder',  name: 'Inside the Reload',  desc: 'Take Fort Kell.',                            gems: 4,  tier: 'silver',
      test: function () { return cleared('n_g3'); } },
    { id: 'a_industrial', name: 'Line Stopped',       desc: 'Shut down the Combine Works.',               gems: 4,  tier: 'gold',
      test: function () { return cleared('n_d3'); } },
    { id: 'a_modern',     name: 'Signal Lost',        desc: 'Silence Grey Bastion.',                      gems: 5,  tier: 'gold',
      test: function () { return cleared('n_x3'); } },
    { id: 'a_future',     name: 'Argument Ended',     desc: 'Kill The Ascendant.',                        gems: 8,  tier: 'gold',
      test: function () { return cleared('n_f3'); } },
    { id: 'a_epilogue',   name: 'Last Dawn',          desc: 'Hold until sunrise.',                        gems: 12, tier: 'platinum',
      test: function () { return cleared('n_f4'); } },

    { id: 'a_stars10',    name: 'Constellation',      desc: 'Earn 10 stars.',                             gems: 2,  tier: 'bronze',
      test: function () { return T().stars >= 10; } },
    { id: 'a_stars25',    name: 'Star Chart',         desc: 'Earn 25 stars.',                             gems: 3,  tier: 'silver',
      test: function () { return T().stars >= 25; } },
    { id: 'a_stars50',    name: 'Night Sky',          desc: 'Earn 50 stars.',                             gems: 5,  tier: 'gold',
      test: function () { return T().stars >= 50; } },
    { id: 'a_starsall',   name: 'Perfect Map',        desc: 'Three-star every node.',                     gems: 20, tier: 'platinum',
      test: function () { return countThreeStars() >= NODES.length; } },

    { id: 'a_hard1',      name: 'The Hard Way',       desc: 'Clear an optional hard node.',               gems: 3,  tier: 'silver',
      test: function () { return T().hardCleared >= 1; } },
    { id: 'a_hard5',      name: 'Masochist',          desc: 'Clear 5 hard nodes.',                        gems: 6,  tier: 'gold',
      test: function () { return T().hardCleared >= 5; } },
    { id: 'a_hardall',    name: 'No Easy Route',      desc: 'Clear every hard node.',                     gems: 12, tier: 'platinum',
      test: function () { return T().hardCleared >= countHardNodes(); } },

    { id: 'a_kills100',   name: 'Blooded',            desc: 'Kill 100 enemies.',                          gems: 1,  tier: 'bronze',
      test: function () { return T().kills >= 100; } },
    { id: 'a_kills1k',    name: 'Butcher\'s Bill',    desc: 'Kill 1,000 enemies.',                        gems: 3,  tier: 'silver',
      test: function () { return T().kills >= 1000; } },
    { id: 'a_kills10k',   name: 'Field of Ten Thousand', desc: 'Kill 10,000 enemies.',                    gems: 10, tier: 'gold',
      test: function () { return T().kills >= 10000; } },

    { id: 'a_boss5',      name: 'Giant Killer',       desc: 'Kill 5 champions or bosses.',                gems: 2,  tier: 'bronze',
      test: function () { return T().bosses >= 5; } },
    { id: 'a_boss25',     name: 'Warlord\'s End',     desc: 'Kill 25 champions or bosses.',               gems: 6,  tier: 'gold',
      test: function () { return T().bosses >= 25; } },

    { id: 'a_waves100',   name: 'Tide Watcher',       desc: 'Survive 100 waves in total.',                gems: 2,  tier: 'bronze',
      test: function () { return T().waves >= 100; } },
    { id: 'a_waves500',   name: 'Seawall',            desc: 'Survive 500 waves in total.',                gems: 6,  tier: 'gold',
      test: function () { return T().waves >= 500; } },

    { id: 'a_end10',      name: 'Ten Deep',           desc: 'Reach wave 10 in Endless.',                  gems: 1,  tier: 'bronze',
      test: function () { return R().bestEndlessWave >= 10; } },
    { id: 'a_end25',      name: 'Twenty-Five Deep',   desc: 'Reach wave 25 in Endless.',                  gems: 3,  tier: 'silver',
      test: function () { return R().bestEndlessWave >= 25; } },
    { id: 'a_end50',      name: 'Fifty Deep',         desc: 'Reach wave 50 in Endless.',                  gems: 8,  tier: 'gold',
      test: function () { return R().bestEndlessWave >= 50; } },
    { id: 'a_end100',     name: 'The Long Dark',      desc: 'Reach wave 100 in Endless.',                 gems: 20, tier: 'platinum',
      test: function () { return R().bestEndlessWave >= 100; } },
    { id: 'a_nightmare20', name: 'Bad Dream',         desc: 'Reach wave 20 on Nightmare.',                gems: 10, tier: 'gold',
      test: function () { return R().bestWaveByDiff.nightmare >= 20; } },
    { id: 'a_vet30',      name: 'Veteran',            desc: 'Reach wave 30 on Veteran.',                  gems: 6,  tier: 'silver',
      test: function () { return R().bestWaveByDiff.veteran >= 30; } },

    { id: 'a_score50k',   name: 'Scorekeeper',        desc: 'Score 50,000 in a single run.',              gems: 3,  tier: 'silver',
      test: function () { return R().bestEndlessScore >= 50000; } },
    { id: 'a_score250k',  name: 'Record Holder',      desc: 'Score 250,000 in a single run.',             gems: 10, tier: 'gold',
      test: function () { return R().bestEndlessScore >= 250000; } },

    { id: 'a_daily1',     name: 'Today\'s Problem',   desc: 'Finish a daily challenge.',                  gems: 2,  tier: 'bronze',
      test: function () { return T().dailyRuns >= 1 && progress.daily.done; } },
    { id: 'a_daily7',     name: 'Seven Days',         desc: 'Keep a 7-day daily streak.',                 gems: 8,  tier: 'gold',
      test: function () { return T().dailyStreakBest >= 7; } },

    { id: 'a_noloss',     name: 'Not One Man',        desc: 'Clear a mission without losing a unit.',     gems: 4,  tier: 'silver',
      test: function () { return T().noLossClears >= 1; } },
    { id: 'a_noloss5',    name: 'Immaculate',         desc: 'Do it five times.',                          gems: 8,  tier: 'gold',
      test: function () { return T().noLossClears >= 5; } },
    { id: 'a_flawsiege',  name: 'Untouched Walls',    desc: 'Win a siege above 90% fort HP.',             gems: 5,  tier: 'gold',
      test: function () { return T().flawlessSieges >= 1; } },
    { id: 'a_speed',      name: 'Ninety Seconds',     desc: 'Clear any node in under 90 seconds.',        gems: 4,  tier: 'silver',
      test: function () { return T().speedBest > 0 && T().speedBest <= 90; } },
    { id: 'a_comeback',   name: 'From the Brink',     desc: 'Win after dropping below 15% fort HP.',      gems: 5,  tier: 'gold',
      test: function () { return T().comebacks >= 1; } },
    { id: 'a_mut3',       name: 'Handicapped',        desc: 'Clear a mission with 3+ mutators.',          gems: 5,  tier: 'gold',
      test: function () { return T().mutatorClears >= 1; } },
    { id: 'a_sudden',     name: 'One Life',           desc: 'Clear a Sudden Death mission.',              gems: 6,  tier: 'gold',
      test: function () { return T().suddenClears >= 1; } },
    { id: 'a_noranged',   name: 'Knife Fight',        desc: 'Clear a Close Quarters mission.',            gems: 5,  tier: 'silver',
      test: function () { return T().noRangedClears >= 1; } },
    { id: 'a_escort',     name: 'Not a Scratch',      desc: 'Finish an escort above 90% convoy HP.',      gems: 5,  tier: 'gold',
      test: function () { return T().escortPerfect >= 1; } },
    { id: 'a_vip',        name: 'Bodyguard',          desc: 'Finish a protect mission with an untouched VIP.', gems: 6, tier: 'gold',
      test: function () { return T().vipUntouched >= 1; } },
    { id: 'a_gauntlet',   name: 'Three in a Row',     desc: 'Clear the Hardlight Gauntlet.',              gems: 8,  tier: 'gold',
      test: function () { return T().gauntletClears >= 1; } },
    { id: 'a_stand',      name: 'Immovable',          desc: 'Win a last stand above 75% fort HP.',        gems: 6,  tier: 'gold',
      test: function () { return T().standFull >= 1; } },
    { id: 'a_campaign',   name: 'Warpath',            desc: 'Clear every required node on the map.',      gems: 15, tier: 'platinum',
      test: function () { return requiredCleared() >= countRequiredNodes(); } },
    { id: 'a_marathon',   name: 'Ten Hours',          desc: 'Play for ten hours.',                        gems: 6,  tier: 'gold',
      test: function () { return num(S.stats.playtime, 0) >= 36000; } }
  ];

  var ACH_BY_ID = {};
  (function () { for (var i = 0; i < ACHIEVEMENTS.length; i++) { ACH_BY_ID[ACHIEVEMENTS[i].id] = ACHIEVEMENTS[i]; } })();

  function countHardNodes() {
    var n = 0;
    for (var i = 0; i < NODES.length; i++) { if (NODES[i].hard) { n++; } }
    return n;
  }
  function countRequiredNodes() {
    var n = 0;
    for (var i = 0; i < NODES.length; i++) { if (!NODES[i].optional) { n++; } }
    return n;
  }
  function requiredCleared() {
    var n = 0;
    for (var i = 0; i < NODES.length; i++) { if (!NODES[i].optional && isCleared(NODES[i].id)) { n++; } }
    return n;
  }

  var _achDirty = true;
  var _achJustUnlocked = [];
  var _achCheckT = 1;
  var _achEv = { id: '', name: '', desc: '', gems: 0, tier: '', total: 0, count: 0 };

  function markAchievementsDirty() { _achDirty = true; }

  function evaluateAchievements(force) {
    if (!force && !_achDirty) { return 0; }
    _achDirty = false;
    _achJustUnlocked.length = 0;
    var n = 0, i, a, ok;
    for (i = 0; i < ACHIEVEMENTS.length; i++) {
      a = ACHIEVEMENTS[i];
      if (progress.achievements[a.id]) { continue; }
      ok = false;
      try { ok = !!a.test(); } catch (e) { ok = false; }
      if (!ok) { continue; }
      progress.achievements[a.id] = Date.now();
      _achJustUnlocked.push(a);
      n++;
      _achEv.id = a.id; _achEv.name = a.name; _achEv.desc = a.desc;
      _achEv.gems = a.gems; _achEv.tier = a.tier;
      _achEv.count = achievementCount();
      _achEv.total = ACHIEVEMENTS.length;
      emit('achievement:unlock', _achEv);
      toast('Achievement — ' + a.name, 'good');
      if (a.gems > 0) { try { C.addGems(a.gems, 'achievement'); } catch (e2) {} }
    }
    if (n > 0) { C.requestSave(); }
    return n;
  }

  function achievementCount() {
    var n = 0, k;
    for (k in progress.achievements) { if (has(progress.achievements, k)) { n++; } }
    return n;
  }

  var _achView = [];
  function achievementView() {
    _achView.length = 0;
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      var a = ACHIEVEMENTS[i];
      var v = a.__v || (a.__v = {});
      v.id = a.id; v.name = a.name; v.desc = a.desc; v.gems = a.gems; v.tier = a.tier;
      v.unlocked = !!progress.achievements[a.id];
      v.at = v.unlocked ? progress.achievements[a.id] : 0;
      _achView.push(v);
    }
    return _achView;
  }

  /* =========================================================================
   * 18. PER-STEP TICK
   * ====================================================================== */
  var _hud = {
    active: false, name: '', node: '', type: '', typeName: '', short: '', icon: '',
    era: '', eraIndex: 0, faction: '', difficulty: 'standard', difficultyName: 'Standard',
    mutators: null, wave: 0, time: 0, timeText: '0:00',
    timeLimit: 0, timeLeft: 0, timeLeftText: '', hasTimer: false,
    objectives: null, zones: null, actors: null,
    progress: 0, score: 0, stars: 0, endless: false, daily: false,
    fortPct: 1, kills: 0, losses: 0, blurb: '', tip: ''
  };

  function hud() {
    var m = mission;
    _hud.active = m.active && !m.resolved;
    _hud.name = m.name; _hud.node = m.nodeId;
    _hud.type = m.type;
    _hud.typeName = m.typeDef ? m.typeDef.name : '';
    _hud.short = m.short; _hud.icon = m.typeDef ? m.typeDef.icon : '';
    _hud.blurb = m.typeDef ? m.typeDef.blurb : '';
    _hud.tip = m.typeDef ? m.typeDef.tip : '';
    _hud.era = m.era; _hud.eraIndex = m.eraIndex; _hud.faction = m.faction;
    _hud.difficulty = m.difficulty;
    _hud.difficultyName = diffDef(m.difficulty).name;
    _hud.mutators = m.mutators;
    _hud.wave = m.wave;
    _hud.time = m.t; _hud.timeText = fmtTime(m.t);
    _hud.timeLimit = m.timeLimit; _hud.timeLeft = m.timeLeft;
    _hud.hasTimer = m.timeLimit > 0;
    _hud.timeLeftText = m.timeLimit > 0 ? fmtTime(m.timeLeft) : '';
    _hud.objectives = m.objectives; _hud.zones = m.zones; _hud.actors = m.actors;
    _hud.progress = primaryProgress(m);
    _hud.score = m.score || (m.active ? computeScore(m) : 0);
    _hud.stars = m.stars;
    _hud.endless = m.endless; _hud.daily = m.daily;
    _hud.fortPct = fortPct(1);
    _hud.kills = m.stats ? m.stats.kills : 0;
    _hud.losses = m.stats ? m.stats.losses : 0;
    return _hud;
  }

  var _armyT = 0;

  function tickMission(dt) {
    var m = mission;
    if (!m.active || m.resolved) { return; }

    m.t += dt;
    if (m.timeLimit > 0) { m.timeLeft = m.timeLimit - m.t; if (m.timeLeft < 0) { m.timeLeft = 0; } }

    var fp = fortPct(1);
    if (fp <= 0.15) { m.lowFortSeen = true; m.stats.lowFortTime += dt; }

    _armyT -= dt;
    if (_armyT <= 0) {
      _armyT = 0.5;
      var arr = S.units, i2, c = 0;
      for (i2 = 0; i2 < arr.length; i2++) { if (arr[i2] && !arr[i2].dead && arr[i2].team === 1) { c++; } }
      if (c > m.stats.peakArmy) { m.stats.peakArmy = c; }
    }

    /* Waves are paced for EVERY mission type — a mission must never stall
       waiting for a Sim that is not talking to us. */
    pacerTick(m, dt);

    var duelType = (m.type === 'bossduel' || m.type === 'gauntlet');
    for (var i = m.actors.length - 1; i >= 0; i--) {
      var a = m.actors[i];
      if (!a) { m.actors.splice(i, 1); continue; }
      if (a.role === 'boss') {
        if (duelType) { continue; }          /* its own mission type ticks it */
        bossActorTick(m, a, dt);
        if (!a.alive) { removeActor(m, a); }
      } else {
        actorTick(m, a, dt);
      }
    }

    if (m.typeDef && m.typeDef.tick) {
      try { m.typeDef.tick(m, dt); }
      catch (e) { warn('tick:' + m.type, 'mission tick threw — mission left running.', e); }
    }
    if (m.resolved) { return; }

    if (m.timeLimit > 0 && m.timeLeft <= 0) { lose(m, 'timeout', FAIL_TEXT.timeout); return; }

    m.uiT -= dt;
    if (m.uiT <= 0) { m.uiT = 0.25; emit('mission:tick', hud()); }

    m.saveT -= dt;
    if (m.saveT <= 0) { m.saveT = 12; autosaveSession(m, 'tick'); }

    _achCheckT -= dt;
    if (_achCheckT <= 0) { _achCheckT = 1.5; evaluateAchievements(false); }
  }

  /* =========================================================================
   * 19. EVENT WIRING — everything Campaign learns, it learns from the bus.
   * ====================================================================== */
  function onUnitSpawn(p) {
    var u = p && p.unit ? p.unit : p;
    if (!u || typeof u !== 'object') { return; }
    if (mission.active && u.team === 1) { mission.stats.spawned++; }
    if (u.missionRole) { bindActorUnit(u); }
  }

  function bindActorUnit(u) {
    var m = mission;
    if (!m.active) { return; }
    var a = actorByRole(m, u.missionRole);
    if (!a || a.unit) { return; }
    a.unit = u;
    if (num(u.maxHp, 0) > 0) { a.maxHp = u.maxHp; a.hp = num(u.hp, u.maxHp); }
    _actorEv.actor = a; _actorEv.kind = 'bound'; _actorEv.mission = m.id;
    emit('mission:actor', _actorEv);
  }

  function onUnitDeath(p) {
    var u = p && p.unit ? p.unit : null;
    if (!u) { return; }
    var t = progress.totals;
    if (u.team === -1) {
      t.kills++;
      if (mission.active && !mission.resolved) {
        mission.stats.kills++;
        var lbl = labelOf(u);
        var b = mission.stats.byEnemy[lbl];
        if (b) { b.kills++; }
        if (u.boss || u.cls === 'boss') { mission.stats.bossKills++; }
      }
      if (u.boss || u.cls === 'boss' || u.cls === 'champion') { t.bosses++; }
      if ((t.kills % 50) === 0) { markAchievementsDirty(); }
    } else if (u.team === 1) {
      t.losses++;
      if (mission.active && !mission.resolved) {
        mission.stats.losses++;
        var cls = str(u.cls, 'unit');
        mission.stats.lostClass[cls] = (mission.stats.lostClass[cls] || 0) + 1;
      }
    }
  }

  function onUnitHit(p) {
    if (!p || !p.unit) { return; }
    var dmg = num(p.dmg, 0);
    if (!(dmg > 0)) { return; }
    var u = p.unit, t = progress.totals, m = mission;
    if (u.team === 1) {
      t.dmgTaken += dmg;
      if (m.active && !m.resolved) {
        m.stats.dmgTaken += dmg;
        var lbl = labelOf(p.from);
        var cls = p.from ? str(p.from.cls, '') : '';
        addEnemyDamage(m, lbl, cls, dmg);
        m.stats.lastHurtBy = lbl;
        m.stats.lastHurtCls = cls;
        if (u.hp - dmg <= 0) { m.stats.killingBlow = lbl; m.stats.killingBlowCls = cls; }
      }
    } else {
      t.dmgDealt += dmg;
      if (m.active && !m.resolved) { m.stats.dmgDealt += dmg; }
    }
  }

  function onFortHit(p) {
    if (!p) { return; }
    var dmg = num(p.dmg, 0), m = mission;
    if (!(dmg > 0) || !m.active || m.resolved) { return; }
    if (p.team === 1) {
      m.stats.fortDmg += dmg;
      m.stats.dmgTaken += dmg;
      addEnemyDamage(m, 'Assault on your fort', 'siege', dmg);
    } else {
      m.stats.enemyFortDmg += dmg;
    }
  }

  function onFortDestroyed(p) {
    var m = mission;
    if (!m.active || m.resolved || !p) { return; }
    if (p.team === -1) {
      if (m.endless) { rebuildEnemyFort(m); }   /* pre-empts a Sim game-over */
      else { win(m, 'fort-broken'); }
    } else if (p.team === 1) { lose(m, 'fort-lost', FAIL_TEXT['fort-lost']); }
  }

  function onWaveStart(p) {
    var m = mission;
    if (!m.active || m.resolved) { return; }
    m.waveSource = 'sim';
    m.lastSimWaveT = m.t;
  }

  function onWaveClear(p) {
    var m = mission;
    if (!m.active || m.resolved) { return; }
    m.lastSimWaveT = m.t;
    advanceWave(m, 'sim');
  }

  function onBossSpawn(p) {
    var m = mission;
    if (m.active && !m.resolved) { m.stats.bossSeen++; }
  }

  function onPowerCast(p) {
    progress.totals.powers++;
    if (mission.active && !mission.resolved) { mission.stats.powers++; }
  }

  function onGoldChange(p) {
    if (!p || !mission.active || mission.resolved) { return; }
    var d = num(p.delta, 0);
    if (d > 0) { mission.stats.goldEarned += d; }
    else { mission.stats.goldSpent -= d; }
  }

  function onGameOver(result) {
    var m = mission;
    if (!m.active || m.resolved) { return; }
    /* Somebody else called it — honour their verdict and do our bookkeeping. */
    resolveMission(m, (result === 'victory') ? 'victory' : 'defeat',
      (result === 'victory') ? 'external' : 'fort-lost', '');
  }

  function onGameReset(hard) {
    if (_selfReset) { return; }   /* our own beginMission() reset — not a wipe */
    if (hard && mission.active && !mission.resolved) { cleanupMission(mission); }
  }

  function onSaveLoad() {
    recountTotals();
    markAchievementsDirty();
    evaluateAchievements(true);
    emit('campaign:map', null);
  }

  /* =========================================================================
   * 20. PUBLIC ENTRY POINTS
   * ====================================================================== */
  function startNode(id, opts) {
    var node = NODE_BY_ID[id];
    if (!node) { warn('start:' + id, 'startNode("' + id + '") — unknown node.'); return false; }
    if (!isUnlocked(node.id) && !(opts && opts.force)) {
      toast('That territory is not open yet.', 'warn');
      return false;
    }
    opts = opts || {};
    var muts = (opts.mutators instanceof Array) ? opts.mutators : node.mutators;
    return beginMission({
      node: node,
      type: node.type,
      name: node.name,
      params: node.params,
      mutators: muts,
      difficulty: str(opts.difficulty, progress.difficulty),
      seed: int(opts.seed, 0),
      era: node.era,
      timeLimit: num(node.timeLimit, num(node.params.timeLimit, 0))
    });
  }

  function setDifficulty(id) {
    if (!DIFF_BY_ID[id]) { return progress.difficulty; }
    progress.difficulty = id;
    if (!mission.active) { recomputeMods(null); }
    C.requestSave();
    emit('campaign:difficulty', id);
    return id;
  }

  function checkDailyRollover(silent) {
    var spec = dailySpec();
    if (progress.daily.date !== spec.date) {
      if (!silent) {
        emit('daily:available', {
          date: spec.date, difficulty: spec.difficulty,
          mutators: spec.mutators, seed: spec.seed,
          best: progress.daily.best, streak: progress.daily.streak
        });
      }
      return true;
    }
    return false;
  }

  var _statsOut = {};
  function statsView() {
    _statsOut.totals = progress.totals;
    _statsOut.records = progress.records;
    _statsOut.daily = progress.daily;
    _statsOut.endless = progress.endless;
    _statsOut.achievements = achievementCount();
    _statsOut.achievementTotal = ACHIEVEMENTS.length;
    _statsOut.nodes = NODES.length;
    _statsOut.cleared = progress.totals.missionsCleared;
    _statsOut.stars = progress.totals.stars;
    _statsOut.starMax = NODES.length * 3;
    _statsOut.eraUnlocked = progress.unlockedEra;
    _statsOut.difficulty = progress.difficulty;
    _statsOut.hasResume = hasResume();
    _statsOut.hasCheckpoint = !!progress.checkpoint;
    return _statsOut;
  }

  function resetProgress(confirmToken) {
    if (confirmToken !== 'ERASE') { return false; }
    progress.nodes = {};
    progress.seen = {};
    progress.achievements = {};
    /* Mutate in place — other modules hold references to these objects. */
    resetInto(progress.totals, defaultTotals());
    resetInto(progress.records, defaultRecords());
    resetInto(progress.daily, defaultDaily());
    resetInto(progress.endless, { runs: 0, lastDifficulty: 'standard', bestWave: 0, bestScore: 0 });
    progress.session = null;
    progress.checkpoint = null;
    progress.lastSummary = null;
    progress.lastPostMortem = null;
    progress.unlockedEra = 0;
    if (mission.active) { cleanupMission(mission); }
    C.requestSave();
    emit('campaign:map', null);
    return true;
  }

  /* =========================================================================
   * 21. SELF TEST — content integrity, run at boot in dev, cheap enough.
   * ====================================================================== */
  function selfTest() {
    var notes = [], i, j, n, ok = true;

    if (NODES.length < 30) { notes.push('only ' + NODES.length + ' nodes — the map wants 30+'); ok = false; }

    var seenTypes = {};
    for (i = 0; i < NODES.length; i++) {
      n = NODES[i];
      seenTypes[n.type] = 1;
      if (!MISSION_TYPES[n.type]) { notes.push(n.id + ': unknown mission type "' + n.type + '"'); ok = false; }
      for (j = 0; j < n.links.length; j++) {
        if (!NODE_BY_ID[n.links[j]]) { notes.push(n.id + ': dead link "' + n.links[j] + '"'); ok = false; }
      }
      for (j = 0; j < n.mutators.length; j++) {
        if (!MUT_BY_ID[n.mutators[j]]) { notes.push(n.id + ': unknown mutator "' + n.mutators[j] + '"'); ok = false; }
      }
      if (n.era < 0 || n.era >= ERA_COUNT) { notes.push(n.id + ': era out of range'); ok = false; }
    }

    for (i = 0; i < MISSION_TYPE_LIST.length; i++) {
      if (!seenTypes[MISSION_TYPE_LIST[i]]) { notes.push('mission type never used on the map: ' + MISSION_TYPE_LIST[i]); }
    }

    /* reachability from the first node */
    var seen = {}, stack = [NODES[0].id], cur, guard = 0;
    seen[NODES[0].id] = 1;
    while (stack.length && guard++ < 5000) {
      cur = stack.pop();
      n = NODE_BY_ID[cur];
      if (!n) { continue; }
      for (j = 0; j < n.links.length; j++) {
        if (!seen[n.links[j]] && NODE_BY_ID[n.links[j]]) { seen[n.links[j]] = 1; stack.push(n.links[j]); }
      }
    }
    for (i = 0; i < NODES.length; i++) {
      if (!seen[NODES[i].id]) { notes.push('unreachable node: ' + NODES[i].id); ok = false; }
    }

    /* every era needs a way in and a climax */
    for (i = 0; i < ERA_COUNT; i++) {
      var list = NODES_BY_ERA[i] || [], entry = false, fin = false;
      for (j = 0; j < list.length; j++) { if (list[j].entry) { entry = true; } if (list[j].finale) { fin = true; } }
      if (list.length === 0) { notes.push('era ' + i + ' has no nodes'); ok = false; }
      else if (!entry) { notes.push('era ' + i + ' has no entry node'); ok = false; }
      else if (!fin && i < ERA_COUNT - 1) { notes.push('era ' + i + ' has no finale'); ok = false; }
    }

    /* achievements */
    var achIds = {};
    for (i = 0; i < ACHIEVEMENTS.length; i++) {
      if (achIds[ACHIEVEMENTS[i].id]) { notes.push('duplicate achievement id: ' + ACHIEVEMENTS[i].id); ok = false; }
      achIds[ACHIEVEMENTS[i].id] = 1;
      if (typeof ACHIEVEMENTS[i].test !== 'function') { notes.push('achievement without a test: ' + ACHIEVEMENTS[i].id); ok = false; }
    }
    if (ACHIEVEMENTS.length < 40) { notes.push('only ' + ACHIEVEMENTS.length + ' achievements — the contract wants 40+'); ok = false; }

    /* mutator sanity */
    for (i = 0; i < MUTATORS.length; i++) {
      if (!MUTATORS[i].mods || typeof MUTATORS[i].mods !== 'object') { notes.push('mutator without mods: ' + MUTATORS[i].id); ok = false; }
    }

    return {
      ok: ok, notes: notes,
      nodes: NODES.length, eras: ERA_COUNT,
      types: MISSION_TYPE_LIST.length,
      mutators: MUTATORS.length,
      achievements: ACHIEVEMENTS.length,
      difficulties: DIFFICULTIES.length,
      hardNodes: countHardNodes(),
      requiredNodes: countRequiredNodes()
    };
  }

  /* =========================================================================
   * 22. INIT + PUBLIC API
   * ====================================================================== */
  var _inited = false;
  var _unsub = [];

  function init() {
    if (_inited) { return true; }
    _inited = true;

    try { C.registerSave('campaign', serialize, deserialize); }
    catch (e) { warn('save', 'could not register the campaign save slice — progress will not persist.', e); }

    _unsub.push(on('unit:spawn', onUnitSpawn));
    _unsub.push(on('unit:death', onUnitDeath));
    _unsub.push(on('unit:hit', onUnitHit));
    _unsub.push(on('fort:hit', onFortHit));
    _unsub.push(on('fort:destroyed', onFortDestroyed));
    _unsub.push(on('wave:start', onWaveStart));
    _unsub.push(on('wave:clear', onWaveClear));
    _unsub.push(on('boss:spawn', onBossSpawn));
    _unsub.push(on('power:cast', onPowerCast));
    _unsub.push(on('gold:change', onGoldChange));
    _unsub.push(on('game:over', onGameOver));
    _unsub.push(on('game:reset', onGameReset));
    _unsub.push(on('save:load', onSaveLoad));

    try { C.registerSim(tickMission, 40); }
    catch (e2) { warn('sim', 'could not register the campaign sim step — missions will not tick.', e2); }

    progress.totals.sessions++;
    recomputeMods(null);
    checkDailyRollover(false);
    evaluateAchievements(true);

    API.ready = true;
    emit('campaign:ready', API);
    return true;
  }

  var API = {
    __isAowCampaign: true,
    version: '1.0.0',
    ready: false,
    failed: false,

    /* tables (read-only by convention) */
    NODES: NODES,
    NODE_BY_ID: NODE_BY_ID,
    NODES_BY_ERA: NODES_BY_ERA,
    MISSION_TYPES: MISSION_TYPES,
    MISSION_TYPE_LIST: MISSION_TYPE_LIST,
    MUTATORS: MUTATORS,
    MUT_BY_ID: MUT_BY_ID,
    DIFFICULTIES: DIFFICULTIES,
    ACHIEVEMENTS: ACHIEVEMENTS,
    ERA_LORE: ERA_LORE,
    MOD_DEFAULTS: MOD_DEFAULTS,

    /* live objects — stable references, safe to hold */
    progress: progress,
    mission: mission,
    mods: mods,
    records: progress.records,

    /* lifecycle */
    init: init,

    /* map */
    mapView: mapView,
    nodeView: nodeView,
    node: function (id) { return NODE_BY_ID[id] || null; },
    isUnlocked: isUnlocked,
    isCleared: isCleared,
    stars: starsOf,
    eraUnlocked: eraUnlocked,
    nextNode: nextNode,
    eraLore: eraLore,
    showEraCard: showEraCard,

    /* playing */
    startNode: startNode,
    startEndless: startEndless,
    startDaily: startDaily,
    dailySpec: dailySpec,
    checkDaily: checkDailyRollover,
    abandon: abandon,
    retry: retry,
    retryCheckpoint: retryCheckpoint,
    resume: resume,
    hasResume: hasResume,
    setDifficulty: setDifficulty,
    difficulty: function () { return progress.difficulty; },
    difficultyDef: diffDef,

    /* live mission */
    hud: hud,
    objectives: function () { return mission.objectives; },
    actors: function () { return mission.actors; },
    zones: function () { return mission.zones; },
    missionProgress: function () { return primaryProgress(mission); },
    isActive: function () { return mission.active && !mission.resolved; },
    score: function () { return mission.active ? computeScore(mission) : mission.score; },
    mutatorDef: function (id) { return MUT_BY_ID[id] || null; },
    getMod: function (k, d) { return has(mods, k) ? mods[k] : num(d, 0); },

    /* results */
    postMortem: function () { return progress.lastPostMortem; },
    sessionSummary: function () { return progress.lastSummary; },
    checkpoint: function () { return progress.checkpoint; },

    /* meta */
    achievementView: achievementView,
    achievementCount: achievementCount,
    achievementTotal: ACHIEVEMENTS.length,
    leaderboard: leaderboard,
    stats: statsView,
    resetProgress: resetProgress,

    /* diagnostics */
    selfTest: selfTest
  };

  AOW.Campaign = API;

  /* Self-init: the integrator may call init() explicitly (it is idempotent),
     but a forgotten call must never leave the campaign dead. */
  try { init(); }
  catch (e) { warn('init', 'Campaign init failed — the module is inert.', e); API.failed = true; }

})(typeof window !== 'undefined' ? window : this);
