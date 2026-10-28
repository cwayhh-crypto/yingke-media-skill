param(
    [string]$EnginePath = (Join-Path $env:LOCALAPPDATA 'YingkeMedia\engine'),
    [string]$PythonPath = 'python',
    [string]$FromPortableEngine = ''
)
$ErrorActionPreference = 'Stop'
if (-not [Environment]::Is64BitOperatingSystem) { throw '需要 64 位 Windows。' }
if (Test-Path -LiteralPath $EnginePath) { throw "目标已存在，未覆盖：$EnginePath。请选择新目录。" }
$template = Join-Path (Split-Path -Parent $PSScriptRoot) 'engine-template'
if (-not (Test-Path -LiteralPath (Join-Path $template 'gateway.mjs'))) { throw '找不到 engine-template。' }

function Invoke-Checked([string]$Program, [string[]]$CommandArgs) {
    & $Program @CommandArgs
    if ($LASTEXITCODE -ne 0) { throw "命令失败：$Program（退出码 $LASTEXITCODE）" }
}
function Get-VerifiedFile([string]$Url, [string]$Destination, [string]$ExpectedHash) {
    $partial = "$Destination.part"
    Write-Host "下载 $Url"
    Invoke-WebRequest -Uri $Url -OutFile $partial -UseBasicParsing
    $actual = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash
    if ($actual -ne $ExpectedHash) { throw "SHA256 不匹配，下载未安装：$Url" }
    Move-Item -LiteralPath $partial -Destination $Destination
}

New-Item -ItemType Directory -Path $EnginePath -Force | Out-Null
Copy-Item -Path (Join-Path $template '*') -Destination $EnginePath -Recurse
if ($FromPortableEngine) {
    # Only copy program dependencies; never copy jobs, downloads, sessions or tokens.
    foreach ($name in @('runtime','bin','models')) {
        $source = Join-Path $FromPortableEngine $name
        if (-not (Test-Path -LiteralPath $source)) { throw "原引擎缺少 $name：$FromPortableEngine" }
        Copy-Item -LiteralPath $source -Destination (Join-Path $EnginePath $name) -Recurse
    }
} else {
    # Python is supplied by the user; dependencies are installed into an isolated venv.
    $python = (Get-Command $PythonPath -ErrorAction Stop).Source
    Invoke-Checked $python @('-c','import struct,sys; assert struct.calcsize("P")==8 and (3,12)<=sys.version_info[:2]<=(3,13), "64-bit Python 3.12 or 3.13 required"')
    $runtime = Join-Path $EnginePath 'runtime'
    $bin = Join-Path $EnginePath 'bin'
    $modelDir = Join-Path $EnginePath 'models\asr\small'
    $speakerDir = Join-Path $EnginePath 'models\diarization'
    foreach ($dir in @($runtime,$bin,$modelDir,$speakerDir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Invoke-Checked $python @('-m','venv',(Join-Path $runtime 'python'))
    $venvPython = Join-Path $runtime 'python\Scripts\python.exe'
    Invoke-Checked $venvPython @('-m','pip','install','faster-whisper==1.2.1','sherpa-onnx==2.0.0')
    Get-VerifiedFile 'https://nodejs.org/dist/v24.19.0/win-x64/node.exe' (Join-Path $runtime 'node.exe') '3602F2BB1A10F2CBAB4C36886218A33C1AB3DB87290E73B033C46C77147D0237'
    Get-VerifiedFile 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.21/yt-dlp.exe' (Join-Path $bin 'yt-dlp.exe') '33121D192D706E62F684A06F80918E3F3A8BA52AC3A65213B6951C39C7D9F555'
    $ffmpegArchive = Join-Path $EnginePath 'ffmpeg.zip'
    Get-VerifiedFile 'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.1.2-essentials_build.zip' $ffmpegArchive 'DB580001CAA24AC104C8CB856CD113A87B0A443F7BDF47D8C12B1D740584A2EC'
    $extractPath = Join-Path $EnginePath 'ffmpeg-extract'
    Expand-Archive -LiteralPath $ffmpegArchive -DestinationPath $extractPath
    foreach ($name in @('ffmpeg.exe','ffprobe.exe')) {
        $matches = @(Get-ChildItem -LiteralPath $extractPath -Filter $name -File -Recurse)
        if ($matches.Count -ne 1) { throw "FFmpeg 压缩包中 $name 的数量异常。" }
        Copy-Item -LiteralPath $matches[0].FullName -Destination (Join-Path $bin $name)
    }
    # FFmpeg files remain available here with their upstream notices and license.
    Invoke-Checked $venvPython @('-c','from huggingface_hub import snapshot_download; import sys; snapshot_download(repo_id="Systran/faster-whisper-small",local_dir=sys.argv[1],allow_patterns=["model.bin","config.json","tokenizer.json","vocabulary.txt"])',$modelDir)
    Get-VerifiedFile 'https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/main/model.onnx' (Join-Path $speakerDir 'segmentation.onnx') '220AD67CA923BEF2FA91F2390C786097BF305BCEB5E261D4AF67B38E938E1079'
    Get-VerifiedFile 'https://huggingface.co/csukuangfj/speaker-embedding-models/resolve/main/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx' (Join-Path $speakerDir 'embedding.onnx') '1A331345F04805BADBB495C775A6DDFFCDD1A732567D5EC8B3D5749E3C7A5E4B'
}
$portablePython = Join-Path $EnginePath 'runtime\python\python.exe'
$venvPython = Join-Path $EnginePath 'runtime\python\Scripts\python.exe'
$enginePython = if (Test-Path -LiteralPath $portablePython) { $portablePython } else { $venvPython }
$skillScript = Join-Path (Split-Path -Parent $PSScriptRoot) 'yingke-media\scripts\media.py'
Invoke-Checked $enginePython @($skillScript,'--engine',$EnginePath,'doctor')
$oldValue = [Environment]::GetEnvironmentVariable('YINGKE_ENGINE_ROOT','User')
if (-not $oldValue -or $oldValue -eq $EnginePath) {
    [Environment]::SetEnvironmentVariable('YINGKE_ENGINE_ROOT',$EnginePath,'User')
    Write-Host '已设置当前用户的 YINGKE_ENGINE_ROOT；重启终端或 Codex 后生效。'
} else {
    Write-Host "保留了已有 YINGKE_ENGINE_ROOT。使用新引擎时请指定 --engine `"$EnginePath`"。"
}
Write-Host "引擎准备完成：$EnginePath"
