'use client'

/**
 * **收起态**（D7 ④ · Q2 = C，owner 2026-09-19 验收）—— 右下角一颗 44px 近黑圆
 * 按钮 + 数字角标。
 *
 * ── 它替掉了什么 ────────────────────────────────────────────────
 * v2 §4.3 那张**微状态卡**（头像 + 名字 + 微状态词 + 三点进度）与手机那颗
 * `StudioOperatorMobileFab`（图标 + 状态点 + 微状态药丸 + `3/6` 读数）**两个文件
 * 一起删**，换成这一颗：桌面与手机是同一个组件，差的只有距下缘的留白
 * （桌面 16 / 手机 96 —— 手机底下钉着 `StudioMobileComposer`）。
 *
 * ── ⛔ 为什么不留那句状态词 ────────────────────────────────────────
 * 画板 dockBtn 上只有头像与角标两样。收起态的语义因此收敛成一句话：**有没有等
 * 你的事**。「正在查 3 个来源…」那种读数在展开态头像旁仍然有（面板自己画），
 * 收起时它是一句没人会为它展开面板的话 —— owner 09-19 把那张卡整张删了。
 * ⛔ 也不露最近一条消息：那是第二套时间线。
 *
 * ── 角标数的是什么 ──────────────────────────────────────────────
 * **待确认（未答问题 + 未处理确认）+ 未读结果**。前两项答完即减，未读结果由外壳
 * 在**打开面板那一刻清零**（`StudioOperatorDock`）。0 = 整颗角标不画，⛔ 不画一个
 * 写着 0 的圈。
 */

import { useTranslations } from 'next-intl'
import Image from 'next/image'

import { timelineInitials } from '@/components/business/studio/assistant-operator/AssistantAvatarGlyph'
import {
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
  STUDIO_OPERATOR_MOBILE_SHELL,
  STUDIO_OPERATOR_SHELL,
} from '@/constants/studio-assistant-operator'
import { cn } from '@/lib/utils'
import type { AssistantPersona } from '@/types/assistant-persona'

interface StudioOperatorCollapsedButtonProps {
  /**
   * 角标数：待确认 + 未读结果。`0` 不画角标。
   * ⚠ 由外壳算（它同时掌握 store 与「面板开过没有」），⛔ 这里不自己数。
   */
  badgeCount: number
  persona?: AssistantPersona
  /**
   * 手机档（距下缘 96 而不是 16）。
   * ⚠ 判据从外壳传进来而不是在这里读 `useIsMobile()`：外壳已经按它分了两条
   *   容器分支，同一件事判两遍必然会漂。
   */
  mobile?: boolean
  onExpand(): void
}

export function StudioOperatorCollapsedButton({
  badgeCount,
  persona,
  mobile = false,
  onExpand,
}: StudioOperatorCollapsedButtonProps) {
  const t = useTranslations('StudioOperator')
  const name = persona?.name?.trim() || t('timeline.assistantFallback')
  const avatarUrl = persona?.avatarUrl ?? null

  return (
    <button
      type="button"
      data-testid="operator-collapsed"
      data-badge={badgeCount > 0 ? String(badgeCount) : ''}
      {...{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
      aria-label={
        badgeCount > 0
          ? `${t('expand')} — ${t('collapsedTodo', { count: badgeCount })}`
          : t('expand')
      }
      title={name}
      onClick={onExpand}
      style={{
        width: `${STUDIO_OPERATOR_SHELL.collapsedSizePx}px`,
        height: `${STUDIO_OPERATOR_SHELL.collapsedSizePx}px`,
        right: `calc(${STUDIO_OPERATOR_SHELL.collapsedInsetPx}px + env(safe-area-inset-right, 0px))`,
        bottom: mobile
          ? `calc(${STUDIO_OPERATOR_MOBILE_SHELL.fabBottomPx}px + var(--keyboard-safe-area-bottom, 0px) + var(--keyboard-inset, 0px))`
          : `${STUDIO_OPERATOR_SHELL.collapsedInsetPx}px`,
      }}
      /* 近黑实底 + 白字 —— 信号位那一支（§12.2），⛔ 不用 `--primary`（工作台的
         生成键占着它）。⚠ `z-30` 低于手机 composer 的 `z-40`：净空万一不够，
         让位的是这颗按钮不是生成键。 */
      className={cn(
        /* ⚠ `pointer-events-auto` 与展开态那一格同源（见 `StudioOperatorDock`
           的 aside）：这颗按钮同样住在画布那条 `pointer-events-none` 的全屏
           rail 里，不自己声明就按不动 —— 而按不动的表现是「收起之后再也打不开」。 */
        'pointer-events-auto fixed z-30 grid place-items-center overflow-visible rounded-full bg-foreground text-background shadow-assistant-overlay transition-transform duration-(--duration-fast) ease-standard hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:scale-100',
      )}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={88}
          height={88}
          unoptimized
          className="size-full rounded-full object-cover"
        />
      ) : (
        /* ⚠ 头像**字母**（画板 dockBtn 的 `avatar(44)`）而不是预设图形：44px 的
           近黑圆上，一个字母比一枚线性图标认得更快，也与时间线沟里那颗头像同源
           （`timelineInitials` 是全仓唯一一份取字逻辑）。 */
        <span aria-hidden className="text-md font-semibold leading-none">
          {timelineInitials(name)}
        </span>
      )}

      {badgeCount > 0 ? (
        <span
          data-testid="operator-collapsed-badge"
          aria-hidden
          className="absolute -right-1 -top-1 grid size-4.5 min-w-4.5 place-items-center rounded-full bg-foreground px-1 font-mono text-2xs tabular-nums text-background ring-2 ring-background"
        >
          {badgeCount}
        </span>
      ) : null}
    </button>
  )
}
