(()=>{const exports={};
'use strict';
const DIRECTIONS={derecha:[1,0],izquierda:[-1,0],arriba:[0,-1],abajo:[0,1],superior_derecha:[1,-1],superior_izquierda:[-1,-1],inferior_derecha:[1,1],inferior_izquierda:[-1,1]};
const ACTIONS=['reposo','sentarse','saludar','caminar',...['izquierda','derecha','arriba','abajo'].map(d=>'caminar_'+d),...Object.keys(DIRECTIONS).filter(d=>d.includes('_')).map(d=>'esquina_'+d),'volver','seguir','despacio','inclinar','asentir','negar','patita'];
const viewFor=direction=>direction==='derecha'||direction==='inferior_derecha'?'caminar':direction==='inferior_izquierda'?'caminar_izquierda':'caminar_'+direction;
function heading(dx,dy){if(Math.abs(dx)>Math.abs(dy)*2)return dx<0?'izquierda':'derecha';if(Math.abs(dy)>Math.abs(dx)*2)return dy<0?'arriba':'abajo';return (dy<0?'superior_':'inferior_')+(dx<0?'izquierda':'derecha');}
exports.ACTIONS=Object.freeze(ACTIONS);exports.DIRECTIONS=DIRECTIONS;exports.viewFor=viewFor;exports.heading=heading;

'use strict';
const REQUESTS=[
  ['saludar',/^(?:saluda(?:me|nos)?|saludame|saldame|di hola|haz un saludo|(?:puedes|podrias|quieres) saludar(?:me|nos)?|quiero que (?:me |nos )?saludes)$/],
  ['caminar',/^(?:(?:camina|anda|pasea)(?: un poco)?|ponte a caminar|(?:puedes|podrias) caminar(?: un poco)?|da un paseo|quiero que camines)$/],
  ['sentarse',/^(?:sientate|toma asiento|ponte sentado|(?:puedes|podrias) sentarte|quiero que te sientes)$/],
  ['reposo',/^(?:quedate quieto|estate quieto|reposo|descansa|para|parate|detente|deja de (?:caminar|andar|moverte)|para de caminar|(?:puedes|podrias) (?:quedarte quieto|parar|descansar)|quiero que (?:pares|te quedes quieto))$/]
];
function parse(text){
  if(typeof text!=='string'||text.length>160||/["“”«»]/.test(text))return null;
  let value=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[¿?¡!.,;:]/g,' ').replace(/\s+/g,' ').trim();
  // Strip only edge courtesies/names; the whole remaining phrase must match.
  for(let i=0;i<4;i++)value=value.replace(/^(?:loky|loki|oye|por favor|porfa)\s+/,'').replace(/\s+(?:loky|loki|por favor|porfa)$/,'');
  if(/\b(?:no|nunca|jamas|tampoco)\b/.test(value))return null;
  if(/[?¿]/.test(text)&&!/^(?:puedes|podrias|quieres)\b/.test(value))return null;
  const natural=value.replace(/^(?:puedes|podrias) /,'');
  if(/^(?:vuelve|regresa|volver|regresar) a tu (?:sitio|lugar)$/.test(natural))return 'volver';
  if(/^(?:sigue|sigue caminando|continua caminando|reanuda la marcha|seguir caminando)$/.test(natural))return 'seguir';
  if(/^(?:mas despacio|camina mas despacio|caminar mas despacio|ve mas lento)$/.test(natural))return 'despacio';
  if(/^(?:quedate ahi|quedarte ahi|detente ahi|para ahi)$/.test(natural))return 'reposo';
  if(/^(?:inclina|inclinar) (?:la |tu )?cabeza$/.test(natural))return 'inclinar';
  if(/^(?:asiente|asentir|di que si con la cabeza)$/.test(natural))return 'asentir';
  if(/^(?:niega con la cabeza|negar con la cabeza|mueve la cabeza de lado a lado)$/.test(natural))return 'negar';
  if(/^(?:dame|darme|da|ofrece) (?:la |tu )?patita$/.test(natural))return 'patita';
  const direction=natural.match(/^(?:camina|caminar|ve|vete|anda|dirigete)(?: un poco)? (?:hacia |a |para )?(?:la |el )?(izquierda|derecha|arriba|abajo)$/);
  if(direction)return 'caminar_'+direction[1];
  const corner=natural.match(/^(?:camina|caminar|ve|vete|dirigete) (?:hacia |a )?(?:la )?esquina (superior|inferior) (izquierda|derecha)$/);
  if(corner)return 'esquina_'+corner[1]+'_'+corner[2];
  const cornerAlt=natural.match(/^(?:camina|caminar|ve|vete) (?:a |hacia )?(?:la )?esquina de (arriba|abajo) (?:a la |a |)(izquierda|derecha)$/);
  if(cornerAlt)return 'esquina_'+(cornerAlt[1]==='arriba'?'superior':'inferior')+'_'+cornerAlt[2];
  return REQUESTS.find(([,pattern])=>pattern.test(value))?.[0]||null;
}

function directContext(text){
  if(typeof text!=='string'||!text.trim()||text.length>160||/["'“”‘’«»]/.test(text))return false;
  const value=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[¿?¡!.,;:]/g,' ').trim();
  // Negative or reported/quoted/hypothetical language is not a direct order.
  // These are context guards, not a second dictionary of action phrases.
  if(/\b(?:no|nunca|jamas|tampoco)\b/.test(value))return false;
  if(/\b(?:ejemplo|significa|significado|frase|comando|palabra|dijo|dijiste|diciendo|hablando|mencionando|explica|explicame|explicar)\b/.test(value))return false;
  if(/\b(?:que pasa si|que pasaria si|si (?:te )?(?:digo|dijera|pidiera|pido)|por que|como (?:se|lo|puedes|haces))\b/.test(value))return false;
  if(/^\s*(?:el|la|los|las|un|una|mi|su)\s/.test(value))return false;
  if(/[¿?]/.test(text)&&/^(?:que|como|cuando|donde|quien|por que)\b/.test(value))return false;
  return true;
}
exports.createVoiceCommands=({act,getState,now=Date.now})=>{
  let buffer='',started=0,blocked=false,committed=false,receipt=null,turnClosed=true;
  let turn=0,epoch=0,closures=0,lastChunkAt=0,finished=false,responding=false;
  const waiters=new Set();const signal=()=>{for(const done of [...waiters])done();};
  const unavailable=()=>({executed:false,verified:false,error:'mascota_unavailable',evidence:{status:'unavailable'}});
  const quiet=()=>['SILENCED','RECONNECTING','ERROR'].includes(getState());
  const rejected=()=>({executed:false,verified:false,error:'pet_command_not_recognized',summary:'No se pudo vincular esta acción a una petición directa del usuario en el turno actual. Pide aclaración; no repitas la acción.',evidence:{status:'not_understood'}});
  const reset=()=>{epoch++;buffer='';started=0;blocked=false;committed=false;receipt=null;turnClosed=true;finished=false;responding=false;signal();};
  const begin=()=>{turn++;buffer='';started=now();blocked=false;committed=false;receipt=null;turnClosed=false;finished=false;responding=false;};
  const commit=action=>{
    if(committed||blocked||!ACTIONS.includes(action)||!directContext(buffer)||quiet())return;
    committed=true;const ownerTurn=turn,ownerEpoch=epoch;
    receipt={action,at:now(),result:Promise.resolve().then(()=>{
      if(ownerEpoch!==epoch||ownerTurn!==turn||quiet())return unavailable();
      return act(action);
    }).catch(()=>({executed:false,verified:false,error:'mascota_action_failed',evidence:{status:'failed'}}))};
  };
  return {reset,async request(action){
    if(!ACTIONS.includes(action))return {executed:false,verified:false,error:'invalid_mascota_action',evidence:{status:'failed'}};
    const deadline=Date.now()+1500,ownerEpoch=epoch,ownerClosures=closures;
    let ownerTurn=turnClosed||!buffer?null:turn;
    while(true){
      if(quiet()||epoch!==ownerEpoch)return unavailable();
      // A late tool call may ask for the result of the local shortcut after
      // turnComplete. Return that same recent receipt; never execute it twice.
      if(receipt&&(ownerTurn===null||ownerTurn===turn)&&now()-receipt.at<=1500)return receipt.action===action?receipt.result:rejected();
      if(closures!==ownerClosures)return rejected();
      if(ownerTurn===null&&!turnClosed&&buffer)ownerTurn=turn;
      if(ownerTurn!==null){
        if(turn!==ownerTurn||turnClosed||blocked||now()-started>15000)return rejected();
        if(receipt)return receipt.action===action?receipt.result:rejected();
        // Native transcription can lag the tool. Keep it for this turn instead
        // of clearing unknown wording, and allow a short interval for fragments.
        if(finished||responding||Date.now()-lastChunkAt>=120){
          if(!directContext(buffer))return rejected();
          commit(action);if(receipt)return receipt.result;
        }
      }
      if(Date.now()>=deadline)return rejected();
      const settle=ownerTurn!==null&&!finished&&!responding?Math.max(1,lastChunkAt+120-Date.now()):deadline-Date.now();
      await new Promise(resolve=>{const done=()=>{clearTimeout(timer);waiters.delete(done);resolve();};const timer=setTimeout(done,Math.max(1,Math.min(deadline-Date.now(),settle)));waiters.add(done);});
    }
  },receive(payload){
    if(!payload||payload.eventType!=='live-message'){if(payload?.eventType==='live-close'||payload?.eventType==='live-error')reset();return;}
    if(quiet()){reset();return;}
    const responseStarted=Boolean(payload.outputTranscription||(Array.isArray(payload.audio)&&payload.audio.length));
    const chunk=typeof payload.inputTranscription==='string'?payload.inputTranscription:'';
    if(payload.interrupted)reset();
    if(chunk){
      // Native input transcription belongs to the user, even when audio playback
      // has already changed the UI to SPEAKING. Output text never enters buffer.
      if(turnClosed)begin();
      if(now()-started>8000||buffer.length+chunk.length>160)blocked=true;
      if(!blocked)buffer+=chunk;
      lastChunkAt=Date.now();finished=false;
    }
    if(payload.inputFinished)finished=true;
    // Preserve the conservative local shortcut and its shared receipt. Semantic
    // tool requests need current owner input, but do not need a lexical match.
    if(payload.inputFinished||responseStarted||payload.turnComplete||payload.waitingForInput){
      if(!turnClosed)commit(parse(buffer));
    }
    if(responseStarted)responding=true;
    if(payload.turnComplete||payload.waitingForInput){turnClosed=true;closures++;}
    signal();
  }};
};
exports.parse=parse;

window.LokyPetCommands=exports;})();