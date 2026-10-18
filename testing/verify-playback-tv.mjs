import assert from 'node:assert/strict';
import {connect} from './tv-client.mjs';
const tv=await connect(),{evaluate:ev,until,key}=tv;
try{
 for(const [id,title] of [['1-77998674','Elämäni Biisi'],['1-77565920','Kovan viikon ilta'],['1-41272','Pasila']]){
  await ev(`openAreenaProgram('${id}',{restart:true});true`);
  const p=await until(`({state:webapis.avplay.getState(),time:webapis.avplay.getCurrentTime(),title:document.getElementById('playing-title').textContent})`,v=>v.state==='PLAYING'&&v.time>1000);
  assert(p.title.includes(title));console.log('PASS native playback',title);
  if(title==='Kovan viikon ilta'){
   const cue=await until(`document.getElementById('subtitle').textContent`,v=>v.trim().length>2);assert(!cue.includes('<br'));console.log('PASS subtitle rendering');
   await key(40);assert.equal(await ev(`document.getElementById('player-status').textContent`),'Tekstitys pois');await key(40);
  }
  await key(10009);
 }
 const errors=await ev(`pocEvents.filter(e=>e.event==='error'||e.event==='js-error')`);assert.equal(errors.length,0,JSON.stringify(errors));
 console.log('PASS all playback regressions');
}finally{tv.close();}
