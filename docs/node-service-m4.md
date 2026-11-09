# M4：旧数据迁移、浏览器升级与新增数据后的回退

2026-11-08。M4.1～M4.3 在 Windows x64 完成实现和隔离验收；M4.4 的实际 NSIS 安装闭环通过，但使用独立安装注册命名空间，正式 GUID 覆盖升级仍未验收。M4.5 已补迁移 / 回退验收接线，没有真实 Mac，arm64 / x64 均未通过。默认继续 legacy，Python / Open WebUI 保留，未进入 M5 默认切换。所有模型请求均为 loopback mock，未读取真实用户库或连接真实模型账户。

## M4.1 一致快照与阶段化导入

关联 F19～F26、F33～F35。`service/migrations/` 按 source / files / graph / connections / open-webui / rollback 拆分小型 CJS 模块；`contracts/migration.cjs` / `.d.ts` 固定本地状态、激活和回退报告。主进程在打开网关和操作日志前迁移，提供静音、隔离渲染器的原生进度窗口；不增加手机管理 API。迁移不改变默认引擎，只有显式独立 `SNAP_DATA_DIR` + `SNAP_RUNTIME_ENGINE=node` + `SNAP_MIGRATION_SOURCE` 才执行。

只读检查固定 0.12.2 的七张数据表 / alembic、单用户、完整性和关系；源 / 目标必须经 realpath 分离。旧写入进程与源租约阻止迁移，SQLite backup 包含已提交 WAL 帧；快照、受控附件及桌面文件经过内容 / 字节 / SHA-256 校验。阶段工作区与正式目标分开，全部校验后原子移动并写验证标记；未知 schema、丢图、配置不支持或空间不足不会建空库冒充成功。原始鉴权和完整旧 schema 只在私有快照中保留，脱敏报告仅有固定状态 / 计数 / 哈希。

保留 normalized 与 embedded 图及原始载荷，补全节点并校验当前指针；两者冲突时保留整条可达备用图，不拍平或丢弃兄弟分支。保留图片次序、毫秒及原纳秒十进制兼容值、自定义模型别名 / 名称 / 能力 / 支持参数、提示词、密钥删除状态、配对、网卡、截图配置和轮换日志。密钥通过 Electron OS 加密能力导入；不使用旧 seed / 环境变量复活删除项。Chat 的 `top_k` 用现有 SDK 的 provider options 保留原字段，Responses 不支持的配置拒绝激活。外部 URL / 过期 blob 不下载、不虚称可恢复；旧 `/api/v1/files/:id/content` 只通过已验证 ID 映射读取，并继续受网关配对 / 暂停限制。

最终 `test:migration` **33 组通过**：初始 2 会话 / 10 消息 / 2 图片 / 7 提示词 / 6 连接，含两套五节点分支、旧顶层当前指针、实际 WAL 帧及 SDK 参数请求验证。源 DB / 文件未变。证据 `.test-data/node-service-m4/run-4JeirL/report.json`。此前初次导入 `run-wys58v` 和阶段故障记录保留。下一项：M4.4 正式身份、M4.5 目标 Mac 实机；不拿 Windows safeStorage 代替 Keychain。

## M4.2 同 origin 草稿与偏好

关联 F07、F09～F11、F23、F29～F31、F35。React 启动前枚举本浏览器所有已保存旧草稿，先保留原始载荷，再解析图片、确认服务持久化草稿，最后写完成标记。不同的非空新版草稿不会被覆盖；图片尚不可读保留待确认状态。新草稿只有确认保存后才镜像成旧页面可读格式，保留原始备份和未知字段；不重放不确定提交、不主动朗读或补播。声音 / 裁剪 / 显示器偏好继续使用原键。

真实旧 UI → 同端口 Node 页 → 新草稿确认保存 → 回退旧 UI，在 Chromium / WebKit **4/4 通过**，零 skip / flaky；同时占用旧端口，验证新 origin 无法读取原 sessionStorage / localStorage，恢复原 origin 后原草稿仍可恢复。端口变化不能绕过浏览器隐私边界，旧 origin 数据不会被清除。Native 进度与新 / 旧手机渲染见文末截图。最终进度窗口另检查原生缩放下无页面溢出。

下一项：物理手机 / 扬声器和 Mac 浏览器实机；自动化浏览器语音模拟不计实际朗读验收。

