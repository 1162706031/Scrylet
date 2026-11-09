# M0.4：旧格式与双协议夹具

2026-11-08，Windows x64。默认仍为固定 Open WebUI 0.12.2 + Python；这里只冻结对照输入，没有实现迁移器或切换生产服务。关联 F11～F24、F28～F36，以及 M0 的会话菜单、分支和草稿补充。

`npm run test:formats` 在 `.test-data/node-service-formats/` 新建隔离目录，启动真实旧运行层和本地 mock，跑 Chromium / WebKit，再检查固定夹具和两条真实 SDK 协议。`npm run test:formats -- --update` 在全部浏览器采集成功后更新脱敏夹具。原始旧库、运行日志和凭证只在忽略目录内；不读取实际 userData、真实账户或环境密钥。读取旧 schema 的 exporter 只允许带 synthetic 标记的指定测试目录，关闭旧写入后用固定 Electron 的 SQLite 只读打开。

最终同轮证据见 formats-check（本地：`artifacts/node-service-formats-check.json`）。两项浏览器、14 项协议检查、3 项固定夹具检查通过。此前普通更新接口不能制造双指针分歧、已停止的 Runtime 不能原对象重启、桌面 UA 隐藏声音入口、自动网卡配置不含 selectedNetwork 的失败均用于修正夹具，未记为产品通过；失败采集目录保留。runner 使用独立 run 输出目录，失败不会更新通过报告。协议探索及最终离线回归曾出现请求前失败（0 请求），最终诊断为 Windows 随机端口落入 fetch 禁用端口（bad port）；失败 TAP 保留于 `.test-data/node-service-contracts-offline-bad-port.tap`。mock 改在 20000～64999 选取可绑定端口，不是重试模型请求，随后完整重跑。图像输入使用当前 SDK 的 file 类型，未压制旧 image 类型弃用警告，也不能据此宣称真实厂商已兼容。

后续 M4 已据本卡的冻结格式实现一致快照、normalized / embedded 图调和、受控图片映射、已保存浏览器草稿及新增数据后固定旧版实际读回；Windows 证据见 [M4](node-service-m4.md)。本文各处“待 M4”保留为 M0.4 当时的历史边界，不替代最新进度。外链和过期 blob 仍拒绝虚称恢复，Mac Keychain 未测。

## 固定的文件与 schema

[database.json](../tests/fixtures/legacy-v1/database.json) 来自实际旧库的 PRAGMA、CREATE TABLE 和合成记录；[browser.json](../tests/fixtures/legacy-v1/browser.json) 来自真实已保存草稿；[desktop.json](../tests/fixtures/legacy-v1/desktop.json) 记录配对字段和自动 / 手选网卡格式。三份文件的 SHA-256 写入验收报告。

| 来源 | 实际冻结内容 |
| --- | --- |
| chat | 17 列、2 个会话，每个保留完整 chat JSON 与 5 节点图；重答和编辑不删除原节点。导入副本的顶层 / 内嵌当前指针故意不同，刷新确认有效顶层指针优先；未知 chat 字段重启后仍在 |
| chat_message | **19 列、10 行**，包含 parent_id、content、output、files、sources、embeds、meta、done、error、status_history、usage、context_summary。固定版双写，部分读取优先查此表；不可只迁移 JSON 或把两份图无条件覆盖 |
| chat_file / file | 7 / 9 列，保留会话、消息、文件关联，实际字节与 SHA-256。两次上传分别进入消息和草稿；经已配对网关读取，哈希与磁盘一致 |
| config | **key / value / updated_at** 三列，只导出 openai.api_keys、openai.api_base_urls、openai.api_configs。密钥数组全部为空；按 index / prefix_id 关联，保留 enable=false 与自定义路径 |
| model / prompt | 10 / 12 列、16 个模型、7 个提示词，保留 params / meta / tags / version_id 等原值；用户修改提示词后重启，种子不覆盖 |
| 用户 | 只导出合成用户 settings；不导出 user / auth 行、密码或登录 token。不是可直接启动的完整用户库 |

固定 SQL 可用 Electron 内置 SQLite 在内存库重建，逐行逐字段对比、integrity_check 通过，不依赖 Python 测试驱动。此检查关闭外键，因为精选夹具省略 auth / user 等表；**不是 M4 的完整库外键 / 导入 / 回退验收**。完整旧库保留在对应隔离目录。

## 格式与时间单位

