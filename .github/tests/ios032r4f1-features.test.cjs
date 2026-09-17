'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const src=fs.readFileSync('site/mobile-features.js','utf8');

function element(id=''){
  return {
    id,
    textContent:'',
    dataset:{},
    children:[],
    attrs:{},
    classList:{
      set:new Set(),
      add(...x){x.forEach(v=>this.set.add(v));},
      remove(...x){x.forEach(v=>this.set.delete(v));},
      contains(x){return this.set.has(x);},
      toggle(x,on){if(on)this.set.add(x);else this.set.delete(x);},
    },
    appendChild(x){this.children.push(x);return x;},
    setAttribute(k,v){this.attrs[k]=String(v);},
    addEventListener(){},
  };
}

const els={
  conversationState:element('conversationState'),
  conversationHint:element('conversationHint'),
  userTranscript:element('userTranscript'),
  lokyTranscript:element('lokyTranscript'),
  talkButton:element('talkButton'),
};
const conversationShell=element('conversation-shell');
conversationShell.classList.add('conversation-shell');
const body=element('body');
const root=element('html');

const store={};
const localStorage={
  getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
  setItem:(k,v)=>{store[k]=String(v);},
  removeItem:k=>{delete store[k];},
};

class FakeObserver{
  constructor(cb){this.cb=cb;}
  observe(){}
  disconnect(){}
}

class FakeWS{
  constructor(url){this.url=url;this.sent=[];this.readyState=1;}
  send(data){this.sent.push(data);}
}
FakeWS.OPEN=1;

const liveState={
  suppressPlaybackUntil:0,
  playing:new Set([{stopped:false,stop(){this.stopped=true;}}]),
  playCursor:9,
  audioContext:{currentTime:3},
};

const document={
  body,
  documentElement:root,
  getElementById:id=>els[id]||null,
  querySelector:q=>q==='.conversation-shell'?conversationShell:null,
  createElement:tag=>element(tag),
};

const context={
  console,
  document,
  localStorage,
  MutationObserver:FakeObserver,
  WebSocket:FakeWS,
  location:{href:'https://example.test/'},
  window:null,
  setTimeout,
  clearTimeout,
  Date,
  JSON,
  Number,
};
context.window=context;
context.LOKY_PC4_LIVE={state:liveState};
vm.createContext(context);
vm.runInContext(src,context,{filename:'mobile-features.js'});

const api=context.LOKY_PC4_FEATURES;
assert(api,'feature API missing');
assert.equal(api.version,'0.3.2R4F1-silence-memory-slots');

// Four future-operation buttons must exist and stay inert/reserved.
assert.equal(api.slots.length,4);
assert.equal(conversationShell.children.length,4);

// Silence must mute only output state, stop queued audio, and expose red-sphere class.
api.silence();
assert.equal(api.silenced,true);
assert(body.classList.contains('loky-silenced'));
assert(liveState.suppressPlaybackUntil>1e15);
assert.equal(liveState.playing.size,0);

api.resume();
assert.equal(api.silenced,false);
assert(!body.classList.contains('loky-silenced'));
assert.equal(liveState.suppressPlaybackUntil,0);

// Voice commands are exact/terminal, avoiding accidental silence in ordinary sentences.
assert.equal(api.handlePhrase('LOKY silencio'),true);
assert.equal(api.silenced,true);
assert.equal(api.handlePhrase('LOKY háblame'),true);
assert.equal(api.silenced,false);
assert.equal(api.handlePhrase('quiero hablar sobre la palabra silencio mañana'),false);

// Persistent local memory keeps useful user turns and excludes control commands.
api.memory.clear();
api.memory.remember('Mi color favorito es azul');
api.memory.remember('LOKY silencio');
api.memory.remember('Vivo cerca del mar');
const snapshot=api.memory.snapshot();
assert(snapshot.some(x=>x.text==='Mi color favorito es azul'));
assert(snapshot.some(x=>x.text==='Vivo cerca del mar'));
assert(!snapshot.some(x=>/silencio/i.test(x.text)));

// Memory is injected into Gemini setup only; no extra user turn is sent.
const ws=new FakeWS('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=x');
ws.send(JSON.stringify({setup:{systemInstruction:{parts:[{text:'BASE'}]}}}));
assert.equal(ws.sent.length,1);
const setup=JSON.parse(ws.sent[0]);
const text=setup.setup.systemInstruction.parts.map(x=>x.text||'').join('\n');
assert(text.includes('BASE'));
assert(text.includes('Mi color favorito es azul'));
assert(text.includes('Vivo cerca del mar'));

console.log('R4F1 silence/memory/slots tests PASS');
