/**
 * `/settings` 整页的分区词表与本地偏好键（D3 ④）。
 *
 * 分区**次序就是导航次序**：API key → 用量 → 偏好 → 助手。`/settings` 自身没有
 * 内容，桌面重定向到第一项，手机停在一级列表。
 */

import { ROUTES } from '@/constants/routes'

export const SETTINGS_SECTION_IDS = {
  keys: 'keys',
  usage: 'usage',
  preferences: 'preferences',
  assistant: 'assistant',
} as const

export const SETTINGS_SECTIONS = [
  SETTINGS_SECTION_IDS.keys,
  SETTINGS_SECTION_IDS.usage,
  SETTINGS_SECTION_IDS.preferences,
  SETTINGS_SECTION_IDS.assistant,
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export const SETTINGS_SECTION_ROUTES: Record<SettingsSection, string> = {
  [SETTINGS_SECTION_IDS.keys]: ROUTES.SETTINGS_KEYS,
  [SETTINGS_SECTION_IDS.usage]: ROUTES.SETTINGS_USAGE,
  [SETTINGS_SECTION_IDS.preferences]: ROUTES.SETTINGS_PREFERENCES,
  [SETTINGS_SECTION_IDS.assistant]: ROUTES.SETTINGS_ASSISTANT,
}

/** 默认落点 = 导航第一项。⛔ 不另写一个字面量。 */
export const SETTINGS_DEFAULT_SECTION: SettingsSection = SETTINGS_SECTIONS[0]

export function isSettingsSection(value: string): value is SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(value)
}

/**
 * 偏好分区那三项没有服务端形状，落在既有的 localStorage 偏好机制上
 * （`useLocalPreference`）——⛔ 不为它们新开一张表。
 */
export const SETTINGS_PREFERENCE_KEYS = {
  /** 「默认打开」选的那个工作台路由。 */
  defaultWorkbench: 'pixelvault:settings:default-workbench',
  /** 生成完成时通知。 */
  notifyOnComplete: 'pixelvault:settings:notify-on-complete',
  /** 减少动效（用户显式勾选，与系统 prefers-reduced-motion 是或的关系）。 */
  reduceMotion: 'pixelvault:settings:reduce-motion',
  /** 助手隐身模式（行为接入留给 56，本轮只存状态）。 */
  assistantIncognito: 'pixelvault:settings:assistant-incognito',
  /** 助手「不记的类目」，逗号分隔（同上，本轮只存状态）。 */
  assistantMutedTopics: 'pixelvault:settings:assistant-muted-topics',
} as const

/** 「默认打开」可选的工作台。值就是路由，⛔ 不做第二张 id → 路由的映射。 */
export const SETTINGS_DEFAULT_WORKBENCH_OPTIONS = [
  ROUTES.STUDIO_IMAGE,
  ROUTES.STUDIO_VIDEO,
  ROUTES.STUDIO_AUDIO,
  ROUTES.STUDIO_NODE,
  ROUTES.GALLERY,
] as const

export type SettingsDefaultWorkbench =
  (typeof SETTINGS_DEFAULT_WORKBENCH_OPTIONS)[number]

export function isSettingsDefaultWorkbench(
  value: string | null,
): value is SettingsDefaultWorkbench {
  return (SETTINGS_DEFAULT_WORKBENCH_OPTIONS as readonly string[]).includes(
    value ?? '',
  )
}

/**
 * 助手「不记的类目」的三个预设值。⚠ 它们是 i18n key 的后缀，不是展示文案——
 * 用户自己加的类目原样存原文。
 */
export const SETTINGS_ASSISTANT_MUTED_PRESETS = [
  'address',
  'payment',
  'contact',
] as const
