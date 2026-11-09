# M0.5：v1 contracts 初稿与过渡规则

2026-11-08，默认仍为 legacy。本卡交付共享声明、可执行校验、HTTP 草稿清单和契约测试；没有启动 Node 产品服务、切换默认引擎、修改根模块类型或升级 Electron。生产接线从 M1.1 开始。

后续进度：M1.1～M1.5 已在隔离 Node 服务中接线，M1 完成时扩展为 30 类 schema / 26 条 HTTP 路径，并扩展 edit / regenerate、nonce 心跳与缓存缺口恢复。见 [M1 实施记录](node-service-m1.md)。M2 已进一步拆出可供浏览器使用的 `public.cjs` 校验（不含 Node / 进程能力），新增编辑保存、截图、poll 回包与文件元数据 / 旧 ID 受控解析；M2 时为 34 类 schema、30 条 HTTP 路径，只有原显式 POST 创建生成。见 [M2](node-service-m2.md)。下文保留 M0.5 当时的初稿范围和通过数量，不代替当前后端或手机产品验收。

M4 新增独立本地 `migration.cjs` / `.d.ts` 契约与 authenticated binary `GET /legacy/files/:id/content`，当前公开 HTTP 清单 **31 条**，不会创建生成。迁移 / 回退没有手机管理接口；状态 / 报告只允许固定阶段、哈希和计数，拒绝秘密与行载荷。见 [M4 验收](node-service-m4.md)。

- [index.d.ts](../contracts/index.d.ts) 覆盖 RuntimePort、公开状态 / 模型 / 连接目录、密钥修改、会话图、消息部分、附件、草稿、生成快照 / 事件、桌面指令、磁盘消息和进程 / 原生事件。
- [validate.cjs](../contracts/validate.cjs) 使用已锁定的 Zod，严格检查外层字段、版本、枚举、数量、长度、ID、MIME、URL、物理坐标及只允许 JSON 的本机兼容载荷；失败只返回固定 ContractError code/status，不附原始输入或 Zod 错误体。
- [http-v1.json](../contracts/http-v1.json) 固定 22 条 API 草稿、请求 / 响应 schema 名称、成功状态及错误码。只有显式 `POST /chats/:id/messages` 创建生成；请求查询、订阅恢复、草稿和 stop 都不能发起新一轮请求。stage 明确为 draft-not-routed。
- [contract-samples.cjs](../tests/fixtures/contract-samples.cjs) 的全部 24 个正向夹具同时通过运行时校验和 strict JS 声明检查，schema 集与样本集必须一致；另有 TypeScript 的缺失 command、删除密钥仍带值、非终态 finish 等反例。

`npm run test:contracts` 执行 32 项契约检查和 strict 声明检查；`npm run check` 包含 contracts 语法、声明 / 样本与已有 phone strict。`npm test` 同轮 102 项通过，无跳过；包括原有配对 / 网关 / 静默 / 草稿保护等离线回归、M0.3 协议、14 项 SDK 格式矩阵、3 项旧格式和 32 项契约。证据见 contracts-check（本地：`artifacts/node-service-contracts-check.json`）。另重新执行两引擎旧版格式采集与冻结 schema 比对，见 formats-check（本地：`artifacts/node-service-formats-check.json`）。没有把此前 70 项旧 UI 全套记为本轮重跑。

## 已固定的边界

本节为 M0.5 历史初稿；原生行缓冲、握手 / EOF / 超长行和进程清理已在 [M3](node-service-m3.md) 实际接线并补 8 项 Node 边界测试、3 项 Rust 状态测试。原生系统路径与 Mac 未测范围按 M3 记录，不把初稿当作当前实现。

JSON 时间统一 epoch 毫秒，旧版单位见 [M0.4](node-service-formats.md)。manual 提交不能携带 desktop command，desktop 必须携带绑定 receiver 的 id/clientId/context；browserClientId 是草稿归属，随机 clientId 是单页面接收身份，不能互换。浏览器输入不得带 deviceId，主网关从配对鉴权取得它。

