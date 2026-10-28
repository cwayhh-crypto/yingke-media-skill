"""Optional offline speaker diarization. Never fetches models or uploads audio."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import wave

ROOT = Path(__file__).resolve().parent
SEGMENTATION = Path(os.environ.get('YINGKE_MODELS', str(ROOT / 'models'))) / 'diarization' / 'segmentation.onnx'
EMBEDDING = Path(os.environ.get('YINGKE_MODELS', str(ROOT / 'models'))) / 'diarization' / 'embedding.onnx'


def make_engine(count=0):
    import sherpa_onnx as so
    threads = max(1, min(4, os.cpu_count() or 1))
    config = so.OfflineSpeakerDiarizationConfig(
        segmentation=so.OfflineSpeakerSegmentationModelConfig(
            pyannote=so.OfflineSpeakerSegmentationPyannoteModelConfig(model=str(SEGMENTATION)),
            num_threads=threads, provider='cpu'),
        embedding=so.SpeakerEmbeddingExtractorConfig(model=str(EMBEDDING), num_threads=threads, provider='cpu'),
        clustering=so.FastClusteringConfig(num_clusters=count if count else -1, threshold=0.5),
        min_duration_on=0.3, min_duration_off=0.5)
    if not config.validate():
        raise RuntimeError('说话人模型配置无效')
    return so.OfflineSpeakerDiarization(config)


def availability():
    missing = []
    if importlib.util.find_spec('sherpa_onnx') is None:
        missing.append('sherpa-onnx 识别组件')
    if not SEGMENTATION.is_file():
        missing.append('说话人分段模型')
    if not EMBEDDING.is_file():
        missing.append('声纹特征模型')
    if missing:
        return {'ready': False, 'reason': '缺少：' + '、'.join(missing) + '；可先手动标注说话人。'}
    try:
        make_engine()
        return {'ready': True, 'reason': '本地说话人模型已就绪；结果需校对。'}
    except Exception as error:
        return {'ready': False, 'reason': '说话人模型加载失败：' + str(error)[:300]}


def diarize(input_file, output_file, count=0):
    import numpy as np
    engine = make_engine(count)
    with wave.open(str(input_file), 'rb') as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2 or source.getframerate() != engine.sample_rate:
            raise ValueError('需要单声道、16 位、模型采样率的 PCM WAV')
        audio = np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32) / 32768.0
    def progress(done, total):
        print('SPEAKER_PROGRESS:' + json.dumps({'percent': round(done / max(total, 1) * 100, 1)}), flush=True)
        return 0
    turns = engine.process(audio, callback=progress).sort_by_start_time()
    labels, result = {}, []
    for turn in turns:
        key = int(turn.speaker)
        if key not in labels:
            labels[key] = '说话人 ' + str(len(labels) + 1)
        result.append({'start': float(turn.start), 'end': float(turn.end), 'speaker': labels[key]})
    if not result:
        raise RuntimeError('没有检测到可区分的说话片段，请手动标注')
    Path(output_file).write_text(json.dumps({'speakerTurns': result}, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--input')
    parser.add_argument('--output')
    parser.add_argument('--speakers', type=int, default=0)
    args = parser.parse_args()
    if args.check:
        print(json.dumps(availability(), ensure_ascii=False))
    else:
        if not args.input or not args.output or not 0 <= args.speakers <= 20:
            parser.error('需要输入、输出路径；人数应为 0 至 20')
        diarize(args.input, args.output, args.speakers)
