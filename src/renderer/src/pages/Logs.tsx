import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Terminal,
  Trash2,
  Copy,
  Search,
  ArrowDown,
  ArrowUp,
  ArrowDownUp,
  Pause,
  Play,
  Check,
  Zap,
  Globe2,
  Cpu,
  AlertTriangle,
  Layers
} from 'lucide-react'
import type { LogItem, LogCategory } from '../types'

export const Logs: React.FC = () => {
  const [logs, setLogs] = useState<LogItem[]>([])
  // Default to 'all' to ensure kernel boot and diagnostic logs are immediately visible
  const [activeCategory, setActiveCategory] = useState<LogCategory | 'all'>('all')
  const [routingFilter, setRoutingFilter] = useState<'all' | 'proxy' | 'direct' | 'reject'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [copied, setCopied] = useState(false)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 1. Fetch initial historical buffer logs
    const fetchHistory = async () => {
      // @ts-ignore
      const history = await window.api?.getLogHistory()
      if (Array.isArray(history) && history.length > 0) {
        setLogs(history)
      }
    }
    fetchHistory()

    // 2. Poll every 2 seconds to guarantee continuous sync
    const timer = setInterval(fetchHistory, 2000)

    // 3. Real-time push: merge incoming log
    // @ts-ignore
    const unsubscribe = window.api?.onNewLog((item: LogItem) => {
      setLogs((prev) => {
        if (prev.some((p) => p.id === item.id)) return prev
        const next = [item, ...prev]
        return next.length > 2000 ? next.slice(0, 2000) : next
      })
    })

    return () => {
      clearInterval(timer)
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [])

  // Dynamic category counts
  const counts = useMemo(() => {
    let routing = 0
    let dns = 0
    let system = 0
    let error = 0

    for (const log of logs) {
      const cat =
        log.category ||
        (log.type === 'error' || log.type === 'warning'
          ? 'error'
          : log.payload.startsWith('[DNS]') ||
            log.payload.includes('/dns-query') ||
            log.payload.includes('DNS server(') ||
            /:53(?:\s+|$|,|-->|using)/.test(log.payload) ||
            /(?:\[UDP\]|UDP).*?:53\b/i.test(log.payload) ||
            /(?:\[TCP\]|TCP).*?:53\b/i.test(log.payload)
          ? 'dns'
          : log.payload.includes('-->') && log.payload.includes('using')
          ? 'routing'
          : 'system')

      if (cat === 'routing') routing++
      else if (cat === 'dns') dns++
      else if (cat === 'error') error++
      else system++
    }

    return {
      all: logs.length,
      routing,
      dns,
      system,
      error
    }
  }, [logs])

  // Filter logs by Category, Routing Sub-filter and Search query
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const cat: LogCategory =
        log.category ||
        (log.type === 'error' || log.type === 'warning'
          ? 'error'
          : log.payload.startsWith('[DNS]') ||
            log.payload.includes('/dns-query') ||
            log.payload.includes('DNS server(') ||
            /:53(?:\s+|$|,|-->|using)/.test(log.payload) ||
            /(?:\[UDP\]|UDP).*?:53\b/i.test(log.payload) ||
            /(?:\[TCP\]|TCP).*?:53\b/i.test(log.payload)
          ? 'dns'
          : log.payload.includes('-->') && log.payload.includes('using')
          ? 'routing'
          : 'system')

      if (activeCategory !== 'all' && cat !== activeCategory) {
        return false
      }

      // If on 'routing' tab, apply sub-filter (proxy vs direct vs reject)
      if (activeCategory === 'routing' && routingFilter !== 'all') {
        const outbound = (log.routing?.outbound || log.payload).toUpperCase()
        if (routingFilter === 'direct' && !outbound.includes('DIRECT')) return false
        if (routingFilter === 'reject' && !outbound.includes('REJECT')) return false
        if (
          routingFilter === 'proxy' &&
          (outbound.includes('DIRECT') || outbound.includes('REJECT'))
        ) {
          return false
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          log.payload.toLowerCase().includes(q) ||
          log.routing?.target?.toLowerCase().includes(q) ||
          log.routing?.outbound?.toLowerCase().includes(q) ||
          log.routing?.rule?.toLowerCase().includes(q)
        )
      }

      return true
    })
  }, [logs, activeCategory, routingFilter, searchQuery])

  // Sort logs by sequence / timestamp: 'desc' = newest first, 'asc' = oldest first
  const displayLogs = useMemo(() => {
    const list = [...filteredLogs]
    list.sort((a, b) => {
      if (a.seq !== undefined && b.seq !== undefined) {
        return sortOrder === 'desc' ? b.seq - a.seq : a.seq - b.seq
      }
      if (a.timestamp !== undefined && b.timestamp !== undefined) {
        return sortOrder === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp
      }
      const aTime = parseInt(a.id.split('-')[0]) || 0
      const bTime = parseInt(b.id.split('-')[0]) || 0
      if (aTime && bTime && aTime !== bTime) {
        return sortOrder === 'desc' ? bTime - aTime : aTime - bTime
      }
      return 0
    })
    return list
  }, [filteredLogs, sortOrder])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      if (sortOrder === 'desc') {
        scrollRef.current.scrollTop = 0
      } else {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }
  }, [displayLogs, autoScroll, sortOrder])

  const handleClear = async () => {
    // @ts-ignore
    await window.api?.clearLogHistory()
    setLogs([])
  }

  const handleCopyLogs = () => {
    const text = displayLogs
      .map((l) => `[${l.time}] [${(l.type || 'INFO').toUpperCase()}] ${l.payload}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getLevelBadge = (type: string) => {
    const t = (type || 'info').toLowerCase()
    if (t === 'error') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400">
          ERROR
        </span>
      )
    }
    if (t === 'warning' || t === 'warn') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400">
          WARN
        </span>
      )
    }
    if (t === 'debug') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-fx-muted/10 text-fx-muted">
          DEBUG
        </span>
      )
    }
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-fx-accent-dim text-fx-accent">
        INFO
      </span>
    )
  }

  // Parse routing info on the fly if backend object missing
  const getRoutingDetails = (log: LogItem) => {
    if (log.routing) return log.routing
    const match = log.payload.match(
      /(?:\[(TCP|UDP)\]\s+)?(\S+)\s+-->\s+(\S+)(?:\s+match\s+(\S+))?\s+using\s+(.+)/i
    )
    if (match) {
      return {
        protocol: (match[1] ? match[1].toUpperCase() : 'TCP') as 'TCP' | 'UDP',
        source: match[2],
        target: match[3],
        rule: match[4] || 'Direct/Match',
        outbound: match[5].trim()
      }
    }
    return null
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto h-[calc(100vh-6.5rem)] flex flex-col">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-fx-accent" />
            <h2 className="text-lg font-bold text-fx-text">实时内核日志</h2>
          </div>
          <p className="text-xs text-fx-muted mt-0.5">
            默认显示全部日志。分流命中、DNS、内核信息和异常可以分开看。
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Order Toggle */}
          <button
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-fx-surface-hover text-xs font-semibold text-fx-text transition"
            title="切换日志排序方向"
          >
            <ArrowDownUp className="w-3.5 h-3.5 text-fx-accent" />
            <span>{sortOrder === 'desc' ? '倒序 (最新在最上)' : '正序 (从旧到新)'}</span>
          </button>

          {/* Auto Scroll Toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${ autoScroll ? 'bg-sky-500/15 text-fx-accent' : 'bg-fx-surface hover:bg-fx-surface-hover text-fx-text/90 ' }`}
          >
            {autoScroll ? (
              <Pause className="w-3.5 h-3.5 text-fx-accent" />
            ) : (
              <Play className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>{autoScroll ? '暂停跟随' : '自动跟随'}</span>
          </button>

          <button
            onClick={handleCopyLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-fx-surface-hover text-xs font-semibold text-fx-text transition"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-fx-accent" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? '已复制' : '复制可见'}</span>
          </button>

          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-rose-950/40 text-xs font-semibold text-fx-text/90 hover:text-rose-300 hover:border-rose-800/60 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清空</span>
          </button>
        </div>
      </div>

      {/* Main Category Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-1.5 rounded-xl bg-fx-elevated flex-shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {/* 0. 全部日志 */}
          <button
            onClick={() => setActiveCategory('all')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${ activeCategory === 'all' ? 'bg-sky-500 text-white shadow-sm' : 'text-fx-muted hover:text-fx-text hover:bg-fx-surface/60' }`}
          >
            <Layers className="w-3.5 h-3.5 text-fx-accent" />
            <span>全部日志</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-fx-surface text-fx-text/90 font-mono">
              {counts.all}
            </span>
          </button>

          {/* 1. 分流命中 */}
          <button
            onClick={() => setActiveCategory('routing')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${ activeCategory === 'routing' ? 'bg-sky-500 text-white shadow-sm' : 'text-fx-muted hover:text-fx-text hover:bg-fx-surface/60' }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>分流命中 (域名/节点)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-fx-accent-dim text-fx-accent font-mono">
              {counts.routing}
            </span>
          </button>

          {/* 2. DNS 解析 */}
          <button
            onClick={() => setActiveCategory('dns')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${ activeCategory === 'dns' ? 'bg-sky-500 text-white shadow-sm' : 'text-fx-muted hover:text-fx-text hover:bg-fx-surface/60' }`}
          >
            <Globe2 className="w-3.5 h-3.5 text-fx-accent" />
            <span>DNS 解析记录</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-fx-surface text-fx-text/90 font-mono">
              {counts.dns}
            </span>
          </button>

          {/* 3. 内核与系统 */}
          <button
            onClick={() => setActiveCategory('system')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${ activeCategory === 'system' ? 'bg-sky-500 text-white shadow-sm' : 'text-fx-muted hover:text-fx-text hover:bg-fx-surface/60' }`}
          >
            <Cpu className="w-3.5 h-3.5 text-sky-300" />
            <span>内核与系统</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-fx-surface text-fx-text/90 font-mono">
              {counts.system}
            </span>
          </button>

          {/* 4. 异常报错 */}
          <button
            onClick={() => setActiveCategory('error')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${ activeCategory === 'error' ? 'bg-rose-600 text-white shadow-sm' : 'text-fx-muted hover:text-rose-300 hover:bg-fx-surface/60' }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>异常与告警</span>
            {counts.error > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/40 text-rose-200 font-mono">
                {counts.error}
              </span>
            )}
          </button>
        </div>

        {/* Search input */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-fx-muted" />
          <input
            type="text"
            placeholder={
              activeCategory === 'routing'
                ? '搜索域名、规则或出口节点...'
                : activeCategory === 'dns'
                ? '搜索解析域名或 DNS 服务器...'
                : '搜索日志关键词...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-fx-bg rounded-lg text-xs text-fx-text placeholder:text-fx-muted focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
          />
        </div>
      </div>

      {/* Routing Specific Sub-Filter Bar */}
      {activeCategory === 'routing' && (
        <div className="flex items-center gap-2 px-2 text-xs flex-shrink-0">
          <span className="text-fx-muted text-[11px]">出站策略筛选:</span>
          <div className="flex items-center gap-1.5">
            {[
              { id: 'all', label: '全部连接' },
              { id: 'proxy', label: '🚀 经代理节点' },
              { id: 'direct', label: '⚡ 本地直连' },
              { id: 'reject', label: '🛑 广告/拦截' }
            ].map((sub) => (
              <button
                key={sub.id}
                onClick={() => setRoutingFilter(sub.id as any)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${ routingFilter === sub.id ? 'bg-sky-500/20 text-fx-accent border ' : 'bg-fx-elevated text-fx-muted hover:text-fx-text ' }`}
              >
                {sub.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Terminal Log Console */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 bg-fx-bg /90 rounded-2xl p-3 overflow-y-auto font-mono text-xs shadow-inner space-y-1.5 scrollbar-thin select-text"
      >
        {displayLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-fx-muted space-y-2 py-16">
            <Terminal className="w-8 h-8 opacity-40" />
            <div className="text-xs">
              {activeCategory === 'routing'
                ? '暂无捕获到的连接与分流命中记录（请访问网页触发流量）'
                : activeCategory === 'dns'
                ? '暂无独立的 DNS 解析记录'
                : '暂无符合条件的日志记录'}
            </div>
          </div>
        ) : (
          displayLogs.map((log) => {
            const routing = getRoutingDetails(log)

            // 1. Structured Rendering for Routing Hits
            if (activeCategory === 'routing' || routing) {
              const isDirect = (routing?.outbound || log.payload).toUpperCase().includes('DIRECT')
              const isReject = (routing?.outbound || log.payload).toUpperCase().includes('REJECT')

              return (
                <div
                  key={log.id}
                  className="flex items-center gap-2.5 leading-relaxed hover:bg-fx-elevated px-2.5 py-1.5 rounded-lg /50 bg-fx-bg transition font-mono group"
                >
                  {log.seq !== undefined && (
                    <span className="text-[10px] text-fx-muted font-mono px-1.5 py-0.2 rounded bg-fx-elevated select-none flex-shrink-0">
                      #{log.seq}
                    </span>
                  )}
                  <span className="text-fx-muted text-[11px] whitespace-nowrap select-none font-mono">
                    {log.time}
                  </span>

                  {/* Protocol */}
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded select-none flex-shrink-0 ${ routing?.protocol === 'UDP' ? 'bg-fx-accent-dim text-fx-accent ' : 'bg-cyan-500/10 text-cyan-300 ' }`}
                  >
                    {routing?.protocol || 'TCP'}
                  </span>

                  {/* Target Domain or IP */}
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span
                      className="font-medium text-fx-text text-xs font-mono truncate"
                      title={routing?.target || log.payload}
                    >
                      {routing?.target || log.payload}
                    </span>
                  </div>

                  {/* Matched Rule */}
                  {routing?.rule && (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-fx-accent-dim text-fx-accent select-none flex-shrink-0">
                      <span>🎯</span>
                      <span>{routing.rule}</span>
                    </span>
                  )}

                  {/* Outbound Destination Badge */}
                  <div className="flex-shrink-0 select-none">
                    {isDirect ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/15 text-fx-accent">
                        <span>⚡</span>
                        <span>直连 (DIRECT)</span>
                      </span>
                    ) : isReject ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-rose-500/15 text-rose-300">
                        <span>🛑</span>
                        <span>拦截 (REJECT)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/15 text-amber-300">
                        <span>🚀</span>
                        <span className="max-w-[180px] truncate">
                          {routing?.outbound || 'PROXY'}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              )
            }

            // 2. DNS Specific Log Rendering
            if (activeCategory === 'dns') {
              const isResolve = log.payload.includes('resolve ')
              const isAnswer = log.payload.includes('-->')
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-2.5 leading-relaxed hover:bg-fx-surface px-2 py-1 rounded transition font-mono"
                >
                  {log.seq !== undefined && (
                    <span className="text-[10px] text-fx-muted font-mono px-1.5 py-0.2 rounded bg-fx-elevated select-none flex-shrink-0">
                      #{log.seq}
                    </span>
                  )}
                  <span className="text-fx-muted text-[11px] whitespace-nowrap select-none font-mono">
                    {log.time}
                  </span>
                  <span className="select-none flex-shrink-0">
                    {isResolve ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-400">
                        QUERY
                      </span>
                    ) : isAnswer ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-fx-accent-dim text-fx-accent">
                        ANSWER
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-fx-muted/10 text-fx-muted">
                        DNS
                      </span>
                    )}
                  </span>
                  <span className="text-fx-text/90 break-all whitespace-pre-wrap">
                    {log.payload.replace(/^\[DNS\]\s*/i, '')}
                  </span>
                </div>
              )
            }

            // 3. General Console / Error / System View
            return (
              <div
                key={log.id}
                className="flex items-start gap-2.5 leading-relaxed hover:bg-fx-surface px-2 py-0.5 rounded transition font-mono"
              >
                {log.seq !== undefined && (
                  <span className="text-[10px] text-fx-muted font-mono px-1.5 py-0.2 rounded bg-fx-elevated select-none flex-shrink-0">
                    #{log.seq}
                  </span>
                )}
                <span className="text-fx-muted text-[11px] whitespace-nowrap select-none font-mono">
                  {log.time}
                </span>
                <span className="select-none flex-shrink-0">{getLevelBadge(log.type)}</span>
                <span className="text-fx-text/90 break-all whitespace-pre-wrap">{log.payload}</span>
              </div>
            )
          })
        )}
      </div>

      {/* Bottom Status Indicator */}
      <div className="flex items-center justify-between text-[11px] text-fx-muted px-2 flex-shrink-0">
        <span>
          当前分类显示 {displayLogs.length} 条记录 (全库缓冲共 {logs.length} 条，上限 2000 条)
        </span>
        {autoScroll && (
          <span className="flex items-center gap-1 text-fx-accent">
            {sortOrder === 'desc' ? (
              <ArrowUp className="w-3 h-3 animate-bounce" />
            ) : (
              <ArrowDown className="w-3 h-3 animate-bounce" />
            )}
            <span>{sortOrder === 'desc' ? '最新记录置顶' : '最新记录滚至底部'}</span>
          </span>
        )}
      </div>
    </div>
  )
}
export default Logs
