/** Decode a Windows console buffer. UTF-8 first, then GBK when UTF-8 is not valid. */
export function decodeWin(buf: Buffer): string {
  if (!buf || buf.length === 0) return ''
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  if (!utf8.includes('\uFFFD')) return utf8
  try {
    return new TextDecoder('gbk').decode(buf)
  } catch {
    return utf8
  }
}