## M4.3 重复、中断、失败与回退

关联 F19～F26、F34～F35。重复导入不会覆盖新版新增消息 / 分支 / 图片、修改提示词或恢复已删除的新密钥。六个阶段分别注入异常并重入；另外在 `inspected / snapshotted / files / data / validated / activated` 逐一由真实进程 `exit(93)`，新进程恢复并实际解密 OS 密钥。包含零可用空间后恢复、缺附件、未知 schema、错误配置、源目标重叠、活跃旧写者拒绝和活跃新写者拒绝。

新增图文轮次、兄弟重答、空会话、提示词修改和密钥再删除后，导出独立完整旧版副本；保留 Node 可读 DB / 附件 / 密钥及 Windows `Local State` 快照。两份新版数据分别由新进程打开且密钥可解密。回退导出不覆盖原旧库或新库，完整旧 schema、auth 和新消息图 / 图片 / 兼容时间 / 连接均经过验证。实际固定 Open WebUI 0.12.2 启动读回新增历史、分支、图片、提示词和删除状态通过；浏览器已保存的新草稿在实际旧 UI 恢复。证据在同一 33 组报告及两引擎升级报告，不把单纯 SQLite 可读当作旧版运行通过。

本地回退命令：

```sh
npm run export:legacy -- --data "绝对路径/独立新版数据" --output "尚不存在的路径/独立旧版副本"
# 安装版通过原应用的加密身份导出；入口核对 ASAR 协议，不启动旧 exe 读取新库
npm run export:legacy -- --data "独立新版数据" --output "独立旧版副本" --executable "已安装新版/Scrylet.exe"
```

需要停止该数据的写入实例；主进程本地 `--scrylet-export-legacy` 完成后退出，没有公开导出 API。回退旧版时显式选择导出副本，保留原新版目录。下一项：在目标 Mac 验证相同闭环与 Keychain。

## M4.4 Windows 实际安装闭环与保留数据

关联 F02～F08、F13～F15、F23～F26、F34～F36。完整实际安装 **8 组通过**：旧 NSIS 安装 → 新 NSIS 原路径覆盖 → 同 origin / 配对 / 网卡 / 快捷键 / 历史 / 已保存图文草稿保留 → 新图文轮次 / 分支 → 桌面缓存清理 → 应用完整退出重启并继续 mock → 卸载保留 userData / OS 密钥配置 → 重装继续 mock → 安装版本地导出 → 再安装旧版实际读回新增历史和新草稿。安装目录含中文、空格、点；共 5 次本地 mock 请求，无外部模型。实际卸载并清理本次拥有的安装注册与快捷方式，隔离数据和证据保留。

本机预检发现既有用户安装。正式身份脚本在任何安装动作前拒绝覆盖，因此没有启动 / 改写 / 卸载该安装。为继续可做的验收，将原旧安装器的完整 app payload 只读提取，与候选 payload 分别用 `--prepackaged` 构建；仅把 NSIS GUID / 快捷方式 / 安装缓存命名空间设为固定验收专用值，应用 `com.snapsolver.desktop`、exe、资源和旧 / 新运行层不改。每个变更与收尾检查既有客户端注册项、原快捷方式和正式安装缓存哈希不变。**这个结果不计正式生产 GUID 升级通过，M4.4 整卡仍部分通过。** 未覆盖真实用户数据路径，系统真实重启仍非本次测试。

通过证据 `.test-data/node-service-m4/install-s2Ee68/report.json` / `windows-isolated-second.log`；原旧安装器 SHA-256 `13bbf529f3f0bb34165aaab6b85934398477f91a3df0138607d9feaa7aec7d55`，保持未变。已安装验收专用旧 / 新 NSIS 分别为 `0ee29582219f03cb3c0b42630f115250a637ce34336885719b143e6c422d3e15` / `94d93efa2ff5193b2ecc26d4299d293f5198f4eed70f95cf0b01574e7ed3e605`，对应应用归档哈希在机器汇总中单列；后续参数兼容和进度样式修正的当前候选另做资源审计，不混算为同一次安装结果。全部候选仍含旧 Python / Open WebUI，未对外发布。

可复现命令（真实 Windows x64；输出父目录须已存在）：

