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
- 浏览器类型选择：支持新开浏览器或连接已有 Chrome（自动启动带调试端口）

## 浏览器类型

创建会话时可选择：

1. **新开浏览器** - 启动全新的 Chrome 实例
2. **连接已有浏览器** - 自动检测并启动带 `--remote-debugging-port=9222` 的 Chrome

**Chrome 默认检测路径：**
- macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`

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
| POST | `/api/browser-agent/conversation/create` | 创建会话，body: `{title, browser_type}` |
| GET | `/api/browser-agent/conversation/list` | 会话列表，query: `page,size,title,state` |
| POST | `/api/browser-agent/conversation/rename` | 重命名，body: `{id,title}` |
| DELETE | `/api/browser-agent/conversation/delete?id={id}` | 删除会话 |

**browser_type:** `new` (新开浏览器) 或 `existing` (连接已有浏览器)

### 消息管理

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/browser-agent/messages` | 创建消息，body: `{conversation_id, content}` |
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
// 发送任务（使用 HTTP 创建消息返回的 message_id）
{ type: 'task', message_id: '123456', pageState?: PageState }

// 执行结果（必须返回 action_id 和 execution_time）
{ 
  type: 'result', 
  action_id: string,      // 从收到的 Action 获取
  success: boolean, 
  execution_time: number, // 执行耗时（毫秒）
  error?: string, 
  pageState?: PageState 
}

// 恢复执行（人机验证后）
{ type: 'resume', pageState?: PageState }
```

### 服务端消息

```typescript
// 操作指令（包含 action_id）
{ 
  type: 'action', 
  action: { 
    action_id: string,
    action: 'click', 
    selector: '#btn' 
  } 
}

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
  title: string     // 页面标题
  h1: string        // 页面 h1 文本
  elements: PageElement[]
}

interface PageElement {
  tag: string       // 标签名
  text: string      // 文本内容（input 为 placeholder/aria-label）
  selector: string  // CSS 选择器
  value?: string    // input/textarea/select 的当前值
}
```

**元素过滤规则：**
- 仅保留视口内可见、有文本内容的元素
- 排除 disabled 元素和 hidden input
- 保留有明确选择器的元素（id/name/aria-label/placeholder/href）
- `<a>` 标签优先用 href 作为选择器（长度<80）
- 选择器长度不超过 100 字符
- input/textarea/select 元素会额外返回 `value` 字段（当前输入值）
