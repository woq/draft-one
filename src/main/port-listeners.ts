export interface PortOccupant {
  port: number
  pid: number
  image: string
}

export function parseNetstatListeners(text: string, ports: number[]): { port: number; pid: number }[] {
  const wanted = new Set(ports)
  const found: { port: number; pid: number }[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!/^TCP\b/i.test(trimmed) || !/\bLISTENING\b/i.test(trimmed)) continue
    const parts = trimmed.split(/\s+/)
    const local = parts[1] || ''
    const pid = Number(parts[parts.length - 1])
    const portMatch = local.match(/:(\d+)$/)
    if (!portMatch || !Number.isInteger(pid) || pid <= 0) continue
    const port = Number(portMatch[1])
    if (!wanted.has(port)) continue
    found.push({ port, pid })
  }
  return found
}

export function parseTasklistImage(text: string): string | null {
  const line = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.startsWith('"'))
  if (!line) return null
  const match = line.match(/^"([^"]+)"/)
  return match ? match[1] : null
}

/** PID 0 and 4 are system processes. The app must not end itself. */
export function killAllowed(pid: number, selfPid: number): boolean {
  return Number.isInteger(pid) && pid > 4 && pid !== selfPid
}
