import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export const api = {
  // App Config & Rules
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  isPreviewInstance: () => ipcRenderer.invoke('app:is-preview') as Promise<boolean>,
  getConfig: () => ipcRenderer.invoke('app:get-config'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('app:save-config', config),
  reloadCoreConfig: () => ipcRenderer.invoke('core:reload'),

  // Core Process Management
  getCoreStatus: () => ipcRenderer.invoke('core:get-status'),
  restartCore: () => ipcRenderer.invoke('core:restart'),
  killAllMihomo: (restart = false) => ipcRenderer.invoke('core:kill-all', restart),
  resolvePortConflict: () => ipcRenderer.invoke('core:resolve-port-conflict'),

  // Subscription Management
  addSubscription: (url: string, name: string) =>
    ipcRenderer.invoke('sub:add', { url, name }),
  importShareLinks: (content: string, name?: string) =>
    ipcRenderer.invoke('sub:import-links', { content, name }),
  updateSubscription: (id: string) => ipcRenderer.invoke('sub:update', id),
  updateAllSubscriptions: () => ipcRenderer.invoke('sub:update-all'),
  toggleSubscription: (id: string, enabled: boolean) =>
    ipcRenderer.invoke('sub:toggle', { id, enabled }),
  editSubscription: (id: string, name: string, url: string) =>
    ipcRenderer.invoke('sub:edit', { id, name, url }),
  deleteSubscription: (id: string) => ipcRenderer.invoke('sub:delete', id),

  // Node Operations (Node-Centric)
  selectNode: (nodeName: string) => ipcRenderer.invoke('node:select', nodeName),
  addNode: (node: unknown) => ipcRenderer.invoke('node:add', node),
  editNode: (oldName: string, updatedNode: unknown) =>
    ipcRenderer.invoke('node:edit', { oldName, updatedNode }),
  deleteNode: (nodeName: string) => ipcRenderer.invoke('node:delete', nodeName),
  testNodeDelay: (nodeName: string) => ipcRenderer.invoke('node:test-delay', nodeName),
  testAllNodes: () => ipcRenderer.invoke('node:test-all'),

  // GeoData Rule Provider Update
  getGeoDataStatus: () => ipcRenderer.invoke('geo:get-status'),
  updateGeoData: () => ipcRenderer.invoke('geo:update'),

  // System & Window
  setSystemProxy: (enable: boolean) => ipcRenderer.invoke('sys:set-proxy', enable),
  openSystemProxySettings: () => ipcRenderer.invoke('sys:open-proxy-settings'),
  setAutoStart: (enable: boolean) => ipcRenderer.invoke('sys:set-autostart', enable),
  getAutoStartStatus: () => ipcRenderer.invoke('sys:get-autostart'),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // Windows System Service Mode
  getServiceStatus: () => ipcRenderer.invoke('service:get-status'),
  installService: () => ipcRenderer.invoke('service:install'),
  uninstallService: () => ipcRenderer.invoke('service:uninstall'),
  startService: () => ipcRenderer.invoke('service:start'),
  stopService: () => ipcRenderer.invoke('service:stop'),
  getServiceLogs: () => ipcRenderer.invoke('service:get-logs'),

  // High-Priority Task Scheduler
  getTaskStatus: () => ipcRenderer.invoke('task:get-status'),
  installTask: () => ipcRenderer.invoke('task:install'),
  uninstallTask: () => ipcRenderer.invoke('task:uninstall'),
  openTaskScheduler: () => ipcRenderer.invoke('task:open-scheduler'),

  // System Utilities & Network Repair
  flushDns: () => ipcRenderer.invoke('util:flush-dns'),
  resetWinsock: () => ipcRenderer.invoke('util:reset-winsock'),
  fixFirewall: () => ipcRenderer.invoke('util:fix-firewall'),
  fixWintun: () => ipcRenderer.invoke('util:fix-wintun'),
  allowUwpLoopback: () => ipcRenderer.invoke('util:allow-uwp-loopback'),

  // Traffic Analytics
  getTrafficSummary: () => ipcRenderer.invoke('traffic:get-summary'),
  resetTrafficStats: () => ipcRenderer.invoke('traffic:reset'),

  // Connections Management (Verge-style)
  getConnections: () => ipcRenderer.invoke('connections:get-snapshot'),
  closeConnection: (id: string) => ipcRenderer.invoke('connections:close', id),
  closeAllConnections: () => ipcRenderer.invoke('connections:close-all'),

  // Logs & Events
  getLogHistory: () => ipcRenderer.invoke('log:get-history'),
  clearLogHistory: () => ipcRenderer.invoke('log:clear'),
  onNewLog: (callback: (log: { id: string; time: string; type: string; payload: string }) => void) => {
    const sub = (
      _: unknown,
      val: { id: string; time: string; type: string; payload: string }
    ) => callback(val)
    ipcRenderer.on('core:new-log', sub)
    return () => ipcRenderer.removeListener('core:new-log', sub)
  },
  onTrafficUpdate: (callback: (data: { up: number; down: number }) => void) => {
    const sub = (_: unknown, val: { up: number; down: number }) => callback(val)
    ipcRenderer.on('traffic:update', sub)
    return () => ipcRenderer.removeListener('traffic:update', sub)
  },
  onAbnormalAlert: (
    callback: (data: {
      reason: string
      systemProxyActive: boolean
      autoDisabledProxy?: boolean
      message: string
      occupants?: { port: number; pid: number; image: string }[]
      timestamp: number
    }) => void
  ) => {
    const sub = (
      _: unknown,
      val: {
        reason: string
        systemProxyActive: boolean
        autoDisabledProxy?: boolean
        message: string
        occupants?: { port: number; pid: number; image: string }[]
        timestamp: number
      }
    ) => callback(val)
    ipcRenderer.on('core:abnormal-alert', sub)
    return () => ipcRenderer.removeListener('core:abnormal-alert', sub)
  },
  onCoreRecovered: (callback: () => void) => {
    const sub = () => callback()
    ipcRenderer.on('core:recovered', sub)
    return () => ipcRenderer.removeListener('core:recovered', sub)
  },
  onConfigUpdated: (callback: (config: unknown) => void) => {
    const sub = (_: unknown, val: unknown) => callback(val)
    ipcRenderer.on('app:config-updated', sub)
    return () => ipcRenderer.removeListener('app:config-updated', sub)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in window)
  window.electron = electronAPI
  // @ts-ignore (define in window)
  window.api = api
}
