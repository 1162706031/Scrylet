# M2 手机页面实施与验收

2026-11-08；当前为未提交工作区。默认继续 legacy，仅显式选择 Node 的隔离目录使用新页面。旧 Python / Open WebUI 与原 UI 保留。

**M2.1～M2.5 已完成 Windows 隔离浏览器范围。** 最终同次 Chromium / WebKit **50/50**，独立测试 ASAR 手机 **12/12**、后端源码 **34 组** / ASAR **33 组**，旧 UI **70/70**、补充旧保存编辑 **2/2**、离线 **119/119**（含 **43 契约**）通过；无 skip / flaky / 自动重试。strict、构建、语法与 M0.3 兼容探针源码 / ASAR 复测均通过。机器汇总：[node-service-m2-check.json](../artifacts/node-service-m2-check.json)。下一项 **M3.1**。

| 任务 | 真实进度 | 证据与限制 | 下一项 |
| --- | --- | --- | --- |
| M2.1 | 已实现，Windows Chromium / WebKit 隔离浏览器通过 | `tests/phone/chat.spec.cjs` 两引擎 2/2；真实 Electron utilityProcess、SQLite、同源网关、Responses / Chat SDK mock 流、多轮、切换模型、显式停止、刷新历史；strict typecheck 与 Vite 构建通过。Markdown / 表格 / 代码 / 本地 KaTeX 字体实际渲染。非物理手机、非最终安装包 | M2.2 |
| M2.2 | 已实现，Windows 两引擎通过 | 单一 composer；上传、静默截图、多屏、Cropper 同尺寸记忆、预览放大 / 翻页、顺序 / 追加撤销、12 张整批上限、处理中 Enter / 换页保护、草稿刷新、旧 inline / uploaded 引用适配、未映射图片阻止发送；全部 M0 会话 / 消息菜单包含实际 JSON / TXT / PDF 下载，slash 提示词只展开不发送。旧库文件映射由 M4 建立；此处只读受控映射，不冒充旧库迁移完成 | M2.3 |
| M2.3 | 已实现，Windows 两引擎通过 | receiver 专项 8/8；单接收页、最近激活页、草稿 / 生成 / 模态 / 后台拒绝、处理中修订变化拒绝、暂停不停止上游、丢 ack 不重放、POST 不确定时只查 receipt、刷新后仍阻止重复提交 | M2.4 |
| M2.4 | 已实现，Windows 浏览器范围通过 | speech 专项 10/10；系统语音模拟验证 opt-in / 新完成回答 / 截图回答、取消、历史不补播、声音 / 语速 / 主动试听 / 缺失音色保留、电脑拒绝；两旧音频 URL 实际取回全零 PCM。Chromium 使用实际 WebAudio 解码；Windows WebKit 无 WebAudio / Notification，实际 PCM WAV 解析和不可用状态单列。未测物理扬声器 | M2.5 |
| M2.5 | 已实现，Windows 两引擎布局专项 8/8 通过 | 实际 320×720 / 390×460 / 390×844、长草稿 / 8 图、VisualViewport 缩小 / 缩放、弹层焦点 / Tab / Esc、模型表单与等待恢复；旧 URL / 草稿保留。视口与键盘使用浏览器模拟，不代表物理手机软键盘。真实渲染截图见下文 | M3.1 |

M2.1 首次类型检查发现 transport 的 `body` 类型和 SDK `error` 与产品提示的重名；已修正并重新检查通过。构建保留 quiet.js 为有意独立的同步脚本，Vite 会提示其不被模块打包；资源由已认证网关本地提供。静态构建当前有大于 500kB 的 chunk 提示，未将构建时间或压缩数字冒充产品启动 / 安装包性能。新渲染依赖锁定在 package-lock；npm 报告现有依赖树 13 项漏洞（4 low / 6 moderate / 3 high），没有自动升级 Electron 或执行破坏性 audit fix。

原始证据：`.test-data/node-service-m2/phone-*/` 与 `.test-data/node-service-m2/results/`。此处仅含合成会话和 mock 密钥；配对凭证不复制到 artifacts。

