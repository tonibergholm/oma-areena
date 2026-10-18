import fs from 'node:fs';
import {connect} from './tv-client.mjs';
if(!process.argv[2])throw Error('Pass a private viewing-state backup JSON file');
const saved=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const tv=await connect();
try{
 await tv.evaluate(`localStorage.clear();Object.entries(${JSON.stringify(saved)}).forEach(([k,v])=>localStorage.setItem(k,v));setTimeout(()=>location.reload(),500);true`);
 console.log('Original viewing state restored; reloading app.');
}finally{tv.close();}
