import { execFile } from 'child_process'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { installDataDir } from './app-data-dir'
import { buildLogonTaskXml } from './logon-task-xml'
import { decodeWin } from './win-text'
import { SystemProxyManager } from './system-proxy'
import { CORE_HASH_FILE, coreBesideService, formatHashFile, hashFileHex } from './service-core'
import { firewallDeleteArgs, firewallRuleArgs, scCreateArgs } from './system-proxy-state'

export interface ServiceStatus {
  installed: boolean
  running: boolean
  statusText: string
}

export interface TaskStatus {
  exists: boolean
  taskName: string
}

export class SystemServiceManager {
  private static SERVICE_NAME = 'DraftOneService'
  private static TASK_NAME = 'DraftOne_AutoStart'

  /**
   * Smartly decodes Windows console output buffer, auto-detecting UTF-8 vs CP936 (GBK)
   * to eliminate any possible mojibake / 乱码.
   */
  static decodeWin(buf: Buffer): string {
    return decodeWin(buf)
  }

  private static windowsScript(name: string): string {
    const rel = path.join('windows', name)
    return app.isPackaged
      ? path.join(process.resourcesPath, rel)
      : path.join(app.getAppPath(), 'resources', rel)
  }

  private static powershellFile(
    script: string,
    args: string[] = [],
    interactive = false
  ): Promise<{ code: number; text: string }> {
    const argv = ['-NoProfile', '-ExecutionPolicy', 'Bypass']
    if (!interactive) argv.push('-NonInteractive')
    argv.push('-File', script, ...args)
    return execFileText('powershell.exe', argv, interactive ? 180000 : 120000)
  }

  private static serviceBinaryCandidates(): string[] {
    const isDev = !app.isPackaged
    return isDev
      ? [
          path.join(app.getAppPath(), 'resources', 'binaries', 'DraftOneService.exe'),
          path.join(app.getAppPath(), 'DraftOneService.exe')
        ]
      : [
          path.join(process.resourcesPath, 'binaries', 'DraftOneService.exe'),
          path.join(process.resourcesPath, 'DraftOneService.exe'),
          path.join(path.dirname(process.execPath), 'binaries', 'DraftOneService.exe'),
          path.join(app.getAppPath(), 'resources', 'binaries', 'DraftOneService.exe')
        ]
  }

  private static getCoreBinaryPath(): string {
    for (const serviceExe of this.serviceBinaryCandidates()) {
      if (!fs.existsSync(serviceExe)) continue
      const core = coreBesideService(serviceExe)
      if (fs.existsSync(core)) return core
    }
    return path.join(app.getAppPath(), 'resources', 'binaries', 'mihomo.exe')
  }

  /**
   * Locate or compile DraftOneService.exe Win32 Service wrapper binary.
   */
  private static async ensureServiceBinary(): Promise<string> {
    const candidates = this.serviceBinaryCandidates()
    const existing = candidates.find((candidate) => fs.existsSync(candidate))
    const targetExe = existing || candidates[0]
    const csSource = path.join(app.getAppPath(), 'resources', 'binaries', 'DraftOneService.cs')
    const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
    const sourceNewer =
      fs.existsSync(csSource) &&
      (!existing || fs.statSync(csSource).mtimeMs > fs.statSync(existing).mtimeMs)
    if (sourceNewer && fs.existsSync(csc)) {
      const compiled = await execFileText(csc, [
        '/target:exe',
        `/out:${targetExe}`,
        '/r:System.ServiceProcess.dll',
        csSource
      ])
      const updated = fs.existsSync(targetExe) && fs.statSync(targetExe).mtimeMs >= fs.statSync(csSource).mtimeMs
      if (!updated) {
        throw new Error(
          compiled.text || '编译 DraftOneService.exe 失败。请先停止正在运行的服务，再重新安装。'
        )
      }
    }
    return targetExe
  }

