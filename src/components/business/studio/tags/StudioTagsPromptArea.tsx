'use client'

import { memo, useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { MainModelPicker } from '@/components/business/studio-shared/pickers'
import { StudioGenerateButton } from '@/components/business/studio-shared/workflow/StudioGenerateButton'
import { StudioCostPreview } from '@/components/business/studio/StudioCostPreview'
import { StudioDialectSwitch } from '@/components/business/studio/tags/StudioDialectSwitch'
import { StudioTagCapabilityControl } from '@/components/business/studio/tags/StudioTagCapabilityControl'
import { StudioTagChipField } from '@/components/business/studio/tags/StudioTagChipField'
import { useStudioForm } from '@/contexts/studio-context'
import { useStudioGenerateAction } from '@/hooks/use-studio-generate-action'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { parseTagChips, serializeTagChips } from '@/lib/tag-composer'
import { getTagWorkbenchControls } from '@/lib/tag-workbench-controls'
import type { AdvancedParams } from '@/types'
import type { TagChip } from '@/types/tag-composer'

/**
 * 标签台的**编辑器主区**（D10 ④，画板宽度 420）。自上而下：
 * 正向标签 → 负向 / UC → UC 预设一排 chip → `Text:` 文字渲染 → 出图。
 *
 * 与自然语言台**同壳**：结果区 / 参考轨 / 助手 / 任务条 / 生成键全部是同一份，
 * ⛔ 这里没有第二套工作台。差别只有中间这一列长什么样。
 *
 * ⚠ 它与 `StudioPromptArea` **二选一渲染**（`StudioWorkspaceUI` 按方言分派）：
 * 两者各自调 `useStudioGenerateAction`，同时挂载会让一次 `REQUEST_GENERATE`
 * 发两遍请求 —— 与参数栏 / 移动端 composer 之间那条规矩同源。
 */
export const StudioTagsPromptArea = memo(function StudioTagsPromptArea() {
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

  /**
   * 顶栏右边那颗模型 chip —— 一行就把这一轮要跑的型号说完。⚠ `value` 恒为
   * null：选中状态由 `selectedOptionIds` 说，传进去会让触发器和弹层里的勾选
   * 写着同一条信息两遍（与自然语言台那颗同一个理由）。
   */
  const modelSummary = runModels.length
    ? runModels
        .map((option) => getTranslatedModelLabel(tModels, option.modelId))
        .join(' · ')
    : tStudio('noModelHint')

  /**
   * 这一轮选中的模型共同长出来的控件（能力表派生 + 台内取交集）。编辑器主区
   * 只认领其中两条 —— UC 预设与 `Text:`，画板把它们画在正负两栏底下；其余归
   * 右列。
   */
  const controls = useMemo(
    () => getTagWorkbenchControls(runModels),
    [runModels],
  )
  const ucPreset = controls.find(
    (control) => control.chip.capability === 'ucPreset',
  )
  const textRendering = controls.find(
    (control) => control.chip.capability === 'textRendering',
  )

  /**
   * 正在编辑谁的标签。⭐ 选中某个角色时，编辑器主区整个切到那个角色的正负标签
   * （D10 ④）—— ⛔ 不在右列里塞两个小输入框：那是编辑器该干的事。
   */
  const layout = state.advancedParams.novelAiLayout
  const activeIndex = state.activeTagCharacterIndex
  const activeCharacter =
    activeIndex !== null ? layout?.characters[activeIndex] : undefined

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

  const positiveChips = activeCharacter
    ? parseTagChips(activeCharacter.prompt)
    : state.tagChips
  const negativeChips = activeCharacter
    ? parseTagChips(activeCharacter.negativePrompt)
    : state.tagNegativeChips

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      {/* 顶栏 —— 一对分段切换是两台之间**唯一**的门；右边的型号只列本方言。 */}
      <div className="flex items-center gap-2">
        <StudioDialectSwitch disabled={isGenerating} />
        <div className="ml-auto min-w-0" data-assistant-field="model">
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
            triggerEmptyLabel={modelSummary}
            searchPlaceholder={tForm('modelSelector.searchPlaceholder')}
            emptySearchText={tForm('modelSelector.emptySearch')}
            popoverSide="bottom"
            disabled={isGenerating}
            className="max-w-full"
          />
        </div>
      </div>

      {/* 正在编辑某个角色时，栏首一行说清是谁、怎么回到整体 —— ⛔ 不靠右列
          那颗药丸的选中态独自承担这件事，编辑器自己得说明白它在写谁。 */}
      {activeCharacter ? (
        <div className="flex items-center gap-2 rounded-lg border border-foreground/25 bg-muted px-2.5 py-1.5 text-2xs">
          <span className="min-w-0 flex-1 truncate font-medium">
            {t('editingCharacter', { number: (activeIndex ?? 0) + 1 })}
          </span>
          <button
            type="button"
            onClick={() =>
              dispatch({ type: 'SET_ACTIVE_TAG_CHARACTER', payload: null })
            }
            className="shrink-0 text-muted-foreground underline-offset-2 transition-colors duration-fast ease-standard hover:text-foreground hover:underline"
          >
            {t('backToWhole')}
          </button>
        </div>
      ) : null}

      <div data-assistant-field="prompt">
        <StudioTagChipField
          label={
            activeCharacter
              ? t('characterPositiveLabel', { number: (activeIndex ?? 0) + 1 })
              : t('positiveLabel')
          }
          polarity="positive"
          chips={positiveChips}
          disabled={isGenerating}
          onChange={(chips) => setChips('positive', chips)}
        />
      </div>

      {/* 负向栏在 NAI 语境里叫 UC —— 标题旁一行小字说明即可，
          ⛔ 不为此分叉出两个组件。 */}
      <div data-assistant-field="negativePrompt">
        <StudioTagChipField
          label={t('negativeLabel')}
          note={t('negativeNote')}
          polarity="negative"
          chips={negativeChips}
          disabled={isGenerating}
          onChange={(chips) => setChips('negative', chips)}
        />
      </div>

      {ucPreset ? (
        <StudioTagCapabilityControl
          control={ucPreset}
          disabled={isGenerating}
        />
      ) : null}

      {textRendering ? (
        <StudioTagCapabilityControl
          control={textRendering}
          disabled={isGenerating}
        />
      ) : null}

      {/* 成本 + 生成 —— 与自然语言台同一颗键、同一份三态。 */}
      <div className="mt-auto flex shrink-0 flex-col gap-2 pt-2">
        <StudioCostPreview
          models={runModels}
          basis={{
            kind: 'image',
            perModelCount: state.imageBatchCount,
            aspectRatio: state.aspectRatio,
            resolution: state.advancedParams.resolution,
            quality: state.advancedParams.quality,
            preview: state.advancedParams.preview,
          }}
        />
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
      </div>
    </div>
  )
})
