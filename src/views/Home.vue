<template>
  <div class="home-container">
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>会话列表</h2>
        <button @click="createNewConversation" class="new-btn">新建会话</button>
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
        <ChatInput @send="handleSend" />
      </div>
      <div v-else class="empty-state">
        <p>选择或创建一个会话开始</p>
      </div>
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

const createNewConversation = async () => {
  try {
    const conversation = await conversationStore.createConversation()
    await browserStore.createBrowser(conversation.id)
    await conversationStore.selectConversation(conversation.id)
    await refreshConversationList()
  } catch (error) {
    console.error('Failed to create conversation:', error)
  }
}

const selectConversation = async (conversationId: string) => {
  console.log('Selecting conversation:', conversationId)
  
  await conversationStore.selectConversation(conversationId)
  
  let browserInstance = browserStore.getBrowser(conversationId)
  if (!browserInstance) {
    await browserStore.createBrowser(conversationId)
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
  
  const conversationId = conversationStore.currentConversation.id
  const actionId = action.action_id
  const startTime = Date.now()
  
  if (action.action === 'close_browser') {
    await window.electronAPI.browser.execute(conversationId, action)
    await messageListRef.value?.refreshExpandedActions()
    return
  }
  
  const result = await window.electronAPI.browser.execute(conversationId, action)
  const executionTime = Date.now() - startTime
  
  wsManager.value?.send({
    type: 'result',
    action_id: actionId,
    success: result.success,
    execution_time: executionTime,
    error: result.error,
    pageState: result.pageState
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
  
  const conversationId = conversationStore.currentConversation.id
  
  let message
  try {
    message = await conversationStore.createMessage(conversationId, content)
  } catch (error) {
    console.error('Failed to create message:', error)
    return
  }
  
  await ensureWSConnected(conversationId)
  
  const pageState = await window.electronAPI.browser.getState(conversationId)
  
  wsManager.value?.send({
    type: 'task',
    message_id: message.id,
    pageState
  })
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
</style>
