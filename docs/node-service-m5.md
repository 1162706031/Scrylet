# M5：轻量候选、默认路径准备与最终验收

> 2026-11-09 本轮收尾：用户确认 M0 保留矩阵已测，明确授权移除旧依赖，并暂缓 Mac 实机测试、缩减重复测试。当前源码仅支持 Node，旧源码和原断言归档，正常 Windows 安装入口与 Mac 两架构 ZIP 构建已接通。实际产物、检查结果和边界以 [M5 收尾记录](node-service-finalization.md) 为准；下文保留此前分轮证据，不将未测门槛改为通过。

2026-11-09。按用户选择，源码 `npm start` 已切换为 Node 默认；候选包也默认 Node。已有旧库自动只读迁移到独立 `Scrylet` 数据目录，旧 `Snap-Solver` 保留；显式 `start:legacy` 仍用于固定旧版对照。没有可用的 Mac、实体手机或独立 Windows 安装身份环境，因此发布验收不计全部完成。未修改真实用户库、覆盖已有安装、连接真实模型账户或发布产物。

## M5.1 默认路径与旧依赖

已实施 Node-only 候选和源码 Node 默认：Runtime 默认选择 Node，旧 runtime / gateway / paths 只在显式 legacy 时懒加载，候选资源排除它们、Python / Open WebUI、旧聊天扩展和 http-proxy。SDK / SQLite 由 Electron utilityProcess 提供，没有系统 Node / Python 进程。普通启动发现旧 `open-webui/webui.db` 时，复用 M4 进度窗口、旧写者保护、WAL 快照和激活契约导入独立新目录，完成后不重复导入。隔离候选仍要求独立绝对路径 userData，不用于真实数据首次试验。M4 本地迁移 / 导出继续存在。

初次启动在对外 ready 前导入未初始化的旧连接 / 环境 seed：只处理 revision=0，已保存连接、已删除密钥和完整旧库导入优先；校验后经 OS 加密保存，完成标记不含秘密。配置本身不触发模型请求；无效种子不能记完成。原旧配置文件只读。

`setup` 默认只做 phone strict / build 和 Windows 预编译 observer 校验；`test:ui` 默认 Node 手机页，`test:startup` 默认 Node 实际业务测量，`dist:win` 生成独立 Node NSIS。原实现通过 `setup:legacy` / `test:legacy-ui` / `test:startup:legacy` / `dist:legacy:win` 保留，原测试断言和旧资源没有删除。根模块类型、Electron 44.8.0、desktop / scripts / tests CJS 与 phone strict TS 不变。

构建使用独立 staging manifest 收集 Node 生产依赖，避免 electron-builder 的 extraMetadata 深合并把 http-proxy 声明重新带入。审计同时检查默认 Node、生产依赖、编译资源、静默资源 / 许可、observer 架构 / 哈希、无私有数据，以及旧文件 / 旧依赖不存在。当前候选审计 3,430 ASAR 条目 / 151 项项目文件。

**本卡部分完成。** 源码默认路径已按用户要求切换，隔离目录下的无环境变量实际启动与完整自动迁移回归仍须本轮执行；旧资源删除和正式发布仍须 M4.4 正式身份、M4.5 / M5.5 Mac、物理设备及完整性能验收，不能将默认切换称为全平台发布完成。

## M5.2 业务、原生与安装验收

本轮分别执行并通过：离线 / 严格检查、Node 手机两引擎 50 项、手机独立测试 ASAR 12 项、后端源码 34 / ASAR 33 组、M4 迁移 33 组、浏览器升级 4 项。旧版 Chromium / WebKit 完整 70 项同轮通过，零 skip / flaky；没有以删除旧测试换取新默认测试通过。M0 / M2 / M4 原截图恢复原字节，新渲染单独保存。

