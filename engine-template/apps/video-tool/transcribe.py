"""Offline faster-whisper worker: no model downloads or media uploads."""
import argparse, json, os
from faster_whisper import WhisperModel
p=argparse.ArgumentParser()
p.add_argument('--input',required=True)
p.add_argument('--model',required=True)
p.add_argument('--output',required=True)
p.add_argument('--language',default='auto')
a=p.parse_args()
model=WhisperModel(a.model,device='cpu',compute_type='int8',cpu_threads=max(1,min(8,(os.cpu_count() or 4)//2)),num_workers=1,local_files_only=True)
segments,info=model.transcribe(a.input,language=None if a.language=='auto' else a.language,beam_size=5,vad_filter=True,condition_on_previous_text=False,word_timestamps=True)
result=[]
for s in segments:
    result.append({'start':s.start,'end':s.end,'text':s.text.strip(),'words':[{'start':w.start,'end':w.end,'text':w.word} for w in (s.words or [])]})
    print('VW_ASR:'+json.dumps({'percent':round(min(99,s.end/max(info.duration,1)*100),1),'text':s.text.strip()[-80:]},ensure_ascii=False),flush=True)
with open(a.output,'w',encoding='utf-8') as f:json.dump({'language':info.language,'duration':info.duration,'segments':result},f,ensure_ascii=False,indent=2)
