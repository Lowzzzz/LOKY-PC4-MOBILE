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
    disabled:false,
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
  userSpeaking:false,
};

const document={
  body,
  documentElement:root,
  getElementById:id=>els[id]||null,
  querySelector:q=>q==='.conversation-shell'?conversationShell:null,
  createElement:tag=>element(tag),
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
  location:{href:'https://example.test/'},
  window:null,
  setTimeout,
  clearTimeout,
  Date,
  JSON:instrumentedJSON,
  Number,
};
context.window=context;
context.LOKY_PC4_LIVE={state:liveState};
vm.createContext(context);
vm.runInContext(src,context,{filename:'mobile-features.js'});

const api=context.LOKY_PC4_FEATURES;
assert(api,'feature API missing');
assert.equal(api.version,'0.3.2R4F1R1-timing-fix');

assert.equal(api.slots.length,4);
assert.equal(conversationShell.children.length,4);
assert(api.slots.every(x=>x.disabled===true));

api.silence();
assert.equal(api.silenced,true);
assert(body.classList.contains('loky-silenced'));
assert(liveState.suppressPlaybackUntil>1e15);
assert.equal(liveState.playing.size,0);
api.resume();
assert.equal(api.silenced,false);
assert(!body.classList.contains('loky-silenced'));
assert.equal(liveState.suppressPlaybackUntil,0);

liveState.userSpeaking=true;
assert(liveState.suppressPlaybackUntil>1e15,'playback not blocked during user speech');
liveState.suppressPlaybackUntil=123;
assert(liveState.suppressPlaybackUntil>1e15,'core setter bypassed user-speech block');
liveState.userSpeaking=false;
assert.equal(liveState.suppressPlaybackUntil,123,'raw playback timing not restored after user speech');
liveState.suppressPlaybackUntil=0;

assert.equal(api.handlePhrase('LOKY silencio'),true);
assert.equal(api.silenced,true);
assert.equal(api.handlePhrase('LOKY háblame'),true);
assert.equal(api.silenced,false);
assert.equal(api.handlePhrase('quiero hablar sobre la palabra silencio mañana'),false);

api.memory.clear();
assert.equal(api.memory.remember('Mi color favorito es azul'),true);
assert.equal(api.memory.remember('Vivo cerca del mar'),true);
assert.equal(api.memory.remember('¿Qué hora es?'),false);
assert.equal(api.memory.remember('Abre Google'),false);
assert.equal(api.memory.remember('Continúa con esto'),false);
assert.equal(api.memory.remember('LOKY silencio'),false);
const snapshot=api.memory.snapshot();
assert(snapshot.some(x=>x.text==='Mi color favorito es azul'));
assert(snapshot.some(x=>x.text==='Vivo cerca del mar'));
assert(!snapshot.some(x=>/Abre Google|Qué hora|Continúa|silencio/i.test(x.text)));

// Fresh setup is the only WebSocket frame inspected. Two parses are expected here:
// the setup frame itself + the small local-memory JSON array. PCM must add zero parses.
const ws=new FakeWS('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=x');
const beforeSetupParse=parseCount;
ws.send(JSON.stringify({setup:{systemInstruction:{parts:[{text:'BASE'}]},sessionResumption:{}}}));
assert.equal(parseCount,beforeSetupParse+2,'fresh setup parse budget changed');
const setup=JSON.parse(ws.sent[0]);
const text=setup.setup.systemInstruction.parts.map(x=>x.text||'').join('\n');
assert(text.includes('BASE'));
assert(text.includes('Mi color favorito es azul'));
assert(text.includes('Vivo cerca del mar'));

const parseBeforeAudio=parseCount;
for(let i=0;i<250;i++){
  ws.send('{"realtimeInput":{"audio":{"data":"AAAA","mimeType":"audio/pcm;rate=16000"}}}');
}
assert.equal(parseCount,parseBeforeAudio,'realtime PCM entered feature JSON parse hot path');
assert.equal(ws.sent.length,251);

// Resumed session: setup itself is parsed, but memory JSON is not loaded/injected again.
const resumed=new FakeWS(ws.url);
const beforeResumeParse=parseCount;
resumed.send(JSON.stringify({setup:{systemInstruction:{parts:[{text:'BASE'}]},sessionResumption:{handle:'resume-123'}}}));
assert.equal(parseCount,beforeResumeParse+1);
const resumedSetup=JSON.parse(resumed.sent[0]);
const resumedText=resumedSetup.setup.systemInstruction.parts.map(x=>x.text||'').join('\n');
assert.equal(resumedText,'BASE');

console.log('R4F1R1 timing/silence/memory/slots tests PASS');
