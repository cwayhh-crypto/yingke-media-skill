import fs from 'node:fs/promises';
import path from 'node:path';
export const videoPattern=/\.(mp4|mkv|webm|mov|avi|flv|m4v|ts)$/i;
export const mediaPattern=/\.(mp4|mkv|webm|mov|avi|flv|m4v|ts|m4a|mp3|wav|flac|aac|ogg|opus)$/i;
async function usable(file){try{return (await fs.stat(file)).size>0;}catch{return false;}}
export function collectionArgs(options){return options.poster&&options.mode!=='subtitles'?['--write-thumbnail']:[];}
// All extraction is local. Preserve the source video and atomically publish each asset.
export async function collectAssets({job,input,tools,run,posterFile=null}){
 const options=job.options||{},stem=path.join(path.dirname(input),path.parse(input).name);
 job.assets??={};job.files??=[];
 const remember=file=>{if(!job.files.includes(file))job.files.push(file);};
 let probe;
 const metadata=async()=>probe??=JSON.parse(await run(tools.ffprobe,['-v','error','-show_streams','-show_format','-of','json',input],{job,timeout:30000}));
 async function create(kind,target,generate,source){
  const temp=path.join(path.dirname(target),'.'+path.parse(target).name+'.'+job.id+'.tmp'+path.extname(target));
  try{
   if(!await usable(target)){
    job.message=kind==='audio'?'正在收录独立音频…':'正在保存封面…';job.percent=null;
    await generate(temp);
    if(!await usable(temp))throw Error('未生成有效文件');
    await fs.rename(temp,target);
   }
   job.assets[kind]={status:'done',path:target,...(source?{source}:{})};remember(target);
  }catch(e){
   if(job.status==='cancelled')throw e;
   job.assets[kind]={status:'failed',message:String(e.message).slice(-600)};
  }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
 }
 if(options.audio){
  if(path.extname(input).toLowerCase()==='.mp3'){remember(input);job.assets.audio={status:'done',path:input};}
  else await create('audio',stem+'.audio.mp3',async temp=>{
   const meta=await metadata();if(!meta.streams?.some(s=>s.codec_type==='audio'))throw Error('原视频没有音轨');
   await run(tools.ffmpeg,['-nostdin','-y','-i',input,'-map','0:a:0','-vn','-c:a','libmp3lame','-q:a','2',temp],{job});
  });
 }
 if(job.status==='cancelled')throw Error('已取消');
 if(options.poster){
  // yt-dlp writes the chosen site thumbnail alongside the final media.
  const sitePoster=posterFile&&await usable(posterFile)?posterFile:null;
  if(sitePoster){remember(sitePoster);job.assets.poster={status:'done',path:sitePoster,source:'website'};}
  else await create('poster',stem+'.poster.jpg',async temp=>{
   const meta=await metadata();if(!meta.streams?.some(s=>s.codec_type==='video'&&!s.disposition?.attached_pic))throw Error('没有网站封面，也没有可截取的视频画面');
   const duration=Number(meta.format?.duration)||0,time=duration>2?1:0;
   await run(tools.ffmpeg,['-nostdin','-y','-ss',String(time),'-i',input,'-map','0:v:0','-frames:v','1','-q:v','2','-update','1',temp],{job,timeout:30000});
  },'video-frame');
 }
 return job.assets;
}
export function collectionSummary(job){
 const failed=Object.entries(job.assets||{}).filter(([,v])=>v.status==='failed').map(([k])=>k==='audio'?'音频':'封面');
 return failed.length?'素材已保留；'+failed.join('、')+'未收录，可点“补齐音频和封面”重试':'已完成';
}
