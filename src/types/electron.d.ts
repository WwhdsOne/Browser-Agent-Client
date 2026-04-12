export interface ChromeInfo {
  found: boolean
  path?: string
  error?: string
}

export interface SelectOption {
  value: string
  text: string
}

export interface PageElement {
  index: number
  tag: string
  text: string
  selector: string
  type?: string          // 元素类型（input, button, question等）
  question?: string      // 题目文本（仅当type=question时有值）
  value?: string
  label?: string
  role?: string
  ariaLabel?: string
  ariaExpanded?: string
  ariaChecked?: string
  ariaRequired?: boolean
  ariaDisabled?: boolean
  required?: boolean
  disabled?: boolean
  options?: PageElement[]  // 选项列表（select类型用SelectOption[]，question类型用PageElement[]）
  isNew?: boolean
}

export interface ScrollInfo {
  scrollHeight: number
  clientHeight: number
  scrollTop: number
  hasMoreBelow: boolean
  hasMoreAbove: boolean
}

export interface PageState {
  url: string
  title: string
  elements: PageElement[]
  elementText: string
  scrollInfo?: ScrollInfo
}

export interface DownloadInfo {
  filename: string
  suggestedFilename: string
  path?: string
}

export interface ElectronAPI {
  browser: {
    create: (conversationId: string) => Promise<boolean>
    connectExisting: (conversationId: string) => Promise<{ success: boolean; error?: string }>
    isCDPReady: () => Promise<boolean>
    connectOrLaunch: (chromePath: string, conversationId: string) => Promise<{ success: boolean; error?: string }>
    execute: (conversationId: string, action: any) => Promise<{ success: boolean; error?: string; pageState?: PageState; downloadInfo?: DownloadInfo }>
    getState: (conversationId: string) => Promise<PageState>
    close: (conversationId: string) => Promise<boolean>
    detectVerification: (conversationId: string) => Promise<boolean>
    detectLogin: (conversationId: string) => Promise<boolean>
  }
  chrome: {
    getDefaultPath: () => Promise<ChromeInfo>
    validatePath: (path: string) => Promise<ChromeInfo>
    selectPath: () => Promise<{ canceled: boolean; path?: string }>
    launch: (chromePath: string) => Promise<{ success: boolean; error?: string }>
  }
  shell: {
    openExternal: (url: string) => Promise<void>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
