# M0.2：旧运行层启动与包体基线

2026-11-07，`2.0.0-dev.6`，默认仍为 legacy。**分段计时、一次首次初始化与 10 次完整退出后的启动已实测；5 次真实 Windows 重启后的首次启动仍未验收，M0.2 不标记全部通过。** 脱敏原始样本和汇总见 启动报告（本地：`artifacts/node-service-startup-check.json`）。

本轮没有构建新版安装包、删除 Python、访问真实模型账户或修改真实 userData。上一轮的 [M0.1 入口基线](node-service-baseline.md) 和历史证据保持原样。

## 测量对象与设备

Windows 11 Pro `10.0.26200`、x64、AMD Ryzen 7 7800X3D、16 个逻辑处理器、33,405,857,792 字节内存。WSL2 编排，通过 Windows Node 22.14.0 运行 Playwright；测的是实际 Electron 44.8.0 源码应用、内置旧 Python 3.12.16 / Open WebUI 0.12.2。既有 NSIS / 解包文件只测大小，**没有把源码计时当成安装版计时**。

正式数据目录 `.test-data/node-service-m02/measurement/`。一次独立初始化后，用相同隔离数据、保留的历史和配对连续做 10 次完整退出 / 重启；每次用新的 Chromium context，浏览器进程保持运行，恢复的 cookie 只属于该隔离夹具，不增加设备上限或清空配对。每次新增一个实际 mock 对话，因此历史会逐次增长；没有把每次全新建库称为常规启动。

首次初始化单列，未混入 10 次分布；更早的小样本在 `.test-data/node-service-m02/pilot/`，也没有累计成正式套件。测量期间没有同时跑 UI / 原生回归；后台系统负载没有封闭控制。本机结果不代表其他设备、物理手机、macOS 或全功能 Node 版性能。

## 阶段定义与时钟

全部阶段由 Electron 主进程同一个 `performance.now()` 记录。`app-start=0` 定义为 main.cjs 第一行；这不包含 OS / Electron 可执行文件加载前的耗时。另保留控制器在调用 Electron launch 前到手机页交互确认后的时间，包含 Playwright 启动 / 连接开销，不与主进程阶段混算。

| 阶段 | 观察点 |
| --- | --- |
| `gateway-listening` | 实际网关监听成功后 |
| `window-visible` | 本地连接页面完成加载且主窗口 show 后；不等于能聊天 |
| `service-spawned` | Python 子进程的真实 spawn 事件 |
| `legacy-http-healthy` | 旧健康接口成功；包括原有轮询的观察延迟，不能当作内部导入结束的精确时间 |
| `legacy-authenticated` / `storage-ready` | 本地账户操作成功后的 DB 可用观察点；不是上游内部 SQLite 打开时间，也未改 wheel 插入探针 |
| `legacy-scope-applied` / `legacy-ui-applied` | 产品开关、静默偏好同步完成 |
| `legacy-workspace-initialized` / `service-ready` | 原有模型 / 提示词初始化完成，真实 Runtime.ready=true |
| `phone-interactive` | 经实际网关配对、读取配置并加载真实上游页面，输入框可见、截图按钮可用后，通过本地窗口窄 IPC 记时 |
| `usable` | 实际读取会话列表、等到 sessionStorage 草稿保存确认、通过原生输入发送，且 loopback mock 已收到且核对正文 |
| `answer-visible` | 观察到新回答有正文；20ms 轮询 + IPC 的观察点，不能宣称是厂商首 token 延迟 |
| `answer-completed` | 生成结束、真实会话 API 中已有回答内容，再记完成 |

“可用”包含草稿 500ms 防抖、配对 / 配置核对、真实浏览器渲染和测试观察开销，是同一套夹具下的可复现验证时间，不是界面最早可点时间。没有仅凭窗口显示或 `/health` 就报告已经能聊天。

`desktop/startup-metrics.cjs` 只接收固定阶段名和单调耗时，不记录参数、凭证、URL、正文或任意错误。必须同时有 `SNAP_STARTUP_METRICS=1` 与显式 `SNAP_DATA_DIR` 才开放两个本地窗口 IPC；沿用 main.cjs 的 sender / frame 检查，手机不能调用。默认不启用、不新增计时文件或界面入口。文件由独立采样脚本保存。

## 正式 10 次结果

单位毫秒，从 main.cjs 入口计；每行是 10 次各自的中位数 / 最大值，不能将各行的中位数直接相减当作区间中位数。

| 阶段 | 中位数 | 最大值 |
| --- | ---: | ---: |
| 网关监听 | 117.690 | 127.315 |
| 窗口显示 | 244.177 | 261.648 |
| 运行层子进程 spawn | 273.868 | 292.624 |
| 旧 HTTP 健康成功 | 5,396.336 | 5,930.047 |
| 登录成功 / DB 可用观察 | 5,595.483 | 6,137.417 |
| 服务 ready | 5,651.211 | 6,199.880 |
| 手机页可交互 | 7,286.320 | 7,870.027 |
| 三项业务可用核对完成 | 8,007.293 | 8,595.383 |
| mock 回答完成观察 | 8,117.270 | 8,720.056 |

