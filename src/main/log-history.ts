export type AppLogType = 'debug' | 'info' | 'warning' | 'error'

export function parseAppLogLine(line: string): { time: string; type: AppLogType; payload: string } | null {
  const match = /^(\d{2}:\d{2}:\d{2}\.\d{3}) \[(debug|info|warning|error)\] (.*)$/.exec(line.trim())
  if (!match) return null
  return { time: match[1], type: match[2] as AppLogType, payload: match[3] }
}

export function tailLines(text: string, maxLines: number): string[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length <= maxLines) return lines
  return lines.slice(lines.length - maxLines)
}
