import { execFile } from 'child_process'
import { decodeWin } from './win-text'
import {
  killAllowed,
  parseNetstatListeners,
  parseTasklistImage,
  type PortOccupant
} from './port-listeners'

export type { PortOccupant }
export { killAllowed, parseNetstatListeners, parseTasklistImage }

function execText(file: string, args: string[]): Promise<{ code: number; text: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 8000, encoding: 'buffer' }, (err, stdout, stderr) => {
      const out = Buffer.isBuffer(stdout) ? decodeWin(stdout) : String(stdout || '')
      const errText = Buffer.isBuffer(stderr) ? decodeWin(stderr) : String(stderr || '')
      const text = [out.trim(), errText.trim()].filter(Boolean).join('\n')
      const code = typeof err?.code === 'number' ? err.code : err ? 1 : 0
      resolve({ code, text })
    })
  })
}

export async function listTcpListeners(ports: number[]): Promise<PortOccupant[]> {
  const uniquePorts = [...new Set(ports.filter((port) => port > 0 && port < 65536))]
  if (uniquePorts.length === 0) return []
  const listed = await execText('netstat.exe', ['-ano', '-p', 'tcp'])
  const listeners = parseNetstatListeners(listed.text, uniquePorts)
  const occupants: PortOccupant[] = []
  const seen = new Set<string>()
  for (const listener of listeners) {
    const key = `${listener.port}:${listener.pid}`
    if (seen.has(key)) continue
    seen.add(key)
    const task = await execText('tasklist.exe', ['/FI', `PID eq ${listener.pid}`, '/FO', 'CSV', '/NH'])
    occupants.push({
      port: listener.port,
      pid: listener.pid,
      image: parseTasklistImage(task.text) || `PID ${listener.pid}`
    })
  }
  return occupants
}

export async function endListener(
  pid: number,
  ports: number[],
  selfPid: number
): Promise<{ ok: boolean; message: string }> {
  if (!killAllowed(pid, selfPid)) {
    return { ok: false, message: `PID ${pid} 不在可结束范围内。` }
  }
  const current = await listTcpListeners(ports)
  const match = current.find((item) => item.pid === pid)
  if (!match) {
    return { ok: false, message: `PID ${pid} 已经不在监听这些端口。` }
  }
  const killed = await execText('taskkill.exe', ['/PID', String(pid), '/F'])
  if (killed.code !== 0) {
    return { ok: false, message: killed.text || `结束 PID ${pid} 失败。` }
  }
  return { ok: true, message: `已结束 ${match.image} (PID ${pid})。` }
}
