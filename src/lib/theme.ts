import {
  THEME_DEFAULT,
  THEME_STORAGE_KEY,
  THEMED_ROUTE_SEGMENTS,
  THEMES,
  type Theme,
} from '@/constants/theme'
import { LOCALES } from '@/i18n/routing'

/**
 * 外观两档的「记在哪、怎么上到页面上」（暗色主题模块，owner 2026-10-24）。
 *
 * · 记：本机 localStorage（`THEME_STORAGE_KEY`），⛔ 进账号。
 * · 上：`<html>` 挂不挂 `.dark`。颜色全在令牌上（globals.css `:root` / `.dark` 两档），
 *   组件不认外观。
 * · 谁挂：首帧由根布局 `<head>` 里的 `THEME_BOOTSTRAP_SCRIPT` 挂（⛔ 先白一下）；之后
 *   由 `(main)` 里的 `ThemedScope` 管 —— 进出 `(main)`、在菜单里换档、别的标签页换档。
 */

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === 'string' && (THEMES as readonly string[]).includes(value)
  )
}

/** 本机记的那一档；没记过、记坏了、存储被禁（隐私模式）都按默认素。 */
export function readThemePreference(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(stored) ? stored : THEME_DEFAULT
  } catch {
    return THEME_DEFAULT
  }
}

const listeners = new Set<() => void>()

export function writeThemePreference(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // 存不下就只管这一页：下面照样通知，本页立刻换。
  }
  for (const listener of listeners) listener()
}

/** 本页换档 + 别的标签页换档（`storage` 事件）都回调。 */
export function subscribeThemePreference(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** 手机浏览器顶上那条的颜色。素档不放，照旧由浏览器自己取页面底色。 */
const THEME_COLOR_META_SELECTOR = 'meta[name="theme-color"][data-theme-sync]'

export function applyDocumentTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')

  const existing = document.head.querySelector<HTMLMetaElement>(
    THEME_COLOR_META_SELECTOR,
  )
  if (theme !== 'dark') {
    existing?.remove()
    return
  }
  const meta = existing ?? document.createElement('meta')
  if (!existing) {
    meta.name = 'theme-color'
    meta.dataset.themeSync = ''
    document.head.append(meta)
  }
  meta.content = window.getComputedStyle(document.body).backgroundColor
}

/**
 * 换档时一下到位：几百个带 `transition` 的元素一起渐变会花（owner 10-24「一点就切」）。
 * 先关掉全部过渡、换、逼浏览器把新样式算完，再放回去。
 */
export function withoutTransitions(run: () => void): void {
  const style = document.createElement('style')
  style.append('*,*::before,*::after{transition:none!important}')
  document.head.append(style)
  run()
  void window.getComputedStyle(document.body).opacity
  window.setTimeout(() => style.remove(), 1)
}

/**
 * 首帧前（根布局 `<head>`）跑：本机记的是暗房、这一页又跟外观走，就先给 `<html>` 挂上
 * `.dark` —— 等 React 起来再挂会先白一下。
 * ⚠ 会被 `toString()` 原样塞进页面：⛔ 引用函数外的任何东西，要用的全从参数传进来。
 */
function bootstrapTheme(
  storageKey: string,
  locales: readonly string[],
  themedSegments: readonly string[],
): void {
  try {
    if (window.localStorage.getItem(storageKey) !== 'dark') return
    const parts = window.location.pathname.split('/').filter(Boolean)
    const segment = locales.indexOf(parts[0]) >= 0 ? parts[1] : parts[0]
    if (segment !== undefined && themedSegments.indexOf(segment) >= 0) {
      document.documentElement.classList.add('dark')
    }
  } catch {
    // 存储被禁就按素来。
  }
}

export const THEME_BOOTSTRAP_SCRIPT = `(${bootstrapTheme.toString()})(${JSON.stringify(
  THEME_STORAGE_KEY,
)},${JSON.stringify(LOCALES)},${JSON.stringify(THEMED_ROUTE_SEGMENTS)})`
