'use client'

import { flushSync } from 'react-dom'
import { useTranslations } from 'next-intl'
import { StudioOperatorCheckpointSchema } from '@/types/studio-operator-checkpoint'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { getModelMessageKey, isBuiltInModel } from '@/constants/models'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  useStudioData,
  useStudioForm,
  useStudioGenOptional,
} from '@/contexts/studio-context'
import type { StudioOperatorHost } from '@/contexts/studio-operator-host'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { useOperatorUserUrlMount } from '@/hooks/use-operator-user-url-mount'
import { setOperatorGenerationLabel } from '@/lib/studio-operator-label'
import {
  setOperatorPrimed,
  setOperatorReviewState,
} from '@/hooks/use-studio-operator-store'
import { resolveGenerationDisplayName } from '@/lib/generation-name'
import { revertAssistantAssetWriteAPI } from '@/lib/api-client/assistant-operator'
import type { StudioOperatorApplyContext } from '@/lib/studio-operator-apply'
import {
  buildImageGenerationControls,
  buildImageOperatorSnapshot,
  buildVideoGenerationControls,
  buildVideoOperatorSnapshot,
} from '@/lib/studio-operator-snapshot'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'
import type {
  StudioOperatorResultItem,
  StudioOperatorResultRun,
} from '@/types/studio-assistant-operator'

/**
 * ⚠ 摘除按**索引**（`removeReferenceImage` 的契约），所以要先按 URL 找位。
 * ⚠ 参数写成结构类型而不是 `ReturnType<typeof useImageUpload>`：这个函数只用到
 * 两样东西，把整个上传 API 拖进签名只会让它看起来依赖更多。
 */
function removeReferenceByUrl(
  imageUpload: {
    referenceEntries: readonly { url: string }[]
    removeReferenceImage(index: number): void
  },
  url: string,
): void {
  const index = imageUpload.referenceEntries.findIndex(
    (entry) => entry.url === url,
  )
  if (index >= 0) imageUpload.removeReferenceImage(index)
}

