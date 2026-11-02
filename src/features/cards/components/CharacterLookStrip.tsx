'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { CHARACTER_CARD } from '@/constants/cards/character-card'
import type { CharacterCardRecord, CreateCharacterLookRequest } from '@/types'
import { Check, Plus } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { findLook } from '@/lib/card-bus'
import { lookLabel } from '@/lib/character-looks'
import { cn } from '@/lib/utils'

interface CharacterLookStripProps {
  card: CharacterCardRecord
  /** 正看着的那套；`null` = 默认造型。 */
  lookId: string | null
  onSelect(lookId: string): void
  /** 成功返回新造型的 id（建好直接切过去）。 */
  onCreate(data: CreateCharacterLookRequest): Promise<string | null>
  onRename(lookId: string, label: string | null): Promise<boolean>
  onMakeDefault(lookId: string): Promise<boolean>
  onDelete(lookId: string): Promise<boolean>
}

/**
 * 角色详情最上面的**造型切换**（角色④，owner 2026-10-22）：默认 · 其他造型 · ＋。
 * 下面的图、外观文字、标签都跟着切到这一套；人设和声音只有一份，不跟着切。
 * 正看着的那套在行尾露「改名 / 设为默认 / 删除」。
 *
 * ⚠ 现阶段用现有组件拼最简版本，统一样式留到 UI 阶段。
 */
export function CharacterLookStrip({
  card,
  lookId,
  onSelect,
  onCreate,
  onRename,
  onMakeDefault,
  onDelete,
}: CharacterLookStripProps) {
  const t = useTranslations('CharacterLooks')
  const active = findLook(card, lookId)
  const [naming, setNaming] = useState<'create' | 'rename' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const label = (look: (typeof card.looks)[number]) =>
    lookLabel(look, card.looks, t)
  const canAdd = card.looks.length < CHARACTER_CARD.MAX_LOOKS_PER_CARD

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div
        role="group"
        aria-label={t('title')}
        className="flex min-w-0 gap-1 overflow-x-auto rounded-full bg-muted p-0.5"
      >
        {card.looks.map((look) => (
          <button
            key={look.id}
            type="button"
            aria-pressed={look.id === active.id}
            onClick={() => onSelect(look.id)}
            className={cn(
              'shrink-0 rounded-full px-3 py-0.5 text-xs transition-colors duration-fast coarse:min-h-11',
              look.id === active.id
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label(look)}
            {look.isDefault && look.label ? (
              <span className="ml-1 text-muted-foreground">
                · {t('default')}
              </span>
            ) : null}
          </button>
        ))}
        {canAdd ? (
          <button
            type="button"
            aria-label={t('add')}
            onClick={() => setNaming('create')}
            className="grid shrink-0 place-items-center rounded-full px-2 text-muted-foreground transition-colors duration-fast hover:text-foreground coarse:min-h-11 coarse:min-w-11"
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {active.id ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <StripAction onClick={() => setNaming('rename')}>
            {t('rename')}
          </StripAction>
          {active.isDefault ? null : (
            <StripAction onClick={() => void onMakeDefault(active.id)}>
              {t('makeDefault')}
            </StripAction>
          )}
          {card.looks.length > 1 ? (
            <StripAction onClick={() => setDeleting(true)}>
              {t('delete')}
            </StripAction>
          ) : null}
        </div>
      ) : null}

      {naming ? (
        <LookNameDialog
          mode={naming}
          initial={naming === 'rename' ? (active.label ?? '') : ''}
          copySource={label(active)}
          onClose={() => setNaming(null)}
          onSubmit={async (name, copy) => {
            if (naming === 'rename') return onRename(active.id, name || null)
            const id = await onCreate({
              label: name,
              ...(copy && active.id ? { copyFromLookId: active.id } : {}),
            })
            if (id) onSelect(id)
            return id !== null
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('deleteTitle', { name: label(active) })}
        description={t('deleteHint')}
        cancelLabel={t('cancel')}
        confirmLabel={t('delete')}
        variant="destructive"
        onConfirm={() => void onDelete(active.id)}
      />
    </div>
  )
}

function StripAction({
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
      className="transition-colors duration-fast hover:text-foreground coarse:min-h-11"
    >
      {children}
    </button>
  )
}

function LookNameDialog({
  mode,
  initial,
  copySource,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'rename'
  initial: string
  /** 「从当前造型复制」里那套的名字。 */
  copySource: string
  onClose(): void
  onSubmit(name: string, copy: boolean): Promise<boolean>
}) {
  const t = useTranslations('CharacterLooks')
  const [name, setName] = useState(initial)
  const [copy, setCopy] = useState(false)
  const [saving, setSaving] = useState(false)
  const trimmed = name.trim()
  const canSave = mode === 'rename' || trimmed.length > 0

  const submit = async () => {
    if (!canSave || saving) return
    setSaving(true)
    const ok = await onSubmit(trimmed, copy)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex flex-col gap-3 sm:max-w-sm">
        <DialogTitle className="text-base">
          {mode === 'create' ? t('add') : t('rename')}
        </DialogTitle>
        <Input
          autoFocus
          value={name}
          maxLength={CHARACTER_CARD.LOOK_LABEL_MAX_LENGTH}
          placeholder={t('namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit()
          }}
        />
        {mode === 'create' ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={copy}
            onClick={() => setCopy((value) => !value)}
            className="flex items-center gap-2 self-start text-sm text-muted-foreground"
          >
            <span
              aria-hidden
              className={cn(
                'grid size-4 shrink-0 place-items-center rounded border',
                copy
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border',
              )}
            >
              {copy ? <Check className="size-3" /> : null}
            </span>
            {t('copyFrom', { name: copySource })}
          </button>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!canSave || saving}
            onClick={() => void submit()}
          >
            {t('save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
