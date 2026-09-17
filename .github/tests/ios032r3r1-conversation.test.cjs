const fs=require('fs');
const assert=require('assert');
const src=fs.readFileSync('site/live-mobile.js','utf8');

assert(src.includes("const VERSION='0.3.2R3R1-bargein-voice-stability'"));
assert(src.includes('const LOCAL_BARGE_MIN_RMS=0.04'));
assert(src.includes('const LOCAL_BARGE_FRAMES=2'));
assert(src.includes('const LOCAL_BARGE_SUPPRESS_MS=900'));
assert(src.includes('detectLocalBargeIn(input);'));
assert(src.includes('if(Date.now()<state.suppressPlaybackUntil)return;'));
assert(src.includes('if(resume?.resumable===true&&resume?.newHandle)'));
assert(src.includes("state.goAwayTimer=setTimeout(()=>{"));
assert(src.includes("},0);"));
assert(src.includes("prebuiltVoiceConfig:{voiceName:'Kore'}"));
assert(!/QWEN|speechSynthesis|FALLBACK LOCAL/i.test(src));

const promote=src.slice(src.indexOf('function promotePending'),src.indexOf('async function handleSocketMessage'));
assert(promote.includes('clearPlayback();'));
assert(promote.indexOf('clearPlayback();')<promote.indexOf("previous.close(1000,'session-handover')"));

function rmsLevel(input){
  let sum=0;
  for(const x of input)sum+=x*x;
  return Math.sqrt(sum/input.length);
}
function frame(value,n=2048){return new Float32Array(n).fill(value)}
let noiseFloor=0.006;
let frames=0;
const threshold=()=>Math.max(0.04,noiseFloor*4.5);
for(let i=0;i<20;i++){
  const level=rmsLevel(frame(0.005));
  noiseFloor=noiseFloor*0.97+level*0.03;
}
assert(rmsLevel(frame(0.005))<threshold());
for(let i=0;i<2;i++){
  const level=rmsLevel(frame(0.08));
  if(level>=threshold())frames++; else frames=Math.max(0,frames-1);
}
assert.strictEqual(frames,2,'two strong near-field frames must trigger local barge-in');

console.log('PASS ios032r3r1 conversation barge-in/voice continuity guards');
