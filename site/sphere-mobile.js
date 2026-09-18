(() => {
  'use strict';

  const VERSION='0.3.2R4F10R3R1-stronger-distortion';
  const STATE_VISUALS={
    idle:{code:0,color:[57/255,169/255,255/255],energy:.22,motion:.10},
    listening:{code:1,color:[66/255,215/255,255/255],energy:.36,motion:.34},
    thinking:{code:2,color:[153/255,108/255,255/255],energy:.42,motion:.52},
    speaking:{code:3,color:[70/255,230/255,196/255],energy:.72,motion:1.0},
    action:{code:4,color:[255/255,185/255,74/255],energy:.56,motion:.70},
  };

  const VERTEX = `#version 300 es
  precision highp float;
  uniform float uTime;
  uniform float uCount;
  uniform float uAspect;
  uniform float uPointSize;
  uniform float uEnergy;
  uniform float uMotion;
  uniform float uState;
  out float vDepth;
  void main(){
    float id=float(gl_VertexID);
    float y=1.0-2.0*(id+0.5)/uCount;
    float radius=sqrt(max(0.0,1.0-y*y));
    float angle=id*2.39996323;
    vec3 p=vec3(cos(angle)*radius,y,sin(angle)*radius);

    float phase=angle;
    float breath=0.015*sin(uTime*1.42)+0.006*sin(uTime*0.73+phase*.18);
    float wave=
      sin(p.x*10.0+p.y*6.0+uTime*2.8+phase)*0.50+
      sin(p.y*17.0-p.z*8.0-uTime*4.0+phase*1.7)*0.28+
      sin((p.x+p.z)*23.0+uTime*5.2+phase*2.2)*0.12;
    float energy=uEnergy*(0.012+0.018*wave);
    float speaking=step(2.5,uState);
    float activityRate=mix(2.6,7.4,speaking);
    float activity=uMotion*(
      sin(uTime*activityRate+phase*.24)*0.018+
      sin(uTime*(activityRate*1.61)-phase*.37)*0.010
    );
    float ripple=speaking*uMotion*
      sin(p.y*15.0-p.z*9.0+uTime*8.2+phase*.60)*0.028;

    // Stronger visible deformation only during real voice activity.
    // Listening idle stays calm; user speech deforms noticeably; LOKY speech is strongest.
    float activeWarp=smoothstep(0.62,0.94,uMotion);
    float warp=activeWarp*(0.034+speaking*0.020);
    p.x+=sin(p.y*8.5+uTime*6.4+phase*.31)*warp*(0.72+abs(p.z)*0.28);
    p.y+=sin(p.z*10.5-uTime*5.6+phase*.43)*warp*0.72;
    p.z+=sin(p.x*9.2+uTime*7.1-phase*.27)*warp*0.86;

    p*=1.0+breath+energy+activity+ripple;

    float spin=.20+uMotion*.055+speaking*.075;
    float c=cos(uTime*spin),s=sin(uTime*spin);
    p.xz=mat2(c,-s,s,c)*p.xz;
    float rx=.11*sin(uTime*.23),rz=.07*sin(uTime*.17);
    p.yz=mat2(cos(rx),-sin(rx),sin(rx),cos(rx))*p.yz;
    p.xy=mat2(cos(rz),-sin(rz),sin(rz),cos(rz))*p.xy;

    vDepth=clamp((p.z+1.0)*.5,0.0,1.0);
    vec3 eye=vec3(p.x/uAspect,p.y,p.z-3.55);
    float f=2.41421356;
    float near=.1,far=10.0;
    mat4 projection=mat4(
      f,0,0,0,
      0,f,0,0,
      0,0,(far+near)/(near-far),-1,
      0,0,2.0*far*near/(near-far),0
    );
    gl_Position=projection*vec4(eye,1.0);
    gl_PointSize=uPointSize*(.52+vDepth*.72)*(3.55/-eye.z);
  }`;

  const FRAGMENT = `#version 300 es
  precision highp float;
  uniform vec3 uColor;
  uniform float uBrightness;
  in float vDepth;
  out vec4 color;
  void main(){
    float r=length(gl_PointCoord-vec2(.5))*2.0;
    if(r>1.0)discard;
    float glow=exp(-r*r*4.8)*(.16+.84*vDepth);
    vec3 c=uColor*uBrightness;
    color=vec4(c,glow*.82);
  }`;

  class MobileSphere {
    constructor(canvas){
      this.canvas=canvas;
      this.gl=null;
      this.program=null;
      this.raf=0;
      this.running=false;
      this.startTime=performance.now();
      this.frames=0;
      this.lastFrame=0;
      this.slowFrames=0;
      this.energy=0.22;
      this.targetEnergy=0.22;
      this.motion=0.10;
      this.targetMotion=0.10;
      this.visualState='idle';
      this.stateCode=0;
      this.color=STATE_VISUALS.idle.color.slice();
      this.targetColor=STATE_VISUALS.idle.color.slice();
      this.touchBoost=0;
      this.count=15000;
      this.dprCap=1.75;
      this.pointSize=3.15;
      this.boundFrame=this.frame.bind(this);
      this.onVisibility=this.onVisibility.bind(this);
      this.onResize=this.resize.bind(this);
    }

    compile(type,source){
      const gl=this.gl;
      const sh=gl.createShader(type);
      gl.shaderSource(sh,source);
      gl.compileShader(sh);
      if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){
        throw new Error(gl.getShaderInfoLog(sh)||'shader_compile_failed');
      }
      return sh;
    }

    init(){
      const gl=this.gl=this.canvas.getContext('webgl2',{
        alpha:true,
        antialias:false,
        depth:false,
        stencil:false,
        premultipliedAlpha:true,
        preserveDrawingBuffer:false,
        powerPreference:'high-performance'
      });
      if(!gl) throw new Error('webgl2_unavailable');

      const vs=this.compile(gl.VERTEX_SHADER,VERTEX);
      const fs=this.compile(gl.FRAGMENT_SHADER,FRAGMENT);
      const program=this.program=gl.createProgram();
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
      gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
        throw new Error(gl.getProgramInfoLog(program)||'program_link_failed');
      }

      this.uniforms={};
      for(const name of ['uTime','uCount','uAspect','uPointSize','uEnergy','uMotion','uState','uColor','uBrightness']){
        this.uniforms[name]=gl.getUniformLocation(program,name);
      }
      this.vao=gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);

      this.resize();
      addEventListener('resize',this.onResize,{passive:true});
      document.addEventListener('visibilitychange',this.onVisibility,{passive:true});
      this.canvas.addEventListener('pointerdown',()=>{this.touchBoost=.24},{passive:true});
      this.canvas.addEventListener('pointerup',()=>{this.touchBoost=0},{passive:true});
      this.canvas.addEventListener('pointercancel',()=>{this.touchBoost=0},{passive:true});
      return true;
    }

    resize(){
      const r=this.canvas.getBoundingClientRect();
      const dpr=Math.min(this.dprCap,Math.max(1,devicePixelRatio||1));
      const w=Math.max(1,Math.round(r.width*dpr));
      const h=Math.max(1,Math.round(r.height*dpr));
      if(this.canvas.width!==w)this.canvas.width=w;
      if(this.canvas.height!==h)this.canvas.height=h;
      if(this.gl)this.gl.viewport(0,0,w,h);
    }

    onVisibility(){
      if(document.hidden)this.stop();
      else this.start();
    }

    start(){
      if(this.running)return;
      this.running=true;
      this.lastFrame=performance.now();
      this.raf=requestAnimationFrame(this.boundFrame);
    }

    stop(){
      this.running=false;
      if(this.raf)cancelAnimationFrame(this.raf);
      this.raf=0;
    }

    resolveVisualState(){
      const live=window.LOKY_PC4_LIVE?.state;
      const label=String(document.getElementById('conversationState')?.textContent||'').trim().toUpperCase();

      if(live?.userSpeaking)return {name:'listening',activeUser:true};
      if((live?.playing?.size||0)>0||label==='LOKY HABLANDO')return {name:'speaking',activeUser:false};
      if(label==='PENSANDO')return {name:'thinking',activeUser:false};
      if(live?.desired&&live?.setupReady)return {name:'listening',activeUser:false};
      return {name:'idle',activeUser:false};
    }

    syncVisualTargets(){
      const resolved=this.resolveVisualState();
      const visual=STATE_VISUALS[resolved.name]||STATE_VISUALS.idle;
      this.visualState=resolved.name;
      this.stateCode=visual.code;
      this.targetColor=visual.color;
      this.targetEnergy=Math.min(1,visual.energy+(resolved.activeUser?.20:0)+this.touchBoost);
      this.targetMotion=Math.min(1,visual.motion+(resolved.activeUser?.42:0));
      this.canvas.dataset.voiceVisualState=this.visualState;
      this.canvas.dataset.userSpeaking=resolved.activeUser?'1':'0';
    }

    frame(now){
      if(!this.running)return;
      const gl=this.gl;
      const dt=Math.min(80,now-this.lastFrame||16.7);
      this.lastFrame=now;
      this.syncVisualTargets();
      this.energy+=(this.targetEnergy-this.energy)*(1-Math.exp(-dt/130));
      this.motion+=(this.targetMotion-this.motion)*(1-Math.exp(-dt/150));
      const colorEase=1-Math.exp(-dt/180);
      for(let i=0;i<3;i++)this.color[i]+=(this.targetColor[i]-this.color[i])*colorEase;

      // Conservative adaptive guard for iPhone thermals/frame pressure.
      if(dt>29)this.slowFrames++;
      else this.slowFrames=Math.max(0,this.slowFrames-1);
      if(this.slowFrames>24 && this.count>9000){
        this.count=this.count===15000?12000:9000;
        this.dprCap=Math.max(1.25,this.dprCap-.15);
        this.slowFrames=0;
        this.resize();
        dispatchEvent(new CustomEvent('loky:sphere-quality',{detail:{count:this.count}}));
      }

      const t=(now-this.startTime)/1000;
      gl.viewport(0,0,this.canvas.width,this.canvas.height);
      gl.clearColor(0,0,0,0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);
      gl.uniform1f(this.uniforms.uTime,t);
      gl.uniform1f(this.uniforms.uCount,this.count);
      gl.uniform1f(this.uniforms.uAspect,this.canvas.width/Math.max(1,this.canvas.height));
      gl.uniform1f(this.uniforms.uPointSize,this.pointSize*Math.min(1.65,devicePixelRatio||1));
      gl.uniform1f(this.uniforms.uEnergy,this.energy);
      gl.uniform1f(this.uniforms.uMotion,this.motion);
      gl.uniform1f(this.uniforms.uState,this.stateCode);
      gl.uniform3f(this.uniforms.uColor,this.color[0],this.color[1],this.color[2]);
      gl.uniform1f(this.uniforms.uBrightness,this.visualState==='speaking'?1.18:1.12);
      gl.drawArrays(gl.POINTS,0,this.count);
      this.frames++;
      this.raf=requestAnimationFrame(this.boundFrame);
    }

    stats(){
      return {
        renderer:'WebGL2 Mobile',
        particles:this.count,
        frames:this.frames,
        dprCap:this.dprCap,
        running:this.running,
        voiceVisualState:this.visualState,
        version:VERSION
      };
    }
  }

  window.LokyMobileSphere={MobileSphere};
})();
