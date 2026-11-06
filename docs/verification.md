# 验收记录

更新日期：2026-11-06。已在 Windows 本机生成并验收 x64 NSIS 安装包；当前未签名、未发布到外部渠道。

## 2026-11-06 更名为 Scrylet 并更新图标（2.0.0-dev.6）

项目采用 Scrylet 新名称与深蓝底、白色 S、薄荷色光点图标。图标覆盖 EXE / NSIS、窗口、托盘、自有配对 / 等待页、手机状态标识与文档，提供 7 档 ICO、PNG、手机收藏图标和 macOS 模板。保留 Open WebUI 自身的标识和署名。安装 ID 继续使用 `com.snapsolver.desktop`，已有 Snap-Solver userData 直接沿用；新安装才使用 Scrylet 目录，内部路由、Cookie、环境变量与朗读偏好保留兼容。

47 项离线检查通过，含旧数据路径、显式隔离路径和新安装路径验证。Chromium / WebKit 共 4 项品牌检查通过，覆盖配对、图标加载、聊天标题、模型设置与等待页。Windows 源码与解包客户端均验证新名称 / 图标加载、2560 × 1440 原生截图及静默交付：显示、聚焦、通知、提示音、闪烁、托盘提示和选区窗口计数均为 0，两个提示音资源采样峰值均为 0，模型请求只到本地模拟服务。未进行实体手机、macOS 或旧版覆盖安装实测。

最终安装包 `Scrylet-2.0.0-dev.6-win-x64-Setup.exe` 为 308,753,932 字节，SHA-256 `13bbf529f3f0bb34165aaab6b85934398477f91a3df0138607d9feaa7aec7d55`。50 个打包应用源码文件与当前项目一致，835 项归档资源审计未包含私密运行数据或开发依赖；99 份包元数据的 160 条必需依赖链接均可解析。第一次构建早于最后一处手机图标样式修改，源码比对及时发现 `web/mobile.css` 不一致，该包未发布；重新打包后全量比对通过，记录保留在 `.test-data/scrylet-package-first-mismatch.json`。

GitHub 目标为 `1162706031/Scrylet` 私有仓库，保留上游项目出处、许可证和历史。源码上传排除 `.runtime/`、`.test-data/`、本地配置及安装包二进制，安装包单独通过 Releases 提供。新桌面截图遮住二维码与连接码；历史截图保留在本地，本次不重新提交。通用静默验收文件会随复测更新，当前品牌证据使用独立的 Scrylet 文件。

证据：[安装包校验](../artifacts/scrylet-installer-check.json)、[源码原生检查](../artifacts/scrylet-native-check.json)、[解包客户端检查](../artifacts/scrylet-packaged-check.json)、[依赖完整性](../artifacts/scrylet-dependencies-check.json)、[桌面界面](../artifacts/scrylet-desktop.png)、[手机页面](../artifacts/scrylet-phone-chromium.png)、[配对页](../artifacts/scrylet-pair-chromium.png)。

## 2026-11-06 手机声音优选与试听（2.0.0-dev.5）

按用户选择继续使用手机系统声音，无需新增语音服务配置。默认从同语言 / 地区音色中优先选择名称或 URI 带高品质、增强、自然标识的声音，属于启发式优选，不保证手机有特定音色或真人音质。新增输入区“声音”入口，面板支持手选、试听与 0.8×～1.2× 语速，默认 0.95×。短句按段落合成，让系统处理标点停顿。声音与速度只存在当前浏览器；列表延迟载入、已选音色暂不可用和刷新均保留选择，必要时自动回退。

自动朗读继续默认关闭。打开设置不发声，试听要求手机前台中的真实点击，不会开启自动朗读；关闭面板立即取消试听并返回焦点。电脑浏览器不显示声音入口，专用试听接口也拒绝电脑与合成事件。原有上游播放、通知、振动和静音提示文件保护继续保留。

语法 / 目录检查、44 项离线检查、Chromium / WebKit 共 44 项相关浏览器检查全部通过，无跳过或重试成功项。浏览器覆盖完整朗读专项、电脑截图交付及静默参数、两份提示音文件与真实后台完成事件。新增专项覆盖高品质音色优选、真实点击试听、试听后自动朗读仍关闭、手选 / 语速保存与刷新、声音延迟载入与回退、320 / 390 像素面板，以及桌面与合成事件无法试听。设备语音引擎使用模拟实现，模型请求只访问本地模拟服务；未进行实体手机音质、扬声器、锁屏、新版实际安装或原生截图验收。

首轮朗读检查 22 通过、2 失败，测试夹具积累配对设备达到正常的 8 台上限；现改为每项前移除该隔离夹具的旧设备，保留产品限制。随后面板专项发现 Chromium 原生 close 事件异步导致停读断言过早、WebKit 未返回入口焦点，已改成关闭动作同步停读并显式返回焦点。失败轨迹分别保留在 `.test-data/voice-pair-limit-failure/` 和 `.test-data/voice-preview-check/`。最终 44 项一次通过。

