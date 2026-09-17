(() => {
  'use strict';

  const VERSION='0.3.2R4F4R1-seismic-controller';
  const USGS_FEED='https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
  const CACHE_KEY='loky_pc4_mobile_quakes_v1';
  const MAX_EVENTS=80;
  const REFRESH_MS=5*60*1000;
  const SPHERE_MIN_ZOOM=.85;
  const SPHERE_MAX_ZOOM=2.6;
  const GLOBE_MIN_ZOOM=.82;
  const GLOBE_MAX_ZOOM=3.2;

  const app=document.getElementById('app');
  const stage=document.querySelector('.stage');
  const sphereWrap=document.querySelector('.sphere-wrap');
  const sphereCanvas=document.getElementById('lokySphere');
  const features=window.LOKY_PC4_FEATURES;
  const seismicButton=features?.slots?.[1]||document.querySelector('.future-op-2');

  const state={
    active:false,
    quakes:[],
    fetchedAt:0,
    feedSource:'',
    loading:false,
    location:null,
    locationState:'idle',
    centerLon:-18,
    centerLat:10,
    globeZoom:1,
    sphereZoom:1,
    refreshTimer:0,
    selectedQuake:null,
    hitQuakes:[],
    spherePointers:new Map(),
    spherePinchDistance:0,
    spherePinchZoom:1,
  };

  function clamp(value,min,max){return Math.max(min,Math.min(max,Number(value)||0));}

  function injectStyles(){
    if(document.getElementById('lokySeismicStyles'))return;
    const style=document.createElement('style');
    style.id='lokySeismicStyles';
    style.textContent=`
      .future-op-2.feature-seismic{pointer-events:auto!important;opacity:.96!important;border-color:rgba(104,218,255,.34)!important}
      .future-op-2.feature-seismic::before{content:""!important;width:19px!important;height:19px!important;border-radius:0!important;background:#c9f5ff!important;box-shadow:none!important;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9' fill='none' stroke='black' stroke-width='2'/%3E%3Cpath d='M3 12h18M12 3c2.7 2.4 4 5.4 4 9s-1.3 6.6-4 9M12 3c-2.7 2.4-4 5.4-4 9s1.3 6.6 4 9M5.5 17h3l1.2-3 2.2 4.6 1.8-5.2 1.2 2.1h3.6' fill='none' stroke='black' stroke-width='1.55' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat!important;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9' fill='none' stroke='black' stroke-width='2'/%3E%3Cpath d='M3 12h18M12 3c2.7 2.4 4 5.4 4 9s-1.3 6.6-4 9M12 3c-2.7 2.4-4 5.4-4 9s1.3 6.6 4 9M5.5 17h3l1.2-3 2.2 4.6 1.8-5.2 1.2 2.1h3.6' fill='none' stroke='black' stroke-width='1.55' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat!important;filter:drop-shadow(0 0 7px rgba(102,218,255,.42))!important}
      .future-op-2.feature-seismic::after{content:"";position:absolute;right:4px;top:4px;width:5px;height:5px;border-radius:50%;background:#ff6b57;box-shadow:0 0 7px rgba(255,82,64,.7);opacity:.78}
      .future-op-2.feature-seismic[aria-pressed="true"]{border-color:rgba(255,120,82,.52)!important;box-shadow:0 0 17px rgba(255,83,62,.17),inset 0 1px 0 rgba(255,225,214,.08)!important}
      .loky-seismic-hud{position:absolute;z-index:14;left:50%;top:14px;bottom:auto;transform:translateX(-50%) translateY(-7px);display:grid;justify-items:center;gap:3px;min-width:210px;max-width:82vw;padding:7px 13px;border:1px solid rgba(102,198,231,.18);border-radius:14px;background:rgba(3,15,23,.72);backdrop-filter:blur(13px);-webkit-backdrop-filter:blur(13px);opacity:0;pointer-events:none;transition:opacity .28s ease,transform .28s ease;box-shadow:0 10px 32px rgba(0,0,0,.16),0 0 22px rgba(59,190,231,.05)}
      .loky-seismic-hud strong{font-size:9px;letter-spacing:.16em;color:#d2f7ff;text-shadow:0 0 13px rgba(103,218,255,.20)}
      .loky-seismic-hud span{font-size:8px;color:#82a7b9;letter-spacing:.025em;text-align:center;white-space:nowrap}
      .loky-quake-info{position:absolute;z-index:15;left:50%;top:68px;width:min(84vw,390px);padding:10px 38px 10px 13px;border-radius:15px;border:1px solid rgba(96,207,242,.22);background:rgba(3,17,27,.88);box-shadow:0 14px 42px rgba(0,0,0,.26),0 0 24px rgba(47,186,232,.07);backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);opacity:0;transform:translateX(-50%) translateY(-7px) scale(.98);pointer-events:none;transition:opacity .22s ease,transform .22s ease}
      .loky-quake-info.is-visible{opacity:1;transform:translateX(-50%) translateY(0) scale(1);pointer-events:auto}
      .loky-quake-info strong{display:block;font-size:11px;letter-spacing:.11em;color:#d9f8ff;margin-bottom:3px}
      .loky-quake-info .quake-place{display:block;font-size:9px;color:#9ec8d9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px}
      .loky-quake-info .quake-meta{font-size:8px;letter-spacing:.04em;color:#6f9bad;line-height:1.45}
      .loky-quake-info .quake-close{position:absolute;right:8px;top:8px;width:25px;height:25px;border-radius:50%;border:1px solid rgba(111,210,241,.16);background:rgba(12,43,58,.65);color:#a8ddec;font-size:16px;line-height:1;pointer-events:auto}
      .loky-seismic-mode .sphere-wrap{display:none!important}
      .loky-seismic-mode .loky-seismic-hud{opacity:1;transform:translateX(-50%) translateY(0)}
      .sphere-wrap{transform-origin:50% 50%;will-change:transform;transition:opacity .28s ease,transform .13s ease-out}
      @media(max-height:760px){.loky-seismic-hud{top:9px}.loky-quake-info{top:61px}}
      @media(orientation:landscape) and (max-height:600px){.loky-seismic-hud{top:5px}.loky-quake-info{top:48px;width:min(68vw,440px)}}
      @media(prefers-reduced-motion:reduce){.loky-seismic-hud,.loky-quake-info,.sphere-wrap{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function makeUi(){
    if(!stage)return {hud:null,info:null};
    let hud=document.getElementById('lokySeismicHud');
    let info=document.getElementById('lokyQuakeInfo');
    if(!hud){
      hud=document.createElement('div');hud.id='lokySeismicHud';hud.className='loky-seismic-hud';
      const title=document.createElement('strong');title.textContent='SISMOS · ÚLTIMAS 24H';
      const detail=document.createElement('span');detail.id='lokySeismicHudDetail';detail.textContent='USGS · preparando datos…';
      hud.appendChild(title);hud.appendChild(detail);stage.appendChild(hud);
    }
    if(!info){
      info=document.createElement('div');info.id='lokyQuakeInfo';info.className='loky-quake-info';info.setAttribute('role','status');info.setAttribute('aria-live','polite');
      const title=document.createElement('strong');title.className='quake-title';title.textContent='SISMO';
      const place=document.createElement('span');place.className='quake-place';
      const meta=document.createElement('div');meta.className='quake-meta';
      const close=document.createElement('button');close.type='button';close.className='quake-close';close.setAttribute('aria-label','Cerrar información del sismo');close.textContent='×';close.addEventListener('click',()=>selectQuake(null));
      info.appendChild(title);info.appendChild(place);info.appendChild(meta);info.appendChild(close);stage.appendChild(info);
    }
    return {hud,info};
  }

  injectStyles();
  const {info:quakeInfo}=makeUi();
  const hudDetail=()=>document.getElementById('lokySeismicHudDetail');

  function project(lon,lat,radius,cx,cy){
    const rad=Math.PI/180,lambda=(Number(lon)-state.centerLon)*rad,phi=Number(lat)*rad,phi0=state.centerLat*rad,cosPhi=Math.cos(phi);
    const z=Math.sin(phi)*Math.sin(phi0)+cosPhi*Math.cos(phi0)*Math.cos(lambda);if(z<=0)return null;
    return {x:cx+radius*cosPhi*Math.sin(lambda),y:cy-radius*(Math.sin(phi)*Math.cos(phi0)-cosPhi*Math.cos(lambda)*Math.sin(phi0)),z};
  }

  function parseFeed(data){
    const source=Array.isArray(data?.features)?data.features:[];
    return source.map(feature=>{const c=feature?.geometry?.coordinates||[];return {id:String(feature?.id||''),lon:Number(c[0]),lat:Number(c[1]),depth:Number(c[2]),mag:Number(feature?.properties?.mag),place:String(feature?.properties?.place||'Sismo'),time:Number(feature?.properties?.time)||0,url:String(feature?.properties?.url||'')};})
      .filter(q=>Number.isFinite(q.lon)&&Number.isFinite(q.lat)&&Number.isFinite(q.mag)).sort((a,b)=>b.time-a.time).slice(0,MAX_EVENTS);
  }

  function saveQuakeCache(){try{localStorage.setItem(CACHE_KEY,JSON.stringify({at:Date.now(),quakes:state.quakes}));}catch{}}
  function loadQuakeCache(){try{const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(!cached||!Array.isArray(cached.quakes))return false;state.quakes=cached.quakes.slice(0,MAX_EVENTS);state.fetchedAt=Number(cached.at)||0;state.feedSource='cache';return state.quakes.length>0;}catch{return false;}}

  function updateHud(){
    const detail=hudDetail();if(!detail)return;
    if(state.loading){detail.textContent='USGS · actualizando sismos…';return;}
    const location=state.location?' · TU UBICACIÓN':state.locationState==='requesting'?' · UBICANDO…':state.locationState==='denied'?' · UBICACIÓN NO DISPONIBLE':'';
    detail.textContent=`${state.feedSource==='cache'?'DATOS GUARDADOS':'USGS'} · ${state.quakes.length} EVENTOS${location}`;
  }

  function relativeTime(ms){const diff=Math.max(0,Date.now()-Number(ms||0)),min=Math.floor(diff/60000);if(min<1)return 'AHORA';if(min<60)return `HACE ${min} MIN`;const hr=Math.floor(min/60);if(hr<24)return `HACE ${hr} H`;return `HACE ${Math.floor(hr/24)} D`;}

  function selectQuake(quake){
    state.selectedQuake=quake||null;if(!quakeInfo)return;
    if(!quake){quakeInfo.classList.remove('is-visible');return;}
    const title=quakeInfo.querySelector?.('.quake-title'),place=quakeInfo.querySelector?.('.quake-place'),meta=quakeInfo.querySelector?.('.quake-meta');
    if(title)title.textContent=`MAG ${Number(quake.mag).toFixed(1)} · SISMO`;
    if(place)place.textContent=quake.place||'Ubicación no especificada';
    if(meta)meta.textContent=`${relativeTime(quake.time)} · PROFUNDIDAD ${Number.isFinite(quake.depth)?Number(quake.depth).toFixed(1):'—'} KM · ${quake.lat.toFixed(2)}°, ${quake.lon.toFixed(2)}°`;
    quakeInfo.classList.add('is-visible');
  }

  async function fetchEarthquakes(force=false){
    if(state.loading)return state.quakes;if(!force&&state.quakes.length&&Date.now()-state.fetchedAt<60*1000)return state.quakes;
    state.loading=true;updateHud();
    try{const response=await fetch(USGS_FEED,{cache:'no-store'});if(!response.ok)throw new Error(`USGS_${response.status}`);const parsed=parseFeed(await response.json());if(!parsed.length)throw new Error('USGS_EMPTY');state.quakes=parsed;state.fetchedAt=Date.now();state.feedSource='usgs';saveQuakeCache();window.dispatchEvent(new CustomEvent('loky:seismic-data',{detail:{count:parsed.length}}));}
    catch(error){if(!state.quakes.length)loadQuakeCache();console.warn('[LOKY Sismos] feed no disponible',error?.message||error);}
    finally{state.loading=false;updateHud();}
    return state.quakes;
  }

  function requestLocation(){
    if(state.location||state.locationState==='requesting'||state.locationState==='denied')return;
    if(!navigator.geolocation){state.locationState='denied';updateHud();return;}
    state.locationState='requesting';updateHud();
    navigator.geolocation.getCurrentPosition(position=>{const lat=Number(position?.coords?.latitude),lon=Number(position?.coords?.longitude);if(Number.isFinite(lat)&&Number.isFinite(lon)){state.location={lat,lon,accuracy:Number(position?.coords?.accuracy)||0};state.locationState='ready';state.centerLon=lon;state.centerLat=clamp(lat*.42,-58,58);window.dispatchEvent(new CustomEvent('loky:seismic-view'));}else state.locationState='denied';updateHud();},()=>{state.locationState='denied';updateHud();},{enableHighAccuracy:false,timeout:7000,maximumAge:10*60*1000});
  }

  function resetGlobeView(){state.globeZoom=1;if(state.location){state.centerLon=state.location.lon;state.centerLat=clamp(state.location.lat*.42,-58,58);}else{state.centerLon=-18;state.centerLat=10;}window.dispatchEvent(new CustomEvent('loky:seismic-view'));}
  function setSphereZoom(value){state.sphereZoom=clamp(value,SPHERE_MIN_ZOOM,SPHERE_MAX_ZOOM);if(sphereWrap)sphereWrap.style.transform=`scale(${state.sphereZoom.toFixed(3)})`;return state.sphereZoom;}
  function resetSphereZoom(){return setSphereZoom(1);}

  function resizeSphereSurface(){requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));}

  function enterSeismic(){
    if(state.active)return;state.active=true;app?.classList.add('loky-seismic-mode');
    if(seismicButton){seismicButton.setAttribute('aria-pressed','true');seismicButton.setAttribute('title','Volver a LOKY');}
    fetchEarthquakes(false);requestLocation();if(state.refreshTimer)clearInterval(state.refreshTimer);state.refreshTimer=setInterval(()=>fetchEarthquakes(true),REFRESH_MS);
    resizeSphereSurface();window.dispatchEvent(new CustomEvent('loky:seismic-mode',{detail:{active:true}}));
  }

  function exitSeismic(){
    if(!state.active)return;state.active=false;app?.classList.remove('loky-seismic-mode');selectQuake(null);
    if(seismicButton){seismicButton.setAttribute('aria-pressed','false');seismicButton.setAttribute('title','Sismos');}
    if(state.refreshTimer)clearInterval(state.refreshTimer);state.refreshTimer=0;state.hitQuakes=[];
    resizeSphereSurface();window.dispatchEvent(new CustomEvent('loky:seismic-mode',{detail:{active:false}}));
  }
  function toggleSeismic(){state.active?exitSeismic():enterSeismic();}

  function distance(points){const vals=[...points.values()];return vals.length<2?0:Math.hypot(vals[0].x-vals[1].x,vals[0].y-vals[1].y);}
  function attachSphereZoom(){
    if(!sphereCanvas||!sphereWrap)return;
    sphereCanvas.addEventListener('pointerdown',event=>{if(state.active)return;state.spherePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});try{sphereCanvas.setPointerCapture(event.pointerId)}catch{}if(state.spherePointers.size===2){state.spherePinchDistance=distance(state.spherePointers)||1;state.spherePinchZoom=state.sphereZoom;}});
    sphereCanvas.addEventListener('pointermove',event=>{if(state.active||!state.spherePointers.has(event.pointerId))return;state.spherePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(state.spherePointers.size===2){event.preventDefault();const next=distance(state.spherePointers)||state.spherePinchDistance;setSphereZoom(state.spherePinchZoom*(next/Math.max(1,state.spherePinchDistance)));}},{passive:false});
    const end=event=>state.spherePointers.delete(event.pointerId);sphereCanvas.addEventListener('pointerup',end);sphereCanvas.addEventListener('pointercancel',end);sphereCanvas.addEventListener('dblclick',event=>{event.preventDefault();resetSphereZoom();});
  }

  if(seismicButton){seismicButton.disabled=false;seismicButton.classList.add('is-action','feature-seismic');seismicButton.setAttribute('aria-label','Sismos');seismicButton.setAttribute('title','Sismos');seismicButton.setAttribute('aria-pressed','false');seismicButton.addEventListener('click',toggleSeismic);}
  attachSphereZoom();window.addEventListener('pagehide',()=>{if(state.refreshTimer)clearInterval(state.refreshTimer);},{once:true});loadQuakeCache();updateHud();

  window.LOKY_PC4_SEISMIC={version:VERSION,feed:USGS_FEED,state,parseFeed,project,clamp,enter:enterSeismic,exit:exitSeismic,toggle:toggleSeismic,refresh:()=>fetchEarthquakes(true),resetGlobeView,setSphereZoom,resetSphereZoom,selectQuake,bounds:{globeMin:GLOBE_MIN_ZOOM,globeMax:GLOBE_MAX_ZOOM}};
})();