'use client'

import { useState, type ReactNode } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { ArrowUpRight, Ban, ChevronRight, X } from '@/components/icons'
import type {
  CharacterFindingEntry,
  CharacterGrowth,
  CharacterOpinionEntry,
  CharacterOutingRun,
  CharacterRevisionEntry,
} from '@/types/character-growth'
import type { CharacterStickerRecord } from '@/types/character-sticker'
import {
  SOURCE_KEYS,
  tokensToPoints,
  useOutingSourceLabel,
} from '@/features/cards/components/CharacterOutingCard'
import {
  OutingDigest,
  digestLinesOf,
  useSiteName,
} from '@/features/cards/components/CharacterOutingDigest'
import { cn } from '@/lib/utils'

/**
 * **「小房间」活动记录的零件**（`docs/references/pages/cards.md` §2.2–§2.3）：筛选项、按天 / 按趟分组、
 * 时间与日期标签，以及一条条事件（出门 · 观点 · 改动 · 表情）。整栏由 `CharacterRecentDiary` 拼，
 * 电脑与手机同一份（11-13 起手机也用它，旧的手机整栏已删）。
 *
 * ⭐ 一趟出门一条（第 ⑤ 步起有 `CharacterOuting`）：那一趟起止之间看到的见闻挂在它下面，一条没带回也
 *   照样有一条；有这张表之前的见闻按天折成一趟。单站失败不画（后台不记）。
 * ⭐ 话题那趟（`run.topic`）：标题写「查了「话题」」；回来写了带出处的小结就摆在标题下面（最新一趟默认摊开），
 *   见闻折在小结底下；没小结照旧。
 */

export type RecentFilter =
  | 'all'
  | 'finding'
  | 'opinion'
  | 'journal'
  | 'revision'
  | 'sticker'

/** 小房间的筛选项（顺序与文案电脑 / 手机共用）。 */
export function useRecentFilters() {
  const t = useTranslations('CharacterRoster.recent')
  return [
    { value: 'all', label: t('filterAll') },
    { value: 'finding', label: t('filterFindings') },
    { value: 'opinion', label: t('filterOpinions') },
    { value: 'journal', label: t('filterJournal') },
    { value: 'revision', label: t('filterRevisions') },
    { value: 'sticker', label: t('filterStickers') },
  ] as const satisfies readonly { value: RecentFilter; label: string }[]
}

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
  latest = false,
}: {
  findings: CharacterFindingEntry[]
  run: CharacterOutingRun | null
  /** 见闻那一串是否摊开（有小结的趟默认折着，调用方自己定默认值）。 */
  open: boolean
  onToggle(): void
  onDelete(finding: CharacterFindingEntry): void
  /** 最新一趟：它的小结默认摊开，其余折着。 */
  latest?: boolean
}) {
  const t = useTranslations('CharacterRoster.recent')
  const tOuting = useTranslations('CharacterRoster.recent.outing')
  const sourceLabel = useOutingSourceLabel()
  const siteName = useSiteName()
  const [digestToggled, setDigestToggled] = useState<boolean | null>(null)
  const topic = run?.topic ?? null
  const digestLines = digestLinesOf(run)
  const digestOpen = digestToggled ?? latest
  const where = run
    ? [
        ...(run.sources.length
          ? run.sources
          : findings.map((row) => row.source)),
        ...run.sites.map((site) => `site:${site}`),
      ]
    : findings.map((row) => row.source)
  // 话题那趟的网页站写名册里的站名（萌娘百科），平时的网址照旧写域名。
  const whereText = [...new Set(where)]
    .map((id) =>
      topic && id.startsWith('site:')
        ? siteName(id.slice('site:'.length))
        : sourceLabel(id),
    )
    .join(' · ')
  if (run) {
    const detail = [
      ...(topic && whereText ? [whereText] : []),
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
          {topic
            ? tOuting('topicTitle', { topic: topic.text })
            : tOuting('runSummary', { where: whereText || tOuting('auto') })}
        </span>
        <span className="font-normal text-muted-foreground">· {detail}</span>
      </>
    )
    if (digestLines.length > 0)
      return (
        <>
          <button
            type="button"
            aria-expanded={digestOpen}
            onClick={() => setDigestToggled(!digestOpen)}
            className="touch-target-y flex w-full flex-wrap items-center gap-x-2 py-0.5 text-left text-2sm font-medium"
          >
            {summary}
            <Chevron open={digestOpen} />
          </button>
          {digestOpen ? <OutingDigest lines={digestLines} /> : null}
          {findings.length > 0 ? (
            <FindingsFold
              label={t('findingCount', { count: findings.length })}
              findings={findings}
              open={open}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ) : null}
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

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      aria-hidden
      className={cn(
        'size-3.5 text-muted-foreground transition-transform duration-base ease-standard motion-reduce:transition-none',
        open && 'rotate-90',
      )}
    />
  )
}

/** 这一趟的见闻一条一条：她记下的话 + 来源链接 + 删除。 */
function FindingList({
  findings,
  onDelete,
}: {
  findings: CharacterFindingEntry[]
  onDelete(finding: CharacterFindingEntry): void
}) {
  const t = useTranslations('CharacterRoster.recent')
  return (
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
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="touch-target-y flex w-full flex-wrap items-center gap-x-2 py-0.5 text-left text-2sm font-medium"
      >
        {summary}
        <Chevron open={open} />
      </button>
      {open ? <FindingList findings={findings} onDelete={onDelete} /> : null}
    </>
  )
}

/** 有小结的那趟：小结下面一行「9 条见闻 ›」，点开才看她逐条记下的话。 */
function FindingsFold({
  label,
  findings,
  open,
  onToggle,
  onDelete,
}: {
  label: string
  findings: CharacterFindingEntry[]
  open: boolean
  onToggle(): void
  onDelete(finding: CharacterFindingEntry): void
}) {
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-fit items-center gap-1 py-0.5 text-left text-2sm text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
      >
        {label}
        <Chevron open={open} />
      </button>
      {open ? <FindingList findings={findings} onDelete={onDelete} /> : null}
    </>
  )
}

/**
 * 一条观点能不能钉住 / 唤醒：观点本质是她那份记忆里「观点：」开头的一条，钉住与沉睡住在记忆那边
 * （电脑详情传进来；手机没有记忆那份，不传 = 只有改 / 删）。
 */
export interface OpinionMemoryState {
  pinned: boolean
  /** 挤出去或过期睡着了：只能唤醒、不能钉。 */
  dormant: boolean
  onPin(): void
  onWake(): void
}

export function OpinionEvent({
  opinion,
  memoryState,
  onSave,
  onDelete,
}: {
  opinion: CharacterOpinionEntry
  memoryState?: OpinionMemoryState
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
            {memoryState?.dormant ? (
              <>
                <span className="text-xs text-muted-foreground">
                  {t('opinionAsleep')}
                </span>
                <Ghost onClick={memoryState.onWake}>{t('wake')}</Ghost>
              </>
            ) : memoryState ? (
              <>
                {memoryState.pinned ? (
                  <span className="text-xs text-muted-foreground">
                    {t('pinned')}
                  </span>
                ) : null}
                <Ghost onClick={memoryState.onPin}>
                  {t(memoryState.pinned ? 'unpin' : 'pin')}
                </Ghost>
              </>
            ) : null}
            <Ghost onClick={() => setEditing(true)}>{t('edit')}</Ghost>
            <Ghost onClick={onDelete}>{t('delete')}</Ghost>
          </>
        )}
      </div>
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
