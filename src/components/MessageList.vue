<template>
  <div class="message-list" ref="messageContainer">
    <div class="messages-wrapper">
      <div
        v-for="message in messages"
        :key="message.id"
        class="message"
      >
        <div class="message-content">
          <div class="message-text">{{ message.content }}</div>
          <div class="message-footer">
            <span class="show-actions" @click="toggleActions(message.id)">
              {{ expandedMessages.has(message.id) ? '收起操作' : '显示操作' }}
            </span>
          </div>
          <div v-if="expandedMessages.has(message.id)" class="actions-panel">
            <div v-if="loadingActions.has(message.id)" class="actions-loading">加载中...</div>
            <div v-else-if="getActions(message.id).length === 0" class="actions-empty">暂无操作记录</div>
            <div v-else class="actions-list">
              <div
                v-for="action in getActions(message.id)"
                :key="action.id"
                :class="['action-item', action.status]"
              >
                <div class="action-header">
                  <span class="action-type">{{ action.action_type }}</span>
                  <span class="action-status">{{ statusText(action.status) }}</span>
                  <span v-if="action.execution_time" class="action-time">{{ action.execution_time }}ms</span>
                </div>
                <div class="action-detail">
                  <span v-if="action.url">URL: {{ action.url }}</span>
                  <span v-if="action.selector">选择器: {{ action.selector }}</span>
                  <span v-if="action.value">值: {{ action.value }}</span>
                  <span v-if="action.distance">距离: {{ action.distance }}px</span>
                  <span v-if="action.timeout">等待: {{ action.timeout }}ms</span>
                </div>
                <div v-if="action.error_message" class="action-error">
                  {{ action.error_message }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { Message, ActionResponse } from '@/types'
import { useConversationStore } from '@/stores/conversation'

const props = defineProps<{
  messages: Message[]
}>()

const conversationStore = useConversationStore()
const messageContainer = ref<HTMLElement>()
const expandedMessages = ref<Set<string>>(new Set())
const loadingActions = ref<Set<string>>(new Set())
const actionsData = ref<Map<string, ActionResponse[]>>(new Map())

const statusText = (status: string): string => {
  const map: Record<string, string> = {
    pending: '等待中',
    running: '执行中',
    success: '成功',
    failed: '失败',
    skipped: '跳过'
  }
  return map[status] || status
}

const loadActions = async (messageId: string) => {
  loadingActions.value.add(messageId)
  const actions = await conversationStore.loadActions(messageId)
  actionsData.value.set(messageId, actions)
  loadingActions.value.delete(messageId)
}

const toggleActions = async (messageId: string) => {
  if (expandedMessages.value.has(messageId)) {
    expandedMessages.value.delete(messageId)
  } else {
    expandedMessages.value.add(messageId)
    await loadActions(messageId)
  }
}

const getActions = (messageId: string): ActionResponse[] => {
  return actionsData.value.get(messageId) || []
}

const refreshExpandedActions = async () => {
  const expandedArray = Array.from(expandedMessages.value)
  for (const messageId of expandedArray) {
    await loadActions(messageId)
  }
}

watch(() => props.messages.length, () => {
  nextTick(() => {
    if (messageContainer.value) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight
    }
  })
})

defineExpose({
  refreshExpandedActions
})
</script>

<style scoped>
.message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
}

.messages-wrapper {
  max-width: 800px;
  margin: 0 auto;
}

.message {
  margin-bottom: 24px;
}

.message-content {
  width: 100%;
}

.message-text {
  color: #d4d4d4;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-footer {
  margin-top: 8px;
}

.show-actions {
  font-size: 12px;
  color: #6b6b6b;
  cursor: pointer;
  transition: color 0.2s;
}

.show-actions:hover {
  color: #007acc;
}

.actions-panel {
  margin-top: 12px;
  background: #1e1e1e;
  border-radius: 6px;
  padding: 12px;
  border: 1px solid #3e3e3e;
}

.actions-loading,
.actions-empty {
  font-size: 12px;
  color: #858585;
  text-align: center;
  padding: 10px;
}

.actions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-item {
  background: #2d2d2d;
  border-radius: 4px;
  padding: 8px 12px;
  border-left: 3px solid #858585;
}

.action-item.success {
  border-left-color: #4ec9b0;
}

.action-item.failed {
  border-left-color: #f14c4c;
}

.action-item.running {
  border-left-color: #dcdcaa;
}

.action-header {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 12px;
}

.action-type {
  color: #569cd6;
  font-weight: 500;
}

.action-status {
  color: #858585;
}

.action-item.success .action-status {
  color: #4ec9b0;
}

.action-item.failed .action-status {
  color: #f14c4c;
}

.action-time {
  color: #858585;
  margin-left: auto;
}

.action-detail {
  margin-top: 6px;
  font-size: 12px;
  color: #9cdcfe;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.action-error {
  margin-top: 6px;
  font-size: 12px;
  color: #f14c4c;
  background: #3c1f1f;
  padding: 4px 8px;
  border-radius: 3px;
}
</style>
