'use client'

import { useCallback } from 'react'

import { useStudioForm } from '@/contexts/studio-context'
import { addOperatorMention } from '@/hooks/use-studio-operator-store'
import { toOperatorAttachment } from '@/hooks/use-studio-operator-upload'
import type { GenerationRecord } from '@/types'

/**
 * §3.0b 第 4 条「引用对象扩展到生成图」——「点这张生成图问助手」。
 *
 * 返回的回调做两件事，**顺序不能反**：先把图递进助手输入框的收件箱，再把助手
 * 面板打开。反过来的话，面板是刚挂载的那一帧去读收件箱，会漏掉这一张。
 *
 * ⭐ 走的是统一引用模型那条唯一的管线（§10b）：`addOperatorMention` 进 store 的
 * `mentionInbox`，输入框（`use-assistant-mention-composer.ts`）把它收成正文末尾一枚
 * `<@image:id>` 胶囊，同一张只落一次。
 * 🔬 由来（2026-10-14 审计）：从前这里把图注入旧 `PromptAssistantPanel` 的 store，
 * 而图片 / 视频台挂的是 `StudioOperatorDock`，它从不读那份 store —— 面板开了，图没挂上。
 *
 * ⚠ **只插胶囊，不自动发送**（owner 拍板）：vision token 是真钱，用户看到缩略图后
 * 自己打字提问、自己按发送。
 */
export function useAskAssistantAboutImage(): (
  generation: GenerationRecord,
) => void {
  const { dispatch } = useStudioForm()

  return useCallback(
    (generation: GenerationRecord) => {
      if (!generation.url) return
      addOperatorMention(toOperatorAttachment(generation))
      dispatch({ type: 'OPEN_PANEL', payload: 'enhance' })
    },
    [dispatch],
  )
}
