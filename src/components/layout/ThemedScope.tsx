'use client'

import { useLayoutEffect } from 'react'

import { THEME_DEFAULT } from '@/constants/theme'
import {
  applyDocumentTheme,
  readThemePreference,
  subscribeThemePreference,
  withoutTransitions,
} from '@/lib/theme'

/**
 * `(main)` 跟着外观走（暗色主题模块，owner 2026-10-24）：挂在 `(main)` 的布局里，
 * 进来时按本机记的那档给 `<html>` 挂 / 摘 `.dark`，出去（首页、登录页）时摘掉 ——
 * 那几页一直是素。菜单里换档、别的标签页换档都在这里跟。
 *
 * ⚠ 直接读本机存储，⛔ 走 `useThemePreference`：那条在水化那一帧按默认素算，会把首帧
 *   脚本挂好的 `.dark` 摘掉、白闪一下。layout effect = 画出来之前就换好。
 */
export function ThemedScope() {
  useLayoutEffect(() => {
    applyDocumentTheme(readThemePreference())
    const unsubscribe = subscribeThemePreference(() =>
      withoutTransitions(() => applyDocumentTheme(readThemePreference())),
    )
    return () => {
      unsubscribe()
      applyDocumentTheme(THEME_DEFAULT)
    }
  }, [])

  return null
}
