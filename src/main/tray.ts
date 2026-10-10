import { Tray, Menu, nativeImage, NativeImage, BrowserWindow, app } from 'electron'
import path from 'path'
import fs from 'fs'

let tray: Tray | null = null
let trayWindow: BrowserWindow | null = null

const TRAY_GUID = '8f3c2a1e-6b47-4d5a-9c31-0a1b2c3d4e5f'

// Embedded 16x16 / 32x32 draft-one fallback icon (PNG base64) ensuring tray icon NEVER fails to render
const FALLBACK_ICON_BASE64 =
  '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'

function loadTrayIcon(): NativeImage {
  const candidatePaths = [
    path.join(process.resourcesPath, 'icon.ico'),
    path.join(process.resourcesPath, 'icon.png'),
    path.join(path.dirname(process.execPath), 'resources', 'icon.ico'),
    path.join(path.dirname(process.execPath), 'resources', 'icon.png'),
    path.join(path.dirname(process.execPath), 'icon.ico'),
    path.join(path.dirname(process.execPath), 'icon.png'),
    path.join(app.getAppPath(), 'resources', 'icon.ico'),
    path.join(app.getAppPath(), 'resources', 'icon.png'),
    path.join(__dirname, '../../resources/icon.ico'),
    path.join(__dirname, '../../resources/icon.png')
  ]

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const img = nativeImage.createFromPath(p)
        if (!img.isEmpty()) {
          return img
        }
        const buf = fs.readFileSync(p)
        const imgFromBuf = nativeImage.createFromBuffer(buf)
        if (!imgFromBuf.isEmpty()) {
          return imgFromBuf
        }
      }
    } catch {
      // try next
    }
  }

  try {
    return nativeImage.createFromDataURL(`data:image/png;base64,${FALLBACK_ICON_BASE64}`)
  } catch {
    return nativeImage.createEmpty()
  }
}

function buildTray(mainWindow: BrowserWindow): Tray {
  const icon = loadTrayIcon()
  const created = new Tray(icon, TRAY_GUID)
  created.setToolTip('draft-one - 现代化代理客户端')

  const showWindow = () => {
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) {
      mainWindow.show()
    }
    mainWindow.focus()
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主界面',
      click: () => {
        showWindow()
      }
    },
    { type: 'separator' },
    {
      label: '直连模式',
      type: 'radio',
      checked: false,
      click: () => {
        mainWindow.webContents.send('tray:change-mode', 'direct')
      }
    },
    {
      label: '规则路由模式',
      type: 'radio',
      checked: true,
      click: () => {
        mainWindow.webContents.send('tray:change-mode', 'rule')
      }
    },
    {
      label: '全局代理模式',
      type: 'radio',
      checked: false,
      click: () => {
        mainWindow.webContents.send('tray:change-mode', 'global')
      }
    },
    { type: 'separator' },
    {
      label: '退出 draft-one',
      click: () => {
        app.quit()
      }
    }
  ])

  created.setContextMenu(contextMenu)

  created.on('click', () => {
    showWindow()
  })

  created.on('double-click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      showWindow()
    }
  })

  return created
}

export function createTray(mainWindow: BrowserWindow): Tray | null {
  trayWindow = mainWindow
  if (mainWindow.isDestroyed()) return tray
  if (tray && !tray.isDestroyed()) return tray
  try {
    tray = buildTray(mainWindow)
    return tray
  } catch (err) {
    console.error('[Tray] Failed to create tray icon:', err)
    tray = null
    return null
  }
}

/**
 * Explorer often starts after a logon-time process. A tray created too early
 * is dropped when the notification area is rebuilt. Recreate a few times.
 */
export function scheduleTray(mainWindow: BrowserWindow): void {
  trayWindow = mainWindow
  const delays = [0, 1500, 5000, 15000]
  for (const delay of delays) {
    setTimeout(() => {
      if (!trayWindow || trayWindow.isDestroyed()) return
      if (tray && !tray.isDestroyed()) return
      createTray(trayWindow)
    }, delay)
  }
}
