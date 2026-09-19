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
const lokyTranscript=element(); lokyTranscript.textContent='How are you today?';
const conversationState=element(); conversationState.textContent='ESCUCHANDO';

const document={
  body,head,
  createElement(){return element();},
  getElementById(id){
    if(id==='lokyLanguageTutorStyles')return null;
    if(id==='userTranscript')return userTranscript;
    if(id==='lokyTranscript')return lokyTranscript;
    if(id==='conversationState')return conversationState;
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

const store=new Map([
  ['loky_pc4_device_capability_v1','owner-capability-token-123456789']
]);
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

let fetchCalls=[];
async function fakeFetch(url,options={}){
  fetchCalls.push({url,options});
  return {
    ok:true,
    status:200,
    async json(){
      return {
        ok:true,
        phrase:'How are you today?',
        source:'es',
        target:'en',
        translation:'¿Cómo estás hoy?',
        pronunciation:'jáu ar yú tu-DÉI',
        skip:false,
        model:'gemini-3.5-flash-lite'
      };
    }
  };
}

const activeWs=new FakeWebSocket();
const context={
  console,document,localStorage,MutationObserver:FakeObserver,WebSocket:FakeWebSocket,
  fetch:fakeFetch,
  setTimeout,clearTimeout,setInterval,clearInterval,
  Date,String,Number,JSON,Object,Array,Promise,Math,Map,
  window:null,
};
context.window=context;
context.LOKY_PC4_LIVE={state:{activeWs,setupReady:true,userSpeaking:false}};
vm.createContext(context);

(async()=>{
  vm.runInContext(src,context,{filename:'mobile-language-tutor.js'});
  const api=context.LOKY_PC4_LANGUAGE_TUTOR;

  assert(api,'Language Tutor API missing');
  assert.equal(api.version,'0.3.2R4F12R4-auto-floating-translation');

  assert.equal(slot1.disabled,false,'future-op-1 must remain enabled');
  assert(slot1.classList.contains('feature-language'));
  assert.equal(slot2.disabled,true,'future-op-2 must remain reserved');
  assert.equal(slot2.dataset.languageTutorReady,undefined);

  assert.equal(api.latestTutorPhrase('Hello. How are you today?'),'How are you today?');
  assert.equal(api.cleanTutorDisplay('Hello. How are you today?'),'Hello. How are you today?');

  const result=await api.apiLanguageAssist('How are you today?');
  assert.equal(result.translation,'¿Cómo estás hoy?');
  assert.equal(result.pronunciation,'jáu ar yú tu-DÉI');
  assert.equal(fetchCalls.length,1);
  assert(String(fetchCalls[0].url).includes('loky-pc4-language-assist'));
  assert.equal(fetchCalls[0].options.headers['x-loky-device'],'owner-capability-token-123456789');
  const bodySent=JSON.parse(fetchCalls[0].options.body);
  assert.equal(bodySent.phrase,'How are you today?');
  assert.equal(bodySent.source,'es');
  assert.equal(bodySent.target,'en');

  api.activate();
  assert.equal(api.state.active,true);
  const beforeRepeat=activeWs.sent.length;
  assert(api.quick('repeat'),'repeat tool must send through existing Live socket');
  assert(activeWs.sent.length>beforeRepeat);
  const repeatText=String(JSON.parse(activeWs.sent.at(-1)).clientContent.turns[0].parts[0].text);
  assert(repeatText.includes('LOKY TUTOR TOOL — REPEAT'));
  assert(repeatText.includes('How are you today?'));

  fetchCalls=[];
  lokyTranscript.textContent='How are you today?';
  api.scheduleAutoAssist('How are you today?');
  await new Promise(resolve=>setTimeout(resolve,430));
  assert(fetchCalls.length>=1,'automatic assist must call silent backend after settle');

  api.deactivate({silent:true});
  assert.equal(api.state.active,false);

  assert(index.includes('<script src="./mobile-language-tutor.js?v=0.3.2r4f12r4"></script>'));

  assert(src.includes("const ASSIST_ENDPOINT='https://novgwydgcvlboujnmygq.supabase.co/functions/v1/loky-pc4-language-assist'"));
  assert(src.includes('const AUTO_ASSIST_SETTLE_MS=320'));
  assert(src.includes('scheduleAutoAssist(tutorText)'));
  assert(src.includes("['REPETIR','repeat']"));
  assert(src.includes('data-lang-floating-assist'));
  assert(src.includes('loky-language-floating-translation'));
  assert(src.includes('loky-language-floating-pronunciation'));
  assert(src.includes('text-shadow'));
  assert(!src.includes('loky-pron-card'));
  assert(!src.includes("['TRADUCIR','translate']"));
  assert(!src.includes('data-lang-teaching-card'));

  // The tutor still reuses the existing Live transport rather than creating another one.
  assert(src.includes('const previousSend=WebSocket.prototype.send'));
  assert(!/new\s+WebSocket\s*\(/.test(src));
  assert(!/getUserMedia\s*\(/.test(src));
  assert(!/speechSynthesis/.test(src));
  assert(!/navigator\.geolocation/.test(src));

  console.log('R4F12R4 auto floating translation tests PASS');
})().catch(error=>{console.error(error);process.exit(1);});
