'use client'

import { useCallback, useEffect } from 'react'

import type { StudioLibraryCategoryId } from '@/constants/studio-shell'
import {
  useLibraryPickProvider,
  useSetLibraryPickSlot,
} from '@/contexts/studio-library-pick'

/**
 * 库那一类在挑选的样子（`/library/<类>?pick=1`，第 9f 步 9f-2d）：只留一格落点，里面那份
 * 挑选界面由开着的台传送进来（`useLibraryPickSlot`）。
 *
 * 没有台在等（直接打开 / 刷新了这个地址，台还没挂）就退回这一类的整页。
 * ⚠ 整页重载、⛔ 软跳转：软跳转到同一路由只去掉查询参数时，叠层那一页实测不重画（停在空落点）。
 */
export function StudioLibraryPickSlot({
  category,
}: {
  category: StudioLibraryCategoryId
}) {
  const provider = useLibraryPickProvider(category)
  const setSlot = useSetLibraryPickSlot()

  useEffect(() => {
    if (provider === null) window.location.replace(window.location.pathname)
  }, [provider])
  const bindSlot = useCallback(
    (node: HTMLDivElement | null) => {
      setSlot?.(category, node)
      return () => setSlot?.(category, null)
    },
    [category, setSlot],
  )

  return (
    <div
      ref={bindSlot}
      data-testid="library-pick-slot"
      data-category={category}
      className="flex h-full min-h-0 flex-col"
    />
  )
}
