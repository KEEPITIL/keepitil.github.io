(function(){
  'use strict';
  const KEY='kingdom-wars-commerce-v1';
  const CATALOG=[
    {id:'progression.full_unlock',name:'World Conquest Access',category:'FEATURED',rarity:'Legendary',cost:6000,acquisition:'Gem Store',icon:'🌍',description:'Opens all 15 civilization maps, all store inventory and full Endless readiness. Campaign victories, Crowns and first-clear rewards remain unearned.',kind:'entitlement',value:'#ffe06b'},
    {id:'hero.aetherwing',name:'Aetherwing Vanguard Bundle',category:'UNITS',rarity:'Mythic',cost:1800,acquisition:'Gem Store',icon:'🪽',description:'Unlocks the original Aetherwing Colossus siege-mech, its twin laser cannons and the matching Aetherwing army armor skin.',kind:'hero',value:'#79e8ff'},
    {id:'unit.aetherwing',name:'Aetherwing Army Armor',category:'UNITS',rarity:'Mythic',cost:0,acquisition:'Aetherwing Bundle',icon:'💠',description:'Cyan-white plated armor matching the Aetherwing Colossus.',kind:'army',value:'#dcecff'},
    {id:'banner.oak',name:'Oak Standard',category:'BANNERS',rarity:'Common',cost:40,acquisition:'Gem Store',icon:'🌳',description:'A woodland kingdom banner used in menus and your collection.',kind:'banner',value:'#5f8a45'},
    {id:'banner.sun',name:'Golden Sun Standard',category:'BANNERS',rarity:'Distinctive',cost:90,acquisition:'Gem Store',icon:'☀️',description:'A bright royal standard for your commander profile.',kind:'banner',value:'#e1ad36'},
    {id:'unit.forest',name:'Forest Guard Army',category:'UNITS',rarity:'Distinctive',cost:150,acquisition:'Gem Store',icon:'🟢',description:'Recolors every friendly field tunic in deep forest green.',kind:'army',value:'#316b45'},
    {id:'unit.royal',name:'Royal Guard Army',category:'UNITS',rarity:'Epic',cost:280,acquisition:'Gem Store',icon:'🟣',description:'Recolors every friendly field tunic in royal violet.',kind:'army',value:'#7045a8'},
    {id:'effect.ember',name:'Ember Projectile Trail',category:'EFFECTS',rarity:'Distinctive',cost:100,acquisition:'Gem Store',icon:'🔥',description:'Friendly arrows, spears and shots carry a warm ember accent.',kind:'effect',value:'#ff8a3d'},
    {id:'effect.frost',name:'Frost Projectile Trail',category:'EFFECTS',rarity:'Epic',cost:220,acquisition:'Gem Store',icon:'❄️',description:'Friendly projectiles carry a pale frost-blue accent.',kind:'effect',value:'#73ddff'},
    {id:'effect.royal',name:'Royal Projectile Trail',category:'EFFECTS',rarity:'Legendary',cost:430,acquisition:'Gem Store',icon:'✨',description:'Friendly projectiles carry an animated-looking gold accent.',kind:'effect',value:'#ffe06b'},
    {id:'fort.moss',name:'Mossbound Fortress',category:'FORTRESSES',rarity:'Epic',cost:350,acquisition:'Gem Store',icon:'🏰',description:'A collected fortress theme prepared for the modular castle art pass.',kind:'fort',value:'#72865b'},
    {id:'shield.solar',name:'Solar Shield Mark',category:'UNITS',rarity:'Common',cost:70,acquisition:'Gem Store',icon:'🛡️',description:'A golden shield emblem in your permanent cosmetic collection.',kind:'shield',value:'#e6bd45'},
    {id:'title.stone',name:'Stonewall Commander',category:'OWNED',rarity:'Common',cost:0,acquisition:'Earned',icon:'🏅',description:'Free launch title granted to every founding commander.',kind:'title',value:'Stonewall Commander'}
  ];
  const fresh=()=>({wallet:{currentBalance:0,lifetimeEarned:0,lifetimePurchased:0,lifetimeSpent:0,pendingTransactions:[],transactionHistory:[],lastServerBalance:0},ownership:['title.stone'],equipped:{army:null,effect:null,banner:null,fort:null,shield:null,title:'title.stone'},entitlements:{},rewardedWaves:[],migrationComplete:false});
  function load(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null')||fresh();return {...fresh(),...v,wallet:{...fresh().wallet,...v.wallet},equipped:{...fresh().equipped,...v.equipped}};}catch(e){return fresh();}}
  let state=load();
  const uid=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
  function save(){localStorage.setItem(KEY,JSON.stringify(state));}
  function transact(amount,type,sourceId,validationStatus='LOCAL_VERIFIED'){
    if(!Number.isFinite(amount)||!Number.isInteger(amount))return {ok:false,error:'INVALID_AMOUNT'};
    const before=state.wallet.currentBalance,after=before+amount;
    if(after<0)return {ok:false,error:'INSUFFICIENT_GEMS'};
    const tx={transactionId:uid(),profileId:'local-commander',timestamp:Date.now(),amount,transactionType:type,sourceId,balanceBefore:before,balanceAfter:after,platform:'web-pwa',appVersion:window.KWBuild?.appVersion||'0.12.0-alpha',validationStatus};
    state.wallet.currentBalance=after;
    if(amount>0&&type==='PURCHASE')state.wallet.lifetimePurchased+=amount;
    else if(amount>0)state.wallet.lifetimeEarned+=amount;
    if(amount<0)state.wallet.lifetimeSpent+=-amount;
    state.wallet.transactionHistory.push(tx);state.wallet.transactionHistory=state.wallet.transactionHistory.slice(-250);save();
    return {ok:true,transaction:tx,balance:after};
  }
  if(!state.migrationComplete){state.migrationComplete=true;transact(120,'MIGRATION','chapter6-foundation');}
  function rewardWave(wave){
    const local=((Math.max(1,wave)-1)%50)+1;
    if(local%10||state.rewardedWaves.includes(wave))return 0;
    state.rewardedWaves.push(wave);
    const milestoneRewards={10:1,20:2,30:3,40:4,50:10};
    const amount=milestoneRewards[local]+(wave===50?10:0);
    transact(amount,local===50?'RULER_MILESTONE_REWARD':'BOSS_MILESTONE_REWARD','wave-'+wave);
    return amount;
  }
  function rewardMission(id,amount=5){
    if(!id||state.rewardedWaves.includes('mission:'+id))return 0;
    state.rewardedWaves.push('mission:'+id);transact(amount,'MISSION_REWARD',id);return amount;
  }
  function rewardCampaign(id,amount,type='CAMPAIGN_REWARD'){
    const key='campaign:'+id;if(!id||state.rewardedWaves.includes(key))return 0;
    state.rewardedWaves.push(key);transact(amount,type,id);return amount;
  }
  const byId=id=>CATALOG.find(x=>x.id===id);
  function grantBundle(item){
    if(item.id==='progression.full_unlock'){
      state.entitlements[item.id]={grantedAt:Date.now(),source:'GEM_STORE',validationStatus:'LOCAL_VERIFIED'};
      state.entitlements['hero.aetherwing']={grantedAt:Date.now(),source:'WORLD_CONQUEST_ACCESS',validationStatus:'LOCAL_VERIFIED'};
      for(const x of CATALOG)if(!state.ownership.includes(x.id))state.ownership.push(x.id);
    }else if(item.id==='hero.aetherwing'){
      state.entitlements[item.id]={grantedAt:Date.now(),source:'GEM_STORE',validationStatus:'LOCAL_VERIFIED'};
      for(const id of ['hero.aetherwing','unit.aetherwing'])if(!state.ownership.includes(id))state.ownership.push(id);
      state.equipped.army='unit.aetherwing';
    }else state.ownership.push(item.id);
  }
  function buy(id){const item=byId(id);if(!item)return {ok:false,error:'ITEM_NOT_FOUND'};if(state.ownership.includes(id)||state.entitlements[id])return {ok:false,error:'ALREADY_OWNED'};if(item.cost<=0)return {ok:false,error:'NOT_FOR_SALE'};const paid=transact(-item.cost,'STORE_SPEND',id);if(!paid.ok)return paid;grantBundle(item);save();return {ok:true,item};}
  function equip(id){const item=byId(id);if(!item||!state.ownership.includes(id))return false;state.equipped[item.kind]=id;save();return true;}
  function color(kind,fallback){const item=byId(state.equipped[kind]);return item&&item.value||fallback;}
  function balance(){return state.wallet.currentBalance;}
  function renderStore(showPanel,initial='FEATURED'){
    const tabs=['FEATURED','EQUIPMENT','UNITS','FORTRESSES','EFFECTS','BANNERS','GEMS','OWNED'];
    function draw(tab){
      if(tab==='EQUIPMENT'&&window.KWEquipment){KWEquipment.render(showPanel,window.S?.civ||1);return;}
      const list=tab==='FEATURED'?CATALOG.filter(x=>['progression.full_unlock','hero.aetherwing','effect.ember','fort.moss'].includes(x.id)):tab==='OWNED'?CATALOG.filter(x=>state.ownership.includes(x.id)):CATALOG.filter(x=>x.category===tab);
      const cards=list.map(x=>{const owned=state.ownership.includes(x.id),equipped=state.equipped[x.kind]===x.id;return '<button class="shopcard" data-item="'+x.id+'"><span class="shopicon">'+x.icon+'</span><span><b>'+x.name+'</b><small>'+x.rarity+' · '+x.acquisition+'</small></span><strong>'+(equipped?'EQUIPPED':owned?'OWNED':'💎 '+x.cost)+'</strong></button>';}).join('')||'<p class="note">No items in this category yet.</p>';
      const gems=tab==='GEMS'?'<div class="commerceNotice"><b>Secure gem purchase</b><br>Stripe Checkout opens outside the game. Gems are credited only after server-verified payment.</div><div class="shopgrid">'+(window.KWStripe?.packs||[]).map(p=>'<button class="shopcard" data-gempack="'+p.id+'"><span class="shopicon">💎</span><span><b>'+p.gems+' Gems</b><small>'+p.label+'</small></span><strong>'+p.price+'</strong></button>').join('')+'</div>':'';
      showPanel('STORE · 💎 '+balance(),'<div class="shoptabs">'+tabs.map(t=>'<button data-tab="'+t+'" class="'+(t===tab?'selected':'')+'">'+t+'</button>').join('')+'</div>'+gems+'<div class="shopgrid">'+cards+'</div><p class="note">Cosmetic collections remain visual. Functional equipment is shown in EQUIPMENT with exact attributes, compatibility and its free unlock route. Gold is never sold.</p>');
      document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>draw(b.dataset.tab));
      document.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>details(b.dataset.item,tab));
      document.querySelectorAll('[data-gempack]').forEach(b=>b.onclick=()=>window.KWStripe?.purchase?.(b.dataset.gempack));
    }
    function details(id,backTab){const x=byId(id),owned=state.ownership.includes(id),equipped=state.equipped[x.kind]===id;showPanel(x.icon+' '+x.name,'<div class="cosmeticPreview" style="--preview:'+x.value+'"><span>'+x.icon+'</span></div><p><b>'+x.rarity+'</b> · '+x.acquisition+'</p><p>'+x.description+'</p><p><b>Visible:</b> '+(x.kind==='army'?'on every friendly field soldier':x.kind==='effect'?'on friendly battlefield projectiles':'in your cosmetic collection and future matching art slot')+'</p><p class="commerceLabel">COSMETIC ONLY<br><small>No damage, health, range, movement or AI changes.</small></p><button class="menubtn primary" id="commerceAction">'+(equipped?'EQUIPPED':owned?'EQUIP':'BUY FOR 💎 '+x.cost)+'</button><button class="menubtn" id="commerceBack">BACK TO STORE</button>');
      document.getElementById('commerceBack').onclick=()=>draw(backTab);
      document.getElementById('commerceAction').onclick=()=>{if(equipped)return;if(owned){equip(id);details(id,backTab);return;}if(balance()<x.cost){alert('You need '+(x.cost-balance())+' more gems. Open the GEMS tab to purchase a secure Stripe gem pack.');return;}if(!confirm('Purchase '+x.name+' for '+x.cost+' gems? Your remaining balance will be '+(balance()-x.cost)+' gems.'))return;const r=buy(id);if(!r.ok){alert(r.error);return;}if(x.kind==='army')equip(id);details(id,backTab);};
    }
    draw(initial);
  }
  function transactionHistory(){return state.wallet.transactionHistory.slice().reverse();}
  function spendGems(amount,sourceId){return transact(-Math.max(0,Math.round(amount||0)),'EQUIPMENT_SPEND',sourceId);}
  function renderHistory(showPanel){const rows=transactionHistory().map(t=>'<div class="storeitem"><span>'+t.transactionType+'<small class="menusub">'+new Date(t.timestamp).toLocaleString()+' · '+t.sourceId+'</small></span><b>'+(t.amount>0?'+':'')+t.amount+' 💎</b></div>').join('');showPanel('GEM TRANSACTION HISTORY',rows||'<p class="note">No gem transactions yet.</p>');}
  function hasEntitlement(id){return !!state.entitlements[id];}
  function grantEntitlement(id,source='LOCAL_MIGRATION'){if(!id||state.entitlements[id])return false;state.entitlements[id]={grantedAt:Date.now(),source,validationStatus:'LOCAL_ONLY'};save();return true;}
  window.KWCommerce=Object.freeze({catalog:Object.freeze(CATALOG.map(Object.freeze)),balance,rewardWave,rewardMission,rewardCampaign,spendGems,buy,equip,color,renderStore,renderHistory,transactionHistory,hasEntitlement,grantEntitlement});
})();
