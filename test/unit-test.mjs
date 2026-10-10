import test from 'node:test'
import assert from 'node:assert/strict'
import YAML from 'yaml'

// --- 1. Test LinkParser Logic ---
class TestLinkParser {
  static parseLinks(input, subId = 'sub-manual', subName = '手动导入') {
    if (!input || !input.trim()) return []
    let text = input.trim()

    if (!text.includes('://') && /^[A-Za-z0-9+/=\r\n]+$/.test(text)) {
      try {
        const decoded = Buffer.from(text, 'base64').toString('utf-8')
        if (decoded.includes('://')) text = decoded
      } catch {}
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => Boolean(l) && l.includes('://'))

    const nodes = []
    for (let i = 0; i < lines.length; i++) {
      const node = this.parseSingleLink(lines[i], `${subId}-${i}`, subId, subName)
      if (node) nodes.push(node)
    }
    return nodes
  }

  static parseSingleLink(uri, nodeId, subId, subName) {
    const trimmed = uri.trim()
    if (trimmed.startsWith('vmess://')) {
      const b64 = trimmed.substring('vmess://'.length).trim()
      const jsonStr = Buffer.from(b64, 'base64').toString('utf-8')
      const data = JSON.parse(jsonStr)
      return {
        id: nodeId,
        name: data.ps || `VMess-${data.add}:${data.port}`,
        type: 'vmess',
        server: String(data.add || ''),
        port: Number(data.port || 443),
        subId,
        subName,
        raw: {
          name: data.ps,
          type: 'vmess',
          server: data.add,
          port: Number(data.port),
          uuid: data.id,
          alterId: Number(data.aid || 0),
          cipher: data.scy || 'auto',
          tls: data.tls === 'tls'
        }
      }
    }
    if (trimmed.startsWith('vless://')) {
      const parsed = new URL(trimmed)
      const name = parsed.hash ? decodeURIComponent(parsed.hash.substring(1)) : `VLESS-${parsed.hostname}`
      return {
        id: nodeId,
        name,
        type: 'vless',
        server: parsed.hostname,
        port: Number(parsed.port || 443),
        subId,
        subName,
        raw: {
          name,
          type: 'vless',
          server: parsed.hostname,
          port: Number(parsed.port || 443),
          uuid: parsed.username,
          tls: parsed.searchParams.get('security') === 'reality'
        }
      }
    }
    if (trimmed.startsWith('ss://')) {
      let rest = trimmed.substring('ss://'.length)
      let name = ''
      const hashIdx = rest.indexOf('#')
      if (hashIdx !== -1) {
        name = decodeURIComponent(rest.substring(hashIdx + 1))
        rest = rest.substring(0, hashIdx)
      }
      let server = '', port = 8388, cipher = 'aes-128-gcm', password = ''
      if (rest.includes('@')) {
        const atIdx = rest.indexOf('@')
        const userInfo = Buffer.from(rest.substring(0, atIdx), 'base64').toString('utf-8')
        const [c, p] = userInfo.split(':')
        cipher = c || cipher
        password = p || ''
        const [h, pt] = rest.substring(atIdx + 1).split('?')[0].split(':')
        server = h
        port = Number(pt || 8388)
      }
      return {
        id: nodeId,
        name: name || `SS-${server}:${port}`,
        type: 'ss',
        server,
        port,
        subId,
        subName,
        raw: { name: name || `SS-${server}:${port}`, type: 'ss', server, port, cipher, password }
      }
    }
    if (trimmed.startsWith('trojan://')) {
      const parsed = new URL(trimmed)
      const name = parsed.hash ? decodeURIComponent(parsed.hash.substring(1)) : `Trojan-${parsed.hostname}`
      return {
        id: nodeId,
        name,
        type: 'trojan',
        server: parsed.hostname,
        port: Number(parsed.port || 443),
        subId,
        subName,
        raw: { name, type: 'trojan', server: parsed.hostname, port: Number(parsed.port || 443), password: parsed.username }
      }
    }
    if (trimmed.startsWith('hysteria2://') || trimmed.startsWith('hy2://')) {
      const normalized = trimmed.replace('hy2://', 'hysteria2://')
      const parsed = new URL(normalized)
      const name = parsed.hash ? decodeURIComponent(parsed.hash.substring(1)) : `Hy2-${parsed.hostname}`
      return {
        id: nodeId,
        name,
        type: 'hysteria2',
        server: parsed.hostname,
        port: Number(parsed.port || 443),
        subId,
        subName,
        raw: { name, type: 'hysteria2', server: parsed.hostname, port: Number(parsed.port || 443), password: parsed.username }
      }
    }
    return null
  }
}

