'use client'

import { useRef, type PointerEvent } from 'react'
import { useTranslations } from 'next-intl'

import { Plus, X } from '@/components/icons'
import {
  NOVELAI_CHARACTER_GRID_SIZE,
  novelAiGridCellCenter,
  snapToNovelAiGrid,
  type NovelAiCharacterLayoutMode,
} from '@/constants/novelai'
import { cn } from '@/lib/utils'
import type { NovelAiCharacterLayout } from '@/types/novelai'

type Character = NovelAiCharacterLayout['characters'][number]

interface NovelAiCharacterComposerProps {
  mode: NovelAiCharacterLayoutMode
  maxCharacters: number
  value: NovelAiCharacterLayout | undefined
  activeIndex: number | null
  disabled?: boolean
  onChange: (value: NovelAiCharacterLayout | undefined) => void
  onSelect: (index: number | null) => void
}

/**
 * 角色构图 —— **一块控件，两种落位方式**（D10 ④）。
 *
 * ⛔ 不给用户选形态：V5 是自由定位（拖圆点，≤22 人），V4.5 是 5×5 网格
 * （≤6 人），按模型能力切。⛔ 不做两个组件 —— 换的只是「点落在哪儿」这一件事。
 *
 * 每个角色有自己的正负标签；点它的药丸就把编辑器主区切过去（`onSelect`）。
 */
export function NovelAiCharacterComposer({
  mode,
  maxCharacters,
  value,
  activeIndex,
  disabled,
  onChange,
  onSelect,
}: NovelAiCharacterComposerProps) {
  const t = useTranslations('StudioTags')
  const stageRef = useRef<HTMLDivElement | null>(null)
  const characters = value?.characters ?? []

  const write = (next: Character[], positioning?: 'auto' | 'manual') => {
    if (next.length === 0) {
      onChange(undefined)
      onSelect(null)
      return
    }
    onChange({
      positioning: positioning ?? value?.positioning ?? 'auto',
      characters: next,
    })
  }

  /** 落位。网格档吸到格心 —— 这一档 provider 收的就是那 25 个点。 */
  const place = (index: number, x: number, y: number) => {
    const clamp = (n: number) => Math.min(1, Math.max(0, n))
    const position =
      mode === 'grid'
        ? { x: snapToNovelAiGrid(x), y: snapToNovelAiGrid(y) }
        : { x: clamp(x), y: clamp(y) }
    write(
      characters.map((character, i) =>
        i === index ? { ...character, position } : character,
      ),
      // 一落位就是手动 —— 在此之前位置只是个占位，provider 那边 `use_coords`
      // 是 false，由模型自己安排。
      'manual',
    )
  }

  const pointerToRatio = (event: PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    }
  }

  const add = () => {
    if (characters.length >= maxCharacters) return
    const slot = characters.length
    // 新人均匀摊在横轴上 —— 全堆在正中间会叠成一个点，谁也拖不出来。
    const x = (slot + 1) / (Math.min(maxCharacters, slot + 2) + 1)
    const position =
      mode === 'grid'
        ? { x: snapToNovelAiGrid(x), y: novelAiGridCellCenter(2) }
        : { x, y: 0.5 }
    write([...characters, { prompt: '', negativePrompt: '', position }])
    onSelect(slot)
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={stageRef}
        className={cn(
          'relative aspect-16/10 w-full max-w-full overflow-hidden rounded-lg border border-dashed border-border bg-muted',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        {/* 网格档：25 个可点的格子。手机上「网格才点得准」就是这一层。 */}
        {mode === 'grid' ? (
          <div
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${NOVELAI_CHARACTER_GRID_SIZE}, 1fr)`,
              gridTemplateRows: `repeat(${NOVELAI_CHARACTER_GRID_SIZE}, 1fr)`,
            }}
          >
            {Array.from({
              length: NOVELAI_CHARACTER_GRID_SIZE * NOVELAI_CHARACTER_GRID_SIZE,
            }).map((_, cell) => {
              const column = cell % NOVELAI_CHARACTER_GRID_SIZE
              const row = Math.floor(cell / NOVELAI_CHARACTER_GRID_SIZE)
              return (
                <button
                  key={cell}
                  type="button"
                  aria-label={t('gridCell', {
                    column: column + 1,
                    row: row + 1,
                  })}
                  disabled={activeIndex === null}
                  onClick={() =>
                    activeIndex !== null &&
                    place(
                      activeIndex,
                      novelAiGridCellCenter(column),
                      novelAiGridCellCenter(row),
                    )
                  }
                  className="border-b border-r border-border/50 transition-colors duration-fast ease-standard last:border-r-0 hover:bg-accent/60 disabled:pointer-events-none"
                />
              )
            })}
          </div>
        ) : null}

        {characters.map((character, index) => (
          <button
            key={index}
            type="button"
            aria-label={t('characterDot', { number: index + 1 })}
            aria-pressed={activeIndex === index}
            style={{
              left: `${character.position.x * 100}%`,
              top: `${character.position.y * 100}%`,
            }}
            onPointerDown={(event) => {
              onSelect(index)
              if (mode !== 'free') return
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              if (mode !== 'free') return
              if (!event.currentTarget.hasPointerCapture(event.pointerId))
                return
              const ratio = pointerToRatio(event)
              if (ratio) place(index, ratio.x, ratio.y)
            }}
            className={cn(
              'absolute grid size-6.5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-background font-mono text-3xs tabular-nums',
              mode === 'free' &&
                'cursor-grab touch-none active:cursor-grabbing',
              activeIndex === index
                ? 'border-foreground shadow-sm'
                : 'border-border text-muted-foreground',
            )}
          >
            {index + 1}
          </button>
        ))}
      </div>

      {/* 角色药丸 —— 点它把编辑器主区切到那个人的正负标签。 */}
      <div className="flex flex-wrap gap-1">
        {characters.map((character, index) => (
          <span
            key={index}
            className={cn(
              'inline-flex h-6 max-w-full items-center gap-1 rounded-md border bg-background pl-2 pr-1 text-3xs',
              activeIndex === index ? 'border-foreground' : 'border-border',
            )}
          >
            <button
              type="button"
              disabled={disabled}
              aria-pressed={activeIndex === index}
              onClick={() => onSelect(activeIndex === index ? null : index)}
              className="min-w-0 truncate rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
            >
              {t('characterChip', {
                number: index + 1,
                name: character.prompt.split(',')[0]?.trim() || t('unnamed'),
              })}
            </button>
            <button
              type="button"
              disabled={disabled}
              aria-label={t('removeCharacter', { number: index + 1 })}
              onClick={() => {
                write(characters.filter((_, i) => i !== index))
                if (activeIndex === index) onSelect(null)
              }}
              className="grid size-4 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground disabled:pointer-events-none"
            >
              <X className="size-2.5" />
            </button>
          </span>
        ))}
        <button
          type="button"
          disabled={disabled || characters.length >= maxCharacters}
          onClick={add}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border bg-background px-2 text-3xs text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus className="size-2.5" />
          {t('addCharacter')}
        </button>
      </div>

      <span className="font-mono text-3xs tabular-nums text-muted-foreground">
        {t(mode === 'free' ? 'characterModeFree' : 'characterModeGrid', {
          max: maxCharacters,
        })}
      </span>
    </div>
  )
}
