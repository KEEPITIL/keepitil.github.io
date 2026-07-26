/* KWResponsive — responsive desktop/mobile adaptation layer (Kingdom Wars).
 * Loaded before the inline game script. Pure adaptation: detection, canvas
 * fitting, ui scale, and touch guards. It routes NO game logic — the game
 * keeps using issueCommand()/castGeneral(); this module only tells it what
 * kind of device it is running on. */
(function(){
  'use strict';
  const state={isTouch:false,isMobile:false,isDesktop:true,orientation:'landscape',uiScale:1,dpr:1};
  function compute(){
    const touch=(navigator.maxTouchPoints||0)>0||window.matchMedia('(pointer: coarse)').matches;
    const narrow=Math.min(window.innerWidth,window.innerHeight)<=520||window.innerWidth<=900&&touch;
    state.isTouch=touch;
    state.isMobile=touch&&narrow;
    state.isDesktop=!state.isMobile;
    state.orientation=window.innerWidth>=window.innerHeight?'landscape':'portrait';
    state.dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1));
    // Larger hit targets on mobile, denser HUD on desktop.
    state.uiScale=state.isMobile?Math.max(1,Math.min(1.35,window.innerWidth/720)):1;
    document.documentElement.dataset.kwPlatform=state.isMobile?'mobile':'desktop';
    document.documentElement.dataset.kwOrientation=state.orientation;
  }
  compute();
  let raf=0;
  function announce(){compute();window.dispatchEvent(new CustomEvent('platformchange',{detail:{...state}}));}
  window.addEventListener('resize',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(announce);});
  window.addEventListener('orientationchange',announce);

  /* Size a canvas to the viewport at device-pixel resolution (crisp on
   * retina), while its CSS size stays in layout pixels. Returns the css
   * width/height so the caller can keep its own math in css units. */
  function fit(canvas,cssW,cssH){
    const w=cssW!=null?cssW:window.innerWidth;
    const h=cssH!=null?cssH:window.innerHeight;
    canvas.style.width=w+'px';canvas.style.height=h+'px';
    canvas.width=Math.round(w*state.dpr);canvas.height=Math.round(h*state.dpr);
    const g=canvas.getContext('2d');g.setTransform(state.dpr,0,0,state.dpr,0,0);
    return{w,h,dpr:state.dpr};
  }

  /* Touch guards: stop double-tap zoom, pinch zoom and long-press callouts
   * on the game surface without touching the game's own handlers. */
  function guard(el){
    if(!el)return;
    el.style.touchAction='none';
    el.addEventListener('touchstart',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
    let lastTap=0;
    el.addEventListener('touchend',e=>{const now=Date.now();if(now-lastTap<320)e.preventDefault();lastTap=now;},{passive:false});
    el.addEventListener('contextmenu',e=>e.preventDefault());
  }

  window.KWResponsive=Object.freeze({
    get isTouch(){return state.isTouch;},
    get isMobile(){return state.isMobile;},
    get isDesktop(){return state.isDesktop;},
    get orientation(){return state.orientation;},
    get uiScale(){return state.uiScale;},
    get dpr(){return state.dpr;},
    fit,guard,refresh:announce
  });
})();
