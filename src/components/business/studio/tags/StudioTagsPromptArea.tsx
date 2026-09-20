'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

import { MainModelPicker } from '@/components/business/studio-shared/pickers'
import { StudioGenerateButton } from '@/components/business/studio-shared/workflow/StudioGenerateButton'
import { StudioCostPreview } from '@/components/business/studio/StudioCostPreview'
import { StudioDialectSwitch } from '@/components/business/studio/tags/StudioDialectSwitch'
import { useStudioForm } from '@/contexts/studio-context'
import { useStudioGenerateAction } from '@/hooks/use-studio-generate-action'
import { getTranslatedModelLabel } from '@/lib/model-options'

/**
 * 标签台的**编辑器主区**（D10 ④，画板宽度 420）。
 *
 * 与自然语言台**同壳**：结果区 / 参考轨 / 助手 / 任务条 / 生成键全部是同一份，
 * ⛔ 这里没有第二套工作台。差别只有中间这一列长什么样。
 *
 * ⚠ 它与 `StudioPromptArea` **二选一渲染**（`StudioWorkspaceUI` 按方言分派）：
 * 两者各自调 `useStudioGenerateAction`，同时挂载会让一次 `REQUEST_GENERATE`
 * 发两遍请求 —— 与参数栏 / 移动端 composer 之间那条规矩同源。
 */
export const StudioTagsPromptArea = memo(function StudioTagsPromptArea() {
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

      {/* 成本 + 生成 —— 与自然语言台同一颗键、同一份三态。 */}
      <div className="mt-auto flex shrink-0 flex-col gap-2">
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
