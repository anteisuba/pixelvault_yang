'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { ArrowUpRight, Brain, ChevronRight } from '@/components/icons'
import {
  ASSISTANT_MEMORY_LIMITS,
  ASSISTANT_MEMORY_SOURCE_IDS,
} from '@/constants/assistant-memory'
import { CHARACTER_OPINION_PREFIX } from '@/constants/character-browse'
import type { AssistantMemory } from '@/types/assistant-memory'
import type { CharacterFindingEntry } from '@/types/character-growth'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { Spinner } from '@/components/ui/spinner'
import { SOURCE_KEYS } from '@/components/business/cards/CharacterOutingCard'
import { CharacterFieldEditor } from '@/components/business/cards/CharacterTextField'
import type { MemoryWriteResult, useCharacterMemories } from '@/hooks/cards'
import { untilFromExpiresAt } from '@/lib/memory-until'
import { cn } from '@/lib/utils'

/**
 * 她页「记忆」页签（角色大项目第 ⑦ 步，样件 v4 + owner 10-30）：
 * 切换条 全部 · 记得的 · 见闻 · 观点 + 「记一条」；每条能改、能删、能钉住（见闻只能删）。
 * 「沉睡」折叠在记得的最底下（owner 10-30：挤出去的和过期的都在这，⛔ 自动删），点开每条能唤醒。
 */

type Memories = ReturnType<typeof useCharacterMemories>
type Filter = 'all' | 'memory' | 'finding' | 'opinion'

type Row =
  | { kind: 'memory' | 'opinion'; at: string; memory: AssistantMemory }
  | { kind: 'finding'; at: string; finding: CharacterFindingEntry }

type Pending =
  | { kind: 'memory'; id: string }
  | { kind: 'finding'; id: string }
  | null

const isOpinion = (memory: AssistantMemory) =>
  memory.text.startsWith(CHARACTER_OPINION_PREFIX)

const opinionText = (memory: AssistantMemory) =>
  isOpinion(memory)
    ? memory.text.slice(CHARACTER_OPINION_PREFIX.length).trim()
    : memory.text

