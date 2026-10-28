import argparse,json,os,re,shutil,socket,subprocess,sys,time
from pathlib import Path
from urllib.request import Request,build_opener,ProxyHandler
from urllib.parse import urlencode

def main():
 p=argparse.ArgumentParser();p.add_argument('--engine',default=os.environ.get('YINGKE_ENGINE_ROOT'));p.add_argument('--wait-seconds',type=int,default=1800)
 subs=p.add_subparsers(dest='cmd',required=True)
 for c in ['doctor','repair','start','stop','status','jobs','assets']:subs.add_parser(c)
 d=subs.add_parser('download');d.add_argument('url');d.add_argument('--cookies');d.add_argument('--app-session',action='store_true')
 t=subs.add_parser('transcribe');t.add_argument('input');t.add_argument('--output-dir',required=True);t.add_argument('--diarize',action='store_true');t.add_argument('--speakers',type=int,default=0);t.add_argument('--formats',nargs='+',choices=['srt','vtt','txt','csv','json'],default=['srt','vtt','txt','csv','json']);t.add_argument('--no-speakers',action='store_true');t.add_argument('--no-timestamps',action='store_true')
 w=subs.add_parser('workflow');w.add_argument('input');w.add_argument('--output-dir',required=True);w.add_argument('--diarize',action='store_true');w.add_argument('--speakers',type=int,default=0);w.add_argument('--cookies');w.add_argument('--app-session',action='store_true')
 a=p.parse_args()
 if not a.engine:raise ValueError('Provide --engine or YINGKE_ENGINE_ROOT')
 root=Path(a.engine).resolve();cfg=json.loads((root/'workbench.json').read_text(encoding='utf-8'));base='http://127.0.0.1:'+str(int(cfg['port']))
 def emit(v):print(json.dumps(v,ensure_ascii=False,indent=2))
 def req(route,body=None,auth=True,raw=False):
  headers={'Content-Type':'application/json'}
  if auth:headers['Authorization']='Bearer '+(root/'data/agent-token.txt').read_text().strip()
  with build_opener(ProxyHandler({})).open(Request(base+route,data=None if body is None else json.dumps(body).encode(),headers=headers),timeout=15) as r:data=r.read()
  return data if raw else json.loads(data)
 def identity():
  h=req('/health',auth=False)
  if Path(h.get('instanceRoot','')).resolve()!=root or h.get('version')!='3.0.0':raise ValueError('Port belongs to a different engine or version')
  if not h.get('ready'):raise ValueError('Engine not ready: '+str(h.get('error','wait then retry')))
  return h
 def done(task,group):
  until=time.monotonic()+a.wait_seconds
  while time.monotonic()<until:
   j=next((j for j in req('/agent/v1/jobs')[group] if j['id']==task),None)
   if j and j['status'] not in ['queued','running']:
    if j['status']!='done':raise ValueError('Task '+task+': '+j.get('message',j['status']))
    return j
   time.sleep(1)
  raise ValueError('Waiting timed out; task still exists. Inspect jobs before retrying: '+task)
 required=['agent.mjs','gateway.mjs','runtime/node.exe','bin/yt-dlp.exe','bin/ffmpeg.exe','bin/ffprobe.exe','apps/video-tool/server.mjs','apps/subtitle-tool/server.mjs']
 missing=[f for f in required if not (root/f).is_file()]
 if not any((root/f).is_file() for f in ['runtime/python/python.exe','runtime/python/Scripts/python.exe']):missing.append('runtime/python/python.exe or runtime/python/Scripts/python.exe')
 if a.cmd=='doctor':emit({'ready':not missing,'missing':missing,'engine':str(root),'networkRestricted':os.environ.get('CODEX_SANDBOX_NETWORK_DISABLED')=='1','downloadFix':(root/'apps/video-tool/download-result.mjs').exists()});return
 if missing:raise ValueError('Missing engine files: '+', '.join(missing))
 if a.cmd=='repair':
  if "version:'3.0.0'" not in (root/'gateway.mjs').read_text(encoding='utf-8'):raise ValueError('Repair supports v3.0.0 only')
  for key in ['port','downloadPort','subtitlePort']:
   with socket.socket() as s:
    s.settimeout(1)
    if s.connect_ex(('127.0.0.1',int(cfg[key])))==0:raise ValueError('Stop engine before repair; port in use: '+str(cfg[key]))
  source=Path(__file__).resolve().parents[1]/'assets/backend-patch';target=root/'apps/video-tool';backup=root/'data/skill-repair-backup';backup.mkdir(parents=True,exist_ok=True)
  for f in source.glob('*.mjs'):
   dest=target/f.name
   if dest.exists() and dest.read_bytes()==f.read_bytes():continue
   if dest.exists() and not (backup/f.name).exists():shutil.copy2(dest,backup/f.name)
   tmp=dest.with_suffix('.skill-tmp');shutil.copy2(f,tmp);os.replace(tmp,dest)
  emit({'repaired':True});return
 if a.cmd=='start':
  r=subprocess.run([str(root/'runtime/node.exe'),str(root/'agent.mjs'),'start'],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=45,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
  if r.returncode:raise ValueError(r.stderr.strip() or 'Engine start failed')
  for _ in range(60):
   h=req('/health',auth=False)
   if h.get('ready'):emit(identity());return
   if h.get('error'):raise ValueError(str(h['error']))
   time.sleep(.5)
  raise ValueError('Engine startup timeout')
 if a.cmd!='workflow':identity()
 if a.cmd=='workflow':
  out=Path(a.output_dir).resolve();out.mkdir(parents=True,exist_ok=True)
  manifest=out/'workflow.json'
  config={'input':a.input,'engine':str(root),'diarize':a.diarize,'speakers':a.speakers}
  state=json.loads(manifest.read_text(encoding='utf-8')) if manifest.exists() else {'config':config,'status':'pending'}
  if state['config']!=config:raise ValueError('Output belongs to another workflow; use another directory')
  def save():
   temp=manifest.with_suffix('.tmp');temp.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(temp,manifest)
  def valid(file):return Path(file).is_file() and Path(file).stat().st_size>0
  def execute(args):
   r=subprocess.run(args,capture_output=True,text=True,encoding='utf-8',errors='replace',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),timeout=180)
   if r.returncode:raise ValueError('Local media processing failed: '+r.stderr[-1200:])
   return r.stdout
  try:
   identity()
   state['status']='running';state.pop('error',None);save()
   remote=a.input.startswith(('https://','http://'))
   if remote:
    if not state.get('downloadId'):
     if state.get('downloadSubmissionPending'):raise ValueError('Previous download submission outcome is unknown; inspect jobs before submitting again')
     if os.environ.get('CODEX_SANDBOX_NETWORK_DISABLED')=='1' or req('/agent/v1/status').get('network',{}).get('status')=='restricted':
      raise ValueError('Network policy blocks downloader. No download submitted. Resume in a permitted environment; browser playback alone is not a downloadable file.')
     body={'links':a.input,'quality':'best','mode':'video','audio':True,'poster':True,'browser':'app' if a.app_session else ''}
     if a.cookies:body['cookies']=str(Path(a.cookies).resolve())
     state['downloadSubmissionPending']=True;save()
     state['downloadId']=req('/agent/v1/download',body)['ids'][0];state['downloadSubmissionPending']=False;save()
    job=done(state['downloadId'],'download')
    videos=[f for f in job.get('files',[]) if Path(f).suffix.lower() in ['.mp4','.mkv','.webm','.mov','.avi','.m4v'] and valid(f)]
    if not videos:raise ValueError('No verified downloaded video')
    src=Path(videos[0]);state['downloadAssets']=job.get('assets',{})
   else:src=Path(a.input).resolve()
   if not valid(src):raise ValueError('Input missing or empty')
   meta=json.loads(execute([str(root/'bin/ffprobe.exe'),'-v','error','-show_streams','-show_format','-of','json',str(src)]))
   if not any(s.get('codec_type')=='audio' for s in meta.get('streams',[])):raise ValueError('Input has no audio stream')
   state['video']=str(src);state['duration']=meta.get('format',{}).get('duration');save()
   for kind,name,opts in [('audio','audio.mp3',['-map','0:a:0','-vn','-c:a','libmp3lame','-q:a','2']),('poster','poster.jpg',['-map','0:v:0','-frames:v','1','-q:v','2','-update','1'])]:
    if valid(state.get(kind,'')):continue
    original=state.get('downloadAssets',{}).get(kind,{})
    if original.get('status')=='done' and valid(original.get('path','')):
     state[kind]=original['path']
     if kind=='poster':state['posterSource']=original.get('source','website')
    else:
     target=out/name
     if target.exists():raise ValueError('Untracked output exists: '+str(target))
     tmp=out/('partial-'+name)
     execute([str(root/'bin/ffmpeg.exe'),'-nostdin','-y','-v','error','-i',str(src),*opts,str(tmp)])
     if not valid(tmp):raise ValueError('Empty '+kind)
     os.replace(tmp,target);state[kind]=str(target)
     if kind=='poster':state['posterSource']='video-frame'
    save()
   if not state.get('subtitleId'):
    if state.get('subtitleSubmissionPending'):raise ValueError('Previous subtitle submission outcome is unknown; inspect jobs before submitting again')
    status=req('/agent/v1/status')['transcription']
    if not status.get('ready'):raise ValueError('Subtitle service is not ready; media assets preserved')
    if a.diarize and not status.get('diarization',{}).get('ready'):raise ValueError('Speaker diarization is not ready; speaker labels were not fabricated')
    state['subtitleSubmissionPending']=True;save()
    state['subtitleId']=req('/agent/v1/transcribe',{'inputs':[str(src)],'language':'auto','model':'small','diarize':a.diarize,'speakerCount':a.speakers})['ids'][0];state['subtitleSubmissionPending']=False;save()
   job=done(state['subtitleId'],'subtitles')
   if a.diarize and job.get('speakerStatus')!='automatic':raise ValueError('Automatic speaker labels were not confirmed')
   state.setdefault('subtitles',{})
   for fmt in ['srt','vtt','txt','csv','json']:
    if valid(state['subtitles'].get(fmt,'')):continue
    target=out/('subtitles.'+fmt)
    if target.exists():raise ValueError('Untracked export exists: '+str(target))
    data=req('/agent/v1/export?'+urlencode({'id':state['subtitleId'],'ext':fmt,'timestamps':'true','speakers':str(a.diarize).lower()}),raw=True)
    if not data:raise ValueError('Empty subtitle export')
    with target.open('xb') as f:f.write(data)
    state['subtitles'][fmt]=str(target);save()
   state['status']='done';save();emit(state)
  except Exception as e:
   state['status']='incomplete';state['error']=str(e);save();emit(state);raise
  return
 if a.cmd=='stop':
  html=req('/',auth=False,raw=True).decode('utf-8');match=re.search(r"const TOKEN='([a-f0-9]+)'",html)
  if not match:raise ValueError('Cannot obtain local shutdown session')
  with build_opener(ProxyHandler({})).open(Request(base+'/api/exit',data=b'{}',headers={'X-Session-Token':match[1],'Content-Type':'application/json'}),timeout=15) as response:emit(json.loads(response.read()))
  return
 if a.cmd in ['status','jobs','assets']:emit(req('/agent/v1/'+a.cmd));return
 if a.cmd=='download':
  body={'links':a.url,'quality':'best','mode':'video','audio':True,'poster':True,'browser':'app' if a.app_session else ''}
  if a.cookies:body['cookies']=str(Path(a.cookies).resolve())
  task=req('/agent/v1/download',body)['ids'][0];job=done(task,'download');files=[Path(f) for f in job.get('files',[])]
  if not files or not all(f.is_file() and f.stat().st_size for f in files):raise ValueError('Download output missing')
  emit({'id':task,'files':[str(f) for f in files],'assets':job.get('assets',{})});return
 src=Path(a.input).resolve()
 if not src.is_file():raise ValueError('Input does not exist')
 out=Path(a.output_dir).resolve();out.mkdir(parents=True,exist_ok=True);targets={fmt:out/(src.stem+'.'+fmt) for fmt in dict.fromkeys(a.formats)}
 if any(f.exists() for f in targets.values()):raise ValueError('Export already exists; choose another output directory')
 task=req('/agent/v1/transcribe',{'inputs':[str(src)],'language':'auto','model':'small','diarize':a.diarize,'speakerCount':a.speakers})['ids'][0];done(task,'subtitles');saved=[]
 for fmt,f in targets.items():
  q=urlencode({'id':task,'ext':fmt,'timestamps':str(fmt in ['srt','vtt'] or not a.no_timestamps).lower(),'speakers':str(not a.no_speakers).lower()});data=req('/agent/v1/export?'+q,raw=True)
  if not data:raise ValueError('Empty subtitle export: '+fmt)
  with f.open('xb') as stream:stream.write(data)
  saved.append(str(f))
 emit({'id':task,'files':saved,'diarizationRequested':a.diarize})

if __name__=='__main__':
 for stream in [sys.stdout,sys.stderr]:
  if hasattr(stream,'reconfigure'):stream.reconfigure(encoding='utf-8',errors='replace')
 try:main()
 except Exception as e:print(json.dumps({'error':str(e)},ensure_ascii=False),file=sys.stderr);sys.exit(1)
