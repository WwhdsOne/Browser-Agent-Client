import type {Browser, Page} from 'playwright'
import {exec, spawn} from 'child_process'
import {promisify} from 'util'
import {existsSync, mkdirSync} from 'fs'
import {platform, homedir} from 'os'
import {join, dirname} from 'path'

const execAsync = promisify(exec)

export interface SelectOption {
    value: string
    text: string
}

export interface PageElement {
    index: number
    tag: string
    text: string
    selector: string
    value?: string
    type?: string
    label?: string
    role?: string
    ariaLabel?: string
    ariaExpanded?: string
    ariaChecked?: string
    ariaRequired?: boolean
    ariaDisabled?: boolean
    required?: boolean
    disabled?: boolean
    options?: SelectOption[]
    isNew?: boolean
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
    elementText: string
    scrollInfo?: ScrollInfo
}

export interface Action {
    action_id: string
    action: 'goto' | 'click' | 'input' | 'select' | 'scroll' | 'wait' | 'close_browser' | 'finish_task'
    index?: number
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

    // 转换 jQuery 伪选择器 :contains("text") → Playwright :has-text("text")
    selector = selector.replace(/:contains\(/g, ':has-text(')

    // 剥离其他不支持的 jQuery 伪选择器
    selector = selector.replace(/:visible/g, '')
    selector = selector.replace(/:hidden/g, '')
    selector = selector.replace(/:first/g, '')
    selector = selector.replace(/:last/g, '')
    selector = selector.replace(/:eq\(\d+\)/g, '')

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
    // 缓存上一次提取的元素选择器集合，用于增量 isNew 标记
    private previousSelectors: Map<string, Set<string>> = new Map()

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
            // 方案 Y：优先使用 index 查找 selector，selector 作为后备
            let resolvedSelector = action.selector || ''
            if (action.index !== undefined && !resolvedSelector) {
                resolvedSelector = await this.resolveIndexToSelector(page, action.index)
                if (!resolvedSelector) {
                    return {success: false, error: `未找到编号为 ${action.index} 的元素`}
                }
                console.log(`[executeAction] index=${action.index} → selector=${resolvedSelector}`)
            }

            const context = page.context()
            const pagesBefore = context.pages()
            const urlBefore = page.url()

            switch (action.action) {
                case 'goto':
                    await page.goto(action.url!, {waitUntil: 'domcontentloaded'})
                    break
                case 'click':
                    if (!resolvedSelector) {
                        return {success: false, error: 'click 操作缺少 index 或 selector'}
                    }
                    console.log(`[executeAction] click: index=${action.index} selector=${resolvedSelector}`)
                    await this.highlightElement(page, escapeSelector(resolvedSelector), action.index)
                    await this.smartClick(page, escapeSelector(resolvedSelector))
                    await page.waitForLoadState('domcontentloaded')
                    break
                case 'input':
                    if (!resolvedSelector) {
                        return {success: false, error: 'input 操作缺少 index 或 selector'}
                    }
                    console.log(`[executeAction] input: index=${action.index} selector=${resolvedSelector} value=${action.value}`)
                    const inputSelector = escapeSelector(resolvedSelector)
                    await this.highlightElement(page, inputSelector, action.index)
                    await page.fill(inputSelector, action.value!)
                    await page.press(inputSelector, 'Enter')
                    break
                case 'select':
                    if (!resolvedSelector) {
                        return {success: false, error: 'select 操作缺少 index 或 selector'}
                    }
                    console.log(`[executeAction] select: index=${action.index} selector=${resolvedSelector} value=${action.value}`)
                    await this.highlightElement(page, escapeSelector(resolvedSelector), action.index)
                    await page.selectOption(escapeSelector(resolvedSelector), action.value!)
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
                    return {success: false, error: `未知操作: ${action.action}`}
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

    /**
     * 在目标元素上显示高亮覆盖层，让用户看到 Agent 正在操作哪个元素
     * 高亮持续约 800ms 后自动淡出消失
     */
    private async highlightElement(page: Page, selector: string, index?: number): Promise<void> {
        try {
            await page.evaluate(({sel, idx}: {sel: string, idx?: number}) => {
                const el = document.querySelector(sel)
                if (!el) return

                let rect = el.getBoundingClientRect()

                // 隐藏的 radio/checkbox：查找关联的可见 label 用于高亮定位
                const inputType = (el as HTMLInputElement).type?.toLowerCase()
                if ((rect.width === 0 && rect.height === 0 || window.getComputedStyle(el).display === 'none') && (inputType === 'radio' || inputType === 'checkbox')) {
                    const inputId = el.id
                    // 策略1: 任意带 for="id" 的可见元素
                    if (inputId && rect.width === 0) {
                        const forEl = document.querySelector(`[for="${CSS.escape(inputId)}"]`)
                        if (forEl) rect = forEl.getBoundingClientRect()
                    }
                    // 策略2: 父级 <label>
                    if (rect.width === 0 && rect.height === 0) {
                        const parentLabel = el.closest('label')
                        if (parentLabel) rect = parentLabel.getBoundingClientRect()
                    }
                    // 策略3: 可见兄弟元素
                    if (rect.width === 0 && rect.height === 0) {
                        const parent = el.parentElement
                        if (parent) {
                            for (const sib of Array.from(parent.children)) {
                                if (sib === el) continue
                                const sibHtml = sib as HTMLElement
                                if (sibHtml.offsetWidth === 0 || sibHtml.offsetHeight === 0) continue
                                const sibStyle = window.getComputedStyle(sib)
                                if (sibStyle.display === 'none' || sibStyle.visibility === 'hidden') continue
                                rect = sib.getBoundingClientRect()
                                break
                            }
                        }
                    }
                    // 策略4: 向上查找祖先容器
                    if (rect.width === 0 && rect.height === 0) {
                        const container = el.closest('[class*="radio"], [class*="check"], [class*="ui-radio"], [class*="ui-check"], [class*="field"]')
                        if (container) {
                            if (inputId) {
                                const forEl = container.querySelector(`[for="${CSS.escape(inputId)}"]`)
                                if (forEl) rect = forEl.getBoundingClientRect()
                            }
                            if (rect.width === 0 && rect.height === 0) {
                                const candidates = container.querySelectorAll('a, div, span, label')
                                for (const c of Array.from(candidates)) {
                                    const cHtml = c as HTMLElement
                                    if (cHtml.offsetWidth > 0 && cHtml.offsetHeight > 0) {
                                        rect = c.getBoundingClientRect()
                                        break
                                    }
                                }
                            }
                        }
                    }
                }

                if (rect.width === 0 && rect.height === 0) return

                // 创建高亮覆盖层
                const overlay = document.createElement('div')
                overlay.setAttribute('data-agent-highlight', 'true')
                Object.assign(overlay.style, {
                    position: 'fixed',
                    zIndex: '2147483647',
                    pointerEvents: 'none',
                    border: '2px solid #4A90D9',
                    background: 'rgba(74, 144, 217, 0.12)',
                    borderRadius: '3px',
                    top: `${rect.top}px`,
                    left: `${rect.left}px`,
                    width: `${rect.width}px`,
                    height: `${rect.height}px`,
                    transition: 'opacity 0.3s ease-out',
                    opacity: '1',
                    boxSizing: 'border-box',
                })

                // 如果有编号，在左上角显示标签
                if (idx !== undefined) {
                    const label = document.createElement('span')
                    Object.assign(label.style, {
                        position: 'absolute',
                        top: '-20px',
                        left: '-2px',
                        background: '#4A90D9',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        lineHeight: '18px',
                        padding: '0 5px',
                        borderRadius: '2px',
                        whiteSpace: 'nowrap',
                        fontFamily: 'monospace',
                    })
                    label.textContent = `[${idx}]`
                    overlay.appendChild(label)
                }

                document.body.appendChild(overlay)

                // 800ms 后淡出并移除
                setTimeout(() => {
                    overlay.style.opacity = '0'
                    setTimeout(() => overlay.remove(), 300)
                }, 800)
            }, {sel: selector, idx: index})
        } catch (e) {
            // 高亮失败不影响主流程，静默忽略
            console.warn('[highlightElement] 高亮注入失败:', e)
        }
    }

    /**
     * 通过 index 编号查找当前页面对应元素的 selector
     * 用于方案 Y：LLM 返回 index，BrowserManager 查找对应 selector
     */
    private async resolveIndexToSelector(page: Page, index: number): Promise<string | null> {
        try {
            const selector = await page.evaluate((targetIndex: number) => {
                const viewportHeight = window.innerHeight
                const viewportWidth = window.innerWidth

                const generateSelector = (el: Element): string | null => {
                    if (el.id) return `#${el.id}`
                    const name = el.getAttribute('name')
                    if (name) return `[name="${name}"]`
                    const ariaLabel = el.getAttribute('aria-label')
                    if (ariaLabel) return `[aria-label="${ariaLabel}"]`
                    const placeholder = el.getAttribute('placeholder')
                    if (placeholder && placeholder.length < 30) return `[placeholder="${placeholder}"]`
                    if (el.tagName.toLowerCase() === 'a') {
                        const href = el.getAttribute('href')
                        if (href && href.length < 80 && !href.startsWith('javascript:')) return `a[href="${href}"]`
                    }
                    const tagName = el.tagName.toLowerCase()
                    if (['input', 'textarea', 'select'].includes(tagName)) {
                        const classList = Array.from(el.classList)
                        if (classList.length > 0) return `${tagName}.${classList[0]}`
                    }
                    return null
                }

                const isInViewport = (rect: DOMRect): boolean =>
                    rect.top < viewportHeight && rect.bottom > 0 && rect.left < viewportWidth && rect.right > 0

                const isInteractable = (el: Element): boolean => {
                    const style = window.getComputedStyle(el)
                    if (style.display === 'none' || style.visibility === 'hidden') return false
                    if (style.opacity === '0') return false
                    const htmlEl = el as HTMLElement
                    return htmlEl.offsetWidth > 0 && htmlEl.offsetHeight > 0
                }

                const allSelectors = [
                    'input:not([type="hidden"]):not([disabled])',
                    'textarea:not([disabled])',
                    'select:not([disabled])',
                    'button:not([disabled])',
                    'a[href]:not([href=""])',
                    '[role="button"]:not([disabled])',
                    '[role="link"]:not([disabled])',
                    '[role="tab"]:not([disabled])',
                    '[role="menuitem"]:not([disabled])',
                    '[role="option"]:not([disabled])',
                    '[role="checkbox"]:not([disabled])',
                    '[role="radio"]:not([disabled])',
                    '[role="switch"]:not([disabled])',
                    '[onclick]:not([disabled])'
                ]

                const seen = new Set<string>()
                const collected: { selector: string; y: number; x: number }[] = []

                for (const sel of allSelectors) {
                    document.querySelectorAll(sel).forEach(el => {
                        const rect = el.getBoundingClientRect()
                        if (!isInViewport(rect) || !isInteractable(el)) return
                        const elementSelector = generateSelector(el)
                        if (!elementSelector || elementSelector.length > 100) return
                        if (seen.has(elementSelector)) return
                        seen.add(elementSelector)
                        collected.push({selector: elementSelector, y: rect.y + rect.height / 2, x: rect.x + rect.width / 2})
                    })
                }

                collected.sort((a, b) => a.y - b.y || a.x - b.x)
                return collected[targetIndex]?.selector || null
            }, index)

            return selector
        } catch (error) {
            console.error(`[resolveIndexToSelector] 查找 index=${index} 失败:`, error)
            return null
        }
    }

    async getPageState(conversationId: string): Promise<PageState> {
        const instance = this.browsers.get(conversationId)
        if (!instance) {
            return {url: '', title: '', elements: [], elementText: ''}
        }

        const {page} = instance

        const t0 = Date.now()
        const url = page.url()
        console.log(`[getState] url: ${Date.now() - t0}ms`)

        const t1 = Date.now()
        const title = await page.title()
        console.log(`[getState] title: ${Date.now() - t1}ms`)

        const t2 = Date.now()
        const elements = await this.extractPageElements(page, conversationId)
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

        // 生成 LLM 可读的编号索引文本
        const elementText = this.generateElementText(url, title, elements, scrollInfo)

        console.log(`[getState] 总计: ${Date.now() - t0}ms, 元素数: ${elements.length}`)
        return {url, title, elements, elementText, scrollInfo}
    }

    /**
     * 生成 LLM 可读的编号索引文本
     * 格式参考 browser-use 的 DOM 序列化输出，但更轻量
     */
    private generateElementText(url: string, title: string, elements: PageElement[], scrollInfo?: ScrollInfo): string {
        const lines: string[] = []

        // 页面头部信息
        lines.push(`页面: ${url}`)
        lines.push(`标题: ${title}`)

        if (scrollInfo) {
            const scrollHints: string[] = []
            if (scrollInfo.hasMoreAbove) scrollHints.push('上方有更多内容')
            if (scrollInfo.hasMoreBelow) scrollHints.push('下方有更多内容')
            if (scrollHints.length > 0) {
                lines.push(`滚动: ${scrollHints.join(', ')}`)
            }
        }

        lines.push('')
        lines.push('可交互元素:')

        for (const el of elements) {
            const prefix = el.isNew ? '*' : ''
            let line = `${prefix}[${el.index}] `

            // 标签和类型
            const tag = el.tag
            const attrs: string[] = []

            if (el.type && el.type !== el.tag) attrs.push(`type="${el.type}"`)
            if (el.role) attrs.push(`role="${el.role}"`)
            if (el.ariaLabel) attrs.push(`aria-label="${el.ariaLabel}"`)
            if (el.ariaExpanded) attrs.push(`aria-expanded="${el.ariaExpanded}"`)
            if (el.ariaChecked) attrs.push(`aria-checked="${el.ariaChecked}"`)
            if (el.required || el.ariaRequired) attrs.push('required')
            if (el.disabled || el.ariaDisabled) attrs.push('disabled')

            line += `<${tag}`
            if (attrs.length > 0) line += ' ' + attrs.join(' ')
            line += `> ${el.text}</${tag}>`

            // Label 附加信息
            if (el.label && el.label !== el.text) {
                line += ` (标签: ${el.label})`
            }

            // Select 选项列表
            if (el.options && el.options.length > 0) {
                const optTexts = el.options.slice(0, 10).map(o => o.text || o.value)
                line += ` [选项: ${optTexts.join(', ')}]`
                if (el.options.length > 10) line += ` ...共${el.options.length}项`
            }

            // 当前值
            if (el.value && el.type !== 'password') {
                const displayVal = el.value.length > 50 ? el.value.slice(0, 50) + '...' : el.value
                line += ` (当前值: "${displayVal}")`
            }

            lines.push(line)
        }

        if (elements.some(e => e.isNew)) {
            lines.push('')
            lines.push('* 标记为本次新增的元素')
        }

        return lines.join('\n')
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

    private async extractPageElements(page: Page, conversationId: string): Promise<PageElement[]> {
        // 获取上一次的选择器集合用于增量标记
        const prevSelectors = this.previousSelectors.get(conversationId) || new Set<string>()

        const result = await page.evaluate((prevSelectorArr: string[]) => {
            const prevSelectors = new Set(prevSelectorArr)
            const viewportHeight = window.innerHeight
            const viewportWidth = window.innerWidth
            const items: any[] = []

            // --- 辅助函数 ---
            const generateSelector = (el: Element): string | null => {
                if (el.id) return `#${el.id}`
                const name = el.getAttribute('name')
                if (name) return `[name="${name}"]`
                const ariaLabel = el.getAttribute('aria-label')
                if (ariaLabel) return `[aria-label="${ariaLabel}"]`
                const placeholder = el.getAttribute('placeholder')
                if (placeholder && placeholder.length < 30) return `[placeholder="${placeholder}"]`
                if (el.tagName.toLowerCase() === 'a') {
                    const href = el.getAttribute('href')
                    if (href && href.length < 80 && !href.startsWith('javascript:')) return `a[href="${href}"]`
                }
                const tagName = el.tagName.toLowerCase()
                if (['input', 'textarea', 'select'].includes(tagName)) {
                    const classList = Array.from(el.classList)
                    if (classList.length > 0) return `${tagName}.${classList[0]}`
                }
                return null
            }

            const isInViewport = (rect: DOMRect): boolean =>
                rect.top < viewportHeight && rect.bottom > 0 && rect.left < viewportWidth && rect.right > 0

            const isInteractable = (el: Element): boolean => {
                const style = window.getComputedStyle(el)
                if (style.display === 'none' || style.visibility === 'hidden') return false
                if (style.opacity === '0') return false
                const htmlEl = el as HTMLElement
                if (htmlEl.offsetWidth === 0 || htmlEl.offsetHeight === 0) return false
                return true
            }

            const distance = (a: { cx: number; cy: number }, b: { cx: number; cy: number }): number =>
                Math.sqrt((a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2)

            const findLabelAbove = (input: any, texts: any[]): any | null => {
                const candidates = texts.filter(t => t.cy < input.cy && (input.cy - t.cy) < 150)
                if (!candidates.length) return null
                candidates.sort((a: any, b: any) => (input.cy - a.cy) - (input.cy - b.cy))
                return candidates[0]
            }

            const findLabelLeft = (input: any, texts: any[]): any | null => {
                const candidates = texts.filter(t => Math.abs(t.cy - input.cy) < 30 && t.cx < input.cx)
                if (!candidates.length) return null
                candidates.sort((a: any, b: any) => (input.cx - a.cx) - (input.cx - b.cx))
                return candidates[0]
            }

            const findNearest = (input: any, texts: any[], maxDist = 200): any | null => {
                return texts
                    .map(t => ({ ...t, dist: distance(input, t) }))
                    .filter(t => t.dist < maxDist)
                    .sort((a: any, b: any) => a.dist - b.dist)[0] || null
            }

            const findLabelInContainer = (input: any, texts: any[]): any | null => {
                const containerClasses = ['question', 'form-item', 'form-group', 'field', 'input-group']
                for (const cls of containerClasses) {
                    const container = input.el.closest(`[class*="${cls}"]`)
                    if (container) {
                        const cr = container.getBoundingClientRect()
                        const ct = texts.filter(t => t.rect.top >= cr.top && t.rect.bottom <= cr.bottom)
                        if (ct.length) return findLabelAbove(input, ct) || findLabelLeft(input, ct)
                    }
                }
                return null
            }

            // --- 采集可交互元素 ---
            const inputSelectors = [
                'input:not([type="hidden"]):not([disabled])',
                'textarea:not([disabled])',
                'select:not([disabled])'
            ]
            const actionSelectors = [
                'button:not([disabled])',
                'a[href]:not([href=""])',
                '[role="button"]:not([disabled])',
                '[role="link"]:not([disabled])',
                '[role="tab"]:not([disabled])',
                '[role="menuitem"]:not([disabled])',
                '[role="option"]:not([disabled])',
                '[role="checkbox"]:not([disabled])',
                '[role="radio"]:not([disabled])',
                '[role="switch"]:not([disabled])',
                '[onclick]:not([disabled])'
            ]

            const seenSelectors = new Set<string>()
            const allCollected: any[] = []

            // 采集输入类元素
            for (const sel of inputSelectors) {
                document.querySelectorAll(sel).forEach(el => {
                    const rect = el.getBoundingClientRect()
                    const inputType = (el as HTMLInputElement).type?.toLowerCase()

                    // radio/checkbox 常被隐藏，改为查找可见的关联 label
                    let isVisible = isInViewport(rect) && isInteractable(el)
                    let effectiveRect = rect
                    let labelEl: Element | null = null

                    if (!isVisible && (inputType === 'radio' || inputType === 'checkbox')) {
                        // 策略1: 任意带 for="inputId" 的可见元素（<label>、<div class="label"> 等）
                        const inputId = el.id
                        if (inputId) {
                            const forEl = document.querySelector(`[for="${CSS.escape(inputId)}"]`)
                            if (forEl && isInteractable(forEl)) {
                                const forRect = forEl.getBoundingClientRect()
                                if (isInViewport(forRect)) {
                                    isVisible = true
                                    effectiveRect = forRect
                                    labelEl = forEl
                                }
                            }
                        }

                        // 策略2: 父级 <label>
                        if (!isVisible) {
                            const parentLabel = el.closest('label')
                            if (parentLabel && isInteractable(parentLabel)) {
                                const labelRect = parentLabel.getBoundingClientRect()
                                if (isInViewport(labelRect)) {
                                    isVisible = true
                                    effectiveRect = labelRect
                                    labelEl = parentLabel
                                }
                            }
                        }

                        // 策略3: 同级可见元素（问卷网站常见：隐藏 input + 自定义样式兄弟节点）
                        if (!isVisible) {
                            const parent = el.parentElement
                            if (parent) {
                                for (const sibling of Array.from(parent.children)) {
                                    if (sibling === el) continue
                                    const sibHtml = sibling as HTMLElement
                                    if (sibHtml.offsetWidth === 0 || sibHtml.offsetHeight === 0) continue
                                    const sibStyle = window.getComputedStyle(sibling)
                                    if (sibStyle.display === 'none' || sibStyle.visibility === 'hidden') continue
                                    const sibRect = sibling.getBoundingClientRect()
                                    if (!isInViewport(sibRect)) continue
                                    // 不用词边界，匹配 jqradio、jqcheckbox 等拼接类名
                                    const sibClass = (sibling.className || '').toString().toLowerCase()
                                    const sibTag = sibling.tagName.toLowerCase()
                                    if (/label|radio|check|box|indicator|mark|icon/i.test(sibClass) || sibTag === 'label') {
                                        isVisible = true
                                        effectiveRect = sibRect
                                        labelEl = sibling
                                        break
                                    }
                                }
                            }
                        }

                        // 策略4: 向上查找祖先容器内的可见元素（wjx.cn: input→span→div.ui-radio, label 在 div.ui-radio 下）
                        if (!isVisible) {
                            const containers = el.closest('[class*="radio"], [class*="check"], [class*="ui-radio"], [class*="ui-check"], [class*="field"]')
                            if (containers) {
                                // 优先找带 for 属性的元素
                                if (inputId) {
                                    const forInContainer = containers.querySelector(`[for="${CSS.escape(inputId)}"]`)
                                    if (forInContainer && isInteractable(forInContainer)) {
                                        const forRect = forInContainer.getBoundingClientRect()
                                        if (isInViewport(forRect)) {
                                            isVisible = true
                                            effectiveRect = forRect
                                            labelEl = forInContainer
                                        }
                                    }
                                }
                                // 找容器内可见的关联元素
                                if (!isVisible) {
                                    const candidates = containers.querySelectorAll('a, div, span, label')
                                    for (const candidate of Array.from(candidates)) {
                                        if (candidate === el || !isInteractable(candidate)) continue
                                        const candRect = candidate.getBoundingClientRect()
                                        if (!isInViewport(candRect)) continue
                                        const candClass = (candidate.className || '').toString().toLowerCase()
                                        if (/radio|check|box|label|indicator/i.test(candClass)) {
                                            isVisible = true
                                            effectiveRect = candRect
                                            labelEl = candidate
                                            break
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (!isVisible) return
                    const elementSelector = generateSelector(el)
                    if (!elementSelector || elementSelector.length > 100) return
                    if (seenSelectors.has(elementSelector)) return
                    seenSelectors.add(elementSelector)

                    const tagName = el.tagName.toLowerCase()
                    const inputEl = el as HTMLInputElement
                    const value = tagName === 'select' ? (el as HTMLSelectElement).value || '' : inputEl.value || ''

                    // 提取 select 选项
                    let options: { value: string; text: string }[] | undefined
                    if (tagName === 'select') {
                        options = Array.from((el as HTMLSelectElement).options).map(opt => ({
                            value: opt.value,
                            text: opt.textContent?.trim() || ''
                        }))
                    }

                    // 从关联 label 提取文本
                    let labelTextFromLabel = ''
                    if (labelEl) {
                        labelTextFromLabel = (labelEl.textContent || '').trim().slice(0, 80)
                    }

                    allCollected.push({
                        el, tag: tagName, type: inputEl.type || tagName, selector: elementSelector,
                        rect: effectiveRect, cx: effectiveRect.x + effectiveRect.width / 2, cy: effectiveRect.y + effectiveRect.height / 2, value, options,
                        isInput: true, labelTextFromLabel
                    })
                })
            }

            // 采集操作类元素
            for (const sel of actionSelectors) {
                document.querySelectorAll(sel).forEach(el => {
                    const rect = el.getBoundingClientRect()
                    if (!isInViewport(rect) || !isInteractable(el)) return
                    const elementSelector = generateSelector(el)
                    if (!elementSelector || elementSelector.length > 100) return
                    if (seenSelectors.has(elementSelector)) return
                    seenSelectors.add(elementSelector)

                    allCollected.push({
                        el, tag: el.tagName.toLowerCase(), selector: elementSelector,
                        rect, cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2,
                        isInput: false
                    })
                })
            }

            // --- 采集文本节点用于 label 关联 ---
            const textNodes: any[] = []
            const seenTexts = new Set<string>()
            document.querySelectorAll('label, p, span, div, h1, h2, h3, h4, h5, h6, td, th, li').forEach(el => {
                const text = (el.textContent || '').trim()
                if (!text || text.length === 0 || text.length > 100) return
                const rect = el.getBoundingClientRect()
                if (!isInViewport(rect)) return
                const style = window.getComputedStyle(el)
                if (style.display === 'none' || style.visibility === 'hidden') return
                if (seenTexts.has(text)) return
                seenTexts.add(text)
                textNodes.push({ text, rect, cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2 })
            })

            // --- 构建输出 ---
            // 按 Y 位置排序，然后分配编号
            allCollected.sort((a, b) => a.cy - b.cy || a.cx - b.cx)
            let index = 0

            for (const item of allCollected) {
                const el = item.el as HTMLElement
                const isNew = !prevSelectors.has(item.selector)

                // Label 关联
                let labelText = ''
                // 优先使用从可见关联 label 提取的文本（radio/checkbox 场景）
                if (item.labelTextFromLabel) {
                    labelText = item.labelTextFromLabel
                } else if (item.isInput) {
                    const containerLabel = findLabelInContainer(item, textNodes)
                    if (containerLabel) labelText = containerLabel.text
                    else {
                        const aboveLabel = findLabelAbove(item, textNodes)
                        if (aboveLabel) labelText = aboveLabel.text
                        else {
                            const leftLabel = findLabelLeft(item, textNodes)
                            if (leftLabel) labelText = leftLabel.text
                            else {
                                const nearest = findNearest(item, textNodes)
                                if (nearest) labelText = nearest.text
                            }
                        }
                    }
                }

                const placeholder = el.getAttribute('placeholder') || ''
                let displayText: string
                if (labelText) displayText = labelText
                else if (placeholder) displayText = placeholder
                else if (item.isInput) displayText = `[${item.type || item.tag}]`
                else displayText = (el.textContent || '').trim().slice(0, 80) || `[${item.tag}]`

                const result: any = {
                    index: index++,
                    tag: item.tag,
                    text: displayText,
                    selector: item.selector,
                    isNew,
                    position: {
                        x: Math.round(item.rect.x),
                        y: Math.round(item.rect.y),
                        width: Math.round(item.rect.width),
                        height: Math.round(item.rect.height)
                    }
                }

                // 输入类元素特有属性
                if (item.isInput) {
                    result.type = item.type
                    result.label = labelText || undefined
                    if (item.value) result.value = item.value
                    if (item.options) result.options = item.options
                }

                // ARIA 语义
                const role = el.getAttribute('role')
                if (role) result.role = role
                const ariaLabel = el.getAttribute('aria-label')
                if (ariaLabel) result.ariaLabel = ariaLabel
                const ariaExpanded = el.getAttribute('aria-expanded')
                if (ariaExpanded) result.ariaExpanded = ariaExpanded
                const ariaChecked = el.getAttribute('aria-checked')
                if (ariaChecked) result.ariaChecked = ariaChecked
                const ariaRequired = el.getAttribute('aria-required')
                if (ariaRequired === 'true') result.ariaRequired = true
                const ariaDisabled = el.getAttribute('aria-disabled')
                if (ariaDisabled === 'true') result.ariaDisabled = true

                // HTML 原生属性
                if ('required' in el && (el as HTMLInputElement).required) result.required = true
                if ('disabled' in el && (el as HTMLInputElement).disabled) result.disabled = true

                items.push(result)
            }

            return { items, selectors: Array.from(seenSelectors) }
        }, Array.from(prevSelectors))

        // 更新缓存
        this.previousSelectors.set(conversationId, new Set(result.selectors))
        return result.items
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
            this.previousSelectors.delete(conversationId)
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
