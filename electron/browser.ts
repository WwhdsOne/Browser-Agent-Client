import type { Browser, Page } from 'playwright'

export interface PageElement {
  tag: string
  text: string
  selector: string
}

export interface PageState {
  url: string
  title: string
  h1: string
  elements: PageElement[]
}

export interface Action {
  action_id: string
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
      return { url: '', title: '', h1: '', elements: [] }
    }

    const { page } = instance
    const url = page.url()
    const title = await page.title()
    const h1 = await page.locator('h1').first().textContent().catch(() => '') || ''
    const elements = await this.extractPageElements(page)
    return { url, title, h1: h1.trim(), elements }
  }

  private async extractPageElements(page: Page): Promise<PageElement[]> {
    const MAX_SELECTOR_LENGTH = 100
    const MAX_HREF_LENGTH = 80
    
    const result = await page.evaluate(() => {
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth
      const items: Array<{
        tag: string
        text: string
        selector: string
      }> = []

      const generateSelector = (el: Element): string | null => {
        if (el.id) return `#${el.id}`
        
        const name = el.getAttribute('name')
        if (name) return `[name="${name}"]`
        
        const ariaLabel = el.getAttribute('aria-label')
        if (ariaLabel) return `[aria-label="${ariaLabel}"]`
        
        const placeholder = el.getAttribute('placeholder')
        if (placeholder && placeholder.length < 30) {
          return `[placeholder="${placeholder}"]`
        }
        
        if (el.tagName.toLowerCase() === 'a') {
          const href = el.getAttribute('href')
          if (href && href.length < 80 && !href.startsWith('javascript:')) {
            return `a[href="${href}"]`
          }
        }
        
        return null
      }

      const isInViewport = (el: Element): boolean => {
        const rect = el.getBoundingClientRect()
        return (
          rect.top < viewportHeight &&
          rect.bottom > 0 &&
          rect.left < viewportWidth &&
          rect.right > 0
        )
      }

      const isInteractable = (el: Element): boolean => {
        const htmlEl = el as HTMLElement
        const style = window.getComputedStyle(el)
        
        if (style.display === 'none' || style.visibility === 'hidden') return false
        if (style.opacity === '0') return false
        if (htmlEl.offsetWidth === 0 || htmlEl.offsetHeight === 0) return false
        
        return true
      }

      const selectors = [
        'button:not([disabled])',
        'a[href]:not([href=""])',
        'input:not([type="hidden"]):not([disabled])',
        'textarea:not([disabled])',
        'select:not([disabled])',
        '[role="button"]:not([disabled])',
        '[onclick]:not([disabled])'
      ]

      const seen = new Set<string>()

      for (const selector of selectors) {
        try {
          const nodes = document.querySelectorAll(selector)
          nodes.forEach((el) => {
            if (!isInViewport(el)) return
            if (!isInteractable(el)) return
            
            const text = (el.textContent || el.getAttribute('value') || '').trim()
            if (!text) return
            
            const elementSelector = generateSelector(el)
            if (!elementSelector) return
            if (elementSelector.length > 100) return
            if (seen.has(elementSelector)) return
            seen.add(elementSelector)

            items.push({
              tag: el.tagName.toLowerCase(),
              text,
              selector: elementSelector
            })
          })
        } catch {}
      }

      return items
    })

    return result
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
