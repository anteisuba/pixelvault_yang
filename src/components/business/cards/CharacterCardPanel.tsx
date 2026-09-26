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
import type {
  CharacterCardRecord,
  CharacterReferenceSlot,
  UpdateCharacterCardRequest,
} from '@/types'
import { ChevronRight, Plus, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import {
  updateFromDraft,
  useCharacterCardEditor,
} from '@/hooks/cards/use-character-card-editor'
import { useCharacterCardUsage } from '@/hooks/cards/use-character-card-usage'
import { useCharacterSampleLines } from '@/hooks/cards/use-character-sample-lines'
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
  onUpdate(data: UpdateCharacterCardRequest): Promise<boolean>
  onDelete(): Promise<boolean>
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
  onUpdate,
  onDelete,
  showClose,
}: CharacterCardPanelProps) {
  const t = useTranslations('CharacterRoster')
  const reducedMotion = useReducedMotion() ?? false
  const [openRow, setOpenRow] = useState<RowId | null>('looks')
  const [editing, setEditing] = useState(false)
  const reading = useCharacterSampleLines(card.id)
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
        {editing ? null : (
          <div className="mt-4 flex items-center gap-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
            >
              {t('edit')}
            </Button>
          </div>
        )}
      </motion.div>

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
          className="min-h-0 flex-1 overflow-y-auto px-7 pb-9"
        >
          <PanelRow
            id="looks"
            title={t('looks')}
            meta={
              slots.length ? t('imageCount', { count: slots.length }) : null
            }
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
            {settingFields.length ? (
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
                        setEditing(true)
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
      )}
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

const LABEL = 'text-xs text-muted-foreground'

/**
 * 就地编辑（施工第 4 片）：名字 · 参考图 · 一句外观 · 标签 · 设定四格。
 * ⭐ 图片：设为主图 / 移除 / 加一张（先进素材库）；主图永远是身份图，至少留一张。
 * ⭐ 性格写行为、不写形容词（写剧本的助手拿到行为才知道怎么演）。
 */
function CharacterCardEditor({
  card,
  onSave,
  onCancel,
  onDelete,
}: {
  card: CharacterCardRecord
  onSave(data: UpdateCharacterCardRequest): Promise<boolean>
  onCancel(): void
  onDelete(): Promise<boolean>
}) {
  const t = useTranslations('CharacterRoster')
  const editor = useCharacterCardEditor(card)
  const { draft, patch } = editor
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = async () => {
    setSaving(true)
    await onSave(updateFromDraft(card, draft))
    setSaving(false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-7 pb-6 pt-2">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>{t('fieldName')}</span>
          <Input
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </label>

        <section className="flex flex-col gap-3">
          <h3 className="text-base">{t('looks')}</h3>
          <div className="grid grid-cols-3 gap-2.5">
            {draft.slots.map((slot) => (
              <div key={slot.id} className="flex flex-col gap-1.5">
                <div className="relative aspect-4/5 overflow-hidden rounded-xl bg-muted">
                  <Image
                    src={slot.url}
                    alt=""
                    fill
                    sizes="120px"
                    className="object-cover"
                  />
                  {slot.isPrimary ? (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-background/90 px-2 py-0.5 text-2xs">
                      {t('primary')}
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <label
                    className={cn(
                      'cursor-pointer hover:text-foreground',
                      editor.isUploading && 'pointer-events-none opacity-60',
                    )}
                  >
                    {t('replaceImage')}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (file) void editor.replaceImage(slot.id, file)
                      }}
                    />
                  </label>
                  {slot.isPrimary ? null : (
                    <button
                      type="button"
                      onClick={() => editor.setPrimary(slot.id)}
                      className="hover:text-foreground"
                    >
                      {t('makePrimary')}
                    </button>
                  )}
                  {draft.slots.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => editor.remove(slot.id)}
                      className="hover:text-foreground"
                    >
                      {t('removeImage')}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            <label
              className={cn(
                'flex aspect-4/5 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground',
                editor.isUploading && 'pointer-events-none opacity-60',
              )}
            >
              {editor.isUploading ? (
                <Spinner size="sm" />
              ) : (
                <Plus className="size-4" />
              )}
              {t('addImage')}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void editor.addImage(file)
                }}
              />
            </label>
          </div>
          {editor.uploadError ? (
            <p className="text-xs text-status-risk">{t('uploadFailed')}</p>
          ) : null}
          <p className={LABEL}>{t('addImageHint')}</p>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>{t('fieldLooks')}</span>
            <Textarea
              rows={2}
              value={draft.description}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>{t('fieldCharacterTags')}</span>
            <Input
              value={draft.characterTags}
              placeholder="denia_(wuthering_waves)"
              onChange={(event) => patch({ characterTags: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>{t('fieldAppearanceTags')}</span>
            <Input
              value={draft.appearanceTags}
              placeholder="pink_hair, red_gloves"
              onChange={(event) =>
                patch({ appearanceTags: event.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>{t('fieldLoraTrigger')}</span>
            <Input
              value={draft.loraTrigger}
              onChange={(event) => patch({ loraTrigger: event.target.value })}
            />
          </label>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-base">{t('setting')}</h3>
          {(
            [
              ['identity', 'fieldIdentity', 2],
              ['behavior', 'fieldBehavior', 3],
              ['speech', 'fieldSpeech', 3],
              ['backstory', 'fieldBackstory', 5],
            ] as const
          ).map(([key, label, rows]) => (
            <label key={key} className="flex flex-col gap-1.5">
              <span className={LABEL}>{t(label)}</span>
              <Textarea
                rows={rows}
                value={draft[key]}
                onChange={(event) => patch({ [key]: event.target.value })}
              />
              {key === 'behavior' ? (
                <span className={LABEL}>{t('behaviorHint')}</span>
              ) : null}
            </label>
          ))}
        </section>

        <div className="border-t border-border pt-4">
          {confirmDelete ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-sm">
                {t('deleteConfirm', { name: card.name })}
              </p>
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
                  onClick={() => setConfirmDelete(false)}
                >
                  {t('cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-muted-foreground transition-colors duration-fast hover:text-status-risk"
            >
              {t('deleteCharacter')}
            </button>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5 border-t border-border px-7 py-4">
        <Button
          type="button"
          onClick={() => void save()}
          disabled={saving || editor.isUploading}
        >
          {saving ? <Spinner size="sm" /> : null}
          {t('save')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </div>
  )
}
