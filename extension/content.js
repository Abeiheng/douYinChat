/* global chrome */
// Experimental DOM adapter: only forward observed text. Gift fields are deliberately
// unsupported until verified against a real live room and reliable combo identity.
let enabled = false
let room
let observedUrl = ''
let sequence = 0
const sourceId = crypto.randomUUID()
const processed = new WeakSet()
const usersByEvent = new Map()
let profileBusy = false
const selectors = '[data-e2e="chat-message"], .webcast-chatroom___item'
function identify() {
  const id = location.pathname.match(/^\/(\d+)/)?.[1]
  if (!id) return undefined
  return {
    id,
    sourceId,
    replyProtocol: 1,
    name:
      (document.querySelector('[data-e2e="live-room-nickname"]')?.textContent || document.title)
        .replace(/[-_｜|].*$/, '')
        .trim()
        .slice(0, 180) || `抖音直播间 ${id}`
  }
}
function skipExisting() {
  document.querySelectorAll(selectors).forEach((node) => processed.add(node))
}
async function announce() {
  const next = identify()
  if (!next) {
    enabled = false
    return
  }
  if (room?.id !== next.id) {
    enabled = false
    skipExisting()
  }
  room = next
  const state = await chrome.runtime.sendMessage({ type: 'room', room }).catch(() => null)
  enabled = Boolean(state?.enabled)
}
chrome.runtime.onMessage.addListener((message, _, respond) => {
  if (message.type === 'profile') {
    readProfile(message)
      .then(respond)
      .catch(() => respond({ error: '用户资料读取失败，请在直播页检查登录状态' }))
    return true
  }
  if (message.type === 'reply') {
    submitReply(message)
      .then(respond)
      .catch(() => respond({ detail: '提交结果未知，不会重试' }))
    return true
  }
  if (message.type === 'identify') {
    respond({ room: identify() })
    return
  }
  if (message.type === 'capture') {
    enabled = Boolean(message.enabled) && (!message.roomId || message.roomId === identify()?.id)
    skipExisting()
    respond({ ok: true })
  }
})
function collect(element) {
  if (room?.id !== identify()?.id) {
    enabled = false
    void announce()
    return
  }
  if (!enabled || !room || processed.has(element)) return
  const textNode = element.querySelector(
    '[data-e2e="chat-message-text"], .webcast-chatroom___content-with-emoji-text'
  )
  // Verified on a live room on 2026-10-21: the nickname is the preceding
  // sibling of the text wrapper. Avoid depending on generated CSS hashes.
  const preceding = textNode?.parentElement?.previousElementSibling
  const userNode =
    element.querySelector('[data-e2e="chat-message-user"], .webcast-chatroom___user-name') ||
    (preceding?.textContent?.trim().endsWith('：') ? preceding : null)
  const nickname = userNode?.textContent?.trim().replace(/：$/, '')
  const body = textNode?.textContent?.trim()
  if (!nickname || !body) return
  processed.add(element)
  // Read only an explicit profile link belonging to this exact nickname node.
  const profileLink = userNode.matches('a[href]') ? userNode : userNode.querySelector('a[href]')
  const userId = profileLink
    ?.getAttribute('href')
    ?.match(/^(?:https:\/\/(?:www\.)?douyin\.com)?\/user\/([A-Za-z0-9_-]{1,200})(?:[?#/]|$)/)?.[1]
  const platformId = element.getAttribute('data-message-id') || undefined
  const id = `${sourceId}-${sequence++}`
  usersByEvent.set(id, { node: userNode, nickname })
  if (usersByEvent.size > 2000) usersByEvent.delete(usersByEvent.keys().next().value)
  chrome.runtime
    .sendMessage({
      type: 'event',
      event: {
        id,
        type: 'danmaku',
        sourceId,
        roomId: room.id,
        receivedAt: Date.now(),
        nickname,
        isHost: readPublicHost(userNode.previousElementSibling),
        ...(userId ? { userId } : {}),
        text: body,
        ...(platformId ? { platformId } : {})
      }
    })
    .catch(() => {})
}
const observer = new MutationObserver((records) => {
  if (!enabled) return
  for (const record of records) {
    const parent =
      record.target instanceof Element
        ? record.target.closest(selectors)
        : record.target.parentElement?.closest(selectors)
    if (parent) collect(parent)
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue
      if (node.matches(selectors)) collect(node)
      node.querySelectorAll(selectors).forEach(collect)
    }
  }
})
skipExisting()
observer.observe(document.body, { childList: true, subtree: true, characterData: true })
observedUrl = location.href
void announce()
setInterval(() => {
  const currentRoom = identify()
  if (observedUrl !== location.href || (currentRoom && room && currentRoom.name !== room.name)) {
    observedUrl = location.href
    void announce()
  }
}, 1500)

const replyCommands = new Set()
function cleanDraft(editor) {
  return editor.textContent.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
}
async function submitReply(command) {
  if (
    !enabled ||
    identify()?.id !== command.roomId ||
    sourceId !== command.sourceId ||
    Date.now() >= command.expiresAt
  )
    return { detail: '未提交：直播间或接收状态已改变' }
  if (
    typeof command.id !== 'string' ||
    replyCommands.has(command.id) ||
    typeof command.text !== 'string' ||
    !command.text.trim() ||
    command.text.length > 100 ||
    /[\r\n]/.test(command.text)
  )
    return { detail: '未提交：命令重复或内容无效' }
  replyCommands.add(command.id)
  if (replyCommands.size > 1000) replyCommands.delete(replyCommands.values().next().value)
  // Selectors verified against the live chat composer; never use the search input.
  const editor = document.querySelector(
    '#chatInput [data-e2e="live-chatting"] [contenteditable="true"]'
  )
  const button = document.querySelector('#chatInput .webcast-chatroom___send-btn')
  if (!editor || !button || !editor.getClientRects().length)
    return { detail: '未提交：未找到聊天输入框，请检查登录状态' }
  if (cleanDraft(editor)) return { detail: '未提交：输入框已有草稿，请先处理草稿' }
  const focused = document.activeElement
  editor.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(editor)
  selection.removeAllRanges()
  selection.addRange(range)
  // execCommand invokes the rich editor's input handling, unlike changing textContent.
  document.execCommand('insertText', false, command.text)
  // The rich editor updates/replaces its send button asynchronously. Resolve it
  // again on each check instead of clicking the initially disabled SVG node.
  let readyButton
  const deadline = Math.min(command.expiresAt, Date.now() + 2000)
  while (Date.now() < deadline) {
    if (!enabled || identify()?.id !== command.roomId || cleanDraft(editor) !== command.text)
      return { detail: '未提交：页面或草稿已改变' }
    const candidate = document.querySelector('#chatInput .webcast-chatroom___send-btn')
    if (
      candidate?.isConnected &&
      !candidate.hasAttribute('disabled') &&
      candidate.getAttribute('aria-disabled') !== 'true' &&
      !candidate.classList.contains('disable')
    ) {
      readyButton = candidate
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  if (!readyButton || Date.now() >= command.expiresAt)
    return { detail: '未提交：发送按钮未就绪，回复保留在输入框' }
  readyButton.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
  )
  const confirmationDeadline = Date.now() + 1000
  while (Date.now() < confirmationDeadline) {
    const currentEditor = document.querySelector(
      '#chatInput [data-e2e="live-chatting"] [contenteditable="true"]'
    )
    if (currentEditor && !cleanDraft(currentEditor)) break
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  if (
    focused instanceof HTMLElement &&
    focused !== document.body &&
    document.activeElement === editor
  )
    focused.focus()
  const currentEditor = document.querySelector(
    '#chatInput [data-e2e="live-chatting"] [contenteditable="true"]'
  )
  return {
    detail:
      currentEditor && !cleanDraft(currentEditor)
        ? '已提交给直播页，输入框已清空（平台送达未确认）'
        : '提交未确认：输入框未清空，不会重试'
  }
}

async function readProfile(command) {
  if (profileBusy) return { error: '正在读取另一位用户的资料，请稍后重试' }
  if (
    identify()?.id !== command.roomId ||
    sourceId !== command.sourceId ||
    Date.now() >= command.expiresAt
  )
    return { error: '直播页已改变，请点击新弹幕的昵称' }
  const user = usersByEvent.get(command.eventId)
  if (!user?.node.isConnected) return { error: '对应弹幕已移出直播页，请点击新弹幕的昵称' }
  profileBusy = true
  const hiddenCardStyle = document.createElement('style')
  hiddenCardStyle.textContent =
    '.semi-popover-wrapper:has(.user_name h3) { visibility: hidden !important; pointer-events: none !important; }'
  document.head.append(hiddenCardStyle)
  try {
    // Use the exact nickname node that produced this event, never search by name.
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 100))
    const oldCards = new Set(
      [...document.querySelectorAll('[role="dialog"]')].filter(
        (el) => el.getClientRects().length && el.querySelector('.user_name h3')
      )
    )
    user.node.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
    )
    while (Date.now() < command.expiresAt) {
      if (identify()?.id !== command.roomId) return { error: '直播间已改变，请重试' }
      const card = [...document.querySelectorAll('[role="dialog"]')].find(
        (el) =>
          !oldCards.has(el) &&
          el.getClientRects().length &&
          el.querySelector('.user_name h3')?.textContent.trim() === user.nickname
      )
      if (card) {
        const stats = [...card.querySelectorAll('span')]
          .map((el) => el.textContent.trim())
          .find((text) => /^\S+\s*关注\s*·\s*\S+\s*粉丝$/.test(text))
        const avatar = card.querySelector('.avatar img')?.src
        return {
          profile: {
            nickname: user.nickname,
            gender: readPublicGender(card),
            ...(avatar ? { avatar } : {}),
            age: card.querySelector('.gender_and_age')?.textContent.trim() || '',
            location: card.querySelector('.location_info')?.textContent.trim() || '',
            stats: stats || ''
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return { error: '未能打开用户卡片，请检查直播页登录状态后重试' }
  } finally {
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 200))
    // Keep any closing animation invisible without affecting future cards.
    document.querySelectorAll('.semi-popover-wrapper:has(.user_name h3)').forEach((card) => {
      card.style.visibility = 'hidden'
      card.style.pointerEvents = 'none'
    })
    hiddenCardStyle.remove()
    profileBusy = false
  }
}

function readPublicHost(badges) {
  return [...(badges?.querySelectorAll('img') || [])].some((image) => {
    try {
      const url = new URL(image.src)
      return (
        url.protocol === 'https:' &&
        url.hostname.endsWith('.douyinpic.com') &&
        /(?:^|\/)webcast_anchor_badge\.png(?:~|$)/.test(url.pathname)
      )
    } catch {
      return false
    }
  })
}
function readPublicGender(card) {
  for (const image of card.querySelectorAll('.gender_and_age img')) {
    try {
      const url = new URL(image.src)
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.douyinpic.com')) continue
      const gender = url.pathname.match(/\/gender_(male|female)\.png(?:~|$)/)?.[1]
      if (gender) return gender
    } catch {
      /* Unrecognized image is not a gender signal. */
    }
  }
  return 'unknown'
}
