import fs from 'node:fs';
const tabs=await (await fetch('http://127.0.0.1:9223/json')).json();
const tab=tabs.find(t=>t.title==='Oma Areena'); if(!tab)throw Error('PoC inspector missing');
const ws=new WebSocket(tab.webSocketDebuggerUrl); let seq=0; const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
async function call(method,params={}){const id=++seq;return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Inspector timeout'));},20000);pending.set(id,m=>{clearTimeout(timer);if(m.error)reject(Error(JSON.stringify(m.error)));else resolve(m.result);});ws.send(JSON.stringify({id,method,params}));});}
try{if(process.argv[2]==='screenshot'){const r=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.argv[3],Buffer.from(r.data,'base64'));console.log('Screenshot saved');}else{const r=await call('Runtime.evaluate',{expression:process.argv[2]||'JSON.stringify({title:document.title,body:document.body.innerText,webapis:typeof webapis})',returnByValue:true,awaitPromise:true});console.log(JSON.stringify(r,null,2));}}finally{ws.close();}
