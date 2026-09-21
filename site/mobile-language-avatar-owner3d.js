(() => {
  'use strict';
  const VERSION = '0.3.2R4F12R8R12-owner-rig-v2-axisfix';

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

  function identity4(){
    return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  }
  function copy16(src,start=0){
    const out=new Float32Array(16);
    for(let i=0;i<16;i++)out[i]=src[start+i];
    return out;
  }
  function fromTRS(t,r,s){
    const x=r[0]||0,y=r[1]||0,z=r[2]||0,w=r[3]??1;
    const x2=x+x,y2=y+y,z2=z+z;
    const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
    const sx=s[0]??1,sy=s[1]??1,sz=s[2]??1;
    return new Float32Array([
      (1-(yy+zz))*sx,(xy+wz)*sx,(xz-wy)*sx,0,
      (xy-wz)*sy,(1-(xx+zz))*sy,(yz+wx)*sy,0,
      (xz+wy)*sz,(yz-wx)*sz,(1-(xx+yy))*sz,0,
      t[0]||0,t[1]||0,t[2]||0,1
    ]);
  }
  function invert4(a){
    const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7],a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11,b04=a01*a13-a03*a11,b05=a02*a13-a03*a12,b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
    let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if(!det)throw new Error('Matriz singular');
    det=1/det;
    return new Float32Array([
      (a11*b11-a12*b10+a13*b09)*det,(-a01*b11+a02*b10-a03*b09)*det,(a31*b05-a32*b04+a33*b03)*det,(-a21*b05+a22*b04-a23*b03)*det,
      (-a10*b11+a12*b08-a13*b07)*det,(a00*b11-a02*b08+a03*b07)*det,(-a30*b05+a32*b02-a33*b01)*det,(a20*b05-a22*b02+a23*b01)*det,
      (a10*b10-a11*b08+a13*b06)*det,(-a00*b10+a01*b08-a03*b06)*det,(a30*b04-a31*b02+a33*b00)*det,(-a20*b04+a21*b02-a23*b00)*det,
      (-a10*b09+a11*b07-a12*b06)*det,(a00*b09-a01*b07+a02*b06)*det,(-a30*b03+a31*b01-a32*b00)*det,(a20*b03-a21*b01+a22*b00)*det
    ]);
  }
  function quatNlerp(a,b,t){
    let bx=b[0],by=b[1],bz=b[2],bw=b[3];
    if(a[0]*bx+a[1]*by+a[2]*bz+a[3]*bw<0){bx=-bx;by=-by;bz=-bz;bw=-bw;}
    let x=a[0]+(bx-a[0])*t,y=a[1]+(by-a[1])*t,z=a[2]+(bz-a[2])*t,w=a[3]+(bw-a[3])*t;
    const l=Math.hypot(x,y,z,w)||1;
    return [x/l,y/l,z/l,w/l];
  }
  function sampleQuat(track,t){
    const times=track.times,values=track.values,count=times.length;
    if(count<=1||t<=times[0])return [values[0],values[1],values[2],values[3]];
    if(t>=times[count-1]){const o=(count-1)*4;return [values[o],values[o+1],values[o+2],values[o+3]];}
    let lo=0,hi=count-1;
    while(hi-lo>1){const m=(lo+hi)>>1;if(times[m]<=t)lo=m;else hi=m;}
    const o=lo*4,n=hi*4;
    if(track.interpolation==='STEP')return [values[o],values[o+1],values[o+2],values[o+3]];
    const u=(t-times[lo])/Math.max(1e-6,times[hi]-times[lo]);
    return quatNlerp([values[o],values[o+1],values[o+2],values[o+3]],[values[n],values[n+1],values[n+2],values[n+3]],u);
  }
  function buildRig(gltf,bin,meshIndex){
    const meshNode=gltf.nodes?.findIndex(n=>n.mesh===meshIndex&&Number.isInteger(n.skin));
    if(meshNode==null||meshNode<0)return null;
    const skinIndex=gltf.nodes[meshNode].skin,skin=gltf.skins?.[skinIndex];
    if(!skin?.joints?.length||skin.joints.length>24||skin.inverseBindMatrices==null)return null;
    const ib=accessorData(gltf,bin,skin.inverseBindMatrices);
    if(ib.size!==16||ib.count!==skin.joints.length)throw new Error('Rig bind inválido');
    const parent=new Int16Array(gltf.nodes.length); parent.fill(-1);
    gltf.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>{parent[c]=i;}));
    const base=gltf.nodes.map(n=>({
      matrix:Array.isArray(n.matrix)?new Float32Array(n.matrix):null,
      t:new Float32Array(n.translation||[0,0,0]),
      r:new Float32Array(n.rotation||[0,0,0,1]),
      s:new Float32Array(n.scale||[1,1,1])
    }));
    const tracks=new Map();
    let duration=0;
    const anim=gltf.animations?.[0];
    if(anim){
      for(const ch of anim.channels||[]){
        if(ch.target?.path!=='rotation')continue;
        const sm=anim.samplers?.[ch.sampler]; if(!sm)continue;
        const ti=accessorData(gltf,bin,sm.input),vo=accessorData(gltf,bin,sm.output);
        if(ti.size!==1||vo.size!==4)continue;
        duration=Math.max(duration,ti.array[ti.array.length-1]||0);
        tracks.set(ch.target.node,{times:ti.array,values:vo.array,interpolation:sm.interpolation||'LINEAR'});
      }
    }
    const names=skin.joints.map(i=>gltf.nodes[i]?.name||'');
    return {
      meshNode,jointNodes:skin.joints.slice(),jointNames:names,parent,base,tracks,duration:Math.max(duration,2.5),
      inverseBind:ib.array,locals:new Array(gltf.nodes.length),globals:new Array(gltf.nodes.length),
      jointMatrices:new Float32Array(skin.joints.length*16)
    };
  }
  function updateRig(rig,sec,state){
    if(!rig)return null;
    const amp=state==='speaking'?1.00:state==='listening'?0.90:state==='thinking'?0.62:0.78;
    const speed=state==='speaking'?0.82:state==='listening'?0.64:state==='thinking'?0.38:0.52;
    const t=(sec*speed)%rig.duration;
    for(let i=0;i<rig.base.length;i++){
      const b=rig.base[i];
      if(b.matrix){rig.locals[i]=new Float32Array(b.matrix);continue;}
      let q=b.r;
      const tr=rig.tracks.get(i);
      if(tr)q=quatNlerp(b.r,sampleQuat(tr,t),amp);
      rig.locals[i]=fromTRS(b.t,q,b.s);
      rig.globals[i]=null;
    }
    const globalAt=i=>{
      if(rig.globals[i])return rig.globals[i];
      const p=rig.parent[i];
      rig.globals[i]=p>=0?mul(globalAt(p),rig.locals[i]):rig.locals[i];
      return rig.globals[i];
    };
    for(let i=0;i<rig.locals.length;i++)globalAt(i);
    const invMesh=invert4(rig.globals[rig.meshNode]);
    for(let j=0;j<rig.jointNodes.length;j++){
      const a=mul(invMesh,rig.globals[rig.jointNodes[j]]);
      const m=mul(a,copy16(rig.inverseBind,j*16));
      rig.jointMatrices.set(m,j*16);
    }
    return rig.jointMatrices;
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
  function components(type){ return type==='SCALAR'?1:type==='VEC2'?2:type==='VEC3'?3:type==='VEC4'?4:type==='MAT2'?4:type==='MAT3'?9:type==='MAT4'?16:1; }
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
      this.canvas=canvas; this.opts=opts; this.state='ready'; this.yaw=0; this.pitch=0.02; this.focusZ=0.02; this.distance=3.62; this.drag=null; this.touchDistance=0; this.last=performance.now(); this.running=false;
      this.gl=canvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:false});
      if(!this.gl) throw new Error('WebGL2 no disponible');
      this._bindInput();
    }
    async _loadArrayBuffer(ab,t0=performance.now()){
      const {json,bin}=parseGLB(ab); const meshIndex=0,prim=json.meshes?.[meshIndex]?.primitives?.[0]; if(!prim) throw new Error('Sin malla');
      const P=accessorData(json,bin,prim.attributes.POSITION), N=accessorData(json,bin,prim.attributes.NORMAL), U=accessorData(json,bin,prim.attributes.TEXCOORD_0), I=accessorData(json,bin,prim.indices);
      const J=prim.attributes.JOINTS_0!=null?accessorData(json,bin,prim.attributes.JOINTS_0):null;
      const W=prim.attributes.WEIGHTS_0!=null?accessorData(json,bin,prim.attributes.WEIGHTS_0):null;
      const rig=J&&W?buildRig(json,bin,meshIndex):null;
      if(!rig||!J||!W)throw new Error('RIG_SKIN_MISSING');
      const mat=json.materials?.[prim.material||0]||{}; const baseTexIndex=mat.pbrMetallicRoughness?.baseColorTexture?.index ?? 0; const imageIndex=json.textures?.[baseTexIndex]?.source ?? 0;
      const image=await imageFromBufferView(json,bin,imageIndex);
      this._setup(P,N,U,I,image,J,W,rig);
      this.stats={bytes:ab.byteLength,vertices:P.count,triangles:Math.floor(I.count/3),joints:rig.jointNodes.length,loadMs:performance.now()-t0};
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
        let text='',lastError=null;
        for(let attempt=0;attempt<3&&!text;attempt++){
          try{
            const r=await fetch(url,{cache:'no-store'});
            if(!r.ok)throw new Error('MODEL_CHUNK_'+r.status);
            text=(await r.text()).trim();
            if(!text)throw new Error('MODEL_CHUNK_EMPTY');
          }catch(error){
            lastError=error;
            if(attempt<2)await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));
          }
        }
        if(!text)throw lastError||new Error('MODEL_CHUNK_FAILED');
        const raw=atob(text);
        const bytes=new Uint8Array(raw.length);
        for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
        pieces.push(bytes); total+=bytes.byteLength;
      }
      const all=new Uint8Array(total); let off=0;
      for(const bytes of pieces){all.set(bytes,off);off+=bytes.byteLength;}
      return this._loadArrayBuffer(all.buffer,t0);
    }
    _setup(P,N,U,I,image,J,W,rig){
      const gl=this.gl;
      const vs=`#version 300 es\nprecision highp float;\nlayout(location=0) in vec3 aPos;\nlayout(location=1) in vec3 aNormal;\nlayout(location=2) in vec2 aUV;\nlayout(location=3) in uvec4 aJoints;\nlayout(location=4) in vec4 aWeights;\nuniform mat4 uMVP; uniform mat4 uModel; uniform mat4 uJoints[24];\nout vec3 vN; out vec2 vUV; out vec3 vWorld;\nvoid main(){\n mat4 skin=aWeights.x*uJoints[int(aJoints.x)]+aWeights.y*uJoints[int(aJoints.y)]+aWeights.z*uJoints[int(aJoints.z)]+aWeights.w*uJoints[int(aJoints.w)];\n vec3 p=(skin*vec4(aPos,1.0)).xyz;\n vec3 sn=normalize((skin*vec4(aNormal,0.0)).xyz);\n vec4 w=uModel*vec4(p,1.0); vWorld=w.xyz; vN=normalize(mat3(uModel)*sn); vUV=aUV; gl_Position=uMVP*vec4(p,1.0);\n}`;
      const fs=`#version 300 es\nprecision highp float;\nin vec3 vN; in vec2 vUV; in vec3 vWorld;\nuniform sampler2D uBase; uniform float uSpeak; uniform float uThink; uniform vec3 uCamera;\nout vec4 outColor;\nvoid main(){\n vec4 tex=texture(uBase,vUV); if(tex.a<0.05) discard; vec3 c=pow(max(tex.rgb,vec3(0.0)),vec3(2.2));\n vec3 n=normalize(vN); vec3 v=normalize(uCamera-vWorld);\n float facing=max(dot(n,v),0.0);\n vec3 topLight=normalize(vec3(-0.28,0.12,0.95));\n float d=0.24 + facing*0.68 + max(dot(n,topLight),0.0)*0.14;\n float rim=pow(1.0-facing,3.4);\n float cyanSignal=max(min(tex.g,tex.b)-tex.r*1.25,0.0);\n float cyan=smoothstep(0.055,0.24,cyanSignal)*smoothstep(0.14,0.48,max(tex.g,tex.b));\n vec3 lit=c*d + vec3(0.015,0.07,0.10)*rim*(0.12+uThink*0.08) + vec3(0.015,0.20,0.34)*cyan*(0.48+uSpeak*0.25);\n lit=lit/(lit+vec3(1.0)); lit=pow(lit,vec3(1.0/2.2)); outColor=vec4(lit,tex.a);\n}`;
      this.prog=program(gl,vs,fs); gl.useProgram(this.prog);
      this.loc={mvp:gl.getUniformLocation(this.prog,'uMVP'),model:gl.getUniformLocation(this.prog,'uModel'),base:gl.getUniformLocation(this.prog,'uBase'),speak:gl.getUniformLocation(this.prog,'uSpeak'),think:gl.getUniformLocation(this.prog,'uThink'),camera:gl.getUniformLocation(this.prog,'uCamera'),joints:gl.getUniformLocation(this.prog,'uJoints[0]')};
      this.vao=gl.createVertexArray(); gl.bindVertexArray(this.vao);
      const bind=(loc,data,size)=>{const b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);};
      bind(0,P.array,3); bind(1,N.array,3); bind(2,U.array,2);
      const jb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,jb); gl.bufferData(gl.ARRAY_BUFFER,J.array,gl.STATIC_DRAW); gl.enableVertexAttribArray(3); const jt=J.componentType===5121?gl.UNSIGNED_BYTE:J.componentType===5123?gl.UNSIGNED_SHORT:gl.UNSIGNED_INT; gl.vertexAttribIPointer(3,4,jt,0,0);
      bind(4,W.array,4);
      this.rig=rig;
      const ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,I.array,gl.STATIC_DRAW); this.indexType=I.componentType===5125?gl.UNSIGNED_INT:I.componentType===5123?gl.UNSIGNED_SHORT:gl.UNSIGNED_BYTE; this.indexCount=I.count;
      this.tex=gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,image.width,image.height,0,gl.RGBA,gl.UNSIGNED_BYTE,image); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); gl.uniform1i(this.loc.base,0);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      this.bounds={min:P.min||[-.33,-.2,-.96],max:P.max||[.33,.2,.96]};
    }
    setState(state){ this.state=state||'ready'; }
    _bindInput(){
      const c=this.canvas;
      const surface=this.opts.gestureSurface||c;
      const blocked=e=>Boolean(e?.target?.closest?.('button,select,input,textarea,a,[role="button"],.loky-language-config'));
      const opts={passive:false,capture:true};

      surface.addEventListener('pointerdown',e=>{
        if(blocked(e)||e.pointerType==='touch')return;
        this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:this.yaw,focusZ:this.focusZ};
      },true);
      surface.addEventListener('pointermove',e=>{
        if(blocked(e)||e.pointerType==='touch'||!this.drag||this.drag.id!==e.pointerId)return;
        this.yaw=this.drag.yaw-(e.clientX-this.drag.x)*0.006;
        this.focusZ=clamp(this.drag.focusZ+(e.clientY-this.drag.y)*0.0024,-0.78,0.82);
        e.preventDefault();
      },opts);
      surface.addEventListener('pointerup',e=>{if(this.drag?.id===e.pointerId)this.drag=null;},true);
      surface.addEventListener('wheel',e=>{
        if(blocked(e))return;
        e.preventDefault();
        this.distance=clamp(this.distance*Math.exp(e.deltaY*0.001),1.10,5.6);
      },opts);

      let touchDrag=null;
      const points=e=>[...e.touches].map(t=>[t.clientX,t.clientY]);
      surface.addEventListener('touchstart',e=>{
        if(blocked(e))return;
        const a=points(e);
        if(a.length===1){
          touchDrag={x:a[0][0],y:a[0][1],yaw:this.yaw,focusZ:this.focusZ};
          this.touchDistance=0;
        }else if(a.length===2){
          touchDrag=null;
          this.touchDistance=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);
        }
        if(a.length)e.preventDefault();
      },opts);
      surface.addEventListener('touchmove',e=>{
        if(blocked(e))return;
        const a=points(e);
        if(a.length===1&&touchDrag){
          this.yaw=touchDrag.yaw-(a[0][0]-touchDrag.x)*0.008;
          this.focusZ=clamp(touchDrag.focusZ+(a[0][1]-touchDrag.y)*0.0026,-0.78,0.82);
        }else if(a.length===2){
          const d=Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);
          if(this.touchDistance)this.distance=clamp(this.distance*(this.touchDistance/Math.max(1,d)),1.10,5.6);
          this.touchDistance=d;
          touchDrag=null;
        }
        if(a.length)e.preventDefault();
      },opts);
      surface.addEventListener('touchend',e=>{
        if(blocked(e))return;
        const a=points(e);
        if(a.length===1){
          touchDrag={x:a[0][0],y:a[0][1],yaw:this.yaw,focusZ:this.focusZ};
        }else{
          touchDrag=null;
          this.touchDistance=0;
        }
        e.preventDefault();
      },opts);
      surface.addEventListener('touchcancel',e=>{
        touchDrag=null;
        this.touchDistance=0;
        if(!blocked(e))e.preventDefault();
      },opts);
    }
    _resize(){
      const dpr=Math.min(devicePixelRatio||1,2), w=Math.max(1,Math.floor(this.canvas.clientWidth*dpr)), h=Math.max(1,Math.floor(this.canvas.clientHeight*dpr));
      if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
      this.gl.viewport(0,0,w,h); return [w,h];
    }
    _frame(t){
      if(!this.running)return; const gl=this.gl,[w,h]=this._resize(); const sec=t*0.001;
      const active=!this.drag; const idleYaw=active?Math.sin(sec*0.42)*0.012:0; const speaking=this.state==='speaking'?0.5+0.5*Math.sin(sec*7.2):0; const thinking=this.state==='thinking'?0.5+0.5*Math.sin(sec*2.1):0; const jointMatrices=updateRig(this.rig,sec,this.state);
      const yaw=this.yaw+idleYaw; const dist=this.distance; const pitch=this.pitch; const focusZ=this.focusZ; const eye=[Math.sin(yaw)*dist,-Math.cos(yaw)*dist*Math.cos(pitch),focusZ+Math.sin(pitch)*dist];
      const proj=perspective(31*Math.PI/180,w/h,0.05,20); const view=lookAt(eye,[0,0,focusZ],[0,0,1]); const model=modelMatrix(0,1,1); const mvp=mul(proj,mul(view,model));
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT); gl.useProgram(this.prog); gl.bindVertexArray(this.vao); gl.uniformMatrix4fv(this.loc.mvp,false,mvp); gl.uniformMatrix4fv(this.loc.model,false,model); gl.uniform1f(this.loc.speak,speaking); gl.uniform1f(this.loc.think,thinking); if(!jointMatrices)throw new Error('RIG_FRAME_MISSING'); gl.uniformMatrix4fv(this.loc.joints,false,jointMatrices); gl.uniform3f(this.loc.camera,eye[0],eye[1],eye[2]); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.tex); gl.drawElements(gl.TRIANGLES,this.indexCount,this.indexType,0);
      requestAnimationFrame(x=>this._frame(x));
    }
    stop(){ this.running=false; }
  }

  window.LOKY_MESHY_AVATAR_3D={VERSION,Avatar:LokyMeshyAvatar3D};
})();


