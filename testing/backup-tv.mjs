import fs from 'node:fs';
import {connect} from './tv-client.mjs';
const tv=await connect();
try{const data=await tv.evaluate(`JSON.stringify(Object.fromEntries(Array.from({length:localStorage.length},(_,i)=>{var key=localStorage.key(i);return [key,localStorage.getItem(key)];})))`);fs.mkdirSync(new URL('../data/',import.meta.url),{recursive:true});const path=new URL('../data/library-backup-'+Date.now()+'.json',import.meta.url);fs.writeFileSync(path,data,{mode:0o600});console.log('Viewing-state backup saved:',path.pathname);}finally{tv.close();}