区间逐次计算后再汇总：spawn → 健康接口中位数 **5,124.408ms**；健康接口 → ready **255.851ms**；ready → 手机交互 **1,623.732ms**。前一个区间包含 Python、Open WebUI、DB / HTTP 初始化及健康轮询，不能全部归因于 Python 导入，也不能据此直接预测 Node 版收益。

mock 请求观察 → 回答可见中位数 6.901ms、最大 41.510ms；→ 回答完成中位数 121.620ms、最大 139.746ms。它们来自本地模拟流，**不是云模型延迟或真实厂商性能结果**。

正式首次初始化：服务 ready 7,090.142ms，手机交互 9,329.763ms，业务可用 10,137.604ms。只是一份新隔离数据的首次初始化样本，不是系统冷启动样本，也不是旧真实用户数据迁移耗时。

10 次均验证一次 mock 请求、会话读取 / 已保存草稿，退出时每次观察到的 8 个所属进程均结束，网关端口释放；没有把只隐藏窗口当作完整退出。鼠标 observer 在该测量夹具中显式关闭，未执行原生输入或截图操作；其他既有能力由对应回归检查，不能把本次启动测量当完整输入 / 静默验收。

## 包体与文件数

重新读取现有 Windows 产物，而不是用压缩估算：

| 项目 | 字节 | 文件数 |
| --- | ---: | ---: |
| `Scrylet-2.0.0-dev.6-win-x64-Setup.exe` | 308,753,932 | 1 |
| `dist/win-unpacked/` | 946,046,039 | 23,606 |
| `resources/python/` | 555,858,509 | 23,527 |
| 其余资源（含 app.asar） | 390,187,530 | 79 |
| `app.asar` | 3,903,762 | 已包含于上行 |

安装包 SHA-256：`13bbf529f3f0bb34165aaab6b85934398477f91a3df0138607d9feaa7aec7d55`，与原记录一致。Mac 两架构 DMG / ZIP 大小仍未测；这里也没有生成可运行的 Node 小包。

## 复现与真实系统重启采样

Windows shell 从仓库根目录运行：

```sh
npm run test:startup -- --runs 10 --directory .test-data/startup-legacy
```

首次会先准备隔离数据并记录 initialization，之后才做 10 次 process-restart；已经有 manifest 的同一目录可继续采样。只接管 `.test-data/` 内有自身标记的目录，拒绝未知非空目录、路径越界和 junction；不清理或覆盖用户目录。模型地址固定 loopback，dummy key 仅在忽略目录，所有厂商真实环境密钥清空。结果分别为 `samples.json`、`summary.json`、`package-sizes.json`；其中 `browser-state.json` 含该隔离上游 token，不能提交或整目录公开。

需要另建一套正式数据时，先在重启前准备：

```sh
npm run test:startup -- --prepare --directory .test-data/startup-cold-legacy
```

**然后由操作者真实重启 Windows**，重新登录后，在打开 Scrylet 或运行其他 Scrylet 夹具前执行一次：

```sh
npm run test:startup -- --post-reboot --directory .test-data/startup-cold-legacy
```

此命令一次只记一个 post-system-reboot 样本；再重复上述真实重启与采样，累计至少 5 个不同启动周期。使用 Windows 的“重启”，不把休眠恢复或进程重启当系统重启。脚本通过 CIM LastBootUpTime 确认启动周期，同一测量目录当前周期已有任何采样（包括温启动 / 失败）则拒绝。是否在其他 Scrylet 启动前执行仍需操作者按步骤保证，不伪装成已自动证明所有应用启动历史。

本轮实际验证了相同启动周期调用 `--post-reboot` 返回 `BOOT_ALREADY_SAMPLED`，原始账本未变。**实际系统重启样本数为 0**；没有擅自重启用户 Windows、修改登录任务或用假时钟补样本。5 次重启首启仍为 M0.2 的剩余验收项。

## 证据、验证与下一项

- 正式原始账本：`.test-data/node-service-m02/measurement/samples.json`；分布与代码哈希：同目录 `summary.json`；包体：`package-sizes.json`；逐次控制台阶段：`.test-data/node-service-m02/measurement.log`。
- 52 项离线测试与语法 / 目录检查通过，涵盖计时枚举 / 时钟 / 不可变快照 / 观察顺序、同 boot 拒绝与空组 / 中位数、未知目录和 junction 保护。默认关闭计时的 Windows 源码桌面检查通过：真实 2560×1440 截图、权限 granted、关闭到托盘。
- mock provider 已从 `tests/fixture.cjs` 提取到 `tests/mock-provider.cjs`；Responses / Chat 行为保持原样。原有 Chromium / WebKit 全套 70 / 70 同次通过，无跳过 / 重试 / flaky，347,861.781ms；原始结果在 `.test-data/node-service-m02/ui.json`。旧 artifacts 截图逐字节恢复，新渲染证据只留忽略目录。
- 5 次真实系统重启、Mac、实体手机、安装版启动、进程树内存和安装耗时均未作为本轮通过项。尚无新版性能改善结论；默认 legacy 与旧资源继续保留。

M0.2 的 5 次真实重启首启仍保留未测；用户明确选择暂缓并先继续 M0.3，后续 [Windows 兼容实验](node-service-compatibility.md) 已通过。重启采样的手动命令继续可用，但不再把它当作当前独立实验的阻塞项；最终验收门槛仍保留。不得因为常规 10 次已通过，就把 M0.2 或整体重构全部标绿。
