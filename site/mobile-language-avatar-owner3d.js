(() => {
  'use strict';
  const VERSION = '0.3.2R4F12R8R2-meshy-owner-only';

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=(a)=>{const l=Math.hypot(...a)||1; return a.map(v=>v/l)};
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

  function perspective(fovy, aspect, near, far){
    const f=1/Math.tan(fovy/2), nf=1/(near-far);
    return new Float32Array([
      f/aspect,0,0,0,
      0,f,0,0,
      0,0,(far+near)*nf,-1,
      0,0,2*far*near*nf,0
    ]);
  }
  function lookAt(eye,center,up){
    const z=norm(sub(eye,center)); const x=norm(cross(up,z)); const y=cross(z,x);
    return new Float32Array([
      x[0],y[0],z[0],0,
      x[1],y[1],z[1],0,
      x[2],y[2],z[2],0,
      -dot(x,eye),-dot(y,eye),-dot(z,eye),1
    ]);
  }
  function mul(a,b){
    const o=new Float32Array(16);
    for(let c=0;c<4;c++) for(let r=0;r<4;r++) o[c*4+r]=a[0*4+r]*b[c*4+0]+a[1*4+r]*b[c*4+1]+a[2*4+r]*b[c*4+2]+a[3*4+r]*b[c*4+3];
    return o;
  }
  function modelMatrix(yaw=0,scale=1,zScale=1){
    const c=Math.cos(yaw),s=Math.sin(yaw);
    return new Float32Array([
      c*scale,s*scale,0,0,
      -s*scale,c*scale,0,0,
      0,0,scale*zScale,0,
      0,0,0,1
    ]);
  }

  function compile(gl,type,src){
    const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)||'shader compile');
    return s;
  }
  function program(gl,vs,fs){
    const p=gl.createProgram(); gl.attachShader(p,compile(gl,gl.VERTEX_SHADER,vs)); gl.attachShader(p,compile(gl,gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)||'program link');
    return p;
  }

  function parseGLB(buffer){
    const dv=new DataView(buffer);
    if(dv.getUint32(0,true)!==0x46546c67) throw new Error('GLB inválido');
    if(dv.getUint32(4,true)!==2) throw new Error('GLB versión no soportada');
    let off=12,json=null,bin=null;
    while(off<dv.byteLength){
      const len=dv.getUint32(off,true), type=dv.getUint32(off+4,true); off+=8;
      const chunk=buffer.slice(off,off+len); off+=len;
      if(type===0x4E4F534A) json=JSON.parse(new TextDecoder().decode(chunk).replace(/\0+$/,''));
      else if(type===0x004E4942) bin=chunk;
    }
    if(!json||!bin) throw new Error('GLB incompleto');
    return {json,bin};
  }
  function componentCtor(type){ return type===5126?Float32Array:type===5125?Uint32Array:type===5123?Uint16Array:type===5121?Uint8Array:null; }
  function components(type){ return type==='SCALAR'?1:type==='VEC2'?2:type==='VEC3'?3:type==='VEC4'?4:1; }
  function accessorData(gltf,bin,index){
    const a=gltf.accessors[index], bv=gltf.bufferViews[a.bufferView], C=componentCtor(a.componentType); if(!C) throw new Error('componentType '+a.componentType);
    const n=components(a.type), byteOffset=(bv.byteOffset||0)+(a.byteOffset||0), length=a.count*n;
    if(bv.byteStride && bv.byteStride!==C.BYTES_PER_ELEMENT*n){
      const out=new C(length), src=new DataView(bin,0); const stride=bv.byteStride;
      for(let i=0;i<a.count;i++) for(let j=0;j<n;j++){
        const at=byteOffset+i*stride+j*C.BYTES_PER_ELEMENT;
        out[i*n+j]=C===Float32Array?src.getFloat32(at,true):C===Uint32Array?src.getUint32(at,true):C===Uint16Array?src.getUint16(at,true):src.getUint8(at);
      }
      return {array:out,size:n,componentType:a.componentType,count:a.count,min:a.min,max:a.max};
    }
    return {array:new C(bin,byteOffset,length),size:n,componentType:a.componentType,count:a.count,min:a.min,max:a.max};
  }
  async function imageFromBufferView(gltf,bin,index){
    const img=gltf.images[index], bv=gltf.bufferViews[img.bufferView];
    const bytes=new Uint8Array(bin,(bv.byteOffset||0),bv.byteLength);
    const blob=new Blob([bytes],{type:img.mimeType||'image/png'});
    return await createImageBitmap(blob,{premultiplyAlpha:'none',colorSpaceConversion:'default'});
  }

  class LokyMeshyAvatar3D {
    constructor(canvas,opts={}){
      this.canvas=canvas; this.opts=opts; this.state='ready'; this.yaw=0; this.pitch=0.02; this.distance=2.58; this.drag=null; this.touchDistance=0; this.last=performance.now(); this.running=false;
      this.gl=canvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:false});
      if(!this.gl) throw new Error('WebGL2 no disponible');
      this._bindInput();
    }
    async _loadArrayBuffer(ab,t0=performance.now()){
      const {json,bin}=parseGLB(ab); const prim=json.meshes?.[0]?.primitives?.[0]; if(!prim) throw new Error('Sin malla');
      const P=accessorData(json,bin,prim.attributes.POSITION), N=accessorData(json,bin,prim.attributes.NORMAL), U=accessorData(json,bin,prim.attributes.TEXCOORD_0), I=accessorData(json,bin,prim.indices);
      const mat=json.materials?.[prim.material||0]||{}; const baseTexIndex=mat.pbrMetallicRoughness?.baseColorTexture?.index ?? 0; const imageIndex=json.textures?.[baseTexIndex]?.source ?? 0;
      const image=await imageFromBufferView(json,bin,imageIndex);
      this._setup(P,N,U,I,image);
      this.stats={bytes:ab.byteLength,vertices:P.count,triangles:Math.floor(I.count/3),loadMs:performance.now()-t0};
      this.running=true; this.opts.onReady?.(this.stats); this.opts.onStatus?.('LISTO'); requestAnimationFrame(t=>this._frame(t));
      return this.stats;
    }
    async load(url){
      const t0=performance.now(); this.opts.onStatus?.('CARGANDO 3D');
      const res=await fetch(url,{cache:'no-store'}); if(!res.ok) throw new Error('HTTP '+res.status); const ab=await res.arrayBuffer();
      return this._loadArrayBuffer(ab,t0);
    }
    async loadBase64(base64){
      const t0=performance.now(); this.opts.onStatus?.('CARGANDO 3D LOCAL');
      if(!base64) throw new Error('Modelo local no disponible');
      const raw=atob(base64); const bytes=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
      return this._loadArrayBuffer(bytes.buffer,t0);
    }
    async loadBase64ChunkUrls(urls){
      const t0=performance.now(); this.opts.onStatus?.('CARGANDO 3D OWNER');
      const pieces=[]; let total=0;
      for(const url of urls){
        const r=await fetch(url,{cache:'force-cache'});
        if(!r.ok) throw new Error('MODEL_CHUNK_'+r.status);
        const text=(await r.text()).trim();
        const raw=atob(text);
        const bytes=new Uint8Array(raw.length);
        for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
        pieces.push(bytes); total+=bytes.byteLength;
      }
      const all=new Uint8Array(total); let off=0;
      for(const bytes of pieces){all.set(bytes,off);off+=bytes.byteLength;}
      return this._loadArrayBuffer(all.buffer,t0);
    }
    _setup(P,N,U,I,image){
      const gl=this.gl;
      const vs=`#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 aPos;\nlayout(location=1) in vec3 aNormal;\nlayout(location=2) in vec2 aUV;\nuniform mat4 uMVP; uniform mat4 uModel;\nout vec3 vN; out vec2 vUV; out vec3 vWorld;\nvoid main(){vec4 w=uModel*vec4(aPos,1.0); vWorld=w.xyz; vN=normalize(mat3(uModel)*aNormal); vUV=aUV; gl_Position=uMVP*vec4(aPos,1.0);}`;
      const fs=`#version 300 es\nprecision highp float;\nin vec3 vN; in vec2 vUV; in vec3 vWorld;\nuniform sampler2D uBase; uniform float uSpeak; uniform float uThink; uniform vec3 uCamera;\nout vec4 outColor;\nvoid main(){\n vec4 tex=texture(uBase,vUV); if(tex.a<0.05) discard; vec3 c=pow(max(tex.rgb,vec3(0.0)),vec3(2.2));\n vec3 n=normalize(vN); vec3 v=normalize(uCamera-vWorld);\n float facing=max(dot(n,v),0.0);\n vec3 topLight=normalize(vec3(-0.28,0.12,0.95));\n float d=0.24 + facing*0.68 + max(dot(n,topLight),0.0)*0.14;\n float rim=pow(1.0-facing,3.4);\n float cyanSignal=max(min(tex.g,tex.b)-tex.r*1.25,0.0);\n float cyan=smoothstep(0.055,0.24,cyanSignal)*smoothstep(0.14,0.48,max(tex.g,tex.b));\n vec3 lit=c*d + vec3(0.015,0.07,0.10)*rim*(0.12+uThink*0.08) + vec3(0.015,0.20,0.34)*cyan*(0.48+uSpeak*0.25);\n lit=lit/(lit+vec3(1.0)); lit=pow(lit,vec3(1.0/2.2)); outColor=vec4(lit,tex.a);\n}`;
      this.prog=program(gl,vs,fs); gl.useProgram(this.prog);
      this.loc={mvp:gl.getUniformLocation(this.prog,'uMVP'),model:gl.getUniformLocation(this.prog,'uModel'),base:gl.getUniformLocation(this.prog,'uBase'),speak:gl.getUniformLocation(this.prog,'uSpeak'),think:gl.getUniformLocation(this.prog,'uThink'),camera:gl.getUniformLocation(this.prog,'uCamera')};
      this.vao=gl.createVertexArray(); gl.bindVertexArray(this.vao);
      const bind=(loc,data,size)=>{const b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);};
      bind(0,P.array,3); bind(1,N.array,3); bind(2,U.array,2);
      const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,I.array,gl.STATIC_DRAW); this.indexType=I.componentType===5125?gl.UNSIGNED_INT:I.componentType===5123?gl.UNSIGNED_SHORT:gl.UNSIGNED_BYTE; this.indexCount=I.count;
      this.tex=gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,image.width,image.height,0,gl.RGBA,gl.UNSIGNED_BYTE,image); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); gl.uniform1i(this.loc.base,0);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      this.bounds={min:P.min||[-.33,-.2,-.96],max:P.max||[.33,.2,.96]};
    }
    setState(state){ this.state=state||'ready'; }
    _bindInput(){
      const c=this.canvas;
      c.addEventListener('pointerdown',e=>{this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:this.yaw,pitch:this.pitch}; c.setPointerCapture?.(e.pointerId);});
      c.addEventListener('pointermove',e=>{if(!this.drag||this.drag.id!==e.pointerId)return; this.yaw=this.drag.yaw-(e.clientX-this.drag.x)*0.006; this.pitch=clamp(this.drag.pitch+(e.clientY-this.drag.y)*0.003,-0.22,0.25);});
      c.addEventListener('pointerup',e=>{if(this.drag?.id===e.pointerId)this.drag=null;});
      c.addEventListener('wheel',e=>{e.preventDefault(); this.distance=clamp(this.distance*Math.exp(e.deltaY*0.001),1.65,4.2);},{passive:false});
      let touches=[];
      c.addEventListener('touchstart',e=>{touches=[...e.touches].map(t=>[t.clientX,t.clientY]); if(touches.length===2)this.touchDistance=Math.hypot(touches[0][0]-touches[1][0],touches[0][1]-touches[1][1]);},{passive:true});
      c.addEventListener('touchmove',e=>{const a=[...e.touches].map(t=>[t.clientX,t.clientY]); if(a.length===2&&this.touchDistance){const d=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]); this.distance=clamp(this.distance*(this.touchDistance/Math.max(1,d)),1.65,4.2); this.touchDistance=d;}},{passive:true});
    }
    _resize(){
      const dpr=Math.min(devicePixelRatio||1,2), w=Math.max(1,Math.floor(this.canvas.clientWidth*dpr)), h=Math.max(1,Math.floor(this.canvas.clientHeight*dpr));
      if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
      this.gl.viewport(0,0,w,h); return [w,h];
    }
    _frame(t){
      if(!this.running)return; const gl=this.gl,[w,h]=this._resize(); const sec=t*0.001;
      const active=!this.drag; const idleYaw=active?Math.sin(sec*0.42)*0.025:0; const breathe=1+Math.sin(sec*1.28)*0.0026; const speaking=this.state==='speaking'?0.5+0.5*Math.sin(sec*7.2):0; const thinking=this.state==='thinking'?0.5+0.5*Math.sin(sec*2.1):0;
      const yaw=this.yaw+idleYaw; const dist=this.distance; const pitch=this.pitch; const eye=[Math.sin(yaw)*dist,-Math.cos(yaw)*dist*Math.cos(pitch),Math.sin(pitch)*dist+0.02];
      const proj=perspective(31*Math.PI/180,w/h,0.05,20); const view=lookAt(eye,[0,0,0.02],[0,0,1]); const model=modelMatrix(0,breathe,1+(this.state==='speaking'?Math.sin(sec*5.5)*0.0012:0)); const mvp=mul(proj,mul(view,model));
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT); gl.useProgram(this.prog); gl.bindVertexArray(this.vao); gl.uniformMatrix4fv(this.loc.mvp,false,mvp); gl.uniformMatrix4fv(this.loc.model,false,model); gl.uniform1f(this.loc.speak,speaking); gl.uniform1f(this.loc.think,thinking); gl.uniform3f(this.loc.camera,eye[0],eye[1],eye[2]); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.tex); gl.drawElements(gl.TRIANGLES,this.indexCount,this.indexType,0);
      requestAnimationFrame(x=>this._frame(x));
    }
    stop(){ this.running=false; }
  }

  window.LOKY_MESHY_AVATAR_3D={VERSION,Avatar:LokyMeshyAvatar3D};
})();


