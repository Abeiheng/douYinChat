<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import SupportDialog from './components/SupportDialog.vue'
import WindowTitleBar from './components/WindowTitleBar.vue'
import MessageList from './components/MessageList.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { useApp } from './composables/useApp'
const app = useApp()
watchEffect(() => {
  document.documentElement.dataset.theme = app.settings.theme
})
const support = ref<'donation' | 'feedback'>()
const settingsOpen = ref(new URLSearchParams(location.search).get('preview') === 'settings')
const title = computed(() => (settingsOpen.value ? '设置' : app.roomName.value))
function back(): void {
  settingsOpen.value = false
}
function close(): void {
  if (settingsOpen.value) settingsOpen.value = false
  else if (window.api) void window.api.close()
  else app.flash('浏览器预览不支持关闭桌面窗口')
}
function openBrowser(): void {
  if (window.api) void window.api.openLiveBrowser()
  else app.flash('浏览器预览不支持打开抖音直播')
}
</script>
<template>
  <div class="app-window">
    <WindowTitleBar
      :title="title"
      :settings-open="settingsOpen"
      :connected="app.bridge.value.status === 'connected'"
      :demo="app.demo.value"
      :always-on-top="app.settings.alwaysOnTop"
      :saving="app.saving.value || !app.loaded.value"
      @support="support = $event"
      @toggle-top="app.save({ alwaysOnTop: !app.settings.alwaysOnTop })"
      @settings="settingsOpen = true"
      @back="back"
      @close="close"
      @open-browser="openBrowser"
    />
    <SettingsPanel v-if="settingsOpen" :app="app" @back="settingsOpen = false" />
    <MessageList
      v-else
      :incoming-count="app.incomingCount.value"
      :settings="app.settings"
      :messages="app.visibleMessages.value"
      :state="app.bridge.value"
      :demo="app.demo.value"
      :font-size="app.settings.fontSize"
      :notice="app.notice.value"
      :has-messages="app.messages.value.length > 0"
      :entry-count="app.entryCount.value"
      :entry-prompt="app.entryPrompt.value"
      @demo="app.startDemo"
      @settings="settingsOpen = true"
      @block-user="app.blockUser"
      @stop-demo="app.stopDemo"
    />
    <SupportDialog :mode="support" @close="support = undefined" />
  </div>
</template>
