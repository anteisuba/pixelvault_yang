'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'

import {
  CHARACTER_CARD,
  CHARACTER_PERSONA_LIMITS,
} from '@/constants/cards/character-card'
import type { CharacterPinnableField } from '@/constants/cards/character-revision'
import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import type {
  CharacterCardRecord,
  CharacterDialogueDraftKind,
  CharacterLookRecord,
  CreateCharacterLookRequest,
  UpdateCharacterCardRequest,
  UpdateCharacterLookRequest,
} from '@/types'
import { ChevronLeft, Mic, Play, Plus, Square } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import {
  CharacterInlineField,
  splitCharacterTags,
} from '@/components/business/cards/CharacterInlineField'
import {
  CharacterFieldEditor,
  CharacterTextField,
} from '@/components/business/cards/CharacterTextField'
import { CharacterImageShelves } from '@/components/business/cards/CharacterImageShelves'
import { CharacterLoraGrid } from '@/components/business/cards/CharacterLoraGrid'
import { CharacterLookStrip } from '@/components/business/cards/CharacterLookStrip'
import { VoicePickerDialog } from '@/components/business/voices/VoicePickerDialog'
import {
  appendSlotImages,
  type CharacterCardDraft,
  type CharacterLookDraft,
  draftFromCard,
  examplesToTavernText,
  lookUpdateFromDraft,
  makePrimary,
  removeSlot,
  replaceSlotImage,
  updateFromDraft,
} from '@/hooks/cards/use-character-card-editor'
import { useCharacterCardUsage } from '@/hooks/cards/use-character-card-usage'
import { useCharacterDialogueDraft } from '@/hooks/cards/use-character-dialogue-draft'
import { useCharacterLoras } from '@/hooks/cards/use-character-loras'
import { useCharacterSampleLines } from '@/hooks/cards/use-character-sample-lines'
import { useVoiceCardDetail } from '@/hooks/cards/use-voice-card-detail'
import {
  canPreviewVoiceSample,
  useVoiceSamplePreview,
} from '@/hooks/use-voice-sample-preview'
import {
  characterImageCount,
  characterWork,
  workLabelFromTag,
} from '@/lib/character-works'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { findLook } from '@/lib/card-bus'
import { lookLabel } from '@/lib/character-looks'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { cn } from '@/lib/utils'

/**
 * **角色详情**（owner 09-27：图片放顶上占四成左右 · 点哪改哪，原型 B）。
 *
 * ⭐ 白卡里从上到下：造型切换（角色④）→ 图片带（滚动区的 5/12 ≈ 扣掉上下留白后白卡的
 *   四成，横滑，「全部 / 这套造型 / 用她出的」）→ 名字 · 作品与张数 · 一句外观 → 设定四格
 *   （两栏）→ 标签 · 作品 → 她的 LoRA（只读）→ 删除。图、外观文字、标签跟着造型切。
 * ⭐ ⛔ 没有编辑态：每一格本身就是输入框（`CharacterInlineField`），离开就存；图片悬停
 *   露出「换一张 / 设为主图 / 移除」，图片带末尾常驻一格「添加图片」（图少时占住空位）。
 * ⚠ 每次只存改动的那一格：以**当前角色记录**为底合进这一格再发整份更新（设定里没露出来的
 *   格原样带回，见 `updateFromDraft`），⛔ 不留一份会过期的整页草稿。
 * ⚠ 图片带的高度是滚动容器的百分比 —— 它必须是滚动容器的**直接子元素**，百分比才有参照。
 * ⚠ 那一行（‹ 角色 · 用她）住在地台上、白卡外面（布局 A），右端是助手头像那一格。
 */

type ImageScope = 'all' | 'card' | 'made'
type Save = (patch: Partial<CharacterCardDraft>) => Promise<boolean>
type SaveLook = (patch: Partial<CharacterLookDraft>) => Promise<boolean>

