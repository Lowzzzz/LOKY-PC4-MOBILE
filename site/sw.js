const VERSION='loky-pc4-mobile-ios-0.3.2-r4f9';
const CACHE=`${VERSION}-shell`;
const SHELL=[
  './','./index.html','./mobile.css','./sphere-mobile.js','./app.js','./live-mobile.js',
  './ios-audio-stability.js','./mobile-features.js','./mobile-settings-plus.js','./mobile-background-alarm.js',
  './mobile-noise-guard.js','./mobile-seismic.js','./mobile-earth-reference.js',
  './earth-geometry-r4f6.json','./manifest.webmanifest','./icons/icon-180.png','./icons/icon-512.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('loky-pc4-mobile-ios-')&&k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

async function networkFirst(request){
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response&&response.ok){
      const cache=await caches.open(CACHE);
      cache.put(request,response.clone()).catch(()=>{});
    }
    return response;
  }catch{
    return (await caches.match(request))||Response.error();
  }
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  const runtimeAsset=
    event.request.mode==='navigate'||
    /\/(index\.html|app\.js|live-mobile\.js|ios-audio-stability\.js|sphere-mobile\.js|mobile-features\.js|mobile-settings-plus\.js|mobile-background-alarm\.js|mobile-noise-guard\.js|mobile-seismic\.js|mobile-earth-reference\.js|earth-geometry-r4f6\.json|mobile\.css|version\.json|manifest\.webmanifest)$/.test(url.pathname);

  if(runtimeAsset){
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{
      if(response&&response.ok)caches.open(CACHE).then(c=>c.put(event.request,response.clone())).catch(()=>{});
      return response;
    }))
  );
});


self.addEventListener('push',event=>{
  let payload={};
  try{payload=event.data?.json?.()||{}}catch{
    try{payload={body:event.data?.text?.()||''}}catch{}
  }

  const isAlarm=payload?.type==='alarm';
  const title=isAlarm?'LOKY · ALARMA':String(payload?.title||'LOKY');
  const body=isAlarm
    ? String(payload?.title||'Alarma programada')
    : String(payload?.body||'Tienes una notificación de LOKY.');
  const plannerId=String(payload?.plannerId||'');
  const url=String(payload?.url||'./');
  const tag=isAlarm&&plannerId
    ? `loky-background-alarm-${plannerId}`
    : `loky-background-${Date.now()}`;

  event.waitUntil(
    self.registration.showNotification(title,{
      body,
      tag,
      renotify:true,
      requireInteraction:isAlarm,
      icon:'./icons/icon-180.png',
      badge:'./icons/icon-180.png',
      data:{url,plannerId,type:String(payload?.type||'notification'),fireAt:payload?.fireAt||null},
    })
  );
});

self.addEventListener('notificationclick',event=>{
  event.notification?.close?.();
  const target=String(event.notification?.data?.url||'./');
  const targetUrl=new URL(target,self.registration.scope).href;
  event.waitUntil((async()=>{
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clients){
      try{
        if('navigate' in client)await client.navigate(targetUrl);
        if('focus' in client)return await client.focus();
      }catch{}
    }
    if(self.clients.openWindow)return await self.clients.openWindow(targetUrl);
  })());
});
