'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { Home, ChevronRight } from '@/components/icons'
import { CHARACTER_REFLECTION } from '@/constants/cards'
import type { AssistantMemory } from '@/types/assistant-memory'
import type {
  CharacterFindingEntry,
  CharacterGrowth,
  CharacterJournalEntry,
  CharacterOpinionEntry,
  CharacterOutingRun,
  CharacterRevisionEntry,
} from '@/types/character-growth'
import type { CharacterStickerRecord } from '@/types/character-sticker'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { Spinner } from '@/components/ui/spinner'
import { CharacterFieldEditor } from '@/features/cards/components/CharacterTextField'
import {
  Clock,
  DayLabel,
  OpinionEvent,
  OutingEvent,
  RevisionDiff,
  StickerTile,
  dayKey,
  groupOutings,
  useFieldLabel,
  useRecentFilters,
  type OpinionMemoryState,
  type RecentFilter,
} from '@/features/cards/components/CharacterRecent'
import type {
  useCharacterGrowth,
  useCharacterMemories,
  useCharacterStickers,
} from '@/features/cards/hooks'
import { cn } from '@/lib/utils'

/**
 * 电脑详情的「小房间」页签 = **活动记录**（角色大项目第 ③ 步 + 11-05 owner 拍板）：一天一块，
 * 当天的日记按时间排在上面当主角（编辑 · 删除）；当天的事一行一条挂在最下面——调查（一趟一条，话题那趟
 * 标题写「查了「话题」」、带出处的小结摆在底下，点开看她记下的话）· 改了自己（改前改后 · 撤回）·
 * 有了观点（钉住 · 改 · 删）· 收了表情。
 *
 * ⭐ 顶上一条筛选（默认「全部」，与手机 `CharacterRecent` 同一份）。这是对 10-30「日记当主角、不要筛选」的
 *   优化而不是推翻：日记照旧是主角，筛选只是让见闻 / 观点 / 改动多起来之后好找。
 * ⭐ 见闻与观点原先在「记忆」页签里管，现在只在这里管：见闻能删，观点能钉住 / 改 / 删（沉睡的观点能唤醒）。
 *   「记忆」页签只剩她记得的事。只出门没写日记的那天只放小条，⛔ 占位。
 * 手机仍用 `CharacterRecent`。
 */

type Growth = ReturnType<typeof useCharacterGrowth>
type Stickers = ReturnType<typeof useCharacterStickers>
type Memories = ReturnType<typeof useCharacterMemories>

/** 筛选 → 它显示哪一种小条（日记不在这里：它有自己的位置）。 */
const EVENT_KIND_OF_FILTER = {
  finding: 'outing',
  opinion: 'opinion',
  revision: 'revision',
  sticker: 'stickers',
} as const

type DiaryEvent =
  | {
      kind: 'outing'
      at: string
      findings: CharacterFindingEntry[]
      run: CharacterOutingRun | null
    }
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

/**
 * 按天分好：日记新的在上；见闻一趟一条（`groupOutings`）、她逛来的表情一天折成一条（⛔ 你上传的）。
 * `filter` 不是「全部」时只留那一种（日记也算一种），空了的那天不出。
 */
export function buildDiary(
  growth: CharacterGrowth,
  stickers: readonly CharacterStickerRecord[],
  filter: RecentFilter = 'all',
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
  for (const outing of groupOutings(growth))
    dayOf(outing.at).events.push({ kind: 'outing', ...outing })
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
      journals:
        filter === 'all' || filter === 'journal'
          ? [...day.journals].sort((a, b) =>
              newestFirst({ at: a.createdAt }, { at: b.createdAt }),
            )
          : [],
      events: day.events
        .filter(
          (event) =>
            filter === 'all' ||
            (filter !== 'journal' &&
              event.kind === EVENT_KIND_OF_FILTER[filter]),
        )
        .sort(newestFirst),
    }))
    .filter((day) => day.journals.length > 0 || day.events.length > 0)
    .sort(newestFirst)
}

type Pending =
  | { kind: 'journal'; id: string }
  | { kind: 'finding'; id: string }
  | { kind: 'opinion'; id: string }
  | { kind: 'sticker'; id: string }
  | null

type MemoryById = ReadonlyMap<
  string,
  { memory: AssistantMemory; dormant: boolean }
>

