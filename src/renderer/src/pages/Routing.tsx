import React, { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical,
  Plus,
  Trash2,
  Check,
  Save,
  Route,
  ToggleLeft,
  ToggleRight,
  Database,
  RefreshCw,
  RotateCcw
} from 'lucide-react'
import type { RouteRuleItem, RuleType, ProxyNode, AppConfig } from '../types'
import { DEFAULT_RULES, arrangeRuleSections, ruleSection } from '../../../main/config-generator'

interface RoutingProps {
  config: AppConfig
  onUpdateConfig: (newCfg: AppConfig) => void
}

const RULE_TYPES: { label: string; value: RuleType }[] = [
  { label: '规则集 (GEOSITE)', value: 'GEOSITE' },
  { label: '外部规则集 (RULE-SET)', value: 'RULE-SET' },
  { label: '国家IP (GEOIP)', value: 'GEOIP' },
  { label: '域名后缀 (DOMAIN-SUFFIX)', value: 'DOMAIN-SUFFIX' },
  { label: '关键词 (DOMAIN-KEYWORD)', value: 'DOMAIN-KEYWORD' },
  { label: 'IP网段 (IP-CIDR)', value: 'IP-CIDR' },
  { label: '进程名 (PROCESS-NAME)', value: 'PROCESS-NAME' },
  { label: '默认兜底 (MATCH)', value: 'MATCH' }
]

interface SortableRuleRowProps {
  rule: RouteRuleItem
  index: number
  nodes: ProxyNode[]
  onUpdate: (updated: RouteRuleItem) => void
  onDelete: (id: string) => void
}

