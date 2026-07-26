(function(){
  'use strict';
  const PREFIX='kw-save-v2-',SCHEMA=3;
  function hash(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');}
  function envelope(namespace,payload){const body={namespace,schemaVersion:SCHEMA,appVersion:window.KWBuild?.appVersion||'unknown',contentVersion:window.KWBuild?.contentVersion||'unknown',updatedAt:new Date().toISOString(),payload};const serialized=JSON.stringify(body);return{...body,payloadHash:hash(serialized)};}
  function valid(e,namespace){if(!e||e.namespace!==namespace||!e.payloadHash)return false;const copy={...e};delete copy.payloadHash;return hash(JSON.stringify(copy))===e.payloadHash;}
  function key(ns,suffix){return PREFIX+ns+'-'+suffix;}
  function mirror(ns,e){if(!window.indexedDB)return;const req=window.indexedDB.open('kingdom-wars',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('saves'))req.result.createObjectStore('saves');};req.onsuccess=()=>{const tx=req.result.transaction('saves','readwrite');tx.objectStore('saves').put(e,ns);};}
  function write(namespace,payload,checkpoint){try{const next=envelope(namespace,payload),current=localStorage.getItem(key(namespace,'current'));localStorage.setItem(key(namespace,'temp'),JSON.stringify(next));const parsed=JSON.parse(localStorage.getItem(key(namespace,'temp')));if(!valid(parsed,namespace))throw Error('checksum validation failed');if(current)localStorage.setItem(key(namespace,'backup'),current);localStorage.setItem(key(namespace,'current'),JSON.stringify(next));if(checkpoint)localStorage.setItem(key(namespace,'checkpoint'),JSON.stringify(next));localStorage.removeItem(key(namespace,'temp'));mirror(namespace,next);return{ok:true,source:'current',updatedAt:next.updatedAt};}catch(error){window.KWAnalytics?.track('save_failed',{namespace,error:String(error)},'critical');return{ok:false,error:String(error)};}}
  function migrate(e){
    if(!e)return e;
    const from=e.schemaVersion||1;
    if(from<2)e={...e,schemaVersion:2,contentVersion:e.contentVersion||window.KWBuild?.contentVersion};
    if(from<3&&e.payload&&typeof e.payload==='object'){
      const legacyMap=[1,4,9,12,15],old=Math.max(1,Math.min(5,Number(e.payload.civ)||1));
      e={...e,schemaVersion:3,payload:{...e.payload,civ:legacyMap[old-1],enemyCiv:legacyMap[Math.max(1,Math.min(5,Number(e.payload.enemyCiv)||old))-1],legacyCyberUnlocked:old===5||!!e.payload.legacyCyberUnlocked,migratedFromFiveAge:true}};
    }
    const copy={...e};delete copy.payloadHash;e.payloadHash=hash(JSON.stringify(copy));return e;
  }
  function read(namespace){for(const source of ['current','backup','checkpoint']){try{let e=migrate(JSON.parse(localStorage.getItem(key(namespace,source))||'null'));if(valid(e,namespace)){if(source!=='current')window.KWAnalytics?.track('save_recovered',{namespace,source},'critical');return{ok:true,payload:e.payload,source,meta:e};}}catch(error){}}return{ok:false,payload:null,source:null};}
  function remove(namespace){for(const s of ['current','backup','checkpoint','temp'])localStorage.removeItem(key(namespace,s));}
  window.KWSave=Object.freeze({write,read,remove,validate:valid,hash,schemaVersion:SCHEMA});
})();
