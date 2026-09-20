'use client'

import { useMemo, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { NovelAiCharacterComposer } from '@/components/business/studio/tags/NovelAiCharacterComposer'
import { StudioTagCapabilityControl } from '@/components/business/studio/tags/StudioTagCapabilityControl'
import {
  getNovelAiCharacterLayoutMode,
  getNovelAiImageDimensions,
  getNovelAiMaxCharacters,
  isWithinNovelAiOpusFreeTier,
} from '@/constants/novelai'
import {
  useStudioData,
  useStudioForm,
  useStudioGen,
} from '@/contexts/studio-context'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import { isCapabilityChipVisible } from '@/lib/model-capability-chips'
import { getTranslatedModelLabel } from '@/lib/model-options'
import {
  getTagWorkbenchControls,
  type TagWorkbenchControl,
} from '@/lib/tag-workbench-controls'
import type { AdvancedParams } from '@/types'
import type { StudioModelOption } from '@/types/model-option'
import type { NovelAiCharacterLayout } from '@/types/novelai'

/**
 * 标签台的**右列常驻控件**（D10 ④，画板宽度 272），自上而下：
 * 角色构图 · 质量标签 · 采样器 / 步数 · 分辩率 / 额度 · 参考图用法。
 *
 * ⚠ 控件名单仍从 `provider-capabilities` 派生（进度表 11 的结论），只是排版
 * 从「一行 chip」换成常驻卡片 —— ⛔ 这里没有第二份能力表，也没有模型名分支。
 * UC 预设与 `Text:` 归编辑器主区（画板把它们画在正负两栏底下），所以这一列
 * 把那两条让出去。
 *
 * 多选交集态（② Q3）：每张卡自己报「这一档只对谁生效」并保持可改；
 * 真正的裁剪发生在发请求那一跳（`tailorImageRequestToModel`）。
 */

/** 归编辑器主区的那两条，右列不重复画。 */
const EDITOR_OWNED: readonly string[] = ['ucPreset', 'textRendering']

/**
 * 卡片顺序 —— 画板自上而下的那一列。⚠ 排的是**能力键**不是模型名，所以它仍然
 * 是「能力表说有什么就画什么」，只是画的先后有个定数。表外的能力排在这几张
 * 之后，按能力表自己的声明顺序 —— ⛔ 不因为画板没画到就把它藏了。
 */
const CARD_ORDER: readonly string[] = ['qualityToggle', 'sampler', 'steps']

/** 与上一张卡合并成一张的能力（「采样器 · 步数」是画板上的一张卡）。 */
const MERGED_INTO: Readonly<Record<string, string>> = { steps: 'sampler' }

export interface StudioTagsControlColumnProps {
  /**
   * 手机上角色构图自己占一条整屏条目（D10 ④），所以那张卡不在这一叠里
   * 重复出现。桌面不传 = 照画。
   */
  hideCharacters?: boolean
}

export function StudioTagsControlColumn({
  hideCharacters,
}: StudioTagsControlColumnProps = {}) {
  const t = useTranslations('StudioTags')
  const tCapability = useTranslations('StudioCapabilityChips')
  const tModels = useTranslations('Models')
  const { state, dispatch } = useStudioForm()
  // ⚠ 走**纯读**那颗 hook：`useStudioGenerateAction` 带着 `REQUEST_GENERATE`
  // 的执行端 effect，右列再挂一份会让一次请求发两遍。
  const { runModels } = useStudioRunModels()
  const { isGenerating } = useStudioGen()
  const { imageUpload } = useStudioData()
  const hasReferenceImage = imageUpload.referenceImages.length > 0

  const controls = useMemo(
    () => getTagWorkbenchControls(runModels),
    [runModels],
  )

  const onlyForNote = (supportedBy: readonly string[]) =>
    supportedBy.length === 0 || supportedBy.length === runModels.length
      ? null
      : t('onlyFor', {
          models: supportedBy
            .map((modelId) => getTranslatedModelLabel(tModels, modelId))
            .join(' · '),
        })

  /**
   * 角色构图的形态由**第一个支持它的模型**说了算（名单第一位是主模型）。
   * 多选里只有它一家支持时，卡片标「只对 X 生效」，⛔ 仍然可改。
   */
  const characterSupport = runModels.filter((model) =>
    getNovelAiCharacterLayoutMode(model.modelId),
  )
  const characterModel = characterSupport[0]
  const characterMode = getNovelAiCharacterLayoutMode(characterModel?.modelId)

  const setLayout = (layout: NovelAiCharacterLayout | undefined) =>
    dispatch({
      type: 'SET_ADVANCED_PARAMS',
      payload: {
        ...state.advancedParams,
        novelAiLayout: layout,
      } satisfies AdvancedParams,
    })

  // 画板顺序在前，表外的按能力表自己的声明顺序跟在后面。
  const visible = controls.filter(
    (control) =>
      !EDITOR_OWNED.includes(control.chip.capability) &&
      isCapabilityChipVisible(
        control.chip,
        state.advancedParams,
        hasReferenceImage,
      ),
  )
  const ranked = [...visible].sort((a, b) => {
    const rank = (control: TagWorkbenchControl) => {
      const index = CARD_ORDER.indexOf(control.chip.capability)
      return index === -1 ? CARD_ORDER.length + visible.indexOf(control) : index
    }
    return rank(a) - rank(b)
  })
  const present = new Set<string>(
    ranked.map((control) => control.chip.capability),
  )
  /**
   * ⚠ 合并**只在宿主那张卡也在场时**成立。PixAI 的 SDXL 两档声明了 `steps`
   * 却没有 `sampler`（那是 NAI 的档）—— 无条件把 steps 折进 sampler，它就连同
   * 宿主一起整个消失了。判据是「宿主在不在」，⛔ 不是「它属不属于某张卡」。
   */
  const isMerged = (capability: string) => {
    const host = MERGED_INTO[capability]
    return host !== undefined && present.has(host)
  }
  const cards = ranked.filter((control) => !isMerged(control.chip.capability))
  const mergedFor = (capability: string) =>
    ranked.filter(
      (control) =>
        isMerged(control.chip.capability) &&
        MERGED_INTO[control.chip.capability] === capability,
    )

  return (
    <>
      {characterMode && characterModel && !hideCharacters ? (
        <ControlCard
          title={t('characterTitle')}
          note={onlyForNote(characterSupport.map((model) => model.modelId))}
        >
          <NovelAiCharacterComposer
            mode={characterMode}
            maxCharacters={getNovelAiMaxCharacters(characterModel.modelId)}
            value={state.advancedParams.novelAiLayout}
            activeIndex={state.activeTagCharacterIndex}
            disabled={isGenerating}
            onChange={setLayout}
            onSelect={(index) =>
              dispatch({ type: 'SET_ACTIVE_TAG_CHARACTER', payload: index })
            }
          />
        </ControlCard>
      ) : null}

      {cards.map((control) => {
        const merged = mergedFor(control.chip.capability)
        return (
          <ControlCard
            key={control.chip.capability}
            title={[control, ...merged]
              .map((entry) =>
                tCapability(`capability.${entry.chip.capability}`),
              )
              .join(' · ')}
            note={onlyForNote(control.supportedBy)}
          >
            <StudioTagCapabilityControl
              control={control}
              disabled={isGenerating}
              hideLabel
            />
            {merged.map((entry) => (
              <StudioTagCapabilityControl
                key={entry.chip.capability}
                control={entry}
                disabled={isGenerating}
                hideLabel
              />
            ))}
          </ControlCard>
        )
      })}

      {hasReferenceImage &&
      state.advancedParams.novelAiReferenceMode === 'precise' ? (
        <p className="text-2xs text-muted-foreground">
          {t('preciseReferenceCost')}
        </p>
      ) : null}
      <ResolutionCard runModels={runModels} note={onlyForNote} />
      {hasReferenceImage &&
      !controls.some(
        (control) => control.chip.capability === 'novelAiReferenceMode',
      ) ? (
        <span className="text-2xs text-muted-foreground">
          {t('referenceUsage.standard')}
        </span>
      ) : null}
    </>
  )
}

function ControlCard({
  title,
  note,
  children,
}: {
  title: string
  note: string | null
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="shrink-0 text-2xs font-medium">{title}</h3>
        {note ? (
          <span className="text-3xs text-muted-foreground">{note}</span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

type OnlyForNote = (supportedBy: readonly string[]) => string | null

/**
 * 分辩率 · 额度。
 *
 * ⚠ 额度这一格报的是**官方写过的那条判据**（Opus 免费窗口：单张 · ≤1024² ·
 * ≤28 步），⛔ 不报一个「大约多少 Anlas」的数 —— NovelAI 没有公开逐档价目，
 * 摆一个凭社区逆向出来的系数比不报更糟。画板那格的「约 28 Anlas」是示意数。
 */
function ResolutionCard({
  runModels,
  note,
}: {
  runModels: readonly StudioModelOption[]
  note: OnlyForNote
}) {
  const t = useTranslations('StudioTags')
  const { state } = useStudioForm()

  const novelAi = runModels.filter((model) =>
    getNovelAiCharacterLayoutMode(model.modelId),
  )
  if (novelAi.length === 0) return null

  const { width, height } = getNovelAiImageDimensions(state.aspectRatio)
  const free = isWithinNovelAiOpusFreeTier({
    width,
    height,
    steps: state.advancedParams.steps ?? 28,
    imageCount: state.imageBatchCount,
  })

  return (
    <ControlCard
      title={t('resolutionTitle')}
      note={note(novelAi.map((model) => model.modelId))}
    >
      <div className="flex items-center justify-between gap-2 text-2xs">
        <span className="font-mono tabular-nums">
          {width}×{height}
        </span>
        <span className="truncate text-3xs text-muted-foreground">
          {free && state.advancedParams.novelAiReferenceMode !== 'precise'
            ? t('opusFree')
            : t('opusMetered')}
        </span>
      </div>
    </ControlCard>
  )
}
