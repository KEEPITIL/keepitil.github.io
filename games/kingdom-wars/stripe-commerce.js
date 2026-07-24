(function(){
  'use strict';
  const packs=Object.freeze([
    {id:'gems_120',gems:120,label:'Scout Pack',price:'$1.99 USD'},
    {id:'gems_650',gems:650,label:'War Chest',price:'$7.99 USD'},
    {id:'gems_1500',gems:1500,label:'Royal Treasury',price:'$14.99 USD'},
    {id:'gems_3500',gems:3500,label:'Imperial Vault',price:'$29.99 USD'},
    {id:'gems_7500',gems:7500,label:'Conquest Vault',price:'$49.99 USD'}
  ]);
  async function purchase(id){
    const p=packs.find(x=>x.id===id);if(!p)return;
    const direct=window.KW_STRIPE_PAYMENT_LINKS?.[id];
    if(direct){location.href=direct;return;}
    try{
      const r=await fetch('/api/create-checkout-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({priceId:id,successUrl:location.origin+location.pathname+'?checkout=success',cancelUrl:location.href})});
      if(!r.ok)throw Error('checkout unavailable');const data=await r.json();if(!data.url)throw Error('missing checkout URL');location.href=data.url;
    }catch(e){alert('Stripe Checkout is safely scaffolded but not connected yet. Add server-side Stripe price IDs and a verified webhook before accepting real payments. No charge was made.');}
  }
  window.KWStripe=Object.freeze({packs,purchase});
})();
