export type RuleType =
  | 'DOMAIN-SUFFIX'
  | 'DOMAIN-KEYWORD'
  | 'PROCESS-NAME'
  | 'IP-CIDR'
  | 'GEOSITE'
  | 'GEOIP'
  | 'RULE-SET'
  | 'MATCH'

export type TargetPolicy = 'DIRECT' | 'REJECT' | 'PROXY' | string

export interface RouteRuleItem {
  id: string
  type: RuleType
  payload: string
  target: TargetPolicy
  enabled: boolean
  description?: string
}

export interface SubscriptionUserInfo {
  upload?: number
  download?: number
  total?: number
  expire?: number
}

export interface ProxyNode {
  id?: string
  name: string
  type: string
  server?: string
  port?: number
  subId?: string
  subName?: string
  isManual?: boolean
  delay?: number
  history?: Array<{ time: string; delay: number }>
  raw?: Record<string, unknown>
}

export interface SubscriptionProfile {
  id: string
  name: string
  url: string
  updatedAt?: number
  nodeCount: number
  autoUpdate: boolean
  enabled: boolean
  userInfo?: SubscriptionUserInfo
}

export interface DnsConfig {
  enhancedMode: 'fake-ip' | 'redir-host'
  listenPort: number
  directDns: string[]
  proxyDns: string[]
  enableGeositePolicy: boolean
  enableFakeIpFilter: boolean
  fakeIpFilters: string[]
  enableFallbackFilter: boolean
  /** 旧字段。anti-AD 已改成路由里的 RULE-SET，读配置时迁过去后不再使用。 */
  enableAntiAd?: boolean
}

export interface AppConfig {
  mixedPort: number
  tunEnabled: boolean
  systemProxy: boolean
  autoStart: boolean
  silentStart: boolean
  activeNode: string
  autoUpdateSub: boolean
  autoUpdateGeo: boolean
  subscriptions: SubscriptionProfile[]
  manualNodes?: ProxyNode[]
  nodes: ProxyNode[]
  rules: RouteRuleItem[]
  dns?: DnsConfig
  /** 按节点名记住的最近一次测速，不跟订阅节点一起被覆盖。 */
  nodeDelays?: Record<string, { delay: number; testedAt: number }>
}

export interface HostTrafficStat {
  host: string
  ip: string
  upload: number
  download: number
  rule: string
  node?: string
  lastSeen: number
}

export interface TrafficSummary {
  totalUpload: number
  totalDownload: number
  speedUp: number
  speedDown: number
  nodeStats: Record<string, { upload: number; download: number; connections: number }>
  topHosts: HostTrafficStat[]
}

export interface ConnectionMetadata {
  network: string
  type: string
  sourceIP: string
  destinationIP: string
  sourcePort: string
  destinationPort: string
  host: string
  dnsMode?: string
  processPath?: string
  process?: string
}

export interface LiveConnectionItem {
  id: string
  metadata: ConnectionMetadata
  upload: number
  download: number
  start: string
  chains: string[]
  rule: string
  rulePayload: string
  speedUp: number
  speedDown: number
  actualNode: string
}

export interface ConnectionsSnapshot {
  downloadTotal: number
  uploadTotal: number
  connections: LiveConnectionItem[]
}

export type LogCategory = 'routing' | 'dns' | 'system' | 'error'

export interface RoutingLogDetails {
  protocol: 'TCP' | 'UDP'
  source: string
  target: string
  rule: string
  outbound: string
}

export interface LogItem {
  id: string
  seq?: number
  timestamp?: number
  time: string
  type: 'debug' | 'info' | 'warning' | 'error' | string
  category?: LogCategory
  routing?: RoutingLogDetails
  payload: string
}
