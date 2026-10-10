import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const binariesDir = path.join(rootDir, 'resources', 'binaries')

const MIHOMO_VERSION = process.env.MIHOMO_VERSION || 'v1.19.32'
const MIHOMO_ZIP_NAME = `mihomo-windows-amd64-compatible-${MIHOMO_VERSION}.zip`
const MIHOMO_URL = `https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/${MIHOMO_ZIP_NAME}`

const GEOIP_URL = 'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat'
const GEOSITE_URL = 'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat'
const ANTI_AD_URL = 'https://anti-ad.net/clash.yaml'

async function downloadFile(url, destPath) {
  console.log(`[download] Fetching ${url} ...`)
  const response = await fetch(url, {
    headers: { 'User-Agent': 'draft-one-CI-Builder' }
  })
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer))
  console.log(`[download] Saved to ${destPath} (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`)
}

function findNamedFile(dir, fileName) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = findNamedFile(full, fileName)
      if (nested) return nested
    } else if (entry.name.toLowerCase() === fileName.toLowerCase()) {
      return full
    }
  }
  return null
}

function writeMihomoHash() {
  const mihomoExe = path.join(binariesDir, 'mihomo.exe')
  if (!fs.existsSync(mihomoExe)) return
  const hex = crypto.createHash('sha256').update(fs.readFileSync(mihomoExe)).digest('hex')
  fs.writeFileSync(path.join(binariesDir, 'mihomo.sha256'), `${hex}\n`)
  console.log('[mihomo] Wrote mihomo.sha256')
}

async function prepareMihomo() {
  const mihomoExe = path.join(binariesDir, 'mihomo.exe')

  // Check if force refresh is requested or binary is missing
  const force = process.env.FORCE_DOWNLOAD === 'true'
  if (!force && fs.existsSync(mihomoExe)) {
    console.log('[mihomo] mihomo.exe already exists, skipping download.')
    writeMihomoHash()
    return
  }

  const tempZip = path.join(binariesDir, 'temp-mihomo.zip')
  try {
    await downloadFile(MIHOMO_URL, tempZip)

    // Extract zip
    console.log('[mihomo] Extracting archive...')
    const tempExtractDir = path.join(binariesDir, 'temp-extract')
    if (fs.existsSync(tempExtractDir)) {
      fs.rmSync(tempExtractDir, { recursive: true, force: true })
    }
    fs.mkdirSync(tempExtractDir, { recursive: true })

    if (process.platform === 'win32') {
      try {
        execSync(`tar -xf "${tempZip}" -C "${tempExtractDir}"`, { stdio: 'inherit' })
      } catch {
        execSync(
          `powershell -NoProfile -NonInteractive -Command "Expand-Archive -LiteralPath '${tempZip.replace(/'/g, "''")}' -DestinationPath '${tempExtractDir.replace(/'/g, "''")}' -Force"`,
          { stdio: 'inherit' }
        )
      }
    } else {
      try {
        execSync(`tar -xf "${tempZip}" -C "${tempExtractDir}"`, { stdio: 'inherit' })
      } catch {
        execSync(`unzip -o "${tempZip}" -d "${tempExtractDir}"`, { stdio: 'inherit' })
      }
    }

    const files = fs.readdirSync(tempExtractDir)
    const coreExe = files.find((f) => f.endsWith('.exe'))
    if (!coreExe) {
      throw new Error(`No .exe found in extracted mihomo archive: ${files.join(', ')}`)
    }

    const srcExe = path.join(tempExtractDir, coreExe)
    fs.copyFileSync(srcExe, mihomoExe)
    console.log(`[mihomo] Successfully installed mihomo.exe from ${coreExe}`)

    const wintunSrc = findNamedFile(tempExtractDir, 'wintun.dll')
    if (wintunSrc) {
      fs.copyFileSync(wintunSrc, path.join(binariesDir, 'wintun.dll'))
      console.log(`[mihomo] Copied wintun.dll from ${wintunSrc}`)
    } else {
      console.log('[mihomo] Archive does not contain wintun.dll')
    }

    // Cleanup
    fs.rmSync(tempExtractDir, { recursive: true, force: true })
    if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip)
  } catch (err) {
    if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip)
    throw err
  } finally {
    writeMihomoHash()
  }
}

