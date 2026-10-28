import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const base='http://127.0.0.1:48621';
const html=await(await fetch(base)).text();const token=html.match(/const TOKEN='([a-f0-9]+)'/)?.[1];
if(!token)throw Error('Service is not ready');
const headers={'X-Session-Token':token,'Content-Type':'application/json'};
const state=await(await fetch(base+'/api/state',{headers})).json();
if(state.network?.status==='restricted')throw Error('This server still has no network permission');
const job=[...state.jobs].reverse().find(j=>j.status==='failed'&&j.kind==='download'&&/^(https?:\/\/)(www\.|v\.)?douyin\.com\//i.test(j.url));
if(!job){console.log('No failed Douyin task.');process.exit(0);}
const result=await fetch(base+'/api/retry',{method:'POST',headers,body:JSON.stringify({id:job.id})});
if(!result.ok)throw Error((await result.json()).error);
console.log('Retry submitted. The result will appear in the workbench.');
