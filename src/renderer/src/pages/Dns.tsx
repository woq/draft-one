import React, { useState } from 'react'
import { Globe2, Check, RotateCw, Shield, Zap, RefreshCw, Info } from 'lucide-react'
import type { AppConfig, DnsConfig } from '../types'

interface DnsProps {
  config: AppConfig
  onUpdateConfig: (newCfg: AppConfig) => void
}

const DEFAULT_DNS_CONFIG: DnsConfig = {
  enhancedMode: 'fake-ip',
  listenPort: 1053,
  directDns: ['system', '223.5.5.5', '119.29.29.29'],
  proxyDns: ['8.8.8.8#PROXY', '1.1.1.1#PROXY', 'https://8.8.8.8/dns-query#PROXY'],
  enableGeositePolicy: true,
  enableFakeIpFilter: true,
  fakeIpFilters: [
    '*.lan',
    '*.local',
    '*.msftconnecttest.com',
    '*.msftncsi.com',
    'msftconnecttest.com',
    'msftncsi.com'
  ],
  enableFallbackFilter: true
}

function asJson(value: string[]): string {
  return JSON.stringify(value, null, 2)
}

function parseStringList(raw: string, label: string): string[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} 需要是字符串数组`)
  }
  return parsed.map((item) => item.trim()).filter(Boolean)
}

export const Dns: React.FC<DnsProps> = ({ config, onUpdateConfig }) => {
  const currentDns: DnsConfig = {
    ...DEFAULT_DNS_CONFIG,
    ...(config.dns || {})
  }

  const [enhancedMode, setEnhancedMode] = useState(currentDns.enhancedMode)
  const [listenPort, setListenPort] = useState(String(currentDns.listenPort))
  const [enableGeositePolicy, setEnableGeositePolicy] = useState(currentDns.enableGeositePolicy)
  const [enableFakeIpFilter, setEnableFakeIpFilter] = useState(currentDns.enableFakeIpFilter)
  const [enableFallbackFilter, setEnableFallbackFilter] = useState(currentDns.enableFallbackFilter)
  const [directJson, setDirectJson] = useState(asJson(currentDns.directDns))
  const [proxyJson, setProxyJson] = useState(asJson(currentDns.proxyDns))
  const [filterJson, setFilterJson] = useState(asJson(currentDns.fakeIpFilters))
  const [jsonError, setJsonError] = useState('')
  const [isFlushing, setIsFlushing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [flushSuccess, setFlushSuccess] = useState(false)

  const handleSaveDns = async () => {
    setJsonError('')
    let directDns: string[]
    let proxyDns: string[]
    let fakeIpFilters: string[]
    try {
      directDns = parseStringList(directJson, '直连 DNS')
      proxyDns = parseStringList(proxyJson, '代理 DNS')
      fakeIpFilters = parseStringList(filterJson, 'Fake-IP 过滤')
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'JSON 无法解析')
      return
    }
    const port = parseInt(listenPort, 10)
    if (!Number.isInteger(port) || port <= 0 || port >= 65536) {
      setJsonError('监听端口需要是 1 到 65535')
      return
    }
    setIsSaving(true)
    const dns: DnsConfig = {
      enhancedMode,
      listenPort: port,
      directDns,
      proxyDns,
      enableGeositePolicy,
      enableFakeIpFilter,
      fakeIpFilters,
      enableFallbackFilter
    }
    onUpdateConfig({ ...config, dns })
    setSaveSuccess(true)
    setTimeout(() => {
      setIsSaving(false)
      setSaveSuccess(false)
    }, 1500)
  }

  const handleResetDefault = () => {
    setEnhancedMode(DEFAULT_DNS_CONFIG.enhancedMode)
    setListenPort(String(DEFAULT_DNS_CONFIG.listenPort))
    setEnableGeositePolicy(DEFAULT_DNS_CONFIG.enableGeositePolicy)
    setEnableFakeIpFilter(DEFAULT_DNS_CONFIG.enableFakeIpFilter)
    setEnableFallbackFilter(DEFAULT_DNS_CONFIG.enableFallbackFilter)
    setDirectJson(asJson(DEFAULT_DNS_CONFIG.directDns))
    setProxyJson(asJson(DEFAULT_DNS_CONFIG.proxyDns))
    setFilterJson(asJson(DEFAULT_DNS_CONFIG.fakeIpFilters))
    setJsonError('')
  }

  const handleFlushDns = async () => {
    setIsFlushing(true)
    try {
      await window.api?.flushDns()
      setFlushSuccess(true)
      setTimeout(() => setFlushSuccess(false), 2000)
    } finally {
      setIsFlushing(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-fx-accent" />
            <h2 className="text-lg font-bold text-fx-text">DNS 策略分流</h2>
          </div>
          <p className="text-xs text-fx-muted mt-1">
            名单用 JSON 数组。广告域名不在这里配，去路由规则里启用 RULE-SET、载荷 anti-ad。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleFlushDns}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-fx-surface-hover text-xs font-semibold text-fx-text shadow-sm transition"
          >
            {flushSuccess ? (
              <Check className="w-3.5 h-3.5 text-fx-accent" />
            ) : (
              <RefreshCw className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
            )}
            <span>{flushSuccess ? 'DNS 缓存已刷新' : '刷新系统 DNS 缓存'}</span>
          </button>
          <button
            type="button"
            onClick={handleResetDefault}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-fx-surface-hover text-xs font-semibold text-fx-text/90 shadow-sm transition"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>恢复推荐预设</span>
          </button>
          <button
            type="button"
            onClick={handleSaveDns}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-cyan-400 text-xs font-semibold text-white shadow-sm transition"
          >
            {saveSuccess ? (
              <Check className="w-3.5 h-3.5 text-fx-accent" />
            ) : isSaving ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-amber-300" />
            )}
            <span>{saveSuccess ? '已生效并热重载' : isSaving ? '保存中...' : '保存并应用 DNS'}</span>
          </button>
        </div>
      </div>

      {jsonError && (
        <div className="px-4 py-2 rounded-xl bg-rose-500/10 text-xs text-rose-300">
          {jsonError}
        </div>
      )}

      <div className="fx-panel rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 pb-3">
          <Shield className="w-4 h-4 text-fx-accent" />
          <h3 className="text-sm font-bold text-fx-text">运行方式</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-fx-surface space-y-2">
            <label className="text-xs font-semibold text-fx-text/90 block">解析增强模式</label>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                aria-pressed={enhancedMode === 'fake-ip'}
                onClick={() => setEnhancedMode('fake-ip')}
                className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-medium transition ${ enhancedMode === 'fake-ip' ? 'bg-sky-500/20 text-fx-accent ' : 'bg-fx-elevated text-fx-muted hover:text-fx-text' }`}
              >
                Fake-IP
              </button>
              <button
                type="button"
                aria-pressed={enhancedMode === 'redir-host'}
                onClick={() => setEnhancedMode('redir-host')}
                className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-medium transition ${ enhancedMode === 'redir-host' ? 'bg-sky-500/20 text-fx-accent ' : 'bg-fx-elevated text-fx-muted hover:text-fx-text' }`}
              >
                Redir-Host
              </button>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-fx-surface space-y-2">
            <label htmlFor="dns-listen-port" className="text-xs font-semibold text-fx-text/90 block">
              监听端口
            </label>
            <input
              id="dns-listen-port"
              value={listenPort}
              onChange={(e) => setListenPort(e.target.value)}
              className="w-full bg-fx-elevated rounded-lg px-3 py-1.5 text-xs font-mono text-fx-text focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
            />
          </div>
          <div className="p-4 rounded-xl bg-fx-surface space-y-3">
            <Toggle
              pressed={enableGeositePolicy}
              label="按 geosite 分流 DNS"
              onClick={() => setEnableGeositePolicy((v) => !v)}
            />
            <Toggle
              pressed={enableFakeIpFilter}
              label="启用 Fake-IP 过滤"
              onClick={() => setEnableFakeIpFilter((v) => !v)}
            />
            <Toggle
              pressed={enableFallbackFilter}
              label="启用 Fallback 过滤"
              onClick={() => setEnableFallbackFilter((v) => !v)}
            />
          </div>
        </div>
      </div>

      <JsonBlock
        label="直连 DNS"
        hint='写入 nameserver。例如 ["system", "223.5.5.5", "119.29.29.29"]'
        value={directJson}
        onChange={setDirectJson}
      />
      <JsonBlock
        label="代理 DNS"
        hint='写入 fallback。国外地址加 #PROXY，例如 ["8.8.8.8#PROXY", "1.1.1.1#PROXY"]'
        value={proxyJson}
        onChange={setProxyJson}
      />
      <JsonBlock
        label="Fake-IP 过滤"
        hint='这些域名不分配假 IP，例如 ["*.lan", "*.local", "*.msftconnecttest.com"]'
        value={filterJson}
        onChange={setFilterJson}
      />

      <div className="flex items-start gap-2 text-[11px] text-fx-muted">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>
          打开 geosite 分流后，geosite:cn 走直连 DNS，geosite:gfw 和 geolocation-!cn 走代理 DNS。Fallback
          过滤把中国 IP 留在直连结果里。
        </p>
      </div>
    </div>
  )
}

function Toggle({ pressed, label, onClick }: { pressed: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className="flex items-center justify-between gap-3 w-full">
      <span className="text-xs text-fx-text/90">{label}</span>
      <span className={`w-9 h-5 flex items-center rounded-full p-0.5 ${pressed ? 'bg-sky-500' : 'bg-[rgba(100,116,139,0.45)]'}`}>
        <span className={`bg-white w-4 h-4 rounded-full transform ${pressed ? 'translate-x-4' : 'translate-x-0'}`} />
      </span>
    </button>
  )
}

function JsonBlock({
  label,
  hint,
  value,
  onChange
}: {
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="fx-panel rounded-2xl p-5 space-y-2">
      <label className="text-sm font-bold text-fx-text block">{label}</label>
      <p className="text-[11px] text-fx-muted">{hint}</p>
      <textarea
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="w-full min-h-28 bg-fx-bg rounded-xl px-3 py-2 text-xs font-mono text-fx-text focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
      />
    </div>
  )
}
