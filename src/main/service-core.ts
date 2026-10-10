import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export const CORE_EXE = 'mihomo.exe'
export const CORE_HASH_FILE = 'mihomo.sha256'

export function coreBesideService(serviceExe: string): string {
  return path.join(path.dirname(serviceExe), CORE_EXE)
}

export function hashFileHex(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

export function formatHashFile(hex: string): string {
  return `${hex.toLowerCase()}\n`
}

export function hashAccepts(expectedFileText: string, actualHex: string): boolean {
  const token = expectedFileText.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  return /^[0-9a-f]{64}$/.test(token) && token === actualHex.toLowerCase()
}
