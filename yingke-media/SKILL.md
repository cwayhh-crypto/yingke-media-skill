---
name: yingke-media
metadata:
  version: "1.1.0"
description: 下载最高可用画质视频并收录独立音频和海报，转写本地视频字幕、识别时间线和说话人，导出 SRT/VTT/TXT/CSV/JSON。用户要求下载素材、提取字幕、为 HYPIT 准备参考或让其他 Agent 使用映刻时使用，无需打开客户端窗口。
---

# 映刻素材与字幕

使用 scripts/media.py 执行操作，读取 JSON 并核对实际产物。不要把任务入队、退出码 0 或只有封面当成下载完成。

## 准备

Skill 不包含大型模型和运行时。需要 Windows 10/11 x64，以及解压后的映刻 v3 引擎目录；无需运行 Yingke.exe，无需 WebView2 即可使用下载和本地字幕命令。复用引擎中的 bin、runtime、models、apps，不要只复制 exe。

优先使用用户提供的目录或 YINGKE_ENGINE_ROOT；也可查找当前项目内已解压的映刻目录。不要写死作者电脑盘符。缺少引擎时明确说明依赖，不能声称 Skill 能独立运行。

以引擎自带 Python 执行：便携版位于 `runtime/python/python.exe`，源码安装版位于 `runtime/python/Scripts/python.exe`。先选择存在的路径赋给 `$python`。公开源码版不包含桌面登录程序，不能使用 `--app-session`，需要会话时只能在用户明确提供 cookies.txt 后使用 `--cookies`。

```powershell
$python = if (Test-Path "$engine/runtime/python/python.exe") { "$engine/runtime/python/python.exe" } else { "$engine/runtime/python/Scripts/python.exe" }
& $python "$skill/scripts/media.py" --engine "$engine" doctor
& $python "$skill/scripts/media.py" --engine "$engine" repair
& $python "$skill/scripts/media.py" --engine "$engine" start
```

repair 仅在服务停止时安装随附下载修复，备份旧代码，不覆盖用户数据。已修复时跳过。start 在后台启动本地服务，不打开客户端。占用端口属于其他目录时停止，不结束其他任务或绕过隔离。

## Agent 完整工作流

用户要“下载＋音频＋海报＋字幕”时，先执行 doctor、start、status，再运行统一命令：

```powershell
& $python "$skill/scripts/media.py" --engine "$engine" workflow "视频链接或本地视频绝对路径" --output-dir "本次任务专用目录"
```

workflow 调用已有网页版的 `/agent/v1` 接口：最高可用画质下载、核验视频、保存音频及海报、转写、说话人分离、导出 SRT/VTT/TXT/CSV/JSON。首次调用前必须 start；不要求打开网页或客户端。只有用户要求区分说话人才加 --diarize；可加 --speakers 2。本地视频可直接进入后处理；本地封面是视频截帧，不冒充网站海报。下载模式优先保留已下载的网站海报和音频。

任务目录中的 workflow.json 记录下载/字幕任务 ID、已完成产物和阻塞原因。同一输入、选项和目录再次调用会续接已有任务，不重复提交。超时不等于取消；失败任务不会自动重提。需要重做失败任务时先查看 jobs，确认状态，再使用新的任务目录。不要修改状态文件伪造成功。输入或说话人选项改变时使用新目录。状态 incomplete 时必须列出已完成与未完成项。

网络受限时不提交公网下载，也不移除限制标记或改用浏览器/桌面命令绕过。浏览器能播放不证明文件可下载；现有网页版仍由后端 yt-dlp 下载，此技能不含浏览器下载实现。仅当浏览器工具明确允许相应下载操作、且不存在绕过当前限制时，才可用网站提供的下载功能取得本地文件，再交给 workflow；否则如实报告阻塞。

status 的 ready 是服务可访问，不代表字幕组件可运行；必须另查 transcription.ready 和 transcription.diarization.ready。若为 false，可检查本地模型与日志。若 Node 启动 Python 返回 EPERM，应报告执行权限阻塞，不把它说成模型缺失，不通过其他执行工具绕过。现有模型齐全也不保证当前环境允许后台进程调用。

最高画质仅指下载器当前可获取的最高画质；未完成真实站点下载时，不能宣称端到端已跑通。

## 单独下载

