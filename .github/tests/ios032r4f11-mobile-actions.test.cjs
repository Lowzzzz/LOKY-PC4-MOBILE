'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const src=fs.readFileSync('site/mobile-actions.js','utf8');
const index=fs.readFileSync('site/index.html','utf8');

function element(){
  return {
    nodeType:1,textContent:'',dataset:{},children:[],attrs:{},disabled:false,
    classList:{set:new Set(),add(...x){x.forEach(v=>this.set.add(v));},remove(...x){x.forEach(v=>this.set.delete(v));}},
    appendChild(x){this.children.push(x);return x;},
    append(...xs){this.children.push(...xs);},
    remove(){this.removed=true;},
    setAttribute(k,v){this.attrs[k]=String(v);},
    addEventListener(){},
    querySelector(){return null;},
  };
}
const transcript=element();
const state=element();
const slot=element();
const body=element();
const head=element();
const document={
  body,head,
  getElementById(id){
    if(id==='userTranscript')return transcript;
    if(id==='conversationState')return state;
    if(id==='loky-mobile-actions-style')return null;
    return null;
  },
  createElement(){return element();},
  querySelector(q){return q==='.future-op-1'?slot:null;},
};
class FakeObserver{constructor(cb){this.cb=cb;}observe(){}disconnect(){}}
const context={
  console,document,MutationObserver:FakeObserver,
  navigator:{userAgent:'iPhone',platform:'iPhone',maxTouchPoints:5,clipboard:{writeText:async()=>{}}},
  location:{assign(){}},
  setTimeout:()=>1,clearTimeout:()=>{},
  Date,String,Number,JSON,RegExp,Math,Promise,encodeURIComponent,
  window:null,
};
context.window=context;
context.LOKY_PC4_LIVE={state:{userSpeaking:false}};
context.LOKY_PC4_FEATURES={windows:{openSettings(){context._settingsOpened=true;}}};
context.LOKY_PC4_PLANNER={add(){return {id:'t'};},checkDue(){},open(){}};
vm.createContext(context);
vm.runInContext(src,context,{filename:'mobile-actions.js'});

const api=context.LOKY_PC4_MOBILE_ACTIONS;
assert(api,'Mobile Actions API missing');
assert.equal(api.version,'0.3.2R4F11R1-voice-actions-fix');

assert.deepEqual(JSON.parse(JSON.stringify(api.parse('LOKY abre Maps'))),{type:'maps-open'});
assert.deepEqual(JSON.parse(JSON.stringify(api.parse('LOKY llévame a Plaza Las Américas'))),{type:'maps-directions',destination:'plaza las americas'});
assert.deepEqual(JSON.parse(JSON.stringify(api.parse('pon salsa en YouTube'))),{type:'youtube-search',query:'salsa'});
assert.deepEqual(JSON.parse(JSON.stringify(api.parse('abre WhatsApp'))),{type:'whatsapp-open'});
assert.deepEqual(JSON.parse(JSON.stringify(api.parse('manda hola familia por WhatsApp'))),{type:'whatsapp-share',text:'hola familia'});
assert.deepEqual(JSON.parse(JSON.stringify(api.parse('abre configuración'))),{type:'loky-settings'});
assert.deepEqual(JSON.parse(JSON.stringify(api.parse('abre configuración del iPhone'))),{type:'system-settings-unavailable'});
assert.deepEqual(JSON.parse(JSON.stringify(api.parse('copia el texto hola mundo'))),{type:'copy',text:'hola mundo'});

const timer=api.parse('pon un temporizador de cinco minutos');
assert(timer&&timer.type==='timer');
assert.equal(timer.ms,5*60*1000);

const timer2=api.parse('inicia temporizador de una hora y treinta minutos');
assert(timer2&&timer2.type==='timer');
assert.equal(timer2.ms,(60+30)*60*1000);

assert.equal(api.parse('búscame el teléfono de Apple Store'),null,'Web Search intent must remain owned by Web Search');
assert.equal(api.parse('pon una alarma en cinco minutos'),null,'existing alarm intent must remain owned by Planner');

assert(index.includes('<script src="./mobile-actions.js?v=0.3.2r4f11r1"></script>'));
assert(index.indexOf('mobile-planner.js?v=0.3.2r4f8') < index.indexOf('mobile-actions.js?v=0.3.2r4f11r1'));
assert(index.indexOf('mobile-web-search.js?v=0.3.2r4f10r3') < index.indexOf('mobile-actions.js?v=0.3.2r4f11r1'));

for(const forbidden of [
  /new\s+WebSocket\s*\(/,
  /getUserMedia\s*\(/,
  /fetch\s*\(/,
  /speechSynthesis/,
  /navigator\.geolocation/,
  /App-Prefs:/i,
  /prefs:/i,
]) assert(!forbidden.test(src),`forbidden transport/private API: ${forbidden}`);

assert(src.includes('new MutationObserver(scheduleFromTranscript)'));
assert(src.includes('if(live?.userSpeaking)'));
assert(src.includes('const TRANSCRIPT_SETTLE_MS=260'));
assert(!src.includes('future-op-1'));
assert(!src.includes('openActionsMenu'));
assert(!src.includes('ACCIONES MÓVILES'));
assert(src.includes("window.LOKY_PC4_PLANNER"));
assert(src.includes("window.LOKY_PC4_FEATURES"));
assert(src.includes("location.assign(url)"));

console.log('R4F11 isolated Mobile Actions tests PASS');
