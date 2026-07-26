(function(){
  'use strict';
  const NS='final-sieges';
  const fresh=()=>({schema:1,civilizations:{},active:null,claims:{}});
  function load(){const r=window.KWSave?.read?.(NS);return r?.ok?{...fresh(),...r.payload,civilizations:{...r.payload.civilizations},claims:{...r.payload.claims}}:fresh();}
  let state=load();
  function save(checkpoint=true){window.KWSave?.write?.(NS,state,checkpoint);}
  const record=order=>state.civilizations[order]||(state.civilizations[order]={campaignConquered:false,rulerDefeated:false,finalFortressDestroyed:false,bestTime:null});
  function syncCampaign(){for(const c of window.KW_DATA.civilizations){const r=record(c.order);r.campaignConquered=c.campaignKingdomIds.every(id=>!!window.KWCampaign?.state?.completed?.[id]);}save();}
  function status(order){syncCampaign();const r=record(order);return {...r,unlocked:r.campaignConquered&&r.rulerDefeated};}
  function start(order){const st=status(order);if(!st.unlocked||st.finalFortressDestroyed)return false;reset();S.civ=order;S.enemyCiv=order;S.wave=order*50;S.localWave=50;S.finalSiege=true;S.finalSiegeStart=0;S.castleMax=S.castleHP=12000+order*1500;S.gold=900;S.phase='inter';S.interT=1;state.active={order,startedAt:Date.now(),stage:0,fortressBracket:100};save();bakeCastles();rebakePlayer();document.getElementById('overlay').classList.add('hidden');document.getElementById('hub').classList.add('hidden');started=true;paused=false;follow=true;syncFollowBtn();showMsg('FINAL SIEGE · Destroy '+window.KWFolklore.byOrder(order).fortress+' while endless reinforcements attack!',4200);return true;}
  function checkpoint(){if(!S?.finalSiege||!state.active)return;const elapsed=S.time-(S.finalSiegeStart||0),stage=elapsed>=900?4:elapsed>=600?3:elapsed>=360?2:elapsed>=180?1:0,bracket=Math.max(0,Math.ceil(S.castleHP/S.castleMax*4)*25);if(stage!==state.active.stage||bracket!==state.active.fortressBracket){state.active.stage=stage;state.active.fortressBracket=bracket;state.active.gold=S.gold;save();}}
  function finish(order,seconds){const r=record(order);if(r.finalFortressDestroyed)return 0;r.finalFortressDestroyed=true;r.bestTime=r.bestTime==null?seconds:Math.min(r.bestTime,seconds);state.active=null;const rewardId='final-siege-'+order;if(!state.claims[rewardId]){state.claims[rewardId]=true;window.KWCommerce?.rewardCampaign?.(rewardId,100,'FINAL_FORTRESS_REWARD');}save();window.KWEquipment?.refreshEarned?.();return 100;}
  window.KWRuntime?.events.on('wave_completed',e=>{if(e.wave%50===0&&!S?.campaignMissionId){record(e.civilization).rulerDefeated=true;save();}});
  window.KWFinalSiege=Object.freeze({state,status,start,checkpoint,finish,syncCampaign});
})();
