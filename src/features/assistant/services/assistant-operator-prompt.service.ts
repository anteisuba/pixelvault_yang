import 'server-only'

import { createHash } from 'node:crypto'
import type {
  AssistantOperatorPlanAnswer,
  AssistantOperatorRequest,
  AssistantOperatorPlanQuestion,
} from '@/types/assistant-operator'
import { hasCompleteReferenceVisualEvidence } from '@/features/assistant/services/assistant-reference-analysis.service'
import type { ReferenceVisualProfile } from '@/types/assistant-reference-analysis'
import {
  getReferenceMentionIndices,
  normalizeReferenceMentions,
} from '@/lib/studio-reference-mentions'
import {
  ASSISTANT_PLAN_CARD_LIMITS as PLAN_LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS as REJECT,
  ASSISTANT_ROUND_SUMMARY_LIMITS as ROUND_LIMITS,
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_PERSONA_LANGUAGE_IDS,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_PERSONA_VERBOSITY_IDS,
  ASSISTANT_PERSONA_LIMITS as PERSONA_LIMITS,
} from '@/constants/assistant-persona'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import type { PromptAssistantResponseLanguage } from '@/types'
import { buildAssistantConversation } from '@/services/kernel/assistant-completion.service'
import {
  sanitizeToneCustom,
  sanitizeAddressUserAs,
} from '@/features/assistant/services/assistant-persona.service'
import type { CreativePreferenceDigest } from '@/services/user-preference.service'
import type { AssistantConversationRoundStored } from '@/types/assistant-conversation'
import {
  normalizeToLoraBaseFamily,
  findForbiddenDialectHits,
  isLoraNegativeInert,
  LORA_PROMPT_DIALECTS,
  mergeNegativePrompt,
} from '@/features/lora/core'
import type {
  AssistantPersona,
  AssistantPromptPersona,
} from '@/types/assistant-persona'
import type { ContextCard } from '@/types/context-cards'
import {
  type OperatorRun,
  clamp,
  type ToolPlan,
  reject,
  type OperatorWorkingState,
} from '@/features/assistant/services/assistant-operator-run.service'

/**
 * 助手执行器（旧内核拆出来的那部分）的**提示词片段**：回答语言、人设口吻与「关于这位创作者」段、
 * 缓存键，以及把创作者答过的反问写成一句话的那几个小函数。11-10 从 `assistant-operator.service.ts`
 * 原样搬出（M2a），行为不变。
 * ⚠ 执行器的文件都叫 `assistant-operator-*.service.ts`：钱闸测试按这个前缀收源码。
 */

/**
 * 写文本框的共用一条（正面 / 负面）。
 *
 * ⭐ 就地确认闸在这里（拍板 3）：目标字段里已经有**用户手写**的内容、而这一轮
 * 助手还没写过它、用户也还没就这个字段表过态 → 返回 `confirm`，流就停在这儿。
 * 「助手自己刚写的」不再问 —— 覆盖自己的草稿不需要用户点三次头。
 */
/**
 * 用户在问题卡上答过的那几道 → **自带题面与文案的一行**（v2 §3.4 落账规则）。
 *
 * ⭐ **唯一一份渲染**（2026-09-12 真机 bug）：同一句话要在三个地方被读到 ——
 * 工具环的提示词、参考图分工简报的上下文、本轮结账的「决定」栏。三处各写一遍
 * 的下场就是这次的 bug 的另一半：有的地方看得见答案、有的地方看不见，而模型
 * 只要在**任何一处**看不见就会重问。
 * ⚠ 题面与选项文案是**客户端带上来的**（`AssistantOperatorPlanAnswerSchema` 的
 * `question` / `optionLabels`）：合成 id 是上一条流现编的，服务端零会话态，这里
 * 反查不回去。缺席（老客户端 / 覆盖三选那一支）就退回 id —— ⛔ 不猜一个题面。
 */
export const NO_PLAN_ANSWER = '(no answer)'

export function describeOneAnswer(entry: AssistantOperatorPlanAnswer): string {
  const labels = entry.optionLabels?.length
    ? entry.optionLabels
    : entry.optionIds
  const picked = labels.join(', ')
  const other = entry.otherText?.trim()
  const said = [picked, other ? `other: "${other}"` : null]
    .filter((part): part is string => Boolean(part))
    .join(' + ')
  const asked = entry.question?.trim() || entry.questionId
  return `- "${asked}" → ${said || NO_PLAN_ANSWER}`
}