图校验拒绝重复 ID、缺失父节点、跨会话节点和环，保留兄弟分支；提交检查 chatVersion、parent 归属和图片可读 ID，原顺序不改变。草稿保存用 expectedRevision，冲突为 409/DRAFT_CONFLICT；失败校验不改传入草稿。

请求身份为内部 deviceId/requestId/commandId/规范化 SHA-256 指纹，重复内容不同为 409/REQUEST_CONFLICT。accepted → requesting → streaming → 终态，requesting 可直接 completed；accepted 可 stopped/failed/interrupted，但不能未请求就 completed。completed/stopped/failed/interrupted 不恢复成进行中。事件验证 chat/generation/message 身份与连续 seq，拒绝终态之后新事件；snapshot 必须对应同一个生成和序号。网络恢复读取现有快照 / `after` 订阅，不自动提交。暂停 / 撤销只断开访问，显式 stop 才中止上游。

keyAction 明确为 keep/set/delete；只有 set 可以带非空 apiKey，空字符串不隐式覆盖或复活删除状态。自定义 baseUrl 允许 HTTP(S) 路径和末尾斜杠，拒绝内嵌用户名 / 密码、query、fragment。公开目录不含密钥。

父子通道固定 protocolVersion=1、initialize/phase/ready/failed/shutdown/stopped、secret-request/secret-response；初始化明确数据目录、只读 legacy 来源、版本、parentPid 和通道内 credential。ready 只报告 127.0.0.1 实际端口。秘密操作仅 get/set/delete + providerId/requestId，成功和失败响应都以 requestId 关联；没有任意路径 / SQL / shell RPC。凭证不属于页面、状态响应或 CLI。测试能力只有 mock-provider / fault-injection，生产入口隔离约束必须在 M1 接线时执行。

原生 JSON Lines 每行上限 1024 字节，必须完整换行，拒绝多行、未知事件 / 版本、非整数 / 非有限坐标，允许多屏负物理坐标；ready 声明 coordinateSpace=physical。Windows DIP 转换只在现有 Node 边界一次完成。这里没有原生程序、行缓冲器或权限成功声明，均属 M3。

本地兼容 JSON / providerOutput 单独保存，有限深度 / 节点数，拒绝函数、非有限数字、循环对象；不把未知兼容字段当 SDK 参数或可执行配置。公开展示只有 text/image/reasoning，用户提交只允许 text/image。当前草稿约定最多 12 图、128 部分、单文本 1,000,000 字符；这些是初稿边界，M1/M2 必须对照原长草稿功能测试，不能因此截断迁移原文。附件 MIME 形状校验不代替 M1 的字节嗅探、尺寸 / 路径和安全展示检查。

## 规则、完成范围和下一项

已复核 AGENTS、spec、architecture、README：固定上游只约束保留的 legacy 适配器；新增 service 使用小型 CJS、phone strict TS + React、原生输入使用预编译 Rust。只有一个 composer 和模型 SDK 边界。截图强制静默、手机主动朗读独立保留；功能、迁移及新增数据后回退通过前保留旧默认，最终包完整验收后才删除 Python / Open WebUI。新增命令和本卡文件已写回 AGENTS / 实施进度。

**类型和校验通过不是业务实现完成。** 原子幂等唯一约束、持久化生成、网关鉴权 / 暂停 / 撤销、单接收页二次校验、stop abort、流订阅恢复和草稿事务还必须在 M1/M2 接入。初始化 / 关闭超时、PID 复用 / 父通道失效和进程崩溃不重放仍属 M1.1；迁移与新增数据后回退属 M4。实验用 tests/compat/protocol.cjs 继续独立保留，不能冒充生产协议接线。

下一项 **M1.1：Runtime 门面、正式 utilityProcess 生命周期与 Node 服务骨架**，按正式 contracts 接线并补边界实测。M0.2 的 5 次真实重启首启仍为 0/5；Mac 两架构、实体手机、Rust 输入驱动和新安装包均未新增通过项。