export function CharacterDetailHeader({
  lead,
  onBack,
}: {
  /** 最左边那颗助手头像（库整页里才有，角色大项目 ①）。 */
  lead?: ReactNode
  onBack(): void
}) {
  const t = useTranslations('CharacterRoster')
  return (
    <>
      {lead}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-0.5 rounded-full py-1 coarse:min-h-11 pr-2 text-2sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t('title')}
      </button>
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
  lookId,
  onLookChange,
  onUpdate,
  onCreateLook,
  onUpdateLook,
  onDeleteLook,
  onDelete,
}: {
  card: CharacterCardRecord
  /** 正看着的那套造型（`null` = 默认）；与地台那一行的「用她 ▾」共用。 */
  lookId: string | null
  onLookChange(lookId: string | null): void
  onUpdate(data: UpdateCharacterCardRequest): Promise<boolean>
  onCreateLook(data: CreateCharacterLookRequest): Promise<string | null>
  onUpdateLook(
    lookId: string,
    data: UpdateCharacterLookRequest,
  ): Promise<boolean>
  onDeleteLook(lookId: string): Promise<boolean>
  onDelete(): Promise<boolean>
}) {
  const t = useTranslations('CharacterRoster')
  const locale = useLocale()
  const look = findLook(card, lookId)
  const save: Save = (patch) =>
    onUpdate(updateFromDraft(card, { ...draftFromCard(card), ...patch }))
  const saveLook: SaveLook = (patch) =>
    look.id
      ? onUpdateLook(look.id, lookUpdateFromDraft(look, patch))
      : Promise.resolve(false)
  const work = characterWork(card, locale)

  return (
    <div className="h-full overflow-y-auto px-5 pb-12 pt-6 sm:px-8 sm:pt-7">
      <CharacterLookStrip
        card={card}
        lookId={look.id}
        onSelect={onLookChange}
        onCreate={onCreateLook}
        onRename={(id, label) => onUpdateLook(id, { label })}
        onMakeDefault={(id) => onUpdateLook(id, { isDefault: true })}
        onDelete={async (id) => {
          const ok = await onDeleteLook(id)
          if (ok) onLookChange(null)
          return ok
        }}
      />
      <ImageBand card={card} look={look} save={saveLook} />

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
        <CharacterTextField
          label={t('fieldLooks')}
          value={look.description ?? ''}
          placeholder={t('fieldLooks')}
          limit={CHARACTER_CARD.DESCRIPTION_MAX_LENGTH}
          showLabel={false}
          clamp={false}
          onSave={(description) => saveLook({ description })}
          className="mt-1"
          textClassName="lg:text-md"
        />
      </div>

      <CharacterSettingModule card={card} save={save} />
      <TagsModule card={card} look={look} save={save} saveLook={saveLook} />
      <LorasModule card={card} />
      <DeleteCharacter name={card.name} onDelete={onDelete} />
    </div>
  )
}

/** 电脑详情各页签共用的那几样（角色大项目 ①）：手里这套造型 + 存一格 / 存造型一格。 */
interface CharacterPaneProps {
  card: CharacterCardRecord
  lookId: string | null
  onLookChange(lookId: string | null): void
  onUpdate(data: UpdateCharacterCardRequest): Promise<boolean>
  onCreateLook(data: CreateCharacterLookRequest): Promise<string | null>
  onUpdateLook(
    lookId: string,
    data: UpdateCharacterLookRequest,
  ): Promise<boolean>
  onDeleteLook(lookId: string): Promise<boolean>
}

function usePaneSave({
  card,
  lookId,
  onUpdate,
  onUpdateLook,
}: Pick<CharacterPaneProps, 'card' | 'lookId' | 'onUpdate' | 'onUpdateLook'>) {
  const look = findLook(card, lookId)
  const save: Save = (patch) =>
    onUpdate(updateFromDraft(card, { ...draftFromCard(card), ...patch }))
  const saveLook: SaveLook = (patch) =>
    look.id
      ? onUpdateLook(look.id, lookUpdateFromDraft(look, patch))
      : Promise.resolve(false)
  return { look, save, saveLook }
}

