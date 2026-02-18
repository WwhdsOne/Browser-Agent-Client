<template>
  <div :data-theme="themeStore.theme" class="app-container">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
</script>

<style>
.app-container {
  height: 100%;
  width: 100%;
}
</style>
