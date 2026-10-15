/**
 * v3 板子上那张「`@` 对照表」（统一引用模型，设计方案 §10b · 附录 G §9.3）。
 *
 * ⭐ 客户端把每一枚 `@` 胶囊按 id 解析好、名字在这条消息里去过重，正文里写成
 * `「名字」`。这里把「名字 → 句柄」写进板子：模型按句柄动手，⛔ 不再按名字猜卡
 * （三张同名「镜头1」、改过名的卡、画布图片不算被 @ 到 —— 都是按名字找的老病）。
 *
 * ⚠ 看图上限只有一个数（`ASSISTANT_MENTION_LIMITS.lookImages`）：指了更多张时
 * 板子上明说「只附了前 N 张」，与面板上那句「只细看前 N 张」是同一个数。
 */

import { ASSISTANT_MENTION_LIMITS } from '@/constants/assistant-mention'
import { ASSISTANT_V3_CLIP_LIMITS } from '@/constants/assistant-v3'
import type { AssistantMentionRef } from '@/types/assistant-mention'

const SCOPE_TEXT: Record<AssistantMentionRef['scope'], string> = {
  canvas: 'canvas card',
  reference: 'reference slot',
  result: 'result',
  library: 'library asset',
  attachment: 'attached file',
  character: 'character',
  lora: 'LoRA',
}

export interface AssistantV3MentionTableInput {
  readonly mentions: readonly AssistantMentionRef[]
  /** 这一轮真正附给模型的那几张图（按顺序，与「IMAGES THE CREATOR POINTED AT」同一份）。 */
  readonly attachedLabels: readonly string[]
  /** 这一轮摆在模型眼前的那几段片子（按顺序，与「CLIPS THE CREATOR POINTED AT」同一份）。 */
  readonly clipLabels?: readonly string[]
  /** 用户这一轮一共递了几张可看的图（`mentionedAssets` 的长度）。 */
  readonly pointedImageCount: number
  /** 这一条在这张脸上的句柄；没有（不在板子上 / 这张脸不认它）= `null`。 */
  handleOf(mention: AssistantMentionRef): string | null
}

/** 板子末尾的那一段；什么都没 `@` 也没超上限时是空串。 */
export function renderAssistantV3MentionTable(
  input: AssistantV3MentionTableInput,
): string {
  const lines: string[] = []
  if (input.mentions.length) {
    lines.push(
      "MENTIONED — the creator's @ references, resolved by id (「name」 in their message = this):",
    )
    for (const mention of input.mentions) {
      const handle = input.handleOf(mention)
      const attached = input.attachedLabels.indexOf(mention.label)
      const clip = (input.clipLabels ?? []).indexOf(mention.label)
      const target = handle
        ? `${handle} (${SCOPE_TEXT[mention.scope]})`
        : attached >= 0
          ? `attached image ${attached + 1} (${SCOPE_TEXT[mention.scope]})`
          : clip >= 0
            ? `pointed clip ${clip + 1} (${SCOPE_TEXT[mention.scope]})`
            : `${mention.kind} · ${SCOPE_TEXT[mention.scope]}${
                typeof mention.seq === 'number' ? ` #${mention.seq}` : ''
              } (${
                mention.kind === 'video'
                  ? `not in front of you — at most ${ASSISTANT_V3_CLIP_LIMITS.maxClips} clips a message are watched; say so if it matters`
                  : 'not on this board'
              })`
      const role = mention.role
        ? ` · use as ${mention.role.replace('_', ' ')} reference`
        : ''
      lines.push(`  「${mention.label}」 = ${target}${role}`)
    }
  }
  const cap = ASSISTANT_MENTION_LIMITS.lookImages
  if (input.pointedImageCount > cap) {
    lines.push(
      `LOOK CAP — the creator pointed at ${input.pointedImageCount} images; only the first ${cap} are attached. Say so if the rest matter.`,
    )
  }
  return lines.join('\n')
}
