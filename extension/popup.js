/* global chrome */
const $ = (id) => document.getElementById(id)
let tab
async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: 'status' })
  ;[tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const supported = /^https:\/\/live\.douyin\.com\/\d+/.test(tab?.url || '')
  const room = state.rooms?.[tab?.id] || (supported ? { name: tab.title } : undefined)
  const selected = state.current?.tabId === tab?.id
  $('dot').classList.toggle('connected', state.paired)
  $('connection').textContent = state.paired ? '桌面端已连接' : '桌面端未连接'
  $('room').textContent = room?.name || '请打开抖音直播间'
  $('capture').textContent =
    selected && state.receiving
      ? '采集中 · 实验性弹幕适配'
      : selected
        ? '请在桌面设置中开始接收'
        : '尚未采集'
  $('start').disabled = !state.paired || !supported
  $('start').hidden = selected
  $('stop').hidden = !selected
}
$('pair-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const result = await chrome.runtime.sendMessage({ type: 'pair', token: $('token').value.trim() })
  $('error').textContent = result.error || '正在连接，请保持桌面应用打开…'
  $('token').value = ''
  await refresh()
})
$('start').addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({ type: 'start', tabId: tab.id })
  $('error').textContent =
    result.error ||
    (result.needsDesktopStart ? '已选择直播间，请在桌面设置中点击「开始接收」。' : '')
  await refresh()
})
$('stop').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'stop' })
  await refresh()
})
void refresh()
setInterval(refresh, 1500)
