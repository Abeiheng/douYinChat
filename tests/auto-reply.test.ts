import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AutoReply, matchReply } from '../src/main/services/auto-reply'
import { defaultSettings, validateSettings, type LiveEvent } from '../src/shared/types'
const rules = [
  { id: 'a', keyword: '补货', reply: '明天下午补货', enabled: true },
  { id: 'b', keyword: 'HELLO', reply: '你好', enabled: true }
]
const event: LiveEvent = {
  id: '1',
  type: 'danmaku',
  roomId: '123',
  sourceId: 'tab',
  text: '什么时候补货',
  nickname: '访客',
  receivedAt: Date.now()
}
test('old settings migrate without losing preferences, invalid rules are rejected', () => {
  const old = { ...defaultSettings, fontSize: 16, alwaysOnTop: true } as Record<string, unknown>
  delete old.autoReply
  delete old.replyRules
  delete old.replyInterval
  const migrated = validateSettings(old)
  assert.equal(migrated.autoReply, false)
  assert.equal(migrated.alwaysOnTop, true)
  assert.equal(migrated.fontSize, 16)
  assert.throws(() =>
    validateSettings({ ...defaultSettings, replyRules: [{ ...rules[0], reply: '\n' }] })
  )
  assert.throws(() => validateSettings({ ...defaultSettings, replyInterval: 1 }))
})
test('first matching enabled rule wins, matching ignores case', () => {
  assert.equal(matchReply('hello 补货', rules)?.id, 'a')
  assert.equal(matchReply('hello', rules)?.id, 'b')
  assert.equal(matchReply('补货', [{ ...rules[0], enabled: false }]), undefined)
})
test('automatic replies deduplicate, throttle, reject gifts, history, other rooms and reply loops', async () => {
  const sent: string[] = []
  const settings = { ...defaultSettings, replyUserCooldown: 60, autoReply: true, replyRules: rules }
  const engine = new AutoReply(
    () => settings,
    () => '123',
    async (_, text) => {
      sent.push(text)
      return '已提交'
    },
    () => {},
    async () => {}
  )
  await engine.receive(event, 100000)
  await engine.receive(event, 200000)
  await engine.receive({ ...event, id: '2' }, 100001)
  for (const patch of [
    { delayed: true },
    { roomId: '456' },
    { type: 'gift' as const },
    { text: rules[0].reply }
  ]) {
    await engine.receive({ ...event, ...patch, id: JSON.stringify(patch) }, 200000)
  }
  settings.autoReply = false
  await engine.receive({ ...event, id: 'off' }, 200000)
  settings.autoReply = true
  await engine.receive({ ...event, id: '3' }, 200000)
  assert.deepEqual(sent, [rules[0].reply, rules[0].reply])
})
test('pending sends are not queued or retried after an unknown result', async () => {
  let finish!: (detail: string) => void
  let calls = 0
  const engine = new AutoReply(
    () => ({ ...defaultSettings, autoReply: true, replyRules: rules }),
    () => '123',
    () => {
      calls++
      return new Promise((resolve) => {
        finish = resolve
      })
    },
    () => {},
    async () => {}
  )
  const pending = engine.receive(event, 100000)
  await Promise.resolve()
  await engine.receive({ ...event, id: '2' }, 200000)
  assert.equal(calls, 1)
  finish('提交结果未知')
  await pending
  await engine.receive(event, 300000)
  assert.equal(calls, 1)
})

test('random delay spans 1–10 seconds and cancellation prevents later submission', async () => {
  for (const [random, expected] of [
    [0, 1000],
    [0.999999, 10000]
  ]) {
    let release!: () => void
    let delay = 0
    let calls = 0
    const settings = { ...defaultSettings, autoReply: true, replyRules: rules }
    const engine = new AutoReply(
      () => settings,
      () => '123',
      async () => {
        calls++
        return '已提交'
      },
      () => {},
      (ms) => {
        delay = ms
        return new Promise((resolve) => {
          release = resolve
        })
      },
      () => random
    )
    const pending = engine.receive(event)
    assert.equal(delay, expected)
    assert.equal(calls, 0)
    engine.cancelPending()
    release()
    await pending
    assert.equal(calls, 0)
    assert.match(engine.status.detail, /取消/)
  }
})
test('changed rules or disabled auto reply during random delay cannot send', async () => {
  for (const change of ['rule', 'off']) {
    let release!: () => void
    let calls = 0
    const settings = { ...defaultSettings, autoReply: true, replyRules: [...rules] }
    const engine = new AutoReply(
      () => settings,
      () => '123',
      async () => {
        calls++
        return '已提交'
      },
      () => {},
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    const pending = engine.receive(event)
    if (change === 'off') settings.autoReply = false
    else settings.replyRules = []
    release()
    await pending
    assert.equal(calls, 0)
  }
})

test('per-user keyword cooldown is separate from other users and keywords', async () => {
  const settings = {
    ...defaultSettings,
    autoReply: true,
    replyRules: rules,
    replyInterval: 5,
    replyUserCooldown: 120,
    replyMaxPerMinute: 30
  }
  const sent: string[] = []
  const engine = new AutoReply(
    () => settings,
    () => '123',
    async (event, text) => {
      sent.push(event.userId + ':' + text)
      return '已提交'
    },
    () => {},
    async () => {}
  )
  await engine.receive({ ...event, id: '1', userId: 'a' }, 100000)
  await engine.receive({ ...event, id: '2', userId: 'a' }, 110000)
  await engine.receive({ ...event, id: '3', userId: 'b' }, 120000)
  await engine.receive({ ...event, id: '4', userId: 'a', text: 'hello' }, 130000)
  await engine.receive({ ...event, id: '5', userId: 'a' }, 230001)
  assert.deepEqual(sent, ['a:明天下午补货', 'b:明天下午补货', 'a:你好', 'a:明天下午补货'])
})
test('rolling minute cap counts uncertain attempts and releases after the window', async () => {
  const settings = {
    ...defaultSettings,
    autoReply: true,
    replyRules: rules,
    replyInterval: 5,
    replyUserCooldown: 0,
    replyMaxPerMinute: 2
  }
  let sent = 0
  const engine = new AutoReply(
    () => settings,
    () => '123',
    async () => {
      sent++
      return '提交结果未知'
    },
    () => {},
    async () => {}
  )
  for (const [id, at] of [
    ['1', 100000],
    ['2', 110000],
    ['3', 120000],
    ['4', 160100]
  ] as const)
    await engine.receive({ ...event, id }, at)
  assert.equal(sent, 3)
})
test('blocked users and filters never trigger, and filtering cancels an already delayed reply', async () => {
  const settings = { ...defaultSettings, autoReply: true, replyRules: rules, filterWords: ['补货'] }
  let calls = 0
  let release!: () => void
  const engine = new AutoReply(
    () => settings,
    () => '123',
    async () => {
      calls++
      return '已提交'
    },
    () => {},
    () =>
      new Promise((resolve) => {
        release = resolve
      })
  )
  await engine.receive(event, 100000)
  assert.equal(calls, 0)
  settings.filterWords = []
  const pending = engine.receive({ ...event, id: 'pending' }, 200000)
  settings.blockedUsers = [{ roomId: '123', nickname: event.nickname }]
  release()
  await pending
  assert.equal(calls, 0)
  assert.match(engine.status.detail, /取消/)
})
