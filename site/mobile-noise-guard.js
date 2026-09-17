(() => {
  'use strict';

  const VERSION='0.3.2R4F2R1-voice-noise-guard';
  const CHECK_INTERVAL_MS=420;
  const CONFIRM_SCORE=2;
  const MAX_SCORE=4;
  const IDLE_ANALYZE_RMS=0.0065;
  const PLAYBACK_ANALYZE_RMS=0.014;
  const PITCH_CORR_MIN=0.18;
  const ZCR_MIN=0.006;
  const ZCR_MAX=0.36;
  const CREST_MAX=8.0;

  const live=window.LOKY_PC4_LIVE;
  const state=live?.state||null;
  if(!state)return;

  let voiceScore=0;
  let wrappedProcessor=null;
  let intervalId=0;

  const stats={
    analysedFrames:0,
    quietFrames:0,
    voiceLikeFrames:0,
    rejectedNoiseFrames:0,
    confirmedVoiceFrames:0,
    processorsWrapped:0,
  };

  function resetVoiceScore(){
    voiceScore=0;
  }

  function rmsLevel(input){
    if(!input?.length)return 0;
    let sum=0;
    for(let i=0;i<input.length;i++)sum+=input[i]*input[i];
    return Math.sqrt(sum/input.length);
  }

  function downsampleForAnalysis(input,inputRate){
    const rate=Number(inputRate)||48000;
    const stride=Math.max(1,Math.round(rate/8000));
    const length=Math.max(1,Math.floor(input.length/stride));
    const out=new Float32Array(length);
    let mean=0;
    for(let i=0;i<length;i++){
      const value=input[Math.min(input.length-1,i*stride)]||0;
      out[i]=value;
      mean+=value;
    }
    mean/=length;
    for(let i=0;i<length;i++)out[i]-=mean;
    return {samples:out,rate:rate/stride};
  }

  function voiceMetrics(input,inputRate){
    const {samples,rate}=downsampleForAnalysis(input,inputRate);
    const n=samples.length;
    if(n<64)return {zcr:1,crest:99,pitchCorr:0};

    let energy=0;
    let peak=0;
    let crossings=0;
    let previous=samples[0];
    for(let i=0;i<n;i++){
      const value=samples[i];
      energy+=value*value;
      const abs=Math.abs(value);
      if(abs>peak)peak=abs;
      if(i>0&&((value>=0&&previous<0)||(value<0&&previous>=0)))crossings++;
      previous=value;
    }
    const rms=Math.sqrt(energy/n)||1e-9;
    const zcr=crossings/Math.max(1,n-1);
    const crest=peak/rms;

    const minLag=Math.max(2,Math.floor(rate/350));
    const maxLag=Math.min(Math.floor(rate/70),Math.floor(n*.45));
    let best=0;
    for(let lag=minLag;lag<=maxLag;lag+=2){
      let num=0;
      let left=0;
      let right=0;
      for(let i=lag;i<n;i+=2){
        const a=samples[i];
        const b=samples[i-lag];
        num+=a*b;
        left+=a*a;
        right+=b*b;
      }
      const den=Math.sqrt(left*right);
      if(den>1e-9){
        const corr=num/den;
        if(corr>best)best=corr;
      }
    }
    return {zcr,crest,pitchCorr:best};
  }

  function inspectFrame(input,inputRate=48000,playbackActive=false){
    stats.analysedFrames++;
    const rms=rmsLevel(input);
    const noiseFloor=Math.max(0.001,Number(state.noiseFloor)||0.005);
    const leakFloor=Math.max(0.001,Number(state.playbackLeakFloor)||0.012);
    const analyseThreshold=playbackActive
      ? Math.max(PLAYBACK_ANALYZE_RMS,leakFloor*1.18,noiseFloor*2.8)
      : Math.max(IDLE_ANALYZE_RMS,noiseFloor*1.45);

    if(rms<analyseThreshold){
      voiceScore=Math.max(0,voiceScore-1);
      stats.quietFrames++;
      return {confirmed:false,voiceLike:false,rms,zcr:0,crest:0,pitchCorr:0,score:voiceScore};
    }

    const metrics=voiceMetrics(input,inputRate);
    const voiceLike=
      metrics.pitchCorr>=PITCH_CORR_MIN&&
      metrics.zcr>=ZCR_MIN&&
      metrics.zcr<=ZCR_MAX&&
      metrics.crest<=CREST_MAX;

    if(voiceLike){
      voiceScore=Math.min(MAX_SCORE,voiceScore+1);
      stats.voiceLikeFrames++;
    }else{
      voiceScore=Math.max(0,voiceScore-1);
      stats.rejectedNoiseFrames++;
    }

    const confirmed=voiceScore>=CONFIRM_SCORE;
    if(confirmed)stats.confirmedVoiceFrames++;
    return {confirmed,voiceLike,rms,...metrics,score:voiceScore};
  }

  function wrapProcessor(node){
    if(!node||node===wrappedProcessor||node.__lokyVoiceNoiseGuard)return false;
    const original=node.onaudioprocess;
    if(typeof original!=='function')return false;

    node.__lokyVoiceNoiseGuard=true;
    node.__lokyOriginalAudioProcess=original;
    node.onaudioprocess=function(event){
      if(
        state.userSpeaking===true||
        !state.desired||
        !state.setupReady||
        !event?.inputBuffer?.getChannelData
      ){
        if(state.userSpeaking===true)resetVoiceScore();
        return original.call(this,event);
      }

      const input=event.inputBuffer.getChannelData(0);
      const inputRate=Number(event.inputBuffer.sampleRate)||Number(state.audioContext?.sampleRate)||48000;
      const playbackActive=(state.playing?.size||0)>0;
      const decision=inspectFrame(input,inputRate,playbackActive);

      if(!decision.confirmed){
        // Keep the frozen R4 detector from accumulating non-speech energy.
        // The original callback still runs so noise/leak floors and pre-roll stay healthy.
        state.startFrames=0;
      }else{
        // Preserve R4's original start cadence: 3 frames idle / 2 during barge-in.
        // We only restore one validated frame of confidence; R4 still owns activityStart.
        state.startFrames=Math.max(Number(state.startFrames)||0,1);
      }

      const wasSpeaking=state.userSpeaking===true;
      const result=original.call(this,event);

      if(!decision.confirmed&&!wasSpeaking&&state.userSpeaking!==true){
        state.startFrames=0;
      }
      if(!wasSpeaking&&state.userSpeaking===true)resetVoiceScore();
      return result;
    };

    wrappedProcessor=node;
    stats.processorsWrapped++;
    resetVoiceScore();
    return true;
  }

  function attachCurrentProcessor(){
    const node=state.micProcessor;
    if(!node||node===wrappedProcessor)return false;
    return wrapProcessor(node);
  }

  function scheduleAttach(){
    for(const delay of [0,40,120,260]){
      setTimeout(attachCurrentProcessor,delay);
    }
  }

  document.getElementById('talkButton')?.addEventListener('click',scheduleAttach,true);
  document.getElementById('conversationState')&&new MutationObserver(scheduleAttach)
    .observe(document.getElementById('conversationState'),{childList:true,subtree:true,characterData:true});

  scheduleAttach();
  intervalId=setInterval(()=>{
    if(state.desired&&state.micProcessor)attachCurrentProcessor();
  },CHECK_INTERVAL_MS);

  addEventListener('pagehide',()=>{
    if(intervalId)clearInterval(intervalId);
    intervalId=0;
  },{once:true});

  window.LOKY_PC4_NOISE_GUARD={
    version:VERSION,
    inspectFrame,
    attach:attachCurrentProcessor,
    reset:resetVoiceScore,
    stats,
    get processorWrapped(){return Boolean(wrappedProcessor)},
  };
})();
