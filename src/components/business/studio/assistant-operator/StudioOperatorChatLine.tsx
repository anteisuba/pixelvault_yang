'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from '@/components/icons'
import { Textarea } from '@/components/ui/textarea'
import {
  deleteOperatorChatLine,
  editOperatorChatLine,
  selectOperatorChatVersion,
  type StudioOperatorChatLine as ChatLine,
} from '@/hooks/use-studio-operator-store'
import { cn } from '@/lib/utils'

const ACTION_CLASS =
  'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 coarse:size-11'

interface StudioOperatorChatLineProps {
  line: ChatLine
  /** 正常显示的那一格（用户文字 / 她的正文）。 */
  children: ReactNode
  /** 这条就是能「重新生成」的那条（你最后一句话之后她说的最后一段）。 */
  isReply: boolean
  /** 正在跑：动作一律不给点（改了也会被这一轮覆盖）。 */
  busy: boolean
  onRegenerate(): void
}

/**
 * 聊天会话里的一条对白（附录L 第二片）：底下一排小动作 —— 她的最后一段多「重新生成」，有几版时
 * 「‹ 2 / 3 ›」左右切；每条都能改、能删（删要再点一下确认）。
 * ⚠ 只在聊天会话里套这一层：工作会话的回复连着工具步与改动，改一句话说不清那一轮做过什么。
 * ⚠ 动作平时淡出、悬停 / 聚焦时出现；触屏一直在（`pointer-coarse`），她最后那段也一直在。
 */
export function StudioOperatorChatLine({
  line,
  children,
  isReply,
  busy,
  onRegenerate,
}: StudioOperatorChatLineProps) {
  const t = useTranslations('StudioOperator.chat')
  const [draft, setDraft] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const versions =
    line.kind === 'message' && line.versions && line.versions.length > 1
      ? line.versions
      : null
  const shown = versions
    ? ((line.kind === 'message' ? line.versionIndex : undefined) ??
      versions.length - 1)
    : 0

  if (draft !== null) {
    const save = () => {
      if (!draft.trim()) return
      editOperatorChatLine(line, draft)
      setDraft(null)
    }
    return (
      <div
        data-testid="operator-chat-line-editor"
        className="flex w-full min-w-0 flex-col gap-1.5"
      >
        <Textarea
          autoFocus
          value={draft}
          aria-label={t('editLabel')}
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
            onClick={() => setDraft(null)}
            className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-fast hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
          >
            <X className="size-3.5" aria-hidden />
            {t('cancel')}
          </button>
          <button
            type="button"
            data-testid="operator-chat-line-save"
            disabled={!draft.trim()}
            onClick={save}
            className="inline-flex min-h-8 items-center gap-1 rounded-md bg-foreground px-2 text-xs text-background transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 coarse:min-h-11"
          >
            <Check className="size-3.5" aria-hidden />
            {t('save')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group/chat-line flex w-full min-w-0 flex-col gap-1">
      {children}
      <div
        data-testid="operator-chat-line-actions"
        className={cn(
          'flex items-center gap-0.5 transition-opacity duration-fast motion-reduce:transition-none',
          line.kind === 'user' && 'justify-end',
          !isReply &&
            !confirmingDelete &&
            'opacity-0 group-focus-within/chat-line:opacity-100 group-hover/chat-line:opacity-100 pointer-coarse:opacity-100',
        )}
      >
        {versions ? (
          <span className="inline-flex items-center">
            <button
              type="button"
              className={ACTION_CLASS}
              aria-label={t('previousVersion')}
              disabled={busy || shown <= 0}
              onClick={() => selectOperatorChatVersion(line, shown - 1)}
            >
              <ChevronLeft className="size-3.5" aria-hidden />
            </button>
            <span
              data-testid="operator-chat-line-version"
              className="min-w-8 text-center font-mono text-2xs text-muted-foreground tabular-nums"
            >
              {t('versionOf', { index: shown + 1, total: versions.length })}
            </span>
            <button
              type="button"
              className={ACTION_CLASS}
              aria-label={t('nextVersion')}
              disabled={busy || shown >= versions.length - 1}
              onClick={() => selectOperatorChatVersion(line, shown + 1)}
            >
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          </span>
        ) : null}
        {isReply ? (
          <button
            type="button"
            data-testid="operator-chat-regenerate"
            className={ACTION_CLASS}
            aria-label={t('regenerate')}
            title={t('regenerate')}
            disabled={busy}
            onClick={onRegenerate}
          >
            <RefreshCw className="size-3.5" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          data-testid="operator-chat-line-edit"
          className={ACTION_CLASS}
          aria-label={t('edit')}
          title={t('edit')}
          disabled={busy}
          onClick={() => {
            setConfirmingDelete(false)
            setDraft(line.text)
          }}
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>
        {confirmingDelete ? (
          <button
            type="button"
            data-testid="operator-chat-line-delete-confirm"
            autoFocus
            disabled={busy}
            onClick={() => deleteOperatorChatLine(line)}
            onBlur={() => setConfirmingDelete(false)}
            className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-xs text-destructive transition-colors duration-fast hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
          >
            <Trash2 className="size-3.5" aria-hidden />
            {t('confirmDelete')}
          </button>
        ) : (
          <button
            type="button"
            data-testid="operator-chat-line-delete"
            className={ACTION_CLASS}
            aria-label={t('delete')}
            title={t('delete')}
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}
