'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const src=fs.readFileSync('site/mobile-planner.js','utf8');

function fakeElement(){
  return {
    nodeType:1,
    textContent:'',
    value:'',
    type:'',
    maxLength:0,
    dataset:{},
    children:[],
    className:'',
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    appendChild(child){this.children.push(child);return child;},
    remove(){},
    addEventListener(){},
    setAttribute(){},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    matches(){return false;},
  };
}

const store={};
const body=fakeElement();
const head=fakeElement();
const transcript=fakeElement();
const state=fakeElement();

const document={
  body,head,
  getElementById(id){
    if(id==='userTranscript')return transcript;
    if(id==='conversationState')return state;
    return null;
  },
  createElement(){return fakeElement();},
  querySelector(){return null;},
  addEventListener(){},
};

class FakeObserver{constructor(cb){this.cb=cb;}observe(){}disconnect(){}}

const context={
  console,
  document,
  localStorage:{
    getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
    setItem:(k,v)=>{store[k]=String(v);},
    removeItem:k=>{delete store[k];},
  },
  MutationObserver:FakeObserver,
  crypto:{randomUUID:()=>`id-${Math.random()}`},
  Intl,
  Date,
  Number,
  Math,
  JSON,
  String,
  Array,
  Object,
  RegExp,
  Uint8Array,
  DataView,
  Promise,
  navigator:{},
  requestAnimationFrame:fn=>{fn();return 1;},
  setInterval:()=>1,
  clearInterval:()=>{},
  setTimeout:()=>1,
  clearTimeout:()=>{},
  addEventListener:()=>{},
  window:null,
};
context.window=context;
vm.createContext(context);
vm.runInContext(src,context,{filename:'mobile-planner.js'});

const api=context.LOKY_PC4_PLANNER;
assert(api,'planner API missing');
assert.equal(api.version,'0.3.2R4F8-planner-v1');

const now=new Date(2026,8,17,10,0,0,0).getTime();

let p=api.parseVoiceCommand('recuérdame llamar a Juan mañana a las 3 de la tarde',now);
assert(p);
assert.equal(p.type,'reminder');
assert.equal(p.title,'llamar a Juan');
let d=new Date(p.at);
assert.equal(d.getDate(),18);
assert.equal(d.getHours(),15);
assert.equal(d.getMinutes(),0);

p=api.parseVoiceCommand('pon una alarma a las 7 de la mañana',now);
assert(p);
assert.equal(p.type,'alarm');
assert.equal(p.title,'Alarma');
d=new Date(p.at);
assert.equal(d.getDate(),18);
assert.equal(d.getHours(),7);

p=api.parseVoiceCommand('agenda dentista mañana a las 4:30 de la tarde',now);
assert(p);
assert.equal(p.type,'calendar');
assert.equal(p.title,'dentista');
d=new Date(p.at);
assert.equal(d.getDate(),18);
assert.equal(d.getHours(),16);
assert.equal(d.getMinutes(),30);

p=api.parseVoiceCommand('recuérdame en 15 minutos sacar la ropa',now);
assert(p);
assert.equal(p.type,'reminder');
assert.equal(p.title,'sacar la ropa');
assert.equal(p.at,now+15*60*1000);

p=api.parseVoiceCommand('recuérdame comprar leche',now);
assert(p);
assert.equal(p.error,'MISSING_TIME');

assert.equal(api.parseVoiceCommand('abre google',now),null);

const item=api.add('reminder','Comprar pan',now+3600000,'voice');
assert(item);
assert.equal(api.snapshot().length,1);
const dupe=api.add('reminder','Comprar pan',now+3600000,'voice');
assert.equal(dupe.id,item.id);
assert.equal(api.snapshot().length,1);
assert.equal(api.update(item.id,{done:true}),true);
assert(api.snapshot()[0].doneAt>0);
assert.equal(api.remove(item.id),true);
assert.equal(api.snapshot().length,0);

assert(!/new\s+WebSocket\s*\(/.test(src));
assert(!/getUserMedia\s*\(/.test(src));
assert(!/LOKY_PC4_LIVE/.test(src));
assert(src.includes("String(conversationState.textContent||'').trim()==='PENSANDO'"));
assert(src.includes("Notification.requestPermission()"));
assert(src.includes("navigator.serviceWorker?.ready"));
assert(src.includes("loky-organizer-card"));
assert(src.includes("RECORDATORIOS"));
assert(src.includes("CALENDARIO"));
assert(src.includes("ALARMAS"));

console.log('R4F8 planner reminders alarms calendar PASS');
