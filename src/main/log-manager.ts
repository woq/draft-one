import fs from 'fs'
import http from 'http'
import path from 'path'
import type { BrowserWindow } from 'electron'
import { installDataDir } from './app-data-dir'
import { getControllerSecret } from './controller-secret'
import { parseAppLogLine, tailLines } from './log-history'
import { enforceLogRetention, MAX_LOG_BYTES, rotateLogFile } from './log-retention'
import type { LogCategory, RoutingLogDetails } from '../renderer/src/types'

export interface LogEntry {
  id: string
  seq: number
  timestamp: number
  time: string
  type: 'debug' | 'info' | 'warning' | 'error'
  category?: LogCategory
  routing?: RoutingLogDetails
  payload: string
}

const LOG_RETENTION_INTERVAL_MS = 10 * 60 * 1000

function appLogPath(): string {
  return path.join(installDataDir(), 'logs', 'app.log')
}

function appendAppLog(line: string): void {
  try {
    const dir = path.join(installDataDir(), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    const active = appLogPath()
    const text = line.endsWith('\n') ? line : `${line}\n`
    const extra = Buffer.byteLength(text)
    let size = fs.existsSync(active) ? fs.statSync(active).size : 0
    if (size > MAX_LOG_BYTES) {
      enforceLogRetention(active)
      size = fs.existsSync(active) ? fs.statSync(active).size : 0
    }
    if (size > 0 && size + extra > MAX_LOG_BYTES) rotateLogFile(active)
    fs.appendFileSync(active, text)
  } catch {
    // A full disk or a locked file must not take down the UI log stream.
  }
}

export class LogManager {
  private static buffer: LogEntry[] = []
  private static maxBuffer = 2000
  private static seqCounter = 0
  private static req: http.ClientRequest | null = null
  private static isConnecting = false
  private static mainWindow: BrowserWindow | null = null
  private static secret = ''
  private static port = 9090
  private static historyLoaded = false
  private static retentionTimer: NodeJS.Timeout | null = null

  public static setWindow(win: BrowserWindow | null) {
    this.mainWindow = win
  }

  /**
   * Return logs in reverse order: newest first, oldest last (从新到旧)
   */
  public static getLogs(): LogEntry[] {
    return [...this.buffer].reverse()
  }

  public static clearLogs(): void {
    this.buffer = []
    this.historyLoaded = true
    try {
      const active = appLogPath()
      if (fs.existsSync(active)) fs.writeFileSync(active, '')
    } catch {
      // The on-screen buffer is already empty.
    }
  }

  private static loadHistory(): void {
    if (this.historyLoaded) return
    this.historyLoaded = true
    try {
      const active = appLogPath()
      enforceLogRetention(active)
      if (!fs.existsSync(active)) return
      const lines = tailLines(fs.readFileSync(active, 'utf-8'), this.maxBuffer)
      for (const line of lines) {
        const parsed = parseAppLogLine(line)
        if (!parsed) continue
        const cls = this.classifyLog(parsed.payload, parsed.type)
        this.buffer.push({
          id: `hist-${this.buffer.length}`,
          seq: ++this.seqCounter,
          timestamp: 0,
          time: parsed.time,
          type: parsed.type,
          category: cls.category,
          routing: cls.routing,
          payload: parsed.payload
        })
        if (this.buffer.length > this.maxBuffer) this.buffer.shift()
      }
    } catch {
      // A missing or locked log leaves the live stream as the only source.
    }
  }

  /**
   * Intelligent classification:
   * 1. error/warning -> error
   * 2. DNS query / lookup / resolution -> dns
   * 3. Target connections (TCP/UDP domain routing hits) -> routing
   * 4. Kernel initialization, config hot reloads, sniffer -> system
   */
  public static classifyLog(
    payload: string,
    type: 'debug' | 'info' | 'warning' | 'error'
  ): {
    category: LogCategory
    routing?: RoutingLogDetails
  } {
    // 1. Errors & Warnings
    if (
      type === 'error' ||
      type === 'warning' ||
      payload.includes('level=error') ||
      payload.includes('level=fatal') ||
      payload.includes('level=warn')
    ) {
      return { category: 'error' }
    }

    // 2. DNS Resolution logs
    // Examples: "[DNS] resolve cdn.openai.com A from ...", "[DNS] cdn.openai.com --> [150.171.110.70]", "DNS server(UDP) listening at",
    // "[UDP] mihomo --> 1.1.1.1:53 ...", "[UDP] 127.0.0.1:53 ...", ":53 using ..."
    if (
      payload.startsWith('[DNS]') ||
      payload.includes(' [DNS] ') ||
      payload.includes('DNS server(') ||
      payload.includes('/dns-query') ||
      /:53(?:\s+|$|,|-->|using)/.test(payload) ||
      /(?:\[UDP\]|UDP).*?:53\b/i.test(payload) ||
      /(?:\[TCP\]|TCP).*?:53\b/i.test(payload)
    ) {
      return { category: 'dns' }
    }

    // 3. Routing & Domain Match Logs (Top priority for user to see domain hits)
    // Examples:
    // "[TCP] 127.0.0.1:60536 --> cdn.openai.com:443 match GeoSite(openai) using 🇸🇬🕶 QCloud 落地 02"
    // "[TCP] 127.0.0.1:60538 --> config.immersivetranslate.com:443 match Match using PROXY[🇭🇰🕶 Akile 落地 02]"
    // "[UDP] mihomo --> 1.1.1.1:53 using PROXY[🇭🇰🕶 Akile 落地 02]"
    // "127.0.0.1:58394 --> 124.239.14.244:443 match GeoIP(cn) using DIRECT"
    const routingMatch = payload.match(
      /(?:\[(TCP|UDP)\]\s+)?(\S+)\s+-->\s+(\S+)(?:\s+match\s+(\S+))?\s+using\s+(.+)/i
    )
    if (routingMatch) {
      const protocol = (routingMatch[1] ? routingMatch[1].toUpperCase() : 'TCP') as 'TCP' | 'UDP'
      const source = routingMatch[2]
      const target = routingMatch[3]
      const rule = routingMatch[4] || 'Direct/Match'
      const outbound = routingMatch[5].trim()

      return {
        category: 'routing',
        routing: {
          protocol,
          source,
          target,
          rule,
          outbound
        }
      }
    }

    if (payload.includes('-->') && payload.includes('using')) {
      return { category: 'routing' }
    }

    // 4. Default to system/core status
    return { category: 'system' }
  }

  public static pushEntry(entry: LogEntry): void {
    if (!entry.seq) {
      entry.seq = ++this.seqCounter
    }
    if (!entry.timestamp) {
      entry.timestamp = Date.now()
    }
    if (!entry.category) {
      const cls = this.classifyLog(entry.payload, entry.type)
      entry.category = cls.category
      if (cls.routing) entry.routing = cls.routing
    }

    this.buffer.push(entry)
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.shift()
    }
    appendAppLog(`${entry.time} [${entry.type}] ${entry.payload}`)
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('core:new-log', entry)
    }
  }

  /**
   * Push raw console stdout / stderr line from core process
   */
  public static pushRaw(raw: string, isError = false): void {
    const lines = raw.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let type: 'debug' | 'info' | 'warning' | 'error' = isError ? 'error' : 'info'
      let payload = trimmed

      // Parse Mihomo log format: time="..." level=info msg="..."
      if (trimmed.includes('level=')) {
        if (trimmed.includes('level=error') || trimmed.includes('level=fatal')) type = 'error'
        else if (trimmed.includes('level=warning') || trimmed.includes('level=warn')) type = 'warning'
        else if (trimmed.includes('level=debug')) type = 'debug'
        else type = 'info'

        const msgMatch = trimmed.match(/msg="([^"]+)"/) || trimmed.match(/msg=([^\s]+)/)
        if (msgMatch) {
          payload = msgMatch[1]
        }
      }

      const now = new Date()
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(
        now.getMilliseconds()
      ).padStart(3, '0')}`

      const { category, routing } = this.classifyLog(payload, type)

      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        seq: ++this.seqCounter,
        timestamp: Date.now(),
        time: timeStr,
        type,
        category,
        routing,
        payload
      }
      this.pushEntry(entry)
    }
  }

  public static start(secret = getControllerSecret(), port = 9090): void {
    this.loadHistory()
    if (!this.retentionTimer) {
      this.retentionTimer = setInterval(() => {
        try {
          enforceLogRetention(appLogPath())
        } catch {
          // The next pass retries. Logging must keep running.
        }
      }, LOG_RETENTION_INTERVAL_MS)
    }
    if (this.isConnecting) return
    this.secret = secret
    this.port = port

    if (this.req) {
      try {
        this.req.destroy()
      } catch {}
      this.req = null
    }

    this.isConnecting = true

    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: '/logs?level=info',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secret}`
      }
    }

    try {
      const req = http.request(options, (res) => {
        this.isConnecting = false
        let bufferStr = ''

        res.on('data', (chunk: Buffer) => {
          bufferStr += chunk.toString('utf-8')
          const lines = bufferStr.split('\n')
          bufferStr = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            try {
              const parsed = JSON.parse(trimmed)
              const now = new Date()
              const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
                now.getMinutes()
              ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(
                now.getMilliseconds()
              ).padStart(3, '0')}`

              const logType = (parsed.type || 'info').toLowerCase()
              const logPayload = parsed.payload || ''
              const { category, routing } = this.classifyLog(logPayload, logType)

              const entry: LogEntry = {
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                seq: ++this.seqCounter,
                timestamp: Date.now(),
                time: timeStr,
                type: logType,
                category,
                routing,
                payload: logPayload
              }
              this.pushEntry(entry)
            } catch {
              // Not JSON, push as raw text
              this.pushRaw(trimmed)
            }
          }
        })

        res.on('end', () => {
          this.req = null
          this.isConnecting = false
          setTimeout(() => this.start(this.secret, this.port), 2000)
        })

        res.on('error', () => {
          this.req = null
          this.isConnecting = false
          setTimeout(() => this.start(this.secret, this.port), 2000)
        })
      })

      req.on('error', () => {
        this.req = null
        this.isConnecting = false
        setTimeout(() => this.start(this.secret, this.port), 3000)
      })

      this.req = req
      req.end()
    } catch {
      this.isConnecting = false
      setTimeout(() => this.start(this.secret, this.port), 3000)
    }
  }

  public static stop(): void {
    if (this.req) {
      try {
        this.req.destroy()
      } catch {}
      this.req = null
    }
    this.isConnecting = false
  }
}
