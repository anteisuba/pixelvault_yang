'use client'

import { useSyncExternalStore } from 'react'

import { THEME_DEFAULT, type Theme } from '@/constants/theme'
import {
  readThemePreference,
  subscribeThemePreference,
  writeThemePreference,
} from '@/lib/theme'

/**
 * 本机记的外观档 + 换档（头像菜单「外观」那一行用）。⚠ 服务端没有本机存储，水化那一帧
 * 按默认素算 —— 只给菜单这种打开后才挂上的地方用；`<html>` 上的 `.dark` 由
 * `ThemedScope` 直接读，⛔ 走这里（水化那一帧会把首帧挂好的暗房摘掉）。
 */
export function useThemePreference(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(
    subscribeThemePreference,
    readThemePreference,
    () => THEME_DEFAULT,
  )
  return [theme, writeThemePreference]
}
