'use client'

/**
 * 操作员面板的**驱动 hook**：快照 → 流 → 应用 op → 登记簿。
 *
 * ── 它与 `use-studio-assistant-panel-inputs.ts` 的关系 ──────────────
 * 那份服务的是旧面板（文本流 + `[[…]]` 标记 + 写回适配器），这份服务的是工具环。
 * 两者**并存**：P4 之前视频/音频仍走旧面板。⛔ 别把这份塞进那份 —— 那份的
 * `writeback` 是「一条建议加一个应用按钮」的形状，而这里的 op 是**已经落地**的
 * 改动加一条撤销的本钱，形状根本不同。
 *
 * ── 快照的一条硬规矩（P1 交接的第 ② 条）──────────────────────────
 * **按当前模态判断控件在不在，缺席就整个键不给。** 填空串等于告诉助手「有这个
 * 框」，于是它会去写一个写不进去的字段（2026-08-22 真机实证）。拍板 19「助手只
 * 动用户看得见的旋钮」就是靠这条落地的，台账 BJ（参考强度没有控件）也由此自动
 * 兜住 —— 那条工具压根不在工具表里。
 *
 * ── 打断 / 就地确认走同一条机制（拍板 3 / 13）────────────────────
 * 服务端没有会话态：`ask` / `confirm` 之后流就结束，续跑 = 带 `confirmations`
 * 重发；插话 = abort + 带新消息重发。所以这里只需要一个 `AbortController` 和一份
 * 「刚才做过什么」（从线程条目现算，见 `buildPriorSteps`）。
 *
 * ── ⭐ 本片（切片 2b）：**排队 ≠ Stop**（§3.1 ㉒–㉕）───────────────
 * 拍板 13 的「插话即转向」此前落成了「`send()` 干活时直接 abort 重发」，代价是
 * 用户想补一句「顺便把比例改成 3:4」会把正在跑的三步整个掐掉从头再来 —— 他付了
 * 三步的钱，看到的是同样三步再跑一遍。现在拆成两件事：
 *  · **排队**（默认）—— 消息进 `state.queue`，输入框上方出排队条；到**下一个
 *    工具步跑完**的那个停顿点才 abort + 带 `priorSteps` 重发。已经跑完的步在
 *    `priorSteps` 里，所以助手不会重做它们（服务端仍然零会话态，一行没改）。
 *  · **⏹ Stop**（显式）—— 才是中断：abort、清计划数、清队列、插一行系统行。
 * ⚠ 停顿点取的是「一步**跑完**」而不是「一步开始」：`running` 的步会被
 * `buildPriorSteps` 跳过（它还没有结论），在那一刻掐掉等于把这一步的工作丢了，
 * 而助手下一轮会把它原样再做一遍。
 */

import { flushSync } from 'react-dom'
import { useCallback, useEffect, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  GENERATION_REVIEW_STATE_IDS,
  isAssistantOperatorToolInDomain,
  type AssistantOperatorConfirmChoice,
  type AssistantOperatorDomain,
} from '@/constants/assistant-operator'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { CONTEXT_CARD_STATUS_IDS } from '@/constants/context-cards'
import {
  STUDIO_OPERATOR_CONFIRM_STATUS_IDS,
  STUDIO_OPERATOR_STREAMING,
  type StudioOperatorGenerateKnob,
} from '@/constants/studio-assistant-operator'
import { useStudioOperatorHost } from '@/contexts/studio-operator-host'
import {
  addOperatorMention,
  appendOperatorEntry,
  appendOperatorPendingResult,
  appendOperatorPending,
  appendOperatorRoundSummary,
  clearOperatorPrompts,
  clearOperatorQueue,
  dropOperatorPending,
  enqueueOperatorMessage,
  finalizeOperatorMessage,
  getOperatorReviewState,
  getOperatorState,
  nextOperatorEntryId,
  operatorStepEntryId,
  recordOperatorChange,
  removeOperatorQueued,
  resetOperatorThread,
  resolveOperatorConfirm,
  setOperatorCapturingFrames,
  setOperatorConfirm,
  setOperatorQuestion,
  clearOperatorResumePlan,
  markOperatorResumeStep,
  setOperatorPlannedSteps,
  startOperatorResumePlan,
  setOperatorStatus,
  switchOperatorDomain,
  takeOperatorQueue,
  upsertOperatorStep,
  setOperatorStepCheckpoint,
} from '@/hooks/use-studio-operator-store'
import { getGenerationErrorMessage } from '@/lib/api-error-message'
import { collectStepArtifacts } from '@/lib/studio-operator-memory'
import { captureVideoEndpointFrames } from '@/lib/video-frame-capture'
import { streamAssistantOperatorAPI } from '@/lib/api-client/assistant-operator'
/** ⚠ Hard Rule 3：写库走 api-client，⛔ 组件与 hook 里不 `fetch`。 */
import {
  createContextCardAPI,
  deleteContextCardAPI,
  updateContextCardAPI,
} from '@/lib/api-client/context-cards'
import {
  applyOperatorStep,
  buildGenerationKnobSteps,
  describeOperatorInverse,
} from '@/lib/studio-operator-apply'
import {
  historyToOperatorMessages,
  historyToPriorSteps,
  readOperatorReferenceProfiles,
} from '@/lib/studio-operator-history'
import {
  firstUnfinishedStepId,
  hasUnfinishedSteps,
  toResumeFrom,
} from '@/lib/studio-operator-resume'
import type { PromptAssistantResponseLanguage } from '@/types'
import type {
  AssistantOperatorConfirmDecision,
  AssistantOperatorContextCardDraft,
  AssistantOperatorGenerationRequest,
  AssistantOperatorMessage,
  AssistantOperatorPlanAnswer,
  AssistantOperatorResumeFrom,
  AssistantOperatorPriorStep,
  AssistantOperatorRequest,
  AssistantOperatorResult,
} from '@/types/assistant-operator'
import type {
  StudioOperatorAttachment,
  StudioOperatorQuestionAnswer,
  StudioOperatorThreadEntry,
} from '@/types/studio-assistant-operator'

/**
 * **操作员自己那几个码** → `StudioOperator.error.*` 的词表键。
 *
 * ⭐ 由来（2026-09-06 真机）：zh 界面上助手失败时显示的是英文原文
 * 「The assistant operator run failed midway.」——那句话是**服务端**成帧器的兜底
 * （`lib/assistant-operator-stream.ts` 的 `ASSISTANT_OPERATOR_FALLBACK_ERROR`），
 * 服务端不知道用户的界面语言，也不该知道。所以翻译发生在这里：服务端只负责给
 * 一个**稳定的码**，客户端按码取三语文案。
 *
 * ⚠ 这张表**只收操作员自己的码**（路由与成帧器发的那几个）。provider 侧的
 * `GenerationError` 码不进来 —— 它们的三语文案早就在 `Errors.generation.*` 里
 * （`constants/generation-errors.i18n.test.ts` 逐码把关），本 hook 走
 * `getGenerationErrorMessage` 复用那一条现成的阶梯（顺带白拿 `i18nKey` 这一档）。
 * ⛔ 别在这里给 `invalid_api_key` 一类再抄一份文案：两处迟早说两句不一样的话。
 * ⚠ 这张表住在这里而不是 `src/constants/`：它是**这一颗 hook 的展示层映射**
 * （码 → 词表键），没有第二个消费方。
 */
const OPERATOR_ERROR_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  ASSISTANT_OPERATOR_FAILED: 'failed',
  EMPTY_STREAM: 'emptyStream',
  UNAUTHORIZED: 'unauthorized',
  RATE_LIMIT_EXCEEDED: 'rateLimited',
  VALIDATION_ERROR: 'invalidRequest',
}

function toResponseLanguage(locale: string): PromptAssistantResponseLanguage {
  if (locale === 'zh') return 'chinese'
  if (locale === 'ja') return 'japanese'
  return 'english'
}

/**
 * 线程条目 → 请求里的对话。
 *
 * ⚠ 系统行 / 日志条 / 计划条**不进对话**：它们是 UI 的东西，助手那边靠
 * `priorSteps` 知道自己做过什么。把日志也塞进对话等于把同一件事说两遍，
 * 而每一步都是一次 LLM 往返，重复的上下文直接变成账单。
 */
function buildMessages(
  entries: readonly StudioOperatorThreadEntry[],
): AssistantOperatorMessage[] {
  const messages: AssistantOperatorMessage[] = []
  for (const entry of entries) {
    if (entry.kind === 'user') {
      const attachmentNote =
        entry.attachments.length > 0
          ? // ⭐ 名字写在最前（切片 N1）：模型要用 `图_012` 指认这一张，而不是
            //   念一串它会抄错、用户也核对不了的地址。地址仍然带着 —— 视觉线
            //   与 `critique_result` 的目标匹配都还认它。
            `\n[attached: ${entry.attachments
              .map(
                (attachment) =>
                  `${attachment.label} (${attachment.kind}) ${attachment.url}`,
              )
              .join(', ')}]`
          : ''
      messages.push({ role: 'user', content: `${entry.text}${attachmentNote}` })
    } else if (entry.kind === 'message') {
      messages.push({ role: 'assistant', content: entry.text })
    } else if (entry.kind === 'system' && entry.code === 'checkpointRestored') {
      messages.push({
        role: 'assistant',
        content:
          '[Workspace event: the creator restored a configuration checkpoint. Use the current form snapshot; earlier tool settings are historical.]',
      })
    }
  }
  return messages
}

/**
 * 「刚才做过什么」—— **从线程现算，不另存一份**。
 *
 * ⭐ 被撤销的那几步照样带上去，状态标 `error` 并在摘要里说明是用户撤的
 * （拍板 18 的「助手已知晓，下一轮不再重做」）。漏掉它们的表现是：用户撤销了
 * 换模型，助手下一轮又换回去。
 */
