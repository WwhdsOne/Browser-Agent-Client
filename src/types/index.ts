type ActionType = 'goto' | 'click' | 'input' | 'select' | 'scroll' | 'wait' | 'close_browser';

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

export interface Conversation {
  id: string
  title: string
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

export interface PageState {
  url: string;
  elements: PageElement[];
}

export interface PageElement {
  tag: string;
  text: string;
  selector: string;
  visible: boolean;
  disabled: boolean;
}

export interface Action {
  action: ActionType;
  selector?: string;
  value?: string;
  url?: string;
  distance?: number;
  timeout?: number;
}

export interface TaskMessage {
  type: 'task';
  task: string;
  pageState?: PageState;
}

export interface ResultMessage {
  type: 'result';
  success: boolean;
  error?: string;
  pageState?: PageState;
}

export interface ResumeMessage {
  type: 'resume';
  pageState?: PageState;
}

export type ClientMessage = TaskMessage | ResultMessage | ResumeMessage;

export interface ActionMessage {
  type: 'action';
  action: Action;
}

export interface FinishMessage {
  type: 'finish';
  message: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
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
