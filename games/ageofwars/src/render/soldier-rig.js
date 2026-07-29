/* Kingdom Wars — shared soldier motion rig (namespaced as window.KWRig to avoid collisions). */
window.KWRig=(function(){
/* =========================================================================
   SHARED SOLDIER RIG (consolidated) + live battle
   ========================================================================= */
const UP=-Math.PI/2, DN=Math.PI/2;
const L={spine:46,neck:7,headR:11,thigh:33,shin:32,foot:10,uarm:22,farm:20};
function fk(p,a,l){return [p[0]+Math.cos(a)*l,p[1]+Math.sin(a)*l];}
function ss(e0,e1,x){const t=Math.max(0,Math.min(1,(x-e0)/(e1-e0)));return t*t*(3-2*t);}
function lerp(a,b,t){return a+(b-a)*t;}
function shade(hex,amt){const n=parseInt(hex.slice(1),16);let r=(n>>16)&255,g=(n>>8)&255,b=n&255;const f=amt<0?0:255,p=Math.abs(amt);r=Math.round(r+(f-r)*p);g=Math.round(g+(f-g)*p);b=Math.round(b+(f-b)*p);return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);}
function cyl(ctx,x0,x1,base,lit){const g=ctx.createLinearGradient(x0,0,x1,0);g.addColorStop(0,shade(base,-.34));g.addColorStop(.5,shade(base,lit==null?.3:lit));g.addColorStop(1,shade(base,-.34));return g;}
function vg(ctx,y0,y1,a,b){const g=ctx.createLinearGradient(0,y0,0,y1);g.addColorStop(0,a);g.addColorStop(1,b);return g;}
function limb(ctx,a,b,wa,wb,col){const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(a[0]+nx*wa,a[1]+ny*wa);ctx.lineTo(b[0]+nx*wb,b[1]+ny*wb);ctx.lineTo(b[0]-nx*wb,b[1]-ny*wb);ctx.lineTo(a[0]-nx*wa,a[1]-ny*wa);ctx.closePath();ctx.fill();ctx.beginPath();ctx.arc(a[0],a[1],wa,0,7);ctx.fill();ctx.beginPath();ctx.arc(b[0],b[1],wb,0,7);ctx.fill();}
function poly(ctx,pts,fill,st,lw){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(st){ctx.strokeStyle=st;ctx.lineWidth=lw||1;ctx.stroke();}}
function rot(pt,piv,a){const dx=pt[0]-piv[0],dy=pt[1]-piv[1];return [piv[0]+dx*Math.cos(a)-dy*Math.sin(a),piv[1]+dx*Math.sin(a)+dy*Math.cos(a)];}
function boot(ctx,an,toe,col){const dx=toe[0]-an[0],dy=toe[1]-an[1],a=Math.atan2(dy,dx),len=Math.hypot(dx,dy)||1;ctx.save();ctx.translate(an[0],an[1]);ctx.rotate(a);ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(-3,-4);ctx.lineTo(len+2,-2.2);ctx.quadraticCurveTo(len+4,1.2,len,3);ctx.lineTo(-3,3);ctx.closePath();ctx.fill();ctx.fillStyle=shade(col,-.4);ctx.fillRect(-3,2.4,len+4,1.6);ctx.restore();}
function hand(ctx,p,fore,col){const a=Math.atan2(p[1]-fore[1],p[0]-fore[0]);ctx.save();ctx.translate(p[0],p[1]);ctx.rotate(a);ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(0.6,0,3,2.6,0,0,7);ctx.fill();ctx.restore();}
function greave(ctx,k,f,col){const dx=f[0]-k[0],dy=f[1]-k[1],len=Math.hypot(dx,dy)||1,a=Math.atan2(dy,dx);ctx.save();ctx.translate(k[0],k[1]);ctx.rotate(a);poly(ctx,[[2,-3.1],[len-2,-2.6],[len-2,2.6],[2,3.1]],vg(ctx,-3,3,shade(col,.4),shade(col,-.3)),null,0);ctx.restore();}
function head(ctx,J,C,bare){const [hx,hy]=J.head,r=L.headR,tilt=Math.atan2(J.head[1]-J.neck[1],J.head[0]-J.neck[0])+Math.PI/2;ctx.save();ctx.translate(hx,hy);ctx.rotate(tilt);
  ctx.fillStyle=shade(C.skin,-.4);ctx.beginPath();ctx.arc(0,0,r,0.15,Math.PI-0.15);ctx.fill();
  if(bare){ // armor depleted: helmet is gone, only the bare head remains
    ctx.fillStyle=shade(C.skin,.05);ctx.beginPath();ctx.arc(0,-0.5,r,Math.PI,Math.PI*2);ctx.fill();
    ctx.restore();return;
  }
  ctx.fillStyle=cyl(ctx,-r-1.5,r+1.5,C.metal,.32);ctx.strokeStyle=shade(C.metal,-.5);ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,-0.5,r+1.4,Math.PI*0.95,Math.PI*2.05);ctx.fill();ctx.stroke();
  ctx.fillStyle=shade(C.metal,.6);ctx.beginPath();ctx.ellipse(-2.2,-2.4,1.7,4.2,-.3,0,7);ctx.fill();
  if(C.mohawk){
    // tall transverse Spartan crest (mohawk)
    ctx.fillStyle=shade(C.crest,-.35);ctx.beginPath();ctx.moveTo(-r*1.05,-r+2);ctx.quadraticCurveTo(0,-r-25,r*1.05,-r+2);ctx.quadraticCurveTo(0,-r-13,-r*1.05,-r+2);ctx.closePath();ctx.fill();
    ctx.fillStyle=C.crest;ctx.beginPath();ctx.moveTo(-r*0.9,-r+1.5);ctx.quadraticCurveTo(0,-r-22,r*0.9,-r+1.5);ctx.quadraticCurveTo(0,-r-12,-r*0.9,-r+1.5);ctx.closePath();ctx.fill();
    ctx.strokeStyle=shade(C.crest,.22);ctx.lineWidth=0.5;for(let i=-4;i<=4;i++){const hx=i*1.5;ctx.beginPath();ctx.moveTo(hx,-r-1);ctx.lineTo(hx,-r-18+Math.abs(i)*1.4);ctx.stroke();}
    ctx.fillStyle=shade(C.metal,.1);ctx.fillRect(-1.4,-r-1,2.8,2);
  } else if(C.crest){ctx.fillStyle=shade(C.crest,-.25);ctx.fillRect(-1.4,-r-1,2.8,2);ctx.fillStyle=C.crest;ctx.beginPath();ctx.moveTo(-r*0.8,-r);ctx.quadraticCurveTo(0,-r-9,r*0.8,-r);ctx.quadraticCurveTo(r*0.5,-r-3.5,0,-r-3);ctx.quadraticCurveTo(-r*0.5,-r-3.5,-r*0.8,-r);ctx.closePath();ctx.fill();ctx.fillStyle=shade(C.crest,.15);ctx.beginPath();ctx.moveTo(-r*0.7,-r);ctx.quadraticCurveTo(0,-r-8,r*0.2,-r-3.5);ctx.lineTo(-r*0.2,-r-1);ctx.closePath();ctx.fill();}
  if(C.hat==='cap'){                                   // archer soft leather cap over the dome
    ctx.fillStyle=cyl(ctx,-r-1,r+1,C.leather,.22);ctx.beginPath();ctx.arc(0,-1,r+1.2,Math.PI*0.9,Math.PI*2.1);ctx.fill();
    ctx.fillStyle=shade(C.leather,.15);ctx.beginPath();ctx.ellipse(-2,-2.2,1.5,3.4,-.3,0,7);ctx.fill();
    ctx.fillStyle=shade(C.leather,-.35);ctx.fillRect(-r,1.4,2*r,1.5);
  } else if(C.hat==='tricorne'){                        // gunner three-cornered hat
    ctx.fillStyle=shade(C.leather,-.05);
    ctx.beginPath();ctx.moveTo(-r-2.5,-r+1.5);ctx.quadraticCurveTo(0,-r-1.5,r+2.5,-r+1.5);ctx.quadraticCurveTo(r*0.55,-r-6.5,0,-r-7);ctx.quadraticCurveTo(-r*0.55,-r-6.5,-r-2.5,-r+1.5);ctx.closePath();ctx.fill();
    ctx.strokeStyle=C.trim;ctx.lineWidth=0.8;ctx.stroke();
    ctx.fillStyle=shade(C.leather,.12);ctx.beginPath();ctx.moveTo(-r*0.5,-r-3);ctx.quadraticCurveTo(0,-r-6,r*0.5,-r-3);ctx.closePath();ctx.fill();
  }
  ctx.fillStyle=shade(C.metal,-.1);ctx.fillRect(-r,2.4,2*r,1.6);ctx.restore();}