Windows x64 安装包 `dist/Snap-Solver-2.0.0-dev.5-win-x64-Setup.exe`，308,553,744 字节，SHA-256 `1786796a8108387e6e56f8dfb0a8fbd27a70b8402624098cdc3361cda9911511`，附带 `.sha256`，当前未签名。45 个应用源码与当前项目一致，829 项资源审计未发现私密数据或开发依赖。最终打包时 npm 未返回依赖树，构建器采用目录遍历回退；额外检查全部 99 份包元数据的 160 条必需依赖链接均可在归档中解析。依赖审计辅助脚本首轮因 Windows ASAR 路径分隔符报错，改用本机路径格式后通过，记录于 `.test-data/voice-dependency-audit-first-failure.json`。更新时从托盘退出旧版，再安装并重新打开手机页面。

证据：[功能与浏览器检查](../artifacts/voice-settings-check.json)、[安装包检查](../artifacts/voice-settings-installer-check.json)、[依赖完整性](../artifacts/voice-settings-dependencies-check.json)、[手机面板](../artifacts/voice-settings-phone-chromium.png)、[WebKit 面板](../artifacts/voice-settings-phone-webkit.png)、[窄屏面板](../artifacts/voice-settings-narrow-webkit.png)。

## 2026-11-06 手机自动朗读回答（2.0.0-dev.4）

手机顶部新增“朗读关 / 朗读开”，默认关闭，仅保存在当前浏览器。开启后，本页面每轮新回答完成时自动分段朗读，包含电脑截图自动提交后的回答；关闭立即停读，也可单独停止本次朗读。刷新与打开历史不重播旧回答，后台或切换对话取消朗读。电脑浏览器不显示该开关，手机专用语音接口也拒绝电脑 UA；上游媒体、语音播放、通知、振动和两份提示音资源的静默保护继续保留。

复用固定版 Open WebUI 0.12.2 的真实 `chat:start` / `chat:finish` 事件，不增加聊天引擎或模型请求。朗读使用手机系统 SpeechSynthesis，无需另配服务；首次开启以零音量短句建立语音会话，刷新后自然交互可重新建立。接口依据 [MDN SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/speak)，iOS 首次语音的交互限制参考 [WebKit 实现](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/speech/SpeechSynthesis.cpp)。锁屏和后台发声不作保证，当前功能在进入后台时主动停读。

语法 / 目录检查、38 项离线测试、完整的 Chromium / WebKit 共 58 项浏览器集成检查全部通过，无跳过或重试成功项。新增 16 项浏览器用例覆盖默认静默、真实流式完成和连续追问、重复事件去重、电脑截图自动发送、停读与关闭、刷新偏好和历史、模拟后台与切换对话、语音异常、不支持 API、电脑拒绝朗读以及 390 / 320 像素布局。上游会话和本地模拟模型真实运行，只有设备语音引擎使用模拟实现，未让测试机扬声器发声。原有真实媒体播放与全零音频检查也在完整回归中通过。

首轮新增专项 10 通过、4 失败，原因分别为测试点击上游隐藏的新对话按钮，以及桌面测试上下文继承了手机 UA。改为可见的侧栏新对话入口并显式设置桌面 UA 后，完整 58 项一次通过；失败轨迹保存在 `.test-data/read-aloud-first-run-failure/`。未进行实体手机扬声器、锁屏、真实模型账户或新版本实际安装验收，也未在本轮重复原生截图和系统键鼠检查。

Windows x64 安装包为 `dist/Snap-Solver-2.0.0-dev.4-win-x64-Setup.exe`，308,550,980 字节，SHA-256 为 `41e65d411cf7bd3782872db0422f652728e35a6874550a2b7a06db7fa2e7fde9`，附带 `.sha256`，当前未签名。44 个打包应用源码文件与当前项目一致，生产元数据和固定运行层匹配，828 项归档资源审计未发现私密数据或开发依赖。更新时先从托盘退出旧客户端，再安装并重新打开手机聊天页面。

证据：[功能与浏览器验收](../artifacts/read-aloud-check.json)、[安装包审计](../artifacts/read-aloud-installer-check.json)、[Chromium 手机界面](../artifacts/read-aloud-phone-chromium.png)、[WebKit 手机界面](../artifacts/read-aloud-phone-webkit.png)、[320 像素窄屏](../artifacts/read-aloud-narrow-webkit.png)。

## 2026-11-06 回答完成提示音兜底修复（2.0.0-dev.3）

