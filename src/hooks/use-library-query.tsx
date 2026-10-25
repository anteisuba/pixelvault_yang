'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'next/navigation'

import { usePathname, useRouter } from '@/i18n/navigation'

/** 库的筛选（来源 / 底模 / 搜索词 / 排序 …）记在哪：只读那几个方法 + 整份换掉。 */
export interface LibraryQuery {
  readonly params: Pick<URLSearchParams, 'get' | 'toString'>
  replace: (next: URLSearchParams) => void
}

const LibraryQueryContext = createContext<LibraryQuery | null>(null)

/**
 * 库整页把筛选记在网址里（刷新、分享都还在）；挑选框（ui-spec ㉔）开在台上，⛔ 往台的
 * 网址里写库的参数 —— 包一层这个，同一套 hook 改记在框自己手上，关框就忘。
 */
export function LibraryQueryScope({
  initial,
  children,
}: {
  initial?: string
  children: ReactNode
}) {
  const [params, setParams] = useState(() => new URLSearchParams(initial))
  const replace = useCallback(
    (next: URLSearchParams) => setParams(new URLSearchParams(next)),
    [],
  )
  const value = useMemo(() => ({ params, replace }), [params, replace])
  return (
    <LibraryQueryContext.Provider value={value}>
      {children}
    </LibraryQueryContext.Provider>
  )
}

/** 库的筛选状态：挑选框里读框自己那份，否则读写网址。 */
export function useLibraryQuery(): LibraryQuery {
  const scoped = useContext(LibraryQueryContext)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const replace = useCallback(
    (next: URLSearchParams) => {
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      })
    },
    [pathname, router],
  )
  const url = useMemo(
    () => ({ params: searchParams, replace }),
    [replace, searchParams],
  )
  return scoped ?? url
}
