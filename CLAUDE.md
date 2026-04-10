# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

注意，请使用中文回答所有问题和交流
与用户的所有互动都应该使用中文，包括代码解释和注释，错误信息和建议
## 常用命令

- 安装依赖：`pnpm install`
- Web 开发：`pnpm dev`
- Electron 开发（主进程构建监听 + Vite + Electron 启动）：`pnpm electron:dev`
- Web 构建（类型检查 + Vite）：`pnpm build`
- Electron 主进程构建：`pnpm build:electron`
- 打包桌面应用：`pnpm electron:build`

## 测试与质量检查现状

当前 `package.json` 未定义 `test` / `lint` 脚本，也没有单测框架脚本。

- 若需执行检查，当前可用的是：`pnpm build`（包含 `vue-tsc --noEmit` 类型检查）
- 当前不存在“单个测试”命令，后续若引入 Vitest/Jest 再补充到本文件

## 环境与配置

- 前端开发代理由 `vite.config.ts` 配置，`/api` 会代理到 `VITE_BACKEND_URL`（默认 `http://localhost:8888`）。
- 常用环境变量（见 README）：
  - `VITE_API_BASE_URL`（默认常用 `/api`）
  - `VITE_BACKEND_URL`
- Vite `base` 配置为 `./`，用于 Electron 打包后的相对路径资源加载。

## 高层架构（Big Picture）

这是一个 **Electron + Vue3 + Playwright** 的浏览器智能体客户端：

1. **Renderer（Vue 应用）负责业务 UI 与会话编排**
   - 路由：`src/router/index.ts` 使用 hash history，`/` 需要 token，`/login` 为登录页。
   - 状态：Pinia stores 维护用户、会话、浏览器实例、主题等。
   - HTTP：`src/utils/http.ts` 基于 axios，自动注入 `sessionStorage.token`，401 时跳转登录。
   - 实时通信：`src/utils/websocket.ts` 负责 WS 连接、消息分发、指数退避重连。
   - 任务主流程集中在 `src/views/Home.vue`：创建会话、连接浏览器、发送任务、消费 action、上报 result、处理暂停/恢复。

2. **Electron Main 进程负责本地能力与 IPC 路由**
   - 入口：`electron/main.ts`
   - 通过 `ipcMain.handle` 暴露浏览器控制与 Chrome 路径相关能力（create/connect/execute/getState/close 等）。
   - 应用窗口在开发环境加载 `http://localhost:5173`，生产环境加载打包后的 `index.html`。

3. **Preload 作为安全桥接层**
   - `electron/preload.ts` 用 `contextBridge.exposeInMainWorld` 暴露 `window.electronAPI`。
   - Renderer 只能通过该桥接访问本地能力，避免直接启用 Node 集成。

4. **BrowserManager（Playwright 执行引擎）**
   - 实现位于 `electron/browser.ts`。
   - 支持两种模式：
     - `new`：启动 Playwright Chromium 新实例
     - `existing`：连接或拉起带 `--remote-debugging-port=9222` 的本地 Chrome，再通过 CDP 连接
   - 核心能力：
     - 执行动作（goto/click/input/select/scroll/wait/...）
     - 页面状态提取（URL、title、可交互元素、滚动信息）
     - 登录页/验证码场景检测
     - 会话级浏览器实例管理与关闭

## 端到端执行链路

典型一次任务执行：

1. 前端通过 HTTP 创建 message（拿到 `message_id`）。
2. 前端建立 WS：`/api/browser-agent/ws/{conversationId}?token=...`。
3. 后端下发 `action`。
4. 前端调用 `window.electronAPI.browser.execute(...)`，由 Main 转发到 `BrowserManager` 执行。
5. 执行后前端通过 WS 回传 `result`（包含 `action_id`、`execution_time`、`pageState`）。
6. 若检测到登录态页面，前端进入暂停态，用户手动处理后 resume，再继续回传结果。

## 开发时易踩点

- 会话切换时，`Home.vue` 会先关闭当前浏览器实例再按会话类型重建连接。
- `existing` 模式强依赖 CDP 9222 可用；连接失败时要优先排查本地 Chrome 启动参数与端口占用。
- HTTP 与 WS 都依赖 token（保存在 `sessionStorage`），排查鉴权问题时先看 token 是否存在/过期。

## 登录检测机制 (2026-04-10 优化)

**文件位置**：`electron/browser.ts` 第 1454-1537 行

**检测逻辑**（组合检测机制，降低误触发率）：

1. **URL 检测**（最可靠）：
   - 匹配明确的登录页 URL：`/login`, `/signin`, `/passport` 等
   - 移除了过于宽松的匹配：`/register`, `/signup`, `/verification` 等

2. **选择器组合检测**（积分机制）：
   - 密码输入框：+1 分
   - 用户名/账号输入框：+1 分
   - 登录表单 class/id：+1 分
   - **需要至少 2 分**才判定为登录页

3. **关键词组合检测**：
   - 强关键词（如"账号登录"、"扫码登录"）：至少出现 1 个
   - 弱关键词（如"登录"、"Sign in"）：至少出现 2 个
   - **并且**需要页面有登录按钮/元素

4. **详细日志**：
   ```
   [登录检测] 选择器组合匹配 (2/3): 密码框=true, 用户名框=true, 登录表单=false
   [登录检测] 未检测到登录页面特征
   ```

**优化效果**：
- ✅ 百度首页（导航栏有"登录"）→ 不再误触发
- ✅ GitHub首页（导航栏有"Sign in"）→ 不再误触发
- ✅ 注册页面（有密码框）→ 不再误触发
- ✅ 真实登录页（密码框+用户名框）→ 正确触发
