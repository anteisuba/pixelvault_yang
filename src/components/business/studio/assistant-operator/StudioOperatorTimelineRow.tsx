'use client'

/**
 * 时间线沟里的一行（方向 C · `pages/assistant-shell.md` §11.3）。
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
 * 沟位的五档（§11.3 的表）。
 *
 * ⚠ 值同时是 `data-node` 的取值 —— 真机目检与组件测试都按它取行，⛔ 别改成
 * 组件内私有的字符串。
 */
export const STUDIO_OPERATOR_NODE_KINDS = {
  /** 用户回合：账户头像。 */
  user: 'user',
  /** 助手回合 / 计划卡 / 评价卡：AI 头像。 */
  assistant: 'assistant',
  /** 确认卡 / 候选卡 / 结果卡 / 动作卡：8px 实心圆。 */
  big: 'big',
  /** ToolGroup 折叠行 / 思考区：6px 空心圆。 */
  tool: 'tool',
  /** 系统行 / checkpoint 薄卡 / 规则薄卡：8×2 短横。 */
  system: 'system',
} as const

export type StudioOperatorNodeKind =
  (typeof STUDIO_OPERATOR_NODE_KINDS)[keyof typeof STUDIO_OPERATOR_NODE_KINDS]

/** 头像档 = 会说话的那两方。 */
function isAvatarNode(node: StudioOperatorNodeKind): boolean {
  return (
    node === STUDIO_OPERATOR_NODE_KINDS.user ||
    node === STUDIO_OPERATOR_NODE_KINDS.assistant
  )
}

/**
 * 沟位 → 行标签的词表键（`StudioOperator.timeline.*`）。
 *
 * ⭐ 由来（2026-09-06 真机）：整条时间线对读屏是哑的 —— 行与行之间只有缩进和
 * 形状的区别，而这两样读屏都读不到，20 行下来听上去是一段没有说话人的独白。
 * 时间戳又已经按 §11.3 全部删掉，于是**这一行标签是唯一的发言人信息**。
 */
const NODE_LABEL_KEYS: Record<StudioOperatorNodeKind, string> = {
  [STUDIO_OPERATOR_NODE_KINDS.user]: 'rowUser',
  [STUDIO_OPERATOR_NODE_KINDS.assistant]: 'rowAssistant',
  [STUDIO_OPERATOR_NODE_KINDS.big]: 'rowAction',
  [STUDIO_OPERATOR_NODE_KINDS.tool]: 'rowTool',
  [STUDIO_OPERATOR_NODE_KINDS.system]: 'rowSystem',
}

/**
 * 时间线的**流容器**（`role="log"` + `aria-live="polite"`）。
 *
 * ⚠ 助手的回合是**一条一条长出来的**：没有 live region，读屏用户要靠反复往回
 * 翻才知道又出了一步。`polite` 而不是 `assertive` —— 它不该打断用户正在读的话。
 * ⚠ 一颗普通 `div` 的全部属性都收着（`ref` / `className` / `data-*` / 滚动
 * 处理器），所以 `StudioOperatorPanel` 那个 `threadRef` 容器可以原地换成它。
 *
 * ⚠ **本轮还没接线**：`StudioOperatorPanel.tsx` 由另一条改动占着，接线是它那边
 * 的一行（把 `<div ref={threadRef} data-testid="operator-thread" …>` 换成
 * `<StudioOperatorTimelineList ref={threadRef} data-testid="operator-thread" …>`）。
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
  node: StudioOperatorNodeKind
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
  node: StudioOperatorNodeKind
  assistantName: string
}) {
  const { profile } = useMyProfile()
  const t = useTranslations('StudioOperator.timeline')
  const name =
    node === STUDIO_OPERATOR_NODE_KINDS.assistant
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
  node,
  persona,
  children,
}: StudioOperatorTimelineRowProps) {
  const t = useTranslations('StudioOperator.timeline')
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
        avatar || node === STUDIO_OPERATOR_NODE_KINDS.big ? 'mt-4' : 'mt-2',
      )}
    >
      <div className="flex items-start gap-1.5 pt-0.5">
        {/* 节点盒宽 8px：流的左内距 14px + 半宽 4px = 18px，正好压住贯穿竖线。 */}
        <span className="relative grid h-4 w-2 shrink-0 place-items-center">
          {avatar ? (
            <TimelineAvatar
              speaker={
                node === STUDIO_OPERATOR_NODE_KINDS.user ? 'user' : 'assistant'
              }
              {...(persona ? { persona } : {})}
              // 头像比节点盒宽，靠绝对定位回到同一条轴上。
              className="absolute left-1/2 top-0 -translate-x-1/2"
            />
          ) : null}
          {node === STUDIO_OPERATOR_NODE_KINDS.big ? (
            <span
              data-testid="operator-timeline-node"
              className="size-2 rounded-full bg-primary ring-2 ring-card"
              aria-hidden
            />
          ) : null}
          {node === STUDIO_OPERATOR_NODE_KINDS.tool ? (
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
          {node === STUDIO_OPERATOR_NODE_KINDS.system ? (
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
