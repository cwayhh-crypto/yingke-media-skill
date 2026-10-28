import fs from 'node:fs';
import path from 'node:path';
import {downloadError} from './download-diagnostics.mjs';
export function browserSessionArgs(browser=''){
 if(!['','app','chrome','edge','firefox'].includes(browser))throw Error('不支持此浏览器登录来源');
 return browser&&browser!=='app'?['--cookies-from-browser',browser]:[];
}
export async function runDownloadWithRecovery({run,exe,args,options,url,pluginDir,job}){
 job.compatibilityRecovery={attempted:false};
 try{return await run(exe,args,options);}catch(first){
  const host=new URL(url).hostname,code=downloadError(first.message).code;
  if(job.status==='cancelled'||!['douyin.com','www.douyin.com','v.douyin.com'].includes(host)||!['site_compatibility','douyin_compatibility','http_denied'].includes(code)||!fs.existsSync(path.join(pluginDir,'yingke-douyin/yt_dlp_plugins/extractor/douyin_fix.py')))throw first;
  job.compatibilityRecovery={attempted:true,success:false,primaryError:code};job.message='常规解析未成功，正在尝试备用抖音解析方式…';
  const pos=args.lastIndexOf('--');if(pos<0)throw Error('下载参数缺少链接分隔符');
  const fallback=[...args.slice(0,pos),'--plugin-dirs',pluginDir,...args.slice(pos)];
  try{const out=await run(exe,fallback,options);job.compatibilityRecovery.success=true;return out;}
  catch(second){job.compatibilityRecovery.finalError=downloadError(second.message).code;throw second;}
 }
}
export async function inspectDownloadComponents(tools,run){
 const result=[];
 for(const [key,label,flag] of [['ytdlp','视频解析器','--version'],['ffmpeg','音视频处理','-version'],['ffprobe','媒体检测','-version'],['deno','网页脚本运行环境','--version']]){
  if(!tools[key]||!fs.existsSync(tools[key])){result.push({key,label,ready:false,detail:'组件文件缺失，请重新完整解压应用包'});continue;}
  try{const out=await run(tools[key],[flag],{timeout:10000});if(!out.trim())throw Error('EMPTY_COMPONENT_OUTPUT');result.push({key,label,ready:true,detail:out.split(/\r?\n/)[0].slice(0,160)});}
  catch(e){result.push({key,label,ready:false,detail:/not a valid Win32|193|ENOEXEC/i.test(e.message)?'此组件不适用于当前系统架构':'组件无法启动，可能被系统拦截或文件损坏'});}
 }
 return {checkedAt:new Date().toISOString(),platform:process.platform,architecture:process.arch,components:result,ready:result.every(x=>x.ready)};
}
