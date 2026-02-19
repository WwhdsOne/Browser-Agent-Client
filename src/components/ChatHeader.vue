<template>
  <div class="chat-header">
    <div class="header-info">
      <h3>{{ conversation.title }}</h3>
    </div>
    <a href="#" @click.prevent="openHistory" class="history-link">查看历史数据</a>
  </div>
</template>

<script setup lang="ts">
import type { Conversation } from '@/types'

defineProps<{
  conversation: Conversation
}>()

const historyUrl = import.meta.env.VITE_HISTORY_URL || 'http://localhost:3000'

const openHistory = () => {
  window.electronAPI.shell.openExternal(historyUrl)
}
</script>

<style scoped>
.chat-header {
  padding: 16px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
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
  color: var(--text-primary);
  margin: 0;
}

.history-link {
  font-size: 13px;
  color: var(--accent-color);
  text-decoration: none;
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  transition: background 0.2s;
}

.history-link:hover {
  background: var(--bg-hover);
  text-decoration: underline;
}
</style>
