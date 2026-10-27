/**
 * 客户端数据层（TanStack Query）的键与时长。库页之间来回切时，同一份数据只拉一次、
 * 切回来先给缓存里的再后台对一遍（2026-10-27：一次切库约 40 个请求、助手设置重复拉
 * 约 20 次，都是各 hook 自己拉、互不共用）。
 *
 * 新接进来的数据在这里加一个键，⛔ 在 hook 里手写字符串键。
 */
export const QUERY_KEYS = {
  assistantPersona: ['assistant-persona'],
  myProfile: (userId: string | null) => ['my-profile', userId] as const,
  civitaiToken: ['civitai-token'],
  danbooruFavorites: ['danbooru-favorites'],
  loraAssets: ['lora-assets', 'mine'],
  loraDiscover: ['lora-assets', 'discover'],
  voiceCards: ['voice-cards'],
  characterLoras: (characterCardId: string | null) =>
    ['character-loras', characterCardId] as const,
} as const

export const QUERY_TIMING = {
  /** 这么久之内再挂上同一份数据不重拉（切库、开关面板）。 */
  staleMs: 60_000,
  /** 没人用了还在缓存里留多久（切到别的库再切回来）。 */
  gcMs: 30 * 60_000,
} as const
