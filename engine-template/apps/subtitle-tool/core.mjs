import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
export const ROOT=path.dirname(fileURLToPath(import.meta.url));
const appRoot=path.resolve(ROOT);
function component(name){if(process.env.YINGKE_BIN){const bundled=path.join(process.env.YINGKE_BIN,name+'.exe');if(fs.existsSync(bundled))return bundled;if(process.env.YINGKE_PORTABLE==='1')return null;}const own=path.join(appRoot,'bin',name+'.exe');if(fs.existsSync(own))return own;const dir=path.join(os.homedir(),'AppData','Roaming','SnapAny','tools',name);if(!fs.existsSync(dir))return null;for(const version of fs.readdirSync(dir).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))){const p=path.join(dir,version,name+'.exe');if(fs.existsSync(p))return p;}return null;}
const py=process.env.YINGKE_PYTHON||[path.join(appRoot,'.venv','Scripts','python.exe'),path.resolve(appRoot,'../video-tool/.venv/Scripts/python.exe')].find(fs.existsSync);
export const tools={python:py,ffmpeg:component('ffmpeg'),ffprobe:component('ffprobe')};
export function modelPath(key){if(process.env.YINGKE_MODELS){const bundled=path.join(process.env.YINGKE_MODELS,'asr',key);if(['model.bin','tokenizer.json','config.json'].every(f=>fs.existsSync(path.join(bundled,f))))return bundled;if(process.env.YINGKE_PORTABLE==='1')return null;}const repo={small:'Systran/faster-whisper-small',turbo:'mobiuslabsgmbh/faster-whisper-large-v3-turbo'}[key];if(!repo)return null;const dir=path.join(os.homedir(),'.cache/huggingface/hub','models--'+repo.replace('/','--'),'snapshots');if(fs.existsSync(dir))for(const ver of fs.readdirSync(dir)){const p=path.join(dir,ver);if(['model.bin','tokenizer.json','config.json'].every(f=>fs.existsSync(path.join(p,f))))return p;}return null;}
export const mediaPattern=/\.(mp4|mkv|mov|webm|avi|flv|m4v|ts|mp3|wav|m4a|aac|flac|ogg|opus)$/i;
export function validateOptions(o={}){const language=o.language||'auto',model=o.model||'small',lineLength=Number(o.lineLength||18);if(!['auto','zh','en','ja','ko','es','fr','de'].includes(language))throw Error('不支持的语言');if(!['small','turbo'].includes(model))throw Error('不支持的模型');if(!Number.isInteger(lineLength)||lineLength<10||lineLength>40)throw Error('每行字数应为 10–40');if(String(o.hotwords||'').length>500)throw Error('术语提示最多 500 字');const diarize=readBoolean(o.diarize,false);const speakerCount=Number(o.speakerCount||0);if(!Number.isInteger(speakerCount)||speakerCount<0||speakerCount>20)throw Error('说话人数应为 0（自动）至 20');return {language,model,lineLength,hotwords:String(o.hotwords||'').trim(),diarize,speakerCount};}
export function stamp(seconds,sep=','){const ms=Math.max(0,Math.round(seconds*1000));return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${sep}${String(ms%1000).padStart(3,'0')}`;}
export function validateSegments(segments){if(!Array.isArray(segments)||!segments.length||segments.length>30000)throw Error('字幕条数无效');let previous=-1;return segments.map(s=>{const start=Number(s.start),end=Number(s.end),text=String(s.text||'').replace(/\r/g,'').trim();if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||start<previous)throw Error('时间无效：开始需小于结束，字幕按开始时间排序');if(!text||text.length>3000)throw Error('字幕内容为空或过长');previous=start;const speaker=String(s.speaker||'').trim();if(speaker.length>60||/[\r\n\x00-\x1f]/.test(speaker))throw Error('说话人名称最多 60 字，不能包含换行或控制字符');return {start,end,text,...(speaker?{speaker}:{})};});}
function wrap(text,width){const chars=Array.from(text.trim());if(chars.length<=width)return chars.join('');let cut=width;const space=chars.slice(0,width+1).lastIndexOf(' ');if(space>width/2)cut=space;return chars.slice(0,cut).join('').trim()+'\n'+wrap(chars.slice(cut).join('').trim(),width);}
export function readBoolean(value,fallback=true){if(value===undefined||value===null)return fallback;if(value===true||value==='true'||value==='1')return true;if(value===false||value==='false'||value==='0')return false;throw Error('选项必须为 true 或 false');}
export function exportOptions(o={}){return {timestamps:readBoolean(o.timestamps),speakers:readBoolean(o.speakers)};}
export function exportName(title,ext){
 if(!['srt','vtt','txt','csv','json'].includes(ext))throw Error('不支持的导出格式');
 let name=path.posix.parse(String(title||'字幕').replace(/\\/g,'/').split('/').at(-1)).name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,180).replace(/[. ]+$/g,'');
 if(!name)name='字幕';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name='_'+name;
 return name+'.'+ext;
}
export function speakerAt(start,end,turns=[]){
 const scores=new Map();for(const t of turns){const overlap=Math.max(0,Math.min(end,t.end)-Math.max(start,t.start));if(overlap&&t.speaker)scores.set(t.speaker,(scores.get(t.speaker)||0)+overlap);}
 const ranked=[...scores].sort((a,b)=>b[1]-a[1]);if(!ranked.length||ranked[0][1]<(end-start)*0.5||(ranked[1]&&ranked[1][1]>=ranked[0][1]*0.85))return '';return ranked[0][0];
}
export function captionsFrom(transcript,width=18){
 const captions=[],turns=transcript.speakerTurns||[];
 for(const s of transcript.segments||[]){
  const words=(s.words||[]).filter(w=>w.text?.trim()&&Number.isFinite(w.start)&&w.end>w.start).map(w=>({...w,speaker:speakerAt(w.start,w.end,turns)||(!turns.length?s.speaker||'':'')}));
  if(!words.length){if(s.text?.trim()&&s.end>s.start)captions.push({start:s.start,end:s.end,text:wrap(s.text,width),speaker:speakerAt(s.start,s.end,turns)||(!turns.length?s.speaker||'':'')});continue;}
  let group=[];const flush=()=>{if(group.length)captions.push({start:group[0].start,end:group.at(-1).end,text:wrap(group.map(w=>w.text).join('').trim(),width),speaker:group[0].speaker});group=[];};
  for(const w of words){const length=Array.from(group.map(x=>x.text).join('')+w.text).length;if(group.length&&(length>width*2||w.end-group[0].start>6||w.speaker!==group[0].speaker))flush();group.push(w);if(/[。！？!?]$/.test(w.text.trim()))flush();}flush();
 }return validateSegments(captions);
}
export function exportsFor(segments,options={}){
 const s=validateSegments(segments),o=exportOptions(options),csv=v=>'"'+String(v).replace(/"/g,'""')+'"';
 const words=x=>(o.speakers&&x.speaker?'【'+x.speaker+'】':'')+x.text;
 const columns=[...(o.timestamps?['start','end']:[]),...(o.speakers?['speaker']:[]),'text'];
 const result={txt:s.map(x=>(o.timestamps?'['+stamp(x.start,'.')+' --> '+stamp(x.end,'.')+'] ':'')+words(x).replace(/\n/g,' ')).join('\n')+'\n',csv:columns.join(',')+'\r\n'+s.map(x=>columns.map(c=>c==='start'||c==='end'?x[c]:csv(x[c]||'')).join(',')).join('\r\n'),json:JSON.stringify({segments:s.map(x=>({... (o.timestamps?{start:x.start,end:x.end}:{}),...(o.speakers&&x.speaker?{speaker:x.speaker}:{}),text:x.text}))},null,2)};
 if(o.timestamps){result.srt=s.map((x,i)=>`${i+1}\n${stamp(x.start)} --> ${stamp(x.end)}\n${words(x)}\n`).join('\n');result.vtt='WEBVTT\n\n'+s.map(x=>`${stamp(x.start,'.')} --> ${stamp(x.end,'.')}\n${words(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}\n`).join('\n');}return result;
}
