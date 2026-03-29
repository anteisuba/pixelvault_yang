'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import type {
  StyleCardRecord,
  CreateStyleCardRequest,
  UpdateStyleCardRequest,
} from '@/types'
import { StyleCardEditor } from '@/components/business/StyleCardEditor'

interface StyleCardManagerProps {
  cards: StyleCardRecord[]
  activeCardId: string | null
  isLoading: boolean
  onSelect: (id: string | null) => void
  onCreate: (data: CreateStyleCardRequest) => Promise<void>
  onUpdate: (
    id: string,
    data: UpdateStyleCardRequest,
  ) => Promise<boolean | void>
  onDelete: (id: string) => Promise<boolean | void>
}

type ManagerView =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'edit'; card: StyleCardRecord }
  | { type: 'confirmDelete'; card: StyleCardRecord }

/**
 * Style card list + CRUD manager for Studio V2.
 * Uses StyleCardEditor for create/edit so model + LoRA fields are always shown.
 */
export function StyleCardManager({
  cards,
  activeCardId,
  isLoading,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
}: StyleCardManagerProps) {
  const t = useTranslations('StudioV2')
  const tStyle = useTranslations('StyleCard')

  const [view, setView] = useState<ManagerView>({ type: 'list' })
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async (
    data: CreateStyleCardRequest | UpdateStyleCardRequest,
  ) => {
    setIsSaving(true)
    try {
      if (view.type === 'create') {
        await onCreate(data as CreateStyleCardRequest)
      } else if (view.type === 'edit') {
        await onUpdate(view.card.id, data as UpdateStyleCardRequest)
      }
      setView({ type: 'list' })
      return true
    } catch {
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (card: StyleCardRecord) => {
    setIsSaving(true)
    try {
      await onDelete(card.id)
      if (activeCardId === card.id) onSelect(null)
      setView({ type: 'list' })
    } finally {
      setIsSaving(false)
    }
  }

  if (view.type === 'create' || view.type === 'edit') {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-[#7a7872]">
          {view.type === 'create' ? t('new') : t('edit')} — {tStyle('title')}
        </p>
        <StyleCardEditor
          card={view.type === 'edit' ? view.card : undefined}
          onSave={handleSave}
          onCancel={() => setView({ type: 'list' })}
          isLoading={isSaving}
        />
      </div>
    )
  }

  if (view.type === 'confirmDelete') {
    const card = view.card
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
        <p className="text-sm text-foreground">
          删除「{card.name}」？此操作不可撤销。
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setView({ type: 'list' })}
            className="rounded-md border border-[#e8e4dc] px-3 py-1.5 text-xs text-[#7a7872] hover:bg-[#f0ede6]"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleDelete(card)}
            className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground disabled:opacity-50"
          >
            删除
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#7a7872]">{tStyle('title')}</p>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => setView({ type: 'create' })}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#d97757] hover:bg-[#fdf1ec] disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          {t('new')}
        </button>
      </div>

      {cards.length === 0 && (
        <p className="py-3 text-center text-xs text-[#7a7872]">
          {tStyle('empty') ?? '暂无画风卡 — 点击「新建」添加'}
        </p>
      )}

      <div className="space-y-1">
        {cards.map((card) => {
          const isActive = card.id === activeCardId
          return (
            <div
              key={card.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors',
                isActive
                  ? 'border-[#d97757]/40 bg-[#fdf1ec]'
                  : 'border-[#e8e4dc] bg-[#faf9f5] hover:bg-[#f0ede6]',
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(isActive ? null : card.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                {isActive && (
                  <Check className="h-3 w-3 flex-shrink-0 text-[#d97757]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#141413]">
                    {card.name}
                  </p>
                  {card.modelId ? (
                    <p className="truncate text-xs text-[#7a7872]">
                      {card.modelId}
                      {card.advancedParams?.loras?.length
                        ? ` · ${card.advancedParams.loras.length} LoRA`
                        : ''}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600">{t('noModel')}</p>
                  )}
                </div>
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setView({ type: 'edit', card })}
                  className="rounded p-1 text-[#7a7872] hover:bg-[#e8e4dc] hover:text-[#141413]"
                  title={t('edit')}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setView({ type: 'confirmDelete', card })}
                  className="rounded p-1 text-[#7a7872] hover:bg-red-50 hover:text-red-500"
                  title="删除"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