/**
 * 电脑详情「人物」页签：名字 + 设定（人物含声音 / 对话 / 酒馆三组，每格编辑 + 图钉，第 ② 步）。
 */
export function CharacterPersonPane(props: CharacterPaneProps) {
  const t = useTranslations('CharacterRoster')
  const { card } = props
  const { save } = usePaneSave(props)
  return (
    <div>
      <div className="mb-6 flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">{t('fieldName')}</p>
        <CharacterInlineField
          value={card.name}
          label={t('fieldName')}
          placeholder={t('fieldName')}
          onCommit={(name) => save({ name })}
          className="text-base lg:text-sm"
        />
      </div>
      <CharacterSettingModule card={card} save={save} />
    </div>
  )
}

/**
 * 电脑详情「图片」页签：造型切换 · 图片带 · 一句外观 · 标签与作品，原样搬过来（第 ⑧ 步再改）。
 * ⚠ 图片带的高度是滚动容器的百分比：这一页本身就是滚动容器。
 */
export function CharacterImagesPane(props: CharacterPaneProps) {
  const t = useTranslations('CharacterRoster')
  const { card, onLookChange, onCreateLook, onUpdateLook, onDeleteLook } = props
  const { look, save, saveLook } = usePaneSave(props)
  return (
    <div className="flex h-full flex-col gap-7 overflow-y-auto pb-12">
      <CharacterLookStrip
        card={card}
        lookId={look.id}
        onSelect={onLookChange}
        onCreate={onCreateLook}
        onRename={(id, label) => onUpdateLook(id, { label })}
        onMakeDefault={(id) => onUpdateLook(id, { isDefault: true })}
        onDelete={async (id) => {
          const ok = await onDeleteLook(id)
          if (ok) onLookChange(null)
          return ok
        }}
      />
      {/* 外观两格套一块灰框，与人物页同一种分组（样件 v4）；铺满整行（owner 10-30 嫌右边空）。 */}
      <SettingGroup title={t('settingLook')}>
        <CharacterTextField
          label={t('fieldLooks')}
          value={look.description ?? ''}
          limit={CHARACTER_CARD.DESCRIPTION_MAX_LENGTH}
          clamp={false}
          onSave={(description) => saveLook({ description })}
        />
        <TagsModule
          card={card}
          look={look}
          save={save}
          saveLook={saveLook}
          bare
        />
      </SettingGroup>
      <CharacterImageShelves card={card} look={look} save={saveLook} />
    </div>
  )
}

/** 电脑详情「LoRA」页签：她收的 LoRA，库那种格子 + 虚线添加 + 卸下（第 ⑧ 步）。 */
export function CharacterLorasPane({ card }: { card: CharacterCardRecord }) {
  return <CharacterLoraGrid card={card} />
}

