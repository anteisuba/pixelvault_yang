'use client'

import { useCallback, useEffect } from 'react'

import {
  studioLibraryPath,
  type StudioLibraryCategoryId,
} from '@/constants/studio-shell'
import {
  useLibraryPickProvider,
  useSetLibraryPickSlot,
} from '@/contexts/studio-library-pick'
import { useRouter } from '@/i18n/navigation'

/**
 * 库那一类在挑选的样子（`/library/<类>?pick=1`，第 9f 步 9f-2d）：只留一格落点，里面那份
 * 挑选界面由开着的台传送进来（`useLibraryPickSlot`）。
 *
 * 没有台在等（直接打开 / 刷新了这个地址，台还没挂）就退回这一类的整页。
 */
export function StudioLibraryPickSlot({
  category,
}: {
  category: StudioLibraryCategoryId
}) {
  const router = useRouter()
  const provider = useLibraryPickProvider(category)
  const setSlot = useSetLibraryPickSlot()

  useEffect(() => {
    if (provider === null) router.replace(studioLibraryPath(category))
  }, [category, provider, router])
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
