'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  ArrowUpRight,
  Ban,
  ChevronRight,
  Home,
  Plus,
  X,
} from '@/components/icons'
import { CHARACTER_REVISION_SOURCE_IDS } from '@/constants/cards'
import { CHARACTER_STICKERS } from '@/constants/character-browse'
import { DURATION, EASE_STANDARD } from '@/constants/motion'
import type {
  CharacterFindingEntry,
  CharacterGrowth,
  CharacterJournalEntry,
  CharacterOpinionEntry,
  CharacterOutingRun,
  CharacterRevisionEntry,
} from '@/types/character-growth'
import type { CharacterStickerRecord } from '@/types/character-sticker'
import {
  OutingCard,
  SOURCE_KEYS,
  tokensToPoints,
  useOutingSourceLabel,
} from '@/components/business/cards/CharacterOutingCard'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { Spinner } from '@/components/ui/spinner'
import { useCharacterGrowth, useCharacterStickers } from '@/hooks/cards'
import { usePersonaSwitch } from '@/hooks/use-chat-persona'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

/**
 * **角色页右栏「最近」**（方向 B，`docs/references/pages/cards.md` §2.2–§2.3）：出门卡 →
 * 筛选切换条 → 按天分组的时间河。河里五种事件：出门（同一天带回的见闻折成一条）· 收了表情 ·
 * 观点 · 改动（能撤回）· 日记。筛到「表情」时整栏换成她的表情包格子（能上传一张）。
 *
 * ⭐ 一趟出门一条（第 ⑤ 步起有 `CharacterOuting`）：那一趟起止之间看到的见闻挂在它下面，一条没带回也
 *   照样有一条；有这张表之前的见闻按天折成一趟。单站失败不画（后台不记）。
 */

type Growth = ReturnType<typeof useCharacterGrowth>
type Stickers = ReturnType<typeof useCharacterStickers>
type Filter = 'all' | 'finding' | 'sticker' | 'opinion' | 'journal' | 'revision'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function dayKey(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function daysAgo(iso: string): number {
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  return Math.round(
    (startOfDay(new Date()) - startOfDay(new Date(iso))) / MS_PER_DAY,
  )
}

type RiverEvent =
  | {
      kind: 'outing'
      at: string
      findings: CharacterFindingEntry[]
      run: CharacterOutingRun | null
    }
  | { kind: 'stickers'; at: string; stickers: CharacterStickerRecord[] }
  | { kind: 'opinion'; at: string; opinion: CharacterOpinionEntry }
  | { kind: 'journal'; at: string; journal: CharacterJournalEntry }
  | { kind: 'revision'; at: string; revision: CharacterRevisionEntry }

/** 同一天的几样折成一条，时间 = 那天最早的那一样。 */
function byDay<T>(rows: readonly T[], at: (row: T) => string) {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = dayKey(at(row))
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()].map((items) => ({
    items,
    at: items.reduce(
      (earliest, row) => (at(row) < earliest ? at(row) : earliest),
      at(items[0]),
    ),
  }))
}

/**
 * 见闻按趟分：收了工的每一趟拿走它起止之间看到的（时间 = 收工那一刻）；剩下的（有出门表之前、
 * 或正在外面这一趟的）按天折成一趟，时间 = 那天最早的一样。
 */
export function groupOutings(growth: CharacterGrowth) {
  const left = new Set(growth.findings)
  const outings: {
    at: string
    findings: CharacterFindingEntry[]
    run: CharacterOutingRun | null
  }[] = growth.outing.recent.map((run) => {
    const end = run.endedAt ?? run.startedAt
    const findings = growth.findings.filter(
      (row) => row.seenAt >= run.startedAt && row.seenAt <= end,
    )
    for (const row of findings) left.delete(row)
    return { at: end, findings, run }
  })
  for (const { items, at } of byDay([...left], (row) => row.seenAt))
    outings.push({ at, findings: items, run: null })
  return outings
}

