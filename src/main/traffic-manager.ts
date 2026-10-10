import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { getControllerSecret } from './controller-secret'
import { installDataDir } from './app-data-dir'
import {
  kernelDelta,
  pruneTrafficSnapshot,
  readTrafficSnapshot,
  writeTrafficSnapshot,
  type TrafficHostStat,
  type TrafficNodeStat
} from './traffic-stats'
import type { LiveConnectionItem, ConnectionsSnapshot } from '../renderer/src/types'

export type HostTrafficStat = TrafficHostStat

export interface TrafficSummary {
  totalUpload: number
  totalDownload: number
  speedUp: number
  speedDown: number
  nodeStats: Record<string, { upload: number; download: number; connections: number }>
  topHosts: HostTrafficStat[]
}

interface RawConnection {
  id: string
  metadata: {
    network?: string
    type?: string
    sourceIP?: string
    destinationIP?: string
    sourcePort?: string | number
    destinationPort?: string | number
    host?: string
    sniffHost?: string
    remoteDestination?: string
    dnsMode?: string
    processPath?: string
  }
  upload: number
  download: number
  start: string
  chains?: string[]
  rule?: string
  rulePayload?: string
}

export class TrafficManager {
  private controllerUrl = 'http://127.0.0.1:9090'

  private lastDownloadTotal = 0
  private lastUploadTotal = 0
  private lastTimestamp = Date.now()

  private speedUp = 0
  private speedDown = 0
  private totalUpload = 0
  private totalDownload = 0
  private kernelUpload = 0
  private kernelDownload = 0
  private statsFile = ''
  private statsLoaded = false
  private statsWritable = true
  private pollTimer: NodeJS.Timeout | null = null

  // Last cumulative bytes seen per live connection, so later polls add only the delta.
  private connBytes = new Map<string, { upload: number; download: number; lastTime?: number }>()
  private nodeStats: Record<string, TrafficNodeStat> = {}
  private hostStats: Record<string, HostTrafficStat> = {}
  private lastConnections: LiveConnectionItem[] = []
  private chain: Promise<TrafficSummary> = Promise.resolve({
    totalUpload: 0,
    totalDownload: 0,
    speedUp: 0,
    speedDown: 0,
    nodeStats: {},
    topHosts: []
  })

  public startBackgroundPolling(intervalMs = 1000): void {
    if (this.pollTimer) return
    this.pollTimer = setInterval(() => {
      this.fetchStats().catch(() => {})
    }, intervalMs)
  }

  public stopBackgroundPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  public fetchStats(): Promise<TrafficSummary> {
    const run = this.chain.then(() => this.fetchStatsOnce())
    this.chain = run.then(
      () => this.emptySummary(),
      () => this.emptySummary()
    )
    return run
  }

  private emptySummary(): TrafficSummary {
    return {
      totalUpload: this.totalUpload,
      totalDownload: this.totalDownload,
      speedUp: this.speedUp,
      speedDown: this.speedDown,
      nodeStats: this.nodeStats,
      topHosts: Object.values(this.hostStats).slice(0, 50)
    }
  }

  private ensureStatsLoaded(): void {
    if (this.statsLoaded) return
    this.statsLoaded = true
    this.statsFile = path.join(installDataDir(), 'traffic-stats.json')
    const loaded = readTrafficSnapshot(this.statsFile)
    this.statsWritable = loaded.writable
    this.totalUpload = loaded.snapshot.totalUpload
    this.totalDownload = loaded.snapshot.totalDownload
    this.kernelUpload = loaded.snapshot.kernelUpload
    this.kernelDownload = loaded.snapshot.kernelDownload
    this.nodeStats = loaded.snapshot.nodeStats
    this.hostStats = loaded.snapshot.hostStats
  }

  private persistStats(): void {
    if (!this.statsWritable || !this.statsFile) return
    try {
      writeTrafficSnapshot(this.statsFile, {
        totalUpload: this.totalUpload,
        totalDownload: this.totalDownload,
        kernelUpload: this.kernelUpload,
        kernelDownload: this.kernelDownload,
        nodeStats: this.nodeStats,
        hostStats: this.hostStats
      })
    } catch (err) {
      console.error('[Traffic] Failed to save traffic-stats.json:', err)
    }
  }

