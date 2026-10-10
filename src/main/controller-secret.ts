import { installDataDir } from './app-data-dir'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

function readSecretFile(file: string): string | null {
  try {
    if (!fs.existsSync(file)) return null
    const saved = fs.readFileSync(file, 'utf-8').trim()
    if (/^[A-Za-z0-9_-]{16,128}$/.test(saved)) return saved
  } catch {
    // fall through and issue a new secret
  }
  return null
}

function readSecretFromYaml(file: string): string | null {
  try {
    if (!fs.existsSync(file)) return null
    const text = fs.readFileSync(file, 'utf-8')
    const match = text.match(/^secret:\s*['"]?([A-Za-z0-9_-]{8,128})['"]?\s*$/m)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/**
 * One secret per install, stored beside the other user data.
 * If a core is already running from an older config.yaml, keep that secret
 * so the GUI and the service talk to the same controller.
 */
export function getControllerSecret(): string {
  const dir = installDataDir()
  const file = path.join(dir, 'controller-secret')
  const existing = readSecretFile(file)
  if (existing) return existing

  const adopted = readSecretFromYaml(path.join(dir, 'config.yaml'))
  const secret = adopted && adopted.length >= 16 ? adopted : crypto.randomBytes(24).toString('hex')
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, secret, { encoding: 'utf-8', mode: 0o600 })
  } catch (err) {
    console.error('[Secret] Failed to persist controller secret:', err)
  }
  return secret
}
