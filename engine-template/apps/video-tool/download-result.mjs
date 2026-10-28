import fs from 'node:fs';
import path from 'node:path';
export function verifiedFiles(candidates,folder){
 const root=fs.realpathSync(folder);
 return [...new Set(candidates)].filter(p=>{
  try{const actual=fs.realpathSync(p),rel=path.relative(root,actual);return rel&&!rel.startsWith('..')&&!path.isAbsolute(rel)&&fs.statSync(actual).isFile()&&fs.statSync(actual).size>0;}catch{return false;}
 });
}
export function readReceipt(receipt,folder){
 if(!fs.existsSync(receipt))return [];
 const paths=[];for(const line of fs.readFileSync(receipt,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)){
  try{const p=JSON.parse(line);if(typeof p==='string')paths.push(p);}catch{}
 }
 return verifiedFiles(paths,folder);
}
export function requireDownloadedMedia(files,mode){
 const pattern=mode==='subtitles'?/\.(srt|vtt|ass|ttml)$/i:mode==='audio'?/\.(mp3|m4a|wav|flac|ogg|opus|aac)$/i:/\.(mp4|mkv|webm|mov|avi|flv|m4v|ts|mpeg|mpg)$/i;
 if(!files.some(p=>pattern.test(p)))throw Error(mode==='subtitles'?'没有可下载的现成字幕。可下载视频后使用本地语音识别。':'[NO_MEDIA_OUTPUT] 下载器已退出，但未取得有效的媒体文件。任务未完成，启动和退出信息已记录；这不能确定是登录或网络问题。');
}
