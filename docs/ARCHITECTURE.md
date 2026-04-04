# 浏览器智能体系统架构盘点

## 当前状态分析

### 现有架构
```
前端 (Vue3 + Pinia)
    ↓ HTTP/WS
后端 (任务分发)
    ↓ IPC
Electron Main (BrowserManager)
    ↓ Playwright
Chrome 浏览器
```

### 现有能力
- ✅ 单一浏览器实例管理
- ✅ 基础操作执行（goto/click/input/select/scroll/wait）
- ✅ 页面状态提取（DOM解析）
- ✅ 登录页检测
- ✅ 会话级浏览器管理

### 现有限制
- ❌ 无任务规划能力（直接执行后端下发的action）
- ❌ 无多智能体协调
- ❌ 无视觉理解能力（仅DOM解析）
- ❌ 无错误自动恢复机制
- ❌ 无复杂表单识别能力
- ❌ 无验证码处理能力

---

## 新架构设计：多智能体 + 多模态

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    前端 (Vue3 + Pinia)                       │
│              用户输入 → 任务创建 → 实时反馈                   │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/WS
┌────────────────────────▼────────────────────────────────────┐
│                    后端 (任务分发)                            │
│              任务管理 → 会话管理 → 结果收集                   │
└────────────────────────┬────────────────────────────────────┘
                         │ IPC
┌────────────────────────▼────────────────────────────────────┐
│              Electron Main (多智能体协调层)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ TaskPlanner (任务规划智能体)                          │   │
│  │ - 任务分解                                            │   │
│  │ - 执行计划生成                                        │   │
│  │ - 上下文管理                                          │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ AgentOrchestrator (智能体协调器)                      │   │
│  │ - 智能体调度                                          │   │
│  │ - 消息队列管理                                        │   │
│  │ - 依赖关系处理                                        │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 专用智能体集群                                        │   │
│  │ ├─ NavigationAgent (导航)                            │   │
│  │ ├─ FormFillingAgent (表单填充)                       │   │
│  │ ├─ DataExtractionAgent (数据提取)                    │   │
│  │ ├─ VerificationAgent (验证处理)                      │   │
│  │ └─ ErrorRecoveryAgent (错误恢复)                     │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ VisionModule (视觉理解模块)                           │   │
│  │ - Qwen-VL 集成                                        │   │
│  │ - 截图分析                                           │   │
│  │ - 元素识别                                            │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ BrowserManager (浏览器执行层)                         │   │
│  │ - Playwright 操作                                     │   │
│  │ - 页面状态管理                                        │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │ Playwright
┌────────────────────────▼────────────────────────────────────┐
│                    Chrome 浏览器                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心模块设计

### 1. TaskPlanner (任务规划智能体)

**职责：**
- 将自然语言任务分解成子任务序列
- 维护执行上下文（已填信息、当前页面状态等）
- 生成执行计划

**输入：** 用户任务描述
**输出：** 任务分解树 + 执行计划

```typescript
interface Task {
  id: string
  type: 'navigation' | 'form_filling' | 'data_extraction' | 'verification'
  description: string
  dependencies: string[] // 依赖的任务ID
  context: {
    currentUrl?: string
    filledData?: Record<string, any>
    pageState?: PageState
  }
  retryCount: number
  maxRetries: number
}

interface ExecutionPlan {
  tasks: Task[]
  executionOrder: string[] // 拓扑排序后的执行顺序
  context: ExecutionContext
}
```

### 2. AgentOrchestrator (智能体协调器)

**职责：**
- 调度智能体执行
- 管理消息队列
- 处理任务依赖关系
- 错误恢复与重试

**核心方法：**
```typescript
class AgentOrchestrator {
  async executeTask(task: Task): Promise<TaskResult>
  async handleTaskFailure(task: Task, error: Error): Promise<void>
  async updateContext(updates: Partial<ExecutionContext>): Promise<void>
  async getAgentForTask(task: Task): Promise<Agent>
}
```

