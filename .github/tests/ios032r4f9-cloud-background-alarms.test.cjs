'use strict';
const fs=require('fs');
const assert=require('assert');

const bg=fs.readFileSync('site/mobile-background-alarm.js','utf8');
const sw=fs.readFileSync('site/sw.js','utf8');
const index=fs.readFileSync('site/index.html','utf8');
const planner=fs.readFileSync('site/mobile-planner.js','utf8');

assert(bg.includes("const VERSION='0.3.2R4F9-cloud-background-alarms'"));
assert(bg.includes("const ENDPOINT='https://novgwydgcvlboujnmygq.supabase.co/functions/v1/loky-pc4-mobile-push'"));
assert(bg.includes("const DEVICE_KEY='loky_pc4_device_capability_v1'"));
assert(bg.includes("pushManager.subscribe({"));
assert(bg.includes("userVisibleOnly:true"));
assert(bg.includes("applicationServerKey:base64UrlToUint8Array"));
assert(bg.includes("await api('subscribe',{subscription:json})"));
assert(bg.includes("await api('schedule_alarm'"));
assert(bg.includes("await api('cancel_alarm'"));
assert(bg.includes("await api('test_push',{})"));
assert(bg.includes("type==='alarm'"));
assert(bg.includes("p.snapshot().filter(item=>item&&item.type==='alarm')"));
assert(bg.includes("const SYNC_MS=500"));
assert(bg.includes("ALARMA CON LOKY CERRADA · ACTIVAR"));
assert(bg.includes("ALARMA CON LOKY CERRADA · ACTIVA"));
assert(bg.includes("Cloud Push: permite avisar aunque LOKY esté cerrada"));
assert(bg.includes("Notification.requestPermission()"));
assert(bg.includes("navigator.serviceWorker.ready"));
assert(bg.includes("window.navigator.standalone===true"));
assert(bg.includes("window.LOKY_PC4_BACKGROUND_ALARM"));

assert(!/getUserMedia\s*\(/.test(bg));
assert(!/new\s+WebSocket\s*\(/.test(bg));
assert(!/LOKY_PC4_LIVE/.test(bg));
assert(!/speechSynthesis/.test(bg));

assert(sw.includes("const VERSION='loky-pc4-mobile-ios-0.3.2-r4f9'"));
assert(sw.includes("'./mobile-background-alarm.js'"));
assert(sw.includes("self.addEventListener('push'"));
assert(sw.includes("self.registration.showNotification"));
assert(sw.includes("LOKY · ALARMA"));
assert(sw.includes("requireInteraction:isAlarm"));
assert(sw.includes("self.addEventListener('notificationclick'"));
assert(sw.includes("new URL(target,self.registration.scope).href"));
assert(sw.includes("self.clients.openWindow(targetUrl)"));

assert(index.includes('<script src="./mobile-planner.js?v=0.3.2r4f8"></script>'));
assert(index.includes('<script src="./mobile-background-alarm.js?v=0.3.2r4f9"></script>'));
assert(index.indexOf('mobile-planner.js?v=0.3.2r4f8') < index.indexOf('mobile-background-alarm.js?v=0.3.2r4f9'));

assert(planner.includes("const VERSION='0.3.2R4F8R5-instant-alarm-capture'"));
assert(planner.includes("const STORE_KEY='loky_pc4_mobile_planner_v1'"));

console.log('R4F9 cloud background alarms isolated layer PASS');