  // 1. Win32 System Service Management
  public static async getServiceStatus(): Promise<ServiceStatus> {
    const res = await execFileText('sc.exe', ['query', this.SERVICE_NAME])
    if (res.code !== 0 || res.text.includes('1060')) {
      return { installed: false, running: false, statusText: '未安装' }
    }

    const isRunning = res.text.includes('RUNNING') || res.text.includes('STATE              : 4')
    return {
      installed: true,
      running: isRunning,
      statusText: isRunning ? '正在运行 (Active)' : '已停止 (Stopped)'
    }
  }

  public static async installService(): Promise<{ success: boolean; message: string }> {
    let serviceBinary = ''
    try {
      serviceBinary = await this.ensureServiceBinary()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, message }
    }
    if (!fs.existsSync(serviceBinary)) {
      return { success: false, message: '未找到服务封装组件 (DraftOneService.exe)' }
    }

    const coreBinary = coreBesideService(serviceBinary)
    if (!fs.existsSync(coreBinary)) {
      return { success: false, message: '服务目录里没有 mihomo.exe，已停止安装。' }
    }

    try {
      fs.writeFileSync(
        path.join(path.dirname(serviceBinary), CORE_HASH_FILE),
        formatHashFile(hashFileHex(coreBinary))
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, message: `无法登记内核哈希: ${message}` }
    }

