/* global chrome */
let socket
let paired = false
let receiving = false
let entryListening = true
let heartbeat
let current
let connecting
let lastReply
const active = new Map()
const sessionReady = chrome.storage.session.get(['current']).then((data) => {
  current = data.current
})
function send(message) {
  if (paired && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}
async function connect() {
  if (
    connecting ||
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING
  )
    return
  connecting = true
  try {
    await sessionReady
    const { token } = await chrome.storage.local.get('token')
    if (!token) return
    socket = new WebSocket('ws://127.0.0.1:17869')
    socket.onopen = () =>
      socket.send(
        JSON.stringify({ type: 'pair', token, capabilities: { autoReply: 1, userProfile: 1 } })
      )
    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data)
      if (message.type === 'paired') {
        paired = true
        receiving = message.receiving
        entryListening = message.entryListening !== false
        if (current) {
          send({ type: 'room', room: current.room })
          try {
            await chrome.tabs.sendMessage(current.tabId, {
              type: 'capture',
              enabled: receiving,
              entryEnabled: entryListening,
              roomId: current.room.id
            })
          } catch {
            /* Wait for tab reload. */
          }
        }
        heartbeat = setInterval(() => send({ type: 'heartbeat' }), 20000)
      }
      if (message.type === 'profile') {
        let result = { error: '对应直播页已改变，请点击新弹幕的昵称' }
        if (
          paired &&
          current?.room.id === message.roomId &&
          current.room.sourceId === message.sourceId &&
          Date.now() < message.expiresAt
        ) {
          try {
            result = (await chrome.tabs.sendMessage(current.tabId, message)) || {
              error: '请刷新直播页以启用用户资料查看'
            }
          } catch {
            result = { error: '直播页未响应，请刷新后重试' }
          }
        }
        send({ type: 'profile-result', id: message.id, ...result })
      }
      if (message.type === 'reply') {
        let detail = '未提交：当前直播间未连接'
        if (
          paired &&
          receiving &&
          current?.room.id === message.roomId &&
          current.room.sourceId === message.sourceId &&
          Date.now() < message.expiresAt
        ) {
          try {
            const result = await chrome.tabs.sendMessage(current.tabId, message)
            detail = result?.detail || '提交结果未知，不会重试'
          } catch {
            detail = '提交结果未知：直播页未响应，不会重试'
          }
        }
        lastReply = { detail, at: Date.now() }
        send({ type: 'reply-result', id: message.id, detail })
      }
      if (message.type === 'receiving') {
        receiving = message.receiving
        if (current)
          chrome.tabs
            .sendMessage(current.tabId, {
              type: 'capture',
              enabled: receiving,
              entryEnabled: entryListening,
              roomId: current.room.id
            })
            .catch(() => {})
      }
      if (message.type === 'entry-listening') {
        entryListening = message.enabled !== false
        if (current)
          chrome.tabs
            .sendMessage(current.tabId, {
              type: 'capture',
              enabled: receiving,
              entryEnabled: entryListening,
              roomId: current.room.id
            })
            .catch(() => {})
      }
    }
    socket.onclose = () => {
      paired = false
      receiving = false
      clearInterval(heartbeat)
    }
    socket.onerror = () => socket.close()
  } finally {
    connecting = false
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  ;(async () => {
    await sessionReady
    if (sender.tab && !sender.url?.startsWith(chrome.runtime.getURL(''))) {
      if (!/^https:\/\/live\.douyin\.com\/\d+/.test(sender.tab.url || '')) return { ok: false }
      if (message.type === 'room') {
        active.set(sender.tab.id, message.room)
        if (current?.tabId === sender.tab.id && current.room.id === message.room.id) {
          current.room = message.room
          await chrome.storage.session.set({ current })
          send({ type: 'room', room: current.room })
          return { enabled: paired && receiving }
        }
        if (current?.tabId === sender.tab.id) {
          send({ type: 'room-closed' })
          current = undefined
          await chrome.storage.session.remove('current')
        }
        if (!current && paired && receiving) {
          current = { tabId: sender.tab.id, room: message.room }
          await chrome.storage.session.set({ current })
          send({ type: 'room', room: current.room })
          await chrome.tabs
            .sendMessage(sender.tab.id, {
              type: 'capture',
              enabled: true,
              entryEnabled: entryListening,
              roomId: message.room.id
            })
            .catch(() => {})
          return { enabled: true, automatic: true }
        }
        return { enabled: false }
      }
      if (message.type === 'event' && current?.tabId === sender.tab.id && receiving) send(message)
      if (message.type === 'verification' && current?.tabId === sender.tab.id && paired)
        send(message)
      return { ok: true }
    }
    if (message.type === 'status') {
      await connect()
      return { paired, receiving, current, lastReply, rooms: Object.fromEntries(active) }
    }
    if (message.type === 'pair') {
      if (!/^[a-f0-9]{48}$/.test(message.token || '')) throw new Error('配对码应为 48 位字符')
      await chrome.storage.local.set({ token: message.token })
      if (socket) {
        socket.onclose = null
        socket.close()
      }
      clearInterval(heartbeat)
      paired = false
      socket = undefined
      await connect()
      return { ok: true }
    }
    if (message.type === 'start') {
      if (!paired) throw new Error('桌面端未连接，请先配对并保持桌面应用打开')
      const tab = await chrome.tabs.get(message.tabId)
      if (!/^https:\/\/live\.douyin\.com\/\d+/.test(tab.url || ''))
        throw new Error('请先打开抖音直播间')
      const room = (await chrome.tabs.sendMessage(tab.id, { type: 'identify' })).room
      if (!room) throw new Error('直播间正在加载，请稍后重试')
      if (current && current.tabId !== tab.id)
        await chrome.tabs
          .sendMessage(current.tabId, { type: 'capture', enabled: false })
          .catch(() => {})
      current = { tabId: tab.id, room }
      await chrome.storage.session.set({ current })
      send({ type: 'room', room })
      // User intent is explicit here; the desktop also needs to opt in to receiving.
      await chrome.tabs.sendMessage(tab.id, {
        type: 'capture',
        enabled: receiving,
        entryEnabled: entryListening,
        roomId: room.id
      })
      return { ok: true, needsDesktopStart: !receiving }
    }
    if (message.type === 'stop') {
      if (current)
        await chrome.tabs
          .sendMessage(current.tabId, { type: 'capture', enabled: false })
          .catch(() => {})
      send({ type: 'room-closed' })
      current = undefined
      await chrome.storage.session.remove('current')
      return { ok: true }
    }
    if (message.type === 'show') send({ type: 'show' })
    return { ok: true }
  })()
    .then(respond)
    .catch((error) => respond({ error: error.message }))
  return true
})
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await sessionReady
  active.delete(tabId)
  if (current?.tabId === tabId) {
    current = undefined
    send({ type: 'room-closed' })
    await chrome.storage.session.remove('current')
  }
})
chrome.alarms.create('reconnect', { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener(() => connect())
chrome.runtime.onStartup.addListener(() => connect())
void connect()
