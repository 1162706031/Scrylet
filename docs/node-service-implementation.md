# Scrylet 轻量 Node 服务：逐文件实施与 agent 交接手册

> 2026-11-09 本轮收尾：用户确认 M0 保留矩阵已测，明确授权移除旧依赖，并暂缓 Mac 实机测试、缩减重复测试。当前源码仅支持 Node，旧源码和原断言归档，正常 Windows 安装入口与 Mac 两架构 ZIP 构建已接通。实际产物、检查结果和边界以 [M5 收尾记录](node-service-finalization.md) 为准；下文保留此前分轮证据，不将未测门槛改为通过。

更新：2026-11-09，含 Node 默认启动、自动旧库迁移、M3 原生输入与 macOS 构建 / 审计实施记录。对应 [重构方案](node-service-refactor.md)，基线 `2.0.0-dev.6`。

**状态：M0～M3 已按各自范围实施；M4.1～M4.3 在 Windows x64 完成迁移、两引擎浏览器升级与新增数据后旧版实际读回。M4.4 隔离 NSIS 安装闭环通过，但正式生产 GUID 覆盖升级未验收；M4.5 缺真实 Mac，两架构 DMG / ZIP / Keychain 仍未通过。M5 已开始：Windows Node-only 候选与源码 `npm start` 均默认 Node，已有旧库自动只读导入独立 `Scrylet` 目录；显式旧版对照及 Python / Open WebUI 资源保留。逐卡结果见 [M4](node-service-m4.md) 和 [M5](node-service-m5.md)；本轮默认启动 / 迁移回归及剩余正式身份、Mac 实机、实体设备、五次真实重启首启不能省略。**

## 0. 新 agent 的第一步

### 0.1 按这个顺序读取

1. 用户本次指令和根 [AGENTS.md](../AGENTS.md)，确认任务是补文档、开始实施还是继续某个阶段。本文不自行覆盖仓库规则；收到开始重构的实施指令后，同步修订需要替换的旧架构条款，不把仍需固定复用上游的规则与替换实现同时留成有效约束。保留安全、数据和验证要求。
2. [重构方案](node-service-refactor.md) 第 1、3、7、9、10 节：语言边界、F01～F36 功能、迁移、实施顺序与验收门槛。
3. 本手册第 1～4 节：语言与模块边界、逐文件改动、Runtime 和子进程协议。
4. 本手册第 5～10 节：数据、HTTP / 流、前端、原生程序、迁移和任务顺序。
5. [当前规格](../spec.md)、[当前架构](architecture.md)、[验收记录](verification.md) 最新记录，再按当前任务阅读对应源码和测试。历史记录中的通过结果不能直接算作新版通过。
6. 开始前执行 `git status --short`、读取 `package.json` 和相关目录下新增的 `AGENTS.md`。保留用户工作区改动，尤其已有截图、未跟踪文档和验收产物；不运行清理整个仓库或恢复用户修改的命令。

首次进入实施，下一项是 **M0.1 冻结实际基线**，不是删除 Python、改造整个 UI 或升级所有依赖。续接工作先读第 12 节和当前提交 / 工作区，更新真实进度后继续第一个未完成任务。

### 0.2 已确定与必须验证的事项

| 已确定，不需要新 agent 重新选架构 | M0 必须用代码和隔离夹具确定 |
| --- | --- |
| 保留 Electron、Express、配对、网卡与现有桌面功能 | 实际固定 Electron 内置 Node、`utilityProcess`、SQLite 与 SDK 的兼容版本 |
| 新聊天服务 CommonJS，新手机前端严格 TS，原生监听 Rust | SDK 两条协议和现有自定义地址的行为，不按厂商名字猜接口 |
| 最终无 Python / Open WebUI 运行依赖；不引入另一份 Node | 当前可达聊天入口、旧库结构、浏览器草稿格式和全部附件引用形态 |
| Windows x64 NSIS 与 Mac arm64 / x64 的 DMG、ZIP 都是交付目标 | Mac 最低系统版本、目标依赖、实际安装 / 升级结果和签名 / 公证状态 |
| 历史、分支、附件、密钥、配对、已保存草稿必须保留 | 一致快照、数据比对、新版新增消息后的反向迁移方法 |
| 不确定的提交不自动重放；暂停访问与停止回答分离 | 新前端 transport 如何接入固定 AI SDK 版本的状态和流接口 |
| 截图强制静默，手机朗读 / 试听仍保留 | Windows 原生监听依赖与安装环境；Mac 各架构真实支持状态 |

对右列事项，输出可复现的结论与夹具，不凭记忆补一个“应当可用”的实现。可通过现有代码、官方资料和隔离实验解决的技术细节，由实施者推进，不将常规技术选择变成反复询问用户。

## 1. 语言、构建与职责固定下来

### 1.1 不做全仓 TypeScript 迁移

| 路径 | 语言与模块 | 具体要求 |
| --- | --- | --- |
| `desktop/**/*.cjs` | JavaScript / CommonJS | 保留文件名和模块风格；只修改生命周期、服务接线和原生资源定位等必要部分 |
| `desktop/ui/*` | 现有 HTML / CSS / 浏览器 JS | 保留连接窗口及窄 IPC，不为统一语言重写为 React |
| `service/**/*.cjs` | 新增 CommonJS | 公共入口使用 JSDoc 与共享类型；模型 SDK 如为 ESM，通过受控动态 `import()` 加载 |
| `phone/src/**/*.ts(x)` | TypeScript / React | 开启 `strict`，类型检查单独执行；Vite 构建本地静态资源 |
| `contracts/index.d.ts` | 新增共享类型声明 | 服务 JSDoc 与前端共用；声明不包含运行时逻辑 |
| `contracts/validate.cjs` | 新增运行时校验 | 检查 HTTP、IPC、磁盘 JSON 和原生事件；不能只用 `as SomeType` 信任外部数据 |
| 现有 `web/*.js`、测试和脚本 | 保留现有语言 | 复用纯逻辑或逐项替换 UI 绑定；不批量转换 TS、不全局打开旧文件的严格类型检查 |
| `native/input-observer/` | Rust | 只输出平台鼠标事件；手势计时仍由 JS 实现 |

根 `package.json` 不新增全局 `"type": "module"`。不要让既有 `require()`、测试入口和 Electron preload 因语言迁移失效。新前端使用独立 `phone/tsconfig.json` 和已创建的 `phone/vite.config.mts`（构建配置的显式 ESM 边界）；构建到 `build/phone/`，不是把源码目录当作可运行网页。M0.3 的 `phone/src/compatibility.tsx` 仅为实验入口，未接入默认网关，M2 仍要完成真实产品页。

为复用的 JS 导出补足必要的 JSDoc / 类型声明，不靠大面积 `any`、`@ts-ignore` 或关闭新前端 `strict` 绕过类型错误。TS 编译器只用于构建，不进入最终运行依赖。

### 1.2 模块拥有权

- Electron 主进程：窗口 / 托盘、原生截图、热键、鼠标事件接入、设备配对、网络、日志、缓存与服务生命周期。
- Express 网关：手机同源入口、授权、暂停 / 撤销、截图信箱、静态资源、白名单 API 转发和流连接跟踪。
- Node 服务：SQLite、会话与分支、附件、提供商配置、模型调用、生成任务、迁移。不得执行 Electron 屏幕 API。
- React 手机页：一份 composer 和 SDK 聊天状态；截图、选图、文字、撤销和电脑指令进入同一输入路径。持久化副本不能成为另一套可独立编辑的草稿。
- 原生监听：按钮 / 坐标与生命周期。不得保存截图、持有 API Key、决定模型、执行长按自动发送或提供通用系统命令接口。

## 2. 逐文件改动清单

表中“保留”不是禁止必要修复，而是禁止为统一技术栈整块重写或删减功能。文件中的函数名比行号稳定；若基线变化，先重新定位调用点再修改。

### 2.1 桌面与网关

| 当前文件 / 调用点 | 要怎么改 | 不得破坏 / 完成条件 |
| --- | --- | --- |
| `desktop/main.cjs` 的 `start()`、`before-quit` | 继续创建 `Runtime`，由门面选择 legacy / node；传入进程创建与窄密钥能力；订阅初始化阶段；退出顺序改为拒绝新任务、停止运行层、关闭网关和原生程序 | 保留单实例锁、userData 选择、所有现有 IPC、窗口沙箱、强制静音、托盘和关窗行为 |
| `desktop/runtime.cjs` 的 `Runtime` | 稳定门面；旧实现位于 `desktop/legacy-runtime.cjs`，新实现位于 `desktop/node-runtime.cjs`；源码与 Node-only 候选默认 Node，显式旧版对照包标记 legacy | 保留消费者需要的 `ready/error/url`、`start/stop/providers/saveProvider`；不要在其他模块复制一套生成状态 |
| 旧 `Runtime.request()` | legacy 模式继续调用上游；node 模式只调用新内部契约 | 同步迁移网关及测试的旧 URL，不实现一个假的完整 Open WebUI API 服务 |
| 旧 `applyProductScope()`、`applyUiPolicy()`、`initializeWorkspace()`、`seedConnections()` | legacy 原样保留；node 模式改为本机产品策略、一次性种子迁移与用户配置读取 | 删除旧 HTTP 初始化链前确认静默、旧设置、提示词和已删除密钥语义都有替代 |
| `desktop/runtime-paths.cjs` 的 `runtimePaths()` | 引入 `nodeServiceEntry/phoneDirectory/observer` 等明确字段；legacy 字段到 M5 再删 | 从 `app.getAppPath()` / `process.resourcesPath` 定位，不依赖 cwd、系统 Python 或 ASAR 中的原生可执行文件 |
| `desktop/gateway.cjs` 构造函数与 `proxyRes` | 分离 legacy 上游 HTML 注入与 node 静态页面 / API 白名单；node 模式不拼接上游 HTML；复用可流式转发能力 | 不把整个未知路径代理到模型或内部服务，不缓存 / 拼接完整 SSE，不转发客户端伪造的内部鉴权头 |
| 网关 `/snap/api/available-models` | 将 `runtime.request('/api/models')` 改为 `runtime.availableModels()` | 返回的 `{available}` 和失败状态与原页面兼容；不为查询可用性调用真实模型 |
| 网关 `state()` | 继续返回网络、二维码、设备、权限、暂停和截图状态；运行层名来自实际 engine | 不再对 node 模式固定写 `Open WebUI 0.12.2`；二维码与地址保持同一快照 |
| 网关 `pause/revoke/close`、连接跟踪 | 保留销毁手机连接与信箱失效；覆盖新 SSE 连接；停止内部转发订阅而非停止服务端生成 | 已撤销连接立即失效，暂停不自动取消已接受生成，恢复不重提问 |
| `desktop/capture-controls.cjs` | 继续使用 `runtime.ready/error` 和同一 `CaptureDelivery`；原生监听替换后保留 `pointer()` 的坐标转换 | 保留设置回滚、前台窗口避让、取消计时和拒绝草稿 / 生成中自动发送 |
| `desktop/mouse-input.cjs` 的 `start/stop` | 从 Python spawn 改为直接启动目标平台监听程序，解析 / 校验版本化 JSON Lines，握手与退出有明确超时 | 保留 `new MouseInput(onEvent,onError)` 的调用方式；stdin 关闭与强制终止兜底有效 |
| `desktop/pairing.cjs`、`native.cjs`、`region-gesture.cjs`、`capture-settings.cjs`、`capture-delivery.cjs` | 尽量原样复用，只在接口边界加必要版本 / 校验 | 不改 token、时长、按钮、坐标、单接收页和不重放语义来适应新框架 |
| `desktop/preload.cjs`、`desktop/ui/*` | 保留 IPC 名称和主界面；只调整实际运行层标签、迁移状态与必要错误 | 手机页面不能调用 preload；不开放任意 URL、文件路径、shell 或通用 RPC |
| `desktop/activity-log.cjs`、`maintenance.cjs`、`silent-audio.cjs`、`brand.cjs` | 复用；为启动计时增加独立脱敏度量文件或严格限定的新字段 | 不绕过日志白名单；缓存清理不删新库、附件、配对或迁移快照；安装身份不变 |
| `desktop/product-scope.cjs`、`config/product-scope.json` | legacy 保留旧上游策略；node 明确定义自身允许的页面 / API / UI 能力 | 不仅隐藏按钮却开放旧管理 / 工具执行写入；不把旧开关误解释为新增能力授权 |

