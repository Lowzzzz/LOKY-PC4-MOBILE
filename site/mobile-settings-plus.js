(() => {
  'use strict';

  const VERSION='0.3.2R4F7R1-voice-preview-confirm';
  const DEVICE_KEY='loky_pc4_device_capability_v1';
  const DEVICE_ENDPOINT='https://novgwydgcvlboujnmygq.supabase.co/functions/v1/loky-pc4-mobile-devices';
  const VOICE_PREVIEW_ENDPOINT='https://novgwydgcvlboujnmygq.supabase.co/functions/v1/loky-pc4-mobile-voice-preview';
  const QR_LIB='https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs@04f46c6a0708418cb7b96fc563eacae0fbf77674/qrcode.min.js';
  const features=window.LOKY_PC4_FEATURES;
  if(!features)return;

  let qrPromise=null;
  let voicePreviewContext=null;
  let voicePreviewSource=null;
  const voicePreviewCache=new Map();
  let voicePreviewRequest=0;

  function make(tag,className,text){
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(text!=null)el.textContent=text;
    return el;
  }

  function injectStyles(){
    if(document.getElementById('lokySettingsDashboardStyles'))return;
    const style=document.createElement('style');
    style.id='lokySettingsDashboardStyles';
    style.textContent=`
      .loky-settings-window .loky-feature-content{
        overflow:hidden!important;
        min-height:0!important;
        padding:12px 14px calc(16px + env(safe-area-inset-bottom,0px))!important;
      }
      .loky-settings-dashboard{
        height:100%;min-height:0;display:grid;grid-template-rows:auto auto auto auto;
        align-content:start;gap:10px;
      }
      .loky-dash-card{
        border:1px solid rgba(101,197,232,.15);border-radius:18px;
        background:linear-gradient(180deg,rgba(8,29,42,.88),rgba(4,17,27,.90));
        box-shadow:0 14px 36px rgba(0,0,0,.18),inset 0 1px 0 rgba(185,235,255,.04);
        padding:12px 13px;display:grid;gap:9px;min-width:0;
      }
      .loky-dash-head{display:grid;grid-template-columns:38px 1fr auto;align-items:center;gap:10px}
      .loky-dash-icon{
        width:38px;height:38px;border-radius:50%;display:grid;place-items:center;
        border:1px solid rgba(107,211,246,.20);background:rgba(14,54,72,.52);
        color:#a9efff;font-size:16px;box-shadow:inset 0 1px rgba(255,255,255,.04)
      }
      .loky-dash-copy{display:grid;gap:3px;min-width:0}
      .loky-dash-copy strong{font-size:11px;letter-spacing:.13em;color:#dcf7ff}
      .loky-dash-copy span{font-size:8px;color:#7899aa;line-height:1.35}
      .loky-dash-meta{
        font-size:7px;letter-spacing:.10em;color:#80b6c9;padding:5px 8px;border-radius:999px;
        border:1px solid rgba(104,205,240,.14);background:rgba(8,42,57,.58);white-space:nowrap
      }
      .loky-mode-chips{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
      .loky-mode-chip{
        height:34px;border-radius:10px;border:1px solid rgba(100,194,226,.14);
        background:rgba(7,34,47,.60);color:#7faabe;font-size:7.5px;font-weight:800;letter-spacing:.04em
      }
      .loky-mode-chip.is-selected{
        color:#d5f8ff;border-color:rgba(108,223,255,.52);background:rgba(16,74,96,.74);
        box-shadow:0 0 13px rgba(70,198,239,.10)
      }
      .loky-dash-action{cursor:pointer}
      .loky-dash-action:active{filter:brightness(1.12)}
      .loky-dash-open{
        height:34px;border-radius:10px;border:1px solid rgba(107,215,248,.20);
        background:rgba(9,48,65,.64);color:#b9ecfb;font-size:8px;font-weight:800;letter-spacing:.10em
      }

      .loky-device-screen{
        height:100%;min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);
        gap:10px;
      }
      .loky-device-screen-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .loky-device-back{
        height:32px;padding:0 11px;border-radius:999px;border:1px solid rgba(102,203,239,.18);
        background:rgba(10,40,55,.56);color:#bfefff;font-size:8px;font-weight:800;letter-spacing:.08em
      }
      .loky-device-screen-title{font-size:10px;font-weight:800;letter-spacing:.12em;color:#d7f5ff}
      .loky-role-pill{
        display:inline-flex;width:max-content;padding:4px 8px;border-radius:999px;
        border:1px solid rgba(97,209,244,.18);background:rgba(10,61,79,.42);
        color:#9eeaff;font-size:7px;font-weight:800;letter-spacing:.10em
      }
      .loky-device-control{
        border:1px solid rgba(100,194,225,.13);border-radius:16px;background:rgba(4,20,30,.58);
        padding:11px;display:grid;gap:8px
      }
      .loky-device-owner-copy{display:grid;gap:4px}
      .loky-device-owner-copy strong{font-size:10px;letter-spacing:.10em}
      .loky-device-owner-copy span{font-size:8px;color:#769cad;line-height:1.4}
      .loky-device-label{
        height:38px;border-radius:11px;border:1px solid rgba(102,198,230,.16);
        background:rgba(1,12,19,.62);color:#d9f7ff;padding:0 11px;outline:none;font-size:10px
      }
      .loky-duration-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
      .loky-duration-btn{
        height:34px;border-radius:10px;border:1px solid rgba(100,194,226,.16);
        background:rgba(8,35,48,.58);color:#7faabe;font-size:8px;font-weight:800
      }
      .loky-duration-btn.is-selected{
        border-color:rgba(108,223,255,.58);color:#d3f8ff;background:rgba(16,74,96,.72)
      }
      .loky-create-invite{
        height:38px;border-radius:11px;border:1px solid rgba(109,221,255,.34);
        background:linear-gradient(180deg,rgba(25,100,129,.78),rgba(7,47,66,.86));
        color:#d8f8ff;font-size:8.5px;font-weight:800;letter-spacing:.10em
      }
      .loky-device-message{font-size:7.5px;color:#799eaf;text-align:center;min-height:11px}
      .loky-device-message.is-error{color:#ff9b91}

      .loky-device-manage{
        min-height:0;border:1px solid rgba(100,194,225,.12);border-radius:16px;
        background:rgba(4,20,30,.48);padding:10px;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:7px
      }
      .loky-device-manage-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .loky-device-manage-head strong{font-size:9px;letter-spacing:.11em;color:#aee4f3}
      .loky-device-page-label{font-size:7px;color:#688a9b}
      .loky-device-list{display:grid;align-content:start;gap:7px;min-height:0}
      .loky-device-row{
        padding:9px 10px;border:1px solid rgba(93,181,211,.11);border-radius:12px;
        background:rgba(3,18,27,.54);display:grid;grid-template-columns:1fr auto;gap:7px;align-items:center
      }
      .loky-device-row.is-revoked{opacity:.45}
      .loky-device-copy{display:grid;gap:3px;min-width:0}
      .loky-device-copy strong{font-size:8.5px;color:#d0f2fc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .loky-device-copy span{font-size:7px;color:#6f94a6;line-height:1.35}
      .loky-device-actions{display:flex;gap:4px}
      .loky-device-action{
        height:28px;padding:0 8px;border-radius:8px;border:1px solid rgba(99,192,222,.14);
        background:rgba(8,36,49,.65);color:#9dd9ea;font-size:6.8px;font-weight:700
      }
      .loky-device-action.is-danger{color:#ffafa8;border-color:rgba(255,104,92,.18)}
      .loky-device-pager{display:flex;justify-content:center;align-items:center;gap:8px}
      .loky-device-page-btn{
        width:34px;height:28px;border-radius:8px;border:1px solid rgba(99,192,222,.14);
        background:rgba(8,36,49,.65);color:#a8dceb;font-size:13px
      }
      .loky-device-empty{font-size:8px;color:#688a9b;text-align:center;padding:16px 8px}

      .loky-settings-modal{
        position:absolute;z-index:40;inset:0;background:rgba(1,7,12,.78);
        backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
        display:grid;place-items:center;padding:18px
      }
      .loky-settings-modal-card{
        width:min(90vw,370px);border:1px solid rgba(105,205,238,.18);border-radius:20px;
        background:linear-gradient(180deg,rgba(7,31,45,.98),rgba(3,16,25,.99));
        box-shadow:0 26px 80px rgba(0,0,0,.52);padding:15px;display:grid;gap:11px;justify-items:center
      }
      .loky-settings-modal-card strong{font-size:11px;letter-spacing:.12em;color:#dcf8ff}
      .loky-settings-modal-card span{font-size:8px;color:#7899aa;line-height:1.45;text-align:center}
      .loky-qr-box{
        width:206px;height:206px;background:#fff;border-radius:14px;padding:8px;
        display:grid;place-items:center;box-shadow:0 0 34px rgba(95,219,255,.15)
      }
      .loky-qr-box img,.loky-qr-box canvas{max-width:190px!important;max-height:190px!important}
      .loky-modal-actions{display:flex;gap:7px}
      .loky-modal-btn{
        height:34px;padding:0 13px;border-radius:999px;border:1px solid rgba(105,211,243,.18);
        background:rgba(8,39,53,.65);color:#a9e7f8;font-size:7.5px;font-weight:700
      }
      .loky-choice-grid{
        width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px
      }
      .loky-choice-btn{
        min-height:48px;padding:8px 9px;border-radius:11px;border:1px solid rgba(100,194,226,.14);
        background:rgba(7,34,47,.62);display:grid;gap:3px;text-align:left;align-content:center
      }
      .loky-choice-btn strong{
        font-size:8.5px!important;letter-spacing:.07em!important;color:#c9effa!important;margin:0!important
      }
      .loky-choice-btn span{
        font-size:7px!important;color:#7198aa!important;line-height:1.28!important;text-align:left!important
      }
      .loky-choice-btn.is-selected{
        border-color:rgba(108,223,255,.55);background:rgba(16,74,96,.72);
        box-shadow:0 0 14px rgba(70,198,239,.08)
      }
      .loky-choice-btn.is-selected strong{color:#e3fbff!important}
      .loky-choice-note{font-size:7.5px!important;color:#7fa7b8!important;line-height:1.45!important}
      .loky-choice-preview-status{
        min-height:15px;font-size:7.5px;color:#8fc5d8;letter-spacing:.04em;text-align:center
      }
      .loky-choice-preview-status.is-error{color:#ff9f97}
      .loky-choice-select{
        min-width:150px;height:38px;padding:0 18px;border-radius:999px;
        border:1px solid rgba(108,223,255,.34);
        background:linear-gradient(180deg,rgba(24,92,119,.82),rgba(8,49,68,.88));
        color:#dcf9ff;font-size:8px;font-weight:900;letter-spacing:.12em
      }

      .loky-invite-landing{
        position:fixed;z-index:1000;inset:0;
        background:radial-gradient(circle at 50% 30%,rgba(12,62,84,.30),transparent 40%),#020b12;
        display:grid;place-items:center;padding:24px;color:#dff8ff
      }
      .loky-invite-landing-card{
        width:min(88vw,360px);padding:24px;border:1px solid rgba(100,210,244,.20);
        border-radius:24px;background:rgba(4,23,34,.94);box-shadow:0 30px 90px rgba(0,0,0,.5);
        display:grid;justify-items:center;gap:10px;text-align:center
      }
      .loky-invite-landing-dot{width:12px;height:12px;border-radius:50%;background:#62dcff;box-shadow:0 0 20px rgba(75,211,255,.72)}
      .loky-invite-landing strong{font-size:14px;letter-spacing:.14em}
      .loky-invite-landing span{font-size:9px;color:#799fb0;line-height:1.55}
      .loky-guest-code{font-size:22px!important;font-weight:900!important;letter-spacing:.16em!important;color:#dff9ff!important;padding:10px 14px;border-radius:14px;border:1px solid rgba(100,216,250,.24);background:rgba(9,52,70,.72);box-shadow:0 0 22px rgba(72,204,247,.10)}
      .loky-guest-copy{height:36px;padding:0 15px;border-radius:999px;border:1px solid rgba(105,211,243,.20);background:rgba(8,39,53,.72);color:#b8edff;font-size:8px;font-weight:800;letter-spacing:.08em}

      @media(max-height:720px){
        .loky-settings-dashboard{gap:7px}
        .loky-dash-card{padding:9px 11px;gap:7px}
        .loky-dash-icon{width:34px;height:34px}
        .loky-dash-head{grid-template-columns:34px 1fr auto}
        .loky-mode-chip{height:31px}
      }
    `;
    document.head.appendChild(style);
  }

  function capability(){return localStorage.getItem(DEVICE_KEY)||'';}
  function normalizeGuestCode(value){return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
  function isGuestCode(value){return /^G[A-Z2-9]{8}$/.test(normalizeGuestCode(value));}

  async function api(action,payload={}){
    const headers={'content-type':'application/json'};
    const cap=capability();
    if(cap)headers['x-loky-device']=cap;
    const response=await fetch(DEVICE_ENDPOINT,{
      method:'POST',headers,cache:'no-store',
      body:JSON.stringify({action,...payload})
    });
    const data=await response.json().catch(()=>({ok:false,error:`HTTP_${response.status}`}));
    if(!response.ok||!data?.ok){
      const error=new Error(data?.error||`HTTP_${response.status}`);
      error.code=data?.error||'';
      throw error;
    }
    return data;
  }

  function fmtExpiry(value){
    const ms=Date.parse(value||'');
    if(!Number.isFinite(ms))return 'SIN FECHA';
    const diff=ms-Date.now();
    if(diff<=0)return 'EXPIRADO';
    const min=Math.ceil(diff/60000);
    if(min<60)return `${min} MIN`;
    const hr=Math.ceil(min/60);
    if(hr<48)return `${hr} H`;
    return `${Math.ceil(hr/24)} D`;
  }

  function fmtWhen(value){
    const ms=Date.parse(value||'');
    if(!Number.isFinite(ms))return 'NUNCA';
    const diff=Math.max(0,Date.now()-ms),min=Math.floor(diff/60000);
    if(min<1)return 'AHORA';
    if(min<60)return `HACE ${min} MIN`;
    const hr=Math.floor(min/60);
    if(hr<24)return `HACE ${hr} H`;
    return `HACE ${Math.floor(hr/24)} D`;
  }

  function loadQrLib(){
    if(window.QRCode)return Promise.resolve(window.QRCode);
    if(qrPromise)return qrPromise;
    qrPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=QR_LIB;
      script.async=true;
      script.crossOrigin='anonymous';
      script.onload=()=>window.QRCode?resolve(window.QRCode):reject(new Error('QR_LIB_UNAVAILABLE'));
      script.onerror=()=>reject(new Error('QR_LIB_LOAD_FAILED'));
      document.head.appendChild(script);
    });
    return qrPromise;
  }

  function clearHost(host){
    while(host.firstChild)host.removeChild(host.firstChild);
  }

  function showInfoModal(page,title,body){
    const modal=make('div','loky-settings-modal');
    const card=make('div','loky-settings-modal-card');
    card.appendChild(make('strong','',title));
    card.appendChild(make('span','',body));
    const close=make('button','loky-modal-btn','CERRAR');
    close.type='button';
    close.addEventListener('click',()=>modal.remove());
    card.appendChild(close);
    modal.appendChild(card);
    page.appendChild(modal);
  }

  function stopVoicePreview(){
    voicePreviewRequest++;
    if(voicePreviewSource){
      try{voicePreviewSource.stop()}catch{}
      voicePreviewSource=null;
    }
  }

  async function primeVoicePreviewAudio(){
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)throw new Error('AUDIO_PREVIEW_UNAVAILABLE');
    if(!voicePreviewContext)voicePreviewContext=new AudioCtx();
    if(voicePreviewContext.state==='suspended')await voicePreviewContext.resume();
    return voicePreviewContext;
  }

  function decodePcm16(base64,sampleRate=24000){
    const binary=atob(String(base64||''));
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    const samples=Math.floor(bytes.byteLength/2);
    const ctx=voicePreviewContext;
    if(!ctx||samples<1)throw new Error('VOICE_PREVIEW_EMPTY');
    const buffer=ctx.createBuffer(1,samples,Number(sampleRate)||24000);
    const channel=buffer.getChannelData(0);
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    for(let i=0;i<samples;i++)channel[i]=view.getInt16(i*2,true)/32768;
    return buffer;
  }

  async function fetchVoicePreview(voiceName){
    if(voicePreviewCache.has(voiceName))return voicePreviewCache.get(voiceName);
    const cap=capability();
    if(!cap)throw new Error('DEVICE_NOT_AUTHORIZED');
    const response=await fetch(VOICE_PREVIEW_ENDPOINT,{
      method:'POST',
      headers:{'content-type':'application/json','x-loky-device':cap},
      cache:'no-store',
      body:JSON.stringify({voiceName}),
    });
    const data=await response.json().catch(()=>({ok:false,error:`HTTP_${response.status}`}));
    if(!response.ok||!data?.ok||!data?.audio)throw new Error(data?.error||`HTTP_${response.status}`);
    const value={audio:String(data.audio),sampleRate:Number(data.sampleRate)||24000};
    voicePreviewCache.set(voiceName,value);
    return value;
  }

  async function playVoicePreview(voiceName,status){
    const requestId=++voicePreviewRequest;
    stopVoicePreview();
    voicePreviewRequest=requestId;
    if(status){
      status.classList.remove('is-error');
      status.textContent='CARGANDO MUESTRA…';
    }
    try{
      const ctx=await primeVoicePreviewAudio();
      const preview=await fetchVoicePreview(voiceName);
      if(requestId!==voicePreviewRequest)return false;
      const source=ctx.createBufferSource();
      source.buffer=decodePcm16(preview.audio,preview.sampleRate);
      source.connect(ctx.destination);
      voicePreviewSource=source;
      source.onended=()=>{if(voicePreviewSource===source)voicePreviewSource=null;if(status&&requestId===voicePreviewRequest)status.textContent='MUESTRA LISTA · PUEDES PROBAR OTRA VOZ';};
      source.start();
      if(status)status.textContent='REPRODUCIENDO MUESTRA…';
      return true;
    }catch(error){
      if(status&&requestId===voicePreviewRequest){
        status.classList.add('is-error');
        status.textContent='NO SE PUDO REPRODUCIR LA MUESTRA';
      }
      console.warn('[LOKY Voice Preview]',error?.message||error);
      return false;
    }
  }

  function showProfileModal(page,host,title,profiles,current,setter,note,options={}){
    const modal=make('div','loky-settings-modal');
    const card=make('div','loky-settings-modal-card');
    card.appendChild(make('strong','',title));
    const noteEl=note?make('span','loky-choice-note',note):null;
    if(noteEl)card.appendChild(noteEl);
    const status=make('div','loky-choice-preview-status',options.previewVoice?'TOCA UNA VOZ PARA ESCUCHARLA':'ELIGE UNA OPCIÓN Y CONFIRMA');
    card.appendChild(status);
    const grid=make('div','loky-choice-grid');
    let draft=current;
    const buttons=[];

    const paint=()=>{
      for(const btn of buttons)btn.classList.toggle('is-selected',btn.dataset.choice===draft);
    };

    for(const [key,meta] of Object.entries(profiles||{})){
      const btn=make('button','loky-choice-btn');
      btn.type='button';
      btn.dataset.choice=key;
      btn.appendChild(make('strong','',String(meta?.label||key).toUpperCase()));
      btn.appendChild(make('span','',String(meta?.description||'')));
      btn.addEventListener('click',async()=>{
        draft=key;
        paint();
        if(options.previewVoice){
          const voiceName=String(meta?.name||meta?.label||'Kore');
          await primeVoicePreviewAudio().catch(()=>{});
          await playVoicePreview(voiceName,status);
        }else{
          status.classList.remove('is-error');
          status.textContent=`${String(meta?.label||key).toUpperCase()} · LISTA PARA SELECCIONAR`;
        }
      });
      buttons.push(btn);
      grid.appendChild(btn);
    }
    card.appendChild(grid);
    paint();

    const select=make('button','loky-choice-select','SELECCIONAR');
    select.type='button';
    select.addEventListener('click',()=>{
      if(setter(draft)){
        stopVoicePreview();
        modal.remove();
        renderSettingsDashboard(page,host);
      }
    });
    card.appendChild(select);

    modal.addEventListener('click',event=>{
      if(event.target===modal){
        stopVoicePreview();
        modal.remove();
      }
    });
    modal.appendChild(card);
    page.appendChild(modal);
  }

  function renderSettingsDashboard(page,host){
    clearHost(host);
    host.className='loky-feature-content loky-settings-dashboard';

    const speech=make('section','loky-dash-card');
    const sh=make('div','loky-dash-head');
    sh.appendChild(make('span','loky-dash-icon','◉'));
    const sc=make('div','loky-dash-copy');
    sc.appendChild(make('strong','','MODO DE HABLAR'));
    sc.appendChild(make('span','','Elige el tono sin abrir otra ventana.'));
    sh.appendChild(sc);
    sh.appendChild(make('span','loky-dash-meta','ACTIVO'));
    speech.appendChild(sh);
    const chips=make('div','loky-mode-chips');
    const paint=()=>{
      const current=features.settings.speechMode;
      for(const b of chips.children||[])b.classList.toggle('is-selected',b.dataset.mode===current);
    };
    for(const [mode,meta] of Object.entries(features.speechModes||{})){
      const btn=make('button','loky-mode-chip',meta.label.toUpperCase());
      btn.type='button';
      btn.dataset.mode=mode;
      btn.addEventListener('click',()=>{features.settings.setSpeechMode(mode);paint();});
      chips.appendChild(btn);
    }
    speech.appendChild(chips);
    host.appendChild(speech);
    paint();

    const voiceMeta=features.voices?.[features.settings.voice]||features.voices?.kore||{label:'Kore',description:'Firme'};
    const voice=make('section','loky-dash-card loky-dash-action');
    const vh=make('div','loky-dash-head');
    vh.appendChild(make('span','loky-dash-icon','♪'));
    const vc=make('div','loky-dash-copy');
    vc.appendChild(make('strong','','VOZ'));
    vc.appendChild(make('span','',`${voiceMeta.label} · Gemini Live nativo · ${voiceMeta.description||''}`));
    vh.appendChild(vc);
    vh.appendChild(make('span','loky-dash-meta',String(voiceMeta.label||'Kore').toUpperCase()));
    voice.appendChild(vh);
    voice.addEventListener('click',()=>showProfileModal(
      page,host,'VOZ',features.voices||{},features.settings.voice,
      value=>features.settings.setVoice(value),
      'Toca una voz para escucharla. Solo se guarda cuando pulses SELECCIONAR.',
      {previewVoice:true}
    ));
    host.appendChild(voice);

    const personalityMeta=features.personalities?.[features.settings.personality]||features.personalities?.natural||{label:'Natural',description:'Perfil actual'};
    const personality=make('section','loky-dash-card loky-dash-action');
    const ph=make('div','loky-dash-head');
    ph.appendChild(make('span','loky-dash-icon','✦'));
    const pc=make('div','loky-dash-copy');
    pc.appendChild(make('strong','','PERSONALIDAD'));
    pc.appendChild(make('span','',`${personalityMeta.label} · ${personalityMeta.description||''}`));
    ph.appendChild(pc);
    ph.appendChild(make('span','loky-dash-meta',String(personalityMeta.label||'Natural').toUpperCase()));
    personality.appendChild(ph);
    personality.addEventListener('click',()=>showProfileModal(
      page,host,'PERSONALIDAD',features.personalities||{},features.settings.personality,
      value=>features.settings.setPersonality(value),
      'Toca una personalidad para preseleccionarla. Solo se guarda cuando pulses SELECCIONAR.'
    ));
    host.appendChild(personality);

    const devices=make('section','loky-dash-card');
    const dh=make('div','loky-dash-head');
    dh.appendChild(make('span','loky-dash-icon','▣'));
    const dc=make('div','loky-dash-copy');
    dc.appendChild(make('strong','','DISPOSITIVOS'));
    dc.appendChild(make('span','','QR, tiempo de acceso y control de invitados.'));
    dh.appendChild(dc);
    dh.appendChild(make('span','loky-dash-meta','OWNER'));
    devices.appendChild(dh);
    const open=make('button','loky-dash-open','ADMINISTRAR DISPOSITIVOS');
    open.type='button';
    open.addEventListener('click',()=>renderDevicesScreen(page,host));
    devices.appendChild(open);
    host.appendChild(devices);
  }

  async function renderDevicesScreen(page,host){
    clearHost(host);
    host.className='loky-feature-content';
    const screen=make('div','loky-device-screen');
    host.appendChild(screen);

    const top=make('div','loky-device-screen-top');
    const back=make('button','loky-device-back','‹ CONFIGURACIÓN');
    back.type='button';
    back.addEventListener('click',()=>renderSettingsDashboard(page,host));
    top.appendChild(back);
    top.appendChild(make('span','loky-device-screen-title','DISPOSITIVOS'));
    top.appendChild(make('span','loky-role-pill','LOKY MOBILE'));
    screen.appendChild(top);

    const control=make('section','loky-device-control');
    control.appendChild(make('span','loky-role-pill','VERIFICANDO'));
    const statusCopy=make('div','loky-device-owner-copy');
    statusCopy.appendChild(make('strong','','COMPROBANDO ACCESO…'));
    statusCopy.appendChild(make('span','','Validando este dispositivo.'));
    control.appendChild(statusCopy);
    screen.appendChild(control);

    const manage=make('section','loky-device-manage');
    manage.appendChild(make('div','loky-device-empty','Cargando dispositivos…'));
    screen.appendChild(manage);

    let status;
    try{
      status=await api('status');
    }catch{
      clearHost(control);
      control.appendChild(make('span','loky-role-pill','SIN ACCESO'));
      const c=make('div','loky-device-owner-copy');
      c.appendChild(make('strong','','DISPOSITIVO NO AUTORIZADO'));
      c.appendChild(make('span','','Este dispositivo no tiene acceso activo a LOKY.'));
      control.appendChild(c);
      manage.style.display='none';
      return;
    }

    clearHost(control);

    if(status.role!=='owner'){
      control.appendChild(make('span','loky-role-pill','INVITADO'));
      const c=make('div','loky-device-owner-copy');
      c.appendChild(make('strong','',status.displayName||'Dispositivo invitado'));
      c.appendChild(make('span','',`Acceso restante: ${fmtExpiry(status.expiresAt)}. Recibe la misma app y actualizaciones del Owner.`));
      control.appendChild(c);
      manage.style.display='none';
      return;
    }

    control.appendChild(make('span','loky-role-pill','OWNER'));
    const ownerCopy=make('div','loky-device-owner-copy');
    ownerCopy.appendChild(make('strong','','CREAR ACCESO TEMPORAL'));
    ownerCopy.appendChild(make('span','','El QR nunca contiene tu código Owner. Cada invitado recibe una credencial independiente.'));
    control.appendChild(ownerCopy);

    const label=make('input','loky-device-label');
    label.type='text';
    label.maxLength=64;
    label.placeholder='Nombre del acceso';
    label.value='iPad Air 5 prueba';
    control.appendChild(label);

    const durations=make('div','loky-duration-grid');
    let accessMinutes=1440;
    for(const [minutes,text] of [[60,'1 H'],[1440,'24 H'],[10080,'7 D'],[43200,'30 D']]){
      const btn=make('button','loky-duration-btn',text);
      btn.type='button';
      if(minutes===accessMinutes)btn.classList.add('is-selected');
      btn.addEventListener('click',()=>{
        accessMinutes=minutes;
        for(const b of durations.children)b.classList.toggle('is-selected',b===btn);
      });
      durations.appendChild(btn);
    }
    control.appendChild(durations);

    const create=make('button','loky-create-invite','CREAR QR DE ACCESO');
    create.type='button';
    control.appendChild(create);
    const message=make('div','loky-device-message');
    control.appendChild(message);

    let devices=[];
    let pageIndex=0;
    const PAGE_SIZE=2;

    function paintDeviceList(){
      clearHost(manage);
      const head=make('div','loky-device-manage-head');
      head.appendChild(make('strong','','DISPOSITIVOS AUTORIZADOS'));
      const pages=Math.max(1,Math.ceil(devices.length/PAGE_SIZE));
      if(pageIndex>=pages)pageIndex=pages-1;
      head.appendChild(make('span','loky-device-page-label',devices.length?`${pageIndex+1}/${pages}`:'0 DISPOSITIVOS'));
      manage.appendChild(head);

      const list=make('div','loky-device-list');
      const slice=devices.slice(pageIndex*PAGE_SIZE,pageIndex*PAGE_SIZE+PAGE_SIZE);
      if(!slice.length){
        list.appendChild(make('div','loky-device-empty','Aún no hay dispositivos invitados.'));
      }else{
        for(const item of slice){
          const revoked=Boolean(item.revoked_at)||Date.parse(item.expires_at||'')<=Date.now();
          const row=make('div',`loky-device-row${revoked?' is-revoked':''}`);
          const copy=make('div','loky-device-copy');
          copy.appendChild(make('strong','',item.display_name||'Dispositivo invitado'));
          copy.appendChild(make('span','',revoked?'ACCESO FINALIZADO':`EXPIRA EN ${fmtExpiry(item.expires_at)} · ÚLTIMO USO ${fmtWhen(item.last_seen_at)}`));
          row.appendChild(copy);
          const actions=make('div','loky-device-actions');
          if(!revoked){
            const plus=make('button','loky-device-action','+24H');
            plus.type='button';
            plus.addEventListener('click',async()=>{
              plus.disabled=true;
              try{await api('extend_device',{deviceId:item.id,addMinutes:1440});await refreshDevices();}
              finally{plus.disabled=false;}
            });
            const revoke=make('button','loky-device-action is-danger','REVOCAR');
            revoke.type='button';
            revoke.addEventListener('click',async()=>{
              revoke.disabled=true;
              try{await api('revoke_device',{deviceId:item.id});await refreshDevices();}
              finally{revoke.disabled=false;}
            });
            actions.append(plus,revoke);
          }
          row.appendChild(actions);
          list.appendChild(row);
        }
      }
      manage.appendChild(list);

      const pager=make('div','loky-device-pager');
      const prev=make('button','loky-device-page-btn','‹');
      const next=make('button','loky-device-page-btn','›');
      prev.type=next.type='button';
      prev.disabled=pageIndex<=0;
      next.disabled=pageIndex>=Math.ceil(devices.length/PAGE_SIZE)-1;
      prev.addEventListener('click',()=>{if(pageIndex>0){pageIndex--;paintDeviceList();}});
      next.addEventListener('click',()=>{if(pageIndex<Math.ceil(devices.length/PAGE_SIZE)-1){pageIndex++;paintDeviceList();}});
      pager.append(prev,next);
      manage.appendChild(pager);
    }

    async function refreshDevices(){
      try{
        const data=await api('list');
        devices=Array.isArray(data.devices)?data.devices:[];
      }catch{
        devices=[];
      }
      paintDeviceList();
    }

    function showQrModal(inviteUrl,title,meta){
      const modal=make('div','loky-settings-modal');
      const card=make('div','loky-settings-modal-card');
      card.appendChild(make('strong','',title));
      const qrBox=make('div','loky-qr-box');
      card.appendChild(qrBox);
      card.appendChild(make('span','',meta));
      const actions=make('div','loky-modal-actions');
      const copy=make('button','loky-modal-btn','COPIAR ENLACE');
      const close=make('button','loky-modal-btn','CERRAR');
      copy.type=close.type='button';
      copy.addEventListener('click',async()=>{
        try{
          await navigator.clipboard.writeText(inviteUrl);
          copy.textContent='COPIADO';
          setTimeout(()=>copy.textContent='COPIAR ENLACE',1000);
        }catch{}
      });
      close.addEventListener('click',()=>modal.remove());
      actions.append(copy,close);
      card.appendChild(actions);
      modal.appendChild(card);
      page.appendChild(modal);
      return qrBox;
    }

    create.addEventListener('click',async()=>{
      create.disabled=true;
      message.classList.remove('is-error');
      message.textContent='CREANDO ACCESO…';
      try{
        const data=await api('create_invite',{
          label:label.value||'Invitado',
          accessMinutes,
          inviteValidMinutes:15,
          maxRedemptions:1
        });
        await loadQrLib();
        const title=(label.value||'ESCANEA CON EL IPAD').toUpperCase();
        const meta=`QR válido 15 min · acceso ${accessMinutes===60?'1 hora':accessMinutes===1440?'24 horas':accessMinutes===10080?'7 días':'30 días'} · un solo dispositivo`;
        const qrBox=showQrModal(data.inviteUrl,title,meta);
        new window.QRCode(qrBox,{
          text:data.inviteUrl,width:190,height:190,
          colorDark:'#06121a',colorLight:'#ffffff',
          correctLevel:window.QRCode.CorrectLevel.M
        });
        message.textContent='QR LISTO';
        await refreshDevices();
      }catch(error){
        message.classList.add('is-error');
        message.textContent=`NO SE PUDO CREAR EL QR · ${String(error?.code||error?.message||'ERROR')}`;
      }finally{
        create.disabled=false;
      }
    });

    await refreshDevices();
  }

  function enhanceSettingsWindow(){
    const page=features.windows.active;
    if(!page||!page.classList.contains('loky-settings-window'))return page;
    const host=page.querySelector('.loky-feature-content');
    if(!host)return page;
    renderSettingsDashboard(page,host);
    return page;
  }

  const nativeOpenSettings=features.windows.openSettings;
  features.windows.openSettings=function(){
    const page=nativeOpenSettings();
    queueMicrotask(enhanceSettingsWindow);
    return page;
  };

  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('.feature-settings');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    features.windows.openSettings();
  },true);


  function setupGuestActivation(){
    if(capability())return;
    const pair=document.getElementById('pairCode');
    const activate=document.getElementById('activateButton');
    const hint=document.getElementById('conversationHint');
    if(pair)pair.placeholder='CÓDIGO DE ACCESO';
    if(hint&&String(hint.textContent||'').includes('Owner'))hint.textContent='Introduce tu código de acceso una sola vez';
    if(!pair||!activate)return;

    activate.addEventListener('click',async event=>{
      if(!isGuestCode(pair.value))return;
      event.preventDefault();
      event.stopImmediatePropagation();
      activate.disabled=true;
      const oldText=activate.textContent;
      activate.textContent='VINCULANDO…';
      try{
        const data=await api('claim_device',{activationCode:normalizeGuestCode(pair.value)});
        if(String(data?.capability||'').length<16)throw new Error('GUEST_CLAIM_FAILED');
        localStorage.setItem(DEVICE_KEY,String(data.capability));
        pair.value='';
        if(hint)hint.textContent='Dispositivo invitado autorizado';
        activate.textContent='LISTO';
        setTimeout(()=>location.reload(),350);
      }catch(error){
        if(hint)hint.textContent=String(error?.code||error?.message||'')==='GUEST_CODE_EXPIRED_OR_USED'
          ?'Código invitado expirado o ya usado'
          :'Código invitado no válido';
        activate.textContent=oldText||'ACTIVAR';
        activate.disabled=false;
      }
    },true);
  }

  async function processInviteFromUrl(){
    let url;
    try{url=new URL(location.href);}catch{return;}
    const invite=String(url.searchParams.get('invite')||'').trim();
    if(invite.length<20)return;

    injectStyles();
    const landing=make('div','loky-invite-landing');
    const card=make('div','loky-invite-landing-card');
    card.appendChild(make('span','loky-invite-landing-dot'));
    card.appendChild(make('strong','','VINCULANDO LOKY'));
    const text=make('span','','Validando invitación segura…');
    card.appendChild(text);
    landing.appendChild(card);
    document.body.appendChild(landing);

    const existing=capability();
    if(existing){
      text.textContent='Este dispositivo ya está vinculado. No se reemplazó su acceso.';
      url.searchParams.delete('invite');
      history.replaceState({},'',url.pathname+(url.search||'')+url.hash);
      setTimeout(()=>landing.remove(),1800);
      return;
    }

    try{
      const response=await fetch(DEVICE_ENDPOINT,{
        method:'POST',
        headers:{'content-type':'application/json'},
        cache:'no-store',
        body:JSON.stringify({
          action:'redeem_invite',
          inviteToken:invite,
          deviceName:'LOKY invitado',
          platform:/iPad/i.test(navigator.userAgent)?'iPadOS':'iOS'
        })
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data?.ok||String(data.capability||'').length<16||!isGuestCode(data.activationCode)){
        throw new Error(data?.error||'INVITE_FAILED');
      }
      url.searchParams.delete('invite');
      history.replaceState({},'',url.pathname+(url.search||'')+url.hash);

      const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone===true;
      if(standalone){
        localStorage.setItem(DEVICE_KEY,String(data.capability));
        text.textContent='Dispositivo autorizado. Abriendo LOKY…';
        setTimeout(()=>location.reload(),450);
        return;
      }

      text.textContent='Instala o abre LOKY desde la pantalla de inicio y usa este código de invitado. No uses el código Owner.';
      const code=make('strong','loky-guest-code',String(data.activationCode));
      const copy=make('button','loky-guest-copy','COPIAR CÓDIGO');
      copy.type='button';
      copy.addEventListener('click',async()=>{
        try{
          await navigator.clipboard.writeText(String(data.activationCode));
          copy.textContent='COPIADO';
          setTimeout(()=>copy.textContent='COPIAR CÓDIGO',1200);
        }catch{}
      });
      card.appendChild(code);
      card.appendChild(copy);
    }catch(error){
      text.textContent=String(error?.message||error)==='INVITE_EXPIRED_OR_USED'
        ?'Este QR ya fue usado o expiró.'
        :'No se pudo activar esta invitación.';
      url.searchParams.delete('invite');
      history.replaceState({},'',url.pathname+(url.search||'')+url.hash);
    }
  }

  injectStyles();
  setupGuestActivation();
  processInviteFromUrl();

  window.LOKY_PC4_SETTINGS_PLUS={
    version:VERSION,
    deviceEndpoint:DEVICE_ENDPOINT,
    enhanceSettingsWindow,
    processInviteFromUrl,
    setupGuestActivation,
    normalizeGuestCode
  };
})();