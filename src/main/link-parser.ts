import type { ProxyNode } from '../renderer/src/types'

export class LinkParser {
  /**
   * Parse text input (single link, multiple links, or base64) into ProxyNode[]
   */
  public static parseLinks(
    input: string,
    subId = 'sub-manual',
    subName = '手动导入'
  ): ProxyNode[] {
    if (!input || !input.trim()) return []

    let text = input.trim()

    // Check if input is a base64 encoded block of links
    if (
      !text.includes('://') &&
      /^[A-Za-z0-9+/=\r\n]+$/.test(text)
    ) {
      try {
        const decoded = Buffer.from(text, 'base64').toString('utf-8')
        if (decoded.includes('://')) {
          text = decoded
        }
      } catch {
        // Not valid base64, continue
      }
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => Boolean(l) && l.includes('://'))

    const nodes: ProxyNode[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      try {
        const node = this.parseSingleLink(line, `${subId}-${i}`, subId, subName)
        if (node) {
          nodes.push(node)
        }
      } catch (e) {
        console.warn(`[LinkParser] Failed to parse link "${line}":`, e)
      }
    }

    return nodes
  }

  public static parseSingleLink(
    uri: string,
    nodeId: string,
    subId: string,
    subName: string
  ): ProxyNode | null {
    const trimmed = uri.trim()
    if (trimmed.startsWith('vmess://')) {
      return this.parseVmess(trimmed, nodeId, subId, subName)
    }
    if (trimmed.startsWith('vless://')) {
      return this.parseVless(trimmed, nodeId, subId, subName)
    }
    if (trimmed.startsWith('ss://')) {
      return this.parseShadowsocks(trimmed, nodeId, subId, subName)
    }
    if (trimmed.startsWith('trojan://')) {
      return this.parseTrojan(trimmed, nodeId, subId, subName)
    }
    if (trimmed.startsWith('hysteria2://') || trimmed.startsWith('hy2://')) {
      return this.parseHysteria2(trimmed, nodeId, subId, subName)
    }
    return null
  }

  private static parseVmess(
    uri: string,
    nodeId: string,
    subId: string,
    subName: string
  ): ProxyNode | null {
    try {
      const b64 = uri.substring('vmess://'.length).trim()
      const jsonStr = Buffer.from(b64, 'base64').toString('utf-8')
      const data = JSON.parse(jsonStr)

      const name = data.ps || `VMess-${data.add || 'node'}:${data.port || 443}`
      const server = String(data.add || '')
      const port = Number(data.port || 443)

      const raw: Record<string, unknown> = {
        name,
        type: 'vmess',
        server,
        port,
        uuid: String(data.id || ''),
        alterId: Number(data.aid || 0),
        cipher: data.scy || 'auto',
        udp: true,
        tls: data.tls === 'tls'
      }

      if (data.sni || data.host) {
        raw.servername = data.sni || data.host
      }

      const net = (data.net || 'tcp').toLowerCase()
      if (net === 'ws') {
        raw.network = 'ws'
        raw['ws-opts'] = {
          path: data.path || '/',
          headers: data.host ? { Host: data.host } : undefined
        }
      } else if (net === 'grpc') {
        raw.network = 'grpc'
        raw['grpc-opts'] = {
          'grpc-service-name': data.path || ''
        }
      }

      return {
        id: nodeId,
        name,
        type: 'vmess',
        server,
        port,
        subId,
        subName,
        raw
      }
    } catch (e) {
      console.warn('[LinkParser] parseVmess error:', e)
      return null
    }
  }

