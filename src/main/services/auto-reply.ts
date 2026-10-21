import { filterReason, userKey } from '../../shared/message-filter'
import type { LiveEvent, ReplyRule, ReplyStatus, Settings } from '../../shared/types'

export function matchReply(text: string, rules: ReplyRule[]): ReplyRule | undefined {
  return rules.find((r) => r.enabled && text.toLowerCase().includes(r.keyword.toLowerCase()))
}
export class AutoReply {
  status: ReplyStatus = { detail: '尚未触发自动回复', at: 0 }
  private seen = new Set<string>()
  private last = -Infinity
  private userLast = new Map<string, number>()
  private attempts: number[] = []
  private busy = false
  private generation = 0
  private waiting = false
  constructor(
    private settings: () => Settings,
    private room: () => string,
    private send: (event: LiveEvent, text: string) => Promise<string>,
    private emit: (status: ReplyStatus) => void,
    private wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
    private random: () => number = Math.random
  ) {}
  async receive(event: LiveEvent, now = Date.now()): Promise<void> {
    const started = Date.now()
    const key = `${event.sourceId}:${event.platformId || event.id}`
    if (this.seen.has(key)) return
    this.seen.add(key)
    if (this.seen.size > 4000) this.seen.delete(this.seen.values().next().value!)
    const s = this.settings()
    if (filterReason(event, s)) return
    if (!s.autoReply || event.type !== 'danmaku' || event.delayed || event.roomId !== this.room())
      return
    // Without a reliable self ID, exclude every configured reply to prevent reply loops.
    if (s.replyRules.some((r) => r.reply.toLowerCase() === event.text.trim().toLowerCase())) return
    const rule = matchReply(event.text, s.replyRules)
    if (!rule || this.busy || now - this.last < s.replyInterval * 1000) return
    const userRuleKey = JSON.stringify([userKey(event), rule.keyword.toLowerCase()])
    this.attempts = this.attempts.filter((at) => now - at < 60000)
    for (const [key, at] of this.userLast) if (now - at >= 3600000) this.userLast.delete(key)
    if (now - (this.userLast.get(userRuleKey) ?? -Infinity) < s.replyUserCooldown * 1000) {
      this.update(`已跳过：${event.nickname} 的同一关键词仍在冷却`)
      return
    }
    if (this.attempts.length >= s.replyMaxPerMinute) {
      this.update('已跳过：达到每分钟自动回复上限')
      return
    }
    this.busy = true
    this.last = now
    const generation = this.generation
    const delay = 1000 + Math.floor(this.random() * 9001)
    this.waiting = true
    this.update(
      `命中「${rule.keyword}」，等待 ${(delay / 1000).toFixed(1)} 秒后回复：${rule.reply}`
    )
    try {
      await this.wait(delay)
      const current = this.settings()
      const currentRule = current.replyRules.find((r) => r.id === rule.id && r.enabled)
      if (generation !== this.generation) return
      if (
        filterReason(event, current) ||
        !current.autoReply ||
        event.roomId !== this.room() ||
        currentRule?.keyword !== rule.keyword ||
        currentRule?.reply !== rule.reply
      ) {
        this.update('待回复已取消：设置或直播间已改变')
        return
      }
      const attemptAt = now + Math.max(0, Date.now() - started)
      this.attempts = this.attempts.filter((at) => attemptAt - at < 60000)
      if (
        this.attempts.length >= current.replyMaxPerMinute ||
        attemptAt - (this.userLast.get(userRuleKey) ?? -Infinity) < current.replyUserCooldown * 1000
      ) {
        this.update('待回复已取消：防刷屏限制已改变')
        return
      }
      this.userLast.set(userRuleKey, attemptAt)
      this.last = attemptAt
      if (this.userLast.size > 5000) this.userLast.delete(this.userLast.keys().next().value!)
      this.attempts.push(attemptAt)
      this.waiting = false
      this.update(`正在提交：${rule.reply}`)
      const result = await this.send(event, rule.reply)
      this.update(`${result} · ${rule.reply}`)
    } catch {
      this.update('提交结果未知，不会自动重试')
    } finally {
      this.waiting = false
      this.busy = false
    }
  }
  cancelPending(): void {
    this.generation++
    if (this.waiting) this.update('待回复已取消：接收状态、设置或直播间已改变')
  }
  private update(detail: string): void {
    this.status = { detail, at: Date.now() }
    this.emit(this.status)
  }
}
