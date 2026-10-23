'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import { PLATFORM_GENERATION_GUARD, VIDEO_GENERATION } from '@/constants/config'
import type { AspectRatio } from '@/constants/config'
import {
  getModelById,
  getModelFamily,
  supportsSearchGrounding,
} from '@/constants/models'
import { VIDEO_UNIT_PRICE_BASE_RESOLUTION } from '@/constants/models/unit-prices'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getReferenceCapability,
  getReferenceCapabilityMax,
} from '@/constants/reference-image-capabilities'
import { isVideoResolution } from '@/constants/video-options'
import {
  getVideoModelParameterOptions,
  getVideoModelSendContract,
} from '@/constants/video-model-send-plan'
import {
  isVideoPickerModel,
  resolveVideoSendModelId,
} from '@/constants/video-node-modes'
import { getWorkflowById, WORKFLOW_MEDIA_GROUPS } from '@/constants/workflows'
import {
  useStudioData,
  useStudioForm,
  useStudioGen,
} from '@/contexts/studio-context'
import { useStudioModeModelOptions } from '@/hooks/use-studio-mode-model-options'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import { useModelChannelGate } from '@/hooks/use-model-channel-gate'
import { clampVideoSpecToModel } from '@/lib/studio/clamp-video-spec'
import { focusStudioPrompt } from '@/lib/focus-studio-prompt'
import { checkNovelAiText, planNovelAiText } from '@/lib/novelai-compose'
import { planStudioVideoSend } from '@/lib/studio/video-workbench-slots'
import { takeOperatorGenerationLabel } from '@/lib/studio-operator-label'
import { matchesOperatorResultOwner } from '@/lib/studio-operator-result-run'
import { getOperatorState } from '@/hooks/use-studio-operator-store'
import { getReferenceMentionIndices } from '@/lib/studio-reference-mentions'
import type { StudioModelOption } from '@/types/model-option'
import type { StudioOperatorResultOwner } from '@/types/studio-assistant-operator'
import type { CostPreviewBasis } from '@/components/business/studio/StudioCostPreview'

export interface StudioBlockedReason {
  message: string
  focusPrompt?: 'now' | 'nextFrame'
  /**
   * 点了这颗被挡住的按钮时除了 toast 还该做什么。
   * `pickChannel` = 打开模型选择器并定位到那个等着选渠道的型号行（D2 Q1）。
   */
  action?: 'pickChannel'
}

/**
 * useStudioGenerateAction —— 工作台「这一枪能不能打、打出去发什么」的**唯一**实现。
 *
 * ⭐ 抽出来的理由是**两个生成按钮**：桌面参数栏底部那颗（`StudioPromptArea`）与
 * 移动端底部 composer 里那颗 44×44 方形键（`StudioMobileComposer`）。两处各写一份
 * 禁用判据必然分叉 —— 用户会看到按钮说一件事、点出来的 toast 说另一件事。
 *
 * ⚠ **同一时刻只能有一个宿主调它**：里面有一条 `state.generateRequestId` 的副作用
 * （`REQUEST_GENERATE` 的执行端，`StudioKeepChangePanel` / 助手出图走这条路）。
 * 两个宿主同时挂载 = 同一次请求发两遍。所以 `StudioWorkbenchLayout` 是二选一渲染
 * （移动端不渲染 `StudioPromptArea`），不是 CSS 隐藏。
 */
