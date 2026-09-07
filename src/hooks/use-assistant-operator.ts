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
 * 服务端没有会话态：`confirm_request` 之后流就结束，续跑 = 带 `confirmations`
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

import { useCallback, useEffect, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_CONFIRM_TIER_IDS,
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
import { ASSISTANT_PERSONA_PLAN_MODE_IDS } from '@/constants/assistant-persona'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { STUDIO_OPERATOR_STREAMING } from '@/constants/studio-assistant-operator'
import { useStudioOperatorHost } from '@/contexts/studio-operator-host'
import { useStudioAssistantControls } from '@/hooks/use-studio-assistant-controls'
import {
  addOperatorCostTick,
  addOperatorMention,
  appendOperatorEntry,
  appendOperatorMessageDelta,
  appendOperatorPending,
  clearOperatorPrompts,
  clearOperatorQueue,
  dropOperatorPending,
  enqueueOperatorMessage,
  finalizeOperatorMessage,
  getOperatorReviewState,
  getOperatorState,
  nextOperatorEntryId,
  operatorStepEntryId,
  recordOperatorArtifacts,
  recordOperatorChange,
  registerOperatorRunner,
  removeOperatorQueued,
  resetOperatorThread,
  settleOperatorMessage,
  resolveOperatorChoice,
  resolveOperatorPlan,
  resolveOperatorSpend,
  setOperatorAskFirst,
  setOperatorAutoApprove,
  setOperatorCapturingFrames,
  setOperatorChoice,
  setOperatorConfirm,
  setOperatorPlan,
  setOperatorPlannedSteps,
  setOperatorSpend,
  setOperatorStatus,
  switchOperatorDomain,
  takeOperatorQueue,
  upsertOperatorStep,
} from '@/hooks/use-studio-operator-store'
import { getGenerationErrorMessage } from '@/lib/api-error-message'
import { readOperatorCostTick } from '@/lib/studio-operator-cost'
import {
  attachmentArtifacts,
  collectStepArtifacts,
  resultArtifacts,
} from '@/lib/studio-operator-memory'
import { captureVideoEndpointFrames } from '@/lib/video-frame-capture'
import { streamAssistantOperatorAPI } from '@/lib/api-client/assistant-operator'
import {
  applyOperatorStep,
  describeOperatorInverse,
} from '@/lib/studio-operator-apply'
import {
  historyToOperatorMessages,
  historyToPriorSteps,
} from '@/lib/studio-operator-history'
import { shouldShowPlanCard } from '@/lib/studio-operator-plan'
import type { PromptAssistantResponseLanguage } from '@/types'
import type {
  AssistantOperatorConfirmDecision,
  AssistantOperatorMessage,
  AssistantOperatorPlanAnswer,
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

/** 跑一轮时那几样「带上下文重发」的东西（拍板 3 / §2.6 / §6 共用一条通道）。 */
interface RunOptions {
  confirmations?: AssistantOperatorConfirmDecision[]
  /** 反问卡那一份答复（`{questionId, optionIds, otherText}`）。 */
  planAnswers?: AssistantOperatorPlanAnswer[]
  planApproved?: boolean
  /** 缺省读 store 的「先问我」；计划卡续跑时显式给 `false`（那张卡已经问过了）。 */
  forcePlan?: boolean
}

export interface UseAssistantOperatorResult {
  domain: AssistantOperatorDomain
  /** 助手实际会用哪个模型说话（chip 上写的那个）—— null = 自动路由。 */
  routeModelId: string | undefined
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
  /** 就地确认的三选一（拍板 3）：追加在后 / 覆盖 / 保留。 */
  answerConfirm(choice: AssistantOperatorConfirmChoice): void
  /** 反问卡「开始」—— 一卡 1–4 题一次交，之后卡收成一行「你选了：…」。 */
  answerQuestions(answers: StudioOperatorQuestionAnswer[]): void
  /** 计划卡「修改」（§3.1 ⑤）—— ⛔ 不发请求，只记下「下一条消息是改计划」。 */
  revisePlan(): void
  /** 花钱硬确认卡「生成」（§3.1 ⑰）—— 勾了「不再问」就顺手记条子。 */
  answerSpend(input: { rememberForSession: boolean }): void
  /** 花钱硬确认卡「取消」—— 流已经停了，只把卡收掉。 */
  cancelSpend(): void
  /** 歧义反问单选卡点中一格（§7）—— 插 @chip 并带上下文重发。 */
  answerChoice(option: StudioOperatorAttachment, text: string): void
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
  const { domain, buildSnapshot } = host
  const applyContext = host.apply
  const { route } = useStudioAssistantControls()
  const locale = useLocale()
  const tError = useTranslations('StudioOperator.error')
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
      const { confirmations, planAnswers, planApproved } = options
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setOperatorConfirm(null)
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
       * ⚠ 占位行与正文**是同一条条目**：第一个增量直接往它里面写字（见
       * `appendOperatorPending` 的头注）。⛔ 别换条目，换条目 = 换 key = 重挂。
       * ⚠ 一轮里可能有好几段正文（旁白 + 收尾），所以 id 带序号，定稿一段进一位。
       */
      let messageSeq = 0
      const messageEntryId = () => `${runKey}:msg-${messageSeq}`
      appendOperatorPending(messageEntryId())

      /**
       * 增量**按帧合批**（§4.1 / `ui-defaults.md §4`）。
       *
       * ⚠ 一块一次 `setState` 的代价不是抽象的：provider 一秒能吐几十块，每块
       * 都会把整条时间线（几十个条目 + 卡片）重渲一遍。合批之后一帧最多一次。
       * ⚠ `settleDeltas()` 在**定稿之前**和收尾时各调一次 —— 否则最后半句会卡在
       *   缓冲里等一个再也不来的帧。
       */
      /**
       * 攒着的那份计划（第 2 件）—— `plan` 帧到达时只存不落，由紧跟的
       * `plan_request` 判定去向。⚠ 判定之外还有两条出口：流以别的方式收尾
       * （模型压根没吐 `plan_request`）时也要把它落下去，⛔ 不能凭空吞掉一份计划。
       */
      let pendingPlanSteps: readonly string[] | null = null
      const flushPlanEntry = () => {
        if (!pendingPlanSteps) return
        appendOperatorEntry({
          kind: 'plan',
          id: nextOperatorEntryId('plan'),
          steps: pendingPlanSteps,
        })
        pendingPlanSteps = null
      }

      let deltaBuffer = ''
      let deltaFrame: number | null = null
      /**
       * ⭐ **rAF 之外的兜底闸**（`STUDIO_OPERATOR_STREAMING.flushFloorMs`）。
       *
       * 🔬 2026-09-07 真机（`localhost:3000/zh/studio/image`，窗口没在最前）：
       * 服务端 20 帧 `message_delta` 跨 620ms 全都到齐了，DOM 里的正文却只长了
       * 4 次 —— 浏览器把这一档的 rAF 降到了 ~6fps。窗口真被切走时 rAF 整段挂起，
       * 那一整段字就在定稿帧那一刻一次落地，看起来与「压根没做流式」一模一样，
       * 而这正是 owner 打回的那句话。
       * ⚠ 两个闸**先到的那个赢**，赢了就把另一个撤掉：前台恒是 rAF（16ms），
       * 后台恒是这颗定时器。⛔ 别把 rAF 换成纯定时器 —— 那等于放弃与绘制同步，
       * 前台会看到字在帧中间半截落地。
       */
      let deltaTimer: ReturnType<typeof setTimeout> | null = null
      const cancelFlushSchedule = () => {
        if (deltaFrame !== null) {
          cancelAnimationFrame(deltaFrame)
          deltaFrame = null
        }
        if (deltaTimer !== null) {
          clearTimeout(deltaTimer)
          deltaTimer = null
        }
      }
      const flushDeltas = () => {
        cancelFlushSchedule()
        if (!deltaBuffer) return
        const text = deltaBuffer
        deltaBuffer = ''
        appendOperatorMessageDelta(messageEntryId(), text)
      }
      const scheduleFlush = () => {
        if (deltaFrame === null) {
          deltaFrame = requestAnimationFrame(flushDeltas)
        }
        if (deltaTimer === null) {
          deltaTimer = setTimeout(
            flushDeltas,
            STUDIO_OPERATOR_STREAMING.flushFloorMs,
          )
        }
      }
      const settleDeltas = () => {
        flushDeltas()
        // ⚠ 缓冲空时 `flushDeltas` 提前返回**之前**已经撤过闸了，这里不必再撤。
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
       * 首个 `message_delta` 直接往它里面写字，⛔ 不换条目（换条目 = 换 key = 重挂）。
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
           * ⚠ 线程尾部**还有一条活的助手正文**就不挂：那条本身就在长字，
           * 再挂一行三点是同一件事说两遍。判据取「这个 id 还在不在」——
           * 工具步让位时序号已经进过一位（见让位那一段），所以 id 还在 = 那条
           * 正文就是当前这一段。
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
      const { entries, history } = getOperatorState()
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
       * 「先问我」（§3.3）—— **本轮的值先定下来，⛔ 别在事件里现读**：计划帧到达
       * 时用户可能已经把开关关了，而这一轮的判定该用发出去的那一份
       * （`shouldShowPlanCard` 与服务端收到的 `forcePlan` 必须是同一个值）。
       */
      const forcePlan = options.forcePlan ?? getOperatorState().askFirst
      const autoApprove = getOperatorState().autoApprove
      /**
       * ⭐ 用户这一轮 `@` / 📎 上来的那几件先记进**这一轮**的工作记忆，再读整份
       * 带走：顺序反过来的话，助手在下一轮才「记得」用户刚才指的是哪张。
       * ⚠ 记的是最后一条用户消息上的那些（判据与 `mentionedAssets` 同源）：
       *   把整条线程的附件都记一遍，五轮上限会被同一批图反复吃掉。
       */
      recordOperatorArtifacts(runKey, [
        // ⚠ 它备的那一枪刚回来的那张也算这一轮见过的东西（`kind: 'result'`）：
        //   用户下一句十有八九就是「刚出的那张」。⛔ 没有 generationId 时不记
        //   —— 工作记忆是**按 id 指认**的，一条没有身份的记录指认不了任何东西。
        ...(pendingResultRef.current?.generationId
          ? resultArtifacts([
              {
                id: pendingResultRef.current.generationId,
                url: pendingResultRef.current.url,
                ...(pendingResultRef.current.prompt
                  ? { label: pendingResultRef.current.prompt }
                  : {}),
              },
            ])
          : []),
        ...attachmentArtifacts(lastUserAttachments(entries)),
      ])
      const workingMemory = getOperatorState().workingMemory

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
          domain,
          snapshot: buildSnapshot(),
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
           * ⭐ **跨轮工作记忆**（切片 Y）：最近几轮见过的产物索引。没有它，助手
           * 每一轮都从零开始 —— 第三轮里用户说「用刚才那张官方立绘」，它会回一句
           * 「我没有看到你说的那张」。
           * ⚠ 上限（5 轮 / 每轮 20 件）由 store 在写入时就截好，这里原样带上去 ——
           *   ⛔ 别在这里再截一次：两处判据迟早说两句不一样的话，而服务端 schema
           *   的 `.max()` 会把超出的那一份整个拒掉。
           */
          ...(workingMemory.length
            ? // ⚠ 复制一份可变数组：契约那边的 `rounds` 是 `z.infer` 出来的可变
              //   数组，而 store 里那份是只读的（快照不可被下游改）。
              { workingMemory: { rounds: [...workingMemory] } }
            : {}),
          ...(videoFrames ? { videoFrames } : {}),
          ...(confirmations?.length ? { confirmations } : {}),
          ...(planAnswers?.length ? { planAnswers } : {}),
          ...(planApproved === undefined ? {} : { planApproved }),
          ...(forcePlan ? { forcePlan: true } : {}),
          /**
           * 「本会话此类不再问」的条子（§6 拍板 24）。⚠ 服务端**逐条核**（同模型 +
           * 金额不超上次），核不过就照旧吐 `spend_request` —— 客户端这一侧不做任何
           * 判断，⛔ 别在这里先比一次：两处判据迟早说两句不一样的话，而说错的那
           * 一次是真的花了钱。
           */
          ...(autoApprove ? { autoApprove } : {}),
          ...(route.apiKeyId ? { apiKeyId: route.apiKeyId } : {}),
          ...(route.modelId ? { llmModelId: route.modelId } : {}),
          responseLanguage: toResponseLanguage(locale),
        },
        { signal: controller.signal },
      )

      /**
       * 发出去了才复位「先问我」（§3.3 最后两行）。
       *
       * ⚠ persona 的「默认行为 = 总是先出计划」时**不复位**（§3.4）：那是一条
       * 长期设置，每轮自己关掉等于让设置只生效一次。单轮想跳过仍然可以手动关，
       * 关只对那一轮生效 —— 下一轮它自己回来。
       */
      if (
        forcePlan &&
        getOperatorState().planMode !== ASSISTANT_PERSONA_PLAN_MODE_IDS.always
      ) {
        setOperatorAskFirst(false)
      }

      if (!result.success) {
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
           * ⭐ **成本计数帧**（切片 Y）—— 它不是一步，也不打断任何东西：读出来
           * 累加到 store，进度带右侧那行小字随之长一位。
           * ⚠ 在占位行让位那一段**之前**处理并 `continue`：`cost_tick` 与 `open`
           * 同理 —— 它到达时模型可能一个字都还没写（一次视觉往返发生在某一步的
           * 规划期），把它算成「它开口了」会让占位行闪一下就没了。
           * ⚠ 走纯函数读取（`readOperatorCostTick`）而不是 `switch` 的一支：
           *   见那颗函数的头注。
           */
          const costTick = readOperatorCostTick(event)
          if (costTick) {
            addOperatorCostTick(costTick)
            continue
          }
          /**
           * 占位行让位（§4.1）：**除了正文自己**，任何一帧到达都意味着「它已经
           * 开口了」，那一行空脉冲该消失。
           * ⚠ 只扔**还空着**的那条（`dropOperatorPending` 自己把关）：助手先说
           *   一句再去调工具时，那句话必须留在屏幕上。
           */
          if (
            event.type !== ASSISTANT_OPERATOR_EVENTS.messageDelta &&
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
            settleDeltas()
            dropOperatorPending(messageEntryId())
            /**
             * ⚠ 旗也要放下来：`planRequest` / `stopped` / `error` 之后定稿帧
             * 永远不会来了（这条流就此结束），条目却还举着 `streaming`。
             * ⭐ **放下旗的同时序号进一位**（2026-09-07）：这一段字已经被一条
             * 工具步挡在下面了，后面再来的字是**新的一段**——写回上面那条的表现
             * 是文字长在工具组的上方，读起来像时间倒流。序号进位同时也让收尾前的
             * 占位行有一个还没被占用的 id 可挂（见 `schedulePendingAfterStep`）。
             */
            if (settleOperatorMessage(messageEntryId())) messageSeq += 1
          }
          /**
           * 攒着的计划**最多只等一帧**（第 2 件）：`plan_request` 是紧挨着 `plan`
           * 发的，所以别的帧一到就说明这一轮不会有卡了 —— 立刻落成折叠行。
           * ⛔ 不拖到流末尾再落：那样它会排在这一轮所有工具步的后面，读起来像
           * 「干完之后才想起来规划」。
           */
          if (
            event.type !== ASSISTANT_OPERATOR_EVENTS.plan &&
            event.type !== ASSISTANT_OPERATOR_EVENTS.planRequest
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
             * ⚠ 所以这里只**攒着**：`plan_request` 紧跟在下一帧（服务端那一侧写死
             * 的顺序，见 `assistant-operator.service.ts` 的「顺序是硬要求」），
             * 由它来判 —— 出卡 = 这份清单归卡，条目不落；不出卡 = 落成一行折叠。
             */
            case ASSISTANT_OPERATOR_EVENTS.plan:
              setOperatorPlannedSteps(event.steps.length)
              pendingPlanSteps = event.steps
              break
            /**
             * **计划卡**（§2.6 / §5，切片 3a）—— 出不出由客户端硬判。
             *
             * ⭐ 三件事必须在**这一帧**做完：判定 → 摆卡 → 掐流。掐流是关键的
             * 那一条：服务端并不知道客户端要不要出卡，它会接着往下跑；不掐掉的
             * 表现是「计划卡钉在流末尾等你确认，而它要问的那几步已经落到表单上
             * 了」——那张卡就成了一句事后通知。
             * ⚠ `return` 而不是 `break`：本函数就此结束，旧流的 `AbortError` 由
             *   下面那个 catch 的 `aborted` 判据吞掉。
             */
            case ASSISTANT_OPERATOR_EVENTS.planRequest: {
              // ⛔ 不出卡的那一支：攒着的那份计划落成**一行折叠**（第 2 件）。
              if (
                !shouldShowPlanCard(event, {
                  forcePlan,
                  ...(planApproved === undefined ? {} : { planApproved }),
                })
              ) {
                flushPlanEntry()
                break
              }
              // 出卡 = 这份清单归卡 —— ⛔ 别再落一条 `kind:'plan'`。
              pendingPlanSteps = null
              setOperatorPlan({
                id: nextOperatorEntryId('plancard'),
                steps: event.steps,
                questions: event.questions,
                estimate: event.estimate,
                resolved: false,
                answers: [],
              })
              setOperatorStatus('awaitingPlan')
              controller.abort()
              return
            }
            /** 逐字增量 —— 攒进缓冲，下一帧一次性写进去。 */
            case ASSISTANT_OPERATOR_EVENTS.messageDelta:
              deltaBuffer += event.text
              scheduleFlush()
              break
            /**
             * 定稿 —— 服务端那一版**整体覆盖**累积值（见 `finalizeOperatorMessage`），
             * 然后序号进一位，下一段正文另起一条。
             */
            case ASSISTANT_OPERATOR_EVENTS.message:
              settleDeltas()
              finalizeOperatorMessage(
                messageEntryId(),
                event.text,
                event.detail,
              )
              messageSeq += 1
              break
            case ASSISTANT_OPERATOR_EVENTS.step: {
              const { step } = event
              upsertOperatorStep(step, runKey)
              /**
               * ⭐ 这一步让谁看见了什么 —— 进工作记忆（切片 Y）。
               * ⚠ 放在应用 op **之前**：下面那几条分支里有 `return`（停顿点、
               *   计划卡），记在后面的话那几条路上这一步的产物就丢了。
               */
              recordOperatorArtifacts(runKey, collectStepArtifacts(step))
              // ⭐ 只在 `done` 那一次应用：`running` 也应用就会改两遍
              //    （append 类的会追加两次，而那是看得见的）。
              // ⚠ `status === 'done'` 同时把类型收窄成「应用过的那一支」——
              //    被拒的那支是 `status: 'error'`，它没有 payload / inverse。
              if (step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) {
                /**
                 * 「按你的设置直接生成」那一行（§6 拍板 24 / §5 流程图 TH）。
                 *
                 * ⭐ **命中自动通过时不静默过**：这一枪真的花了钱，而用户这一轮
                 * 一张卡都没看见。少了这一行，界面上就是「它自己发了一枪」——
                 * 而那正是钱闸这条链最不能给人的手感。
                 * ⚠ 判据是「条子在场」而不是「服务端说它命中了」：服务端那一侧
                 *   没有会话态，也就没有第二个可信来源；条子本来就是客户端发上去
                 *   的那一张，命中与否由这一步吐没吐出来说了算。
                 */
                if (
                  step.tool === ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration &&
                  getOperatorState().autoApprove
                ) {
                  const credits = step.payload.estimate.credits
                  appendOperatorEntry({
                    kind: 'system',
                    id: nextOperatorEntryId('sys'),
                    code: 'autoApproved',
                    ...(credits === undefined ? {} : { count: credits }),
                  })
                }
                const field = applyOperatorStep(step, applyContext)
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
            case ASSISTANT_OPERATOR_EVENTS.confirmRequest:
              setOperatorConfirm({
                // §6 第二档 —— 服务端恒发 `overwrite`（事件 schema 已收成必填）。
                tier: event.tier,
                field: event.field,
                have: event.have,
                proposed: event.proposed,
              })
              break
            /**
             * **花钱硬确认卡**（§6 第三档 / §3.1 ⑮–⑰）。
             *
             * ⚠ 服务端在这一帧之后自己就 `stopped/awaitingConfirm` 了 —— 这里只
             * 摆卡，⛔ 不用像计划卡那样掐流（那一帧是客户端单方面决定不往下走）。
             */
            case ASSISTANT_OPERATOR_EVENTS.spendRequest:
              setOperatorSpend({
                id: nextOperatorEntryId('spend'),
                request: event.request,
                resolved: false,
              })
              break
            /**
             * **歧义反问单选卡**（§3.3 第 5 行 / §7 四入口之四）。
             *
             * ⚠ 候选原样转成 chip 形状（`StudioOperatorAttachment`）：点中那一格
             * 直接进 `mentions`，与另外三个入口**同一条管线**。⛔ 别为这张卡另立
             * 一种「被选中的候选」——那正是「反问选出来的图与 @ 选出来的行为不
             * 一样」这类不对称的来源。
             */
            case ASSISTANT_OPERATOR_EVENTS.choiceRequest:
              setOperatorChoice({
                id: nextOperatorEntryId('choice'),
                question: event.question,
                options: event.options.map((option) => ({
                  id: option.id,
                  url: option.assetUrl,
                  label: option.label,
                  kind: 'image' as const,
                  thumbnailUrl: option.assetUrl,
                })),
                chosenId: null,
              })
              break
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
            case ASSISTANT_OPERATOR_EVENTS.stopped:
              setOperatorStatus(
                event.reason === ASSISTANT_OPERATOR_STOP_REASONS.awaitingConfirm
                  ? 'awaitingConfirm'
                  : 'idle',
              )
              break
            case ASSISTANT_OPERATOR_EVENTS.error:
              setOperatorStatus('error', describeError(event))
              break
            default:
              break
          }
        }
      } catch {
        // 半句话卡在缓冲里比丢掉更糟 —— 先落地，再谈这是不是一次 abort。
        cancelPendingAfterStep()
        flushPlanEntry()
        settleDeltas()
        dropOperatorPending(messageEntryId())
        settleOperatorMessage(messageEntryId())
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
      settleDeltas()
      dropOperatorPending(messageEntryId())
      settleOperatorMessage(messageEntryId())
      if (controller.signal.aborted) return
      // `done` 之后没有别的收尾 —— 状态没被 `stopped` / `error` 改过就是跑完了。
      if (getOperatorState().status === 'working') setOperatorStatus('idle')
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
      buildSnapshot,
      describeError,
      domain,
      flushQueue,
      locale,
      route.apiKeyId,
      route.modelId,
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

  const answerConfirm = useCallback(
    (choice: AssistantOperatorConfirmChoice) => {
      const confirm = getOperatorState().confirm
      if (!confirm) return
      void run({ confirmations: [{ field: confirm.field, choice }] })
    },
    [run],
  )

  /**
   * 反问卡「开始」（§3.1 ④ / 2026-09-06 面板轮，第 1 件）—— 带 `planAnswers`
   * + `planApproved: true` 重发。
   *
   * ⚠ `forcePlan: false` 是硬要求：这一轮的卡**已经问过了**，再带一次「先问我」
   * 会让服务端再摆一帧、客户端再出一张卡 —— 用户点「开始」之后看到的是同一张卡
   * 又回来了（一个自己喂自己的环）。
   *
   * ⚠ 答复**存进 store 那张卡里**（`resolveOperatorPlan(answers)`）：收起态那一行
   * 「你选了：…」按它写。⛔ 不存的表现是卡收起来之后只剩一句「已确认」——
   * 而用户下一秒要问的正是「我刚才选了什么」。
   */
  const answerQuestions = useCallback(
    (answers: StudioOperatorQuestionAnswer[]) => {
      /**
       * ⚠ 已经点过一次就**直接返回**（2026-09-07 真机）：`resolveOperatorPlan` 自己
       * 会挡住第二次写入，但挡不住第二次 `run()` —— 连点两下发的是两轮请求，而
       * 第二轮会把第一轮 abort 掉再从头跑一遍（用户付两次的钱、看一次的结果）。
       */
      const plan = getOperatorState().plan
      if (!plan || plan.resolved) return
      resolveOperatorPlan(answers)
      void run({ planAnswers: answers, planApproved: true, forcePlan: false })
    },
    [run],
  )

  /**
   * 计划卡「修改」（§3.1 ⑤）—— ⛔ **不发请求**。
   *
   * 面板把输入框预填成「修改计划：」并聚焦；用户按发送时那条消息带
   * `planApproved: false`（= 把答复并进上下文**重新规划一次**）。这里只负责
   * 记下「下一条消息是一次改计划」，⛔ 别顺手替用户发出去：他还没写要改什么。
   */
  const revisePlan = useCallback(() => {
    if (!getOperatorState().plan) return
    reviseRef.current = true
    setOperatorStatus('idle')
  }, [])

  /**
   * 花钱硬确认卡「生成」（§3.1 ⑰）。
   *
   * 两步，顺序有意义：
   *  ① 勾了「不再问」就先把条子记进 store（会话级，§6 拍板 24）——
   *    ⚠ 必须在重发**之前**，否则这一轮自己带不上它，用户会看到「我明明勾了，
   *    它还是问了我一次」；
   *  ② 带条子重发 —— 服务端这次放行并吐 `request_generation`，`applyOperatorStep`
   *    把它交给宿主那只手（`host.triggerGeneration`）。扳机仍然是客户端扣的。
   * ⚠ 算不出金额（`credits === undefined`）时**不记条子**：作用域第三条要素是
   *   「不超上次金额」，没有金额就没有可比的上限，记一张永远匹配不上的条子只会
   *   让用户以为自己已经关掉了确认。
   */
  const answerSpend = useCallback(
    (input: { rememberForSession: boolean }) => {
      const spend = getOperatorState().spend
      if (!spend || spend.resolved) return
      const credits = spend.request.estimate.credits
      if (input.rememberForSession && credits !== undefined) {
        setOperatorAutoApprove({
          tier: ASSISTANT_OPERATOR_CONFIRM_TIER_IDS.spend,
          model: spend.request.model.id,
          maxCredits: credits,
        })
      }
      resolveOperatorSpend()
      void run({ forcePlan: false })
    },
    [run],
  )

  /** 花钱卡「取消」—— 流已经停了，什么都不用发；把卡收掉即可。 */
  const cancelSpend = useCallback(() => {
    setOperatorSpend(null)
    setOperatorStatus('idle')
  }, [])

  /**
   * 歧义反问单选卡点中一格（§3.3 第 5 行 / §7）。
   *
   * ⭐ 走的是**四入口那条同一条 chip 管线**：插一枚 @chip、把它作为这一轮的
   * `mentionedAssets` 端上去，然后带上下文重发。⛔ 没有第二条「被选中的候选」
   * 通道 —— 服务端那一侧只认 `mentionedAssets` 这一张名单。
   * ⚠ `text` 由面板给（i18n 在那一层）：hook 里没有词表，硬编一句中文会在英文
   *   界面上原样印出来。
   */
  const answerChoice = useCallback(
    (option: StudioOperatorAttachment, text: string) => {
      const choice = getOperatorState().choice
      if (!choice || choice.chosenId) return
      resolveOperatorChoice(option.id)
      addOperatorMention(option)
      pendingResultRef.current = null
      appendOperatorEntry({
        kind: 'user',
        id: nextOperatorEntryId('user'),
        text,
        attachments: [option],
      })
      void run({ forcePlan: false })
    },
    [run],
  )

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

  // 就地确认条长在参数栏，续跑的能力在这里 —— 挂载时把它注册进模块 store。
  useEffect(() => {
    registerOperatorRunner({ resume: answerConfirm })
    return () => registerOperatorRunner(null)
  }, [answerConfirm])

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
    routeModelId: route.modelId,
    send,
    stop,
    cancelQueued,
    answerConfirm,
    answerQuestions,
    revisePlan,
    answerSpend,
    cancelSpend,
    answerChoice,
    critique,
    newThread,
  }
}
