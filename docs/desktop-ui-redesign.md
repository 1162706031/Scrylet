# 桌面与模型配置界面统一

2026-11-09。沿用已完成的 phone 对话界面：暖白 `#fafaf7`、深墨 `#242d29`、松绿 `#2e6553`、细边框、统一线性图标与克制圆角。无新增依赖，未修改后端或 IPC。

## 布局

桌面左侧固定四个工作区入口：**连接概览 / 截图操作 / 网络设置 / 操作日志**。全屏截屏并发送、区域截屏及快捷键固定在侧栏，不必离开当前工作区。底部保留服务状态、屏幕权限检查和后台运行说明。

右侧每次显示一个工作区。连接页集中显示扫码和配对设备；截图页按键盘、鼠标、默认提示词分组；网络页保留手动地址、连接码和网卡选择；日志页优先显示操作记录与异常筛选，临时缓存放在日志下方。预览、暂停 / 恢复与退出仍固定可用。

切换仅使用原 DOM 节点的 `hidden` 状态，不重建表单、不重置未保存值；截图与默认提示词仍通过原接收器、单 Composer 与原 IPC 处理。没有添加截图声音、提示、焦点恢复或窗口弹出。

模型配置页统一配色、字号、服务列表、连接状态与表单。密钥和高级服务信息在可滚动内容区，保存 / 移除操作固定在表单底部；原 VisualViewport 适配保留。配对页、连接等待页和桌面迁移窗口同步使用相同色彩，避免跳转时出现旧蓝色主题。

## 文件

| 文件 | 修改 |
| --- | --- |
| `desktop/ui/index.html` | 侧栏导航、常用截图入口、独立工作区、日志优先布局 |
| `desktop/ui/style.css` | 桌面整体样式、响应式窗口布局、表单与日志 |
| `desktop/ui/app.js` | 仅追加工作区切换；原有 311 行呈现 / IPC / 截图 / 设置 / 日志代码逐字节保留 |
| `desktop/ui/migration.css` | 迁移窗口统一颜色与圆角 |
| `web/tokens.css` | 共享设计变量与 phone 对齐 |
| `web/pages.css` | 模型配置、配对和等待页样式；可滚动表单与固定操作区 |
| `web/models.html` | 模型配置页导航、表单内容 / 操作区结构 |
| `web/pair.html` / `web/unavailable.html` | 主题色、标志和页脚统一 |
| `scripts/desktop-ui-navigation.cjs` | 验收辅助导航；保留旧独立安装包的原折叠面板路径 |
| `scripts/smoke-desktop-input.cjs` / `smoke-silent.cjs` / `smoke-maintenance.cjs` / `smoke-network.cjs` | 更新导航入口，保留原验证断言与旧候选包兼容路径 |
| `scripts/test-desktop-ui.cjs` / `package.json` | 新增 `npm run test:desktop-ui`，真实 Electron / Node / IPC 隔离 UI 验收 |
| `tests/phone/provider-ui.spec.cjs` | 服务列表、密钥表单、短视口和保存返回的浏览器专项 |

`web/models.js` 与任务开始前逐字节一致：请求地址 / 参数、密钥不回显、空值保留、显式删除、超时恢复和返回原会话逻辑未改动。原桌面与模型表单的控件 ID 全部保留，无重复 ID。

## 实际验证

| 检查 | 结果 |
| --- | --- |
| `npm run check` | 通过，含 JS 语法、目录 / 产品开关、phone / contracts 严格类型检查 |
| `npm run build:phone` | 通过 |
| `npm run test:desktop-ui` | 通过：真实 Windows x64 Electron / Node 服务，原 IPC 设置持久化、键盘导航、跨页草稿保留、日志筛选、实际缓存清理且保留 localStorage / 设置、网络选项、暂停 / 恢复；780×700、860×740、1100×820 可达性 |
| `playwright test --config playwright.phone.config.cjs provider-ui.spec.cjs layout.spec.cjs design.spec.cjs` | Chromium / WebKit **14/14**，无跳过或重试；320/375/390/430px、短视口、VisualViewport 缩小 / 偏移、密钥空值保存与显式移除、返回原 URL / 草稿、原对话布局和流式阅读 |
| `node --test tests/ui-policy.test.cjs tests/maintenance.test.cjs` | **6/6**，静默桥与缓存 / 数据保留单元检查 |

桌面验证摘要：desktop-redesign-check.json（本地：`artifacts/desktop-redesign-check.json`）。原始日志在 `.test-data/desktop-ui-redesign/desktop-final.log`、`browser.log`、`final-check.log`。数据目录和服务均隔离，未访问真实用户数据库或使用真实模型密钥。

## 实际渲染截图

桌面为真实 Electron 页面。二维码、连接码与地址已遮盖。模型页为真实构建 + 隔离 Node 服务 + 本地模拟提供商，不代表真实提供商账号验证。

| 页面 | 截图 |
| --- | --- |
| 桌面连接概览 | 查看（本地：`artifacts/desktop-redesign-overview.png`） |
| 截图设置 | 查看（本地：`artifacts/desktop-redesign-capture.png`） |
| 操作日志 | 查看（本地：`artifacts/desktop-redesign-activity.png`） |
| 网络设置 | 查看（本地：`artifacts/desktop-redesign-network.png`） |
| 模型列表 | Chromium（本地：`artifacts/model-services-redesign-chromium.png`） / WebKit（本地：`artifacts/model-services-redesign-webkit.png`） |
| 模型表单 | Chromium（本地：`artifacts/model-credentials-redesign-chromium.png`） / WebKit（本地：`artifacts/model-credentials-redesign-webkit.png`） |
| 短视口固定操作区 | Chromium（本地：`artifacts/model-sheet-short-redesign-chromium.png`） / WebKit（本地：`artifacts/model-sheet-short-redesign-webkit.png`） |

本次未运行原生系统输入注入、实际屏幕捕获或最终安装包验收；这些能力的业务代码未变。尚未做物理手机软键盘、Mac 硬件和迁移窗口实际迁移流程的新增验收。Vite 既有体积、同步 quiet.js 和 SWR 指令提示仍保留。