function legPts(pv,g){const hip=DN-g.fwd,kn=DN-g.fwd+g.bend;const p1=fk(pv,hip,L.thigh),p2=fk(p1,kn,L.shin),p3=fk(p2,0.06+(g.tilt||0),L.foot);return [pv,p1,p2,p3];}
function armPts(sh,a){const up=DN-a.fwd,fo=DN-a.fwd-a.bend;const e=fk(sh,up,L.uarm),h=fk(e,fo,L.farm);return [sh,e,h];}
function build(po){
  const pv=[po.px,-(L.thigh+L.shin)+po.py];
  const sh=fk(pv,UP+po.lean,L.spine), nk=fk(sh,UP+po.lean*1.1,L.neck), hd=fk(nk,UP+po.lean*1.1+po.headTilt,L.headR+2);
  return {pelvis:pv,shoulder:sh,neck:nk,head:hd,
    legF:legPts(pv,po.legF),legB:legPts(pv,po.legB),armF:armPts(sh,po.armN),armB:armPts(sh,po.armF2)};
}

// palettes per class
const PAL={
  sword:{skin:'#1b1b1d',metal:'#c6ccd2',trim:'#e8b23b',tunic:'#9e2b25',leather:'#6d4a2c',shield:'#9e2b25',crest:'#bb2f22',wood:'#7a4a24'},
  spear:{skin:'#1c1c1e',metal:'#c9a24a',trim:'#e8b23b',tunic:'#8f3f2c',leather:'#6d4a2c',shield:'#9e2b25',crest:'#a83828',wood:'#9a6a34',mohawk:true},
  bow:{skin:'#1c1c1e',metal:'#b7823a',trim:'#e8b23b',tunic:'#9a5a2c',leather:'#6d4a2c',wood:'#a9782f',hat:'cap'},
  gun:{skin:'#1c1c1e',metal:'#7c8790',trim:'#c7ccce',jacket:'#5c6446',leather:'#4f4436',wood:'#7a4a24',hat:'tricorne'}
};
function teamTint(C,team){ if(team===1)return C; const c={...C}; c.skin=shade(C.skin,0.86); return c; } // enemy lighter body

