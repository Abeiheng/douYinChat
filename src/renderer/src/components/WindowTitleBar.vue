<script setup lang="ts">
import { Close, Setting, Top, Present, ChatDotRound } from '@element-plus/icons-vue'
defineProps<{
  title: string
  settingsOpen: boolean
  connected: boolean
  demo: boolean
  alwaysOnTop: boolean
  saving: boolean
}>()
defineEmits<{
  settings: []
  back: []
  close: []
  toggleTop: []
  support: [mode: 'donation' | 'feedback']
}>()
</script>
<template>
  <header class="titlebar">
    <div class="window-title" :title="title">
      <span v-if="!settingsOpen" class="status-dot" :class="{ connected, demo }" />
      <span class="title-text">{{ title }}</span>
    </div>
    <div class="window-controls">
      <button
        class="icon-button support-entry"
        aria-label="打赏"
        title="打赏"
        @click="$emit('support', 'donation')"
      >
        <Present />
      </button>
      <button
        class="icon-button support-entry"
        aria-label="投诉建议"
        title="投诉建议"
        @click="$emit('support', 'feedback')"
      >
        <ChatDotRound />
      </button>
      <button
        class="icon-button pin-button"
        :class="{ 'is-pinned': alwaysOnTop }"
        :aria-label="alwaysOnTop ? '取消置顶' : '置顶窗口'"
        :title="alwaysOnTop ? '取消置顶' : '置顶窗口'"
        :aria-pressed="alwaysOnTop"
        :disabled="saving"
        @click="$emit('toggleTop')"
      >
        <Top />
      </button>
      <button
        class="icon-button settings-button"
        :class="{ 'is-active': settingsOpen }"
        :aria-label="settingsOpen ? '关闭设置' : '打开设置'"
        :title="settingsOpen ? '关闭设置' : '打开设置'"
        :aria-pressed="settingsOpen"
        @click="settingsOpen ? $emit('back') : $emit('settings')"
      >
        <Setting />
      </button>
      <button
        class="icon-button close-button"
        :aria-label="settingsOpen ? '关闭设置页面' : '关闭窗口'"
        :title="settingsOpen ? '关闭设置' : '关闭窗口'"
        @click="$emit('close')"
      >
        <Close />
      </button>
    </div>
  </header>
</template>

<style scoped>
.window-controls {
  flex-shrink: 0;
  align-items: center;
}
.settings-button.is-active {
  color: var(--accent);
  background: var(--accent-soft);
}
.settings-button.is-active:hover {
  background: color-mix(in srgb, var(--accent) 17%, transparent);
}
</style>
