# 移动端对话界面改造

2026-11-09。仅调整现有 React / TypeScript 展示层，无新增依赖。实际页面仍由原 Node 服务和经过鉴权的网关提供。

## 设计与文件

暖白 `#fafaf7`、深墨文字 `#242d29`、松绿强调 `#2e6553`；本地系统字体、统一线性 SVG 图标、轻边框和克制的过渡。颜色变量仅在 phone 样式中覆盖，不改共享桌面 / 服务配置页主题。

| 文件 | 改造 |
| --- | --- |
| `phone/src/phone.css` | 对话页设计变量、导航、欢迎页、消息与 Markdown、输入区、响应式与减少动态效果 |
| `phone/src/controls.css` | 历史抽屉、选中态、搜索、时间、菜单、弹窗、图片预览、裁剪与声音设置 |
| `phone/src/chat/ConversationView.tsx` | 原单 Composer 的展示重排、欢迎入口、自动输入高度、VisualViewport 短视口、滚动跟随与返回最新 |
| `phone/src/chat/HistoryPanel.tsx` | 列表读取状态与空状态反馈，操作和请求保持原实现 |
| `phone/src/App.tsx` | 导航与初始化展示；从当前 URL 读取历史选中态，兼容首次发送后原控制器 replaceState |
| `phone/src/Icon.tsx` | 复用现有 SVG 图标体系，增加屏幕捕获图标 |
| `phone/src/attachments/Capture.tsx` | 截屏 / 框选按钮使用统一图标 |
| `phone/src/audio/ReadAloud.tsx` | 原 opt-in 朗读 / 声音入口增加统一图标 |
| `phone/src/dialogs.ts` | 保留现有焦点边界，补充对话 / 重答菜单的点击外部与 Escape 收起 |
| `phone/index.html` | 浏览器栏主题色匹配页面 |
| `playwright.phone.config.cjs` | 修正与默认配置循环导入，恢复明确的 Chromium / WebKit 手机项目 |
| `tests/phone/design.spec.cjs` | 欢迎交互、320/375/390/430 宽度与短视口、输入高度、长文约束、流式阅读位置与返回最新、减少动态效果 |

输入区按附件、正文、工具和模型 / 保存 / 发送层级排列。截屏、框选、选图、提示词、屏幕选择与模型切换均保持直接可用。工具在窄屏紧凑排列，原图片预览 / 删除 / 清空 / 撤销功能保留。

消息区域独立滚动，输入区参与 flex 布局，不覆盖正文；输入字体保持 16px，避免 iOS 输入自动缩放。VisualViewport 调整页面高度与偏移，Safe Area 处理顶端、横向和底端。WebKit 流式渲染可能先于 scroll 事件，本次在布局更新时额外识别向上滚动，防止抢回阅读位置。点击“最新回复”即时返回底部，避免流式增高与长距离平滑滚动相互干扰。

## 功能保护

分析入口：`main.tsx → App.tsx → ConversationView.tsx`。`useConversation.ts` 维护唯一 SDK 状态，`useComposer.ts` 维护唯一草稿与附件队列；`api.ts` / `transport.ts` 提供现有契约请求和流；`desktopReceiver.ts` 接收桌面指令；`exports.tsx` 提供导出。

上述六个逻辑模块已与任务开始前快照逐字节比对一致。没有修改后端、API 参数、接口地址、存储结构或原 SDK。欢迎页入口仅聚焦原输入框或触发原文件选择，不发送消息。

| 原功能 | 本次保护方式 |
| --- | --- |
| 发送 / 流 / 停止 / 恢复 / 不确定提交 | 原 controller / SDK / transport 不变；运行 chat / recovery / receiver 专项 |
| Markdown / 数学 / 表格 / 代码与复制保存折叠 | 原 MessageList / RichText 不变；样式约束横向容器，运行 chat / history 专项 |
| 消息保存编辑 / 编辑发送 / 重答三种风格 / 分支 / 删除 | 保留原 handler，运行 history 专项 |
| 搜索 / 分页 / 重命名 / 置顶 / 未读 / 全读 / 归档恢复 / 克隆 / 分享 / 导出 | 保留原请求与确认，运行 history 专项 |
| 截屏 / 屏幕选择 / 裁剪 / 多图追加 / 预览缩放 / 撤销 / 跨会话隔离 | 原 Capture / composer 流程不变，仅按钮展示调整，运行 composer / receiver 专项 |
| 模型选择 / 配置返回 / 本地草稿 / 旧草稿恢复 / 冲突保留 | 原数据逻辑不变，运行 composer / layout / recovery 专项 |
| 静默捕获 / opt-in 朗读 / 声音与语速 / 主动试听 | 捕获无新通知或声音；原 speech 类不变，运行 speech 专项 |
| 暂停 / 断连 / 配对恢复 | 原网关行为不变，运行 layout / receiver 专项 |

