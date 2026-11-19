/**
 * `/settings` 整页的分区词表与本地偏好键（D3 ④）。
 *
 * 分区**次序就是导航次序**：API key → 用量 → 偏好 → 助手 → 连接。`/settings` 自身没有
 * 内容，桌面重定向到第一项，手机停在一级列表。
 */

import { ROUTES } from '@/constants/routes'

export const SETTINGS_SECTION_IDS = {
  keys: 'keys',
  usage: 'usage',
  preferences: 'preferences',
  assistant: 'assistant',
  /** 让外部 Claude 进来读写项目（MCP 令牌，`docs/references/mcp.md` §3.1）。 */
  connections: 'connections',
} as const

export const SETTINGS_SECTIONS = [
  SETTINGS_SECTION_IDS.keys,
  SETTINGS_SECTION_IDS.usage,
  SETTINGS_SECTION_IDS.preferences,
  SETTINGS_SECTION_IDS.assistant,
  SETTINGS_SECTION_IDS.connections,
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export const SETTINGS_SECTION_ROUTES: Record<SettingsSection, string> = {
  [SETTINGS_SECTION_IDS.keys]: ROUTES.SETTINGS_KEYS,
  [SETTINGS_SECTION_IDS.usage]: ROUTES.SETTINGS_USAGE,
  [SETTINGS_SECTION_IDS.preferences]: ROUTES.SETTINGS_PREFERENCES,
  [SETTINGS_SECTION_IDS.assistant]: ROUTES.SETTINGS_ASSISTANT,
  [SETTINGS_SECTION_IDS.connections]: ROUTES.SETTINGS_CONNECTIONS,
}

/** 默认落点 = 导航第一项。⛔ 不另写一个字面量。 */
export const SETTINGS_DEFAULT_SECTION: SettingsSection = SETTINGS_SECTIONS[0]

export function isSettingsSection(value: string): value is SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(value)
}

/**
 * 偏好分区的开关没有服务端形状，落在既有的 localStorage 偏好机制上
 * （`useLocalPreference`）——⛔ 不为它们新开一张表。
 * ⚠ 「默认打开」已删（2026-11-19）：`/studio` 首页就是助手创作首页，这一项没有语义了。
 */
export const SETTINGS_PREFERENCE_KEYS = {
  /**
   * 生成完成时通知 —— 读它的是 `GenerationCompleteNotifier`（挂在 `MainProviders`）：
   * 页面不在前台时，图 / 视频 / 音频 / 3D 生成完成或失败弹一条浏览器通知。
   */
  notifyOnComplete: 'pixelvault:settings:notify-on-complete',
  /**
   * 减少动效（用户显式勾选，与系统 prefers-reduced-motion 是或的关系）——
   * 读它的是 `ReduceMotionPreference`（挂在 `MainProviders`）：开 = `<html data-reduce-motion>`
   * + `MotionConfig reducedMotion="always"`；关 = 跟随系统。
   */
  reduceMotion: 'pixelvault:settings:reduce-motion',
  /**
   * 助手隐身（56a）—— **设置页那一侧的落点**：空态里那颗「这一轮不记」写它。
   * ⚠ 面板 ⋯ 菜单里那颗开关作用于**当前会话**（住在操作员 store 里），与这一格
   * ⛔ 不是同一件事：这一格是「下次打开助手时默认隐身」。
   */
  assistantIncognito: 'pixelvault:settings:assistant-incognito',
} as const

/** `<html>` 上那颗「用户在设置里勾了减少动效」的标记；globals.css 的降级块同时认它。 */
export const REDUCE_MOTION_ATTRIBUTE = 'data-reduce-motion'
