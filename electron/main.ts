import { app, BrowserWindow, ipcMain, session, dialog } from 'electron'
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

  ipcMain.handle('browser:connectExisting', async (_, conversationId: string) => {
    return await browserManager.connectExistingBrowser(conversationId)
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

  ipcMain.handle('browser:detectLogin', async (_, conversationId: string) => {
    return await browserManager.detectLoginPage(conversationId)
  })

  ipcMain.handle('browser:isCDPReady', async () => {
    return await browserManager.isCDPPortAvailable()
  })

  ipcMain.handle('browser:connectOrLaunch', async (_, chromePath: string, conversationId: string) => {
    return await browserManager.connectOrLaunchBrowser(chromePath, conversationId)
  })

  ipcMain.handle('chrome:getDefaultPath', async () => {
    return browserManager.getDefaultChromePath()
  })

  ipcMain.handle('chrome:validatePath', async (_, path: string) => {
    return browserManager.validateChromePath(path)
  })

  ipcMain.handle('chrome:selectPath', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择 Chrome 可执行文件',
      properties: ['openFile'],
      filters: [
        { name: '可执行文件', extensions: ['exe', 'app', '*'] }
      ]
    })
    
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }
    
    return { canceled: false, path: result.filePaths[0] }
  })

  ipcMain.handle('chrome:launch', async (_, chromePath: string) => {
    return await browserManager.launchChromeWithDebug(chromePath)
  })
}