export function useStudioGenerateAction() {
  const { state, dispatch } = useStudioForm()
  const { characters, imageUpload, projects } = useStudioData()
  const { isGenerating, generate, elapsedSeconds, canQueueMoreVideo } =
    useStudioGen()
  const tPromptArea = useTranslations('StudioPromptArea')
  const tPicker = useTranslations('ModelPicker')

  const isVideoMode = state.outputType === 'video'
  const isImageMode = !isVideoMode
  const { selectedModel, modelOptions } = useStudioModeModelOptions()
  type SelectedModelOption = NonNullable<typeof selectedModel>

  /**
   * 视频选择器**一行一个型号 × 渠道**（owner 09-24 视频画板：去掉模式）——
   * 端点在发送时按挂了什么推（`resolveStudioVideoSend`）。
   * ⚠ 必须 memo：谓词引用每帧变会把选择器的视图重置回第一层。
   * ⚠ 非视频模态传 `undefined` 而不是恒真谓词（恒真谓词一样每帧换引用）。
   */
  const filterVideoModelOption = useMemo(
    () =>
      isVideoMode
        ? (option: StudioModelOption) =>
            isVideoPickerModel(option.modelId, option.adapterType)
        : undefined,
    [isVideoMode],
  )

  const trimmedPrompt = state.prompt.trim()
  const hasPromptForImage = Boolean(trimmedPrompt)
  const imagePromptLength = isImageMode ? trimmedPrompt.length : 0
  /**
   * 图片提示词上限 —— **只认模型自己声明的那个数**（厂商硬上限，owner 2026-08-24）。
   */
  const imagePromptMaxChars = isImageMode
    ? getModelById(selectedModel?.modelId ?? '')?.maxPromptChars
    : undefined
  const isImagePromptOverLimit =
    imagePromptMaxChars !== undefined && imagePromptLength > imagePromptMaxChars
  /**
   * NovelAI 的台词与画面文字 —— 与服务端、worker 同一份编排与上限
   * （`novelai-compose`）：逐模型字数，V4 / V4.5 只认英文。只数这一轮真会发出去
   * 的人（停用 / 空白的发送前会被剔掉）。
   */
  const novelAiLayout = state.advancedParams.novelAiLayout
  const novelAiSceneTexts = state.advancedParams.novelAiSceneTexts
  const novelAiTextProblem = useMemo(() => {
    if (!isImageMode) return null
    return checkNovelAiText(
      planNovelAiText({
        characters: (novelAiLayout?.characters ?? []).filter(
          (character) => character.enabled !== false && character.prompt.trim(),
        ),
        positioning: novelAiLayout?.positioning ?? 'auto',
        sceneTexts: novelAiSceneTexts,
      }),
      selectedModel?.modelId,
    )
  }, [isImageMode, novelAiLayout, novelAiSceneTexts, selectedModel?.modelId])

  /**
   * 「选了型号但还没点渠道」闸（D2 Q1：没有「自动」渠道）。作用域就是当前模态 ——
   * 工作台一个模态只挂一个选择器，所以不传 `gateId`，与
   * `MainModelPicker` 的 `memoryScope` 一一对上。
   */
  const channelGate = useModelChannelGate(isVideoMode ? 'video' : 'image')

  // ── canGenerate ────────────────────────────────────────────────
  const currentModelId = selectedModel?.modelId
  const modelRequiresRef = currentModelId
    ? (getModelById(currentModelId)?.requiresReferenceImage ?? false)
    : false
  /**
   * ⚠ 视频的首尾帧不在参考图列表里（它们住在具名槽），所以这条闸必须一起看两处
   * —— 只看列表的话，`requiresReferenceImage` 的视频模型会在用户明明填了首帧的
   * 情况下被判「还没放参考图」。
   */
  const hasRefImage =
    imageUpload.referenceImages.length > 0 ||
    (state.outputType === 'video' &&
      (state.videoFrameSlots.first !== null ||
        state.videoFrameSlots.last !== null))
  const currentAdapterType = selectedModel?.adapterType
  const currentMaxReferenceImages =
    currentAdapterType && currentModelId
      ? getReferenceCapabilityMax(
          getReferenceCapability(
            isVideoMode ? 'video' : 'image',
            currentAdapterType,
            currentModelId,
          ),
        )
      : 1
  const modelRejectsRefImages = hasRefImage && currentMaxReferenceImages === 0
  const hasUnavailableMention =
    isImageMode &&
    getReferenceMentionIndices(state.prompt).some(
      (index) =>
        !imageUpload.referenceImages[index] ||
        index >= currentMaxReferenceImages,
    )
  /**
   * 挂了音频参考但一张图/一段视频都没挂时，有些线路会 400。
   * ⚠ 判据按**线路**走不按模型走（同一个 Seedance 2.5，火山允许纯音频参考，fal 不允许）。
   */
  const videoAudioNeedsVisual =
    isVideoMode &&
    state.videoAudioRefs.length > 0 &&
    !hasRefImage &&
    Boolean(
      selectedModel &&
      // ⚠ 挂了音频就走参考端点 —— 问的是**那个端点**的规矩，不是选中的关键帧端点。
      getVideoModelSendContract(
        resolveVideoSendModelId(
          selectedModel.modelId,
          selectedModel.adapterType as AI_ADAPTER_TYPES,
          true,
        ),
        selectedModel.adapterType as AI_ADAPTER_TYPES,
      ).slots.audioRequiresVisual,
    )
  const canGenerate =
    !!selectedModel?.modelId &&
    (isVideoMode ? !!trimmedPrompt : hasPromptForImage) &&
    (!modelRequiresRef || hasRefImage) &&
    !modelRejectsRefImages &&
    !hasUnavailableMention &&
    !isImagePromptOverLimit &&
    !novelAiTextProblem &&
    !videoAudioNeedsVisual &&
    // ⚠ 多渠道型号没选渠道 = 发不出去（没有渠道就没有端点）。⛔ 别在这里替他挑
    // 一条兜底 —— 那就是 D2 Q1 删掉的那条「自动」。
    !channelGate.blocked

  // ── Reset selectedOptionId when outputType changes ─────────────
  const prevOutputTypeRef = useRef(state.outputType)
  useEffect(() => {
    if (prevOutputTypeRef.current !== state.outputType) {
      prevOutputTypeRef.current = state.outputType
      const stillValid =
        state.selectedOptionId &&
        modelOptions.some((o) => o.optionId === state.selectedOptionId)
      if (!stillValid) {
        const fallback = modelOptions.find((o) => o.sourceType === 'saved')
        dispatch({
          type: 'SET_OPTION_ID',
          payload: fallback?.optionId ?? null,
        })
      }
    }
  }, [state.outputType, state.selectedOptionId, modelOptions, dispatch])

  /** 用户正文（内置风格预设已下线，owner 09-27：不再往前拼风格前缀）。 */
  const composePrompt = useCallback(
    (userPrompt: string): string | undefined => userPrompt.trim() || undefined,
    [],
  )

  // ── Video input builder ──────────────────────────────────────
  const buildVideoInput = useCallback(() => {
    if (!selectedModel) return null
    /**
     * ⭐ **端点与图都按挂了什么推**（owner 09-24 视频画板：去掉三个模式）：有参考项
     * （参考图 / 参考视频 / 音频）→ 该型号的参考端点，首尾帧作为参考图随行；
     * 否则走关键帧端点，只发首帧（+ 尾帧）。与画布视频节点同一个判定。
     * ⚠ 线上契约仍是 `referenceImage` + `referenceImages` 两个位置字段，序列化在这里发生。
     * ⭐ 发什么与素材排那行「这次不发」读**同一份**（`planStudioVideoSend`）：图按实际端点的
     *   参考能力夹，参考视频 / 音频按契约格数夹 —— 残留值来自「切模型」，多出来的发过去只会
     *   被服务端拒，所以在这里夹掉、并在界面上说出来（owner 09-27 视频台 A，⛔ 不静默丢）。
     */
    const plan = planStudioVideoSend(
      selectedModel.modelId,
      selectedModel.adapterType as AI_ADAPTER_TYPES,
      {
        first: state.videoFrameSlots.first,
        last: state.videoFrameSlots.last,
        // 全部参考图（含停用的）—— 与素材排、助手快照同一份，收不收由这份计划判。
        references: imageUpload.referenceEntries.map((entry) => entry.url),
        videos: state.videoReferenceVideos,
        audios: state.videoAudioRefs.length,
      },
    )
    const sendModelId = plan.modelId
    const videoMax = plan.limits.images
    const refs = [...plan.images]
    const firstRef = refs[0]
    const videoRefUrls = [...plan.videos]
    const sentAudioRefs = state.videoAudioRefs.slice(0, plan.audioCount)
    const videoAudioUrls = sentAudioRefs.map((ref) => ref.url)

    // ⚠ 视频档不带角色：角色的视频出口（卡片总线 ⑦）还没做。原来只有卡片模式会把角色
    //   提示词拼到前面，卡片模式 2026-10-22 下线（角色①），快速模式一直不带。
    const finalPrompt = composePrompt(state.prompt) ?? ''
    const selectedWorkflow = getWorkflowById(state.selectedWorkflowId)
    const videoWorkflowId =
      selectedWorkflow?.mediaGroup === WORKFLOW_MEDIA_GROUPS.VIDEO
        ? selectedWorkflow.id
        : undefined

    /**
     * ⚠ 档位按当前模型夹取，**夹在这里而不是只夹在面板里**：残留值来自「切模型」，
     * 而这里是这两个值离开客户端的唯一出口。
     */
    const { durations: allowedDurations, resolutions: allowedResolutions } =
      getVideoModelParameterOptions(sendModelId, selectedModel.adapterType)
    const duration: number | 'auto' =
      allowedDurations.length === 0
        ? 'auto'
        : allowedDurations.includes(state.videoDuration)
          ? state.videoDuration
          : allowedDurations.reduce((closest, candidate) =>
              Math.abs(candidate - state.videoDuration) <
              Math.abs(closest - state.videoDuration)
                ? candidate
                : closest,
            )
    const resolution =
      state.videoResolution &&
      allowedResolutions.includes(state.videoResolution)
        ? state.videoResolution
        : undefined

    return {
      prompt: finalPrompt,
      modelId: sendModelId,
      apiKeyId: selectedModel.keyId,
      aspectRatio: state.aspectRatio as '1:1' | '16:9' | '9:16' | '4:3' | '3:4',
      duration,
      referenceImage: firstRef,
      ...(videoMax > 1 && refs.length > 0 ? { referenceImages: refs } : {}),
      ...(videoRefUrls.length > 0 ? { videoUrls: videoRefUrls } : {}),
      negativePrompt: state.advancedParams.negativePrompt ?? undefined,
      resolution:
        resolution && isVideoResolution(resolution) ? resolution : undefined,
      ...(videoWorkflowId ? { workflowId: videoWorkflowId } : {}),
      /**
       * 原生出声：`null` = 用户没设过 → **不发这个字段**，最终值落到模型目录的
       * `videoDefaults.generateAudio`。发一个 `false` 与「没设过」在目录默认为 true
       * 的模型上结果相反，所以必须区分三态，不能 `?? false`。
       */
      ...(state.videoGenerateAudio === null
        ? {}
        : { generateAudio: state.videoGenerateAudio }),
      ...(videoAudioUrls.length > 0
        ? {
            audioUrls: videoAudioUrls,
            audioBindings: sentAudioRefs.map((ref) => ({
              url: ref.url,
              ...(ref.ownerName ? { characterName: ref.ownerName } : {}),
            })),
          }
        : {}),
    }
  }, [
    selectedModel,
    state.selectedWorkflowId,
    state.prompt,
    state.aspectRatio,
    state.videoDuration,
    state.videoResolution,
    state.advancedParams.negativePrompt,
    state.videoAudioRefs,
    state.videoGenerateAudio,
    composePrompt,
    imageUpload.referenceEntries,
    state.videoFrameSlots,
    state.videoReferenceVideos,
  ])

  /**
   * 这一轮要跑的模型名单 = 主模型 + 额外模型，按名单顺序去重。
   * 额外模型里可能有已经不在当前 options 里的（切模态、key 被删），过滤掉。
   */
  const { runModels, runModelIds, filterModelByDialect } = useStudioRunModels()

  /**
   * 「先搜再画」这一轮带不带：开着、且名单里有支持的型号。同系列一起跑时整轮
   * 共用一份参数，不支持的那一格由服务端去掉。
   */
  const searchGrounding =
    state.searchGrounding &&
    runModels.some((model) => supportsSearchGrounding(model.modelId))

  /** 把额外的负面合进 advancedParams。 */
  const composeAdvancedParams = useCallback(
    (negativePrompt?: string) => {
      const params = { ...state.advancedParams }
      const negativePrompts = [params.negativePrompt, negativePrompt]
        .map((prompt) => prompt?.trim())
        .filter((prompt): prompt is string => !!prompt)

      if (negativePrompts.length > 0) {
        params.negativePrompt = negativePrompts.join(', ')
      }
      // 只认开关：「做同款」/ 模板 / 助手写回的参数里即便带着这一位也不算。
      delete params.searchGrounding
      if (searchGrounding) params.searchGrounding = true
      return Object.keys(params).length > 0 ? params : undefined
    },
    [state.advancedParams, searchGrounding],
  )

  /**
   * 视频档的成本预览基准 —— 按**真正会发出去的那两个值**算（见 `buildVideoInput`
   * 的同名夹取），否则报的是一个用户不会被收的数。
   */
  const videoCostBasis = useMemo<CostPreviewBasis | null>(() => {
    if (!isVideoMode || !selectedModel) return null

    const { durations, resolutions } = getVideoModelParameterOptions(
      selectedModel.modelId,
      selectedModel.adapterType,
    )
    if (durations.length === 0) return null

    const durationSeconds = durations.includes(state.videoDuration)
      ? state.videoDuration
      : durations.reduce((closest, candidate) =>
          Math.abs(candidate - state.videoDuration) <
          Math.abs(closest - state.videoDuration)
            ? candidate
            : closest,
        )

    const picked =
      state.videoResolution && resolutions.includes(state.videoResolution)
        ? state.videoResolution
        : (getModelById(selectedModel.modelId)?.videoDefaults?.resolution ??
          VIDEO_UNIT_PRICE_BASE_RESOLUTION)

    return {
      kind: 'video',
      durationSeconds,
      resolution: isVideoResolution(picked)
        ? picked
        : VIDEO_UNIT_PRICE_BASE_RESOLUTION,
    }
  }, [isVideoMode, selectedModel, state.videoDuration, state.videoResolution])

  /**
   * 视频 / 音频的单选换型号（图片移动端的单选抽屉也走它）。除了 `SET_OPTION_ID`，
   * 还要**把规格收窄到新型号真支持的档位**，否则「什么都没动只换了个模型」就 400。
   */
  const handleSelectSingleModel = useCallback(
    (option: SelectedModelOption) => {
      dispatch({ type: 'SET_OPTION_ID', payload: option.optionId })
      if (!isVideoMode) return

      const next = getVideoModelParameterOptions(
        option.modelId,
        option.adapterType,
      )
      const patch = clampVideoSpecToModel({
        durations: next.durations,
        resolutions: next.resolutions,
        aspectRatios: next.aspectRatios,
        current: {
          duration: state.videoDuration,
          resolution: state.videoResolution,
          aspectRatio: state.aspectRatio,
        },
        fallbackAspectRatio: VIDEO_GENERATION.DEFAULT_ASPECT_RATIO,
      })
      if (patch.duration !== undefined) {
        dispatch({ type: 'SET_VIDEO_DURATION', payload: patch.duration })
      }
      if (patch.resolution !== undefined) {
        dispatch({ type: 'SET_VIDEO_RESOLUTION', payload: patch.resolution })
      }
      if (patch.aspectRatio !== undefined) {
        dispatch({
          type: 'SET_ASPECT_RATIO',
          payload: patch.aspectRatio as AspectRatio,
        })
      }
    },
    [
      dispatch,
      isVideoMode,
      state.aspectRatio,
      state.videoDuration,
      state.videoResolution,
    ],
  )

  const handleRemoveRunModel = useCallback(
    (optionId: string) => {
      for (const id of state.extraModelOptionIds) {
        if (!runModelIds.has(id)) {
          dispatch({ type: 'REMOVE_EXTRA_MODEL', payload: id })
        }
      }
      if (optionId !== state.selectedOptionId) {
        dispatch({ type: 'REMOVE_EXTRA_MODEL', payload: optionId })
        return
      }
      const next =
        runModels.find((model) => model.optionId !== optionId)?.optionId ?? null
      dispatch({ type: 'SET_OPTION_ID', payload: next })
      if (next) dispatch({ type: 'REMOVE_EXTRA_MODEL', payload: next })
    },
    [
      dispatch,
      state.selectedOptionId,
      state.extraModelOptionIds,
      runModels,
      runModelIds,
    ],
  )

  const isSameFamilyAsPrimary = useCallback(
    (option: SelectedModelOption) => {
      const primary = runModels[0]
      return (
        Boolean(primary) &&
        (getModelFamily(primary.modelId) ?? primary.modelId) ===
          (getModelFamily(option.modelId) ?? option.modelId)
      )
    },
    [runModels],
  )

  /**
   * 这一轮**只跑它**：额外模型全清；换到另一个系列时专属参数归零（上一个系列的
   * 旋钮对它没有意义）。多选里点到别的系列，与标签台的单选（owner 2026-09-27
   * 「NAI 这边只能单选」）都走这一条。
   */
  const handleReplaceRunModel = useCallback(
    (option: SelectedModelOption) => {
      for (const id of state.extraModelOptionIds) {
        dispatch({ type: 'REMOVE_EXTRA_MODEL', payload: id })
      }
      if (!isSameFamilyAsPrimary(option)) {
        dispatch({ type: 'RESET_ADVANCED_PARAMS' })
      }
      dispatch({ type: 'SET_OPTION_ID', payload: option.optionId })
    },
    [dispatch, isSameFamilyAsPrimary, state.extraModelOptionIds],
  )

  /**
   * 选择器里点一行 = **在出图名单里加它或去掉它**。
   *
   * ⚠ 去掉走的是 `handleRemoveRunModel` 而**不是** `TOGGLE_EXTRA_MODEL`：主模型
   * 那一格里的型号对 `TOGGLE_EXTRA_MODEL` 是个 no-op（reducer 有意不让主模型进
   * 额外名单），于是「名单上的第一条点不掉」——它在名单里、行也亮着，点一下却
   * 什么都不发生。判据只能是「它在不在这一轮的名单里」，⛔ 不是「它在哪个槽」。
   */
  const handleToggleRunModel = useCallback(
    (option: SelectedModelOption) => {
      if (runModelIds.has(option.optionId)) {
        handleRemoveRunModel(option.optionId)
        return
      }
      if (!isSameFamilyAsPrimary(option)) {
        handleReplaceRunModel(option)
        return
      }
      for (const id of state.extraModelOptionIds) {
        if (!runModelIds.has(id)) {
          dispatch({ type: 'REMOVE_EXTRA_MODEL', payload: id })
        }
      }
      dispatch({ type: 'TOGGLE_EXTRA_MODEL', payload: option.optionId })
    },
    [
      dispatch,
      handleRemoveRunModel,
      handleReplaceRunModel,
      isSameFamilyAsPrimary,
      runModelIds,
      state.extraModelOptionIds,
    ],
  )

  const buildImageInput = useCallback(
    (overrides?: {
      selectedModel?: SelectedModelOption
      compiledPrompt?: string
      negativePrompt?: string
    }) => {
      const imageModelForGeneration = overrides?.selectedModel ?? selectedModel

      if (imageModelForGeneration) {
        // 在场角色卡只送 id：正文前缀、卡图、角色负面都由服务端卡片总线编译
        // （进度表 35 ⑤），⛔ 这里不再拼。
        const characterCardIds = characters.activeCards.map((card) => card.id)
        // 弹层上挑了图的角色：只送挑的那几张（owner 09-27）；没挑的由卡片总线自动排。
        const characterImagePicks = Object.fromEntries(
          characterCardIds.flatMap((id) => {
            const picks = characters.imagePicks[id]
            return picks?.length ? [[id, [...picks]]] : []
          }),
        )
        // 切了造型的角色（角色④）；没有键 = 默认造型。
        const characterLookIds = Object.fromEntries(
          characterCardIds.flatMap((id) => {
            const lookId = characters.lookIds[id]
            return lookId ? [[id, lookId]] : []
          }),
        )
        const baseAdvancedParams = composeAdvancedParams(
          overrides?.negativePrompt,
        )
        return {
          modelId: imageModelForGeneration.modelId,
          apiKeyId: imageModelForGeneration.keyId,
          freePrompt: overrides?.compiledPrompt ?? composePrompt(state.prompt),
          aspectRatio: state.aspectRatio,
          projectId: projects.activeProjectId ?? undefined,
          referenceImages:
            imageUpload.referenceImages.length > 0
              ? imageUpload.referenceImages
              : undefined,
          advancedParams: baseAdvancedParams,
          recipeUsage: state.recipeUsage ?? undefined,
          characterCardIds:
            characterCardIds.length > 0 ? characterCardIds : undefined,
          ...(Object.keys(characterImagePicks).length
            ? { characterImagePicks }
            : {}),
          ...(Object.keys(characterLookIds).length ? { characterLookIds } : {}),
        }
      }
      return null
    },
    [
      state.prompt,
      state.recipeUsage,
      state.aspectRatio,
      composePrompt,
      composeAdvancedParams,
      selectedModel,
      projects.activeProjectId,
      imageUpload.referenceImages,
      characters.activeCards,
      characters.imagePicks,
      characters.lookIds,
    ],
  )

  const executeGenerate = useCallback(
    async (operatorResultOwner?: StudioOperatorResultOwner) => {
      if (!canGenerate) return
      /**
       * ⭐ 助手给这一枪起的名字（切片 Y）——**取走即消费**：留着它，用户下一次
       * 自己按生成的那一枪会顶着助手上一轮起的名字，而那一张与那个名字毫无关系。
       * ⚠ 取在**提交这一跳**而不是 `buildImageInput` 里：那颗函数还被成本预览与
       *   快照读取调用，在那里取走等于「看一眼预览就把名字吃掉了」。
       */
      const displayLabel = takeOperatorGenerationLabel() ?? undefined
      if (isVideoMode && selectedModel) {
        const video = buildVideoInput()
        if (!video) return
        await generate({
          mode: 'video',
          operatorResultOwner,
          video: displayLabel ? { ...video, displayLabel } : video,
        })
        return
      }
      const image = buildImageInput()
      if (!image) return
      await generate({
        mode: 'image',
        operatorResultOwner,
        image: displayLabel ? { ...image, displayLabel } : image,
        variantCount: state.imageBatchCount,
        // 标签台写出来的是**统一串**，发出去之前按各模型的 provider 翻译
        // （D10 ⑤）。⚠ 自然语言台不能走这一支：用户写的
        // `a girl: 1.2 meters tall` 翻一遍会被改写成权重。
        promptDialect: state.promptDialect,
        // 只有一条时不送名单 —— 让它走原来的单模型路径，请求逐字节不变。
        compareModels:
          runModels.length > 1
            ? runModels.map((o) => ({ modelId: o.modelId, apiKeyId: o.keyId }))
            : undefined,
      })
    },
    [
      canGenerate,
      isVideoMode,
      selectedModel,
      state.prompt,
      state.promptDialect,
      state.imageBatchCount,
      runModels,
      buildImageInput,
      buildVideoInput,
      generate,
    ],
  )

  /**
   * 挡住生成的那一条原因（`canGenerate` 为假时必有一条）。
   *
   * 消费者有三个：点击时的 toast、桌面参数栏生成按钮上的文案、移动端方形键的
   * `aria-label`。各写一串 if/else 必然漂。
   */
  const blockedReason = useMemo((): StudioBlockedReason | null => {
    // ⚠ 队列闸排在 `canGenerate` 之前：表单本身完全合法，挡住它的是「已经有 4 条在跑」。
    if (isVideoMode && !canQueueMoreVideo) {
      return {
        message: tPromptArea('blocked.videoQueueFull', {
          max: PLATFORM_GENERATION_GUARD.MAX_ACTIVE_JOBS_PER_USER,
        }),
      }
    }
    if (canGenerate) return null
    if (channelGate.blocked) {
      return { message: tPicker('pickChannel'), action: 'pickChannel' }
    }
    if (hasUnavailableMention) {
      return {
        message: tPromptArea('referenceMention.invalid'),
        focusPrompt: 'now',
      }
    }
    if (!selectedModel?.modelId) {
      return { message: tPromptArea('blocked.modelRequired') }
    }
    if (!(isVideoMode ? trimmedPrompt : hasPromptForImage)) {
      return {
        message: tPromptArea('blocked.promptRequired'),
        focusPrompt: 'now',
      }
    }
    if (isImagePromptOverLimit && imagePromptMaxChars !== undefined) {
      return {
        message: tPromptArea('blocked.promptTooLong', {
          max: imagePromptMaxChars,
        }),
        focusPrompt: 'now',
      }
    }
    if (novelAiTextProblem) {
      return {
        message:
          novelAiTextProblem.kind === 'latinOnly'
            ? tPromptArea('blocked.novelAiTextLatinOnly')
            : tPromptArea('blocked.novelAiTextTooLong', {
                max: novelAiTextProblem.max,
              }),
      }
    }
    if (modelRequiresRef && !hasRefImage) {
      return {
        message: tPromptArea('blocked.referenceRequired'),
        focusPrompt: 'nextFrame',
      }
    }
    if (modelRejectsRefImages) {
      return { message: tPromptArea('blocked.referenceUnsupported') }
    }
    if (videoAudioNeedsVisual) {
      return {
        message: tPromptArea('blocked.videoAudioNeedsVisual'),
        focusPrompt: 'nextFrame',
      }
    }
    return null
  }, [
    canGenerate,
    canQueueMoreVideo,
    selectedModel?.modelId,
    modelRequiresRef,
    hasRefImage,
    modelRejectsRefImages,
    hasUnavailableMention,
    videoAudioNeedsVisual,
    isImagePromptOverLimit,
    imagePromptMaxChars,
    novelAiTextProblem,
    trimmedPrompt,
    hasPromptForImage,
    isVideoMode,
    tPromptArea,
    channelGate.blocked,
    tPicker,
  ])

  const handleGenerate = useCallback(
    async (options?: {
      quietBlocked?: boolean
      operatorResultOwner?: StudioOperatorResultOwner
    }) => {
      if (options?.operatorResultOwner) {
        const current = getOperatorState()
        if (!matchesOperatorResultOwner(options.operatorResultOwner, current))
          return
      }
      if (isGenerating) return
      if (blockedReason) {
        // Krea-style: button stays clickable; click surfaces the missing piece
        // instead of silently doing nothing.
        // ⚠ `quietBlocked`：宿主自己把缺什么写在键旁边（底部输入框那行灰字，
        //   owner 2026-09-26）时不再弹 toast —— 同一句话不许一屏两遍。
        //   `options` 可能是冒泡上来的事件对象（onSubmit={handleGenerate}），
        //   所以只认显式的 `true`。
        if (options?.quietBlocked !== true) toast.info(blockedReason.message)
        // 缺的是渠道就直接把选择器打开并定位到那一行 —— ⛔ 不让他自己去找
        // （owner D2 Q1：「点了打开这行的渠道列表」）。
        if (blockedReason.action === 'pickChannel') channelGate.requestPick()
        if (blockedReason.focusPrompt === 'now') {
          focusStudioPrompt()
        } else if (blockedReason.focusPrompt === 'nextFrame') {
          requestAnimationFrame(() => {
            focusStudioPrompt()
          })
        }
        return
      }
      await executeGenerate(options?.operatorResultOwner)
    },
    [blockedReason, isGenerating, executeGenerate, channelGate],
  )

  /**
   * `REQUEST_GENERATE` 的执行端（「保留 / 改变」面板、助手的出图走这条路）。
   * ⚠ 见文件头：同一时刻只允许一个宿主调本 hook，否则一次请求发两遍。
   */
  const handledGenerateRequestRef = useRef(state.generateRequestId)
  useEffect(() => {
    if (state.generateRequestId === handledGenerateRequestRef.current) {
      return
    }

    handledGenerateRequestRef.current = state.generateRequestId
    void handleGenerate({ operatorResultOwner: state.generateRequestOwner })
  }, [state.generateRequestId, state.generateRequestOwner, handleGenerate])

  return {
    // 模型
    selectedModel,
    modelOptions,
    runModels,
    runModelIds,
    filterVideoModelOption,
    filterModelByDialect,
    handleSelectSingleModel,
    handleReplaceRunModel,
    handleToggleRunModel,
    handleRemoveRunModel,
    // 模态
    isImageMode,
    isVideoMode,
    // 闸门
    canGenerate,
    blockedReason,
    handleGenerate,
    isGenerating,
    elapsedSeconds,
    // 字数
    imagePromptLength,
    imagePromptMaxChars,
    isImagePromptOverLimit,
    // 报价
    videoCostBasis,
  }
}