/**
 * 一天一组，组内新的在上；见闻一趟一条（`groupOutings`）。她逛来的表情（⛔ 你上传的）只在「全部」
 * 里按天出一条「收了 N 张表情」。
 */
function buildRiver(
  growth: CharacterGrowth,
  filter: Filter,
  stickers: readonly CharacterStickerRecord[],
) {
  const show = (kind: Exclude<Filter, 'all'>) =>
    filter === 'all' || filter === kind
  const events: RiverEvent[] = []
  if (show('finding')) {
    for (const outing of groupOutings(growth))
      events.push({ kind: 'outing', ...outing })
  }
  if (filter === 'all') {
    const found = stickers.filter((row) => !row.fromCreator)
    for (const { items, at } of byDay(found, (row) => row.createdAt)) {
      events.push({ kind: 'stickers', at, stickers: items })
    }
  }
  if (show('opinion')) {
    for (const opinion of growth.opinions) {
      events.push({ kind: 'opinion', at: opinion.createdAt, opinion })
    }
  }
  if (show('journal')) {
    for (const journal of growth.journals) {
      events.push({ kind: 'journal', at: journal.createdAt, journal })
    }
  }
  if (show('revision')) {
    for (const revision of growth.revisions) {
      events.push({ kind: 'revision', at: revision.createdAt, revision })
    }
  }
  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  const days: { key: string; at: string; events: RiverEvent[] }[] = []
  for (const event of events) {
    const key = dayKey(event.at)
    const last = days.at(-1)
    if (last?.key === key) last.events.push(event)
    else days.push({ key, at: event.at, events: [event] })
  }
  return days
}

export function DayLabel({ iso }: { iso: string }) {
  const t = useTranslations('CharacterRoster.recent')
  const format = useFormatter()
  const ago = daysAgo(iso)
  return (
    <h3 className="pt-1.5 text-2sm font-semibold">
      {ago <= 0
        ? t('today')
        : ago === 1
          ? t('yesterday')
          : format.dateTime(new Date(iso), { month: 'long', day: 'numeric' })}
    </h3>
  )
}

export function Clock({ iso }: { iso: string }) {
  const format = useFormatter()
  return (
    <time
      dateTime={iso}
      className="pt-0.5 font-mono text-xs text-muted-foreground tabular-nums"
    >
      {format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' })}
    </time>
  )
}

/** 格名 → 人话（与设置「她」那一页同一份词）。 */
export function useFieldLabel() {
  const t = useTranslations('AssistantSettings')
  return (field: string) =>
    t.has(`her.fields.${field}`) ? t(`her.fields.${field}`) : field
}

/** 一格的值摊成字：字照抄、列表一行一个、造型取那一句外观。 */
function formatValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value))
    return value
      .map((item) => (typeof item === 'string' ? item : formatValue(item)))
      .filter(Boolean)
      .join('\n')
  if (value && typeof value === 'object' && 'description' in value)
    return formatValue((value as { description: unknown }).description)
  return ''
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/* ── 河里的四种事件 ───────────────────────────────────────────────────── */

function Ghost({
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
      className="h-7 shrink-0 rounded-full px-2 text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground hover:tint-hover disabled:opacity-45"
    >
      {children}
    </button>
  )
}