  private static parseVless(
    uri: string,
    nodeId: string,
    subId: string,
    subName: string
  ): ProxyNode | null {
    try {
      const parsed = new URL(uri)
      const uuid = parsed.username
      const server = parsed.hostname
      const port = Number(parsed.port || 443)
      let name = parsed.hash ? decodeURIComponent(parsed.hash.substring(1)) : ''
      if (!name) name = `VLESS-${server}:${port}`

      const params = parsed.searchParams
      const security = params.get('security') || 'none'
      const flow = params.get('flow')
      const type = params.get('type') || 'tcp'
      const sni = params.get('sni')
      const fp = params.get('fp')
      const pbk = params.get('pbk')
      const sid = params.get('sid')

      const raw: Record<string, unknown> = {
        name,
        type: 'vless',
        server,
        port,
        uuid,
        udp: true,
        tls: security === 'tls' || security === 'reality'
      }

      if (flow) raw.flow = flow
      if (sni) raw.servername = sni
      if (fp) raw['client-fingerprint'] = fp

      if (security === 'reality') {
        raw['reality-opts'] = {
          'public-key': pbk || '',
          'short-id': sid || ''
        }
      }

      if (type === 'ws') {
        raw.network = 'ws'
        raw['ws-opts'] = {
          path: params.get('path') || '/',
          headers: params.get('host') ? { Host: params.get('host') } : undefined
        }
      } else if (type === 'grpc') {
        raw.network = 'grpc'
        raw['grpc-opts'] = {
          'grpc-service-name': params.get('serviceName') || ''
        }
      }

      return {
        id: nodeId,
        name,
        type: 'vless',
        server,
        port,
        subId,
        subName,
        raw
      }
    } catch (e) {
      console.warn('[LinkParser] parseVless error:', e)
      return null
    }
  }

  private static parseShadowsocks(
    uri: string,
    nodeId: string,
    subId: string,
    subName: string
  ): ProxyNode | null {
    try {
      // ss://BASE64(cipher:pass@host:port)?plugin=...#name
      // or ss://BASE64(cipher:pass)@host:port?plugin=...#name
      // or ss://cipher:pass@host:port?plugin=...#name
      let rest = uri.substring('ss://'.length)
      let name = ''
      const hashIdx = rest.indexOf('#')
      if (hashIdx !== -1) {
        try {
          name = decodeURIComponent(rest.substring(hashIdx + 1))
        } catch {
          name = rest.substring(hashIdx + 1)
        }
        rest = rest.substring(0, hashIdx)
      }

      let cipher = 'chacha20-ietf-poly1305'
      let password = ''
      let server = ''
      let port = 8388
      let pluginName = ''
      let pluginOpts: Record<string, unknown> | undefined

      // Check query params
      const qIdx = rest.indexOf('?')
      let queryStr = ''
      if (qIdx !== -1) {
        queryStr = rest.substring(qIdx + 1)
        rest = rest.substring(0, qIdx)
      }

      if (rest.includes('@')) {
        const atIdx = rest.indexOf('@')
        const userInfoRaw = rest.substring(0, atIdx)
        const hostPort = rest.substring(atIdx + 1)

        let userInfo = userInfoRaw
        // If not containing colon, it's base64 encoded
        if (!userInfoRaw.includes(':')) {
          try {
            userInfo = Buffer.from(userInfoRaw, 'base64').toString('utf-8')
          } catch {
            userInfo = userInfoRaw
          }
        }

        const colonIdx = userInfo.indexOf(':')
        if (colonIdx !== -1) {
          cipher = userInfo.substring(0, colonIdx)
          password = userInfo.substring(colonIdx + 1)
        } else {
          password = userInfo
        }

        const [h, pt] = hostPort.split(':')
        server = h
        port = Number(pt || 8388)
      } else {
        let decoded = rest
        try {
          decoded = Buffer.from(rest, 'base64').toString('utf-8')
        } catch {}

        const atIdx = decoded.indexOf('@')
        if (atIdx !== -1) {
          const userInfo = decoded.substring(0, atIdx)
          const hostPort = decoded.substring(atIdx + 1)

          const colonIdx = userInfo.indexOf(':')
          if (colonIdx !== -1) {
            cipher = userInfo.substring(0, colonIdx)
            password = userInfo.substring(colonIdx + 1)
          } else {
            password = userInfo
          }

          const [h, pt] = hostPort.split(':')
          server = h
          port = Number(pt || 8388)
        }
      }

      // Parse plugin if queryStr exists
      if (queryStr) {
        const params = new URLSearchParams(queryStr)
        const rawPlugin = params.get('plugin')
        if (rawPlugin) {
          const parts = rawPlugin.split(';')
          pluginName = parts[0]
          pluginOpts = {}
          for (let i = 1; i < parts.length; i++) {
            const eqIdx = parts[i].indexOf('=')
            if (eqIdx !== -1) {
              const k = parts[i].substring(0, eqIdx).trim()
              const v = parts[i].substring(eqIdx + 1).trim()
              pluginOpts[k] = v === 'true' ? true : (v === 'false' ? false : v)
            } else if (parts[i].trim()) {
              pluginOpts[parts[i].trim()] = true
            }
          }
        }
      }

      if (!name) name = `SS-${server}:${port}`

      const raw: Record<string, unknown> = {
        name,
        type: 'ss',
        server,
        port,
        cipher,
        password,
        udp: true
      }

      if (pluginName) {
        raw.plugin = pluginName
        if (pluginOpts && Object.keys(pluginOpts).length > 0) {
          raw['plugin-opts'] = pluginOpts
        }
      }

      return {
        id: nodeId,
        name,
        type: 'ss',
        server,
        port,
        subId,
        subName,
        raw
      }
    } catch (e) {
      console.warn('[LinkParser] parseShadowsocks error:', e)
      return null
    }
  }

