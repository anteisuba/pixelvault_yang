'use client'

import { useEffect, useReducer, useRef } from 'react'

import { fetchRunnerUsageAPI } from '@/lib/api-client/lora-assets'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { RunnerUsageResult } from '@/types'

export interface UseRunnerUsageReturn {
  /** 全站 runner 月度额度快照；null = 未加载 / 拉取失败 / 未激活。 */
  usage: RunnerUsageResult | null
  isLoading: boolean
}

const EMPTY: UseRunnerUsageReturn = { usage: null, isLoading: false }

type Action =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; usage: RunnerUsageResult | null }

function reducer(
  state: UseRunnerUsageReturn,
  action: Action,
): UseRunnerUsageReturn {
  switch (action.type) {
    case 'idle':
      return EMPTY
    case 'loading':
      return { usage: null, isLoading: true }
    case 'success':
      return { usage: action.usage, isLoading: false }
  }
}

/**
 * 全站 runner 月度额度（「本月剩余 N/300」主动提示）。仅在 `active`（选中 runner
 * 底模）时拉取——不激活 → idle 不发请求。全局共享额度、随生成变化，不缓存。
 * 失败静默 null（提示块据此不显示）。
 */
export function useRunnerUsage(active: boolean): UseRunnerUsageReturn {
  const [state, dispatch] = useReducer(reducer, EMPTY)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (!active) {
      dispatch({ type: 'idle' })
      return
    }

    dispatch({ type: 'loading' })

    return deferEffectTask(() => {
      void fetchRunnerUsageAPI().then((response) => {
        if (requestIdRef.current !== requestId) return
        dispatch({
          type: 'success',
          usage: response.success && response.data ? response.data : null,
        })
      })
    })
  }, [active])

  return state
}