实际表的 created_at / updated_at、chat.last_read_at、消息 timestamp 为 epoch **秒**；嵌入 chat.timestamp 为 **毫秒**；配对 createdAt / lastSeen 为 **毫秒**。config.updated_at 也是秒。目标 JSON 统一毫秒，导入必须按来源字段转换，并保留原始载荷。源码中的禁用 timer_at 为纳秒；目前真实夹具为 null，非空情形仅作为合成边界登记，必须用 BigInt / 十进制字符串读取并保留精度，不能依赖 JS Number。

固定版 normalized 读取在有行时优先采用 chat_message，缺父节点时从 embedded history 补齐，没有行才回退 history；另一条单消息路径也可能回退 JSON。M4 必须保留两份载荷、比对冲突、补齐节点并验证兄弟分支，不把“优先”误解成可丢掉另一份数据。数据库的 schema version / 完整表名、每列类型、外键定义已一并冻结。

删除密钥检查先配置合成 key、显式 remove，再关闭旧子进程；向隔离 legacy seed 写入冲突的合成 key，以新 Runtime 对象重启，仍 configured=false、自定义 base URL 保留。没有导出合成 key 值，也没有改动真实配置。手选网卡使用模拟系统网卡 `FixtureNIC / 192.0.2.10`，新 Gateway / Pairing 对象重新读取后设置和设备列表保持；未连接该文档示例地址。凭证 / tokenHash 从公开夹具省略，后续重放只能新建测试凭证，不能沿用真实设备 token。

## 浏览器与附件

两引擎实际使用 **sessionStorage**，新会话 `chat-input`、历史会话 `chat-input-<id>`，500ms 保存窗口；字段为 prompt、files、selectedToolIds、selectedSkillIds、selectedFilterIds、imageGenerationEnabled、webSearchEnabled、codeInterpreterEnabled。仅已保存草稿保证刷新恢复，关闭功能的字段仍保留原文，不因此启用隐藏功能。`selectedModels` 单独保留。当前隔离会话 `indexedDB.databases()` 两引擎均为空；这不能代表所有旧用户从未使用过 IndexedDB。

真实截图附件是 **type=file**，url 可直接等于 file ID；含嵌套 file/meta、itemId、status=uploaded、size、content_type，不是仅有 type=image/url 的扁平结构。图片原始字节以合成 base64 固定，文件表 path 已替换 `<FIXTURE_ROOT>`，localhost 端口标准化为 49999。正文、分支、图片次序和未知字段必须留存。

声音设置经真实页面操作保存 snap.readAloud、snap.speechVoice、snap.speechRate，刷新保持。语音引擎被模拟，没有扬声器实测。框选真实生成 snap.crop.<displayId>，值为 `{width,height,data}`（data 为 Cropper 裁剪坐标），同时保留 snap.display。新持久草稿 browserClientId 和每页随机 receiver clientId 分开；原键不能清理，跨 origin 无法后台读取旧存储。

[edge-cases.json](../tests/fixtures/legacy-v1/edge-cases.json) 明确区分合成的 data URI、旧鉴权文件 URL、外部 URL、失效 blob、纳秒和两份图冲突。它们是后续导入器输入要求，**没有冒充本轮浏览器已恢复结果**。外部 URL 不自动下载，失效 blob 无服务器恢复保证；未解决的数据不得静默丢弃后通过迁移。

## SDK 协议矩阵

[provider-formats.test.cjs](../tests/provider-formats.test.cjs) 实际加载已锁定的 AI SDK / OpenAI / OpenAI-compatible；独立 mock 避免改变原有 UI 测试夹具。两条协议分别覆盖 JSON、SSE、自定义 `/custom/v1` 前缀及末尾斜杠，断言传入的模型 ID、历史 user / assistant / user 顺序、两张图片原始字节和顺序、真实 stop 结束原因。图像编码用合成字节；可解码图片的上传 / 读取由旧版浏览器夹具另测。

每种协议还覆盖 429、服务已收到请求但连接断开、流式取消；maxRetries=0，均只收到一次请求，取消观察到上游未完成即关闭。没有重放不确定请求。以上共 14 项，不包含真实厂商鉴权、真实图片识别或产品 SSE 的恢复；产品序号、状态持久化和迁移 / 新增数据后回退仍属 M1 / M4。

M0.4 完成后下一项为 M0.5：正式 contracts 初稿与规则复核。五次真实重启首启继续按用户选择未测；macOS、实体手机和最终安装包没有新增通过项。
