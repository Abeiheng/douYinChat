import type { LiveEvent, UserProfile } from '../../../shared/types'
// Only stable platform IDs may share profiles; equal nicknames are not proof of identity.
export class ProfileCache {
  private entries = new Map<string, { expires: number; value: Promise<UserProfile> }>()
  private failures = new Map<string, { count: number; retryAt: number }>()
  constructor(private now: () => number = Date.now) {}
  clear(): void {
    this.entries.clear()
    this.failures.clear()
  }
  get(event: LiveEvent, fetch: () => Promise<UserProfile>): Promise<UserProfile> {
    const now = this.now()
    const key = JSON.stringify([
      event.sourceId,
      event.userId ? 'user' : 'event',
      event.userId || event.id,
      event.nickname
    ])
    const cached = this.entries.get(key)
    if (cached && cached.expires > now) return cached.value
    const failure = this.failures.get(event.sourceId)
    if (failure && failure.retryAt > now)
      return Promise.reject(new Error('资料读取暂不可用，稍后自动重试'))
    const entry = { expires: now + 30000, value: Promise.resolve().then(fetch) }
    entry.value = entry.value
      .then((profile) => {
        if (profile.nickname !== event.nickname) throw new Error('用户身份不匹配')
        entry.expires =
          this.now() +
          (profile.avatar && profile.gender && profile.gender !== 'unknown' ? 600000 : 60000)
        this.failures.delete(event.sourceId)
        return profile
      })
      .catch((error) => {
        const count = (this.failures.get(event.sourceId)?.count || 0) + 1
        this.failures.set(event.sourceId, { count, retryAt: count >= 3 ? this.now() + 30000 : 0 })
        throw error
      })
    this.entries.delete(key)
    this.entries.set(key, entry)
    while (this.entries.size > 500) this.entries.delete(this.entries.keys().next().value!)
    while (this.failures.size > 20) this.failures.delete(this.failures.keys().next().value!)
    return entry.value
  }
}
