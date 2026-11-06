# Scrylet

<img src="web/brand/icon.svg" width="80" height="80" alt="Scrylet 应用图标" />

**Capture a question. Carry the answer.**

电脑截取问题，手机接住答案。Scrylet 是 Snap-Solver 的新名称。

在 macOS / Windows 启动桌面 App，手机连同一局域网并扫码。每次截屏添加一张图片，可以连续添加、按需框选，再把图片与问题一起发送。

![Scrylet 电脑连接窗口](artifacts/scrylet-desktop.png)

[手机页面](artifacts/scrylet-phone-chromium.png) · [模型设置](artifacts/scrylet-models-chromium.png) · [手机连接](artifacts/scrylet-pair-chromium.png)

[手机自动朗读回答](artifacts/read-aloud-phone-chromium.png)

[手机声音与语速设置](artifacts/voice-settings-phone-chromium.png)

[电脑静默截图设置](artifacts/scrylet-settings.png)

## Windows 客户端

Windows x64 安装包生成在 `dist/Scrylet-2.0.0-dev.6-win-x64-Setup.exe`。运行安装向导后，从桌面或开始菜单打开 Scrylet。客户端包含 Python 3.12 与 Open WebUI 0.12.2，使用时无需另装 Node.js、Python、uv 或 Docker。安装包当前未签名，没有自动更新功能。

