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
  ASSISTANT_OPERATOR_APPEND_SEPARATOR,
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  ASSISTANT_OPERATOR_CONFIRM_FIELDS,
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS,
  ASSISTANT_OPERATOR_ERROR_MESSAGE_KEYS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
  ASSISTANT_PROVIDER_ERROR_MESSAGE_KEYS,
  ASSISTANT_AUTO_GENERATE_LIMITS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_TOOL_VERBS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
  ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_WRITE_MODES,
  GENERATION_REVIEW_STATE_IDS,
  contextCardAnswerId,
  OPERATOR_CONTEXT_CARD_CHOICE_IDS,
  OPERATOR_CONTEXT_CARD_CHOICE_LABELS,
  OPERATOR_LORA_SETUP_CHOICE_IDS,
  OPERATOR_LORA_SETUP_CHOICE_LABELS,
  loraSetupAnswerId,
  overwriteAnswerId,
  type AssistantOperatorConfirmChoice,
  type AssistantOperatorConfirmField,
  type AssistantOperatorDomain,
} from '@/constants/assistant-operator'
import {
  ASSISTANT_MENTION_LIMITS,
  ASSISTANT_MENTION_SCOPE_IDS,
} from '@/constants/assistant-mention'
import { getAssistantRouteModelEntry } from '@/constants/assistant-persona'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
  getProviderLabel,
} from '@/constants/providers'
import { ASSISTANT_V3_CLIP_LIMITS } from '@/constants/assistant-v3'
import { AI_MODELS } from '@/constants/models'
import { CONTEXT_CARD_STATUS_IDS } from '@/constants/context-cards'
import {
  STUDIO_OPERATOR_BENCH_OPEN_POLL_MS,
  STUDIO_OPERATOR_LIBRARY_SHOW_SETTLE_MS,
  STUDIO_OPERATOR_BENCH_OPEN_TIMEOUT_MS,
  STUDIO_OPERATOR_CONFIRM_STATUS_IDS,
  STUDIO_OPERATOR_FIELD_IDS,
  STUDIO_OPERATOR_SKIPPED_REJECT_REASONS,
  STUDIO_OPERATOR_STREAMING,
  type StudioOperatorField,
  type StudioOperatorGenerateKnob,
} from '@/constants/studio-assistant-operator'
import {
  useStudioOperatorBenchKey,
  useStudioOperatorHost,
} from '@/contexts/studio-operator-host'
import {
  addOperatorMention,
  appendOperatorEntry,
  appendOperatorPendingResult,
  appendOperatorPending,
  appendOperatorRoundSummary,
  clearOperatorPrompts,
  clearOperatorQueue,
  dropOperatorPending,
  settleOperatorStreaming,
  setOperatorBenchOpen,
  setOperatorOutOfSteps,
  enqueueOperatorMessage,
  finalizeOperatorMessage,
  appendOperatorStreamingMessage,
  appendOperatorThinking,
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
  useStudioOperatorState,
  takeOperatorQueue,
  upsertOperatorStep,
} from '@/hooks/use-studio-operator-store'
import {
  libraryShowSettled,
  readLibraryView,
  requestLibraryShow,
} from '@/hooks/use-library-view'
import {
  getOperatorVoicePrefs,
  speakOperatorReply,
} from '@/hooks/use-operator-voice'
import { getGenerationErrorMessage } from '@/lib/api-error-message'
import { splitSpokenSegments } from '@/lib/spoken-segments'
import { studioBenchHref } from '@/lib/studio-shell-route'
import { studioLibraryShowPath } from '@/constants/studio-shell'
import {
  assistantBenchPath,
  assistantBenchReached,
  assistantWorkspaceKey,
} from '@/lib/assistant-workspace'
import { useRouter } from '@/i18n/navigation'
import { canvasCapabilityRuntime } from '@/lib/canvas-capability-runtime'
import {
  describeMentionNote,
  isLookableMention,
  toMentionRef,
} from '@/lib/assistant-mention'
import { buildCanvasGenerationRequest } from '@/lib/studio-operator-canvas-snapshot'
import { collectStepArtifacts } from '@/lib/studio-operator-artifacts'
import { collectOperatorPriorFinds } from '@/lib/studio-operator-timeline'
import {
  captureTurnClips,
  resolveTurnClips,
} from '@/lib/assistant-pointed-clips'
import { streamAssistantOperatorAPI } from '@/lib/api-client/assistant-operator'
import { importWebImageAPI } from '@/lib/api-client/web-image-import'
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
  getOperatorStepField,
} from '@/lib/studio-operator-apply'
import { bumpAssistantAvatar } from '@/lib/studio-operator-avatar-bump'
import { flashAssistantTouchedField } from '@/lib/studio-operator-flash'
import {
  describeCharacterImagesDecisionText,
  describeCharacterImagesProposalText,
  describeCharacterProfileDecisionText,
  describeCharacterProfileProposalText,
  describeContextCardDecisionText,
  describeContextCardProposalText,
  clampPlanAnswer,
  describeLoraSetupDecisionText,
  describeChatModeSwitch,
  describeDomainSwitch,
  historyToOperatorMessages,
  historyToPriorSteps,
  readOperatorReferenceProfiles,
} from '@/lib/studio-operator-history'
import {
  readOperatorWrittenText,
  writeOperatorWrittenText,
} from '@/lib/studio-operator-authorship'
import {
  failedResumeStep,
  firstUnfinishedStepId,
  hasUnfinishedSteps,
  toResumeFrom,
} from '@/lib/studio-operator-resume'
import { mergeNegativePrompt } from '@/lib/lora-source-match-prompt'
import type { PromptAssistantResponseLanguage } from '@/types'
import { AssistantLoraParametersSchema } from '@/types/assistant-operator'
import type {
  AssistantLoraParameters,
  AssistantOperatorBenchOpen,
  AssistantOperatorCharacterProfileFieldDraft,
  AssistantOperatorConfirmDecision,
  AssistantOperatorContextCardDraft,
  AssistantOperatorGenerationRequest,
  AssistantOperatorMessage,
  AssistantOperatorMissingKey,
  AssistantOperatorPlanAnswer,
  AssistantOperatorResumeFrom,
  AssistantOperatorPriorStep,
  AssistantOperatorRequest,
  AssistantOperatorStep,
} from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'
import type { AssistantMention } from '@/types/assistant-mention'
import type {
  StudioOperatorAttachment,
  StudioOperatorErrorTrace,
  StudioOperatorQuestion,
  StudioOperatorQuestionAnswer,
  StudioOperatorQuestionAnswered,
  StudioOperatorQuestionPrompt,
  StudioOperatorThreadEntry,
} from '@/types/studio-assistant-operator'

/**
 * 帧上那两样诊断字段 → 错误条第二、三段。
 *
 * ⚠ 没有 `traceId` 就整块不画（`GenerationError` 那一族本来就说得出原因），
 * ⛔ 不为它编一个短码 —— 编出来的号在日志里查不到，比没有更糟。
 */
/**
 * 🔊 开着、这段是用着角色的她说的（②c-2）：念出来。聊天整段念；开着台只念开头和收尾两段，
 * 中间的正文只出字（`splitSpokenSegments`）。
 */
function speakIfVoiceOn(
  event: { text: string; chat?: true; spoken?: true },
  id: string,
) {
  if (!event.spoken || !getOperatorVoicePrefs().on) return
  const text = event.text.trim()
  if (!text) return
  if (event.chat) {
    void speakOperatorReply(id, text)
    return
  }
  const { opening, closing } = splitSpokenSegments(text)
  void speakOperatorReply(id, [opening, closing].filter(Boolean).join('\n\n'))
}

function toErrorTrace(payload: {
  traceId?: string | undefined
  detail?: string | undefined
}): StudioOperatorErrorTrace | null {
  if (!payload.traceId) return null
  return {
    traceId: payload.traceId,
    ...(payload.detail ? { detail: payload.detail } : {}),
  }
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
      messages.push({
        role: 'user',
        content: `${entry.text}${attachmentNote}${describeMentionNote(entry.mentions ?? [])}`,
      })
    } else if (entry.kind === 'message') {
      /**
       * ⚠ **空助手行不进对话**（2026-09-12 真机 bug）：出错 / 被打断的那一轮会
       * 在时间线上留一条正文为空的助手行，而它进了 `messages` 之后模型读到的是
       * 「上一轮我已经答过了」—— 于是它把用户那句还没被回应的话当成翻过篇的。
       * ⛔ 渲染那一侧不动：那一行归它自己判要不要画。
       */
      if (!entry.text.trim()) continue
      messages.push({ role: 'assistant', content: entry.text })
    } else if (entry.kind === 'system' && entry.userText) {
      /**
       * ⭐ **答过的题也是用户说过的话**（v2 §3.4 落账规则，2026-09-12 真机 bug）。
       *
       * 从前这一行只是 UI 上的「你选了 X」，而结构化答复只跟着**当次**请求走
       * （`planAnswers`）。于是用户答了第二张卡之后，第一张卡的答案在请求里
       * 一个字都不剩 —— 模型第三次问「2D 手绘还是 3D 渲染」。
       * ⚠ 渲染那一侧不变：它照旧是一行系统行（⛔ 不画成气泡）。
       */
      messages.push({
        role: 'user',
        content: entry.userText,
        ...(entry.answered
          ? { answered: clampPlanAnswer(entry.answered) }
          : {}),
      })
    } else if (entry.kind === 'system' && entry.code === 'checkpointRestored') {
      messages.push({
        role: 'assistant',
        content:
          '[Workspace event: the creator restored a configuration checkpoint. Use the current form snapshot; earlier tool settings are historical.]',
      })
    } else if (entry.kind === 'chatMark') {
      messages.push({
        role: 'assistant',
        content: describeChatModeSwitch(entry.character?.name ?? null),
      })
    } else if (entry.kind === 'domainMark') {
      messages.push({
        role: 'assistant',
        content: describeDomainSwitch(entry.domain),
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
  const lastUserIndex = entries.findLastIndex((entry) => entry.kind === 'user')
  for (const [index, entry] of entries.entries()) {
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
      ...(entry.step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error
        ? {
            rejectReason: entry.step.error.reason,
            ...(entry.step.error.detail
              ? {
                  detail: entry.step.error.detail.slice(
                    0,
                    ASSISTANT_OPERATOR_LIMITS.maxReasonChars,
                  ),
                }
              : {}),
          }
        : {}),
      ...(index > lastUserIndex ? { thisTurn: true as const } : {}),
    })
  }
  return steps.slice(-ASSISTANT_OPERATOR_LIMITS.maxPriorSteps)
}

/**
 * **这两格现在的字是不是助手自己写的**（2026-09-12 实测第 1 组 ②）。
 *
 * ⭐ 它答的是覆盖三选那道题的前提：那道题问「你**手写**的那一段怎么办」，而助手
 * 上一轮 `set_prompt` 落下的字不是用户手写的 —— 对着自己的上一版再问一次，用户
 * 读到的是「你已经自己写过了」而他一个字都没打过（实测 #6 / #7）。
 * 服务端的 `assistantWrittenFields` 只活一轮，跨轮那一半的真值在客户端手里。
 *
 * ⚠ 判据是**逐字相同**，不是「登记簿里有这个字段」：登记簿的 ✦ 在用户手改之后
 *   仍然挂着（它记的是「助手碰过这一格」），拿它当判据等于把用户改过的字也算成
 *   助手的，那才是真正会吃掉手写内容的那一种错。
 * ⚠ 撤销过的那一步不算（`entry.undone`）：撤销之后表单回到的是用户那一版。
 * ⚠ 只读本次会话的条目 —— 载回来的历史条目类型上就没有 `payload`
 *   （见 `types/studio-operator-history.ts`），刷新之后退回「照问一次」。
 */
/** 一步 `set_prompt` / `set_negative` 写完之后整格的原文（追加那一支拼回全文）。 */
function writtenTextOf(step: AssistantOperatorStep): string | undefined {
  if (
    step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done ||
    (step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.setPrompt &&
      step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.setNegative)
  )
    return undefined
  // ⚠ 追加那一支要拼回**它写完之后的完整原文**：`payload.value` 只是接在
  //   后面的那一截，拿它去比永远比不中。分隔符复用协议里那个。
  return step.payload.mode === ASSISTANT_OPERATOR_WRITE_MODES.append &&
    step.inverse.value
    ? `${step.inverse.value}${ASSISTANT_OPERATOR_APPEND_SEPARATOR}${step.payload.value}`
    : step.payload.value
}

/**
 * 比「这段是不是助手写的」时的口径：按逗号分段、去空白再拼回。
 * ⚠ 标签台（与刷新后的草稿回灌）会把提示词按标签块重新拼一遍，逗号后的空格
 * 变了就逐字对不上 —— 实跑 09-24：助手自己上一轮写的标签被当成用户手写，又问
 * 了一遍「追加 / 覆盖 / 保留」。
 */
function authorshipKey(text: string): string {
  return text
    .split(',')
    .map((piece) => piece.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(', ')
}

function buildAuthoredByAssistant(
  entries: readonly StudioOperatorThreadEntry[],
  snapshot: AssistantOperatorRequest['snapshot'],
  changes: ReturnType<typeof getOperatorState>['changes'],
): AssistantOperatorConfirmField[] {
  const fields: {
    field: AssistantOperatorConfirmField
    tool: AssistantOperatorStep['tool']
    current: string
  }[] = [
    {
      field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
      current: snapshot.prompt,
    },
    {
      field: ASSISTANT_OPERATOR_CONFIRM_FIELDS.negative,
      tool: ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
      current: snapshot.negativePrompt ?? '',
    },
  ]
  const out: AssistantOperatorConfirmField[] = []
  for (const { field, tool, current } of fields) {
    if (!current.trim()) continue
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]
      if (entry?.kind !== 'step') continue
      const step = entry.step
      if (step.tool !== tool) continue
      if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) continue
      if (entry.undone) break
      if (
        step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.setPrompt &&
        step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.setNegative
      ) {
        break
      }
      const written = writtenTextOf(step)
      if (
        written !== undefined &&
        authorshipKey(written) === authorshipKey(current)
      )
        out.push(field)
      break
    }
    // ⭐ 线程里找不到（开了新对话）就问登记簿：它跨会话留着助手上一次写下的全文。
    // ⭐ 刷新之后内存登记簿是空的，再问盘上那一份（按域落的全文）。
    const written =
      changes[field]?.writtenText ??
      readOperatorWrittenText(getOperatorState().domain, field)
    if (
      !out.includes(field) &&
      written !== undefined &&
      authorshipKey(written) === authorshipKey(current)
    )
      out.push(field)
  }
  return out
}

/**
 * 用户这一轮 `@` 上来的那几张图 —— **只取最后一条用户消息上的**。
 *
 * ⭐ 判据是「这一轮他指着说的是哪几张」：把整条线程里所有附件都端上去，助手会
 * 拿三轮之前那张图去回答现在这句话，而 `targetIds` 的准入名单也会一路膨胀 ——
 * 「@ 指定任意图可看」（拍板 4 推翻）随即退化成「历史上出现过的都能看」。
 * ⚠ 只收图：视频 / 音频 / 3D 看图那条线吃不下，端上去只会换来一份格式完整、内容全编的
 * 评价（`vision-route.service.ts` 头注）；v3 的片子另走 `videoClips`。
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

/** 最后那条用户消息 `@` 了什么（统一引用模型，§10b）。 */
function lastUserMentions(
  entries: readonly StudioOperatorThreadEntry[],
): readonly AssistantMention[] {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry?.kind !== 'user') continue
    return entry.mentions ?? []
  }
  return []
}