/**
 * 这条会话里**已经定下来的那几道**（v2 §3.4 落账规则，2026-09-12 第二次真机）。
 *
 * ⭐ 两条来源，缺一不可：
 *  · `messages[].answered` —— 问题卡的答复现在同时是一条自带题面的 user 消息，
 *    所以**两轮前**答的那道题今天还在（这正是第一版修法漏掉的一半：`planAnswers`
 *    只跟着当次请求走，问答轮又以 `stopped` 收尾不结账，于是同一道题被问第三次）；
 *  · `request.planAnswers` —— 本轮那一道，外加老客户端（它不带 `answered`）。
 * 去重同时比较题 id 和题面答复：不同冲突范围分别保留，重复编号但内容不同的题也保留。
 */
export function collectSettledAnswers(
  request: AssistantOperatorRequest,
): AssistantOperatorPlanAnswer[] {
  const settled: AssistantOperatorPlanAnswer[] = []
  const seen = new Set<string>()
  for (const entry of [
    ...request.messages.flatMap((message) =>
      message.answered ? [message.answered] : [],
    ),
    ...(request.planAnswers ?? []),
  ]) {
    const line = `${entry.questionId}:${describeOneAnswer(entry)}`
    if (seen.has(line)) continue
    seen.add(line)
    settled.push(entry)
  }
  return settled
}

// ─── 提示词 ─────────────────────────────────────────────────────

export const RESPONSE_LANGUAGE_LABELS: Record<
  PromptAssistantResponseLanguage,
  string
> = {
  english: 'English',
  japanese: 'Japanese',
  chinese: 'Simplified Chinese',
}

/**
 * 这一轮说哪种语言 —— **persona 的语言档覆盖请求里的那个**（§8.2 / §8.5）。
 *
 * ⚠ `ui` 是「跟界面走」，也就是请求里带上来的那一档；另外两档是用户在助手设置里
 * 明确说过的话，⛔ 不该被界面语言压过去（那正是他去设置里改它的原因）。
 */
export function resolveResponseLanguage(
  request: AssistantOperatorRequest,
  persona: AssistantPersona,
): PromptAssistantResponseLanguage {
  if (persona.language === ASSISTANT_PERSONA_LANGUAGE_IDS.chinese) {
    return 'chinese'
  }
  if (persona.language === ASSISTANT_PERSONA_LANGUAGE_IDS.english) {
    return 'english'
  }
  return request.responseLanguage ?? 'english'
}

/**
 * 首次冲突暂停写入，答复仅对同一问题及同一组参考图有效。
 */
export const PROMPT_CONFLICT_QUESTION_ID = 'prompt-conflict'

export const PROMPT_CONFLICT_FOLLOW_REQUEST_ID = 'follow-request'

export const PROMPT_CONFLICT_FOLLOW_REFERENCE_ID = 'follow-reference'

export const PROMPT_CONFLICT_ASK_TEXTS: Record<
  PromptAssistantResponseLanguage,
  {
    header: string
    followRequest: { label: string; description: string }
    followReference: { label: string; description: string }
  }
> = {
  english: {
    header: 'Your call',
    followRequest: {
      label: 'Follow my request',
      description:
        'For this specific conflict, prioritize my latest request; preserve the other requirements.',
    },
    followReference: {
      label: 'Follow the reference',
      description: 'Keep the reference look and drop the conflicting lines.',
    },
  },
  japanese: {
    header: 'どちら優先',
    followRequest: {
      label: '要望を優先',
      description:
        'この衝突に限り最新の要望を優先し、その他の条件は維持します。',
    },
    followReference: {
      label: '参考図を優先',
      description: '参考図の見た目を残し、衝突する指定を外す。',
    },
  },
  chinese: {
    header: '怎么取舍',
    followRequest: {
      label: '按我的要求写',
      description: '仅对这一处冲突优先采用你的最新要求，其余约束继续保留。',
    },
    followReference: {
      label: '按参考图来',
      description: '保留参考图的样子，改掉和它打架的那几句。',
    },
  },
}

export type ReferenceReviewScope = {
  target: string
  references: readonly string[]
}

export function promptConflictQuestionId(
  run: OperatorRun,
  issue: string,
  referenceScope?: ReferenceReviewScope,
): string {
  const scope = JSON.stringify({
    domain: run.request.domain,
    references: referenceScope?.references ?? run.state.referenceUrls,
    ...(referenceScope ? { target: referenceScope.target } : {}),
    issue: issue.trim(),
  })
  return `${PROMPT_CONFLICT_QUESTION_ID}-${createHash('sha256').update(scope).digest('hex').slice(0, 24)}`
}

