<template>
  <div class="chat-header">
    <div class="header-info">
      <h3>{{ conversation.title }}</h3>
      <span class="state-badge" :class="conversation.state">
        {{ getStateText(conversation.state) }}
      </span>
    </div>
    <div class="header-actions">
      <button @click="closeBrowser" class="action-btn">关闭浏览器</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Conversation } from '@/types'
import { useBrowserStore } from '@/stores/browser'
import { useConversationStore } from '@/stores/conversation'

const props = defineProps<{
  conversation: Conversation
}>()

const browserStore = useBrowserStore()
const conversationStore = useConversationStore()

const getStateText = (state: Conversation['state']): string => {
  const stateMap: Record<string, string> = {
    running: '进行中',
    waiting_verification: '等待验证',
    paused: '已暂停',
    finished: '已完成',
    error: '出错'
  }
  return stateMap[state] || state
}

const closeBrowser = async () => {
  await browserStore.closeBrowser(props.conversation.id)
  conversationStore.updateConversationState(props.conversation.id, 'finished')
}
</script>

<style scoped>
.chat-header {
  padding: 16px 20px;
  background: #2d2d2d;
  border-bottom: 1px solid #3e3e3e;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

h3 {
  font-size: 16px;
  color: #d4d4d4;
  margin: 0;
}

.state-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.state-badge.running {
  background: #1e4620;
  color: #89d185;
}

.state-badge.waiting_verification {
  background: #4d3800;
  color: #dcdcaa;
}

.state-badge.paused {
  background: #3e3e3e;
  color: #858585;
}

.state-badge.finished {
  background: #1e1e1e;
  color: #858585;
}

.state-badge.error {
  background: #5a1d1d;
  color: #f48771;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 6px 12px;
  background: #3e3e3e;
  border: none;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.action-btn:hover {
  background: #4e4e4e;
}
</style>