Windows 源码与 Node-only 解包候选分别实际验证：全屏 / 区域热键、应用菜单、五个鼠标按钮长按、取消 / 超时 / 双击 / 草稿拒绝，截图静默与单接收页；分别 8 次 mock。observer 原生合成输入、两处各 4 组正常 / 异常生命周期、缓存保留与 LAN 网卡 / 配对也通过。未将合成输入、单屏 150% 或浏览器语音模拟称为物理键鼠、多屏或真实手机。

最终安装检查继续使用独立 NSIS GUID / 快捷方式 / 安装缓存，保留应用 `com.snapsolver.desktop` 和原 payload。新包不设置 `SNAP_RUNTIME_ENGINE`，验证包元数据默认 Node、require cache 不加载旧运行层，以及安装后的 ASAR 与当前审计一致；安装器哈希在演练中必须稳定。旧安装 → 新包覆盖 → 保存新图文 / 分支 / 草稿 → 完整退出重启 → 缓存清理 → 卸载保留数据 / OS profile → 重装继续 mock → 安装版本地导出 → 实际旧安装读回，结果以机器汇总中的最终报告为准。

正式生产 GUID、真实用户路径自动切换和 Mac 两平台业务未验收，整卡部分通过。已有用户安装只读检查并保护，不将验收命名空间冒充生产身份升级。

## M5.3 实际体积、启动与设备

`measure:package` 统计完整实际 NSIS / 解包文件和 SHA-256，包含全部服务 / 前端 / 原生资源，不是排除 Python 后的压缩估算。当前同 ASAR 的测量为安装器 **125,862,818 字节 / 120.032 MiB**，解包 **429,123,789 字节 / 409.244 MiB / 83 文件**，Python **0 字节**。候选输出若重新构建，所有测量与验收必须重新绑定，旧数字不能混用；Windows 结果不会写成 Mac DMG / ZIP 大小。

`test:startup` 使用真实 Electron 主进程单调时钟，初始化单列；10 次完整退出启动逐次恢复历史和已保存文字 / 图片、确认新草稿保存、经实际 composer 发起一次 mock，验证结果落盘和子进程 / 端口释放。源码显式 Node 与包内默认 Node 分开报告；候选 PATH 仅 Windows / System32，不依赖系统开发运行时。完整设置采样启用 Rust observer，记录所属进程 working set / private bytes；working set 总和会重复统计共享页，不冒充去重物理内存。脚本支持实际新系统启动周期的一次采样，拒绝同一次 boot 重复记为冷启动，不会自动重启设备。

失败保留：首次采样发现计时链路尚未发出 Node ready 里程碑，补齐 spawn / storage-ready / seed 完成后的 service-ready；另一次系统自动分配 6668，浏览器拒绝页面。网关现按 Fetch 禁用端口列表过滤自动端口、回退已保存的禁用端口，并明确拒绝显式禁用端口；没有弱化浏览器安全配置。修正后重新构建与完整采样，详见最终报告，不将失败轮次混入分布。

实体手机 / 扬声器、5 次真实重启首启、Mac 包体 / 性能均未通过；内存比较和安装时长只有实际记录的范围有效，不凭估算宣称全平台提升。本卡部分完成。

## M5.4 文档与交接

已同步 README、新手文档、架构、AGENTS、第三方说明、逐文件手册和验收记录。旧版条款明确只约束保留的 comparison 路径；新构建 / 默认测试入口与源码生产默认的差别明确登记。Node-only 候选保留完整 Electron、Node 依赖、phone bundle 和 Rust 许可证；历史 Python / Open WebUI 许可仍留给旧对照，不擅自移除署名。

`test:release` 使用独立本地版本契约，检查固定门槛、版本、候选哈希与证据文件；缺项 / 未测 / 估算不能变成通过。它只检查并报告，不修改用户数据或自动发布。当前仍应退出 1，门槛没有被改成可选。

## M5.5 Mac 两架构交付

Mac 构建也接入独立 staging、默认 Node、旧依赖排除与许可审计；保留各自 arm64 / x64 DMG / ZIP 命令、app 资源 / Mach-O 审计和迁移 / Keychain / 安装 / 旧版读回脚本。新接线只有本机语法 / 结构检查，非 Mac 调用拒绝。

