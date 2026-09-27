'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'

import type { CharacterCardRecord, UpdateCharacterCardRequest } from '@/types'
import { ChevronLeft } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { CharacterCardEditor } from '@/components/business/cards/CharacterCardEditor'
import { UseCharacterMenu } from '@/components/business/cards/UseCharacterMenu'
import { useCharacterCardUsage } from '@/hooks/cards/use-character-card-usage'
import { useCharacterSampleLines } from '@/hooks/cards/use-character-sample-lines'
import { characterImageCount, characterWork } from '@/lib/character-works'
import { cn } from '@/lib/utils'

/**
 * **角色详情 · 排版 A**（owner 09-27 从原型选 A）：设定是主角。
 *
 * ⭐ 白卡里：上面一条身份带（112 的小头像 · 名字 · 作品与张数 · 一句外观），下面左边
 *   设定、右边一列 280 宽的小图（「全部 / 卡上 / 用她出的」三档）。⛔ 不再放整列大图。
 * ⭐ 那一行（‹ 角色 · 用她 · 编辑）住在地台上、白卡外面（布局 A，与图片台同一套），
 *   右端是助手头像那一格 —— 见 `CharacterDetailHeader`。
 * ⚠ 进出动效由 `CharacterRoster` 统一做（直接切：淡出 → 淡入上移 8px，原型「动画 2」），
 *   这里不管。
 */

type ImageScope = 'all' | 'card' | 'made'

export function CharacterDetailHeader({
  card,
  editing,
  onBack,
  onEdit,
}: {
  card: CharacterCardRecord
  editing: boolean
  onBack(): void
  onEdit(): void
}) {
  const t = useTranslations('CharacterRoster')
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-0.5 rounded-full py-1 pr-2 text-2sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t('title')}
      </button>
      {editing ? (
        <span className="truncate text-sm font-medium">{card.name}</span>
      ) : (
        <div className="ml-auto flex items-center gap-2">
          <UseCharacterMenu card={card} />
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={onEdit}
          >
            {t('edit')}
          </Button>
        </div>
      )}
    </>
  )
}