已生成的安装包和校验文件见 [GitHub Releases](https://github.com/1162706031/Scrylet/releases/tag/v2.0.0-dev.6)。

## 源码启动

需要 Node.js 22+，以及 [uv](https://docs.astral.sh/uv/getting-started/installation/) 或 Python 3.12。

```sh
npm ci
npm run setup
npm start
```

`setup` 优先使用 uv 创建 `.runtime` 并准备 Python 3.12；没有 uv 时，macOS 使用 `python3.12`、Windows 使用 `py -3.12`。首次安装需要联网下载 Electron、Python 运行环境与聊天框架。后续使用不需要 Docker。

源码运行方式适用于开发；Windows 还可以使用上述安装包。

## 使用

1. 在电脑打开 App，允许屏幕录制权限；macOS 开发态权限名称是 **Electron**，授权后重启。
2. 手机连接同一 Wi-Fi，扫描二维码。
3. 点击页面右上角的 **连接模型**，添加 API Key；之后可通过 **模型设置** 管理连接。也会首次导入旧版 `.snapsolver/` 中的现有密钥和提示词。
4. 点击 **截屏** 直接追加整屏图片；旁边的 **框选** 用于裁剪。可以连续添加多张（每次最多 12 张）；图片按顺序编号，点开可翻看与放大，删除和清空可在 10 秒内撤销。
5. 写下问题，统一发送。回答后可继续追问或切换模型。
6. 手机顶部的 **朗读关** 默认关闭；点击变为 **朗读开** 后，每轮回答完成会自动朗读，无需逐条操作。开关仅记在当前浏览器，关闭会立即停读；也可点 **停止朗读** 只停止本次。刷新和打开历史不会重播旧回答。使用手机系统语音，无需配置朗读服务 API；刷新后首次轻触页面可恢复浏览器的语音会话，切到后台或锁屏可能被系统暂停。
7. 点击输入区“添加图片”旁的 **声音**，可以选择系统提供的音色、调节语速并试听。默认自动优选同语言中带高品质、增强或自然标识的声音，语速为 0.95×；每段正文连续合成，减少短句之间的割裂。试听不会开启自动朗读，音色与语速只记在当前浏览器。

二维码默认优先使用普通局域网网卡，降低 Meta / Clash / TUN / VPN、虚拟网卡及 `198.18.0.0/15` 地址的优先级。多个网络时，展开“手动连接与网络设置”选择手机能访问的网卡；选择会在重启后保留，同一网卡的 IP 变化时自动重新匹配。网卡暂时断开时回退到可用网络。切换地址后二维码自动更新，需要重新扫码。

## 在电脑截屏并自动提问

手机首次扫码、连接模型后，保持聊天页面在前台。之后可以只操作电脑，截图与默认提示词会由手机的原生聊天框自动发送，回答直接显示在当前对话。

- **全屏截图**：点击电脑窗口或托盘中的“截屏并发送”，或按 `Ctrl+Alt+S`，截取鼠标所在屏幕。
- **区域截图**：在左上角按住鼠标左键 **1.2 秒**，松开；在 **5 秒内**开始按住右下角 **1.2 秒**，松开后自动截图并发送。也可以先点击“区域截屏”或按 `Ctrl+Alt+A`。
- **取消**：等待第二个角超时后自动恢复默认；选区时也可以按 `Esc`。两个角需要在同一块屏幕中。
- **自定义**：展开“截图操作与默认提示词”，修改全屏、区域和取消快捷键、鼠标按键、长按时长、等待时间与提示词。可选的“双击截全屏并发送”默认关闭。
- **截图静默**：截图成功或失败均不播放声音、不显示选区框、倒计时、结果通知或托盘提示，不自动恢复或聚焦电脑窗口。旧版“显示截图提示”配置会被忽略；手机通知声与振动保持关闭，回答朗读仅在手机主动开启后使用，截图不显示结果弹窗或附件高亮。

全局鼠标手势目前支持 Windows。拖动鼠标不算长按；手机已有草稿、正在生成回答、位于后台或断线时暂不发送，原因可在电脑操作日志查看。发送只交给一个接收页面，不重放未确认的操作；多页面打开时，以最近激活的聊天页面为接收端。手机上的“截屏 / 框选”仍只追加附件，等待手动发送。

电脑关窗后继续在菜单栏 / 托盘运行；退出 App 会停止后台服务。二维码与连接码 10 分钟轮换，已配对设备不会因此掉线。通常重启会复用原端口；端口被占用或电脑更换网络时，请重新扫码。

手机之间共享这台电脑的聊天记录和模型设置，适合个人设备。桌面可以撤销设备或暂停访问。局域网连接使用 HTTP，只在可信局域网使用，不应直接映射到公网。

## 聊天运行层与模型

复用 **[Open WebUI 0.12.2](https://github.com/open-webui/open-webui/releases/tag/v0.12.2)** 的现有 UI 和运行层：多轮对话、历史、流式输出、停止、模型切换、Markdown / 公式 / 代码。截图作为它原生的图片附件加入，没有再实现一套聊天引擎。

2026-10-16 按官方目录整理了 6 家服务、16 款支持图像输入的模型：OpenAI、Anthropic、Google、通义千问、豆包、Kimi。型号、协议及来源见 [模型目录](config/providers.json) 和 [架构说明](docs/architecture.md)。手机端只保留模型连接表单，可修改内置服务的兼容地址。是否可调用取决于账户、地区、服务地址和模型权限。

手机界面保留截图、图片附件、聊天、历史和模型切换。语音通话、工作空间、知识库、联网搜索、图像生成、工具与管理面板等不再作为产品入口；相关写入路由在网关禁用。启动时按产品边界覆盖旧的功能开关，保留模型密钥与聊天记录。自动标题、自动追问等额外模型请求保持关闭。

## 数据与迁移

电脑窗口底部展开“操作日志与缓存”，可以查看最近 200 条操作、筛选异常、刷新记录，或清理页面与代码缓存。日志在本机轮换保存，记录截图、发送、配对、暂停和设置操作，不记录密钥、提示词、图片或聊天正文。清理缓存不会删除聊天、图片附件、模型密钥、配对、设置及操作日志。

- 新安装的密钥、聊天、附件保存在 Electron userData：macOS 通常为 `~/Library/Application Support/Scrylet/`，Windows 为 `%APPDATA%/Scrylet/`。若已有旧版 `Snap-Solver/` 数据目录，则继续原地使用，避免改名后丢失设置和聊天；安装程序沿用原应用 ID。
- 截屏只发生在主动点击时；发送后，所选图片、文字及对话上下文会交给所选模型服务。
- 旧 `.snapsolver/` 和 `config/prompts.json` 只读迁移，不删除原文件。原提示词成为 `/snap-…` 快捷提示词，可在原生聊天框里输入 `/` 使用。
- 新框架已有设置优先，重启不会覆盖在手机上做的修改；导入后可移除某家密钥而不被再次导回。
- 旧版浏览器里的临时结果没有统一的会话存储，本次没有将它们转换成新聊天记录。

详细步骤见 [使用指南](docs/beginner-tutorial.md)。

本项目基于 [Zippland / Snap-Solver](https://github.com/Zippland/Snap-Solver) 继续开发，保留原有许可证与第三方声明。

## 开发与验证

```sh
npm run check
npm test
npx playwright install chromium webkit
npm run test:ui
npm run test:desktop
npm run test:desktop-input # Windows 本机快捷键、长按、区域截图与自动发送
npm run test:silent        # 隔离验证静默截图、声音与通知拦截
npm run test:maintenance   # 日志、缓存、数据保留与重启检查
npm run test:network       # 默认网卡、手动切换、重启记忆与局域网配对
npm run dist:win           # Windows x64 本机生成 NSIS 安装 EXE
```

浏览器测试使用真实 Open WebUI 和本地模拟模型，**不使用真实 API Key、不调用外部模型**。桌面检查使用独立数据目录，实际调用本机截屏。验证范围和限制见 [验收记录](docs/verification.md)。

| 目录          | 职责                                          |
| ------------- | --------------------------------------------- |
| `desktop/`    | Electron 生命周期、系统截屏、局域网配对与代理 |
| `desktop/ui/` | 桌面连接窗口                                  |
| `web/`        | 手机配对、模型初设、截图附件与框选扩展        |
| `runtime/`    | 固定版本的 Open WebUI 启动入口与依赖          |
| `config/`     | 模型目录与提示词种子                          |
| `tests/`      | 配对测试、真实框架浏览器流程及模拟模型        |

本项目遵循仓库的 [Apache-2.0 License](LICENSE)。Open WebUI 是保留原有界面标识与许可证的第三方组件；Windows 安装包附带运行层及相关许可文件，见 [第三方说明](THIRD_PARTY_NOTICES.md)。
