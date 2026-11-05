'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Brain, ChevronRight } from '@/components/icons'
import {
  ASSISTANT_MEMORY_LIMITS,
  ASSISTANT_MEMORY_SOURCE_IDS,
} from '@/constants/assistant-memory'
import { CHARACTER_OPINION_PREFIX } from '@/constants/character-browse'
import type { AssistantMemory } from '@/types/assistant-memory'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { CharacterFieldEditor } from '@/features/cards/components/CharacterTextField'
import type {
  MemoryWriteResult,
  useCharacterMemories,
} from '@/features/cards/hooks'
import { untilFromExpiresAt } from '@/lib/memory-until'
import { cn } from '@/lib/utils'

/**
 * 她页「记忆」页签（角色大项目第 ⑦ 步，样件 v4 + owner 10-30；11-05 瘦身）：**只留记忆**——
 * 她记得的事 + 「记一条」，每条能改、能删、能钉住。
 * 「沉睡」折叠在最底下（owner 10-30：挤出去的和过期的都在这，⛔ 自动删），点开每条能唤醒。
 *
 * ⚠ 见闻与观点搬去了「小房间」的活动记录（`CharacterRecentDiary`），在那里管（见闻删、观点钉住 / 改 / 删 / 唤醒）。
 *   观点本质是带 `CHARACTER_OPINION_PREFIX` 的记忆，所以仍占那 200 条上限、仍按沉睡规则睡——这里只是不再列它
 *   （连沉睡区里的观点也不列，免得两处各管一遍）。
 */

type Memories = ReturnType<typeof useCharacterMemories>

type Pending = { kind: 'memory'; id: string } | null

const isOpinion = (memory: AssistantMemory) =>
  memory.text.startsWith(CHARACTER_OPINION_PREFIX)

