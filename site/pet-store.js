(() => {
  'use strict';
  const model=window.LokyStoreModel,DEVICE_KEY='loky_pc4_device_capability_v1';
  const $=selector=>dialog.querySelector(selector);
  const dialog=document.createElement('dialog');dialog.id='lokyStore';dialog.setAttribute('aria-labelledby','ptsTitle');
  let wallet=null,identity=null,category='food',selected='snack',view='shop',intent=null,busy=false,entry=null,opener=null,epoch=0;
  let prop=null,propTimer=0,noticeTimer=0,afterClose=null,detailMode=null,viewTrail=[];
  const descriptions={snack:'Un detalle para LOKY. Al ofrecerlo, inclina la cabeza y se consume una galleta.',ball:'Una pelota azul para su habitación. Tócala para jugar y pedirle la patita.','ball-coral':'La misma diversión, en coral. Puedes guardarla y volver a usarla.',outfit:'Las prendas aún no están adaptadas a esta mascota. No están a la venta.'};
  const paw='<path d="M36 65c-9-15 6-33 14-33s23 18 14 33c-4 8-10 0-14 0s-10 8-14 0Z"/><ellipse cx="28" cy="30" rx="7" ry="10" transform="rotate(-25 28 30)"/><ellipse cx="43" cy="19" rx="7" ry="10"/><ellipse cx="59" cy="19" rx="7" ry="10"/><ellipse cx="74" cy="30" rx="7" ry="10" transform="rotate(25 74 30)"/>';
  function art(id){
    const asset={food:'food-bowl',snack:'food-bowl',toys:'ball-blue',ball:'ball-blue','ball-coral':'ball-coral'}[id];
    if(asset)return '<img src="./store-assets/'+asset+'.webp" alt="" decoding="async" draggable="false">';
    const fill=id==='ball-coral'?'#f18d87':'#308cdb';
    const shapes=id==='food'||id==='snack'?'<ellipse cx="100" cy="144" rx="70" ry="11" fill="#0005"/><path d="M44 91h112l15 49q-71 22-142 0Z" fill="url(#ceramic)" stroke="#b5c9d8" stroke-width="2"/><ellipse cx="100" cy="93" rx="56" ry="15" fill="#422613"/><g fill="#b87a36" stroke="#e5b879" stroke-width="2"><circle cx="65" cy="88" r="9"/><circle cx="85" cy="82" r="10"/><circle cx="105" cy="85" r="10"/><circle cx="126" cy="82" r="9"/><circle cx="141" cy="90" r="8"/><circle cx="76" cy="99" r="9"/><circle cx="97" cy="97" r="9"/><circle cx="119" cy="99" r="10"/></g><path d="M33 133q68 24 134 0l4 8q-71 22-142 0Z" fill="#2871ae"/><g transform="translate(81 107) scale(.38)" fill="#226194">'+paw+'</g>':id==='clothes'||id==='outfit'?'<ellipse cx="100" cy="155" rx="59" ry="9" fill="#0005"/><path d="m68 48-21 7-27 51 23 15 16-27-3 63h88l-3-63 16 27 23-15-27-51-21-7Z" fill="url(#blue)" stroke="#70ace3" stroke-width="2"/><path d="M68 48q0-37 32-37t32 37l-32 21Z" fill="#347dc0" stroke="#85bfff" stroke-width="2"/><path d="M77 43q1-23 23-23t23 23L100 56Z" fill="#0a2d58"/><path d="M86 57v41m28-41v41" stroke="#d6e9ed" stroke-width="3"/><g transform="translate(76 98) scale(.48)" fill="#c3e8ff">'+paw+'</g>':'<ellipse cx="100" cy="157" rx="57" ry="10" fill="#0005"/><circle cx="100" cy="90" r="65" fill="url(#ball)" stroke="#a9c9e7" stroke-width="2"/><path d="M60 39q-21 55 38 111M133 34q-37 56 21 96" fill="none" stroke="#f2eee2" stroke-width="13"/><g transform="translate(74 66) scale(.55)" fill="#f5f4ed">'+paw+'</g>';
    const svg='<svg viewBox="0 0 200 180" aria-hidden="true"><defs><linearGradient id="ceramic" x2="0" y2="1"><stop stop-color="#fff7e4"/><stop offset=".65" stop-color="#e9d9ba"/><stop offset="1" stop-color="#7c8c9e"/></linearGradient><linearGradient id="blue" x2=".8" y2="1"><stop stop-color="#479fe9"/><stop offset="1" stop-color="#134273"/></linearGradient><radialGradient id="ball" cx=".3" cy=".25" r=".8"><stop stop-color="#9acefc"/><stop offset=".5" stop-color="'+fill+'"/><stop offset="1" stop-color="#102d58"/></radialGradient></defs>'+shapes+'</svg>';
    return svg.replaceAll('id="','id="'+id+'-').replaceAll('url(#','url(#'+id+'-');
  }
  function button(label,action,extra=''){return '<button type="button" data-action="'+action+'" '+extra+'>'+label+'</button>';}
  dialog.innerHTML='<div class="pts-room" aria-hidden="true"><i></i><i></i><span><svg viewBox="0 0 100 90" aria-hidden="true">'+paw+'</svg><br>LOKY</span></div><header class="pts-header">'+button('← Atrás','back','class="pts-back" aria-label="Atrás"')+'<h2 id="ptsTitle"><span class="pts-paw"><svg viewBox="0 0 100 90" aria-hidden="true">'+paw+'</svg></span><b>LOKY</b> <small>PTS STORE</small></h2><span class="pts-balance"></span>'+button('×','close','aria-label="Cerrar tienda"')+'</header><p class="pts-test">PRUEBA LOCAL · PTS virtuales de prueba</p><nav class="pts-tabs" aria-label="Categorías de tienda"></nav><div class="pts-body"></div><p class="pts-message" role="status" aria-live="polite"></p><footer class="pts-footer">'+button('♧ &nbsp; Mi clóset','closet')+button('▣ &nbsp; Inventario','inventory')+'</footer>';
  document.body.append(dialog);
  const toast=document.createElement('p');toast.className='pts-toast';toast.setAttribute('role','status');document.body.append(toast);toast.hidden=true;
  function notify(text){toast.textContent=text;toast.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>toast.hidden=true,4500);}
  function clearProp(){clearTimeout(propTimer);prop?.remove();prop=null;}
  function showBall(itemId){
    clearProp();prop=document.createElement('button');prop.type='button';prop.className='pts-pet-prop pts-pet-ball';prop.setAttribute('aria-label','Jugar con la pelota');prop.innerHTML=art(itemId);
    prop.onclick=async()=>{if(prop?.classList.contains('pts-bounce'))return;const ball=prop;ball.classList.add('pts-bounce');await window.LokyMobilePet.act('patita');setTimeout(()=>ball.classList.remove('pts-bounce'),650);};
    document.querySelector('.pet-stage').append(prop);
  }
  const effects={
    'offer-snack':async()=>{const result=await window.LokyMobilePet.act('inclinar');if(!result.executed)return result;clearProp();prop=document.createElement('span');prop.className='pts-pet-prop pts-pet-snack';prop.innerHTML=art('snack');document.querySelector('.pet-stage').append(prop);propTimer=setTimeout(()=>{clearProp();restoreEquipped();},3200);return result;},
    'play-ball':async({itemId,remove})=>{if(remove)clearProp();else showBall(itemId);return {executed:true};}
  };
  function restoreEquipped(){try{const item=wallet?.snapshot().equipped;if(item)showBall(item);}catch{/* Opening the store will present storage failures. */}}
  async function connect(){
    const current=localStorage.getItem(DEVICE_KEY)||'';
    if(wallet&&identity===current)return;
    clearProp();wallet=await model.open({identity:current,storage:localStorage,locks:navigator.locks,crypto:window.crypto,effects});identity=current;restoreEquipped();
  }
  function message(text){$('.pts-message').textContent=text;}
  function fail(error){const messages={STORE_INSUFFICIENT_BALANCE:'No quedan suficientes PTS de prueba.',STORE_SAVE_FAILED:'No se pudo guardar. No se ha descontado el saldo. Puedes reintentar.',STORE_DATA_INVALID:'Los datos de prueba no se pueden leer. No se han borrado ni reiniciado.',STORE_STORAGE_UNAVAILABLE:'El navegador no permite guardar el inventario.',STORE_LOCK_UNAVAILABLE:'Este navegador no permite compras seguras entre pestañas.',STORE_USE_FAILED:'No se pudo usar el artículo. Sigue en tu inventario.',STORE_ALREADY_OWNED:'Ya tienes este artículo.',STORE_NOT_OWNED:'No tienes unidades disponibles.',STORE_ALREADY_EQUIPPED:'Esta pelota ya está en la habitación.',STORE_ITEM_UNAVAILABLE:'Este artículo todavía no está disponible.'};message(messages[error.code]||'No se pudo completar la acción. Vuelve a abrir la tienda.');}
  function cancelIntent(){if(intent)wallet?.cancel(intent);intent=null;}
  function render(){
    detailMode=null;
    const state=wallet.snapshot(),items=wallet.catalogue();$('.pts-balance').textContent='◉ '+state.balance+' PTS';
    $('.pts-tabs').innerHTML=[['food','Comida'],['clothes','Ropa'],['toys','Juguetes']].map(([id,label])=>button(art(id)+'<span>'+label+'</span>','category','data-category="'+id+'" aria-pressed="'+(view==='shop'&&category===id)+'"')).join('');
    const body=$('.pts-body');message('');
    if(view==='inventory'||view==='closet'){
      const owned=items.filter(i=>state.inventory[i.id]>0&&(view!=='closet'||i.category==='clothes'));
      body.innerHTML='<section class="pts-inventory"><div class="pts-subheading"><h3>'+(view==='closet'?'Mi clóset':'Inventario')+'</h3>'+button('← Tienda','shop')+'</div>'+(owned.length?owned.map(i=>'<article>'+art(i.id)+'<div><strong>'+i.name+'</strong><small>'+((state.equipped===i.id)?'En la habitación':'Cantidad: '+state.inventory[i.id])+'</small></div>'+button(state.equipped===i.id?'Guardar':'Usar',state.equipped===i.id?'unequip':'use','data-id="'+i.id+'"')+'</article>').join(''):'<div class="pts-empty">'+art(view==='closet'?'outfit':'ball')+'<p>'+(view==='closet'?'Tu clóset está esperando prendas compatibles. Por ahora, la ropa no se vende.':'Aún no tienes artículos. Encuentra algo para LOKY en la tienda.')+'</p></div>')+'</section>';return;
    }
    const visible=items.filter(i=>i.category===category);if(!visible.some(i=>i.id===selected))selected=visible[0].id;
    body.innerHTML='<section class="pts-showcase"><div class="pts-shelf" tabindex="0" aria-label="Artículos: desliza horizontalmente">'+visible.map(i=>'<button type="button" class="pts-product" data-action="select" data-id="'+i.id+'" aria-label="Ver '+i.name+'">'+art(i.id)+'<span>'+i.name+'</span></button>').join('')+'</div><div class="pts-carousel-controls">'+button('❮','previous','aria-label="Artículo anterior"')+'<div class="pts-dots">'+visible.map(i=>'<span data-id="'+i.id+'"></span>').join('')+'</div>'+button('❯','next','aria-label="Artículo siguiente"')+'</div><span class="pts-swipe">Desliza la mesa</span></section><section class="pts-detail"></section>';
    const shelf=$('.pts-shelf');let timer;shelf.onscroll=()=>{clearTimeout(timer);timer=setTimeout(()=>{const children=[...shelf.children],center=shelf.scrollLeft+shelf.clientWidth/2;const nearest=children.reduce((a,b)=>Math.abs(b.offsetLeft+b.offsetWidth/2-center)<Math.abs(a.offsetLeft+a.offsetWidth/2-center)?b:a);if(nearest&&selected!==nearest.dataset.id){cancelIntent();selected=nearest.dataset.id;renderDetail();}},90);};
    renderDetail();requestAnimationFrame(()=>scrollSelected(false));
  }
  function scrollSelected(smooth=true){const shelf=$('.pts-shelf'),item=shelf?.querySelector('[data-id="'+selected+'"]');if(item)shelf.scrollTo({left:item.offsetLeft-(shelf.clientWidth-item.offsetWidth)/2,behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'});}
  function renderDetail(){
    detailMode=null;
    const item=wallet.catalogue().find(i=>i.id===selected),detail=$('.pts-detail');if(!detail)return;
    const owned=item.owned>0&&item.kind==='durable';
    detail.innerHTML='<div class="pts-detail-title"><h3>'+item.name+'</h3><span>'+(item.available?'◉ '+item.price+' PTS':'NO DISPONIBLE')+'</span></div><p>'+descriptions[item.id]+'</p><div class="pts-detail-actions">'+button('◉ &nbsp; Vista previa','preview')+button(owned?'En inventario':'🛒 &nbsp; Comprar',owned?'inventory':'buy',!item.available?'disabled':'')+'</div>';
    for(const dot of dialog.querySelectorAll('.pts-dots span'))dot.classList.toggle('active',dot.dataset.id===selected);
  }
  function close(fromBack=false,returnBack=false){
    if(busy)return;epoch++;cancelIntent();dialog.close();opener?.focus();
    if(!fromBack&&entry&&history.state?.lokyStoreEntry===entry)history.back();entry=null;const callback=afterClose;afterClose=null;callback?.(returnBack);
  }
  function back(){if(busy)return;if(intent||detailMode){cancelIntent();renderDetail();return;}if(viewTrail.length){view=viewTrail.pop();render();return;}close(false,true);}
  async function open(options={}){
    if(dialog.open)return;opener=document.activeElement;view=options.view==='inventory'?'inventory':'shop';category='food';selected='snack';viewTrail=[];afterClose=options.onClose||null;cancelIntent();
    dialog.showModal();$('.pts-body').innerHTML='<p class="pts-loading">Abriendo tu tienda de prueba…</p>';
    const run=++epoch;
    try{await connect();if(run!==epoch)return;render();entry=crypto.randomUUID();history.pushState({...history.state,lokyStoreEntry:entry},'');}catch(error){fail(error);}
  }
  async function transact(operation,id){
    if(busy)return;busy=true;dialog.setAttribute('aria-busy','true');
    try{const token=intent||wallet.prepare(operation,id);await wallet.commit(token);intent=null;if(operation==='buy'){if(view!=='inventory')viewTrail.push(view);view='inventory';render();message('Compra guardada con PTS de prueba.');}else{busy=false;close();notify(operation==='unequip'?'Pelota guardada.':id==='snack'?'Galleta ofrecida.':'Pelota en la habitación: tócala para jugar.');}}
    catch(error){clearProp();restoreEquipped();fail(error);}finally{busy=false;dialog.removeAttribute('aria-busy');}
  }
  dialog.addEventListener('click',event=>{
    const b=event.target.closest('button[data-action]');if(!b||busy)return;const action=b.dataset.action;
    try{
      if(action==='close'){close();return;}
      if(action==='back'){back();return;}
      if(!wallet)return;
      if(action==='confirm'){transact('buy',selected);return;}
      cancelIntent();
      if(action==='category'){category=b.dataset.category;view='shop';render();}
      else if(['inventory','closet','shop'].includes(action)){if(action!==view)viewTrail.push(view);view=action;render();}
      else if(action==='select'){selected=b.dataset.id;renderDetail();scrollSelected();}
      else if(action==='next'||action==='previous'){const items=wallet.catalogue().filter(i=>i.category===category),index=items.findIndex(i=>i.id===selected);selected=items[Math.max(0,Math.min(items.length-1,index+(action==='next'?1:-1)))].id;renderDetail();scrollSelected();}
      else if(action==='buy'){intent=wallet.prepare('buy',selected);const item=wallet.catalogue().find(i=>i.id===selected);$('.pts-detail').innerHTML='<h3>¿Comprar '+item.name+'?</h3><p>Se descontarán '+item.price+' PTS de prueba. No hay dinero real.</p><div class="pts-detail-actions">'+button('Cancelar','cancel')+button('Confirmar compra','confirm')+'</div>';$('.pts-detail [data-action="confirm"]').focus();}
      else if(action==='cancel')renderDetail();
      else if(action==='preview'){detailMode='preview';$('.pts-detail').innerHTML='<div class="pts-preview">'+art(selected)+'<p>'+descriptions[selected]+'</p></div>'+button('Volver al artículo','cancel');}
      else if(action==='use'||action==='unequip')transact(action,b.dataset.id);
    }catch(error){fail(error);}
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(intent){cancelIntent();renderDetail();}else back();});
  window.addEventListener('popstate',()=>{if(dialog.open&&entry&&history.state?.lokyStoreEntry!==entry){if(busy){entry=null;return;}close(true,true);}});
  window.addEventListener('storage',event=>{if(event.key===DEVICE_KEY){epoch++;cancelIntent();wallet=null;identity=null;clearProp();if(dialog.open){dialog.close();notify('El perfil cambió. Abre la tienda de nuevo.');}}else if(event.key?.startsWith('loky_mobile_store_test_v1:')&&dialog.open&&!busy){try{cancelIntent();render();}catch(error){fail(error);}}});
  window.LokyStore=Object.freeze({open});
  // Restore an already-owned toy locally; no microphone, network or extra animation loop.
  connect().catch(()=>{});
})();
