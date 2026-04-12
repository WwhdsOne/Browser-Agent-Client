type ActionType = 'goto' | 'click' | 'input' | 'select' | 'scroll' | 'wait' | 'finish_task' | 'close_browser';

export interface DownloadInfo {
  filename: string        // 原始文件名
  suggestedFilename: string // 浏览器建议的文件名
  path?: string           // 保存路径（如果可获取）
}

export interface ApiResponse<T = any> {
  code: number
  message?: string
  data: T
}

export interface LoginRequest {
  username: string
  password: string
}

export type LoginResponse = ApiResponse<string>

export type ConversationState = 'running' | 'waiting_verification' | 'finished' | 'error'

export type BrowserType = 'new' | 'existing'

export interface Conversation {
  id: string
  title: string
  browser_type: BrowserType
  state: ConversationState
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface ScrollInfo {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
  hasMoreBelow: boolean;
  hasMoreAbove: boolean;
}

export interface SelectOption {
  value: string;
  text: string;
}

export interface PageState {
  url: string;
  title: string;
  elements: PageElement[];
  elementText: string;
  scrollInfo?: ScrollInfo;
  screenshot?: string; // base64 编码的带标签截图（供视觉模型使用）
}

export interface PageElement {
  index: number;
  tag: string;
  text: string;
  selector: string;
  type?: string;          // 元素类型（input, button, question等）
  question?: string;      // 题目文本（仅当type=question时有值）
  value?: string;
  label?: string;
  role?: string;
  ariaLabel?: string;
  ariaExpanded?: string;
  ariaChecked?: string;
  ariaRequired?: boolean;
  ariaDisabled?: boolean;
  required?: boolean;
  disabled?: boolean;
  options?: PageElement[];  // 选项列表（仅question类型使用）
  isNew?: boolean;
}

export interface Action {
  action_id: string;
  action: ActionType;
  index?: number;
  option_index?: number;  // 用于选择题的选项索引
  selector?: string;
  value?: string;
  url?: string;
  distance?: number;
  timeout?: number;
}

export interface TaskMessage {
  type: 'task';
  message_id: string;
  task: string;
  pageState?: PageState;
}

export interface ResultMessage {
  type: 'result';
  action_id: string;
  message_id: string;
  success: boolean;
  execution_time: number;
  task: string;
  error?: string;
  pageState?: PageState;
  // 多动作结果（新增）
  results?: MultiActionResult[];
  completed_count?: number;
  stopped_reason?: 'page_change' | 'error' | 'all_done';
}

export type ClientMessage = TaskMessage | ResultMessage;

export interface ActionMessage {
  type: 'action';
  action?: Action;           // 单动作（向后兼容）
  actions?: Action[];        // 多动作（新增）
  stop_on_page_change?: boolean;  // 页面变化时是否停止后续动作（默认 true）
}

export interface MultiActionResult {
  action_id: string
  success: boolean
  execution_time: number
  error?: string
}

export interface FinishMessage {
  type: 'finish';
  message: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface MultiActionResult {
  action_id: string
  success: boolean
  execution_time: number
  error?: string
}

export type ServerMessage = ActionMessage | FinishMessage | ErrorMessage;

export interface ConversationResponse {
  id: string;
  title: string;
  state: ConversationState;
  created_at: string;
  updated_at: string;
}

export interface MessageResponse {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ActionResponse {
  id: string;
  message_id: string;
  action_type: ActionType;
  sequence: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  url?: string;
  selector?: string;
  value?: string;
  distance?: number;
  timeout?: number;
  error_message?: string;
  execution_time?: number;
  created_at: string;
}

export interface PaginationResp<T> {
  data: T[];
  total: number;
  page: number;
  size: number;
}

export interface PaginationParams {
  page?: number;
  page_size?: number;
}