```sh
npm run prepare:upgrade:win -- --old-installer "固定旧Setup.exe" --new-unpacked "已审计/win-unpacked" --output ".test-data/node-service-m4/新的安装器输出目录"
npm run test:upgrade:win -- --isolated-nsis --old-installer "输出目录/old/Scrylet-2.0.0-dev.6-win-x64-Setup.exe" --new-installer "输出目录/new/Scrylet-2.0.0-dev.6-win-x64-Setup.exe"
```

`prepare:upgrade:win` 只提取 / 构建，不安装或发布。没有 `--isolated-nsis` 的验收只能在没有既有产品安装的独立 Windows 环境执行。失败证据保留：早期名称匹配漏掉带版本的显示名，已扩展预检并拒绝；首次隔离安装因 PowerShell stdout 编码误判中文路径，修正为 UTF-8，随后仅经 GUID / 路径 / ASAR 三重确认卸载该测试副本，正式安装保持未变（`cleanup-encoding-failure.log`），完整重跑通过。下一项：在独立 Windows 环境用正式 GUID 验收，不能以当前机真实用户安装作试验。

## M4.5 Mac 两架构安装与 Keychain

关联 F01～F08、F19～F26、F34～F36。`test:mac-package` 增加 `--legacy-source`（仅 `.test-data` 内带合成标记的旧库），先前 app 独立数据加密探针、迁移后新数据、实际安装版导出与可选旧 app 读回接线。旧 / 新 app 的实际 CFBundleExecutable 分别读取，不假定旧品牌文件名。提供兼容固定旧运行层 app 时，脚本可检查同 origin 的新增历史和真实 composer 保存的图文草稿。没有旧 app / 旧库时仍列未验收，不以 Node 快照验证代替旧 app 读回。

```sh
npm run test:mac-package -- --arch arm64 --dmg "arm64.dmg" --zip "arm64.zip" --previous-app "兼容固定旧运行层.app" --legacy-source ".test-data/合成旧数据"
# 在 Intel Mac 上用 x64 与各自 x64 产物独立执行
```

**本环境没有 macOS，0/4 DMG / ZIP、0/2 架构安装 / Keychain / 旧 app 读回。** 新接线仅有语法 / 结构检查，非 Mac 拒绝执行；人工 Finder 拖拽、权限拒绝后授权、目标架构运行、签名 / 公证和实际扬声器均未通过。M4.5 整卡未完成，下一项必须是真实 arm64 / x64 Mac 与各自包体；Windows 压缩数字没有被写成 Mac 包体结果。

## 回归、截图与后续门槛

本轮源码 / strict / 契约检查、完整离线 **141/141**、后端源码 **34** / 独立测试 ASAR **33** 组、手机 Chromium / WebKit **50/50** 通过；M0/M2 原截图按字节恢复，新增渲染单独保留。迁移两引擎、手机测试 ASAR 和最终资源审计的准确结果见 机器汇总（本地：`artifacts/node-service-m4-check.json`），不把测试 ASAR 当发行安装包。首次后端回归因新图片 self-ID 映射加入 legacy_ids 后，旧测试误把所有映射当会话计数而失败；已分别断言 chat=1 / file=2，源码 / ASAR 完整重跑通过，没有删除兼容映射或弱化验证。

实际渲染：迁移进度（本地：`artifacts/node-service-m4-migration-webkit.png`）、升级手机页（本地：`artifacts/node-service-m4-upgraded-webkit.png`）、浏览器旧版回退（本地：`artifacts/node-service-m4-rollback-webkit.png`）、已安装桌面（本地：`artifacts/node-service-m4-installed-desktop.png`）、已安装手机（本地：`artifacts/node-service-m4-installed-phone.png`）、安装旧版读回（本地：`artifacts/node-service-m4-installed-rollback.png`）。桌面二维码、配对码与地址已遮盖；手机内容 / 图片均为合成数据。未提交数据库、真实密钥、配对 token 或本地设置。

下一项 **M4.4 正式 Windows 安装身份与 M4.5 Mac 两架构实机验收**。继续保留 M3 Mac 功能 / 权限、多屏 / 锁屏、物理手机、M0.2 重启首启 0/5 和 M5 最终包 / 默认切换门槛；当前不删除 Python / Open WebUI，不宣称整个重构完成。
