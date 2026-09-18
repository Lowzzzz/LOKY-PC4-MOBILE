'use strict';
const fs=require('fs');
const assert=require('assert');

const plus=fs.readFileSync('site/mobile-settings-plus.js','utf8');
const live=fs.readFileSync('site/live-mobile.js','utf8');
const features=fs.readFileSync('site/mobile-features.js','utf8');

assert(plus.includes("const VERSION='0.3.2R4F7R1-voice-preview-confirm'"));
assert(plus.includes("const VOICE_PREVIEW_ENDPOINT='https://novgwydgcvlboujnmygq.supabase.co/functions/v1/loky-pc4-mobile-voice-preview'"));
assert(plus.includes('function stopVoicePreview()'));
assert(plus.includes('async function primeVoicePreviewAudio()'));
assert(plus.includes('function decodePcm16('));
assert(plus.includes('async function fetchVoicePreview('));
assert(plus.includes('async function playVoicePreview('));
assert(plus.includes("headers:{'content-type':'application/json','x-loky-device':cap}"));
assert(plus.includes("body:JSON.stringify({voiceName})"));
assert(plus.includes("const select=make('button','loky-choice-select','SELECCIONAR')"));
assert(plus.includes('let draft=current'));
assert(plus.includes('draft=key'));
assert(plus.includes('setter(draft)'));
assert(!plus.includes('setter(key)'));
assert(plus.includes('{previewVoice:true}'));
assert(plus.includes('TOCA UNA VOZ PARA ESCUCHARLA'));
assert(plus.includes('CARGANDO MUESTRA'));
assert(plus.includes('REPRODUCIENDO MUESTRA'));
assert(plus.includes('NO SE PUDO REPRODUCIR LA MUESTRA'));
assert(plus.includes('if(event.target===modal)'));

assert(features.includes("const VERSION='0.3.2R4F7-voice-personality-profiles'"));
assert(live.includes("const VERSION='0.3.2R4-pc4-conversation-port'"));
assert(live.includes("voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}}"));
assert(!/getUserMedia\s*\(/.test(plus));
assert(!/new\s+WebSocket\s*\(/.test(plus));
assert(!/LOKY_PC4_LIVE/.test(plus));

console.log('R4F7R1 isolated voice preview + confirm selection PASS');