用户反馈声音来自电脑。本轮禁用页面静默脚本后，直接请求并解码上游提示音，复现到此前仍下发有声文件：`notification.mp3` 为 1.7501875 秒、采样峰值约 0.228654；`greeting.mp3` 峰值约 0.222439。上一版的函数调用拦截检查没有覆盖这个资源层漏点，也没有明确等待后台完成通知与原生播放结束。

网关现在为这两个旧地址返回 0.1 秒、16-bit PCM、采样全零的 WAV，并禁止缓存。地址位于配对检查前，旧标签页、未加载页面保护、暂停或失效会话都只能拿到静音资源；原 Open WebUI wheel 保持不变。页面播放拦截、通知屏蔽和桌面强制静音继续保留。

34 项离线检查通过。新增浏览器专项实际打开旧页面、保留真实播放器并观察来自模型回答的 WebSocket `chat:completion`，随后等待原生 `ended`：Chromium 和 WebKit 各观察到一次播放结束，提示音采样峰值均为 0。Chromium 使用浏览器解码器；Windows Playwright WebKit 不提供 AudioContext，使用原始 PCM 逐样本校验，同时仍完成真实媒体播放。两种浏览器各校验完成与欢迎两份资源。首轮完整检查 39 通过、3 失败：两项因测试误用了 Windows WebKit 缺少的 AudioContext，另有一项旧页面刷新时取消上游模型读取的错误。修正音频测量方式后，包含全部失败项的 6 项目标回归全部通过，未过滤页面错误断言。失败记录保存在 `.test-data/completion-audio-before/`、`.test-data/completion-full-first-run-failure/`。

实际安装版 Windows 客户端也通过：两个音频解码峰值均为 0，原生截屏 2560 × 1440，显示 / 聚焦 / 通知 / beep / 闪烁 / 托盘提示 / 选区窗口计数均为 0，音频静音状态为 true，模型请求为本地模拟。43 个安装源码文件逐字节匹配，未包含私密数据或开发依赖。安装到含点目录与空格的临时路径后完成上述检查。清理时临时安装目录已不存在，原清理脚本报缺少路径；随后按测试路径核验目录、注册项、进程与快捷方式，确认无测试残留。安装辅助脚本首轮读取 UTF-8 package.json 的编码失败也已修正，记录于 `.test-data/completion-install-encoding-failure.json`。未进行扬声器录音、真实模型账户或实体手机验收。

安装包 `dist/Snap-Solver-2.0.0-dev.3-win-x64-Setup.exe`，308,548,680 字节，附带 `.sha256`，当前未签名。更新时从系统托盘选择“退出”以停止旧后台，再安装修复版，并重新打开电脑和手机上的全部聊天标签页。

证据：[音频专项结果](../artifacts/completion-audio-check.json)、[Windows 安装版检查](../artifacts/completion-audio-installed-check.json)、[安装包与清理记录](../artifacts/completion-audio-installer-check.json)。

## 2026-11-06 强制静默修复（2.0.0-dev.2）

上个版本只关闭了自有截图提示的默认值。固定版本 Open WebUI 的通知声默认开启，欢迎 / 通知使用 HTML Audio 播放；已保存的 `showCaptureHints: true` 也能重新开启选区、通知和窗口恢复。本轮移除该开关的界面入口，旧值与旧截图指令均强制按静默处理。截图成功或失败不触发系统通知、托盘提示、选区窗口、窗口显示或聚焦；桌面 WebContents 始终静音。运行层合并关闭旧通知声、自动朗读、自动复制与振动设置，保留其他偏好、模型连接与聊天。

手机页在上游模块运行前加载 `quiet.js`，阻止媒体 / Web Audio 播放、通知与权限提示、自动朗读和振动；上游 toast 不显示。桌面指令与手机截图不再调用截图结果 toast、附件高亮、自动滚动或主动聚焦。电脑截图失败保留在操作日志，原生聊天内容与附件收集方式照常使用。

验证通过：语法 / 目录检查，32 项离线测试，Chromium / WebKit 共 38 项浏览器检查。浏览器用旧通知偏好和伪造的旧提示指令验证，底层播放、Web Audio、通知、权限请求、振动、朗读与 alert 调用计数均为 0。Windows 源码与解包客户端各完成真实 2560 × 1440 截屏及本地模拟模型交付；窗口显示 / 聚焦、系统通知、beep、任务栏闪烁、托盘提示变化和选区窗口均为 0，主窗口保持隐藏，音频静音状态为 true。旧开关开启、成功、草稿拒绝、区域选取取消等路径均已覆盖。声音侧验证为播放调用拦截与静音状态，未做系统回环录音。

