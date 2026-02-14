import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LoginRequest, LoginResponse } from '@/types'
import { post } from '@/utils/http'

/**
 * ================================
 * TODO: 后端登录接口实现
 * ================================
 * 
 * 接口地址: POST /api/auth/login
 * 
 * Request Body:
 * {
 *   "username": "string",
 *   "password": "string"
 * }
 * 
 * Response Body (成功):
 * {
 *   "code": 200,
 *   "message": "成功",
 *   "data": "jwt_token_string"
 * }
 * 
 * Response Body (失败):
 * {
 *   "code": 401,
 *   "message": "用户名或密码错误",
 *   "data": null
 * }
 */

export const useUserStore = defineStore('user', () => {
  const token = ref<string | null>(null)
  const isLoggedIn = ref(false)

  const login = async (credentials: LoginRequest): Promise<void> => {
    try {
      const response: LoginResponse = await post('/auth/login', credentials)
      
      if (response.code === 200 && response.data) {
        token.value = response.data
        isLoggedIn.value = true
        sessionStorage.setItem('token', response.data)
      } else {
        throw new Error(response.message || '登录失败')
      }
    } catch (error) {
      throw error
    }
  }

  const logout = (): void => {
    token.value = null
    isLoggedIn.value = false
    sessionStorage.removeItem('token')
  }

  const initializeAuth = (): void => {
    const savedToken = sessionStorage.getItem('token')
    if (savedToken) {
      token.value = savedToken
      isLoggedIn.value = true
    }
  }

  return {
    token,
    isLoggedIn,
    login,
    logout,
    initializeAuth
  }
})