export function buildPromptConflictQuestion(
  run: OperatorRun,
  language: PromptAssistantResponseLanguage,
  uncertainty: string,
  referenceScope?: ReferenceReviewScope,
): AssistantOperatorPlanQuestion {
  const texts = PROMPT_CONFLICT_ASK_TEXTS[language]
  const asked = uncertainty?.trim()
  return {
    id: promptConflictQuestionId(run, uncertainty, referenceScope),
    header: clamp(texts.header, PLAN_LIMITS.maxHeaderChars),
    question: clamp(asked, PLAN_LIMITS.maxQuestionChars),
    multiSelect: false,
    allowOther: true,
    options: [
      {
        id: PROMPT_CONFLICT_FOLLOW_REQUEST_ID,
        label: clamp(
          texts.followRequest.label,
          PLAN_LIMITS.maxOptionLabelChars,
        ),
        description: clamp(
          texts.followRequest.description,
          PLAN_LIMITS.maxOptionDescriptionChars,
        ),
      },
      {
        id: PROMPT_CONFLICT_FOLLOW_REFERENCE_ID,
        label: clamp(
          texts.followReference.label,
          PLAN_LIMITS.maxOptionLabelChars,
        ),
        description: clamp(
          texts.followReference.description,
          PLAN_LIMITS.maxOptionDescriptionChars,
        ),
      },
    ],
  }
}

export function creatorChoseFollowRequest(
  run: OperatorRun,
  issue: string,
  referenceScope?: ReferenceReviewScope,
): boolean {
  const decision = collectSettledAnswers(run.request).findLast(
    (entry) =>
      entry.questionId === promptConflictQuestionId(run, issue, referenceScope),
  )
  return (
    decision?.optionIds.includes(PROMPT_CONFLICT_FOLLOW_REQUEST_ID) === true
  )
}

export const REFERENCE_EVIDENCE_ASK_TEXTS = {
  english: {
    header: 'Evidence',
    add: 'Add a reference',
    addDescription:
      'Provide evidence for the missing parts before faithful reconstruction.',
    design: 'Allow design completion',
    designDescription:
      'Design only the unsupported parts as a draft; keep the supported features.',
  },
  japanese: {
    header: '参考が不足',
    add: '参考を追加',
    addDescription: '不足部分の資料を追加してから、忠実な再現を進めます。',
    design: '不足部分の創作を許可',
    designDescription:
      '確認済みの特徴を保ち、不明な部分だけを案として補います。',
  },
  chinese: {
    header: '参考还缺什么',
    add: '补充参考',
    addDescription: '补齐相关部位的可靠依据，再继续忠实还原。',
    design: '允许设计补全',
    designDescription: '只把缺少依据的部分设计成草稿，保留已有依据的特征。',
  },
} as const

export function planReferenceEvidenceGap(
  run: OperatorRun,
  gaps: readonly string[],
  referenceScope?: ReferenceReviewScope,
): ToolPlan | null {
  for (const gap of gaps) {
    const id = `evidence-${promptConflictQuestionId(run, gap, referenceScope)}`
    const decision = collectSettledAnswers(run.request).findLast(
      (entry) => entry.questionId === id,
    )
    if (decision?.optionIds.includes('design-missing-parts')) continue
    if (decision?.optionIds.includes('add-reference')) {
      return reject(
        REJECT.referenceAnalysisRequired,
        `The creator chose to supply additional evidence for this gap: ${gap}. Preserve the accepted parts and wait for that reference; do not rewrite the unsupported parts or ask the same choice again.`,
      )
    }
    const texts =
      REFERENCE_EVIDENCE_ASK_TEXTS[
        resolveResponseLanguage(run.request, run.persona)
      ]
    return {
      kind: 'ask',
      question: {
        id,
        header: clamp(texts.header, PLAN_LIMITS.maxHeaderChars),
        question: clamp(gap, PLAN_LIMITS.maxQuestionChars),
        multiSelect: false,
        allowOther: true,
        options: [
          {
            id: 'add-reference',
            label: clamp(texts.add, PLAN_LIMITS.maxOptionLabelChars),
            description: clamp(
              texts.addDescription,
              PLAN_LIMITS.maxOptionDescriptionChars,
            ),
          },
          {
            id: 'design-missing-parts',
            label: clamp(texts.design, PLAN_LIMITS.maxOptionLabelChars),
            description: clamp(
              texts.designDescription,
              PLAN_LIMITS.maxOptionDescriptionChars,
            ),
          },
        ],
      },
      todo: gap,
    }
  }
  return null
}

/**
 * persona 的**风格段**（§8.5）——「这个助手是谁、怎么说话」。
 *
 * 拼在 `HOW YOU TALK` 末尾、`TOOLS:` 之前：它说的是口吻，不是能力，
 * ⛔ 别插进 HARD RULES（那一段是结构性的，用户改不了）。
 *
 * ⚠ 整段有硬上限（`PERSONA_LIMITS.maxStyleSectionChars`）。系统提示不参与
 * `OPERATOR_CONTEXT_COMPACTION_TARGET_LENGTH` 那段压缩，所以这里不封顶就是真的
 * 不封顶 —— 而 `toneCustom` 是一段用户自由文本。
 */
export const TONE_DIRECTIVES: Record<
  Exclude<AssistantPersona['tone'], typeof ASSISTANT_PERSONA_TONE_IDS.custom>,
  string
