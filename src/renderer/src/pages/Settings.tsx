import React, { useEffect, useRef, useState } from 'react'
import {
  Settings as SettingsIcon,
  Power,
  Terminal,
  HardDrive,
  RotateCw,
  Database,
  ShieldCheck
} from 'lucide-react'
import type { AppConfig } from '../types'

interface SettingsProps {
  config: AppConfig
  onUpdateConfig: (newCfg: AppConfig) => void
}

export const Settings: React.FC<SettingsProps> = ({ config, onUpdateConfig }) => {
  const [portDraft, setPortDraft] = useState(String(config.mixedPort))
  const configRef = useRef(config)
  const onUpdateRef = useRef(onUpdateConfig)
  configRef.current = config
  onUpdateRef.current = onUpdateConfig

  useEffect(() => {
    setPortDraft(String(config.mixedPort))
  }, [config.mixedPort])

  useEffect(() => {
    const port = parseInt(portDraft, 10)
    if (!Number.isInteger(port) || port <= 0 || port >= 65536) return
    if (port === configRef.current.mixedPort) return
    const timer = setTimeout(() => {
      onUpdateRef.current({ ...configRef.current, mixedPort: port })
    }, 400)
    return () => clearTimeout(timer)
  }, [portDraft])

  const handleToggleAutoStart = async () => {
    const nextAuto = !config.autoStart
    const updated = { ...config, autoStart: nextAuto }
    onUpdateConfig(updated)
    await window.api?.setAutoStart(nextAuto)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="w-5 h-5 text-blue-400" />
        <h2 className="text-lg font-bold text-slate-100">应用与内核设置</h2>
      </div>

      <div className="space-y-4">
        {/* Windows Autostart */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
              <Power className="w-6 h-6" />
            </div>
            <div>
              <div className="font-semibold text-slate-100">Windows 开机自启动</div>
              <div className="text-xs text-slate-400 mt-0.5">
                普通权限注册启动项，附带 <code className="text-blue-400 font-mono">--silent</code>{' '}
                参数静默托盘常驻，避免 UAC 提权拦截。
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-pressed={config.autoStart}
            aria-label="Windows 开机自启动"
            onClick={handleToggleAutoStart}
            className={`w-12 h-6 flex items-center rounded-full p-1 duration-200 transition-colors ${
              config.autoStart ? 'bg-blue-600' : 'bg-slate-700'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-200 ${
                config.autoStart ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Anti-disconnect protection info */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="font-semibold text-slate-100">退出自动清理代理 (防断网保护)</div>
              <div className="text-xs text-slate-400 mt-0.5">
                程序退出或意外终止时，把系统代理和 PAC 恢复成打开之前的设置，并通知 Windows 重新读取。
              </div>
            </div>
          </div>
          <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 font-medium">
            始终保护中
          </span>
        </div>

        {/* Auto update subscription */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400">
              <RotateCw className="w-6 h-6" />
            </div>
            <div>
              <div className="font-semibold text-slate-100">订阅自动更新（偏好）</div>
              <div className="text-xs text-slate-400 mt-0.5">
                偏好会写入本地配置。当前版本不会在后台按周期拉取，请在节点中心手动更新订阅。
              </div>
            </div>
          </div>
          <button
            onClick={() => onUpdateConfig({ ...config, autoUpdateSub: !config.autoUpdateSub })}
            className={`w-12 h-6 flex items-center rounded-full p-1 duration-200 transition-colors ${
              config.autoUpdateSub ? 'bg-blue-600' : 'bg-slate-700'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-200 ${
                config.autoUpdateSub ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Auto update GeoData */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="font-semibold text-slate-100">规则库自动更新（偏好）</div>
              <div className="text-xs text-slate-400 mt-0.5">
                偏好会写入本地配置。当前版本不会在后台按周下载，请在规则库页面手动更新。
              </div>
            </div>
          </div>
          <button
            onClick={() => onUpdateConfig({ ...config, autoUpdateGeo: !config.autoUpdateGeo })}
            className={`w-12 h-6 flex items-center rounded-full p-1 duration-200 transition-colors ${
              config.autoUpdateGeo ? 'bg-blue-600' : 'bg-slate-700'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-200 ${
                config.autoUpdateGeo ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Mixed Port setting */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
              <Terminal className="w-6 h-6" />
            </div>
            <div>
              <div className="font-semibold text-slate-100">混合代理监听端口 (Mixed Port)</div>
              <div className="text-xs text-slate-400 mt-0.5">
                单个端口自适应兼容 SOCKS5 与 HTTP 代理连接请求。
              </div>
            </div>
          </div>
          <input
            type="number"
            value={portDraft}
            aria-label="混合代理监听端口"
            onChange={(e) => setPortDraft(e.target.value)}
            className="w-24 bg-slate-950/80 border border-slate-700 text-center rounded-lg px-3 py-1.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Binary info */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <div className="font-semibold text-slate-100">代理内核二进制</div>
              <div className="text-xs text-slate-400 mt-0.5">
                内核文件固定为 <code className="text-amber-300 font-mono">mihomo.exe</code>
                ，当前随包版本是 Mihomo Meta v1.19.32。
              </div>
            </div>
          </div>
          <span className="text-xs font-mono text-emerald-400 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            TUN 由 mihomo 接管
          </span>
        </div>
      </div>
    </div>
  )
}
