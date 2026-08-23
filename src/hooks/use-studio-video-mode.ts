'use client'

import { useCallback, useMemo } from 'react'

import { getModelVariant } from '@/constants/models'
import {
  VIDEO_NODE_MODES,
  getModelsForNodeMode,
  resolveVideoModelId,
  type VideoNodeMode,
} from '@/constants/video-node-modes'
import { useStudioForm } from '@/contexts/studio-context'
import { useVideoModelOptions } from '@/hooks/use-video-model-options'

export interface UseStudioVideoModeReturn {
  /** 当前用途（`state.videoMode`）。 */
  mode: VideoNodeMode
  /** 目录里真有模型的档位，按 `VIDEO_NODE_MODES` 顺序。少于 2 档就别渲染控件。 */
  modes: VideoNodeMode[]
  switchTo: (next: VideoNodeMode) => void
}

/**
 * Studio 视频「用途」档 —— 把端点这一维从模型选择器里拆出来。
 *
 * ## 为什么是一个 hook 而不是各算各的
 *
 * 用途有两个消费者：工具条上的分段控件，和 `StudioPromptArea` 里给选择器的过滤
 * 谓词。各写一份的话，只要有一边的兜底分支不一样（比如「没选模型时」一个落
 * keyframe、一个落不过滤），表现就是「控件显示关键帧、列表却什么都不过滤」。
 * 收在这里只算一次。
 *
 * ## 三条判据（第 1 条是踩出来的，别改回去）
 *
 * 1. **用途必须是真 state，不能从选中模型反推。** 反推看着更省——端点已经编码了
 *    用途——但它在「**还没选模型**」时无处可存，而那正是初始状态：点档位不会有
 *    任何反应，因为没有模型可推。实测过这一版。存 state 也与画布同构：画布把
 *    `videoMode` 存在节点数据上（`types/node-workflow.ts`），不是推出来的。
 * 2. **档位从目录实算**（`getModelsForNodeMode`），不维护第二张名单。
 *    ⚠ 判据是「**目录里这一档有没有模型**」而不是「当前型号有没有孪生端点」——
 *    后者也试过一版，后果是：没选模型时控件不渲染，而默认的关键帧档又把
 *    Gemini Omni Flash（唯一的「多图参考」档模型）过滤掉了，于是它在 Studio
 *    **彻底不可达**。控件是那一档唯一的入口，不能按当前选中项的情况隐藏。
 * 3. **切档优先平移同型号同渠道**（`resolveVideoModelId`）；新档下不存在该型号时
 *    清空选择，让用户从收窄后的列表里重挑 —— 与画布同规矩（owner 2026-08-08：
 *    不能留的直接消失并清空，不是置灰）。⛔ 绝不回退到别的端点：那意味着用户
 *    以为切到了参考档、实际仍发首帧请求。
 */
export function useStudioVideoMode(): UseStudioVideoModeReturn {
  const { state, dispatch } = useStudioForm()
  const { selectedModel, modelOptions } = useVideoModelOptions(
    state.selectedOptionId ?? '',
  )

  const mode = state.videoMode

  const modes = useMemo(
    () =>
      VIDEO_NODE_MODES.filter(
        (m) => getModelsForNodeMode(m).length > 0,
      ).slice(),
    [],
  )

  const switchTo = useCallback(
    (next: VideoNodeMode) => {
      dispatch({ type: 'SET_VIDEO_MODE', payload: next })

      const variant = selectedModel
        ? getModelVariant(selectedModel.modelId)
        : null
      const adapterType = selectedModel?.adapterType
      if (variant && adapterType) {
        const targetId = resolveVideoModelId(variant, adapterType, next)
        const target = targetId
          ? modelOptions.find((option) => option.modelId === targetId)
          : undefined
        if (target) {
          // 同型号同渠道在新档下也有 —— 平移过去，用户不用重挑。
          dispatch({ type: 'SET_OPTION_ID', payload: target.optionId })
          return
        }
      }
      // 留不住就清空（画布同规矩：不能留的直接消失并清空选择，不是置灰）。
      // ⛔ 绝不回退到别的端点：那意味着用户以为切到了参考档、实际仍发首帧请求。
      if (selectedModel) {
        dispatch({ type: 'SET_OPTION_ID', payload: null })
      }
    },
    [selectedModel, modelOptions, dispatch],
  )

  return { mode, modes, switchTo }
}
