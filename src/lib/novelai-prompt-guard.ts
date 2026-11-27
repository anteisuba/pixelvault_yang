import { ASSISTANT_NAI_PROMPT_LIMITS } from '@/constants/assistant-operator'
import { isNovelAiV5Model } from '@/constants/novelai'

export type NovelAiPromptProblem =
  | { kind: 'cjk'; sample: string }
  | { kind: 'emphasis'; sample: string }
  | { kind: 'mention'; sample: string }
  | { kind: 'sentence'; sample: string }

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
 * ⭐ NovelAI V5（`isNovelAiV5Model`）原生支持 1–2 句简短英文自然语言描述动作与构图，
 *   因此 V5 仅拦截超长段落或过多长句，不再误伤合法短句。
 */
export function findNovelAiPromptProblem(
  prompt: string,
  options?: { modelId?: string },
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
  /** NAI 看不懂 `@ImageN` —— 参考图走的是图生图 / 精确参考那一路，不在提示词里。 */
  const mention = /@Image\d+/i.exec(body)
  if (mention) return { kind: 'mention', sample: mention[0] }
  const pieces = body
    .split(',')
    .map((piece) => piece.trim())
    .filter(Boolean)
  if (isNovelAiV5Model(options?.modelId)) {
    const overlong = pieces.find(
      (piece) =>
        piece.split(/\s+/).length >
        ASSISTANT_NAI_PROMPT_LIMITS.maxV5SentenceWords,
    )
    if (overlong) return { kind: 'sentence', sample: overlong.slice(0, 60) }
    const longPieces = pieces.filter(
      (piece) =>
        piece.split(/\s+/).length > ASSISTANT_NAI_PROMPT_LIMITS.maxPhraseWords,
    )
    if (longPieces.length > ASSISTANT_NAI_PROMPT_LIMITS.maxV5Sentences) {
      return {
        kind: 'sentence',
        sample: longPieces[ASSISTANT_NAI_PROMPT_LIMITS.maxV5Sentences]!.slice(
          0,
          60,
        ),
      }
    }
    return null
  }
  const sentence = pieces.find(
    (piece) =>
      piece.split(/\s+/).length > ASSISTANT_NAI_PROMPT_LIMITS.maxPhraseWords,
  )
  if (sentence) return { kind: 'sentence', sample: sentence.slice(0, 60) }
  return null
}