function buildPriorSteps(
  entries: readonly StudioOperatorThreadEntry[],
  /** 载回来的历史里那些步（P4-B）—— 排在本次会话的前面。 */
  fromHistory: AssistantOperatorPriorStep[] = [],
): AssistantOperatorPriorStep[] {
  const steps: AssistantOperatorPriorStep[] = [...fromHistory]
  for (const entry of entries) {
    if (entry.kind === 'system' && entry.code === 'checkpointRestored')
      steps.length = 0
    if (entry.kind !== 'step') continue
    if (entry.step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.running) {
      continue
    }
    const summary = entry.undone
      ? `The creator UNDID this — do not redo it. (${entry.step.title})`
      : entry.step.title
    steps.push({
      tool: entry.step.tool,
      status: entry.undone
        ? ASSISTANT_OPERATOR_STEP_STATUS_IDS.error
        : entry.step.status,
      summary: summary.slice(
        0,
        ASSISTANT_OPERATOR_LIMITS.maxPriorStepSummaryChars,
      ),
    })
  }
  return steps.slice(-ASSISTANT_OPERATOR_LIMITS.maxPriorSteps)
}

/**
 * 用户这一轮 `@` 上来的那几张图 —— **只取最后一条用户消息上的**。
 *
 * ⭐ 判据是「这一轮他指着说的是哪几张」：把整条线程里所有附件都端上去，助手会
 * 拿三轮之前那张图去回答现在这句话，而 `targetIds` 的准入名单也会一路膨胀 ——
 * 「@ 指定任意图可看」（拍板 4 推翻）随即退化成「历史上出现过的都能看」。
 * ⚠ 只收图：视频 / 音频 / 3D 那条视觉线吃不下（`vision-route.service.ts` 头注），
 * 端上去只会换来一份格式完整、内容全编的评价。
 */
/** 最后那条用户消息挂了什么（`@` 与 📎 是同一条 chip 管线，见附件类型头注）。 */
function lastUserAttachments(
  entries: readonly StudioOperatorThreadEntry[],
): readonly StudioOperatorAttachment[] {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry?.kind !== 'user') continue
    return entry.attachments
  }
  return []
}

/**
 * `critique_result.targetIds` 的**准入名单**（§7）。
 *
 * ⚠ **视频档也进名单，但只在视频域**（第二期最后一环）：视频域的评审吃的是客户端
 * 抽好的三帧，所以「用户 `@` 的那段片子」必须是服务端认得的目标。图片域一个字不改
 * —— 那边的视觉线吃的是一张静态图，放一条 mp4 进名单就等于允许它把视频地址当图看，
 * 而那正是 `vision-route.service.ts` 头注里「格式完整、内容全编」的那条路。
 */
function buildMentionedAssets(
  entries: readonly StudioOperatorThreadEntry[],
  domain: AssistantOperatorDomain,
): NonNullable<AssistantOperatorRequest['mentionedAssets']> {
  const isVideoDomain = domain === ASSISTANT_PROTOCOL_DOMAIN_IDS.video
  return lastUserAttachments(entries)
    .filter(
      (attachment) =>
        attachment.kind === 'image' ||
        (isVideoDomain && attachment.kind === 'video'),
    )
    .slice(0, ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences)
    .map((attachment) => {
      /**
       * ⭐ **审核态随名单一起上去**（切片 Y）——它只是替服务端省一次查库：
       * 真正说了算的是服务端自己从库里读到的那一位（见契约里 `reviewState`
       * 的头注）。⛔ 客户端不拿它当闸，也不因为 `blocked` 就把这一条从名单里
       * 摘掉：用户指着一张被否的图问「这张哪里不行」是完全正当的一句话。
       * ⚠ `pending` **不带**：缺席就是 pending，写出来只是让每条请求都胖一点。
       */
      const reviewState = getOperatorReviewState(attachment.id)
      return {
        id: attachment.id,
        url: attachment.url,
        label: attachment.label,
        /**
         * ⭐ **真序号随名单一起上去**（切片 N1 收口）：服务端 `matchMentionedByName`
         * 按 `seq === token.serial` 精确比，正文里那句 `@图_012` 全靠它落到这一条。
         * ⚠ 缺席就缺席（存量行 / 上传来的行）—— 那一条于是不会被 `@序号` 命中，
         * ⛔ 不从 id 派生一个补上。
         */
        ...(typeof attachment.seq === 'number' ? { seq: attachment.seq } : {}),
        ...(reviewState === GENERATION_REVIEW_STATE_IDS.pending
          ? {}
          : { reviewState }),
      }
    })
}

/**
 * 这一轮**要不要抽帧、抽哪一段**（第二期最后一环）。
 *
 * ── 为什么客户端得先决定，而不是等模型说 ────────────────────────────
 * 服务端 `critique_result` 的第二条闸是 `videoFrames.sourceUrl` 必须与它挑中的
 * 目标**逐字相同**（对不上按 `unknownAsset` 拒）。帧只能在浏览器里抽
 * （`lib/video-frame-capture.ts` 的选型头注），而抽帧发生在请求**发出去之前**
 * —— 那一刻模型还一个字都没写。所以目标由客户端按同一条优先级预判：
 *  ① 助手自己 primed 的那一枪刚回来（`result`）—— 服务端没有 `targetIds` 时挑的
 *    就是它，两边因此必然对齐；
 *  ② 否则取用户这一轮 `@` 的那段片子。
 * ⛔ 两条都没有就**不抽**：抽一段没人要看的片子是白烧几秒解码 + 一份 payload。
 *
 * ⚠ 只在视频域触发。图片域一字不改 —— 那边的目标本来就是静态图。
 */
function resolveVideoCritiqueSource(
  domain: AssistantOperatorDomain,
  primedResult: AssistantOperatorResult | null,
  entries: readonly StudioOperatorThreadEntry[],
): string | null {
  if (domain !== ASSISTANT_PROTOCOL_DOMAIN_IDS.video) return null
  if (primedResult) return primedResult.url
  return (
    lastUserAttachments(entries).find(
      (attachment) => attachment.kind === 'video',
    )?.url ?? null
  )
}

/**
 * **提议一到就写成一行「待确认」**（v2 §8.1，owner 2026-09-11）。
 *
 * ⭐ 为什么客户端写而不是服务端写：写库这一跳必须**长在用户那一侧**——服务端
 * 自己落库等于助手能直接写用户的长期记忆；而用户当场没点、事后想在设置里补点，
 * 前提是那张卡还在。这两条只有「客户端收到提议就写一行 `proposed`」同时满足。
 * ⚠ 待确认那一档**不进系统提示、也不进 `list_context_cards`**（服务端默认只列
 * 已确认的），所以这一行不会变成模型的自引用回路。
 * ⚠ 失败**不阻塞卡**：卡照旧可存可弃 —— 那时 `cardId` 缺席，「存这张卡」回落成
 * `create confirmed`。⛔ 不为此在时间线上报错：用户什么都还没点。
 * ⚠ 幂等靠**调用点**：一帧 `confirm` 只调它一次，`entryId` 只用来认「回来的时候
 * 卡还是不是那一张」。人比请求快时（已存 / 已弃 / 已被顶掉）这一行是孤儿，
 * ⛔ 不能留在设置的待确认区里 —— 就地删掉。
 */
async function persistProposedContextCard(
  entryId: string,
  card: AssistantOperatorContextCardDraft,
): Promise<void> {
  const result = await createContextCardAPI({
    kind: card.kind,
    name: card.name,
    summary: card.summary,
    body: card.body,
    ...(card.negative ? { negative: card.negative } : {}),
    /** ⚠ 新卡不常挂到任何域：挂哪儿是用户的决定（设置里那颗开关）。 */
    pinnedScopes: [],
    status: CONTEXT_CARD_STATUS_IDS.proposed,
  })
  if (!result.success) return
  const live = getOperatorState().confirm
  if (
    !live ||
    live.id !== entryId ||
    live.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard ||
    live.status !== STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
  ) {
    void deleteContextCardAPI(result.data.id)
    return
  }
  setOperatorConfirm({ ...live, cardId: result.data.id })
}

/** 跑一轮时那几样「带上下文重发」的东西（拍板 3 / §2.6 / §6 共用一条通道）。 */
interface RunOptions {
  confirmations?: AssistantOperatorConfirmDecision[]
  /** 反问卡那一份答复（`{questionId, optionIds, otherText}`）。 */
  planAnswers?: AssistantOperatorPlanAnswer[]
  planApproved?: boolean
  /**
   * **断点续跑**（第三期）—— 从上一份没跑完的计划接着跑。
   *
   * ⚠ 带着它的那一轮**不重新落一份续跑记录**：那份记录里已经记着前几步做完了，
   * 重新落等于把它们抹掉，于是第二次中断之后又要从头开始。
   */
  resumeFrom?: AssistantOperatorResumeFrom
}

