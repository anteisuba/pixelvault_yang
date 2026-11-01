/**
 * 镜头表的景别 / 运镜 / 风格 → 发送时接在提示词后面的那一段（`p-canvas-shotlist`）。
 *
 * ⚠ 只在**发送那一刻**拼，⛔ 不写回卡的正文：正文是用户和助手写的那段话，表里的
 * 几格是结构化的另一层；写回去就成了两份，改表的人看不到正文里那句旧的。
 * ⚠ 一格都没填 = 原样返回，存量镜头卡的请求一个字不变。
 *
 * ⛔ 纯函数：不读时钟、不碰 DOM。
 */

import { SHOT_SIZE_PROMPT_TERMS } from '@/constants/shot-spec'
import type {
  NodeV4ShotSpec,
  NodeWorkflowShotlist,
} from '@/types/node-workflow'

/** 这一镜实际用的风格：单镜写了用单镜的，空着用全片的。 */
export function resolveShotLook(
  spec: NodeV4ShotSpec | undefined,
  shotlist: NodeWorkflowShotlist | undefined,
): string | undefined {
  return spec?.look ?? shotlist?.look
}

export function composeShotSpecPrompt(
  prompt: string,
  spec: NodeV4ShotSpec | undefined,
  shotlist: NodeWorkflowShotlist | undefined,
): string {
  const lines: string[] = []
  if (spec?.size) lines.push(`Shot size: ${SHOT_SIZE_PROMPT_TERMS[spec.size]}.`)
  if (spec?.move) lines.push(`Camera movement: ${spec.move}.`)
  const look = resolveShotLook(spec, shotlist)
  if (look) lines.push(`Look: ${look}.`)
  if (lines.length === 0) return prompt
  const body = prompt.trimEnd()
  return body ? `${body}\n\n${lines.join('\n')}` : lines.join('\n')
}
