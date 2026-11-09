# 统一外观主题

2026-11-09。桌面工作台左侧新增“外观主题”，选择后自动保存，连接到同一台电脑的 phone 页面自动跟随，不重新加载对话。

| 主题 | 配色 |
| --- | --- |
| 松林暖白 `forest` | 暖白、深墨、松绿；默认主题 |
| 雾海浅蓝 `ocean` | 冷白、深蓝灰、海蓝 |
| 陶土暖杏 `clay` | 奶油白、暖棕、陶土 |
| 石墨夜色 `midnight` | 深灰、浅色文字、雾蓝 |

## 状态与边界

- 唯一权威选择保存在 Electron userData 的 `appearance.json`。`desktop/appearance.cjs` 用共享契约验证固定主题 ID，原子保存成功后才更新内存状态；重复选择不增加修订。默认选择不会改动旧配置 / 数据。损坏配置回退默认色且保留原字节，写入失败保留当前主题。
- 桌面通过已有发送方 / 页面检查保护的 `snap:appearance-save` IPC 写入，输入为 `appearanceChange`。浏览器不能修改电脑偏好。
- 新增 `GET /snap/appearance`，仅返回 `appearance`：`{ apiVersion: 1, themeId, revision }`。它是配色元数据，配对前与暂停页也能读取，不包含设备、连接码、密钥或聊天数据。沿用 Host / Origin 校验和 `no-store`；POST / PUT / PATCH / DELETE 均为 405。其他能力的配对与暂停检查保留。
- `web/appearance.js` 是所有产品页面共用的样式同步器。手机可见时约每 1.5 秒读取一次；重新聚焦 / 回到前台时立即检查。断连保留最后一次主题，恢复后跟随电脑；低修订旧响应被拒绝。
- 浏览器只缓存已知主题及修订，以便同源页面再次加载时先应用已有配色。缓存不参与服务端写入，也不会覆盖电脑权威选择。主题切换不修改模型、草稿、分支或 SDK 生命周期。
- `web/tokens.css` 集中管理四套语义变量。桌面、phone、配对 / 等待页、模型工作区、消息 / 代码 / 表格 / 弹窗共用变量；暗色原生表单使用 `color-scheme: dark`。二维码扫描区域保持白底，图片角标保持固定暗底 / 白字以保证可读性。
- 迁移进度窗口在显示前读取相同偏好并应用配色；未修改数据迁移算法。

## 文件

| 范围 | 文件 |
| --- | --- |
| 主题目录与独立偏好 | `config/appearance.json`、`desktop/appearance.cjs` |
| 边界与同步 | `contracts/public.cjs`、`contracts/index.d.ts`、`desktop/gateway.cjs`、`desktop/main.cjs`、`desktop/preload.cjs`、`web/appearance.js` |
| 工作台与共享样式 | `desktop/ui/index.html`、`desktop/ui/app.js`、`desktop/ui/style.css`、`web/tokens.css`、`web/pages.css` |
| 手机与其他页面 | `phone/index.html`、`phone/src/phone.css`、`phone/src/controls.css`、`web/pair.html`、`web/unavailable.html`、`desktop/migration-window.cjs`、`desktop/ui/migration.css` |
| 资源准备 | `scripts/node-package-stage.cjs`、`scripts/package-config.cjs`、`scripts/package-audit.cjs`、`scripts/service-test-asar.cjs` |
| 验证 | `tests/appearance.test.cjs`、`tests/gateway.test.cjs`、`tests/fixtures/contract-samples.cjs`、`scripts/test-appearance.cjs`、`package.json` |

没有新增依赖、第二个 composer 或 provider SDK。现有聊天 / 模型 API 的参数及 phone 状态契约未改动；模型管理继续位于桌面，未恢复已退役的手机模型配置入口。

## 实际验证

- `npm run test:contracts`：**45/45** 和契约严格类型检查通过，含新增快照与写入输入。
- `node --test tests/appearance.test.cjs tests/gateway.test.cjs`：**10/10**。覆盖非法字段 / 主题 / 修订，重启读取、原子写入失败、损坏配置保留，以及公开只读、暂停、跨站与原有配对保护。
- `npm run check`、`npm run build:phone`：通过。构建保留既有 quiet.js、体积与 SWR 指令提示。
- `npm run test:appearance`：真实 Windows x64 Electron / Node / IPC 和 Chromium / WebKit 两引擎通过。四套主题同步且计算后的调色一致；320/390/430px 无横向溢出；草稿 / 消息 / URL 保留；生成中切换不重发、不取消；配对与暂停页面跟随；配色请求失败后恢复；旧响应拒绝；手机刷新、桌面重启后保留；迁移进度窗口应用同一配色；780×700 桌面最小窗口的侧栏按钮可达。共 3 次模型请求，全部为回环模拟。
- 现有 chat / design / layout 浏览器回归：**14/14**，Chromium / WebKit，无跳过或重试。
- 独立 Node 打包 staging：新主题配置、模块、脚本与样式逐字节匹配；从 staging 实际加载偏好模块并保存 / 读取成功；Windows / Mac 打包文件列表包含主题配置。这是资源准备验证，未生成或执行最终安装器。

摘要：appearance-check.json（本地：`artifacts/appearance-check.json`）、appearance-stage-check.json（本地：`artifacts/appearance-stage-check.json`）。原日志位于 `.test-data/appearance/`；先前缺少移位夹具资源、CSS 颜色等价表示、最小窗口溢出的失败记录保留，修复原因后重验。真实手机、Mac 硬件、原生截屏与最终安装包没有新增验收。

## 实际渲染截图

使用隔离数据与回环模拟提供商。桌面 / 手机均为实际页面。

| 主题 | 桌面工作台 | 手机 Chromium | 手机 WebKit |
| --- | --- | --- | --- |
| 松林暖白 | 查看（本地：`artifacts/appearance-forest-desktop.png`） | 查看（本地：`artifacts/appearance-forest-phone-chromium.png`） | 查看（本地：`artifacts/appearance-forest-phone-webkit.png`） |
| 雾海浅蓝 | 查看（本地：`artifacts/appearance-ocean-desktop.png`） | 查看（本地：`artifacts/appearance-ocean-phone-chromium.png`） | 查看（本地：`artifacts/appearance-ocean-phone-webkit.png`） |
| 陶土暖杏 | 查看（本地：`artifacts/appearance-clay-desktop.png`） | 查看（本地：`artifacts/appearance-clay-phone-chromium.png`） | 查看（本地：`artifacts/appearance-clay-phone-webkit.png`） |
| 石墨夜色 | 查看（本地：`artifacts/appearance-midnight-desktop.png`） | 查看（本地：`artifacts/appearance-midnight-phone-chromium.png`） | 查看（本地：`artifacts/appearance-midnight-phone-webkit.png`） |

暗色其他页面：配对（本地：`artifacts/appearance-midnight-pair.png`）、桌面模型工作区（本地：`artifacts/appearance-midnight-models.png`）。
