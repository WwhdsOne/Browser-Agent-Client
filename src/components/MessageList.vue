<template>
  <div class="message-list" ref="messageContainer">
    <div v-if="showVerificationAlert" class="verification-alert">
      <div class="alert-content">
        <p>检测到人机验证，请手动完成验证后点击"继续执行"</p>
      </div>
    </div>
    <div
      v-for="message in messages"
      :key="message.id"
      :class="['message', message.role]"
    >
      <div class="message-avatar">
        {{ message.role === 'user' ? 'U' : 'A' }}
      </div>
      <div class="message-content">
        <div class="message-header">
          <span class="role">{{ message.role === 'user' ? '用户' : '助手' }}</span>
          <span class="time">{{ formatTime(message.created_at) }}</span>
        </div>
        <div class="message-text">{{ message.content }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { Message } from '@/types'

const props = defineProps<{
  messages: Message[]
  state: string
}>()

const messageContainer = ref<HTMLElement>()

const showVerificationAlert = computed(() => {
  return props.state === 'waiting_verification'
})

const formatTime = (timestamp: string): string => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

watch(() => props.messages.length, () => {
  nextTick(() => {
    if (messageContainer.value) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight
    }
  })
})
</script>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.verification-alert {
  background: #4d3800;
  border: 1px solid #6d5a00;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 16px;
}

.alert-content p {
  color: #dcdcaa;
  margin: 0;
  font-size: 14px;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  flex-shrink: 0;
}

.message.user .message-avatar {
  background: #0e639c;
  color: white;
}

.message.assistant .message-avatar {
  background: #3e3e3e;
  color: #d4d4d4;
}

.message-content {
  max-width: 70%;
}

.message.user .message-content {
  align-items: flex-end;
}

.message-header {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 12px;
}

.role {
  color: #d4d4d4;
  font-weight: 500;
}

.time {
  color: #858585;
}

.message-text {
  background: #2d2d2d;
  padding: 10px 14px;
  border-radius: 8px;
  color: #d4d4d4;
  font-size: 14px;
  line-height: 1.5;
}

.message.user .message-text {
  background: #0e639c;
}
</style>
