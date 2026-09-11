'use client'

/**
 * **收起态**（v2 §4.3 / 画板 BCollapsed）—— 面板收起后右上角那张**微状态卡**。
 *
 * ── 它替掉了什么 ────────────────────────────────────────────────
 * `StudioOperatorIconRail`（48px 图标轨）**整文件删**。§4.3 原文：「收起后不是
 * 一条 48px 竖轨，而是一张微状态卡」。轨上那三样各自的去处：
 *  · 域图标 → 没了（收起时用户站在哪台工作台是他自己看得见的事）；
 *  · 状态点 → 留着，缩成头像旁那一颗（`RAIL_TONE_CLASS` 整张表搬到这里，
 *    手机浮标仍读同一份，⛔ 全仓只有这一份四档配色）；
 *  · `N/M` 进度环 → 没了，进度由**状态词**说（决策 14 / §3.6：「正在查 3 个
 *    来源…」本身就是进度）。
 *
 * ── 卡上有什么（§4.3 那张表）────────────────────────────────────
 * 头像 + 名字 · 微状态（忙时那句状态词，空闲**不画**）· 待办角标（未答问题 +
 * 未处理确认之和，0 时不画）。
 * ⚠ §4.3 表里还有「参数摘要（模型 / 尺寸 / 张数）」与底部「等待生成」两行 ——
 *   照画板 BCollapsed 逐格核过，**那两样是工作台自己的东西**（左栏那张「参数」
 *   卡与结果网格里最后那一格），不在这张卡上。这里不画它们不是漏，是对稿的结果。
 *
 * ⚠ 整张卡可点 = 展开（与旧图标轨同一条交互）：⛔ 不在卡里再塞第二颗按钮，
 *   收起态的唯一动作就是「打开它」。
 */

import { useTranslations } from 'next-intl'

import {
  STUDIO_OPERATOR_RAIL_TONES,
  STUDIO_OPERATOR_SHELL,
  type StudioOperatorRailTone,
} from '@/constants/studio-assistant-operator'
import { AssistantTimelineAvatar } from '@/components/business/studio/assistant-operator/TimelineAvatar'
import { cn } from '@/lib/utils'
import type { AssistantPersona } from '@/types/assistant-persona'
import type { StudioOperatorStatus } from '@/types/studio-assistant-operator'

/**
 * 状态点的四档配色 —— **只用脊柱的状态四 token + `--primary`**（§11.2）。
 * ⛔ 不为助手面板新造强调色变量。
 * ⚠ 手机浮标（`StudioOperatorMobileFab`）读的是这一份 —— ⛔ 别在那边抄第二张。
 */
export const RAIL_TONE_CLASS: Record<StudioOperatorRailTone, string> = {
  [STUDIO_OPERATOR_RAIL_TONES.idle]: 'bg-muted-foreground',
  [STUDIO_OPERATOR_RAIL_TONES.working]:
    'bg-primary animate-pulse motion-reduce:animate-none',
  /**
   * 「待你定」（`awaitingPlan`）。
   * ⚠ 用 `--primary` 的脉冲而不是 warning：等一张计划卡不是警告 —— 什么都还没
   * 发生，也没有任何东西会花钱。warning 那一档留给真的要拍板的那几张（§11.2）。
   */
  [STUDIO_OPERATOR_RAIL_TONES.planning]:
    'bg-primary animate-pulse motion-reduce:animate-none',
  [STUDIO_OPERATOR_RAIL_TONES.awaiting]: 'bg-status-warning',
  [STUDIO_OPERATOR_RAIL_TONES.error]: 'bg-destructive',
}

/**
 * 运行态 → 状态点档位。
 *
 * ⚠ `primed` **不占一档**：它说的是「生成键亮着」而不是「助手正在做什么」，
 * 两件事挤进同一颗点会让「已备好」和「空闲」长一样。
 */
export function studioOperatorRailTone(
  status: StudioOperatorStatus,
): StudioOperatorRailTone {
  if (status === 'working') return STUDIO_OPERATOR_RAIL_TONES.working
  if (status === 'awaitingPlan') return STUDIO_OPERATOR_RAIL_TONES.planning
  if (status === 'awaitingConfirm') return STUDIO_OPERATOR_RAIL_TONES.awaiting
  if (status === 'error') return STUDIO_OPERATOR_RAIL_TONES.error
  return STUDIO_OPERATOR_RAIL_TONES.idle
}

interface StudioOperatorCollapsedCardProps {
  status: StudioOperatorStatus
  primed: boolean
  /**
   * 那一行**微状态**（§3.6 的状态词）—— 空闲时是 `null`，那一行整行不画。
   * ⚠ 由外壳给（`useStudioOperatorStatusWord`），⛔ 这里不自己算：展开态那一句
   *   与它必须是同一句话。
   */
  statusText: string | null
  /** 待办角标：未答问题 + 未处理确认之和。`0` 不画角标，⛔ 不画一颗写着 0 的圈。 */
  todoCount: number
  persona?: AssistantPersona
  onExpand(): void
}

export function StudioOperatorCollapsedCard({
  status,
  primed,
  statusText,
  todoCount,
  persona,
  onExpand,
}: StudioOperatorCollapsedCardProps) {
  const t = useTranslations('StudioOperator')
  const tone = studioOperatorRailTone(status)
  const name = persona?.name?.trim() || t('timeline.assistantFallback')
  /** 空闲且已备好时那一行说「已备好」—— 它不是状态词，但它是此刻唯一值得说的事。 */
  const line = statusText ?? (primed ? t('rail.primed') : null)

  return (
    <button
      type="button"
      data-testid="operator-collapsed"
      data-tone={tone}
      data-primed={primed ? 'true' : 'false'}
      aria-label={t('expand')}
      title={line ?? name}
      onClick={onExpand}
      style={{ height: `${STUDIO_OPERATOR_SHELL.collapsedHeightPx}px` }}
      /* 画板 BCollapsed：它**浮在工作台上**，所以走三层玻璃③ 浮层那一档
         （§12.1）——半透 + 模糊 + 强投影，深一档描边。 */
      className="relative flex items-center gap-2 rounded-full border border-assistant-line-strong pl-1.5 pr-3.5 text-left assistant-glass-overlay shadow-assistant-overlay transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      <AssistantTimelineAvatar
        {...(persona ? { persona } : {})}
        className="size-7 ring-0"
      />

      <span className="flex min-w-0 flex-col">
        <span className="truncate text-2sm font-medium leading-tight text-foreground">
          {name}
        </span>
        {/* ⚠ 空闲时**整行不画**而不是画一句「待命」：收起态是给正在盯着画面的人
            看的，没事发生时它应该安静（§4.3）。 */}
        {line ? (
          <span
            data-testid="operator-collapsed-status"
            className="truncate text-2xs leading-tight text-muted-foreground"
          >
            {line}
          </span>
        ) : null}
      </span>

      <span
        data-testid="operator-collapsed-dot"
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full',
          RAIL_TONE_CLASS[tone],
          status === 'idle' && !primed && 'hidden',
        )}
      />

      {todoCount > 0 ? (
        <span
          data-testid="operator-collapsed-todo"
          aria-label={t('collapsedTodo', { count: todoCount })}
          className="absolute -right-1 -top-1 grid size-4.5 place-items-center rounded-full bg-foreground font-mono text-2xs tabular-nums text-background ring-2 ring-background"
        >
          {todoCount}
        </span>
      ) : null}
    </button>
  )
}
