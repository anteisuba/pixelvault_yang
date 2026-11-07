import 'server-only'

import { z } from 'zod'

import {
  ASSISTANT_MEDIA_LIMITS,
  ASSISTANT_VIDEO_TIERS,
  assistantAdapterSatisfiesVideoTier,
  assistantAdapterVideoTier,
} from '@/constants/assistant'
import { LOOK_FRAME_FETCH_TIMEOUT_MS } from '@/constants/media-transformations'
import {
  SHOT_READ,
  SHOT_READ_ERROR_CODES,
  SHOT_READ_FIELD_IDS,
  type ShotReadField,
} from '@/constants/shot-reading'
import {
  SHOT_SIZE_PROMPT_TERMS,
  SHOT_SIZES,
  SHOT_SPEC_LIMITS,
  type ShotSize,
} from '@/constants/shot-spec'
import type { AppLocale } from '@/i18n/routing'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { getVideoFrameUrl } from '@/lib/video-poster'
import {
  fetchEdgeFrame,
  formatFrameSec,
} from '@/services/video-frames/edge-frame.service'
import { videoUnsupportedError } from '@/services/vision/video-analysis-route.service'
import { resolveVisionRoute } from '@/services/vision/vision-route.service'
import {
  completeVisionStructured,
  VISION_JSON_CONTRACT,
  VISION_SAFETY_PREAMBLE,
} from '@/services/vision/vision-structured-output'
import type {
  ShotReadResult,
  ShotReadRow,
  ShotReadShot,
} from '@/types/shot-reading'

/**
 * 拉片 · 读镜（p-canvas-nodes H4b，设计稿 `docs/design/canvas-shotlist.md` 第 14 / 32 条）。
 *
 * 一次调用 = 一批（≤ 8 镜）：参考片裁到这几镜那一小段（Gemini `videoMetadata` 裁窗，
 * 按秒计的 token 只算这段）+ 每镜一张参考帧当「对号」→ 一镜一行。
 *
 * 复用视频分析那一套：`resolveVisionRoute`（只用点名的那把 key，⛔ 不借别家）、
 * `completeVisionStructured`（解析 → schema 校验 → 打回重试一次）。
 * 与 `analyzeVisual` 的两处不同是故意的：
 *  - **不落 `ResearchRun`**：读到的东西直接落在镜头卡上（草稿），那才是它的家；
 *    再记一份分析记录只是多一处要对账的数据（owner 11-07「不碰数据库」）。
 *  - **只认 native 档**：运镜要看两帧之间发生了什么，帧序列里看不见（同
 *    `VIDEO_ANALYSIS_TASK_TIERS.conversational` 的理由）。看不了视频 →
 *    `ASSISTANT_VIDEO_UNSUPPORTED`，前端就地弹 Gemini 的 `QuickSetupDialog`。
 */

const LANGUAGE_NAMES: Record<AppLocale, string> = {
  en: 'English',
  ja: 'Japanese',
  zh: 'Simplified Chinese',
}

/** 每格送给模型的说法。`Record` 穷举：加一格忘了写，编译期红。 */
const FIELD_KEYS: Record<ShotReadField, readonly (keyof ModelShot)[]> = {
  [SHOT_READ_FIELD_IDS.sizeMove]: ['size', 'move'],
  [SHOT_READ_FIELD_IDS.description]: ['description'],
  [SHOT_READ_FIELD_IDS.look]: ['look'],
}

const SIZE_GLOSSARY = SHOT_SIZES.map(
  (size) => `${size} (${SHOT_SIZE_PROMPT_TERMS[size]})`,
).join(', ')

const SYSTEM_PROMPT_HEAD = `You are a shot-list assistant for an AI film workbench. You watch a short segment of a reference film that has ALREADY been cut into numbered shots, and describe each shot so the user can re-make a similar sequence with their own characters and locations.

${VISION_SAFETY_PREAMBLE}

Rules:
- Return exactly one entry per listed shot, keyed by its shot number. Never merge, split, skip, or renumber shots — the cut points are fixed.
- Fill only the fields you are asked for; set every other field to null.
- If you cannot tell a field from the footage, set it to null. An empty field is better than a confident guess.
- "size": the shot size (framing) at the start of the shot — exactly ONE id from: ${SIZE_GLOSSARY}.
- "move": the CAMERA movement only (not the subject's), as a short phrase — e.g. static, slow push-in, pan left, tilt up, handheld follow, orbit right, zoom out.
- "description": one or two sentences on what is in frame and what happens. Describe people by appearance and role ("a woman in a red coat"), never by name. No camera terms here.
- "look": lighting, colour palette and texture in one or two sentences.`

