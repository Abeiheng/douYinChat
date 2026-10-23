import { WebSocketServer, WebSocket } from 'ws'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateUserProfile,
  type UserProfile,
  isLiveEvent,
  type LiveEvent,
  type BridgeState,
  type Room
} from '../../shared/types'
interface Client {
  authenticated: boolean
  userProfile?: boolean
  autoReply?: boolean
  room?: Room
  alive: boolean
}
export class ExtensionBridge {
  readonly token: string
  private server?: WebSocketServer
  private clients = new Map<WebSocket, Client>()
  private timer?: ReturnType<typeof setInterval>
  private receiving = false
  private entryListening = true
  private error?: string
  private hasConnected = false
  constructor(
    directory: string,
    private emitState: (state: BridgeState) => void,
    private emitEvent: (event: LiveEvent) => void,
    readonly port = 17869,
    entryListening = true,
    private emitWarning: (detail: string) => void = () => {}
  ) {
    this.entryListening = entryListening
    const path = join(directory, 'pairing-token')
    try {
      this.token = readFileSync(path, 'utf8').trim()
      if (!/^[a-f0-9]{48}$/.test(this.token)) throw new Error('invalid')
    } catch {
      this.token = randomBytes(24).toString('hex')
      writeFileSync(path, this.token, { mode: 0o600 })
    }
  }
  get state(): BridgeState {
    const rooms = [
      ...new Map(
        [...this.clients.values()]
          .filter((c) => c.authenticated && c.room)
          .map((c) => [c.room!.id, c.room!])
      ).values()
    ]
    const connected = [...this.clients.values()].some((c) => c.authenticated)
    return {
      rooms,
      receiving: this.receiving,
      replyIssue: [...this.clients.values()].some((c) => c.authenticated && !c.autoReply)
        ? '扩展版本过旧，请在扩展管理页重新加载扩展，再刷新直播页'
        : rooms.some((r) => r.replyProtocol !== 1)
          ? '直播页仍使用旧版脚本，请刷新直播页并重新开始采集'
          : undefined,
      status: this.error
        ? 'error'
        : connected
          ? this.receiving
            ? 'connected'
            : 'stopped'
          : this.hasConnected
            ? 'disconnected'
            : 'waiting',
      detail: this.error
    }
  }
  private events = new Map<string, LiveEvent>()
  private profiles = new Map<
    string,
    {
      socket: WebSocket
      event: LiveEvent
      resolve: (profile: UserProfile) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  async getUserProfile(sourceId: string, eventId: string): Promise<UserProfile> {
    const event = this.events.get(`${sourceId}:${eventId}`)
    if (!event) throw new Error('这条消息已过期，请点击新弹幕的昵称')
    const entry = [...this.clients].find(
      ([, c]) => c.authenticated && c.room?.sourceId === sourceId && c.room.id === event.roomId
    )
    if (!entry || entry[0].readyState !== WebSocket.OPEN)
      throw new Error('对应直播页已关闭或刷新，请点击新弹幕的昵称')
    if (!entry[1].userProfile) throw new Error('请重新加载扩展并刷新直播页，以启用用户资料查看')
    const id = randomBytes(16).toString('hex')
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.profiles.delete(id)
          reject(new Error('用户资料读取超时，请检查直播页登录状态后重试'))
        }, 6000)
        this.profiles.set(id, { socket: entry[0], event, resolve, reject, timer })
        entry[0].send(
          JSON.stringify({
            type: 'profile',
            id,
            eventId,
            roomId: event.roomId,
            sourceId,
            expiresAt: Date.now() + 5000
          })
        )
      })
    } catch (error) {
      if (/未能打开用户卡片|登录状态/.test((error as Error).message))
        return { nickname: event.nickname }
      throw error
    }
  }
  private outgoing = new Map<string, number>()
  isRecentReply(text: string): boolean {
    for (const [body, expires] of this.outgoing)
      if (expires <= Date.now()) this.outgoing.delete(body)
    return this.outgoing.has(text.trim())
  }
  async replyToComment(sourceId: unknown, eventId: unknown, text: unknown): Promise<string> {
    if (
      typeof sourceId !== 'string' ||
      typeof eventId !== 'string' ||
      sourceId.length > 200 ||
      eventId.length > 200 ||
      typeof text !== 'string' ||
      !text.trim() ||
      /[\r\n]/.test(text) ||
      text.length > 100
    )
      throw new Error('请输入有效的单行回复内容')
    const event = this.events.get(`${sourceId}:${eventId}`)
    if (!event || event.type !== 'danmaku') throw new Error('这条评论已过期，请选择新评论回复')
    const body = `${event.nickname},${text.trim()}`
    if (body.length > 100) throw new Error('昵称和回复合计最多 100 字符，请缩短内容')
    return this.reply(event, body)
  }
  async sendMessage(sourceId: unknown, text: unknown): Promise<string> {
    if (
      typeof sourceId !== 'string' ||
      typeof text !== 'string' ||
      !text.trim() ||
      /[\r\n]/.test(text) ||
      text.length > 100
    )
      throw new Error('请输入 100 字符以内的单行内容')
    const room = this.state.rooms.find((room) => room.sourceId === sourceId)
    if (!room) throw new Error('直播间连接已改变，请重新选择直播间')
    return this.reply(
      {
        id: '',
        type: 'danmaku',
        roomId: room.id,
        sourceId,
        receivedAt: Date.now(),
        nickname: '',
        text: ''
      },
      text.trim()
    )
  }
  private pending = new Map<
    string,
    { socket: WebSocket; resolve: (detail: string) => void; timer: ReturnType<typeof setTimeout> }
  >()
  async reply(event: LiveEvent, text: string): Promise<string> {
    const entry = [...this.clients].find(([, c]) => c.authenticated && c.room?.id === event.roomId)
    if (
      !this.receiving ||
      !entry ||
      entry[1].room?.sourceId !== event.sourceId ||
      entry[0].readyState !== WebSocket.OPEN
    )
      return '未提交：直播间已断开或停止接收'
    if (!entry[1].autoReply) return '未提交：扩展版本过旧，请重新加载扩展并刷新直播页'
    if (entry[1].room?.replyProtocol !== 1)
      return '未提交：直播页脚本版本过旧，请刷新直播页并重新开始采集'
    if (this.pending.size) return '未提交：已有消息正在发送，请稍后再试'
    this.outgoing.set(text.trim(), Date.now() + 60000)
    if (this.outgoing.size > 100) this.outgoing.delete(this.outgoing.keys().next().value!)
    const id = randomBytes(16).toString('hex')
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve('提交结果未知：扩展未响应，不会重试')
      }, 6000)
      this.pending.set(id, { socket: entry[0], resolve, timer })
      entry[0].send(
        JSON.stringify({
          type: 'reply',
          id,
          roomId: event.roomId,
          sourceId: event.sourceId,
          text,
          expiresAt: Date.now() + 4000
        })
      )
    })
  }
  private cancelPending(socket?: WebSocket): void {
    for (const [id, pending] of this.profiles) {
      if (socket && pending.socket !== socket) continue
      clearTimeout(pending.timer)
      pending.reject(new Error('直播连接状态已改变，请重试'))
      this.profiles.delete(id)
    }
    for (const [id, pending] of this.pending) {
      if (socket && pending.socket !== socket) continue
      clearTimeout(pending.timer)
      pending.resolve('提交结果未知：连接或接收状态已改变，不会重试')
      this.pending.delete(id)
    }
  }
  start(): void {
    this.server = new WebSocketServer({
      host: '127.0.0.1',
      port: this.port,
      maxPayload: 64 * 1024,
      verifyClient: ({ origin }) => /^chrome-extension:\/\/[a-p]{32}$/.test(origin || '')
    })
    this.server.on('error', () => {
      this.error = '本地连接端口被占用，请关闭其他弹幕应用后重启'
      this.emitState(this.state)
    })
    this.server.on('connection', (socket) => {
      const client: Client = { authenticated: false, alive: true }
      this.clients.set(socket, client)
      const timeout = setTimeout(() => {
        if (!client.authenticated) socket.close(1008)
      }, 5000)
      socket.on('pong', () => {
        client.alive = true
      })
      socket.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (!client.authenticated) {
            if (
              msg.type !== 'pair' ||
              typeof msg.token !== 'string' ||
              msg.token.length !== this.token.length ||
              !timingSafeEqual(Buffer.from(msg.token), Buffer.from(this.token))
            ) {
              socket.close(1008)
              return
            }
            client.userProfile = msg.capabilities?.userProfile === 1
            client.autoReply = msg.capabilities?.autoReply === 1
            client.authenticated = true
            this.hasConnected = true
            clearTimeout(timeout)
            socket.send(
              JSON.stringify({
                type: 'paired',
                receiving: this.receiving,
                entryListening: this.entryListening
              })
            )
            this.emitState(this.state)
            return
          }
          if (msg.type === 'profile-result') {
            const pending = this.profiles.get(msg.id)
            if (!pending || pending.socket !== socket) return
            clearTimeout(pending.timer)
            this.profiles.delete(msg.id)
            try {
              if (typeof msg.error === 'string') throw new Error(msg.error.slice(0, 200))
              if (
                client.room?.id !== pending.event.roomId ||
                client.room.sourceId !== pending.event.sourceId
              )
                throw new Error('直播页已改变，请重试')
              const profile = validateUserProfile(msg.profile)
              if (profile.nickname !== pending.event.nickname)
                throw new Error('资料与弹幕用户不匹配，请重试')
              pending.resolve(profile)
            } catch (error) {
              pending.reject(error as Error)
            }
            return
          }
          if (msg.type === 'reply-result') {
            const pending = this.pending.get(msg.id)
            if (pending?.socket === socket && typeof msg.detail === 'string') {
              clearTimeout(pending.timer)
              this.pending.delete(msg.id)
              pending.resolve(msg.detail.slice(0, 200))
            }
            return
          }
          if (msg.type === 'verification' && typeof msg.detail === 'string') {
            this.emitWarning(msg.detail.slice(0, 200))
            return
          }
          if (
            msg.type === 'room' &&
            msg.room &&
            typeof msg.room.id === 'string' &&
            /^\d{1,30}$/.test(msg.room.id) &&
            typeof msg.room.name === 'string' &&
            msg.room.name.length <= 200 &&
            typeof msg.room.sourceId === 'string' &&
            msg.room.sourceId.length <= 200
          ) {
            client.room = msg.room
            this.emitState(this.state)
          } else if (msg.type === 'room-closed') {
            client.room = undefined
            this.emitState(this.state)
          } else if (
            msg.type === 'event' &&
            this.receiving &&
            client.room &&
            isLiveEvent(msg.event) &&
            msg.event.roomId === client.room.id &&
            msg.event.sourceId === client.room.sourceId
          ) {
            // Only one authenticated source per room may forward events.
            const leader = [...this.clients.values()].find(
              (c) => c.authenticated && c.room?.id === client.room!.id
            )
            if (leader === client) {
              const event = { ...msg.event, receivedAt: Date.now() }
              this.events.set(`${event.sourceId}:${event.id}`, event)
              if (this.events.size > 2000) this.events.delete(this.events.keys().next().value!)
              this.emitEvent(event)
            }
          }
        } catch {
          socket.close(1008)
        }
      })
      socket.on('close', () => {
        clearTimeout(timeout)
        this.cancelPending(socket)
        this.clients.delete(socket)
        this.emitState(this.state)
      })
      socket.on('error', () => socket.close())
    })
    this.timer = setInterval(() => {
      for (const [socket, client] of this.clients) {
        if (!client.alive) socket.terminate()
        else {
          client.alive = false
          socket.ping()
        }
      }
    }, 15000)
  }
  setReceiving(value: boolean): void {
    if (!value) this.cancelPending()
    this.receiving = value
    for (const [socket, client] of this.clients)
      if (client.authenticated && socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: 'receiving', receiving: value }))
    this.emitState(this.state)
  }
  setEntryListening(value: boolean): void {
    this.entryListening = value
    for (const [socket, client] of this.clients)
      if (client.authenticated && socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: 'entry-listening', enabled: value }))
  }
  stop(): void {
    this.cancelPending()
    clearInterval(this.timer)
    for (const socket of this.clients.keys()) socket.terminate()
    this.server?.close()
  }
}
