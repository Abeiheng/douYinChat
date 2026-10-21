import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultSettings,
  validateSettings,
  type UserProfile,
  type LiveEvent
} from '../src/shared/types'
import { filterReason } from '../src/shared/message-filter'
import { ProfileCache } from '../src/renderer/src/core/profile-cache'
const event: LiveEvent = {
  id: '1',
  roomId: '123',
  sourceId: 'source',
  type: 'danmaku',
  receivedAt: 1,
  nickname: '同名',
  text: 'HELLO'
}
test('filters respect room and stable IDs, with explicit nickname fallback and self filter', () => {
  const settings = {
    ...defaultSettings,
    blockedUsers: [{ roomId: '123', userId: 'a', nickname: '同名' }],
    filterWords: [] as string[]
  }
  assert.equal(filterReason({ ...event, userId: 'a' }, settings), '屏蔽用户')
  assert.equal(filterReason({ ...event, userId: 'b' }, settings), undefined)
  assert.equal(filterReason({ ...event, roomId: '456', userId: 'a' }, settings), undefined)
  settings.blockedUsers = [{ roomId: '123', nickname: '同名' }] as typeof settings.blockedUsers
  assert.equal(filterReason(event, settings), '屏蔽用户')
  settings.blockedUsers = []
  settings.filterWords = ['hello']
  assert.equal(filterReason(event, settings), '过滤词')
  settings.filterWords = []
  assert.equal(
    filterReason(event, { ...settings, hideSelf: true, selfNickname: '同名' }),
    '自己的弹幕'
  )
})
test('new preference defaults migrate and invalid limits or filter data reject', () => {
  const settings = { ...defaultSettings } as Record<string, unknown>
  for (const key of [
    'replyUserCooldown',
    'replyMaxPerMinute',
    'blockedUsers',
    'filterWords',
    'hideSelf',
    'selfNickname'
  ])
    delete settings[key]
  const migrated = validateSettings(settings)
  assert.equal(migrated.replyUserCooldown, 120)
  assert.equal(migrated.replyMaxPerMinute, 5)
  for (const patch of [
    { replyMaxPerMinute: 0 },
    { replyUserCooldown: -1 },
    { filterWords: [''] },
    { blockedUsers: [{ roomId: '123', nickname: '' }] }
  ])
    assert.throws(() => validateSettings({ ...defaultSettings, ...patch }))
})
test('profiles deduplicate inflight lookups by ID, expire and never share equal nicknames', async () => {
  let now = 1000
  const cache = new ProfileCache(() => now)
  let calls = 0
  const fetch = async (): Promise<UserProfile> => {
    calls++
    return { nickname: '同名', avatar: 'avatar', gender: 'male' as const }
  }
  const a = { ...event, userId: 'a' }
  await Promise.all([cache.get(a, fetch), cache.get({ ...a, id: '2' }, fetch)])
  assert.equal(calls, 1)
  await cache.get({ ...a, userId: 'b' }, fetch)
  assert.equal(calls, 2)
  await cache.get({ ...event, id: 'unknown-1' }, fetch)
  await cache.get({ ...event, id: 'unknown-2' }, fetch)
  assert.equal(calls, 4)
  now += 600001
  await cache.get(a, fetch)
  assert.equal(calls, 5)
  cache.clear()
  await cache.get(a, fetch)
  assert.equal(calls, 6)
})
test('three failed profile lookups back off and recover without blocking another source', async () => {
  let now = 0
  const cache = new ProfileCache(() => now)
  let calls = 0
  const fail = async (): Promise<never> => {
    calls++
    throw new Error('not available')
  }
  for (let i = 0; i < 3; i++) await assert.rejects(cache.get({ ...event, id: String(i) }, fail))
  await assert.rejects(cache.get({ ...event, id: 'paused' }, fail), /稍后/)
  assert.equal(calls, 3)
  const good = async (): Promise<UserProfile> => ({ nickname: '同名' })
  await cache.get({ ...event, sourceId: 'other' }, good)
  now = 30001
  await cache.get({ ...event, id: 'recovered' }, good)
})
