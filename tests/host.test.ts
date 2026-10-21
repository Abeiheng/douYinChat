import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { isLiveEvent } from '../src/shared/types'
const source = readFileSync(new URL('../extension/content.js', import.meta.url), 'utf8')
const start = source.indexOf('function readPublicHost(')
const end = source.indexOf('function readPublicGender(', start)
const readHost = runInNewContext(`${source.slice(start, end)}; readPublicHost`, {
  URL
}) as (badges?: { querySelectorAll: () => { src: string }[] }) => boolean
const badges = (...urls: string[]): { querySelectorAll: () => { src: string }[] } => ({
  querySelectorAll: () => urls.map((src) => ({ src }))
})
test('host identity requires the exact official anchor badge in the identity region', () => {
  assert.equal(
    readHost(
      badges('https://p3-webcast.douyinpic.com/img/webcast/webcast_anchor_badge.png~tplv-obj.image')
    ),
    true
  )
  assert.equal(readHost(), false)
  for (const url of [
    'https://evil.example/webcast_anchor_badge.png',
    'https://p3-webcast.douyinpic.com/img/webcast/new_user_grade_level_v1_3.png',
    'https://p3-webcast.douyinpic.com/img/webcast/webcast_anchor_badge.png-spoof',
    'http://p3-webcast.douyinpic.com/img/webcast/webcast_anchor_badge.png',
    'invalid'
  ])
    assert.equal(readHost(badges(url)), false)
})
test('host flag must be boolean and is optional for older extensions', () => {
  const event = {
    id: '1',
    roomId: '123',
    sourceId: 'source',
    nickname: '主播',
    text: '你好',
    type: 'danmaku',
    receivedAt: 1
  }
  assert.equal(isLiveEvent(event), true)
  assert.equal(isLiveEvent({ ...event, isHost: true }), true)
  assert.equal(isLiveEvent({ ...event, isHost: 'true' }), false)
})
