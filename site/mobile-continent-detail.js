(() => {
  'use strict';

  const VERSION='0.3.2R4F3R3-continent-detail';
  const seismic=window.LOKY_PC4_SEISMIC;
  const stage=document.querySelector('.stage');
  const globe=document.getElementById('lokySeismicGlobe');
  if(!seismic||!stage||!globe)return;

  const state=seismic.state;
  const overlay=document.createElement('canvas');
  overlay.id='lokyContinentDetail';
  overlay.setAttribute('aria-hidden','true');
  Object.assign(overlay.style,{
    position:'absolute',zIndex:'9',pointerEvents:'none',touchAction:'none',opacity:'0',
    transition:'opacity .28s ease',filter:'drop-shadow(0 0 8px rgba(72,210,255,.08))'
  });
  stage.appendChild(overlay);
  const ctx=overlay.getContext('2d',{alpha:true});
  if(!ctx)return;

  // Coastlines are deliberately local/offline: they add geographical fidelity without
  // introducing a map SDK, network dependency, microphone, WebSocket or conversation state.
  const COASTS={
    NORTH_AMERICA:[
      [-168,72],[-166,69],[-163,66],[-166,64],[-161,61],[-158,58],[-153,58],[-149,60],[-145,60],[-141,59],[-137,57],[-134,55],[-131,54],[-129,51],[-127,50],[-126,48],[-124,47],[-124,44],[-123,42],[-122,39],[-121,37],[-118,34],[-117,32],[-114,32],[-112,29],[-111,27],[-109,25],[-106,23],[-103,20],[-100,19],[-97,20],[-95,22],[-93,22],[-91,20],[-89,21],[-87,21],[-86,23],[-84,24],[-83,26],[-82,27],[-81,26],[-80,25],[-80,28],[-81,30],[-80,32],[-79,34],[-77,35],[-76,37],[-75,39],[-74,40],[-73,41],[-71,42],[-70,43],[-68,44],[-67,46],[-65,47],[-64,49],[-62,50],[-60,52],[-58,54],[-59,56],[-61,58],[-64,59],[-67,60],[-70,61],[-72,63],[-76,64],[-80,66],[-85,67],[-89,69],[-95,69],[-101,72],[-108,73],[-115,74],[-123,73],[-130,72],[-138,70],[-145,70],[-151,71],[-157,72],[-162,72],[-168,72]
    ],
    CENTRAL_AMERICA:[
      [-92,19],[-90,18],[-88,18],[-87,16],[-86,15],[-85,15],[-84,14],[-83,12],[-82,10],[-80,9],[-79,8],[-78,8],[-77,9],[-78,10],[-80,11],[-82,12],[-84,15],[-86,16],[-88,17],[-90,20],[-92,19]
    ],
    SOUTH_AMERICA:[
      [-81,12],[-79,10],[-78,8],[-77,6],[-78,3],[-80,1],[-79,-2],[-78,-5],[-77,-8],[-76,-11],[-75,-14],[-74,-17],[-73,-20],[-71,-23],[-70,-27],[-70,-31],[-71,-34],[-72,-38],[-73,-42],[-74,-46],[-75,-50],[-73,-53],[-70,-54],[-68,-52],[-66,-50],[-64,-47],[-62,-44],[-60,-41],[-58,-38],[-57,-35],[-55,-32],[-53,-29],[-50,-27],[-48,-25],[-46,-23],[-44,-20],[-42,-17],[-40,-14],[-38,-11],[-37,-8],[-35,-6],[-35,-3],[-38,-1],[-41,1],[-44,2],[-48,1],[-51,2],[-54,4],[-57,5],[-60,6],[-63,8],[-66,10],[-69,11],[-72,11],[-75,10],[-78,11],[-81,12]
    ],
    GREENLAND:[
      [-73,60],[-69,61],[-64,63],[-59,65],[-54,67],[-50,70],[-45,73],[-42,76],[-44,79],[-49,81],[-55,82],[-61,81],[-66,79],[-69,76],[-71,72],[-73,68],[-74,64],[-73,60]
    ],
    EUROPE:[
      [-10,36],[-9,39],[-9,42],[-7,44],[-5,46],[-3,47],[-1,49],[2,50],[4,52],[5,55],[8,57],[10,59],[12,61],[15,63],[18,65],[22,67],[27,69],[31,70],[34,68],[31,65],[29,62],[27,60],[25,58],[23,56],[22,54],[24,52],[26,50],[29,48],[31,46],[30,44],[27,43],[24,42],[21,41],[18,42],[16,43],[14,44],[12,43],[10,44],[8,44],[6,43],[4,43],[2,43],[0,42],[-2,43],[-4,43],[-6,42],[-8,41],[-10,39],[-10,36]
    ],
    SCANDINAVIA:[
      [5,58],[7,61],[9,64],[12,67],[15,69],[18,71],[22,71],[25,70],[27,68],[25,66],[23,64],[21,62],[19,60],[17,58],[14,57],[11,58],[8,57],[5,58]
    ],
    AFRICA:[
      [-18,36],[-14,35],[-10,35],[-6,36],[-2,36],[2,35],[6,34],[10,33],[14,32],[18,30],[22,28],[26,27],[30,25],[33,23],[36,20],[40,16],[43,12],[46,8],[49,4],[50,0],[49,-5],[47,-10],[44,-15],[41,-19],[38,-23],[35,-27],[32,-30],[29,-33],[25,-35],[20,-35],[15,-35],[10,-34],[6,-33],[2,-31],[-2,-29],[-5,-26],[-8,-22],[-10,-18],[-12,-13],[-14,-8],[-15,-3],[-16,2],[-16,8],[-17,14],[-17,20],[-17,26],[-16,31],[-18,36]
    ],
    ASIA_NORTH:[
      [31,46],[35,49],[40,52],[45,55],[50,57],[56,59],[62,61],[68,63],[74,65],[80,67],[86,68],[92,69],[99,69],[106,68],[113,67],[120,65],[127,63],[134,60],[141,57],[148,54],[154,51],[160,49],[165,47],[169,44],[166,41],[162,39],[158,38],[154,37],[150,37],[146,38],[142,39],[138,41],[134,42],[130,43],[126,42],[123,40],[120,38],[117,36],[114,34],[111,32],[108,31],[105,30],[102,29],[99,29],[96,28],[92,27],[88,26],[84,25],[80,25],[76,26],[72,27],[68,27],[64,27],[60,29],[56,30],[52,31],[48,33],[44,35],[41,38],[38,40],[35,43],[31,46]
    ],
    ARABIA:[
      [34,31],[38,31],[42,29],[46,27],[50,25],[54,24],[56,21],[55,17],[53,14],[50,12],[47,13],[44,16],[42,19],[40,22],[37,25],[35,28],[34,31]
    ],
    INDIA:[
      [68,24],[71,23],[74,22],[77,20],[79,18],[81,16],[82,13],[81,10],[79,8],[77,9],[75,12],[73,15],[71,18],[69,21],[68,24]
    ],
    SE_ASIA:[
      [93,21],[96,19],[99,17],[101,14],[103,11],[105,8],[105,5],[103,3],[101,1],[100,-2],[103,-4],[106,-5],[109,-6],[112,-8],[114,-8],[112,-5],[110,-2],[109,1],[108,4],[108,7],[110,10],[112,13],[115,16],[118,18],[120,20],[118,22],[115,21],[112,19],[108,18],[104,18],[100,19],[96,21],[93,21]
    ],
    CHINA_KOREA:[
      [104,30],[108,31],[112,32],[116,34],[120,36],[122,39],[124,41],[126,42],[129,41],[130,38],[128,36],[126,34],[124,31],[122,28],[119,25],[116,23],[113,22],[110,24],[107,27],[104,30]
    ],
    AUSTRALIA:[
      [113,-11],[116,-13],[119,-15],[121,-18],[123,-20],[125,-22],[128,-24],[131,-25],[134,-27],[137,-29],[140,-32],[143,-34],[146,-37],[149,-38],[151,-36],[153,-32],[153,-28],[152,-24],[151,-20],[149,-17],[146,-15],[142,-13],[138,-12],[134,-11],[130,-11],[126,-12],[122,-11],[118,-11],[113,-11]
    ],
    ANTARCTICA:[
      [-180,-70],[-165,-72],[-150,-74],[-135,-73],[-120,-75],[-105,-76],[-90,-74],[-75,-76],[-60,-75],[-45,-73],[-30,-72],[-15,-71],[0,-72],[15,-73],[30,-72],[45,-74],[60,-73],[75,-75],[90,-74],[105,-72],[120,-73],[135,-71],[150,-72],[165,-70],[180,-70]
    ]
  };

  const ISLANDS=[
    [[-10,51],[-8,52],[-7,54],[-8,55],[-10,54],[-11,52],[-10,51]],
    [[-6,50],[-4,51],[-3,53],[-4,55],[-3,57],[-5,59],[-6,57],[-6,55],[-6,53],[-6,50]],
    [[-25,63],[-21,64],[-18,65],[-16,66],[-19,67],[-23,66],[-25,65],[-25,63]],
    [[-85,23],[-82,23],[-79,22],[-76,21],[-74,20],[-77,19],[-80,20],[-83,21],[-85,23]],
    [[-74,19],[-71,19],[-69,18],[-70,17],[-73,17],[-74,19]],
    [[-67,18],[-65,19],[-64,18],[-65,17],[-67,18]],
    [[-61,16],[-60,15],[-61,14],[-62,15],[-61,16]],
    [[130,31],[132,33],[134,35],[136,36],[138,38],[140,40],[141,42],[142,44],[141,46],[139,45],[137,43],[135,40],[133,37],[131,34],[130,31]],
    [[125,38],[127,39],[129,40],[130,42],[128,43],[126,41],[125,38]],
    [[120,18],[122,17],[123,15],[122,13],[121,11],[120,10],[119,13],[120,18]],
    [[121,25],[122,24],[122,22],[121,21],[120,23],[121,25]],
    [[95,5],[98,5],[100,3],[101,1],[103,-1],[104,-3],[102,-4],[100,-2],[98,0],[96,2],[95,5]],
    [[105,-6],[108,-6],[111,-7],[114,-8],[112,-9],[109,-8],[106,-8],[105,-6]],
    [[118,-2],[120,-1],[122,0],[124,-1],[126,-3],[124,-5],[121,-4],[119,-3],[118,-2]],
    [[129,-1],[132,-2],[134,-4],[136,-5],[138,-4],[136,-2],[133,-1],[129,-1]],
    [[43,-12],[46,-13],[48,-16],[49,-19],[48,-23],[46,-25],[44,-23],[43,-19],[43,-15],[43,-12]],
    [[80,10],[82,9],[82,7],[81,6],[80,7],[80,10]],
    [[166,-34],[169,-36],[172,-39],[175,-41],[177,-44],[175,-46],[172,-45],[170,-42],[168,-39],[166,-34]],
    [[173,-35],[176,-37],[178,-40],[177,-42],[175,-40],[173,-37],[173,-35]]
  ];

  const REGIONAL_LINES=[
    [[-124,49],[-116,50],[-108,50],[-100,49],[-92,49],[-84,48],[-76,47]],
    [[-111,31],[-106,34],[-103,38],[-101,42],[-99,47],[-96,51]],
    [[-80,9],[-75,5],[-72,0],[-70,-6],[-68,-12],[-67,-18],[-68,-24],[-69,-31],[-70,-38],[-71,-45]],
    [[-4,43],[2,47],[8,49],[14,50],[20,52],[26,55]],
    [[12,43],[17,46],[22,48],[27,50],[31,53]],
    [[28,31],[31,28],[34,24],[36,20],[38,16],[40,12]],
    [[0,5],[6,8],[12,10],[18,9],[24,7],[30,5],[36,3],[42,1]],
    [[68,28],[75,31],[82,34],[90,37],[98,40],[106,43],[114,46]],
    [[82,22],[88,24],[94,25],[100,26],[106,27],[112,28],[118,29]],
    [[113,-21],[121,-22],[129,-24],[137,-28],[145,-33]],
    [[-90,45],[-87,44],[-84,43],[-82,42],[-79,43],[-77,45]],
    [[5,58],[10,56],[15,55],[20,54],[25,55],[30,57]]
  ];

  const LABELS=[
    ['NORTEAMÉRICA',-104,44],['SUDAMÉRICA',-60,-18],['EUROPA',15,52],['ÁFRICA',20,5],['ASIA',90,43],['OCEANÍA',134,-25]
  ];

  function syncGeometry(){
    const base=globe.getBoundingClientRect();
    const host=stage.getBoundingClientRect();
    const left=base.left-host.left,top=base.top-host.top;
    overlay.style.left=`${left}px`;overlay.style.top=`${top}px`;
    overlay.style.width=`${base.width}px`;overlay.style.height=`${base.height}px`;
    const dpr=Math.min(2,Math.max(1,window.devicePixelRatio||1));
    const w=Math.max(1,Math.round(base.width*dpr)),h=Math.max(1,Math.round(base.height*dpr));
    if(overlay.width!==w||overlay.height!==h){overlay.width=w;overlay.height=h;}
    return {w,h};
  }

  function project(lon,lat,radius,cx,cy){return seismic.project(lon,lat,radius,cx,cy);}

  function drawPolyline(points,radius,cx,cy,stroke,width,glow=0){
    let pen=false,visible=false;
    ctx.beginPath();
    for(const [lon,lat] of points){
      const p=project(lon,lat,radius,cx,cy);
      if(!p){pen=false;continue;}
      if(!pen){ctx.moveTo(p.x,p.y);pen=true;}else ctx.lineTo(p.x,p.y);
      visible=true;
    }
    if(!visible)return;
    ctx.save();ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';
    if(glow){ctx.shadowColor='rgba(86,219,255,.60)';ctx.shadowBlur=glow;}
    ctx.stroke();ctx.restore();
  }

  function drawCoastDots(points,radius,cx,cy,w){
    ctx.save();ctx.fillStyle='rgba(143,234,255,.78)';ctx.shadowColor='rgba(92,218,255,.52)';ctx.shadowBlur=Math.max(2,w/420);
    const size=Math.max(.8,w/1050);
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1];
      const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/1.6));
      for(let s=0;s<=steps;s++){
        const t=s/steps,p=project(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,radius,cx,cy);
        if(!p||p.z<.08)continue;
        const alpha=.18+.58*p.z;ctx.globalAlpha=alpha;
        const r=size*(.75+p.z*.55);ctx.fillRect(p.x-r*.5,p.y-r*.5,r,r);
      }
    }
    ctx.restore();ctx.globalAlpha=1;
  }

  function drawLabels(radius,cx,cy,w){
    ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${Math.max(7,w/112)}px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif`;
    ctx.letterSpacing='1px';
    for(const [label,lon,lat] of LABELS){
      const p=project(lon,lat,radius,cx,cy);if(!p||p.z<.22)continue;
      const alpha=Math.min(.42,(p.z-.18)*.58);ctx.globalAlpha=alpha;
      ctx.fillStyle='rgba(171,236,255,.82)';ctx.shadowColor='rgba(70,205,248,.42)';ctx.shadowBlur=5;ctx.fillText(label,p.x,p.y);
    }
    ctx.restore();ctx.globalAlpha=1;
  }

  function draw(){
    if(!state.active){overlay.style.opacity='0';return;}
    overlay.style.opacity='1';
    const {w,h}=syncGeometry();ctx.clearRect(0,0,w,h);
    const cx=w/2,cy=h*.525,radius=Math.min(w,h)*.382*state.globeZoom;
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,radius*1.002,0,Math.PI*2);ctx.clip();

    // Two-pass coast rendering gives each continent a crisp silhouette plus a cyan halo.
    for(const points of Object.values(COASTS)){
      drawPolyline(points,radius,cx,cy,'rgba(56,184,222,.12)',Math.max(3,w/300),Math.max(2,w/350));
      drawPolyline(points,radius,cx,cy,'rgba(159,234,255,.72)',Math.max(.9,w/980),0);
      drawCoastDots(points,radius,cx,cy,w);
    }
    for(const island of ISLANDS){
      drawPolyline(island,radius,cx,cy,'rgba(151,231,255,.66)',Math.max(.8,w/1080),2);
      drawCoastDots(island,radius,cx,cy,w);
    }
    for(const line of REGIONAL_LINES){
      drawPolyline(line,radius,cx,cy,'rgba(104,207,237,.16)',Math.max(.55,w/1500),0);
    }
    drawLabels(radius,cx,cy,w);
    ctx.restore();
    requestAnimationFrame(draw);
  }

  let running=false;
  function start(){if(running)return;running=true;requestAnimationFrame(function loop(){if(!running)return;draw();if(!state.active)running=false;});}
  function stop(){running=false;overlay.style.opacity='0';}

  window.addEventListener('loky:seismic-mode',event=>{event?.detail?.active?start():stop();});
  window.addEventListener('resize',()=>{if(state.active)syncGeometry();},{passive:true});
  if(state.active)start();

  window.LOKY_PC4_CONTINENT_DETAIL={version:VERSION,overlay,coasts:COASTS,islands:ISLANDS,labels:LABELS,start,stop};
})();
