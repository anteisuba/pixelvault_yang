import 'server-only'

import type { ToolResultPart, UserContent } from 'ai'

import {
  ASSISTANT_OPERATOR_CANVAS_LIMITS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS as STATUS,
  ASSISTANT_OPERATOR_TOOL_IDS as TOOL,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS,
} from '@/constants/assistant-v3'
import { ASSISTANT_IMAGE_LIMITS } from '@/constants/assistant'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { logger } from '@/lib/logger'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import {
  AssistantV3PictureRefSchema,
  type AssistantV3PictureRef,
  type AssistantV3Transcript,
} from '@/types/assistant-v3'
import {
  recordLedgerStep,
  toStepEvent,
} from '@/services/kernel/assistant-operator.service'
import {
  joinPhrases,
  nextStep,
  TITLE_TEXT,
  type V3Context,
  type V3Outcome,
} from '@/services/kernel/assistant-v3-steps.service'
import { detectTrustedImageMime, fetchAsBuffer } from '@/services/storage/r2'

/**
 * v3 的 `look`：**Denia 自己看**（owner 2026-10-15「不要求很严的表，让模型自己去看去判断」）。
 *
 * ⭐ 一种看法、五张脸共用：要看的图连同问题交到**主模型**眼前，放在紧跟着的那一步里，
 *   由它带着整段对话自己判断 —— 认人、改名、对比、对照参考查成图、照参考写提示词都是这一条。
 *   ⛔ 不另起看图子调用，⛔ 不填结构化的表（旧的「参考图分析」一张不合格整步失败，DeepSeek
 *   只有 `json_object`，最容易填错）。怎么看写在系统提示的 LOOKING AT PICTURES 一段里。
 * ⭐ 代码里只管硬规矩：一次最多 `maxLookCards` 张（多了明说只看了前几张）；一张下不来只点名
 *   那一张，其余照看，⛔ 不连坐整步；所选模型看不了图就只回一句话，⛔ 不借别家的 key。
 * ⚠ 图只附给**紧跟着的那一次**模型调用：本轮记录（要发给前端接力）只存地址与称呼，字节在
 *   服务端现下（`fetchAsBuffer`，防 SSRF）；再往后的步骤里只剩工具结果那行字。
 */

/** 一张图最大多少字节（与板子上附的图同一个数），再按所选那家的单图上限收紧。 */
const MAX_PICTURE_BYTES = 20_000_000

/**
 * 五家都收的三种。⚠ GIF 不收：Gemini 只认 PNG / JPEG / WEBP / HEIC，附一张 GIF 整步 400。
 * ⛔ SVG 不收（能带脚本）。格式按文件头判（`detectTrustedImageMime`），⛔ 不信 content-type。
 */
const PICTURE_FORMATS: ReadonlySet<string> = new Set(['jpeg', 'png', 'webp'])

export interface V3Picture {
  readonly data: Buffer
  readonly mediaType: string
  readonly width: number
  readonly height: number
}

/** 这次请求里下过的图：同一个地址只下一次，下不来记 `null`。 */
export interface V3PictureCache {
  /** 一张图最多多少字节（这一轮所选那家的单图上限）。 */
  readonly maxBytes: number
  readonly loads: Map<string, Promise<V3Picture | null>>
}

/**
 * ⚠ 超过所选那家单图上限的图在这里就算下不来（只点名那一张），⛔ 别让它进请求把整步
 *   打成 400 —— Claude 是 base64 后 10 MB（原图约 7.5 MB），见 `ASSISTANT_IMAGE_LIMITS`。
 */
export function createPictureCache(
  adapterType: AI_ADAPTER_TYPES,
): V3PictureCache {
  const limits: Partial<
    Record<
      AI_ADAPTER_TYPES,
      { maxImageBytes: number | null; maxBase64ImageBytes: number | null }
    >
  > = ASSISTANT_IMAGE_LIMITS
  const limit = limits[adapterType]
  return {
    maxBytes: Math.min(
      MAX_PICTURE_BYTES,
      limit?.maxImageBytes ?? MAX_PICTURE_BYTES,
      limit?.maxBase64ImageBytes
        ? Math.floor((limit.maxBase64ImageBytes * 3) / 4)
        : MAX_PICTURE_BYTES,
    ),
    loads: new Map(),
  }
}

