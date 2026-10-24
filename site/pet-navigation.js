/* Presentation/navigation adapter only: original feature controls keep their handlers. */
(() => {
  'use strict';
  const pet=window.LokyMobilePet,features=window.LOKY_PC4_FEATURES;
  const menu=document.getElementById('petMenu'),content=document.getElementById('petMenuContent');
  const menuButton=document.getElementById('petMenuButton'),title=document.getElementById('petMenuTitle');
  const oldHeader=menu.querySelector('header');
  let trail=[],current='home',switching=0,nativePage=null,languagePage=null;
  const names={home:'Tu espacio',actions:'Mascota',care:'Cuidados',tools:'Funciones',settings:'Configuración',voice:'Voz y audio',memory:'Memoria y agenda',alarms:'Alarmas',language:'Idioma',appearance:'Apariencia'};
  // Lightweight line icons, no generated assets or GPU renderer.
  const symbols={
    actions:'<path d="M24 28 13 19 7 39l15 11m36-22 11-9 6 20-15 11"/><rect x="20" y="22" width="42" height="42" rx="16"/><rect x="27" y="36" width="28" height="19" rx="7"/><path d="M33 43v3m16-3v3m-12 4q4 3 8 0"/>',
    care:'<path d="M41 66 15 41C-1 23 22 9 41 28 60 9 83 23 67 41Z"/><path d="m23 42 10 0 6-10 7 20 6-10h9"/>',
    store:'<path d="M19 28h44l5 41H14Z"/><path d="M29 31v-8a12 12 0 0 1 24 0v8"/><path d="M32 54q9-17 18 0c2 7-5 5-9 4s-11 3-9-4Z"/><circle cx="30" cy="44" r="3"/><circle cx="39" cy="39" r="3"/><circle cx="49" cy="40" r="3"/><circle cx="55" cy="46" r="3"/>',
    tools:'<rect x="13" y="13" width="23" height="23" rx="5"/><rect x="46" y="13" width="23" height="23" rx="5"/><rect x="13" y="46" width="23" height="23" rx="5"/><rect x="46" y="46" width="23" height="23" rx="5"/>',
    settings:'<path d="m34 10 14 0 3 10 8 4 10-2 7 12-7 8v9l7 8-7 12-10-2-8 4-3 10H34l-3-10-8-4-10 2-7-12 7-8v-9l-7-8 7-12 10 2 8-4Z" transform="translate(5 0) scale(.88)"/><circle cx="41" cy="41" r="12"/>',
    inventory:'<path d="M21 30q0-15 20-15t20 15v39H21Z"/><path d="M31 17v-5h20v5M18 36h-6v24h9m43-24h6v24h-9"/><rect x="28" y="43" width="26" height="19" rx="6"/><path d="M28 34h26"/>',
    voice:'<rect x="31" y="10" width="20" height="39" rx="10"/><path d="M21 35v8a20 20 0 0 0 40 0v-8M41 63v10m-12 0h24"/>',
    language:'<path d="M10 16h42v34H27L13 61V50h-3ZM57 29h14v34H56l-8 8v-16"/><path d="M19 27h25M32 20v7m-10 5q7 12 20 14m-2-19q-5 15-19 19"/>',
    memory:'<path d="M14 13h22q8 0 8 8v51q-5-8-15-8H14Zm54 0H50q-6 0-6 8v51q5-8 15-8h9Z"/><path d="M22 27h12m-12 11h12m17-11h9m-9 11h9"/>',
    alarms:'<circle cx="41" cy="43" r="24"/><path d="M41 28v16l12 7M12 20l14-10m30 0 14 10M20 65l-6 9m48-9 6 9"/>',
    seismic:'<circle cx="41" cy="41" r="29"/><path d="M12 42h15l7-15 10 30 8-16h18M41 12q-18 29 0 58m0-58q18 29 0 58"/>',
    appearance:'<path d="M15 19h52v43H15Z"/><path d="m19 56 16-19 12 10 9-11 7 20"/><circle cx="53" cy="28" r="5"/>'
  };
  symbols.actions='<path d="M29 64c-8-11 5-29 12-29s20 18 12 29c-4 6-8 0-12 0s-8 6-12 0Z"/><ellipse cx="18" cy="31" rx="6" ry="9"/><ellipse cx="33" cy="19" rx="6" ry="9"/><ellipse cx="49" cy="19" rx="6" ry="9"/><ellipse cx="64" cy="31" rx="6" ry="9"/>';
  symbols.voice='<path d="M11 31h16l20-17v54L27 51H11ZM58 28q15 13 0 26m8-36q25 23 0 46"/>';
  symbols.language='<circle cx="41" cy="41" r="28"/><ellipse cx="41" cy="41" rx="13" ry="28"/><path d="M14 41h54M19 25h44M19 57h44"/>';
  symbols.notifications='<path d="M19 59h44l-6-10V33a16 16 0 0 0-32 0v16ZM34 68q7 8 14 0M41 11v6"/>';
  symbols.seismic='<path d="M6 43h17l9-22 14 42 10-30 8 10h12"/>';
  function icon(key){return '<svg viewBox="0 0 82 82" aria-hidden="true" class="nav-icon">'+(symbols[key]||symbols.settings)+'</svg>';}
  function button(label,fn,cls=''){const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.onclick=fn;return b;}
  const backButton=button('← Atrás',back,'nav-back');backButton.setAttribute('aria-label','Atrás');
  oldHeader.prepend(backButton);oldHeader.classList.add('nav-header');
  const brand=document.createElement('div');brand.className='nav-brand';brand.innerHTML='<svg viewBox="0 0 100 90" class="nav-icon" aria-hidden="true"><path d="M36 65c-9-15 6-33 14-33s23 18 14 33c-4 8-10 0-14 0s-10 8-14 0Z"/><ellipse cx="28" cy="30" rx="7" ry="10"/><ellipse cx="43" cy="19" rx="7" ry="10"/><ellipse cx="59" cy="19" rx="7" ry="10"/><ellipse cx="74" cy="30" rx="7" ry="10"/></svg>'+'<span><b>LOKY</b><small>Mobile</small></span>';oldHeader.prepend(brand);
  oldHeader.querySelector('.eyebrow').hidden=true;
  const titleWrap=document.createElement('div');titleWrap.className='nav-title';title.before(titleWrap);titleWrap.append(title);
  document.getElementById('petMenuClose').onclick=dismiss;
  menu.classList.add('nav-frame');
  function cleanupNative(){features.windows.close(true);nativePage=null;document.getElementById('app').inert=false;}
  function suspendMenu(){if(menu.open){switching++;menu.close();}}
  function dismiss(){trail=[];current='home';cleanupNative();suspendMenu();menuButton.setAttribute('aria-expanded','false');menuButton.focus();}
  function back(){
    if(nativePage){
      const modal=nativePage.querySelector('.loky-settings-modal');
      if(modal){const close=[...modal.querySelectorAll('button')].find(b=>/CERRAR|CANCELAR/.test(b.textContent));if(close){close.click();return;}}
      const inner=nativePage.querySelector('.loky-planner-back,.loky-device-back');if(inner){inner.click();if(!['alarms','notifications'].includes(current))return;}
    }
    const previous=trail.pop();if(previous)show(previous);else dismiss();
  }
  function open(route='home'){
    if(route==='home'){trail=[];show('home');return;}
    if(current!==route)trail.push(current);
    show(route);
  }
  function card(label,key,fn,row=false){const b=button('',fn,row?'nav-row':'nav-card');b.innerHTML=icon(key)+'<span>'+label+'</span>'+(row?'<b class="nav-chevron">›</b>':'');return b;}
  function native(kind){
    suspendMenu();
    if(kind==='voice')features.windows.openSettings();
    else if(kind==='alarms'||kind==='notifications')window.LOKY_PC4_PLANNER.open('alarm');
    else document.querySelector('.feature-memory').click();
    nativePage=features.windows.active;if(!nativePage)return;
    nativePage.classList.add('nav-frame','nav-native');document.getElementById('app').inert=true;
    const header=nativePage.querySelector('.loky-feature-header');header.className='loky-feature-header nav-native-header';
    const oldBack=header.querySelector('.loky-window-back');oldBack.textContent='← Atrás';oldBack.setAttribute('aria-label','Atrás');oldBack.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();back();},true);
    header.querySelector('.loky-window-brand-copy strong').textContent=kind==='notifications'?'Notificaciones':names[kind];
    const x=button('×',dismiss,'nav-close');x.setAttribute('aria-label','Cerrar ventana');header.append(x);oldBack.focus();
  }
  function language(){
    suspendMenu();window.LOKY_PC4_LANGUAGE_TUTOR.open();languagePage=document.querySelector('.loky-language-overlay');
    if(!languagePage)return;document.getElementById('app').inert=true;languagePage.classList.add('nav-frame','nav-language');
    const leave=async(all)=>{await window.LOKY_PC4_LANGUAGE_TUTOR.close();languagePage=null;all?dismiss():back();};
    const legacyClose=languagePage.querySelector('.loky-language-settings');if(legacyClose?.textContent==='×')legacyClose.hidden=true;
    const b=languagePage.querySelector('.loky-language-back');b.textContent='← Atrás';b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();leave(false);},true);
    const x=button('×',()=>leave(true),'nav-close');x.setAttribute('aria-label','Cerrar ventana');languagePage.querySelector('.loky-language-top').append(x);b.focus();
  }
  function show(route){
    cleanupNative();current=route;
    if(route==='store'||route==='inventory'){
      suspendMenu();window.LokyStore.open({view:route==='inventory'?'inventory':'shop',onClose:returnBack=>{if(returnBack)back();else dismiss();}});return;
    }
    if(['voice','memory','alarms','notifications'].includes(route)){native(route);return;}
    if(route==='language'){language();return;}
    if(route==='seismic'){dismiss();window.LOKY_PC4_SEISMIC.toggle();return;}
    // Park the original activation controls through the existing renderer before replacing content.
    pet.renderSection(route==='home'||route==='settings'||route==='appearance'?'care':route);
    if(['home','settings','appearance'].includes(route))content.replaceChildren();
    menu.dataset.mode=route;title.textContent=names[route]||'Tu espacio';brand.hidden=true;backButton.hidden=false;backButton.textContent='←';
    menu.querySelector('nav').hidden=['home','settings','appearance'].includes(route);
    if(route==='home'){
      const grid=document.createElement('div');grid.className='nav-home-grid';
      for(const [label,key] of [['Mascota','actions'],['Cuidados','care'],['Tienda','store'],['Funciones','tools'],['Ajustes','settings'],['Inventario','inventory']])grid.append(card(label,key,()=>open(key)));
      content.append(grid);
    }else if(route==='settings'){
      const list=document.createElement('div');list.className='nav-settings-list';
      for(const [label,key] of [['Voz y audio','voice'],['Idioma','language'],['Alarmas','alarms'],['Notificaciones','notifications'],['Terremotos','seismic'],['Memoria y agenda','memory']]){
        const row=card(label,key,()=>open(key),true);
        if(key==='language'){
          const tutor=window.LOKY_PC4_LANGUAGE_TUTOR,value=tutor?.languages?.[tutor.state?.source]?.label;
          if(value){const sub=document.createElement('small');sub.className='nav-value';sub.textContent=value;row.querySelector('span').append(sub);}
        }
        list.append(row);
      }content.append(list);
    }else if(route==='appearance'){
      const p=document.createElement('p');p.className='nav-pending';p.textContent='La apariencia actual de LOKY se conserva. Todavía no hay un selector de apariencia en Mobile.';content.append(p,button('Ver controles de mascota',()=>open('actions'),'glass-button'));
    }else if(route==='tools'){
      const mapping={'Configuración':'settings','Memorias y agenda':'memory','Aprender idiomas':'language','Alarmas':'alarms'};
      for(const b of content.querySelectorAll('button'))if(mapping[b.textContent])b.onclick=()=>open(mapping[b.textContent]);
    }
    if(!menu.open)menu.showModal();menuButton.setAttribute('aria-expanded','true');content.scrollTop=0;
  }
  menu.addEventListener('close',()=>{if(switching){switching--;return;}if(!menu.open){trail=[];current='home';}});
  menu.addEventListener('cancel',e=>{e.preventDefault();back();});
  window.LokyNavigation=Object.freeze({open,back,close:dismiss});
})();
