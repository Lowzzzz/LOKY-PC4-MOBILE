'use strict';
const fs=require('fs');
const assert=require('assert');
const src=fs.readFileSync('site/live-mobile.js','utf8');

// Contract: only one conversation owner with manual Attention/VAD.
for(const needle of [
  "const VERSION='0.3.2R4-pc4-conversation-port'",
  'const MIC_BUFFER_SIZE=2048',
  'const PRE_ROLL_CHUNKS=4',
  'const START_FRAMES_IDLE=3',
  'const START_FRAMES_BARGE=2',
  'const END_SILENCE_MS=850',
  "automaticActivityDetection:{disabled:true}",
  "activityHandling:'START_OF_ACTIVITY_INTERRUPTS'",
  "sendRealtime(ws,{activityStart:{}})",
  "sendRealtime(ws,{activityEnd:{}})",
  "prebuiltVoiceConfig:{voiceName:'Kore'}",
  'contextWindowCompression:{slidingWindow:{}}',
  'replaySpeakingHandover(ws)',
  'state.playbackLeakFloor*1.75',
]) assert(src.includes(needle),`missing ${needle}`);

assert(!src.includes('interimInputTranscription'),'interim transcript must not drive Mobile chat');
assert(!/QWEN|speechSynthesis|FALLBACK LOCAL/i.test(src),'robotic/local fallback forbidden');
assert(!src.includes('automaticActivityDetection:{disabled:false}'),'server VAD must not own turn segmentation');

// Deterministic simulation of the Mobile Attention policy.
const cfg={
  idleFrames:3,
  bargeFrames:2,
  endMs:850,
  minStart:0.012,
  minBarge:0.026,
  minEnd:0.007,
  chunkMs:42.7,
};

function make(){
  return {noise:0.005,leak:0.012,start:0,silence:0,speaking:false,starts:0,ends:0};
}
function frame(s,level,playback=false){
  if(s.speaking){
    const endThreshold=Math.max(cfg.minEnd,s.noise*1.65);
    s.silence=level<=endThreshold?s.silence+cfg.chunkMs:0;
    if(s.silence>=cfg.endMs){s.speaking=false;s.silence=0;s.start=0;s.ends++;}
    return;
  }
  if(playback)s.leak=s.leak*0.94+level*0.06;
  else s.noise=s.noise*0.97+level*0.03;
  const threshold=playback
    ? Math.max(cfg.minBarge,s.leak*1.75,s.noise*4.0)
    : Math.max(cfg.minStart,s.noise*2.8);
  const needed=playback?cfg.bargeFrames:cfg.idleFrames;
  s.start=level>=threshold?s.start+1:Math.max(0,s.start-1);
  if(s.start>=needed){s.speaking=true;s.start=0;s.silence=0;s.starts++;}
}

// 1) Idle noise with isolated spikes must not create phantom turns such as “¿qué?”.
{
  const s=make();
  for(let i=0;i<120;i++){
    const level=(i%29===0)?0.018:0.0065;
    frame(s,level,false);
  }
  assert.equal(s.starts,0,'isolated idle spikes created a false turn');
}

// 2) Real sustained speech starts after 3 frames (~128 ms) with pre-roll preserving onset.
{
  const s=make();
  frame(s,0.032,false); frame(s,0.034,false); frame(s,0.036,false);
  assert.equal(s.starts,1,'real speech did not start');
  assert.equal(s.speaking,true);
}

// 3) Natural mid-sentence pauses up to ~650 ms must NOT cut the sentence; >850 ms silence ends it.
{
  const s=make();
  frame(s,0.035);frame(s,0.035);frame(s,0.035);
  for(let t=0;t<640;t+=cfg.chunkMs)frame(s,0.002);
  assert.equal(s.speaking,true,'natural mid-sentence pause cut the user');
  for(let t=0;t<260;t+=cfg.chunkMs)frame(s,0.002);
  assert.equal(s.speaking,false,'long silence did not end the turn');
  assert.equal(s.ends,1);
}

// 4) Speaker leakage alone should not barge in; strong user speech should interrupt fast.
{
  const s=make();
  for(let i=0;i<25;i++)frame(s,0.020,true);
  assert.equal(s.starts,0,'LOKY speaker leakage falsely interrupted itself');
  frame(s,0.085,true); frame(s,0.090,true);
  assert.equal(s.starts,1,'real barge-in did not trigger');
}

// 5) Turn boundaries are explicit and playback continuity is preserved across socket handover.
assert(src.includes('// Do not clear already-scheduled PCM on a normal session handover'));
assert(!/previous&&previous!==ws\)\{\s*clearPlayback\(\)/.test(src),'handover clears queued speech and can create audible cuts');

console.log('PC4 Mobile conversation port tests PASS');
