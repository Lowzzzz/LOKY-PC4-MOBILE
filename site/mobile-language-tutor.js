(() => {
  'use strict';

  const VERSION='0.3.2R4F12R1-multilingual-avatar-tutor';
  const STORE_KEY='loky_pc4_language_tutor_v1';
  const STATS_KEY='loky_pc4_language_tutor_stats_v1';
  const AVATAR_URL='./language-avatar.webp?v=0.3.2r4f12r1';

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
  let turnObserver=null;

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

  function quickAction(kind){
    const source=sourceLanguage();
    const target=targetLanguage();
    const map={
      hint:`[LOKY TUTOR TOOL — HINT] Da una pista breve en ${source.label} sin revelar la respuesta completa. Luego repite la pregunta en ${target.label}.`,
      slower:`[LOKY TUTOR TOOL — SLOWER] Repite tu última frase en ${target.label} claramente y más despacio. No añadas explicación salvo que te la pidan.`,
      translate:`[LOKY TUTOR TOOL — TRANSLATE] Traduce brevemente tu última frase a ${source.label}, luego vuelve a ${target.label} con una pregunta corta.`,
      scenario:`[LOKY TUTOR TOOL — NEW SCENARIO] Cambia de forma natural a otro escenario útil para el objetivo ${goalMeta().label}. Presenta la situación en una sola frase y comienza el role-play.`,
    };
    if(kind==='slower'){
      state=saveState({...state,slow:true});
    }
    return sendControl(map[kind]||'');
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
    const transcript=document.getElementById('userTranscript');
    if(!transcript)return;
    lastTranscript=String(transcript.textContent||'').trim();
    turnObserver=new MutationObserver(()=>{
      if(!state.active)return;
      const live=window.LOKY_PC4_LIVE?.state;
      const text=String(transcript.textContent||'').trim();
      if(!text||text==='—'||text===lastTranscript||live?.userSpeaking)return;
      lastTranscript=text;
      stats.turns++;
      stats.lastAt=Date.now();
      saveStats();
      paintLiveCopy();
    });
    turnObserver.observe(transcript,{childList:true,subtree:true,characterData:true});
  }

  function stopTurnTracking(){
    try{turnObserver?.disconnect?.()}catch{}
    turnObserver=null;
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
      .loky-language-avatar{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 23%;filter:saturate(.92) contrast(1.04) brightness(.92);opacity:.96}
      .loky-language-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,11,18,.10) 0%,rgba(3,11,18,.05) 45%,rgba(3,11,18,.82) 76%,#030b12 100%)}
      .loky-language-hero.is-fallback::before{content:"";position:absolute;left:50%;top:18%;width:58%;aspect-ratio:.72;border-radius:48% 48% 42% 42%;transform:translateX(-50%);background:radial-gradient(circle at 50% 32%,rgba(220,238,243,.34),rgba(36,73,85,.22) 38%,rgba(3,10,17,.12) 72%);box-shadow:0 0 90px rgba(55,190,220,.12)}
      .loky-language-top{position:relative;z-index:4;box-sizing:border-box;min-height:calc(58px + env(safe-area-inset-top));display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:end;gap:9px;padding:env(safe-area-inset-top) 14px 10px;background:linear-gradient(180deg,rgba(2,9,15,.80),rgba(2,9,15,.18));border-bottom:1px solid rgba(127,211,236,.08)}
      .loky-language-back,.loky-language-settings{height:34px;padding:0 11px;border-radius:999px;border:1px solid rgba(112,201,230,.18);background:rgba(4,26,38,.58);color:#c4effb;font-size:8px;font-weight:900;letter-spacing:.08em}
      .loky-language-heading{display:grid;gap:2px;text-align:center;min-width:0}.loky-language-heading strong{font-size:10px;letter-spacing:.14em;color:#e2faff}.loky-language-heading span{font-size:7.5px;color:#79a6b7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .loky-language-main{position:relative;z-index:3;min-height:0;display:grid;align-items:end;padding:0 14px calc(15px + env(safe-area-inset-bottom));overflow:auto;-webkit-overflow-scrolling:touch}
      .loky-language-live{display:grid;gap:10px;width:100%;max-width:540px;margin:0 auto}
      .loky-language-status{justify-self:center;padding:6px 10px;border-radius:999px;border:1px solid rgba(90,223,184,.20);background:rgba(5,39,38,.58);backdrop-filter:blur(14px);color:#93ebcf;font-size:7px;font-weight:1000;letter-spacing:.12em}
      .loky-language-dialog{border:1px solid rgba(116,205,233,.14);background:rgba(4,20,30,.78);backdrop-filter:blur(18px);border-radius:19px;padding:11px 12px;display:grid;gap:8px}
      .loky-language-line{display:grid;grid-template-columns:42px minmax(0,1fr);gap:8px;align-items:start}.loky-language-line span{font-size:7px;font-weight:1000;letter-spacing:.11em;color:#68bcd4;padding-top:2px}.loky-language-line p{margin:0;font-size:11px;line-height:1.45;color:#d8eff6;min-width:0}.loky-language-line.user p{color:#a8d1dd}
      .loky-language-tools{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.loky-language-tool{min-height:40px;border-radius:12px;border:1px solid rgba(100,196,226,.13);background:rgba(6,31,43,.72);color:#a9dce9;font-size:7px;font-weight:900;letter-spacing:.05em}
      .loky-language-progress{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#729cad;font-size:7px;padding:0 3px}.loky-language-progress strong{color:#aadce8}
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

  function paintLiveCopy(){
    if(!overlay)return;
    const me=overlay.querySelector?.('[data-lang-user]');
    const tutor=overlay.querySelector?.('[data-lang-tutor]');
    const stat=overlay.querySelector?.('[data-lang-progress]');
    if(me){
      const text=String(document.getElementById('userTranscript')?.textContent||'—').trim();
      me.textContent=text||'—';
    }
    if(tutor){
      const text=String(document.getElementById('lokyTranscript')?.textContent||'—').trim();
      tutor.textContent=text||'—';
    }
    if(stat){
      stat.textContent=`${stats.turns} turnos · ${Math.round(stats.minutes)} min`;
    }
  }

  function renderLive(root){
    root.replaceChildren();
    const live=make('section','loky-language-live');
    const status=make('span','loky-language-status',`${targetLanguage().native.toUpperCase()} · ${levelMeta().cefr} · ${goalMeta().label}`);

    const dialog=make('div','loky-language-dialog');
    const tutorLine=make('div','loky-language-line');
    tutorLine.append(make('span','', 'TUTORA'));
    const tutorText=make('p','',String(document.getElementById('lokyTranscript')?.textContent||'—'));
    tutorText.dataset.langTutor='1';
    tutorLine.appendChild(tutorText);

    const userLine=make('div','loky-language-line user');
    userLine.append(make('span','', 'TÚ'));
    const userText=make('p','',String(document.getElementById('userTranscript')?.textContent||'—'));
    userText.dataset.langUser='1';
    userLine.appendChild(userText);
    dialog.append(tutorLine,userLine);

    const tools=make('div','loky-language-tools');
    const definitions=[
      ['PISTA','hint'],
      ['MÁS LENTO','slower'],
      ['TRADUCIR','translate'],
      ['CAMBIAR TEMA','scenario'],
    ];
    for(const [label,kind] of definitions){
      const button=make('button','loky-language-tool',label);
      button.type='button';
      button.addEventListener('click',()=>quickAction(kind));
      tools.appendChild(button);
    }

    const progress=make('div','loky-language-progress');
    progress.append(make('span','',`${sourceLanguage().label} → ${targetLanguage().label}`));
    const stat=make('strong','',`${stats.turns} turnos · ${Math.round(stats.minutes)} min`);
    stat.dataset.langProgress='1';
    progress.appendChild(stat);

    live.append(status,dialog,tools,progress);
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
    open:openOverlay,
    close:closeOverlay,
    install:installSlot,
  };
})();