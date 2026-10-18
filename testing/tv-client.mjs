import assert from 'node:assert/strict';
export const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function connect(){
 const tabs=await(await fetch('http://127.0.0.1:9223/json')).json();const tab=tabs.find(t=>t.title==='Oma Areena');assert(tab,'Oma Areena inspector missing');
 const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});let seq=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
 async function evaluate(expression){const id=++seq;const m=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Inspector timeout'));},30000);pending.set(id,m=>{clearTimeout(timer);resolve(m);});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});assert(!m.error,JSON.stringify(m.error));assert(!m.result.exceptionDetails,JSON.stringify(m.result.exceptionDetails));return m.result.result.value;}
 async function until(expression,predicate,timeout=30000){const start=Date.now();let value;do{value=await evaluate(`(()=>{try{return (${expression});}catch(e){return null;}})()`);if(value!==null&&predicate(value))return value;await delay(350);}while(Date.now()-start<timeout);throw Error('Condition failed: '+expression+' value '+JSON.stringify(value));}
 const key=k=>evaluate(`document.body.dispatchEvent(new KeyboardEvent('keydown',{keyCode:${k},which:${k},bubbles:true}));true`);
 return {evaluate,until,key,close:()=>ws.close()};
}
