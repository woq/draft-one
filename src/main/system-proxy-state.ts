export const INTERNET_SETTINGS_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'

export const PROXY_BYPASS = '<local>;localhost;127.*;10.*;172.16.*;192.168.*'

export interface ProxySnapshot {
  proxyEnable: number
  proxyServer: string | null
  proxyOverride: string | null
  autoConfigUrl: string | null
}

export function ourProxyServer(port: number): string {
  return `127.0.0.1:${port}`
}

export function parseRegQuery(text: string): { type: string; data: string } | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    const match = line.match(/^(\S+)\s+(REG_\w+)\s+(.*)$/)
    if (match) return { type: match[2], data: match[3].trim() }
  }
  return null
}

export function dwordFromReg(data: string): number {
  const parsed = data.toLowerCase().startsWith('0x') ? parseInt(data, 16) : parseInt(data, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export function regQueryArgs(valueName: string): string[] {
  return ['query', INTERNET_SETTINGS_KEY, '/v', valueName]
}

export function regAddDwordArgs(valueName: string, data: number): string[] {
  return ['add', INTERNET_SETTINGS_KEY, '/v', valueName, '/t', 'REG_DWORD', '/d', String(data), '/f']
}

export function regAddStringArgs(valueName: string, data: string): string[] {
  return ['add', INTERNET_SETTINGS_KEY, '/v', valueName, '/t', 'REG_SZ', '/d', data, '/f']
}

export function regDeleteValueArgs(valueName: string): string[] {
  return ['delete', INTERNET_SETTINGS_KEY, '/v', valueName, '/f']
}

export function snapshotIsOurs(snapshot: ProxySnapshot, port: number): boolean {
  return snapshot.proxyEnable === 1 && snapshot.proxyServer === ourProxyServer(port)
}

/**
 * The backup is the user's previous proxy, written before we change anything.
 * If the current values are already ours, the original is unknown and exit should turn the proxy off.
 */
export function backupForEnable(current: ProxySnapshot, port: number): ProxySnapshot {
  if (snapshotIsOurs(current, port)) {
    return { proxyEnable: 0, proxyServer: null, proxyOverride: null, autoConfigUrl: null }
  }
  return {
    proxyEnable: current.proxyEnable,
    proxyServer: current.proxyServer,
    proxyOverride: current.proxyOverride,
    autoConfigUrl: current.autoConfigUrl
  }
}

export function scCreateArgs(serviceName: string, binPath: string): string[] {
  return [
    'create',
    serviceName,
    'binPath=',
    binPath,
    'start=',
    'auto',
    'DisplayName=',
    'draft-one Core Proxy Service'
  ]
}

export function firewallRuleArgs(name: string, dir: 'in' | 'out', program: string): string[] {
  return [
    'advfirewall',
    'firewall',
    'add',
    'rule',
    `name=${name}`,
    `dir=${dir}`,
    'action=allow',
    `program="${program.replace(/"/g, '')}"`,
    'enable=yes'
  ]
}

export function firewallDeleteArgs(name: string): string[] {
  return ['advfirewall', 'firewall', 'delete', 'rule', `name=${name}`]
}