**当前仍为 0/4 真实 Mac 产物、0/2 架构安装 / Keychain 验收。** 没有远程 Mac 或交叉模拟结果，不计完成。需真实 Apple Silicon / Intel Mac、各自产物与安装 / 替换 / 重装 / 权限 / 签名公证状态，才可解除门槛。

## F01～F36 与 M0 保留矩阵

本表只登记实际自动化范围；所有 Mac 行均未测，物理范围按各行保留。源码、测试 ASAR 与实际安装分别列证据，不把不同轮次累计成“一次全平台全套通过”。

| 功能 | 本轮 Windows 证据与边界 | Mac |
| --- | --- | --- |
| F01 桌面连接与权限状态 | 原生源码 / 解包窗口及安装截图；Mac 权限未测 | 未测 |
| F02 托盘与进程生命周期 | 两处生命周期各 4 组，父进程死亡 / 重启 | 未测 |
| F03 二维码 / 连接码配对 | 离线 + 两引擎 + 原生 LAN 配对；物理扫码未测 | 未测 |
| F04 设备限制 / 撤销 | 配对单元 / gateway / receiver；无八台实体设备声明 | 未测 |
| F05 暂停与停止分离 | Node receiver / generation 契约与浏览器暂停恢复 | 未测 |
| F06 网卡选择 / 持久化 | 源码 / 解包 LAN 网卡选择与重启；真实 DHCP 场景另列 | 未测 |
| F07 端口复用 / 冲突 / 地址 | 端口复用 / 占用、禁用端口测试和两引擎跨 origin 边界 | 未测 |
| F08 品牌 / 安装身份 / 路径 | brand 单元、同 appId；正式 GUID / 用户默认路径切换未测 | 未测 |
| F09 手机截图 / 框选 / 选图 | 两引擎 50 项 + 原生截图；多屏为模拟 | 未测 |
| F10 12 图 / 顺序 / 预览 / 撤销 | 两引擎附件整理 / 顺序 / 整批拒绝 | 未测 |
| F11 异步处理与草稿竞争 | composer 代次 / 处理中拒绝 / 失败保留 | 未测 |
| F12 像素 / 缩放 / 多屏坐标 | Windows 单屏 150% 原生区域；负原点 / 混合 DPI 未测 | 未测 |
| F13 全屏 / 区域热键与菜单 | 源码 / 解包实际系统热键与菜单 | 未测 |
| F14 五键长按 / 双击 / 取消 | Rust observer / driver 与两处实际系统事件 | 未测 |
| F15 设置与热键失败回滚 | 设置 / 快捷键冲突回滚单元与原生保存 | 未测 |
| F16 单前台 receiver 与拒绝条件 | 多页面 receiver / 草稿 / busy / 模态 / 后台竞态 | 未测 |
| F17 同 composer / 不重放 | 实际自动发送、ACK 丢失 / 并发 / uncertain 无重放 | 未测 |
| F18 全流程截图静默 | native quiet 计数与前端 quiet；无物理扬声器通过声明 | 未测 |
| F19 多轮图文与流式 | 实际 SDK / 两协议 / 流 / 图文上下文，全部 mock | 未测 |
| F20 真实停止 / 部分保留 / 无重放 | 实际请求断开 / stop、部分落盘 / 崩溃恢复 | 未测 |
| F21 全部会话与消息菜单 | history 两引擎菜单、分支、编辑与删除；M0 子项见下表 | 未测 |
| F22 Markdown / 公式 / 代码 / 导出 | 两引擎公式 / 表格 / 代码与 JSON / TXT / PDF 下载解析 | 未测 |
| F23 已保存文字和图片草稿 | 服务草稿 + 同 origin 旧 / 新 / 回退实际 UI 与图片字节 | 未测 |
| F24 6 家 / 16 模型与双协议 | 固定目录与 SDK Chat / Responses；真实账户未测 | 未测 |
| F25 模型设置与密钥串行保存 | 主进程 OS 秘密 RPC / provider revision / tombstone | 未测 |
| F26 初次导入 / 种子 / 删除状态 | 完整旧库导入、只读 seeds 与完成标记 / 删除不复活 | 未测 |
| F27 窄屏 / 短屏 / 键盘 / 缩放 | 320 / 390×460 / VisualViewport；物理键盘 / 手机未测 | 未测 |
| F28 权限 / 断连 / 故障恢复 | 恢复 / retry / 暂停 / 状态，权限拒绝后授权未测 | 未测 |
| F29 主动朗读 / 不补播 | 两引擎 speech 模拟；实体扬声器未测 | 未测 |
| F30 关闭 / 停读 / 后台取消 | 模拟关闭 / 停读 / 导航 / 后台取消，无 TTS 请求 | 未测 |
| F31 声音 / 语速 / 主动试听 | 模拟声音 / 延迟载入 / 语速 / 主动试听；物理未测 | 未测 |
| F32 电脑静默与零采样音频 | 桌面无入口 / Chromium WebAudio / WebKit PCM；物理未测 | 未测 |
| F33 白名单日志 / 轮换 / 重启 | 日志单元 + 两处原生维护，秘密白名单和轮换 | 未测 |
| F34 缓存清理保留数据 | 两处原生缓存、Cookie / localStorage / DB / 图片 / 设置保留 | 未测 |
| F35 完整迁移与新增数据后回退 | 33 组迁移 + 4 两引擎升级 + 实际旧版读回 | 未测 |
| F36 安装 / 资源 / 卸载保留 | Node-only 资源审计 / NSIS 演练；生产 GUID 与 Mac 未验收 | 未测 |

