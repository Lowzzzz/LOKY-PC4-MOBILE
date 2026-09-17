(() => {
  'use strict';

  const VERSION='0.3.2R4F4R2-fps-startup-optimization';
  const NE_COMMIT='ca96624a56bd078437bca8184e78163e5039ad19';
  const LAND_URL=`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson/ne_50m_land.geojson`;
  const COUNTRIES_URL=`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson/ne_110m_admin_0_countries.geojson`;
  const DOT_STEP=1.42;
  const MAX_DOTS=9800;
  const ACTIVE_FPS=60;
  const IDLE_FPS=24;
  const DPR_CAP=1.5;
  const FAST_DOT_STRIDE=4;
  const MOTION_TAIL_MS=220;

  const seismic=window.LOKY_PC4_SEISMIC;
  const app=document.getElementById('app');
  const stage=document.querySelector('.stage');
  if(!seismic||!app||!stage)return;
  const state=seismic.state;
  document.getElementById('lokySeismicGlobe')?.remove();

  const canvas=document.createElement('canvas');
  canvas.id='lokyEarthReference';
  canvas.setAttribute('aria-label','Tierra holográfica de sismos');
  stage.appendChild(canvas);
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return;

  const cacheCanvas=document.createElement('canvas');
  const cacheCtx=cacheCanvas.getContext('2d',{alpha:true});
  if(!cacheCtx)return;

  const style=document.createElement('style');
  style.id='lokyEarthReferenceStyles';
  style.textContent=`
    #lokyEarthReference{position:absolute;z-index:9;left:50%;top:51%;width:122%;height:122%;max-width:none;max-height:none;opacity:0;transform:translate(-50%,-50%) scale(.97);pointer-events:none;touch-action:none;background:transparent;border:0;transition:opacity .30s ease,transform .30s cubic-bezier(.22,.75,.25,1);filter:drop-shadow(0 0 34px rgba(31,166,255,.18))}
    .loky-earth-reference-ready.loky-seismic-mode #lokyEarthReference{opacity:1;transform:translate(-50%,-50%) scale(1);pointer-events:auto}
    @media(max-height:760px){#lokyEarthReference{width:124%;height:124%}}
    @media(orientation:landscape) and (max-height:600px){#lokyEarthReference{width:114%;height:136%}}
    @media(prefers-reduced-motion:reduce){#lokyEarthReference{transition:none!important}}
  `;
  document.head.appendChild(style);

  const geometry={landRings:[],countryRings:[],dots:[],ready:false,loading:false,error:''};
  let raf=0,lastDraw=0,lastStatic=0,lastSize='',staticDirty=true,motionUntil=0,wasMoving=false,staticQuality='none';
  const pointers=new Map();
  let dragPointer=null,pinchDistance=0,pinchZoom=1,tapStart=null,tapMoved=false;

  function ringsFromGeometry(g){
    if(!g)return [];
    const out=[];
    if(g.type==='Polygon'){
      if(Array.isArray(g.coordinates?.[0]))out.push(g.coordinates[0]);
    }else if(g.type==='MultiPolygon'){
      for(const p of g.coordinates||[])if(Array.isArray(p?.[0]))out.push(p[0]);
    }
    return out.filter(r=>Array.isArray(r)&&r.length>=4);
  }
  function flattenFeatures(fc){const rings=[];for(const f of fc?.features||[])rings.push(...ringsFromGeometry(f?.geometry));return rings;}
  function pointInRing(lon,lat,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=Number(ring[i][0]),yi=Number(ring[i][1]),xj=Number(ring[j][0]),yj=Number(ring[j][1]);const hit=((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/((yj-yi)||1e-9)+xi);if(hit)inside=!inside;}return inside;}
  function deterministic(lon,lat){const x=Math.sin((lon+183.17)*12.9898+(lat+91.73)*78.233)*43758.5453123;return x-Math.floor(x);}
  function yieldMain(){return new Promise(resolve=>setTimeout(resolve,0));}

  async function buildDotsAsync(rings){
    const seen=new Set(),dots=[];
    let sliceStart=performance.now(),rowCount=0;
    for(const ring of rings){
      let minLon=180,maxLon=-180,minLat=90,maxLat=-90;
      for(const p of ring){const lon=Number(p[0]),lat=Number(p[1]);if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;minLon=Math.min(minLon,lon);maxLon=Math.max(maxLon,lon);minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);}
      if(maxLon-minLon>220)continue;
      minLat=Math.max(-82,minLat);maxLat=Math.min(84,maxLat);
      const lonStart=Math.ceil(minLon/DOT_STEP)*DOT_STEP,latStart=Math.ceil(minLat/DOT_STEP)*DOT_STEP;
      for(let lat=latStart;lat<=maxLat;lat+=DOT_STEP){
        for(let lon=lonStart;lon<=maxLon;lon+=DOT_STEP){
          if(!pointInRing(lon,lat,ring))continue;
          const seed=deterministic(lon,lat),jl=(seed-.5)*.42,jb=(deterministic(lat,lon)-.5)*.30,key=`${Math.round((lon+jl)*10)}:${Math.round((lat+jb)*10)}`;
          if(seen.has(key))continue;
          seen.add(key);dots.push([lon+jl,lat+jb,seed]);
          if(dots.length>=MAX_DOTS)return dots;
        }
        rowCount++;
        if((rowCount&7)===0&&performance.now()-sliceStart>7){await yieldMain();sliceStart=performance.now();}
      }
      if(performance.now()-sliceStart>7){await yieldMain();sliceStart=performance.now();}
    }
    return dots;
  }

  async function getJson(url){const r=await fetch(url,{cache:'force-cache',mode:'cors'});if(!r.ok)throw new Error(`GEO_${r.status}`);return r.json();}
  async function loadGeometry(force=false){
    if(geometry.ready&&!force)return geometry;
    if(geometry.loading)return geometry;
    geometry.loading=true;geometry.error='';
    try{
      const [land,countries]=await Promise.all([getJson(LAND_URL),getJson(COUNTRIES_URL)]);
      geometry.landRings=flattenFeatures(land);
      geometry.countryRings=flattenFeatures(countries);
      await yieldMain();
      geometry.dots=await buildDotsAsync(geometry.landRings);
      if(geometry.landRings.length<20||geometry.dots.length<1500)throw new Error('GEO_INCOMPLETE');
      geometry.ready=true;geometry.loading=false;staticDirty=true;staticQuality='none';app.classList.add('loky-earth-reference-ready');
      if(state.active){motionUntil=performance.now()+MOTION_TAIL_MS;startLoop();}
    }catch(error){
      geometry.error=String(error?.message||error||'GEO_FAIL');geometry.ready=false;geometry.loading=false;app.classList.remove('loky-earth-reference-ready');console.warn('[LOKY Earth] Natural Earth no disponible',geometry.error);
    }
    return geometry;
  }

  function syncCanvas(){
    const r=canvas.getBoundingClientRect();
    const dpr=Math.min(DPR_CAP,Math.max(1,window.devicePixelRatio||1));
    const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr)),key=`${w}x${h}`;
    if(key!==lastSize){canvas.width=w;canvas.height=h;cacheCanvas.width=w;cacheCanvas.height=h;lastSize=key;staticDirty=true;staticQuality='none';}
    return {w,h};
  }
  function project(lon,lat,radius,cx,cy){return seismic.project(lon,lat,radius,cx,cy);}
  function drawRing(target,ring,radius,cx,cy,stroke,width,alpha=1,step=1){
    let pen=false,visible=false;target.beginPath();
    const stride=Math.max(1,step|0);
    for(let i=0;i<ring.length;i+=stride){const pnt=ring[i],p=project(pnt[0],pnt[1],radius,cx,cy);if(!p){pen=false;continue;}if(!pen){target.moveTo(p.x,p.y);pen=true;}else target.lineTo(p.x,p.y);visible=true;}
    if(!visible)return;
    target.save();target.strokeStyle=stroke;target.globalAlpha=alpha;target.lineWidth=width;target.lineJoin='round';target.lineCap='round';target.stroke();target.restore();
  }

  function drawGrid(target,radius,cx,cy,w,fast=false){
    const minor=Math.max(.42,w/1550),major=Math.max(.68,w/1120),spacing=fast?40:20,sample=fast?8:4;
    for(let lat=-60;lat<=60;lat+=spacing){const ring=[];for(let lon=-180;lon<=180;lon+=sample)ring.push([lon,lat]);drawRing(target,ring,radius,cx,cy,'rgba(55,145,220,.12)',major);}
    for(let lon=-160;lon<=160;lon+=spacing){const ring=[];for(let lat=-84;lat<=84;lat+=sample)ring.push([lon,lat]);drawRing(target,ring,radius,cx,cy,'rgba(49,123,194,.07)',fast?major:minor);}
  }
  function drawLand(target,radius,cx,cy,w,fast=false){
    target.save();
    const baseSize=Math.max(.75,w/1080),stride=fast?FAST_DOT_STRIDE:1;
    if(!fast){target.shadowColor='rgba(65,195,255,.26)';target.shadowBlur=Math.max(1.5,w/700);}
    for(let i=0;i<geometry.dots.length;i+=stride){const dot=geometry.dots[i],p=project(dot[0],dot[1],radius,cx,cy);if(!p)continue;const s=baseSize*(.78+p.z*.82)*(dot[2]>.76?1.30:1);target.globalAlpha=.24+.66*p.z;target.fillStyle=dot[2]>.70?'rgba(118,222,255,.98)':'rgba(60,168,242,.92)';target.fillRect(p.x-s*.5,p.y-s*.5,s,s);}
    target.restore();target.globalAlpha=1;
    const glow=Math.max(2.1,w/430),fine=Math.max(.78,w/1180),coastStep=fast?4:1;
    for(const ring of geometry.landRings){if(!fast)drawRing(target,ring,radius,cx,cy,'rgba(39,144,235,.085)',glow,1,coastStep);drawRing(target,ring,radius,cx,cy,'rgba(112,220,255,.58)',fine,1,coastStep);}
    if(!fast){const border=Math.max(.4,w/1600);for(const ring of geometry.countryRings)drawRing(target,ring,radius,cx,cy,'rgba(77,171,229,.11)',border,.9,1);}
  }
  function rebuildStatic(now,w,h,fast=false){
    lastStatic=now;staticDirty=false;staticQuality=fast?'motion':'full';cacheCtx.clearRect(0,0,w,h);
    const cx=w/2,cy=h*.525,radius=Math.min(w,h)*.382*state.globeZoom;
    const halo=cacheCtx.createRadialGradient(cx,cy,radius*.78,cx,cy,radius*1.15);halo.addColorStop(0,'rgba(0,93,180,0)');halo.addColorStop(.80,'rgba(24,128,230,.02)');halo.addColorStop(.94,'rgba(30,155,255,.18)');halo.addColorStop(1,'rgba(33,168,255,0)');cacheCtx.beginPath();cacheCtx.arc(cx,cy,radius*1.12,0,Math.PI*2);cacheCtx.fillStyle=halo;cacheCtx.fill();
    const ocean=cacheCtx.createRadialGradient(cx-radius*.34,cy-radius*.38,radius*.04,cx,cy,radius*1.04);ocean.addColorStop(0,'rgba(12,80,145,.58)');ocean.addColorStop(.38,'rgba(4,35,78,.99)');ocean.addColorStop(.74,'rgba(2,15,42,1)');ocean.addColorStop(1,'rgba(0,5,20,1)');cacheCtx.beginPath();cacheCtx.arc(cx,cy,radius,0,Math.PI*2);cacheCtx.fillStyle=ocean;cacheCtx.fill();
    cacheCtx.save();cacheCtx.beginPath();cacheCtx.arc(cx,cy,radius,0,Math.PI*2);cacheCtx.clip();drawGrid(cacheCtx,radius,cx,cy,w,fast);drawLand(cacheCtx,radius,cx,cy,w,fast);const shine=cacheCtx.createRadialGradient(cx-radius*.42,cy-radius*.44,0,cx-radius*.28,cy-radius*.30,radius*.76);shine.addColorStop(0,'rgba(99,216,255,.12)');shine.addColorStop(.44,'rgba(35,143,220,.035)');shine.addColorStop(1,'rgba(0,0,0,0)');cacheCtx.beginPath();cacheCtx.arc(cx,cy,radius,0,Math.PI*2);cacheCtx.fillStyle=shine;cacheCtx.fill();cacheCtx.restore();
    const rim=cacheCtx.createRadialGradient(cx,cy,radius*.82,cx,cy,radius*1.035);rim.addColorStop(0,'rgba(62,180,255,0)');rim.addColorStop(.86,'rgba(64,184,255,.025)');rim.addColorStop(1,'rgba(97,217,255,.32)');cacheCtx.beginPath();cacheCtx.arc(cx,cy,radius,0,Math.PI*2);cacheCtx.fillStyle=rim;cacheCtx.fill();cacheCtx.beginPath();cacheCtx.arc(cx,cy,radius,0,Math.PI*2);cacheCtx.strokeStyle='rgba(119,225,255,.48)';cacheCtx.lineWidth=Math.max(1.2,w/720);cacheCtx.stroke();
  }

  function drawOrbits(target,radius,cx,cy,now,w){const orbits=[[-.58,.34,1.11,.2],[.52,.29,1.16,1.7],[-1.08,.22,1.19,3.2],[1.18,.42,1.08,4.6],[.06,.18,1.22,5.3]];for(let i=0;i<orbits.length;i++){const [rot,ratio,scale,phase]=orbits[i];target.save();target.translate(cx,cy);target.rotate(rot);target.beginPath();target.ellipse(0,0,radius*scale,radius*ratio,0,0,Math.PI*2);target.strokeStyle=i<2?'rgba(62,169,255,.30)':'rgba(45,127,222,.18)';target.lineWidth=Math.max(.7,w/1200);target.stroke();const t=now*.00018*(1+i*.08)+phase,nx=Math.cos(t)*radius*scale,ny=Math.sin(t)*radius*ratio;target.shadowColor='rgba(72,205,255,.95)';target.shadowBlur=Math.max(7,w/95);target.beginPath();target.arc(nx,ny,Math.max(1.4,w/780),0,Math.PI*2);target.fillStyle='rgba(160,239,255,.96)';target.fill();target.restore();}}
  function markerColor(m){if(m>=6)return 'rgba(255,70,54,.99)';if(m>=5)return 'rgba(255,113,61,.98)';if(m>=4)return 'rgba(255,181,76,.98)';if(m>=2.5)return 'rgba(255,223,114,.96)';return 'rgba(100,222,255,.95)';}
  function drawQuakes(target,radius,cx,cy,now,w){const pulse=(Math.sin(now/410)+1)*.5;state.hitQuakes=[];for(const quake of state.quakes||[]){const p=project(quake.lon,quake.lat,radius,cx,cy);if(!p)continue;const mag=Math.max(0,Number(quake.mag)||0),r=(2.2+Math.min(8,mag)*.62)*Math.min(1.45,state.globeZoom*.84+.35),color=markerColor(mag);target.save();target.shadowColor=color;target.shadowBlur=Math.max(5,w/170);target.beginPath();target.arc(p.x,p.y,r,0,Math.PI*2);target.fillStyle=color;target.fill();target.restore();const selected=state.selectedQuake?.id===quake.id;if(mag>=4.5||selected){target.beginPath();target.arc(p.x,p.y,r+(selected?7:4)+pulse*(selected?7:4),0,Math.PI*2);target.strokeStyle=selected?'rgba(220,250,255,.90)':'rgba(255,179,95,.36)';target.lineWidth=selected?2:1;target.stroke();}state.hitQuakes.push({quake,x:p.x,y:p.y,r:Math.max(r,7)});}}
  function drawLocation(target,radius,cx,cy,now){if(!state.location)return;const p=project(state.location.lon,state.location.lat,radius,cx,cy);if(!p)return;const pulse=(Math.sin(now/350)+1)*.5;target.save();target.shadowColor='rgba(90,228,255,.95)';target.shadowBlur=12;target.beginPath();target.arc(p.x,p.y,4.8,0,Math.PI*2);target.fillStyle='rgba(225,252,255,.99)';target.fill();target.restore();target.beginPath();target.arc(p.x,p.y,10+pulse*5,0,Math.PI*2);target.strokeStyle='rgba(96,229,255,.68)';target.lineWidth=2;target.stroke();target.beginPath();target.arc(p.x,p.y,16+pulse*8,0,Math.PI*2);target.strokeStyle='rgba(96,229,255,.20)';target.lineWidth=1;target.stroke();}

  function render(now,moving){
    const {w,h}=syncCanvas();
    if(staticDirty&&now-lastStatic>=(moving?12:24))rebuildStatic(now,w,h,moving);
    const cx=w/2,cy=h*.525,radius=Math.min(w,h)*.382*state.globeZoom;
    ctx.clearRect(0,0,w,h);drawOrbits(ctx,radius,cx,cy,now,w);ctx.drawImage(cacheCanvas,0,0);drawQuakes(ctx,radius,cx,cy,now,w);drawLocation(ctx,radius,cx,cy,now);
  }
  function frame(now){
    if(!state.active||!geometry.ready){raf=0;return;}
    const moving=now<motionUntil;
    if(wasMoving&&!moving){staticDirty=true;staticQuality='none';}
    wasMoving=moving;
    const fps=moving?ACTIVE_FPS:IDLE_FPS;
    if(now-lastDraw>=1000/fps){lastDraw=now;render(now,moving);}
    raf=requestAnimationFrame(frame);
  }
  function startLoop(){if(!state.active||!geometry.ready||raf)return;lastDraw=0;raf=requestAnimationFrame(frame);}
  function stopLoop(){if(raf)cancelAnimationFrame(raf);raf=0;pointers.clear();dragPointer=null;tapStart=null;tapMoved=false;wasMoving=false;}
  function markViewMotion(){staticDirty=true;motionUntil=performance.now()+MOTION_TAIL_MS;startLoop();}
  function distance(){const v=[...pointers.values()];return v.length<2?0:Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y);}
  function pickQuake(clientX,clientY){if(!state.hitQuakes?.length)return null;const rect=canvas.getBoundingClientRect(),sx=canvas.width/Math.max(1,rect.width),sy=canvas.height/Math.max(1,rect.height),x=(clientX-rect.left)*sx,y=(clientY-rect.top)*sy;let best=null,bestD=Infinity;for(const hit of state.hitQuakes){const d=Math.hypot(x-hit.x,y-hit.y),limit=Math.max(hit.r+10*sx,18*sx);if(d<limit&&d<bestD){best=hit.quake;bestD=d;}}seismic.selectQuake(best);return best;}

  canvas.addEventListener('pointerdown',event=>{if(!state.active)return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});try{canvas.setPointerCapture(event.pointerId)}catch{}if(pointers.size===1){dragPointer=event.pointerId;tapStart={x:event.clientX,y:event.clientY,id:event.pointerId};tapMoved=false;}else if(pointers.size===2){pinchDistance=distance()||1;pinchZoom=state.globeZoom;dragPointer=null;tapMoved=true;}motionUntil=performance.now()+MOTION_TAIL_MS;});
  canvas.addEventListener('pointermove',event=>{if(!pointers.has(event.pointerId))return;const prev=pointers.get(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(tapStart&&Math.hypot(event.clientX-tapStart.x,event.clientY-tapStart.y)>8)tapMoved=true;if(pointers.size===2){event.preventDefault();const next=distance()||pinchDistance;state.globeZoom=seismic.clamp(pinchZoom*(next/Math.max(1,pinchDistance)),seismic.bounds.globeMin,seismic.bounds.globeMax);markViewMotion();return;}if(pointers.size===1&&dragPointer===event.pointerId){event.preventDefault();const dx=event.clientX-(prev?.x??event.clientX),dy=event.clientY-(prev?.y??event.clientY),rect=canvas.getBoundingClientRect(),base=Math.max(120,Math.min(rect.width,rect.height)*.382*state.globeZoom);state.centerLon-=dx/base*70;state.centerLat=seismic.clamp(state.centerLat+dy/base*62,-72,72);while(state.centerLon>180)state.centerLon-=360;while(state.centerLon<-180)state.centerLon+=360;markViewMotion();}},{passive:false});
  const endPointer=event=>{const wasTap=tapStart?.id===event.pointerId&&!tapMoved&&pointers.size===1;pointers.delete(event.pointerId);if(wasTap)pickQuake(event.clientX,event.clientY);if(pointers.size===1)dragPointer=[...pointers.keys()][0];else if(!pointers.size)dragPointer=null;if(tapStart?.id===event.pointerId)tapStart=null;if(!pointers.size){motionUntil=performance.now()+80;staticDirty=true;}};
  canvas.addEventListener('pointerup',endPointer);
  canvas.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);dragPointer=null;tapStart=null;tapMoved=false;motionUntil=performance.now()+80;staticDirty=true;});
  canvas.addEventListener('wheel',event=>{if(!state.active)return;event.preventDefault();state.globeZoom=seismic.clamp(state.globeZoom*(event.deltaY>0?.92:1.08),seismic.bounds.globeMin,seismic.bounds.globeMax);markViewMotion();},{passive:false});
  canvas.addEventListener('dblclick',event=>{event.preventDefault();seismic.resetGlobeView();seismic.selectQuake(null);markViewMotion();});

  window.addEventListener('loky:seismic-mode',event=>{
    if(event.detail?.active){
      staticDirty=true;staticQuality='none';
      if(geometry.ready){motionUntil=performance.now()+MOTION_TAIL_MS;startLoop();}
      else loadGeometry();
    }else stopLoop();
  });
  window.addEventListener('loky:seismic-view',()=>{markViewMotion();});
  window.addEventListener('loky:seismic-data',()=>{motionUntil=performance.now()+180;startLoop();});
  window.addEventListener('resize',()=>{lastSize='';staticDirty=true;staticQuality='none';if(state.active)startLoop();},{passive:true});
  window.addEventListener('pagehide',stopLoop,{once:true});

  window.LOKY_PC4_EARTH_REFERENCE={
    version:VERSION,
    source:{naturalEarthCommit:NE_COMMIT,land:LAND_URL,countries:COUNTRIES_URL},
    geometry,
    reload:()=>loadGeometry(true),
    stats:()=>({dots:geometry.dots.length,landRings:geometry.landRings.length,countryRings:geometry.countryRings.length,ready:geometry.ready,loading:geometry.loading,active:state.active,raf:Boolean(raf),fpsIdle:IDLE_FPS,fpsMoving:ACTIVE_FPS,dprCap:DPR_CAP,staticQuality})
  };
})();
