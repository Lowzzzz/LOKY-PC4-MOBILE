'use strict';
const fs=require('fs');
const assert=require('assert');
const seismic=fs.readFileSync('site/mobile-seismic.js','utf8');
const earth=fs.readFileSync('site/mobile-earth-reference.js','utf8');

assert(seismic.includes("const VERSION='0.3.2R4F4R1-seismic-controller'"));
assert(!seismic.includes('lokySeismicGlobe'));
assert(!seismic.includes('function drawGlobe('));
assert(seismic.includes('.loky-seismic-mode .sphere-wrap{display:none!important}'));
assert(seismic.includes('function selectQuake('));
assert(seismic.includes('PROFUNDIDAD'));

assert(earth.includes("const VERSION='0.3.2R4F4R2-fps-startup-optimization'"));
assert(earth.includes('const ACTIVE_FPS=60'));
assert(earth.includes('const IDLE_FPS=24'));
assert(earth.includes('const FAST_DOT_STRIDE=4'));
assert(earth.includes('async function buildDotsAsync('));
assert(earth.includes('function yieldMain()'));
assert(earth.includes('await yieldMain()'));
assert(earth.includes("window.addEventListener('loky:seismic-mode'"));
assert(earth.includes('else loadGeometry()'));
assert(!/\n\s*loadGeometry\(\);\s*\n\s*window\.LOKY_PC4_EARTH_REFERENCE/.test(earth),'geometry must not build during app startup');
assert(earth.includes("staticQuality=fast?'motion':'full'"));
assert(earth.includes('stride=fast?FAST_DOT_STRIDE:1'));
assert(earth.includes('if(wasMoving&&!moving)'));
assert(earth.includes("reload:()=>loadGeometry(true)"));
assert(earth.includes("const NE_COMMIT='ca96624a56bd078437bca8184e78163e5039ad19'"));
assert(earth.includes('const MAX_DOTS=9800'));
assert(!/getUserMedia\s*\(/.test(earth));
assert(!/new\s+WebSocket\s*\(/.test(earth));
assert(!/LOKY_PC4_LIVE/.test(earth));

console.log('R4F4R2 FPS 60 interaction + lazy startup geometry PASS');