### 2.2 新增 Node 服务文件

| 待新增文件 | 导出 / 职责 | 最低独立验证 |
| --- | --- | --- |
| `service/main.cjs` | 解析主进程启动消息；组装存储和路由；发出 ready / failed / stopped；响应 shutdown | 就绪前拒绝业务；失去父通道退出；错误不输出秘密 |
| `service/http.cjs` | 内部 HTTP 路由、随机凭证验证、请求限制和错误映射 | 未授权 loopback 请求拒绝；SSE 不受普通短请求超时影响 |
| `service/storage.cjs` | 打开 / 关闭 DB、事务、备份、schema 版本；选择驱动的唯一入口 | 同一数据目录单写者；事务失败可回滚；安装版驱动可加载 |
| `service/chats.cjs` | 会话 CRUD、消息关系图、当前分支、分页与乐观版本控制 | 编辑 / 重答不删除旧分支；构造上下文不混入兄弟分支 |
| `service/generations.cjs` | 唯一提交、提供商调用、状态 / 序号、订阅、显式停止、重启后的中断状态 | 重复请求只有一次模型调用；断订阅不停生成；显式 stop 真正关闭上游 |
| `service/providers.cjs` | 目录与保存设置合并、串行更新、按需加载 SDK、构造正确协议适配器 | 未配置不调用；空值保留 / 删除不复活；关闭可能重复提交的自动重试 |
| `service/files.cjs` | 附件写入、校验、受控读取、哈希、引用与保留 | 路径越界 / MIME 欺骗拒绝；历史引用和草稿引用仍有效 |
| `service/prompts.cjs` | 种子、只读旧提示词导入、快捷命令与用户内容 | `/snap-…` 唯一且可用，重复初始化不覆盖修改 |
| `service/migrations/schema/` | 新库逐版本迁移 | 每个版本有校验值；失败不推进版本号 |
| `service/migrations/open-webui.cjs` | 旧结构识别、ID / 分支 / 文件 / 配置导入 | 只读源快照，重复导入无重复 / 丢失 |
| `service/migrations/rollback.cjs` | 新增数据转回旧版可读的独立副本 | 新旧格式 round-trip，保留新增图片与分支，未知记录不静默忽略 |
| `contracts/index.d.ts`、`contracts/validate.cjs` | 第 3～6 节的类型与运行时校验 | 协议版本、不认识的枚举、错误字段与边界值测试 |

`service/providers.cjs` 是 SDK 适配和产品配置的边界，不写成另一个通用厂商 SDK。不要同时装多套框架实现相同能力；本方案选 AI SDK，LangChain 不作为当前重构依赖。

### 2.3 手机前端与旧浏览器模块

| 当前 / 待新增位置 | 具体动作 |
| --- | --- |
| `phone/src/main.tsx`、`App.tsx` | 路由 `/` 和 `/c/:id`、初始配对 / 状态读取、会话恢复；进入聊天前执行草稿迁移；不从 URL 接收模型密钥 |
| `phone/src/chat/useComposer.ts` | 拥有当前文字、附件顺序、处理数、对话 epoch、草稿版本；公开 append / remove / undo / submit / readiness；只有它能提交当前草稿 |
| `phone/src/chat/useConversation.ts`、`transport.ts` | 接 SDK 聊天状态、消息 / 分支快照、已有生成的 SSE 和明确 stop；不靠扫描发送按钮猜生成状态 |
| `phone/src/chat/MessageList.tsx`、`ConversationView.tsx`、`HistoryPanel.tsx` | 显示与操作 F19～F23，遵循 M0 冻结的全部可达入口；按角色 / 标签定位测试，不复制上游所有菜单 |
| `phone/src/capture/desktopReceiver.ts` | 替换 `web/desktop-capture.js` 的 DOM 注入，保留 poll / validate / ack、clientId、epoch、前台与 modal 检查；调用同一个 composer 提交 |
| `phone/src/attachments/` | 替换 `web/attachments.js` 对上游 DOM 的操作；保留 12 张、顺序、预览、缩放、删除 / 清空、10 秒撤销和超限整批拒绝 |
| `phone/src/attachments/Capture.tsx`、`images.ts` | 移植 `web/extension.js` 的截图 / 框选逻辑，复用 Cropper.js，保留显示器和同尺寸框选记忆 |
| `phone/src/audio/` | 用 React 控制朗读 / 声音面板，复用 `web/read-aloud.js`、`web/voice-settings.js` 中纯函数；只接新版开始 / 完成事件，不构建第二个消息队列 |
| `web/quiet.js` | 新页面仍在业务脚本之前加载静默桥；移除 node 页面中不必要的上游私有 EventTarget 劫持，legacy 模式保留；手机专用语音能力与媒体 / 通知 / 振动保护不放宽 |
| `web/read-aloud.js`、`web/voice-settings.js` | 可提取纯函数到共享浏览器模块并保留旧导出，供新旧页面对照；不同时实例化旧 DOM 控件和新 React 控件 |
| `web/pair.*`、`web/models.*`、`web/unavailable.*`、`web/pages.css` | 原样保留优先，只调整必要的状态 / 版本契约；无需为了 React 重写已独立工作的配对和模型页 |
| `web/layout.js`、`web/mobile.css`、`web/scope.js` | 实际产品布局 / VisualViewport 由 `phone/src/chat/ConversationView.tsx`、`dialogs.ts`、`phone.css` / `controls.css` 接手；旧模块保留给 legacy，不以旧 DOM 选择器控制新 UI |
| `web/tokens.css`、`web/brand/*` | 复用颜色、字体、图标与品牌；不下载外部字体或 CDN 资源 |
| 旧 `web/composer.js`、`extension.js`、`attachments.js`、`desktop-capture.js` | M2～M4 保留供 legacy 对照；M5 确认全部替代与许可后才从新入口和发行资源中退出 |

具体组件可在不改变拥有权的前提下拆分；不要把表中名称当作必须制造空文件的清单。实际新增 / 合并文件要更新本表，保证后续 agent 能找到真实实现。

### 2.4 构建、测试及清理

| 文件 | 要改什么 / 什么时候改 |
| --- | --- |
| `package.json`、`package-lock.json` | M0 / M1 固定新依赖；M2 增加前端 build / typecheck；M3 增加 native build；M4 增加 migration 检查；M5 才替换默认 setup / dist 流程 |
| `scripts/setup.cjs`、`scripts/prepare-runtime.cjs` | 旧流程保留到 M5；最终 setup 只准备 / 验证前端和原生资源，不创建虚拟环境，不运行 pip；原 Python runtime 准备脚本停止使用 |
| `scripts/check.cjs` | 加入 `service`、`contracts` 的语法 / 契约及前端类型检查；legacy 上游开关检查在旧版对照结束后移除，保留目录与产品范围验证 |
| `electron-builder.cjs` | 在现有 files 中加入服务与运行时校验，将 `build/phone` 映射到 ASAR 的 `phone-dist`；增加 mac 的 DMG / ZIP、ICNS 与产物命名，按平台选目标 observer。M5 删除四项 Python 资源，不打包测试 input-driver |
| 待新增 `scripts/dist-mac.cjs` | Mac 本机架构 / 资源检查、前端构建与目标资源准备、调用 electron-builder、产物审计；不调用 Windows `prepare:runtime`，详见第 11.4 节 |
| `scripts/generate-icons.cjs`、待新增 `packaging/icon.icns` | 从现有品牌 SVG 生成 Mac 多尺寸图标与 ICNS；保留已有 ICO、PNG 与模板托盘图标 |
| 待新增 `scripts/smoke-mac-package.cjs` | 实际 DMG / ZIP 安装、启动 / 权限 / 退出 / 升级 / 数据保留，分架构记录；不得用 Windows 原生结果代替 |
| `scripts/audit-package.cjs` | 移除“必须有 Python”断言前先加入新版服务、前端入口、生产依赖、原生程序、许可和“不得有旧运行时”的断言 |
| `tests/fixture.cjs` | 拆出本地 mock provider，分别支持 legacy / node 夹具；不要为启动模拟提供商再顺带启动一次不需要的 Open WebUI |
| `tests/ui/*.spec.cjs` | 保留业务断言，更新上游 DOM / API 专有绑定；旧偏好注入与协议测试改用新版隔离夹具，不直接删专项 |
| `scripts/smoke-desktop*.cjs`、`smoke-silent.cjs`、`smoke-maintenance.cjs`、`smoke-network.cjs` | 真实 Electron / 实际 LAN 流程保持；移除 fixture 和原生输入的隐性 Python 依赖，增加新服务退出、存储和资源定位检查 |
| `tests/windows-input.py` | 当前 `smoke-desktop-input.cjs` 直接用 `.runtime/Scripts/python.exe` 启动它；改为单独的测试用原生 input-driver 后，M5 才移除 Python 测试驱动 |
| `runtime/`、`requirements.txt`、`desktop/mouse-input.py`、`http-proxy` 依赖 | M5 按实际引用逐项清理；http-proxy 若仍承担安全流式转发就保留，不能仅因删除上游就删依赖 |
| `README.md`、`spec.md`、`docs/architecture.md`、`docs/beginner-tutorial.md`、`THIRD_PARTY_NOTICES.md` | 随实际切换同步，保留尚未验证的平台 / 真机范围；本方案不自动代表新版本已发布 |

## 3. Runtime 门面与主进程协议

### 3.1 稳定 Runtime 形状

