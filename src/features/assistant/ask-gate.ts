import { ASSISTANT_NEXT_TOOL_IDS } from '@/features/assistant/constants'

/**
 * **创作者点名要你先问 → 这一轮只许查、看、问**（owner 2026-11-16 拍 D）。
 *
 * 2026-11-15 真机：「开反问卡，目前完全没修我想要改的地方」—— 模型照旧 look → edit → generate，
 * 一张反问卡都没弹。提示词从来不是闸：这里在服务端拦，模型这一轮调 edit / generate / open 一律拒，
 * 拒的理由告诉它改用 ask。
 *
 * ⚠ 只认创作者**这一句**（附件 / @ 那几行先剥掉：卡名里带「反问」不算）。
 * ⚠ 「别反问了」「不用问我」是相反的意思，先排除。
 */
const ASK_REQUEST =
  /反问|问我|先问|问清楚|问一下我|先别改|先别动|ask me|ask first|ask before|質問して|先に聞いて/i

const ASK_DECLINED =
  /(别|不用|不要|无需|不必|甭|别再)(再)?(反问|问我|问了|问)|don'?t ask|no (more )?questions|聞かないで|質問しないで/i

/**
 * 答反问卡那一句里复述的题面（`StudioOperator…answerText` 三语）—— 题面是助手写的，⛔ 不算创作者的话，
 * 否则一道写着「要不要先问清楚」的题会让下一轮又被闸成只许问。
 */
const ANSWERED_QUESTION_CLAUSE =
  /（针对问题「[\s\S]*」）|\(for the question "[\s\S]*"\)|（質問「[\s\S]*」への回答）/g

/** 剥掉客户端拼在句尾的 `[attached: …]` / `[mentioned: …]`，以及答卡时复述的题面。 */
function ownWords(text: string): string {
  return (text.split(/\n?\[(?:attached|mentioned)[:\s]/)[0] ?? '').replace(
    ANSWERED_QUESTION_CLAUSE,
    '',
  )
}

export function wantsAskOnlyTurn(latestUserText: string): boolean {
  const said = ownWords(latestUserText)
  return ASK_REQUEST.test(said) && !ASK_DECLINED.test(said)
}

const ASK_ONLY_TOOLS: ReadonlySet<string> = new Set([
  ASSISTANT_NEXT_TOOL_IDS.find,
  ASSISTANT_NEXT_TOOL_IDS.look,
  ASSISTANT_NEXT_TOOL_IDS.ask,
])

export const ASK_ONLY_TURN_REMINDER =
  'This turn the creator asked you to ASK them first. You may find and look, then you must end the turn with the ask tool: one question card about what exactly they want changed, options drawn from what you see. Do not edit the bench and do not generate this turn.'

export const ASK_ONLY_REFUSAL =
  'Refused: the creator asked you to ask them first this turn, so nothing on the bench changes and nothing is generated. Put your question on an ask card now (options from what you saw), and say in "message" how you currently read their request.'

/** 这一轮被点名先问时，这个工具准不准跑。 */
export function isAllowedInAskOnlyTurn(toolName: string): boolean {
  return ASK_ONLY_TOOLS.has(toolName)
}
