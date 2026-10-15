import 'server-only'

import { ASSISTANT_OPERATOR_CANVAS_LIMITS } from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_GUIDE_HEADING,
  ASSISTANT_V3_GUIDE_ITEM_PREFIX,
  ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS,
} from '@/constants/assistant-v3'
import {
  CINEMATIC_SHOT_GRAMMAR,
  VIDEO_PROMPT_WRITING_RULES,
} from '@/constants/cinematic-grammar'
import {
  getModelEnhanceHint,
  isTagBasedPromptModel,
  TAG_BASED_GENERATION_PROMPT_RULE,
} from '@/constants/model-strengths'
import { getSeedanceControlRules } from '@/constants/model-strengths.media'
import { getModelById, resolveAdapterType } from '@/constants/models'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import type { AssistantOperatorCanvasNode } from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'

/**
 * 画布上每个型号的**写法**（P2 第二片「提示词瘦身」，2026-10-15）。
 *
 * 从前（`buildCanvasModelDialectSection`）板上有视频卡，系统提示就整份带上视频写法 + 镜头语法 +
 * Seedance 控制规则，约 8k 字，问一句话、接一根线也照付。现在分两层：
 * - **一行提示**（每个型号的 `enhanceHint`）：板上的型号（按卡数取前 `maxDialectModels` 种）在
 *   系统提示分界线之后各一行，按型号 id 排 —— 板上型号的集合不变，这一段就逐字不变（缓存吃得到）。
 * - **整份写法**（视频写法、镜头语法、Seedance 控制规则、标签写法）：`read "guide:<型号>"` 现取，
 *   只进这一轮的记录。整段写视频 / 标签型号的提示词之前没取过 → 那一次 write / add 不落，结果里
 *   直接给整份写法（`canvasGuideGap`），模型照着再写一遍。
 * ⚠ 这是我的取舍（P2），不是 owner 定的：整份写法只在要写的那一轮花一次字数，换来不写词的轮次
 *   系统提示少约 6k 字；写词那一轮多一步。
 */

/** 整份写法开头那一行：本轮记录里有它 = 这个型号的写法这一轮已经摆到模型眼前（`guideDelivered`）。 */
function guideHeading(modelId: string): string {
  return `${ASSISTANT_V3_GUIDE_HEADING}${modelId}\n`
}

/** 这个型号是不是出视频的：板上挂在视频卡上，或目录里登记的是视频。 */
export function isAssistantV3VideoModel(
  modelId: string,
  nodes: readonly AssistantOperatorCanvasNode[],
): boolean {
  return (
    nodes.some(
      (node) =>
        node.model === modelId && node.kind === NODE_MEDIA_KIND_IDS.video,
    ) || getModelById(modelId)?.outputType === 'VIDEO'
  )
}

function hintOf(modelId: string): string | null {
  return getModelEnhanceHint(modelId, resolveAdapterType(modelId) ?? undefined)
}

/** 一行提示之外还有没有长的那几段（视频写法 / Seedance 控制规则 / 标签写法）。 */
function hasFullGuide(modelId: string, video: boolean): boolean {
  return (
    video ||
    isTagBasedPromptModel(modelId) ||
    getSeedanceControlRules(modelId) !== null
  )
}

/** 系统提示里列哪几个型号：按卡数取前几种（同数按 id），再按 id 排 —— 板上型号不变就逐字不变。 */
function listedModels(nodes: readonly AssistantOperatorCanvasNode[]): {
  listed: string[]
  others: string[]
} {
  const counts = new Map<string, number>()
  for (const node of nodes)
    if (node.model) counts.set(node.model, (counts.get(node.model) ?? 0) + 1)
  const byCount = [...counts]
    .sort(
      ([leftId, left], [rightId, right]) =>
        right - left || leftId.localeCompare(rightId),
    )
    .map(([modelId]) => modelId)
  const cap = ASSISTANT_OPERATOR_CANVAS_LIMITS.maxDialectModels
  return {
    listed: byCount.slice(0, cap).sort(),
    others: byCount.slice(cap).sort(),
  }
}

/**
 * 系统提示分界线之后那一段：板上每个型号一行提示，有整份写法的标一句去哪儿取。
 * ⚠ 只依赖「板上挂着哪几个型号、各挂在什么卡上」，⛔ 不看选中 / 点名（那每轮都变）。
 */
