'use strict';
const fs=require('fs');
const assert=require('assert');

const src=fs.readFileSync('site/mobile-continent-detail.js','utf8');
const index=fs.readFileSync('site/index.html','utf8');

assert(src.includes("const VERSION='0.3.2R4F3R3-continent-detail'"));
assert(index.includes('<script src="./mobile-continent-detail.js?v=0.3.2r4f3r3"></script>'));
assert(src.includes('NORTH_AMERICA'));
assert(src.includes('SOUTH_AMERICA'));
assert(src.includes('EUROPE'));
assert(src.includes('AFRICA'));
assert(src.includes('ASIA_NORTH'));
assert(src.includes('AUSTRALIA'));
assert(src.includes('CENTRAL_AMERICA'));
assert(src.includes('SCANDINAVIA'));
assert(src.includes('const ISLANDS=['));
assert(src.includes('const REGIONAL_LINES=['));
assert(src.includes("['NORTEAMÉRICA'"));
assert(src.includes("['SUDAMÉRICA'"));
assert(src.includes("['EUROPA'"));
assert(src.includes("['ÁFRICA'"));
assert(src.includes("['ASIA'"));
assert(src.includes("['OCEANÍA'"));
assert(src.includes("pointerEvents:'none'"),'detail overlay must never capture Sismos interaction');
assert(src.includes("window.addEventListener('loky:seismic-mode'"));
assert(src.includes('seismic.project('),'overlay must reuse frozen Sismos projection');
assert(src.includes('state.globeZoom'),'overlay must follow frozen globe zoom');
assert(src.includes('drawCoastDots('),'coast point-cloud detail missing');
assert(src.includes('drawLabels('),'continent labels missing');
assert(!/getUserMedia\s*\(/.test(src),'continent overlay must not create microphone');
assert(!/new\s+WebSocket\s*\(/.test(src),'continent overlay must not create WebSocket');
assert(!/LOKY_PC4_LIVE/.test(src),'continent overlay must not touch conversation state');
assert(!/fetch\s*\(/.test(src),'continent detail must remain offline/local');

console.log('R4F3R3 isolated continent detail tests PASS');
