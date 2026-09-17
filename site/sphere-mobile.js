(() => {
  'use strict';

  const VERTEX = `#version 300 es
  precision highp float;
  uniform float uTime;
  uniform float uCount;
  uniform float uAspect;
  uniform float uPointSize;
  uniform float uEnergy;
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
    p*=1.0+breath+energy;

    float c=cos(uTime*.20),s=sin(uTime*.20);
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
      for(const name of ['uTime','uCount','uAspect','uPointSize','uEnergy','uColor','uBrightness']){
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
      this.canvas.addEventListener('pointerdown',()=>{this.targetEnergy=.62},{passive:true});
      this.canvas.addEventListener('pointerup',()=>{this.targetEnergy=.22},{passive:true});
      this.canvas.addEventListener('pointercancel',()=>{this.targetEnergy=.22},{passive:true});
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

    frame(now){
      if(!this.running)return;
      const gl=this.gl;
      const dt=Math.min(80,now-this.lastFrame||16.7);
      this.lastFrame=now;
      this.energy+=(this.targetEnergy-this.energy)*(1-Math.exp(-dt/130));

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
      gl.uniform3f(this.uniforms.uColor,.18,.69,.96);
      gl.uniform1f(this.uniforms.uBrightness,1.12);
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
        running:this.running
      };
    }
  }

  window.LokyMobileSphere={MobileSphere};
})();
