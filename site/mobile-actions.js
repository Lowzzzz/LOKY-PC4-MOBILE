(() => {
  'use strict';

  const VERSION='0.3.2R4F11R2-transcript-buffer-actions';
  const REPEAT_GUARD_MS=10000;
  const TRANSCRIPT_SETTLE_MS=360;
  const USER_END_POLL_MS=80;
  const POLL_MS=90;

  const userTranscript=document.getElementById('userTranscript');
  const body=document.body;

  let actionTimer=0;
  let pollTimer=0;
  let lastActionKey='';
  let lastActionAt=0;
  let statusCard=null;
  let observedText='';
  let observedAt=0;
  let processedText='';

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

  function cleanCommandText(text){
    return normalize(text)
      .replace(/\b(?:por favor|porfa|si puedes|si puede|gracias)\b\s*$/g,' ')
      .replace(/^\s*(?:oye\s+)?loky\s+/,'')
      .replace(/^\s*(?:puedes|podrias|podrías|quiero que|necesito que|haz el favor de|hazme el favor de)\s+/,'')
      .replace(/\s+/g,' ')
      .trim();
  }

  function commandCandidates(raw){
    const base=normalize(raw);
    if(!base)return [];

    const out=[];
    const add=value=>{
      value=cleanCommandText(value);
      if(value&&!out.includes(value))out.push(value);
    };

    add(base);

    const lokyParts=base.split(/\bloky\b/g);
    if(lokyParts.length>1)add(lokyParts[lokyParts.length-1]);

    const starts=[];
    const re=/\b(?:abre|abrir|abreme|muestra|ve a|entra a|llevame|navega|guiame|dame indicaciones|como llego|quiero ir|pon|reproduce|manda|envia|comparte|copia|copiar|inicia|crea|activa)\b/g;
    let m;
    while((m=re.exec(base)))starts.push(m.index);
    if(starts.length)add(base.slice(starts[starts.length-1]));

    return out;
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
    const candidates=commandCandidates(raw);
    if(!candidates.length)return null;

    for(const n of candidates){
      if(/^(?:abre|abrir|abreme|muestra|ve a|entra a)\s+(?:la\s+)?(?:configuracion|ajustes)(?:\s+de\s+loky)?(?:\s+ahora)?$/.test(n)){
        return {type:'loky-settings'};
      }

      if(/\b(?:configuracion|ajustes)\b.*\b(?:iphone|ipad|telefono|sistema)\b/.test(n)){
        return {type:'system-settings-unavailable'};
      }

      if(/^(?:abre|abrir|abreme|muestra|ve a)\s+(?:la\s+app\s+de\s+)?(?:apple\s+)?(?:maps|mapas)(?:\s+ahora)?$/.test(n)){
        return {type:'maps-open'};
      }

      let match=n.match(/^(?:llevame|navega|guiame|dame indicaciones|como llego|quiero ir)\s+(?:a|hasta)\s+(.+?)(?:\s+por favor)?$/);
      if(match?.[1])return {type:'maps-directions',destination:match[1].trim()};

      match=n.match(/^(?:abre|abrir|abreme|muestra)\s+(?:apple\s+)?(?:maps|mapas)\s+(?:en|para|con|y busca)\s+(.+?)(?:\s+por favor)?$/);
      if(match?.[1])return {type:'maps-search',query:match[1].trim()};

      if(/^(?:abre|abrir|abreme|muestra|ve a)\s+(?:la\s+app\s+de\s+)?youtube(?:\s+ahora)?$/.test(n)){
        return {type:'youtube-open'};
      }

      match=n.match(/^(?:pon|reproduce)\s+(.+?)\s+en\s+youtube(?:\s+por favor)?$/);
      if(match?.[1])return {type:'youtube-search',query:match[1].trim()};

      match=n.match(/^(?:abre|abrir|abreme)\s+youtube\s+(?:con|para|y busca)\s+(.+?)(?:\s+por favor)?$/);
      if(match?.[1])return {type:'youtube-search',query:match[1].trim()};

      if(/^(?:abre|abrir|abreme|muestra|ve a)\s+(?:la\s+app\s+de\s+)?whatsapp(?:\s+ahora)?$/.test(n)){
        return {type:'whatsapp-open'};
      }

      match=n.match(/^(?:manda|envia|comparte)\s+(.+?)\s+por\s+whatsapp(?:\s+por favor)?$/);
      if(match?.[1])return {type:'whatsapp-share',text:match[1].trim()};

      match=n.match(/^(?:manda|envia|comparte)\s+por\s+whatsapp\s+(.+?)(?:\s+por favor)?$/);
      if(match?.[1])return {type:'whatsapp-share',text:match[1].trim()};

      match=n.match(/^(?:copia|copiar)\s+(?:el\s+texto\s+|esto\s+)?(.+?)(?:\s+por favor)?$/);
      if(match?.[1])return {type:'copy',text:match[1].trim()};

      match=n.match(/^(?:pon|inicia|crea|activa)\s+(?:un\s+)?temporizador(?:\s+de|\s+por)?\s+(.+?)(?:\s+por favor)?$/);
      if(match?.[1]){
        const duration=parseDuration(match[1]);
        if(duration)return {type:'timer',...duration};
      }

      if(/^(?:abre|abrir|abreme|muestra)\s+(?:las\s+)?alarmas(?:\s+ahora)?$/.test(n)){
        return {type:'alarms-open'};
      }
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

  function ensureStyles(){
    if(document.getElementById('loky-mobile-actions-style'))return;
    const style=document.createElement('style');
    style.id='loky-mobile-actions-style';
    style.textContent=`
      .loky-mobile-action-status{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));z-index:160;transform:translateX(-50%);width:min(90vw,390px);padding:11px 13px;border-radius:16px;border:1px solid rgba(82,209,241,.22);background:rgba(4,19,29,.95);box-shadow:0 18px 60px rgba(0,0,0,.36);backdrop-filter:blur(16px);color:#dff8ff}
      .loky-mobile-action-status strong{display:block;font-size:9px;letter-spacing:.12em;color:#66d7ff}.loky-mobile-action-status span{display:block;margin-top:4px;font-size:11px;line-height:1.35;color:#b9dce7}
      .loky-mobile-action-status button{margin-top:8px;min-height:32px;padding:0 11px;border-radius:9px;border:1px solid rgba(91,208,235,.22);background:rgba(14,57,73,.78);color:#c8f4ff;font-size:9px;font-weight:900}
    `;
    document.head.appendChild(style);
  }

  function showStatus(label,detail,{copyText=''}={}){
    ensureStyles();
    statusCard?.remove();
    const card=document.createElement('section');
    card.className='loky-mobile-action-status';
    const title=document.createElement('strong');
    title.textContent=label;
    const text=document.createElement('span');
    text.textContent=detail||'';
    card.append(title,text);

    if(copyText){
      const button=document.createElement('button');
      button.type='button';
      button.textContent='COPIAR';
      button.addEventListener('click',async()=>{
        try{
          await navigator.clipboard.writeText(copyText);
          title.textContent='COPIADO';
          setTimeout(()=>card.remove(),900);
        }catch{
          title.textContent='PORTAPAPELES NO DISPONIBLE';
        }
      });
      card.appendChild(button);
    }

    body.appendChild(card);
    statusCard=card;
    setTimeout(()=>{
      if(statusCard===card)statusCard=null;
      card.remove();
    },2600);
  }

  function navigate(url,label){
    showStatus('ABRIENDO',label||url);
    try{
      location.href=url;
      return true;
    }catch(error){
      try{
        location.assign(url);
        return true;
      }catch(secondError){
        showStatus('NO SE PUDO ABRIR',label||String(secondError?.message||error));
        return false;
      }
    }
  }

  async function copyText(text){
    const value=String(text||'').trim();
    if(!value)return false;
    try{
      await navigator.clipboard.writeText(value);
      showStatus('COPIADO',value);
      return true;
    }catch{
      showStatus('TOCA PARA COPIAR',value,{copyText:value});
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
    showStatus('TEMPORIZADOR ACTIVO',`${action.label} · sonará como alarma de LOKY.`);
    return true;
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
      showStatus('NO DISPONIBLE DESDE PWA','LOKY puede abrir su configuración interna, pero iOS no ofrece un API público para abrir Ajustes del sistema directamente.');
      return true;
    }

    if(action.type==='maps-open')return navigate(mapsHomeUrl(),'Maps');
    if(action.type==='maps-directions')return navigate(mapsDirectionsUrl(action.destination),`Ruta a ${action.destination}`);
    if(action.type==='maps-search')return navigate(mapsSearchUrl(action.query),`Maps · ${action.query}`);

    if(action.type==='youtube-open')return navigate('https://www.youtube.com/','YouTube');
    if(action.type==='youtube-search')return navigate(`https://www.youtube.com/results?search_query=${encodeURIComponent(action.query)}`,`YouTube · ${action.query}`);

    if(action.type==='whatsapp-open')return navigate('https://api.whatsapp.com/send','WhatsApp');
    if(action.type==='whatsapp-share')return navigate(`https://wa.me/?text=${encodeURIComponent(action.text)}`,'WhatsApp');

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
    return action?JSON.stringify(action):'';
  }

  function executeStableTranscript(text){
    const action=parseAction(text);
    if(!action)return false;
    const key=actionKey(action);
    if(key===lastActionKey&&Date.now()-lastActionAt<REPEAT_GUARD_MS)return false;
    if(!executeAction(action))return false;
    lastActionKey=key;
    lastActionAt=Date.now();
    return true;
  }

  function liveTranscript(){
    const liveText=String(window.LOKY_PC4_LIVE?.state?.transcriptBuffer||'').trim();
    if(liveText&&liveText!=='—')return liveText;
    return String(userTranscript?.textContent||'').trim();
  }

  function evaluateTranscript(){
    const live=window.LOKY_PC4_LIVE?.state;
    const text=liveTranscript();

    if(!text||text==='—')return;
    if(text!==observedText){
      observedText=text;
      observedAt=Date.now();
      return;
    }

    if(live?.userSpeaking)return;
    if(Date.now()-observedAt<TRANSCRIPT_SETTLE_MS)return;
    if(text===processedText)return;

    processedText=text;
    executeStableTranscript(text);
  }

  function scheduleFromTranscript(){
    clearTimeout(actionTimer);
    actionTimer=setTimeout(evaluateTranscript,USER_END_POLL_MS);
  }

  function startPoll(){
    if(pollTimer)return;
    pollTimer=setInterval(evaluateTranscript,POLL_MS);
  }

  if(userTranscript){
    new MutationObserver(scheduleFromTranscript)
      .observe(userTranscript,{childList:true,subtree:true,characterData:true});
  }

  startPoll();

  window.LOKY_PC4_MOBILE_ACTIONS={
    version:VERSION,
    parse:parseAction,
    execute:executeAction,
    executeText:executeStableTranscript,
    schedule:scheduleFromTranscript,
    poll:evaluateTranscript,
    readTranscript:liveTranscript,
    candidates:commandCandidates,
    duration:parseDuration,
    urls:{
      mapsHome:mapsHomeUrl,
      mapsDirections:mapsDirectionsUrl,
      mapsSearch:mapsSearchUrl,
    },
  };
})();