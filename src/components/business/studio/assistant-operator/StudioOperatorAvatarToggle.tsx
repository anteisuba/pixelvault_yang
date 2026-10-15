'use client'

/**
 * **头像开关**（D7b ④ · `DesignD7bToggle`，owner 2026-09-20）—— 四处宿主收起态
 * 统一的那一颗人设头像，同时也是面板唯一的开合入口。
 *
 * ── 它替掉了什么 ────────────────────────────────────────────────
 * `StudioOperatorCollapsedButton`（右下角 44px 近黑圆按钮 + 角标，D7 ④ · Q2 = C）
 * **整文件删**。owner 09-20 改口两条：位置右下 → **右上**，形状按钮 → **人设头像**。
 * 画布顶栏那颗「助手」胶囊（`ShellTopBar` 的 `shell-assistant-toggle`）同时退场 ——
 * 同一位置换成这颗头像，排在「剪辑台」右侧。
 *
 * ── ⭐ 一个持久元素、两个锚点 ────────────────────────────────────
 * 这颗头像**不随面板开合卸载**：收起时它停在顶栏位（36px），打开时它滑进面板头部
 * 左上槽（22px）。两个锚点的坐标由宿主给的 `anchor` 算得出来（见
 * `STUDIO_OPERATOR_DEFAULT_ANCHOR` 的头注），所以位移与缩放是**纯算术**，
 * ⛔ 不量 DOM：量 DOM 的那一版会在面板还没布局完的第一帧算出一个错位的 transform。
 *
 * ── 铁律（画板 ② · 2026-09-26 形状改 B 后）──────────────────────────
 *  · **只动 `transform`** —— ⛔ 不动 width / height / top / left；
 *  · 位移不自己计时：跟着外壳给的 `dockProgress`（形状左边沿走了多少），所以头像
 *    骑在「先横成一条」那条头部条的左端被带进槽里；
 *  · `will-change: transform` 只在开合那一段加，结束撤掉（`data-phase` 驱动）；
 *  · 阴影不做过渡；
 *  · `prefers-reduced-motion` 直切（外壳给的进度只有 0 / 1 两档）。
 *
 * ── 角标数的是什么（D7 沿用）─────────────────────────────────────
 * **待确认（未答问题 + 未处理确认）+ 未读结果**，由外壳算。0 = 整颗角标不画，
 * ⛔ 不画一个写着 0 的圈。⚠ 角标 = **等你的事**，⛔ 不是红点（画板原话）。
 * ⚠ 只在收起档画：展开时头像已经坐在头部，旁边就是那件事本身。
 *
 * ── 运行环 + 状态点（2026-10-14 设计方案 §9.1，取代此前「⛔ 状态点」那条）────
 * 收着面板时唯一能告诉你「它还在干活 / 干完了 / 出错了」的地方。运行环只动
 * opacity、状态点呼吸，⛔ 不转圈；减少动效时都是静止的。
 */

