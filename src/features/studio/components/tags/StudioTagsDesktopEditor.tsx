'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { Check, ChevronDown } from '@/components/icons'
import {
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioToolPopoverBaseClass,
  studioToolSurfaceMobileClass,
  useStudioChipPopoverMotion,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { ResponsivePopoverContent } from '@/components/ui/responsive-popover'
import { EASE_STANDARD, LIQUID_TIMING } from '@/constants/motion'
import { getCapabilityConfig } from '@/constants/provider-capabilities'
import { studioTagLibraryDetailPath } from '@/constants/studio-shell'
import { useStudioForm } from '@/contexts/studio-context'
import { useNovelAiCharacters } from '@/hooks/use-novelai-characters'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import { useTagMetaLookup } from '@/hooks/use-tag-meta-lookup'
import { useTagTargetFlash } from '@/hooks/use-tag-target-flash'
import { useRouter } from '@/i18n/navigation'
import {
  getCapabilityChipValue,
  getModelCapabilityChips,
} from '@/lib/model-capability-chips'
import { parseTagChips, serializeTagChips } from '@/lib/tag-composer'
import { danbooruTagFromChip } from '@/lib/tag-lookup'
import { cn } from '@/lib/utils'
import type { AdvancedParams } from '@/types'
import type { TagChip } from '@/types/tag-composer'
import {
  StudioTagCharacterExtras,
  StudioTagCountHint,
  StudioTagSceneTexts,
  useStudioTagCountMarks,
} from './StudioTagCast'
import {
  StudioTagTextField,
  type StudioTagTextFieldHandle,
} from './StudioTagTextField'
import { StudioTagTranslationStrip } from './StudioTagTranslationStrip'
import { StudioTagActiveBlocksBar } from './StudioTagBlocksPanel'
import { StudioTagPageTabs } from './StudioTagPageTabs'
import { StudioTagAddCharacter } from './StudioTagAddCharacter'
import {
  StudioTagCharacterMenuExtra,
  sameTags,
} from './StudioTagCharacterMenuExtra'

const WHOLE = 'whole'
const TRANSLATION_STRIP_STORAGE_KEY = 'antei.tagStudio.showTranslations'

function readSavedTranslationStripPreference(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(TRANSLATION_STRIP_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 标签台桌面左栏编辑器（方向 1「左编右画」满高双栏，owner 2026-11-27 拍板）：
 *
 * 1. 页签行（挂 `data-bench-header` 与收起态对话头像对齐）：`整体 n · 角色 1 n ⋯ · ＋ 加角色 ▾`。
 * 2. 正向框 + 负向框**上下联排同显**，随当前页签联动（选角色 N 就同时编辑她的正负提示）；
 *    原生支持 `1.3::tag::` / `-2::blurry::` 数值与负权重。
 * 3. 整体负向右上就地切换 UC 预设（Heavy / Light / Human / Furry / 关）；V5 Medium
 *    自动提示固定 Heavy UC 并引导用正向 `-2::标签::` 避雷。
 * 4. 下方紧跟当前页的扩展行（整体 = 画面文字；角色 = 互动 · 台词）。
 */
export function StudioTagsDesktopEditor({
  tagModelId,
  disabled,
  carry,
  resourceBar,
  secondaryActions,
  onOpenBlocks,
  children,
}: {
  tagModelId?: string
  disabled: boolean
  /** 从自然语言台带过来的那一句「正在翻成标签…」（只挂整体页）。 */
  carry: ReactNode
  /** 等宽 4 格词库资源条（模板 · 查资料 · 收藏 · 积木）。 */
  resourceBar?: ReactNode
  /** 次级轻动作条（从图读串 · 改图 · 角色构图），与画面文字 / 互动台词合排成一行。 */
  secondaryActions?: ReactNode
  /** 展开右侧「提示词积木」面板（用于正向/负向写词卡内嵌的前置/后置积木条）。 */
  onOpenBlocks?: () => void
  /** 紧跟工具条下方、同在单一竖向滚动区里的参考区等扩展内容。 */
  children?: ReactNode
}) {
  const t = useTranslations('StudioTags')
  const tAdvanced = useTranslations('AdvancedSettings')
  const router = useRouter()
  const lookup = (chip: TagChip) => {
    const tag = danbooruTagFromChip(chip.text)
    if (tag)
      router.push(
        studioTagLibraryDetailPath(tag.name, tag.artist ? 'artist' : undefined),
      )
  }
  const reducedMotion = useReducedMotion()
  const { state, dispatch } = useStudioForm()
  const { runModels } = useStudioRunModels()
  const characters = useNovelAiCharacters()
  const flashing = useTagTargetFlash()

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

  const positiveChips = positiveOf(activeIndex)
  const negativeChips = negativeOf(activeIndex)

  const positiveFieldRef = useRef<StudioTagTextFieldHandle>(null)
  const negativeFieldRef = useRef<StudioTagTextFieldHandle>(null)
  const [showTranslations, setShowTranslations] = useState(
    readSavedTranslationStripPreference,
  )
  const toggleTranslations = () => {
    setShowTranslations((current) => {
      const next = !current
      try {
        window.localStorage.setItem(
          TRANSLATION_STRIP_STORAGE_KEY,
          next ? '1' : '0',
        )
      } catch {
        // Ignore storage errors in restricted contexts
      }
      return next
    })
  }
  const allVisibleTagTexts = useMemo(
    () => [
      ...positiveChips.map((chip) => chip.text),
      ...negativeChips.map((chip) => chip.text),
    ],
    [negativeChips, positiveChips],
  )
  const sharedTagMeta = useTagMetaLookup(allVisibleTagTexts, showTranslations)

  const setChips = (polarity: 'positive' | 'negative', next: TagChip[]) => {
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
      : people[activeIndex]?.label ||
        t('workbench.characterNumber', { number: activeIndex + 1 })

  const positiveLabel = who
    ? t('characterPositiveLabel', { number: (activeIndex ?? 0) + 1 })
    : t('positiveLabel')
  const negativeLabel = who
    ? `${t('tabs.negative')} · ${who}`
    : t('tabs.negative')
  const positivePlaceholder =
    activeIndex === null
      ? t('tabs.wholePlaceholder')
      : t('tabs.characterPlaceholder', { number: activeIndex + 1 })

  // 当前所选模型是否支持自定义负向提示词（V5 Medium 锁定 Heavy UC、忽略自定义负向）。
  const supportsCustomNegative =
    runModels.length === 0 ||
    runModels.some((model) =>
      getCapabilityConfig(
        model.adapterType,
        model.modelId,
      ).capabilities.includes('negativePrompt'),
    )
  const capabilityChips = runModels.flatMap((model) =>
    getModelCapabilityChips(model.adapterType, model.modelId),
  )
  const qualityPresetChip = capabilityChips.find(
    (entry) => entry.capability === 'qualityToggle',
  )
  const qualityPresetValue = qualityPresetChip
    ? String(getCapabilityChipValue(qualityPresetChip, state.advancedParams))
    : null
  const ucPresetChip = capabilityChips.find(
    (entry) => entry.capability === 'ucPreset',
  )
  const ucPresetValue = ucPresetChip
    ? String(getCapabilityChipValue(ucPresetChip, state.advancedParams))
    : null

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
      {/* 1. 页签行吸顶固定（挂 data-bench-header，对话收起时头像与本行左端稳定对齐，不随正文滚走） */}
      <div
        data-bench-header
        className="flex min-w-0 shrink-0 items-center gap-1.5"
      >
        <StudioTagPageTabs
          whole={{
            count: state.tagChips.length,
            preview: serializeTagChips(state.tagChips),
          }}
          characters={people.map((person, index) => ({
            count: parseTagChips(person.prompt).length,
            enabled: person.enabled !== false,
            flashing: flashing === index,
            preview: person.prompt,
            label: person.label,
            dirty: person.origin
              ? !sameTags(person.prompt, person.origin.tags)
              : false,
            menuExtra: (
              <StudioTagCharacterMenuExtra
                index={index}
                character={person}
                fallbackName={t('workbench.characterNumber', {
                  number: index + 1,
                })}
                onUpdate={characters.update}
              />
            ),
          }))}
          activeIndex={activeIndex}
          addControl={
            characters.mode ? (
              <StudioTagAddCharacter
                disabled={disabled}
                full={characters.characters.length >= characters.max}
                onAdd={({ prompt, ...extra }) => {
                  characters.add(prompt, extra)
                }}
              />
            ) : null
          }
          disabled={disabled}
          onSelect={(index) => characters.select(index)}
          onEnabledChange={(index, enabled) =>
            characters.update(index, { enabled })
          }
          onRemove={characters.remove}
        />
      </div>

      {/* 2. 单一竖向滚动正文区（禁横向溢出，静默细滚条，悬停时浮现） */}
      <div className="studio-subtle-scroll flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 overflow-x-hidden overflow-y-auto overscroll-contain pr-0.5">
        {/* 正向 + 负向统一双段写词卡（图一方案 A：同卡分层、极细发丝线隔开） */}
        <motion.div
          key={activeIndex ?? WHOLE}
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
          className="flex min-w-0 flex-col rounded-16 bg-muted/60"
        >
          {/* 正向段 */}
          <div
            data-assistant-field="prompt"
            className="flex min-w-0 flex-col gap-1.5 px-3 pt-2.5 pb-2.5"
          >
            <div className="flex items-center justify-between gap-2 text-2xs">
              <span className="font-semibold text-muted-foreground">
                {who
                  ? t('positiveSectionCharacter', { who })
                  : t('positiveSectionWhole')}
              </span>
              <div className="flex items-center gap-1.5">
                {activeIndex === null &&
                qualityPresetChip?.options &&
                qualityPresetValue ? (
                  <InlinePresetSwitcher
                    options={qualityPresetChip.options}
                    value={qualityPresetValue}
                    disabled={disabled}
                    subtle
                    triggerLabel={t('qualityPresetTrigger', {
                      preset: tAdvanced(
                        `qualityToggleOption.${qualityPresetValue}`,
                      ),
                    })}
                    shortLabel={t('qualityPresetShort', {
                      preset: tAdvanced(
                        `qualityToggleOption.${qualityPresetValue}`,
                      ),
                    })}
                    menuLabel={t('qualityPresetMenuLabel')}
                    labelFor={(option) =>
                      tAdvanced(`qualityToggleOption.${option}`)
                    }
                    onChange={(next) =>
                      dispatch({
                        type: 'SET_ADVANCED_PARAMS',
                        payload: {
                          ...state.advancedParams,
                          qualityToggle:
                            next as AdvancedParams['qualityToggle'],
                        },
                      })
                    }
                  />
                ) : null}
                <button
                  type="button"
                  aria-pressed={showTranslations}
                  onClick={toggleTranslations}
                  className={cn(
                    'touch-target-y inline-flex h-5.5 items-center rounded-full px-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-focus',
                    showTranslations
                      ? 'bg-foreground text-background'
                      : 'bg-card text-muted-foreground shadow-seg hover:text-foreground',
                  )}
                >
                  {t('translationStrip.toggle')}
                </button>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {positiveChips.length}
                </span>
              </div>
            </div>
            {activeIndex === null && onOpenBlocks ? (
              <StudioTagActiveBlocksBar
                target="positive"
                position="prefix"
                variant="inline"
                disabled={disabled}
                onOpenBlocks={onOpenBlocks}
              />
            ) : null}
            <StudioTagTextField
              fieldRef={positiveFieldRef}
              variant="bare"
              panelDensity="panel"
              showWeightControls
              enableCooccurrence
              tagMeta={showTranslations ? sharedTagMeta.items : undefined}
              modelId={tagModelId}
              label={positiveLabel}
              placeholder={positivePlaceholder}
              polarity="positive"
              chips={positiveChips}
              markedTags={marks}
              disabled={disabled || characterDisabled}
              onChange={(next) => setChips('positive', next)}
              status={activeIndex === null ? carry : undefined}
              onLookup={lookup}
            />
            {activeIndex === null && onOpenBlocks ? (
              <StudioTagActiveBlocksBar
                target="positive"
                position="suffix"
                variant="inline"
                disabled={disabled}
                onOpenBlocks={onOpenBlocks}
              />
            ) : null}
            {showTranslations ? (
              <StudioTagTranslationStrip
                chips={positiveChips}
                tagMeta={sharedTagMeta.items}
                loading={sharedTagMeta.loading}
                disabled={disabled || characterDisabled}
                onSelectIndex={(index) =>
                  positiveFieldRef.current?.focusTagAt(index)
                }
                onLookup={lookup}
                onRemove={(index) =>
                  setChips(
                    'positive',
                    positiveChips.filter((_, i) => i !== index),
                  )
                }
              />
            ) : null}
            {characters.mode ? (
              <StudioTagCountHint
                activeIndex={activeIndex}
                mobile={false}
                disabled={disabled || characterDisabled}
              />
            ) : null}
          </div>

          <div className="mx-3 h-px bg-border/75" aria-hidden />

          {/* 负向段（同卡下半段，随当前页签联动） */}
          {supportsCustomNegative ? (
            <div
              data-assistant-field="negativePrompt"
              className="flex min-w-0 flex-col gap-1.5 px-3 pt-2.5 pb-2.5"
            >
              <div className="flex items-center justify-between gap-2 text-2xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-muted-foreground">
                    {who
                      ? t('negativeSectionCharacter', { who })
                      : t('negativeSectionWhole')}
                  </span>
                  {negativeChips.length > 0 ? (
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {negativeChips.length}
                    </span>
                  ) : null}
                </div>
                {activeIndex === null &&
                ucPresetChip?.options &&
                ucPresetValue ? (
                  <InlinePresetSwitcher
                    options={ucPresetChip.options}
                    value={ucPresetValue}
                    disabled={disabled}
                    triggerLabel={t('ucPresetTrigger', {
                      preset: tAdvanced(`ucPresetOption.${ucPresetValue}`),
                    })}
                    shortLabel={t('ucPresetShort', {
                      preset: tAdvanced(`ucPresetOption.${ucPresetValue}`),
                    })}
                    menuLabel={t('ucPresetMenuLabel')}
                    labelFor={(option) => tAdvanced(`ucPresetOption.${option}`)}
                    onChange={(next) =>
                      dispatch({
                        type: 'SET_ADVANCED_PARAMS',
                        payload: {
                          ...state.advancedParams,
                          ucPreset: next as AdvancedParams['ucPreset'],
                        },
                      })
                    }
                  />
                ) : null}
              </div>
              {activeIndex === null && onOpenBlocks ? (
                <StudioTagActiveBlocksBar
                  target="negative"
                  position="prefix"
                  variant="inline"
                  disabled={disabled}
                  onOpenBlocks={onOpenBlocks}
                />
              ) : null}
              <StudioTagTextField
                fieldRef={negativeFieldRef}
                variant="bare"
                panelDensity="panel-compact"
                showWeightControls
                enableCooccurrence
                tagMeta={showTranslations ? sharedTagMeta.items : undefined}
                modelId={tagModelId}
                label={negativeLabel}
                placeholder={t('tabs.negativePlaceholder')}
                polarity="negative"
                chips={negativeChips}
                disabled={disabled || characterDisabled}
                onChange={(next) => setChips('negative', next)}
                onLookup={lookup}
              />
              {activeIndex === null && onOpenBlocks ? (
                <StudioTagActiveBlocksBar
                  target="negative"
                  position="suffix"
                  variant="inline"
                  disabled={disabled}
                  onOpenBlocks={onOpenBlocks}
                />
              ) : null}
              {showTranslations ? (
                <StudioTagTranslationStrip
                  chips={negativeChips}
                  tagMeta={sharedTagMeta.items}
                  loading={sharedTagMeta.loading}
                  disabled={disabled || characterDisabled}
                  onSelectIndex={(index) =>
                    negativeFieldRef.current?.focusTagAt(index)
                  }
                  onLookup={lookup}
                  onRemove={(index) =>
                    setChips(
                      'negative',
                      negativeChips.filter((_, i) => i !== index),
                    )
                  }
                />
              ) : null}
            </div>
          ) : (
            <div
              role="status"
              data-testid="novelai-medium-negative-notice"
              className="flex min-w-0 flex-col gap-1 px-3 py-2.5 text-2xs text-muted-foreground"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">
                  {t('tabs.negative')}
                </span>
                <span className="rounded-full bg-card px-2 py-0.5 font-semibold text-muted-foreground shadow-seg">
                  {t('negativeLockedMediumBadge')}
                </span>
              </div>
              <p>{t('negativeLockedMediumHint')}</p>
            </div>
          )}
        </motion.div>

        {/* 3. 等宽 4 格高频资源条 */}
        {resourceBar}

        {/* 4. 轻量次级动作条：从图读串 · 改图 · 角色构图 + 画面文字 / 互动与台词合排一行 */}
        {secondaryActions || characters.mode ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
            {secondaryActions}
            {characters.mode ? (
              activeIndex === null ? (
                <StudioTagSceneTexts mobile={false} disabled={disabled} />
              ) : (
                <StudioTagCharacterExtras
                  index={activeIndex}
                  mobile={false}
                  disabled={disabled || characterDisabled}
                />
              )
            ) : null}
          </div>
        ) : null}

        {activeIndex !== null && onOpenBlocks ? (
          <StudioTagActiveBlocksBar
            disabled={disabled}
            onOpenBlocks={onOpenBlocks}
          />
        ) : null}

        {children}
      </div>
    </div>
  )
}

function InlinePresetSwitcher({
  options,
  value,
  disabled,
  subtle = false,
  triggerLabel,
  shortLabel,
  menuLabel,
  labelFor,
  onChange,
}: {
  options: readonly string[]
  value: string
  disabled: boolean
  subtle?: boolean
  triggerLabel: string
  shortLabel: string
  menuLabel: string
  labelFor: (option: string) => string
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)
  const popoverMotion = useStudioChipPopoverMotion({
    side: 'bottom',
    align: 'end',
    sideOffset: 6,
  })
  return (
    <StudioToolSurface open={open} onOpenChange={setOpen}>
      <StudioToolSurfaceTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={triggerLabel}
          className={cn(
            'touch-target-y inline-flex h-5.5 items-center gap-1 rounded-full bg-card px-2 text-[11px] font-semibold shadow-seg transition-colors hover:bg-fill-strong focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50',
            subtle
              ? 'text-muted-foreground hover:text-foreground'
              : 'text-foreground',
          )}
        >
          <span>{shortLabel}</span>
          <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
        </button>
      </StudioToolSurfaceTrigger>
      <ResponsivePopoverContent
        label={menuLabel}
        side="bottom"
        align="end"
        sideOffset={6}
        style={popoverMotion.style}
        className={cn(
          studioToolPopoverBaseClass,
          'w-44 p-1.5',
          popoverMotion.className,
        )}
        mobileClassName={studioToolSurfaceMobileClass.small}
      >
        <div className="flex flex-col gap-0.5">
          {options.map((option) => {
            const selected = option === value
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  onChange(option)
                  setOpen(false)
                }}
                className={cn(
                  'touch-target-y flex h-8 items-center justify-between gap-2 rounded-lg px-2 text-left text-2xs transition-colors hover:tint-hover focus-visible:outline-none focus-visible:shadow-focus',
                  selected
                    ? 'bg-muted font-semibold text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="truncate">{labelFor(option)}</span>
                {selected ? (
                  <Check
                    className="size-3.5 shrink-0 text-foreground"
                    aria-hidden
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      </ResponsivePopoverContent>
    </StudioToolSurface>
  )
}
