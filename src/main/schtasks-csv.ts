export function parseSchtasksCsv(text: string): { taskName: string; nextRun: string; status: string }[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('"'))
  if (lines.length === 0) return []
  const header = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase())
  const nameAt = header.findIndex((cell) => cell.includes('taskname') || cell.includes('任务名'))
  const nextAt = header.findIndex((cell) => cell.includes('next') || cell.includes('下次'))
  const statusAt = header.findIndex((cell) => cell.includes('status') || cell.includes('状态'))
  const rows: { taskName: string; nextRun: string; status: string }[] = []
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line)
    const taskName = cells[nameAt >= 0 ? nameAt : 0] || ''
    if (!taskName) continue
    rows.push({
      taskName,
      nextRun: nextAt >= 0 ? cells[nextAt] || '' : '',
      status: statusAt >= 0 ? cells[statusAt] || '' : ''
    })
  }
  return rows
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        current += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells
}