## 实际截图

均为实际构建页面、隔离 Node 服务、回环模拟提供商及模拟屏幕 / 系统语音，不代表真实提供商账号或实际系统截屏验收。截图关闭过渡动画以捕获最终稳定画面，不替换页面内容。

| 页面 | Chromium | WebKit |
| --- | --- | --- |
| 欢迎页 | [截图](../artifacts/phone-redesign-welcome-chromium.png) | [截图](../artifacts/phone-redesign-welcome-webkit.png) |
| 对话 / 数学 / 表格 / 代码 | [截图](../artifacts/phone-redesign-conversation-chromium.png) | [截图](../artifacts/phone-redesign-conversation-webkit.png) |
| 历史与当前会话 | [截图](../artifacts/phone-redesign-history-chromium.png) | [截图](../artifacts/phone-redesign-history-webkit.png) |
| 320px 长草稿 | [截图](../artifacts/phone-redesign-draft-320x720-chromium.png) | [截图](../artifacts/phone-redesign-draft-320x720-webkit.png) |
| 375px 长草稿 | [截图](../artifacts/phone-redesign-draft-375x812-chromium.png) | [截图](../artifacts/phone-redesign-draft-375x812-webkit.png) |
| 430px 长草稿 | [截图](../artifacts/phone-redesign-draft-430x932-chromium.png) | [截图](../artifacts/phone-redesign-draft-430x932-webkit.png) |
| 390×460 短视口 | [截图](../artifacts/phone-redesign-draft-390x460-chromium.png) | [截图](../artifacts/phone-redesign-draft-390x460-webkit.png) |

## 验证与边界

- `npm run check`：通过，包含 JavaScript 语法、目录 / 产品开关，以及 phone / contracts 严格类型检查。
- `npm run typecheck:phone` / `npm run build:phone`：通过。
- `npm run test:phone -- --output .test-data/phone-redesign/accepted-results --reporter list`：**54/54 通过**，Chromium / WebKit 各 27 项，无重试或跳过；覆盖原功能 50 项与新增设计检查 4 项。
- 最后仅加深辅助文字 / 占位文字颜色，随后再次通过 `npm run check`、`npm run build:phone` 和两浏览器设计专项 **4/4**，最终截图来自这次构建。
- 六个逻辑模块与任务开始前快照逐字节一致；本次修改文件无行尾空白。仓库全局 `git diff --check` 仍报告其他已有工作区文件的 CRLF 行尾问题，未改动这些文件。

运行平台为 Windows x64（从 WSL 调用现有 Windows Node / Electron / Playwright）。完整通过日志：`.test-data/phone-redesign/accepted-browser.log`；最终配色与截图检查：`.test-data/phone-redesign/presentation.log`。摘要与受保护模块哈希见 [验证记录](../artifacts/phone-redesign-check.json)。

现有 Vite 提示仍可见：同步 `quiet.js` 不作为模块打包、主包大于 500kB、SWR `use client` 指令提示。没有为 UI 改造升级依赖或更改 SDK。

手机软键盘、缩放、Safe Area 和系统语音使用浏览器模拟；未在物理 iPhone / Android 设备上验证，也未将 Windows WebKit 等同于 iOS Safari 真机。本次未进行新的原生截屏、最终安装包或 Mac 硬件验收。

先前失败记录保留在 `.test-data/phone-redesign/`：首轮发现历史空状态文案不一致，随后发现欢迎页误显示最新入口、WebKit 滚动事件与流式渲染的时序，以及平滑返回最新与生成增高的冲突。均针对原因修改展示层后验证；未放宽原有功能断言。
