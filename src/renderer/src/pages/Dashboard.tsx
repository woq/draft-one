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
    <div className="space-y-7">
      {proxyWarning && (
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-500/12 text-amber-200 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{proxyWarning}</span>
          </div>
          <button
            type="button"
            onClick={() => setProxyWarning(null)}
            className="text-amber-400 hover:text-amber-200 text-xs px-2"
            aria-label="关闭警告"
          >
            ✕
          </button>
        </div>
      )}

      {!coreStatus.binaryExists && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/10 text-amber-200">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">未检测到 mihomo 内核：</span> 请将 Windows 版本的{' '}
            <code className="px-1.5 py-0.5 rounded-lg bg-amber-950/60 text-amber-200 font-mono">mihomo.exe</code>{' '}
            放置于项目根目录或{' '}
            <code className="px-1.5 py-0.5 rounded-lg bg-amber-950/60 text-amber-200 font-mono">
              resources/binaries/
            </code>{' '}
            目录下。
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="fx-panel fx-glass-strong rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs font-medium text-fx-muted tracking-wide">内核</span>
            <div className={`fx-chip ${coreStatus.running ? 'fx-chip-ok' : 'fx-chip-muted'}`}>
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  coreStatus.running ? 'bg-fx-accent animate-pulse' : 'bg-fx-muted'
                }`}
              />
              {coreStatus.running ? '运行中' : '未启动'}
            </div>
          </div>
          <div className="text-4xl font-semibold text-fx-text font-mono tracking-tight leading-none">
            {formatUptime(coreStatus.uptimeSec)}
          </div>
          <div className="text-xs text-fx-muted mt-3">运行时长</div>
        </div>

        <div className="fx-panel fx-glass-strong rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs font-medium text-fx-muted tracking-wide">下行</span>
            <ArrowDownCircle className="w-4 h-4 text-fx-accent" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-fx-text font-mono tracking-tight leading-none">
              {formatSpeed(traffic.speedDown).val}
            </span>
            <span className="text-sm font-medium text-fx-muted font-mono">
              {formatSpeed(traffic.speedDown).unit}
            </span>
          </div>
          <div className="text-xs text-fx-muted mt-3 font-mono">
            累计 <span className="text-fx-accent">{formatBytes(traffic.totalDownload)}</span>
          </div>
        </div>

        <div className="fx-panel fx-glass-strong rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs font-medium text-fx-muted tracking-wide">上行</span>
            <ArrowUpCircle className="w-4 h-4 text-fx-accent" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-fx-text font-mono tracking-tight leading-none">
              {formatSpeed(traffic.speedUp).val}
            </span>
            <span className="text-sm font-medium text-fx-muted font-mono">
              {formatSpeed(traffic.speedUp).unit}
            </span>
          </div>
          <div className="text-xs text-fx-muted mt-3 font-mono">
            累计 <span className="text-fx-accent">{formatBytes(traffic.totalUpload)}</span>
          </div>
        </div>
      </div>

      <div className="fx-panel fx-glass-strong rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-fx-accent" />
            <span className="font-semibold text-fx-text text-sm">当前节点</span>
          </div>
          <button
            type="button"
            onClick={onNavigateToProxies}
            className="flex items-center gap-1 text-xs text-fx-accent hover:text-sky-200 font-medium transition duration-fx"
          >
            <span>管理节点</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-fx-surface">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-lg font-semibold text-fx-text truncate">
              {config.activeNode || '未选择（直连）'}
            </span>
            {activeNodeObj?.type && (
              <span className="fx-chip fx-chip-accent font-mono uppercase text-[10px] shrink-0">
                {activeNodeObj.type}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {config.activeNode && (
              <div className="flex items-center gap-2">
                {activeNodeDelay !== null && (
                  <span
                    className={`text-xs font-mono px-2 py-1 rounded-lg flex items-center gap-1 ${
                      activeNodeDelay < 0
                        ? 'bg-fx-danger/10 text-fx-danger'
                        : activeNodeDelay < 300
                          ? 'bg-fx-accent-dim text-fx-accent'
                          : 'bg-amber-500/10 text-amber-300'
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
                  type="button"
                  onClick={handlePingActiveNode}
                  disabled={isTestingActive}
                  className="fx-btn"
                  title="测速当前节点"
                >
                  <Zap className={`w-3.5 h-3.5 text-amber-300 ${isTestingActive ? 'animate-spin' : ''}`} />
                  <span>{isTestingActive ? '测速中...' : '测速'}</span>
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={handleReload}
              disabled={isReloading}
              className="fx-btn"
              title="热重载内核配置"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReloading ? 'animate-spin' : ''}`} />
              <span>热重载</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="fx-panel rounded-2xl p-5 transition duration-fx flex items-start justify-between gap-4 hover:bg-fx-surface">
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-fx-accent-dim text-fx-accent shrink-0 mt-0.5">
              <Globe className="w-5 h-5" />
            </div>
            <div className="space-y-1 min-w-0 pr-2">
              <div className="font-semibold text-fx-text text-sm flex items-center gap-2">
                <span>系统代理</span>
                <span className="fx-chip fx-chip-accent font-mono text-[10px]">:{config.mixedPort}</span>
              </div>
              <p className="text-xs text-fx-muted leading-relaxed">接管 Windows 系统代理</p>
              <div className="pt-1.5">
                <button
                  type="button"
                  onClick={handleOpenWindowsProxySettings}
                  className="fx-btn"
                  title="一键打开 Windows 系统设置中的网络代理配置面板 (ms-settings:network-proxy)"
                >
                  <ExternalLink className="w-3 h-3 text-fx-accent" />
                  <span>打开 Windows 代理设置</span>
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-pressed={config.systemProxy}
            aria-label="系统代理"
            onClick={handleToggleSystemProxy}
            className={`w-12 h-6 shrink-0 flex items-center rounded-full p-1 duration-fx transition-colors cursor-pointer mt-1 ${ config.systemProxy ? 'bg-sky-500' : 'bg-[rgba(100,116,139,0.45)]' }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-fx ${ config.systemProxy ? 'translate-x-6' : 'translate-x-0' }`}
            />
          </button>
        </div>

        <div className="fx-panel rounded-2xl p-5 transition duration-fx flex items-start justify-between gap-4 hover:bg-fx-surface">
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-fx-accent-dim text-fx-accent shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-1 min-w-0 pr-2">
              <div className="font-semibold text-fx-text text-sm flex items-center gap-2">
                <span>TUN 模式</span>
                <span className="fx-chip fx-chip-accent font-mono text-[10px]">Wintun</span>
              </div>
              <p className="text-xs text-fx-muted leading-relaxed">
                透明接管全局流量；需系统服务运行中才会写入配置。
              </p>
              {tunWarning && <p className="text-xs text-amber-300 leading-relaxed">{tunWarning}</p>}
            </div>
          </div>
          <button
            type="button"
            aria-pressed={config.tunEnabled}
            aria-label="TUN 虚拟网卡模式"
            onClick={handleToggleTun}
            className={`w-12 h-6 shrink-0 flex items-center rounded-full p-1 duration-fx transition-colors cursor-pointer mt-1 ${
              config.tunEnabled ? 'bg-cyan-500' : 'bg-[rgba(100,116,139,0.45)]'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-fx ${ config.tunEnabled ? 'translate-x-6' : 'translate-x-0' }`}
            />
          </button>
        </div>
      </div>

      <div className="fx-panel rounded-2xl p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${ autostartInfo.active ? 'bg-fx-accent-dim text-fx-accent' : 'bg-fx-surface text-fx-muted' }`}
            >
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-fx-text text-sm">开机自启与系统守护</span>
                {autostartInfo.highPriorityTask ? (
                  <span className="fx-chip fx-chip-ok">
                    <span className="w-1.5 h-1.5 rounded-full bg-fx-accent animate-pulse" />
                    登录任务
                  </span>
                ) : autostartInfo.systemService ? (
                  <span className="fx-chip fx-chip-ok">
                    <span className="w-1.5 h-1.5 rounded-full bg-fx-accent animate-pulse" />
                    服务运行中
                  </span>
                ) : autostartInfo.standard ? (
                  <span className="fx-chip fx-chip-accent">登录自启</span>
                ) : (
                  <span className="fx-chip fx-chip-muted">未配置</span>
                )}
              </div>
              <p className="text-xs text-fx-muted mt-0.5">
                {autostartInfo.highPriorityTask
                  ? '登录后以最高权限启动托盘。'
                  : autostartInfo.systemService
                    ? '服务拉起内核，登录后创建托盘。'
                    : autostartInfo.standard
                      ? '注册表登录项已启用。'
                      : '建议在系统服务页注册 Windows 服务。'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateToTab?.('service')}
            className="fx-btn-accent flex-shrink-0"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>配置自启与系统服务</span>
            <ChevronRight className="w-3.5 h-3.5 opacity-70" />
          </button>
        </div>
      </div>
    </div>
  )
}
