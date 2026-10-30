'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Home, ChevronRight } from '@/components/icons'
import { CHARACTER_REFLECTION } from '@/constants/cards'
import type {
  CharacterFindingEntry,
  CharacterGrowth,
  CharacterJournalEntry,
  CharacterOpinionEntry,
  CharacterRevisionEntry,
} from '@/types/character-growth'
import type { CharacterStickerRecord } from '@/types/character-sticker'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { CharacterFieldEditor } from '@/components/business/cards/CharacterTextField'
import {
  Clock,
  DayLabel,
  OpinionEvent,
  OutingEvent,
  RevisionDiff,
  StickerTile,
  dayKey,
  useFieldLabel,
} from '@/components/business/cards/CharacterRecent'
import type { useCharacterGrowth, useCharacterStickers } from '@/hooks/cards'
import { cn } from '@/lib/utils'

/**
 * 电脑详情的「最近」页签（角色大项目第 ③ 步，owner 10-30 三问全定）：一天一块，
 * 当天的日记按时间排在上面当主角（编辑 · 删除）；当天的事一行一条挂在最下面——调查（点开看来源和
 * 她记下的话）· 改了自己（改前改后 · 撤回）· 有了观点（改 · 删）· 收了表情。
 * ⛔ 筛选条（表情有自己的页签，见闻 / 观点第 ⑦ 步进记忆页签）；只出门没写日记的那天只放小条，⛔ 占位。
 * 手机仍用 `CharacterRecent`。
 */

type Growth = ReturnType<typeof useCharacterGrowth>
type Stickers = ReturnType<typeof useCharacterStickers>

type DiaryEvent =
  | { kind: 'outing'; at: string; findings: CharacterFindingEntry[] }
  | { kind: 'revision'; at: string; revision: CharacterRevisionEntry }
  | { kind: 'opinion'; at: string; opinion: CharacterOpinionEntry }
  | { kind: 'stickers'; at: string; stickers: CharacterStickerRecord[] }

interface DiaryDay {
  key: string
  at: string
  journals: CharacterJournalEntry[]
  events: DiaryEvent[]
}

const newestFirst = (a: { at: string }, b: { at: string }) =>
  a.at < b.at ? 1 : a.at > b.at ? -1 : 0

/** 按天分好：日记新的在上；同一天的见闻折成一趟出门、她逛来的表情折成一条（⛔ 你上传的）。 */
export function buildDiary(
  growth: CharacterGrowth,
  stickers: readonly CharacterStickerRecord[],
): DiaryDay[] {
  const days = new Map<string, DiaryDay>()
  const dayOf = (at: string) => {
    const key = dayKey(at)
    const day = days.get(key) ?? { key, at, journals: [], events: [] }
    if (at > day.at) day.at = at
    days.set(key, day)
    return day
  }
  for (const journal of growth.journals)
    dayOf(journal.createdAt).journals.push(journal)
  const grouped = <T,>(rows: readonly T[], at: (row: T) => string) => {
    const groups = new Map<string, T[]>()
    for (const row of rows) {
      const key = dayKey(at(row))
      groups.set(key, [...(groups.get(key) ?? []), row])
    }
    return [...groups.values()]
  }
  for (const findings of grouped(growth.findings, (row) => row.seenAt)) {
    const at = findings.reduce(
      (latest, row) => (row.seenAt > latest ? row.seenAt : latest),
      findings[0].seenAt,
    )
    dayOf(at).events.push({ kind: 'outing', at, findings })
  }
  for (const revision of growth.revisions)
    dayOf(revision.createdAt).events.push({
      kind: 'revision',
      at: revision.createdAt,
      revision,
    })
  for (const opinion of growth.opinions)
    dayOf(opinion.createdAt).events.push({
      kind: 'opinion',
      at: opinion.createdAt,
      opinion,
    })
  const found = stickers.filter((row) => !row.fromCreator)
  for (const items of grouped(found, (row) => row.createdAt)) {
    const at = items.reduce(
      (latest, row) => (row.createdAt > latest ? row.createdAt : latest),
      items[0].createdAt,
    )
    dayOf(at).events.push({ kind: 'stickers', at, stickers: items })
  }
  return [...days.values()]
    .map((day) => ({
      ...day,
      journals: [...day.journals].sort((a, b) =>
        newestFirst({ at: a.createdAt }, { at: b.createdAt }),
      ),
      events: [...day.events].sort(newestFirst),
    }))
    .sort(newestFirst)
}

