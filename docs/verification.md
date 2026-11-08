# 验收记录

> 2026-11-09 本轮收尾：用户确认 M0 保留矩阵已测，明确授权移除旧依赖，并暂缓 Mac 实机测试、缩减重复测试。当前源码仅支持 Node，旧源码和原断言归档，正常 Windows 安装入口与 Mac 两架构 ZIP 构建已接通。实际产物、检查结果和边界以 [M5 收尾记录](node-service-finalization.md) 为准；下文保留此前分轮证据，不将未测门槛改为通过。

更新日期：2026-11-09。M4.1～M4.3 的 Windows 迁移、两引擎浏览器升级及新增数据后旧版实际读回已通过；M4.4 隔离 NSIS 安装闭环通过，但正式 GUID 升级仍未验收，M4.5 无真实 Mac。源码 `npm start` 和 Node-only 候选已默认 Node，普通旧库自动迁移接线；本轮修改的回归尚待实际执行。Python / Open WebUI 对照资源保留；发布仍需正式 Windows 身份、Mac 两架构实机、实体手机及 M0.2 重启首启 0/5。

## 2026-11-09 M5 轻量候选与发布阻断

M5 已开始但未完成。Windows Node-only 候选和源码普通启动默认选择 Node，候选资源无 Python / Open WebUI。已有旧库只读导入独立 `Scrylet` 目录，原目录保留，隔离候选仍要求绝对数据目录。此前候选 Windows 常规十次启动的实测中位业务可用约 1.70 秒，安装器约 120 MiB；这些数字属于此前构建，不能代替本轮默认启动回归，也不能推导 Mac、冷启动或真实手机通过。

完整 Windows 候选验收、隔离 NSIS 安装与回退、包体 / 启动证据使用 `npm run collect:m5` 绑定同一安装器和 ASAR；汇总仍保持发布受阻。正式生产 GUID、Mac 两架构、实体手机 / 扬声器、五次真实系统重启首启、多屏负坐标 / 混合 DPI / 锁屏尚未验收，不删除旧运行层。逐卡范围见 [M5](node-service-m5.md)。

## 2026-11-08 M4.1～M4.5 迁移、浏览器升级与安装回退

完成 CJS 分阶段一致迁移 / 本地版本契约、原生静音进度、已保存浏览器草稿升级，以及独立完整旧版导出和 Node 可读快照。未知 schema / 缺图 / 配置 / 空间失败保留源与门槛；normalized 与 embedded 冲突保留整条备用图。用户模型别名 / 能力 / 参数实际走现有 SDK，删除密钥不由旧 seed 复活。配对 / 网卡 / 截图设置与日志保留，没有新增手机迁移管理 API，默认运行层和旧资源未删除。

Windows 最终迁移 **33 组通过**，包含真实 WAL 已提交帧、六阶段异常 / 重入、六阶段真实进程 exit / 新进程恢复与 OS 密钥解密、两个 Node 快照独立重开，以及新增图文 / 兄弟分支 / 空会话 / 提示词 / 再删除密钥后实际 Open WebUI 0.12.2 读回；源 DB / 图片保持未变。Chromium / WebKit 真实旧 UI → 同 origin Node → 新草稿 → 旧 UI 回退及端口冲突 **4/4** 通过，零 skip / flaky；原声音 / 裁剪 / 显示器偏好保持，无自动朗读 / 补播。进度窗口在真实缩放下的溢出已修正，并做原生内容区检查。

实际 Windows NSIS **8 组通过**：中文 / 空格 / 点安装目录、旧安装覆盖升级、同 origin / 配对 / 网卡 / 快捷键 / 草稿保留、缓存清理、应用退出重启、卸载保留数据与 OS profile、重装后继续 mock、安装版本地导出、再安装旧版实际读回新增历史和新草稿，共 5 次本地模型请求。既有用户安装被预检保护；本次用独立 NSIS GUID / 快捷方式 / 安装缓存命名空间，保持 appId / exe / payload。每步检查原有注册、快捷方式和正式缓存不变，最后仅卸载测试副本。**不计生产 GUID 覆盖升级通过；最终新候选安装全验收仍是 M5 门槛。** 已安装快照与后续参数 / 进度样式修正的当前资源候选分别记录归档哈希，不能混算。

