import React, { useState, useEffect } from 'react'
import {
  Server,
  Zap,
  Plus,
  RotateCw,
  Trash2,
  CheckCircle2,
  Search,
  Wifi,
  WifiOff,
  Edit3,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  Clock,
  HardDrive,
  Link2,
  Clipboard,
  Code2,
  PlusCircle,
  Eye,
  EyeOff
} from 'lucide-react'
import type { AppConfig, SubscriptionProfile, ProxyNode } from '../types'

interface ProxiesProps {
  config: AppConfig
  onUpdateConfig: (newCfg: AppConfig, options?: { persist?: 'memory' }) => void
}

export const Proxies: React.FC<ProxiesProps> = ({ config, onUpdateConfig }) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSubFilter, setSelectedSubFilter] = useState<string>('ALL')
  const [isTestingAll, setIsTestingAll] = useState(false)
  const [testingNode, setTestingNode] = useState<string | null>(null)
  const [nodeDelays, setNodeDelays] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      Object.entries(config.nodeDelays || {}).map(([name, record]) => [name, record.delay])
    )
  )
  const [sortBy, setSortBy] = useState<'default' | 'delay'>('default')
  const [nodeTraffic, setNodeTraffic] = useState<
    Record<string, { upload: number; download: number }>
  >({})

  // Subscription Drawer / Modal States
  const [showAddSub, setShowAddSub] = useState(false)
  const [subUrl, setSubUrl] = useState('')
  const [subName, setSubName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Manual Link Import States
  const [showImportModal, setShowImportModal] = useState(false)
  const [importText, setImportText] = useState('')
  const [importName, setImportName] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState('')

  // Updating States
  const [updatingSubId, setUpdatingSubId] = useState<string | null>(null)
  const [isUpdatingAll, setIsUpdatingAll] = useState(false)

  // Edit Subscription Modal State
  const [editingSub, setEditingSub] = useState<SubscriptionProfile | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')

  // Edit / Create Proxy Node Modal State
  const [editingNode, setEditingNode] = useState<ProxyNode | null>(null)
  const [isCreatingNewNode, setIsCreatingNewNode] = useState(false)
  const [nodeForm, setNodeForm] = useState({
    name: '',
    type: 'ss',
    server: '',
    port: 443,
    passwordOrUuid: '',
    cipher: '',
    network: 'tcp',
    path: '',
    tls: false,
    sni: '',
    rawJson: '',
    showRawJson: false
  })
  const [editNodeError, setEditNodeError] = useState('')
  const [isSavingNode, setIsSavingNode] = useState(false)

  // Toggle Collapse for Subscription Management Section
  const [isSubsCollapsed, setIsSubsCollapsed] = useState(false)

  // Desensitize / Mask Server IP & Port (Default is TRUE / hidden)
  const [maskServerInfo, setMaskServerInfo] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('draft-one_mask_server_info')
      return saved !== null ? saved === 'true' : true
    } catch {
      return true
    }
  })

  const toggleMaskServerInfo = () => {
    setMaskServerInfo((prev) => {
      const next = !prev
      try {
        localStorage.setItem('draft-one_mask_server_info', String(next))
      } catch {}
      return next
    })
  }

  const maskServer = (server: string): string => {
    if (!server) return ''
    const ipv4Match = server.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipv4Match) {
      return `${ipv4Match[1]}.***.***.${ipv4Match[4]}`
    }
    if (server.includes(':')) {
      const clean = server.replace(/^\[|\]$/g, '')
      const parts = clean.split(':')
      if (parts.length > 2) {
        return `${parts[0]}:****:****:${parts[parts.length - 1]}`
      }
      return `${clean.slice(0, 4)}:****:${clean.slice(-4)}`
    }
    const parts = server.split('.')
    if (parts.length > 2) {
      return `***.${parts.slice(-2).join('.')}`
    }
    if (parts.length === 2) {
      return `${parts[0].slice(0, 2)}***.${parts[1]}`
    }
    return `${server.slice(0, 2)}***${server.slice(-2)}`
  }

  const maskPort = (port?: number | string): string => {
    if (!port) return '****'
    const pStr = String(port)
    if (pStr.length >= 4) {
      return `${pStr.slice(0, 1)}**${pStr.slice(-1)}`
    }
    return '****'
  }

  useEffect(() => {
    const fetchTraffic = async () => {
      // @ts-ignore
      const t = await window.api?.getTrafficSummary()
      if (t?.nodeStats) {
        setNodeTraffic(t.nodeStats)
      }
    }
    fetchTraffic()
    const timer = setInterval(fetchTraffic, 3000)
    return () => clearInterval(timer)
  }, [])

  const formatBytes = (bytes = 0) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '未知'
    const d = new Date(timestamp > 1e11 ? timestamp : timestamp * 1000)
    return d.toLocaleDateString()
  }

  const formatDateTime = (timestamp?: number) => {
    if (!timestamp) return '未知'
    const d = new Date(timestamp)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
      d.getMinutes()
    ).padStart(2, '0')}`
  }

  const handleSelectNode = async (nodeName: string) => {
    // @ts-ignore
    await window.api?.selectNode(nodeName)
    onUpdateConfig({ ...config, activeNode: nodeName })
  }

  const handleTestSingle = async (e: React.MouseEvent, nodeName: string) => {
    e.stopPropagation()
    setTestingNode(nodeName)
    // @ts-ignore
    const result = await window.api?.testNodeDelay(nodeName)
    const delay = typeof result === 'number' ? result : result?.delay
    const testedAt = typeof result === 'number' ? Date.now() : result?.testedAt || Date.now()
    if (typeof delay === 'number') {
      setNodeDelays((prev) => ({ ...prev, [nodeName]: delay }))
      onUpdateConfig(
        {
          ...config,
          nodeDelays: { ...(config.nodeDelays || {}), [nodeName]: { delay, testedAt } }
        },
        { persist: 'memory' }
      )
    }
    setTestingNode(null)
  }

  const handleTestAll = async () => {
    if (isTestingAll || (config.nodes || []).length === 0) return
    setIsTestingAll(true)
    // @ts-ignore
    const payload = await window.api?.testAllNodes()
    const results = payload && !Array.isArray(payload) && payload.results ? payload.results : payload
    if (results && typeof results === 'object') {
      const testedAt = payload?.testedAt || Date.now()
      const nextDelays = { ...(config.nodeDelays || {}) }
      for (const [name, delay] of Object.entries(results as Record<string, number>)) {
        if (typeof delay === 'number') nextDelays[name] = { delay, testedAt }
      }
      setNodeDelays((prev) => ({ ...prev, ...(results as Record<string, number>) }))
      onUpdateConfig({ ...config, nodeDelays: nextDelays }, { persist: 'memory' })
    }
    setIsTestingAll(false)
  }

  const handleAddSubscription = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subUrl.trim()) return

    setIsSubmitting(true)
    setErrorMsg('')
    try {
      // @ts-ignore
      const res = await window.api?.addSubscription(subUrl.trim(), subName.trim() || '新订阅')
      if (res.success) {
        // @ts-ignore
        const latestCfg = await window.api?.getConfig()
        onUpdateConfig(latestCfg)
        setSubUrl('')
        setSubName('')
        setShowAddSub(false)
      } else {
        setErrorMsg(res.error || '添加订阅失败，请检查链接')
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleImportLinks = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!importText.trim()) return

    setIsImporting(true)
    setImportError('')
    try {
      // @ts-ignore
      const res = await window.api?.importShareLinks(
        importText.trim(),
        importName.trim() || '手动导入节点'
      )
      if (res.success) {
        // @ts-ignore
        const latestCfg = await window.api?.getConfig()
        onUpdateConfig(latestCfg)
        setImportText('')
        setImportName('')
        setShowImportModal(false)
      } else {
        setImportError(res.error || '解析分享链接失败，请确认链接格式')
      }
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsImporting(false)
    }
  }

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) setImportText(text)
    } catch (e) {
      console.warn('Failed to read clipboard:', e)
    }
  }

  const handleUpdateSub = async (id: string) => {
    setUpdatingSubId(id)
    try {
      // @ts-ignore
      await window.api?.updateSubscription(id)
      // @ts-ignore
      const latestCfg = await window.api?.getConfig()
      onUpdateConfig(latestCfg)
    } finally {
      setUpdatingSubId(null)
    }
  }

  const handleUpdateAllSubs = async () => {
    if (isUpdatingAll) return
    setIsUpdatingAll(true)
    try {
      // @ts-ignore
      await window.api?.updateAllSubscriptions()
      // @ts-ignore
      const latestCfg = await window.api?.getConfig()
      onUpdateConfig(latestCfg)
    } finally {
      setIsUpdatingAll(false)
    }
  }

  const handleToggleSub = async (id: string, currentEnabled: boolean) => {
    // @ts-ignore
    await window.api?.toggleSubscription(id, !currentEnabled)
    // @ts-ignore
    const latestCfg = await window.api?.getConfig()
    onUpdateConfig(latestCfg)
  }

  const handleOpenEdit = (sub: SubscriptionProfile) => {
    setEditingSub(sub)
    setEditName(sub.name)
    setEditUrl(sub.url)
  }

  const handleSaveEdit = async () => {
    if (!editingSub) return
    // @ts-ignore
    await window.api?.editSubscription(editingSub.id, editName.trim(), editUrl.trim())
    // @ts-ignore
    const latestCfg = await window.api?.getConfig()
    onUpdateConfig(latestCfg)
    setEditingSub(null)
  }

  const handleDeleteSub = async (id: string) => {
    if (confirm('确认删除该订阅及其所有节点？')) {
      // @ts-ignore
      await window.api?.deleteSubscription(id)
      // @ts-ignore
      const latestCfg = await window.api?.getConfig()
      onUpdateConfig(latestCfg)
      if (selectedSubFilter === id) {
        setSelectedSubFilter('ALL')
      }
    }
  }

  const handleStartEditNode = (node: ProxyNode) => {
    const raw = (node.raw || {}) as Record<string, any>
    const type = (node.type || raw.type || 'ss').toLowerCase()
    const passwordOrUuid = String(raw.password || raw.uuid || raw.secret || raw.token || '')
    const cipher = String(raw.cipher || raw.method || '')
    const network = String(raw.network || 'tcp')
    const path = String(
      (raw['ws-opts'] && raw['ws-opts'].path) ||
        (raw['http-opts'] && raw['http-opts'].path) ||
        raw.path ||
        ''
    )
    const tls = Boolean(raw.tls)
    const sni = String(raw.servername || raw.sni || '')

    setNodeForm({
      name: node.name,
      type,
      server: node.server || raw.server || '',
      port: node.port || raw.port || 443,
      passwordOrUuid,
      cipher,
      network,
      path,
      tls,
      sni,
      rawJson: JSON.stringify(raw, null, 2),
      showRawJson: false
    })
    setEditNodeError('')
    setEditingNode(node)
  }

  const handleOpenAddManualNode = () => {
    setEditingNode(null)
    setIsCreatingNewNode(true)
    setNodeForm({
      name: `自建节点-${(config.nodes || []).length + 1}`,
      type: 'ss',
      server: '',
      port: 443,
      passwordOrUuid: '',
      cipher: '2022-blake3-aes-128-gcm',
      network: 'tcp',
      path: '',
      tls: false,
      sni: '',
      rawJson: '',
      showRawJson: false
    })
    setEditNodeError('')
  }

  const handleDeleteNode = async (nodeName: string) => {
    if (!confirm(`确认删除代理节点【${nodeName}】？`)) return
    try {
      // @ts-ignore
      const res = await window.api?.deleteNode(nodeName)
      if (res?.success) {
        // @ts-ignore
        const latestCfg = await window.api?.getConfig()
        if (latestCfg) {
          onUpdateConfig(latestCfg)
        } else {
          const remaining = (config.nodes || []).filter((n) => n.name !== nodeName)
          onUpdateConfig({
            ...config,
            nodes: remaining,
            activeNode: config.activeNode === nodeName ? remaining[0]?.name || '' : config.activeNode
          })
        }
      }
    } catch (e) {
      console.error('Failed to delete node:', e)
    }
  }

  const handleSaveNode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isCreatingNewNode && !editingNode) return

    if (!nodeForm.name.trim()) {
      setEditNodeError('节点名称不能为空')
      return
    }
    if (!nodeForm.server.trim()) {
      setEditNodeError('服务器地址不能为空')
      return
    }
    if (!nodeForm.port || nodeForm.port <= 0 || nodeForm.port > 65535) {
      setEditNodeError('端口必须在 1-65535 之间')
      return
    }

    setIsSavingNode(true)
    setEditNodeError('')

    try {
      let finalRaw: Record<string, any> = {}

      if (nodeForm.showRawJson && nodeForm.rawJson.trim()) {
        try {
          finalRaw = JSON.parse(nodeForm.rawJson)
        } catch {
          setEditNodeError('高级原始 JSON 格式有误，请检查语法')
          setIsSavingNode(false)
          return
        }
      } else {
        finalRaw = { ...((editingNode?.raw || {}) as Record<string, any>) }
      }

      finalRaw.name = nodeForm.name.trim()
      finalRaw.server = nodeForm.server.trim()
      finalRaw.port = Number(nodeForm.port)
      finalRaw.type = nodeForm.type.trim()

      if (['vmess', 'vless'].includes(nodeForm.type.toLowerCase())) {
        finalRaw.uuid = nodeForm.passwordOrUuid.trim()
        if (nodeForm.type.toLowerCase() === 'vmess') {
          finalRaw.cipher = nodeForm.cipher || 'auto'
        }
      } else {
        finalRaw.password = nodeForm.passwordOrUuid.trim()
        if (nodeForm.cipher) {
          finalRaw.cipher = nodeForm.cipher.trim()
        }
      }

      finalRaw.tls = nodeForm.tls
      if (nodeForm.sni) {
        finalRaw.servername = nodeForm.sni.trim()
        finalRaw.sni = nodeForm.sni.trim()
      }

      if (nodeForm.network) {
        finalRaw.network = nodeForm.network
        if (nodeForm.network === 'ws' && nodeForm.path) {
          finalRaw['ws-opts'] = {
            ...(finalRaw['ws-opts'] || {}),
            path: nodeForm.path
          }
        }
      }

      if (isCreatingNewNode) {
        const newNode: ProxyNode = {
          name: nodeForm.name.trim(),
          server: nodeForm.server.trim(),
          port: Number(nodeForm.port),
          type: nodeForm.type.trim(),
          isManual: true,
          subId: 'manual',
          subName: '本地手动',
          raw: finalRaw
        }
        // @ts-ignore
        const res = await window.api?.addNode(newNode)
        if (res && !res.success) {
          setEditNodeError(res.error || '创建节点失败')
          setIsSavingNode(false)
          return
        }
      } else {
        if (!editingNode) return
        const updatedNode: ProxyNode = {
          ...editingNode,
          name: nodeForm.name.trim(),
          server: nodeForm.server.trim(),
          port: Number(nodeForm.port),
          type: nodeForm.type.trim(),
          raw: finalRaw
        }

        // @ts-ignore
        const res = await window.api?.editNode(editingNode.name, updatedNode)
        if (res && !res.success) {
          setEditNodeError(res.error || '保存节点配置失败')
          setIsSavingNode(false)
          return
        }
      }

      // @ts-ignore
      const latestCfg = await window.api?.getConfig()
      if (latestCfg) {
        onUpdateConfig(latestCfg)
      }

      setEditingNode(null)
      setIsCreatingNewNode(false)
    } catch (err: unknown) {
      setEditNodeError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSavingNode(false)
    }
  }

  // Count manual nodes
  const manualNodesCount = (config.nodes || []).filter(
    (n) => n.isManual || n.subId === 'manual' || (n.subId && n.subId.startsWith('sub-manual'))
  ).length

  // Filter nodes based on selected subscription tab and search query
  const delayOf = (name: string) => nodeDelays[name] ?? config.nodeDelays?.[name]?.delay

  const filteredNodes = (config.nodes || []).filter((n) => {
    if (selectedSubFilter === 'MANUAL') {
      if (!n.isManual && n.subId !== 'manual' && (!n.subId || !n.subId.startsWith('sub-manual'))) {
        return false
      }
    } else if (selectedSubFilter !== 'ALL') {
      if (n.subId !== selectedSubFilter) {
        return false
      }
    }
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      n.name.toLowerCase().includes(q) ||
      n.type.toLowerCase().includes(q) ||
      (n.server && n.server.toLowerCase().includes(q)) ||
      (n.subName && n.subName.toLowerCase().includes(q))
    )
  })

  const visibleNodes =
    sortBy === 'delay'
      ? [...filteredNodes].sort((a, b) => {
          const rank = (delay?: number) => (delay === undefined ? 1_000_000_000 : delay < 0 ? 900_000_000 : delay)
          return rank(delayOf(a.name)) - rank(delayOf(b.name))
        })
      : filteredNodes

  const subscriptions = config.subscriptions || []
  const activeSubsCount = subscriptions.filter((s) => s.enabled).length

  const getDelayBadge = (delay?: number) => {
    if (delay === undefined) {
      return (
        <span className="text-[11px] font-mono text-fx-muted flex items-center gap-1">
          <Wifi className="w-3 h-3 text-fx-muted" />
          未测速
        </span>
      )
    }
    if (delay < 0) {
      return (
        <span className="text-[11px] font-mono text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
          <WifiOff className="w-3 h-3" />
          超时
        </span>
      )
    }
    if (delay < 200) {
      return (
        <span className="text-[11px] font-mono text-fx-accent bg-fx-accent-dim px-1.5 py-0.5 rounded">
          {delay} ms
        </span>
      )
    }
    if (delay < 500) {
      return (
        <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
          {delay} ms
        </span>
      )
    }
    return (
      <span className="text-[11px] font-mono text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">
        {delay} ms
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Core Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-fx-accent" />
            <h2 className="text-lg font-bold text-fx-text">节点中心 (以节点为准)</h2>
          </div>
          <p className="text-xs text-fx-muted mt-1">
            支持多订阅聚合管理与用量监控，点击节点直接秒切出站代理。
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowAddSub(!showAddSub)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-cyan-400 text-xs font-semibold text-white shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>添加订阅</span>
          </button>

          <button
            onClick={handleOpenAddManualNode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white shadow-sm transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>新建自建节点</span>
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fx-surface hover:bg-fx-surface-hover text-xs font-semibold text-fx-text shadow-sm transition"
          >
            <Link2 className="w-4 h-4 text-fx-accent" />
            <span>导入分享链接</span>
          </button>

          <button
            onClick={handleUpdateAllSubs}
            disabled={isUpdatingAll || subscriptions.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${ isUpdatingAll ? 'bg-fx-surface text-fx-muted ' : 'bg-fx-surface hover:bg-fx-surface-hover text-fx-text ' }`}
          >
            <RotateCw className={`w-3.5 h-3.5 ${isUpdatingAll ? 'animate-spin text-fx-accent' : ''}`} />
            <span>{isUpdatingAll ? '正在同步...' : '更新所有订阅'}</span>
          </button>

          <button
            onClick={handleTestAll}
            disabled={isTestingAll || (config.nodes || []).length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${ isTestingAll ? 'bg-fx-surface text-fx-muted ' : 'bg-fx-surface hover:bg-fx-surface-hover text-fx-text ' }`}
          >
            <Zap className={`w-4 h-4 text-amber-400 ${isTestingAll ? 'animate-bounce' : ''}`} />
            <span>{isTestingAll ? '正在批量测速...' : '一键批量测速'}</span>
          </button>
        </div>
      </div>

      {/* Add Subscription Drawer / Form */}
      {showAddSub && (
        <form
          onSubmit={handleAddSubscription}
          className="p-5 rounded-2xl bg-fx-surface space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-fx-text flex items-center gap-2">
              <Plus className="w-4 h-4 text-fx-accent" />
              <span>添加新机场订阅</span>
            </div>
            <button
              type="button"
              onClick={() => setShowAddSub(false)}
              className="text-xs text-fx-muted hover:text-fx-text/90"
            >
              关闭
            </button>
          </div>

          {errorMsg && <div className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded-lg">{errorMsg}</div>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="订阅备注名称 (如: 主力机场、备用海豚)"
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              className="bg-fx-bg rounded-lg px-3 py-2 text-xs text-fx-text focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
            />
            <input
              type="text"
              placeholder="https://... 订阅链接 (Clash/V2ray/Base64)"
              value={subUrl}
              onChange={(e) => setSubUrl(e.target.value)}
              className="md:col-span-2 bg-fx-bg rounded-lg px-3 py-2 text-xs text-fx-text focus:outline-none focus:ring-1 focus:ring-fx-accent/40 font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowAddSub(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-fx-muted hover:text-fx-text"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-1.5 rounded-lg bg-sky-500 hover:bg-cyan-400 text-xs font-semibold text-white shadow"
            >
              {isSubmitting ? '正在拉取...' : '立即拉取并聚合'}
            </button>
          </div>
        </form>
      )}

      {/* Edit Subscription Modal */}
      {editingSub && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-fx-elevated rounded-2xl p-5 max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-fx-text flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-fx-accent" />
                编辑订阅信息
              </h3>
              <button
                onClick={() => setEditingSub(null)}
                className="text-xs text-fx-muted hover:text-fx-text/90"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-fx-muted block mb-1">订阅备注名称</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-fx-bg rounded-lg px-3 py-2 text-xs text-fx-text focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
                />
              </div>
              <div>
                <label className="text-[11px] text-fx-muted block mb-1">订阅链接 URL</label>
                <input
                  type="text"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="w-full bg-fx-bg rounded-lg px-3 py-2 text-xs text-fx-text focus:outline-none focus:ring-1 focus:ring-fx-accent/40 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingSub(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-fx-muted hover:text-fx-text"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-cyan-400 text-xs font-semibold text-white shadow"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Share Links Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleImportLinks}
            className="bg-fx-elevated rounded-2xl p-5 max-w-lg w-full space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-fx-text flex items-center gap-2">
                <Link2 className="w-4 h-4 text-fx-accent" />
                手动导入节点分享链接
              </h3>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="text-xs text-fx-muted hover:text-fx-text/90"
              >
                ✕
              </button>
            </div>

            {importError && (
              <div className="text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-lg">
                {importError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-fx-muted block mb-1">
                  分组/来源名称 (选填)
                </label>
                <input
                  type="text"
                  placeholder="手动导入节点"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  className="w-full bg-fx-bg rounded-lg px-3 py-2 text-xs text-fx-text focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-fx-muted block">
                    节点链接或 Base64 文本 (每行一条)
                  </label>
                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    className="flex items-center gap-1 text-[11px] text-fx-accent hover:text-fx-accent"
                  >
                    <Clipboard className="w-3 h-3" />
                    <span>从剪贴板粘贴</span>
                  </button>
                </div>
                <textarea
                  rows={6}
                  placeholder={`支持 vmess://, vless://, ss://, trojan://, hysteria2:// (hy2://)\n每行一条链接，或直接粘贴整段 Base64 订阅文本...`}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className="w-full bg-fx-bg rounded-lg p-3 text-xs text-fx-text font-mono focus:outline-none focus:ring-1 focus:ring-fx-accent/40 resize-none leading-relaxed"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-fx-muted hover:text-fx-text"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isImporting || !importText.trim()}
                className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-cyan-400 disabled:opacity-50 text-xs font-semibold text-white shadow"
              >
                {isImporting ? '正在解析导入...' : '确认导入节点'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit / Create Proxy Node Modal */}
      {(editingNode || isCreatingNewNode) && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveNode}
            className="bg-fx-elevated rounded-2xl p-5 max-w-xl w-full space-y-4 max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                {isCreatingNewNode ? (
                  <PlusCircle className="w-4 h-4 text-amber-400" />
                ) : (
                  <Edit3 className="w-4 h-4 text-fx-accent" />
                )}
                <h3 className="text-sm font-bold text-fx-text">
                  {isCreatingNewNode ? '新增自建代理节点' : '编辑代理节点配置'}
                </h3>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-fx-accent-dim text-fx-accent">
                  {nodeForm.type}
                </span>
                {isCreatingNewNode && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300">
                    本地独立 · 永不被订阅同步覆盖
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingNode(null)
                  setIsCreatingNewNode(false)
                }}
                className="text-xs text-fx-muted hover:text-fx-text/90"
              >
                ✕
              </button>
            </div>

            {/* Error banner */}
            {editNodeError && (
              <div className="text-xs text-rose-400 bg-rose-500/10 p-2.5 rounded-lg">
                {editNodeError}
              </div>
            )}

            {/* Scrollable Form Body */}
            <div className="overflow-y-auto space-y-3.5 pr-1 text-xs">
              {/* Node Name */}
              <div>
                <label className="text-[11px] font-medium text-fx-muted block mb-1">节点备注名称</label>
                <input
                  type="text"
                  value={nodeForm.name}
                  onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })}
                  className="w-full bg-fx-bg rounded-lg px-3 py-2 text-fx-text focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
                  placeholder="节点名称"
                />
              </div>

              {/* Protocol & Network */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-fx-muted block mb-1">协议类型 (Protocol)</label>
                  <select
                    value={nodeForm.type}
                    onChange={(e) => setNodeForm({ ...nodeForm, type: e.target.value })}
                    className="w-full bg-fx-bg rounded-lg px-3 py-2 text-fx-text focus:outline-none focus:ring-1 focus:ring-fx-accent/40 uppercase font-mono text-[11px]"
                  >
                    <option value="ss">Shadowsocks (SS)</option>
                    <option value="vmess">VMess</option>
                    <option value="vless">VLESS</option>
                    <option value="trojan">Trojan</option>
                    <option value="hysteria2">Hysteria2</option>
                    <option value="socks5">Socks5</option>
                    <option value="http">HTTP</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-fx-muted block mb-1">传输方式 (Network)</label>
                  <select
                    value={nodeForm.network}
                    onChange={(e) => setNodeForm({ ...nodeForm, network: e.target.value })}
                    className="w-full bg-fx-bg rounded-lg px-3 py-2 text-fx-text focus:outline-none focus:ring-1 focus:ring-fx-accent/40 uppercase font-mono text-[11px]"
                  >
                    <option value="tcp">TCP</option>
                    <option value="ws">WebSocket (WS)</option>
                    <option value="grpc">gRPC</option>
                    <option value="h2">HTTP/2 (H2)</option>
                  </select>
                </div>
              </div>

              {/* Server & Port */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-[11px] font-medium text-fx-muted block mb-1">服务器地址 (Domain / IP)</label>
                  <input
                    type="text"
                    value={nodeForm.server}
                    onChange={(e) => setNodeForm({ ...nodeForm, server: e.target.value })}
                    className="w-full bg-fx-bg rounded-lg px-3 py-2 text-fx-text font-mono focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
                    placeholder="example.com 或 1.2.3.4"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-fx-muted block mb-1">端口 (Port)</label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={nodeForm.port}
                    onChange={(e) => setNodeForm({ ...nodeForm, port: parseInt(e.target.value) || 0 })}
                    className="w-full bg-fx-bg rounded-lg px-3 py-2 text-fx-text font-mono focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
                    placeholder="443"
                  />
                </div>
              </div>

              {/* Password or UUID */}
              <div>
                <label className="text-[11px] font-medium text-fx-muted block mb-1">
                  {['vmess', 'vless'].includes(nodeForm.type.toLowerCase()) ? 'UUID / 用户标识' : '连接密码 (Password / Secret)'}
                </label>
                <input
                  type="text"
                  value={nodeForm.passwordOrUuid}
                  onChange={(e) => setNodeForm({ ...nodeForm, passwordOrUuid: e.target.value })}
                  className="w-full bg-fx-bg rounded-lg px-3 py-2 text-fx-text font-mono focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
                  placeholder={['vmess', 'vless'].includes(nodeForm.type.toLowerCase()) ? 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' : '输入密码'}
                />
              </div>

              {/* Cipher */}
              {['ss', 'vmess'].includes(nodeForm.type.toLowerCase()) && (
                <div>
                  <label className="text-[11px] font-medium text-fx-muted block mb-1">加密算法 (Cipher / Method)</label>
                  <input
                    type="text"
                    value={nodeForm.cipher}
                    onChange={(e) => setNodeForm({ ...nodeForm, cipher: e.target.value })}
                    className="w-full bg-fx-bg rounded-lg px-3 py-2 text-fx-text font-mono focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
                    placeholder={nodeForm.type.toLowerCase() === 'vmess' ? 'auto, aes-128-gcm, chacha20-poly1305' : 'aes-256-gcm, chacha20-ietf-poly1305, 2022-blake3-aes-128-gcm'}
                  />
                </div>
              )}

              {/* TLS & SNI */}
              <div className="grid grid-cols-3 gap-3 items-center">
                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="node-tls"
                    checked={nodeForm.tls}
                    onChange={(e) => setNodeForm({ ...nodeForm, tls: e.target.checked })}
                    className="rounded bg-fx-bg text-blue-600 focus:ring-0"
                  />
                  <label htmlFor="node-tls" className="text-[11px] font-medium text-fx-text/90 cursor-pointer">
                    启用 TLS 加密
                  </label>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-medium text-fx-muted block mb-1">SNI 域名伪装 (ServerName)</label>
                  <input
                    type="text"
                    value={nodeForm.sni}
                    onChange={(e) => setNodeForm({ ...nodeForm, sni: e.target.value })}
                    className="w-full bg-fx-bg rounded-lg px-3 py-2 text-fx-text font-mono focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
                    placeholder="tls sni (如: cloudflare.com)"
                  />
                </div>
              </div>

              {/* WS / HTTP Path */}
              {['ws', 'h2'].includes(nodeForm.network.toLowerCase()) && (
                <div>
                  <label className="text-[11px] font-medium text-fx-muted block mb-1">路径 (Path)</label>
                  <input
                    type="text"
                    value={nodeForm.path}
                    onChange={(e) => setNodeForm({ ...nodeForm, path: e.target.value })}
                    className="w-full bg-fx-bg rounded-lg px-3 py-2 text-fx-text font-mono focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
                    placeholder="/ 或 /ws"
                  />
                </div>
              )}

              {/* Toggle Raw JSON mode */}
              <div className="pt-2 fx-divider">
                <button
                  type="button"
                  onClick={() => setNodeForm({ ...nodeForm, showRawJson: !nodeForm.showRawJson })}
                  className="flex items-center gap-1.5 text-[11px] text-fx-accent hover:text-fx-accent"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>{nodeForm.showRawJson ? '收起高级原始 JSON 配置' : '展开高级原始 JSON 配置 (Mihomo 原生参数)'}</span>
                </button>

                {nodeForm.showRawJson && (
                  <div className="mt-2 space-y-1">
                    <div className="text-[10px] text-fx-muted">
                      直接编辑 Mihomo 内核使用的底层原生配置对象。如果启用此项，将直接应用并覆盖上述参数：
                    </div>
                    <textarea
                      rows={6}
                      value={nodeForm.rawJson}
                      onChange={(e) => setNodeForm({ ...nodeForm, rawJson: e.target.value })}
                      className="w-full bg-fx-bg rounded-lg p-3 text-[11px] text-fx-text/90 font-mono focus:outline-none focus:ring-1 focus:ring-fx-accent/40 leading-relaxed"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-3 fx-divider">
              <button
                type="button"
                onClick={() => {
                  setEditingNode(null)
                  setIsCreatingNewNode(false)
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs text-fx-muted hover:text-fx-text"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSavingNode}
                className="px-5 py-1.5 rounded-lg bg-sky-500 hover:bg-cyan-400 disabled:opacity-50 text-xs font-semibold text-white shadow flex items-center gap-1.5"
              >
                {isSavingNode && <RotateCw className="w-3 h-3 animate-spin" />}
                <span>
                  {isCreatingNewNode
                    ? isSavingNode
                      ? '正在创建...'
                      : '确认添加'
                    : isSavingNode
                      ? '正在保存并热重载...'
                      : '保存修改'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Multi-Subscription Management Cards */}
      {subscriptions.length > 0 && (
        <div className="p-4 rounded-2xl bg-fx-elevated space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-fx-accent" />
              <span className="text-xs font-bold text-fx-text">
                多订阅管理 ({subscriptions.length} 个订阅，{activeSubsCount} 个启用)
              </span>
            </div>
            <button
              onClick={() => setIsSubsCollapsed(!isSubsCollapsed)}
              className="text-fx-muted hover:text-fx-text text-xs flex items-center gap-1"
            >
              <span>{isSubsCollapsed ? '展开订阅列表' : '收起面板'}</span>
              {isSubsCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          </div>

          {!isSubsCollapsed && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {subscriptions.map((sub) => {
                const isUpdating = updatingSubId === sub.id
                const usedBytes =
                  (sub.userInfo?.upload || 0) + (sub.userInfo?.download || 0)
                const totalBytes = sub.userInfo?.total || 0
                const percent =
                  totalBytes > 0 ? Math.min(100, Math.round((usedBytes / totalBytes) * 100)) : 0

                return (
                  <div
                    key={sub.id}
                    className={`p-3.5 rounded-xl transition ${ sub.enabled ? 'bg-fx-surface ' : 'bg-fx-bg border-slate-900 opacity-60' }`}
                  >
                    {/* Header: Name, enable toggle, buttons */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={() => handleToggleSub(sub.id, sub.enabled)}
                          className={`w-3 h-3 rounded-full transition flex-shrink-0 ${ sub.enabled ? 'bg-fx-accent ring-2 ring-fx-accent/20' : 'bg-fx-muted' }`}
                          title={sub.enabled ? '点击禁用该订阅' : '点击启用该订阅'}
                        />
                        <span className="text-xs font-bold text-fx-text truncate">{sub.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-fx-surface text-fx-muted font-mono flex-shrink-0">
                          {sub.nodeCount} 节点
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleUpdateSub(sub.id)}
                          disabled={isUpdating}
                          title="立即同步最新节点"
                          className="p-1 rounded text-fx-muted hover:text-fx-accent hover:bg-fx-surface transition"
                        >
                          <RotateCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin text-fx-accent' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(sub)}
                          title="编辑名称或链接"
                          className="p-1 rounded text-fx-muted hover:text-fx-text hover:bg-fx-surface transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSub(sub.id)}
                          title="删除订阅"
                          className="p-1 rounded text-fx-muted hover:text-rose-400 hover:bg-fx-surface transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Quota Progress Bar (if userInfo available) */}
                    {totalBytes > 0 ? (
                      <div className="mt-2.5 space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-fx-muted font-mono">
                          <span className="flex items-center gap-1">
                            <HardDrive className="w-2.5 h-2.5 text-fx-accent" />
                            已用: {formatBytes(usedBytes)} / {formatBytes(totalBytes)}
                          </span>
                          <span className={percent > 90 ? 'text-rose-400' : 'text-fx-muted'}>
                            {percent}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-fx-surface rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${ percent > 90 ? 'bg-rose-500' : percent > 75 ? 'bg-amber-500' : 'bg-blue-500' }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {/* Metadata Footer: Expire date & Last sync */}
                    <div className="flex items-center justify-between gap-2 mt-2 pt-2 fx-divider text-[10px] text-fx-muted">
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-fx-muted" />
                        同步于: {formatDateTime(sub.updatedAt)}
                      </span>
                      {sub.userInfo?.expire ? (
                        <span className="flex items-center gap-1 text-fx-muted">
                          <Calendar className="w-2.5 h-2.5 text-amber-500" />
                          到期: {formatDate(sub.userInfo.expire)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Subscription & Manual Filter Tabs */}
      {(subscriptions.length > 0 || manualNodesCount > 0) && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedSubFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${ selectedSubFilter === 'ALL' ? 'bg-sky-500 text-white shadow-sm' : 'bg-fx-elevated text-fx-muted hover:text-fx-text hover:bg-fx-surface' }`}
          >
            全部节点 ({(config.nodes || []).length})
          </button>

          {/* Dedicated Manual Nodes Management Tab */}
          <button
            onClick={() => setSelectedSubFilter('MANUAL')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${ selectedSubFilter === 'MANUAL' ? 'bg-amber-600 text-white shadow-sm' : 'bg-fx-elevated text-amber-400/80 hover:text-amber-300 hover:bg-fx-surface' }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>📌 本地手动管理</span>
            <span className="text-[10px] opacity-75 font-mono">({manualNodesCount})</span>
          </button>

          {subscriptions.map((sub) => {
            const isSelected = selectedSubFilter === sub.id
            const count = (config.nodes || []).filter((n) => n.subId === sub.id).length
            return (
              <button
                key={sub.id}
                onClick={() => setSelectedSubFilter(sub.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${ isSelected ? 'bg-sky-500 text-white shadow-sm' : 'bg-fx-elevated text-fx-muted hover:text-fx-text hover:bg-fx-surface' }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${ sub.enabled ? 'bg-fx-accent' : 'bg-fx-muted' }`}
                />
                <span>{sub.name}</span>
                <span className="text-[10px] opacity-75 font-mono">({count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Manual Management Active Notification Banner */}
      {selectedSubFilter === 'MANUAL' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-500/10 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <span className="text-base">📌</span>
            <span>
              <strong>本地手动节点专区</strong>：当前显示自建与手动导入节点（共 {manualNodesCount} 个）。此类节点完全独立，不受任何订阅更新影响，支持自由增删改。
            </span>
          </div>
          <button
            onClick={handleOpenAddManualNode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 transition text-xs font-semibold shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>自建新节点</span>
          </button>
        </div>
      )}

      {/* Search & Tool Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-fx-muted" />
          <input
            type="text"
            placeholder="搜索节点名称、协议或服务器地址..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-fx-elevated rounded-xl text-xs text-fx-text placeholder:text-fx-muted focus:outline-none focus:ring-1 focus:ring-fx-accent/40 transition"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Desensitize / Masking Toggle Switch */}
          <button
            type="button"
            onClick={toggleMaskServerInfo}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition ${ maskServerInfo ? 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20' : 'bg-fx-elevated text-fx-text/90 hover:bg-fx-surface' }`}
            title={maskServerInfo ? '当前已对 IP 与端口进行脱敏隐藏，点击显示明文' : '当前正在显示明文 IP 与端口，点击开启脱敏隐藏'}
          >
            {maskServerInfo ? (
              <EyeOff className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Eye className="w-3.5 h-3.5 text-fx-accent" />
            )}
            <span>{maskServerInfo ? 'IP/端口已脱敏' : '明文显示'}</span>
          </button>

          {/* Sort Selector */}
          <select
            aria-label="节点排序"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value === 'delay' ? 'delay' : 'default')}
            className="bg-fx-elevated rounded-xl px-3 py-2 text-xs text-fx-text/90 focus:outline-none focus:ring-1 focus:ring-fx-accent/40"
          >
            <option value="default">默认顺序</option>
            <option value="delay">按延迟排序</option>
          </select>
        </div>
      </div>

      {/* Nodes Grid */}
      {filteredNodes.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-fx-elevated/20 /50">
          <Server className="w-10 h-10 text-fx-muted mx-auto mb-3" />
          <div className="text-sm font-semibold text-fx-text/90">暂无代理节点</div>
          <div className="text-xs text-fx-muted mt-1 max-w-sm mx-auto">
            {subscriptions.length === 0 && manualNodesCount === 0
              ? '点击上方「添加订阅」添加机场订阅，或点击「自建新节点」/「导入分享链接」添加本地节点。'
              : '当前筛选条件下没有节点，或订阅已被禁用。请在上方检查订阅状态。'}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleNodes.map((node) => {
            const isSelected = config.activeNode === node.name
            const delay = delayOf(node.name)
            const testedAt = config.nodeDelays?.[node.name]?.testedAt
            const isPinging = testingNode === node.name
            const isManualNode = node.isManual || node.subId === 'manual' || (node.subId && node.subId.startsWith('sub-manual'))

            return (
              <div
                key={node.name}
                onClick={() => handleSelectNode(node.name)}
                className={`relative group cursor-pointer p-4 rounded-2xl transition-all duration-200 select-none ${isSelected ? 'bg-fx-accent-dim shadow-frost' : 'bg-fx-elevated hover:bg-fx-surface'}`}
              >
                {/* Top protocol & delay */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-fx-surface text-fx-muted">
                      {node.type}
                    </span>
                    {isManualNode ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 truncate max-w-[120px]">
                        📌 本地手动
                      </span>
                    ) : node.subName ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-fx-accent-dim text-fx-accent truncate max-w-[120px]">
                        {node.subName}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => handleTestSingle(e, node.name)}
                      className="p-1 rounded hover:bg-fx-surface text-fx-muted hover:text-amber-400 transition"
                      title="测速该节点"
                      aria-label={`测速 ${node.name}`}
                    >
                      <Zap className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStartEditNode(node)
                      }}
                      className="p-1 rounded hover:bg-fx-surface text-fx-muted hover:text-fx-accent transition"
                      title="编辑节点配置"
                      aria-label={`编辑 ${node.name}`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteNode(node.name)
                      }}
                      className="p-1 rounded hover:bg-fx-surface text-fx-muted hover:text-rose-400 transition"
                      title="删除该节点"
                      aria-label={`删除 ${node.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <span title={testedAt ? `测于 ${formatDateTime(testedAt)}` : '尚未测速'}>
                      {getDelayBadge(delay)}
                    </span>
                  </div>
                </div>

                {/* Node name */}
                <div className="text-sm font-semibold text-fx-text truncate pr-6" title={node.name}>
                  {node.name}
                </div>

                {/* Server/port info if available */}
                {node.server && (
                  <div
                    className="text-[11px] text-fx-muted truncate mt-1 font-mono"
                    title={
                      maskServerInfo
                        ? 'IP 与端口已脱敏隐藏（可在工具栏切换显示明文）'
                        : `${node.server}:${node.port}`
                    }
                  >
                    {maskServerInfo
                      ? `${maskServer(node.server)}:${maskPort(node.port)}`
                      : `${node.server}:${node.port}`}
                  </div>
                )}

                {/* Node cumulative traffic */}
                {nodeTraffic[node.name] &&
                  (nodeTraffic[node.name].upload > 0 || nodeTraffic[node.name].download > 0) && (
                    <div className="flex items-center gap-2 mt-2 pt-2 fx-divider text-[10px] font-mono text-fx-muted">
                      <span className="text-fx-accent">↑ {formatBytes(nodeTraffic[node.name].upload)}</span>
                      <span className="text-fx-accent">↓ {formatBytes(nodeTraffic[node.name].download)}</span>
                    </div>
                  )}

                {/* Selected Checkmark */}
                {isSelected && (
                  <div className="absolute right-3.5 bottom-3.5 text-fx-accent">
                    <CheckCircle2 className="w-5 h-5 fill-blue-500/20" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