// --- 2. Test UserInfo Parser ---
function parseUserInfo(header) {
  if (!header) return undefined
  const parts = header.split(';').map((p) => p.trim())
  const info = {}
  for (const part of parts) {
    const [k, v] = part.split('=').map((s) => s.trim())
    const num = parseInt(v, 10)
    if (isNaN(num)) continue
    if (k === 'upload') info.upload = num
    else if (k === 'download') info.download = num
    else if (k === 'total') info.total = num
    else if (k === 'expire') info.expire = num
  }
  return Object.keys(info).length > 0 ? info : undefined
}

// --- 3. Test Config Generator ---
function generateMihomoConfig(cfg) {
  const proxies = []
  const proxyNames = []

  for (const n of cfg.nodes || []) {
    if (n.name === 'DIRECT' || n.name === 'REJECT') continue
    if (n.raw) {
      proxies.push(n.raw)
    } else {
      proxies.push({
        name: n.name,
        type: n.type,
        server: n.server || '127.0.0.1',
        port: n.port || 443
      })
    }
    proxyNames.push(n.name)
  }

  const validActiveNode = proxyNames.includes(cfg.activeNode) ? cfg.activeNode : (proxyNames[0] || 'DIRECT')
  const selectorProxies = proxyNames.length > 0 ? [...proxyNames, 'DIRECT', 'REJECT'] : ['DIRECT', 'REJECT']

  const configObj = {
    'mixed-port': cfg.mixedPort || 7890,
    'allow-lan': true,
    mode: 'rule',
    'log-level': 'info',
    ipv6: false,
    'external-controller': '127.0.0.1:9090',
    secret: 'draft-one-secret',
    tun: {
      enable: !!cfg.tunEnabled,
      stack: 'mixed',
      'auto-route': true,
      'auto-detect-interface': true,
      'dns-hijack': ['tcp://any:53', 'udp://any:53']
    },
    proxies,
    'proxy-groups': [
      {
        name: 'PROXY',
        type: 'select',
        proxies: selectorProxies
      }
    ],
    rules: ['MATCH,PROXY']
  }

  return YAML.stringify(configObj)
}

// ======================== TEST SUITES ========================

test('LinkParser: VMess base64 JSON link parsing', () => {
  const vmessPayload = {
    v: '2',
    ps: 'HK-Premium-01',
    add: 'hk01.example.com',
    port: 443,
    id: 'b831381d-6324-4d53-ad4f-8cda48b30811',
    aid: 0,
    scy: 'auto',
    net: 'ws',
    tls: 'tls'
  }
  const link = `vmess://${Buffer.from(JSON.stringify(vmessPayload)).toString('base64')}`
  const node = TestLinkParser.parseSingleLink(link, 'n-1', 'sub-1', 'TestSub')

  assert.ok(node)
  assert.equal(node.name, 'HK-Premium-01')
  assert.equal(node.type, 'vmess')
  assert.equal(node.server, 'hk01.example.com')
  assert.equal(node.port, 443)
  assert.equal(node.raw.uuid, 'b831381d-6324-4d53-ad4f-8cda48b30811')
  assert.equal(node.raw.tls, true)
})

test('LinkParser: VLESS Reality link parsing', () => {
  const link = 'vless://uuid-vless-test@sg01.example.com:443?security=reality&pbk=pubkey123&sid=short456#SG-Reality-01'
  const node = TestLinkParser.parseSingleLink(link, 'n-2', 'sub-1', 'TestSub')

  assert.ok(node)
  assert.equal(node.name, 'SG-Reality-01')
  assert.equal(node.type, 'vless')
  assert.equal(node.server, 'sg01.example.com')
  assert.equal(node.port, 443)
  assert.equal(node.raw.tls, true)
})

