import 'server-only'

import { gunzipSync, inflateSync } from 'node:zlib'

import sharp from 'sharp'

/**
 * 读图片文件里自带的配方（反推画风方案 A）：NovelAI 与 A1111 / Forge 出的 PNG 把提示词写在文件里。
 *
 * - PNG 文字块（tEXt / zTXt / iTXt）：NovelAI 写 `Comment`（JSON）+ `Source`（模型名）；
 *   A1111 / Forge 写 `parameters`（提示词、Negative prompt、参数三段）。
 * - NovelAI 还把同一份藏在透明通道的最低位（stealth）：网站去掉文字块、但图还是 PNG 时靠它。
 * ⚠ 截图、转成 JPG 的图两样都没有 —— 读不出就回 null，照旧当没有配方。
 */

export type EmbeddedRecipeSource = 'novelai' | 'a1111'

export interface EmbeddedRecipe {
  readonly source: EmbeddedRecipeSource
  readonly prompt: string
  readonly negative: string
  /** 文件里写的模型名（NovelAI 去掉末尾那串哈希）。 */
  readonly model: string | null
  readonly seed: bigint | null
  readonly steps: number | null
  readonly cfg: number | null
  readonly sampler: string | null
  /** 文件里写的出图尺寸（NovelAI 的 `width` / `height`，A1111 的 `Size`）。 */
  readonly width: number | null
  readonly height: number | null
  /** NovelAI V4+ 的分角色提示词。 */
  readonly characters: readonly EmbeddedCharacter[]
  /** NovelAI V4+ 是否按 `center` 手摆站位（`use_coords`）；否则 AI 自己摆。 */
  readonly manualPositions: boolean
}

export interface EmbeddedCharacter {
  readonly prompt: string
  readonly negative: string
  /** 0–1 的站位中心；没写回 null。 */
  readonly center: { readonly x: number; readonly y: number } | null
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])
const STEALTH_MAGIC_RAW = 'stealth_pnginfo'
const STEALTH_MAGIC_GZIP = 'stealth_pngcomp'
/** 文字块再大也就几十 KB；超过这个当坏文件。 */
const MAX_TEXT_BYTES = 1024 * 1024

function decodeText(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return bytes.toString('latin1')
  }
}

/** PNG 的文字块：关键字 → 文字。不是 PNG 回空。 */
export function readPngTextChunks(buffer: Buffer): Map<string, string> {
  const out = new Map<string, string>()
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE))
    return out
  let offset = 8
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, offset + 8)
    const start = offset + 8
    const end = start + length
    if (end + 4 > buffer.length || type === 'IEND') break
    if (
      length <= MAX_TEXT_BYTES &&
      (type === 'tEXt' || type === 'zTXt' || type === 'iTXt')
    ) {
      const data = buffer.subarray(start, end)
      const nul = data.indexOf(0)
      if (nul > 0) {
        const keyword = data.toString('latin1', 0, nul)
        try {
          if (type === 'tEXt')
            out.set(keyword, decodeText(data.subarray(nul + 1)))
          else if (type === 'zTXt')
            out.set(keyword, decodeText(inflateSync(data.subarray(nul + 2))))
          else {
            const compressed = data[nul + 1] === 1
            const languageEnd = data.indexOf(0, nul + 3)
            const translatedEnd =
              languageEnd < 0 ? -1 : data.indexOf(0, languageEnd + 1)
            if (translatedEnd >= 0) {
              const text = data.subarray(translatedEnd + 1)
              out.set(
                keyword,
                decodeText(compressed ? inflateSync(text) : text),
              )
            }
          }
        } catch {
          // 一块坏了不影响别的块。
        }
      }
    }
    offset = end + 4
  }
  return out
}

