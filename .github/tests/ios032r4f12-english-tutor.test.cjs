'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const src=fs.readFileSync('site/mobile-english.js','utf8');
const index=fs.readFileSync('site/index.html','utf8');

function classList(){
  const set=new Set();
  return {
    add(...xs){xs.forEach(x=>set.add(x));},
    remove(...xs){xs.forEach(x=>set.delete(x));},
    toggle(x,on){if(on===undefined){if(set.has(x))set.delete(x);else set.add(x);}else if(on)set.add(x);else set.delete(x);},
    contains(x){return set.has(x);},
  };
}
function element(){
  return {
    nodeType:1,textContent:'',dataset:{},children:[],attrs:{},disabled:true,className:'',
    classList:classList(),
    appendChild(x){this.children.push(x);return x;},
    append(...xs){this.children.push(...xs);},
    remove(){this.removed=true;},
    setAttribute(k,v){this.attrs[k]=String(v);},
    addEventListener(type,fn){this.listeners=this.listeners||{};this.listeners[type]=fn;},
    querySelector(){return null;},
  };
}
const body=element(); body.classList=classList();
const head=element();
const slot1=element(); slot1.className='future-op-button future-op-1';
const slot2=element(); slot2.className='future-op-button future-op-2';
const shell=element(); shell.className='conversation-shell';
const document={
  body,head,
  createElement(){return element();},
  getElementById(id){if(id==='lokyEnglishTutorStyles')return null;return null;},
  querySelector(q){
    if(q==='.future-op-1')return slot1;
    if(q==='.future-op-2')return slot2;
    if(q==='.conversation-shell')return shell;
    return null;
  },
};
const store=new Map();
const localStorage={
  getItem(k){return store.has(k)?store.get(k):null;},
  setItem(k,v){store.set(k,String(v));},
  removeItem(k){store.delete(k);}
};
class FakeWebSocket{
  constructor(url='wss://example/BidiGenerateContentConstrained'){
    this.url=url;this.readyState=1;this.sent=[];
  }
  send(data){this.sent.push(data);return true;}
}
FakeWebSocket.OPEN=1;

const activeWs=new FakeWebSocket();
const context={
  console,document,localStorage,WebSocket:FakeWebSocket,
  setTimeout:()=>1,clearTimeout:()=>{},JSON,String,Object,Array,Promise,
  window:null,
};
context.window=context;
context.LOKY_PC4_LIVE={state:{activeWs,setupReady:true}};
vm.createContext(context);
vm.runInContext(src,context,{filename:'mobile-english.js'});

const api=context.LOKY_PC4_ENGLISH_TUTOR;
assert(api,'English Tutor API missing');
assert.equal(api.version,'0.3.2R4F12-english-tutor');

assert.equal(slot1.disabled,false,'future-op-1 must be enabled');
assert(slot1.classList.contains('feature-english'),'future-op-1 must become English Coach');
assert.equal(slot1.dataset.englishTutorReady,'1');
assert.equal(slot1.attrs['aria-label'],'English Coach');

assert.equal(slot2.disabled,true,'future-op-2 must remain reserved');
assert.equal(slot2.dataset.englishTutorReady,undefined,'future-op-2 must remain untouched');

assert.deepEqual(JSON.parse(JSON.stringify(Object.keys(api.levels))),['beginner','intermediate','advanced']);
assert.deepEqual(JSON.parse(JSON.stringify(Object.keys(api.focuses))),['conversation','pronunciation','vocabulary','situations']);

const activated=api.activate('beginner','conversation');
assert.equal(activated.active,true);
assert.equal(api.state.active,true);
assert.equal(api.state.level,'beginner');
assert.equal(api.state.focus,'conversation');
assert(body.classList.contains('loky-english-active'));
assert(activeWs.sent.length>=1,'active Live session must receive tutor control');
const control=JSON.parse(activeWs.sent.at(-1));
assert.equal(control.clientContent.turnComplete,true);
assert(String(control.clientContent.turns[0].parts[0].text).includes('ACTIVATE ENGLISH COACH'));

const fresh=new FakeWebSocket();
fresh.send(JSON.stringify({
  setup:{
    systemInstruction:{parts:[{text:'BASE'}]},
    sessionResumption:{},
    generationConfig:{}
  }
}));
assert.equal(fresh.sent.length,1);
const setup=JSON.parse(fresh.sent[0]);
const systemText=setup.setup.systemInstruction.parts.map(x=>x.text).join('\n');
assert(systemText.includes('BASE'));
assert(systemText.includes('LOKY ENGLISH COACH MODE — ACTIVE'));
assert(systemText.includes('Nivel seleccionado: PRINCIPIANTE'));
assert(systemText.includes('Enfoque seleccionado: CONVERSACIÓN'));

const resumed=new FakeWebSocket();
resumed.send(JSON.stringify({
  setup:{
    systemInstruction:{parts:[{text:'BASE'}]},
    sessionResumption:{handle:'resume-123'}
  }
}));
const resumedSetup=JSON.parse(resumed.sent[0]);
assert.equal(resumedSetup.setup.systemInstruction.parts.length,1,'resumed setup must not be mutated');

api.deactivate();
assert.equal(api.state.active,false);
assert(!body.classList.contains('loky-english-active'));
const exitControl=JSON.parse(activeWs.sent.at(-1));
assert(String(exitControl.clientContent.turns[0].parts[0].text).includes('EXIT ENGLISH COACH'));

assert(index.includes('<script src="./mobile-english.js?v=0.3.2r4f12"></script>'));
assert(index.indexOf('mobile-features.js?v=0.3.2r4f1') < index.indexOf('mobile-english.js?v=0.3.2r4f12'));

for(const forbidden of [
  /new\s+WebSocket\s*\(/,
  /getUserMedia\s*\(/,
  /fetch\s*\(/,
  /speechSynthesis/,
  /navigator\.geolocation/,
]) assert(!forbidden.test(src),`forbidden independent runtime: ${forbidden}`);

assert(src.includes('const previousSend=WebSocket.prototype.send'));
assert(src.includes('return previousSend.call(this,data)'));
assert(src.includes("document.querySelector('.future-op-1')"));
assert(!src.includes("document.querySelector('.future-op-2')"));

console.log('R4F12 English Tutor isolated layer tests PASS');
