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
 * ── 铁律（画板 ②「动画怎么做」那一支）────────────────────────────
 *  · **只过渡 `transform`** —— ⛔ 不动 width / height / top / left；
 *  · `will-change: transform` 只在那 240ms 内加，结束撤掉（`data-phase` 驱动）；
 *  · 阴影不做过渡；
 *  · `prefers-reduced-motion` 直切（CSS 里整块 `transition: none`）。
 *
 * ── 角标数的是什么（D7 沿用）─────────────────────────────────────
 * **待确认（未答问题 + 未处理确认）+ 未读结果**，由外壳算。0 = 整颗角标不画，
 * ⛔ 不画一个写着 0 的圈。⚠ 角标 = **等你的事**，⛔ 不是红点（画板原话）。
 * ⚠ 只在收起档画：展开时头像已经坐在头部，旁边就是那件事本身。
 */

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

interface StudioOperatorAvatarToggleProps {
  /** 角标数：待确认 + 未读结果。`0` 不画角标。⚠ 由外壳算，⛔ 这里不自己数。 */
  badgeCount: number
  persona?: AssistantPersona
  anchor: StudioOperatorShellAnchor
  /** 面板此刻多宽 —— 落位的 x 要减掉它（面板贴右缘，头部左上槽在它的左边）。 */
  panelWidthPx: number
  phase: StudioOperatorShellPhase
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
  persona,
  anchor,
  panelWidthPx,
  phase,
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

  return (
    <button
      type="button"
      data-testid="operator-avatar-toggle"
      data-phase={phase}
      data-badge={badgeCount > 0 ? String(badgeCount) : ''}
      {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
      aria-pressed={docked}
      aria-label={
        docked
          ? t('collapse')
          : badgeCount > 0
            ? `${t('expand')} — ${t('collapsedTodo', { count: badgeCount })}`
            : t('expand')
      }
      title={name}
      onClick={onToggle}
      style={{
        width: `${STUDIO_OPERATOR_SHELL.avatarSizePx}px`,
        height: `${STUDIO_OPERATOR_SHELL.avatarSizePx}px`,
        top: `${anchor.avatarTopPx}px`,
        right: `calc(${anchor.avatarRightPx}px + env(safe-area-inset-right, 0px))`,
        /* ⚠ `transform-origin: top left` 是上面那组算术的前提：位移算的是**左上角**
           对左上角。换成 center 会让 22/36 的缩放把头像往左上拽半格。 */
        transformOrigin: 'top left',
        transform: docked
          ? `translate3d(${shift.x}px, ${shift.y}px, 0) scale(${scale})`
          : 'translate3d(0, 0, 0) scale(1)',
      }}
      className={cn(
        /* ⚠ `pointer-events-auto`：画布那条全屏 rail 是 `pointer-events-none`
           （见 Dock 里那段头注），不自己声明就按不动 —— 而按不动的表现是
           「收起之后再也打不开」。
           ⚠ `z-50` 高于面板那层 `z-40`：展开态它要坐在头部**上面**。
           ⚠ 白底细边（画板 `DesignD7bToggle`：36px 圆，白底细边），⛔ 不是
             D7 那颗近黑实底 —— 它现在是一张脸不是一颗信号位。 */
        'pointer-events-auto fixed z-50 grid place-items-center overflow-visible rounded-full border border-border bg-card text-foreground shadow-assistant-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
        /* ⚠ 与时间线沟、空态那颗**同一份实现**（`AssistantAvatarGlyph`）：
           全仓只有那一处「预设图形 / 首字母」的取法。 */
        <AssistantAvatarGlyph
          presetId={persona?.avatarPreset ?? null}
          name={name}
          className="rounded-full"
        />
      )}

      {badgeCount > 0 && !docked ? (
        <span
          data-testid="operator-avatar-badge"
          aria-hidden
          className="absolute -right-1 -top-1 grid size-4.5 min-w-4.5 place-items-center rounded-full bg-foreground px-1 font-mono text-2xs tabular-nums text-background ring-2 ring-background"
        >
          {badgeCount}
        </span>
      ) : null}
    </button>
  )
}
