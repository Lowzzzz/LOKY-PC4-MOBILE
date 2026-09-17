'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const src=fs.readFileSync('site/mobile-earth-reference.js','utf8');

function classList(){const s=new Set();return {add(...x){x.forEach(v=>s.add(v));},remove(...x){x.forEach(v=>s.delete(v));},contains(v){return s.has(v);}};}
function el(id=''){
  return {id,style:{},classList:classList(),children:[],attrs:{},appendChild(x){this.children.push(x);return x;},setAttribute(k,v){this.attrs[k]=String(v);},getBoundingClientRect(){return id==='lokySeismicGlobe'?{left:20,top:30,width:420,height:520}:{left:0,top:0,width:430,height:600};}};
}
const app=el('app'),stage=el('stage'),base=el('lokySeismicGlobe'),head=el('head');
const byId={app,lokySeismicGlobe:base};
const fakeCtx={
  beginPath(){},arc(){},fill(){},stroke(){},save(){},restore(){},moveTo(){},lineTo(){},fillRect(){},ellipse(){},translate(){},rotate(){},clip(){},clearRect(){},
  createRadialGradient(){return {addColorStop(){}}},
  set fillStyle(v){},set strokeStyle(v){},set lineWidth(v){},set lineJoin(v){},set lineCap(v){},set globalAlpha(v){},set shadowColor(v){},set shadowBlur(v){}
};
const document={
  head,
  createElement(tag){const x=el(tag);if(tag==='canvas')x.getContext=()=>fakeCtx;Object.defineProperty(x,'id',{get(){return this._id||'';},set(v){this._id=v;byId[v]=this;}});return x;},
  getElementById(id){return byId[id]||null;},
  querySelector(q){if(q==='.stage')return stage;return null;}
};

const features=[];
for(let i=0;i<20;i++){
  const x0=-170+i*17,x1=x0+15;
  features.push({type:'Feature',geometry:{type:'Polygon',coordinates:[[[x0,-68],[x1,-68],[x1,68],[x0,68],[x0,-68]]]}});
}
const geo={type:'FeatureCollection',features};
let fetchCalls=0;
const fetch=async()=>{fetchCalls++;return {ok:true,json:async()=>geo};};
const seismic={
  state:{active:false,globeZoom:1,quakes:[],location:null,selectedQuake:null,centerLon:0,centerLat:0},
  project(lon,lat,radius,cx,cy){
    const rad=Math.PI/180,lambda=(lon-this.state.centerLon)*rad,phi=lat*rad,phi0=this.state.centerLat*rad,cp=Math.cos(phi);
    const z=Math.sin(phi)*Math.sin(phi0)+cp*Math.cos(phi0)*Math.cos(lambda);if(z<=0)return null;
    return {x:cx+radius*cp*Math.sin(lambda),y:cy-radius*(Math.sin(phi)*Math.cos(phi0)-cp*Math.cos(lambda)*Math.sin(phi0)),z};
  }
};

const context={console,document,fetch,window:null,performance:{now:()=>1000},requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout,clearTimeout,Math,Date,Number,Array,String,Set,Map,Promise};
context.window=context;context.devicePixelRatio=2;context.LOKY_PC4_SEISMIC=seismic;context.addEventListener=()=>{};
vm.createContext(context);
vm.runInContext(src,context,{filename:'mobile-earth-reference.js'});

setTimeout(()=>{
  const api=context.LOKY_PC4_EARTH_REFERENCE;
  assert(api,'Earth reference API missing');
  assert.equal(api.version,'0.3.2R4F4-earth-reference-rebuild');
  assert.equal(api.source.naturalEarthCommit,'ca96624a56bd078437bca8184e78163e5039ad19');
  assert(fetchCalls>=2,'Natural Earth geometry must be requested');
  assert(api.geometry.ready,'geometry should become ready after valid data');
  assert(api.geometry.landRings.length>=20,'land geometry missing');
  assert(api.geometry.dots.length>=1500&&api.geometry.dots.length<=9800,'point cloud density out of bounds');
  assert(app.classList.contains('loky-earth-reference-ready'),'ready class missing');
  assert(src.includes('ne_50m_land.geojson'),'50m coastline source missing');
  assert(src.includes('ne_110m_admin_0_countries.geojson'),'country boundary source missing');
  assert(src.includes("pointer-events:none"),'renderer must not capture gestures');
  assert(src.includes('#lokySeismicGlobe{opacity:0!important;pointer-events:auto!important}'),'base Sismos canvas must remain interactive while visually replaced');
  assert(src.includes('drawQuakes(radius,cx,cy,now)'),'quake markers must remain in new renderer');
  assert(src.includes('drawLocation(radius,cx,cy,now)'),'owner location must remain visible');
  assert(!/getUserMedia\s*\(/.test(src),'renderer must not create microphone');
  assert(!/new\s+WebSocket\s*\(/.test(src),'renderer must not create WebSocket');
  assert(!/LOKY_PC4_LIVE/.test(src),'renderer must not touch Conversation R4');
  console.log('R4F4 Earth reference rebuild tests PASS');
},0);