> = {
  [ASSISTANT_PERSONA_TONE_IDS.professional]:
    'Keep it professional and even — plain working language, no filler warmth.',
  [ASSISTANT_PERSONA_TONE_IDS.friendly]:
    'Be warm and conversational, the way a colleague talks — still concrete, never gushing.',
  [ASSISTANT_PERSONA_TONE_IDS.terse]:
    'Be terse. Say the thing and stop; no preamble, no sign-off.',
}

/**
 * 长度三档 → **句数区间**。
 * ⛔ 不给「简短点」这类无边界形容词：模型对它的解读每一轮都不一样。
 *
 * ⭐ 默认档是 `standard`（「平衡」那一档，owner 2026-09-11）。`concise` 依然
 * 不能只说「短一点」—— 那样模型会靠删掉「下一步」来达标，而那句恰恰是用户唯一
 * 要读的。写成**两句各自的职责**（做了什么一句 + 下一步一句）。
 * ⭐ 句数只管**动手之后**的回报；讨论轮（owner 2026-09-30「想讨论时要能和我讨论」）
 * 按段落给 —— 两句话装不下一个观点加理由。
 */
export const VERBOSITY_DIRECTIVES: Record<
  AssistantPersona['verbosity'],
  string
> = {
  [ASSISTANT_PERSONA_VERBOSITY_IDS.concise]:
    'Be brief. After an action, two sentences: what you did, then what happens next. In a discussion, a short paragraph.',
  [ASSISTANT_PERSONA_VERBOSITY_IDS.standard]:
    'After an action, 2–4 sentences. In a discussion, say what the point needs — usually one or two short paragraphs.',
  [ASSISTANT_PERSONA_VERBOSITY_IDS.detailed]:
    'After an action, up to 6 sentences. In a discussion, go into depth when it helps.',
}

/**
 * v3 的长度三档（P3 人设重写）。v3 自己的规矩是「正文不复述改动、一两句」（`HOW_YOU_WORK`），
 * 上面那张表的「做了什么一句」「动手后 2–4 句」正好跟它打架，计划卡 v3 也没有 —— 所以 v3
 * 只拿这张：平衡档什么都不写（就是 v3 的默认），另外两档只往短 / 往深挪，⛔ 不叫它复述做了什么。
 */
export const V3_VERBOSITY_DIRECTIVES: Record<
  AssistantPersona['verbosity'],
  string | null
> = {
  [ASSISTANT_PERSONA_VERBOSITY_IDS.concise]:
    'Keep it short: one sentence when you can; in a discussion, a short paragraph.',
  [ASSISTANT_PERSONA_VERBOSITY_IDS.standard]: null,
  [ASSISTANT_PERSONA_VERBOSITY_IDS.detailed]:
    'When you explain or discuss, go into depth when it helps.',
}

export function buildPersonaStyleSection(
  persona: AssistantPromptPersona,
  kernel: 'v2' | 'v3' = 'v2',
): string {
  const toneCustom = sanitizeToneCustom(persona)
  const lines = [
    persona.tone === ASSISTANT_PERSONA_TONE_IDS.custom
      ? // 说话方式已经整段写在 CHARACTER 里（宽一档），⛔ 别在这里截一半再说一遍。
        persona.promptCharacter?.speech
        ? '- talk the way your CHARACTER section describes'
        : toneCustom
          ? `- the creator described how they want you to sound: '${toneCustom}'`
          : null
      : `- ${TONE_DIRECTIVES[persona.tone]}`,
    ...(kernel === 'v3'
      ? [
          V3_VERBOSITY_DIRECTIVES[persona.verbosity]
            ? `- ${V3_VERBOSITY_DIRECTIVES[persona.verbosity]}`
            : null,
        ]
      : [`- ${VERBOSITY_DIRECTIVES[persona.verbosity]}`]),
  ].filter((line): line is string => line !== null)

  if (lines.length === 0) return ''
  return clamp(`\n${lines.join('\n')}`, PERSONA_LIMITS.maxStyleSectionChars)
}

/**
 * **之前几轮记住的事**（v2 §7.6 的注入段，commit #12）。
 *
 * ⭐ 它答的是 §7.1 那张断点表：上一轮查到的证据、评审得出的结论、用户在问题卡上
 * 选的那一项，下一轮**一条都看不见**。结账把每一轮压成四栏落进会话
 * （`AssistantConversation.rounds`），这一段把最近 `maxRoundsInPrompt` 条印回去。
 *
 * ⚠ 三条纪律，逐条对应 spec 的一行：
 *  ① **进系统提示的独立一段**，⛔ 不混进对话消息 —— 混进去的那一刻它就变成了
 *     「助手自己说过的话」，模型会去反驳它、续写它，而它是事实不是发言；
 *  ② **证据只写编号**，⛔ 不带正文：正文在证据本里，要看就调 `recall_evidence`。
 *     重发正文等于把「每轮结账」省下来的那笔上下文又原样付回去；
 *  ③ 旧的 `priorSteps` **保留**：那一段答的是「刚才动了哪几步」，这一段答的是
 *     「得出了什么」—— 两件事。
 * ⚠ 最旧的排在最前（与对话同序），每条的三栏顺序固定，空栏写 `—` ——
 * 固定格式让模型不必去猜哪一行是什么，也让这一段可被测试逐字锁住。
 */
