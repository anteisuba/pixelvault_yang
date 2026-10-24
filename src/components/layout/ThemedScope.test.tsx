import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { THEME_STORAGE_KEY } from '@/constants/theme'
import { writeThemePreference } from '@/lib/theme'

import { ThemedScope } from './ThemedScope'

/**
 * `(main)` 跟着外观走（暗色主题模块，owner 2026-10-24）：进来按本机记的那档挂，
 * 菜单 / 别的标签页换档跟着换，出去（首页、登录页）摘掉。
 */

const root = document.documentElement

afterEach(() => {
  window.localStorage.clear()
  root.classList.remove('dark')
})

describe('ThemedScope', () => {
  it('进来按本机记的暗房挂 .dark，出去摘掉', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const { unmount } = render(<ThemedScope />)
    expect(root.classList.contains('dark')).toBe(true)

    unmount()
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('首帧脚本挂好的 .dark 进来时不被摘掉（⛔ 白闪一下）', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    root.classList.add('dark')
    render(<ThemedScope />)
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('菜单里换档当场跟', () => {
    render(<ThemedScope />)
    expect(root.classList.contains('dark')).toBe(false)

    act(() => writeThemePreference('dark'))
    expect(root.classList.contains('dark')).toBe(true)

    act(() => writeThemePreference('light'))
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('别的标签页换档（storage 事件）也跟', () => {
    render(<ThemedScope />)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: THEME_STORAGE_KEY }),
      )
    })
    expect(root.classList.contains('dark')).toBe(true)
  })
})
