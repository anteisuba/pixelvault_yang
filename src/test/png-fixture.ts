import { deflateSync } from 'node:zlib'

/**
 * 测试用的 PNG 字节：签名 + 全零 IHDR + 给的块 + IEND（CRC 填 0：解析不校验 CRC；
 * 全零 IHDR 的图解不出像素，只用来测文本块）。
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function bytesOf(text: string, encoding: 'latin1' | 'utf8'): number[] {
  return [...Buffer.from(text, encoding)]
}

export function pngChunk(type: string, data: Uint8Array | number[]): number[] {
  const length = data.length
  return [
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...bytesOf(type, 'latin1'),
    ...data,
    0,
    0,
    0,
    0,
  ]
}

/** tEXt：默认按 latin1 写（规范），`utf8` 模拟把 UTF-8 直接塞进 tEXt 的工具。 */
export function tEXt(
  keyword: string,
  text: string,
  encoding: 'latin1' | 'utf8' = 'latin1',
): number[] {
  return pngChunk('tEXt', [
    ...bytesOf(keyword, 'latin1'),
    0,
    ...bytesOf(text, encoding),
  ])
}

export function iTXt(
  keyword: string,
  text: string,
  { compressed = false }: { compressed?: boolean } = {},
): number[] {
  const body = Buffer.from(text, 'utf8')
  return pngChunk('iTXt', [
    ...bytesOf(keyword, 'latin1'),
    0,
    compressed ? 1 : 0,
    0,
    0, // 语言
    0, // 译名
    ...(compressed ? deflateSync(body) : body),
  ])
}

export function zTXt(keyword: string, text: string): number[] {
  return pngChunk('zTXt', [
    ...bytesOf(keyword, 'latin1'),
    0,
    0,
    ...deflateSync(Buffer.from(text, 'latin1')),
  ])
}

export function png(...chunks: number[][]): Uint8Array {
  return new Uint8Array([
    ...SIGNATURE,
    ...pngChunk('IHDR', new Uint8Array(13)),
    ...chunks.flat(),
    ...pngChunk('IEND', new Uint8Array(0)),
  ])
}
