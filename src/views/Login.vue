<template>
  <div class="login-container">
    <div class="login-box">
      <h1>GUI智能体客户端</h1>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <input
            v-model="username"
            type="text"
            placeholder="用户名"
            required
          />
        </div>
        <div class="form-group">
          <input
            v-model="password"
            type="password"
            placeholder="密码"
            required
          />
        </div>
        <div class="form-options">
          <label class="remember-me">
            <input type="checkbox" v-model="rememberMe" />
            <span>记住账号密码</span>
          </label>
        </div>
        <button type="submit" :disabled="loading">
          {{ loading ? '登录中...' : '登录' }}
        </button>
        <p v-if="error" class="error">{{ error }}</p>
      </form>
      <div class="register-link">
        <span>还没有账号？</span>
        <a href="" @click.prevent="goToRegister">注册账号</a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const username = ref('')
const password = ref('')
const rememberMe = ref(true)
const loading = ref(false)
const error = ref('')

const REGISTER_URL = 'https://www.soyorinlove.cn/'

const goToRegister = () => {
  if (REGISTER_URL) {
    window.open(REGISTER_URL, '_blank')
  } else {
    alert('注册功能暂未开放')
  }
}

const loadSavedCredentials = () => {
  const savedUsername = localStorage.getItem('saved_username')
  const savedPassword = localStorage.getItem('saved_password')
  
  if (savedUsername) {
    username.value = savedUsername
  }
  if (savedPassword) {
    password.value = savedPassword
  }
}

const handleLogin = async () => {
  loading.value = true
  error.value = ''
  
  try {
    await userStore.login({
      username: username.value,
      password: password.value
    })
    
    if (rememberMe.value) {
      localStorage.setItem('saved_username', username.value)
      localStorage.setItem('saved_password', password.value)
    } else {
      localStorage.removeItem('saved_username')
      localStorage.removeItem('saved_password')
    }
    
    await router.push('/')
  } catch (err) {
    error.value = '登录失败，请检查用户名和密码'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadSavedCredentials()
})
</script>

<style scoped>
.login-container {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
}

.login-box {
  background: var(--bg-secondary);
  padding: 40px;
  border-radius: 8px;
  width: 400px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

h1 {
  text-align: center;
  margin-bottom: 30px;
  font-size: 24px;
  color: var(--text-primary);
}

.form-group {
  margin-bottom: 20px;
}

input[type="text"],
input[type="password"] {
  width: 100%;
  padding: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 14px;
  transition: border-color 0.2s;
}

input[type="text"]:focus,
input[type="password"]:focus {
  outline: none;
  border-color: var(--accent-color);
}

.form-options {
  margin-bottom: 20px;
}

.remember-me {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
}

.remember-me input[type="checkbox"] {
  cursor: pointer;
}

.remember-me:hover {
  color: var(--text-primary);
}

button {
  width: 100%;
  padding: 12px;
  background: var(--accent-color);
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.3s;
}

button:hover:not(:disabled) {
  background: var(--accent-hover);
}

button:disabled {
  background: var(--bg-tertiary);
  cursor: not-allowed;
}

.error {
  color: var(--error-text);
  margin-top: 10px;
  text-align: center;
}

.register-link {
  margin-top: 20px;
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary);
}

.register-link a {
  color: var(--accent-color);
  text-decoration: none;
  margin-left: 4px;
}

.register-link a:hover {
  text-decoration: underline;
}
</style>
