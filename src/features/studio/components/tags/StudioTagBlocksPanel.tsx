'use client'

import { useState, type KeyboardEvent, type Ref } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  ArrowUpDown,
  Blocks,
  ChevronDown,
  ChevronUp,
  EyeOff,
  Lock,
  LockOpen,
  Plus,
  Trash2,
  X,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import { Switch } from '@/components/ui/switch'
import { SPRING } from '@/constants/motion'
import { PROMPT_TAG_WEIGHT } from '@/constants/prompt-dialects'
import { useStudioGenOptional } from '@/contexts/studio-context'
import { useTagPromptBlocks } from '@/hooks/use-tag-prompt-blocks'
import {
  formatTagWeight,
  isDefaultTagWeight,
  snapTagWeight,
} from '@/lib/tag-composer'
import {
  previewPromptBlock,
  type TagBlockMode,
  type TagBlockPosition,
  type TagBlockTarget,
  type TagPromptBlock,
} from '@/lib/tag-prompt-blocks'
import { cn } from '@/lib/utils'

function splitNewBlockItems(raw: string): string[] {
  return raw
    .split(/[\r\n|]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

/**
 * 启用积木原位条：
 * - `variant="inline"`：嵌入正向/负向写词卡的真实注入位（前置在输入框上方、后置在下方），
 *   完整可读地展示画师串/动态词项，点击正文展开右侧编排面板，支持就地锁定与一键暂关。
 * - `variant="standalone"`：独立紧凑胶囊带（用于角色页签下或独立挂载场景）。
 */
export function StudioTagActiveBlocksBar({
  disabled = false,
  onOpenBlocks,
  target,
  position,
  variant = 'standalone',
}: {
  disabled?: boolean
  onOpenBlocks: () => void
  target?: TagBlockTarget
  position?: TagBlockPosition
  variant?: 'inline' | 'standalone'
}) {
  const t = useTranslations('StudioTags.blocksPanel')
  const { activeBlocks, updateBlock } = useTagPromptBlocks()

  const visibleBlocks = activeBlocks.filter((block) => {
    if (target && block.target !== target) return false
    if (position && (block.position ?? 'suffix') !== position) return false
    return true
  })

  if (visibleBlocks.length === 0) return null

  const testId =
    target && position
      ? `active-tag-blocks-${target}-${position}`
      : 'active-tag-blocks-bar'

  if (variant === 'inline') {
    return (
      <div
        data-testid={testId}
        aria-label={t('activeBarLabel')}
        className="flex min-w-0 flex-col gap-1"
      >
        {visibleBlocks.map((block) => {
          const preview = previewPromptBlock(block)
          const modeText = t(`modes.${block.mode}`)
          const isPrefix = (block.position ?? 'suffix') === 'prefix'
          const badgeText =
            block.mode === 'fixed'
              ? t(`positions.${isPrefix ? 'prefix' : 'suffix'}`)
              : isPrefix
                ? `${t('positionBadgePrefix')}·${modeText}`
                : modeText
          const showLock = block.mode !== 'fixed'
          const hasWeight = !isDefaultTagWeight(block.weight)
          const blockLabel = block.name || badgeText
          return (
            <div
              key={block.id}
              data-testid="active-tag-block-item"
              className={cn(
                'flex min-w-0 items-start gap-1.5 rounded-xl px-2.5 py-1.5 transition-colors',
                block.locked
                  ? 'bg-foreground text-background'
                  : 'bg-card/90 text-foreground shadow-seg hover:bg-card',
              )}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={onOpenBlocks}
                className="touch-target-y flex min-w-0 flex-1 flex-col gap-0.5 text-left focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-semibold leading-tight',
                      block.locked
                        ? 'bg-background/15 text-background'
                        : isPrefix
                          ? 'bg-foreground/10 text-foreground'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {badgeText}
                  </span>
                  {block.name ? (
                    <span className="truncate text-2xs font-semibold">
                      {block.name}
                    </span>
                  ) : null}
                  {hasWeight ? (
                    <span
                      className={cn(
                        'shrink-0 font-mono text-[10px] tabular-nums',
                        block.locked ? 'opacity-85' : 'text-muted-foreground',
                      )}
                    >
                      {formatTagWeight(block.weight)}
                    </span>
                  ) : null}
                </div>
                {preview ? (
                  <p
                    className={cn(
                      'line-clamp-2 break-words font-mono text-[11px] leading-snug',
                      block.locked
                        ? 'text-background/85'
                        : 'text-muted-foreground',
                    )}
                  >
                    {preview}
                  </p>
                ) : null}
              </button>
              <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
                {showLock ? (
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={
                      block.locked
                        ? t('unlockBlock', { name: blockLabel })
                        : t('lockBlock', { name: blockLabel })
                    }
                    title={
                      block.locked
                        ? t('unlockBlock', { name: blockLabel })
                        : t('lockBlock', { name: blockLabel })
                    }
                    aria-pressed={block.locked}
                    onClick={() =>
                      updateBlock(block.id, { locked: !block.locked })
                    }
                    className={cn(
                      'touch-target grid size-5 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50',
                      block.locked
                        ? 'opacity-90 hover:bg-background/15'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {block.locked ? (
                      <Lock className="size-3" aria-hidden />
                    ) : (
                      <LockOpen className="size-3" aria-hidden />
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={t('disableBlock', { name: blockLabel })}
                  title={t('disableBlock', { name: blockLabel })}
                  onClick={() => updateBlock(block.id, { enabled: false })}
                  className={cn(
                    'touch-target grid size-5 shrink-0 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50',
                    block.locked
                      ? 'opacity-80 hover:bg-background/15 hover:opacity-100'
                      : 'text-muted-foreground/80 hover:bg-muted hover:text-foreground',
                  )}
                >
                  <EyeOff className="size-3" aria-hidden />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div
      data-testid={testId}
      aria-label={t('activeBarLabel')}
      className="flex flex-wrap items-center gap-1.5 rounded-12 border border-dashed border-border/80 bg-muted/35 px-2.5 py-1.5"
    >
      {visibleBlocks.map((block) => {
        const preview = previewPromptBlock(block)
        const modeText = t(`modes.${block.mode}`)
        const isPrefix = (block.position ?? 'suffix') === 'prefix'
        const badgeText =
          block.mode === 'fixed'
            ? t(`positions.${isPrefix ? 'prefix' : 'suffix'}`)
            : isPrefix
              ? `${t('positionBadgePrefix')}·${modeText}`
              : modeText
        const showLock = block.mode !== 'fixed'
        const hasWeight = !isDefaultTagWeight(block.weight)
        const blockLabel = block.name || modeText
        return (
          <div
            key={block.id}
            className={cn(
              'inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-0.5 text-2xs transition-colors',
              block.locked
                ? 'bg-foreground text-background'
                : 'bg-card text-foreground shadow-seg',
            )}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={onOpenBlocks}
              className="touch-target-y flex min-w-0 items-center gap-1 text-left focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50"
            >
              <span
                className={cn(
                  'shrink-0 rounded px-1 py-px text-[10px] font-semibold',
                  block.locked
                    ? 'bg-background/15 text-background'
                    : isPrefix
                      ? 'bg-foreground/10 text-foreground'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {badgeText}
              </span>
              {block.name ? (
                <span className="shrink-0 font-semibold">{block.name}:</span>
              ) : null}
              <span className="max-w-52 truncate">{preview}</span>
              {hasWeight ? (
                <span
                  className={cn(
                    'shrink-0 font-mono text-[10px] tabular-nums',
                    block.locked ? 'opacity-85' : 'text-muted-foreground',
                  )}
                >
                  {formatTagWeight(block.weight)}
                </span>
              ) : null}
            </button>
            {showLock ? (
              <button
                type="button"
                disabled={disabled}
                aria-label={
                  block.locked
                    ? t('unlockBlock', { name: blockLabel })
                    : t('lockBlock', { name: blockLabel })
                }
                aria-pressed={block.locked}
                onClick={() => updateBlock(block.id, { locked: !block.locked })}
                className={cn(
                  'touch-target grid size-4 shrink-0 place-items-center rounded transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50',
                  block.locked
                    ? 'opacity-90'
                    : 'text-muted-foreground opacity-75',
                )}
              >
                {block.locked ? (
                  <Lock className="size-3" aria-hidden />
                ) : (
                  <LockOpen className="size-3" aria-hidden />
                )}
              </button>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              aria-label={t('disableBlock', { name: blockLabel })}
              title={t('disableBlock', { name: blockLabel })}
              onClick={() => updateBlock(block.id, { enabled: false })}
              className={cn(
                'touch-target grid size-4 shrink-0 place-items-center rounded transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50',
                block.locked
                  ? 'opacity-80'
                  : 'text-muted-foreground opacity-65',
              )}
            >
              <EyeOff className="size-3" aria-hidden />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/**
 * 提示词积木舞台宽面板（5B-3 方案 A，owner 2026-11-27 拍板）：
 * 与「模板 / 查资料 / 收藏 / 角色构图」同级，借右侧宽舞台编排积木（固定 / 顺序 / 随机
 * + 锁定 + 独立权重 + 正/负向目标），Esc 或「返回结果」一键回到出图区。
 */
export function StudioTagBlocksPanel({
  onClose,
  headingRef,
}: {
  onClose: () => void
  headingRef?: Ref<HTMLHeadingElement>
}) {
  const t = useTranslations('StudioTags.blocksPanel')
  const tWeight = useTranslations('StudioTags.weightControls')
  const reducedMotion = Boolean(useReducedMotion())
  const studioGen = useStudioGenOptional()
  const isGenerating = studioGen?.isGenerating ?? false
  const {
    blocks,
    activeBlocks,
    canAddMore,
    addBlock,
    updateBlock,
    removeBlock,
    moveBlock,
  } = useTagPromptBlocks()

  const createStarter = (
    kind: 'artist' | 'outfit' | 'expression' | 'lighting',
  ) => {
    if (kind === 'artist') {
      addBlock({
        name: t('starters.artistName'),
        position: 'prefix',
        mode: 'fixed',
        weight: 1,
        items: ['0.8::artist:rella::', '0.55::artist:guweiz::'],
      })
    } else if (kind === 'outfit') {
      addBlock({
        name: t('starters.outfitName'),
        mode: 'sequential',
        items: ['serafuku', 'maid', 'kimono', 'school uniform'],
      })
    } else if (kind === 'expression') {
      addBlock({
        name: t('starters.expressionName'),
        mode: 'random',
        items: ['smile', 'blush', 'serious', 'surprised'],
      })
    } else {
      addBlock({
        name: t('starters.lightingName'),
        mode: 'fixed',
        weight: 1.1,
        items: ['dramatic lighting', 'rim light', 'depth of field'],
      })
    }
  }

  return (
    <section
      aria-labelledby="studio-tag-blocks-title"
      className="flex min-h-0 flex-1 flex-col gap-3.5"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onClose()
      }}
    >
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h2
              ref={headingRef}
              id="studio-tag-blocks-title"
              tabIndex={-1}
              className="text-md font-semibold outline-none"
            >
              {t('title')}
            </h2>
            {blocks.length > 0 ? (
              <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                {activeBlocks.length} / {blocks.length}
              </span>
            ) : null}
          </div>
          <p className="text-2xs text-muted-foreground">{t('hint')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isGenerating || !canAddMore}
            onClick={() =>
              addBlock({
                name: t('defaultName', { index: blocks.length + 1 }),
                mode: 'sequential',
              })
            }
          >
            <Plus className="size-3.5" aria-hidden />
            {t('addBlock')}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {t('backToResults')}
          </Button>
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-3 rounded-12 border border-dashed border-border bg-muted/25 p-6">
          <div className="flex items-center gap-2 text-md font-semibold text-foreground">
            <Blocks className="size-4 text-muted-foreground" aria-hidden />
            <span>{t('emptyTitle')}</span>
          </div>
          <p className="max-w-lg text-2sm leading-relaxed text-muted-foreground">
            {t('emptyDesc')}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isGenerating}
              onClick={() => createStarter('artist')}
            >
              <Plus className="size-3.5" aria-hidden />
              {t('starters.artistButton')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isGenerating}
              onClick={() => createStarter('outfit')}
            >
              <Plus className="size-3.5" aria-hidden />
              {t('starters.outfitButton')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isGenerating}
              onClick={() => createStarter('expression')}
            >
              <Plus className="size-3.5" aria-hidden />
              {t('starters.expressionButton')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isGenerating}
              onClick={() => createStarter('lighting')}
            >
              <Plus className="size-3.5" aria-hidden />
              {t('starters.lightingButton')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
          <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {blocks.map((block, index) => (
                <motion.div
                  key={block.id}
                  layout={!reducedMotion}
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reducedMotion ? undefined : { opacity: 0, scale: 0.94 }}
                  transition={reducedMotion ? { duration: 0 } : SPRING.slot}
                >
                  <BlockEditorCard
                    block={block}
                    index={index}
                    total={blocks.length}
                    disabled={isGenerating}
                    t={t}
                    tWeight={tWeight}
                    onUpdate={(patch) => updateBlock(block.id, patch)}
                    onRemove={() => removeBlock(block.id)}
                    onMove={(delta) => moveBlock(block.id, delta)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between gap-2 rounded-12 bg-muted/50 px-3 py-2 text-2xs text-muted-foreground">
        <span className="truncate">
          {t('syntaxTip', {
            randomExample: '{red hair|silver hair}',
            seqExample: '{>serafuku|maid}',
          })}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums">
          {t('activeCount', { count: activeBlocks.length })}
        </span>
      </div>
    </section>
  )
}

function BlockEditorCard({
  block,
  index,
  total,
  disabled,
  t,
  tWeight,
  onUpdate,
  onRemove,
  onMove,
}: {
  block: TagPromptBlock
  index: number
  total: number
  disabled: boolean
  t: ReturnType<typeof useTranslations<'StudioTags.blocksPanel'>>
  tWeight: ReturnType<typeof useTranslations<'StudioTags.weightControls'>>
  onUpdate: (patch: Partial<Omit<TagPromptBlock, 'id'>>) => void
  onRemove: () => void
  onMove: (delta: -1 | 1) => void
}) {
  const [draftItem, setDraftItem] = useState('')

  const appendItems = (raw: string) => {
    const incoming = splitNewBlockItems(raw)
    if (incoming.length === 0) return
    onUpdate({ items: [...block.items, ...incoming] })
    setDraftItem('')
  }

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Enter') {
      event.preventDefault()
      appendItems(draftItem)
    }
  }

  const stepWeight = (delta: number) => {
    onUpdate({ weight: snapTagWeight(block.weight + delta) })
  }

  const flipWeight = () => {
    const next =
      block.weight > 0
        ? block.weight === 1
          ? -1
          : -block.weight
        : block.weight === 0 || block.weight === -1
          ? 1
          : -block.weight
    onUpdate({ weight: snapTagWeight(next) })
  }

  const nonEmptyCount = block.items.filter(
    (item) => item.trim().length > 0,
  ).length
  const safeCursor = nonEmptyCount > 0 ? block.cursor % nonEmptyCount : 0
  const isNegativeWeight = block.weight < 0

  return (
    <article
      data-testid="tag-block-card"
      className={cn(
        'flex flex-col gap-2.5 rounded-12 border border-border/80 bg-muted/45 p-3 transition-opacity',
        !block.enabled && 'opacity-60',
      )}
    >
      {/* Top row: Enable + Name + Move + Delete (keeps title spacious in 2-col grid) */}
      <div className="flex items-center gap-2">
        <Switch
          aria-label={t('enableBlock', {
            name: block.name || String(index + 1),
          })}
          checked={block.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => onUpdate({ enabled })}
        />
        <Input
          type="text"
          value={block.name}
          maxLength={80}
          disabled={disabled}
          aria-label={t('nameLabel')}
          placeholder={t('namePlaceholder')}
          onChange={(event) => onUpdate({ name: event.target.value })}
          className="h-7 min-w-0 flex-1 bg-card px-2 text-2sm font-semibold"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            disabled={disabled || index === 0}
            aria-label={t('moveUp')}
            onClick={() => onMove(-1)}
            className="touch-target grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <ChevronUp className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={disabled || index === total - 1}
            aria-label={t('moveDown')}
            onClick={() => onMove(1)}
            className="touch-target grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <ChevronDown className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-label={t('deleteBlock')}
            onClick={onRemove}
            className="touch-target grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-status-risk/10 hover:text-status-risk disabled:opacity-40"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {/* Mode segmented + Target/Position + Lock + Weight controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <LiquidSegmented
            ariaLabel={t('modeLabel')}
            size="sm"
            disabled={disabled}
            value={block.mode}
            items={[
              { value: 'fixed' as TagBlockMode, label: t('modes.fixed') },
              {
                value: 'sequential' as TagBlockMode,
                label: t('modes.sequential'),
              },
              { value: 'random' as TagBlockMode, label: t('modes.random') },
            ]}
            onChange={(mode) => onUpdate({ mode })}
          />
          <button
            type="button"
            disabled={disabled}
            aria-label={t('toggleTarget')}
            onClick={() =>
              onUpdate({
                target: block.target === 'positive' ? 'negative' : 'positive',
              })
            }
            className={cn(
              'touch-target-y inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50',
              block.target === 'negative'
                ? 'bg-status-risk/15 text-status-risk'
                : 'bg-card text-muted-foreground shadow-seg hover:text-foreground',
            )}
          >
            <ArrowUpDown className="size-3" aria-hidden />
            {t(`targets.${block.target}`)}
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-label={t('togglePosition')}
            onClick={() =>
              onUpdate({
                position: block.position === 'prefix' ? 'suffix' : 'prefix',
              })
            }
            className={cn(
              'touch-target-y inline-flex h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50',
              block.position === 'prefix'
                ? 'bg-foreground text-background'
                : 'bg-card text-muted-foreground shadow-seg hover:text-foreground',
            )}
          >
            {t(`positions.${block.position ?? 'suffix'}`)}
          </button>
          {block.mode !== 'fixed' ? (
            <button
              type="button"
              disabled={disabled}
              aria-pressed={block.locked}
              onClick={() => onUpdate({ locked: !block.locked })}
              className={cn(
                'touch-target-y inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50',
                block.locked
                  ? 'bg-foreground text-background'
                  : 'bg-card text-muted-foreground shadow-seg hover:text-foreground',
              )}
            >
              {block.locked ? (
                <Lock className="size-3" aria-hidden />
              ) : (
                <LockOpen className="size-3" aria-hidden />
              )}
              {block.locked ? t('locked') : t('unlocked')}
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-1 text-2xs">
          <span className="text-muted-foreground">{t('weightLabel')}</span>
          <button
            type="button"
            disabled={disabled}
            aria-label={tWeight('decrease')}
            onClick={() => stepWeight(-PROMPT_TAG_WEIGHT.STEP)}
            className="touch-target grid size-5 place-items-center rounded-full bg-card text-foreground shadow-seg hover:bg-fill-strong disabled:opacity-50"
          >
            −
          </button>
          <span
            className={cn(
              'min-w-9 text-center font-mono font-semibold tabular-nums',
              isNegativeWeight ? 'text-status-risk' : 'text-foreground',
            )}
          >
            {Number(block.weight.toFixed(2))}
          </span>
          <button
            type="button"
            disabled={disabled}
            aria-label={tWeight('increase')}
            onClick={() => stepWeight(PROMPT_TAG_WEIGHT.STEP)}
            className="touch-target grid size-5 place-items-center rounded-full bg-card text-foreground shadow-seg hover:bg-fill-strong disabled:opacity-50"
          >
            +
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={flipWeight}
            className={cn(
              'touch-target-y h-5 rounded-full px-2 text-[11px] font-semibold transition-colors disabled:opacity-50',
              isNegativeWeight
                ? 'bg-status-risk text-background'
                : 'bg-fill-strong text-foreground hover:bg-muted',
            )}
          >
            {isNegativeWeight ? tWeight('toPositive') : tWeight('toNegative')}
          </button>
        </div>
      </div>

      {/* Candidate items list */}
      <div className="flex flex-wrap gap-1.5">
        {block.items.map((item, itemIdx) => {
          const isCurrent = block.mode !== 'fixed' && itemIdx === safeCursor
          return (
            <div
              key={`${itemIdx}:${item}`}
              className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-lg px-2 py-1 text-2xs transition-colors',
                isCurrent
                  ? 'bg-foreground font-semibold text-background'
                  : 'bg-card text-foreground shadow-seg',
              )}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (block.mode !== 'fixed') onUpdate({ cursor: itemIdx })
                }}
                className="touch-target-y max-w-52 truncate text-left focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50"
              >
                {item}
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-label={t('removeItem', { item })}
                onClick={() =>
                  onUpdate({
                    items: block.items.filter((_, idx) => idx !== itemIdx),
                  })
                }
                className={cn(
                  'touch-target grid size-4 shrink-0 place-items-center rounded transition-opacity hover:opacity-100',
                  isCurrent ? 'opacity-80' : 'text-muted-foreground opacity-60',
                )}
              >
                <X className="size-3" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>

      {/* Inline add-item input */}
      <div className="flex items-center gap-1.5">
        <Input
          type="text"
          value={draftItem}
          disabled={disabled}
          aria-label={t('addItemInput')}
          placeholder={t('addItemPlaceholder')}
          onChange={(event) => setDraftItem(event.target.value)}
          onKeyDown={handleDraftKeyDown}
          className="h-7 flex-1 bg-card px-2 text-2xs"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || !draftItem.trim()}
          onClick={() => appendItems(draftItem)}
          className="h-7 px-2.5 text-2xs"
        >
          {t('addItemButton')}
        </Button>
      </div>
    </article>
  )
}