(() => {
  'use strict';

  const VERSION='0.3.2R4F12R8R2-meshy-owner-only';
  const DEVICE_KEY='loky_pc4_device_capability_v1';
  const DEVICE_ENDPOINT='https://novgwydgcvlboujnmygq.supabase.co/functions/v1/loky-pc4-mobile-devices';
  const MODEL_CHUNKS=Array.from({length:13},(_,i)=>`./assets/owner3d/chunk_${String(i).padStart(3,'0')}.txt?v=0.3.2r4f12r8r2`);
  const ROLE_TTL_MS=60_000;
  const managed=new WeakMap();
  let roleCache={at:0,owner:false};
  let rolePromise=null;

  function capability(){
    try{return String(localStorage.getItem(DEVICE_KEY)||'')}catch{return ''}
  }

  async function fetchOwnerRole(){
    const now=Date.now();
    if(now-roleCache.at<ROLE_TTL_MS)return roleCache.owner;
    if(rolePromise)return rolePromise;
    const cap=capability();
    if(cap.length<16){roleCache={at:now,owner:false};return false;}

    rolePromise=(async()=>{
      try{
        const response=await fetch(DEVICE_ENDPOINT,{
          method:'POST',cache:'no-store',
          headers:{'content-type':'application/json','x-loky-device':cap},
          body:JSON.stringify({action:'status'})
        });
        const data=await response.json().catch(()=>({}));
        const owner=response.ok&&data?.ok===true&&data?.role==='owner';
        roleCache={at:Date.now(),owner};
        return owner;
      }catch{
        roleCache={at:Date.now(),owner:false};
        return false;
      }finally{rolePromise=null;}
    })();
    return rolePromise;
  }

  function injectStyles(){
    if(document.getElementById('lokyOwnerMeshy3dStyles'))return;
    const style=document.createElement('style');
    style.id='lokyOwnerMeshy3dStyles';
    style.textContent=`
      .loky-language-owner3d{position:absolute;left:0;top:3%;width:100%;height:88%;z-index:1;opacity:0;transition:opacity .28s ease;touch-action:none;outline:none}
      .loky-language-hero.loky-owner-3d-ready .loky-language-owner3d{opacity:1}
      .loky-language-hero.loky-owner-3d-ready .loky-language-avatar{opacity:0!important;pointer-events:none}
    `;
    document.head.appendChild(style);
  }

  function visualState(hero){
    const state=String(hero?.dataset?.state||'ready');
    return state==='listening'||state==='thinking'||state==='speaking'?state:'ready';
  }

  async function attach(hero){
    if(!hero||managed.has(hero))return managed.get(hero)?.promise||false;
    const record={avatar:null,observer:null,promise:null};
    managed.set(hero,record);

    record.promise=(async()=>{
      if(!await fetchOwnerRole())return false;
      if(!hero.isConnected)return false;
      if(!window.LOKY_MESHY_AVATAR_3D?.Avatar)return false;

      injectStyles();
      const canvas=document.createElement('canvas');
      canvas.className='loky-language-owner3d';
      canvas.setAttribute('aria-label','Asistente LOKY 3D Owner');
      canvas.dataset.ownerOnly='1';
      hero.appendChild(canvas);

      try{
        const avatar=new window.LOKY_MESHY_AVATAR_3D.Avatar(canvas,{
          onReady:stats=>{
            if(!hero.isConnected)return;
            hero.classList.add('loky-owner-3d-ready');
            hero.dataset.ownerMeshy3d='ready';
            hero.dataset.ownerMeshyTris=String(stats?.triangles||'');
          }
        });
        record.avatar=avatar;
        await avatar.loadBase64ChunkUrls(MODEL_CHUNKS);
        avatar.setState(visualState(hero));

        record.observer=new MutationObserver(()=>{
          if(!hero.isConnected){
            record.observer?.disconnect();
            avatar.stop?.();
            return;
          }
          avatar.setState(visualState(hero));
        });
        record.observer.observe(hero,{attributes:true,attributeFilter:['data-state']});
        return true;
      }catch(error){
        console.warn('LOKY Owner 3D fallback',error);
        hero.classList.remove('loky-owner-3d-ready');
        hero.dataset.ownerMeshy3d='fallback-2d';
        canvas.remove();
        record.avatar?.stop?.();
        return false;
      }
    })();

    return record.promise;
  }

  function scan(){
    document.querySelectorAll('.loky-language-hero').forEach(hero=>attach(hero));
  }

  const observer=new MutationObserver(scan);
  if(document.documentElement)observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan,{once:true});
  else scan();

  window.LOKY_MESHY_OWNER_3D={
    version:VERSION,
    modelChunks:[...MODEL_CHUNKS],
    ownerOnly:true,
    isOwner:fetchOwnerRole,
    attach,
    scan
  };
})();