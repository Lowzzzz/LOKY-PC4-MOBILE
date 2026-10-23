(()=>{
'use strict';
const canvas=document.querySelector('#mobilePet'),ctx=canvas.getContext('2d');
const face=document.createElement('canvas');face.width=400;face.height=240;const f=face.getContext('2d');
const api=window.petAPI||{open(){},menu(){},drag(){},hit(){},walking(){},ready(){},onState(){},onAction(){}};
const states=new Set(['IDLE','LISTENING','THINKING','SPEAKING','SILENCED','RECONNECTING','ERROR']);
const labels={IDLE:'',LISTENING:'Escuchando',THINKING:'Pensando',SPEAKING:'Hablando',SILENCED:'En silencio',RECONNECTING:'Reconectando',ERROR:'Sin conexión'};
let manifest,loaded=false,images={},clip='reposo',position=0,direction=1,pending=null,state='IDLE',last=0,clock=0,paused=false,drag=null,gaze=[0,0],lastHit=true;
let nextPaint=0,walkElapsed=0,walkOffset=0,walkPending=false,actionReceipt=null;const timings=[];
let loadEpoch=0;const loading={};
const isWalk=name=>name==='caminar'||name.startsWith('caminar_');
const turnFor=name=>name==='caminar'?'giro_derecha':name==='caminar_abajo'?null:isWalk(name)?'giro_'+name.slice(8):null;
async function loadClips(names){
  const fresh=[];
  names=[...new Set(['reposo',clip,...names].filter(n=>manifest.clips[n]))];
  await Promise.all(names.map(async name=>{
    if(images[name])return;
    if(!loading[name])loading[name]=(async()=>{
      const img=new Image();img.src='pet-assets/'+manifest.clips[name].atlas;await img.decode();images[name]=img;fresh.push(name);
      delete loading[name];
    })();
    await loading[name];
  }));
  // Exercise the actual fractional-alpha walk draw before accepting the action.
  // A zero-position draw does not warm the second blended frame. Restore the
  // current pose synchronously, so preparation never exposes a different pose.
  const previousClip=clip,previousPosition=position;
  try{for(const name of fresh.filter(isWalk)){clip=name;position=.5;draw();}}
  finally{clip=previousClip;position=previousPosition;if(images[clip])draw();}
  // Selection owns cache eviction after its epoch check; an older async load
  // must not evict the atlas of a newer animation.
}
function fitCanvas(){const edge=Math.max(320,Math.round(canvas.clientWidth*Math.min(devicePixelRatio||1,2)));canvas.width=edge;canvas.height=edge;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';if(loaded)draw();}
window.addEventListener('resize',fitCanvas);fitCanvas();
api.onLayout?.(size=>{if(Number.isFinite(size)&&size>=128&&size<=480){canvas.style.width=size+'px';canvas.style.height=size+'px';fitCanvas();}});
api.onState(value=>{if(states.has(value)){state=value;document.querySelector('#petStatus').textContent=labels[value];if(loaded)draw();}});
api.onAction(value=>{
  if(actionReceipt){api.actionResult?.({...actionReceipt,ok:false});actionReceipt=null;}
  if(typeof value==='string'){choose(value);return;}
  if(typeof value?.action!=='string')return;
  if(value.control){if(Number.isSafeInteger(value.id))api.actionResult?.({id:value.id,action:value.action,ok:true});return;}
  const target=value.clip||value.action;
  if(!loaded||!manifest?.clips[target]){if(Number.isSafeInteger(value.id))api.actionResult?.({id:value.id,action:value.action,ok:false});return;}
  if(Number.isSafeInteger(value.id))actionReceipt={id:value.id,action:value.action,clip:target};choose(target);
});
api.onWalkFrame?.(value=>{
  if(!isWalk(clip)||!Number.isFinite(value?.elapsed)||!Number.isFinite(value?.offset)||Math.abs(value.offset)>8)return;
  walkPending=false;walkOffset=value.offset;position=(value.elapsed*(manifest.clips[clip].fps||manifest.fps))%manifest.clips[clip].count;
  render(performance.now());
});
async function choose(value){
  if(!manifest?.clips[value])return;
  const epoch=++loadEpoch,oldTurn=turnFor(clip),newTurn=turnFor(value);
  try{await loadClips([value,oldTurn,newTurn]);}catch{if(actionReceipt){api.actionResult?.({...actionReceipt,ok:false});actionReceipt=null;}return;}
  if(epoch!==loadEpoch)return;
  const keep=new Set(['reposo',clip,value,oldTurn,newTurn]);
  for(const name of Object.keys(images))if(!keep.has(name)){images[name].src='';delete images[name];}
  api.walking(false);
  walkOffset=0;walkPending=false;
  if(clip==='sentarse'&&position>0){pending=value;direction=-1;return;}
  if(oldTurn&&manifest.clips[oldTurn]){start(oldTurn);position=manifest.clips[oldTurn].count-1;direction=-1;pending=value;return;}
  if(newTurn&&manifest.clips[newTurn]){start(newTurn);pending=value;return;}
  start(value);
}
function start(value){
  clip=value;position=0;direction=1;pending=null;walkElapsed=0;walkOffset=0;walkPending=false;api.walking(isWalk(value));
  if(actionReceipt?.clip===value){const receipt=actionReceipt;actionReceipt=null;try{draw();api.actionResult?.({...receipt,ok:true});}catch{api.actionResult?.({...receipt,ok:false});}}
}
function roundRect(x,y,w,h,r){f.beginPath();f.roundRect(x,y,w,h,r);f.fill();}
let faceMood={at:null,curious:0,listening:0,happy:0,thinking:0,waiting:0,gx:0,gy:0};
function advanceFaceMood(previous,t,status,animation,pointer){
  const dt=previous.at===null?0:Math.max(0,Math.min(.05,t-previous.at));
  const blend=1-Math.exp(-dt/.22),phase=(t+4)%14;
  const briefSmile=phase<2.2?.75*Math.sin(Math.PI*phase/2.2)**2:0;
  const idle=status==='IDLE',muted=status==='SILENCED';
  const target={
    curious:status==='LISTENING'?1:idle?.18*(.5+.5*Math.sin(t*.31)):0,
    listening:status==='LISTENING'?1:0,
    happy:idle?(animation==='saludar'?.65:briefSmile):0,
    thinking:status==='THINKING'?1:0,
    waiting:status==='THINKING'||status==='RECONNECTING'?1:0,
    gx:Math.max(-1,Math.min(1,pointer[0]||0)),gy:Math.max(-1,Math.min(1,pointer[1]||0))
  };
  const result={at:t};
  for(const key of Object.keys(target))result[key]=muted?0:previous[key]+(target[key]-previous[key])*blend;
  return result;
}
function paintFace(t){
  faceMood=advanceFaceMood(faceMood,t,state,clip,gaze);
  f.clearRect(0,0,400,240);f.globalAlpha=1;f.fillStyle='#58f4e5';f.strokeStyle='#58f4e5';f.lineWidth=10;f.lineCap='round';
  const muted=state==='SILENCED',eyeColor=muted?'#ff6975':'#58f4e5';
  if(muted){f.fillStyle='rgb('+Math.round(90+10*Math.sin(t*2))+',8,17)';f.fillRect(0,0,400,240);}
  f.fillStyle=eyeColor;f.strokeStyle=eyeColor;
  const sleep=false;
  const blinkPhase=t%4.7,blink=blinkPhase<.16?Math.abs(blinkPhase-.08)/.08:1;
  const {curious,listening,happy,thinking,waiting,gx,gy}=faceMood;
  const look=(Math.sin(t*.55)*6+gx*8)*(1-thinking)+thinking*(15+2*Math.sin(t*.8));
  for(const [index,x] of [112,282].entries()){
    if(sleep){f.beginPath();f.moveTo(x-28,100);f.quadraticCurveTo(x,120,x+28,100);f.stroke();continue;}
    const eyeHeight=Math.max(3,(66*(1-.12*happy)+curious*(index?2:7)-thinking*(index?5:0))*blink);
    const y=88-8*curious-5*thinking-2*happy+gy*6;
    roundRect(x-25+look,y-eyeHeight/2,50,eyeHeight,Math.min(20,eyeHeight/2));
    if(eyeHeight>24){f.fillStyle=muted?'#ffd5d9':'#e9fffd';f.beginPath();f.ellipse(x-9+look,y-15,6,8,0,0,Math.PI*2);f.fill();f.fillStyle=eyeColor;}
  }
  // Silence is immediate and takes priority over every interpolated expression.
  if(muted)return;
  if(state==='SPEAKING'&&!sleep){f.beginPath();f.ellipse(200,174,26+5*Math.sin(t*15),8+21*(.5+.5*Math.sin(t*22)),0,0,Math.PI*2);f.fill();}
  else{
    f.globalAlpha=1-waiting;
    const halfWidth=26+12*happy;
    f.beginPath();f.moveTo(200-halfWidth,172);f.quadraticCurveTo(200,177+23*happy,200+halfWidth,172);f.stroke();
    for(let i=0;i<3;i++){f.globalAlpha=waiting*(.3+.7*(.5+.5*Math.sin(t*5-i)));f.beginPath();f.arc(175+i*25,173,6,0,Math.PI*2);f.fill();}f.globalAlpha=1;
  }
  if(listening>.01){f.globalAlpha=listening;f.lineWidth=4;for(const x of [38,362]){f.beginPath();f.ellipse(x,91,12,30+4*Math.sin(t*6),0,-Math.PI/2,Math.PI/2);f.stroke();}f.globalAlpha=1;}
}
function triangle(src,dst){
  const [a,b,c]=src,[p,q,r]=dst;
  const det=(b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1]);
  if(Math.abs(det)<.001)return;
  const A=((q[0]-p[0])*(c[1]-a[1])-(r[0]-p[0])*(b[1]-a[1]))/det;
  const B=((q[1]-p[1])*(c[1]-a[1])-(r[1]-p[1])*(b[1]-a[1]))/det;
  const C=((r[0]-p[0])*(b[0]-a[0])-(q[0]-p[0])*(c[0]-a[0]))/det;
  const D=((r[1]-p[1])*(b[0]-a[0])-(q[1]-p[1])*(c[0]-a[0]))/det;
  const center=[(p[0]+q[0]+r[0])/3,(p[1]+q[1]+r[1])/3],edge=[p,q,r].map(v=>{const dx=v[0]-center[0],dy=v[1]-center[1],n=Math.hypot(dx,dy)||1;return [v[0]+.3*dx/n,v[1]+.3*dy/n];});
  ctx.save();ctx.beginPath();ctx.moveTo(...edge[0]);ctx.lineTo(...edge[1]);ctx.lineTo(...edge[2]);ctx.closePath();ctx.clip();ctx.transform(A,B,C,D,p[0]-A*a[0]-C*a[1],p[1]-B*a[0]-D*a[1]);ctx.drawImage(face,0,0);ctx.restore();
}
function draw(){
  if(!manifest)return;
  const spec=manifest.clips[clip],i=Math.min(spec.count-1,Math.max(0,Math.floor(position))),j=spec.loop?(i+1)%spec.count:Math.min(spec.count-1,i+1),fraction=position-Math.floor(position);
  const first=spec.frames[i].face,second=spec.frames[j].face;
  const points=first.length&&second.length?first.map((p,k)=>p.map((v,axis)=>v+(second[k][axis]-v)*fraction)):first.length?first:second;
  const faceAlpha=first.length&&second.length?1:first.length?1-fraction:fraction;
  const size=spec.size||manifest.size,scale=canvas.width/320;
  ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,320,320);ctx.translate(walkOffset,0);
  if(!images[clip])return;
  const tile=n=>ctx.drawImage(images[clip],(n%spec.columns)*size,Math.floor(n/spec.columns)*size,size,size,0,0,320,320);
  if(isWalk(clip)){ctx.globalAlpha=1-fraction;tile(i);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=fraction;tile(j);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;}else tile(i);
  if(!points.length)return;
  paintFace(clock);
  ctx.globalAlpha=faceAlpha;
  const cols=manifest.faceColumns,rows=manifest.faceRows;
  for(let y=0;y<rows-1;y++)for(let x=0;x<cols-1;x++){
    const a=y*cols+x,b=a+1,c=a+cols,d=c+1;
    const uv=n=>[(n%cols)*400/(cols-1),Math.floor(n/cols)*240/(rows-1)];
    triangle([uv(a),uv(b),uv(c)],[points[a],points[b],points[c]]);
    triangle([uv(b),uv(d),uv(c)],[points[b],points[d],points[c]]);
  }
  ctx.globalAlpha=1;
}
function render(now){const begin=performance.now();draw();timings.push({at:now,cost:performance.now()-begin,clip});if(timings.length>300)timings.shift();}
function tick(now){
  if(!paused&&!document.hidden&&manifest){const dt=Math.min(.04,(now-(last||now))/1000);clock+=dt;window.LokyPetMotion?.step(dt,isWalk(clip));
    if(isWalk(clip)){walkElapsed+=dt;position=(walkElapsed*(manifest.clips[clip].fps||manifest.fps))%manifest.clips[clip].count;}else position+=dt*(manifest.clips[clip].fps||manifest.fps*1.15)*direction;
    const spec=manifest.clips[clip];
    if(direction<0&&position<=0){const target=pending||'reposo';position=0;clip='reposo';pending=null;choose(target);}
    else if(position>=spec.count){if(spec.loop)position%=spec.count;else if(spec.kind==='turn')start(pending||'reposo');else if(clip==='saludar'||spec.kind==='gesture')start('reposo');else position=spec.count-1;}
    if(now>=nextPaint){
      const period=1000/30;nextPaint+=period;if(nextPaint<now-period)nextPaint=now+period;
      if(isWalk(clip)&&api.walkFrame){if(!walkPending){walkPending=true;api.walkFrame(walkElapsed);}}
      else render(now);
    }
  }last=now;requestAnimationFrame(tick);
}

let resolveReady;
const ready=new Promise(resolve=>resolveReady=resolve);
window.LokyPet={ready,choose:async value=>{if(!loaded||!manifest.clips[value])return false;await choose(value);return !!images[value];},
  setState:value=>{if(states.has(value))state=value;},
  inspect:()=>({ready:loaded,clip,position,state,loadedClips:Object.keys(images),clips:manifest?Object.keys(manifest.clips):[],canvasPixels:canvas.width,renderFps:timings.length>1?1000*(timings.length-1)/(timings.at(-1).at-timings[0].at):0,renderCostMax:Math.max(0,...timings.map(t=>t.cost))})};
new ResizeObserver(fitCanvas).observe(canvas);
document.addEventListener('visibilitychange',()=>{last=0;nextPaint=0;});
(async()=>{manifest=await(await fetch('pet-assets/manifest.json')).json();await loadClips(['reposo']);draw();loaded=true;resolveReady(true);requestAnimationFrame(tick);})().catch(error=>{document.querySelector('#petStatus').textContent='No se pudo cargar LOKY. Recarga para reintentar.';resolveReady(false);console.error(error);});
})();
