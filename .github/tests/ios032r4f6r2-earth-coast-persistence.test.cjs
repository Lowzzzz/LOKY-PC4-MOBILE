'use strict';
const fs=require('fs');
const assert=require('assert');

const earth=fs.readFileSync('site/mobile-earth-reference.js','utf8');
const sw=fs.readFileSync('site/sw.js','utf8');
const index=fs.readFileSync('site/index.html','utf8');
const generator=fs.readFileSync('.github/scripts/build-earth-geometry-r4f6.cjs','utf8');

assert(earth.includes("const VERSION='0.3.2R4F6R2-earth-coast-persistence'"));
assert(earth.includes("const PRECOMPILED_URL='./earth-geometry-r4f6.json'"));
assert(earth.includes("packed?.version!=='r4f6-precompiled-v1'"));
assert(earth.includes("packed?.naturalEarthCommit!==NE_COMMIT"));
assert(earth.includes('function loadFallbackGeometry()'));
assert(earth.includes('function scheduleWarmGeometry()'));
assert(earth.includes('scheduleWarmGeometry();'));
assert(earth.includes("requestIdleCallback' in window"));
assert(earth.includes('const ACTIVE_FPS=60'));
assert(earth.includes('const IDLE_FPS=24'));
assert(earth.includes('const FAST_DOT_STRIDE=1'));
assert(earth.includes('const glow=Math.max(2.1,w/430),fine=Math.max(.78,w/1180),coastStep=1;'));
assert(!earth.includes('coastStep=fast?4:1'));
assert(earth.includes('async function buildDotsAsync('));
assert(earth.includes('const MAX_DOTS=9800'));
assert(earth.includes("window.addEventListener('loky:seismic-mode'"));
assert(earth.includes('else loadGeometry()'));
assert(!/getUserMedia\s*\(/.test(earth));
assert(!/new\s+WebSocket\s*\(/.test(earth));
assert(!/LOKY_PC4_LIVE/.test(earth));

assert(/const VERSION='loky-pc4-mobile-ios-0\.3\.2-r4f(?:6|9(?:r1)?)'/.test(sw));
for(const name of [
  'mobile-features.js','mobile-settings-plus.js','mobile-noise-guard.js',
  'mobile-seismic.js','mobile-earth-reference.js','earth-geometry-r4f6.json'
]){
  assert(sw.includes(name),`SW missing ${name}`);
}
assert(sw.includes('const runtimeAsset='));
assert(sw.includes('event.respondWith(networkFirst(event.request))'));
assert(sw.includes("fetch(request,{cache:'no-store'})"));

assert(index.includes('mobile-earth-reference.js?v=0.3.2r4f6'));
assert(generator.includes("const NE_COMMIT='ca96624a56bd078437bca8184e78163e5039ad19'"));
assert(generator.includes('const MAX_DOTS=9800'));
assert(generator.includes("version:'r4f6-precompiled-v1'"));

console.log('R4F6R2 Earth coastline persistence during motion PASS');