// ---------- POSES (per class + state) ----------
function poseFor(cls,st,p,t){
  const s=Math.sin(p*Math.PI*2), s2=Math.sin(p*Math.PI*4);
  let po={px:0,py:0,lean:0,headTilt:0,alpha:1,
    legF:{fwd:0.05,bend:0.16,tilt:0},legB:{fwd:-0.05,bend:0.16,tilt:0},
    armN:{fwd:0.3,bend:1.2},armF2:{fwd:0.4,bend:1.2},extra:{}};
  const walk=(amp)=>{const ml=(ps)=>({fwd:amp*ps,bend:0.18+Math.max(0,-ps)*0.8,tilt:Math.max(0,-ps)*0.4});po.legF=ml(s);po.legB=ml(-s);po.py=-Math.abs(s2)*2.0;po.lean=0.06;};
  if(st==='idle'){ po.py=Math.sin(t*1.5)*0.9; }
  else if(st==='march'){ walk(0.24); po.lean=0.03; }        // tight formation steps, upright
  else if(st==='run'){ walk(0.54); po.lean=0.20; po.py-=1.4; } // long stride, leaning charge
  if(cls==='sword'){
    po.armF2={fwd:0.28,bend:1.5};          // shield arm (near, drawn as F front)
    po.armN ={fwd:0.10,bend:1.32};         // sword arm (far)
    if(st==='attack'){const thr=ss(.15,.45,p)*(1-ss(.55,.9,p));po.px=thr*8;po.armN={fwd:lerp(0.1,1.5,thr),bend:lerp(1.32,0.15,thr)};po.extra.trail=thr;}
    else if(st==='overhead'){                       // flying overhead chop (post shield-break charge)
      const rise=ss(0,.4,p), slam=ss(.4,.6,p);
      po.py = -Math.sin(ss(0,.62,p)*Math.PI)*20;     // leap up then land
      po.px = ss(.12,.62,p)*20;                      // fly forward
      po.lean = 0.12 + slam*0.22;
      po.legF={fwd:0.12+rise*0.35,bend:0.30+rise*0.55,tilt:0};
      po.legB={fwd:-0.12-rise*0.1,bend:0.30+rise*0.6,tilt:0};
      po.armN={fwd:lerp(-0.7,1.5,ss(.35,.6,p)),bend:0.5};
      po.extra.chop = ss(.30,.60,p);                 // raise then slam
    }
    else if(st==='fury'){                            // rapid multi-slash
      const sw=Math.sin(p*Math.PI*6);
      po.px = 7 + Math.abs(sw)*4; po.lean=0.13;
      po.legF={fwd:0.26,bend:0.20,tilt:0}; po.legB={fwd:-0.16,bend:0.32,tilt:0};
      po.armN={fwd:lerp(0.1,1.5,0.5+0.5*sw),bend:lerp(1.3,0.3,0.5+0.5*sw)};
      po.extra.trail=0.5+0.5*sw;                     // blade sweeps across the body
    }
  } else if(cls==='spear'){
    po.armF2={fwd:0.5,bend:1.4};           // big shield (near)
    po.armN ={fwd:0.55,bend:0.85};po.extra.spearAng=-0.05; // spear (far), waist level
    if(st==='march'){po.extra.brace=1;}             // phalanx: shield up, spear forward keeping distance
    if(st==='attack'){                               // dramatic stepping thrust
      const wind=ss(0,.2,p), thr=ss(.2,.44,p)*(1-ss(.52,.9,p));
      po.px = -wind*6 + thr*22;                      // rock back, drive forward
      po.lean = thr*0.16 - wind*0.05;
      po.legF={fwd:0.05+thr*0.55,bend:0.18,tilt:0};  // front foot steps in
      po.legB={fwd:-0.05-thr*0.35,bend:0.20+thr*0.2,tilt:0};
      po.armN={fwd:lerp(0.5,1.55,thr)-wind*0.25,bend:lerp(0.85,0.32,thr)};
      po.extra.spearAng=-0.02; po.extra.brace=1-thr;
    }
    else if(st==='throw'){                           // overhead arch throw to the furthest enemy
      const wind=ss(0,.34,p), rel=ss(.34,.52,p), fly=ss(.52,1,p);
      po.px = -wind*4 + rel*20;
      po.lean = -wind*0.05 + rel*0.24;
      po.legF={fwd:0.05+rel*0.6,bend:0.18,tilt:0};
      po.legB={fwd:-0.1-rel*0.3,bend:0.22,tilt:0};
      po.armN={fwd:lerp(-1.1,1.9,rel),bend:lerp(1.7,0.1,rel)};   // cock over the shoulder, hurl up-forward
      po.extra.spearAng=lerp(-2.0,-0.55,rel);        // over-shoulder cock -> launch angled upward
      po.extra.thrown=fly; po.extra.spearGone=p>0.52;
    }
  } else if(cls==='bow'){
    po.armF2={fwd:1.5,bend:0.12};          // bow arm (far, forward)
    po.armN ={fwd:0.3,bend:1.6};           // draw arm (near)
    po.extra.bowUp=1;
    if(st!=='march'&&st!=='run'){po.legF={fwd:0.34,bend:0.10,tilt:0};po.legB={fwd:-0.34,bend:0.18,tilt:0.12};} // braced archer stance
    if(st==='attack'){const pull=ss(.1,.5,p)*(1-ss(.6,.72,p));po.armN={fwd:lerp(0.3,-1.9,pull),bend:lerp(1.6,2.05,pull)};po.extra.nocked=pull>0.15&&pull<0.95;}
  } else if(cls==='gun'){
    po.armF2={fwd:1.44,bend:0.34};         // front hand
    po.armN ={fwd:0.66,bend:1.86};         // rear/trigger
    po.extra.rifle=1;
    if(st!=='march'&&st!=='run'){po.legF={fwd:0.42,bend:0.34,tilt:0};po.legB={fwd:-0.30,bend:0.55,tilt:0.16};po.py=3;} // low firing-line crouch (front leg planted, rear knee dropped)
    if(st==='attack'){
      // One aimed shot per attack: settle → muzzle flash + recoil → rack the bolt (reload) → back on aim.
      const fire = ss(.10,.18,p)*(1-ss(.18,.30,p));       // sharp flash spike
      const rack = ss(.34,.58,p)*(1-ss(.58,.86,p));       // trigger hand cycles the action
      po.px = -fire*4.5 + rack*1.4;                        // recoil kick back, small settle forward on rack
      po.lean = fire*0.07;
      po.extra.fire = fire;                                // drives the muzzle flash in drawRifle
      po.armN  = {fwd:0.66 - rack*0.55, bend:1.86 + rack*0.5};   // rear hand pulls the bolt back and returns
      po.armF2 = {fwd:1.44 - fire*0.12, bend:0.34 + fire*0.05};  // front hand absorbs the kick
      po.headTilt = 0.12 - fire*0.04;                      // cheek on the stock, tiny lift on the shot
    }
    else if(st!=='idle'&&st!=='march'){po.headTilt=0.1;}
  }
  // ---- deaths ----
  if(st==='die_kneel'||st==='die_impale'){
    const q=ss(0,.45,p),sl=ss(.4,.96,p);po.py=q*30;po.lean=sl*0.3;po.headTilt=sl*0.6;
    po.legF={fwd:0.02,bend:0.16+1.4*q,tilt:0.5*q};po.legB={fwd:-0.1,bend:0.16+1.5*q,tilt:0.6*q};
    po.armN={fwd:0.3-sl*0.1,bend:0.85-sl*0.3};po.armF2={fwd:0.3,bend:0.9};po.extra={};
    if(st==='die_impale')po.extra.impale=Math.PI;
  } else if(st==='die_back'||st==='die_arrow'){
    const lay=ss(.24,.64,p),fly=ss(.05,.42,p);po.px=-(st==='die_arrow'?12:6)*fly;po.supine=lay;po.py=lay*55;po.headTilt=0.2;
    po.armN={fwd:0.7,bend:0.5};po.armF2={fwd:0.55,bend:0.55};po.legF={fwd:0.35,bend:0.4};po.legB={fwd:-0.1,bend:0.2};po.extra={dropGear:ss(.1,.4,p)};
    if(st==='die_arrow')po.extra.headArrow=1;
  }
  return po;
}

