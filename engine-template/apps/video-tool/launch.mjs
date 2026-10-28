import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url)),url='http://127.0.0.1:48621';
async function page(){try{const r=await fetch(url,{signal:AbortSignal.timeout(1000)});const text=await r.text();return text.includes('REFERENCE TO CREATION')?text:null;}catch{return null;}}
// Preserve the execution environment's network restrictions. A normal user launch is required.
if(process.env.CODEX_SANDBOX_NETWORK_DISABLED==='1'){
 console.error('This execution environment disables network access. Start this application yourself using Start.cmd on your computer.');process.exit(1);
}
let html=await page();
if(html&&process.argv.includes('--restart')){
 const token=html.match(/const TOKEN='([a-f0-9]+)'/)?.[1];if(!token)throw Error('Cannot identify running service');
 const headers={'X-Session-Token':token,'Content-Type':'application/json'};
 const state=await(await fetch(url+'/api/state',{headers})).json();
 if(state.jobs.some(j=>['queued','running'].includes(j.status))){console.error('Tasks are running. Cancel or finish them before restarting.');process.exit(1);}
 await fetch(url+'/api/shutdown',{method:'POST',headers,body:'{}'});
 for(let i=0;i<40&&await page();i++)await new Promise(r=>setTimeout(r,250));
 if(await page())throw Error('Old service has not stopped');html=null;
}
if(!html){
 const data=path.join(root,'data');fs.mkdirSync(data,{recursive:true});const out=fs.openSync(path.join(data,'server.log'),'a');
 const p=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,windowsHide:true,detached:true,stdio:['ignore',out,out],env:{...process.env,PORT:'48621'}});p.on('error',e=>console.error(e.message));p.unref();fs.closeSync(out);
 for(let i=0;i<30&&!await page();i++)await new Promise(r=>setTimeout(r,300));
 if(!await page()){console.error('Unable to start. See data/server.log');process.exit(1);}
}
console.log('Video Workbench: '+url);