以下公共契约已在 M0.5 的 `contracts/index.d.ts` 固定初稿，M1 已接线隔离消费者和后端；正式默认切换仍受迁移 / 回退 / 最终包门槛约束，优先只依赖这些属性和方法：

```ts
interface RuntimePort {
  kind: 'legacy' | 'node';
  ready: boolean;
  error: string | null;          // 面向用户的脱敏信息
  url: string | null;            // 内部 loopback，不下发给手机；未启动可为空
  start(): Promise<void>;
  stop(): Promise<void>;
  providers(): Promise<ProviderCatalogView>; // 无密钥原值
  saveProvider(id: string, value: ProviderChange): Promise<{ success: true }>;
  availableModels(): Promise<boolean>;
  request(path: string, options?: InternalRequest): Promise<unknown>;
}
```

`request()` 处理内部 JSON 操作，不缓冲 SSE / 二进制响应。网关通过内部 URL 和受控凭证进行流转发；外部请求不能决定内部 Authorization 或设备身份。

过渡期调用点必须一起迁移：

- `gateway.cjs` 的 `/api/models`、上游代理、WebSocket upgrade 和 `harness` 标签。
- `tests/ui-policy.test.cjs` 对 `applyUiPolicy()` 的覆写：保留 legacy 测试，新版新增本机策略断言，不能只删旧测试。
- `tests/ui/desktop-capture.spec.cjs` 与 `completion-sound.spec.cjs` 的上游设置读写：改用脱敏夹具或受限测试注入设置旧偏好。
- `tests/ui/mobile.spec.cjs` 中的上游 configs / prompts / models / completions 调用：分别改为新产品 API、提示词服务和真实 SDK + mock 协议测试。

测试注入仅存在于隔离测试入口 / 依赖注入对象，不开放一个生产 HTTP 的“任意写配置”后门。

### 3.2 子进程消息与就绪条件

所有消息带 `protocolVersion: 1`，收到不支持的版本报明确错误，不尝试猜字段。进程级随机凭证只走父子通道，不放 CLI 参数、页面、状态响应或日志。

| 方向 | 消息 | 内容 / 行为 |
| --- | --- | --- |
| 主 → 服务 | `initialize` | 数据目录、legacy 只读来源、产品 / 目录版本、内部随机凭证和隔离测试能力 |
| 服务 → 主 | `phase` | `opening-storage` / `migrating` / `starting-http`，以及无正文的进度计数 |
| 服务 → 主 | `ready` | 实际 loopback 端口、schemaVersion、apiVersion；DB / 迁移 / 内部鉴权已经可用 |
| 服务 → 主 | `failed` | 固定错误码与脱敏说明，主进程设 `ready=false`；不能回传完整提供商错误体 |
| 服务 ↔ 主 | `secret-request` / `secret-response` | 以 requestId 关联一次窄密钥操作，不允许任意文件读取、SQL 或动态方法调用 |
| 主 → 服务 | `shutdown` | 拒绝新任务，取消上游，刷新必要内容，关闭 DB / HTTP 后返回 `stopped` |

初始化、关闭都要有有界超时和强制退出兜底；用可控制时钟 / fake child 检查时序，不靠长 sleep。父通道断开、父进程消失或初始化失败不得留下独立运行的服务。不得在 crash 后自动重发之前生成任务。

M0.3 已验证源码与仓库外 ASAR 的 initialize / ready / stopped / exit 和父进程单独被杀。parentPort 的公开契约不提供可依赖的 close 事件；实验用显式父 PID 轮询。M0.5 已另行固定正式消息的共享声明与校验初稿，M1.1 已接线正式协议，nonce 心跳 / 失联、模拟时钟超时、stale nonce 和实际只杀父进程退出分别验证；没有把 PID 复用模拟检查写成真实 OS PID 复用验收。

开发 / 对照可新增 `SNAP_RUNTIME_ENGINE=legacy|node`，但只在显式隔离 `SNAP_DATA_DIR` 下启用。正式切换由已验证的迁移标记决定；M5 之后不存在旧运行时，不静默回退到系统 Python。

## 4. 共享数据与运行时校验

M0.5 已建立 `contracts/index.d.ts`、`validate.cjs`、`validate.d.cts`、`http-v1.json` 与严格声明 / 运行时样本检查，见 [契约记录](node-service-contracts.md)。它们在 M1 已接线隔离 Node HTTP / 进程 / 持久化边界；生产默认仍为 legacy，手机页与迁移 / 回退接线继续按 M2 / M4 实施。

公共类型至少覆盖：状态、公开模型目录、提供商修改、消息部分、会话 / 分支、附件、草稿、生成快照、流事件、桌面指令和原生输入。对外字段固定一种命名风格，旧 `/snap` 字段保持兼容；JSON 时间戳统一约定为毫秒，旧库迁移识别原单位，不能直接混用。

```ts
type GenerationStatus =
  | 'accepted' | 'requesting' | 'streaming'
  | 'completed' | 'stopped' | 'failed' | 'interrupted';

type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; fileId: string }
  | { type: 'reasoning'; text: string }; // 仅保存服务实际返回且可展示的内容

interface SubmitMessage {
  apiVersion: 1;
  requestId: string;
  chatVersion: number;
  parentMessageId: string | null;
  modelId: string;                // 保留现有 厂商.型号 内部 ID
  parts: Extract<MessagePart, { type: 'text' | 'image' }>[];
  origin: 'manual' | 'desktop';
  command?: { id: string; clientId: string; context: string };
}
```

SDK 所需的协议输出项不强行塞入这个最小展示联合类型。服务端单独保存可回放的提供商输出 / metadata 和兼容原始载荷，以保留后续多轮所需内容；不要擅自丢弃不认识的非展示字段。迁移中的未知字段只保存在本机兼容载荷，不直接作为可执行或可信参数使用。

校验分别在网关、服务、磁盘恢复和原生边界执行：schema 版本、长度 / 数量 / MIME、枚举、ID、关系归属和状态转换都需要检查。`deviceId` 由网关配对结果提供，不能信任浏览器传来的身份。客户端可见错误沿用 `error` 字符串，并新增稳定 `code`；不把任意堆栈或请求体变成错误说明。

## 5. SQLite 与附件设计

### 5.1 新库最小结构

目标目录为原 userData 下的 `chat-node/v1/`；数据库 `chat.sqlite`，附件 `files/`，受控迁移暂存 `migration/`。这些路径是设计约定，落地后写入版本化 manifest，不能在不同模块各拼一套路径。

| 表 / 记录 | 至少保存的字段与约束 |
| --- | --- |
| `schema_migrations` | version 主键、脚本校验值、应用时间；事务完成后才记录 |
| `chats` | id、legacyId、标题、createdAt / updatedAt、currentMessageId、version、模型 / 元数据与原始兼容字段；legacy 映射唯一 |
| `messages` | 以 `(chatId,id)` 唯一；parentMessageId、role、modelId、parts、状态、顺序 / 时间、协议输出和兼容原文；父消息必须属于同一会话 |
| `files` | id、受控相对路径、sha256、MIME、大小、宽高、原始文件名、时间和 legacy 引用；原始文件名不能决定磁盘路径 |
| `message_files` | chatId、messageId、ordinal、fileId；按 ordinal 恢复次序，拒绝缺失引用 |
| `draft_snapshots` | browserClientId、chatKey、revision、文本 / 图引用 / 模型和保存时间；只是 composer 的持久化快照，不独立自动提交 |
| `provider_connections` | providerId、baseUrl、apiType、启用 / 删除状态、加密密钥引用、用户参数、版本；删除状态不能被种子覆盖 |
| `prompts` | 稳定 id、唯一 command、名称、内容、元数据、是否已导入与用户修改状态 |
| `generations` | id、chatId、parent / user / assistant 消息 ID、modelId、deviceId、requestId、commandId、请求指纹、状态、lastSeq、时间和固定错误码 |
| `migration_runs` / `legacy_ids` | 来源 schema / manifest 指纹、阶段 / 计数 / 校验结果、旧新 ID 映射；不包含明文密钥或正文 |

必须建立 `(deviceId,requestId)` 唯一约束；非空 `commandId` 也必须唯一，避免同一电脑指令因页面刷新生成第二次请求。重复 requestId 的内容指纹不同返回 409，不把它解释成新消息。

同一会话只允许一个活动生成。使用数据库事务与约束实现，不只检查某个浏览器的“正在生成”按钮；模型请求发出前保存接受记录。乐观 `chatVersion` 冲突返回 409 并保留草稿，不暗中用新分支重发。

### 5.2 分支、文件与故障规则

- 编辑用户消息或重新生成回答时新增分支节点，保留原节点和兄弟分支；`currentMessageId` 指向所选分支。向模型发送从当前节点到根的有效祖先链，包含历史图像，不能把所有消息平铺。
- 删除、重命名、置顶、搜索等能力以 M0 的实际可达入口为基线；对应持久化字段与索引一并支持，不只实现 UI 按钮。
- 文件先写受控临时路径，校验后重命名，再事务关联；失败留下可识别的暂存数据，不能提交一个没有图片字节的消息。保留草稿、历史和迁移引用，缓存清理不承担业务附件垃圾回收。
- 文件归属是本机共享账户 / 会话，不按配对手机隔离；各手机仍能看同一历史。浏览器草稿按当前浏览器保存，不让另一台手机的输入覆盖它。
- 生成 token 分批持久化，完成 / 停止 / 失败时刷新；异常退出后保留最后可靠内容并标记 interrupted，不伪装完成、不自动重启提供商调用。
- 不记录秘密或完整载荷到 operation log；只在受保护的业务存储保存业务数据。查询使用参数绑定，schema 变更与版本推进在同一事务。

SQLite 驱动、备份方法、外键 / 事务模式与读写锁策略由 M0 实验证实后固定在 `storage.cjs`。不要只验证开发 Node 下能 import 就认为 Electron 安装版也能加载。

M0.1 已补充登记 F21 的置顶 / 归档、未读 / 全部已读、克隆、JSON / TXT / PDF 下载、消息删除，以及编辑中的保存 / 取消 / 发送和重答菜单。上表是最小结构，不能据此遗漏这些操作；相关状态、关系与导出兼容载荷在 M0.4 / M0.5 固定后纳入 M1.2 和 M2。消息删除不能以仅删除整段会话替代，尚未验证的操作语义保持未验证。

## 6. HTTP、生成订阅与 SDK transport

### 6.1 端点和状态

所有新聊天端点需要配对；写操作继续校验 `X-Snap-Client: mobile` 和同源。网关只将验证后的设备身份与内部凭证转发给服务，剥离浏览器伪造的内部头。现有配对 / 设置端点保留原字段与限流，不在本次顺带改返回格式。