最终源码结果 `.test-data/node-service-m2/verified-browser.json` / `verified-results/`（153,259.293ms），测试 ASAR `.test-data/node-service-m2/archive-pz1XBG/`；151 份归档项目文件与 staging、151 份 staging 输入与当前源码 / 最新静态构建逐字节一致。后端证据 `.test-data/node-service-m1/run-SRtCfU/`，兼容探针 `.test-data/node-service-m03/run-bFHimq/`。旧 UI `.test-data/node-service-m2/legacy-ui-final/`（404,482.449ms），14 张历史 artifacts 已按备份字节恢复，未覆盖为新证据。上述时长是测试总时长，不是启动性能。

新源码专项分布：基础聊天 2、composer / 历史操作与复制 16、receiver 8、恢复与草稿竞争 / 模型失败 6、语音 10、布局与表单 / 等待 8。两引擎实际下载的 PDF 另用 pdf-lib 重新解析，均为 1 页；JSON 与 TXT 已核对内容。16 张新渲染截图单独存放：

| 页面 | Chromium | WebKit |
| --- | --- | --- |
| 390×844 / 长草稿多图 | [手机页](../artifacts/node-service-m2-phone-chromium.png) | [手机页](../artifacts/node-service-m2-phone-webkit.png) |
| 320×720 | [窄屏](../artifacts/node-service-m2-narrow-chromium.png) | [窄屏](../artifacts/node-service-m2-narrow-webkit.png) |
| 390×460 | [短屏](../artifacts/node-service-m2-short-chromium.png) | [短屏](../artifacts/node-service-m2-short-webkit.png) |
| 框选 | [选区](../artifacts/node-service-m2-crop-chromium.png) | [选区](../artifacts/node-service-m2-crop-webkit.png) |
| 消息分支 | [分支](../artifacts/node-service-m2-branches-chromium.png) | [分支](../artifacts/node-service-m2-branches-webkit.png) |
| 声音设置 | [声音](../artifacts/node-service-m2-voice-chromium.png) | [声音](../artifacts/node-service-m2-voice-webkit.png) |
| 模型设置 | [模型](../artifacts/node-service-m2-models-chromium.png) | [模型](../artifacts/node-service-m2-models-webkit.png) |
| 可恢复等待 | [等待](../artifacts/node-service-m2-waiting-chromium.png) | [等待](../artifacts/node-service-m2-waiting-webkit.png) |

M2.1～M2.4 同次回归 `phone-fourth.log` **32/32**，无跳过 / 重试。旧保存编辑补充对照 `legacy-save-accepted.log` **2/2**，使用独立 legacy 目录，确认保存用户 / 助手文本保留 ID、children 和请求数。之前错误选择器与 range fill、语音分段尚未结束便计数等测试失败保留在原始目录；修正后重跑，未把失败删除或改为 skip。

回归发现并修正的实现问题：WebKit 刷新中轮询取消报访问控制错误（改短请求 keepalive；退出同步保存 pending 缓存）；断订阅丢失活动生成状态 / 停止入口（持有服务端生成 ID 并重新读快照）；AI SDK 7 默认拒绝 messages 中 system 项导致“添加详情”未到达 mock（只在服务端组装的持久祖先 / 产品指令上显式允许，公共提交仍无 system 角色）。编辑保存清除旧 provider output，并更新终态恢复快照；浏览兄弟分支只改变展示，刷新仍恢复保存指针，符合 M0 实际观察。

草稿的 pending 与确认快照分开；保存响应不能覆盖更新后的输入或不确定 receipt。旧 `sessionStorage` 键不删除，未知字段另存原载荷；成功保存全部附件后才写逐来源完成标记。M4 映射尚未建立的旧文件会保留占位与引用并阻止发送，不自动下载外部 URL，也不以文字导入成功代替全量迁移。

M0.2 真实 Windows 重启首启仍为 0/5，按用户选择保留未测。Mac arm64 / x64、物理手机 / 扬声器、迁移后新增数据回退和最终安装包仍未验收。

## 最终实现位置与契约

`App.tsx` 只持有路由、状态轮询和历史入口；`chat/ConversationView.tsx` 显示当前 SDK 对话与唯一 composer，`HistoryPanel.tsx` 管理历史菜单。`useConversation.ts` 持有真实 AI SDK `Chat`，transport 把持久事件转成 SDK chunk；消息正文和流状态没有第二套 reducer。`useComposer.ts` 独占输入 / 附件、epoch / revision、处理数、保存与不确定发送身份；`legacyDraft.ts` 只读旧 sessionStorage 和受控文件映射。`attachments/Capture.tsx` 按需加载 Cropper，本地 JPEG 处理由 `images.ts` 执行。