export interface UseAssistantOperatorResult {
  domain: AssistantOperatorDomain
  /**
   * 说一句。
   *
   * ⚠ **干活时不再 abort**（本片改口）：那一句进队列，等下一个工具步边界。
   * 排队条上的「撤回」走 `cancelQueued`，真要掐掉走 `stop()`。
   */
  send(text: string, attachments?: readonly StudioOperatorAttachment[]): void
  /** ⏹ —— 彻底叫停（拍板 13）。**连队列一起清**：叫停的是「接下来的一切」。 */
  stop(): void
  /** 撤回一条还没轮到的排队消息（§3.1 ㉔）—— 丢弃不发，线程里留一行交代。 */
  cancelQueued(id: string): void
  /**
   * **问题卡答复**（§3.4）—— 一次一道题；卡消失，时间线落一行「你选了 X」。
   *
   * ⚠ `label` 由面板给（i18n 在那一层）；`asset` / `choice` 决定走哪条回执通道。
   */
  answerQuestion(
    answer: StudioOperatorQuestionAnswer,
    options: {
      label: string
      asset?: StudioOperatorAttachment
      choice?: AssistantOperatorConfirmChoice
    },
  ): void
  /** 多步确认卡「开始」（§3.3）—— 带 `planApproved` 重发。 */
  approvePlan(): void
  /** 多步确认卡「一步一步来」—— ⛔ 不发请求，只记下「下一条消息是改计划」。 */
  declinePlan(): void
  /** 计划「修改」（§3.1 ⑤）—— ⛔ 不发请求，只记下「下一条消息是改计划」。 */
  revisePlan(): void
  /**
   * **从断点接着跑**（第三期）—— 检查点卡 / 头部那颗「从第 N 步继续」。
   *
   * ⚠ ⛔ **不重新弹确认卡**：那份计划当初就是用户批过的（`planApproved: true`
   * 沿用）。但**生成那一步照常走 `confirm` 确认** —— 续跑不是免检通道
   * （owner 2026-09-07 定）。
   * ⚠ 没有未完成的计划时是 no-op：那颗按钮本来就不该在。
   */
  resumePlan(): void
  /**
   * **生成确认卡上就地改一颗旋钮**（v2 §5.2 第二行，commit #9）。
   *
   * ⭐ **立刻写回工作台**，走的是助手改参数那同一条 op 通道（`applyOperatorStep`
   * + 登记簿 + `inverse`）—— ⛔ 卡自己不攒参数。理由是 §5.2 那段「为什么卡上改
   * 立刻写回」：卡攒一份的话，用户点确认前看着 3:2、出来的是 16:9。
   * ⚠ 宿主没给 `generationControls` 时是 no-op（卡上那几颗本来就是只读读数）。
   * @returns 换模型顺手回落掉的那几颗（卡上「已按 X 调整」写它），没有就是空数组。
   */
  adjustGeneration(
    knob: StudioOperatorGenerateKnob,
    value: string,
  ): readonly StudioOperatorGenerateKnob[]
  /** 生成确认卡「确认生成」（§5）—— **客户端扣扳机**，⛔ 不重发一轮。 */
  confirmGeneration(): void
  /** 生成确认卡「先不要」—— 流已经停了，只把卡转「已取消」。 */
  cancelGeneration(): void
  /**
   * 上下文卡确认卡「存这张卡」（§8.1）—— 把那一行 `proposed` 翻成 `confirmed`
   * （提议到达时已写；那一跳失败过就回落成新建一行 `confirmed`）。
   *
   * ⚠ 写库这条链一整条都在**客户端**：服务端提议那一步一行都没写。
   */
  saveContextCard(): Promise<void>
  /** 上下文卡确认卡「不用」—— 卡收成已取消，那一行 `proposed` 真删。 */
  dismissContextCard(): Promise<void>
  /** 「已取消」那一态上的「再来一次」—— 摆一张新的 `idle` 卡。 */
  retryGeneration(): void
  /**
   * 结果卡上的**「再来一组」**（v2 §6.2）—— 参数原样，直接出一张新的生成确认卡。
   *
   * ⚠ ⛔ 不直接扣扳机：花钱这件事只有确认卡一个入口（见实现处头注）。
   */
  rerunGeneration(request: AssistantOperatorGenerationRequest): void
  /**
   * 它备的那一枪回来了 —— 投回线程并自动请一轮评价（P3-C，拍板 4）。
   *
   * ⚠ 调用方是 `use-studio-operator-critique.ts`，而**判据在那条链上**：
   * 这里收到什么就评什么。用户自己发的生成压根走不到这个入口。
   */
  critique(result: AssistantOperatorResult): void
  /**
   * ＋新对话（拍板 10）—— 只清线程，改动与撤销本钱留着。
   * ⚠ 撤销 / 还原**不在这个接口里**：它们有两个宿主（日志条 + 参数栏的 ✦），
   *   住在 `use-studio-operator-revert.ts` 里，两边各自取用同一份。
   */
  newThread(): void
}