| 方法 / 路径 | 输入 / 输出要点 |
| --- | --- |
| `GET /snap/api/status` | 保留 ready、paused、permission、displays、error、maxImages；增加 apiVersion、frontendBuild、runtimeKind 和迁移阶段，均无秘密 |
| `GET /snap/api/chats` | 分页会话列表；M0 确认可达的搜索 / 过滤通过显式参数实现 |
| `GET /snap/api/models` | 当前可选模型的内部 ID、显示名、图像能力和保存连接状态；不调用提供商，不包含密钥 |
| `POST /snap/api/chats` | 显式建会话，返回 id / version；空稿是否持久建会话要与 M0 基线一致，不能导致历史充满空会话 |
| `GET /snap/api/chats/:id` | 当前分支、消息图 / 按需分支、模型与活动生成快照；旧 URL ID 能映射 |
| `PATCH /snap/api/chats/:id` | 带 version 更新标题 / 所选分支等已确认能力；冲突不覆盖 |
| `DELETE /snap/api/chats/:id` | 按原可用行为执行；活动生成如何处理在 M0 固定并测试，不静默丢任务 |
| `POST /snap/api/chats/:id/messages` | `SubmitMessage`；成功 202 返回 chatId、generationId、user / assistantMessageId、status、deduplicated 和新 chatVersion |
| `GET /snap/api/requests/:requestId` | 查询本设备提交是否已接受及关联生成；确认响应丢失时无需知道 generationId 也可查询；未找到不触发重发 |
| `GET /snap/api/generations/:id` | 当前消息快照、状态与 lastSeq；不得重新调用模型 |
| `GET /snap/api/generations/:id/events?after=N` | 仅订阅已有生成；同源 fetch 读取 SSE，取消此连接不等于 stop |
| `POST /snap/api/generations/:id/stop` | 显式中止；重复 stop 幂等，真正关闭上游连接 |
| `POST /snap/api/files`、`GET /snap/api/files/:id` | 受控上传 / 鉴权读取；返回公开 fileId / MIME / 尺寸，不返回绝对磁盘路径 |
| `GET/PUT /snap/api/drafts/:chatKey` | 当前 browserClientId 的已保存快照，带 revision；无模型调用，旧 draft 格式先迁移后写入 |
| `GET /snap/api/prompts` | 公开快捷命令和内容，用于用户明确选择；不触发生成 |
| 原有 `/snap/api/desktop/poll`、`/validate`、`/ack` | 实际路径分别保留在 `/snap/api/desktop/` 下；沿用命令、上下文与接收页身份检查 |

未配对 401、越权 / 跨站 403、暂停 423、服务未就绪 503、payload 过大 413；新聊天中的版本 / 幂等冲突 409。页面请求返回原有可恢复等待页，API 返回 JSON；不能让 API 跳到一份 HTML 再被 JSON 解析报错。

示例为设计夹具，不代表已经存在的接口：

```json
{
  "apiVersion": 1,
  "requestId": "fixture-request-001",
  "chatVersion": 3,
  "parentMessageId": "fixture-assistant-previous",
  "modelId": "fixture-provider.fixture-model",
  "parts": [
    { "type": "text", "text": "解释这道题" },
    { "type": "image", "fileId": "fixture-image-001" }
  ],
  "origin": "manual"
}
```

### 6.2 流恢复和 SDK 状态只有一条路径

为每个生成分配递增 `seq`。流事件至少有 begin、delta、snapshot、finish、error / interrupted；finish 带真实终态，不用一条无区别的“结束”事件驱动朗读。所有事件带 generationId、messageId、chatId 和 seq，禁止夹带密钥。

可从快照恢复加有界事件缓存，不要求引入 Redis。after 序号已被清理时返回 snapshot + 后续事件，不因为缺事件重新生成。重复序号忽略；断线后只能重订阅 / 查状态，不能自动重 POST 消息。

前端固定 AI SDK 版本后实现一个 transport 适配层：把接受消息和订阅结果转成该版本 SDK 的消息流 / 状态。公共 HTTP SSE 是产品协议，不冒充“任意版本 useChat 原生就能直接读取”。适配层通过契约测试验证，消息展示不能另设一套与 SDK 脱节的完成状态。

显式 stop 先请求 `/stop` 再清理本页订阅；普通页面卸载只清理订阅。服务端上游 AbortController 归生成任务拥有，不挂在网关 socket.close 上。暂停恢复读到 completed 历史时只更新展示，不给手机朗读补发 begin / finish。

### 6.3 电脑自动发送的临提交校验

自动请求带 origin=desktop 与 command 对象。网关再次调用同一个 `CaptureDelivery.validate()`，检查当前设备、clientId、commandId、context 与暂停 / 撤销状态；客户端在调用 submit 前检查 composer revision、epoch、前台和 modal 状态。服务端用 commandId 唯一约束兜住重复接收。

一个页面不能确认其他页面的指令。发生未确认提交时，保留状态供查询，不因 ack 失败自动再次 submit；已经接受的生成按正常任务完成。电脑截图信箱仍不保存聊天历史。

当前 receiver 的随机页面 clientId 与持久草稿的 browserClientId 是不同概念：前者每次新页面重建，后者用于本浏览器草稿归属。不要用长期持久 ID 代替单页接收标识，造成旧标签页抢收。

## 7. 手机页实现顺序与关键细节

### 7.1 先定义输入行为，再接新 UI

composer 至少维护 text、附件数组、modelId、chatId / chatKey、epoch、revision、processing 和 submitting。每次用户修改递增 revision；打开新会话 / 切换历史递增 epoch，异步图片操作捕获它们并在插入前核对。processing 大于零时禁止按钮和非输入法组合中的 Enter 发送，Shift+Enter 继续换行。

图片上传完成不等于模型发送：把服务返回的 fileId 放入同一个附件数组，只有用户手动发送或验证通过的电脑指令才进入 submit。超限在批次开始前拒绝整批；图片处理中失败时保留原草稿，清除 busy 状态后给可操作的行内错误。

删除 / 清空撤销保留需要的引用与恢复信息 10 秒，撤销追加到末尾；不能在删除缩略图后立刻清理对应图片文件。实际提交时按数组顺序构造 parts 和 message_files ordinal，测试核对模拟提供商收到的图片内容与顺序。

服务确认接收前不销毁最后可靠草稿。确认丢失时通过 requestId 查询，不能以新的 requestId 自动重发；服务已经接受后再恢复页面时，读取已有消息，不把同一草稿当作新的待发内容。用户在发送后新输入的内容不能被迟到的接受响应清空，清理草稿需要匹配原 revision。

### 7.2 草稿、会话与当前模型

浏览器持久键建议统一为带版本前缀的 `snap.draft.v1:<chatKey>`，持久 browserClientId 独立保存；必须先完成第 9 节的旧格式适配，不能直接换 key 后忽略旧值。`draft_snapshots` 作为有版本的持久副本，与 browserClientId / chatKey 关联，不能把所有配对手机的未发送输入合并。

保存使用可控防抖并在 UI 中区分正在保存与已保存；测试等待真实保存完成后刷新。对话切换时读取对应草稿和所选模型，保持 M0 核对的“新对话是否带入原未发送草稿”等实际语义，不假设上游新对话一定清空文字。

多标签页冲突时通过 revision 检查保留各自未确认输入，不靠最后到达请求覆盖另一份草稿。退出 / pagehide 的收尾请求只能保存或读取状态，不能提交模型消息。

### 7.3 手机朗读与静默

- 保留 `snap.readAloud`、`snap.speechVoice`、`snap.speechRate`、`snap.display` 与 `snap.crop.<displayId>` 的含义和默认值；不能以重构为由清空整个 localStorage / IndexedDB。
- 正常完成事件仅在本页已观察到对应新生成开始、用户已开启且前台时朗读；finish 去重后消费 ID。状态恢复、历史读取、错误、停止、重复 finish 不朗读。
- 新生成、关闭朗读、停止本次、切换会话、后台和导航同步取消旧队列。声音面板关闭同步停止试听并返回焦点。
- 音色列表延迟载入 / 暂不可用时回退，不覆盖用户手选值；语速范围和默认值保持原样。只朗读可公开正文，不读 `<think>` 等隐藏内容。
- `quiet.js` 必须先于 React 入口执行，不能仅在组件 mount 后再禁通知。专用语音桥仍拒绝电脑、后台和不可信试听事件；自动朗读与真实点击试听分开授权。
- 新 React 音频实现不再依赖全局 EventTarget 劫持。legacy 页面可继续保留旧桥，在移除旧入口前不能破坏旧版对照测试。

### 7.4 布局和交互验收

复用 `tokens.css`，不借本次架构重构重新设计全部视觉。至少保留 320px 宽、390×460 短视口、390×844 常规视口、长草稿、多图、VisualViewport 单独缩小和缩放页面场景；输入区、发送、停止和模型设置始终可达。

配对和模型页仍可独立使用。服务 ready 不要求已经配置密钥；没有模型时能进入配置，相关截图 / 发送动作保持现有禁用与说明。暂停 / 不就绪 / 错误刷新保留原 URL，恢复时回到原会话，不重放动作。

## 8. 原生监听和测试输入驱动

### 8.1 正式 observer

新增 `native/input-observer/`，用锁定工具链和 `Cargo.lock` 构建。资源路径约定为 `resources/native/<platform>-<arch>/input-observer[.exe]`，开发产物为 `build/native/<platform>-<arch>/`。找不到或架构错误时报告明确失败，不下载、编译或尝试系统 Python。

```jsonl
{ "protocolVersion": 1, "type": "ready", "coordinateSpace": "physical" }
{ "protocolVersion": 1, "type": "down", "x": 320, "y": 240 }
{ "protocolVersion": 1, "type": "move", "x": 321, "y": 240 }
{ "protocolVersion": 1, "type": "up", "x": 321, "y": 240 }
{ "protocolVersion": 1, "type": "cancel" }
```

示例是逐行事件，不是一个 JSON 数组。Node 端处理截断行、超长行、未知事件和协议不匹配，不能把 stderr 诊断当作坐标。Windows 输出物理屏幕坐标，继续在 `CaptureControls.pointer()` 用 `screenToDipPoint()` 转换；禁止在 Rust 与 JS 各转换一次。

保留现有约 20ms 按钮状态读取的语义，支持 left / right / middle / x1 / x2，不吞点击，不触发系统输入。锁屏 / 输入桌面变化、获取坐标失败、程序关闭时输出 cancel 或使 Node 确认失效，不留下“按住未松开”的手势状态。

Node 设置握手超时；未 ready 时 mouseReady=false。`stop()` 先关闭 stdin，有界等待后 kill，退出后清空引用。父进程崩溃也必须结束 observer，而不只依赖 Node 正常调用 stop。

Mac 当前区域鼠标路径在 `CaptureControls.arm()` 中明确拒绝，并非本次可以声称“已支持”。若后续增加 Mac observer，要固定坐标空间、系统授权和 button 映射，并修改 `mouseSupported` 与 `pointer()` 的平台分支；不能对 Mac 坐标照搬 Windows 转换。Mac 现有全屏 / 手机框选 / 快捷键 / 托盘仍需本次回归。

### 8.2 测试用 input-driver 单独构建

