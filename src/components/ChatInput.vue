<template>
  <div class="chat-input">
    <div v-if="showResume" class="resume-container">
      <button @click="$emit('resume')" class="resume-btn">
        我已完成验证，继续执行
      </button>
    </div>
    <div v-else class="input-container">
      <textarea
        v-model="inputText"
        @keydown.enter.exact.prevent="handleSend"
        placeholder="输入任务指令..."
        :disabled="disabled"
        rows="1"
      />
      <button @click="handleSend" :disabled="disabled || !inputText.trim()">
        发送
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  disabled: boolean
  showResume: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
  resume: []
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

.resume-container {
  display: flex;
  justify-content: center;
}

.resume-btn {
  padding: 12px 24px;
  background: #dcdcaa;
  border: none;
  border-radius: 4px;
  color: #1e1e1e;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.resume-btn:hover {
  background: #e2e0a0;
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

textarea:disabled {
  background: #252526;
  cursor: not-allowed;
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
