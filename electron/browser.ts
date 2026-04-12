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
    screenshot?: string // base64 编码的带标签截图（供视觉模型使用）
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

export interface DownloadInfo {
    filename: string        // 原始文件名
    suggestedFilename: string // 浏览器建议的文件名
    path?: string           // 保存路径（如果可获取）
}

export interface ActionResult {
    success: boolean
    error?: string
    pageState?: PageState
    downloadInfo?: DownloadInfo // 下载文件信息
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
            const pagesCountBefore = pagesBefore.length

            // 下载处理
            let downloadInfo: DownloadInfo | undefined = undefined
            let downloadPromise: Promise<DownloadInfo> | null = null

            switch (action.action) {
                case 'goto':
                    await page.goto(action.url!, {waitUntil: 'domcontentloaded', timeout: 10000})
                    break
                case 'click':
                    if (!resolvedSelector) {
                        return {success: false, error: 'click 操作缺少 index 或 selector'}
                    }

                    // 处理选择题选项（有 option_index 的情况）
                    if (action.option_index !== undefined) {
                        // action.index 指向题目，action.option_index 指向选项
                        console.log(`[executeAction] click: question index=${action.index}, option_index=${action.option_index}`)

                        // 1. 先获取题目元素
                        const questionElement = await page.evaluate((idx) => {
                            const elements = window.__lbagent_elements || []
                            return elements[idx] || null
                        }, action.index)

                        if (!questionElement || questionElement.type !== 'question') {
                            return {success: false, error: `元素 ${action.index} 不是选择题题目`}
                        }

                        if (!questionElement.options || action.option_index >= questionElement.options.length) {
                            return {success: false, error: `选项索引 ${action.option_index} 超出范围`}
                        }

                        // 2. 获取目标选项的 selector
                        const targetOption = questionElement.options[action.option_index]
                        resolvedSelector = targetOption.selector
                        console.log(`[executeAction] → resolved selector: ${resolvedSelector}`)
                    } else {
                        console.log(`[executeAction] click: index=${action.index} selector=${resolvedSelector}`)
                    }

                    // 设置下载事件监听（在点击之前）
                    downloadPromise = new Promise<DownloadInfo>((resolve) => {
                        const timeout = setTimeout(() => {
                            console.log('[下载] 未检测到下载事件（可能不是下载链接）')
                            resolve({filename: '', suggestedFilename: ''})
                        }, 2000)

                        page.once('download', async (download) => {
                            clearTimeout(timeout)
                            console.log(`[下载] 检测到下载: ${download.suggestedFilename()}`)

                            try {
                                // 等待下载完成
                                const path = await download.path()
                                console.log(`[下载] 保存到: ${path}`)

                                resolve({
                                    filename: download.suggestedFilename(),
                                    suggestedFilename: download.suggestedFilename(),
                                    path
                                })
                            } catch (error) {
                                console.error('[下载] 处理失败:', error)
                                resolve({
                                    filename: download.suggestedFilename(),
                                    suggestedFilename: download.suggestedFilename()
                                })
                            }
                        })
                    })

                    await this.highlightElement(page, escapeSelector(resolvedSelector), action.index)
                    await this.smartClick(page, escapeSelector(resolvedSelector))

                    // 等待下载事件（如果有）
                    if (downloadPromise) {
                        downloadInfo = await downloadPromise
                        if (downloadInfo.filename) {
                            console.log(`[下载] 文件已保存: ${downloadInfo.filename}`)
                        }
                    }

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

            await page.waitForTimeout(5000)

            const pagesAfter = context.pages()
            const pagesCountAfter = pagesAfter.length

            // 检查是否有新页面打开（数量增加）
            if (pagesCountAfter > pagesCountBefore) {
                // 有新页面打开，新页面通常是最后一个
                const newPage = pagesAfter[pagesAfter.length - 1]
                const oldPage = pagesAfter[0]  // 最早的页面

                console.log(`[页面管理] 检测到新页面打开（${pagesCountBefore} → ${pagesCountAfter}）`)
                console.log(`[页面管理] 最早页面: ${oldPage.url()}`)
                console.log(`[页面管理] 最新页面: ${newPage.url()}`)

                // 只关闭最早的页面
                if (oldPage !== newPage && !oldPage.isClosed()) {
                    console.log(`[关闭最早页面] ${oldPage.url()}`)
                    await oldPage.close().catch(() => {})
                }

                // 切换到新页面
                this.browsers.set(conversationId, {browser, page: newPage, isExisting: instance.isExisting})
                console.log(`[保留新页面] ${newPage.url()}`)
            } else if (pagesCountAfter === pagesCountBefore && page.url() !== urlBefore) {
                // 页面数量没变，但URL变了（当前页面导航到新URL）
                console.log(`[页面管理] URL变化: ${urlBefore} → ${page.url()}`)
            }

            const pageState = await this.getPageState(conversationId)
            return {success: true, pageState, downloadInfo}
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
                // 直接从保存的元素列表读取，而不是重新收集
                const elements = window.__lbagent_elements || []

                console.log(`[resolveIndexToSelector] 查找 index=${targetIndex}，元素总数=${elements.length}`)

                if (targetIndex < 0 || targetIndex >= elements.length) {
                    console.error(`[resolveIndexToSelector] index ${targetIndex} 超出范围！`)
                    console.error(`[resolveIndexToSelector] 可用元素:`, elements.map((el, i) => ({
                        index: i,
                        tag: el.tag,
                        text: el.text?.slice(0, 50)
                    })))
                    return null
                }

                const targetElement = elements[targetIndex]
                if (!targetElement) {
                    console.error(`[resolveIndexToSelector] 元素 ${targetIndex} 为空！`)
                    return null
                }

                console.log(`[resolveIndexToSelector] index=${targetIndex} (${targetElement.tag}) → ${targetElement.selector}`)
                return targetElement.selector
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

        // 等待页面稳定（处理页面跳转中的上下文销毁问题）
        try {
            await page.waitForLoadState('domcontentloaded', {timeout: 3000}).catch(() => {
                // 忽略超时，页面可能已经加载完成
            })
        } catch (e) {
            // 忽略错误，继续尝试提取状态
        }

        const t0 = Date.now()
        const url = page.url()
        console.log(`[getState] url: ${Date.now() - t0}ms`)

        const t1 = Date.now()
        let title = ''
        try {
            title = await page.title()
            console.log(`[getState] title: ${Date.now() - t1}ms`)
        } catch (e) {
            // 页面跳转中，使用 URL 作为标题
            console.warn(`[getState] title() 失败，使用 URL 作为标题:`, e)
            title = url
        }

        const t2 = Date.now()
        let elements: PageElement[] = []
        try {
            elements = await this.extractPageElements(page, conversationId)
            console.log(`[getState] extractPageElements: ${Date.now() - t2}ms`)
        } catch (e) {
            // 页面跳转中，返回空元素列表
            console.warn(`[getState] extractPageElements 失败，返回空列表:`, e)
            elements = []
        }

        // 保存元素列表到页面，供 executeAction 使用（特别是处理 option_index）
        if (elements.length > 0) {
            try {
                await page.evaluate((elems: any[]) => {
                    window.__lbagent_elements = elems
                }, elements)
            } catch (e) {
                console.warn(`[getState] 保存元素列表失败，跳过:`, e)
            }
        }

        const t3 = Date.now()
        let scrollInfo: ScrollInfo | undefined
        try {
            scrollInfo = await page.evaluate(() => {
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
        } catch (e) {
            console.warn(`[getState] scrollInfo 获取失败，跳过:`, e)
        }

        // 生成 LLM 可读的编号索引文本
        const elementText = this.generateElementText(url, title, elements, scrollInfo)

        // 拍摄带编号标签的截图（供视觉模型使用）
        const t4 = Date.now()
        let screenshot = ''
        try {
            screenshot = await this.takeScreenshotWithLabels(page, elements)
            console.log(`[getState] screenshot: ${Date.now() - t4}ms, size: ${(screenshot.length / 1024).toFixed(1)}KB`)
        } catch (e) {
            console.warn(`[getState] screenshot 失败，跳过截图:`, e)
        }

        console.log(`[getState] 总计: ${Date.now() - t0}ms, 元素数: ${elements.length}`)
        return {url, title, elements, elementText, scrollInfo, screenshot}
    }

    private async injectElementLabels(page: Page, elements: PageElement[]): Promise<void> {
        // 只处理有 position 的元素
        const items = elements
            .filter(el => el.position && el.position.width > 0 && el.position.height > 0)
            .map(el => ({index: el.index, x: el.position!.x, y: el.position!.y}))

        await page.evaluate((items) => {
            // 移除已有标签
            document.querySelectorAll('[data-vision-label]').forEach(el => el.remove())

            // 创建全屏透明容器
            const container = document.createElement('div')
            container.id = 'lbagent-vision-labels'
            container.setAttribute('data-vision-label', 'container')
            container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483646;overflow:visible;margin:0;padding:0;'

            // 为每个元素创建编号标签
            for (const item of items) {
                const label = document.createElement('div')
                label.setAttribute('data-vision-label', 'label')
                label.textContent = `[${item.index}]`
                label.style.cssText = `position:fixed;left:${item.x - 2}px;top:${item.y - 18}px;background:#FF6B35;color:white;padding:1px 4px;font-size:10px;font-weight:bold;border-radius:2px;font-family:monospace;white-space:nowrap;pointer-events:none;line-height:1.3;box-shadow:0 1px 3px rgba(0,0,0,0.3);z-index:2147483647;`
                container.appendChild(label)
            }

            document.body.appendChild(container)
        }, items)
    }

    private async removeElementLabels(page: Page): Promise<void> {
        await page.evaluate(() => {
            document.querySelectorAll('[data-vision-label]').forEach(el => el.remove())
        })
    }

    /** 返回 base64 编码的 JPEG */
    private async takeScreenshotWithLabels(page: Page, elements: PageElement[]): Promise<string> {
        await this.injectElementLabels(page, elements)
        try {
            const buffer = await page.screenshot({type: 'jpeg', quality: 80})
            return buffer.toString('base64')
        } finally {
            await this.removeElementLabels(page)
        }
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
        const prevSelectors = this.previousSelectors.get(conversationId) || new Set<string>()

        const result = await page.evaluate((prevSelectorArr: string[]) => {
            const prevSelectors = new Set(prevSelectorArr)
            const viewportHeight = window.innerHeight
            const viewportWidth = window.innerWidth
            const items: any[] = []
            const seenSelectors = new Set<string>()

            // --- 1. 增强型选择器生成器 ---
            const generateSelector = (el: Element): string | null => {
                if (el.id) return `#${CSS.escape(el.id)}`
                const name = el.getAttribute('name')
                const tagName = el.tagName.toLowerCase()

                if (tagName === 'input') {
                    const inputEl = el as HTMLInputElement
                    const type = inputEl.type?.toLowerCase()
                    // 对于单选/多选，必须加上 value 区分，否则一整组题只能识别出一个选项
                    if ((type === 'radio' || type === 'checkbox') && name) {
                        const val = inputEl.value || 'on'
                        return `input[name="${name}"][value="${val}"]`
                    }
                    if (name) return `input[name="${name}"]`
                }

                const ariaLabel = el.getAttribute('aria-label')
                if (ariaLabel) return `[aria-label="${ariaLabel}"]`
                const placeholder = el.getAttribute('placeholder')
                if (placeholder && placeholder.length < 30) return `[placeholder="${placeholder}"]`

                if (tagName === 'a') {
                    const href = el.getAttribute('href')
                    if (href && href.length < 80 && !href.startsWith('javascript:')) return `a[href="${href}"]`
                }

                const classList = Array.from(el.classList).filter(c => !c.includes('active') && !c.includes('focus'))
                if (classList.length > 0) return `${tagName}.${classList[0]}`

                return null
            }

            const isInViewport = (rect: DOMRect): boolean =>
                rect.top < viewportHeight && rect.bottom > 0 && rect.left < viewportWidth && rect.right > 0

            const isInteractable = (el: Element): boolean => {
                const style = window.getComputedStyle(el)
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' &&
                    (el as HTMLElement).offsetWidth > 0 && (el as HTMLElement).offsetHeight > 0
            }

            // --- 2. 采集所有可交互元素 ---
            const selectors = [
                'input:not([type="hidden"]):not([disabled])',
                'textarea:not([disabled])',
                'select:not([disabled])',
                'button:not([disabled])',
                'a[href]',
                '[role="button"]',
                '[onclick]'
            ]

            const allCollected: any[] = []
            document.querySelectorAll(selectors.join(',')).forEach(el => {
                const rect = el.getBoundingClientRect()
                let isVisible = isInViewport(rect) && isInteractable(el)
                let effectiveRect = rect

                // 针对隐藏的 radio/checkbox 尝试找关联可见 label
                if (!isVisible && (el.tagName === 'INPUT')) {
                    const type = (el as HTMLInputElement).type
                    if (type === 'radio' || type === 'checkbox') {
                        const label = el.closest('label') || document.querySelector(`label[for="${el.id}"]`)
                        if (label && isInteractable(label)) {
                            const lRect = label.getBoundingClientRect()
                            if (isInViewport(lRect)) {
                                isVisible = true
                                effectiveRect = lRect
                            }
                        }
                    }
                }

                if (!isVisible) return

                const selector = generateSelector(el)
                if (!selector || seenSelectors.has(selector)) return
                seenSelectors.add(selector)

                // 提取文本逻辑
                let elementText = ''
                if (el.tagName === 'INPUT' && ((el as HTMLInputElement).type === 'radio' || (el as HTMLInputElement).type === 'checkbox')) {
                    // 优先从父级或关联 label 拿选项文本
                    const label = el.closest('label') || document.querySelector(`label[for="${el.id}"]`)
                    elementText = label ? (label as HTMLElement).innerText.trim().replace(/\n/g, ' ') : ''
                } else {
                    elementText = (el.textContent || (el as HTMLInputElement).placeholder || '').trim().slice(0, 80)
                }

                allCollected.push({
                    el,
                    selector,
                    text: elementText,
                    rect: effectiveRect,
                    tagName: el.tagName.toLowerCase(),
                    type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
                    isNew: !prevSelectors.has(selector)
                })
            })

            // --- 3. 题目分组排序 ---
            const finalItems: any[] = []
            const questionGroups = new Map<string, any[]>()

            allCollected.forEach(item => {
                const qContainer = item.el.closest('.question, [class*="question"], [id*="q"]')
                if (qContainer && (item.type === 'radio' || item.type === 'checkbox')) {
                    const qId = qContainer.id || qContainer.innerText.slice(0, 20)
                    if (!questionGroups.has(qId)) questionGroups.set(qId, [])
                    questionGroups.get(qId)!.push(item)
                } else {
                    finalItems.push({
                        index: 0,
                        tag: item.tagName,
                        text: item.text,
                        selector: item.selector,
                        isNew: item.isNew,
                        position: { x: Math.round(item.rect.x), y: Math.round(item.rect.y), width: Math.round(item.rect.width), height: Math.round(item.rect.height) }
                    })
                }
            })

            // 处理选择题组
            questionGroups.forEach((options, qId) => {
                const qContainer = options[0].el.closest('.question, [class*="question"], [id*="q"]')
                const titleEl = qContainer?.querySelector('.question-title, [class*="title"], b, strong')
                const titleText = titleEl ? titleEl.innerText.trim() : `问题 ${qId}`

                finalItems.push({
                    index: 0,
                    type: 'question',
                    text: titleText,
                    selector: options[0].selector.split('[')[0] + `_group_${qId}`, // 虚拟组标识
                    isNew: options.some(o => o.isNew),
                    position: { x: Math.round(options[0].rect.x), y: Math.round(options[0].rect.y), width: 0, height: 0 },
                    options: options.map((o, idx) => ({
                        index: idx,
                        text: o.text,
                        selector: o.selector,
                        isNew: o.isNew
                    }))
                })
            })

            // 最后统一排序并分配 Index
            finalItems.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
            finalItems.forEach((item, i) => item.index = i)

            return { items: finalItems, selectors: Array.from(seenSelectors) }
        }, Array.from(prevSelectors))

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

            // ===== 优先级1: URL 检测（最可靠）=====
            const strictLoginUrlPatterns = [
                '/login',
                '/signin',
                '/sign-in',
                '/passport',
                '/account/login',
                '/user/login',
                '/member/login',
            ]

            for (const pattern of strictLoginUrlPatterns) {
                if (url.includes(pattern)) {
                    console.log(`[登录检测] URL 严格匹配: ${pattern}`)
                    return true
                }
            }

            // ===== 优先级2: 选择器组合检测（需要多个特征）=====
            let loginFormCount = 0
            const hasPasswordInput = await page.locator('input[type="password"]').count() > 0
            const hasUsernameInput = await page.locator('input[placeholder*="账号"], input[placeholder*="用户名"], input[placeholder*="username"], input[name*="user"], input[name*="login"]').count() > 0
            const hasLoginFormClass = await page.locator('.login-form, .signin-form, #login-form, #signin-form').count() > 0

            if (hasPasswordInput) loginFormCount++
            if (hasUsernameInput) loginFormCount++
            if (hasLoginFormClass) loginFormCount++

            // 需要至少2个特征才判定为登录页
            if (loginFormCount >= 2) {
                console.log(`[登录检测] 选择器组合匹配 (${loginFormCount}/3): 密码框=${hasPasswordInput}, 用户名框=${hasUsernameInput}, 登录表单=${hasLoginFormClass}`)
                return true
            }

            // ===== 优先级3: 关键词组合检测（需要多个关键词同时出现）=====
            const bodyText = await page.locator('body').innerText({timeout: 1000}).catch(() => '')
            const pageTitle = await page.title()
            const combinedText = (bodyText + ' ' + pageTitle).toLowerCase()

            // 强登录关键词（必须至少出现2个）
            const strongLoginKeywords = [
                '账号登录',
                '扫码登录',
                '密码登录',
                '立即登录',
                '用户登录',
                'login now',
                'sign in now',
            ]

            // 弱登录关键词（需要配合其他条件）
            const weakLoginKeywords = [
                '登录',
                'log in',
                'login',
                '注册账号',
                'create account',
            ]

            const strongMatches = strongLoginKeywords.filter(kw => combinedText.includes(kw.toLowerCase())).length
            const weakMatches = weakLoginKeywords.filter(kw => combinedText.includes(kw.toLowerCase())).length

            // 强关键词至少出现1个，或弱关键词至少出现2个
            if (strongMatches >= 1 || weakMatches >= 2) {
                // 额外验证：页面应该包含登录相关元素（按钮或表单）
                const hasLoginElement = await page.locator('button:has-text("登录"), button:has-text("登录"), button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")').count() > 0

                if (hasLoginElement) {
                    console.log(`[登录检测] 关键词+元素匹配: 强关键词=${strongMatches}, 弱关键词=${weakMatches}`)
                    return true
                }
            }

            console.log(`[登录检测] 未检测到登录页面特征`)
            return false
        } catch (error) {
            console.error('[登录检测] 检测过程出错:', error)
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
