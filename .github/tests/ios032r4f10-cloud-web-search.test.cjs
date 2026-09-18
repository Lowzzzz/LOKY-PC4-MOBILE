'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const src=fs.readFileSync('site/mobile-web-search.js','utf8');
const index=fs.readFileSync('site/index.html','utf8');
const live=fs.readFileSync('site/live-mobile.js','utf8');

function fakeElement(){
  return {
    nodeType:1,
    textContent:'',
    className:'',
    innerHTML:'',
    children:[],
    style:{},
    dataset:{},
    classList:{add(){},remove(){},toggle(){}},
    appendChild(child){this.children.push(child);return child;},
    replaceChildren(){this.children=[];},
    addEventListener(){},
    querySelector(){return fakeElement();},
    querySelectorAll(){return [];},
  };
}
const body=fakeElement();
const head=fakeElement();
const transcript=fakeElement();
const document={
  body,head,
  getElementById(id){return id==='userTranscript'?transcript:null;},
  createElement(){return fakeElement();},
  querySelector(){return null;},
  querySelectorAll(){return [];},
};
class FakeObserver{constructor(cb){this.cb=cb;}observe(){}disconnect(){}}

const store={loky_pc4_device_capability_v1:'test-capability-123456789'};
const context={
  console,
  document,
  localStorage:{
    getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
    setItem:(k,v)=>{store[k]=String(v);},
  },
  MutationObserver:FakeObserver,
  requestAnimationFrame:fn=>{fn();return 1;},
  setTimeout:()=>1,
  clearTimeout:()=>{},
  Date,
  String,
  Array,
  Object,
  JSON,
  RegExp,
  Promise,
  fetch:async()=>{throw new Error('network disabled in test');},
  window:null,
};
context.window=context;
vm.createContext(context);
vm.runInContext(src,context,{filename:'mobile-web-search.js'});

const api=context.LOKY_PC4_WEB_SEARCH;
assert(api,'web search API missing');
assert.equal(api.version,'0.3.2R4F10R1-verified-contact-live-tool');

assert.equal(api.intent('LOKY búscame el teléfono de Apple Store Stamford'),true);
assert.equal(api.intent('¿Cuál es el número de teléfono de Apple Store Stamford?'),true);
assert.equal(api.intent('averigua el horario de Costco mañana'),true);
assert.equal(api.intent('encuentra la página web de OpenAI'),true);
assert.equal(api.intent('busca las últimas noticias de Bitcoin'),true);
assert.equal(api.intent('qué pasó hoy con Bitcoin'),true);
assert.equal(api.intent('recuérdame comprar leche en dos minutos'),false);
assert.equal(api.intent('ponme una alarma en cinco minutos'),false);
assert.equal(api.intent('abre google'),false);

assert(index.includes('<script src="./mobile-web-search.js?v=0.3.2r4f10"></script>'));
assert(index.indexOf('live-mobile.js?v=0.3.2') < index.indexOf('mobile-web-search.js?v=0.3.2r4f10'));

assert(src.includes("const ENDPOINT='https://novgwydgcvlboujnmygq.supabase.co/functions/v1/loky-pc4-mobile-search'"));
assert(src.includes("const DEVICE_KEY='loky_pc4_device_capability_v1'"));
assert(src.includes("const SEARCH_DEBOUNCE_MS=260"));
assert(src.includes("const REPEAT_GUARD_MS=12000"));
assert(src.includes("window.LOKY_PC4_LIVE"));
assert(src.includes("state?.activeWs"));
assert(src.includes("clientContent:{"));
assert(src.includes("role:'user'"));
assert(src.includes("turnComplete:true"));
assert(src.includes("function holdLiveSearch("));
assert(src.includes("turnComplete:false"));
assert(src.includes("[LOKY WEB TOOL RESULT — BÚSQUEDA REAL EJECUTADA AHORA]"));
assert(src.includes("Estado de acceso Web de LOKY: ACTIVO."));
assert(src.includes("NO digas que no tienes acceso a Internet"));
assert(src.includes("function finishLiveSearchError("));
assert(src.includes("WEB EN TIEMPO REAL · VERIFICADO"));
assert(src.includes("FUENTES"));
assert(src.includes("noopener noreferrer"));
assert(src.includes("window.LOKY_PC4_WEB_SEARCH"));
assert(src.includes("toolHoldActive"));
assert(src.includes("heldQuery"));

assert(!/new\s+WebSocket\s*\(/.test(src));
assert(!/getUserMedia\s*\(/.test(src));
assert(!/speechSynthesis/.test(src));
assert(!/navigator\.geolocation/.test(src));

assert(live.includes("window.LOKY_PC4_LIVE={"));
assert(live.includes("state,"));

console.log('R4F10 cloud web search isolated layer PASS');