同轮 syntax / phone / contracts strict、离线 **141/141**、后端源码 **34** / 仓库外独立测试 ASAR **33** 组、手机源码两引擎 **50/50**、手机独立测试 ASAR **12/12** 通过；M0/M2 原截图恢复原字节。当前解包候选资源审计 **3,475 ASAR 条目 / 159 项项目文件**通过，无私有 / 开发资源，observer 与生产许可证齐全，旧 Python 3.12.16 / Open WebUI 0.12.2 保留。它与已安装的较早快照分开标注，未声称当前最终安装包全验收或包体 / 启动目标达成。

M4.5 新增真实目标 Mac 的合成旧库迁移、先前 app 独立 Keychain 探针、新增数据导出和可选兼容旧 app 实际读回脚本接线；**新接线仅 syntax / 结构检查，没有 Mac 实机执行，四份 DMG / ZIP 仍 0/4，Keychain / 安装 / 旧版读回 0/2 架构。** 非 Mac 调用明确失败，Finder 拖拽 / 权限拒绝后授权等人工门槛仍未通过。

保留失败：正式身份安装前发现真实客户端而拒绝；首次隔离安装的 PowerShell stdout 编码导致中文路径归属误判，修正 UTF-8 后只经 GUID / 路径 / ASAR 确认卸载拥有的测试副本，完整重跑通过；合成夹具在旧进程退出后遇到 WAL 收尾竞态，增加夹具等待而不删 WAL；新增 file self-ID 映射后，旧存储断言错误地把全部映射计作会话，已分开验证 chat=1 / file=2 后完整源码 / ASAR 通过。原始失败没有删除或计作成功。

证据：[M4 逐卡记录与命令](node-service-m4.md)、[脱敏机器汇总](../artifacts/node-service-m4-check.json)、[原生迁移进度](../artifacts/node-service-m4-migration-webkit.png)、[安装手机页](../artifacts/node-service-m4-installed-phone.png)、[安装旧版读回](../artifacts/node-service-m4-installed-rollback.png)。原始报告 `.test-data/node-service-m4/run-4JeirL/`、`browser-current.json`、`install-s2Ee68/`、`phone-final.json`、`windows-audit-current.json`；服务 `node-service-m1/run-lWGET9/`，手机 ASAR `node-service-m2/archive-Uf3URs/`。未使用真实模型账户或改写真实用户库。

下一项 **M4.4 在独立 Windows 环境验证正式 GUID、M4.5 真实 arm64 / x64 Mac 安装与 Keychain**。物理手机 / 扬声器、M3 多屏 / 锁屏 / Mac、M0.2 重启首启 0/5 和 M5 最终包 / 默认切换门槛保留，整个重构未完成。

## 2026-11-08 M3.1～M3.4 Rust 原生输入与平台打包

Windows 输入已替换为锁定 Rust 1.91.0 的预编译 observer，v1 JSON Lines / 物理坐标 / 握手与长度校验、EOF / 超时 / kill、父进程句柄与输入桌面失效取消已接线。observer 不注入输入；独立 Rust test-input-driver 承担合成事件，并有强杀释放 guardian。`test:desktop-input` 改用 Node mock 夹具，不再调用 Python 驱动。旧 Python / Open WebUI 文件和 Windows 默认继续保留，没有读取真实用户数据或真实模型账户。

本轮 **134/134 离线检查**、**3/3 Rust 状态测试**、**5 组真实 Windows 合成输入**及 syntax / phone / contracts strict 通过。源码与仓库外含中文 / 空格 / 点路径的解包副本，各完整通过 **8 次 mock** 的原生全屏 / 区域热键、应用菜单截图、两角长按的 left / right / middle / x1 / x2、短按 / 拖动拒绝、双击关闭 / 开启、5 秒超时、Esc 和已有草稿拒绝。实际屏幕缩放 150%，区域 PNG **720×480**。截图反馈 shows / notifications / captureTooltips / overlays 均为 **0**，旧 hints=true 仍为 false，桌面音频静音。最终报告在光标恢复和进程清理完成后输出，控制进程均退出 0。