// ---------- CLASS DRAW ----------
function drawSpear(ctx,h,ang,C){const d=[Math.cos(ang),Math.sin(ang)];
  const b=[h[0]-d[0]*82,h[1]-d[1]*82],tp=[h[0]+d[0]*108,h[1]+d[1]*108];   // long shaft, butt clears shield behind
  ctx.strokeStyle=shade(C.wood,-.1);ctx.lineWidth=2.5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(b[0],b[1]);ctx.lineTo(tp[0],tp[1]);ctx.stroke();
  // bronze butt-spike (sauroter) at the rear
  ctx.strokeStyle=C.trim;ctx.lineWidth=3.0;ctx.beginPath();ctx.moveTo(b[0]-d[0]*7,b[1]-d[1]*7);ctx.lineTo(b[0]+d[0]*3,b[1]+d[1]*3);ctx.stroke();
  // leaf-blade tip
  const nx=-d[1],ny=d[0],hb=[tp[0]-d[0]*12,tp[1]-d[1]*12];
  poly(ctx,[[tp[0],tp[1]],[hb[0]+nx*3.6,hb[1]+ny*3.6],[hb[0]-nx*3.6,hb[1]-ny*3.6]],'#dfe4e8',shade('#dfe4e8',-.3),0.5);}
function drawAspis(ctx,J,C,po){const top=J.shoulder,bot=J.pelvis,hd=J.armF[2];const th=Math.hypot(bot[0]-top[0],bot[1]-top[1]);const R=th*0.92;const spaced=po.extra.brace;const mid=[lerp(top[0],bot[0],0.5),lerp(top[1],bot[1],0.64)];const gap=spaced?R*0.4+5:R*0.12;const cx=lerp(mid[0],hd[0],0.2)+gap,cy=lerp(mid[1],hd[1],0.2);ctx.save();ctx.translate(cx,cy);ctx.fillStyle=cyl(ctx,-R,R,C.shield,.15);ctx.strokeStyle=shade(C.shield,-.4);ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(0,0,R,0,7);ctx.fill();ctx.stroke();ctx.strokeStyle=C.trim;ctx.lineWidth=R*0.09;ctx.beginPath();ctx.arc(0,0,R-R*0.06,0,7);ctx.stroke();ctx.strokeStyle=C.trim;ctx.lineWidth=R*0.13;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,-R*0.4);ctx.lineTo(-R*0.32,R*0.4);ctx.moveTo(0,-R*0.4);ctx.lineTo(R*0.32,R*0.4);ctx.stroke();ctx.restore();}
function drawScutum(ctx,J,C){const top=J.shoulder,bot=J.pelvis,hd=J.armF[2];const th=Math.hypot(bot[0]-top[0],bot[1]-top[1]);const HH=th*0.86,HW=th*0.30;const mid=[lerp(top[0],bot[0],0.5),lerp(top[1],bot[1],0.6)];const cx=lerp(mid[0],hd[0],0.32)+HW*0.5,cy=lerp(mid[1],hd[1],0.38);ctx.save();ctx.translate(cx,cy);ctx.fillStyle=cyl(ctx,-HW,HW,C.shield,.14);ctx.strokeStyle=shade(C.shield,-.4);ctx.lineWidth=1.4;ctx.beginPath();ctx.roundRect(-HW,-HH,HW*2,HH*2,4);ctx.fill();ctx.stroke();ctx.strokeStyle=C.trim;ctx.lineWidth=1.2;ctx.beginPath();ctx.roundRect(-HW+1.2,-HH+1.4,HW*2-2.4,HH*2-2.8,3);ctx.stroke();ctx.fillStyle=C.trim;ctx.beginPath();ctx.arc(0,0,HW*0.24,0,7);ctx.fill();ctx.restore();}
function drawGladius(ctx,J,po,C){
  const h=J.armB[2];const trail=po.extra.trail||0;
  const ang = po.extra.chop!=null ? lerp(-2.5,0.78,po.extra.chop)   // overhead: raised behind -> slam down-forward
            : lerp(-1.46,-0.05,trail);                              // idle upright -> forward thrust
  const d=[Math.cos(ang),Math.sin(ang)],nx=-d[1],ny=d[0];
  const big=po.extra.bigSword?1.6:1;                       // raged: oversized greatsword
  const blade=64*big,grip=9,guardW=7.5*big,bw=2.9*big;
  const tip=[h[0]+d[0]*blade,h[1]+d[1]*blade];
  const gripEnd=[h[0]-d[0]*grip,h[1]-d[1]*grip];
  // grip + pommel (behind hand)
  ctx.strokeStyle=shade(C.leather,-.05);ctx.lineWidth=3.0;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(h[0],h[1]);ctx.lineTo(gripEnd[0],gripEnd[1]);ctx.stroke();
  ctx.fillStyle=C.trim;ctx.beginPath();ctx.arc(gripEnd[0],gripEnd[1],2.4,0,7);ctx.fill();
  // crossguard
  ctx.strokeStyle=C.trim;ctx.lineWidth=2.6;ctx.beginPath();ctx.moveTo(h[0]+nx*guardW,h[1]+ny*guardW);ctx.lineTo(h[0]-nx*guardW,h[1]-ny*guardW);ctx.stroke();
  // tapered blade
  const b0=[h[0]+d[0]*2,h[1]+d[1]*2];
  poly(ctx,[[b0[0]+nx*bw,b0[1]+ny*bw],[tip[0]+nx*0.6,tip[1]+ny*0.6],[tip[0]+d[0]*2.4,tip[1]+d[1]*2.4],[tip[0]-nx*0.6,tip[1]-ny*0.6],[b0[0]-nx*bw,b0[1]-ny*bw]],'#e9edf1',shade('#e9edf1',-.35),0.6);
  // fuller highlight
  ctx.strokeStyle=shade('#e9edf1',.25);ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(b0[0]+d[0]*3,b0[1]+d[1]*3);ctx.lineTo(tip[0]-d[0]*5,tip[1]-d[1]*5);ctx.stroke();
}
// Second sword in the near (former shield) hand — for the ex-spearman dual-blade rage.
function drawGladius2(ctx,J,po,C){
  const h=J.armF[2];const trail=po.extra.trail||0;
  const ang = (po.extra.chop!=null ? lerp(-2.5,0.78,po.extra.chop) : lerp(-1.46,-0.05,trail)) + 0.55;  // offset so the two blades slash out of phase
  const d=[Math.cos(ang),Math.sin(ang)],nx=-d[1],ny=d[0];const big=po.extra.bigSword?1.55:1;const blade=58*big,grip=8,bw=2.6*big;
  const tip=[h[0]+d[0]*blade,h[1]+d[1]*blade],gripEnd=[h[0]-d[0]*grip,h[1]-d[1]*grip];
  ctx.strokeStyle=shade(C.leather,-.05);ctx.lineWidth=2.8;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(h[0],h[1]);ctx.lineTo(gripEnd[0],gripEnd[1]);ctx.stroke();
  ctx.strokeStyle=C.trim;ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(h[0]+nx*6.5,h[1]+ny*6.5);ctx.lineTo(h[0]-nx*6.5,h[1]-ny*6.5);ctx.stroke();
  const b0=[h[0]+d[0]*2,h[1]+d[1]*2];
  poly(ctx,[[b0[0]+nx*bw,b0[1]+ny*bw],[tip[0]+nx*0.5,tip[1]+ny*0.5],[tip[0]+d[0]*2.2,tip[1]+d[1]*2.2],[tip[0]-nx*0.5,tip[1]-ny*0.5],[b0[0]-nx*bw,b0[1]-ny*bw]],'#e9edf1',shade('#e9edf1',-.35),0.6);
}
function drawBow(ctx,G,dh,po){const half=40,depth=15;const aim=po.extra.nocked?Math.atan2(G[1]-dh[1],G[0]-dh[0]):0;ctx.save();ctx.translate(G[0],G[1]);ctx.rotate(aim);const T=[-depth,-half],B=[-depth,half];ctx.strokeStyle='#8a5a2c';ctx.lineWidth=2.6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(T[0],T[1]);ctx.quadraticCurveTo(2,-half*0.5,2,0);ctx.quadraticCurveTo(2,half*0.5,B[0],B[1]);ctx.stroke();let nock;if(po.extra.nocked){const dx=dh[0]-G[0],dy=dh[1]-G[1];nock=[dx*Math.cos(aim)+dy*Math.sin(aim),-dx*Math.sin(aim)+dy*Math.cos(aim)];}else nock=[-depth,0];ctx.strokeStyle='rgba(238,232,214,.8)';ctx.lineWidth=0.7;ctx.beginPath();ctx.moveTo(T[0],T[1]);ctx.lineTo(nock[0],nock[1]);ctx.lineTo(B[0],B[1]);ctx.stroke();if(po.extra.nocked){ctx.strokeStyle='#7a5330';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(nock[0],nock[1]);ctx.lineTo(22,0);ctx.stroke();ctx.fillStyle='#e6ebef';poly(ctx,[[26,0],[22,-2],[22,2]],'#e6ebef',null,0);}ctx.restore();}
function drawRifle(ctx,rear,front,po,C){const ang=Math.atan2(front[1]-rear[1],front[0]-rear[0]),len=Math.hypot(front[0]-rear[0],front[1]-rear[1]);ctx.save();ctx.translate(rear[0],rear[1]);ctx.rotate(ang);const muzzle=len+24;ctx.fillStyle=shade(C.wood,-.1);ctx.beginPath();ctx.moveTo(-16,-3.4);ctx.lineTo(-2,-2.2);ctx.lineTo(-2,2);ctx.lineTo(-16,3.6);ctx.closePath();ctx.fill();ctx.fillStyle=cyl(ctx,-3,3,C.metal,.3);ctx.beginPath();ctx.roundRect(-2,-2.4,len*0.5+4,4.2,1);ctx.fill();ctx.fillStyle=shade(C.metal,-.1);ctx.beginPath();ctx.moveTo(3,2);ctx.lineTo(8,2);ctx.lineTo(7,9);ctx.lineTo(4,9);ctx.closePath();ctx.fill();ctx.fillStyle=shade(C.metal,.1);ctx.fillRect(len*0.4,-1.2,muzzle-len*0.4,2.4);ctx.fillStyle=shade(C.wood,-.05);ctx.beginPath();ctx.roundRect(len-8,-2.2,16,4.4,1.2);ctx.fill();if(po.extra.fire>0.05){ctx.globalAlpha=Math.min(1,po.extra.fire*1.4);ctx.fillStyle='#ffd24a';poly(ctx,[[muzzle+2,0],[muzzle+9,-4],[muzzle+15,0],[muzzle+9,4]],'#ffd24a',null,0);ctx.globalAlpha=1;}ctx.restore();}

