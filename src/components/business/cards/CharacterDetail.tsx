'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'

import { CHARACTER_CARD } from '@/constants/cards/character-card'
import type { CharacterCardRecord, UpdateCharacterCardRequest } from '@/types'
import { ChevronLeft, Plus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import {
  CharacterInlineField,
  CharacterTagChips,
} from '@/components/business/cards/CharacterInlineField'
import { UseCharacterMenu } from '@/components/business/cards/UseCharacterMenu'
import {
  appendSlotImages,
  type CharacterCardDraft,
  draftFromCard,
  makePrimary,
  removeSlot,
  replaceSlotImage,
  updateFromDraft,
} from '@/hooks/cards/use-character-card-editor'
import { useCharacterCardUsage } from '@/hooks/cards/use-character-card-usage'
import { useCharacterSampleLines } from '@/hooks/cards/use-character-sample-lines'
import {
  characterImageCount,
  characterWork,
  workLabelFromTag,
  workTagFromCharacterTag,
} from '@/lib/character-works'
import { cn } from '@/lib/utils'

/**
 * **角色详情**（owner 09-27：图片放顶上占四成左右 · 点哪改哪，原型 B）。
 *
 * ⭐ 白卡里从上到下：图片带（滚动区的 5/12 ≈ 扣掉上下留白后白卡的四成，横滑，
 *   「全部 / 卡上 / 用她出的」）→ 名字 · 作品与张数 · 一句外观 → 设定四格（两栏）→
 *   标签 · 作品 · 触发词 → 删除。
 * ⭐ ⛔ 没有编辑态：每一格本身就是输入框（`CharacterInlineField`），离开就存；图片悬停
 *   露出「换一张 / 设为主图 / 移除」，图片带末尾常驻一格「添加图片」（图少时占住空位）。
 * ⚠ 每次只存改动的那一格：以**当前角色记录**为底合进这一格再发整份更新（设定里没露出来的
 *   格原样带回，见 `updateFromDraft`），⛔ 不留一份会过期的整页草稿。
 * ⚠ 图片带的高度是滚动容器的百分比 —— 它必须是滚动容器的**直接子元素**，百分比才有参照。
 * ⚠ 那一行（‹ 角色 · 用她）住在地台上、白卡外面（布局 A），右端是助手头像那一格。
 */

type ImageScope = 'all' | 'card' | 'made'
type Save = (patch: Partial<CharacterCardDraft>) => Promise<boolean>

export function CharacterDetailHeader({
  card,
  onBack,
}: {
  /** `null` = 「新角色」草稿：还没建，没有「用她 ▾」。 */
  card: CharacterCardRecord | null
  onBack(): void
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
      {card ? (
        <div className="ml-auto flex items-center gap-2">
          <UseCharacterMenu card={card} />
        </div>
      ) : null}
    </>
  )
}

/**
 * **「新角色」草稿**（owner 09-28：直接进一张空的详情页）。版式同详情，光标在名字格；
 * 名字写好离开那一格才建卡 —— handle 从真名派生（改名不会跟着变，⛔ 不先拿「新角色」
 * 占位建卡）。图片与设定等她建好再开。空着返回 = 什么都没建。
 */
export function CharacterDraftBody({
  onCreate,
}: {
  onCreate(name: string): Promise<boolean>
}) {
  const t = useTranslations('CharacterRoster')
  return (
    <div className="h-full overflow-y-auto px-5 pb-12 pt-6 sm:px-8 sm:pt-7">
      <section className="mb-7 flex h-5/12 min-h-60 flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="text-base font-semibold">{t('imagesTitle')}</h3>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            0
          </span>
        </div>
        <div className="flex min-h-0 flex-1 pb-1.5">
          <div
            aria-disabled
            className="flex aspect-4/5 h-full shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground opacity-60"
          >
            <Plus className="size-5" aria-hidden />
            {t('addImage')}
          </div>
        </div>
      </section>
      <div className="flex max-w-3xl flex-col gap-1">
        <CharacterInlineField
          autoFocus
          value=""
          label={t('fieldName')}
          placeholder={t('fieldName')}
          onCommit={onCreate}
          className="text-3xl font-semibold tracking-tight"
        />
        <p className="text-xs text-muted-foreground">{t('draftHint')}</p>
      </div>
    </div>
  )
}

export function CharacterDetailBody({
  card,
  onUpdate,
  onDelete,
}: {
  card: CharacterCardRecord
  onUpdate(data: UpdateCharacterCardRequest): Promise<boolean>
  onDelete(): Promise<boolean>
}) {
  const t = useTranslations('CharacterRoster')
  const locale = useLocale()
  const save: Save = (patch) =>
    onUpdate(updateFromDraft(card, { ...draftFromCard(card), ...patch }))
  const work = characterWork(card, locale)

  return (
    <div className="h-full overflow-y-auto px-5 pb-12 pt-6 sm:px-8 sm:pt-7">
      <ImageBand card={card} save={save} />

      <div className="mb-8 flex max-w-3xl flex-col gap-1">
        <CharacterInlineField
          value={card.name}
          label={t('fieldName')}
          placeholder={t('fieldName')}
          onCommit={(name) => save({ name })}
          className="text-3xl font-semibold tracking-tight"
        />
        <p className="text-xs text-muted-foreground">
          {t('tileMeta', {
            work: work.label ?? t('workOriginal'),
            images: characterImageCount(card),
          })}
        </p>
        <CharacterInlineField
          multiline
          value={card.description ?? ''}
          label={t('fieldLooks')}
          placeholder={t('fieldLooks')}
          onCommit={(description) => save({ description })}
          className="mt-1 text-md leading-relaxed"
        />
      </div>

      <SettingModule card={card} save={save} />
      <TagsModule card={card} save={save} />
      <DeleteCharacter name={card.name} onDelete={onDelete} />
    </div>
  )
}

function ImageBand({ card, save }: { card: CharacterCardRecord; save: Save }) {
  const t = useTranslations('CharacterRoster')
  const [scope, setScope] = useState<ImageScope>('all')
  /** 素材库选择器开着时在做什么：加几张，或换掉某一格。 */
  const [picking, setPicking] = useState<
    { kind: 'add' } | { kind: 'replace'; slotId: string } | null
  >(null)
  const usage = useCharacterCardUsage(card.id, true)
  const madeCount = usage.total ?? card.generationCount
  const slots = card.referenceSlots
  const remaining = CHARACTER_CARD.MAX_REFERENCE_SLOTS - slots.length

  const scopes: { id: ImageScope; label: string }[] = [
    { id: 'all', label: t('imagesAll') },
    { id: 'card', label: t('imagesOnCard', { count: slots.length }) },
    { id: 'made', label: t('imagesMade', { count: madeCount }) },
  ]
  const showCard = scope !== 'made'
  const madeImages = scope === 'card' ? [] : usage.generations

  return (
    <section className="mb-7 flex h-5/12 min-h-60 flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <h3 className="text-base font-semibold">{t('imagesTitle')}</h3>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {characterImageCount(card)}
        </span>
        <div
          role="group"
          aria-label={t('imagesTitle')}
          className="ml-1 flex gap-0.5 rounded-full bg-muted p-0.5"
        >
          {scopes.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={scope === item.id}
              onClick={() => setScope(item.id)}
              className={cn(
                'truncate rounded-full px-3 py-0.5 text-xs transition-colors duration-fast',
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

      <div className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto overflow-y-hidden pb-1.5">
        {showCard
          ? slots.map((slot) => (
              <figure
                key={slot.id}
                className="group/tile relative aspect-4/5 h-full shrink-0 overflow-hidden rounded-xl bg-muted"
              >
                <Image
                  src={slot.url}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 280px, 45vw"
                  className="object-cover"
                />
                <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 text-2xs">
                  {slot.isPrimary ? t('primary') : t('onCard')}
                </span>
                <div className="absolute inset-x-2 bottom-2 flex translate-y-1 justify-center gap-1 opacity-0 transition duration-fast ease-standard group-focus-within/tile:translate-y-0 group-focus-within/tile:opacity-100 group-hover/tile:translate-y-0 group-hover/tile:opacity-100 pointer-coarse:translate-y-0 pointer-coarse:opacity-100 motion-reduce:transition-none">
                  <TileAction
                    onClick={() =>
                      setPicking({ kind: 'replace', slotId: slot.id })
                    }
                  >
                    {t('replaceImage')}
                  </TileAction>
                  {slot.isPrimary ? null : (
                    <TileAction
                      onClick={() =>
                        void save({ slots: makePrimary(slots, slot.id) })
                      }
                    >
                      {t('makePrimary')}
                    </TileAction>
                  )}
                  {slots.length > 1 ? (
                    <TileAction
                      onClick={() =>
                        void save({ slots: removeSlot(slots, slot.id) })
                      }
                    >
                      {t('removeImage')}
                    </TileAction>
                  ) : null}
                </div>
              </figure>
            ))
          : null}
        {madeImages.map((generation) => (
          <figure
            key={generation.id}
            className="relative aspect-4/5 h-full shrink-0 overflow-hidden rounded-xl bg-muted"
          >
            <Image
              src={generation.thumbnailUrl ?? generation.url}
              alt=""
              fill
              sizes="(min-width: 1024px) 280px, 45vw"
              className="object-cover"
            />
          </figure>
        ))}
        {showCard && remaining > 0 ? (
          <button
            type="button"
            onClick={() => setPicking({ kind: 'add' })}
            className="flex aspect-4/5 h-full shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-5" aria-hidden />
            {t('addImage')}
          </button>
        ) : null}
        {scope === 'made' && madeImages.length === 0 ? (
          <p className="self-center text-2sm text-muted-foreground">
            {usage.isLoading ? t('loading') : t('noUses')}
          </p>
        ) : null}
      </div>
      {scope !== 'card' && usage.total && usage.total > madeImages.length ? (
        <p className="text-xs text-muted-foreground">
          {t('imagesMore', { count: usage.total - madeImages.length })}
        </p>
      ) : null}

      <AssetSelectorDialog
        open={picking !== null}
        onOpenChange={(open) => {
          if (!open) setPicking(null)
        }}
        title={t('pickTitle')}
        description={t('addImageHint')}
        mediaType="image"
        multiSelect={picking?.kind === 'add'}
        maxSelection={remaining}
        onConfirmMany={(generations) =>
          void save({ slots: appendSlotImages(slots, generations) })
        }
        onSelect={(generation) => {
          if (picking?.kind === 'replace')
            void save({
              slots: replaceSlotImage(slots, picking.slotId, generation),
            })
        }}
      />
    </section>
  )
}

function TileAction({
  onClick,
  children,
}: {
  onClick(): void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-background/95 px-2.5 py-0.5 text-2xs shadow-xs transition-colors duration-fast hover:bg-background"
    >
      {children}
    </button>
  )
}

const SETTING_FIELDS = [
  ['identity', 'fieldIdentity'],
  ['behavior', 'fieldBehavior'],
  ['speech', 'fieldSpeech'],
  ['backstory', 'fieldBackstory'],
] as const

function SettingModule({
  card,
  save,
}: {
  card: CharacterCardRecord
  save: Save
}) {
  const t = useTranslations('CharacterRoster')
  const reading = useCharacterSampleLines(card.id)
  const speechRef = useRef<HTMLTextAreaElement>(null)
  const persona = card.persona
  const written = SETTING_FIELDS.some(([key]) => persona?.[key]?.trim())

  return (
    <section className="mb-8 flex flex-col gap-4">
      <h3 className="text-base font-semibold">{t('setting')}</h3>
      <div className="grid gap-x-11 gap-y-5 lg:grid-cols-2">
        {SETTING_FIELDS.map(([key, label]) => (
          <div key={key} className="flex min-w-0 flex-col gap-1">
            <p className="text-xs text-muted-foreground">{t(label)}</p>
            <CharacterInlineField
              ref={key === 'speech' ? speechRef : undefined}
              multiline
              value={persona?.[key] ?? ''}
              label={t(label)}
              placeholder={t('emptyField')}
              hint={key === 'behavior' ? t('behaviorHint') : undefined}
              onCommit={(text) => save({ [key]: text })}
              className="text-sm leading-relaxed"
            />
          </div>
        ))}
      </div>

      {written ? (
        reading.lines ? (
          <div className="flex max-w-2xl flex-col gap-2.5">
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
                  speechRef.current?.focus()
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
    </section>
  )
}

function TagsModule({ card, save }: { card: CharacterCardRecord; save: Save }) {
  const t = useTranslations('CharacterRoster')
  const locale = useLocale()
  const tagWork = card.cardTags.character
    .map(workTagFromCharacterTag)
    .find((tag): tag is string => tag !== null)
  const tagWorkLabel = tagWork ? workLabelFromTag(tagWork, locale) : null
  const removeLabel = (tag: string) => t('removeTag', { tag })

  return (
    <section className="mb-8 flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-muted-foreground">
          {t('fieldCharacterTags')}
        </p>
        <CharacterTagChips
          tags={card.cardTags.character}
          addLabel={t('tagsTitle')}
          removeLabel={removeLabel}
          onCommit={(tags) => save({ characterTags: tags.join(', ') })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-muted-foreground">
          {t('fieldAppearanceTags')}
        </p>
        <CharacterTagChips
          tags={card.cardTags.appearance}
          addLabel={t('tagsTitle')}
          removeLabel={removeLabel}
          onCommit={(tags) => save({ appearanceTags: tags.join(', ') })}
        />
      </div>
      <div className="grid max-w-3xl gap-x-11 gap-y-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs text-muted-foreground">{t('fieldWork')}</p>
          <CharacterInlineField
            value={card.workOverride ?? ''}
            label={t('fieldWork')}
            placeholder={
              tagWorkLabel
                ? t('workFromTag', { work: tagWorkLabel })
                : t('workNoTag')
            }
            onCommit={(work) => save({ work })}
            className="text-sm"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            {t('fieldLoraTrigger')}
          </p>
          <CharacterInlineField
            value={card.cardTags.loraTrigger}
            label={t('fieldLoraTrigger')}
            placeholder={t('emptyField')}
            onCommit={(loraTrigger) => save({ loraTrigger })}
            className="font-mono text-sm"
          />
        </div>
      </div>
    </section>
  )
}

function DeleteCharacter({
  name,
  onDelete,
}: {
  name: string
  onDelete(): Promise<boolean>
}) {
  const t = useTranslations('CharacterRoster')
  const [confirming, setConfirming] = useState(false)
  return confirming ? (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm">{t('deleteConfirm', { name })}</p>
      <div className="flex gap-2.5">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => void onDelete()}
        >
          {t('delete')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
        >
          {t('cancel')}
        </Button>
      </div>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-sm text-muted-foreground transition-colors duration-fast hover:text-status-risk"
    >
      {t('deleteCharacter')}
    </button>
  )
}
