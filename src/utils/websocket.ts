import { getWSBaseURL } from '@/config/api.config'
import type { ClientMessage, ServerMessage } from '@/types'

type MessageHandler = (message: ServerMessage) => void

export class WebSocketManager {
  private ws: WebSocket | null = null
  private conversationId: string
  private token: string
  private handlers: MessageHandler[] = []
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5

  constructor(conversationId: string, token: string) {
    this.conversationId = conversationId
    this.token = token
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsURL = `${getWSBaseURL()}/api/browser-agent/ws/${this.conversationId}?token=${this.token}`
      console.log('Connecting to WebSocket:', wsURL)
      this.ws = new WebSocket(wsURL)

      this.ws.onopen = () => {
        console.log(`WebSocket connected: ${this.conversationId}`)
        this.reconnectAttempts = 0
        resolve()
      }

      this.ws.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data)
          console.log('WebSocket received:', message)
          this.handlers.forEach(handler => handler(message))
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        reject(error)
      }

      this.ws.onclose = () => {
        console.log(`WebSocket closed: ${this.conversationId}`)
        this.handleReconnect()
      }
    })
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
      setTimeout(() => {
        this.connect().catch(console.error)
      }, delay)
    }
  }

  send(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(message)
      console.log('WebSocket sending:', message)
      this.ws.send(data)
    } else {
      console.error('WebSocket is not connected')
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler)
  }

  removeHandler(handler: MessageHandler): void {
    this.handlers = this.handlers.filter(h => h !== handler)
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.handlers = []
    this.reconnectAttempts = this.maxReconnectAttempts
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}