还要替换 `tests/windows-input.py`，否则 `npm run test:desktop-input` 会继续要求 Python。新增测试专用 `native/test-input-driver/`，支持与现有夹具等价的 `move`、`hold` 和 `key` 动作，只对隔离验收运行。

`scripts/smoke-desktop-input.cjs` 的 `input(args)` 改为启动 `build/native/win32-x64/test-input-driver.exe`；保留原屏幕画板、快捷键 / 长按 / 超时 / Esc、缩放、实际模型请求计数、窗口反馈统计与光标恢复逻辑。错误 / 中断也要释放测试按键和鼠标。

正式 observer 不增加注入输入的调试参数。测试 driver、测试画板、Rust 构建工具与测试源码不能进入发行包，资源审计明确拒绝它们。测试通过属于系统合成事件路径，不写成人工物理鼠标 / 键盘已验收。

## 9. 旧数据迁移：已确认结构与实施步骤

### 9.1 从哪里读，不从哪里猜

旧目录由 `brand.dataDirectory()` 和实际 userData 决定。旧 SQLite 位于 `open-webui/` 数据目录，上传目录由旧文件表的 path / meta 和已验证根目录解析。不能只假设仓库 `.snapsolver/` 就包含所有聊天数据。

M0.4 已在隔离旧版执行 PRAGMA、冻结双写消息图 / 图片 / 配置 / 草稿，并关闭旧写入后只读导出，见 [格式证据](node-service-formats.md)。以下来源已与合成夹具核对，不表示读取或核验真实用户数据库：

| 来源 | 当前源码中的字段 / 用途 | 新目标 |
| --- | --- | --- |
| `models/chats.py` 的 `chat` | id、user_id、title、chat JSON、created_at / updated_at、pinned、archived、meta、current_message_id 以及其他兼容字段 | chats、messages 与 legacy_ids；保留原 chat JSON 作无损兼容载荷 |
| `chat` JSON | `history.messages` 消息图及线性 messages；固定版 loader 优先采用顶层有效的 `current_message_id`，否则采用 `history.currentId`。仅浏览兄弟分支不立即改变已保存指针，见 M0.1 基线 | 恢复父子关系 / 当前分支，不按数组拍平，不把临时展示当持久化承诺；M0.4 固定完整夹具及双指针优先级 |
| `chat_message` / `chat_file` | M0.4 实际确认 19 / 7 列；normalized 消息与 chat JSON 双写，部分读取优先 normalized；保留 output、meta、usage、error、done 等完整载荷及文件关系 | 合并缺失父节点并比对两份图，保留冲突 / 兄弟分支，不只导入 JSON 或只取 normalized |
| `models/files.py` 的 `file` | id、hash、filename、path、data、meta 和时间 | files、message_files，字节哈希和旧 URL 映射 |
| `models/config.py` 的 `config` | **当前为逐 key 的 key / value / updated_at 表**，不是可直接假定的单行 JSON 配置 | 提供商配置与产品持有设置；单独映射相关 key |
| 配置 key | `openai.api_keys`、`openai.api_base_urls`、`openai.api_configs`；按 index / prefix_id 关联，字段仍要按实际保存值校验 | provider_connections；用户值优先，删除 / 禁用状态保留 |
| `models/models.py` 的 `model` | id、base_model_id、name、params、meta、is_active 等 | 模型显示 / 用户参数 / 能力与兼容字段，不能只导入 config 里的默认列表 |
| `models/prompts.py` 的 `prompt` | id、command、name、content、data、meta、tags、is_active、版本和时间 | prompts 与原始兼容字段 |
| `models/users.py` 的用户 settings | 本机账户 UI 等偏好，具体相关字段以夹具冻结 | 与产品相关的可保留设置；旧通知开启值仍不能解除强制静默 |
| 浏览器原存储 | M0.4 已实测 sessionStorage 的 chat-input / chat-input-<id>、500ms 保存、完整 files 嵌套对象与 selectedModels；两个隔离引擎 IndexedDB 为空，不能推定所有旧用户也为空 | 同 origin 的一次性草稿适配，保留旧键与 snap.* 偏好；跨 origin 与失效 blob 限制单列 |

源码在安装目录 `.runtime/Lib/site-packages/open_webui/`（Windows）或 `.runtime/lib/python3.12/site-packages/open_webui/`（对应源码环境）。该目录被忽略，搜索需要 `rg --no-ignore`；只读源码，不通过 import / 启动上游来“探测”真实用户数据，避免触发旧运行层迁移写入。

`chat_message` 已确认，必须同时迁移。遇到其他额外存储、未知 schema 或两份消息图冲突时，先分析固定版本实际读写逻辑与夹具，不按字段名猜测后丢数据。旧上游关闭的功能字段可继续保存为兼容元数据，不因此在新版新增隐藏功能。

### 9.2 必须实现的迁移函数边界

建议在 `service/migrations/open-webui.cjs` / 子模块中提供这些职责，不写成一个不可恢复的大脚本：

1. `inspectSource()`：返回 schema 版本、表 / 字段形状、数据量与受控附件根；日志只输出字段名和计数，不输出行内容。
2. `snapshotSource()`：持有迁移锁，停止旧写入，创建 WAL 一致快照和源 manifest。读取源文件的步骤不修改旧库 / 旧配置。
3. `mapConnections()`：保留地址、协议、目录 / 自定义模型、启用 / 删除状态与密钥，写入主进程密钥存储；不再用 env 覆盖已保存用户值。
4. `mapChatsAndBranches()`：按稳定旧 ID 导入会话和消息图，保留未知字段；校验父节点、当前分支和模型 ID。
5. `mapFilesAndPrompts()`：解析 data URI / 本地旧文件引用，校验与复制字节，建立 message ordinal、草稿引用及旧 URL 映射；导入提示词但不覆盖用户内容。
6. `validateTarget()`：计数、ID、关系、正文和文件哈希逐项对比，固定错误码 / 计数报告；密钥只验证可读状态，不输出比较值。
7. `activateTarget()`：目标校验通过后原子写激活标记；之前失败不能创建一个空新库并改变默认运行层。
8. `resumeMigration()`：识别最后可靠阶段并重入，唯一约束防重复，失败目标与正式目标明确区分。

每个函数都用无秘密夹具覆盖中断恢复。外部 URL / 不认识的附件形态不得自动联网下载，不得悄悄丢引用；未知情况先保留兼容载荷并解决可读问题，未解决不通过迁移门槛。失效 blob URL 不能仅靠服务器数据库恢复，浏览器适配需在仍持有内容时完成；原本尚未上传 / 保存的数据保持原有能力边界。

### 9.3 浏览器升级适配

先在隔离旧版里输入文字、添加图片，等待实际保存，读取浏览器相关键 / IndexedDB 的结构制作脱敏夹具；检查切换会话、新会话、刷新后的行为。不能凭搜索到一个 `draft` 字符串就推定完整格式。

在新页面启动 React 业务之前运行适配器：读取旧草稿、映射旧会话 / 文件 ID、确认图片可读、事务或版本化写入新格式、验证结果、最后写迁移完成标记。保留旧键以供回退，不调用 `localStorage.clear()` / 清空 IndexedDB。

如果旧草稿使用旧 `/api/v1/files/...` URL，增加经过配对鉴权的只读兼容文件映射，或在导入时改为新 fileId；不通过保留 Python 进程来读取它。旧上游登录 token 不成为新模型请求的凭据。

保持 LAN origin 的正常升级可以继续读取浏览器数据；跨 IP / 端口的新 origin 无法直接访问旧浏览器存储，按方案记录现有限制和恢复步骤，不假称后台自动完成跨 origin 迁移。

### 9.4 回退不能只有备份按钮

回退输出是一个供旧版本读取的**独立目录副本**，不能写回源快照或让旧版直接打开新库。逆向映射新增会话、消息关系 / 当前分支、图片、模型设置和提示词，处理原时间单位与文件引用。

验收流程必须包含：旧夹具 → 新版导入 → 新增一轮含图片的消息 / 编辑或重答分支 / 修改提示词或连接 → 导出旧版副本 → 用固定旧版在隔离环境读回并验证。只在切换前用旧快照重新启动不算“切换后无损回退”。

不能反向转换的数据必须保留并报告，不能自动丢弃后写成功。只有回退闭环有证据，才能执行 M5 的旧运行层删除。

## 10. 分阶段任务卡：按顺序执行

任务卡中的报告文件随实施新增，已创建 `docs/node-service-baseline.md`。每一张卡都要记录关联 F 编号、实际改动、验证结果和下一项；卡片完成不等于整阶段完成。

### M0：固定基线和高风险假设

| 任务 | 具体动作与交付 | 完成条件 |
| --- | --- | --- |
| M0.1 | 记录版本 / 工作区；在隔离目录跑当前可执行检查，建立 `docs/node-service-baseline.md`，按 F01～F36 核对现有可达入口与证据 | 区分已有证据、本次通过、失败和未测；会话菜单 / 分支 / 草稿没有靠猜 |
| M0.2 | 记录各启动阶段、当前 exe / 解压体积和文件数；记录设备、系统、冷 / 温启动口径 | 有原始时间与大小证据，不把用户约 10 秒反馈当作已分段测量 |
| M0.3 | 在隔离实验验证 utilityProcess、固定 SDK / ESM 加载、SQLite、前端 strict 构建和至少一份实际 ASAR 资源定位 | 锁定版本与清晰选择理由；缺某个平台时保留未验证状态，不声称跨平台已通过 |
| M0.4 | 制作旧库 / 分支 / 附件 / 删除密钥 / 提示词 / 浏览器草稿夹具，固定读写格式和时间单位；验证两条 mock 协议 | 高风险 schema / draft / custom base URL 没有未说明的假设 |
| M0.5 | 按实施指令同步 AGENTS 中将被替换的条款，固定 contracts 初稿和任务进度 | 旧默认继续可用，规则中不残留相互冲突的“必须用上游”与“替换上游” |

### M1：先打通真实服务，不先画一个假聊天页

| 任务 | 具体动作与交付 | 完成条件 |
| --- | --- | --- |
| M1.1 | 提取 legacy Runtime，新增 node Runtime / 子进程入口与路径；实现 initialize / ready / shutdown | ready / error / exit 真正反映状态；不改生产默认 |
| M1.2 | 建 schema、分支、文件与提示词事务，新增存储与关系测试 | 重复迁移、缺图、并发提交、分支切换可检测，不丢原数据 |
| M1.3 | 实现 SDK 提供商工厂与公开目录 / 保存接口，接 mock provider | Responses / Chat、多图 / 上下文 / 错误 / 取消按协议实际检查；不请求外部服务 |
| M1.4 | 实现 accepted → 生成 → 订阅 / 快照 → 终态、requestId / commandId 去重和显式 stop | 断开浏览器连接不停上游；stop 关闭上游；重复 / 崩溃不重放 |
| M1.5 | 接入网关白名单、内部鉴权、文件与 SSE；迁移 available-models 调用 | 未配对 / 跨站 / 暂停 / 撤销、伪造内部头与状态恢复通过 |

