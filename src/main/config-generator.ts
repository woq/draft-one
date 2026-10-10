import YAML from 'yaml'
import type { AppConfig, RouteRuleItem } from '../renderer/src/types'

/** mihomo 规则集。path 相对内核 `-d` 目录（安装目录 data）。 */
export const ANTI_AD_PROVIDER = {
  url: 'https://anti-ad.net/clash.yaml',
  path: './providers/anti-ad.yaml',
  fileName: 'anti-ad.yaml',
  interval: 86400
}

/** 直连优化。名单是 classical 文本，由 mihomo 每 86400 秒用 DIRECT 拉取。 */
export const DIRECT_RULE_SETS = [
  {
    name: 'direct-game',
    url: 'https://rawstatic.com/blackmatrix7/ios_rule_script/master/rule/Clash/Game/GameDownload/GameDownload.list',
    path: './providers/direct-game.list',
    behavior: 'classical' as const,
    format: 'text' as const,
    interval: 86400,
    minBytes: 400,
    description: '游戏下载直连（Steam、Epic、Battle.net 等分发域名）'
  },
  {
    name: 'direct-lan',
    url: 'https://rawstatic.com/blackmatrix7/ios_rule_script/master/rule/Clash/Lan/Lan.list',
    path: './providers/direct-lan.list',
    behavior: 'classical' as const,
    format: 'text' as const,
    interval: 86400,
    minBytes: 800,
    description: '局域网设备与本地域名直连'
  },
  {
    name: 'direct-wechat',
    url: 'https://rawstatic.com/blackmatrix7/ios_rule_script/master/rule/Surge/WeChat/WeChat.list',
    path: './providers/direct-wechat.list',
    behavior: 'classical' as const,
    format: 'text' as const,
    interval: 86400,
    minBytes: 800,
    description: '微信相关域名直连'
  },
  {
    name: 'direct-china',
    url: 'https://rawstatic.com/blackmatrix7/ios_rule_script/master/rule/Clash/China/China.list',
    path: './providers/direct-china.list',
    behavior: 'classical' as const,
    format: 'text' as const,
    interval: 86400,
    minBytes: 8000,
    description: '中国大陆常用域名直连'
  }
]

function directRule(name: string) {
  const preset = DIRECT_RULE_SETS.find((item) => item.name === name)
  if (!preset) throw new Error(`missing direct rule set ${name}`)
  return {
    id: `rule-${name}`,
    type: 'RULE-SET' as const,
    payload: preset.name,
    target: 'DIRECT' as const,
    enabled: true,
    description: `${preset.description}。每天更新 ${preset.url}`
  }
}

function ruleSetNames(payload: string): string[] {
  return payload.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean)
}

export type RuleSection = 'custom' | 'reject' | 'direct' | 'match'

const DIRECT_SET_NAMES = new Set(['direct-lan', 'direct-game', 'direct-wechat', 'direct-china'])

/** 界面三块的归属。自定义在前，广告拦截其次，直连在后，MATCH 兜底。 */
export function ruleSection(rule: RouteRuleItem): RuleSection {
  if (rule.type === 'MATCH') return 'match'
  const names = ruleSetNames(rule.payload)
  if (rule.type === 'RULE-SET' && names.includes('anti-ad')) return 'reject'
  if (rule.type === 'GEOSITE' && names.includes('category-ads-all')) return 'reject'
  if (rule.type === 'RULE-SET' && names.some((name) => DIRECT_SET_NAMES.has(name))) return 'direct'
  if (
    rule.id === 'rule-ncsi' ||
    (rule.type === 'DOMAIN-SUFFIX' &&
      names.length > 0 &&
      names.every((name) => name === 'msftconnecttest.com' || name === 'msftncsi.com'))
  ) {
    return 'direct'
  }
  if (rule.type === 'GEOSITE' && names.includes('cn') && rule.target === 'DIRECT') return 'direct'
  if (rule.type === 'GEOIP' && names.some((name) => name.toUpperCase() === 'CN') && rule.target === 'DIRECT') {
    return 'direct'
  }
  return 'custom'
}

/** 去掉内置局域网网段，并排成：自定义、广告拦截、直连、兜底。 */
export function arrangeRuleSections(rules: RouteRuleItem[]): { rules: RouteRuleItem[]; changed: boolean } {
  const kept = rules.filter((rule) => rule.id !== 'rule-lan')
  const buckets: Record<RuleSection, RouteRuleItem[]> = {
    custom: [],
    reject: [],
    direct: [],
    match: []
  }
  for (const rule of kept) buckets[ruleSection(rule)].push(rule)
  const next = [...buckets.custom, ...buckets.reject, ...buckets.direct, ...buckets.match]
  const changed = kept.length !== rules.length || next.some((rule, index) => rules[index] !== rule)
  return { rules: next, changed }
}

