# M1：真实 Node 服务实施记录

2026-11-08。M1.1～M1.5 已完成 Windows 后端范围；最终源码 / 独立 ASAR、115 项离线和 70 项旧 UI 回归通过。保持既有工作区改动、固定 Electron 44.8.0 和 legacy 默认。Node 对照入口要求显式独立数据目录，不读取真实旧库、不使用真实模型账户。

## M1.1 已完成

旧实现移至 desktop/legacy-runtime.cjs，runtime.cjs 保持兼容导出并选择运行层，旧 request 覆写测试继续可用。新增 node-runtime、service/main、内部鉴权 HTTP、存储 schema 与资源路径。数据仅在 userData/chat-node/v1，随机凭证只走父子通道；IPC 校验已接线，秘密通过主进程 safeStorage 加密，拒绝明文后备。

生命周期有初始化 / 关闭超时，父 PID 检查加通道 nonce ping/pong；失去通道即使 PID 仍活着也不能维持服务。正常退出确认 stopped 和 exit，崩溃不自动重启请求。新增 SQL / CJS 资源进入打包清单，没有删除旧 Python。单写者使用独立 SQLite EXCLUSIVE 租约，进程死亡由 OS 释放，不依赖易受 PID 复用影响的锁文件。

Windows x64 的真实 Electron / utilityProcess / OS 加密写入、重新读取、删除、退出端口释放、只杀父进程后子进程退出通过，原始证据 `.test-data/node-service-m1/run-cKiPiG/`。5 项离线生命周期检查通过，含 fake clock 超时、协议不匹配、通道失效 / stale nonce 和关闭强杀。不是 Mac Keychain 或安装升级验收。下一项 M1.2。

## M1.2 已完成

新增 chats / files / prompts 事务和带校验和的 schema 逐版本升级；v2 固定消息顺序和一次性提示词种子标记。会话图使用同会话延迟外键，保留重答兄弟分支；当前分支、置顶 / 归档 / 已读、克隆、删除和版本冲突有存储边界。单消息删除核对固定上游源码后按“删除该节点及直接子节点、重接孙节点”实现，不能用删整会话替代。旧版 GUI 操作仍属后续对照，不以源码核对冒充触摸验收。

文件以随机 ID 受控路径保存，检查字节类型 / 头部尺寸 / 上限与声明 MIME，读取核对字节哈希，不采用用户文件名拼路径；新上传拒绝主动 SVG，历史原文 / 外链 / SVG 的迁移处理留 M4。草稿按鉴权设备 + browserClientId 隔离并用 revision 事务更新，消息 / 草稿都保留文件引用。提示词一次性 seed，不覆盖编辑，也不复活删除的种子。

固定 Electron 实际检查 WAL、外键、跨进程单写者租约、备份读回、schema 升级与校验和篡改拒绝、图 / 图片次序 / 缺图 / 回滚、重复 domain 导入、分支切换、旧版本写入冲突、草稿归属与重启、提示词和管理字段。7 组存储检查通过，证据 `.test-data/node-service-m1/run-9cExsz/`；另 40 项相关离线检查通过。domain importGraph 不是 M4 的旧库导入或新增数据后回退验收。下一项 M1.3。

## M1.3 已完成

新增按需 ESM SDK 工厂、公开模型 / 连接目录与保存接口，按保存的协议构造 Responses 或 Chat compatible，不按厂商猜测原生协议。内部模型 ID 与上游模型 ID 显式映射，自定义前缀 / 末尾斜杠通过 mock；startup / 保存 / availableModels 均不发模型请求。maxRetries 固定 0，禁止重定向，不使用 SDK 默认 Gateway。

密钥用独立版本化引用经主进程 OS 加密，设置失败不覆盖旧连接，删除先持久化停用与 tombstone，再处理加密值删除；未完成删除保留队列用于重启重试。新服务不读环境 key 或旧目录 seed。公开目录只返回配置状态，不能代表账户有效或真实模型验收。

Windows 真实 SDK 的两协议 JSON / SSE、多图字节 / 历史 / 上游 ID、自定义地址、429 / 不确定断链 / 取消、keep / delete / 不复活 / 无明文检查通过；正式 utilityProcess 经 secret-request/response 保存、读取目录、删除及 availableModels 通过。原始证据 `.test-data/node-service-m1/run-8gwZTd/`。没有使用真实账户；Mac / 安装升级未测。下一项 M1.4。

