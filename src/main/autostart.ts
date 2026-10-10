import { app } from 'electron'
import { exec } from 'child_process'

export function setAutoStart(enable: boolean) {
  const appPath = process.execPath
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: true,
    path: appPath,
    args: ['--silent']
  })

  // Direct Windows Registry dual-insurance for 100% startup reliability
  if (process.platform === 'win32') {
    try {
      if (enable) {
        exec(
          `reg.exe add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "draft-one" /t REG_SZ /d "\\"${appPath}\\" --silent" /f`
        )
      } else {
        exec(`reg.exe delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "draft-one" /f`)
      }
    } catch {}
  }
}

export function isAutoStartEnabled(): boolean {
  return app.getLoginItemSettings().openAtLogin
}

