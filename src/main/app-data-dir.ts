import fs from 'fs'
import path from 'path'
import { app } from 'electron'

/** Config, rules, and logs. System caches and TEMP stay on their normal paths. */
export function installDataDir(): string {
  const root = app.isPackaged ? path.dirname(process.execPath) : app.getAppPath()
  const dir = path.join(root, 'data')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
