const CP1252_BYTES_BY_CHAR = new Map<string, number>([
  ['€', 0x80],
  ['‚', 0x82],
  ['ƒ', 0x83],
  ['„', 0x84],
  ['…', 0x85],
  ['†', 0x86],
  ['‡', 0x87],
  ['ˆ', 0x88],
  ['‰', 0x89],
  ['Š', 0x8a],
  ['‹', 0x8b],
  ['Œ', 0x8c],
  ['Ž', 0x8e],
  ['‘', 0x91],
  ['’', 0x92],
  ['“', 0x93],
  ['”', 0x94],
  ['•', 0x95],
  ['–', 0x96],
  ['—', 0x97],
  ['˜', 0x98],
  ['™', 0x99],
  ['š', 0x9a],
  ['›', 0x9b],
  ['œ', 0x9c],
  ['ž', 0x9e],
  ['Ÿ', 0x9f],
])

const C1_CONTROL_RE = /[\u0080-\u009f]/
const COMMON_MOJIBAKE_RE = /(?:Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]|â[€œ€™“”•–—])/
const CJK_RE = /[\u3400-\u9fff]/
const REPLACEMENT_RE = /\uFFFD/

function isByteLike(char: string): boolean {
  const code = char.codePointAt(0)
  return code !== undefined && (code <= 0xff || CP1252_BYTES_BY_CHAR.has(char))
}

function toByte(char: string): number | null {
  const code = char.codePointAt(0)
  if (code === undefined) return null
  if (code <= 0xff) return code
  return CP1252_BYTES_BY_CHAR.get(char) ?? null
}

function looksLikeUtf8Mojibake(value: string): boolean {
  return C1_CONTROL_RE.test(value) || COMMON_MOJIBAKE_RE.test(value)
}

function textQualityScore(value: string): number {
  let score = 0
  for (const char of Array.from(value)) {
    if (C1_CONTROL_RE.test(char)) score -= 12
    if (REPLACEMENT_RE.test(char)) score -= 20
    if (CJK_RE.test(char)) score += 3
  }
  if (COMMON_MOJIBAKE_RE.test(value)) score -= 6
  return score
}

function repairByteLikeSegment(segment: string): string {
  if (!looksLikeUtf8Mojibake(segment)) return segment

  const bytes: number[] = []
  for (const char of Array.from(segment)) {
    const byte = toByte(char)
    if (byte === null) return segment
    bytes.push(byte)
  }

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(
      new Uint8Array(bytes),
    )
    return textQualityScore(decoded) > textQualityScore(segment)
      ? decoded
      : segment
  } catch {
    return segment
  }
}

/**
 * Fix text that was UTF-8 originally but got surfaced as Latin-1 / CP1252
 * mojibake, e.g. "ææ¥" -> "明日". Normal Unicode text is returned unchanged.
 */
export function repairUtf8Mojibake(value: string): string {
  if (!value) return value

  let repaired = ''
  let segment = ''
  for (const char of Array.from(value)) {
    if (isByteLike(char)) {
      segment += char
      continue
    }
    repaired += repairByteLikeSegment(segment)
    segment = ''
    repaired += char
  }
  repaired += repairByteLikeSegment(segment)
  return repaired
}
