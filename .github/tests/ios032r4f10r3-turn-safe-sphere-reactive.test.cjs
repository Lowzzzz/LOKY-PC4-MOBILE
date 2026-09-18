'use strict';
const fs=require('fs');
const assert=require('assert');

const sphere=fs.readFileSync('site/sphere-mobile.js','utf8');
const live=fs.readFileSync('site/live-mobile.js','utf8');
const index=fs.readFileSync('site/index.html','utf8');

for(const needle of [
  "const VERSION='0.3.2R4F10R3-reactive-sphere'",
  "idle:{code:0,color:[57/255,169/255,255/255]",
  "listening:{code:1,color:[66/255,215/255,255/255]",
  "thinking:{code:2,color:[153/255,108/255,255/255]",
  "speaking:{code:3,color:[70/255,230/255,196/255]",
  "action:{code:4,color:[255/255,185/255,74/255]",
  "uniform float uMotion;",
  "uniform float uState;",
  "live?.userSpeaking",
  "live?.playing?.size",
  "label==='LOKY HABLANDO'",
  "label==='PENSANDO'",
  "this.targetEnergy=Math.min(1,visual.energy+(resolved.activeUser?.20:0)+this.touchBoost)",
  "this.targetMotion=Math.min(1,visual.motion+(resolved.activeUser?.42:0))",
]) assert(sphere.includes(needle),`missing sphere contract: ${needle}`);

assert(index.includes('<script src="./sphere-mobile.js?v=0.3.2r4f10r3"></script>'));
assert(index.includes('<script src="./live-mobile.js?v=0.3.2r4f10r3"></script>'));

assert(live.includes("const VERSION='0.3.2R4-pc4-conversation-port'"));
assert(live.includes('const END_SILENCE_MS=850'));
assert(live.includes('userSpeaking:false'));
assert(live.includes('playing:new Set()'));

assert(!/new\s+WebSocket\s*\(/.test(sphere),'sphere must not create a websocket');
assert(!/getUserMedia\s*\(/.test(sphere),'sphere must not create a microphone');
assert(!/fetch\s*\(/.test(sphere),'sphere must remain visual-only');

console.log('R4F10R3 turn-safe reactive sphere tests PASS');
