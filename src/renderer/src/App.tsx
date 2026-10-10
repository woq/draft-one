import React, { useState, useEffect } from 'react'
import { TitleBar } from './components/TitleBar'
import { Dashboard } from './pages/Dashboard'
import { Proxies } from './pages/Proxies'
import { Routing } from './pages/Routing'
import { RuleProviders } from './pages/RuleProviders'
import { Traffic } from './pages/Traffic'
import { Connections } from './pages/Connections'
import { SystemService } from './pages/SystemService'
import { Settings } from './pages/Settings'
import { Logs } from './pages/Logs'
import { Dns } from './pages/Dns'
import {
  LayoutDashboard,
  Server,
  Route,
  Database,
  Globe2,
  Activity,
  Radio,
  Wrench,
  Terminal,
  Settings as SettingsIcon,
  AlertTriangle,
  X,
  RefreshCw
} from 'lucide-react'
import type { AppConfig } from './types'

const INITIAL_CONFIG: AppConfig = {
  mixedPort: 7890,
  tunEnabled: false,
  systemProxy: false,
  autoStart: false,
  silentStart: true,
  activeNode: '',
  autoUpdateSub: true,
  autoUpdateGeo: true,
  subscriptions: [],
  nodes: [],
  rules: []
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    | 'dashboard'
    | 'proxies'
    | 'connections'
    | 'routing'
    | 'ruleproviders'
    | 'dns'
    | 'traffic'
    | 'logs'
    | 'service'
    | 'settings'
  >('dashboard')
  const [config, setConfig] = useState<AppConfig>(INITIAL_CONFIG)
  const [abnormalAlert, setAbnormalAlert] = useState<{
    reason: string
    systemProxyActive: boolean
    autoDisabledProxy?: boolean
    message: string
    occupants?: { port: number; pid: number; image: string }[]
    timestamp: number
  } | null>(null)
  const [isRestartingCore, setIsRestartingCore] = useState(false)

  useEffect(() => {
    // @ts-ignore
    window.api?.getConfig().then((cfg: AppConfig) => {
      if (cfg) setConfig(cfg)
    })

    // Listen to abnormal alert and core recovered events
    // @ts-ignore
    const unsubAlert = window.api?.onAbnormalAlert?.((data: any) => {
      if (data) setAbnormalAlert(data)
    })
    // @ts-ignore
    const unsubRecovered = window.api?.onCoreRecovered?.(() => {
      setAbnormalAlert(null)
    })
    // @ts-ignore
    const unsubCfg = window.api?.onConfigUpdated?.((newCfg: any) => {
      if (newCfg) setConfig(newCfg)
    })

    return () => {
      if (typeof unsubAlert === 'function') unsubAlert()
      if (typeof unsubRecovered === 'function') unsubRecovered()
      if (typeof unsubCfg === 'function') unsubCfg()
    }
  }, [])

  const handleUpdateConfig = async (newConfig: AppConfig, options?: { persist?: 'memory' }) => {
    setConfig(newConfig)
    if (options?.persist === 'memory') return
    await window.api?.saveConfig(newConfig)
  }

  const handleManualDisableProxy = async () => {
    const updated = { ...config, systemProxy: false }
    setConfig(updated)
    // @ts-ignore
    await window.api?.setSystemProxy(false)
    setAbnormalAlert((prev) => (prev ? { ...prev, systemProxyActive: false } : null))
  }

  const handleManualRestartCore = async () => {
    setIsRestartingCore(true)
    // @ts-ignore
    await window.api?.restartCore()
    setTimeout(() => {
      setIsRestartingCore(false)
      setAbnormalAlert(null)
    }, 1200)
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0f19] text-slate-100 font-sans select-none overflow-hidden border border-slate-800/80 rounded-xl shadow-2xl">
      {/* Windows Frameless TitleBar */}
      <TitleBar title="draft-one" />

      {/* Main Interface Manual Operation Banner */}
      {abnormalAlert && (
        <div className="bg-amber-950/90 border-b border-amber-500/40 px-5 py-2.5 flex items-center justify-between text-amber-200 shadow-md backdrop-blur-md select-none transition-all z-20">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <div className="text-xs text-amber-300 font-medium">
              {abnormalAlert.systemProxyActive ? (
                <span>
                  <strong className="font-semibold text-amber-200">内核异常或未运行</strong>
                  <span className="text-amber-300/90 ml-1.5">
                    — 当前 Windows 系统代理仍处于开启状态，若无法加载网页，请手动点击关闭代理或尝试重启内核。
                  </span>
                </span>
              ) : (
                <span>
                  <strong className="font-semibold text-amber-200">内核状态提示</strong>
                  <span className="text-amber-300/90 ml-1.5">{abnormalAlert.message}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {abnormalAlert.reason.includes('端口冲突') && (
              <button
                type="button"
                onClick={() => {
                  void window.api.resolvePortConflict()
                }}
                className="px-3 py-1 bg-rose-600/30 hover:bg-rose-600/50 text-rose-100 border border-rose-500/50 rounded-lg text-xs font-medium transition shadow-sm"
              >
                处理端口占用
              </button>
            )}
            {abnormalAlert.systemProxyActive && (
              <button
                onClick={handleManualDisableProxy}
                className="px-3 py-1 bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 hover:text-white border border-amber-500/50 rounded-lg text-xs font-medium transition shadow-sm"
              >
                一键关闭系统代理
              </button>
            )}
            <button
              onClick={handleManualRestartCore}
              disabled={isRestartingCore}
              className="px-3 py-1 bg-blue-600/35 hover:bg-blue-600/55 text-blue-200 hover:text-white border border-blue-500/50 rounded-lg text-xs font-medium transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isRestartingCore ? 'animate-spin' : ''}`} />
              <span>重启内核</span>
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className="px-2.5 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700/60 transition"
            >
              查看日志
            </button>
            <button
              onClick={() => setAbnormalAlert(null)}
              className="p-1 hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 rounded-md transition ml-1"
              title="关闭提示"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Navigation Sidebar */}
        <aside className="w-56 bg-slate-950/70 border-r border-slate-800/80 flex flex-col justify-between p-3 select-none">
          <div className="space-y-1.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>控制面板</span>
            </button>

            <button
              type="button"
              aria-current={activeTab === 'proxies' ? 'page' : undefined}
              onClick={() => setActiveTab('proxies')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'proxies'
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Server className="w-4 h-4" />
              <span>节点中心</span>
            </button>

            <button
              type="button"
              aria-current={activeTab === 'connections' ? 'page' : undefined}
              onClick={() => setActiveTab('connections')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'connections'
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>实时连接管理</span>
            </button>

            <button
              type="button"
              aria-current={activeTab === 'traffic' ? 'page' : undefined}
              onClick={() => setActiveTab('traffic')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'traffic'
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>流量统计分析</span>
            </button>

            <button
              onClick={() => setActiveTab('routing')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'routing'
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Route className="w-4 h-4" />
              <span>路由分流规则</span>
            </button>

            <button
              onClick={() => setActiveTab('ruleproviders')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'ruleproviders'
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>规则库管理</span>
            </button>

            <button
              onClick={() => setActiveTab('dns')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'dns'
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Globe2 className="w-4 h-4" />
              <span>DNS 策略分流</span>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'logs'
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>实时内核日志</span>
            </button>

            <button
              onClick={() => setActiveTab('service')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'service'
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>系统服务与工具</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'settings'
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              <span>应用与内核设置</span>
            </button>
          </div>

          {/* Bottom badge */}
          <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60 text-center">
            <div className="text-xs font-semibold text-slate-300">draft-one Engine</div>
            <div className="text-[11px] text-slate-500 mt-0.5">以节点为中心 · 零感热重载</div>
          </div>
        </aside>

        {/* Content View Area */}
        <main className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-slate-900/40 to-slate-950/80">
          {activeTab === 'dashboard' && (
            <Dashboard
              config={config}
              onUpdateConfig={handleUpdateConfig}
              onNavigateToProxies={() => setActiveTab('proxies')}
              onNavigateToTab={(tab) => {
                if (
                  tab === 'proxies' ||
                  tab === 'connections' ||
                  tab === 'routing' ||
                  tab === 'ruleproviders' ||
                  tab === 'dns' ||
                  tab === 'traffic' ||
                  tab === 'logs' ||
                  tab === 'service' ||
                  tab === 'settings'
                ) {
                  setActiveTab(tab)
                }
              }}
            />
          )}
          {activeTab === 'proxies' && (
            <Proxies config={config} onUpdateConfig={handleUpdateConfig} />
          )}
          {activeTab === 'connections' && (
            <Connections onNavigateToTraffic={() => setActiveTab('traffic')} />
          )}
          {activeTab === 'routing' && (
            <Routing config={config} onUpdateConfig={handleUpdateConfig} />
          )}
          {activeTab === 'ruleproviders' && (
            <RuleProviders
              config={config}
              onUpdateConfig={handleUpdateConfig}
              onNavigateToRouting={() => setActiveTab('routing')}
            />
          )}
          {activeTab === 'dns' && (
            <Dns config={config} onUpdateConfig={handleUpdateConfig} />
          )}
          {activeTab === 'traffic' && (
            <Traffic onNavigateToConnections={() => setActiveTab('connections')} />
          )}
          {activeTab === 'logs' && <Logs />}
          {activeTab === 'service' && <SystemService />}
          {activeTab === 'settings' && (
            <Settings config={config} onUpdateConfig={handleUpdateConfig} />
          )}
        </main>
      </div>
    </div>
  )
}
export default App