/**
 * 最后那条消息带的视频 / 音频（媒体理解那条线）：📎 的那几条，加上从结果 / 素材库
 * `@` 上来的那几条。⚠ 画布上的卡不算 —— 那些助手从板子上读，⛔ 不另送一份媒体。
 */
function lastUserMedia(
  entries: readonly StudioOperatorThreadEntry[],
): { kind: 'video' | 'audio'; url: string; label: string }[] {
  const media: { kind: 'video' | 'audio'; url: string; label: string }[] = []
  for (const attachment of lastUserAttachments(entries)) {
    if (attachment.kind !== 'video' && attachment.kind !== 'audio') continue
    media.push({
      kind: attachment.kind,
      url: attachment.url,
      label: attachment.label,
    })
  }
  for (const mention of lastUserMentions(entries)) {
    if (mention.scope === ASSISTANT_MENTION_SCOPE_IDS.canvas || !mention.url)
      continue
    if (mention.kind !== 'video' && mention.kind !== 'audio') continue
    if (media.some((item) => item.url === mention.url)) continue
    media.push({ kind: mention.kind, url: mention.url, label: mention.label })
  }
  return media.slice(0, ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences)
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
): NonNullable<AssistantOperatorRequest['mentionedAssets']> {
  /**
   * ⚠ 只放图：片子走 `videoClips`（看图期第二段），放进这张名单只会被当成一张下不来的图。
   * ⭐ `@` 的在前、📎 的在后：看图上限（`ASSISTANT_MENTION_LIMITS.lookImages`）截的是
   * 名单前几张，指名道姓的那几张先占位。同一张图两边都有时只算一次（按地址）。
   * ⚠ 画布的卡带 `nodeId` 上去 —— 服务端按它认卡，⛔ 不再按名字。
   */
  const pointed: (StudioOperatorAttachment & { nodeId?: string })[] =
    lastUserMentions(entries).flatMap((mention) =>
      isLookableMention(mention, false) && mention.url
        ? [
            {
              id: mention.generationId ?? mention.id,
              url: mention.url,
              label: mention.label,
              kind: mention.kind === 'video' ? 'video' : 'image',
              ...(mention.seq === undefined ? {} : { seq: mention.seq }),
              ...(mention.nodeId ? { nodeId: mention.nodeId } : {}),
            },
          ]
        : [],
    )
  const attached = lastUserAttachments(entries).filter(
    (attachment) =>
      attachment.kind === 'image' &&
      !pointed.some((item) => item.url === attachment.url),
  )
  return [...pointed, ...attached]
    .slice(0, ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences)
    .map((attachment: StudioOperatorAttachment & { nodeId?: string }) => {
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
        ...(attachment.nodeId ? { nodeId: attachment.nodeId } : {}),
        ...(reviewState === GENERATION_REVIEW_STATE_IDS.pending
          ? {}
          : { reviewState }),
      }
    })
}

/**
 * 上下文卡那一下的**落账两件套**（§3.4 落账规则，2026-09-12 真机 bug）。
 *
 * ⭐ 一条自带题面的正文 + 同一件事的结构化那一半 —— 判据与问题卡答复逐字同源：
 * 少了它们，「用户对这张卡表过态」这件事在下一轮的请求里一个字都不剩，模型于是
 * 每开一条流就重提同一张卡，用户当前那句话一件事都办不成。
 */
/** 覆盖三选那一支的选项 id 就是 `confirmations` 要带回去的那三个值。 */
function toConfirmChoice(
  optionId: string | undefined,
): AssistantOperatorConfirmChoice | undefined {
  return (
    Object.values(ASSISTANT_OPERATOR_CONFIRM_CHOICES) as (string | undefined)[]
  ).includes(optionId)
    ? (optionId as AssistantOperatorConfirmChoice)
    : undefined
}

function contextCardDecision(
  card: { kind: string; name: string },
  choice: keyof typeof OPERATOR_CONTEXT_CARD_CHOICE_LABELS,
): { userText: string; answered: AssistantOperatorPlanAnswer } {
  const label = OPERATOR_CONTEXT_CARD_CHOICE_LABELS[choice]
  return {
    userText: describeContextCardDecisionText(card.name, label),
    answered: {
      questionId: contextCardAnswerId(card.kind, card.name),
      optionIds: [choice],
      question: describeContextCardProposalText(card.name),
      optionLabels: [label],
    },
  }
}

/**
 * 搭配卡那一下的**落账两件套**（lora-assistant §12）—— 判据与 `contextCardDecision`
 * 同源：一条自带题面的正文 + 结构化那一半。少了它们，「创作者已经在这张卡上表过态」
 * 在下一轮的请求里一个字都不剩，模型于是重提同一张卡。
 */
function loraSetupDecision(
  question: string,
  choice: (typeof OPERATOR_LORA_SETUP_CHOICE_IDS)[keyof typeof OPERATOR_LORA_SETUP_CHOICE_IDS],
): { userText: string; answered: AssistantOperatorPlanAnswer } {
  const label = OPERATOR_LORA_SETUP_CHOICE_LABELS[choice]
  return {
    userText: describeLoraSetupDecisionText(question, label),
    answered: clampPlanAnswer({
      questionId: loraSetupAnswerId(question),
      optionIds: [choice],
      question,
      optionLabels: [label],
    }),
  }
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
  canvasSteps?: number
  runKey?: string
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
  /** v3：上一跳收到的本轮记录，画布接力时原样带回（⛔ 新一轮不带）。 */
  v3Transcript?: AssistantV3Transcript
  /** v3：这一轮抽好的那几段片子，接力时原样带回（⛔ 不重抽）。 */
  videoClips?: AssistantOperatorRequest['videoClips']
  /** 回答底下「用 Grok 搜这一次」发出的那一轮（owner 2026-10-14）：只管这一跳。 */
  searchWithGrok?: boolean
  /** 开台换过来的那一跳（第 9e 步）：占位行写「正在想」，⛔ 不写「正在画布上落地」。 */
  benchArrival?: boolean
}

/** 创作者浏览器的时区（联网时 Claude / GPT 偏向当地结果）；取不到就不发。 */
function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

export interface UseAssistantOperatorResult {
  domain: AssistantOperatorDomain
  /**
   * 说一句。
   *
   * ⚠ **干活时不再 abort**（本片改口）：那一句进队列，等下一个工具步边界。
   * 排队条上的「撤回」走 `cancelQueued`，真要掐掉走 `stop()`。
   * `searchWithGrok`：「用 Grok 搜这一次」发的那一句（只在闲着时生效，排队带不上）。
   */
  send(
    text: string,
    attachments?: readonly StudioOperatorAttachment[],
    options?: {
      searchWithGrok?: boolean
      mentions?: readonly AssistantMention[]
    },
  ): void
  /** ⏹ —— 彻底叫停（拍板 13）。**连队列一起清**：叫停的是「接下来的一切」。 */
  stop(): void
  /** 撤回一条还没轮到的排队消息（§3.1 ㉔）—— 丢弃不发，线程里留一行交代。 */
  cancelQueued(id: string): void
  /**
   * **问题卡答复**（§3.4）—— 一次一道题；整组答完卡消失，时间线落「问题 · 答案」。
   *
   * ⭐ 面板只交 id（2026-10-14）：文案、缩略图、覆盖三选那一档全由 hook 从卡上取。
   * ⚠ `optionIds` 空且没有 `otherText` = **跳过**这一题（「跳过」/ Esc）。
   */
  answerQuestion(
    answer: StudioOperatorQuestionAnswer,
    options?: {
      /** 打字作答时那句话里挂的图（@ / 📎）。 */
      attachments?: readonly StudioOperatorAttachment[]
    },
  ): void
  /** 「全部用推荐」—— 当前与之后每道题都取推荐项，整组一次发（2026-10-14）。 */
  acceptRecommendedQuestions(): void
  /** 「← 上一题」—— 退一格答复，回到那一道题、勾选放回（56b 切片 4）。 */
  goBackQuestion(): void
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
  /**
   * 输入框上方规格行就地改一颗（D12 B6）—— 同一条写回通道，⛔ 不进登记簿。
   * @returns 换模型顺手回落掉的那几颗。
   */
  setGenerationKnob(
    knob: StudioOperatorGenerateKnob,
    value: string,
  ): readonly StudioOperatorGenerateKnob[]
  /** 生成确认卡「确认生成」（§5）—— **客户端扣扳机**，⛔ 不重发一轮。 */
  confirmGeneration(options?: {
    auto?: boolean
    /** 多张那一张卡（队列条）：留下来真去跑的那几张；不给 = 全部。 */
    nodeIds?: readonly string[]
  }): void
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
  /**
   * **搭配卡「应用这套搭配」**（lora-assistant §12）—— 客户端逐行应用（卸下 → 权重 →
   * 参数 → 新挂），每行一条带 `inverse` 的 step（这一轮的「撤销」撤在它们身上），
   * 落一行账。⛔ 不新开一轮。连点两下只应用一次。
   */
  applyLoraSetup(): Promise<void>
  /** **搭配卡「先不用」** —— 什么都不动，照样落一行账。 */
  dismissLoraSetup(): void
  /**
   * **设定提议卡「收下勾选的」**（卡片助手 C2）—— 勾中的那几格（「只留我写的」已在
   * 卡上去掉助手补的句子）交给角色页写进角色，成功失败都落一行账。
   * ⚠ 一格都没勾时不写；连点两下只写一次（撞在「卡已经不是 idle」上）。
   */
  keepCharacterProfile(
    fields: readonly AssistantOperatorCharacterProfileFieldDraft[],
  ): Promise<void>
  /** **设定提议卡「不用」** —— 什么都不写，但照样落一行「没收」的账。 */
  dismissCharacterProfile(): void
  /**
   * **候选图卡「挂上勾选的」**（卡片助手 C3）—— 网上那几张先存进素材库，再交给角色页
   * 挂到角色上；成功失败都落一行账。连点两下只挂一次。
   */
  keepCharacterImages(keys: readonly string[]): Promise<void>
  /** **候选图卡「不用」** —— 什么都不存，照样落一行账。 */
  dismissCharacterImages(): void
  /** **「放大」**（画布，P6）—— 那几张卡各自放大成新版本。 */
  acceptUpscale(): void
  /** **「先不要」** —— 什么都不放大，落一行账。 */
  dismissUpscale(): void
  /** 「已取消」那一态上的「再来一次」—— 摆一张新的 `idle` 卡。 */
  retryGeneration(): void
  /**
   * 结果卡上的**「再来一组」**（v2 §6.2）—— 参数原样，直接出一张新的生成确认卡。
   *
   * ⚠ ⛔ 不直接扣扳机：花钱这件事只有确认卡一个入口（见实现处头注）。
   */
  rerunGeneration(
    request: AssistantOperatorGenerationRequest,
    /** 卡一出来就展开的那颗（失败行「换个模型」）。 */
    openKnob?: StudioOperatorGenerateKnob,
  ): void
  /**
   * ＋新对话（拍板 10）—— 只清线程，改动与撤销本钱留着。
   * ⚠ 撤销 / 还原**不在这个接口里**：它们有两个宿主（日志条 + 参数栏的 ✦），
   *   住在 `use-studio-operator-revert.ts` 里，两边各自取用同一份。
   */
  newThread(): void
}

