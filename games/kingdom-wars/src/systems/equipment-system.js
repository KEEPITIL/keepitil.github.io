(function(){
  'use strict';
  const KEY='kingdom-wars-equipment-v2',SCHEMA=2;
  const ROLES=['DEFENDER','ASSAULT','RANGED','SPECIALIST','ELITE'];
  const SLOTS=['weapon','armor','helmet','shield','boots','ammunition'];
  const PRESETS=['Balanced','Siege','Anti-Ranged','Anti-Monster','Custom'];
  const identity=[
    ['Flint','Hide','Bone','Wood'],['Bronze','Sun','Chariot','Bull'],['Royal Bronze','Tomb','Serpent','Scarab'],['Black Iron','Forge','Ash','Warlord'],['Hoplite','Dory','Linothorax','Corinthian'],['Gladius','Scutum','Segmentata','Eagle'],['Runic','Mist','Bog','Guardian'],['Viking Axe','Round Shield','Chainmail','Frost'],['Longbow','Plate','Royal','Wyrm'],['Yari','Yumi','Lamellar','Oni'],['Pike','Arquebus','Powder','Alchemist'],['Musket','Grenadier','Officer','Phantom'],['Rifle','Engineer','Steam','Prototype'],['Assault','Tactical','Composite','Operator'],['Plasma','Railgun','Astral','Void']
  ];
  const slotStats={
    weapon:[['damage',.06],['attackSpeed',.04]],armor:[['hp',.06],['rangedResist',.04]],helmet:[['rangedResist',.05],['morale',.03]],
    shield:[['shield',.08],['formationDefense',.03],['speed',-.02]],boots:[['speed',.06],['acceleration',.04]],ammunition:[['range',.06],['armorPen',.04],['attackSpeed',-.02]]
  };
  const roleForSlot={weapon:['ASSAULT','DEFENDER','ELITE'],armor:ROLES,helmet:ROLES,shield:['DEFENDER','ELITE'],boots:ROLES,ammunition:['RANGED','SPECIALIST']};
  const title=s=>s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  function makeCatalog(){
    const civs=window.KW_DATA?.civilizations||[];
    return civs.flatMap((c,ci)=>SLOTS.map((slot,si)=>{
      const theme=identity[ci][si%identity[ci].length],mods=slotStats[slot].map(([stat,value])=>({stat,operation:'add',value}));
      return Object.freeze({id:c.id+'.'+slot, name:theme+' '+title(slot),civilizationId:c.id,civilizationOrder:c.order,compatibleRoles:Object.freeze(roleForSlot[slot]),slot,
        rarity:si===3?'ruler':'standard',visualAssetId:'equipment_'+c.region+'_'+slot,visual:{color:c.palette[1],accent:c.palette[2],shape:c.region+'_'+slot},
        unlock:Object.freeze({type:si===3?'campaign_crowns':'campaign_victory',kingdomId:c.campaignKingdomIds[Math.min(si,4)],crownsRequired:si===3?2:1,label:si===3?'Complete Kingdom 4 with two Crowns':'Conquer '+c.displayName+' Kingdom '+(Math.min(si,4)+1)}),
        store:Object.freeze({gemPrice:180+c.order*20+si*25,directPurchaseProductId:c.id+'_'+slot}),modifiers:Object.freeze(mods),powerScore:Math.round(mods.reduce((n,m)=>n+Math.max(0,m.value)*100,0))});
    }));
  }
  const CATALOG=makeCatalog();
  const byId=id=>CATALOG.find(x=>x.id===id);
  const defaults=()=>Object.fromEntries(ROLES.map(r=>[r,Object.fromEntries(SLOTS.map(s=>[s,null]))]));
  const fresh=()=>({schema:SCHEMA,owned:[],selected:0,loadouts:PRESETS.map(name=>({name,roles:defaults(),fortressModules:[],battlefieldPower:null,tacticalCommand:name==='Siege'?'attack':name==='Anti-Ranged'?'defend':name==='Anti-Monster'?'march':'balanced'})),notices:[]});
  function load(){try{const old=JSON.parse(localStorage.getItem(KEY)||'null');return old?{...fresh(),...old,loadouts:PRESETS.map((name,i)=>({...fresh().loadouts[i],...(old.loadouts?.[i]||{})}))}:fresh();}catch(e){return fresh();}}
  let state=load();
  function save(){state.schema=SCHEMA;localStorage.setItem(KEY,JSON.stringify(state));}
  function campaignState(){return window.KWCampaign?.state||{};}
  function earned(item){if(!item)return false;const c=campaignState(),done=!!c.completed?.[item.unlock.kingdomId],crowns=c.crowns?.[item.unlock.kingdomId]||0;return done&&crowns>=item.unlock.crownsRequired;}
  function refreshEarned(){const added=[];for(const x of CATALOG)if(earned(x)&&!state.owned.includes(x.id)){state.owned.push(x.id);added.push(x.id);}if(added.length)save();return added;}
  function owned(id){return !!byId(id)&&(state.owned.includes(id)||earned(byId(id)));}
  function compatible(item,role,civOrder){return !!item&&item.civilizationOrder===civOrder&&item.compatibleRoles.includes(role);}
  function equip(loadoutIndex,role,slot,id,civOrder){const x=byId(id);if(!owned(id)||x.slot!==slot||!compatible(x,role,civOrder))return {ok:false,error:'INCOMPATIBLE_OR_LOCKED'};state.loadouts[loadoutIndex].roles[role][slot]=id;save();return {ok:true};}
  function buy(id){const x=byId(id);if(!x)return {ok:false,error:'ITEM_NOT_FOUND'};if(owned(id))return {ok:false,error:'ALREADY_OWNED'};const paid=window.KWCommerce?.spendGems?.(x.store.gemPrice,'equipment:'+id);if(!paid?.ok)return paid||{ok:false,error:'COMMERCE_UNAVAILABLE'};state.owned.push(id);save();return {ok:true,item:x};}
  function validate(civOrder=1){refreshEarned();let changed=false;for(const loadout of state.loadouts)for(const role of ROLES)for(const slot of SLOTS){const id=loadout.roles?.[role]?.[slot];if(id&&(!owned(id)||!compatible(byId(id),role,civOrder))){loadout.roles[role][slot]=null;changed=true;}}if(changed){state.notices.push('Some incompatible equipment was safely removed.');save();}return !changed;}
  const cap=(v,min,max)=>Math.max(min,Math.min(max,v));
  function modifiersFor(role,civOrder,loadoutIndex=state.selected){validate(civOrder);const out={damage:1,hp:1,shield:1,armor:1,speed:1,acceleration:1,attackSpeed:1,range:1,rangedResist:0,meleeResist:0,explosionResist:0,formationDefense:0,armorPen:0,morale:0,items:[]};const row=state.loadouts[loadoutIndex]?.roles?.[role]||{};for(const id of Object.values(row)){const x=byId(id);if(!x||!compatible(x,role,civOrder))continue;out.items.push(x);for(const m of x.modifiers){if(['rangedResist','meleeResist','explosionResist','formationDefense','armorPen','morale'].includes(m.stat))out[m.stat]+=m.value;else out[m.stat]=(out[m.stat]||1)+m.value;}}
    out.damage=cap(out.damage,.7,1.35);out.hp=cap(out.hp,.7,1.25);out.shield=cap(out.shield,.7,1.25);out.armor=cap(out.armor,.7,1.25);out.speed=cap(out.speed,.7,1.35);out.acceleration=cap(out.acceleration,.7,1.35);out.attackSpeed=cap(out.attackSpeed,.7,1.4);out.range=cap(out.range,.7,1.15);out.rangedResist=cap(out.rangedResist,0,.6);out.meleeResist=cap(out.meleeResist,0,.6);out.explosionResist=cap(out.explosionResist,0,.6);return out;
  }
  const statLabel=m=>{const pct=Math.round(Math.abs(m.value)*100),sign=m.value>=0?'+':'-';return sign+pct+'% '+title(m.stat);};
  function itemCard(x,role,civOrder){const isOwned=owned(x.id),can=compatible(x,role,civOrder);return '<button class="shopcard" data-equip="'+x.id+'" '+(!can?'disabled':'')+'><span class="shopicon">'+(x.slot==='weapon'?'⚔️':x.slot==='armor'?'🦺':x.slot==='helmet'?'⛑️':x.slot==='shield'?'🛡️':x.slot==='boots'?'🥾':'🏹')+'</span><span><b>'+x.name+'</b><small>'+x.modifiers.map(statLabel).join(' · ')+'<br>'+x.compatibleRoles.join(', ')+' · Free: '+x.unlock.label+'</small></span><strong>'+(isOwned?'OWNED':'💎 '+x.store.gemPrice)+'</strong></button>';}
  function render(showPanel,civOrder=1){refreshEarned();validate(civOrder);let role='DEFENDER';function draw(){const civ=window.KW_DATA.byOrder(civOrder),lo=state.loadouts[state.selected],items=CATALOG.filter(x=>x.civilizationOrder===civOrder);showPanel('ARMORY · '+lo.name,'<div class="shoptabs">'+PRESETS.map((n,i)=>'<button data-loadout="'+i+'" class="'+(i===state.selected?'selected':'')+'">'+n+'</button>').join('')+'</div><div class="shoptabs">'+ROLES.map(r=>'<button data-role="'+r+'" class="'+(r===role?'selected':'')+'">'+r+'</button>').join('')+'</div><p><b>'+civ.displayName+'</b> · Equipment is always earnable; Gems only unlock the identical item sooner.</p><div class="shopgrid">'+items.map(x=>itemCard(x,role,civOrder)).join('')+'</div><p class="note">Exact attributes, compatibility, free route and Gem price are shown on every item. No randomized loot boxes.</p>');document.querySelectorAll('[data-loadout]').forEach(b=>b.onclick=()=>{state.selected=+b.dataset.loadout;save();draw();});document.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{role=b.dataset.role;draw();});document.querySelectorAll('[data-equip]').forEach(b=>b.onclick=()=>{const x=byId(b.dataset.equip);if(!owned(x.id)){if(!confirm('Unlock '+x.name+' now for '+x.store.gemPrice+' Gems?\n\nFree route: '+x.unlock.label))return;const result=buy(x.id);if(!result.ok){alert(result.error);return;}}const result=equip(state.selected,role,x.slot,x.id,civOrder);if(!result.ok)alert(result.error);draw();});}draw();}
  function renderPreBattle(showPanel,onStart,opts={}){const civOrder=opts.civilization||1;validate(civOrder);const lo=state.loadouts[state.selected],summary=ROLES.map(role=>{const m=modifiersFor(role,civOrder);return '<div class="mission"><span><b>'+role+'</b><small class="menusub">'+(m.items.map(x=>x.name).join(', ')||'Standard issue')+'</small></span><b>'+Math.round((m.damage-1)*100)+'% DMG · '+Math.round((m.speed-1)*100)+'% SPD</b></div>';}).join('');showPanel('PRE-BATTLE LOADOUT','<p><b>'+lo.name+'</b> · '+window.KW_DATA.byOrder(civOrder).displayName+'</p>'+summary+'<button class="menubtn" id="editBattleLoadout">EDIT EQUIPMENT</button><button class="menubtn primary" id="confirmBattleLoadout">START BATTLE</button>');document.getElementById('editBattleLoadout').onclick=()=>render(showPanel,civOrder);document.getElementById('confirmBattleLoadout').onclick=onStart;}
  window.KWEquipment=Object.freeze({schema:SCHEMA,catalog:Object.freeze(CATALOG),roles:Object.freeze(ROLES),slots:Object.freeze(SLOTS),presets:Object.freeze(PRESETS),state,refreshEarned,owned,buy,equip,validate,modifiersFor,render,renderPreBattle});
})();