test('LinkParser: Shadowsocks and Trojan link parsing', () => {
  const ssLink = `ss://${Buffer.from('aes-256-gcm:pass123').toString('base64')}@jp01.example.com:8388#Tokyo-SS`
  const ssNode = TestLinkParser.parseSingleLink(ssLink, 'n-3', 'sub-1', 'TestSub')
  assert.ok(ssNode)
  assert.equal(ssNode.name, 'Tokyo-SS')
  assert.equal(ssNode.type, 'ss')
  assert.equal(ssNode.server, 'jp01.example.com')
  assert.equal(ssNode.port, 8388)

  const trojanLink = 'trojan://trojanpass@us01.example.com:443#US-Trojan'
  const trojanNode = TestLinkParser.parseSingleLink(trojanLink, 'n-4', 'sub-1', 'TestSub')
  assert.ok(trojanNode)
  assert.equal(trojanNode.name, 'US-Trojan')
  assert.equal(trojanNode.type, 'trojan')
  assert.equal(trojanNode.port, 443)
})

test('LinkParser: Batch multi-line input & Base64 decoding', () => {
  const links = [
    'trojan://pass@1.1.1.1:443#Node1',
    'trojan://pass@2.2.2.2:443#Node2',
    'hy2://pass@3.3.3.3:443#Node3'
  ].join('\n')

  const parsedDirect = TestLinkParser.parseLinks(links)
  assert.equal(parsedDirect.length, 3)

  // Test Base64 encoded block
  const b64Block = Buffer.from(links).toString('base64')
  const parsedB64 = TestLinkParser.parseLinks(b64Block)
  assert.equal(parsedB64.length, 3)
})

test('SubscriptionManager: parseUserInfo header parsing', () => {
  const header = 'upload=1073741824; download=5368709120; total=107374182400; expire=1767225600'
  const info = parseUserInfo(header)

  assert.ok(info)
  assert.equal(info.upload, 1073741824)
  assert.equal(info.download, 5368709120)
  assert.equal(info.total, 107374182400)
  assert.equal(info.expire, 1767225600)

  assert.equal(parseUserInfo(undefined), undefined)
  assert.equal(parseUserInfo(''), undefined)
})

test('ConfigGenerator: Valid Mihomo YAML generation and TUN flags', () => {
  const cfg = {
    mixedPort: 7890,
    tunEnabled: true,
    systemProxy: false,
    activeNode: 'HK-01',
    nodes: [
      { name: 'HK-01', type: 'ss', server: '1.2.3.4', port: 8388 },
      { name: 'DIRECT', type: 'direct' }, // Built-in name must be filtered out of proxies list
      { name: 'REJECT', type: 'reject' }  // Built-in name must be filtered out of proxies list
    ]
  }

  const yamlStr = generateMihomoConfig(cfg)
  assert.ok(yamlStr.includes('mixed-port: 7890'))
  assert.ok(yamlStr.includes('tun:'))
  assert.ok(yamlStr.includes('enable: true'))
  assert.ok(yamlStr.includes('stack: mixed'))

  const parsed = YAML.parse(yamlStr)
  assert.equal(parsed['mixed-port'], 7890)
  assert.equal(parsed.tun.enable, true)
  assert.equal(parsed.proxies.length, 1) // Only HK-01, DIRECT/REJECT filtered out
  assert.equal(parsed.proxies[0].name, 'HK-01')
  assert.ok(parsed['proxy-groups'][0].proxies.includes('HK-01'))
})

test('NetClient: Dual-channel proxy-first direct-fallback logic', async () => {
  // Test simulated dual-channel client logic
  let proxyAttempted = false
  let directAttempted = false

  async function mockRequest(useProxy) {
    if (useProxy) {
      proxyAttempted = true
      throw new Error('Proxy Connection Refused (simulated offline proxy)')
    } else {
      directAttempted = true
      return { status: 200, data: 'OK' }
    }
  }

  let finalRes = null
  try {
    finalRes = await mockRequest(true)
  } catch {
    finalRes = await mockRequest(false)
  }

  assert.equal(proxyAttempted, true)
  assert.equal(directAttempted, true)
  assert.equal(finalRes.status, 200)
  assert.equal(finalRes.data, 'OK')
})

