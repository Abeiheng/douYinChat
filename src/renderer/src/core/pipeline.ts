import { isLiveEvent, type LiveEvent } from '../../../shared/types'
import { matchKeyword, type Segment } from './keyword'
export interface DisplayEvent extends LiveEvent {
  avatar?: string
  gender?: 'male' | 'female' | 'unknown'
  segments: Segment[]
  matched: boolean
}
export class EventPipeline {
  events: DisplayEvent[] = []
  private seen = new Set<string>()
  constructor(public limit = 2000) {}
  clear(): void {
    this.events = []
    this.seen.clear()
  }
  accept(value: unknown, room: string, keywords: string[]): DisplayEvent | undefined {
    if (!isLiveEvent(value) || value.roomId !== room) return
    const key = `${room}:${value.platformId || `${value.sourceId}:${value.id}`}`
    if (this.seen.has(key)) return
    this.seen.add(key)
    if (this.seen.size > this.limit * 2) this.seen.delete(this.seen.values().next().value!)
    const segments = value.type === 'danmaku' ? matchKeyword(value.text, keywords) : []
    const event: DisplayEvent = {
      ...value,
      nickname: value.nickname.trim() || '匿名用户',
      segments,
      matched: segments.some((s) => s.match)
    }
    if (value.type === 'gift' && value.comboId) {
      const prior = this.events.find(
        (e) =>
          e.type === 'gift' &&
          e.roomId === room &&
          e.sourceId === value.sourceId &&
          e.comboId === value.comboId &&
          (e.userId || e.nickname) === (value.userId || value.nickname) &&
          e.giftName === value.giftName
      )
      if (prior) {
        prior.quantity = Math.max(prior.quantity || 1, value.quantity || 1)
        return
      }
    }
    this.events.push(event)
    if (this.events.length > this.limit) this.events.splice(0, this.events.length - this.limit)
    return event
  }
}
