/* Kingdom Wars data-driven civilization registry — 15-age historical foundation.
   Combat consumes stable role IDs; civilization packs supply content and art. */
(function(){
  'use strict';
  const ROLES=Object.freeze({DEFENDER:'DEFENDER',ASSAULT:'ASSAULT',RANGED:'RANGED',ELITE:'ELITE',SPECIALIST:'SPECIALIST'});
  const roleKeys=Object.values(ROLES);
  const specs=[
    ['tribal_stone','Tribal Stone Era','tribal','Late Prehistory','timber_hillfort','boulder_strike','Mammoth Chief','mobile_hunters',['Hideguard Spearman','Stone Club Raider','Tribal Hunter','Bone Champion','War Slinger']],
    ['early_bronze','Early Bronze Kingdoms','bronze','Early Bronze Age','mud_brick_citadel','sling_barrage','Lord of the First Cities','royal_battle_line',['Bronze Spear Guard','Copper Axe Warrior','Early Composite Archer','Palace Guard','Heavy Slinger']],
    ['late_bronze','Late Bronze Empires','late_bronze','Late Bronze Age','palace_citadel','royal_arrow_volley','Sun-Bronze Pharaoh','palace_combined_arms',['Heavy Bronze Spearman','Khopesh Warrior','Royal Composite Archer','Chariot Guard','Heavy Javelin Specialist']],
    ['iron_empires','Iron Age Empires','iron','Iron Age','iron_city_wall','siege_barrage','Iron Emperor','siege_empire',['Iron Shield Spearman','Iron Sword Raider','Iron Age Archer','Royal Immortal Guard','Siege Engineer']],
    ['classical_greece','Classical Greece','greek','Classical Antiquity','hellenic_acropolis','spear_storm','Basileus','phalanx_cohesion',['Hoplite','Greek Swordsman','Cretan-Inspired Archer','Spartan Champion','Gastraphetes Operator']],
    ['imperial_rome','Imperial Rome','roman','Imperial Antiquity','roman_castrum','artillery_barrage','Imperial Legate','roman_cohorts',['Legionary','Auxiliary Swordsman','Roman Archer','Centurion','Scorpion Operator']],
    ['byzantium','Late Antiquity and Byzantium','byzantine','Late Antiquity','layered_walled_city','imperial_fire_barrage','Purple Emperor','layered_defense',['Byzantine Spear Guard','Gothic Axe Warrior','Eastern Composite Archer','Cataphract Guard','Incendiary Specialist']],
    ['viking_age','Viking Age','viking','Early Medieval','timber_ring_fort','axe_storm','Sea King','shield_wall_raiders',['Shield-Wall Spearman','Viking Axe Raider','Norse Archer','Huscarle','Throwing-Axe Berserker']],
    ['high_medieval','High Medieval Kingdoms','medieval','High Medieval','royal_stone_castle','trebuchet_strike','Iron Crown','feudal_combined_arms',['Shielded Sergeant','Man-at-Arms','Longbowman','Royal Knight','Crossbowman']],
    ['steppe_empires','Mongol and Steppe Empires','steppe','Steppe Empire','steppe_siege_camp','encircling_volley','Great Khan','mobile_encirclement',['Steppe Spear Guard','Saber Raider','Fast Foot Archer','Khan’s Guard','Siege Engineer']],
    ['feudal_japan','Feudal Japan','japanese','Sengoku','japanese_mountain_castle','fire_arrow_volley','Crimson Shogun','clan_combined_arms',['Yari Ashigaru','Samurai Swordsman','Yumi Archer','Samurai Champion','Matchlock Gunner']],
    ['renaissance','Renaissance Pike-and-Shot','renaissance','Early Modern','angular_bastion','cannon_bombardment','Gunpowder Prince','pike_and_shot',['Pikeman','Doppelsöldner','Light Crossbowman','Armored Captain','Arquebusier']],
    ['age_of_sail','Age of Sail and Gunpowder Empires','sail','Gunpowder Empire','bastion_fort','grand_cannon_volley','Admiral Emperor','musket_lines',['Bayonet Infantry','Saber Infantry','Musket Line Soldier','Grenadier Guard','Field Cannon Crew']],
    ['napoleonic','Napoleonic Era','napoleonic','Napoleonic','fortified_redoubt','grand_battery','Continental Emperor','disciplined_volleys',['Line Infantry Defender','Grenadier Assault Soldier','Rifleman','Imperial Guard','Field Artillery Crew']],
    ['industrial_war','Industrial and World War Era','industrial','Industrial Warfare','trench_bunker_network','heavy_artillery_strike','Iron General','trench_suppression',['Trench Rifleman','Assault Trooper','Marksman','Storm Guard','Machine-Gun Team']]
  ];
  const slug=s=>s.toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  const fortressTiers={
    timber_hillfort:['watch_platforms','stone_drop_frames','reinforced_palisade'],mud_brick_citadel:['sling_platforms','bronze_braziers','reinforced_gatehouse'],
    palace_citadel:['painted_archer_towers','heavy_gatehouse','royal_battlements'],iron_city_wall:['engineer_platforms','heavy_projectors','iron_gate'],
    hellenic_acropolis:['tower_archers','stone_throwers','marble_gate'],roman_castrum:['wall_archers','scorpion_towers','stone_gatehouse'],
    layered_walled_city:['elevated_archers','fire_projector','layered_gate'],timber_ring_fort:['watchtowers','fire_platforms','longhouse_gate'],
    royal_stone_castle:['longbow_towers','murder_holes','reinforced_keep'],steppe_siege_camp:['mobile_towers','captured_engines','captured_city_wall'],
    japanese_mountain_castle:['archer_galleries','matchlock_positions','stone_gate'],angular_bastion:['gunner_positions','cannon_platforms','angular_wall'],
    bastion_fort:['musket_parapets','cannon_embrasures','powder_gate'],fortified_redoubt:['organized_firing_line','grand_battery','earthwork_gate'],
    trench_bunker_network:['rifle_trenches','machine_gun_nests','concrete_bunker']
  };
  const palettes=[['#6f4b2a','#9a6b3a','#c7a66a'],['#9b5d2e','#cf8b3c','#e3c07a'],['#b97832','#d7aa52','#ead39a'],['#63564b','#a66b35','#88919a'],['#e8dfc8','#b58a35','#31558a'],['#9e2525','#d7b24b','#b9b4a7'],['#6e3d76','#d6b65b','#c8c2ae'],['#704026','#a62e2e','#6c7a49'],['#526b89','#c6a13b','#a7abb0'],['#8c6a43','#b63b2e','#d0b47a'],['#efe8da','#a92828','#293a4c'],['#8a3940','#cfaa45','#59616b'],['#203c61','#c13b36','#d0c4aa'],['#24365e','#d2ad49','#d5d0c5'],['#59604d','#8d7559','#343a3b']];
  const civilizations=specs.map((s,i)=>{
    const [id,name,region,period,fortressId,power,boss,ai,unitNames]=s,order=i+1,start=i*50+1;
    const units={};roleKeys.forEach((role,n)=>units[role]=id+'_'+slug(unitNames[n]));
    const campaignKingdomIds=Array.from({length:5},(_,k)=>id+'_kingdom_'+(k+1));
    return Object.freeze({id,displayName:name,name,order,approximatePeriod:period,region,historicalInspirations:[period],waves:[start,start+49],endlessStartWave:start,endlessEndWave:start+49,
      tacticalIdentity:ai.replace(/_/g,' '),fortress:{id:fortressId,tiers:fortressTiers[fortressId]},battlefieldPower:power,boss:slug(boss),bossDisplayName:boss,
      environment:id+'_battlefield',music:id+'_war_theme',ai,units,palette:palettes[i],campaignKingdomIds,transitionRewardId:id+'_completion',approvedPlaceholder:i>=5});
  });
  const campaignKingdoms=civilizations.flatMap(c=>c.campaignKingdomIds.map((id,k)=>Object.freeze({id,civilizationId:c.id,kingdomNumber:k+1,
    leaderId:id+'_leader',leaderDisplayName:(k===4?c.bossDisplayName:c.displayName+' Commander '+(k+1)),primaryRole:roleKeys[Math.min(k,4)],
    objective:k===4?'defeat_ruler':'destroy_fortress',modifierId:c.id+'_modifier_'+(k+1),rewardId:id+'_first_clear',masteryId:id+'_mastery',approvedPlaceholder:true})));
  function eraForWave(wave){if(wave<=0)return civilizations[0];return civilizations[Math.min(civilizations.length-1,Math.floor((wave-1)/50))];}
  function byOrder(order){return civilizations[Math.max(0,Math.min(civilizations.length-1,(order||1)-1))];}
  function validate(){const ids=new Set(),rewards=new Set();for(const civ of civilizations){if(ids.has(civ.id))throw Error('Duplicate civilization id: '+civ.id);ids.add(civ.id);if(!civ.fortress?.tiers||civ.fortress.tiers.length!==3)throw Error(civ.id+' fortress requires 3 tiers');for(const role of roleKeys)if(!civ.units[role])throw Error(civ.id+' missing role '+role);}for(const node of campaignKingdoms){if(rewards.has(node.rewardId))throw Error('Duplicate reward '+node.rewardId);rewards.add(node.rewardId);}if(campaignKingdoms.length!==75)throw Error('Campaign requires 75 kingdoms');return true;}
  window.KW_DATA=Object.freeze({version:2,wavesPerCivilization:50,launchWaveMilestone:750,roles:ROLES,civilizations:Object.freeze(civilizations),campaignKingdoms:Object.freeze(campaignKingdoms),legacyFutureAge:Object.freeze({id:'cyber_galactic',source:'legacy_laser',order:18}),eraForWave,byOrder,validate});
  window.KW_DATA.validate();
})();