源码与独立解包应用各 **4 组生命周期**通过：关闭隐藏 / 菜单恢复、正常退出回收 observer / 服务、只杀实际主进程后子进程自行结束、重启 SQLite 无孤儿锁。没有用 taskkill /T 伪造父进程清理。解包应用 cwd / 数据独立，PATH 仅 Windows / System32，不依赖系统 Node / Python / Rust。两处资源审计 **3,462 ASAR 条目 / 146 项项目文件**与当前源码 / 现有前端构建逐字节一致，observer 哈希 / 架构 / 许可证通过，测试 driver / manifest / Rust 源码 / 私有目录不在资源中。它是 `--dir` 候选，未生成或验收新的 NSIS。后端源码 **34 组** / 独立测试 ASAR **33 组**同轮回归通过；M2 浏览器全套历史证据未混算成本轮重跑。

Mac 已实现分平台 / 架构配置、从 SVG 16～1024px / Retina 生成的 ICNS、DMG Applications 链接、`dist:mac[:arm64|:x64]`、`test:mac-package` 和实际 plist / Mach-O / 权限 / 链接 / 资源审计。**7 项结构检查通过，真实 Mac arm64 / x64 DMG / ZIP 为 0/4、运行 / 安装 / Keychain / Finder 拖拽 / 签名 / 公证均未测**；非 Mac 实际调用拒绝且不生成通过报告。当前 Mac 仅显式隔离 Node 数据的 development 候选，distribution 在 M4/M5 前拒绝，mouseSupported=false，无 Windows / Python / 假 helper。

保留首次失败证据：已有测试 Electron 时拒绝注入，修正测试上下文 / 等待与启动器 PID 假设；长按合成测试增加 300ms 调度余量而不改 1200ms 默认；Electron 下载 HTTP 504 后使用本地同版 44.8.0；许可位置与旧解包不一致审计正确失败后重新打包。一次 WSL interop 启动失败、一次业务断言后控制进程退出 143 没有计整轮成功；最终完整重跑通过。实际锁屏 / UAC、多屏负原点 / 混合 DPI、人工物理输入、物理手机 / 扬声器、Mac 及权限拒绝后授权、完整迁移 / 新增数据后回退与最终包性能仍未通过。

证据：[逐卡记录](node-service-m3.md)、[机器汇总](../artifacts/node-service-m3-check.json)、源码 [桌面](../artifacts/node-service-m3-desktop-input.png) / [设置](../artifacts/node-service-m3-desktop-input-settings.png) / [回答](../artifacts/node-service-m3-desktop-input-answer.png)，解包 [桌面](../artifacts/node-service-m3-desktop-input-packaged.png) / [设置](../artifacts/node-service-m3-desktop-input-packaged-settings.png) / [回答](../artifacts/node-service-m3-desktop-input-packaged-answer.png)。二维码 / 配对码 / 地址均遮盖，原 M0/M2 截图保留。原始记录 `.test-data/node-service-m3/`；后端 `run-AZOkkt`。下一项 **M4.1 只读旧格式导入及中断恢复**，Mac M3 和最终门槛继续保留。


## 2026-11-08 M2.1～M2.5 React 手机页与完整业务对照

新增 strict TypeScript + React 产品页，显式隔离 Node 运行层从同源 `/` / `/c/:id` 提供，默认旧运行层不变。SDK `Chat` 持有消息 / 流状态，唯一 composer 持有输入 / 附件 / 草稿、epoch / revision 和不确定发送身份；没有第二套聊天状态或提供商 SDK。保留兼容实验独立入口。

已接上传 / 多屏静默截图 / Cropper 框选、12 张整批上限 / 顺序预览缩放 / 追加撤销、处理中 Enter / 换页保护、草稿竞争和旧格式适配。旧 sessionStorage 与未知字段不删除；未映射图片保留并阻止发送，全部确认保存才标记完成。M4 旧库 / 文件映射、跨 origin 迁移与新增数据后回退仍未完成。Markdown、公式、表格、代码复制 / 保存 / 折叠，以及 M0 全部可达历史 / 消息菜单均有新入口；实际下载 JSON / TXT / PDF，PDF 再解析通过。分享仅为已配对 LAN 地址，没有公开发布能力。

电脑 receiver 使用随机页面身份、最近激活页、context / revision 与单次 202 回执；已有草稿、生成、模态、后台、处理 / 导航变化均不误发。丢 ack 不重放，不确定 POST 只查 receipt，刷新仍保留不确定状态。暂停 / 断订阅保持上游生成；重连 / 导航读持久快照，显式 stop 才取消。

