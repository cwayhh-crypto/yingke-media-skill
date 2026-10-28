import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
export const appRoot=path.resolve(process.env.YINGKE_APP_ROOT||path.join(here,'../..'));
const helper=path.join(appRoot,'YingkeLogin.exe'),registry=path.join(appRoot,'sites.json');
export const sessionAvailable=fs.existsSync(helper)&&fs.existsSync(registry);
export const loginState={running:false,message:''};
export function siteFor(value){
 const u=new URL(value);if(u.username||u.password||!(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname))))throw Error('登录地址必须是 HTTPS 视频网页');
 const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 const sites=fs.existsSync(registry)?JSON.parse(fs.readFileSync(registry,'utf8')):[];
 return sites.find(s=>s.domains.some(d=>host===d||host.endsWith('.'+d)))||{key:'site-'+crypto.createHash('sha256').update(host).digest('hex').slice(0,16),label:host,domains:[host]};
}
function sessionFile(site){return path.join(appRoot,'data/site-sessions',site.key,'session.bin');}
export function sessionSummary(){
 const dir=path.join(appRoot,'data/site-sessions');if(!fs.existsSync(dir))return [];
 return fs.readdirSync(dir).filter(n=>/^[a-z0-9-]+$/.test(n)).flatMap(key=>{try{const s=JSON.parse(fs.readFileSync(path.join(dir,key,'status.json'),'utf8'));return fs.existsSync(path.join(dir,key,'session.bin'))?[{key,label:s.label,savedAt:s.savedAt}]:[];}catch{return [];}});
}
function execute(args,{visible=false,timeout=15000}={}){return new Promise((resolve,reject)=>{
 const p=spawn(helper,args,{windowsHide:!visible,stdio:['ignore','pipe','ignore']});let out='';p.stdout.setEncoding('utf8');p.stdout.on('data',s=>{out+=s;if(out.length>2097152){p.kill();reject(Error('应用会话数据过大'));}});
 const timer=timeout?setTimeout(()=>{p.kill();reject(Error('应用会话处理超时'));},timeout):null;
 p.on('error',()=>{clearTimeout(timer);reject(Error('无法启动应用登录组件，请完整更新客户端'));});
 p.on('close',code=>{clearTimeout(timer);if(code===0)resolve(out.replace(/^\uFEFF/,''));else{const e=Error(code===10?'应用会话属于另一 Windows 用户或已损坏，请在 APP 内重新登录':code===77?'当前执行环境禁止联网，请在允许联网的普通桌面环境运行客户端':code===2?'已取消网站登录':'应用登录组件未完成操作，请重新打开登录窗口');e.code=code;reject(e);}});
 });}
export function openAppLogin(url,onSaved){
 if(!sessionAvailable)throw Error('缺少应用登录组件，请安装完整 v3 或 v3 更新包');
 siteFor(url);if(process.env.CODEX_SANDBOX_NETWORK_DISABLED==='1'&&!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))throw Error('当前执行环境禁止联网，无法打开外部网站登录窗口');
 if(loginState.running)throw Error('已有网站登录窗口，请先完成或关闭它');
 loginState.running=true;loginState.message='请在弹出的 APP 网站窗口完成登录，确认视频可播放后点击“使用此会话并返回”';
 void execute(['--login',url],{visible:true,timeout:0}).then(async()=>{loginState.message='已保存应用会话；这不代表网站已确认下载权限';await onSaved?.();}).catch(e=>{loginState.message=e.message;}).finally(()=>{loginState.running=false;});
 return {ok:true};
}
export async function forgetSession(url){if(loginState.running)throw Error('请先关闭网站登录窗口');await execute(['--forget',url]);return {ok:true};}
export function netscapeCookies(cookies,site){
 const lines=['# Netscape HTTP Cookie File'];const now=Date.now()/1000;
 for(const c of cookies){const domain=String(c.domain||''),host=domain.replace(/^\./,'').toLowerCase();if(!site.domains.some(d=>host===d||host.endsWith('.'+d)))continue;
  if(c.partitionKey)continue;
  const expires=c.session||Number(c.expires)<0?0:Math.floor(Number(c.expires)||0);if(expires&&expires<=now)continue;
  const fields=[domain,domain.startsWith('.')?'TRUE':'FALSE',String(c.path||'/'),c.secure?'TRUE':'FALSE',String(expires),String(c.name||''),String(c.value||'')];
  if(!domain||!fields[5]||fields.some(v=>/[\r\n\t]/.test(v)))continue;
  lines.push((c.httpOnly?'#HttpOnly_':'')+fields.join('\t'));
 }
 if(lines.length===1)throw Error('应用会话已过期或没有适用于此网站的登录信息，请重新登录');return lines.join('\n')+'\n';
}
export async function withAppSession(url,enabled,run){
 if(!enabled||!sessionAvailable)return run([]);if(new URL(url).protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))return run([]);
 const site=siteFor(url);if(!fs.existsSync(sessionFile(site)))return run([]);
 const payload=JSON.parse(await execute(['--export',url]));const text=netscapeCookies(payload.cookies||[],site);
 // Place short-lived plaintext only under the user-only session directory; never expose it in API results.
 const dir=await fsp.mkdtemp(path.join(path.dirname(sessionFile(site)),'download-'));
 const file=path.join(dir,'cookies.txt');try{await fsp.writeFile(file,text,{mode:0o600});const ua=String(payload.userAgent||'');return await run(['--cookies',file,...(ua&&!/[\r\n]/.test(ua)?['--user-agent',ua]:[])]);}finally{await fsp.rm(dir,{recursive:true,force:true});}
}