export function buildAssistantV3CanvasGuideSection(
  nodes: readonly AssistantOperatorCanvasNode[],
): string {
  const { listed, others } = listedModels(nodes)
  const lines = listed.flatMap((modelId) => {
    const hint = hintOf(modelId)
    const full = hasFullGuide(modelId, isAssistantV3VideoModel(modelId, nodes))
    if (!hint && !full) return []
    return [
      `- ${modelId}: ${hint ? `${hint}${full ? ' ' : ''}` : ''}${full ? `Full guide: read "${ASSISTANT_V3_GUIDE_ITEM_PREFIX}${modelId}".` : ''}`,
    ]
  })
  if (lines.length === 0 && others.length === 0) return ''
  return `\n\nWHAT EACH CARD'S PROMPT MUST LOOK LIKE — a card's prompt goes to the model selected on THAT card (the board lists it per card), so write it in that model's dialect; the wrong dialect wastes the run even when every other setting is right:${
    lines.length ? `\n${lines.join('\n')}` : ''
  }${
    others.length
      ? `\n- Also on the board: ${others.join(', ')} — read "${ASSISTANT_V3_GUIDE_ITEM_PREFIX}<model id>" before writing a prompt for one.`
      : ''
  }`
}

/** `read` 的一项是不是 `"guide:<型号>"`：是 → 型号 id，不是 → `null`。 */
export function parseGuideItem(item: string): string | null {
  const text = item.trim()
  if (!text.toLowerCase().startsWith(ASSISTANT_V3_GUIDE_ITEM_PREFIX))
    return null
  const modelId = text.slice(ASSISTANT_V3_GUIDE_ITEM_PREFIX.length).trim()
  return modelId || null
}

/** 一个型号的整份写法（`read "guide:<型号>"` 与写词闸给的同一份）。 */
export function renderAssistantV3ModelGuide(
  modelId: string,
  video: boolean,
): string {
  const hint = hintOf(modelId)
  const seedance = getSeedanceControlRules(modelId)
  const parts = [
    hint ? `- ${modelId}: ${hint}` : null,
    isTagBasedPromptModel(modelId) ? TAG_BASED_GENERATION_PROMPT_RULE : null,
    seedance,
    video ? `${VIDEO_PROMPT_WRITING_RULES}\n\n${CINEMATIC_SHOT_GRAMMAR}` : null,
  ].filter((part): part is string => part !== null)
  return parts.length
    ? `${guideHeading(modelId)}${parts.join('\n\n')}`
    : `${guideHeading(modelId)}No notes for this model: write plain, concrete description of what should be seen.`
}

/**
 * 这个型号的整份写法这一轮是不是已经摆到模型眼前（`read "guide:…"` 的结果，或写词闸给过）。
 * ⚠ 只认**最后一条 assistant 之前**的结果：同一条回复里并排的 read 与 write，写的时候那份
 *   写法还没到模型眼前。
 */
function guideDelivered(
  transcript: AssistantV3Transcript,
  modelId: string,
): boolean {
  const heading = guideHeading(modelId)
  const lastAssistant = transcript.findLastIndex(
    (entry) => entry.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.assistant,
  )
  return transcript
    .slice(0, Math.max(lastAssistant, 0))
    .some(
      (entry) =>
        entry.type === ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result &&
        entry.output.includes(heading),
    )
}

/**
 * 写词闸：整段写（`replace` / `append` / 建卡带词）一张卡的提示词，而它那个型号的写法模型眼前
 * 没有 —— 有长的那几段却没取过，或者系统提示根本没列这个型号（这一轮刚换上的）。没缺 → `null`。
 */
export function canvasGuideGap(input: {
  modelId: string
  video: boolean
  nodes: readonly AssistantOperatorCanvasNode[]
  transcript: AssistantV3Transcript
}): string | null {
  const { modelId, nodes, transcript } = input
  const video = input.video || isAssistantV3VideoModel(modelId, nodes)
  const listed = listedModels(nodes).listed.includes(modelId)
  if (listed && !hasFullGuide(modelId, video)) return null
  if (!hintOf(modelId) && !hasFullGuide(modelId, video)) return null
  if (guideDelivered(transcript, modelId)) return null
  return renderAssistantV3ModelGuide(modelId, video)
}
