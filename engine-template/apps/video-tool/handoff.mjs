import fs from 'node:fs/promises';
import path from 'node:path';
export async function exportHandoff({job,root,tools,run}){
 const input=job.input||(job.files||[]).find(p=>/\.(mp4|mkv|webm|mov|avi|m4v|m4a|mp3|wav|flac|opus)$/i.test(p));
 if(!input)throw Error('No media available for export');
 if(!tools.ffprobe||!tools.ffmpeg)throw Error('FFmpeg and ffprobe are required');
 const meta=JSON.parse(await run(tools.ffprobe,['-v','error','-show_format','-show_streams','-of','json',input],{timeout:30000}));
 const duration=Number(meta.format?.duration);if(!Number.isFinite(duration)||duration<=0)throw Error('Unable to read media duration');
 const project=path.join(root,'projects',job.id+'-'+Date.now());
 const reference=path.join(project,'references','reference-01'),evidence=path.join(reference,'evidence'),production=path.join(project,'productions','adaptation-01');
 await fs.mkdir(evidence,{recursive:true});await fs.mkdir(production,{recursive:true});
 const source='source'+path.extname(input).toLowerCase();await fs.copyFile(input,path.join(reference,source));
 const subtitleFiles=[];
 for(const file of job.files||[])if(/\.(srt|vtt|txt|json)$/i.test(file)){const name=path.basename(file);await fs.copyFile(file,path.join(reference,name));subtitleFiles.push(name);}
 const assets={};
 for(const [kind,asset] of Object.entries(job.assets||{}))if(asset.status==='done'&&asset.path){
  const name=kind+path.extname(asset.path).toLowerCase();await fs.copyFile(asset.path,path.join(reference,name));assets[kind]={file:name,source:asset.source||'media'};
 }
 const frames=[];
 if(meta.streams.some(s=>s.codec_type==='video')){
  const count=Math.min(12,Math.max(1,Math.ceil(duration/2)));
  for(let i=0;i<count;i++){
   const time=Math.min(duration-0.05,i*duration/count),name=`frame-${String(i+1).padStart(3,'0')}.jpg`;
   await run(tools.ffmpeg,['-nostdin','-y','-ss',String(Math.max(0,time)),'-i',input,'-frames:v','1','-vf','scale=480:-2',path.join(evidence,name)],{timeout:30000});
   frames.push({time:Math.max(0,time),file:'evidence/'+name});
  }
 }
 const manifest={schema:'video-workbench-handoff/1',status:'prepared-not-analyzed',title:job.title,url:job.url||null,source,duration,subtitles:subtitleFiles,assets,frames,createdAt:new Date().toISOString()};
 await fs.writeFile(path.join(reference,'manifest.json'),JSON.stringify(manifest,null,2));
 await fs.writeFile(path.join(project,'package.json'),JSON.stringify({name:'reference-project',private:true,hypit:{project:true}},null,2));
 await fs.writeFile(path.join(reference,'ANALYSIS.md'),'# Reference analysis\n\nStatus: PENDING. No visual or creative analysis has been performed.\n\nReview the source video, timestamped transcript and evidence images together. Describe camera, lighting, subjects, editing, audio and construction. Separate observations from hypotheses.\n');
 await fs.writeFile(path.join(reference,'TIMELINE.md'),'# Evidence timeline\n\nThese are uniformly sampled frames, NOT detected shot boundaries. Watch the full source to identify cuts and events.\n\n| Time (s) | Frame | Observation |\n| --- | --- | --- |\n'+frames.map(f=>`| ${f.time.toFixed(3)} | [image](${f.file}) | Pending review |`).join('\n')+'\n');
 await fs.writeFile(path.join(production,'BRIEF.md'),'# Creative brief\n\nStatus: NEEDS CREATIVE DIRECTION.\n\nReference: ../../references/reference-01/\n\nSpecify what to keep and what to change: subject, script, visual style, duration, aspect ratio, audience and output. Do not assume permission to spend on generation.\n');
 await fs.writeFile(path.join(project,'NEXT_STEPS.txt'),'Use the HYPIT skill on this project. First inspect references/reference-01/manifest.json, source media, available subtitles and all evidence frames. Complete ANALYSIS.md and TIMELINE.md based on actual evidence. Then establish the adaptation brief, treatment and production steps. This export only prepares assets: it has not performed AI analysis or generated a video.\n');
 job.handoff=project;return project;
}
