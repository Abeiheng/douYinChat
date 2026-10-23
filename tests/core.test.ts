import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchKeyword, ReminderGate } from '../src/renderer/src/core/keyword'
import { EventPipeline } from '../src/renderer/src/core/pipeline'
import { validateSettings, defaultSettings, type LiveEvent } from '../src/shared/types'
const event = (patch: Partial<LiveEvent> = {}): LiveEvent => ({
  id: '1',
  sourceId: 'tab',
  type: 'danmaku',
  roomId: 'room',
  receivedAt: 1000,
  nickname: '小满',
  text: '还有优惠券吗？',
  ...patch
})
test('literal, case-insensitive keywords and overlapping Unicode matches', () => {
  assert.deepEqual(matchKeyword('优惠券补货 YES a+b', ['优惠', '优惠券', 'yes', 'a+b']), [
    { text: '优惠券', match: true },
    { text: '补货 ', match: false },
    { text: 'YES', match: true },
    { text: ' ', match: false },
    { text: 'a+b', match: true }
  ])
  assert.equal(
    matchKeyword('你好', ['']).some((s) => s.match),
    false
  )
})
test('room filtering, platform deduplication, distinct identical comments and bounded memory', () => {
  const pipeline = new EventPipeline(2)
  assert.equal(pipeline.accept(event(), 'other', []), undefined)
  assert.ok(pipeline.accept(event({ platformId: 'p1' }), 'room', ['优惠券'])?.matched)
  assert.equal(pipeline.accept(event({ id: '2', platformId: 'p1' }), 'room', []), undefined)
  pipeline.accept(event({ id: '2', platformId: 'p2', text: '另一条消息' }), 'room', [])
  assert.ok(pipeline.accept(event({ id: '3', platformId: 'p3' }), 'room', []))
  assert.equal(pipeline.events.length, 2)
  pipeline.clear()
  assert.equal(pipeline.events.length, 0)
})
test('consecutive identical danmaku from different users are folded into the first row', () => {
  const pipeline = new EventPipeline()
  const first = pipeline.accept(event(), 'room', [])!
  pipeline.accept(event({ id: '2', nickname: '小红', userId: 'user-b' }), 'room', [])
  assert.equal(pipeline.events.length, 1)
  assert.equal(first.repeatCount, 2)
  pipeline.accept(event({ id: '3', text: '另一条消息' }), 'room', [])
  pipeline.accept(event({ id: 'entry', type: 'enter', nickname: '访客' }), 'room', [])
  pipeline.accept(event({ id: '4', text: '另一条消息' }), 'room', [])
  assert.equal(pipeline.events.length, 3)
  assert.equal(first.repeatCount, 2)
  assert.equal(pipeline.events.find((item) => item.text === '另一条消息')?.repeatCount, 2)
})
test('gift cumulative combo count updates rather than sums, independent gifts stay separate', () => {
  const pipeline = new EventPipeline()
  const gift = event({ type: 'gift', giftName: '玫瑰', quantity: 1, comboId: 'combo' })
  pipeline.accept(gift, 'room', [])
  pipeline.accept({ ...gift, id: '2', quantity: 5 }, 'room', [])
  pipeline.accept({ ...gift, id: '3', quantity: 3 }, 'room', [])
  assert.equal(pipeline.events[0].quantity, 5)
  assert.equal(pipeline.events.length, 1)
  pipeline.accept({ ...gift, id: '4', comboId: undefined }, 'room', [])
  pipeline.accept({ ...gift, id: '5', comboId: 'other' }, 'room', [])
  assert.equal(pipeline.events.length, 3)
})
test('cooldown is per room and permits zero without suppressing matches', () => {
  const gate = new ReminderGate()
  assert.equal(gate.allow('a', 30, 0), true)
  assert.equal(gate.allow('a', 30, 1000), false)
  assert.equal(gate.allow('b', 30, 1000), true)
  assert.equal(gate.allow('a', 30, 30000), true)
  assert.equal(gate.allow('a', 0, 30000), true)
})
test('settings normalize words and reject malformed input', () => {
  assert.deepEqual(
    validateSettings({ ...defaultSettings, keywords: [' YES ', 'yes', '补货'] }).keywords,
    ['yes', '补货']
  )
  assert.throws(() => validateSettings({ ...defaultSettings, cooldown: -1 }))
  assert.throws(() => validateSettings({ ...defaultSettings, keywords: [' '] }))
})

test('different gift senders cannot share a combo row', () => {
  const pipeline = new EventPipeline()
  const gift = event({
    type: 'gift',
    giftName: '玫瑰',
    quantity: 1,
    comboId: 'combo',
    userId: 'user-a'
  })
  pipeline.accept(gift, 'room', [])
  pipeline.accept({ ...gift, id: '2', userId: 'user-b' }, 'room', [])
  assert.equal(pipeline.events.length, 2)
})

test('theme settings migrate and reject unknown themes', () => {
  const legacy = { ...defaultSettings } as Record<string, unknown>
  delete legacy.theme
  assert.equal(validateSettings(legacy).theme, 'obsidian')
  for (const theme of ['obsidian', 'cream', 'sakura', 'mint', 'mist']) {
    assert.equal(validateSettings({ ...defaultSettings, theme }).theme, theme)
  }
  assert.throws(() => validateSettings({ ...defaultSettings, theme: 'unsupported' }), /主题/)
})
