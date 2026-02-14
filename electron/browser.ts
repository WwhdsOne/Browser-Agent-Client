import type { Browser, Page } from 'playwright'

export interface PageElement {
  tag: string
  text: string
  selector: string
  visible: boolean
  disabled: boolean
}

export interface PageState {
  url: string
  elements: PageElement[]
}

export interface Action {
  action: 'goto' | 'click' | 'input' | 'select' | 'scroll' | 'wait' | 'close_browser'
  selector?: string
  value?: string
  url?: string
  distance?: number
  timeout?: number
}

export interface ActionResult {
  success: boolean
  error?: string
  pageState?: PageState
}

export class BrowserManager {
  private browsers: Map<string, { browser: Browser; page: Page }> = new Map()

  async createBrowser(conversationId: string): Promise<boolean> {
    try {
      const { chromium } = await import('playwright')
      const browser = await chromium.launch({ headless: false })
      const page = await browser.newPage()
      
      this.browsers.set(conversationId, { browser, page })
      return true
    } catch (error) {
      console.error('Failed to create browser:', error)
      return false
    }
  }

  async executeAction(conversationId: string, action: Action): Promise<ActionResult> {
    const instance = this.browsers.get(conversationId)
    if (!instance) {
      return { success: false, error: 'Browser not found' }
    }

    const { page, browser } = instance

    try {
      switch (action.action) {
        case 'goto':
          await page.goto(action.url!, { waitUntil: 'domcontentloaded' })
          break
        case 'click':
          await page.click(action.selector!)
          await page.waitForLoadState('domcontentloaded')
          break
        case 'input':
          await page.fill(action.selector!, action.value!)
          break
        case 'select':
          await page.selectOption(action.selector!, action.value!)
          break
        case 'scroll':
          await page.mouse.wheel(0, action.distance!)
          break
        case 'wait':
          await page.waitForTimeout(action.timeout!)
          break
        case 'close_browser':
          await this.closeBrowser(conversationId)
          return { success: true }
        default:
          return { success: false, error: `Unknown action: ${action.action}` }
      }

      const pageState = await this.getPageState(conversationId)
      return { success: true, pageState }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async getPageState(conversationId: string): Promise<PageState> {
    const instance = this.browsers.get(conversationId)
    if (!instance) {
      return { url: '', elements: [] }
    }

    const { page } = instance
    const url = page.url()
    const elements = await this.extractPageElements(page)
    return { url, elements }
  }

  private async extractPageElements(page: Page): Promise<PageElement[]> {
    const selectors = ['button', 'a', 'input', 'textarea', 'select', '[role="button"]']
    const elements: PageElement[] = []
    
    for (const selector of selectors) {
      const handles = await page.$$(selector)
      
      for (const handle of handles) {
        try {
          const isVisible = await handle.isVisible()
          const isDisabled = await handle.isDisabled()
          const text = await handle.textContent() || ''
          const tagName = await handle.evaluate(el => el.tagName.toLowerCase())
          const elementSelector = await this.generateSelector(handle)
          
          if (elementSelector) {
            elements.push({
              tag: tagName,
              text: text.trim(),
              selector: elementSelector,
              visible: isVisible,
              disabled: isDisabled
            })
          }
        } catch {
          continue
        }
      }
    }

    return elements
  }

  private async generateSelector(handle: any): Promise<string | null> {
    try {
      return await handle.evaluate((el: Element) => {
        if (el.id) return `#${el.id}`
        if (el.getAttribute('name')) return `[name="${el.getAttribute('name')}"]`
        if (el.getAttribute('aria-label')) return `[aria-label="${el.getAttribute('aria-label')}"]`
        
        const path: string[] = []
        let current: Element | null = el
        
        while (current && current !== document.body) {
          let selector = current.tagName.toLowerCase()
          
          if (current.id) {
            selector = `#${current.id}`
            path.unshift(selector)
            break
          }
          
          const parent = current.parentElement
          if (parent) {
            const siblings = Array.from(parent.children).filter(
              child => child.tagName === current!.tagName
            )
            if (siblings.length > 1) {
              const index = siblings.indexOf(current) + 1
              selector += `:nth-of-type(${index})`
            }
          }
          
          path.unshift(selector)
          current = parent
        }
        
        return path.join(' > ')
      })
    } catch {
      return null
    }
  }

  async detectVerification(conversationId: string): Promise<boolean> {
    const instance = this.browsers.get(conversationId)
    if (!instance) return false

    const { page } = instance
    try {
      const url = page.url().toLowerCase()
      
      const verificationDomains = [
        'challenges.cloudflare.com',
        'recaptcha.net',
        'www.google.com/recaptcha',
        'hcaptcha.com',
        'captcha.deluxe'
      ]
      for (const domain of verificationDomains) {
        if (url.includes(domain)) return true
      }

      const captchaSelectors = [
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        'iframe[src*="challenges.cloudflare"]',
        '.g-recaptcha',
        '.h-captcha',
        '#captcha',
        '[class*="captcha"]',
        '[id*="captcha"]',
        '.challenge-form',
        '.cf-challenge',
        '#cf-challenge-running',
        '[data-sitekey]'
      ]
      
      for (const selector of captchaSelectors) {
        const element = await page.$(selector)
        if (element) {
          const isVisible = await element.isVisible()
          if (isVisible) return true
        }
      }

      const sliderSelectors = [
        '.slider-btn',
        '.slide-verify',
        '[class*="slider"]',
        '[class*="slide-verify"]',
        'canvas[class*="verify"]',
        '.geetest',
        '.gt_slider'
      ]
      
      for (const selector of sliderSelectors) {
        const element = await page.$(selector)
        if (element) {
          const isVisible = await element.isVisible()
          if (isVisible) return true
        }
      }

      const bodyText = await page.locator('body').innerText({ timeout: 1000 }).catch(() => '')
      const pageTitle = await page.title()
      const combinedText = (bodyText + ' ' + pageTitle).toLowerCase()
      
      const strongIndicators = [
        '请完成安全验证',
        '请拖动滑块完成验证',
        'security check',
        'please complete the security check',
        'prove you are human',
        'are you a robot',
        'verify you are human',
        'complete the captcha'
      ]
      
      for (const indicator of strongIndicators) {
        if (combinedText.includes(indicator.toLowerCase())) return true
      }
      
      return false
    } catch {
      return false
    }
  }

  async closeBrowser(conversationId: string): Promise<boolean> {
    const instance = this.browsers.get(conversationId)
    if (instance) {
      await instance.browser.close()
      this.browsers.delete(conversationId)
      return true
    }
    return false
  }

  async closeAll(): Promise<void> {
    for (const conversationId of Array.from(this.browsers.keys())) {
      await this.closeBrowser(conversationId)
    }
  }
}
