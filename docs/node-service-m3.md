# M3 原生输入、桌面生命周期与 Mac 构建

更新：2026-11-08。范围：M3.1～M3.4。保留此前工作区改动、根 CommonJS、Electron 44.8.0、默认 legacy 和全部 Python / Open WebUI 对照资源。模型均为 loopback mock，没有真实账户请求；不读取或清理用户数据目录。

## M3.1：Rust observer 与 Node 边界

关联 F02、F12～F18、F36。实现：`native/input-observer/`、只读 Win32 共享层 `native/win-system/`、`desktop/native-program.cjs`、`desktop/mouse-input.cjs`、`runtime-paths.cjs` 与 capture 生命周期接线。工具链锁定 Rust 1.91.0 / Windows GNU，Cargo.lock 仅本地三个 crate，无外部 Cargo 依赖。

observer 以约 20ms 轮询读取五种按钮，声明 physical 坐标；启动设置并确认 per-monitor-v2，JS 仅在原 `CaptureControls.pointer()` 转 DIP 一次。它不注入、吞掉或拦截输入。输入桌面变化 / 坐标失败取消手势，启动已按住的按钮先等待释放，恢复后不补发旧 down。父进程以 SYNCHRONIZE 句柄固定身份，stdin EOF 或父进程死亡结束。stdout 只有 v1 JSON Lines，stderr 不作为事件。

Node 先校验 PE / x64 / 长度 / SHA-256 和正式 manifest，再启动预编译程序；握手有超时，1024 字节行上限，拒绝 ready 前事件、重复 ready、未知事件 / 版本、超长或截断行。stop 先 stdin EOF，有界等待后 kill；连续启停不会产生第二个 observer。失败清掉 mouseReady 并重置手势；没有系统 Python 或在线下载回退。

已通过：8 项 Node 边界 / 生命周期检查，3 项 Rust 状态测试；Windows x64 实际五按钮事件、运动坐标、EOF 与只杀父进程退出。真实桌面源码的两角长按、全部按钮、短按 / 拖动拒绝、双击关闭 / 开启、5 秒超时、Esc、150% 缩放和已有草稿拒绝通过。生产默认长按仍为 1200ms，验收合成 hold 用 1500ms 留出系统调度余量，不改变产品阈值。

证据：`.test-data/node-service-m3/rust-tests-final.log`、`unit-final.log`、`native-KEm7P7/report.json`；源码实际截图见下节。observer：287,744 字节，SHA-256 `912b94de23b5d186724b4028950592ad9883c565d8d1a41f744de39200f926d7`。PE 导入仅 Windows 系统 DLL，没有外置 libgcc / libwinpthread / Python。正式资源还附原项目与精确 Rust 工具链版权文件。

`rust-toolchain.toml` 与构建命令均显式选择 `1.91.0-x86_64-pc-windows-gnu`，避免开发机默认 MSVC 影响链接器选择；最后用该完整名称重建 / 跑 Rust 测试通过，binary 哈希保持相同，见 `build-explicit-toolchain.log`。

尚未通过：实际锁屏 / UAC 输入桌面切换、多显示器负原点 / 混合 DPI、物理鼠标及键盘。桌面失效 / 恢复和负坐标已覆盖纯状态测试，不能代替上述设备验收。下一项为 M3.2 的独立注入 / 强杀清理验收。

## M3.2：独立 Rust 测试驱动与无 Python 夹具

关联 F12～F18、F33、F36。`native/test-input-driver/` 单独编译，支持 move / hold / key 及补充的 drag / click；`scripts/windows-input.cjs` 验证测试专用 manifest 后调用它。`scripts/smoke-desktop-input.cjs` 改用独立 `protocolProvider()`，不再启动 Python 测试夹具或 `tests/windows-input.py`。旧 Python 文件仅留历史对照，未被删除。

驱动使用物理坐标的 SetCursorPos 和 SendInput，拒绝已经按住的输入，限制持有时间；错误 / EOF / 父进程死亡由 RAII 释放。额外独立 guardian 在驱动被强杀后释放按键，正常完成通过管道确认；该注入实现不进入 observer 或共享只读库。验收前检查已有 Electron / Scrylet 进程，遇到用户 app 就拒绝注入，不关闭它。结束恢复测试前的光标。

已通过：`scripts/test-native-input.cjs` 的 5 组真实系统路径检查，含强杀持有左键的驱动后观察到 release；`scripts/smoke-desktop-input.cjs` 的截图 / 快捷键 / 长按自动提交完全不需要 Python 夹具。输入为系统合成事件，未记作物理鼠标 / 键盘。测试 driver 390,144 字节，SHA-256 `58a83b2928dbcbda9c7aa2af5d6263fba35e5ec5ba12d72a9703c73b8e0a51a3`；正式打包只白名单 observer / manifest / notices / licenses，明确排除 driver 与 test-manifest。

证据：`.test-data/node-service-m3/native-low-final.log`、`native-KEm7P7/report.json` 与 `desktop-source-final.log`。下一项 M3.3：独立解包副本与生命周期，Mac 已有能力单独保留未验收。

