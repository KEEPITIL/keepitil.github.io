(function(){
  'use strict';
  const KEY='kingdom-wars-analytics-queue-v1',MAX_EVENTS=5000,MAX_BYTES=10*1024*1024,allowed=/^[a-z][a-z0-9_]{1,63}$/;
  let consent='local_only',props={},queue=[];try{queue=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(queue))queue=[];}catch(e){queue=[];}
  function persist(){while(queue.length>MAX_EVENTS||JSON.stringify(queue).length>MAX_BYTES)queue.shift();try{localStorage.setItem(KEY,JSON.stringify(queue));}catch(e){queue=queue.slice(-500);}}
  function context(){const s=window.S;return{appVersion:window.KWBuild?.appVersion,contentVersion:window.KWBuild?.contentVersion,analyticsSchemaVersion:window.KWBuild?.analyticsSchemaVersion,platform:window.KWPlatform?.getPlatform(),environment:window.KWBuild?.environment,wave:s?.wave||0,civilizationId:s?.civ||1};}
  function clean(value,depth){if(depth>2)return undefined;if(value==null||['string','number','boolean'].includes(typeof value))return value;if(Array.isArray(value))return value.slice(0,20).map(v=>clean(v,depth+1));if(typeof value==='object'){const out={};for(const [k,v] of Object.entries(value).slice(0,30))if(!/token|receipt|password|secret/i.test(k))out[k]=clean(v,depth+1);return out;}}
  function track(name,properties,priority){if(!allowed.test(name))return false;queue.push({id:window.crypto?.randomUUID?.()||Date.now()+'-'+Math.random(),name,properties:clean({...context(),...props,...properties},0),priority:priority||'normal',at:new Date().toISOString()});persist();return true;}
  function setUserProperty(name,value){if(allowed.test(name))props[name]=clean(value,0);}
  function flush(){if(consent!=='granted'||!navigator.onLine)return Promise.resolve({ok:false,status:'QUEUED',count:queue.length});return Promise.resolve({ok:false,status:'NO_PROVIDER',count:queue.length});}
  function setConsent(state){consent=['granted','denied','local_only'].includes(state)?state:'denied';}
  window.addEventListener('error',e=>track('client_error',{message:String(e.message).slice(0,300),source:String(e.filename).split('/').pop(),line:e.lineno},'critical'));
  window.addEventListener('unhandledrejection',e=>track('unhandled_rejection',{message:String(e.reason).slice(0,300)},'critical'));
  function status(){return{queued:queue.length,consent,bytes:JSON.stringify(queue).length};}
  window.KWAnalytics=Object.freeze({track,setUserProperty,flush,setConsent,status,get queueSize(){return queue.length;},get recent(){return queue.slice(-20);}});
})();