function buildSystemPrompt(locale: AppLocale): string {
  return `${SYSTEM_PROMPT_HEAD}
- Write "move", "description" and "look" in ${LANGUAGE_NAMES[locale]}. Keep "size" as the English id.

${VISION_JSON_CONTRACT}
{ "shots": [{ "shot": number, "size": string|null, "move": string|null, "description": string|null, "look": string|null }] }`
}

const ModelShotSchema = z.object({
  shot: z.number().int(),
  // ⚠ 景别收宽字符串、事后再对词表：模型写了个词表外的词，丢掉那一格就好，
  //   ⛔ 别让一格坏值把整批打回重试。
  size: z.string().nullable().optional(),
  move: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  look: z.string().nullable().optional(),
})

type ModelShot = z.infer<typeof ModelShotSchema>

/**
 * 模型回话的 schema 按这一批现做：**请求里的每个镜号都得在**，否则打回重试一次 ——
 * 少一镜 / 编号错位的回话看起来完全正常，落进表里就是串行。
 */
function buildOutputSchema(numbers: readonly number[]) {
  return z
    .object({ shots: z.array(ModelShotSchema).min(1) })
    .superRefine((output, ctx) => {
      const got = new Set(output.shots.map((entry) => entry.shot))
      const missing = numbers.filter((number) => !got.has(number))
      if (missing.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shots'],
          message: `missing shot(s) ${missing.join(', ')}`,
        })
      }
    })
}

function roundTenth(sec: number, mode: 'floor' | 'ceil'): number {
  return mode === 'floor' ? Math.floor(sec * 10) / 10 : Math.ceil(sec * 10) / 10
}

/** 参考帧：这一段开头往里一点（避开切点上那一帧的残影），段太短就取段中间。 */
function keyframeSec(shot: ShotReadShot): number {
  const inside = shot.startSec + 0.25
  return inside < shot.endSec ? inside : (shot.startSec + shot.endSec) / 2
}

/** 清一格文字：去首尾空白、`null` / 空串算没读出来、超长截到上限。 */
function clip(
  value: string | null | undefined,
  max: number,
): string | undefined {
  const text = value?.trim()
  if (!text) return undefined
  return text.length > max ? text.slice(0, max).trimEnd() : text
}

function toSize(value: string | null | undefined): ShotSize | undefined {
  const id = value
    ?.trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  return SHOT_SIZES.find((size) => size === id)
}

const MEBIBYTE = 1024 * 1024

/**
 * 花 key 之前先量片子大小：超过 Gemini 那条腿的上限就直接说，⛔ 不等下载到一半才失败
 * （那样还会被结构化输出的重试再下载一遍）。HEAD 不通 / 没回长度 = 量不出来，照常往下走。
 */
async function assertVideoFits(videoUrl: string): Promise<void> {
  let bytes: number | undefined
  try {
    const response = await fetch(videoUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(LOOK_FRAME_FETCH_TIMEOUT_MS),
    })
    const length = Number(response.headers.get('content-length'))
    if (response.ok && Number.isFinite(length) && length > 0) bytes = length
  } catch {
    bytes = undefined
  }
  if (bytes !== undefined && bytes > ASSISTANT_MEDIA_LIMITS.maxVideoBytes) {
    throw new ApiRequestError(
      SHOT_READ_ERROR_CODES.videoTooLarge,
      413,
      `errors.shotRead.${SHOT_READ_ERROR_CODES.videoTooLarge}`,
      `Reference video is ${Math.round(bytes / MEBIBYTE)} MB; shot reading accepts up to ${Math.round(
        ASSISTANT_MEDIA_LIMITS.maxVideoBytes / MEBIBYTE,
      )} MB. Trim it on the clip card first.`,
    )
  }
}

function toRow(
  entry: ModelShot,
  fields: ReadonlySet<ShotReadField>,
): ShotReadRow {
  const row: ShotReadRow = { number: entry.shot }
  if (fields.has(SHOT_READ_FIELD_IDS.sizeMove)) {
    const size = toSize(entry.size)
    const move = clip(entry.move, SHOT_SPEC_LIMITS.moveMaxLength)
    if (size) row.size = size
    if (move) row.move = move
  }
  if (fields.has(SHOT_READ_FIELD_IDS.description)) {
    const description = clip(entry.description, SHOT_READ.descriptionMaxLength)
    if (description) row.description = description
  }
  if (fields.has(SHOT_READ_FIELD_IDS.look)) {
    const look = clip(entry.look, SHOT_SPEC_LIMITS.lookMaxLength)
    if (look) row.look = look
  }
  return row
}