// ---- Roman legionary armor overlays (sword class) ----
function drawSegmentata(ctx,J,C){
  const sh=J.shoulder,pv=J.pelvis;const a=Math.atan2(pv[1]-sh[1],pv[0]-sh[0]);
  const tl=Math.hypot(pv[0]-sh[0],pv[1]-sh[1]);
  ctx.save();ctx.translate(sh[0],sh[1]);ctx.rotate(a-Math.PI/2);
  const bands=5,top=2.5,bot=tl*0.60,bh=(bot-top)/bands;
  for(let i=0;i<bands;i++){const y=top+i*bh,w=lerp(8.3,6.6,i/(bands-1));
    ctx.fillStyle=cyl(ctx,-w,w,C.metal,.36);ctx.strokeStyle=shade(C.metal,-.55);ctx.lineWidth=0.6;
    ctx.beginPath();ctx.roundRect(-w,y,w*2,bh*0.92,1.6);ctx.fill();ctx.stroke();}
  ctx.restore();
}
function drawPteruges(ctx,J,C){
  const pv=J.pelvis,strips=7;ctx.save();ctx.translate(pv[0],pv[1]);
  for(let i=0;i<strips;i++){const fx=lerp(-8,8,i/(strips-1));
    poly(ctx,[[fx-1.9,-1],[fx+1.9,-1],[fx+1.5,9.5],[fx-1.5,9.5]],cyl(ctx,fx-1.9,fx+1.9,C.leather,.18),shade(C.leather,-.45),0.4);
    ctx.fillStyle=C.trim;ctx.fillRect(fx-1.7,8.1,3.4,1.5);}
  ctx.restore();
}
function drawPauldron(ctx,sh,C){
  ctx.fillStyle=cyl(ctx,sh[0]-7.5,sh[0]+7.5,C.metal,.42);ctx.strokeStyle=shade(C.metal,-.55);ctx.lineWidth=0.7;
  ctx.beginPath();ctx.ellipse(sh[0],sh[1]+1.5,7.5,5.2,0,0,7);ctx.fill();ctx.stroke();
  ctx.strokeStyle=shade(C.metal,.1);ctx.lineWidth=0.5;ctx.beginPath();ctx.ellipse(sh[0],sh[1]+1.5,5,3.4,0,0,7);ctx.stroke();
}
// Civilization armor tiers across the 15 eras — recolors the metal/trim of every
// worn piece (helmet, greaves, cuirass) and picks the chest style so a tribal
// spearman, a bronze hoplite and an industrial trooper are unmistakable.
function eraKit(civ){
  civ=Math.max(1,Math.min(15,(civ|0)||1));
  const T=[
    [1,1,'#8a6a45','#c8a45a','hide'],   // tribal hide
    [2,2,'#b5893c','#e8c46a','scale'],  // bronze scale
    [3,4,'#9aa2aa','#c7ccce','plate'],  // late-bronze / iron
    [5,6,'#c2a15a','#e8d28a','muscle'], // classical bronze muscle cuirass
    [7,8,'#aeb4bb','#cfd4d8','mail'],   // late-antique / viking mail
    [9,10,'#c6ccd2','#e8b23b','plate'], // medieval / steppe plate
    [11,13,'#8f8f93','#c7ccce','coat'], // renaissance → napoleonic
    [14,15,'#6f757c','#aab0b6','coat']  // industrial / world-war
  ];
  for(const t of T) if(civ>=t[0]&&civ<=t[1]) return {metal:t[2],trim:t[3],chest:t[4]};
  return {metal:'#8f8f93',trim:'#c7ccce',chest:'coat'};
}
// A fitted breastplate that follows the torso (shoulder→pelvis) and carries an
// era-specific surface: hide straps, bronze scales, mail rings, muscle relief, coat.
function drawCuirass(ctx,J,C,style){
  const sh=J.shoulder,pv=J.pelvis;const a=Math.atan2(pv[1]-sh[1],pv[0]-sh[0]);
  const tl=Math.hypot(pv[0]-sh[0],pv[1]-sh[1]);
  ctx.save();ctx.translate(sh[0],sh[1]);ctx.rotate(a-Math.PI/2);
  const top=1.5, bot=tl*0.66;
  ctx.fillStyle=cyl(ctx,-8,8,C.metal,.34);ctx.strokeStyle=shade(C.metal,-.5);ctx.lineWidth=0.8;
  ctx.beginPath();ctx.moveTo(-8,top);ctx.quadraticCurveTo(-9,bot*0.5,-6,bot);ctx.lineTo(6,bot);ctx.quadraticCurveTo(9,bot*0.5,8,top);ctx.quadraticCurveTo(0,top-2,-8,top);ctx.closePath();ctx.fill();ctx.stroke();
  if(style==='scale'){ctx.fillStyle=shade(C.metal,-.16);for(let r=0;r<4;r++)for(let c=-2;c<=2;c++){ctx.beginPath();ctx.arc(c*3.2+(r%2?1.6:0),top+4+r*4,1.7,0,Math.PI);ctx.fill();}}
  else if(style==='mail'){ctx.fillStyle=shade(C.metal,-.22);for(let r=0;r<5;r++)for(let c=-2;c<=2;c++){ctx.beginPath();ctx.arc(c*3+(r%2?1.5:0),top+3+r*3,0.8,0,7);ctx.fill();}}
  else if(style==='muscle'){ctx.strokeStyle=shade(C.metal,-.28);ctx.lineWidth=0.7;ctx.beginPath();ctx.arc(-3,top+bot*0.28,3,0.1,Math.PI-0.1);ctx.arc(3.2,top+bot*0.28,3,0.1,Math.PI-0.1);ctx.moveTo(0,top+bot*0.42);ctx.lineTo(0,bot*0.86);ctx.stroke();}
  else if(style==='hide'){ctx.strokeStyle=shade(C.metal,-.3);ctx.lineWidth=1.4;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-7,top+3+i*4.6);ctx.lineTo(7,top+2+i*4.6);ctx.stroke();}}
  else if(style==='coat'){ctx.strokeStyle=shade(C.metal,-.3);ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(0,top);ctx.lineTo(0,bot);ctx.stroke();ctx.fillStyle=C.trim;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(0,top+3.5+i*4.6,0.9,0,7);ctx.fill();}}
  else {ctx.strokeStyle=shade(C.metal,.12);ctx.lineWidth=0.6;ctx.beginPath();ctx.moveTo(-6,top+bot*0.5);ctx.lineTo(6,top+bot*0.5);ctx.stroke();}
  ctx.strokeStyle=C.trim;ctx.lineWidth=1.0;ctx.beginPath();ctx.moveTo(-8,top);ctx.quadraticCurveTo(0,top-2,8,top);ctx.stroke();
  ctx.restore();
}

