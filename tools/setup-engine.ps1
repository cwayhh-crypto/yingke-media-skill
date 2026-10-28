param(
    [string]$EnginePath = (Join-Path $env:LOCALAPPDATA 'YingkeMedia\engine'),
    [string]$PythonPath = 'python',
    [string]$FromPortableEngine = '',
    [switch]$Resume
)
$ErrorActionPreference = 'Stop'
if (-not [Environment]::Is64BitOperatingSystem) { throw '需要 64 位 Windows。' }
$EnginePath = [IO.Path]::GetFullPath($EnginePath)
$template = Join-Path (Split-Path -Parent $PSScriptRoot) 'engine-template'
if (-not (Test-Path -LiteralPath (Join-Path $template 'gateway.mjs'))) { throw '找不到 engine-template。' }
$marker = Join-Path $EnginePath '.yingke-install-state.json'
$mode = if ($FromPortableEngine) { 'portable' } else { 'network' }
$python = $null
if ($FromPortableEngine) {
    $FromPortableEngine = (Resolve-Path -LiteralPath $FromPortableEngine).Path
    if ($EnginePath.StartsWith($FromPortableEngine + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw '安装目录不能位于原引擎内部。' }
} else {
    $python = (Get-Command $PythonPath -ErrorAction Stop).Source
}

function Invoke-Checked([string]$Program, [string[]]$CommandArgs) {
    & $Program @CommandArgs
    if ($LASTEXITCODE -ne 0) { throw "命令失败：$Program（退出码 $LASTEXITCODE）" }
}
function Get-VerifiedFile([string]$Url, [string]$Destination, [string]$ExpectedHash) {
    if (Test-Path -LiteralPath $Destination) {
        if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -ne $ExpectedHash) { throw "已有文件的 SHA256 不匹配，未覆盖：$Destination" }
        Write-Host "复用已校验文件：$(Split-Path -Leaf $Destination)"
        return
    }
    $partial = "$Destination.part"
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Write-Host "下载 $Url （第 $attempt 次）"
            Invoke-WebRequest -Uri $Url -OutFile $partial -UseBasicParsing -TimeoutSec 1200
            $actual = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash
            if ($actual -ne $ExpectedHash) { throw "SHA256 不匹配：$Url" }
            Move-Item -LiteralPath $partial -Destination $Destination
            return
        } catch {
            if ($attempt -eq 3) { throw "下载未完成：$Url。$($_.Exception.Message) 可检查网络后使用 -Resume 续装。" }
            Start-Sleep -Seconds ($attempt * 2)
        }
    }
}

