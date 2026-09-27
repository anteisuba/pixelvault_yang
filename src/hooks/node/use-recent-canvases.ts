'use client'

import { useCallback, useState } from 'react'

import type { NodeWorkflowProjectSummary } from '@/types/node-workflow'
import { listRecentNodeWorkflowProjectsAPI } from '@/lib/api-client/node-workflow'

/**
 * 最近打开过的几块画布（角色页「用她 ▾ → 放进画布」）。⚠ 不在挂载时拉：点开那一项
 * 才调 `load()`，菜单没展开就不白跑一次请求。
 */
export function useRecentCanvases() {
  const [state, setState] = useState<{
    status: 'idle' | 'loading' | 'ready' | 'failed'
    projects: NodeWorkflowProjectSummary[]
  }>({ status: 'idle', projects: [] })

  const load = useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading' }))
    const response = await listRecentNodeWorkflowProjectsAPI()
    setState(
      response.success && response.data
        ? { status: 'ready', projects: response.data }
        : { status: 'failed', projects: [] },
    )
  }, [])

  return { ...state, load }
}
