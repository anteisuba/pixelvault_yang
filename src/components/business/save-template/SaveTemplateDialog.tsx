'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { CHARACTER_CARD } from '@/constants/cards/character-card'
import type { RecipeCharacterLink } from '@/types'
import { lookLabel } from '@/lib/character-looks'
import { cn } from '@/lib/utils'
import { Check, Plus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCharacterCards } from '@/features/cards/hooks'

/** 「存哪些」里的一格（各入口自己给：标签台 / LoRA 台 / 图片台 / 查看器各不相同）。 */
export interface SaveTemplateOption {
  key: string
  label: string
  /** 右边一行灰字，比如「画师串 3 个」「2 个」。 */
  detail?: string
  /** 总要存的那一格（提示词 / 整体标签）：勾着、点不动。 */
  locked?: boolean
}

export interface SaveTemplateResult {
  name: string
  /** 每一格勾没勾（默认全勾）。 */
  include: Record<string, boolean>
  link: RecipeCharacterLink | null
  alsoImages: boolean
  alsoStickers: boolean
}

const NO_CHARACTER = '__none__'

/**
 * 通用「存成模板」框（owner 11-01 定，稿 tag-studio-ui/q4）：所有入口都弹它，
 * 同一个框，只有「存哪些」按来源变。
 *
 * - 封面 = 这张图；名字可改。
 * - 挂到：角色 + 造型药丸（可「＋ 新造型」，可「不挂角色」）。
 * - 存哪些：默认全勾，不想改直接点「存」= 一下。
 * - 挂了角色、手上又有一张图时才有「也放进她的图片 / 表情包」，默认不勾。
 */
