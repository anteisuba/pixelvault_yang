import 'server-only'

import { z } from 'zod'

import {
  ASSISTANT_RESEARCH_LIMITS,
  ASSISTANT_WEB_FIND_LIMITS,
} from '@/constants/assistant-operator'
import { ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS } from '@/constants/assistant-v3'
import {
  carriedWebFinds,
  describeWebFindLine,
  parseWebFindHandle,
  webFindToWebImage,
  webImageToFind,
  webVideoToFind,
} from '@/lib/assistant-web-finds'
import {
  AssistantOperatorWebImageSchema,
  AssistantOperatorWebVideoSchema,
  type AssistantOperatorRequest,
} from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'
import {
  AssistantResearchSourceRefSchema,
  type AssistantResearchSourceRef,
  type AssistantWebFind,
  type AssistantWebImageFind,
} from '@/types/assistant-web-finds'
import type { PreparedOperatorTurn } from '@/services/kernel/assistant-operator.service'

/**
 * v3 里**找到的东西的编号 `#n`** 与**查证的资料号 `[n]`**（搜索期第三片，附录 I §3.3）。
 *
 * ⭐ 服务端零会话态：一跳一跳之间、一轮一轮之间，`#n` → 那一张的对照表只活在本轮记录里
 *   （结果条目的 `finds` / `sources`，板子上的 `finds` = 上一轮带来的）。这里按它
 *   ① 每一跳开头把旧执行器的连号与准入名单续上（`seedV3WebFinds`），
 *   ② 把模型写的 `#3` / `[3]` 换回那一张 / 那一页。
 * ⚠ 认不出的号、过期的号（两轮以前的）、视频的号拿去导入 —— 都回一句说得清的话，⛔ 不抛。
 */

type Run = PreparedOperatorTurn['run']

const LooseImagesSchema = z.object({ images: z.array(z.unknown()) })
const LooseVideosSchema = z.object({ videos: z.array(z.unknown()) })
const LooseEvidenceSchema = z.object({
  evidence: z.array(
    z.object({
      cite: z.number().int().optional(),
      url: z.string().optional(),
      title: z.string(),
    }),
  ),
})

/** 一步联网找图 / 找视频的结果 → 本轮记录里搬的那几条（没编号的不算）。 */
export function findsOfStepResult(result: unknown): AssistantWebFind[] {
  const images = LooseImagesSchema.safeParse(result).data?.images ?? []
  const videos = LooseVideosSchema.safeParse(result).data?.videos ?? []
  return [
    ...images.flatMap((raw) => {
      const image = AssistantOperatorWebImageSchema.safeParse(raw)
      const find = image.success ? webImageToFind(image.data) : null
      return find ? [find] : []
    }),
    ...videos.flatMap((raw) => {
      const video = AssistantOperatorWebVideoSchema.safeParse(raw)
      const find = video.success ? webVideoToFind(video.data) : null
      return find ? [find] : []
    }),
  ].slice(0, ASSISTANT_WEB_FIND_LIMITS.maxPerTurn)
}

/** 一步查证的结果 → 资料号对照表（只收有地址的那几条）。 */
export function sourcesOfStepResult(
  result: unknown,
): AssistantResearchSourceRef[] {
  const evidence = LooseEvidenceSchema.safeParse(result).data?.evidence ?? []
  return evidence
    .flatMap((item) => {
      const parsed = AssistantResearchSourceRefSchema.safeParse({
        cite: item.cite,
        url: item.url,
        title: item.title.slice(
          0,
          ASSISTANT_RESEARCH_LIMITS.maxEvidenceTitleChars,
        ),
      })
      return parsed.success ? [parsed.data] : []
    })
    .slice(0, ASSISTANT_RESEARCH_LIMITS.maxEvidenceItems * 2)
}

/** 开轮时冻进板子的那几条：请求里上一轮的，去重、只留最后 `maxCarried` 条。 */
export function priorFindsOf(
  request: AssistantOperatorRequest,
): AssistantWebFind[] {
  return carriedWebFinds(request.priorFinds ?? [])
}

/** 本轮记录里所有找到的东西（板子上带来的在前，本轮的按先后）。 */
function transcriptFinds(
  transcript: AssistantV3Transcript,
): AssistantWebFind[] {
  return transcript.flatMap((entry) =>
    entry.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.board ||
    entry.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result
      ? (entry.finds ?? [])
      : [],
  )
}