  private async fetchStatsOnce(): Promise<TrafficSummary> {
    this.ensureStatsLoaded()
    try {
      const res = await axios.get(`${this.controllerUrl}/connections`, {
        headers: { Authorization: `Bearer ${getControllerSecret()}` },
        timeout: 2500
      })

      const data = res.data || {}
      const downloadTotal: number = data.downloadTotal || 0
      const uploadTotal: number = data.uploadTotal || 0
      const upDelta = kernelDelta(this.kernelUpload, uploadTotal)
      const downDelta = kernelDelta(this.kernelDownload, downloadTotal)
      this.kernelUpload = uploadTotal >= 0 ? uploadTotal : 0
      this.kernelDownload = downloadTotal >= 0 ? downloadTotal : 0
      this.totalUpload += upDelta
      this.totalDownload += downDelta
      let accounted = upDelta + downDelta
      const currentConns: RawConnection[] = Array.isArray(data.connections) ? data.connections : []

    const now = Date.now()
    const timeElapsed = (now - this.lastTimestamp) / 1000

    if (this.lastDownloadTotal === 0 && downloadTotal > 0) {
      this.lastDownloadTotal = downloadTotal
      this.lastUploadTotal = uploadTotal
      this.lastTimestamp = now
    } else if (timeElapsed >= 0.8) {
      if (this.lastDownloadTotal > 0 && downloadTotal >= this.lastDownloadTotal) {
        this.speedDown = Math.round((downloadTotal - this.lastDownloadTotal) / timeElapsed)
      } else {
        this.speedDown = 0
      }

      if (this.lastUploadTotal > 0 && uploadTotal >= this.lastUploadTotal) {
        this.speedUp = Math.round((uploadTotal - this.lastUploadTotal) / timeElapsed)
      } else {
        this.speedUp = 0
      }

      this.lastDownloadTotal = downloadTotal
      this.lastUploadTotal = uploadTotal
      this.lastTimestamp = now
    }

      // Fetch active node selected in PROXY group to resolve chains penetrating to real node
      let activeProxyNode = ''
      try {
        const proxyRes = await axios.get(`${this.controllerUrl}/proxies/PROXY`, {
          headers: { Authorization: `Bearer ${getControllerSecret()}` },
          timeout: 1000
        })
        if (proxyRes.data && proxyRes.data.now) {
          activeProxyNode = proxyRes.data.now
        }
      } catch {}

      // Helper to penetrate chains and extract the actual underlying proxy node
      const resolveActualNode = (chains: string[] = []): string => {
        if (!chains || chains.length === 0) return 'DIRECT'

        // 1. If chain has multiple elements (e.g. ['PROXY', 'HK-Node-01'])
        // Filter out proxy group wrapper names like 'PROXY' or 'GLOBAL'
        const nonGroupNodes = chains.filter(
          (c) => c && c !== 'PROXY' && c !== 'GLOBAL' && c !== 'DEFAULT'
        )
        if (nonGroupNodes.length > 0) {
          // Return the innermost real outbound node
          return nonGroupNodes[nonGroupNodes.length - 1]
        }

        // 2. If chain contains only ['PROXY'] without child node specified in chain,
        // penetrate to current selected active node from PROXY group!
        if (chains.includes('PROXY')) {
          return activeProxyNode || 'PROXY'
        }

        return chains[0] || 'DIRECT'
      }

      const hostOf = (conn: RawConnection): { host: string; ip: string; rule: string } => {
        const meta = conn.metadata || {}
        const dst = meta.destinationIP || ''
        const remote = meta.remoteDestination || ''
        // destinationIP is the actual resolved target IP of the destination website/service.
        // remoteDestination in Mihomo is the proxy node server outbound IP when proxied.
        // We only fallback to remoteDestination if destinationIP is absent or a fake-ip (198.18.x.x).
        const ip = dst && !dst.startsWith('198.18.') ? dst : remote && !remote.startsWith('198.18.') ? remote : dst || remote
        const host = meta.host || meta.sniffHost || (dst && !dst.startsWith('198.18.') ? dst : ip) || '未知目标'
        const ruleName = conn.rule || 'MATCH'
        const payload = conn.rulePayload ? `,${conn.rulePayload}` : ''
        return { host, ip, rule: `${ruleName}${payload}` }
      }

      // Track active connections count per node
      const currentActiveNodeConns: Record<string, number> = {}
      const activeIds = new Set<string>()
      let connDownDeltaTotal = 0
      let connUpDeltaTotal = 0
      const formattedConns: LiveConnectionItem[] = []

      for (const conn of currentConns) {
        const targetNode = resolveActualNode(conn.chains)
        const { host, ip, rule } = hostOf(conn)
        const connId = conn.id || `${host}|${ip}|${conn.start}`
        activeIds.add(connId)

        currentActiveNodeConns[targetNode] = (currentActiveNodeConns[targetNode] || 0) + 1

        if (!this.nodeStats[targetNode]) {
          this.nodeStats[targetNode] = { upload: 0, download: 0, connections: 0 }
        }

        if (!this.hostStats[host]) {
          this.hostStats[host] = {
            host,
            ip,
            upload: 0,
            download: 0,
            rule,
            node: targetNode,
            lastSeen: now
          }
        }
        const hostRow = this.hostStats[host]
        hostRow.lastSeen = now
        if (ip) hostRow.ip = ip
        if (rule) hostRow.rule = rule
        if (targetNode) hostRow.node = targetNode

        const prev = this.connBytes.get(connId) || { upload: 0, download: 0, lastTime: now }
        const upload = Number(conn.upload) || 0
        const download = Number(conn.download) || 0
        const upDelta = upload >= prev.upload ? upload - prev.upload : upload
        const downDelta = download >= prev.download ? download - prev.download : download
        const dt = Math.max(0.5, (now - (prev.lastTime || (now - 1000))) / 1000)
        const connSpeedUp = Math.round(upDelta / dt)
        const connSpeedDown = Math.round(downDelta / dt)
        this.connBytes.set(connId, { upload, download, lastTime: now })

        this.nodeStats[targetNode].upload += upDelta
        this.nodeStats[targetNode].download += downDelta
        hostRow.upload += upDelta
        hostRow.download += downDelta
        connUpDeltaTotal += upDelta
        connDownDeltaTotal += downDelta
        accounted += upDelta + downDelta

        const meta = conn.metadata || {}
        let procName = ''
        if (meta.processPath) {
          const parts = meta.processPath.split(/[/\\]/)
          procName = parts[parts.length - 1] || ''
        }

        formattedConns.push({
          id: conn.id || connId,
          metadata: {
            network: (meta.network || 'tcp').toUpperCase(),
            type: meta.type || 'HTTP',
            sourceIP: meta.sourceIP || '',
            destinationIP: meta.destinationIP || '',
            sourcePort: String(meta.sourcePort || ''),
            destinationPort: String(meta.destinationPort || ''),
            host,
            dnsMode: meta.dnsMode,
            processPath: meta.processPath,
            process: procName
          },
          upload,
          download,
          start: conn.start || new Date().toISOString(),
          chains: Array.isArray(conn.chains) ? conn.chains : [],
          rule,
          rulePayload: conn.rulePayload ? String(conn.rulePayload) : '',
          speedUp: connSpeedUp,
          speedDown: connSpeedDown,
          actualNode: targetNode
        })
      }

      this.lastConnections = formattedConns

      for (const id of this.connBytes.keys()) {
        if (!activeIds.has(id)) this.connBytes.delete(id)
      }

      // If there are uncaptured traffic bytes (closed short connections, internal queries),
      // attribute the difference to the current active proxy node (or DIRECT if none)
      const unaccountedDown = Math.max(0, downDelta - connDownDeltaTotal)
      const unaccountedUp = Math.max(0, upDelta - connUpDeltaTotal)
      if (unaccountedDown > 0 || unaccountedUp > 0) {
        const fallbackNode = activeProxyNode || 'DIRECT'
        if (!this.nodeStats[fallbackNode]) {
          this.nodeStats[fallbackNode] = { upload: 0, download: 0, connections: 0 }
        }
        this.nodeStats[fallbackNode].download += unaccountedDown
        this.nodeStats[fallbackNode].upload += unaccountedUp
        accounted += unaccountedDown + unaccountedUp
      }

      // Refresh node connection counts
      for (const nodeName of Object.keys(this.nodeStats)) {
        this.nodeStats[nodeName].connections = currentActiveNodeConns[nodeName] || 0
      }

      const retained = {
        totalUpload: this.totalUpload,
        totalDownload: this.totalDownload,
        kernelUpload: this.kernelUpload,
        kernelDownload: this.kernelDownload,
        nodeStats: this.nodeStats,
        hostStats: this.hostStats
      }
      if (pruneTrafficSnapshot(retained)) {
        this.nodeStats = retained.nodeStats
        this.hostStats = retained.hostStats
        accounted += 1
      }

      if (accounted > 0) this.persistStats()

      // Sort top hosts by total traffic (download + upload) descending
      const topHosts = Object.values(this.hostStats)
        .sort((a, b) => b.download + b.upload - (a.download + a.upload))
        .slice(0, 50)

      return {
        totalUpload: this.totalUpload,
        totalDownload: this.totalDownload,
        speedUp: this.speedUp,
        speedDown: this.speedDown,
        nodeStats: this.nodeStats,
        topHosts
      }
    } catch {
      return this.emptySummary()
    }
  }