## M1.4 已完成

接受记录、用户 / 回答节点、chatVersion、requestId / commandId 指纹和 begin 在同一事务提交，随后才启动 SDK。当前会话以数据库唯一索引限制一个活动生成；重复接受先查持久收据，正文冲突 409，删除聊天后收据仍能阻止旧请求重放。编辑发送新增用户兄弟节点，重答只新增回答节点；新增 action / targetMessageId 契约避免把重答错误地实现成重复用户节点。

增量按 50ms / 256 字符批量持久化，终态刷新；保存 SDK 协议输出并用于后续同协议上下文。实际多轮测试发现 Responses 默认 store=true 会把本机历史替成远端 item_reference，已显式 store=false，保留可回放 metadata / reasoning 数据；模型 ID 始终由 provider 前缀与原样上游 ID 组合，保存的 modelIds 不猜测 / 剥离字面点号。

订阅与模型任务独立，事件序号连续、缓存有界，缺缓存返回现有 snapshot；不重新生成。显式 stop abort，上游断开；服务关闭 / 崩溃使用 interrupted，保留最后可靠内容，不伪装 completed 或 stopped。初始化恢复只标记未完成记录，不调用模型。

Windows 的实际 HTTP 并发去重、五节点编辑 / 重答图、两协议上下文、断订阅继续 / 显式停止、错误 / 不确定发送不重放、command 唯一、缓存缺口快照与删除后收据通过。另在正式 utilityProcess 中实际上传 / 读取文件、流式 Responses、杀服务后重启、OS 租约释放、部分内容保留、不重放与正常关闭 interrupted 通过。证据 `.test-data/node-service-m1/run-npbuiz/`。首次并发测试错误假定返回顺序、Responses 远端引用导致的失败保留于此前 run 目录；未改成模型重试。下一项 M1.5。

## M1.5 已完成（Windows 后端范围）

网关按 contracts/http-v1.json 的方法 / 路径白名单转发，未知上游管理接口、内部 health 和 WebSocket 不对手机开放；服务继续仅绑定 loopback 且要求随机凭证。转发重新构造内部 Authorization 与设备身份，浏览器伪造的内部 / forwarded / 上游身份头不能穿透。请求查询限制到实际鉴权设备，历史和文件继续为本机配对设备共享；草稿按设备 / 浏览器隔离。

已接文件字节、SSE 和快照 / after 恢复，不使用普通 JSON 缓冲 / 短请求超时代替事件流。暂停 / 撤销关闭对应手机连接，但不停止 SDK；恢复读取原生成，显式 stop 才 abort。available-models 改走 Runtime.availableModels，Node 不再调用旧 /api/models；旧模型配置页面可继续使用原字段，空 key 保留、remove 删除，内部转为明确 keyAction / revision。

电脑提交再次调用同一个 CaptureDelivery.validate，再核对单页 clientId / context / 活跃时效；拒绝另一页、旧上下文、既有草稿、生成冲突和已失效命令。命令已派发后，处理本命令图片的 busy 仅在 activeCommandId 匹配时允许；不能以 busy 绕过既有草稿。保留旧 ready 轮询的空 reason 与 legacy ack 形状；新 React composer 的 epoch / revision 与前台临提交保护仍必须在 M2.3 完成，不能把 HTTP 检查冒充手机页面验收。

Windows 实际检查未配对 401、跨站 / Host / 无写标识 403、暂停 423、未就绪 503、未知路径拒绝、设备头伪造、文件往返、草稿修订、配置页面适配、SSE 暂停 / 撤销不终止上游、单接收页 / context / draft / busy 和 ack 后不重发。首次 Host 用例的 fetch 没有按测试意图覆盖 Host，已改用真实 node:http 请求确认 403，失败记录保留。

阶段证据 `.test-data/node-service-m1/run-Zh3OjB/`；随后源码和仓库外中文 / 空格路径中的独立 ASAR 均完成同一套正式服务检查，包含 SQLite schema、动态 ESM SDK、秘密通道、生成 / 崩溃恢复、网关与退出。ASAR 是含合成测试夹具的验收归档，不是可发布的应用 / 安装包，不把它的字节数当最终包体结果。旧默认仍为 legacy，Node 仅通过显式独立 SNAP_DATA_DIR / SNAP_RUNTIME_ENGINE=node 启用；手机产品页仍待 M2。

