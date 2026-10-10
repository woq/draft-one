import { app } from 'electron'
import { spawn, execFile, execFileSync, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import axios from 'axios'
import { LogManager } from './log-manager'
import { getControllerSecret } from './controller-secret'
import { installDataDir } from './app-data-dir'
import { listTcpListeners, type PortOccupant } from './port-occupancy'

export class CoreProcessManager {
  private process: ChildProcess | null = null
  private configPath: string
  private controllerUrl = 'http://127.0.0.1:9090'
  private startTime = 0
  private isManuallyStopped = false
  private isManagedByService = false
  private restartAttempts = 0
  private maxRestartAttempts = 1
  private restartTimer: NodeJS.Timeout | null = null
  private serviceWatchTimer: NodeJS.Timeout | null = null
  private serviceWatchToken = 0
  private bypassServiceWait = false
  private listenerPorts: () => number[] = () => [7890, 9090]
  private onAbnormalListener: ((reason: string, occupants?: PortOccupant[]) => void) | null = null

  constructor() {
    const userData = installDataDir()
    if (!fs.existsSync(userData)) {
      fs.mkdirSync(userData, { recursive: true })
    }
    this.configPath = path.join(userData, 'config.yaml')
  }

  public setOnAbnormal(listener: (reason: string, occupants?: PortOccupant[]) => void): void {
    this.onAbnormalListener = listener
  }

  public setListenerPorts(provider: () => number[]): void {
    this.listenerPorts = provider
  }

  private notifyAbnormal(reason: string, occupants?: PortOccupant[]): void {
    if (this.onAbnormalListener) {
      try {
        this.onAbnormalListener(reason, occupants)
      } catch (err) {
        console.error('[CoreManager] Error in abnormal listener:', err)
      }
    }
  }

  public getConfigPath(): string {
    return this.configPath
  }

  public writeConfigFile(yamlContent: string): void {
    fs.writeFileSync(this.configPath, yamlContent, 'utf-8')
  }

  private async pingController(timeoutMs = 1500): Promise<boolean> {
    try {
      await axios.get(`${this.controllerUrl}/version`, {
        headers: { Authorization: `Bearer ${getControllerSecret()}` },
        timeout: timeoutMs
      })
      return true
    } catch {
      return false
    }
  }

  private getBinaryPath(): string {
    const isDev = !app.isPackaged
    // In packaged app, binaries must be executed from outside app.asar
    const candidates: string[] = isDev
      ? [
          path.join(app.getAppPath(), 'resources', 'binaries', 'mihomo.exe'),
          path.join(app.getAppPath(), 'mihomo.exe')
        ]
      : [
          path.join(process.resourcesPath, 'binaries', 'mihomo.exe'),
          path.join(path.dirname(process.execPath), 'binaries', 'mihomo.exe'),
          path.join(path.dirname(process.execPath), 'mihomo.exe'),
          path.join(process.resourcesPath, 'mihomo.exe'),
          path.join(app.getAppPath(), 'resources', 'binaries', 'mihomo.exe')
        ]

    if (process.platform === 'win32') {
      const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
      const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'

      candidates.push(
        path.join(progFiles, 'draft-one', 'resources', 'binaries', 'mihomo.exe'),
        path.join(progFiles, 'draft-one', 'binaries', 'mihomo.exe'),
        path.join(progFiles, 'draft-one', 'mihomo.exe'),
        path.join(progFilesX86, 'draft-one', 'resources', 'binaries', 'mihomo.exe'),
        path.join(progFilesX86, 'draft-one', 'binaries', 'mihomo.exe')
      )
    }

    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }

    return candidates[0]
  }

  public isBinaryAvailable(): boolean {
    return fs.existsSync(this.getBinaryPath())
  }

  private async reloadManaged(): Promise<boolean> {
    try {
      await axios.put(
        `${this.controllerUrl}/configs?force=true`,
        { path: this.configPath },
        {
          headers: {
            Authorization: `Bearer ${getControllerSecret()}`,
            'Content-Type': 'application/json'
          },
          timeout: 3000
        }
      )
      return true
    } catch (err) {
      console.warn('[CoreManager] Hot reload failed:', err)
      return false
    }
  }

  /** Ask a running core to reload rule providers. A missing provider is not an error. */
  public async refreshRuleProviders(names: string[]): Promise<void> {
    for (const name of names) {
      try {
        await axios.put(`${this.controllerUrl}/providers/rules/${encodeURIComponent(name)}`, null, {
          headers: { Authorization: `Bearer ${getControllerSecret()}` },
          timeout: 20000
        })
      } catch (err) {
        console.warn(
          `[CoreManager] rule provider ${name} refresh skipped:`,
          err instanceof Error ? err.message : err
        )
      }
    }
  }

  /**
   * The service (or a previous run) may already be listening. Attach and push
   * the current config. This must not spawn another mihomo onto the same ports.
   */
  private async tryAttachExisting(reason: string): Promise<boolean> {
    if (!(await this.pingController(800))) return false
    this.isManagedByService = true
    if (!this.startTime) this.startTime = Date.now()
    this.restartAttempts = 0
    console.log(`[CoreManager] ${reason}`)
    LogManager.pushRaw(`[CoreManager] ${reason}`, false)
    const reloaded = await this.reloadManaged()
    if (!reloaded) {
      LogManager.pushRaw('[CoreManager] 已接管现有内核，热重载未成功，继续使用它当前的配置。', true)
    }
    return true
  }

  private async reportPortConflict(): Promise<void> {
    const attached = await this.tryAttachExisting('端口已被现有内核占用，界面改为接管。')
    if (attached || this.isManuallyStopped) return
    this.restartAttempts = this.maxRestartAttempts
    let occupants: PortOccupant[] = []
    try {
      occupants = await listTcpListeners(this.listenerPorts())
    } catch (error) {
      console.error('[CoreManager] Failed to identify the process listening on the core ports:', error)
    }
    this.notifyAbnormal('内核端口冲突（端口已被占用）', occupants)
  }

  private serviceIsRunning(): boolean {
    if (process.platform !== 'win32') return false
    try {
      const out = execFileSync('sc.exe', ['query', 'DraftOneService'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      })
      return out.includes('RUNNING') || out.includes('STATE              : 4')
    } catch {
      return false
    }
  }

  private watchServiceCore(): void {
    if (this.serviceWatchTimer) {
      clearTimeout(this.serviceWatchTimer)
      this.serviceWatchTimer = null
    }
    const token = ++this.serviceWatchToken
    const tick = (left: number): void => {
      if (token !== this.serviceWatchToken || this.isManuallyStopped) return
      void this.tryAttachExisting('系统服务的内核已就绪，界面已接管。').then((attached) => {
        if (token !== this.serviceWatchToken || this.isManuallyStopped || attached) return
        if (left <= 0) {
          LogManager.pushRaw(
            '[CoreManager] 服务未在时限内打开控制端口，界面改为自行启动内核。',
            true
          )
          this.isManagedByService = false
          this.bypassServiceWait = true
          void this.start()
          return
        }
        this.serviceWatchTimer = setTimeout(() => tick(left - 1), 1000)
      })
    }
    this.serviceWatchTimer = setTimeout(() => tick(8), 1000)
  }

  public async start(): Promise<boolean> {
    this.isManuallyStopped = false
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }

    const skipServiceWait = this.bypassServiceWait
    this.bypassServiceWait = false

    if (await this.tryAttachExisting('控制端口已在监听，界面接管现有内核，不另起进程。')) {
      return true
    }

    if (!skipServiceWait && this.serviceIsRunning()) {
      this.isManagedByService = true
      this.startTime = Date.now()
      const waitMsg = '[CoreManager] 系统服务已在运行，等待其内核开放控制端口，不另起 mihomo。'
      console.log(waitMsg)
      LogManager.pushRaw(waitMsg, false)
      this.watchServiceCore()
      return true
    }

    if (this.process) {
      return true
    }

    const binary = this.getBinaryPath()
    if (!fs.existsSync(binary)) {
      const msg = `[CoreManager] 未找到内核文件: ${binary}，请确认 resources/binaries/mihomo.exe 存在。`
      console.warn(msg)
      LogManager.pushRaw(msg, true)
      this.notifyAbnormal('未找到 mihomo 内核文件')
      return false
    }

    try {
      const configDir = path.dirname(this.configPath)
      LogManager.pushRaw(`[CoreManager] 正在启动 mihomo 核心: ${binary}`, false)
      this.process = spawn(binary, ['-d', configDir, '-f', this.configPath], {
        windowsHide: true,
        detached: false
      })

      let portConflictDetected = false

      this.process.on('error', (err) => {
        const msg = `[CoreManager] 核心进程启动失败: ${err.message}`
        console.error(msg)
        LogManager.pushRaw(msg, true)
        this.notifyAbnormal(`内核进程启动异常: ${err.message}`)
      })

      this.process.stdout?.on('data', (data) => {
        const text = data.toString()
        console.log(`[mihomo] ${text}`)
        if (
          text.includes('Only one usage of each socket address') ||
          text.includes('address already in use')
        ) {
          portConflictDetected = true
          LogManager.pushRaw(
            `[CoreManager] ⚠️ 端口冲突告警：核心监听端口 (7890/9090) 已被其他程序占用！`,
            true
          )
        }
        LogManager.pushRaw(text, false)
      })

      this.process.stderr?.on('data', (data) => {
        const text = data.toString()
        console.error(`[mihomo-err] ${text}`)
        if (
          text.includes('Only one usage of each socket address') ||
          text.includes('address already in use')
        ) {
          portConflictDetected = true
          LogManager.pushRaw(
            `[CoreManager] ⚠️ 端口冲突告警：核心监听端口 (7890/9090) 已被其他程序占用！`,
            true
          )
        }
        LogManager.pushRaw(text, true)
      })

      this.process.on('close', (code, signal) => {
        const isAbnormal = code !== 0 && code !== null
        const msg = `[CoreManager] 内核进程退出 (code: ${code}, signal: ${signal || 'none'})`
        console.log(msg)
        LogManager.pushRaw(msg, isAbnormal)
        this.process = null
        this.startTime = 0

        // 24/7 Supervisor Auto-Restart on unexpected termination
        if (!this.isManuallyStopped) {
          if (portConflictDetected) {
            void this.reportPortConflict()
            return
          }

          if (this.restartAttempts < this.maxRestartAttempts) {
            this.restartAttempts++
            const retryMsg = `[CoreManager] 内核意外终止，将在 1 秒后尝试自动恢复 (1/1)...`
            console.warn(retryMsg)
            LogManager.pushRaw(retryMsg, true)
            this.restartTimer = setTimeout(() => {
              this.start()
            }, 1000)
          } else {
            const maxMsg = '[CoreManager] 内核已尝试重启 1 次仍未能恢复，已停止重试，等待手动操作。'
            console.error(maxMsg)
            LogManager.pushRaw(maxMsg, true)
            this.notifyAbnormal('内核已停止运行，请检查日志或手动重启')
          }
        }
      })

      this.startTime = Date.now()
      this.restartAttempts = 0
      LogManager.pushRaw('[CoreManager] 内核进程已成功创建并运行中。', false)
      return true
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const msg = `[CoreManager] 创建内核进程异常: ${errMsg}`
      console.error(msg)
      LogManager.pushRaw(msg, true)
      this.notifyAbnormal(`启动内核异常: ${errMsg}`)
      this.startTime = 0
      return false
    }
  }

  public stop(): void {
    this.isManuallyStopped = true
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    this.startTime = 0
    this.serviceWatchToken++
    if (this.serviceWatchTimer) {
      clearTimeout(this.serviceWatchTimer)
      this.serviceWatchTimer = null
    }
    if (this.process) {
      const pid = this.process.pid
      try {
        if (pid) {
          try {
            process.kill(pid)
          } catch {
            this.process.kill()
          }
        } else {
          this.process.kill()
        }
      } catch (e) {
        console.error('[CoreManager] Error stopping process:', e)
      }
      this.process = null
    }
    this.isManagedByService = false
  }

  /**
   * User-requested cleanup. Ends every mihomo.exe on this machine,
   * including cores this app did not spawn. Caller must have asked the user.
   */
  public async killAllMihomo(): Promise<{ success: boolean; message: string }> {
    this.stop()
    if (process.platform !== 'win32') {
      return { success: true, message: '已停止本程序拉起的内核。当前系统没有按进程名清理 mihomo。' }
    }

    const images = ['mihomo.exe']
    const ended: string[] = []
    const absent: string[] = []
    for (const image of images) {
      const result = await taskkillImage(image)
      if (result.ended) ended.push(image)
      else absent.push(image)
    }

    const endedText = ended.length > 0 ? `已结束 ${ended.join('、')}` : '没有找到正在运行的 mihomo.exe'
    const absentText = absent.length > 0 && ended.length > 0 ? `；${absent.join('、')} 未在运行` : ''
    LogManager.pushRaw(`[CoreManager] 手动清理内核：${endedText}${absentText}`, false)
    return {
      success: true,
      message: `${endedText}${absentText}。`
    }
  }

  public async healthCheck(): Promise<boolean> {
    if (this.isManuallyStopped) return false
    if (!this.process && !this.isManagedByService) return false

    // Give kernel sufficient grace period (15 seconds) to initialize rules and listen on 9090
    const uptime = Date.now() - this.startTime
    if (this.startTime > 0 && uptime < 15000) {
      try {
        await axios.get(`${this.controllerUrl}/version`, {
          headers: { Authorization: `Bearer ${getControllerSecret()}` },
          timeout: 1000
        })
        return true
      } catch {
        // Still initializing (e.g. loading large GeoSite/GeoIP rules), wait gracefully
        return true
      }
    }

    try {
      await axios.get(`${this.controllerUrl}/version`, {
        headers: { Authorization: `Bearer ${getControllerSecret()}` },
        timeout: 2500
      })
      // Reset restart attempts on verified healthy response
      this.restartAttempts = 0
      return true
    } catch (err: unknown) {
      if (!this.isManuallyStopped) {
        const msg = `[CoreManager] 健康检查失败 (127.0.0.1:9090 超过15秒未响应): ${err instanceof Error ? err.message : String(err)}`
        console.warn(msg)
        LogManager.pushRaw(msg, true)
        this.notifyAbnormal('内核控制端口无响应或未正常运行')
        if (this.process) {
          try {
            this.process.kill()
          } catch {}
        }
      }
      return false
    }
  }

  public async reloadConfig(): Promise<boolean> {
    const ok = await this.reloadManaged()
    if (ok) return true
    if (this.isManagedByService) {
      LogManager.pushRaw('[CoreManager] 服务托管的内核热重载失败，不另起进程。', true)
      return false
    }
    console.warn('[CoreManager] Hot reload failed, falling back to process restart')
    this.stop()
    return await this.start()
  }

  public async testNodeDelay(
    nodeName: string,
    testUrl?: string,
    timeout = 5000
  ): Promise<number> {
    if (!nodeName) return -1
    if (!this.process && !this.isManagedByService) {
      LogManager.pushRaw(`[CoreManager] 测速已取消：内核未处于运行中 (${nodeName})`, true)
      return -1
    }

    // DIRECT local latency check
    if (nodeName === 'DIRECT') {
      const probeUrls = testUrl
        ? [testUrl]
        : ['http://cp.cloudflare.com/generate_204', 'http://www.gstatic.com/generate_204']
      for (const url of probeUrls) {
        try {
          const t0 = Date.now()
          await axios.get(url, { timeout: 3000 })
          return Date.now() - t0
        } catch {}
      }
      return -1
    }

    const probeUrls = testUrl
      ? [testUrl]
      : [
          'http://cp.cloudflare.com/generate_204',
          'http://www.gstatic.com/generate_204',
          'https://www.google.com/generate_204'
        ]

    for (const url of probeUrls) {
      try {
        const res = await axios.get(
          `${this.controllerUrl}/proxies/${encodeURIComponent(nodeName)}/delay`,
          {
            params: { url, timeout },
            headers: { Authorization: `Bearer ${getControllerSecret()}` },
            timeout: timeout + 500
          }
        )
        const d = res.data?.delay
        if (typeof d === 'number' && d >= 0) {
          return d
        }
      } catch {
        // Try next probe url
      }
    }

    return -1 // Timeout or error
  }

  public async selectProxyNode(groupName = 'PROXY', nodeName: string): Promise<boolean> {
    try {
      await axios.put(
        `${this.controllerUrl}/proxies/${encodeURIComponent(groupName)}`,
        { name: nodeName },
        {
          headers: {
            Authorization: `Bearer ${getControllerSecret()}`,
            'Content-Type': 'application/json'
          },
          timeout: 2000
        }
      )
      return true
    } catch (e) {
      console.error('[CoreManager] Failed to select proxy node:', e)
      return false
    }
  }

  public getStatus() {
    const isRunning = !!this.process || this.isManagedByService
    const uptimeSec =
      this.startTime && isRunning
        ? Math.floor((Date.now() - this.startTime) / 1000)
        : 0
    return {
      running: isRunning,
      binaryExists: this.isBinaryAvailable(),
      configPath: this.configPath,
      uptimeSec,
      isManagedByService: this.isManagedByService
    }
  }
}

function taskkillImage(image: string): Promise<{ ended: boolean }> {
  return new Promise((resolve) => {
    execFile('taskkill.exe', ['/F', '/T', '/IM', image], { windowsHide: true }, (err, stdout, stderr) => {
      const text = `${stdout || ''}\n${stderr || ''}`
      const missing = /not found|没有找到|没有运行|not running/i.test(text)
      resolve({ ended: !err && !missing })
    })
  })
}