export function buildRoundMemorySection(
  rounds: readonly AssistantConversationRoundStored[],
): string {
  const recent = rounds.slice(-ROUND_LIMITS.maxRoundsInPrompt)
  if (recent.length === 0) return ''

  const blocks = recent.map((round) => {
    const column = (entries: readonly string[]) =>
      entries.length > 0 ? entries.join(' · ') : '—'
    const evidence =
      round.evidenceRefs.length > 0
        ? `\n    Evidence: ${round.evidenceRefs.join(' ')}`
        : ''
    const sources = round.sourceRefs?.length
      ? `\n    Image versions: ${JSON.stringify(round.sourceRefs)}`
      : '\n    Image versions: not recorded; do not infer a version from a matching name.'
    return `  Round ${round.roundIndex + 1}
    Facts: ${column(round.facts)}
    Decided: ${column(round.decisions)}
    Still open: ${column(round.todos)}${evidence}${sources}`
  })

  return `

WHAT EARLIER ROUNDS SETTLED — oldest first; this is what this conversation already established, not something you said:
${blocks.join('\n')}
Image feedback applies only to the exact image URLs recorded for that round, not a newer image in the same node or another image with the same name. A source listed here is a version reference, not an approval. Preserve which parts the creator accepted, which they rejected, and what remains unsupported; partial approval never approves the whole image or makes it a complete identity reference.
Treat these as settled unless the creator changes them: do not ask again about anything under "Decided", and do not re-research anything under "Facts" — unless the creator asks for it again. When the creator asks you this turn to search, look at, or verify something an earlier round already covered, that IS a change: run the tools again and report what you find now. Never refuse a fresh request by quoting an earlier round back at the creator. Evidence appears as numbers only (#e12) — call recall_evidence with those numbers when you need the text behind one.`
}

/**
 * **关于这位创作者**（v2 §8.3，commit #15）—— persona 里那三项用户偏好，
 * 加上系统学出来的创作偏好，拼成一段。
 *
 * ⚠ 它改的是**说话方式**，所以紧挨着风格段、⛔ 不进 HARD RULES，也**排在工具表
 * 之前**（spec §8.3：口吻读起来该先于做事方式）。
 * ⚠ 「用我的词」只列**名称与词**，⛔ 不重发上下文卡的正文：正文已经在卡那一段里
 * 摆过一次摘要，而完整的一份靠 `read_context_card` 拉 —— 同一份东西在系统提示里
 * 印第二遍，是把「每轮压缩」省下的上下文原样付回去。
 * ⚠ 称呼与卡名都是**用户自由文本**，所以称呼那一格过 `prompt-guard`
 * （`sanitizeAddressUserAs`），整段再封一次顶。
 * ⛔ 学出来的偏好（`UserCreativePreference`）**不受「用我的词」那颗开关管**：
 * 那颗开关说的是「用我的说法」，而这几行说的是「我平时喜欢什么」——两件事，
 * 混在一颗开关下就没人能解释关掉它到底关掉了什么。
 */
export function buildCreatorSection(
  persona: AssistantPersona,
  accountName: string | null,
  contextCards: readonly ContextCard[],
  preference: CreativePreferenceDigest | null,
): string {
  const addressed = sanitizeAddressUserAs(persona) ?? accountName
  const myWords = persona.useMyWords
    ? [
        ...contextCards.map((card) => card.name),
        ...(preference?.favoriteStyles ?? []),
      ]
        .map((word) => word.trim())
        .filter((word) => word.length > 0)
        .slice(0, PERSONA_LIMITS.maxMyWords)
    : []

  const lines = [
    addressed ? `- Address them as ${addressed}.` : null,
    persona.useMyWords
      ? `- Use THEIR words. When they already have a name for something — a character, a look, a shot — say it their way instead of translating it into yours.${
          myWords.length > 0 ? ` Their words: ${myWords.join(' · ')}` : ''
        }`
      : null,
    persona.nextStepHint
      ? '- End every reply after an action with ONE concrete next step, on its own last line. One, never a menu, and never a question they already answered. When an ask card follows your message, the card is the next step — do not also write one.'
      : // 关掉「附一条下一步」：STABLE 里自看图那一句也会带下一步，这里压过它（后写的赢）。
        '- Do not suggest a next step at the end of a reply — not after an action, not after reviewing your own pictures. Say what happened and stop; they will tell you what comes next.',
    preference && preference.favoriteStyles.length > 0
      ? `- They usually like: ${preference.favoriteStyles.join(' · ')}`
      : null,
    preference && preference.rejectedStyles.length > 0
      ? `- They usually reject: ${preference.rejectedStyles.join(' · ')}`
      : null,
    preference && preference.commonNegativeTags.length > 0
      ? `- They usually keep out of the picture: ${preference.commonNegativeTags.join(' · ')}`
      : null,
    preference && preference.preferredAspectRatios.length > 0
      ? `- They usually shoot at: ${preference.preferredAspectRatios.join(' · ')}`
      : null,
  ].filter((line): line is string => line !== null)

  if (lines.length === 0) return ''

  return clamp(
    `\n\nABOUT THIS CREATOR — this is how you speak to them, not what you are allowed to do:\n${lines.join(
      '\n',
    )}`,
    PERSONA_LIMITS.maxCreatorSectionChars,
  )
}

