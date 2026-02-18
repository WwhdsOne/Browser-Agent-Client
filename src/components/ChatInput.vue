<template>
  <div class="chat-input">
    <div class="input-container">
      <textarea
        ref="textareaRef"
        v-model="inputText"
        @keydown.enter.exact.prevent="handleSend"
        @input="autoResize"
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
import { ref, nextTick, watch } from 'vue'

const emit = defineEmits<{
  send: [content: string]
}>()

const inputText = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const autoResize = () => {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
      const lineHeight = parseInt(getComputedStyle(textareaRef.value).lineHeight)
      const maxHeight = lineHeight * 5
      const newHeight = Math.min(textareaRef.value.scrollHeight, maxHeight)
      textareaRef.value.style.height = newHeight + 'px'
    }
  })
}

watch(inputText, () => {
  autoResize()
})

const handleSend = () => {
  if (!inputText.value.trim()) return
  emit('send', inputText.value.trim())
  inputText.value = ''
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
    }
  })
}
</script>

<style scoped>
.chat-input {
  padding: 16px 20px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
}

.input-container {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

textarea {
  flex: 1;
  padding: 10px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  line-height: 1.5;
  resize: none;
  min-height: 40px;
  max-height: calc(1.5em * 5 + 20px);
  overflow-y: auto;
  transition: border-color 0.2s, background 0.2s;
}

textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

textarea::placeholder {
  color: var(--text-muted);
}

button {
  padding: 10px 20px;
  background: var(--accent-color);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}

button:hover:not(:disabled) {
  background: var(--accent-hover);
}

button:disabled {
  background: var(--bg-tertiary);
  cursor: not-allowed;
  color: var(--text-muted);
}
</style>