export function useAssistantOperator(): UseAssistantOperatorResult {
  /**
   * ⭐ **表单从宿主读、往宿主写**（P4-C）：工作台与 LoRA 装配台各给一份同形状的
   * 东西（`contexts/studio-operator-host.tsx`）。此前这里直接 `useStudioForm()`，
   * 而 `/studio/lora` 故意不挂 `<StudioProvider>` —— 那条路上这个 hook 会直接抛。
   */
  const host = useStudioOperatorHost()
  const { domain, buildSnapshot, checkpoints, setOpen } = host
  const applyContext = host.apply
  const locale = useLocale()
  const tError = useTranslations('StudioOperator.error')
  /** 卡上就地改参数那几条 step 的文案（§5.2 第二行）—— i18n 只能在 React 层拿。 */
  const tConfirm = useTranslations('StudioOperator.confirm')
  const tErrors = useTranslations('Errors')
  /**
   * 一句给用户看的失败文案（见 `OPERATOR_ERROR_MESSAGE_KEYS` 头注）。
   *
   * 三级阶梯：操作员自己的码 → `getGenerationErrorMessage`（`i18nKey` →
   * `Errors.generation.{码}`）→ **原文**。
   * ⛔ 最后那一级不吞成一句「出错了」：原文里常有 provider 给的具体理由，
   * 吞掉它等于让用户和我们都失去唯一的线索。
   */
  const describeError = useCallback(
    (payload: {
      error: string
      errorCode?: string
      i18nKey?: string
    }): string => {
      const key = payload.errorCode
        ? OPERATOR_ERROR_MESSAGE_KEYS[payload.errorCode]
        : undefined
      if (key) return tError(key)
      return getGenerationErrorMessage(tErrors, payload, payload.error)
    },
    [tError, tErrors],
  )

  const abortRef = useRef<AbortController | null>(null)
  /**
   * 「它备的那一枪刚回来的那张图」（P3-C）。
   *
   * ⭐ 作用域是有意收窄的：`critique()` 放进来、`send()` 清掉。
   *  · **续跑（就地确认）保留它** —— 那还是同一轮，图还该在。
   *  · **用户开口就清掉** —— 不然此后每一轮请求都驮着这张图（每一步都是一次
   *    LLM 往返，图是最贵的那部分），而且助手会一直以为自己还在看那一张。
   *  ⚠ 走 ref 不走 state：它只在事件处理器里被读，进 state 只会多一次重渲染。
   */
  const pendingResultRef = useRef<AssistantOperatorResult | null>(null)
  /**
   * 「下一条消息是一次改计划」（§3.1 ⑤）。
   *
   * ⚠ 走 ref 不走 state：它只在 `send()` 里被读一次然后清掉，进 state 只会多一次
   * 重渲染。⚠ **一次性**：改完计划那一轮之后它就不再是「改计划」了，留着的表现是
   * 此后每一条消息都在要求助手重新规划。
   */
  const reviseRef = useRef(false)

  /**
   * 切模态 = 切域（拍板 8：**换工具，不断会话**）。
   *
   * 三件事，每一件都有具体的失败面：
   *  ① **掐掉在飞的那一轮** —— 它读的是切走之前那份表单，继续跑下去会把上一个域
   *    的结论应用到这个域的表单上（而线程里看起来一切正常）。
   *  ② **扔掉那张待评的结果图** —— 它属于上一个域；带着它跑，助手会在视频档
   *    对着一张图说话。
   *  ③ **状态回 idle** —— 流停在「等你选覆写」时切走，条子留在上一个域的槽里
   *    （`confirm` 是分槽的），而全局状态若还写着 awaitingConfirm，胶囊会一直
   *    显示「等你回答」，却没有任何地方能回答。
   * 域标记与 `domain` 由 `switchOperatorDomain` 在同一次写入里落地。
   */
  useEffect(() => {
    if (getOperatorState().domain === domain) return
    abortRef.current?.abort()
    abortRef.current = null
    pendingResultRef.current = null
    /**
     * ④ **三张「等你定」的卡也一起扔**（切片 3a）：它们属于上一个域那一轮。
     * 留着的表现最贵的是花钱卡 —— 它上面写的模型 / 张数来自切走之前那份表单，
     * 在新域里点「生成」发出去的是一枪谁也没确认过的东西。
     */
    clearOperatorPrompts()
    if (getOperatorState().status !== 'idle') setOperatorStatus('idle')
    switchOperatorDomain(domain)
  }, [domain])

  /**
   * 「再跑一轮」的自引用口。
   *
   * ⚠ 走 latest-ref 而不是在 `run` 里直接调 `run`：那样 `useCallback` 的依赖表
   * 里要写它自己，是个解不开的环。停顿点接住排队消息之后要立刻起下一轮，
   * 而那一刻正在 `run` 的 `for await` 里。
   */
  const runRef = useRef<((options?: RunOptions) => void) | null>(null)

  /**
   * 把排着的那些话接进线程（§3.1 ㉓）—— 返回「有没有接到」。
   *
   * ⭐ **一次接整队**：两句排在一起时用户的意思是「这两句一起说」，逐条接会让
   * 第二句再等一个停顿点（而那一步可能永远不来）。
   * ⚠ 先插一行系统行再插用户消息，顺序就是用户读到的顺序：「停顿点到了」→
   * 「你说的那句」。⛔ 反过来的话线程里会先冒出一句没头没脑的用户消息。
   */
  const flushQueue = useCallback((): boolean => {
    const queued = takeOperatorQueue()
    if (queued.length === 0) return false
    // 用户开口了 —— 那张待评的图不再随每一轮上传（同 `send()` 的理由）。
    pendingResultRef.current = null
    appendOperatorEntry({
      kind: 'system',
      id: nextOperatorEntryId('sys'),
      code: 'queuePicked',
      count: queued.length,
    })
    for (const item of queued) {
      appendOperatorEntry({
        kind: 'user',
        id: nextOperatorEntryId('user'),
        text: item.text,
        attachments: item.attachments,
      })
    }
    /**
     * 进度带的总步数当场 +N（§3.1 ㉓「进度带总步数 +1」）。
     * ⚠ 它只活到下一帧 `plan` 事件到达 —— 那一帧会用新计划的真步数整体覆盖。
     *   这里给的是**即时反馈**：不加的话，用户点完撤回/等到停顿点，进度带上
     *   什么都没变，看起来像排队条白排了。
     */
    setOperatorPlannedSteps(getOperatorState().plannedSteps + queued.length)
    return true
  }, [])

  /**
   * 跑一轮。
   *
   * `confirmations` 只在续跑时给（拍板 3）；`priorSteps` 每轮现算 —— 打断之后
   * 重发靠的就是它。
   */
  const run = useCallback(
    async (options: RunOptions = {}) => {
      const { confirmations, planAnswers, planApproved, resumeFrom } = options
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      /**
       * ⚠ ⛔ **不清确认卡**（v2 §3.2 进离场表）：它确认 / 取消之后就地换态留在
       * 时间线里，跑下一轮时抹掉它等于时间线上少了一段因果。此前这里清的是
       * 覆写三选那条子（已降级成问题卡），而问题卡由答复那一侧自己收。
       */
      setOperatorStatus('working')
      /**
       * ⚠ 这一轮的 token —— 服务端每轮都从 `step-1` 重新编号，线程却是跨轮累积
       * 的。没有它，第二轮的第一步会把第一轮的第一步原地顶掉并继承它的划线
       * （2026-08-30 真机实测）。见 `operatorStepEntryId` 的头注。
       */
      const runKey = nextOperatorEntryId('run')

      /**
       * ⭐ **发送即回显**（§4.1）—— 用户那一行由 `send()` 落，助手的**占位行**
       * 在这里落，就在请求发出去之前的同一帧。它是「它收到了」的唯一凭证：
       * 没有它，按下发送之后到第一步落地之间屏幕上什么都不长。
       *
       * ⚠ 占位行与正文**是同一条条目**：定稿帧直接往它里面写字（见
       * `appendOperatorPending` 的头注）。⛔ 别换条目，换条目 = 换 key = 重挂。
       * ⚠ 一轮里可能有好几段正文（旁白 + 收尾），所以 id 带序号 —— 但序号只在
       *   这一段**已经被别的条目压在下面**时才进位，见 `message` 那一支。
       */
      let messageSeq = 0
      const messageEntryId = () => `${runKey}:msg-${messageSeq}`
      appendOperatorPending(messageEntryId())

      /**
       * 攒着的那份计划（第 2 件）—— `plan` 帧到达时只存不落，由紧跟的
       * 多步确认帧判定去向。⚠ 判定之外还有两条出口：流以别的方式收尾
       * （服务端压根没摆确认卡）时也要把它落下去，⛔ 不能凭空吞掉一份计划。
       */
      let pendingPlanSteps: readonly string[] | null = null
      const flushPlanEntry = () => {
        if (!pendingPlanSteps) return
        const planId = nextOperatorEntryId('plan')
        appendOperatorEntry({
          kind: 'plan',
          id: planId,
          steps: pendingPlanSteps,
        })
        /**
         * ⭐ **续跑记录就落在这里**（第三期）：这一帧的含义正是「这份计划要开跑
         * 了」——出卡那一支根本走不到这儿（卡还钉着，一步都没开始），而不出卡与
         * 点过「开始」两条路都从这里过。⛔ 别改到 `approvePlan` 里去落：
         * 那样「步数不够、没出卡」的那一类多步计划一份记录都不会有。
         * ⚠ 续跑那一轮**不重落**：记录里前几步的 done 就是它存在的全部理由。
         */
        if (!resumeFrom) {
          startOperatorResumePlan({ planId, labels: pendingPlanSteps })
        }
        pendingPlanSteps = null
      }

      /**
       * ⭐ **收尾之前的那条占位行**（owner 2026-09-07）。
       *
       * 🔬 由来：最后一个工具步跑完到收尾正文第一个字之间实测可达数秒 —— 线程
       * 里一条活的助手行都没有，只有顶上的进度带在转，读起来像「它不打算说话了」。
       * ⚠ **不是一落定就挂**：连着跑的工具步之间常常只隔几十毫秒，那样会在每两步
       * 之间闪一行三点脉冲又被下一步的让位逻辑拆掉。所以挂的条件是「这一步落定
       * 之后 `pendingAfterStepMs` 内没有下一帧」——下一帧一到就撤（见循环顶上那句）。
       * ⚠ 复用的是**同一条占位行**（`operator-message-pending`）与同一个条目 id：
       * 定稿帧直接往它里面写字，⛔ 不换条目（换条目 = 换 key = 重挂）。
       */
      let pendingStepTimer: ReturnType<typeof setTimeout> | null = null
      const cancelPendingAfterStep = () => {
        if (pendingStepTimer === null) return
        clearTimeout(pendingStepTimer)
        pendingStepTimer = null
      }
      const schedulePendingAfterStep = () => {
        cancelPendingAfterStep()
        pendingStepTimer = setTimeout(() => {
          pendingStepTimer = null
          // 这一轮已经停了（收尾 / 出错 / 等你定）就没有「它马上要说话」可言。
          if (getOperatorState().status !== 'working') return
          /**
           * ⚠ 线程尾部**还有一条活的助手正文**就不挂：那条本身已经写完了，
           * 再挂一行三点是同一件事说两遍。判据取「这个 id 还在不在」。
           */
          const id = messageEntryId()
          const live = getOperatorState().entries.some(
            (entry) => entry.kind === 'message' && entry.id === id,
          )
          if (live) return
          appendOperatorPending(id)
        }, STUDIO_OPERATOR_STREAMING.pendingAfterStepMs)
      }

      /**
       * ⭐ **载回来的历史也进上下文**（P4-B）：不带它的下场是「用户看得见自己
       * 三分钟前说的话，助手却完全失忆」—— 刷新之后第一句就要重新自我介绍。
       * 旧助手线（`use-assistant-conversation`）也是把历史原样带回上下文的。
       * ⚠ 只带最后几条对白（`historyToOperatorMessages` 自己截），显示是全部。
       */
      const { entries, history, sessionId, sourceAllowlist } =
        getOperatorState()
      const mentionedAssets = buildMentionedAssets(entries, domain)
      const messages = [
        ...historyToOperatorMessages(history),
        ...buildMessages(entries),
      ]
      if (messages.length === 0) {
        setOperatorStatus('idle')
        return
      }

      /**
       * ⭐ **视频域评审的帧生产者**（第二期最后一环）—— 请求发出去之前抽 0/中/末。
       *
       * ⚠ 抽帧是**几秒级**的同步等待（浏览器解码 + 三次 seek），所以带子在这段时间
       * 里写「正在抽帧」而不是「思考中」：它并没有在思考。⚠ 无论成败都复位
       * （`finally`），否则带子会永远停在那句话上。
       * ⚠ 失败**不拦住这一轮**：照常发出去，服务端按 `videoFramesMissing` 退回一条
       * 可教的拒绝，助手会如实说它看不了。但线程里必须留一行说清楚**为什么**
       * ——⛔ 不静默（见 `videoFramesFailed` 那条系统码的头注）。
       */
      const videoSourceUrl = resolveVideoCritiqueSource(
        domain,
        pendingResultRef.current,
        entries,
      )
      let videoFrames: AssistantOperatorRequest['videoFrames']
      if (videoSourceUrl) {
        setOperatorCapturingFrames(true)
        try {
          const captured = await captureVideoEndpointFrames(videoSourceUrl)
          if (captured.ok) {
            videoFrames = {
              sourceUrl: videoSourceUrl,
              durationSeconds: captured.durationSeconds,
              frames: captured.frames,
            }
          } else {
            appendOperatorEntry({
              kind: 'system',
              id: nextOperatorEntryId('sys'),
              code: 'videoFramesFailed',
              subject: captured.reason,
            })
          }
        } finally {
          setOperatorCapturingFrames(false)
        }
        // 抽帧那几秒里用户可能已经按了 ⏹ / 插了话 —— 那一轮已经不是这一轮了。
        if (controller.signal.aborted) return
      }

      const result = await streamAssistantOperatorAPI(
        {
          messages,
          mediaAttachments: lastUserAttachments(entries)
            .filter(
              (attachment) =>
                attachment.kind === 'video' || attachment.kind === 'audio',
            )
            .slice(0, ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences)
            .map(({ kind, url, label }) => ({
              kind: kind as 'video' | 'audio',
              url,
              label,
            })),
          domain,
          snapshot: buildSnapshot(),
          referenceProfiles: readOperatorReferenceProfiles(entries, history),
          /**
           * ⚠ 历史里的步也算「刚才做过什么」，⛔ 别只给本次会话的：刷新之后
           * 助手会把用户上次撤销掉的改动原样再做一遍（拍板 18 的反面）。
           * 上限由 `buildPriorSteps` 那一刀统一截（取最后 N 条）。
           */
          priorSteps: buildPriorSteps(entries, historyToPriorSteps(history)),
          /**
           * ⭐ 归属票那条来源（拍板 4 的**保留**那一半）：这个键在场 = 助手自己
           * primed 的那一枪回来了，服务端因此允许它主动开口评一张图。用户自己发的
           * 生成永远不会填这个键（判据在 `lib/studio-operator-claim.ts`）。
           * ⚠ 它**不再是看图的唯一凭证**：`@` 指定的任意一张走 `mentionedAssets`
           *   那条路（拍板 4 推翻，§7）。两条来源并存，缺一条不影响另一条。
           */
          ...(pendingResultRef.current
            ? { result: pendingResultRef.current }
            : {}),
          /**
           * ⭐ **`@` 引用的那几张图**（§7，拍板 4 推翻的落点）：它同时是
           * `critique_result.targetIds` 的**准入名单** —— 服务端只认这张名单里的
           * 目标。⛔ 别指望服务端去解析消息里那句 `[attached: …]`：那是给模型读的
           * 展示文本，当成权限清单用就是一条提示词注入的路。
           */
          ...(mentionedAssets.length ? { mentionedAssets } : {}),
          /**
           * ⭐ **这一轮属于哪段会话**（v2 §7.5 / §7.6，commit #12）—— 结账写库与
           * 下一轮注入唯一的落点：服务端零会话态，会话的身份一直由客户端持有
           * （`sessionId` 就是 `upsertAssistantConversation` 回来的那个 id）。
           * ⚠ **缺席是常态而不是故障**：这条线程还没落过库（新会话的第一轮 ——
           *   落库发生在这一轮说完话之后的那次 upsert）。那一轮的结论记录照旧算、
           *   照旧随 `done` 下发，只是不落库，下一轮起才开始接得上。
           * ⛔ 别为此在发请求前抢先建一条会话：那会给「说了一句就关掉」的用户在
           *   历史列表里留一条空线程。
           */
          ...(sessionId ? { conversationId: sessionId } : {}),
          ...(videoFrames ? { videoFrames } : {}),
          /**
           * ⭐ **这一轮指定的来源**（v2 §9.3）——「+」菜单点的那几个，只作用于
           * 本轮。⚠ 服务端把它与库里那份白名单并起来时**临时的优先**；⛔ 客户端
           * 不写库，也不替服务端做合并：名单是闸，闸只有一个地方说了算。
           */
          ...(sourceAllowlist.length
            ? { sourceAllowlist: [...sourceAllowlist] }
            : {}),
          ...(confirmations?.length ? { confirmations } : {}),
          ...(planAnswers?.length ? { planAnswers } : {}),
          ...(planApproved === undefined ? {} : { planApproved }),
          /**
           * ⭐ **断点续跑**（第三期）：前几步的既成事实。⛔ 它不放宽钱闸 ——
           * 剩下的步里但凡有一步要生成，`confirm` 照出（owner 定）。
           */
          ...(resumeFrom ? { resumeFrom } : {}),
          responseLanguage: toResponseLanguage(locale),
        },
        { signal: controller.signal },
      )

      if (!result.success) {
        cancelPendingAfterStep()
        dropOperatorPending(messageEntryId())
        if (controller.signal.aborted) return
        // abort 是用户按的，不是故障 —— 状态回 idle，线程里不插红字。
        if (result.errorCode === 'ABORTED') {
          setOperatorStatus('idle')
          return
        }
        setOperatorStatus('error', describeError(result))
        return
      }

      try {
        for await (const event of result.events) {
          if (controller.signal.aborted) break
          /**
           * ⚠ **下一帧一到就把占位行的闸撤掉**：连着跑的工具步之间不许闪一行
           * 三点（见 `schedulePendingAfterStep` 头注）。已经挂出去的那条不在这里
           * 拆 —— 拆它的是下面的让位逻辑（`dropOperatorPending` 只扔空的）。
           */
          cancelPendingAfterStep()
          /**
           * 占位行让位（§4.1）：**除了正文自己**，任何一帧到达都意味着「它已经
           * 开口了」，那一行空脉冲该消失。
           * ⚠ 只扔**还空着**的那条（`dropOperatorPending` 自己把关）：助手先说
           *   一句再去调工具时，那句话必须留在屏幕上。
           */
          if (
            event.type !== ASSISTANT_OPERATOR_EVENTS.message &&
            /**
             * ⛔ `open` **不算「它开口了」**：那一帧是成帧器在模型开口之前就发的
             * 握手（见 `lib/assistant-operator-stream.ts` 头注），它到达时模型还
             * 一个字都没写。把它算进来的表现是占位行闪一下就没了 —— 2026-09-06
             * 真机实测：占位行出现 360ms 后消失，此后到第一个字之间又是一片空白，
             * 而那正是这条占位行要填的那段时间。
             */
            event.type !== ASSISTANT_OPERATOR_EVENTS.open
          ) {
            dropOperatorPending(messageEntryId())
          }
          /**
           * 攒着的计划**最多只等一帧**（第 2 件）：多步确认帧紧挨着 `plan` 发，
           * 所以别的帧一到就说明这一轮不会有卡了 —— 立刻落成折叠行。
           * ⛔ 不拖到流末尾再落：那样它会排在这一轮所有工具步的后面，读起来像
           * 「干完之后才想起来规划」。
           * ⚠ `confirm` 不在这里落：多步那一支要把这份清单收进卡里（见下面），
           *   生成那一支自己会补一次 `flushPlanEntry()`。
           */
          if (
            event.type !== ASSISTANT_OPERATOR_EVENTS.plan &&
            event.type !== ASSISTANT_OPERATOR_EVENTS.confirm
          ) {
            flushPlanEntry()
          }
          switch (event.type) {
            /**
             * ⭐ **计划帧不再无条件落条目**（2026-09-06 面板轮，第 2 件）。
             *
             * 由来：一轮里同一份计划会出现两次 —— 一条 `kind:'plan'` 的清单卡，
             * 外加钉在流末尾那张待确认的计划卡。两张卡列的是同一串阶段，用户读到
             * 的是「它规划了两遍」。
             * ⚠ 所以这里只**攒着**：多步确认帧紧跟在下一帧（服务端那一侧写死的
             * 顺序，见 `assistant-operator.service.ts`），由它来收 —— 出卡 = 这份
             * 清单归卡，条目不落；不出卡 = 落成一行折叠。
             */
            case ASSISTANT_OPERATOR_EVENTS.plan:
              setOperatorPlannedSteps(event.steps.length)
              pendingPlanSteps = event.steps.map((step) => step.label)
              break
            /**
             * **问题卡**（v2 §3.2 / §3.4）—— 三个来源一帧到齐，**一张卡收全**。
             *
             * ⭐ 收敛点就在这里（v2 §3.2「14 → 5」）：覆盖三选、缩略图单选、计划
             * 里的待定项此前各有一张卡，而它们问的是同一件事 ——「列几个选项等你
             * 点一个」。⛔ 别按载荷再分派回三张：那正是 v1 那 14 张卡的来路。
             * ⚠ 卡**不进时间线**（§3.4）：它钉在输入框上方，答完落一行系统行。
             * ⚠ `overwrite` 原样收着 —— 它是回执路由（答复要按 `field` 带回
             *   `confirmations`），问句本身说不出「改的是哪一格」。
             * ⚠ ⛔ 不用像 v1 那样掐流：停流已经由服务端那一帧 `stopped` 说了。
             */
            case ASSISTANT_OPERATOR_EVENTS.ask: {
              flushPlanEntry()
              setOpen(true)
              setOperatorQuestion({
                id: nextOperatorEntryId('question'),
                question: event.question,
                ...(event.why ? { why: event.why } : {}),
                ...(event.overwrite ? { overwrite: event.overwrite } : {}),
              })
              setOperatorStatus('awaitingConfirm')
              break
            }
            /**
             * **确认卡**（v2 §3.3）—— 两种来源，**一张卡**（`kind` 判别）：
             *  · `multistep` → 这一轮攒着的那份计划归它，⛔ 别再落一条
             *    `kind:'plan'` 条目（同一份阶段出现两遍 = 「它规划了两遍」）；
             *  · `generate`  → 生成确认卡，⚠ 点「确认生成」由客户端扣扳机（§5）。
             * ⚠ 状态分两档写：多步是「一整轮还没开始跑」（`awaitingPlan`），
             *   生成是「有一件事等你拍板」（`awaitingConfirm`）——图标轨那一行
             *   两句话不一样。
             */
            case ASSISTANT_OPERATOR_EVENTS.confirm: {
              if (
                event.confirm.kind ===
                ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
              ) {
                pendingPlanSteps = null
                setOperatorConfirm({
                  id: nextOperatorEntryId('confirm'),
                  kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep,
                  steps: event.confirm.steps,
                  status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
                })
                setOperatorStatus('awaitingPlan')
                break
              }
              if (
                event.confirm.kind ===
                ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard
              ) {
                /**
                 * **提议记一张卡**（v2 §8.1）——卡上摆草稿，同时把它写成一行
                 * 「待确认」：当场不点的那几张，用户事后能在设置里补点。
                 * ⚠ 写库那一跳**不等**：卡当场就该在，写成功与否只决定
                 * 「存这张卡」走翻面还是走新建。
                 */
                flushPlanEntry()
                setOpen(true)
                const contextCardEntryId = nextOperatorEntryId('confirm')
                setOperatorConfirm({
                  id: contextCardEntryId,
                  kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard,
                  card: event.confirm.card,
                  status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
                })
                setOperatorStatus('awaitingConfirm')
                void persistProposedContextCard(
                  contextCardEntryId,
                  event.confirm.card,
                )
                break
              }
              flushPlanEntry()
              setOperatorConfirm({
                id: nextOperatorEntryId('confirm'),
                kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
                request: event.confirm.request,
                status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
              })
              break
            }
            /**
             * 正文的**唯一来源**（v2 §3.1 / §13.1）—— 整段一次到齐，按条目 id
             * **覆盖**，⛔ 不追加。
             *
             * 🔬 那条 bug 的形状：这一段字已经落进线程，紧跟着来一帧 `plan`，
             * 服务端随后又发一次定稿 —— 序号在中间进了一位，于是同一段分析回复
             * 在计划的上下各出现一次。
             * ⭐ 所以进位的判据是「这一段**已经被别的条目压在下面**」而不是
             * 「又来了一帧」：压在下面 = 后面的字属于新的一段（写回上面那条读起来
             * 像时间倒流）；还在线程末尾 = 就是同一段，覆盖它。
             */
            case ASSISTANT_OPERATOR_EVENTS.message: {
              const entries = getOperatorState().entries
              const index = entries.findIndex(
                (entry) =>
                  entry.kind === 'message' && entry.id === messageEntryId(),
              )
              if (index >= 0 && index !== entries.length - 1) messageSeq += 1
              finalizeOperatorMessage(
                messageEntryId(),
                event.text,
                event.detail,
              )
              break
            }
            case ASSISTANT_OPERATOR_EVENTS.step: {
              const { step } = event
              upsertOperatorStep(step, runKey)
              /**
               * ⭐ **续跑记录跟着走**（第三期）：这一步有结论了，把计划里第一个
               * 还没有结论的那一格填掉。
               *
               * ⚠ 映射按「第一个未完成」而不是按下标（见 `firstUnfinishedStepId`
               * 的头注）：工具步与计划步不是一一对应的，按下标配的表现是模型多跑
               * 一步、后面每一格的状态错位一整格。
               * ⚠ `running` 不落：三态里没有那一档，落了它刷新之后会变成一句
               *   「这一步做完了」——而它并没有。
               */
              if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.running) {
                const resume = getOperatorState().resume
                const resumeStepId = resume
                  ? firstUnfinishedStepId(resume)
                  : null
                if (resumeStepId) {
                  if (
                    step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error
                  ) {
                    /**
                     * ⚠ 那句原因取的是**被拒的理由**（`error.detail` 优先，否则
                     * 那条 reason 码）：⛔ 别写一句「这一步失败了」—— 续跑按钮
                     * 旁边唯一有用的信息就是它为什么挂。
                     */
                    markOperatorResumeStep(resumeStepId, {
                      state: 'failed',
                      reason: step.error.detail ?? step.error.reason,
                    })
                  } else {
                    markOperatorResumeStep(resumeStepId, {
                      state: 'done',
                      artifactIds: collectStepArtifacts(step).map(
                        (artifact) => artifact.id,
                      ),
                    })
                  }
                }
              }
              // ⭐ 只在 `done` 那一次应用：`running` 也应用就会改两遍
              //    （append 类的会追加两次，而那是看得见的）。
              // ⚠ `status === 'done'` 同时把类型收窄成「应用过的那一支」——
              //    被拒的那支是 `status: 'error'`，它没有 payload / inverse。
              if (step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) {
                const field = flushSync(() =>
                  applyOperatorStep(step, applyContext),
                )
                if (
                  checkpoints &&
                  (field ||
                    step.tool === ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate)
                ) {
                  const checkpoint = await checkpoints.capture()
                  if (controller.signal.aborted) return
                  if (checkpoint)
                    setOperatorStepCheckpoint(
                      operatorStepEntryId(runKey, step.id),
                      checkpoint,
                    )
                }
                if (field) {
                  recordOperatorChange({
                    field,
                    // 归属标记要指回**线程里的那一条**，不是服务端的步号。
                    stepId: operatorStepEntryId(runKey, step.id),
                    ...(step.reason ? { reason: step.reason } : {}),
                    firstInverse: step,
                    previousLabel: describeOperatorInverse(step),
                  })
                }
              }
              /**
               * ⭐ **停顿点**（§3.1 ㉓）：这一步有结论了，排着的话现在接住。
               *
               * ⚠ 判据是「不是 `running`」而不是「是 `done`」：被拒的那一步
               * （`error`）同样是一个结论，它也进 `priorSteps`，在那儿停下来
               * 一样安全。只认 `done` 的话，一轮里全是被拒的步时排队条会一直
               * 挂着不动。
               * ⚠ 顺序：先 abort 掉这条流（下面 `run()` 自己也会 abort，但那要
               * 等到它执行；这里先断，才不会有半个事件在两条流之间穿过去），
               * 再接队、再起新一轮。本函数就此返回 —— 旧流的 `AbortError` 由
               * 下面那个 catch 的 `aborted` 判据吞掉。
               */
              if (
                step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.running &&
                getOperatorState().queue.length > 0
              ) {
                controller.abort()
                flushQueue()
                runRef.current?.()
                return
              }
              /**
               * ⭐ 这一步有结论了 —— 下一帧再不来就挂占位行（owner 2026-09-07）。
               * ⚠ 判据同上一段：`running` 之外的三档（done / error / rejected）
               * 都是结论，只认 `done` 的话一串被拒的步之后仍然是一片空白。
               */
              if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.running) {
                schedulePendingAfterStep()
              }
              break
            }
            /**
             * **规则薄卡**（§2.21 / §10，拍板 23）—— 时间线里插一条，⛔ 不是一步。
             * 原文与日期是服务端从规则表里查出来的原话（见事件 schema 头注）。
             */
            case ASSISTANT_OPERATOR_EVENTS.ruleHit:
              appendOperatorEntry({
                kind: 'rule',
                id: nextOperatorEntryId('rule'),
                ruleId: event.ruleId,
                text: event.text,
                source: event.source,
                createdAt: event.createdAt,
              })
              break
            /**
             * ⚠ **`awaitingPlan` 不被这一帧降级**：计划卡 / 问题卡那两支自己已经
             * 把状态说清楚了，而服务端只会笼统地说一句 `awaiting_confirm` ——
             * 盖过去的表现是图标轨上「待你定」变成「待确认」，而两者的下一步动作
             * 完全不同（见 `StudioOperatorStatus` 的头注）。
             */
            case ASSISTANT_OPERATOR_EVENTS.stopped: {
              if (getOperatorState().status === 'awaitingPlan') break
              setOperatorStatus(
                event.reason === ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm
                  ? 'awaitingConfirm'
                  : 'idle',
              )
              break
            }
            /**
             * **本轮结账**（v2 §7.7，commit #13）—— 结论记录随 `done` 帧下发，
             * 落进时间线当这一轮的分隔块，⛔ 不再请求一次（§7.5 ④）。
             *
             * ⚠ `roundSummary` **缺席是正常形态**（见事件 schema 头注）：这一轮
             * 什么都没产出、或者压缩那一跳失败了，都照常收尾 —— ⛔ 别为此画一个
             * 三栏全空的分隔块，那讲的是零。
             */
            case ASSISTANT_OPERATOR_EVENTS.done:
              if (event.roundSummary) {
                appendOperatorRoundSummary(event.roundSummary)
              }
              break
            case ASSISTANT_OPERATOR_EVENTS.error:
              setOperatorStatus('error', describeError(event))
              break
            default:
              break
          }
        }
      } catch {
        // 攒着的那份计划比丢掉更糟 —— 先落地，再谈这是不是一次 abort。
        cancelPendingAfterStep()
        flushPlanEntry()
        dropOperatorPending(messageEntryId())
        /**
         * ⚠ abort 会**穿透 `for await`**：插话 / ⏹ 掐掉的是底下那个 `reader.read()`，
         * 它以 `AbortError` 拒绝，于是循环不是 `break` 出来的而是抛出来的。
         * 没有这一判的表现是：插一句话 → 新一轮已经置 `working`，旧循环的这个
         * catch 随后把状态改成 `error`，而下面那句收尾只在 `working` 时归 idle ——
         * 错误态就永久挂在胶囊上，新一轮跑完也擦不掉。
         */
        if (controller.signal.aborted) return
        setOperatorStatus('error', null)
        return
      }

      cancelPendingAfterStep()
      flushPlanEntry()
      dropOperatorPending(messageEntryId())
      if (controller.signal.aborted) return
      // `done` 之后没有别的收尾 —— 状态没被 `stopped` / `error` 改过就是跑完了。
      if (getOperatorState().status === 'working') setOperatorStatus('idle')
      /**
       * ⭐ **跑完了就把续跑记录清掉**（第三期）。
       *
       * ⚠ 判据是「每一步都 done」而不是「这一轮没报错」：一轮跑完不等于计划跑完
       * （工具步 8 个上限撞到过、模型自己收尾过）。留着那颗按钮的表现是用户点
       * 「从第 4 步继续」，而第 4 步早就做完了 —— 助手把同一件事又做一遍。
       * ⛔ 报错 / 被 ⏹ 掐掉的那一支**不清**：那正是它存在的理由。
       */
      const finished = getOperatorState().resume
      if (finished && !hasUnfinishedSteps(finished)) clearOperatorResumePlan()
      /**
       * 一步都没跑就收尾的那种轮次（纯说话、或最后一步之后才排上队）——
       * 停顿点没来过，队列会在这里被接住。
       * ⛔ `awaitingConfirm` / `error` 时**不接**：前者要用户先回答（接了等于替他
       * 跳过那个问题），后者接了会把错误态擦掉而用户还没看见发生过什么。
       * 队列留着，排队条还挂在输入框上方 —— 下一次 `send()` / 续跑会带上它。
       */
      if (getOperatorState().status === 'idle' && flushQueue()) {
        runRef.current?.()
      }
    },
    [
      applyContext,
      checkpoints,
      setOpen,
      buildSnapshot,
      describeError,
      domain,
      flushQueue,
      locale,
    ],
  )

  // 自引用口挂上（见 `runRef` 头注）。⚠ 同步写在 effect 里，⛔ 不在 render 阶段
  //    改 ref（`react-hooks/refs` 会拦）。
  useEffect(() => {
    runRef.current = (options) => {
      void run(options)
    }
    return () => {
      runRef.current = null
    }
  }, [run])

  const send = useCallback(
    (text: string, attachments: readonly StudioOperatorAttachment[] = []) => {
      const trimmed = text.trim()
      if (!trimmed) return
      /**
       * ⭐ **干活时进队列，⛔ 不再 abort**（本片改口，见文件头注）。
       * 排队条随即出现在输入框上方，接住发生在下一个工具步跑完的那一刻。
       */
      if (getOperatorState().status === 'working') {
        enqueueOperatorMessage({
          id: nextOperatorEntryId('queued'),
          text: trimmed,
          attachments,
        })
        return
      }
      // 没在跑：直接说。
      // ⚠ 先把队里可能剩下的接掉（上一轮以 error / awaitingConfirm 收尾时会剩），
      //   ⛔ 别让它们变成永远不会被发出去的孤儿 —— 排队条挂着而没有任何东西会
      //   来处理它，正是本仓最讨厌的那种失败。
      flushQueue()
      // 用户开口了：那张刚评过的图不再随每一轮上传（见 `pendingResultRef` 头注）。
      pendingResultRef.current = null
      /**
       * ⭐ 三张「等你定」的卡一起收（§4.1「钉在流末尾」）：用户改口了，上一轮那张
       * 计划 / 花钱 / 反问就此作废。⛔ 留着的表现是流末尾挂着一张还能点的卡，
       * 点下去发出的是**上一个话题**的确认 —— 而花钱那张是真的会花钱。
       */
      clearOperatorPrompts()
      appendOperatorEntry({
        kind: 'user',
        id: nextOperatorEntryId('user'),
        text: trimmed,
        attachments,
      })
      /**
       * 计划卡「修改」之后的第一条消息带 `planApproved: false` —— 服务端据此把
       * 答复并进上下文**重新规划一次**（§3.1 ⑤）。⚠ 读完就清（见 `reviseRef`）。
       */
      const revising = reviseRef.current
      reviseRef.current = false
      void run(revising ? { planApproved: false } : {})
    },
    [flushQueue, run],
  )

  /**
   * 撤回一条还没轮到的排队消息（§3.1 ㉔）。
   *
   * ⚠ 线程里**要留一行**：排队条淡出而什么都没说，用户下一秒就会怀疑自己到底
   * 撤没撤掉（而这句话本来是要花钱的）。
   */
  const cancelQueued = useCallback((id: string) => {
    const target = getOperatorState().queue.find((item) => item.id === id)
    if (!target) return
    removeOperatorQueued(id)
    appendOperatorEntry({
      kind: 'system',
      id: nextOperatorEntryId('sys'),
      code: 'queueDropped',
      subject: target.text.slice(0, ASSISTANT_OPERATOR_LIMITS.maxTitleChars),
    })
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setOperatorStatus('idle')
    // ⚠ 计划数也得清：胶囊上那个 `3/7` 的分母来自上一轮的计划条，不清的表现是
    //    按了 ⏹ 之后胶囊继续挂着「还有四步没跑」，而根本不会再有那四步。
    setOperatorPlannedSteps(0)
    /**
     * ⭐ **队列一起清**（本片）：⏹ 说的是「接下来的一切都别做了」。留着队列的
     * 表现是按了停止、一秒后助手又自己动起来去处理排着的那句 —— 而那正是用户
     * 刚刚明确叫停的东西。
     */
    clearOperatorQueue()
    // ⏹ 说的是「接下来的一切都别做了」—— 那三张还等着回答的卡也在「接下来」里。
    clearOperatorPrompts()
    appendOperatorEntry({
      kind: 'system',
      id: nextOperatorEntryId('sys'),
      code: 'stopped',
    })
  }, [])

  /**
   * **问题卡答复**（v2 §3.4 落账规则）—— 三条路一个入口。
   *
   * ⭐ 两件事，缺一不可：
   *  ① 卡消失（钉住区清空）；
   *  ② 时间线落一行「问题 · 你选了 X」（系统行）——⛔ 不把卡留在时间线里代替
   *     它：卡钉在输入框上方就是为了不随时间线滚走，留一张滚得走的复本等于
   *     把这条纪律又还回去了；
   *  ③ 按载荷选回执通道：覆盖三选 → `confirmations`（⛔ 不靠模型从对话文本里
   *     猜）；带素材的选项 → @chip 那条管线；其余 → `planAnswers`。
   *
   * ⚠ `label` 由面板给（i18n 在那一层）：hook 里没有词表，硬编一句中文会在英文
   *   界面上原样印出来。
   */
  const answerQuestion = useCallback(
    (
      answer: StudioOperatorQuestionAnswer,
      options: {
        /** 系统行上那句「你选了 X」里的 X。 */
        label: string
        /** 选项带缩略图时，被点中的那一张 —— 走 @chip 管线端上去。 */
        asset?: StudioOperatorAttachment
        /** 覆盖三选时选的那一档。 */
        choice?: AssistantOperatorConfirmChoice
      },
    ) => {
      const question = getOperatorState().question
      if (!question) return
      setOperatorQuestion(null)
      /**
       * ⚠ 缩略图那一支落的是**用户行**而不是系统行：服务端的准入名单
       * （`mentionedAssets`）读的是**最后一条用户消息的附件**（见
       * `buildMentionedAssets`）—— 落成系统行的话那张图根本到不了服务端，
       * 而「你说的是哪一张」问完之后它是这一轮唯一要紧的东西。
       * ⚠ 那一行本身就是「你选了 X」：它带着被选中的缩略图，⛔ 不再额外落一条
       *   系统行（同一句话说两遍）。
       */
      if (options.asset) {
        addOperatorMention(options.asset)
        pendingResultRef.current = null
        appendOperatorEntry({
          kind: 'user',
          id: nextOperatorEntryId('user'),
          text: options.label,
          attachments: [options.asset],
        })
        void run({})
        return
      }
      appendOperatorEntry({
        kind: 'system',
        id: nextOperatorEntryId('sys'),
        code: 'questionAnswered',
        subject: options.label,
      })

      if (question.overwrite && options.choice) {
        void run({
          confirmations: [
            { field: question.overwrite.field, choice: options.choice },
          ],
        })
        return
      }
      /**
       * ⭐ **答复自带题面与选项文案**（v2 §3.4 落账规则，2026-09-12 真机 bug）。
       *
       * `questionId` / `optionIds` 是上一条流现编的合成 id（`question-1` /
       * `option-1-1`），而服务端零会话态 —— 下一轮它反查不回这道题问的是什么、
       * 那个选项写的是什么，于是「用户已经选过了」这件事对模型不存在。真机表现：
       * 点完「角色设计展示立绘」，模型连着四轮重问「画面以哪位角色为主体」，
       * 顺带把 `set_prompt` 卡在 `promptConflict` 上（提示词一个字都没写进去）。
       * ⚠ 题面与文案**只在这里取一次**：卡在 store 里的这一份是唯一有原文的地方
       *   （面板那一层只有 i18n 文案，⛔ 不在那儿拼第二份）。
       */
      const labels = answer.optionIds.flatMap((optionId) => {
        const option = question.question.options.find(
          (candidate) => candidate.id === optionId,
        )
        return option ? [option.label] : []
      })
      void run({
        planAnswers: [
          {
            ...answer,
            question: question.question.question,
            ...(labels.length ? { optionLabels: labels } : {}),
          },
        ],
        planApproved: true,
      })
    },
    [run],
  )

  /**
   * **多步确认卡「开始」**（§3.3）—— 带 `planApproved: true` 重发。
   *
   * ⚠ `planApproved: true` 是硬要求：它让服务端跳过「问题 / 多步确认」那一整段，
   * 否则用户点「开始」之后看到的是同一张卡又回来了（一个自己喂自己的环）。
   * ⚠ 已经定过的直接返回：连点两下发的是两轮请求，而第二轮会把第一轮 abort 掉
   * 再从头跑一遍。
   */
  const approvePlan = useCallback(() => {
    const confirm = getOperatorState().confirm
    if (
      !confirm ||
      confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep ||
      confirm.status !== STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
    ) {
      return
    }
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting)
    startOperatorResumePlan({
      planId: confirm.id,
      labels: confirm.steps.map((step) => step.label),
    })
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed)
    void run({ planApproved: true })
  }, [run])

  /**
   * **多步确认卡「一步一步来」**（§3.3 第二颗按钮）—— ⛔ **不发请求**。
   *
   * ⚠ 与「开始」不是一对反义词：它说的是「别一口气做完」，而不是「不要做」。
   * 面板把输入框预填成「修改计划：」并聚焦；用户按发送时那条消息带
   * `planApproved: false`（把答复并进上下文重新规划一次）。
   * ⚠ §3.3 只写了「开始」那一支的落地，这一支按 v1 计划卡「修改」的同一条纪律
   * 走 —— ⛔ 别顺手替用户发出去：他还没写要怎么拆。
   */
  const declinePlan = useCallback(() => {
    const confirm = getOperatorState().confirm
    if (
      !confirm ||
      confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep
    ) {
      return
    }
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled)
    reviseRef.current = true
    setOperatorStatus('idle')
  }, [])

  /**
   * 计划「修改」（§3.1 ⑤）—— ⛔ **不发请求**，只记下「下一条消息是一次改计划」。
   */
  const revisePlan = useCallback(() => {
    if (!getOperatorState().confirm) return
    reviseRef.current = true
    setOperatorStatus('idle')
  }, [])

  /**
   * **生成确认卡「确认生成」**（v2 §3.3 / §5）。
   *
   * ⭐ **客户端扣扳机，⛔ 不再重发一轮**：v1 走的是「带 `autoApprove` 重发 →
   * 服务端吐 `request_generation` 那一步 → `applyOperatorStep` 交给宿主」，
   * 而那条免检通道随花费确认一起删了（决策 8）。留着重发的表现是用户点一次
   * 「确认生成」、服务端再问一次同一张卡 —— 一个自己喂自己的环。
   * ⚠ 名字先落、再扣扳机：扳机那一跳是同步 dispatch，落在它后面的话这一枪带的
   *   还是上一次的名字（判据与 `applyOperatorStep` 里那一处逐字同源）。
   */
  /**
   * **卡上就地改一颗旋钮**（v2 §5.2 第二行，commit #9）。
   *
   * ⭐ 走的是助手改参数**同一条通道**：`buildGenerationKnobSteps` 造 step →
   * `applyOperatorStep` 落表单 → `recordOperatorChange` 记账。三件事缺一不可 ——
   * 少了最后一件，参数栏上那颗 ✦ 不亮（§5.2 第二行后半「工作台控件同步高亮一拍」），
   * 而且「先不要」之后用户没有任何入口撤掉刚才改的那几格（§5.2 第五行）。
   * ⚠ ⛔ 不往时间线里插日志条：这不是助手做的一步，插进去等于在「它做了什么」
   *   里混进「我做了什么」。登记簿那一格的 `reason` 里写清是谁改的。
   * ⚠ 换模型可能一次落三条（模型 + 规格 + 张数，§5.1 回落）—— 逐条记账，
   *   因为登记簿按**字段**存。
   */
  const adjustGeneration = useCallback(
    (
      knob: StudioOperatorGenerateKnob,
      value: string,
    ): readonly StudioOperatorGenerateKnob[] => {
      const controls = host.generationControls
      if (!controls) return []
      const advancedParams = applyContext.getState().advancedParams
      const { steps, adjusted } = buildGenerationKnobSteps({
        knob,
        value,
        domain,
        controls,
        stepId: nextOperatorEntryId('knob'),
        title: tConfirm('generate.knobStepTitle'),
        reason: tConfirm('generate.knobStepReason'),
        advanced: {
          quality: advancedParams.quality,
          preview: advancedParams.preview,
          background: advancedParams.background,
        },
      })
      for (const step of steps) {
        const field = applyOperatorStep(step, applyContext)
        if (!field) continue
        recordOperatorChange({
          field,
          stepId: step.id,
          reason: step.reason ?? tConfirm('generate.knobStepReason'),
          firstInverse: step,
          previousLabel: describeOperatorInverse(step),
        })
      }
      return adjusted
    },
    [applyContext, domain, host.generationControls, tConfirm],
  )

  const confirmGeneration = useCallback(() => {
    const confirm = getOperatorState().confirm
    if (
      !confirm ||
      confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate ||
      confirm.status !== STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
    ) {
      return
    }
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed)
    setOperatorStatus('idle')
    if (confirm.request.label)
      applyContext.setGenerationLabel?.(confirm.request.label)
    /**
     * ⭐ **用工作台此刻的值**（§5.2 第四行），⛔ 不是卡出现那一刻攒下的那份：
     * 卡上改过的旋钮已经写回工作台了，而用户也可能在卡摆着的时候直接去工作台上
     * 改。两者都只在 `generationControls` 里留下痕迹，所以这一枪按它重新拼一份。
     * ⚠ 真正决定这一枪长什么样的仍然是 `REQUEST_GENERATE` 那条路上的表单快照
     *   （见 `triggerGeneration` 头注）—— 这里对齐的是**载荷**，让日志与结果卡上
     *   写的那几行与真的发出去的逐字相同。
     */
    const controls = host.generationControls
    const request = controls
      ? {
          ...confirm.request,
          model: controls.model ?? confirm.request.model,
          count: controls.count,
          specs: {
            ...confirm.request.specs,
            aspectRatio: controls.aspectRatio,
            resolution: controls.resolution,
          },
        }
      : confirm.request
    applyContext.triggerGeneration?.(request)
    /**
     * **生成中那张结果卡就地落进时间线**（v2 §6.3，commit #10）。
     *
     * ⭐ 落在扣扳机**之后**、而且用的是刚刚拼出来的那份 `request`：卡上写的张数
     * 与真的发出去的那一枪逐字同源（判据与上面那段头注同一条）。⛔ 别等结果回来
     * 才落卡 —— 图片档一批四张要跑几十秒，这几十秒里时间线上什么都没有，
     * 用户不知道自己刚才那一下点没点上。
     * ⚠ 张数与缩略图由宿主回流往这条上写（`use-studio-operator-results.ts`），
     *   这里一个数都不猜。
     */
    appendOperatorPendingResult({
      id: nextOperatorEntryId('result'),
      total: request.count,
      ...(request.label ? { summary: request.label } : {}),
      request,
    })
  }, [applyContext, host.generationControls])

  /**
   * **上下文卡确认卡「存这张卡」**（v2 §8.1）—— 这一点把那张卡翻成「已确认」。
   *
   * ⭐ 走**既有的** `/api/context-cards`，⛔ 不新开一条「确认提议」的路由：
   * 用户在设置里按「新建」存下的和这里存下的是同一种东西，两条路会长出两份校验。
   * ⚠ 卡到达时已经写过一行 `proposed`（见 `persistProposedContextCard`），所以
   *   常态是 **PATCH 翻面**；⚠ 那一跳写失败时 `cardId` 缺席，这里**回落成
   *   `create confirmed`** —— ⛔ 不能因为草稿没写成就让用户存不下。
   * ⚠ 成功之后落一行系统行「已存上下文卡 X」：卡就地收成「已确认 · 11:24」，
   *   那一行上没有卡名，而「我刚才让它记住了什么」正是事后要回头找的。
   * ⚠ 失败**不静默**：卡转回 `idle`（用户可以再点一次），时间线上说一句。
   */
  const saveContextCard = useCallback(async () => {
    const confirm = getOperatorState().confirm
    if (
      !confirm ||
      confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard ||
      confirm.status !== STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
    ) {
      return
    }
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting)
    const result = confirm.cardId
      ? await updateContextCardAPI(confirm.cardId, {
          status: CONTEXT_CARD_STATUS_IDS.confirmed,
        })
      : await createContextCardAPI({
          kind: confirm.card.kind,
          name: confirm.card.name,
          summary: confirm.card.summary,
          body: confirm.card.body,
          ...(confirm.card.negative ? { negative: confirm.card.negative } : {}),
          /** ⚠ 新卡不常挂到任何域：挂哪儿是用户的决定（设置里那颗开关）。 */
          pinnedScopes: [],
          status: CONTEXT_CARD_STATUS_IDS.confirmed,
        })
    if (!result.success) {
      // ⛔ 不静默：用户以为已经记下了，而库里那一行还停在「待确认」。
      setOperatorConfirm({
        id: nextOperatorEntryId('confirm'),
        kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard,
        card: confirm.card,
        // ⚠ id 要留住：再点一次仍该翻同一行的面，⛔ 不能变成新建第二行。
        ...(confirm.cardId ? { cardId: confirm.cardId } : {}),
        status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
      })
      appendOperatorEntry({
        kind: 'system',
        id: nextOperatorEntryId('sys'),
        code: 'contextCardSaveFailed',
        subject: confirm.card.name,
      })
      return
    }
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed)
    setOperatorStatus('idle')
    appendOperatorEntry({
      kind: 'system',
      id: nextOperatorEntryId('sys'),
      code: 'contextCardSaved',
      subject: result.data.name,
    })
  }, [])

  /**
   * **「不用」**（§8.1）—— 卡收成「已取消」，那一行 `proposed` **真删**。
   *
   * ⚠ 「不用」是一个**明确的拒绝**：留着它只会在设置的待确认区里反复问同一句。
   * ⚠ 删失败不报错、也不回退卡态：用户表达过的意思不该因为一次网络抖动被推翻，
   *   ⛔ 那一行最坏就是留在待确认区里，他在那儿还能再删一次。
   */
  const dismissContextCard = useCallback(async () => {
    const confirm = getOperatorState().confirm
    if (
      !confirm ||
      confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard
    ) {
      return
    }
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled)
    setOperatorStatus('idle')
    if (confirm.cardId) await deleteContextCardAPI(confirm.cardId)
  }, [])

  /** 生成确认卡「先不要」—— 流已经停了，什么都不用发；卡就地转「已取消」。 */
  const cancelGeneration = useCallback(() => {
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled)
    setOperatorStatus('idle')
  }, [])

  /**
   * 「已取消」那一态上的**再来一次**（画板 BCards「已取消 · 11:22」）。
   *
   * ⚠ 摆一张**新的** `idle` 卡而不是把状态改回去（`resolveOperatorConfirm` 明确
   * 不回退）：这一次确认与上一次是两件事，时刻也该重新记。
   */
  const retryGeneration = useCallback(() => {
    const confirm = getOperatorState().confirm
    if (
      !confirm ||
      confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate ||
      confirm.status !== STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled
    ) {
      return
    }
    setOperatorConfirm({
      id: nextOperatorEntryId('confirm'),
      kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
      request: confirm.request,
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
    })
  }, [])

  /**
   * 结果卡上的**「再来一组」**（v2 §6.2 第一行）。
   *
   * ⭐ **参数原样、直接出一张新的生成确认卡**，⛔ 不再走一遍多步确认：用户刚
   * 看完这一批、想要同样设置的另一批 —— 这中间没有任何一件需要他再拍一次板的事，
   * 除了「这一枪要花钱」本身，而那正是确认卡在做的。
   * ⚠ ⛔ 不直接扣扳机：钱闸是一张看得见的卡（决策 8 之后它是唯一的花钱确认），
   *   绕过它的表现是「点一下『再来一组』，credits 就没了」。
   */
  const rerunGeneration = useCallback(
    (request: AssistantOperatorGenerationRequest) => {
      setOperatorConfirm({
        id: nextOperatorEntryId('confirm'),
        kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
        request,
        status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
      })
    },
    [],
  )

  /**
   * **从断点接着跑**（第三期 · 断点续跑）。
   *
   * ⭐ 两件事，缺一不可：
   *  ① `resumeFrom` —— 已经做完的那几步（服务端据此不重跑、不重规划）；
   *  ② `planApproved: true` —— ⛔ 不再弹一次确认卡（那份计划批过了）。
   *
   * ⛔ **钱闸一个字都不动**：剩下的步里有生成，`confirm` 照出、确认卡
   * 照钉。判据不在这里，在服务端的工具表 —— 这里连「这一步要不要花钱」都不知道。
   */
  const resumePlan = useCallback(() => {
    const resume = getOperatorState().resume
    if (!resume) return
    const resumeFrom = toResumeFrom(resume)
    // ⚠ 一步都没做完 = 这不是续跑而是重跑，⛔ 别发一份服务端会拒的空清单。
    if (!resumeFrom) return
    void run({ resumeFrom, planApproved: true })
  }, [run])

  /**
   * 看图闭环的**触发口**（P3-C，拍板 4）。
   *
   * 三件事，顺序有意义：
   *  ① abort 在飞的那一轮 —— 结果回来时助手多半已经停了，但万一它还在跑，
   *    带着新语境重来比让两条流抢着改表单好（与插话共用同一条机制）。
   *  ② 往线程里插一行「结果回来了」。⛔ 不能省：助手接下来会自己动起来，
   *    没有这一行，用户看到的是一个无缘无故开始说话的面板。
   *  ③ 跑一轮 —— 请求里带上 `result`，服务端据此才允许 `critique_result`。
   */
  const critique = useCallback(
    (result: AssistantOperatorResult) => {
      /**
       * ⛔ **只有有看图工具的域才闭环**（P4-A）。⚠ 这里**整条不做**时也不插
       * 「结果回来了」那一行：那一行的意思是「助手因此要动起来了」，而没有这条
       * 工具的域里它并不会动（今天是装配台）。
       *
       * ⚠ **视频域已经在表里了**（第二期）：这条注释此前写着「视频域没有
       * `critique_result`」，理由是借来的视觉线吃的是静态图、喂 mp4 地址会得到一份
       * 内容全编的评价。那条理由没错，错的是它当时被当成了永久结论 —— 现在喂进去的
       * 是浏览器抽出来的三张静态帧（`run()` 里那段 `captureVideoEndpointFrames`），
       * mp4 从头到尾没有进过视觉线。
       */
      if (
        !isAssistantOperatorToolInDomain(
          ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
          domain,
        )
      ) {
        return
      }
      abortRef.current?.abort()
      pendingResultRef.current = result
      appendOperatorEntry({
        kind: 'system',
        id: nextOperatorEntryId('sys'),
        code: 'resultArrived',
        ...(result.modelLabel ? { subject: result.modelLabel } : {}),
      })
      void run()
    },
    [domain, run],
  )

  // 面板卸载（切模态 / 离开工作台）时把在飞的流掐掉：留着它会继续往一个不存在
  // 的面板里应用 op —— 表单被改而线程已经没了。
  useEffect(() => () => abortRef.current?.abort(), [])

  const newThread = useCallback(() => {
    // ⚠ 连那张待评的图一起清掉：新话题不该驮着上一个话题的结果图。
    pendingResultRef.current = null
    resetOperatorThread()
  }, [])

  return {
    domain,
    send,
    stop,
    cancelQueued,
    answerQuestion,
    approvePlan,
    declinePlan,
    revisePlan,
    resumePlan,
    adjustGeneration,
    confirmGeneration,
    cancelGeneration,
    saveContextCard,
    dismissContextCard,
    retryGeneration,
    rerunGeneration,
    critique,
    newThread,
  }
}
