(() => {
  'use strict';

  const VERSION='0.3.2R4F1R1-timing-fix';
  const MEMORY_KEY='loky_pc4_mobile_memory_v1';
  const MEMORY_LIMIT=12;
  const MEMORY_TEXT_LIMIT=140;
  const MEMORY_CONTEXT_LIMIT=1200;
  const SILENCE_SENTINEL=Number.MAX_SAFE_INTEGER;

  const live=window.LOKY_PC4_LIVE;
  const liveState=live?.state||null;
  const body=document.body;
  const conversationState=document.getElementById('conversationState');
  const userTranscript=document.getElementById('userTranscript');
  const conversationShell=document.querySelector('.conversation-shell');

  let silenced=false;
  let rawSuppress=liveState?.suppressPlaybackUntil||0;
  let lastUserTurn='';

  function normalize(text){
    return String(text||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9ñ\s]/g,' ')
      .replace(/\s+/g,' ').trim();
  }

  function isSilenceCommand(text){
    const n=normalize(text);
    return /^(?:loky\s+)?silencio$/.test(n);
  }

  function isResumeCommand(text){
    const n=normalize(text);
    return /^(?:loky\s+)?hablame$/.test(n);
  }

  function isStableMemoryCandidate(text){
    const raw=String(text||'').trim();
    const n=normalize(raw);
    if(!n||raw.includes('?')||raw.includes('¿'))return false;
    if(isSilenceCommand(n)||isResumeCommand(n))return false;
    if(/^(que|cual|cuales|como|cuando|donde|por que|porque|quien|quienes|puedes|podrias|dime|explica|explicame|busca|haz|abre|cierra|continua|sigue)\b/.test(n))return false;

    return /^(?:mi\s+nombre\s+es|mi\s+.+\s+(?:es|son)\s+|mis\s+.+\s+(?:es|son)\s+|me\s+gusta(?:n)?\s+|prefiero\s+|soy\s+|tengo\s+|vivo\s+en\s+|trabajo\s+en\s+|recuerda\s+que\s+|quiero\s+que\s+recuerdes\s+que\s+)/.test(n);
  }

  function loadMemory(){
    try{
      const parsed=JSON.parse(localStorage.getItem(MEMORY_KEY)||'[]');
      if(!Array.isArray(parsed))return [];
      return parsed.filter(x=>x&&typeof x.text==='string').slice(-MEMORY_LIMIT);
    }catch{
      return [];
    }
  }

  function saveMemory(items){
    try{localStorage.setItem(MEMORY_KEY,JSON.stringify(items.slice(-MEMORY_LIMIT)))}catch{}
  }

  const memory={
    snapshot(){return loadMemory().map(x=>({...x}));},
    clear(){try{localStorage.removeItem(MEMORY_KEY)}catch{}},
    remember(text){
      const clean=String(text||'').trim().replace(/\s+/g,' ');
      if(clean.length<3||!isStableMemoryCandidate(clean))return false;
      const clipped=clean.slice(0,MEMORY_TEXT_LIMIT);
      const items=loadMemory().filter(x=>isStableMemoryCandidate(x.text));
      if(items.some(x=>normalize(x.text)===normalize(clipped)))return false;
      items.push({text:clipped,at:Date.now()});
      saveMemory(items);
      return true;
    },
    context(){
      const items=loadMemory().filter(x=>isStableMemoryCandidate(x.text));
      if(!items.length)return '';
      const lines=[];
      let used=0;
      for(let i=items.length-1;i>=0;i--){
        const line=`- ${items[i].text}`;
        if(used+line.length+1>MEMORY_CONTEXT_LIMIT)break;
        lines.unshift(line);
        used+=line.length+1;
      }
      return lines.length
        ? `Memoria local persistente del usuario (úsala sólo cuando sea relevante y no la menciones como sistema):\n${lines.join('\n')}`
        : '';
    }
  };

  function stopQueuedPlayback(){
    const playing=liveState?.playing;
    if(playing?.forEach){
      playing.forEach(source=>{try{source.stop()}catch{}});
      try{playing.clear()}catch{}
    }
    if(liveState){
      liveState.playCursor=liveState.audioContext?.currentTime||0;
    }
  }

  function silence(){
    if(silenced)return;
    silenced=true;
    stopQueuedPlayback();
    if(liveState)rawSuppress=liveState.suppressPlaybackUntil||0;
    body?.classList.add('loky-silenced');
  }

  function resume(){
    if(!silenced)return;
    silenced=false;
    rawSuppress=0;
    if(liveState)liveState.suppressPlaybackUntil=0;
    body?.classList.remove('loky-silenced');
  }

  // Isolated output gate only. The frozen R4 Conversation Core remains byte-exact.
  // While the user is speaking, old model audio is never allowed to start playing.
  if(liveState){
    const desc=Object.getOwnPropertyDescriptor(liveState,'suppressPlaybackUntil');
    if(!desc||desc.configurable!==false){
      Object.defineProperty(liveState,'suppressPlaybackUntil',{
        configurable:true,
        enumerable:true,
        get(){
          return (silenced||liveState.userSpeaking===true)
            ? SILENCE_SENTINEL
            : rawSuppress;
        },
        set(value){rawSuppress=Number(value)||0;}
      });
    }
  }

  function handlePhrase(text){
    if(isResumeCommand(text)){
      resume();
      return true;
    }
    if(isSilenceCommand(text)){
      silence();
      return true;
    }
    return false;
  }

  function captureFinishedTurn(){
    const text=String(userTranscript?.textContent||'').trim();
    if(!text||text==='—'||text===lastUserTurn)return;
    lastUserTurn=text;
    if(handlePhrase(text))return;
    memory.remember(text);
  }

  if(userTranscript){
    new MutationObserver(()=>{
      const text=String(userTranscript.textContent||'').trim();
      handlePhrase(text);
    }).observe(userTranscript,{childList:true,subtree:true,characterData:true});
  }

  if(conversationState){
    new MutationObserver(()=>{
      if(String(conversationState.textContent||'').trim()==='PENSANDO')captureFinishedTurn();
    }).observe(conversationState,{childList:true,subtree:true,characterData:true});
  }

  // Memory may alter only the one setup frame. Realtime PCM frames bypass this
  // feature layer completely so Safari's audio hot path stays identical to R4.
  const nativeSend=WebSocket.prototype.send;
  WebSocket.prototype.send=function(data){
    if(
      typeof data!=='string'||
      !data.startsWith('{"setup":')||
      !String(this.url||'').includes('BidiGenerateContentConstrained')
    ){
      return nativeSend.call(this,data);
    }

    try{
      const parsed=JSON.parse(data);
      const resumeHandle=parsed?.setup?.sessionResumption?.handle||'';
      if(parsed?.setup&&!resumeHandle){
        const context=memory.context();
        if(context){
          parsed.setup.systemInstruction=parsed.setup.systemInstruction||{parts:[]};
          parsed.setup.systemInstruction.parts=Array.isArray(parsed.setup.systemInstruction.parts)
            ? parsed.setup.systemInstruction.parts
            : [];
          parsed.setup.systemInstruction.parts.push({text:context});
          data=JSON.stringify(parsed);
        }
      }
    }catch{}
    return nativeSend.call(this,data);
  };

  const slots=[];
  if(conversationShell){
    for(let i=1;i<=4;i++){
      const button=document.createElement('button');
      button.type='button';
      button.className=`future-op-button future-op-${i}`;
      button.dataset.slot=String(i);
      button.setAttribute('aria-label',`Operación futura ${i}`);
      button.setAttribute('title',`Operación futura ${i}`);
      button.disabled=true;
      conversationShell.appendChild(button);
      slots.push(button);
    }
  }

  window.LOKY_PC4_FEATURES={
    version:VERSION,
    get silenced(){return silenced;},
    silence,
    resume,
    handlePhrase,
    isStableMemoryCandidate,
    memory,
    slots,
  };
})();
