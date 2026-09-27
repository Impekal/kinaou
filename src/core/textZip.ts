export interface TextZipEntry { path: string; text: string }
export const textZipLimits = { entries: 4096, bytes: 16 * 1024 * 1024, path: 240 } as const
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
/**
 * Bounded UTF-8 text-only ZIP, stored (method 0), no encryption, executable flags or ZIP64.
 * Format: PKWARE APPNOTE sections 4.3.7, 4.3.12, 4.3.16.
 * https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 */
export function createTextZip(entries: readonly TextZipEntry[]): Uint8Array<ArrayBuffer> {
  if (!entries.length || entries.length > textZipLimits.entries) throw new Error('Text archive entry limit exceeded')
  const names = new Set<string>()
  let total = 22
  const files = entries.map(entry => {
    if (entry.path.length > textZipLimits.path || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(entry.path)
      || entry.path.split('/').some(part => !part || part === '.' || part === '..' || part.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Unsafe text archive path')
    const folded = entry.path.toLowerCase()
    if (names.has(folded)) throw new Error('Duplicate text archive path')
    names.add(folded)
    if (entry.text.length > textZipLimits.bytes) throw new Error('Text archive size limit exceeded')
    const name = encoder.encode(entry.path), data = encoder.encode(entry.text)
    if (decoder.decode(data) !== entry.text) throw new Error('Text archive contains malformed Unicode')
    total += 30 + name.length + data.length + 46 + name.length
    if (total > textZipLimits.bytes) throw new Error('Text archive size limit exceeded')
    return { name, data, crc: crc32(data), offset: 0 }
  })
  // A file may not also be a directory prefix of another file.
  for (const path of names) {
    const parts = path.split('/')
    for (let index = 1; index < parts.length; index++) if (names.has(parts.slice(0, index).join('/'))) throw new Error('Conflicting text archive paths')
  }
  const bytes = new Uint8Array(total), view = new DataView(bytes.buffer)
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, true)
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, true)
  let cursor = 0
  for (const file of files) {
    file.offset = cursor
    u32(cursor, 0x04034b50); u16(cursor + 4, 20); u16(cursor + 6, 0x800); u16(cursor + 12, 0x21)
    u32(cursor + 14, file.crc); u32(cursor + 18, file.data.length); u32(cursor + 22, file.data.length); u16(cursor + 26, file.name.length)
    bytes.set(file.name, cursor + 30); bytes.set(file.data, cursor + 30 + file.name.length)
    cursor += 30 + file.name.length + file.data.length
  }
  const directoryOffset = cursor
  for (const file of files) {
    u32(cursor, 0x02014b50); u16(cursor + 4, 20); u16(cursor + 6, 20); u16(cursor + 8, 0x800); u16(cursor + 14, 0x21)
    u32(cursor + 16, file.crc); u32(cursor + 20, file.data.length); u32(cursor + 24, file.data.length); u16(cursor + 28, file.name.length)
    u32(cursor + 42, file.offset); bytes.set(file.name, cursor + 46)
    cursor += 46 + file.name.length
  }
  const directorySize = cursor - directoryOffset
  u32(cursor, 0x06054b50); u16(cursor + 8, files.length); u16(cursor + 10, files.length); u32(cursor + 12, directorySize); u32(cursor + 16, directoryOffset)
  return bytes
}
