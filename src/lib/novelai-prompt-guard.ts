import { ASSISTANT_NAI_PROMPT_LIMITS } from '@/constants/assistant-operator'

export type NovelAiPromptProblem =
  | { kind: 'cjk'; sample: string }
  | { kind: 'emphasis'; sample: string }

const CJK_RUN = new RegExp(
  `[\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af]{${ASSISTANT_NAI_PROMPT_LIMITS.minCjkRun},}`,
)
const NUMERIC_EMPHASIS = /(-?\d+(?:\.\d+)?)\s*::/g
const BRACE_RUN = new RegExp(
  `[{]{${ASSISTANT_NAI_PROMPT_LIMITS.maxBraceDepth + 1},}|[[]{${ASSISTANT_NAI_PROMPT_LIMITS.maxBraceDepth + 1},}`,
)

/**
 * NAI 提示词里写不得的东西（`ASSISTANT_NAI_PROMPT_LIMITS` 头注）。第一处问题回
 * 出来，没问题回 `null`。⚠ `Text:` 之后要画进图里的字不查。
 */
export function findNovelAiPromptProblem(
  prompt: string,
): NovelAiPromptProblem | null {
  const body = prompt.split(/\bText:/)[0] ?? ''
  const cjk = CJK_RUN.exec(body)
  if (cjk) return { kind: 'cjk', sample: cjk[0] }
  for (const match of body.matchAll(NUMERIC_EMPHASIS)) {
    if (
      Math.abs(Number(match[1])) >
      ASSISTANT_NAI_PROMPT_LIMITS.maxNumericEmphasis
    )
      return { kind: 'emphasis', sample: match[0] }
  }
  const braces = BRACE_RUN.exec(body)
  if (braces) return { kind: 'emphasis', sample: braces[0] }
  return null
}
