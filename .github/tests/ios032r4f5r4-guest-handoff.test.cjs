'use strict';
const fs=require('fs');
const assert=require('assert');
const plus=fs.readFileSync('site/mobile-settings-plus.js','utf8');

assert(/const VERSION='0\.3\.2R4F(?:5R4-guest-handoff|7(?:-voice-personality-ui|R1-voice-preview-confirm|R2-instant-voice-preview|R3-personality-audio-preview))'/.test(plus));
assert(plus.includes("function normalizeGuestCode"));
assert(plus.includes("function isGuestCode"));
assert(plus.includes("action:'redeem_invite'"));
assert(plus.includes("api('claim_device'"));
assert(plus.includes("CÓDIGO DE ACCESO"));
assert(plus.includes("No uses el código Owner."));
assert(plus.includes("localStorage.setItem(DEVICE_KEY,String(data.capability))"));
assert(plus.includes("display-mode: standalone"));
assert(!/getUserMedia\s*\(/.test(plus));
assert(!/new\s+WebSocket\s*\(/.test(plus));
assert(!/LOKY_PC4_LIVE/.test(plus));
console.log('R4F5R4 guest Safari-to-PWA handoff PASS');
