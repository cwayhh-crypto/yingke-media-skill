import {spawn} from 'node:child_process';
import path from 'node:path';
export function createRunner({cwd,env,log=()=>{},kill=p=>p.kill(),setActive=()=>{},clearActive=()=>{}}){
 return (exe,args,{job,onLine,timeout=0}={})=>new Promise((resolve,reject)=>{
  const started=Date.now(),name=path.basename(exe);let out='',err='',pending='',epending='',timedOut=false;
  const record=s=>{if(job)log(job,s);};
  record(`[process] Starting ${name}`);
  const p=spawn(exe,args,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  if(job)setActive(job,p);
  const line=s=>{s=s.trim();if(s){record(s);onLine?.(s);}};
  p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');
  p.stdout.on('data',s=>{out=(out+s).slice(-200000);pending+=s;const a=pending.split(/[\r\n]+/);pending=a.pop();a.forEach(line);});
  p.stderr.on('data',s=>{err=(err+s).slice(-15000);epending+=s;const a=epending.split(/[\r\n]+/);epending=a.pop();a.forEach(line);});
  const timer=timeout?setTimeout(()=>{timedOut=true;kill(p);},timeout):null;
  p.on('error',e=>{clearTimeout(timer);clearActive(p);record(`[process] ${name} failed to start: ${e.code||e.message}`);reject(e);});
  p.on('close',(code,signal)=>{
   clearTimeout(timer);clearActive(p);if(pending)line(pending);if(epending)line(epending);
   const detail=`${name}: exit=${code}, signal=${signal||'none'}, stdout=${out.length}, stderr=${err.length}, elapsed=${Date.now()-started}ms`;
   record('[process] '+detail);
   if(timedOut)reject(Error('Process timed out: '+detail));
   else if(job?.status==='cancelled')reject(Error('已取消'));
   else if(code!==0)reject(Error((err.trim()||out.trim()).slice(-1800)||detail));
   else resolve(out);
  });
 });
}