export interface LoraPromptMaterial {
  sourceNotes: string[]
  negativeDiff: string[]
}

export const LORA_SOURCE_NOTE_TEXTS: Record<
  PromptAssistantResponseLanguage,
  {
    unknownFamily: string
    author: (name: string) => string
    sourceRecipe: (name: string) => string
    skeleton: (name: string, family: string) => string
    dialectFix: (family: string, why: string) => string
  }
> = {
  english: {
    unknownFamily: 'an unsettled base',
    author: (name) => `Available reference — author's prompt for "${name}"`,
    sourceRecipe: (name) =>
      `Available reference — source-image prompts for "${name}"`,
    skeleton: (name, family) =>
      `"${name}" has no author or source-image prompt; only the ${family} family skeleton is available`,
    dialectFix: (family, why) => `Fix for ${family}: ${why}`,
  },
  japanese: {
    unknownFamily: '未確定のベース',
    author: (name) => `参考資料：「${name}」の作者推奨プロンプト`,
    sourceRecipe: (name) => `参考資料：「${name}」の元画像プロンプト`,
    skeleton: (name, family) =>
      `「${name}」には作者推奨も元画像プロンプトもなく、${family} のひな形のみ参照できます`,
    dialectFix: (family, why) => `${family} 向けの修正：${why}`,
  },
  chinese: {
    unknownFamily: '尚未定下的底模',
    author: (name) => `可参考：《${name}》的作者推荐提示词`,
    sourceRecipe: (name) => `可参考：《${name}》的来源图提示词`,
    skeleton: (name, family) =>
      `《${name}》没有作者或来源图提示词，目前仅有家族骨架可参考（${family}）`,
    dialectFix: (family, why) => `${family} 的修正：${why}`,
  },
}

export function buildLoraPromptMaterial(
  run: OperatorRun,
  proposed: string,
): LoraPromptMaterial | null {
  if (!run.state.hasLoraControl) return null

  const texts =
    LORA_SOURCE_NOTE_TEXTS[resolveResponseLanguage(run.request, run.persona)]
  const family = run.state.loraBaseFamily
    ? normalizeToLoraBaseFamily(run.state.loraBaseFamily)
    : null
  const familyLabel = run.state.loraBaseFamily ?? texts.unknownFamily
  const notes: string[] = []

  run.state.loras
    .filter((item) => item.enabled && item.compatible)
    .slice(0, LIMITS.maxSourceNotes - 1)
    .forEach((mount) => {
      if (mount.recommendedPrompt) {
        notes.push(texts.author(mount.name))
      } else if (mount.sourcePrompts.length > 0) {
        notes.push(texts.sourceRecipe(mount.name))
      } else {
        notes.push(texts.skeleton(mount.name, familyLabel))
      }
    })

  /**
   * §7.4 方言纠错：判据是方言表的 `forbidden`，⛔ 不让模型自由发挥。命中就把
   * 修正放进**同一张确认卡**（⛔ 不另开一轮、⛔ 不静默替换）。
   */
  if (family) {
    const [hit] = findForbiddenDialectHits(family, proposed)
    if (hit) notes.push(texts.dialectFix(familyLabel, hit.why))
  }

  // CFG 1 的底模上负面词不起作用：⛔ 再催它补这一族的负面主力。
  const negativeInert = isLoraNegativeInert({
    baseId: run.state.modelId,
    cfg: run.state.loraParameters?.guidanceScale,
  })
  return {
    sourceNotes: notes.map((note) => clamp(note, LIMITS.maxSourceNoteChars)),
    negativeDiff:
      family && !negativeInert
        ? loraNegativeDiff(
            run.state.negativePrompt ?? '',
            LORA_PROMPT_DIALECTS[family].negative,
          )
        : [],
  }
}

