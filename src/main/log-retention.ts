import fs from 'fs'
import path from 'path'

/** One log file stays within 4 MiB. Active plus .1 .2 .3 is the whole history. */
export const MAX_LOG_BYTES = 4 * 1024 * 1024
export const MAX_LOG_PARTS = 4

function partIndex(base: string, name: string): number | null {
  const prefix = `${base}.`
  if (!name.startsWith(prefix)) return null
  const rest = name.slice(prefix.length)
  if (!/^[1-9]\d*$/.test(rest)) return null
  return Number(rest)
}

function trimFileToTail(file: string, maxBytes: number): void {
  const size = fs.statSync(file).size
  if (size <= maxBytes) return
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(maxBytes)
    fs.readSync(fd, buf, 0, maxBytes, size - maxBytes)
    const newline = buf.indexOf(0x0a)
    const body = newline >= 0 && newline < buf.length - 1 ? buf.subarray(newline + 1) : buf
    const tmp = `${file}.trim`
    fs.rmSync(tmp, { force: true })
    fs.writeFileSync(tmp, body)
    fs.rmSync(file, { force: true })
    fs.renameSync(tmp, file)
  } finally {
    fs.closeSync(fd)
  }
}

export function rotateLogFile(active: string, maxParts = MAX_LOG_PARTS): void {
  fs.rmSync(`${active}.${maxParts - 1}`, { force: true })
  for (let i = maxParts - 2; i >= 1; i--) {
    const src = `${active}.${i}`
    const dest = `${active}.${i + 1}`
    if (!fs.existsSync(src)) continue
    fs.rmSync(dest, { force: true })
    fs.renameSync(src, dest)
  }
  if (!fs.existsSync(active)) return
  const first = `${active}.1`
  fs.rmSync(first, { force: true })
  fs.renameSync(active, first)
}

/** Drop part numbers outside 1..maxParts-1, and keep every remaining file within maxBytes. */
export function enforceLogRetention(
  active: string,
  maxBytes = MAX_LOG_BYTES,
  maxParts = MAX_LOG_PARTS
): void {
  const dir = path.dirname(active)
  const base = path.basename(active)
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    const index = partIndex(base, name)
    if (index == null) continue
    if (index < 1 || index >= maxParts) fs.rmSync(path.join(dir, name), { force: true })
  }
  const files = [active]
  for (let i = 1; i < maxParts; i++) files.push(`${active}.${i}`)
  for (const file of files) {
    if (!fs.existsSync(file)) continue
    if (fs.statSync(file).size > maxBytes) trimFileToTail(file, maxBytes)
  }
}
