import { app, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { BrowserManager } from './browser.js'

let mainWindow: BrowserWindow | null = null
const browserManager = new BrowserManager()

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
      webSecurity: false,
      partition: 'persist:main'
    },
    title: 'GUI智能体客户端'
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        'Origin': '*'
      }
    })
  })

  createWindow()
  setupIPC()
})

app.on('window-all-closed', async () => {
  await browserManager.closeAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

function setupIPC() {
  ipcMain.handle('browser:create', async (_, conversationId: string) => {
    return await browserManager.createBrowser(conversationId)
  })

  ipcMain.handle('browser:execute', async (_, conversationId: string, action: any) => {
    return await browserManager.executeAction(conversationId, action)
  })

  ipcMain.handle('browser:getState', async (_, conversationId: string) => {
    return await browserManager.getPageState(conversationId)
  })

  ipcMain.handle('browser:close', async (_, conversationId: string) => {
    return await browserManager.closeBrowser(conversationId)
  })

  ipcMain.handle('browser:detectVerification', async (_, conversationId: string) => {
    return await browserManager.detectVerification(conversationId)
  })
}
