import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),cfg=JSON.parse(fs.readFileSync(path.join(root,'workbench.json'))),base=`http://127.0.0.1:${cfg.port}`;
const [command,...args]=process.argv.slice(2),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){try{const r=await fetch(base+'/health');const h=await r.json();if(h.app!=='yingke-desktop-v1')throw Error('Port occupied');return h;}catch(e){if(!e.cause)throw e;}
 const logFile=path.join(root,'data');fs.mkdirSync(logFile,{recursive:true});const log=fs.openSync(path.join(logFile,'gateway.log'),'a');const p=spawn(process.execPath,[path.join(root,'gateway.mjs')],{cwd:root,windowsHide:true,detached:true,stdio:['ignore',log,log]});p.unref();fs.closeSync(log);
 for(let i=0;i<120;i++){try{const h=await(await fetch(base+'/health')).json();if(h.error)throw Error(h.error);if(h.ready)return h;}catch(e){if(!e.cause)throw e;}await sleep(250);}throw Error('Startup timeout');
}
async function main(){try{
 if(['--help','help',undefined].includes(command)){console.log('Commands: start, status, assets, jobs, download <url>, transcribe <path> [--diarize] [--speakers N], subtitles <id>, export <id> --output <path> [--format srt|vtt|txt|csv|json]');return;}
 if(command==='start'){console.log(JSON.stringify(await start(),null,2));return;}
 const token=fs.readFileSync(path.join(root,'data/agent-token.txt'),'utf8').trim();
 const request=async(route,body)=>{const r=await fetch(base+'/agent/v1/'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(await r.text());return r;};
 let route=command,body;
 const value=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
 if(command==='download')body={links:args[0],quality:'best',audio:true,poster:true};
 else if(command==='transcribe')body={inputs:[path.resolve(args[0])],language:value('--language')||'auto',model:'small',diarize:args.includes('--diarize'),speakerCount:Number(value('--speakers')||0)};
 else if(command==='export'){const out=value('--output');if(!out)throw Error('export requires --output <file>');route='export?'+new URLSearchParams({id:args[0],ext:value('--format')||'srt',timestamps:!args.includes('--no-timestamps'),speakers:!args.includes('--no-speakers')});const r=await request(route);const target=path.resolve(out);fs.writeFileSync(target,Buffer.from(await r.arrayBuffer()),{flag:'wx'});console.log(JSON.stringify({saved:target}));return;}
 else if(command==='subtitles')route='subtitles?id='+encodeURIComponent(args[0]);
 else if(!['status','assets','jobs'].includes(command))throw Error('Commands: start, status, assets, jobs, download <url>, transcribe <path> [--diarize] [--speakers N], subtitles <id>, export <id> --output <path> [--format srt|vtt|txt|csv|json]');
 console.log(JSON.stringify(await(await request(route,body)).json(),null,2));
}catch(e){console.error(e.message);process.exitCode=1;}

}
await main();
