import { app, shell, BrowserWindow, ipcMain, powerMonitor, screen, Notification, dialog } from 'electron'
import { join } from 'path'
import { exec } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import { CoreProcessManager } from './core-process'
import {
  generateMihomoConfig,
  DEFAULT_RULES,
  insertMissingDirectRules,
  arrangeRuleSections,
  DIRECT_RULE_SETS
} from './config-generator'
import { getControllerSecret } from './controller-secret'
import { scheduleTray } from './tray'
import { setAutoStart, isAutoStartEnabled } from './autostart'
import { SystemProxyManager } from './system-proxy'
import { SubscriptionManager } from './subscription-manager'
import { GeoDataManager } from './geodata-manager'
import { TrafficManager } from './traffic-manager'
import { SystemServiceManager } from './system-service'
import { LinkParser } from './link-parser'
import { LogManager } from './log-manager'
import { installDataDir } from './app-data-dir'
import {
  applyPreviewInstanceIdentity,
  isPreviewInstance,
  previewAppUserModelId,
  previewWindowTitle
} from './preview-mode'
import { endListener, listTcpListeners, killAllowed, type PortOccupant } from './port-occupancy'
import type { AppConfig, ProxyNode, SubscriptionProfile } from '../renderer/src/types'

// Separate Electron identity for preview before the single-instance lock.
applyPreviewInstanceIdentity()

// Long-term running stability: protect proxy state against unexpected crashes
process.on('uncaughtException', (err) => {
  console.error('[App] Uncaught exception:', err)
  try {
    SystemProxyManager.cleanupSync()
  } catch {
    // ignore
  }
})
process.on('unhandledRejection', (reason) => {
  console.error('[App] Unhandled rejection:', reason)
})

let mainWindow: BrowserWindow | null = null
let isAppQuitting = false
const coreManager = new CoreProcessManager()
const trafficManager = new TrafficManager()

const DEFAULT_CONFIG: AppConfig = {
  mixedPort: 7890,
  tunEnabled: false,
  systemProxy: false,
  autoStart: false,
  silentStart: true,
  activeNode: '',
  autoUpdateSub: true,
  autoUpdateGeo: true,
  subscriptions: [],
  manualNodes: [],
  nodes: [],
  rules: DEFAULT_RULES
}

