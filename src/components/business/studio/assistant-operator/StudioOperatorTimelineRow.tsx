'use client'

/**
 * 时间线沟里的一行 + **五类卡的分派点**（v2 §3.2 / 方向 C §11.3）。
 *
 * ⭐ 一屏面板上只该有一套分类（§2.4）：时间线的词汇因此就是那五类卡
 * **消息 / 问题 / 确认 / 结果 / 证据** 加上一档**系统行**，⛔ 不再是「大节点 /
 * 工具步 / 系统行」这套只讲形状的词。形状是这一颗组件按类算出来的结果，不是
 * 调用方要挑的东西 —— 挑形状的下场是同一类卡在两处画成两个样子。
 *
 * ⚠ 「问题」这一类**不会走到这里**（§3.4）：它钉在输入框上方，不进时间线。
 * 留着这一档是因为答复之后那一行系统行、以及只读历史里那一条，都要说得出
 * 「这是一道问过的题」。
 *
 * ⭐ **层级靠形状与缩进，不靠颜色和底色块**：会说话的两方（用户 / 助手）挂 32px
 * 头像，其余按「大节点 8px 实心 / 工具步 6px 空心 / 系统行 8×2 短横」分级。
 * 五种形态共用**同一条沟**（`STUDIO_OPERATOR_TIMELINE.gutterPx`），节点与贯穿
 * 竖线同轴 —— 沟宽一格不动是这条线读得下去的前提。
 *
 * ⚠ 这一颗**不画贯穿竖线** —— 线是流容器的一条 `absolute` span（跨行、跨行间距），
 * 逐行各画一截会在 `mt-4` 的间距里断掉。
 */

import type { ComponentProps, ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_TIMELINE } from '@/constants/studio-assistant-operator'
import { TimelineAvatar } from '@/components/business/studio/assistant-operator/TimelineAvatar'
import type { AssistantPersona } from '@/types/assistant-persona'
import { useMyProfile } from '@/hooks/use-my-profile'
import { cn } from '@/lib/utils'

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

/** 头像档 = 会说话的那两方。 */
function isAvatarNode(node: StudioOperatorNodeShape): boolean {
  return node === NODE_SHAPES.user || node === NODE_SHAPES.assistant
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
  children: ReactNode
}

function TimelineSpeakerName({
  node,
  assistantName,
}: {
  node: StudioOperatorNodeShape
  assistantName: string
}) {
  const { profile } = useMyProfile()
  const t = useTranslations('StudioOperator.timeline')
  const name =
    node === NODE_SHAPES.assistant
      ? assistantName
      : profile?.displayName?.trim() ||
        profile?.username?.trim() ||
        t('rowUser')

  return (
    <div className="flex min-h-8 min-w-0 items-center">
      <span
        data-testid="operator-speaker-name"
        className="min-w-0 break-words text-sm font-semibold text-foreground"
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
  children,
}: StudioOperatorTimelineRowProps) {
  const t = useTranslations('StudioOperator.timeline')
  const node = nodeShapeOf(card, speaker)
  const avatar = isAvatarNode(node)
  const assistantName = persona?.name?.trim() || t('assistantFallback')
  /**
   * ⚠ `role="article"` 是为了让 `aria-label` 真的被念出来：裸 `div` 上的
   * `aria-label` 大多数读屏直接忽略（无角色元素不参与名称计算）。
   * ⚠ 助手行念的是**用户给助手起的名字**（§8.2），没起名就念默认 ID。
   */
  const rowLabel = t(NODE_LABEL_KEYS[node], {
    name: assistantName,
  })

  return (
    <div
      data-testid="operator-timeline-row"
      data-card={card}
      data-node={node}
      role="article"
      aria-label={rowLabel}
      style={{
        // ⚠ 走 style 不是 `grid-cols-[24px_1fr]`：Hard Rule 5 禁 arbitrary value，
        //   而 24 这个数是面板私有的，不配进 `globals.css` 的 `@theme inline`。
        gridTemplateColumns: `${STUDIO_OPERATOR_TIMELINE.gutterPx}px minmax(0, 1fr)`,
      }}
      className={cn(
        'group grid gap-x-2 first:mt-0',
        avatar && 'min-h-8',
        avatar || node === NODE_SHAPES.big ? 'mt-4' : 'mt-2',
      )}
    >
      <div className="flex items-start gap-1.5 pt-0.5">
        {/* 节点盒宽 8px：流的左内距 14px + 半宽 4px = 18px，正好压住贯穿竖线。 */}
        <span className="relative grid h-4 w-2 shrink-0 place-items-center">
          {avatar ? (
            <TimelineAvatar
              speaker={node === NODE_SHAPES.user ? 'user' : 'assistant'}
              {...(persona ? { persona } : {})}
              // 头像比节点盒宽，靠绝对定位回到同一条轴上。
              className="absolute left-1/2 top-0 -translate-x-1/2"
            />
          ) : null}
          {node === NODE_SHAPES.big ? (
            <span
              data-testid="operator-timeline-node"
              className="size-2 rounded-full bg-primary ring-2 ring-card"
              aria-hidden
            />
          ) : null}
          {node === NODE_SHAPES.tool ? (
            <span
              data-testid="operator-timeline-node"
              // ⚠ 描边用 `muted-foreground` 而不是 §11.3 写的 `border`：
              //   `--border`(#e5e5e5) 对卡背只有 1.26:1，作为**信息性图形**过不了 3:1
              //   （`ui-defaults.md §2.4`）—— 那样的空心圆在白卡上等于没画。
              //   现值 #696969 对卡背 5.49，层级仍然靠「实心 vs 空心」分，不靠颜色。
              className="size-1.5 rounded-full border border-muted-foreground bg-card ring-2 ring-card"
              aria-hidden
            />
          ) : null}
          {node === NODE_SHAPES.system ? (
            <span
              data-testid="operator-timeline-node"
              className="h-0.5 w-2 bg-muted-foreground ring-2 ring-card"
              aria-hidden
            />
          ) : null}
        </span>
      </div>

      {avatar ? (
        <TimelineSpeakerName node={node} assistantName={assistantName} />
      ) : null}
      <div
        data-testid="operator-timeline-content"
        className={cn(
          'flex min-w-0 items-start gap-2',
          avatar && 'col-start-2 mt-1.5',
        )}
      >
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
