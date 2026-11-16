import {
  ASSISTANT_OPERATOR_TOOL_VERBS,
  ASSISTANT_OPERATOR_VERB_IDS,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'

/**
 * **只动手、没开口的那一轮也要留在对话里**（2026-11-15 真机：画布助手连续三轮只调工具、正文为空）。
 *
 * 空助手行不进对话（见 `buildMessages`），于是下一轮模型读到的是三条挨着的用户消息 ——
 * 它不知道自己上一轮已经按某种理解改过、出过图，也不知道创作者那句「完全没修到」是在否定它。
 * 这里把那一轮真正改了什么拼成一行助手消息补回去。
 *
 * ⚠ 只记会改东西的步（看 / 查不记：那是过程，不是做过的事）；被撤销的照写并标出来。
 */
export const SILENT_TURN_LIMITS = {
  maxSteps: 8,
  maxChars: 600,
} as const

export interface SilentTurnStep {
  readonly tool: AssistantOperatorTool
  readonly title: string
  readonly undone: boolean
}

const QUIET_VERBS: ReadonlySet<string> = new Set([
  ASSISTANT_OPERATOR_VERB_IDS.look,
  ASSISTANT_OPERATOR_VERB_IDS.research,
])

/** 没有可记的步 → `null`（这一轮什么也没留下，就不补）。 */
export function describeSilentTurn(
  steps: readonly SilentTurnStep[],
  generatedBatches: number,
): string | null {
  const done = steps
    .filter(
      (step) => !QUIET_VERBS.has(ASSISTANT_OPERATOR_TOOL_VERBS[step.tool]),
    )
    .map((step) =>
      step.undone ? `${step.title} (the creator undid this)` : step.title,
    )
  if (done.length === 0 && generatedBatches === 0) return null
  const shown = done.slice(0, SILENT_TURN_LIMITS.maxSteps)
  const more = done.length - shown.length
  const parts = [
    shown.length
      ? `I changed: ${shown.join('; ')}${more > 0 ? ` (+${more} more)` : ''}.`
      : '',
    generatedBatches > 0
      ? `Then I put up ${generatedBatches} generation(s) for them to confirm.`
      : '',
  ].filter(Boolean)
  return `[Last turn I wrote no reply. ${parts.join(' ')} If their next message says it is still wrong, my reading of their request was wrong.]`.slice(
    0,
    SILENT_TURN_LIMITS.maxChars,
  )
}