export function insertMissingDirectRules(rules: RouteRuleItem[]): boolean {
  let changed = false
  const has = (name: string) =>
    rules.some((rule) => rule.type === 'RULE-SET' && ruleSetNames(rule.payload).includes(name))

  const insertAfter = (index: number, rule: RouteRuleItem) => {
    rules.splice(index < 0 ? 0 : index + 1, 0, rule)
    changed = true
  }

  if (!has('direct-lan')) {
    const ncsiAt = rules.findIndex(
      (rule) => rule.payload.includes('msftconnecttest') || rule.payload.includes('msftncsi')
    )
    insertAfter(ncsiAt === -1 ? -1 : ncsiAt - 1, directRule('direct-lan'))
  }
  if (!has('direct-game')) {
    const ncsiAt = rules.findIndex(
      (rule) => rule.payload.includes('msftconnecttest') || rule.payload.includes('msftncsi')
    )
    const lanSetAt = rules.findIndex(
      (rule) => rule.type === 'RULE-SET' && ruleSetNames(rule.payload).includes('direct-lan')
    )
    insertAfter(ncsiAt !== -1 ? ncsiAt : lanSetAt, directRule('direct-game'))
  }
  if (!has('direct-wechat')) {
    const gameAt = rules.findIndex(
      (rule) => rule.type === 'RULE-SET' && ruleSetNames(rule.payload).includes('direct-game')
    )
    insertAfter(gameAt, directRule('direct-wechat'))
  }
  if (!has('direct-china')) {
    const before = rules.findIndex(
      (rule) =>
        (rule.type === 'GEOSITE' && rule.payload.toLowerCase().split(/[,;\s]/).includes('cn')) ||
        (rule.type === 'GEOIP' && rule.payload.toUpperCase().includes('CN')) ||
        rule.type === 'MATCH'
    )
    const rule = directRule('direct-china')
    if (before === -1) rules.push(rule)
    else rules.splice(before, 0, rule)
    changed = true
  }
  return changed
}

export const DEFAULT_RULES = [
  {
    id: 'rule-anti-ad',
    type: 'RULE-SET' as const,
    payload: 'anti-ad',
    target: 'REJECT',
    enabled: false,
    description: 'anti-AD 广告域名。默认关闭，名单由规则库更新。'
  },
  {
    id: 'rule-ads',
    type: 'GEOSITE' as const,
    payload: 'category-ads-all',
    target: 'REJECT',
    enabled: true,
    description: '常见广告与追踪拦截'
  },
  directRule('direct-lan'),
  {
    id: 'rule-ncsi',
    type: 'DOMAIN-SUFFIX' as const,
    payload: 'msftconnecttest.com, msftncsi.com',
    target: 'DIRECT',
    enabled: true,
    description: 'Windows 网络连通性探测直连 (msftconnecttest / msftncsi)'
  },
  directRule('direct-game'),
  directRule('direct-wechat'),
  directRule('direct-china'),
  {
    id: 'rule-cn-site',
    type: 'GEOSITE' as const,
    payload: 'cn',
    target: 'DIRECT',
    enabled: true,
    description: '中国大陆域名直连 (geosite:cn)'
  },
  {
    id: 'rule-cn-ip',
    type: 'GEOIP' as const,
    payload: 'CN',
    target: 'DIRECT',
    enabled: true,
    description: '中国大陆 IP 直连'
  },
  {
    id: 'rule-fallback',
    type: 'MATCH' as const,
    payload: '',
    target: 'PROXY',
    enabled: true,
    description: '兜底流量走当前选定代理节点'
  }
]

