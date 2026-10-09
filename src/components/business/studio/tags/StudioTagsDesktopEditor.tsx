'use client'

import { useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { EASE_STANDARD, LIQUID_TIMING } from '@/constants/motion'
import { useStudioForm } from '@/contexts/studio-context'
import { useNovelAiCharacters } from '@/hooks/use-novelai-characters'
import { useTagTargetFlash } from '@/hooks/use-tag-target-flash'
import { parseTagChips, serializeTagChips } from '@/lib/tag-composer'
import type { TagChip } from '@/types/tag-composer'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import {
  StudioTagCharacterExtras,
  StudioTagCountHint,
  StudioTagSceneTexts,
  useStudioTagCountMarks,
} from './StudioTagCast'
import { StudioTagChipField } from './StudioTagChipField'
import { StudioTagPageTabs } from './StudioTagPageTabs'

const WHOLE = 'whole'

/**
 * 标签台桌面输入框的上半截 —— 方向 A「一个框 + 一排页签」（owner 2026-10-09，
 * 原型 artifact `RhgqVHxzMN55Dh4HgM1nLA`）：
 *
 * 1. 页签行：参考图小缩略 · 整体 · 角色 N（当前那位带 ⋯）· ＋ ……… 负向。
 * 2. 一个框：只放当前这一页的标签（换页 = 同一个框换内容，短模糊进场）。
 * 3. 跟着页签的那一行：整体 = 画面文字 + 人数提示；角色 = 互动 · 台词 + 写法提示；
 *    负向 = 「写给 整体 · 角色 N」小分段（每位角色各自的负向）。
 *
 * 工具行（图像 · 模板 · 查资料 · 构图 | 模型 · 规格 · 专属 · 价格 · 生成）不在这里，
 * 由 `StudioTagsComposer` 画。⛔ 这一台没有标题列、没有常挂的说明字。
 */
export function StudioTagsDesktopEditor({
  tagModelId,
  disabled,
  carry,
  referenceStrip,
  referenceStatus,
}: {
  tagModelId?: string
  disabled: boolean
  /** 从自然语言台带过来的那一句「正在翻成标签…」（只挂整体页）。 */
  carry: ReactNode
  referenceStrip: ReactNode
  referenceStatus: ReactNode
}) {
  const t = useTranslations('StudioTags')
  const reducedMotion = useReducedMotion()
  const { state, dispatch } = useStudioForm()
  const characters = useNovelAiCharacters()
  const flashing = useTagTargetFlash()
  const [negativeView, setNegativeView] = useState(false)

  const activeIndex =
    characters.mode &&
    state.activeTagCharacterIndex !== null &&
    state.activeTagCharacterIndex < characters.characters.length
      ? state.activeTagCharacterIndex
      : null
  const character =
    activeIndex === null ? null : characters.characters[activeIndex]
  const characterDisabled = character?.enabled === false
  const marks = useStudioTagCountMarks(activeIndex)

  const positiveOf = (index: number | null): readonly TagChip[] => {
    if (index === null) return state.tagChips
    const who = characters.characters[index]
    return who ? parseTagChips(who.prompt) : []
  }
  const negativeOf = (index: number | null): readonly TagChip[] => {
    if (index === null) return state.tagNegativeChips
    const who = characters.characters[index]
    return who ? parseTagChips(who.negativePrompt) : []
  }
  const people = characters.mode ? characters.characters : []
  const negativeCount = people.reduce(
    (sum, _, index) => sum + negativeOf(index).length,
    negativeOf(null).length,
  )

  const polarity = negativeView ? 'negative' : 'positive'
  const chips = negativeView ? negativeOf(activeIndex) : positiveOf(activeIndex)
  const setChips = (next: TagChip[]) => {
    if (activeIndex === null) {
      dispatch({ type: 'SET_TAG_CHIPS', payload: { polarity, chips: next } })
      return
    }
    characters.update(
      activeIndex,
      polarity === 'positive'
        ? { prompt: serializeTagChips(next) }
        : { negativePrompt: serializeTagChips(next) },
    )
  }

  const who =
    activeIndex === null
      ? null
      : t('workbench.characterNumber', { number: activeIndex + 1 })
  const fieldLabel = negativeView
    ? who
      ? `${t('tabs.negative')} · ${who}`
      : t('tabs.negative')
    : who
      ? t('characterPositiveLabel', { number: (activeIndex ?? 0) + 1 })
      : t('positiveLabel')
  const placeholder = negativeView
    ? t('tabs.negativePlaceholder')
    : activeIndex === null
      ? t('tabs.wholePlaceholder')
      : t('tabs.characterPlaceholder', { number: activeIndex + 1 })

  const followRow = negativeView ? (
    people.length > 0 ? (
      <>
        <span className="text-2xs text-muted-foreground">
          {t('tabs.writeFor')}
        </span>
        <LiquidSegmented
          ariaLabel={t('tabs.writeFor')}
          size="sm"
          disabled={disabled}
          value={activeIndex === null ? WHOLE : String(activeIndex)}
          items={[
            {
              value: WHOLE,
              label: `${t('wholeTab')} ${negativeOf(null).length}`,
            },
            ...people.map((_, index) => ({
              value: String(index),
              label: `${t('workbench.characterNumber', { number: index + 1 })} ${negativeOf(index).length}`,
            })),
          ]}
          onChange={(next) =>
            characters.select(next === WHOLE ? null : Number(next))
          }
        />
      </>
    ) : null
  ) : characters.mode ? (
    <>
      {activeIndex === null ? (
        <StudioTagSceneTexts mobile={false} disabled={disabled} />
      ) : (
        <StudioTagCharacterExtras
          index={activeIndex}
          mobile={false}
          disabled={disabled || characterDisabled}
        />
      )}
      <StudioTagCountHint
        activeIndex={activeIndex}
        mobile={false}
        disabled={disabled || characterDisabled}
      />
    </>
  ) : null

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        {referenceStrip}
        <StudioTagPageTabs
          whole={{ count: state.tagChips.length }}
          characters={people.map((person, index) => ({
            count: parseTagChips(person.prompt).length,
            enabled: person.enabled !== false,
            flashing: flashing === index,
          }))}
          activeIndex={activeIndex}
          negative={negativeView}
          negativeCount={negativeCount}
          canAdd={
            characters.mode
              ? characters.characters.length < characters.max
              : null
          }
          disabled={disabled}
          onSelect={(index) => {
            setNegativeView(false)
            characters.select(index)
          }}
          onNegative={() => setNegativeView(true)}
          onAdd={() => {
            setNegativeView(false)
            characters.add()
          }}
          onEnabledChange={(index, enabled) =>
            characters.update(index, { enabled })
          }
          onRemove={characters.remove}
        />
      </div>
      {referenceStatus}
      {/* 换页 = 同一个框换内容：旧的直接让位，新的带一下短模糊进场。 */}
      <motion.div
        key={`${polarity}-${activeIndex ?? WHOLE}`}
        initial={
          reducedMotion
            ? false
            : { opacity: 0, filter: `blur(${LIQUID_TIMING.blurPx}px)` }
        }
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        transition={{
          delay: LIQUID_TIMING.swapInDelayS,
          duration: LIQUID_TIMING.swapInS,
          ease: EASE_STANDARD,
        }}
        className="flex flex-col gap-1"
        data-assistant-field={negativeView ? 'negativePrompt' : 'prompt'}
      >
        <StudioTagChipField
          variant="bare"
          modelId={tagModelId}
          label={fieldLabel}
          placeholder={placeholder}
          polarity={polarity}
          chips={chips}
          markedTags={negativeView ? undefined : marks}
          disabled={disabled || characterDisabled}
          onChange={setChips}
          status={!negativeView && activeIndex === null ? carry : undefined}
        />
      </motion.div>
      {followRow ? (
        <div className="flex min-h-8 flex-wrap items-center gap-1.5">
          {followRow}
        </div>
      ) : null}
    </>
  )
}
