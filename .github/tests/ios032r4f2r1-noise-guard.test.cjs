'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const src=fs.readFileSync('site/mobile-noise-guard.js','utf8');

function fakeElement(){return {addEventListener(){}};}
class FakeObserver{constructor(cb){this.cb=cb;}observe(){}}

const state={
  desired:true,
  setupReady:true,
  userSpeaking:false,
  startFrames:0,
  noiseFloor:0.005,
  playbackLeakFloor:0.012,
  playing:new Set(),
  audioContext:{sampleRate:48000},
  micProcessor:null,
};
const document={getElementById:id=>fakeElement()};
let timers=[];
const context={
  console,
  window:null,
  document,
  MutationObserver:FakeObserver,
  Float32Array,
  Math,
  Number,
  setTimeout(fn){timers.push(fn);return timers.length;},
  clearTimeout(){},
  setInterval(){return 1;},
  clearInterval(){},
  addEventListener(){},
};
context.window=context;
context.LOKY_PC4_LIVE={state};
vm.createContext(context);
vm.runInContext(src,context,{filename:'mobile-noise-guard.js'});

const guard=context.LOKY_PC4_NOISE_GUARD;
assert(guard,'noise guard API missing');
assert.equal(guard.version,'0.3.2R4F2R1-voice-noise-guard');

function impulse(){
  const x=new Float32Array(2048);
  for(let i=300;i<312;i++)x[i]=(i%2?-.85:.85);
  return x;
}
function whiteNoise(){
  const x=new Float32Array(2048);
  let seed=7;
  for(let i=0;i<x.length;i++){
    seed=(seed*48271)%2147483647;
    x[i]=((seed/2147483647)*2-1)*0.08;
  }
  return x;
}
function voiceLike(freq=180,amp=.065){
  const x=new Float32Array(2048);
  for(let i=0;i<x.length;i++){
    const t=i/48000;
    x[i]=amp*(Math.sin(2*Math.PI*freq*t)+0.22*Math.sin(2*Math.PI*freq*2*t));
  }
  return x;
}

// Transient/impulse and broadband noise must not become confirmed speech.
guard.reset();
for(let i=0;i<5;i++){
  const d=guard.inspectFrame(impulse(),48000,false);
  assert.equal(d.confirmed,false,'impulse incorrectly confirmed as speech');
}
guard.reset();
for(let i=0;i<5;i++){
  const d=guard.inspectFrame(whiteNoise(),48000,false);
  assert.equal(d.confirmed,false,'broadband noise incorrectly confirmed as speech');
}

// Human-voice-like periodic energy should confirm quickly.
guard.reset();
const first=guard.inspectFrame(voiceLike(),48000,false);
const second=guard.inspectFrame(voiceLike(),48000,false);
assert.equal(first.confirmed,false);
assert.equal(second.confirmed,true,'voice-like signal did not confirm');

// Integration: wrapper keeps frozen core startFrames at zero for noise,
// but allows the unchanged core to own activityStart once voice is confirmed.
let starts=0;
const processor={onaudioprocess:null};
state.micProcessor=processor;
processor.onaudioprocess=function(event){
  const input=event.inputBuffer.getChannelData(0);
  let sum=0;
  for(let i=0;i<input.length;i++)sum+=input[i]*input[i];
  const rms=Math.sqrt(sum/input.length);
  if(state.userSpeaking)return;
  if(rms>=0.012)state.startFrames++;
  else state.startFrames=Math.max(0,state.startFrames-1);
  if(state.startFrames>=3){
    state.userSpeaking=true;
    starts++;
  }
};
assert.equal(guard.attach(),true,'processor wrapper did not attach');

function eventFor(samples){
  return {inputBuffer:{sampleRate:48000,getChannelData(){return samples;}}};
}
for(let i=0;i<5;i++)processor.onaudioprocess(eventFor(whiteNoise()));
assert.equal(starts,0,'noise triggered frozen conversation start');
assert.equal(state.userSpeaking,false);
assert.equal(state.startFrames,0);

state.userSpeaking=false;
state.startFrames=0;
guard.reset();
for(let i=0;i<4&&!state.userSpeaking;i++)processor.onaudioprocess(eventFor(voiceLike()));
assert.equal(starts,1,'validated voice did not reach frozen conversation core');
assert.equal(state.userSpeaking,true);

assert(guard.stats.rejectedNoiseFrames>0);
assert(guard.stats.confirmedVoiceFrames>0);
console.log('R4F2R1 voice noise guard tests PASS');