## M3.3：源码与解包桌面验收

Windows x64 源码已通过实际全屏快捷键、区域快捷键与 Esc、两角区域、全部五按钮、短按 / 拖动拒绝、双击开关、超时、已有草稿拒绝及应用菜单截图。8 次 mock 模型请求、0 次外部请求。150% 缩放下区域 PNG 为 720×480；截图始终无选区窗、通知、托盘截图提示或连接窗恢复。旧 showCaptureHints=true 经实际 IPC 保存后仍为 false，桌面 webContents 始终静音。

最终源码证据：`artifacts/node-service-m3-desktop-input-check.json`，隔离原始数据 `snap-input-8xbDLq`（系统临时目录）；`.test-data/node-service-m3/desktop-source-cleanup-final.log`，业务断言及全部清理完成后才写通过记录，控制进程退出 0。

electron-builder 已生成独立 Windows x64 `--dir`，复制到仓库外 `Scrylet M3 独立.路径-GMludm/Scrylet 运行.副本` 后同样完整通过。应用 cwd 为新临时目录，PATH 仅保留 Windows / System32，移除 NODE_PATH / NODE_OPTIONS，不依赖源码、系统 Node / Python / Rust。正式 observer 从 resources/native/win32-x64 启动，测试注入来自仓库的独立 driver。解包同样 8 次 mock、720×480 / 150%、静默计数全零、清理完成及退出 0，见 `artifacts/node-service-m3-desktop-input-packaged-check.json` / `.test-data/node-service-m3/desktop-packaged-cleanup-final.log`，原始数据 `snap-input-NSPuRC`。这是合成系统输入 + 真实原生截图，未计作物理手机。

源码 / 解包各 4 组生命周期最终通过：实际关闭窗口隐藏但不销毁，应用菜单恢复窗口，桌面音频静音；正常退出等待 observer / Node 服务结束，只杀真实主进程后两子进程自行退出，随后重启重新打开 SQLite 无孤儿锁。证据 `lifecycle-9nqw5h/report.json` 与 `lifecycle-nA3prn/report.json`，不是用 taskkill /T 杀整棵树制造清理通过；托盘为实际关窗驻留检查，未虚称人工点击 OS 托盘菜单。

构建目录及仓库外副本资源审计均通过：ASAR 3,462 条目、146 份项目文件与当前源码 / 已构建 phone 逐字节一致，包含运行服务 / 静态资源 / 浏览器许可证；测试 driver / test-manifest / Rust 源码 / 开发工具 / 私有目录未进入正式资源。保留 Python 3.12.16 / Open WebUI 0.12.2 对照，observer PE / 哈希正确。ASAR SHA-256 `46cbcbd87702aaa1cbf9f5064891cb274e202c8e50d31b90f688c8ddcd6808d7`；审计见 `.test-data/node-service-m3/package-audit-final.json` / `unpacked-audit-final.json`。LICENSE 实际位于 resources/LICENSE.txt，与源码逐字节核对。

独立新 UI 截图（二维码、配对码、地址已遮盖）：源码 桌面（本地：`artifacts/node-service-m3-desktop-input.png`） / 设置（本地：`artifacts/node-service-m3-desktop-input-settings.png`） / 手机回答（本地：`artifacts/node-service-m3-desktop-input-answer.png`）；解包 桌面（本地：`artifacts/node-service-m3-desktop-input-packaged.png`） / 设置（本地：`artifacts/node-service-m3-desktop-input-packaged-settings.png`） / 手机回答（本地：`artifacts/node-service-m3-desktop-input-packaged-answer.png`）。旧 M0 / M2 截图没有覆盖。

Windows 本轮生成的是带旧资源的 `--dir` 解包候选，默认 legacy；显式独立 Node 数据验收。它不是新的 NSIS / 最终发行包。Mac arm64 / x64、屏幕权限拒绝后再授权、物理手机 / 扬声器和多屏仍未测，整卡不能称所有平台已通过。下一项 M3.4 的配置 / 静态审计已经完成，Mac 真机回归仍是门槛。

同轮后端回归：源码 34 组、独立测试 ASAR 33 组通过，见 `.test-data/node-service-m1/run-AZOkkt/report.json` / `.test-data/node-service-m3/service-regression-final.log`；不把测试 ASAR 算成安装包。本轮未重跑 M2 的 50 项完整浏览器矩阵，原 M2 证据保持历史口径；本轮实际 Node 手机页与系统截图集成由上述源码 / 解包各 8 次请求验证。汇总见 node-service-m3-check.json（本地：`artifacts/node-service-m3-check.json`）。

## M3.4：Mac 图标、分架构构建和安装审计

关联 F01、F02、F08、F09、F12～F18、F30～F36。已实现 `scripts/package-config.cjs`、`dist-mac.cjs`、`mac-icons.cjs`、`package-audit.cjs`、`audit-package.cjs`、`smoke-mac-package.cjs` 和对应 npm 命令。原 Windows appId / NSIS / 保留数据选项不变；新增正式 Rust 资源白名单。Windows 配置入口拒绝被 --mac 复用，Mac wrapper 按平台、架构与 profile 生成独立配置。

