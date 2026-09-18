(() => {
  'use strict';

  const VERSION='0.3.2R4F8R4-robust-voice-planner-intents';
  const STORE_KEY='loky_pc4_mobile_planner_v1';
  const ALERT_SOUND_KEY='loky_pc4_mobile_alert_sounds_v1';
  const MAX_ITEMS=80;
  const DUE_POLL_MS=15000;
  const FIRED_GRACE_MS=12*60*60*1000;

  const body=document.body;
  const userTranscript=document.getElementById('userTranscript');
  const conversationState=document.getElementById('conversationState');

  let lastTurn='';
  let dueTimer=0;
  let alertAudioContext=null;
  let activeAlert=null;
  let activeSoundNodes=[];
  let activeAlertSoundTimer=0;
  let activeAlertSoundRepeats=0;

  const ALERT_SOUNDS={
    loky:{label:'LOKY',description:'Sonido actual de LOKY'},
    soft:{label:'SUAVE',description:'Campana discreta'},
    digital:{label:'DIGITAL',description:'Beep electrónico corto'},
    urgent:{label:'URGENTE',description:'Aviso fuerte y repetitivo'},
    scifi:{label:'SCI-FI',description:'Tono tecnológico'},
    classic:{label:'CLASSIC',description:'Alarma tradicional'},
    pulse:{label:'PULSE',description:'Pulsos cortos'},
    silent:{label:'SILENCIOSO',description:'Solo alerta visual'},
  };
  const DEFAULT_ALERT_SOUNDS={reminder:'loky',calendar:'loky',alarm:'loky'};

  const TYPE_META={
    reminder:{label:'RECORDATORIO',plural:'RECORDATORIOS',icon:'R'},
    calendar:{label:'EVENTO',plural:'CALENDARIO',icon:'C'},
    alarm:{label:'ALARMA',plural:'ALARMAS',icon:'A'},
  };
  const WEEKDAY_INDEX={
    domingo:0,lunes:1,martes:2,miercoles:3,jueves:4,viernes:5,sabado:6,
  };

  function make(tag,className,text){
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(text!=null)el.textContent=text;
    return el;
  }

  function uid(){
    try{return crypto.randomUUID()}catch{}
    return `p_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
  }

  function normalize(text){
    return String(text||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[¿?¡!,]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function loadAlertSounds(){
    try{
      const parsed=JSON.parse(localStorage.getItem(ALERT_SOUND_KEY)||'{}');
      const out={...DEFAULT_ALERT_SOUNDS};
      for(const type of Object.keys(DEFAULT_ALERT_SOUNDS)){
        const value=String(parsed?.[type]||'');
        if(ALERT_SOUNDS[value])out[type]=value;
      }
      return out;
    }catch{
      return {...DEFAULT_ALERT_SOUNDS};
    }
  }

  function getAlertSound(type){
    const settings=loadAlertSounds();
    return ALERT_SOUNDS[settings[type]]?settings[type]:'loky';
  }

  function setAlertSound(type,sound){
    if(!TYPE_META[type]||!ALERT_SOUNDS[sound])return false;
    const settings=loadAlertSounds();
    settings[type]=sound;
    try{localStorage.setItem(ALERT_SOUND_KEY,JSON.stringify(settings))}catch{}
    return true;
  }

  function loadItems(){
    try{
      const parsed=JSON.parse(localStorage.getItem(STORE_KEY)||'[]');
      if(!Array.isArray(parsed))return [];
      return parsed
        .filter(x=>x&&TYPE_META[x.type]&&typeof x.title==='string'&&Number.isFinite(Number(x.at)))
        .map(x=>({
          id:String(x.id||uid()),
          type:x.type,
          title:String(x.title).slice(0,140),
          at:Number(x.at),
          createdAt:Number(x.createdAt)||Date.now(),
          source:x.source==='voice'?'voice':'manual',
          doneAt:Number(x.doneAt)||0,
          firedAt:Number(x.firedAt)||0,
        }))
        .slice(-MAX_ITEMS);
    }catch{
      return [];
    }
  }

  function saveItems(items){
    const clean=items.slice(-MAX_ITEMS);
    try{localStorage.setItem(STORE_KEY,JSON.stringify(clean))}catch{}
    refreshOrganizerCards();
    return clean;
  }

  function snapshot(){
    return loadItems().map(x=>({...x}));
  }

  function addItem(type,title,at,source='manual'){
    if(!TYPE_META[type])return null;
    const when=Number(at);
    const clean=String(title||'').trim().replace(/\s+/g,' ').slice(0,140);
    if(!clean||!Number.isFinite(when))return null;
    const items=loadItems();
    const duplicate=items.find(x=>
      !x.doneAt&&x.type===type&&normalize(x.title)===normalize(clean)&&Math.abs(x.at-when)<60000
    );
    if(duplicate)return duplicate;
    const item={id:uid(),type,title:clean,at:when,createdAt:Date.now(),source:source==='voice'?'voice':'manual',doneAt:0,firedAt:0};
    items.push(item);
    saveItems(items);
    scheduleDueCheck();
    return item;
  }

  function updateItem(id,patch={}){
    const items=loadItems();
    const index=items.findIndex(x=>x.id===id);
    if(index<0)return false;
    const next={...items[index]};
    if(typeof patch.title==='string'&&patch.title.trim())next.title=patch.title.trim().replace(/\s+/g,' ').slice(0,140);
    if(Number.isFinite(Number(patch.at)))next.at=Number(patch.at);
    if(patch.done===true)next.doneAt=Date.now();
    if(patch.done===false)next.doneAt=0;
    if(patch.resetFired===true)next.firedAt=0;
    items[index]=next;
    saveItems(items);
    scheduleDueCheck();
    return true;
  }

  function removeItem(id){
    const items=loadItems();
    const next=items.filter(x=>x.id!==id);
    if(next.length===items.length)return false;
    saveItems(next);
    scheduleDueCheck();
    return true;
  }

  function pad(n){return String(n).padStart(2,'0')}

  function deviceTimeZone(){
    try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'LOCAL'}catch{return 'LOCAL'}
  }

  function fmtDeviceClock(ms=Date.now()){
    const d=new Date(ms);
    try{
      return new Intl.DateTimeFormat('es',{
        hour:'numeric',minute:'2-digit',hour12:true
      }).format(d).toUpperCase();
    }catch{
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }

  function nextPlannerTime(ms=Date.now()){
    const d=new Date(ms);
    d.setSeconds(0,0);
    d.setMinutes(d.getMinutes()+5);
    return d.getTime();
  }

  function toLocalInput(ms){
    const d=new Date(ms);
    if(!Number.isFinite(d.getTime()))return '';
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtDate(ms){
    const d=new Date(ms);
    if(!Number.isFinite(d.getTime()))return 'SIN FECHA';
    try{
      return new Intl.DateTimeFormat('es',{
        weekday:'short',day:'2-digit',month:'short',hour:'numeric',minute:'2-digit'
      }).format(d).toUpperCase();
    }catch{
      return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }

  function setDayStart(target,base,offset=0){
    target.setFullYear(base.getFullYear(),base.getMonth(),base.getDate()+offset);
    target.setSeconds(0,0);
  }

  const SPOKEN_NUMBERS={
    un:1,uno:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,
    diez:10,once:11,doce:12,trece:13,catorce:14,quince:15,dieciseis:16,diecisiete:17,
    dieciocho:18,diecinueve:19,veinte:20,veintiuno:21,veintidos:22,veintitres:23,
    veinticuatro:24,veinticinco:25,veintiseis:26,veintisiete:27,veintiocho:28,veintinueve:29,
    treinta:30,cuarenta:40,cincuenta:50,sesenta:60,
  };

  function spokenNumber(value){
    const raw=normalize(value).replace(/\s+/g,' ').trim();
    if(/^\d+$/.test(raw))return Number(raw);
    if(Object.prototype.hasOwnProperty.call(SPOKEN_NUMBERS,raw))return SPOKEN_NUMBERS[raw];
    const compound=raw.match(/^(treinta|cuarenta|cincuenta)\s+y\s+(uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)$/);
    if(compound)return (SPOKEN_NUMBERS[compound[1]]||0)+(SPOKEN_NUMBERS[compound[2]]||0);
    return NaN;
  }

  function parseHour(hour,minute,ampm,period){
    let h=spokenNumber(hour),m=minute==null||minute===''?0:spokenNumber(minute);
    if(!Number.isFinite(h)||h<0||h>23||!Number.isFinite(m)||m<0||m>59)return null;
    const ap=String(ampm||'').toLowerCase();
    const part=String(period||'').toLowerCase();
    if((ap==='pm'||part==='tarde'||part==='noche')&&h<12)h+=12;
    if((ap==='am'||part==='manana')&&h===12)h=0;
    return {h,m};
  }

  function resolveDateTime(raw,kind='reminder',nowMs=Date.now()){
    const rawText=String(raw||'');
    const n=normalize(rawText);
    const now=new Date(nowMs);

    let m=n.match(/\b(?:(?:para\s+)?dentro\s+de|de\s+aqui\s+a|en)\s+(?:unos?\s+)?(\d{1,4}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|veinticinco|treinta|cuarenta|cincuenta|sesenta)\s+(minuto|minutos|hora|horas)\b/);
    if(m){
      const qty=spokenNumber(m[1]);
      const unit=m[2].startsWith('hora')?3600000:60000;
      if(Number.isFinite(qty)&&qty>0)return {at:nowMs+qty*unit,matched:m[0],relative:true};
    }

    const result=new Date(now);
    result.setSeconds(0,0);
    let explicitDay=false;
    let explicitWeekday=false;

    const dateMatch=n.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if(dateMatch){
      let year=dateMatch[3]?Number(dateMatch[3]):now.getFullYear();
      if(year<100)year+=2000;
      const day=Number(dateMatch[1]),month=Number(dateMatch[2])-1;
      result.setFullYear(year,month,day);
      explicitDay=true;
    }else if(/\bpasado\s+manana\b/.test(n)){
      setDayStart(result,now,2); explicitDay=true;
    }else if(/\bmanana\b/.test(n)){
      setDayStart(result,now,1); explicitDay=true;
    }else if(/\bhoy\b/.test(n)){
      setDayStart(result,now,0); explicitDay=true;
    }else{
      const weekdayMatch=n.match(/\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
      if(weekdayMatch){
        const target=WEEKDAY_INDEX[weekdayMatch[1]];
        const delta=(target-now.getDay()+7)%7;
        setDayStart(result,now,delta);
        explicitDay=true;
        explicitWeekday=true;
      }
    }

    const hourToken='(?:\\d{1,2}|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)';
    const minuteToken='(?:\\d{1,2}|cinco|diez|quince|veinte|veinticinco|treinta|treinta y cinco|cuarenta|cuarenta y cinco|cincuenta|cincuenta y cinco)';
    const spokenClock=n.match(new RegExp('\\b(?:a|para)\\s+la?s?\\s+('+hourToken+')(?:\\s*(?::|y)\\s*('+minuteToken+'|cuarto|media))?\\s*(am|pm)?(?:\\s+de\\s+la\\s+(manana|tarde|noche))?\\b'));
    const numericClock=n.match(/\b(\d{1,2})(?::(\d{2}))\s*(am|pm)?(?:\s+de\s+la\s+(manana|tarde|noche))?\b/);
    const timeMatch=spokenClock||numericClock;
    let explicitTime=false;
    if(timeMatch){
      const spokenPeriod=timeMatch[4]||((n.match(/\bde\s+la\s+(manana|tarde|noche)\b/)||[])[1]||'');
      let minute=timeMatch[2]||'';
      if(minute==='cuarto')minute='quince';
      if(minute==='media')minute='treinta';
      const time=parseHour(timeMatch[1],minute,timeMatch[3],spokenPeriod);
      if(time){
        result.setHours(time.h,time.m,0,0);
        explicitTime=true;
      }
    }

    if(!explicitDay&&!explicitTime)return null;

    if(explicitDay&&!explicitTime){
      result.setHours(kind==='alarm'?8:9,0,0,0);
    }

    if(!explicitDay&&explicitTime&&result.getTime()<=nowMs+30000){
      result.setDate(result.getDate()+1);
    }
    if(explicitWeekday&&explicitTime&&result.getTime()<=nowMs+30000){
      result.setDate(result.getDate()+7);
    }

    if(result.getTime()<=nowMs-60000&&dateMatch)return null;
    return {at:result.getTime(),matched:'absolute',relative:false};
  }

  function stripTemporal(raw){
    return String(raw||'')
      .replace(/\b(?:pasado\s+mañana|mañana|hoy)\b/gi,' ')
      .replace(/\b(?:domingo|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado)\b/gi,' ')
      .replace(/\b(?:(?:para\s+)?dentro\s+de|de\s+aqui\s+a|en)\s+(?:unos?\s+)?(?:\d{1,4}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|veinticinco|treinta|cuarenta|cincuenta|sesenta)\s+(?:minuto|minutos|hora|horas)\b/gi,' ')
      .replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g,' ')
      .replace(/\b(?:a|para)\s+las?\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s+de\s+la\s+(?:mañana|tarde|noche))?\b/gi,' ')
      .replace(/\b\d{1,2}:\d{2}\s*(?:am|pm)?(?:\s+de\s+la\s+(?:mañana|tarde|noche))?\b/gi,' ')
      .replace(/\bde\s+la\s+(?:mañana|tarde|noche)\b/gi,' ')
      .replace(/\bde\s+la\s*$/i,' ')
      .replace(/\b(?:para|a|el)\s*$/i,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function parseVoiceCommand(raw,nowMs=Date.now()){
    const original=String(raw||'').trim();
    const n=normalize(original).replace(/^loky\s+/,'');
    if(!n)return null;

    let type='';
    let remainder='';

    const reminderIntent=/\b(?:recuerdame|recordame)\b/.test(n);
    const alarmIntent=/\balarma(?:s)?\b/.test(n)||/\b(?:despiertame|despierta\s+me)\b/.test(n);
    const calendarIntent=/\bcalendario\b/.test(n)||/\b(?:agenda|agendame|evento)\b/.test(n);

    if(reminderIntent){
      type='reminder';
      remainder=original.replace(/^\s*(?:loky[,:]?\s+)?/i,'');
      remainder=remainder.replace(/^.*?\b(?:recu[eé]rdame|recordame)\b\s*/i,'');
      remainder=remainder.replace(/^que\s+/i,'');
    }else if(alarmIntent){
      type='alarm';
      remainder=original.replace(/^\s*(?:loky[,:]?\s+)?/i,'');
      if(/\b(?:despi[eé]rtame|despierta\s+me)\b/i.test(remainder)){
        remainder=remainder.replace(/^.*?\b(?:despi[eé]rtame|despierta\s+me)\b\s*/i,'');
      }else{
        remainder=remainder.replace(/^.*?\balarma(?:s)?\b\s*/i,'');
      }
    }else if(calendarIntent){
      type='calendar';
      remainder=original.replace(/^\s*(?:loky[,:]?\s+)?/i,'');
      if(/\bcalendario\b/i.test(remainder)){
        remainder=remainder.replace(/^.*?\bcalendario\b\s*/i,'');
      }else{
        remainder=remainder.replace(/^.*?\b(?:agenda|ag[eé]ndame|evento)\b\s*/i,'');
      }
    }else{
      return null;
    }

    const when=resolveDateTime(original,type,nowMs);
    if(!when)return {type,error:'MISSING_TIME',raw:original};

    let title=stripTemporal(remainder)
      .replace(/^para\s+/i,'')
      .replace(/^que\s+/i,'')
      .replace(/^(?:un|una|el|la)\s+/i,'')
      .replace(/[.]+$/,'')
      .trim();

    if(type==='alarm'){
      title=title
        .replace(/^(?:que\s+)?(?:me\s+)?(?:pongas|programes|programas|crees|hagas|actives|configures|establezcas)\s*/i,'')
        .replace(/^(?:para|a|en)\s*/i,'')
        .trim();
      if(!title||/^(?:una?|la)?\s*$/i.test(title))title='Alarma';
    }
    if(type==='calendar'&&!title)title='Evento';
    if(type==='reminder'&&!title)title='Recordatorio';

    return {type,title,at:when.at,source:'voice',raw:original};
  }

  function injectStyles(){
    if(document.getElementById('lokyPlannerStyles'))return;
    const style=document.createElement('style');
    style.id='lokyPlannerStyles';
    style.textContent=`
      .loky-organizer-card.loky-planner-ready{opacity:1;cursor:pointer;border-color:rgba(99,207,243,.18);background:rgba(7,31,44,.72)}
      .loky-organizer-card.loky-planner-ready:active{filter:brightness(1.14)}
      .loky-organizer-card.loky-planner-ready em{color:#7bcfe9}
      .loky-planner-screen{position:absolute;z-index:8;inset:0;background:linear-gradient(180deg,#07131e 0%,#030a11 100%);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}
      .loky-planner-top{box-sizing:border-box;height:calc(54px + var(--safe-top));display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center;padding:var(--safe-top) 12px 0;border-bottom:1px solid rgba(104,193,225,.10);background:rgba(5,17,27,.92)}
      .loky-planner-back{height:32px;padding:0 11px;border-radius:999px;border:1px solid rgba(102,203,239,.18);background:rgba(10,40,55,.58);color:#bfefff;font-size:8px;font-weight:800;letter-spacing:.07em}
      .loky-planner-title{display:grid;gap:2px}.loky-planner-title strong{font-size:10px;letter-spacing:.12em;color:#d9f6ff}.loky-planner-title span{font-size:7.5px;color:#6e90a2}
      .loky-planner-badge{padding:5px 8px;border-radius:999px;border:1px solid rgba(104,205,240,.14);background:rgba(8,42,57,.58);font-size:7px;color:#80b6c9}
      .loky-planner-content{min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;padding:12px 14px calc(22px + var(--safe-bottom));display:grid;align-content:start;gap:10px}
      .loky-planner-card{border:1px solid rgba(101,197,232,.13);border-radius:17px;background:linear-gradient(180deg,rgba(8,29,42,.84),rgba(4,17,27,.82));padding:11px;display:grid;gap:9px}
      .loky-planner-form{display:grid;gap:7px}.loky-planner-input{height:40px;border-radius:11px;border:1px solid rgba(100,190,224,.15);background:rgba(2,12,19,.66);color:#d8f5ff;padding:0 10px;font-size:10px;outline:none}
      .loky-planner-input:focus{border-color:rgba(103,214,250,.36);box-shadow:0 0 0 3px rgba(74,190,230,.06)}
      .loky-planner-add{height:38px;border-radius:11px;border:1px solid rgba(96,202,238,.24);background:rgba(12,57,77,.72);color:#c7f2ff;font-size:8px;font-weight:900;letter-spacing:.10em}
      .loky-planner-notify{height:34px;border-radius:10px;border:1px solid rgba(96,202,238,.17);background:rgba(8,38,52,.62);color:#9dd8eb;font-size:7.5px;font-weight:800;letter-spacing:.08em}
      .loky-planner-note{font-size:7.5px;line-height:1.45;color:#6f91a3;text-align:center}
      .loky-device-time{min-height:30px;border-radius:10px;border:1px solid rgba(96,202,238,.10);background:rgba(5,27,39,.54);display:flex;align-items:center;justify-content:center;gap:7px;padding:0 9px;color:#7098aa;font-size:7px;letter-spacing:.06em;text-align:center}
      .loky-device-time strong{color:#b8e9f8;font-size:7.5px;letter-spacing:.08em}
      .loky-sound-open{height:36px;border-radius:10px;border:1px solid rgba(96,202,238,.18);background:rgba(8,38,52,.66);color:#b6e8f8;font-size:7.5px;font-weight:900;letter-spacing:.09em}
      .loky-sound-modal{position:fixed;z-index:340;inset:0;background:rgba(1,7,12,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:grid;place-items:center;padding:18px}
      .loky-sound-card{width:min(90vw,420px);max-height:min(78vh,620px);overflow:auto;border:1px solid rgba(108,219,251,.22);border-radius:22px;background:linear-gradient(180deg,rgba(8,34,48,.99),rgba(3,16,25,.99));padding:16px;display:grid;gap:10px;box-shadow:0 26px 80px rgba(0,0,0,.55)}
      .loky-sound-card>strong{text-align:center;font-size:10px;letter-spacing:.12em;color:#ddf7ff}
      .loky-sound-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      .loky-sound-choice{min-height:60px;border-radius:13px;border:1px solid rgba(100,190,224,.12);background:rgba(5,25,37,.72);color:#93bdcd;display:grid;align-content:center;gap:4px;padding:9px;text-align:left}
      .loky-sound-choice strong{font-size:8px;letter-spacing:.08em;color:#b9e3f0}.loky-sound-choice span{font-size:7px;line-height:1.3;color:#668797}
      .loky-sound-choice.is-selected{border-color:rgba(108,223,255,.48);background:rgba(15,67,88,.76);box-shadow:0 0 14px rgba(70,198,239,.10)}
      .loky-sound-choice.is-selected strong{color:#e3fbff}
      .loky-sound-status{min-height:15px;text-align:center;font-size:7px;color:#78aabd;letter-spacing:.05em}
      .loky-sound-select{height:38px;border-radius:999px;border:1px solid rgba(108,223,255,.32);background:linear-gradient(180deg,rgba(24,92,119,.82),rgba(8,49,68,.88));color:#dcf9ff;font-size:8px;font-weight:900;letter-spacing:.12em}
      .loky-planner-list{display:grid;gap:7px}.loky-planner-empty{padding:24px 8px;text-align:center;color:#607f90;font-size:8.5px}
      .loky-planner-row{border:1px solid rgba(99,188,220,.11);border-radius:13px;background:rgba(4,20,31,.58);padding:9px 10px;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
      .loky-planner-row.is-done{opacity:.48}.loky-planner-copy{min-width:0;display:grid;gap:3px}.loky-planner-copy strong{font-size:9px;color:#c8eaf5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.loky-planner-copy span{font-size:7.5px;color:#7093a5}.loky-planner-copy small{font-size:6.8px;color:#537282;letter-spacing:.08em}
      .loky-planner-actions{display:flex;gap:4px}.loky-planner-action{height:29px;min-width:30px;padding:0 7px;border-radius:8px;border:1px solid rgba(99,192,222,.13);background:rgba(8,36,49,.68);color:#9ed9ea;font-size:7px;font-weight:800}.loky-planner-action.danger{color:#f5aaa3;border-color:rgba(255,104,92,.17)}
      .loky-planner-toast{position:fixed;z-index:240;left:50%;bottom:calc(24px + var(--safe-bottom));transform:translateX(-50%) translateY(12px);width:min(88vw,420px);padding:11px 13px;border:1px solid rgba(106,215,250,.24);border-radius:14px;background:rgba(4,26,38,.96);box-shadow:0 18px 50px rgba(0,0,0,.42);color:#d8f6ff;text-align:center;font-size:8.5px;line-height:1.45;opacity:0;transition:.2s ease}
      .loky-planner-toast.is-open{opacity:1;transform:translateX(-50%) translateY(0)}
      .loky-due-alert{position:fixed;z-index:300;inset:0;background:rgba(1,7,12,.80);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:grid;place-items:center;padding:22px}
      .loky-due-card{width:min(88vw,380px);border:1px solid rgba(109,218,252,.24);border-radius:23px;background:linear-gradient(180deg,rgba(8,36,51,.99),rgba(3,16,25,.99));box-shadow:0 28px 90px rgba(0,0,0,.58);padding:21px;display:grid;gap:10px;text-align:center}
      .loky-due-icon{width:46px;height:46px;margin:auto;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(107,216,249,.30);background:rgba(12,62,82,.62);color:#aeeeff;font-size:15px;font-weight:900;box-shadow:0 0 28px rgba(74,202,245,.14)}
      .loky-due-card strong{font-size:12px;letter-spacing:.11em;color:#def8ff}.loky-due-card span{font-size:9px;line-height:1.45;color:#9fc7d7}
      .loky-due-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      .loky-due-dismiss,.loky-due-stop{height:38px;border-radius:999px;border:1px solid rgba(108,219,251,.25);background:rgba(10,55,74,.74);color:#cff5ff;font-size:8px;font-weight:900;letter-spacing:.10em}
      .loky-due-stop{background:rgba(42,29,23,.68);border-color:rgba(255,177,112,.20);color:#ffd6b1}
      .loky-due-stop:disabled{opacity:.55}
    `;
    document.head.appendChild(style);
  }

  function toast(text){
    let el=document.querySelector('.loky-planner-toast');
    if(!el){
      el=make('div','loky-planner-toast');
      body.appendChild(el);
    }
    el.textContent=text;
    requestAnimationFrame(()=>el.classList.add('is-open'));
    clearTimeout(el._timer);
    el._timer=setTimeout(()=>el.classList.remove('is-open'),2600);
  }

  function countActive(type){
    const now=Date.now();
    return loadItems().filter(x=>x.type===type&&!x.doneAt&&(x.at>now-FIRED_GRACE_MS)).length;
  }

  function refreshOrganizerCards(root=document){
    const page=root.querySelector?.('.loky-memory-window')||document.querySelector('.loky-memory-window');
    if(!page)return;
    const cards=[...page.querySelectorAll('.loky-organizer-card')];
    for(const card of cards){
      const title=normalize(card.querySelector('strong')?.textContent||'');
      const type=title==='recordatorios'?'reminder':title==='calendario'?'calendar':title==='alarmas'?'alarm':'';
      if(!type)continue;
      card.disabled=false;
      card.classList.add('loky-planner-ready');
      const meta=card.querySelector('em');
      if(meta)meta.textContent=countActive(type)?`${countActive(type)} ACTIVO${countActive(type)===1?'':'S'}`:'ABRIR';
      if(card.dataset.plannerBound==='1')continue;
      card.dataset.plannerBound='1';
      card.addEventListener('click',()=>openPlannerPanel(page,type));
    }
  }

  function notificationStatus(){
    if(!('Notification' in window))return 'NO DISPONIBLE';
    return Notification.permission==='granted'?'ACTIVOS':Notification.permission==='denied'?'BLOQUEADOS':'ACTIVAR AVISOS';
  }

  async function requestNotifications(button){
    if(!('Notification' in window)){
      toast('Este dispositivo no expone notificaciones web.');
      return;
    }
    try{
      const permission=await Notification.requestPermission();
      if(button)button.textContent=notificationStatus();
      toast(permission==='granted'?'Avisos del sistema activados.':'Los avisos no fueron autorizados.');
    }catch{
      toast('No se pudo solicitar permiso de avisos.');
    }
  }

  async function systemNotification(item){
    if(!('Notification' in window)||Notification.permission!=='granted')return false;
    const title=item.type==='alarm'?'LOKY · ALARMA':item.type==='calendar'?'LOKY · CALENDARIO':'LOKY · RECORDATORIO';
    const options={body:item.title,tag:`loky-planner-${item.id}`,renotify:true};
    try{
      const reg=await navigator.serviceWorker?.ready;
      if(reg?.showNotification){
        await reg.showNotification(title,options);
        return true;
      }
      new Notification(title,options);
      return true;
    }catch{
      return false;
    }
  }

  async function primeAlertAudio(){
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)return null;
    if(!alertAudioContext)alertAudioContext=new AudioCtx();
    if(alertAudioContext.state==='suspended')await alertAudioContext.resume().catch(()=>{});
    return alertAudioContext;
  }

  function stopToneNodes(){
    for(const node of activeSoundNodes){
      try{node.stop()}catch{}
      try{node.disconnect()}catch{}
    }
    activeSoundNodes=[];
  }

  function stopAlertSound(){
    if(activeAlertSoundTimer){
      clearInterval(activeAlertSoundTimer);
      activeAlertSoundTimer=0;
    }
    activeAlertSoundRepeats=0;
    stopToneNodes();
  }

  function scheduleTone(ctx,{freq=880,start=0,duration=.18,gain=.12,wave='sine',endFreq=0}={}){
    const osc=ctx.createOscillator();
    const amp=ctx.createGain();
    const at=ctx.currentTime+start;
    osc.type=wave;
    osc.frequency.setValueAtTime(freq,at);
    if(endFreq>0)osc.frequency.exponentialRampToValueAtTime(endFreq,at+duration);
    amp.gain.setValueAtTime(.0001,at);
    amp.gain.exponentialRampToValueAtTime(Math.max(.001,gain),at+.018);
    amp.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(at);
    osc.stop(at+duration+.02);
    activeSoundNodes.push(osc);
    osc.onended=()=>{
      activeSoundNodes=activeSoundNodes.filter(node=>node!==osc);
      try{osc.disconnect()}catch{}
      try{amp.disconnect()}catch{}
    };
  }

  async function playAlertSoundById(soundId){
    const id=ALERT_SOUNDS[soundId]?soundId:'loky';
    stopToneNodes();
    if(id==='silent')return true;
    try{
      const ctx=await primeAlertAudio();
      if(!ctx)return false;

      if(id==='loky'){
        for(let i=0;i<3;i++)scheduleTone(ctx,{freq:880-i*90,start:i*.32,duration:.22,gain:.16,wave:'sine'});
      }else if(id==='soft'){
        scheduleTone(ctx,{freq:660,start:0,duration:.30,gain:.07,wave:'sine'});
        scheduleTone(ctx,{freq:880,start:.22,duration:.36,gain:.055,wave:'sine'});
      }else if(id==='digital'){
        scheduleTone(ctx,{freq:980,start:0,duration:.10,gain:.11,wave:'square'});
        scheduleTone(ctx,{freq:1240,start:.14,duration:.10,gain:.10,wave:'square'});
        scheduleTone(ctx,{freq:980,start:.28,duration:.10,gain:.09,wave:'square'});
      }else if(id==='urgent'){
        for(let i=0;i<5;i++)scheduleTone(ctx,{freq:i%2?820:1120,start:i*.19,duration:.14,gain:.17,wave:'square'});
      }else if(id==='scifi'){
        scheduleTone(ctx,{freq:420,endFreq:1220,start:0,duration:.42,gain:.10,wave:'sine'});
        scheduleTone(ctx,{freq:980,endFreq:520,start:.38,duration:.34,gain:.08,wave:'triangle'});
      }else if(id==='classic'){
        for(let i=0;i<4;i++)scheduleTone(ctx,{freq:620,start:i*.27,duration:.19,gain:.13,wave:'triangle'});
      }else if(id==='pulse'){
        for(let i=0;i<4;i++)scheduleTone(ctx,{freq:i%2?720:480,start:i*.18,duration:.11,gain:.105,wave:'sine'});
      }
      return true;
    }catch{
      return false;
    }
  }

  async function alarmTone(type='alarm'){
    return playAlertSoundById(getAlertSound(type));
  }

  async function startDueAlertSound(type){
    stopAlertSound();
    const sound=getAlertSound(type);
    if(sound==='silent')return false;

    const repeatEvery=type==='alarm'?1800:type==='reminder'?2300:2600;
    const maxRepeats=type==='alarm'?Number.POSITIVE_INFINITY:type==='reminder'?4:3;

    const ring=async()=>{
      if(activeAlertSoundRepeats>=maxRepeats){
        if(activeAlertSoundTimer){
          clearInterval(activeAlertSoundTimer);
          activeAlertSoundTimer=0;
        }
        return;
      }
      activeAlertSoundRepeats++;
      await playAlertSoundById(sound);
    };

    await ring();
    if(activeAlertSoundRepeats<maxRepeats){
      activeAlertSoundTimer=setInterval(ring,repeatEvery);
    }
    return true;
  }

  function showDueAlert(item){
    if(activeAlert)return;
    const overlay=make('div','loky-due-alert');
    const card=make('div','loky-due-card');
    const meta=TYPE_META[item.type];
    card.appendChild(make('div','loky-due-icon',meta.icon));
    card.appendChild(make('strong','',meta.label));
    card.appendChild(make('span','',item.title));
    card.appendChild(make('span','',fmtDate(item.at)));
    const actions=make('div','loky-due-actions');
    const stop=make('button','loky-due-stop',item.type==='alarm'?'DETENER ALARMA':'DETENER SONIDO');
    stop.type='button';
    stop.addEventListener('click',()=>{
      stopAlertSound();
      stop.disabled=true;
      stop.textContent='SONIDO DETENIDO';
      if(item.type==='alarm'){
        overlay.remove();
        activeAlert=null;
        refreshOrganizerCards();
      }
    });

    const dismiss=make('button','loky-due-dismiss',item.type==='reminder'?'MARCAR HECHO':'CERRAR');
    dismiss.type='button';
    dismiss.addEventListener('click',()=>{
      stopAlertSound();
      if(item.type==='reminder')updateItem(item.id,{done:true});
      overlay.remove();
      activeAlert=null;
      refreshOrganizerCards();
    });

    if(item.type==='alarm'){
      actions.style.gridTemplateColumns='1fr';
      actions.appendChild(stop);
    }else{
      actions.appendChild(stop);
      actions.appendChild(dismiss);
    }

    card.appendChild(actions);
    overlay.appendChild(card);
    body.appendChild(overlay);
    activeAlert=overlay;
    startDueAlertSound(item.type);
  }

  function markFired(id){
    const items=loadItems();
    const index=items.findIndex(x=>x.id===id);
    if(index<0)return;
    items[index].firedAt=Date.now();
    if(items[index].type==='alarm'||items[index].type==='calendar')items[index].doneAt=Date.now();
    saveItems(items);
  }

  async function checkDue(){
    const now=Date.now();
    const items=loadItems();
    const due=items
      .filter(x=>!x.doneAt&&!x.firedAt&&x.at<=now&&x.at>=now-FIRED_GRACE_MS)
      .sort((a,b)=>a.at-b.at);
    if(!due.length)return;
    const item=due[0];
    markFired(item.id);
    await systemNotification(item);
    showDueAlert(item);
  }

  function scheduleDueCheck(){
    clearInterval(dueTimer);
    dueTimer=setInterval(checkDue,DUE_POLL_MS);
    setTimeout(checkDue,300);
  }

  function showSoundSelector(type,onSaved){
    const current=getAlertSound(type);
    let draft=current;
    const modal=make('div','loky-sound-modal');
    const card=make('div','loky-sound-card');
    card.appendChild(make('strong','','SONIDO DE ALERTA'));
    const status=make('div','loky-sound-status','TOCA UN SONIDO PARA ESCUCHARLO');
    const grid=make('div','loky-sound-grid');
    const buttons=[];

    const paint=()=>{
      for(const btn of buttons)btn.classList.toggle('is-selected',btn.dataset.sound===draft);
    };

    for(const [key,meta] of Object.entries(ALERT_SOUNDS)){
      const btn=make('button','loky-sound-choice');
      btn.type='button';
      btn.dataset.sound=key;
      btn.appendChild(make('strong','',meta.label));
      btn.appendChild(make('span','',meta.description));
      btn.addEventListener('click',async()=>{
        draft=key;
        paint();
        status.textContent=key==='silent'?'SILENCIOSO · SOLO ALERTA VISUAL':'REPRODUCIENDO MUESTRA…';
        stopAlertSound();
        await playAlertSoundById(key);
      });
      buttons.push(btn);
      grid.appendChild(btn);
    }

    const select=make('button','loky-sound-select','SELECCIONAR');
    select.type='button';
    select.addEventListener('click',()=>{
      stopAlertSound();
      if(setAlertSound(type,draft)){
        modal.remove();
        onSaved?.(draft);
        toast(`Sonido ${ALERT_SOUNDS[draft].label} seleccionado para ${TYPE_META[type].plural.toLowerCase()}.`);
      }
    });

    modal.addEventListener('click',event=>{
      if(event.target===modal){
        stopAlertSound();
        modal.remove();
      }
    });

    card.appendChild(grid);
    card.appendChild(status);
    card.appendChild(select);
    modal.appendChild(card);
    body.appendChild(modal);
    paint();
    primeAlertAudio().catch(()=>{});
  }

  function openPlannerPanel(page,type){
    page.querySelector('.loky-planner-screen')?.remove();
    const meta=TYPE_META[type];
    const screen=make('section','loky-planner-screen');
    const top=make('div','loky-planner-top');
    let deviceClockTimer=0;
    const back=make('button','loky-planner-back','‹ MEMORIAS');
    back.type='button';
    back.addEventListener('click',()=>{clearInterval(deviceClockTimer);screen.remove();});
    const title=make('div','loky-planner-title');
    title.appendChild(make('strong','',meta.plural));
    title.appendChild(make('span','',type==='calendar'?'Eventos y agenda':type==='alarm'?'Alarmas programadas':'Avisos y tareas pendientes'));
    top.appendChild(back);
    top.appendChild(title);
    top.appendChild(make('span','loky-planner-badge',String(countActive(type))));
    screen.appendChild(top);

    const content=make('div','loky-planner-content');

    const formCard=make('section','loky-planner-card');
    const form=make('div','loky-planner-form');
    const text=make('input','loky-planner-input');
    text.type='text';
    text.maxLength=140;
    text.placeholder=type==='alarm'?'Nombre de alarma (opcional)':type==='calendar'?'Nombre del evento':'¿Qué debo recordarte?';
    const when=make('input','loky-planner-input');
    when.type='datetime-local';
    when.value=toLocalInput(nextPlannerTime());
    const add=make('button','loky-planner-add',type==='calendar'?'AGREGAR EVENTO':type==='alarm'?'PROGRAMAR ALARMA':'GUARDAR RECORDATORIO');
    add.type='button';
    form.appendChild(text);
    form.appendChild(when);
    form.appendChild(add);
    formCard.appendChild(form);

    const deviceTime=make('div','loky-device-time');
    const paintDeviceTime=()=>{
      while(deviceTime.firstChild)deviceTime.removeChild(deviceTime.firstChild);
      deviceTime.appendChild(make('span','','HORA LOCAL DEL DISPOSITIVO'));
      deviceTime.appendChild(make('strong','',fmtDeviceClock()));
      deviceTime.appendChild(make('span','',deviceTimeZone()));
    };
    paintDeviceTime();
    deviceClockTimer=setInterval(paintDeviceTime,30000);
    formCard.appendChild(deviceTime);

    const notify=make('button','loky-planner-notify',notificationStatus());
    notify.type='button';
    notify.addEventListener('click',()=>requestNotifications(notify));
    formCard.appendChild(notify);

    const soundButton=make('button','loky-sound-open');
    soundButton.type='button';
    const paintSound=()=>{
      const sound=getAlertSound(type);
      soundButton.textContent=`SONIDO DE ALERTA · ${ALERT_SOUNDS[sound].label}`;
    };
    paintSound();
    soundButton.addEventListener('click',()=>showSoundSelector(type,paintSound));
    formCard.appendChild(soundButton);

    formCard.appendChild(make('div','loky-planner-note','Los avisos se disparan mientras LOKY está abierta y al volver a abrirla si algo venció. El aviso con la app totalmente cerrada se añadirá en la siguiente fase de Web Push.'));
    content.appendChild(formCard);

    const list=make('div','loky-planner-list');
    content.appendChild(list);

    function render(){
      while(list.firstChild)list.removeChild(list.firstChild);
      const items=loadItems().filter(x=>x.type===type).sort((a,b)=>a.at-b.at);
      const badge=screen.querySelector('.loky-planner-badge');
      if(badge)badge.textContent=String(items.filter(x=>!x.doneAt).length);
      if(!items.length){
        list.appendChild(make('div','loky-planner-empty',`No hay ${meta.plural.toLowerCase()} todavía.`));
        return;
      }
      for(const item of items){
        const row=make('div','loky-planner-row');
        if(item.doneAt)row.classList.add('is-done');
        const copy=make('div','loky-planner-copy');
        copy.appendChild(make('strong','',item.title));
        copy.appendChild(make('span','',fmtDate(item.at)));
        copy.appendChild(make('small','',`${item.source==='voice'?'VOZ':'MANUAL'} · ${item.doneAt?'FINALIZADO':'ACTIVO'}`));
        const actions=make('div','loky-planner-actions');
        if(!item.doneAt){
          const done=make('button','loky-planner-action',type==='reminder'?'✓':'OK');
          done.type='button';
          done.addEventListener('click',()=>{updateItem(item.id,{done:true});render();refreshOrganizerCards();});
          actions.appendChild(done);
        }
        const del=make('button','loky-planner-action danger','×');
        del.type='button';
        del.addEventListener('click',()=>{removeItem(item.id);render();refreshOrganizerCards();});
        actions.appendChild(del);
        row.appendChild(copy);
        row.appendChild(actions);
        list.appendChild(row);
      }
    }

    function addManual(){
      const titleValue=text.value.trim()||(type==='alarm'?'Alarma':type==='calendar'?'Evento':'Recordatorio');
      const at=Date.parse(when.value||'');
      if(!Number.isFinite(at)||at<=Date.now()-60000){
        toast('Selecciona una fecha y hora futura.');
        return;
      }
      const item=addItem(type,titleValue,at,'manual');
      if(item){
        text.value='';
        render();
        toast(`${meta.label} guardado · ${fmtDate(item.at)}`);
      }
    }

    add.addEventListener('click',addManual);
    text.addEventListener('keydown',event=>{if(event.key==='Enter')addManual();});
    render();
    screen.appendChild(content);
    page.appendChild(screen);
    primeAlertAudio().catch(()=>{});
  }

  function applyVoiceCommand(text){
    const parsed=parseVoiceCommand(text);
    if(!parsed)return false;
    if(parsed.error==='MISSING_TIME'){
      toast('Entendí la orden, pero necesito una hora o fecha.');
      return false;
    }
    const item=addItem(parsed.type,parsed.title,parsed.at,'voice');
    if(!item)return false;
    const meta=TYPE_META[item.type];
    toast(`${meta.label} guardado · ${fmtDate(item.at)}`);
    return true;
  }

  function captureFinishedTurn(){
    const text=String(userTranscript?.textContent||'').trim();
    if(!text||text==='—'||text===lastTurn)return;
    lastTurn=text;
    applyVoiceCommand(text);
  }

  function augmentMemoryWindow(page){
    if(!page||page.dataset.plannerReady==='1')return;
    page.dataset.plannerReady='1';
    refreshOrganizerCards(page);
  }

  injectStyles();

  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes||[]){
        if(node?.nodeType!==1)continue;
        if(node.matches?.('.loky-memory-window'))augmentMemoryWindow(node);
        const nested=node.querySelector?.('.loky-memory-window');
        if(nested)augmentMemoryWindow(nested);
      }
    }
  });
  observer.observe(body,{childList:true,subtree:true});

  if(conversationState){
    new MutationObserver(()=>{
      if(String(conversationState.textContent||'').trim()==='PENSANDO')captureFinishedTurn();
    }).observe(conversationState,{childList:true,subtree:true,characterData:true});
  }

  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden){checkDue();refreshOrganizerCards();}
  });
  addEventListener('focus',checkDue);
  addEventListener('pageshow',checkDue);

  scheduleDueCheck();

  window.LOKY_PC4_PLANNER={
    version:VERSION,
    snapshot,
    add:addItem,
    update:updateItem,
    remove:removeItem,
    parseVoiceCommand,
    checkDue,
    time:{
      zone:deviceTimeZone,
      format:fmtDeviceClock,
      nextDefault:nextPlannerTime,
    },
    sounds:{
      profiles:ALERT_SOUNDS,
      get:getAlertSound,
      set:setAlertSound,
      preview:playAlertSoundById,
      stop:stopAlertSound,
      startDue:startDueAlertSound,
    },
    open(type='reminder'){
      const slot=document.querySelector('.feature-memory');
      slot?.click();
      setTimeout(()=>{
        const page=document.querySelector('.loky-memory-window');
        if(page&&TYPE_META[type])openPlannerPanel(page,type);
      },20);
    },
  };
})();
