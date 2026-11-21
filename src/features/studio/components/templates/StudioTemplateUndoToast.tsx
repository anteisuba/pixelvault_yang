'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { DURATION_MS } from '@/constants/motion'
import { STUDIO_TEMPLATE_UNDO_MS } from '@/constants/studio'
import { cn } from '@/lib/utils'

import { Spinner } from '@/components/ui/spinner'

/** 黑丸本体（撤销条与「正在取回」同一副，位置由 `anchor` 定）。 */
const PILL_CLASS =
  'absolute left-1/2 z-10 flex h-10 max-w-9/10 -translate-x-1/2 items-center gap-3 rounded-full bg-foreground text-2sm whitespace-nowrap text-background shadow-bar duration-base ease-standard motion-reduce:animate-none md:max-w-lg'
const ANCHOR_CLASS = {
  above: 'bottom-full mb-3',
  inside: 'bottom-6',
} as const

/**
 * 「做同款 / 使用模板」到达、配方还没套上的那几秒（`useStudioArrival().arriving`）：
 * 与撤销条同一个位置、同一颗黑丸，写「正在取回…」+ 转圈；套上后原地换成撤销条。
 * 输入区同时被宿主设为不可编辑（`StudioWorkbenchLayout.busy`）。
 */
export function StudioArrivalPendingNote({
  kind,
  anchor = 'above',
}: {
  kind: 'remix' | 'template'
  anchor?: 'above' | 'inside'
}) {
  const t = useTranslations('StudioTemplates')
  return (
    <div
      role="status"
      className={cn(
        PILL_CLASS,
        ANCHOR_CLASS[anchor],
        'pointer-events-none px-4 animate-in fade-in-0',
      )}
    >
      <Spinner size="sm" label="" aria-hidden />
      <span className="min-w-0 truncate">
        {t(kind === 'remix' ? 'arrivingRemix' : 'arrivingTemplate')}
      </span>
    </div>
  )
}

/**
 * 套用模板之后浮在输入框正上方的一句「已套用「X」· 撤销」（owner 2026-09-26
 * 模板 C）：5 秒后淡出收起，指针停在上面时不计时；点「撤销」当场换回、提示条
 * 同样淡出。⛔ 不用红色、不盖住输入框。
 * ⚠ 淡出那一拍靠定时器落定再 `onDismiss`，⛔ 不等 `animationend`（后台标签页
 *   里动画不跑）。
 * ⚠ 宿主按套用次数给 `key`：再套一张就是一条新的提示条，计时从头来。
 */
export function StudioTemplateUndoToast({
  name,
  message,
  onUndo,
  onDismiss,
  anchor = 'above',
}: {
  name: string
  /**
   * 整句换掉默认的「已套用「{name}」」—— 「做同款」到达时说「已套用这件作品的设置」
   * （同一条到达反馈，`features/studio/hooks/use-studio-arrival.ts`）。
   */
  message?: string
  onUndo: () => void
  onDismiss: () => void
  /**
   * `above` = 浮在输入框 / 底栏的上沿（挂在它们里面，绝对定位到外面）；
   * `inside` = 舞台底部居中（竖排参数栏的视频台没有底部输入框）。
   */
  anchor?: 'above' | 'inside'
}) {
  const t = useTranslations('StudioTemplates')
  const [hovered, setHovered] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (hovered || leaving) return
    const timer = window.setTimeout(
      () => setLeaving(true),
      STUDIO_TEMPLATE_UNDO_MS,
    )
    return () => window.clearTimeout(timer)
  }, [hovered, leaving])

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(onDismiss, DURATION_MS.base)
    return () => window.clearTimeout(timer)
  }, [leaving, onDismiss])

  return (
    <div
      role="status"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={cn(
        PILL_CLASS,
        'pl-4 pr-1.5',
        ANCHOR_CLASS[anchor],
        leaving
          ? 'pointer-events-none animate-out fade-out-0 fill-mode-forwards'
          : 'pointer-events-auto animate-in fade-in-0 slide-in-from-bottom-2',
      )}
    >
      <span className="min-w-0 truncate">
        {message ?? t('applied', { name })}
      </span>
      <button
        type="button"
        onClick={() => {
          onUndo()
          setLeaving(true)
        }}
        className="h-7 shrink-0 rounded-full bg-background/15 px-3 text-2sm font-semibold transition-colors duration-fast ease-linear hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus"
      >
        {t('undo')}
      </button>
    </div>
  )
}
