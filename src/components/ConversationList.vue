<template>
  <div class="conversation-list">
    <div v-if="groupedConversations.length === 0" class="empty-list">
      <span>暂无会话</span>
    </div>
    <div v-else>
      <div v-for="group in groupedConversations" :key="group.label" class="conversation-group">
        <div class="group-label">{{ group.label }}</div>
        <div
            v-for="conversation in group.items"
            :key="String(conversation.id)"
            :class="['conversation-item', { active: String(conversation.id) === String(activeId) }]"
        >
          <div class="conversation-content" @click="$emit('select', String(conversation.id))">
            <div v-if="editingId === String(conversation.id)" class="edit-input-wrapper">
              <input
                  ref="editInput"
                  v-model="editTitle"
                  @blur="handleRename(String(conversation.id))"
                  @keyup.enter="handleRename(String(conversation.id))"
                  @keyup.escape="cancelEdit"
              />
            </div>
            <div v-else class="conversation-title">{{ conversation.title || '未命名会话' }}</div>
            <div class="conversation-meta">
              <span class="browser-type">{{ conversation.browser_type === 'existing' ? '已有浏览器' : '新浏览器' }}</span>
            </div>
          </div>
          <div class="conversation-actions">
            <button class="action-btn" @click.stop="startEdit(conversation)" title="重命名">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="action-btn delete" @click.stop="handleDelete(String(conversation.id))" title="删除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18"></path>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, nextTick} from 'vue'
import type {Conversation} from '@/types'

interface ConversationGroup {
  label: string
  items: Conversation[]
}

const props = defineProps<{
  conversations: Conversation[]
  activeId?: string
}>()

const emit = defineEmits<{
  select: [id: string]
  rename: [id: string, title: string]
  delete: [id: string]
}>()

const editingId = ref<string | null>(null)
const editTitle = ref('')
const editInput = ref<HTMLInputElement | null>(null)

const groupedConversations = computed(() => {
  const groups: ConversationGroup[] = []
  const now = new Date()

  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const yesterdayUTC = new Date(todayUTC)
  yesterdayUTC.setUTCDate(yesterdayUTC.getUTCDate() - 1)
  const weekAgoUTC = new Date(todayUTC)
  weekAgoUTC.setUTCDate(weekAgoUTC.getUTCDate() - 7)
  const monthStartUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const todayItems: Conversation[] = []
  const yesterdayItems: Conversation[] = []
  const weekItems: Conversation[] = []
  const monthItems: Conversation[] = []
  const olderItems: Conversation[] = []

  props.conversations.forEach(conv => {
    const timeStr = conv.created_at
    if (!timeStr) {
      olderItems.push(conv)
      return
    }

    const convDate = new Date(timeStr)
    if (isNaN(convDate.getTime())) {
      olderItems.push(conv)
      return
    }

    const convDateUTC = new Date(Date.UTC(
        convDate.getUTCFullYear(),
        convDate.getUTCMonth(),
        convDate.getUTCDate()
    ))

    if (convDateUTC >= todayUTC) {
      todayItems.push(conv)
    } else if (convDateUTC >= yesterdayUTC) {
      yesterdayItems.push(conv)
    } else if (convDateUTC >= weekAgoUTC) {
      weekItems.push(conv)
    } else if (convDateUTC >= monthStartUTC) {
      monthItems.push(conv)
    } else {
      olderItems.push(conv)
    }
  })

  if (todayItems.length > 0) {
    groups.push({label: '今天', items: todayItems})
  }
  if (yesterdayItems.length > 0) {
    groups.push({label: '昨天', items: yesterdayItems})
  }
  if (weekItems.length > 0) {
    groups.push({label: '最近7天', items: weekItems})
  }
  if (monthItems.length > 0) {
    groups.push({label: '本月', items: monthItems})
  }
  if (olderItems.length > 0) {
    groups.push({label: '更早', items: olderItems})
  }

  return groups
})

const startEdit = (conversation: Conversation) => {
  editingId.value = String(conversation.id)
  editTitle.value = conversation.title || ''
  nextTick(() => {
    editInput.value?.focus()
    editInput.value?.select()
  })
}

const handleRename = (id: string) => {
  if (editTitle.value.trim() && editingId.value) {
    emit('rename', id, editTitle.value.trim())
  }
  editingId.value = null
}

const cancelEdit = () => {
  editingId.value = null
}

const handleDelete = (id: string) => {
  if (confirm('确定要删除这个会话吗？')) {
    emit('delete', id)
  }
}
</script>

<style scoped>
.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty-list {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 14px;
}

.conversation-group {
  margin-bottom: 8px;
}

.group-label {
  padding: 8px 12px 4px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.conversation-item {
  padding: 10px 12px;
  border-radius: 6px;
  margin: 2px 4px;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.conversation-item:hover {
  background: var(--bg-secondary);
}

.conversation-item.active {
  background: var(--bg-tertiary);
}

.conversation-content {
  flex: 1;
  cursor: pointer;
  min-width: 0;
  overflow: hidden;
}

.conversation-title {
  font-size: 14px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-meta {
  margin-top: 2px;
}

.browser-type {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-secondary);
  padding: 1px 6px;
  border-radius: 3px;
}

.edit-input-wrapper {
  width: 100%;
}

.edit-input-wrapper input {
  width: 100%;
  padding: 4px 8px;
  background: var(--bg-primary);
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 14px;
}

.edit-input-wrapper input:focus {
  outline: none;
}

.conversation-actions {
  display: none;
  gap: 2px;
  margin-left: 8px;
}

.conversation-item:hover .conversation-actions {
  display: flex;
}

.action-btn {
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.action-btn.delete:hover {
  color: var(--error-text);
}
</style>
