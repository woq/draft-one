import React, { useState, useEffect } from 'react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ShieldCheck,
  Globe,
  Server,
  Zap,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  Wifi,
  WifiOff,
  Rocket,
  Wrench,
  ExternalLink
} from 'lucide-react'
import type { AppConfig } from '../types'

interface DashboardProps {
  config: AppConfig
  onUpdateConfig: (newCfg: AppConfig) => void
  onNavigateToProxies: () => void
  onNavigateToTab?: (tab: string) => void
}

export const Dashboard: React.FC<DashboardProps> = ({
  config,
  onUpdateConfig,
  onNavigateToProxies,
  onNavigateToTab
}) => {
  const [coreStatus, setCoreStatus] = useState<{
    running: boolean
    binaryExists: boolean
    uptimeSec?: number
  }>({
    running: false,
    binaryExists: false,
    uptimeSec: 0
  })
  const [isReloading, setIsReloading] = useState(false)
  const [activeNodeDelay, setActiveNodeDelay] = useState<number | null>(null)
  const [isTestingActive, setIsTestingActive] = useState(false)
  const [proxyWarning, setProxyWarning] = useState<string | null>(null)
  const [tunWarning, setTunWarning] = useState<string | null>(null)

  const [autostartInfo, setAutostartInfo] = useState<{
    standard: boolean
    highPriorityTask: boolean
    systemService: boolean
    active: boolean
  }>({
    standard: false,
    highPriorityTask: false,
    systemService: false,
    active: false
  })

  const [traffic, setTraffic] = useState<{
    speedUp: number
    speedDown: number
    totalDownload: number
    totalUpload: number
  }>({ speedUp: 0, speedDown: 0, totalDownload: 0, totalUpload: 0 })

  useEffect(() => {
    const checkStatus = async () => {
      // @ts-ignore
      const st = await window.api?.getCoreStatus()
      if (st) {
        setCoreStatus(st)
      }
    }

    const checkAutostart = async () => {
      // @ts-ignore
      const ast = await window.api?.getAutoStartStatus()
      if (ast) setAutostartInfo(ast)
    }

    const updateTraffic = async () => {
      // @ts-ignore
      const t = await window.api?.getTrafficSummary()
      if (t) {
        setTraffic({
          speedUp: t.speedUp || 0,
          speedDown: t.speedDown || 0,
          totalDownload: t.totalDownload || 0,
          totalUpload: t.totalUpload || 0
        })
      }
    }

    checkStatus()
    checkAutostart()
    updateTraffic()
    const timer = setInterval(() => {
      checkStatus()
      checkAutostart()
      updateTraffic()
    }, 2000)

    // @ts-ignore
    const unsubCfg = window.api?.onConfigUpdated((newCfg: any) => {
      if (newCfg) onUpdateConfig(newCfg)
    })

    return () => {
      clearInterval(timer)
      if (typeof unsubCfg === 'function') unsubCfg()
    }
  }, [onUpdateConfig])

  const formatUptime = (sec = 0) => {
    if (sec <= 0) return '00:00:00'
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    const pad = (n: number) => n.toString().padStart(2, '0')
    if (h > 0) {
      return `${pad(h)}:${pad(m)}:${pad(s)}`
    }
    return `00:${pad(m)}:${pad(s)}`
  }

  const formatSpeed = (bytes = 0) => {
    if (bytes < 1024) return { val: bytes.toFixed(0), unit: 'B/s' }
    if (bytes < 1024 * 1024) return { val: (bytes / 1024).toFixed(1), unit: 'KB/s' }
    return { val: (bytes / (1024 * 1024)).toFixed(2), unit: 'MB/s' }
  }

  const formatBytes = (bytes = 0) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const handleToggleTun = async () => {
    const nextTun = !config.tunEnabled
    if (nextTun) {
      const status = (await window.api.getServiceStatus()) as { running?: boolean } | undefined
      if (!status?.running) {
        setTunWarning('偏好已保存。DraftOneService 未在运行，正在使用的配置里 TUN 仍是关闭。先在系统服务页安装并启动服务。')
      } else {
        setTunWarning(null)
      }
    } else {
      setTunWarning(null)
    }
    onUpdateConfig({ ...config, tunEnabled: nextTun })
  }

  const handleToggleSystemProxy = async () => {
    if (!config.systemProxy && !coreStatus.running) {
      setProxyWarning('内核未处于运行状态，无法开启系统代理！请先启动内核或检查日志。')
      setTimeout(() => setProxyWarning(null), 5000)
      return
    }
    setProxyWarning(null)
    const nextSys = !config.systemProxy
    const updated = { ...config, systemProxy: nextSys }
    onUpdateConfig(updated)
    // @ts-ignore
    const res = await window.api?.setSystemProxy(nextSys)
    if (res && res.success === false && res.error) {
      setProxyWarning(res.error)
      onUpdateConfig({ ...config, systemProxy: false })
    }
  }

  const handleOpenWindowsProxySettings = async () => {
    // @ts-ignore
    await window.api?.openSystemProxySettings()
  }

  const handleReload = async () => {
    setIsReloading(true)
    // @ts-ignore
    await window.api?.reloadCoreConfig()
    setTimeout(() => setIsReloading(false), 500)
  }

  const handlePingActiveNode = async () => {
    if (!config.activeNode) return
    setIsTestingActive(true)
    // @ts-ignore
    const result = await window.api?.testNodeDelay(config.activeNode)
    const delay = typeof result === 'number' ? result : result?.delay
    if (typeof delay === 'number') setActiveNodeDelay(delay)
    setIsTestingActive(false)
  }

  const activeNodeObj = (config.nodes || []).find((n) => n.name === config.activeNode)

  return (
    <div className="space-y-6">
      {/* Proxy Warning Toast/Bar */}
      {proxyWarning && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs shadow">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{proxyWarning}</span>
          </div>
          <button
            onClick={() => setProxyWarning(null)}
            className="text-amber-400 hover:text-amber-200 text-xs px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Core status alert if binary is missing */}
      {!coreStatus.binaryExists && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">未检测到 mihomo 内核：</span> 请将 Windows 版本的{' '}
            <code className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-200">mihomo.exe</code>{' '}
            放置于项目根目录或{' '}
            <code className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-200">
              resources/binaries/
            </code>{' '}
            目录下。
          </div>
        </div>
      )}

      {/* Top Status & Traffic Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Core Status Card (Status + Uptime only) */}
        <div className="bg-slate-900/60 backdrop-blur border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-slate-400">内核守护状态</span>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                coreStatus.running
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  coreStatus.running ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
              {coreStatus.running ? '运行中' : '未启动'}
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-100 font-mono">
              {formatUptime(coreStatus.uptimeSec)}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-2 font-mono">
            持续运行时间
          </div>
        </div>

        {/* Live Download Speed */}
        <div className="bg-slate-900/60 backdrop-blur border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-slate-400">下行实时速率</span>
            <ArrowDownCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-100 font-mono">
              {formatSpeed(traffic.speedDown).val}
            </span>
            <span className="text-sm font-medium text-slate-400 font-mono">
              {formatSpeed(traffic.speedDown).unit}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-2 font-mono">
            累计下行: <span className="text-emerald-400 font-semibold">{formatBytes(traffic.totalDownload)}</span>
          </div>
        </div>

        {/* Live Upload Speed */}
        <div className="bg-slate-900/60 backdrop-blur border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-slate-400">上行实时速率</span>
            <ArrowUpCircle className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-100 font-mono">
              {formatSpeed(traffic.speedUp).val}
            </span>
            <span className="text-sm font-medium text-slate-400 font-mono">
              {formatSpeed(traffic.speedUp).unit}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-2 font-mono">
            累计上行: <span className="text-blue-400 font-semibold">{formatBytes(traffic.totalUpload)}</span>
          </div>
        </div>
      </div>

      {/* Active Node Card (Node-Centric Core) */}
      <div className="bg-gradient-to-r from-blue-950/40 via-slate-900/60 to-slate-900/60 border border-blue-500/20 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-slate-100 text-sm">
              当前出站代理节点 (Active Node)
            </span>
          </div>
          <button
            onClick={onNavigateToProxies}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium transition"
          >
            <span>管理与选择节点</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="text-base font-bold text-slate-100">
                {config.activeNode || '未选择节点 (直连)'}
              </span>
              {activeNodeObj?.type && (
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {activeNodeObj.type}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400">
              所有在路由表中判定为 PROXY / 兜底 MATCH 的流量均由此节点转发出站
            </div>
          </div>

          <div className="flex items-center gap-3">
            {config.activeNode && (
              <div className="flex items-center gap-2">
                {activeNodeDelay !== null && (
                  <span
                    className={`text-xs font-mono px-2 py-1 rounded border flex items-center gap-1 ${
                      activeNodeDelay < 0
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        : activeNodeDelay < 300
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}
                  >
                    {activeNodeDelay < 0 ? (
                      <>
                        <WifiOff className="w-3.5 h-3.5" /> 超时
                      </>
                    ) : (
                      <>
                        <Wifi className="w-3.5 h-3.5" /> {activeNodeDelay} ms
                      </>
                    )}
                  </span>
                )}
                <button
                  onClick={handlePingActiveNode}
                  disabled={isTestingActive}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition"
                  title="测速当前节点"
                >
                  <Zap className={`w-3.5 h-3.5 text-amber-400 ${isTestingActive ? 'animate-spin' : ''}`} />
                  <span>{isTestingActive ? '测速中...' : '测速'}</span>
                </button>
              </div>
            )}
            <button
              onClick={handleReload}
              disabled={isReloading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition"
              title="热重载内核配置"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReloading ? 'animate-spin' : ''}`} />
              <span>热重载</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mode Switches */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* System Proxy Card */}
        <div className="bg-slate-900/60 hover:bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg transition flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 shrink-0 mt-0.5">
              <Globe className="w-5 h-5" />
            </div>
            <div className="space-y-1 min-w-0 pr-2">
              <div className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                <span>系统代理</span>
                <span className="text-[10px] font-mono text-purple-300 bg-purple-500/15 px-1.5 py-0.5 rounded border border-purple-500/20">
                  System Proxy
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                接管 Windows 系统代理设置（端口: {config.mixedPort}）
              </p>
              <div className="pt-1.5">
                <button
                  onClick={handleOpenWindowsProxySettings}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 hover:text-blue-300 text-[11px] font-medium text-slate-300 border border-slate-700 hover:border-blue-500/40 transition shadow-sm"
                  title="一键打开 Windows 系统设置中的网络代理配置面板 (ms-settings:network-proxy)"
                >
                  <ExternalLink className="w-3 h-3 text-blue-400" />
                  <span>打开 Windows 代理设置</span>
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={handleToggleSystemProxy}
            className={`w-12 h-6 shrink-0 flex items-center rounded-full p-1 duration-200 transition-colors cursor-pointer mt-1 ${
              config.systemProxy ? 'bg-blue-600 shadow-md shadow-blue-600/30' : 'bg-slate-700'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-200 ${
                config.systemProxy ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* TUN Mode Card */}
        <div className="bg-slate-900/60 hover:bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 shadow-lg transition flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-1 min-w-0 pr-2">
              <div className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                <span>TUN 虚拟网卡模式</span>
                <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  Wintun
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                全局网络与非代理应用透明接管，原生防 DNS 泄漏。需要系统服务正在运行才会写入配置。
              </p>
              {tunWarning && <p className="text-xs text-amber-300 leading-relaxed">{tunWarning}</p>}
            </div>
          </div>
          <button
            type="button"
            aria-pressed={config.tunEnabled}
            aria-label="TUN 虚拟网卡模式"
            onClick={handleToggleTun}
            className={`w-12 h-6 shrink-0 flex items-center rounded-full p-1 duration-200 transition-colors cursor-pointer mt-1 ${
              config.tunEnabled ? 'bg-emerald-600 shadow-md shadow-emerald-600/30' : 'bg-slate-700'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-200 ${
                config.tunEnabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Autostart & Service Status Banner Card */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                autostartInfo.active ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-500'
              }`}
            >
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-100 text-sm">开机自启与系统守护</span>
                {autostartInfo.highPriorityTask ? (
                  <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    交互式登录任务 (已注册)
                  </span>
                ) : autostartInfo.systemService ? (
                  <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Windows 服务模式 (运行中)
                  </span>
                ) : autostartInfo.standard ? (
                  <span className="text-[11px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                    常规登录自启 (已启用)
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                    未配置开机自启
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {autostartInfo.highPriorityTask
                  ? '已注册交互式登录任务。它在当前用户登录后的桌面里以最高权限启动托盘。'
                  : autostartInfo.systemService
                    ? 'Windows 服务已在运行。服务拉起内核，登录后由服务在桌面创建托盘。'
                    : autostartInfo.standard
                      ? '已启用注册表登录项，登录后静默启动托盘。'
                      : '建议在系统服务页注册 Windows 服务。服务负责开机内核，登录后再创建托盘。'}
              </p>
            </div>
          </div>

          <button
            onClick={() => onNavigateToTab?.('service')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 hover:border-slate-600 transition flex-shrink-0"
          >
            <Wrench className="w-3.5 h-3.5 text-blue-400" />
            <span>配置自启与系统服务</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>
    </div>
  )
}
