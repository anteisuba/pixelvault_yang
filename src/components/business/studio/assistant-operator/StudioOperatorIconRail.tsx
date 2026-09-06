'use client'

/**
 * 收起态的 **48px 图标轨**（拍板 7 改口：胶囊 → 图标轨）。
 *
 * ⭐ 收放法则**一字未改**：点工作台收、点提示词框/面板不收、点这条轨展开、
 * 没有定时器（实现仍在 `StudioOperatorDock.tsx`）。变的只有形态 —— 胶囊横向占位
 * 不可预期，而这条轨宽度恒定 48，收起前后主区永远不重排（§2.3）。
 *
 * ⭐ 胶囊那四档状态文案（`STUDIO_OPERATOR_PILL_TONES`）**整体迁到状态点 + 一行
 * 竖排读数**上，⛔ 不留 fallback：面板让位之后这一列是助手唯一还看得见的东西，
 * 一颗光秃秃的图标等于什么都没说。
 *
 * ⚠ 整条轨**就是那颗展开按钮**（44px 以上的命中区，`ui-defaults.md §5`），
 * ⛔ 不在轨里再画一颗小箭头按钮：那会让「点轨展开」这条最常用的手势变成
 * 「点对地方才展开」。
 */

import { Blocks, Image as ImageIcon, PanelRightOpen, Video } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { LucideIcon } from 'lucide-react'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import type { AssistantOperatorDomain } from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_RAIL_TONES,
  STUDIO_OPERATOR_SHELL,
  type StudioOperatorRailTone,
} from '@/constants/studio-assistant-operator'
import { cn } from '@/lib/utils'
import type { StudioOperatorStatus } from '@/types/studio-assistant-operator'

/**
 * ⚠ `Record<域, …>`：域表加一档而图标没跟上，编译期就红 —— 漏掉的表现是收起态
 * 上一个空洞。
 */
const RAIL_DOMAIN_ICONS: Record<AssistantOperatorDomain, LucideIcon> = {
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.image]: ImageIcon,
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.video]: Video,
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.lora]: Blocks,
}

/**
 * 状态点的四档配色 —— **只用脊柱的状态四 token + `--primary`**（§11.2）。
 * ⛔ 不为助手面板新造强调色变量。
 */
export const RAIL_TONE_CLASS: Record<StudioOperatorRailTone, string> = {
  [STUDIO_OPERATOR_RAIL_TONES.idle]: 'bg-muted-foreground',
  [STUDIO_OPERATOR_RAIL_TONES.working]:
    'bg-primary animate-pulse motion-reduce:animate-none',
  /**
   * 「待你定」（`awaitingPlan`，§4.1 图标轨那一行写着「状态点闪烁」）。
   * ⚠ 用 `--primary` 的脉冲而不是 warning：等一张计划卡不是警告 —— 什么都还没
   * 发生，也没有任何东西会花钱。warning 那一档留给真的要拍板的三张（§11.2）。
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
 * 两件事挤进同一颗点会让「已备好」和「空闲」长一样。primed 走的是轨外那圈
 * `ring-primary`（与胶囊时代同一条视觉线索）。
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

/** 进度环的半径与周长 —— 周长要给 `stroke-dasharray`，⛔ 别在 JSX 里现算魔法数。 */
const RING_RADIUS = 10
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface StudioOperatorIconRailProps {
  domain: AssistantOperatorDomain
  status: StudioOperatorStatus
  primed: boolean
  stepsDone: number
  plannedSteps: number
  onExpand(): void
}

export function StudioOperatorIconRail({
  domain,
  status,
  primed,
  stepsDone,
  plannedSteps,
  onExpand,
}: StudioOperatorIconRailProps) {
  const t = useTranslations('StudioOperator')
  const DomainIcon = RAIL_DOMAIN_ICONS[domain]
  const tone = studioOperatorRailTone(status)
  const hasProgress = plannedSteps > 0 && status === 'working'
  const ratio = hasProgress ? Math.min(stepsDone / plannedSteps, 1) : 0

  /**
   * 竖排那一行读数 —— 收起后仍要能说「3/6」「已备好」。
   * ⚠ 走词表不是拼字符串：三语各自写自己的话（`rail.*`）。
   */
  const readout = hasProgress
    ? `${stepsDone}/${plannedSteps}`
    : primed && status === 'idle'
      ? t('rail.primed')
      : t(`rail.${tone}`)

  return (
    <button
      type="button"
      data-testid="operator-rail"
      data-tone={tone}
      data-primed={primed ? 'true' : 'false'}
      aria-label={t('expand')}
      title={readout}
      onClick={onExpand}
      style={{ width: `${STUDIO_OPERATOR_SHELL.railWidthPx}px` }}
      className={cn(
        'absolute inset-y-0 left-0 z-10 flex flex-col items-center gap-2.5 py-2.5 text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        primed && 'text-foreground',
      )}
    >
      <span className="grid size-7 place-items-center rounded-md">
        <PanelRightOpen className="size-3.5" aria-hidden />
      </span>
      <span
        data-testid="operator-rail-domain"
        className="grid size-7 place-items-center rounded-md"
      >
        <DomainIcon className="size-3.5" aria-hidden />
      </span>
      <span
        data-testid="operator-rail-dot"
        className={cn('size-2 rounded-full', RAIL_TONE_CLASS[tone])}
        aria-hidden
      />
      {hasProgress ? (
        <svg
          data-testid="operator-rail-ring"
          viewBox="0 0 26 26"
          className="size-6.5"
          aria-hidden
        >
          <circle
            cx="13"
            cy="13"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="2.5"
            className="stroke-border"
          />
          <circle
            cx="13"
            cy="13"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            transform="rotate(-90 13 13)"
            style={{
              strokeDasharray: RING_CIRCUMFERENCE,
              strokeDashoffset: RING_CIRCUMFERENCE * (1 - ratio),
            }}
            className="stroke-primary transition-[stroke-dashoffset] duration-(--duration-slow) ease-standard motion-reduce:transition-none"
          />
        </svg>
      ) : null}
      {/* 竖排：48px 宽里横着写「3/6 · 待你定」是写不下的。 */}
      <span
        data-testid="operator-rail-readout"
        style={{ writingMode: 'vertical-rl' }}
        className="font-mono text-xs tracking-nav tabular-nums"
      >
        {readout}
      </span>
    </button>
  )
}
