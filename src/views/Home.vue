<template>
  <div class="home-container">
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>会话列表</h2>
        <button @click="showCreateModal = true" class="new-btn">新建会话</button>
      </div>
      <ConversationList
        :conversations="conversationStore.conversations"
        :active-id="conversationStore.currentConversation?.id"
        @select="selectConversation"
        @rename="handleRename"
        @delete="handleDelete"
      />
    </div>
    <div class="main-content">
      <div v-if="conversationStore.currentConversation" class="chat-container">
        <ChatHeader :conversation="conversationStore.currentConversation" />
        <MessageList ref="messageListRef" :messages="currentMessages" />
        
        <div v-if="isPaused" class="pause-banner">
          <div class="pause-content">
            <span class="pause-icon">⏸️</span>
            <span class="pause-text">
              {{ pauseReason === 'login' ? '检测到登录页面，请手动登录后点击继续' : '任务已暂停' }}
            </span>
          </div>
          <button class="resume-btn" @click="handleResume">继续执行</button>
        </div>
        
        <ChatInput @send="handleSend" />
      </div>
      <div v-else class="empty-state">
        <p>选择或创建一个会话开始</p>
      </div>
    </div>
    
    <!-- 创建会话选择弹窗 -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal-content">
        <h3>选择浏览器类型</h3>
        <p class="modal-desc">创建会话后不可修改</p>
        <div class="modal-options">
          <button class="option-btn" @click="createWithNewBrowser">
            <div class="option-icon">🆕</div>
            <div class="option-title">新开浏览器</div>
            <div class="option-desc">启动新的临时 Chrome 浏览器实例</div>
            <div class="option-note">⚠️ 临时浏览器，关闭后数据不保留</div>
          </button>
          <button class="option-btn recommended" @click="checkChromeAndProceed">
            <div class="recommend-badge">推荐</div>
            <div class="option-icon">🔗</div>
            <div class="option-title">连接已有浏览器</div>
            <div class="option-desc">启动带调试端口的 Chrome 并连接</div>
            <div class="option-note">✅ 可复用登录状态，长久保存智能体操作数据</div>
          </button>
        </div>
        <button class="cancel-btn" @click="showCreateModal = false">取消</button>
      </div>
    </div>

    <!-- Chrome 路径选择弹窗 -->
    <div v-if="showChromeModal" class="modal-overlay" @click.self="closeChromeModal">
      <div class="modal-content chrome-modal">
        <h3>{{ chromeStep === 'found' ? '检测到 Chrome' : '选择 Chrome 路径' }}</h3>
        
        <div v-if="chromeStep === 'checking'" class="chrome-checking">
          <div class="spinner"></div>
          <p>正在检测 Chrome...</p>
        </div>
        
        <div v-else-if="chromeStep === 'found'" class="chrome-found">
          <div class="chrome-path-info">
            <span class="label">路径:</span>
            <span class="path">{{ chromePath }}</span>
          </div>
          <p class="chrome-hint">将启动带调试端口的 Chrome 浏览器</p>
          <div class="chrome-actions">
            <button class="secondary-btn" @click="selectChromeManually">选择其他路径</button>
            <button class="primary-btn" @click="launchAndConnect" :disabled="chromeLaunching">
              {{ chromeLaunching ? '启动中...' : '继续' }}
            </button>
          </div>
        </div>
        
        <div v-else-if="chromeStep === 'notfound'" class="chrome-notfound">
          <p class="error-text">{{ chromeError }}</p>
          <p class="chrome-hint">请手动选择 Chrome 可执行文件</p>
          <div class="chrome-path-input">
            <input type="text" v-model="chromePath" placeholder="Chrome 路径" readonly />
            <button class="browse-btn" @click="selectChromeManually">浏览</button>
          </div>
          <div class="chrome-actions">
            <button class="secondary-btn" @click="closeChromeModal">取消</button>
            <button class="primary-btn" @click="launchAndConnect" :disabled="!chromePath || chromeLaunching">
              {{ chromeLaunching ? '启动中...' : '继续' }}
            </button>
          </div>
        </div>
        
        <div v-else-if="chromeStep === 'invalid'" class="chrome-invalid">
          <p class="error-text">{{ chromeError }}</p>
          <p class="chrome-hint">请选择正确的 Chrome 可执行文件</p>
          <div class="chrome-path-input">
            <input type="text" v-model="chromePath" placeholder="Chrome 路径" readonly />
            <button class="browse-btn" @click="selectChromeManually">浏览</button>
          </div>
          <div class="chrome-actions">
            <button class="secondary-btn" @click="closeChromeModal">取消</button>
            <button class="primary-btn" @click="launchAndConnect" :disabled="!chromePath || chromeLaunching">
              {{ chromeLaunching ? '启动中...' : '继续' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="errorMessage" class="error-toast">
      {{ errorMessage }}
      <button @click="errorMessage = ''">×</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useConversationStore } from '@/stores/conversation'
import { useBrowserStore } from '@/stores/browser'
import { WebSocketManager } from '@/utils/websocket'
import type { ServerMessage, Action } from '@/types'
import ConversationList from '@/components/ConversationList.vue'
import ChatHeader from '@/components/ChatHeader.vue'
import MessageList from '@/components/MessageList.vue'
import ChatInput from '@/components/ChatInput.vue'

const router = useRouter()
const userStore = useUserStore()
const conversationStore = useConversationStore()
const browserStore = useBrowserStore()

const wsManager = ref<WebSocketManager | null>(null)
const messageListRef = ref<{ refreshExpandedActions: () => Promise<void> } | null>(null)
const showCreateModal = ref(false)
const showChromeModal = ref(false)
const chromeStep = ref<'checking' | 'found' | 'notfound' | 'invalid'>('checking')
const chromePath = ref('')
const chromeError = ref('')
const chromeLaunching = ref(false)
const errorMessage = ref('')
const isPaused = ref(false)
const pauseReason = ref('')
const pendingActionId = ref('')
const currentTask = ref('')
let currentWSConversationId: string | null = null

const currentMessages = computed(() => {
  if (!conversationStore.currentConversation) return []
  return conversationStore.messages.get(conversationStore.currentConversation.id) || []
})

const refreshConversationList = async () => {
  try {
    await conversationStore.loadConversations()
  } catch (error) {
    console.error('Failed to refresh conversations:', error)
  }
}

const createWithNewBrowser = async () => {
  showCreateModal.value = false
  
  try {
    const conversation = await conversationStore.createConversation('新会话', 'new')
    const browserResult = await browserStore.createBrowser(conversation.id)
    
    if (!browserResult.success) {
      errorMessage.value = browserResult.error || '浏览器启动失败'
      await conversationStore.deleteConversation(conversation.id)
      return
    }
    
    await conversationStore.selectConversation(conversation.id)
    await refreshConversationList()
  } catch (error) {
    console.error('Failed to create conversation:', error)
    errorMessage.value = '创建会话失败'
  }
}

const checkChromeAndProceed = async () => {
  showCreateModal.value = false
  showChromeModal.value = true
  chromeStep.value = 'checking'
  chromePath.value = ''
  chromeError.value = ''
  
  const result = await window.electronAPI.chrome.getDefaultPath()
  
  if (result.found && result.path) {
    chromeStep.value = 'found'
    chromePath.value = result.path
  } else {
    chromeStep.value = 'notfound'
    chromeError.value = result.error || '未找到 Chrome 浏览器'
  }
}

const selectChromeManually = async () => {
  const result = await window.electronAPI.chrome.selectPath()
  
  if (result.canceled) return
  
  if (result.path) {
    chromePath.value = result.path
    const validateResult = await window.electronAPI.chrome.validatePath(result.path)
    
    if (validateResult.found) {
      chromeStep.value = 'found'
      chromeError.value = ''
    } else {
      chromeStep.value = 'invalid'
      chromeError.value = validateResult.error || '路径无效'
    }
  }
}

const launchAndConnect = async () => {
  if (!chromePath.value || chromeLaunching.value) return
  
  chromeLaunching.value = true
  
  try {
    const launchResult = await window.electronAPI.chrome.launch(chromePath.value)
    
    if (!launchResult.success) {
      chromeStep.value = 'invalid'
      chromeError.value = launchResult.error || '启动 Chrome 失败'
      chromeLaunching.value = false
      return
    }
    
    const conversation = await conversationStore.createConversation('新会话', 'existing')
    
    const connectResult = await browserStore.connectExistingBrowser(conversation.id)
    
    if (!connectResult.success) {
      errorMessage.value = connectResult.error || '连接浏览器失败'
      await conversationStore.deleteConversation(conversation.id)
      chromeLaunching.value = false
      closeChromeModal()
      return
    }
    
    await conversationStore.selectConversation(conversation.id)
    await refreshConversationList()
    closeChromeModal()
  } catch (error) {
    console.error('Failed to launch and connect:', error)
    errorMessage.value = '创建会话失败'
  } finally {
    chromeLaunching.value = false
  }
}

const closeChromeModal = () => {
  showChromeModal.value = false
  chromeStep.value = 'checking'
  chromePath.value = ''
  chromeError.value = ''
  chromeLaunching.value = false
}

const selectConversation = async (conversationId: string) => {
  const conversation = conversationStore.conversations.find(c => c.id === conversationId)
  if (!conversation) return
  
  await conversationStore.selectConversation(conversationId)
  
  let browserInstance = browserStore.getBrowser(conversationId)
  if (!browserInstance) {
    let browserResult
    
    if (conversation.browser_type === 'existing') {
      const chromeInfo = await window.electronAPI.chrome.getDefaultPath()
      
      if (chromeInfo.found && chromeInfo.path) {
        browserResult = await browserStore.connectOrLaunchBrowser(chromeInfo.path, conversationId)
      } else {
        browserResult = { success: false, error: '未找到 Chrome 浏览器，请先手动配置' }
      }
    } else {
      browserResult = await browserStore.createBrowser(conversationId)
    }
    
    if (!browserResult.success) {
      errorMessage.value = browserResult.error || '浏览器连接失败'
    }
  }
}

const handleRename = async (id: string, title: string) => {
  try {
    await conversationStore.renameConversation(id, title)
    await refreshConversationList()
  } catch (error) {
    console.error('Failed to rename conversation:', error)
  }
}

const handleDelete = async (id: string) => {
  try {
    await browserStore.closeBrowser(id)
    if (wsManager.value && conversationStore.currentConversation?.id === id) {
      wsManager.value.disconnect()
      wsManager.value = null
      currentWSConversationId = null
    }
    await conversationStore.deleteConversation(id)
    await refreshConversationList()
  } catch (error) {
    console.error('Failed to delete conversation:', error)
  }
}

const handleWSMessage = async (message: ServerMessage) => {
  if (!conversationStore.currentConversation) return
  
  switch (message.type) {
    case 'action':
      if (message.action) {
        await executeAction(message.action)
      }
      break
    case 'finish':
      break
    case 'error':
      console.error('WebSocket error:', message.message)
      break
  }
}

const executeAction = async (action: Action) => {
  if (!conversationStore.currentConversation) return
  
  const conversation = conversationStore.currentConversation
  const conversationId = conversation.id
  const actionId = action.action_id
  const startTime = Date.now()
  
  if (action.action === 'close_browser') {
    await window.electronAPI.browser.execute(conversationId, action)
    await messageListRef.value?.refreshExpandedActions()
    return
  }
  
  let result = await window.electronAPI.browser.execute(conversationId, action)
  
  if (!result.success && result.error?.includes('Browser not found')) {
    console.log('浏览器不可用，尝试重新启动...')
    browserStore.closeBrowser(conversationId).catch(() => {})
    
    let browserResult
    if (conversation.browser_type === 'existing') {
      const chromeInfo = await window.electronAPI.chrome.getDefaultPath()
      if (chromeInfo.found && chromeInfo.path) {
        browserResult = await browserStore.connectOrLaunchBrowser(chromeInfo.path, conversationId)
      }
    } else {
      browserResult = await browserStore.createBrowser(conversationId)
    }
    
    if (browserResult?.success) {
      result = await window.electronAPI.browser.execute(conversationId, action)
    }
  }
  
  const executionTime = Date.now() - startTime
  
  const isLoginPage = await window.electronAPI.browser.detectLogin(conversationId)
  if (isLoginPage) {
    isPaused.value = true
    pauseReason.value = 'login'
    pendingActionId.value = actionId
    return
  }
  
  wsManager.value?.send({
    type: 'result',
    action_id: actionId,
    success: result.success,
    execution_time: executionTime,
    task: currentTask.value,
    error: result.error,
    pageState: result.pageState
  })
  
  await messageListRef.value?.refreshExpandedActions()
}

const handleResume = async () => {
  if (!conversationStore.currentConversation) return
  
  const conversation = conversationStore.currentConversation
  const conversationId = conversation.id
  const actionId = pendingActionId.value
  
  isPaused.value = false
  pauseReason.value = ''
  pendingActionId.value = ''
  
  let pageState = await window.electronAPI.browser.getState(conversationId)
  
  if (!pageState || !pageState.url) {
    console.log('浏览器不可用，尝试重新启动...')
    browserStore.closeBrowser(conversationId).catch(() => {})
    
    let browserResult
    if (conversation.browser_type === 'existing') {
      const chromeInfo = await window.electronAPI.chrome.getDefaultPath()
      if (chromeInfo.found && chromeInfo.path) {
        browserResult = await browserStore.connectOrLaunchBrowser(chromeInfo.path, conversationId)
      }
    } else {
      browserResult = await browserStore.createBrowser(conversationId)
    }
    
    if (browserResult?.success) {
      pageState = await window.electronAPI.browser.getState(conversationId)
    }
  }
  
  wsManager.value?.send({
    type: 'result',
    action_id: actionId,
    success: true,
    execution_time: 0,
    task: currentTask.value,
    pageState
  })
  
  await messageListRef.value?.refreshExpandedActions()
}

const ensureWSConnected = async (conversationId: string): Promise<void> => {
  if (wsManager.value && currentWSConversationId === conversationId && wsManager.value.isConnected()) {
    return
  }
  
  if (wsManager.value) {
    wsManager.value.disconnect()
  }
  
  wsManager.value = new WebSocketManager(conversationId, userStore.token!)
  await wsManager.value.connect()
  wsManager.value.onMessage(handleWSMessage)
  currentWSConversationId = conversationId
}

const handleSend = async (content: string) => {
  if (!conversationStore.currentConversation) return
  
  const conversation = conversationStore.currentConversation
  const conversationId = conversation.id
  const t0 = Date.now()
  
  currentTask.value = content
  
  let message
  try {
    message = await conversationStore.createMessage(conversationId, content)
    console.log(`[耗时] createMessage: ${Date.now() - t0}ms`)
  } catch (error) {
    console.error('Failed to create message:', error)
    return
  }
  
  const t1 = Date.now()
  await ensureWSConnected(conversationId)
  console.log(`[耗时] ensureWSConnected: ${Date.now() - t1}ms`)
  
  const t2 = Date.now()
  let pageState = await window.electronAPI.browser.getState(conversationId)
  console.log(`[耗时] getState: ${Date.now() - t2}ms`)
  
  if (!pageState || !pageState.url) {
    console.log('浏览器不可用，尝试重新启动...')
    browserStore.closeBrowser(conversationId).catch(() => {})
    
    let browserResult
    if (conversation.browser_type === 'existing') {
      const chromeInfo = await window.electronAPI.chrome.getDefaultPath()
      if (chromeInfo.found && chromeInfo.path) {
        browserResult = await browserStore.connectOrLaunchBrowser(chromeInfo.path, conversationId)
      } else {
        errorMessage.value = '未找到 Chrome 浏览器'
        return
      }
    } else {
      browserResult = await browserStore.createBrowser(conversationId)
    }
    
    if (!browserResult.success) {
      errorMessage.value = browserResult.error || '浏览器启动失败'
      return
    }
    
    pageState = await window.electronAPI.browser.getState(conversationId)
  }
  
  const t4 = Date.now()
  wsManager.value?.send({
    type: 'task',
    message_id: message.id,
    task: content,
    pageState
  })
  console.log(`[耗时] ws send: ${Date.now() - t4}ms`)
  console.log(`[耗时] handleSend 总计: ${Date.now() - t0}ms`)
}

onMounted(async () => {
  if (!userStore.isLoggedIn) {
    router.push('/login')
    return
  }
  
  try {
    await conversationStore.loadConversations()
  } catch (error) {
    console.error('Failed to load conversations:', error)
  }
})

onBeforeUnmount(() => {
  if (wsManager.value) {
    wsManager.value.disconnect()
    wsManager.value = null
    currentWSConversationId = null
  }
})
</script>

<style scoped>
.home-container {
  display: flex;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.sidebar {
  width: 280px;
  background: #252526;
  border-right: 1px solid #3e3e3e;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid #3e3e3e;
}

.sidebar-header h2 {
  font-size: 16px;
  margin-bottom: 12px;
  color: #d4d4d4;
}

.new-btn {
  width: 100%;
  padding: 8px;
  background: #0e639c;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: background 0.3s;
}

.new-btn:hover {
  background: #1177bb;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #858585;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #2d2d2d;
  border-radius: 8px;
  padding: 24px;
  width: 400px;
  border: 1px solid #3e3e3e;
}

.modal-content h3 {
  margin: 0 0 8px 0;
  color: #d4d4d4;
  font-size: 18px;
}

.modal-desc {
  margin: 0 0 20px 0;
  color: #858585;
  font-size: 13px;
}

.modal-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.option-btn {
  background: #1e1e1e;
  border: 1px solid #3e3e3e;
  border-radius: 6px;
  padding: 16px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s;
  position: relative;
}

.option-btn:hover {
  border-color: #007acc;
}

.option-btn.recommended {
  background: #1a2e1a;
  border-color: #2d5a2d;
}

.option-btn.recommended:hover {
  border-color: #3d7a3d;
  background: #1f3a1f;
}

.recommend-badge {
  position: absolute;
  top: -8px;
  right: 12px;
  background: #2d8a2d;
  color: white;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
}

.option-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.option-title {
  color: #d4d4d4;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}

.option-desc {
  color: #858585;
  font-size: 12px;
  margin-bottom: 8px;
}

.option-note {
  color: #6b6b6b;
  font-size: 11px;
  padding-top: 8px;
  border-top: 1px solid #3e3e3e;
}

.option-btn.recommended .option-note {
  color: #5a9a5a;
  border-top-color: #2d5a2d;
}

.cancel-btn {
  width: 100%;
  padding: 10px;
  background: transparent;
  border: 1px solid #3e3e3e;
  border-radius: 4px;
  color: #858585;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn:hover {
  background: #3e3e3e;
  color: #d4d4d4;
}

.pause-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #4d3800;
  border-top: 1px solid #6d5a00;
}

.pause-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pause-icon {
  font-size: 16px;
}

.pause-text {
  color: #dcdcaa;
  font-size: 13px;
}

.resume-btn {
  padding: 8px 16px;
  background: #dcdcaa;
  border: none;
  border-radius: 4px;
  color: #1e1e1e;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.resume-btn:hover {
  background: #e2e0a0;
}

/* Chrome modal styles */
.chrome-modal {
  width: 480px;
}

.chrome-checking {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30px 0;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #3e3e3e;
  border-top-color: #007acc;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.chrome-checking p {
  margin-top: 16px;
  color: #858585;
}

.chrome-found, .chrome-notfound, .chrome-invalid {
  padding: 8px 0;
}

.chrome-path-info {
  background: #1e1e1e;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 12px;
}

.chrome-path-info .label {
  color: #858585;
  font-size: 12px;
  display: block;
  margin-bottom: 4px;
}

.chrome-path-info .path {
  color: #d4d4d4;
  font-size: 13px;
  word-break: break-all;
}

.chrome-hint {
  color: #858585;
  font-size: 13px;
  margin: 0 0 16px 0;
}

.error-text {
  color: #f48771;
  font-size: 13px;
  margin: 0 0 8px 0;
}

.chrome-path-input {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.chrome-path-input input {
  flex: 1;
  padding: 8px 12px;
  background: #1e1e1e;
  border: 1px solid #3e3e3e;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 13px;
}

.chrome-path-input input:focus {
  outline: none;
  border-color: #007acc;
}

.browse-btn {
  padding: 8px 16px;
  background: #3e3e3e;
  border: none;
  border-radius: 4px;
  color: #d4d4d4;
  cursor: pointer;
  font-size: 13px;
}

.browse-btn:hover {
  background: #4e4e4e;
}

.chrome-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.primary-btn {
  padding: 10px 20px;
  background: #0e639c;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 14px;
}

.primary-btn:hover:not(:disabled) {
  background: #1177bb;
}

.primary-btn:disabled {
  background: #3e3e3e;
  cursor: not-allowed;
}

.secondary-btn {
  padding: 10px 20px;
  background: transparent;
  border: 1px solid #3e3e3e;
  border-radius: 4px;
  color: #858585;
  cursor: pointer;
  font-size: 14px;
}

.secondary-btn:hover {
  background: #3e3e3e;
  color: #d4d4d4;
}

.error-toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #5a1d1d;
  color: #f48771;
  padding: 12px 20px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 1001;
}

.error-toast button {
  background: transparent;
  border: none;
  color: #f48771;
  cursor: pointer;
  font-size: 18px;
  padding: 0;
  line-height: 1;
}
</style>
