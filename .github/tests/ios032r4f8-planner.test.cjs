'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const src=fs.readFileSync('site/mobile-planner.js','utf8');

function fakeElement(){
  return {
    nodeType:1,
    textContent:'',
    value:'',
    type:'',
    maxLength:0,
    dataset:{},
    children:[],
    className:'',
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    appendChild(child){this.children.push(child);return child;},
    remove(){},
    addEventListener(){},
    setAttribute(){},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    matches(){return false;},
  };
}

const store={};
const body=fakeElement();
const head=fakeElement();
const transcript=fakeElement();
const state=fakeElement();

const document={
  body,head,
  getElementById(id){
    if(id==='userTranscript')return transcript;
    if(id==='conversationState')return state;
    return null;
  },
  createElement(){return fakeElement();},
  querySelector(){return null;},
  addEventListener(){},
};

class FakeObserver{constructor(cb){this.cb=cb;}observe(){}disconnect(){}}

const context={
  console,
  document,
  localStorage:{
    getItem:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,
    setItem:(k,v)=>{store[k]=String(v);},
    removeItem:k=>{delete store[k];},
  },
  MutationObserver:FakeObserver,
  crypto:{randomUUID:()=>`id-${Math.random()}`},
  Intl,
  Date,
  Number,
  Math,
  JSON,
  String,
  Array,
  Object,
  RegExp,
  Uint8Array,
  DataView,
  Promise,
  navigator:{},
  requestAnimationFrame:fn=>{fn();return 1;},
  setInterval:()=>1,
  clearInterval:()=>{},
  setTimeout:()=>1,
  clearTimeout:()=>{},
  addEventListener:()=>{},
  window:null,
};
context.window=context;
vm.createContext(context);
vm.runInContext(src,context,{filename:'mobile-planner.js'});

const api=context.LOKY_PC4_PLANNER;
assert(api,'planner API missing');
assert(/0\.3\.2R4F8(?:-planner-v1|R1-alert-sounds|R2-safe-area-device-time|R3-voice-alarm-calendar-manual-stop|R4-robust-voice-planner-intents)/.test(api.version));

const now=new Date(2026,8,17,10,0,0,0).getTime();

let p=api.parseVoiceCommand('recuérdame llamar a Juan mañana a las 3 de la tarde',now);
assert(p);
assert.equal(p.type,'reminder');
assert.equal(p.title,'llamar a Juan');
let d=new Date(p.at);
assert.equal(d.getDate(),18);
assert.equal(d.getHours(),15);
assert.equal(d.getMinutes(),0);

p=api.parseVoiceCommand('pon una alarma a las 7 de la mañana',now);
assert(p);
assert.equal(p.type,'alarm');
assert.equal(p.title,'Alarma');
d=new Date(p.at);
assert.equal(d.getDate(),18);
assert.equal(d.getHours(),7);

p=api.parseVoiceCommand('agenda dentista mañana a las 4:30 de la tarde',now);
assert(p);
assert.equal(p.type,'calendar');
assert.equal(p.title,'dentista');
d=new Date(p.at);
assert.equal(d.getDate(),18);
assert.equal(d.getHours(),16);
assert.equal(d.getMinutes(),30);

p=api.parseVoiceCommand('recuérdame en 15 minutos sacar la ropa',now);
assert(p);
assert.equal(p.type,'reminder');
assert.equal(p.title,'sacar la ropa');
assert.equal(p.at,now+15*60*1000);

p=api.parseVoiceCommand('recuérdame comprar leche',now);
assert(p);
assert.equal(p.error,'MISSING_TIME');

p=api.parseVoiceCommand('ponme una alarma en 10 minutos',now);
assert(p);
assert.equal(p.type,'alarm');
assert.equal(p.title,'Alarma');
assert.equal(p.at,now+10*60*1000);

p=api.parseVoiceCommand('despiértame mañana a las 8 de la mañana',now);
assert(p);
assert.equal(p.type,'alarm');
assert.equal(p.title,'Alarma');
d=new Date(p.at);
assert.equal(d.getDate(),18);
assert.equal(d.getHours(),8);

p=api.parseVoiceCommand('pon una alarma a las 11:45 pm',now);
assert(p);
assert.equal(p.type,'alarm');
d=new Date(p.at);
assert.equal(d.getHours(),23);
assert.equal(d.getMinutes(),45);

p=api.parseVoiceCommand('pon en el calendario reunión el viernes a las 2 de la tarde',now);
assert(p);
assert.equal(p.type,'calendar');
assert.equal(p.title,'reunión');
d=new Date(p.at);
assert.equal(d.getDay(),5);
assert.equal(d.getHours(),14);

p=api.parseVoiceCommand('calendario cita mañana a las 9 de la mañana',now);
assert(p);
assert.equal(p.type,'calendar');
assert.equal(p.title,'cita');
d=new Date(p.at);
assert.equal(d.getDate(),18);
assert.equal(d.getHours(),9);

p=api.parseVoiceCommand('LOKY quiero que me programes una alarma para dentro de dos minutos',now);
assert(p);
assert.equal(p.type,'alarm');
assert.equal(p.title,'Alarma');
assert.equal(p.at,now+2*60*1000);

p=api.parseVoiceCommand('LOKY activa una alarma a las ocho de la noche',now);
assert(p);
assert.equal(p.type,'alarm');
assert.equal(p.title,'Alarma');
d=new Date(p.at);
assert.equal(d.getHours(),20);

