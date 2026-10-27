'use client'

import { QueryClient } from '@tanstack/react-query'

import { QUERY_TIMING } from '@/constants/query'

/**
 * 整个客户端共用的一份查询缓存。hook 里一律 `useQuery(options, queryClient)` 显式传它：
 * 库会被传送进外壳的落点、挑选框开在台上，这些地方不一定在同一棵 Provider 树下，
 * 显式传就不用操心挂在哪一层；单测也不用每个都包一层 Provider（`vitest.setup.ts` 每例清空）。
 *
 * 换账号时整份清掉（`QueryUserBoundary`），⛔ 让上一个人的数据露给下一个人。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_TIMING.staleMs,
      gcTime: QUERY_TIMING.gcMs,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