const SortableRuleRow: React.FC<SortableRuleRowProps> = ({
  rule,
  index,
  nodes,
  onUpdate,
  onDelete
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rule.id
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.6 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 p-3 rounded-xl border transition-all ${
        rule.enabled
          ? 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
          : 'bg-slate-950/40 border-slate-800/40 opacity-50'
      }`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 p-1"
        title="拖动调整匹配优先级"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Priority index badge */}
      <div className="w-6 text-center text-xs font-mono font-bold text-slate-500">
        #{index + 1}
      </div>

      {/* Rule Type Selector */}
      <select
        value={rule.type}
        onChange={(e) => onUpdate({ ...rule, type: e.target.value as RuleType })}
        className="bg-slate-800/80 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
      >
        {RULE_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {/* Rule Payload Input */}
      <div className="flex-1">
        {rule.type === 'MATCH' ? (
          <div className="text-xs text-slate-500 italic px-2">
            未被上面任何规则命中的流量兜底处理
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder={
                rule.type === 'RULE-SET'
                  ? '规则集名称，如 anti-ad、direct-game、direct-lan、direct-wechat、direct-china'
                  : '匹配内容 (多个以逗号隔开，如: 192.168.0.0/16 或 google.com)'
              }
              value={rule.payload}
              onChange={(e) => onUpdate({ ...rule, payload: e.target.value })}
              className="w-full bg-slate-950/60 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
            />
            {rule.description && (
              <div className="mt-1 text-[10px] leading-relaxed text-slate-500 break-all">
                {rule.description}
              </div>
            )}
          </>
        )}
      </div>

      {/* Target Policy (Supports DIRECT, REJECT, PROXY, or Specific Proxy Node) */}
      <select
        value={rule.target}
        onChange={(e) => onUpdate({ ...rule, target: e.target.value })}
        className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 border focus:outline-none max-w-[200px] truncate ${
          rule.target === 'DIRECT'
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            : rule.target === 'REJECT'
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
              : rule.target === 'PROXY'
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                : 'bg-purple-500/15 text-purple-300 border-purple-500/40 shadow-sm'
        }`}
      >
        <optgroup label="基础策略" className="bg-slate-900 text-slate-400 font-normal">
          <option value="PROXY" className="bg-slate-900 text-blue-400 font-semibold">
            PROXY (默认主节点)
          </option>
          <option value="DIRECT" className="bg-slate-900 text-emerald-400 font-semibold">
            DIRECT (直连)
          </option>
          <option value="REJECT" className="bg-slate-900 text-rose-400 font-semibold">
            REJECT (拦截)
          </option>
        </optgroup>
        {nodes && nodes.length > 0 && (
          <optgroup label="指定具体节点出站" className="bg-slate-900 text-purple-400 font-normal">
            {nodes.map((n) => (
              <option key={n.name} value={n.name} className="bg-slate-900 text-slate-200">
                ⚡ {n.name} ({n.type})
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {/* Enable / Disable switch */}
      <button
        onClick={() => onUpdate({ ...rule, enabled: !rule.enabled })}
        className={`p-1 text-xs rounded transition ${
          rule.enabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-600 hover:text-slate-400'
        }`}
        title={rule.enabled ? '规则已启用 (点击禁用)' : '规则已禁用 (点击启用)'}
        aria-pressed={rule.enabled}
        aria-label={rule.enabled ? '禁用这条规则' : '启用这条规则'}
      >
        {rule.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
      </button>

      {/* Delete Rule */}
      <button
        onClick={() => onDelete(rule.id)}
        className="p-1 text-slate-500 hover:text-rose-400 transition"
        title="删除规则"
        aria-label="删除规则"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

export const Routing: React.FC<RoutingProps> = ({ config, onUpdateConfig }) => {
  const [rules, setRules] = useState<RouteRuleItem[]>(() => arrangeRuleSections(config.rules || []).rules)
  const [isSaved, setIsSaved] = useState(false)
  const [isUpdatingGeo, setIsUpdatingGeo] = useState(false)
  const [geoMsg, setGeoMsg] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const configRef = useRef(config)
  const onUpdateRef = useRef(onUpdateConfig)
  configRef.current = config
  onUpdateRef.current = onUpdateConfig

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const persistRules = (next: RouteRuleItem[], immediate: boolean) => {
    next = arrangeRuleSections(next).rules
    setRules(next)
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const write = () => onUpdateRef.current({ ...configRef.current, rules: next })
    if (immediate) write()
    else saveTimer.current = setTimeout(write, 400)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (section: 'custom' | 'reject' | 'direct' | 'match') => (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const sectionRules = rules.filter((rule) => ruleSection(rule) === section)
    const oldIndex = sectionRules.findIndex((rule) => rule.id === active.id)
    const newIndex = sectionRules.findIndex((rule) => rule.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const moved = arrayMove(sectionRules, oldIndex, newIndex)
    const others = rules.filter((rule) => ruleSection(rule) !== section)
    persistRules([...others, ...moved], true)
  }

  const handleUpdateRule = (updated: RouteRuleItem) => {
    const prev = rules.find((r) => r.id === updated.id)
    const next = rules.map((r) => (r.id === updated.id ? updated : r))
    const payloadOnly =
      !!prev &&
      prev.payload !== updated.payload &&
      prev.type === updated.type &&
      prev.target === updated.target &&
      prev.enabled === updated.enabled
    persistRules(next, !payloadOnly)
  }

  const handleDeleteRule = (id: string) => {
    persistRules(
      rules.filter((r) => r.id !== id),
      true
    )
  }

  const handleAddRule = () => {
    const newRule: RouteRuleItem = {
      id: `rule-${Date.now()}`,
      type: 'DOMAIN-SUFFIX',
      payload: '',
      target: 'PROXY',
      enabled: true
    }
    persistRules([newRule, ...rules], true)
  }

  const handleResetDefaultRules = () => {
    persistRules(DEFAULT_RULES.map((rule) => ({ ...rule })), true)
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 1200)
  }

  const handleApplyAndSave = () => {
    persistRules(rules, true)
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 1200)
  }

  const handleUpdateGeoData = async () => {
    setIsUpdatingGeo(true)
    setGeoMsg('')
    try {
      const res = (await window.api?.updateGeoData()) as { message?: string } | undefined
      if (res) {
        setGeoMsg(res.message || '')
        setTimeout(() => setGeoMsg(''), 4000)
      }
    } finally {
      setIsUpdatingGeo(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header action bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Route className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-slate-100">自由路由分流 (自上而下首命中匹配)</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            分三块，从上到下匹配。自定义规则在最前，然后是两条广告拦截，再是直连。同一块里可以拖动排序。
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleResetDefaultRules}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition"
            title="恢复默认分流：自定义为空，广告拦截，然后是直连和兜底"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>恢复默认分流</span>
          </button>

          <button
            onClick={handleUpdateGeoData}
            disabled={isUpdatingGeo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition"
            title="下载 GeoIP、GeoSite、Country MMDB、anti-AD 和四条直连规则集"
          >
            <Database className="w-3.5 h-3.5 text-blue-400" />
            <RefreshCw className={`w-3 h-3 ${isUpdatingGeo ? 'animate-spin' : ''}`} />
            <span>{isUpdatingGeo ? '正在更新规则库...' : '更新规则库'}</span>
          </button>

          <button
            onClick={handleAddRule}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>添加分流规则</span>
          </button>

          <button
            onClick={handleApplyAndSave}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              isSaved
                ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            {isSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{isSaved ? '已保存并热生效' : '保存生效'}</span>
          </button>
        </div>
      </div>

      {geoMsg && (
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
          {geoMsg}
        </div>
      )}

      {(
        [
          {
            id: 'custom' as const,
            title: '自定义规则',
            hint: '优先匹配。自己加的域名、网段、进程和其他规则都在这里。',
            accent: 'text-blue-300'
          },
          {
            id: 'reject' as const,
            title: '广告拦截',
            hint: 'anti-AD 默认关闭。geosite 广告名单默认打开。',
            accent: 'text-rose-300'
          },
          {
            id: 'direct' as const,
            title: '直连',
            hint: '局域网名单、微软联网探测、游戏下载、微信、中国大陆名单，以及 geosite:cn 和 GEOIP CN。',
            accent: 'text-emerald-300'
          }
        ] as const
      ).map((section) => {
        const items = rules.filter((rule) => ruleSection(rule) === section.id)
        const offset = rules.findIndex((rule) => rule.id === items[0]?.id)
        return (
          <section key={section.id} className="rounded-2xl border border-slate-800/80 bg-slate-950/30 p-4 space-y-3">
            <div>
              <h3 className={`text-sm font-bold ${section.accent}`}>{section.title}</h3>
              <p className="text-[11px] text-slate-500 mt-1">{section.hint}</p>
            </div>
            {items.length === 0 ? (
              <div className="text-xs text-slate-500 px-1">这一块还没有规则。</div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd(section.id)}
              >
                <SortableContext items={items.map((rule) => rule.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {items.map((rule, idx) => (
                      <SortableRuleRow
                        key={rule.id}
                        rule={rule}
                        index={(offset < 0 ? 0 : offset) + idx}
                        nodes={config.nodes || []}
                        onUpdate={handleUpdateRule}
                        onDelete={handleDeleteRule}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </section>
        )
      })}

      {rules.some((rule) => ruleSection(rule) === 'match') && (
        <section className="rounded-2xl border border-slate-800/80 bg-slate-950/30 p-4 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-300">兜底</h3>
            <p className="text-[11px] text-slate-500 mt-1">前面都没命中时走这里。</p>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd('match')}>
            <SortableContext
              items={rules.filter((rule) => ruleSection(rule) === 'match').map((rule) => rule.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {rules
                  .filter((rule) => ruleSection(rule) === 'match')
                  .map((rule) => (
                    <SortableRuleRow
                      key={rule.id}
                      rule={rule}
                      index={rules.findIndex((item) => item.id === rule.id)}
                      nodes={config.nodes || []}
                      onUpdate={handleUpdateRule}
                      onDelete={handleDeleteRule}
                    />
                  ))}
              </div>
            </SortableContext>
          </DndContext>
        </section>
      )}
    </div>
  )
}