export function generateMihomoConfig(
  appConfig: AppConfig,
  secret: string,
  options?: { applyTun?: boolean }
): string {
  const rulesList: string[] = []

  // Transform user-defined routing rules (top-down matching order)
  const rules = appConfig.rules && appConfig.rules.length > 0 ? appConfig.rules : DEFAULT_RULES
  for (const rule of rules) {
    if (!rule.enabled) continue

    if (rule.type === 'MATCH') {
      rulesList.push(`MATCH,${rule.target}`)
    } else {
      const payloads = rule.payload
        .split(/[,;\n]/)
        .map((p) => p.trim())
        .filter(Boolean)

      for (const p of payloads) {
        rulesList.push(`${rule.type},${p},${rule.target}`)
      }
    }
  }

  // Ensure default fallback rule
  if (!rulesList.some((r) => r.startsWith('MATCH,'))) {
    rulesList.push('MATCH,PROXY')
  }

  const ruleProviders: Record<string, unknown> = {}
  const addRuleProvider = (name: string) => {
    if (ruleProviders[name]) return
    if (name === 'anti-ad') {
      ruleProviders[name] = {
        type: 'http',
        behavior: 'domain',
        format: 'yaml',
        url: ANTI_AD_PROVIDER.url,
        path: ANTI_AD_PROVIDER.path,
        interval: ANTI_AD_PROVIDER.interval,
        proxy: 'DIRECT'
      }
      return
    }
    const preset = DIRECT_RULE_SETS.find((item) => item.name === name)
    if (!preset) return
    ruleProviders[name] = {
      type: 'http',
      behavior: preset.behavior,
      format: preset.format,
      url: preset.url,
      path: preset.path,
      interval: preset.interval,
      proxy: 'DIRECT'
    }
  }
  for (const rule of rules) {
    if (!rule.enabled || rule.type !== 'RULE-SET') continue
    for (const name of ruleSetNames(rule.payload)) addRuleProvider(name)
  }

  // Assemble proxies list from imported nodes
  const rawProxies: Record<string, unknown>[] = []
  const nodeNames: string[] = []

  if (Array.isArray(appConfig.nodes)) {
    for (const node of appConfig.nodes) {
      if (node.raw && typeof node.raw === 'object') {
        rawProxies.push(node.raw)
        nodeNames.push(node.name)
      }
    }
  }

  // Determine active proxy node
  const activeNode = appConfig.activeNode || (nodeNames.length > 0 ? nodeNames[0] : 'DIRECT')

  // Ordered proxies in PROXY group: active node first, followed by others, then DIRECT and REJECT
  const groupProxies = Array.from(
    new Set([activeNode, ...nodeNames, 'DIRECT', 'REJECT'].filter(Boolean))
  )

  // Assemble DNS configuration (GeoSite domestic system+udp / foreign proxy 8.8.8.8)
  const dnsCfg = appConfig.dns || {
    enhancedMode: 'fake-ip' as const,
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

  const directDnsList =
    dnsCfg.directDns && dnsCfg.directDns.length > 0
      ? dnsCfg.directDns
      : ['system', '223.5.5.5', '119.29.29.29']

  const proxyDnsList =
    dnsCfg.proxyDns && dnsCfg.proxyDns.length > 0
      ? dnsCfg.proxyDns
      : ['8.8.8.8#PROXY', '1.1.1.1#PROXY', 'https://8.8.8.8/dns-query#PROXY']

  const dnsObj: Record<string, unknown> = {
    enable: true,
    listen: `127.0.0.1:${dnsCfg.listenPort || 1053}`,
    ipv6: false,
    'enhanced-mode': dnsCfg.enhancedMode || 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'default-nameserver': ['223.5.5.5', '119.29.29.29'],
    nameserver: directDnsList,
    'proxy-server-nameserver': ['223.5.5.5', '119.29.29.29'],
    fallback: proxyDnsList
  }

  if (dnsCfg.enableFakeIpFilter !== false) {
    dnsObj['fake-ip-filter'] = dnsCfg.fakeIpFilters?.length
      ? dnsCfg.fakeIpFilters
      : ['*.lan', '*.local', '*.msftconnecttest.com', '*.msftncsi.com']
  }

  if (dnsCfg.enableGeositePolicy !== false) {
    dnsObj['nameserver-policy'] = {
      'geosite:cn': directDnsList,
      'geosite:gfw,geolocation-!cn': proxyDnsList
    }
  }

  if (dnsCfg.enableFallbackFilter !== false) {
    dnsObj['fallback-filter'] = {
      geoip: true,
      'geoip-code': 'CN',
      ipcidr: ['240.0.0.0/4', '0.0.0.0/32']
    }
  }

  const configObj: Record<string, unknown> = {
    port: 0,
    'socks-port': 0,
    'mixed-port': appConfig.mixedPort || 7890,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'info',
    ipv6: false,
    'external-controller': '127.0.0.1:9090',
    secret,
    'geodata-mode': true,
    'geodata-loader': 'memconservative',
    'geo-auto-update': false,
    'geox-url': {
      geoip: 'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat',
      geosite: 'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat',
      mmdb: 'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/country.mmdb'
    },
    tun: {
      enable: options?.applyTun === false ? false : !!appConfig.tunEnabled,
      stack: 'mixed',
      device: 'DraftOneTun',
      'auto-route': true,
      'auto-detect-interface': true,
      'dns-hijack': ['tcp://any:53', 'udp://any:53'],
      'strict-route': true
    },
    dns: dnsObj,
    ...(Object.keys(ruleProviders).length > 0 ? { 'rule-providers': ruleProviders } : {}),
    proxies: rawProxies,
    'proxy-groups': [
      {
        name: 'PROXY',
        type: 'select',
        proxies: groupProxies
      }
    ],
    rules: rulesList
  }

  return YAML.stringify(configObj)
}