p=api.parseVoiceCommand('necesito una alarma en cinco minutos',now);
assert(p);
assert.equal(p.type,'alarm');
assert.equal(p.at,now+5*60*1000);

p=api.parseVoiceCommand('hazme una alarma a la una de la tarde',now);
assert(p);
assert.equal(p.type,'alarm');
d=new Date(p.at);
assert.equal(d.getHours(),13);

p=api.parseVoiceCommand('quiero que me agendes una reunión mañana a las dos de la tarde',now);
assert(p);
assert.equal(p.type,'calendar');
assert.equal(p.title,'reunión');
d=new Date(p.at);
assert.equal(d.getHours(),14);

p=api.parseVoiceCommand('pon en mi calendario dentista dentro de tres horas',now);
assert(p);
assert.equal(p.type,'calendar');
assert.equal(p.title,'dentista');
assert.equal(p.at,now+3*60*60*1000);

assert.equal(api.parseVoiceCommand('abre google',now),null);

const item=api.add('reminder','Comprar pan',now+3600000,'voice');
assert(item);
assert.equal(api.snapshot().length,1);
const dupe=api.add('reminder','Comprar pan',now+3600000,'voice');
assert.equal(dupe.id,item.id);
assert.equal(api.snapshot().length,1);
assert.equal(api.update(item.id,{done:true}),true);
assert(api.snapshot()[0].doneAt>0);
assert.equal(api.remove(item.id),true);
assert.equal(api.snapshot().length,0);

assert(api.sounds,'sounds API missing');
assert.equal(Object.keys(api.sounds.profiles).length,8);
assert.equal(api.sounds.get('reminder'),'loky');
assert.equal(api.sounds.get('calendar'),'loky');
assert.equal(api.sounds.get('alarm'),'loky');
assert.equal(api.sounds.set('reminder','soft'),true);
assert.equal(api.sounds.set('calendar','digital'),true);
assert.equal(api.sounds.set('alarm','urgent'),true);
assert.equal(api.sounds.get('reminder'),'soft');
assert.equal(api.sounds.get('calendar'),'digital');
assert.equal(api.sounds.get('alarm'),'urgent');
assert.equal(api.sounds.set('alarm','silent'),true);
assert.equal(api.sounds.get('alarm'),'silent');
assert.equal(api.sounds.set('alarm','not-a-sound'),false);
assert.equal(typeof api.sounds.stop,'function');
assert.equal(typeof api.sounds.startDue,'function');

assert(api.time,'time API missing');
assert.equal(typeof api.time.zone(),'string');
assert(api.time.zone().length>0);
assert.equal(typeof api.time.format(now),'string');
assert(api.time.format(now).length>0);
assert.equal(api.time.nextDefault(now),now+5*60*1000);

assert(!/new\s+WebSocket\s*\(/.test(src));
assert(!/getUserMedia\s*\(/.test(src));
assert(!/LOKY_PC4_LIVE/.test(src));
assert(src.includes("String(conversationState.textContent||'').trim()==='PENSANDO'"));
assert(src.includes("Notification.requestPermission()"));
assert(src.includes("navigator.serviceWorker?.ready"));
assert(src.includes("loky-organizer-card"));
assert(src.includes("RECORDATORIOS"));
assert(src.includes("CALENDARIO"));
assert(src.includes("ALARMAS"));
assert(src.includes("const ALERT_SOUND_KEY='loky_pc4_mobile_alert_sounds_v1'"));
assert(src.includes("const ALERT_SOUNDS={"));
for(const id of ['loky','soft','digital','urgent','scifi','classic','pulse','silent']){
  assert(Object.prototype.hasOwnProperty.call(api.sounds.profiles,id),`missing sound ${id}`);
}
assert(src.includes("function showSoundSelector("));
assert(src.includes("function playAlertSoundById("));
assert(src.includes("startDueAlertSound(item.type)"));
assert(src.includes("SONIDO DE ALERTA"));
assert(src.includes("SELECCIONAR"));
assert(src.includes("SILENCIOSO"));
assert(src.includes("height:calc(54px + var(--safe-top))"));
assert(src.includes("padding:var(--safe-top) 12px 0"));
assert(src.includes("function deviceTimeZone("));
assert(src.includes("function fmtDeviceClock("));
assert(src.includes("function nextPlannerTime("));
assert(src.includes("HORA LOCAL DEL DISPOSITIVO"));
assert(src.includes("when.value=toLocalInput(nextPlannerTime())"));
assert(!src.includes("Date.now()+60*60*1000"));
assert(src.includes("const WEEKDAY_INDEX={"));
assert(src.includes("despiertame"));
assert(src.includes("function startDueAlertSound("));
assert(src.includes("DETENER ALARMA"));
assert(src.includes("DETENER SONIDO"));
assert(src.includes("Number.POSITIVE_INFINITY"));
assert(src.includes("type==='reminder'?4:3"));
assert(src.includes("stopAlertSound();"));
assert(src.includes("startDueAlertSound(item.type)"));
assert(src.includes("function spokenNumber("));
assert(src.includes("const alarmIntent="));
assert(src.includes("const calendarIntent="));
assert(src.includes("dentro\\s+de"));
assert(src.includes("agendes"));

console.log('R4F8 planner reminders alarms calendar PASS');