quiet.js 先于 React 加载，Node 页不安装旧 EventTarget 劫持。React 朗读 / 声音只复用旧纯函数，用户主动开启，仅本页本次实际完成回答朗读；旧历史 / 重连不补播。默认静默、关 / 停读、后台 / 导航 / 新生成取消、声音与 0.8～1.2 语速 / 主动试听 / 缺失音色保留、电脑拒绝通过。两旧音频 URL 实际 PCM 全零：Chromium 用 WebAudio 解码，Windows WebKit 缺 WebAudio / Notification，以实际 PCM WAV 解析和不可用状态验证，未称作 WebKit 播放或物理扬声器验收。

最终同次 Chromium / WebKit **50/50**，无跳过、重试或 flaky；源码真实服务覆盖双协议、多轮、停止 / 部分恢复、分支 / 消息编辑 / 完整菜单、剪贴板拒绝、草稿 / 迁移 / receiver / 语音，以及 320×720、390×460、390×844、长输入多图、VisualViewport 缩小 / 缩放、焦点和模型 / 等待恢复。视口 / 键盘与语音引擎为模拟；截图源为合成图片，不把此测试计作原生屏幕权限或物理手机通过。

独立测试 ASAR 的手机 **12/12**；后端源码 **34 组** / ASAR **33 组**通过。测试档案在仓库外含中文 / 空格路径运行，独立 cwd，清除 NODE_PATH / NODE_OPTIONS；151 份归档项目文件与 staging、151 份 staging 输入与当前源码 / 最新构建逐字节匹配，静态资源和完整浏览器许可存在。测试 ASAR 不是 NSIS / DMG / ZIP，其 33,803,978 字节不作为产品包体或启动目标结果。

同轮 **119/119 离线检查**（含 43 契约）、strict / build / syntax 通过；兼容探针源码 / ASAR 的两引擎复测通过。旧 UI **70/70** 全套通过，14 份历史 artifacts 恢复原字节；另用独立 legacy 目录补做用户 / 助手保存编辑 **2/2**，确认保存保持 ID / children 且无额外模型请求。全程只用 mock，无真实模型账户，未动用户目录或删除 Python / Open WebUI。

失败保留并修正：WebKit 刷新取消轮询、SSE 断开后丢停止入口、SDK 7 system 消息显式信任、Windows ASAR 路径、损坏合成 PNG 与测试误认任意 receiver ready。最终完整复测通过，未删断言或改为 skip。证据：[逐卡与功能记录](node-service-m2.md)、[机器汇总](../artifacts/node-service-m2-check.json)、[真实手机渲染](../artifacts/node-service-m2-phone-webkit.png)、[短屏](../artifacts/node-service-m2-short-webkit.png)、[声音](../artifacts/node-service-m2-voice-webkit.png)。原始记录 `.test-data/node-service-m2/verified-browser.json` / `verified-results/`、`archive-pz1XBG/`；后端 `.test-data/node-service-m1/run-SRtCfU/`，兼容 `.test-data/node-service-m03/run-bFHimq/`。

下一项 **M3.1**（Rust observer），随后替换独立输入测试 driver。物理手机 / 扬声器、Mac 两架构 / Keychain、完整迁移与新增数据后回退、最终安装包 / 安装卸载仍未验收，真实 Windows 重启首启仍为 0/5。

## 2026-11-08 M1.1～M1.5 正式 Node 后端与网关

保留已有工作区改动、根 CommonJS、Electron 44.8.0 和旧默认。原 Runtime 提取为 legacy-runtime，门面仅在显式独立目录选择 node；新增正式 utilityProcess、init / ready / shutdown、nonce 心跳、主进程 OS 加密秘密能力和版本化 SQLite。没有读取真实旧库或使用真实模型账户，未删除 Python / Open WebUI。

事务存储覆盖分支与当前指针、图片顺序 / 哈希 / 受控路径、草稿归属 / revision、提示词一次性种子和 schema 校验和；数据库 EXCLUSIVE 租约拒绝第二个真实服务进程，崩溃后由 OS 释放。domain 重复导入有 source ID / hash 约束，不冒充 M4 旧库迁移或新增数据后回退。密钥版本化引用避免覆盖旧值，删除 tombstone 先落盘；可控删除失败保留待重试队列，不恢复成 configured。Windows 实际 safeStorage 加密 / 重新读取 / 删除通过，Mac Keychain 未测。

