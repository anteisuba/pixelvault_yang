'use client'

import { useEffect, useState } from 'react'

import { useStudioForm } from '@/contexts/studio-context'
import { translatePromptToTagsAPI } from '@/lib/api-client'
import { parseTagChips } from '@/lib/tag-composer'
import type { TagChip } from '@/types/tag-composer'

export type TagCarryStatus = 'idle' | 'translating' | 'failed'

/**
 * 同一句只发一次：StrictMode 的二次挂载、桌面 / 手机两版编辑器换着挂，都接到同一个
 * 在飞的请求上。翻成的留着（同一句再带过来直接用），翻不成的删掉（点重试才重发）。
 */
const requests = new Map<string, Promise<TagChip[] | null>>()

function requestTranslation(
  source: string,
  modelId: string | undefined,
): Promise<TagChip[] | null> {
  const pending = requests.get(source)
  if (pending) return pending
  const request = translatePromptToTagsAPI({ prompt: source, modelId }).then(
    (result) => {
      const chips = result.success ? parseTagChips(result.data.tags) : []
      if (chips.length > 0) return chips
      requests.delete(source)
      return null
    },
  )
  requests.set(source, request)
  return request
}

/**
 * **自然语言带到标签台时，让助手翻成标签**（owner 2026-09-27）。
 *
 * 带过来的那一句先整句占着正向栏的一格（`tagCarrySource`）；这里把它送去翻，翻好了
 * 原地换成一串标签。翻不成就留着那一格，状态行给一个重试。
 *
 * ⚠ 只在标签台编辑器里挂（桌面底部输入框与参数栏那一版二选一，各挂一次）。
 * 那一格被删 / 被改、离开标签台时 reducer 已经把 `tagCarrySource` 清掉，迟到的结果
 * 由 `RESOLVE_TAG_CARRY` 自己作废，这里不用再判断。
 */
export function useTagCarryTranslation(modelId?: string): {
  status: TagCarryStatus
  retry: () => void
} {
  const { state, dispatch } = useStudioForm()
  const source =
    state.promptDialect === 'tags' ? (state.tagCarrySource ?? null) : null
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    if (!source || failed === source) return
    let live = true
    void requestTranslation(source, modelId).then((chips) => {
      if (!live) return
      if (chips) {
        dispatch({ type: 'RESOLVE_TAG_CARRY', payload: { source, chips } })
      } else {
        setFailed(source)
      }
    })
    return () => {
      live = false
    }
  }, [source, failed, modelId, dispatch])

  return {
    status: !source ? 'idle' : failed === source ? 'failed' : 'translating',
    retry: () => setFailed(null),
  }
}
