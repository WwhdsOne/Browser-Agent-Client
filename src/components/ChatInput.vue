<template>
  <div class="chat-input">
    <div class="input-container">
      <textarea
        v-model="inputText"
        @keydown.enter.exact.prevent="handleSend"
        placeholder="输入任务指令..."
        rows="1"
      />
      <button @click="handleSend" :disabled="!inputText.trim()">
        发送
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  send: [content: string]
}>()

const inputText = ref('')

const handleSend = () => {
  if (!inputText.value.trim()) return
  emit('send', inputText.value.trim())
  inputText.value = ''
}
</script>

<style scoped>
.chat-input {
  padding: 16px 20px;
  background: #2d2d2d;
  border-top: 1px solid #3e3e3e;
}

.input-container {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

textarea {
  flex: 1;
  padding: 10px 14px;
  background: #1e1e1e;
  border: 1px solid #3e3e3e;
  border-radius: 4px;
  color: #d4d4d4;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  min-height: 40px;
  max-height: 120px;
}

textarea:focus {
  outline: none;
  border-color: #007acc;
}

button {
  padding: 10px 20px;
  background: #0e639c;
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

button:hover:not(:disabled) {
  background: #1177bb;
}

button:disabled {
  background: #3e3e3e;
  cursor: not-allowed;
}
</style>
