param([string]$Destination = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $Destination) {
    $codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
    $Destination = Join-Path $codexHome 'skills\yingke-media'
}
if (Test-Path -LiteralPath $Destination) { throw "目标已存在，未覆盖：$Destination" }
New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repo 'yingke-media') -Destination $Destination -Recurse
Write-Output "已安装 Skill：$Destination。重新开始一轮对话即可使用。"
