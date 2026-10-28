# 映刻媒体与字幕 · Yingke Media Skill

让支持本地文件和命令执行的 AI Agent 把视频素材准备好：下载可获取的最高画质，收录独立音频与封面，并用本地模型生成带时间轴的字幕。适用于 Codex 等支持 `SKILL.md` 的工具。

> 当前为 Windows 10/11 x64 版本。Skill 需要映刻引擎；源码仓库不包含大体积运行时和模型。首次准备引擎需联网并预留约 3 GB 空间。

## 能做什么

- 根据单条视频链接下载视频、音频和封面；保存前核对文件。最高画质指下载器当时可获得的最高画质。
- 从本地视频或音频提取语音，导出 SRT、VTT、TXT、CSV、JSON。可选匿名说话人分组；识别结果需要人工校对。
- 用一个 `workflow` 串联处理，保留任务记录，支持同一任务目录续接。
- 媒体转写在本机 CPU 运行。联网下载受站点、网络、账号权限和链接有效期影响，不能保证每个网站均可用。

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

安装涉及来自上游站点的下载。若遇到网络或证书错误，请检查本机网络和证书配置；脚本不会关闭证书校验。如果安装中途失败，未完成的目标目录会保留以便检查；更换 `-EnginePath` 指定一个新目录后可重新安装。

## 使用

在 Codex 中直接说：

> `$yingke-media` 下载这个视频，保存音频和封面，并生成带时间轴的字幕：视频链接

或者：

> `$yingke-media` 为 `D:\素材\采访.mp4` 生成字幕，区分两位说话人。

Agent 会先检查引擎，再启动本地服务、提交任务并核验实际文件。若音频没有识别到讲话，不会编造字幕。公开源码版不包含桌面登录程序；需要账号会话时，可在明确授权后提供 `cookies.txt`，不自动读取浏览器登录数据。请只处理你有权使用的内容。

### 命令行示例

```powershell
$engine = $env:YINGKE_ENGINE_ROOT
$skill = Join-Path $env:USERPROFILE '.codex\skills\yingke-media'
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

已在一台 Windows x64 电脑测试从现有便携引擎复制依赖、启动源码版引擎，并将测试语音导出为 SRT 和 TXT；原便携版曾成功下载一条抖音视频。全新联网安装尚未完成端到端验证：当前测试环境连接 Node.js 上游时中断。其他网站、登录流程和其他电脑的兼容性仍需验证。
