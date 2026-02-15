import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  browser: {
    create: (conversationId: string) => ipcRenderer.invoke('browser:create', conversationId),
    connectExisting: (conversationId: string) => ipcRenderer.invoke('browser:connectExisting', conversationId),
    isCDPReady: () => ipcRenderer.invoke('browser:isCDPReady'),
    connectOrLaunch: (chromePath: string, conversationId: string) => ipcRenderer.invoke('browser:connectOrLaunch', chromePath, conversationId),
    execute: (conversationId: string, action: any) => ipcRenderer.invoke('browser:execute', conversationId, action),
    getState: (conversationId: string) => ipcRenderer.invoke('browser:getState', conversationId),
    close: (conversationId: string) => ipcRenderer.invoke('browser:close', conversationId),
    detectVerification: (conversationId: string) => ipcRenderer.invoke('browser:detectVerification', conversationId),
    detectLogin: (conversationId: string) => ipcRenderer.invoke('browser:detectLogin', conversationId)
  },
  chrome: {
    getDefaultPath: () => ipcRenderer.invoke('chrome:getDefaultPath'),
    validatePath: (path: string) => ipcRenderer.invoke('chrome:validatePath', path),
    selectPath: () => ipcRenderer.invoke('chrome:selectPath'),
    launch: (chromePath: string) => ipcRenderer.invoke('chrome:launch', chromePath)
  }
})
