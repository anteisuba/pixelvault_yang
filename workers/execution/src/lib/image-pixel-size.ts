/**
 * 从图片字节头读出真实像素宽高（PNG / JPEG / WebP / GIF）；认不出 = null。
 *
 * 为什么要（11-19）：有的 provider 只收比例不收像素（Gemini 的 `aspectRatio`），
 * 出回来的尺寸与按比例估的「标准尺寸」对不上 —— 16:9 估 1792×1024、实出 1376×768。
 * 作品记录的宽高要以真像素为准，估值只在读不出时兜底。只读头部，不解码。
 */
export function readImagePixelSize(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const valid = (width: number, height: number) =>
    width > 0 && height > 0 ? { width, height } : null

  // PNG：8 字节签名 + IHDR（宽高大端 u32）。
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return valid(view.getUint32(16), view.getUint32(20))
  }

  // GIF：逻辑屏幕宽高（小端 u16）。
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    return valid(view.getUint16(6, true), view.getUint16(8, true))
  }

  // WebP：RIFF....WEBP + VP8 / VP8L / VP8X。
  if (
    bytes.length >= 30 &&
    readAscii(bytes, 0, 4) === 'RIFF' &&
    readAscii(bytes, 8, 4) === 'WEBP'
  ) {
    const chunk = readAscii(bytes, 12, 4)
    if (chunk === 'VP8 ') {
      return valid(
        view.getUint16(26, true) & 0x3fff,
        view.getUint16(28, true) & 0x3fff,
      )
    }
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true)
      return valid((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
    }
    if (chunk === 'VP8X') {
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16))
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
      return valid(width, height)
    }
    return null
  }

  // JPEG：顺着段找 SOF（C0–CF，除去 C4 / C8 / CC），高在前宽在后。
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null
      const marker = bytes[offset + 1]
      if (marker === 0xff) {
        offset += 1
        continue
      }
      const length = view.getUint16(offset + 2)
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return valid(view.getUint16(offset + 7), view.getUint16(offset + 5))
      }
      if (length < 2) return null
      offset += 2 + length
    }
  }

  return null
}

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}
