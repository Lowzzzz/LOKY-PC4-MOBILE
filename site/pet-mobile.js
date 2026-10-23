(() => {
  'use strict';
  const $=id=>document.getElementById(id),pet=window.LokyPet,commands=window.LokyPetCommands;
  const canvas=$('mobilePet'),stage=document.querySelector('.pet-stage'),menu=$('petMenu'),content=$('petMenuContent');
  const features=window.LOKY_PC4_FEATURES,live=window.LOKY_PC4_LIVE;
  const status=$('petStatus'),activation=$('activationPanel');
  const integrated=document.body.dataset.petMode==='integrated';
  const parking=document.createElement('div');parking.hidden=true;document.body.append(parking);parking.append(activation);
  let x=0,y=0,vector=null,lastVector=[1,0],speed=33.04,motionSpeed=0,target=null,drag=null,epoch=0,expressionDemo=null,demoTimer=0;
  let initialized=false,lastState='',lastStatus='',tab='actions';
  const labels={reposo:'En reposo',sentarse:'Sentado',saludar:'¡Hola!',caminar:'Paseando',inclinar:'Con curiosidad',asentir:'¡Sí!',negar:'Un gesto de no',patita:'Aquí está mi patita'};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function bounds(animation=pet.inspect().clip){const vertical=canvas.clientHeight*.37;const low=24-stage.clientHeight*.65+vertical;const high=stage.clientHeight*.35-24-vertical;const footprint=(animation==='saludar'||animation==='patita')?.34:.26;return {x:Math.max(0,stage.clientWidth/2-canvas.clientWidth*footprint-10),yMin:low>high?(low+high)/2:Math.min(0,low),yMax:low>high?(low+high)/2:high};}
  function home(){const b=bounds();return [0,clamp(0,b.yMin,b.yMax)];}
  function place(animation){const b=bounds(typeof animation==='string'?animation:undefined);x=clamp(x,-b.x,b.x);y=clamp(y,b.yMin,b.yMax);canvas.style.transform=`translate(${x}px,${y}px)`;canvas.dataset.x=x.toFixed(2);canvas.dataset.y=y.toFixed(2);}
  function announce(text){if(text!==lastStatus){status.textContent=text;lastStatus=text;}const feedback=$('petFeedback');if(feedback)feedback.textContent=text;}
  function resolveState(){
    if(features?.silenced)return 'SILENCED';
    if(expressionDemo)return expressionDemo;
    const s=live?.state,label=$('conversationState').textContent;
    if(/RECONECTANDO|CONECTANDO/.test(label))return 'RECONNECTING';
    if(label==='NO CONECTADO')return 'ERROR';
    if(s?.userSpeaking)return 'LISTENING';
    if(s?.playing?.size>0||label==='LOKY HABLANDO')return 'SPEAKING';
    if(label==='PENSANDO')return 'THINKING';
    return s?.desired&&s?.setupReady?'LISTENING':'IDLE';
  }
  function sync(){
    const state=resolveState();pet.setState(state);canvas.dataset.petState=state;
    $('petConnection').textContent=live?.state?.desired&&live?.state?.setupReady?'CONECTADO':integrated?'MOBILE':'VISTA PREVIA';
    const silenced=!!features?.silenced;$('petSilence').setAttribute('aria-pressed',String(silenced));$('petSilence').textContent=silenced?'Volver a hablar':'Silencio';
    $('petConnect').classList.toggle('hidden',!$('talkButton').classList.contains('hidden'));
    if(lastState!==state){lastState=state;if(state==='SILENCED')announce('En silencio · toca Volver a hablar');else if(state==='LISTENING')announce('Te escucho');else if(state==='THINKING')announce('Estoy pensando…');else if(state==='SPEAKING')announce('Hablando contigo');else if(state==='IDLE'&&initialized)announce('Tócame para saludar · puedes moverme');}
    const info=pet.inspect();canvas.dataset.clip=info.clip;canvas.dataset.frame=String(Math.floor(info.position));canvas.dataset.renderFps=info.renderFps.toFixed(1);canvas.dataset.renderCostMax=info.renderCostMax.toFixed(2);canvas.dataset.ready=String(info.ready);
  }
  function stop(){epoch++;vector=null;motionSpeed=0;target=null;pet.choose('reposo');announce('Me quedo aquí');}
  async function act(action){
    if(!commands.ACTIONS.includes(action))return {executed:false,error:'invalid_action'};
    const current=++epoch;
    vector=null;motionSpeed=0;target=null;
    await pet.ready;
    if(current!==epoch)return {executed:false,error:'superseded'};
    let clip=action,heading=null;
    if(action==='despacio'){speed=14;heading=lastVector;clip=commands.viewFor(commands.heading(...heading));}
    else if(action==='seguir'){heading=lastVector;clip=commands.viewFor(commands.heading(...heading));}
    else if(action==='volver'){const origin=home();if(Math.hypot(x-origin[0],y-origin[1])<2){clip='reposo';}else{heading=[origin[0]-x,origin[1]-y];target=origin;clip=commands.viewFor(commands.heading(...heading));}}
    else if(action.startsWith('esquina_')){const d=action.slice(8);heading=commands.DIRECTIONS[d];const b=bounds();target=[heading[0]*b.x,heading[1]<0?b.yMin:b.yMax];clip=commands.viewFor(d);}
    else if(action==='caminar'||action.startsWith('caminar_')){const d=action==='caminar'?'derecha':action.slice(8);heading=commands.DIRECTIONS[d];clip=commands.viewFor(d);}
    if(heading){const length=Math.hypot(...heading)||1;heading=heading.map(v=>v/length);lastVector=heading;}
    const ok=await pet.choose(clip);
    if(current!==epoch)return {executed:false,error:'superseded'};
    if(!ok){announce('No pude cargar ese movimiento. Inténtalo otra vez.');return {executed:false,error:'asset_unavailable'};}
    vector=heading;place(clip);announce(labels[clip]||(heading?'Caminando dentro de la habitación':'Listo'));
    return {executed:true,verified:true,action,clip,evidence:{scope:'mobile_viewport',status:'animation_loaded'}};
  }
  window.LokyPetMotion={step(dt,walking){
    if(!walking||!vector||drag||document.hidden)return;
    motionSpeed+=(speed-motionSpeed)*(1-Math.exp(-dt/.12));
    const b=bounds(),nextX=x+vector[0]*motionSpeed*dt,nextY=y+vector[1]*motionSpeed*dt;
    if(target&&Math.hypot(target[0]-x,target[1]-y)<=motionSpeed*dt+1){x=target[0];y=target[1];place();stop();return;}
    x=nextX;y=nextY;place();
    if(Math.abs(x-nextX)>.001||Math.abs(y-nextY)>.001)stop();
  }};
  new ResizeObserver(place).observe(stage);
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;stop();drag={id:event.pointerId,x:event.clientX,y:event.clientY,px:x,py:y,moved:false};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(dx,dy)>5)drag.moved=true;if(drag.moved){x=drag.px+dx;y=drag.py+dy;place();}});
  function release(event){if(!drag||drag.id!==event.pointerId)return;const tap=!drag.moved&&event.type==='pointerup';drag=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);if(tap)act('saludar');}
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',()=>{drag=null;});
  canvas.addEventListener('keydown',event=>{const map={ArrowLeft:'caminar_izquierda',ArrowRight:'caminar_derecha',ArrowUp:'caminar_arriba',ArrowDown:'caminar_abajo',' ':'reposo',Enter:'saludar'};if(map[event.key]){event.preventDefault();act(map[event.key]);}});
  $('petStop').onclick=stop;
  $('petSilence').onclick=()=>{expressionDemo=null;features.silenced?features.resume():features.silence();sync();};
  const button=(text,callback)=>{const b=document.createElement('button');b.type='button';b.className='glass-button';b.textContent=text;b.onclick=callback;return b;};
  const grid=()=>{const g=document.createElement('div');g.className='pet-grid';content.append(g);return g;};
  const paragraph=(text,className='')=>{const p=document.createElement('p');p.className=className;p.textContent=text;content.append(p);return p;};
  function closeMenu(){menu.close();$('petMenuButton').setAttribute('aria-expanded','false');$('petMenuButton').focus();}
  function openMenu(section='actions'){renderTab(section);if(!menu.open)menu.showModal();$('petMenuButton').setAttribute('aria-expanded','true');}
  $('petMenuButton').onclick=()=>openMenu();$('petMenuClose').onclick=closeMenu;
  menu.addEventListener('close',()=>{$('petMenuButton').setAttribute('aria-expanded','false');parking.append(activation);});
  menu.addEventListener('click',event=>{if(event.target===menu){const r=menu.getBoundingClientRect();if(event.clientY<r.top||event.clientX<r.left||event.clientX>r.right)closeMenu();}});
  for(const b of menu.querySelectorAll('[data-tab]'))b.onclick=()=>renderTab(b.dataset.tab);
  function actionButton(g,label,action){g.append(button(label,async()=>{closeMenu();await act(action);}));}
  function renderTab(next){
    tab=next;menu.dataset.mode=next;parking.append(activation);content.replaceChildren();for(const b of menu.querySelectorAll('[data-tab]'))b.setAttribute('aria-selected',String(b.dataset.tab===next));
    if(next==='actions'){
      paragraph('Toca un gesto o pídeselo a LOKY con tus palabras durante la conversación. También puedes arrastrarlo por su habitación.');
      const g=grid();for(const [name,action] of [['Saludar','saludar'],['Sentarse','sentarse'],['Pasear','caminar'],['Detenerse','reposo'],['← Izquierda','caminar_izquierda'],['Derecha →','caminar_derecha'],['↑ Arriba','caminar_arriba'],['Abajo ↓','caminar_abajo'],['Dar la patita','patita'],['Inclinar cabeza','inclinar'],['Asentir','asentir'],['Negar','negar'],['Volver al centro','volver'],['Más despacio','despacio']])actionButton(g,name,action);
      const form=document.createElement('form');form.className='pet-command';const input=document.createElement('input');input.placeholder='¿Puedes darme la patita?';input.setAttribute('aria-label','Petición para la mascota');input.maxLength=160;const submit=button('Enviar',null);submit.type='submit';form.append(input,submit);content.append(form);
      form.onsubmit=async event=>{event.preventDefault();const action=commands.parse(input.value);if(action){closeMenu();await act(action);}else{$('petFeedback').textContent='No identifiqué un movimiento. Puedes pedir, por ejemplo: «ve hacia la izquierda» o usar la conversación para otras formas de decirlo.';}};
      const feedback=paragraph('Este campo prueba movimientos locales; la conversación completa sigue en Hablar con LOKY.','pet-section-status');feedback.id='petFeedback';
      const details=document.createElement('details');details.innerHTML='<summary>Probar expresiones sin micrófono</summary>';const states=document.createElement('div');states.className='pet-grid';
      for(const [label,value] of [['Escuchar','LISTENING'],['Pensar','THINKING'],['Hablar','SPEAKING'],['Reposo','IDLE']])states.append(button(label,()=>{if(live.state.desired){announce('Termina la conversación antes de simular expresiones.');return;}features.resume();expressionDemo=value;clearTimeout(demoTimer);demoTimer=setTimeout(()=>{expressionDemo=null;sync();},6000);closeMenu();sync();announce('Prueba visual · '+label+' · 6 segundos');}));details.append(states);content.append(details);
    }else if(next==='care'){
      paragraph('Un momento para LOKY','eyebrow');const g=grid();actionButton(g,'Descansar sentado','sentarse');actionButton(g,'Dar un paseo','caminar');actionButton(g,'Jugar: dame la patita','patita');actionButton(g,'Volver al reposo','reposo');
      paragraph('Estos botones ejecutan animaciones reales. Alimentación, agua, energía y progreso persistente están pendientes de la integración de cuidados. Esta prueba no cambia estadísticas ni consume puntos.','pet-notice');
    }else if(next==='store'){renderStore('gestos');}
    else{
      const g=grid();const open=fn=>()=>{closeMenu();fn?.();};
      g.append(button('Configuración',open(()=>document.querySelector('.feature-settings')?.click())),button('Memorias y agenda',open(()=>document.querySelector('.feature-memory')?.click())),button('Aprender idiomas',open(()=>window.LOKY_PC4_LANGUAGE_TUTOR?.open())),button('Sismos / volver',open(()=>window.LOKY_PC4_SEISMIC?.toggle())),button('Alarmas',open(()=>window.LOKY_PC4_PLANNER?.open('alarm'))),button('Transcripción',()=>showTranscript()));
      paragraph('Conectar conversación');content.append(activation);if(activation.classList.contains('hidden'))paragraph('Dispositivo activado en este navegador. Inicia o termina la sesión desde Hablar con LOKY.');
      paragraph(integrated?'Tu acceso y tus funciones de LOKY permanecen en esta app.':'Vista previa aislada. Audio y funciones conservan sus módulos existentes. Las alertas en segundo plano requieren una instalación PWA validada; aquí no se registra un service worker.','pet-notice');
    }
  }
  function showTranscript(){parking.append(activation);content.replaceChildren();paragraph('Transcripción de esta sesión');paragraph('Tú: '+$('userTranscript').textContent);paragraph('LOKY: '+$('lokyTranscript').textContent);content.append(button('Volver a funciones',()=>renderTab('tools')));}
  function renderStore(category){
    content.replaceChildren();const section=document.createElement('section');section.className='pet-store';section.innerHTML='<div class="store-heading"><strong>LOKY PTS STORE</strong><span>DEMOSTRACIÓN</span></div><p>Explora y prueba. No hay saldo real ni compras en esta versión.</p><div class="store-categories"></div><div class="store-shelf" aria-label="Artículos de ejemplo; desliza horizontalmente"></div>';
    const categories=section.querySelector('.store-categories');for(const [key,label] of [['gestos','Gestos'],['cuidados','Cuidados'],['closet','Closet']]){const b=button(label,()=>renderStore(key));b.setAttribute('aria-pressed',String(category===key));categories.append(b);}
    const items=category==='gestos'?[['👋','Un saludo','Animación disponible','saludar'],['🐾','Dar la patita','Animación disponible','patita'],['☺','Curiosidad','Animación disponible','inclinar']]:category==='cuidados'?[['☾','Descanso','Sentarse, sin cambiar energía','sentarse'],['♧','Un paseo','Caminar dentro de Mobile','caminar'],['◉','Alimento','Cuidados aún no integrados',null]]:[['✧','Sin accesorios','Tu mascota original, sin lazos','reposo'],['◇','Accesorios','Catálogo pendiente de integración',null]];
    for(const [icon,title,description,action] of items){const article=document.createElement('article');article.className='store-item';const art=document.createElement('span');art.className='store-icon';art.textContent=icon;art.setAttribute('aria-hidden','true');const h=document.createElement('h4');h.textContent=title;const p=document.createElement('p');p.textContent=description;const b=button(action?'Probar animación':'No disponible',()=>{closeMenu();act(action);});b.disabled=!action;article.append(art,h,p,b);section.querySelector('.store-shelf').append(article);}
    content.append(section);paragraph('Artículos de ejemplo. Compras, inventario y cuidados completos todavía no disponibles.','pet-notice');
  }
  $('petConnect').onclick=()=>openMenu('tools');
  new MutationObserver(sync).observe($('talkButton'),{attributes:true,attributeFilter:['class']});
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
  new MutationObserver(sync).observe($('conversationState'),{childList:true,subtree:true,characterData:true});
  if(!integrated)$('buildLabel').textContent='VISTA PREVIA M2';
  // Preserve all original feature hooks; only this candidate owns the pet overlay.
  if(!integrated)window.LOKY_PC4_MOBILE={build:'0.3.2-pet-m1',platform:'ios-pwa-candidate',phase:'preview',sphereStats:()=>null,petStats:()=>pet.inspect()};
  window.LokyMobilePet={act,stop,resolveState,openMenu,inspect:()=>({...pet.inspect(),x,y,bounds:bounds(),moving:!!vector,tab,menuOpen:menu.open})};
  document.addEventListener('visibilitychange',()=>{if(document.hidden){drag=null;stop();}});
  pet.ready.then(ok=>{if(ok){initialized=true;place();announce('Tócame para saludar · puedes moverme');sync();}});
  setInterval(sync,100);

  // Natural-language tools share the existing Gemini session; no additional mic,
  // socket, model request, audio processing, or backend change is introduced.
  const bridges=new WeakMap(),previousSend=WebSocket.prototype.send;
  function installBridge(ws){
    if(bridges.has(ws))return;
    const voice=commands.createVoiceCommands({act,getState:resolveState});bridges.set(ws,voice);
    let chain=Promise.resolve();
    ws.addEventListener('message',event=>{chain=chain.then(async()=>{
      if(ws!==live.state.activeWs&&ws!==live.state.pendingWs)return;
      let packet;try{const raw=event.data instanceof Blob?await event.data.text():event.data instanceof ArrayBuffer?new TextDecoder().decode(event.data):event.data;packet=JSON.parse(raw);}catch{return;}
      const c=packet.serverContent;
      if(c)voice.receive({eventType:'live-message',inputTranscription:c.inputTranscription?.text,inputFinished:c.inputTranscription?.finished,outputTranscription:c.outputTranscription?.text,audio:c.modelTurn?.parts?.some(p=>p.inlineData)?[true]:[],interrupted:c.interrupted,turnComplete:c.turnComplete,waitingForInput:c.waitingForInput});
      // Do not await a tool's transcription grace period in the message queue:
      // later transcript fragments must remain able to reach the same turn.
      for(const call of packet.toolCall?.functionCalls||[]){if(call.name!=='mobile_pet_action')continue;voice.request(call.args?.action).then(response=>{if(ws.readyState===WebSocket.OPEN)previousSend.call(ws,JSON.stringify({toolResponse:{functionResponses:[{id:call.id,name:call.name,response}]}}));}).catch(error=>console.warn('Mobile pet result',error.message));}
    }).catch(error=>console.warn('Mobile pet command',error.message));});
    ws.addEventListener('close',()=>voice.reset());ws.addEventListener('error',()=>voice.reset());
  }
  WebSocket.prototype.send=function(data){
    if(typeof data==='string'&&data.startsWith('{"setup":')&&String(this.url||'').includes('BidiGenerateContentConstrained')){
      installBridge(this);
      try{const p=JSON.parse(data);if(p.setup&&!p.setup.sessionResumption?.handle){
        p.setup.tools=Array.isArray(p.setup.tools)?p.setup.tools:[];
        p.setup.tools.push({functionDeclarations:[{name:'mobile_pet_action',description:'Ejecuta un movimiento o gesto de tu mascota visible dentro de LOKY Mobile cuando el usuario te lo pida de forma natural. No usar para ejemplos, negaciones ni acciones hipotéticas.',parameters:{type:'OBJECT',properties:{action:{type:'STRING',enum:commands.ACTIONS}},required:['action']}}]});
        p.setup.systemInstruction=p.setup.systemInstruction||{parts:[]};p.setup.systemInstruction.parts=p.setup.systemInstruction.parts||[];
        p.setup.systemInstruction.parts.push({text:'Tu presencia en Mobile es un perro gris y blanco con pantalla facial, sin lazos. Puedes saludar, caminar y cambiar de dirección, detenerte, sentarte, volver al centro, ir despacio, inclinar/asentir/negar con la cabeza y dar la patita. Comprende peticiones naturales y usa mobile_pet_action. Solo confirma ejecución si la herramienta devuelve executed:true. No te acuestas, no sales del área de esta app, no flotas sobre otras apps. Tienda/cuidados son una demostración; no hay compras, puntos, alimentación ni sincronización con PC4. Conserva conversación y demás funciones.'});data=JSON.stringify(p);
      }}catch(error){console.warn('Mobile pet setup',error.message);}
    }
    return previousSend.call(this,data);
  };
})();