export function CharacterDetailBody({
  card,
  editing,
  onEdit,
  onEditDone,
  onUpdate,
  onDelete,
}: {
  card: CharacterCardRecord
  editing: boolean
  onEdit(): void
  onEditDone(): void
  onUpdate(data: UpdateCharacterCardRequest): Promise<boolean>
  onDelete(): Promise<boolean>
}) {
  const t = useTranslations('CharacterRoster')
  const locale = useLocale()
  if (editing) {
    return (
      <CharacterCardEditor
        card={card}
        onSave={async (data) => {
          const ok = await onUpdate(data)
          if (ok) onEditDone()
          return ok
        }}
        onCancel={onEditDone}
        onDelete={onDelete}
      />
    )
  }
  const work = characterWork(card, locale)
  const workLabel = work.label ?? t('workOriginal')
  const primaryUrl = card.referenceSlots[0]?.url ?? card.sourceImageUrl
  return (
    <div className="h-full overflow-y-auto px-5 pb-12 pt-6 sm:px-8 sm:pt-7">
      <div className="mb-8 flex items-center gap-5">
        <span className="relative size-28 shrink-0 overflow-hidden rounded-2xl bg-muted">
          {primaryUrl ? (
            <Image
              src={primaryUrl}
              alt=""
              fill
              priority
              sizes="112px"
              className="object-cover"
            />
          ) : null}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate text-2xl font-semibold tracking-tight">
            {card.name}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t('tileMeta', {
              work: workLabel,
              images: characterImageCount(card),
            })}
          </p>
          {card.description ? (
            <p className="max-w-prose text-md leading-relaxed">
              {card.description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-10 lg:flex-row lg:items-start">
        <SettingModule
          card={card}
          workLabel={workLabel}
          workSource={work.source}
          workTag={work.tag}
          onEdit={onEdit}
        />
        <ImagesModule card={card} />
      </div>
    </div>
  )
}

function ImagesModule({ card }: { card: CharacterCardRecord }) {
  const t = useTranslations('CharacterRoster')
  const [scope, setScope] = useState<ImageScope>('all')
  const usage = useCharacterCardUsage(card.id, true)
  const madeCount = usage.total ?? card.generationCount

  const scopes: { id: ImageScope; label: string }[] = [
    { id: 'all', label: t('imagesAll') },
    {
      id: 'card',
      label: t('imagesOnCard', { count: card.referenceSlots.length }),
    },
    { id: 'made', label: t('imagesMade', { count: madeCount }) },
  ]
  const cardImages = card.referenceSlots.map((slot) => ({
    id: slot.id,
    url: slot.url,
    badge: slot.isPrimary ? t('primary') : t('onCard'),
  }))
  const madeImages = usage.generations.map((generation) => ({
    id: generation.id,
    url: generation.thumbnailUrl ?? generation.url,
    badge: null,
  }))
  const tiles =
    scope === 'card'
      ? cardImages
      : scope === 'made'
        ? madeImages
        : [...cardImages, ...madeImages]

  return (
    <section className="flex min-w-0 shrink-0 flex-col gap-3 lg:w-70">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <h3 className="text-base font-semibold">{t('imagesTitle')}</h3>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {characterImageCount(card)}
        </span>
        <div
          role="group"
          aria-label={t('imagesTitle')}
          className="flex w-full gap-0.5 rounded-full bg-muted p-0.5"
        >
          {scopes.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={scope === item.id}
              onClick={() => setScope(item.id)}
              className={cn(
                'flex-1 truncate rounded-full px-2 py-1 text-xs transition-colors duration-fast',
                scope === item.id
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tiles.length ? (
        <div className="grid grid-cols-3 gap-2">
          {tiles.map((tile) => (
            <figure
              key={tile.id}
              className="relative aspect-4/5 overflow-hidden rounded-lg bg-muted"
            >
              <Image
                src={tile.url}
                alt=""
                fill
                sizes="(min-width: 1024px) 90px, 30vw"
                className="object-cover"
              />
              {tile.badge ? (
                <span className="absolute left-1 top-1 rounded-full bg-background/90 px-1.5 text-3xs">
                  {tile.badge}
                </span>
              ) : null}
            </figure>
          ))}
        </div>
      ) : scope === 'made' ? (
        <p className="text-2sm text-muted-foreground">
          {usage.isLoading ? t('loading') : t('noUses')}
        </p>
      ) : null}
      {scope !== 'card' && usage.total && usage.total > madeImages.length ? (
        <p className="text-xs text-muted-foreground">
          {t('imagesMore', { count: usage.total - madeImages.length })}
        </p>
      ) : null}
    </section>
  )
}

function SettingModule({
  card,
  workLabel,
  workSource,
  workTag,
  onEdit,
}: {
  card: CharacterCardRecord
  workLabel: string
  workSource: 'override' | 'tag' | 'original'
  workTag: string | null
  onEdit(): void
}) {
  const t = useTranslations('CharacterRoster')
  const reading = useCharacterSampleLines(card.id)
  const persona = card.persona
  const fields = [
    ['fieldIdentity', persona?.identity],
    ['fieldBehavior', persona?.behavior],
    ['fieldSpeech', persona?.speech],
    ['fieldBackstory', persona?.backstory],
  ].filter((field): field is [string, string] => Boolean(field[1]?.trim()))
  const tags = [
    ...card.cardTags.character,
    ...card.cardTags.appearance,
    ...(card.cardTags.loraTrigger ? [card.cardTags.loraTrigger] : []),
  ]

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-5">
      <h3 className="text-base font-semibold">{t('setting')}</h3>

      {fields.length ? (
        fields.map(([key, value]) => (
          <div key={key} className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">{t(key)}</p>
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {value}
            </p>
          </div>
        ))
      ) : (
        <div className="flex flex-col items-start gap-2.5">
          <p className="text-2sm text-muted-foreground">{t('noSetting')}</p>
          <Button type="button" size="sm" variant="outline" onClick={onEdit}>
            {t('writeSetting')}
          </Button>
        </div>
      )}

      {fields.length ? (
        reading.lines ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-xs text-muted-foreground">
              {t('readingTitle', { name: card.name })}
            </p>
            <div className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-3 text-sm leading-7">
              {reading.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <div className="flex items-center gap-2.5">
              <Button type="button" size="sm" onClick={reading.clear}>
                {t('readingLike')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  reading.clear()
                  onEdit()
                }}
              >
                {t('readingUnlike')}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void reading.run()}
            disabled={reading.isLoading}
            className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
          >
            {reading.isLoading ? <Spinner size="sm" /> : null}
            {reading.error ? t('readingFailed') : t('readingTry')}
          </button>
        )
      ) : null}

      <div className="h-px bg-border" />

      {tags.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">{t('tagsTitle')}</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {workSource === 'tag' && workTag
          ? t('workSourceTag', { work: workLabel, tag: workTag })
          : workSource === 'override'
            ? t('workSourceOverride', { work: workLabel })
            : t('workSourceOriginal')}
      </p>
    </section>
  )
}
