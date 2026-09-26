'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'

import type { CharacterCardRecord, UpdateCharacterCardRequest } from '@/types'
import { Plus } from '@/components/icons'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import {
  updateFromDraft,
  useCharacterCardEditor,
} from '@/hooks/cards/use-character-card-editor'
import {
  workLabelFromTag,
  workTagFromCharacterTag,
} from '@/lib/character-works'

const LABEL = 'text-xs text-muted-foreground'

/**
 * 就地编辑（施工第 4 片）：名字 · 参考图 · 一句外观 · 标签 · 设定四格。
 * ⭐ 图片：设为主图 / 移除 / 加一张（先进素材库）；主图永远是身份图，至少留一张。
 * ⭐ 性格写行为、不写形容词（写剧本的助手拿到行为才知道怎么演）。
 */
export function CharacterCardEditor({
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
  const locale = useLocale()
  const tagWork = draft.characterTags
    .split(/[,，\n]/)
    .map((tag) => workTagFromCharacterTag(tag))
    .find((tag): tag is string => tag !== null)
  const tagWorkLabel = tagWork ? workLabelFromTag(tagWork, locale) : null
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** 素材库选择器开着时在做什么：加几张，或换掉某一格。 */
  const [picking, setPicking] = useState<
    { kind: 'add' } | { kind: 'replace'; slotId: string } | null
  >(null)

  const save = async () => {
    setSaving(true)
    await onSave(updateFromDraft(card, draft))
    setSaving(false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-8 pt-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>{t('fieldName')}</span>
            <Input
              value={draft.name}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </label>

          <section className="flex flex-col gap-3">
            <h3 className="text-base">{t('looks')}</h3>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
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
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 whitespace-nowrap text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={() =>
                        setPicking({ kind: 'replace', slotId: slot.id })
                      }
                      className="hover:text-foreground"
                    >
                      {t('replaceImage')}
                    </button>
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
              {editor.remainingSlots > 0 ? (
                <button
                  type="button"
                  onClick={() => setPicking({ kind: 'add' })}
                  className="flex aspect-4/5 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground"
                >
                  <Plus className="size-4" />
                  {t('addImage')}
                </button>
              ) : null}
            </div>
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
                placeholder={t('example', { value: 'denia_(wuthering_waves)' })}
                onChange={(event) =>
                  patch({ characterTags: event.target.value })
                }
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>{t('fieldWork')}</span>
              <Input
                value={draft.work}
                placeholder={tagWorkLabel ?? t('workOriginal')}
                onChange={(event) => patch({ work: event.target.value })}
              />
              <span className={LABEL}>
                {tagWorkLabel
                  ? t('workFromTag', { work: tagWorkLabel })
                  : t('workNoTag')}
              </span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL}>{t('fieldAppearanceTags')}</span>
              <Input
                value={draft.appearanceTags}
                placeholder={t('example', { value: 'pink_hair, red_gloves' })}
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
      </div>
      <div className="shrink-0 border-t border-border px-7 py-4">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2.5">
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? <Spinner size="sm" /> : null}
            {t('save')}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('cancel')}
          </Button>
        </div>
      </div>
      <AssetSelectorDialog
        open={picking !== null}
        onOpenChange={(open) => {
          if (!open) setPicking(null)
        }}
        title={t('pickTitle')}
        description={t('addImageHint')}
        mediaType="image"
        multiSelect={picking?.kind === 'add'}
        maxSelection={editor.remainingSlots}
        onConfirmMany={editor.addImages}
        onSelect={(generation) => {
          if (picking?.kind === 'replace')
            editor.replaceImage(picking.slotId, generation)
        }}
      />
    </div>
  )
}
