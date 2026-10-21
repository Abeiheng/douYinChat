import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAPI, BridgeState, LiveEvent, ReplyStatus } from '../shared/types'
const api: DesktopAPI = {
  sendMessage: (sourceId, text) => ipcRenderer.invoke('comment:send', sourceId, text),
  replyToComment: (sourceId, eventId, text) =>
    ipcRenderer.invoke('comment:reply', sourceId, eventId, text),
  getUserProfile: (sourceId, eventId) => ipcRenderer.invoke('profile:get', sourceId, eventId),
  getReplyStatus: () => ipcRenderer.invoke('reply:get'),
  onReplyStatus: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, status: ReplyStatus): void => callback(status)
    ipcRenderer.on('reply:status', listener)
    return () => {
      ipcRenderer.removeListener('reply:status', listener)
    }
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  close: () => ipcRenderer.invoke('window:close'),
  notify: (title, body) => ipcRenderer.invoke('reminder:notify', title, body),
  getBridge: () => ipcRenderer.invoke('bridge:get'),
  getPairing: () => ipcRenderer.invoke('bridge:pairing'),
  setReceiving: (value) => ipcRenderer.invoke('bridge:receiving', value),
  onEvent: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, event: LiveEvent): void => callback(event)
    ipcRenderer.on('bridge:event', listener)
    return () => {
      ipcRenderer.removeListener('bridge:event', listener)
    }
  },
  onBridge: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, state: BridgeState): void => callback(state)
    ipcRenderer.on('bridge:state', listener)
    return () => {
      ipcRenderer.removeListener('bridge:state', listener)
    }
  }
}
contextBridge.exposeInMainWorld('api', api)
