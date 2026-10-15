'use client'

/**
 * 单击输入框里的一枚 `@` 胶囊弹出的小卡片（设计方案 §10b「定位」）：
 * 预览 · 在画布上定位 · 当作哪种参考（宿主说它收才出）· 移除。
 *
 * ⚠ 与 `@` 菜单住同一个位置（输入框正上方、输入区里绝对定位），⛔ 不 portal：
 * 手机上键盘弹起时它跟着输入框走。点外面 / Esc 关。
 * ⚠ 指的东西没了（「已删除」）只剩「移除」一颗 —— 预览、定位都没有对象。
 */

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

import { ASSISTANT_MENTION_KIND_IDS } from '@/constants/assistant-mention'
import { Locate, Maximize2, X } from '@/components/icons'
import type { DraftMention } from '@/lib/assistant-mention'
import { cn } from '@/lib/utils'
import type { AssistantMentionRole } from '@/types/assistant-mention'

const ACTION_CLASS =
  'flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11'

export interface StudioOperatorMentionCardProps {
  readonly draft: DraftMention
  /** 胶囊左缘相对输入区的横向位置（px）。 */
  readonly left: number
  readonly roles: readonly AssistantMentionRole[]
  onClose(): void
  onRemove(): void
  onRole(role: AssistantMentionRole | undefined): void
  /** 画布上的卡才有。 */
  onLocate?(): void
  /** 有地址的图 / 视频才有。 */
  onPreview?(): void
}

export function StudioOperatorMentionCard({
  draft,
  left,
  roles,
  onClose,
  onRemove,
  onRole,
  onLocate,
  onPreview,
}: StudioOperatorMentionCardProps) {
  const t = useTranslations('StudioOperator.mention')
  const rootRef = useRef<HTMLDivElement>(null)
  const mention = draft.mention

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // ⚠ 只关卡片：不让这一下 Esc 再冒泡去收面板。
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose])

  const label = mention?.label ?? t('deleted')
  const showRoles =
    !draft.missing &&
    roles.length > 0 &&
    mention !== null &&
    (mention.kind === ASSISTANT_MENTION_KIND_IDS.image ||
      mention.kind === ASSISTANT_MENTION_KIND_IDS.video)

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={label}
      data-testid="operator-mention-card"
      data-missing={draft.missing ? 'true' : undefined}
      className="assistant-mention-card absolute bottom-full z-30 mb-2 flex w-64 max-w-full flex-col gap-2 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-md"
      style={{ left }}
    >
      <div className="flex items-center gap-2">
        {mention?.thumb && !draft.missing ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mention.thumb}
            alt=""
            draggable={false}
            className="size-12 shrink-0 rounded-md bg-muted object-cover"
          />
        ) : null}
        <div className="flex min-w-0 flex-col">
          <span
            className={cn(
              'truncate text-sm',
              draft.missing && 'text-muted-foreground line-through',
            )}
          >
            {label}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {draft.missing
              ? t('deleted')
              : mention
                ? t(`kinds.${mention.kind}`)
                : null}
          </span>
        </div>
      </div>
      {showRoles ? (
        <div
          role="radiogroup"
          aria-label={t('role')}
          className="flex flex-wrap gap-1"
        >
          {[undefined, ...roles].map((role) => {
            const selected = (mention?.role ?? undefined) === role
            return (
              <button
                key={role ?? 'none'}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid="operator-mention-role"
                data-role={role ?? 'none'}
                onClick={() => onRole(role)}
                className={cn(
                  'min-h-8 rounded-md border px-2 text-xs transition-[background-color,border-color] duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11',
                  selected
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {role ? t(`roles.${role}`) : t('roleNone')}
              </button>
            )
          })}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        {onPreview && !draft.missing ? (
          <button
            type="button"
            data-testid="operator-mention-card-preview"
            className={ACTION_CLASS}
            onClick={onPreview}
          >
            <Maximize2 className="size-3.5" aria-hidden />
            {t('preview')}
          </button>
        ) : null}
        {onLocate && !draft.missing ? (
          <button
            type="button"
            data-testid="operator-mention-card-locate"
            className={ACTION_CLASS}
            onClick={onLocate}
          >
            <Locate className="size-3.5" aria-hidden />
            {t('locate')}
          </button>
        ) : null}
        <button
          type="button"
          data-testid="operator-mention-card-remove"
          className={cn(ACTION_CLASS, 'ml-auto')}
          onClick={onRemove}
        >
          <X className="size-3.5" aria-hidden />
          {t('remove')}
        </button>
      </div>
    </div>
  )
}
