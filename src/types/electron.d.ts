export interface ElectronAPI {
  browser: {
    create: (conversationId: string) => Promise<boolean>
    execute: (conversationId: string, action: any) => Promise<{ success: boolean; error?: string; pageState?: any }>
    getState: (conversationId: string) => Promise<{ url: string; elements: any[] }>
    close: (conversationId: string) => Promise<boolean>
    detectVerification: (conversationId: string) => Promise<boolean>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
