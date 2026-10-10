(() => {
  'use strict';
  const M = window.CourtModel;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let play = null, current = -1, time = 0, speed = 1, loop = false, playing = false, showPaths = true, raf = 0, lastTick = 0;
  let offsets = [], length = 0;
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
  function renderSvg(f,state){
    let html=courtBase(play.court,'view');
    if(showPaths)html+=f.actions.map(a=>actionMarkup(a,'view')).join('');
    html+=f.labels.map(l=>{
      const words=l.text.split(/\s+/), lines=[''];
      const x=Math.min(460,Math.max(40,l.x)), width=Math.min(37,Math.floor((550-x)/8));
      for(const word of words){for(let offset=0;offset<word.length;offset+=width){const chunk=word.slice(offset,offset+width),at=lines.length-1;if(lines[at]&&(lines[at].length+chunk.length+1)>width)lines.push(chunk);else lines[at]+=(lines[at]?' ':'')+chunk;}}
      const y=Math.max(50,Math.min((play.court==='full'?1128:620)-lines.length*19-12,l.y));
      return `<g><rect x="${x-7}" y="${y-17}" width="${Math.min(510-x,Math.max(...lines.map(s=>s.length))*8+14)}" height="${lines.length*19+7}" rx="5" fill="#fffaf0" fill-opacity=".95"/><text x="${x}" y="${y}" fill="#233a43" font-size="14" font-family="system-ui,sans-serif">${lines.map((line,i)=>`<tspan x="${x}" dy="${i?19:0}">${esc(line)}</tspan>`).join('')}</text></g>`;
    }).join('');
    html+=state.players.map(p=>`<g transform="translate(${p.x} ${p.y})"><title>${p.team==='defense'?'Defender':'Player'} ${esc(p.label)}</title>${p.team==='defense'?'<rect x="-18" y="-18" width="36" height="36" rx="7" fill="#fffaf0" stroke="#a6624f" stroke-width="2.5"/><path d="m-11-11 22 22m0-22-22 22" stroke="#a6624f" stroke-opacity=".22" stroke-width="2"/>':'<circle r="21" fill="#223e48" stroke="#fffaf0" stroke-width="2.5"/>'}<text text-anchor="middle" dominant-baseline="central" fill="${p.team==='defense'?'#97533f':'#fffaf0'}" font-size="${Math.min(17,36/Math.max(1,p.label.length)*1.7)}" font-family="system-ui,sans-serif" font-weight="700">${esc(p.label)}</text></g>`).join('');
    let ball=state.ball;
    const owner=state.players.find(p=>p.id===state.ballOwner);
    if(owner)ball={x:owner.x+18,y:owner.y+17};
    if(ball)html+=`<g transform="translate(${ball.x} ${ball.y})"><title>Ball</title><circle r="9" fill="#ef8b4d" stroke="#fffaf0" stroke-width="2"/><path d="M-8 0H8M0-8V8M-5-6q8 6 0 12" stroke="#9a4f2b" stroke-width="1" fill="none"/></g>`;
    return html;
  }
  const formatTime=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
  function stop(){playing=false;cancelAnimationFrame(raf);$('#play').innerHTML='▶ <span>Play</span>';$('#play').setAttribute('aria-label','Play animation');}
  function showTime(){
    let index=play.frames.findIndex((f,i)=>time<offsets[i]+f.duration);
    if(index<0)index=play.frames.length-1;
    const f=play.frames[index],progress=Math.max(0,Math.min(1,(time-offsets[index])/f.duration));
    if(current!==index){
      current=index;
      document.querySelectorAll('.step-chip').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===current)));
      $('#step-number').textContent=`STEP ${current+1} OF ${play.frames.length}`;
      $('#step-title').textContent=f.name||`Step ${current+1}`;
      $('#step-notes').textContent=f.notes||'Watch the player positions and routes for this step.';
      $('#step-duration').textContent=`${formatTime(f.duration)} per step${f.motionDuration&&f.motionDuration<f.duration?` · ${formatTime(f.motionDuration)} movement + ${formatTime(f.duration-f.motionDuration)} reading time`:''}`;
      $('#expand-notes').hidden=(f.notes||'').length<220;
      $('#expand-notes').setAttribute('aria-expanded','false');$('#expand-notes').textContent='Show full notes';$('#step-notes').classList.toggle('notes-preview',(f.notes||'').length>=220);
      $('#court').setAttribute('aria-label',`${play.name}, step ${current+1}: ${f.name}. Offensive players are circles; defenders are squares.`);
    }
    const elapsed=time-offsets[index],motion=f.motionDuration||f.duration;
    const hold=motion<f.duration&&elapsed>=motion;
    $('#phase-label').textContent=hold?`Read & review · ${Math.max(0,Math.ceil(f.duration-elapsed))} sec`:'Movement';
    $('#phase-label').classList.toggle('reading',hold);
    $('#court').innerHTML=renderSvg(f,M.interpolateFrame(f,progress));
    $('#time-label').textContent=`${formatTime(time)} / ${formatTime(length)}`;
    $('#seek').value=String(Math.round(time/length*1000));
    $('#seek').setAttribute('aria-valuetext',`${formatTime(time)} of ${formatTime(length)}, step ${current+1}`);
  }
  function tick(ts){
    if(!playing)return;
    time+=(ts-lastTick)/1000*speed;lastTick=ts;
    if(time>=length){if(loop)time%=length;else{time=length;showTime();stop();return;}}
    showTime();raf=requestAnimationFrame(tick);
  }
  function toggle(){
    if(!play)return;
    if(playing){stop();return;}
    if(time>=length)time=0;
    playing=true;$('#play').innerHTML='Ⅱ <span>Pause</span>';$('#play').setAttribute('aria-label','Pause animation');lastTick=performance.now();raf=requestAnimationFrame(tick);
  }
  function setStep(i){stop();time=offsets[i];showTime();}
  function initialize(){
    document.title=`${play.name} · Courtside`;
    $('#play-title').textContent=play.name||'Shared play';
    $('#play-meta').textContent=`${play.category.toUpperCase()} · ${play.frames.length} STEP${play.frames.length===1?'':'S'}`;
    $('#court-kind').textContent=play.court==='full'?'FULL COURT':'HALF COURT';
    $('#court').setAttribute('viewBox',`0 0 600 ${play.court==='full'?1128:620}`);
    play.frames.forEach((f,i)=>{
      offsets.push(length);length+=f.duration;
      const button=document.createElement('button');button.className='step-chip';button.textContent=String(i+1).padStart(2,'0');
      button.setAttribute('aria-label',`Step ${i+1}: ${f.name}`);button.setAttribute('aria-pressed','false');button.onclick=()=>setStep(i);$('#steps').appendChild(button);
    });
    $('#play').onclick=toggle;
    $('#expand-notes').onclick=()=>{const open=$('#expand-notes').getAttribute('aria-expanded')!=='true';$('#expand-notes').setAttribute('aria-expanded',String(open));$('#expand-notes').textContent=open?'Show less':'Show full notes';$('#step-notes').classList.toggle('notes-preview',!open);};
    $('#restart').onclick=()=>setStep(0);
    $('#seek').oninput=()=>{stop();time=Number($('#seek').value)/1000*length;showTime();};
    $('#speed').onchange=()=>{const next=Number($('#speed').value);if([.5,1,1.5,2].includes(next))speed=next;};
    $('#loop').onclick=()=>{loop=!loop;$('#loop').setAttribute('aria-pressed',String(loop));};
    $('#paths').onclick=()=>{showPaths=!showPaths;$('#paths').setAttribute('aria-pressed',String(showPaths));showTime();};
    $('#download').onclick=()=>{
      const backup={app:'Courtside',version:1,exportedAt:new Date().toISOString(),plays:[play]};
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=(play.name.replace(/[^a-z0-9_-]+/gi,'-').toLowerCase().replace(/^-|-$/g,'')||'shared-play')+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
      $('#download-status').textContent='Play downloaded. Import this file into Courtside to make your own copy.';
    };
    document.addEventListener('keydown',e=>{if(e.key===' '&&!/INPUT|TEXTAREA|SELECT|BUTTON|A/.test(e.target.tagName)&&!e.target.isContentEditable){e.preventDefault();toggle();}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
    $('#loading').hidden=true;$('#viewer').hidden=false;showTime();
  }
  async function open(){
    try{
      let token=window.COURTSIDE_SHARED_PLAY_TOKEN;
      if(!token){if(location.hash.length>150000)throw Error('size');token=new URLSearchParams(location.hash.slice(1)).get('play');}
      if(typeof token!=='string'||!token||token.length>150000)throw Error('invalid');
      play=M.validatePlay(await window.CourtShare.decode(token));
      initialize();
    }catch(error){
      $('#loading').hidden=true;$('#viewer').hidden=true;$('#error').hidden=false;
      $('#error-copy').textContent='The link is missing, incomplete, too large, or uses an unsupported format. Ask your coach to send a fresh Courtside share link or shared play file.';
    }
  }
  open();
})();
