'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { CHARACTER_PERSONA_LIMITS } from '@/constants/cards/character-card'
import type { CharacterCardRecord, UpdateCharacterCardRequest } from '@/types'
import { Pin, Plus, X } from '@/components/icons'
import {
  draftFromCard,
  updateFromDraft,
  type CharacterCardDraft,
} from '@/hooks/cards/use-character-card-editor'
import { cn } from '@/lib/utils'

/**
 * **她在意的东西**（角色大项目第 ④ 步，owner 10-30）：详情左栏一排小签。
 *
 * ⭐ 你能加（「＋」原地输入，回车加）、能去（悬停出 ×）；她出门照着找（不全照，留一个给别的），
 *   回来也会自己加减 —— 右上图钉钉住，她就动不了。
 * ⭐ 空着照旧：她按设定自己想去看什么。
 */
export function CharacterInterests({
  card,
  onUpdate,
}: {
  card: CharacterCardRecord
  onUpdate(data: UpdateCharacterCardRequest): Promise<boolean>
}) {
  const t = useTranslations('CharacterRoster')
  const interests = card.persona?.interests ?? []
  const pinned = card.pinnedFields.includes('interests')
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const full = interests.length >= CHARACTER_PERSONA_LIMITS.interests

  const save = (patch: Partial<CharacterCardDraft>) =>
    onUpdate(updateFromDraft(card, { ...draftFromCard(card), ...patch }))

  const add = async () => {
    const item = text.trim()
    if (!item) {
      setAdding(false)
      return
    }
    if (await save({ interests: [...interests, item] })) setText('')
  }

  return (
    <section className="flex flex-col gap-2" data-testid="character-interests">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs text-muted-foreground">{t('interestsTitle')}</h2>
        <button
          type="button"
          aria-pressed={pinned}
          aria-label={
            pinned
              ? t('unpinField', { field: t('interestsTitle') })
              : t('pinField', { field: t('interestsTitle') })
          }
          title={pinned ? t('pinnedHint') : t('pinHint')}
          onClick={() =>
            void save({
              pinnedFields: pinned
                ? card.pinnedFields.filter((field) => field !== 'interests')
                : [...card.pinnedFields, 'interests'],
            })
          }
          className={cn(
            'grid size-7 place-items-center rounded-full text-muted-foreground transition-colors duration-fast ease-standard hover:tint-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
            pinned && 'text-foreground',
          )}
        >
          <Pin
            weight={pinned ? 'fill' : 'regular'}
            className="size-3.5"
            aria-hidden
          />
        </button>
      </div>
      {interests.length === 0 && !adding ? (
        <p className="text-2sm text-muted-foreground">{t('interestsEmpty')}</p>
      ) : null}
      <ul className="flex flex-wrap gap-1.5">
        {interests.map((item) => (
          <li
            key={item}
            className="group flex h-7 items-center gap-0.5 rounded-full bg-muted pr-1 pl-3 text-2sm"
          >
            <span className="max-w-40 truncate">{item}</span>
            <button
              type="button"
              aria-label={t('interestsRemove', { item })}
              onClick={() =>
                void save({
                  interests: interests.filter((other) => other !== item),
                })
              }
              className="grid size-5 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity duration-fast ease-standard group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
            >
              <X className="size-3" aria-hidden />
            </button>
          </li>
        ))}
        {adding ? (
          <li>
            <input
              autoFocus
              value={text}
              maxLength={CHARACTER_PERSONA_LIMITS.interestChars}
              placeholder={t('interestsPlaceholder')}
              aria-label={t('interestsAdd')}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void add()
                }
                if (event.key === 'Escape') {
                  setText('')
                  setAdding(false)
                }
              }}
              onBlur={() => {
                if (!text.trim()) setAdding(false)
              }}
              className="h-7 w-32 rounded-full bg-muted px-3 text-base outline-none focus-visible:shadow-focus lg:text-2sm"
            />
          </li>
        ) : full ? null : (
          <li>
            <button
              type="button"
              aria-label={t('interestsAdd')}
              title={t('interestsAdd')}
              onClick={() => setAdding(true)}
              className="grid size-7 place-items-center rounded-full border border-dashed border-border text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
            >
              <Plus className="size-3.5" aria-hidden />
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}
