import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'))
const version = pkg.version || '1.0.0'
const productName = 'draft-one'

console.log(`[update-builder] Starting Lightweight One-Click Update Packaging for v${version}...`)

const distDir = path.join(rootDir, 'dist')
const unpackedResources = path.join(distDir, 'win-unpacked', 'resources')
const appAsar = path.join(unpackedResources, 'app.asar')
const serviceExe = path.join(rootDir, 'resources', 'binaries', 'DraftOneService.exe')
const iconIco = path.join(rootDir, 'resources', 'icon.ico')

if (!fs.existsSync(appAsar)) {
  console.error(`[update-builder] Error: ${appAsar} not found! Run 'pnpm run build' first.`)
  process.exit(1)
}

const stagingDir = path.join(distDir, 'update-staging')
if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true })
}
fs.mkdirSync(path.join(stagingDir, 'resources', 'binaries'), { recursive: true })

// 1. Copy payload files: app.asar, DraftOneService.exe, icon.ico, update.json
fs.copyFileSync(appAsar, path.join(stagingDir, 'resources', 'app.asar'))
if (fs.existsSync(serviceExe)) {
  fs.copyFileSync(serviceExe, path.join(stagingDir, 'resources', 'binaries', 'DraftOneService.exe'))
}
if (fs.existsSync(iconIco)) {
  fs.copyFileSync(iconIco, path.join(stagingDir, 'resources', 'icon.ico'))
}

const updateManifest = {
  version,
  releaseDate: new Date().toISOString(),
  target: 'windows-x64',
  includes: ['resources/app.asar', 'resources/binaries/DraftOneService.exe']
}
fs.writeFileSync(path.join(stagingDir, 'update.json'), JSON.stringify(updateManifest, null, 2))

// 2. Build lightweight Update ZIP (approx 4.5 MB)
const updateZipName = `${productName}-Windows-${version}-Update-x64.zip`
const updateZipPath = path.join(distDir, updateZipName)
if (fs.existsSync(updateZipPath)) fs.unlinkSync(updateZipPath)

console.log(`[update-builder] Creating ${updateZipName}...`)

// Locate 7za binary from 7zip-bin package
const isWin = process.platform === 'win32'
const sevenZipExe = isWin
  ? path.join(rootDir, 'node_modules', '.pnpm', '7zip-bin@5.2.0', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')
  : path.join(rootDir, 'node_modules', '.pnpm', '7zip-bin@5.2.0', 'node_modules', '7zip-bin', 'linux', 'x64', '7za')

if (fs.existsSync(sevenZipExe)) {
  execSync(`"${sevenZipExe}" a -tzip -mx=9 "${updateZipPath}" *`, {
    cwd: stagingDir,
    stdio: 'ignore'
  })
} else {
  // Fallback to powershell or zip command
  if (isWin) {
    execSync(`powershell.exe -Command "Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${updateZipPath}' -Force"`)
  } else {
    execSync(`cd "${stagingDir}" && zip -r "${updateZipPath}" .`, { stdio: 'ignore' })
  }
}

const zipStat = fs.statSync(updateZipPath)
console.log(`[update-builder] ${updateZipName} created: ${(zipStat.size / 1024 / 1024).toFixed(2)} MB`)

// 3. Build standalone One-Click Update EXE (approx ~5 MB)
// Compiles scripts/updater-template.cs with payload.zip embedded as resource
const payloadZipPath = path.join(stagingDir, 'payload.zip')
fs.copyFileSync(updateZipPath, payloadZipPath)

const updateExeName = `${productName}-Setup-${version}-Update.exe`
const updateExePath = path.join(distDir, updateExeName)
const csSource = path.join(__dirname, 'updater-template.cs')

const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
if (isWin && fs.existsSync(cscPath)) {
  console.log(`[update-builder] Compiling ${updateExeName} via csc.exe...`)
  try {
    const compileCmd = `"${cscPath}" /target:winexe /win32icon:"${iconIco}" /resource:"${payloadZipPath}",payload.zip /out:"${updateExePath}" /r:System.Windows.Forms.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll "${csSource}"`
    execSync(compileCmd, { stdio: 'inherit' })
    const exeStat = fs.statSync(updateExePath)
    console.log(`[update-builder] ${updateExeName} created: ${(exeStat.size / 1024 / 1024).toFixed(2)} MB (极简一键升级安装包)`)
  } catch (err) {
    console.warn(`[update-builder] Failed to compile update exe:`, err)
    if (process.env.GITHUB_ACTIONS === 'true') throw err
  }
} else if (process.env.GITHUB_ACTIONS === 'true') {
  throw new Error(`[update-builder] csc.exe unavailable; CI must produce ${updateExeName}`)
} else {
  console.log(`[update-builder] Non-Windows environment or csc.exe unavailable; Windows CI will compile ${updateExeName}.`)
}

// Cleanup staging
fs.rmSync(stagingDir, { recursive: true, force: true })

console.log('----------------------------------------------------')
console.log(`[update-builder] 极简升级包制作流程就绪:`)
console.log(`  更新包体积: 仅约 4.5~5 MB (节省 95% 体积，无损秒级升级)`)
console.log(`  发布产物: dist/${updateExeName} 及 dist/${updateZipName}`)
console.log('----------------------------------------------------')
