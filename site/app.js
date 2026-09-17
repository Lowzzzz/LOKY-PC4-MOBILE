(() => {
  'use strict';
  const BUILD='0.3.0';
  const status=document.getElementById('status');
  const fallback=document.getElementById('fallback');
  const updateButton=document.getElementById('updateButton');
  const buildLabel=document.getElementById('buildLabel');
  const infoButton=document.getElementById('infoButton');
  const statusSheet=document.getElementById('statusSheet');
  const closeSheet=document.getElementById('closeSheet');
  const sheetBackdrop=document.getElementById('sheetBackdrop');

  buildLabel.textContent=`iOS ${BUILD} · GEMINI LIVE NATIVE`;

  let sphere=null;
  try{
    sphere=new window.LokyMobileSphere.MobileSphere(document.getElementById('lokySphere'));
    sphere.init();
    sphere.start();
    status.textContent='SPHERE · 15K';
  }catch(error){
    console.error(error);
    status.textContent='VISUAL FALLBACK';
    fallback.classList.remove('hidden');
  }

  addEventListener('loky:sphere-quality',event=>{
    const count=event.detail?.count||0;
    if(count)status.textContent=`SPHERE · ${Math.round(count/1000)}K ADAPTIVE`;
  });

  function setSheet(open){
    statusSheet.classList.toggle('hidden',!open);
    sheetBackdrop.classList.toggle('hidden',!open);
    infoButton.setAttribute('aria-expanded',String(open));
  }
  infoButton.addEventListener('click',()=>setSheet(infoButton.getAttribute('aria-expanded')!=='true'));
  closeSheet.addEventListener('click',()=>setSheet(false));
  sheetBackdrop.addEventListener('click',()=>setSheet(false));

  window.LOKY_PC4_MOBILE={
    build:BUILD,
    platform:'ios-pwa',
    phase:'gemini-live-native',
    sphereStats:()=>sphere?.stats?.()||null
  };

  async function registerSW(){
    if(!('serviceWorker' in navigator))return;
    try{
      const reg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      reg.update().catch(()=>{});
      document.addEventListener('visibilitychange',()=>{
        if(!document.hidden)reg.update().catch(()=>{});
      });
    }catch(error){console.warn('SW',error)}
  }

  async function checkUpdate(){
    try{
      const r=await fetch(`./version.json?t=${Date.now()}`,{cache:'no-store'});
      if(!r.ok)return;
      const data=await r.json();
      const latest=String(data.version||'');
      if(latest && latest!==BUILD){
        updateButton.classList.remove('hidden');
        updateButton.textContent=`ACTUALIZAR ${latest}`;
      }
    }catch{}
  }

  updateButton.addEventListener('click',async()=>{
    updateButton.disabled=true;
    updateButton.textContent='ACTUALIZANDO…';
    try{
      const regs=await navigator.serviceWorker?.getRegistrations?.();
      for(const reg of regs||[])await reg.update().catch(()=>{});
    }finally{location.reload()}
  });

  registerSW();
  checkUpdate();
  setTimeout(checkUpdate,1800);
  setInterval(checkUpdate,30*60*1000);
})();
