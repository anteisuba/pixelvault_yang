'use client'

import { useEffect } from 'react'

import {
  STUDIO_LIBRARY_CATEGORY_IDS,
  type StudioShellOverlayId,
} from '@/constants/studio-shell'
import type {
  AssistantLibraryView,
  AssistantLibraryViewItem,
} from '@/types/assistant-operator'

/**
 * 库开着、在看哪一样（10-26 用户在角色库开着 Denia 问「这个角色」，助手认不出）。
 *
 * ⭐ 库叠层里的页面不当宿主（`StudioOperatorDetachedScope`：⛔ 一打开库就掐掉台上那一轮），
 *   助手仍是底下那个台的身份 —— 所以库只往这里报一句，发请求时带上（`libraryView`）。
 * ⚠ 模块级：外壳那一份面板发请求时现读，⛔ 为它重渲染。点开的那一样由报它的页面卸掉时收回
 *   （⛔ 换类时在这里清：子页面的 effect 先于叠层的跑，会把新页刚报的清掉）。
 */
let library: AssistantLibraryView['library'] | null = null
let item: AssistantLibraryViewItem | null = null

/** 外壳的库叠层挂上 / 换类 / 收掉时调（「我的主页」不算库）。 */
export function setLibraryViewCategory(
  category: StudioShellOverlayId | null,
): void {
  const next =
    category &&
    (STUDIO_LIBRARY_CATEGORY_IDS as readonly string[]).includes(category)
      ? (category as AssistantLibraryView['library'])
      : null
  library = next
}

/** 发请求时现读：库没开 = `null`。 */
export function readLibraryView(): AssistantLibraryView | null {
  if (!library) return null
  return item ? { library, item } : { library }
}

/**
 * 库里各页报「点开了哪一样」；`null` = 没点开。卸掉 / 换一样时收回自己报的那一条。
 * ⚠ 挑选框里也会挂同一个组件：库没开时 `readLibraryView` 本来就回 `null`，报了也不发。
 */
export function useReportLibraryItem(
  next: AssistantLibraryViewItem | null,
): void {
  const kind = next?.kind ?? null
  const name = next?.name ?? null
  useEffect(() => {
    if (!kind || !name) return
    const mine: AssistantLibraryViewItem = { kind, name }
    item = mine
    return () => {
      if (item === mine) item = null
    }
  }, [kind, name])
}
