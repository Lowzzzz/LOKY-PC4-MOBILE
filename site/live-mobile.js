(() => {
  'use strict';

  const TOKEN_ENDPOINT='https://novgwydgcvlboujnmygq.supabase.co/functions/v1/loky-pc4-mobile-token';
  const DEFAULT_MODEL='models/gemini-3.8-live';
  const DEVICE_KEY='loky_pc4_device_capability_v1';
  const WS_BASE='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

  const state={
    desired:false,
    ws:null,
    token:null,
    tokenAt:0,
    model:DEFAULT_MODEL,
    resumeHandle:'',
    reconnectTimer:0,
    setupTimer:0,
    mediaStream:null,
    audioContext:null,
    micSource:null,
    micProcessor:null,
    micMute:null,
    playCursor:0,
    playing:new Set(),
    setupReady:false,
    connecting:false,
  };

  const $=id=>document.getElementById(id);
  const ui={
    talk:$('talkButton'),
    state:$('conversationState'),
    hint:$('conversationHint'),
    me:$('userTranscript'),
    loky:$('lokyTranscript'),
    activation:$('activationPanel'),
    pair:$('pairCode'),
    activate:$('activateButton'),
    liveBadge:$('liveBadge'),
  };

  function setState(label,hint){
    if(ui.state)ui.state.textContent=label;
    if(ui.hint&&hint!=null)ui.hint.textContent=hint;
  }
  function setBadge(text,ok=false){
    if(!ui.liveBadge)return;
    ui.liveBadge.textContent=text;
    ui.liveBadge.dataset.ok=ok?'1':'0';
  }
  function cleanPair(v){return String(v||'').trim().toUpperCase();}
  function deviceCapability(){return localStorage.getItem(DEVICE_KEY)||'';}
  function paired(){return deviceCapability().length>=16;}

  function importPairFromUrl(){
    try{
      const u=new URL(location.href);
      const p=cleanPair(u.searchParams.get('pair'));
      if(p.length>=16){
        localStorage.setItem(DEVICE_KEY,p);
        u.searchParams.delete('pair');
        history.replaceState({},'',u.pathname+(u.search||'')+u.hash);
      }
    }catch{}
  }

  function refreshActivation(){
    const ok=paired();
    ui.activation?.classList.toggle('hidden',ok);
    ui.talk?.classList.toggle('hidden',!ok);
    if(ok){
      setState('LISTO','Toca HABLAR CON LOKY');
      setBadge('GEMINI LIVE · LISTO',true);
    }else{
      setState('ACTIVAR DISPOSITIVO','Introduce el código Owner una sola vez');
      setBadge('ACTIVACIÓN REQUERIDA',false);
    }
  }

  function bytesToBase64(bytes){
    let s='';
    const step=0x8000;
    for(let i=0;i<bytes.length;i+=step){
      s+=String.fromCharCode(...bytes.subarray(i,Math.min(i+step,bytes.length)));
    }
    return btoa(s);
  }
  function base64ToInt16(base64){
    const bin=atob(base64);
    const count=Math.floor(bin.length/2);
    const out=new Int16Array(count);
    for(let i=0;i<count;i++){
      const lo=bin.charCodeAt(i*2),hi=bin.charCodeAt(i*2+1);
      let v=(hi<<8)|lo;
      if(v&0x8000)v-=0x10000;
      out[i]=v;
    }
    return out;
  }
  function downsampleTo16k(input,inputRate){
    if(inputRate===16000)return input;
    const ratio=inputRate/16000;
    const n=Math.max(1,Math.floor(input.length/ratio));
    const out=new Float32Array(n);
    for(let i=0;i<n;i++){
      const a=Math.floor(i*ratio),b=Math.max(a+1,Math.min(input.length,Math.floor((i+1)*ratio)));
      let sum=0;
      for(let j=a;j<b;j++)sum+=input[j];
      out[i]=sum/(b-a);
    }
    return out;
  }
  function floatToPcm16Bytes(float32){
    const bytes=new Uint8Array(float32.length*2);
    const view=new DataView(bytes.buffer);
    for(let i=0;i<float32.length;i++){
      const s=Math.max(-1,Math.min(1,float32[i]));
      view.setInt16(i*2,s<0?s*0x8000:s*0x7fff,true);
    }
    return bytes;
  }

  async function primeAudio(){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)throw new Error('AUDIO_CONTEXT_UNAVAILABLE');
    if(!state.audioContext)state.audioContext=new AC({latencyHint:'interactive'});
    if(state.audioContext.state!=='running')await state.audioContext.resume();
  }

  async function ensureMic(){
    if(state.mediaStream?.active)return;
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('MIC_UNAVAILABLE');
    state.mediaStream=await navigator.mediaDevices.getUserMedia({
      audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},
      video:false,
    });
  }

  function stopCapture(){
    try{state.micProcessor&&(state.micProcessor.onaudioprocess=null)}catch{}
    for(const n of [state.micSource,state.micProcessor,state.micMute]){try{n?.disconnect?.()}catch{}}
    state.micSource=state.micProcessor=state.micMute=null;
    for(const t of state.mediaStream?.getTracks?.()||[])try{t.stop()}catch{}
    state.mediaStream=null;
  }

  function startCapture(){
    if(!state.audioContext||!state.mediaStream||state.micProcessor)return;
    const ctx=state.audioContext;
    state.micSource=ctx.createMediaStreamSource(state.mediaStream);
    const processor=ctx.createScriptProcessor(4096,1,1);
    const mute=ctx.createGain();
    mute.gain.value=0;
    processor.onaudioprocess=e=>{
      if(!state.desired||!state.setupReady||state.ws?.readyState!==WebSocket.OPEN)return;
      const input=e.inputBuffer.getChannelData(0);
      const pcm=floatToPcm16Bytes(downsampleTo16k(input,ctx.sampleRate));
      try{
        state.ws.send(JSON.stringify({realtimeInput:{audio:{data:bytesToBase64(pcm),mimeType:'audio/pcm;rate=16000'}}}));
      }catch{}
    };
    state.micProcessor=processor;
    state.micMute=mute;
    state.micSource.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
  }

  function clearPlayback(){
    for(const src of state.playing){try{src.stop()}catch{}}
    state.playing.clear();
    state.playCursor=state.audioContext?.currentTime||0;
  }

  function playPcm24k(base64){
    const ctx=state.audioContext;
    if(!ctx||ctx.state==='closed')return;
    const samples=base64ToInt16(base64);
    if(!samples.length)return;
    const buffer=ctx.createBuffer(1,samples.length,24000);
    const channel=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++)channel[i]=samples[i]/32768;
    const src=ctx.createBufferSource();
    src.buffer=buffer;
    src.connect(ctx.destination);
    const start=Math.max(ctx.currentTime+0.015,state.playCursor||0);
    state.playCursor=start+buffer.duration;
    state.playing.add(src);
    src.onended=()=>state.playing.delete(src);
    src.start(start);
  }

  async function requestToken(force=false){
    if(!force&&state.token&&Date.now()-state.tokenAt<25*60*1000)return {token:state.token,model:state.model};
    const cap=deviceCapability();
    if(!cap)throw new Error('DEVICE_NOT_ACTIVATED');
    const r=await fetch(TOKEN_ENDPOINT,{method:'POST',headers:{'content-type':'application/json','x-loky-device':cap},body:'{}',cache:'no-store'});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||!data?.token)throw new Error(data?.error||`TOKEN_${r.status}`);
    state.token=data.token;
    state.tokenAt=Date.now();
    state.model=data.model||DEFAULT_MODEL;
    return {token:state.token,model:state.model};
  }

  function setupPayload(model){
    return {setup:{
      model,
      generationConfig:{
        responseModalities:['AUDIO'],
        speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}}},
      },
      systemInstruction:{parts:[{text:'Eres LOKY, un asistente de voz natural, cercano y eficiente. Habla principalmente en español salvo que el usuario cambie de idioma. Responde de forma conversacional, fluida y breve por defecto. No menciones Gemini, modelos, APIs ni detalles técnicos salvo que el usuario los pregunte. Permite interrupciones naturales y continúa la conversación sin frases robóticas de relleno.'}]},
      inputAudioTranscription:{},
      outputAudioTranscription:{},
      realtimeInputConfig:{
        automaticActivityDetection:{disabled:false,startOfSpeechSensitivity:'START_SENSITIVITY_HIGH',endOfSpeechSensitivity:'END_SENSITIVITY_HIGH',prefixPaddingMs:80,silenceDurationMs:450},
        activityHandling:'START_OF_ACTIVITY_INTERRUPTS',
        turnCoverage:'TURN_INCLUDES_ONLY_ACTIVITY',
      },
      sessionResumption:state.resumeHandle?{handle:state.resumeHandle}:{},
    }};
  }

  function scheduleReconnect(){
    if(!state.desired||state.reconnectTimer)return;
    state.reconnectTimer=setTimeout(()=>{
      state.reconnectTimer=0;
      connectLive(true).catch(failLive);
    },900);
  }

  async function normalizeWsData(raw){
    if(raw instanceof Blob)return await raw.text();
    if(raw instanceof ArrayBuffer)return new TextDecoder().decode(raw);
    if(ArrayBuffer.isView(raw))return new TextDecoder().decode(raw.buffer);
    return String(raw??'');
  }

  async function parseServer(raw){
    let msg;
    try{msg=JSON.parse(await normalizeWsData(raw))}catch{return}
    if(msg.setupComplete){
      clearTimeout(state.setupTimer);state.setupTimer=0;
      state.setupReady=true;
      setState('ESCUCHANDO','Habla normalmente. Puedes interrumpir a LOKY.');
      setBadge('GEMINI LIVE · NATIVO',true);
      startCapture();
      ui.talk.textContent='DETENER';
      ui.talk.dataset.active='1';
      return;
    }
    const resume=msg.sessionResumptionUpdate;
    if(resume?.newHandle)state.resumeHandle=resume.newHandle;
    if(msg.goAway){
      setState('RECONECTANDO','Renovando sesión…');
      scheduleReconnect();
    }
    const sc=msg.serverContent;
    if(!sc)return;
    if(sc.interrupted){
      clearPlayback();
      setState('ESCUCHANDO','Interrupción detectada');
    }
    const inputText=sc.inputTranscription?.text||sc.interimInputTranscription?.text;
    if(inputText&&ui.me)ui.me.textContent=inputText;
    const outputText=sc.outputTranscription?.text;
    if(outputText&&ui.loky)ui.loky.textContent=(ui.loky.textContent==='—'?'':ui.loky.textContent)+outputText;
    for(const part of sc.modelTurn?.parts||[]){
      const inline=part.inlineData;
      if(inline?.data&&String(inline.mimeType||'').includes('audio/pcm')){
        setState('LOKY HABLANDO','Puedes interrumpirlo cuando quieras');
        playPcm24k(inline.data);
      }
    }
    if(sc.turnComplete){
      setState('ESCUCHANDO','Habla normalmente.');
      if(ui.loky&&ui.loky.textContent.length>240)ui.loky.textContent=ui.loky.textContent.slice(-240);
    }
  }

  async function connectLive(resume=false){
    if(state.connecting)return;
    state.connecting=true;
    state.setupReady=false;
    clearTimeout(state.setupTimer);state.setupTimer=0;
    try{
      setState(resume?'RECONECTANDO':'CONECTANDO','Preparando conversación nativa…');
      // Every WebSocket session consumes a one-use ephemeral token. Reconnects
      // must request a fresh token while preserving the session resume handle.
      const auth=await requestToken(true);
      const ws=new WebSocket(`${WS_BASE}?access_token=${encodeURIComponent(auth.token)}`);
      ws.binaryType='arraybuffer';
      state.ws=ws;
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('LIVE_CONNECT_TIMEOUT')),12000);
        ws.onopen=()=>{clearTimeout(timer);resolve()};
        ws.onerror=()=>{clearTimeout(timer);reject(new Error('LIVE_WEBSOCKET_ERROR'))};
      });
      ws.onmessage=e=>{parseServer(e.data).catch(failLive)};
      ws.onerror=()=>{};
      ws.onclose=()=>{
        clearTimeout(state.setupTimer);state.setupTimer=0;
        state.setupReady=false;
        if(state.desired){setBadge('RECONECTANDO',false);scheduleReconnect()}
      };
      ws.send(JSON.stringify(setupPayload(auth.model)));
      state.setupTimer=setTimeout(()=>{
        state.setupTimer=0;
        if(state.desired&&!state.setupReady)failLive(new Error('LIVE_SETUP_TIMEOUT'));
      },8000);
    }finally{state.connecting=false}
  }

  async function startLive(){
    if(!paired())return refreshActivation();
    state.desired=true;
    ui.me&&(ui.me.textContent='—');
    ui.loky&&(ui.loky.textContent='—');
    await primeAudio();
    await ensureMic();
    await connectLive(false);
  }

  function stopLive(){
    state.desired=false;
    state.setupReady=false;
    clearTimeout(state.reconnectTimer);state.reconnectTimer=0;
    clearTimeout(state.setupTimer);state.setupTimer=0;
    try{state.ws?.send(JSON.stringify({realtimeInput:{audioStreamEnd:true}}))}catch{}
    try{state.ws?.close(1000,'owner-stop')}catch{}
    state.ws=null;
    stopCapture();
    clearPlayback();
    ui.talk.textContent='HABLAR CON LOKY';
    ui.talk.dataset.active='0';
    setState('LISTO','Toca HABLAR CON LOKY');
    setBadge('GEMINI LIVE · LISTO',true);
  }

  function failLive(error){
    console.error('LOKY Live',error);
    state.desired=false;
    state.setupReady=false;
    clearTimeout(state.setupTimer);state.setupTimer=0;
    stopCapture();
    clearPlayback();
    try{state.ws?.close()}catch{}
    state.ws=null;
    ui.talk.textContent='REINTENTAR';
    ui.talk.dataset.active='0';
    setState('NO CONECTADO',String(error?.message||error));
    setBadge('LIVE · ERROR',false);
  }

  ui.activate?.addEventListener('click',()=>{
    const code=cleanPair(ui.pair?.value);
    if(code.length<16){setState('CÓDIGO INVÁLIDO','Revisa el código Owner');return}
    localStorage.setItem(DEVICE_KEY,code);
    if(ui.pair)ui.pair.value='';
    refreshActivation();
  });
  ui.pair?.addEventListener('keydown',e=>{if(e.key==='Enter')ui.activate?.click()});
  ui.talk?.addEventListener('click',async()=>{
    if(state.desired){stopLive();return}
    try{await startLive()}catch(error){failLive(error)}
  });
  addEventListener('pagehide',()=>{if(state.desired)stopLive()});

  importPairFromUrl();
  refreshActivation();
  window.LOKY_PC4_LIVE={start:startLive,stop:stopLive,state};
})();
