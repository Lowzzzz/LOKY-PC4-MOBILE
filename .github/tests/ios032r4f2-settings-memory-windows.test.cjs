'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const src=fs.readFileSync('site/mobile-features.js','utf8');

function element(id=''){
  const el={
    id,
    tagName:'',
    className:'',
    textContent:'',
    value:'',
    dataset:{},
    attrs:{},
    children:[],
    listeners:{},
    disabled:false,
    parentNode:null,
    classList:{
      set:new Set(),
      add(...x){x.forEach(v=>this.set.add(v));},
      remove(...x){x.forEach(v=>this.set.delete(v));},
      contains(x){return this.set.has(x);},
      toggle(x,on){if(on===undefined){this.set.has(x)?this.set.delete(x):this.set.add(x);return this.set.has(x);}if(on)this.set.add(x);else this.set.delete(x);return on;},
    },
    appendChild(child){child.parentNode=this;this.children.push(child);return child;},
    removeChild(child){const i=this.children.indexOf(child);if(i>=0)this.children.splice(i,1);child.parentNode=null;return child;},
    remove(){if(this.parentNode)this.parentNode.removeChild(this);},
    setAttribute(k,v){this.attrs[k]=String(v);},
    addEventListener(type,fn){(this.listeners[type]||(this.listeners[type]=[])).push(fn);},
    dispatch(type,event={}){for(const fn of this.listeners[type]||[])fn({...event,target:this,currentTarget:this});},
  };
  Object.defineProperty(el,'firstChild',{get(){return this.children[0]||null;}});
  return el;
}

const body=element('body');
const root=element('html');
const conversationShell=element('conversation-shell');
conversationShell.classList.add('conversation-shell');
const els={
  conversationState:element('conversationState'),
  userTranscript:element('userTranscript'),
  talkButton:element('talkButton'),
};

const track={kind:'audio',readyState:'live',enabled:true};
const liveState={
  suppressPlaybackUntil:0,
  playing:new Set(),
  playCursor:0,
  audioContext:{currentTime:2},
  userSpeaking:false,
  mediaStream:{getAudioTracks:()=>[track]},
};

const store={};
const localStorage={
  getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
  setItem:(k,v)=>{store[k]=String(v);},
  removeItem:k=>{delete store[k];},
};

class FakeObserver{constructor(cb){this.cb=cb;}observe(){}disconnect(){}}
class FakeWS{
  constructor(url){this.url=url;this.sent=[];this.readyState=1;}
  send(data){this.sent.push(data);}
}
FakeWS.OPEN=1;

const document={
  body,
  documentElement:root,
  getElementById:id=>els[id]||null,
  querySelector:q=>q==='.conversation-shell'?conversationShell:null,
  createElement:tag=>{const el=element();el.tagName=String(tag).toUpperCase();return el;},
};

let parseCount=0;
const instrumentedJSON={
  parse(text){parseCount++;return JSON.parse(text);},
  stringify:JSON.stringify,
};

const context={
  console,
  document,
  localStorage,
  MutationObserver:FakeObserver,
  WebSocket:FakeWS,
  window:null,
  setTimeout,
  clearTimeout,
  Date,
  JSON:instrumentedJSON,
  Number,
};
context.window=context;
context.requestAnimationFrame=fn=>{fn();return 1;};
context.LOKY_PC4_LIVE={state:liveState};
vm.createContext(context);
vm.runInContext(src,context,{filename:'mobile-features.js'});

const api=context.LOKY_PC4_FEATURES;
assert(api,'feature API missing');
assert.equal(api.version,'0.3.2R4F2-settings-memory-windows');

// Dock contract: left slots remain reserved; right slots become actionable.
assert.equal(api.slots.length,4);
assert.equal(api.slots[0].disabled,true);
assert.equal(api.slots[1].disabled,true);
assert.equal(api.slots[2].disabled,false);
assert.equal(api.slots[3].disabled,false);
assert(api.slots[2].classList.contains('feature-settings'));
assert(api.slots[3].classList.contains('feature-memory'));

// Thinking gate from R4F1R2 stays intact.
els.conversationState.textContent='PENSANDO';
api.thinkingGate.sync();
assert.equal(track.enabled,false);
els.conversationState.textContent='ESCUCHANDO';
api.thinkingGate.sync();
assert.equal(track.enabled,true);

// Settings persist and include the requested vulgar mode without touching PCM frames.
assert.equal(api.settings.speechMode,'natural');
assert.equal(api.settings.setSpeechMode('vulgar'),true);
assert.equal(api.settings.speechMode,'vulgar');
assert(api.settings.instruction().includes('VULGAR'));

// Manual memories are visible to context, and can be deleted.
api.memory.clear();
assert.equal(api.memory.addManual('El nombre de mi perro es Loki'),true);
let memories=api.memory.snapshot();
assert.equal(memories.length,1);
assert.equal(memories[0].source,'manual');
assert(api.memory.context().includes('El nombre de mi perro es Loki'));
const memoryAt=memories[0].at;
assert.equal(api.memory.forget(memoryAt),true);
assert.equal(api.memory.snapshot().length,0);
api.memory.addManual('Mi bebida favorita es café');

function textTree(node){
  let out=String(node?.textContent||'');
  for(const child of node?.children||[])out+=' '+textTree(child);
  return out;
}

// Full-screen settings window opens, has mode choices, and closes without reload/navigation.
api.windows.openSettings();
assert(api.windows.active,'settings window not active');
assert(body.classList.contains('loky-window-open'));
let settingsText=textTree(api.windows.active);
assert(settingsText.includes('CONFIGURACIÓN'));
assert(settingsText.includes('Vulgar'));
assert(settingsText.includes('PERSONALIDAD'));
api.windows.close(true);
assert.equal(api.windows.active,null);
assert(!body.classList.contains('loky-window-open'));

// Memory window exposes memories plus future organizer sections.
api.windows.openMemory();
assert(api.windows.active,'memory window not active');
const memoryText=textTree(api.windows.active);
assert(memoryText.includes('MEMORIAS'));
assert(memoryText.includes('Mi bebida favorita es café'));
assert(memoryText.includes('RECORDATORIOS'));
assert(memoryText.includes('CALENDARIO'));
assert(memoryText.includes('ALARMAS'));
api.windows.close(true);

// Fresh setup receives memory + speech style. Realtime PCM remains on direct send hot path.
const ws=new FakeWS('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=x');
ws.send(JSON.stringify({setup:{systemInstruction:{parts:[{text:'BASE'}]},sessionResumption:{}}}));
const setup=JSON.parse(ws.sent[0]);
const setupText=setup.setup.systemInstruction.parts.map(x=>x.text||'').join('\n');
assert(setupText.includes('BASE'));
assert(setupText.includes('Mi bebida favorita es café'));
assert(setupText.includes('Modo de hablar VULGAR'));

const parseBeforePcm=parseCount;
for(let i=0;i<200;i++)ws.send('{"realtimeInput":{"audio":{"data":"AAAA","mimeType":"audio/pcm;rate=16000"}}}');
assert.equal(parseCount,parseBeforePcm,'PCM entered settings/memory JSON parse path');

// Silence contract remains available.
api.silence();
assert.equal(api.silenced,true);
assert(body.classList.contains('loky-silenced'));
api.resume();
assert.equal(api.silenced,false);

console.log('R4F2 settings/memory windows tests PASS');
