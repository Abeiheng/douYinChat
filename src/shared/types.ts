export interface UserProfile {
  gender?: 'male' | 'female' | 'unknown'
  nickname: string
  avatar?: string
  age?: string
  location?: string
  stats?: string
}
export function validateUserProfile(value: unknown): UserProfile {
  if (!value || typeof value !== 'object') throw new Error('用户资料格式无效')
  const profile = value as UserProfile
  if (
    typeof profile.nickname !== 'string' ||
    !profile.nickname.trim() ||
    profile.nickname.length > 200
  )
    throw new Error('用户昵称无效')
  const result: UserProfile = { nickname: profile.nickname }
  if (profile.gender !== undefined) {
    if (!['male', 'female', 'unknown'].includes(profile.gender)) throw new Error('用户性别标识无效')
    result.gender = profile.gender
  }
  for (const key of ['age', 'location', 'stats'] as const) {
    if (profile[key] !== undefined) {
      if (typeof profile[key] !== 'string' || profile[key]!.length > 300)
        throw new Error('用户资料字段无效')
      result[key] = profile[key]
    }
  }
  if (profile.avatar !== undefined) {
    if (typeof profile.avatar !== 'string' || profile.avatar.length > 2000)
      throw new Error('用户头像地址无效')
    const url = new URL(profile.avatar)
    if (
      url.protocol !== 'https:' ||
      !url.hostname.endsWith('.douyinpic.com') ||
      url.username ||
      url.password
    )
      throw new Error('用户头像地址无效')
    result.avatar = url.href
  }
  return result
}
export interface ReplyRule {
  id: string
  keyword: string
  reply: string
  enabled: boolean
}
export interface ReplyStatus {
  detail: string
  at: number
}
export const themeIds = ['obsidian', 'cream', 'sakura', 'mint', 'mist'] as const
export type ThemeId = (typeof themeIds)[number]
export interface BlockedUser {
  roomId: string
  userId?: string
  nickname: string
}
export interface Settings {
  replyUserCooldown: number
  replyMaxPerMinute: number
  blockedUsers: BlockedUser[]
  filterWords: string[]
  hideSelf: boolean
  selfNickname: string
  theme: ThemeId
  autoReply: boolean
  replyRules: ReplyRule[]
  replyInterval: number
  roomId: string
  showDanmaku: boolean
  showGifts: boolean
  fontSize: number
  alwaysOnTop: boolean
  closeToTray: boolean
  reminders: boolean
  keywords: string[]
  sound: boolean
  volume: number
  notifications: boolean
  cooldown: number
}
export const defaultSettings: Settings = {
  replyUserCooldown: 120,
  replyMaxPerMinute: 5,
  blockedUsers: [],
  filterWords: [],
  hideSelf: false,
  selfNickname: '',
  theme: 'obsidian',
  autoReply: false,
  replyRules: [],
  replyInterval: 30,
  roomId: '',
  showDanmaku: true,
  showGifts: true,
  fontSize: 14,
  alwaysOnTop: false,
  closeToTray: false,
  reminders: false,
  keywords: ['补货', '优惠券'],
  sound: true,
  volume: 60,
  notifications: false,
  cooldown: 30
}
export interface LiveEvent {
  isHost?: boolean
  id: string
  type: 'danmaku' | 'gift'
  roomId: string
  sourceId: string
  receivedAt: number
  nickname: string
  text: string
  userId?: string
  platformId?: string
  giftName?: string
  quantity?: number
  comboId?: string
  delayed?: boolean
}
export interface Room {
  replyProtocol?: number
  id: string
  name: string
  sourceId: string
}
export interface BridgeState {
  status: 'waiting' | 'connected' | 'disconnected' | 'stopped' | 'error'
  rooms: Room[]
  receiving: boolean
  replyIssue?: string
  detail?: string
}
export interface DesktopAPI {
  sendMessage(sourceId: string, text: string): Promise<string>
  replyToComment(sourceId: string, eventId: string, text: string): Promise<string>
  getUserProfile(sourceId: string, eventId: string): Promise<UserProfile>
  getReplyStatus(): Promise<ReplyStatus>
  onReplyStatus(callback: (status: ReplyStatus) => void): () => void
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<Settings>
  close(): Promise<void>
  notify(title: string, body: string): Promise<void>
  getBridge(): Promise<BridgeState>
  getPairing(): Promise<{ token: string; port: number }>
  setReceiving(receiving: boolean): Promise<void>
  onEvent(callback: (event: LiveEvent) => void): () => void
  onBridge(callback: (state: BridgeState) => void): () => void
}
export function validateSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') throw new Error('设置格式无效')
  const s = value as Settings
  const replyUserCooldown = s.replyUserCooldown ?? 120
  const replyMaxPerMinute = s.replyMaxPerMinute ?? 5
  const blockedUsers = s.blockedUsers ?? []
  const filterWords = s.filterWords ?? []
  const hideSelf = s.hideSelf ?? false
  const selfNickname = s.selfNickname ?? ''
  if (
    !Number.isInteger(replyUserCooldown) ||
    replyUserCooldown < 0 ||
    replyUserCooldown > 3600 ||
    !Number.isInteger(replyMaxPerMinute) ||
    replyMaxPerMinute < 1 ||
    replyMaxPerMinute > 30
  )
    throw new Error('用户冷却应为 0–3600 秒，每分钟回复上限应为 1–30 条')
  if (
    typeof hideSelf !== 'boolean' ||
    typeof selfNickname !== 'string' ||
    selfNickname.length > 200
  )
    throw new Error('我的昵称设置无效')
  if (
    !Array.isArray(filterWords) ||
    filterWords.length > 50 ||
    filterWords.some((w) => typeof w !== 'string' || !w.trim() || w.length > 100)
  )
    throw new Error('最多 50 个过滤词，每个 1–100 字符')
  if (
    !Array.isArray(blockedUsers) ||
    blockedUsers.length > 200 ||
    blockedUsers.some(
      (u) =>
        !u ||
        typeof u.roomId !== 'string' ||
        !u.roomId ||
        u.roomId.length > 200 ||
        typeof u.nickname !== 'string' ||
        !u.nickname.trim() ||
        u.nickname.length > 200 ||
        (u.userId !== undefined &&
          (typeof u.userId !== 'string' || !u.userId || u.userId.length > 200))
    )
  )
    throw new Error('屏蔽用户设置无效，最多 200 人')
  const theme = s.theme ?? 'obsidian'
  if (!themeIds.includes(theme)) throw new Error('主题无效')
  for (const key of [
    'showDanmaku',
    'showGifts',
    'alwaysOnTop',
    'closeToTray',
    'reminders',
    'sound',
    'notifications'
  ] as const) {
    if (typeof s[key] !== 'boolean') throw new Error('设置开关无效')
  }
  if (typeof s.roomId !== 'string' || s.roomId.length > 200) throw new Error('直播间无效')
  if (![12, 14, 16].includes(s.fontSize)) throw new Error('字号无效')
  if (!Number.isInteger(s.cooldown) || s.cooldown < 0 || s.cooldown > 3600)
    throw new Error('冷却时间应为 0–3600 秒')
  if (!Number.isFinite(s.volume) || s.volume < 0 || s.volume > 100) throw new Error('音量无效')
  if (
    !Array.isArray(s.keywords) ||
    s.keywords.length > 20 ||
    s.keywords.some((k) => typeof k !== 'string' || !k.trim() || k.length > 100)
  )
    throw new Error('最多 20 个关键词，每个 1–100 字符')
  const autoReply = s.autoReply ?? false
  const replyRules = s.replyRules ?? []
  const replyInterval = s.replyInterval ?? 30
  if (
    typeof autoReply !== 'boolean' ||
    !Number.isInteger(replyInterval) ||
    replyInterval < 5 ||
    replyInterval > 3600
  )
    throw new Error('回复间隔应为 5–3600 秒')
  if (
    !Array.isArray(replyRules) ||
    replyRules.length > 20 ||
    replyRules.some(
      (r) =>
        !r ||
        typeof r.id !== 'string' ||
        !r.id ||
        r.id.length > 100 ||
        typeof r.enabled !== 'boolean' ||
        typeof r.keyword !== 'string' ||
        !r.keyword.trim() ||
        r.keyword.length > 100 ||
        typeof r.reply !== 'string' ||
        !r.reply.trim() ||
        r.reply.length > 100 ||
        /[\r\n]/.test(r.reply)
    )
  )
    throw new Error('最多 20 条规则，关键词和回复各 1–100 字符，回复请使用单行文字')
  if (new Set(replyRules.map((r) => r.id)).size !== replyRules.length)
    throw new Error('规则编号重复')
  return {
    ...defaultSettings,
    ...s,
    theme,
    replyUserCooldown,
    replyMaxPerMinute,
    blockedUsers: blockedUsers.map((u) => ({
      roomId: u.roomId,
      nickname: u.nickname.trim(),
      ...(u.userId ? { userId: u.userId } : {})
    })),
    filterWords: [...new Set(filterWords.map((w) => w.trim()))],
    hideSelf,
    selfNickname: selfNickname.trim(),
    autoReply,
    replyInterval,
    replyRules: replyRules.map((r) => ({ ...r, keyword: r.keyword.trim(), reply: r.reply.trim() })),
    keywords: [...new Map(s.keywords.map((k) => [k.trim().toLowerCase(), k.trim()])).values()]
  }
}
export function isLiveEvent(value: unknown): value is LiveEvent {
  if (!value || typeof value !== 'object') return false
  const e = value as LiveEvent
  return (
    ['id', 'roomId', 'sourceId', 'nickname', 'text'].every(
      (k) =>
        typeof e[k as keyof LiveEvent] === 'string' &&
        String(e[k as keyof LiveEvent]).length <= 10000
    ) &&
    !!e.id &&
    !!e.roomId &&
    !!e.sourceId &&
    (e.type === 'danmaku' || e.type === 'gift') &&
    Number.isFinite(e.receivedAt) &&
    (e.isHost === undefined || typeof e.isHost === 'boolean') &&
    (e.userId === undefined || (typeof e.userId === 'string' && e.userId.length <= 200)) &&
    (e.platformId === undefined ||
      (typeof e.platformId === 'string' && e.platformId.length <= 200)) &&
    (e.comboId === undefined || (typeof e.comboId === 'string' && e.comboId.length <= 200)) &&
    (e.type !== 'gift' ||
      (typeof e.giftName === 'string' &&
        e.giftName.length <= 200 &&
        Number.isInteger(e.quantity) &&
        e.quantity! > 0 &&
        e.quantity! < 1000000))
  )
}
