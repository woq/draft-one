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

type TabId =
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

const NAV_ITEMS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: '控制面板', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'proxies', label: '节点中心', icon: <Server className="w-4 h-4" /> },
  { id: 'connections', label: '实时连接管理', icon: <Radio className="w-4 h-4" /> },
  { id: 'traffic', label: '流量统计分析', icon: <Activity className="w-4 h-4" /> },
  { id: 'routing', label: '路由分流规则', icon: <Route className="w-4 h-4" /> },
  { id: 'ruleproviders', label: '规则库管理', icon: <Database className="w-4 h-4" /> },
  { id: 'dns', label: 'DNS 策略分流', icon: <Globe2 className="w-4 h-4" /> },
  { id: 'logs', label: '实时内核日志', icon: <Terminal className="w-4 h-4" /> },
  { id: 'service', label: '系统服务与工具', icon: <Wrench className="w-4 h-4" /> },
  { id: 'settings', label: '应用与内核设置', icon: <SettingsIcon className="w-4 h-4" /> }
]

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
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
    <div className="fx-app-shell flex flex-col h-screen w-screen font-sans select-none overflow-hidden rounded-xl shadow-soft">
      <TitleBar title="draft-one" />

      {abnormalAlert && (
        <div className="bg-amber-950/50 px-5 py-2.5 flex items-center justify-between text-amber-100 select-none transition duration-fx z-20">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <div className="text-xs text-amber-200/90 font-medium">
              {abnormalAlert.systemProxyActive ? (
                <span>
                  <strong className="font-semibold text-amber-100">内核异常或未运行</strong>
                  <span className="text-amber-200/80 ml-1.5">
                    — 当前 Windows 系统代理仍处于开启状态，若无法加载网页，请手动点击关闭代理或尝试重启内核。
                  </span>
                </span>
              ) : (
                <span>
                  <strong className="font-semibold text-amber-100">内核状态提示</strong>
                  <span className="text-amber-200/80 ml-1.5">{abnormalAlert.message}</span>
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
                className="px-3 py-1 bg-fx-danger/25 hover:bg-fx-danger/40 text-rose-100 rounded-xl text-xs font-medium transition duration-fx"
              >
                处理端口占用
              </button>
            )}
            {abnormalAlert.systemProxyActive && (
              <button
                type="button"
                onClick={handleManualDisableProxy}
                className="px-3 py-1 bg-amber-500/25 hover:bg-amber-500/40 text-amber-100 rounded-xl text-xs font-medium transition duration-fx"
              >
                一键关闭系统代理
              </button>
            )}
            <button
              type="button"
              onClick={handleManualRestartCore}
              disabled={isRestartingCore}
              className="fx-btn-accent disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isRestartingCore ? 'animate-spin' : ''}`} />
              <span>重启内核</span>
            </button>
            <button type="button" onClick={() => setActiveTab('logs')} className="fx-btn">
              查看日志
            </button>
            <button
              type="button"
              onClick={() => setAbnormalAlert(null)}
              className="p-1 hover:bg-amber-500/20 text-amber-400 hover:text-amber-200 rounded-md transition duration-fx ml-1"
              aria-label="关闭提示"
              title="关闭提示"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 bg-fx-elevated flex flex-col justify-between p-3 select-none shadow-soft">
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setActiveTab(item.id)}
                  className={`fx-nav ${active ? 'fx-nav-active' : ''}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>

          <div className="px-3 py-2.5 rounded-xl bg-fx-bg/80 text-center">
            <div className="text-[11px] font-medium text-fx-muted/80">draft-one</div>
            <div className="text-[10px] text-fx-muted/50 mt-0.5">节点中心 · 热重载</div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-7 bg-transparent">
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
