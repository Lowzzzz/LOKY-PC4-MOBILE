'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const commandContext={window:{},Date,Promise,Set,setTimeout,clearTimeout};vm.createContext(commandContext);vm.runInContext(fs.readFileSync('site/pet-commands.js','utf8'),commandContext);
const commands=commandContext.window.LokyPetCommands;
for(const [phrase,expected] of [['¿Puedes darme la patita?','patita'],['Loky, por favor, camina hacia la izquierda','caminar_izquierda'],['quiero que te sientes','sentarse'],['deja de caminar','reposo'],['ve a la esquina de arriba a la derecha','esquina_superior_derecha'],['no camines','reposo-never'],['acuéstate',null],['el niño dijo camina',null]])assert.equal(commands.parse(phrase),expected==='reposo-never'?null:expected,phrase);
const manifest=JSON.parse(fs.readFileSync('site/pet-assets/manifest.json'));
assert.equal(Object.keys(manifest.clips).length,18);assert.equal(Object.values(manifest.clips).reduce((n,c)=>n+c.count,0),588);assert(!manifest.clips.acostarse);
for(const [name,c] of Object.entries(manifest.clips)){assert(fs.existsSync(path.join('site/pet-assets',c.atlas)),name);assert.equal(c.frames.length,c.count);for(const f of c.frames)assert(f.face.length===0||f.face.length===manifest.faceColumns*manifest.faceRows,name);}
const html=fs.readFileSync('site/index.html','utf8');assert(!html.includes('src="./sphere-mobile.js'));assert(html.includes('src="./app.js'));assert(!html.includes('pet-preview-storage.js'));assert(html.includes('<dialog id="petMenu"'));assert(!html.includes('<dialog open'));
for(const src of [...html.matchAll(/(?:src|href)="\.\/([^"?]+)(?:\?[^" ]*)?"/g)].map(m=>m[1]))assert(fs.existsSync(path.join('site',src)),'missing '+src);
const source=fs.readFileSync('site/pet-mobile.js','utf8');assert(!/getUserMedia\s*\(|new WebSocket\s*\(|speechSynthesis/.test(source));
class FakeSocket {constructor(url){this.url=url;this.readyState=1;this.listeners={};this.sent=[];}addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}send(data){this.sent.push(data);}emit(type,data){for(const fn of this.listeners[type]||[])fn({data});}}
FakeSocket.OPEN=1;
let visualState='LISTENING';
const executed=[],live={state:{}},context={WebSocket:FakeSocket,commands,live,resolveState:()=>visualState,act:async action=>{executed.push(action);return {executed:true,verified:true,action};},console,Blob,ArrayBuffer,TextDecoder,Promise,WeakMap,Date,setTimeout,clearTimeout};
vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  const bridges='),source.lastIndexOf('})();')),context);
const ws=new FakeSocket('wss://example.test/BidiGenerateContentConstrained');live.state.activeWs=ws;
const setup={setup:{systemInstruction:{parts:[{text:'original personality'}]},tools:[{googleSearch:{}}],generationConfig:{responseModalities:['AUDIO']}}};ws.send(JSON.stringify(setup));const sent=JSON.parse(ws.sent[0]);assert.equal(sent.setup.tools.length,2);assert.equal(sent.setup.systemInstruction.parts[0].text,'original personality');assert.deepEqual(sent.setup.generationConfig,setup.setup.generationConfig);
const audio='{"realtimeInput":{"audio":{"data":"PCM_EXACT","mimeType":"audio/pcm"}}}';ws.send(audio);assert.equal(ws.sent.at(-1),audio);
const resumed='{"setup":{"sessionResumption":{"handle":"same-session"}}}';ws.send(resumed);assert.equal(ws.sent.at(-1),resumed);assert.equal(ws.listeners.message.length,1);
const other=new FakeSocket('wss://example.test/unrelated');other.send(JSON.stringify(setup));assert.equal(other.sent[0],JSON.stringify(setup));assert.equal(other.listeners.message,undefined);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  // A semantic request arriving before transcription must not block the queue.
  ws.emit('message',JSON.stringify({toolCall:{functionCalls:[{id:'a',name:'mobile_pet_action',args:{action:'patita'}}]}}));
  await delay(20);
  ws.emit('message',JSON.stringify({serverContent:{inputTranscription:{text:'Me gustaría que me ofrecieras esa patita',finished:true}}}));
  await delay(220);
  assert.deepEqual(executed,['patita']);const response=JSON.parse(ws.sent.at(-1));assert.equal(response.toolResponse.functionResponses[0].response.executed,true);
  ws.emit('message',JSON.stringify({serverContent:{turnComplete:true}}));await delay(10);
  ws.emit('message',JSON.stringify({serverContent:{inputTranscription:{text:'No quiero que camines',finished:true}},toolCall:{functionCalls:[{id:'b',name:'mobile_pet_action',args:{action:'caminar'}}]}}));await delay(180);
  assert.deepEqual(executed,['patita']);assert.equal(JSON.parse(ws.sent.at(-1)).toolResponse.functionResponses[0].response.executed,false);
  assert(sent.setup.systemInstruction.parts.some(p=>p.text.includes('mascota animada visible')&&p.text.includes('Espera el resultado')));
  // Real Mobile handles audio before the pet bridge: state is already SPEAKING
  // when input transcription and response audio share one server packet.
  for(const [phrase,action] of [['saluda','saludar'],['salúdame','saludar'],['Loky saluda','saludar'],['camina','caminar'],['detente','reposo']]){
    ws.emit('message',JSON.stringify({serverContent:{turnComplete:true}}));await delay(5);
    visualState='SPEAKING';const count=executed.length;
    ws.emit('message',JSON.stringify({serverContent:{inputTranscription:{text:phrase,finished:true},outputTranscription:{text:'Respuesta'},modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm',data:'FAKE'}}]}},toolCall:{functionCalls:[{id:phrase,name:'mobile_pet_action',args:{action}}]}}));
    await delay(25);assert.equal(executed.length,count+1,phrase);assert.equal(executed.at(-1),action,phrase);assert.equal(JSON.parse(ws.sent.at(-1)).toolResponse.functionResponses[0].response.executed,true,phrase);
  }
  // A tool arriving after closure must obtain the existing successful receipt.
  ws.emit('message',JSON.stringify({serverContent:{turnComplete:true}}));await delay(5);visualState='LISTENING';
  const count=executed.length;
  ws.emit('message',JSON.stringify({serverContent:{inputTranscription:{text:'salúdame',finished:true},turnComplete:true}}));await delay(10);
  ws.emit('message',JSON.stringify({toolCall:{functionCalls:[{id:'late',name:'mobile_pet_action',args:{action:'saludar'}}]}}));await delay(25);
  assert.equal(executed.length,count+1);assert.equal(JSON.parse(ws.sent.at(-1)).toolResponse.functionResponses[0].response.executed,true);
  // Model output alone, negation and reported commands never trigger gestures.
  for(const phrase of ['no saludes','el niño dijo saluda']){
    ws.emit('message',JSON.stringify({serverContent:{inputTranscription:{text:phrase,finished:true},modelTurn:{parts:[{inlineData:{data:'FAKE'}}]}},toolCall:{functionCalls:[{id:phrase,name:'mobile_pet_action',args:{action:'saludar'}}]}}));await delay(25);
    assert.equal(executed.length,count+1);assert.equal(JSON.parse(ws.sent.at(-1)).toolResponse.functionResponses[0].response.executed,false);
    ws.emit('message',JSON.stringify({serverContent:{turnComplete:true}}));await delay(5);
  }
  ws.emit('message',JSON.stringify({serverContent:{outputTranscription:{text:'saluda'},turnComplete:true}}));await delay(5);assert.equal(executed.length,count+1);
  console.log('PASS: 18 atlases / 588 frames; asset paths; menu hidden; commands/negative intent; preserved setup/audio/resumption; semantic tool/transcription ordering.');
})().catch(error=>{console.error(error);process.exitCode=1;});
