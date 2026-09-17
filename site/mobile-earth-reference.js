(() => {
  'use strict';

  const VERSION='0.3.2R4F4-earth-reference-rebuild';
  const NE_COMMIT='ca96624a56bd078437bca8184e78163e5039ad19';
  const LAND_URL=`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson/ne_50m_land.geojson`;
  const COUNTRIES_URL=`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson/ne_110m_admin_0_countries.geojson`;
  const DOT_STEP=1.42;
  const MAX_DOTS=9800;
  const FPS=30;

  const seismic=window.LOKY_PC4_SEISMIC;
  const app=document.getElementById('app');
  const stage=document.querySelector('.stage');
  const base=document.getElementById('lokySeismicGlobe');
  if(!seismic||!app||!stage||!base)return;
  const state=seismic.state;

  const canvas=document.createElement('canvas');
  canvas.id='lokyEarthReference';
  canvas.setAttribute('aria-hidden','true');
  stage.appendChild(canvas);
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return;

  const style=document.createElement('style');
  style.id='lokyEarthReferenceStyles';
  style.textContent=`
    #lokyEarthReference{position:absolute;z-index:9;pointer-events:none;touch-action:none;opacity:0;transition:opacity .32s ease;filter:drop-shadow(0 0 34px rgba(31,166,255,.18))}
    .loky-earth-reference-ready.loky-seismic-mode #lokySeismicGlobe{opacity:0!important;pointer-events:auto!important}
    .loky-earth-reference-ready.loky-seismic-mode #lokyContinentDetail{display:none!important}
    .loky-earth-reference-ready.loky-seismic-mode #lokyEarthReference{opacity:1}
    @media(prefers-reduced-motion:reduce){#lokyEarthReference{transition:none!important}}
  `;
  document.head.appendChild(style);

  const geometry={landRings:[],countryRings:[],dots:[],ready:false,error:''};
  let raf=0,lastDraw=0,lastSize='';

  function ringsFromGeometry(geometryObject){
    if(!geometryObject)return [];
    const out=[];
    if(geometryObject.type==='Polygon'){
      if(Array.isArray(geometryObject.coordinates?.[0]))out.push(geometryObject.coordinates[0]);
    }else if(geometryObject.type==='MultiPolygon'){
      for(const polygon of geometryObject.coordinates||[]){if(Array.isArray(polygon?.[0]))out.push(polygon[0]);}
    }
    return out.filter(r=>Array.isArray(r)&&r.length>=4);
  }

  function flattenFeatures(fc){
    const rings=[];
    for(const feature of fc?.features||[])rings.push(...ringsFromGeometry(feature?.geometry));
    return rings;
  }

  function pointInRing(lon,lat,ring){
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const xi=Number(ring[i][0]), yi=Number(ring[i][1]);
      const xj=Number(ring[j][0]), yj=Number(ring[j][1]);
      const hit=((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/((yj-yi)||1e-9)+xi);
      if(hit)inside=!inside;
    }
    return inside;
  }

  function deterministic(lon,lat){
    const x=Math.sin((lon+183.17)*12.9898+(lat+91.73)*78.233)*43758.5453123;
    return x-Math.floor(x);
  }

  function buildDots(rings){
    const seen=new Set(),dots=[];
    for(const ring of rings){
      let minLon=180,maxLon=-180,minLat=90,maxLat=-90;
      for(const point of ring){
        const lon=Number(point[0]),lat=Number(point[1]);
        if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
        minLon=Math.min(minLon,lon);maxLon=Math.max(maxLon,lon);minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);
      }
      if(maxLon-minLon>220)continue;
      minLat=Math.max(-82,minLat);maxLat=Math.min(84,maxLat);
      const lonStart=Math.ceil(minLon/DOT_STEP)*DOT_STEP;
      const latStart=Math.ceil(minLat/DOT_STEP)*DOT_STEP;
      for(let lat=latStart;lat<=maxLat;lat+=DOT_STEP){
        for(let lon=lonStart;lon<=maxLon;lon+=DOT_STEP){
          if(!pointInRing(lon,lat,ring))continue;
          const seed=deterministic(lon,lat);
          const jl=(seed-.5)*.42,jb=(deterministic(lat,lon)-.5)*.30;
          const key=`${Math.round((lon+jl)*10)}:${Math.round((lat+jb)*10)}`;
          if(seen.has(key))continue;
          seen.add(key);
          dots.push([lon+jl,lat+jb,seed]);
          if(dots.length>=MAX_DOTS)return dots;
        }
      }
    }
    return dots;
  }

  async function getJson(url){
    const response=await fetch(url,{cache:'force-cache',mode:'cors'});
    if(!response.ok)throw new Error(`GEO_${response.status}`);
    return response.json();
  }

  async function loadGeometry(){
    try{
      const [land,countries]=await Promise.all([getJson(LAND_URL),getJson(COUNTRIES_URL)]);
      geometry.landRings=flattenFeatures(land);
      geometry.countryRings=flattenFeatures(countries);
      geometry.dots=buildDots(geometry.landRings);
      if(geometry.landRings.length<20||geometry.dots.length<1500)throw new Error('GEO_INCOMPLETE');
      geometry.ready=true;
      app.classList.add('loky-earth-reference-ready');
    }catch(error){
      geometry.error=String(error?.message||error||'GEO_FAIL');
      geometry.ready=false;
      app.classList.remove('loky-earth-reference-ready');
      console.warn('[LOKY Earth Reference] Natural Earth no disponible; se conserva renderer anterior',geometry.error);
    }
  }

  function syncCanvas(){
    const br=base.getBoundingClientRect(),sr=stage.getBoundingClientRect();
    const left=br.left-sr.left,top=br.top-sr.top;
    canvas.style.left=`${left}px`;canvas.style.top=`${top}px`;canvas.style.width=`${br.width}px`;canvas.style.height=`${br.height}px`;
    const dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));
    const w=Math.max(1,Math.round(br.width*dpr)),h=Math.max(1,Math.round(br.height*dpr));
    const sizeKey=`${w}x${h}`;
    if(sizeKey!==lastSize){canvas.width=w;canvas.height=h;lastSize=sizeKey;}
    return {w,h};
  }

  function project(lon,lat,radius,cx,cy){return seismic.project(lon,lat,radius,cx,cy);}

  function drawRing(ring,radius,cx,cy,stroke,width,alphaScale=1){
    let pen=false,visible=false;
    ctx.beginPath();
    for(const point of ring){
      const p=project(point[0],point[1],radius,cx,cy);
      if(!p){pen=false;continue;}
      if(!pen){ctx.moveTo(p.x,p.y);pen=true;}else ctx.lineTo(p.x,p.y);
      visible=true;
    }
    if(!visible)return;
    ctx.save();ctx.strokeStyle=stroke;ctx.globalAlpha=alphaScale;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();ctx.restore();
  }

  function drawOrbits(radius,cx,cy,now){
    const orbits=[[-.58,.34,1.11,.2],[.52,.29,1.16,1.7],[-1.08,.22,1.19,3.2],[1.18,.42,1.08,4.6],[.06,.18,1.22,5.3]];
    for(let i=0;i<orbits.length;i++){
      const [rot,ratio,scale,phase]=orbits[i];
      ctx.save();ctx.translate(cx,cy);ctx.rotate(rot);
      ctx.beginPath();ctx.ellipse(0,0,radius*scale,radius*ratio,0,0,Math.PI*2);
      ctx.strokeStyle=i<2?'rgba(62,169,255,.30)':'rgba(45,127,222,.18)';ctx.lineWidth=Math.max(.7,canvas.width/1200);ctx.stroke();
      const t=now*.00018*(1+i*.08)+phase;
      const nx=Math.cos(t)*radius*scale,ny=Math.sin(t)*radius*ratio;
      ctx.shadowColor='rgba(72,205,255,.95)';ctx.shadowBlur=Math.max(7,canvas.width/95);
      ctx.beginPath();ctx.arc(nx,ny,Math.max(1.4,canvas.width/780),0,Math.PI*2);ctx.fillStyle='rgba(160,239,255,.96)';ctx.fill();
      ctx.restore();
    }
  }

  function drawGrid(radius,cx,cy){
    const minor=Math.max(.45,canvas.width/1500),major=Math.max(.7,canvas.width/1100);
    for(let lat=-60;lat<=60;lat+=20){
      const ring=[];for(let lon=-180;lon<=180;lon+=4)ring.push([lon,lat]);
      drawRing(ring,radius,cx,cy,lat%40===0?'rgba(55,145,220,.13)':'rgba(49,123,194,.07)',lat%40===0?major:minor);
    }
    for(let lon=-180;lon<180;lon+=20){
      const ring=[];for(let lat=-86;lat<=86;lat+=4)ring.push([lon,lat]);
      drawRing(ring,radius,cx,cy,lon%40===0?'rgba(55,145,220,.12)':'rgba(49,123,194,.065)',lon%40===0?major:minor);
    }
  }

  function drawLand(radius,cx,cy){
    ctx.save();
    const baseSize=Math.max(.75,canvas.width/1080);
    for(const dot of geometry.dots){
      const p=project(dot[0],dot[1],radius,cx,cy);if(!p)continue;
      const edge=.28+.72*p.z;
      const twinkle=.82+.18*Math.sin((dot[2]*12.7)+performance.now()*.0011);
      const s=baseSize*(.78+p.z*.82)*(dot[2]>.76?1.32:1);
      ctx.globalAlpha=(.25+.66*edge)*twinkle;
      ctx.fillStyle=dot[2]>.70?'rgba(118,222,255,.98)':'rgba(60,168,242,.92)';
      ctx.fillRect(p.x-s*.5,p.y-s*.5,s,s);
    }
    ctx.restore();ctx.globalAlpha=1;

    const coastGlow=Math.max(2.2,canvas.width/420),coastFine=Math.max(.8,canvas.width/1160);
    for(const ring of geometry.landRings){
      drawRing(ring,radius,cx,cy,'rgba(39,144,235,.09)',coastGlow);
      drawRing(ring,radius,cx,cy,'rgba(112,220,255,.56)',coastFine);
    }
    const border=Math.max(.42,canvas.width/1550);
    for(const ring of geometry.countryRings)drawRing(ring,radius,cx,cy,'rgba(77,171,229,.11)',border,.9);
  }

  function markerColor(mag){
    if(mag>=6)return 'rgba(255,70,54,.99)';
    if(mag>=5)return 'rgba(255,113,61,.98)';
    if(mag>=4)return 'rgba(255,181,76,.98)';
    if(mag>=2.5)return 'rgba(255,223,114,.96)';
    return 'rgba(100,222,255,.95)';
  }

  function drawQuakes(radius,cx,cy,now){
    const pulse=(Math.sin(now/410)+1)*.5;
    for(const quake of state.quakes||[]){
      const p=project(quake.lon,quake.lat,radius,cx,cy);if(!p)continue;
      const mag=Math.max(0,Number(quake.mag)||0),r=(2.2+Math.min(8,mag)*.62)*Math.min(1.45,state.globeZoom*.84+.35);
      const color=markerColor(mag);
      ctx.save();ctx.shadowColor=color;ctx.shadowBlur=Math.max(5,canvas.width/170);
      ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.restore();
      if(mag>=4.5||state.selectedQuake?.id===quake.id){
        const selected=state.selectedQuake?.id===quake.id;
        ctx.beginPath();ctx.arc(p.x,p.y,r+(selected?7:4)+pulse*(selected?7:4),0,Math.PI*2);
        ctx.strokeStyle=selected?'rgba(220,250,255,.90)':'rgba(255,179,95,.36)';ctx.lineWidth=selected?2:1;ctx.stroke();
      }
    }
  }

  function drawLocation(radius,cx,cy,now){
    if(!state.location)return;
    const p=project(state.location.lon,state.location.lat,radius,cx,cy);if(!p)return;
    const pulse=(Math.sin(now/350)+1)*.5;
    ctx.save();ctx.shadowColor='rgba(90,228,255,.95)';ctx.shadowBlur=12;
    ctx.beginPath();ctx.arc(p.x,p.y,4.8,0,Math.PI*2);ctx.fillStyle='rgba(225,252,255,.99)';ctx.fill();ctx.restore();
    ctx.beginPath();ctx.arc(p.x,p.y,10+pulse*5,0,Math.PI*2);ctx.strokeStyle='rgba(96,229,255,.68)';ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.arc(p.x,p.y,16+pulse*8,0,Math.PI*2);ctx.strokeStyle='rgba(96,229,255,.20)';ctx.lineWidth=1;ctx.stroke();
  }

  function render(now){
    if(!geometry.ready||!state.active)return;
    const {w,h}=syncCanvas();
    ctx.clearRect(0,0,w,h);
    const cx=w/2,cy=h*.525,radius=Math.min(w,h)*.382*state.globeZoom;

    drawOrbits(radius,cx,cy,now);

    const halo=ctx.createRadialGradient(cx,cy,radius*.78,cx,cy,radius*1.15);
    halo.addColorStop(0,'rgba(0,93,180,0)');halo.addColorStop(.80,'rgba(24,128,230,.02)');halo.addColorStop(.94,'rgba(30,155,255,.18)');halo.addColorStop(1,'rgba(33,168,255,0)');
    ctx.beginPath();ctx.arc(cx,cy,radius*1.12,0,Math.PI*2);ctx.fillStyle=halo;ctx.fill();

    const ocean=ctx.createRadialGradient(cx-radius*.34,cy-radius*.38,radius*.04,cx,cy,radius*1.04);
    ocean.addColorStop(0,'rgba(12,80,145,.58)');ocean.addColorStop(.38,'rgba(4,35,78,.99)');ocean.addColorStop(.74,'rgba(2,15,42,1)');ocean.addColorStop(1,'rgba(0,5,20,1)');
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fillStyle=ocean;ctx.fill();

    ctx.save();ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.clip();
    drawGrid(radius,cx,cy);drawLand(radius,cx,cy);drawQuakes(radius,cx,cy,now);drawLocation(radius,cx,cy,now);
    const shine=ctx.createRadialGradient(cx-radius*.42,cy-radius*.44,0,cx-radius*.28,cy-radius*.30,radius*.76);
    shine.addColorStop(0,'rgba(99,216,255,.12)');shine.addColorStop(.44,'rgba(35,143,220,.035)');shine.addColorStop(1,'rgba(0,0,0,0)');
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fillStyle=shine;ctx.fill();
    ctx.restore();

    const rim=ctx.createRadialGradient(cx,cy,radius*.82,cx,cy,radius*1.035);
    rim.addColorStop(0,'rgba(62,180,255,0)');rim.addColorStop(.86,'rgba(64,184,255,.025)');rim.addColorStop(1,'rgba(97,217,255,.32)');
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fillStyle=rim;ctx.fill();
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.strokeStyle='rgba(119,225,255,.48)';ctx.lineWidth=Math.max(1.2,w/720);ctx.stroke();
  }

  function frame(now){
    if(state.active&&geometry.ready&&now-lastDraw>=1000/FPS){lastDraw=now;render(now);}
    raf=requestAnimationFrame(frame);
  }

  window.addEventListener('resize',()=>{lastSize='';},{passive:true});
  window.addEventListener('pagehide',()=>{if(raf)cancelAnimationFrame(raf);},{once:true});
  loadGeometry();
  raf=requestAnimationFrame(frame);

  window.LOKY_PC4_EARTH_REFERENCE={
    version:VERSION,
    source:{naturalEarthCommit:NE_COMMIT,land:LAND_URL,countries:COUNTRIES_URL},
    geometry,
    reload:loadGeometry,
  };
})();
