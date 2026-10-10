(() => {
  'use strict';
  const M = window.CourtModel, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const KEY = 'courtside.playbook.v1', ACTIVE = 'courtside.active.v1';
  const icons = {
    book:'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4z M20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-3h3z',
    grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    upload:'M12 16V3m-5 5 5-5 5 5 M4 15v6h16v-6', download:'M12 3v13m-5-5 5 5 5-5 M4 16v5h16v-5',
    help:'M9 8a3 3 0 1 1 5 3c-2 1-2 2-2 3 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    undo:'M8 4 3 9l5 5 M3 9h11a6 6 0 0 1 0 12',redo:'m16 4 5 5-5 5 M21 9H10a6 6 0 0 0 0 12',
    copy:'M9 8h12v13H9z M15 8V3H3v13h6', share:'M8 9l8-4 M8 15l8 4 M9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M21 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M21 20a3 3 0 1 1-6 0 3 3 0 0 1 6 0', plus:'M12 5v14 M5 12h14',mirror:'M12 3v18 M8 5 3 12l5 7z M16 5l5 7-5 7z',
    path:'M3 18c3-16 12 9 17-13m-6 0h6v6',cursor:'m5 3 14 10-7 1-3 7z',arrow:'M4 20 20 4 M10 4h10v10',
    dribble:'M3 20 5 12l5 2 1-7 5 2 4-6 M14 3h6v6',pass:'M4 20l3-3m3-3 3-3m3-3 4-4 M11 4h9v9',screen:'M4 20 18 6 M13 2l9 9',
    player:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0 M10 9l2-1v8 M10 16h4',defender:'m5 5 14 14 M19 5 5 19',text:'M4 5h16 M12 5v15 M8 20h8',erase:'m3 15 10-11 8 8-8 9H9z M8 10l8 8 M12 21h9',
    restart:'M5 5v14 M19 5l-10 7 10 7z',play:'m8 4 12 8-12 8z',pause:'M8 4v16 M16 4v16',loop:'M4 8h13l-3-3 M20 16H7l3 3 M20 8v5 M4 16v-5',
    sliders:'M5 3v18 M12 3v18 M19 3v18 M2 8h6 M9 16h6 M16 7h6',trash:'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7'
  };
  const icon = key => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[key] || icons.grid}"/></svg>`;
  $$('[data-icon]').forEach(el => el.innerHTML=icon(el.dataset.icon));
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let storageError = false, loadWarning = '';
  let library;
  try {
    const stored = localStorage.getItem(KEY);
    library = stored ? JSON.parse(stored).map(p=>M.validatePlay(p)) : M.starterPlays();
    if (!library.length) library = [M.createPlay('5-out')];
  } catch (e) {library=M.starterPlays(); storageError=true;loadWarning='Could not read saved plays. Export your work before closing this tab.';}
  let activeId;
  try {activeId=localStorage.getItem(ACTIVE);} catch(e){}
  let play=library.find(p=>p.id===activeId)||library[0], current=0, tool='select', selected=null, drawing=null, pointer=null;
  let undoStack=[],redoStack=[],playing=false,time=0,lastTick=0,speed=1,loop=false,showPaths=true,raf=0,pendingLabel=null;
  const frame=()=>play.frames[current], total=()=>play.frames.reduce((n,f)=>n+f.duration,0);
  const beforeFrame=i=>play.frames.slice(0,i).reduce((n,f)=>n+f.duration,0);
  const snapshot=()=>JSON.stringify(play);
  function checkpoint(){undoStack.push(snapshot());if(undoStack.length>80)undoStack.shift();redoStack=[];updateUndo();}
  function updateUndo(){$('#undo').disabled=!undoStack.length;$('#redo').disabled=!redoStack.length;}
  function save(){
    play.updatedAt=new Date().toISOString();
    try {if(loadWarning)throw Error('Saved data needs recovery');M.validatePlay(play);localStorage.setItem(KEY,JSON.stringify(library));localStorage.setItem(ACTIVE,play.id);storageError=false;$('#save-status').textContent='✓ Saved in this browser';}
    catch(e){$('#save-status').textContent='Not saved — export a backup';storageError=true;}
  }
  let toastTimer;
  function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3600);}
  function mutate(fn){stop();checkpoint();fn();time=beforeFrame(current);save();render();}
  function restore(raw){const replacement=JSON.parse(raw);library[library.indexOf(play)]=replacement;play=replacement;current=Math.min(current,play.frames.length-1);selected=null;drawing=null;time=beforeFrame(current);save();render();}
  function undo(){if(!undoStack.length)return;stop();redoStack.push(snapshot());restore(undoStack.pop());}
  function redo(){if(!redoStack.length)return;stop();undoStack.push(snapshot());restore(redoStack.pop());}
  function stop(){playing=false;cancelAnimationFrame(raf);$('#play-button').innerHTML=icon('play');$('#play-button').setAttribute('aria-label','Play animation');}
  function setFrame(index){stop();current=index;time=beforeFrame(index);selected=null;drawing=null;render();}
  function selectPlay(id){stop();play=library.find(p=>p.id===id);current=0;time=0;selected=null;drawing=null;undoStack=[];redoStack=[];try{localStorage.setItem(ACTIVE,id);}catch(e){}render();}
  function courtBase(court,prefix='main'){
    const full=court==='full',h=full?1128:620,mid=full?564:590;
    const half=`<g fill="none" stroke="#b6a68a" stroke-width="2"><rect x="210" y="30" width="180" height="210" fill="#e7ddc5" fill-opacity=".45"/><path d="M210 240a90 90 0 0 0 180 0 M210 240a90 90 0 0 1 180 0"/><path d="M65 30v120 A245 245 0 0 0 535 150V30"/><path d="M255 92a45 45 0 0 0 90 0"/><path d="M270 75h60" stroke="#8b806a" stroke-width="3"/><circle cx="300" cy="92" r="12" stroke="#b67b51" stroke-width="3"/><path d="M208 112h-10 M208 160h-10 M392 112h10 M392 160h10"/></g>`;
    return `<defs><pattern id="${prefix}-wood" width="60" height="${h}" patternUnits="userSpaceOnUse"><path d="M60 0V${h}" stroke="#a69069" stroke-opacity=".065"/></pattern><marker id="${prefix}-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="m2 2 8 4-8 4" fill="none" stroke="#364d54" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></marker><marker id="${prefix}-screen" viewBox="0 0 12 16" refX="6" refY="8" markerWidth="5" markerHeight="8" orient="auto"><path d="M6 1v14" stroke="#364d54" stroke-width="2.5"/></marker></defs><rect width="600" height="${h}" rx="12" fill="#eee5d2"/><rect width="600" height="${h}" rx="12" fill="url(#${prefix}-wood)"/><rect x="30" y="30" width="540" height="${full?1068:560}" fill="none" stroke="#b6a68a" stroke-width="2.5"/>${half}${full?`<g transform="translate(0 1128) scale(1 -1)">${half}</g><path d="M30 564h540" stroke="#b6a68a" stroke-width="2" fill="none"/><circle cx="300" cy="564" r="70" stroke="#b6a68a" stroke-width="2" fill="none"/>`:`<path d="M230 ${mid}a70 70 0 0 1 140 0" stroke="#b6a68a" stroke-width="2" fill="none"/>`}<text x="${full?44:300}" y="${full?554:570}" text-anchor="${full?'start':'middle'}" fill="#a59981" font-family="system-ui,sans-serif" font-size="12" letter-spacing="5">COURTSIDE</text>`;
  }
  function actionMarkup(a,prefix,chosen=false){
    let {x:x1,y:y1}=a.from,{x:x2,y:y2}=a.to;const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1;
    const startPad=22,endPad=a.type==='pass'&&a.targetId?23:4;
    x1+=dx/len*startPad;y1+=dy/len*startPad;x2-=dx/len*endPad;y2-=dy/len*endPad;
    let d=`M${x1} ${y1}L${x2} ${y2}`;
    if(a.type==='dribble'){
      const steps=Math.max(2,Math.floor(len/13));d=`M${x1} ${y1}`;
      for(let i=1;i<=steps;i++){const t=i/steps,offset=i===steps?0:(i%2?4:-4);d+=`L${x1+(x2-x1)*t-dy/len*offset} ${y1+(y2-y1)*t+dx/len*offset}`;}
    }
    return `<g data-action="${esc(a.id)}"><path d="${d}" fill="none" stroke="transparent" stroke-width="18" pointer-events="stroke"/><path d="${d}" fill="none" stroke="${chosen?'#ec714c':'#364d54'}" stroke-width="${chosen?3.2:2.6}" ${a.type==='pass'?'stroke-dasharray="7 7"':''} stroke-linecap="round" marker-end="url(#${prefix}-${a.type==='screen'?'screen':'arrow'})" pointer-events="none"/></g>`;
  }
  function renderSvg(f,{prefix='main',mini=false,animated=null}={}){
    const state=animated||f;let html=courtBase(play.court,prefix);
    if(showPaths||mini)html+=(f.actions||[]).map(a=>actionMarkup(a,prefix,!mini&&selected?.type==='action'&&selected.id===a.id)).join('');
    html+=(f.labels||[]).map(l=>`<g data-label="${esc(l.id)}"><rect x="${l.x-7}" y="${l.y-19}" width="${Math.min(490,l.text.length*8+14)}" height="27" rx="5" fill="#fffaf0" fill-opacity=".92"/><text x="${l.x}" y="${l.y}" fill="#233a43" font-size="15" font-weight="500" font-family="system-ui,sans-serif">${esc(l.text)}</text></g>`).join('');
    html+=state.players.map(p=>`<g data-player="${esc(p.id)}" ${mini?'':`tabindex="0" role="button" aria-label="${p.team==='defense'?'Defender':'Player'} ${esc(p.label)}"`} transform="translate(${p.x} ${p.y})" style="cursor:grab">${!mini&&selected?.id===p.id?'<circle r="27" fill="none" stroke="#ed794f" stroke-width="2" stroke-dasharray="3 3"/>':''}${p.team==='defense'?'<rect x="-18" y="-18" width="36" height="36" rx="9" fill="#fffaf0" stroke="#a6624f" stroke-width="2.5"/><path d="m-11-11 22 22m0-22-22 22" stroke="#a6624f" stroke-opacity=".22" stroke-width="2"/>':'<circle r="21" fill="#223e48" stroke="#fffaf0" stroke-width="2.5"/>'}<text text-anchor="middle" y="6" fill="${p.team==='defense'?'#97533f':'#fffaf0'}" font-size="17" font-family="system-ui,sans-serif" font-weight="700" pointer-events="none">${esc(p.label)}</text></g>`).join('');
    let ball=state.ball;
    if(state.ballOwner){let owner=state.players.find(p=>p.id===state.ballOwner);if(owner)ball={x:owner.x+18,y:owner.y+17};}
    if(ball)html+=`<g pointer-events="none" transform="translate(${ball.x} ${ball.y})"><circle r="9" fill="#ef8b4d" stroke="#fffaf0" stroke-width="2"/><path d="M-8 0H8M0-8V8M-5-6q8 6 0 12" stroke="#9a4f2b" stroke-width="1" fill="none"/></g>`;
    if(drawing&&!mini){const a={id:'preview',type:tool,from:drawing.from,to:drawing.to||drawing.from};html+=`<g opacity=".55">${actionMarkup(a,prefix)}</g>`;}
    return html;
  }
  function draw(animated){const svg=$('#court');svg.setAttribute('viewBox',`0 0 600 ${play.court==='full'?1128:620}`);svg.innerHTML=renderSvg(frame(),{animated});}
  function renderLibrary(){
    $('#play-count').textContent=library.length;
    $('#library-list').innerHTML=library.map(p=>`<button class="library-item ${p.id===play.id?'active':''}" data-open="${esc(p.id)}" aria-current="${p.id===play.id?'true':'false'}"><span class="library-icon">${icon(p.category==='Defense'?'defender':p.category==='Inbound'?'pass':'path')}</span><span class="library-copy"><span class="library-name">${esc(p.name)}</span><span class="library-meta">${esc(p.category)} · ${p.frames.length} step${p.frames.length===1?'':'s'}</span></span></button>`).join('');
  }
  function renderFrames(){
    $('#frame-count').textContent=`${play.frames.length} step${play.frames.length===1?'':'s'}`;
    $('#frames-list').innerHTML=play.frames.map((f,i)=>`<button class="frame-card ${i===current?'active':''}" data-frame="${i}" aria-label="Step ${i+1}: ${esc(f.name)}" aria-pressed="${i===current}"><span class="frame-top"><span class="frame-number">${String(i+1).padStart(2,'0')}</span><span class="frame-duration">${f.duration}s</span></span><svg viewBox="0 0 600 ${play.court==='full'?1128:620}" aria-hidden="true">${renderSvg(f,{prefix:'mini'+i,mini:true})}</svg><span class="frame-name">${esc(f.name)}</span></button>`).join('')+'<button class="add-frame" id="add-frame-card" aria-label="Add next step">'+icon('plus')+'<span>Next step</span></button>';
  }
  function selectionPanel(){
    let out='';
    if(selected?.type==='player'){
      const p=frame().players.find(p=>p.id===selected.id);if(!p){selected=null;return selectionPanel();}
      out=`<div class="section-label">SELECTED PLAYER</div><div class="selected-card"><span class="player-chip">${esc(p.label)}</span><strong>${p.team==='defense'?'Defender':'Offense'}</strong></div><label class="field-label" for="player-label">Number / label</label><input id="player-label" maxlength="3" value="${esc(p.label)}"><div class="field-row"><button id="give-ball" class="secondary-button" ${frame().ballOwner===p.id?'disabled':''}>${frame().ballOwner===p.id?'Has the ball':'Give ball'}</button><button id="remove-selected" class="icon-button danger-button" aria-label="Delete selected player">${icon('trash')}</button></div><p class="selection-help">Drag to reposition. Arrow keys also move the selected player.</p>`;
    }else if(selected?.type==='action'){
      const a=frame().actions.find(a=>a.id===selected.id);out=`<div class="section-label">SELECTED ACTION</div><h2>${esc(a?.type==='move'?'Cut':a?.type||'Action')}</h2><p class="selection-help">To change this route, draw a new action from the same player.</p><button id="remove-selected" class="secondary-button danger-button">Remove action</button>`;
    }else if(selected?.type==='label'){
      const l=(frame().labels||[]).find(l=>l.id===selected.id);out=`<div class="section-label">COURT LABEL</div><label for="edit-label" class="field-label">Text</label><input id="edit-label" value="${esc(l?.text||'')}" maxlength="60"><button id="remove-selected" class="text-button danger-button">Remove label</button>`;
    }else out=`<div class="section-label">MAKE YOUR MOVE</div><p class="selection-help">Select a player to edit their number or give them the ball.</p><div class="shortcut"><span>Play / pause</span><kbd>space</kbd></div><div class="shortcut"><span>Undo</span><kbd>⌘ / Ctrl Z</kbd></div>`;
    $('#selection-panel').innerHTML=out;
    if($('#give-ball'))$('#give-ball').onclick=()=>mutate(()=>frame().ballOwner=selected.id);
    if($('#remove-selected'))$('#remove-selected').onclick=deleteSelection;
    if($('#player-label'))bindEdit($('#player-label'),v=>{const p=frame().players.find(p=>p.id===selected.id);p.label=v.trim()||'1';},()=>{draw();renderFrames();});
    if($('#edit-label'))bindEdit($('#edit-label'),v=>frame().labels.find(l=>l.id===selected.id).text=v,()=>{draw();renderFrames();});
  }
  function renderInspector(){
    $('#step-heading').textContent=`Step ${current+1}`;$('#step-badge').textContent=current===0?'SETUP':'ACTION';
    $('#step-name').value=frame().name;$('#notes').value=frame().notes||'';$('#duration').value=frame().duration;$('#motion-duration').value=frame().motionDuration||frame().duration;$('#motion-duration').max=frame().duration;$('#category').value=play.category;
    $('#delete-step').disabled=play.frames.length<2;selectionPanel();
  }
  function render(){
    $('#play-name').value=play.name;renderLibrary();draw();renderFrames();renderInspector();updateTransport();updateUndo();
    $('#half-court').classList.toggle('active',play.court==='half');$('#full-court').classList.toggle('active',play.court==='full');
    $('#half-court').setAttribute('aria-pressed',play.court==='half');$('#full-court').setAttribute('aria-pressed',play.court==='full');
    $('#save-status').textContent=storageError?'Not saved — export a backup':'✓ Saved in this browser';
  }
  function bindEdit(el,setter,after){
    el.addEventListener('focus',()=>{stop();checkpoint();});
    el.addEventListener('input',()=>{setter(el.value);save();if(after)after();updateTransport();});
  }
  bindEdit($('#play-name'),v=>play.name=v.trim()||'Untitled play',renderLibrary);
  bindEdit($('#step-name'),v=>frame().name=v.trim()||`Step ${current+1}`,renderFrames);
  bindEdit($('#notes'),v=>frame().notes=v);
  $('#duration').onchange=()=>{const n=Number($('#duration').value);if(!Number.isFinite(n)||n<.3||n>300){$('#duration').value=frame().duration;toast('Choose a duration between 0.3 and 300 seconds.');return;}mutate(()=>{frame().motionDuration=Math.min(frame().motionDuration||frame().duration,n);frame().duration=n;});};
  $('#motion-duration').onchange=()=>{const n=Number($('#motion-duration').value);if(!Number.isFinite(n)||n<.3||n>frame().duration){$('#motion-duration').value=frame().motionDuration||frame().duration;toast('Movement time must fit within the step duration.');return;}mutate(()=>frame().motionDuration=n);};
  $('#reading-pace').onchange=()=>{const seconds=Number($('#reading-pace').value);if(!seconds)return;mutate(()=>{const perStep=Math.floor(seconds/play.frames.length*10)/10;play.frames.forEach((f,i)=>{f.duration=i===play.frames.length-1?Math.round((seconds-perStep*i)*10)/10:perStep;f.motionDuration=Math.min(3,f.duration);});current=0;});const shortestHold=Math.min(...play.frames.map(f=>f.duration-f.motionDuration));toast(shortestHold<2?`${seconds/60} minutes total. Some steps have ${shortestHold<=1e-7?'no reading hold':'less than 2 seconds to read'}. Use fewer steps or longer step durations.`:`Play set to ${seconds/60} minutes. Each step moves for up to 3 seconds, then holds for reading.`);$('#reading-pace').value='';};
  $('#category').onchange=()=>mutate(()=>play.category=$('#category').value);
  function chooseTool(next){stop();tool=next;drawing=null;pointer=null;$$('[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===next);b.setAttribute('aria-pressed',b.dataset.tool===next);});
    const hints={select:'Drag players to set up your play.',move:'Drag from a player to draw a cut.',dribble:'Drag from the ball handler to draw a dribble.',pass:'Drag from the passer to a teammate.',screen:'Drag from a screener to their screening position.',offense:'Click the court to add an offensive player.',defense:'Click the court to add a defender.',text:'Click the court to add a label.',erase:'Click a player, action or label to erase it.'};
    $('#tool-hint').textContent=hints[next];draw();
  }
  $$('[data-tool]').forEach(b=>b.onclick=()=>chooseTool(b.dataset.tool));
  function point(e){const pt=$('#court').createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const q=pt.matrixTransform($('#court').getScreenCTM().inverse());return{x:Math.max(30,Math.min(570,q.x)),y:Math.max(30,Math.min(play.court==='full'?1098:590,q.y))};}
  const hitPlayer=(point,radius=32)=>frame().players.find(p=>Math.hypot(p.x-point.x,p.y-point.y)<radius);
  function addAction(start,to){
    const p=frame().players.find(p=>p.id===start.playerId);if(!p||Math.hypot(to.x-p.x,to.y-p.y)<28){drawing=null;draw();return;}
    const target=tool==='pass'?hitPlayer(to):null;
    if(tool==='pass'&&(!target||target.id===p.id||target.team!==p.team)){toast('Finish a pass on a teammate.');drawing=null;draw();return;}
    mutate(()=>{
      const type=tool,action={id:M.uid(),type,from:{x:p.x,y:p.y},to:target?{x:target.x,y:target.y}:to,playerId:p.id,targetId:target?.id||null};
      frame().actions=frame().actions.filter(a=>type==='pass'?a.type!=='pass':!(a.playerId===p.id&&a.type!=='pass'));
      frame().actions.push(action);if(type==='pass'||type==='dribble')frame().ballOwner=p.id;
      selected={type:'action',id:action.id};drawing=null;
    });
  }
  $('#court').addEventListener('pointerdown',e=>{
    if(e.button!==0)return;stop();time=beforeFrame(current);const q=point(e),p=hitPlayer(q),a=e.target.closest('[data-action]'),l=e.target.closest('[data-label]');
    $('#court').setPointerCapture(e.pointerId);
    if(tool==='select'){
      selected=p?{type:'player',id:p.id}:a?{type:'action',id:a.dataset.action}:l?{type:'label',id:l.dataset.label}:null;
      if(p||l)pointer={kind:p?'drag':'label',id:p?.id||l.dataset.label,start:q,before:snapshot(),original:p?{x:p.x,y:p.y}:{x:frame().labels.find(x=>x.id===l.dataset.label).x,y:frame().labels.find(x=>x.id===l.dataset.label).y},moved:false};
      draw();selectionPanel();return;
    }
    if(tool==='erase'){selected=p?{type:'player',id:p.id}:a?{type:'action',id:a.dataset.action}:l?{type:'label',id:l.dataset.label}:null;deleteSelection();return;}
    if(tool==='offense'||tool==='defense'){
      if(frame().players.length>=20){toast('This step already has 20 players.');return;}
      mutate(()=>{const team=tool==='offense'?'offense':'defense',used=frame().players.filter(p=>p.team===team).map(p=>p.label);let n=1;while(used.includes(String(n)))n++;const id=M.uid();frame().players.push({id,label:String(n),team,...q});selected={type:'player',id};});return;
    }
    if(tool==='text'){if((frame().labels||[]).length>=50){toast('Maximum 50 labels per step.');return;}pendingLabel=q;$('#label-input').value='';$('#label-dialog').showModal();return;}
    if(drawing){addAction(drawing,q);return;}
    if(!p){toast('Start the action on a player.');return;}
    drawing={playerId:p.id,from:{x:p.x,y:p.y},to:q};pointer={kind:'action',start:q,moved:false};selected={type:'player',id:p.id};draw();selectionPanel();
  });
  $('#court').addEventListener('pointermove',e=>{
    if(!pointer){if(drawing){drawing.to=point(e);draw();}return;}
    const q=point(e);if(Math.hypot(q.x-pointer.start.x,q.y-pointer.start.y)>4)pointer.moved=true;
    if(pointer.kind==='action'){drawing.to=q;draw();return;}
    const item=pointer.kind==='drag'?frame().players.find(p=>p.id===pointer.id):frame().labels.find(l=>l.id===pointer.id);
    if(!item)return;
    item.x=Math.max(30,Math.min(570,pointer.original.x+q.x-pointer.start.x));item.y=Math.max(30,Math.min(play.court==='full'?1098:590,pointer.original.y+q.y-pointer.start.y));
    if(pointer.kind==='drag')frame().actions.forEach(a=>{if(a.playerId===item.id)a.from={x:item.x,y:item.y};if(a.targetId===item.id)a.to={x:item.x,y:item.y};});draw();
  });
  $('#court').addEventListener('pointerup',e=>{
    if(!pointer)return;const active=pointer;pointer=null;
    if(active.kind==='action'){if(active.moved)addAction(drawing,point(e));return;}
    if(active.moved){undoStack.push(active.before);redoStack=[];save();renderFrames();updateUndo();}draw();
  });
  $('#court').addEventListener('pointercancel',()=>{if(pointer?.before){const state=JSON.parse(pointer.before);library[library.indexOf(play)]=state;play=state;}pointer=null;drawing=null;render();});
  function deleteSelection(){
    if(!selected)return;mutate(()=>{
      const s=selected,f=frame();
      if(s.type==='player'){f.players=f.players.filter(p=>p.id!==s.id);f.actions=f.actions.filter(a=>a.playerId!==s.id&&a.targetId!==s.id);if(f.ballOwner===s.id){f.ballOwner=f.players.find(p=>p.team==='offense')?.id||null;}}
      else if(s.type==='action')f.actions=f.actions.filter(a=>a.id!==s.id);else f.labels=(f.labels||[]).filter(l=>l.id!==s.id);selected=null;
    });
  }
  function addStep(){if(play.frames.length>=40){toast('Maximum 40 steps per play.');return;}mutate(()=>{const f=M.nextFrame(frame());f.name=`Step ${current+2}`;f.notes='';play.frames.splice(current+1,0,f);current++;selected=null;drawing=null;});toast('New step starts at the end of the previous action.');}
  $('#add-step').onclick=addStep;
  $('#frames-list').onclick=e=>{const b=e.target.closest('[data-frame]');if(b)setFrame(Number(b.dataset.frame));else if(e.target.closest('#add-frame-card'))addStep();};
  $('#library-list').onclick=e=>{const b=e.target.closest('[data-open]');if(b)selectPlay(b.dataset.open);};
  $('#duplicate-step').onclick=()=>{if(play.frames.length>=40)return toast('Maximum 40 steps per play.');mutate(()=>{const f=M.clone(frame());f.id=M.uid();f.name=f.name.slice(0,55)+' copy';play.frames.splice(++current,0,f);selected=null;});};
  $('#delete-step').onclick=()=>{if(play.frames.length<2)return;mutate(()=>{play.frames.splice(current,1);current=Math.max(0,current-1);selected=null;});toast('Step deleted. Undo restores it.');};
  $('#undo').onclick=undo;$('#redo').onclick=redo;
  $('#duplicate-play').onclick=()=>{if(library.length>=150)return toast('Maximum 150 plays. Export a backup before removing any.');const p=M.clone(play);p.id=M.uid();p.name=p.name.slice(0,75)+' copy';library.push(p);selectPlay(p.id);save();toast('Play duplicated.');};
  function setCourt(type){if(play.court===type)return;mutate(()=>{if(type==='half')play.frames.forEach(f=>{f.players.forEach(p=>p.y=Math.min(570,p.y));f.actions.forEach(a=>{a.from.y=Math.min(570,a.from.y);a.to.y=Math.min(570,a.to.y);});(f.labels||[]).forEach(l=>l.y=Math.min(570,l.y));if(f.ball)f.ball.y=Math.min(570,f.ball.y);});play.court=type;});}
  $('#half-court').onclick=()=>setCourt('half');$('#full-court').onclick=()=>setCourt('full');
  $('#mirror').onclick=()=>mutate(()=>{const f=frame();f.players.forEach(p=>p.x=600-p.x);f.actions.forEach(a=>{a.from.x=600-a.from.x;a.to.x=600-a.to.x;});(f.labels||[]).forEach(l=>l.x=600-l.x);if(f.ball)f.ball.x=600-f.ball.x;});
  $('#toggle-paths').onclick=()=>{showPaths=!showPaths;$('#toggle-paths').setAttribute('aria-pressed',showPaths);draw();};
  const formatTime=t=>{const seconds=Math.max(0,Math.floor(t+1e-7));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
  function updateTransport(){$('#time-label').textContent=`${formatTime(time)} / ${formatTime(total())}`;$('#playing-step').textContent=`Step ${current+1} of ${play.frames.length}`;$('#seek').value=total()?Math.round(time/total()*1000):0;}
  function showTime(){let sum=0,index=play.frames.length-1;for(let i=0;i<play.frames.length;i++){if(time<sum+play.frames[i].duration){index=i;break;}sum+=play.frames[i].duration;}
    const changed=current!==index;current=index;const t=Math.max(0,Math.min(1,(time-beforeFrame(index))/frame().duration));
    if(changed){renderFrames();renderInspector();}draw(M.interpolateFrame(frame(),t));updateTransport();
  }
  function tick(ts){if(!playing)return;time+=(ts-lastTick)/1000*speed;lastTick=ts;if(time>=total()){if(loop)time=0;else{time=total();showTime();stop();return;}}showTime();raf=requestAnimationFrame(tick);}
  function togglePlay(){if(playing){stop();return;}drawing=null;selected=null;if(time>=total())time=0;playing=true;$('#play-button').innerHTML=icon('pause');$('#play-button').setAttribute('aria-label','Pause animation');lastTick=performance.now();raf=requestAnimationFrame(tick);}
  $('#play-button').onclick=togglePlay;$('#restart').onclick=()=>setFrame(0);
  $('#share-play').onclick=()=>{stop();window.CourtShareUI.open(play);};
  $('#seek').oninput=()=>{stop();selected=null;time=Number($('#seek').value)/1000*total();showTime();};
  $('#speed').onchange=()=>speed=Number($('#speed').value);
  $('#loop').onclick=()=>{loop=!loop;$('#loop').setAttribute('aria-pressed',loop);};
  function showNew(){if(library.length>=150)return toast('Maximum 150 plays. Export a backup before removing any.');$('#new-name').value='';$('#new-dialog').showModal();}
  ['#new-play','#sidebar-new','#open-templates'].forEach(s=>$(s).onclick=showNew);
  $('#library-nav').onclick=()=>$('#library-list').scrollIntoView({behavior:'smooth',block:'nearest'});
  $('.brand').onclick=e=>{e.preventDefault();setFrame(0);};
  ['#help-button','#help-inline'].forEach(s=>$(s).onclick=()=>$('#help-dialog').showModal());
  $$('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  $('#new-form').onsubmit=e=>{e.preventDefault();const template=$('input[name=template]:checked').value,p=M.createPlay(template,$('#new-name').value.trim()||'Untitled play');library.push(p);selectPlay(p.id);save();$('#new-dialog').close();chooseTool('select');toast('Your new play is ready.');};
  $('#label-form').onsubmit=e=>{e.preventDefault();const text=$('#label-input').value.trim();if(!text)return;if((frame().labels||[]).length>=50){toast('Maximum 50 labels per step.');return;}mutate(()=>{frame().labels||=[];frame().labels.push({id:M.uid(),text,...pendingLabel});});$('#label-dialog').close();chooseTool('select');};
  $('#delete-play').onclick=()=>{$('#confirm-title').textContent='Delete this play?';$('#confirm-copy').textContent=`“${play.name}” will be removed from this browser. You can restore it with the Restore button shown afterwards.`;$('#confirm-action').textContent='Delete play';$('#confirm-dialog').showModal();};
  let deletedPlay=null;
  $('#confirm-action').onclick=()=>{deletedPlay=M.clone(play);library=library.filter(p=>p.id!==play.id);if(!library.length)library=[M.createPlay('5-out')];selectPlay(library[0].id);save();$('#confirm-dialog').close();$('#toast').innerHTML='Play deleted. <button id="restore-play">Restore</button>';$('#toast').classList.add('visible');clearTimeout(toastTimer);$('#restore-play').onclick=()=>{library.push(deletedPlay);selectPlay(deletedPlay.id);deletedPlay=null;save();toast('Play restored.');};};
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  const fileName=name=>(name||'play').replace(/[^a-z0-9_-]+/gi,'-').toLowerCase().replace(/^-|-$/g,'')||'play';
  const backup=plays=>({app:'Courtside',version:1,exportedAt:new Date().toISOString(),plays});
  function exportJson(plays,name){download(new Blob([JSON.stringify(backup(plays),null,2)],{type:'application/json'}),name);$('.export-menu').open=false;toast('Backup exported. Import it on any device running Courtside.');}
  $('#export-play').onclick=()=>exportJson([play],fileName(play.name)+'.json');$('#export-all').onclick=()=>exportJson(library,'courtside-playbook.json');
  $('#import-button').onclick=()=>$('#file-input').click();
  $('#file-input').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{if(file.size>3*1024*1024)throw Error('The file is too large (maximum 3 MB).');const raw=JSON.parse(await file.text());const list=raw.plays||(raw.frames?[raw]:null);if(!Array.isArray(list)||!list.length||list.length>100)throw Error('Choose a Courtside play or playbook JSON file.');if(library.length+list.length>150)throw Error('The playbook can hold up to 150 plays.');const clean=list.map(p=>M.validatePlay(p));clean.forEach(p=>{p.id=M.uid();library.push(p);});selectPlay(clean[0].id);save();toast(`Imported ${clean.length} play${clean.length===1?'':'s'}. Existing plays kept.`);}
    catch(error){toast('Import failed: '+error.message);}finally{e.target.value='';}
  };
  $('#export-png').onclick=()=>{
    stop();const h=play.court==='full'?1128:620,svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${(h+90)*2}" viewBox="0 0 600 ${h+90}"><rect width="600" height="${h+90}" fill="#f5f4f0"/><text x="26" y="32" fill="#172b35" font-family="system-ui,sans-serif" font-size="21" font-weight="700">${esc(play.name.slice(0,43))}</text><text x="26" y="56" fill="#657575" font-family="system-ui,sans-serif" font-size="13">Step ${current+1}: ${esc(frame().name.slice(0,65))}</text><g transform="translate(0 80)">${renderSvg(frame(),{prefix:'export',mini:true})}</g></svg>`;
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),img=new Image();
    img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=(h+90)*2;canvas.getContext('2d').drawImage(img,0,0);URL.revokeObjectURL(url);canvas.toBlob(blob=>{if(blob){download(blob,`${fileName(play.name)}-step-${current+1}.png`);toast('Court image exported.');}else toast('Could not export this image.');},'image/png');};img.onerror=()=>{URL.revokeObjectURL(url);toast('Could not export this image. Try Print instead.');};img.src=url;$('.export-menu').open=false;
  };
  $('#print-play').onclick=()=>{stop();$('#print-area').innerHTML=`<h1>${esc(play.name)}</h1><p>${esc(play.category)} · ${play.frames.length} steps · Courtside</p>`+play.frames.map((f,i)=>`<section class="print-step"><h2>${i+1}. ${esc(f.name)} <small>(${f.duration}s)</small></h2><svg viewBox="0 0 600 ${play.court==='full'?1128:620}">${renderSvg(f,{prefix:'print'+i,mini:true})}</svg><p>${esc(f.notes).replace(/\n/g,'<br>')}</p></section>`).join('');$('.export-menu').open=false;window.print();};
  document.addEventListener('keydown',e=>{
    const editing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable;if($$('dialog[open]').length)return;
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!editing){e.preventDefault();e.shiftKey?redo():undo();return;}
    if(editing)return;
    if(e.key==='Escape'){if(pointer?.before){const old=JSON.parse(pointer.before);library[library.indexOf(play)]=old;play=old;}drawing=null;pointer=null;selected=null;chooseTool('select');selectionPanel();return;}
    if(e.key===' '){e.preventDefault();togglePlay();return;}
    if(e.key==='Delete'||e.key==='Backspace'){if(selected){e.preventDefault();deleteSelection();}return;}
    if(e.key.startsWith('Arrow')){
      const focused=e.target.closest('[data-player]');if(focused)selected={type:'player',id:focused.dataset.player};
      if(selected?.type==='player'){e.preventDefault();const id=selected.id;mutate(()=>{const p=frame().players.find(p=>p.id===id),step=e.shiftKey?15:3;p.x=Math.max(30,Math.min(570,p.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)));p.y=Math.max(30,Math.min(play.court==='full'?1098:590,p.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)));frame().actions.forEach(a=>{if(a.playerId===id)a.from={x:p.x,y:p.y};if(a.targetId===id)a.to={x:p.x,y:p.y};});});$(`[data-player="${CSS.escape(id)}"]`)?.focus();}return;
    }
    const shortcuts={v:'select',c:'move',d:'dribble',p:'pass',s:'screen',t:'text',e:'erase'};if(shortcuts[e.key.toLowerCase()]&&!e.metaKey&&!e.ctrlKey)chooseTool(shortcuts[e.key.toLowerCase()]);
  });
  render();if(loadWarning)toast(loadWarning);else save();
})();
