/* Local TEST economy only. No DOM, network, voice, credentials or production wallet writes. */
(function(root){
  'use strict';
  const PREFIX='loky_mobile_store_test_v1:';
  const INITIAL_BALANCE=600,MAX_RECEIPTS=1000;
  const CATALOG=Object.freeze([
    Object.freeze({id:'snack',category:'food',name:'Galleta',price:40,kind:'consumable',effect:'offer-snack'}),
    Object.freeze({id:'ball',category:'toys',name:'Pelota',price:160,kind:'durable',effect:'play-ball'}),
    Object.freeze({id:'ball-coral',category:'toys',name:'Pelota coral',price:160,kind:'durable',effect:'play-ball'}),
    Object.freeze({id:'outfit',category:'clothes',name:'Ropa para LOKY',price:null,kind:'unavailable',effect:null})
  ]);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const error=code=>Object.assign(new Error(code),{code});
  const initial=()=>({schema:1,testOnly:true,balance:INITIAL_BALANCE,inventory:{},equipped:null,receipts:{},revision:0});
  const itemFor=id=>CATALOG.find(item=>item.id===id);
  const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
  function validate(state){
    const integer=n=>Number.isSafeInteger(n)&&n>=0;
    if(!state||state.schema!==1||state.testOnly!==true||!integer(state.balance)||state.balance>INITIAL_BALANCE||!integer(state.revision)||!state.inventory||typeof state.inventory!=='object'||Array.isArray(state.inventory)||!state.receipts||typeof state.receipts!=='object'||Array.isArray(state.receipts))throw error('STORE_DATA_INVALID');
    for(const [id,count] of Object.entries(state.inventory)){
      const item=itemFor(id);
      if(!item||item.kind==='unavailable'||!integer(count)||count>INITIAL_BALANCE/40||(item.kind==='durable'&&count>1))throw error('STORE_DATA_INVALID');
    }
    if(state.equipped!==null&&(itemFor(state.equipped)?.kind!=='durable'||state.inventory[state.equipped]!==1))throw error('STORE_DATA_INVALID');
    const receipts=Object.entries(state.receipts);
    if(receipts.length>MAX_RECEIPTS||state.revision!==receipts.length)throw error('STORE_DATA_INVALID');
    for(const [id,receipt] of receipts)if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id)||!receipt||receipt.id!==id||!['buy','use','unequip'].includes(receipt.operation)||!itemFor(receipt.itemId)||!integer(receipt.balance)||receipt.balance>INITIAL_BALANCE)throw error('STORE_DATA_INVALID');
    return state;
  }
  async function open({identity='',storage,locks,crypto:crypt,effects={}}){
    if(!storage||!crypt?.subtle||!crypt?.randomUUID)throw error('STORE_UNAVAILABLE');
    // Caller supplies the already-existing identity in memory. It is neither saved nor returned.
    const digest=await crypt.subtle.digest('SHA-256',new TextEncoder().encode('LOKY test store v1\0'+(identity||'local-unactivated-demo')));
    const key=PREFIX+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    identity='';
    const intents=new Map(),completedEffects=new Set();
    function read(){
      let raw;try{raw=storage.getItem(key);}catch{throw error('STORE_STORAGE_UNAVAILABLE');}
      if(raw===null)return initial();
      try{return validate(JSON.parse(raw));}catch{throw error('STORE_DATA_INVALID');}
    }
    function available(item){return item.kind!=='unavailable'&&typeof effects[item.effect]==='function';}
    function catalogue(){const state=read();return CATALOG.map(item=>({...item,available:available(item),owned:state.inventory[item.id]||0}));}
    function prepare(operation,itemId){
      const item=itemFor(itemId);
      if(!item||!['buy','use','unequip'].includes(operation))throw error('STORE_INVALID_REQUEST');
      if(operation!=='unequip'&&!available(item))throw error('STORE_ITEM_UNAVAILABLE');
      if(operation==='unequip'&&item.kind!=='durable')throw error('STORE_INVALID_REQUEST');
      const intent=Object.freeze({id:crypt.randomUUID(),operation,itemId,testOnly:true});
      intents.set(intent.id,intent);return intent;
    }
    function cancel(intent){if(intents.get(intent?.id)===intent)intents.delete(intent.id);}
    async function commit(intent){
      if(intents.get(intent?.id)!==intent)throw error('STORE_INTENT_EXPIRED');
      // Never use an unsafe read/write fallback across tabs. Unsupported browsers fail closed.
      if(typeof locks?.request!=='function')throw error('STORE_LOCK_UNAVAILABLE');
      return locks.request(key,async()=>{
        if(intents.get(intent.id)!==intent)throw error('STORE_INTENT_EXPIRED');
        const state=read(),{id,operation,itemId}=intent,item=itemFor(itemId);
        if(own(state.receipts,id))return {...clone(state.receipts[id]),duplicate:true};
        if(Object.keys(state.receipts).length>=MAX_RECEIPTS)throw error('STORE_TEST_LIMIT');
        if(operation!=='unequip'&&!available(item))throw error('STORE_ITEM_UNAVAILABLE');
        const quantity=state.inventory[itemId]||0;
        if(operation==='buy'){
          if(item.kind==='durable'&&quantity)throw error('STORE_ALREADY_OWNED');
          if(state.balance<item.price)throw error('STORE_INSUFFICIENT_BALANCE');
          state.balance-=item.price;state.inventory[itemId]=quantity+1;
        }else if(operation==='use'){
          if(!quantity)throw error('STORE_NOT_OWNED');
          if(item.kind==='durable'&&state.equipped===itemId)throw error('STORE_ALREADY_EQUIPPED');
          if(!completedEffects.has(id)){
            const result=await effects[item.effect]({itemId,testOnly:true,operationId:id});
            if(result?.executed!==true)throw error('STORE_USE_FAILED');
            completedEffects.add(id);
          }
          if(item.kind==='consumable')state.inventory[itemId]=quantity-1;
          else state.equipped=itemId;
        }else{
          if(state.equipped!==itemId)throw error('STORE_NOT_EQUIPPED');
          if(!completedEffects.has(id)){
            const result=await effects[item.effect]?.({itemId,testOnly:true,operationId:id,remove:true});
            if(result?.executed!==true)throw error('STORE_USE_FAILED');
            completedEffects.add(id);
          }
          state.equipped=null;
        }
        const receipt={id,operation,itemId,balance:state.balance,quantity:state.inventory[itemId]||0,testOnly:true};
        state.receipts[id]=receipt;state.revision++;
        validate(state);
        try{storage.setItem(key,JSON.stringify(state));}catch{throw error('STORE_SAVE_FAILED');}
        return clone(receipt);
      });
    }
    // No reset/top-up API: reopening cannot mint more test points or erase failed data.
    return Object.freeze({snapshot:()=>clone(read()),catalogue,prepare,cancel,commit,testOnly:true});
  }
  const api=Object.freeze({open,catalogue:CATALOG,initialBalance:INITIAL_BALANCE,testOnly:true});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.LokyStoreModel=api;
})(typeof window==='undefined'?globalThis:window);
