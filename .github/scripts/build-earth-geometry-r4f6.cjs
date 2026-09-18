'use strict';

const fs=require('fs');
const path=require('path');

const NE_COMMIT='ca96624a56bd078437bca8184e78163e5039ad19';
const BASE=`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson`;
const LAND_URL=`${BASE}/ne_50m_land.geojson`;
const COUNTRIES_URL=`${BASE}/ne_110m_admin_0_countries.geojson`;
const DOT_STEP=1.42;
const MAX_DOTS=9800;
const OUTPUT=path.join(process.cwd(),'site','earth-geometry-r4f6.json');

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
function flattenFeatures(fc){
  const rings=[];
  for(const f of fc?.features||[])rings.push(...ringsFromGeometry(f?.geometry));
  return rings;
}
function pointInRing(lon,lat,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=Number(ring[i][0]),yi=Number(ring[i][1]),xj=Number(ring[j][0]),yj=Number(ring[j][1]);
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
    for(const p of ring){
      const lon=Number(p[0]),lat=Number(p[1]);
      if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
      minLon=Math.min(minLon,lon);maxLon=Math.max(maxLon,lon);
      minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);
    }
    if(maxLon-minLon>220)continue;
    minLat=Math.max(-82,minLat);maxLat=Math.min(84,maxLat);
    const lonStart=Math.ceil(minLon/DOT_STEP)*DOT_STEP;
    const latStart=Math.ceil(minLat/DOT_STEP)*DOT_STEP;
    for(let lat=latStart;lat<=maxLat;lat+=DOT_STEP){
      for(let lon=lonStart;lon<=maxLon;lon+=DOT_STEP){
        if(!pointInRing(lon,lat,ring))continue;
        const seed=deterministic(lon,lat);
        const jl=(seed-.5)*.42;
        const jb=(deterministic(lat,lon)-.5)*.30;
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
function compactRings(rings){
  return rings.map(r=>r.map(p=>[
    Math.round(Number(p[0])*10000)/10000,
    Math.round(Number(p[1])*10000)/10000
  ]));
}
async function getJson(url){
  const r=await fetch(url,{cache:'no-store'});
  if(!r.ok)throw new Error(`HTTP_${r.status}_${url}`);
  return r.json();
}

(async()=>{
  const [land,countries]=await Promise.all([getJson(LAND_URL),getJson(COUNTRIES_URL)]);
  const landRings=flattenFeatures(land);
  const countryRings=flattenFeatures(countries);
  const dots=buildDots(landRings);
  if(landRings.length<20||countryRings.length<20||dots.length<1500){
    throw new Error(`GEOMETRY_INCOMPLETE land=${landRings.length} countries=${countryRings.length} dots=${dots.length}`);
  }
  const payload={
    version:'r4f6-precompiled-v1',
    naturalEarthCommit:NE_COMMIT,
    landRings:compactRings(landRings),
    countryRings:compactRings(countryRings),
    dots
  };
  fs.writeFileSync(OUTPUT,JSON.stringify(payload));
  const bytes=fs.statSync(OUTPUT).size;
  console.log(`R4F6 Earth precompiled: ${dots.length} dots, ${landRings.length} land rings, ${countryRings.length} country rings, ${bytes} bytes`);
})().catch(error=>{
  console.error(error);
  process.exit(1);
});
