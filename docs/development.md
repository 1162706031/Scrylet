# 开发、构建与验证

面向从源码运行或参与开发的读者。安装用户请直接使用 [Releases](https://github.com/1162706031/Scrylet/releases/latest)，不需要准备以下工具链。

## 环境与原生资源

- Node.js **22.12+**，使用 `npm ci` 安装锁定依赖。
- 桌面目标为 Windows x64、macOS arm64 / x64。跨平台资源构建不等于目标系统运行验收。
- 原生鼠标监听程序使用锁定的 **Rust 1.91.0** 和 `native/Cargo.lock`；测试驱动与只读 observer 分开，测试驱动不能进入应用资源。
- 当前运行时只有 Node，不需要准备 Python、uv、Docker 或 Open WebUI 环境。

```sh
git clone https://github.com/1162706031/Scrylet.git
cd Scrylet
npm ci
```

### Windows x64

准备 Rust 1.91.0 Windows GNU 工具链及其所需链接器，再构建原生资源：

```sh
npm run build:native
npm run setup
npm start
```

`build:native` 使用 `1.91.0-x86_64-pc-windows-gnu` 工具链，输出到忽略的 `build/native/`。`setup` 验证已编译 observer、检查 phone 类型并构建静态页面，不会在运行时下载或编译辅助程序。已有可用原生资源时，可直接运行 `setup`。

### macOS

准备 Rust 1.91.0 和目标架构标准库：

```sh
rustup toolchain install 1.91.0 --profile minimal
rustup target add --toolchain 1.91.0 aarch64-apple-darwin x86_64-apple-darwin
npm run setup
npm start
```

Mac 上的 `setup` 会调用 `build:mac-input` 构建当前架构的只读鼠标监听程序。Cargo 不在 PATH 时，可通过 `SNAP_CARGO` 指定其绝对路径。

首次运行时，在 **系统设置 → 隐私与安全性** 中为实际运行的应用开启 **屏幕录制 / 屏幕与系统音频录制**（用于截屏），以及 **输入监控**（用于全局鼠标长按与双击）。开发态系统权限项可能显示为 Electron，监听程序按系统实际提示授权。授权后完全退出并重开 App；监听仍未就绪时重新保存截图设置。详细操作见[macOS 首次授权](beginner-tutorial.md#macos-首次授权)。Mac 实机验收仍需单独完成。

### 使用隔离数据

普通 `npm start` 使用 Electron userData。开发、迁移比较或问题复现时，使用独立目录：

```sh
npm run start:node -- --data <绝对路径>
```

不要让开发测试写入真实用户数据库，也不要让新旧应用同时写入同一份数据。旧版兼容格式、迁移与导出见[迁移说明](node-service-m4.md)和[格式说明](node-service-formats.md)。

## 检查与验证

先运行与改动相关的检查，不必为文案或局部样式修改重复全部硬件测试。

### 常规检查

```sh
npm run check
npm test
npm run typecheck:phone
npm run build:phone
```

`check` 包含 JS 语法、模型目录、产品开关及 phone / contracts 的严格类型检查。

### 浏览器与界面

```sh
npx playwright install chromium webkit
npm run test:phone
npm run test:desktop-ui
npm run test:appearance
```

- `test:phone`：隔离 Node 服务与 Chromium / WebKit，覆盖对话、草稿、附件、分支、截图接收、语音与布局；`test:ui` 是同一套入口。
- `test:desktop-ui`：真实 Electron 工作台、设置与日志 / 缓存等操作。
- `test:appearance`：真实桌面 IPC、两种浏览器、四套主题同步、草稿 / 生成保留和重启记忆。

模型请求默认只访问本地模拟提供商，不需要真实 API Key。浏览器语音或屏幕夹具不代表实体设备声音与真实屏幕权限验收。

### 边界、数据与独立归档

| 命令 | 验证范围 |
| --- | --- |
| `npm run test:contracts` | HTTP / IPC 等共享边界契约、声明与恢复约束。 |
| `npm run test:formats` | 冻结旧数据格式、草稿和两种 SDK 协议。 |
| `npm run test:compat` | utilityProcess、SQLite、ESM SDK 和独立 ASAR。 |
| `npm run test:service -- --asar` | 真实服务进程、存储、密钥与模拟模型。 |
| `npm run test:phone:asar` | 仓库外独立测试 ASAR 中的手机集成；不等于安装包验收。 |
| `npm run test:migration` | 只读迁移、阶段恢复、密钥与独立回退导出。 |
| `npm run test:default-migration` | 重定向 appData 下，默认启动的自动迁移与不重复导入。 |

### 本机与安装验收

| 命令 | 验证范围 |
| --- | --- |
| `npm run test:desktop` | 原生截屏、启动与关闭到托盘。 |
| `npm run test:native` | Windows 系统输入观察、父进程退出及独立驱动清理。 |
| `npm run test:desktop-input` | Windows 系统快捷键、鼠标长按与静默截图自动发送。 |
| `npm run test:desktop-lifecycle` | 关闭、重新打开、正常退出与崩溃清理。 |
| `npm run test:maintenance` | 日志、实际缓存清理、数据保留与重启。 |
| `npm run test:network` | 网卡选择、重启保留及局域网配对。 |
| `npm run test:silent` | 静默截图、声音与通知保护。 |
| `npm run test:startup` | 隔离数据下的实际启动采样与子进程退出。 |
| `npm run test:candidate:win` | 当前 Windows 候选包的本机验证。 |
| `npm run test:release` | 版本 / 哈希绑定的发布证据检查；未测硬件门槛不视为通过。 |

原生截屏可能需要用户授权。Windows 输入验收拒绝在已有 Electron / Scrylet 运行时注入事件；执行前按脚本要求关闭现有应用。Mac、物理手机、签名与实际安装须分别记录，不能由另一平台或静态构建代替。

## 构建安装包

### Windows x64

```sh
npm run dist:win
```

使用正常应用身份生成 Node-only NSIS，并审计资源 / 许可证，输出到 `dist/releases/<版本>/`，附 SHA-256。此命令不安装或发布应用。

`npm run dist:win:candidate` 保留独立 NSIS 验收身份。实际升级、替换与旧版读回需按[升级验收说明](node-service-m4.md)准备隔离安装器；不直接覆盖个人安装数据。

### macOS

在 macOS 上按架构构建：

```sh
npm run dist:mac:arm64
npm run dist:mac:x64
```

每个架构生成开发 DMG / ZIP，并审计资源和签名状态。原生运行、Keychain、屏幕权限、安装、签名与公证需要对应 Mac 环境，详见 [Mac 验收范围](node-service-m3.md)。

Linux 的显式 `--archive-only --prebuilt-phone` 路径仅用于 ZIP 资源准备；还需提供对应架构的 Mac 原生资源。它不代表 Linux 桌面支持，也不代表 Mac 实机验收。

## 实现边界与资料

- Logo 原始资源位于 `static/favicon.ico` 和 `static/favicon.png`；`npm run icons` 从 ICO 内最大 PNG 提取 `static/logo.png`，并同步桌面、手机与托盘派生资源，不覆盖原始图标。
- `artifacts/` 仅保存在本地并受 Git 忽略，不上传 GitHub；公开展示用的截图保存在 `docs/assets/`。验收文档中的本地报告路径需要在生成记录的电脑上查看。
- `desktop/main.cjs` 负责生命周期和窄 IPC，`desktop/gateway.cjs` 负责手机访问鉴权。
- `phone/` 保留一个 composer / SDK 对话状态，`service/` 负责存储、生成与兼容适配。
- 主题由电脑保存，手机读取并同步，详见[统一外观主题](appearance.md)。
- 不提交真实密钥、数据库、配对令牌、运行时配置或私有日志。`.test-data/` 等本地数据目录受忽略规则保护。
- 历史对照源代码、旧断言与声明保留在[源码归档](archive/README.md)，不作为当前运行依赖。

[架构说明](architecture.md) · [重构方案](node-service-refactor.md) · [实施记录](node-service-implementation.md) · [验收记录](verification.md) · [历史本地交付记录](node-service-finalization.md)

这些记录包含不同阶段的状态；当前命令以 `package.json` 为准，发行文件以对应 Release 为准，已打包、已安装与已通过硬件验收分别判断。