export function loadPicture(
  cache: V3PictureCache,
  url: string,
  signal?: AbortSignal,
): Promise<V3Picture | null> {
  const cached = cache.loads.get(url)
  if (cached) return cached
  const loading = (async (): Promise<V3Picture | null> => {
    try {
      const { buffer } = await fetchAsBuffer(url, {
        maxBytes: cache.maxBytes,
        signal,
      })
      const { mimeType, width, height } = await detectTrustedImageMime(
        buffer,
        PICTURE_FORMATS,
      )
      return { data: buffer, mediaType: mimeType, width, height }
    } catch (error) {
      signal?.throwIfAborted()
      logger.warn('assistant v3 picture not loaded', {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  })()
  cache.loads.set(url, loading)
  return loading
}

/** 所选模型看不了图（如 DeepSeek V4 Pro）：只回这一句，⛔ 不借别家的 key。 */
export function cannotSeeOutcome(): V3Outcome {
  return {
    kind: 'result',
    output:
      'Nothing was looked at: the assistant model the creator picked cannot see pictures, and no other provider is used in its place. Tell the creator so in one short sentence and suggest switching the assistant to a model that can see images (the model chip by the input box). Do not describe or guess what the pictures show.',
    error: true,
    failureKey: 'look:noVision',
  }
}

/** 要看的一张图：`label` 是给模型的称呼，`title` 是过程行上的（缺席 = 同 `label`）。 */
export interface V3LookTarget extends AssistantV3PictureRef {
  readonly title?: string
}

export interface V3LookRequest {
  /** 要看的图，按问的顺序；同一个地址只算一张。 */
  readonly targets: readonly V3LookTarget[]
  /** 给模型的附言，一样一句：对不上任何一张图的那几样、这张脸上怎么看。 */
  readonly notes: readonly string[]
  readonly question: string
  /** 过程行的载荷：画布上看的是哪几张卡。 */
  readonly nodeIds?: readonly string[]
}

function quoted(labels: readonly string[]): string {
  return labels.map((label) => `「${label}」`).join(', ')
}

function sizeOf(picture: V3Picture): string {
  return picture.width && picture.height
    ? ` (${picture.width}×${picture.height})`
    : ''
}

/**
 * 看图：下好图，写一行工具结果，图本身进本轮记录的 `images`（只记地址与称呼）。
 * ⚠ 已经附在这一轮那句话里的图（IMAGES THE CREATOR POINTED AT）⛔ 不再附第二遍，只指给它看。
 */
export async function* executeV3Look(
  context: V3Context,
  request: V3LookRequest,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  if (!context.seesImages) return cannotSeeOutcome()
  const unique = request.targets.filter(
    (target, index) =>
      request.targets.findIndex((other) => other.url === target.url) === index,
  )
  const cap = ASSISTANT_V3_LIMITS.maxLookCards
  const looked = unique.slice(0, cap)
  const skipped = unique.slice(cap)
  if (looked.length === 0)
    return {
      kind: 'result',
      output:
        request.notes.join('\n') ||
        'look needs the pictures to look at: name them.',
      error: true,
      failureKey: 'look:none',
    }

  const board = context.transcript[0]
  const boardImages =
    board?.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.board ? board.images : []
  const signal = context.prepared.run.signal
  const loaded = await Promise.all(
    looked.map(async (target) => {
      const ref = {
        url: target.url,
        label: target.label.slice(0, ASSISTANT_V3_LIMITS.maxNameChars * 2),
      }
      return {
        target,
        ref,
        onBoard: boardImages.findIndex((image) => image.url === target.url),
        // ⚠ 进不了本轮记录的地址（太长）当作下不来：接力时那一跳会整份记录不过校验。
        picture: AssistantV3PictureRefSchema.safeParse(ref).success
          ? await loadPicture(context.pictures, target.url, signal)
          : null,
      }
    }),
  )
  const shown = loaded.filter((item) => item.picture && item.onBoard >= 0)
  const attached = loaded.filter((item) => item.picture && item.onBoard < 0)
  const failed = loaded.filter((item) => !item.picture)
  const seen = [...shown, ...attached]

  const question = request.question
    .trim()
    .slice(0, ASSISTANT_V3_LIMITS.maxQuestionChars)
  const lines = [
    `You are looking at these pictures for: ${question ? `"${question}"` : 'the creator’s request'}`,
  ]
  if (attached.length)
    lines.push(
      `They come with this result, for your next step only, in this order: ${attached
        .map(
          (item, index) =>
            `${index + 1} = 「${item.target.label}」${sizeOf(item.picture!)}`,
        )
        .join(
          ' · ',
        )}. After that step only this line stays — look again if you need to see them again.`,
    )
  if (shown.length)
    lines.push(
      `Already in front of you in the creator's message: ${shown
        .map(
          (item) =>
            `「${item.target.label}」 (picture ${item.onBoard + 1} of IMAGES THE CREATOR POINTED AT)`,
        )
        .join(', ')}.`,
    )
  if (failed.length)
    lines.push(
      `Could not load ${quoted(failed.map((item) => item.target.label))}: it did not download, is too large, or is not a PNG, JPEG or WEBP picture. Say so if it matters.`,
    )
  if (skipped.length)
    lines.push(
      `Only the first ${cap} pictures were looked at; ${quoted(skipped.map((target) => target.label))} were not. Tell the creator if that matters.`,
    )
  lines.push(...request.notes)
  if (seen.length)
    lines.push('Judge them yourself and answer from what you see.')

  const text = TITLE_TEXT[context.language]
  const step = nextStep(
    context,
    TOOL.readState,
    joinPhrases(
      context,
      looked.map((target) => `${text.look}「${target.title ?? target.label}」`),
    ),
  )
  const names = seen.map((item) => item.target.label)
  const shownNames = seen.map((item) => item.target.title ?? item.target.label)
  if (seen.length === 0) {
    yield toStepEvent({
      ...step,
      status: STATUS.error,
      error: {
        reason: REJECT.referenceImageUnavailable,
        detail: quoted(
          failed.map((item) => item.target.title ?? item.target.label),
        ).slice(0, ASSISTANT_OPERATOR_LIMITS.maxReasonChars),
      },
    })
  } else {
    yield toStepEvent({
      ...step,
      status: STATUS.done,
      payload: request.nodeIds?.length
        ? {
            nodeIds: [...new Set(request.nodeIds)].slice(
              0,
              ASSISTANT_OPERATOR_CANVAS_LIMITS.maxReadNodeIds,
            ),
          }
        : {},
      // ⚠ 只写看了哪几张，⛔ 不写看到了什么（owner 10-15「安静点，只在回答里体现」）。
      result: {
        digest: shownNames
          .join(' · ')
          .slice(0, ASSISTANT_OPERATOR_LIMITS.maxMessageChars),
      },
    })
    recordLedgerStep(
      context.prepared.run,
      step.verb,
      step.title,
      `looked at ${quoted(names)}${question ? ` for: ${question}` : ''}`,
    )
  }
  return {
    kind: 'result',
    output: lines.join('\n'),
    error: seen.length === 0,
    ...(seen.length === 0 ? { failureKey: 'look:unloaded' } : {}),
    ...(attached.length ? { images: attached.map((item) => item.ref) } : {}),
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * 图怎么进消息
 * ───────────────────────────────────────────────────────────────────────── */

/** 紧跟着那一次调用要附的一次 look：一行抬头 + 下得来的图。 */
export interface V3FreshLook {
  readonly header: string
  readonly pictures: readonly V3Picture[]
}

/**
 * 这一次调用要附的图：本轮记录里**最后一条 assistant 之后**那几条 look 结果。
 *
 * ⭐ 按位置认、不记状态：模型下一次开口就会追加一条新的 assistant，于是上一次 look 的图
 *   自然不再附 —— 空回复重问、超时重问（都不追加）照旧带着；画布接力、过了时间预算换一次
 *   请求接着跑，模型还没看过的图照样附上（换一次请求就重下一次，⛔ 不存字节）。
 */
export async function loadFreshLooks(
  transcript: AssistantV3Transcript,
  cache: V3PictureCache,
  signal?: AbortSignal,
): Promise<Map<string, V3FreshLook>> {
  const looks = new Map<string, V3FreshLook>()
  const last = transcript.findLastIndex(
    (entry) => entry.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.assistant,
  )
  if (last < 0) return looks
  for (const entry of transcript.slice(last + 1)) {
    if (
      entry.type !== ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result ||
      !entry.images?.length
    )
      continue
    const images = entry.images
    const pictures = await Promise.all(
      images.map((image) => loadPicture(cache, image.url, signal)),
    )
    const ok = images.flatMap((image, index) =>
      pictures[index] ? [{ image, picture: pictures[index]! }] : [],
    )
    const lost = images.filter((_, index) => !pictures[index])
    looks.set(entry.id, {
      header: `PICTURES FROM YOUR look (in order): ${
        ok
          .map(({ image }, index) => `${index + 1} = 「${image.label}」`)
          .join(' · ') || 'none'
      }${lost.length ? ` — ${quoted(lost.map((image) => image.label))} could not be loaded this time` : ''}`,
      pictures: ok.map(({ picture }) => picture),
    })
  }
  return looks
}

/**
 * 图放在哪（2026-10-15 对照装着的 AI SDK 核过：ai 6.0.290 · @ai-sdk/openai 3.0.118 ·
 * @ai-sdk/anthropic 3.0.122 · @ai-sdk/google 3.0.127）。
 *
 * - **OpenAI 协议的对话接口**（DeepSeek、Grok、OpenAI 代理端点）：tool 消息只收文字 ——
 *   带图的工具结果会被 SDK `JSON.stringify` 成一大段 base64 文字。所以工具结果只写字，图跟在
 *   紧接着的一条 user 消息里（tool 之后接 user 是合法的顺序）。OpenAI 官方端点（Responses）
 *   同一条：`function_call_output` 之后接 user 的 `input_image`。
 * - **Claude**：SDK 把相邻的 tool 与 user 并成同一条 user（`groupIntoBlocks`），tool_result
 *   在前、图在后 —— 正是 Anthropic 要的形状，与上一条同一种写法。
 * - **Gemini**：tool 消息本身就是一条 user 角色的 content（functionResponse），再接一条 user
 *   就是两条相邻的 user content —— 接口收不收没核实到官方原文。Gemini 3 的 functionResponse
 *   自带 `parts` 能放图（SDK 对 Gemini 3 打开 `supportsFunctionResponseParts`，助手路由上的
 *   Gemini 都是 3.x），所以只有这一家把图放进工具结果。
 *
 * ⚠ 缓存：前四家的图在消息最末尾，下一步拿掉它前缀一字不变；Gemini 那一条结果下一步变短，
 *   从它起重算。
 */
export function picturesRideInToolResult(
  adapterType: AI_ADAPTER_TYPES,
): boolean {
  return adapterType === AI_ADAPTER_TYPES.GEMINI
}

/** 图跟在工具结果后面的那条 user 消息（OpenAI 协议 / Claude）。 */
export function lookUserParts(look: V3FreshLook): Exclude<UserContent, string> {
  return [
    { type: 'text', text: look.header },
    ...look.pictures.map((picture) => ({
      type: 'image' as const,
      image: picture.data,
      mediaType: picture.mediaType,
    })),
  ]
}

/** 图放进工具结果本身（Gemini 3 的 functionResponse parts）。 */
export function lookToolOutput(
  output: string,
  look: V3FreshLook,
): ToolResultPart['output'] {
  return {
    type: 'content',
    value: [
      { type: 'text', text: `${output}\n${look.header}` },
      ...look.pictures.map((picture) => ({
        type: 'image-data' as const,
        data: picture.data.toString('base64'),
        mediaType: picture.mediaType,
      })),
    ],
  }
}
