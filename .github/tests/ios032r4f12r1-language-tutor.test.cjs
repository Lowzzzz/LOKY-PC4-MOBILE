'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const src=fs.readFileSync('site/mobile-language-tutor.js','utf8');
const index=fs.readFileSync('site/index.html','utf8');

function classList(){
  const set=new Set();
  return {
    add(...xs){xs.forEach(x=>set.add(x));},
    remove(...xs){xs.forEach(x=>set.delete(x));},
    toggle(x,on){
      if(on===undefined){if(set.has(x))set.delete(x);else set.add(x);}
      else if(on)set.add(x); else set.delete(x);
    },
    contains(x){return set.has(x);}
  };
}
function element(){
  return {
    nodeType:1,textContent:'',dataset:{},children:[],attrs:{},disabled:true,className:'',value:'',
    classList:classList(),
    appendChild(x){this.children.push(x);return x;},
    append(...xs){this.children.push(...xs);},
    replaceChildren(...xs){this.children=[...xs];},
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
const userTranscript=element(); userTranscript.textContent='—';
const lokyTranscript=element(); lokyTranscript.textContent='—';

const document={
  body,head,
  createElement(){return element();},
  getElementById(id){
    if(id==='lokyLanguageTutorStyles')return null;
    if(id==='userTranscript')return userTranscript;
    if(id==='lokyTranscript')return lokyTranscript;
    return null;
  },
  querySelector(q){
    if(q==='.future-op-1')return slot1;
    if(q==='.future-op-2')return slot2;
    return null;
  }
};

class FakeObserver{
  constructor(cb){this.cb=cb;}
  observe(){}
  disconnect(){this.disconnected=true;}
}

const store=new Map();
const localStorage={
  getItem(k){return store.has(k)?store.get(k):null;},
  setItem(k,v){store.set(k,String(v));}
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
  console,document,localStorage,MutationObserver:FakeObserver,WebSocket:FakeWebSocket,
  setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},
  Date,String,Number,JSON,Object,Array,Promise,Math,
  window:null,
};
context.window=context;
context.LOKY_PC4_LIVE={state:{activeWs,setupReady:true,userSpeaking:false}};
vm.createContext(context);
vm.runInContext(src,context,{filename:'mobile-language-tutor.js'});

const api=context.LOKY_PC4_LANGUAGE_TUTOR;
assert(api,'Language Tutor API missing');
assert.equal(api.version,'0.3.2R4F12R1-multilingual-avatar-tutor');

assert.equal(slot1.disabled,false,'future-op-1 must be enabled');
assert(slot1.classList.contains('feature-language'),'future-op-1 must be Language Tutor');
assert.equal(slot1.dataset.languageTutorReady,'1');
assert.equal(slot1.attrs['aria-label'],'Aprender idiomas');

assert.equal(slot2.disabled,true,'future-op-2 must remain reserved');
assert.equal(slot2.dataset.languageTutorReady,undefined,'future-op-2 must remain untouched');

const languages=JSON.parse(JSON.stringify(Object.keys(api.languages)));
for(const code of ['es','en','fr','it','pt','de'])assert(languages.includes(code),code+' language missing');
assert.deepEqual(JSON.parse(JSON.stringify(Object.keys(api.levels))),['starter','beginner','intermediate','advanced']);
for(const key of ['conversation','pronunciation','travel','work','vocabulary']){
  assert(Object.keys(api.goals).includes(key),key+' goal missing');
}

const configured=api.activate();
assert.equal(configured.active,true);
assert.equal(api.state.active,true);
assert.equal(api.state.source,'es');
assert.equal(api.state.target,'en');
assert(body.classList.contains('loky-language-active'));
assert(activeWs.sent.length>=1,'active Live session must receive tutor activation');
const control=JSON.parse(activeWs.sent.at(-1));
const controlText=String(control.clientContent.turns[0].parts[0].text);
assert(controlText.includes('START LANGUAGE TUTOR'));
assert(controlText.includes('LOKY MULTILINGUAL LANGUAGE TUTOR — ACTIVE'));
assert(controlText.includes('Español'));
assert(controlText.includes('Inglés'));

const fresh=new FakeWebSocket();
fresh.send(JSON.stringify({
  setup:{
    systemInstruction:{parts:[{text:'BASE'}]},
    sessionResumption:{},
    generationConfig:{}
  }
}));
const setup=JSON.parse(fresh.sent[0]);
const systemText=setup.setup.systemInstruction.parts.map(x=>x.text).join('\n');
assert(systemText.includes('BASE'));
assert(systemText.includes('LOKY MULTILINGUAL LANGUAGE TUTOR — ACTIVE'));
assert(systemText.includes('Español'));
assert(systemText.includes('Inglés'));

const resumed=new FakeWebSocket();
resumed.send(JSON.stringify({
  setup:{
    systemInstruction:{parts:[{text:'BASE'}]},
    sessionResumption:{handle:'resume-123'}
  }
}));
const resumedSetup=JSON.parse(resumed.sent[0]);
assert.equal(resumedSetup.setup.systemInstruction.parts.length,1,'resumed setup must not be mutated');

api.quick('hint');
assert(String(JSON.parse(activeWs.sent.at(-1)).clientContent.turns[0].parts[0].text).includes('HINT'));
api.quick('slower');
assert(String(JSON.parse(activeWs.sent.at(-1)).clientContent.turns[0].parts[0].text).includes('SLOWER'));
api.quick('translate');
assert(String(JSON.parse(activeWs.sent.at(-1)).clientContent.turns[0].parts[0].text).includes('TRANSLATE'));
api.quick('scenario');
assert(String(JSON.parse(activeWs.sent.at(-1)).clientContent.turns[0].parts[0].text).includes('NEW SCENARIO'));

api.deactivate();
assert.equal(api.state.active,false);
assert(!body.classList.contains('loky-language-active'));
const exitControl=JSON.parse(activeWs.sent.at(-1));
assert(String(exitControl.clientContent.turns[0].parts[0].text).includes('EXIT LANGUAGE TUTOR'));

assert(index.includes('<script src="./mobile-language-tutor.js?v=0.3.2r4f12r1"></script>'));
assert(index.indexOf('mobile-actions.js?v=0.3.2r4f11r6') < index.indexOf('mobile-language-tutor.js?v=0.3.2r4f12r1'));

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
assert(src.includes("const AVATAR_URL='./language-avatar.webp?v=0.3.2r4f12r1'"));
assert(src.includes('PISTA'));
assert(src.includes('MÁS LENTO'));
assert(src.includes('TRADUCIR'));
assert(src.includes('CAMBIAR TEMA'));

console.log('R4F12R1 multilingual avatar tutor tests PASS');