export function SaveTemplateDialog({
  open,
  onOpenChange,
  coverUrl,
  defaultName,
  options,
  defaultLink,
  canAttachImage,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  coverUrl: string | null
  defaultName: string
  options: readonly SaveTemplateOption[]
  defaultLink: RecipeCharacterLink | null
  /** 手上有一张出过的图（才能「也放进她的图片 / 表情包」）。 */
  canAttachImage: boolean
  /** 成功返回 `true` 关框；失败由调用方提示，框留着。 */
  onSave: (result: SaveTemplateResult) => Promise<boolean>
}) {
  const t = useTranslations('SaveTemplate')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-5">
        <DialogTitle className="mb-3 text-sm font-semibold">
          {t('title')}
        </DialogTitle>
        {open ? (
          <SaveTemplateBody
            coverUrl={coverUrl}
            defaultName={defaultName}
            options={options}
            defaultLink={defaultLink}
            canAttachImage={canAttachImage}
            onCancel={() => onOpenChange(false)}
            onSave={async (result) => {
              const ok = await onSave(result)
              if (ok) onOpenChange(false)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SaveTemplateBody({
  coverUrl,
  defaultName,
  options,
  defaultLink,
  canAttachImage,
  onCancel,
  onSave,
}: {
  coverUrl: string | null
  defaultName: string
  options: readonly SaveTemplateOption[]
  defaultLink: RecipeCharacterLink | null
  canAttachImage: boolean
  onCancel: () => void
  onSave: (result: SaveTemplateResult) => Promise<void>
}) {
  const t = useTranslations('SaveTemplate')
  const tLooks = useTranslations('CharacterLooks')
  const { cards, findCard, createLook } = useCharacterCards()
  const [name, setName] = useState(defaultName)
  const [include, setInclude] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(options.map((option) => [option.key, true])),
  )
  const [cardId, setCardId] = useState<string | null>(
    defaultLink?.cardId ?? null,
  )
  const [lookId, setLookId] = useState<string | null>(
    defaultLink?.lookId ?? null,
  )
  const [newLook, setNewLook] = useState<string | null>(null)
  const [alsoImages, setAlsoImages] = useState(false)
  const [alsoStickers, setAlsoStickers] = useState(false)
  const [saving, setSaving] = useState(false)
  const card = cardId ? findCard(cardId) : null
  const look =
    card?.looks.find((item) => item.id === lookId) ??
    card?.looks.find((item) => item.isDefault) ??
    card?.looks[0] ??
    null

  const addLook = async () => {
    const label = newLook?.trim()
    if (!card || !label) return
    const id = await createLook(card.id, { label })
    if (!id) return
    setLookId(id)
    setNewLook(null)
  }

  const submit = async () => {
    if (saving) return
    setSaving(true)
    try {
      const link = card && look ? { cardId: card.id, lookId: look.id } : null
      await onSave({
        name: name.trim() || defaultName,
        include,
        link,
        alsoImages: Boolean(link && canAttachImage && alsoImages),
        alsoStickers: Boolean(link && canAttachImage && alsoStickers),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- R2 封面，小图不走 next/image
          <img
            src={coverUrl}
            alt=""
            className="aspect-3/4 w-24 shrink-0 rounded-lg bg-muted object-cover"
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-3xs text-muted-foreground">{t('name')}</span>
            <input
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-3xs text-muted-foreground">
              {t('hangTo')}
            </span>
            <Select
              value={cardId ?? NO_CHARACTER}
              onValueChange={(next) => {
                setCardId(next === NO_CHARACTER ? null : next)
                setLookId(null)
                setNewLook(null)
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CHARACTER}>{t('noCharacter')}</SelectItem>
                {cards.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {card ? (
              <div className="flex flex-wrap gap-1 pt-1">
                {card.looks.map((item) => {
                  const on = item.id === look?.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setLookId(item.id)}
                      className={cn(
                        'h-7 rounded-full border border-border px-2.5 text-2xs transition-colors duration-fast ease-standard hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        on &&
                          'border-foreground bg-foreground text-background hover:bg-foreground',
                      )}
                    >
                      {lookLabel(item, card.looks, tLooks)}
                    </button>
                  )
                })}
                {newLook === null ? (
                  card.looks.length < CHARACTER_CARD.MAX_LOOKS_PER_CARD ? (
                    <button
                      type="button"
                      onClick={() => setNewLook('')}
                      className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="size-3" aria-hidden />
                      {tLooks('add')}
                    </button>
                  ) : null
                ) : (
                  <span className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={newLook}
                      maxLength={CHARACTER_CARD.LOOK_LABEL_MAX_LENGTH}
                      placeholder={tLooks('namePlaceholder')}
                      onChange={(event) => setNewLook(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void addLook()
                        }
                        if (event.key === 'Escape') {
                          event.stopPropagation()
                          setNewLook(null)
                        }
                      }}
                      className="h-7 w-28 rounded-full border border-border bg-background px-2.5 text-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <button
                      type="button"
                      aria-label={tLooks('save')}
                      disabled={!newLook.trim()}
                      onClick={() => void addLook()}
                      className="grid size-7 place-items-center rounded-full bg-foreground text-background disabled:opacity-50"
                    >
                      <Check className="size-3.5" aria-hidden />
                    </button>
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {options.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <span className="text-3xs text-muted-foreground">{t('include')}</span>
          <div className="grid grid-cols-2 gap-x-4">
            {options.map((option) => (
              <Tick
                key={option.key}
                checked={include[option.key] !== false}
                onChange={(next) =>
                  setInclude((current) => ({ ...current, [option.key]: next }))
                }
                label={option.label}
                detail={option.detail}
                disabled={option.locked}
              />
            ))}
          </div>
        </div>
      ) : null}
      {card && canAttachImage ? (
        <div className="flex flex-col border-t border-border pt-2">
          <Tick
            checked={alsoImages}
            onChange={setAlsoImages}
            label={t('alsoImages')}
          />
          <Tick
            checked={alsoStickers}
            onChange={setAlsoStickers}
            label={t('alsoStickers')}
          />
        </div>
      ) : null}
      <DialogFooter className="mt-1 flex-row justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="button" disabled={saving} onClick={() => void submit()}>
          {t('save')}
        </Button>
      </DialogFooter>
    </div>
  )
}

function Tick({
  checked,
  onChange,
  label,
  detail,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  detail?: string
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex h-9 cursor-pointer items-center gap-2 text-xs',
        disabled && 'cursor-default text-muted-foreground',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-foreground"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? (
        <span className="text-3xs text-muted-foreground">{detail}</span>
      ) : null}
    </label>
  )
}