function ImageBand({
  card,
  look,
  save,
}: {
  card: CharacterCardRecord
  look: CharacterLookRecord
  save: SaveLook
}) {
  const t = useTranslations('CharacterRoster')
  const [scope, setScope] = useState<ImageScope>('all')
  /** 素材库选择器开着时在做什么：加几张，或换掉某一格。 */
  const [picking, setPicking] = useState<
    { kind: 'add' } | { kind: 'replace'; slotId: string } | null
  >(null)
  const usage = useCharacterCardUsage(card.id, true)
  const madeCount = usage.total ?? card.generationCount
  const slots = look.referenceSlots
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

const PERSON_FIELDS = [
  ['identity', 'fieldIdentity'],
  ['behavior', 'fieldBehavior'],
  ['speech', 'fieldSpeech'],
  ['boundaries', 'fieldBoundaries'],
  ['backstory', 'fieldBackstory'],
] as const

/** 设定里的一组（人物 / 对话 / 酒馆）：一块浅灰底，owner 2026-10-15 选原型 A、10-29 定三组。 */
function SettingGroup({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-muted/60 px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{title}</p>
        {action}
      </div>
      {children}
    </div>
  )
}

/**
 * 一格的图钉（角色大项目第 ② 步）：钉住的格她整理聊天时不改、你叫助手改也拦下。
 */
function usePin(card: CharacterCardRecord, save: Save) {
  return (field: CharacterPinnableField) => ({
    pinned: card.pinnedFields.includes(field),
    onPinnedChange: (on: boolean) =>
      void save({
        pinnedFields: on
          ? [...card.pinnedFields, field]
          : card.pinnedFields.filter((item) => item !== field),
      }),
  })
}

/**
 * 人物组的「声音」格（第 ② 步，owner 10-30「从声音库拿」）：绑的那副嗓子 · 试听 · 换。
 * 挑选框就是声音库那一个（`VoicePickerDialog`），公开库的先收藏成音色卡再绑。
 */
function CharacterVoiceField({
  card,
  save,
}: {
  card: CharacterCardRecord
  save: Save
}) {
  const t = useTranslations('CharacterRoster')
  const voice = useVoiceCardDetail(card.voiceCardId)
  const preview = useVoiceSamplePreview()
  const [picking, setPicking] = useState(false)
  const target = voice
    ? {
        id: voice.id,
        url: voice.sampleAudioUrl ?? voice.referenceAudioUrl,
        voiceId: voice.voiceId,
      }
    : null
  const playing = target !== null && preview.playingId === target.id

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-h-7 items-center gap-1.5 text-xs text-muted-foreground">
        <p>{t('fieldVoice')}</p>
        <span className="flex-1" />
        <button
          type="button"
          data-testid="character-voice-pick"
          onClick={() => setPicking(true)}
          className="h-7 rounded-full px-2 transition-colors duration-fast ease-standard hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
        >
          {card.voiceCardId ? t('voiceChange') : t('voicePick')}
        </button>
      </div>
      {card.voiceCardId ? (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-background text-muted-foreground">
            {voice?.coverImage ? (
              <Image
                src={voice.coverImage}
                alt=""
                fill
                sizes="32px"
                className="object-cover"
              />
            ) : (
              <Mic className="size-4" aria-hidden />
            )}
          </span>
          <span className="min-w-0 truncate text-base lg:text-sm">
            {voice?.name ?? t('voiceLoading')}
          </span>
          {target && canPreviewVoiceSample(target) ? (
            <button
              type="button"
              aria-pressed={playing}
              onClick={() => preview.toggle(target)}
              className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-background px-2.5 text-xs text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
            >
              {preview.loadingId === target.id ? (
                <Spinner size="sm" />
              ) : playing ? (
                <Square className="size-3" aria-hidden />
              ) : (
                <Play className="size-3" aria-hidden />
              )}
              {playing ? t('voiceStop') : t('voicePreview')}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-base leading-relaxed text-muted-foreground lg:text-sm">
          {t('voiceEmpty')}
        </p>
      )}
      <VoicePickerDialog
        open={picking}
        onOpenChange={setPicking}
        onPick={(picked) => {
          preview.stop()
          void save({ voiceCardId: picked.id })
        }}
      />
    </div>
  )
}

/** 设定（人物 / 对话 / 酒馆三组）。配音间顶栏「人设 ▾ → 改设定」也就地开这一块（用户 10-25）。 */
export function CharacterSettingModule({
  card,
  save,
}: {
  card: CharacterCardRecord
  save: Save
}) {
  const t = useTranslations('CharacterRoster')
  const reading = useCharacterSampleLines(card.id)
  const tErrors = useTranslations('Errors')
  const [speechEditing, setSpeechEditing] = useState(false)
  const pin = usePin(card, save)
  const persona = card.persona
  const written = PERSON_FIELDS.some(([key]) => persona?.[key]?.trim())

  return (
    <section className="mb-8 flex flex-col gap-3">
      <h3 className="text-base font-semibold">{t('setting')}</h3>
      <SettingGroup title={t('settingPerson')}>
        {/* 平板（<1280）一列、电脑两列：owner 10-30「平板上也改成一页」。 */}
        <div className="grid gap-x-10 gap-y-5 xl:grid-cols-2">
          {PERSON_FIELDS.map(([key, label]) => (
            <CharacterTextField
              key={key}
              label={t(label)}
              value={persona?.[key] ?? ''}
              limit={CHARACTER_PERSONA_LIMITS[key]}
              hint={key === 'behavior' ? t('behaviorHint') : undefined}
              // 经历最长，单独占一整行（五格排两列不留孤格）。
              className={key === 'backstory' ? 'xl:col-span-2' : undefined}
              onSave={(text) => save({ [key]: text })}
              {...pin(key)}
              {...(key === 'speech'
                ? { editing: speechEditing, onEditingChange: setSpeechEditing }
                : {})}
            />
          ))}
          <CharacterVoiceField card={card} save={save} />
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
                {/* 「像她」= 这两句存进对话示例（10-26「更像真人」A）：试读一次攒一次，不想要的去示例里删。 */}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const lines = reading.lines ?? []
                    reading.clear()
                    void save({
                      examples: examplesToTavernText(
                        [
                          ...(persona?.examples ?? []),
                          ...lines.map((reply) => ({ user: '', reply })),
                        ].slice(0, CHARACTER_PERSONA_LIMITS.examples),
                      ),
                    })
                  }}
                >
                  {t('readingLike')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    reading.clear()
                    setSpeechEditing(true)
                  }}
                >
                  {t('readingUnlike')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => void reading.run()}
                disabled={reading.isLoading}
                className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
              >
                {reading.isLoading ? <Spinner size="sm" /> : null}
                {reading.error ? t('readingFailed') : t('readingTry')}
              </button>
              {/* 助手那一家跑不了就照实说（owner 2026-10-15「全跟助手」），⛔ 不悄悄换一家。 */}
              {reading.reason && !reading.isLoading ? (
                <p role="status" className="text-xs text-muted-foreground">
                  {getApiErrorMessage(
                    tErrors,
                    reading.reason,
                    reading.reason.error,
                  )}
                </p>
              ) : null}
            </div>
          )
        ) : null}
      </SettingGroup>
      <SettingTavernGroups card={card} save={save} />
    </section>
  )
}