锁定 SDK 的 Chat / Responses 工厂实际调用 loopback mock，覆盖多图 / 多轮、自定义地址、原样上游 ID、错误 / 不确定断链 / 取消，maxRetries=0。测试发现 Responses 默认远端 item_reference 会替代本机完整历史，已显式 store=false，同时保留协议输出作本机后续上下文。

生成接受、节点、版本、收据和 begin 同事务，随后才调 SDK；并发同请求只有一次调用，正文冲突 409。编辑与重答保持五节点图，断订阅 / 暂停 / 撤销不停止任务，显式 stop 关闭上游。真实杀掉 utilityProcess 后重启，部分回答与图片仍可读，状态 interrupted，原 requestId 查询和重复接受不重放。普通 seq 连续，缓存缺口返回同生成 snapshot，恢复不把终态改回进行中。

网关严格按方法 / 路径白名单、Host / Origin / Cookie / 写标识鉴权，重新构造内部 Authorization 与设备身份；伪造内部头不能改收据归属。文件与 SSE 流转发、单接收页 / context / draft / 本命令 busy、ack 丢失不重放和 availableModels 迁移检查通过。Node 手机产品页尚未实现，仍为 M2；这些 HTTP 检查不计实体手机或 React composer / 朗读验收。

最终同轮 `check`、**115 项离线检查**（含 39 契约、6 生命周期）通过，无跳过。源码 **31 组**与仓库外实际测试 ASAR **30 组**集成检查通过；ASAR 不含 Python / 真实用户数据，含生产依赖和 SQL 资源，cwd 独立、NODE_PATH / NODE_OPTIONS 清除，SDK 确从归档加载。源模式另实测只杀父进程后子进程退出；PID 权限错误不当作退出成功。归档是带合成夹具的测试应用，不是最终安装包。

旧默认 Chromium / WebKit **70 项全套同轮通过**，无失败 / flaky / 跳过，361,717.063ms。14 份旧 artifacts 截图恢复原字节，本轮渲染只留在忽略目录。失败记录保留：并发测试最初误认 HTTP 返回顺序、Responses 远端引用、fetch 未按意图覆盖 Host；均修正后完整重跑，未增加模型重试或删断言。

证据：[逐卡记录](node-service-m1.md)、[机器汇总](../artifacts/node-service-m1-check.json)；最终原始服务证据 `.test-data/node-service-m1/run-CPPioi/`，旧 UI `.test-data/node-service-m1/legacy-ui-4Di99u/`。下一项 **M2.1**。Mac 两架构 / Keychain、物理手机、新旧完整迁移与新增数据后回退、Rust 与最终包仍未通过；真实重启首启仍 0/5。没有以测试 ASAR 数字宣称 Windows / Mac 包体或启动目标达成。

## 2026-11-08 M0.4 旧格式与 M0.5 契约初稿

按用户要求完成两张任务卡，保留此前全部工作区改动。真实旧版在独立合成数据目录运行，未读取实际用户库、连接真实模型账户、重启系统或删除旧资源。Windows x64 的 Chromium / WebKit 两项格式采集同轮通过：编辑 / 重答保留五节点分支，顶层与内嵌指针不同的导入副本实际刷新符合顶层优先；已保存新 / 历史草稿的文字和图片、声音 / 语速 / 主动朗读偏好及框选坐标刷新保持。设备语音引擎为模拟，无实体手机或扬声器通过声明。

关闭旧写入后，用固定 Electron SQLite 只读冻结 PRAGMA / CREATE TABLE 和精选记录：chat 17 列、chat_message 19 列、chat_file 7 列、file 9 列、config 3 列、model 10 列、prompt 12 列。两份消息存储、文件关联、字节和哈希均保留，不能只拍平 chat JSON。删除合成 key 后，即使旧 seed 存在冲突值，重新创建 Runtime 启动仍未复活；用户修改提示词、自定义地址和未知 chat 元数据保持。模拟网卡选择和配对公开列表重新读取保持。源码与实际夹具区分秒 / 毫秒，纳秒、外链、失效 blob 和图冲突仅作为明确标注的合成边界，不冒充已迁移。