新安装包 `dist/Snap-Solver-2.0.0-dev.2-win-x64-Setup.exe`，308,548,198 字节，附带 `.sha256`；Windows x64，内置 Python 3.12.16 / Open WebUI 0.12.2，未签名。42 个打包源码文件与当前项目逐字节一致，资源审计未发现私密数据或开发依赖。本轮未覆盖安装用户正在使用的客户端，也未合成系统键鼠输入；没有真实提供商请求，未做实体手机验收。更新时先退出旧版、安装修复版，再刷新手机页面以加载静默保护。

证据：[修复版打包记录](../artifacts/strict-silent-installer-check.json)、[Windows 解包客户端验证](../artifacts/strict-silent-v2-packaged-check.json)、[源码验证](../artifacts/strict-silent-check.json)、[实际静默设置界面](../artifacts/strict-silent-settings.png)、[Chromium 页面](../artifacts/strict-quiet-chromium.png)、[WebKit 页面](../artifacts/strict-quiet-webkit.png)。

## 2026-11-06 打包最新页面为 Windows 安装包

本次已将页面改版打入 `dist/Snap-Solver-2.0.0-dev.1-win-x64-Setup.exe`，Windows x64 NSIS 安装包大小 308,548,365 字节，附带同名 `.sha256` 校验文件。内置 Python 3.12.16 与 Open WebUI 0.12.2，运行时不依赖用户另装 Python、Node.js 或开发虚拟环境。安装包当前未签名，未发布到外部渠道。

语法 / 目录检查与 28 项离线测试通过。打包目录和实际安装目录均完成资源审计：41 个应用源码文件与当前项目逐字节一致，生产元数据和运行层资源匹配，未包含本地私密数据或开发依赖。扩展审计首次将 `package.json` 逐字节比对，因 electron-builder 会规范化该文件并移除开发字段而失败；随后改为逐项校验生产元数据，应用源码继续保持逐字节校验。该记录保留在 `.test-data/design-package-audit-failure.json`。

安装器实际安装到含点目录与空格的临时路径后，自带运行层启动、客户端重启、2560 × 1440 原生截屏、操作日志、缓存清理及设置 / 附件 / Cookie / 本地存储保留均通过。测试还缩减了启动环境 PATH，并设置不可用的 Python 环境路径，以验证自带运行环境。完成后已卸载测试副本，恢复原有快捷方式；测试安装注册项和进程均为 0。没有外部模型请求，未做实体手机或其他 Windows 设备验收。

证据：[安装包验收记录](../artifacts/design-installer-check.json)、[安装后运行检查](../artifacts/maintenance-packaged-check.json)、[实际安装版界面](../artifacts/maintenance-packaged.png)。页面和浏览器集成验证见下节。

## 2026-11-06 页面与手机操作更新

桌面使用统一的状态侧栏、截图操作卡片、并排的二维码与连接指引，以及按需展开的设置列表。手机把文字输入、截屏、框选、选图与原生发送集中在底部；附件和长草稿独立滚动，窄屏与可见视口缩小时收起重复信息。配对支持数字键盘、分隔 / 全角连接码粘贴和明确提交；模型设置使用分组列表、底部面板、标题初始焦点、遮罩关闭和焦点返回。密钥输入面板也跟随可见视口，保存按钮可滚动到。

本轮通过：JavaScript / 目录检查、28 项离线测试、Chromium 与 WebKit 的 36 项完整集成检查；最终补充的密钥输入面板适配又在两种浏览器各通过一项定向回归。浏览器使用真实 Open WebUI 0.12.2、本地模拟模型和模拟截屏，覆盖 390 × 844、320 × 740、390 × 460 与只改变 VisualViewport 的键盘场景；长草稿、附件顺序、原生发送与停止、桌面自动发送限制和静默反馈均已验证。没有外部模型请求，没有进行实体手机软键盘、扫码或真实提供商账户验收。

Windows 原生 Electron 隔离验收通过：屏幕权限 granted、实际获取 2560 × 1440 截图、关闭窗口后隐藏且保留进程。另在默认窗口与最小 780 × 700 窗口检查主要按钮均在视口内，并检查设置展开；见 `artifacts/native-check.json` 与 `artifacts/design-desktop-check.json`。页面改版阶段未重新打包；后续安装包验收见上节。本轮未重测系统级鼠标与快捷键。

首轮浏览器检查为 33 / 34 通过：WebKit 在主动刷新页面时取消了上游尚未结束的聊天列表请求，产生两条 Load failed。trace 确认请求发生于刷新前，测试改为等待模型与侧栏列表读取结束，保留页面错误断言；随后 34 项、加入连接码与长草稿场景后的 36 项均通过。首轮失败截图与 trace 保存在 `.test-data/design-first-run-failure/`。首次直接启动 Electron 因 IDE 继承 `ELECTRON_RUN_AS_NODE=1` 未能启动；仅在验收进程去掉该变量后完成上述原生检查。

