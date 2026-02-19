import type {Browser, Page} from 'playwright'
import {exec, spawn} from 'child_process'
import {promisify} from 'util'
import {existsSync, mkdirSync} from 'fs'
import {platform, homedir} from 'os'
import {join, dirname} from 'path'

const execAsync = promisify(exec)

export interface PageElement {
    tag: string
    text: string
    selector: string
    value?: string
    type?: string
    label?: string
    position?: {
        x: number
        y: number
        width: number
        height: number
    }
}

export interface ScrollInfo {
    scrollHeight: number
    clientHeight: number
    scrollTop: number
    hasMoreBelow: boolean
    hasMoreAbove: boolean
}

export interface PageState {
    url: string
    title: string
    elements: PageElement[]
    scrollInfo?: ScrollInfo
}

export interface Action {
    action_id: string
    action: 'goto' | 'click' | 'input' | 'select' | 'scroll' | 'wait' | 'close_browser' | 'finish_task'
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

export interface ChromeInfo {
    found: boolean
    path?: string
    error?: string
}

const CDP_PORT = 9222

function escapeSelector(selector: string): string {
    if (!selector) return selector

    // 处理 ID 选择器：#xxx
    if (selector.startsWith('#')) {
        const idValue = selector.substring(1)
        // 如果 ID 以数字开头或包含特殊字符，转为属性选择器
        if (/^[0-9]/.test(idValue) || /[^a-zA-Z0-9_-]/.test(idValue)) {
            const escaped = `[id="${idValue}"]`
            console.log(`[选择器转义] ${selector} -> ${escaped}`)
            return escaped
        }
    }

    return selector
}

function getChromeUserDataDir(): string {
    const baseDir = join(homedir(), '.chrome-agent')
    const userDataDir = join(baseDir, 'user-data')

    if (!existsSync(userDataDir)) {
        mkdirSync(userDataDir, {recursive: true})
    }

    return userDataDir
}

const CHROME_PATHS: Record<string, string[]> = {
    darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ],
    win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
        process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe'
    ].filter(Boolean) as string[]
}

export class BrowserManager {
    private browsers: Map<string, { browser: Browser; page: Page; isExisting: boolean }> = new Map()
    private chromeProcess: any = null

    getDefaultChromePath(): ChromeInfo {
        const currentPlatform = platform()
        const paths = CHROME_PATHS[currentPlatform]

        if (!paths) {
            return {found: false, error: '不支持的操作系统'}
        }

        for (const path of paths) {
            if (existsSync(path)) {
                return {found: true, path}
            }
        }

        return {found: false, error: '未找到 Chrome 浏览器'}
    }

    validateChromePath(path: string): ChromeInfo {
        if (!path) {
            return {found: false, error: '请选择 Chrome 路径'}
        }

        const normalizedPath = path.trim()

        if (!existsSync(normalizedPath)) {
            return {found: false, error: '路径不存在'}
        }

        const currentPlatform = platform()
        const isWindows = currentPlatform === 'win32'
        const isMac = currentPlatform === 'darwin'

        if (isWindows) {
            if (!normalizedPath.toLowerCase().endsWith('chrome.exe') &&
                !normalizedPath.toLowerCase().endsWith('chromium.exe')) {
                return {found: false, error: '请选择 Chrome 或 Chromium 可执行文件'}
            }
        } else if (isMac) {
            if (!normalizedPath.includes('Chrome') && !normalizedPath.includes('Chromium')) {
                return {found: false, error: '请选择 Chrome 或 Chromium 可执行文件'}
            }
        }

        return {found: true, path: normalizedPath}
    }

