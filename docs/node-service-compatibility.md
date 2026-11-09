# M0.3：Node / SDK / SQLite / 前端 / ASAR 兼容实验

完成日期：2026-11-08（Asia/Shanghai）。**Windows x64 的 M0.3 已通过；macOS arm64 / x64 和实际安装版仍未验证。** 用户已明确将 M0.2 的真实重启首启保留未测，先继续本卡；没有重启 Windows，也不把 M0.2 标为全部通过。证据：脱敏报告（本地：`artifacts/node-service-compatibility-check.json`）、真实实验页（本地：`artifacts/node-service-compatibility-phone.png`）。

这是独立技术实验，默认仍为 `desktop/main.cjs` → legacy Python / Open WebUI 0.12.2。没有实现完整 Node 聊天服务、切换手机入口、迁移真实用户数据或删除 Python。实验页明确标注“不是手机聊天入口”，不将它作为重构产品交付。

后续记录：M0.4 已完成 [双协议与旧格式矩阵](node-service-formats.md)，M0.5 已固定 [正式 contracts 初稿](node-service-contracts.md)；[M1](node-service-m1.md) / [M2](node-service-m2.md) 已接产品服务与手机页，[M3](node-service-m3.md) 记录 Rust 输入和新解包验收。下文保留 M0.3 当时的实验范围及下一项，不代表当前实现状态；默认继续 legacy。

## 实测运行环境

| 项目 | 实际结果 |
| --- | --- |
| 设备 | Windows 11 x64，沿用 M0.2 设备 |
| 固定 Electron | 44.8.0，未升级 |
| utilityProcess 内置 Node | **24.22.0**，不是开发控制器的 Node 22.14.0 |
| 内置 SQLite | **3.53.4**，实际导出 DatabaseSync / backup |
| Chromium | 152.0.7977.167 |
| 模块边界 | 根 CommonJS；实验 main / worker / protocol 为 CJS，SDK 在 worker 中 `await import()`；只有 phone 为 TS / React |
| 开发 Node 要求 | `>=22.12.0`，与固定 Electron npm 包及 Vite 构建要求一致；本机 22.14.0 满足，没有安装另一份 Node |

