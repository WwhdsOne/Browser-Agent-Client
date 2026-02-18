import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type Theme = 'dark' | 'light'

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>((localStorage.getItem('theme') as Theme) || 'dark')

  const toggleTheme = () => {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  watch(theme, (newTheme) => {
    localStorage.setItem('theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }, { immediate: true })

  return {
    theme,
    toggleTheme
  }
})