type Pending =
  | { kind: 'journal'; id: string }
  | { kind: 'finding'; id: string }
  | { kind: 'opinion'; id: string }
  | { kind: 'sticker'; id: string }
  | null

export function CharacterRecentDiary({
  growth: data,
  stickers,
}: {
  growth: Growth
  stickers: Stickers
}) {
  const t = useTranslations('CharacterRoster.recent')
  const [pending, setPending] = useState<Pending>(null)
  const [editing, setEditing] = useState<CharacterJournalEntry | null>(null)
  const growth = data.growth
  const days = useMemo(
    () => (growth ? buildDiary(growth, stickers.stickers ?? []) : []),
    [growth, stickers.stickers],
  )

  const confirmDelete = async () => {
    if (!pending) return
    const ok =
      pending.kind === 'journal'
        ? (await data.removeJournal(pending.id)).ok
        : pending.kind === 'finding'
          ? (await data.removeFinding(pending.id)).ok
          : pending.kind === 'opinion'
            ? (await data.removeOpinion(pending.id)).ok
            : await stickers.remove(pending.id)
    setPending(null)
    if (!ok) toast.error(t('deleteFailed'))
  }

  if (data.isLoading && !growth)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="text-muted-foreground" />
      </div>
    )
  if (!growth)
    return (
      <EmptyState
        tone="error"
        icon={<Home aria-hidden />}
        title={t('loadFailed')}
        action={
          <button
            type="button"
            onClick={() => void data.reload()}
            className="h-9 rounded-full bg-primary px-4 text-2sm font-semibold text-primary-foreground hover:tint-hover"
          >
            {t('retry')}
          </button>
        }
      />
    )

  const confirmCopy = {
    journal: ['deleteJournalTitle', 'deleteJournalBody'],
    finding: ['deleteFindingTitle', 'deleteFindingBody'],
    opinion: ['deleteOpinionTitle', 'deleteOpinionBody'],
    sticker: ['deleteStickerTitle', 'deleteStickerBody'],
  } as const
  const copy = confirmCopy[pending?.kind ?? 'journal']

  return (
    <section
      aria-label={t('title')}
      className="h-full overflow-y-auto pb-12"
      data-testid="character-recent-diary"
    >
      {days.length === 0 ? (
        <p className="py-8 text-center text-2sm text-muted-foreground">
          {t('diaryEmpty')}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((day) => (
            <div key={day.key} className="flex flex-col gap-3">
              <DayLabel iso={day.at} />
              {day.journals.map((journal) => (
                <article
                  key={journal.id}
                  data-testid="character-diary-journal"
                  className="flex flex-col gap-2 rounded-2xl bg-muted/60 px-5 py-4"
                >
                  <div className="flex items-center gap-2">
                    <Clock iso={journal.createdAt} />
                    <span className="flex-1" />
                    <DiaryAction onClick={() => setEditing(journal)}>
                      {t('editJournal')}
                    </DiaryAction>
                    <DiaryAction
                      onClick={() =>
                        setPending({ kind: 'journal', id: journal.id })
                      }
                    >
                      {t('delete')}
                    </DiaryAction>
                  </div>
                  <p className="whitespace-pre-wrap text-md leading-reading">
                    {journal.text}
                  </p>
                </article>
              ))}
              {day.events.length ? (
                <ul className="flex flex-col">
                  {day.events.map((event) => (
                    <li
                      key={`${event.kind}:${event.at}`}
                      className="border-b border-border py-2.5 last:border-b-0"
                    >
                      <DiaryEventRow
                        event={event}
                        data={data}
                        stickers={stickers}
                        onDelete={setPending}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <CharacterFieldEditor
        open={editing !== null}
        label={t('editJournal')}
        value={editing?.text ?? ''}
        limit={CHARACTER_REFLECTION.journalChars}
        onSave={async (text) => {
          if (!editing || !text) return false
          const result = await data.editJournal(editing.id, text)
          if (!result.ok) toast.error(t('saveFailed'))
          return result.ok
        }}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={t(copy[0])}
        description={t(copy[1])}
        cancelLabel={t('cancel')}
        confirmLabel={t('delete')}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  )
}

function DiaryAction({
  onClick,
  children,
  disabled,
}: {
  onClick(): void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-7 shrink-0 rounded-full px-2 text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-45"
    >
      {children}
    </button>
  )
}

/** 能点开的一行：左边一句，右边可放键，点开看细节。 */
function FoldRow({
  summary,
  actions,
  children,
}: {
  summary: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left text-2sm font-medium"
        >
          <span className="truncate">{summary}</span>
          <ChevronRight
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-base ease-standard motion-reduce:transition-none',
              open && 'rotate-90',
            )}
          />
        </button>
        {actions}
      </div>
      {open ? children : null}
    </div>
  )
}

function DiaryEventRow({
  event,
  data,
  stickers,
  onDelete,
}: {
  event: DiaryEvent
  data: Growth
  stickers: Stickers
  onDelete(pending: Pending): void
}) {
  const t = useTranslations('CharacterRoster.recent')
  const label = useFieldLabel()
  const [outingOpen, setOutingOpen] = useState(false)
  if (event.kind === 'outing')
    return (
      <OutingEvent
        findings={event.findings}
        open={outingOpen}
        onToggle={() => setOutingOpen((open) => !open)}
        onDelete={(finding) => onDelete({ kind: 'finding', id: finding.id })}
      />
    )
  if (event.kind === 'opinion')
    return (
      <OpinionEvent
        opinion={event.opinion}
        onSave={async (text) => {
          const result = await data.editOpinion(event.opinion.id, text)
          if (!result.ok) toast.error(t('saveFailed'))
          return result.ok
        }}
        onDelete={() => onDelete({ kind: 'opinion', id: event.opinion.id })}
      />
    )
  if (event.kind === 'revision') {
    const { revision } = event
    return (
      <FoldRow
        summary={t('changedField', {
          field: revision.fields.map(label).join('、'),
        })}
        actions={
          revision.revertedAt ? (
            <span className="px-2 text-xs text-muted-foreground">
              {t('reverted')}
            </span>
          ) : (
            <DiaryAction
              disabled={data.revertingId === revision.id}
              onClick={() => void data.revert(revision.id)}
            >
              {t('revert')}
            </DiaryAction>
          )
        }
      >
        {revision.reason ? (
          <p className="text-xs text-muted-foreground">{revision.reason}</p>
        ) : null}
        <RevisionDiff revision={revision} />
      </FoldRow>
    )
  }
  return (
    <FoldRow summary={t('gotStickers', { count: event.stickers.length })}>
      <div className="flex flex-wrap items-center gap-2">
        {event.stickers.map((sticker) => (
          <StickerTile
            key={sticker.id}
            sticker={sticker}
            size="row"
            onToggle={() =>
              void stickers
                .setBlocked(sticker.id, !sticker.isBlocked)
                .then((ok) => {
                  if (!ok) toast.error(t('saveFailed'))
                })
            }
            onDelete={() => onDelete({ kind: 'sticker', id: sticker.id })}
          />
        ))}
      </div>
    </FoldRow>
  )
}
