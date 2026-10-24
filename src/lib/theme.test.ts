import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { THEME_STORAGE_KEY, THEMED_ROUTE_SEGMENTS } from '@/constants/theme'

import {
  applyDocumentTheme,
  readThemePreference,
  subscribeThemePreference,
  THEME_BOOTSTRAP_SCRIPT,
  writeThemePreference,
} from './theme'

/**
 * 外观两档的底座（暗色主题模块，owner 2026-10-24）。钉三件事：
 *  ① 首帧脚本只在 `(main)` 的地址上挂 `.dark` —— 首页 / 登录 / 条款一直素；
 *  ② `THEMED_ROUTE_SEGMENTS` 和 `(main)` 目录的第一段一一对上（新加顶层路由漏登记就红）；
 *  ③ 本机记档读写：记坏了、存储被禁都按素。
 */

const root = document.documentElement

afterEach(() => {
  window.localStorage.clear()
  root.classList.remove('dark')
  document.head
    .querySelectorAll('meta[data-theme-sync], script[data-test-bootstrap]')
    .forEach((node) => node.remove())
  window.history.pushState({}, '', '/')
  vi.restoreAllMocks()
})

/** 照浏览器那样跑一遍首帧脚本：塞进 `<head>`，jsdom 当场执行。 */
function runBootstrapAt(path: string) {
  window.history.pushState({}, '', path)
  const script = document.createElement('script')
  script.dataset.testBootstrap = ''
  script.textContent = THEME_BOOTSTRAP_SCRIPT
  document.head.append(script)
}

describe('首帧脚本', () => {
  it.each([
    '/zh/studio',
    '/en/studio/node',
    '/ja/library/lora',
    '/zh/gallery/abc',
    '/zh/settings/keys',
    '/zh/u/me',
    '/zh/assets/1',
  ])('记的是暗房、地址在 (main) 里：%s 挂 .dark', (path) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    runBootstrapAt(path)
    expect(root.classList.contains('dark')).toBe(true)
  })

  it.each([
    '/zh',
    '/en/',
    '/zh/sign-in',
    '/ja/sign-up/verify',
    '/zh/privacy',
    '/en/terms',
    '/zh/assistant/share/abc',
    '/studio-like',
  ])('首页 / 登录 / 条款 / 分享页 %s 一直素', (path) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    runBootstrapAt(path)
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('没记过、记的是素、记坏了：都不挂', () => {
    runBootstrapAt('/zh/studio')
    expect(root.classList.contains('dark')).toBe(false)

    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    runBootstrapAt('/zh/studio')
    expect(root.classList.contains('dark')).toBe(false)

    window.localStorage.setItem(THEME_STORAGE_KEY, 'midnight')
    runBootstrapAt('/zh/studio')
    expect(root.classList.contains('dark')).toBe(false)
  })
})

/** `(main)` 目录下的地址第一段：穿过 `(组)`，跳过 `@插槽` / `_私有` / 文件。 */
function firstUrlSegments(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (!statSync(path).isDirectory()) return []
    if (name.startsWith('@') || name.startsWith('_')) return []
    if (name.startsWith('(') && name.endsWith(')')) {
      return firstUrlSegments(path)
    }
    return [name]
  })
}

describe('THEMED_ROUTE_SEGMENTS', () => {
  it('和 (main) 目录的第一段一一对上', () => {
    const segments = firstUrlSegments(
      join(process.cwd(), 'src/app/[locale]/(main)'),
    )
    // 动态段（`[x]`）首帧脚本认不出 —— 真要加，先改脚本。
    expect(segments.filter((segment) => segment.startsWith('['))).toEqual([])
    expect([...new Set(segments)].sort()).toEqual(
      [...THEMED_ROUTE_SEGMENTS].sort(),
    )
  })
})

describe('本机记档', () => {
  it('读：没记过、记坏了都按素', () => {
    expect(readThemePreference()).toBe('light')
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    expect(readThemePreference()).toBe('light')
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    expect(readThemePreference()).toBe('dark')
  })

  it('读：存储被禁（隐私模式）也按素，不抛', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(readThemePreference()).toBe('light')
  })

  it('写：记下来并通知本页；退订后不再通知', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeThemePreference(listener)
    writeThemePreference('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    writeThemePreference('light')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('别的标签页换档（storage 事件）也通知，别的键不管', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeThemePreference(listener)
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }))
    expect(listener).not.toHaveBeenCalled()
    window.dispatchEvent(
      new StorageEvent('storage', { key: THEME_STORAGE_KEY }),
    )
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})

describe('applyDocumentTheme', () => {
  it('暗房挂 .dark 并放一颗浏览器顶栏色；素档两样都摘掉', () => {
    applyDocumentTheme('dark')
    expect(root.classList.contains('dark')).toBe(true)
    expect(
      document.head.querySelectorAll('meta[name="theme-color"]'),
    ).toHaveLength(1)

    applyDocumentTheme('dark')
    expect(
      document.head.querySelectorAll('meta[name="theme-color"]'),
    ).toHaveLength(1)

    applyDocumentTheme('light')
    expect(root.classList.contains('dark')).toBe(false)
    expect(document.head.querySelector('meta[name="theme-color"]')).toBeNull()
  })
})
