(function(){
  'use strict';
  const KEY='kingdom-wars-audio-v1';
  const defaults={master:1,music:.65,effects:.85,voice:.9,ambience:.45,ui:.75,haptics:true,reducedDensity:false,commandText:true,dynamicRange:'standard',debug:false};
  let settings;try{settings={...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch(e){settings={...defaults};}
  const GROUPS=['MASTER','MUSIC','AMBIENCE','UI','PLAYER_WEAPONS','ENEMY_WEAPONS','PROJECTILES','IMPACTS','FORTRESS','BOSSES','VOICE','REWARDS'];
  const CIVS=[
    {id:'tribal',root:110,scale:[1,1.2,1.5,1.8],wave:'square',tempo:92,command:120},
    {id:'bronze',root:130.8,scale:[1,1.25,1.5,1.875],wave:'triangle',tempo:98,command:330},
    {id:'hellenic',root:146.8,scale:[1,1.125,1.5,1.6875],wave:'triangle',tempo:104,command:440},
    {id:'roman',root:123.5,scale:[1,1.25,1.5,2],wave:'sawtooth',tempo:110,command:185},
    {id:'medieval',root:98,scale:[1,1.2,1.5,1.8],wave:'triangle',tempo:86,command:147}
  ];
  const META={
    'ui.tap':{group:'UI',priority:70,max:3,delay:.04},'ui.error':{group:'UI',priority:30,max:2,delay:.15},
    'unit.recruit':{group:'VOICE',priority:65,max:2,delay:.12},'unit.attack.sword':{group:'PLAYER_WEAPONS',priority:80,max:5,delay:.065},
    'unit.attack.arrow':{group:'PROJECTILES',priority:80,max:5,delay:.08},'unit.attack.gun':{group:'PLAYER_WEAPONS',priority:55,max:4,delay:.09},
    'unit.attack.laser':{group:'PLAYER_WEAPONS',priority:45,max:4,delay:.1},'unit.block.shield':{group:'IMPACTS',priority:60,max:5,delay:.055},
    'unit.break.shield':{group:'IMPACTS',priority:25,max:3,delay:.12,haptic:[35]},'unit.hit.armor':{group:'IMPACTS',priority:62,max:5,delay:.055},
    'unit.break.armor':{group:'IMPACTS',priority:30,max:3,delay:.12,haptic:[45]},'unit.hit.health':{group:'IMPACTS',priority:75,max:4,delay:.07},
    'formation.march':{group:'AMBIENCE',priority:145,max:1,delay:.38},'formation.retreat':{group:'VOICE',priority:12,max:1,delay:.4,haptic:[20]},
    'ui.command.defend':{group:'VOICE',priority:12,max:1,delay:.18,haptic:[16]},'ui.command.march':{group:'VOICE',priority:12,max:1,delay:.18,haptic:[16]},
    'ui.command.attack':{group:'VOICE',priority:12,max:1,delay:.18,haptic:[16]},'ui.command.reverse':{group:'VOICE',priority:12,max:1,delay:.18,haptic:[16]},
    'power.warning':{group:'PROJECTILES',priority:15,max:2,delay:.15,haptic:[15,25,15]},'power.impact':{group:'IMPACTS',priority:18,max:3,delay:.12,haptic:[65]},
    'fortress.hit':{group:'FORTRESS',priority:40,max:3,delay:.15},'fortress.critical':{group:'FORTRESS',priority:8,max:1,delay:12,haptic:[40,70,40]},
    'fortress.destroy':{group:'FORTRESS',priority:4,max:1,delay:2,haptic:[90,50,120]},'reward.gold':{group:'REWARDS',priority:120,max:1,delay:.25},
    'wave.start':{group:'VOICE',priority:20,max:1,delay:.5},'civilization.transition':{group:'REWARDS',priority:6,max:1,delay:2,haptic:[35,40,35,40,70]},
    'victory':{group:'REWARDS',priority:3,max:1,delay:2,haptic:[40,40,80]},'defeat':{group:'REWARDS',priority:3,max:1,delay:2,haptic:[90]}
  };
  let ac=null,master=null,musicBus=null,state='MENU',targetState='MENU',intensity=0,lastState=0,nextBeat=0,last={},active=[],dropped=0,fortLevel=0,lastMarch=0;
  const recent=[];const maxVoices=()=>settings.reducedDensity?20:32;
  function save(){try{localStorage.setItem(KEY,JSON.stringify(settings));}catch(e){}}
  function context(){if(!ac){try{ac=new (window.AudioContext||window.webkitAudioContext)();master=ac.createGain();master.connect(ac.destination);musicBus=ac.createGain();musicBus.connect(master);applyMix();}catch(e){}}if(ac&&ac.state==='suspended')ac.resume().catch(()=>{});return ac;}
  function applyMix(){if(!ac||!master)return;let m=settings.master;if(settings.dynamicRange==='night')m*=.72;master.gain.setTargetAtTime(m,ac.currentTime,.03);musicBus.gain.setTargetAtTime(settings.music,ac.currentTime,.08);}
  function busLevel(group){if(group==='MUSIC')return settings.music;if(group==='AMBIENCE')return settings.ambience;if(group==='UI')return settings.ui;if(group==='VOICE')return settings.voice;return settings.effects;}
  function tone(freq,dur,wave,vol,slide,group,when){const c=context();if(!c||settings.master<=0)return;const o=c.createOscillator(),g=c.createGain(),t=when==null?c.currentTime:when;o.type=wave||'triangle';o.frequency.setValueAtTime(Math.max(28,freq),t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(28,slide),t+dur);const peak=Math.max(.0001,(vol||.05)*busLevel(group||'IMPACTS'));g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(group==='MUSIC'?musicBus:master);o.start(t);o.stop(t+dur+.02);}
  function noise(dur,vol,group,filterFreq){const c=context();if(!c)return;const n=Math.max(1,Math.floor(c.sampleRate*dur)),b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n);const s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();s.buffer=b;f.type='lowpass';f.frequency.value=filterFreq||1800;g.gain.value=(vol||.05)*busLevel(group||'IMPACTS');s.connect(f);f.connect(g);g.connect(master);s.start();}
  function haptic(pattern){if(settings.haptics&&navigator.vibrate)try{navigator.vibrate(pattern);}catch(e){}}
  function synth(id,p){const civ=CIVS[Math.max(0,Math.min(4,(p.civ||1)-1))],enemy=p.team===-1,base=enemy?civ.root*.84:civ.root;
    if(id==='ui.tap')tone(620,.045,'sine',.025,760,'UI');else if(id==='ui.error')tone(170,.13,'square',.045,120,'UI');
    else if(id==='unit.recruit'){tone(base*2,.08,civ.wave,.045,base*3,'VOICE');tone(base*3,.09,civ.wave,.035,null,'VOICE',ac.currentTime+.07);}
    else if(id.includes('attack.arrow')){noise(.035,.028,'PROJECTILES',2600);tone(760,.055,'triangle',.025,310,'PROJECTILES');}
    else if(id.includes('attack.gun')){noise(.08,.12,'PLAYER_WEAPONS',1500);tone(130,.08,'square',.04,55,'PLAYER_WEAPONS');}
    else if(id.includes('attack.laser'))tone(1250,.14,'sawtooth',.055,260,'PLAYER_WEAPONS');
    else if(id.includes('attack.sword')){noise(.035,.04,enemy?'ENEMY_WEAPONS':'PLAYER_WEAPONS',3400);tone(540,.05,'triangle',.025,310,enemy?'ENEMY_WEAPONS':'PLAYER_WEAPONS');}
    else if(id==='unit.block.shield'){tone(p.material==='hide'?105:240,.12,'triangle',.065,p.material==='hide'?75:170,'IMPACTS');noise(.06,.045,'IMPACTS',700);}
    else if(id==='unit.break.shield'){noise(.18,.11,'IMPACTS',1150);tone(190,.22,'square',.07,70,'IMPACTS');}
    else if(id==='unit.hit.armor'){tone(civ.id==='tribal'?150:410,.07,'triangle',.055,260,'IMPACTS');noise(.04,.025,'IMPACTS',2400);}
    else if(id==='unit.break.armor'){tone(460,.2,'triangle',.075,120,'IMPACTS');noise(.17,.08,'IMPACTS',1800);}
    else if(id==='unit.hit.health')noise(.06,.045,'IMPACTS',520);else if(id==='formation.march'){tone(68,.09,'sine',.04,45,'AMBIENCE');noise(.07,.025,'AMBIENCE',320);}
    else if(id.startsWith('ui.command')||id==='formation.retreat'){tone(civ.command,.25,civ.wave,.075,civ.command*.7,'VOICE');tone(civ.command*1.5,.16,'triangle',.04,null,'VOICE',ac.currentTime+.08);}
    else if(id==='power.warning')tone(260,.28,'sawtooth',.055,90,'PROJECTILES');
    else if(id==='power.impact'||id==='fortress.destroy'){noise(.42,.19,'FORTRESS',900);tone(78,.45,'sawtooth',.11,36,'FORTRESS');}
    else if(id==='fortress.hit'){noise(.16,.08,'FORTRESS',700);tone(95,.2,'triangle',.05,52,'FORTRESS');}
    else if(id==='fortress.critical'){tone(180,.28,'square',.075,115,'FORTRESS');tone(180,.28,'square',.075,115,'FORTRESS',ac.currentTime+.38);}
    else if(id==='reward.gold')tone(880,.07,'sine',.035,1320,'REWARDS');else if(id==='wave.start')tone(civ.command,.4,civ.wave,.08,civ.command*.75,'VOICE');
    else if(id==='civilization.transition'||id==='victory'){[1,1.25,1.5,2].forEach((r,i)=>tone(base*3*r,.22,civ.wave,.055,null,'REWARDS',ac.currentTime+i*.13));}
    else if(id==='defeat')[1,.88,.72,.5].forEach((r,i)=>tone(base*2*r,.3,'sawtooth',.06,null,'REWARDS',ac.currentTime+i*.16));
  }
  function emit(id,p){p=p||{};const m=META[id]||{group:'IMPACTS',priority:100,max:3,delay:.08},now=performance.now()/1000;active=active.filter(x=>x.until>now);if(now-(last[id]||-99)<m.delay||active.filter(x=>x.id===id).length>=m.max){dropped++;return false;}if(active.length>=maxVoices()){let worst=-1,wp=-1;active.forEach((x,i)=>{if(x.priority>wp){wp=x.priority;worst=i;}});if(wp<=m.priority){dropped++;return false;}active.splice(worst,1);}last[id]=now;active.push({id,priority:m.priority,group:m.group,until:now+(p.duration||.45)});recent.unshift(id);recent.length=8;synth(id,p);if(m.haptic)haptic(m.haptic);return true;}
  function musicTick(now,civIndex){if(!ac||settings.music<=0||now<nextBeat)return;const c=CIVS[civIndex-1]||CIVS[0],beat=60/c.tempo,high=state==='HIGH_COMBAT'||state==='CRITICAL_COMBAT',combat=!['MENU','PREPARATION'].includes(state),step=Math.floor(now/beat)%c.scale.length;tone(c.root*c.scale[step],beat*.72,c.wave,.018,null,'MUSIC',now);if(combat)tone(c.root/2,beat*.35,'sine',.022,null,'MUSIC',now);if(high){noise(.055,.018,'MUSIC',480);tone(c.root*2,beat*.15,'square',.012,null,'MUSIC',now+beat/2);}nextBeat=now+beat;}
  function update(game,opts){if(!game)return;opts=opts||{};const enemies=(game.units||[]).filter(u=>u.team===-1&&u.hp>0).length,allies=(game.units||[]).filter(u=>u.team===1&&u.hp>0).length,threat=Math.min(1,enemies/Math.max(12,allies+8)),danger=1-Math.max(0,game.gateHP/game.gateMax),siege=Math.min(.2,(game.enemyCats||[]).length*.06),raw=Math.min(1,threat*.52+danger*.38+siege);intensity+=(raw-intensity)*Math.min(1,(opts.dt||.016)*.45);targetState=game.phase==='inter'?'PREPARATION':intensity>.75?'CRITICAL_COMBAT':intensity>.5?'HIGH_COMBAT':intensity>.2?'STANDARD_COMBAT':'LOW_COMBAT';const now=performance.now()/1000;if(targetState!==state&&now-lastState>12){state=targetState;lastState=now;}if(game.stance==='march'&&allies&&now-lastMarch>(settings.reducedDensity||opts.speed===3?.72:.42)){lastMarch=now;emit('formation.march',{civ:game.civ});}const frac=game.gateHP/game.gateMax,next=frac<=.25?2:frac<=.5?1:0;if(next>fortLevel){fortLevel=next;if(next===2)emit('fortress.critical',{civ:game.civ});}if(next<fortLevel)fortLevel=next;musicTick(ac?ac.currentTime:0,game.civ||1);renderDebug(game,opts);}
  function renderDebug(game,opts){let el=document.getElementById('audioDebug');if(!settings.debug){if(el)el.remove();return;}if(!el){el=document.createElement('pre');el.id='audioDebug';el.style.cssText='position:fixed;right:8px;top:52px;z-index:99;background:#071019dd;color:#bff;padding:8px;border:1px solid #6cc;border-radius:7px;font:11px monospace;pointer-events:none';document.body.appendChild(el);}el.textContent='AUDIO DEBUG\nvoices '+active.length+'/'+maxVoices()+'  dropped '+dropped+'\nstate '+state+'  intensity '+intensity.toFixed(2)+'\ncivilization '+(CIVS[(game.civ||1)-1]||CIVS[0]).id+'  speed '+(opts.speed||1)+'x\nlistener '+Math.round(opts.camera||0)+'\nrecent\n'+recent.join('\n');}
  function set(k,v){if(!(k in defaults))return false;settings[k]=typeof defaults[k]==='number'?Math.max(0,Math.min(1,Number(v))):v;save();applyMix();return true;}
  function suspend(){if(ac&&ac.state==='running')return ac.suspend();}function resume(){const c=context();if(c&&c.state==='suspended')return c.resume();}
  document.addEventListener('visibilitychange',()=>document.hidden?suspend():null);window.addEventListener('pagehide',suspend);window.addEventListener('keydown',e=>{if(e.key==='\\')set('debug',!settings.debug);});
  window.KWAudio=Object.freeze({groups:Object.freeze(GROUPS),events:Object.freeze(META),civilizations:Object.freeze(CIVS),emit,update,set,suspend,resume,unlock:context,haptic,get settings(){return{...settings};},get debug(){return{active:active.length,dropped,state,intensity,recent:[...recent]};}});
})();