    async launchChromeWithDebug(chromePath: string): Promise<{ success: boolean; error?: string }> {
        return new Promise(async (resolve) => {
            try {
                const isWindows = platform() === 'win32'
                const userDataDir = getChromeUserDataDir()

                const args = [
                    `--remote-debugging-port=${CDP_PORT}`,
                    `--remote-debugging-address=0.0.0.0`,
                    `--user-data-dir=${userDataDir}`,
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--no-sandbox'
                ]

                console.log('========== Chrome 启动调试信息 ==========')
                console.log('时间:', new Date().toISOString())
                console.log('平台:', isWindows ? 'Windows' : 'macOS/Linux')
                console.log('Chrome 路径:', chromePath)
                console.log('用户数据目录:', userDataDir)
                console.log('启动参数:', args.join(' '))
                console.log('CDP 端口:', CDP_PORT)
                console.log('==========================================')

                if (isWindows) {
                    this.chromeProcess = spawn(chromePath, args, {
                        detached: true,
                        stdio: ['ignore', 'pipe', 'pipe'],
                        shell: true
                    })
                } else {
                    this.chromeProcess = spawn(chromePath, args, {
                        detached: true,
                        stdio: ['ignore', 'pipe', 'pipe']
                    })
                }

                this.chromeProcess.stdout?.on('data', (data: Buffer) => {
                    console.log('[Chrome stdout]:', data.toString().trim())
                })

                this.chromeProcess.stderr?.on('data', (data: Buffer) => {
                    console.log('[Chrome stderr]:', data.toString().trim())
                })

                this.chromeProcess.on('error', (err: Error) => {
                    console.error('[Chrome 启动错误]:', err)
                    resolve({success: false, error: '启动 Chrome 失败: ' + err.message})
                    return
                })

                this.chromeProcess.on('close', (code: number) => {
                    console.log('[Chrome 进程退出], 退出码:', code)
                })

                this.chromeProcess.unref()

                const maxRetries = 15
                const retryInterval = 500

                console.log('开始检测 CDP 端口...')

                for (let i = 0; i < maxRetries; i++) {
                    await new Promise(r => setTimeout(r, retryInterval))

                    try {
                        console.log(`[CDP 检测] 第 ${i + 1}/${maxRetries} 次尝试连接 http://localhost:${CDP_PORT}/json/version`)

                        const response = await fetch(`http://localhost:${CDP_PORT}/json/version`, {
                            method: 'GET',
                            signal: AbortSignal.timeout(2000)
                        })

                        if (response.ok) {
                            const data = await response.json()
                            console.log('[CDP 检测] 成功! 响应:', JSON.stringify(data, null, 2))
                            console.log('========== Chrome 启动成功 ==========')
                            resolve({success: true})
                            return
                        } else {
                            console.log(`[CDP 检测] 响应异常, status: ${response.status}`)
                        }
                    } catch (e) {
                        console.log(`[CDP 检测] 连接失败:`, (e as Error).message)
                    }
                }

                console.log('[CDP 检测] 超时, 所有重试均已失败')
                resolve({
                    success: false,
                    error: 'Chrome 启动超时，请检查是否有其他 Chrome 实例占用 9222 端口，或尝试关闭所有 Chrome 后重试'
                })

            } catch (error) {
                console.error('[Chrome 启动异常]:', error)
                resolve({success: false, error: '启动 Chrome 失败: ' + (error as Error).message})
            }
        })
    }

    async createBrowser(conversationId: string): Promise<boolean> {
        try {
            const {chromium} = await import('playwright')
            const userDataDir = getChromeUserDataDir()

            console.log('========== 创建临时浏览器 ==========')
            console.log('用户数据目录:', userDataDir)
            console.log('====================================')

            const browser = await chromium.launch({
                headless: false,
                args: [
                    `--user-data-dir=${userDataDir}`,
                    '--no-first-run',
                    '--no-default-browser-check'
                ]
            })
            const page = await browser.newPage()

            this.browsers.set(conversationId, {browser, page, isExisting: false})
            return true
        } catch (error) {
            console.error('Failed to create browser:', error)
            return false
        }
    }

    async isCDPPortAvailable(): Promise<boolean> {
        try {
            const response = await fetch(`http://localhost:${CDP_PORT}/json/version`, {
                method: 'GET',
                signal: AbortSignal.timeout(2000)
            })
            return response.ok
        } catch {
            return false
        }
    }

