'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { CHARACTER_CARD } from '@/constants/cards/character-card'
import type { CharacterCardRecord, CreateCharacterLookRequest } from '@/types'
import { Check, MoreHorizontal, Pencil, Plus, Trash2 } from '@/components/icons'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { FormDialog, FormDialogActions } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuTrigger,
} from '@/components/ui/responsive-menu'
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
  /**
   * `column` = 角色页「模板」页签左列（owner 11-01 定 C）：竖排一套一行、末尾「＋ 新造型」，
   * 改名 / 设为默认 / 删除排在下面。默认 `row` = 原来那条横的。
   */
  orientation?: 'row' | 'column'
  /** 竖排时每一行右边的灰字（比如这一套有几张模板）。 */
  meta?(lookId: string): string | null
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
  orientation = 'row',
  meta,
}: CharacterLookStripProps) {
  const t = useTranslations('CharacterLooks')
  const active = findLook(card, lookId)
  const [naming, setNaming] = useState<'create' | 'rename' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const label = (look: (typeof card.looks)[number]) =>
    lookLabel(look, card.looks, t)
  const canAdd = card.looks.length < CHARACTER_CARD.MAX_LOOKS_PER_CARD
  const column = orientation === 'column'

  return (
    <div
      className={cn(
        column
          ? 'flex flex-col gap-3'
          : 'flex items-center justify-between gap-2',
      )}
    >
      {column ? (
        <div
          role="group"
          aria-label={t('title')}
          className="flex flex-col gap-0.5"
        >
          {card.looks.map((look) => {
            const on = look.id === active.id
            const note = meta?.(look.id)
            return (
              <button
                key={look.id}
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(look.id)}
                className={cn(
                  'flex h-9 items-center justify-between gap-2 rounded-lg px-3 text-left text-sm transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus coarse:min-h-11',
                  on
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <span className="truncate">
                  {label(look)}
                  {look.isDefault && look.label ? (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      · {t('default')}
                    </span>
                  ) : null}
                </span>
                {note ? (
                  <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
                    {note}
                  </span>
                ) : null}
              </button>
            )
          })}
          {canAdd ? (
            <button
              type="button"
              onClick={() => setNaming('create')}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus coarse:min-h-11"
            >
              <Plus className="size-3.5" aria-hidden />
              {t('add')}
            </button>
          ) : null}
        </div>
      ) : (
        <div
          role="group"
          aria-label={t('title')}
          className="scrollbar-none flex min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-full bg-fill-strong/90 p-0.75 ring-1 ring-inset ring-foreground/6"
        >
          {card.looks.map((look) => (
            <button
              key={look.id}
              type="button"
              aria-pressed={look.id === active.id}
              onClick={() => onSelect(look.id)}
              className={cn(
                'touch-target-y h-7.5 shrink-0 rounded-full px-3 text-xs font-medium whitespace-nowrap outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                look.id === active.id
                  ? 'bg-raise font-semibold text-foreground shadow-seg'
                  : 'text-ink-2 hover:text-foreground',
              )}
            >
              {label(look)}
              {look.isDefault && look.label ? (
                <span className="ml-1 font-normal text-muted-foreground">
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
              className="touch-target-y grid size-7.5 shrink-0 place-items-center rounded-full text-ink-2 outline-none transition-colors duration-fast hover:text-foreground active:bg-card/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <Plus className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      )}
      {active.id && column ? (
        <div className="flex flex-wrap items-center gap-3 px-3 text-xs text-muted-foreground">
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
      ) : active.id ? (
        <ResponsiveMenu>
          <ResponsiveMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('title')}
              className="touch-target grid size-8.5 shrink-0 place-items-center rounded-full bg-card text-foreground/80 shadow-ring outline-none transition-colors duration-fast active:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          </ResponsiveMenuTrigger>
          <ResponsiveMenuContent label={label(active)} align="end">
            <ResponsiveMenuItem onSelect={() => setNaming('rename')}>
              <Pencil aria-hidden />
              {t('rename')}
            </ResponsiveMenuItem>
            {active.isDefault ? null : (
              <ResponsiveMenuItem
                onSelect={() => void onMakeDefault(active.id)}
              >
                <Check aria-hidden />
                {t('makeDefault')}
              </ResponsiveMenuItem>
            )}
            {card.looks.length > 1 ? (
              <ResponsiveMenuItem
                variant="destructive"
                onSelect={() => setDeleting(true)}
              >
                <Trash2 aria-hidden />
                {t('delete')}
              </ResponsiveMenuItem>
            ) : null}
          </ResponsiveMenuContent>
        </ResponsiveMenu>
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
      className="transition-colors duration-fast hover:text-foreground coarse:min-h-11 coarse:min-w-11"
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
    <FormDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={mode === 'create' ? t('add') : t('rename')}
    >
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
          className="flex items-center gap-2 self-start text-2sm text-muted-foreground"
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
      <FormDialogActions
        cancelLabel={t('cancel')}
        onCancel={onClose}
        confirmLabel={t('save')}
        confirmDisabled={!canSave || saving}
        onConfirm={() => void submit()}
      />
    </FormDialog>
  )
}
