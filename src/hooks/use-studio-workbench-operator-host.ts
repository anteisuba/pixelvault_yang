'use client'

/**
 * 操作员面板在**工作台**（`/studio/image|video`）这个宿主上的实现（P4-C 抽出）。
 *
 * ── 这个文件是搬家不是新写 ─────────────────────────────────────────
 * 里面每一段都来自 P1–P4-B 已经跑通的代码：快照分派原本在
 * `use-assistant-operator.ts` 里，落笔的那几只手原本在 `use-studio-operator-revert.ts`
 * 里，开合原本在 `StudioOperatorDock.tsx` 里。P4-C 把它们收进一个「宿主」对象，
 * 是因为装配台（`/studio/lora`）要提供**另一份同形状的东西**，而那条路由故意不挂
 * `<StudioProvider>`（见 `contexts/studio-operator-host.tsx` 头注）。
 * ⛔ 搬家过程中没有改任何判据 —— 改了就不是搬家，是重写。
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import type { StudioOperatorHost } from '@/contexts/studio-operator-host'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'
import { useOperatorUserUrlMount } from '@/hooks/use-operator-user-url-mount'
import { setOperatorPrimed } from '@/hooks/use-studio-operator-store'
import type { StudioOperatorApplyContext } from '@/lib/studio-operator-apply'
import {
  buildImageOperatorSnapshot,
  buildVideoOperatorSnapshot,
} from '@/lib/studio-operator-snapshot'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'

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
      imageBatchCount: current.imageBatchCount,
      videoDurationSeconds: current.videoDuration,
      videoResolution: current.videoResolution,
      videoAudioRefs: current.videoAudioRefs,
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
      addReference: (url) => latest.current.imageUpload.addReferenceImage(url),
      removeReference: (url) =>
        removeReferenceByUrl(latest.current.imageUpload, url),
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

  return useMemo(
    () => ({ domain, buildSnapshot, apply, referenceLimit, open, setOpen }),
    [apply, buildSnapshot, domain, open, referenceLimit, setOpen],
  )
}