/** 世界书只认条目数（内容原样存着，不在这里改）。 */
function lorebookEntryCount(book: unknown): number {
  if (!book || typeof book !== 'object' || !('entries' in book)) return 0
  const entries = book.entries
  if (Array.isArray(entries)) return entries.length
  return entries && typeof entries === 'object'
    ? Object.keys(entries).length
    : 0
}

/**
 * 「设定」的对话一组 + 酒馆一组（第 ② 步 owner 10-29 定三组；⛔ 再折起来）。格名只用我们的叫法，
 * 每格写一句它是干什么的：系统提示 / 历史后指令只在和她聊天时生效（⛔ 进工作台），世界书已生效、只读。
 */
function SettingTavernGroups({
  card,
  save,
}: {
  card: CharacterCardRecord
  save: Save
}) {
  const t = useTranslations('CharacterRoster')
  const tErrors = useTranslations('Errors')
  const [adding, setAdding] = useState(false)
  const pin = usePin(card, save)
  const drafting = useCharacterDialogueDraft(card.id)
  const draft = draftFromCard(card)
  const draftButton = (kind: CharacterDialogueDraftKind) => (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() =>
          void drafting.run(kind).then((result) => {
            if (!result) return
            if ('examples' in result)
              void save({ examples: examplesToTavernText(result.examples) })
            else void save({ opening: result.opening })
          })
        }
        disabled={drafting.running !== null}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
      >
        {drafting.running === kind ? <Spinner size="sm" /> : null}
        {drafting.failed === kind
          ? t('draftFailed')
          : t(kind === 'examples' ? 'draftExamples' : 'draftOpening')}
      </button>
      {drafting.failed === kind && drafting.reason ? (
        <p role="status" className="text-xs text-muted-foreground">
          {getApiErrorMessage(tErrors, drafting.reason, drafting.reason.error)}
        </p>
      ) : null}
    </div>
  )
  const greetings = draft.alternateGreetings
  const lorebook = lorebookEntryCount(card.tavern?.characterBook)

  return (
    <>
      <SettingGroup title={t('settingDialogue')}>
        <div className="grid gap-x-10 gap-y-5 xl:grid-cols-2">
          <CharacterTextField
            label={t('fieldScenario')}
            value={draft.scenario}
            limit={CHARACTER_PERSONA_LIMITS.scenario}
            onSave={(text) => save({ scenario: text })}
            {...pin('scenario')}
          />
          <div className="flex min-w-0 flex-col gap-2">
            <CharacterTextField
              label={t('fieldOpening')}
              value={draft.opening}
              limit={CHARACTER_PERSONA_LIMITS.opening}
              onSave={(text) => save({ opening: text })}
              {...pin('opening')}
            />
            {draft.opening.trim() ? null : draftButton('opening')}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <CharacterTextField
              label={t('fieldExamples')}
              value={draft.examples}
              hint={t('examplesHint')}
              onSave={(text) => save({ examples: text })}
              {...pin('examples')}
            />
            {draft.examples.trim() ? null : draftButton('examples')}
          </div>
          {/* 几种口吻 / 学到的说法（10-26「更像真人」F）：聊天每轮挑一种口吻；说法是聊天里从你的话学来的。 */}
          <CharacterTextField
            label={t('fieldMoods')}
            value={draft.moods}
            hint={t('moodsHint')}
            onSave={(text) => save({ moods: text })}
            {...pin('moods')}
          />
          <CharacterTextField
            label={t('fieldLearnedPhrases')}
            value={draft.learnedPhrases}
            hint={t('learnedPhrasesHint')}
            onSave={(text) => save({ learnedPhrases: text })}
            {...pin('learnedPhrases')}
          />
          {/* 和你的关系（10-26「更像真人」C）：她整理聊天时自己写，称呼跟着它。 */}
          <CharacterTextField
            label={t('fieldRelationship')}
            value={draft.relationship}
            limit={CHARACTER_PERSONA_LIMITS.relationship}
            hint={t('relationshipHint')}
            onSave={(text) => save({ relationship: text })}
            {...pin('relationship')}
          />
          <div className="flex min-w-0 flex-col gap-3">
            {greetings.map((greeting, index) => (
              <CharacterTextField
                key={`${index}-${greeting}`}
                label={t('alternateGreetingLabel', { index: index + 1 })}
                value={greeting}
                limit={CHARACTER_PERSONA_LIMITS.opening}
                hint={t('alternateGreetingHint')}
                onSave={(text) =>
                  save({
                    alternateGreetings: text
                      ? greetings.map((item, i) => (i === index ? text : item))
                      : greetings.filter((_, i) => i !== index),
                  })
                }
              />
            ))}
            {greetings.length < TAVERN_CARD.MAX_ALTERNATE_GREETINGS ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground"
              >
                <Plus className="size-3.5" aria-hidden />
                {t('alternateGreetingAdd')}
              </button>
            ) : null}
            <CharacterFieldEditor
              open={adding}
              label={t('alternateGreetingLabel', {
                index: greetings.length + 1,
              })}
              value=""
              limit={CHARACTER_PERSONA_LIMITS.opening}
              onSave={(text) =>
                save({ alternateGreetings: [...greetings, text] })
              }
              onClose={() => setAdding(false)}
            />
          </div>
        </div>
      </SettingGroup>

      <SettingGroup title={t('settingTavern')}>
        <div className="grid gap-x-10 gap-y-5 xl:grid-cols-2">
          <CharacterTextField
            label={t('fieldSummary')}
            value={draft.summary}
            limit={CHARACTER_CARD.SUMMARY_MAX_LENGTH}
            hint={t('summaryWhat')}
            onSave={(text) => save({ summary: text })}
          />
          <CharacterTextField
            label={t('fieldSystemPrompt')}
            value={draft.systemPrompt}
            hint={t('systemPromptWhat')}
            onSave={(text) => save({ systemPrompt: text })}
          />
          <CharacterTextField
            label={t('fieldPostHistory')}
            value={draft.postHistoryInstructions}
            hint={t('postHistoryWhat')}
            onSave={(text) => save({ postHistoryInstructions: text })}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="flex min-h-7 items-center text-xs text-muted-foreground">
              {t('fieldLorebook')}
            </p>
            <p className="text-xs text-muted-foreground">{t('lorebookWhat')}</p>
            <p className="text-base leading-relaxed lg:text-sm">
              {lorebook
                ? t('lorebookCount', { count: lorebook })
                : t('emptyField')}
            </p>
          </div>
        </div>
      </SettingGroup>
    </>
  )
}