function drawSoldier(ctx,cls,po,C,team){
  if(po.era){ const k=eraKit(po.era); C={...C, metal:k.metal, trim:k.trim, _chest:k.chest}; }  // civilization armor tier
  const J=build(po),sk=C.skin,far=shade(sk,team===1?0.1:-0.1);
  if(po.extra.dropGear){ctx.save();ctx.globalAlpha=po.alpha*po.extra.dropGear;ctx.fillStyle=cyl(ctx,po.px-16,po.px+16,C.shield||'#8a8f96',.1);ctx.strokeStyle='#3a3f45';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(po.px-6,1,15,5,0,0,7);ctx.fill();ctx.stroke();ctx.restore();}
  ctx.globalAlpha=po.alpha;
  const supRot=po.supine?-1.5*po.supine:0;
  if(supRot){ctx.save();ctx.translate(J.pelvis[0],J.pelvis[1]);ctx.rotate(supRot);ctx.translate(-J.pelvis[0],-J.pelvis[1]);}
  // far leg
  limb(ctx,J.legB[0],J.legB[1],6.7,5.4,far);limb(ctx,J.legB[1],J.legB[2],5.4,3.6,far);greave(ctx,J.legB[1],J.legB[2],C.metal);boot(ctx,J.legB[2],J.legB[3],shade(C.leather,-.1));
  // far arm (weapon side for sword/spear; bow arm for bow; front for gun)
  limb(ctx,J.armB[0],J.armB[1],5.1,4.1,far);limb(ctx,J.armB[1],J.armB[2],4.1,3.0,far);hand(ctx,J.armB[2],J.armB[1],far);
  if(!po.supine&&!po.extra.impale){
    if(cls==='spear'&&!po.extra.spearGone)drawSpear(ctx,J.armB[2],po.extra.spearAng,C);
    if(cls==='bow')drawBow(ctx,J.armB[2],J.armF[2],po);
  }
  if(cls==='sword'&&!po.supine)drawGladius(ctx,J,po,C);
  if(cls==='sword'&&!po.supine&&po.extra.dualSword)drawGladius2(ctx,J,po,C);   // dual-blade ex-spearman
  // torso
  limb(ctx,J.pelvis,J.shoulder,6.2,7.6,sk);
  const jc=C.jacket||C.tunic; ctx.save();const sA=Math.atan2(J.pelvis[1]-J.shoulder[1],J.pelvis[0]-J.shoulder[0]);ctx.translate(J.shoulder[0],J.shoulder[1]);ctx.rotate(sA-Math.PI/2);const tl=Math.hypot(J.pelvis[0]-J.shoulder[0],J.pelvis[1]-J.shoulder[1]);poly(ctx,[[-7.6,3],[7.6,3],[6.3,tl],[-6.3,tl]],cyl(ctx,-7.6,7.6,jc,.15),shade(jc,-.4),0.7);ctx.restore();
  if(cls==='sword'&&!po.supine&&!po.extra.impale)drawSegmentata(ctx,J,C);
  if((cls==='spear'||cls==='bow'||cls==='gun')&&!po.supine&&!po.extra.impale)drawCuirass(ctx,J,C,C._chest||'plate');  // era-fitted breastplate
  // near leg
  limb(ctx,J.legF[0],J.legF[1],6.7,5.4,sk);limb(ctx,J.legF[1],J.legF[2],5.4,3.6,sk);greave(ctx,J.legF[1],J.legF[2],C.metal);boot(ctx,J.legF[2],J.legF[3],shade(C.leather,-.1));
  if(cls==='sword'&&!po.supine&&!po.extra.impale)drawPteruges(ctx,J,C);
  // head
  limb(ctx,J.shoulder,fk(J.neck,0,0),4.2,4.2,sk);head(ctx,J,C,po.dropHelmet);
  if(po.extra.headArrow){ctx.save();ctx.translate(J.head[0],J.head[1]);ctx.strokeStyle='#6b4a2a';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-15,0);ctx.lineTo(13,0);ctx.stroke();ctx.fillStyle='#dfe4e8';poly(ctx,[[16,0],[12,-2],[12,2]],'#dfe4e8',null,0);ctx.fillStyle='rgba(150,10,10,.7)';for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(-16-i*2,(i-2)*1.5,1.4,0,7);ctx.fill();}ctx.restore();}
  // near arm (shield for sword/spear; draw for bow; rear for gun)
  limb(ctx,J.armF[0],J.armF[1],5.1,4.1,sk);limb(ctx,J.armF[1],J.armF[2],4.1,3.0,sk);hand(ctx,J.armF[2],J.armF[1],shade(sk,.1));
  if(cls==='sword'&&!po.supine&&!po.extra.impale)drawPauldron(ctx,J.shoulder,C);
  if(!po.supine&&!po.extra.impale&&!po.extra.dropGear&&!po.dropShield){
    if(cls==='sword')drawScutum(ctx,J,C);
    if(cls==='spear')drawAspis(ctx,J,C,po);
  }
  if(cls==='gun'&&!po.supine)drawRifle(ctx,J.armF[2],J.armB[2],po,C);
  if(po.extra.impale){const cx=lerp(J.shoulder[0],J.pelvis[0],0.4),cy=lerp(J.shoulder[1],J.pelvis[1],0.42);const d=[Math.cos(po.extra.impale),Math.sin(po.extra.impale)];ctx.strokeStyle=shade(C.wood||'#8a5a2c',-.1);ctx.lineWidth=2.4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(cx+d[0]*38,cy+d[1]*38);ctx.lineTo(cx-d[0]*16,cy-d[1]*16);ctx.stroke();ctx.fillStyle='#5a0e0e';ctx.beginPath();ctx.arc(cx,cy,2.4,0,7);ctx.fill();}
  if(cls==='spear'&&po.extra.thrown>0){const f=po.extra.thrown;
    const sx=J.armF[2][0]+18+f*230;
    const sy=J.shoulder[1]-4 - 4*f*(1-f)*82 + f*f*34;   // parabolic arc: rises then descends
    const ang=lerp(-0.55,0.52,f);                          // nose up on launch, tips down while falling
    drawSpear(ctx,[sx,sy],ang,C);}
  if(supRot)ctx.restore();
  ctx.globalAlpha=1;
}


return {drawSoldier,poseFor,build,PAL,teamTint,poly,shade};
})();
