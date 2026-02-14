import {defineStore} from 'pinia'
import {ref} from 'vue'
import type {Conversation, Message, ApiResponse, PaginationResp} from '@/types'
import {get, post, del} from '@/utils/http'

export interface ConversationListParams {
    page?: number
    size?: number
    title?: string
    state?: string
}

export const useConversationStore = defineStore('conversation', () => {
    const conversations = ref<Conversation[]>([])
    const currentConversation = ref<Conversation | null>(null)
    const messages = ref<Map<string, Message[]>>(new Map())

    const loadConversations = async (params?: ConversationListParams): Promise<void> => {
        try {
            const queryParams = new URLSearchParams()
            queryParams.append('page', String(params?.page ?? 1))
            queryParams.append('size', String(params?.size ?? 20))
            if (params?.title) {
                queryParams.append('title', params.title)
            }
            if (params?.state) {
                queryParams.append('state', params.state)
            }

            const response = await get<ApiResponse<PaginationResp<Conversation>>>(
                `/browser-agent/conversation/list?${queryParams.toString()}`
            )

            if (response.code === 200 && response.data) {
                conversations.value = response.data.data
            } else {
                conversations.value = []
            }
        } catch (error) {
            conversations.value = []
            throw error
        }
    }

    const createConversation = async (title: string = '新会话'): Promise<Conversation> => {
        try {
            const response = await post<ApiResponse<Conversation>>('/browser-agent/conversation/create', {
                title
            })
            if (response.code === 200 && response.data) {
                const conversation = {
                    ...response.data,
                    id: String(response.data.id)
                }
                conversations.value.unshift(conversation)
                messages.value.set(conversation.id, [])
                return conversation
            }
            throw new Error(response.message || '创建失败')
        } catch (error) {
            throw error
        }
    }

    const renameConversation = async (id: string, title: string): Promise<void> => {
        try {
            await post<ApiResponse<null>>('/browser-agent/conversation/rename', {id, title})
            const conversation = conversations.value.find(c => c.id === id)
            if (conversation) {
                conversation.title = title
                if (currentConversation.value?.id === id) {
                    currentConversation.value.title = title
                }
            }
        } catch (error) {
            throw error
        }
    }

    const deleteConversation = async (id: string): Promise<void> => {
        try {
            await del<ApiResponse<null>>(`/browser-agent/conversation/delete?id=${id}`)
            conversations.value = conversations.value.filter(c => c.id !== id)
            messages.value.delete(id)
            if (currentConversation.value?.id === id) {
                currentConversation.value = null
            }
        } catch (error) {
            throw error
        }
    }

    const selectConversation = async (conversationId: string): Promise<void> => {
        try {
            const conversation = conversations.value.find(c => c.id === conversationId)
            if (conversation) {
                currentConversation.value = conversation
                if (!messages.value.has(conversationId)) {
                    const response = await get<ApiResponse<Message[]>>(
                        `/browser-agent/messages?conversation_id=${conversationId}`
                    )
                    if (response.code === 200 && response.data) {
                        messages.value.set(conversationId, response.data)
                    } else {
                        messages.value.set(conversationId, [])
                    }
                }
            }
        } catch (error) {
            throw error
        }
    }

    const addMessage = (conversationId: string, message: Message): void => {
        const msgs = messages.value.get(conversationId) || []
        msgs.push(message)
        messages.value.set(conversationId, msgs)
    }

    const updateConversationState = (conversationId: string, state: Conversation['state']): void => {
        const conversation = conversations.value.find(c => c.id === conversationId)
        if (conversation) {
            conversation.state = state
            if (currentConversation.value?.id === conversationId) {
                currentConversation.value.state = state
            }
        }
    }

    return {
        conversations,
        currentConversation,
        messages,
        loadConversations,
        createConversation,
        renameConversation,
        deleteConversation,
        selectConversation,
        addMessage,
        updateConversationState
    }
})
