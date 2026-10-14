'use client'

import { createContext, useContext } from 'react'

export interface InPlaceViewerApi {
  /** 缩回当前那一张再放下（关上 / 删除后）。 */
  requestClose: () => void
  /** 菜单、确认框、弹层开着时让它们自己接 Esc 与方向键。 */
  setKeyboardBlocked: (blocked: boolean) => void
  /** 当前那张在可翻那组里的位置（从 0 起）；不在组里（视频 / 音频 / 3D）是 -1。 */
  index: number
  total: number
  hasRail: boolean
}

export const InPlaceViewerContext = createContext<InPlaceViewerApi | null>(null)

/**
 * 右栏拿外壳的接口（`requestClose` 等）。只能用在 `InPlaceViewer` 的 children 里
 * （电脑是右边 340，手机是底部上滑的信息页，同一份内容）。
 */
export function useInPlaceViewer(): InPlaceViewerApi {
  const api = useContext(InPlaceViewerContext)
  if (!api)
    throw new Error('useInPlaceViewer must be used inside InPlaceViewer')
  return api
}
