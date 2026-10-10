import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { NetClient } from './net-client'
import { ANTI_AD_PROVIDER, DIRECT_RULE_SETS } from './config-generator'
import { installDataDir } from './app-data-dir'

function bundledAntiAdCandidates(): string[] {
  const file = ANTI_AD_PROVIDER.fileName
  const candidates = [
    path.join(process.resourcesPath, 'binaries', file),
    path.join(process.resourcesPath, file),
    path.join(path.dirname(process.execPath), 'binaries', file),
    path.join(app.getAppPath(), 'resources', 'binaries', file),
    path.join(app.getAppPath(), 'resources', file)
  ]
  if (process.platform === 'win32') {
    const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
    candidates.push(
      path.join(progFiles, 'draft-one', 'resources', 'binaries', file),
      path.join(progFiles, 'draft-one', 'binaries', file)
    )
  }
  return candidates
}

export interface GeoDataStatus {
  geoip: {
    exists: boolean
    sizeMb: number
    updatedAt: number
  }
  geosite: {
    exists: boolean
    sizeMb: number
    updatedAt: number
  }
  mmdb: {
    exists: boolean
    sizeMb: number
    updatedAt: number
  }
  antiAd: {
    exists: boolean
    sizeMb: number
    updatedAt: number
  }
  directRules: {
    name: string
    exists: boolean
    sizeKb: number
    updatedAt: number
  }[]
}

export class GeoDataManager {
  private static GEOIP_URL =
    'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat'
  private static GEOSITE_URL =
    'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat'

  private static MMDB_URL =
    'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/country.mmdb'

  /**
   * Initializes default GeoIP, GeoSite, and Country MMDB database files from bundled application resources
   * into userData directory if they do not already exist.
   */
  public static ensureDefaultGeoData(): void {
    const dataDir = installDataDir()
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    const files = ['geoip.dat', 'geosite.dat', 'country.mmdb', 'Country.mmdb']
    for (const file of files) {
      const target = path.join(dataDir, file)
      if (!fs.existsSync(target)) {
        const candidatePaths = [
          path.join(process.resourcesPath, 'binaries', file),
          path.join(process.resourcesPath, file),
          path.join(path.dirname(process.execPath), 'binaries', file),
          path.join(app.getAppPath(), 'resources', 'binaries', file),
          path.join(app.getAppPath(), 'resources', file),
          // Also check case-insensitive match for mmdb
          path.join(process.resourcesPath, 'binaries', 'country.mmdb'),
          path.join(app.getAppPath(), 'resources', 'binaries', 'country.mmdb')
        ]

        if (process.platform === 'win32') {
          const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
          candidatePaths.push(
            path.join(progFiles, 'draft-one', 'resources', 'binaries', file),
            path.join(progFiles, 'draft-one', 'binaries', file)
          )
        }
        for (const src of candidatePaths) {
          if (fs.existsSync(src)) {
            try {
              fs.copyFileSync(src, target)
              console.log(`[GeoDataManager] Initialized default ${file} from ${src}`)
              break
            } catch (e) {
              console.error(`[GeoDataManager] Failed to initialize default ${file}:`, e)
            }
          }
        }
      }
    }
    const antiAdTarget = path.join(dataDir, 'providers', ANTI_AD_PROVIDER.fileName)
    if (!fs.existsSync(antiAdTarget)) {
      for (const src of bundledAntiAdCandidates()) {
        if (!fs.existsSync(src)) continue
        try {
          fs.mkdirSync(path.dirname(antiAdTarget), { recursive: true })
          fs.copyFileSync(src, antiAdTarget)
          console.log(`[GeoDataManager] Installed bundled anti-AD from ${src}`)
          break
        } catch (e) {
          console.error('[GeoDataManager] Failed to install bundled anti-AD:', e)
        }
      }
    }
  }

  public static getStatus(): GeoDataStatus {
    const dataDir = installDataDir()
    const geoipPath = path.join(dataDir, 'geoip.dat')
    const geositePath = path.join(dataDir, 'geosite.dat')

    let geoipExists = fs.existsSync(geoipPath)
    let geoipSize = 0
    let geoipTime = 0
    if (geoipExists) {
      const st = fs.statSync(geoipPath)
      geoipSize = +(st.size / (1024 * 1024)).toFixed(2)
      geoipTime = st.mtimeMs
    }

    let geositeExists = fs.existsSync(geositePath)
    let geositeSize = 0
    let geositeTime = 0
    if (geositeExists) {
      const st = fs.statSync(geositePath)
      geositeSize = +(st.size / (1024 * 1024)).toFixed(2)
      geositeTime = st.mtimeMs
    }

    const mmdbPath = path.join(dataDir, 'country.mmdb')
    const mmdbAltPath = path.join(dataDir, 'Country.mmdb')
    const activeMmdbPath = fs.existsSync(mmdbPath) ? mmdbPath : mmdbAltPath
    let mmdbExists = fs.existsSync(activeMmdbPath)
    let mmdbSize = 0
    let mmdbTime = 0
    if (mmdbExists) {
      const st = fs.statSync(activeMmdbPath)
      mmdbSize = +(st.size / (1024 * 1024)).toFixed(2)
      mmdbTime = st.mtimeMs
    }

    const antiAdPath = path.join(dataDir, 'providers', ANTI_AD_PROVIDER.fileName)
    let antiAdExists = fs.existsSync(antiAdPath)
    let antiAdSize = 0
    let antiAdTime = 0
    if (antiAdExists) {
      const st = fs.statSync(antiAdPath)
      antiAdSize = +(st.size / (1024 * 1024)).toFixed(2)
      antiAdTime = st.mtimeMs
    }

    return {
      geoip: { exists: geoipExists, sizeMb: geoipSize, updatedAt: geoipTime },
      geosite: { exists: geositeExists, sizeMb: geositeSize, updatedAt: geositeTime },
      mmdb: { exists: mmdbExists, sizeMb: mmdbSize, updatedAt: mmdbTime },
      antiAd: { exists: antiAdExists, sizeMb: antiAdSize, updatedAt: antiAdTime },
      directRules: DIRECT_RULE_SETS.map((preset) => {
        const filePath = path.join(dataDir, 'providers', path.basename(preset.path))
        if (!fs.existsSync(filePath)) {
          return { name: preset.name, exists: false, sizeKb: 0, updatedAt: 0 }
        }
        const st = fs.statSync(filePath)
        return {
          name: preset.name,
          exists: true,
          sizeKb: Math.max(1, Math.round(st.size / 1024)),
          updatedAt: st.mtimeMs
        }
      })
    }
  }

