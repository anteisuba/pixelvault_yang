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
import { useTranslations } from 'next-intl'

import { EASE_STANDARD, LIQUID_SPRING, LIQUID_TIMING } from '@/constants/motion'
import type { CharacterCardRecord, CharacterReferenceSlot } from '@/types'
import { ChevronRight, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useCharacterCardUsage } from '@/hooks/cards/use-character-card-usage'
import { cn } from '@/lib/utils'

/** 侧栏里这份内容是怎么来的：随侧栏展开进场 / 开着时换角色 / 已经在那。 */
export type CharacterPanelEntry = 'open' | 'swap' | 'static'

type RowId = 'looks' | 'setting' | 'uses'

interface CharacterCardPanelProps {
  card: CharacterCardRecord
  entry: CharacterPanelEntry
  /** 侧栏在收：内容先退（`contentOutS`），退完才收形状。 */
  closing: boolean
  onClose(): void
  onEdit(): void
  /** 手机底部抽屉里不画关闭钮（下拉关闭）。 */
  showClose: boolean
}

const SLOT_LABEL_KEYS = ['slotFace', 'slotFull', 'slotBack'] as const

/** 模糊跟透明度走同一根线；全显时不挂滤镜。 */
function liquidBlur(visible: number): string {
  if (visible >= 1) return 'none'
  return `blur(${((1 - visible) * LIQUID_TIMING.blurPx).toFixed(2)}px)`
}

/** 外观那一行的三张：主图在最前（卡片总线已排好序），最多三张。 */
function coreSlots(slots: CharacterReferenceSlot[]): CharacterReferenceSlot[] {
  return slots.slice(0, SLOT_LABEL_KEYS.length)
}

