'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

import { STUDIO_CHARACTER_QUERY } from '@/constants/routes'
import { useStudioData } from '@/contexts/studio-context'
import { usePathname, useRouter } from '@/i18n/navigation'

/**
 * 角色页「用她 ▾ → 在图片工作台用她」落地：`?character=<id>` 到了就把这个角色
 * 设成在场角色（只她一个），然后从地址栏去掉这个参数（刷新不再重复套用）。
 *
 * ⚠ 等角色列表载完再认：id 不是这个用户的角色（删了 / 链接是别人的）就只清参数。
 * ⚠ 每个链接只套用一次（`handled`）：之后用户在工作台里改选不会被拨回去。
 */
export function StudioCharacterDeepLink() {
  const searchParams = useSearchParams()
  const characterId = searchParams.get(STUDIO_CHARACTER_QUERY)
  const { characters } = useStudioData()
  const router = useRouter()
  const pathname = usePathname()
  const handled = useRef<string | null>(null)
  const { isLoading, findCard, setActiveCardIds } = characters

  useEffect(() => {
    if (!characterId || isLoading || handled.current === characterId) return
    handled.current = characterId
    if (findCard(characterId)) setActiveCardIds([characterId])
    const rest = new URLSearchParams(searchParams.toString())
    rest.delete(STUDIO_CHARACTER_QUERY)
    const query = rest.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }, [
    characterId,
    findCard,
    isLoading,
    pathname,
    router,
    searchParams,
    setActiveCardIds,
  ])

  return null
}
