(() => {
  'use strict';

  const VERSION='0.3.2R4F5R2-settings-page-scroll-clean';
  const DEVICE_KEY='loky_pc4_device_capability_v1';
  const DEVICE_ENDPOINT='https://novgwydgcvlboujnmygq.supabase.co/functions/v1/loky-pc4-mobile-devices';
  const QR_LIB='https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs@04f46c6a0708418cb7b96fc563eacae0fbf77674/qrcode.min.js';
  const features=window.LOKY_PC4_FEATURES;
  if(!features)return;

  let qrPromise=null;

  function injectStyles(){
    if(document.getElementById('lokySettingsPlusStyles'))return;
    const style=document.createElement('style');
    style.id='lokySettingsPlusStyles';
    style.textContent=`
      .loky-settings-window{display:block!important;overflow-y:auto!important;overflow-x:hidden!important;-webkit-overflow-scrolling:touch!important;touch-action:pan-y;overscroll-behavior-y:contain;height:100vh;height:100dvh;min-height:0}
      .loky-settings-window .loky-feature-header{position:sticky;top:0;z-index:6}
      .loky-settings-window .loky-feature-content{display:grid!important;overflow:visible!important;min-height:auto!important;height:auto!important;padding-bottom:calc(150px + env(safe-area-inset-bottom,0px))!important}
      .loky-settings-plus{display:grid;gap:12px;padding-bottom:0}
      .loky-accordion{border:1px solid rgba(100,198,232,.16);border-radius:20px;background:linear-gradient(180deg,rgba(7,29,42,.88),rgba(3,17,27,.91));overflow:hidden;box-shadow:0 16px 46px rgba(0,0,0,.16)}
      .loky-accordion-toggle{width:100%;min-height:64px;border:0;background:transparent;color:#d8f5ff;padding:14px 16px;display:grid;grid-template-columns:34px 1fr 26px;align-items:center;gap:10px;text-align:left;pointer-events:auto}
      .loky-accordion-icon{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(107,211,246,.18);background:rgba(14,54,72,.48);color:#9ce9ff;font-size:14px;box-shadow:inset 0 1px rgba(255,255,255,.04)}
      .loky-accordion-copy{display:grid;gap:3px}.loky-accordion-copy strong{font-size:11px;letter-spacing:.13em}.loky-accordion-copy span{font-size:8px;color:#7195a8;line-height:1.4}
      .loky-accordion-chevron{font-size:19px;color:#72bfd8;transition:transform .22s ease}.loky-accordion.is-open .loky-accordion-chevron{transform:rotate(90deg)}
      .loky-accordion-body{display:grid;grid-template-rows:0fr;transition:grid-template-rows .24s cubic-bezier(.22,.75,.25,1)}.loky-accordion.is-open .loky-accordion-body{grid-template-rows:1fr}
      .loky-accordion-inner{min-height:0;overflow:hidden}.loky-accordion-content{padding:0 14px 15px;border-top:1px solid rgba(98,184,214,.09)}
      .loky-mode-compact{display:grid;gap:7px;padding-top:12px}.loky-mode-compact .loky-mode-option{min-height:58px}
      .loky-simple-status{margin-top:12px;padding:13px;border:1px solid rgba(100,194,225,.12);border-radius:15px;background:rgba(4,20,30,.56);display:grid;gap:6px}.loky-simple-status strong{font-size:10px;letter-spacing:.1em}.loky-simple-status span{font-size:8px;color:#769cad;line-height:1.5}
      .loky-device-owner{display:grid;gap:12px;padding-top:12px}.loky-device-toolbar{display:grid;gap:9px}.loky-device-label{height:40px;border-radius:12px;border:1px solid rgba(102,198,230,.16);background:rgba(1,12,19,.62);color:#d9f7ff;padding:0 12px;outline:none;font-size:10px}.loky-device-label:focus{border-color:rgba(105,220,255,.42)}
      .loky-duration-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.loky-duration-btn{height:36px;border-radius:11px;border:1px solid rgba(100,194,226,.16);background:rgba(8,35,48,.58);color:#7faabe;font-size:8px;font-weight:800;letter-spacing:.06em}.loky-duration-btn.is-selected{border-color:rgba(108,223,255,.58);color:#d3f8ff;background:rgba(16,74,96,.72);box-shadow:0 0 14px rgba(70,198,239,.12)}
      .loky-create-invite{height:42px;border-radius:13px;border:1px solid rgba(109,221,255,.36);background:linear-gradient(180deg,rgba(25,100,129,.78),rgba(7,47,66,.86));color:#d8f8ff;font-size:9px;font-weight:800;letter-spacing:.1em}
      .loky-device-message{font-size:8px;line-height:1.5;color:#799eaf;text-align:center;min-height:12px}.loky-device-message.is-error{color:#ff9b91}
      .loky-qr-card{display:none;padding:14px;border-radius:18px;border:1px solid rgba(110,217,248,.19);background:radial-gradient(circle at 50% 25%,rgba(21,94,122,.22),rgba(2,15,24,.86));justify-items:center;gap:9px}.loky-qr-card.is-visible{display:grid}.loky-qr-box{width:206px;height:206px;background:#fff;border-radius:14px;padding:8px;display:grid;place-items:center;box-shadow:0 0 34px rgba(95,219,255,.15)}.loky-qr-box img,.loky-qr-box canvas{max-width:190px!important;max-height:190px!important}.loky-qr-title{font-size:10px;font-weight:800;letter-spacing:.12em}.loky-qr-meta{font-size:8px;color:#769cad;text-align:center;line-height:1.5}.loky-copy-invite{height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(105,211,243,.18);background:rgba(8,39,53,.65);color:#a9e7f8;font-size:8px;font-weight:700}
      .loky-device-list{display:grid;gap:8px}.loky-device-list-title{margin-top:4px;font-size:9px;letter-spacing:.12em;color:#9edbec}.loky-device-row{padding:11px 12px;border:1px solid rgba(93,181,211,.11);border-radius:14px;background:rgba(3,18,27,.52);display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}.loky-device-row.is-revoked{opacity:.45}.loky-device-copy{display:grid;gap:3px;min-width:0}.loky-device-copy strong{font-size:9px;color:#d0f2fc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.loky-device-copy span{font-size:7.5px;color:#6f94a6;line-height:1.45}.loky-device-actions{display:flex;gap:5px}.loky-device-action{height:30px;padding:0 9px;border-radius:9px;border:1px solid rgba(99,192,222,.14);background:rgba(8,36,49,.65);color:#9dd9ea;font-size:7px;font-weight:700}.loky-device-action.is-danger{color:#ffafa8;border-color:rgba(255,104,92,.18)}
      .loky-role-pill{display:inline-flex;width:max-content;padding:4px 8px;border-radius:999px;border:1px solid rgba(97,209,244,.18);background:rgba(10,61,79,.42);color:#9eeaff;font-size:7px;font-weight:800;letter-spacing:.1em}
      .loky-invite-landing{position:fixed;z-index:1000;inset:0;background:radial-gradient(circle at 50% 30%,rgba(12,62,84,.30),transparent 40%),#020b12;display:grid;place-items:center;padding:24px;color:#dff8ff}.loky-invite-landing-card{width:min(88vw,360px);padding:24px;border:1px solid rgba(100,210,244,.20);border-radius:24px;background:rgba(4,23,34,.94);box-shadow:0 30px 90px rgba(0,0,0,.5);display:grid;justify-items:center;gap:10px;text-align:center}.loky-invite-landing-dot{width:12px;height:12px;border-radius:50%;background:#62dcff;box-shadow:0 0 20px rgba(75,211,255,.72)}.loky-invite-landing strong{font-size:14px;letter-spacing:.14em}.loky-invite-landing span{font-size:9px;color:#799fb0;line-height:1.55}
    `;
    document.head.appendChild(style);
  }

  function make(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=text;return el;}
  function capability(){return localStorage.getItem(DEVICE_KEY)||'';}
  async function api(action,payload={}){
    const headers={'content-type':'application/json'};
    const cap=capability();if(cap)headers['x-loky-device']=cap;
    const response=await fetch(DEVICE_ENDPOINT,{method:'POST',headers,cache:'no-store',body:JSON.stringify({action,...payload})});
    const data=await response.json().catch(()=>({ok:false,error:`HTTP_${response.status}`}));
    if(!response.ok||!data?.ok){const error=new Error(data?.error||`HTTP_${response.status}`);error.code=data?.error||'';throw error;}
    return data;
  }
  function fmtExpiry(value){
    const ms=Date.parse(value||'');if(!Number.isFinite(ms))return 'SIN FECHA';
    const diff=ms-Date.now();if(diff<=0)return 'EXPIRADO';
    const min=Math.ceil(diff/60000);if(min<60)return `${min} MIN`;
    const hr=Math.ceil(min/60);if(hr<48)return `${hr} H`;
    return `${Math.ceil(hr/24)} D`;
  }
  function fmtWhen(value){
    const ms=Date.parse(value||'');if(!Number.isFinite(ms))return 'NUNCA';
    const diff=Math.max(0,Date.now()-ms),min=Math.floor(diff/60000);if(min<1)return 'AHORA';if(min<60)return `HACE ${min} MIN`;const hr=Math.floor(min/60);if(hr<24)return `HACE ${hr} H`;return `HACE ${Math.floor(hr/24)} D`;
  }

  function loadQrLib(){
    if(window.QRCode)return Promise.resolve(window.QRCode);
    if(qrPromise)return qrPromise;
    qrPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=QR_LIB;script.async=true;script.crossOrigin='anonymous';
      script.onload=()=>window.QRCode?resolve(window.QRCode):reject(new Error('QR_LIB_UNAVAILABLE'));
      script.onerror=()=>reject(new Error('QR_LIB_LOAD_FAILED'));
      document.head.appendChild(script);
    });
    return qrPromise;
  }

  function accordion(title,subtitle,icon,open=false){
    const root=make('section',`loky-accordion${open?' is-open':''}`);
    const toggle=make('button','loky-accordion-toggle');toggle.type='button';toggle.setAttribute('aria-expanded',String(open));
    toggle.appendChild(make('span','loky-accordion-icon',icon));
    const copy=make('span','loky-accordion-copy');copy.appendChild(make('strong','',title));copy.appendChild(make('span','',subtitle));toggle.appendChild(copy);toggle.appendChild(make('span','loky-accordion-chevron','›'));
    const body=make('div','loky-accordion-body'),inner=make('div','loky-accordion-inner'),content=make('div','loky-accordion-content');inner.appendChild(content);body.appendChild(inner);root.appendChild(toggle);root.appendChild(body);
    toggle.addEventListener('click',()=>{const next=!root.classList.contains('is-open');root.classList.toggle('is-open',next);toggle.setAttribute('aria-expanded',String(next));if(next)root.dispatchEvent(new CustomEvent('loky:open',{bubbles:false}));});
    return {root,toggle,content};
  }

  function renderSpeechModes(host){
    const list=make('div','loky-mode-list loky-mode-compact');host.appendChild(list);
    const paint=()=>{const current=features.settings.speechMode;for(const button of list.children||[]){button.classList.toggle('is-selected',button.dataset.mode===current);button.setAttribute('aria-pressed',String(button.dataset.mode===current));}};
    for(const [mode,meta] of Object.entries(features.speechModes||{})){
      const button=make('button','loky-mode-option');button.type='button';button.dataset.mode=mode;
      button.appendChild(make('span','loky-mode-dot'));
      const copy=make('span','loky-mode-copy');copy.appendChild(make('strong','',meta.label));copy.appendChild(make('small','',meta.description));button.appendChild(copy);
      button.addEventListener('click',()=>{features.settings.setSpeechMode(mode);paint();});list.appendChild(button);
    }
    paint();
  }

  function renderVoice(host){
    const box=make('div','loky-simple-status');box.appendChild(make('span','loky-role-pill','ACTUAL'));box.appendChild(make('strong','','KORE · GEMINI LIVE'));box.appendChild(make('span','','La voz conversacional actual queda protegida. Aquí agregaremos nuevas voces sin alterar la conversación aprobada.'));host.appendChild(box);
  }
  function renderPersonality(host){
    const box=make('div','loky-simple-status');box.appendChild(make('span','loky-role-pill','BASE'));box.appendChild(make('strong','','PERSONALIDAD NATURAL'));box.appendChild(make('span','','Sección preparada para perfiles de personalidad. La prioridad actual es Dispositivos; no se modifica el Conversation Core.'));host.appendChild(box);
  }

  async function renderDevices(host){
    host.textContent='';
    const loading=make('div','loky-simple-status');loading.appendChild(make('strong','','COMPROBANDO DISPOSITIVO…'));loading.appendChild(make('span','','Validando acceso de forma segura.'));host.appendChild(loading);
    let status;
    try{status=await api('status');}catch(error){host.textContent='';const box=make('div','loky-simple-status');box.appendChild(make('strong','','DISPOSITIVO NO AUTORIZADO'));box.appendChild(make('span','','Este dispositivo no tiene acceso activo a LOKY.'));host.appendChild(box);return;}
    host.textContent='';
    if(status.role!=='owner'){
      const box=make('div','loky-simple-status');box.appendChild(make('span','loky-role-pill','INVITADO'));box.appendChild(make('strong','',status.displayName||'Dispositivo invitado'));box.appendChild(make('span','',`Acceso restante: ${fmtExpiry(status.expiresAt)}. Este dispositivo recibe la misma app y actualizaciones publicadas por el Owner.`));host.appendChild(box);return;
    }

    const wrap=make('div','loky-device-owner');
    const owner=make('div','loky-simple-status');owner.appendChild(make('span','loky-role-pill','OWNER'));owner.appendChild(make('strong','','CONTROL DE DISPOSITIVOS'));owner.appendChild(make('span','','Genera un QR temporal. El QR nunca contiene tu código Owner; crea una credencial independiente que puedes revocar o dejar expirar.'));wrap.appendChild(owner);

    const toolbar=make('div','loky-device-toolbar');
    const label=make('input','loky-device-label');label.type='text';label.maxLength=64;label.placeholder='Nombre del acceso (ej. iPad Air 5 prueba)';label.value='iPad Air 5 prueba';
    toolbar.appendChild(label);
    const durations=make('div','loky-duration-grid');let accessMinutes=1440;
    const durationOptions=[[60,'1 H'],[1440,'24 H'],[10080,'7 D'],[43200,'30 D']];
    for(const [minutes,text] of durationOptions){const btn=make('button','loky-duration-btn',text);btn.type='button';if(minutes===accessMinutes)btn.classList.add('is-selected');btn.addEventListener('click',()=>{accessMinutes=minutes;for(const b of durations.children)b.classList.toggle('is-selected',b===btn);});durations.appendChild(btn);}toolbar.appendChild(durations);
    const create=make('button','loky-create-invite','CREAR QR DE ACCESO');create.type='button';toolbar.appendChild(create);
    const message=make('div','loky-device-message');toolbar.appendChild(message);wrap.appendChild(toolbar);

    const qrCard=make('div','loky-qr-card');const qrTitle=make('div','loky-qr-title','ESCANEA CON EL IPAD');const qrBox=make('div','loky-qr-box');const qrMeta=make('div','loky-qr-meta');const copy=make('button','loky-copy-invite','COPIAR ENLACE');copy.type='button';qrCard.append(qrTitle,qrBox,qrMeta,copy);wrap.appendChild(qrCard);
    let lastInviteUrl='';
    copy.addEventListener('click',async()=>{if(!lastInviteUrl)return;try{await navigator.clipboard.writeText(lastInviteUrl);copy.textContent='COPIADO';setTimeout(()=>copy.textContent='COPIAR ENLACE',1200);}catch{}});

    const listTitle=make('div','loky-device-list-title','DISPOSITIVOS AUTORIZADOS');const list=make('div','loky-device-list');wrap.append(listTitle,list);host.appendChild(wrap);

    async function refreshList(){
      list.textContent='';
      try{
        const data=await api('list');const devices=Array.isArray(data.devices)?data.devices:[];
        if(!devices.length){const empty=make('div','loky-simple-status');empty.appendChild(make('span','','Aún no hay dispositivos invitados.'));list.appendChild(empty);return;}
        for(const item of devices){
          const revoked=Boolean(item.revoked_at)||Date.parse(item.expires_at||'')<=Date.now();
          const row=make('div',`loky-device-row${revoked?' is-revoked':''}`);const dc=make('div','loky-device-copy');dc.appendChild(make('strong','',item.display_name||'Dispositivo invitado'));
          dc.appendChild(make('span','',revoked?'ACCESO FINALIZADO':`EXPIRA EN ${fmtExpiry(item.expires_at)} · ÚLTIMO USO ${fmtWhen(item.last_seen_at)}`));row.appendChild(dc);
          const actions=make('div','loky-device-actions');
          if(!revoked){const plus=make('button','loky-device-action','+24H');plus.type='button';plus.addEventListener('click',async()=>{plus.disabled=true;try{await api('extend_device',{deviceId:item.id,addMinutes:1440});await refreshList();}finally{plus.disabled=false;}});const revoke=make('button','loky-device-action is-danger','REVOCAR');revoke.type='button';revoke.addEventListener('click',async()=>{revoke.disabled=true;try{await api('revoke_device',{deviceId:item.id});await refreshList();}finally{revoke.disabled=false;}});actions.append(plus,revoke);}row.appendChild(actions);list.appendChild(row);
        }
      }catch(error){const err=make('div','loky-simple-status');err.appendChild(make('span','','No se pudo actualizar la lista de dispositivos.'));list.appendChild(err);}
    }

    create.addEventListener('click',async()=>{
      create.disabled=true;message.classList.remove('is-error');message.textContent='CREANDO ACCESO…';qrCard.classList.remove('is-visible');qrBox.textContent='';
      try{
        const data=await api('create_invite',{label:label.value||'Invitado',accessMinutes,inviteValidMinutes:15,maxRedemptions:1});
        lastInviteUrl=data.inviteUrl;
        await loadQrLib();
        qrBox.textContent='';
        new window.QRCode(qrBox,{text:lastInviteUrl,width:190,height:190,colorDark:'#06121a',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M});
        qrTitle.textContent=(label.value||'ESCANEA CON EL IPAD').toUpperCase();
        qrMeta.textContent=`QR válido 15 min · acceso ${accessMinutes===60?'1 hora':accessMinutes===1440?'24 horas':accessMinutes===10080?'7 días':'30 días'} · un solo dispositivo`;
        qrCard.classList.add('is-visible');message.textContent='LISTO PARA ESCANEAR';
        await refreshList();
      }catch(error){message.classList.add('is-error');message.textContent=`NO SE PUDO CREAR EL QR · ${String(error?.code||error?.message||'ERROR')}`;}
      finally{create.disabled=false;}
    });
    await refreshList();
  }

  function enhanceSettingsWindow(){
    const page=features.windows.active;if(!page||!page.classList.contains('loky-settings-window'))return page;
    const host=page.querySelector('.loky-feature-content');if(!host)return page;
    host.textContent='';host.classList.add('loky-settings-plus');page.scrollTop=0;
    const talk=accordion('MODO DE HABLAR','Natural, normal, directo o vulgar.','◉',true);renderSpeechModes(talk.content);host.appendChild(talk.root);
    const voice=accordion('VOZ','Voz actual y futuras voces de LOKY.','♪',false);renderVoice(voice.content);host.appendChild(voice.root);
    const personality=accordion('PERSONALIDAD','Perfiles de comportamiento y expresión.','✦',false);renderPersonality(personality.content);host.appendChild(personality.root);
    const devices=accordion('DISPOSITIVOS','Comparte LOKY por QR y controla tiempo/acceso.','▣',true);host.appendChild(devices.root);
    let rendered=false;const ensure=()=>{if(rendered)return;rendered=true;renderDevices(devices.content);};devices.root.addEventListener('loky:open',ensure);ensure();
    return page;
  }

  const nativeOpenSettings=features.windows.openSettings;
  features.windows.openSettings=function(){const page=nativeOpenSettings();queueMicrotask(enhanceSettingsWindow);return page;};
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('.feature-settings');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    features.windows.openSettings();
  },true);

  async function processInviteFromUrl(){
    let url;try{url=new URL(location.href);}catch{return;}
    const invite=String(url.searchParams.get('invite')||'').trim();if(invite.length<20)return;
    injectStyles();
    const landing=make('div','loky-invite-landing');const card=make('div','loky-invite-landing-card');card.appendChild(make('span','loky-invite-landing-dot'));card.appendChild(make('strong','','VINCULANDO LOKY'));const text=make('span','','Validando invitación segura…');card.appendChild(text);landing.appendChild(card);document.body.appendChild(landing);
    const existing=capability();
    if(existing){
      text.textContent='Este dispositivo ya está vinculado. No se reemplazó su acceso.';
      url.searchParams.delete('invite');history.replaceState({},'',url.pathname+(url.search||'')+url.hash);setTimeout(()=>landing.remove(),1800);return;
    }
    try{
      const response=await fetch(DEVICE_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({action:'redeem_invite',inviteToken:invite,deviceName:'LOKY invitado',platform:/iPad/i.test(navigator.userAgent)?'iPadOS':'iOS'})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data?.ok||String(data.capability||'').length<16)throw new Error(data?.error||'INVITE_FAILED');
      localStorage.setItem(DEVICE_KEY,String(data.capability));
      text.textContent='Dispositivo autorizado. Abriendo LOKY…';
      url.searchParams.delete('invite');
      setTimeout(()=>location.replace(url.pathname+(url.search||'')+url.hash),550);
    }catch(error){text.textContent=String(error?.message||error)==='INVITE_EXPIRED_OR_USED'?'Este QR ya fue usado o expiró.':'No se pudo activar esta invitación.';url.searchParams.delete('invite');history.replaceState({},'',url.pathname+(url.search||'')+url.hash);}
  }

  injectStyles();
  processInviteFromUrl();
  window.LOKY_PC4_SETTINGS_PLUS={version:VERSION,deviceEndpoint:DEVICE_ENDPOINT,enhanceSettingsWindow,processInviteFromUrl};
})();
