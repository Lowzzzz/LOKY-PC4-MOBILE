(() => {
  'use strict';

  const VERSION='0.3.2R4F10R2-safe-local-search';
  const ENDPOINT='https://novgwydgcvlboujnmygq.supabase.co/functions/v1/loky-pc4-mobile-search';
  const DEVICE_KEY='loky_pc4_device_capability_v1';
  const SEARCH_DEBOUNCE_MS=320;
  const REPEAT_GUARD_MS=12000;

  const userTranscript=document.getElementById('userTranscript');
  let searchTimer=0;
  let inFlight=false;
  let lastSearchText='';
  let lastSearchAt=0;
  let lastAnnouncementAt=0;

  function normalize(text){
    return String(text||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[¿?¡!,.;:]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function capability(){
    try{return String(localStorage.getItem(DEVICE_KEY)||'')}catch{return ''}
  }

  function searchIntent(raw){
    const n=normalize(raw).replace(/^loky\s+/,'');
    if(!n)return false;

    if(/\b(?:busca|buscame|buscar|averigua|averiguame|investiga|consulta|consultame|encuentra|localiza)\b/.test(n))return true;

    if(/\b(?:numero de telefono|telefono|direccion|horario|pagina web|sitio web|sitio oficial|correo electronico|email)\s+de\b/.test(n))return true;

    if(/\b(?:ultimas noticias|noticias recientes|que paso hoy|que esta pasando|precio actual|cotizacion actual)\b/.test(n))return true;

    return false;
  }

  function cleanDisplayQuery(raw){
    return String(raw||'').trim().replace(/^\s*loky[,:]?\s*/i,'').slice(0,500);
  }

  async function apiSearch(query){
    const cap=capability();
    if(cap.length<16)throw new Error('DEVICE_NOT_AUTHORIZED');

    const response=await fetch(ENDPOINT,{
      method:'POST',
      cache:'no-store',
      headers:{
        'content-type':'application/json',
        'x-loky-device':cap,
      },
      body:JSON.stringify({action:'search',query}),
    });

    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.ok)throw new Error(data?.error||`SEARCH_${response.status}`);
    return data;
  }

  function ensureCard(){
    let card=document.querySelector('.loky-web-search-card');
    if(card)return card;

    card=document.createElement('section');
    card.className='loky-web-search-card';
    card.innerHTML=`
      <div class="loky-web-search-head">
        <strong>LOKY WEB</strong>
        <button type="button" aria-label="Cerrar">×</button>
      </div>
      <div class="loky-web-search-status">LISTO</div>
      <div class="loky-web-search-answer"></div>
      <div class="loky-web-search-sources"></div>
    `;
    card.querySelector('button')?.addEventListener('click',()=>card.classList.remove('is-open'));
    document.body.appendChild(card);
    return card;
  }

  function showSearching(){
    const card=ensureCard();
    card.querySelector('.loky-web-search-status').textContent='BUSCANDO EN LA WEB…';
    card.querySelector('.loky-web-search-answer').textContent='';
    card.querySelector('.loky-web-search-sources').replaceChildren();
    card.classList.add('is-open','is-loading');
  }

  function showResult(result){
    const card=ensureCard();
    card.classList.remove('is-loading');
    card.querySelector('.loky-web-search-status').textContent='WEB EN TIEMPO REAL · VERIFICADO';
    card.querySelector('.loky-web-search-answer').textContent=String(result?.answer||'').slice(0,1200);

    const sources=card.querySelector('.loky-web-search-sources');
    sources.replaceChildren();
    const list=Array.isArray(result?.sources)?result.sources.slice(0,4):[];
    if(list.length){
      const label=document.createElement('span');
      label.textContent='FUENTES';
      sources.appendChild(label);
      for(const source of list){
        const a=document.createElement('a');
        a.href=String(source?.uri||'#');
        a.target='_blank';
        a.rel='noopener noreferrer';
        a.textContent=String(source?.title||source?.uri||'Fuente').slice(0,90);
        sources.appendChild(a);
      }
    }
  }

  function showError(error){
    const card=ensureCard();
    card.classList.remove('is-loading');
    card.querySelector('.loky-web-search-status').textContent='BÚSQUEDA NO DISPONIBLE';
    card.querySelector('.loky-web-search-answer').textContent=String(error?.message||error).slice(0,180);
    card.querySelector('.loky-web-search-sources').replaceChildren();
    card.classList.add('is-open');
  }

  function sourceText(result){
    const list=Array.isArray(result?.sources)?result.sources.slice(0,5):[];
    if(!list.length)return 'No se devolvieron enlaces de fuente.';
    return list.map((source,index)=>
      `${index+1}. ${String(source?.title||'Fuente')} — ${String(source?.uri||'')}`
    ).join('\n');
  }

  function liveChannel(){
    const live=window.LOKY_PC4_LIVE;
    const state=live?.state;
    const ws=state?.activeWs;
    if(!ws||ws.readyState!==1||!state?.setupReady)return null;
    return {state,ws};
  }

  function announceLiveSearch(query){
    const channel=liveChannel();
    if(!channel)return false;
    if(Date.now()-lastAnnouncementAt<1200)return true;

    const notice=[
      '[LOKY WEB TOOL — BÚSQUEDA INICIADA]',
      `Consulta del usuario: ${query}`,
      'LOKY WEB sí tiene acceso a búsqueda en Internet y acaba de iniciarla.',
      'Responde únicamente con una frase breve como: "Estoy buscando eso ahora."',
      'No digas que no tienes Internet, navegación o acceso en tiempo real.',
      'El resultado verificado llegará inmediatamente en un nuevo turno.'
    ].join('\n');

    try{
      channel.ws.send(JSON.stringify({
        clientContent:{
          turns:[{
            role:'user',
            parts:[{text:notice}],
          }],
          turnComplete:true,
        },
      }));
      lastAnnouncementAt=Date.now();
      return true;
    }catch{
      return false;
    }
  }

  function injectIntoLive(query,result){
    const channel=liveChannel();
    if(!channel)return false;

    const verifiedPhone=String(result?.facts?.verifiedPhone?.value||'');
    const sourceCount=Number(result?.facts?.verifiedPhone?.sourceCount||0);
    const context=[
      '[LOKY WEB TOOL RESULT — BÚSQUEDA REAL EJECUTADA AHORA]',
      `Consulta original del usuario: ${query}`,
      `Hora de búsqueda: ${String(result?.searchedAt||new Date().toISOString())}`,
      'Estado de acceso Web de LOKY: ACTIVO.',
      '',
      verifiedPhone
        ? `Dato de contacto verificado: ${verifiedPhone} (respaldado por ${sourceCount} fuente${sourceCount===1?'':'s'} pública${sourceCount===1?'':'s'}).`
        : '',
      'Resultado de búsqueda:',
      String(result?.answer||''),
      '',
      'Fuentes públicas:',
      sourceText(result),
      '',
      'INSTRUCCIÓN OBLIGATORIA PARA LOKY:',
      'Esta información fue obtenida de Internet AHORA por la herramienta LOKY WEB.',
      'NO digas que no tienes acceso a Internet, que no puedes navegar, o que no tienes acceso en tiempo real cuando recibas este bloque.',
      'Responde directamente al usuario con el dato verificado más relevante.',
      'Si pidió teléfono, dirección, horario, precio o URL, dilo primero y claramente.',
      'Si existen varias fuentes, prioriza el dato con mayor respaldo y menciona brevemente que fue verificado.',
      'No inventes datos adicionales y no expliques detalles técnicos salvo que el usuario los pregunte.'
    ].filter(Boolean).join('\n');

    try{
      channel.ws.send(JSON.stringify({
        clientContent:{
          turns:[{
            role:'user',
            parts:[{text:context}],
          }],
          turnComplete:true,
        },
      }));
      return true;
    }catch{
      return false;
    }
  }

  function finishLiveSearchError(query,error){
    const channel=liveChannel();
    if(!channel)return false;
    const message=[
      '[LOKY WEB TOOL RESULT — BÚSQUEDA FALLIDA]',
      `Consulta: ${query}`,
      `Error de herramienta: ${String(error?.message||error).slice(0,160)}`,
      'La herramienta Web existe y sí puede buscar en tiempo real, pero esta consulta no pudo completarse.',
      'Responde al usuario que la búsqueda Web falló esta vez y pídele reformular o añadir ciudad/nombre exacto. No digas que careces de acceso a Internet.'
    ].join('\n');
    try{
      channel.ws.send(JSON.stringify({
        clientContent:{
          turns:[{role:'user',parts:[{text:message}]}],
          turnComplete:true,
        },
      }));
      return true;
    }catch{
      return false;
    }
  }

  async function runSearch(raw){
    const query=cleanDisplayQuery(raw);
    if(!query||inFlight)return false;

    const key=normalize(query);
    if(key===lastSearchText&&Date.now()-lastSearchAt<REPEAT_GUARD_MS)return false;

    inFlight=true;
    lastSearchText=key;
    lastSearchAt=Date.now();
    announceLiveSearch(query);
    showSearching();

    try{
      const result=await apiSearch(query);
      showResult(result);
      injectIntoLive(query,result);
      return result;
    }catch(error){
      showError(error);
      finishLiveSearchError(query,error);
      return false;
    }finally{
      inFlight=false;
    }
  }

  function scheduleFromTranscript(){
    clearTimeout(searchTimer);
    const text=String(userTranscript?.textContent||'').trim();
    if(!text||text==='—'||!searchIntent(text))return;

    searchTimer=setTimeout(()=>{
      searchTimer=0;
      const stable=String(userTranscript?.textContent||'').trim();
      if(!stable||stable==='—'||!searchIntent(stable))return;
      runSearch(stable);
    },SEARCH_DEBOUNCE_MS);
  }

  function injectStyles(){
    if(document.getElementById('lokyWebSearchStyles'))return;
    const style=document.createElement('style');
    style.id='lokyWebSearchStyles';
    style.textContent=`
      .loky-web-search-card{position:fixed;z-index:360;left:50%;bottom:calc(84px + var(--safe-bottom));transform:translate(-50%,12px);width:min(90vw,430px);max-height:min(46vh,420px);overflow:auto;border:1px solid rgba(91,202,239,.20);border-radius:18px;background:linear-gradient(180deg,rgba(7,30,43,.98),rgba(3,16,25,.98));box-shadow:0 22px 70px rgba(0,0,0,.52);padding:12px;display:none;gap:8px;color:#d9f6ff}
      .loky-web-search-card.is-open{display:grid;transform:translate(-50%,0)}
      .loky-web-search-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .loky-web-search-head strong{font-size:8px;letter-spacing:.15em;color:#bceeff}
      .loky-web-search-head button{width:28px;height:28px;border-radius:50%;border:1px solid rgba(104,205,240,.16);background:rgba(8,39,54,.72);color:#a9ddec;font-size:16px;line-height:1}
      .loky-web-search-status{font-size:7px;letter-spacing:.10em;color:#73aabe}
      .loky-web-search-card.is-loading .loky-web-search-status{color:#9fe4f7}
      .loky-web-search-answer{font-size:9px;line-height:1.48;color:#d2edf6;white-space:pre-wrap}
      .loky-web-search-sources{display:grid;gap:5px;padding-top:4px;border-top:1px solid rgba(90,190,224,.10)}
      .loky-web-search-sources>span{font-size:6.5px;letter-spacing:.11em;color:#648b9d}
      .loky-web-search-sources a{font-size:7px;line-height:1.35;color:#82d8f0;text-decoration:none;overflow-wrap:anywhere}
    `;
    document.head.appendChild(style);
  }

  injectStyles();

  if(userTranscript){
    new MutationObserver(scheduleFromTranscript)
      .observe(userTranscript,{childList:true,subtree:true,characterData:true});
  }

  window.LOKY_PC4_WEB_SEARCH={
    version:VERSION,
    intent:searchIntent,
    search:runSearch,
    state:()=>({
      inFlight,
      lastSearchText,
      lastSearchAt,
      liveReady:!!(
        window.LOKY_PC4_LIVE?.state?.activeWs&&
        window.LOKY_PC4_LIVE?.state?.setupReady
      ),
      lastAnnouncementAt,
    }),
  };
})();
