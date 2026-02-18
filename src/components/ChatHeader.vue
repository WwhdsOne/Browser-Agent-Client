<template>
  <div class="chat-header">
    <div class="header-info">
      <h3>{{ conversation.title }}</h3>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Conversation } from '@/types'

defineProps<{
  conversation: Conversation
}>()
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
</style>