    await execFileText('sc.exe', ['stop', this.SERVICE_NAME])
    await execFileText('sc.exe', ['delete', this.SERVICE_NAME])
    const created = await execFileText('sc.exe', scCreateArgs(this.SERVICE_NAME, serviceBinary))
    if (created.code !== 0) {
      return { success: false, message: `服务安装异常: ${created.text}` }
    }
    await execFileText('sc.exe', [
      'description',
      this.SERVICE_NAME,
      'draft-one Windows Proxy Background Daemon with Wintun support'
    ])
    const started = await execFileText('sc.exe', ['start', this.SERVICE_NAME])
    await new Promise((resolve) => setTimeout(resolve, 800))
    const queried = await execFileText('sc.exe', ['query', this.SERVICE_NAME])
    const output = `${started.text}\n${queried.text}`
    const running = output.includes('RUNNING') || output.includes('STATE              : 4')
    if (running) return { success: true, message: '系统服务注册并拉起成功！' }
    return { success: false, message: `服务安装异常: ${output}` }
  }

  public static async uninstallService(): Promise<{ success: boolean; message: string }> {
    await execFileText('sc.exe', ['stop', this.SERVICE_NAME])
    const removed = await execFileText('sc.exe', ['delete', this.SERVICE_NAME])
    const queried = await execFileText('sc.exe', ['query', this.SERVICE_NAME])
    const output = `${removed.text}\n${queried.text}`
    if (removed.code === 0 || output.includes('1060') || output.includes('SUCCESS')) {
      return { success: true, message: '系统服务已成功注销并卸载' }
    }
    return { success: false, message: `服务卸载失败: ${output}` }
  }

  public static async startService(): Promise<{ success: boolean; message: string }> {
    const started = await execFileText('sc.exe', ['start', this.SERVICE_NAME])
    await new Promise((resolve) => setTimeout(resolve, 800))
    const queried = await execFileText('sc.exe', ['query', this.SERVICE_NAME])
    const output = `${started.text}\n${queried.text}`
    const running = output.includes('RUNNING') || output.includes('STATE              : 4')
    return {
      success: running,
      message: running ? '系统服务启动成功 (Active)' : `启动失败: ${output}`
    }
  }

  public static async stopService(): Promise<{ success: boolean; message: string }> {
    const stoppedCmd = await execFileText('sc.exe', ['stop', this.SERVICE_NAME])
    await new Promise((resolve) => setTimeout(resolve, 800))
    const queried = await execFileText('sc.exe', ['query', this.SERVICE_NAME])
    const output = `${stoppedCmd.text}\n${queried.text}`
    const stopped = output.includes('STOPPED') || output.includes('STATE              : 1')
    return {
      success: stopped,
      message: stopped ? '系统服务已停止 (Stopped)' : `停止失败: ${output}`
    }
  }

  // 2. High-Priority Task Scheduler
  /**
   * Installers before this change registered DraftOne_AutoStart with /RL HIGHEST
   * and no interactive-logon limit. That process does not own the user desktop, so
   * its tray is never visible and it can hold the single-instance lock.
   */
  public static retireNonInteractiveTask(): Promise<void> {
    return new Promise((resolve) => {
      execFile(
        'schtasks.exe',
        ['/Query', '/TN', this.TASK_NAME, '/XML'],
        { windowsHide: true, timeout: 8000 },
        (queryErr, stdout) => {
          const xml = String(stdout || '')
          const interactive = xml.includes('InteractiveToken')
          const highest = xml.includes('HighestAvailable')
          if (queryErr || !highest || interactive) {
            resolve()
            return
          }
          execFile(
            'schtasks.exe',
            ['/Delete', '/TN', this.TASK_NAME, '/F'],
            { windowsHide: true, timeout: 8000 },
            () => resolve()
          )
        }
      )
    })
  }

  public static async getTaskStatus(): Promise<TaskStatus> {
    if (process.platform !== 'win32') {
      return { exists: false, taskName: this.TASK_NAME }
    }
    const queried = await execFileText('schtasks.exe', ['/Query', '/TN', this.TASK_NAME, '/FO', 'LIST'])
    return {
      exists: queried.code === 0,
      taskName: this.TASK_NAME
    }
  }

  public static async installTask(): Promise<{ success: boolean; message: string }> {
    if (process.platform !== 'win32') {
      return { success: false, message: '当前不是 Windows，无法注册计划任务。' }
    }
    const who = await execFileText('whoami.exe', [])
    const userId = who.text.split(/\r?\n/).find((line) => line.includes('\\'))?.trim() || who.text.trim()
    if (who.code !== 0 || !userId) {
      return { success: false, message: `无法确认当前用户，计划任务未写入: ${who.text}` }
    }
    const xml = buildLogonTaskXml({
      userId,
      command: process.execPath,
      arguments: '--silent'
    })
    const xmlPath = path.join(os.tmpdir(), `draft-one-autostart-${process.pid}.xml`)
    fs.writeFileSync(xmlPath, Buffer.from(`\uFEFF${xml}`, 'utf16le'))
    try {
      const created = await execFileText('schtasks.exe', [
        '/Create',
        '/TN',
        this.TASK_NAME,
        '/XML',
        xmlPath,
        '/F'
      ])
      if (created.code !== 0) {
        return { success: false, message: `计划任务注册失败: ${created.text}` }
      }
    } finally {
      fs.rmSync(xmlPath, { force: true })
    }
    return {
      success: true,
      message:
        '已写入任务计划程序：当前用户登录时启动，勾选最高权限，不限制交流电源，配置为 Windows 10。'
    }
  }

  public static async uninstallTask(): Promise<{ success: boolean; message: string }> {
    const removed = await execFileText('schtasks.exe', ['/Delete', '/TN', this.TASK_NAME, '/F'])
    return {
      success: removed.code === 0,
      message: removed.code === 0 ? '已从任务计划程序移除登录启动。' : `移除失败: ${removed.text}`
    }
  }

  // 3. Network & System Utilities
  public static async flushDns(): Promise<{ success: boolean; message: string }> {
    const res = await execFileText('ipconfig.exe', ['/flushdns'])
    return {
      success: res.code === 0,
      message: res.code === 0 ? 'Windows DNS 解析缓存刷新完毕！' : `刷新失败: ${res.text}`
    }
  }

  public static async resetWinsock(): Promise<{ success: boolean; message: string }> {
    const proxyOk = await SystemProxyManager.disable()
    const res = await execFileText('netsh.exe', ['winsock', 'reset'])
    const success = res.code === 0
    return {
      success,
      message: success
        ? `已恢复系统代理，并执行 Winsock 重置。${proxyOk ? '' : '代理恢复没有完全成功。'}重启计算机后 Winsock 重置才生效。`
        : `重置失败: ${res.text}`
    }
  }

  public static async fixFirewall(): Promise<{ success: boolean; message: string }> {
    const rules = [
      { name: 'DraftOne_App', program: process.execPath },
      { name: 'DraftOne_Core', program: this.getCoreBinaryPath() }
    ]
    const errors: string[] = []
    for (const rule of rules) {
      await execFileText('netsh.exe', firewallDeleteArgs(rule.name))
      const added = await execFileText('netsh.exe', firewallRuleArgs(rule.name, 'in', rule.program))
      if (added.code !== 0) errors.push(added.text || rule.name)
    }
    return {
      success: errors.length === 0,
      message:
        errors.length === 0
          ? '已为客户端和内核添加入站放行规则。'
          : `防火墙放行失败: ${errors.join(' ')}`
    }
  }

  public static async fixWintun(): Promise<{ success: boolean; message: string }> {
    const script = this.windowsScript('remove-draft-one-tun.ps1')
    if (!fs.existsSync(script)) {
      return { success: false, message: '未找到 DraftOneTun 清理脚本。' }
    }
    const first = await this.powershellFile(script)
    if (first.code === 0) {
      return { success: true, message: first.text || '已处理 DraftOneTun。' }
    }
    const elevated = await this.powershellFile(this.windowsScript('run-elevated-file.ps1'), [script], true)
    return {
      success: elevated.code === 0,
      message:
        elevated.code === 0
          ? elevated.text || '已移除 DraftOneTun。'
          : `清理失败: ${elevated.text || first.text}`
    }
  }

  public static async allowUwpLoopback(): Promise<{ success: boolean; message: string }> {
    const script = this.windowsScript('enable-uwp-loopback.ps1')
    if (!fs.existsSync(script)) {
      return { success: false, message: '未找到 UWP 回环脚本。' }
    }
    const first = await this.powershellFile(script)
    if (first.code === 0) {
      return { success: true, message: first.text || '已添加 Microsoft Store 应用的回环豁免。' }
    }
    const elevated = await this.powershellFile(this.windowsScript('run-elevated-file.ps1'), [script], true)
    if (elevated.code === 0) {
      return { success: true, message: elevated.text || '已添加 Microsoft Store 应用的回环豁免。' }
    }
    if (elevated.code === 1223) {
      return { success: false, message: '已取消管理员授权，回环豁免没有写入。' }
    }
    return { success: false, message: `回环豁免失败: ${elevated.text || first.text}` }
  }

  public static async getServiceLogs(): Promise<string> {
    const candidates = [
      path.join(installDataDir(), 'logs', 'service.log'),
      path.join(path.dirname(process.execPath), 'data', 'logs', 'service.log')
    ]

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          const content = fs.readFileSync(p, 'utf-8')
          const lines = content.split(/\r?\n/)
          return lines.slice(-200).join('\n')
        } catch {}
      }
    }
    return '【提示】未检索到系统服务日志文件 (service.log)。如果尚未安装或启动服务，可先在上方点击“安装并启动系统服务”。'
  }
}

function decodeTaskBuf(buf: Buffer | string | undefined): string {
  if (!buf) return ''
  if (typeof buf === 'string') return buf
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.slice(2).toString('utf16le')
  }
  if (buf.includes(0)) return buf.toString('utf16le').replace(/^\uFEFF/, '')
  return SystemServiceManager.decodeWin(buf)
}

function execFileText(
  file: string,
  args: string[],
  timeout = 20000
): Promise<{ code: number; text: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout, encoding: 'buffer' }, (err, stdout, stderr) => {
      const text = [decodeTaskBuf(stdout), decodeTaskBuf(stderr)].filter(Boolean).join('\n').trim()
      const exitCode = typeof err?.code === 'number' ? err.code : err ? 1 : 0
      resolve({ code: exitCode, text })
    })
  })
}