export function useAssistantOperator(
  scope: string | null,
): UseAssistantOperatorResult {
  /**
   * ⭐ **表单从宿主读、往宿主写**（P4-C）：工作台与 LoRA 装配台各给一份同形状的
   * 东西（`contexts/studio-operator-host.tsx`）。此前这里直接 `useStudioForm()`，
   * 而 `/studio/lora` 故意不挂 `<StudioProvider>` —— 那条路上这个 hook 会直接抛。
   */
  const host = useStudioOperatorHost()
  const { domain, buildSnapshot, setOpen } = host
  const router = useRouter()
  const { localThreadId } = useStudioOperatorState()
  const workspaceKey = assistantWorkspaceKey(host.workspace, host.projectId)
  const isCurrentThread = useCallback(() => {
    const current = getOperatorState()
    return (
      scope !== null &&
      current.threadScope === scope &&
      current.localThreadId === localThreadId
    )
  }, [scope, localThreadId])
  const applyContext = host.apply
  const locale = useLocale()
  const tError = useTranslations('StudioOperator.error')
  /** 卡上就地改参数那几条 step 的文案（§5.2 第二行）—— i18n 只能在 React 层拿。 */
  const tConfirm = useTranslations('StudioOperator.confirm')
  const tContinueAsk = useTranslations('StudioOperator.continueAsk')
  /** 问题卡答复那一句（给模型与库读，2026-10-14 起走词表）。 */
  const tQuestion = useTranslations('StudioOperator.question')
  const tErrors = useTranslations('Errors')
  /**
   * 一句给用户看的失败文案（见 `ASSISTANT_OPERATOR_ERROR_MESSAGE_KEYS` 头注）。
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
      missingKey?: AssistantOperatorMissingKey
      provider?: AssistantOperatorMissingKey
    }): string => {
      // 选定的模型缺 key：点名是哪个模型、缺哪一家的 key（owner 2026-10-15，⛔ 换别家顶上）。
      if (
        payload.errorCode === ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE &&
        payload.missingKey
      )
        return tError('modelKeyMissing', {
          model:
            getAssistantRouteModelEntry(payload.missingKey.modelId)?.label ??
            payload.missingKey.modelId,
          provider: getProviderLabel(
            getDefaultProviderConfig(payload.missingKey.adapterType),
          ),
        })
      // 厂商那边额度用完 / key 失效：点名是哪一家、哪个型号，出路写在话里（10-27）。
      const providerKey = payload.errorCode
        ? ASSISTANT_PROVIDER_ERROR_MESSAGE_KEYS[payload.errorCode]
        : undefined
      if (providerKey && payload.provider)
        return tError(providerKey, {
          model:
            getAssistantRouteModelEntry(payload.provider.modelId)?.label ??
            payload.provider.modelId,
          provider: getProviderLabel(
            getDefaultProviderConfig(payload.provider.adapterType),
          ),
        })
      const key = payload.errorCode
        ? ASSISTANT_OPERATOR_ERROR_MESSAGE_KEYS[payload.errorCode]
        : undefined
      if (key) return tError(key)
      return getGenerationErrorMessage(tErrors, payload, payload.error)
    },
    [tError, tErrors],
  )

  const abortRef = useRef<AbortController | null>(null)
  /**
   * 「下一条消息是一次改计划」（§3.1 ⑤）。
   *
   * ⚠ 走 ref 不走 state：它只在 `send()` 里被读一次然后清掉，进 state 只会多一次
   * 重渲染。⚠ **一次性**：改完计划那一轮之后它就不再是「改计划」了，留着的表现是
   * 此后每一条消息都在要求助手重新规划。
   */
  const reviseRef = useRef(false)
  /**
   * ⭐ 新内核（第 5b 步，owner 2026-10-23）：⛔ 不自动看图。不管是不是自动按的，
   * 出完都停下问一句「按这个方向继续吗？」；创作者点了或开口了，
   * 助手才去看这批图、接着改。图落地那一刻（画布：那张卡的产出图换了；工作台：那张
   * 结果卡收齐了）钉出这张问题卡；⚠ 用户在那之前开口了就作废。
   */
  const autoReviewRef = useRef<
    | { kind: 'canvas'; nodeId: string; before: string | undefined }
    | { kind: 'result'; resultId: string }
    | null
  >(null)

  useEffect(
    () => () => {
      abortRef.current?.abort()
      abortRef.current = null
    },
    [scope, localThreadId],
  )

  /**
   * 「再跑一轮」的自引用口。
   *
   * ⚠ 走 latest-ref 而不是在 `run` 里直接调 `run`：那样 `useCallback` 的依赖表
   * 里要写它自己，是个解不开的环。停顿点接住排队消息之后要立刻起下一轮，
   * 而那一刻正在 `run` 的 `for await` 里。
   */
  const runRef = useRef<((options?: RunOptions) => void) | null>(null)
  /** `confirmGeneration` 的自引用口 —— 流收尾时按自动生成开关替你按下（D12 S-C）。 */
  const decideUpscaleRef = useRef<
    ((accepted: boolean, options?: { auto?: boolean }) => void) | null
  >(null)
  const confirmGenerationRef = useRef<
    ((options?: { auto?: boolean }) => void) | null
  >(null)

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
        ...(item.mentions?.length ? { mentions: item.mentions } : {}),
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
      if (!isCurrentThread() || !workspaceKey) return
      const {
        confirmations,
        planAnswers,
        planApproved,
        resumeFrom,
        searchWithGrok,
      } = options
      const timeZone = browserTimeZone()
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const isCurrentRun = () => !controller.signal.aborted && isCurrentThread()

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
      const runKey = options.runKey ?? nextOperatorEntryId('run')
      const continuationPrefix = options.runKey
        ? `continuation-${options.canvasSteps ?? 0}:`
        : ''

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
      const messageEntryId = () =>
        `${runKey}:${continuationPrefix}msg-${messageSeq}`
      /**
       * 这一次模型调用的增量写进了哪几条正文（按先后）。定稿帧到达时它们就是这一段的全部。
       * 🔬 2026-10-25 真机：模型先说一句、再联网查（厂商自己跑的那一步在流的**中途**落进
       * 线程，压在这句下面），定稿帧随后到 —— 按「被压在下面就另起一条」它会把同一句话
       * 再写一遍，每查一次就重复一句。
       */
      let deltaEntryIds: string[] = []
      /**
       * ⚠ 画布接力那一跳（`runKey` 由上一跳带来）：此刻在等的是刚落下的那批改动
       * 回到服务端、助手接着往下做 —— 占位行写「正在画布上落地…」而不是「正在想…」。
       */
      appendOperatorPending(
        messageEntryId(),
        options.runKey && !options.benchArrival ? 'landing' : undefined,
      )
      /**
       * ⭐ **⏹ / 插话掐掉这一轮时，占位行当场收掉**（2026-10-17 真机：按了 ⏹，
       * 「你叫停了当前工作」已经落下，上面那行「正在想… 795 秒」还在一直数）。
       * 下面每一条收尾路径都先判 `isCurrentRun()`，而 abort 之后它恒为假 ——
       * 于是空占位行永远没人拆、写到一半的正文光标永远挂着。收尾挂在 abort 上，
       * 与是从哪条路径掐的无关。⚠ 同步触发：插话的新一轮在 abort 之后才挂自己的占位行。
       */
      controller.signal.addEventListener(
        'abort',
        () => {
          if (!isCurrentThread()) return
          dropOperatorPending(messageEntryId())
          settleOperatorStreaming()
        },
        { once: true },
      )

      /**
       * 攒着的那份计划（第 2 件）—— `plan` 帧到达时只存不落，由紧跟的
       * 多步确认帧判定去向。⚠ 判定之外还有两条出口：流以别的方式收尾
       * （服务端压根没摆确认卡）时也要把它落下去，⛔ 不能凭空吞掉一份计划。
       */
      /**
       * 这一轮是以 `done` 收的吗（2026-09-12 实测第 2 组 ②）。
       *
       * ⭐ 续跑 chip 的去留只认它：`done` 之后再显示「从第 N 步继续」是**假的**
       * ——实测查证轮正常收尾仍挂着那颗按钮（模型自己收尾、计划里剩下的几格永远
       * 停在 `pending`，而那几步它已经决定不做了）。
       * ⛔ `stopped` / 报错那两支不置：那正是续跑存在的理由。
       */
      let roundFinished = false
      let terminalReceived = false
      /**
       * 流没等到终态就断了 —— 在线程里落一行（随会话落库），断流才量得到
       * （assistant-durable-turns §2）。⚠ 只在这两处断流里调；abort 是用户按的，不算。
       */
      const appendStreamInterrupted = () =>
        appendOperatorEntry({
          kind: 'system',
          id: nextOperatorEntryId('sys'),
          code: 'streamInterrupted',
        })
      let runFailed = false
      let canvasSync = false
      /** 开台（第 9e 步）：这一跳停在 `bench_open`，要去的那个台。 */
      let benchOpenTarget: AssistantOperatorBenchOpen | null = null
      let canvasApplied = false
      let canvasNeedsInputSync = false
      let canvasSteps = options.canvasSteps ?? 0
      let v3Transcript: AssistantV3Transcript | null = null
      let pendingPlanSteps: readonly string[] | null = null
      /**
       * ⭐ **接着跑同一份计划的那几轮不再落计划**（D12 S9）：点「开始」之后、答完
       * 中途的问题之后、续跑之后，模型常把剩下的几步再排一遍 —— 落下去就是同一份
       * 活出现两三张计划，而且新那份会顶掉记着进度的续跑记录。
       */
      const continuesPlan = Boolean(
        options.runKey ||
        options.planApproved ||
        resumeFrom ||
        options.planAnswers?.length ||
        options.confirmations?.length,
      )
      const flushPlanEntry = () => {
        if (!pendingPlanSteps) return
        if (continuesPlan && getOperatorState().resume) {
          pendingPlanSteps = null
          return
        }
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
      controller.signal.addEventListener('abort', cancelPendingAfterStep, {
        once: true,
      })
      const schedulePendingAfterStep = () => {
        cancelPendingAfterStep()
        pendingStepTimer = setTimeout(() => {
          pendingStepTimer = null
          // 这一轮已经停了（收尾 / 出错 / 等你定）就没有「它马上要说话」可言。
          if (!isCurrentRun() || getOperatorState().status !== 'working') return
          /**
           * ⚠ 线程尾部**还有一条活的助手正文**就不挂：那条本身已经写完了，
           * 再挂一行三点是同一件事说两遍。判据取「这个 id 还在不在」。
           */
          const entry = getOperatorState().entries.find(
            (item) => item.kind === 'message' && item.id === messageEntryId(),
          )
          if (entry?.kind === 'message' && (entry.text || entry.streaming))
            return
          // 那一格已经收成思考回执（工具步上面那句「想了 N 秒」）：下一段另起一条。
          if (entry) messageSeq += 1
          appendOperatorPending(messageEntryId())
        }, STUDIO_OPERATOR_STREAMING.pendingAfterStepMs)
      }

      /**
       * ⭐ **载回来的历史也进上下文**（P4-B）：不带它的下场是「用户看得见自己
       * 三分钟前说的话，助手却完全失忆」—— 刷新之后第一句就要重新自我介绍。
       * 旧助手线（`use-assistant-conversation`）也是把历史原样带回上下文的。
       * ⚠ 只带最后几条对白（`historyToOperatorMessages` 自己截），显示是全部。
       */
      const { entries, history, sessionId } = getOperatorState()
      const mentionedAssets = buildMentionedAssets(entries)
      const messages = [
        ...historyToOperatorMessages(history),
        ...buildMessages(entries),
      ]
      if (messages.length === 0) {
        setOperatorStatus('idle')
        return
      }

      const priorFinds = collectOperatorPriorFinds(entries)
      const latestMessage = messages.findLast(
        (message) => message.role === 'user',
      )?.content
      /** ⭐ `@` 到的卡按 id 给宿主（画布据此展开那几张、给文本卡全文），⛔ 不按名字。 */
      const pointedMentions = lastUserMentions(entries)
      const mentionedNodeIds = pointedMentions.flatMap((mention) =>
        mention.nodeId ? [mention.nodeId] : [],
      )
      const snapshot = buildSnapshot(
        latestMessage || mentionedNodeIds.length
          ? {
              ...(latestMessage ? { latestMessage } : {}),
              ...(mentionedNodeIds.length ? { mentionedNodeIds } : {}),
            }
          : undefined,
      )
      const libraryView = readLibraryView()
      const authoredByAssistant = buildAuthoredByAssistant(
        entries,
        snapshot,
        getOperatorState().changes,
      )

      /**
       * ⭐ **v3 看片的帧生产者**（看图期第二段，owner 2026-10-15）：被指着的片子（@ / 📎，最多
       *   `maxClips` 段，整轮在模型眼前）与视频台上只是挂着的参考视频（`video-N`，`look` 它才
       *   摆，见 `lib/assistant-pointed-clips.ts`）在请求发出去之前按片长抽好帧。
       * ⚠ 快照要先拍：视频台挂着的那几段从快照里读（与板子上的 `video-N` 同一份）。
       * ⚠ 接力（画布 canvas_sync / 时间预算）把上一跳的那一份原样带回来，⛔ 不重抽、不重复
       *   系统行。被指着的抽帧失败不拦这一轮：照样发（Gemini 还能看片子本体），线程里留一行原因。
       */
      let videoClips = options.videoClips
      if (!videoClips) {
        const turnClips = resolveTurnClips({
          mentions: pointedMentions,
          attachments: lastUserAttachments(entries),
          referenceVideos: snapshot.videoReferences?.items,
        })
        if (turnClips.pointed.length || turnClips.mounted.length) {
          setOperatorCapturingFrames(true)
          try {
            const captured = await captureTurnClips(turnClips)
            if (!isCurrentRun()) return
            videoClips = captured.videoClips
            for (const reason of captured.failures)
              appendOperatorEntry({
                kind: 'system',
                id: nextOperatorEntryId('sys'),
                code: 'videoFramesFailed',
                subject: reason,
              })
          } finally {
            if (isCurrentRun()) setOperatorCapturingFrames(false)
          }
          if (!isCurrentRun()) return
        }
        if (turnClips.overflow > 0)
          appendOperatorEntry({
            kind: 'system',
            id: nextOperatorEntryId('sys'),
            code: 'clipsOverCap',
            count: ASSISTANT_V3_CLIP_LIMITS.maxClips,
          })
      }

      const result = await streamAssistantOperatorAPI(
        {
          messages,
          mediaAttachments: lastUserMedia(entries),
          domain,
          workspaceKey,
          snapshot,
          ...(domain === 'canvas'
            ? {
                stepBudget:
                  ASSISTANT_OPERATOR_LIMITS.maxCanvasSteps - canvasSteps,
              }
            : {}),
          referenceProfiles: readOperatorReferenceProfiles(entries, history),
          /**
           * ⭐ **这两格现在的字是助手自己上一轮写的**（2026-09-12 实测第 1 组 ②）：
           * 服务端据此跳过覆盖三选 —— 它只活一轮，跨轮那一半的真值在这里。
           * ⚠ 空数组不发：一个恒在的空键读起来像「我查过了，两格都是他写的」。
           */
          ...(authoredByAssistant.length ? { authoredByAssistant } : {}),
          /**
           * ⚠ 历史里的步也算「刚才做过什么」，⛔ 别只给本次会话的：刷新之后
           * 助手会把用户上次撤销掉的改动原样再做一遍（拍板 18 的反面）。
           * 上限由 `buildPriorSteps` 那一刀统一截（取最后 N 条）。
           */
          priorSteps: buildPriorSteps(entries, historyToPriorSteps(history)),
          /**
           * ⭐ **`@` 引用的那几张图**（§7，拍板 4 推翻的落点）：它同时是
           * `critique_result.targetIds` 的**准入名单** —— 服务端只认这张名单里的
           * 目标。⛔ 别指望服务端去解析消息里那句 `[attached: …]`：那是给模型读的
           * 展示文本，当成权限清单用就是一条提示词注入的路。
           */
          ...(mentionedAssets.length ? { mentionedAssets } : {}),
          ...(pointedMentions.length
            ? {
                mentions: pointedMentions
                  .slice(0, ASSISTANT_MENTION_LIMITS.maxPerMessage)
                  .map(toMentionRef),
              }
            : {}),
          ...(getOperatorState().autoGenerate
            ? { autoGenerate: true as const }
            : {}),
          /** 库开着时报一句开着哪个库、点开了谁（`readLibraryView`）：「这个角色」才认得出。 */
          ...(libraryView ? { libraryView } : {}),
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
          /**
           * ⭐ **隐身**（56a · ⋯ 菜单）—— 开着时服务端这一轮一条记忆都不写。
           * ⚠ 每轮上送、⛔ 不落库：它作用于**当前会话**，不是账号级设置。
           * ⚠ 关着时**整个键不发**：一个恒在的 `incognito: false` 读起来像
           *   「用户特意关掉了隐身」，而绝大多数轮次里他从没碰过这颗开关。
           */
          ...(getOperatorState().incognito ? { incognito: true } : {}),
          // 🔊 开着（②c-2）：她这一轮会被念出来，服务端教她写语气提示（只在聊天时用）。
          ...(getOperatorVoicePrefs().on
            ? {
                chatVoice: {
                  expressive:
                    getOperatorVoicePrefs().modelId ===
                    AI_MODELS.FISH_AUDIO_DRAMA_3,
                },
              }
            : {}),
          // 聊天会话（附录L）：每轮带上和谁聊，服务端按这张卡扮演。
          ...(getOperatorState().chatCharacter
            ? { chatCharacterId: getOperatorState().chatCharacter?.id }
            : {}),
          ...(searchWithGrok ? { searchWithGrok: true as const } : {}),
          ...(timeZone ? { timeZone } : {}),
          ...(videoClips?.length ? { videoClips } : {}),
          ...(confirmations?.length ? { confirmations } : {}),
          ...(planAnswers?.length ? { planAnswers } : {}),
          ...(planApproved === undefined ? {} : { planApproved }),
          /**
           * ⭐ **断点续跑**（第三期）：前几步的既成事实。⛔ 它不放宽钱闸 ——
           * 剩下的步里但凡有一步要生成，`confirm` 照出（owner 定）。
           */
          ...(resumeFrom ? { resumeFrom } : {}),
          responseLanguage: toResponseLanguage(locale),
          ...(options.v3Transcript
            ? { v3: { transcript: options.v3Transcript } }
            : {}),
          /**
           * ⭐ **上一轮找到的图与视频**（`#n`，搜索期第三片）：「用 #2」「放第二个」跨轮还能落到
           *   同一张。只在 v3 的新一轮发 —— 接力那一跳的板子已经冻着这一份；空的不发。
           */
          ...(!options.v3Transcript && priorFinds.length ? { priorFinds } : {}),
        },
        { signal: controller.signal },
      )

      if (!isCurrentRun()) return
      if (!result.success) {
        cancelPendingAfterStep()
        dropOperatorPending(messageEntryId())
        settleOperatorStreaming()
        if (controller.signal.aborted) return
        // abort 是用户按的，不是故障 —— 状态回 idle，线程里不插红字。
        if (result.errorCode === 'ABORTED') {
          setOperatorStatus('idle')
          return
        }
        setOperatorStatus(
          'error',
          describeError(result),
          toErrorTrace(result),
          result.errorCode ?? null,
        )
        return
      }

      try {
        for await (const event of result.events) {
          if (!isCurrentRun()) break
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
             * ⛔ 增量帧**也不算「它开口了」**（56b 切片 3）：那一帧写的正是这条
             * 占位行本身 —— 把它算进来等于在第一个字到达的同一刻拆掉要装字的那
             * 一格。
             */
            event.type !== ASSISTANT_OPERATOR_EVENTS.messageDelta &&
            // ⛔ 思考帧同理：它写的也是这条占位行（想的时候那一行）。
            event.type !== ASSISTANT_OPERATOR_EVENTS.thinking &&
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
            settleOperatorStreaming()
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
                questions: event.questions,
                answers: [],
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
              /**
               * **摆一张搭配卡**（lora-assistant §12）—— 助手自己搭好的一套，一行一处
               * 变化。⚠ 服务端到这一帧为止一把都没挂、一格都没改：应用发生在创作者
               * 点「应用这套搭配」时（`applyLoraSetup`），⛔ 不新开一轮。
               */
              if (
                event.confirm.kind ===
                ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.loraSetup
              ) {
                flushPlanEntry()
                setOpen(true)
                setOperatorConfirm({
                  id: nextOperatorEntryId('confirm'),
                  kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.loraSetup,
                  setup: event.confirm.setup,
                  status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
                })
                setOperatorStatus('awaitingConfirm')
                break
              }
              /**
               * **卡片助手提议一份角色设定**（C2）—— 每格一个勾、下面一行来源。
               * ⚠ 服务端到这一帧为止一行库都没写：写进角色发生在用户点「收下勾选的」
               *   时（`keepCharacterProfile` → 宿主 `apply.cards.applyProfile`）。
               */
              if (
                event.confirm.kind ===
                ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.characterProfile
              ) {
                flushPlanEntry()
                setOpen(true)
                setOperatorConfirm({
                  id: nextOperatorEntryId('confirm'),
                  kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.characterProfile,
                  profile: event.confirm.profile,
                  status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
                })
                setOperatorStatus('awaitingConfirm')
                break
              }
              /**
               * **卡片助手提议几张角色图**（C3）—— 同上：服务端一张都没存；
               * 挂上（`keepCharacterImages`）等用户点下去。
               */
              if (
                event.confirm.kind ===
                ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.characterImages
              ) {
                flushPlanEntry()
                setOpen(true)
                setOperatorConfirm({
                  id: nextOperatorEntryId('confirm'),
                  kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.characterImages,
                  proposal: event.confirm.proposal,
                  status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
                })
                setOperatorStatus('awaitingConfirm')
                break
              }
              /** **画布放大**（P6）—— 同上：什么都没调，放大等用户点下去（或自动生成开着时替你按）。 */
              if (
                event.confirm.kind ===
                ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.upscale
              ) {
                flushPlanEntry()
                setOpen(true)
                setOperatorConfirm({
                  id: nextOperatorEntryId('confirm'),
                  kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.upscale,
                  request: event.confirm.request,
                  status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
                })
                setOperatorStatus('awaitingConfirm')
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
             * **正文的一小段增量**（56b 切片 3）—— 追加到那条 `streaming` 气泡
             * 后面，⛔ 不覆盖。定稿仍旧只由下面那一帧说了算。
             *
             * ⚠ 进位判据与定稿帧**同一条**：「这一段已经被别的条目压在下面」。
             * 🔬 2026-09-30 真机：模型在工具轮先写了一句旁白（「我查一下…」），
             * 旁白流进了气泡，工具步随后压在它下面；收尾轮的增量若还写回那条，
             * 正文就接在旁白后面，定稿再另起一条 —— 同一段回答出现两遍。
             */
            case ASSISTANT_OPERATOR_EVENTS.messageDelta: {
              const entries = getOperatorState().entries
              const index = entries.findIndex(
                (entry) =>
                  entry.kind === 'message' && entry.id === messageEntryId(),
              )
              const entry = index >= 0 ? entries[index] : undefined
              /**
               * `restart`：这一步重写了一份新稿。还在流的旧稿就地换掉；已经定稿
               * 的那段不动，新稿另起一条。
               */
              if (
                index >= 0 &&
                (index !== entries.length - 1 ||
                  (event.restart &&
                    entry?.kind === 'message' &&
                    !entry.streaming))
              )
                messageSeq += 1
              if (event.restart) deltaEntryIds = []
              if (!deltaEntryIds.includes(messageEntryId()))
                deltaEntryIds.push(messageEntryId())
              appendOperatorStreamingMessage(
                messageEntryId(),
                event.delta,
                event.restart === true,
                event.chat === true,
              )
              break
            }
            /**
             * 模型在想（10-27）：摘要与秒数写进此刻那条占位行。进位判据同正文增量：那一格已经被
             * 压在下面、或已经收成回执（不再 `streaming`），这一段就是新的一段。
             */
            case ASSISTANT_OPERATOR_EVENTS.thinking: {
              const entries = getOperatorState().entries
              const index = entries.findIndex(
                (entry) =>
                  entry.kind === 'message' && entry.id === messageEntryId(),
              )
              const entry = index >= 0 ? entries[index] : undefined
              if (
                entry?.kind === 'message' &&
                (index !== entries.length - 1 || !entry.streaming)
              )
                messageSeq += 1
              appendOperatorThinking(messageEntryId(), event.delta, event.ms)
              break
            }
            /**
             * 正文的**定稿来源**（v2 §3.1 / §13.1）—— 按条目 id **覆盖**，
             * ⛔ 不追加。
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
              /**
               * ⭐ 增量已经把这一段写全了（中间可能被一步联网隔成两条）：就地定稿那几条，
               * ⛔ 不另起一条。拼起来对不上（少见：增量丢了 / 改写过）才走下面的覆盖。
               */
              const streamed = deltaEntryIds.flatMap((id) => {
                const entry = entries.find(
                  (item) => item.kind === 'message' && item.id === id,
                )
                return entry?.kind === 'message' ? [entry] : []
              })
              deltaEntryIds = []
              if (
                streamed.length > 0 &&
                streamed
                  .map((entry) => entry.text)
                  .join('')
                  .trim() === event.text.trim()
              ) {
                for (const entry of streamed) {
                  finalizeOperatorMessage(
                    entry.id,
                    entry.text.trim(),
                    event.chat === true,
                  )
                  dropOperatorPending(entry.id)
                }
                speakIfVoiceOn(event, streamed.at(-1)!.id)
                break
              }
              const index = entries.findIndex(
                (entry) =>
                  entry.kind === 'message' && entry.id === messageEntryId(),
              )
              if (index >= 0 && index !== entries.length - 1) messageSeq += 1
              finalizeOperatorMessage(
                messageEntryId(),
                event.text,
                event.chat === true,
              )
              speakIfVoiceOn(event, messageEntryId())
              break
            }
            case ASSISTANT_OPERATOR_EVENTS.step: {
              const step = {
                ...event.step,
                id: `${continuationPrefix}${event.step.id}`,
              }
              upsertOperatorStep(step, runKey)
              const resume = getOperatorState().resume
              const matchingSteps = resume?.steps.filter(
                (item) => item.label === step.title,
              )
              const resumeStepId =
                matchingSteps?.length === 1
                  ? matchingSteps[0].id
                  : resume
                    ? firstUnfinishedStepId(resume)
                    : null
              /**
               * ⭐ **续跑记录跟着走**（第三期）：这一步有结论了，把计划里第一个
               * 还没有结论的那一格填掉。
               *
               * 同名且唯一的计划项优先；重做已完成项不能勾掉后面的失败项。
               * 没有明确对应项时才取第一个未完成项。
               * ⚠ `running` 不落：三态里没有那一档，落了它刷新之后会变成一句
               *   「这一步做完了」——而它并没有。
               */
              if (
                step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.running &&
                // ⚠ 跳过的那一步（同轮重复）不占计划里的一格：它什么都没做，
                //   也不是失败 —— 占了的话下一格的勾就错位一整格。
                !(
                  step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error &&
                  (step.draft === true ||
                    STUDIO_OPERATOR_SKIPPED_REJECT_REASONS.includes(
                      step.error.reason,
                    ))
                )
              ) {
                if (resumeStepId) {
                  if (
                    step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error
                  ) {
                    /**
                     * ⚠ 存的是**拒绝理由码**，面板按词表说人话（D12 C11）：
                     * `error.detail` 是写给模型看的原文（常是英文纠错指令），
                     * ⛔ 不给用户看。
                     */
                    markOperatorResumeStep(resumeStepId, {
                      state: 'failed',
                      reason: step.error.reason,
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
                // 记住了一条偏好：头像顶一下（owner 2026-10-07 动效第 3 批）。
                if (
                  step.tool === ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule &&
                  typeof window !== 'undefined'
                )
                  window.requestAnimationFrame(bumpAssistantAvatar)
                if (
                  step.tool === ASSISTANT_OPERATOR_TOOL_IDS.canvasApply ||
                  step.tool === ASSISTANT_OPERATOR_TOOL_IDS.canvasBatch
                ) {
                  canvasApplied =
                    field === STUDIO_OPERATOR_FIELD_IDS.canvasNodes
                  /**
                   * 一批落了一部分：步记成 `canvasBatchPartial`，detail 逐条写哪几条没落、
                   * 为什么 —— 它随 priorSteps 进下一次请求，模型只补那几条。落了的
                   * 那部分已经在画布上，照样接力带新快照。
                   */
                  const failures =
                    canvasApplied &&
                    step.tool === ASSISTANT_OPERATOR_TOOL_IDS.canvasBatch
                      ? (applyContext.canvas?.getBatchFailures?.() ?? [])
                      : []
                  if (failures.length > 0) {
                    const ops =
                      step.tool === ASSISTANT_OPERATOR_TOOL_IDS.canvasBatch
                        ? step.payload.ops
                        : []
                    const detail =
                      `${ops.length - failures.length} of ${ops.length} landed. Not landed: ${failures
                        .map(
                          (failure) =>
                            `ops[${failure.index}] ${ops[failure.index]?.op ?? '?'} — ${failure.reason}`,
                        )
                        .join('; ')}`.slice(
                        0,
                        ASSISTANT_OPERATOR_LIMITS.maxReasonChars,
                      )
                    if (resumeStepId)
                      markOperatorResumeStep(resumeStepId, {
                        state: 'failed',
                        reason: detail,
                      })
                    upsertOperatorStep(
                      {
                        ...step,
                        status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
                        error: {
                          reason:
                            ASSISTANT_OPERATOR_REJECT_REASON_IDS.canvasBatchPartial,
                          detail,
                        },
                      },
                      runKey,
                    )
                  }
                  if (!canvasApplied) {
                    canvasNeedsInputSync =
                      applyContext.canvas?.needsPromptInputSync?.() === true
                    const reason = canvasNeedsInputSync
                      ? ASSISTANT_OPERATOR_REJECT_REASON_IDS.referenceInputsChanged
                      : ASSISTANT_OPERATOR_REJECT_REASON_IDS.noSuchControl
                    const detail = applyContext.canvas?.getApplyError?.()
                    if (resumeStepId)
                      markOperatorResumeStep(resumeStepId, {
                        state: 'failed',
                        reason: detail ?? reason,
                      })
                    upsertOperatorStep(
                      {
                        ...step,
                        status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
                        error: {
                          ...(detail ? { detail } : {}),
                          reason,
                        },
                      },
                      runKey,
                    )
                  }
                }
                /**
                 * 回执的**第二只眼**（进度表 21 · D7 Q4）：被改的那一格闪一次。
                 *
                 * ⚠ 画布那一格（`canvasNodes`）在这里**跳过** —— 它已经由画布宿主
                 *   在应用那一刻按节点闪过了（`flashAssistantTouchedNode`），
                 *   而参数栏在画布上根本不存在。⛔ 别两边都闪。
                 * ⚠ 排到下一帧再闪：这一跳刚 `flushSync` 落完表单，那一格正要
                 *   重渲染，React 那一侧的 className 会在同一拍把 class 覆盖掉
                 *   （判据与画布那一处逐字同源）。
                 */
                if (
                  field &&
                  field !== STUDIO_OPERATOR_FIELD_IDS.canvasNodes &&
                  typeof window !== 'undefined'
                ) {
                  const touched = field
                  window.requestAnimationFrame(() =>
                    flashAssistantTouchedField(touched),
                  )
                }
                if (field) {
                  const writtenText = writtenTextOf(step)
                  if (
                    writtenText !== undefined &&
                    (field === ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt ||
                      field === ASSISTANT_OPERATOR_CONFIRM_FIELDS.negative)
                  )
                    writeOperatorWrittenText(
                      getOperatorState().domain,
                      field,
                      writtenText,
                    )
                  recordOperatorChange({
                    field,
                    // 归属标记要指回**线程里的那一条**，不是服务端的步号。
                    stepId: operatorStepEntryId(runKey, step.id),
                    ...(step.reason ? { reason: step.reason } : {}),
                    firstInverse: step,
                    previousLabel: describeOperatorInverse(step),
                    ...(writtenText !== undefined ? { writtenText } : {}),
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
                canvasSteps += 1
                schedulePendingAfterStep()
              }
              break
            }
            /**
             * **规则薄卡**（§2.21 / §10，拍板 23）—— 时间线里插一条，⛔ 不是一步。
             * 原文与日期是服务端从规则表里查出来的原话（见事件 schema 头注）。
             */
            case ASSISTANT_OPERATOR_EVENTS.ruleHit: {
              /**
               * ⚠ **一条规则在这段对话里只画一次**（2026-09-12 实测第 9 步）：
               * 服务端只在**一轮之内**去重（`emittedRuleHits`），而同一条规则
               * 下一轮照样会命中 —— 用户读到的是同一张薄卡在时间线上出现两次、
               * 三次。⛔ 不在服务端跨轮去重：那要给流一份会话态，而「运行中的一轮
               * 不许留痕」是那条流的前提（§7.2）。这里按 `ruleId` 认就够了。
               */
              const seen = getOperatorState().entries.some(
                (entry) =>
                  entry.kind === 'rule' && entry.ruleId === event.ruleId,
              )
              if (seen) break
              appendOperatorEntry({
                kind: 'rule',
                id: nextOperatorEntryId('rule'),
                ruleId: event.ruleId,
                text: event.text,
                source: event.source,
                createdAt: event.createdAt,
              })
              break
            }
            /**
             * ⚠ **`awaitingPlan` 不被这一帧降级**：计划卡 / 问题卡那两支自己已经
             * 把状态说清楚了，而服务端只会笼统地说一句 `awaiting_confirm` ——
             * 盖过去的表现是图标轨上「待你定」变成「待确认」，而两者的下一步动作
             * 完全不同（见 `StudioOperatorStatus` 的头注）。
             */
            case ASSISTANT_OPERATOR_EVENTS.stopped: {
              terminalReceived = true
              if (
                event.reason === ASSISTANT_OPERATOR_STOP_REASONS.benchOpen &&
                event.open
              ) {
                benchOpenTarget = event.open
                break
              }
              if (
                domain === 'canvas' &&
                event.reason === ASSISTANT_OPERATOR_STOP_REASONS.canvasSync
              ) {
                /**
                 * ⚠ 新内核（收到过本轮记录）**落没落都接力**：落地失败的原因作为工具
                 * 结果交回模型，由它改了再来；旧内核这里直接收尾，模型永远不知道没落。
                 */
                canvasSync =
                  canvasApplied || canvasNeedsInputSync || v3Transcript !== null
                break
              }
              /**
               * ⭐ **这一次请求的时间用到头了**（服务端在平台 300 秒杀函数之前自己收的尾）。
               * 画布照 `canvas_sync` 接下一次请求，⚠ 不看这次有没有落 op —— 收尾不是因为
               * 要同步画布，是时间到了；其他域没有接力，出「继续 / 先到这里」。
               */
              if (event.reason === ASSISTANT_OPERATOR_STOP_REASONS.timeBudget) {
                // 新内核：所有台都接力（服务端交了接力条才接，没交就照常收尾）。
                if (domain === 'canvas' || v3Transcript !== null) {
                  canvasSync = true
                  break
                }
                setOperatorOutOfSteps(true)
              }
              /**
               * ⭐ **停在确认卡 / 问题卡上的那一轮也带结论**（2026-09-12 实测
               * 第 2 组）：生成确认之后用户点的是生成键，⛔ 不再开一轮 —— 不收
               * 这一份，整个生成轮次在时间线上就没有结论块。
               * ⚠ 判据与 `done` 那一支逐字相同：缺席是常态，⛔ 不画空块。
               */
              if (event.roundSummary) {
                appendOperatorRoundSummary(event.roundSummary)
              }
              if (event.reason === ASSISTANT_OPERATOR_STOP_REASONS.maxSteps) {
                setOperatorOutOfSteps(true)
              }
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
            case ASSISTANT_OPERATOR_EVENTS.transcript:
              v3Transcript = event.transcript
              break
            case ASSISTANT_OPERATOR_EVENTS.done:
              terminalReceived = true
              if (event.roundSummary) {
                appendOperatorRoundSummary(event.roundSummary)
              }
              // ⭐ 见下面清盘那一段：`done` = 这一轮**跑完了**，续跑无从谈起。
              roundFinished = true
              break
            case ASSISTANT_OPERATOR_EVENTS.error:
              terminalReceived = true
              runFailed = true
              setOperatorStatus(
                'error',
                describeError(event),
                toErrorTrace(event),
                event.errorCode ?? null,
                event.missingKey ?? event.provider ?? null,
              )
              break
            default:
              break
          }
          if (runFailed) break
        }
      } catch {
        if (!isCurrentRun()) return
        // 攒着的那份计划比丢掉更糟 —— 先落地，再谈这是不是一次 abort。
        cancelPendingAfterStep()
        flushPlanEntry()
        dropOperatorPending(messageEntryId())
        settleOperatorStreaming()
        /**
         * ⚠ abort 会**穿透 `for await`**：插话 / ⏹ 掐掉的是底下那个 `reader.read()`，
         * 它以 `AbortError` 拒绝，于是循环不是 `break` 出来的而是抛出来的。
         * 没有这一判的表现是：插一句话 → 新一轮已经置 `working`，旧循环的这个
         * catch 随后把状态改成 `error`，而下面那句收尾只在 `working` 时归 idle ——
         * 错误态就永久挂在胶囊上，新一轮跑完也擦不掉。
         */
        if (controller.signal.aborted) return
        appendStreamInterrupted()
        setOperatorStatus('error', null)
        return
      }

      if (!isCurrentRun()) return
      cancelPendingAfterStep()
      flushPlanEntry()
      dropOperatorPending(messageEntryId())
      settleOperatorStreaming()
      if (controller.signal.aborted) return
      if (runFailed) return
      if (!terminalReceived) {
        appendStreamInterrupted()
        setOperatorStatus('error', tError('streamInterrupted'))
        return
      }
      /**
       * ⭐ 开台（第 9e 步）：记下这一跳交给新台，换页。新页那一份面板等台准备好，带着接力条接着发；
       * 状态一直是「在干活」。⚠ 没收到接力条就开不了（服务端存不下时已经在结果里说了）。
       */
      if (benchOpenTarget && v3Transcript) {
        setOperatorBenchOpen({
          target: benchOpenTarget,
          transcript: v3Transcript,
          runKey,
          steps: canvasSteps,
          at: Date.now(),
        })
        // 库那一支（owner 10-28）：台不动，库换到那一页；已经开着那个库就只翻页面。
        if (benchOpenTarget.library) {
          const show = benchOpenTarget.library
          requestLibraryShow(show)
          const openLibrary = readLibraryView()?.library
          if (openLibrary !== show.library) {
            const href = studioLibraryShowPath(show.library, show.section)
            // 与左栏同一种换法：库开着时换类用 replace（⛔ push 会把两类叠着画）。
            if (openLibrary) router.replace(href)
            else router.push(href)
          }
          return
        }
        // 对话跟着台走（第 9f 步）：开台那一页的地址带上这段对话的编号。
        router.push(
          studioBenchHref(
            assistantBenchPath(benchOpenTarget),
            getOperatorState().sessionId,
          ),
        )
        return
      }
      if (canvasSync) {
        // 新内核不设接力上限：停只有创作者按停（owner 2026-10-22）。
        const resume = getOperatorState().resume
        runRef.current?.({
          ...options,
          runKey,
          canvasSteps,
          planApproved: true,
          resumeFrom: resume ? (toResumeFrom(resume) ?? undefined) : undefined,
          v3Transcript: v3Transcript ?? undefined,
          videoClips,
        })
        return
      }
      // `done` 之后没有别的收尾 —— 状态没被 `stopped` / `error` 改过就是跑完了。
      if (getOperatorState().status === 'working') setOperatorStatus('idle')
      /**
       * ⭐ **自动生成开关开着**（D12 S-C）—— 这一轮停在生成确认卡上，就由客户端
       * 替你按下。⚠ 放在流收尾**之后**：卡到货那一帧后面还跟着一帧 `stopped`，
       * 在那之前按下去，状态会被它改回「等你确认」。
       * ⚠ 钱闸不变：扳机仍是客户端这一下，⛔ 服务端没有任何工具能建 generation。
       */
      const waiting = getOperatorState()
      if (
        waiting.status === 'awaitingConfirm' &&
        waiting.autoGenerate &&
        waiting.confirm?.kind ===
          ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate &&
        waiting.confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
      ) {
        confirmGenerationRef.current?.({ auto: true })
      }
      // 放大同一个开关（owner 2026-10-14「自动生成直接出」）：不扣积分，⛔ 也不过张数上限那道闸。
      if (
        waiting.status === 'awaitingConfirm' &&
        waiting.autoGenerate &&
        waiting.confirm?.kind === ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.upscale &&
        waiting.confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
      ) {
        decideUpscaleRef.current?.(true, { auto: true })
      }
      /**
       * ⭐ **跑完了就把续跑记录清掉**（第三期）。
       *
       * ⚠ 两条判据取或（2026-09-12 实测第 2 组 ②）：
       *  · **这一轮以 `done` 收尾** —— 服务端说这一轮做完了，剩下几格 `pending`
       *    是模型自己决定不做的（查证轮正常收尾仍挂着「从第 2 步继续」就是它）；
       *  · **每一步都 done** —— 计划真的跑完了。
       * 留着那颗按钮的表现是用户点「从第 4 步继续」，而第 4 步早就做完了 ——
       * 助手把同一件事又做一遍。
       * ⛔ `stopped`（等你定 / 撞上限）与报错那两支**不清**：那正是它存在的理由。
       */
      /**
       * ⚠ **停在生成确认卡上也算做完**（拆分与反推实跑 09-24）：那张卡就是计划的
       * 最后一格（「准备生成确认卡」不是工具步，永远勾不上），留着续跑的表现是
       * 卡片底下还挂一颗「从第 4 步继续」。
       * ⚠ 正常收尾时没勾上的那几格**补上勾**：它们是在回答里做完的（「根据画面
       * 整理标签」），留成空圈读起来像没做。有挂掉的步不补（那是续跑要接的）；
       * 一步都没做完的不补（实跑：点「开始」后只回了一句许诺，三格全被勾上）。
       */
      const finished = getOperatorState().resume
      const stoppedAtGenerateCard =
        waiting.confirm?.kind ===
          ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate &&
        waiting.confirm.status === STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
      if (
        finished &&
        (roundFinished ||
          stoppedAtGenerateCard ||
          !hasUnfinishedSteps(finished))
      ) {
        if (
          !failedResumeStep(finished) &&
          finished.steps.some(
            (step) =>
              step.state === ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS.done,
          )
        )
          for (const step of finished.steps)
            if (step.state !== ASSISTANT_OPERATOR_RESUME_STEP_STATE_IDS.done)
              markOperatorResumeStep(step.id, { state: 'done' })
        clearOperatorResumePlan()
      }
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
      setOpen,
      buildSnapshot,
      describeError,
      domain,
      flushQueue,
      locale,
      router,
      tError,
      isCurrentThread,
      workspaceKey,
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

  /**
   * ⭐ **开台的另一头**（第 9e 步）：助手在别的页开了这个台，这一份面板等台准备好（工作区对上；画布
   * 那块真打开了；角色页打开了要的那一位）就带着接力条接着发，并把面板打开。
   * ⚠ 换页、读画布、拉角色都要一会儿，宿主的值不一定触发重渲染 —— 轮询着看，⛔ 只靠依赖表。
   * ⚠ 等过 `STUDIO_OPERATOR_BENCH_OPEN_TIMEOUT_MS` 还没到就作废，落一行说没接上（⛔ 在别的台上接着跑）。
   */
  const hostRef = useRef(host)
  useEffect(() => {
    hostRef.current = host
  }, [host])
  const { benchOpen } = useStudioOperatorState()
  useEffect(() => {
    if (!benchOpen) return
    const arrive = (): boolean => {
      if (getOperatorState().benchOpen !== benchOpen || !isCurrentThread())
        return true
      const here = hostRef.current
      const library = benchOpen.target.library
      // 库那一支：页面接走、翻好（或等过一会儿）就接着发，到没到由服务端照屏上那一页如实说。
      const reached = library
        ? libraryShowSettled(
            library,
            Date.now() - benchOpen.at >= STUDIO_OPERATOR_LIBRARY_SHOW_SETTLE_MS,
          )
        : assistantBenchReached(
            benchOpen.target,
            here.workspace,
            here.projectId,
          )
      if (reached && runRef.current) {
        setOperatorBenchOpen(null)
        here.setOpen(true)
        runRef.current({
          runKey: benchOpen.runKey,
          canvasSteps: benchOpen.steps,
          planApproved: true,
          v3Transcript: benchOpen.transcript,
          benchArrival: true,
        })
        return true
      }
      if (Date.now() - benchOpen.at < STUDIO_OPERATOR_BENCH_OPEN_TIMEOUT_MS)
        return false
      setOperatorBenchOpen(null)
      setOperatorStatus('idle')
      appendOperatorEntry({
        kind: 'system',
        id: nextOperatorEntryId('sys'),
        code: 'benchOpenMissed',
      })
      return true
    }
    if (arrive()) return
    const timer = window.setInterval(() => {
      if (arrive()) window.clearInterval(timer)
    }, STUDIO_OPERATOR_BENCH_OPEN_POLL_MS)
    return () => window.clearInterval(timer)
  }, [benchOpen, isCurrentThread])

  const send = useCallback(
    (
      text: string,
      attachments: readonly StudioOperatorAttachment[] = [],
      options: {
        searchWithGrok?: boolean
        /** 这一句 `@` 了什么（发送前已按 id 解析、名字已去重，§10b）。 */
        mentions?: readonly AssistantMention[]
      } = {},
    ) => {
      if (!isCurrentThread()) return
      const trimmed = text.trim()
      if (!trimmed) return
      const mentions = options.mentions?.length
        ? { mentions: options.mentions }
        : {}
      /**
       * ⭐ **干活时进队列，⛔ 不再 abort**（本片改口，见文件头注）。
       * 排队条随即出现在输入框上方，接住发生在下一个工具步跑完的那一刻。
       */
      if (getOperatorState().status === 'working') {
        enqueueOperatorMessage({
          id: nextOperatorEntryId('queued'),
          text: trimmed,
          attachments,
          ...mentions,
        })
        return
      }
      // 没在跑：直接说。
      // ⚠ 先把队里可能剩下的接掉（上一轮以 error / awaitingConfirm 收尾时会剩），
      //   ⛔ 别让它们变成永远不会被发出去的孤儿 —— 排队条挂着而没有任何东西会
      //   来处理它，正是本仓最讨厌的那种失败。
      flushQueue()
      setOperatorOutOfSteps(false)
      /**
       * ⭐ 三张「等你定」的卡一起收（§4.1「钉在流末尾」）：用户改口了，上一轮那张
       * 计划 / 花钱 / 反问就此作废。⛔ 留着的表现是流末尾挂着一张还能点的卡，
       * 点下去发出的是**上一个话题**的确认 —— 而花钱那张是真的会花钱。
       */
      clearOperatorPrompts()
      // 用户自己开口了：这一枪的「出图后看一眼」作废（他要说的比这件事优先）。
      autoReviewRef.current = null
      appendOperatorEntry({
        kind: 'user',
        id: nextOperatorEntryId('user'),
        text: trimmed,
        attachments,
        ...mentions,
      })
      /**
       * 计划卡「修改」之后的第一条消息带 `planApproved: false` —— 服务端据此把
       * 答复并进上下文**重新规划一次**（§3.1 ⑤）。⚠ 读完就清（见 `reviseRef`）。
       */
      const revising = reviseRef.current
      reviseRef.current = false
      void run({
        ...(revising ? { planApproved: false } : {}),
        ...(options.searchWithGrok ? { searchWithGrok: true } : {}),
      })
    },
    [flushQueue, run, isCurrentThread],
  )

  /**
   * 出图落地 → 钉出「按这个方向继续吗？」。画布：那张卡的产出图换了；工作台：那张结果卡
   * 收齐了。⚠ 只在助手闲着时问（还在干活就等下一次渲染再看）。
   */
  const operatorState = useStudioOperatorState()
  const canvasTargets = host.canvasTargets
  useEffect(() => {
    const pending = autoReviewRef.current
    if (!pending || operatorState.status !== 'idle') return
    if (pending.kind === 'canvas') {
      const output = canvasTargets?.outputOf?.(pending.nodeId)
      if (!output || output.url === pending.before) return
    } else {
      const entry = operatorState.entries.find(
        (item) => item.kind === 'result' && item.id === pending.resultId,
      )
      if (!entry || entry.kind !== 'result') return
      if (entry.items.length === 0 || entry.completed < entry.total) return
    }
    autoReviewRef.current = null
    // 出完就停（第 5b 步）：问一句，卡钉在输入框上方；直接打字 = 用一句话回答。
    setOperatorQuestion({
      id: nextOperatorEntryId('question'),
      questions: [
        {
          id: nextOperatorEntryId('continue'),
          header: tContinueAsk('header'),
          question: tContinueAsk('question'),
          multiSelect: false,
          allowOther: true,
          options: [
            {
              id: 'continue',
              label: tContinueAsk('continue'),
              description: tContinueAsk('continueDescription'),
              recommended: true,
            },
            {
              id: 'change',
              label: tContinueAsk('change'),
              description: tContinueAsk('changeDescription'),
            },
          ],
        },
      ],
      answers: [],
    })
  }, [operatorState, canvasTargets, tContinueAsk])

  /**
   * 撤回一条还没轮到的排队消息（§3.1 ㉔）。
   *
   * ⚠ 线程里**要留一行**：排队条淡出而什么都没说，用户下一秒就会怀疑自己到底
   * 撤没撤掉（而这句话本来是要花钱的）。
   */
  const cancelQueued = useCallback(
    (id: string) => {
      if (!isCurrentThread()) return
      const target = getOperatorState().queue.find((item) => item.id === id)
      if (!target) return
      removeOperatorQueued(id)
      appendOperatorEntry({
        kind: 'system',
        id: nextOperatorEntryId('sys'),
        code: 'queueDropped',
        subject: target.text.slice(0, ASSISTANT_OPERATOR_LIMITS.maxTitleChars),
      })
    },
    [isCurrentThread],
  )

  const stop = useCallback(() => {
    if (!isCurrentThread()) return
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
  }, [isCurrentThread])

  /**
   * **覆盖三选点下「覆盖 / 追加」—— 立刻写进表单**（owner 09-24：点完还要想很久，
   * 应该立马完成）。
   *
   * ⭐ 卡上那段就是最终文本：服务端把参考图复核等检查全部跑完才出卡。所以这里
   * 直接走助手写字段的**同一条通道**（`applyOperatorStep` → 闪一下 → 归属 →
   * 登记簿，撤销照旧回到用户原文），⛔ 不等下一轮模型重写一遍。
   * @returns 写进去了没有（「保留」什么都不写）。
   */
  const applyOverwriteChoice = useCallback(
    (
      overwrite: NonNullable<StudioOperatorQuestionPrompt['overwrite']>,
      choice: AssistantOperatorConfirmChoice,
      title: string,
    ): boolean => {
      if (choice === ASSISTANT_OPERATOR_CONFIRM_CHOICES.keep) return false
      const isPrompt =
        overwrite.field === ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt
      const form = applyContext.getState()
      const current = isPrompt
        ? form.prompt
        : (form.advancedParams.negativePrompt ?? '')
      const append =
        choice === ASSISTANT_OPERATOR_CONFIRM_CHOICES.append &&
        current.trim().length > 0
      // 负面追加与服务端同一口径去重后整段替换（见 set_negative 的头注）。
      const payload =
        !isPrompt && append
          ? {
              value: mergeNegativePrompt(current, overwrite.proposed),
              mode: ASSISTANT_OPERATOR_WRITE_MODES.replace,
            }
          : {
              value: overwrite.proposed,
              mode: append
                ? ASSISTANT_OPERATOR_WRITE_MODES.append
                : ASSISTANT_OPERATOR_WRITE_MODES.replace,
            }
      const base = {
        id: 'overwrite',
        title,
        status: ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
        payload,
        inverse: { value: current },
      }
      const step: AssistantOperatorStep = isPrompt
        ? {
            ...base,
            tool: ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
            verb: ASSISTANT_OPERATOR_TOOL_VERBS[
              ASSISTANT_OPERATOR_TOOL_IDS.setPrompt
            ],
          }
        : {
            ...base,
            tool: ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
            verb: ASSISTANT_OPERATOR_TOOL_VERBS[
              ASSISTANT_OPERATOR_TOOL_IDS.setNegative
            ],
          }
      const field = flushSync(() => applyOperatorStep(step, applyContext))
      if (!field) return false
      const runKey = nextOperatorEntryId('run')
      upsertOperatorStep(step, runKey)
      if (typeof window !== 'undefined')
        window.requestAnimationFrame(() => flashAssistantTouchedField(field))
      const writtenText = writtenTextOf(step)
      if (writtenText !== undefined)
        writeOperatorWrittenText(
          getOperatorState().domain,
          overwrite.field,
          writtenText,
        )
      recordOperatorChange({
        field,
        stepId: operatorStepEntryId(runKey, step.id),
        firstInverse: step,
        previousLabel: describeOperatorInverse(step),
        ...(writtenText !== undefined ? { writtenText } : {}),
      })
      return true
    },
    [applyContext],
  )

  /**
   * 卡上**一道题**的答复 → 一格「已答」。
   *
   * ⭐ 文案、缩略图都**从卡上取**（选项 id → 选项）：卡在 store 里的这一份是唯一
   * 有原文的地方，⛔ 不信面板拼的字（2026-10-14 起面板只交 id）。
   * ⭐ **答复自带题面与选项文案**（v2 §3.4 落账规则，2026-09-12 真机 bug）：
   * `questionId` / `optionIds` 是上一条流现编的合成 id，而服务端零会话态 —— 下一轮
   * 它反查不回这道题问的是什么。真机：点完「角色设计展示立绘」，模型连着四轮重问。
   * ⚠ 覆盖三选那一支换成**合成 id**（`overwrite:<field>`）：它的回执走
   *   `confirmations`，结账那一跳按这个 id 认出两者说的是同一次选择。
   */
  const toAnswered = useCallback(
    (
      prompt: StudioOperatorQuestionPrompt,
      question: StudioOperatorQuestion,
      answer: StudioOperatorQuestionAnswer,
    ): {
      answered: StudioOperatorQuestionAnswered
      assets: StudioOperatorAttachment[]
    } => {
      const picked = answer.optionIds.flatMap((optionId) => {
        const option = question.options.find(
          (candidate) => candidate.id === optionId,
        )
        return option ? [option] : []
      })
      const labels = picked.map((option) => option.label)
      const otherText = answer.otherText?.trim()
      return {
        answered: {
          header: question.header,
          labels,
          answer: {
            questionId: prompt.overwrite
              ? overwriteAnswerId(prompt.overwrite.field)
              : answer.questionId,
            optionIds: picked.map((option) => option.id),
            ...(otherText ? { otherText } : {}),
            question: question.question,
            ...(labels.length ? { optionLabels: labels } : {}),
          },
        },
        /**
         * 带缩略图的选项 → 附件（**四入口那条同一条 chip 管线**，§7）：服务端的
         * 准入名单只认 `mentionedAssets`，⛔ 没有第二条「被选中的候选」通道。
         */
        assets: picked.flatMap((option) =>
          option.assetUrl
            ? [
                {
                  id: option.id,
                  url: option.assetUrl,
                  label: option.label,
                  kind: 'image' as const,
                  thumbnailUrl: option.assetUrl,
                },
              ]
            : [],
        ),
      }
    },
    [],
  )

  /**
   * 一道题答成了什么 —— **给人读的那半句**（小标签 / 系统行「问题 · 答案」）。
   * 选项与补的那一句按语言拼成一串；什么都没有 = 跳过。
   */
  const describeAnswerLabel = useCallback(
    (item: StudioOperatorQuestionAnswered): string => {
      const other = item.answer.otherText?.trim()
      const parts = [...item.labels, ...(other ? [other] : [])]
      return parts.length
        ? new Intl.ListFormat(locale, { type: 'conjunction' }).format(parts)
        : tQuestion('skipped')
    },
    [locale, tQuestion],
  )

  /**
   * 一道题答成了什么 —— **给模型与库读的那一整句**（自包含：带题面）。
   *
   * ⭐ 题面写在句子里，⛔ 不是「你选了 X」：这句话要去的地方是三轮之后的一段对话，
   * 那里没有卡。⭐ 走 i18n（2026-10-14）：从前写死中文，缩略图那一支还把它当用户
   * 气泡正文落下，英文 / 日文界面上原样印出中文。
   * ⚠ 跳过也要说出口：从前 Esc 作废整组一行不落，模型下一轮不知道用户拒答了。
   */
  const describeAnswerText = useCallback(
    (item: StudioOperatorQuestionAnswered): string => {
      const question = (item.answer.question ?? '').trim()
      const other = item.answer.otherText?.trim() ?? ''
      const labels = item.labels.length
        ? new Intl.ListFormat(locale, { type: 'conjunction' }).format(
            item.labels.map((label) =>
              tQuestion('quote', { label: label.trim() }),
            ),
          )
        : ''
      if (labels && other)
        return tQuestion('answerBoth', { labels, other, question })
      if (labels) return tQuestion('answerText', { labels, question })
      if (other) return tQuestion('answerOther', { other, question })
      return tQuestion('skippedText', { question })
    },
    [locale, tQuestion],
  )

  /**
   * 记下一格或几格答复：还有题就进下一题，整组答完（或这一句带了图）才落账、发一次。
   *
   * ⭐ 整组答完时两件事缺一不可：卡消失（钉住区清空）+ 时间线落「问题 · 答案」
   * 系统行 —— ⛔ 不把卡留在时间线里代替它（卡钉在输入框上方就是为了不随时间线滚走）。
   *
   * ⭐ **一组题一次答完再发**（56b 切片 4）：从前一帧一题，每答一题都要重跑一整轮
   * 工具环。已答的那几道**留在 prompt 里而不是时间线里**：「← 上一题」只要 pop 一格。
   * ⚠ **带图的答复当场收组**：服务端看图的准入名单只读**最后一条用户消息**的附件
   * （`buildMentionedAssets`），所以这一句必须落成那条用户行、并且马上发。没答的题
   * 助手要问自然会再问。缩略图选项与输入框里挂的图走的是同一条。
   * ⚠ 覆盖三选（单题）点的是三档之一 → `confirmations` 回执并当场写表单；跳过 =
   * 「保留」；打字作答照旧当一句回答发（⛔ 不猜它想覆盖还是追加）。
   */
  const settleQuestion = useCallback(
    (
      prompt: StudioOperatorQuestionPrompt,
      added: readonly {
        answered: StudioOperatorQuestionAnswered
        assets: readonly StudioOperatorAttachment[]
      }[],
      attachments: readonly StudioOperatorAttachment[],
    ) => {
      const answeredAll = [
        ...prompt.answers,
        ...added.map((item) => item.answered),
      ]
      const carried = [...attachments]
      for (const item of added) {
        for (const asset of item.assets) {
          addOperatorMention(asset)
          if (!carried.some((candidate) => candidate.id === asset.id))
            carried.push(asset)
        }
      }
      if (
        answeredAll.length < prompt.questions.length &&
        carried.length === 0
      ) {
        // ⚠ 勾选只属于当前题：进下一题就清空。
        setOperatorQuestion({ ...prompt, answers: answeredAll, checked: [] })
        return
      }
      setOperatorQuestion(null)

      const last = answeredAll.at(-1)
      const choice =
        prompt.overwrite && last
          ? (toConfirmChoice(last.answer.optionIds[0]) ??
            (last.answer.optionIds.length === 0 && !last.answer.otherText
              ? ASSISTANT_OPERATOR_CONFIRM_CHOICES.keep
              : undefined))
          : undefined
      if (prompt.overwrite && last && choice) {
        const subject = `${last.header} · ${describeAnswerLabel(last)}`
        appendOperatorEntry({
          kind: 'system',
          id: nextOperatorEntryId('sys'),
          code: 'questionAnswered',
          // Q8：留「问题 · 答案」一行，回看知道当时在选什么。
          subject,
          userText: describeAnswerText(last),
          answered: last.answer,
        })
        const applied = applyOverwriteChoice(prompt.overwrite, choice, subject)
        void run({
          confirmations: [
            {
              field: prompt.overwrite.field,
              choice,
              ...(applied ? { applied: true } : {}),
            },
          ],
        })
        return
      }

      /**
       * ⭐ **这几行同时是 user 消息**（2026-09-12 真机 bug 的根）：它们各自带着自包含
       * 的 `userText`，进 `messages`、进库、刷新之后还在 —— 只随当次请求上送
       * `planAnswers` 的话，再下一轮「用户已经答过」就无处可说。
       */
      for (const [index, item] of answeredAll.entries()) {
        if (carried.length > 0 && index === answeredAll.length - 1) {
          appendOperatorEntry({
            kind: 'user',
            id: nextOperatorEntryId('user'),
            text: describeAnswerText(item),
            attachments: carried,
          })
          continue
        }
        appendOperatorEntry({
          kind: 'system',
          id: nextOperatorEntryId('sys'),
          code: 'questionAnswered',
          subject: `${item.header} · ${describeAnswerLabel(item)}`,
          userText: describeAnswerText(item),
          answered: item.answer,
        })
      }
      void run({
        planAnswers: answeredAll.map((item) => item.answer),
        planApproved: true,
      })
    },
    [run, applyOverwriteChoice, describeAnswerLabel, describeAnswerText],
  )

  const answerQuestion = useCallback(
    (
      answer: StudioOperatorQuestionAnswer,
      options: {
        /** 打字作答时那句话里挂的图（@ / 📎）。 */
        attachments?: readonly StudioOperatorAttachment[]
      } = {},
    ) => {
      if (!isCurrentThread()) return
      const prompt = getOperatorState().question
      if (!prompt) return
      /** ⭐ **当前是第几题 = 已答几道**（56b 切片 4）。⛔ 不另存一个下标。 */
      const current = prompt.questions[prompt.answers.length]
      if (!current) return
      settleQuestion(
        prompt,
        [toAnswered(prompt, current, answer)],
        options.attachments ?? [],
      )
    },
    [isCurrentThread, settleQuestion, toAnswered],
  )

  /**
   * **「全部用推荐」**（2026-10-14）—— 当前与之后每道题都取推荐项，整组一次发。
   * ⚠ 没有推荐项的那道算跳过（⛔ 不替用户挑第一个：那不是「推荐」）。
   */
  const acceptRecommendedQuestions = useCallback(() => {
    if (!isCurrentThread()) return
    const prompt = getOperatorState().question
    if (!prompt) return
    const rest = prompt.questions.slice(prompt.answers.length)
    if (rest.length === 0) return
    settleQuestion(
      prompt,
      rest.map((question) => {
        const recommended = question.options.find(
          (option) => option.recommended === true,
        )
        return toAnswered(prompt, question, {
          questionId: question.id,
          optionIds: recommended ? [recommended.id] : [],
        })
      }),
      [],
    )
  }, [isCurrentThread, settleQuestion, toAnswered])

  /**
   * **「← 上一题」**（56b 切片 4）—— 把最后一格答复退回来，回到那一道题。
   *
   * ⭐ 那一题当时勾的选项**放回 `checked`**：回去是为了改，不是重做一遍。
   * ⚠ 第一题上不画这颗（面板那一侧判），所以这里**只做退一格**。
   */
  const goBackQuestion = useCallback(() => {
    if (!isCurrentThread()) return
    const prompt = getOperatorState().question
    const popped = prompt?.answers.at(-1)
    if (!prompt || !popped) return
    setOperatorQuestion({
      ...prompt,
      answers: prompt.answers.slice(0, -1),
      checked: popped.answer.optionIds,
    })
  }, [isCurrentThread])

  /**
   * **多步确认卡「开始」**（§3.3）—— 带 `planApproved: true` 重发。
   *
   * ⚠ `planApproved: true` 是硬要求：它让服务端跳过「问题 / 多步确认」那一整段，
   * 否则用户点「开始」之后看到的是同一张卡又回来了（一个自己喂自己的环）。
   * ⚠ 已经定过的直接返回：连点两下发的是两轮请求，而第二轮会把第一轮 abort 掉
   * 再从头跑一遍。
   */
  const approvePlan = useCallback(() => {
    if (!isCurrentThread()) return
    const confirm = getOperatorState().confirm
    if (
      !confirm ||
      confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep ||
      confirm.status !== STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
    ) {
      return
    }
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting)
    /**
     * ⭐ 批准之后计划**就地变成一张清单**（D12 S9）：落一条计划、逐项打勾，
     * 那张卡收掉 —— ⛔ 不再留一行「已确认 · N 步计划」挂在线程末尾，跟着每一轮往下漂。
     */
    const planId = nextOperatorEntryId('plan')
    const labels = confirm.steps.map((step) => step.label)
    appendOperatorEntry({ kind: 'plan', id: planId, steps: labels })
    startOperatorResumePlan({ planId, labels })
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed)
    setOperatorConfirm(null)
    void run({ planApproved: true })
  }, [run, isCurrentThread])

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
    if (!isCurrentThread()) return
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
  }, [isCurrentThread])

  /**
   * 计划「修改」（§3.1 ⑤）—— ⛔ **不发请求**，只记下「下一条消息是一次改计划」。
   */
  const revisePlan = useCallback(() => {
    if (!isCurrentThread()) return
    if (!getOperatorState().confirm) return
    reviseRef.current = true
    setOperatorStatus('idle')
  }, [isCurrentThread])

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
  const applyGenerationKnob = useCallback(
    (
      knob: StudioOperatorGenerateKnob,
      value: string,
      record: boolean,
    ): readonly StudioOperatorGenerateKnob[] => {
      if (!isCurrentThread()) return []
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
      /**
       * 确认卡上调一档，工作台那一格同步变（owner 2026-10-07 动效第 3 批「确认卡与
       * 工作台同步」）：与助手改工作台同一条路 —— 光标走过去、那一格闪一下。
       * ⚠ 排到下一帧：这一拍表单刚落、那一格正要重渲染。
       */
      const touched: StudioOperatorField[] = []
      for (const step of steps) {
        const field = applyOperatorStep(step, applyContext)
        if (field && field !== STUDIO_OPERATOR_FIELD_IDS.canvasNodes)
          touched.push(field)
        if (!field || !record) continue
        recordOperatorChange({
          field,
          stepId: step.id,
          reason: step.reason ?? tConfirm('generate.knobStepReason'),
          firstInverse: step,
          previousLabel: describeOperatorInverse(step),
        })
      }
      if (touched.length > 0 && typeof window !== 'undefined')
        window.requestAnimationFrame(() => {
          for (const field of touched) flashAssistantTouchedField(field)
        })
      return adjusted
    },
    [applyContext, domain, host.generationControls, tConfirm, isCurrentThread],
  )
  const adjustGeneration = useCallback(
    (knob: StudioOperatorGenerateKnob, value: string) =>
      applyGenerationKnob(knob, value, true),
    [applyGenerationKnob],
  )
  /**
   * **输入框上方规格行就地改一颗**（D12 B6）—— 与确认卡同一条写回通道，
   * ⛔ 但不进登记簿：这是用户自己在改工作台，不是助手做的一步，记进去就会
   * 在参数栏上亮一颗「助手改过」的 ✦。
   */
  const setGenerationKnob = useCallback(
    (knob: StudioOperatorGenerateKnob, value: string) =>
      applyGenerationKnob(knob, value, false),
    [applyGenerationKnob],
  )

  const confirmGeneration = useCallback(
    (options: { auto?: boolean; nodeIds?: readonly string[] } = {}) => {
      if (!isCurrentThread()) return
      const confirm = getOperatorState().confirm
      if (
        !confirm ||
        confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate ||
        confirm.status !== STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
      ) {
        return
      }
      /**
       * ⭐ **自动生成单轮上限**（owner 2026-10-14）：这张卡加起来要出的张数（每张画布
       * 卡按它自己的张数，工作台按此刻的张数）超过上限，就不替你按 —— 卡照常摆着等你。
       * ⚠ 新内核的画布不设上限（owner 10-23「一句话出完所有选中的卡」）。
       */
      if (options.auto && domain !== 'canvas') {
        const nodes =
          confirm.request.canvasNodes ??
          (confirm.request.canvasNode ? [confirm.request.canvasNode] : [])
        const outputs = nodes.length
          ? nodes.reduce((sum, node) => {
              const state = host.canvasTargets?.generationStateOf?.(node.id)
              const request = state ? buildCanvasGenerationRequest(state) : null
              return sum + (request?.count ?? confirm.request.count)
            }, 0)
          : (host.generationControls?.count ?? confirm.request.count)
        if (outputs > ASSISTANT_AUTO_GENERATE_LIMITS.maxOutputsPerRound) {
          appendOperatorEntry({
            kind: 'system',
            id: nextOperatorEntryId('sys'),
            code: 'autoGenerateHeld',
            subject: String(outputs),
          })
          return
        }
      }
      /**
       * ⭐ **几张卡一张确认卡**（v3 S2 · 方向 C 队列条）：用户在条上去掉的不跑，留下的
       *   各按自己那张卡的生成键跑。确认之后 `canvasNodes` 收成真跑的那几张 —— 条上
       *   接着显示的进度与结果读的就是它。
       */
      const batch = confirm.request.canvasNodes
      if (batch) {
        const generate = applyContext.canvas?.generate
        if (!generate) return
        const wanted = options.nodeIds ? new Set(options.nodeIds) : null
        const chosen = wanted
          ? batch.filter((node) => wanted.has(node.id))
          : batch
        if (chosen.length === 0) return
        setOperatorConfirm({
          ...confirm,
          request: { ...confirm.request, canvasNodes: chosen },
        })
        resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed, {
          auto: options.auto,
        })
        setOperatorStatus('idle')
        autoReviewRef.current = null
        for (const node of chosen) generate(node.id)
        return
      }
      if (
        confirm.request.canvasNode
          ? !applyContext.canvas?.generate
          : !applyContext.triggerGeneration
      ) {
        return
      }
      if (confirm.request.canvasNode && host.canvasTargets?.generationStateOf) {
        const node = host.canvasTargets.generationStateOf(
          confirm.request.canvasNode.id,
        )
        const request = node ? buildCanvasGenerationRequest(node) : null
        if (!request) return
        setOperatorConfirm({
          ...confirm,
          request: { ...request, canvasNode: confirm.request.canvasNode },
        })
      }
      if (
        !confirm.request.canvasNode &&
        host.searchGrounding?.available &&
        host.searchGrounding.on
      ) {
        setOperatorConfirm({
          ...confirm,
          request: { ...confirm.request, searchGrounding: true },
        })
      }
      resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed, {
        auto: options.auto,
      })
      setOperatorStatus('idle')
      autoReviewRef.current = null
      /**
       * ⭐ **画布那一枪**（node-canvas-v2 §13.2.1）：扳机是那张画布卡自己的生成键，
       * ⛔ 不是工作台的 `triggerGeneration`。
       * ⚠ 不落结果卡：画布的产出落在那张卡自己的版本表里（宿主 `results` 恒空），
       *   落了只会在认领超时后报一句假的「这一批没有出图」。
       */
      if (confirm.request.canvasNode) {
        const nodeId = confirm.request.canvasNode.id
        autoReviewRef.current = {
          kind: 'canvas',
          nodeId,
          before: host.canvasTargets?.outputOf?.(nodeId)?.url,
        }
        applyContext.canvas?.generate(nodeId)
        return
      }
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
      // 「先搜再画」那一刻开没开：只记一个布尔，「已确认 · … · 先搜再画」读它。
      const searchGrounding =
        host.searchGrounding?.available && host.searchGrounding.on
          ? { searchGrounding: true }
          : {}
      const request = controls
        ? {
            ...confirm.request,
            ...searchGrounding,
            model: controls.model ?? confirm.request.model,
            count: controls.count,
            specs: {
              ...confirm.request.specs,
              aspectRatio: controls.aspectRatio,
              resolution: controls.resolution,
            },
          }
        : { ...confirm.request, ...searchGrounding }
      /**
       * **生成中那张结果卡就地落进时间线**（v2 §6.3，commit #10）。
       *
       * ⭐ 用的是刚刚拼出来的那份 `request`：卡上写的张数
       * 与真的发出去的那一枪逐字同源（判据与上面那段头注同一条）。⛔ 别等结果回来
       * 才落卡 —— 图片档一批四张要跑几十秒，这几十秒里时间线上什么都没有，
       * 用户不知道自己刚才那一下点没点上。
       * ⚠ 张数与缩略图由宿主回流往这条上写（`use-studio-operator-results.ts`），
       *   这里一个数都不猜。
       */
      const pendingResultId = nextOperatorEntryId('result')
      const threadScope = getOperatorState().threadScope
      if (!threadScope) return
      appendOperatorPendingResult({
        id: pendingResultId,
        total: request.count,
        ...(request.label ? { summary: request.label } : {}),
        request,
      })
      autoReviewRef.current = {
        kind: 'result',
        resultId: pendingResultId,
      }
      applyContext.triggerGeneration?.(request, {
        threadScope,
        localThreadId,
        pendingResultId,
      })
    },
    [
      applyContext,
      domain,
      host.generationControls,
      host.canvasTargets,
      host.searchGrounding,
      isCurrentThread,
      localThreadId,
    ],
  )

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
    if (!isCurrentThread()) return
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
    if (!isCurrentThread()) return
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
      ...contextCardDecision(
        { kind: confirm.card.kind, name: result.data.name },
        OPERATOR_CONTEXT_CARD_CHOICE_IDS.save,
      ),
    })
  }, [isCurrentThread])

  /**
   * **「不用」**（§8.1）—— 卡收成「已取消」，那一行 `proposed` **真删**。
   *
   * ⚠ 「不用」是一个**明确的拒绝**：留着它只会在设置的待确认区里反复问同一句。
   * ⚠ 删失败不报错、也不回退卡态：用户表达过的意思不该因为一次网络抖动被推翻，
   *   ⛔ 那一行最坏就是留在待确认区里，他在那儿还能再删一次。
   */
  const dismissContextCard = useCallback(async () => {
    if (!isCurrentThread()) return
    const confirm = getOperatorState().confirm
    if (
      !confirm ||
      confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard
    ) {
      return
    }
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled)
    setOperatorStatus('idle')
    /**
     * ⚠ 这一行**落账而不是静默**（2026-09-12 真机 bug）：从前的判据是「什么都
     * 没发生，不必记一笔」，但对模型而言「用户回绝过」与「用户还没看见」是两件
     * 完全不同的事 —— 不说出口，它下一轮照旧提同一张卡。
     */
    appendOperatorEntry({
      kind: 'system',
      id: nextOperatorEntryId('sys'),
      code: 'contextCardDeclined',
      subject: confirm.card.name,
      ...contextCardDecision(
        confirm.card,
        OPERATOR_CONTEXT_CARD_CHOICE_IDS.decline,
      ),
    })
    if (confirm.cardId) await deleteContextCardAPI(confirm.cardId)
  }, [isCurrentThread])

  /**
   * 设定提议卡那一下的**落账两件套**（判据与 `contextCardDecision` 逐字同源）：一条
   * 自带题面的正文 + 结构化那一半。少了它们，模型下一轮读到的是一张没人回应的提议，
   * 于是重提同一份设定。
   */
  const characterProfileDecision = useCallback(
    (
      characterId: string,
      kept: readonly AssistantOperatorCharacterProfileFieldDraft[],
    ) => {
      const name =
        buildSnapshot().cards?.characters.find(
          (item) => item.id === characterId,
        )?.name ?? characterId
      const keptFields = kept.map((item) => item.field)
      const label = describeCharacterProfileDecisionText(name, keptFields)
      return {
        name,
        userText: label,
        answered: {
          questionId: `characterProfile:${characterId}`,
          optionIds: keptFields.length ? keptFields : ['decline'],
          question: describeCharacterProfileProposalText(name),
          optionLabels: [label],
        } satisfies AssistantOperatorPlanAnswer,
      }
    },
    [buildSnapshot],
  )

  const keepCharacterProfile = useCallback(
    async (fields: readonly AssistantOperatorCharacterProfileFieldDraft[]) => {
      if (!isCurrentThread()) return
      const confirm = getOperatorState().confirm
      if (
        !confirm ||
        confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.characterProfile ||
        confirm.status !== STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle ||
        fields.length === 0
      ) {
        return
      }
      const applyProfile = applyContext.cards?.applyProfile
      resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting)
      const ok = applyProfile
        ? await applyProfile(
            confirm.profile.characterId,
            fields.map((item) => ({ field: item.field, text: item.text })),
          )
        : false
      if (!isCurrentThread()) return
      const decision = characterProfileDecision(
        confirm.profile.characterId,
        fields,
      )
      if (!ok) {
        // ⛔ 不静默：用户以为已经写进去了。卡回到 idle，可以再点一次。
        setOperatorConfirm({
          ...confirm,
          status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
        })
        appendOperatorEntry({
          kind: 'system',
          id: nextOperatorEntryId('sys'),
          code: 'characterProfileSaveFailed',
          subject: decision.name,
        })
        return
      }
      setOperatorConfirm({
        ...confirm,
        keptCount: fields.length,
        status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting,
      })
      resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed)
      setOperatorStatus('idle')
      appendOperatorEntry({
        kind: 'system',
        id: nextOperatorEntryId('sys'),
        code: 'characterProfileSaved',
        subject: decision.userText,
        userText: decision.userText,
        answered: decision.answered,
      })
    },
    [applyContext, characterProfileDecision, isCurrentThread],
  )

  const dismissCharacterProfile = useCallback(() => {
    if (!isCurrentThread()) return
    const confirm = getOperatorState().confirm
    if (
      !confirm ||
      confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.characterProfile ||
      confirm.status !== STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
    ) {
      return
    }
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled)
    setOperatorStatus('idle')
    const decision = characterProfileDecision(confirm.profile.characterId, [])
    appendOperatorEntry({
      kind: 'system',
      id: nextOperatorEntryId('sys'),
      code: 'characterProfileDeclined',
      subject: decision.name,
      userText: decision.userText,
      answered: decision.answered,
    })
  }, [characterProfileDecision, isCurrentThread])

  /** 这一页上这位角色叫什么（查不到退回 id）。 */
  const characterName = useCallback(
    (characterId: string) =>
      buildSnapshot().cards?.characters.find((item) => item.id === characterId)
        ?.name ?? characterId,
    [buildSnapshot],
  )

  /** 候选图卡那一下的落账两件套（判据同 `characterProfileDecision`）。 */
  const characterImagesDecision = useCallback(
    (
      characterId: string,
      offered: number,
      keys: readonly string[],
      kept: number,
    ) => {
      const name = characterName(characterId)
      const label = describeCharacterImagesDecisionText(name, kept)
      return {
        name,
        userText: label,
        answered: {
          questionId: `characterImages:${characterId}`,
          optionIds: keys.length ? [...keys] : ['decline'],
          question: describeCharacterImagesProposalText(name, offered),
          optionLabels: [label],
        } satisfies AssistantOperatorPlanAnswer,
      }
    },
    [characterName],
  )

  const keepCharacterImages = useCallback(
    async (keys: readonly string[]) => {
      if (!isCurrentThread()) return
      const confirm = getOperatorState().confirm
      if (
        !confirm ||
        confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.characterImages ||
        confirm.status !== STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle ||
        keys.length === 0
      ) {
        return
      }
      const { characterId, images } = confirm.proposal
      const picked = images.filter((image) => keys.includes(image.key))
      resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting)
      /**
       * 素材库那几张直接挂；网上那几张**这时才**存进素材库（拍板 21：看与选是两件事），
       * 存成了再挂。存不成的那几张跳过，挂上几张如实落账。
       */
      const ready = (
        await Promise.all(
          picked.map(async (image) => {
            if (image.source === 'library' && image.assetId) {
              return {
                url: image.url,
                generationId: image.assetId,
                origin: image.origin ?? ('generation' as const),
              }
            }
            const response = await importWebImageAPI({
              imageUrl: image.url,
              ...(image.pageUrl ? { pageUrl: image.pageUrl } : {}),
              ...(image.domain ? { domain: image.domain } : {}),
              ...(image.title ? { title: image.title } : {}),
            })
            return response.success
              ? {
                  url: response.data.generation.url,
                  generationId: response.data.generation.id,
                  origin: 'upload' as const,
                }
              : null
          }),
        )
      ).filter((image) => image !== null)
      if (!isCurrentThread()) return
      const attached =
        ready.length && applyContext.cards
          ? await applyContext.cards.attachImages(characterId, ready)
          : null
      if (!isCurrentThread()) return
      if (!attached) {
        // ⛔ 不静默：卡回到 idle，可以再点一次。
        setOperatorConfirm({
          ...confirm,
          status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
        })
        appendOperatorEntry({
          kind: 'system',
          id: nextOperatorEntryId('sys'),
          code: 'characterImagesAttachFailed',
          subject: characterName(characterId),
        })
        return
      }
      const decision = characterImagesDecision(
        characterId,
        images.length,
        keys,
        attached,
      )
      setOperatorConfirm({
        ...confirm,
        keptCount: attached,
        status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting,
      })
      resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed)
      setOperatorStatus('idle')
      appendOperatorEntry({
        kind: 'system',
        id: nextOperatorEntryId('sys'),
        code: 'characterImagesAttached',
        subject: decision.userText,
        userText: decision.userText,
        answered: decision.answered,
      })
    },
    [applyContext, characterImagesDecision, characterName, isCurrentThread],
  )

  const dismissCharacterImages = useCallback(() => {
    if (!isCurrentThread()) return
    const confirm = getOperatorState().confirm
    if (
      !confirm ||
      confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.characterImages ||
      confirm.status !== STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
    ) {
      return
    }
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled)
    setOperatorStatus('idle')
    const decision = characterImagesDecision(
      confirm.proposal.characterId,
      confirm.proposal.images.length,
      [],
      0,
    )
    appendOperatorEntry({
      kind: 'system',
      id: nextOperatorEntryId('sys'),
      code: 'characterImagesDeclined',
      subject: decision.name,
      userText: decision.userText,
      answered: decision.answered,
    })
  }, [characterImagesDecision, isCurrentThread])

  /**
   * **画布放大**（P6）：两颗键都落账（模型下一轮知道用户怎么定的）。按下去由画布那只手一张
   * 一张放大，结果是各自那张卡的新版本。
   * ⚠ 放大要几秒到几十秒：结果回来时这段对话可能已经换了 —— 失败那一行只在还是这段对话时落。
   * ⚠ 缺 fal key：错误条点名缺哪一家，「配置 Key」就地开 `QuickSetupDialog`（Hard Rule 8），
   *   配好接着跑刚才那句（她会再摆一张放大卡）。
   */
  const decideUpscale = useCallback(
    (accepted: boolean, options: { auto?: boolean } = {}) => {
      if (!isCurrentThread()) return
      const confirm = getOperatorState().confirm
      if (
        !confirm ||
        confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.upscale ||
        confirm.status !== STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
      ) {
        return
      }
      const upscale = applyContext.canvas?.upscale
      if (accepted && !upscale) return
      const { nodes } = confirm.request
      const names = nodes.map((node) => `「${node.name}」`).join('')
      const label = tConfirm(
        accepted ? 'upscale.acceptedText' : 'upscale.declinedText',
        {
          names,
        },
      )
      resolveOperatorConfirm(
        accepted
          ? STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed
          : STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled,
        { auto: options.auto },
      )
      setOperatorStatus('idle')
      appendOperatorEntry({
        kind: 'system',
        id: nextOperatorEntryId('sys'),
        code: accepted ? 'upscaleAccepted' : 'upscaleDeclined',
        subject: names,
        userText: label,
        answered: {
          questionId: `upscale:${nodes.map((node) => node.id).join(',')}`,
          optionIds: [accepted ? 'accept' : 'decline'],
          question: tConfirm('upscale.question', { names }),
          optionLabels: [label],
        },
      })
      if (!accepted || !upscale) return
      for (const node of nodes) {
        void upscale(node.id).then((outcome) => {
          if (outcome.status === 'done' || !isCurrentThread()) return
          if (outcome.status === 'missingKey') {
            const modelId =
              canvasCapabilityRuntime.open('upscale').defaultModelId ?? ''
            setOperatorStatus(
              'error',
              tError('upscaleKeyMissing', {
                provider: getProviderLabel(
                  getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
                ),
              }),
              null,
              ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
              { adapterType: AI_ADAPTER_TYPES.FAL, modelId },
            )
            return
          }
          appendOperatorEntry({
            kind: 'system',
            id: nextOperatorEntryId('sys'),
            code: 'upscaleFailed',
            subject: `「${node.name}」${outcome.reason ? `：${outcome.reason}` : ''}`,
          })
        })
      }
    },
    [applyContext, isCurrentThread, tConfirm, tError],
  )
  const acceptUpscale = useCallback(() => decideUpscale(true), [decideUpscale])
  const dismissUpscale = useCallback(
    () => decideUpscale(false),
    [decideUpscale],
  )
  useEffect(() => {
    decideUpscaleRef.current = decideUpscale
    return () => {
      decideUpscaleRef.current = null
    }
  }, [decideUpscale])

  /**
   * **搭配卡「应用这套搭配」**（lora-assistant §12，owner 2026-09-28「一张卡全包」）。
   *
   * ⭐ 客户端逐行应用，**每一行一条带 `inverse` 的 step**（与服务端那几条工具同一种
   * 形状：`unmount_lora` / `set_lora_weight` / `set_lora_parameters` /
   * `mount_lora`），同一个 runKey —— 过程行上那颗「撤销」一次撤回整套。
   * ⚠ 顺序：卸下 → 权重 → 参数 → 新挂。新挂要过下载闸与导入（慢、可能失败），放
   *   最后；前面几行是同步的，先落地。
   * ⚠ 撤销用的原值按**这一刻**的装配台现取（⛔ 用卡上那一格「原值」）：卡摆出来之后
   *   创作者自己动过滑杆，撤销该回到他动过之后的样子。
   * ⚠ 已经不在台上的那一行（卡摆出来之后被手动卸掉了）跳过并记一处没成，⛔ 不报错
   *   整张 —— 其余几行照常应用。
   * ⛔ **不新开一轮**：这张卡是助手搭好的整套，应用就是终点；创作者下一句话照常带着
   *   最新快照与这一行账进下一轮。
   */
  const applyLoraSetup = useCallback(async () => {
    if (!isCurrentThread()) return
    const confirm = getOperatorState().confirm
    if (
      !confirm ||
      confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.loraSetup ||
      confirm.status !== STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
    ) {
      return
    }
    const lora = applyContext.lora
    if (!lora) return
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting)
    const { setup } = confirm
    const runKey = nextOperatorEntryId('run')
    const bench = buildSnapshot().loras?.items ?? []
    let index = 0
    let failed = 0
    const nextStepId = () => {
      index += 1
      return `setup-${index}`
    }
    const land = (step: AssistantOperatorStep) => {
      upsertOperatorStep(step, runKey)
      if (step.status !== 'done') return
      applyOperatorStep(step, applyContext)
      const field = getOperatorStepField(step)
      if (!field) return
      recordOperatorChange({
        field,
        stepId: operatorStepEntryId(runKey, step.id),
        firstInverse: step,
        previousLabel: describeOperatorInverse(step),
      })
    }

    for (const row of setup.unmounts) {
      const current = bench.find((item) => item.id === row.loraId)
      if (!current) {
        failed += 1
        continue
      }
      land({
        id: nextStepId(),
        title: row.name,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
        verb: ASSISTANT_OPERATOR_TOOL_VERBS[
          ASSISTANT_OPERATOR_TOOL_IDS.unmountLora
        ],
        status: 'done',
        payload: { loraId: row.loraId, name: row.name },
        inverse: { loraId: row.loraId, weight: current.weight },
      })
    }

    for (const row of setup.weights) {
      const current = bench.find((item) => item.id === row.loraId)
      if (!current) {
        failed += 1
        continue
      }
      land({
        id: nextStepId(),
        title: row.name,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
        verb: ASSISTANT_OPERATOR_TOOL_VERBS[
          ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight
        ],
        status: 'done',
        payload: { loraId: row.loraId, name: row.name, weight: row.to },
        inverse: { loraId: row.loraId, weight: current.weight },
      })
    }

    if (setup.parameters) {
      const current = buildSnapshot().loraParameters
      if (!current || !lora.setParameters) {
        failed += 1
      } else {
        const previous = Object.fromEntries(
          Object.keys(AssistantLoraParametersSchema.shape).map((key) => [
            key,
            current[key as keyof AssistantLoraParameters] ?? null,
          ]),
        ) as AssistantLoraParameters
        land({
          id: nextStepId(),
          title: OPERATOR_LORA_SETUP_CHOICE_LABELS.apply,
          tool: ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters,
          verb: ASSISTANT_OPERATOR_TOOL_VERBS[
            ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters
          ],
          status: 'done',
          payload: setup.parameters.patch,
          inverse: previous,
        })
      }
    }

    for (const row of setup.mounts) {
      const candidate = row.candidate
      const base = {
        id: nextStepId(),
        title: candidate.name,
        tool: ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
        verb: ASSISTANT_OPERATOR_TOOL_VERBS[
          ASSISTANT_OPERATOR_TOOL_IDS.mountLora
        ],
      }
      const importPayload = candidate.importPayload
      if (!importPayload) {
        failed += 1
        continue
      }
      const payload = {
        candidateId: candidate.candidateId,
        name: candidate.name,
        weight: row.weight,
        triggerWords: candidate.triggerWords,
        family: candidate.family,
        compatible: true,
        importPayload,
      }
      upsertOperatorStep(
        {
          ...base,
          status: 'running',
          payload,
          inverse: { candidateId: candidate.candidateId },
        },
        runKey,
      )
      let detail = 'Mount did not complete'
      let mounted = false
      try {
        const outcome = await lora.mount(payload)
        mounted = Boolean(outcome.mounted && outcome.asset)
        if (outcome.error) detail = outcome.error
      } catch (error) {
        if (error instanceof Error) detail = error.message
      }
      if (!isCurrentThread()) return
      if (mounted) {
        // ⚠ 挂载那一跳已经由上面的 `lora.mount` 做完 —— 这里只落步与账，⛔ 不经
        //   `land`（它会再 `applyOperatorStep` 一次，等于挂两遍）。
        const step: AssistantOperatorStep = {
          ...base,
          status: 'done',
          payload,
          inverse: { candidateId: candidate.candidateId },
        }
        upsertOperatorStep(step, runKey)
        recordOperatorChange({
          field: STUDIO_OPERATOR_FIELD_IDS.loras,
          stepId: operatorStepEntryId(runKey, step.id),
          firstInverse: step,
          previousLabel: describeOperatorInverse(step),
        })
      } else {
        failed += 1
        upsertOperatorStep(
          {
            ...base,
            status: 'error',
            error: {
              reason: ASSISTANT_OPERATOR_REJECT_REASON_IDS.loraNotImportable,
              detail: detail.slice(0, ASSISTANT_OPERATOR_LIMITS.maxPromptChars),
            },
          },
          runKey,
        )
      }
    }

    setOperatorConfirm({
      ...confirm,
      ...(failed > 0 ? { failedCount: failed } : {}),
      status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.submitting,
    })
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.confirmed)
    setOperatorStatus('idle')
    appendOperatorEntry({
      kind: 'system',
      id: nextOperatorEntryId('sys'),
      code: 'loraSetupApplied',
      subject: setup.question,
      ...loraSetupDecision(
        setup.question,
        OPERATOR_LORA_SETUP_CHOICE_IDS.apply,
      ),
    })
  }, [applyContext, buildSnapshot, isCurrentThread])

  /** **搭配卡「先不用」** —— ⛔ 什么都不动、不发请求，但**落账**（同推荐卡）。 */
  const dismissLoraSetup = useCallback(() => {
    if (!isCurrentThread()) return
    const confirm = getOperatorState().confirm
    if (
      !confirm ||
      confirm.kind !== ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.loraSetup ||
      confirm.status !== STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle
    ) {
      return
    }
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled)
    setOperatorStatus('idle')
    appendOperatorEntry({
      kind: 'system',
      id: nextOperatorEntryId('sys'),
      code: 'loraSetupDismissed',
      subject: confirm.setup.question,
      ...loraSetupDecision(
        confirm.setup.question,
        OPERATOR_LORA_SETUP_CHOICE_IDS.dismiss,
      ),
    })
  }, [isCurrentThread])

  /** 生成确认卡「先不要」—— 流已经停了，什么都不用发；卡就地转「已取消」。 */
  useEffect(() => {
    confirmGenerationRef.current = confirmGeneration
    return () => {
      confirmGenerationRef.current = null
    }
  }, [confirmGeneration])

  const cancelGeneration = useCallback(() => {
    if (!isCurrentThread()) return
    resolveOperatorConfirm(STUDIO_OPERATOR_CONFIRM_STATUS_IDS.cancelled)
    setOperatorStatus('idle')
  }, [isCurrentThread])

  /**
   * 「已取消」那一态上的**再来一次**（画板 BCards「已取消 · 11:22」）。
   *
   * ⚠ 摆一张**新的** `idle` 卡而不是把状态改回去（`resolveOperatorConfirm` 明确
   * 不回退）：这一次确认与上一次是两件事，时刻也该重新记。
   */
  const retryGeneration = useCallback(() => {
    if (!isCurrentThread()) return
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
  }, [isCurrentThread])

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
    (
      request: AssistantOperatorGenerationRequest,
      openKnob?: StudioOperatorGenerateKnob,
    ) => {
      if (!isCurrentThread()) return
      setOperatorConfirm({
        id: nextOperatorEntryId('confirm'),
        kind: ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate,
        request,
        status: STUDIO_OPERATOR_CONFIRM_STATUS_IDS.idle,
        ...(openKnob ? { openKnob } : {}),
      })
    },
    [isCurrentThread],
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
    if (!isCurrentThread()) return
    const resume = getOperatorState().resume
    if (!resume) return
    const resumeFrom = toResumeFrom(resume)
    // ⚠ 一步都没做完 = 按「开始」重跑这份已批的计划，⛔ 别发一份服务端会拒的空清单。
    void run(
      resumeFrom ? { resumeFrom, planApproved: true } : { planApproved: true },
    )
  }, [run, isCurrentThread])

  // 面板卸载（切模态 / 离开工作台）时把在飞的流掐掉：留着它会继续往一个不存在
  // 的面板里应用 op —— 表单被改而线程已经没了。
  useEffect(() => () => abortRef.current?.abort(), [])
  /**
   * ⭐ 同一条规矩在 `/studio` 外壳里（第 9f 步）：面板只挂一份、换台不卸载，于是「换了台」
   *   由登记号说 —— 离开那个台就把在飞的流掐掉（开台那一跳早已收尾，掐了也没事）。
   * ⚠ 图片 ↔ 视频 ↔ 标签台是同一个台（同一次登记），⛔ 不因换模态掐流（与改动之前一致）。
   */
  const benchKey = useStudioOperatorBenchKey()
  const benchKeyRef = useRef(benchKey)
  useEffect(() => {
    if (benchKeyRef.current === benchKey) return
    benchKeyRef.current = benchKey
    abortRef.current?.abort()
  }, [benchKey])

  /** 新会话。 */
  const newThread = useCallback(() => {
    const current = getOperatorState()
    if (
      !scope ||
      current.threadScope !== scope ||
      current.localThreadId !== localThreadId
    )
      return
    abortRef.current?.abort()
    resetOperatorThread()
  }, [scope, localThreadId])

  return {
    domain,
    send,
    stop,
    cancelQueued,
    answerQuestion,
    acceptRecommendedQuestions,
    goBackQuestion,
    approvePlan,
    declinePlan,
    revisePlan,
    resumePlan,
    adjustGeneration,
    setGenerationKnob,
    confirmGeneration,
    cancelGeneration,
    saveContextCard,
    dismissContextCard,
    keepCharacterProfile,
    dismissCharacterProfile,
    keepCharacterImages,
    dismissCharacterImages,
    acceptUpscale,
    dismissUpscale,
    applyLoraSetup,
    dismissLoraSetup,
    retryGeneration,
    rerunGeneration,
    newThread,
  }
}
