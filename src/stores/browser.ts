import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface BrowserInstance {
  conversationId: string
  isConnected: boolean
}

export const useBrowserStore = defineStore('browser', () => {
  const browsers = ref<Map<string, BrowserInstance>>(new Map())

  const createBrowser = async (conversationId: string): Promise<boolean> => {
    try {
      const result = await window.electronAPI.browser.create(conversationId)
      if (result) {
        browsers.value.set(conversationId, {
          conversationId,
          isConnected: true
        })
      }
      return result
    } catch (error) {
      console.error('Failed to create browser:', error)
      return false
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
    getBrowser,
    closeBrowser,
    closeAllBrowsers
  }
})
