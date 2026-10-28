/**
 * PNG 的块与文本块（纯函数，服务端与浏览器都能用）。酒馆卡（`chara` / `ccv3`）与出图工具写进图里
 * 的原配方（A1111 `parameters`、ComfyUI `prompt`、NovelAI `Comment`）都住在文本块里。
 *
 * ⚠ 不校验 CRC；块长度越界或到 `IEND` 就停。
 * ⚠ 压缩的块（zTXt、压缩的 iTXt）要调用方给解压函数（服务端用 `zlib.inflateSync`），不给就跳过。
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const TEXT_CHUNK_TYPES = new Set(['tEXt', 'iTXt', 'zTXt'])
/** 一个文本块最多认多少字节（ComfyUI 的整份工作流可以上百 KB，再大就不是配方了）。 */
const MAX_TEXT_CHUNK_BYTES = 2_000_000

interface PngChunk {
  type: string
  start: number
  end: number
  data: Uint8Array
}

export interface PngTextChunk {
  readonly keyword: string
  readonly text: string
}

/** zlib 流 → 原文字节；解不开就抛。 */
export type PngInflate = (data: Uint8Array) => Uint8Array

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

function readChunks(bytes: Uint8Array): PngChunk[] {
  const chunks: PngChunk[] = []
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = PNG_SIGNATURE.length
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const dataStart = offset + 8
    const end = dataStart + length + 4
    if (end > bytes.length) break
    chunks.push({
      type,
      start: offset,
      end,
      data: bytes.subarray(dataStart, dataStart + length),
    })
    offset = end
    if (type === 'IEND') break
  }
  return chunks
}

const latin1 = new TextDecoder('latin1')
const utf8 = new TextDecoder('utf-8')
const strictUtf8 = new TextDecoder('utf-8', { fatal: true })

/**
 * tEXt 按规范是 latin1，但 NovelAI / ComfyUI 一类工具常把 UTF-8 直接写进去：是合法 UTF-8 就按
 * UTF-8 读（纯 ASCII 两种读法一样），不是才按 latin1。
 */
function decodeLatin1OrUtf8(bytes: Uint8Array): string {
  try {
    return strictUtf8.decode(bytes)
  } catch {
    return latin1.decode(bytes)
  }
}

function inflated(data: Uint8Array, inflate: PngInflate | undefined) {
  if (!inflate) return null
  try {
    return inflate(data)
  } catch {
    return null
  }
}

/** 一个文本块 → 关键字与正文；读不了（压缩了又没给解压、格式不对）是 `null`。 */
function readTextChunk(
  chunk: PngChunk,
  inflate: PngInflate | undefined,
): PngTextChunk | null {
  if (chunk.data.length > MAX_TEXT_CHUNK_BYTES) return null
  const zero = chunk.data.indexOf(0)
  if (zero <= 0) return null
  const keyword = latin1.decode(chunk.data.subarray(0, zero))
  if (chunk.type === 'tEXt') {
    return { keyword, text: decodeLatin1OrUtf8(chunk.data.subarray(zero + 1)) }
  }
  if (chunk.type === 'zTXt') {
    // 关键字 \0 压缩方法 正文（zlib）
    const text = inflated(chunk.data.subarray(zero + 2), inflate)
    return text ? { keyword, text: latin1.decode(text) } : null
  }
  if (chunk.type === 'iTXt') {
    // 关键字 \0 压缩标志 压缩方法 语言 \0 译名 \0 正文
    const compressed = chunk.data[zero + 1] === 1
    let cursor = zero + 3
    for (let skip = 0; skip < 2; skip += 1) {
      const next = chunk.data.indexOf(0, cursor)
      if (next < 0) return null
      cursor = next + 1
    }
    const body = chunk.data.subarray(cursor)
    const text = compressed ? inflated(body, inflate) : body
    return text ? { keyword, text: utf8.decode(text) } : null
  }
  return null
}

/** PNG 里的所有文本块，按出现的顺序；不是 PNG 是空。 */
export function readPngTextChunks(
  bytes: Uint8Array,
  inflate?: PngInflate,
): PngTextChunk[] {
  if (!isPng(bytes)) return []
  const texts: PngTextChunk[] = []
  for (const chunk of readChunks(bytes)) {
    if (!TEXT_CHUNK_TYPES.has(chunk.type)) continue
    const entry = readTextChunk(chunk, inflate)
    if (entry) texts.push(entry)
  }
  return texts
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * 在 `IEND` 前插一个 tEXt 块（正文按 latin1 写，调用方给 ASCII，如 base64）。
 * 不是 PNG 或找不到 `IEND` 原样返回。
 */
export function addPngTextChunk(
  bytes: Uint8Array,
  keyword: string,
  text: string,
): Uint8Array {
  if (!isPng(bytes)) return bytes
  const iend = readChunks(bytes).find((chunk) => chunk.type === 'IEND')
  if (!iend) return bytes
  const body = Uint8Array.from(`tEXt${keyword}\0${text}`, (char) =>
    char.charCodeAt(0),
  )
  const chunk = new Uint8Array(body.length + 8)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, body.length - 4)
  chunk.set(body, 4)
  view.setUint32(body.length + 4, crc32(body))
  const out = new Uint8Array(bytes.length + chunk.length)
  out.set(bytes.subarray(0, iend.start), 0)
  out.set(chunk, iend.start)
  out.set(bytes.subarray(iend.start), iend.start + chunk.length)
  return out
}

/**
 * 去掉 PNG 里的文本块再当参考图存：卡的 JSON（常有几十 KB 的世界书）不该跟着图走到
 * 每一家出图服务商那里。
 */
export function stripPngTextChunks(bytes: Uint8Array): Uint8Array {
  if (!isPng(bytes)) return bytes
  const keep = readChunks(bytes).filter(
    (chunk) => !TEXT_CHUNK_TYPES.has(chunk.type),
  )
  const size =
    PNG_SIGNATURE.length +
    keep.reduce((total, chunk) => total + chunk.end - chunk.start, 0)
  const out = new Uint8Array(size)
  out.set(PNG_SIGNATURE, 0)
  let offset = PNG_SIGNATURE.length
  for (const chunk of keep) {
    out.set(bytes.subarray(chunk.start, chunk.end), offset)
    offset += chunk.end - chunk.start
  }
  return out
}