/** NovelAI 藏在透明通道最低位的那一份（按列读，先 15 字节魔数、再 32 位长度、再数据）。 */
async function readStealthText(buffer: Buffer): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const image = sharp(buffer)
  const meta = await image.metadata()
  if (!meta.hasAlpha) return out
  const { data, info } = await image
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const total = width * height
  let index = 0
  const readBits = (count: number): number[] | null => {
    if (index + count > total) return null
    const bits: number[] = []
    for (let i = 0; i < count; i += 1, index += 1) {
      const x = Math.floor(index / height)
      const y = index % height
      bits.push(data[y * width + x]! & 1)
    }
    return bits
  }
  const toBytes = (bits: number[]) => {
    const bytes = Buffer.alloc(bits.length >> 3)
    for (let i = 0; i < bytes.length; i += 1) {
      let value = 0
      for (let bit = 0; bit < 8; bit += 1)
        value = (value << 1) | bits[i * 8 + bit]!
      bytes[i] = value
    }
    return bytes
  }
  const magicBits = readBits(STEALTH_MAGIC_RAW.length * 8)
  if (!magicBits) return out
  const magic = toBytes(magicBits).toString('latin1')
  if (magic !== STEALTH_MAGIC_RAW && magic !== STEALTH_MAGIC_GZIP) return out
  const lengthBits = readBits(32)
  if (!lengthBits) return out
  const bitLength = lengthBits.reduce((value, bit) => value * 2 + bit, 0)
  if (bitLength <= 0 || bitLength > MAX_TEXT_BYTES * 8) return out
  const payloadBits = readBits(bitLength)
  if (!payloadBits) return out
  const payload = toBytes(payloadBits)
  const text = decodeText(
    magic === STEALTH_MAGIC_GZIP ? gunzipSync(payload) : payload,
  )
  const parsed: unknown = JSON.parse(text)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
    for (const [key, value] of Object.entries(parsed))
      out.set(key, typeof value === 'string' ? value : JSON.stringify(value))
  return out
}

function numberOf(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value) : value
  return typeof number === 'number' && Number.isFinite(number) ? number : null
}

/** 列是 Postgres bigint（有符号 64 位）：装不下的当没有。 */
const MAX_SEED = BigInt('9223372036854775807')

function seedOf(value: unknown): bigint | null {
  const text = typeof value === 'number' ? String(Math.trunc(value)) : value
  if (typeof text !== 'string' || !/^\d{1,19}$/.test(text.trim())) return null
  const seed = BigInt(text.trim())
  return seed <= MAX_SEED ? seed : null
}

interface V4Caption {
  char_caption?: unknown
  centers?: unknown
}

interface V4Prompt {
  caption?: { base_caption?: unknown; char_captions?: unknown }
  use_coords?: unknown
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function captionsOf(prompt: V4Prompt | undefined): V4Caption[] {
  const list = prompt?.caption?.char_captions
  return Array.isArray(list)
    ? list.filter(
        (item): item is V4Caption => !!item && typeof item === 'object',
      )
    : []
}

function centerOf(value: unknown): EmbeddedCharacter['center'] {
  const first: unknown = Array.isArray(value) ? value[0] : undefined
  if (!first || typeof first !== 'object') return null
  const { x, y } = first as { x?: unknown; y?: unknown }
  const inRange = (n: unknown): n is number =>
    typeof n === 'number' && n >= 0 && n <= 1
  return inRange(x) && inRange(y) ? { x, y } : null
}

function parseNovelAi(chunks: Map<string, string>): EmbeddedRecipe | null {
  const comment = chunks.get('Comment')
  if (!comment) return null
  let data: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(comment)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return null
    data = parsed as Record<string, unknown>
  } catch {
    return null
  }
  const v4 = data.v4_prompt as V4Prompt | undefined
  const v4Negative = data.v4_negative_prompt as V4Prompt | undefined
  const prompt =
    typeof data.prompt === 'string'
      ? data.prompt
      : typeof v4?.caption?.base_caption === 'string'
        ? v4.caption.base_caption
        : (chunks.get('Description') ?? '')
  if (!prompt.trim()) return null
  const negativeCaptions = captionsOf(v4Negative)
  const characters = captionsOf(v4).flatMap((item, index) => {
    const text = stringOf(item.char_caption)
    if (!text) return []
    return [
      {
        prompt: text,
        negative: stringOf(negativeCaptions[index]?.char_caption),
        center: centerOf(item.centers),
      },
    ]
  })
  const negative =
    typeof data.uc === 'string'
      ? data.uc
      : stringOf(v4Negative?.caption?.base_caption)
  const source = chunks.get('Source')?.trim()
  return {
    source: 'novelai',
    prompt: prompt.trim(),
    negative: negative.trim(),
    model: source ? source.replace(/\s+[0-9A-F]{8}$/i, '') : null,
    seed: seedOf(data.seed),
    steps: numberOf(data.steps),
    cfg: numberOf(data.scale),
    sampler: typeof data.sampler === 'string' ? data.sampler : null,
    width: numberOf(data.width),
    height: numberOf(data.height),
    characters,
    manualPositions: v4?.use_coords === true,
  }
}