### M2：用单一 composer 替换手机上游 UI

| 任务 | 具体动作与交付 | 完成条件 |
| --- | --- | --- |
| M2.1 | 建 phone strict TS 构建、同源路由、SDK transport、历史与消息展示 | 新增代码类型检查通过；实际 mock 流、停止、多轮和切换模型可用 |
| M2.2 | 接单一 composer、上传 / 截图 / 框选、附件整理、草稿保存与旧格式导入 | F09～F11、F19～F28 核对通过，包含所有 M0 发现的聊天入口 |
| M2.3 | 接电脑 receiver、context / revision 和单次提交；迁移旧 DOM 绑定测试 | F16～F18 通过，草稿、后台、生成中、多标签页和确认丢失不误发 |
| M2.4 | 接静默 bootstrap、朗读 / 声音 React UI，复用已测纯逻辑 | F29～F32 通过，真实音频资源采样仍为零，旧历史不补播 |
| M2.5 | 检查窄屏 / 键盘 / 弹层 / 模型表单 / 等待页，补真实渲染截图 | Chromium / WebKit 的业务对照完成；没有把模拟语音引擎当扬声器验收 |

### M3：原生程序与无 Python 验收路径

| 任务 | 具体动作与交付 | 完成条件 |
| --- | --- | --- |
| M3.1 | Rust observer、JSON Lines 校验、Node start / stop、DPI / 父进程清理 | Windows 全部既有长按 / 按键 / 双击 / 取消语义通过 |
| M3.2 | 独立 test-input-driver，替换 `tests/windows-input.py` 的调用 | 原生输入验收不需要 Python，测试 driver 未混入正式 observer |
| M3.3 | 源码 / 解包应用中验证全屏 / 区域、托盘、静默、退出和异常终止；回归 Mac 已有能力 | 记录系统与架构；无屏幕权限、没有 Mac 或多屏设备时明确未验收 |
| M3.4 | 补 Mac ICNS、app bundle 资源路径、平台 / 架构过滤、DMG 布局、dist-mac 包装脚本与审计参数 | Mac 核心功能不依赖不存在的 observer；配置不混入 Windows exe / Python；构建步骤不需用户设备安装开发运行时 |

### M4：真实升级、数据校验和回退

| 任务 | 具体动作与交付 | 完成条件 |
| --- | --- | --- |
| M4.1 | 实现一致快照、阶段化导入、验证 / 激活、旧 URL / 文件映射 | 源库未被改写、计数 / 关系 / 字节校验通过，未知 schema 不建空库冒充成功 |
| M4.2 | 同 origin 浏览器升级与偏好 / 草稿迁移；模拟端口冲突 / 新 origin 边界 | 保存完成的文字 / 图像恢复，朗读不开启 / 不补播，原偏好保留 |
| M4.3 | 多次导入、阶段中断、空间不足、附件缺失、错误配置与新增数据后回退 | 不重复消息、恢复密钥或覆盖新版新数据；回退旧版副本可实际打开 |
| M4.4 | 实际旧安装 → 新安装覆盖升级、重启、缓存清理与卸载保留数据 | 原身份 / 路径 / 配对 / 网卡 / 快捷键 / 历史继续有效；测试安装和进程收尾完成 |
| M4.5 | 分别验证 Mac 两架构的 DMG 拖拽 / ZIP 解压、安装后启动、替换旧 app、移除 / 重装与 Keychain 密钥读取 | 原 Snap-Solver / Scrylet 数据与已保存草稿仍可用；只在隔离安装副本操作，未授权截图或未测架构保持失败 / 未测 |

### M5：默认切换、去除旧依赖与完整验收

| 任务 | 具体动作与交付 | 完成条件 |
| --- | --- | --- |
| M5.1 | 默认 node，删除旧 Python / 上游调用和资源，更新 setup / dist / audit / notices | 不是“界面不显示 Python”，而是运行、测试默认路径与发行包均无依赖 |
| M5.2 | Windows 完整安装版与双平台最终业务套件；Mac 产物交付另由 M5.5 核对 | 逐项更新 F01～F36 和 M0 扩充项，没有以删测试换通过 |
| M5.3 | 实体手机与全功能性能 / 体积测量，核对全部发布门槛 | 按真实范围报告失败 / 未测；不能仅凭小包或首页截图宣布功能完整 |
| M5.4 | 更新说明、真实架构 / 命令、实现手册、状态表与下一位 agent 的交接 | 文档指向真实文件和已存在命令，估算与实测明确区分 |
| M5.5 | 交付 Mac arm64 / x64 的 DMG 与 ZIP，生成哈希与独立架构的包审计、安装结果和签名 / 公证记录 | 四份产物可区分，M4.5 数据与安装验收有证据；缺产物 / 架构验证不得宣称本次重构全部完成，对外发布另遵守签名 / 公证与明确发布指令 |

## 11. 命令、资源和验收结果怎么交付

### 11.1 现有命令与未来命令不要混写

目前确实存在的入口：

```sh
npm run check
npm test
npm run test:ui
npm run test:baseline
npm run test:startup
npm run typecheck:phone
npm run build:phone
npm run test:compat
npm run test:desktop
npm run test:desktop-input
npm run test:silent
npm run test:maintenance
npm run test:network
npm run dist:win
```

浏览器环境需按现有说明安装 Playwright 引擎。desktop-input / network 等脚本有本机平台要求，`dist:win` 必须在 Windows x64 原生构建；在 WSL / Linux 缺少原生条件不能报告为通过。

以下入口以当前 package.json 为准；M4 已实现 `test:migration` / `test:migration:browser`、本地 `export:legacy` 与 Windows 安装验收入口，见 [M4 复现记录](node-service-m4.md)：

| 建议名称 | 引入阶段 | 行为 |
| --- | --- | --- |
| `build:native`、`test:native` | M3 已实现 | Windows x64 锁定 Rust 构建；observer 与测试 driver 是独立 binary / manifest，正式资源只白名单 observer；实际五键 / 清理验收 |
| `test:desktop-lifecycle` | M3 已实现 | 源码 / 解包应用的关窗驻留、菜单恢复、正常退出和只杀主进程清理 |
| `test:service` | M1 | 独立服务 / 事务 / SDK mock / 流契约，不启动上游 |
| `test:migration` / `test:migration:browser` | M4.1～M4.3 已实现 | 一致快照、真实阶段进程退出恢复、密钥解密、新增数据后旧版实际读回与两引擎浏览器升级 |
| `prepare:upgrade:win` / `test:upgrade:win` | M4.4 隔离 NSIS 通过，正式 GUID 未测 | 保持 appId / payload，隔离安装注册 / 快捷方式 / 缓存；实际覆盖 / 重装 / 回退，拒绝覆盖既有安装 |
| `export:legacy` | M4.3 已实现 | 停止写者后生成独立旧版副本与 Node 可读快照，不覆盖原数据 |
| `dist:mac`、`dist:mac:arm64`、`dist:mac:x64` | M3.4 配置，M5 交付 | Mac 本机明确目标架构，生成对应 DMG / ZIP，详见第 11.4 节；不自动外部发布 |
| `test:mac-package` | M3.4 已实现脚本，M4.5 / M5 完整验收 | 真实目标 Mac 的隔离安装 / 替换 / 重装与 Keychain；完整旧库迁移 / Finder 操作仍单列，不在缺该平台的环境伪造通过 |

每个阶段只运行与改动相关的检查；在最终切换时做完整回归。阶段结果和最终全套结果分别记录，不能把零散单项重试累加成“一次全套通过”。

### 11.2 发行构建顺序

最终 `dist:win` 的顺序应为：类型检查 / 必要构建验证 → 前端构建 → 校验目标 observer → electron-builder NSIS → 包资源审计。不要继续调用 `prepare:runtime` 来复制 Python，也不要在安装后第一次启动才下载缺失依赖。

`electron-builder.cjs` 的 files 需包含 `service/**/*.cjs`、`contracts/**/*.cjs` 和从 `build/phone/` 映射到 `phone-dist/` 的 FileSet；保持原桌面、web 公共资源、配置、LICENSE 与 notices。extraResources 只放目标正式 observer 和应附许可，不包含 Rust 源码、test-input-driver、真实 userData 或开发数据。

服务直接使用的 AI SDK / 适配器必须作为可被构建器正确收集的生产依赖，TypeScript / Vite / 编译工具留在开发依赖。服务 ESM 加载和适配器传递依赖需要在真实 ASAR / 安装版验证，不能仅靠开发目录 import 成功。

资源审计同时验证“该有的存在”和“该移除的不存在”：新入口、静默资源、原生架构、生产依赖可解析、许可齐全；无 `resources/python`、旧 launcher、真实密钥 / 数据库、.runtime、.test-data、原生测试工具和开发依赖。

Mac 构建与 `.app` 的资源布局按第 11.4 节执行；不能把这段 Windows 顺序原样用于 Mac，也不能把未实现的 Mac observer 当作 Mac 基础聊天 / 全屏截图的运行前提。

### 11.3 每次交接必须给出这些结果

- 当前 engine 默认值、实现阶段、对应提交 / 工作区变化；哪些已有改动属于用户。
- 完成的任务卡和 F 编号；实际修改的文件、导出与接口变更；新增命令已经存在还是尚为规划。
- 实际运行的命令、系统 / 架构、通过 / 失败 / 未测；相应原始结果在忽略的测试目录，脱敏汇总与真实截图在受控 artifacts。
- 数据迁移阶段、源是否保持只读、快照 / 校验 / 回退是否通过；只给状态和计数，不粘贴正文或秘密。
- 默认仍为 legacy 或已经 node；是否保留旧运行层、是否允许新安装替代；下一项明确任务 ID 和阻塞条件。

不能写“基本完成，其他以后再做”后删除旧运行层。若没有实体 Mac / 手机或权限被拒绝，继续完成可独立推进的部分，明确受影响验收仍未通过，不假装它们已经满足发布门槛。

### 11.4 macOS 安装包：需要增加的脚本与配置

本节针对重构完成后的 Node 版安装包。M3.4 已实现 `dist:mac` / 两架构命令、ICNS、资源 / 架构审计和安装验收脚本，见 [M3 证据](node-service-m3.md)；**没有真实 Mac，尚未生成或验收两架构 DMG / ZIP。** 当前只允许显式独立 Node 数据的 development 候选，M4/M5 前不开放 production 默认；Windows 原配置与 Python 对照仍保留。

#### 11.4.1 产物和安装方式

每个版本必须生成以下四份文件及各自 SHA-256：

```text
dist/Scrylet-${version}-mac-arm64.dmg
dist/Scrylet-${version}-mac-arm64.zip
dist/Scrylet-${version}-mac-x64.dmg
dist/Scrylet-${version}-mac-x64.zip
```

DMG 中提供 `Scrylet.app` 和 Applications 快捷方式，用户拖入 Applications 后运行。ZIP 完整保留 app bundle、权限与符号链接，作为替代安装归档；增加 ZIP 不代表启用自动更新。首版不制作 PKG / MAS / Universal，也不要求通过 Rosetta 才能运行 arm64 包。

