'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { ChubCharacterNode } from '@/types/chub-library'
import { getChubCardAPI } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { deferEffectTask } from '@/lib/defer-effect-task'

export interface UseChubCardReturn {
  status: 'idle' | 'loading' | 'ready' | 'error'
  node: ChubCharacterNode | null
  error: string | null
  retry: () => void
}

/**
 * 卡库详情：打开哪张就从 chub 取哪张的完整定义（`fullPath` 为 `null` = 详情关着，
 * 不发请求）。换一张时旧请求作废。
 */
export function useChubCard(fullPath: string | null): UseChubCardReturn {
  const tErrors = useTranslations('Errors')
  const [state, setState] = useState<{
    path: string | null
    status: UseChubCardReturn['status']
    node: ChubCharacterNode | null
    error: string | null
  }>({ path: null, status: 'idle', node: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!fullPath) return
    const abort = new AbortController()
    const cancel = deferEffectTask(() => {
      setState({ path: fullPath, status: 'loading', node: null, error: null })
      void getChubCardAPI(fullPath, abort.signal).then((response) => {
        if (abort.signal.aborted) return
        if (response.success) {
          setState({
            path: fullPath,
            status: 'ready',
            node: response.data,
            error: null,
          })
          return
        }
        setState({
          path: fullPath,
          status: 'error',
          node: null,
          error: getApiErrorMessage(
            tErrors,
            response,
            tErrors('chubLibrary.unavailable'),
          ),
        })
      })
    })
    return () => {
      cancel()
      abort.abort()
    }
  }, [attempt, fullPath, tErrors])

  // 换卡后、新请求起跑前那一帧不露上一张的内容。
  const current = state.path === fullPath
  return {
    status: fullPath ? (current ? state.status : 'loading') : 'idle',
    node: current ? state.node : null,
    error: current ? state.error : null,
    retry: () => setAttempt((value) => value + 1),
  }
}
