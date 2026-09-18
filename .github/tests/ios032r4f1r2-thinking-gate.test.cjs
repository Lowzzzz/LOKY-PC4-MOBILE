'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const src=fs.readFileSync('site/mobile-features.js','utf8');
for(const needle of [
  "const VERSION='0.3.2R4F1R2-thinking-input-gate'",
  'const THINKING_GATE_MAX_MS=6500',
  "if(state==='PENSANDO')",
  'setMicEnabled(false)',
  'setMicEnabled(true)',
  'if(silenced)return clearThinkingGate()',
]) assert(src.includes(needle),`missing ${needle}`);
assert(!src.includes('getUserMedia('),'feature layer must not create second mic');
assert(!src.includes('new WebSocket('),'feature layer must not create second websocket');

function element(id=''){
  return {
    id,textContent:'',dataset:{},children:[],attrs:{},disabled:false,
    classList:{set:new Set(),add(...x){x.forEach(v=>this.set.add(v));},remove(...x){x.forEach(v=>this.set.delete(v));},contains(x){return this.set.has(x);}},
    appendChild(x){this.children.push(x);return x;},
    setAttribute(k,v){this.attrs[k]=String(v);},
    addEventListener(){},
  };
}
const els={
  conversationState:element('conversationState'),
  userTranscript:element('userTranscript'),
};
const shell=element('conversation-shell');
const body=element('body');
const track={kind:'audio',enabled:true,readyState:'live'};
const liveState={
  suppressPlaybackUntil:0,
  userSpeaking:false,
  playing:new Set(),
  playCursor:0,
  audioContext:{currentTime:1},
  mediaStream:{getAudioTracks(){return [track];}},
};
const observers=[];
class FakeObserver{constructor(cb){this.cb=cb;observers.push(this);}observe(){}}
class FakeWS{constructor(url='wss://example.test/BidiGenerateContentConstrained'){this.url=url;this.sent=[];}send(x){this.sent.push(x);}}
const localStore={};
const context={
  console,
  document:{
    body,
    getElementById:id=>els[id]||null,
    querySelector:q=>q==='.conversation-shell'?shell:null,
    createElement:tag=>element(tag),
  },
  localStorage:{getItem:k=>localStore[k]??null,setItem:(k,v)=>{localStore[k]=String(v)},removeItem:k=>{delete localStore[k]}},
  MutationObserver:FakeObserver,
  WebSocket:FakeWS,
  window:null,
  Number,Date,JSON,
  setTimeout:(fn,ms)=>({fn,ms}),
  clearTimeout:()=>{},
};
context.window=context;
context.LOKY_PC4_LIVE={state:liveState};
vm.createContext(context);
vm.runInContext(src,context,{filename:'mobile-features.js'});
const api=context.LOKY_PC4_FEATURES;
assert(api);
assert.equal(api.version,'0.3.2R4F1R2-thinking-input-gate');

// Entering PENSANDO disables only the existing mic track.
els.conversationState.textContent='PENSANDO';
api.thinkingGate.sync();
assert.equal(api.thinkingGate.active,true);
assert.equal(track.enabled,false);

// LOKY speaking must re-enable mic immediately so barge-in is preserved.
els.conversationState.textContent='LOKY HABLANDO';
api.thinkingGate.sync();
assert.equal(api.thinkingGate.active,false);
assert.equal(track.enabled,true);

// ESCUCHANDO also keeps the same track enabled.
els.conversationState.textContent='ESCUCHANDO';
api.thinkingGate.sync();
assert.equal(track.enabled,true);

// Silence must never disable input, because “LOKY háblame” must remain detectable.
api.silence();
els.conversationState.textContent='PENSANDO';
api.thinkingGate.sync();
assert.equal(api.silenced,true);
assert.equal(track.enabled,true);
api.resume();

// No transport ownership moved into the feature layer.
const core=fs.readFileSync('site/live-mobile.js','utf8');
assert(core.includes("const VERSION='0.3.2R4F10R3-turn-end-guard'"));
assert(core.includes("sendRealtime(ws,{activityStart:{}})"));
assert(core.includes("sendRealtime(ws,{activityEnd:{}})"));

console.log('R4F1R2 thinking-input gate tests PASS');
