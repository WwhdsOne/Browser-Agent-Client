# GUI 智能体客户端

基于 Electron + Vue 3 的浏览器智能体客户端，通过与后端 LLM 智能体协作，实现浏览器自动化任务执行。

## 技术栈

- **前端**: Vue 3 + TypeScript + Pinia + Vue Router
- **桌面**: Electron + Playwright
- **构建**: Vite

## 项目结构

```
├── electron/                # Electron 主进程
│   ├── main.ts             # 主进程入口
│   ├── preload.ts          # 预加载脚本
│   └── browser.ts          # 浏览器管理器
├── src/
│   ├── components/         # Vue 组件
│   ├── views/              # 页面视图
│   ├── stores/             # Pinia 状态管理
│   ├── utils/              # 工具函数
│   ├── config/             # 配置文件
│   └── types/              # TypeScript 类型定义
└── scripts/                # 构建脚本
```

## 快速开始

```bash
# 安装依赖
pnpm install

# Web 开发模式
pnpm dev

# Electron 开发模式
pnpm electron:dev

# 构建生产版本
pnpm electron:build
```

## 环境配置

`.env.development` / `.env.production`:

```
VITE_API_BASE_URL=/api
VITE_BACKEND_URL=http://localhost:8888
```

## 核心功能

- 会话管理：创建、重命名、删除会话
- 实时通信：WebSocket 与后端智能体实时交互
- 浏览器控制：通过 Playwright 执行自动化操作
- 人机验证检测：自动识别验证码/滑块等验证场景

## 支持的操作类型

| Action | 参数 | 说明 |
|--------|------|------|
| `goto` | `url` | 跳转到指定 URL |
| `click` | `selector` | 点击元素 |
| `input` | `selector`, `value` | 输入文本 |
| `select` | `selector`, `value` | 选择下拉选项 |
| `scroll` | `distance` | 滚动页面 |
| `wait` | `timeout` | 等待 |
| `close_browser` | - | 关闭浏览器 |

---

# 后端 API 接口

## HTTP API

### 用户登录

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{ "username": "admin", "password": "123456" }
```

### 会话管理

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/browser-agent/conversation/create` | 创建会话，body: `{title}` |
| GET | `/api/browser-agent/conversation/list` | 会话列表，query: `page,size,title,state` |
| POST | `/api/browser-agent/conversation/rename` | 重命名，body: `{id,title}` |
| DELETE | `/api/browser-agent/conversation/delete?id={id}` | 删除会话 |
| GET | `/api/browser-agent/messages?conversation_id={id}` | 消息列表 |
| GET | `/api/browser-agent/actions?message_id={id}` | 操作列表 |

### 响应格式

```json
{ "code": 200, "data": {...}, "message": "" }
```

---

## WebSocket 接口

### 连接

```
ws(s)://{HOST}/api/browser-agent/ws/{conversationId}?token={JWT_TOKEN}
```

### 客户端消息

```typescript
// 发送任务
{ type: 'task', task: '打开百度搜索AI', pageState?: PageState }

// 执行结果
{ type: 'result', success: boolean, error?: string, pageState?: PageState }

// 恢复执行（人机验证后）
{ type: 'resume', pageState?: PageState }
```

### 服务端消息

```typescript
// 操作指令
{ type: 'action', action: { action: 'click', selector: '#btn' } }

// 任务完成
{ type: 'finish', message: '任务完成' }

// 错误
{ type: 'error', message: '错误信息' }
```

---

## 会话状态

| 状态 | 说明 |
|------|------|
| `running` | 执行中 |
| `waiting_verification` | 等待人工验证 |
| `finished` | 已完成 |
| `error` | 发生错误 |

---

## PageState 结构

```typescript
interface PageState {
  url: string
  elements: PageElement[]
}

interface PageElement {
  tag: string       // 标签名
  text: string      // 文本内容
  selector: string  // CSS 选择器
  visible: boolean  // 是否可见
  disabled: boolean // 是否禁用
}
```
