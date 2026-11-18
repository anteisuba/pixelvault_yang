'use client'

import { useTranslations } from 'next-intl'

import type { CharacterImagePick } from '@/types'
import { UserRound, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useStudioData } from '@/contexts/studio-context'
import { sameCharacterPick } from '@/features/cards'
import { useCharacterCardUsage } from '@/features/cards/hooks'
import { useStudioCharacterOutlet } from '@/features/studio/hooks/use-studio-character-outlet'
import type { StudioCharacterOutletEntry } from '@/lib/studio-character-outlet'
import { cn } from '@/lib/utils'

/**
 * 输入框里「角色带进来的图」（11-17）：在场角色**这一枪真会送**的那几张（与服务端同一个
 * 编译器预演，`useStudioCharacterOutlet`），每张左下角标她的名字、悬停出 × 单独拿掉；
 * 这一枪她一张图都不带（模型不收图 / 配额用完 / NovelAI 只用标签）时出一颗「只带文字」的
 * 名字胶囊，× = 这次不带她。宿主：图片台输入框（两种布局）· 标签台（桌面页签行 / 手机）·
 * 手机输入条 —— 与用户自己的参考图条并排，同一副尺寸。
 */
export function StudioCharacterReferenceStrip({
  variant = 'composer',
  className,
}: {
  /** `tabs` = 标签台页签行里那一排小图（28 方）。 */
  variant?: 'composer' | 'tabs'
  className?: string
}) {
  const t = useTranslations('StudioV2')
  const outlet = useStudioCharacterOutlet()
  if (outlet.entries.length === 0) return null
  return (
    <ul
      aria-label={t('characterStripLabel')}
      data-testid="studio-character-strip"
      className={cn(
        'flex shrink-0 items-center gap-2 overflow-x-auto overscroll-contain',
        variant === 'composer' ? 'px-1 pt-1.5 pb-0.5' : 'gap-1',
        className,
      )}
    >
      {outlet.entries.map((entry) => (
        <CharacterEntry key={entry.card.id} entry={entry} variant={variant} />
      ))}
    </ul>
  )
}

function CharacterEntry({
  entry,
  variant,
}: {
  entry: StudioCharacterOutletEntry
  variant: 'composer' | 'tabs'
}) {
  const t = useTranslations('StudioV2')
  const { characters } = useStudioData()
  const { card } = entry
  const needsUsage = entry.images.some((image) => image.url === null)
  const usage = useCharacterCardUsage(card.id, needsUsage)

  /** 拿掉一张：自动排的先落成「挑了剩下那几张」，再拿；拿空 = 她不在场。 */
  const removeImage = (pick: CharacterImagePick) => {
    const current = entry.picked
      ? (characters.imagePicks[card.id] ?? [])
      : entry.images.map((image) => image.pick)
    characters.setImagePicks(
      card.id,
      current.filter((item) => !sameCharacterPick(item, pick)),
    )
  }

  if (entry.images.length === 0) {
    return (
      <li className="flex shrink-0 items-center gap-1 rounded-full bg-muted py-0.5 pr-0.5 pl-2 text-2xs">
        <UserRound className="size-3 text-muted-foreground" aria-hidden />
        <span className="max-w-24 truncate font-semibold">{card.name}</span>
        <span className="text-muted-foreground">{t('characterTextOnly')}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t('removeCharacter', { name: card.name })}
          onClick={() => characters.toggleCardSelection(card.id)}
        >
          <X />
        </Button>
      </li>
    )
  }

  return (
    <>
      {entry.images.map((image) => {
        const url =
          image.url ??
          ('generationId' in image.pick
            ? (() => {
                const pick = image.pick
                const generation = usage.generations.find(
                  (item) => item.id === pick.generationId,
                )
                return generation?.thumbnailUrl ?? generation?.url ?? null
              })()
            : null)
        const key =
          'slotId' in image.pick ? image.pick.slotId : image.pick.generationId
        return (
          <li
            key={key}
            data-testid="studio-character-strip-image"
            className={cn(
              'group relative shrink-0 rounded-md bg-muted ring-1 ring-border ring-inset',
              variant === 'composer' ? 'size-12' : 'size-7',
            )}
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={card.name}
                className="size-full rounded-md object-cover"
              />
            ) : null}
            {variant === 'composer' ? (
              <span className="pointer-events-none absolute inset-x-0.5 bottom-0.5 truncate rounded-sm bg-background/90 px-1 text-3xs font-semibold">
                {card.name}
              </span>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="icon-xs"
              aria-label={t('removeCharacterImage', { name: card.name })}
              onClick={() => removeImage(image.pick)}
              className={cn(
                'absolute -top-1.5 -right-1.5 z-10 size-4.5 rounded-full bg-card text-ink-2 opacity-0 shadow-soft transition-opacity group-hover:opacity-100 focus-visible:opacity-100 coarse:opacity-100',
                variant === 'tabs' && 'top-0 right-0 size-3.5',
              )}
            >
              <X className="size-3" />
            </Button>
          </li>
        )
      })}
    </>
  )
}