export function CharacterMemoryPane({ memories }: { memories: Memories }) {
  const t = useTranslations('CharacterRoster.memory')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<AssistantMemory | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [sleepOpen, setSleepOpen] = useState(false)
  const { list } = memories

  /** 记得的（钉住的在最前，其余新的在上）与沉睡的，观点都不在这页。 */
  const { rows, dormant } = useMemo(() => {
    const pinnedFirst = (memory: AssistantMemory) => (memory.pinned ? 1 : 0)
    return {
      rows: (list?.remembered ?? [])
        .filter((memory) => !isOpinion(memory))
        .sort(
          (a, b) =>
            pinnedFirst(b) - pinnedFirst(a) ||
            (a.updatedAt < b.updatedAt
              ? 1
              : a.updatedAt > b.updatedAt
                ? -1
                : 0),
        ),
      dormant: (list?.dormant ?? []).filter((memory) => !isOpinion(memory)),
    }
  }, [list])

  const fail = (result: MemoryWriteResult, key: string) => {
    if (result.ok) return
    toast.error(
      result.i18nKey === 'errors.assistantMemory.limitReached'
        ? t('limitReached', {
            limit: ASSISTANT_MEMORY_LIMITS.maxCreatorEntries,
          })
        : t(key),
    )
  }

  const submit = async () => {
    const text = draft.trim()
    if (!text) return
    const result = await memories.add(text)
    fail(result, 'saveFailed')
    if (result.ok) {
      setDraft('')
      setAdding(false)
    }
  }

  const confirmDelete = async () => {
    if (!pending) return
    const result = await memories.remove(pending.id)
    setPending(null)
    fail(result, 'deleteFailed')
  }

  if (memories.isLoading && !list)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="text-muted-foreground" />
      </div>
    )
  if (!list)
    return (
      <EmptyState
        tone="error"
        icon={<Brain aria-hidden />}
        title={t('loadFailed')}
        action={
          <Button onClick={() => void memories.reload()}>{t('retry')}</Button>
        }
      />
    )

  const nothing = rows.length === 0 && dormant.length === 0

  return (
    <section
      aria-label={t('title')}
      className="flex h-full min-w-0 flex-col gap-3.5 overflow-y-auto overflow-x-hidden pb-12"
      data-testid="character-memory-pane"
    >
      <div className="flex items-center justify-end">
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          {t('add')}
        </Button>
      </div>

      {adding ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <input
            autoFocus
            value={draft}
            maxLength={ASSISTANT_MEMORY_LIMITS.maxTextChars}
            placeholder={t('addPlaceholder')}
            aria-label={t('add')}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                // 只收起输入框：⛔ 冒到库那一层把详情关掉。
                event.stopPropagation()
                setDraft('')
                setAdding(false)
              }
            }}
            className="h-8 min-w-0 flex-1 rounded-full bg-muted px-3.5 text-base outline-none focus-visible:shadow-focus lg:text-2sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft('')
              setAdding(false)
            }}
          >
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={!draft.trim()}
          >
            {t('save')}
          </Button>
        </form>
      ) : null}

      {nothing ? (
        <EmptyState
          icon={<Brain aria-hidden />}
          title={t('emptyTitle')}
          description={t('emptyHint')}
        />
      ) : null}

      {rows.length ? (
        <ul className="flex flex-col gap-1.5">
          {rows.map((memory) => (
            <li key={memory.id}>
              <MemoryRow
                memory={memory}
                onEdit={() => setEditing(memory)}
                onPin={async () =>
                  fail(
                    await memories.setPinned(memory.id, !memory.pinned),
                    'saveFailed',
                  )
                }
                onDelete={() => setPending({ kind: 'memory', id: memory.id })}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {dormant.length > 0 ? (
        <div className="flex flex-col gap-1.5 pt-1">
          <button
            type="button"
            aria-expanded={sleepOpen}
            onClick={() => setSleepOpen((open) => !open)}
            data-testid="character-memory-sleep"
            className="flex items-center gap-1.5 self-start rounded-full py-1 pr-2 text-2sm text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
          >
            {t('sleeping', { count: dormant.length })}
            <ChevronRight
              aria-hidden
              className={cn(
                'size-3.5 transition-transform duration-base ease-standard motion-reduce:transition-none',
                sleepOpen && 'rotate-90',
              )}
            />
          </button>
          {sleepOpen ? (
            <ul className="flex flex-col gap-1.5">
              {dormant.map((memory) => (
                <li key={memory.id}>
                  <SleepingRow
                    memory={memory}
                    onWake={async () =>
                      fail(await memories.wake(memory.id), 'saveFailed')
                    }
                    onDelete={() =>
                      setPending({ kind: 'memory', id: memory.id })
                    }
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <CharacterFieldEditor
        open={editing !== null}
        label={t('editTitle')}
        value={editing?.text ?? ''}
        limit={ASSISTANT_MEMORY_LIMITS.maxTextChars}
        onSave={async (text) => {
          if (!editing || !text) return false
          const result = await memories.edit(editing.id, text)
          fail(result, 'saveFailed')
          return result.ok
        }}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={t('deleteTitle')}
        description={t('deleteBody')}
        cancelLabel={t('cancel')}
        confirmLabel={t('delete')}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  )
}

function useShortDate() {
  const format = useFormatter()
  return (iso: string) =>
    format.dateTime(new Date(iso), { month: 'numeric', day: 'numeric' })
}

/** 「到哪天为止」那个日子按当地正午读，⛔ 跨时区退成前一天。 */
const dayOf = (until: string) => `${until}T12:00:00`

function RowShell({
  label,
  children,
  actions,
  className,
}: {
  label: string
  children: ReactNode
  actions: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'group flex items-start gap-3 rounded-xl bg-muted/60 px-3 py-2.5',
        className,
      )}
    >
      <span className="w-8 shrink-0 pt-0.5 text-xs leading-reading text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</div>
      <div className="flex shrink-0 items-center">{actions}</div>
    </div>
  )
}

function RowAction({
  onClick,
  children,
}: {
  onClick(): void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 rounded-full px-2 text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus"
    >
      {children}
    </button>
  )
}

function MemoryRow({
  memory,
  onEdit,
  onPin,
  onDelete,
}: {
  memory: AssistantMemory
  onEdit(): void
  onPin(): void
  onDelete(): void
}) {
  const t = useTranslations('CharacterRoster.memory')
  const shortDate = useShortDate()
  const meta = [
    shortDate(memory.updatedAt),
    memory.source === ASSISTANT_MEMORY_SOURCE_IDS.creator ? t('byYou') : null,
    memory.pinned
      ? t('pinned')
      : memory.expiresAt
        ? t('until', {
            date: shortDate(dayOf(untilFromExpiresAt(memory.expiresAt))),
          })
        : null,
  ].filter(Boolean)
  return (
    <RowShell
      label={t('kindMemory')}
      actions={
        <>
          <RowAction onClick={onPin}>
            {t(memory.pinned ? 'unpin' : 'pin')}
          </RowAction>
          <RowAction onClick={onEdit}>{t('edit')}</RowAction>
          <RowAction onClick={onDelete}>{t('delete')}</RowAction>
        </>
      }
    >
      <p className="text-2sm leading-reading break-words">{memory.text}</p>
      <p className="text-xs text-muted-foreground">{meta.join(' · ')}</p>
    </RowShell>
  )
}

function SleepingRow({
  memory,
  onWake,
  onDelete,
}: {
  memory: AssistantMemory
  onWake(): void
  onDelete(): void
}) {
  const t = useTranslations('CharacterRoster.memory')
  const shortDate = useShortDate()
  // 带日子的写到哪天为止（多半是过期睡的），挤出去睡的写哪天睡的。
  const until = memory.expiresAt ? untilFromExpiresAt(memory.expiresAt) : null
  return (
    <RowShell
      label={t('kindMemory')}
      className="bg-transparent"
      actions={
        <>
          <RowAction onClick={onWake}>{t('wake')}</RowAction>
          <RowAction onClick={onDelete}>{t('delete')}</RowAction>
        </>
      }
    >
      <p className="text-2sm leading-reading break-words text-ink-2">
        {memory.text}
      </p>
      <p className="text-xs text-muted-foreground">
        {until
          ? t('until', { date: shortDate(dayOf(until)) })
          : t('sleptOn', { date: shortDate(memory.updatedAt) })}
      </p>
    </RowShell>
  )
}
