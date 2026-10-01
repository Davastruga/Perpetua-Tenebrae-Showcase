const PASSWORD='WhiteCrow26';
const CONFIG_KEY='pt-showcase-config-pwa-v2';
const OPFS_DIR='pt-showcase-media';
const DB_NAME='pt-showcase-assets';
const DB_STORE='assets';
const objectUrls=new Map();
const PDFJS_URL='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_URL='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
let pdfjsPromise=null;

const DEFAULT_CONFIG={
  appTitle:'PERPETUA TENEBRAE', subtitle:'ONLY DARKNESS IS PERPETUAL', brandLabel:'WHITE CROW ENTERTAINMENT', pitchLabel:'PITCH',
  musicEnabled:true, musicVolume:.45, videoVolume:.85, uiSoundVolume:.7, overlayStrength:.52, presentationLock:false, logoScale:100, logoX:0, logoY:0,
  videoSlots:[
    {id:'combat',label:'COMBAT',enabled:true},
    {id:'exploration',label:'EXPLORATION',enabled:true},
    {id:'trailer',label:'TRAILER',enabled:false},
    {id:'cinematics',label:'CINEMATICS',enabled:false}
  ]
};

let config=loadConfig();
let music=new Audio(); music.loop=true; music.preload='auto';
let sfx=new Audio(); sfx.preload='auto';
let installPrompt=null;
let holdTimer=null;
let currentCleanup=null;

