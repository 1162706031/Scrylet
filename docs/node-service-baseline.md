# Node 重构：旧版实际基线

记录日期：2026-11-07。任务 **M0.1 完成入口与证据登记**；后续 M0.2 的分段计时与 10 次常规启动已实测、5 次真实系统重启待验收，见 [启动基线](node-service-startup.md)。这里记录旧版可复现行为，不代表新版已经实现或验证。入口基线为 `d00f40fe17434576127dd7343ba11aed8f3bab73`，版本 `2.0.0-dev.6`；M0.1 开始时工作区干净，M0.2 保留了这些未提交改动。M0.1 当时默认运行层为 Open WebUI 0.12.2 / Python，尚未新增业务 Node 服务或 phone 前端；后续实施进度以 [实施手册](node-service-implementation.md#12-当前进度与可复制任务模板) 为准，不能把本基线当作当前实现状态。

脱敏汇总：[node-service-baseline-check.json](../artifacts/node-service-baseline-check.json)。真实隔离渲染：[会话菜单](../artifacts/node-service-baseline-menu.png)、[编辑后的分支](../artifacts/node-service-baseline-branches.png)。只有模拟聊天内容，未重新提交原生桌面的二维码 / 屏幕截图。

## 环境和证据口径

- 编排环境为 WSL2 Linux x86_64；通过 Windows `node.exe` 执行，实际 `process.platform=win32`、`arch=x64`，Windows 11 Pro `10.0.26200`。开发 Node 22.14.0，Electron 44.8.0，Playwright 1.64.1，Python 3.12.16。M0.1 当轮未核验内置 Node / SQLite；后续 [M0.3](node-service-compatibility.md) 已实测 Node 24.22.0 / SQLite 3.53.4。
- 设备为 AMD Ryzen 7 7800X3D、16 个逻辑处理器、33,405,857,792 字节内存。没有把重复进程启动称作系统冷启动；M0.1 当轮未计时，后续 M0.2 原始测量见独立启动文档，旧包体预查见文末。
- 所有模型请求只到 `tests/fixture.cjs` 的 loopback mock。夹具屏蔽目录内各厂商环境密钥，只读来源设为不存在的隔离目录；没有读取真实用户数据库、密钥、配对或浏览器数据。浏览器截图使用合成题图，原生截图只记录成功与尺寸。
- 原始日志、JSON、trace 和合成数据保存在忽略的 `.test-data/node-service-m0/` 与 `.test-data/node-service-baseline/`。原有 `artifacts/` 历史截图在复测后保留原内容，不把覆盖后的图片继续当历史证据。
- Windows 浏览器和原生桌面结果不代表实体手机、物理键鼠、多屏混合缩放或 macOS。未运行 Mac，两架构安装包 / Keychain / 安装验收仍为未测。

## M0.1 当轮执行（历史记录）

| 检查 | 结果 | 原始证据 / 边界 |
| --- | --- | --- |
| `npm run check` 对应的 `node scripts/check.cjs` | 通过 | `node-service-m0/check.log`；使用 Windows Node |
| `npm test` 对应的 `node --test tests/*.test.cjs` | 47 / 47 通过，无跳过 | `node-service-m0/unit.log`，1,047.1682ms；不能代替原生系统输入 |
| `npm run test:ui`，指定独立输出及 JSON reporter | 70 / 70 同次通过，无跳过、重试或 flaky | `node-service-m0/ui.json`，349,415.031ms；Chromium / WebKit 各 35 项，真实固定上游与 mock provider |
| `npm run test:desktop` 原入口 | 首次失败 | `node-service-m0/desktop.log`；IDE 继承 `ELECTRON_RUN_AS_NODE` 导致 Electron launch 失败，没有记作通过 |
| 同入口，仅在验收子进程移除 `ELECTRON_RUN_AS_NODE` | 通过 | `node-service-m0/desktop-without-run-as-node.log`、`desktop-native-check.json`；权限 granted，真实 2560×1440，关窗后 visible=false / destroyed=false |
| 新增 `npm run test:baseline` | Chromium / WebKit 同次 8 / 8 通过，无跳过或重试 | `node-service-m0/baseline-verified.json`，73,568.571ms；专用配置和 `tests/baseline/legacy.spec.cjs`。首轮中断及失败 trace 保留，与上述 70 项独立记账 |
| 系统长按 / 热键、维护、原生 LAN 网卡、安装升级 | 本轮未重跑 | 旧证据按下表引用；不转记成本轮通过 |
| Node 迁移、回退、性能、Mac / 实体手机 | 未实施或未测 | 后续阶段门槛保持阻断 |

复现使用已安装的 Windows 运行环境（在 Windows shell 可直接用 npm 命令）；WSL shell 用 `'/mnt/c/Program Files/nodejs/node.exe'` 调用相同脚本。不要在此环境盲目执行 Linux `npm ci` 覆盖现有 Windows `node_modules` / Python runtime。

## F01～F36 入口与保留矩阵

“本次”仅表示本节所列测试覆盖部分；任何一行都不代表新版完成。更早通过记录见 [verification.md](verification.md)，不与本次通过混算。

| 编号 | 旧版入口 / 实现 | 本次证据与尚未覆盖范围 |
| --- | --- | --- |
| F01 | `desktop/ui/` 连接状态、二维码、权限、设置 | 原生桌面启动 / 状态通过；最小窗口和设备 UI 沿用 11-06 记录 |
| F02 | `main.cjs` 关窗 / 托盘 / 退出 | 原生关窗驻留通过；异常杀进程、孤儿进程专项本次未测 |
| F03 | `web/pair.*` 扫码 / 连接码 / 明确提交 | 配对单元与两引擎全角 / 分隔输入通过；实体手机扫码未测 |
| F04 | `pairing.cjs` 设备与撤销 | 单元与浏览器撤销通过；8 台上限仍存在，使用隔离设备 |
| F05 | 桌面暂停、网关断连 / 恢复 | 桌面与浏览器暂停 / 等待恢复通过；暂停中后台生成继续完成需独立强化契约，不以 stop 结果代替 |
| F06 | 桌面网卡选择 / `network.json` | 4 项网络单元通过；本轮未重做真实 LAN，旧证据 `network-packaged-check.json` |
| F07 | 网关端口、二维码与地址快照 | 网关 / 网络单元通过；显式冲突路径保留 |
| F08 | Scrylet 名称 / `brand.cjs` / 原安装身份 | 3 项品牌单元及 4 项浏览器品牌检查通过；旧目录未移动 |
| F09 | 手机截屏 / 框选 / 显示器 / 手机图片 | 两引擎图文集成通过；模拟多屏，未验真实双屏 |
| F10 | 输入区编号、预览、删除、清空、10 秒撤销 | 附件整理与顺序 / 超限整批拒绝通过；新实现仍须保持 12 张 |
| F11 | `composer.js` 图片处理、路由代次、发送拦截 | 两引擎处理中按钮 / Enter 及换对话拒绝通过 |
| F12 | `native.cjs` 最长边、DIP / 像素、跨屏限制 | 本次真实全屏 2560×1440；区域 / 150% 缩放沿用旧 `desktop-input-check.json`，负坐标本次只有单元 |
| F13 | 桌面按钮、托盘、全局全屏 / 区域热键 | 快捷键设置回滚单元通过；本轮未重跑系统热键 |
| F14 | Windows 两角长按、按键、超时 / Esc、双击 | 手势单元通过；Python observer 及 `tests/windows-input.py` 仍在，M3 必须同时迁移 |
| F15 | 截图设置保存与热键冲突 | 设置回滚单元通过；本轮无真实冲突注入 |
| F16 | `desktop-capture.js` 单接收页 | 交付单元与两引擎草稿 / 生成中 / 切换拒绝通过；前台页选择语义不变 |
| F17 | 指令 poll / validate / ack → 同一原生输入 | 两引擎只交付一次与默认提示词通过；不确定确认不能自动重发 |
| F18 | 强制静默、`quiet.js`、原生静音 | 单元、静默参数与真实后台播放器 / 全零音频通过；本轮未重做系统反馈计数或录音 |
| F19 | 原生聊天输入、多轮、流、模型选择 | 两引擎流、图文上下文和切换模型通过；仅本地 mock |
| F20 | 停止、编辑、重答 | 停止专项观察 mock 连接提前关闭通过；编辑后发送 / 重试从两节点到三 / 五节点，旧节点保留 |
| F21 | 侧栏历史 / 搜索 / 会话菜单、消息操作 | 逐项见下节；不能只按 `scope.js` 声明推断实际隐藏 |
| F22 | 回答 Markdown / KaTeX / 代码与复制、展开、最新回复 | 两引擎公式与代码显示通过；表格 / 链接安全与全部复制、滚动操作本轮未完整专项 |
| F23 | 上游 sessionStorage 草稿及原生图片引用 | 原有两引擎文字 + 两图刷新恢复通过；补充两引擎不同会话草稿 / 刷新 / 新对话 / 返回原会话通过，见下节 |
| F24 | `config/providers.json` 6 家 / 16 模型 | Chat 与 Responses 的现有 mock 测试通过；真实账户及完整 SDK 路径尚未验证 |
| F25 | `/snap/models` 表单、地址、保存 / 删除密钥 | 两引擎保存、空密钥保留、不回显、不额外调用模型通过；删除后的跨引擎迁移留 M0.4 / M4 |
| F26 | 无密钥配置、`/snap-…`、只读旧种子 | 无密钥入口、提示词初始化通过；删除密钥不复活 / 修改提示词夹具留 M0.4 |
| F27 | 320px、390×460、VisualViewport、长输入、多图 | 两引擎既有布局与弹层专项通过；实体手机软键盘和扬声器未测 |
| F28 | 启动 / 权限 / 暂停 / 断连 / 模型失败等待页 | 两引擎状态与原 URL 恢复通过；所有新 API 仍须结构化错误 |
| F29 | 手机“朗读关 / 开”，新完成事件 | 朗读专项通过；SpeechSynthesis 模拟，未测物理扬声器 |
| F30 | 停读、关开关、后台 / 导航 / 新生成取消 | 单元正文分段与两引擎取消 / 不补播通过 |
| F31 | 手机“声音”面板、音色、语速、主动试听 | 5 项单元和两引擎音色延迟 / 回退 / 试听通过；实际系统音色质量未测 |
| F32 | 电脑拒绝语音、全零提示音、旧页防护 | 电脑 UA / 不可信试听与实际 PCM / 原生播放器检查通过；默认继续静默 |
| F33 | 桌面日志、异常筛选、刷新、轮换 | 日志白名单、轮换与重启单元通过；原生面板本轮未重跑 |
| F34 | 桌面缓存清理 | 并发拒绝、数据保留、失败重试单元通过；安装版保留旧证据 |
| F35 | 原数据目录、历史 / 分支 / 附件 / 密钥等迁移 | 旧目录选择单元通过；Node 导入、校验、中断恢复与新增数据后回退尚未实现 |
| F36 | NSIS、资源审计、独立安装 / 卸载保留数据 | 本轮未构建 / 安装；旧 Windows 包见 `scrylet-installer-check.json`；Mac 四份产物尚不存在 |

## F21 扩充入口清单与验收边界

已打开隔离旧版侧栏菜单和顶部“对话操作”。侧栏用普通 `button` 而非 `role=menuitem`，因此 `scope.js` 对分享 / 克隆的菜单裁剪未匹配；不能把设计的隐藏项当成实际不可达。先登记实际入口，不授权新增原先未开放的工具、云端业务或公开发布。

| 子项 | 当前观察 | 后续保留 / 验证要求 |
| --- | --- | --- |
| F21.01 | 侧栏“新对话”、历史 `/c/:id` 可达 | 同 URL 映射、已保存草稿和当前模型 |
| F21.02 | 侧栏“搜索”可用，已输入新标题并读到结果 | 空结果、快捷入口另列未测 |
| F21.03 | 侧栏“重命名”进入行内 `chat-title-input-<id>`，Enter 后存储 title 更新 | 新版保留明确确认动作 |
| F21.04 | “置顶 / 取消置顶”均可操作，存储 pinned 实际改变 | 排序、进程重启恢复另列专项 |
| F21.05 | “标记为未读”入口 | unread / 最后阅读信息不能静默丢掉 |
| F21.06 | “下载”有 JSON / TXT / PDF 三个入口；JSON 实际下载为会话记录数组，包含 chat 图、顶层指针、归档 / 置顶等兼容字段 | JSON 已解析并核对会话 ID；TXT / PDF 实际输出未测；顶部菜单也有下载 |
| F21.07 | 归档写入 archived=true；删除有确认对话框，确认后历史行消失 | 归档恢复入口、生成中删除规则尚未专项 |
| F21.08 | 侧栏“克隆”实际生成不同 ID、保留两节点图，不发起模型请求 | 附图 / 多分支克隆留 M0.4 夹具，不能按隐藏规则删掉克隆入口 |
| F21.09 | 侧栏“分享”能打开“分享对话”对话框 | 尚未创建分享链接或向外部发布；确认可达能力与网关限制，不能据上游功能猜成功 |
| F21.10 | 顶部“复制”和消息“复制”、代码“保存 / 复制 / 折叠” | 分别核对可见入口与下载 / clipboard 行为 |
| F21.11 | 用户 / 助手消息“编辑”；“重新生成”先开重试 / 添加详情 / 精炼表达菜单 | 用户编辑有保存 / 取消 / 发送三条路径；发送和重试新增分支，保留旧节点。用户编辑的 hover-reveal 在纯触摸复查中曾被拦截，基线走聚焦后点击；不能把这说成实体手机入口通过 |
| F21.12 | 用户菜单被 `.snap-unused` 隐藏；已核对手机主界面、侧栏会话菜单、顶部菜单、“更多”与分组折叠，未发现导入入口 | 不据此声称任意 URL / 键盘设置捷径都不可达；用户设置内导入 / 全量导出没有实际入口证据，未计为已提供 |
| F21.13 | 出现分支后，用户和助手消息有删除按钮，上一条 / 下一条消息可切换分支 | 消息删除入口要保留并补独立契约；不能只提供删除整个会话。此轮未执行消息删除动作 |
| F21.14 | 侧栏“更多”提供标记全部已读，“对话”折叠 / 展开会话分组 | 克隆不调用模型；克隆、归档状态与折叠已加入补充基线；不是一个推测的过滤菜单 |

本清单登记本次已核对的可见入口；操作完成与仅观察入口分开记录。后续若发现其他当前可达操作继续追加，不能因为此轮没有业务断言就删除它们。

### 分支选择的真实优先级

固定 wheel loader 明确先读取 `chat.history`，若会话顶层 `current_message_id` 在消息图中有效，则覆盖内嵌 `history.currentId`。隔离交互进一步确认：编辑后发送产生新分支，再点“上一条消息”可以显示旧分支，但**单纯浏览兄弟分支不会立即改变已保存指针**，顶层和内嵌指针都仍指向编辑后的分支。第一版测试把展示切换当作已落盘而失败，记录保留；不能据此声称顶层指针已变而内嵌未变。新迁移必须保留两字段与原始载荷，按固定 loader 恢复实际已保存的当前分支；优先级不同值夹具留给 M0.4。不能猜测线性 messages 数组最后一条就是当前节点，也不能把旧版未保存的瞬时选择当成已经可靠保存。

## F23 草稿实际格式

固定 wheel 的 `frontend/_app/immutable/chunks/7VCM_nZw.js` 只读源码与原有草稿刷新测试共同确认：

- 使用 **sessionStorage**，不是只看 localStorage 或电脑数据库。新会话键 `chat-input`，已有会话键 `chat-input-<chatId>`；500ms 防抖，保存完成后才具有刷新恢复保证。
- 草稿包含 `prompt`、`files`、`selectedToolIds`、`selectedSkillIds`、`selectedFilterIds`、`webSearchEnabled`、`imageGenerationEnabled`、`codeInterpreterEnabled`。未知 / 当前关闭能力字段保留为兼容数据，不因此启用相应能力。
- 新对话初始化读取通用 `chat-input`；已有会话导航读取对应 ID 键。`sessionStorage.selectedModels` 是另一个模型选择中转字段。新对话是否携带当前草稿以新增交互测试为准，不能假设新对话清空草稿。
- 本次隔离交互已核对：发送建立历史会话后，再保存该会话的文字 + 图片，点击可见的侧栏新对话会打开空输入区；回到原会话恢复它自己的文字 + 图片。不得把这推成“所有新对话操作都会清空所有草稿”。
- 已完成上传的截图附件在 `files` 中是 `type=file` 的记录，包含 `id/url`（此形态下 url 是文件 ID）、`file` 元数据、`itemId`、`name`、`status=uploaded`、`size`、`error`、`content_type`。内层元数据包含 MIME、字节数、`file_hash`，created_at / updated_at 为秒。其他附件形态留给 M0.4 完整冻结；不能按“url 一定是可直接 fetch 的绝对地址”迁移。
- `snap.readAloud`、`snap.speechVoice`、`snap.speechRate`、`snap.display` 和 `snap.crop.<displayId>` 保留原含义。旧 `token` 是上游本地鉴权，不是模型密钥，不能拿它作为新服务凭证或写入公开夹具。
- 同 origin 升级必须在 React 接管前读取旧 sessionStorage；IP / 端口更换不能跨 origin 自动读取。新库必须保存历史和草稿图片字节，而非只保留可能失效的 blob URL。

## M0.2 只读包体预查（M0.1 交接时）

对已有 `dist/` 做原生 Windows Node 文件统计，并重新计算安装包 SHA-256；未重新构建、安装或发布。原始结果为 `node-service-m0/package-sizes-windows.json`，不是 Node 版目标包体，更不能用作 Mac 结果。

| 旧产物 | 字节 | 文件数 |
| --- | ---: | ---: |
| `Scrylet-2.0.0-dev.6-win-x64-Setup.exe` | 308,753,932 | 1 |
| `win-unpacked/` | 946,046,039 | 23,606 |
| `resources/python/` | 555,858,509 | 23,527 |
| 其余资源（含 app.asar） | 390,187,530 | 79 |
| `resources/app.asar` | 3,903,762 | 1，已包含在其余资源内 |

安装包 SHA-256：`13bbf529f3f0bb34165aaab6b85934398477f91a3df0138607d9feaa7aec7d55`，与旧记录一致。WSL Python 首次统计用了宿主不支持的 pathlib API 而失败，后改用原生 Windows Node 完成，Linux 兼容重测也保留原始结果。此处保留交接时的只读统计；后续 M0.2 已加入计时与 10 次完整退出启动，结果见 [启动基线](node-service-startup.md)，5 次真实重启仍为未测。

## 下一项与发布门槛

M0.1 已登记 F01～F36、14 项 F21 扩充入口及已测 / 失败 / 未测边界；补充套件同次 8 项通过。M0.2 的 5 次系统重启首启按用户选择继续保留未测，常规计时已完成；M0.3 的 Windows 技术实验已通过，下一项 M0.4 冻结完整旧格式与协议。M0.5 contracts 和 M1～M5 未完成；不能切换默认、删除 Python 或宣称 Mac 包 / 新版迁移已通过。
