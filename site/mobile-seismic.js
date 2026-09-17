(() => {
  'use strict';

  const VERSION='0.3.2R4F3R2-earth-ultra-quake-info';
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
    globePointers:new Map(),
    globePinchDistance:0,
    globePinchZoom:1,
    spherePointers:new Map(),
    spherePinchDistance:0,
    spherePinchZoom:1,
    tapStart:null,
    tapMoved:false,
    selectedQuake:null,
    hitQuakes:[],
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
        content:""!important;width:19px!important;height:19px!important;border-radius:0!important;background:#c9f5ff!important;box-shadow:none!important;
        -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9' fill='none' stroke='black' stroke-width='2'/%3E%3Cpath d='M3 12h18M12 3c2.7 2.4 4 5.4 4 9s-1.3 6.6-4 9M12 3c-2.7 2.4-4 5.4-4 9s1.3 6.6 4 9M5.5 17h3l1.2-3 2.2 4.6 1.8-5.2 1.2 2.1h3.6' fill='none' stroke='black' stroke-width='1.55' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat!important;
        mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9' fill='none' stroke='black' stroke-width='2'/%3E%3Cpath d='M3 12h18M12 3c2.7 2.4 4 5.4 4 9s-1.3 6.6-4 9M12 3c-2.7 2.4-4 5.4-4 9s1.3 6.6 4 9M5.5 17h3l1.2-3 2.2 4.6 1.8-5.2 1.2 2.1h3.6' fill='none' stroke='black' stroke-width='1.55' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat!important;
        filter:drop-shadow(0 0 7px rgba(102,218,255,.42))!important;
      }
      .future-op-2.feature-seismic::after{content:"";position:absolute;right:4px;top:4px;width:5px;height:5px;border-radius:50%;background:#ff6b57;box-shadow:0 0 7px rgba(255,82,64,.7);opacity:.78}
      .future-op-2.feature-seismic[aria-pressed="true"]{border-color:rgba(255,120,82,.52)!important;box-shadow:0 0 17px rgba(255,83,62,.17),inset 0 1px 0 rgba(255,225,214,.08)!important}
      .loky-seismic-canvas{
        position:absolute;z-index:8;left:50%;top:51%;width:122%;height:122%;max-width:none;max-height:none;
        opacity:0;transform:translate(-50%,-50%) scale(.96);pointer-events:none;touch-action:none;background:transparent;border:0;border-radius:0;box-shadow:none;
        transition:opacity .32s ease,transform .32s cubic-bezier(.22,.75,.25,1);filter:drop-shadow(0 0 34px rgba(45,188,235,.16));
      }
      .loky-seismic-hud{
        position:absolute;z-index:14;left:50%;top:14px;bottom:auto;transform:translateX(-50%) translateY(-7px);
        display:grid;justify-items:center;gap:3px;min-width:210px;max-width:82vw;padding:7px 13px;
        border:1px solid rgba(102,198,231,.18);border-radius:14px;background:rgba(3,15,23,.72);
        backdrop-filter:blur(13px);-webkit-backdrop-filter:blur(13px);opacity:0;pointer-events:none;
        transition:opacity .28s ease,transform .28s ease;box-shadow:0 10px 32px rgba(0,0,0,.16),0 0 22px rgba(59,190,231,.05);
      }
      .loky-seismic-hud strong{font-size:9px;letter-spacing:.16em;color:#d2f7ff;text-shadow:0 0 13px rgba(103,218,255,.20)}
      .loky-seismic-hud span{font-size:8px;color:#82a7b9;letter-spacing:.025em;text-align:center;white-space:nowrap}
      .loky-quake-info{
        position:absolute;z-index:15;left:50%;top:68px;width:min(84vw,390px);padding:10px 38px 10px 13px;border-radius:15px;
        border:1px solid rgba(96,207,242,.22);background:rgba(3,17,27,.88);box-shadow:0 14px 42px rgba(0,0,0,.26),0 0 24px rgba(47,186,232,.07);
        backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);opacity:0;transform:translateX(-50%) translateY(-7px) scale(.98);pointer-events:none;
        transition:opacity .22s ease,transform .22s ease;
      }
      .loky-quake-info.is-visible{opacity:1;transform:translateX(-50%) translateY(0) scale(1);pointer-events:auto}
      .loky-quake-info strong{display:block;font-size:11px;letter-spacing:.11em;color:#d9f8ff;margin-bottom:3px}
      .loky-quake-info .quake-place{display:block;font-size:9px;color:#9ec8d9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px}
      .loky-quake-info .quake-meta{font-size:8px;letter-spacing:.04em;color:#6f9bad;line-height:1.45}
      .loky-quake-info .quake-close{position:absolute;right:8px;top:8px;width:25px;height:25px;border-radius:50%;border:1px solid rgba(111,210,241,.16);background:rgba(12,43,58,.65);color:#a8ddec;font-size:16px;line-height:1;pointer-events:auto}
      .loky-seismic-mode .sphere-wrap{opacity:0;transform:scale(.93)!important;pointer-events:none;transition:opacity .28s ease,transform .32s ease}
      .loky-seismic-mode .loky-seismic-canvas{opacity:1;transform:translate(-50%,-50%) scale(1);pointer-events:auto}
      .loky-seismic-mode .loky-seismic-hud{opacity:1;transform:translateX(-50%) translateY(0)}
      .sphere-wrap{transform-origin:50% 50%;will-change:transform;transition:opacity .28s ease,transform .13s ease-out}
      @media(max-height:760px){.loky-seismic-canvas{width:124%;height:124%}.loky-seismic-hud{top:9px}.loky-quake-info{top:61px}}
      @media(orientation:landscape) and (max-height:600px){.loky-seismic-canvas{width:114%;height:136%}.loky-seismic-hud{top:5px}.loky-quake-info{top:48px;width:min(68vw,440px)}}
      @media(prefers-reduced-motion:reduce){.loky-seismic-canvas,.loky-seismic-hud,.loky-quake-info,.sphere-wrap{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function makeCanvas(){
    if(!stage)return {canvas:null,hud:null,info:null};
    let canvas=document.getElementById('lokySeismicGlobe');
    let hud=document.getElementById('lokySeismicHud');
    let info=document.getElementById('lokyQuakeInfo');
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
    if(!info){
      info=document.createElement('div');
      info.id='lokyQuakeInfo';
      info.className='loky-quake-info';
      info.setAttribute('role','status');
      info.setAttribute('aria-live','polite');
      const title=document.createElement('strong');title.className='quake-title';title.textContent='SISMO';
      const place=document.createElement('span');place.className='quake-place';
      const meta=document.createElement('div');meta.className='quake-meta';
      const close=document.createElement('button');close.type='button';close.className='quake-close';close.setAttribute('aria-label','Cerrar información del sismo');close.textContent='×';
      close.addEventListener('click',()=>selectQuake(null));
      info.appendChild(title);info.appendChild(place);info.appendChild(meta);info.appendChild(close);
      stage.appendChild(info);
    }
    return {canvas,hud,info};
  }

  injectStyles();
  const {canvas:globeCanvas,hud,info:quakeInfo}=makeCanvas();
  const hudDetail=()=>document.getElementById('lokySeismicHudDetail');
  const ctx=globeCanvas?.getContext?.('2d',{alpha:true})||null;

  // Detailed coastlines kept local so Sismos has no extra map dependency.
  const LAND=[
    [[-168,72],[-162,70],[-158,67],[-153,64],[-149,61],[-143,60],[-138,57],[-133,55],[-129,52],[-126,49],[-124,45],[-123,40],[-121,36],[-117,32],[-113,30],[-109,27],[-105,24],[-100,22],[-96,20],[-92,19],[-88,21],[-86,22],[-84,19],[-82,17],[-80,23],[-80,27],[-81,31],[-79,34],[-76,36],[-75,40],[-71,42],[-69,45],[-66,47],[-63,50],[-60,53],[-58,56],[-62,59],[-67,61],[-73,62],[-79,65],[-86,67],[-94,70],[-104,72],[-114,74],[-126,74],[-138,72],[-149,71],[-158,73],[-168,72]],
    [[-75,60],[-69,62],[-61,65],[-54,67],[-48,71],[-43,76],[-46,80],[-55,82],[-65,80],[-71,75],[-74,68],[-75,60]],
    [[-81,12],[-78,9],[-75,7],[-72,5],[-69,1],[-65,-2],[-61,-6],[-58,-11],[-55,-16],[-57,-21],[-59,-26],[-62,-31],[-66,-36],[-69,-42],[-71,-48],[-73,-54],[-76,-50],[-78,-43],[-77,-35],[-75,-27],[-74,-19],[-76,-12],[-78,-5],[-79,2],[-81,12]],
    [[-11,36],[-7,40],[-2,43],[3,44],[7,43],[10,44],[14,45],[18,46],[22,45],[26,46],[30,47],[34,50],[39,53],[44,55],[50,57],[58,59],[66,61],[74,63],[82,65],[92,67],[104,68],[116,66],[128,63],[139,59],[151,55],[160,51],[166,47],[162,43],[156,40],[149,38],[142,36],[136,34],[130,31],[125,27],[121,23],[116,19],[111,16],[107,11],[105,7],[101,4],[97,7],[93,13],[88,20],[83,22],[79,26],[74,28],[70,27],[66,25],[61,25],[57,27],[53,29],[48,30],[44,33],[40,35],[35,37],[30,39],[25,40],[21,39],[17,40],[13,39],[9,38],[5,37],[1,37],[-4,36],[-11,36]],
    [[-18,36],[-13,35],[-8,36],[-3,36],[2,35],[7,34],[12,33],[17,31],[22,29],[27,28],[31,25],[35,22],[39,18],[43,13],[46,8],[49,4],[50,-2],[48,-8],[45,-13],[42,-18],[38,-22],[35,-27],[31,-31],[26,-34],[20,-35],[14,-35],[8,-34],[3,-32],[-2,-29],[-6,-25],[-9,-20],[-11,-14],[-13,-8],[-15,-2],[-16,6],[-17,14],[-17,22],[-18,30],[-18,36]],
    [[113,-11],[118,-14],[122,-18],[126,-22],[130,-25],[134,-27],[138,-31],[142,-34],[147,-37],[151,-35],[153,-30],[153,-24],[151,-19],[147,-16],[141,-14],[136,-12],[130,-11],[124,-11],[118,-11],[113,-11]],
    [[166,-34],[169,-36],[173,-39],[177,-41],[176,-45],[172,-47],[169,-45],[167,-41],[166,-34]],
    [[-9,50],[-6,50],[-4,52],[-5,55],[-4,58],[-7,58],[-9,55],[-9,50]],
    [[-25,63],[-18,64],[-14,66],[-17,67],[-22,66],[-25,63]],
    [[129,31],[132,33],[136,35],[139,37],[141,40],[143,43],[142,46],[139,45],[136,42],[133,39],[131,36],[129,31]],
    [[43,-12],[48,-14],[50,-18],[49,-23],[46,-26],[44,-23],[43,-18],[43,-12]],
    [[79,9],[82,9],[82,6],[80,5],[79,9]],
    [[95,5],[100,5],[104,1],[108,-3],[111,-6],[113,-8],[109,-8],[105,-6],[101,-4],[98,-1],[95,5]],
    [[118,1],[122,2],[125,0],[127,-3],[130,-5],[133,-4],[136,-3],[139,-5],[141,-7],[138,-8],[134,-7],[130,-7],[126,-6],[122,-4],[118,1]],
    [[120,18],[122,17],[123,14],[122,11],[120,10],[119,13],[120,18]],
    [[-85,23],[-81,23],[-78,22],[-75,20],[-78,19],[-82,20],[-85,23]],
    [[-67,18],[-64,19],[-62,17],[-65,16],[-67,18]],
    [[47,-12],[51,-13],[50,-17],[47,-16],[47,-12]],
    [[32,35],[35,35],[35,32],[33,31],[32,35]],
    [[54,25],[57,26],[56,24],[54,25]],
  ];

  const DETAIL_LINES=[
    [[-126,49],[-118,49],[-110,49],[-102,49],[-94,49],[-86,48],[-78,47]],
    [[-117,32],[-110,35],[-104,39],[-99,43],[-95,48],[-90,52]],
    [[-80,8],[-74,3],[-70,-3],[-66,-10],[-63,-17],[-61,-24],[-64,-31],[-68,-38],[-71,-46]],
    [[-7,43],[2,48],[10,50],[18,52],[25,55],[32,58]],
    [[30,47],[36,44],[42,42],[49,43],[56,47],[63,52]],
    [[67,25],[73,30],[80,34],[88,37],[96,40],[104,43],[112,46]],
    [[104,4],[108,9],[112,14],[117,19],[123,24],[130,29]],
    [[-5,36],[2,31],[8,26],[13,20],[18,14],[22,8],[25,1],[27,-7],[28,-15],[27,-23],[24,-31]],
    [[33,31],[37,27],[40,22],[43,16],[45,10],[45,4],[43,-3],[40,-10]],
    [[118,-18],[126,-20],[134,-24],[141,-30],[147,-35]],
  ];

  function pointInPolygon(lon,lat,poly){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
      const hit=((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/((yj-yi)||1e-9)+xi);
      if(hit)inside=!inside;
    }
    return inside;
  }

  function buildLandDots(){
    const dots=[];
    for(let lat=-54;lat<=78;lat+=2.45){
      for(let lon=-177;lon<=177;lon+=2.45){
        let land=false;
        for(const poly of LAND){if(pointInPolygon(lon,lat,poly)){land=true;break;}}
        if(!land)continue;
        const seed=Math.abs(Math.sin((lon+181)*12.9898+(lat+91)*78.233)*43758.5453)%1;
        if(seed>.72)continue;
        dots.push([lon+(seed-.35)*.55,lat+(seed-.35)*.38,seed]);
      }
    }
    return dots;
  }
  const LAND_DOTS=buildLandDots();

  function resizeGlobe(){
    if(!globeCanvas||!ctx)return;
    const rect=globeCanvas.getBoundingClientRect();
    const dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));
    const w=Math.max(1,Math.round(rect.width*dpr));
    const h=Math.max(1,Math.round(rect.height*dpr));
    if(globeCanvas.width!==w||globeCanvas.height!==h){globeCanvas.width=w;globeCanvas.height=h;}
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
    let any=false,pen=false;
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
    const major=Math.max(1,globeCanvas.width/790),minor=Math.max(.55,globeCanvas.width/1300);
    for(let lat=-75;lat<=75;lat+=15){
      const pts=[];for(let lon=-180;lon<=180;lon+=3)pts.push([lon,lat]);
      const isMajor=lat%30===0;ctx.lineWidth=isMajor?major:minor;
      drawPath(pts,radius,cx,cy,isMajor?'rgba(88,194,229,.115)':'rgba(88,194,229,.045)',null);
    }
    for(let lon=-180;lon<180;lon+=15){
      const pts=[];for(let lat=-88;lat<=88;lat+=3)pts.push([lon,lat]);
      const isMajor=lon%30===0;ctx.lineWidth=isMajor?major:minor;
      drawPath(pts,radius,cx,cy,isMajor?'rgba(88,194,229,.11)':'rgba(88,194,229,.042)',null);
    }
  }

  function drawLand(radius,cx,cy,w){
    ctx.lineJoin='round';ctx.lineCap='round';
    for(const land of LAND){
      ctx.lineWidth=Math.max(3,w/300);drawPath(land,radius,cx,cy,'rgba(44,184,225,.07)',null);
      ctx.lineWidth=Math.max(1.05,w/820);drawPath(land,radius,cx,cy,'rgba(130,225,250,.54)','rgba(18,88,118,.10)');
    }
    ctx.lineWidth=Math.max(.7,w/1100);
    for(const line of DETAIL_LINES)drawPath(line,radius,cx,cy,'rgba(105,204,234,.13)',null);

    ctx.save();
    ctx.fillStyle='rgba(102,219,255,.80)';
    ctx.shadowColor='rgba(72,205,255,.48)';ctx.shadowBlur=Math.max(2,w/330);
    const size=Math.max(1.05,w/820);
    for(const dot of LAND_DOTS){
      const p=project(dot[0],dot[1],radius,cx,cy);if(!p)continue;
      const alpha=.28+.60*p.z;
      ctx.globalAlpha=alpha;
      const s=size*(.72+p.z*.62)*(dot[2]>.52?1.18:1);
      ctx.fillRect(p.x-s*.5,p.y-s*.5,s,s);
    }
    ctx.restore();ctx.globalAlpha=1;
  }

  function drawOrbits(radius,cx,cy,now){
    const configs=[[-.48,.36,1.10,.10],[.34,.29,1.16,1.80],[1.04,.42,1.11,3.05],[-1.10,.24,1.20,4.1]];
    for(let i=0;i<configs.length;i++){
      const [angle,ratio,scale,phase]=configs[i];
      ctx.save();ctx.translate(cx,cy);ctx.rotate(angle);
      ctx.beginPath();ctx.ellipse(0,0,radius*scale,radius*ratio,0,0,Math.PI*2);
      ctx.strokeStyle=i===0?'rgba(82,206,248,.18)':'rgba(72,184,229,.11)';ctx.lineWidth=Math.max(.7,globeCanvas.width/1150);ctx.stroke();
      const t=now*.00016*(1+i*.11)+phase;
      const x=Math.cos(t)*radius*scale,y=Math.sin(t)*radius*ratio;
      ctx.beginPath();ctx.arc(x,y,Math.max(1.5,globeCanvas.width/620),0,Math.PI*2);ctx.fillStyle='rgba(102,225,255,.88)';ctx.shadowColor='rgba(66,205,255,.8)';ctx.shadowBlur=8;ctx.fill();
      ctx.restore();
    }
  }

  function markerColor(mag){
    if(mag>=6)return 'rgba(255,72,55,.98)';
    if(mag>=5)return 'rgba(255,115,62,.97)';
    if(mag>=4)return 'rgba(255,178,76,.96)';
    if(mag>=2.5)return 'rgba(255,220,114,.94)';
    return 'rgba(111,220,255,.92)';
  }

  function drawQuakes(radius,cx,cy,now){
    const pulse=(Math.sin(now/420)+1)*.5;
    state.hitQuakes=[];
    for(const quake of state.quakes){
      const p=project(quake.lon,quake.lat,radius,cx,cy);if(!p)continue;
      const mag=Math.max(0,Number(quake.mag)||0);
      const r=(2.2+Math.min(8,mag)*.64)*Math.min(1.45,state.globeZoom*.84+0.35);
      const color=markerColor(mag);
      ctx.save();ctx.shadowColor=color;ctx.shadowBlur=Math.max(4,globeCanvas.width/180);
      ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.restore();
      if(mag>=4.5||state.selectedQuake?.id===quake.id){
        const extra=state.selectedQuake?.id===quake.id?7:4;
        ctx.beginPath();ctx.arc(p.x,p.y,r+extra+pulse*(state.selectedQuake?.id===quake.id?7:4),0,Math.PI*2);
        ctx.strokeStyle=state.selectedQuake?.id===quake.id?'rgba(211,248,255,.78)':color.replace(/\.[0-9]+\)$/,'0.28)');ctx.lineWidth=state.selectedQuake?.id===quake.id?2:1;ctx.stroke();
      }
      state.hitQuakes.push({quake,x:p.x,y:p.y,r:Math.max(r,7)});
    }
  }

  function drawLocation(radius,cx,cy,now){
    if(!state.location)return;
    const p=project(state.location.lon,state.location.lat,radius,cx,cy);if(!p)return;
    const pulse=(Math.sin(now/360)+1)*.5;
    ctx.save();ctx.shadowColor='rgba(87,224,255,.9)';ctx.shadowBlur=10;
    ctx.beginPath();ctx.arc(p.x,p.y,5.2,0,Math.PI*2);ctx.fillStyle='rgba(224,250,255,.99)';ctx.fill();ctx.restore();
    ctx.beginPath();ctx.arc(p.x,p.y,9+pulse*5,0,Math.PI*2);ctx.strokeStyle='rgba(91,224,255,.66)';ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.arc(p.x,p.y,15+pulse*8,0,Math.PI*2);ctx.strokeStyle='rgba(91,224,255,.18)';ctx.lineWidth=1;ctx.stroke();
  }

  function drawGlobe(now=performance.now()){
    if(!ctx||!globeCanvas||!state.active)return;
    resizeGlobe();
    const w=globeCanvas.width,h=globeCanvas.height;
    ctx.clearRect(0,0,w,h);
    const cx=w/2,cy=h*.525;
    const radius=Math.min(w,h)*.382*state.globeZoom;

    drawOrbits(radius,cx,cy,now);

    const atmosphere=ctx.createRadialGradient(cx,cy,radius*.70,cx,cy,radius*1.13);
    atmosphere.addColorStop(0,'rgba(27,174,230,0)');atmosphere.addColorStop(.80,'rgba(39,181,229,.02)');atmosphere.addColorStop(.94,'rgba(54,195,239,.13)');atmosphere.addColorStop(1,'rgba(71,210,255,0)');
    ctx.beginPath();ctx.arc(cx,cy,radius*1.11,0,Math.PI*2);ctx.fillStyle=atmosphere;ctx.fill();

    const ocean=ctx.createRadialGradient(cx-radius*.28,cy-radius*.32,radius*.05,cx,cy,radius*1.02);
    ocean.addColorStop(0,'rgba(29,124,164,.56)');ocean.addColorStop(.40,'rgba(7,53,74,.98)');ocean.addColorStop(.76,'rgba(3,25,39,.995)');ocean.addColorStop(1,'rgba(1,9,15,1)');
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fillStyle=ocean;ctx.fill();

    ctx.save();ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.clip();
    drawGrid(radius,cx,cy);drawLand(radius,cx,cy,w);drawQuakes(radius,cx,cy,now);drawLocation(radius,cx,cy,now);
    const shine=ctx.createRadialGradient(cx-radius*.36,cy-radius*.40,0,cx-radius*.24,cy-radius*.26,radius*.78);
    shine.addColorStop(0,'rgba(100,222,255,.12)');shine.addColorStop(.42,'rgba(57,178,222,.04)');shine.addColorStop(1,'rgba(0,0,0,0)');
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fillStyle=shine;ctx.fill();
    ctx.restore();

    const rim=ctx.createRadialGradient(cx,cy,radius*.82,cx,cy,radius*1.035);
    rim.addColorStop(0,'rgba(61,189,226,0)');rim.addColorStop(.86,'rgba(61,189,226,.025)');rim.addColorStop(1,'rgba(114,226,255,.30)');
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fillStyle=rim;ctx.fill();
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.strokeStyle='rgba(137,232,255,.44)';ctx.lineWidth=Math.max(1.25,w/700);ctx.stroke();
    ctx.beginPath();ctx.arc(cx,cy,radius*.988,0,Math.PI*2);ctx.strokeStyle='rgba(91,204,239,.09)';ctx.lineWidth=Math.max(2.4,w/250);ctx.stroke();

    state.raf=requestAnimationFrame(drawGlobe);
  }

  function parseFeed(data){
    const source=Array.isArray(data?.features)?data.features:[];
    return source.map(feature=>{
      const c=feature?.geometry?.coordinates||[];
      return {id:String(feature?.id||''),lon:Number(c[0]),lat:Number(c[1]),depth:Number(c[2]),mag:Number(feature?.properties?.mag),place:String(feature?.properties?.place||'Sismo'),time:Number(feature?.properties?.time)||0,url:String(feature?.properties?.url||'')};
    }).filter(q=>Number.isFinite(q.lon)&&Number.isFinite(q.lat)&&Number.isFinite(q.mag))
      .sort((a,b)=>b.time-a.time).slice(0,MAX_EVENTS);
  }

  function saveQuakeCache(){try{localStorage.setItem(CACHE_KEY,JSON.stringify({at:Date.now(),quakes:state.quakes}));}catch{}}
  function loadQuakeCache(){
    try{
      const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(!cached||!Array.isArray(cached.quakes))return false;
      state.quakes=cached.quakes.slice(0,MAX_EVENTS);state.fetchedAt=Number(cached.at)||0;state.feedSource='cache';return state.quakes.length>0;
    }catch{return false;}
  }

  function updateHud(){
    const detail=hudDetail();if(!detail)return;
    if(state.loading){detail.textContent='USGS · actualizando sismos…';return;}
    const count=state.quakes.length;
    const location=state.location?' · TU UBICACIÓN':state.locationState==='requesting'?' · UBICANDO…':state.locationState==='denied'?' · UBICACIÓN NO DISPONIBLE':'';
    detail.textContent=`${state.feedSource==='cache'?'DATOS GUARDADOS':'USGS'} · ${count} EVENTOS${location}`;
  }

  function relativeTime(ms){
    const diff=Math.max(0,Date.now()-Number(ms||0));
    const min=Math.floor(diff/60000);if(min<1)return 'AHORA';if(min<60)return `HACE ${min} MIN`;
    const hr=Math.floor(min/60);if(hr<24)return `HACE ${hr} H`;
    return `HACE ${Math.floor(hr/24)} D`;
  }

  function selectQuake(quake){
    state.selectedQuake=quake||null;
    if(!quakeInfo)return;
    if(!quake){quakeInfo.classList.remove('is-visible');return;}
    const title=quakeInfo.querySelector?.('.quake-title');const place=quakeInfo.querySelector?.('.quake-place');const meta=quakeInfo.querySelector?.('.quake-meta');
    if(title)title.textContent=`MAG ${Number(quake.mag).toFixed(1)} · SISMO`;
    if(place)place.textContent=quake.place||'Ubicación no especificada';
    if(meta)meta.textContent=`${relativeTime(quake.time)} · PROFUNDIDAD ${Number.isFinite(quake.depth)?Number(quake.depth).toFixed(1):'—'} KM · ${quake.lat.toFixed(2)}°, ${quake.lon.toFixed(2)}°`;
    quakeInfo.classList.add('is-visible');
  }

  function pickQuake(clientX,clientY){
    if(!globeCanvas||!state.hitQuakes.length)return null;
    const rect=globeCanvas.getBoundingClientRect();
    const sx=globeCanvas.width/Math.max(1,rect.width),sy=globeCanvas.height/Math.max(1,rect.height);
    const x=(clientX-rect.left)*sx,y=(clientY-rect.top)*sy;
    let best=null,bestD=Infinity;
    for(const hit of state.hitQuakes){
      const d=Math.hypot(x-hit.x,y-hit.y);
      const limit=Math.max(hit.r+10*sx,18*sx);
      if(d<limit&&d<bestD){best=hit.quake;bestD=d;}
    }
    selectQuake(best);return best;
  }

  async function fetchEarthquakes(force=false){
    if(state.loading)return state.quakes;
    if(!force&&state.quakes.length&&Date.now()-state.fetchedAt<60*1000)return state.quakes;
    state.loading=true;updateHud();
    try{
      const response=await fetch(USGS_FEED,{cache:'no-store'});if(!response.ok)throw new Error(`USGS_${response.status}`);
      const parsed=parseFeed(await response.json());if(!parsed.length)throw new Error('USGS_EMPTY');
      state.quakes=parsed;state.fetchedAt=Date.now();state.feedSource='usgs';saveQuakeCache();
    }catch(error){if(!state.quakes.length)loadQuakeCache();console.warn('[LOKY Sismos] feed no disponible',error?.message||error);}
    finally{state.loading=false;updateHud();}
    return state.quakes;
  }

  function requestLocation(){
    if(state.location||state.locationState==='requesting'||state.locationState==='denied')return;
    if(!navigator.geolocation){state.locationState='denied';updateHud();return;}
    state.locationState='requesting';updateHud();
    navigator.geolocation.getCurrentPosition(position=>{
      const lat=Number(position?.coords?.latitude),lon=Number(position?.coords?.longitude);
      if(Number.isFinite(lat)&&Number.isFinite(lon)){state.location={lat,lon,accuracy:Number(position?.coords?.accuracy)||0};state.locationState='ready';state.centerLon=lon;state.centerLat=clamp(lat*.42,-58,58);}else state.locationState='denied';
      updateHud();
    },()=>{state.locationState='denied';updateHud();},{enableHighAccuracy:false,timeout:7000,maximumAge:10*60*1000});
  }

  function resetGlobeView(){state.globeZoom=1;if(state.location){state.centerLon=state.location.lon;state.centerLat=clamp(state.location.lat*.42,-58,58);}else{state.centerLon=-18;state.centerLat=10;}}
  function setSphereZoom(value){state.sphereZoom=clamp(value,SPHERE_MIN_ZOOM,SPHERE_MAX_ZOOM);if(sphereWrap)sphereWrap.style.transform=`scale(${state.sphereZoom.toFixed(3)})`;return state.sphereZoom;}
  function resetSphereZoom(){return setSphereZoom(1);}

  function enterSeismic(){
    if(state.active)return;state.active=true;app?.classList.add('loky-seismic-mode');
    if(seismicButton){seismicButton.setAttribute('aria-pressed','true');seismicButton.setAttribute('title','Volver a LOKY');}
    fetchEarthquakes(false);requestLocation();if(state.refreshTimer)clearInterval(state.refreshTimer);state.refreshTimer=setInterval(()=>fetchEarthquakes(true),REFRESH_MS);
    cancelAnimationFrame(state.raf);state.raf=requestAnimationFrame(drawGlobe);window.dispatchEvent(new CustomEvent('loky:seismic-mode',{detail:{active:true}}));
  }

  function exitSeismic(){
    if(!state.active)return;state.active=false;app?.classList.remove('loky-seismic-mode');selectQuake(null);
    if(seismicButton){seismicButton.setAttribute('aria-pressed','false');seismicButton.setAttribute('title','Sismos');}
    if(state.refreshTimer)clearInterval(state.refreshTimer);state.refreshTimer=0;cancelAnimationFrame(state.raf);state.raf=0;state.globePointers.clear();
    window.dispatchEvent(new CustomEvent('loky:seismic-mode',{detail:{active:false}}));
  }
  function toggleSeismic(){state.active?exitSeismic():enterSeismic();}

  function distance(points){const vals=[...points.values()];return vals.length<2?0:Math.hypot(vals[0].x-vals[1].x,vals[0].y-vals[1].y);}

  function attachSphereZoom(){
    if(!sphereCanvas||!sphereWrap)return;
    sphereCanvas.addEventListener('pointerdown',event=>{if(state.active)return;state.spherePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});try{sphereCanvas.setPointerCapture(event.pointerId)}catch{}if(state.spherePointers.size===2){state.spherePinchDistance=distance(state.spherePointers)||1;state.spherePinchZoom=state.sphereZoom;}});
    sphereCanvas.addEventListener('pointermove',event=>{if(state.active||!state.spherePointers.has(event.pointerId))return;state.spherePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(state.spherePointers.size===2){event.preventDefault();const next=distance(state.spherePointers)||state.spherePinchDistance;setSphereZoom(state.spherePinchZoom*(next/Math.max(1,state.spherePinchDistance)));}},{passive:false});
    const end=event=>state.spherePointers.delete(event.pointerId);sphereCanvas.addEventListener('pointerup',end);sphereCanvas.addEventListener('pointercancel',end);sphereCanvas.addEventListener('dblclick',event=>{event.preventDefault();resetSphereZoom();});
  }

  function attachGlobeControls(){
    if(!globeCanvas)return;
    globeCanvas.addEventListener('pointerdown',event=>{
      state.globePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});try{globeCanvas.setPointerCapture(event.pointerId)}catch{}
      if(state.globePointers.size===1){state.dragPointer=event.pointerId;state.tapStart={x:event.clientX,y:event.clientY,id:event.pointerId};state.tapMoved=false;}
      else if(state.globePointers.size===2){state.globePinchDistance=distance(state.globePointers)||1;state.globePinchZoom=state.globeZoom;state.dragPointer=null;state.tapMoved=true;}
    });
    globeCanvas.addEventListener('pointermove',event=>{
      if(!state.globePointers.has(event.pointerId))return;
      const previous=state.globePointers.get(event.pointerId);state.globePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(state.tapStart&&Math.hypot(event.clientX-state.tapStart.x,event.clientY-state.tapStart.y)>8)state.tapMoved=true;
      if(state.globePointers.size===2){event.preventDefault();const next=distance(state.globePointers)||state.globePinchDistance;state.globeZoom=clamp(state.globePinchZoom*(next/Math.max(1,state.globePinchDistance)),GLOBE_MIN_ZOOM,GLOBE_MAX_ZOOM);return;}
      if(state.globePointers.size===1&&state.dragPointer===event.pointerId){event.preventDefault();const dx=event.clientX-(previous?.x??event.clientX),dy=event.clientY-(previous?.y??event.clientY);const rect=globeCanvas.getBoundingClientRect();const base=Math.max(120,Math.min(rect.width,rect.height)*.382*state.globeZoom);state.centerLon-=dx/base*70;state.centerLat=clamp(state.centerLat+dy/base*62,-72,72);while(state.centerLon>180)state.centerLon-=360;while(state.centerLon<-180)state.centerLon+=360;}
    },{passive:false});
    const end=event=>{
      const wasTap=state.tapStart?.id===event.pointerId&&!state.tapMoved&&state.globePointers.size===1;
      state.globePointers.delete(event.pointerId);
      if(wasTap)pickQuake(event.clientX,event.clientY);
      if(state.globePointers.size===1){const [id]=[...state.globePointers.entries()][0];state.dragPointer=id;}else if(!state.globePointers.size)state.dragPointer=null;
      if(state.tapStart?.id===event.pointerId)state.tapStart=null;
    };
    globeCanvas.addEventListener('pointerup',end);globeCanvas.addEventListener('pointercancel',event=>{state.globePointers.delete(event.pointerId);state.dragPointer=null;state.tapStart=null;state.tapMoved=false;});
    globeCanvas.addEventListener('wheel',event=>{if(!state.active)return;event.preventDefault();state.globeZoom=clamp(state.globeZoom*(event.deltaY>0?.92:1.08),GLOBE_MIN_ZOOM,GLOBE_MAX_ZOOM);},{passive:false});
    globeCanvas.addEventListener('dblclick',event=>{event.preventDefault();resetGlobeView();selectQuake(null);});
  }

  if(seismicButton){seismicButton.disabled=false;seismicButton.classList.add('is-action','feature-seismic');seismicButton.setAttribute('aria-label','Sismos');seismicButton.setAttribute('title','Sismos');seismicButton.setAttribute('aria-pressed','false');seismicButton.addEventListener('click',toggleSeismic);}

  attachSphereZoom();attachGlobeControls();window.addEventListener('resize',resizeGlobe,{passive:true});window.addEventListener('pagehide',()=>{if(state.refreshTimer)clearInterval(state.refreshTimer);cancelAnimationFrame(state.raf);},{once:true});
  loadQuakeCache();updateHud();

  window.LOKY_PC4_SEISMIC={version:VERSION,feed:USGS_FEED,state,parseFeed,project,clamp,enter:enterSeismic,exit:exitSeismic,toggle:toggleSeismic,refresh:()=>fetchEarthquakes(true),resetGlobeView,setSphereZoom,resetSphereZoom,selectQuake,pickQuake,landDots:LAND_DOTS.length};
})();
