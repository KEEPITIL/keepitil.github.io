(function(){
  'use strict';
  const BASE_ARMY=60,MAX_ARMY=500,BASE_INCOME=6,INCOME_PER_KINGDOM=.3;
  const CAP_REWARDS=[4,6,6,8,9];
  function conqueredIds(completed){return Object.keys(completed||{}).filter(id=>completed[id]);}
  function armyCap(completed,kingdoms,premium){
    if(premium)return MAX_ARMY;
    const byId=new Map((kingdoms||[]).map(n=>[n.id,n]));
    return Math.min(MAX_ARMY,conqueredIds(completed).reduce((sum,id)=>sum+(CAP_REWARDS[(byId.get(id)?.kingdomNumber||1)-1]||0),BASE_ARMY));
  }
  function calculate(completed,kingdoms,premium){
    const conquered=premium?(kingdoms||[]).length:conqueredIds(completed).length;
    return Object.freeze({premium:!!premium,conquered,armyCap:armyCap(completed,kingdoms,premium),passiveIncome:BASE_INCOME+conquered*INCOME_PER_KINGDOM,
      combatMultiplier:1+Math.min(75,conquered)*.012,allRoles:!!premium||conquered>=15,allEquipment:!!premium||conquered>=75,eliteUnlocked:!!premium||conquered>=4});
  }
  function enemyWavePopulation(wave){
    wave=Math.max(1,Math.floor(wave||1));
    if(wave<=50)return Math.round(25+(wave-1)*(75/49));
    if(wave<=740)return Math.round(101+(wave-51)*(1398/689));
    return 1500;
  }
  // Enemy field capacity scales with campaign progress: 3× the player's unlocked army,
  // climbing from ~75 toward the 1500 ceiling as each crusade is won. Endless waves also escalate.
  function activeEnemyCap(wave,armyCap){
    armyCap=Math.max(BASE_ARMY,armyCap||BASE_ARMY);
    const byCampaign=armyCap*3;                                              // 75 → 1500 across the 75 crusades
    const byWave=wave<=50?90:Math.min(1500,Math.round(90+(wave-50)*2.1));    // endless escalation
    return Math.min(1500,Math.max(60,byCampaign,byWave));
  }
  window.KWProgression=Object.freeze({BASE_ARMY,MAX_ARMY,BASE_INCOME,INCOME_PER_KINGDOM,CAP_REWARDS:Object.freeze(CAP_REWARDS),calculate,enemyWavePopulation,activeEnemyCap});
})();
