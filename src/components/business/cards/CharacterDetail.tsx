'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import { useLocale, useTranslations } from 'next-intl'

import { EASE_STANDARD, LIQUID_TIMING } from '@/constants/motion'
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
 * **角色详情 · 方向 A「整页左图右文」**（owner 09-26 选 A）。
 *
 * ⭐ 两个模块：左边**图片**（主图 + 瀑布流，「全部 / 卡上 / 用她出的」三档），
 *   右边**设定**（一句外观 · 身份 · 性格 · 说话方式 · 经历 · 标签 · 作品来源 · 试读）。
 * ⭐ 「编辑」把整页换成编辑态（图 + 文一起改），保存 / 取消回到详情。
 * ⚠ 整页从点中的那张卡长出来（形状由 `CharacterRoster` 的液态展开负责），这里只管
 *   内容的几拍：标题随第一拍、正文随第二拍；收回时两批一起先退。
 */

/** 内容是怎么来的：随展开进场 / 已经在那（手机、降级动效）。 */
export type CharacterDetailEntry = 'open' | 'static'

type ImageScope = 'all' | 'card' | 'made'

interface CharacterDetailProps {
  card: CharacterCardRecord
  entry: CharacterDetailEntry
  /** 在收：内容先退（`contentOutS`），退完才收形状。 */
  closing: boolean
  onClose(): void
  onUpdate(data: UpdateCharacterCardRequest): Promise<boolean>
  onDelete(): Promise<boolean>
}

/** 模糊跟透明度走同一根线；全显时不挂滤镜。 */
function liquidBlur(visible: number): string {
  if (visible >= 1) return 'none'
  return `blur(${((1 - visible) * LIQUID_TIMING.blurPx).toFixed(2)}px)`
}

