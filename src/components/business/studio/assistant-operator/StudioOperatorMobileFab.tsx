'use client'

/**
 * 手机上的助手入口 —— 右下角一颗浮标。
 *
 * ⭐ **只在「收起」那一档出现**（v2 §4.6）：Sheet 一开（半屏或全屏）浮标就由
 * `StudioOperatorDock` 整颗不渲染。半屏之后上半截工作台是露着的 —— 浮标再挂在
 * 那儿会变成「开着的助手旁边还浮着一颗打开助手」，而且正好压在露出来的结果图上。
 *
 * ⭐ 它是**桌面收起态那张微状态卡在手机上的对应物**（`StudioOperatorCollapsedCard`）：
 * 面板让位之后，助手唯一还看得见的东西。所以它必须说得出「在干什么、做到第几
 * 步」，⛔ 不能只是一颗图标 —— 那等于什么都没说（图标轨那条注释同源）。
 *
 * ⚠ 状态点的四档配色**直接复用微状态卡那张表**（`RAIL_TONE_CLASS`），⛔ 不在这里
 * 重抄一份：抄一份的下场是某天 `awaiting` 在桌面改成了另一个 token，而手机上
 * 还是旧色 —— 同一个状态两种颜色比没有颜色更糟。
 *
 * ⚠ 命中区 44（`ui-defaults.md §5` 触屏档），⛔ 不做 32/36 的「紧凑版」。
 * ⚠ 底部留白要同时清过 safe-area、软键盘、以及图片 / 视频档钉在底部的
 *   `StudioMobileComposer`（见 `STUDIO_OPERATOR_MOBILE_SHELL.fabBottomPx`）。
 */

import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
  STUDIO_OPERATOR_MOBILE_SHELL,
} from '@/constants/studio-assistant-operator'
import {
  RAIL_TONE_CLASS,
  studioOperatorRailTone,
} from '@/components/business/studio/assistant-operator/StudioOperatorCollapsedCard'
import { cn } from '@/lib/utils'
import type { StudioOperatorStatus } from '@/types/studio-assistant-operator'

interface StudioOperatorMobileFabProps {
  status: StudioOperatorStatus
  /**
   * 收起档的**微状态**（§3.6 那句状态词）—— 空闲时 `null`，那颗药丸整颗不画。
   *
   * ⚠ 与桌面收起态那张微状态卡读的是**同一个 hook**（`useStudioOperatorStatusWord`，
   * 由 `StudioOperatorDock` 供值），⛔ 不在这里自己算：同一时刻两处说的必须是
   * 同一句话，而手机这一处只有收起时才有人看得见，算错了没人发现。
   */
  statusText?: string | null
  primed: boolean
  stepsDone: number
  plannedSteps: number
  onOpen(): void
}

export function StudioOperatorMobileFab({
  status,
  statusText = null,
  primed,
  stepsDone,
  plannedSteps,
  onOpen,
}: StudioOperatorMobileFabProps) {
  const t = useTranslations('StudioOperator')
  const tone = studioOperatorRailTone(status)
  const hasProgress = plannedSteps > 0 && status === 'working'
  /**
   * 读数与图标轨逐字同源：干活中报「3/6」，否则报那一档的名字（`rail.*`）。
   * ⚠ `primed` 不占状态点的档（它说的是生成键亮着），但它要能被读出来 ——
   * 「已备好」是用户此刻最想知道的那句。
   */
  const readout = hasProgress
    ? `${stepsDone}/${plannedSteps}`
    : primed && status === 'idle'
      ? t('rail.primed')
      : t(`rail.${tone}`)

  return (
    <button
      type="button"
      data-testid="operator-mobile-fab"
      data-tone={tone}
      data-primed={primed ? 'true' : 'false'}
      {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
      aria-label={`${t('mobile.open')} — ${statusText ?? readout}`}
      onClick={onOpen}
      style={{
        width: `${STUDIO_OPERATOR_MOBILE_SHELL.fabHitPx}px`,
        height: `${STUDIO_OPERATOR_MOBILE_SHELL.fabHitPx}px`,
        right: `calc(${STUDIO_OPERATOR_MOBILE_SHELL.fabInsetPx}px + env(safe-area-inset-right, 0px))`,
        bottom: `calc(${STUDIO_OPERATOR_MOBILE_SHELL.fabBottomPx}px + var(--keyboard-safe-area-bottom, 0px) + var(--keyboard-inset, 0px))`,
      }}
      /* ⚠ `z-30` 低于 composer 的 `z-40`：净空万一不够，让位的是浮标不是生成键。 */
      className={cn(
        'fixed z-30 grid place-items-center rounded-full border border-border bg-card text-foreground shadow-lg lg:hidden',
        'transition-colors duration-(--duration-fast) ease-standard',
        // 「已备好」= 生成键亮着 —— 与图标轨同一条视觉线索（外面一圈 primary）。
        primed && 'ring-2 ring-primary',
      )}
    >
      <Sparkles className="size-5" aria-hidden />
      {/* 微状态药丸压在浮标左边 —— 44px 的圆里放不下一句话，而「正在查 3 个
          来源…」是收起档唯一还看得见的进度（决策 14 删掉进度带之后就剩它）。
          ⚠ `aria-hidden`：同一句已经在按钮的 `aria-label` 里，读两遍更糟。 */}
      {statusText ? (
        <span
          data-testid="operator-mobile-fab-status"
          className="pointer-events-none absolute right-full top-1/2 mr-2 max-w-40 -translate-y-1/2 truncate rounded-full border border-border bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm"
          aria-hidden
        >
          {statusText}
        </span>
      ) : null}
      {/* 状态点压在右上角 —— 44px 里放不下「一颗图标 + 一行字」，而这颗点是
          四档语义唯一的视觉落点（aria-label 里那句读数补齐了文字面）。 */}
      <span
        data-testid="operator-mobile-fab-dot"
        className={cn(
          'absolute right-1 top-1 size-2 rounded-full',
          RAIL_TONE_CLASS[tone],
        )}
        aria-hidden
      />
      {hasProgress ? (
        <span
          data-testid="operator-mobile-fab-count"
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-1.5 font-mono text-xs tabular-nums text-background"
          aria-hidden
        >
          {`${stepsDone}/${plannedSteps}`}
        </span>
      ) : null}
    </button>
  )
}