`capture/desktopReceiver.ts` 每页随机 clientId，持久 browserClientId 仅作草稿归属。接收、手工发送和编辑重发进入同一个提交函数；API 返回 202 之后才清草稿 / ack，丢确认不重新 POST。`audio/ReadAloud.tsx` 复用旧正文 / 分段 / 声音选择纯函数，只消费本次实际接受生成的开始与完成信号；重新订阅和读历史不朗读。旧 DOM 控件未在新页实例化。

`contracts/public.cjs` 可直接用于浏览器，不暴露进程 / 秘密通道；Node-only 校验保留在 `validate.cjs`。新增 `messagePatch`、`captureRequest` / `capture`、`desktopPollResult`，并固定 `regenerationStyle` 仅用于 regenerate；当前 34 类 schema / 30 条路由。编辑保存、文件 meta / legacy ID 映射由 service 执行并由真实 HTTP / SQLite 检查固定；缺旧映射返回 MIGRATION_FAILED，不尝试读旧用户目录或自动下载 URL。

新页面与字体 / Markdown / 公式 / 裁剪 / PDF 资源全部在本地构建，`electron-builder.cjs` 映射到 `phone-dist`；`dist:win` 在现有 Python 准备前加入 strict / build，不改变默认运行层或安装身份。实际测试 ASAR 包含 `phone-dist/licenses.md`，源码输入和归档资源逐字节审计。这不是最终 NSIS / DMG / ZIP 验收，也不是安装包体积结果。

PDF 使用所选会话的独立只读渲染文档，包含中文 / 公式和选中分支，实际下载可解析的 PDF；JSON 保留所有分支图和兼容字段，TXT / PDF 是选中分支导出。此导出不等于 M4 全库备份 / 回退。分享入口只复制已配对 LAN 会话地址，没有新增公开发布或绕过鉴权。

## 功能对照

| 范围 | 新入口 / 检查 |
| --- | --- |
| F09～F11 | 图片按钮、屏幕选择、框选、顺序预览 / 缩放 / 删除 / 清空 / 追加撤销；异步结果不能跨对话，失败保留输入 |
| F16～F18 | receiver 随机单页身份、最近激活、草稿 / 生成 / 模态 / 隐藏拒绝、修订检查、确定接受后 ack、不确定不重放 |
| F19～F23 / F21.01～14 | 流 / Markdown / 数学 / 表格 / 代码；用户与助手编辑保存、编辑重发 / 重答分支、临时分支浏览、消息删除、停止；历史搜索、重命名、置顶 / 取消、未读 / 全读、归档 / 恢复、克隆、LAN 分享、JSON / TXT / PDF、顶部和消息复制、代码复制 / 保存 / 折叠、历史分组折叠；没有新增原来未证实的管理导入页 |
| F24～F28 | 同源模型目录与既有模型表单；空密钥保留 / 显式移除；slash 种子；原 URL / 草稿恢复、断连保留活动生成、提供商失败不重试；窄屏 / 视口 / 弹层 |
| F29～F32 | 手机 opt-in 朗读 / 停读 / 声音 / 速度 / 主动试听；历史不补播、后台 / 导航取消、电脑拒绝、旧音频 URL 全零 PCM |
| F35 浏览器部分 | 旧草稿原键与未知字段保留；只有全部附件确认保存才标记完成。完整旧库迁移、不同 origin 和新增数据后回退属于 M4 |

## 保留的失败与限制

独立 ASAR 首次新增逐字节检查遇到 Windows 路径分隔符，已统一 ASAR 原生路径并排除测试目录中的 Python 字节码，未删除仓库 / 用户目录。新增成功导入测试使用的一张早期合成 PNG CRC 无效，WebKit 实际拒绝解码，迁移保持未完成且原文 / 图片引用保留；修复合成夹具后两引擎通过，不改成忽略损坏图片。多标签测试先前把任意已 ready 的 receiver 当成当前选中页，已改为从该页真实 poll 取 clientId，并等待该 ID 成为 selected / ready；六次重复检查通过。原失败日志 / trace 保留在 `.test-data/node-service-m2/`。

剪贴板受限时尝试选区复制，仍被拒绝则显示可长按复制的提示；专项用隔离浏览器剪贴板替身验证，未改用户系统剪贴板。音色优选仅为名称 / 语言启发式，不保证系统音质。性能 / 内存 / 最终包体尚未测量，不用 Vite 构建时间或测试 ASAR 数字替代。