function transcriptSources(
  transcript: AssistantV3Transcript,
): AssistantResearchSourceRef[] {
  return transcript.flatMap((entry) =>
    entry.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result
      ? (entry.sources ?? [])
      : [],
  )
}

/**
 * 每一跳开头：旧执行器的两条连号接着本轮记录往下数，找到过的图回到准入名单。
 *
 * ⭐ 连号：下一条找到的东西从「已有最大号 + 1」起（上一轮带来的也算 —— 所以「用 #2」永远
 *   只指一张）；`[n]` 同理，接力之后再查一次也不和前一跳的撞号。
 * ⭐ 准入：`import_user_url` / `propose_character_images` 只认 `run.webImageIndex` 里的图；
 *   接力那一跳与下一轮的 run 是新的，这里把记录里的图放回去。「能不能当参考」按域名现判
 *   （`webFindToWebImage`），⛔ 不信往返带回来的结论。
 */
export function seedV3WebFinds(
  run: Run,
  transcript: AssistantV3Transcript,
): void {
  const finds = transcriptFinds(transcript)
  const topFind = finds.reduce((max, find) => Math.max(max, find.n), 0)
  run.webFindSeq = Math.max(run.webFindSeq ?? 1, topFind + 1)
  for (const find of finds)
    if (find.kind === 'image' && !run.webImageIndex.has(find.imageUrl))
      run.webImageIndex.set(find.imageUrl, webFindToWebImage(find))
  const topCite = transcriptSources(transcript).reduce(
    (max, source) => Math.max(max, source.cite),
    0,
  )
  run.evidenceCiteSeq = Math.max(run.evidenceCiteSeq ?? 1, topCite + 1)
}

/** `#n` → 那一条：本轮最近找到的优先，再看上一轮带来的。 */
export function v3WebFindOf(
  transcript: AssistantV3Transcript,
  n: number,
): AssistantWebFind | null {
  return transcriptFinds(transcript).findLast((find) => find.n === n) ?? null
}

/** `[n]` → 那一页（本轮查证给过的、有地址的那几条）。 */
export function v3ResearchSourceOf(
  transcript: AssistantV3Transcript,
  cite: number,
): AssistantResearchSourceRef | null {
  return (
    transcriptSources(transcript).findLast((source) => source.cite === cite) ??
    null
  )
}

/** `read` 的一项是不是 `"[3]"`（查证的资料号）。 */
const SOURCE_HANDLE = /^\s*\[\s*(\d{1,4})\s*\]\s*$/

export function parseResearchSourceHandle(text: string): number | null {
  const match = SOURCE_HANDLE.exec(text)
  return match ? Number(match[1]) : null
}

export type V3WebImagePick =
  | { ok: true; find: AssistantWebImageFind }
  | { ok: false; error: string }

/**
 * 模型写的一个句柄是不是 `#n`：不是 → `null`（照原路走）；是 → 换回那张图，换不回就给一句
 * 说得清的话（认不出 / 过期 / 那是一支视频）。
 */
export function pickV3WebImage(
  transcript: AssistantV3Transcript,
  handle: string,
): V3WebImagePick | null {
  const n = parseWebFindHandle(handle)
  if (n === null) return null
  const find = v3WebFindOf(transcript, n)
  if (!find) {
    const known = transcriptFinds(transcript)
    return {
      ok: false,
      error:
        known.length === 0
          ? `There is no #${n}: nothing has been found on the web this turn or last turn. Search first (search_library kind "web_images"), then use a number from what comes back.`
          : `#${n} is not one of the finds of this turn or last turn (they run #${Math.min(...known.map((item) => item.n))}–#${Math.max(...known.map((item) => item.n))}); older finds are no longer at hand. Use a number from the latest search, or search again.`,
    }
  }
  if (find.kind === 'video')
    return {
      ok: false,
      error: `#${n} is a video ("${find.title}"): videos are links only — they cannot be imported, mounted or proposed as pictures.`,
    }
  return { ok: true, find }
}

/**
 * 上一轮带来的那几条给模型的那一段（开轮冻进板子，每一跳逐字相同）。⛔ 不给地址。
 */
export function priorFindsText(
  finds: readonly AssistantWebFind[],
): string | null {
  if (finds.length === 0) return null
  return `FOUND ON THE WEB LAST TURN (still on the creator's screen under the earlier reply; same numbers):\n${finds
    .map((find) => `  ${describeWebFindLine(find)}`)
    .join('\n')}`
}
