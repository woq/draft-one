import fs from 'fs'
import path from 'path'

export interface TrafficNodeStat {
  upload: number
  download: number
  connections: number
}

export interface TrafficHostStat {
  host: string
  ip: string
  upload: number
  download: number
  rule: string
  node?: string
  lastSeen: number
}

export interface TrafficSnapshot {
  totalUpload: number
  totalDownload: number
  kernelUpload: number
  kernelDownload: number
  nodeStats: Record<string, TrafficNodeStat>
  hostStats: Record<string, TrafficHostStat>
}

export const HOST_PRUNE_AT = 1500
export const MAX_HOST_STATS = 800
export const NODE_PRUNE_AT = 600
export const MAX_NODE_STATS = 400

export function emptyTrafficSnapshot(): TrafficSnapshot {
  return {
    totalUpload: 0,
    totalDownload: 0,
    kernelUpload: 0,
    kernelDownload: 0,
    nodeStats: {},
    hostStats: {}
  }
}

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export function parseTrafficSnapshot(text: string): TrafficSnapshot | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    const nodeStats: Record<string, TrafficNodeStat> = {}
    if (parsed.nodeStats && typeof parsed.nodeStats === 'object') {
      for (const [name, row] of Object.entries(parsed.nodeStats as Record<string, unknown>)) {
        if (!row || typeof row !== 'object') continue
        const stat = row as Record<string, unknown>
        nodeStats[name] = {
          upload: num(stat.upload),
          download: num(stat.download),
          connections: 0
        }
      }
    }
    const hostStats: Record<string, TrafficHostStat> = {}
    if (parsed.hostStats && typeof parsed.hostStats === 'object') {
      for (const [host, row] of Object.entries(parsed.hostStats as Record<string, unknown>)) {
        if (!row || typeof row !== 'object') continue
        const stat = row as Record<string, unknown>
        hostStats[host] = {
          host: typeof stat.host === 'string' && stat.host ? stat.host : host,
          ip: typeof stat.ip === 'string' ? stat.ip : '',
          upload: num(stat.upload),
          download: num(stat.download),
          rule: typeof stat.rule === 'string' ? stat.rule : '',
          node: typeof stat.node === 'string' ? stat.node : '',
          lastSeen: num(stat.lastSeen)
        }
      }
    }
    return {
      totalUpload: num(parsed.totalUpload),
      totalDownload: num(parsed.totalDownload),
      kernelUpload: num(parsed.kernelUpload),
      kernelDownload: num(parsed.kernelDownload),
      nodeStats,
      hostStats
    }
  } catch {
    return null
  }
}

function keepLargest<T>(rows: T[], limit: number, bytes: (row: T) => number): T[] {
  return [...rows].sort((a, b) => bytes(b) - bytes(a)).slice(0, limit)
}

/** Host names past 1500 keep the 800 largest. Node names past 600 keep the 400 largest. */
export function pruneTrafficSnapshot(snapshot: TrafficSnapshot): boolean {
  let changed = false
  const hosts = Object.values(snapshot.hostStats)
  if (hosts.length > HOST_PRUNE_AT) {
    const kept = keepLargest(hosts, MAX_HOST_STATS, (row) => row.upload + row.download)
    const hostStats: Record<string, TrafficHostStat> = {}
    for (const row of kept) hostStats[row.host] = row
    snapshot.hostStats = hostStats
    changed = true
  }
  const nodes = Object.entries(snapshot.nodeStats)
  if (nodes.length > NODE_PRUNE_AT) {
    const kept = keepLargest(nodes, MAX_NODE_STATS, (row) => row[1].upload + row[1].download)
    const nodeStats: Record<string, TrafficNodeStat> = {}
    for (const [name, row] of kept) nodeStats[name] = row
    snapshot.nodeStats = nodeStats
    changed = true
  }
  return changed
}

/** Bytes added since the last kernel counter. A smaller counter means mihomo restarted. */
export function kernelDelta(previous: number, current: number): number {
  const now = num(current)
  const prev = num(previous)
  if (now >= prev) return now - prev
  return now
}

export function readTrafficSnapshot(file: string): { snapshot: TrafficSnapshot; writable: boolean } {
  try {
    if (!fs.existsSync(file)) return { snapshot: emptyTrafficSnapshot(), writable: true }
    const parsed = parseTrafficSnapshot(fs.readFileSync(file, 'utf-8'))
    if (!parsed) return { snapshot: emptyTrafficSnapshot(), writable: false }
    return { snapshot: parsed, writable: true }
  } catch {
    return { snapshot: emptyTrafficSnapshot(), writable: false }
  }
}

export function writeTrafficSnapshot(file: string, snapshot: TrafficSnapshot): void {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const nodeStats: Record<string, TrafficNodeStat> = {}
  for (const [name, row] of Object.entries(snapshot.nodeStats)) {
    nodeStats[name] = { upload: num(row.upload), download: num(row.download), connections: 0 }
  }
  const body = JSON.stringify({ ...snapshot, nodeStats })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, body)
  fs.renameSync(tmp, file)
}
