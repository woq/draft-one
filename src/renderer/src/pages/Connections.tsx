import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Radio,
  ArrowDownCircle,
  ArrowUpCircle,
  RotateCw,
  Trash2,
  Search,
  Play,
  Pause,
  Filter,
  Clock,
  Terminal,
  CheckCircle2
} from 'lucide-react'
import type { ConnectionsSnapshot } from '../types'

interface ConnectionsProps {
  onNavigateToTraffic?: () => void
}

export const Connections: React.FC<ConnectionsProps> = ({ onNavigateToTraffic }) => {
  const [snapshot, setSnapshot] = useState<ConnectionsSnapshot>({
    downloadTotal: 0,
    uploadTotal: 0,
    connections: []
  })
  const [isAutoRefresh, setIsAutoRefresh] = useState(true)
  const [isManualChecking, setIsManualChecking] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [protocolFilter, setProtocolFilter] = useState<'ALL' | 'TCP' | 'UDP'>('ALL')
  const [outboundFilter, setOutboundFilter] = useState<'ALL' | 'PROXY' | 'DIRECT' | 'REJECT'>('ALL')
  const [sortBy, setSortBy] = useState<'speed' | 'traffic' | 'time'>('traffic')
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set())
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  const noticeTimerRef = useRef<NodeJS.Timeout | null>(null)

  const showNotice = (msg: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    setActionNotice(msg)
    noticeTimerRef.current = setTimeout(() => {
      setActionNotice(null)
    }, 2500)
  }

  const fetchConnections = async () => {
    try {
      // @ts-ignore
      const res = await window.api?.getConnections()
      if (res && Array.isArray(res.connections)) {
        setSnapshot(res)
      }
    } catch (err) {
      console.error('Failed to fetch connections:', err)
    }
  }

  useEffect(() => {
    fetchConnections()
    if (!isAutoRefresh) return

    const interval = setInterval(fetchConnections, 1200)
    return () => clearInterval(interval)
  }, [isAutoRefresh])

  const handleManualCheck = async () => {
    setIsManualChecking(true)
    await fetchConnections()
    setTimeout(() => setIsManualChecking(false), 400)
  }

  const handleCloseOne = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setClosingIds((prev) => new Set(prev).add(id))
    try {
      // @ts-ignore
      const ok = await window.api?.closeConnection(id)
      if (ok) {
        setSnapshot((prev) => ({
          ...prev,
          connections: prev.connections.filter((c) => c.id !== id)
        }))
        showNotice('已成功掐断选定连接')
      }
    } catch {
      showNotice('断开连接失败')
    } finally {
      setClosingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleCloseAll = async () => {
    if (snapshot.connections.length === 0) return
    const confirmed = window.confirm(`确定要强制中断当前全部 ${snapshot.connections.length} 个活跃连接吗？`)
    if (!confirmed) return

    try {
      // @ts-ignore
      const ok = await window.api?.closeAllConnections()
      if (ok) {
        setSnapshot((prev) => ({ ...prev, connections: [] }))
        showNotice('已断开所有活跃网络连接')
      }
    } catch {
      showNotice('断开全部连接失败')
    }
  }

  const formatBytes = (bytes = 0) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
  }

  const formatSpeed = (bytesPerSec = 0) => {
    return `${formatBytes(bytesPerSec)}/s`
  }

  const formatDuration = (startTime: string) => {
    try {
      const diffSec = Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000))
      if (diffSec < 60) return `${diffSec}s`
      if (diffSec < 3600) {
        const m = Math.floor(diffSec / 60)
        const s = diffSec % 60
        return `${m}m ${s}s`
      }
      const h = Math.floor(diffSec / 3600)
      const m = Math.floor((diffSec % 3600) / 60)
      return `${h}h ${m}m`
    } catch {
      return '--'
    }
  }

  // Filter and sort connections
  const filteredConnections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    return snapshot.connections
      .filter((conn) => {
        // Protocol filter
        if (protocolFilter !== 'ALL' && conn.metadata.network !== protocolFilter) {
          return false
        }

        // Outbound filter
        if (outboundFilter !== 'ALL') {
          const isDirect = conn.actualNode.toUpperCase() === 'DIRECT'
          const isReject = conn.actualNode.toUpperCase() === 'REJECT'
          if (outboundFilter === 'DIRECT' && !isDirect) return false
          if (outboundFilter === 'REJECT' && !isReject) return false
          if (outboundFilter === 'PROXY' && (isDirect || isReject)) return false
        }

        // Search query
        if (!q) return true
        const host = (conn.metadata.host || '').toLowerCase()
        const dstIp = (conn.metadata.destinationIP || '').toLowerCase()
        const srcIp = (conn.metadata.sourceIP || '').toLowerCase()
        const proc = (conn.metadata.process || '').toLowerCase()
        const procPath = (conn.metadata.processPath || '').toLowerCase()
        const rule = (conn.rule || '').toLowerCase()
        const node = (conn.actualNode || '').toLowerCase()

        return (
          host.includes(q) ||
          dstIp.includes(q) ||
          srcIp.includes(q) ||
          proc.includes(q) ||
          procPath.includes(q) ||
          rule.includes(q) ||
          node.includes(q)
        )
      })
      .sort((a, b) => {
        if (sortBy === 'speed') {
          return b.speedDown + b.speedUp - (a.speedDown + a.speedUp)
        }
        if (sortBy === 'traffic') {
          return b.download + b.upload - (a.download + a.upload)
        }
        // Time: newer first
        return new Date(b.start).getTime() - new Date(a.start).getTime()
      })
  }, [snapshot.connections, searchQuery, protocolFilter, outboundFilter, sortBy])

  // Total live speeds
  const totalLiveDown = snapshot.connections.reduce((acc, c) => acc + (c.speedDown || 0), 0)
  const totalLiveUp = snapshot.connections.reduce((acc, c) => acc + (c.speedUp || 0), 0)

  return (
    <div className="space-y-5">
      {/* Action Notification Banner */}
      {actionNotice && (
        <div className="px-4 py-2.5 rounded-xl bg-fx-accent-dim border text-fx-accent text-xs flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-fx-accent" />
            <span>{actionNotice}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="p-1 hover:bg-fx-accent-dim rounded text-fx-accent"
          >
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-fx-accent" />
            <h2 className="text-lg font-bold text-fx-text">实时连接管理</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-fx-accent-dim text-fx-accent font-mono font-medium">
              {snapshot.connections.length} 活跃
            </span>
          </div>
          <p className="text-xs text-fx-muted mt-1">
            监控当前由内核代理转发的 TCP / UDP 会话，提供进程级追踪、分流审计与连接阻断。
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${ isAutoRefresh ? 'bg-emerald-500/15 text-fx-accent hover:bg-emerald-500/25' : 'bg-fx-surface text-fx-muted hover:text-fx-text' }`}
            title={isAutoRefresh ? '暂停自动刷新' : '恢复自动刷新'}
          >
            {isAutoRefresh ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isAutoRefresh ? '正在刷新' : '已暂停'}</span>
          </button>

          <button
            onClick={handleManualCheck}
            disabled={isManualChecking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg fx-btn transition"
            title="手动刷新连接快照"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isManualChecking ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </button>

          <button
            onClick={handleCloseAll}
            disabled={snapshot.connections.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-medium transition disabled:opacity-40 disabled:pointer-events-none"
            title="掐断全部当前活跃连接"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>断开全部</span>
          </button>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Session Count */}
        <div className="p-4 rounded-2xl fx-panel space-y-1.5">
          <div className="flex items-center justify-between text-xs text-fx-muted">
            <span>当前活跃会话</span>
            <Radio className="w-4 h-4 text-fx-accent" />
          </div>
          <div className="text-2xl font-extrabold text-fx-text font-mono">
            {snapshot.connections.length}
          </div>
          <div className="text-[11px] text-fx-muted flex items-center justify-between">
            <span>TCP / UDP 活跃套接字</span>
            {onNavigateToTraffic && (
              <button
                onClick={onNavigateToTraffic}
                className="text-fx-accent hover:underline cursor-pointer"
              >
                查看累计流量 →
              </button>
            )}
          </div>
        </div>

        {/* Live Download Speed */}
        <div className="p-4 rounded-2xl fx-panel space-y-1.5">
          <div className="flex items-center justify-between text-xs text-fx-muted">
            <span>实时下行速率</span>
            <ArrowDownCircle className="w-4 h-4 text-fx-accent" />
          </div>
          <div className="text-2xl font-extrabold text-fx-accent font-mono">
            {formatSpeed(totalLiveDown)}
          </div>
          <div className="text-[11px] text-fx-muted font-mono">
            内核累计: {formatBytes(snapshot.downloadTotal)}
          </div>
        </div>

        {/* Live Upload Speed */}
        <div className="p-4 rounded-2xl fx-panel space-y-1.5">
          <div className="flex items-center justify-between text-xs text-fx-muted">
            <span>实时上行速率</span>
            <ArrowUpCircle className="w-4 h-4 text-fx-accent" />
          </div>
          <div className="text-2xl font-extrabold text-fx-accent font-mono">
            {formatSpeed(totalLiveUp)}
          </div>
          <div className="text-[11px] text-fx-muted font-mono">
            内核累计: {formatBytes(snapshot.uploadTotal)}
          </div>
        </div>

        {/* Filtered Count */}
        <div className="p-4 rounded-2xl fx-panel space-y-1.5">
          <div className="flex items-center justify-between text-xs text-fx-muted">
            <span>匹配筛选数量</span>
            <Filter className="w-4 h-4 text-fx-accent" />
          </div>
          <div className="text-2xl font-extrabold text-fx-accent font-mono">
            {filteredConnections.length} / {snapshot.connections.length}
          </div>
          <div className="text-[11px] text-fx-muted">
            当前列表可见会话条数
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-fx-elevated flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fx-muted" />
          <input
            type="text"
            placeholder="搜索目标域名、IP、进程名 (如 chrome.exe)、规则..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 bg-fx-bg rounded-xl text-xs text-fx-text placeholder:text-fx-muted focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fx-muted hover:text-fx-text/90"
            >
              ×
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Protocol filter */}
          <div className="flex rounded-lg bg-fx-bg p-0.5">
            {(['ALL', 'TCP', 'UDP'] as const).map((proto) => (
              <button
                key={proto}
                onClick={() => setProtocolFilter(proto)}
                className={`px-2.5 py-1 rounded-md transition text-[11px] font-medium ${ protocolFilter === proto ? 'bg-sky-500/30 text-fx-accent font-semibold' : 'text-fx-muted hover:text-fx-text' }`}
              >
                {proto === 'ALL' ? '全部协议' : proto}
              </button>
            ))}
          </div>

          {/* Outbound filter */}
          <div className="flex rounded-lg bg-fx-bg p-0.5">
            {(['ALL', 'PROXY', 'DIRECT', 'REJECT'] as const).map((ob) => (
              <button
                key={ob}
                onClick={() => setOutboundFilter(ob)}
                className={`px-2 py-1 rounded-md transition text-[11px] font-medium ${ outboundFilter === ob ? 'bg-fx-accent-dim text-fx-accent font-semibold' : 'text-fx-muted hover:text-fx-text' }`}
              >
                {ob === 'ALL' ? '全部出站' : ob === 'PROXY' ? '海外' : ob === 'DIRECT' ? '直连' : '拦截'}
              </button>
            ))}
          </div>


          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-2.5 py-1 rounded-lg bg-fx-bg text-[11px] text-fx-text/90 focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
          >
            <option value="traffic">按流量排序</option>
            <option value="speed">按实时速度</option>
            <option value="time">按建立时间</option>
          </select>
        </div>
      </div>

      {/* Connections List / Table */}
      <div className="p-5 rounded-2xl fx-panel">
        {filteredConnections.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Radio className="w-8 h-8 mx-auto text-fx-muted" />
            <div className="text-sm font-semibold text-fx-muted">
              {snapshot.connections.length === 0 ? '当前暂无活跃连接' : '无符合当前筛选条件的连接'}
            </div>
            <p className="text-xs text-fx-muted max-w-sm mx-auto">
              {snapshot.connections.length === 0
                ? '当系统或应用通过系统代理/TUN模式发起网络通信时，活跃连接会实时呈现在此。'
                : '请尝试清空搜索关键字或重置协议/出站筛选选项。'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="text-fx-muted font-medium select-none">
                  <th className="pb-3 font-semibold pl-2">目标主机 / 目的端点</th>
                  <th className="pb-3 font-semibold">发起进程</th>
                  <th className="pb-3 font-semibold">命中规则</th>
                  <th className="pb-3 font-semibold">出站链路</th>
                  <th className="pb-3 font-semibold text-right">实时速率</th>
                  <th className="pb-3 font-semibold text-right">总流量</th>
                  <th className="pb-3 font-semibold text-center">时长</th>
                  <th className="pb-3 font-semibold text-right pr-2">操作</th>
                </tr>
              </thead>
              <tbody className="">
                {filteredConnections.map((conn) => {
                  const isClosing = closingIds.has(conn.id)
                  const isDirect = conn.actualNode.toUpperCase() === 'DIRECT'
                  const isReject = conn.actualNode.toUpperCase() === 'REJECT'
                  const isTcp = conn.metadata.network === 'TCP'

                  return (
                    <tr key={conn.id} className="fx-row group">
                      {/* Host & Destination */}
                      <td className="py-3 pl-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                              isTcp
                                ? 'bg-fx-accent-dim text-fx-accent'
                                : 'bg-amber-500/10 text-amber-400'
                            }`}
                          >
                            {conn.metadata.network}
                          </span>
                          <span
                            className="font-mono font-bold text-fx-text truncate max-w-[220px]"
                            title={conn.metadata.host}
                          >
                            {conn.metadata.host}
                          </span>
                        </div>
                        <div
                          className="text-[11px] text-fx-muted font-mono mt-0.5 pl-8"
                          title={`${conn.metadata.destinationIP}:${conn.metadata.destinationPort}`}
                        >
                          {conn.metadata.destinationIP}
                          {conn.metadata.destinationPort ? `:${conn.metadata.destinationPort}` : ''}
                        </div>
                      </td>

                      {/* Process Info */}
                      <td className="py-3 pr-4">
                        {conn.metadata.process ? (
                          <div
                            className="flex items-center gap-1.5 font-mono text-[11px] text-fx-text/90 max-w-[140px] truncate"
                            title={conn.metadata.processPath || conn.metadata.process}
                          >
                            <Terminal className="w-3.5 h-3.5 text-fx-accent shrink-0" />
                            <span className="truncate">{conn.metadata.process}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-fx-muted font-mono">--</span>
                        )}
                      </td>

                      {/* Rule */}
                      <td className="py-3 pr-4">
                        <span
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-fx-surface/90 text-fx-text/90 inline-block max-w-[130px] truncate"
                          title={`${conn.rule}${conn.rulePayload ? ` (${conn.rulePayload})` : ''}`}
                        >
                          {conn.rule}
                        </span>
                      </td>

                      {/* Outbound Chains */}
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${ isDirect ? 'bg-fx-accent-dim text-fx-accent ' : isReject ? 'bg-rose-500/10 text-rose-300 ' : 'bg-fx-accent-dim text-fx-accent' }`}
                          >
                            {conn.actualNode}
                          </span>
                        </div>
                        {conn.chains && conn.chains.length > 1 && (
                          <div className="text-[10px] text-fx-muted font-mono mt-0.5 truncate max-w-[130px]">
                            {conn.chains.join(' → ')}
                          </div>
                        )}
                      </td>

                      {/* Live Speed */}
                      <td className="py-3 pr-4 text-right font-mono">
                        <div className="text-[11px] text-fx-accent font-medium">
                          ↓ {formatSpeed(conn.speedDown)}
                        </div>
                        <div className="text-[10px] text-fx-accent">
                          ↑ {formatSpeed(conn.speedUp)}
                        </div>
                      </td>

                      {/* Cumulative Traffic */}
                      <td className="py-3 pr-4 text-right font-mono">
                        <div className="text-[11px] font-bold text-fx-text">
                          {formatBytes(conn.download + conn.upload)}
                        </div>
                        <div className="text-[10px] text-fx-muted">
                          ↓{formatBytes(conn.download)} · ↑{formatBytes(conn.upload)}
                        </div>
                      </td>

                      {/* Connected Duration */}
                      <td className="py-3 px-2 text-center font-mono text-[11px] text-fx-muted">
                        <div className="flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3 text-fx-muted" />
                          <span>{formatDuration(conn.start)}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 pr-2 text-right">
                        <button
                          onClick={(e) => handleCloseOne(conn.id, e)}
                          disabled={isClosing}
                          className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 hover:text-rose-300 text-[11px] font-medium transition disabled:opacity-50"
                          title="掐断此连接"
                        >
                          {isClosing ? '断开中...' : '断开'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