    async connectOrLaunchBrowser(chromePath: string, conversationId: string): Promise<{
        success: boolean;
        error?: string
    }> {
        const isAvailable = await this.isCDPPortAvailable()

        if (isAvailable) {
            console.log('[CDP 端口已就绪，直接连接]')
            return await this.connectExistingBrowser(conversationId)
        }

        console.log('[CDP 端口未就绪，启动 Chrome]')
        const launchResult = await this.launchChromeWithDebug(chromePath)

        if (!launchResult.success) {
            return launchResult
        }

        return await this.connectExistingBrowser(conversationId)
    }

    async connectExistingBrowser(conversationId: string): Promise<{ success: boolean; error?: string }> {
        const maxRetries = 3

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const {chromium} = await import('playwright')
                const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`)

                const contexts = browser.contexts()
                if (contexts.length === 0) {
                    return {success: false, error: '未找到浏览器上下文'}
                }

                const context = contexts[0]
                const pages = context.pages()
                const page = pages.length > 0 ? pages[0] : await context.newPage()

                this.browsers.set(conversationId, {browser, page, isExisting: true})
                return {success: true}
            } catch (error) {
                console.error(`Failed to connect to existing browser (attempt ${attempt + 1}):`, error)

                if (attempt < maxRetries - 1) {
                    await new Promise(r => setTimeout(r, 500))
                } else {
                    return {
                        success: false,
                        error: '连接失败，请确保 Chrome 已使用 --remote-debugging-port=9222 启动'
                    }
                }
            }
        }

        return {success: false, error: '连接失败'}
    }

    async executeAction(conversationId: string, action: Action): Promise<ActionResult> {
        const instance = this.browsers.get(conversationId)
        if (!instance) {
            return {success: false, error: 'Browser not found'}
        }

        const {page, browser} = instance

        try {
            const context = page.context()
            const pagesBefore = context.pages()

            switch (action.action) {
                case 'goto':
                    await page.goto(action.url!, {waitUntil: 'domcontentloaded'})
                    break
                case 'click':
                    await this.smartClick(page, escapeSelector(action.selector!))
                    await page.waitForLoadState('domcontentloaded')
                    break
                case 'input':
                    const inputSelector = escapeSelector(action.selector!)
                    await page.fill(inputSelector, action.value!)
                    await page.press(inputSelector, 'Enter')
                    break
                case 'select':
                    await page.selectOption(escapeSelector(action.selector!), action.value!)
                    break
                case 'scroll':
                    await page.mouse.wheel(0, action.distance!)
                    break
                case 'wait':
                    await page.waitForTimeout(action.timeout!)
                    break
                case 'finish_task':
                    return {success: true}
                default:
                    return {success: false, error: `Unknown action: ${action.action}`}
            }

            await page.waitForTimeout(2000)

            const pagesAfter = context.pages()

            if (pagesAfter.length > 1) {
                const newPage = pagesAfter[pagesAfter.length - 1]

                for (const p of pagesAfter) {
                    if (p !== newPage && !p.isClosed()) {
                        console.log(`[关闭旧页面] ${p.url()}`)
                        await p.close().catch(() => {})
                    }
                }

                this.browsers.set(conversationId, {browser, page: newPage, isExisting: instance.isExisting})
                console.log(`[保留新页面] ${newPage.url()}`)
            }


            const pageState = await this.getPageState(conversationId)
            return {success: true, pageState}
        } catch (error) {
            return {success: false, error: String(error)}
        }
    }

    async getPageState(conversationId: string): Promise<PageState> {
        const instance = this.browsers.get(conversationId)
        if (!instance) {
            return {url: '', title: '', elements: []}
        }

        const {page} = instance

        const t0 = Date.now()
        const url = page.url()
        console.log(`[getState] url: ${Date.now() - t0}ms`)

        const t1 = Date.now()
        const title = await page.title()
        console.log(`[getState] title: ${Date.now() - t1}ms`)

        const t2 = Date.now()
        const elements = await this.extractPageElements(page)
        console.log(`[getState] extractPageElements: ${Date.now() - t2}ms`)

        const t3 = Date.now()
        const scrollInfo = await page.evaluate(() => {
            const doc = document.documentElement
            const scrollHeight = doc.scrollHeight
            const clientHeight = doc.clientHeight
            const scrollTop = window.scrollY

            return {
                scrollHeight,
                clientHeight,
                scrollTop,
                hasMoreBelow: scrollTop + clientHeight < scrollHeight - 10,
                hasMoreAbove: scrollTop > 10
            }
        })
        console.log(`[getState] scrollInfo: ${Date.now() - t3}ms`)

        console.log(`[getState] 总计: ${Date.now() - t0}ms`)
        return {url, title, elements, scrollInfo}
    }

    private async smartClick(page: Page, selector: string): Promise<void> {
        const element = await page.$(selector)
        if (!element) {
            throw new Error(`Element not found: ${selector}`)
        }

        const isInteractiveOption = await element.evaluate((el) => {
            const tagName = el.tagName.toLowerCase()
            const inputEl = el as HTMLInputElement
            const type = inputEl.type?.toLowerCase() || ''

            if (tagName === 'input' && (type === 'radio' || type === 'checkbox')) {
                return {isOption: true, isHidden: inputEl.offsetParent === null || inputEl.type === 'hidden'}
            }

            const role = el.getAttribute('role')
            if (role === 'radio' || role === 'checkbox') {
                return {isOption: true, isHidden: false}
            }

            const ariaChecked = el.hasAttribute('aria-checked') || el.hasAttribute('aria-selected')
            if (ariaChecked) {
                return {isOption: true, isHidden: false}
            }

            const className = (el.className || '').toString().toLowerCase()
            const hasOptionClass = /\b(radio|checkbox|option|choice|select)\b/.test(className)
            if (hasOptionClass) {
                return {isOption: true, isHidden: false}
            }

            return {isOption: false, isHidden: false}
        })

        if (isInteractiveOption.isOption) {
            console.log(`[smartClick] 检测到选项类元素: ${selector}`)
            await this.clickInteractiveOption(page, selector, element, isInteractiveOption.isHidden)
        } else {
            console.log(`[smartClick] 普通点击: ${selector}`)
            await element.click({force: false})
        }
    }

    private async clickInteractiveOption(
        page: Page,
        selector: string,
        element: any,
        isHidden: boolean
    ): Promise<void> {
        if (!isHidden) {
            try {
                const isVisible = await element.isVisible()
                if (isVisible) {
                    console.log(`[smartClick] 策略1: 直接点击可见元素`)
                    await element.click({force: false})
                    return
                }
            } catch {
            }
        }

        console.log(`[smartClick] 策略2: 查找关联 label`)
        const labelClicked = await page.evaluate((sel) => {
            const input = document.querySelector(sel)
            if (!input) return false

            if (input.id) {
                const label = document.querySelector(`label[for="${input.id}"]`)
                if (label) {
                    (label as HTMLElement).click()
                    return true
                }
            }

            const parentLabel = input.closest('label')
            if (parentLabel) {
                (parentLabel as HTMLElement).click()
                return true
            }

            return false
        }, selector)

        if (labelClicked) {
            console.log(`[smartClick] 成功点击关联 label`)
            return
        }

        console.log(`[smartClick] 策略3: 点击可见父容器`)
        const parentClicked = await page.evaluate((sel) => {
            const input = document.querySelector(sel)
            if (!input) return false

            let parent = input.parentElement
            let depth = 0
            while (parent && depth < 5) {
                const style = window.getComputedStyle(parent)
                const isVisible = style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    style.opacity !== '0'

                if (isVisible && (parent as HTMLElement).offsetWidth > 0 && (parent as HTMLElement).offsetHeight > 0) {
                    const classHint = (parent.className || '').toString().toLowerCase()
                    const hasHint = /\b(radio|checkbox|option|choice|item|container|wrapper)\b/.test(classHint)

                    if (hasHint || parent.getAttribute('role')) {
                        (parent as HTMLElement).click()
                        return true
                    }
                }

                parent = parent.parentElement
                depth++
            }

            return false
        }, selector)

        if (parentClicked) {
            console.log(`[smartClick] 成功点击父容器`)
            return
        }

        console.log(`[smartClick] 策略4: 查找相邻可见元素`)
        const siblingClicked = await page.evaluate((sel) => {
            const input = document.querySelector(sel)
            if (!input) return false

            const siblings = input.parentElement?.children
            if (!siblings) return false

            for (const sibling of Array.from(siblings)) {
                if (sibling === input) continue

                const htmlSibling = sibling as HTMLElement
                if (htmlSibling.offsetWidth === 0 || htmlSibling.offsetHeight === 0) continue

                const style = window.getComputedStyle(sibling)
                if (style.display === 'none' || style.visibility === 'hidden') continue

                const classHint = (sibling.className || '').toString().toLowerCase()
                if (/\b(label|text|box|indicator|mark)\b/.test(classHint)) {
                    htmlSibling.click()
                    return true
                }
            }

            return false
        }, selector)

        if (siblingClicked) {
            console.log(`[smartClick] 成功点击相邻元素`)
            return
        }

        console.log(`[smartClick] 策略5: JavaScript 触发点击事件`)
        await page.evaluate((sel) => {
            const el = document.querySelector(sel)
            if (el) {
                el.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                }))
            }
        }, selector)
    }

    private async extractPageElements(page: Page): Promise<PageElement[]> {
        const result = await page.evaluate(() => {
            const viewportHeight = window.innerHeight
            const viewportWidth = window.innerWidth
            const items: PageElement[] = []

            interface ElementInfo {
                element: Element
                tag: string
                type?: string
                selector: string
                rect: DOMRect
                centerX: number
                centerY: number
                value?: string
            }

            interface TextInfo {
                text: string
                rect: DOMRect
                centerX: number
                centerY: number
            }

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

                const tagName = el.tagName.toLowerCase()
                if (['input', 'textarea', 'select'].includes(tagName)) {
                    const classList = Array.from(el.classList)
                    if (classList.length > 0) {
                        return `${tagName}.${classList[0]}`
                    }
                }

                return null
            }

            const isInViewport = (rect: DOMRect): boolean => {
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

            const distance = (a: { centerX: number; centerY: number }, b: { centerX: number; centerY: number }): number => {
                return Math.sqrt(
                    Math.pow(a.centerX - b.centerX, 2) +
                    Math.pow(a.centerY - b.centerY, 2)
                )
            }

            const findLabelAbove = (input: ElementInfo, texts: TextInfo[]): TextInfo | null => {
                const candidates = texts.filter(t =>
                    t.centerY < input.centerY &&
                    (input.centerY - t.centerY) < 150
                )

                if (candidates.length === 0) return null

                candidates.sort((a, b) =>
                    (input.centerY - a.centerY) - (input.centerY - b.centerY)
                )

                return candidates[0]
            }

            const findLabelLeft = (input: ElementInfo, texts: TextInfo[]): TextInfo | null => {
                const candidates = texts.filter(t =>
                    Math.abs(t.centerY - input.centerY) < 30 &&
                    t.centerX < input.centerX
                )

                if (candidates.length === 0) return null

                candidates.sort((a, b) =>
                    (input.centerX - a.centerX) - (input.centerX - b.centerX)
                )

                return candidates[0]
            }

            const findNearest = (input: ElementInfo, texts: TextInfo[], maxDist: number = 200): TextInfo | null => {
                const candidates = texts
                    .map(t => ({ ...t, dist: distance(input, t) }))
                    .filter(t => t.dist < maxDist)
                    .sort((a, b) => a.dist - b.dist)

                return candidates[0] || null
            }

            const findLabelInContainer = (input: ElementInfo, texts: TextInfo[]): TextInfo | null => {
                const containerClasses = ['question', 'form-item', 'form-group', 'field', 'input-group']
                const el = input.element

                for (const cls of containerClasses) {
                    const container = el.closest(`[class*="${cls}"]`)
                    if (container) {
                        const containerRect = container.getBoundingClientRect()
                        const containerTexts = texts.filter(t =>
                            t.rect.top >= containerRect.top &&
                            t.rect.bottom <= containerRect.bottom &&
                            t.rect.left >= containerRect.left &&
                            t.rect.right <= containerRect.right
                        )

                        if (containerTexts.length > 0) {
                            return findLabelAbove(input, containerTexts) || findLabelLeft(input, containerTexts)
                        }
                    }
                }

                return null
            }

            const inputSelectors = [
                'input:not([type="hidden"]):not([disabled])',
                'textarea:not([disabled])',
                'select:not([disabled])'
            ]

            const actionSelectors = [
                'button:not([disabled])',
                'a[href]:not([href=""])',
                '[role="button"]:not([disabled])',
                '[onclick]:not([disabled])'
            ]

            const inputElements: ElementInfo[] = []
            const actionElements: ElementInfo[] = []
            const seenSelectors = new Set<string>()

            for (const selector of inputSelectors) {
                const nodes = document.querySelectorAll(selector)
                nodes.forEach((el) => {
                    const rect = el.getBoundingClientRect()
                    if (!isInViewport(rect) || !isInteractable(el)) return

                    const elementSelector = generateSelector(el)
                    if (!elementSelector || elementSelector.length > 100) return
                    if (seenSelectors.has(elementSelector)) return
                    seenSelectors.add(elementSelector)

                    const tagName = el.tagName.toLowerCase()
                    const inputEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

                    let value: string | undefined
                    if (tagName === 'select') {
                        value = (el as HTMLSelectElement).value || ''
                    } else {
                        value = (inputEl as HTMLInputElement | HTMLTextAreaElement).value || ''
                    }

                    inputElements.push({
                        element: el,
                        tag: tagName,
                        type: (inputEl as HTMLInputElement).type || tagName,
                        selector: elementSelector,
                        rect,
                        centerX: rect.x + rect.width / 2,
                        centerY: rect.y + rect.height / 2,
                        value
                    })
                })
            }

            for (const selector of actionSelectors) {
                const nodes = document.querySelectorAll(selector)
                nodes.forEach((el) => {
                    const rect = el.getBoundingClientRect()
                    if (!isInViewport(rect) || !isInteractable(el)) return

                    const elementSelector = generateSelector(el)
                    if (!elementSelector || elementSelector.length > 100) return
                    if (seenSelectors.has(elementSelector)) return
                    seenSelectors.add(elementSelector)

                    actionElements.push({
                        element: el,
                        tag: el.tagName.toLowerCase(),
                        selector: elementSelector,
                        rect,
                        centerX: rect.x + rect.width / 2,
                        centerY: rect.y + rect.height / 2
                    })
                })
            }

            const textNodes: TextInfo[] = []
            const textElements = document.querySelectorAll('label, p, span, div, h1, h2, h3, h4, h5, h6, td, th, li')

            textElements.forEach((el) => {
                const text = (el.textContent || '').trim()
                if (!text || text.length === 0 || text.length > 100) return

                const rect = el.getBoundingClientRect()
                if (!isInViewport(rect)) return

                const style = window.getComputedStyle(el)
                if (style.display === 'none' || style.visibility === 'hidden') return

                textNodes.push({
                    text,
                    rect,
                    centerX: rect.x + rect.width / 2,
                    centerY: rect.y + rect.height / 2
                })
            })

            const seenTexts = new Set<string>()
            const uniqueTexts = textNodes.filter(t => {
                if (seenTexts.has(t.text)) return false
                seenTexts.add(t.text)
                return true
            })

            for (const input of inputElements) {
                let labelText = ''
                let displayText = ''

                const containerLabel = findLabelInContainer(input, uniqueTexts)
                if (containerLabel) {
                    labelText = containerLabel.text
                } else {
                    const aboveLabel = findLabelAbove(input, uniqueTexts)
                    if (aboveLabel) {
                        labelText = aboveLabel.text
                    } else {
                        const leftLabel = findLabelLeft(input, uniqueTexts)
                        if (leftLabel) {
                            labelText = leftLabel.text
                        } else {
                            const nearestLabel = findNearest(input, uniqueTexts)
                            if (nearestLabel) {
                                labelText = nearestLabel.text
                            }
                        }
                    }
                }

                const inputEl = input.element as HTMLInputElement | HTMLTextAreaElement
                const placeholder = inputEl.placeholder || input.element.getAttribute('aria-label') || ''

                if (labelText) {
                    displayText = labelText
                } else if (placeholder) {
                    displayText = placeholder
                } else {
                    displayText = `[${input.type || input.tag}]`
                }

                items.push({
                    tag: input.tag,
                    text: displayText,
                    selector: input.selector,
                    value: input.value,
                    type: input.type,
                    label: labelText || undefined,
                    position: {
                        x: Math.round(input.rect.x),
                        y: Math.round(input.rect.y),
                        width: Math.round(input.rect.width),
                        height: Math.round(input.rect.height)
                    }
                })
            }

            for (const action of actionElements) {
                const text = (action.element.textContent || '').trim() || `[${action.tag}]`

                items.push({
                    tag: action.tag,
                    text,
                    selector: action.selector,
                    position: {
                        x: Math.round(action.rect.x),
                        y: Math.round(action.rect.y),
                        width: Math.round(action.rect.width),
                        height: Math.round(action.rect.height)
                    }
                })
            }

            items.sort((a, b) => {
                const yPosA = a.position?.y || 0
                const yPosB = b.position?.y || 0
                return yPosA - yPosB
            })

            return items
        })

        return result
    }

    async detectVerification(conversationId: string): Promise<boolean> {
        const instance = this.browsers.get(conversationId)
        if (!instance) return false

        const {page} = instance
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

            const bodyText = await page.locator('body').innerText({timeout: 1000}).catch(() => '')
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

    async detectLoginPage(conversationId: string): Promise<boolean> {
        const instance = this.browsers.get(conversationId)
        if (!instance) return false

        const {page} = instance
        try {
            const url = page.url().toLowerCase()

            const loginUrlPatterns = [
                '/login',
                '/signin',
                '/sign-in',
                '/auth',
                '/passport',
                '/account/login',
                '/user/login',
                '/member/login',
                '/register',
                '/signup',
                '/verification',
                '/verify',
                'login.',
                'signin.',
                'auth.',
            ]

            for (const pattern of loginUrlPatterns) {
                if (url.includes(pattern)) {
                    console.log(`[登录检测] URL 匹配: ${pattern}`)
                    return true
                }
            }

            const loginSelectors = [
                'input[type="password"]',
                'input[type="email"][name*="login"]',
                'input[placeholder*="账号"]',
                'input[placeholder*="用户名"]',
                '.login-form',
                '.signin-form',
                '#login-form',
                '[class*="login"]',
                '[id*="login"]',
            ]

            for (const selector of loginSelectors) {
                const element = await page.$(selector)
                if (element) {
                    const isVisible = await element.isVisible()
                    if (isVisible) {
                        console.log(`[登录检测] 选择器匹配: ${selector}`)
                        return true
                    }
                }
            }

            const bodyText = await page.locator('body').innerText({timeout: 1000}).catch(() => '')
            const pageTitle = await page.title()
            const combinedText = (bodyText + ' ' + pageTitle).toLowerCase()

            const loginKeywords = [
                '登录',
                '账号登录',
                '扫码登录',
                '密码登录',
                '注册',
                'sign in',
                'log in',
                'login',
                'create account',
            ]

            for (const keyword of loginKeywords) {
                if (combinedText.includes(keyword.toLowerCase())) {
                    console.log(`[登录检测] 关键词匹配: ${keyword}`)
                    return true
                }
            }

            return false
        } catch {
            return false
        }
    }

    async closeBrowser(conversationId: string): Promise<boolean> {
        const instance = this.browsers.get(conversationId)
        if (instance) {
            try {
                if (instance.isExisting) {
                    const cdpSession = await instance.browser.newBrowserCDPSession()
                    await cdpSession.send('Browser.close')
                    await cdpSession.detach()
                } else {
                    await instance.browser.close()
                }
            } catch (error) {
                console.error('Failed to close browser:', error)
                try {
                    await instance.browser.close()
                } catch {
                }
            }
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
