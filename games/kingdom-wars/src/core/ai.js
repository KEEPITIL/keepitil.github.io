(function(){
  'use strict';
  const STATES=['SPAWNING','FORMING','HOLDING','MARCHING','RETREATING','SEEKING_TARGET','APPROACHING_TARGET','ATTACKING','BLOCKING','KITING','FLANKING','REGROUPING','FLEEING','FORT_ATTACKING','STAGGERED','KNOCKED_DOWN','DYING','DEAD'];
  const PRIORITY=Object.freeze(Object.fromEntries(STATES.map((s,i)=>[s,STATES.length-i])));
  const PROFILES=Object.freeze([
    {id:'TRIBAL',reactionDelay:.42,reevaluate:.60,readiness:.55,pursuit:280,retreat:.25,flank:.55,rangedProtection:.25,targetQuality:.35,coordination:.30,signature:'HUNTING_RUSH'},
    {id:'BRONZE',reactionDelay:.35,reevaluate:.50,readiness:.65,pursuit:240,retreat:.45,flank:.50,rangedProtection:.55,targetQuality:.55,coordination:.45,signature:'PALACE_LINE'},
    {id:'HELLENIC',reactionDelay:.26,reevaluate:.42,readiness:.80,pursuit:190,retreat:.78,flank:.45,rangedProtection:.82,targetQuality:.78,coordination:.80,signature:'PHALANX_PUSH'},
    {id:'ROMAN',reactionDelay:.22,reevaluate:.35,readiness:.78,pursuit:210,retreat:.92,flank:.82,rangedProtection:.92,targetQuality:.92,coordination:.94,signature:'LINE_ROTATION'},
    {id:'MEDIEVAL',reactionDelay:.24,reevaluate:.38,readiness:.82,pursuit:180,retreat:.90,flank:.68,rangedProtection:.92,targetQuality:.92,coordination:.82,signature:'SIEGE_PREPARATION'}
  ]);
  const rangedWeapon=w=>w==='bow'||w==='gun'||w==='laser';
  function profile(level){return PROFILES[Math.max(0,Math.min(4,(level||1)-1))];}
  function setState(u,next,force){
    if(!PRIORITY[next])return false;
    if(!force&&u.aiState&&PRIORITY[u.aiState]>PRIORITY[next]&&['DEAD','DYING','STAGGERED','KNOCKED_DOWN'].includes(u.aiState))return false;
    if(u.aiState!==next){u.aiState=next;u.aiStateT=0;}return true;
  }
  function syncState(u,ctx){
    u.aiStateT=(u.aiStateT||0)+(ctx.dt||0);
    if(u.hp<=0)return setState(u,'DEAD',true);
    if((u.staggerT||0)>0)return setState(u,'STAGGERED',true);
    if(u.blockT>0||u.shieldUp&&ctx.threatened)return setState(u,'BLOCKING',true);
    if(ctx.retreating)return setState(u,'RETREATING',true);
    if(u.anim>0)return setState(u,'ATTACKING',true);
    if(u.pose==='walk'){
      if(u.tgt)return setState(u,'APPROACHING_TARGET',true);
      return setState(u,ctx.forming?'FORMING':'MARCHING',true);
    }
    if(u.tgt)return setState(u,'SEEKING_TARGET',true);
    return setState(u,'HOLDING',true);
  }
  function roleOf(u,types){return (types[u.type]&&types[u.type].role)||'ASSAULT';}
  function effectiveHealth(o){return Math.max(0,o.hp||0)+Math.max(0,o.armor||0)+Math.max(0,o.shield||0);}
  function selectTargets(units,types,projectiles,time,civForTeam){
    const claims=new Map(),incoming=new Map();
    for(const p of projectiles||[]){if(p.tg&&p.tg.hp>0)incoming.set(p.tg,(incoming.get(p.tg)||0)+(p.dmg||0));}
    for(const u of units){if(u.hp<=0)continue;if(u.tgt&&u.tgt.hp>0&&u.tgt.team!==u.team)claims.set(u.tgt,(claims.get(u.tgt)||0)+1);else u.tgt=null;}
    for(const u of units){
      if(u.hp<=0)continue;
      const own=types[u.type]||{},melee=!rangedWeapon(own.weapon),prof=profile(civForTeam(u.team));
      if(u.tgt&&time<Math.max(u.aiRetargetAt||0,u.aiCommitUntil||0))continue;
      if(u.tgt)claims.set(u.tgt,Math.max(0,(claims.get(u.tgt)||1)-1));
      const candidates=[];
      for(const o of units){if(o.team!==u.team&&o.hp>0)candidates.push({o,d:Math.hypot(o.x-u.x,(o.y-u.y)*1.6)});}
      candidates.sort((a,b)=>a.d-b.d);candidates.length=Math.min(16,candidates.length);
      let best=u.tgt,bestScore=-1e9,currentScore=-1e9;
      for(const c of candidates){
        const o=c.o,targetRole=roleOf(o,types),count=claims.get(o)||0;
        if(melee&&count>=4&&o!==u.tgt)continue;
        let role=0;
        if(own.role==='ASSAULT')role=targetRole==='RANGED'?40:targetRole==='SPECIALIST'?35:targetRole==='ELITE'?10:0;
        else if(own.role==='DEFENDER')role=targetRole==='ASSAULT'?35:targetRole==='ELITE'?25:targetRole==='RANGED'?-20:15;
        else if(own.role==='SPECIALIST')role=targetRole==='ELITE'?45:targetRole==='DEFENDER'?32:targetRole==='SPECIALIST'?20:0;
        else if(own.role==='RANGED')role=targetRole==='ASSAULT'?22:targetRole==='ELITE'?18:0;
        const distance=Math.max(0,40-c.d/Math.max(5,own.range||30)*12);
        const vulnerability=(1-o.hp/Math.max(1,o.max||o.hp))*18+(o.shield<=0?6:0)+(o.armor<=0?6:0)+(o.staggerT>0?8:0);
        const threat=(o.tgt===u?24:0)+(targetRole==='SPECIALIST'?8:0);
        const overcrowd=count*(melee?12:own.role==='SPECIALIST'?10:7);
        const overkill=(incoming.get(o)||0)>=effectiveHealth(o)?50:0;
        const score=distance+role*prof.targetQuality+vulnerability+threat-overcrowd-overkill-Math.abs(o.y-u.y)*.18;
        if(o===u.tgt)currentScore=score;
        if(score>bestScore){bestScore=score;best=o;}
      }
      if(u.tgt&&currentScore>-1e8&&best!==u.tgt&&bestScore<currentScore+20)best=u.tgt;
      if(u.tgt!==best)u.tgt=best;
      if(best)claims.set(best,(claims.get(best)||0)+1);
      u.aiTargetScore=Math.round(bestScore);u.aiRetargetAt=time+prof.reevaluate;u.aiCommitUntil=time+.8+prof.reevaluate*.7;
    }
  }
  window.KW_AI=Object.freeze({STATES:Object.freeze(STATES),PRIORITY,PROFILES,profile,setState,syncState,selectTargets});
})();