  public async getConnectionsSnapshot(): Promise<ConnectionsSnapshot> {
    await this.fetchStats()
    return {
      downloadTotal: this.totalDownload,
      uploadTotal: this.totalUpload,
      connections: this.lastConnections
    }
  }

  public async closeConnection(id: string): Promise<boolean> {
    try {
      await axios.delete(`${this.controllerUrl}/connections/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${getControllerSecret()}` },
        timeout: 2500
      })
      this.connBytes.delete(id)
      this.lastConnections = this.lastConnections.filter((c) => c.id !== id)
      return true
    } catch (err) {
      console.error('[Traffic] Failed to close connection:', err)
      return false
    }
  }

  public async closeAllConnections(): Promise<boolean> {
    try {
      await axios.delete(`${this.controllerUrl}/connections`, {
        headers: { Authorization: `Bearer ${getControllerSecret()}` },
        timeout: 3000
      })
      this.connBytes.clear()
      this.lastConnections = []
      return true
    } catch (err) {
      console.error('[Traffic] Failed to close all connections:', err)
      return false
    }
  }

  public async resetStats(): Promise<boolean> {
    this.ensureStatsLoaded()
    this.nodeStats = {}
    this.hostStats = {}
    this.connBytes.clear()
    this.lastConnections = []
    this.totalUpload = 0
    this.totalDownload = 0
    this.speedUp = 0
    this.speedDown = 0

    // Fetch latest kernel total to set baseline so previous kernel counters aren't added as delta
    try {
      const res = await axios.get(`${this.controllerUrl}/connections`, {
        headers: { Authorization: `Bearer ${getControllerSecret()}` },
        timeout: 2500
      })
      const data = res.data || {}
      this.kernelUpload = Number(data.uploadTotal) || 0
      this.kernelDownload = Number(data.downloadTotal) || 0
      this.lastUploadTotal = this.kernelUpload
      this.lastDownloadTotal = this.kernelDownload

      // Close all live connections so in-flight accumulated sessions don't leak old bytes
      await axios.delete(`${this.controllerUrl}/connections`, {
        headers: { Authorization: `Bearer ${getControllerSecret()}` },
        timeout: 2500
      }).catch(() => {})
    } catch {
      this.kernelUpload = 0
      this.kernelDownload = 0
      this.lastUploadTotal = 0
      this.lastDownloadTotal = 0
    }

    this.statsWritable = true
    if (this.statsFile) {
      fs.rmSync(this.statsFile, { force: true })
    }
    this.persistStats()
    return true
  }
}