  /** Download into memory. The live rule file is replaced only after every required file is ready. */
  private static async downloadBytes(url: string, minBytes: number, mixedPort?: number): Promise<Buffer> {
    let lastErr: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await NetClient.get<ArrayBuffer>(
          url,
          {
            responseType: 'arraybuffer',
            timeout: 120000
          },
          mixedPort
        )
        const buf = Buffer.from(res.data)
        if (buf.length < minBytes) {
          throw new Error(`${url} 只有 ${buf.length} 字节`)
        }
        return buf
      } catch (err) {
        lastErr = err
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
  }

  private static commitFile(dest: string, data: Buffer): void {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const tmp = `${dest}.download`
    fs.writeFileSync(tmp, data)
    if (fs.existsSync(dest)) fs.rmSync(dest, { force: true })
    fs.renameSync(tmp, dest)
  }

  public static async updateRules(
    mixedPort?: number
  ): Promise<{ success: boolean; message: string }> {
    const dataDir = installDataDir()
    const notes: string[] = []

    try {
      const geoip = await this.downloadBytes(this.GEOIP_URL, 200_000, mixedPort)
      const geosite = await this.downloadBytes(this.GEOSITE_URL, 200_000, mixedPort)

      let mmdb: Buffer | null = null
      try {
        mmdb = await this.downloadBytes(this.MMDB_URL, 50_000, mixedPort)
      } catch (mmdbErr) {
        console.warn('[GeoDataManager] Optional country.mmdb update failed (non-fatal):', mmdbErr)
        notes.push('Country.mmdb 保持原文件')
      }

      let antiAd: Buffer | null = null
      try {
        antiAd = await this.downloadBytes(ANTI_AD_PROVIDER.url, 100_000, mixedPort)
      } catch (adErr) {
        const adMsg = adErr instanceof Error ? adErr.message : String(adErr)
        console.warn('[GeoDataManager] anti-AD update failed (non-fatal):', adErr)
        notes.push(`anti-AD 保持原文件: ${adMsg}`)
      }

      this.commitFile(path.join(dataDir, 'geoip.dat'), geoip)
      this.commitFile(path.join(dataDir, 'geosite.dat'), geosite)
      if (mmdb) {
        this.commitFile(path.join(dataDir, 'country.mmdb'), mmdb)
        this.commitFile(path.join(dataDir, 'Country.mmdb'), mmdb)
      }
      if (antiAd) {
        this.commitFile(path.join(dataDir, 'providers', ANTI_AD_PROVIDER.fileName), antiAd)
      }

      const directFiles: string[] = []
      await Promise.all(
        DIRECT_RULE_SETS.map(async (preset) => {
          try {
            const buf = await this.downloadBytes(preset.url, preset.minBytes, mixedPort)
            this.commitFile(path.join(dataDir, 'providers', path.basename(preset.path)), buf)
            directFiles.push(`${preset.name} ${(buf.length / 1024).toFixed(0)}KB`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.warn(`[GeoDataManager] ${preset.name} update failed (non-fatal):`, err)
            notes.push(`${preset.name} 保持原文件: ${msg}`)
          }
        })
      )

      const sizes = `GeoIP: ${(geoip.length / 1024 / 1024).toFixed(2)}MB, GeoSite: ${(geosite.length / 1024 / 1024).toFixed(2)}MB`
      const adSize = antiAd ? `, anti-AD: ${(antiAd.length / 1024 / 1024).toFixed(2)}MB` : ''
      const directSize = directFiles.length > 0 ? `, 直连名单: ${directFiles.join('、')}` : ''
      const extra = notes.length > 0 ? `；${notes.join('；')}` : ''
      return {
        success: true,
        message: `规则库更新成功 (${sizes}${adSize}${directSize})${extra}`
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error('[GeoDataManager] Failed to update GeoData:', err)
      return {
        success: false,
        message: `规则库更新失败: ${errMsg}。正在使用的规则库没有被换掉。`
      }
    }
  }
}