构建要求在 Mac 本机或 Mac CI 执行：优先在 Apple Silicon 构建 / 验证 arm64、Intel 构建 / 验证 x64。可以有交叉构建步骤，但交叉产物生成或 Rosetta 下运行不代替对应架构的安装验收。最低 macOS 版本根据固定 Electron 和实际依赖确定，并记录在产物说明；不能沿用一个未验证的旧系统版本数字。

#### 11.4.2 平台配置与已实现的 Mac 增量

实际配置由 `scripts/package-config.cjs` 生成，沿用 `NAME` / `APP_ID`，保留 Windows / NSIS。根 `electron-builder.cjs` 仅用于 Windows；Mac 必须经过 wrapper 生成对应架构配置。以下片段与实现一致：

```js
mac: {
  target: ['dmg', 'zip'],
  icon: 'packaging/icon.icns',
  category: 'public.app-category.productivity',
  artifactName: NAME + '-${version}-mac-${arch}.${ext}',
},
dmg: {
  title: NAME + ' ${version}',
  format: 'UDZO',
  contents: [
    { x: 130, y: 220, type: 'file' },
    { x: 410, y: 220, type: 'link', path: '/Applications' },
  ],
},
```

脚本显式传入 `--arm64` 或 `--x64`，不让共享资源准备目录默默覆盖另一个架构。DMG 压缩先使用默认兼容的 UDZO；包体、挂载 / 拖拽时间按 Mac 实测，不能使用 Windows 的 115.2 MiB 实验结果当 Mac 指标。

`scripts/generate-icons.cjs --mac` 已通过 `mac-icons.cjs` 从现有 SVG 生成 16～1024 像素、含 Retina 的 iconset，Mac 使用系统 `iconutil`。本次 Windows 已生成 PNG 块 ICNS 并验证全部 11 块尺寸；实际 iconutil / Finder 显示仍未测，不改品牌源文件或旧 Windows 图标。

签名 / entitlements 配置与此最小片段分开，不能把 `identity: null` 永久写死从而覆盖未来正式证书。开发验收 profile 明确实际是未签名还是 ad-hoc，报告中不能写成 Developer ID；面向外部分发的 profile 检查签名、公证和下载后首次打开。不能通过关闭系统安全检查或清除 quarantine 来冒充正式分发验收。

如果显式增加 `packaging/entitlements.mac.plist` 与 inherit 文件，必须根据锁定 Electron 版本和实际 JIT / 子进程需求确定最小设置，验证主 app 和 helpers；不启用 MAS sandbox 或申请未使用的摄像头 / 麦克风权限。证书和认证材料通过受控环境 / Keychain 提供，不写入脚本、文档示例或仓库。

#### 11.4.3 新 `scripts/dist-mac.cjs` 的执行约定

该脚本负责以下顺序，而不是让 package.json 直接绕过资源检查调用 builder：

1. 验证 `process.platform === 'darwin'`，解析目标 `arm64|x64` 与开发 / 分发 profile；默认架构取宿主，拒绝未知架构，不自动安装 Rosetta。
2. 运行前端类型 / 构建验证，准备 `build/phone`、ICNS 和目标架构的必要正式资源；验证 Node / SQLite 依赖和 Electron helpers 架构。
3. 仅在 Mac observer 已实现且在该版本声明支持时准备 `build/native/darwin-<arch>/input-observer`；尚不支持长按时写明 capability=false，不引用空目录、不打包 Windows observer、不误报 mouseReady。
4. 将平台 / 架构 / profile 配置写入 `build/mac-<arch>-<profile>/builder.json`，调用 `electron-builder --config <该文件> --mac dmg zip --arm64 --publish never` 或相应 `--x64`，各架构 output 独立。正式签名 / 公证按受控 profile 执行；生成本地包不自动上传。当前 distribution 在 M4/M5 前拒绝，development 显式隔离启动，不覆盖生产用户数据。
5. 解析本次产物路径，检查文件存在、版本 / 架构命名、SHA-256、app 内容与依赖；输出脱敏打包记录，保留构建失败，不只凭 CLI 返回零退出码标记安装验收成功。

已实现 npm 命令：`dist:mac:arm64` / `dist:mac:x64` 调用上述脚本的对应 `--arch`；`dist:mac` 调用默认宿主架构。交付两种架构要分别运行并验收两份构建，不能将单次 `dist:mac` 当作已生成全部四份包。非 Mac 调用立即失败，不输出构建 / 安装通过记录。

#### 11.4.4 `.app` 资源定位与审计

`Scrylet.app/Contents/Resources/app.asar` 保存桌面、Node 服务、contracts 校验、phone-dist、公共 web / config 和生产依赖。正式原生程序若有，放在 `Contents/Resources/native/darwin-<arch>/`；不从安装者的 cwd 或开发机绝对路径定位。

`runtime-paths.cjs` 使用实际 `app.getAppPath()` / `process.resourcesPath`。`scripts/audit-package.cjs` 新增显式 platform / arch / app 路径解析，Windows 使用 `resources/`，Mac 使用 `.app/Contents/Resources/`，不继续对 Mac 断言 `python.exe` / `python312.dll` 存在。

审计实际 Electron 主可执行文件、相关 Mach-O / `.node` 文件和正式 helper 架构，检查执行权限、符号链接、入口、静默资源、ICNS 与许可证；无 Python、开发绝对路径、Windows exe、test-input-driver、测试数据或秘密。Mac 基础版没有 observer 时审计 capability 与真实资源一致，而不是伪造一个 helper。

构建 / CI 与运行目录分开：程序不能向 `/Applications/Scrylet.app` 或只读挂载 DMG 写聊天数据库、日志、配置或迁移标记。

### 11.5 macOS 安装、升级和数据保留验收

新增 `scripts/smoke-mac-package.cjs` / `test:mac-package`，要求真实 Mac 和显式 app / 产物路径。验收使用隔离数据与安装副本；不覆盖用户正在运行的正式 app，也不删除真实 `~/Library/Application Support/` 内容。

| 验收项目 | 必须检查的结果 |
| --- | --- |
| DMG 与 ZIP | 分架构挂载 / 解压，DMG 的 app / Applications 图标可见、拖拽可安装；ZIP 内 `.app` 权限 / 链接保留。仅有 `--dir` 产物不算安装包通过 |
| 安装后独立启动 | 从复制后的 app 启动并弹出原 DMG，清理测试 PATH 中开发依赖；不依赖 Python、系统 Node、Rust、源仓库或原挂载目录 |
| 身份和目录 | CFBundleIdentifier 为 `com.snapsolver.desktop`；已有 `~/Library/Application Support/Snap-Solver/` 时继续沿用，否则使用 Scrylet；`SNAP_DATA_DIR` 测试隔离优先规则保持 |
| 旧 app 替换 | 先正常退出旧后台和生成，再替换安装副本；旧名 Snap-Solver.app 与新名 Scrylet.app 可能并存，不能自动删除旧 app / 数据来假装升级成功；单实例 / 单写者防止争用数据库 |
| 数据与密钥 | 升级前后逐项核对聊天、分支、图片、提示词、模型连接 / 密钥删除状态、配对、网卡、热键、日志和浏览器偏好 / 草稿；safeStorage 实际可解密旧密钥，重授权或错误不得被吞成空密钥 |
| 卸载 / 重装 | 删除测试 `.app` 不删 userData、历史图、配对、偏好、日志或 Keychain 中仍需保留的密钥；重装后可读。弹出 / 删除 DMG、ZIP 也不影响业务数据 |
| 权限和 LAN | 实际允许 / 拒绝屏幕录制，拒绝不能算截图成功；从安装后 app 引导授权，授权后按需重启；实际 LAN 地址配对和网卡变化有结果，系统要求的相关权限按实际情况记录 |
| 核心行为 | 全屏截图、手机框选、热键、托盘、关窗驻留、暂停 / 撤销、朗读与截图静默通过；未实现 Mac 鼠标长按明确不可用，不能用 Windows 输入结果替代 |
| 退出与异常终止 | 退出、崩溃 / 被杀后无孤儿 Node / helper、占用端口或数据库锁；不重放之前不确定提交 |
| 分发和签名 | 分别记录未签名 / ad-hoc / Developer ID / notarized，检查嵌套组件和升级后 Keychain；外部分发另验下载后首次打开与公证票据，不使用安全绕过步骤替代 |

每种架构输出独立的脱敏记录：版本、文件名 / 哈希 / 大小、目标与实际运行架构、最低系统版本、app / helper / SQLite 检查、签名 / 公证状态、实际安装 / 数据迁移结果、失败及未测范围。可采用 `artifacts/mac-arm64-package-check.json` 与 `mac-x64-package-check.json`，这些文件在实际运行前不得预填“通过”。

**Mac 两架构安装包是明确交付项，不再写为“计划支持时再做”。** 没有对应 Mac / 证书 / 系统权限时，继续完成可独立的工作并保留未通过项；不能把配置片段、跨编译结果或单一架构测试改写成全部交付完成。