export function CharacterCardPanel({
  card,
  entry,
  closing,
  onClose,
  onEdit,
  showClose,
}: CharacterCardPanelProps) {
  const t = useTranslations('CharacterRoster')
  const reducedMotion = useReducedMotion() ?? false
  const [openRow, setOpenRow] = useState<RowId | null>('looks')
  const headIn = useMotionValue(entry === 'static' || reducedMotion ? 1 : 0)
  const bodyIn = useMotionValue(entry === 'static' || reducedMotion ? 1 : 0)
  const headFilter = useTransform(headIn, liquidBlur)
  const bodyFilter = useTransform(bodyIn, liquidBlur)

  /**
   * 内容的几拍（数只住 `LIQUID_TIMING`）：开 = 标题随第一拍、正文随第二拍；换角色 =
   * 新的晚一点进；收 = 两批一起先退。
   */
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
    const head =
      entry === 'open'
        ? { delay: LIQUID_TIMING.headInDelayS, duration: LIQUID_TIMING.headInS }
        : { delay: LIQUID_TIMING.swapInDelayS, duration: LIQUID_TIMING.swapInS }
    const body =
      entry === 'open'
        ? { delay: LIQUID_TIMING.bodyInDelayS, duration: LIQUID_TIMING.bodyInS }
        : { delay: LIQUID_TIMING.swapInDelayS, duration: LIQUID_TIMING.swapInS }
    const controls = [
      animate(headIn, 1, { ...head, ease: EASE_STANDARD }),
      animate(bodyIn, 1, { ...body, ease: EASE_STANDARD }),
    ]
    return () => controls.forEach((control) => control.stop())
  }, [bodyIn, closing, entry, headIn, reducedMotion])

  const slots = coreSlots(card.referenceSlots)
  const persona = card.persona
  const settingFields = [
    ['fieldIdentity', persona?.identity],
    ['fieldBehavior', persona?.behavior],
    ['fieldSpeech', persona?.speech],
    ['fieldBackstory', persona?.backstory],
  ].filter((field): field is [string, string] => Boolean(field[1]?.trim()))
  const tags = [...card.cardTags.character, ...card.cardTags.appearance]
  const usage = useCharacterCardUsage(card.id, openRow === 'uses')
  const primaryUrl = slots[0]?.url ?? card.sourceImageUrl

  return (
    <div className="flex h-full min-h-0 flex-col">
      <motion.div
        style={{ opacity: headIn, filter: headFilter }}
        className="relative shrink-0 px-7 pb-2 pt-7"
      >
        {showClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t('close')}
            className="absolute right-3.5 top-3.5 rounded-full text-muted-foreground"
          >
            <X className="size-4" />
          </Button>
        ) : null}
        <div className="flex items-center gap-3.5">
          <span className="relative size-14 shrink-0 overflow-hidden rounded-full bg-muted">
            {primaryUrl ? (
              <Image
                src={primaryUrl}
                alt=""
                fill
                sizes="56px"
                className="object-cover"
              />
            ) : null}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-semibold tracking-tight">
              {card.name}
            </h2>
            {card.handle ? (
              <p className="truncate text-sm text-muted-foreground">
                @{card.handle}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2.5">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            {t('edit')}
          </Button>
        </div>
      </motion.div>

      <motion.div
        style={{ opacity: bodyIn, filter: bodyFilter }}
        className="min-h-0 flex-1 overflow-y-auto px-7 pb-9"
      >
        <PanelRow
          id="looks"
          title={t('looks')}
          meta={slots.length ? t('imageCount', { count: slots.length }) : null}
          open={openRow === 'looks'}
          onToggle={setOpenRow}
        >
          {slots.length ? (
            <div className="grid grid-cols-3 gap-2.5">
              {slots.map((slot, index) => (
                <div
                  key={slot.id}
                  className="relative aspect-4/5 overflow-hidden rounded-xl bg-muted"
                >
                  <Image
                    src={slot.url}
                    alt=""
                    fill
                    sizes="120px"
                    className="object-cover"
                  />
                  <span className="absolute bottom-1.5 left-2 text-xs text-white drop-shadow">
                    {t(SLOT_LABEL_KEYS[index] ?? 'slotFace')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('noLooks')}</p>
          )}
          {card.description ? (
            <p className="text-sm leading-7">{card.description}</p>
          ) : null}
          {tags.length ? (
            <p className="text-xs text-muted-foreground">
              {t('tagsLine', { first: tags[0] ?? '', count: tags.length })}
            </p>
          ) : null}
        </PanelRow>

        <PanelRow
          id="setting"
          title={t('setting')}
          meta={null}
          open={openRow === 'setting'}
          onToggle={setOpenRow}
        >
          {settingFields.length ? (
            settingFields.map(([key, value]) => (
              <div key={key}>
                <p className="mb-1 text-xs text-muted-foreground">{t(key)}</p>
                <p className="text-sm leading-7">{value}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t('noSetting')}</p>
          )}
        </PanelRow>

        <PanelRow
          id="uses"
          title={t('uses')}
          meta={usage.total ? t('imageCount', { count: usage.total }) : null}
          open={openRow === 'uses'}
          onToggle={setOpenRow}
        >
          {usage.generations.length ? (
            <div className="grid grid-cols-4 gap-2">
              {usage.generations.map((generation) => (
                <div
                  key={generation.id}
                  className="relative aspect-square overflow-hidden rounded-lg bg-muted"
                >
                  <Image
                    src={generation.thumbnailUrl ?? generation.url}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {usage.isLoading ? t('loading') : t('noUses')}
            </p>
          )}
        </PanelRow>
      </motion.div>
    </div>
  )
}

/**
 * 可展开的一行：一次只开一行；高度走弹簧（展开 `unfold`、收起 `retract`），
 * 另一行同时收起。
 */
function PanelRow({
  id,
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  id: RowId
  title: string
  meta: string | null
  open: boolean
  onToggle(next: RowId | null): void
  children: React.ReactNode
}) {
  const reducedMotion = useReducedMotion() ?? false
  return (
    <div className="border-t border-border first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(open ? null : id)}
        className="flex min-h-13 w-full items-center justify-between py-4 text-left text-base"
      >
        <span>
          {title}
          {meta ? (
            <span className="ml-1.5 text-sm text-muted-foreground">{meta}</span>
          ) : null}
        </span>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 90 : 0 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : open
                ? LIQUID_SPRING.unfold
                : LIQUID_SPRING.retract
          }
          className="text-muted-foreground"
        >
          <ChevronRight className="size-4" />
        </motion.span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : {
                height: open ? LIQUID_SPRING.unfold : LIQUID_SPRING.retract,
                opacity: {
                  duration: LIQUID_TIMING.bodyInS,
                  ease: EASE_STANDARD,
                },
              }
        }
        className={cn('overflow-hidden')}
      >
        <div className="flex flex-col gap-3.5 pb-5 pt-0.5">{children}</div>
      </motion.div>
    </div>
  )
}
