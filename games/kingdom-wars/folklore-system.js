(function(){
  'use strict';
  const rows=[
    ['Bone Walker','Dire Wolf','Cave Bear','Forest Wraith','Mammoth Titan','Spirit Shaman','Bonewood Citadel','totem_healing'],
    ['Clay Soldier','Desert Hyena','Bronze Colossus','Sand Spirit','Bull Titan','Sun Guard','Sun-Bronze Palace','sun_beam'],
    ['Tomb Warrior','Serpent','Giant Scarab','Winged Guardian','Cursed King','Tomb Sentinel','Palace of Eternal Kings','curse_zones'],
    ['Ashen Warrior','War Hound','Iron Golem','Smoke Spirit','Giant Warlord','Forge Guardian','Black Iron Hold','forge_eruptions'],
    ['Undead Hoplite','Harpy','Minotaur','Gorgon','Cyclops','Spartan Revenant','Citadel of the Gods','labyrinth_gates'],
    ['Revenant Legionary','Arena Lion','War Elephant','Underworld Gladiator','Imperial Revenant','Praetorian Ghost','Eternal Imperial Capital','legion_cohorts'],
    ['Grave Warrior','Black Hound','Bog Giant','Mist Spirit','Warlord Shade','Runic Guardian','Mistbound Stronghold','runic_barriers'],
    ['Draugr','Fenrir Wolf','Troll','Valkyrie Spirit','Frost Giant','Einherjar','Frozen Hall of Kings','frost_zones'],
    ['Plague Dead','Gargoyle','Ogre','Black Knight','Wyrm','Holy Guardian','Black Crown Castle','wyrm_assault'],
    ['Skeleton Samurai','Tengu','Giant Spider','Yūrei','Oni','Spirit Samurai','Oni Shogun Castle','spirit_clones'],
    ['Powder-Burned Dead','Fire Hound','Smoke Giant','Cannon Spirit','Ash Emperor','Alchemist Guard','Thunder Arsenal','cannon_batteries'],
    ['Fallen Redcoat','Phantom Horse','Iron Giant','Battlefield Ghost','Crowned Revenant','Ghost Regiment','Imperial Bastion','mortar_zones'],
    ['Gas-Masked Dead','Mechanical Hound','Steam Giant','Factory Wraith','Iron Behemoth','Prototype Soldier','Iron Factory City','conveyor_reinforcements'],
    ['Infected Soldier','Mutant Hound','Bio-Titan','Phantom Operative','Experimental Monster','Enhanced Operator','Underground Command Complex','automated_turrets'],
    ['Cyber Zombie','Void Hound','Mech Giant','Dimensional Spirit','Planet Devourer','Astral Guardian','Galactic Throneworld','orbital_attacks']
  ];
  const tags=[['undead','infantry'],['beast'],['giant','monster','siege'],['spirit','specialist'],['boss','monster','giant'],['elite','infantry']];
  const civilizations=(window.KW_DATA?.civilizations||[]).map((c,i)=>Object.freeze({civilizationId:c.id,civilizationOrder:c.order,fortress:rows[i][6],fortressMechanic:rows[i][7],historicalDisclaimer:'Folklore and alternate-history interpretation.',
    units:Object.freeze(rows[i].slice(0,6).map((name,n)=>Object.freeze({id:c.id+'_folklore_'+n,name,role:['undead','fast','large','specialist','boss','elite'][n],tags:Object.freeze(tags[n]),unlock:n===5?'Destroy '+rows[i][6]:'Final Siege stage '+(n+1)}))),
    schedule:Object.freeze([{minute:0,tier:'historical'},{minute:3,tier:'elite_siege'},{minute:6,tier:'undead_folklore'},{minute:10,tier:'giants_monsters'},{minute:15,tier:'mixed_boss_cycles'}])}));
  const byOrder=order=>civilizations[Math.max(0,Math.min(14,(order||1)-1))];
  window.KWFolklore=Object.freeze({version:1,civilizations:Object.freeze(civilizations),byOrder});
})();