function TagsModule({
  card,
  look,
  save,
  saveLook,
  bare = false,
}: {
  card: CharacterCardRecord
  look: CharacterLookRecord
  save: Save
  saveLook: SaveLook
  /** 电脑详情页签里：⛔ 顶上那道分隔线。 */
  bare?: boolean
}) {
  const t = useTranslations('CharacterRoster')
  const locale = useLocale()
  const tagWork = characterWork(card, locale).tag
  const tagWorkLabel = tagWork ? workLabelFromTag(tagWork, locale) : null

  return (
    <section
      className={cn(
        'flex flex-col gap-4',
        !bare && 'mb-8 border-t border-border pt-6',
      )}
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-muted-foreground">{t('fieldTags')}</p>
        {/* 标签是一段逗号隔开的字（owner 2026-10-24 ㉘），与标签台同一个写法。 */}
        <CharacterInlineField
          multiline
          value={look.tags.join(', ')}
          label={t('fieldTags')}
          placeholder={t('tagsTitle')}
          onCommit={(text) => saveLook({ tags: splitCharacterTags(text) })}
          className="font-mono text-base lg:text-xs"
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
            className="text-base lg:text-sm"
          />
        </div>
      </div>
    </section>
  )
}

/**
 * 她的 LoRA（角色③，owner 2026-10-22「顶多可以查看」）：只读。收进来在 LoRA 库详情
 * 「加到角色…」或从「用她 ▾」训练，挂在 LoRA 台「从角色选」。挂在某套造型下的
 * 标出造型名（角色④）。
 */