不能凭开发 Node 能 import 就决定运行层驱动。这里的 SQL 和 SDK 调用都在固定 Electron 的真实 utilityProcess 中执行；源码和 ASAR 各执行一次。utilityProcess 使用 Chromium Services / 消息端口启动，须在 App ready 后创建，见 [Electron API](https://www.electronjs.org/docs/latest/api/utility-process)。

## 固定依赖及理由

全部用精确版本写入 package.json，传递依赖和完整性由 package-lock.json 固定。对比安装前锁文件，**已有依赖的版本没有变化**，根模块类型未改，Electron / electron-builder / Playwright 未升级。

| 用途 | 精确版本 | 所在范围 |
| --- | --- | --- |
| AI SDK Core | `ai@7.0.164` | 生产依赖，未来服务边界使用 |
| Responses 适配器 | `@ai-sdk/openai@4.0.110` | 生产依赖 |
| Chat compatible 适配器 | `@ai-sdk/openai-compatible@3.0.86` | 生产依赖 |
| schema 依赖 | `zod@4.6.7` | 生产依赖，满足固定 SDK peer 要求 |
| React SDK 状态 | `@ai-sdk/react@4.0.168` | 前端构建开发依赖，与上述 Core 精确匹配 |
| React / React DOM | `19.3.1` / `19.3.1` | 前端构建开发依赖，代码编入静态 bundle |
| TypeScript / Vite | `6.0.3` / `8.3.6` | 开发依赖，编译器不进入运行层 |
| 类型声明 | `@types/node@24.19.2`、`@types/react@19.3.0`、`@types/react-dom@19.3.0`、`@types/json-schema@7.0.15` | 开发依赖 |

选择当前同一套 provider / core 兼容版本，并实际调用两条协议；不按厂商名擅自改成原生协议，也没有同时引入 LangChain 或每家厂商的另一套 SDK。前端 TS 6 的 JS 编译工具链已满足 strict 和现有 SDK 声明，不为本次验证再切换 TS 7 原生编译工具链。Vite 的 Node 构建要求见 [官方指南](https://vite.dev/guide/)。

SDK 通过显式 `createOpenAI(...).responses(...)` 和 `createOpenAICompatible(...)` 模型对象调用；不传会启用默认 AI Gateway 的模型字符串，不读取真实提供商密钥。自定义 fetch 限定到当前 loopback mock origin，`maxRetries=0`。两种适配器的入口说明见 [Responses / Chat](https://ai-sdk.dev/providers/ai-sdk-providers/openai) 与 [兼容地址](https://ai-sdk.dev/providers/openai-compatible-providers)。

## SQLite 候选决策及边界

当前 Windows 候选是固定 Electron 的 `node:sqlite`，无需再打包第三方 SQLite N-API 驱动或让用户设备编译。**此处不是全平台最终定案**；Mac 两架构与实际安装版通过前保留候选状态，所有后续业务访问仍应收口到 M1 的 storage 模块。

源码和 ASAR 中均实际检查：

- 在包外隔离 userData 下创建磁盘库，显式 WAL、foreign_keys=ON 和 busy_timeout。
- 参数绑定保存 Unicode 合成内容；事务写入后 rollback，计数保持不变。
- 不存在的父记录触发外键拒绝；第二个连接在持有 IMMEDIATE 写事务时被拒绝，随后 rollback。
- `backup()` 取得含 WAL 数据的一致副本，readOnly 打开并核对内容 / 哈希；两种资源位置下均为 3 页副本。
- 关闭连接，测试数据不进入 ASAR。

这些验证证明基础 SQL / WAL / 备份 API 可用，**没有证明应用级单写者锁、schema 迁移、崩溃恢复或旧库迁移已经完成**。backup 的机制参考 [Node SQLite](https://nodejs.org/api/sqlite.html)，选择以本次固定运行时的实际导出和结果为准。

## SDK 与进程协议

`tests/compat/protocol.cjs` 为本实验固定 protocolVersion=1 的 initialize / shutdown；拒绝未知版本、模式、非法目录和非 loopback URL，不提供任意 SQL / shell / 文件 RPC。它不是已经上线的新产品服务协议，M0.5 仍需整理正式 contracts。

源码 / ASAR 各成功发出两次 mock 请求：一次 **Chat SSE 流**、一次 **Responses 非流式 JSON**。CJS worker 动态加载真实 ESM 包，响应通过 SDK 解析，记录长度 / 版本而不把提示词、正文、密钥或请求体写入报告。Responses SSE、多图、多轮、取消、错误及自定义地址的完整协议矩阵留 M0.4 / M1，真实账户仍全部未验收。

正常关闭要求先看到 stopped 确认，再看到 exit=0。另分别只杀掉源码和 ASAR 场景的父进程，**没有用 taskkill /T 替子进程收尾**，5 秒内均观察到 worker 已退出。实验 worker 有 250ms 父 PID 存在检查；没有假定 parentPort 提供未承诺的 close 事件，见 [parentPort 的公开接口](https://www.electronjs.org/docs/latest/api/parent-port)。PID 复用、通道失效、初始化 / 关闭超时及真正业务请求中断仍须在 M1.1 继续固定，不能把实验退出当作完整服务生命周期已完成。

## strict 前端与实际 ASAR

新增 `phone/tsconfig.json`：strict、noUncheckedIndexedAccess、noEmit，**skipLibCheck=false**。没有 any / ts-ignore 或全仓 TS 迁移。`phone/vite.config.mts` 独立表达构建配置的 ESM 边界，根仍为 CJS；`typecheck:phone` 与 `build:phone` 已存在，`npm run check` 也会执行已创建 phone 的类型检查。

`phone/src/compatibility.tsx` 只验证固定 `useChat` 与 ChatTransport 的消息流 / 状态，消息由 SDK 拥有，未创建第二份可编辑输入草稿。前端实验流在浏览器内合成，没有调用模型。**这个 transport 不代表产品 HTTP/SSE 已接线**；M2 还必须把受鉴权、幂等、序号恢复的产品事件适配到固定 SDK，不能把公共 SSE 直接冒充 SDK 原生协议。参考 [Transport 接口](https://ai-sdk.dev/docs/ai-sdk-ui/transport)。

`test:compat` 实际创建 ASAR，路径含中文、空格和点目录；再复制到**仓库外的独立系统临时目录**执行并清除 NODE_PATH / NODE_OPTIONS，避免缺依赖时回退到工作区 node_modules。SDK 用 require.resolve 定位后通过 pathToFileURL 强制动态加载归档内文件，并断言解析路径确在 ASAR 中。主进程从 archive 的 package.json 启动，静态 phone-dist 由归档内真实文件提供；cwd 特意设为另一个包外数据目录，不靠启动 cwd 或开发机绝对路径定位资源。所有临时目录由本次 mkdtemp 创建，收尾仅删除自有临时副本，原始证据复制回忽略目录。

最终归档包含 13 个生产依赖包，完整 package / license 文件、项目许可与 notices；前端还生成完整 bundled 依赖 `licenses.md` 并检查 React / MIT 文本存在，见 [Vite license 生成说明](https://vite.dev/config/build-options#build-license)。归档中无旧 Python / runtime / 用户测试数据；数据库在包外。这是 **实验 ASAR**，不是已交付的新 NSIS 或 Mac app。

源码和 ASAR 各在 Chromium / WebKit 中完成一次实际 SDK 状态操作，共 4 项浏览器检查：看到两条 SDK 消息、正文、ready 状态，pageerror=0、外部浏览器请求=0。真实渲染见配套 artifacts；这不是物理手机、系统音频或实体键盘验收。

## 失败、警告与复现

- 首次 strict 检查发现 SDK 声明依赖 Buffer / node:http 和 json-schema 类型。已补 Node ambient 与精确 json-schema 类型依赖，保持 strict / 第三方声明检查，不关闭检查绕过。原始失败 `.test-data/node-service-m03/typecheck.log` 保留。
- 首轮浏览器断言使用未命名 status，和 output 的原生 status 角色冲突。已给 SDK 状态明确 accessible name 并按角色 / 名称断言；失败报告与截图分别保留于 `run-UICkdM`、`run-kbfltc`，最终重新执行整套而非累计单项通过。
- Vite 保留 SWR 的 `use client` 指令打包警告。这里是 CSR 静态构建，不宣称 SSR 指令语义已验证；四份实际浏览器检查通过。build.log 未被过滤。

Windows shell：

```sh
npm ci
npm run typecheck:phone
npm run build:phone
npm run test:compat
npm run check
npm test
```

`test:compat` 自行在 `.test-data/node-service-m03/run-*` 创建全新目录、构建前端和实验 ASAR；不启动 Python 或读取真实配置。原始数据、归档、结果和截图留该忽略目录，不自动覆盖 artifacts。最终复验同次通过，53 项离线及语法 / strict 检查通过。此前 M0.2 的旧版 70 项浏览器全套仍是独立记录，不改记成本卡重新跑过。

## 下一项

M0.2 的 5 次真实重启首启按用户选择继续保留 **0 / 5 未测**；不阻止本轮已授权的 M0.3 技术实验。下一项是 **M0.4：冻结旧库 / 分支 / 附件 / 删除密钥 / 提示词 / 浏览器草稿夹具，补齐两条协议矩阵**。M0.5 的正式 contracts、M1 服务与全部迁移 / 回退仍未完成，默认 legacy，Mac 安装包四份产物尚未交付。