Mac 每架构 DMG + ZIP、UDZO 与 Applications 链接、ICNS 和权限说明已配置；从原 SVG 原尺寸栅格化 16～1024px / Retina，实际 ICNS 的 11 个 PNG 块及尺寸检查通过。Mac 构建调用系统 iconutil；本次 Windows 只验证 ICNS 结构，不虚称 Finder 图标已验收。

Mac 不包含 Python / Windows exe / 测试 driver / 空 helper 目录；mouseSupported=false，不影响现有全屏与手机框选入口。运行资源基于 app.asar / process.resourcesPath。审计解析实际 Info.plist、最低系统版本、bundle ID / 版本 / 图标、可执行权限 / 链接、Mach-O 主程序 / Framework / helpers / `.node` 的目标架构，以及服务 / phone-dist / 许可证 / 当前源码一致性；不猜一个最低系统版本。

当前仅 development 候选：`SNAP_RUNTIME_ENGINE=node` 且绝对 `SNAP_DATA_DIR` 才能启动，否则在打开真实 userData 前退出。distribution 在 M4/M5 默认切换前拒绝；不以候选包绕过默认 legacy 的迁移 / 回退门槛。开发 profile 实际记录 unsigned / ad-hoc / Developer ID，外部分发另要求签名与公证；没有 quarantine 或安全检查绕过。

```sh
npm run icons:mac
npm run dist:mac:arm64
npm run dist:mac:x64
npm run test:mac-package -- --arch arm64 --dmg dist/Scrylet-2.0.0-dev.6-mac-arm64.dmg --zip dist/Scrylet-2.0.0-dev.6-mac-arm64.zip
# 在真实 Intel Mac 用 --arch x64 与对应的两份产物；可用 --previous-app 指定只读旧 app。
```

安装脚本要求目标原生硬件，拒绝把 Rosetta 算作 Intel 验收，拒绝替换正在运行的 Scrylet。只在新建隔离 Applications / userData 副本中挂载、复制、弹出 DMG、解压 ZIP、替换 app，实际 safeStorage / Keychain 加解密及截图；卸载副本后重装验证历史 / 草稿 / 配对和密钥，并以 mock 再发一轮。可传旧 app 检查替换前后 Keychain，但它不代表 M4 完整旧库迁移。Finder 人工拖拽、真实 LAN、全部旧数据、权限拒绝 / 重授权、全局快捷键 / 托盘 / 静默和朗读的 Mac 验收仍另列未通过；脚本不会仅凭构建成功写安装通过。

已通过：7 项打包 / ICNS / Mach-O / 哈希结构检查；全仓 134/134 离线检查及 check（语法、目录、phone / contracts strict）通过。**没有真实 Mac，两架构 DMG / ZIP 均未生成、未运行、未安装；Keychain / 签名 / 公证 / 拖拽均未验收。** 下一步可做 M4.1 只读旧格式导入，独立保留 Mac 的 M3.3 / M3.4 与 M5 实机门槛；默认仍 legacy。

## 失败、限制和依据

保留 `.test-data/node-service-m3/` 的全部首次失败记录：最初原生验收因已有测试 Electron 尚未退出而拒绝注入；测试 require 上下文、截断行用例等待时机和 lifecycle 启动器 PID 假设已修正。长按测试最初只有 100ms 调度余量，改为默认阈值 +300ms 后完整通过。第一次 builder 下载固定 Electron 遇 HTTP 504，改用本地已安装的同版 Electron 44.8.0；没有升级。首次资源审计发现 LICENSE 被 builder 放在 extraResources，而非重复放 ASAR，改为核对实际外部许可字节；源码变更后的旧解包审计正确拒绝，重新打包。一次 WSL interop 启动审计报 UtilAcceptVsock，单独重跑成功；一次附加源码复测业务断言后控制进程返回 143，未计作整轮通过，原因未确认。脚本改为全部清理完成才输出结果，最终源码 / 解包完整重跑均清理完成、退出 0，没有忽略非零退出或删断言。

输入桌面与 DPI 依据：[GetAsyncKeyState](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getasynckeystate)、[OpenInputDesktop](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-openinputdesktop)、[SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput)、[DPI awareness](https://learn.microsoft.com/en-gb/windows/win32/hidpi/setting-the-default-dpi-awareness-for-a-process)。构建依据为锁定 electron-builder 26.18.0 本地 schema / MacPackager 与 [v26 Mac 文档](https://www.electron.build/v26/docs/mac/) / [DMG 文档](https://www.electron.build/v26/docs/dmg/)。Rust 工具链装在 ignored 隔离目录，用 CARGO_HOME / RUSTUP_HOME 定位，未改用户 PATH / shell profile，见 [rustup 安装说明](https://github.com/rust-lang/rustup/blob/main/doc/user-guide/src/installation/index.md)。
