'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import type { AspectRatio } from '@/constants/config'
import { adapterHasCapability } from '@/constants/llm-capability'
import type { ImageBatchCount } from '@/constants/studio'
import { appendPromptFragments } from '@/lib/prompt-text-append'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import {
  useStudioData,
  useStudioForm,
  useStudioGen,
} from '@/contexts/studio-context'
import { useAudioModelOptions } from '@/hooks/use-audio-model-options'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useLoraCandidateConfirm } from '@/hooks/use-lora-candidate-confirm'
import { useStudioAssistantReference } from '@/hooks/use-studio-assistant-reference'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import type {
  ActiveRun,
  AdvancedParams,
  AssistantWorkbenchRun,
  AssistantWorkbenchState,
} from '@/types'
import type { AssistantWriteback } from '@/types/assistant-writeback'

/**
 * 把内存里的 `ActiveRun` 压成给助手看的批次元数据。
 *
 * ⚠ **只放这一批真正确定的事实**。该批实际用的生成参数在 `snapshot` 里，而列表
 * 接口的 select 根本不返回它 —— 表单上那些值是**当前实时值**（用户出图后拖一下
 * 滑杆就变），把它们说成「这批用的参数」就是喂谎。所以参数只出现在 `output`
 * 并明确标为当前表单值，不进这里。
 *
 * ⚠ 缩略图 URL 一律不带：每条 ~120 字符，8 张就吃掉 ~1000，而纯文本模型根本看不了
 * 图。要看图走附件引用那条路。
 */
function toWorkbenchRun(run: ActiveRun): AssistantWorkbenchRun {
  const byModel = new Map<string, number>()
  let succeeded = 0
  let failed = 0
  for (const item of run.items) {
    byModel.set(item.modelId, (byModel.get(item.modelId) ?? 0) + 1)
    if (item.status === 'completed') succeeded += 1
    if (item.status === 'failed') failed += 1
  }
  return {
    mode: run.mode,
    total: run.items.length,
    succeeded,
    failed,
    byModel: [...byModel.entries()].map(([model, count]) => ({ model, count })),
    prompt: run.prompt,
    hasSelection: run.selectedItemId !== null,
  }
}

/**
 * Shared prop assembly for the two PromptAssistantPanel hosts: the desktop
 * assistant dock (StudioAssistantDock) and the mobile drawer trigger
 * (StudioEnhanceButton). Keeps model resolution, LLM key filtering, and the
 * prompt write-back callbacks in one place so the hosts can't drift.
 */
