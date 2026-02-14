<template>
  <div class="chat-header">
    <div class="header-info">
      <h3>{{ conversation.title }}</h3>
    </div>
    <div class="header-actions">
      <button @click="closeBrowser" class="action-btn">关闭浏览器</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Conversation } from '@/types'
import { useBrowserStore } from '@/stores/browser'

const props = defineProps<{
  conversation: Conversation
}>()

const browserStore = useBrowserStore()

const closeBrowser = async () => {
  await browserStore.closeBrowser(props.conversation.id)
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