export function useStudioWorkbenchOperatorHost(): StudioOperatorHost {
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  /**
   * ⚠ 两个池子**都要订阅**（hook 不能有条件地调）。选哪一个由域决定 —— 而这正是
   * P4-A 修掉的一个真缺陷：此前只有图片池，视频模态下 `availableModels` 端上去的
   * 是一串图片模型，`set_model` 落地那一跳查不到 optionId，于是静默什么都不做。
   */
  const imageModels = useImageModelOptions()
  const videoModels = useVideoModelOptions(state.selectedOptionId ?? '')
  /** 拍板 22 的落地那一跳 —— 两个宿主共用的那一份。 */
  const userUrl = useOperatorUserUrlMount(imageUpload)

  const latest = useRef({ state, imageUpload, imageModels, videoModels })
  // ⚠ 同步写在 effect 里（本仓 latest-ref 的既有写法）：render 阶段改 ref 会被
  //   `react-hooks/refs` 拦下来。事件循环两次 SSE 之间隔着一次网络宏任务，
  //   effect 早就冲干净了。
  useEffect(() => {
    latest.current = { state, imageUpload, imageModels, videoModels }
  }, [state, imageUpload, imageModels, videoModels])

  const domain =
    state.outputType === 'video'
      ? ASSISTANT_PROTOCOL_DOMAIN_IDS.video
      : ASSISTANT_PROTOCOL_DOMAIN_IDS.image

  /**
   * 当前表单快照 —— **按域分派**（P4-A）：形状由两个纯函数各自负责，这里只把
   * 「此刻的表单」喂进去。⛔ 别在这里补一个「两个域都给一份」的合并 —— 快照的
   * 每一节缺席都是一条闸（拍板 19）。
   */
  const buildSnapshot = useCallback((): AssistantOperatorSnapshot => {
    const current = latest.current.state
    /**
     * ⚠ 参考图槽位数由 `StudioDockPanelArea` 的那条 effect 写进来（全仓唯一一处
     * `setMaxImages`）。它没跑到之前是 `Infinity` —— 那不是一个能写进 schema 的数，
     * 回落到载荷护栏上限。
     */
    const references = {
      items: latest.current.imageUpload.referenceEntries,
      limit: Number.isFinite(latest.current.imageUpload.maxImages)
        ? latest.current.imageUpload.maxImages
        : ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences,
    }
    const form = {
      prompt: current.prompt,
      negativePrompt: current.advancedParams.negativePrompt,
      aspectRatio: current.aspectRatio,
      imageResolution: current.advancedParams.resolution ?? null,
      imageQuality: current.advancedParams.quality,
      imagePreview: current.advancedParams.preview,
      imageBackground: current.advancedParams.background,
      imageBatchCount: current.imageBatchCount,
      // 专属 chip 行的现值（进度表 21）—— 整份端上去，键随模型变。
      advancedParams: current.advancedParams,
      videoDurationSeconds: current.videoDuration,
      videoResolution: current.videoResolution,
      videoAudioRefs: current.videoAudioRefs,
      // 具名帧槽 / 参考视频（第二期）—— 表单里那两处新状态原样端上去。
      videoFrameSlots: current.videoFrameSlots,
      videoReferenceVideos: current.videoReferenceVideos,
      // ⛔ 三态原样传，别 `?? false`（见词表 `setSound` 头注）。
      videoSoundEnabled: current.videoGenerateAudio,
    }

    if (domain === ASSISTANT_PROTOCOL_DOMAIN_IDS.video) {
      return buildVideoOperatorSnapshot({
        form,
        modelOptions: latest.current.videoModels.modelOptions,
        selectedModel: latest.current.videoModels.selectedModel,
        references,
        videoMode: current.videoMode,
      })
    }
    return buildImageOperatorSnapshot({
      form,
      modelOptions: latest.current.imageModels.modelOptions,
      selectedModel: latest.current.imageModels.selectedModel,
      references,
    })
  }, [domain])

  const checkpoints = useMemo<NonNullable<StudioOperatorHost['checkpoints']>>(
    () => ({
      capture: async () => {
        if (!(await userUrl.settle())) return null
        const current = latest.current.state
        if (current.workflowMode !== 'quick') return null
        const snapshot = StudioOperatorCheckpointSchema.safeParse({
          version: 1,
          domain: current.outputType,
          form: current,
          referenceImages: latest.current.imageUpload.referenceEntries.map(
            (entry) => entry.url,
          ),
        })
        return snapshot.success ? snapshot.data : null
      },
      restore: (checkpoint) => {
        const parsed = StudioOperatorCheckpointSchema.safeParse(checkpoint)
        if (
          !parsed.success ||
          parsed.data.domain !== latest.current.state.outputType
        )
          return false
        const saved = parsed.data
        const options =
          saved.domain === 'image'
            ? latest.current.imageModels.modelOptions
            : latest.current.videoModels.modelOptions
        const ids = [
          saved.form.selectedOptionId,
          ...saved.form.extraModelOptionIds,
        ].filter((id) => id !== null)
        if (ids.some((id) => !options.some((option) => option.optionId === id)))
          return false
        userUrl.cancelPending()
        flushSync(() => {
          latest.current.imageUpload.setReferenceImage(undefined)
          saved.referenceImages.forEach((url) =>
            latest.current.imageUpload.addReferenceImage(url),
          )
          dispatch({ type: 'RESTORE_OPERATOR_CHECKPOINT', payload: saved.form })
        })
        return true
      },
    }),
    [dispatch, userUrl],
  )

  const apply = useMemo<StudioOperatorApplyContext>(
    () => ({
      getState: () => latest.current.state,
      dispatch,
      /**
       * 助手给的那个 id → 表单存的 optionId。
       *
       * ⭐ **两条路，按当前模态分**（P4-A）：图片档给的是 `modelId`（`modelOptions`
       * 已按偏好排过序，取第一条命中的就是既有选路逻辑的答案）；视频档给的是
       * `optionId` 本身（型号 × 渠道成对，K-3）。⚠ 仍留一条按 `modelId` 的回落。
       */
      resolveOptionId: (modelId) => {
        if (latest.current.state.outputType === 'video') {
          const options = latest.current.videoModels.modelOptions
          return (
            options.find((option) => option.optionId === modelId)?.optionId ??
            options.find((option) => option.modelId === modelId)?.optionId ??
            null
          )
        }
        return (
          latest.current.imageModels.modelOptions.find(
            (option) => option.modelId === modelId,
          )?.optionId ?? null
        )
      },
      /**
       * 挂参考素材 —— **按槽分三条路**（第二期）。
       *
       * ⭐ 首尾帧走的是**具名槽**（`SET_VIDEO_FRAME_SLOT`）而不是参考图列表的
       * 0/1 下标：位置承载语义的老写法里「把第一张删掉」会让尾帧静默升级成首帧
       * （`studio-context` 里那段头注记的就是这次漂移）。
       * ⚠ 默认档（`reference` / 缺席）保持原样走 `imageUpload` —— 图片域、多图参考
       * 档、全能参考档的图都在那条轨上。
       */
      addReference: (url, slot) => {
        if (slot === 'first' || slot === 'last') {
          dispatch({ type: 'SET_VIDEO_FRAME_SLOT', payload: { slot, url } })
          return
        }
        if (slot === 'video') {
          const current = latest.current.state.videoReferenceVideos
          if (current.includes(url)) return
          dispatch({
            type: 'SET_VIDEO_REFERENCE_VIDEOS',
            payload: [...current, url],
          })
          return
        }
        latest.current.imageUpload.addReferenceImage(url)
      },
      /** ⚠ 撤销读的是 `inverse.slot`，所以这里的分岔与上面**逐条对称**。 */
      removeReference: (url, slot) => {
        if (slot === 'first' || slot === 'last') {
          // ⛔ 清空那个槽，不是「删掉一个下标」——另一个槽一个字都不该动。
          dispatch({
            type: 'SET_VIDEO_FRAME_SLOT',
            payload: { slot, url: null },
          })
          return
        }
        if (slot === 'video') {
          const current = latest.current.state.videoReferenceVideos
          if (!current.includes(url)) return
          dispatch({
            type: 'SET_VIDEO_REFERENCE_VIDEOS',
            payload: current.filter((entry) => entry !== url),
          })
          return
        }
        removeReferenceByUrl(latest.current.imageUpload, url)
      },
      /**
       * 音频参考（P4-A，台账 A）—— 走的是**面板那条既有的写入**
       * （`SET_VIDEO_AUDIO_REFS` 整体替换），⛔ 不新开一条通道。
       */
      addAudioReference: ({ url, fileName, ownerName }) => {
        const refs = latest.current.state.videoAudioRefs
        if (refs.some((entry) => entry.url === url)) return
        dispatch({
          type: 'SET_VIDEO_AUDIO_REFS',
          payload: [
            ...refs,
            {
              id:
                globalThis.crypto?.randomUUID?.() ??
                `audio-${refs.length}-${url.slice(-12)}`,
              url,
              fileName,
              ...(ownerName ? { ownerName } : {}),
            },
          ],
        })
      },
      removeAudioReference: (url) => {
        const refs = latest.current.state.videoAudioRefs
        if (!refs.some((entry) => entry.url === url)) return
        dispatch({
          type: 'SET_VIDEO_AUDIO_REFS',
          payload: refs.filter((entry) => entry.url !== url),
        })
      },
      /** ⚠ 三态原样落（含 `null` = 回到「用户没设过」）。 */
      setSound: (enabled) =>
        dispatch({ type: 'SET_VIDEO_GENERATE_AUDIO', payload: enabled }),
      /**
       * 拍板 22 的落地那一跳 —— **客户端做，服务端碰不到 R2**（钱闸/结构闸不松）。
       * ⚠ P4-C 起两个宿主共用同一份实现（`use-operator-user-url-mount.ts`）：
       * 参考图卡两边本来就是同一个 `useImageUpload`，抄两份迟早说两句不一样的话。
       */
      mountUserUrl: userUrl.mountUserUrl,
      unmountUserUrl: userUrl.unmountUserUrl,
      setPrimed: setOperatorPrimed,
      /**
       * **扣扳机**（§6 花钱档，拍板 2 的新形态）—— 走的是**用户自己那颗生成键的
       * 同一条路**：`REQUEST_GENERATE` 的执行端是 `useStudioGenerateAction`
       * （`state.generateRequestId` 那条 effect），也就是「保留 / 改变」面板与音频
       * 反馈重试一直在走的那一跳。
       *
       * ⛔ **不在这里调 `studioGenerateAPI`**：那条路上的闸门（模型必选、提示词长度、
       * 参考图能力、视频队列上限）、请求组装、报价全在 `useStudioGenerateAction`
       * 里 —— 抄第二份必然与按钮说两句不一样的话，而那正是那个 hook 当初被抽出来
       * 的理由（两个生成按钮共用一份实现）。助手这一枪与人手点的那一枪因此**逐字
       * 相同**，连被挡住时弹的那句 toast 都一样。
       * ⚠ 载荷（模型 / 张数 / 规格）在服务端出帧时就是从**这份表单的快照**里取的，
       *   所以这里不必、也不该再拿它去覆盖一遍表单：卡上写的和发出去的本来就是
       *   同一份。真要改参数，前面那几步 `set_*` 已经改过了。
       * ⚠ 结果回灌不由这里做：生成结果照旧进 `useStudioGen` 的 `activeRun`，
       *   归属追踪（`lib/studio-operator-claim.ts`）认得出这一枪是助手备的。
       */
      triggerGeneration: () => dispatch({ type: 'REQUEST_GENERATE' }),
      /**
       * 助手给这一枪起的名字（切片 Y）—— 存进那只投递口，生成提交那一跳取走。
       * ⚠ ⛔ 不塞进表单：表单上没有「产物名」这一格，而且它属于**这一枪**
       *   而不是这份表单（用户下一次自己按生成时不该顶着它）。
       */
      setGenerationLabel: setOperatorGenerationLabel,
      /**
       * 助手标审核态（切片 Y）—— 直接落操作员 store（结果格与选择器都读那一份）。
       * ⚠ ⛔ 这里**不打 PATCH**：助手那一步的服务端落库由服务端自己做完了
       *   （`set_review_state` 是服务端工具），客户端再打一次就是同一件事两次写入。
       */
      setReviewState: setOperatorReviewState,
      /**
       * 撤销一条素材库写操作（v2 §10）—— 交出去的是 step 上那份 `inverse` 原样。
       *
       * ⚠ 与 `setReviewState` 那条**方向相反**：那一条的服务端落库在助手那一步
       * 就做完了，客户端只同步一下 store；这四条的撤销服务端没有任何触发点，
       * 所以撤销这一跳必须由客户端打一次（同 `deleteProjectRule` 的判据）。
       * ⚠ `void`：撤销是「交出去就不管」，`revertOperatorStep` 是同步纯函数。
       */
      revertAssetWrite: (input) => {
        void revertAssistantAssetWriteAPI(input)
      },
      /**
       * ⛔ **工作台没有 `lora`**：`LoraStackProvider` 只包 `/studio/lora`，这里
       * 结构性拿不到挂载栈。缺席是诚实 —— 实现成空函数才是那种「点了没反应、
       * 三绿」的失败。域工具表本来就不给工作台那三条 LoRA 工具。
       */
    }),
    [dispatch, userUrl],
  )

  /**
   * 开合挂在 `panels.enhance` 上 —— 与旧面板同一个槽，所以小屏抽屉那条路
   * （`StudioEnhanceButton`）不受影响，两份状态也不会漂。
   */
  const open = state.panels.enhance
  const setOpen = useCallback(
    (next: boolean) => {
      dispatch({
        type: next ? 'OPEN_PANEL' : 'CLOSE_PANEL',
        payload: 'enhance',
      })
    },
    [dispatch],
  )

  /**
   * 一行能选几张 = **工作台参考位上限**（拍板 21）。
   * ⚠ `maxImages` 在 `StudioDockPanelArea` 那条 effect 跑到之前是 `Infinity`
   * —— 与快照那边同一条兜底，回落到载荷护栏上限。
   */
  const referenceLimit = Number.isFinite(imageUpload.maxImages)
    ? imageUpload.maxImages
    : ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences

  /**
   * **这一批结果**（§2.11 结果行卡）—— 数据源是工作台本来就在跑的那条回流
   * （`activeRun`），⛔ 没有新轮询器：与 `use-studio-operator-critique.ts` 读的是
   * 同一处。此前这一段长在面板里（`useStudioGenOptional()`），搬到宿主上是因为
   * LoRA 装配台也要有结果行卡，而那条路由拿不到 `useStudioGen`。
   * ⚠ 只收**跑完且有地址**的那些：`pending` / `generating` 的格子画出来是一个
   *   永远转着的骨架，而这张卡的意义是「这一批出来了，挑一张说话」。
   */
  const activeRun = useStudioGenOptional()?.activeRun
  const results = useMemo<readonly StudioOperatorResultItem[]>(() => {
    const items = activeRun?.items ?? []
    return items.flatMap((item) => {
      const generation = item.generation
      if (item.status !== 'completed' || !generation?.url) return []
      return [
        {
          id: generation.id,
          url: generation.url,
          ...(generation.thumbnailUrl
            ? { thumbnailUrl: generation.thumbnailUrl }
            : {}),
          /**
           * ⭐ label = **产物名**（`图_012·银发少女立绘`，切片 N1）而不是提示词
           * 前 40 字：这条 label 会成为 chip 上、灯箱标题上和 `@` 选择器里显示的
           * 那串字，而用户要能**照着它打出来**指认这一张。
           */
          label: resolveGenerationDisplayName(generation),
          /**
           * ⭐ 角标与 `@` 指认认的是**真序号**（`Generation.seq`，切片 N1 收口）
           * —— 列表口读得到它（`generation.service.ts` 的 select 里有这一列）。
           * ⚠ 缺席就让它缺席：结果行卡因此不画角标，⛔ 不在这里编一个。
           */
          seq: generation.seq,
          outputType: generation.outputType,
        },
      ]
    })
  }, [activeRun])

  /**
   * **这一批的在飞读数**（v2 §6.3，commit #10）—— 结果卡的生成中态读它。
   *
   * ⭐ 与上面那份 `results` 同源同一条回流，只是**不过滤**：占位格数是「这一批
   * 一共几条」，而 `results` 只留跑完的那几条。两个数从同一个数组算出来，⛔ 别
   * 让结果卡去外面再问一次「这次要出几张」——那一份（表单的 `imageBatchCount`）
   * 在用户等图的这几十秒里随时会被改掉。
   * ⚠ `settled` 在这里判：`cancelled` 与 `failed` 同等对待（都是不会再变的终态，
   * 判据与 `isOperatorClaimSettled` 逐字同源）。
   */
  const resultRun = useMemo<StudioOperatorResultRun | undefined>(() => {
    const items = activeRun?.items
    if (!items || items.length === 0) return undefined
    return {
      total: items.length,
      completed: items.filter((item) => item.status === 'completed').length,
      failed: items.filter(
        (item) => item.status === 'failed' || item.status === 'cancelled',
      ).length,
      settled: items.every(
        (item) =>
          item.status === 'completed' ||
          item.status === 'failed' ||
          item.status === 'cancelled',
      ),
      items: results,
    }
  }, [activeRun, results])

  /**
   * 模型在**界面上叫什么**（2026-09-12 实测第 5 步：卡上写着 `gpt-image-2.5-flare`）。
   *
   * ⭐ 词表就是模型选择器读的那一张（`Models.<key>.label`），⛔ 不另抄一份：
   * 卡上写的名字与工作台上那颗选择器写的必须是同一个词。
   * ⚠ 自定义模型（非内置）没有条目 —— 回 `undefined`，由纯函数层回落到
   * `displayLabel` / id。
   */
  const tModels = useTranslations('Models')
  const modelLabelOf = useCallback(
    (option: { modelId: string; displayLabel?: string }) =>
      isBuiltInModel(option.modelId)
        ? tModels(`${getModelMessageKey(option.modelId)}.label`)
        : undefined,
    [tModels],
  )

  /**
   * **生成确认卡那四颗旋钮的真值**（v2 §5.2 第一 / 第三行，commit #9）。
   *
   * ⭐ 与 `buildSnapshot` 不同，它是**渲染期算的值**：§5.2 第三行要求「卡未确认时
   * 用户改工作台，卡上对应项跟着变」，而那只有当它进依赖、跟着重渲染时才成立。
   * ⚠ 依赖列的是**用到的那几格**而不是整个 `state`：提示词每敲一个字都重算一遍
   *   这张按模型展开的表，是白烧的。
   */
  const generationControls = useMemo(
    () =>
      domain === ASSISTANT_PROTOCOL_DOMAIN_IDS.video
        ? buildVideoGenerationControls({
            modelOptions: videoModels.modelOptions,
            selectedModel: videoModels.selectedModel,
            videoMode: state.videoMode,
            aspectRatio: state.aspectRatio,
            resolution: state.videoResolution,
            labelOf: modelLabelOf,
          })
        : buildImageGenerationControls({
            modelOptions: imageModels.modelOptions,
            selectedModel: imageModels.selectedModel,
            aspectRatio: state.aspectRatio,
            resolution: state.advancedParams.resolution ?? null,
            count: state.imageBatchCount,
            labelOf: modelLabelOf,
          }),
    [
      modelLabelOf,
      domain,
      imageModels.modelOptions,
      imageModels.selectedModel,
      state.advancedParams.resolution,
      state.aspectRatio,
      state.imageBatchCount,
      state.videoMode,
      state.videoResolution,
      videoModels.modelOptions,
      videoModels.selectedModel,
    ],
  )

  return useMemo(
    () => ({
      domain,
      buildSnapshot,
      checkpoints,
      apply,
      results,
      ...(resultRun ? { resultRun } : {}),
      generationControls,
      referenceLimit,
      referenceImages: imageUpload.referenceEntries,
      open,
      setOpen,
    }),
    [
      apply,
      checkpoints,
      buildSnapshot,
      domain,
      generationControls,
      open,
      referenceLimit,
      imageUpload.referenceEntries,
      resultRun,
      results,
      setOpen,
    ],
  )
}
