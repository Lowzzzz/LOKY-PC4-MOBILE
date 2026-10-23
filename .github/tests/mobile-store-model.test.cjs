'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto').webcrypto;
const model=require('../../site/pet-store-model.js');
function fixture(){
  const data=new Map([['existing-session','unchanged'],['productive-balance','9876']]);
  let failSave=false,uses=0,failUse=false;
  const storage={getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>{if(failSave)throw Error('quota');data.set(k,v);}};
  const queues=new Map(),locks={request(key,fn){const task=(queues.get(key)||Promise.resolve()).catch(()=>{}).then(fn);queues.set(key,task);return task;}};
  const effects={'offer-snack':async()=>{uses++;return {executed:!failUse};},'play-ball':async()=>{uses++;return {executed:!failUse};}};
  return {data,storage,locks,effects,get uses(){return uses;},set failSave(v){failSave=v;},set failUse(v){failUse=v;},open:(identity='test-profile-A',extra={})=>model.open({identity,storage,locks,crypto,effects,...extra})};
}
const buy=(s,id='snack')=>s.commit(s.prepare('buy',id));
test('isolated test balance, profile persistence and no identity/production writes',async()=>{
  const f=fixture(),a=await f.open();assert.equal(a.snapshot().balance,600);assert.equal(f.data.size,2);
  await buy(a);const reopened=await f.open();assert.equal(reopened.snapshot().balance,560);assert.equal(reopened.snapshot().inventory.snack,1);
  const b=await f.open('test-profile-B');assert.equal(b.snapshot().balance,600);assert.deepEqual(b.snapshot().inventory,{});
  await buy(b,'ball');assert.equal(a.snapshot().balance,560);assert.equal(f.data.get('existing-session'),'unchanged');assert.equal(f.data.get('productive-balance'),'9876');
  for(const [key,value] of [...f.data].slice(2)){assert.match(key,/^loky_mobile_store_test_v1:[0-9a-f]{64}$/);assert(!value.includes('test-profile'));}
});
test('double click commits exactly one purchase; reuse returns same receipt',async()=>{
  const f=fixture(),s=await f.open(),intent=s.prepare('buy','snack');
  const results=await Promise.all(Array.from({length:10},()=>s.commit(intent)));
  assert.equal(results.filter(r=>!r.duplicate).length,1);assert.equal(s.snapshot().balance,560);assert.equal(s.snapshot().inventory.snack,1);
  assert.equal((await s.commit(intent)).duplicate,true);
});
test('parallel tabs cannot overspend or lose purchases',async()=>{
  const f=fixture(),a=await f.open(),b=await f.open();
  const results=await Promise.allSettled(Array.from({length:20},(_,i)=>buy(i%2?a:b)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,15);assert.equal(results.filter(r=>r.reason?.code==='STORE_INSUFFICIENT_BALANCE').length,5);
  assert.equal(a.snapshot().balance,0);assert.equal(b.snapshot().inventory.snack,15);
});
test('unusable items cannot be sold; durable purchase cannot be duplicated',async()=>{
  const f=fixture(),s=await f.open();assert.throws(()=>s.prepare('buy','outfit'),{code:'STORE_ITEM_UNAVAILABLE'});
  const unsupported=await f.open('unsupported',{effects:{}});assert(unsupported.catalogue().every(i=>!i.available));assert.throws(()=>unsupported.prepare('buy','ball'),{code:'STORE_ITEM_UNAVAILABLE'});
  await buy(s,'ball');await assert.rejects(buy(s,'ball'),{code:'STORE_ALREADY_OWNED'});assert.equal(s.snapshot().balance,440);
});
test('cancel/back intent is inert, forged intent and invalid IDs rejected',async()=>{
  const f=fixture(),s=await f.open(),intent=s.prepare('buy','snack');s.cancel(intent);
  await assert.rejects(s.commit(intent),{code:'STORE_INTENT_EXPIRED'});assert.equal(s.snapshot().balance,600);
  await assert.rejects(s.commit({...s.prepare('buy','snack')}),{code:'STORE_INTENT_EXPIRED'});
  assert.throws(()=>s.prepare('buy','__proto__'),{code:'STORE_INVALID_REQUEST'});
});
test('consume once, keep inventory on failed use, persist equip and unequip',async()=>{
  const f=fixture(),s=await f.open();await buy(s);
  f.failUse=true;const use=s.prepare('use','snack');await assert.rejects(s.commit(use),{code:'STORE_USE_FAILED'});assert.equal(s.snapshot().inventory.snack,1);
  f.failUse=false;await Promise.all([s.commit(use),s.commit(use)]);assert.equal(f.uses,2);assert.equal(s.snapshot().inventory.snack,0);
  await assert.rejects(s.commit(s.prepare('use','snack')),{code:'STORE_NOT_OWNED'});
  await buy(s,'ball');await s.commit(s.prepare('use','ball'));assert.equal((await f.open()).snapshot().equipped,'ball');
  await s.commit(s.prepare('unequip','ball'));assert.equal((await f.open()).snapshot().equipped,null);assert.equal(s.snapshot().inventory.ball,1);
});
test('failed persistence reports failure without debit and retry does not repeat use effect',async()=>{
  const f=fixture(),s=await f.open(),purchase=s.prepare('buy','snack');f.failSave=true;
  await assert.rejects(s.commit(purchase),{code:'STORE_SAVE_FAILED'});assert.equal(s.snapshot().balance,600);
  f.failSave=false;await s.commit(purchase);const use=s.prepare('use','snack');f.failSave=true;
  await assert.rejects(s.commit(use),{code:'STORE_SAVE_FAILED'});assert.equal(s.snapshot().inventory.snack,1);assert.equal(f.uses,1);
  f.failSave=false;await s.commit(use);assert.equal(f.uses,1);assert.equal(s.snapshot().inventory.snack,0);
});
test('corrupted state is not silently reset or credited; unsupported lock fails closed',async()=>{
  const f=fixture(),s=await f.open();await buy(s);const key=[...f.data.keys()].find(k=>k.startsWith('loky_mobile_store_test_v1:'));f.data.set(key,'broken');
  assert.throws(()=>s.snapshot(),{code:'STORE_DATA_INVALID'});await assert.rejects(buy(s),{code:'STORE_DATA_INVALID'});assert.equal(f.data.get(key),'broken');
  const unsupported=await f.open('unsupported',{locks:null});await assert.rejects(buy(unsupported),{code:'STORE_LOCK_UNAVAILABLE'});
});