两条锁定 SDK 协议的 14 项检查通过：Chat / Responses 的 JSON 与 SSE、自定义路径 / 末尾斜杠、两图字节顺序与历史角色、429、已接收后断链、显式取消。maxRetries=0，每项只收到一次请求。3 项固定夹具检查通过，含无 Python 的 SQLite 重建、逐字段对比与 integrity_check；精选库省略用户鉴权表，关闭外键，不计 M4 完整迁移 / 回退通过。

新增 contracts 共享类型、24 类运行时 schema、22 条 HTTP 草稿清单、窄 IPC / 原生 JSON Lines 校验。32 项契约检查和 strict 声明 / 反例通过；全体正向样本同时受声明和实际校验约束，覆盖身份伪造拒绝、版本与长度、图归属 / 环、图片次序、修订冲突、指纹冲突、终态不可恢复、连续序号、静默字段和窄密钥操作。`check` 与同轮 **102 项离线回归全部通过，无跳过**。没有把此前旧 UI 70 项全套算成本轮重跑。API 尚未接入生产，幂等、事务、stop 与暂停、恢复和进程生命周期仍须在 M1 实施。

失败保持可见：普通更新接口重新计算分支指针、已停止 Runtime 原对象不可重启、桌面 UA 隐藏手机声音入口、自动网卡配置仅有 port 等夹具假设均已按实际行为修正。最终离线复测还捕获随机监听端口触发 fetch `bad port`，模型请求为 0；失败 TAP 单独保留，协议 mock 改用可绑定高位端口后完整重跑通过，未添加模型重试。既有 http-proxy 的 util._extend 弃用警告保留。

证据：[旧格式与协议报告](node-service-formats.md)、[格式机器报告](../artifacts/node-service-formats-check.json)、[契约说明](node-service-contracts.md)、[契约机器报告](../artifacts/node-service-contracts-check.json)。M0.4 完成后已更新进度到 M0.5；M0.5 完成后更新至 **M1.1**。AGENTS / spec / architecture 的固定复用规则只约束 legacy，新增层按 CJS / strict TS + React / 预编译 Rust 边界实施，无相互冲突的全局条款。

M0.2 真实重启首启仍为 0/5；生产 Node 服务、迁移与新增数据后的回退、Rust 输入、物理手机、Mac arm64 / x64 DMG / ZIP 和最终安装验收仍未完成。旧默认、Python / Open WebUI 资源和用户数据继续保留。

## 2026-11-08 M0.3 固定运行时、SDK、strict 前端与独立 ASAR

用户明确选择将真实重启首启暂保留未测，先继续 M0.3；未重启 Windows、修改登录任务或改变 M0.2 的 0 / 5 记录。所有旧用户数据、旧默认运行层和既有工作区改动继续保留。

实际 utilityProcess 报告固定 Electron **44.8.0**、内置 Node **24.22.0**、SQLite **3.53.4**，与控制器 Node 22.14.0 分开记录。SDK / 适配器、React、TypeScript、Vite 和类型声明已用精确版本与锁文件固定；已有依赖版本未变，Electron 未升级，根仍为 CommonJS。开发最低 Node 收窄为 22.12.0，以匹配固定 Electron / Vite 的要求；没有安装或分发另一份运行时 Node。

最终隔离实验在同一轮验证了源码和真实 ASAR：两处均实际执行 WAL、外键拒绝、事务 rollback、第二连接写锁冲突和一致备份读回；CJS 通过受控文件 URL 动态 import ESM SDK，分别走本地 Chat SSE 与 Responses 非流式 JSON，各场景两次 mock 请求，maxRetries=0。ASAR 含 13 个生产包及许可、编译后静态前端和 bundled 前端许可，无旧 Python / runtime。归档实际复制到仓库外的中文 / 空格 / 点目录路径，NODE_PATH / NODE_OPTIONS 清除，解析路径强制在 ASAR 内，避免误回退到工作区依赖；数据写在包外，cwd 也独立。

源码和 ASAR 各在 Chromium / WebKit 完成实际 SDK transport / 消息状态验证，共 **4 份浏览器检查通过**，pageerror 与外部浏览器请求均为 0。另有两份“只杀父进程”检查通过，未用进程树 kill 冒充孤儿收尾；worker 在 5 秒内退出，显式父 PID 轮询为 250ms。正常退出均收到 stopped 确认及 exit=0。53 项离线检查、语法 / 目录 / phone strict 类型检查通过；本卡没有把此前 M0.2 的旧版 70 项全套计为本轮重跑。

