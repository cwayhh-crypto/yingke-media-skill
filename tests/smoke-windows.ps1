param(
    [Parameter(Mandatory=$true)][string]$Engine,
    [Parameter(Mandatory=$true)][string]$TestDirectory
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$media = Join-Path $repo 'yingke-media\scripts\media.py'
$python = Join-Path $Engine 'runtime\python\Scripts\python.exe'
$ffmpeg = Join-Path $Engine 'bin\ffmpeg.exe'
$server = $null
$started = $false
New-Item -ItemType Directory -Path $TestDirectory -Force | Out-Null

function Invoke-Media([string[]]$CommandArgs) {
    $result = & $python $media --engine $Engine @CommandArgs
    if ($LASTEXITCODE -ne 0) { throw "media.py failed: $($CommandArgs -join ' ')" }
    return ($result -join [Environment]::NewLine | ConvertFrom-Json)
}
function Assert-File([string]$Path) {
    if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing output: $Path" }
    if ((Get-Item -LiteralPath $Path).Length -le 0) { throw "Empty output: $Path" }
}
try {
    $doctor = Invoke-Media @('doctor')
    if (-not $doctor.ready) { throw 'Engine doctor did not pass.' }
    $health = Invoke-Media @('start')
    if (-not $health.ready) { throw 'Engine did not start.' }
    $started = $true
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $status = Invoke-Media @('status')
        if ($status.transcription.ready -and $status.transcription.diarization.ready) { $ready = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw 'Transcription and speaker models did not become ready.' }

    # This sample comes from the public OpenAI Whisper test suite, pinned to a commit.
    $sample = Join-Path $TestDirectory 'jfk.flac'
    $sampleUrl = 'https://raw.githubusercontent.com/openai/whisper/86098128c0b4f24f0e2aa2994de830614b474227/tests/jfk.flac'
    Invoke-WebRequest -Uri $sampleUrl -OutFile $sample -UseBasicParsing
    Assert-File $sample
    $video = Join-Path $TestDirectory 'sample.mp4'
    & $ffmpeg -v error -f lavfi -i 'color=c=black:s=320x180:r=10' -i $sample -c:v libx264 -c:a aac -shortest -y $video
    if ($LASTEXITCODE -ne 0) { throw 'Could not generate the local test video.' }
    Assert-File $video

    $server = Start-Process -FilePath $python -ArgumentList @('-m','http.server','47800','--bind','127.0.0.1') -WorkingDirectory $TestDirectory -WindowStyle Hidden -PassThru
    $serverReady = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try { $null = Invoke-WebRequest -Uri 'http://127.0.0.1:47800/sample.mp4' -Method Head -UseBasicParsing -TimeoutSec 2; $serverReady = $true; break } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $serverReady) { throw 'Local media server did not start.' }
    $output = Join-Path $TestDirectory 'workflow-output'
    $state = Invoke-Media @('--wait-seconds','900','workflow','http://127.0.0.1:47800/sample.mp4','--diarize','--output-dir',$output)
    if ($state.status -ne 'done') { throw 'Workflow did not complete.' }
    foreach ($file in @($state.video,$state.audio,$state.poster,$state.subtitles.srt,$state.subtitles.vtt,$state.subtitles.txt,$state.subtitles.csv,$state.subtitles.json)) { Assert-File $file }
    $transcript = Get-Content -LiteralPath $state.subtitles.txt -Raw -Encoding UTF8
    if ($transcript -notmatch '(?i)country') { throw 'The expected spoken phrase was not recognized.' }
    if ($transcript -notmatch '说话人') { throw 'Speaker labels were not emitted.' }
    Write-Output 'Fresh install smoke test passed: download, video, audio, poster, diarization and five subtitle formats.'
} finally {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
    if ($started) { $null = & $python $media --engine $Engine stop }
}