function loadSavedConfig(): AppConfig {
  const configFile = join(installDataDir(), 'user-settings.json')
  try {
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, 'utf-8')
      const parsed = JSON.parse(data)

      const manualNodes: ProxyNode[] = parsed.manualNodes || []
      const regularSubs: SubscriptionProfile[] = []

      // Migration: migrate any manual:// subscriptions or sub-manual nodes into dedicated manualNodes
      for (const s of (parsed.subscriptions || [])) {
        if (s.url && s.url.startsWith('manual://')) {
          const subNodes = SubscriptionManager.loadSubscriptionNodes(s.id)
          for (const n of subNodes) {
            if (!manualNodes.some((m) => m.name === n.name)) {
              manualNodes.push({ ...n, isManual: true, subId: 'manual', subName: '本地手动' })
            }
          }
          SubscriptionManager.deleteSubscriptionStorage(s.id)
        } else {
          regularSubs.push(s)
        }
      }

      if (Array.isArray(parsed.nodes)) {
        for (const n of parsed.nodes) {
          if (n.isManual || (n.subId && n.subId.startsWith('sub-manual')) || n.subName === 'test' || n.subName === '手动导入') {
            if (!manualNodes.some((m) => m.name === n.name)) {
              manualNodes.push({ ...n, isManual: true, subId: 'manual', subName: '本地手动' })
            }
          }
        }
      }

      // Re-aggregate all nodes: manual nodes always preserved first, then subscription nodes
      const subNodes = SubscriptionManager.aggregateNodes(regularSubs)
      const allNodes = [...manualNodes, ...subNodes]

      // Normalize routing rules into custom, reject, then direct.
      let rules = Array.isArray(parsed.rules) && parsed.rules.length > 0 ? [...parsed.rules] : [...DEFAULT_RULES]
      let rulesModified = false

      // Windows NCSI connectivity test domains stay direct. The remote lists do not include them.
      const hasNcsi = rules.some((r) => r.payload.includes('msftconnecttest') || r.payload.includes('msftncsi'))
      if (!hasNcsi) {
        const lanIdx = rules.findIndex((r) => r.id === 'rule-lan' || (r.type === 'IP-CIDR' && r.payload.includes('192.168')))
        const newNcsiRule = {
          id: `rule-ncsi`,
          type: 'DOMAIN-SUFFIX' as const,
          payload: 'msftconnecttest.com, msftncsi.com',
          target: 'DIRECT' as const,
          enabled: true,
          description: 'Windows 网络连通性探测直连 (msftconnecttest / msftncsi)'
        }
        if (lanIdx !== -1) {
          rules.splice(lanIdx + 1, 0, newNcsiRule)
        } else {
          rules.unshift(newNcsiRule)
        }
        rulesModified = true
      }

      // 2. Ensure geosite:cn exists
      const hasCnSite = rules.some((r) => r.type === 'GEOSITE' && r.payload.toLowerCase().split(/[,;\s]/).includes('cn') && r.target === 'DIRECT')
      if (!hasCnSite) {
        const cnIpIdx = rules.findIndex((r) => r.type === 'GEOIP' && r.payload.toUpperCase().includes('CN'))
        const newCnRule = {
          id: `rule-cn-site-${Date.now()}`,
          type: 'GEOSITE' as const,
          payload: 'cn',
          target: 'DIRECT' as const,
          enabled: true,
          description: '中国大陆域名直连 (geosite:cn)'
        }
        if (cnIpIdx !== -1) {
          rules.splice(cnIpIdx, 0, newCnRule)
        } else {
          const matchIdx = rules.findIndex((r) => r.type === 'MATCH')
          if (matchIdx !== -1) {
            rules.splice(matchIdx, 0, newCnRule)
          } else {
            rules.push(newCnRule)
          }
        }
        rulesModified = true
      }

      if (insertMissingDirectRules(rules)) rulesModified = true
      const arranged = arrangeRuleSections(rules)
      if (arranged.changed) {
        rules = arranged.rules
        rulesModified = true
      }

      const hasAntiAd = rules.some(
        (r) => r.type === 'RULE-SET' && r.payload.split(/[,;\n]/).some((p) => p.trim() === 'anti-ad')
      )
      if (!hasAntiAd) {
        const geositeAt = rules.findIndex((r) => r.type === 'GEOSITE' || r.type === 'GEOIP' || r.type === 'MATCH')
        const antiAdRule = {
          id: 'rule-anti-ad',
          type: 'RULE-SET' as const,
          payload: 'anti-ad',
          target: 'REJECT' as const,
          enabled: parsed.dns?.enableAntiAd === true,
          description: 'anti-AD 广告域名。默认关闭，名单由规则库更新。'
        }
        if (geositeAt === -1) rules.push(antiAdRule)
        else rules.splice(geositeAt, 0, antiAdRule)
        rulesModified = true
      } else if (parsed.dns?.enableAntiAd === true) {
        for (const rule of rules) {
          if (rule.type === 'RULE-SET' && rule.payload.split(/[,;\n]/).some((p) => p.trim() === 'anti-ad')) {
            rule.enabled = true
          }
        }
        rulesModified = true
      }
      if (parsed.dns?.enableAntiAd) {
        parsed.dns = { ...parsed.dns, enableAntiAd: false }
        rulesModified = true
      }

      const finalConfig: AppConfig = {
        ...DEFAULT_CONFIG,
        ...parsed,
        manualNodes,
        subscriptions: regularSubs,
        nodes: allNodes,
        rules
      }

      if (rulesModified) {
        saveUserConfig(finalConfig)
      }

      return finalConfig
    }
  } catch (err) {
    console.error('Failed to load user-settings.json:', err)
  }
  return DEFAULT_CONFIG
}

async function buildMihomoYaml(cfg: AppConfig, assumeService?: boolean): Promise<string> {
  let running = false
  if (assumeService !== undefined) {
    running = assumeService
  } else if (process.platform === 'win32') {
    running = (await SystemServiceManager.getServiceStatus()).running
  }
  return generateMihomoConfig(cfg, getControllerSecret(), {
    applyTun: !!cfg.tunEnabled && running
  })
}

function saveUserConfig(config: AppConfig) {
  const configFile = join(installDataDir(), 'user-settings.json')
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8')
}

function listenerPorts(): number[] {
  const port = loadSavedConfig().mixedPort || 7890
  return [port, 9090]
}

function formatOccupants(occupants: PortOccupant[]): string {
  return occupants.map((item) => `端口 ${item.port}：${item.image}，PID ${item.pid}`).join('\n')
}

async function showNotice(options: {
  type: 'none' | 'info' | 'error' | 'question' | 'warning'
  buttons: string[]
  title: string
  message: string
  detail?: string
  defaultId?: number
  cancelId?: number
  noLink?: boolean
}): Promise<number> {
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
  const result = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  return result.response
}

