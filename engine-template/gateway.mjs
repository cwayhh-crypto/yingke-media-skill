import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const config=JSON.parse(fs.readFileSync(path.join(ROOT,'workbench.json'),'utf8'));
const project=path.resolve(ROOT,config.projectRoot),port=Number(process.env.DESKTOP_PORT||config.port||48623);
const token=crypto.randomBytes(24).toString('hex'),cookieName='yingke_desktop';
const services={download:{port:config.downloadPort||48621,folder:'video-tool',marker:'REFERENCE TO CREATION'},subtitles:{port:config.subtitlePort||48622,folder:'subtitle-tool',marker:'export-timestamps'}};
const data=path.join(ROOT,'data');fs.mkdirSync(data,{recursive:true});
const agentTokenFile=path.join(data,'agent-token.txt');
if(!fs.existsSync(agentTokenFile))fs.writeFileSync(agentTokenFile,crypto.randomBytes(32).toString('hex'),{mode:0o600});
const agentToken=fs.readFileSync(agentTokenFile,'utf8').trim();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const origin=`http://127.0.0.1:${port}`;
async function connect(s){
 const r=await fetch(`http://127.0.0.1:${s.port}/`,{signal:AbortSignal.timeout(1500)});const html=await r.text();
 if(!r.ok||!html.includes(s.marker))throw Error(`端口 ${s.port} 已被其他程序占用`);
 s.token=html.match(/const TOKEN='([a-f0-9]+)'/)?.[1];if(!s.token)throw Error('无法识别工作台会话');
 if(config.portable){const status=await api(s,'/api/state');if(path.resolve(status.instanceRoot||'.')!==path.join(project,s.folder))throw Error(`端口 ${s.port} 属于另一份工作台，请退出另一份后再启动。`);}
 return true;
}
async function api(s,route,body){
 const r=await fetch(`http://127.0.0.1:${s.port}${route}`,{method:body?'POST':'GET',headers:{'X-Session-Token':s.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(6000)});
 const value=await r.json();if(!r.ok)throw Error(value.error||'服务请求失败');return value;
}
async function ensure(s){
 try{await connect(s);return;}catch(e){if(!e.cause?.code&&!/fetch failed|timeout/i.test(e.message))throw e;}
 const entry=path.join(project,s.folder,'server.mjs');if(!fs.existsSync(entry))throw Error('找不到工作台：'+entry);
 const log=fs.openSync(path.join(data,s.folder+'.log'),'a');
 const pythonCandidates=[path.join(ROOT,'runtime/python/python.exe'),path.join(ROOT,'runtime/python/Scripts/python.exe')];
 const portable=config.portable?{YINGKE_PYTHON:pythonCandidates.find(fs.existsSync)||pythonCandidates[0],YINGKE_BIN:path.join(ROOT,'bin'),YINGKE_MODELS:path.join(ROOT,'models'),YINGKE_PORTABLE:'1',YINGKE_APP_ROOT:ROOT}:{};
 s.child=spawn(process.execPath,[entry],{cwd:path.dirname(entry),windowsHide:true,detached:true,stdio:['ignore',log,log],env:{...process.env,...portable,PORT:String(s.port)}});
 s.child.on('error',e=>{s.error=e.message;});s.child.unref();fs.closeSync(log);
 for(let n=0;n<80;n++){if(s.error)throw Error(s.error);try{await connect(s);s.owned=true;return;}catch{}await delay(250);}
 throw Error('工作台启动超时，请查看 data 日志：'+s.folder);
}
let ready=false,startError='';
async function start(){try{await Promise.all(Object.values(services).map(ensure));ready=true;}catch(e){startError=e.message;}}
function authorized(req){return req.headers['x-session-token']===token||(req.method==='GET'&&(req.headers.cookie||'').split(';').some(x=>x.trim()===cookieName+'='+token));}
async function body(req){let text='';for await(const c of req){text+=c;if(text.length>65536)throw Error('请求过大');}return JSON.parse(text||'{}');}
async function state(){const [download,subtitles]=await Promise.all(Object.values(services).map(s=>api(s,'/api/state')));return {download,subtitles};}
function assets(download){
 const seen=new Set(),items=[];
 for(const j of [...download.jobs].reverse())for(const file of [...(j.files||[]),...(j.input?[j.input]:[])]){
  if(seen.has(file)||!fs.existsSync(file)||!fs.statSync(file).isFile())continue;
  const ext=path.extname(file).toLowerCase(),kind=/^\.(mp4|mkv|webm|mov|avi|flv|m4v|ts)$/.test(ext)?'video':/^\.(mp3|wav|m4a|aac|flac|ogg|opus)$/.test(ext)?'audio':/^\.(jpg|jpeg|png|webp|avif)$/.test(ext)?'poster':null;
  if(!kind)continue;seen.add(file);items.push({id:crypto.createHash('sha256').update(file).digest('hex'),jobId:j.id,name:path.basename(file),path:file,kind,size:fs.statSync(file).size});
 }return items;
}
function page(html,key){
 html=html.replaceAll('/api/',`/${key}/api/`).replace(/http:\/\/127\.0\.0\.1:4862[12]\/?/g,'/').replaceAll('Start.cmd','Yingke.exe');
 const style=key==='download'?'.shell{display:block}aside{display:none}.main{max-width:1450px;padding:24px 30px}.top{display:none}#shutdown{display:none}.tab[data-tab="transcribe"]{display:none}':'.top,.hero,.footer a{display:none}.wrap{padding:24px 28px}.layout{grid-template-columns:330px minmax(0,1fr)}';
 const bridge=key==='download'?`
 const oldRender=render;render=function(){oldRender();const cards=[...document.querySelectorAll('#jobs .job')];[...state.jobs].reverse().forEach((j,i)=>{const f=(j.files||[]).find(f=>/\\.(mp4|mkv|webm|mov|avi|m4v|ts|mp3|m4a|wav|flac|ogg|opus)$/i.test(f))||j.input;const a=cards[i]?.querySelector('.actions');if(f&&j.status==='done'&&a&&!a.querySelector('[data-send-subtitles]')){const b=button('生成 / 编辑字幕',()=>parent.postMessage({type:'yingke-subtitle',path:f},location.origin));b.dataset.sendSubtitles='true';a.prepend(b);}});};renderKey='';refresh();
 document.querySelector('[data-tab="transcribe"]').onclick=()=>parent.postMessage({type:'yingke-tab',tab:'subtitles'},location.origin);
 `:`
 window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='yingke-select'||typeof e.data.path!=='string')return;chosen=[];el('files').value='';el('paths').value=e.data.path;el('selected').textContent=e.data.path.split(/[\\\\/]/).pop();el('paths').closest('details')?.setAttribute('open','');window.scrollTo(0,0);toast('素材已就绪，请选择识别选项后开始');});
 window.yingkeHasUnsaved=()=>dirty;
 document.addEventListener('click',e=>{const a=e.target.closest('a[download]');if(!a||!parent.chrome?.webview)return;const u=new URL(a.href);if(u.pathname!=='/subtitles/api/file')return;e.preventDefault();const job=state.jobs.find(j=>j.id===u.searchParams.get('id'));parent.postMessage({type:'yingke-save',url:u.pathname+u.search,name:(job?.exportBase||'字幕')+'.'+u.searchParams.get('ext')},location.origin);},true);
 `;
 return html.replace('</head>',`<style>${style}</style></head>`).replace('</body>',`<script>${bridge}</script></body>`);
}
function proxy(req,res,key,route){
 const s=services[key],headers={...req.headers,host:`127.0.0.1:${s.port}`};if(headers.origin)headers.origin=`http://127.0.0.1:${s.port}`;
 if(headers['x-session-token']===token||headers.authorization==='Bearer '+agentToken)headers['x-session-token']=s.token;
 delete headers.authorization;
 const upstream=http.request({host:'127.0.0.1',port:s.port,path:route,method:req.method,headers},r=>{
  const h={...r.headers};delete h['transfer-encoding'];
  if(route==='/'&&req.method==='GET'){
   let html='';r.setEncoding('utf8');r.on('data',c=>html+=c);r.on('end',()=>{
    h['x-frame-options']='SAMEORIGIN';h['content-security-policy']=String(h['content-security-policy']||'').replace("frame-ancestors 'none'","frame-ancestors 'self'");
    if(h['set-cookie'])h['set-cookie']=h['set-cookie'].map(c=>c.replace('Path=/','Path=/'+key+'/'));
    delete h['content-length'];res.writeHead(r.statusCode,h);res.end(page(html,key));
   });
  }else{res.writeHead(r.statusCode,h);r.pipe(res);}
 });upstream.on('error',()=>{if(!res.headersSent)json(res,502,{error:'本地模块暂未连接，请重新打开客户端'});else res.destroy();});req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);
}
const server=http.createServer(async(req,res)=>{try{
 if(req.headers.host!==`127.0.0.1:${port}`)return json(res,403,{error:'Host 不匹配'});
 if(req.headers.origin&&req.headers.origin!==origin)return json(res,403,{error:'不允许跨站请求'});
 const u=new URL(req.url,origin);
 if(req.method==='GET'&&u.pathname==='/health')return json(res,200,{app:'yingke-desktop-v1',version:'3.0.0',instanceRoot:ROOT,ready,error:startError});
 if(u.pathname.startsWith('/agent/v1/')){
  if(req.headers.authorization!=='Bearer '+agentToken)return json(res,401,{error:'需要本机 data/agent-token.txt 中的 Bearer Token'});
  if(!ready)return json(res,503,{error:startError||'模块正在启动'});
  const route=u.pathname.slice('/agent/v1/'.length);if(req.method==='POST'&&route==='login')return json(res,200,await api(services.download,'/api/session/login',await body(req)));
  if(req.method==='GET'&&route==='status'){const s=await state();return json(res,200,{ready,download:s.download.tools,network:s.download.network,transcription:{ready:s.subtitles.ready,models:s.subtitles.models,diarization:s.subtitles.diarization}});}
  if(req.method==='GET'&&route==='assets')return json(res,200,{files:assets(await api(services.download,'/api/state'))});
  if(req.method==='GET'&&route==='jobs'){const s=await state();return json(res,200,{download:s.download.jobs,subtitles:s.subtitles.jobs});}
  if(req.method==='POST'&&route==='download'){const b=await body(req);return json(res,200,await api(services.download,'/api/jobs',{...b,kind:'download'}));}
  if(req.method==='POST'&&route==='transcribe')return json(res,200,await api(services.subtitles,'/api/jobs',await body(req)));
  if(req.method==='GET'&&route==='subtitles')return json(res,200,await api(services.subtitles,'/api/result?'+u.searchParams));
  if(req.method==='GET'&&route==='export')return proxy(req,res,'subtitles','/api/file?'+u.searchParams);
  return json(res,404,{error:'未知 Agent 接口'});
 }
 if(req.method==='GET'&&u.pathname==='/'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Set-Cookie':`${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`,'X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; connect-src 'self'; frame-ancestors 'none'"});return res.end(fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace('__SESSION_TOKEN__',token));
 }
 const proxyRoute=u.pathname.match(/^\/(download|subtitles)(\/.*)$/);
 const proxySession=proxyRoute&&(req.headers.cookie||'').split(';').some(x=>x.trim()===cookieName+'='+token);
 if(!authorized(req)&&!proxySession)return json(res,403,{error:'请重新打开客户端'});
 if(!ready)return json(res,503,{error:startError||'模块正在启动'});
 const match=u.pathname.match(/^\/(download|subtitles)(\/.*)$/);
 if(match)return proxy(req,res,match[1],match[2]+u.search);
 if(req.method==='GET'&&u.pathname==='/api/overview'){
  const s=await state(),files=assets(s.download);return json(res,200,{files,download:s.download,subtitles:s.subtitles,busy:[...s.download.jobs,...s.subtitles.jobs].filter(j=>['queued','running'].includes(j.status)).length+(s.download.appSession?.running?1:0)});
 }
 if(req.method==='GET'&&u.pathname==='/api/asset'){
  const d=await api(services.download,'/api/state'),item=assets(d).find(x=>x.id===u.searchParams.get('id'));if(!item)return json(res,404,{error:'素材已移动或不存在'});
  const type={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.avif':'image/avif'}[path.extname(item.path).toLowerCase()]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':type,'Content-Length':item.size,'X-Content-Type-Options':'nosniff',...(item.kind!=='poster'?{'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(item.name)}:{})});return fs.createReadStream(item.path).pipe(res);
 }
 if(req.method==='POST'&&u.pathname==='/api/open'){
  const b=await body(req);return json(res,200,await api(services.download,'/api/open',b.id?{id:b.id}:{}));
 }
 if(req.method==='POST'&&u.pathname==='/api/exit'){
  const s=await state();if(s.download.appSession?.running)return json(res,409,{error:'请先关闭网站登录窗口'});if([...s.download.jobs,...s.subtitles.jobs].some(j=>['queued','running'].includes(j.status)))return json(res,409,{error:'还有任务正在运行'});
  for(const service of Object.values(services))if(service.owned)await api(service,'/api/shutdown',{});
  json(res,200,{ok:true});setTimeout(()=>server.close(()=>process.exit(0)),100);return;
 }
 json(res,404,{error:'未找到'});
}catch(e){if(!res.headersSent)json(res,400,{error:e.message});else res.destroy();}});
server.listen(port,'127.0.0.1',()=>{fs.writeFileSync(path.join(data,'server.json'),JSON.stringify({pid:process.pid,port}));console.log(origin);void start();});
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
