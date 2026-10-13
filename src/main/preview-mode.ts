import path from 'path'
import { createRequire } from 'node:module'

export const RELEASE_AUMID = 'com.draftone.app'
export const PREVIEW_AUMID = 'com.draftone.app.preview'

const require = createRequire(import.meta.url)

function electronApp() {
  return (require('electron') as typeof import('electron')).app
}

/**
 * Dev (`pnpm dev`) and electron-builder `--dir` unpack (`win-unpacked`)
 * default to preview so they can sit beside an installed build.
 * Install / release builds stay single-instance unless `--preview` is passed.
 * Force off with `--no-preview`.
 */
export function resolvePreviewMode(opts: {
  argv: string[]
  isPackaged: boolean
  execPath: string
}): boolean {
  if (opts.argv.includes('--no-preview')) return false
  if (opts.argv.includes('--preview')) return true
  if (!opts.isPackaged) return true
  const exe = opts.execPath.replace(/\\/g, '/').toLowerCase()
  return exe.includes('/win-unpacked/')
}

let cached: boolean | null = null

export function isPreviewInstance(): boolean {
  if (cached !== null) return cached
  cached = resolvePreviewMode({
    argv: process.argv,
    isPackaged: electronApp().isPackaged,
    execPath: process.execPath
  })
  return cached
}

/** Must run before `app.requestSingleInstanceLock()`. */
export function applyPreviewInstanceIdentity(): void {
  if (!isPreviewInstance()) return
  const app = electronApp()
  app.setPath('userData', path.join(app.getPath('appData'), 'draft-one-Preview'))
  app.setName('draft-one Preview')
}

export function previewAppUserModelId(): string {
  return isPreviewInstance() ? PREVIEW_AUMID : RELEASE_AUMID
}

export function previewWindowTitle(): string {
  return isPreviewInstance() ? 'draft-one (Preview)' : 'draft-one'
}