配置与分发参考：[electron-builder v26 macOS](https://www.electron.build/v26/docs/mac/)、[Electron 签名与公证](https://www.electronjs.org/docs/latest/tutorial/code-signing)。以锁定版本的配置 schema 与实际构建为准，不抄用其他主版本新增字段。

## 12. 当前进度与可复制任务模板

### 12.1 实施中的真实状态（2026-11-08）

| 范围 | 状态 |
| --- | --- |
| 重构方案、语言边界、逐文件手册 | 已收到实施指令；已同步 AGENTS / spec / architecture 过渡期约束与强制静默 |
| M0.1 / 实际基线 | 已完成入口与证据登记；47 项离线、70 项原有两引擎全套、8 项新增两引擎基线、Windows 真实 2560×1440 / 关窗驻留通过。见 `artifacts/node-service-baseline-check.json`；仅观察入口 / 未测操作在基线逐项保留 |
| M0.2 / 计时与包体 | 自动部分已通过，服务 ready 中位数 5,651.211ms、业务可用 8,007.293ms。真实系统重启首启 0 / 5，用户明确选择暂保留未测并继续 M0.3；不计整卡通过，证据见 `artifacts/node-service-startup-check.json` |
| M0.3 / 兼容实验 | Windows x64 已通过：Electron 44.8.0 内置 Node 24.22.0 / SQLite 3.53.4；源码与仓库外真实 ASAR 均验证 SQL / 备份、CJS 动态 ESM、Chat 流 / Responses 非流式、退出 / 父进程死亡。strict 前端 4 份两引擎检查与 53 项离线检查通过；依赖已精确锁定，旧依赖版本未升级。Mac / 安装版仍未验证；见 `artifacts/node-service-compatibility-check.json` |
| M0.4 / 旧格式与协议矩阵 | 已完成；真实旧库 PRAGMA / JSON + chat_message 图、图片字节、删除密钥与提示词重启、浏览器草稿 / 声音 / 框选偏好和配对 / 网卡夹具已冻结；2 项两引擎、14 项双协议、3 项固定夹具检查通过。见 `docs/node-service-formats.md` 与 `artifacts/node-service-formats-check.json`；合成边界和 M4 未完成项单独登记 |
| M0.5 / 规则与 contracts | 已完成初稿与规则复核：共享声明、24 类运行时 schema、HTTP 草稿、32 项契约检查与 strict 类型反例；同轮 102 项离线通过。见 `docs/node-service-contracts.md` 与 `artifacts/node-service-contracts-check.json`；生产接线待 M1 |
| M1.1 / 生命周期 | 已完成，正式 utilityProcess / 随机凭证 / 窄秘密通道 / nonce 心跳及超时已接线；Windows 真实 OS 加密、正常关闭和只杀父进程退出、6 项离线生命周期检查通过。见 `docs/node-service-m1.md` |
| M1.2 / 事务存储 | 已完成；schema 校验和 / 单写者、消息图 / 分支 / 附件 / 草稿 / 提示词与管理操作、重复 domain 导入及冲突检查通过。Windows 7 组存储检查和 40 项相关离线通过；旧库迁移仍为 M4 |
| M1.3 / SDK 与目录 | 已完成；真实双协议 JSON / SSE、多图历史、ID / 自定义地址、错误 / 取消 / 零重试、窄秘密通道与删除不复活通过。`run-8gwZTd` 为 Windows 证据，无真实账户 |
| M1.4 / 持久生成 | 已完成；事务接受 / requestId 与 commandId 去重、真实 edit / regenerate 分支、增量落盘 / 缓存恢复 / 显式 stop、断订阅继续通过；正式 utilityProcess 杀服务后重启保留部分回答并 interrupted、不重放。Windows 证据 `run-npbuiz` |
| M1.5 / 网关 | 已完成 Windows 后端范围；白名单、鉴权 / 身份覆盖、文件 / SSE、暂停 / 撤销不停止上游、单接收页 / context / 草稿拒绝、availableModels 适配通过；源码与独立测试 ASAR 证据见 `docs/node-service-m1.md` |
| M2.1～M2.4 | 已完成 Windows 浏览器范围；最终新页面双引擎 50/50，独立 ASAR 手机 12/12、后端 34 组 / ASAR 33 组、旧 UI 70/70 和保存编辑 2/2，119 离线（含 43 契约）通过。单 composer / SDK、完整菜单、草稿 / 截图 / 框选、单接收页 / 不重放、手机主动朗读与恢复均有证据，见 `docs/node-service-m2.md` / `artifacts/node-service-m2-check.json`；物理手机未测 |
| M2.5 | 已完成 Windows 两引擎范围；窄屏 / 短屏 / 长输入多图、VisualViewport / 缩放、弹层焦点、模型设置与等待恢复，16 份新渲染截图已保存；软键盘和语音引擎为模拟，未计物理扬声器通过 |
| M3.1 | 已实现预编译 Rust observer / manifest / v1 JSON Lines / Node 生命周期，Windows 单屏 150% 的五键、双击、取消 / 超时、DPI 和异常退出通过；8 项 Node、3 项 Rust、5 组系统输入证据见 `docs/node-service-m3.md`。多屏 / 实际锁屏仍未测 |
| M3.2 | 已实现独立 Rust test-input-driver / release guardian，desktop-input 无 Python 夹具 / driver；强杀释放通过，正式资源排除测试驱动。旧 Python 文件仅保留对照，未删除 |
| M3.3 | Windows x64 源码 / 仓库外解包副本均通过 8 次 mock 的实际全屏 / 区域 / 五键 / 菜单 / 静默验收，各 4 组生命周期通过；146 份项目资源逐字节一致。M3 当时无新 NSIS；Mac 两架构、物理手机、多屏 / 权限拒绝仍未验收，不能计整卡跨平台通过 |
| M3.4 | Mac ICNS / 两架构 DMG+ZIP 配置、平台过滤、dist wrapper 与实际安装审计脚本已实现；7 项结构检查通过。没有真实 Mac，0/4 产物、两架构安装 / Keychain / 签名 / 公证 / Finder 拖拽均未测。当前仅隔离 development 候选，M4/M5 前拒绝 distribution |
| M4.1 | Windows 隔离验收完成：一致 SQLite / WAL 快照、源只读、分阶段验证 / 激活、文件字节 / 图分支 / 连接 / 桌面设置完整保留；未知 schema 拒绝。见 [M4](node-service-m4.md) 与机器汇总 |
| M4.2 | Chromium / WebKit 同 origin 已保存图文草稿 / 偏好升级及回退 4 项通过，端口冲突 / 跨 origin 明确不可自动读；物理手机 / Mac 未测 |
| M4.3 | 33 组迁移 / 失败 / 重入 / 新增数据后回退通过，六阶段真实进程退出恢复与 OS 密钥解密、两个 Node 快照重开和固定旧版实际读回均有证据；Mac Keychain 未测 |
| M4.4 | 8 组实际旧 / 新 NSIS 安装闭环通过，中文 / 空格 / 点路径、重启 / 缓存 / 卸载重装 / 旧版读回；仅隔离安装命名空间，生产 GUID 覆盖升级未验收，整卡部分通过 |
| M4.5 | 迁移与旧 app 读回自动化接线已实现；没有真实 Mac，两架构 DMG / ZIP 0/4、Keychain / 安装 / 旧版读回未测，整卡未完成 |
| M5 | 已开始，尚未全部完成。源码 `npm start` 和 Windows Node-only 候选默认 Node，普通旧库自动迁移接线；setup / 默认浏览器测试 / dist / startup 已接新链路。Windows 隔离业务、原生、安装、十次常规启动与包体已有实测，见 [M5](node-service-m5.md)。本轮默认启动 / 自动迁移回归、生产 GUID、Mac、实体设备、冷启动和旧资源删除仍未通过 |
| 默认运行层 | Node utilityProcess + SQLite + AI SDK；显式 `start:legacy` 才使用 Open WebUI 0.12.2 + Python 对照 |
| 新 Node 服务 / React 手机页 / Rust observer | service / contracts、React 单 composer 与 Windows Rust observer 已接线；默认新数据目录与旧库只读迁移分离，Mac observer capability=false。原生输入不调用 Python；不计最终重构完成 |
| Mac arm64 / x64 DMG / ZIP、构建与安装验收命令 | 命令与审计脚本已实现，未在 Mac 执行或实际生成；非 Mac 调用明确失败，不预填通过报告 |
| 已新增的真实文件 / 命令 | M0～M3 文件保留。M4 新增 service/migrations、migration contracts、桌面迁移 / 进度、浏览器升级与回退镜像、实际安装助手 / 本地导出、迁移与安装验收；`test:migration` / `test:migration:browser` / `prepare:upgrade:win` / `test:upgrade:win` / `export:legacy` 已存在。M3 新增 native workspace、native-program、分平台 package-config / package-audit、ICNS、Mac wrapper / 安装脚本、Windows 独立输入 wrapper / lifecycle 测试；`build:native` / `test:native` / `test:desktop-lifecycle` / `dist:mac[:arm64\|:x64]` / `icons:mac` / `test:mac-package` 已存在。根 CJS / Electron 不变 |
| 本轮失败 / 中断 | M4 真实安装预检保护、首次隔离安装中文 stdout 编码、fixture WAL 收尾竞态、file 映射计数旧断言和进度视口溢出均保留并修正，最终 141 离线 / 33 迁移 / 4 浏览器升级 / 8 安装 / 50 手机 / 12 手机 ASAR / 34+33 后端通过；详见 [M4](node-service-m4.md)。M0～M2 历史保留。M3 首次输入保护拒绝、测试上下文 / 等待与 PID 假设、Electron HTTP 504、许可布局 / 旧解包不一致已记录修正；一次 WSL interop 启动失败和附加控制进程退出 143 均未计通过。最终 134 离线、3 Rust、源码 / 解包各 8 次 mock + 各 4 生命周期、后端 34/33 通过，详见 `docs/node-service-m3.md` |
| 下一项 | 用 `collect:m5` 将完整候选验收、同安装器的隔离安装、同 ASAR 的十次启动与包体绑定，保留 release blocked。随后需要独立 Windows 环境正式生产 GUID、真实 arm64 / x64 Mac 四份包与迁移 / 安装 / Keychain、实体 Android / iPhone、五次真实重启首启；多屏 / 锁屏仍保留。上述门槛全通过后才切换正式默认和删除旧资源 |

后续实施者完成任务后更新这张表，保持日期、完成证据、下一项和本文实际路径一致。不要把本文示例接口当作已经部署的服务。

### 12.2 可直接交给下一位 agent 的实施任务

```text
请在当前仓库执行 Scrylet 的 Electron + 轻量 Node 服务重构。

先读 AGENTS.md、docs/node-service-refactor.md、
docs/node-service-implementation.md，再核对 git status、package.json、
docs/verification.md 最新记录和当前实现。

这是开始实施的指令。按当前真实进度执行任务卡；若尚未实施，先做 M0.1。
同步需要替换的旧架构规则，不保留互相冲突的上游复用 / 新运行层条款。
保留用户已有改动，不清理用户目录，不连接真实模型账户，不提交秘密。

语言边界：保留现有 desktop / scripts / tests 的 JS / CommonJS，
新增 service 使用小型 CJS，新增 phone 使用 strict TypeScript + React，
原生输入监听使用预编译 Rust；不要全仓改 TS、改根模块类型或升级 Electron。

完整保留 F01～F36 及 M0 确认的全部可达功能和数据。
严格保留截图静默、单接收页、拒绝既有草稿 / 生成中自动提交、
不重放不确定发送、暂停与停止分离、手机主动朗读 / 声音设置。
已保存草稿、历史消息分支、图片、密钥删除状态、配对和网卡设置必须迁移。

按手册逐文件修改并验证；新 API / 数据 / 进程协议以契约测试固定。
同时迁移测试夹具和 tests/windows-input.py 的 Python 依赖。
新增 Mac 安装包：分别交付 arm64 / x64 的 DMG 与 ZIP，
实现 dist-mac / 安装验收脚本、ICNS、app bundle 资源与架构审计，
覆盖拖拽安装、替换旧 app、Keychain 密钥和卸载 / 重装保留数据。
未测架构不能标记通过，不把 Windows 的压缩数字当 Mac 包体结果。
新旧对照必须使用独立隔离数据；功能、迁移和新增数据后回退通过前，
保留旧默认运行层。最终包完整验收后才删除 Python / Open WebUI 资源。

每完成一张任务卡更新文档中的真实进度、证据、尚未通过项和下一项。
未测平台 / 物理手机和被拒绝的权限不得记成功；性能估算不算实测。
不要只交一个能聊天的最小 demo 就宣称全部重构完成。
```

如果只交接某阶段，把首句改成“继续执行任务卡 Mx.y”，并补充上一轮的真实结果；不要省略文档阅读、功能保留和数据边界。