  private static parseTrojan(
    uri: string,
    nodeId: string,
    subId: string,
    subName: string
  ): ProxyNode | null {
    try {
      const parsed = new URL(uri)
      const password = parsed.username
      const server = parsed.hostname
      const port = Number(parsed.port || 443)
      let name = parsed.hash ? decodeURIComponent(parsed.hash.substring(1)) : ''
      if (!name) name = `Trojan-${server}:${port}`

      const sni = parsed.searchParams.get('sni') || parsed.searchParams.get('peer') || server
      const type = parsed.searchParams.get('type')

      const raw: Record<string, unknown> = {
        name,
        type: 'trojan',
        server,
        port,
        password,
        udp: true,
        sni
      }

      if (type === 'ws') {
        raw.network = 'ws'
        raw['ws-opts'] = {
          path: parsed.searchParams.get('path') || '/',
          headers: parsed.searchParams.get('host')
            ? { Host: parsed.searchParams.get('host') }
            : undefined
        }
      }

      return {
        id: nodeId,
        name,
        type: 'trojan',
        server,
        port,
        subId,
        subName,
        raw
      }
    } catch (e) {
      console.warn('[LinkParser] parseTrojan error:', e)
      return null
    }
  }

  private static parseHysteria2(
    uri: string,
    nodeId: string,
    subId: string,
    subName: string
  ): ProxyNode | null {
    try {
      // hysteria2://auth@host:port?sni=...#name
      const normalized = uri.replace('hy2://', 'hysteria2://')
      const parsed = new URL(normalized)
      const password = parsed.username
      const server = parsed.hostname
      const port = Number(parsed.port || 443)
      let name = parsed.hash ? decodeURIComponent(parsed.hash.substring(1)) : ''
      if (!name) name = `Hy2-${server}:${port}`

      const sni = parsed.searchParams.get('sni') || server
      const insecure = parsed.searchParams.get('insecure')

      const raw: Record<string, unknown> = {
        name,
        type: 'hysteria2',
        server,
        port,
        password,
        sni,
        'skip-cert-verify': insecure === '1' || insecure === 'true'
      }

      return {
        id: nodeId,
        name,
        type: 'hysteria2',
        server,
        port,
        subId,
        subName,
        raw
      }
    } catch (e) {
      console.warn('[LinkParser] parseHysteria2 error:', e)
      return null
    }
  }
}
