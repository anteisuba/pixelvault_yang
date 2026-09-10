/**
 * **跨轮工作记忆**的产物提取（切片 Y）—— 纯函数。
 *
 * ── 它解决的是什么 ────────────────────────────────────────────────
 * 助手每一轮都从零开始：上一轮它检索出来的三条证据、备的那一枪、用户 `@` 过的
 * 两张图，在下一轮的请求里一个字都没有。表现是第三轮里用户说「用刚才那张官方
 * 立绘」，助手回一句「我没有看到你说的那张」。工作记忆就是那一段：每一轮把
 * **这一轮见过的东西**记成一份名字索引（`id + displayName + kind + url`），
 * 随下一次请求一起上去（`request.workingMemory.rounds`）。
 *
 * ⚠ **只记名字与地址，不记内容**：证据的正文、候选的尺寸、结果的 snapshot 一律
 * 不进来 —— 这一段每一轮都要重发一次，而每一步都是一次 LLM 往返。
 * ⚠ `kind` 说的是**它从哪来**（结果 / 联网候选 / 检索证据 / 素材库），⛔ 不是媒体
 * 类型：准入判定关心的正是前者（见契约里那条 enum 的头注）。
 * ⚠ 提取器**只认已经有结论的那一步**（`done`）：`running` 的那一帧还没有 `result`，
 * 从它身上取只会得到一轮空记忆。
 */

import {
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import { ASSISTANT_OPERATOR_STEP_STATUS_IDS } from '@/constants/assistant-operator'
import type { AssistantOperatorStep } from '@/types/assistant-operator'
import type {
  StudioOperatorAttachment,
  StudioOperatorMemoryArtifact,
} from '@/types/studio-assistant-operator'

/** 名字空着时退回一段可读的兜底 —— ⛔ 不写一个空串（那在提示里是一行空白）。 */
export function operatorMemoryName(
  value: string | undefined,
  id: string,
): string {
  const trimmed = value?.trim()
  return (trimmed && trimmed.length > 0 ? trimmed : id).slice(
    0,
    ASSISTANT_OPERATOR_LIMITS.maxLabelChars,
  )
}

/**
 * 一步跑完之后，这一步让用户 / 助手**见到了什么**。
 *
 * ⚠ 只覆盖四条会产出「可指认的东西」的工具：素材检索、联网找图、有目标检索、
 * 读正文。⛔ 别把 `set_*` 也算进来 —— 那些改的是表单，不是产物，进了工作记忆
 * 只会让助手以为「提示词」是一件可以 `@` 的东西。
 */
export function collectStepArtifacts(
  step: AssistantOperatorStep,
): readonly StudioOperatorMemoryArtifact[] {
  if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) return []
  switch (step.tool) {
    /**
     * ⚠ 每一支各自判一次 `result` 在不在，⛔ 不在 switch 之前统一判：`step` 是按
     * `tool` 的判别联合，改步那几支身上**根本没有 `result` 这个字段** —— 提到
     * switch 外面就等于向一个不存在的字段提问（编译期直接红）。
     * ⚠ 判它本身是必要的：读步的结果在契约里可空，结果还没落下来的那一帧里取它
     * 会当场抛，而那会掐掉整条流。
     */
    case ASSISTANT_OPERATOR_TOOL_IDS.searchAssets:
      return (step.result?.assets ?? []).map((asset) => ({
        id: asset.assetId,
        displayName: operatorMemoryName(asset.displayName, asset.assetId),
        kind: 'asset' as const,
        ...(asset.url ? { url: asset.url } : {}),
      }))
    case ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages:
      // ⚠ 联网候选**没有 id**（它还不是用户的东西）——用原图直链当身份：
      //   转存之后那一张会以 assetId 的身份再进来一次，两条不冲突。
      return (step.result?.images ?? []).map((image) => ({
        id: image.imageUrl,
        displayName: operatorMemoryName(
          image.publisher ?? image.domain,
          image.imageUrl,
        ),
        kind: 'candidate' as const,
        url: image.imageUrl,
      }))
    case ASSISTANT_OPERATOR_TOOL_IDS.research:
      return (step.result?.evidence ?? []).map((item) => ({
        id: item.url ?? item.title,
        displayName: operatorMemoryName(item.title, item.publisher),
        kind: 'evidence' as const,
        ...(item.url ? { url: item.url } : {}),
      }))
    case ASSISTANT_OPERATOR_TOOL_IDS.readUrl:
      return step.result
        ? [
            {
              id: step.result.url,
              displayName: operatorMemoryName(
                step.result.title,
                step.result.url,
              ),
              kind: 'evidence' as const,
              url: step.result.url,
            },
          ]
        : []
    default:
      return []
  }
}

/**
 * 用户这一轮 `@` / 📎 上来的那几件 —— 同一条 chip 管线的产物。
 *
 * ⚠ `kind` 恒 `asset`：它们来自素材库（或已经转存进库的那些），而不是这一轮
 * 新查出来的东西。⛔ 别按媒体类型分（见文件头注）。
 */
export function attachmentArtifacts(
  attachments: readonly StudioOperatorAttachment[],
): readonly StudioOperatorMemoryArtifact[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    displayName: operatorMemoryName(attachment.label, attachment.id),
    kind: 'asset' as const,
    url: attachment.url,
  }))
}

/**
 * 结果行卡上那一批（助手备的那一枪回来了）。
 *
 * ⚠ `kind: 'result'`：它与素材库里的那些**要分得开** —— 用户说「刚出的那张」
 * 指的就是这一档，而助手要能据此排序。
 */
export function resultArtifacts(
  items: readonly { id: string; url: string; label?: string }[],
): readonly StudioOperatorMemoryArtifact[] {
  return items.map((item) => ({
    id: item.id,
    displayName: operatorMemoryName(item.label, item.id),
    kind: 'result' as const,
    url: item.url,
  }))
}
