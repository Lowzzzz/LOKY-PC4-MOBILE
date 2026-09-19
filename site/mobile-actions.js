(() => {
  'use strict';

  const VERSION='0.3.2R4F11-mobile-actions';
  const REPEAT_GUARD_MS=10000;
  const FINAL_TURN_DELAY_MS=120;

  const userTranscript=document.getElementById('userTranscript');
  const conversationState=document.getElementById('conversationState');
  const body=document.body;

  let actionTimer=0;
  let lastActionKey='';
  let lastActionAt=0;
  let activePanel=null;

  const NUMBER_WORDS={
    un:1,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,
    once:11,doce:12,trece:13,catorce:14,quince:15,dieciseis:16,diecisiete:17,dieciocho:18,diecinueve:19,
    veinte:20,veinticinco:25,treinta:30,cuarenta:40,cincuenta:50,sesenta:60
  };

  function normalize(text){
    return String(text||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[¿?¡!,;:]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function withoutLoky(text){
    return normalize(text).replace(/^loky\s+/,'').trim();
  }

  function spokenNumber(token){
    const clean=String(token||'').trim().toLowerCase();
    if(/^\d{1,4}$/.test(clean))return Number(clean);
    return NUMBER_WORDS[clean]||0;
  }

  function parseDuration(text){
    const n=normalize(text);
    const re=/\b(\d{1,4}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veinticinco|treinta|cuarenta|cincuenta|sesenta)\s*(segundo|segundos|minuto|minutos|hora|horas)\b/g;
    let total=0;
    const parts=[];
    let match;
    while((match=re.exec(n))){
      const value=spokenNumber(match[1]);
      if(!value)continue;
      const unit=match[2];
      const factor=unit.startsWith('hora')?3600000:unit.startsWith('minuto')?60000:1000;
      total+=value*factor;
      parts.push(`${value} ${unit}`);
    }
    if(total<1000||total>24*60*60*1000)return null;
    return {ms:total,label:parts.join(' y ')};
  }

  function parseAction(raw){
    const n=withoutLoky(raw);
    if(!n)return null;

    if(/^(?:abre|abrir|muestra|ve a|entra a)\s+(?:la\s+)?(?:configuracion|ajustes)(?:\s+de\s+loky)?$/.test(n)){
      return {type:'loky-settings'};
    }

    if(/\b(?:configuracion|ajustes)\b.*\b(?:iphone|ipad|telefono|sistema)\b/.test(n)){
      return {type:'system-settings-unavailable'};
    }

    if(/^(?:abre|abrir|muestra|ve a)\s+(?:apple\s+)?(?:maps|mapas)$/.test(n)){
      return {type:'maps-open'};
    }

    let match=n.match(/^(?:llevame|navega|guiame|dame indicaciones|como llego)\s+(?:a|hasta)\s+(.+)$/);
    if(match?.[1])return {type:'maps-directions',destination:match[1].trim()};

    match=n.match(/^(?:abre|abrir|muestra)\s+(?:apple\s+)?(?:maps|mapas)\s+(?:en|para|con)\s+(.+)$/);
    if(match?.[1])return {type:'maps-search',query:match[1].trim()};

    if(/^(?:abre|abrir|muestra|ve a)\s+youtube$/.test(n)){
      return {type:'youtube-open'};
    }

    match=n.match(/^(?:pon|reproduce)\s+(.+?)\s+en\s+youtube$/);
    if(match?.[1])return {type:'youtube-search',query:match[1].trim()};

    match=n.match(/^(?:abre|abrir)\s+youtube\s+(?:con|para)\s+(.+)$/);
    if(match?.[1])return {type:'youtube-search',query:match[1].trim()};

    if(/^(?:abre|abrir|muestra|ve a)\s+whatsapp$/.test(n)){
      return {type:'whatsapp-open'};
    }

    match=n.match(/^(?:manda|envia|comparte)\s+(.+?)\s+por\s+whatsapp$/);
    if(match?.[1])return {type:'whatsapp-share',text:match[1].trim()};

    match=n.match(/^(?:manda|envia|comparte)\s+por\s+whatsapp\s+(.+)$/);
    if(match?.[1])return {type:'whatsapp-share',text:match[1].trim()};

    match=n.match(/^(?:copia|copiar)\s+(?:el\s+texto\s+|esto\s+)?(.+)$/);
    if(match?.[1])return {type:'copy',text:match[1].trim()};

    match=n.match(/^(?:pon|inicia|crea|activa)\s+(?:un\s+)?temporizador(?:\s+de|\s+por)?\s+(.+)$/);
    if(match?.[1]){
      const duration=parseDuration(match[1]);
      if(duration)return {type:'timer',...duration};
    }

    if(/^(?:abre|abrir|muestra)\s+(?:las\s+)?alarmas$/.test(n)){
      return {type:'alarms-open'};
    }

    return null;
  }

  function isIOS(){
    return /iPad|iPhone|iPod/.test(navigator.userAgent||'')||
      (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  }

  function mapsHomeUrl(){
    return isIOS()?'https://maps.apple.com/':'https://www.google.com/maps/';
  }

  function mapsDirectionsUrl(destination){
    const q=encodeURIComponent(destination);
    return isIOS()
      ?`https://maps.apple.com/?daddr=${q}&dirflg=d`
      :`https://www.google.com/maps/dir/?api=1&destination=${q}`;
  }

  function mapsSearchUrl(query){
    const q=encodeURIComponent(query);
    return isIOS()
      ?`https://maps.apple.com/?q=${q}`
      :`https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  function closePanel(){
    activePanel?.remove();
    activePanel=null;
  }

  function makeButton(label,fn){
    const button=document.createElement('button');
    button.type='button';
    button.className='loky-mobile-action-btn';
    button.textContent=label;
    button.addEventListener('click',fn);
    return button;
  }

  function ensureStyles(){
    if(document.getElementById('loky-mobile-actions-style'))return;
    const style=document.createElement('style');
    style.id='loky-mobile-actions-style';
    style.textContent=`
      .loky-mobile-actions-card{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));z-index:160;transform:translateX(-50%);width:min(92vw,420px);padding:13px;border-radius:18px;border:1px solid rgba(82,209,241,.24);background:rgba(4,19,29,.96);box-shadow:0 18px 70px rgba(0,0,0,.42);backdrop-filter:blur(18px);color:#dff8ff}
      .loky-mobile-actions-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.loky-mobile-actions-head strong{font-size:11px;letter-spacing:.12em}.loky-mobile-actions-close{border:0;background:transparent;color:#9fdce9;font-size:22px;line-height:1}
      .loky-mobile-actions-status{margin-top:7px;font-size:10px;font-weight:900;color:#66d7ff}.loky-mobile-actions-detail{margin-top:5px;font-size:12px;line-height:1.4;color:#b9dce7}
      .loky-mobile-actions-buttons{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.loky-mobile-action-btn{min-height:34px;padding:0 11px;border-radius:10px;border:1px solid rgba(91,208,235,.22);background:rgba(14,57,73,.78);color:#c8f4ff;font-size:9px;font-weight:900;letter-spacing:.05em}
      .loky-mobile-actions-sheet{position:fixed;inset:0;z-index:159;background:rgba(0,6,10,.78);backdrop-filter:blur(12px);display:grid;place-items:center;padding:20px}
      .loky-mobile-actions-menu{width:min(92vw,430px);max-height:78vh;overflow:auto;border-radius:22px;border:1px solid rgba(83,204,235,.20);background:#071923;padding:16px;color:#dff8ff}
      .loky-mobile-actions-menu h2{margin:0 0 4px;font-size:17px}.loky-mobile-actions-menu p{margin:0 0 13px;color:#8fbac7;font-size:11px;line-height:1.45}.loky-mobile-actions-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.loky-mobile-actions-grid button{min-height:54px}
      @media(max-width:430px){.loky-mobile-actions-grid{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function showCard(status,detail,buttons=[]){
    ensureStyles();
    closePanel();
    const card=document.createElement('section');
    card.className='loky-mobile-actions-card';
    const head=document.createElement('div');
    head.className='loky-mobile-actions-head';
    const title=document.createElement('strong');
    title.textContent='LOKY · ACCIONES';
    const close=document.createElement('button');
    close.type='button';
    close.className='loky-mobile-actions-close';
    close.textContent='×';
    close.setAttribute('aria-label','Cerrar');
    close.addEventListener('click',closePanel);
    head.append(title,close);
    const state=document.createElement('div');
    state.className='loky-mobile-actions-status';
    state.textContent=status;
    const copy=document.createElement('div');
    copy.className='loky-mobile-actions-detail';
    copy.textContent=detail||'';
    const actions=document.createElement('div');
    actions.className='loky-mobile-actions-buttons';
    for(const button of buttons)actions.appendChild(button);
    card.append(head,state,copy,actions);
    body.appendChild(card);
    activePanel=card;
    return card;
  }

  function navigate(url,label){
    showCard('ABRIENDO',label||url,[
      makeButton('ABRIR',()=>location.assign(url))
    ]);
    setTimeout(()=>{
      try{location.assign(url)}catch{}
    },40);
    return true;
  }

  async function copyText(text){
    const value=String(text||'').trim();
    if(!value)return false;
    try{
      await navigator.clipboard.writeText(value);
      showCard('COPIADO',value);
      return true;
    }catch{
      showCard('LISTO PARA COPIAR',value,[
        makeButton('COPIAR',async()=>{
          try{
            await navigator.clipboard.writeText(value);
            showCard('COPIADO',value);
          }catch{
            showCard('NO DISPONIBLE','iOS requiere permiso de portapapeles para esta acción.');
          }
        })
      ]);
      return true;
    }
  }

  function createTimer(action){
    const planner=window.LOKY_PC4_PLANNER;
    if(!planner?.add)return false;
    const at=Date.now()+action.ms;
    const item=planner.add('alarm',`Temporizador · ${action.label}`,at,'voice-action');
    if(!item)return false;
    planner.checkDue?.();
    showCard('TEMPORIZADOR ACTIVO',`${action.label} · sonará como alarma de LOKY.`,[
      makeButton('VER ALARMAS',()=>planner.open?.('alarm'))
    ]);
    return true;
  }

  function openActionsMenu(){
    ensureStyles();
    closePanel();
    const sheet=document.createElement('section');
    sheet.className='loky-mobile-actions-sheet';
    const menu=document.createElement('div');
    menu.className='loky-mobile-actions-menu';
    const title=document.createElement('h2');
    title.textContent='ACCIONES MÓVILES';
    const intro=document.createElement('p');
    intro.textContent='Acciones directas sin crear otro micrófono ni otra sesión. También puedes pedirlas por voz.';
    const grid=document.createElement('div');
    grid.className='loky-mobile-actions-grid';

    grid.append(
      makeButton('MAPS',()=>navigate(mapsHomeUrl(),'Maps')),
      makeButton('YOUTUBE',()=>navigate('https://www.youtube.com/','YouTube')),
      makeButton('WHATSAPP',()=>navigate('https://api.whatsapp.com/send','WhatsApp')),
      makeButton('CONFIGURACIÓN LOKY',()=>{
        closePanel();
        window.LOKY_PC4_FEATURES?.windows?.openSettings?.();
      }),
      makeButton('ALARMAS / TIMER',()=>{
        closePanel();
        window.LOKY_PC4_PLANNER?.open?.('alarm');
      }),
      makeButton('CERRAR',closePanel)
    );

    menu.append(title,intro,grid);
    sheet.appendChild(menu);
    sheet.addEventListener('click',event=>{if(event.target===sheet)closePanel();});
    body.appendChild(sheet);
    activePanel=sheet;
  }

  function executeAction(action){
    if(!action)return false;

    if(action.type==='loky-settings'){
      const open=window.LOKY_PC4_FEATURES?.windows?.openSettings;
      if(typeof open==='function'){
        open();
        return true;
      }
      document.querySelector('.feature-settings')?.click();
      return true;
    }

    if(action.type==='system-settings-unavailable'){
      showCard('CONFIGURACIÓN DEL SISTEMA','Una PWA de iOS no tiene un API público para abrir directamente Ajustes del sistema. Configuración de LOKY sí está disponible.');
      return true;
    }

    if(action.type==='maps-open')return navigate(mapsHomeUrl(),'Maps');
    if(action.type==='maps-directions')return navigate(mapsDirectionsUrl(action.destination),`Ruta a ${action.destination}`);
    if(action.type==='maps-search')return navigate(mapsSearchUrl(action.query),`Maps · ${action.query}`);

    if(action.type==='youtube-open')return navigate('https://www.youtube.com/','YouTube');
    if(action.type==='youtube-search')return navigate(`https://www.youtube.com/results?search_query=${encodeURIComponent(action.query)}`,`YouTube · ${action.query}`);

    if(action.type==='whatsapp-open')return navigate('https://api.whatsapp.com/send','WhatsApp');
    if(action.type==='whatsapp-share')return navigate(`https://wa.me/?text=${encodeURIComponent(action.text)}`,'WhatsApp · mensaje preparado');

    if(action.type==='copy'){
      copyText(action.text);
      return true;
    }

    if(action.type==='timer')return createTimer(action);

    if(action.type==='alarms-open'){
      window.LOKY_PC4_PLANNER?.open?.('alarm');
      return true;
    }

    return false;
  }

  function actionKey(action){
    if(!action)return '';
    return JSON.stringify(action);
  }

  function captureFinishedTurn(){
    clearTimeout(actionTimer);
    actionTimer=setTimeout(()=>{
      actionTimer=0;
      const live=window.LOKY_PC4_LIVE?.state;
      if(live?.userSpeaking)return;
      const text=String(userTranscript?.textContent||'').trim();
      if(!text||text==='—')return;
      const action=parseAction(text);
      if(!action)return;
      const key=actionKey(action);
      if(key===lastActionKey&&Date.now()-lastActionAt<REPEAT_GUARD_MS)return;
      if(executeAction(action)){
        lastActionKey=key;
        lastActionAt=Date.now();
      }
    },FINAL_TURN_DELAY_MS);
  }

  function installActionSlot(){
    const slot=document.querySelector('.future-op-1');
    if(!slot||slot.dataset.mobileActionsReady==='1')return;
    slot.dataset.mobileActionsReady='1';
    slot.disabled=false;
    slot.classList.add('is-action','feature-mobile-actions');
    slot.setAttribute('aria-label','Acciones móviles');
    slot.setAttribute('title','Acciones móviles');
    slot.addEventListener('click',openActionsMenu);
  }

  ensureStyles();
  installActionSlot();

  if(conversationState&&userTranscript){
    new MutationObserver(()=>{
      if(String(conversationState.textContent||'').trim()==='PENSANDO'){
        captureFinishedTurn();
      }
    }).observe(conversationState,{childList:true,subtree:true,characterData:true});
  }

  window.LOKY_PC4_MOBILE_ACTIONS={
    version:VERSION,
    parse:parseAction,
    execute:executeAction,
    duration:parseDuration,
    open:openActionsMenu,
    urls:{
      mapsHome:mapsHomeUrl,
      mapsDirections:mapsDirectionsUrl,
      mapsSearch:mapsSearchUrl,
    },
  };
})();