async function resolvePortConflict(initial: PortOccupant[]): Promise<boolean> {
  const occupants = initial.length > 0 ? initial : await listTcpListeners(listenerPorts())
  const serviceRunning =
    process.platform === 'win32' && (await SystemServiceManager.getServiceStatus()).running
  const serviceMihomo = serviceRunning
    ? occupants.filter((item) => item.image.toLowerCase() === 'mihomo.exe')
    : []
  const killable = occupants.filter(
    (item) => killAllowed(item.pid, process.pid) && !serviceMihomo.some((held) => held.pid === item.pid)
  )

  if (occupants.length === 0) {
    await showNotice({
      type: 'warning',
      buttons: ['知道了'],
      title: '端口被占用',
      message: '混合端口或 9090 已被占用，但没有从 netstat 里认出监听进程。',
      detail: '可以在系统服务页查看日志，或稍后重试。'
    })
    return false
  }

  if (killable.length === 0) {
    const serviceNote = serviceMihomo.length
      ? '\n\n其中的 mihomo 由正在运行的系统服务拉起。请在系统服务页停止服务。直接结束会被服务再次启动。'
      : '\n\n没有可以安全结束的进程。'
    await showNotice({
      type: 'warning',
      buttons: ['知道了'],
      title: '端口被占用',
      message: '这些进程占用了内核端口。',
      detail: `${formatOccupants(occupants)}${serviceNote}`
    })
    return false
  }

  const choice = await showNotice({
    type: 'warning',
    buttons: ['结束占用进程并重试', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title: '端口被占用',
    message: '确认后只结束下面列出的 PID，然后重新启动本程序的内核。',
    detail: formatOccupants(killable)
  })
  if (choice !== 0) return false

  for (const item of killable) {
    const ended = await endListener(item.pid, listenerPorts(), process.pid)
    LogManager.pushRaw(`[CoreManager] ${ended.message}`, !ended.ok)
    if (!ended.ok) {
      await showNotice({
        type: 'error',
        buttons: ['知道了'],
        title: '未能结束进程',
        message: ended.message
      })
      return false
    }
  }

  const ok = await coreManager.start()
  if (ok && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('core:recovered')
  }
  return ok
}

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

function getAdaptiveWindowBounds(): WindowState {
  const stateFile = join(installDataDir(), 'window-state.json')
  try {
    if (fs.existsSync(stateFile)) {
      const saved: WindowState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
      if (saved.width && saved.height) {
        const displays = screen.getAllDisplays()
        const isVisibleOnAnyDisplay = displays.some((d) => {
          const b = d.bounds
          if (saved.x === undefined || saved.y === undefined) return true
          return (
            saved.x >= b.x - 40 &&
            saved.x < b.x + b.width &&
            saved.y >= b.y - 40 &&
            saved.y < b.y + b.height
          )
        })

        if (isVisibleOnAnyDisplay) {
          return saved
        }
      }
    }
  } catch {}

  // Adaptive calculation based on user's primary display (1k, 2k, 4k)
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize

  let targetWidth = 1120
  let targetHeight = 760

  if (screenW >= 3400 || screenH >= 2000) {
    // 4K Ultra HD (3840 x 2160)
    targetWidth = 1440
    targetHeight = 920
  } else if (screenW >= 2400 || screenH >= 1350) {
    // 2K QHD (2560 x 1440)
    targetWidth = 1260
    targetHeight = 840
  } else if (screenW >= 1800 || screenH >= 1000) {
    // 1080p FHD (1920 x 1080)
    targetWidth = 1120
    targetHeight = 760
  } else {
    // Laptops or high scale factors (e.g. 1366x768, 1280x720)
    targetWidth = Math.min(1020, screenW - 40)
    targetHeight = Math.min(680, screenH - 40)
  }

  // Safe boundary bounds
  const width = Math.max(900, Math.min(targetWidth, Math.round(screenW * 0.85)))
  const height = Math.max(620, Math.min(targetHeight, Math.round(screenH * 0.88)))

  return { width, height }
}

function saveWindowState(win: BrowserWindow) {
  if (win.isDestroyed()) return
  try {
    const isMaximized = win.isMaximized()
    const bounds = win.getNormalBounds()
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized
    }
    const stateFile = join(installDataDir(), 'window-state.json')
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8')
  } catch {}
}

