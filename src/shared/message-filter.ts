import type { LiveEvent, Settings } from './types'
export function filterReason(event: LiveEvent, settings: Settings): string | undefined {
  if (
    settings.blockedUsers.some(
      (user) =>
        user.roomId === event.roomId &&
        (user.userId ? user.userId === event.userId : user.nickname === event.nickname.trim())
    )
  )
    return '屏蔽用户'
  if (settings.hideSelf && settings.selfNickname && settings.selfNickname === event.nickname.trim())
    return '自己的弹幕'
  const body = `${event.text} ${event.giftName || ''}`.toLowerCase()
  if (settings.filterWords.some((word) => body.includes(word.toLowerCase()))) return '过滤词'
  return undefined
}
export function userKey(event: LiveEvent): string {
  return JSON.stringify([
    event.roomId,
    event.userId ? 'id' : 'nickname',
    event.userId || event.nickname.trim()
  ])
}
