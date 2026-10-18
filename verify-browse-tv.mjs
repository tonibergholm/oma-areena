import fs from 'node:fs';
import assert from 'node:assert/strict';
const tab=(await(await fetch('http://127.0.0.1:9223/json')).json()).find(t=>t.title==='Oma Areena');assert(tab);
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
async function evaluate(expression){const id=++seq;const m=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Inspector timeout')),20000);pending.set(id,m=>{clearTimeout(t);resolve(m);});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});assert(!m.error,JSON.stringify(m.error));assert(!m.result.exceptionDetails,JSON.stringify(m.result.exceptionDetails));return m.result.result.value;}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const key=k=>evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown',{keyCode:${k},which:${k},bubbles:true}));true`);
async function until(expr,pred,timeout=30000){const start=Date.now();let v;do{v=await evaluate(`(()=>{try{return (${expr});}catch(e){return null;}})()`);if(v!==null&&pred(v))return v;await delay(400);}while(Date.now()-start<timeout);throw Error('Condition failed '+expr+' value '+JSON.stringify(v));}
const report={version:'0.3.2',started:new Date().toISOString(),checks:[]};const pass=(name,evidence)=>{report.checks.push({name,evidence});console.log('PASS',name,JSON.stringify(evidence));};
async function type(query){for(const c of query)await evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(c)},keyCode:${c.toUpperCase().charCodeAt(0)},bubbles:true}));true`);}
try{
 await until(`({cards:document.querySelectorAll('.card').length,version:pocState.version})`,v=>v.cards>=3&&v.version==='0.3.2');
 await evaluate(`document.getElementById('nav-browse').click();true`);
 const cats=await until(`Array.from(document.querySelectorAll('#categories button')).map(b=>b.textContent)`,v=>v.length>5);pass('Remote navigation opens live categories',{count:cats.length,first:cats.slice(0,5)});
 await key(13);let results=await until(`Array.from(document.querySelectorAll('.browse-card')).map(b=>b.textContent)`,v=>v.length>0);pass('Category loads live results',{count:results.length,first:results[0]});
 const bounds=await evaluate(`({height:innerHeight,gridBottom:document.getElementById('browse-grid').getBoundingClientRect().bottom,pagerBottom:document.getElementById('browse-pager').getBoundingClientRect().bottom})`);assert.equal(bounds.height,1080);assert(bounds.pagerBottom<=bounds.height);pass('Browse layout fits TV',bounds);
 const firstPage=await evaluate(`document.getElementById('browse-status').textContent`);
 if(await evaluate(`document.getElementById('browse-pager').children.length>0`)){
  await key(40);await key(40);await key(40);await key(13);
  const second=await until(`document.getElementById('browse-status').textContent`,v=>v!==firstPage&&v.includes('13–'));pass('Remote next-page navigation',{status:second});
 }
 await key(10009);await evaluate(`document.getElementById('nav-search').click();true`);
 await until(`!document.getElementById('search-panel').classList.contains('hidden')`,v=>v===true);
 await key(13);assert.equal(await evaluate(`document.getElementById('query-text').textContent`),'A');await key(8);assert.equal(await evaluate(`document.getElementById('query-text').textContent`),'Kirjoita hakusana');pass('Remote keyboard and backspace',{ok:true});
 await evaluate(`document.querySelector('#keyboard button[data-character="Ä"]').click();true`);assert.equal(await evaluate(`document.getElementById('query-text').textContent`),'Ä');await key(8);pass('Finnish keyboard characters',{character:'Ä'});await evaluate(`document.querySelector('#keyboard button[data-character="1"]').click();true`);assert.equal(await evaluate(`document.getElementById('query-text').textContent`),'1');await key(8);pass('Numeric on-screen search input',{character:'1'});
 await type('Kovan viikon ilta');await key(13);
 results=await until(`Array.from(document.querySelectorAll('.browse-card')).map(b=>({id:b.dataset.programId,title:b.querySelector('strong').textContent}))`,v=>v.length>0);assert(results.some(r=>r.title.includes('Kovan viikon ilta')));pass('Live programme search',{results:results.length,first:results[0]});
 await key(13);await until(`document.querySelectorAll('#season-episodes .episode').length`,v=>v>0);await key(40);await key(13);const playback=await until(`({state:webapis.avplay.getState(),time:webapis.avplay.getCurrentTime(),title:document.getElementById('playing-title').textContent})`,v=>v.state==='PLAYING'&&v.time>1000);assert(playback.title.includes('Kovan viikon ilta'));pass('Search result plays through app',playback);
 await key(10009);assert.equal(await evaluate(`seriesPanel.isActive()`),true);await key(10009);assert.equal(await evaluate(`document.getElementById('browser').classList.contains('hidden')`),false);assert((await evaluate(`document.getElementById('browse-status').textContent`)).includes('Kovan viikon ilta'));pass('Back restores search results',{ok:true});
 await key(10009);await evaluate(`document.querySelector('#keyboard button[data-character="Tyhjennä"]').click();true`);await type('zzzxqwepoiulkj987654321');await key(13);
 const empty=await until(`document.getElementById('browse-status').textContent`,v=>v.includes('Ei tuloksia'));pass('Empty search has clear recovery',{message:empty});
 await key(10009);
 const errors=await evaluate(`pocEvents.filter(e=>e.event==='error'||e.event==='js-error')`);assert.equal(errors.length,0,JSON.stringify(errors));pass('No app runtime errors',{count:errors.length});report.complete=true;
}catch(e){report.complete=false;report.error=String(e);console.error(e);process.exitCode=1;}finally{report.finished=new Date().toISOString();fs.mkdirSync(new URL('./data/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('./data/browse-verification.json',import.meta.url),JSON.stringify(report,null,2));ws.close();}
