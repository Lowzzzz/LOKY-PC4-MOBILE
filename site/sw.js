const VERSION='loky-pc4-mobile-ios-0.3.2';
const CACHE=`${VERSION}-shell`;
const SHELL=['./','./index.html','./mobile.css','./sphere-mobile.js','./app.js','./live-mobile.js','./ios-audio-stability.js','./manifest.webmanifest','./icons/icon-180.png','./icons/icon-512.png'];

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

  const critical=
    event.request.mode==='navigate'||
    /\/(index\.html|app\.js|live-mobile\.js|ios-audio-stability\.js|sphere-mobile\.js|mobile\.css|version\.json|manifest\.webmanifest)$/.test(url.pathname);

  if(critical){
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
