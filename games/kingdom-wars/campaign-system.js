(function(){
  'use strict';
  const SAVE_NS='campaign';
  const roleOrder=['DEFENDER','ASSAULT','RANGED','ELITE','SPECIALIST'];
  const victoryGems=[8,10,12,15,25], masteryGems=[4,5,6,8,12], repeatGems=[1,1,2,2,4];
  const objectiveText={destroy_fortress:'Destroy the enemy fortress',defeat_ruler:'Defeat the civilization ruler'};
  const fresh=()=>({schemaVersion:1,unlockedCivilization:1,completed:{},crowns:{},bestDifficulty:{},claims:{},repeatDaily:{day:'',earned:0},totalVictories:0});
  function load(){const r=window.KWSave?.read?.(SAVE_NS);return Object.assign(fresh(),r?.ok?r.payload:{});}
  let state=load();
  function premiumUnlocked(){return !!window.KWCommerce?.hasEntitlement?.('progression.full_unlock');}
  function progression(){return window.KWProgression.calculate(state.completed,window.KW_DATA.campaignKingdoms,premiumUnlocked());}
  function save(){window.KWSave?.write?.(SAVE_NS,state,true);}
  function nodeById(id){return window.KW_DATA.campaignKingdoms.find(n=>n.id===id);}
  function civFor(node){return window.KW_DATA.civilizations.find(c=>c.id===node.civilizationId);}
  function unlocked(node){if(premiumUnlocked())return true;const civ=civFor(node);if(!civ||civ.order>state.unlockedCivilization)return false;if(node.kingdomNumber===1)return true;return !!state.completed[civ.campaignKingdomIds[node.kingdomNumber-2]];}
  function targetWave(node){const civ=civFor(node),local=[10,20,30,40,50][node.kingdomNumber-1];return(civ.order-1)*50+local;}
  function start(id,difficulty='standard'){
    const node=nodeById(id),civ=node&&civFor(node);if(!node||!civ||!unlocked(node))return false;
    reset();
    const target=targetWave(node);
    S.civ=civ.order;S.enemyCiv=civ.order;S.wave=target-1;S.localWave=((S.wave-1)%50)+1;S.gold=250+node.kingdomNumber*90;
    S.campaignMissionId=id;S.campaignDifficulty=difficulty;S.campaignStartingGate=S.gateHP;S.phase='inter';S.interT=1.2;
    bakeCastles();rebakePlayer();
    btnEls.gunner.style.display=S.civ>=11?'flex':'none';btnEls.laser.style.display='none';
    document.getElementById('overlay').classList.add('hidden');document.getElementById('hub').classList.add('hidden');
    started=true;paused=false;follow=true;syncFollowBtn();
    window.KWAnalytics?.track('campaign_battle_started',{missionId:id,civilization:civ.id,kingdom:node.kingdomNumber,difficulty},'critical');
    showMsg('WORLD CRUSADE · '+civ.displayName+' · Kingdom '+node.kingdomNumber+' · '+node.leaderDisplayName,3600);
    return true;
  }
  function claim(id,amount,type){if(state.claims[id])return 0;state.claims[id]=true;window.KWCommerce?.rewardCampaign?.(id,amount,type);return amount;}
  function finish(result){
    if(!S?.campaignMissionId||S.campaignResolved)return false;
    S.campaignResolved=true;
    const node=nodeById(S.campaignMissionId),civ=civFor(node),missionId=node.id;
    if(result!=='victory'){
      window.KWAnalytics?.track('campaign_battle_failed',{missionId,civilization:civ.id,kingdom:node.kingdomNumber,wave:S.wave},'critical');
      const payload={result:'defeat',node,civ,reward:0,crowns:0};
      setTimeout(()=>window.KWRuntime?.events.emit('campaign_result',payload),200);return true;
    }
    const first=!state.completed[missionId];
    const gateRatio=S.gateMax?S.gateHP/S.gateMax:0;
    const crowns=1+(gateRatio>=.5?1:0)+(gateRatio>=.75?1:0);
    state.completed[missionId]=true;state.crowns[missionId]=Math.max(state.crowns[missionId]||0,crowns);state.totalVictories++;
    let reward=0;
    if(first)reward+=claim(node.rewardId,victoryGems[node.kingdomNumber-1],'CAMPAIGN_FIRST_CLEAR');
    if(crowns===3)reward+=claim(node.masteryId,masteryGems[node.kingdomNumber-1],'CAMPAIGN_MASTERY');
    if(!first){const day=new Date().toISOString().slice(0,10);if(state.repeatDaily.day!==day)state.repeatDaily={day,earned:0};const room=Math.max(0,30-state.repeatDaily.earned),amount=Math.min(room,repeatGems[node.kingdomNumber-1]);if(amount){reward+=claim('repeat:'+missionId+':'+day+':'+state.totalVictories,amount,'CAMPAIGN_REPEAT');state.repeatDaily.earned+=amount;}}
    if(node.kingdomNumber===5&&first){reward+=claim(civ.transitionRewardId+':campaign',25,'CAMPAIGN_CIVILIZATION_CLEAR');state.unlockedCivilization=Math.min(15,Math.max(state.unlockedCivilization,civ.order+1));}
    save();
    window.KWAnalytics?.track('campaign_battle_completed',{missionId,civilization:civ.id,kingdom:node.kingdomNumber,crowns,reward,firstClear:first},'critical');
    const payload={result:'victory',node,civ,reward,crowns,firstClear:first};
    setTimeout(()=>window.KWRuntime?.events.emit('campaign_result',payload),200);return true;
  }
  const routeIcons=['🔥','🏺','⚔️','🛡️','🏰','🪓','⛵','🐎','🌙','🎌','🦅','⚓','🎖️','🚂','⚙️'];
  function renderRoadmap(showPanel){
    const p=progression(),all=window.KW_DATA.civilizations;
    let currentId=null;for(const civ of all)for(const id of civ.campaignKingdomIds)if(!state.completed[id]&&unlocked(nodeById(id))&&!currentId)currentId=id;
    const route=all.map((c,i)=>{const nodes=c.campaignKingdomIds.map(nodeById),done=nodes.filter(n=>state.completed[n.id]).length,open=p.premium||c.order<=state.unlockedCivilization,current=nodes.some(n=>n.id===currentId),complete=done===5;
      const dots=nodes.map(n=>{const d=!!state.completed[n.id],next=n.id===currentId,stars=state.crowns[n.id]||0;return '<span class="roadnode '+(d?'done ':'')+(next?'next':'')+'" title="Kingdom '+n.kingdomNumber+': '+n.leaderDisplayName+'">'+(d?(stars||'✓'):n.kingdomNumber)+'</span>';}).join('');
      return '<button class="roadciv '+(complete?'complete ':'')+(current?'current ':'')+(open?'':'locked')+'" data-road-civ="'+c.order+'" '+(open?'':'disabled')+'>'+(current?'<span class="roadflag">🚩</span>':'')+'<span class="roadicon">'+routeIcons[i]+'</span><span class="roadname"><b>'+c.order+'. '+c.displayName+'</b><small>'+done+'/5 kingdoms'+(complete?' · CONQUERED':current?' · CURRENT FRONT':'')+'</small></span><span class="roadnodes">'+dots+'</span></button>';}).join('');
    showPanel('WORLD CRUSADE ROADMAP','<div class="roadsummary"><span>🏰 '+state.totalVictories+'/75 conquered</span><span>⚔ '+p.armyCap+'/500 army</span><span>🪙 '+p.passiveIncome.toFixed(1)+'/s income</span></div><div class="campaignroadmap">'+route+'</div><div class="roadlegend"><span>🚩 Current front</span><span>● Available</span><span>✓ Conquered</span><span>🔒 Locked</span></div><p class="note">Select a civilization to view its five kingdoms and leaders.'+(p.premium?' Premium access opens the full route; campaign accomplishments remain unearned.':' Conquer the ruler at Kingdom 5 to open the next civilization.')+'</p>');
    document.querySelectorAll('[data-road-civ]').forEach(b=>b.onclick=()=>renderCivilization(showPanel,+b.dataset.roadCiv));
  }
  function renderCivilization(showPanel,civOrder){
    const civ=window.KW_DATA.byOrder(civOrder),nodes=civ.campaignKingdomIds.map(nodeById);
    const nav='<div class="campaignnav"><button id="campPrev" '+(civOrder<=1?'disabled':'')+'>◀</button><b>'+civ.order+'. '+civ.displayName+'</b><button id="campNext" '+(civOrder>=15?'disabled':'')+'>▶</button></div>';
    const cards=nodes.map(n=>{const open=unlocked(n),done=!!state.completed[n.id],c=state.crowns[n.id]||0;return '<button class="campaigncard '+(open?'':'locked')+'" data-campaign="'+n.id+'" '+(open?'':'disabled')+'><span><b>Kingdom '+n.kingdomNumber+'</b><small>'+n.leaderDisplayName+'</small><small>Primary enemy: '+n.primaryRole.replace('_',' ')+'</small></span><strong>'+(done?'★'.repeat(c)+'☆'.repeat(3-c):open?'BATTLE':'🔒')+'</strong></button>';}).join('');
    const p=progression(),siege=window.KWFinalSiege?.status?.(civOrder);showPanel('WORLD CRUSADE','<button class="campaignmapback" id="campaignRoadBack">↩ FULL CAMPAIGN ROADMAP</button>'+nav+'<p class="note">Conquer each kingdom in sequence. Every victory permanently improves your kingdom.</p><div class="campaigngrid">'+cards+'</div><button class="menubtn '+(siege?.unlocked&&!siege.finalFortressDestroyed?'primary':'')+'" id="finalSiegeBtn" '+(!siege?.unlocked||siege.finalFortressDestroyed?'disabled':'')+'>'+(siege?.finalFortressDestroyed?'✓ CIVILIZATION COMPLETELY CONQUERED':siege?.unlocked?'FINAL SIEGE · '+window.KWFolklore.byOrder(civOrder).fortress:'FINAL SIEGE · DEFEAT CAMPAIGN + ENDLESS RULER')+'</button><p class="note">Army cap: '+p.armyCap+'/500 · Income: '+p.passiveIncome.toFixed(1)+'/s'+(p.premium?' · PREMIUM ACCESS':'')+'</p>');
    document.getElementById('campaignRoadBack').onclick=()=>renderRoadmap(showPanel);document.getElementById('campPrev').onclick=()=>renderCivilization(showPanel,Math.max(1,civOrder-1));document.getElementById('campNext').onclick=()=>renderCivilization(showPanel,Math.min(15,civOrder+1));
    document.querySelectorAll('[data-campaign]').forEach(b=>b.onclick=()=>details(showPanel,b.dataset.campaign,civOrder));const fs=document.getElementById('finalSiegeBtn');if(fs&&!fs.disabled)fs.onclick=()=>window.KWEquipment?KWEquipment.renderPreBattle(showPanel,()=>KWFinalSiege.start(civOrder),{civilization:civOrder,mode:'FINAL_SIEGE'}):KWFinalSiege.start(civOrder);
  }
  function details(showPanel,id,returnOrder){const n=nodeById(id),c=civFor(n),local=[10,20,30,40,50][n.kingdomNumber-1];showPanel(c.displayName+' · KINGDOM '+n.kingdomNumber,'<h3>'+n.leaderDisplayName+'</h3><p><b>'+objectiveText[n.objective]+'</b></p><p>Primary enemy specialty: <b>'+n.primaryRole+'</b><br>Battle milestone: local wave '+local+'<br>First-clear gems: '+victoryGems[n.kingdomNumber-1]+'<br>Three-Crown bonus: '+masteryGems[n.kingdomNumber-1]+'</p><p class="note">Crowns: Victory · finish above 50% fort health · finish above 75% fort health.</p><button class="menubtn primary" id="startCampaignMission">START BATTLE</button><button class="menubtn" id="campaignMapBack">BACK TO CIVILIZATION</button><button class="menubtn" id="campaignRoadBack">FULL ROADMAP</button>');document.getElementById('startCampaignMission').onclick=()=>window.KWEquipment?KWEquipment.renderPreBattle(showPanel,()=>start(id),{civilization:c.order,mode:'CAMPAIGN'}):start(id);document.getElementById('campaignMapBack').onclick=()=>renderCivilization(showPanel,returnOrder);document.getElementById('campaignRoadBack').onclick=()=>renderRoadmap(showPanel);}
  window.KWRuntime?.events.on('wave_completed',e=>{if(S?.campaignMissionId&&!S.campaignResolved&&e.wave>=targetWave(nodeById(S.campaignMissionId)))finish('victory');});
  function render(showPanel){return renderRoadmap(showPanel);}
  window.KWCampaign=Object.freeze({state,nodeById,unlocked,targetWave,start,finish,render,renderRoadmap,renderCivilization,save,progression,premiumUnlocked});
})();
