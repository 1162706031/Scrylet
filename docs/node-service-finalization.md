# M5 收尾与本地交付

2026-11-09，版本 `2.0.0-dev.7`。按本轮明确要求，沿用已测的 M0 保留矩阵，完成工程迁移收尾、删除旧运行依赖和本地打包；缩减重复测试，暂不进行 Mac 实机测试。**本轮工程清理与三项产物完成，完整跨平台发布验收仍未完成。** 没有安装覆盖已有客户端、推送代码或发布 GitHub Release。

## 产物

统一目录：`dist/releases/2.0.0-dev.7/`。每项附 `.sha256`，同时提供 `SHA256SUMS.txt` 和 `manifest.json`。

| 目标 | 文件 | 实际字节 | MiB |
| --- | --- | ---: | ---: |
| Windows x64 | `Scrylet-2.0.0-dev.7-win-x64-Setup.exe` | 125,867,931 | 120.037 |
| Mac arm64 | `Scrylet-2.0.0-dev.7-mac-arm64.zip` | 133,169,667 | 127.000 |
| Mac x64 | `Scrylet-2.0.0-dev.7-mac-x64.zip` | 136,908,724 | 130.566 |

Windows 解包总计 429,143,076 字节 / 83 文件，其中 Python 为 0 字节。三个包的服务、静态手机页、生产依赖、许可、私有数据排除审计通过；各 155 项项目文件与当前源码逐字节匹配。Windows observer 哈希 / 架构与测试驱动排除通过，Mac 检查了实际 Mach-O 架构、包内链接与执行权限。

Windows NSIS 使用正常应用身份 `com.snapsolver.desktop`，保留卸载时的数据；未执行本轮正式身份安装覆盖。Windows 包未签名。Mac ZIP 是 Linux 交叉构建，只通过结构审计，**没有在 Mac 上启动，签名、公证与安装权限未验证**。本环境没有 macOS / hdiutil，因此未生成 DMG；没有用改扩展名、模拟结果或 Windows 结果代替 DMG。

## 已完成的迁移清理

- `runtime.cjs` 仅允许 Node，删除旧 runtime / gateway / paths 加载器、Python 输入脚本、`runtime/`、根 Python requirements、Python 准备 / 旧运行层启动打包脚本。
- 删除旧聊天扩展及上游私有 EventTarget 桥，保留单一 React composer、共用朗读 / 音色模块、手机配对及模型设置。
- 从 manifest、lockfile 和已安装开发依赖中移除 `http-proxy` 及不再需要的关联包。Electron、SDK 和根 CommonJS 边界不变。
- 删除 `.runtime/` 开发虚拟环境。`build/python` 实为指向用户共享 uv Python 的 junction，因此只移除链接，没有删除共享解释器或之前的安装包。
- 继续保留旧库只读一致迁移、阶段恢复、浏览器图文草稿转换、旧附件 URL 映射、删除密钥状态、配对 / 网络设置及独立旧格式回退导出。
- 打包使用独立 staging；正常 Windows 包与隔离 NSIS 验收身份分开。Mac 原生 DMG / ZIP 命令继续保留，新增 Linux 显式 ZIP 构建和仅构建的 Mac 手动 CI。

原对照源码、固定依赖声明、全部原测试断言与历史通知保存在 [源码归档](archive/README.md)，不进入 app，也不作为当前运行依赖。之前的安装器及 `.test-data` 证据保留原字节。当前迁移夹具从脱敏的实际旧业务表格式重建，使用合成用户；不把它称为本轮实际旧应用启动读回。

## 本轮必要检查

| 检查 | 结果与范围 |
| --- | --- |
| `check` | JS 语法、模型目录、phone / contracts 严格类型通过 |
| `npm test` | 154 通过，0 失败、0 skip；本地 mock，无真实模型请求 |
| `test:migration` | 32 项通过：冻结旧格式只读导入、分支 / 图片 / 删除状态、六阶段实际进程退出恢复、OS 密钥、独立回退导出、目标与 Node 快照新进程解密 |
| 源码默认启动 | 重定向 appData 下自动发现并迁移，源库哈希不变，重启不重复导入 |
| Windows 最终解包应用 | 不设置运行层 override，实际使用最终 ASAR 完成上述自动迁移 / 完整退出 / 重启 |
| 打包 / 归档 | Windows 资源与 observer；Mac 两架构结构、ZIP CRC / 符号链接 / 执行权限；三个文件实际 SHA-256 |

最终解包应用实际渲染（本地：`artifacts/node-service-finalization-packaged.png`） · 机器汇总（本地：`artifacts/node-service-finalization-check.json`） · Windows 完整包体（本地：`artifacts/node-service-finalization-windows-package.json`）。原日志在忽略的 `.test-data/m5-final/`，导入与恢复使用独立合成数据。

没有重跑完整 M0、两引擎全量 UI、完整原生键鼠套件、实体手机、五次真实系统重启或 Mac 测试。现有 full-release evidence 检查继续阻断；用户调整测试范围不被写成所有平台门槛通过。历史 M0～M5 文档中的旧命令、旧体积和“暂不删除”描述属于前一轮记录，当前操作以本文为准。

## 失败记录与修复

初轮默认启动验收仅改 `APPDATA`，Electron 仍使用系统 Known Folder，**曾把应用启动到系统 userData 而非预期隔离目录**，因此不能声称本轮完全未触及系统数据目录。该轮已退出，没有删除或回滚系统目录内容。修复为主进程在任何发现 / 写入之前显式采用 Windows `APPDATA`；后续源码与最终解包应用均在合成 appData 中通过回归。失败原记录保留于 `.test-data/m5-final/default-migration.log` 及对应独立测试报告。

其他已纠正失败包括：旧单元请求缺少 Node 的 displayId；冻结夹具缺少回退导出使用的辅助表；已解码 JSON 被重复解析；同进程快速夹具尚未持久化 Windows 加密身份就导出。当前夹具先等待身份持久化，再按停止写者前提导出，目标和独立 Node 快照均经新进程验证。没有打印真实密钥，也没有请求外部模型。

## 后续原生 Mac 构建入口

在 Mac 分别运行 `npm run dist:mac:arm64`、`npm run dist:mac:x64` 生成 DMG + ZIP。也可在代码推送后手动触发 `.github/workflows/package-mac.yml`；工作流只构建、审计并上传 CI artifact，不运行 Mac 测试，也不自动发布 Release。本轮只新增工作流文件，没有触发远程运行。Developer ID 签名 / 公证仍需相应凭据。