/**
 * 这一族的负面主力里，用户负面框**还没有**的那几个（§7.3）。
 *
 * ⚠ 去重口径沿用 `mergeNegativePrompt`，⛔ 不在这里另写一套归一：两套归一的
 * 表现是卡上说「补 3 个词」而写进去只多了 2 个。
 */
export function loraNegativeDiff(
  current: string,
  recommended: readonly string[],
): string[] {
  if (recommended.length === 0) return []
  const normalize = (tag: string) =>
    tag.trim().toLowerCase().replace(/\s+/g, ' ')
  const existing = new Set(current.split(',').map(normalize).filter(Boolean))
  return mergeNegativePrompt(current, recommended.join(', '))
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag && !existing.has(normalize(tag)))
    .slice(0, LIMITS.maxNegativeDiffTags)
}

/**
 * 取材标注进**没有确认卡那一支**的观察（§7.2 的 ⚠）——提示词框是空的时候不出
 * 覆盖三选，同一份出处由模型在正文里复述。⛔ 不为了「让卡出现」伪造一次确认。
 */
export function loraMaterialObservation(
  material: LoraPromptMaterial | null,
): string {
  if (!material) return ''
  const parts: string[] = []
  if (material.sourceNotes.length > 0) {
    parts.push(
      ` Available LoRA reference material: ${material.sourceNotes.join(
        ' / ',
      )}. These labels describe available evidence, not proof that the proposed text used it. Explain which details you actually used.`,
    )
  }
  if (material.negativeDiff.length > 0) {
    parts.push(
      ` This base family's negative staples are still missing from the negative box: ${material.negativeDiff.join(
        ', ',
      )}. Offer set_negative in this same turn with those ADDED to what the creator already wrote — never replacing it.`,
    )
  }
  return parts.join('')
}

export function latestUserMessage(request: AssistantOperatorRequest): string {
  return (
    [...request.messages].reverse().find((message) => message.role === 'user')
      ?.content ?? ''
  )
}

export function currentConversationReferences(
  run: OperatorRun,
): { imageIndex: number; url: string }[] {
  if (
    run.request.domain !== 'image' &&
    run.request.domain !== 'lora' &&
    run.request.domain !== 'canvas'
  )
    return []
  const latest =
    run.request.messages.findLast((message) => message.role === 'user')
      ?.content ?? ''
  const explicit = getReferenceMentionIndices(
    normalizeReferenceMentions(
      latest,
      run.state.canvas?.shots.flatMap((shot) =>
        shot.expanded ? shot.nodes : [],
      ),
    ),
  )
  const indices = explicit.length
    ? explicit
    : run.state.referenceUrls.flatMap((url, imageIndex) =>
        run.request.mentionedAssets?.some((asset) => asset.url === url)
          ? [imageIndex]
          : [],
      )
  return indices.flatMap((imageIndex) => {
    const url = run.state.referenceUrls[imageIndex]
    return url && /^https?:\/\//.test(url) ? [{ imageIndex, url }] : []
  })
}

/**
 * 这轮创作者 `@` 了哪些图。有点名时，分析只准碰这些；没点名才是「看全部挂着的」。
 */
/** 当前视频模型的显示名（快照标签是「型号 · 渠道 · 积分」，只取型号）。 */
export function videoModelName(run: OperatorRun): string {
  const label = run.request.snapshot.model?.label ?? run.state.modelId ?? ''
  return label.split(' · ')[0]?.trim() || label
}

/**
 * 视频档素材轨上的图，与左栏同序：首帧 · 尾帧 · 参考图（`lib/studio/video-workbench-slots`
 * 的 `listStudioVideoImages` 同一条顺序）。`null` = 参考图还在上传。
 */
export function videoRailImages(
  state: OperatorWorkingState,
): { url: string | null; role: 'first' | 'last' | 'reference' }[] {
  return [
    ...(state.frameFirstUrl
      ? [{ url: state.frameFirstUrl, role: 'first' as const }]
      : []),
    ...(state.frameLastUrl
      ? [{ url: state.frameLastUrl, role: 'last' as const }]
      : []),
    ...state.referenceUrls.map((url) => ({ url, role: 'reference' as const })),
  ]
}

/** 「看参考图」看哪几张：视频档是整条素材轨，其余域就是参考图列表。 */
export function analysisImageUrls(run: OperatorRun): (string | null)[] {
  return run.request.domain === ASSISTANT_PROTOCOL_DOMAIN_IDS.video
    ? videoRailImages(run.state).map((image) => image.url)
    : run.state.referenceUrls
}