function createWindow(): void {
  const iconCandidates = [
    join(process.resourcesPath, 'icon.ico'),
    join(process.resourcesPath, 'icon.png'),
    join(app.getAppPath(), 'resources', 'icon.ico'),
    join(app.getAppPath(), 'resources', 'icon.png'),
    join(__dirname, '../../resources/icon.ico'),
    join(__dirname, '../../resources/icon.png')
  ]
  let winIcon: string | undefined = undefined
  for (const p of iconCandidates) {
    if (fs.existsSync(p)) {
      winIcon = p
      break
    }
  }

  const initialBounds = getAdaptiveWindowBounds()

  mainWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: 880,
    minHeight: 620,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    title: previewWindowTitle(),
    backgroundColor: '#04070c',
    autoHideMenuBar: true,
    icon: winIcon,
    webPreferences: {
      preload: fs.existsSync(join(__dirname, '../preload/index.mjs'))
        ? join(__dirname, '../preload/index.mjs')
        : join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (initialBounds.isMaximized) {
    mainWindow.maximize()
  }

  let saveTimer: NodeJS.Timeout | null = null
  const debouncedSaveState = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        saveWindowState(mainWindow)
      }
    }, 400)
  }

  mainWindow.on('resize', debouncedSaveState)
  mainWindow.on('move', debouncedSaveState)

  mainWindow.on('ready-to-show', () => {
    const isSilent = process.argv.includes('--silent')
    if (!isSilent) {
      mainWindow?.show()
    }
  })

  mainWindow.on('close', (event) => {
    if (!isAppQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--silent')) return
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
      mainWindow.setAlwaysOnTop(true)
      mainWindow.setAlwaysOnTop(false)
    }
  })

  electronApp.setAppUserModelId(previewAppUserModelId())
  if (isPreviewInstance()) {
    console.log('[App] Preview instance — separate userData/AUMID; can run beside an installed build.')
  }

  app.whenReady().then(async () => {

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    const initialConfig = loadSavedConfig()
    GeoDataManager.ensureDefaultGeoData()

    let hasNotifiedAbnormalDesktop = false

    async function handleCoreAbnormal(reason: string, notifyDesktop = false, occupants?: PortOccupant[]) {
      const cfg = loadSavedConfig()
      const systemProxyActive = !!cfg.systemProxy

      // User preference: Do NOT automatically disable system proxy in the background ("不要直接关来关去的")
      // Instead, present a prominent banner on the main interface with manual actions.
      const alertMsg = systemProxyActive
        ? `⚠️ 警告：内核异常 (${reason})。当前 Windows 系统代理处于开启状态，如网络受阻可手动关闭系统代理。`
        : `⚠️ 警告：内核异常 (${reason})。内核当前处于未运行状态。`
      LogManager.pushRaw(alertMsg, true)

      // Only fire OS desktop notification ONCE when core becomes abnormal to prevent notification spam
      if (notifyDesktop && !hasNotifiedAbnormalDesktop) {
        hasNotifiedAbnormalDesktop = true
        try {
          if (Notification.isSupported()) {
            new Notification({
              title: 'draft-one 核心状态提示',
              body: alertMsg
            }).show()
          }
        } catch {}
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('core:abnormal-alert', {
          reason,
          systemProxyActive,
          autoDisabledProxy: false,
          message: alertMsg,
          occupants: occupants ?? [],
          timestamp: Date.now()
        })
      }
    }

    coreManager.setListenerPorts(listenerPorts)
    coreManager.setOnAbnormal((reason, occupants) => {
      void (async () => {
        if (reason.includes('端口冲突')) {
          const ended = await resolvePortConflict(occupants ?? [])
          if (ended) return
        }
        await handleCoreAbnormal(reason, true, occupants)
      })()
    })

    const yaml = await buildMihomoYaml(initialConfig)
    coreManager.writeConfigFile(yaml)
    await coreManager.start()

    createWindow()
    if (mainWindow) {
      scheduleTray(mainWindow)
      LogManager.setWindow(mainWindow)
    }

    setTimeout(() => {
      LogManager.start()
      SystemServiceManager.retireNonInteractiveTask().catch(() => {})
      trafficManager.startBackgroundPolling(1000)
    }, 1500)

    // Periodic Core Health Check & Proxy Outage Guard (every 10 seconds)
    setInterval(async () => {
      const status = coreManager.getStatus()
      if (status.running) {
        const ok = await coreManager.healthCheck()
        if (ok) {
          hasNotifiedAbnormalDesktop = false
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('core:recovered')
          }
        }
      } else {
        const cfg = loadSavedConfig()
        if (cfg.systemProxy) {
          handleCoreAbnormal('内核未处于运行状态', false)
        }
      }
    }, 10000)

    // Windows powerMonitor: auto-heal core upon wake from sleep / hibernation
    powerMonitor.on('resume', async () => {
      console.log('[PowerMonitor] Windows resumed from sleep/hibernation. Verifying core...')
      await coreManager.healthCheck()
    })

    // Register IPC Handlers
    ipcMain.handle('app:get-version', () => {
      return app.getVersion()
    })

    ipcMain.handle('app:is-preview', () => {
      return isPreviewInstance()
    })

    ipcMain.handle('app:get-config', () => {
      const cfg = loadSavedConfig()
      cfg.autoStart = isAutoStartEnabled()
      return cfg
    })

    ipcMain.handle('app:save-config', async (_, newConfig: AppConfig) => {
      saveUserConfig(newConfig)
      const newYaml = await buildMihomoYaml(newConfig)
      coreManager.writeConfigFile(newYaml)
      await coreManager.reloadConfig()
      return true
    })

    ipcMain.handle('core:reload', async () => {
      return await coreManager.reloadConfig()
    })

    ipcMain.handle('core:get-status', () => {
      return coreManager.getStatus()
    })

    ipcMain.handle('core:resolve-port-conflict', async () => {
      const occupants = await listTcpListeners(listenerPorts())
      const ok = await resolvePortConflict(occupants)
      return {
        success: ok,
        message: ok ? '已结束占用进程并重新启动内核。' : '未结束占用进程。'
      }
    })

    ipcMain.handle('core:restart', async () => {
      coreManager.stop()
      const ok = await coreManager.start()
      if (ok && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('core:recovered')
      }
      return ok
    })

    ipcMain.handle('core:kill-all', async (_, restart: boolean) => {
      const result = await coreManager.killAllMihomo()
      const cfg = loadSavedConfig()
      let message = result.message
      if (cfg.systemProxy) {
        cfg.systemProxy = false
        saveUserConfig(cfg)
        await SystemProxyManager.disable()
        message += ' 系统代理已关闭。'
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:config-updated', cfg)
        }
      }
      if (!restart) return { success: result.success, message }
      const ok = await coreManager.start()
      if (ok && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('core:recovered')
      }
      return {
        success: result.success && ok,
        message: ok ? `${message} 本程序的内核已重新启动。` : `${message} 重新启动内核失败，请查看日志。`
      }
    })

    // System Proxy & Anti-Disconnect
    ipcMain.handle('sys:set-proxy', async (_, enable: boolean) => {
      const cfg = loadSavedConfig()
      if (enable) {
        const status = coreManager.getStatus()
        if (!status.running) {
          const msg = '内核未运行，无法启用系统代理！请先检查内核状态或日志。'
          LogManager.pushRaw(`[SystemProxy] ${msg}`, true)
          return { success: false, error: msg }
        }
      }
      cfg.systemProxy = enable
      saveUserConfig(cfg)
      if (enable) {
        const ok = await SystemProxyManager.enable(cfg.mixedPort || 7890)
        return { success: ok }
      } else {
        const ok = await SystemProxyManager.disable()
        return { success: ok }
      }
    })

    // Quick Shortcut: Open Windows System Proxy Settings
    ipcMain.handle('sys:open-proxy-settings', async () => {
      try {
        if (process.platform === 'win32') {
          await shell.openExternal('ms-settings:network-proxy')
          return { success: true }
        }
        return { success: false, error: '仅支持 Windows 系统环境' }
      } catch (err: unknown) {
        try {
          exec('control inetcpl.cpl,,4')
          return { success: true }
        } catch {
          const msg = err instanceof Error ? err.message : String(err)
          return { success: false, error: msg }
        }
      }
    })

    ipcMain.handle('sys:set-autostart', (_, enable: boolean) => {
      setAutoStart(enable)
      return true
    })

    ipcMain.handle('sys:get-autostart', async () => {
      const standard = isAutoStartEnabled()
      const task = await SystemServiceManager.getTaskStatus()
      const service = await SystemServiceManager.getServiceStatus()
      return {
        standard,
        highPriorityTask: task.exists,
        systemService: service.installed && service.running,
        active: standard || task.exists || (service.installed && service.running)
      }
    })

    // Subscriptions & Node Import Management
    ipcMain.handle(
      'sub:import-links',
      async (_, { content, name }: { content: string; name?: string }) => {
        try {
          const subId = 'manual'
          const finalName = name?.trim() || '本地手动'
          const nodes = LinkParser.parseLinks(content, subId, finalName)

          if (nodes.length === 0) {
            return {
              success: false,
              error: '未能解析出有效的节点链接 (支持 vmess://, vless://, ss://, trojan://, hysteria2://, hy2://)'
            }
          }

          const cfg = loadSavedConfig()
          cfg.manualNodes = cfg.manualNodes || []

          for (const node of nodes) {
            node.isManual = true
            node.subId = 'manual'
            node.subName = '本地手动'
            const existIdx = cfg.manualNodes.findIndex((m) => m.name === node.name)
            if (existIdx !== -1) {
              cfg.manualNodes[existIdx] = node
            } else {
              cfg.manualNodes.push(node)
            }
          }

          cfg.nodes = [...cfg.manualNodes, ...SubscriptionManager.aggregateNodes(cfg.subscriptions)]
          if ((!cfg.activeNode || !cfg.nodes.some((n) => n.name === cfg.activeNode)) && cfg.nodes.length > 0) {
            cfg.activeNode = cfg.nodes[0].name
          }

          saveUserConfig(cfg)
          const newYaml = await buildMihomoYaml(cfg)
          coreManager.writeConfigFile(newYaml)
          await coreManager.reloadConfig()

          return { success: true, count: nodes.length }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          return { success: false, error: msg }
        }
      }
    )

    ipcMain.handle(
      'sub:add',
      async (_, { url, name }: { url: string; name: string }) => {
        try {
          const cfg = loadSavedConfig()
          const { profile, nodes } = await SubscriptionManager.fetchSubscription(
            url,
            name,
            undefined,
            cfg.mixedPort
          )

          // Add or replace subscription
          const filteredSubs = cfg.subscriptions.filter((s) => s.url !== url)
          filteredSubs.push(profile)
          cfg.subscriptions = filteredSubs

          // Multi-subscription aggregation: preserve manual nodes and merge all enabled subscriptions
          cfg.nodes = [...(cfg.manualNodes || []), ...SubscriptionManager.aggregateNodes(cfg.subscriptions)]
          if ((!cfg.activeNode || !cfg.nodes.some((n) => n.name === cfg.activeNode)) && cfg.nodes.length > 0) {
            cfg.activeNode = cfg.nodes[0].name
          }

          saveUserConfig(cfg)
          const newYaml = await buildMihomoYaml(cfg)
          coreManager.writeConfigFile(newYaml)
          await coreManager.reloadConfig()

          return { success: true, count: nodes.length, profile }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          return { success: false, error: msg }
        }
      }
    )

    ipcMain.handle('sub:update', async (_, id: string) => {
      try {
        const cfg = loadSavedConfig()
        const target = cfg.subscriptions.find((s) => s.id === id)
        if (!target) return { success: false, error: '未找到指定订阅' }

        const { profile } = await SubscriptionManager.fetchSubscription(
          target.url,
          target.name,
          target.id,
          cfg.mixedPort
        )
        target.updatedAt = profile.updatedAt
        target.nodeCount = profile.nodeCount
        target.userInfo = profile.userInfo

        cfg.nodes = [...(cfg.manualNodes || []), ...SubscriptionManager.aggregateNodes(cfg.subscriptions)]
        if (cfg.nodes.length > 0 && (!cfg.activeNode || !cfg.nodes.some((n) => n.name === cfg.activeNode))) {
          cfg.activeNode = cfg.nodes[0].name
        }

        saveUserConfig(cfg)
        const newYaml = await buildMihomoYaml(cfg)
        coreManager.writeConfigFile(newYaml)
        await coreManager.reloadConfig()

        return { success: true, count: profile.nodeCount }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { success: false, error: msg }
      }
    })

    ipcMain.handle('sub:update-all', async () => {
      try {
        const cfg = loadSavedConfig()
        let updatedCount = 0
        const errors: string[] = []

        for (const sub of cfg.subscriptions) {
          if (!sub.enabled) continue
          if (sub.url.startsWith('manual://')) continue
          try {
            const { profile } = await SubscriptionManager.fetchSubscription(
              sub.url,
              sub.name,
              sub.id,
              cfg.mixedPort
            )
            sub.updatedAt = profile.updatedAt
            sub.nodeCount = profile.nodeCount
            sub.userInfo = profile.userInfo
            updatedCount++
          } catch (err: unknown) {
            errors.push(`${sub.name}: ${err instanceof Error ? err.message : String(err)}`)
          }
        }

        cfg.nodes = [...(cfg.manualNodes || []), ...SubscriptionManager.aggregateNodes(cfg.subscriptions)]
        if (cfg.nodes.length > 0 && (!cfg.activeNode || !cfg.nodes.some((n) => n.name === cfg.activeNode))) {
          cfg.activeNode = cfg.nodes[0].name
        }

        saveUserConfig(cfg)
        const newYaml = await buildMihomoYaml(cfg)
        coreManager.writeConfigFile(newYaml)
        await coreManager.reloadConfig()

        return { success: true, updatedCount, errors }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { success: false, error: msg }
      }
    })

    ipcMain.handle('sub:toggle', async (_, { id, enabled }: { id: string; enabled: boolean }) => {
      const cfg = loadSavedConfig()
      const target = cfg.subscriptions.find((s) => s.id === id)
      if (target) {
        target.enabled = enabled
        cfg.nodes = [...(cfg.manualNodes || []), ...SubscriptionManager.aggregateNodes(cfg.subscriptions)]
        if (cfg.nodes.length > 0 && (!cfg.activeNode || !cfg.nodes.some((n) => n.name === cfg.activeNode))) {
          cfg.activeNode = cfg.nodes[0].name
        }
        saveUserConfig(cfg)
        const newYaml = await buildMihomoYaml(cfg)
        coreManager.writeConfigFile(newYaml)
        await coreManager.reloadConfig()
      }
      return { success: true }
    })

    ipcMain.handle(
      'sub:edit',
      async (_, { id, name, url }: { id: string; name: string; url: string }) => {
        const cfg = loadSavedConfig()
        const target = cfg.subscriptions.find((s) => s.id === id)
        if (target) {
          target.name = name || target.name
          target.url = url || target.url
          cfg.nodes = [...(cfg.manualNodes || []), ...SubscriptionManager.aggregateNodes(cfg.subscriptions)]
          saveUserConfig(cfg)
        }
        return { success: true }
      }
    )

    ipcMain.handle('sub:delete', async (_, id: string) => {
      const cfg = loadSavedConfig()
      SubscriptionManager.deleteSubscriptionStorage(id)
      cfg.subscriptions = cfg.subscriptions.filter((s) => s.id !== id)
      cfg.nodes = [...(cfg.manualNodes || []), ...SubscriptionManager.aggregateNodes(cfg.subscriptions)]
      if (cfg.nodes.length > 0) {
        if (!cfg.activeNode || !cfg.nodes.some((n) => n.name === cfg.activeNode)) {
          cfg.activeNode = cfg.nodes[0].name
        }
      } else {
        cfg.activeNode = ''
      }
      saveUserConfig(cfg)
      const newYaml = await buildMihomoYaml(cfg)
      coreManager.writeConfigFile(newYaml)
      await coreManager.reloadConfig()
      return { success: true }
    })

    // Node operations
    ipcMain.handle('node:select', async (_, nodeName: string) => {
      const cfg = loadSavedConfig()
      cfg.activeNode = nodeName
      saveUserConfig(cfg)
      // Instant hot switch via REST API
      await coreManager.selectProxyNode('PROXY', nodeName)
      return true
    })

    ipcMain.handle('node:test-delay', async (_, nodeName: string) => {
      const delay = await coreManager.testNodeDelay(nodeName)
      const testedAt = Date.now()
      const cfg = loadSavedConfig()
      cfg.nodeDelays = { ...(cfg.nodeDelays || {}), [nodeName]: { delay, testedAt } }
      saveUserConfig(cfg)
      return { delay, testedAt }
    })

    ipcMain.handle('node:test-all', async () => {
      const cfg = loadSavedConfig()
      const results: Record<string, number> = {}

      // Test with concurrency batch of 5
      const nodes = cfg.nodes || []
      const batchSize = 5
      for (let i = 0; i < nodes.length; i += batchSize) {
        const batch = nodes.slice(i, i + batchSize)
        await Promise.all(
          batch.map(async (n: ProxyNode) => {
            const delay = await coreManager.testNodeDelay(n.name)
            results[n.name] = delay
          })
        )
      }
      const testedAt = Date.now()
      const saved = { ...(cfg.nodeDelays || {}) }
      for (const [name, delay] of Object.entries(results)) {
        saved[name] = { delay, testedAt }
      }
      cfg.nodeDelays = saved
      saveUserConfig(cfg)
      return { results, testedAt }
    })

    ipcMain.handle(
      'node:edit',
      async (_, { oldName, updatedNode }: { oldName: string; updatedNode: ProxyNode }) => {
        const cfg = loadSavedConfig()
        cfg.manualNodes = cfg.manualNodes || []

        // 1. If it's a manual node or in manualNodes
        const manualIdx = cfg.manualNodes.findIndex((m) => m.name === oldName || m.id === updatedNode.id)
        if (manualIdx !== -1) {
          cfg.manualNodes[manualIdx] = {
            ...cfg.manualNodes[manualIdx],
            ...updatedNode,
            isManual: true,
            subId: 'manual',
            subName: '本地手动'
          }
        } else if (updatedNode.isManual) {
          cfg.manualNodes.push({
            ...updatedNode,
            isManual: true,
            subId: 'manual',
            subName: '本地手动'
          })
        } else if (updatedNode.subId && updatedNode.subId !== 'manual') {
          // 2. If it belongs to a subscription
          const subNodes = SubscriptionManager.loadSubscriptionNodes(updatedNode.subId)
          const subIdx = subNodes.findIndex((n) => n.name === oldName || n.id === updatedNode.id)
          if (subIdx !== -1) {
            subNodes[subIdx] = { ...subNodes[subIdx], ...updatedNode }
            SubscriptionManager.saveSubscriptionNodes(updatedNode.subId, subNodes)
          }
        }

        // Re-aggregate all nodes
        cfg.nodes = [...cfg.manualNodes, ...SubscriptionManager.aggregateNodes(cfg.subscriptions)]
        if (cfg.activeNode === oldName) {
          cfg.activeNode = updatedNode.name
        }

        saveUserConfig(cfg)
        const newYaml = await buildMihomoYaml(cfg)
        coreManager.writeConfigFile(newYaml)
        await coreManager.reloadConfig()
        return { success: true }
      }
    )

    ipcMain.handle('node:add', async (_, node: ProxyNode) => {
      try {
        const cfg = loadSavedConfig()
        cfg.manualNodes = cfg.manualNodes || []
        const newNode: ProxyNode = {
          ...node,
          id: `manual-${Date.now()}`,
          isManual: true,
          subId: 'manual',
          subName: '本地手动'
        }
        cfg.manualNodes.push(newNode)
        cfg.nodes = [...cfg.manualNodes, ...SubscriptionManager.aggregateNodes(cfg.subscriptions)]
        if ((!cfg.activeNode || cfg.nodes.length === 1) && cfg.nodes.length > 0) {
          cfg.activeNode = newNode.name
        }
        saveUserConfig(cfg)
        const newYaml = await buildMihomoYaml(cfg)
        coreManager.writeConfigFile(newYaml)
        await coreManager.reloadConfig()
        return { success: true, node: newNode }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { success: false, error: msg }
      }
    })

    ipcMain.handle('node:delete', async (_, nodeName: string) => {
      try {
        const cfg = loadSavedConfig()
        // 1. Remove from manual nodes if present
        if (cfg.manualNodes) {
          cfg.manualNodes = cfg.manualNodes.filter((m) => m.name !== nodeName)
        }
        // 2. Check if in any subscription storage and remove
        for (const sub of cfg.subscriptions) {
          const subNodes = SubscriptionManager.loadSubscriptionNodes(sub.id)
          const filtered = subNodes.filter((n) => n.name !== nodeName)
          if (filtered.length !== subNodes.length) {
            SubscriptionManager.saveSubscriptionNodes(sub.id, filtered)
            sub.nodeCount = filtered.length
          }
        }

        // Re-aggregate
        cfg.nodes = [...(cfg.manualNodes || []), ...SubscriptionManager.aggregateNodes(cfg.subscriptions)]
        if (cfg.activeNode === nodeName) {
          cfg.activeNode = cfg.nodes[0]?.name || ''
        }

        saveUserConfig(cfg)
        const newYaml = await buildMihomoYaml(cfg)
        coreManager.writeConfigFile(newYaml)
        await coreManager.reloadConfig()
        return { success: true }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        return { success: false, error: msg }
      }
    })

    // Log Management
    ipcMain.handle('log:get-history', () => {
      return LogManager.getLogs()
    })

    ipcMain.handle('log:clear', () => {
      LogManager.clearLogs()
      return true
    })

    // GeoData Update & Status
    ipcMain.handle('geo:get-status', () => {
      return GeoDataManager.getStatus()
    })

    ipcMain.handle('geo:update', async () => {
      const cfg = loadSavedConfig()
      const result = await GeoDataManager.updateRules(cfg.mixedPort)
      if (result.success) {
        await coreManager.refreshRuleProviders([
          'anti-ad',
          ...DIRECT_RULE_SETS.map((preset) => preset.name)
        ])
      }
      return result
    })

    // Traffic Analytics
    ipcMain.handle('traffic:get-summary', async () => {
      return await trafficManager.fetchStats()
    })

    ipcMain.handle('traffic:reset', async () => {
      await trafficManager.resetStats()
      return true
    })

    // Connections Management (Verge-style)
    ipcMain.handle('connections:get-snapshot', async () => {
      return await trafficManager.getConnectionsSnapshot()
    })

    ipcMain.handle('connections:close', async (_, id: string) => {
      return await trafficManager.closeConnection(id)
    })

    ipcMain.handle('connections:close-all', async () => {
      return await trafficManager.closeAllConnections()
    })

    // Windows System Service Mode
    ipcMain.handle('service:get-status', async () => {
      return await SystemServiceManager.getServiceStatus()
    })
    ipcMain.handle('service:install', async () => {
      const cfg = loadSavedConfig()
      coreManager.writeConfigFile(await buildMihomoYaml(cfg, true))
      return await SystemServiceManager.installService()
    })
    ipcMain.handle('service:uninstall', async () => {
      return await SystemServiceManager.uninstallService()
    })
    ipcMain.handle('service:start', async () => {
      const cfg = loadSavedConfig()
      coreManager.writeConfigFile(await buildMihomoYaml(cfg, true))
      return await SystemServiceManager.startService()
    })
    ipcMain.handle('service:stop', async () => {
      const result = await SystemServiceManager.stopService()
      const cfg = loadSavedConfig()
      coreManager.writeConfigFile(await buildMihomoYaml(cfg, false))
      await coreManager.reloadConfig()
      return result
    })
    ipcMain.handle('service:get-logs', async () => {
      return await SystemServiceManager.getServiceLogs()
    })

    // High-Priority Task Scheduler
    ipcMain.handle('task:get-status', async () => {
      return await SystemServiceManager.getTaskStatus()
    })
    ipcMain.handle('task:install', async () => {
      return await SystemServiceManager.installTask()
    })
    ipcMain.handle('task:uninstall', async () => {
      return await SystemServiceManager.uninstallTask()
    })
    ipcMain.handle('task:open-scheduler', async () => {
      if (process.platform !== 'win32') {
        return { success: false, message: '当前不是 Windows，没有任务计划程序。' }
      }
      const msc = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskschd.msc')
      const error = await shell.openPath(msc)
      if (error) return { success: false, message: `无法打开任务计划程序: ${error}` }
      return { success: true, message: '已打开任务计划程序。任务名是 DraftOne_AutoStart。' }
    })

    // Network & Driver Utilities
    ipcMain.handle('util:flush-dns', async () => {
      return await SystemServiceManager.flushDns()
    })
    ipcMain.handle('util:reset-winsock', async () => {
      return await SystemServiceManager.resetWinsock()
    })
    ipcMain.handle('util:fix-firewall', async () => {
      return await SystemServiceManager.fixFirewall()
    })
    ipcMain.handle('util:fix-wintun', async () => {
      return await SystemServiceManager.fixWintun()
    })
    ipcMain.handle('util:allow-uwp-loopback', async () => {
      return await SystemServiceManager.allowUwpLoopback()
    })

    // Window controls
    ipcMain.on('window:minimize', () => {
      mainWindow?.minimize()
    })

    ipcMain.on('window:maximize', () => {
      if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow?.maximize()
      }
    })

    ipcMain.on('window:close', () => {
      mainWindow?.hide()
    })

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  // Safe exit & Anti-disconnect
  const cleanExit = () => {
    isAppQuitting = true
    try {
      trafficManager.stopBackgroundPolling()
      SystemProxyManager.cleanupSync()
      coreManager.stop()
    } catch (e) {
      console.error('Error during cleanup:', e)
    }
  }

  app.on('before-quit', cleanExit)
  app.on('will-quit', cleanExit)
  process.on('exit', cleanExit)
  process.on('SIGINT', cleanExit)
  process.on('SIGTERM', cleanExit)

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // Keep alive in tray on Windows
    }
  })
}
