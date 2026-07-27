(function(){
  'use strict';
  const damageTypes={PIERCING:{shield:.80,armor:1.10,health:1},SLASHING:{shield:.70,armor:1,health:1.15},BLUNT:{shield:1.35,armor:1.15,health:.85},SIEGE:{shield:1.50,armor:1.25,health:1.10},SPECIAL:{shield:1,armor:1,health:1}};
  const roles={DEFENDER:{staggerResistance:34},ASSAULT:{staggerResistance:18},RANGED:{staggerResistance:12},ELITE:{staggerResistance:50},SPECIALIST:{staggerResistance:16}};
  const civilizationMultipliers={TRIBAL:{health:.90,damage:.90,shield:.85,armor:.75,speed:1.08},BRONZE:{health:1,damage:1,shield:1,armor:.95,speed:1},GREEK:{health:1.05,damage:1.03,shield:1.12,armor:1,speed:.98},ROMAN:{health:1.10,damage:1.05,shield:1.08,armor:1.12,speed:.96},MEDIEVAL:{health:1.14,damage:1.10,shield:1.05,armor:1.20,speed:.94}};
  const defaults={recruitTime:2,health:100,shield:0,armor:0,armorReduction:0,damage:10,attackInterval:1,range:28,speed:50,maxActive:50,projectileSpeed:0,armorPiercing:0,staggerPower:16,damageType:'SLASHING'};
  const unit=(id,civilization,role,cost,stats)=>Object.freeze({id,civilization,role,cost,...defaults,...stats});
  const units={
    tribal_hideguard:unit('tribal_hideguard','TRIBAL','DEFENDER',55,{health:105,shield:52,armor:12,damage:9,attackInterval:1.05,range:34,speed:51,damageType:'PIERCING'}),
    tribal_club_raider:unit('tribal_club_raider','TRIBAL','ASSAULT',45,{health:76,armor:8,damage:13,attackInterval:.9,speed:61,damageType:'BLUNT',staggerPower:27}),
    tribal_hunter:unit('tribal_hunter','TRIBAL','RANGED',65,{health:55,armor:5,damage:8,attackInterval:1.45,range:390,speed:55,projectileSpeed:430,damageType:'PIERCING'}),
    tribal_bone_champion:unit('tribal_bone_champion','TRIBAL','ELITE',130,{health:165,shield:38,armor:24,damage:19,attackInterval:1.05,speed:49,damageType:'BLUNT',staggerPower:38,maxActive:8}),
    tribal_war_slinger:unit('tribal_war_slinger','TRIBAL','SPECIALIST',105,{health:62,damage:14,attackInterval:1.7,range:430,speed:53,projectileSpeed:390,damageType:'BLUNT',staggerPower:30,maxActive:10}),
    bronze_spear_guard:unit('bronze_spear_guard','BRONZE','DEFENDER',75,{health:125,shield:82,armor:32,armorReduction:.08,damage:13,range:40,speed:49,damageType:'PIERCING'}),
    khopesh_warrior:unit('khopesh_warrior','BRONZE','ASSAULT',65,{health:94,armor:27,armorReduction:.06,damage:17,attackInterval:.85,speed:58}),
    palace_archer:unit('palace_archer','BRONZE','RANGED',85,{health:64,armor:17,damage:11,attackInterval:1.35,range:450,speed:53,projectileSpeed:470,damageType:'PIERCING'}),
    royal_scale_guard:unit('royal_scale_guard','BRONZE','ELITE',165,{health:190,shield:95,armor:48,armorReduction:.12,damage:22,range:38,speed:45,damageType:'PIERCING',maxActive:8}),
    chariot_slinger:unit('chariot_slinger','BRONZE','SPECIALIST',170,{health:104,armor:24,damage:16,attackInterval:1.28,range:405,speed:68,projectileSpeed:410,damageType:'BLUNT',maxActive:8}),
    hoplite:unit('hoplite','GREEK','DEFENDER',100,{health:145,shield:110,armor:45,armorReduction:.11,damage:16,range:45,speed:47,damageType:'PIERCING',staggerPower:25}),
    greek_swordsman:unit('greek_swordsman','GREEK','ASSAULT',85,{health:108,armor:38,armorReduction:.08,damage:20,attackInterval:.8,speed:57}),
    cretan_archer:unit('cretan_archer','GREEK','RANGED',110,{health:72,armor:20,damage:14,attackInterval:1.25,range:500,speed:54,projectileSpeed:520,armorPiercing:.08,damageType:'PIERCING'}),
    spartan_champion:unit('spartan_champion','GREEK','ELITE',210,{health:225,shield:125,armor:58,armorReduction:.14,damage:27,attackInterval:.86,range:44,speed:52,damageType:'PIERCING',staggerPower:36,maxActive:8}),
    gastraphetes_operator:unit('gastraphetes_operator','GREEK','SPECIALIST',185,{health:82,armor:25,damage:30,attackInterval:2.15,range:570,speed:42,projectileSpeed:610,armorPiercing:.28,damageType:'PIERCING',maxActive:8}),
    legionary:unit('legionary','ROMAN','DEFENDER',125,{health:165,shield:118,armor:62,armorReduction:.15,damage:18,attackInterval:.92,range:39,speed:47,damageType:'PIERCING'}),
    auxiliary_swordsman:unit('auxiliary_swordsman','ROMAN','ASSAULT',105,{health:122,armor:51,armorReduction:.12,damage:23,attackInterval:.78,speed:56}),
    roman_archer:unit('roman_archer','ROMAN','RANGED',130,{health:80,armor:28,damage:16,attackInterval:1.2,range:520,speed:52,projectileSpeed:545,armorPiercing:.10,damageType:'PIERCING'}),
    centurion:unit('centurion','ROMAN','ELITE',250,{health:255,shield:108,armor:78,armorReduction:.19,damage:31,attackInterval:.82,speed:49,staggerPower:38,maxActive:8}),
    scorpion_operator:unit('scorpion_operator','ROMAN','SPECIALIST',225,{health:95,armor:35,damage:38,attackInterval:2.35,range:620,speed:38,projectileSpeed:680,armorPiercing:.36,damageType:'PIERCING',maxActive:8}),
    shielded_sergeant:unit('shielded_sergeant','MEDIEVAL','DEFENDER',155,{health:188,shield:124,armor:82,armorReduction:.20,damage:21,attackInterval:.95,range:38,speed:44,damageType:'PIERCING'}),
    man_at_arms:unit('man_at_arms','MEDIEVAL','ASSAULT',135,{health:145,armor:73,armorReduction:.18,damage:28,attackInterval:.82,speed:52}),
    longbowman:unit('longbowman','MEDIEVAL','RANGED',165,{health:88,armor:31,damage:21,attackInterval:1.32,range:610,speed:49,projectileSpeed:625,armorPiercing:.18,damageType:'PIERCING'}),
    royal_knight:unit('royal_knight','MEDIEVAL','ELITE',315,{health:310,shield:92,armor:112,armorReduction:.25,damage:38,attackInterval:.9,speed:61,damageType:'BLUNT',staggerPower:46,maxActive:8}),
    crossbowman:unit('crossbowman','MEDIEVAL','SPECIALIST',270,{health:105,armor:48,damage:43,attackInterval:2.05,range:590,speed:43,projectileSpeed:700,armorPiercing:.42,damageType:'PIERCING',maxActive:10})
  };
  // Generate approved playable placeholders for every role in the 15-age registry.
  // Final balancing can replace each record without changing combat code or saves.
  const roleTemplate={DEFENDER:units.legionary,ASSAULT:units.auxiliary_swordsman,RANGED:units.roman_archer,ELITE:units.centurion,SPECIALIST:units.scorpion_operator};
  const civs=window.KW_DATA?.civilizations||[];
  for(const civ of civs)for(const [role,id] of Object.entries(civ.units))if(!units[id]){
    const t=roleTemplate[role],scale=1+(civ.order-1)*.075;
    units[id]=unit(id,civ.id.toUpperCase(),role,Math.round(t.cost*(.78+scale*.22)),{
      health:Math.round(t.health*scale),shield:Math.round(t.shield*scale),armor:Math.round(t.armor*scale),armorReduction:Math.min(.38,t.armorReduction+(civ.order-1)*.008),
      damage:Math.round(t.damage*scale),attackInterval:Math.max(.62,t.attackInterval-(civ.order-1)*.012),range:t.range+(role==='RANGED'||role==='SPECIALIST'?(civ.order-1)*9:0),
      speed:Math.max(38,t.speed-(civ.order-1)*.3),projectileSpeed:t.projectileSpeed?Math.round(t.projectileSpeed*(1+(civ.order-1)*.025)):0,
      armorPiercing:Math.min(.65,t.armorPiercing+(civ.order-1)*.018),damageType:t.damageType,staggerPower:t.staggerPower,maxActive:t.maxActive,approvedPlaceholder:civ.approvedPlaceholder
    });
  }
  const fortressBalance={};for(const civ of civs)fortressBalance[civ.id]={gateHealth:1000+(civ.order-1)*260,weaponMultiplier:1+(civ.order-1)*.105,reloadMultiplier:Math.max(.58,1-(civ.order-1)*.028)};
  const api={version:'4.1-conquest-progression',damageTypes,roles,civilizationMultipliers,units,population:{playerStart:25,playerMax:500,enemyActiveLow:100,enemyActiveMax:200},economy:{baseGoldPerSecond:6,incomePerConquest:.3,waveClearBase:100,bountyFraction:.20,bountyMinimum:3},enemyScaling:{healthPerWave:.006,damagePerWave:.0045,armorPerWave:.004,shieldPerWave:.0045},waveBudget:(wave,civIndex)=>Math.round(55+wave*24+Math.pow(wave,1.32)*8+(civIndex||0)*45),fortresses:fortressBalance,battlefieldPowers:civs.map(c=>c.battlefieldPower),validate(){const a=Object.values(units),mapped=new Set(civs.flatMap(c=>Object.values(c.units)));return {ok:mapped.size===75&&[...mapped].every(id=>units[id]&&damageTypes[units[id].damageType]&&roles[units[id].role]),unitCount:mapped.size,totalDefinitions:a.length};}};
  window.KW_BALANCE=Object.freeze(api);
})();