const A1111_PARAM =
  /\s*([A-Za-z][\w ./-]*?):\s*("(?:\\.|[^"\\])*"|[^,]*)(?:,|$)/g

function parseA1111(text: string): EmbeddedRecipe | null {
  const lines = text.trim().split('\n')
  const paramsIndex = lines.findLastIndex((line) =>
    /^\s*Steps:\s*\d/.test(line),
  )
  const body = paramsIndex >= 0 ? lines.slice(0, paramsIndex) : lines
  const negativeIndex = body.findIndex((line) =>
    line.startsWith('Negative prompt:'),
  )
  const prompt = (negativeIndex >= 0 ? body.slice(0, negativeIndex) : body)
    .join('\n')
    .trim()
  if (!prompt) return null
  const negative =
    negativeIndex >= 0
      ? body
          .slice(negativeIndex)
          .join('\n')
          .replace(/^Negative prompt:\s*/, '')
          .trim()
      : ''
  const params = new Map<string, string>()
  if (paramsIndex >= 0)
    for (const match of lines[paramsIndex]!.matchAll(A1111_PARAM))
      params.set(match[1]!.trim(), match[2]!.trim().replace(/^"|"$/g, ''))
  const size = /^(\d+)x(\d+)$/.exec(params.get('Size') ?? '')
  return {
    source: 'a1111',
    prompt,
    negative,
    model: params.get('Model') ?? null,
    seed: seedOf(params.get('Seed')),
    steps: numberOf(params.get('Steps')),
    cfg: numberOf(params.get('CFG scale')),
    sampler: params.get('Sampler') ?? null,
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
    characters: [],
    manualPositions: false,
  }
}

function fromChunks(chunks: Map<string, string>): EmbeddedRecipe | null {
  const parameters = chunks.get('parameters')
  return parseNovelAi(chunks) ?? (parameters ? parseA1111(parameters) : null)
}

/** 读一张图自带的配方；没有 / 读不出回 null（⛔ 不抛：上传不能因为它失败）。 */
export async function readEmbeddedRecipe(
  buffer: Buffer,
): Promise<EmbeddedRecipe | null> {
  try {
    const chunks = readPngTextChunks(buffer)
    const fromText = fromChunks(chunks)
    if (fromText) return fromText
    if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null
    return fromChunks(await readStealthText(buffer))
  } catch {
    return null
  }
}

/**
 * 读出的配方写进上传那一行：提示词 / 负面 / seed 进各自的列，参数进 `snapshot.advancedParams`
 * （素材查看器「复制配方」与助手 look 都从这几处读），来源与模型名记在 `snapshot.embeddedRecipe`。
 * ⚠ `model` 列照旧是 `user-upload`（素材库按它分「本地素材」那一栏）。
 */
export function embeddedRecipeFields(recipe: EmbeddedRecipe) {
  const advancedParams: Record<string, number | string> = {}
  if (recipe.steps !== null) advancedParams.steps = recipe.steps
  if (recipe.cfg !== null) advancedParams.guidanceScale = recipe.cfg
  if (recipe.sampler) advancedParams.runnerSampler = recipe.sampler
  return {
    prompt: recipe.prompt,
    ...(recipe.negative ? { negativePrompt: recipe.negative } : {}),
    ...(recipe.seed !== null ? { seed: recipe.seed } : {}),
    snapshot: {
      advancedParams,
      embeddedRecipe: {
        source: recipe.source,
        model: recipe.model,
        characters: recipe.characters.map((character) => character.prompt),
      },
    },
  }
}
