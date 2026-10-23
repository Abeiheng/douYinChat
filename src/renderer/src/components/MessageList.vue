<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { ArrowDown, ChatDotRound, Connection } from '@element-plus/icons-vue'
import { filterReason } from '../../../shared/message-filter'
import type { BridgeState, Settings } from '../../../shared/types'
import type { DisplayEvent } from '../core/pipeline'
import MessageItem from './MessageItem.vue'
const props = defineProps<{
  incomingCount: number
  settings: Settings
  messages: DisplayEvent[]
  state: BridgeState
  demo: boolean
  fontSize: number
  notice: string
  hasMessages: boolean
  entryCount: number
  entryPrompt: string
}>()
const emit = defineEmits<{
  demo: []
  settings: []
  stopDemo: []
  blockUser: [message: DisplayEvent]
}>()
const draft = ref('')
const target = ref<DisplayEvent>()
const input = ref<HTMLInputElement>()
const sending = ref(false)
const result = ref('')
const uncertain = ref(false)
const menu = ref<{ message: DisplayEvent; x: number; y: number }>()
const room = computed(() =>
  target.value
    ? props.state.rooms.find((room) => room.sourceId === target.value!.sourceId)
    : props.state.rooms[0]
)
const available = computed(
  () => !props.demo && props.state.receiving && props.state.status === 'connected' && !!room.value
)
const maxLength = computed(() =>
  Math.max(0, 100 - (target.value ? target.value.nickname.length + 1 : 0))
)
const canSend = computed(
  () =>
    available.value &&
    !sending.value &&
    !uncertain.value &&
    !!draft.value.trim() &&
    draft.value.length <= maxLength.value
)
function openMenu(message: DisplayEvent, event: MouseEvent): void {
  if (sending.value) return
  pauseHistory()
  menu.value = {
    message,
    x: Math.max(4, Math.min(event.clientX, window.innerWidth - 120)),
    y: Math.max(4, Math.min(event.clientY, window.innerHeight - 88))
  }
}
function closeMenu(): void {
  menu.value = undefined
}
async function selectReply(): Promise<void> {
  if (!menu.value) return
  target.value = menu.value.message
  closeMenu()
  result.value = ''
  uncertain.value = false
  await nextTick()
  input.value?.focus()
}
function selectBlock(): void {
  if (!menu.value) return
  emit('blockUser', menu.value.message)
  closeMenu()
}
function cancelReply(): void {
  target.value = undefined
  result.value = ''
  input.value?.focus()
}
function handleEnter(event: KeyboardEvent): void {
  event.preventDefault()
  if (!event.isComposing && event.keyCode !== 229) void send()
}
async function send(): Promise<void> {
  if (!canSend.value) return
  const api = window.api
  if (!api) {
    result.value = '请在桌面应用中发送'
    return
  }
  const selected = target.value
  const source = selected?.sourceId || room.value!.sourceId
  if (selected && source !== room.value?.sourceId) {
    result.value = '这条弹幕来自之前的直播页，请重新选择'
    return
  }
  sending.value = true
  result.value = ''
  try {
    const detail = selected
      ? await api.replyToComment(source, selected.id, draft.value)
      : await api.sendMessage(source, draft.value)
    result.value = detail.startsWith('已提交') ? '' : detail
    if (detail.startsWith('已提交')) {
      draft.value = ''
      target.value = undefined
    } else if (detail.includes('未知')) uncertain.value = true
  } catch (error) {
    result.value = error instanceof Error ? error.message : '发送失败，请检查直播间连接'
  } finally {
    sending.value = false
  }
}
watch(draft, () => {
  uncertain.value = false
})
watch(
  () => props.state.rooms.map((room) => room.sourceId).join(','),
  () => {
    target.value = undefined
    closeMenu()
    result.value = ''
  }
)
const roomKey = computed(() =>
  props.state.rooms
    .map((room) => `${room.id}:${room.sourceId}`)
    .sort()
    .join(',')
)
function escape(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeMenu()
    if (!sending.value) cancelReply()
  }
}
onMounted(() => {
  window.addEventListener('click', closeMenu)
  window.addEventListener('blur', closeMenu)
  window.addEventListener('keydown', escape)
})
onBeforeUnmount(() => {
  window.removeEventListener('click', closeMenu)
  window.removeEventListener('blur', closeMenu)
  window.removeEventListener('keydown', escape)
})
const scroller = ref<HTMLElement>()
const following = ref(true)
const pending = ref(0)
const frozen = ref<DisplayEvent[]>([])
watch(roomKey, () => {
  frozen.value = []
  following.value = true
  pending.value = 0
})
const displayed = computed(() =>
  (following.value ? props.messages : frozen.value).filter(
    (message) =>
      !filterReason(message, props.settings) &&
      (message.type === 'gift'
        ? props.settings.showGifts
        : message.type === 'enter'
          ? props.settings.listenEnter
          : props.settings.showDanmaku)
  )
)
function pauseHistory(): void {
  if (following.value) frozen.value = [...props.messages]
  following.value = false
}
function wheel(event: WheelEvent): void {
  if (event.deltaY < 0) pauseHistory()
}
const stateText = computed(() =>
  props.state.status === 'error'
    ? props.state.detail
    : props.state.status === 'connected' && props.state.rooms.length === 0
      ? '直播间已关闭或页面已刷新，请重新开始采集'
      : props.state.status === 'stopped'
        ? '已暂停接收，在设置中开始接收'
        : props.state.status === 'disconnected'
          ? '连接中断，正在等待扩展重新连接…'
          : ''
)
function scroll(): void {
  const el = scroller.value
  if (!el) return
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 16
  if (!atBottom) pauseHistory()
  else if (!menu.value && !target.value) {
    following.value = true
    pending.value = 0
  }
}
async function latest(): Promise<void> {
  following.value = true
  pending.value = 0
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}
watch(
  () => props.messages,
  async (next) => {
    if (!next.length) {
      following.value = true
      pending.value = 0
      return
    }
    if (following.value) await latest()
  },
  { flush: 'post', immediate: true }
)
watch(
  () => props.incomingCount,
  (next, previous) => {
    if (next < previous) pending.value = 0
    else if (!following.value) pending.value += next - previous
  }
)
</script>
<template>
  <main class="message-area">
    <div v-if="demo" class="demo-strip">
      <span>演示数据 · 用于预览界面</span><button @click="$emit('stopDemo')">退出演示</button>
    </div>
    <div v-if="notice" class="inline-notice" role="status">{{ notice }}</div>
    <div v-if="entryCount" class="entry-summary" role="status">本场入场：{{ entryCount }} 人次</div>
    <div v-if="entryPrompt" class="entry-alert" role="alert">{{ entryPrompt }}</div>
    <div v-if="stateText && !demo" class="connection-notice" role="status">{{ stateText }}</div>
    <div
      v-if="displayed.length"
      ref="scroller"
      class="message-scroller"
      :style="{ fontSize: `${fontSize}px` }"
      role="log"
      aria-label="直播弹幕与礼物"
      @scroll="scroll"
      @wheel.passive="wheel"
    >
      <MessageItem
        v-for="message in displayed"
        :key="message.id"
        :message="message"
        @reply="openMenu"
      />
    </div>
    <div v-else class="empty-state">
      <div class="empty-icon">
        <ChatDotRound v-if="state.status === 'connected' || hasMessages" /><Connection v-else />
      </div>
      <template v-if="hasMessages"
        ><h1>消息已隐藏</h1>
        <p>可在设置中调整显示或过滤条件</p>
        <button class="text-button" @click="$emit('settings')">调整显示设置</button></template
      >
      <template v-else-if="state.status === 'connected' && state.rooms.length > 0"
        ><h1>等待弹幕和礼物…</h1>
        <p>直播间的新消息会显示在这里</p></template
      >
      <template v-else
        ><h1>让每条弹幕，都被看见</h1>
        <p>打开抖音直播间<br />并在浏览器扩展中开始采集</p>
        <button class="connect-button" @click="$emit('settings')">
          连接浏览器扩展 <span>↗</span></button
        ><button class="text-button preview-button" @click="$emit('demo')">
          先看看演示效果
        </button></template
      >
    </div>
    <form class="composer" @submit.prevent="send">
      <div v-if="target" class="reply-target">
        <span>回复 {{ target.nickname }}：</span>
        <button type="button" aria-label="取消回复" :disabled="sending" @click="cancelReply">
          ×
        </button>
      </div>
      <div class="composer-row">
        <input
          ref="input"
          v-model="draft"
          aria-label="弹幕内容"
          :placeholder="demo ? '演示模式暂不能发送' : target ? '输入回复内容…' : '发送一条弹幕…'"
          :readonly="sending"
          :maxlength="maxLength"
          @keydown.enter="handleEnter"
        />
        <button type="submit" :disabled="!canSend">{{ sending ? '发送中' : '发送' }}</button>
      </div>
      <p v-if="result" class="send-result" role="status">{{ result }}</p>
    </form>
    <div
      v-if="menu"
      class="comment-menu"
      role="menu"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      @click.stop
    >
      <button type="button" role="menuitem" @click="selectReply">回复评论</button>
      <button type="button" role="menuitem" @click="selectBlock">屏蔽此用户</button>
    </div>
    <button v-if="!following" class="latest-button" @click="latest">
      <ArrowDown /> {{ pending ? `${pending} 条新消息 · 回到最新` : '回到最新' }}
    </button>
  </main>
