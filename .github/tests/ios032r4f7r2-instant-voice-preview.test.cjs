'use strict';
const fs=require('fs');
const assert=require('assert');

const plus=fs.readFileSync('site/mobile-settings-plus.js','utf8');
const live=fs.readFileSync('site/live-mobile.js','utf8');
const features=fs.readFileSync('site/mobile-features.js','utf8');

assert(plus.includes("const VERSION='0.3.2R4F7R2-instant-voice-preview'"));
assert(plus.includes("const VOICE_PREVIEW_STATIC_BASE='./voice-previews'"));
assert(plus.includes("const VOICE_PREVIEW_STATIC_VERSION='0.3.2r4f7r2'"));
assert(plus.includes("fetch(staticUrl,{cache:'force-cache'})"));
assert(plus.includes("source:'static'"));
assert(plus.includes("source:'backend'"));
assert(plus.includes('function preloadVoicePreviews('));
assert(plus.includes('setTimeout(()=>preloadVoicePreviews(profiles),0)'));
assert(plus.includes("const select=make('button','loky-choice-select','SELECCIONAR')"));
assert(plus.includes('setter(draft)'));
assert(!plus.includes('setter(key)'));
assert(plus.includes('{previewVoice:true}'));

for(const voice of ['Kore','Achird','Sulafat','Charon','Puck','Gacrux','Aoede','Umbriel']){
  assert(features.includes(`name:'${voice}'`));
}

assert(live.includes("const VERSION='0.3.2R4-pc4-conversation-port'"));
assert(!/getUserMedia\s*\(/.test(plus));
assert(!/new\s+WebSocket\s*\(/.test(plus));
assert(!/LOKY_PC4_LIVE/.test(plus));

console.log('R4F7R2 instant static voice preview PASS');
