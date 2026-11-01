'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  RefreshCw,
  X,
} from '@/components/icons'
import { Textarea } from '@/components/ui/textarea'
import type { StudioOperatorMessageEntry } from '@/types/studio-assistant-operator'

const ACTION_CLASS =
  'inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 coarse:min-h-11'

/**
 * 聊天里她最新那句底下的一排（⑪ B，owner 10-31「可以加」）：有几版时「‹ 2 / 3 ›」左右切、
 * 「重说」按你最后那句再来一次、「改写」改成她该说的样子（下一轮接着改过的说，并存成卡上的示例）。
 * ⚠ 只挂在她最新那句上：更早的话改了，后面的对白就接不上了。
 */
export function StudioOperatorReplyActions({
  entry,
  busy,
  onRegenerate,
  onSelectVersion,
  onRewrite,
  children,
}: {
  entry: StudioOperatorMessageEntry
  /** 正在跑：一律不给点（改了也会被这一轮覆盖）。 */
  busy: boolean
  onRegenerate(): void
  onSelectVersion(index: number): void
  onRewrite(text: string): void
  children: ReactNode
}) {
  const t = useTranslations('StudioOperator.chat')
  const [draft, setDraft] = useState<string | null>(null)
  const versions =
    entry.versions && entry.versions.length > 1 ? entry.versions : null
  const shown = versions ? (entry.versionIndex ?? versions.length - 1) : 0

  if (draft !== null) {
    const save = () => {
      if (!draft.trim()) return
      onRewrite(draft)
      setDraft(null)
    }
    return (
      <div
        data-testid="operator-reply-rewrite"
        className="flex w-full min-w-0 flex-col gap-1.5"
      >
        <Textarea
          autoFocus
          value={draft}
          aria-label={t('rewriteLabel')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setDraft(null)
            } else if (
              event.key === 'Enter' &&
              (event.metaKey || event.ctrlKey)
            ) {
              event.preventDefault()
              save()
            }
          }}
          className="max-h-72 text-sm"
        />
        <div className="flex justify-end gap-1">
          <button
            type="button"
            className={ACTION_CLASS}
            onClick={() => setDraft(null)}
          >
            <X className="size-3.5" aria-hidden />
            {t('rewriteCancel')}
          </button>
          <button
            type="button"
            data-testid="operator-reply-rewrite-save"
            disabled={!draft.trim() || busy}
            onClick={save}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-foreground px-2 text-xs text-background transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 coarse:min-h-11"
          >
            <Check className="size-3.5" aria-hidden />
            {t('rewriteSave')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      {children}
      <div
        data-testid="operator-reply-actions"
        className="flex items-center gap-0.5"
      >
        {versions ? (
          <span className="inline-flex items-center">
            <button
              type="button"
              className={ACTION_CLASS}
              aria-label={t('previousVersion')}
              disabled={busy || shown <= 0}
              onClick={() => onSelectVersion(shown - 1)}
            >
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>
            <span
              data-testid="operator-reply-version"
              className="min-w-8 text-center font-mono text-2xs text-muted-foreground tabular-nums"
            >
              {t('versionOf', { index: shown + 1, total: versions.length })}
            </span>
            <button
              type="button"
              className={ACTION_CLASS}
              aria-label={t('nextVersion')}
              disabled={busy || shown >= versions.length - 1}
              onClick={() => onSelectVersion(shown + 1)}
            >
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          </span>
        ) : null}
        <button
          type="button"
          data-testid="operator-reply-regenerate"
          className={ACTION_CLASS}
          disabled={busy}
          onClick={onRegenerate}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          {t('regenerate')}
        </button>
        <button
          type="button"
          data-testid="operator-reply-rewrite-open"
          className={ACTION_CLASS}
          disabled={busy}
          onClick={() => setDraft(entry.text)}
        >
          <Pencil className="size-3.5" aria-hidden />
          {t('rewrite')}
        </button>
      </div>
    </div>
  )
}
