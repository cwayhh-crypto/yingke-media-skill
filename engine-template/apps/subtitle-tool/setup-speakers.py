"""Install optional speaker models from official upstream sources.
Run manually in a normal terminal with network access. No administrator rights needed.
"""
import os
import hashlib
import time
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / 'models' / 'diarization'
BASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/'
SEG_URL = BASE + 'speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2'
EMB_URL = BASE + 'speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx'


SEG_HF = 'https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/main/model.onnx'
EMB_HF = 'https://huggingface.co/csukuangfj/speaker-embedding-models/resolve/main/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx'
SEG_SHA = '220ad67ca923bef2fa91f2390c786097bf305bceb5e261d4af67b38e938e1079'
EMB_SHA = '1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b'


def matches(target, expected):
    if not target.is_file():
        return False
    digest = hashlib.sha256()
    with target.open('rb') as data:
        for block in iter(lambda: data.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest() == expected


def download(url, target, expected=None, attempts=3):
    temporary = target.with_name(target.name + '.part')
    for attempt in range(attempts):
        try:
            print(f'  Connecting ({attempt+1}/{attempts}): {url}', flush=True)
            request = urllib.request.Request(url, headers={'User-Agent': 'Yingke-Subtitle-Setup/2.0'})
            with urllib.request.urlopen(request, timeout=90) as response, temporary.open('wb') as output:
                size = 0
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    output.write(chunk)
                    print(f'  {target.name}: {size / 1048576:.1f} MiB', flush=True)
            if size < 100:
                raise RuntimeError('Downloaded file is unexpectedly small')
            if expected and not matches(temporary, expected):
                raise RuntimeError('SHA256 mismatch; downloaded model rejected')
            temporary.replace(target)
            return
        except Exception as error:
            temporary.unlink(missing_ok=True)
            print(f'  Attempt failed: {type(error).__name__}: {error}', flush=True)
            if attempt + 1 == attempts:
                raise
            time.sleep(2)


def segmentation_model(target):
    if matches(target, SEG_SHA):
        print('  Segmentation model already verified', flush=True)
        return
    try:
        download(SEG_HF, target, SEG_SHA, attempts=2)
        try:
            download(SEG_HF.rsplit('/', 1)[0]+'/LICENSE', MODELS/'segmentation-LICENSE', attempts=1)
        except Exception:
            print('  License copy unavailable; see the upstream repository LICENSE.', flush=True)
        return
    except Exception:
        print('  Hugging Face unavailable; trying official GitHub Release', flush=True)
    archive = MODELS / 'sherpa-onnx-pyannote-segmentation-3-0.tar.bz2'
    download(SEG_URL, archive, attempts=2)
    with tarfile.open(archive, 'r:bz2') as bundle:
        for original, destination in [
            ('sherpa-onnx-pyannote-segmentation-3-0/model.onnx', target),
            ('sherpa-onnx-pyannote-segmentation-3-0/LICENSE', MODELS/'segmentation-LICENSE')]:
            member = bundle.getmember(original)
            if not member.isfile():
                raise RuntimeError('Expected regular model file')
            temporary = destination.with_name(destination.name+'.part')
            with bundle.extractfile(member) as source, temporary.open('wb') as output:
                shutil.copyfileobj(source, output)
            if destination == target and not matches(temporary, SEG_SHA):
                temporary.unlink(missing_ok=True)
                raise RuntimeError('Segmentation SHA256 mismatch')
            temporary.replace(destination)


def embedding_model(target):
    if matches(target, EMB_SHA):
        print('  Embedding model already verified', flush=True)
        return
    try:
        download(EMB_HF, target, EMB_SHA, attempts=2)
    except Exception:
        print('  Hugging Face unavailable; trying official GitHub Release', flush=True)
        download(EMB_URL, target, EMB_SHA, attempts=2)


def main():
    if os.environ.get('CODEX_SANDBOX_NETWORK_DISABLED') == '1':
        raise RuntimeError('This execution environment disables network access. Run this script manually in your normal terminal; do not remove the restriction variable.')
    MODELS.mkdir(parents=True, exist_ok=True)
    segmentation = MODELS / 'segmentation.onnx'
    embedding = MODELS / 'embedding.onnx'
    print('1/4 Download and verify segmentation model (Hugging Face first)', flush=True)
    segmentation_model(segmentation)
    print('2/4 Download and verify 3D-Speaker embedding model', flush=True)
    embedding_model(embedding)
    print('3/4 Install sherpa-onnx into the workbench Python environment', flush=True)
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'sherpa-onnx>=1.10.28', '--retries', '5', '--timeout', '90'], check=True)
    print('4/4 Validate local speaker model loading', flush=True)
    import json
    result = subprocess.run([sys.executable, str(ROOT / 'diarize.py'), '--check'], check=True, capture_output=True, text=True, encoding='utf-8', env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
    state = json.loads(result.stdout)
    if not state.get('ready'):
        raise RuntimeError(state.get('reason', 'Model validation failed'))
    print('SUCCESS: Both models and the runtime load correctly. Restart the subtitle workbench to enable speaker diarization.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('INSTALLATION FAILED: ' + str(error), file=sys.stderr)
        sys.exit(1)