export function CharacterDetail({
  card,
  entry,
  closing,
  onClose,
  onUpdate,
  onDelete,
}: CharacterDetailProps) {
  const t = useTranslations('CharacterRoster')
  const locale = useLocale()
  const reducedMotion = useReducedMotion() ?? false
  const [editing, setEditing] = useState(false)
  const headIn = useMotionValue(entry === 'static' || reducedMotion ? 1 : 0)
  const bodyIn = useMotionValue(entry === 'static' || reducedMotion ? 1 : 0)
  const headFilter = useTransform(headIn, liquidBlur)
  const bodyFilter = useTransform(bodyIn, liquidBlur)

  useEffect(() => {
    if (reducedMotion) {
      headIn.jump(closing ? 0 : 1)
      bodyIn.jump(closing ? 0 : 1)
      return
    }
    if (closing) {
      const out = { duration: LIQUID_TIMING.contentOutS, ease: EASE_STANDARD }
      const controls = [animate(headIn, 0, out), animate(bodyIn, 0, out)]
      return () => controls.forEach((control) => control.stop())
    }
    if (entry === 'static') return
    const controls = [
      animate(headIn, 1, {
        delay: LIQUID_TIMING.headInDelayS,
        duration: LIQUID_TIMING.headInS,
        ease: EASE_STANDARD,
      }),
      animate(bodyIn, 1, {
        delay: LIQUID_TIMING.bodyInDelayS,
        duration: LIQUID_TIMING.bodyInS,
        ease: EASE_STANDARD,
      }),
    ]
    return () => controls.forEach((control) => control.stop())
  }, [bodyIn, closing, entry, headIn, reducedMotion])

  const work = characterWork(card, locale)
  const workLabel = work.label ?? t('workOriginal')
  const primaryUrl = card.referenceSlots[0]?.url ?? card.sourceImageUrl

  return (
    <div className="flex h-full min-h-0 flex-col">
      <motion.header
        style={{ opacity: headIn, filter: headFilter }}
        className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3.5 sm:px-8"
      >
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-0.5 rounded-full py-1 pr-2 text-2sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {t('title')}
        </button>
        <span className="relative size-9 shrink-0 overflow-hidden rounded-full bg-muted">
          {primaryUrl ? (
            <Image
              src={primaryUrl}
              alt=""
              fill
              sizes="36px"
              className="object-cover"
            />
          ) : null}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold leading-tight">
            {card.name}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {t('tileMeta', {
              work: workLabel,
              images: characterImageCount(card),
            })}
          </p>
        </div>
        {editing ? null : (
          <div className="ml-auto flex items-center gap-2">
            <UseCharacterMenu card={card} />
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setEditing(true)}
            >
              {t('edit')}
            </Button>
          </div>
        )}
      </motion.header>

      {editing ? (
        <CharacterCardEditor
          card={card}
          onSave={async (data) => {
            const ok = await onUpdate(data)
            if (ok) setEditing(false)
            return ok
          }}
          onCancel={() => setEditing(false)}
          onDelete={onDelete}
        />
      ) : (
        <motion.div
          style={{ opacity: bodyIn, filter: bodyFilter }}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="grid gap-8 px-5 pb-12 pt-6 sm:px-8 lg:grid-cols-5">
            <ImagesModule card={card} />
            <div className="lg:sticky lg:top-6 lg:col-span-2 lg:self-start">
              <SettingModule
                card={card}
                workLabel={workLabel}
                workSource={work.source}
                workTag={work.tag}
                onEdit={() => setEditing(true)}
              />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

function ImagesModule({ card }: { card: CharacterCardRecord }) {
  const t = useTranslations('CharacterRoster')
  const [scope, setScope] = useState<ImageScope>('all')
  const usage = useCharacterCardUsage(card.id, true)
  const [primary, ...restSlots] = card.referenceSlots
  const madeCount = usage.total ?? card.generationCount

  const scopes: { id: ImageScope; label: string }[] = [
    { id: 'all', label: t('imagesAll') },
    {
      id: 'card',
      label: t('imagesOnCard', { count: card.referenceSlots.length }),
    },
    { id: 'made', label: t('imagesMade', { count: madeCount }) },
  ]
  const cardImages = (scope === 'card' ? card.referenceSlots : restSlots).map(
    (slot) => ({
      id: slot.id,
      url: slot.url,
      width: 0,
      height: 0,
      badge: slot.isPrimary ? t('primary') : t('onCard'),
    }),
  )
  const madeImages = usage.generations.map((generation) => ({
    id: generation.id,
    url: generation.thumbnailUrl ?? generation.url,
    width: generation.width,
    height: generation.height,
    badge: null,
  }))
  const tiles =
    scope === 'card'
      ? cardImages
      : scope === 'made'
        ? madeImages
        : [...cardImages, ...madeImages]
  const showHero = scope === 'all' && primary

  return (
    <section className="flex min-w-0 flex-col gap-4 lg:col-span-3">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <h3 className="text-base font-semibold">{t('imagesTitle')}</h3>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {characterImageCount(card)}
        </span>
        <div
          role="group"
          aria-label={t('imagesTitle')}
          className="ml-auto flex gap-0.5 rounded-full bg-muted p-0.5"
        >
          {scopes.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={scope === item.id}
              onClick={() => setScope(item.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs transition-colors duration-fast',
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

      {showHero ? (
        <div className="relative aspect-4/5 w-full overflow-hidden rounded-2xl bg-muted lg:max-w-xl">
          <Image
            src={primary.url}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 36rem, 100vw"
            className="object-cover"
          />
          <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-0.5 text-2xs">
            {t('primary')}
          </span>
        </div>
      ) : null}

      {tiles.length ? (
        <div className="columns-2 gap-2.5 sm:columns-3">
          {tiles.map((tile) => (
            <figure
              key={tile.id}
              className="relative mb-2.5 break-inside-avoid overflow-hidden rounded-xl bg-muted"
            >
              <Image
                src={tile.url}
                alt=""
                width={tile.width || 400}
                height={tile.height || 500}
                sizes="(min-width: 1024px) 14rem, 45vw"
                className="h-auto w-full"
              />
              {tile.badge ? (
                <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-2xs">
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
    <section className="flex min-w-0 flex-col gap-5">
      <h3 className="text-base font-semibold">{t('setting')}</h3>
      {card.description ? (
        <p className="text-md leading-relaxed">{card.description}</p>
      ) : null}

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