</template>

<style scoped>
.message-area {
  background: var(--chat-bg);
}
</style>

<style scoped>
.composer {
  flex-shrink: 0;
  padding: 10px 12px;
  border-top: 1px solid var(--line);
  background: var(--composer-bg);
}
.composer-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.composer-row input {
  width: 0;
  flex: 1;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 10px;
  background: var(--input-bg);
  color: var(--text);
  outline: none;
  font: inherit;
  font-size: 13px;
}
.composer-row input:focus {
  border-color: var(--accent);
}
.composer-row input::placeholder {
  color: var(--muted);
}
.composer-row button {
  border: 0;
  border-radius: 8px;
  padding: 9px 12px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 12px;
  cursor: pointer;
}
.composer-row button:disabled {
  opacity: 0.35;
  cursor: default;
}
.reply-target {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent);
  font-size: 12px;
  margin-bottom: 8px;
}
.reply-target span {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.reply-target button {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 18px;
  cursor: pointer;
}
.send-result {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.comment-menu {
  position: fixed;
  z-index: 100;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-raised);
  box-shadow: 0 4px 18px #0006;
}
.comment-menu button {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--text);
  border-radius: 5px;
  padding: 8px 18px;
  cursor: pointer;
}
.comment-menu button:hover {
  background: var(--hover);
}
</style>
