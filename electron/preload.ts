import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  browser: {
    create: (conversationId: string) => ipcRenderer.invoke('browser:create', conversationId),
    execute: (conversationId: string, action: any) => ipcRenderer.invoke('browser:execute', conversationId, action),
    getState: (conversationId: string) => ipcRenderer.invoke('browser:getState', conversationId),
    close: (conversationId: string) => ipcRenderer.invoke('browser:close', conversationId),
    detectVerification: (conversationId: string) => ipcRenderer.invoke('browser:detectVerification', conversationId)
  }
})