首次 strict 检查因 SDK 所需 Node / json-schema 声明缺失而失败，已补齐精确依赖，保持 strict 和 skipLibCheck=false。浏览器首次断言混淆 p/status 与 output 的原生 status 角色，改为明确命名 SDK 状态，失败报告 / 截图与最终整套复验分别保留。Vite 的 SWR `use client` 打包警告保留于 build.log；静态 CSR 页面实际通过，不宣称 SSR 指令已验证。

限制：phone 仅是明确标注的兼容实验页，未接默认网关，不是产品聊天页；正式 HTTP/SSE transport、应用级单写者锁 / 迁移 / 崩溃恢复、PID 复用与完整生命周期合同、Responses SSE / 多图 / 多轮 / 取消均进入后续任务。SQLite 是 Windows 候选，Mac arm64 / x64、实际安装版和 Keychain 未测；真实提供商账户、实体手机、系统键鼠与安装升级没有新增验收。实验 ASAR 不是最终 Node 安装包，不能用其大小宣称 Windows / Mac 包体目标达成。

证据：[兼容决策与复现](node-service-compatibility.md)、[脱敏报告](../artifacts/node-service-compatibility-check.json)、[真实实验页](../artifacts/node-service-compatibility-phone.png)。最终原始证据 `.test-data/node-service-m03/run-ma75f2/`，前次失败在 `run-UICkdM`、`run-kbfltc` 与 `typecheck.log`。下一项 M0.4，继续固定旧格式和两条完整 mock 协议；M1～M5 尚未实施，默认仍为 legacy。

## 2026-11-07 M0.2 启动分段与常规 10 次实测

保留 M0.1 全部已有改动，新增 `desktop/startup-metrics.cjs`、本地窗口计时窄 IPC、Runtime 阶段回调、`test:startup` 和 Windows 采样 / 汇总脚本。只有显式隔离 userData + 计时开关才启用；默认路径无计时文件或界面变化。所有阶段使用 Electron 主进程单调时钟，固定枚举 / 耗时，不记录 URL、token、密钥、正文或任意错误体。mock provider 从旧 fixture 提取，不再为计时另启动多余的 Open WebUI。

Windows 11 x64 / Ryzen 7 7800X3D，实际 Electron 44.8.0 源码应用、固定 Python 3.12.16 / Open WebUI 0.12.2、本地 mock。正式一次初始化后，**10 次完整退出 / 重启同次全部通过**：会话读取、等到真实 sessionStorage 草稿保存、一条实际 mock 请求、回答落盘均验证。每次观察到的 8 个所属进程退出、网关端口释放。首次初始化单列；小样本没有混入正式分布。

从 main.cjs 入口起，服务 ready 中位数 **5,651.211ms** / 最大 **6,199.880ms**；手机可交互 **7,286.320ms** / **7,870.027ms**；业务可用核对完成 **8,007.293ms** / **8,595.383ms**。窗口显示中位数 244.177ms，不能当作可聊天时间。spawn → 健康接口观察中位数 5,124.408ms，包含 Python / 上游 / 存储与 HTTP 初始化及轮询，不能全归因于 Python 导入。`storage-ready` 是成功账户操作后的 DB 可用观察界限，不是上游内部开库时间；mock 可见正文时间也不是云模型首 token 延迟。

52 项离线检查和语法 / 目录检查通过；提取 mock 后 Chromium / WebKit **70 / 70 全套同次通过**，无跳过、重试或 flaky，347,861.781ms。默认关闭计时的 Windows 原生桌面仍通过：权限 granted、真实 2560×1440 截图、暂停 / 恢复及关窗驻留。旧 artifacts 截图已恢复原字节，新原始证据在 `.test-data/node-service-m02/`。本轮未重跑系统鼠标 / 热键、安装 / LAN 网卡、Mac 或实体手机。

旧 NSIS 重新统计仍为 308,753,932 字节，原 SHA-256 一致；解包 946,046,039 字节 / 23,606 文件。源码计时不等于该安装包计时，没有新 Node / Mac 包或性能改善验收。

