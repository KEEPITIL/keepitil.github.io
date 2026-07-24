(function(){
  'use strict';
  class SeededRandom{
    constructor(seed){this.state=(seed>>>0)||0x6d2b79f5;}
    next(){let t=this.state+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);this.state=(this.state>>>0);return((t^t>>>14)>>>0)/4294967296;}
    int(max){return Math.floor(this.next()*max);}
    range(min,max){return min+(max-min)*this.next();}
    pick(items){return items.length?items[this.int(items.length)]:null;}
    snapshot(){return this.state>>>0;}
    restore(state){this.state=(state>>>0)||0x6d2b79f5;}
  }
  class EventBus{
    constructor(){this.listeners=new Map();}
    on(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);return()=>this.listeners.get(name)?.delete(fn);}
    emit(name,payload){for(const fn of this.listeners.get(name)||[])try{fn(payload);}catch(error){window.KWAnalytics?.track('event_listener_failed',{name,error:String(error)},'critical');}}
  }
  class CommandQueue{
    constructor(limit){this.limit=limit||256;this.items=[];this.serial=0;}
    enqueue(type,payload){if(this.items.length>=this.limit)return{ok:false,status:'QUEUE_FULL'};const command={id:++this.serial,type,payload:payload||{},createdAt:performance.now()};this.items.push(command);return{ok:true,id:command.id};}
    drain(handler,max){let count=0;while(this.items.length&&count<(max||64)){handler(this.items.shift());count++;}return count;}
    clear(){this.items.length=0;}
  }
  window.KWRuntime=Object.freeze({SeededRandom,events:new EventBus(),commands:new CommandQueue(256),simulationHz:60});
})();
