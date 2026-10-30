'use client'

import Image from 'next/image'
import { useFormatter, useTranslations } from 'next-intl'

import type { CharacterCardRecord } from '@/types'
import type { CharacterRecentActivity } from '@/types/character-growth'
import {
  daysAgo,
  useFieldLabel,
} from '@/components/business/cards/CharacterRecent'
import { characterCoverUrl } from '@/lib/card-bus'

/**
 * 角色总览「最近」（角色大项目第 ① 步，样件 O4）：每位最近一件事一张浅灰卡，最多三张，
 * 点一张打开她。没有就整段不画（⛔ 空态）。
 */
export function CharacterRecentCards({
  rows,
  cards,
  onOpen,
}: {
  rows: readonly CharacterRecentActivity[]
  cards: readonly CharacterCardRecord[]
  onOpen(id: string): void
}) {
  const t = useTranslations('CharacterRoster')
  const format = useFormatter()
  const fieldLabel = useFieldLabel()
  const items = rows.flatMap((row) => {
    const card = cards.find((item) => item.id === row.cardId)
    return card ? [{ row, card }] : []
  })
  if (items.length === 0) return null

  const when = (iso: string) => {
    const ago = daysAgo(iso)
    return ago <= 0
      ? t('recent.today')
      : ago === 1
        ? t('recent.yesterday')
        : format.dateTime(new Date(iso), { month: 'numeric', day: 'numeric' })
  }
  const what = (row: CharacterRecentActivity) =>
    row.kind === 'journal'
      ? row.text
      : row.kind === 'finding'
        ? t('recentCards.sawFinding', { title: row.text })
        : t('recent.changedField', {
            field: row.fields.map(fieldLabel).join('、'),
          })
  const action = (row: CharacterRecentActivity) =>
    row.kind === 'journal'
      ? t('recent.wroteJournal')
      : row.kind === 'finding'
        ? t('recentCards.wentOut')
        : t('recentCards.changedSelf')

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t('recent.title')}</h2>
      <div className="grid max-w-225 grid-cols-2 gap-2.5 desk:grid-cols-3">
        {items.map(({ row, card }) => {
          const cover = characterCoverUrl(card)
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onOpen(card.id)}
              data-testid="character-recent-card"
              className="flex min-w-0 items-center gap-3 rounded-12 bg-muted px-3 py-2.5 text-left transition-transform duration-fast ease-standard hover:tint-hover active:scale-[.98] focus-visible:outline-none focus-visible:shadow-focus"
            >
              <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-fill-strong text-2sm font-semibold text-ink-2">
                {cover ? (
                  <Image
                    src={cover}
                    alt=""
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                ) : (
                  card.name.slice(0, 1)
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-2sm font-medium">
                  {[card.name, action(row), when(row.at)].join(' · ')}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {what(row)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
