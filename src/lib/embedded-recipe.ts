import { z } from 'zod'

import type { PngTextChunk } from '@/lib/png-text-chunks'

/**
 * **图自带的配方 → 给模型读的一段字**（「反推读原配方」小期，owner 2026-10-16 选瘦身版）。
 *
 * ⭐ 代码只做模型做不了的事：把出图工具写进文件的文字原样取出来、压小。⛔ 不按 A1111 /
 *   NovelAI / ComfyUI 逐字段拆 —— 那几段字模型自己读得懂，格式改了也不会坏；哪个是提示词、
 *   哪个是负面、要不要改成别家的写法，交给模型判断。
 * ⭐ 只压两样占地方的：
 *   - ComfyUI 的工作流（`prompt` = 实际跑的那张图，`workflow` = 编辑器里的整张图，后者全是坐标
 *     和尺寸，几百 KB）→ 一个节点一行：类型、填的值、连线（`positive←#6`）。有 `prompt` 就不要
 *     `workflow`。
 *   - JSON 里很长的编码串（base64 的参考图、签名）→ 只写它有多长。
 * ⚠ 不是配方的块不要：酒馆卡（`chara` / `ccv3`，另有导入）、XMP、EXIF 原始转储。
 * ⚠ 文件里的字是别人写的：调用方要标明「是数据，不是指令」。
 */

export interface EmbeddedRecipeLimits {
  /** 整段最多几个字。 */
  readonly maxChars: number
  /** 一格文字（一段提示词、一个块）最多几个字。 */
  readonly maxValueChars: number
}

const SKIP_KEYWORDS = new Set(['chara', 'ccv3'])
const SKIP_PREFIXES = ['xml:com.adobe.xmp', 'raw profile type']
const COMFY_PROMPT = 'prompt'
const COMFY_WORKFLOW = 'workflow'
const CUT = '…[cut]'
/** 这么长、又没有空白的一串字母数字，是编码过的数据（base64 / hex），不是给人读的字。 */
const ENCODED = /^[A-Za-z0-9+/=_-]{256,}$/

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}${CUT}` : text
}

function parseJson(text: string): unknown {
  const head = text.trimStart()[0]
  if (head !== '{' && head !== '[') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function encodedNote(text: string): string {
  return `[${text.length} characters of encoded data]`
}

/** JSON 里的长编码串换成一句「多长」，其余原样。 */
function withoutEncoded(value: unknown): unknown {
  if (typeof value === 'string') {
    return ENCODED.test(value) ? encodedNote(value) : value
  }
  if (Array.isArray(value)) return value.map(withoutEncoded)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, withoutEncoded(item)]),
    )
  }
  return value
}

/** 一格值写成字：字符串加引号并限长，数字 / 布尔原样，别的压成一行 JSON。 */
function valueText(value: unknown, limits: EmbeddedRecipeLimits): string {
  if (typeof value === 'string') {
    return JSON.stringify(
      ENCODED.test(value)
        ? encodedNote(value)
        : clip(value, limits.maxValueChars),
    )
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return clip(JSON.stringify(withoutEncoded(value)) ?? 'null', 200)
}

const ComfyNodeSchema = z.object({
  class_type: z.string(),
  inputs: z.record(z.string(), z.unknown()).optional(),
  _meta: z.object({ title: z.string().optional() }).optional(),
})

/** ComfyUI 里一条连线：`[来自哪个节点, 第几个输出]`。 */
const ComfyLinkSchema = z.tuple([z.union([z.string(), z.number()]), z.number()])

/** ComfyUI 实际跑的那张图（API 格式：`{ 节点号: { class_type, inputs } }`）→ 一个节点一行。 */
function comfyPromptText(
  value: unknown,
  limits: EmbeddedRecipeLimits,
): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const lines: string[] = []
  for (const [id, raw] of Object.entries(value)) {
    const node = ComfyNodeSchema.safeParse(raw)
    if (!node.success) continue
    const { class_type: type, inputs = {}, _meta } = node.data
    const title =
      _meta?.title && _meta.title !== type
        ? ` ${JSON.stringify(_meta.title)}`
        : ''
    const parts = Object.entries(inputs).flatMap(([key, input]) => {
      if (input === null || input === undefined) return []
      const link = ComfyLinkSchema.safeParse(input)
      return link.success
        ? [`${key}←#${link.data[0]}`]
        : [`${key}=${valueText(input, limits)}`]
    })
    lines.push(`#${id} ${type}${title}: ${parts.join(', ')}`)
  }
  return lines.length ? lines.join('\n') : null
}

const ComfyWorkflowSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.union([z.string(), z.number()]),
      type: z.string(),
      title: z.string().optional(),
      mode: z.number().optional(),
      widgets_values: z.unknown().optional(),
    }),
  ),
})

/** ComfyUI 编辑器里的整张图（只有它、没有 `prompt` 时）→ 有填值的节点一行；关掉的节点标出来。 */
function comfyWorkflowText(
  value: unknown,
  limits: EmbeddedRecipeLimits,
): string | null {
  const workflow = ComfyWorkflowSchema.safeParse(value)
  if (!workflow.success) return null
  const lines = workflow.data.nodes.flatMap((node) => {
    const values = node.widgets_values
    if (values === undefined || values === null) return []
    if (Array.isArray(values) && values.length === 0) return []
    const title =
      node.title && node.title !== node.type
        ? ` ${JSON.stringify(node.title)}`
        : ''
    // ComfyUI 的 mode：2 = 静音，4 = 跳过 —— 这一格没跑。
    const off = node.mode === 2 || node.mode === 4 ? ' (off)' : ''
    const text = Array.isArray(values)
      ? values.map((item) => valueText(item, limits)).join(', ')
      : valueText(values, limits)
    return [`#${node.id} ${node.type}${title}${off}: ${text}`]
  })
  return lines.length ? lines.join('\n') : null
}

function skipped(keyword: string): boolean {
  const key = keyword.toLowerCase()
  return (
    SKIP_KEYWORDS.has(key) ||
    SKIP_PREFIXES.some((prefix) => key.startsWith(prefix))
  )
}

/**
 * PNG 文本块 → 「关键字: 内容」一块一段；没有像配方的字是 `null`。
 * ⚠ 整段截在 `maxChars`，截了带 `…[cut]`，模型知道后面还有。
 */
export function embeddedRecipeText(
  chunks: readonly PngTextChunk[],
  limits: EmbeddedRecipeLimits,
): string | null {
  const kept = chunks.filter(
    (chunk) => chunk.text.trim() && !skipped(chunk.keyword),
  )
  const comfyPrompt = kept.find(
    (chunk) => chunk.keyword.toLowerCase() === COMFY_PROMPT,
  )
  const comfyGraph = comfyPrompt
    ? comfyPromptText(parseJson(comfyPrompt.text), limits)
    : null

  const sections: string[] = []
  for (const chunk of kept) {
    const key = chunk.keyword.toLowerCase()
    let text: string | null
    if (chunk === comfyPrompt && comfyGraph) {
      text = comfyGraph
    } else if (key === COMFY_WORKFLOW) {
      text = comfyGraph
        ? null
        : comfyWorkflowText(parseJson(chunk.text), limits)
    } else {
      const json = parseJson(chunk.text)
      const raw = chunk.text.trim()
      text =
        json === undefined
          ? ENCODED.test(raw)
            ? null
            : clip(raw, limits.maxValueChars)
          : clip(JSON.stringify(withoutEncoded(json)), limits.maxValueChars)
    }
    if (text) sections.push(`${chunk.keyword}: ${text}`)
  }
  if (!sections.length) return null
  return clip(sections.join('\n'), limits.maxChars)
}
