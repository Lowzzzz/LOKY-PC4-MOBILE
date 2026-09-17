'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const src=fs.readFileSync('site/mobile-seismic.js','utf8');

function classList(){
  const set=new Set();
  return {set,add(...x){x.forEach(v=>set.add(v));},remove(...x){x.forEach(v=>set.delete(v));},contains(x){return set.has(x);}};
}
function el(id=''){
  const listeners={};
  return {
    id,className:'',textContent:'',children:[],style:{},attrs:{},dataset:{},disabled:false,classList:classList(),
    appendChild(x){this.children.push(x);return x;},
    setAttribute(k,v){this.attrs[k]=String(v);},
    getAttribute(k){return this.attrs[k];},
    addEventListener(t,fn){(listeners[t]||(listeners[t]=[])).push(fn);},
    dispatch(t,event={}){for(const fn of listeners[t]||[])fn({...event,currentTarget:this,target:this,preventDefault(){}});},
    getBoundingClientRect(){return {width:400,height:500,left:0,top:0};},
    setPointerCapture(){},
    querySelector(){return null;},
  };
}

const app=el('app');
const stage=el('stage');
const sphereWrap=el('sphere-wrap');
const sphereCanvas=el('lokySphere');
const slot1=el('slot1');
const slot2=el('slot2');
const slot3=el('slot3');
const slot4=el('slot4');
const head=el('head');
const byId={app,lokySphere:sphereCanvas};

const fakeCtx={
  clearRect(){},createRadialGradient(){return {addColorStop(){}}},beginPath(){},arc(){},ellipse(){},fill(){},stroke(){},save(){},clip(){},restore(){},moveTo(){},lineTo(){},fillRect(){},translate(){},rotate(){},
  set fillStyle(v){},set strokeStyle(v){},set lineWidth(v){},set lineJoin(v){},set lineCap(v){},set globalAlpha(v){},set shadowColor(v){},set shadowBlur(v){},
};

const document={
  head,
  createElement(tag){
    const x=el(tag);
    if(tag==='canvas')x.getContext=()=>fakeCtx;
    Object.defineProperty(x,'id',{get(){return this._id||'';},set(v){this._id=v;byId[v]=this;}});
    return x;
  },
  getElementById(id){return byId[id]||null;},
  querySelector(q){
    if(q==='.stage')return stage;
    if(q==='.sphere-wrap')return sphereWrap;
    if(q==='.future-op-2')return slot2;
    return null;
  },
};

const store={};
const localStorage={
  getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
  setItem:(k,v)=>{store[k]=String(v);},
};

let geolocationCalls=0;
const navigator={
  geolocation:{getCurrentPosition(ok){geolocationCalls++;ok({coords:{latitude:41.1,longitude:-73.2,accuracy:120}});}},
};

const context={
  console,document,localStorage,navigator,
  window:null,
  performance:{now:()=>1000},
  requestAnimationFrame:()=>1,cancelAnimationFrame(){},
  setInterval:()=>2,clearInterval(){},setTimeout,clearTimeout,
  CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},
  fetch:async()=>({ok:true,json:async()=>({features:[]})}),
  Map,Set,Math,Date,JSON,Number,Array,String,
  addEventListener(){},dispatchEvent(){},
};
context.window=context;
context.devicePixelRatio=2;
context.LOKY_PC4_FEATURES={slots:[slot1,slot2,slot3,slot4]};
vm.createContext(context);
vm.runInContext(src,context,{filename:'mobile-seismic.js'});

const api=context.LOKY_PC4_SEISMIC;
assert(api,'Sismos API missing');
assert.equal(api.version,'0.3.2R4F3R2-earth-ultra-quake-info');
assert(api.feed.includes('earthquake.usgs.gov'));
assert(api.landDots>250,'pointillist land detail is too sparse');
assert.equal(typeof api.selectQuake,'function');
assert.equal(typeof api.pickQuake,'function');
assert(byId.lokyQuakeInfo,'quake info panel missing');

assert.equal(slot2.disabled,false,'left inner slot must become active');
assert(slot2.classList.contains('feature-seismic'));
assert.equal(slot2.getAttribute('aria-label'),'Sismos');
assert(!slot1.classList.contains('feature-seismic'),'outer left slot must remain untouched');
assert(!slot3.classList.contains('feature-seismic'));
assert(!slot4.classList.contains('feature-seismic'));

const sample={features:[
  {id:'a',geometry:{coordinates:[10,20,5]},properties:{mag:4.2,place:'A',time:100,url:'https://example.test/a'}},
  {id:'b',geometry:{coordinates:[-80,-10,8]},properties:{mag:5.1,place:'B',time:300,url:'https://example.test/b'}},
  {id:'bad',geometry:{coordinates:['x','x']},properties:{mag:'x',place:'bad',time:999}},
]};
const parsed=api.parseFeed(sample);
assert.equal(parsed.length,2);
assert.equal(parsed[0].id,'b','events must be newest first');
assert.equal(parsed[1].id,'a');
assert.equal(parsed[0].depth,8);

api.state.centerLon=0;api.state.centerLat=0;
assert(api.project(0,0,100,100,100),'front side point must project');
assert.equal(api.project(180,0,100,100,100),null,'back side point must be hidden');

assert.equal(api.setSphereZoom(99),2.6,'sphere zoom must clamp high');
assert.equal(api.setSphereZoom(.1),.85,'sphere zoom must clamp low');
api.resetSphereZoom();
assert.equal(api.state.sphereZoom,1);
assert(String(sphereWrap.style.transform).includes('scale(1.000)'));

api.enter();
assert.equal(api.state.active,true);
assert(app.classList.contains('loky-seismic-mode'));
assert.equal(slot2.getAttribute('aria-pressed'),'true');
assert.equal(geolocationCalls,1,'location requested only when Sismos opens');
assert(api.state.location&&Math.abs(api.state.location.lat-41.1)<1e-6);
api.exit();
assert.equal(api.state.active,false);
assert(!app.classList.contains('loky-seismic-mode'));
assert.equal(slot2.getAttribute('aria-pressed'),'false');

assert(!/getUserMedia\s*\(/.test(src),'Sismos must not create a microphone');
assert(!/new\s+WebSocket\s*\(/.test(src),'Sismos must not create a WebSocket');
assert(!/LOKY_PC4_LIVE/.test(src),'Sismos must not touch Conversation R4 state');
assert(src.includes('navigator.geolocation.getCurrentPosition'));
assert(src.includes('pointermove'));
assert(src.includes('SPHERE_MAX_ZOOM=2.6'));
assert(src.includes('GLOBE_MAX_ZOOM=3.2'));
assert(src.includes('width:122%;height:122%'),'globe canvas must remain frameless and oversized');
assert(src.includes('top:14px;bottom:auto'),'seismic HUD must stay above bottom controls');
assert(src.includes('function buildLandDots('),'pointillist Earth renderer missing');
assert(src.includes('function drawOrbits('),'orbital Earth detail missing');
assert(src.includes('function selectQuake('),'quake info selection missing');
assert(src.includes('PROFUNDIDAD'),'quake depth info missing');

console.log('R4F3R2 Earth Ultra + quake info + location + zoom tests PASS');
