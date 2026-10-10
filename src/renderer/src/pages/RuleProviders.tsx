import React, { useState, useEffect } from 'react'
import {
  Database,
  RefreshCw,
  HardDrive,
  FileCode,
  ArrowRight,
  ShieldCheck
} from 'lucide-react'
import type { AppConfig } from '../types'
import { DIRECT_RULE_SETS } from '../../../main/config-generator'

interface RuleProvidersProps {
  config?: AppConfig
  onUpdateConfig?: (newCfg: AppConfig) => void
  onNavigateToRouting: () => void
}

interface GeoFileStatus {
  exists: boolean
  sizeMb: number
  updatedAt: number
}

interface GeoStatus {
  geoip: GeoFileStatus
  geosite: GeoFileStatus
  mmdb?: GeoFileStatus
  antiAd?: GeoFileStatus
  directRules?: { name: string; exists: boolean; sizeKb: number; updatedAt: number }[]
}

export const RuleProviders: React.FC<RuleProvidersProps> = ({
  onNavigateToRouting
}) => {
  const [geoStatus, setGeoStatus] = useState<GeoStatus | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')

  const fetchStatus = async () => {
    const st = (await window.api?.getGeoDataStatus()) as GeoStatus | undefined
    if (st) setGeoStatus(st)
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  const handleUpdateAll = async () => {
    setIsUpdating(true)
    setUpdateMsg('')
    try {
      const res = (await window.api?.updateGeoData()) as { message?: string } | undefined
      if (res) {
        setUpdateMsg(res.message || '')
        await fetchStatus()
        setTimeout(() => setUpdateMsg(''), 5000)
      }
    } finally {
      setIsUpdating(false)
    }
  }

  const formatDate = (ms?: number) => {
    if (!ms) return '未知'
    return new Date(ms).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-slate-100">规则库管理</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            管理 GeoSite、GeoIP、Country MMDB、anti-AD，以及四条直连规则集。一键更新会一起下载。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateToRouting}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
          >
            <span>配置路由分流规则</span>
            <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
          </button>

          <button
            onClick={handleUpdateAll}
            disabled={isUpdating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-lg shadow-blue-500/10 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
            <span>{isUpdating ? '正在下载更新规则库...' : '一键更新全部规则库'}</span>
          </button>
        </div>
      </div>

      {updateMsg && (
        <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 flex-shrink-0" />
          <span>{updateMsg}</span>
        </div>
      )}

      {/* Geo Data File Status Cards (3 Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* GeoSite.dat */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
                <FileCode className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-slate-100 text-sm">GeoSite 域名规则库</div>
                <div className="text-[11px] text-slate-400 font-mono">geosite.dat</div>
              </div>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                geoStatus?.geosite.exists
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-slate-800 text-slate-500'
              }`}
            >
              {geoStatus?.geosite.exists ? '已就绪' : '未下载'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/60 text-xs">
            <div>
              <span className="text-slate-500">文件大小:</span>{' '}
              <span className="font-mono text-slate-200">
                {geoStatus?.geosite.sizeMb ? `${geoStatus.geosite.sizeMb} MB` : '--'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">最后更新:</span>{' '}
              <span className="font-mono text-slate-200">
                {formatDate(geoStatus?.geosite.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        {/* GeoIP.dat */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-slate-100 text-sm">GeoIP IP 网段库</div>
                <div className="text-[11px] text-slate-400 font-mono">geoip.dat</div>
              </div>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                geoStatus?.geoip.exists
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-slate-800 text-slate-500'
              }`}
            >
              {geoStatus?.geoip.exists ? '已就绪' : '未下载'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/60 text-xs">
            <div>
              <span className="text-slate-500">文件大小:</span>{' '}
              <span className="font-mono text-slate-200">
                {geoStatus?.geoip.sizeMb ? `${geoStatus.geoip.sizeMb} MB` : '--'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">最后更新:</span>{' '}
              <span className="font-mono text-slate-200">
                {formatDate(geoStatus?.geoip.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Country.mmdb */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-slate-100 text-sm">Country MMDB 数据库</div>
                <div className="text-[11px] text-slate-400 font-mono">country.mmdb</div>
              </div>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                geoStatus?.mmdb?.exists
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-slate-800 text-slate-500'
              }`}
            >
              {geoStatus?.mmdb?.exists ? '已就绪' : '未下载'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/60 text-xs">
            <div>
              <span className="text-slate-500">文件大小:</span>{' '}
              <span className="font-mono text-slate-200">
                {geoStatus?.mmdb?.sizeMb ? `${geoStatus.mmdb.sizeMb} MB` : '--'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">最后更新:</span>{' '}
              <span className="font-mono text-slate-200">
                {formatDate(geoStatus?.mmdb?.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-slate-100 text-sm">anti-AD 广告域名</div>
                <div className="text-[11px] text-slate-400 font-mono">providers/anti-ad.yaml</div>
              </div>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                geoStatus?.antiAd?.exists
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-slate-800 text-slate-500'
              }`}
            >
              {geoStatus?.antiAd?.exists ? '已就绪' : '未下载'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/60 text-xs">
            <div>
              <span className="text-slate-500">文件大小:</span>{' '}
              <span className="font-mono text-slate-200">
                {geoStatus?.antiAd?.sizeMb ? `${geoStatus.antiAd.sizeMb} MB` : '--'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">最后更新:</span>{' '}
              <span className="font-mono text-slate-200">
                {formatDate(geoStatus?.antiAd?.updatedAt)}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            安装包内置一份。路由规则里启用 RULE-SET、载荷 anti-ad 之后，内核用这份名单拒绝广告域名。
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-emerald-300">直连规则集</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {DIRECT_RULE_SETS.map((preset) => {
            const status = geoStatus?.directRules?.find((item) => item.name === preset.name)
            const label =
              preset.name === 'direct-game'
                ? '游戏下载'
                : preset.name === 'direct-lan'
                  ? '局域网'
                  : preset.name === 'direct-wechat'
                    ? '微信'
                    : '中国大陆'
            return (
              <div
                key={preset.name}
                className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-100 text-sm">{label}</div>
                    <div className="text-[11px] text-slate-400 font-mono">providers/{preset.name}.list</div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      status?.exists
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {status?.exists ? '已就绪' : '未下载'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/60 text-xs">
                  <div>
                    <span className="text-slate-500">文件大小:</span>{' '}
                    <span className="font-mono text-slate-200">
                      {status?.exists ? `${status.sizeKb} KB` : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">最后更新:</span>{' '}
                    <span className="font-mono text-slate-200">{formatDate(status?.updatedAt)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