```powershell
& $python "$skill/scripts/media.py" --engine "$engine" download "https://网站/视频链接"
```

默认最高可用画质、独立音频与海报，等待任务完成并检查文件。默认匿名；用户明确要求使用 APP 保存会话时加 --app-session，明确提供 cookies.txt 时加 --cookies "绝对路径.txt"。不自动读取外部浏览器资料。

音频或海报状态为失败或缺失时报告该项，不宣称全部成功。脚本等待超时不会取消后台任务，用 jobs 检查，不重复提交。

## YouTube 登录验证与 Cookie 重试

匿名下载遇到登录或人机验证时，先用 jobs 确认失败状态和诊断；不要无限重试，也不要自动读取浏览器登录资料。公开源码引擎没有 APP 内登录功能，不要引导用户在其中使用该功能；仅在实际桌面版支持且用户明确授权时使用 --app-session。

用户询问如何提供 Cookie 时，简明指导：在自己的浏览器登录 YouTube 并完成网页验证；用用户信任的浏览器扩展只导出当前 YouTube 站点的 Netscape 格式 cookies.txt，保存到本机；用户提供完整文件路径或明确指定查找目录并授权使用。可参考 [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)，提示检查扩展权限。不要要求用户粘贴文件内容，不自动导出全部网站的 Cookie；提醒该文件包含登录凭据，使用后可由用户删除。

得到授权后确认文件存在，以 --cookies 传入绝对路径，重新提交一次下载；不要在输出、日志或交付中暴露 Cookie 内容。若仍失败，核对 jobs 与实际诊断，说明验证、权限或其他阻塞，等待用户处理。Cookie 不保证成功，也不得绕过站点限制。

## 按指定目录交付下载

单独下载命令由引擎保存素材，完成后依据返回的 files 与 assets 状态找到实际视频、独立音频和网站封面；若用户指定其他目录，将成功产物复制到该目录。已有同名文件时先比较内容，不覆盖不同内容，选择不冲突的文件名。复制后检查文件非空并比对源文件与目标文件的哈希；用 ffprobe 等工具核验视频时长、分辨率和音视频轨道。报告每项真实路径、未完成项和验证范围。

链接中的播放时间参数通常只指定播放起点；下载默认是完整视频。只有用户明确要求截取时才进行截取，并确认起止时间。

## 字幕

```powershell
& $python "$skill/scripts/media.py" --engine "$engine" transcribe "绝对路径/视频.mp4" --diarize --output-dir "绝对路径/字幕"
```

默认本地 small 模型、自动语言、保留时间线，导出 SRT/VTT/TXT/CSV/JSON，使用输入视频文件名。用户要求区分说话人时加 --diarize，已知人数可加 --speakers 2。标签是声音分组，不是人物身份。

可选 --formats srt txt、--no-speakers；--no-timestamps 仅影响 TXT/CSV/JSON，SRT/VTT 保留时间。已有文件不覆盖，选择新的输出目录。没有语音不编造字幕。

## 检查与交付

- doctor 检查依赖，status 检查模型，jobs 查看任务，assets 查看素材；stop 仅关闭无活动任务的当前引擎。
- 保留执行环境网络限制，不删除环境变量、不关闭 TLS 或浏览器安全保护。
- 区分登录、人机验证、限流、链接失效、组件启动失败。不承诺所有网站可下载，不无限重试，需要真人验证时报告具体阻塞。
- Agent 自行查看本机任务和日志，不要求用户上传日志；回复不暴露 cookie、token 或带签名链接。
- 汇报实际生成路径、字幕格式、说话人选项和未完成项目。不能用本地样例成功代替网站下载成功。
- 下游 HYPIT 分析时将验证过的视频和字幕路径交给已安装的 HYPIT skill。下载 Skill 不等于已完成逆向复刻。

## 跨电脑

复制整个干净的映刻 v3 引擎目录，以及本 Skill 文件夹。将 Skill 放入目标 Agent 的技能目录并重新加载，或让 Agent 直接读取 SKILL.md。配置 --engine 或 YINGKE_ENGINE_ROOT。

不要分发 data/agent-token.txt、data/site-sessions 或用户素材。换电脑后重新授权，旧任务的绝对路径可能失效，使用新路径创建任务。后台仍是绑定 127.0.0.1 的本地服务，不需要公开到互联网。当前不支持 macOS/Linux。