实际渲染图：[桌面](../artifacts/design-desktop.png)、[最小桌面窗口](../artifacts/design-desktop-minimum.png)、[手机空稿](../artifacts/design-phone-empty.png)、[附件与输入](../artifacts/design-phone-attachments.png)、[长草稿与键盘视口](../artifacts/design-phone-keyboard.png)、[配对](../artifacts/design-pair.png)、[模型列表](../artifacts/design-models.png)、[模型表单](../artifacts/design-model-sheet.png)、[密钥输入与键盘视口](../artifacts/design-model-keyboard.png)。

## 已实际验证

| 项目 | 证据与结果 |
| --- | --- |
| macOS Electron App | 历史窗口与运行层检查通过，见 2026-10-19 记录；本轮未重测 macOS |
| 原生屏幕获取 | 系统权限 granted，获取 2560 × 1655 截图；只检查尺寸，没有向外部模型发送 |
| 关闭到托盘 | 窗口隐藏、进程保留；退出后停止后台子进程 |
| 手机网页流程 | Chromium、WebKit 的 390 × 844 与 320 × 740 触屏视口，真实 Open WebUI 0.12.2 |
| 局域网 HTTP | 2026-10-16 已通过实际网卡 IPv4 测试；2026-10-17 界面回归使用 loopback HTTP |
| 连续附件 | 连截 2 张，加 1 张框选图片；草稿未变、模型调用为 0；删除 1 张后一次提交 2 张 |
| 附件整理 | 编号、大图翻看、放大、单张删除、清空及撤销；逐字节比较模型收到的图片与当前附件，内容和顺序一致 |
| 截屏并发与失败 | 截图待完成时点击发送和 Enter 均不提交；切换到新对话后迟到截图被拒绝；失败保留原文字 |
| 手机选图与上限 | 通过实际文件选择器添加图片，超限整批拒绝，达到上限禁用追加，移除后恢复；原生草稿保存完成后刷新保留图片与文字 |
| 功能裁剪 | 可见入口与状态文字检查；旧的文件夹、生成图像和评价开关被产品策略关闭，模型连接配置保持原值；后台页面重定向，非核心写入路由返回 403 |
| 多轮与切换 | 流式输出、公式和代码显示，第二轮保留上下文并切换到另一型号 |
| 停止生成 | 点击原生停止按钮，本地模拟模型连接在完成前被关闭 |
| 历史与撤销 | 完整回答后刷新仍在；撤销设备后需重新配对 |
| 首次引导 | 没有任何密钥时可进入模型配置，截屏按钮明确禁用；Chromium / WebKit 均已验证 |
| 模型设置 | 表单按需展开，留空保存保留密钥，不回显、不额外调用模型 |
| 状态与窄屏 | 320 像素宽度下常用按钮可点击且无遮挡；权限不足只禁用截屏；暂停、启动失败、断连、模型列表读取失败和恢复均已验证 |
| 刷新后的异常页面 | 423 / 503 返回可操作的等待页；恢复后回到原 URL；API 保持 JSON 响应与原错误码 |
| OpenAI Responses | 真实框架将 Chat Completions 风格图片消息转成 `input_image` 并路由到 `/responses`，通过本地模拟端点验证 |
| 配对 / 网关 | 6 项 Node 测试通过：授权、跨站阻断、产品路由裁剪、撤销、过期、限速、Unicode 输入、端口复用与冲突回退 |
| Windows 依赖 | Python 3.12 / x86_64 Windows、仅二进制包解析通过；跨平台依赖锁已生成 |
| Windows 电脑截图 | 实际 Electron、全局快捷键、两个角长按、超时、Esc、原生区域裁剪及自动发送通过；见 `artifacts/desktop-input-check.json` |
| 日志与缓存 | Windows 源码、解包版与安装后客户端均通过操作日志、缓存清理、数据保留和重启检查；见 `artifacts/maintenance-packaged-check.json` |
| Windows 安装包 | 内置 Python 3.12.16 / Open WebUI 0.12.2，实际安装到带空格目录、启动及卸载通过；见 `artifacts/installer-check.json` |

## 2026-11-06 修复扫码默认选择虚拟网卡

本机复现了默认地址为 Meta `198.18.0.1`、真实 WLAN 地址为 `192.168.5.13` 的情况。原排序只降低部分虚拟网卡的优先级，漏掉 Meta。修复后普通局域网 IPv4 排在 Meta / Clash / TUN / VPN 和虚拟网卡前，`198.18.0.0/15` 与链路本地地址也不优先；所有网卡仍可手动选择。

手动选择的网卡名称和地址保存在 userData 的 `network.json`，兼容旧的仅端口配置；重启后恢复选择，DHCP 地址变化时按名称匹配，断开时临时回退，保留原偏好。二维码与手动地址使用同一份状态快照，避免切换与异步刷新时混用不同地址。

