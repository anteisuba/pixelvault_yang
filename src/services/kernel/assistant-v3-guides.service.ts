import 'server-only'

import { ASSISTANT_OPERATOR_CANVAS_LIMITS } from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_GUIDE_HEADING,
  ASSISTANT_V3_GUIDE_ITEM_PREFIX,
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

/**
 * 画布上每个型号的**写法**（P2 第二片，2026-10-15；第三片按协调者的决定改回整份）。
 *
 * - **板上的型号**（按卡数取前 `maxDialectModels` 种，再按型号 id 排）：整份写法在系统提示分界线
 *   之后 —— 每个型号一行提示，标签写法、Seedance 控制规则、视频写法 + 镜头语法各一份（板上真有
 *   视频卡才给后两样）。板上型号的集合不变，这一段就逐字不变（缓存吃得到）。
 * - **板上没有的型号**（排在上限之外的、或要建到新卡上的）：`read "guide:<型号>"` 现取，只进
 *   这一轮的记录。可选，⛔ 不设闸、⛔ 不强制多一步。
 * ⚠ 第二片曾把整份写法挪出系统提示、写词前强制先 read（写词闸）。协调者的决定（2026-10-15，
 *   ⛔ 不是 owner 定的）：写提示词是核心动作，多一来回的延迟不值 —— 省下的约 5.7k 字只在首步、
 *   未命中缓存时才算数（第二轮起本就命中缓存）。所以整份写法放回、写词闸拿掉。
 */

/** 整份写法开头那一行（记录瘦身认它：带写法的结果 ⛔ 不瘦，见 `assistant-v3-transcript-view.ts`）。 */
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
 * 系统提示分界线之后那一段：板上型号的整份写法（每个型号一行提示 + 共用的长段各一份）。
 * ⚠ 只依赖「板上挂着哪几个型号、各挂在什么卡上」，⛔ 不看选中 / 点名（那每轮都变）。
 */
export function buildAssistantV3CanvasGuideSection(
  nodes: readonly AssistantOperatorCanvasNode[],
): string {
  const { listed, others } = listedModels(nodes)
  const hints = listed.flatMap((modelId) => {
    const hint = hintOf(modelId)
    return hint ? [`- ${modelId}: ${hint}`] : []
  })
  const tagRule = listed.some((modelId) => isTagBasedPromptModel(modelId))
  const videoModels = listed.filter((modelId) =>
    nodes.some(
      (node) =>
        node.model === modelId && node.kind === NODE_MEDIA_KIND_IDS.video,
    ),
  )
  // 2.0 与 2.5 的控制规则不同：板上两种都有就各给一份（第二片之前只给第一份）。
  const seedanceRules = [
    ...new Set(
      videoModels.flatMap((modelId) => getSeedanceControlRules(modelId) ?? []),
    ),
  ]
  if (
    hints.length === 0 &&
    !tagRule &&
    videoModels.length === 0 &&
    others.length === 0
  )
    return ''
  return `\n\nWHAT EACH CARD'S PROMPT MUST LOOK LIKE — a card's prompt goes to the model selected on THAT card (the board lists it per card), so write it in that model's dialect; the wrong dialect wastes the run even when every other setting is right:${
    hints.length ? `\n${hints.join('\n')}` : ''
  }${
    others.length
      ? `\n- Also on the board: ${others.join(', ')} — read "${ASSISTANT_V3_GUIDE_ITEM_PREFIX}<model id>" for one's guide when you write its prompt.`
      : ''
  }${tagRule ? `\n${TAG_BASED_GENERATION_PROMPT_RULE}` : ''}${seedanceRules
    .map((rules) => `\n\n${rules}`)
    .join('')}${
    videoModels.length
      ? `\n\n${VIDEO_PROMPT_WRITING_RULES}\n\n${CINEMATIC_SHOT_GRAMMAR}`
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

/** 一个型号的整份写法（`read "guide:<型号>"` 给的那一份）。 */
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