export interface ReadShotsParams {
  /** DB user id（不是 clerkId）。 */
  userId: string
  /** 用户点名的那把 Gemini key。 */
  apiKeyId: string
  locale: AppLocale
  videoUrl: string
  fields: readonly ShotReadField[]
  shots: readonly ShotReadShot[]
}

/**
 * 读一批镜。**会抛**：key 失效 / 那一家看不了视频（`ASSISTANT_VIDEO_UNSUPPORTED`）/
 * 两次都没回对（`VISION_INVALID_OUTPUT`）/ provider 自己的错 —— ⛔ 不静默降级：
 * 一份没看过片子的「运镜」比报错坏得多，它会被当真。
 */
export async function readShots(
  params: ReadShotsParams,
): Promise<ShotReadResult> {
  const { route, modelId } = await resolveVisionRoute(
    params.userId,
    params.apiKeyId,
  )
  if (
    !assistantAdapterSatisfiesVideoTier(
      route.adapterType,
      ASSISTANT_VIDEO_TIERS.native,
      modelId,
    )
  ) {
    throw videoUnsupportedError(
      `shot reading needs tier "native"; route ${route.adapterType}/${String(modelId)} offers "${String(
        assistantAdapterVideoTier(route.adapterType, modelId),
      )}"`,
    )
  }

  await assertVideoFits(params.videoUrl)

  const shots = [...params.shots].sort((a, b) => a.startSec - b.startSec)
  const startOffset = roundTenth(
    Math.min(...shots.map((s) => s.startSec)),
    'floor',
  )
  const endOffset = roundTenth(Math.max(...shots.map((s) => s.endSec)), 'ceil')

  // 每镜一张参考帧，各自成败：一帧截不出来不连累这一批（那一镜照样靠视频读）。
  const frames = await Promise.all(
    shots.map((shot) =>
      fetchEdgeFrame({
        label: `shot ${shot.number}`,
        url: getVideoFrameUrl(
          params.videoUrl,
          keyframeSec(shot),
          SHOT_READ.keyframeWidthPx,
        ),
      }),
    ),
  )
  const stills = shots.flatMap((shot, index) => {
    const frame = frames[index]
    return frame?.ok
      ? [
          {
            number: shot.number,
            dataUrl: `data:${frame.mimeType};base64,${frame.base64}`,
          },
        ]
      : []
  })

  const fields = new Set(params.fields)
  const wanted = params.fields.flatMap((field) => FIELD_KEYS[field])
  const userPrompt = [
    `The attached video is clipped to ${formatFrameSec(startOffset)}–${formatFrameSec(endOffset)} of the reference film. The shots in this segment (times are in the full film):`,
    ...shots.map(
      (shot) =>
        `- Shot ${shot.number}: ${formatFrameSec(shot.startSec)}–${formatFrameSec(shot.endSec)} (${formatFrameSec(shot.endSec - shot.startSec)} long)`,
    ),
    stills.length > 0
      ? `The attached images are one still from each of these shots, in this order: ${stills
          .map((still, index) => `image ${index + 1} = shot ${still.number}`)
          .join(', ')}. Use them to tell the shots apart.`
      : '',
    `Fill these fields: ${wanted.join(', ')}.`,
  ]
    .filter(Boolean)
    .join('\n')

  const numbers = shots.map((shot) => shot.number)
  const output = await completeVisionStructured({
    schema: buildOutputSchema(numbers),
    systemPrompt: buildSystemPrompt(params.locale),
    userPrompt,
    imageData: stills.map((still) => still.dataUrl),
    videoData: [params.videoUrl],
    videoAnalysis: { fps: SHOT_READ.videoFps, startOffset, endOffset },
    route,
    modelId,
    label: 'vision.read_shots',
    maxTokens: SHOT_READ.maxTokens,
  })

  const asked = new Set(numbers)
  const seen = new Set<number>()
  const rows = output.shots.flatMap((entry) => {
    // 只认请求里的镜号、每个只认第一次 —— 多回的、重复的都丢掉。
    if (!asked.has(entry.shot) || seen.has(entry.shot)) return []
    seen.add(entry.shot)
    return [toRow(entry, fields)]
  })

  logger.info('Shot reading completed', {
    adapterType: route.adapterType,
    modelId,
    shots: numbers.length,
    stills: stills.length,
    windowSec: Math.round((endOffset - startOffset) * 10) / 10,
    filledCells: rows.reduce(
      (sum, row) => sum + Object.keys(row).length - 1,
      0,
    ),
  })

  return { rows }
}
