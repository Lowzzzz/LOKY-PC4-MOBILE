const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const code=fs.readFileSync('site/live-mobile.js','utf8');

const listeners={};
function makeEl(){
  return {
    textContent:'',dataset:{},value:'',
    classList:{toggle(){},add(){},remove(){}},
    addEventListener(type,fn){this[`on_${type}`]=fn;},
    click(){return this.on_click?.({});},
  };
}
const elements={};
for(const id of ['talkButton','conversationState','conversationHint','userTranscript','lokyTranscript','activationPanel','pairCode','activateButton','liveBadge'])elements[id]=makeEl();

const store=new Map([['loky_pc4_device_capability_v1','TEST-OWNER-CAPABILITY-1234']]);
let fetchCount=0;
const fakeToken='auth_tokens/test-token';
async function fetchMock(){
  fetchCount++;
  return {ok:true,status:200,json:async()=>({ok:true,token:fakeToken,model:'models/gemini-3.8-live'})};
}

class MockBufferSource{
  connect(){}
  start(){setTimeout(()=>this.onended?.(),0)}
  stop(){}
}
class MockAudioBuffer{
  constructor(length,rate){this.duration=length/rate;this.data=new Float32Array(length)}
  getChannelData(){return this.data}
}
class MockProcessor{
  constructor(size){this.bufferSize=size;this.onaudioprocess=null}
  connect(){}
  disconnect(){}
}
class MockGain{constructor(){this.gain={value:1}}connect(){}disconnect(){}}
class MockSource{connect(){}disconnect(){}}
class MockAudioContext{
  constructor(){this.state='running';this.sampleRate=48000;this.currentTime=0;this.destination={};this.lastProcessor=null;}
  async resume(){this.state='running'}
  createMediaStreamSource(){return new MockSource()}
  createScriptProcessor(size){this.lastProcessor=new MockProcessor(size);return this.lastProcessor}
  createGain(){return new MockGain()}
  createBuffer(ch,length,rate){return new MockAudioBuffer(length,rate)}
  createBufferSource(){return new MockBufferSource()}
}

class MockWebSocket{
  static OPEN=1;
  static instances=[];
  constructor(url){
    this.url=url;this.readyState=0;this.sent=[];MockWebSocket.instances.push(this);
    setTimeout(()=>{this.readyState=1;this.onopen?.();},0);
  }
  send(data){this.sent.push(JSON.parse(data))}
  close(code,reason){this.readyState=3;this.closeCode=code;this.closeReason=reason;setTimeout(()=>this.onclose?.({code,reason}),0)}
  emit(obj){this.onmessage?.({data:JSON.stringify(obj)})}
}

const mediaStream={active:true,getTracks:()=>[{stop(){}}]};
const navigatorMock={
  mediaDevices:{getUserMedia:async()=>mediaStream},
};
const locationMock={href:'https://lowzzzz.github.io/LOKY-PC4-MOBILE/',pathname:'/LOKY-PC4-MOBILE/',search:'',hash:''};
const context={
  console,
  setTimeout,clearTimeout,
  Blob:global.Blob,ArrayBuffer,DataView,Float32Array,Int16Array,Uint8Array,TextDecoder,
  btoa:s=>Buffer.from(s,'binary').toString('base64'),
  atob:s=>Buffer.from(s,'base64').toString('binary'),
  URL,
  location:locationMock,
  history:{replaceState(){}},
  document:{getElementById:id=>elements[id]||null},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  navigator:navigatorMock,
  fetch:fetchMock,
  WebSocket:MockWebSocket,
  AudioContext:MockAudioContext,
  addEventListener:(type,fn)=>{listeners[type]=fn},
};
context.window=context;
vm.createContext(context);
vm.runInContext(code,context,{filename:'live-mobile.js'});

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const api=context.window.LOKY_PC4_LIVE;
  assert(api,'LOKY_PC4_LIVE export missing');
  assert.equal(api.version,'0.3.2R3-conversation-zero-rebuild-lowlatency');

  await api.start();
  await sleep(10);
  assert.equal(MockWebSocket.instances.length,1,'initial websocket not created');
  const ws1=MockWebSocket.instances[0];
  assert(ws1.sent[0]?.setup,'setup not sent');
  assert.equal(ws1.sent[0].setup.realtimeInputConfig.automaticActivityDetection.silenceDurationMs,250);
  assert.equal(ws1.sent[0].setup.realtimeInputConfig.automaticActivityDetection.prefixPaddingMs,60);
  assert(ws1.sent[0].setup.contextWindowCompression?.slidingWindow,'context compression missing');
  assert.deepEqual(ws1.sent[0].setup.sessionResumption,{});

  ws1.emit({setupComplete:{}});
  await sleep(5);
  assert.equal(api.state.activeWs,ws1,'initial websocket not promoted');
  assert.equal(api.state.setupReady,true,'session not ready after setupComplete');
  assert.equal(api.state.audioContext.lastProcessor.bufferSize,2048,'microphone chunk is not low latency');

  const audioEvent={inputBuffer:{getChannelData:()=>new Float32Array(2048)}};
  api.state.audioContext.lastProcessor.onaudioprocess(audioEvent);
  assert(ws1.sent.some(m=>m.realtimeInput?.audio?.mimeType==='audio/pcm;rate=16000'),'PCM16 mic audio not sent');

  ws1.emit({sessionResumptionUpdate:{resumable:true,newHandle:'resume-handle-1'}});
  await sleep(2);
  assert.equal(api.state.resumeHandle,'resume-handle-1','resume handle not retained');

  ws1.emit({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:'AAA='}}]},turnComplete:true}});
  await sleep(2);

  ws1.emit({goAway:{timeLeft:'1.3s'}});
  await sleep(180);
  assert.equal(MockWebSocket.instances.length,2,'GoAway did not create replacement websocket');
  const ws2=MockWebSocket.instances[1];
  await sleep(10);
  assert(ws2.sent[0]?.setup,'replacement setup not sent');
  assert.equal(ws2.sent[0].setup.sessionResumption.handle,'resume-handle-1','replacement did not resume session');
  assert.equal(fetchCount,1,'session resumption should reuse valid ephemeral token');

  ws2.emit({setupComplete:{}});
  await sleep(10);
  assert.equal(api.state.activeWs,ws2,'replacement websocket not promoted');
  assert.equal(api.state.setupReady,true,'late close from old socket broke new session');
  assert.equal(elements.conversationState.textContent,'ESCUCHANDO');

  api.stop();
  assert.equal(api.state.desired,false);
  console.log('PASS: low-latency capture + PCM audio + interruption-ready lifecycle + GoAway resumption handover');
})().catch(err=>{console.error(err);process.exit(1)});
