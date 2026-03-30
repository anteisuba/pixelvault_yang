'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus, Settings2 } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface CardItem {
  id: string
  name: string
  sourceImageUrl: string | null
}

interface CardDropdownProps {
  /** Display label for the dropdown (e.g. "角色", "背景", "画风") */
  label: string
  cards: CardItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Called when user clicks "+ 新建" */
  onCreateNew?: () => void
  /** Called when user clicks "管理" */
  onManage?: () => void
  disabled?: boolean
  isLoading?: boolean
  /** Placeholder when nothing is selected */
  placeholder?: string
}

/**
 * Compact card picker dropdown for Studio V2 Layer 1.
 * Shows current selection + thumbnail, opens a popover list.
 */
export function CardDropdown({
  label,
  cards,
  selectedId,
  onSelect,
  onCreateNew,
  onManage,
  disabled = false,
  isLoading = false,
  placeholder,
}: CardDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const t = useTranslations('StudioV2')

  const selectedCard = cards.find((c) => c.id === selectedId) ?? null

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled || isLoading}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 rounded-lg border border-[#e8e4dc] bg-[#faf9f5] px-3 py-2',
          'text-sm font-medium text-[#141413] transition-colors',
          'hover:bg-[#f0ede6] hover:border-[#d97757]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          open && 'border-[#d97757] bg-[#f0ede6]',
        )}
      >
        {/* Thumbnail */}
        {selectedCard?.sourceImageUrl ? (
          <Image
            src={selectedCard.sourceImageUrl}
            alt={selectedCard.name}
            width={20}
            height={20}
            className="rounded object-cover flex-shrink-0"
          />
        ) : (
          <span className="w-5 h-5 rounded bg-[#e8e4dc] flex-shrink-0" />
        )}

        {/* Label */}
        <span className="text-xs text-[#7a7872]">{label}</span>
        <span className="max-w-[100px] truncate">
          {selectedCard?.name ?? placeholder ?? t('none')}
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-[#7a7872] transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-[#e8e4dc] bg-[#faf9f5] shadow-lg">
          {/* None option */}
          <button
            type="button"
            onClick={() => {
              onSelect(null)
              setOpen(false)
            }}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-sm text-[#7a7872]',
              'hover:bg-[#f0ede6] rounded-t-lg',
              !selectedId && 'bg-[#f0ede6] text-[#141413]',
            )}
          >
            <span className="w-6 h-6 rounded bg-[#e8e4dc]" />
            {t('none')}
          </button>

          {/* Card list */}
          <div className="max-h-48 overflow-y-auto">
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  onSelect(card.id)
                  setOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-[#141413]',
                  'hover:bg-[#f0ede6]',
                  selectedId === card.id && 'bg-[#f0ede6]',
                )}
              >
                {card.sourceImageUrl ? (
                  <Image
                    src={card.sourceImageUrl}
                    alt={card.name}
                    width={24}
                    height={24}
                    className="rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <span className="w-6 h-6 rounded bg-[#e8e4dc] flex-shrink-0" />
                )}
                <span className="truncate">{card.name}</span>
              </button>
            ))}
          </div>

          {/* Footer actions */}
          <div className="border-t border-[#e8e4dc] p-1 flex gap-1">
            {onCreateNew && (
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-xs text-[#d97757] hover:text-[#d97757] hover:bg-[#fdf1ec]"
                onClick={() => {
                  onCreateNew()
                  setOpen(false)
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t('new')}
              </Button>
            )}
            {onManage && (
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-xs text-[#7a7872] hover:text-[#141413]"
                onClick={() => {
                  onManage()
                  setOpen(false)
                }}
              >
                <Settings2 className="h-3 w-3 mr-1" />
                {t('manage')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