if (Test-Path -LiteralPath $EnginePath) {
    if (-not $Resume -or -not (Test-Path -LiteralPath $marker -PathType Leaf)) { throw "目标已存在，未覆盖：$EnginePath。若是新版安装器中断的任务，可使用 -Resume。" }
    $state = Get-Content -LiteralPath $marker -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($state.schema -ne 'yingke-engine-install/1' -or $state.status -ne 'incomplete' -or $state.mode -ne $mode) { throw '该目录不是可续装的未完成任务，未进行修改。' }
    if ($mode -eq 'portable' -and $state.source -ne $FromPortableEngine) { throw '续装时须使用原来的便携引擎目录。' }
    if ($mode -eq 'network' -and $state.source -ne $python) { throw '续装时须使用原来的 Python 解释器。' }
} else {
    if ($Resume) { throw "没有找到待续装的目录：$EnginePath" }
    New-Item -ItemType Directory -Path $EnginePath -Force | Out-Null
    $source = if ($mode -eq 'portable') { $FromPortableEngine } else { $python }
    $state = @{ schema = 'yingke-engine-install/1'; status = 'incomplete'; mode = $mode; source = $source }
    [IO.File]::WriteAllText($marker,($state | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
}
foreach ($file in Get-ChildItem -LiteralPath $template -File -Recurse) {
    $relative = $file.FullName.Substring($template.Length).TrimStart([char[]]@('\','/'))
    $target = Join-Path $EnginePath $relative
    if (Test-Path -LiteralPath $target) {
        if ((Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $file.FullName).Hash) { throw "引擎源码与安装包不一致，未覆盖：$target" }
    } else {
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $target
    }
}
if ($FromPortableEngine) {
    # Only copy program dependencies; never copy jobs, downloads, sessions or tokens.
    foreach ($name in @('runtime','bin','models')) {
        $source = Join-Path $FromPortableEngine $name
        if (-not (Test-Path -LiteralPath $source)) { throw "原引擎缺少 $name：$FromPortableEngine" }
        $destination = Join-Path $EnginePath $name
        if (Test-Path -LiteralPath $destination) { throw "便携引擎的复制已部分完成，请指定新的 -EnginePath：$destination" }
        Copy-Item -LiteralPath $source -Destination $destination -Recurse
    }
} else {
    # Python is supplied by the user; dependencies are installed into an isolated venv.
    Invoke-Checked $python @('-c','import struct,sys; assert struct.calcsize("P")==8 and (3,12)<=sys.version_info[:2]<=(3,13), "64-bit Python 3.12 or 3.13 required"')
    $runtime = Join-Path $EnginePath 'runtime'
    $bin = Join-Path $EnginePath 'bin'
    $modelDir = Join-Path $EnginePath 'models\asr\small'
    $speakerDir = Join-Path $EnginePath 'models\diarization'
    foreach ($dir in @($runtime,$bin,$modelDir,$speakerDir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $venvPython = Join-Path $runtime 'python\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $venvPython)) { Invoke-Checked $python @('-m','venv',(Join-Path $runtime 'python')) }
    # PyAV 19 removed metadata_errors, which faster-whisper 1.2.1 still uses.
    Invoke-Checked $venvPython @('-m','pip','install','--retries','3','--timeout','60','faster-whisper==1.2.1','sherpa-onnx==2.0.0','av==18.1.0')
    Get-VerifiedFile 'https://nodejs.org/dist/v24.19.0/win-x64/node.exe' (Join-Path $runtime 'node.exe') '3602F2BB1A10F2CBAB4C36886218A33C1AB3DB87290E73B033C46C77147D0237'
    Get-VerifiedFile 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.21/yt-dlp.exe' (Join-Path $bin 'yt-dlp.exe') '33121D192D706E62F684A06F80918E3F3A8BA52AC3A65213B6951C39C7D9F555'
    $ffmpegArchive = Join-Path $EnginePath 'ffmpeg.zip'
    Get-VerifiedFile 'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.1.2-essentials_build.zip' $ffmpegArchive 'DB580001CAA24AC104C8CB856CD113A87B0A443F7BDF47D8C12B1D740584A2EC'
    $extractPath = Join-Path $EnginePath 'ffmpeg-extract'
    Expand-Archive -LiteralPath $ffmpegArchive -DestinationPath $extractPath -Force
    foreach ($name in @('ffmpeg.exe','ffprobe.exe')) {
        $matches = @(Get-ChildItem -LiteralPath $extractPath -Filter $name -File -Recurse)
        if ($matches.Count -ne 1) { throw "FFmpeg 压缩包中 $name 的数量异常。" }
        $destination = Join-Path $bin $name
        if (Test-Path -LiteralPath $destination) {
            if ((Get-FileHash -LiteralPath $destination).Hash -ne (Get-FileHash -LiteralPath $matches[0].FullName).Hash) { throw "已有工具文件不一致，未覆盖：$destination" }
        } else { Copy-Item -LiteralPath $matches[0].FullName -Destination $destination }
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
if ($mode -eq 'network') { Invoke-Checked $enginePython @('-c','import av, faster_whisper, sherpa_onnx; assert av.__version__ == "18.1.0"; print("Python media dependencies ready")') }
$state.status = 'complete'
[IO.File]::WriteAllText($marker,($state | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
$oldValue = [Environment]::GetEnvironmentVariable('YINGKE_ENGINE_ROOT','User')
if (-not $oldValue -or $oldValue -eq $EnginePath) {
    [Environment]::SetEnvironmentVariable('YINGKE_ENGINE_ROOT',$EnginePath,'User')
    Write-Host '已设置当前用户的 YINGKE_ENGINE_ROOT；重启终端或 Codex 后生效。'
} else {
    Write-Host "保留了已有 YINGKE_ENGINE_ROOT。使用新引擎时请指定 --engine `"$EnginePath`"。"
}
Write-Host "引擎准备完成：$EnginePath"
