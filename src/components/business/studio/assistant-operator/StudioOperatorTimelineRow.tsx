'use client'

/**
 * 时间线沟里的一行（方向 C · `pages/assistant-shell.md` §11.3）。
 *
 * ⭐ **层级靠形状与缩进，不靠颜色和底色块**：会说话的两方（用户 / 助手）挂 20px
 * 头像，其余按「大节点 8px 实心 / 工具步 6px 空心 / 系统行 8×2 短横」分级。
 * 五种形态共用**同一条沟**（`STUDIO_OPERATOR_TIMELINE.gutterPx`），节点与贯穿
 * 竖线同轴 —— 沟宽一格不动是这条线读得下去的前提。
 *
 * ⚠ 时间戳分两档（§11.3）：形状节点行常显在沟里；头像行退到**行尾 hover**，
 * 因为一天里那一列全是同一分钟，占了最贵的 78px 却零信息。
 * ⚠ 这一颗**不画贯穿竖线** —— 线是流容器的一条 `absolute` span（跨行、跨行间距），
 * 逐行各画一截会在 `mt-4` 的间距里断掉。
 */

import { useState, type ReactNode } from 'react'

import { STUDIO_OPERATOR_TIMELINE } from '@/constants/studio-assistant-operator'
import { TimelineAvatar } from '@/components/business/studio/assistant-operator/TimelineAvatar'
import type { AssistantPersona } from '@/types/assistant-persona'
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

interface StudioOperatorTimelineRowProps {
  node: StudioOperatorNodeKind
  /**
   * 画不画时刻。
   *
   * ⚠ 时刻是**这一行落位的那一刻**（首次挂载时抓一次），⛔ 不是 render 时现取：
   * 现取的话每次重渲染整列时间戳都会跳。
   * ⚠ 载回来的只读历史传 `false`：库里那份没有逐条时刻，拿「现在」去填是在编一个
   * 假时间戳（`ui-defaults.md`：状态不靠猜）。
   */
  withTimestamp?: boolean
  /** 形状节点行沟里那一小截常显文字（耗时 / 序号），⛔ 不给头像行用。 */
  gutterNote?: ReactNode
  /**
   * 助手那一档的头像来源（§8.2）—— 外壳拉一次往下传，见 `TimelineAvatar` 头注。
   * ⚠ 缺席时画默认预设，⛔ 不出空圈。
   */
  persona?: AssistantPersona
  children: ReactNode
}

export function StudioOperatorTimelineRow({
  node,
  withTimestamp = true,
  gutterNote,
  persona,
  children,
}: StudioOperatorTimelineRowProps) {
  const avatar = isAvatarNode(node)
  const [landedAt] = useState(() => new Date())
  const timestamp = withTimestamp ? landedAt : null
  const time = timestamp
    ? `${String(timestamp.getHours()).padStart(2, '0')}:${String(
        timestamp.getMinutes(),
      ).padStart(2, '0')}`
    : null

  return (
    <div
      data-testid="operator-timeline-row"
      data-node={node}
      style={{
        // ⚠ 走 style 不是 `grid-cols-[78px_1fr]`：Hard Rule 5 禁 arbitrary value，
        //   而 78 这个数是面板私有的，不配进 `globals.css` 的 `@theme inline`。
        gridTemplateColumns: `${STUDIO_OPERATOR_TIMELINE.gutterPx}px minmax(0, 1fr)`,
      }}
      className={cn(
        'group grid gap-x-2 first:mt-0',
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
        {avatar ? null : (
          <span className="min-w-0 truncate font-mono text-3xs leading-4 tracking-nav tabular-nums text-muted-foreground">
            {gutterNote ?? time}
          </span>
        )}
      </div>

      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {avatar && time ? (
          <time
            data-testid="operator-timeline-time"
            dateTime={timestamp?.toISOString()}
            title={timestamp?.toLocaleString()}
            // ⚠ 不用 §11.3 写的 `text-muted-foreground/75`：合成后是 #8f8f8f，
            //   对卡背只有 3.23:1，11px 正文要 4.5（`ui-defaults.md §2.4`）。
            //   足色 #696969 = 5.49，「不抢视线」交给默认 `opacity-0` 去做。
            className="shrink-0 pt-px font-mono text-2xs tracking-nav tabular-nums text-muted-foreground opacity-0 transition-opacity duration-(--duration-fast) ease-standard group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
          >
            {time}
          </time>
        ) : null}
      </div>
    </div>
  )
}