export function CharacterRecentDiary({
  growth: data,
  stickers,
  memories,
  lead,
}: {
  growth: Growth
  stickers: Stickers
  /** 观点的钉住 / 沉睡住在记忆那份里（观点本质是带前缀的记忆）。 */
  memories: Memories
  /** 手机：出门卡放在记录最上面、跟着一起滚走（电脑的出门卡在左栏）。 */
  lead?: ReactNode
}) {
  const t = useTranslations('CharacterRoster.recent')
  const filters = useRecentFilters()
  const [filter, setFilter] = useState<RecentFilter>('all')
  const [pending, setPending] = useState<Pending>(null)
  const [editing, setEditing] = useState<CharacterJournalEntry | null>(null)
  const growth = data.growth
  const days = useMemo(
    () => (growth ? buildDiary(growth, stickers.stickers ?? [], filter) : []),
    [filter, growth, stickers.stickers],
  )
  /** 最新那一趟出门（当前筛出来的里面）：它的小结默认摊开，其余折着。 */
  const newestOuting = useMemo(() => {
    for (const day of days)
      for (const event of day.events) if (event.kind === 'outing') return event
    return null
  }, [days])
  const memoryById = useMemo<MemoryById>(
    () =>
      new Map<string, { memory: AssistantMemory; dormant: boolean }>([
        ...(memories.list?.remembered ?? []).map(
          (memory) => [memory.id, { memory, dormant: false }] as const,
        ),
        ...(memories.list?.dormant ?? []).map(
          (memory) => [memory.id, { memory, dormant: true }] as const,
        ),
      ]),
    [memories.list],
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

  const head = (
    <div className="flex shrink-0 flex-wrap items-center gap-3">
      <h2 className="text-2sm font-semibold">{t('activityTitle')}</h2>
      <LiquidSegmented
        items={filters}
        value={filter}
        onChange={setFilter}
        ariaLabel={t('filterLabel')}
        size="sm"
      />
    </div>
  )

  return (
    <section
      aria-label={t('activityTitle')}
      className="flex h-full flex-col gap-3"
      data-testid="character-recent-diary"
    >
      {lead ? null : head}
      <div className="min-h-0 flex-1 overflow-y-auto pb-12">
        {/* 手机：出门卡 → 筛选 → 记录，一起滚（屏幕矮，⛔ 两块钉在顶上吃掉一截）。 */}
        {lead ? (
          <div className="flex flex-col gap-4 pb-5">
            {lead}
            {head}
          </div>
        ) : null}
        {days.length === 0 ? (
          <p className="py-8 text-center text-2sm text-muted-foreground">
            {filter === 'all' ? t('diaryEmpty') : t('nothingHere')}
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
                        key={`${event.kind}:${event.at}:${event.kind === 'outing' ? (event.run?.id ?? '') : ''}`}
                        className="border-b border-border py-2.5 last:border-b-0"
                      >
                        <DiaryEventRow
                          event={event}
                          data={data}
                          stickers={stickers}
                          memories={memories}
                          memoryById={memoryById}
                          latest={event === newestOuting}
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
      </div>
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
  memories,
  memoryById,
  latest,
  onDelete,
}: {
  event: DiaryEvent
  data: Growth
  stickers: Stickers
  memories: Memories
  memoryById: MemoryById
  latest: boolean
  onDelete(pending: Pending): void
}) {
  const t = useTranslations('CharacterRoster.recent')
  const label = useFieldLabel()
  const [outingOpen, setOutingOpen] = useState(false)
  if (event.kind === 'outing')
    return (
      <OutingEvent
        findings={event.findings}
        run={event.run}
        open={outingOpen}
        latest={latest}
        onToggle={() => setOutingOpen((open) => !open)}
        onDelete={(finding) => onDelete({ kind: 'finding', id: finding.id })}
      />
    )
  if (event.kind === 'opinion') {
    const stored = memoryById.get(event.opinion.id)
    const settle = (write: Promise<{ ok: boolean }>) =>
      void write.then((result) => {
        if (!result.ok) toast.error(t('saveFailed'))
      })
    const memoryState: OpinionMemoryState | undefined = stored
      ? {
          pinned: stored.memory.pinned ?? false,
          dormant: stored.dormant,
          onPin: () =>
            settle(memories.setPinned(stored.memory.id, !stored.memory.pinned)),
          onWake: () => settle(memories.wake(stored.memory.id)),
        }
      : undefined
    return (
      <OpinionEvent
        opinion={event.opinion}
        memoryState={memoryState}
        onSave={async (text) => {
          const result = await data.editOpinion(event.opinion.id, text)
          if (!result.ok) toast.error(t('saveFailed'))
          return result.ok
        }}
        onDelete={() => onDelete({ kind: 'opinion', id: event.opinion.id })}
      />
    )
  }
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
