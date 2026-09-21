'use client'

import { memo, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { MainModelPicker } from '@/components/business/studio-shared/pickers'
import { StudioGenerateButton } from '@/components/business/studio-shared/workflow/StudioGenerateButton'
import { StudioCostPreview } from '@/components/business/studio/StudioCostPreview'
import { StudioDialectJumpHint } from '@/components/business/studio/tags/StudioDialectJumpHint'
import { StudioDialectHeader } from '@/components/business/studio/tags/StudioDialectHeader'
import { StudioTagCapabilityControl } from '@/components/business/studio/tags/StudioTagCapabilityControl'
import { NovelAiTagModelSchema } from '@/types/novelai-tags'
import { StudioTagChipField } from '@/components/business/studio/tags/StudioTagChipField'
import { useStudioForm } from '@/contexts/studio-context'
import { useStudioGenerateAction } from '@/hooks/use-studio-generate-action'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { getTagWorkbenchControls } from '@/lib/tag-workbench-controls'
import { Button } from '@/components/ui/button'
import { StudioTagCharacters } from './StudioTagCharacters'
import { StudioTagsControlColumn } from './StudioTagsControlColumn'
import { ReferenceImageChip } from '@/components/business/studio/ReferenceImageChip'
import { StudioSpecChip } from '@/components/business/studio/StudioSpecChip'
import type { TagWorkbenchPanel } from './StudioTagsWorkbench'
import type { TagChip } from '@/types/tag-composer'

/** 标签台 A：同一份编辑状态服务桌面与手机，生成动作只挂载一次。 */
export const StudioTagsPromptArea = memo(function StudioTagsPromptArea({
  onOpenPanel,
}: {
  onOpenPanel: (panel: TagWorkbenchPanel) => void
}) {
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

  const setChips = (polarity: 'positive' | 'negative', chips: TagChip[]) =>
    dispatch({ type: 'SET_TAG_CHIPS', payload: { polarity, chips } })
  const positiveChips = state.tagChips
  const negativeChips = state.tagNegativeChips

  return (
    <div className="flex shrink-0 flex-col gap-3">
      {/* 顶栏 —— 一对分段切换是两台之间**唯一**的门（两台挂的是同一颗
          `StudioDialectHeader`，位置也一样）；右边的型号只列本方言。 */}
      <StudioDialectHeader disabled={isGenerating}>
        <div data-assistant-field="model">
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
            // 搜到对面方言的型号时给一行「带你过去」——⛔ 名单本身仍然只列
            // 自己这一台的（D10 ② Q3）。
            renderSearchFallback={(query, close) => (
              <StudioDialectJumpHint query={query} close={close} />
            )}
            popoverSide="bottom"
            disabled={isGenerating}
            className="max-w-full"
          />
        </div>
      </StudioDialectHeader>
      <div data-assistant-field="prompt">
        <StudioTagChipField
          modelId={
            runModels.find(
              (model) => NovelAiTagModelSchema.safeParse(model.modelId).success,
            )?.modelId
          }
          label={t('positiveLabel')}
          polarity="positive"
          chips={positiveChips}
          disabled={isGenerating}
          onChange={(chips) => setChips('positive', chips)}
        />
      </div>
      <details className="space-y-2">
        <summary className="cursor-pointer py-1 text-sm text-muted-foreground">
          {t('negativeLabel')}
        </summary>
        <div data-assistant-field="negativePrompt">
          <StudioTagChipField
            modelId={
              runModels.find(
                (model) =>
                  NovelAiTagModelSchema.safeParse(model.modelId).success,
              )?.modelId
            }
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
      </details>
      <StudioTagCharacters
        disabled={isGenerating}
        onCompose={() => onOpenPanel('composition')}
        onLookup={() => onOpenPanel('catalog')}
      />
      <section className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{t('workbench.blocks')}</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpenPanel('blocks')}
          >
            {t('workbench.editBlocks')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.tagPromptBlocks?.map((block) => (
            <Button
              key={block.id}
              variant="outline"
              size="sm"
              aria-pressed={block.enabled}
              disabled={isGenerating}
              onClick={() =>
                dispatch({
                  type: 'SET_TAG_PROMPT_BLOCKS',
                  payload: state.tagPromptBlocks.map((item) =>
                    item.id === block.id
                      ? { ...item, enabled: !item.enabled }
                      : item,
                  ),
                })
              }
            >
              {block.name} ·{' '}
              {t(block.enabled ? 'workbench.on' : 'workbench.off')}
            </Button>
          ))}
        </div>
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t('workbench.compiled')}
          </summary>
          <p className="whitespace-pre-wrap break-words py-2 text-sm">
            {state.prompt}
          </p>
        </details>
      </section>
      <Toolbar.Root className="flex flex-wrap gap-2 border-t border-border pt-3">
        <ReferenceImageChip disabled={isGenerating} />
        <StudioSpecChip disabled={isGenerating} />
      </Toolbar.Root>
      <div className="studio-tag-settings flex flex-col gap-3 border-t border-border pt-3">
        <StudioTagsControlColumn hideCharacters compact />
      </div>{' '}
      {textRendering ? (
        <details>
          <summary className="cursor-pointer py-1 text-sm text-muted-foreground">
            {t('workbench.textRendering')}
          </summary>
          <StudioTagCapabilityControl
            control={textRendering}
            disabled={isGenerating}
          />
        </details>
      ) : null}
      {/* 成本 + 生成 —— 与自然语言台同一颗键、同一份三态。 */}
      <div className="sticky bottom-0 z-10 mt-auto flex shrink-0 flex-col gap-2 border-t border-border bg-card py-3">
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
