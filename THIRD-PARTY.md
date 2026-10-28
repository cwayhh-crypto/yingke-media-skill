# Third-party components and references

This source repository does not contain model weights or third-party executables. The setup script obtains or installs the following separately; each remains subject to its own license and notices.

| Component | Upstream |
| --- | --- |
| Node.js | https://nodejs.org/ · MIT and dependency notices |
| CPython | https://www.python.org/ · PSF license |
| yt-dlp | https://github.com/yt-dlp/yt-dlp · Unlicense and bundled dependency notices |
| FFmpeg Windows essentials build | https://www.gyan.dev/ffmpeg/builds/ · GPL v3; source: https://github.com/FFmpeg/FFmpeg |
| faster-whisper / CTranslate2 | https://github.com/SYSTRAN/faster-whisper · https://github.com/OpenNMT/CTranslate2 · MIT |
| Whisper Small converted weights | https://huggingface.co/Systran/faster-whisper-small · MIT |
| sherpa-onnx | https://github.com/k2-fsa/sherpa-onnx · Apache-2.0 |
| Pyannote segmentation model | https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0 · MIT |
| 3D-Speaker embedding model | https://huggingface.co/csukuangfj/speaker-embedding-models · check the upstream model terms |

The experimental Douyin plugin identifies its yt-dlp upstream adaptation and license in its source header. Installing dependencies with pip may install additional packages, which retain their own notices in their distribution metadata.
