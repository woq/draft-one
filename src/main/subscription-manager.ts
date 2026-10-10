import YAML from 'yaml'
import fs from 'fs'
import path from 'path'
import { NetClient } from './net-client'
import { LinkParser } from './link-parser'
import { installDataDir } from './app-data-dir'
import type { ProxyNode, SubscriptionProfile, SubscriptionUserInfo } from '../renderer/src/types'

export class SubscriptionManager {
  private static getStorageDir(): string {
    const dir = path.join(installDataDir(), 'subscriptions')
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    return dir
  }

  public static parseUserInfo(header?: string): SubscriptionUserInfo | undefined {
    if (!header) return undefined
    const parts = header.split(';').map((p) => p.trim())
    const info: SubscriptionUserInfo = {}

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

  public static async fetchSubscription(
    url: string,
    profileName: string,
    existingId?: string,
    mixedPort?: number
  ): Promise<{ profile: SubscriptionProfile; nodes: ProxyNode[] }> {
    const subId = existingId || `sub-${Date.now()}`
    const finalName = profileName || '未命名订阅'

    const response = await NetClient.get<string>(
      url,
      {
        headers: {
          'User-Agent': 'Clash.Meta; mihomo; ClashVerge/1.7.0'
        },
        timeout: 15000,
        responseType: 'text'
      },
      mixedPort
    )

    const rawData = response.data as string
    const userInfoHeader =
      (response.headers['subscription-userinfo'] as string) ||
      (response.headers['Subscription-Userinfo'] as string)
    const userInfo = this.parseUserInfo(userInfoHeader)

    const parsedNodes = this.parseNodes(rawData, subId, finalName)

    const profile: SubscriptionProfile = {
      id: subId,
      name: finalName,
      url,
      updatedAt: Date.now(),
      nodeCount: parsedNodes.length,
      autoUpdate: true,
      enabled: true,
      userInfo
    }

    // Save individual subscription node storage
    this.saveSubscriptionNodes(subId, parsedNodes)

    return { profile, nodes: parsedNodes }
  }

  public static saveSubscriptionNodes(subId: string, nodes: ProxyNode[]): void {
    const filePath = path.join(this.getStorageDir(), `${subId}.json`)
    fs.writeFileSync(filePath, JSON.stringify(nodes, null, 2), 'utf-8')
  }

  public static loadSubscriptionNodes(subId: string): ProxyNode[] {
    const filePath = path.join(this.getStorageDir(), `${subId}.json`)
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      }
    } catch (e) {
      console.error(`Failed to load nodes for ${subId}:`, e)
    }
    return []
  }

  public static deleteSubscriptionStorage(subId: string): void {
    const filePath = path.join(this.getStorageDir(), `${subId}.json`)
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
      } catch (e) {
        console.error(`Failed to delete subscription file ${filePath}:`, e)
      }
    }
  }

  public static aggregateNodes(subscriptions: SubscriptionProfile[]): ProxyNode[] {
    const aggregated: ProxyNode[] = []
    const seenNames = new Set<string>()

    for (const sub of subscriptions) {
      if (!sub.enabled) continue
      const nodes = this.loadSubscriptionNodes(sub.id)

      for (const node of nodes) {
        let uniqueName = node.name
        if (seenNames.has(uniqueName)) {
          uniqueName = `[${sub.name}] ${node.name}`
        }
        seenNames.add(uniqueName)

        // Clone node raw config with uniqueName
        const raw = node.raw ? { ...node.raw, name: uniqueName } : undefined

        aggregated.push({
          ...node,
          name: uniqueName,
          subId: sub.id,
          subName: sub.name,
          raw
        })
      }
    }

    return aggregated
  }

  public static parseNodes(content: string, subId: string, subName: string): ProxyNode[] {
    try {
      const parsed = YAML.parse(content)
      if (parsed && Array.isArray(parsed.proxies)) {
        return parsed.proxies.map((p: Record<string, unknown>, idx: number) => {
          const name = String(p.name || `节点-${idx + 1}`)
          return {
            id: `${subId}-${idx}`,
            name,
            type: String(p.type || 'unknown'),
            server: String(p.server || ''),
            port: Number(p.port || 0),
            subId,
            subName,
            raw: p
          }
        })
      }
    } catch {
      // Ignore YAML parse error, fall back to share links
    }

    // Clash YAML was absent. Share-link subscriptions (plain or Base64, including hy2://)
    // must go through LinkParser so each node carries a mihomo `raw` outbound.
    try {
      const linked = LinkParser.parseLinks(content, subId, subName)
      if (linked.length > 0) return linked
    } catch (e) {
      console.warn('[SubscriptionManager] Failed to decode share-link subscription:', e)
    }

    return []
  }
}
