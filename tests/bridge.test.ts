import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'
import { ExtensionBridge } from '../src/main/services/bridge'
import type { LiveEvent } from '../src/shared/types'

test('local bridge rejects websites and wrong tokens, forwards paired events and stops reception', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'danmaku-bridge-'))
  const received: LiveEvent[] = []
  const bridge = new ExtensionBridge(
    directory,
    () => {},
    (e) => received.push(e),
    17870
  )
  const sockets: WebSocket[] = []
  const dial = async (origin: string): Promise<WebSocket> => {
    const socket = new WebSocket('ws://127.0.0.1:17870', { origin })
    sockets.push(socket)
    await once(socket, 'open')
    return socket
  }
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 35))
  try {
    bridge.start()
    await settle()
    await assert.rejects(dial('https://live.douyin.com'), /401/)
    const origin = `chrome-extension://${'a'.repeat(32)}`
    const rejected = await dial(origin)
    const closed = once(rejected, 'close')
    rejected.send(JSON.stringify({ type: 'pair', token: '0'.repeat(48) }))
    assert.equal((await closed)[0], 1008)
    const socket = await dial(origin)
    const paired = once(socket, 'message')
    socket.send(
      JSON.stringify({
        type: 'pair',
        token: bridge.token,
        capabilities: { autoReply: 1, userProfile: 1 }
      })
    )
    assert.equal(JSON.parse((await paired)[0].toString()).type, 'paired')
    socket.send(
      JSON.stringify({
        type: 'room',
        room: { id: '1234', name: '测试直播间', sourceId: 'tab-1', replyProtocol: 1 }
      })
    )
    await settle()
    assert.equal(bridge.state.rooms[0]?.id, '1234')
    const event: LiveEvent = {
      id: 'event-1',
      type: 'danmaku',
      roomId: '1234',
      sourceId: 'tab-1',
      receivedAt: 1,
      nickname: '小满',
      text: '测试补货'
    }
    socket.send(JSON.stringify({ type: 'event', event }))
    await settle()
    assert.equal(received.length, 0)
    bridge.setReceiving(true)
    socket.send(JSON.stringify({ type: 'event', event }))
    socket.send(JSON.stringify({ type: 'event', event: { ...event, sourceId: 'wrong-source' } }))
    await settle()
    assert.equal(received.length, 1)
    assert.ok(received[0].receivedAt > 1)
    await assert.rejects(bridge.getUserProfile('tab-1', 'unknown'), /过期/)
    const profileCommand = once(socket, 'message')
    const profileResult = bridge.getUserProfile('tab-1', event.id)
    const profileMessage = JSON.parse((await profileCommand)[0].toString())
    assert.equal(profileMessage.type, 'profile')
    assert.equal(profileMessage.eventId, event.id)
    socket.send(
      JSON.stringify({
        type: 'profile-result',
        id: profileMessage.id,
        profile: {
          nickname: event.nickname,
          age: '24岁',
          location: '安阳',
          stats: '17 关注 · 62 粉丝'
        }
      })
    )
    assert.equal((await profileResult).location, '安阳')
    const mismatchCommand = once(socket, 'message')
    const mismatch = bridge.getUserProfile('tab-1', event.id)
    const mismatchRejected = assert.rejects(mismatch, /不匹配/)
    const mismatchMessage = JSON.parse((await mismatchCommand)[0].toString())
    socket.send(
      JSON.stringify({
        type: 'profile-result',
        id: mismatchMessage.id,
        profile: { nickname: '另一个人' }
      })
    )
    await mismatchRejected
    const commandPromise = once(socket, 'message')
    const reply = bridge.reply(event, '明天下午补货')
    const command = JSON.parse((await commandPromise)[0].toString())
    assert.equal(command.type, 'reply')
    assert.equal(command.sourceId, 'tab-1')
    socket.send(JSON.stringify({ type: 'reply-result', id: command.id, detail: '已提交' }))
    assert.equal(await reply, '已提交')
    await assert.rejects(bridge.replyToComment('tab-1', 'unknown', '你好'), /过期/)
    await assert.rejects(bridge.replyToComment('tab-1', event.id, '  '), /有效/)
    await assert.rejects(bridge.replyToComment('tab-1', event.id, 'a'.repeat(100)), /合计/)
    await assert.rejects(bridge.sendMessage('tab-1', '一行\n两行'), /单行/)
    await assert.rejects(bridge.sendMessage('wrong-source', '你好'), /连接已改变/)
    const manualCommand = once(socket, 'message')
    const manualReply = bridge.replyToComment('tab-1', event.id, ' 好的 ')
    const manual = JSON.parse((await manualCommand)[0].toString())
    assert.equal(manual.text, '小满,好的')
    assert.equal(manual.sourceId, 'tab-1')
    assert.match(await bridge.sendMessage('tab-1', '普通弹幕'), /已有消息正在发送/)
    assert.equal(bridge.isRecentReply('小满,好的'), true)
    socket.send(JSON.stringify({ type: 'reply-result', id: manual.id, detail: '已提交' }))
    assert.equal(await manualReply, '已提交')
    const plainCommand = once(socket, 'message')
    const plainReply = bridge.sendMessage('tab-1', ' 普通弹幕 ')
    const plain = JSON.parse((await plainCommand)[0].toString())
    assert.equal(plain.text, '普通弹幕')
    socket.send(JSON.stringify({ type: 'reply-result', id: plain.id, detail: '已提交' }))
    assert.equal(await plainReply, '已提交')
    const pendingReply = bridge.reply(event, '明天下午补货')
    bridge.setReceiving(false)
    assert.match(await pendingReply, /不会重试/)
    assert.match(await bridge.reply(event, '明天下午补货'), /未提交/)
    socket.send(JSON.stringify({ type: 'event', event }))
    await settle()
    assert.equal(received.length, 1)
  } finally {
    sockets.forEach((socket) => socket.terminate())
    bridge.stop()
    await rm(directory, { recursive: true, force: true })
  }
})

test('old background or stale content script is diagnosed without dispatching a reply', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'danmaku-version-'))
  const bridge = new ExtensionBridge(
    directory,
    () => {},
    () => {},
    17872
  )
  const sockets: WebSocket[] = []
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 35))
  const event: LiveEvent = {
    id: '1',
    type: 'danmaku',
    roomId: '123',
    sourceId: 'source',
    receivedAt: Date.now(),
    nickname: '测试',
    text: '补货'
  }
  try {
    bridge.start()
    await settle()
    for (const updated of [false, true]) {
      const socket = new WebSocket('ws://127.0.0.1:17872', {
        origin: `chrome-extension://${'a'.repeat(32)}`
      })
      sockets.push(socket)
      await once(socket, 'open')
      const paired = once(socket, 'message')
      socket.send(
        JSON.stringify({
          type: 'pair',
          token: bridge.token,
          ...(updated ? { capabilities: { autoReply: 1, userProfile: 1 } } : {})
        })
      )
      await paired
      socket.send(
        JSON.stringify({ type: 'room', room: { id: '123', sourceId: 'source', name: '测试' } })
      )
      await settle()
      bridge.setReceiving(true)
      const result = await bridge.reply(event, '测试回复')
      assert.match(result, updated ? /直播页脚本版本过旧/ : /扩展版本过旧/)
      assert.match(bridge.state.replyIssue!, updated ? /刷新直播页/ : /重新加载扩展/)
      const closed = once(socket, 'close')
      socket.close()
      await closed
    }
  } finally {
    sockets.forEach((socket) => socket.terminate())
    bridge.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