export function OutingEvent({
  findings,
  run,
  open,
  onToggle,
  onDelete,
}: {
  findings: CharacterFindingEntry[]
  run: CharacterOutingRun | null
  open: boolean
  onToggle(): void
  onDelete(finding: CharacterFindingEntry): void
}) {
  const t = useTranslations('CharacterRoster.recent')
  const tOuting = useTranslations('CharacterRoster.recent.outing')
  const sourceLabel = useOutingSourceLabel()
  const where = run
    ? [
        ...(run.sources.length
          ? run.sources
          : findings.map((row) => row.source)),
        ...run.sites.map((site) => `site:${site}`),
      ]
    : findings.map((row) => row.source)
  const whereText = [...new Set(where)].map(sourceLabel).join(' · ')
  if (run) {
    const detail = [
      t('findingCount', { count: findings.length }),
      tOuting('runPoints', {
        count: Math.min(run.budgetPoints, tokensToPoints(run.usedTokens)),
      }),
      ...(run.endReason && run.endReason !== 'budget'
        ? [tOuting(`end.${run.endReason}`)]
        : []),
    ].join(' · ')
    const summary = (
      <>
        <span>
          {tOuting('runSummary', { where: whereText || tOuting('auto') })}
        </span>
        <span className="font-normal text-muted-foreground">· {detail}</span>
      </>
    )
    if (findings.length === 0)
      return (
        <p
          className="flex w-full flex-wrap items-center gap-x-2 py-0.5 text-2sm font-medium"
          data-testid="character-outing-run"
        >
          {summary}
        </p>
      )
    return (
      <OutingFindings
        summary={summary}
        findings={findings}
        open={open}
        onToggle={onToggle}
        onDelete={onDelete}
      />
    )
  }
  return (
    <OutingFindings
      summary={
        <>
          <span>{t('wentOut', { where: whereText })}</span>
          <span className="font-normal text-muted-foreground">
            · {t('findingCount', { count: findings.length })}
          </span>
        </>
      }
      findings={findings}
      open={open}
      onToggle={onToggle}
      onDelete={onDelete}
    />
  )
}

