import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
// This action explicitly requests a visible, interactive Explorer window.
export async function openDirectory(directory,{launch=spawn,platform=process.platform,env=process.env}={}){
 const dir=path.resolve(directory);
 if(!(await fs.stat(dir)).isDirectory())throw Error('目标不是文件夹');
 if(platform!=='win32')throw Error('打开目录目前仅支持 Windows，请复制路径手动打开');
 const explorer=path.join(env.SystemRoot||env.WINDIR||'C:\\Windows','explorer.exe');
 await new Promise((resolve,reject)=>{
  let timer;const child=launch(explorer,[dir],{windowsHide:false,stdio:'ignore'});
  const fail=error=>{clearTimeout(timer);reject(Error('无法启动资源管理器：'+error.message));};
  child.once('error',fail);
  child.once('spawn',()=>{timer=setTimeout(()=>{child.unref?.();resolve();},350);});
  // Explorer commonly exits with 1 when handing the request to an existing instance.
  child.once('exit',(code,signal)=>{
   clearTimeout(timer);
   if(signal||![0,1].includes(code))reject(Error('资源管理器启动异常：'+(signal||code)));
   else resolve();
  });
 });
 return {ok:true,path:dir,message:'已请求 Windows 打开目录；若窗口未出现，可复制目录路径后在资源管理器地址栏粘贴。'};
}
