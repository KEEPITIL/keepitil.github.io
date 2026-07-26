(function(){
  'use strict';
  const KEY='kingdom-wars-art-settings-v1';
  const ERAS=[
    {id:'tribal',material:'hide · wood · stone · bone',classification:'B',cloth:'#70502f',enemy:'#744033',metal:'#77736a',shield:'oval_hide',cadence:5.65,helmet:'fur_bone'},
    {id:'bronze',material:'bronze · linen · painted wood',classification:'B',cloth:'#9b6535',enemy:'#772f2a',metal:'#c48a3d',shield:'round_bronze',cadence:5.9,helmet:'conical'},
    {id:'hellenic',material:'bronze · linen · painted wood',classification:'A/B',cloth:'#31558a',enemy:'#8f2f2a',metal:'#c5a34a',shield:'aspis',cadence:5.35,helmet:'greek_crest'},
    {id:'roman',material:'iron · mail · leather · painted wood',classification:'A/B',cloth:'#8f2929',enemy:'#3e5269',metal:'#aeb4b8',shield:'scutum',cadence:5.8,helmet:'cheek_guard'},
    {id:'medieval',material:'mail · plate · heraldic cloth',classification:'B',cloth:'#526b89',enemy:'#722d32',metal:'#c5c9cc',shield:'heater',cadence:4.95,helmet:'kettle_bascinet'}
  ];
  let settings;try{settings={violence:'standard',reducedEffects:false,...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch(e){settings={violence:'standard',reducedEffects:false};}
  const era=n=>ERAS[Math.max(0,Math.min(4,(n||1)-1))];
  function setSetting(k,v){settings[k]=v;localStorage.setItem(KEY,JSON.stringify(settings));}
  function tunic(age,team){const p=era(age);return team===1?p.cloth:p.enemy;}
  function marchCadence(age){return era(age).cadence;}
  function defenseState(value,max){if(!max||value<=0)return 'broken';const r=value/max;return r>.65?'full':r>.3?'damaged':'critical';}
  function allowBlood(){return settings.violence==='standard';}
  function corpseLife(){return settings.violence==='minimal'?2.2:7;}
  function effectsScale(){return settings.reducedEffects?.55:1;}
  function drawShield(g,u,x,y,r,age){
    const p=era(age),ratio=u.shieldMax?u.shield/u.shieldMax:0,state=defenseState(u.shield,u.shieldMax),enemy=u.team===-1;
    g.save();g.translate(x,y);g.fillStyle=state==='broken'?'#655e52':(p.id==='tribal'?'#715137':p.id==='bronze'?'#a56c31':p.id==='hellenic'?(enemy?'#8b3630':'#31558a'):p.id==='roman'?(enemy?'#3d526a':'#962e2b'):(enemy?'#6f3035':'#526b89'));
    g.strokeStyle=p.id==='tribal'?'#4b3625':p.metal;g.lineWidth=1.35;
    g.beginPath();
    if(p.shield==='scutum'){const w=r*.72,h=r*1.12,q=r*.28;g.moveTo(-w+q,-h);g.quadraticCurveTo(-w,-h,-w,-h+q);g.lineTo(-w,h-q);g.quadraticCurveTo(-w,h,-w+q,h);g.lineTo(w-q,h);g.quadraticCurveTo(w,h,w,h-q);g.lineTo(w,-h+q);g.quadraticCurveTo(w,-h,w-q,-h);g.closePath();}
    else if(p.shield==='heater'){g.moveTo(-r,-r*.75);g.lineTo(r,-r*.75);g.lineTo(r*.72,r*.35);g.lineTo(0,r*1.18);g.lineTo(-r*.72,r*.35);g.closePath();}
    else g.ellipse(0,0,p.shield==='oval_hide'?r*.82:r,p.shield==='oval_hide'?r*1.12:r,0,0,7);
    g.fill();g.stroke();
    if(state!=='broken'){
      g.strokeStyle=enemy?'#d0c8b8':'#f0d06a';g.lineWidth=.85;g.beginPath();
      if(p.id==='tribal'){g.moveTo(-r*.55,0);g.lineTo(r*.55,0);g.moveTo(0,-r*.65);g.lineTo(0,r*.65);}
      else if(p.id==='bronze'){g.arc(0,0,r*.52,0,7);}
      else if(p.id==='hellenic'){g.moveTo(-r*.55,r*.25);g.lineTo(0,-r*.45);g.lineTo(r*.55,r*.25);}
      else if(p.id==='roman'){g.moveTo(-r*.45,-r*.55);g.quadraticCurveTo(0,0,r*.45,-r*.55);g.moveTo(-r*.45,r*.55);g.quadraticCurveTo(0,0,r*.45,r*.55);}
      else {g.moveTo(0,-r*.55);g.lineTo(0,r*.6);g.moveTo(-r*.5,0);g.lineTo(r*.5,0);}
      g.stroke();
    }
    if(ratio<.66){g.strokeStyle='#302b27';g.lineWidth=1;g.beginPath();g.moveTo(-r*.2,-r*.8);g.lineTo(r*.08,-r*.15);g.lineTo(-r*.25,r*.35);g.stroke();}
    if(ratio<.31){g.beginPath();g.moveTo(r*.65,-r*.45);g.lineTo(r*.05,r*.1);g.lineTo(r*.55,r*.65);g.moveTo(-r*.72,r*.1);g.lineTo(-r*.12,r*.22);g.stroke();}
    g.restore();
  }
  function drawHelmet(g,u,age){
    const p=era(age),armorRatio=u.armorMax?u.armor/u.armorMax:1;g.save();g.fillStyle=p.metal;g.strokeStyle='#332f29';g.lineWidth=.8;g.beginPath();
    if(p.id==='tribal'){g.moveTo(-5,-28);g.lineTo(-2,-34);g.lineTo(0,-29);g.lineTo(3,-35);g.lineTo(5,-28);g.closePath();}
    else {g.arc(0,-26,6.4,Math.PI*.94,Math.PI*2.06);if(p.id==='roman'){g.lineTo(5,-22);g.lineTo(3.4,-19.5);g.moveTo(-5,-22);g.lineTo(-3.4,-19.5);}if(p.id==='medieval'){g.moveTo(-7,-25);g.lineTo(7,-25);}if(p.id==='hellenic'){g.moveTo(-1,-32);g.quadraticCurveTo(2,-37,5,-32);}}
    g.fill();g.stroke();
    if(armorRatio<.5){g.strokeStyle='#423a32';g.beginPath();g.moveTo(-2,-30);g.lineTo(1,-25);g.lineTo(-1,-22);g.stroke();}
    g.restore();
  }
  function impact(kind,x,y){return {kind,x,y,t:0};}
  const references=Object.freeze({tribal:{classification:'B',sources:['Museum and archaeological references required before final production']},bronze:{classification:'B',sources:['Composite Bronze Kingdom; historically plausible materials']},hellenic:{classification:'A/B',sources:['Metropolitan Museum — Warfare in Ancient Greece']},roman:{classification:'A/B',sources:['British Museum — Legion: life in the Roman army']},medieval:{classification:'A/B',sources:['Royal Armouries — Hundred Years War']}});
  function validate(){if(ERAS.length!==5)throw Error('Art registry requires five eras');for(const p of ERAS)for(const k of ['id','material','classification','cloth','enemy','metal','shield','cadence','helmet'])if(p[k]==null)throw Error(p.id+' missing '+k);return true;}
  window.KWArt=Object.freeze({eras:Object.freeze(ERAS.map(Object.freeze)),references,era,tunic,marchCadence,defenseState,drawShield,drawHelmet,impact,allowBlood,corpseLife,effectsScale,setSetting,get settings(){return {...settings};},validate});
  window.KWArt.validate();
})();
