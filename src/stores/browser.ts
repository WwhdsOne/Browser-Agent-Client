import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface BrowserInstance {
  conversationId: string
  isConnected: boolean
  isExisting: boolean
}

export const useBrowserStore = defineStore('browser', () => {
  const browsers = ref<Map<string, BrowserInstance>>(new Map())

  const createBrowser = async (conversationId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await window.electronAPI.browser.create(conversationId)
      if (result) {
        browsers.value.set(conversationId, {
          conversationId,
          isConnected: true,
          isExisting: false
        })
        return { success: true }
      }
      return { success: false, error: '创建浏览器失败' }
    } catch (error) {
      console.error('Failed to create browser:', error)
      return { success: false, error: String(error) }
    }
  }

  const connectExistingBrowser = async (conversationId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await window.electronAPI.browser.connectExisting(conversationId)
      if (result.success) {
        browsers.value.set(conversationId, {
          conversationId,
          isConnected: true,
          isExisting: true
        })
      }
      return result
    } catch (error) {
      console.error('Failed to connect to existing browser:', error)
      return { success: false, error: String(error) }
    }
  }

  const connectOrLaunchBrowser = async (chromePath: string, conversationId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await window.electronAPI.browser.connectOrLaunch(chromePath, conversationId)
      if (result.success) {
        browsers.value.set(conversationId, {
          conversationId,
          isConnected: true,
          isExisting: true
        })
      }
      return result
    } catch (error) {
      console.error('Failed to connect or launch browser:', error)
      return { success: false, error: String(error) }
    }
  }

  const getBrowser = (conversationId: string): BrowserInstance | undefined => {
    return browsers.value.get(conversationId)
  }

  const closeBrowser = async (conversationId: string): Promise<void> => {
    await window.electronAPI.browser.close(conversationId)
    browsers.value.delete(conversationId)
  }

  const closeAllBrowsers = async (): Promise<void> => {
    for (const [conversationId] of browsers.value) {
      await closeBrowser(conversationId)
    }
  }

  return {
    browsers,
    createBrowser,
    connectExistingBrowser,
    connectOrLaunchBrowser,
    getBrowser,
    closeBrowser,
    closeAllBrowsers
  }
})
