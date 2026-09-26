'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { STUDIO_BLOCKED_HINT_MS } from '@/constants/studio'

/**
 * 桌面底部输入框的发送口（Enter / ⌘Enter / 圆键）—— 自然语言台与标签台共用。
 *
 * 被挡住时**不弹 toast**：圆键左边出一行灰字说缺什么，停一会儿自己退（owner
 * 2026-09-26 原型）—— 同一件事只说一遍。`handleGenerate` 仍然照调（带
 * `quietBlocked`），它负责把焦点送回提示词、缺渠道时打开选择器。
 */
export function useComposerSubmit(
  canGenerate: boolean,
  handleGenerate: (options?: { quietBlocked?: boolean }) => Promise<void>,
): { hintVisible: boolean; submit: () => void } {
  const [hintVisible, setHintVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const submit = useCallback(() => {
    if (canGenerate) {
      void handleGenerate()
      return
    }
    setHintVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(
      () => setHintVisible(false),
      STUDIO_BLOCKED_HINT_MS,
    )
    void handleGenerate({ quietBlocked: true })
  }, [canGenerate, handleGenerate])

  return { hintVisible, submit }
}
