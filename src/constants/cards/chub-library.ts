/**
 * **酒馆卡库**（角色页「卡库」页签，owner 2026-10-14 选「角色页里加 tab」）：站内搜
 * chub.ai 上别人做好的酒馆卡，点一下就建成我们的角色卡。
 *
 * ⚠ chub 没有公开的接口文档。下面的地址、请求头与字段照 SillyTavern 自己的实现
 * （`src/endpoints/content-manager.js` 的 `downloadChubCharacter`）与社区脚本；
 * 改之前先对一遍它们。
 */
export const CHUB_LIBRARY = {
  /** 搜索：`?search=&first=&page=&sort=&asc=false&nsfw=false`，回 `{ data: { count, nodes } }`。 */
  SEARCH_URL: 'https://api.chub.ai/search',
  /** 一张卡的完整定义：`/<作者>/<卡名>?full=true`，回 `{ node: { definition, topics, max_res_url } }`。 */
  CHARACTER_URL: 'https://api.chub.ai/api/characters',
  /** 卡在 chub 站上的页面（「在 chub 查看」）。 */
  SITE_URL: 'https://chub.ai/characters',
  /** 搜索结果里没给头像地址时按路径拼。 */
  AVATAR_URL: 'https://avatars.charhub.io/avatars',
  /** 酒馆请求 chub 时带的 UA（chub 认它）。 */
  USER_AGENT: 'SillyTavern',
  PAGE_SIZE: 24,
  /** 最多翻到第几页（再往后没人看，也挡住拿翻页刷上游）。 */
  MAX_PAGE: 50,
  QUERY_MAX_LENGTH: 100,
  /** `作者/卡名` 最长多少字。 */
  FULL_PATH_MAX_LENGTH: 200,
  TIMEOUT_MS: 8000,
  /** 卡图上限（存成第一张参考图）。 */
  IMAGE_MAX_BYTES: 8 * 1024 * 1024,
  /** 卡图只从这几个域名拿（⛔ 跟着上游给的任意地址去取）。 */
  IMAGE_HOST_SUFFIXES: ['charhub.io', 'chub.ai'],
  IMAGE_MIME_TYPES: ['image/png', 'image/webp', 'image/jpeg'],
  /** chub 的标签树根，不是真标签。 */
  ROOT_TOPIC: 'ROOT',
  /** 卡片上显示几个标签。 */
  TILE_TAGS: 3,
  /** 角色页 `?tab=library` 打开卡库。 */
  TAB_PARAM: 'tab',
} as const

/** 卡库排序：键是我们的，值是 chub 的 `sort`。 */
export const CHUB_LIBRARY_SORTS = {
  popular: 'download_count',
  recent: 'last_activity_at',
} as const

export type ChubLibrarySort = keyof typeof CHUB_LIBRARY_SORTS

export const CHUB_LIBRARY_SORT_KEYS = Object.keys(CHUB_LIBRARY_SORTS) as [
  ChubLibrarySort,
  ...ChubLibrarySort[],
]

/** 角色页两个页签。 */
export const CHARACTER_PAGE_TABS = {
  roster: 'roster',
  library: 'library',
} as const

export type CharacterPageTab =
  (typeof CHARACTER_PAGE_TABS)[keyof typeof CHARACTER_PAGE_TABS]

/** 卡库失败的几种原因（前端按 `i18nKey` 说人话，`Errors.chubLibrary.*`）。 */
export const CHUB_LIBRARY_ERRORS = {
  unavailable: {
    code: 'CHUB_UNAVAILABLE',
    httpStatus: 502,
    i18nKey: 'errors.chubLibrary.unavailable',
    message: 'chub.ai did not answer. Try again in a moment.',
  },
  notFound: {
    code: 'CHUB_CARD_NOT_FOUND',
    httpStatus: 404,
    i18nKey: 'errors.chubLibrary.notFound',
    message: 'That card is no longer on chub.ai.',
  },
} as const