function OutingFindings({
  summary,
  findings,
  open,
  onToggle,
  onDelete,
}: {
  summary: ReactNode
  findings: CharacterFindingEntry[]
  open: boolean
  onToggle(): void
  onDelete(finding: CharacterFindingEntry): void
}) {
  const t = useTranslations('CharacterRoster.recent')
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-x-2 py-0.5 text-left text-2sm font-medium"
      >
        {summary}
        <ChevronRight
          aria-hidden
          className={cn(
            'size-3.5 text-muted-foreground transition-transform duration-base ease-standard motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
      </button>
      {open ? (
        <ul className="flex flex-col gap-3">
          {findings.map((finding) => (
            <li key={finding.id} className="flex flex-col gap-1">
              <p className="text-md leading-reading">{finding.note}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <a
                  href={finding.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={finding.title}
                  className="inline-flex min-w-0 items-center gap-1 hover:text-foreground"
                >
                  <span className="truncate">
                    {t(SOURCE_KEYS[finding.source])} · {hostOf(finding.url)}
                  </span>
                  <ArrowUpRight aria-hidden className="size-3 shrink-0" />
                </a>
                <span className="ml-auto">
                  <Ghost onClick={() => onDelete(finding)}>{t('delete')}</Ghost>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}

export function OpinionEvent({
  opinion,
  onSave,
  onDelete,
}: {
  opinion: CharacterOpinionEntry
  onSave(text: string): Promise<boolean>
  onDelete(): void
}) {
  const t = useTranslations('CharacterRoster.recent')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(opinion.text)
  const finish = async () => {
    const next = draft.trim()
    if (!next || next === opinion.text) {
      setDraft(opinion.text)
      setEditing(false)
      return
    }
    if (await onSave(next)) setEditing(false)
  }
  return (
    <>
      <p className="text-2sm font-medium">{t('newOpinion')}</p>
      <div className="flex items-center gap-2 rounded-12 bg-muted py-2 pl-3 pr-2">
        {editing ? (
          <input
            autoFocus
            value={draft}
            aria-label={t('editOpinion')}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void finish()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void finish()
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraft(opinion.text)
                setEditing(false)
              }
            }}
            className="min-w-0 flex-1 rounded-lg bg-background px-2 py-1 text-md leading-reading outline-none focus-visible:shadow-focus"
          />
        ) : (
          <p className="flex-1 text-md leading-reading">
            {t('opinionText', { text: opinion.text })}
          </p>
        )}
        {editing ? null : (
          <>
            <Ghost onClick={() => setEditing(true)}>{t('edit')}</Ghost>
            <Ghost onClick={onDelete}>{t('delete')}</Ghost>
          </>
        )}
      </div>
    </>
  )
}

export function RevisionEvent({
  revision,
  reverting,
  onRevert,
}: {
  revision: CharacterRevisionEntry
  reverting: boolean
  onRevert(): void
}) {
  const t = useTranslations('CharacterRoster.recent')
  const label = useFieldLabel()
  const reverted = revision.revertedAt !== null
  const why =
    revision.reason ??
    (revision.source === CHARACTER_REVISION_SOURCE_IDS.chat
      ? t('fromChat')
      : null)
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 text-2sm">
        <span className="font-medium">
          {t('changedField', {
            field: revision.fields.map(label).join('、'),
          })}
        </span>
        {why ? (
          <span className="text-xs text-muted-foreground">{why}</span>
        ) : null}
        <span className="ml-auto">
          {reverted ? (
            <span className="px-2 text-xs text-muted-foreground">
              {t('reverted')}
            </span>
          ) : (
            <Ghost disabled={reverting} onClick={onRevert}>
              {t('revert')}
            </Ghost>
          )}
        </span>
      </div>
      <RevisionDiff revision={revision} />
    </>
  )
}

/** 一条改动的改前 / 改后（撤回过的反着划）。 */
export function RevisionDiff({
  revision,
}: {
  revision: CharacterRevisionEntry
}) {
  const t = useTranslations('CharacterRoster.recent')
  const reverted = revision.revertedAt !== null
  return (
    <div className="flex flex-col gap-1.5">
      {revision.fields.map((field) => (
        <div
          key={field}
          className="flex flex-col gap-0.5 text-md leading-reading"
        >
          <span
            className={cn(
              'whitespace-pre-wrap',
              reverted ? '' : 'text-muted-foreground line-through',
            )}
          >
            {formatValue(revision.before[field]) || t('emptyValue')}
          </span>
          <span
            className={cn(
              'whitespace-pre-wrap',
              reverted && 'text-muted-foreground line-through',
            )}
          >
            {formatValue(revision.after[field]) || t('emptyValue')}
          </span>
        </div>
      ))}
    </div>
  )
}

/** 一格表情：点一下拉黑 / 恢复；悬停（触屏常显）右上角 × 删掉。 */
export function StickerTile({
  sticker,
  size,
  onToggle,
  onDelete,
}: {
  sticker: CharacterStickerRecord
  size: 'row' | 'grid'
  onToggle(): void
  onDelete(): void
}) {
  const t = useTranslations('CharacterRoster.recent')
  return (
    <div
      className={cn(
        'group relative shrink-0',
        size === 'row' ? 'size-18' : 'aspect-square w-full',
      )}
    >
      <button
        type="button"
        aria-pressed={sticker.isBlocked}
        aria-label={sticker.isBlocked ? t('unblockSticker') : t('blockSticker')}
        title={sticker.whenToUse}
        onClick={onToggle}
        className="relative grid size-full place-items-center overflow-hidden rounded-12 bg-muted transition-transform duration-fast active:scale-[.98] focus-visible:shadow-focus focus-visible:outline-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sticker.url}
          alt=""
          loading="lazy"
          className={cn(
            'size-full object-contain transition-opacity duration-fast',
            sticker.isBlocked && 'opacity-35',
          )}
        />
        {sticker.isBlocked ? (
          <Ban aria-hidden className="absolute size-9 text-foreground" />
        ) : null}
      </button>
      <button
        type="button"
        aria-label={t('deleteSticker')}
        onClick={onDelete}
        className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-raise text-ink-2 opacity-0 shadow-soft transition-opacity duration-fast group-hover:opacity-100 focus-visible:opacity-100 coarse:opacity-100"
      >
        <X aria-hidden className="size-3" />
      </button>
    </div>
  )
}

function StickerGrid({
  stickers,
  onToggle,
  onDelete,
}: {
  stickers: Stickers
  onToggle(sticker: CharacterStickerRecord): void
  onDelete(sticker: CharacterStickerRecord): void
}) {
  const t = useTranslations('CharacterRoster.recent')
  const [uploading, setUploading] = useState(false)
  const rows = stickers.stickers
  if (!rows)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="text-muted-foreground" />
      </div>
    )
  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    const result = await stickers.upload(file)
    setUploading(false)
    if (!result.ok)
      toast.error(
        t(
          result.reason === 'tooLarge'
            ? 'uploadTooLarge'
            : result.reason === 'notAnImage'
              ? 'uploadNotImage'
              : 'uploadFailed',
        ),
      )
  }
  return (
    <section aria-label={t('stickersTitle')} className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-2sm font-semibold">{t('stickersTitle')}</h3>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {rows.length} / {CHARACTER_STICKERS.perCard}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {t('stickerHint')}
        </span>
      </div>
      <ul className="grid grid-cols-4 gap-2 md:grid-cols-6">
        <li>
          <label
            className={cn(
              'grid aspect-square w-full cursor-pointer place-items-center rounded-12 border border-dashed border-input text-ink-2 transition-colors duration-fast hover:tint-hover focus-within:shadow-focus',
              uploading && 'pointer-events-none opacity-45',
            )}
          >
            <span className="flex flex-col items-center gap-1 text-xs">
              {uploading ? (
                <Spinner size="sm" />
              ) : (
                <Plus aria-hidden className="size-4" />
              )}
              {t('uploadSticker')}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={(event) => {
                void upload(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </label>
        </li>
        {rows.map((sticker) => (
          <li key={sticker.id}>
            <StickerTile
              sticker={sticker}
              size="grid"
              onToggle={() => onToggle(sticker)}
              onDelete={() => onDelete(sticker)}
            />
          </li>
        ))}
      </ul>
      {rows.length === 0 ? (
        <p className="text-2sm text-muted-foreground">{t('stickersEmpty')}</p>
      ) : null}
    </section>
  )
}

/* ── 整栏 ───────────────────────────────────────────────────────────── */

type Pending =
  | { kind: 'finding'; id: string }
  | { kind: 'opinion'; id: string }
  | { kind: 'sticker'; id: string }
  | null

export function CharacterRecent({
  growth: data,
  stickers,
  header,
  reducedMotion,
  showTitle = true,
}: {
  growth: Growth
  stickers: Stickers
  /** 栏头右边（电脑是「和她聊」；手机由外面另放）。 */
  header?: ReactNode
  reducedMotion: boolean
  /** 手机顶上的切换条已经写着「最近」，⛔ 再来一行栏头。 */
  showTitle?: boolean
}) {
  const t = useTranslations('CharacterRoster.recent')
  const [filter, setFilter] = useState<Filter>('all')
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const [pending, setPending] = useState<Pending>(null)
  const growth = data.growth
  const days = useMemo(
    () => (growth ? buildRiver(growth, filter, stickers.stickers ?? []) : []),
    [filter, growth, stickers.stickers],
  )
  /** 最新那一趟出门默认展开，其余折着（owner 2026-10-28）。 */
  const newestOuting = useMemo(() => {
    for (const day of days) {
      const outing = day.events.find((event) => event.kind === 'outing')
      if (outing) return outing.at
    }
    return null
  }, [days])

  const confirmDelete = async () => {
    if (!pending) return
    const ok =
      pending.kind === 'finding'
        ? (await data.removeFinding(pending.id)).ok
        : pending.kind === 'opinion'
          ? (await data.removeOpinion(pending.id)).ok
          : await stickers.remove(pending.id)
    setPending(null)
    if (!ok) toast.error(t('deleteFailed'))
  }

  const toggleSticker = (sticker: CharacterStickerRecord) =>
    void stickers.setBlocked(sticker.id, !sticker.isBlocked).then((ok) => {
      if (!ok) toast.error(t('saveFailed'))
    })
  const askDeleteSticker = (sticker: CharacterStickerRecord) =>
    setPending({ kind: 'sticker', id: sticker.id })

  const filters = [
    { value: 'all', label: t('filterAll') },
    { value: 'finding', label: t('filterFindings') },
    { value: 'sticker', label: t('filterStickers') },
    { value: 'opinion', label: t('filterOpinions') },
    { value: 'journal', label: t('filterJournal') },
    { value: 'revision', label: t('filterRevisions') },
  ] as const

  const neverOut =
    growth !== null &&
    !growth.outing.running &&
    growth.outing.recent.length === 0 &&
    growth.findings.length === 0

  return (
    <section aria-label={t('title')} className="flex min-h-0 flex-1 flex-col">
      {showTitle ? (
        <header className="flex h-13 shrink-0 items-center gap-2 px-6">
          <h2 className="text-sm font-semibold">{t('title')}</h2>
          <div className="ml-auto flex items-center gap-2">{header}</div>
        </header>
      ) : null}
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-4 pb-12 md:px-6 desk:px-10',
        )}
      >
        <div className="mx-auto flex max-w-190 flex-col gap-4">
          {data.isLoading && !growth ? (
            <div className="flex justify-center py-16">
              <Spinner className="text-muted-foreground" />
            </div>
          ) : !growth ? (
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
          ) : (
            <>
              <OutingCard growth={data} />
              {neverOut ? (
                <EmptyState
                  icon={<Home aria-hidden />}
                  title={t('neverOutTitle')}
                  description={t('neverOutHint')}
                  className="mx-0 max-w-none"
                />
              ) : null}
              <LiquidSegmented
                items={filters}
                value={filter}
                onChange={setFilter}
                ariaLabel={t('filterLabel')}
                size="row"
                className="self-start"
              />
              {filter === 'sticker' ? (
                <StickerGrid
                  stickers={stickers}
                  onToggle={toggleSticker}
                  onDelete={askDeleteSticker}
                />
              ) : days.length === 0 ? (
                <p className="py-8 text-center text-2sm text-muted-foreground">
                  {t('nothingHere')}
                </p>
              ) : (
                days.map((day) => (
                  <div key={day.key} className="flex flex-col gap-3">
                    <DayLabel iso={day.at} />
                    {day.events.map((event) => {
                      const key = `${event.kind}:${event.at}`
                      const open =
                        event.kind === 'outing'
                          ? (opened[event.at] ?? event.at === newestOuting)
                          : true
                      return (
                        <motion.div
                          key={key}
                          layout={reducedMotion ? false : 'position'}
                          transition={{
                            duration: DURATION.base,
                            ease: EASE_STANDARD,
                          }}
                          className="flex gap-3"
                        >
                          <span className="w-14 shrink-0">
                            <Clock iso={event.at} />
                          </span>
                          <div className="flex min-w-0 flex-1 flex-col gap-2.5 border-b border-border pb-4">
                            {event.kind === 'outing' ? (
                              <OutingEvent
                                findings={event.findings}
                                run={event.run}
                                open={open}
                                onToggle={() =>
                                  setOpened((prev) => ({
                                    ...prev,
                                    [event.at]: !open,
                                  }))
                                }
                                onDelete={(finding) =>
                                  setPending({
                                    kind: 'finding',
                                    id: finding.id,
                                  })
                                }
                              />
                            ) : event.kind === 'stickers' ? (
                              <>
                                <p className="text-2sm font-medium">
                                  {t('gotStickers', {
                                    count: event.stickers.length,
                                  })}
                                </p>
                                <div className="flex flex-wrap items-center gap-2">
                                  {event.stickers.map((sticker) => (
                                    <StickerTile
                                      key={sticker.id}
                                      sticker={sticker}
                                      size="row"
                                      onToggle={() => toggleSticker(sticker)}
                                      onDelete={() => askDeleteSticker(sticker)}
                                    />
                                  ))}
                                  <span className="text-xs text-muted-foreground">
                                    {t('stickerHint')}
                                  </span>
                                </div>
                              </>
                            ) : event.kind === 'opinion' ? (
                              <OpinionEvent
                                opinion={event.opinion}
                                onSave={async (text) => {
                                  const result = await data.editOpinion(
                                    event.opinion.id,
                                    text,
                                  )
                                  if (!result.ok) toast.error(t('saveFailed'))
                                  return result.ok
                                }}
                                onDelete={() =>
                                  setPending({
                                    kind: 'opinion',
                                    id: event.opinion.id,
                                  })
                                }
                              />
                            ) : event.kind === 'revision' ? (
                              <RevisionEvent
                                revision={event.revision}
                                reverting={
                                  data.revertingId === event.revision.id
                                }
                                onRevert={() =>
                                  void data.revert(event.revision.id)
                                }
                              />
                            ) : (
                              <>
                                <p className="text-2sm font-medium">
                                  {t('wroteJournal')}
                                </p>
                                <p className="whitespace-pre-wrap text-md leading-reading">
                                  {event.journal.text}
                                </p>
                              </>
                            )}
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={
          pending?.kind === 'opinion'
            ? t('deleteOpinionTitle')
            : pending?.kind === 'sticker'
              ? t('deleteStickerTitle')
              : t('deleteFindingTitle')
        }
        description={
          pending?.kind === 'opinion'
            ? t('deleteOpinionBody')
            : pending?.kind === 'sticker'
              ? t('deleteStickerBody')
              : t('deleteFindingBody')
        }
        cancelLabel={t('cancel')}
        confirmLabel={t('delete')}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  )
}

/**
 * **详情两栏**（方向 B）：左「她」（`body`，原样的详情正文）· 右「最近」。768 起并排（平板左栏 300，
 * 1024 起 380）；手机顶上一条「她 · 最近」切换，默认「最近」。
 */
export function CharacterDetailSplit({
  cardId,
  body,
}: {
  cardId: string
  body: ReactNode
}) {
  const t = useTranslations('CharacterRoster.recent')
  const growth = useCharacterGrowth(cardId)
  const stickers = useCharacterStickers(cardId)
  const personaSwitch = usePersonaSwitch()
  const isMobile = useIsMobile()
  const reducedMotion = useReducedMotion() ?? false
  const [pane, setPane] = useState<'her' | 'recent'>('recent')
  const chat = (
    <button
      type="button"
      onClick={() => void personaSwitch.switchTo(cardId, { goHome: true })}
      className={cn(
        'rounded-full bg-primary px-4 font-semibold text-primary-foreground transition-transform duration-fast hover:tint-hover active:scale-[.98]',
        isMobile ? 'h-12 w-full text-md' : 'h-8 text-2sm',
      )}
    >
      {t('chatWith')}
    </button>
  )

  if (isMobile) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 justify-center px-4 pb-2">
          <LiquidSegmented
            items={[
              { value: 'her', label: t('paneHer') },
              { value: 'recent', label: t('title') },
            ]}
            value={pane}
            onChange={setPane}
            ariaLabel={t('paneLabel')}
            size="md"
            fill
            className="w-50"
          />
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {pane === 'her' ? (
            body
          ) : (
            <CharacterRecent
              growth={growth}
              stickers={stickers}
              reducedMotion={reducedMotion}
              showTitle={false}
            />
          )}
        </div>
        {/* 详情铺到底栏后面：「和她聊」那一条让开底栏。 */}
        <div className="shrink-0 px-4 pb-mobile-tabbar pt-2">{chat}</div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <div className="h-full w-75 shrink-0 border-r border-border desk:w-95">
        {body}
      </div>
      <CharacterRecent
        growth={growth}
        stickers={stickers}
        reducedMotion={reducedMotion}
        header={chat}
      />
    </div>
  )
}
