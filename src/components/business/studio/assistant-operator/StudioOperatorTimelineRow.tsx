'use client'

/**
 * 对话流里的一行 + **五类卡的分派点**（v2 §3.2 · D12 A 对话流定稿）。
 *
 * ⭐ 一屏面板上只该有一套分类：**消息 / 问题 / 确认 / 结果 / 证据** 加上一档
 * **系统行**。形状由这一颗按类算，⛔ 不是调用方挑的。
 *
 * ── A 对话流（owner 2026-09-24 定）──────────────────────────────────
 * ⛔ **没有左侧时间线竖线与节点符号**：线和框层层套是「乱」的原因之一。
 * ⭐ **一轮只出一次头像名字**（C1）：它挂在用户那一句**后面**，本轮助手说的、
 *   做的、问的全都在它下面。⛔ 不再每一行各带一个头像。
 * ⭐ 用户那一句只是一个靠右的浅灰气泡，⛔ 不带名字与头像。
 * ⚠ 间距只有两档：轮与轮之间 20（用户那一句的 `mt-5`），轮内 10（`mt-2.5`）。
 */

import type { ComponentProps, ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { TimelineAvatar } from '@/components/business/studio/assistant-operator/TimelineAvatar'
import type { AssistantPersona } from '@/types/assistant-persona'

/**
 * **五类卡 + 系统行**（v2 §3.2）—— 时间线上唯一的一套分类。
 *
 * ⚠ 值同时是 `data-card` 的取值 —— 真机目检与组件测试都按它取行，⛔ 别改成
 * 组件内私有的字符串。
 */
export const STUDIO_OPERATOR_CARD_KINDS = {
  /** 消息：用户那一行 / 助手正文 / 评价卡 / 参考分析（「看」的产出，§2.4）。 */
  message: 'message',
  /** 问题：钉在输入框上方那张；时间线里只有它答完之后的那一行。 */
  question: 'question',
  /** 确认：多步 / 生成两支（§3.3）。 */
  confirm: 'confirm',
  /** 结果：宿主生成回调那一张（`StudioOperatorResultRow`）。 */
  result: 'result',
  /** 证据：查证卡 / 候选网格 / 工具步与 ToolGroup 这些「查」出来的过程。 */
  evidence: 'evidence',
  /** 系统行：checkpoint 薄卡 / 规则薄卡 / 「你选了 X」/ 错误行。 */
  system: 'system',
} as const

export type StudioOperatorCardKind =
  (typeof STUDIO_OPERATOR_CARD_KINDS)[keyof typeof STUDIO_OPERATOR_CARD_KINDS]

/** 消息那一类里说话的是谁 —— ⚠ 只有这一类分两方。 */
export const STUDIO_OPERATOR_SPEAKERS = {
  user: 'user',
  assistant: 'assistant',
} as const

export type StudioOperatorSpeaker =
  (typeof STUDIO_OPERATOR_SPEAKERS)[keyof typeof STUDIO_OPERATOR_SPEAKERS]

/**
 * 沟位的五档形状（§11.3 的表）—— **由卡类算出来**，⛔ 不是调用方挑的。
 *
 * ⚠ 值仍是 `data-node` 的取值：真机目检与既有用例按它取行，而形状这一层
 * 一个像素都没有改。
 */
const NODE_SHAPES = {
  user: 'user',
  assistant: 'assistant',
  big: 'big',
  tool: 'tool',
  system: 'system',
} as const

type StudioOperatorNodeShape = (typeof NODE_SHAPES)[keyof typeof NODE_SHAPES]

/**
 * **五类 + 系统行 → 沟位形状**。这就是那张分派表。
 *
 * ⚠ 证据落在**空心圆**那一档：它与 ToolGroup 是同一件事的两种详略
 * （「查了什么」与「查出什么」），此前就画在同一档上 —— 分开的表现是同一组
 * 检索在展开与折叠两态下沿着两条不同的轴排。
 */
function nodeShapeOf(
  card: StudioOperatorCardKind,
  speaker: StudioOperatorSpeaker,
): StudioOperatorNodeShape {
  switch (card) {
    case STUDIO_OPERATOR_CARD_KINDS.message:
      return speaker === STUDIO_OPERATOR_SPEAKERS.user
        ? NODE_SHAPES.user
        : NODE_SHAPES.assistant
    case STUDIO_OPERATOR_CARD_KINDS.question:
    case STUDIO_OPERATOR_CARD_KINDS.confirm:
    case STUDIO_OPERATOR_CARD_KINDS.result:
      return NODE_SHAPES.big
    case STUDIO_OPERATOR_CARD_KINDS.evidence:
      return NODE_SHAPES.tool
    case STUDIO_OPERATOR_CARD_KINDS.system:
      return NODE_SHAPES.system
  }
}

/**
 * 沟位 → 行标签的词表键（`StudioOperator.timeline.*`）。
 *
 * ⭐ 由来（2026-09-06 真机）：整条时间线对读屏是哑的 —— 行与行之间只有缩进和
 * 形状的区别，而这两样读屏都读不到，20 行下来听上去是一段没有说话人的独白。
 * 时间戳又已经按 §11.3 全部删掉，于是**这一行标签是唯一的发言人信息**。
 */
const NODE_LABEL_KEYS: Record<StudioOperatorNodeShape, string> = {
  [NODE_SHAPES.user]: 'rowUser',
  [NODE_SHAPES.assistant]: 'rowAssistant',
  [NODE_SHAPES.big]: 'rowAction',
  [NODE_SHAPES.tool]: 'rowTool',
  [NODE_SHAPES.system]: 'rowSystem',
}

/**
 * 时间线的**流容器**（`role="log"` + `aria-live="polite"`）。
 *
 * ⚠ 助手的回合是**一条一条长出来的**：没有 live region，读屏用户要靠反复往回
 * 翻才知道又出了一步。`polite` 而不是 `assertive` —— 它不该打断用户正在读的话。
 * ⚠ 一颗普通 `div` 的全部属性都收着（`ref` / `className` / `data-*` / 滚动
 * 处理器），所以 `StudioOperatorPanel` 那个 `threadRef` 容器可以原地换成它。
 */
export function StudioOperatorTimelineList({
  children,
  ...props
}: ComponentProps<'div'>) {
  const t = useTranslations('StudioOperator.timeline')
  return (
    <div
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-label={t('listLabel')}
      {...props}
    >
      {children}
    </div>
  )
}

interface StudioOperatorTimelineRowProps {
  /** 这一行是五类里的哪一类（§3.2）。 */
  card: StudioOperatorCardKind
  /** ⚠ 只有**消息**那一类读它；其余类无人说话，默认助手侧。 */
  speaker?: StudioOperatorSpeaker
  /**
   * 助手那一档的头像来源（§8.2）—— 外壳拉一次往下传，见 `TimelineAvatar` 头注。
   * ⚠ 缺席时画默认预设，⛔ 不出空圈。
   */
  persona?: AssistantPersona
  /**
   * 用户那一句后面要不要接本轮的头像名字（默认要）。⚠ 只有**不开启新一轮**的
   * 用户行才关掉（例如折叠里的旧历史末尾）。
   */
  roundHeader?: boolean
  children: ReactNode
}

/**
 * **对齐档**（画板 Main / BCards「消息 · 用户」）—— 用户消息靠右，其余靠左。
 *
 * ⚠ 值是 `data-align` 的取值：真机目检与组件测试按它取行。
 */
const ROW_ALIGNS = {
  start: 'start',
  end: 'end',
} as const

/**
 * **本轮的头像与名字**（D12 A · C1）—— 22 头像 + 13 中粗名字，一轮一次。
 *
 * ⚠ 名字读的是用户给助手起的那个（§8.2），没起名就是默认 ID。
 */
export function StudioOperatorRoundHeader({
  persona,
}: {
  persona?: AssistantPersona
}) {
  const t = useTranslations('StudioOperator.timeline')
  const name = persona?.name?.trim() || t('assistantFallback')
  return (
    <div
      data-testid="operator-round-header"
      className="mt-5 flex min-w-0 items-center gap-2"
    >
      <TimelineAvatar
        speaker="assistant"
        {...(persona ? { persona } : {})}
        className="size-5.5 ring-0"
      />
      <span
        data-testid="operator-speaker-name"
        className="min-w-0 truncate text-2sm font-medium text-foreground"
      >
        {name}
      </span>
    </div>
  )
}

export function StudioOperatorTimelineRow({
  card,
  speaker = STUDIO_OPERATOR_SPEAKERS.assistant,
  persona,
  roundHeader = true,
  children,
}: StudioOperatorTimelineRowProps) {
  const t = useTranslations('StudioOperator.timeline')
  const node = nodeShapeOf(card, speaker)
  const assistantName = persona?.name?.trim() || t('assistantFallback')
  /**
   * ⚠ `role="article"` 是为了让 `aria-label` 真的被念出来：裸 `div` 上的
   * `aria-label` 大多数读屏直接忽略。行标签是读屏唯一的发言人信息。
   */
  const rowLabel = t(NODE_LABEL_KEYS[node], {
    name: assistantName,
  })

  /**
   * ── 用户那一句：靠右的浅灰气泡 + 紧跟着本轮助手的头像名字（C1）──────
   * ⚠ 宽度上限走 `w-4/5` 的外列（Hard Rule 5 禁任意值）。
   */
  if (node === NODE_SHAPES.user) {
    return (
      <>
        <div
          data-testid="operator-timeline-row"
          data-card={card}
          data-node={node}
          data-align={ROW_ALIGNS.end}
          role="article"
          aria-label={rowLabel}
          className="mt-5 flex justify-end first:mt-0"
        >
          <div
            data-testid="operator-timeline-content"
            className="flex w-4/5 min-w-0 flex-col items-end gap-1"
          >
            {children}
          </div>
        </div>
        {roundHeader ? (
          <StudioOperatorRoundHeader {...(persona ? { persona } : {})} />
        ) : null}
      </>
    )
  }

  return (
    <div
      data-testid="operator-timeline-row"
      data-card={card}
      data-node={node}
      data-align={ROW_ALIGNS.start}
      role="article"
      aria-label={rowLabel}
      className="mt-2.5 min-w-0 first:mt-0"
    >
      <div data-testid="operator-timeline-content" className="min-w-0">
        {children}
      </div>
    </div>
  )
}