`npm run check`、27 项离线单元检查及 Windows 本机源码网络验收通过：默认选择 WLAN，实际通过设置表单切换地址，重启后保留，再切回 WLAN 并在该局域网 origin 打开二维码链接完成配对。此检查使用本机 Chromium 手机视口，没有实体手机扫码，也没有外部模型请求。记录见 `artifacts/network-check.json`。

安装版首轮验收未能自动点击展开设置面板，证据保留在 `.test-data/network-failure-1793906647315/`，脚本改为键盘展开并断言可见。第二轮发现安装位置包含 `.test-data` 时配对页返回 404：Express 对绝对文件路径检查点目录，将安装目录也纳入了默认隐藏文件过滤。固定页面和裁剪资源改为“限定资源根目录 + 固定文件名”发送，保留隐藏文件过滤。新增实际点目录 HTTP 回归后，28 项单元检查和语法检查通过；第二轮证据保留在 `.test-data/network-failure-1793906771864/`。该修复已纳入重新构建的同一开发版本。

最终 `2.0.0-dev.1` 已在 Windows 本机重新构建，安装到含点目录且带空格的路径并完整复验通过：配对页、裁剪脚本与样式均返回 200，默认 WLAN、手动切换、重启后记住选择、二维码 / 手动地址一致，以及本机浏览器经实际 WLAN origin 配对均通过。随后已卸载测试安装、恢复原快捷方式，没有测试安装注册项或后台进程残留。安装包为 `dist/Snap-Solver-2.0.0-dev.1-win-x64-Setup.exe`，大小 308,546,128 字节，附带 SHA-256；仍未签名，未做实体手机扫码。资源审计未包含本地用户数据或开发工具，41 个打包源码文件与当前源码逐字节一致。证据见 `artifacts/network-packaged-check.json`、`artifacts/network-installer-check.json` 与 [实际网络设置界面](../artifacts/network-packaged.png)。

## 2026-11-06 操作日志、缓存与 Windows 安装包

连接窗口底部新增“操作日志与缓存”。日志显示最近 200 条记录，支持异常筛选和刷新，退出重启后保留；本机最多保留约 4 MiB 轮换日志。只记录固定操作与允许的尺寸、来源、结果分类，不记录密钥、提示词、图片、聊天正文或任意错误堆栈。清理功能仅调用 Electron 页面和代码缓存 API，保留持久化存储和应用数据。

`npm run check` 和 23 项离线单元检查通过。Windows 源码、解包版和实际安装版分别通过维护验收。最终安装版在只保留 Windows 系统搜索路径、设置无效 `PYTHONHOME` / `PYTHONPATH` 的环境中，使用内置运行层启动和重启；缓存从 529,234 字节减少至 4,140 字节，Cookie、localStorage、设置和附件逐项保留，聊天数据库仍在，历史操作日志可再次读取。原生截屏为 2560 × 1440。实际界面见 [维护面板](../artifacts/maintenance-packaged.png)。

安装后的客户端完成系统快捷键、两个角长按、5 秒超时、Esc 取消及自动发送验收。150% 缩放下，480 × 320 DIP 选区得到 720 × 480 图片，只产生两次预期的本地模拟模型请求；默认静默模式下窗口恢复、通知、截图托盘提示和选区窗口均为 0。开启 / 关闭提示的检查仍通过。外部模型请求为 0。

最终 `dist/Snap-Solver-2.0.0-dev-win-x64-Setup.exe` 为 308,545,395 字节，附带 `.sha256`。使用当前用户安装器实际安装到带空格路径后执行上述验收，随后成功卸载测试客户端并恢复原有快捷方式；注册表不残留测试安装。安装包资源审计确认不包含开发工具、测试数据、本地配置或用户数据库，Python 不依赖开发虚拟环境，仓库及第三方许可随包保留。记录见 `artifacts/installer-check.json`。本机未使用代码签名证书，未测试其他 Windows 设备或实体手机。

Chromium / WebKit 的 14 项电脑截图集成检查在最终同一次运行全部通过。首轮 13 项通过、1 项在 WebKit 自动清空富文本草稿时失败；直接键盘清空在 Windows WebKit 中也未选中文字，而上游新对话操作保留了未发送草稿。最终将恢复接收的步骤改为用户明确点击原生发送按钮，确认只有用户操作才提交原有草稿、回答结束后才恢复接收；没有修改上游编辑器或放宽电脑自动发送限制。失败 trace 分别保留在 `.test-data/browser-failure-1793898131/`、`.test-data/browser-keyboard-failure-1793898306/` 和 `.test-data/browser-new-chat-failure-1793898391/`。维护验收脚本早期的 Electron evaluate 上下文 `require` 错误也保留在 `.test-data/maintenance-failure-1793897387270/`，已使用公开应用信息修正脚本并复验。

