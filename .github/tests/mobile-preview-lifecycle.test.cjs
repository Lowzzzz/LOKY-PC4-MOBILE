'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('site/live-mobile.js','utf8');
function extract(name){const re=new RegExp('  (?:async )?function '+name+'\\('),start=src.search(re);assert(start>=0,name);const end=src.indexOf('\n  }',start);assert(end>start,name);return src.slice(start,end+4);}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
function harness(){
 const state={desired:false,lifecycle:0,playing:new Set()},sockets=[],ui={};
 class Socket{static OPEN=1;constructor(){this.readyState=0;sockets.push(this)}send(){this.sent=true}close(){this.readyState=3;this.onclose?.()}}
 const c={state,ui,console,WebSocket:Socket,WS_BASE:'wss://test',CONNECT_TIMEOUT_MS:100,SETUP_TIMEOUT_MS:100,setTimeout,clearTimeout,encodeURIComponent,
 paired:()=>true,refreshActivation(){},clearReconnectTimers(){},clearTimers(){clearTimeout(state.connectTimer);clearTimeout(state.setupTimer)},resetAttention(){},clearPlayback(){},endUserActivity(){},setState(){},setBadge(){},primeAudio:async()=>{},navigator:{mediaDevices:{getUserMedia:async()=>({active:true,getTracks:()=>[]})}},requestToken:async()=>({token:'fake',model:'same'}),setupPayload:()=>({setup:{}}),attachPendingHandlers(){},stopCapture(){state.mediaStream?.getTracks().forEach(t=>t.stop());state.mediaStream=null},normalizeWsData:async x=>x,promotePending(){throw Error('stale promotion')},handleServerContent(){throw Error('stale content')},scheduleRecovery(){}};
 vm.createContext(c);for(const name of ['assertLive','ensureMic','startLive','startSession','stopLive','openPending','resumeSession','handleSocketMessage','failStart'])vm.runInContext(extract(name),c);
 return {c,state,sockets};
}
const frozen={"setupPayload": "ba759f196d6928a7b8af67e44816d3d7db5af6642c4e6324e957886d6579ccea", "startCapture": "a1f1dc33cdb514f23b89ebad4a707a7a257d110ff23be75d417a42ec10833696", "beginUserActivity": "5c07de9d084c4790a30b1085a23537536ed35b0a6c3969eea49b8e4183343706", "endUserActivity": "66a14072374c57afac1dda02221dd00112bf2652aff15677b98f5c67efc93077", "playPcm24k": "069c8e6da877aeae4c625859a2db1eec927bb48d0b611c9c3f24cbcf6ce729ee", "handleServerContent": "693c97d662a0306abb8861ca68a02d1c75e0d764070a21cebced6b0ed78bf1ec", "promotePending": "6480acef51674f1d346b9438a948509c62cec5e34fe6b43acec0d098e36012f1"};
for(const [name,hash] of Object.entries(frozen))assert.equal(require('node:crypto').createHash('sha256').update(extract(name)).digest('hex'),hash,'protected '+name);
(async()=>{
 // Stop during audio priming must never request a microphone later.
 {const {c}=harness(),prime=deferred();let mic=0;c.primeAudio=()=>prime.promise;c.navigator.mediaDevices.getUserMedia=()=>{mic++;};const start=c.startLive();const rejected=assert.rejects(start,{code:'LIVE_CANCELLED'});c.stopLive();prime.resolve();await rejected;assert.equal(mic,0);}
 // An older permission result cannot attach to a newer session; release its track.
 {const {c,state}=harness(),grant=deferred();let stopped=0;c.navigator.mediaDevices.getUserMedia=()=>grant.promise;const start=c.startLive(),rejected=assert.rejects(start,{code:'LIVE_CANCELLED'});await flush();c.stopLive();state.desired=true;state.lifecycle++;const current={active:true};state.mediaStream=current;grant.resolve({getTracks:()=>[{stop(){stopped++}}]});await rejected;assert.equal(stopped,1);assert.equal(state.mediaStream,current);}
 // Stop during token fetch must not create a WebSocket.
 {const {c,sockets}=harness(),token=deferred();c.requestToken=()=>token.promise;const start=c.startLive(),rejected=assert.rejects(start,{code:'LIVE_CANCELLED'});await flush();c.stopLive();token.resolve({token:'fake'});await rejected;assert.equal(sockets.length,0);}
 // Close while connecting settles the await even though stop clears its timer.
 {const {c,state,sockets}=harness();state.desired=true;const start=c.openPending({token:'fake'}),rejected=assert.rejects(start,{code:'LIVE_CANCELLED'});c.stopLive();await rejected;assert.equal(sockets[0].sent,undefined);}
 // A delayed packet from a retired socket cannot change resumption state.
 {const {c,state}=harness();state.desired=true;state.resumeHandle='current';state.activeWs={};await c.handleSocketMessage({},'active',JSON.stringify({sessionResumptionUpdate:{resumable:true,newHandle:'stale'}}));assert.equal(state.resumeHandle,'current');}
 // Duplicate starts don't create another capture/session.
 {const {c,state}=harness();state.desired=true;c.primeAudio=()=>{throw Error('duplicate')};await c.startLive();}
 // A live connection still sends its setup and remains owned by this session.
 {const {c,state,sockets}=harness();state.desired=true;const opening=c.openPending({token:'fake'});sockets[0].readyState=1;sockets[0].onopen();assert.equal(await opening,sockets[0]);assert(sockets[0].sent);c.stopLive();}
 // A retired connection close must not erase the next connection timer.
 {const {c,state,sockets}=harness();state.desired=true;const opening=c.openPending({token:'fake'}),rejected=assert.rejects(opening,{code:'LIVE_CANCELLED'});sockets[0].close=()=>{};c.stopLive();state.desired=true;state.lifecycle++;const nextTimer=setTimeout(()=>{},10000);state.connectTimer=nextTimer;sockets[0].onclose();await rejected;assert.equal(state.connectTimer,nextTimer);clearTimeout(nextTimer);}
 // A rejected old microphone request cannot make the new session fail.
 {const {c,state}=harness(),grant=deferred();c.navigator.mediaDevices.getUserMedia=()=>grant.promise;const starting=c.startLive();await flush();c.stopLive();state.desired=true;state.lifecycle++;const handled=starting.catch(error=>c.failStart(error));grant.reject(Error('old permission failed'));await handled;assert.equal(state.desired,true);}
 // Recovery failing after stop cannot touch a newer pending socket or its timer.
 {const {c,state}=harness(),token=deferred();state.desired=true;c.requestToken=()=>token.promise;const recovering=c.resumeSession(),rejected=assert.rejects(recovering,{code:'LIVE_CANCELLED'});c.stopLive();state.desired=true;state.lifecycle++;const current={close(){throw Error('closed newer socket')}};state.pendingWs=current;token.reject(Error('old request failed'));await rejected;assert.equal(state.pendingWs,current);}
 // Ownership is rechecked after asynchronous message decoding, not only at entry.
 {const {c,state}=harness(),decode=deferred(),old={};state.desired=true;state.activeWs=old;state.resumeHandle='current';c.normalizeWsData=()=>decode.promise;const message=c.handleSocketMessage(old,'active','fake');state.activeWs={};decode.resolve(JSON.stringify({sessionResumptionUpdate:{resumable:true,newHandle:'old'}}));await message;assert.equal(state.resumeHandle,'current');}
 // Current sockets still deliver exactly once and promote normally.
 {const {c,state}=harness(),ws={};state.desired=true;state.activeWs=ws;let delivered=0;c.handleServerContent=()=>delivered++;await c.handleSocketMessage(ws,'active',JSON.stringify({serverContent:{turnComplete:true},sessionResumptionUpdate:{resumable:true,newHandle:'new'}}));assert.equal(delivered,1);assert.equal(state.resumeHandle,'new');state.pendingWs=ws;let promotions=0;c.promotePending=socket=>{assert.equal(socket,ws);promotions++;};await c.handleSocketMessage({},'pending',JSON.stringify({setupComplete:{}}));assert.equal(promotions,0);await c.handleSocketMessage(ws,'pending',JSON.stringify({setupComplete:{}}));assert.equal(promotions,1);}
 console.log('PASS: cancellation during audio/mic/token/socket, stale packets, duplicate start and successful setup. No real mic/network.');
})().catch(error=>{console.error(error);process.exitCode=1});