(() => {
  'use strict';

  const VERSION='0.3.2R4F12R8R12-owner-rig-v2-axisfix';
  const DEVICE_KEY='loky_pc4_device_capability_v1';
  const DEVICE_ENDPOINT='https://novgwydgcvlboujnmygq.supabase.co/functions/v1/loky-pc4-mobile-devices';
  const MODEL_CHUNKS=Array.from({length:18},(_,i)=>`./assets/owner3d-rig-v2/chunk_${String(i).padStart(3,'0')}.txt?v=rigv2-ebc82865`);
  const ROLE_TRUE_TTL_MS=5*60_000;
  const ROLE_FALSE_TTL_MS=4_000;
  const OWNER_HINT_KEY='loky_pc4_owner3d_hint_v1';
  const RETRY_MS=4200;
  const MAX_ATTACH_RETRIES=3;
  const managed=new WeakMap();
  let roleCache={at:0,owner:false};
  let rolePromise=null;

  function capability(){
    try{return String(localStorage.getItem(DEVICE_KEY)||'')}catch{return ''}
  }

  function ownerHint(){
    try{return localStorage.getItem(OWNER_HINT_KEY)==='1'}catch{return false}
  }
  function setOwnerHint(owner){
    try{
      if(owner)localStorage.setItem(OWNER_HINT_KEY,'1');
      else localStorage.removeItem(OWNER_HINT_KEY);
    }catch{}
    document.documentElement?.classList.toggle('loky-owner3d-hint',Boolean(owner));
  }

  async function fetchOwnerRole({force=false}={}){
    const now=Date.now();
    const ttl=roleCache.owner?ROLE_TRUE_TTL_MS:ROLE_FALSE_TTL_MS;
    if(!force&&now-roleCache.at<ttl)return roleCache.owner;
    if(rolePromise)return rolePromise;
    const cap=capability();
    if(cap.length<16){roleCache={at:now,owner:false};setOwnerHint(false);return false;}

    rolePromise=(async()=>{
      const response=await fetch(DEVICE_ENDPOINT,{
        method:'POST',cache:'no-store',
        headers:{'content-type':'application/json','x-loky-device':cap},
        body:JSON.stringify({action:'status'})
      });
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data?.ok===true){
        const owner=data?.role==='owner';
        roleCache={at:Date.now(),owner};
        setOwnerHint(owner);
        return owner;
      }
      if(response.status===401||response.status===403){
        roleCache={at:Date.now(),owner:false};
        setOwnerHint(false);
        return false;
      }
      throw new Error(`OWNER_STATUS_${response.status}_${String(data?.error||'FAILED')}`);
    })().finally(()=>{rolePromise=null;});
    return rolePromise;
  }

  function injectStyles(){
    if(document.getElementById('lokyOwnerMeshy3dStyles'))return;
    const style=document.createElement('style');
    style.id='lokyOwnerMeshy3dStyles';
    style.textContent=`
      .loky-language-owner3d{position:absolute;left:0;top:3%;width:100%;height:88%;z-index:1;opacity:0;transition:opacity .28s ease;touch-action:none;outline:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
      .loky-owner3d-hint .loky-language-avatar{display:none!important}
      .loky-language-hero.loky-owner-3d-ready .loky-language-owner3d{opacity:1}\n      .loky-language-hero.loky-owner-3d-ready::after{pointer-events:none}
      .loky-language-owner3d-status{position:absolute;z-index:7;left:50%;top:15%;transform:translateX(-50%);padding:5px 9px;border-radius:999px;border:1px solid rgba(95,220,245,.22);background:rgba(3,18,27,.78);color:#9eeeff;font:800 7px/1.1 system-ui;letter-spacing:.08em;white-space:nowrap;pointer-events:none}
      .loky-language-owner3d-status.is-error{color:#ffb3ab;border-color:rgba(255,120,110,.28)}
    `;
    document.head.appendChild(style);
  }

  function visualState(hero){
    const state=String(hero?.dataset?.state||'ready');
    return state==='listening'||state==='thinking'||state==='speaking'?state:'ready';
  }

  function ownerStatus(hero,text,{error=false,hideAfter=0}={}){
    let badge=hero?.querySelector?.('.loky-language-owner3d-status');
    if(!badge&&hero){
      badge=document.createElement('div');
      badge.className='loky-language-owner3d-status';
      hero.appendChild(badge);
    }
    if(!badge)return null;
    badge.textContent=text;
    badge.classList.toggle('is-error',error);
    if(hideAfter>0)setTimeout(()=>badge?.remove(),hideAfter);
    return badge;
  }

  function removeOwner2D(hero){
    if(!hero)return;
    hero.querySelectorAll('.loky-language-avatar').forEach(node=>node.remove());
    hero.classList.remove('is-fallback');
    hero.dataset.ownerAvatar='3d-only';
  }

  async function attach(hero){
    if(!hero||!hero.isConnected)return false;
    const existing=managed.get(hero);
    if(existing?.loading||existing?.ready)return existing.promise||existing.ready;

    const record=existing||{avatar:null,observer:null,promise:null,attempts:0,loading:false,ready:false};
    managed.set(hero,record);
    record.loading=true;

    record.promise=(async()=>{
      let isOwner=false;
      try{
        isOwner=await fetchOwnerRole();
      }catch(error){
        record.loading=false;
        hero.dataset.ownerMeshy3d='owner-check-retry';
        if(record.attempts<MAX_ATTACH_RETRIES){
          record.attempts++;
          setTimeout(()=>{managed.delete(hero);if(hero.isConnected)attach(hero);},RETRY_MS);
        }
        return false;
      }

      if(!isOwner){
        record.loading=false;
        hero.dataset.ownerMeshy3d='not-owner';
        return false;
      }
      if(!hero.isConnected){record.loading=false;return false;}
      removeOwner2D(hero);
      if(!window.LOKY_MESHY_AVATAR_3D?.Avatar){
        record.loading=false;
        hero.dataset.ownerMeshy3d='runtime-missing';
        ownerStatus(hero,'3D OWNER · RUNTIME',{error:true});
        return false;
      }

      injectStyles();
      ownerStatus(hero,'3D OWNER · CARGANDO');
      const canvas=document.createElement('canvas');
      canvas.className='loky-language-owner3d';
      canvas.setAttribute('aria-label','Asistente LOKY 3D Owner');
      canvas.dataset.ownerOnly='1';
      hero.appendChild(canvas);

      try{
        const avatar=new window.LOKY_MESHY_AVATAR_3D.Avatar(canvas,{
          gestureSurface:hero.closest('.loky-language-overlay')||hero,
          onReady:stats=>{
            if(!hero.isConnected)return;
            hero.classList.add('loky-owner-3d-ready');
            hero.dataset.ownerMeshy3d='ready';
            hero.dataset.ownerMeshyTris=String(stats?.triangles||'');
            hero.dataset.ownerMeshyRig='v1';
            hero.dataset.ownerMeshyJoints=String(stats?.joints||'');
            ownerStatus(hero,'3D OWNER · LISTO',{hideAfter:1600});
          }
        });
        record.avatar=avatar;
        await avatar.loadBase64ChunkUrls(MODEL_CHUNKS);
        avatar.setState(visualState(hero));
        record.ready=true;
        record.loading=false;

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
        const code=String(error?.message||error||'3D_ERROR').slice(0,42);
        console.warn('LOKY Owner 3D error',error);
        hero.classList.remove('loky-owner-3d-ready');
        hero.dataset.ownerMeshy3d='error-3d';
        canvas.remove();
        record.avatar?.stop?.();
        record.loading=false;
        record.ready=false;
        ownerStatus(hero,`3D OWNER · ${code}`,{error:true});
        if(record.attempts<MAX_ATTACH_RETRIES&&/MODEL_CHUNK|fetch|network|load/i.test(code)){
          record.attempts++;
          setTimeout(()=>{managed.delete(hero);if(hero.isConnected)attach(hero);},RETRY_MS);
        }
        return false;
      }
    })();

    return record.promise;
  }

  function scan(){
    document.querySelectorAll('.loky-language-hero').forEach(hero=>attach(hero));
  }

  if(ownerHint()){
    document.documentElement?.classList.add('loky-owner3d-hint');
    injectStyles();
  }
  fetchOwnerRole().then(owner=>{
    setOwnerHint(owner);
    if(owner)injectStyles();
  }).catch(()=>{});

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