## 2026-11-06 可选截图提示，默认静默

新增持久化的“显示截图提示与弹窗”开关，默认关闭，旧配置缺少字段时也关闭且不改写旧文件。关闭时不创建选区窗口、不显示倒计时、截图状态与成功 / 失败通知，不更新截图托盘提示，也不因截图成功、失败或取消而恢复主窗口；手机端不显示电脑截图 toast、附件高亮或主动滚动。关闭开关会清除先前请求的通知，手动开启后才显示截图提示。

代码检查、18 项离线单元检查、Chromium / WebKit 的 14 项电脑截图集成检查通过，包含静默成功、静默失败、开启提示及旧配置兼容。Windows 本机重新验收全局快捷键、长按、超时、Esc 与原生裁剪：静默期间主窗口显示、选区窗口、系统通知调用及截图托盘提示均为 0，截图仍产生预期的两次本地模拟模型请求。开启后创建选区窗口、请求通知；再关闭时调用通知清理。通知以 API 调用次数验收，没有向系统发送实际 Toast。记录见 `artifacts/desktop-input-check.json`，实际界面见 [默认关闭的提示开关](../artifacts/capture-hints-settings.png)。

额外手动聊天流程检查中，Chromium 首次通过，WebKit 首次在主动刷新时报告模型列表请求被取消；没有忽略页面错误，失败 trace 保留在 `.test-data/silent-capture-manual-first-run/`。随后单独复测该 WebKit 用例通过。本轮没有重新运行其余完整浏览器用例，上一轮完整 30 项记录对应下述日期。

## 2026-11-05 电脑触发截图与自动提问

`npm run check`、15 项离线单元检查及新增 Python 文件的语法编译通过。Windows 本机使用隔离数据目录、实际 Open WebUI 0.12.2 与本地模拟模型，经过设置表单录入自定义快捷键和提示词，再通过系统键鼠事件完成全屏发送、两个 1.2 秒长按、5 秒超时与 Esc 取消。150% 显示缩放下，480 × 320 DIP 选区得到 720 × 480 图片；两次操作只产生两次本地模型请求，外部模型请求为 0。手机草稿保留，设置已持久化；退出后鼠标辅助进程数为 0。另一个隔离桌面检查通过原生全屏获取（2560 × 1440）及关闭到托盘。

实际渲染见 [电脑入口](../artifacts/desktop-input.png)、[自定义设置](../artifacts/desktop-input-settings.png)、[手机回答](../artifacts/desktop-input-answer.png)。电脑发送仍通过原版聊天框；生成中、草稿、暂停及接收途中切换对话均有拒绝提交的浏览器检查。

最终 Chromium / WebKit **30 项完整回归在同一次运行全部通过**（无跳过、无重试）；摘要见 `artifacts/desktop-input-ui-check.json`，本地完整报告与 trace 位于 `.test-data/final-ui-result.json`、`.test-data/final-ui-results/`。差异检查允许仓库现有 CRLF 行尾，通过 `git -c core.whitespace=cr-at-eol diff --check`，没有批量改写原有行尾。

首轮完整浏览器检查为 29 项通过、1 项失败：WebKit 刷新时取消了桌面接收轮询，产生页面错误。失败 trace 和报告保留在 `.test-data/desktop-input-first-full-run/`；改为允许小型轮询请求在页面退出时收尾后，原用例复测通过，保留了原页面错误断言。早期 SVG 模拟图未走原生图片路径、退出目录锁与原生测试清空富文本草稿的失败也有本地记录；截图统一转为 JPEG、Windows 结束运行层进程树、清理对短期文件锁重试，草稿清空使用实际全选与退格操作。

## 2026-10-22 提交前检查

`npm run check`、6 项 Node 测试和 `git diff --check` 再次通过。同步修正使用指南中的旧入口名称与图片布局说明。本次未重复浏览器和原生桌面验收，相关证据仍对应下述日期。

## 2026-10-19 Things 方向视觉重构

从 Things 官方界面拆解内容分区、操作层级和按需展开方式，重排手机截图工作区与桌面连接窗口。设计依据见 `design-brief.md`。

`npm run check`、6 项 Node 测试通过。Chromium / WebKit **20 项完整回归在同一次运行全部通过**；随后只调整了未连接模型时的引导与原生选择器布局，两种引擎的附件整理、首次配置共 4 项针对性复查通过。新增验证包括 390 × 460 短视口、VisualViewport 单独变小时发送按钮仍可达、图片区域独立滚动和上游品牌可见。