function LorasModule({ card }: { card: CharacterCardRecord }) {
  const t = useTranslations('CharacterRoster')
  const tLooks = useTranslations('CharacterLooks')
  const { groups, isLoading } = useCharacterLoras(card.id)
  const loras = groups[0]?.loras ?? []
  const lookName = (lookId: string | null) => {
    const look = lookId
      ? card.looks.find((item) => item.id === lookId)
      : undefined
    return look ? lookLabel(look, card.looks, tLooks) : null
  }
  return (
    <section className="mb-8 flex flex-col gap-3 border-t border-border pt-6">
      <p className="text-xs text-muted-foreground">{t('fieldLoras')}</p>
      {isLoading && loras.length === 0 ? (
        <Spinner />
      ) : loras.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('lorasEmpty')}</p>
      ) : (
        <ul className="flex max-w-3xl flex-wrap gap-2">
          {loras.map((lora) => (
            <li
              key={lora.id}
              className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/60 py-1 pl-1 pr-3 text-sm"
            >
              {lora.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyCivitaiImageUrl(lora.coverImageUrl)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-8 shrink-0 rounded-md bg-muted object-cover"
                />
              ) : null}
              <span className="min-w-0 truncate">{lora.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {[lookName(lora.lookId), lora.baseModelFamily]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
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
