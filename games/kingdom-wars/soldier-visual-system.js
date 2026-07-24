(function(){
  'use strict';
  const atlas=new Image();
  atlas.src='assets/characters/kingdom-wars-soldier-atlas-v1.png';
  const frames={1:0,2:1,5:2,6:3,8:4,9:5,11:6};
  const CELL=1983/7,SRC_H=793;

  function draw(ctx,u,age,scale,corpse,time){
    const frame=frames[age];
    if(frame===undefined||!atlas.complete||!atlas.naturalWidth||u.type==='aetherwing')return false;
    const x=u.x,y=u.y,face=u.face||(u.team===1?1:-1);
    const moving=!corpse&&u.pose==='walk';
    const cadence=(time||0)*5.1+(u.marchOffset||0);
    const step=moving?Math.sin(cadence):0;
    const attack=!corpse?(u.anim||0):0;
    const h=78*scale,w=h*(CELL/SRC_H);

    ctx.save();
    ctx.translate(x,y);
    if(corpse){ctx.globalAlpha=Math.max(0,1-(u.t||0)/7);ctx.rotate((u.team===1?-1:1)*Math.PI/2*Math.min(1,(u.t||0)/.28));}
    else{
      ctx.translate(attack*3*face,-Math.abs(step)*1.2);
      ctx.rotate(step*.018+attack*.045*face);
    }
    ctx.scale(face,1);
    ctx.drawImage(atlas,frame*CELL,0,CELL,SRC_H,-w*.5,-h,w,h);
    if(attack>0){
      ctx.globalAlpha=.6*attack;
      ctx.strokeStyle=age>=11?'#ffb43b':'#fff1b8';ctx.lineWidth=2.2;
      ctx.beginPath();ctx.arc(w*.22,-h*.48,15*scale,-1.2,.75);ctx.stroke();
    }
    ctx.restore();

    if(!corpse&&u.hp<u.max){
      const bw=Math.max(30,42*scale),by=y-h-6;
      ctx.fillStyle='rgba(0,0,0,.62)';ctx.fillRect(x-bw/2,by,bw,5);
      ctx.fillStyle=u.team===1?'#49a7ff':'#df5748';ctx.fillRect(x-bw/2,by,bw*Math.max(0,u.hp/u.max),5);
      if((u.shield||0)>0){ctx.fillStyle='#65c9ff';ctx.fillRect(x-bw/2,by-3,bw*Math.min(1,u.shield/(u.maxShield||u.shield)),2);}
      if((u.armor||0)>0){ctx.fillStyle='#d8b75a';ctx.fillRect(x-bw/2,by+6,bw*Math.min(1,u.armor/(u.maxArmor||u.armor)),2);}
    }
    return true;
  }

  window.KWSoldierVisual=Object.freeze({atlas,frames:Object.freeze(frames),draw});
})();
