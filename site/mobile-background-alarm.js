(() => {
  'use strict';

  const VERSION='0.3.2R4F9-cloud-background-alarms';
  const ENDPOINT='https://novgwydgcvlboujnmygq.supabase.co/functions/v1/loky-pc4-mobile-push';
  const DEVICE_KEY='loky_pc4_device_capability_v1';
  const STATE_KEY='loky_pc4_mobile_background_alarm_v1';
  const SYNC_KEY='loky_pc4_mobile_background_alarm_sync_v1';
  const SYNC_MS=500;

  let syncTimer=0;
  let syncing=false;
  let pushReady=false;
  let backendReady=false;
  let currentPublicKey='';
  let lastUiState='';

  function loadState(){
    try{
      const parsed=JSON.parse(localStorage.getItem(STATE_KEY)||'{}');
      return {
        enabled:parsed?.enabled===true,
        endpoint:String(parsed?.endpoint||''),
        enabledAt:Number(parsed?.enabledAt)||0,
      };
    }catch{
      return {enabled:false,endpoint:'',enabledAt:0};
    }
  }

  function saveState(next){
    try{localStorage.setItem(STATE_KEY,JSON.stringify(next))}catch{}
    return next;
  }

  function loadSync(){
    try{
      const parsed=JSON.parse(localStorage.getItem(SYNC_KEY)||'{}');
      return parsed&&typeof parsed==='object'?parsed:{};
    }catch{
      return {};
    }
  }

  function saveSync(value){
    try{localStorage.setItem(SYNC_KEY,JSON.stringify(value))}catch{}
  }

  function capability(){
    try{return String(localStorage.getItem(DEVICE_KEY)||'')}catch{return ''}
  }

  function supported(){
    return !!(
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  function installedStandalone(){
    try{
      return window.matchMedia?.('(display-mode: standalone)')?.matches===true ||
        window.navigator.standalone===true;
    }catch{
      return false;
    }
  }

  function base64UrlToUint8Array(value){
    const padding='='.repeat((4-value.length%4)%4);
    const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base64);
    return Uint8Array.from(raw,character=>character.charCodeAt(0));
  }

  async function getConfig(){
    const response=await fetch(ENDPOINT,{method:'GET',cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.ok||!data?.publicKey)throw new Error(data?.error||'PUSH_CONFIG_FAILED');
    currentPublicKey=String(data.publicKey);
    backendReady=true;
    return data;
  }

  async function api(action,body={}){
    const cap=capability();
    if(cap.length<16)throw new Error('DEVICE_NOT_AUTHORIZED');
    const response=await fetch(ENDPOINT,{
      method:'POST',
      cache:'no-store',
      headers:{
        'content-type':'application/json',
        'x-loky-device':cap,
      },
      body:JSON.stringify({action,...body}),
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.ok)throw new Error(data?.error||`PUSH_API_${response.status}`);
    return data;
  }

  async function currentSubscription(){
    if(!supported())return null;
    try{
      const registration=await navigator.serviceWorker.ready;
      return await registration.pushManager.getSubscription();
    }catch{
      return null;
    }
  }

  async function subscribeFromGesture(){
    if(!supported())throw new Error('PUSH_NOT_SUPPORTED');
    if(!installedStandalone())throw new Error('HOME_SCREEN_REQUIRED');
    if(capability().length<16)throw new Error('DEVICE_NOT_AUTHORIZED');

    const config=currentPublicKey?{publicKey:currentPublicKey}:await getConfig();

    let permission=Notification.permission;
    if(permission!=='granted'){
      permission=await Notification.requestPermission();
    }
    if(permission!=='granted')throw new Error('NOTIFICATION_PERMISSION_DENIED');

    const registration=await navigator.serviceWorker.ready;
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription){
      subscription=await registration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:base64UrlToUint8Array(String(config.publicKey)),
      });
    }

    const json=subscription.toJSON?subscription.toJSON():JSON.parse(JSON.stringify(subscription));
    await api('subscribe',{subscription:json});
    const state=saveState({
      enabled:true,
      endpoint:String(json.endpoint||''),
      enabledAt:Date.now(),
    });
    pushReady=true;
    await syncNow(true);
    await api('test_push',{}).catch(()=>{});
    paintAll();
    return state;
  }

  async function refreshStatus(){
    if(!supported()){
      pushReady=false;
      backendReady=false;
      paintAll();
      return;
    }
    try{
      await getConfig();
      const sub=await currentSubscription();
      pushReady=!!sub&&Notification.permission==='granted';
      if(pushReady&&capability().length>=16){
        const status=await api('status').catch(()=>null);
        pushReady=!!status?.pushReady;
        if(pushReady){
          const json=sub.toJSON?sub.toJSON():JSON.parse(JSON.stringify(sub));
          saveState({enabled:true,endpoint:String(json.endpoint||''),enabledAt:loadState().enabledAt||Date.now()});
        }
      }
    }catch{
      backendReady=false;
    }
    paintAll();
  }

  function planner(){
    return window.LOKY_PC4_PLANNER||null;
  }

  function alarmSnapshot(){
    const p=planner();
    if(!p?.snapshot)return [];
    try{
      return p.snapshot().filter(item=>item&&item.type==='alarm');
    }catch{
      return [];
    }
  }

  function activeAlarms(){
    const now=Date.now();
    return alarmSnapshot().filter(item=>
      !item.doneAt &&
      Number.isFinite(Number(item.at)) &&
      Number(item.at)>=now-60_000
    );
  }

  async function syncNow(force=false){
    if(syncing||!pushReady||capability().length<16)return false;
    syncing=true;
    try{
      const cache=loadSync();
      const next={...cache};
      const active=activeAlarms();
      const activeIds=new Set(active.map(item=>String(item.id)));

      for(const item of active){
        const id=String(item.id);
        const signature=`${Number(item.at)}|${String(item.title||'Alarma')}`;
        if(!force&&cache[id]===signature)continue;
        try{
          await api('schedule_alarm',{
            plannerId:id,
            title:String(item.title||'Alarma'),
            fireAt:new Date(Number(item.at)).toISOString(),
          });
          next[id]=signature;
        }catch{}
      }

      for(const id of Object.keys(cache)){
        if(activeIds.has(id))continue;
        try{
          await api('cancel_alarm',{plannerId:id});
          delete next[id];
        }catch{}
      }

      saveSync(next);
      return true;
    }finally{
      syncing=false;
    }
  }

  function scheduleSync(){
    clearTimeout(syncTimer);
    syncTimer=setTimeout(async()=>{
      await syncNow(false).catch(()=>{});
      scheduleSync();
    },SYNC_MS);
  }

  function toast(message){
    let el=document.querySelector('.loky-bg-alarm-toast');
    if(!el){
      el=document.createElement('div');
      el.className='loky-bg-alarm-toast';
      document.body.appendChild(el);
    }
    el.textContent=message;
    requestAnimationFrame(()=>el.classList.add('is-open'));
    clearTimeout(el._hide);
    el._hide=setTimeout(()=>el.classList.remove('is-open'),3200);
  }

  function uiText(){
    if(!supported())return 'SEGUNDO PLANO · NO DISPONIBLE';
    if(!installedStandalone())return 'SEGUNDO PLANO · INSTALAR EN INICIO';
    if(Notification.permission==='denied')return 'SEGUNDO PLANO · BLOQUEADO';
    if(pushReady)return 'ALARMA CON LOKY CERRADA · ACTIVA';
    if(backendReady)return 'ALARMA CON LOKY CERRADA · ACTIVAR';
    return 'SEGUNDO PLANO · CONECTANDO';
  }

  function injectStyles(){
    if(document.getElementById('lokyBackgroundAlarmStyles'))return;
    const style=document.createElement('style');
    style.id='lokyBackgroundAlarmStyles';
    style.textContent=`
      .loky-bg-alarm-button{height:38px;border-radius:11px;border:1px solid rgba(110,222,252,.22);background:linear-gradient(180deg,rgba(14,68,88,.78),rgba(7,39,55,.82));color:#c8f3ff;font-size:7.5px;font-weight:900;letter-spacing:.08em}
      .loky-bg-alarm-button[data-ready="1"]{border-color:rgba(92,235,185,.32);background:linear-gradient(180deg,rgba(13,74,66,.76),rgba(5,44,43,.82));color:#c8ffe9}
      .loky-bg-alarm-button:disabled{opacity:.62}
      .loky-bg-alarm-caption{font-size:7px;line-height:1.4;text-align:center;color:#668b9c}
      .loky-bg-alarm-toast{position:fixed;z-index:380;left:50%;bottom:calc(24px + var(--safe-bottom));transform:translateX(-50%) translateY(10px);width:min(88vw,420px);padding:11px 13px;border:1px solid rgba(107,215,250,.24);border-radius:14px;background:rgba(4,25,37,.97);color:#d9f7ff;text-align:center;font-size:8px;line-height:1.45;opacity:0;pointer-events:none;transition:.18s ease;box-shadow:0 18px 55px rgba(0,0,0,.45)}
      .loky-bg-alarm-toast.is-open{opacity:1;transform:translateX(-50%) translateY(0)}
    `;
    document.head.appendChild(style);
  }

  function bindAlarmPanel(screen){
    if(!screen||screen.dataset.bgAlarmBound==='1')return;
    const heading=String(screen.querySelector('.loky-planner-title strong')?.textContent||'').trim();
    if(heading!=='ALARMAS')return;

    const formCard=screen.querySelector('.loky-planner-card');
    if(!formCard)return;

    const button=document.createElement('button');
    button.type='button';
    button.className='loky-bg-alarm-button';
    button.addEventListener('click',async()=>{
      button.disabled=true;
      try{
        if(pushReady){
          toast('Segundo plano ya está activo. Enviando prueba Cloud…');
          const result=await api('test_push',{});
          toast(result?.delivered>0?'Prueba Cloud enviada.':'No se pudo entregar la prueba Cloud.');
        }else{
          toast('Activando alarmas con LOKY cerrada…');
          await subscribeFromGesture();
          toast('Segundo plano activado. Debe llegarte una prueba Cloud.');
        }
      }catch(error){
        const code=String(error?.message||error);
        if(code==='HOME_SCREEN_REQUIRED')toast('Abre LOKY desde el icono instalado en la pantalla de inicio.');
        else if(code==='NOTIFICATION_PERMISSION_DENIED')toast('Activa las notificaciones de LOKY en Ajustes de iOS.');
        else if(code==='PUSH_NOT_SUPPORTED')toast('Este dispositivo no ofrece Web Push para esta instalación.');
        else toast(`No se pudo activar segundo plano · ${code.slice(0,80)}`);
      }finally{
        button.disabled=false;
        paintAll();
      }
    });

    const caption=document.createElement('div');
    caption.className='loky-bg-alarm-caption';
    caption.textContent='Cloud Push: permite avisar aunque LOKY esté cerrada. El sonido con la app cerrada lo controla iOS.';

    formCard.appendChild(button);
    formCard.appendChild(caption);
    screen.dataset.bgAlarmBound='1';
    paintAll();
  }

  function paintAll(){
    const text=uiText();
    if(text!==lastUiState)lastUiState=text;
    for(const button of document.querySelectorAll('.loky-bg-alarm-button')){
      button.textContent=text;
      button.dataset.ready=pushReady?'1':'0';
    }
  }

  injectStyles();

  new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes||[]){
        if(node?.nodeType!==1)continue;
        if(node.matches?.('.loky-planner-screen'))bindAlarmPanel(node);
        for(const screen of node.querySelectorAll?.('.loky-planner-screen')||[])bindAlarmPanel(screen);
      }
    }
  }).observe(document.body,{childList:true,subtree:true});

  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden){
      refreshStatus().catch(()=>{});
      syncNow(false).catch(()=>{});
    }
  });
  addEventListener('pageshow',()=>{
    refreshStatus().catch(()=>{});
    syncNow(false).catch(()=>{});
  });

  refreshStatus().catch(()=>{});
  scheduleSync();

  window.LOKY_PC4_BACKGROUND_ALARM={
    version:VERSION,
    supported,
    installedStandalone,
    refreshStatus,
    subscribe:subscribeFromGesture,
    sync:syncNow,
    state:()=>({
      pushReady,
      backendReady,
      notificationPermission:'Notification' in window?Notification.permission:'unsupported',
      local:loadState(),
      synced:loadSync(),
    }),
  };
})();