## 复现与后续门槛

- `npm run check`：现有 JS / CJS 语法、catalog、phone strict 与 contracts 声明 / 正向样本检查。
- `npm test`：已有离线回归、M0 协议与固定格式、新生命周期 / 恢复契约。
- `npm run test:service -- --asar`：源码正式 utilityProcess + 仓库外测试 ASAR，同一套真实存储 / SDK mock / HTTP / SSE / gateway 检查；原始数据仅在本次创建的忽略目录或自有 OS 临时目录。
- `npm run test:ui`：旧默认实际浏览器回归。既有 artifacts 截图必须先备份，只将本轮截图留到隔离证据目录，再恢复原字节；本轮不发布含测试配对信息的截图。

公开阶段汇总见 artifacts/node-service-m1-check.json，逐卡早期证据不替代最终同轮结果。没有操作真实账户；所有远程模型请求使用 loopback mock，未安装额外 Node、未升级 Electron、未改变根模块类型。新增服务 / SQL / contracts 资源已加入 builder，未删除旧 Python / Open WebUI / Python 输入驱动。

下一项 M2.1：真正的 React 手机入口与 SDK transport。旧库完整导入 / 原浏览器草稿升级和新增数据后回退属于 M4；F21 导出 / 编辑保存 / 全部菜单的 GUI 对照继续属于 M2 / M4，不把本轮存储或源码对照当作全部入口已验收。Rust 输入与 Mac 两架构 DMG / ZIP 属于 M3～M5。Mac / Keychain、实体手机、最终安装 / 覆盖升级均未测；M0.2 的真实重启首启仍为 0/5。


## 最终同轮证据（2026-11-08）

源码 + 仓库外独立 ASAR：`.test-data/node-service-m1/run-CPPioi/`。源码 31 组集成检查、归档 30 组通过（归档组数不包含仅在源码驱动中执行的只杀父进程检查），均使用实际固定 Electron / 内置 Node / SQLite 和 loopback mock。独立归档清除 NODE_PATH / NODE_OPTIONS，cwd 与应用资源路径分开，动态 SDK 入口断言来自 ASAR；SQL、生产依赖、公开许可与 app 资源可读。测试归档不含 Python 源文件或解释器，仓库和默认发行配置中的旧资源仍保留到 M5。

`npm test` 最终 115 项通过、0 失败 / 跳过，含 39 项契约与 6 项生命周期检查；`npm run check` 通过。旧默认 Chromium / WebKit 全套 70 项通过、0 flaky / 跳过，361,717.063ms；报告 `.test-data/node-service-m1/legacy-ui-4Di99u/report.json`。14 份原 artifacts 截图逐字节恢复，本轮截图只留在该隔离目录。没有以旧截图或旧测试次数冒充本轮结果。

| 卡片 | 关联功能 | 已验证的层次 / 保留边界 |
| --- | --- | --- |
| M1.1 | F01、F02、F08、F33、F36 | 正式服务状态 / 退出、窄秘密通道与资源路径；本轮没有新原生截图 / Mac / 安装器通过声明 |
| M1.2 | F10、F19、F21、F23、F26、F35 | 关系 / 事务 / 字节 / 草稿 / 种子与 domain 幂等；旧库转换和新增数据后回退仍 M4 |
| M1.3 | F19、F24～F26 | 本地目录、真实 SDK 双协议和加密秘密保存 / 删除；真实提供商账户未测 |
| M1.4 | F19～F21、F23、F29 | 持久接受 / 去重 / 状态 / 分支 / 恢复 / stop；F29 仅固定不会伪造完成 / 重放，React 朗读接线待 M2 |
| M1.5 | F03～F07、F16～F18、F25、F28、F32 | 实际 HTTP / SSE / 身份 / 暂停撤销 / receiver 校验；原生输入和物理手机并未新增验收 |

补充：缓存缺口用 validateRecovery 校验可向前跳的同生成快照，普通事件仍要求连续 seq；终态不能回到进行中。显式取消等待有界，异常退出未观察到时报告未确认，不把强杀请求本身当作确认成功。OS 加密拒绝的检查是可控故障注入，不能当作实际被拒绝权限通过。归档字节仅记录测试资源定位，不用作 NSIS / Mac 包体、启动或内存性能结果。
