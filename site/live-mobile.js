(() => {
  'use strict';

  // PC4 Conversation Port for Mobile.
  // Desktop is read-only reference. This file is the only Mobile runtime owner
  // of mic -> attention/VAD -> Gemini Live -> PCM playback.
  const VERSION='0.3.2R4F10R3-turn-end-guard';
  const TOKEN_ENDPOINT='https://novgwydgcvlboujnmygq.supabase.co/functions/v1/loky-pc4-mobile-token';
  const DEFAULT_MODEL='models/gemini-3.8-live';
  const DEVICE_KEY='loky_pc4_device_capability_v1';
  const WS_BASE='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

  // Google recommends small realtime chunks. 2048 @ 48 kHz ~= 42.7 ms.
  const MIC_BUFFER_SIZE=2048;
  const CONNECT_TIMEOUT_MS=12000;
  const SETUP_TIMEOUT_MS=8000;

  // Mobile equivalent of the protected PC4 Attention layer.
  // Gemini automatic VAD is disabled; this owner decides real turn boundaries.
  const PRE_ROLL_CHUNKS=4;
  const START_FRAMES_IDLE=3;
  const START_FRAMES_BARGE=2;
  const END_SILENCE_MS=850; // Match the proven PC4 iOS long-pause guard; prevents mid-sentence turn cuts.
  const MIN_START_RMS=0.012;
  const MIN_BARGE_RMS=0.026;
  const MIN_END_RMS=0.007;
  const BARGE_PLAYBACK_SUPPRESS_MS=260;
  const HANDOVER_TAIL_CHUNKS=5;

  const state={
    desired:false,
    activeWs:null,
    pendingWs:null,
    token:null,
    tokenAt:0,
    model:DEFAULT_MODEL,
    resumeHandle:'',
    reconnectTimer:0,
    goAwayTimer:0,
    retryAttempt:0,
    connectTimer:0,
    setupTimer:0,

    mediaStream:null,
    audioContext:null,
    micSource:null,
    micProcessor:null,
    micMute:null,

    playCursor:0,
    playing:new Set(),
    setupReady:false,
    suppressPlaybackUntil:0,

    // Attention/VAD state.
    noiseFloor:0.005,
    playbackLeakFloor:0.012,
    startFrames:0,
    silenceMs:0,
    userSpeaking:false,
    speechStartedAt:0,
    preRoll:[],
    handoverTail:[],
    transcriptBuffer:'',
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

  function cleanPair(value){
    return String(value||'').trim().toUpperCase();
  }

  function deviceCapability(){
    return localStorage.getItem(DEVICE_KEY)||'';
  }

  function paired(){
    return deviceCapability().length>=16;
  }

  function importPairFromUrl(){
    try{
      const url=new URL(location.href);
      const pair=cleanPair(url.searchParams.get('pair'));
      if(pair.length>=16){
        localStorage.setItem(DEVICE_KEY,pair);
        url.searchParams.delete('pair');
        history.replaceState({},'',url.pathname+(url.search||'')+url.hash);
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
    let out='';
    const step=0x8000;
    for(let i=0;i<bytes.length;i+=step){
      out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+step,bytes.length)));
    }
    return btoa(out);
  }

  function base64ToInt16(base64){
    const bin=atob(base64);
    const count=Math.floor(bin.length/2);
    const out=new Int16Array(count);
    for(let i=0;i<count;i++){
      const lo=bin.charCodeAt(i*2);
      const hi=bin.charCodeAt(i*2+1);
      let value=(hi<<8)|lo;
      if(value&0x8000)value-=0x10000;
      out[i]=value;
    }
    return out;
  }

  function downsampleTo16k(input,inputRate){
    if(inputRate===16000)return input;
    const ratio=inputRate/16000;
    const length=Math.max(1,Math.floor(input.length/ratio));
    const out=new Float32Array(length);
    for(let i=0;i<length;i++){
      const start=Math.floor(i*ratio);
      const end=Math.max(start+1,Math.min(input.length,Math.floor((i+1)*ratio)));
      let sum=0;
      for(let j=start;j<end;j++)sum+=input[j];
      out[i]=sum/(end-start);
    }
    return out;
  }

  function floatToPcm16Bytes(float32){
    const bytes=new Uint8Array(float32.length*2);
    const view=new DataView(bytes.buffer);
    for(let i=0;i<float32.length;i++){
      const sample=Math.max(-1,Math.min(1,float32[i]));
      view.setInt16(i*2,sample<0?sample*0x8000:sample*0x7fff,true);
    }
    return bytes;
  }

  function rmsLevel(input){
    if(!input?.length)return 0;
    let sum=0;
    for(let i=0;i<input.length;i++)sum+=input[i]*input[i];
    return Math.sqrt(sum/input.length);
  }

  function pushBounded(list,value,max){
    list.push(value);
    while(list.length>max)list.shift();
  }

  function sendRealtime(ws,payload){
    if(ws?.readyState!==WebSocket.OPEN)return false;
    try{
      ws.send(JSON.stringify({realtimeInput:payload}));
      return true;
    }catch{
      return false;
    }
  }

  function sendAudio(ws,base64){
    if(!base64)return false;
    return sendRealtime(ws,{
      audio:{data:base64,mimeType:'audio/pcm;rate=16000'},
    });
  }

  function beginUserActivity(ws,fromPlayback=false){
    if(state.userSpeaking||ws?.readyState!==WebSocket.OPEN)return;

    state.userSpeaking=true;
    state.speechStartedAt=performance.now();
    state.silenceMs=0;
    state.startFrames=0;
    state.transcriptBuffer='';

    // PC4 behavior: a real user turn owns the channel immediately.
    if(fromPlayback||state.playing.size>0){
      state.suppressPlaybackUntil=Date.now()+BARGE_PLAYBACK_SUPPRESS_MS;
      clearPlayback();
      setState('ESCUCHANDO','Interrupción detectada');
    }

    sendRealtime(ws,{activityStart:{}});

    // Preserve the first syllable by replaying the pre-roll accumulated by Attention.
    for(const chunk of state.preRoll)sendAudio(ws,chunk);
    state.handoverTail=state.preRoll.slice(-HANDOVER_TAIL_CHUNKS);
    state.preRoll=[];
  }

  function endUserActivity(ws){
    if(!state.userSpeaking)return;
    sendRealtime(ws,{activityEnd:{}});
    state.userSpeaking=false;
    state.speechStartedAt=0;
    state.silenceMs=0;
    state.startFrames=0;
    state.preRoll=[];
    state.handoverTail=[];
    setState('PENSANDO','');
  }

  function resetAttention(){
    state.noiseFloor=0.005;
    state.playbackLeakFloor=0.012;
    state.startFrames=0;
    state.silenceMs=0;
    state.userSpeaking=false;
    state.speechStartedAt=0;
    state.preRoll=[];
    state.handoverTail=[];
    state.transcriptBuffer='';
  }

  async function primeAudio(){
    const AudioContextCtor=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextCtor)throw new Error('AUDIO_CONTEXT_UNAVAILABLE');
    if(!state.audioContext){
      state.audioContext=new AudioContextCtor({latencyHint:'interactive'});
    }
    if(state.audioContext.state!=='running')await state.audioContext.resume();
  }

  async function ensureMic(){
    if(state.mediaStream?.active)return;
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('MIC_UNAVAILABLE');
    state.mediaStream=await navigator.mediaDevices.getUserMedia({
      audio:{
        echoCancellation:true,
        noiseSuppression:true,
        autoGainControl:true,
        channelCount:1,
      },
      video:false,
    });
  }

  function startCapture(){
    if(!state.audioContext||!state.mediaStream||state.micProcessor)return;
    const ctx=state.audioContext;
    state.micSource=ctx.createMediaStreamSource(state.mediaStream);
    state.micProcessor=ctx.createScriptProcessor(MIC_BUFFER_SIZE,1,1);
    state.micMute=ctx.createGain();
    state.micMute.gain.value=0;

    state.micProcessor.onaudioprocess=event=>{
      const ws=state.activeWs;
      if(!state.desired||!state.setupReady||ws?.readyState!==WebSocket.OPEN)return;

      const input=event.inputBuffer.getChannelData(0);
      const level=rmsLevel(input);
      const chunkMs=(input.length/ctx.sampleRate)*1000;
      const pcm=floatToPcm16Bytes(downsampleTo16k(input,ctx.sampleRate));
      const base64=bytesToBase64(pcm);
      const playbackActive=state.playing.size>0;

      if(state.userSpeaking){
        sendAudio(ws,base64);
        pushBounded(state.handoverTail,base64,HANDOVER_TAIL_CHUNKS);

        const endThreshold=Math.max(MIN_END_RMS,state.noiseFloor*1.65);
        if(level<=endThreshold){
          state.silenceMs+=chunkMs;
        }else{
          state.silenceMs=0;
        }

        if(state.silenceMs>=END_SILENCE_MS){
          endUserActivity(ws);
        }
        return;
      }

      pushBounded(state.preRoll,base64,PRE_ROLL_CHUNKS);

      // Learn separate idle and speaker-leak floors. This avoids treating
      // LOKY's own speaker audio as a user utterance such as an isolated “¿qué?”.
      if(playbackActive){
        state.playbackLeakFloor=(state.playbackLeakFloor*0.94)+(level*0.06);
      }else{
        state.noiseFloor=(state.noiseFloor*0.97)+(level*0.03);
      }

      const threshold=playbackActive
        ? Math.max(MIN_BARGE_RMS,state.playbackLeakFloor*1.75,state.noiseFloor*4.0)
        : Math.max(MIN_START_RMS,state.noiseFloor*2.8);
      const framesNeeded=playbackActive?START_FRAMES_BARGE:START_FRAMES_IDLE;

      if(level>=threshold){
        state.startFrames++;
      }else{
        state.startFrames=Math.max(0,state.startFrames-1);
      }

      if(state.startFrames>=framesNeeded){
        beginUserActivity(ws,playbackActive);
        // Current chunk is already present in pre-roll, so do not send it twice.
      }
    };

    state.micSource.connect(state.micProcessor);
    state.micProcessor.connect(state.micMute);
    state.micMute.connect(ctx.destination);
  }

  function stopCapture(){
    try{if(state.micProcessor)state.micProcessor.onaudioprocess=null}catch{}
    for(const node of [state.micSource,state.micProcessor,state.micMute]){
      try{node?.disconnect?.()}catch{}
    }
    state.micSource=null;
    state.micProcessor=null;
    state.micMute=null;
    for(const track of state.mediaStream?.getTracks?.()||[]){
      try{track.stop()}catch{}
    }
    state.mediaStream=null;
  }

  function clearPlayback(){
    for(const source of state.playing){
      try{source.stop()}catch{}
    }
    state.playing.clear();
    state.playCursor=state.audioContext?.currentTime||0;
  }

  function playPcm24k(base64){
    const ctx=state.audioContext;
    if(!ctx||ctx.state==='closed')return;
    if(Date.now()<state.suppressPlaybackUntil)return;

    const samples=base64ToInt16(base64);
    if(!samples.length)return;
    const buffer=ctx.createBuffer(1,samples.length,24000);
    const channel=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++)channel[i]=samples[i]/32768;

    const source=ctx.createBufferSource();
    source.buffer=buffer;
    source.connect(ctx.destination);

    const now=ctx.currentTime;
    if(state.playCursor<now)state.playCursor=now;
    // Tiny scheduling lead avoids gaps while keeping response latency low.
    const start=Math.max(now+0.010,state.playCursor);
    state.playCursor=start+buffer.duration;
    state.playing.add(source);
    source.onended=()=>state.playing.delete(source);
    source.start(start);
  }

  async function requestToken(force=false){
    const age=Date.now()-state.tokenAt;
    if(!force&&state.token&&age<28*60*1000){
      return {token:state.token,model:state.model};
    }

    const capability=deviceCapability();
    if(!capability)throw new Error('DEVICE_NOT_ACTIVATED');
    const response=await fetch(TOKEN_ENDPOINT,{
      method:'POST',
      headers:{'content-type':'application/json','x-loky-device':capability},
      body:'{}',
      cache:'no-store',
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.token)throw new Error(data?.error||`TOKEN_${response.status}`);

    state.token=data.token;
    state.tokenAt=Date.now();
    state.model=data.model||DEFAULT_MODEL;
    return {token:state.token,model:state.model};
  }

  function setupPayload(model,handle=''){
    return {
      setup:{
        model,
        generationConfig:{
          responseModalities:['AUDIO'],
          speechConfig:{
            voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}},
          },
        },
        systemInstruction:{
          parts:[{
            text:'Eres LOKY, un asistente de voz natural, cercano y eficiente. Habla principalmente en español salvo que el usuario cambie de idioma. Responde de forma conversacional, fluida y breve por defecto. Mantén siempre la misma identidad vocal y estilo de voz durante toda la sesión. Si una entrada es ruido o no contiene una intención comprensible, no inventes una respuesta. No menciones Gemini, modelos, APIs ni detalles técnicos salvo que el usuario los pregunte. Permite interrupciones naturales.',
          }],
        },
        inputAudioTranscription:{},
        outputAudioTranscription:{},
        realtimeInputConfig:{
          automaticActivityDetection:{disabled:true},
          activityHandling:'START_OF_ACTIVITY_INTERRUPTS',
          turnCoverage:'TURN_INCLUDES_ONLY_ACTIVITY',
        },
        contextWindowCompression:{slidingWindow:{}},
        sessionResumption:handle?{handle}:{},
      },
    };
  }

  function clearTimers(){
    clearTimeout(state.connectTimer);
    clearTimeout(state.setupTimer);
    state.connectTimer=0;
    state.setupTimer=0;
  }

  function clearReconnectTimers(){
    clearTimeout(state.reconnectTimer);
    clearTimeout(state.goAwayTimer);
    state.reconnectTimer=0;
    state.goAwayTimer=0;
  }

  function retryDelay(){
    return [120,250,500,900,1500][Math.min(state.retryAttempt,4)]||1500;
  }

  function scheduleRecovery(reason='socket-close'){
    if(!state.desired||state.pendingWs||state.reconnectTimer)return;
    const delay=retryDelay();
    state.reconnectTimer=setTimeout(()=>{
      state.reconnectTimer=0;
      state.retryAttempt++;
      resumeSession(reason).catch(error=>{
        console.warn('LOKY resume',error);
        if(state.desired)scheduleRecovery('retry');
      });
    },delay);
  }

  async function normalizeWsData(raw){
    if(raw instanceof Blob)return await raw.text();
    if(raw instanceof ArrayBuffer)return new TextDecoder().decode(raw);
    if(ArrayBuffer.isView(raw)){
      return new TextDecoder().decode(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
    }
    return String(raw??'');
  }

  function handleServerContent(content){
    if(!content)return;

    if(content.interrupted){
      state.suppressPlaybackUntil=Date.now()+120;
      clearPlayback();
      setState('ESCUCHANDO','Interrupción detectada');
    }

    const inputText=content.inputTranscription?.text;
    if(inputText){
      state.transcriptBuffer+=inputText;
      if(ui.me)ui.me.textContent=state.transcriptBuffer.slice(-240);
    }

    const outputText=content.outputTranscription?.text;
    if(outputText&&ui.loky){
      ui.loky.textContent=(ui.loky.textContent==='—'?'':ui.loky.textContent)+outputText;
    }

    for(const part of content.modelTurn?.parts||[]){
      const inline=part.inlineData;
      if(inline?.data&&String(inline.mimeType||'').includes('audio/pcm')){
        // A valid model turn now owns playback. If local barge-in is no longer active,
        // lift the short suppression guard and stream continuously.
        if(!state.userSpeaking)state.suppressPlaybackUntil=0;
        setState('LOKY HABLANDO','Puedes interrumpirlo cuando quieras');
        playPcm24k(inline.data);
      }
    }

    if(content.turnComplete){
      if(!state.userSpeaking){
        state.suppressPlaybackUntil=0;
        setState('ESCUCHANDO','Habla normalmente.');
      }
      if(ui.loky&&ui.loky.textContent.length>240){
        ui.loky.textContent=ui.loky.textContent.slice(-240);
      }
    }
  }

  function replaySpeakingHandover(ws){
    if(!state.userSpeaking||ws?.readyState!==WebSocket.OPEN)return;
    sendRealtime(ws,{activityStart:{}});
    for(const chunk of state.handoverTail)sendAudio(ws,chunk);
  }

  function promotePending(ws){
    if(state.pendingWs!==ws)return;
    const previous=state.activeWs;
    clearTimers();
    clearReconnectTimers();
    state.pendingWs=null;
    state.activeWs=ws;
    state.setupReady=true;
    state.retryAttempt=0;

    attachActiveHandlers(ws);
    replaySpeakingHandover(ws);
    setState(state.userSpeaking?'ESCUCHANDO':'ESCUCHANDO','Habla normalmente. Puedes interrumpir a LOKY.');
    setBadge('GEMINI LIVE · NATIVO',true);
    startCapture();

    if(ui.talk){
      ui.talk.textContent='DETENER';
      ui.talk.dataset.active='1';
    }

    // Do not clear already-scheduled PCM on a normal session handover: preserving
    // the queue avoids the audible cut/voice discontinuity seen in Mobile.
    if(previous&&previous!==ws){
      try{previous.close(1000,'session-handover')}catch{}
    }
  }

  async function handleSocketMessage(ws,role,raw){
    let message;
    try{message=JSON.parse(await normalizeWsData(raw))}catch{return}

    if(message.setupComplete){
      if(role==='pending')promotePending(ws);
      return;
    }

    const resume=message.sessionResumptionUpdate;
    if(resume?.resumable===true&&resume?.newHandle){
      state.resumeHandle=resume.newHandle;
    }else if(resume?.resumable===false){
      state.resumeHandle='';
    }

    if(message.goAway){
      if(role==='active'&&state.activeWs===ws){
        clearTimeout(state.goAwayTimer);
        // Prepare the replacement immediately while the active socket still serves audio.
        state.goAwayTimer=setTimeout(()=>{
          state.goAwayTimer=0;
          resumeSession('goaway').catch(error=>{
            console.warn('LOKY goaway resume',error);
            scheduleRecovery('goaway-failed');
          });
        },0);
      }
      return;
    }

    if(role==='active'&&state.activeWs===ws){
      handleServerContent(message.serverContent);
    }
  }

  function attachActiveHandlers(ws){
    ws.onmessage=event=>{
      handleSocketMessage(ws,'active',event.data).catch(error=>console.warn('LOKY active message',error));
    };
    ws.onerror=()=>{};
    ws.onclose=()=>{
      if(state.activeWs!==ws)return;
      state.activeWs=null;
      if(!state.desired)return;
      state.setupReady=false;
      setState('RECONECTANDO','Recuperando conversación…');
      setBadge('RECONECTANDO',false);
      if(!state.pendingWs)scheduleRecovery('socket-close');
    };
  }

  function attachPendingHandlers(ws){
    ws.onmessage=event=>{
      handleSocketMessage(ws,'pending',event.data).catch(error=>console.warn('LOKY pending message',error));
    };
    ws.onerror=()=>{};
    ws.onclose=()=>{
      if(state.pendingWs!==ws)return;
      clearTimers();
      state.pendingWs=null;
      if(!state.desired)return;
      scheduleRecovery('pending-close');
    };
  }

  async function openPending(auth,handle=''){
    if(state.pendingWs)return state.pendingWs;
    const ws=new WebSocket(`${WS_BASE}?access_token=${encodeURIComponent(auth.token)}`);
    ws.binaryType='arraybuffer';
    state.pendingWs=ws;

    await new Promise((resolve,reject)=>{
      let settled=false;
      state.connectTimer=setTimeout(()=>{
        if(settled)return;
        settled=true;
        reject(new Error('LIVE_CONNECT_TIMEOUT'));
      },CONNECT_TIMEOUT_MS);

      ws.onopen=()=>{
        if(settled)return;
        settled=true;
        clearTimeout(state.connectTimer);
        state.connectTimer=0;
        resolve();
      };
      ws.onerror=()=>{
        if(settled)return;
        settled=true;
        clearTimeout(state.connectTimer);
        state.connectTimer=0;
        reject(new Error('LIVE_WEBSOCKET_ERROR'));
      };
    });

    attachPendingHandlers(ws);
    ws.send(JSON.stringify(setupPayload(auth.model,handle)));

    state.setupTimer=setTimeout(()=>{
      state.setupTimer=0;
      if(state.pendingWs!==ws)return;
      state.pendingWs=null;
      try{ws.close()}catch{}
      scheduleRecovery('setup-timeout');
    },SETUP_TIMEOUT_MS);

    return ws;
  }

  async function startSession(){
    setState('CONECTANDO','Preparando conversación nativa…');
    setBadge('GEMINI LIVE · CONECTANDO',false);
    const auth=await requestToken(true);
    await openPending(auth,'');
  }

  async function resumeSession(reason='resume'){
    if(!state.desired||state.pendingWs)return;
    setState('RECONECTANDO',reason==='goaway'?'Renovando sesión…':'Recuperando conversación…');
    setBadge('RECONECTANDO',false);

    const handle=state.resumeHandle;
    try{
      const auth=await requestToken(false);
      await openPending(auth,handle);
    }catch(firstError){
      const pending=state.pendingWs;
      state.pendingWs=null;
      clearTimers();
      try{pending?.close()}catch{}
      if(!state.desired)throw firstError;
      const fresh=await requestToken(true);
      await openPending(fresh,handle);
    }
  }

  async function startLive(){
    if(!paired())return refreshActivation();
    state.desired=true;
    state.resumeHandle='';
    state.retryAttempt=0;
    state.setupReady=false;
    state.suppressPlaybackUntil=0;
    clearReconnectTimers();
    clearTimers();
    resetAttention();
    if(ui.me)ui.me.textContent='—';
    if(ui.loky)ui.loky.textContent='—';
    await primeAudio();
    await ensureMic();
    await startSession();
  }

  function stopLive(){
    state.desired=false;
    state.setupReady=false;
    state.resumeHandle='';
    state.retryAttempt=0;
    clearReconnectTimers();
    clearTimers();

    const active=state.activeWs;
    const pending=state.pendingWs;
    if(state.userSpeaking)endUserActivity(active);
    state.activeWs=null;
    state.pendingWs=null;

    try{active?.close(1000,'owner-stop')}catch{}
    try{pending?.close(1000,'owner-stop')}catch{}

    stopCapture();
    clearPlayback();
    resetAttention();
    if(ui.talk){
      ui.talk.textContent='HABLAR CON LOKY';
      ui.talk.dataset.active='0';
    }
    setState('LISTO','Toca HABLAR CON LOKY');
    setBadge('GEMINI LIVE · LISTO',true);
  }

  function failStart(error){
    console.error('LOKY Live',error);
    state.desired=false;
    state.setupReady=false;
    const pending=state.pendingWs;
    state.pendingWs=null;
    clearReconnectTimers();
    clearTimers();
    try{pending?.close()}catch{}
    stopCapture();
    clearPlayback();
    resetAttention();
    if(ui.talk){
      ui.talk.textContent='REINTENTAR';
      ui.talk.dataset.active='0';
    }
    setState('NO CONECTADO',String(error?.message||error));
    setBadge('LIVE · ERROR',false);
  }

  ui.activate?.addEventListener('click',()=>{
    const code=cleanPair(ui.pair?.value);
    if(code.length<16){
      setState('CÓDIGO INVÁLIDO','Revisa el código Owner');
      return;
    }
    localStorage.setItem(DEVICE_KEY,code);
    if(ui.pair)ui.pair.value='';
    refreshActivation();
  });

  ui.pair?.addEventListener('keydown',event=>{
    if(event.key==='Enter')ui.activate?.click();
  });

  ui.talk?.addEventListener('click',async()=>{
    if(state.desired){
      stopLive();
      return;
    }
    try{
      await startLive();
    }catch(error){
      failStart(error);
    }
  });

  addEventListener('pagehide',()=>{
    if(state.desired)stopLive();
  });

  importPairFromUrl();
  refreshActivation();

  window.LOKY_PC4_LIVE={
    version:VERSION,
    start:startLive,
    stop:stopLive,
    state,
  };
})();
