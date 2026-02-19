export interface ChromeInfo {
  found: boolean
  path?: string
  error?: string
}

export interface ElectronAPI {
  browser: {
    create: (conversationId: string) => Promise<boolean>
    connectExisting: (conversationId: string) => Promise<{ success: boolean; error?: string }>
    isCDPReady: () => Promise<boolean>
    connectOrLaunch: (chromePath: string, conversationId: string) => Promise<{ success: boolean; error?: string }>
    execute: (conversationId: string, action: any) => Promise<{ success: boolean; error?: string; pageState?: any }>
    getState: (conversationId: string) => Promise<{ url: string; elements: any[] }>
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