import {
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

import styles from './StudioOperatorDock.module.css'
import { AssistantAvatarGlyph } from '@/components/business/studio/assistant-operator/AssistantAvatarGlyph'
import {
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
  STUDIO_OPERATOR_SHELL,
  type StudioOperatorShellAnchor,
} from '@/constants/studio-assistant-operator'
import { cn } from '@/lib/utils'
import type { AssistantPersona } from '@/types/assistant-persona'

export type StudioOperatorShellPhase = 'closed' | 'opening' | 'open' | 'closing'

/**
 * 收起态那一颗状态（2026-10-14 设计方案 §9.1）：在跑 / 收着时跑完了 / 收着时出错了。
 * ⚠ 由外壳算（它知道「跑完那一刻面板收没收着」），⛔ 这里不自己读 store。
 */
export type StudioOperatorCollapsedActivity = 'running' | 'done' | 'failed'

interface StudioOperatorAvatarToggleProps {
  /** 角标数：待确认 + 未读结果。`0` 不画角标。⚠ 由外壳算，⛔ 这里不自己数。 */
  badgeCount: number
  /**
   * 收起态的运行指示（§9.1）：`running` = 外面一圈呼吸的运行环 + 右下一颗呼吸点；
   * `done` / `failed` = 右下一颗静止的点（出错走风险色）。`null` = 什么都不画。
   * ⚠ 只在收起档画，理由与角标同一条。
   */
  activity?: StudioOperatorCollapsedActivity | null
  persona?: AssistantPersona
  anchor: StudioOperatorShellAnchor
  /** 面板此刻多宽 —— 落位的 x 要减掉它（面板贴右缘，头部左上槽在它的左边）。 */
  panelWidthPx: number
  phase: StudioOperatorShellPhase
  /**
   * 落进头部槽的进度（0 = 收起位，1 = 头部槽）—— 桌面由外壳按形状左边沿走了多少
   * 算出来（B 形状，owner 2026-09-26），所以头像骑在形状左上角被带进去，⛔ 不另起
   * 一条动画。缺省（手机档）= 恒在收起位。
   */
  dockProgress?: MotionValue<number>
  /**
   * 点一下 = 反转开合（画板：收起态点开、头部那颗点收）。
   * ⚠ 同一颗按钮两件事，所以 `aria-pressed` 必须跟着开合走 —— ⛔ 不是两颗按钮。
   */
  onToggle(): void
}

/**
 * 头像落进头部槽时的**位移**（px，相对收起位）。
 *
 * 收起位左缘 = `V - avatarRight - size`；头部槽左缘 = `V - panelRight - width + padX`。
 * 两式相减，视口宽 `V` 正好抵消 —— 所以这颗头像**与视口宽无关**，窗口拖宽拖窄时
 * 它不需要重算（⛔ 也就不需要一条 resize 监听）。
 */
export function operatorAvatarShift(
  anchor: StudioOperatorShellAnchor,
  panelWidthPx: number,
): { x: number; y: number } {
  const { avatarSizePx, avatarHeaderSizePx, headerPadXPx, headerHeightPx } =
    STUDIO_OPERATOR_SHELL
  return {
    x:
      anchor.avatarRightPx -
      anchor.panelRightPx -
      panelWidthPx +
      headerPadXPx +
      avatarSizePx,
    y:
      anchor.panelTopPx +
      (headerHeightPx - avatarHeaderSizePx) / 2 -
      anchor.avatarTopPx,
  }
}

export function StudioOperatorAvatarToggle({
  badgeCount,
  activity = null,
  persona,
  anchor,
  panelWidthPx,
  phase,
  dockProgress,
  onToggle,
}: StudioOperatorAvatarToggleProps) {
  const t = useTranslations('StudioOperator')
  const name = persona?.name?.trim() || t('timeline.assistantFallback')
  const avatarUrl = persona?.avatarUrl ?? null
  /** 「已经在面板头部了」的两档 —— 收回那一段（`closing`）要走回收起位。 */
  const docked = phase === 'opening' || phase === 'open'
  const shift = operatorAvatarShift(anchor, panelWidthPx)
  const scale =
    STUDIO_OPERATOR_SHELL.avatarHeaderSizePx /
    STUDIO_OPERATOR_SHELL.avatarSizePx
  const restProgress = useMotionValue(0)
  const progress = dockProgress ?? restProgress
  const x = useTransform(progress, (p) => shift.x * p)
  const y = useTransform(progress, (p) => shift.y * p)
  const avatarScale = useTransform(progress, (p) => 1 - (1 - scale) * p)
  const shownActivity = docked ? null : activity
  /**
   * ⚠ 「跑完了」那颗点**让给角标**：有等你的事时角标已经在叫你了，再挂一颗完成点是
   *   同一件事说两遍。出错点不让 —— 它说的是另一件事。
   */
  const statusDot =
    shownActivity === 'done' && badgeCount > 0 ? null : shownActivity
  const baseLabel = docked
    ? t('collapse')
    : badgeCount > 0
      ? `${t('expand')} — ${t('collapsedTodo', { count: badgeCount })}`
      : t('expand')

  return (
    <motion.button
      type="button"
      data-testid="operator-avatar-toggle"
      data-phase={phase}
      data-badge={badgeCount > 0 ? String(badgeCount) : ''}
      data-activity={shownActivity ?? ''}
      {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
      aria-pressed={docked}
      aria-label={
        shownActivity
          ? `${baseLabel} — ${t(`collapsedActivity.${shownActivity}`)}`
          : baseLabel
      }
      /* 展开时悬停说出怎么收（owner 2026-09-26：收起只走头像，得让人知道）。 */
      title={docked ? t('collapseHint') : name}
      onClick={onToggle}
      style={{
        width: `${STUDIO_OPERATOR_SHELL.avatarSizePx}px`,
        height: `${STUDIO_OPERATOR_SHELL.avatarSizePx}px`,
        top: `${anchor.avatarTopPx}px`,
        right: `calc(${anchor.avatarRightPx}px + env(safe-area-inset-right, 0px))`,
        /* ⚠ `transform-origin: top left` 是上面那组算术的前提：位移算的是**左上角**
           对左上角。换成 center 会让 22/36 的缩放把头像往左上拽半格。 */
        originX: 0,
        originY: 0,
        x,
        y,
        scale: avatarScale,
      }}
      className={cn(
        /* ⚠ `pointer-events-auto`：画布那条全屏 rail 是 `pointer-events-none`
           （见 Dock 里那段头注），不自己声明就按不动 —— 而按不动的表现是
           「收起之后再也打不开」。
           ⚠ `z-50` 高于面板那层 `z-40`：展开态它要坐在头部**上面**。
           ⚠ 布局 A 用画布节点打磨 ② 的浮层影；其余宿主沿用白底细边。 */
        'pointer-events-auto fixed z-50 grid place-items-center overflow-visible rounded-full bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        anchor.avatarStays
          ? 'shadow-node-chrome'
          : 'border border-border shadow-assistant-overlay',
        styles.avatar,
      )}
    >
      {/* 触屏命中区补到 44（`ui-defaults.md §5`）—— ⛔ 不是把这颗圆画大：
          36 是画板定的观感尺寸，也是「与剪辑台胶囊同高」那条的依据。 */}
      <span aria-hidden className="absolute -inset-1 rounded-full" />

      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={72}
          height={72}
          unoptimized
          className="size-full rounded-full object-cover"
        />
      ) : (
        <AssistantAvatarGlyph
          presetId={persona?.avatarPreset ?? null}
          className="rounded-full"
        />
      )}

      {/* ── 运行环（§9.1）：头像外一圈，只动 opacity；减少动效时是一圈静止的实线。 */}
      {shownActivity === 'running' ? (
        <span
          data-testid="operator-avatar-running-ring"
          aria-hidden
          className="pointer-events-none absolute -inset-0.5 rounded-full border-2 border-foreground/70 animate-assistant-ring motion-reduce:animate-none"
        />
      ) : null}

      {/* ── 状态点（§9.1）：右下一颗。在跑 = 呼吸；跑完 = 静止中性色；出错 = 风险色。
          ⚠ 角标在右上，两颗不打架。 */}
      {statusDot ? (
        <span
          data-testid="operator-avatar-status-dot"
          data-status={statusDot}
          aria-hidden
          className={cn(
            'pointer-events-none absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background',
            statusDot === 'running' &&
              'bg-foreground animate-assistant-breathe motion-reduce:animate-none',
            statusDot === 'done' && 'bg-foreground',
            statusDot === 'failed' && 'bg-status-risk',
          )}
        />
      ) : null}

      {badgeCount > 0 && !docked ? (
        <span
          data-testid="operator-avatar-badge"
          aria-hidden
          className="absolute -right-1 -top-1 grid size-4.5 min-w-4.5 place-items-center rounded-full bg-foreground px-1 font-mono text-2xs tabular-nums text-background ring-2 ring-background"
        >
          {badgeCount}
        </span>
      ) : null}
    </motion.button>
  )
}
