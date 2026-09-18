'use strict';
const fs=require('fs');
const assert=require('assert');

const plus=fs.readFileSync('site/mobile-settings-plus.js','utf8');
const live=fs.readFileSync('site/live-mobile.js','utf8');
const features=fs.readFileSync('site/mobile-features.js','utf8');

assert(plus.includes("const VERSION='0.3.2R4F7R3-personality-audio-preview'"));
assert(plus.includes('const personalityPreviewCache=new Map()'));
assert(plus.includes('const personalityPreviewPending=new Map()'));
assert(plus.includes('async function fetchPersonalityPreview('));
assert(plus.includes("body:JSON.stringify({action:'personality',voiceName,personality})"));
assert(plus.includes('function preloadPersonalityPreviews('));
assert(plus.includes('async function playPersonalityPreview('));
assert(plus.includes('{previewPersonality:true}'));
assert(plus.includes('TOCA UNA PERSONALIDAD PARA ESCUCHARLA'));
assert(plus.includes('REPRODUCIENDO PERSONALIDAD'));
assert(plus.includes('Solo se guarda cuando pulses SELECCIONAR.'));
assert(plus.includes("const select=make('button','loky-choice-select','SELECCIONAR')"));
assert(plus.includes('setter(draft)'));
assert(!plus.includes('setter(key)'));
assert(features.includes("voiceName(){"));
assert(live.includes("const VERSION='0.3.2R4-pc4-conversation-port'"));
assert(!/getUserMedia\s*\(/.test(plus));
assert(!/new\s+WebSocket\s*\(/.test(plus));
assert(!/LOKY_PC4_LIVE/.test(plus));

console.log('R4F7R3 personality audio preview PASS');