function $(sel,root=document){return root.querySelector(sel)}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function saveConfig(){localStorage.setItem(CONFIG_KEY,JSON.stringify(config))}
function loadConfig(){
  try{
    const raw=JSON.parse(localStorage.getItem(CONFIG_KEY)||'null')||{};
    const slots=DEFAULT_CONFIG.videoSlots.map(f=>({...f,...(raw.videoSlots||[]).find(s=>s.id===f.id)}));
    return {...structuredClone(DEFAULT_CONFIG),...raw,videoSlots:slots};
  }catch{return structuredClone(DEFAULT_CONFIG)}
}
function fmt(bytes=0){if(!bytes)return '0 B'; if(bytes>=1073741824)return (bytes/1073741824).toFixed(2)+' GB'; if(bytes>=1048576)return Math.round(bytes/1048576)+' MB'; if(bytes>=1024)return Math.round(bytes/1024)+' KB'; return bytes+' B'}
function ext(name){const m=name.match(/(\.[a-zA-Z0-9]{1,8})$/);return m?m[1].toLowerCase():''}
function safeRole(s){return s.replace(/[^a-z0-9_-]+/gi,'-').toLowerCase()}
function hasOPFS(){return !!(navigator.storage&&navigator.storage.getDirectory)}
async function opfsDir(){const root=await navigator.storage.getDirectory(); return root.getDirectoryHandle(OPFS_DIR,{create:true})}
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DB_STORE))r.result.createObjectStore(DB_STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function idbPut(key,file){const db=await openDb();await new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(file,key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close()}
async function idbGet(key){const db=await openDb();const v=await new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readonly');const r=tx.objectStore(DB_STORE).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});db.close();return v}
async function idbDelete(key){const db=await openDb();await new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close()}
async function writeOPFS(file,key,onProgress){const dir=await opfsDir();const h=await dir.getFileHandle(key,{create:true});const w=await h.createWritable();const chunk=8*1024*1024;let pos=0;try{while(pos<file.size){const end=Math.min(pos+chunk,file.size);const data=await file.slice(pos,end).arrayBuffer();await w.write({type:'write',position:pos,data});pos=end;onProgress?.(file.size?pos/file.size:1)}await w.close()}catch(e){try{await w.abort()}catch{};throw e}}
function chooseFile(accept){return new Promise(resolve=>{const i=document.createElement('input');i.type='file';i.accept=accept;i.style.position='fixed';i.style.left='-9999px';i.onchange=()=>{const f=i.files?.[0];i.remove();resolve(f)};i.oncancel=()=>{i.remove();resolve()};document.body.appendChild(i);i.click()})}
const ACCEPT={video:'video/*,.mp4,.mov,.m4v,.webm',pdf:'application/pdf,.pdf',image:'image/*,.jpg,.jpeg,.png,.webp,.avif',audio:'audio/*,.mp3,.m4a,.aac,.wav,.ogg',font:'font/*,.ttf,.otf,.woff,.woff2'};
async function importAsset(role,kind,onProgress){const file=await chooseFile(ACCEPT[kind]);if(!file)return;const key=`${safeRole(role)}-${Date.now()}${ext(file.name)}`;let backend='idb';if(hasOPFS()){try{await writeOPFS(file,key,onProgress);backend='opfs'}catch(e){console.warn('OPFS failed, IDB fallback',e);await idbPut(key,file);onProgress?.(1)}}else{await idbPut(key,file);onProgress?.(1)}return{storageKey:key,originalName:file.name,mimeType:file.type,size:file.size,backend,importedAt:Date.now()}}
async function resolveBlob(asset){if(!asset?.storageKey)return;let blob;if(asset.backend!=='idb'&&hasOPFS()){try{const dir=await opfsDir();blob=await (await dir.getFileHandle(asset.storageKey)).getFile()}catch{}}if(!blob){try{blob=await idbGet(asset.storageKey)}catch{}}return blob}
async function resolveUrl(asset){if(!asset?.storageKey)return; if(objectUrls.has(asset.storageKey))return objectUrls.get(asset.storageKey);const blob=await resolveBlob(asset);if(!blob)return;const url=URL.createObjectURL(blob);objectUrls.set(asset.storageKey,url);return url}
async function assetExists(asset){return !!(await resolveBlob(asset))}
async function deleteAsset(asset){if(!asset?.storageKey)return;const u=objectUrls.get(asset.storageKey);if(u)URL.revokeObjectURL(u);objectUrls.delete(asset.storageKey);if(asset.backend!=='idb'&&hasOPFS()){try{const dir=await opfsDir();await dir.removeEntry(asset.storageKey)}catch{}}try{await idbDelete(asset.storageKey)}catch{}}
async function storageStats(){const e=await navigator.storage?.estimate?.()||{};const p=await navigator.storage?.persisted?.().catch(()=>false)||false;return{usage:e.usage||0,quota:e.quota||0,persisted:p,opfs:hasOPFS()}}

function cleanup(){currentCleanup?.();currentCleanup=null}
function clickSound(){if(!sfx.src)return;sfx.currentTime=0;sfx.play().catch(()=>{})}
async function syncAudio(){
  const sfxUrl=await resolveUrl(config.buttonSound);if(sfxUrl){sfx.src=sfxUrl;sfx.volume=config.uiSoundVolume}
  const m=await resolveUrl(config.menuMusic);if(music.src!==m){music.pause();music.src=m||'';if(m)music.load()}music.volume=config.musicVolume;
  if(config.musicEnabled&&m)music.play().catch(()=>{});else music.pause();
}
async function applyCustomFont(){const old=$('#custom-font-style');old?.remove();const u=await resolveUrl(config.customFont);if(!u)return;const st=document.createElement('style');st.id='custom-font-style';st.textContent=`@font-face{font-family:PTCustom;src:url('${u}')} :root{--showcase-font:PTCustom,Inter,Arial,sans-serif}`;document.head.appendChild(st)}

async function ensureFullscreen(){
  try{
    if(!document.fullscreenElement){
      await document.documentElement.requestFullscreen?.({navigationUI:'hide'});
    }
    try{await screen.orientation?.lock?.('landscape')}catch{}
  }catch{}
}
async function getPdfJs(){
  if(!pdfjsPromise){
    pdfjsPromise=import(PDFJS_URL).then(m=>{m.GlobalWorkerOptions.workerSrc=PDFJS_WORKER_URL;return m});
  }
  return pdfjsPromise;
}
function preloadPdfEngine(){
  getPdfJs().catch(()=>{});
  fetch(PDFJS_WORKER_URL,{mode:'cors'}).catch(()=>{});
}

function showPassword(onUnlock){
  const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="password-card"><div class="eyebrow">ADMINISTRATION</div><h2>Configuration access</h2><p>Enter the showcase password.</p><input id="pw" type="password" placeholder="Password" autocomplete="off"><div id="pwerr" class="error-text"></div><div class="modal-actions"><button class="secondary" id="cancel">Cancel</button><button id="enter">Enter</button></div></div>`;document.body.appendChild(m);
  const submit=()=>{if($('#pw',m).value===PASSWORD){m.remove();onUnlock()}else{$('#pwerr',m).textContent='Incorrect password';$('#pw',m).value=''}};
  $('#enter',m).onclick=submit;$('#cancel',m).onclick=()=>m.remove();$('#pw',m).onkeydown=e=>{if(e.key==='Enter')submit()};m.onpointerdown=e=>{if(e.target===m)m.remove()};setTimeout(()=>$('#pw',m).focus(),20)
}

function isStandalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}
function installHelp(){
  const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="password-card install-card"><div class="eyebrow">INSTALL ON THIS DEVICE</div><h2>Add Perpetua Tenebrae to the Home Screen</h2><p><strong>iPhone / iPad:</strong> open this page in Safari, tap Share, then <em>Add to Home Screen</em>. Open the new PT icon before importing your videos.</p><p><strong>Android:</strong> open the browser menu and choose <em>Install app</em> or <em>Add to Home screen</em>.</p><div class="modal-actions"><button id="close">Got it</button></div></div>`;document.body.appendChild(m);$('#close',m).onclick=()=>m.remove();m.onpointerdown=e=>{if(e.target===m)m.remove()}
}
async function doInstall(){if(installPrompt){await installPrompt.prompt();await installPrompt.userChoice}else installHelp()}

async function renderMenu(){
  cleanup();await syncAudio();await applyCustomFont();
  const bg=await resolveUrl(config.background);const logo=await resolveUrl(config.logo);const pitchThumb=await resolveUrl(config.pitchThumbnail);const thumbs={};for(const s of config.videoSlots)thumbs[s.id]=await resolveUrl(s.thumbnail);
  const cards=[`<button class="media-card ${config.pitch?'':'disabled'}" data-kind="pitch" ${config.pitch?'':'disabled'}>${pitchThumb?`<img src="${pitchThumb}" alt="">`:`<div class="card-fallback"><span>▤</span></div>`}<div class="card-shade"></div><div class="card-label">${esc(config.pitchLabel)}</div>${config.pitch?'':'<div class="not-assigned">NOT ASSIGNED</div>'}</button>`]
    .concat(config.videoSlots.filter(s=>s.enabled).map(s=>`<button class="media-card ${s.video?'':'disabled'}" data-slot="${s.id}" ${s.video?'':'disabled'}>${thumbs[s.id]?`<img src="${thumbs[s.id]}" alt="">`:`<div class="card-fallback"><span>▶</span></div>`}<div class="card-shade"></div><div class="card-label">${esc(s.label)}</div>${s.video?'':'<div class="not-assigned">NOT ASSIGNED</div>'}</button>`)).join('');
  $('#app').innerHTML=`<div class="app-shell" ${bg?`style="background-image:url('${bg}')"`:''}><div class="background-default"></div><div class="background-overlay" style="background:linear-gradient(90deg,rgba(2,2,3,${Math.min(.92,config.overlayStrength+.24)}) 0%,rgba(2,2,3,${config.overlayStrength}) 46%,rgba(2,2,3,${Math.max(.2,config.overlayStrength-.18)}) 100%)"></div>${config.presentationLock?'':'<button class="settings-button" id="settings" aria-label="Settings">⚙</button>'}${isStandalone()?'':'<button class="install-pill" id="install">＋ INSTALL APP</button>'}<div class="hero-copy"><button class="brand-mark ${config.presentationLock?'unlock-target':''}" id="brand">${esc(config.brandLabel)}</button>${logo?`<div class="hero-logo-stage"><img class="hero-logo" src="${logo}" alt="${esc(config.appTitle)}" style="width:${Number(config.logoScale)||100}%;transform:translate(${Number(config.logoX)||0}px,${Number(config.logoY)||0}px)"></div>`:`<h1>${esc(config.appTitle)}</h1>`}<p>${esc(config.subtitle)}</p></div><div class="row-title">SHOWCASE</div><div class="card-row">${cards}</div><button class="ready-pill" id="ready"><span class="dot ${navigator.onLine?'online':'offline'}"></span> OFFLINE CHECK</button><div class="menu-volume"><span class="volume-icon">🔊</span><input id="menuVolume" aria-label="Menu music volume" type="range" min="0" max="1" step="0.01" value="${Number(config.musicVolume ?? .45)}"><span id="menuVolumeValue">${Math.round(Number(config.musicVolume ?? .45)*100)}%</span></div><div class="footer-hint">${navigator.onLine?'ONLINE · MEDIA REMAINS LOCAL':'OFFLINE MODE · LOCAL MEDIA'}</div></div>`;
  $('#settings')?.addEventListener('click',()=>{clickSound();showPassword(renderSettings)});$('#install')?.addEventListener('click',doInstall);$('#ready').onclick=()=>{clickSound();showReadiness()};
  const menuVolume=$('#menuVolume');if(menuVolume){menuVolume.oninput=e=>{config.musicVolume=+e.target.value;music.volume=config.musicVolume;$('#menuVolumeValue').textContent=Math.round(config.musicVolume*100)+'%';saveConfig();if(config.musicEnabled&&music.src&&music.paused)music.play().catch(()=>{})}}
  $('#brand').onpointerdown=()=>{if(!config.presentationLock)return;clearTimeout(holdTimer);holdTimer=setTimeout(()=>{clickSound();showPassword(renderSettings)},3000)};['pointerup','pointercancel','pointerleave'].forEach(ev=>$('#brand').addEventListener(ev,()=>clearTimeout(holdTimer)));
  $('[data-kind="pitch"]')?.addEventListener('click',async()=>{clickSound();if(config.pitch)await showPdf(config.pitch)});
  document.querySelectorAll('[data-slot]').forEach(el=>el.addEventListener('click',async()=>{clickSound();const s=config.videoSlots.find(x=>x.id===el.dataset.slot);if(s?.video)await showVideo(s.video,s.label)}));
  $('.app-shell').addEventListener('pointerdown',()=>{if(config.musicEnabled)music.play().catch(()=>{})},{once:true});
}

async function showVideo(asset,label){
  cleanup();
  music.pause();
  const src=await resolveUrl(asset);
  if(!src){alert('Video not available. Re-import it from Configuration.');return renderMenu()}
  const initialVolume=Math.max(0,Math.min(1,Number(config.videoVolume ?? .85)));
  $('#app').innerHTML=`<div class="player-screen"><video id="vid" class="video-element" src="${src}" playsinline autoplay></video><div class="video-controls is-visible" id="controls"><button class="back-pill" id="back">← <span>MENU</span></button><div class="player-title">${esc(label)}</div><button class="play-button" id="play">Ⅱ</button><div class="video-bottom-controls"><div class="timeline-wrap"><span id="now">00:00</span><input id="timeline" class="timeline" type="range" min="0" max="0.01" step="0.05" value="0"><span id="dur">00:00</span></div><div class="video-volume-wrap"><button class="video-mute" id="videoMute" aria-label="Mute video">🔊</button><input id="videoVolume" class="video-volume" aria-label="Video volume" type="range" min="0" max="1" step="0.01" value="${initialVolume}"><span id="videoVolumeValue">${Math.round(initialVolume*100)}%</span></div></div></div></div>`;
  const v=$('#vid'),controls=$('#controls'),play=$('#play'),timeline=$('#timeline'),volume=$('#videoVolume'),mute=$('#videoMute');
  v.volume=initialVolume;
  let timer;
  const ft=n=>{if(!Number.isFinite(n))return'00:00';n=Math.max(0,Math.floor(n));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
  const reveal=()=>{controls.classList.add('is-visible');clearTimeout(timer);timer=setTimeout(()=>controls.classList.remove('is-visible'),3000)};
  const toggle=()=>{if(v.paused)v.play().catch(()=>{});else v.pause();reveal()};
  const updateVolumeUI=()=>{const level=v.muted?0:v.volume;volume.value=String(level);$('#videoVolumeValue').textContent=Math.round(level*100)+'%';mute.textContent=(v.muted||level===0)?'🔇':level<.5?'🔉':'🔊'};
  v.onclick=toggle;play.onclick=toggle;
  v.onplay=()=>play.textContent='Ⅱ';v.onpause=()=>play.textContent='▶';
  v.ontimeupdate=()=>{$('#now').textContent=ft(v.currentTime);timeline.value=String(v.currentTime)};
  v.ondurationchange=()=>{timeline.max=String(Math.max(v.duration||0,.01));$('#dur').textContent=ft(v.duration)};
  timeline.oninput=()=>{v.currentTime=+timeline.value;reveal()};
  volume.oninput=e=>{const value=+e.target.value;v.muted=false;v.volume=value;config.videoVolume=value;saveConfig();updateVolumeUI();reveal()};
  mute.onclick=()=>{v.muted=!v.muted;updateVolumeUI();reveal()};
  $('.player-screen').onpointermove=reveal;$('.player-screen').onpointerdown=reveal;
  $('#back').onclick=()=>{v.pause();renderMenu()};
  updateVolumeUI();reveal();v.play().catch(()=>{});
  currentCleanup=()=>{clearTimeout(timer);v.pause();};
}

async function showPdf(asset){
  cleanup();music.pause();
  const blob=await resolveBlob(asset);
  if(!blob){alert('PDF not available. Re-import it from Configuration.');return renderMenu()}
  $('#app').innerHTML=`<div class="pdf-screen" id="pdfScreen"><div class="pdf-stage" id="pdfStage"><div class="pdf-loading">LOADING PITCH…</div><canvas id="pdfCanvas" hidden></canvas></div><button class="pdf-nav pdf-prev" id="pdfPrev">‹</button><button class="pdf-nav pdf-next" id="pdfNext">›</button><div class="pdf-counter" id="counter"></div><button class="pdf-back" id="back">← MENU</button></div>`;
  const stage=$('#pdfStage'),canvas=$('#pdfCanvas'),counter=$('#counter'),screen=$('#pdfScreen');
  let pdf=null,page=1,renderTask=null,closed=false,startX=null,startY=null;
  const fail=(e)=>{console.error(e);stage.innerHTML=`<div class="viewer-error-inline"><strong>PDF ERROR</strong><small>${navigator.onLine?'The PDF could not be rendered. Try importing it again.':'Connect to internet once so the PDF engine can be cached, then retry offline.'}</small></div>`;$('#pdfPrev').hidden=true;$('#pdfNext').hidden=true;counter.textContent=''};
  try{
    const pdfjs=await getPdfJs();
    const bytes=new Uint8Array(await blob.arrayBuffer());
    pdf=await pdfjs.getDocument({data:bytes}).promise;
    if(closed)return;
    const renderPage=async()=>{
      if(!pdf||closed)return;
      try{renderTask?.cancel?.()}catch{}
      const p=await pdf.getPage(page);
      if(closed)return;
      const base=p.getViewport({scale:1});
      const pad=24,aw=Math.max(100,stage.clientWidth-pad*2),ah=Math.max(100,stage.clientHeight-pad*2);
      const cssScale=Math.min(aw/base.width,ah/base.height);
      const dpr=Math.min(window.devicePixelRatio||1,2);
      const viewport=p.getViewport({scale:cssScale*dpr});
      const ctx=canvas.getContext('2d',{alpha:false});
      canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);
      canvas.style.width=Math.floor(viewport.width/dpr)+'px';canvas.style.height=Math.floor(viewport.height/dpr)+'px';
      canvas.hidden=false;stage.querySelector('.pdf-loading')?.remove();
      renderTask=p.render({canvasContext:ctx,viewport});await renderTask.promise;
      counter.textContent=`${page} / ${pdf.numPages}`;
      $('#pdfPrev').hidden=page<=1;$('#pdfNext').hidden=page>=pdf.numPages;
    };
    const prev=()=>{if(page>1){page--;renderPage()}};const next=()=>{if(page<pdf.numPages){page++;renderPage()}};
    $('#pdfPrev').onclick=prev;$('#pdfNext').onclick=next;
    screen.onpointerdown=e=>{startX=e.clientX;startY=e.clientY};
    screen.onpointerup=e=>{if(startX==null)return;const dx=e.clientX-startX,dy=e.clientY-startY;startX=startY=null;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.2){dx<0?next():prev()}};
    const resize=()=>renderPage();window.addEventListener('resize',resize);await renderPage();
    currentCleanup=()=>{closed=true;window.removeEventListener('resize',resize);try{renderTask?.cancel?.();pdf?.destroy?.()}catch{}};
  }catch(e){fail(e)}
  $('#back').onclick=renderMenu;
}

function field(label,value,key,type='text'){return `<label>${label}<input data-key="${key}" type="${type}" value="${esc(value)}"></label>`}
function assetRow(title,asset,kind,role,target){return `<div class="asset-row" data-asset-target="${target}" data-kind="${kind}" data-role="${role}"><div class="asset-info"><strong>${esc(title)}</strong><span>${asset?esc(asset.originalName)+(asset.size?' · '+fmt(asset.size):''):'Not assigned'}</span><div class="import-progress" hidden><i></i></div></div><div class="asset-actions">${asset?'<button class="tiny danger remove">Remove</button>':''}<button class="tiny pick">${asset?'Replace':'Choose file'}</button></div></div>`}
function getTarget(path){if(path.startsWith('slot:')){const[,id,prop]=path.split(':');return config.videoSlots.find(s=>s.id===id)?.[prop]}return config[path]}
function setTarget(path,val){if(path.startsWith('slot:')){const[,id,prop]=path.split(':');const s=config.videoSlots.find(s=>s.id===id);if(s)s[prop]=val}else config[path]=val;saveConfig()}

async function renderSettings(){cleanup();music.pause();const st=await storageStats();const slotHtml=config.videoSlots.map(s=>`<div class="slot-card" data-slot="${s.id}"><div class="slot-top"><label class="switch-label"><input class="slot-enabled" type="checkbox" ${s.enabled?'checked':''}> Visible</label><label>Button text<input class="slot-label" value="${esc(s.label)}"></label></div>${assetRow('Video',s.video,'video',`video-${s.id}`,`slot:${s.id}:video`)}${assetRow('Card image',s.thumbnail,'image',`thumb-${s.id}`,`slot:${s.id}:thumbnail`)}</div>`).join('');$('#app').innerHTML=`<div class="settings-screen"><header class="settings-header"><div><div class="eyebrow">PERPETUA TENEBRAE · PWA</div><h1>Showcase configuration</h1></div><button class="secondary" id="done">Done</button></header><main class="settings-content"><section class="settings-section" id="statusBox"><div class="readiness-head"><div><div class="eyebrow">EVENT STATUS</div><h2>CHECKING…</h2></div><button class="tiny secondary" id="recheck">Recheck</button></div><div class="status-grid" id="statusGrid"></div></section><section class="settings-section"><h2>Identity & menu</h2><div class="form-grid">${field('Title',config.appTitle,'appTitle')}${field('Subtitle',config.subtitle,'subtitle')}${field('Studio label',config.brandLabel,'brandLabel')}${field('Pitch button text',config.pitchLabel,'pitchLabel')}<label>Background darkness <span id="overlayVal">${Math.round(config.overlayStrength*100)}%</span><input id="overlay" type="range" min="0" max="0.85" step="0.01" value="${config.overlayStrength}"></label></div>${assetRow('Menu background (16:9 recommended, ≥1920×1080)',config.background,'image','menu-background','background')}${assetRow('Perpetua Tenebrae logo (PNG/WebP with transparency)',config.logo,'image','menu-logo','logo')}<div class="form-grid logo-controls"><label>Logo size <span id="logoScaleVal">${Math.round(config.logoScale||100)}%</span><input id="logoScale" type="range" min="35" max="180" step="1" value="${config.logoScale||100}"></label><label>Logo horizontal <span id="logoXVal">${Math.round(config.logoX||0)} px</span><input id="logoX" type="range" min="-300" max="300" step="1" value="${config.logoX||0}"></label><label>Logo vertical <span id="logoYVal">${Math.round(config.logoY||0)} px</span><input id="logoY" type="range" min="-180" max="180" step="1" value="${config.logoY||0}"></label></div>${assetRow('Custom font (.ttf/.otf/.woff)',config.customFont,'font','custom-font','customFont')}</section><section class="settings-section"><h2>Pitch</h2>${assetRow('Pitch PDF',config.pitch,'pdf','pitch','pitch')}${assetRow('Pitch card image',config.pitchThumbnail,'image','pitch-thumb','pitchThumbnail')}</section><section class="settings-section"><h2>Videos</h2>${slotHtml}</section><section class="settings-section"><h2>Audio</h2><label class="switch-label"><input id="musicEnabled" type="checkbox" ${config.musicEnabled?'checked':''}> Play menu music in loop</label><div class="form-grid"><label>Music volume <span>${Math.round(config.musicVolume*100)}%</span><input id="musicVolume" type="range" min="0" max="1" step=".01" value="${config.musicVolume}"></label><label>Button sound volume <span>${Math.round(config.uiSoundVolume*100)}%</span><input id="sfxVolume" type="range" min="0" max="1" step=".01" value="${config.uiSoundVolume}"></label></div>${assetRow('Main theme / menu music',config.menuMusic,'audio','menu-music','menuMusic')}${assetRow('Button sound',config.buttonSound,'audio','button-sfx','buttonSound')}</section><section class="settings-section"><h2>Offline storage</h2><div class="storage-card"><div><span>Used by browser</span><strong>${fmt(st.usage)}</strong></div><div><span>Available quota</span><strong>${st.quota?fmt(st.quota):'Browser managed'}</strong></div><div><span>Media storage</span><strong>${st.opfs?'OPFS':'IndexedDB fallback'}</strong></div><div><span>Persistence</span><strong>${st.persisted?'✓ GRANTED':'NOT GRANTED'}</strong></div></div><div class="storage-actions"><button id="persist">Request persistent storage</button></div><p class="settings-note">Imported media stays only on this device. It is not uploaded to the server.</p></section><section class="settings-section"><h2>Presentation lock</h2><label class="switch-label"><input id="lock" type="checkbox" ${config.presentationLock?'checked':''}> Hide the settings button during presentations</label><p class="settings-note">When locked, hold the studio label for 3 seconds and enter the password.</p></section><section class="settings-section note-section"><h2>Event mode</h2><p>Install the PWA on the Home Screen first, then import media from inside the installed app. Once the readiness check is green, enable airplane mode and test again.</p><p>Password: <strong>WhiteCrow26</strong></p></section></main></div>`;
  $('#done').onclick=renderMenu;document.querySelectorAll('[data-key]').forEach(i=>i.oninput=()=>{config[i.dataset.key]=i.value;saveConfig()});$('#overlay').oninput=e=>{config.overlayStrength=+e.target.value;$('#overlayVal').textContent=Math.round(config.overlayStrength*100)+'%';saveConfig()};$('#logoScale').oninput=e=>{config.logoScale=+e.target.value;$('#logoScaleVal').textContent=Math.round(config.logoScale)+'%';saveConfig()};$('#logoX').oninput=e=>{config.logoX=+e.target.value;$('#logoXVal').textContent=Math.round(config.logoX)+' px';saveConfig()};$('#logoY').oninput=e=>{config.logoY=+e.target.value;$('#logoYVal').textContent=Math.round(config.logoY)+' px';saveConfig()};$('#musicEnabled').onchange=e=>{config.musicEnabled=e.target.checked;saveConfig()};$('#musicVolume').oninput=e=>{config.musicVolume=+e.target.value;saveConfig()};$('#sfxVolume').oninput=e=>{config.uiSoundVolume=+e.target.value;saveConfig()};$('#lock').onchange=e=>{config.presentationLock=e.target.checked;saveConfig()};$('#persist').onclick=async()=>{await navigator.storage?.persist?.();renderSettings()};
  document.querySelectorAll('.slot-card').forEach(card=>{const s=config.videoSlots.find(x=>x.id===card.dataset.slot);$('.slot-enabled',card).onchange=e=>{s.enabled=e.target.checked;saveConfig();refreshSettingsStatus()};$('.slot-label',card).oninput=e=>{s.label=e.target.value;saveConfig()}});
  document.querySelectorAll('.asset-row').forEach(row=>{const target=row.dataset.assetTarget;$('.pick',row).onclick=async()=>{const button=$('.pick',row),bar=$('.import-progress',row),fill=$('i',bar);button.disabled=true;bar.hidden=false;const old=getTarget(target);try{const next=await importAsset(row.dataset.role,row.dataset.kind,r=>{fill.style.width=Math.max(3,r*100)+'%';button.textContent='Importing '+Math.round(r*100)+'%'});if(next){if(old)await deleteAsset(old);setTarget(target,next);await renderSettings()}}catch(e){alert('Could not import file.\n\n'+e)}finally{button.disabled=false}};$('.remove',row)?.addEventListener('click',async()=>{const old=getTarget(target);if(old)await deleteAsset(old);setTarget(target,undefined);await renderSettings()})});
  $('#recheck').onclick=refreshSettingsStatus;await refreshSettingsStatus();
}
async function refreshSettingsStatus(){const grid=$('#statusGrid');if(!grid)return;const required=[['Pitch',config.pitch],...config.videoSlots.filter(s=>s.enabled).map(s=>[s.label,s.video])];const optional=[['Background',config.background],['Menu music',config.menuMusic]];const checked=[];for(const [name,a] of [...required,...optional])checked.push([name,a?await assetExists(a):false,required.some(r=>r[0]===name)]);const ready=required.every(([name,a])=>a&&checked.find(c=>c[0]===name)?.[1]);$('#statusBox').classList.toggle('ready',ready);$('#statusBox h2').textContent=ready?'DEVICE READY FOR PRESENTATION':'SETUP INCOMPLETE';grid.innerHTML=checked.map(([n,ok,req])=>`<div><span>${esc(n)}</span><b>${ok?'✓ READY':req?'— MISSING':'OPTIONAL'}</b></div>`).join('')}

async function showReadiness(){const required=[['Pitch',config.pitch],...config.videoSlots.filter(s=>s.enabled).map(s=>[s.label,s.video])];const optional=[['Background',config.background],['Menu music',config.menuMusic]];const items=[];for(const [n,a] of [...required,...optional])items.push([n,a?await assetExists(a):false,required.some(r=>r[0]===n)]);let sw=false;try{sw=!!(await navigator.serviceWorker?.ready)}catch{}const st=await storageStats();const ready=sw&&required.every(([n,a])=>a&&items.find(i=>i[0]===n)?.[1]);const m=document.createElement('div');m.className='modal-backdrop';m.innerHTML=`<div class="ready-modal ${ready?'all-ready':''}"><div class="eyebrow">OFFLINE CHECK</div><h2>${ready?'DEVICE READY':'SETUP INCOMPLETE'}</h2><div class="ready-list"><div><span>Application cached</span><b>${sw?'✓':'—'}</b></div>${items.map(([n,ok,req])=>`<div><span>${esc(n)}${req?'':' · optional'}</span><b>${ok?'✓':req?'—':'○'}</b></div>`).join('')}<div><span>Persistent storage</span><b>${st.persisted?'✓':'○'}</b></div></div><p>${ready?'You can enable airplane mode and run one final test before the event.':'Import the missing required media from Configuration, then run this check again.'}</p><div class="modal-actions"><button id="close">Close</button></div></div>`;document.body.appendChild(m);$('#close',m).onclick=()=>m.remove();m.onpointerdown=e=>{if(e.target===m)m.remove()}}

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;renderMenu()});window.addEventListener('appinstalled',()=>{installPrompt=null;renderMenu()});window.addEventListener('online',()=>renderMenu());window.addEventListener('offline',()=>renderMenu());
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);
if('wakeLock'in navigator){const keep=()=>navigator.wakeLock.request('screen').catch(()=>{});keep();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')keep()})}
document.addEventListener('pointerdown',()=>{if(!document.fullscreenElement)ensureFullscreen()},{capture:true});
preloadPdfEngine();
renderMenu();