**5 次真实 Windows 重启后首次启动仍为 0 / 5**，因此 M0.2 未标整卡通过。同启动周期调用 `--post-reboot` 已实际被 `BOOT_ALREADY_SAMPLED` 拒绝，账本不变，未将进程重启冒充系统冷启动。重启会中断用户 Windows / IDE，本轮没有自动重启或改登录任务；已提供在前一启动周期准备数据、随后每次真实重启后采一次的命令。需要操作者在打开 Scrylet 前执行。当轮下一项原为补齐这 5 个启动周期，随后用户选择暂保留未测并继续 M0.3，最新结果见上节。

证据：[完整口径与复现](node-service-startup.md)、[脱敏逐次样本 / 汇总](../artifacts/node-service-startup-check.json)。原始样本在 `.test-data/node-service-m02/measurement/samples.json`，全套浏览器报告在 `.test-data/node-service-m02/ui.json`。默认旧运行层、用户实际数据、Python 资源和已有功能保持。

## 2026-11-07 开始 Node 重构，核对 M0.1 实际基线

入口提交 `d00f40fe17434576127dd7343ba11aed8f3bab73`（`2.0.0-dev.6`），开始时工作区干净。同步 AGENTS、产品规格和架构中的过渡期规则，纠正过时的“截图提示可开启”条款；截图始终静默，保留手机主动朗读和声音设置。默认运行层继续是 Open WebUI 0.12.2 / Python，没有切换默认、删除旧资源或打开真实模型账户。

WSL2 编排下调用本机 Windows Node 22.14.0，实际测试平台为 Windows 11 x64。语法 / 目录检查、47 项离线测试和 Chromium / WebKit 70 项完整浏览器集成在同一次运行通过，无跳过、无 flaky / 重试。浏览器使用真实固定上游、隔离临时数据与本地 mock；结果见 `.test-data/node-service-m0/ui.json`，运行 349,415.031ms。没有外部模型请求；浏览器语音引擎使用模拟实现，不代表实体手机扬声器验收。

现有桌面脚本首次受 IDE 的 `ELECTRON_RUN_AS_NODE` 影响启动失败；仅移除验收进程该变量后，Windows 实际 Electron 启动、暂停 / 恢复、屏幕权限 granted、真实 2560×1440 截图与关闭到托盘通过。失败和复验日志分别保留，没有用 denied capture 充当成功。本轮未重做系统鼠标 / 快捷键、多屏、真实 LAN、安装升级、macOS 或实体手机验收。

新增 [实际基线矩阵](node-service-baseline.md)、`test:baseline` 与独立 Playwright 配置。补充套件最终 Chromium / WebKit 同次 **8 / 8 通过**，无跳过、重试；73,568.571ms，原始结果在 `.test-data/node-service-m0/baseline-verified.json`，与上述 70 项独立记账。核对重命名、置顶 / 取消、搜索、JSON 下载、删除确认、克隆不调用模型、归档、分组折叠、编辑 / 重答新增分支及历史草稿切换；未执行的消息删除、TXT / PDF 输出、分享链接等明确只登记入口，未计业务验收成功。

侧栏弹层使用普通 button，分享 / 克隆未被按 menuitem 的裁剪规则隐藏；草稿使用 sessionStorage 的 `chat-input` / `chat-input-<id>`，含已上传文件 ID 与元数据。仅浏览兄弟分支不会立即保存选择，刷新恢复已保存分支；固定 loader 优先采用有效顶层 `current_message_id`，不能仅按线性消息最后一条推断。用户编辑依赖 hover / focus reveal，本次走聚焦后操作，纯触摸路径仍未验收。调试中的定位器、弹层时序和“展示选择已落盘”错误假设导致的失败 / 中断均保留，没有修改旧业务实现或删除原测试来获取通过。

M0.1 已完成 36 项功能与 14 项扩充入口的证据登记；M0.2 已只读核对旧安装包 308,753,932 字节及原 SHA-256，解包 946,046,039 字节 / 23,606 文件，尚未做分段 / 重复启动计时。下一项继续 M0.2。M1～M5 尚未开始，Mac 四份安装包、Node 迁移及新增数据后回退保持未通过。脱敏汇总见 [基线报告](../artifacts/node-service-baseline-check.json)，真实隔离渲染见 [会话菜单](../artifacts/node-service-baseline-menu.png) 与 [消息分支](../artifacts/node-service-baseline-branches.png)。

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
