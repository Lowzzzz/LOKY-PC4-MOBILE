'use strict';
const fs=require('fs');
const assert=require('assert');

const features=fs.readFileSync('site/mobile-features.js','utf8');
const plus=fs.readFileSync('site/mobile-settings-plus.js','utf8');
const live=fs.readFileSync('site/live-mobile.js','utf8');

assert(features.includes("const VERSION='0.3.2R4F7-voice-personality-profiles'"));
assert(features.includes("const VOICE_PROFILES={"));
assert(features.includes("const PERSONALITIES={"));

for(const voice of ['Kore','Achird','Sulafat','Charon','Puck','Gacrux','Aoede','Umbriel']){
  assert(features.includes(`name:'${voice}'`),`missing voice ${voice}`);
}
for(const personality of ['Natural','Amigo','Profesional','Cálida','Experta','Divertida','Compañera','Coach']){
  assert(features.includes(`label:'${personality}'`),`missing personality ${personality}`);
}

assert(features.includes("prebuiltVoiceConfig={voiceName}"));
assert(features.includes("const personalityInstruction=settings.personalityInstruction();"));
assert(features.includes("if(parsed?.setup&&!resumeHandle)"));
assert(features.includes("get voice(){return loadSettings().voice;}"));
assert(features.includes("get personality(){return loadSettings().personality;}"));

assert(/const VERSION='0\.3\.2R4F7(?:-voice-personality-ui|R1-voice-preview-confirm|R2-instant-voice-preview)'/.test(plus));
assert(plus.includes('showProfileModal'));
assert(plus.includes('features.settings.setVoice'));
assert(plus.includes('features.settings.setPersonality'));
assert(plus.includes('SELECCIONAR'));
assert(plus.includes('VOICE_PREVIEW_ENDPOINT'));
assert(plus.includes('playVoicePreview'));
assert(plus.includes('decodePcm16'));
assert(plus.includes('Solo se guarda cuando pulses SELECCIONAR'));
assert(!plus.includes('setter(key)'));

assert(live.includes("const VERSION='0.3.2R4-pc4-conversation-port'"));
assert(live.includes("voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}}"));
assert(live.includes('automaticActivityDetection:{disabled:true}'));
assert(live.includes("sendRealtime(ws,{activityStart:{}})"));
assert(live.includes("sendRealtime(ws,{activityEnd:{}})"));

if(/getUserMedia\s*\(/.test(plus))throw new Error('Settings UI must not touch microphone');
if(/new\s+WebSocket\s*\(/.test(plus))throw new Error('Settings UI must not open WebSocket');

console.log('R4F7 native voice + personality profiles PASS');
