<script setup lang="ts">
import { computed, ref } from 'vue'
import MessageFilterSettings from './MessageFilterSettings.vue'
import ThemePicker from './ThemePicker.vue'
import AutoReplySettings from './AutoReplySettings.vue'
import { ArrowRight, Link } from '@element-plus/icons-vue'
import {
  ElSwitch,
  ElRadioGroup,
  ElRadioButton,
  ElSelect,
  ElOption,
  ElButton,
  ElMessageBox,
  ElMessage
} from 'element-plus'
import type { Settings } from '../../../shared/types'
import type { AppState } from '../composables/useApp'
const props = defineProps<{ app: AppState }>()
const emit = defineEmits<{ back: [] }>()
const pairToken = ref('')
const pairingOpen = ref(false)
const connected = computed(() => ['connected', 'stopped'].includes(props.app.bridge.value.status))
async function update(patch: Partial<Settings>): Promise<void> {
  await props.app.save(patch)
}
async function clearMessages(): Promise<void> {
  try {
    await ElMessageBox.confirm('只清空当前消息，保留回复规则和其他设置。', '清空消息？', {
      confirmButtonText: '清空',
      cancelButtonText: '取消'
    })
    props.app.clear()
    ElMessage.success('当前消息已清空')
  } catch {
    /* Cancel keeps messages. */
  }
}
async function pair(): Promise<void> {
  pairingOpen.value = !pairingOpen.value
  if (!pairingOpen.value) {
    pairToken.value = ''
    return
  }
  if (!window.api) {
    pairToken.value = ''
    return
  }
  pairToken.value = (await window.api.getPairing()).token
}
async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(pairToken.value)
    ElMessage.success('配对码已复制，请粘贴到扩展中')
  } catch {
    ElMessage.error('复制失败，请手动选择配对码复制')
  }
}
</script>
<template>
  <section class="settings-panel" aria-label="设置" :aria-busy="app.saving.value">
    <ThemePicker
      :model-value="app.settings.theme"
      :disabled="app.saving.value || !app.loaded.value"
      @change="update({ theme: $event })"
    />
    <AutoReplySettings :app="app" />
    <MessageFilterSettings :app="app" />
    <div class="section-heading">窗口显示</div>
    <div class="settings-card">
      <div class="setting-row">
        <span>字号</span
        ><ElRadioGroup
          :model-value="app.settings.fontSize"
          size="small"
          aria-label="字号"
          @change="update({ fontSize: Number($event) })"
          ><ElRadioButton :value="12">小</ElRadioButton><ElRadioButton :value="14">中</ElRadioButton
          ><ElRadioButton :value="16">大</ElRadioButton></ElRadioGroup
        >
      </div>
      <div class="setting-row">
        <span>窗口置顶</span
        ><ElSwitch
          :model-value="app.settings.alwaysOnTop"
          :disabled="app.saving.value"
          aria-label="窗口置顶"
          @change="update({ alwaysOnTop: Boolean($event) })"
        />
      </div>
      <div class="setting-row">
        <span>显示弹幕</span
        ><ElSwitch
          :model-value="app.settings.showDanmaku"
          :disabled="app.saving.value"
          aria-label="显示弹幕"
          @change="update({ showDanmaku: Boolean($event) })"
        />
      </div>
      <div class="setting-row">
        <div>
          <span>关闭到托盘</span>
          <p class="helper">关闭窗口后继续采集与提醒</p>
        </div>
        <ElSwitch
          :model-value="app.settings.closeToTray"
          :disabled="app.saving.value"
          aria-label="关闭到托盘"
          @change="update({ closeToTray: Boolean($event) })"
        />
      </div>
    </div>
    <div class="section-heading">连接</div>
    <div class="settings-card">
      <div class="setting-row">
        <span>浏览器扩展</span
        ><span class="connection-label"
          ><span class="mini-dot" :class="{ hit: connected }" />{{
            connected ? '已连接' : '等待连接'
          }}</span
        >
      </div>
      <div v-if="app.bridge.value.rooms.length" class="setting-row">
        <span>当前直播间</span
        ><ElSelect
          :model-value="app.roomId.value"
          size="small"
          aria-label="当前直播间"
          @change="update({ roomId: $event })"
          ><ElOption
            v-for="room in app.bridge.value.rooms"
            :key="room.id"
            :label="room.name"
            :value="room.id"
        /></ElSelect>
      </div>
      <div class="connection-actions">
        <ElButton
          v-if="connected"
          size="small"
          :type="app.bridge.value.receiving ? 'default' : 'primary'"
          @click="app.setReceiving(!app.bridge.value.receiving)"
          >{{ app.bridge.value.receiving ? '停止接收' : '开始接收' }}</ElButton
        ><ElButton size="small" @click="pair"
          ><Link class="button-icon" />{{ pairingOpen ? '收起配对码' : '连接扩展' }}</ElButton
        >
      </div>
      <div v-if="pairingOpen" class="pairing-box">
        <p class="helper">
          {{
            pairToken
              ? '在 Chrome 加载项目 extension 文件夹，将配对码粘贴到扩展。配对码仅保存在本机。'
              : '请打开桌面应用获取配对码，再在 Chrome 中加载 extension 文件夹。'
          }}
        </p>
        <button v-if="pairToken" class="pairing-token" title="点击复制配对码" @click="copy">
          {{ pairToken }}
        </button>
      </div>
    </div>
    <p v-if="app.bridge.value.status === 'error'" class="field-error">
      {{ app.bridge.value.detail }}
    </p>
    <details class="other-settings">
      <summary>其他 <ArrowRight /></summary>
      <div class="settings-card">
        <button class="setting-row row-button" @click="clearMessages">
          <span>清空当前消息</span><ArrowRight /></button
        ><button
          class="setting-row row-button"
          @click="app.demo.value ? app.stopDemo() : app.startDemo()"
        >
          <span>{{ app.demo.value ? '退出演示' : '体验演示' }}</span
          ><ArrowRight />
        </button>
        <div class="setting-row"><span>版本</span><span class="helper">0.1.0 · 开发预览</span></div>
        <p class="helper diagnostics">
          {{ app.messages.value.length }}/2000 条缓冲 ·
          {{ app.demo.value ? '演示数据，非真实采集' : '仅接收当前直播间'
          }}<br />采集适配仍待真实直播间验证。
        </p>
      </div>
    </details>
    <div class="panel-footer">
      <span class="helper">修改后立即生效</span><ElButton @click="emit('back')">返回弹幕</ElButton>
    </div>
  </section>
</template>
