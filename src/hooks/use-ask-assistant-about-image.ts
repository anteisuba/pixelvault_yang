'use client'

import { useCallback } from 'react'

import { useStudioForm } from '@/contexts/studio-context'
import { useStudioAssistantReference } from '@/hooks/use-studio-assistant-reference'

/**
 * §3.0b 第 4 条「引用对象扩展到生成图」——「点这张生成图问助手」。
 *
 * 返回的回调做两件事，**顺序不能反**：先把图注入助手输入区，再把助手面板打开。
 * 反过来的话，移动端抽屉是刚挂载的那一帧去读注入值，`token` 已经先于订阅建立
 * 之前变过，附件不会出现。
 *
 * ⚠ **只塞附件，不自动发送**（owner 拍板）：vision token 是真钱，像素级永远由
 * 用户点选触发。用户看到缩略图后自己打字提问、自己按发送，走的还是既有那条
 * 附件管线（`references` → `/api/.../prompt-assistant`），没有新建任何端点。
 *
 * ⚠ 8 张上限不在这里判 —— `PromptAssistantPanel` 注入时统一 `slice` 到
 * `ASSISTANT_MEDIA_LIMITS.maxReferences`，这里再写一道就是第二份闸，两份迟早
 * 各自漂移。
 */
export function useAskAssistantAboutImage(): (url: string) => void {
  const { dispatch } = useStudioForm()
  const { injectReference } = useStudioAssistantReference()

  return useCallback(
    (url: string) => {
      if (!url) return
      injectReference(url)
      dispatch({ type: 'OPEN_PANEL', payload: 'enhance' })
    },
    [dispatch, injectReference],
  )
}
