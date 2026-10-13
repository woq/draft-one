import React, { useState, useEffect } from 'react'
import {
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  RotateCw,
  Trash2,
  Search,
  Server,
  Globe,
  Radio,
  BarChart3
} from 'lucide-react'
import type { TrafficSummary } from '../types'

interface TrafficProps {
  onNavigateToConnections?: () => void
}

export const Traffic: React.FC<TrafficProps> = ({ onNavigateToConnections }) => {
  const [stats, setStats] = useState<TrafficSummary>({
    totalUpload: 0,
    totalDownload: 0,
    speedUp: 0,
    speedDown: 0,
    nodeStats: {},
    topHosts: []
  })
  const [isManualChecking, setIsManualChecking] = useState(false)
  const [searchHostQuery, setSearchHostQuery] = useState('')
  const [searchNodeQuery, setSearchNodeQuery] = useState('')

  const fetchTraffic = async () => {
    // @ts-ignore
    const data = await window.api?.getTrafficSummary()
    if (data) {
      setStats(data)
    }
  }

  useEffect(() => {
    fetchTraffic()
    // Poll stats every 2 seconds
    const interval = setInterval(fetchTraffic, 2000)
    return () => clearInterval(interval)
  }, [])

  const handleManualCheck = async () => {
    setIsManualChecking(true)
    await fetchTraffic()
    setTimeout(() => setIsManualChecking(false), 500)
  }

  const handleReset = async () => {
    // @ts-ignore
    await window.api?.resetTrafficStats()
    setStats({
      totalUpload: 0,
      totalDownload: 0,
      speedUp: 0,
      speedDown: 0,
      nodeStats: {},
      topHosts: []
    })
    await fetchTraffic()
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

  const allNodes = Object.entries(stats.nodeStats || {}).map(([nodeName, data]) => ({
    name: nodeName,
    upload: data.upload,
    download: data.download,
    total: data.upload + data.download,
    connections: data.connections
  }))
  const isDirectNode = (name: string) => name.toUpperCase() === 'DIRECT'
  const isRejectNode = (name: string) => name.toUpperCase() === 'REJECT'
  const sumNodes = (items: typeof allNodes) =>
    items.reduce(
      (acc, node) => ({
        upload: acc.upload + node.upload,
        download: acc.download + node.download,
        total: acc.total + node.total
      }),
      { upload: 0, download: 0, total: 0 }
    )
  const directSum = sumNodes(allNodes.filter((node) => isDirectNode(node.name)))
  const overseasSum = sumNodes(
    allNodes.filter((node) => !isDirectNode(node.name) && !isRejectNode(node.name))
  )

  const nodeList = allNodes
    .filter((n) => n.name.toLowerCase().includes(searchNodeQuery.toLowerCase()))
    .sort((a, b) => b.total - a.total)

  // Max node traffic for percentage bar
  const maxNodeTotal = Math.max(...nodeList.map((n) => n.total), 1)

  const [hostFilter, setHostFilter] = useState<'ALL' | 'OVERSEAS' | 'DIRECT'>('ALL')

  const isDirectHost = (h: { rule?: string; node?: string }) => {
    const node = (h.node || '').toUpperCase()
    const rule = (h.rule || '').toUpperCase()
    if (node === 'DIRECT') return true
    if (rule.includes('DIRECT') || rule.includes('LAN') || rule.includes('CN') || rule.includes('NCSI')) return true
    return false
  }

  const isRejectHost = (h: { rule?: string; node?: string }) => {
    const node = (h.node || '').toUpperCase()
    const rule = (h.rule || '').toUpperCase()
    return node === 'REJECT' || rule.includes('REJECT') || rule.includes('ANTI-AD')
  }

  const isOverseasHost = (h: { rule?: string; node?: string }) => !isDirectHost(h) && !isRejectHost(h)

  const allTopHosts = stats.topHosts || []
  const directHostsList = allTopHosts.filter(isDirectHost)
  const overseasHostsList = allTopHosts.filter(isOverseasHost)

  const sumHostList = (items: typeof allTopHosts) =>
    items.reduce(
      (acc, h) => ({
        upload: acc.upload + h.upload,
        download: acc.download + h.download,
        total: acc.upload + h.download
      }),
      { upload: 0, download: 0, total: 0 }
    )

  const directHostSum = sumHostList(directHostsList)
  const overseasHostSum = sumHostList(overseasHostsList)

  // Filtered hosts
  const hostQuery = searchHostQuery.toLowerCase()
  const hostList = allTopHosts.filter((h) => {
    if (hostFilter === 'DIRECT' && !isDirectHost(h)) return false
    if (hostFilter === 'OVERSEAS' && !isOverseasHost(h)) return false
    if (!hostQuery) return true
    const host = (h.host || '').toLowerCase()
    const ip = (h.ip || '').toLowerCase()
    const node = (h.node || '').toLowerCase()
    const rule = (h.rule || '').toLowerCase()
    return host.includes(hostQuery) || ip.includes(hostQuery) || node.includes(hostQuery) || rule.includes(hostQuery)
  })

  const maxHostTotal = Math.max(...hostList.map((h) => h.upload + h.download), 1)

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-fx-accent" />
            <h2 className="text-lg font-bold text-fx-text">流量统计与数据分析</h2>
          </div>
          <p className="text-xs text-fx-muted mt-1">
            监控全局总流量、各代理节点消耗明细以及访问域名/目标 IP 的流量排行。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleManualCheck}
            disabled={isManualChecking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg fx-btn transition"
            title="手动刷新流量与连接"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isManualChecking ? 'animate-spin' : ''}`} />
            <span>手动检查</span>
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-rose-950/40 text-xs text-fx-muted hover:text-rose-400 hover:border-rose-900/50 transition"
            title="清空当前累计流量计数"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>重置统计</span>
          </button>
        </div>
      </div>

      {/* Global Total Traffic Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Download */}
        <div className="p-4 rounded-2xl fx-panel space-y-2">
          <div className="flex items-center justify-between text-xs text-fx-muted">
            <span>总下行流量 (Download)</span>
            <ArrowDownCircle className="w-4 h-4 text-fx-accent" />
          </div>
          <div className="text-2xl font-extrabold text-fx-text font-mono">
            {formatBytes(stats.totalDownload)}
          </div>
          <div className="text-[11px] text-fx-muted font-mono">
            实时下行: <span className="text-fx-accent font-semibold">{formatSpeed(stats.speedDown)}</span>
          </div>
        </div>

        {/* Total Upload */}
        <div className="p-4 rounded-2xl fx-panel space-y-2">
          <div className="flex items-center justify-between text-xs text-fx-muted">
            <span>总上行流量 (Upload)</span>
            <ArrowUpCircle className="w-4 h-4 text-fx-accent" />
          </div>
          <div className="text-2xl font-extrabold text-fx-text font-mono">
            {formatBytes(stats.totalUpload)}
          </div>
          <div className="text-[11px] text-fx-muted font-mono">
            实时上行: <span className="text-fx-accent font-semibold">{formatSpeed(stats.speedUp)}</span>
          </div>
        </div>

        {/* Total Bandwidth */}
        <div className="p-4 rounded-2xl fx-panel space-y-2">
          <div className="flex items-center justify-between text-xs text-fx-muted">
            <span>总消耗流量合计</span>
            <BarChart3 className="w-4 h-4 text-fx-accent" />
          </div>
          <div className="text-2xl font-extrabold text-fx-text font-mono">
            {formatBytes(stats.totalDownload + stats.totalUpload)}
          </div>
          <div className="text-[11px] text-fx-muted">双向累计带宽消耗</div>
        </div>

        {/* Active Connections */}
        <div
          onClick={onNavigateToConnections}
          className={`p-4 rounded-2xl fx-panel space-y-2 transition ${ onNavigateToConnections ? 'hover:bg-fx-surface cursor-pointer' : '' }`}
          title={onNavigateToConnections ? '点击跳转至实时连接管理' : undefined}
        >
          <div className="flex items-center justify-between text-xs text-fx-muted">
            <span>当前活跃连接</span>
            <Radio className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-fx-text font-mono">
            {Object.values(stats.nodeStats || {}).reduce((acc, cur) => acc + (cur.connections || 0), 0)}
          </div>
          <div className="text-[11px] text-fx-muted flex items-center justify-between">
            <span>TCP / UDP 会话</span>
            {onNavigateToConnections && (
              <span className="text-amber-400/90 text-[10px] hover:underline">
                管理连接 →
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Node Traffic Breakdown Table */}
      <div className="p-5 rounded-2xl fx-panel space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-fx-accent" />
            <h3 className="text-sm font-bold text-fx-text">单节点流量消耗明细</h3>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-fx-muted" />
            <input
              type="text"
              placeholder="过滤节点名称..."
              value={searchNodeQuery}
              onChange={(e) => setSearchNodeQuery(e.target.value)}
              className="pl-8 pr-3 py-1 bg-fx-bg rounded-lg text-xs text-fx-text placeholder:text-fx-muted focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-fx-bg border space-y-1">
            <div className="text-[11px] text-fx-accent font-semibold">国内直连</div>
            <div className="text-lg font-bold text-fx-text font-mono">{formatBytes(directSum.total)}</div>
            <div className="text-[11px] font-mono text-fx-muted">
              <span className="text-fx-accent">↑ {formatBytes(directSum.upload)}</span>
              <span className="mx-2 text-fx-muted">·</span>
              <span className="text-fx-accent">↓ {formatBytes(directSum.download)}</span>
            </div>
            <div className="text-[11px] text-fx-muted">DIRECT，含局域网和大陆域名、大陆 IP</div>
          </div>
          <div className="p-3.5 rounded-xl bg-fx-bg border space-y-1">
            <div className="text-[11px] text-fx-accent font-semibold">海外代理</div>
            <div className="text-lg font-bold text-fx-text font-mono">{formatBytes(overseasSum.total)}</div>
            <div className="text-[11px] font-mono text-fx-muted">
              <span className="text-fx-accent">↑ {formatBytes(overseasSum.upload)}</span>
              <span className="mx-2 text-fx-muted">·</span>
              <span className="text-fx-accent">↓ {formatBytes(overseasSum.download)}</span>
            </div>
            <div className="text-[11px] text-fx-muted">除 DIRECT 以外的节点流量合计</div>
          </div>
        </div>

        {nodeList.length === 0 ? (
          <div className="p-8 text-center text-xs text-fx-muted">
            暂无节点流量数据，当有网络请求经由节点转发时将实时呈现在此。
          </div>
        ) : (
          <div className="space-y-2">
            {nodeList.map((node) => {
              const percentage = Math.min(100, Math.round((node.total / maxNodeTotal) * 100))
              return (
                <div
                  key={node.name}
                  className="p-3.5 rounded-xl bg-fx-surface space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-fx-text">{node.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full border ${ isDirectNode(node.name) ? 'bg-fx-accent-dim text-fx-accent ' : isRejectNode(node.name) ? 'bg-fx-surface text-fx-muted ' : 'bg-fx-accent-dim text-fx-accent' }`}
                      >
                        {isDirectNode(node.name) ? '国内直连' : isRejectNode(node.name) ? '拦截' : '海外'}
                      </span>
                      {node.connections > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-fx-accent-dim text-fx-accent">
                          {node.connections} 连接活跃
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 font-mono text-[11px]">
                      <span className="text-fx-accent">↑ {formatBytes(node.upload)}</span>
                      <span className="text-fx-accent">↓ {formatBytes(node.download)}</span>
                      <span className="font-bold text-fx-text">{formatBytes(node.total)}</span>
                    </div>
                  </div>
                  {/* Traffic share bar */}
                  <div className="w-full h-1.5 bg-fx-surface rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-400 rounded-full transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Host / Destination IP Traffic Breakdown Table */}
      <div className="p-5 rounded-2xl fx-panel space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-fx-accent" />
            <h3 className="text-sm font-bold text-fx-text">域名 / 目标 IP 消耗流量排行 (Top 50)</h3>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Filter Tabs */}
            <div className="flex rounded-lg bg-fx-bg p-0.5">
              <button
                onClick={() => setHostFilter('ALL')}
                className={`px-2.5 py-1 rounded-md transition text-[11px] font-medium ${ hostFilter === 'ALL' ? 'bg-sky-500/30 text-fx-accent font-semibold' : 'text-fx-muted hover:text-fx-text' }`}
              >
                全部 ({allTopHosts.length})
              </button>
              <button
                onClick={() => setHostFilter('OVERSEAS')}
                className={`px-2.5 py-1 rounded-md transition text-[11px] font-medium ${ hostFilter === 'OVERSEAS' ? 'bg-sky-500/30 text-fx-accent font-semibold' : 'text-fx-muted hover:text-fx-text' }`}
              >
                海外代理 ({overseasHostsList.length})
              </button>
              <button
                onClick={() => setHostFilter('DIRECT')}
                className={`px-2.5 py-1 rounded-md transition text-[11px] font-medium ${ hostFilter === 'DIRECT' ? 'bg-fx-accent-dim text-fx-accent font-semibold' : 'text-fx-muted hover:text-fx-text' }`}
              >
                国内直连 ({directHostsList.length})
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-fx-muted" />
              <input
                type="text"
                placeholder="搜索域名、IP或节点..."
                value={searchHostQuery}
                onChange={(e) => setSearchHostQuery(e.target.value)}
                className="pl-8 pr-3 py-1 bg-fx-bg rounded-lg text-xs text-fx-text placeholder:text-fx-muted focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
              />
            </div>
          </div>
        </div>

        {/* Domain Direct vs Overseas Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl bg-fx-bg border space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-fx-accent font-semibold">国内直连域名 / 目标</div>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-fx-accent-dim text-fx-accent font-mono">
                {directHostsList.length} 个目标
              </span>
            </div>
            <div className="text-lg font-bold text-fx-text font-mono">{formatBytes(directHostSum.total)}</div>
            <div className="text-[11px] font-mono text-fx-muted">
              <span className="text-fx-accent">↑ {formatBytes(directHostSum.upload)}</span>
              <span className="mx-2 text-fx-muted">·</span>
              <span className="text-fx-accent">↓ {formatBytes(directHostSum.download)}</span>
            </div>
            <div className="text-[11px] text-fx-muted">直连名单、大陆网站、局域网访问流量</div>
          </div>
          <div className="p-3.5 rounded-xl bg-fx-bg border space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-fx-accent font-semibold">海外代理域名 / 目标</div>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-fx-accent-dim text-fx-accent font-mono">
                {overseasHostsList.length} 个目标
              </span>
            </div>
            <div className="text-lg font-bold text-fx-text font-mono">{formatBytes(overseasHostSum.total)}</div>
            <div className="text-[11px] font-mono text-fx-muted">
              <span className="text-fx-accent">↑ {formatBytes(overseasHostSum.upload)}</span>
              <span className="mx-2 text-fx-muted">·</span>
              <span className="text-fx-accent">↓ {formatBytes(overseasHostSum.download)}</span>
            </div>
            <div className="text-[11px] text-fx-muted">经由海外代理节点转发访问的网站与服务</div>
          </div>
        </div>

        {hostList.length === 0 ? (
          <div className="p-8 text-center text-xs text-fx-muted">
            暂无匹配的域名流量统计，发起网络请求后自动记录。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-fx-muted font-medium">
                  <th className="pb-2.5 font-semibold">目标域名 / IP</th>
                  <th className="pb-2.5 font-semibold">出站类型</th>
                  <th className="pb-2.5 font-semibold">命中规则</th>
                  <th className="pb-2.5 font-semibold text-right">上行</th>
                  <th className="pb-2.5 font-semibold text-right">下行</th>
                  <th className="pb-2.5 font-semibold text-right">总流量</th>
                </tr>
              </thead>
              <tbody className="">
                {hostList.map((item) => {
                  const total = item.upload + item.download
                  const pct = Math.min(100, Math.round((total / maxHostTotal) * 100))
                  const isDirect = isDirectHost(item)
                  const isReject = isRejectHost(item)

                  return (
                    <tr key={item.host} className="fx-row transition">
                      <td className="py-2.5 pr-4">
                        <div className="font-semibold text-fx-text font-mono">{item.host}</div>
                        {item.ip && item.ip !== item.host && (
                          <div className="text-[11px] text-fx-muted font-mono">{item.ip}</div>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${ isDirect ? 'bg-fx-accent-dim text-fx-accent ' : isReject ? 'bg-rose-500/10 text-rose-300 ' : 'bg-fx-accent-dim text-fx-accent' }`}
                        >
                          {isDirect
                            ? '国内直连'
                            : isReject
                              ? '拦截'
                              : item.node
                                ? `海外 · ${item.node}`
                                : '海外代理'}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-fx-surface text-fx-text/90 inline-block max-w-[160px] truncate" title={item.rule}>
                          {item.rule}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-fx-accent">
                        {formatBytes(item.upload)}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-fx-accent">
                        {formatBytes(item.download)}
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-fx-text">
                        <div>{formatBytes(total)}</div>
                        <div className="w-16 h-1 bg-fx-surface rounded-full ml-auto mt-1 overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
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
