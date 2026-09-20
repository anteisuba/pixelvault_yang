/**
 * Application route definitions
 *
 * All page paths should reference these constants instead of hardcoded strings.
 */

export const ROUTES = {
  /** Public pages */
  HOME: '/',
  GALLERY: '/gallery',

  /** Legal / display-surface pages */
  PRIVACY: '/privacy',
  TERMS: '/terms',

  /** Auth pages */
  SIGN_IN: '/sign-in',
  SIGN_UP: '/sign-up',

  /** Protected pages */
  STUDIO: '/studio',
  STUDIO_IMAGE: '/studio/image',
  /**
   * 标签台（D10 ⑤）。与 `/studio/image` **同壳**：结果区 / 参考轨 / 助手 /
   * 任务条全部复用，只有中间两列是它自己的。两台之间只有顶部那一对分段切换
   * 这一个门，⛔ 不做逐 provider 分页、⛔ 不做第三台。
   */
  STUDIO_IMAGE_TAGS: '/studio/image/tags',
  STUDIO_VIDEO: '/studio/video',
  STUDIO_AUDIO: '/studio/audio',
  STUDIO_3D: '/studio/3d',
  STUDIO_EDIT: '/studio/edit',
  STUDIO_LORA: '/studio/lora',
  STUDIO_NODE: '/studio/node',
  /** Krea-style private asset browser */
  ASSETS: '/assets',
  CARDS: '/cards',
  PROMPTS: '/prompts',
  STORYBOARD: '/storyboard',

  /**
   * 账号设置整页（D3 ④）。`/settings` 本身没有内容：桌面直接重定向到
   * `/settings/keys`，手机停在一级列表。四个子路由都可直链、可回退。
   */
  SETTINGS: '/settings',
  SETTINGS_KEYS: '/settings/keys',
  SETTINGS_USAGE: '/settings/usage',
  SETTINGS_PREFERENCES: '/settings/preferences',
  SETTINGS_ASSISTANT: '/settings/assistant',

  /** Creator profile (public) */
  CREATOR_PROFILE: '/u',
  /**
   * 「我的主页」的静态地址（D11 ④）。服务端解析当前用户的 username 后
   * `redirect` 到 `/u/<username>` —— 导航条目因此不必等任何运行时事实。
   * ⚠ `me` 已在 `PROFILE.RESERVED_USERNAMES` 里占住，见那条注释。
   */
  MY_PROFILE: '/u/me',
} as const

/** Build a creator profile URL from username */
export function creatorProfilePath(username: string): string {
  return `${ROUTES.CREATOR_PROFILE}/${encodeURIComponent(username)}`
}

/** Build a gallery detail URL from a generation ID */
export function galleryGenerationPath(id: string): string {
  return `${ROUTES.GALLERY}/${encodeURIComponent(id)}`
}

/** Build the standalone asset detail URL for a generation */
export function assetDetailPath(id: string): string {
  return `${ROUTES.ASSETS}/${encodeURIComponent(id)}`
}

export interface PromptCreatePathOptions {
  name?: string
  prompt?: string
  negativePrompt?: string | null
  modelId?: string
  provider?: string
  outputType?: string
  generationId?: string
}

export const CARD_MANAGEMENT_TABS = [
  'characters',
  'styles',
  'backgrounds',
] as const

export type CardManagementTab = (typeof CARD_MANAGEMENT_TABS)[number]

export interface CardManagementPathOptions {
  tab?: CardManagementTab
}

/** Build a Cards management URL with an optional active tab. */
export function cardManagementPath(
  options: CardManagementPathOptions = {},
): string {
  if (!options.tab) return ROUTES.CARDS
  const params = new URLSearchParams({ tab: options.tab })
  return `${ROUTES.CARDS}?${params.toString()}`
}

/** Build a prompt library URL with the create panel prefilled */
export function promptCreatePath(
  options: PromptCreatePathOptions = {},
): string {
  const params = new URLSearchParams({ create: '1' })
  if (options.name) params.set('name', options.name)
  if (options.prompt) params.set('prompt', options.prompt)
  if (options.negativePrompt)
    params.set('negativePrompt', options.negativePrompt)
  if (options.modelId) params.set('model', options.modelId)
  if (options.provider) params.set('provider', options.provider)
  if (options.outputType) params.set('outputType', options.outputType)
  if (options.generationId) params.set('generationId', options.generationId)
  return `${ROUTES.PROMPTS}?${params.toString()}`
}

export interface StudioImageEditPathOptions {
  generationId?: string
  sourceUrl?: string
  width?: number | null
  height?: number | null
}

function appendStudioImageSourceParams(
  params: URLSearchParams,
  options: StudioImageEditPathOptions,
): void {
  if (options.generationId) params.set('generationId', options.generationId)
  if (options.sourceUrl) params.set('sourceUrl', options.sourceUrl)
  if (options.width) params.set('width', String(options.width))
  if (options.height) params.set('height', String(options.height))
}

/** Build a Canvas image-edit deep link with an optional source preloaded. */
export function studioCanvasEditPath(
  options: StudioImageEditPathOptions = {},
): string {
  const params = new URLSearchParams({ canvasTool: 'image-edit' })
  appendStudioImageSourceParams(params, options)
  return `${ROUTES.STUDIO_NODE}?${params.toString()}`
}

/**
 * Build a legacy Studio image-editor URL with an optional source preloaded.
 *
 * @deprecated Use `studioCanvasEditPath` for new integrations. Existing
 * callers stay on `/studio/edit` until Canvas can ingest every edit task.
 */
export function studioImageEditPath(
  options: StudioImageEditPathOptions = {},
): string {
  const params = new URLSearchParams()
  appendStudioImageSourceParams(params, options)
  const query = params.toString()
  return query ? `${ROUTES.STUDIO_EDIT}?${query}` : ROUTES.STUDIO_EDIT
}

/**
 * 设置页深链。`from` 是「点设置之前站在哪儿」，让设置页的返回键能把用户送回
 * 工作台而不是丢进历史栈。只收站内绝对路径——`//host` 会被浏览器当成协议相对
 * 的外链，所以那一类一并拒掉。
 */
export function settingsPath(
  route: string = ROUTES.SETTINGS,
  from?: string | null,
): string {
  if (!from || !from.startsWith('/') || from.startsWith('//')) return route
  return `${route}?from=${encodeURIComponent(from)}`
}

/** `?from=` 读回来的那一跳——同一条判据，⛔ 别在组件里各写一遍。 */
export function safeReturnPath(from: string | null | undefined): string | null {
  if (!from || !from.startsWith('/') || from.startsWith('//')) return null
  return from
}

/** Type for all route values */
export type Route = (typeof ROUTES)[keyof typeof ROUTES]
