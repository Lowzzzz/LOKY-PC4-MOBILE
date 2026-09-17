(() => {
  'use strict';

  const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent)||
    (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(!isIOS||!navigator.mediaDevices?.getUserMedia)return;

  const media=navigator.mediaDevices;
  const originalGetUserMedia=media.getUserMedia.bind(media);
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function setSession(type){
    try{
      if(navigator.audioSession&&'type' in navigator.audioSession){
        navigator.audioSession.type=type;
      }
    }catch{}
  }

  async function refreshWebAudioAfterMic(){
    const ctx=window.LOKY_PC4_LIVE?.state?.audioContext;
    if(!ctx||ctx.state==='closed')return;
    try{
      if(ctx.state==='running')await ctx.suspend();
    }catch{}
    await wait(70);
    try{await ctx.resume()}catch{}
    await wait(40);
    try{
      if(ctx.state!=='running')await ctx.resume();
    }catch{}
  }

  media.getUserMedia=async function(constraints){
    const wantsAudio=Boolean(constraints?.audio);
    if(!wantsAudio)return originalGetUserMedia(constraints);

    // Lock iOS into a simultaneous capture/playback session before Safari
    // changes its audio category on microphone activation.
    setSession('play-and-record');

    const stream=await originalGetUserMedia(constraints);

    // WebKit can change system output gain/routing when mic capture begins.
    // Re-suspending/resuming the already-created WebAudio context after the
    // capture transition rebinds playback to the active audio session.
    setSession('play-and-record');
    await refreshWebAudioAfterMic();
    return stream;
  };

  const talk=document.getElementById('talkButton');
  talk?.addEventListener('click',()=>{
    if(talk.dataset.active==='1'){
      setTimeout(()=>setSession('auto'),120);
    }
  },true);

  addEventListener('pagehide',()=>setSession('auto'));

  window.LOKY_IOS_AUDIO_STABILITY={version:'0.3.2',active:true};
})();