export function CharacterMemoryPane({ memories }: { memories: Memories }) {
  const t = useTranslations('CharacterRoster.memory')
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<AssistantMemory | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [sleepOpen, setSleepOpen] = useState(false)
  const { list } = memories

  const rows = useMemo<Row[]>(() => {
    if (!list) return []
    const remembered: Row[] = list.remembered.map((memory) => ({
      kind: isOpinion(memory) ? 'opinion' : 'memory',
      at: memory.updatedAt,
      memory,
    }))
    const found: Row[] = list.findings.map((finding) => ({
      kind: 'finding',
      at: finding.seenAt,
      finding,
    }))
    const pinnedFirst = (row: Row) =>
      row.kind !== 'finding' && row.memory.pinned ? 1 : 0
    return [...remembered, ...found]
      .filter((row) => filter === 'all' || row.kind === filter)
      .sort(
        (a, b) =>
          pinnedFirst(b) - pinnedFirst(a) ||
          (a.at < b.at ? 1 : a.at > b.at ? -1 : 0),
      )
  }, [filter, list])

  const filters = [
    { value: 'all', label: t('filterAll') },
    { value: 'memory', label: t('filterMemory') },
    { value: 'finding', label: t('filterFinding') },
    { value: 'opinion', label: t('filterOpinion') },
  ] as const

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
    const result =
      pending.kind === 'memory'
        ? await memories.remove(pending.id)
        : await memories.removeFinding(pending.id)
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

  const nothing =
    list.remembered.length === 0 &&
    list.findings.length === 0 &&
    list.dormant.length === 0
  const showSleep =
    list.dormant.length > 0 && (filter === 'all' || filter === 'memory')

  return (
    <section
      aria-label={t('title')}
      className="flex h-full min-w-0 flex-col gap-3.5 overflow-y-auto overflow-x-hidden pb-12"
      data-testid="character-memory-pane"
    >
      <div className="flex flex-wrap items-center gap-2">
        <LiquidSegmented
          items={filters}
          value={filter}
          onChange={setFilter}
          ariaLabel={t('filterLabel')}
          size="sm"
        />
        <span className="flex-1" />
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
      ) : rows.length === 0 && !showSleep ? (
        <p className="text-2sm text-muted-foreground">{t('filteredEmpty')}</p>
      ) : null}

      {rows.length ? (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li
              key={`${row.kind}:${row.kind === 'finding' ? row.finding.id : row.memory.id}`}
            >
              {row.kind === 'finding' ? (
                <FindingRow
                  finding={row.finding}
                  onDelete={() =>
                    setPending({ kind: 'finding', id: row.finding.id })
                  }
                />
              ) : (
                <MemoryRow
                  kind={row.kind}
                  memory={row.memory}
                  onEdit={() => setEditing(row.memory)}
                  onPin={async () =>
                    fail(
                      await memories.setPinned(
                        row.memory.id,
                        !row.memory.pinned,
                      ),
                      'saveFailed',
                    )
                  }
                  onDelete={() =>
                    setPending({ kind: 'memory', id: row.memory.id })
                  }
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {showSleep ? (
        <div className="flex flex-col gap-1.5 pt-1">
          <button
            type="button"
            aria-expanded={sleepOpen}
            onClick={() => setSleepOpen((open) => !open)}
            data-testid="character-memory-sleep"
            className="flex items-center gap-1.5 self-start rounded-full py-1 pr-2 text-2sm text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
          >
            {t('sleeping', { count: list.dormant.length })}
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
              {list.dormant.map((memory) => (
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
        value={editing ? opinionText(editing) : ''}
        limit={ASSISTANT_MEMORY_LIMITS.maxTextChars}
        onSave={async (text) => {
          if (!editing || !text) return false
          const full = isOpinion(editing)
            ? `${CHARACTER_OPINION_PREFIX}${text.trim()}`
            : text
          const result = await memories.edit(editing.id, full)
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
        title={t(
          pending?.kind === 'finding' ? 'deleteFindingTitle' : 'deleteTitle',
        )}
        description={t(
          pending?.kind === 'finding' ? 'deleteFindingBody' : 'deleteBody',
        )}
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
  kind,
  memory,
  onEdit,
  onPin,
  onDelete,
}: {
  kind: 'memory' | 'opinion'
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
      label={t(kind === 'opinion' ? 'kindOpinion' : 'kindMemory')}
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
      <p className="text-2sm leading-reading break-words">
        {opinionText(memory)}
      </p>
      <p className="text-xs text-muted-foreground">{meta.join(' · ')}</p>
    </RowShell>
  )
}

function FindingRow({
  finding,
  onDelete,
}: {
  finding: CharacterFindingEntry
  onDelete(): void
}) {
  const t = useTranslations('CharacterRoster.memory')
  const recent = useTranslations('CharacterRoster.recent')
  const shortDate = useShortDate()
  return (
    <RowShell
      label={t('kindFinding')}
      actions={<RowAction onClick={onDelete}>{t('delete')}</RowAction>}
    >
      <p className="text-2sm leading-reading break-words">
        {finding.note || finding.title}
      </p>
      <a
        href={finding.url}
        target="_blank"
        rel="noreferrer noopener"
        title={finding.title}
        className="inline-flex min-w-0 max-w-full items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="truncate">
          {shortDate(finding.seenAt)} · {recent(SOURCE_KEYS[finding.source])} ·{' '}
          {finding.title}
        </span>
        <ArrowUpRight aria-hidden className="size-3 shrink-0" />
      </a>
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
      label={t(isOpinion(memory) ? 'kindOpinion' : 'kindMemory')}
      className="bg-transparent"
      actions={
        <>
          <RowAction onClick={onWake}>{t('wake')}</RowAction>
          <RowAction onClick={onDelete}>{t('delete')}</RowAction>
        </>
      }
    >
      <p className="text-2sm leading-reading break-words text-ink-2">
        {opinionText(memory)}
      </p>
      <p className="text-xs text-muted-foreground">
        {until
          ? t('until', { date: shortDate(dayOf(until)) })
          : t('sleptOn', { date: shortDate(memory.updatedAt) })}
      </p>
    </RowShell>
  )
}
