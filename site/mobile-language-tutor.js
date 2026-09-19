(() => {
  'use strict';

  const VERSION='0.3.2R4F12R6-language-visual-clean';
  const STORE_KEY='loky_pc4_language_tutor_v1';
  const STATS_KEY='loky_pc4_language_tutor_stats_v1';
  const AVATAR_URL='./language-avatar.webp?v=0.3.2r4f12r1';
  const ASSIST_ENDPOINT='https://novgwydgcvlboujnmygq.supabase.co/functions/v1/loky-pc4-language-assist';
  const DEVICE_KEY='loky_pc4_device_capability_v1';
  const AUTO_ASSIST_SETTLE_MS=320;

  const LANGUAGES={
    es:{label:'Español',native:'Español',code:'es'},
    en:{label:'Inglés',native:'English',code:'en'},
    fr:{label:'Francés',native:'Français',code:'fr'},
    it:{label:'Italiano',native:'Italiano',code:'it'},
    pt:{label:'Portugués',native:'Português',code:'pt'},
    de:{label:'Alemán',native:'Deutsch',code:'de'},
  };

  const LEVELS={
    starter:{label:'DESDE CERO',cefr:'A0–A1',pace:'muy despacio',nativeHelp:'frecuente'},
    beginner:{label:'PRINCIPIANTE',cefr:'A1–A2',pace:'despacio',nativeHelp:'cuando ayude'},
    intermediate:{label:'INTERMEDIO',cefr:'B1–B2',pace:'natural moderado',nativeHelp:'solo si hace falta'},
    advanced:{label:'AVANZADO',cefr:'C1+',pace:'natural',nativeHelp:'mínimo'},
  };

  const GOALS={
    conversation:{label:'CONVERSACIÓN',icon:'◌',instruction:'Prioriza conversación cotidiana y confianza al hablar.'},
    pronunciation:{label:'PRONUNCIACIÓN',icon:'◎',instruction:'Prioriza pronunciación, ritmo, acento y claridad. Pide repetir solo cuando sea útil.'},
    travel:{label:'VIAJES',icon:'✈',instruction:'Usa role-play de aeropuerto, hotel, restaurante, transporte, compras y emergencias.'},
    work:{label:'TRABAJO',icon:'▣',instruction:'Practica reuniones, presentaciones, entrevistas, correos y conversación profesional.'},
    vocabulary:{label:'VOCABULARIO',icon:'Aa',instruction:'Introduce vocabulario útil en contexto y recíclalo durante la conversación.'},
  };

  const SCENARIOS={
    conversation:['Conociéndonos','Rutina diaria','Familia y amigos','Pasatiempos','Planes del fin de semana'],
    pronunciation:['Sonidos difíciles','Ritmo y entonación','Frases cortas','Pares mínimos','Repetición natural'],
    travel:['Aeropuerto','Hotel','Restaurante','Taxi y transporte','Compras'],
    work:['Entrevista','Reunión','Presentación','Llamada de trabajo','Networking'],
    vocabulary:['Vida diaria','Comida','Ciudad','Trabajo','Viajes'],
  };

  let state=loadState();
  let stats=loadStats();
  let overlay=null;
  let sessionStartedAt=0;
  let lastTranscript='';
  let lastTutorTranscript='';
  let turnObserver=null;
  let autoAssistTimer=0;
  let autoAssistSeq=0;
  let autoAssistLastPhrase='';
  let floatingAssist=null;
  const assistCache=new Map();

  function normalizeState(raw={}){
    let source=LANGUAGES[raw.source]?raw.source:'es';
    let target=LANGUAGES[raw.target]?raw.target:'en';
    if(source===target)target=source==='en'?'es':'en';
    return {
      configured:raw.configured===true,
      active:raw.active===true,
      source,
      target,
      level:LEVELS[raw.level]?raw.level:'starter',
      goal:GOALS[raw.goal]?raw.goal:'conversation',
      scenario:String(raw.scenario||''),
      slow:raw.slow===true,
    };
  }

  function loadState(){
    try{return normalizeState(JSON.parse(localStorage.getItem(STORE_KEY)||'{}'))}
    catch{return normalizeState()}
  }

  function saveState(next){
    state=normalizeState(next);
    try{localStorage.setItem(STORE_KEY,JSON.stringify(state))}catch{}
    return state;
  }

  function loadStats(){
    try{
      const raw=JSON.parse(localStorage.getItem(STATS_KEY)||'{}');
      return {
        sessions:Math.max(0,Number(raw.sessions)||0),
        turns:Math.max(0,Number(raw.turns)||0),
        minutes:Math.max(0,Number(raw.minutes)||0),
        lastAt:Number(raw.lastAt)||0,
      };
    }catch{return {sessions:0,turns:0,minutes:0,lastAt:0}}
  }

  function saveStats(){
    try{localStorage.setItem(STATS_KEY,JSON.stringify(stats))}catch{}
  }

  function sourceLanguage(){return LANGUAGES[state.source]||LANGUAGES.es}
  function targetLanguage(){return LANGUAGES[state.target]||LANGUAGES.en}
  function levelMeta(){return LEVELS[state.level]||LEVELS.starter}
  function goalMeta(){return GOALS[state.goal]||GOALS.conversation}

  function scenario(){
    const list=SCENARIOS[state.goal]||SCENARIOS.conversation;
    return state.scenario&&list.includes(state.scenario)?state.scenario:list[0];
  }

  function tutorInstruction(){
    if(!state.active)return '';
    const source=sourceLanguage();
    const target=targetLanguage();
    const level=levelMeta();
    const goal=goalMeta();
    const selectedScenario=scenario();

    return [
      '[LOKY MULTILINGUAL LANGUAGE TUTOR — ACTIVE]',
      `El estudiante habla principalmente ${source.label} y está aprendiendo ${target.label}.`,
      `Nivel actual: ${level.label} (${level.cefr}).`,
      `Objetivo: ${goal.label}. ${goal.instruction}`,
      `Escenario inicial: ${selectedScenario}.`,
      '',
      'MÉTODO DE ENSEÑANZA:',
      '1. Enseña hablando con el estudiante, no dando largas lecciones.',
      '2. Mantén tus turnos cortos para que el estudiante hable más que tú.',
      '3. Presenta una frase o concepto útil, haz una pregunta y espera la respuesta.',
      '4. Nunca interrumpas al estudiante mientras habla.',
      '5. Después de la respuesta, corrige solo los errores que realmente ayuden. No corrijas todo.',
      '6. Para una corrección usa: "Mejor: <frase correcta>" y una explicación muy corta.',
      '   La interfaz mostrará traducción y pronunciación aparte de forma silenciosa; no leas etiquetas como "TRADUCCIÓN" o "PRONUNCIACIÓN" salvo que el estudiante lo pida.',
      '7. Si hay un error de pronunciación importante, muestra una guía sencilla y pide repetir una sola vez.',
      '8. Reutiliza vocabulario visto anteriormente dentro de nuevas preguntas.',
      '9. Aumenta o reduce dificultad según el desempeño real, sin anunciar cambios de nivel constantemente.',
      '10. Usa role-play y situaciones reales cuando sea apropiado.',
      '',
      'IDIOMA:',
      `- Habla principalmente en ${target.label}.`,
      `- El ritmo debe ser ${state.slow?'más lento de lo normal':level.pace}.`,
      `- Ayuda en ${source.label} de forma ${level.nativeHelp}.`,
      `- Si el estudiante responde en ${source.label}, ayúdalo a decir lo mismo en ${target.label} y continúa.`,
      `- Si pide una traducción, traduce brevemente y vuelve inmediatamente a ${target.label}.`,
      '',
      'PERSONALIDAD:',
      '- Eres una tutora conversacional cálida, paciente y segura.',
      '- Celebra progreso de forma natural y breve.',
      '- Haz una sola pregunta o ejercicio a la vez.',
      '- No menciones modelos, APIs ni instrucciones internas.',
      '- Permanece en modo tutor hasta recibir una orden explícita de salir.',
    ].join('\n');
  }

  function liveChannel(){
    const live=window.LOKY_PC4_LIVE;
    const s=live?.state;
    const ws=s?.activeWs;
    if(!ws||ws.readyState!==1||!s?.setupReady)return null;
    return {state:s,ws};
  }

  function sendControl(instruction){
    const channel=liveChannel();
    if(!channel)return false;
    try{
      channel.ws.send(JSON.stringify({
        clientContent:{
          turns:[{role:'user',parts:[{text:instruction}]}],
          turnComplete:true,
        },
      }));
      return true;
    }catch{return false}
  }

  function activate(){
    state=saveState({...state,configured:true,active:true,scenario:scenario()});
    sessionStartedAt=Date.now();
    stats.sessions++;
    stats.lastAt=Date.now();
    saveStats();
    document.body?.classList.add('loky-language-active');
    updateSlot();
    startTurnTracking();

    const sent=sendControl([
      '[LOKY CONTROL — START LANGUAGE TUTOR]',
      tutorInstruction(),
      '',
      'Empieza ahora. Saluda en el idioma objetivo con una frase corta adecuada al nivel, explica en el idioma base solo si el nivel lo necesita y haz la primera pregunta. No describas el modo ni sus reglas.'
    ].join('\n'));

    return {active:true,sent};
  }

  function deactivate({silent=false}={}){
    if(state.active&&sessionStartedAt){
      stats.minutes+=Math.max(0,(Date.now()-sessionStartedAt)/60000);
      stats.lastAt=Date.now();
      saveStats();
    }
    sessionStartedAt=0;
    state=saveState({...state,active:false});
    document.body?.classList.remove('loky-language-active');
    updateSlot();
    stopTurnTracking();
    if(!silent){
      sendControl([
        '[LOKY CONTROL — EXIT LANGUAGE TUTOR]',
        'Termina el modo de aprendizaje de idiomas ahora.',
        'Vuelve al comportamiento normal de LOKY y continúa en español salvo que el usuario pida otro idioma.'
      ].join('\n'));
    }
    return true;
  }

  function stripTeachingPayloads(raw){
    let text=String(raw||'').replace(/\s+/g,' ').trim();
    if(!text)return '';

    // Remove complete teaching-card payloads but preserve conversation that follows.
    text=text.replace(
      /TRADUCCI[ÓO]N\s*:\s*.*?\s+PRONUNCIACI[ÓO]N(?:\s+APROXIMADA)?\s*:\s*.{1,140}?[.!?](?=\s|$)/gi,
      ' '
    );

    // Handle a card that ends at the current transcript boundary with no punctuation.
    text=text.replace(
      /TRADUCCI[ÓO]N\s*:\s*.*?\s+PRONUNCIACI[ÓO]N(?:\s+APROXIMADA)?\s*:\s*.{1,140}$/gi,
      ' '
    );

    // Remove stray/truncated pronunciation metadata from earlier cumulative transcripts.
    text=text.replace(
      /(?:P|p)?RONUNCIACI[ÓO]N(?:\s+APROXIMADA)?\s*:\s*[^.!?]{0,140}[.!?]?/g,
      ' '
    );

    return text.replace(/\s+/g,' ').trim();
  }

  function sentenceKey(value){
    return String(value||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function dedupeSentences(parts){
    const out=[];
    let previous='';
    for(const raw of parts||[]){
      const item=String(raw||'').replace(/\s+/g,' ').trim();
      if(!item)continue;
      const key=sentenceKey(item);
      if(!key||key===previous)continue;
      out.push(item);
      previous=key;
    }
    return out;
  }

  function tutorSentences(raw){
    const text=stripTeachingPayloads(raw);
    if(!text||text==='—')return [];

    const parts=(text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[])
      .map(x=>x.trim())
      .filter(Boolean);

    return dedupeSentences(parts);
  }

  function latestTutorPhrase(raw){
    const parts=tutorSentences(raw);
    if(!parts.length)return '';
    let phrase=parts[parts.length-1];
    if(phrase.length>180)phrase=phrase.slice(0,180).trim();
    return phrase;
  }

  function cleanTutorDisplay(raw){
    const parts=tutorSentences(raw);
    if(!parts.length)return '—';

    const selected=[];
    let total=0;
    for(let i=parts.length-1;i>=0&&selected.length<2;i--){
      const item=parts[i];
      if(selected.length&&total+item.length>220)break;
      selected.unshift(item);
      total+=item.length+1;
    }
    return selected.join(' ').trim()||'—';
  }

  function cleanUserDisplay(raw){
    let text=String(raw||'').replace(/\s+/g,' ').trim();
    if(!text||text==='—')return '—';

    const parts=(text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[])
      .map(x=>x.trim())
      .filter(Boolean);
    const deduped=dedupeSentences(parts);
    text=deduped.join(' ').trim();

    // Short user turns sometimes arrive twice from incremental transcription.
    const words=text.split(/\s+/);
    if(words.length>=2&&words.length<=10){
      const out=[];
      let previous='';
      for(const word of words){
        const key=sentenceKey(word);
        if(key&&key===previous)continue;
        out.push(word);
        previous=key;
      }
      text=out.join(' ').trim();
    }

    return text||'—';
  }

  function capability(){
    try{return String(localStorage.getItem(DEVICE_KEY)||'')}catch{return ''}
  }

  async function apiLanguageAssist(phrase){
    const cap=capability();
    if(cap.length<16)throw new Error('DEVICE_NOT_AUTHORIZED');

    const response=await fetch(ASSIST_ENDPOINT,{
      method:'POST',
      cache:'no-store',
      headers:{
        'content-type':'application/json',
        'x-loky-device':cap,
      },
      body:JSON.stringify({
        phrase,
        source:state.source,
        target:state.target,
      }),
    });

    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.ok)throw new Error(data?.error||`LANGUAGE_ASSIST_${response.status}`);
    return data;
  }

  function paintFloatingAssist(){
    if(!overlay)return;
    const host=overlay.querySelector?.('[data-lang-floating-assist]');
    const meaning=overlay.querySelector?.('[data-lang-floating-translation]');
    const pronunciation=overlay.querySelector?.('[data-lang-floating-pronunciation]');
    if(!host||!meaning||!pronunciation)return;

    if(!floatingAssist?.translation||!floatingAssist?.pronunciation){
      host.classList.remove('has-value');
      meaning.textContent='';
      pronunciation.textContent='';
      return;
    }

    meaning.textContent=floatingAssist.translation;
    pronunciation.textContent=floatingAssist.pronunciation;
    host.classList.add('has-value');
  }

  function clearFloatingAssist(){
    floatingAssist=null;
    paintFloatingAssist();
  }

  function scheduleAutoAssist(rawTutor){
    if(!state.active)return;
    const phrase=latestTutorPhrase(rawTutor);
    if(!phrase||phrase==='—'||phrase.length<2)return;
    if(phrase===autoAssistLastPhrase&&floatingAssist)return;

    clearTimeout(autoAssistTimer);
    const seq=++autoAssistSeq;

    autoAssistTimer=setTimeout(async()=>{
      if(seq!==autoAssistSeq||!state.active)return;

      const visualState=String(document.getElementById('conversationState')?.textContent||'').trim();
      if(visualState==='LOKY HABLANDO'){
        scheduleAutoAssist(String(document.getElementById('lokyTranscript')?.textContent||''));
        return;
      }

      const current=latestTutorPhrase(String(document.getElementById('lokyTranscript')?.textContent||''));
      if(current!==phrase){
        scheduleAutoAssist(current);
        return;
      }

      const cacheKey=`${state.source}|${state.target}|${phrase}`;
      const cached=assistCache.get(cacheKey);
      if(cached){
        autoAssistLastPhrase=phrase;
        floatingAssist={phrase,translation:cached.translation,pronunciation:cached.pronunciation};
        paintFloatingAssist();
        return;
      }

      try{
        const data=await apiLanguageAssist(phrase);
        if(seq!==autoAssistSeq||!state.active)return;
        autoAssistLastPhrase=phrase;

        if(data?.skip===true||!data?.translation||!data?.pronunciation){
          clearFloatingAssist();
          return;
        }

        const value={
          translation:String(data.translation||'').trim().slice(0,260),
          pronunciation:String(data.pronunciation||'').trim().slice(0,260),
        };
        assistCache.set(cacheKey,value);
        if(assistCache.size>80){
          const first=assistCache.keys().next().value;
          if(first)assistCache.delete(first);
        }

        floatingAssist={phrase,...value};
        paintFloatingAssist();
      }catch{
        if(seq===autoAssistSeq)clearFloatingAssist();
      }
    },AUTO_ASSIST_SETTLE_MS);
  }

  function repeatLatestTutorPhrase(){
    const phrase=floatingAssist?.phrase||latestTutorPhrase(String(document.getElementById('lokyTranscript')?.textContent||''));
    if(!phrase)return false;
    return sendControl([
      '[LOKY TUTOR TOOL — REPEAT]',
      `Repite exactamente esta expresión en ${targetLanguage().label}: ${phrase}`,
      'Dila una vez clara y lentamente. No traduzcas y no cambies de tema.'
    ].join('\n'));
  }

  function quickAction(kind){
    const source=sourceLanguage();
    const target=targetLanguage();
    const map={
      hint:`[LOKY TUTOR TOOL — HINT] Da una pista breve en ${source.label} sin revelar la respuesta completa. Luego repite la pregunta en ${target.label}.`,
      slower:`[LOKY TUTOR TOOL — SLOWER] Repite tu última frase en ${target.label} claramente y más despacio. No añadas explicación salvo que te la pidan.`,
      scenario:`[LOKY TUTOR TOOL — NEW SCENARIO] Cambia de forma natural a otro escenario útil para el objetivo ${goalMeta().label}. Presenta la situación en una sola frase y comienza el role-play.`,
    };

    if(kind==='slower'){
      state=saveState({...state,slow:true});
    }
    if(kind==='repeat')return repeatLatestTutorPhrase();
    return sendControl(map[kind]||'');
  }

  function liveVisualState(){
    const label=String(document.getElementById('conversationState')?.textContent||'').trim();
    if(label==='LOKY HABLANDO')return {key:'speaking',label:'HABLANDO'};
    if(label==='PENSANDO')return {key:'thinking',label:'PENSANDO'};
    if(label==='ESCUCHANDO')return {key:'listening',label:'ESCUCHANDO'};
    return {key:'ready',label:label||'LISTO'};
  }

  // Chain after the protected Mobile Features interceptor.
  // Only fresh Gemini setup frames are extended. Audio/realtime frames pass untouched.
  const previousSend=WebSocket.prototype.send;
  WebSocket.prototype.send=function(data){
    if(
      state.active&&
      typeof data==='string'&&
      data.startsWith('{"setup":')&&
      String(this.url||'').includes('BidiGenerateContentConstrained')
    ){
      try{
        const parsed=JSON.parse(data);
        const resumeHandle=parsed?.setup?.sessionResumption?.handle||'';
        if(parsed?.setup&&!resumeHandle){
          parsed.setup.systemInstruction=parsed.setup.systemInstruction||{parts:[]};
          parsed.setup.systemInstruction.parts=Array.isArray(parsed.setup.systemInstruction.parts)
            ? parsed.setup.systemInstruction.parts
            : [];
          parsed.setup.systemInstruction.parts.push({text:tutorInstruction()});
          data=JSON.stringify(parsed);
        }
      }catch{}
    }
    return previousSend.call(this,data);
  };

  function startTurnTracking(){
    stopTurnTracking();
    const user=document.getElementById('userTranscript');
    const tutor=document.getElementById('lokyTranscript');
    const convo=document.getElementById('conversationState');
    if(!user)return;

    lastTranscript=String(user.textContent||'').trim();
    lastTutorTranscript=String(tutor?.textContent||'').trim();

    turnObserver=new MutationObserver(()=>{
      if(!state.active)return;
      const live=window.LOKY_PC4_LIVE?.state;
      const userText=String(user.textContent||'').trim();
      const tutorText=String(tutor?.textContent||'').trim();

      if(userText&&userText!=='—'&&userText!==lastTranscript&&!live?.userSpeaking){
        lastTranscript=userText;
        stats.turns++;
        stats.lastAt=Date.now();
        saveStats();
      }

      if(tutorText&&tutorText!=='—'&&tutorText!==lastTutorTranscript){
        lastTutorTranscript=tutorText;
        clearFloatingAssist();
        scheduleAutoAssist(tutorText);
      }

      paintLiveCopy();
      paintVisualState();
    });

    turnObserver.observe(user,{childList:true,subtree:true,characterData:true});
    if(tutor)turnObserver.observe(tutor,{childList:true,subtree:true,characterData:true});
    if(convo)turnObserver.observe(convo,{childList:true,subtree:true,characterData:true});
  }

  function stopTurnTracking(){
    try{turnObserver?.disconnect?.()}catch{}
    turnObserver=null;
    clearTimeout(autoAssistTimer);
    autoAssistTimer=0;
    autoAssistSeq++;
  }

  function make(tag,className,text){
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(text!=null)el.textContent=text;
    return el;
  }

  function injectStyles(){
    if(document.getElementById('lokyLanguageTutorStyles'))return;
    const style=document.createElement('style');
    style.id='lokyLanguageTutorStyles';
    style.textContent=`
      .future-op-button.feature-language::before{content:"A";width:auto;height:auto;border-radius:0;background:none;box-shadow:none;color:#bcefff;font-size:14px;font-weight:1000;letter-spacing:.02em;filter:drop-shadow(0 0 7px rgba(91,217,255,.30))}
      body.loky-language-active .future-op-button.feature-language{border-color:rgba(82,224,184,.40);box-shadow:0 0 18px rgba(65,225,180,.20),inset 0 1px 0 rgba(207,255,239,.10)}
      body.loky-language-active .future-op-button.feature-language::before{color:#94f0d2;filter:drop-shadow(0 0 8px rgba(67,235,180,.40))}
      .loky-language-overlay{position:fixed;z-index:260;inset:0;background:#030b12;color:#e8f8ff;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}
      .loky-language-hero{position:absolute;inset:0;overflow:hidden;background:radial-gradient(circle at 50% 38%,rgba(22,70,88,.34),rgba(3,11,18,.96) 64%)}
      .loky-language-avatar{position:absolute;left:4%;top:7%;width:92%;height:86%;object-fit:contain;object-position:center center;filter:saturate(.92) contrast(1.04) brightness(.92);opacity:.96;transition:transform .28s ease,filter .28s ease}
      .loky-language-hero[data-state="listening"] .loky-language-avatar{filter:saturate(.98) contrast(1.04) brightness(.95) drop-shadow(0 0 22px rgba(77,210,236,.12))}
      .loky-language-hero[data-state="thinking"] .loky-language-avatar{filter:saturate(.88) contrast(1.05) brightness(.90) drop-shadow(0 0 22px rgba(153,108,255,.12))}
      .loky-language-hero[data-state="speaking"] .loky-language-avatar{transform:scale(1.018);filter:saturate(1.02) contrast(1.05) brightness(.97) drop-shadow(0 0 26px rgba(70,230,196,.16))}
      .loky-language-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,11,18,.10) 0%,rgba(3,11,18,.05) 45%,rgba(3,11,18,.82) 76%,#030b12 100%)}
      .loky-language-hero.is-fallback::before{content:"";position:absolute;left:50%;top:18%;width:58%;aspect-ratio:.72;border-radius:48% 48% 42% 42%;transform:translateX(-50%);background:radial-gradient(circle at 50% 32%,rgba(220,238,243,.34),rgba(36,73,85,.22) 38%,rgba(3,10,17,.12) 72%);box-shadow:0 0 90px rgba(55,190,220,.12)}
      .loky-language-top{position:relative;z-index:4;box-sizing:border-box;min-height:calc(58px + env(safe-area-inset-top));display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:end;gap:9px;padding:env(safe-area-inset-top) 14px 10px;background:linear-gradient(180deg,rgba(2,9,15,.80),rgba(2,9,15,.18));border-bottom:1px solid rgba(127,211,236,.08)}
      .loky-language-back,.loky-language-settings{height:34px;padding:0 11px;border-radius:999px;border:1px solid rgba(112,201,230,.18);background:rgba(4,26,38,.58);color:#c4effb;font-size:8px;font-weight:900;letter-spacing:.08em}
      .loky-language-heading{display:grid;gap:2px;text-align:center;min-width:0}.loky-language-heading strong{font-size:10px;letter-spacing:.14em;color:#e2faff}.loky-language-heading span{font-size:7.5px;color:#79a6b7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .loky-language-main{position:relative;z-index:3;min-height:0;display:grid;align-items:end;padding:0 14px calc(15px + env(safe-area-inset-bottom));overflow:hidden}
      .loky-language-live{display:grid;gap:9px;width:100%;max-width:540px;margin:0 auto}
      .loky-language-tools{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.loky-language-tool{min-height:40px;border-radius:12px;border:1px solid rgba(100,196,226,.13);background:rgba(6,31,43,.72);color:#a9dce9;font-size:7px;font-weight:900;letter-spacing:.05em}
      .loky-language-progress{display:flex;align-items:center;justify-content:flex-end;color:#729cad;font-size:7px;padding:0 3px}.loky-language-progress strong{color:#8fb9c6;font-weight:800}
      .loky-language-state{justify-self:center;padding:5px 9px;border-radius:999px;border:1px solid rgba(106,203,234,.14);background:rgba(4,24,34,.68);font-size:7px;font-weight:1000;letter-spacing:.13em;color:#86c9db}
      .loky-language-state[data-state="speaking"]{color:#8fe6c8;border-color:rgba(73,222,180,.24)}
      .loky-language-state[data-state="thinking"]{color:#c2a9ff;border-color:rgba(156,115,246,.24)}
      .loky-language-floating{min-height:78px;display:grid;align-content:end;justify-items:center;gap:4px;padding:0 16px 4px;opacity:0;transform:translateY(7px);transition:opacity .22s ease,transform .22s ease;pointer-events:none;text-align:center}
      .loky-language-floating.has-value{opacity:1;transform:translateY(0)}
      .loky-language-floating-translation{max-width:92%;font-size:12px;line-height:1.32;font-weight:800;color:#eefcff;text-shadow:0 2px 8px #02080c,0 0 14px rgba(58,190,220,.28)}
      .loky-language-floating-pronunciation{max-width:94%;font-size:11px;line-height:1.28;font-weight:1000;letter-spacing:.025em;color:#99efd1;text-shadow:0 2px 8px #02080c,0 0 15px rgba(58,225,176,.25)}
      .loky-language-config{position:relative;z-index:6;align-self:center;width:min(92vw,520px);max-height:calc(100vh - 100px);overflow:auto;margin:auto;padding:16px;border-radius:24px;border:1px solid rgba(107,204,235,.16);background:rgba(4,18,27,.94);backdrop-filter:blur(22px);box-shadow:0 22px 80px rgba(0,0,0,.44);display:grid;gap:13px}
      .loky-language-config h2{margin:0;font-size:17px;letter-spacing:.04em;color:#e7faff}.loky-language-config>p{margin:-5px 0 0;font-size:9px;line-height:1.5;color:#7fa7b5}
      .loky-language-section{display:grid;gap:7px}.loky-language-section>strong{font-size:8px;letter-spacing:.12em;color:#8ac7d8}
      .loky-language-pair{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:7px;align-items:center}.loky-language-swap{width:34px;height:34px;border-radius:50%;border:1px solid rgba(105,201,231,.15);background:rgba(6,31,43,.70);color:#9bd8e8;font-size:14px}.loky-language-select{height:42px;min-width:0;border-radius:12px;border:1px solid rgba(104,195,226,.15);background:#071923;color:#d7f5ff;padding:0 9px;font-size:10px;outline:none}
      .loky-language-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.loky-language-levels{grid-template-columns:repeat(2,minmax(0,1fr))}
      .loky-language-choice{min-height:52px;padding:8px;border-radius:13px;border:1px solid rgba(102,193,223,.12);background:rgba(6,28,40,.66);color:#8fc3d2;text-align:left;display:grid;gap:2px;font-size:7px;font-weight:900;letter-spacing:.06em}.loky-language-choice b{font-size:9px;color:#ccebf4}.loky-language-choice.is-selected{border-color:rgba(77,222,181,.34);background:rgba(9,56,51,.62);color:#90e6ca}.loky-language-choice.is-selected b{color:#d5fff0}
      .loky-language-start{min-height:48px;border-radius:14px;border:1px solid rgba(76,225,184,.30);background:linear-gradient(180deg,rgba(17,86,72,.96),rgba(7,56,50,.96));color:#ddfff4;font-size:10px;font-weight:1000;letter-spacing:.10em}
      .loky-language-exit{min-height:42px;border-radius:13px;border:1px solid rgba(237,116,116,.18);background:rgba(67,24,29,.68);color:#ffc1c1;font-size:9px;font-weight:900;letter-spacing:.08em}
      @media(max-width:380px){.loky-language-tools{grid-template-columns:repeat(2,minmax(0,1fr))}.loky-language-config{padding:13px}.loky-language-main{padding-left:10px;padding-right:10px}}
    `;
    document.head.appendChild(style);
  }

  function closeOverlay(){
    overlay?.remove();
    overlay=null;
  }

  function optionSelect(selected){
    const select=make('select','loky-language-select');
    for(const [key,meta] of Object.entries(LANGUAGES)){
      const opt=make('option','',meta.label);
      opt.value=key;
      if(key===selected)opt.selected=true;
      select.appendChild(opt);
    }
    return select;
  }

  function choiceButton(label,sub,selected,onClick){
    const button=make('button','loky-language-choice'+(selected?' is-selected':''));
    button.type='button';
    button.append(make('b','',label));
    if(sub)button.append(make('span','',sub));
    button.addEventListener('click',onClick);
    return button;
  }

  function renderConfig(root){
    root.replaceChildren();
    const card=make('section','loky-language-config');
    card.append(
      make('h2','',state.configured?'Configura tu sesión':'Tu profesora de idiomas'),
      make('p','', 'Elige qué hablas, qué quieres aprender y cómo quieres practicar. LOKY adaptará la conversación a tu nivel.')
    );

    const pair=make('section','loky-language-section');
    pair.append(make('strong','', 'IDIOMAS'));
    const pairRow=make('div','loky-language-pair');
    const source=optionSelect(state.source);
    const target=optionSelect(state.target);
    const swap=make('button','loky-language-swap','⇄');
    swap.type='button';
    source.addEventListener('change',()=>{
      const next=source.value;
      saveState({...state,source:next,target:next===state.target?(next==='en'?'es':'en'):state.target});
      renderConfig(root);
    });
    target.addEventListener('change',()=>{
      const next=target.value;
      saveState({...state,target:next,source:next===state.source?(next==='en'?'es':'en'):state.source});
      renderConfig(root);
    });
    swap.addEventListener('click',()=>{
      saveState({...state,source:state.target,target:state.source});
      renderConfig(root);
    });
    pairRow.append(source,swap,target);
    pair.appendChild(pairRow);

    const levels=make('section','loky-language-section');
    levels.append(make('strong','', 'NIVEL'));
    const levelGrid=make('div','loky-language-grid loky-language-levels');
    for(const [key,meta] of Object.entries(LEVELS)){
      levelGrid.appendChild(choiceButton(meta.label,meta.cefr,state.level===key,()=>{
        saveState({...state,level:key});
        renderConfig(root);
      }));
    }
    levels.appendChild(levelGrid);

    const goals=make('section','loky-language-section');
    goals.append(make('strong','', 'QUIERO PRACTICAR'));
    const goalGrid=make('div','loky-language-grid');
    for(const [key,meta] of Object.entries(GOALS)){
      goalGrid.appendChild(choiceButton(meta.label,'',state.goal===key,()=>{
        const list=SCENARIOS[key]||[];
        saveState({...state,goal:key,scenario:list[0]||''});
        renderConfig(root);
      }));
    }
    goals.appendChild(goalGrid);

    const start=make('button','loky-language-start',state.active?'ACTUALIZAR Y CONTINUAR':'COMENZAR CON LOKY');
    start.type='button';
    start.addEventListener('click',()=>{
      activate();
      renderLive(root);
    });

    card.append(pair,levels,goals,start);
    if(state.active){
      const exit=make('button','loky-language-exit','SALIR DEL MODO IDIOMAS');
      exit.type='button';
      exit.addEventListener('click',()=>{
        deactivate();
        closeOverlay();
      });
      card.appendChild(exit);
    }
    root.appendChild(card);
  }

  function paintVisualState(){
    if(!overlay)return;
    const visual=liveVisualState();
    const hero=overlay.querySelector?.('.loky-language-hero');
    const badge=overlay.querySelector?.('[data-lang-state]');
    if(hero)hero.dataset.state=visual.key;
    if(badge){
      badge.dataset.state=visual.key;
      badge.textContent=visual.label;
    }
  }

  function paintLiveCopy(){
    if(!overlay)return;
    const stat=overlay.querySelector?.('[data-lang-progress]');
    if(stat){
      stat.textContent=`${stats.turns} turnos · ${Math.round(stats.minutes)} min`;
    }
    paintVisualState();
    paintFloatingAssist();
  }

  function renderLive(root){
    root.replaceChildren();
    const live=make('section','loky-language-live');

    const visual=liveVisualState();
    const stateBadge=make('span','loky-language-state',visual.label);
    stateBadge.dataset.langState='1';
    stateBadge.dataset.state=visual.key;

    const floating=make('div','loky-language-floating');
    floating.dataset.langFloatingAssist='1';
    const floatingTranslation=make('div','loky-language-floating-translation','');
    floatingTranslation.dataset.langFloatingTranslation='1';
    const floatingPronunciation=make('div','loky-language-floating-pronunciation','');
    floatingPronunciation.dataset.langFloatingPronunciation='1';
    floating.append(floatingTranslation,floatingPronunciation);

    const tools=make('div','loky-language-tools');
    const definitions=[
      ['PISTA','hint'],
      ['MÁS LENTO','slower'],
      ['REPETIR','repeat'],
      ['CAMBIAR TEMA','scenario'],
    ];
    for(const [label,kind] of definitions){
      const button=make('button','loky-language-tool',label);
      button.type='button';
      button.addEventListener('click',()=>quickAction(kind));
      tools.appendChild(button);
    }

    const progress=make('div','loky-language-progress');
    const stat=make('strong','',`${stats.turns} turnos · ${Math.round(stats.minutes)} min`);
    stat.dataset.langProgress='1';
    progress.appendChild(stat);

    live.append(stateBadge,floating,tools,progress);
    root.appendChild(live);
    paintLiveCopy();
  }

  function openOverlay(){
    injectStyles();
    closeOverlay();

    const page=make('section','loky-language-overlay');
    const hero=make('div','loky-language-hero');
    const avatar=document.createElement('img');
    avatar.className='loky-language-avatar';
    avatar.alt='Asistente de idiomas LOKY';
    avatar.src=AVATAR_URL;
    avatar.addEventListener('error',()=>{
      avatar.remove();
      hero.classList.add('is-fallback');
    });
    hero.appendChild(avatar);

    const top=make('header','loky-language-top');
    const back=make('button','loky-language-back','VOLVER');
    back.type='button';
    back.addEventListener('click',closeOverlay);
    const heading=make('div','loky-language-heading');
    heading.append(
      make('strong','', 'LOKY LANGUAGES'),
      make('span','',state.configured?`${sourceLanguage().label} → ${targetLanguage().label}`:'Tu profesora personal')
    );
    const settings=make('button','loky-language-settings',state.active?'AJUSTES':'×');
    settings.type='button';

    const main=make('main','loky-language-main');
    settings.addEventListener('click',()=>{
      if(state.active)renderConfig(main);
      else closeOverlay();
    });
    top.append(back,heading,settings);
    page.append(hero,top,main);
    document.body.appendChild(page);
    overlay=page;

    if(state.configured&&state.active)renderLive(main);
    else renderConfig(main);
    startTurnTracking();
    return page;
  }

  function updateSlot(){
    const slot=document.querySelector('.future-op-1');
    if(!slot)return;
    slot.classList.toggle('is-active',state.active);
    slot.setAttribute('aria-label',state.active?'Tutor de idiomas activo':'Aprender idiomas');
    slot.setAttribute('title',state.active?'Tutor de idiomas activo':'Aprender idiomas');
  }

  function installSlot(){
    const slot=document.querySelector('.future-op-1');
    if(!slot||slot.dataset.languageTutorReady==='1')return false;
    slot.dataset.languageTutorReady='1';
    slot.disabled=false;
    slot.classList.add('is-action','feature-language');
    slot.setAttribute('aria-label','Aprender idiomas');
    slot.setAttribute('title','Aprender idiomas');
    slot.addEventListener('click',openOverlay);
    updateSlot();
    return true;
  }

  injectStyles();
  if(state.active){
    document.body?.classList.add('loky-language-active');
    startTurnTracking();
  }
  installSlot();

  window.LOKY_PC4_LANGUAGE_TUTOR={
    version:VERSION,
    languages:LANGUAGES,
    levels:LEVELS,
    goals:GOALS,
    get state(){return {...state}},
    get stats(){return {...stats}},
    instruction:tutorInstruction,
    activate,
    deactivate,
    quick:quickAction,
    repeatLatestTutorPhrase,
    cleanTutorDisplay,
    cleanUserDisplay,
    latestTutorPhrase,
    stripTeachingPayloads,
    dedupeSentences,
    apiLanguageAssist,
    scheduleAutoAssist,
    paintFloatingAssist,
    open:openOverlay,
    close:closeOverlay,
    install:installSlot,
  };
})();