macOS 隔离 Electron 的启动、暂停 / 恢复、原生截屏（2560 × 1655）、关闭到托盘再次通过。对用户实际数据窗口也进行了可见界面检查，观察到已有 Android 配对；这不代表该手机完成了本版真机操作。最后将桌面主内容设为独立滚动，侧栏和底部操作保留固定位置，并重新通过桌面检查。

首次完整运行有 17 项通过、3 项失败：两项是新增品牌断言同时匹配到了 Svelte 隐藏的播报节点，已收窄到实际工作区；另一项是 WebKit 在主动刷新旧文档时报告模型列表 fetch 中断，trace 中对应列表响应为 200。失败证据保留在 `.test-data/design-first-run/`。曾尝试等待全站 networkidle，但长连接使该检查超时，随后终止该次运行，改为仅等待模型列表请求结束；页面错误断言仍保留，没有忽略错误以获得通过。

短视口和 VisualViewport 事件验证属于浏览器集成检查，尚不是实体手机软键盘验收。外部模型调用仍为 0；Windows、签名与打包范围未变化。

## 2026-10-17 界面清晰度回归

源码检查和 6 项 Node 测试通过。Chromium / WebKit 的 18 项完整浏览器回归通过；随后调整窄屏图标宽度和设置表单，并在两种引擎中各复查 1 项窄屏流程，均通过。新增等待页后，两种引擎各 1 项暂停、启动失败和恢复流程通过，Node 网关检查也再次通过。当前共 20 个浏览器用例有通过记录，新增等待页没有重新跑其余完整套件。

最初的 Chromium 回归为 8 项通过、1 项超时：测试试图普通点击带有 `aria-disabled="true"` 的链接，被 Playwright 的可操作性检查阻止。改为真实强制点击，专门检查页面是否阻止跳转；后续完整 18 项运行通过。该次失败 trace 保存在本地 `.test-data/ui-clarity-first-run/`，未归为产品成功。

macOS 隔离开发版完成窗口启动、暂停 / 恢复手机访问、原生截屏及关闭到托盘检查；本轮截图尺寸仍为 2560 × 1655。之后对用户当前前台窗口的额外检查遇到 Mac 锁屏，未继续操作，也不将其计为人工前台验收。

## 2026-10-16 附件整理回归

连续截图与附件整理改动后，源码检查和 6 项 Node 测试通过。局域网浏览器全套共 16 项：WebKit 8 项通过，Chromium 7 项通过；剩余的“手机选图、附件上限与已保存草稿恢复”在刷新时遇到 `net::ERR_NETWORK_CHANGED`，扩展与多个上游页面资源加载失败。该失败的 trace 保留在本地 `.test-data/network-interruption/trace.zip`。

随后仅重测这一个 Chromium 用例，结果通过。16 个用例均有通过记录；本次并非同一次全套运行全部通过。没有因此扩大外部模型调用范围。

## 测试边界

浏览器测试使用固定数学题截图和本地模拟模型。所有外部模型调用均为 **0 次**，没有用真实账户消耗额度。模型目录来自官方能力说明；实际 API 账户和每家云服务的返回效果没有验收。

触屏视口与 WebKit 引擎测试不是实体 iPhone / Android 测试。Windows 已有本机启动、原生截图、系统键鼠与托盘检查，本轮原生输入使用系统合成事件；未覆盖其他 Windows 机型及多屏混合缩放组合。双显示器选择和负坐标手势通过模拟验证，本机原生截图验收当前显示器。

原生草稿保存有 500 毫秒防抖，草稿恢复检查等待其实际保存完成，不声称正在上传或尚未保存的输入能在立即刷新后恢复。

浏览器主动刷新时可能取消上游正在进行的列表请求；历史检查等完整回答结束后再刷新，不把刷新中途产生的网络取消当作模型停止的证据。停止验收单独检查模拟模型的连接关闭。

## 复现

```sh
npm ci
npm run setup
npm run check
npm test
npx playwright install chromium webkit
npm run test:ui
npm run test:desktop
npm run test:desktop-input # Windows 本机
npm run test:maintenance
npm run test:network       # Windows 本机默认网卡与局域网配对
npm run dist:win           # Windows x64 本机
node scripts/audit-package.cjs
```

局域网检查可设置 `SNAP_TEST_HOST` 为本机 IPv4 再执行浏览器测试。桌面测试使用临时数据目录并清空模型密钥环境变量；不会修改实际 App 数据。

截图 `artifacts/desktop.png` 与 `desktop-paused.png` 来自隔离的实际 Electron 窗口；`phone-empty.png`、`phone.png`、`phone-short.png`、`phone-labels.png`、`phone-narrow.png`、`phone-permission.png`、`models.png`、`model-sheet-narrow.png`、`crop.png`、`answer.png`、`image-preview.png`、`sidebar.png`、`paused-page.png` 来自本地模拟环境，只展示界面，不证明模型解题准确性。
