import { computed, onMounted, onUnmounted, reactive, ref, shallowRef } from 'vue'
import {
  defaultSettings,
  validateSettings,
  type ReplyStatus,
  type BridgeState,
  type LiveEvent,
  type Settings
} from '../../../shared/types'
import { ProfileCache } from '../core/profile-cache'
import { filterReason } from '../../../shared/message-filter'
import { EventPipeline, type DisplayEvent } from '../core/pipeline'
import { ElMessage } from 'element-plus'

// Return type is inferred to preserve Vue ref types in this composable.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useApp() {
  const settings = reactive<Settings>({
    ...defaultSettings,
    keywords: [...defaultSettings.keywords]
  })
  const bridge = ref<BridgeState>({ status: 'waiting', rooms: [], receiving: false })
  const replyStatus = ref<ReplyStatus>({ detail: '尚未触发自动回复', at: 0 })
  const demo = ref(false)
  const saving = ref(false)
  const loaded = ref(false)
  const messages = shallowRef<DisplayEvent[]>([])
  const notice = ref('')
  const incomingCount = ref(0)
  const pipeline = new EventPipeline()
  const profileCache = new ProfileCache()
  const avatarQueue: DisplayEvent[] = []
  let loadingAvatar = false
  let disposed = false
  async function loadAvatars(): Promise<void> {
    if (loadingAvatar || !window.api) return
    loadingAvatar = true
    try {
      while (avatarQueue.length && !disposed) {
        const queued = avatarQueue.shift()!
        const message = pipeline.events.find(
          (event) => event.id === queued.id && event.sourceId === queued.sourceId
        )
        if (!message) continue
        if (!pipeline.events.includes(message) || filterReason(message, settings)) continue
        try {
          const profile = await profileCache.get(message, () =>
            window.api!.getUserProfile(message.sourceId, message.id)
          )
          if (
            !disposed &&
            profile.nickname === message.nickname &&
            pipeline.events.includes(message)
          ) {
            pipeline.events = pipeline.events.map((event) =>
              event === message ||
              (message.userId &&
                event.userId === message.userId &&
                event.sourceId === message.sourceId &&
                event.nickname === profile.nickname)
                ? { ...event, avatar: profile.avatar, gender: profile.gender }
                : event
            )
            messages.value = [...pipeline.events]
          }
        } catch {
          // Keep the initial when the page cannot provide this user's avatar.
        }
      }
    } finally {
      loadingAvatar = false
    }
  }
  let timer: ReturnType<typeof setInterval> | undefined
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  const cleanups: (() => void)[] = []
  const roomId = computed(() =>
    demo.value ? 'demo' : settings.roomId || bridge.value.rooms[0]?.id || ''
  )
  const roomName = computed(() =>
    demo.value
      ? '山野户外直播间 · 演示'
      : bridge.value.rooms.find((r) => r.id === roomId.value)?.name || '等待连接直播间'
  )
  const visibleMessages = computed(() =>
    messages.value.filter(
      (m) =>
        !filterReason(m, settings) &&
        (m.type === 'gift' ? settings.showGifts : settings.showDanmaku)
    )
  )
  function flash(text: string): void {
    notice.value = text
    clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => {
      notice.value = ''
    }, 3000)
  }
  function receive(event: LiveEvent): void {
    const accepted = pipeline.accept(event, roomId.value, [])
    if (
      accepted &&
      !filterReason(accepted, settings) &&
      (accepted.type === 'gift' ? settings.showGifts : settings.showDanmaku)
    )
      incomingCount.value++
    messages.value = [...pipeline.events]
    if (
      accepted &&
      !filterReason(accepted, settings) &&
      !demo.value &&
      window.api &&
      avatarQueue.length < 64
    ) {
      avatarQueue.push(accepted)
      void loadAvatars()
    }
  }
  async function save(patch: Partial<Settings>): Promise<boolean> {
    if (saving.value || !loaded.value) return false
    saving.value = true
    try {
      const next = validateSettings({
        ...settings,
        ...patch,
        keywords: patch.keywords || [...settings.keywords]
      })
      const saved = window.api
        ? await window.api.saveSettings(next)
        : (localStorage.setItem('danmaku-settings', JSON.stringify(next)), next)
      Object.assign(settings, saved)
      if ('roomId' in patch) {
        clear()
        flash('已切换直播间')
      }
      return true
    } catch (error) {
      ElMessage.error(`未能保存设置：${(error as Error).message}`)
      return false
    } finally {
      saving.value = false
    }
  }
  async function blockUser(event: DisplayEvent): Promise<void> {
    const user = {
      roomId: event.roomId,
      nickname: event.nickname,
      ...(event.userId ? { userId: event.userId } : {})
    }
    if (
      settings.blockedUsers.some(
        (existing) =>
          existing.roomId === user.roomId &&
          (user.userId
            ? existing.userId === user.userId
            : !existing.userId && existing.nickname === user.nickname)
      )
    )
      return
    if (await save({ blockedUsers: [...settings.blockedUsers, user] }))
      flash(`已在当前直播间屏蔽 ${event.nickname}`)
  }
  function clear(): void {
    incomingCount.value = 0
    profileCache.clear()
    avatarQueue.length = 0
    pipeline.clear()
    messages.value = []
  }
  const examples: Array<[string, string, string?]> = [
    ['小满', '来了来了，今天也来报到'],
    ['山野小熊', '今天有新款吗？'],
    ['远山', '这款帐篷什么时候补货呀？'],
    ['阿白', '周末准备去露营'],
    ['木木', '玫瑰', 'gift'],
    ['小七', '还有优惠券吗？'],
    ['晴天', '这个颜色好看'],
    ['向北', '想看看搭建效果'],
    ['小林', '有现货吗？'],
    ['小满', '收到，谢谢主播'],
    ['阿白', '小心心', 'gift']
  ]
  let sequence = 0
  function addDemo(index: number): void {
    const [nickname, text, gift] = examples[index % examples.length]
    receive({
      id: `demo-${sequence++}`,
      type: gift ? 'gift' : 'danmaku',
      roomId: 'demo',
      sourceId: 'preview',
      receivedAt: Date.now(),
      nickname,
      text: gift ? '' : text,
      ...(gift ? { giftName: text, quantity: 1 } : {})
    })
  }
  function startDemo(): void {
    if (bridge.value.receiving) {
      ElMessage.info('请先停止真实接收，再体验演示')
      return
    }
    clearInterval(timer)
    demo.value = true
    clear()
    for (let i = 0; i < examples.length; i++) addDemo(i)
    timer = setInterval(() => addDemo(sequence), 4200)
  }
  function stopDemo(): void {
    clearInterval(timer)
    demo.value = false
    clear()
  }
  async function setReceiving(value: boolean): Promise<void> {
    if (!window.api) {
      ElMessage.info('请在桌面应用中连接浏览器扩展')
      return
    }
    stopDemo()
    await window.api.setReceiving(value)
  }
  function applyBridge(state: BridgeState): void {
    const previous = bridge.value
    bridge.value = state
    if (state.status === 'connected' && previous.status !== 'connected')
      flash('已连接，正在接收消息')
  }
  onMounted(async () => {
    try {
      const stored = window.api
        ? await window.api.getSettings()
        : JSON.parse(localStorage.getItem('danmaku-settings') || 'null')
      if (stored) Object.assign(settings, validateSettings(stored))
      if (window.api) {
        replyStatus.value = await window.api.getReplyStatus()
        cleanups.push(
          window.api.onReplyStatus((status) => {
            replyStatus.value = status
          }),
          window.api.onEvent((event) => {
            if (!demo.value) receive(event)
          }),
          window.api.onBridge(applyBridge)
        )
        applyBridge(await window.api.getBridge())
      }
    } catch {
      ElMessage.error('无法读取设置，已使用默认值')
    }
    loaded.value = true
    if (new URLSearchParams(location.search).get('preview') === 'messages') startDemo()
  })
  onUnmounted(() => {
    disposed = true
    avatarQueue.length = 0
    clearInterval(timer)
    clearTimeout(noticeTimer)
    cleanups.forEach((fn) => fn())
  })
  return {
    settings,
    blockUser,
    replyStatus,
    bridge,
    demo,
    saving,
    loaded,
    messages,
    incomingCount,
    visibleMessages,
    roomId,
    roomName,
    notice,
    save,
    clear,
    startDemo,
    stopDemo,
    setReceiving,
    flash
  }
}
export type AppState = ReturnType<typeof useApp>
