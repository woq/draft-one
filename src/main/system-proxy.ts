import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { installDataDir } from './app-data-dir'
import { decodeWin } from './win-text'
import {
  PROXY_BYPASS,
  ProxySnapshot,
  backupForEnable,
  dwordFromReg,
  ourProxyServer,
  parseRegQuery,
  regAddDwordArgs,
  regAddStringArgs,
  regDeleteValueArgs,
  regQueryArgs
} from './system-proxy-state'

const BACKUP_NAME = 'system-proxy-backup.json'

function backupFile(): string {
  return path.join(installDataDir(), BACKUP_NAME)
}

function notifyScript(): string {
  const rel = path.join('windows', 'notify-internet-settings.ps1')
  return app.isPackaged
    ? path.join(process.resourcesPath, rel)
    : path.join(app.getAppPath(), 'resources', rel)
}

function runReg(args: string[]): { code: number; text: string } {
  try {
    const stdout = execFileSync('reg.exe', args, { windowsHide: true, encoding: 'buffer' })
    return { code: 0, text: decodeWin(stdout).trim() }
  } catch (error) {
    const err = error as { status?: number; stdout?: Buffer; stderr?: Buffer }
    const text = [decodeWin(err.stdout || Buffer.alloc(0)), decodeWin(err.stderr || Buffer.alloc(0))]
      .filter(Boolean)
      .join('\n')
      .trim()
    return { code: typeof err.status === 'number' ? err.status : 1, text }
  }
}

function notifySettings(): void {
  const script = notifyScript()
  if (!fs.existsSync(script)) return
  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true }
    )
  } catch (error) {
    console.error('[SystemProxy] WinINet notify failed:', error)
  }
}

function readValue(name: string): string | null {
  const queried = runReg(regQueryArgs(name))
  if (queried.code !== 0) return null
  return parseRegQuery(queried.text)?.data ?? null
}

function readSnapshot(): ProxySnapshot {
  const enableRaw = readValue('ProxyEnable')
  return {
    proxyEnable: enableRaw == null ? 0 : dwordFromReg(enableRaw),
    proxyServer: readValue('ProxyServer'),
    proxyOverride: readValue('ProxyOverride'),
    autoConfigUrl: readValue('AutoConfigURL')
  }
}

function readBackup(): ProxySnapshot | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(backupFile(), 'utf-8')) as ProxySnapshot
    if (typeof parsed?.proxyEnable !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writeBackup(snapshot: ProxySnapshot): void {
  fs.writeFileSync(backupFile(), JSON.stringify(snapshot))
}

function clearBackup(): void {
  fs.rmSync(backupFile(), { force: true })
}

function writeStringOrDelete(name: string, value: string | null): boolean {
  const result = value == null ? runReg(regDeleteValueArgs(name)) : runReg(regAddStringArgs(name, value))
  if (value == null && result.code !== 0) return true
  return result.code === 0
}

function applySnapshot(snapshot: ProxySnapshot): boolean {
  const enable = runReg(regAddDwordArgs('ProxyEnable', snapshot.proxyEnable))
  const server = writeStringOrDelete('ProxyServer', snapshot.proxyServer)
  const bypass = writeStringOrDelete('ProxyOverride', snapshot.proxyOverride)
  const pac = writeStringOrDelete('AutoConfigURL', snapshot.autoConfigUrl)
  const ok = enable.code === 0 && server && bypass && pac
  if (ok) notifySettings()
  return ok
}

function enableOurs(port: number): boolean {
  const enable = runReg(regAddDwordArgs('ProxyEnable', 1))
  const server = runReg(regAddStringArgs('ProxyServer', ourProxyServer(port)))
  const bypass = runReg(regAddStringArgs('ProxyOverride', PROXY_BYPASS))
  const pac = runReg(regDeleteValueArgs('AutoConfigURL'))
  const pacOk = pac.code === 0 || /unable to find|找不到|不存在/i.test(pac.text)
  const ok = enable.code === 0 && server.code === 0 && bypass.code === 0 && pacOk
  if (ok) notifySettings()
  return ok
}

export class SystemProxyManager {
  public static async enable(port = 7890): Promise<boolean> {
    if (process.platform !== 'win32') return false
    try {
      if (!readBackup()) writeBackup(backupForEnable(readSnapshot(), port))
      const ok = enableOurs(port)
      if (!ok) this.restoreSaved()
      return ok
    } catch (error) {
      console.error('[SystemProxy] Failed to enable system proxy:', error)
      return false
    }
  }

  public static async disable(): Promise<boolean> {
    if (process.platform !== 'win32') return false
    return this.restoreSaved()
  }

  public static cleanupSync(): void {
    if (process.platform !== 'win32') return
    try {
      this.restoreSaved()
    } catch (error) {
      console.error('[SystemProxy] Error restoring proxy on exit:', error)
    }
  }

  private static restoreSaved(): boolean {
    const saved = readBackup()
    let ok = false
    if (saved) {
      ok = applySnapshot(saved)
    } else {
      ok = runReg(regAddDwordArgs('ProxyEnable', 0)).code === 0
      if (ok) notifySettings()
    }
    if (ok) clearBackup()
    return ok
  }
}
