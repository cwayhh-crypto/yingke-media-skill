<p align="center">
  <img src="yingke-media-banner.png" alt="Yingke Media：从视频到音频、封面与字幕" width="100%">
</p>

<h1 align="center">映刻媒体与字幕 · Yingke Media Skill</h1>

<p align="center"><strong>给 AI Agent 一个视频链接，让它帮你准备视频、音频、封面和字幕。</strong></p>

<p align="center">抖音 · 小红书 · YouTube · B站 · TikTok · 本地音视频</p>

<p align="center">Windows 10/11 x64 ｜ 本地语音识别 ｜ 时间轴字幕 ｜ 可选说话人分组</p>

在 Codex 等支持 `SKILL.md` 的 Agent 里，一句话就能开始：

> 使用 `$yingke-media` 下载这个视频，保存音频和封面，再生成带时间轴的字幕：粘贴视频链接

## 支持的平台

| 平台 | 可尝试的内容 | 说明 |
| --- | --- | --- |
| **抖音** | 单条视频页面或分享链接 | 已在本机成功下载过一条公开视频。 |
| **小红书 / RedNote** | 单篇视频页面或分享链接 | 建议保留分享链接中的完整参数。 |
| **YouTube / Shorts** | 单条视频或 Shorts 链接 | 使用 yt-dlp 解析及本地 JavaScript 运行时。 |
| **B站 / TikTok 等** | 下载器支持的单条视频 | 更多站点可查看 [yt-dlp 支持列表](https://github.com/yt-dlp/yt-dlp/blob/2026.10.21/supportedsites.md)。 |
| **本地文件** | 视频或音频 | 无需网络即可进行本地转写。 |

列出平台表示下载器具备相应解析能力，**不保证每条链接都能下载**。站点规则、登录、地区、会员及网络环境可能影响结果；目前除上述抖音单例外，其他平台尚未逐站完成端到端验证。仅处理你有权使用的内容。

## 能做什么

- **视频素材一次收齐**：下载当前可获取的最高画质，收录独立音频和封面，并核验实际文件。
- **字幕留有时间轴**：本地语音识别，导出 SRT、VTT、TXT、CSV 和 JSON。
- **可选说话人分组**：需要区分声音时开启；分组和文字结果都建议人工校对。
- **中断后可续接**：同一工作流保留任务记录，避免重复提交。

> 使用前需要 Windows 10/11 x64、映刻引擎，以及支持本地文件和命令执行的 Agent。首次安装引擎需联网并预留约 3 GB 空间。

## 安装

### 1. 获取仓库

下载本仓库 ZIP 并解压，或者在 PowerShell 中执行：

```powershell
git clone https://github.com/cwayhh-crypto/yingke-media-skill.git
cd yingke-media-skill
```

### 2. 安装 Skill

在仓库目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\install-skill.ps1
```

也可通过 Codex 的 `$skill-installer` 安装仓库内的 `yingke-media` 目录。如果目标目录已有同名 Skill，脚本会停止而不覆盖。安装后开启新的一轮对话。

### 3. 准备引擎

**首次安装：**安装 64 位 Python 3.12 或 3.13，并确认 `python --version` 指向该版本。然后运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\setup-engine.ps1
```

脚本会在 `%LOCALAPPDATA%\YingkeMedia\engine` 建立独立环境，从上游获取 Node.js、yt-dlp、FFmpeg、Python 依赖和模型，部分下载会校验 SHA-256。若 `python` 命令指向其他版本，请指定解释器：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\setup-engine.ps1 -PythonPath 'C:\path\to\python.exe'
```

**已有完整映刻 v3 便携引擎：**可复用其中的运行时、工具和模型，无需重新下载：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\setup-engine.ps1 -FromPortableEngine 'D:\path\to\Yingke-Windows-x64'
```

只复制 `runtime`、`bin` 和 `models`，不会复制任务、素材、登录数据或令牌。两种方式均不会覆盖已有引擎目录。脚本成功后会设置当前用户的 `YINGKE_ENGINE_ROOT`；如果原来已经配置了另一个引擎，则保留原设置并提示如何指定新路径。重启 Codex 后，新的环境变量才会生效。

安装涉及来自上游站点的下载。下载器会校验主要工具和说话人模型的 SHA-256，并对临时网络错误重试。新版**联网安装**中途断开时，检查网络后可使用原来的参数加 `-Resume` 续装：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\setup-engine.ps1 -Resume
```

自定义过 `-EnginePath` 或 `-PythonPath` 时，续装也要带上原参数。安装器只续接自己标记为未完成的目录，不会覆盖已有完整引擎或用户数据；旧版安装器创建的未完成目录没有续装标记，需指定新的 `-EnginePath`。便携引擎复制中断后请指定新的安装目录。证书或网络错误请检查本机配置，安装器不会关闭证书校验。

## 使用

在 Codex 中直接说：

> `$yingke-media` 下载这个视频，保存音频和封面，并生成带时间轴的字幕：视频链接

或者：

> `$yingke-media` 为 `D:\素材\采访.mp4` 生成字幕，区分两位说话人。

Agent 会先检查引擎，再启动本地服务、提交任务并核验实际文件。若音频没有识别到讲话，不会编造字幕。公开源码版不包含桌面登录程序；需要账号会话时，可在明确授权后提供 `cookies.txt`，不自动读取浏览器登录数据。请只处理你有权使用的内容。

### 命令行示例

```powershell
$engine = $env:YINGKE_ENGINE_ROOT
$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$skill = Join-Path $codexHome 'skills\yingke-media'
$python = if (Test-Path "$engine\runtime\python\python.exe") { "$engine\runtime\python\python.exe" } else { "$engine\runtime\python\Scripts\python.exe" }
& $python "$skill\scripts\media.py" --engine $engine doctor
& $python "$skill\scripts\media.py" --engine $engine start
& $python "$skill\scripts\media.py" --engine $engine status
& $python "$skill\scripts\media.py" --engine $engine workflow 'https://example.com/video' --output-dir 'D:\media\task-001'
```

需要说话人分组时加 `--diarize`；已知人数可加 `--speakers 2`。`status` 中 `transcription.ready`、`transcription.diarization.ready` 分别表示字幕与说话人组件是否就绪。

## 隐私与边界

本地服务绑定在 `127.0.0.1`，令牌、登录资料、任务记录和输出文件存放在引擎或用户指定的任务目录。请勿上传这些文件。仓库不含模型、第三方可执行文件、Cookie、用户素材和私人任务记录。

仓库包含 `yingke-media/` 技能、`engine-template/` 引擎源码，以及 `tools/` 安装脚本。站点限制、人机验证和受保护内容不会被绕过。当前公开源码版不支持 macOS、Linux、Windows ARM 或桌面应用内登录。

## 许可与第三方组件

本仓库项目代码采用 [MIT License](LICENSE)；第三方项目和模型各自适用其许可证，来源见 [THIRD-PARTY.md](THIRD-PARTY.md)。安装脚本从上游获取这些组件，不将它们打包在源码仓库中。


## 验证范围

已在 GitHub 托管的干净 Windows 环境中，使用 Python 3.12 完成全新联网安装，并通过本地 HTTP 视频的下载、音频和封面收录、语音识别、说话人分组与五种字幕格式的端到端测试。另在一台 Windows x64 电脑测试过从便携引擎复制依赖，并成功下载过一条抖音公开视频。其他平台和登录流程仍需逐站验证。
