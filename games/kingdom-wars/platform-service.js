(function(){
  'use strict';
  const bridge=window.KingdomWarsNative||null;
  const unsupported=(feature)=>Promise.resolve({ok:false,status:'UNAVAILABLE',feature});
  function call(name,args,fallback){try{if(bridge&&typeof bridge[name]==='function')return Promise.resolve(bridge[name](...(args||[])));return fallback?Promise.resolve(fallback()):unsupported(name);}catch(error){return Promise.resolve({ok:false,status:'FAILED',feature:name,error:String(error)});}}
  const ua=navigator.userAgent||'',standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const api={
    getPlatform(){return bridge?.platform||(/iphone|ipad|ipod/i.test(ua)?'ios':/android/i.test(ua)?'android':'web');},
    getSafeAreaInsets(){return call('getSafeAreaInsets',[],()=>({top:0,right:0,bottom:0,left:0}));},
    vibrate(eventId,pattern){if(bridge)return call('vibrate',[eventId]);if(navigator.vibrate){navigator.vibrate(pattern||20);return Promise.resolve({ok:true,status:'COMPLETED'});}return unsupported('vibrate');},
    purchase(productId){return call('purchase',[productId]);},restorePurchases(){return call('restorePurchases');},
    showRewardedAd(placementId){return call('showRewardedAd',[placementId]);},openPrivacySettings(){return call('openPrivacySettings');},
    requestReview(){return call('requestReview');},getAppVersion(){return window.KWBuild?.appVersion||'unknown';},
    getNetworkStatus(){return Promise.resolve({online:navigator.onLine!==false});},saveSecureValue(key,value){return call('saveSecureValue',[key,value]);},readSecureValue(key){return call('readSecureValue',[key]);},
    isStandalone(){return standalone;}
  };
  window.KWPlatform=Object.freeze(api);
})();
