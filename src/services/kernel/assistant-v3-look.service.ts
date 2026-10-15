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
  ASSISTANT_V3_CLIP_LIMITS,
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_PICTURE_FORMATS,
  ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS,
} from '@/constants/assistant-v3'
import {
  ASSISTANT_IMAGE_LIMITS,
  ASSISTANT_VIDEO_TIERS,
} from '@/constants/assistant'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { logger } from '@/lib/logger'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'
import {
  AssistantV3ClipRefSchema,
  AssistantV3PictureRefSchema,
  type AssistantV3ClipRef,
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
import {
  loadClip,
  type V3Clip,
  type V3ClipCache,
} from '@/services/kernel/assistant-v3-watch.service'
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
        // 格式按文件头判，⛔ 不信 content-type（为什么只收这三种见常量头注）。
        ASSISTANT_V3_PICTURE_FORMATS,
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

/** 所选模型看不了图（如 DeepSeek V4 Pro）：只回这一句，⛔ 不借别家的 key。片子同样。 */
export function cannotSeeOutcome(): V3Outcome {
  return {
    kind: 'result',
    output:
      'Nothing was looked at: the assistant model the creator picked cannot see pictures, and no other provider is used in its place. Clips are watched as pictures too, so no clip either. Tell the creator so in one short sentence and suggest switching the assistant to a model that can see images (the model chip by the input box). Do not describe or guess what the pictures or clips show.',
    error: true,
    failureKey: 'look:noVision',
  }
}

/** 要看的一张图：`label` 是给模型的称呼，`title` 是过程行上的（缺席 = 同 `label`）。 */
export interface V3LookTarget extends AssistantV3PictureRef {
  readonly title?: string
}

/** 要看的一段片子：称呼规矩同图；`nodeId` = 画布上哪张视频卡（认「已经在你眼前」）。 */
export interface V3LookClipTarget extends AssistantV3ClipRef {
  readonly title?: string
}

export interface V3LookRequest {
  /** 要看的图，按问的顺序；同一个地址只算一张。 */
  readonly targets: readonly V3LookTarget[]
  /** 要看的片子（看图期第二段），按问的顺序；同一个地址只算一段。 */
  readonly clips?: readonly V3LookClipTarget[]
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

function uniqueByUrl<T extends { url: string }>(items: readonly T[]): T[] {
  return items.filter(
    (item, index) =>
      items.findIndex((other) => other.url === item.url) === index,
  )
}

/** 板子上那几段被指着的片子（CLIPS THE CREATOR POINTED AT）。 */
function boardClipsOf(context: V3Context): readonly AssistantV3ClipRef[] {
  const board = context.transcript[0]
  return board?.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.board
    ? (board.clips ?? [])
    : []
}

/**
 * 一段片子在这次 look 里怎么办（看图期第二段）：
 * - 创作者指着的（板子上的）→ 已经在眼前，只指给它看，⛔ 不再附第二遍；
 * - 没被指着的 → 只有 `native` 档（Gemini）能看：下得来、不超内联上限就交片子本体，只附给
 *   紧跟着的那一次；太大 / 下不来就如实说，让创作者 @ 它（@ 了浏览器会抽帧）；
 * - 别家没被指着的 → 没有帧可看，只回一句「请创作者 @ 这段片子」，⛔ 不按提示词或名字去猜。
 */
async function lookAtClips(
  context: V3Context,
  clips: readonly V3LookClipTarget[],
): Promise<{
  shown: { target: V3LookClipTarget; position: number }[]
  attached: V3LookClipTarget[]
  lines: string[]
}> {
  const boardClips = boardClipsOf(context)
  const shown: { target: V3LookClipTarget; position: number }[] = []
  const attached: V3LookClipTarget[] = []
  const tooLarge: string[] = []
  const unloadable: string[] = []
  const unseen: string[] = []
  for (const target of uniqueByUrl(clips)) {
    const position = boardClips.findIndex(
      (clip) =>
        clip.url === target.url ||
        (target.nodeId !== undefined && clip.nodeId === target.nodeId),
    )
    if (position >= 0) {
      shown.push({ target, position })
      continue
    }
    if (context.clipTier !== ASSISTANT_VIDEO_TIERS.native) {
      unseen.push(target.label)
      continue
    }
    if (attached.length >= ASSISTANT_V3_CLIP_LIMITS.maxClips) {
      unseen.push(target.label)
      continue
    }
    const ref = {
      url: target.url,
      label: target.label.slice(0, ASSISTANT_V3_LIMITS.maxNameChars * 2),
    }
    const load = AssistantV3ClipRefSchema.safeParse(ref).success
      ? await loadClip(context.clips, target.url, context.prepared.run.signal)
      : ({ ok: false, reason: 'unloadable' } as const)
    if (load.ok) attached.push({ ...target, ...ref })
    else if (load.reason === 'tooLarge') tooLarge.push(target.label)
    else unloadable.push(target.label)
  }
  const lines: string[] = []
  if (attached.length)
    lines.push(
      `The clip itself comes with this result, for your next step only: ${quoted(
        attached.map((target) => target.label),
      )}. After that step only this line stays — look again if you need to watch it again.`,
    )
  if (shown.length)
    lines.push(
      `Already in front of you in the creator's message: ${shown
        .map(
          ({ target, position }) =>
            `「${target.label}」 (clip ${position + 1} of CLIPS THE CREATOR POINTED AT)`,
        )
        .join(', ')}.`,
    )
  if (tooLarge.length)
    lines.push(
      `${quoted(tooLarge)} is too large to watch directly (over ${Math.round(ASSISTANT_V3_CLIP_LIMITS.inlineMaxBytes / 1024 / 1024)} MB). Ask the creator to @ the clip in their message so frames from it are put in front of you. Do not guess what it shows.`,
    )
  if (unloadable.length)
    lines.push(
      `Could not load the clip ${quoted(unloadable)}. Ask the creator to @ the clip in their message so frames from it are put in front of you. Do not guess what it shows.`,
    )
  if (unseen.length)
    lines.push(
      `${quoted(unseen)} is a clip you were not shown: you only watch clips the creator points at. Ask them to @ the clip in their message. Do not describe it from its prompt or its name.`,
    )
  return { shown, attached, lines }
}

/**
 * 看图：下好图，写一行工具结果，图本身进本轮记录的 `images`（只记地址与称呼）。
 * ⚠ 已经附在这一轮那句话里的图（IMAGES THE CREATOR POINTED AT）⛔ 不再附第二遍，只指给它看。
 * 片子同一套（`lookAtClips`）：附上的片子进本轮记录的 `clips`。
 */
export async function* executeV3Look(
  context: V3Context,
  request: V3LookRequest,
): AsyncGenerator<AssistantOperatorEvent, V3Outcome> {
  if (!context.seesImages) return cannotSeeOutcome()
  const unique = uniqueByUrl(request.targets)
  const cap = ASSISTANT_V3_LIMITS.maxLookCards
  const looked = unique.slice(0, cap)
  const skipped = unique.slice(cap)
  const clipTargets = request.clips ?? []
  if (looked.length === 0 && clipTargets.length === 0)
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
  const clips = await lookAtClips(context, clipTargets)
  const seenClips = [
    ...clips.shown.map(({ target }) => target),
    ...clips.attached,
  ]

  const question = request.question
    .trim()
    .slice(0, ASSISTANT_V3_LIMITS.maxQuestionChars)
  const lines = [
    `You are looking at these ${seen.length || !seenClips.length ? 'pictures' : 'clips'} for: ${question ? `"${question}"` : 'the creator’s request'}`,
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
  lines.push(...clips.lines)
  if (failed.length)
    lines.push(
      `Could not load ${quoted(failed.map((item) => item.target.label))}: it did not download, is too large, or is not a PNG, JPEG or WEBP picture. Say so if it matters.`,
    )
  if (skipped.length)
    lines.push(
      `Only the first ${cap} pictures were looked at; ${quoted(skipped.map((target) => target.label))} were not. Tell the creator if that matters.`,
    )
  lines.push(...request.notes)
  if (seen.length || seenClips.length)
    lines.push('Judge them yourself and answer from what you see.')

  /**
   * ⭐ 一段片子都没看成、也没有图下不来 —— 只是「请创作者 @ 它」：这是一句平常的结果，
   *   ⛔ 不记失败（不算撞墙），也不出过程行（什么都没看，安静点）。
   */
  if (
    seen.length === 0 &&
    seenClips.length === 0 &&
    failed.length === 0 &&
    clips.lines.length > 0
  )
    return { kind: 'result', output: lines.join('\n'), error: false }

  const text = TITLE_TEXT[context.language]
  const step = nextStep(
    context,
    TOOL.readState,
    joinPhrases(context, [
      ...looked.map(
        (target) => `${text.look}「${target.title ?? target.label}」`,
      ),
      ...uniqueByUrl(clipTargets).map(
        (target) => `${text.look}「${target.title ?? target.label}」`,
      ),
    ]),
  )
  const names = [
    ...seen.map((item) => item.target.label),
    ...seenClips.map((target) => target.label),
  ]
  const shownNames = [
    ...seen.map((item) => item.target.title ?? item.target.label),
    ...seenClips.map((target) => target.title ?? target.label),
  ]
  if (names.length === 0) {
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
    error: names.length === 0,
    ...(names.length === 0 ? { failureKey: 'look:unloaded' } : {}),
    ...(attached.length ? { images: attached.map((item) => item.ref) } : {}),
    ...(clips.attached.length
      ? {
          clips: clips.attached.map((target) => ({
            url: target.url,
            label: target.label,
          })),
        }
      : {}),
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * 图怎么进消息
 * ───────────────────────────────────────────────────────────────────────── */

/** 紧跟着那一次调用要附的一次 look：一行抬头 + 下得来的图，以及片子本体（只有 Gemini）。 */
export interface V3FreshLook {
  /** 图那一行抬头；这次 look 没附图时是空串。 */
  readonly header: string
  readonly pictures: readonly V3Picture[]
  readonly clips: readonly { readonly label: string; readonly clip: V3Clip }[]
}

/**
 * 这一次调用要附的图：本轮记录里**最后一条 assistant 之后**那几条 look 结果。
 *
 * ⭐ 按位置认、不记状态：模型下一次开口就会追加一条新的 assistant，于是上一次 look 的图
 *   自然不再附 —— 空回复重问、超时重问（都不追加）照旧带着；画布接力、过了时间预算换一次
 *   请求接着跑，模型还没看过的图照样附上（换一次请求就重下一次，⛔ 不存字节）。片子同一条。
 */
export async function loadFreshLooks(
  transcript: AssistantV3Transcript,
  pictureCache: V3PictureCache,
  clipCache: V3ClipCache,
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
      (!entry.images?.length && !entry.clips?.length)
    )
      continue
    const images = entry.images ?? []
    const pictures = await Promise.all(
      images.map((image) => loadPicture(pictureCache, image.url, signal)),
    )
    const ok = images.flatMap((image, index) =>
      pictures[index] ? [{ image, picture: pictures[index]! }] : [],
    )
    const lost = images.filter((_, index) => !pictures[index])
    const clipRefs = entry.clips ?? []
    const clipLoads = await Promise.all(
      clipRefs.map((ref) => loadClip(clipCache, ref.url, signal)),
    )
    looks.set(entry.id, {
      header: images.length
        ? `PICTURES FROM YOUR look (in order): ${
            ok
              .map(({ image }, index) => `${index + 1} = 「${image.label}」`)
              .join(' · ') || 'none'
          }${lost.length ? ` — ${quoted(lost.map((image) => image.label))} could not be loaded this time` : ''}`
        : '',
      pictures: ok.map(({ picture }) => picture),
      clips: clipRefs.flatMap((ref, index) => {
        const load = clipLoads[index]!
        return load.ok ? [{ label: ref.label, clip: load.clip }] : []
      }),
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
 * ⚠ 片子本体（只有 Gemini 会有）**不进** functionResponse：官方那张「工具结果里能放什么」的
 *   表只列了图与文档，没有视频。所以它跟在这一批工具结果后面那条 user 里（`lookClipParts`）——
 *   这正是上面「两条相邻的 user content」那一种，⚠ 同样没核实到官方原文，未做真机实测。
 *
 * ⚠ 缓存：前四家的图在消息最末尾，下一步拿掉它前缀一字不变；Gemini 那一条结果下一步变短，
 *   从它起重算。
 */
export function picturesRideInToolResult(
  adapterType: AI_ADAPTER_TYPES,
): boolean {
  return adapterType === AI_ADAPTER_TYPES.GEMINI
}

/** look 附上的片子本体：一行称呼 + 片子（跟在工具结果后面那条 user 里）。 */
export function lookClipParts(look: V3FreshLook): Exclude<UserContent, string> {
  return look.clips.flatMap(({ label, clip }) => [
    {
      type: 'text' as const,
      text: `CLIP FROM YOUR look: 「${label}」 (the clip itself)`,
    },
    { type: 'file' as const, data: clip.data, mediaType: clip.mediaType },
  ])
}

/** 图跟在工具结果后面的那条 user 消息（OpenAI 协议 / Claude）。 */
export function lookUserParts(look: V3FreshLook): Exclude<UserContent, string> {
  return [
    ...(look.header ? [{ type: 'text' as const, text: look.header }] : []),
    ...look.pictures.map((picture) => ({
      type: 'image' as const,
      image: picture.data,
      mediaType: picture.mediaType,
    })),
    ...lookClipParts(look),
  ]
}

/** 图放进工具结果本身（Gemini 3 的 functionResponse parts）。片子不在这里（见上）。 */
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
