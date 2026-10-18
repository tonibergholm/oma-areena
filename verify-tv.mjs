import fs from 'node:fs';
import assert from 'node:assert/strict';
const tabs=await(await fetch('http://127.0.0.1:9223/json')).json();const tab=tabs.find(t=>t.title==='Oma Areena');assert(tab,'Oma Areena inspector');
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
async function evaluate(expression){const id=++seq;const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Inspector timeout')),20000);pending.set(id,m=>{clearTimeout(timer);resolve(m);});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});assert(!result.error,JSON.stringify(result.error));assert(!result.result.exceptionDetails,JSON.stringify(result.result.exceptionDetails));return result.result.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const key=k=>evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:${k},which:${k},bubbles:true}));true`);
async function until(expr,pred,timeout=20000){const start=Date.now();let v;do{v=await evaluate(`(()=>{try{return (${expr});}catch(e){return null;}})()`);if(v!==null&&pred(v))return v;await delay(400);}while(Date.now()-start<timeout);throw Error('Condition failed: '+expr+' value '+JSON.stringify(v));}
const report={version:'0.2.0',device:'QE55QN85AATXXH / Tizen 6.0',started:new Date().toISOString(),checks:[]};
const pass=(name,evidence)=>{report.checks.push({name,evidence});console.log('PASS',name,JSON.stringify(evidence));};
try{
 await evaluate(`if(document.body.classList.contains('playing')||!document.getElementById('episodes').classList.contains('hidden'))document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:10009,which:10009,bubbles:true}));true`);
 const initial=await until(`({version:window.pocState&&pocState.version,cards:document.querySelectorAll('.card').length,loaded:Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0),events:window.pocEvents})`,v=>v.cards===3&&v.loaded);
 assert.equal(initial.version,'0.2.0');pass('Standalone catalogue and artwork',{version:initial.version,cards:initial.cards,imagesLoaded:initial.loaded});
 for(const title of ['Elämäni Biisi','Kovan viikon ilta','Pasila']){
  for(let i=0;i<3;i++){if(await evaluate(`document.querySelector('.card.selected h3').textContent`)===title)break;await key(39);}
  assert.equal(await evaluate(`document.querySelector('.card.selected h3').textContent`),title);
  await key(13);
  const playback=await until(`({state:webapis.avplay.getState(),time:webapis.avplay.getCurrentTime(),title:document.getElementById('playing-title').textContent,tracks:webapis.avplay.getCurrentStreamInfo()})`,v=>v.state==='PLAYING'&&v.time>1500);
  assert(playback.title.includes(title));pass('Playback: '+title,playback);
  if(title==='Elämäni Biisi'){
   await key(13);assert.equal(await evaluate('webapis.avplay.getState()'),'PAUSED');
   const before=await evaluate('webapis.avplay.getCurrentTime()');await key(39);
   await until(`pocEvents.some(e=>e.event==='seek'&&e.data.time>=${before+8500})`,v=>v===true);await key(13);const after=await until('webapis.avplay.getCurrentTime()',v=>v>=before+8500);assert.equal(await evaluate('webapis.avplay.getState()'),'PLAYING');pass('Pause, +10s seek and continue',{before,after});
   await delay(1200);await key(10009);const stored=await evaluate(`JSON.parse(localStorage.getItem('progress:1-77998674'))`);assert(stored>10000);await key(13);
   const resumed=await until('webapis.avplay.getCurrentTime()',v=>v>=stored-1500);pass('Local resume after returning home',{stored,resumed});
  }
  if(title==='Kovan viikon ilta'){
   const subtitle=await until(`document.getElementById('subtitle').textContent`,v=>v.trim().length>2,30000);assert(!subtitle.includes('<br'));pass('Rendered subtitle cue',{text:subtitle});
   await key(40);assert.equal(await evaluate(`document.getElementById('player-status').textContent`),'Tekstitys pois');await key(40);assert.equal(await evaluate(`document.getElementById('player-status').textContent`),'Tekstitys päällä');pass('Subtitle toggle',{offAndOn:true});
  }
  await key(10009);
 }
 await key(40);const eps=await until(`Array.from(document.querySelectorAll('.episode')).map(e=>e.textContent)`,v=>v.length>=2);assert(eps[0].includes('Vasikka'));assert(eps[1].includes('Kiinalainen'));pass('Pasila episode browser',{count:eps.length,first:eps[0],second:eps[1]});
 await key(40);await key(13);const second=await until(`({state:webapis.avplay.getState(),time:webapis.avplay.getCurrentTime(),title:document.getElementById('playing-title').textContent})`,v=>v.state==='PLAYING'&&v.time>1000);assert(second.title.includes('Kiinalainen'));pass('Episode selection plays chosen episode',second);
 await key(10009);await key(38);assert.equal(await evaluate(`document.getElementById('play').classList.contains('action-selected')`),true);await key(39);assert.equal(await evaluate(`document.getElementById('restart').classList.contains('action-selected')`),true);await key(13);
 const restarted=await until('webapis.avplay.getCurrentTime()',v=>v>300&&v<5000);pass('Remote-accessible start over',{time:restarted});
 await evaluate('webapis.avplay.seekTo(webapis.avplay.getDuration()-2500);true');
 const next=await until(`({state:webapis.avplay.getState(),time:webapis.avplay.getCurrentTime(),title:document.getElementById('playing-title').textContent})`,v=>v.state==='PLAYING'&&v.time>1000&&v.title.includes('Kiinalainen'),20000);pass('Automatic next episode',next);await key(10009);
 const errors=await evaluate(`window.pocEvents.filter(e=>e.event==='error'||e.event==='js-error')`);assert.equal(errors.length,0,JSON.stringify(errors));
 const temp=await evaluate(`new Promise(resolve=>tizen.filesystem.resolve('wgt-private-tmp',d=>d.listFiles(files=>resolve(files.filter(f=>f.name.indexOf('areena-')===0).length),e=>resolve(String(e))),e=>resolve(String(e)),'r'))`);assert.equal(temp,0);pass('Temporary metadata files cleaned',{remaining:temp});
 assert.equal(await evaluate(`getComputedStyle(document.documentElement).backgroundColor`),'rgba(0, 0, 0, 0)');pass('Transparent video surface',{htmlBackground:'transparent'});
 pass('No app runtime errors',{errors:errors.length});
 report.complete=true;report.finished=new Date().toISOString();
}catch(e){report.complete=false;report.error=String(e);console.error(e);process.exitCode=1;}finally{fs.mkdirSync(new URL('./data/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('./data/verification.json',import.meta.url),JSON.stringify(report,null,2));ws.close();}
