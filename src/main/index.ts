import { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, shell } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { AutoReply } from './services/auto-reply'
import { SettingsStore } from './services/settings'
import { ExtensionBridge } from './services/bridge'

let window: BrowserWindow
let tray: Tray | undefined
let quitting = false
let store: SettingsStore
let bridge: ExtensionBridge
const locked = app.requestSingleInstanceLock()
if (!locked) app.quit()
else {
  app.on('second-instance', () => {
    window?.show()
    window?.focus()
  })
  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.danmaku.desktop')
    store = new SettingsStore(app.getPath('userData'))
    await store.load()
    window = new BrowserWindow({
      width: 360,
      height: 520,
      minWidth: 300,
      minHeight: 360,
      show: false,
      frame: false,
      backgroundColor: '#303132',
      title: '弹幕',
      icon: join(__dirname, '../../resources/icon.png'),
      autoHideMenuBar: true,
      alwaysOnTop: store.value.alwaysOnTop,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    window.on('ready-to-show', () => window.show())
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.on('close', (event) => {
      if (!quitting && store.value.closeToTray && tray) {
        event.preventDefault()
        window.hide()
      } else {
        quitting = true
        app.quit()
      }
    })
    const updateTray = (): void => {
      if (!store.value.closeToTray) {
        tray?.destroy()
        tray = undefined
        return
      }
      if (tray) return
      const image =
        process.platform === 'win32'
          ? nativeImage
              .createFromPath(join(__dirname, '../../resources/tray-icon.png'))
              .resize({ width: 16, height: 16 })
          : nativeImage.createFromDataURL(
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAAL0lEQVR4nGNgGDHgP4kYr0GkWDpEDSLEHsJeo9ggqqQjdNtIcSFel1EMqGLIMAEA8D0t0y62ryUAAAAASUVORK5CYII='
            )
      if (process.platform === 'darwin') image.setTemplateImage(true)
      tray = new Tray(image)
      tray.setToolTip('弹幕')
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: '显示窗口', click: () => window.show() },
          { type: 'separator' },
          {
            label: '退出',
            click: () => {
              quitting = true
              app.quit()
            }
          }
        ])
      )
      tray.on('click', () => window.show())
    }
    updateTray()
    const replies = new AutoReply(
      () => store.value,
      () => store.value.roomId || bridge.state.rooms[0]?.id || '',
      (event, text) => bridge.reply(event, text),
      (status) => window.webContents.send('reply:status', status)
    )
    ipcMain.handle('reply:get', () => replies.status)
    let roomSources = ''
    bridge = new ExtensionBridge(
      app.getPath('userData'),
      (state) => {
        const sources = state.rooms
          .map((r) => `${r.id}:${r.sourceId}`)
          .sort()
          .join(',')
        if (!state.receiving || state.status !== 'connected' || sources !== roomSources)
          replies.cancelPending()
        roomSources = sources
        window.webContents.send('bridge:state', state)
      },
      (event) => {
        window.webContents.send('bridge:event', event)
        if (!bridge.isRecentReply(event.text)) void replies.receive(event)
      },
      17869,
      store.value.listenEnter,
      (detail) => {
        window.webContents.send('bridge:verification', detail)
        if (Notification.isSupported()) {
          const notification = new Notification({
            title: '抖音直播需要验证',
            body: detail.slice(0, 200)
          })
          notification.on('click', () => {
            window.show()
            window.focus()
          })
          notification.show()
        }
      }
    )
    bridge.start()
    // Every exposed operation is specific; renderer never receives raw Node or IPC access.
    ipcMain.handle('settings:get', () => store.value)
    ipcMain.handle('settings:save', async (_, value) => {
      const previous = store.value
      const next = await store.save(value)
      if (previous.listenEnter !== next.listenEnter) bridge.setEntryListening(next.listenEnter)
      if (
        previous.replyUserCooldown !== next.replyUserCooldown ||
        previous.replyMaxPerMinute !== next.replyMaxPerMinute ||
        previous.hideSelf !== next.hideSelf ||
        previous.selfNickname !== next.selfNickname ||
        JSON.stringify(previous.filterWords) !== JSON.stringify(next.filterWords) ||
        JSON.stringify(previous.blockedUsers) !== JSON.stringify(next.blockedUsers) ||
        previous.autoReply !== next.autoReply ||
        previous.roomId !== next.roomId ||
        JSON.stringify(previous.replyRules) !== JSON.stringify(next.replyRules)
      )
        replies.cancelPending()
      window.setAlwaysOnTop(next.alwaysOnTop)
      updateTray()
      return next
    })
    ipcMain.handle('window:close', () => window.close())
    ipcMain.handle('browser:open-live', () => {
      const extensionPath = join(app.getAppPath(), 'extension')
      const configPath = join(app.getAppPath(), 'output/playwright/extension.config.json')
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf8'))
        const executable = config.browser?.launchOptions?.executablePath
        if (existsSync(extensionPath) && typeof executable === 'string' && existsSync(executable)) {
          const profile = join(app.getPath('userData'), 'managed-browser-profile')
          const child = spawn(
            executable,
            [
              `--user-data-dir=${profile}`,
              `--disable-extensions-except=${extensionPath}`,
              `--load-extension=${extensionPath}`,
              '--no-first-run',
              '--no-default-browser-check',
              'https://live.douyin.com'
            ],
            { detached: true, stdio: 'ignore' }
          )
          child.unref()
          return
        }
      } catch {
        // Fall back to the user's default browser when the managed browser is unavailable.
      }
      return shell.openExternal('https://live.douyin.com')
    })
    ipcMain.handle('comment:send', (_, sourceId, text) => bridge.sendMessage(sourceId, text))
    ipcMain.handle('comment:reply', (_, sourceId, eventId, text) =>
      bridge.replyToComment(sourceId, eventId, text)
    )
    ipcMain.handle('profile:get', (_, sourceId, eventId) => {
      if (
        typeof sourceId !== 'string' ||
        typeof eventId !== 'string' ||
        sourceId.length > 200 ||
        eventId.length > 200
      )
        throw new Error('消息编号无效')
      return bridge.getUserProfile(sourceId, eventId)
    })
    ipcMain.handle('bridge:get', () => bridge.state)
    ipcMain.handle('bridge:pairing', () => ({ token: bridge.token, port: bridge.port }))
    ipcMain.handle('bridge:receiving', (_, value) => {
      if (typeof value !== 'boolean') throw new Error('Invalid state')
      bridge.setReceiving(value)
    })
    ipcMain.handle('reminder:notify', (_, title, body) => {
      if (
        !store.value.reminders ||
        !store.value.notifications ||
        typeof title !== 'string' ||
        typeof body !== 'string' ||
        !Notification.isSupported()
      )
        return
      const notification = new Notification({
        title: title.slice(0, 120),
        body: body.slice(0, 500)
      })
      notification.on('click', () => {
        window.show()
        window.focus()
      })
      notification.show()
    })
    if (is.dev) optimizer.watchWindowShortcuts(window)
    if (is.dev && process.env.ELECTRON_RENDERER_URL)
      await window.loadURL(process.env.ELECTRON_RENDERER_URL)
    else await window.loadFile(join(__dirname, '../renderer/index.html'))
    app.on('activate', () => window.show())
  })
  app.on('before-quit', () => {
    quitting = true
    bridge?.stop()
  })
  app.on('window-all-closed', () => app.quit())
}
