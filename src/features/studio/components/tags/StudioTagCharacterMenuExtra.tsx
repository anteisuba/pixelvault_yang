'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { CHARACTER_CARD } from '@/constants/cards/character-card'
import type { NovelAiCharacter } from '@/types/novelai'
import { cn } from '@/lib/utils'
import { lookLabel } from '@/lib/character-looks'
import { parseTagChips, serializeTagChips } from '@/lib/tag-composer'
import { useCharacterCards } from '@/features/cards/hooks'
import { lookTagsText, seedLabel } from './StudioTagAddCharacter'

/** 两份标签原文是不是同一串（空格、空格子、权重写法不算差别）。 */
export function sameTags(a: string, b: string) {
  return (
    serializeTagChips(parseTagChips(a)) === serializeTagChips(parseTagChips(b))
  )
}

/** 台上那一位当前的标签 → 造型上存的那一组（一格一个，带权重写法）。 */
function promptToLookTags(prompt: string) {
  return parseTagChips(prompt)
    .map((chip) => serializeTagChips([chip]))
    .filter(
      (tag) =>
        tag.length > 0 && tag.length <= CHARACTER_CARD.LOOK_TAG_MAX_LENGTH,
    )
    .slice(0, CHARACTER_CARD.MAX_LOOK_TAGS)
}

const itemClass =
  'flex h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-2xs transition-colors duration-fast ease-standard hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

/**
 * 角色页签 ⋯ 里排在「这次出场」前面的几项（owner 11-01 定，稿 tag-studio-ui/q1b 第 3 格）：
 * 改名 · 换造型 · 更新到「造型」（改过才有）· 存成新造型。后三项只在这一位是从
 * 「我的角色」拷进来的时候有。
 */
export function StudioTagCharacterMenuExtra({
  index,
  character,
  fallbackName,
  onUpdate,
}: {
  index: number
  character: NovelAiCharacter
  /** 没起名时页签上的「角色 N」。 */
  fallbackName: string
  onUpdate: (index: number, patch: Partial<NovelAiCharacter>) => void
}) {
  const t = useTranslations('StudioTags.characterMenu')
  const tLooks = useTranslations('CharacterLooks')
  const { findCard, createLook, updateLook } = useCharacterCards()
  const [name, setName] = useState(character.label ?? '')
  const [newLook, setNewLook] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const origin = character.origin
  const card = origin ? findCard(origin.cardId) : null
  const look = card?.looks.find((item) => item.id === origin?.lookId) ?? null
  const dirty = origin ? !sameTags(character.prompt, origin.tags) : false

  const commitName = () => {
    const next = name.trim()
    if (next !== (character.label ?? ''))
      onUpdate(index, { label: next || undefined })
  }

  const updateToLook = async () => {
    if (!card || !look || busy) return
    setBusy(true)
    const ok = await updateLook(card.id, look.id, {
      tags: promptToLookTags(character.prompt),
    })
    setBusy(false)
    if (ok && origin)
      onUpdate(index, { origin: { ...origin, tags: character.prompt } })
  }

  const saveAsNewLook = async () => {
    const label = newLook?.trim()
    if (!card || !label || busy) return
    setBusy(true)
    const id = await createLook(card.id, { label })
    const ok = id
      ? await updateLook(card.id, id, {
          tags: promptToLookTags(character.prompt),
        })
      : false
    setBusy(false)
    if (!id || !ok) return
    setNewLook(null)
    onUpdate(index, {
      label: `${card.name} · ${label}`,
      origin: { cardId: card.id, lookId: id, tags: character.prompt },
    })
  }

  return (
    <>
      <label className="flex flex-col gap-1 px-2 pb-1">
        <span className="text-3xs text-muted-foreground">{t('rename')}</span>
        <input
          value={name}
          maxLength={60}
          placeholder={fallbackName}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitName()
            }
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {card && card.looks.length > 1 ? (
        <div className="flex flex-col gap-0.5">
          <span className="px-2 pt-1 text-3xs text-muted-foreground">
            {t('swapLook')}
          </span>
          <div className="flex flex-wrap gap-1 px-2 pb-1">
            {card.looks.map((item) => {
              const label = lookLabel(item, card.looks, tLooks)
              const on = item.id === origin?.lookId
              return (
                <button
                  key={item.id}
                  type="button"
                  data-close-menu
                  disabled={on}
                  onClick={() => {
                    const tags = lookTagsText(item)
                    onUpdate(index, {
                      prompt: tags,
                      label: seedLabel(card, item, label),
                      origin: { cardId: card.id, lookId: item.id, tags },
                    })
                  }}
                  className={cn(
                    'h-7 rounded-full border border-border px-2.5 text-2xs transition-colors duration-fast ease-standard hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on &&
                      'border-foreground bg-foreground text-background hover:bg-foreground',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
      {card && look && dirty ? (
        <button
          type="button"
          data-close-menu
          disabled={busy}
          onClick={() => void updateToLook()}
          className={itemClass}
        >
          {t('updateLook', { look: lookLabel(look, card.looks, tLooks) })}
          <span className="text-3xs text-muted-foreground">{t('edited')}</span>
        </button>
      ) : null}
      {card ? (
        newLook === null ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setNewLook('')}
            className={itemClass}
          >
            {t('saveAsLook')}
          </button>
        ) : (
          <div className="flex items-center gap-1 px-2 py-1">
            <input
              autoFocus
              value={newLook}
              maxLength={CHARACTER_CARD.LOOK_LABEL_MAX_LENGTH}
              placeholder={tLooks('namePlaceholder')}
              onChange={(event) => setNewLook(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void saveAsNewLook()
                }
              }}
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="button"
              disabled={busy || !newLook.trim()}
              onClick={() => void saveAsNewLook()}
              className="h-8 rounded-md bg-foreground px-2.5 text-2xs text-background disabled:opacity-50"
            >
              {tLooks('save')}
            </button>
          </div>
        )
      ) : null}
      <span className="mx-2 my-1 h-px bg-border" />
    </>
  )
}
