/**
 * 外观两档（暗色主题模块，owner 2026-10-24）：「素」= 现在的白，「暗房」= 整个应用换深色。
 *
 * · 默认素：没选过的人打开什么都不变，暗房是自己在头像菜单里选的。
 * · 只记在这台设备上（owner 10-24：⛔ 跟账号同步）—— 首页 / 画廊是缓存好的静态页，
 *   读账号设置就得每次现算；记在本机，第一帧就能上对颜色。
 * · ⛔ 没有「跟随系统」那一格（owner 10-24：先不做）。
 */
export const THEMES = ['light', 'dark'] as const

export type Theme = (typeof THEMES)[number]

export const THEME_DEFAULT: Theme = 'light'

export const THEME_STORAGE_KEY = 'pv:theme'

/**
 * 跟着外观走的地址 = `(main)` 路由组的第一段。首页、登录注册、隐私 / 条款、对话分享页
 * 不在里面，一直是素（owner 10-24）。
 * ⚠ `(main)` 新加顶层路由要同步加进来：`theme.test.ts` 扫目录对账，漏了就红。
 */
export const THEMED_ROUTE_SEGMENTS = [
  'assets',
  'dev',
  'gallery',
  'library',
  'settings',
  'studio',
  'u',
] as const