export function resolveAnalyzeImageIndices(
  run: OperatorRun,
  requested?: number[],
): { ok: true; indices: number[] } | { ok: false; detail: string } {
  const urls = analysisImageUrls(run)
  // ⚠ 视频档按素材轨编号走（首尾帧在前），对话里 @ImageN 的下标说的是参考图列表 —— 不混用。
  const pointed =
    run.request.domain === ASSISTANT_PROTOCOL_DOMAIN_IDS.video
      ? []
      : currentConversationReferences(run).map((ref) => ref.imageIndex)
  const fallback = pointed.length ? pointed : urls.map((_, index) => index)
  const indices = requested?.length ? requested : fallback
  if (
    new Set(indices).size !== indices.length ||
    indices.some((index) => index < 0 || index >= urls.length)
  ) {
    return {
      ok: false,
      detail:
        'Select only current mounted reference indices; @Image3 means imageIndices: [2].',
    }
  }
  if (pointed.length && indices.some((index) => !pointed.includes(index))) {
    return {
      ok: false,
      detail: `The creator @-mentioned ${pointed
        .map((index) => `@Image${index + 1}`)
        .join(
          ', ',
        )} this turn. Analyze only those; do not inspect other mounted references.`,
    }
  }
  return { ok: true, indices }
}

export function requiredReferenceIndices(
  run: OperatorRun,
  promptValue: string,
): number[] {
  const fromPrompt = getReferenceMentionIndices(
    normalizeReferenceMentions(
      promptValue,
      run.state.canvas?.shots.flatMap((shot) =>
        shot.expanded ? shot.nodes : [],
      ),
    ),
  )
  const pointed = currentConversationReferences(run).map(
    (ref) => ref.imageIndex,
  )
  const needed = [...new Set([...fromPrompt, ...pointed])]
  if (needed.length) return needed
  return run.state.referenceUrls.flatMap((url, index) =>
    url && /^https?:\/\//.test(url) ? [index] : [],
  )
}

export function profilesCoverIndices(
  profiles: readonly ReferenceVisualProfile[],
  urls: readonly (string | null)[],
  indices: readonly number[],
): boolean {
  return indices.every((index) => {
    const url = urls[index]
    return Boolean(
      url &&
      profiles.some(
        (profile) =>
          profile.url === url && hasCompleteReferenceVisualEvidence(profile),
      ),
    )
  })
}

export function hasVisualEvidence(
  run: OperatorRun,
  indices: readonly number[],
): boolean {
  const profiles =
    run.referenceAnalysis?.profiles ?? run.request.referenceProfiles ?? []
  return profilesCoverIndices(profiles, run.state.referenceUrls, indices)
}

export const OPERATOR_CONTEXT_COMPACTION_TARGET_LENGTH = 24_000

/**
 * 对话原文进提示词的那一段，**平时也封顶**（owner 2026-10-07 拍板「自动压缩」）。
 *
 * 此前只有 provider 报「超长」才压缩一次，长会话每一步都把整段原文重发 ——
 * Gemini 思考变长、首字晚到，生产上连续 90s 超时。超出上限时最近的原文照留，
 * 更早的走抽取式摘要；已定的事由每轮结论另行注入（`buildRoundMemorySection`），
 * ⛔ 不靠旧原文记住。
 */
export function operatorConversation(
  messages: AssistantOperatorRequest['messages'],
  budget?: number,
): string {
  return buildAssistantConversation(
    messages,
    Math.min(
      budget ?? LIMITS.maxConversationChars,
      LIMITS.maxConversationChars,
    ),
  )
}

/**
 * 同一会话、同一用途的调用共用一把缓存键（OpenAI `prompt_cache_key`）：它们前缀相同
 * （同一份系统提示 + 同一段对话），路由到同一处缓存才命中得了（2026-10-09 一天实测：
 * 输入只有 15% 走缓存）。⚠ 只发哈希，⛔ 不把用户 id 交给 provider。
 */
export function operatorCacheKey(run: OperatorRun, purpose: string): string {
  /**
   * ⚠ 工作台在前、会话在后：一轮的第一次请求还没有会话 id，接力那次才有 ——
   *   键一变就分到另一台缓存上，接力第一步整段重算（2026-10-09 v3 回放：接力首步
   *   缓存全是 0）。
   */
  const scope =
    run.request.workspaceKey ?? run.request.conversationId ?? run.request.domain
  const digest = createHash('sha256')
    .update(`${run.userId}|${scope}`)
    .digest('hex')
    .slice(0, 24)
  return `${purpose}:${digest}`
}

/**
 * 剥掉围栏，把模型这一轮的输出还原成候选 JSON 串。
 * `responseFormat:'json_object'` 只在部分 provider 上是硬保证，剩下那些照样会给你
 * 包一层 ```json —— 这十行是那一档的代价。
 */
export function jsonCandidates(raw: string): string[] {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  return [
    fenced?.[1]?.trim(),
    trimmed,
    trimmed.match(/\{[\s\S]*\}/)?.[0],
  ].filter((candidate): candidate is string => Boolean(candidate))
}