async function compileWindowsService() {
  const csSource = path.join(binariesDir, 'DraftOneService.cs')
  const targetExe = path.join(binariesDir, 'DraftOneService.exe')

  if (!fs.existsSync(csSource)) {
    console.log('[service] DraftOneService.cs not found, skipping.')
    return
  }

  const force = process.env.FORCE_DOWNLOAD === 'true'
  if (!force && fs.existsSync(targetExe)) {
    try {
      const csMtime = fs.statSync(csSource).mtimeMs
      const exeMtime = fs.statSync(targetExe).mtimeMs
      if (exeMtime >= csMtime) {
        console.log('[service] DraftOneService.exe is up-to-date, skipping compilation.')
        return
      }
    } catch {}
  }

  if (process.platform === 'win32') {
    const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
    if (fs.existsSync(cscPath)) {
      console.log('[service] Compiling DraftOneService.cs via csc.exe...')
      try {
        execSync(`"${cscPath}" /target:exe /out:"${targetExe}" /r:System.ServiceProcess.dll "${csSource}"`, {
          stdio: 'inherit'
        })
        console.log(`[service] DraftOneService.exe compiled successfully.`)
      } catch (e) {
        console.warn(`[service] Compilation failed (non-fatal):`, e.message)
      }
    } else {
      console.warn(`[service] csc.exe not found at ${cscPath}, skipping compilation.`)
    }
  } else {
    console.log('[service] Non-Windows host, skipping csc.exe compilation (will compile on Windows CI).')
  }
}

const MMDB_URL = 'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/country.mmdb'

async function prepareGeoData() {
  const geoipPath = path.join(binariesDir, 'geoip.dat')
  const geositePath = path.join(binariesDir, 'geosite.dat')
  const mmdbPath = path.join(binariesDir, 'country.mmdb')
  const antiAdPath = path.join(binariesDir, 'anti-ad.yaml')

  const force = process.env.FORCE_DOWNLOAD === 'true'
  const geoReady =
    fs.existsSync(geoipPath) && fs.existsSync(geositePath) && fs.existsSync(mmdbPath)
  const antiAdReady = fs.existsSync(antiAdPath)
  if (!force && geoReady && antiAdReady) {
    console.log('[geodata] geoip.dat, geosite.dat, country.mmdb, and anti-ad.yaml already exist, skipping.')
    return
  }

  try {
    if (force || !fs.existsSync(geoipPath)) {
      await downloadFile(GEOIP_URL, geoipPath)
    }
    if (force || !fs.existsSync(geositePath)) {
      await downloadFile(GEOSITE_URL, geositePath)
    }
    if (force || !fs.existsSync(mmdbPath)) {
      await downloadFile(MMDB_URL, mmdbPath)
    }
    console.log('[geodata] GeoIP, GeoSite, and MMDB databases ready.')
  } catch (err) {
    console.warn('[geodata] Failed to download geo data, skipping (client will download at runtime):', err.message)
  }

  try {
    if (force || !fs.existsSync(antiAdPath)) {
      await downloadFile(ANTI_AD_URL, antiAdPath)
    }
    const size = fs.statSync(antiAdPath).size
    if (size < 100000) {
      throw new Error(`anti-ad.yaml is too small (${size} bytes)`)
    }
    console.log('[geodata] Bundled anti-ad.yaml ready.')
  } catch (err) {
    if (force) {
      throw err
    }
    console.warn('[geodata] Failed to download anti-ad.yaml, skipping (client will download at runtime):', err.message)
  }
}

async function main() {
  console.log('=== Preparing Binaries for draft-one ===')
  if (!fs.existsSync(binariesDir)) {
    fs.mkdirSync(binariesDir, { recursive: true })
  }

  await prepareMihomo()
  await compileWindowsService()
  await prepareGeoData()

  console.log('=== Binaries preparation complete ===')
}

main().catch((err) => {
  console.error('[error] Preparation failed:', err)
  process.exit(1)
})
