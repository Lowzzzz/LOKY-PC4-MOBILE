(() => {
  'use strict';

  const VERSION='0.3.2R4F2-settings-memory-windows';
  const MEMORY_KEY='loky_pc4_mobile_memory_v1';
  const SETTINGS_KEY='loky_pc4_mobile_settings_v1';
  const MEMORY_LIMIT=12;
  const MEMORY_TEXT_LIMIT=180;
  const MEMORY_CONTEXT_LIMIT=1200;
  const SILENCE_SENTINEL=Number.MAX_SAFE_INTEGER;
  const THINKING_GATE_MAX_MS=6500;
  const WINDOW_CLOSE_MS=280;

  const live=window.LOKY_PC4_LIVE;
  const liveState=live?.state||null;
  const body=document.body;
  const conversationState=document.getElementById('conversationState');
  const userTranscript=document.getElementById('userTranscript');
  const conversationShell=document.querySelector('.conversation-shell');

  let silenced=false;
  let rawSuppress=liveState?.suppressPlaybackUntil||0;
  let lastUserTurn='';
  let thinkingGateActive=false;
  let thinkingGateTimer=0;
  let activeWindow=null;

  const SPEECH_MODES={
    natural:{label:'Natural',description:'Mantiene la conversación actual de LOKY, fluida y cercana.',instruction:''},
    normal:{label:'Normal',description:'Lenguaje claro y equilibrado, sin exagerar el tono.',instruction:'Modo de hablar NORMAL: responde con lenguaje claro, equilibrado y cotidiano.'},
    direct:{label:'Directo',description:'Va al punto, con menos rodeos y respuestas más cortas.',instruction:'Modo de hablar DIRECTO: ve al punto, reduce rodeos y prioriza respuestas breves y concretas.'},
    vulgar:{label:'Vulgar',description:'Más callejero, con jerga y palabrotas cuando encajen naturalmente.',instruction:'Modo de hablar VULGAR: puedes usar lenguaje muy coloquial, jerga y palabrotas cuando encajen de forma natural. No conviertas cada respuesta en insultos; evita amenazas, humillación dirigida y lenguaje discriminatorio.'},
  };

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

    return /^(?:mi\s+nombre\s+es|mi\s+.+\s+(?:es|son)\s+|mis\s+.+\s+(?:es|son)\s+|me\s+gusta(?:n)?\s+|prefiero\s+|soy\s+|tengo\s+|vivo\s+|trabajo\s+|recuerda\s+que\s+|quiero\s+que\s+recuerdes\s+que\s+)/.test(n);
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
      const items=loadMemory();
      if(items.some(x=>normalize(x.text)===normalize(clipped)))return false;
      items.push({text:clipped,at:Date.now(),source:'auto'});
      saveMemory(items);
      return true;
    },
    addManual(text){
      const clean=String(text||'').trim().replace(/\s+/g,' ');
      if(clean.length<2||isSilenceCommand(clean)||isResumeCommand(clean))return false;
      const clipped=clean.slice(0,MEMORY_TEXT_LIMIT);
      const items=loadMemory();
      if(items.some(x=>normalize(x.text)===normalize(clipped)))return false;
      items.push({text:clipped,at:Date.now(),source:'manual'});
      saveMemory(items);
      return true;
    },
    forget(at){
      const before=loadMemory();
      const after=before.filter(x=>String(x.at)!==String(at));
      if(after.length===before.length)return false;
      saveMemory(after);
      return true;
    },
    context(){
      const items=loadMemory().filter(x=>x.source==='manual'||isStableMemoryCandidate(x.text));
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

  function loadSettings(){
    try{
      const parsed=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
      const speechMode=SPEECH_MODES[parsed?.speechMode]?parsed.speechMode:'natural';
      return {speechMode};
    }catch{
      return {speechMode:'natural'};
    }
  }

  function saveSettings(next){
    const speechMode=SPEECH_MODES[next?.speechMode]?next.speechMode:'natural';
    try{localStorage.setItem(SETTINGS_KEY,JSON.stringify({speechMode}))}catch{}
    return {speechMode};
  }

  const settings={
    snapshot(){return {...loadSettings()};},
    get speechMode(){return loadSettings().speechMode;},
    setSpeechMode(mode){
      if(!SPEECH_MODES[mode])return false;
      saveSettings({speechMode:mode});
      return true;
    },
    instruction(){
      const mode=loadSettings().speechMode;
      return SPEECH_MODES[mode]?.instruction||'';
    },
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

  function micTracks(){
    try{
      const stream=liveState?.mediaStream;
      if(!stream)return [];
      if(typeof stream.getAudioTracks==='function')return stream.getAudioTracks();
      if(typeof stream.getTracks==='function')return stream.getTracks().filter(t=>t?.kind==='audio');
    }catch{}
    return [];
  }

  function setMicEnabled(enabled){
    let changed=0;
    for(const track of micTracks()){
      try{
        if(track.readyState&&track.readyState!=='live')continue;
        if(track.enabled!==Boolean(enabled)){
          track.enabled=Boolean(enabled);
          changed++;
        }
      }catch{}
    }
    return changed;
  }

  function clearThinkingGate(){
    if(thinkingGateTimer){
      clearTimeout(thinkingGateTimer);
      thinkingGateTimer=0;
    }
    thinkingGateActive=false;
    setMicEnabled(true);
  }

  function enterThinkingGate(){
    if(silenced)return setMicEnabled(true);
    if(thinkingGateActive)return;
    thinkingGateActive=true;
    setMicEnabled(false);
    if(thinkingGateTimer)clearTimeout(thinkingGateTimer);
    thinkingGateTimer=setTimeout(()=>{
      thinkingGateTimer=0;
      if(!thinkingGateActive)return;
      thinkingGateActive=false;
      setMicEnabled(true);
    },THINKING_GATE_MAX_MS);
  }

  function syncThinkingGate(){
    const state=String(conversationState?.textContent||'').trim();
    if(silenced)return clearThinkingGate();
    if(state==='PENSANDO'){
      enterThinkingGate();
      return;
    }
    clearThinkingGate();
  }

  function silence(){
    if(silenced)return;
    silenced=true;
    clearThinkingGate();
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
    syncThinkingGate();
  }

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
      syncThinkingGate();
    }).observe(conversationState,{childList:true,subtree:true,characterData:true});
  }

  // Only the setup frame is inspected. PCM/realtime frames bypass this layer.
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
        const additions=[];
        const memoryContext=memory.context();
        const speechInstruction=settings.instruction();
        if(memoryContext)additions.push(memoryContext);
        if(speechInstruction)additions.push(speechInstruction);
        if(additions.length){
          parsed.setup.systemInstruction=parsed.setup.systemInstruction||{parts:[]};
          parsed.setup.systemInstruction.parts=Array.isArray(parsed.setup.systemInstruction.parts)
            ? parsed.setup.systemInstruction.parts
            : [];
          for(const text of additions)parsed.setup.systemInstruction.parts.push({text});
          data=JSON.stringify(parsed);
        }
      }
    }catch{}
    return nativeSend.call(this,data);
  };

  function make(tag,className,text){
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(text!=null)el.textContent=text;
    return el;
  }

  function closeFeatureWindow(immediate=false){
    const target=activeWindow;
    if(!target)return;
    activeWindow=null;
    body?.classList.remove('loky-window-open');
    if(immediate){
      try{target.remove()}catch{}
      return;
    }
    target.classList.remove('is-open');
    target.classList.add('is-closing');
    setTimeout(()=>{try{target.remove()}catch{}},WINDOW_CLOSE_MS);
  }

  function createFeatureWindow(kind,title,subtitle){
    closeFeatureWindow(true);
    const page=make('section',`loky-feature-window loky-${kind}-window`);
    page.setAttribute('role','dialog');
    page.setAttribute('aria-modal','true');
    page.setAttribute('aria-label',title);

    const header=make('header','loky-feature-header');
    const back=make('button','loky-window-back','‹');
    back.type='button';
    back.setAttribute('aria-label','Volver');
    back.addEventListener('click',()=>closeFeatureWindow(false));

    const brand=make('div','loky-window-brand');
    brand.appendChild(make('span','loky-window-brand-dot'));
    const brandCopy=make('div','loky-window-brand-copy');
    brandCopy.appendChild(make('strong','',title));
    brandCopy.appendChild(make('span','',subtitle));
    brand.appendChild(brandCopy);

    header.appendChild(back);
    header.appendChild(brand);
    header.appendChild(make('span','loky-window-spacer'));

    const content=make('div','loky-feature-content');
    page.appendChild(header);
    page.appendChild(content);
    body.appendChild(page);
    body.classList.add('loky-window-open');
    activeWindow=page;

    const raf=window.requestAnimationFrame||((fn)=>setTimeout(fn,0));
    raf(()=>page.classList.add('is-open'));
    return {page,content,close:()=>closeFeatureWindow(false)};
  }

  function sectionCard(title,subtitle){
    const card=make('section','loky-settings-card');
    const head=make('div','loky-card-head');
    const copy=make('div','loky-card-copy');
    copy.appendChild(make('strong','',title));
    if(subtitle)copy.appendChild(make('span','',subtitle));
    head.appendChild(copy);
    card.appendChild(head);
    return card;
  }

  function openSettingsWindow(){
    const {content}=createFeatureWindow('settings','CONFIGURACIÓN','Personaliza cómo se comporta LOKY');
    const card=sectionCard('MODO DE HABLAR','El cambio se aplica al iniciar una nueva conversación.');
    const modeList=make('div','loky-mode-list');

    function paintModes(){
      const current=settings.speechMode;
      for(const button of modeList.children||[]){
        button.classList.toggle('is-selected',button.dataset.mode===current);
        button.setAttribute('aria-pressed',String(button.dataset.mode===current));
      }
    }

    for(const [mode,meta] of Object.entries(SPEECH_MODES)){
      const button=make('button','loky-mode-option');
      button.type='button';
      button.dataset.mode=mode;
      const icon=make('span','loky-mode-dot');
      const copy=make('span','loky-mode-copy');
      copy.appendChild(make('strong','',meta.label));
      copy.appendChild(make('small','',meta.description));
      button.appendChild(icon);
      button.appendChild(copy);
      button.addEventListener('click',()=>{
        settings.setSpeechMode(mode);
        paintModes();
      });
      modeList.appendChild(button);
    }
    card.appendChild(modeList);
    content.appendChild(card);

    const future=sectionCard('MÁS AJUSTES','Espacio preparado para próximas funciones sin rehacer la interfaz.');
    const futureGrid=make('div','loky-future-grid');
    for(const label of ['VOZ','PERSONALIDAD','PRIVACIDAD','DISPOSITIVO']){
      const item=make('div','loky-future-card');
      item.appendChild(make('strong','',label));
      item.appendChild(make('span','','PRÓXIMAMENTE'));
      futureGrid.appendChild(item);
    }
    future.appendChild(futureGrid);
    content.appendChild(future);
    paintModes();
    return activeWindow;
  }

  function openMemoryWindow(){
    const {content}=createFeatureWindow('memory','MEMORIAS','Recuerdos y organización personal');
    const card=sectionCard('MEMORIAS GUARDADAS','Puedes añadir o borrar recuerdos manualmente.');
    const addRow=make('div','loky-memory-add');
    const input=make('input','loky-memory-input');
    input.type='text';
    input.maxLength=MEMORY_TEXT_LIMIT;
    input.placeholder='Escribe algo que LOKY deba recordar…';
    input.setAttribute('aria-label','Nueva memoria');
    const add=make('button','loky-memory-save','GUARDAR');
    add.type='button';
    addRow.appendChild(input);
    addRow.appendChild(add);
    card.appendChild(addRow);

    const list=make('div','loky-memory-list');
    card.appendChild(list);

    function renderMemories(){
      while(list.firstChild)list.removeChild(list.firstChild);
      const items=memory.snapshot().slice().reverse();
      if(!items.length){
        const empty=make('div','loky-memory-empty','Aún no hay memorias guardadas.');
        list.appendChild(empty);
        return;
      }
      for(const item of items){
        const row=make('div','loky-memory-row');
        const copy=make('div','loky-memory-text');
        copy.appendChild(make('span','',item.text));
        copy.appendChild(make('small','',item.source==='manual'?'MANUAL':'LOKY'));
        const remove=make('button','loky-memory-delete','×');
        remove.type='button';
        remove.setAttribute('aria-label','Eliminar memoria');
        remove.addEventListener('click',()=>{
          memory.forget(item.at);
          renderMemories();
        });
        row.appendChild(copy);
        row.appendChild(remove);
        list.appendChild(row);
      }
    }

    function addManualMemory(){
      if(memory.addManual(input.value)){
        input.value='';
        renderMemories();
      }
    }
    add.addEventListener('click',addManualMemory);
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter')addManualMemory();
    });
    renderMemories();
    content.appendChild(card);

    const organizer=sectionCard('ORGANIZACIÓN','Secciones preparadas para las próximas funciones.');
    const grid=make('div','loky-organizer-grid');
    const areas=[
      ['RECORDATORIOS','Avisos y tareas pendientes','R'],
      ['CALENDARIO','Eventos y agenda','C'],
      ['ALARMAS','Alarmas y temporizadores','A'],
      ['MÁS','Nuevas herramientas','+'],
    ];
    for(const [title,subtitle,icon] of areas){
      const item=make('button','loky-organizer-card');
      item.type='button';
      item.disabled=true;
      item.appendChild(make('span','loky-organizer-icon',icon));
      const copy=make('span','loky-organizer-copy');
      copy.appendChild(make('strong','',title));
      copy.appendChild(make('small','',subtitle));
      item.appendChild(copy);
      item.appendChild(make('em','','PRÓXIMAMENTE'));
      grid.appendChild(item);
    }
    organizer.appendChild(grid);
    content.appendChild(organizer);
    return activeWindow;
  }

  const slots=[];
  if(conversationShell){
    for(let i=1;i<=4;i++){
      const button=document.createElement('button');
      button.type='button';
      button.className=`future-op-button future-op-${i}`;
      button.dataset.slot=String(i);
      if(i===3){
        button.classList.add('is-action','feature-settings');
        button.disabled=false;
        button.setAttribute('aria-label','Configuración');
        button.setAttribute('title','Configuración');
        button.addEventListener('click',openSettingsWindow);
      }else if(i===4){
        button.classList.add('is-action','feature-memory');
        button.disabled=false;
        button.setAttribute('aria-label','Memorias');
        button.setAttribute('title','Memorias');
        button.addEventListener('click',openMemoryWindow);
      }else{
        button.disabled=true;
        button.setAttribute('aria-label',`Operación futura ${i}`);
        button.setAttribute('title',`Operación futura ${i}`);
      }
      conversationShell.appendChild(button);
      slots.push(button);
    }
  }

  syncThinkingGate();

  window.LOKY_PC4_FEATURES={
    version:VERSION,
    get silenced(){return silenced;},
    silence,
    resume,
    handlePhrase,
    isStableMemoryCandidate,
    memory,
    settings,
    speechModes:SPEECH_MODES,
    slots,
    windows:{
      openSettings:openSettingsWindow,
      openMemory:openMemoryWindow,
      close:closeFeatureWindow,
      get active(){return activeWindow;},
    },
    thinkingGate:{
      get active(){return thinkingGateActive;},
      sync:syncThinkingGate,
      setMicEnabled,
    },
  };
})();