M0 的 14 项 F21 扩充入口均保留于 [基线](node-service-baseline.md#f21-扩充入口清单与验收边界)，本轮 Node 50 项、后端图契约与迁移覆盖新建 / URL / 搜索 / 重命名 / 置顶 / 未读、JSON / TXT / PDF、归档 / 确认删除 / 克隆、仅已配对 LAN 分享、复制 / 代码保存折叠、用户 / 助手保存编辑与发送 / 重答分支、删除消息 / 切换兄弟、标记全部已读和会话组折叠。F21.12 原无已证实导入入口，不为凑数量增加公开导入或旧提交接口；剪贴板被拒绝与浏览器保存边界仍按测试结果报告。各子项 ID 与证据也写入机器矩阵。

## 可复制入口

```sh
npm ci
npm run setup
npm start                       # 默认 Node；已有旧库自动只读迁移
npm run start:node -- --data <独立绝对路径>
npm run start:legacy            # 显式旧版对照，先 setup:legacy
npm run test:ui                 # Node 手机两引擎
npm run test:legacy-ui          # 保留的旧版完整对照，需 setup:legacy
npm run dist:win                # 本机 Node-only 候选 NSIS，不覆盖旧 dist
npm run test:candidate:win      # 当前源码 / 解包、业务 / 原生回归
npm run test:candidate:win -- --native-only
npm run measure:package
npm run test:startup -- --executable <候选Scrylet.exe> --runs 10
npm run test:upgrade:win -- --isolated-nsis --node-default --old-installer <固定旧安装器> --new-installer <独立命名空间新候选>
npm run collect:m5 -- --acceptance <完整候选验收/report.json> --installation <同安装器的隔离安装/report.json> --startup <同ASAR的启动/report.json> --package <同安装器的包体.json> --unpacked build/node-win-x64-candidate/output/win-unpacked --installer build/node-win-x64-candidate/output/Scrylet-2.0.0-dev.6-win-x64-Setup.exe
npm run test:release -- artifacts/node-service-m5-release.json <对应候选安装器> # 未测门槛必须仍退出 1
```

完整机器结果：node-service-m5-check.json（本地：`artifacts/node-service-m5-check.json`）。原始日志 / 数据仅在忽略的 `.test-data/node-service-m5/`；旧基线和 M4 夹具不改写。源码默认已切换为 Node；对外发布和 Python / Open WebUI 删除没有执行。
