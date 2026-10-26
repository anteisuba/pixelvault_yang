'use client'

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ChevronDown, Plus } from '@/components/icons'

import { CHARACTER_REVISION_SOURCE_IDS } from '@/constants/cards'
import { ROUTES } from '@/constants/routes'
import { useCharacterGrowth } from '@/hooks/cards'
import { useChatCharacters } from '@/hooks/use-chat-characters'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import type {
  CharacterJournalEntry,
  CharacterRevisionEntry,
} from '@/types/character-growth'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * 「她」那一页（10-26「更像真人」C 第 3 步，owner 定放助手设置里第四页）。
 *
 * 选一个角色 → 她的日记（最新一篇摊开，更早的点开）→「她改了什么」：一行摘要
 * 「哪一格 · 新内容」+ 她的理由，点开看改前改后（owner 10-26 选 A），每条能撤回；
 * 撤回过的变灰写「已撤回」。
 */

const MS_PER_DAY = 86_400_000

export function AssistantHerPane() {
  const t = useTranslations('AssistantSettings')
  const { characters, isLoading } = useChatCharacters(true)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const current =
    characters.find((option) => option.character.id === pickedId) ??
    characters[0] ??
    null

  if (isLoading) return null
  if (!current)
    return (
      <EmptyState
        icon={<Plus aria-hidden />}
        title={t('her.noCharacters')}
        description={t('her.noCharactersHint')}
        action={
          <Button asChild size="sm" className="rounded-full">
            <Link href={ROUTES.CARDS}>{t('her.createCharacter')}</Link>
          </Button>
        }
      />
    )

  return (
    <div className="flex flex-col gap-6">
      <DropdownMenu>
        <DropdownMenuTrigger
          data-testid="assistant-her-picker"
          className="flex w-max items-center gap-2 rounded-lg px-1.5 py-1 text-md font-semibold transition-colors duration-fast hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Avatar url={current.avatarUrl} />
          {current.character.name}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup
            value={current.character.id}
            onValueChange={setPickedId}
          >
            {characters.map((option) => (
              <DropdownMenuRadioItem
                key={option.character.id}
                value={option.character.id}
                className="gap-2"
              >
                <Avatar url={option.avatarUrl} />
                {option.character.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <HerGrowth key={current.character.id} cardId={current.character.id} />
    </div>
  )
}

function Avatar({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="size-6 rounded-full object-cover" />
  ) : (
    <span className="size-6 rounded-full bg-muted" aria-hidden />
  )
}

function HerGrowth({ cardId }: { cardId: string }) {
  const t = useTranslations('AssistantSettings')
  const { growth, isLoading, error, revertingId, revert } =
    useCharacterGrowth(cardId)

  if (!growth)
    return isLoading ? null : error ? (
      <p role="alert" className="text-2sm text-status-risk">
        {t('her.failed')}
      </p>
    ) : null

  return (
    <>
      <section aria-label={t('her.journal')} className="flex flex-col gap-2.5">
        <h3 className="text-2sm font-medium text-muted-foreground">
          {t('her.journal')}
        </h3>
        <Journal entries={growth.journals} />
      </section>
      <section aria-label={t('her.revisions')} className="flex flex-col gap-1">
        <h3 className="pb-1.5 text-2sm font-medium text-muted-foreground">
          {t('her.revisions')}
        </h3>
        {error ? (
          <p role="alert" className="text-2sm text-status-risk">
            {t('her.revertFailed')}
          </p>
        ) : null}
        {growth.revisions.length === 0 ? (
          <p className="text-2sm text-muted-foreground">
            {t('her.noRevisions')}
          </p>
        ) : (
          <ul className="flex flex-col">
            {growth.revisions.map((revision) => (
              <RevisionRow
                key={revision.id}
                revision={revision}
                reverting={revertingId === revision.id}
                onRevert={() => void revert(revision.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function Journal({ entries }: { entries: CharacterJournalEntry[] }) {
  const t = useTranslations('AssistantSettings')
  const [open, setOpen] = useState(false)
  const [latest, ...earlier] = entries
  if (!latest)
    return (
      <p className="text-2sm text-muted-foreground">{t('her.noJournal')}</p>
    )
  return (
    <div className="flex flex-col gap-2">
      {(open ? entries : [latest]).map((entry) => (
        <div
          key={entry.id}
          className="rounded-lg bg-muted/60 px-3 py-2.5 text-md leading-6"
        >
          <span className="mr-2 text-2sm text-muted-foreground tabular-nums">
            <When iso={entry.createdAt} />
          </span>
          {entry.text}
        </div>
      ))}
      {earlier.length > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="w-max text-2sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {open
            ? t('her.journalCollapse')
            : t('her.journalEarlier', { count: earlier.length })}
        </button>
      ) : null}
    </div>
  )
}

function RevisionRow({
  revision,
  reverting,
  onRevert,
}: {
  revision: CharacterRevisionEntry
  reverting: boolean
  onRevert(): void
}) {
  const t = useTranslations('AssistantSettings')
  const [open, setOpen] = useState(false)
  const label = useFieldLabel()
  const reverted = revision.revertedAt !== null
  const first = revision.fields[0] ?? ''
  const summary = formatValue(revision.after[first]) || t('her.emptyValue')
  const fromChat = revision.source === CHARACTER_REVISION_SOURCE_IDS.chat

  return (
    <li
      data-testid="assistant-her-revision"
      className={cn(
        'border-b border-border/60 py-2.5 last:border-b-0',
        reverted && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-md">
            <span className="font-semibold">
              {revision.fields.map(label).join('、')}
            </span>
            <span className="text-muted-foreground"> · </span>
            {summary}
          </span>
          {revision.reason || fromChat ? (
            <span className="mt-0.5 block text-2sm text-muted-foreground">
              {revision.reason
                ? t('her.reason', { reason: revision.reason })
                : t('her.fromChat')}
            </span>
          ) : null}
        </button>
        <span className="flex shrink-0 items-center gap-1.5 text-2sm text-muted-foreground tabular-nums">
          <When iso={revision.createdAt} />
          <span aria-hidden>·</span>
          {reverted ? (
            t('her.reverted')
          ) : (
            <button
              type="button"
              disabled={reverting}
              onClick={onRevert}
              data-testid="assistant-her-revert"
              className="text-foreground underline underline-offset-4 disabled:opacity-50"
            >
              {t('her.revert')}
            </button>
          )}
        </span>
      </div>
      {open ? (
        <div className="mt-2 flex flex-col gap-2 rounded-lg bg-muted/60 px-3 py-2.5">
          {revision.fields.map((field) => (
            <div key={field} className="flex flex-col gap-0.5 text-2sm">
              {revision.fields.length > 1 ? (
                <span className="font-medium">{label(field)}</span>
              ) : null}
              <span className="whitespace-pre-wrap text-muted-foreground line-through">
                {formatValue(revision.before[field]) || t('her.emptyValue')}
              </span>
              <span className="whitespace-pre-wrap">
                {formatValue(revision.after[field]) || t('her.emptyValue')}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  )
}

/** 格名 → 人话；没翻译的格照原名。 */
function useFieldLabel() {
  const t = useTranslations('AssistantSettings')
  return (field: string) =>
    t.has(`her.fields.${field}`) ? t(`her.fields.${field}`) : field
}

/** 一格的值摊成字：字照抄、列表一行一个、造型取那一句外观。 */
function formatValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value))
    return value
      .map((item) =>
        typeof item === 'string'
          ? item
          : item && typeof item === 'object'
            ? Object.values(item)
                .filter((part) => typeof part === 'string')
                .join(' / ')
            : '',
      )
      .filter(Boolean)
      .join('\n')
  if (value && typeof value === 'object' && 'description' in value)
    return formatValue((value as { description: unknown }).description)
  return ''
}

/** 今天写时间、昨天写「昨天」、更早写月日（与记忆页同一判法：按日差）。 */
function When({ iso }: { iso: string }) {
  const t = useTranslations('AssistantSettings')
  const format = useFormatter()
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / MS_PER_DAY,
  )
  return (
    <time dateTime={iso}>
      {days <= 0
        ? format.dateTime(date, { hour: '2-digit', minute: '2-digit' })
        : days === 1
          ? t('memory.yesterday')
          : format.dateTime(date, { month: '2-digit', day: '2-digit' })}
    </time>
  )
}