export function useStudioAssistantPanelInputs() {
  const { state, dispatch } = useStudioForm()
  const { imageUpload, styles } = useStudioData()
  const { activeRun } = useStudioGen()
  // 当前模态对应的产出类型 —— 与 `StudioCanvas` 的 `expectedOutputType` 同一套
  // 映射（`GenerationRecord.outputType` / `ActiveRun.outputType` 的取值）。
  const expectedRunOutputType =
    state.outputType === 'video'
      ? 'VIDEO'
      : state.outputType === 'audio'
        ? 'AUDIO'
        : 'IMAGE'
  const { selectedModel: imageSelectedModel, modelOptions: imageModelOptions } =
    useImageModelOptions()
  const { selectedModel: videoSelectedModel, modelOptions: videoModelOptions } =
    useVideoModelOptions(state.selectedOptionId ?? '')
  const { selectedModel: audioSelectedModel } = useAudioModelOptions()
  const { keys: apiKeys } = useApiKeysContext()
  // §3.0b 第 4 条：「点生成图问助手」注入的附件。**放这里是因为这个 hook 就是
  // 「两个宿主的面板 props 装配处」** —— 桌面 dock 和移动端抽屉各自去读一次
  // 模块 store，只会各自漏一次；装配在这里，两个宿主同时拿到同一份。
  const { injectedReference, clearReference } = useStudioAssistantReference()

  const llmApiKeys = apiKeys
    .filter((k) => k.isActive && adapterHasCapability(k.adapterType, 'enhance'))
    .map((k) => ({ id: k.id, label: k.label || k.adapterType }))

  const selectedStyleCard = styles.activeCard
  const selectedModel =
    state.outputType === 'audio'
      ? audioSelectedModel
      : state.outputType === 'video'
        ? videoSelectedModel
        : imageSelectedModel
  const modelId =
    state.workflowMode === 'quick' && selectedModel
      ? selectedModel.modelId
      : (selectedStyleCard?.modelId ?? undefined)

  /**
   * `[[setup]]` 选模型提案的取值范围 —— **只放用户真能跑的**。
   *
   * 判据 `keyId || providerKeyId`：前者是这个模型自己绑了 key，后者是该 provider
   * 有 active key 因而今天就能跑（见 `withProviderKeyCoverage`）。两个都没有的
   * 模型推荐了也只是把人弹去配置页，那不是帮忙。
   *
   * ⚠ 音频域不给：音频没有 `[[setup]]` 的消费面（张数是图片概念，模型选择在
   * 音频域和音色绑在一起），列出来只会让助手提一个点不动的建议。
   */
  // ⚠ 必须 useMemo：音频那一支返回的是**字面量空数组**，每次 render 都是新引用，
  // 下面 `onUseModel` / `modelNoteFor` 的 useCallback 会跟着每帧重建。
  const modelCatalog = useMemo(
    () =>
      state.outputType === 'video'
        ? videoModelOptions
        : state.outputType === 'image'
          ? imageModelOptions
          : [],
    [state.outputType, videoModelOptions, imageModelOptions],
  )
  // ⚠ 按 modelId 去重：同一个模型可以有多条**路由**（workspace 内置 + 用户自己
  // 绑的 key），`modelOptions` 里就是多行。助手要选的是模型不是路由，不去重会
  // 让目录里同一个名字出现两遍——模型会以为它们是不同的东西。
  const availableModels = [
    ...new Map(
      modelCatalog
        .filter((option) => option.keyId || option.providerKeyId)
        .map((option) => [
          option.modelId,
          { id: option.modelId, label: option.displayLabel ?? option.modelId },
        ]),
    ).values(),
  ]

  /**
   * 这个模态到底有没有负面提示词输入框。
   *
   * ⚠ **一个判据，两处消费**（状态块 + 写回声明）—— 分开写必然分叉，而分叉的
   * 表现就是 2026-08-22 owner 撞到的那一幕：写回如实说「这个工作台没有这一项」，
   * 状态块却仍然告诉模型「Negative prompt: (empty)」，于是它提了一个写不进去的
   * 负面提示词，用户看到一行被当场否掉的建议。
   *
   * ⭐ **同日更新**：图片模态当时判「没有」是对的（那条链上确实没有输入口），但
   * 正确的修法不是让助手闭嘴 —— 生成管线一直在读 `advancedParams.negativePrompt`，
   * 缺的只是门。门已在 `StudioPromptArea` 的参数栏补上（折叠行），所以图片模态
   * 现在**有**这个字段。
   *
   * ⚠ 排除的是 **audio**：它既没有输入控件（`StudioAudioParams` 零处），载荷里
   * 也不带这个键（audio 分支零处）—— 那才是真正「没这回事」的一档。
   */
  const hasNegativePromptField = state.outputType !== 'audio'

  // §3.0b：助手看不见左边工作台 —— 这里把它看得见的事实打包发出去。
  // ⚠ 这个 hook 是**唯一改一处、桌面 dock 和移动端两个宿主同时生效**的点。
  const workbenchState: AssistantWorkbenchState = {
    prompt: state.prompt,
    // 字段缺席 = 这个工作台没有负面框（见 `hasNegativePromptField`）。
    // ⛔ 别回落成空串：那在状态块里会打成 `(empty)`，等于说「有槽，空着」。
    ...(hasNegativePromptField
      ? { negativePrompt: state.advancedParams.negativePrompt }
      : {}),
    // 「没选模型」这个状态本身是信息 —— 以前 modelId:undefined 同时代表「没选」
    // 和「选了但该模型没 enhance hint」，助手因此说不出「你还没选模型」。
    modelSelected: state.selectedOptionId !== null,
    // displayLabel 是可选的，回落到 modelId —— 助手要的是「用的是哪个」，
    // 有个能指认的名字就行，没必要为此再查一次模型目录。
    modelLabel:
      selectedModel?.displayLabel ?? selectedModel?.modelId ?? modelId,
    extraModelCount: state.extraModelOptionIds.length,
    output: {
      aspectRatio: state.aspectRatio,
      resolution: state.advancedParams.resolution,
      batchCount: state.imageBatchCount,
      ...(state.outputType === 'video'
        ? {
            durationSeconds: state.videoDuration,
            videoResolution: state.videoResolution ?? undefined,
          }
        : {}),
    },
    referenceImageCount: imageUpload.referenceImages.length,
    // ⚠ 与 `StudioCanvas` 同一道守卫：`activeRun` 一槽三模态共用（三个模态共享
    // 一个 `StudioProvider`，切路由不 remount），不按模态过滤就会把上一模态的
    // 批次说给助手听 —— 在语音工作台问它，它会以为你刚生成了 4 张图，然后据此
    // 给建议。渲染层那次串台是看得见的，这一处是**看不见的**，更难归因。
    ...(activeRun && activeRun.outputType === expectedRunOutputType
      ? { lastRun: toWorkbenchRun(activeRun) }
      : {}),
    ...(availableModels.length > 0 ? { availableModels } : {}),
  }

  const open = state.panels.enhance

  /**
   * 一次注入只属于一次打开：面板关掉就把待注入的图丢掉。
   *
   * ⚠ 这条只在**移动端**才看得出必要性 —— 那个宿主是抽屉，关掉整个卸载面板，
   * 重开时面板内部的 `lastInjectedToken` 归零，留在 store 里的旧引用会被当成
   * 新注入再挂一次（用户没点，附件却在那儿）。桌面 dock 的面板常驻，只验桌面
   * 永远看不到它。
   *
   * ⚠ 顺序安全：「问助手」是在同一个事件里先 `injectReference` 再 `OPEN_PANEL`，
   * React 合批后这个 effect 只会看到 `open === true`，不会把刚注入的清掉。
   */
  useEffect(() => {
    if (!open) clearReference()
  }, [clearReference, open])

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      dispatch({
        type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
        payload: 'enhance',
      })
    },
    [dispatch],
  )

  /**
   * 撤销快照（切片 S3 的快照契约）。
   *
   * ⚠ **只存「点应用那一刻的旧值」，不存「已应用」这个状态**——已应用是
   * `当前值 === 建议值` 算出来的（见 `AssistantWritebackField`）。
   *
   * ⚠ 逐字段的粒度是**定死的**，定错了撤销比不撤销更糟：
   *   negative 必须存**整个 advancedParams 对象**，因为 SET_ADVANCED_PARAMS
   *   是整体替换——只存 negativePrompt 一个键，撤销时会把用户调好的
   *   seed / steps / resolution 全部清空。
   */
  const [snapshots, setSnapshots] = useState<{
    prompt?: string
    advancedParams?: AdvancedParams
    aspectRatio?: AspectRatio
    optionId?: string | null
    batchCount?: ImageBatchCount
  }>({})

  const onUsePrompt = useCallback(
    (text: string) => {
      setSnapshots((prev) => ({ ...prev, prompt: state.prompt }))
      dispatch({ type: 'SET_PROMPT', payload: text })
    },
    [dispatch, state.prompt],
  )

  /**
   * 追加（owner 2026-08-20 拍板第 4 条：翻案请回来）。
   *
   * ⚠ 它 08-18 被砍过一次，今天带着**新语义**回来：撤销的前提是「值没被人
   * 动过」，一旦用户手改就自动失效——那时「追加」是唯一不丢用户已写内容的
   * 路。所以它不是「再来一份」，是「不想被覆盖时的另一条路」。
   *
   * 复用 `appendPromptFragments`（LoRA 线用了很久的那个），它会去重、
   * 规范逗号——不要在这里手写字符串拼接。
   */
  const onAppendPrompt = useCallback(
    (text: string) => {
      setSnapshots((prev) => ({ ...prev, prompt: state.prompt }))
      dispatch({
        type: 'SET_PROMPT',
        payload: appendPromptFragments(state.prompt, text),
      })
    },
    [dispatch, state.prompt],
  )

  /**
   * §3.0b：`[[prompt]]` 块的 `negative` 落进负面框，**不是**正面框。
   *
   * ⚠ 覆盖而不是追加。负面提示词是模型针对这一版正面词配套给的一整套，
   * 和上一版的负面词拼在一起会互相打架（「no blur」+「motion blur」）。
   * 这与 LoRA 结果卡 `onUseNegativePrompt` 的既有行为一致，故意共命运。
   *
   * ⚠ 只动 `negativePrompt` 一个键，其余 advancedParams 原样带过去 ——
   * SET_ADVANCED_PARAMS 是整体替换，漏带就等于把用户调好的参数清空了。
   */
  const fillNegativePrompt = useCallback(
    (text: string) => {
      setSnapshots((prev) => ({
        ...prev,
        advancedParams: state.advancedParams,
      }))
      dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: { ...state.advancedParams, negativePrompt: text },
      })
    },
    [dispatch, state.advancedParams],
  )

  /**
   * 宽高比落进规格表单。参数已经是 `AspectRatio` —— 面板那边用 `isAspectRatio`
   * 收窄过了，不合法的比例根本不会让按钮出现，所以这里不用再防一道。
   */
  const onUseAspectRatio = useCallback(
    (aspectRatio: AspectRatio) => {
      setSnapshots((prev) => ({ ...prev, aspectRatio: state.aspectRatio }))
      dispatch({ type: 'SET_ASPECT_RATIO', payload: aspectRatio })
    },
    [dispatch, state.aspectRatio],
  )

  /**
   * ⚠ **助手给的是 modelId，表单存的是 optionId**（optionId 编了路由：
   * `workspace:<id>` / 用户绑的 key 那条）。让助手去理解路由既没必要也会出错——
   * 它该关心「用哪个模型」，路由由这里挑：`modelOptions` 已被
   * `mergeModelOptionsWithPreferredSavedRoutes` 按偏好排过序，**取第一条命中的
   * 就是既有选路逻辑的答案**，不在动作条层另写一套。
   *
   * 收窄也在这里：目录里查不到就直接 return，面板那边靠 `resolveModelLabel`
   * 返回 null 提前不渲染这一行，两道是同一个判据的两侧。
   */
  const onUseModel = useCallback(
    (modelId: string) => {
      const optionId = modelCatalog.find(
        (option) => option.modelId === modelId,
      )?.optionId
      if (!optionId) return
      setSnapshots((prev) => ({ ...prev, optionId: state.selectedOptionId }))
      dispatch({ type: 'SET_OPTION_ID', payload: optionId })
    },
    [dispatch, modelCatalog, state.selectedOptionId],
  )

  /**
   * owner 拍板第 3 条：换模型撞上多模型对比名单要**提示**。
   *
   * 事实：主模型只改 `selectedOptionId`，而运行名单是主模型 + `extraModelOptionIds`
   * 去重后的结果——目标模型若已经在对比名单里，这一轮实际跑的模型会**静默少一条**。
   * 这是既有 bug，本轮不修它，只在应用前把话说出来。
   */
  const modelNoteFor = useCallback(
    (modelId: string): string | undefined => {
      const optionId = modelCatalog.find(
        (option) => option.modelId === modelId,
      )?.optionId
      if (!optionId) return undefined
      return state.extraModelOptionIds.includes(optionId)
        ? 'modelAlreadyCompared'
        : undefined
    },
    [modelCatalog, state.extraModelOptionIds],
  )

  /**
   * 张数。**收窄查的是 `IMAGE_BATCH_COUNTS` 本身**，不是抄一份 `[1,2,4]` ——
   * 那三个数还连着 `MAX_ACTIVE_JOBS_PER_USER`，抄下来就会各自漂移
   * （见 `constants/studio.ts` 里那段注释）。
   *
   * ⚠ 改张数不花钱：花钱的是「生成」那一下，而生成按钮上方常驻预估费用，
   * 它会跟着张数变。既有确认门没被绕过。
   */
  const onUseBatchCount = useCallback(
    (batchCount: ImageBatchCount) => {
      setSnapshots((prev) => ({ ...prev, batchCount: state.imageBatchCount }))
      dispatch({ type: 'SET_IMAGE_BATCH_COUNT', payload: batchCount })
    },
    [dispatch, state.imageBatchCount],
  )

  /**
   * 写回适配器（方向 A）。**缺席即「这一档结构性没有」**，见
   * `AssistantWriteback` 的类型说明与四档宿主矩阵。
   *
   * ⚠ 三处 `isApplied` 全是**当场比值**，不看任何记下来的状态——这是切片 S3
   * 的支点：用户手改表单后它自动变 false，撤销随之收起，绝不会拿旧快照去
   * 抹掉用户后写的内容。
   */
  const writeback: AssistantWriteback = {
    prompt: {
      current: state.prompt || undefined,
      apply: onUsePrompt,
      isApplied: (value) => state.prompt === value,
      ...(snapshots.prompt !== undefined && state.prompt !== snapshots.prompt
        ? {
            undo: () => {
              dispatch({ type: 'SET_PROMPT', payload: snapshots.prompt ?? '' })
              setSnapshots((prev) => ({ ...prev, prompt: undefined }))
            },
          }
        : {}),
    },
    appendPrompt: onAppendPrompt,
    negative: !hasNegativePromptField
      ? // 缺席原因第 ① 类：宿主没这个能力。说出来而不是静默消失——
        // 但 `apply` 仍要给一个（类型上必填），面板见 unavailableReason 就不调它。
        {
          apply: () => {},
          isApplied: () => false,
          unavailableReason: 'unavailableHere',
        }
      : {
          current: state.advancedParams.negativePrompt || undefined,
          apply: fillNegativePrompt,
          isApplied: (value) => state.advancedParams.negativePrompt === value,
          ...(snapshots.advancedParams
            ? {
                undo: () => {
                  dispatch({
                    type: 'SET_ADVANCED_PARAMS',
                    // ⚠ 整个对象回滚，不是只回 negativePrompt 一个键。
                    payload: snapshots.advancedParams as AdvancedParams,
                  })
                  setSnapshots((prev) => ({
                    ...prev,
                    advancedParams: undefined,
                  }))
                },
              }
            : {}),
        },
    aspectRatio: {
      current: state.aspectRatio,
      apply: onUseAspectRatio,
      isApplied: (value) => state.aspectRatio === value,
      ...(snapshots.aspectRatio && state.aspectRatio !== snapshots.aspectRatio
        ? {
            undo: () => {
              dispatch({
                type: 'SET_ASPECT_RATIO',
                payload: snapshots.aspectRatio as AspectRatio,
              })
              setSnapshots((prev) => ({ ...prev, aspectRatio: undefined }))
            },
          }
        : {}),
    },
    // 音频域 modelCatalog 是空数组 → 整项不给（结构性缺席，且不解释：
    // 音频的模型选择和音色绑在一起，说「这里没有模型行」只会更迷惑）。
    ...(modelCatalog.length > 0
      ? {
          model: {
            current: selectedModel?.displayLabel ?? selectedModel?.modelId,
            apply: onUseModel,
            isApplied: (modelId: string) => selectedModel?.modelId === modelId,
            noteFor: modelNoteFor,
            ...(snapshots.optionId !== undefined &&
            state.selectedOptionId !== snapshots.optionId
              ? {
                  undo: () => {
                    dispatch({
                      type: 'SET_OPTION_ID',
                      payload: snapshots.optionId ?? null,
                    })
                    setSnapshots((prev) => ({ ...prev, optionId: undefined }))
                  },
                }
              : {}),
          },
          resolveModelLabel: (modelId: string) =>
            modelCatalog.some((option) => option.modelId === modelId)
              ? modelId
              : null,
        }
      : {}),
    batchCount: {
      current: String(state.imageBatchCount),
      apply: onUseBatchCount,
      isApplied: (value) => state.imageBatchCount === value,
      ...(snapshots.batchCount && state.imageBatchCount !== snapshots.batchCount
        ? {
            undo: () => {
              dispatch({
                type: 'SET_IMAGE_BATCH_COUNT',
                payload: snapshots.batchCount as ImageBatchCount,
              })
              setSnapshots((prev) => ({ ...prev, batchCount: undefined }))
            },
          }
        : {}),
    },
  }

  /**
   * LoRA 一次确认链（任务包 §5）在**工作台这一档**的形态：导入 + 触发词，**没有
   * 挂载**。
   *
   * ⚠ 不是「少传了一个回调」：`useActiveLoraStack` 的 Provider 只包
   * `/studio/lora`（见 studio/lora/layout.tsx），在这里调它会直接抛。所以
   * `mount` 结构性缺席，卡上据此把动作换成「导入并填入触发词」+ 一条去 LoRA
   * 工作台挂载的引导 —— ⛔ 而不是留一个点了没反应的挂载按钮。
   *
   * 触发词落点复用 `onAppendPrompt`（`appendPromptFragments` 去重那条既有路径）。
   */
  const loraConfirm = useLoraCandidateConfirm({
    applyTriggerWords: onAppendPrompt,
  })

  return {
    open,
    setOpen,
    currentPrompt: state.prompt,
    modelId,
    assistantDomain:
      state.outputType === 'video' ? ('video' as const) : ('image' as const),
    llmApiKeys,
    referenceImageData: imageUpload.referenceImages[0],
    injectedReference,
    workbenchState,
    writeback,
    loraConfirm,
  }
}
