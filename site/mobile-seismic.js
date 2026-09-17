(() => {
  'use strict';

  const VERSION='0.3.2R4F3-sismos-globe-zoom';
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
    raf:0,
    refreshTimer:0,
    dragPointer:null,
    dragX:0,
    dragY:0,
    globePointers:new Map(),
    globePinchDistance:0,
    globePinchZoom:1,
    spherePointers:new Map(),
    spherePinchDistance:0,
    spherePinchZoom:1,
  };

  function clamp(value,min,max){
    return Math.max(min,Math.min(max,Number(value)||0));
  }

  function injectStyles(){
    if(document.getElementById('lokySeismicStyles'))return;
    const style=document.createElement('style');
    style.id='lokySeismicStyles';
    style.textContent=`
      .future-op-2.feature-seismic{pointer-events:auto!important;opacity:.96!important;border-color:rgba(104,218,255,.34)!important}
      .future-op-2.feature-seismic::before{
        content:""!important;width:19px!important;height:19px!important;border-radius:0!important;background:#bdefff!important;box-shadow:none!important;
        -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9' fill='none' stroke='black' stroke-width='2'/%3E%3Cpath d='M3 12h18M12 3c2.7 2.4 4 5.4 4 9s-1.3 6.6-4 9M12 3c-2.7 2.4-4 5.4-4 9s1.3 6.6 4 9M5.5 17h3l1.2-3 2.2 4.6 1.8-5.2 1.2 2.1h3.6' fill='none' stroke='black' stroke-width='1.55' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat!important;
        mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9' fill='none' stroke='black' stroke-width='2'/%3E%3Cpath d='M3 12h18M12 3c2.7 2.4 4 5.4 4 9s-1.3 6.6-4 9M12 3c-2.7 2.4-4 5.4-4 9s1.3 6.6 4 9M5.5 17h3l1.2-3 2.2 4.6 1.8-5.2 1.2 2.1h3.6' fill='none' stroke='black' stroke-width='1.55' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat!important;
        filter:drop-shadow(0 0 6px rgba(102,218,255,.38))!important;
      }
      .future-op-2.feature-seismic::after{content:"";position:absolute;right:4px;top:4px;width:5px;height:5px;border-radius:50%;background:#ff6b57;box-shadow:0 0 7px rgba(255,82,64,.7);opacity:.78}
      .future-op-2.feature-seismic[aria-pressed="true"]{border-color:rgba(255,120,82,.52)!important;box-shadow:0 0 17px rgba(255,83,62,.17),inset 0 1px 0 rgba(255,225,214,.08)!important}
      .loky-seismic-canvas{position:absolute;z-index:8;width:min(88vw,550px);height:min(88vw,550px);max-width:550px;max-height:550px;opacity:0;transform:scale(.94);pointer-events:none;touch-action:none;transition:opacity .32s ease,transform .32s cubic-bezier(.22,.75,.25,1);filter:drop-shadow(0 0 22px rgba(44,180,225,.10))}
      .loky-seismic-hud{position:absolute;z-index:12;left:50%;bottom:18px;transform:translateX(-50%) translateY(7px);display:grid;justify-items:center;gap:3px;min-width:190px;padding:7px 12px;border:1px solid rgba(102,198,231,.15);border-radius:14px;background:rgba(3,15,23,.58);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);opacity:0;pointer-events:none;transition:opacity .28s ease,transform .28s ease}
      .loky-seismic-hud strong{font-size:9px;letter-spacing:.16em;color:#bfeeff}.loky-seismic-hud span{font-size:8px;color:#6f98aa;letter-spacing:.025em;text-align:center}
      .loky-seismic-mode .sphere-wrap{opacity:0;transform:scale(.93)!important;pointer-events:none;transition:opacity .28s ease,transform .32s ease}
      .loky-seismic-mode .loky-seismic-canvas{opacity:1;transform:scale(1);pointer-events:auto}
      .loky-seismic-mode .loky-seismic-hud{opacity:1;transform:translateX(-50%) translateY(0)}
      .sphere-wrap{transform-origin:50% 50%;will-change:transform;transition:opacity .28s ease,transform .13s ease-out}
      @media(max-height:760px){.loky-seismic-canvas{width:min(76vw,470px);height:min(76vw,470px)}.loky-seismic-hud{bottom:12px}}
      @media(orientation:landscape) and (max-height:600px){.loky-seismic-canvas{width:min(69vh,430px);height:min(69vh,430px)}.loky-seismic-hud{bottom:4px}}
      @media(prefers-reduced-motion:reduce){.loky-seismic-canvas,.loky-seismic-hud,.sphere-wrap{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function makeCanvas(){
    if(!stage)return {canvas:null,hud:null};
    let canvas=document.getElementById('lokySeismicGlobe');
    let hud=document.getElementById('lokySeismicHud');
    if(!canvas){
      canvas=document.createElement('canvas');
      canvas.id='lokySeismicGlobe';
      canvas.className='loky-seismic-canvas';
      canvas.setAttribute('aria-label','Globo de sismos recientes');
      stage.appendChild(canvas);
    }
    if(!hud){
      hud=document.createElement('div');
      hud.id='lokySeismicHud';
      hud.className='loky-seismic-hud';
      const title=document.createElement('strong');
      title.textContent='SISMOS · ÚLTIMAS 24H';
      const detail=document.createElement('span');
      detail.id='lokySeismicHudDetail';
      detail.textContent='USGS · preparando datos…';
      hud.appendChild(title);
      hud.appendChild(detail);
      stage.appendChild(hud);
    }
    return {canvas,hud};
  }

  injectStyles();
  const {canvas:globeCanvas,hud}=makeCanvas();
  const hudDetail=()=>document.getElementById('lokySeismicHudDetail');
  const ctx=globeCanvas?.getContext?.('2d',{alpha:true})||null;

  const LAND=[
    [[-168,71],[-150,68],[-135,58],[-125,50],[-122,38],[-111,29],[-100,23],[-90,19],[-83,9],[-77,8],[-70,20],[-66,45],[-55,52],[-61,63],[-88,72],[-120,74],[-150,73],[-168,71]],
    [[-74,60],[-48,60],[-23,72],[-31,82],[-55,82],[-74,70],[-74,60]],
    [[-81,12],[-71,7],[-62,-3],[-54,-14],[-58,-27],[-66,-42],[-72,-55],[-78,-40],[-76,-18],[-81,12]],
    [[-11,36],[2,44],[18,48],[31,46],[40,55],[62,61],[88,67],[118,63],[145,54],[165,50],[151,38],[128,28],[109,18],[101,6],[80,7],[68,24],[49,30],[35,36],[25,39],[10,38],[-11,36]],
    [[-17,36],[2,36],[18,32],[34,27],[50,12],[43,-13],[34,-28],[20,-35],[5,-34],[-7,-24],[-13,-5],[-17,17],[-17,36]],
    [[112,-11],[132,-10],[153,-16],[154,-36],[140,-44],[119,-35],[112,-11]],
    [[166,-34],[178,-38],[176,-46],[168,-45],[166,-34]],
    [[-8,50],[2,51],[1,59],[-6,58],[-8,50]],
    [[130,31],[145,36],[143,45],[132,42],[130,31]],
  ];

  function resizeGlobe(){
    if(!globeCanvas||!ctx)return;
    const rect=globeCanvas.getBoundingClientRect();
    const dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));
    const w=Math.max(1,Math.round(rect.width*dpr));
    const h=Math.max(1,Math.round(rect.height*dpr));
    if(globeCanvas.width!==w||globeCanvas.height!==h){
      globeCanvas.width=w;
      globeCanvas.height=h;
    }
  }

  function project(lon,lat,radius,cx,cy){
    const rad=Math.PI/180;
    const lambda=(Number(lon)-state.centerLon)*rad;
    const phi=Number(lat)*rad;
    const phi0=state.centerLat*rad;
    const cosPhi=Math.cos(phi);
    const z=Math.sin(phi)*Math.sin(phi0)+cosPhi*Math.cos(phi0)*Math.cos(lambda);
    if(z<=0)return null;
    const x=cosPhi*Math.sin(lambda);
    const y=Math.sin(phi)*Math.cos(phi0)-cosPhi*Math.cos(lambda)*Math.sin(phi0);
    return {x:cx+radius*x,y:cy-radius*y,z};
  }

  function drawPath(points,radius,cx,cy,stroke,fill){
    let any=false;
    let pen=false;
    ctx.beginPath();
    for(const [lon,lat] of points){
      const p=project(lon,lat,radius,cx,cy);
      if(!p){pen=false;continue;}
      if(!pen){ctx.moveTo(p.x,p.y);pen=true;}else ctx.lineTo(p.x,p.y);
      any=true;
    }
    if(!any)return;
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}
  }

  function drawGrid(radius,cx,cy){
    ctx.lineWidth=Math.max(1,globeCanvas.width/650);
    ctx.strokeStyle='rgba(93,192,226,.115)';
    for(let lat=-60;lat<=60;lat+=30){
      const pts=[];
      for(let lon=-180;lon<=180;lon+=3)pts.push([lon,lat]);
      drawPath(pts,radius,cx,cy,ctx.strokeStyle,null);
    }
    for(let lon=-180;lon<180;lon+=30){
      const pts=[];
      for(let lat=-88;lat<=88;lat+=3)pts.push([lon,lat]);
      drawPath(pts,radius,cx,cy,ctx.strokeStyle,null);
    }
  }

  function markerColor(mag){
    if(mag>=6)return 'rgba(255,72,55,.96)';
    if(mag>=5)return 'rgba(255,115,62,.95)';
    if(mag>=4)return 'rgba(255,178,76,.94)';
    if(mag>=2.5)return 'rgba(255,220,114,.92)';
    return 'rgba(111,220,255,.88)';
  }

  function drawQuakes(radius,cx,cy,now){
    const pulse=(Math.sin(now/420)+1)*.5;
    for(const quake of state.quakes){
      const p=project(quake.lon,quake.lat,radius,cx,cy);
      if(!p)continue;
      const mag=Math.max(0,Number(quake.mag)||0);
      const r=(2.1+Math.min(8,mag)*.62)*Math.min(1.45,state.globeZoom*.84+0.35);
      const color=markerColor(mag);
      ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
      if(mag>=4.5){
        ctx.beginPath();ctx.arc(p.x,p.y,r+4+pulse*4,0,Math.PI*2);ctx.strokeStyle=color.replace(/\.[0-9]+\)$/,'0.26)');ctx.lineWidth=1;ctx.stroke();
      }
    }
  }

  function drawLocation(radius,cx,cy,now){
    if(!state.location)return;
    const p=project(state.location.lon,state.location.lat,radius,cx,cy);
    if(!p)return;
    const pulse=(Math.sin(now/360)+1)*.5;
    ctx.beginPath();ctx.arc(p.x,p.y,5.2,0,Math.PI*2);ctx.fillStyle='rgba(224,250,255,.98)';ctx.fill();
    ctx.beginPath();ctx.arc(p.x,p.y,9+pulse*5,0,Math.PI*2);ctx.strokeStyle='rgba(91,224,255,.62)';ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.arc(p.x,p.y,15+pulse*8,0,Math.PI*2);ctx.strokeStyle='rgba(91,224,255,.17)';ctx.lineWidth=1;ctx.stroke();
  }

  function drawGlobe(now=performance.now()){
    if(!ctx||!globeCanvas||!state.active)return;
    resizeGlobe();
    const w=globeCanvas.width,h=globeCanvas.height;
    ctx.clearRect(0,0,w,h);
    const cx=w/2,cy=h/2;
    const radius=Math.min(w,h)*.405*state.globeZoom;

    const glow=ctx.createRadialGradient(cx-radius*.30,cy-radius*.34,radius*.08,cx,cy,radius*1.1);
    glow.addColorStop(0,'rgba(28,104,137,.46)');
    glow.addColorStop(.58,'rgba(5,31,45,.94)');
    glow.addColorStop(1,'rgba(1,8,13,.98)');
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fillStyle=glow;ctx.fill();
    ctx.save();
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.clip();
    drawGrid(radius,cx,cy);
    ctx.lineWidth=Math.max(1.1,w/610);
    for(const land of LAND){
      drawPath(land,radius,cx,cy,'rgba(108,209,237,.38)','rgba(36,111,136,.17)');
    }
    drawQuakes(radius,cx,cy,now);
    drawLocation(radius,cx,cy,now);
    ctx.restore();
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.strokeStyle='rgba(117,220,249,.28)';ctx.lineWidth=Math.max(1.2,w/500);ctx.stroke();
    ctx.beginPath();ctx.arc(cx,cy,radius*.985,0,Math.PI*2);ctx.strokeStyle='rgba(90,193,229,.08)';ctx.lineWidth=Math.max(3,w/180);ctx.stroke();

    state.raf=requestAnimationFrame(drawGlobe);
  }

  function parseFeed(data){
    const features=Array.isArray(data?.features)?data.features:[];
    return features.map(feature=>{
      const c=feature?.geometry?.coordinates||[];
      return {
        id:String(feature?.id||''),
        lon:Number(c[0]),
        lat:Number(c[1]),
        depth:Number(c[2]),
        mag:Number(feature?.properties?.mag),
        place:String(feature?.properties?.place||'Sismo'),
        time:Number(feature?.properties?.time)||0,
      };
    }).filter(q=>Number.isFinite(q.lon)&&Number.isFinite(q.lat)&&Number.isFinite(q.mag))
      .sort((a,b)=>b.time-a.time)
      .slice(0,MAX_EVENTS);
  }

  function saveQuakeCache(){
    try{
      localStorage.setItem(CACHE_KEY,JSON.stringify({at:Date.now(),quakes:state.quakes}));
    }catch{}
  }

  function loadQuakeCache(){
    try{
      const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(!cached||!Array.isArray(cached.quakes))return false;
      state.quakes=cached.quakes.slice(0,MAX_EVENTS);
      state.fetchedAt=Number(cached.at)||0;
      state.feedSource='cache';
      return state.quakes.length>0;
    }catch{return false;}
  }

  function updateHud(){
    const detail=hudDetail();
    if(!detail)return;
    if(state.loading){detail.textContent='USGS · actualizando sismos…';return;}
    const count=state.quakes.length;
    const location=state.location?' · TU UBICACIÓN':state.locationState==='requesting'?' · UBICANDO…':state.locationState==='denied'?' · UBICACIÓN NO DISPONIBLE':'';
    const source=state.feedSource==='cache'?'DATOS GUARDADOS':'USGS';
    detail.textContent=`${source} · ${count} EVENTOS${location}`;
  }

  async function fetchEarthquakes(force=false){
    if(state.loading)return state.quakes;
    if(!force&&state.quakes.length&&Date.now()-state.fetchedAt<60*1000)return state.quakes;
    state.loading=true;updateHud();
    try{
      const response=await fetch(USGS_FEED,{cache:'no-store'});
      if(!response.ok)throw new Error(`USGS_${response.status}`);
      const data=await response.json();
      const parsed=parseFeed(data);
      if(!parsed.length)throw new Error('USGS_EMPTY');
      state.quakes=parsed;
      state.fetchedAt=Date.now();
      state.feedSource='usgs';
      saveQuakeCache();
    }catch(error){
      if(!state.quakes.length)loadQuakeCache();
      console.warn('[LOKY Sismos] feed no disponible',error?.message||error);
    }finally{
      state.loading=false;updateHud();
    }
    return state.quakes;
  }

  function requestLocation(){
    if(state.location||state.locationState==='requesting'||state.locationState==='denied')return;
    if(!navigator.geolocation){state.locationState='denied';updateHud();return;}
    state.locationState='requesting';updateHud();
    navigator.geolocation.getCurrentPosition(position=>{
      const lat=Number(position?.coords?.latitude);
      const lon=Number(position?.coords?.longitude);
      if(Number.isFinite(lat)&&Number.isFinite(lon)){
        state.location={lat,lon,accuracy:Number(position?.coords?.accuracy)||0};
        state.locationState='ready';
        state.centerLon=lon;
        state.centerLat=clamp(lat*.42,-58,58);
      }else state.locationState='denied';
      updateHud();
    },()=>{
      state.locationState='denied';
      updateHud();
    },{enableHighAccuracy:false,timeout:7000,maximumAge:10*60*1000});
  }

  function resetGlobeView(){
    state.globeZoom=1;
    if(state.location){
      state.centerLon=state.location.lon;
      state.centerLat=clamp(state.location.lat*.42,-58,58);
    }else{
      state.centerLon=-18;
      state.centerLat=10;
    }
  }

  function setSphereZoom(value){
    state.sphereZoom=clamp(value,SPHERE_MIN_ZOOM,SPHERE_MAX_ZOOM);
    if(sphereWrap)sphereWrap.style.transform=`scale(${state.sphereZoom.toFixed(3)})`;
    return state.sphereZoom;
  }

  function resetSphereZoom(){return setSphereZoom(1);}

  function enterSeismic(){
    if(state.active)return;
    state.active=true;
    app?.classList.add('loky-seismic-mode');
    if(seismicButton){seismicButton.setAttribute('aria-pressed','true');seismicButton.setAttribute('title','Volver a LOKY');}
    fetchEarthquakes(false);
    requestLocation();
    if(state.refreshTimer)clearInterval(state.refreshTimer);
    state.refreshTimer=setInterval(()=>fetchEarthquakes(true),REFRESH_MS);
    cancelAnimationFrame(state.raf);
    state.raf=requestAnimationFrame(drawGlobe);
    window.dispatchEvent(new CustomEvent('loky:seismic-mode',{detail:{active:true}}));
  }

  function exitSeismic(){
    if(!state.active)return;
    state.active=false;
    app?.classList.remove('loky-seismic-mode');
    if(seismicButton){seismicButton.setAttribute('aria-pressed','false');seismicButton.setAttribute('title','Sismos');}
    if(state.refreshTimer)clearInterval(state.refreshTimer);
    state.refreshTimer=0;
    cancelAnimationFrame(state.raf);state.raf=0;
    state.globePointers.clear();
    window.dispatchEvent(new CustomEvent('loky:seismic-mode',{detail:{active:false}}));
  }

  function toggleSeismic(){state.active?exitSeismic():enterSeismic();}

  function distance(points){
    const vals=[...points.values()];
    if(vals.length<2)return 0;
    return Math.hypot(vals[0].x-vals[1].x,vals[0].y-vals[1].y);
  }

  function attachSphereZoom(){
    if(!sphereCanvas||!sphereWrap)return;
    sphereCanvas.addEventListener('pointerdown',event=>{
      if(state.active)return;
      state.spherePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      try{sphereCanvas.setPointerCapture(event.pointerId)}catch{}
      if(state.spherePointers.size===2){
        state.spherePinchDistance=distance(state.spherePointers)||1;
        state.spherePinchZoom=state.sphereZoom;
      }
    });
    sphereCanvas.addEventListener('pointermove',event=>{
      if(state.active||!state.spherePointers.has(event.pointerId))return;
      state.spherePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(state.spherePointers.size===2){
        event.preventDefault();
        const next=distance(state.spherePointers)||state.spherePinchDistance;
        setSphereZoom(state.spherePinchZoom*(next/Math.max(1,state.spherePinchDistance)));
      }
    },{passive:false});
    const end=event=>state.spherePointers.delete(event.pointerId);
    sphereCanvas.addEventListener('pointerup',end);
    sphereCanvas.addEventListener('pointercancel',end);
    sphereCanvas.addEventListener('dblclick',event=>{event.preventDefault();resetSphereZoom();});
  }

  function attachGlobeControls(){
    if(!globeCanvas)return;
    globeCanvas.addEventListener('pointerdown',event=>{
      state.globePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      try{globeCanvas.setPointerCapture(event.pointerId)}catch{}
      if(state.globePointers.size===1){
        state.dragPointer=event.pointerId;state.dragX=event.clientX;state.dragY=event.clientY;
      }else if(state.globePointers.size===2){
        state.globePinchDistance=distance(state.globePointers)||1;
        state.globePinchZoom=state.globeZoom;
        state.dragPointer=null;
      }
    });
    globeCanvas.addEventListener('pointermove',event=>{
      if(!state.globePointers.has(event.pointerId))return;
      const previous=state.globePointers.get(event.pointerId);
      state.globePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(state.globePointers.size===2){
        event.preventDefault();
        const next=distance(state.globePointers)||state.globePinchDistance;
        state.globeZoom=clamp(state.globePinchZoom*(next/Math.max(1,state.globePinchDistance)),GLOBE_MIN_ZOOM,GLOBE_MAX_ZOOM);
        return;
      }
      if(state.globePointers.size===1&&state.dragPointer===event.pointerId){
        event.preventDefault();
        const dx=event.clientX-(previous?.x??event.clientX);
        const dy=event.clientY-(previous?.y??event.clientY);
        const rect=globeCanvas.getBoundingClientRect();
        const base=Math.max(120,Math.min(rect.width,rect.height)*.405*state.globeZoom);
        state.centerLon-=dx/base*70;
        state.centerLat=clamp(state.centerLat+dy/base*62,-72,72);
        while(state.centerLon>180)state.centerLon-=360;
        while(state.centerLon<-180)state.centerLon+=360;
      }
    },{passive:false});
    const end=event=>{
      state.globePointers.delete(event.pointerId);
      if(state.globePointers.size===1){
        const [id,p]=[...state.globePointers.entries()][0];
        state.dragPointer=id;state.dragX=p.x;state.dragY=p.y;
      }else if(!state.globePointers.size){
        state.dragPointer=null;
      }
    };
    globeCanvas.addEventListener('pointerup',end);
    globeCanvas.addEventListener('pointercancel',end);
    globeCanvas.addEventListener('wheel',event=>{
      if(!state.active)return;
      event.preventDefault();
      state.globeZoom=clamp(state.globeZoom*(event.deltaY>0?.92:1.08),GLOBE_MIN_ZOOM,GLOBE_MAX_ZOOM);
    },{passive:false});
    globeCanvas.addEventListener('dblclick',event=>{event.preventDefault();resetGlobeView();});
  }

  if(seismicButton){
    seismicButton.disabled=false;
    seismicButton.classList.add('is-action','feature-seismic');
    seismicButton.setAttribute('aria-label','Sismos');
    seismicButton.setAttribute('title','Sismos');
    seismicButton.setAttribute('aria-pressed','false');
    seismicButton.addEventListener('click',toggleSeismic);
  }

  attachSphereZoom();
  attachGlobeControls();
  window.addEventListener('resize',resizeGlobe,{passive:true});
  window.addEventListener('pagehide',()=>{
    if(state.refreshTimer)clearInterval(state.refreshTimer);
    cancelAnimationFrame(state.raf);
  },{once:true});

  loadQuakeCache();
  updateHud();

  window.LOKY_PC4_SEISMIC={
    version:VERSION,
    feed:USGS_FEED,
    state,
    parseFeed,
    project,
    clamp,
    enter:enterSeismic,
    exit:exitSeismic,
    toggle:toggleSeismic,
    refresh:()=>fetchEarthquakes(true),
    resetGlobeView,
    setSphereZoom,
    resetSphereZoom,
  };
})();
