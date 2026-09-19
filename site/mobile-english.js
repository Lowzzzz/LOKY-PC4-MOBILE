(() => {
  'use strict';

  const VERSION='0.3.2R4F12-english-tutor';
  const STORE_KEY='loky_pc4_english_tutor_v1';

  const LEVELS={
    beginner:{
      label:'PRINCIPIANTE',
      short:'A1–A2',
      instruction:'Usa inglés simple y lento. Explica brevemente en español cuando sea necesario. Corrige solo los errores más importantes después de que el usuario termine de hablar.'
    },
    intermediate:{
      label:'INTERMEDIO',
      short:'B1–B2',
      instruction:'Habla principalmente en inglés natural a velocidad moderada. Corrige gramática, vocabulario y pronunciación después de cada respuesta, de forma breve y clara.'
    },
    advanced:{
      label:'AVANZADO',
      short:'C1–C2',
      instruction:'Habla prácticamente solo en inglés, con vocabulario natural y variado. Corrige matices, fluidez, pronunciación y expresiones idiomáticas.'
    }
  };

  const FOCUSES={
    conversation:{label:'CONVERSACIÓN',instruction:'Prioriza conversación real, preguntas y respuestas naturales. Mantén turnos cortos para que el usuario hable mucho.'},
    pronunciation:{label:'PRONUNCIACIÓN',instruction:'Presta especial atención a cómo suena el usuario. Cuando detectes una pronunciación mejorable, da una corrección breve, una guía fonética sencilla y pide repetir una vez.'},
    vocabulary:{label:'VOCABULARIO',instruction:'Introduce vocabulario útil dentro de contexto. Enseña pocas palabras a la vez, con significado, ejemplo y una pregunta para practicar.'},
    situations:{label:'SITUACIONES',instruction:'Practica escenarios reales como restaurante, aeropuerto, hotel, trabajo, compras, médico y conversaciones cotidianas mediante role-play.'}
  };

  let panel=null;

  function load(){
    try{
      const raw=JSON.parse(localStorage.getItem(STORE_KEY)||'{}');
      return {
        active:raw.active===true,
        level:LEVELS[raw.level]?raw.level:'beginner',
        focus:FOCUSES[raw.focus]?raw.focus:'conversation',
      };
    }catch{
      return {active:false,level:'beginner',focus:'conversation'};
    }
  }

  function save(next){
    try{localStorage.setItem(STORE_KEY,JSON.stringify(next))}catch{}
    return next;
  }

  let state=load();

  function tutorInstruction(){
    if(!state.active)return '';
    const level=LEVELS[state.level]||LEVELS.beginner;
    const focus=FOCUSES[state.focus]||FOCUSES.conversation;
    return [
      '[LOKY ENGLISH COACH MODE — ACTIVE]',
      'Actúa como un profesor personal de inglés conversacional dentro de LOKY.',
      'Objetivo: ayudar al usuario a aprender inglés hablando, escuchando y practicando de forma natural.',
      level.instruction,
      focus.instruction,
      'Reglas del tutor:',
      '- Deja que el usuario termine de hablar antes de corregir.',
      '- No interrumpas cada frase por errores pequeños.',
      '- Corrige con formato breve: "Mejor: ..." y una explicación corta solo cuando ayude.',
      '- Haz una sola pregunta o ejercicio a la vez.',
      '- Adapta la dificultad según el desempeño real del usuario.',
      '- Si el usuario habla español, ayúdalo a expresar lo mismo en inglés y luego continúa la práctica.',
      '- Celebra avances de forma natural, sin exagerar.',
      '- No salgas de English Coach hasta recibir una instrucción explícita de salir del modo.',
      `Nivel seleccionado: ${level.label} (${level.short}).`,
      `Enfoque seleccionado: ${focus.label}.`,
    ].join('\n');
  }

  function liveChannel(){
    const live=window.LOKY_PC4_LIVE;
    const s=live?.state;
    const ws=s?.activeWs;
    if(!ws||ws.readyState!==1||!s?.setupReady)return null;
    return {state:s,ws};
  }

  function sendControl(text){
    const channel=liveChannel();
    if(!channel)return false;
    try{
      channel.ws.send(JSON.stringify({
        clientContent:{
          turns:[{role:'user',parts:[{text}]}],
          turnComplete:true,
        },
      }));
      return true;
    }catch{
      return false;
    }
  }

  function activate(level=state.level,focus=state.focus){
    state=save({active:true,level:LEVELS[level]?level:'beginner',focus:FOCUSES[focus]?focus:'conversation'});
    document.body?.classList.add('loky-english-active');
    updateSlot();
    const sent=sendControl([
      '[LOKY CONTROL — ACTIVATE ENGLISH COACH]',
      tutorInstruction(),
      'Confirma brevemente que English Coach está activo y comienza con una pregunta sencilla apropiada al nivel seleccionado.'
    ].join('\n'));
    return {active:true,sent};
  }

  function deactivate(){
    const wasActive=state.active;
    state=save({...state,active:false});
    document.body?.classList.remove('loky-english-active');
    updateSlot();
    if(wasActive){
      sendControl([
        '[LOKY CONTROL — EXIT ENGLISH COACH]',
        'English Coach termina ahora.',
        'Vuelve inmediatamente al comportamiento normal de LOKY y continúa en español salvo que el usuario pida otro idioma.'
      ].join('\n'));
    }
    return true;
  }

  // Chain after the already-protected Mobile Features setup interceptor.
  // Only fresh setup frames are extended. Realtime PCM/audio frames pass untouched.
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

  function make(tag,className,text){
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(text!=null)el.textContent=text;
    return el;
  }

  function injectStyles(){
    if(document.getElementById('lokyEnglishTutorStyles'))return;
    const style=document.createElement('style');
    style.id='lokyEnglishTutorStyles';
    style.textContent=`
      .future-op-button.feature-english::before{content:"EN";width:auto;height:auto;border-radius:0;background:none;box-shadow:none;color:#bcefff;font-size:10px;font-weight:1000;letter-spacing:.04em;filter:drop-shadow(0 0 7px rgba(91,217,255,.28))}
      body.loky-english-active .future-op-button.feature-english{border-color:rgba(86,231,188,.38);box-shadow:0 0 18px rgba(64,229,179,.18),inset 0 1px 0 rgba(207,255,238,.10)}
      body.loky-english-active .future-op-button.feature-english::before{color:#8ff0ce;filter:drop-shadow(0 0 7px rgba(67,235,180,.38))}
      .loky-english-panel{position:absolute;z-index:12;inset:0;background:linear-gradient(180deg,#07131e 0%,#030a11 100%);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}
      .loky-english-top{box-sizing:border-box;height:calc(56px + var(--safe-top));display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;padding:var(--safe-top) 12px 0;border-bottom:1px solid rgba(104,193,225,.10);background:rgba(5,17,27,.94)}
      .loky-english-back,.loky-english-close{height:32px;padding:0 11px;border-radius:999px;border:1px solid rgba(102,203,239,.18);background:rgba(10,40,55,.58);color:#bfefff;font-size:8px;font-weight:900}
      .loky-english-title{display:grid;gap:2px;min-width:0}.loky-english-title strong{font-size:10px;letter-spacing:.12em;color:#dcf8ff}.loky-english-title span{font-size:7.5px;color:#70a2b4}
      .loky-english-content{min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;padding:14px 14px calc(24px + var(--safe-bottom));display:grid;align-content:start;gap:12px}
      .loky-english-card{border:1px solid rgba(101,197,232,.13);border-radius:18px;background:linear-gradient(180deg,rgba(8,29,42,.86),rgba(4,17,27,.84));padding:12px;display:grid;gap:10px}
      .loky-english-card h3{margin:0;font-size:9px;letter-spacing:.12em;color:#d7f5ff}.loky-english-card p{margin:0;font-size:9px;line-height:1.5;color:#7fa8b7}
      .loky-english-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.loky-english-grid.focus{grid-template-columns:repeat(2,minmax(0,1fr))}
      .loky-english-choice{min-height:58px;padding:8px;border-radius:13px;border:1px solid rgba(95,196,229,.13);background:rgba(4,22,32,.70);color:#9bcddd;display:grid;place-items:center;align-content:center;gap:3px;font-size:7px;font-weight:900;letter-spacing:.06em}
      .loky-english-choice strong{font-size:9px;color:#cceefa}.loky-english-choice.is-selected{border-color:rgba(82,221,181,.34);background:rgba(13,57,54,.58);color:#8fe5ca}.loky-english-choice.is-selected strong{color:#d5fff0}
      .loky-english-start{min-height:46px;border:1px solid rgba(75,225,183,.28);border-radius:14px;background:linear-gradient(180deg,rgba(16,83,70,.90),rgba(8,54,50,.92));color:#d8fff2;font-size:10px;font-weight:1000;letter-spacing:.10em}
      .loky-english-stop{min-height:42px;border:1px solid rgba(240,118,118,.20);border-radius:14px;background:rgba(63,24,28,.68);color:#ffc1c1;font-size:9px;font-weight:900;letter-spacing:.09em}
      .loky-english-active-card{border-color:rgba(71,225,181,.22);background:rgba(8,52,47,.48)}.loky-english-badge{display:inline-flex;justify-self:start;padding:5px 8px;border-radius:999px;border:1px solid rgba(82,224,184,.24);color:#91edcf;font-size:7px;font-weight:1000;letter-spacing:.12em}
      @media(max-width:390px){.loky-english-grid{grid-template-columns:1fr}.loky-english-grid.focus{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function closePanel(){
    panel?.remove();
    panel=null;
  }

  function renderPanel(){
    injectStyles();
    closePanel();

    const host=document.querySelector('.conversation-shell');
    if(!host)return null;

    const page=make('section','loky-english-panel');
    const top=make('div','loky-english-top');
    const back=make('button','loky-english-back','VOLVER');
    back.type='button';
    back.addEventListener('click',closePanel);

    const title=make('div','loky-english-title');
    title.append(
      make('strong','', 'ENGLISH COACH'),
      make('span','',state.active?'Tutor activo':'Aprende inglés hablando con LOKY')
    );
    const close=make('button','loky-english-close','×');
    close.type='button';
    close.setAttribute('aria-label','Cerrar');
    close.addEventListener('click',closePanel);
    top.append(back,title,close);

    const content=make('div','loky-english-content');

    if(state.active){
      const active=make('section','loky-english-card loky-english-active-card');
      active.append(
        make('span','loky-english-badge','ACTIVO'),
        make('h3','',`${LEVELS[state.level].label} · ${FOCUSES[state.focus].label}`),
        make('p','', 'Habla normalmente con LOKY. El tutor corregirá y adaptará la práctica al nivel seleccionado.')
      );
      const stop=make('button','loky-english-stop','SALIR DE ENGLISH COACH');
      stop.type='button';
      stop.addEventListener('click',()=>{
        deactivate();
        renderPanel();
      });
      active.appendChild(stop);
      content.appendChild(active);
    }

    const levelCard=make('section','loky-english-card');
    levelCard.append(
      make('h3','', 'NIVEL'),
      make('p','', 'Elige la dificultad inicial. LOKY podrá ajustarla según tu progreso.')
    );
    const levelGrid=make('div','loky-english-grid');
    for(const [key,meta] of Object.entries(LEVELS)){
      const button=make('button','loky-english-choice'+(state.level===key?' is-selected':''));
      button.type='button';
      button.append(make('strong','',meta.label),make('span','',meta.short));
      button.addEventListener('click',()=>{
        state=save({...state,level:key});
        renderPanel();
      });
      levelGrid.appendChild(button);
    }
    levelCard.appendChild(levelGrid);

    const focusCard=make('section','loky-english-card');
    focusCard.append(
      make('h3','', 'PRÁCTICA'),
      make('p','', 'Puedes cambiar de enfoque cuando quieras.')
    );
    const focusGrid=make('div','loky-english-grid focus');
    for(const [key,meta] of Object.entries(FOCUSES)){
      const button=make('button','loky-english-choice'+(state.focus===key?' is-selected':''));
      button.type='button';
      button.append(make('strong','',meta.label));
      button.addEventListener('click',()=>{
        state=save({...state,focus:key});
        renderPanel();
      });
      focusGrid.appendChild(button);
    }
    focusCard.appendChild(focusGrid);

    const start=make('button','loky-english-start',state.active?'ACTUALIZAR MODO':'COMENZAR CON LOKY');
    start.type='button';
    start.addEventListener('click',()=>{
      activate(state.level,state.focus);
      renderPanel();
    });

    content.append(levelCard,focusCard,start);
    page.append(top,content);
    host.appendChild(page);
    panel=page;
    return page;
  }

  function updateSlot(){
    const slot=document.querySelector('.future-op-1');
    if(!slot)return;
    slot.classList.toggle('is-active',state.active);
    slot.setAttribute('aria-label',state.active?'English Coach activo':'English Coach');
    slot.setAttribute('title',state.active?'English Coach activo':'English Coach');
  }

  function installSlot(){
    const slot=document.querySelector('.future-op-1');
    if(!slot||slot.dataset.englishTutorReady==='1')return false;
    slot.dataset.englishTutorReady='1';
    slot.disabled=false;
    slot.classList.add('is-action','feature-english');
    slot.setAttribute('aria-label','English Coach');
    slot.setAttribute('title','English Coach');
    slot.addEventListener('click',renderPanel);
    updateSlot();
    return true;
  }

  injectStyles();
  if(state.active)document.body?.classList.add('loky-english-active');
  installSlot();

  window.LOKY_PC4_ENGLISH_TUTOR={
    version:VERSION,
    levels:LEVELS,
    focuses:FOCUSES,
    get state(){return {...state};},
    instruction:tutorInstruction,
    activate,
    deactivate,
    open:renderPanel,
    close:closePanel,
    install:installSlot,
  };
})();