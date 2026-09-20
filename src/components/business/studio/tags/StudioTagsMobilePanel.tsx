'use client'

import { memo, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { ChevronDown } from '@/components/icons'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { MainModelPicker } from '@/components/business/studio-shared/pickers'
import { StudioGenerateButton } from '@/components/business/studio-shared/workflow/StudioGenerateButton'
import { StudioTagCapabilityControl } from '@/components/business/studio/tags/StudioTagCapabilityControl'
import { StudioTagChipField } from '@/components/business/studio/tags/StudioTagChipField'
import { StudioTagsControlColumn } from '@/components/business/studio/tags/StudioTagsControlColumn'
import { StudioDialectJumpHint } from '@/components/business/studio/tags/StudioDialectJumpHint'
import { StudioDialectSwitch } from '@/components/business/studio/tags/StudioDialectSwitch'
import { NovelAiCharacterComposer } from '@/components/business/studio/tags/NovelAiCharacterComposer'
import { STUDIO_PROMPT_SCROLL_ANCHOR_ID } from '@/constants/studio-mobile'
import {
  getNovelAiCharacterLayoutMode,
  getNovelAiMaxCharacters,
} from '@/constants/novelai'
import { useStudioForm } from '@/contexts/studio-context'
import { useStudioGenerateAction } from '@/hooks/use-studio-generate-action'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { getTagWorkbenchControls } from '@/lib/tag-workbench-controls'
import { parseTagChips, serializeTagChips } from '@/lib/tag-composer'
import { cn } from '@/lib/utils'
import type { AdvancedParams } from '@/types'
import type { TagChip } from '@/types/tag-composer'

const rowClass = cn(
  'touch-target-y flex h-10 w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-3 text-xs',
  'transition-colors duration-fast ease-standard active:bg-muted/60',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
  'disabled:pointer-events-none disabled:opacity-50',
)

/**
 * 标签台的**移动端参数栈**（D10 ④ 手机形态，375 起）。
 *
 * ⚠ 它**不是**底部固定 composer：那一条是为「一行输入框 + 一颗方键」量身做的
 * （`--studio-mobile-composer-height` 预留 7rem），装不下常驻的编辑器 + UC 预设
 * + 两条可展开条目。所以标签台的手机形态走纵向栈的上半截（参数在上、结果在
 * 下），⛔ 不去改那套为另一种形态定的预留高度。
 *
 * ⭐ **编辑器与 UC 预设常驻** —— 那两样是每次都要动的；右列折成**两行可展开的
 * 条目**。角色构图展开是**整屏**：网格才点得准。
 *
 * ⚠ 与 `StudioMobileComposer` / `StudioTagsPromptArea` **三选一渲染**
 * （`StudioWorkspaceUI` 按方言 + 视口分派）：三者各自调
 * `useStudioGenerateAction`，同时挂载会让一次请求发两遍。
 * ⚠ `id` 顶的是 `#studio-prompt` 这条既有滚动锚点（prefill / node handoff /
 * skip-link 都指着它），所以这三颗永不同时挂载。
 */
export const StudioTagsMobilePanel = memo(function StudioTagsMobilePanel() {
  const t = useTranslations('StudioTags')
  const tStudio = useTranslations('StudioV2')
  const tForm = useTranslations('StudioForm')
  const tModels = useTranslations('Models')
  const { state, dispatch } = useStudioForm()
  const {
    runModels,
    runModelIds,
    filterModelByDialect,
    handleToggleRunModel,
    canGenerate,
    blockedReason,
    handleGenerate,
    isGenerating,
    elapsedSeconds,
    isImagePromptOverLimit,
  } = useStudioGenerateAction()

  const [charactersOpen, setCharactersOpen] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)

  const controls = useMemo(
    () => getTagWorkbenchControls(runModels),
    [runModels],
  )
  const ucPreset = controls.find(
    (control) => control.chip.capability === 'ucPreset',
  )

  const layout = state.advancedParams.novelAiLayout
  const activeIndex = state.activeTagCharacterIndex
  const activeCharacter =
    activeIndex !== null ? layout?.characters[activeIndex] : undefined

  const characterModel = runModels.find((model) =>
    getNovelAiCharacterLayoutMode(model.modelId),
  )
  const characterMode = getNovelAiCharacterLayoutMode(characterModel?.modelId)

  const modelSummary = runModels.length
    ? runModels
        .map((option) => getTranslatedModelLabel(tModels, option.modelId))
        .join(' · ')
    : tStudio('noModelHint')

  const setChips = (polarity: 'positive' | 'negative', chips: TagChip[]) => {
    if (activeCharacter && layout && activeIndex !== null) {
      const text = serializeTagChips(chips)
      dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: {
          ...state.advancedParams,
          novelAiLayout: {
            ...layout,
            characters: layout.characters.map((character, index) =>
              index === activeIndex
                ? {
                    ...character,
                    ...(polarity === 'positive'
                      ? { prompt: text }
                      : { negativePrompt: text }),
                  }
                : character,
            ),
          },
        } satisfies AdvancedParams,
      })
      return
    }
    dispatch({ type: 'SET_TAG_CHIPS', payload: { polarity, chips } })
  }

  return (
    <div id={STUDIO_PROMPT_SCROLL_ANCHOR_ID} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <StudioDialectSwitch disabled={isGenerating} />
        <div className="ml-auto min-w-0">
          <MainModelPicker
            modality="image"
            memoryScope="image-tags"
            value={null}
            onChange={(option) =>
              dispatch({ type: 'SET_OPTION_ID', payload: option.optionId })
            }
            selectedOptionIds={runModelIds}
            onToggleOption={handleToggleRunModel}
            filterOption={filterModelByDialect}
            renderSearchFallback={(query, close) => (
              <StudioDialectJumpHint query={query} close={close} />
            )}
            triggerEmptyLabel={modelSummary}
            searchPlaceholder={tForm('modelSelector.searchPlaceholder')}
            emptySearchText={tForm('modelSelector.emptySearch')}
            popoverSide="top"
            disabled={isGenerating}
            className="max-w-full"
          />
        </div>
      </div>

      {/* 编辑器常驻 —— 手机上每次都要动它。⚠ 负向栏折进「其它控件」那一条：
            正向标签与 UC 预设才是每一枪都改的两样。 */}
      <StudioTagChipField
        label={
          activeCharacter
            ? t('characterPositiveLabel', { number: (activeIndex ?? 0) + 1 })
            : t('positiveLabel')
        }
        polarity="positive"
        chips={
          activeCharacter
            ? parseTagChips(activeCharacter.prompt)
            : state.tagChips
        }
        disabled={isGenerating}
        onChange={(chips) => setChips('positive', chips)}
      />

      {ucPreset ? (
        <StudioTagCapabilityControl
          control={ucPreset}
          disabled={isGenerating}
        />
      ) : null}

      {/* 右列折成条目。⚠ 两行都是**展开**不是跳走：参数改完还在同一屏上。 */}
      {characterMode && characterModel ? (
        <button
          type="button"
          onClick={() => setCharactersOpen(true)}
          disabled={isGenerating}
          aria-haspopup="dialog"
          className={rowClass}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {t('characterTitle')}
          </span>
          <span className="shrink-0 font-mono text-3xs tabular-nums text-muted-foreground">
            {t('characterCount', {
              count: layout?.characters.length ?? 0,
            })}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => setControlsOpen(true)}
        disabled={isGenerating}
        aria-haspopup="dialog"
        className={rowClass}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {t('moreControls')}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      <StudioGenerateButton
        ariaLabel={tStudio('generate')}
        label={tStudio('generateCount', {
          count: Math.max(1, runModels.length) * state.imageBatchCount,
        })}
        busyLabel={tStudio('generating')}
        blockedMessage={blockedReason?.message}
        isGenerating={isGenerating}
        elapsedSeconds={elapsedSeconds}
        canGenerate={canGenerate}
        disabled={isGenerating || isImagePromptOverLimit}
        onGenerate={() => {
          void handleGenerate()
        }}
      />

      {/* 角色构图 —— **整屏**：网格才点得准（D10 ④ 手机形态）。 */}
      {characterMode && characterModel ? (
        <Drawer open={charactersOpen} onOpenChange={setCharactersOpen}>
          <DrawerContent className="max-h-[92svh]">
            <DrawerHeader>
              <DrawerTitle className="text-base">
                {t('characterTitle')}
              </DrawerTitle>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">
              <NovelAiCharacterComposer
                mode={characterMode}
                maxCharacters={getNovelAiMaxCharacters(characterModel.modelId)}
                value={layout}
                activeIndex={activeIndex}
                disabled={isGenerating}
                onChange={(next) =>
                  dispatch({
                    type: 'SET_ADVANCED_PARAMS',
                    payload: {
                      ...state.advancedParams,
                      novelAiLayout: next,
                    } satisfies AdvancedParams,
                  })
                }
                onSelect={(index) => {
                  dispatch({
                    type: 'SET_ACTIVE_TAG_CHARACTER',
                    payload: index,
                  })
                  // 选完就回编辑器 —— 那个人的标签在上面那一栏里等着改。
                  if (index !== null) setCharactersOpen(false)
                }}
              />
            </div>
          </DrawerContent>
        </Drawer>
      ) : null}

      {/* 其它控件 —— 与桌面右列**同一份内容**，⛔ 不为手机再写一套卡片。 */}
      <Drawer open={controlsOpen} onOpenChange={setControlsOpen}>
        <DrawerContent className="max-h-[80svh]">
          <DrawerHeader>
            <DrawerTitle className="text-base">{t('moreControls')}</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-6">
            <StudioTagChipField
              label={t('negativeLabel')}
              note={t('negativeNote')}
              polarity="negative"
              chips={
                activeCharacter
                  ? parseTagChips(activeCharacter.negativePrompt)
                  : state.tagNegativeChips
              }
              disabled={isGenerating}
              onChange={(chips) => setChips('negative', chips)}
            />
            <StudioTagsControlColumn hideCharacters />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
})