### 3. 专用智能体集群

#### NavigationAgent
- 处理页面导航
- URL跳转
- 页面加载等待

#### FormFillingAgent
- 表单字段识别（DOM + 视觉）
- 智能填充
- 验证码检测与处理

#### DataExtractionAgent
- 页面数据提取
- 表格解析
- 结构化数据输出

#### VerificationAgent
- 验证码识别（Qwen-VL）
- 安全验证处理
- 登录状态检测

#### ErrorRecoveryAgent
- 错误检测
- 自动恢复策略
- 重试机制

### 4. VisionModule (视觉理解模块)

**集成 Qwen-VL 的关键点：**

```typescript
interface VisionModule {
  // 识别表单字段
  identifyFormFields(screenshot: Buffer): Promise<FormField[]>

  // 识别验证码
  identifyVerificationCode(screenshot: Buffer): Promise<VerificationCodeInfo>

  // 识别UI元素
  identifyUIElements(screenshot: Buffer): Promise<UIElement[]>

  // 判断页面状态
  analyzePageState(screenshot: Buffer): Promise<PageStateAnalysis>
}

interface FormField {
  label: string
  inputType: string // text, password, select, checkbox, radio, etc.
  position: { x: number; y: number; width: number; height: number }
  required: boolean
  options?: string[] // for select/radio/checkbox
}

interface VerificationCodeInfo {
  type: 'image' | 'slider' | 'click' | 'text' | 'unknown'
  position: { x: number; y: number; width: number; height: number }
  description?: string
}
```

---

## 实现路线图

### 第一阶段：任务规划层（1-2周）

**目标：** 实现基础的任务分解与规划

**任务：**
1. 设计 TaskPlanner 接口
2. 实现简单的任务分解算法
3. 实现执行上下文管理
4. 集成到现有的 BrowserManager

**关键文件：**
- `electron/agents/TaskPlanner.ts`
- `electron/types/task.ts`
- `electron/context/ExecutionContext.ts`

### 第二阶段：多智能体框架（1-2周）

**目标：** 实现智能体协调与调度

**任务：**
1. 设计 Agent 基类
2. 实现 AgentOrchestrator
3. 实现 5 个基础智能体
4. 实现消息队列与通信机制

**关键文件：**
- `electron/agents/base/Agent.ts`
- `electron/agents/AgentOrchestrator.ts`
- `electron/agents/NavigationAgent.ts`
- `electron/agents/FormFillingAgent.ts`
- `electron/agents/DataExtractionAgent.ts`
- `electron/agents/VerificationAgent.ts`
- `electron/agents/ErrorRecoveryAgent.ts`

### 第三阶段：视觉理解集成（1周）

**目标：** 集成 Qwen-VL 进行视觉理解

**任务：**
1. 集成 Qwen-VL API
2. 实现 VisionModule
3. 在 FormFillingAgent 中集成视觉识别
4. 在 VerificationAgent 中集成验证码识别

**关键文件：**
- `electron/vision/VisionModule.ts`
- `electron/vision/QwenVLClient.ts`

### 第四阶段：错误恢复与优化（1周）

**目标：** 完善错误处理与性能优化

**任务：**
1. 实现 ErrorRecoveryAgent
2. 添加重试机制
3. 性能优化
4. 日志与监控

### 第五阶段：实验与评估（1-2周）

**目标：** 设计实验、收集数据、撰写论文

**任务：**
1. 设计基准测试（benchmark）
2. 选择测试网站
3. 对比实验：纯DOM vs 混合策略
4. 收集性能数据
5. 撰写论文

---

## 技术选型

### 后端通信
- 保持现有的 HTTP + WebSocket 方案
- 新增 IPC 消息队列用于智能体间通信

