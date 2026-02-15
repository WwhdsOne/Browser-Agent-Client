<template>
  <!-- 模板部分保持不变 -->
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

// 修复核心：统一基于 UTC 时间计算，避免时区偏差
const groupedConversations = computed(() => {
  const groups: ConversationGroup[] = []
  const now = new Date()

  // 1. 计算基准时间（基于 UTC 时间，避免时区问题）
  // 今天 00:00:00 UTC
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  // 昨天 00:00:00 UTC
  const yesterdayUTC = new Date(todayUTC)
  yesterdayUTC.setUTCDate(yesterdayUTC.getUTCDate() - 1)
  // 7天前 00:00:00 UTC
  const weekAgoUTC = new Date(todayUTC)
  weekAgoUTC.setUTCDate(weekAgoUTC.getUTCDate() - 7)
  // 本月第一天 00:00:00 UTC（修复「本月」计算错误）
  const monthStartUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const todayItems: Conversation[] = []
  const yesterdayItems: Conversation[] = []
  const weekItems: Conversation[] = []
  const monthItems: Conversation[] = []
  const olderItems: Conversation[] = []

  props.conversations.forEach(conv => {
    // 2. 解析会话时间（兼容 UTC 时间字符串）
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

    // 3. 转为 UTC 日期（只保留年月日，重置时分秒）
    const convDateUTC = new Date(Date.UTC(
        convDate.getUTCFullYear(),
        convDate.getUTCMonth(),
        convDate.getUTCDate()
    ))

    // 4. 基于 UTC 时间对比，避免时区偏差
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

  // 按顺序添加分组（保证显示顺序）
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
/* 样式部分保持不变 */
.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty-list {
  padding: 20px;
  text-align: center;
  color: #858585;
  font-size: 14px;
}

.conversation-group {
  margin-bottom: 8px;
}

.group-label {
  padding: 8px 12px 4px 12px;
  font-size: 12px;
  color: #858585;
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
  background: #2d2d2d;
}

.conversation-item.active {
  background: #37373d;
}

.conversation-content {
  flex: 1;
  cursor: pointer;
  min-width: 0;
  overflow: hidden;
}

.conversation-title {
  font-size: 14px;
  color: #d4d4d4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-meta {
  margin-top: 2px;
}

.browser-type {
  font-size: 11px;
  color: #6b6b6b;
  background: #2d2d2d;
  padding: 1px 6px;
  border-radius: 3px;
}

.edit-input-wrapper {
  width: 100%;
}

.edit-input-wrapper input {
  width: 100%;
  padding: 4px 8px;
  background: #1e1e1e;
  border: 1px solid #007acc;
  border-radius: 4px;
  color: #d4d4d4;
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
  color: #858585;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background: #3e3e3e;
  color: #d4d4d4;
}

.action-btn.delete:hover {
  color: #f48771;
}
</style>