### 视觉模型
- **Qwen-VL** (阿里云)
  - 优点：中文支持好、成本低、API稳定
  - 缺点：需要调用API
  - 成本：约 ¥0.01-0.05 per image

### 智能体框架
- 自实现轻量级框架（不依赖重型框架）
- 基于事件驱动 + 消息队列

### 数据存储
- 执行上下文：内存 + 本地文件缓存
- 任务历史：SQLite（可选）

---

## 关键创新点

### 1. 自适应多模态策略
- DOM 优先（快速、低成本）
- 失败时自动降级到视觉模型
- 成本与准确率的智能权衡

### 2. 多智能体协调
- 不同智能体处理不同类型的操作
- 支持并行执行和依赖管理
- 自动错误恢复

### 3. 任务规划与分解
- 将复杂任务自动分解成子任务
- 维护执行上下文
- 支持中断/恢复

### 4. 完整的 Electron 实现
- 展示工程能力
- 可直接使用的桌面应用

---

## 论文写作方向

### 标题
"基于任务规划与自适应多模态理解的复杂网页自动化系统"

### 核心创新点
1. **任务规划层**
   - 自然语言任务分解算法
   - 执行上下文管理机制

2. **多智能体协调**
   - 智能体调度算法
   - 依赖关系处理
   - 错误恢复机制

3. **自适应多模态策略**
   - DOM 优先策略
   - 视觉模型降级机制
   - 成本-准确率权衡

4. **完整系统实现**
   - Electron 桌面应用
   - 实时可视化反馈
   - 可复用的智能体框架

### 实验设计
- **测试集**：包含表单、验证码、复杂表格的真实网站
- **对比组**：
  - 纯 DOM 方案
  - 纯视觉方案
  - 混合方案（本文）
- **评估指标**：
  - 成功率 (Success Rate)
  - 平均执行时间 (Average Execution Time)
  - 成本 (API 调用次数)
  - 错误恢复率 (Error Recovery Rate)

---

## 文件结构规划

```
electron/
├── agents/
│   ├── base/
│   │   └── Agent.ts              # 智能体基类
│   ├── TaskPlanner.ts            # 任务规划智能体
│   ├── AgentOrchestrator.ts       # 智能体协调器
│   ├── NavigationAgent.ts         # 导航智能体
│   ├── FormFillingAgent.ts        # 表单填充智能体
│   ├── DataExtractionAgent.ts     # 数据提取智能体
│   ├── VerificationAgent.ts       # 验证处理智能体
│   └── ErrorRecoveryAgent.ts      # 错误恢复智能体
├── vision/
│   ├── VisionModule.ts            # 视觉理解模块
│   └── QwenVLClient.ts            # Qwen-VL 客户端
├── context/
│   └── ExecutionContext.ts        # 执行上下文管理
├── types/
│   ├── task.ts                    # 任务类型定义
│   ├── agent.ts                   # 智能体类型定义
│   └── vision.ts                  # 视觉模块类型定义
├── browser.ts                     # 浏览器管理（保留，作为执行层）
├── main.ts                        # 主进程入口
└── preload.ts                     # 预加载脚本
```

---

## 成本估算

### 开发成本
- 任务规划层：40-60 小时
- 多智能体框架：40-60 小时
- 视觉模块集成：20-30 小时
- 测试与优化：30-40 小时
- **总计：130-190 小时**

### API 成本（Qwen-VL）
- 假设每个任务平均调用 3-5 次
- 每次 ¥0.01-0.05
- 100 个任务实验：¥30-25 元

### 总成本
- 开发时间：3-4 周
- API 成本：几十元（可控）

---

## 下一步行动

1. **确认方案** ✓
2. **创建项目结构** → 第一步
3. **实现 TaskPlanner** → 第二步
4. **实现 AgentOrchestrator** → 第三步
5. **实现各个智能体** → 第四步
6. **集成 Qwen-VL** → 第五步
7. **测试与优化** → 第六步
8. **撰写论文** → 第七步
