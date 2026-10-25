/**
 * **酒馆卡库**（角色页「卡库」页签，owner 2026-10-14 选「角色页里加 tab」）：站内搜
 * chub.ai 上别人做好的酒馆卡，点一下就建成我们的角色卡。
 *
 * ⚠ chub 没有公开的接口文档。下面的地址与字段照 SillyTavern 自己的实现
 * （`src/endpoints/content-manager.js` 的 `downloadChubCharacter`）与社区脚本；
 * 改之前先对一遍它们。
 *
 * ⚠ **api.chub.ai 由用户的浏览器直接去问**（搜索、取一张卡的定义），⛔ 走我们的服务端：
 * chub 的 Cloudflare 拒云厂商 / 机房 IP（2026-10-15 从 Vercel 东京、弗吉尼亚实测都是
 * 403「This service is not available in your country.」），而它对任何来源都回
 * `access-control-allow-origin: *`。建卡仍在服务端（浏览器把取到的 `node` 递上去）；
 * 卡图床 avatars.charhub.io 从机房能取，服务端照旧去拿卡图。
 */
export const CHUB_LIBRARY = {
  /** 搜索：`?search=&first=&page=&sort=&asc=false&nsfw=false`，回 `{ data: { count, nodes } }`。 */
  SEARCH_URL: 'https://api.chub.ai/search',
  /** 一张卡的完整定义：`/<作者>/<卡名>?full=true`，回 `{ node: { definition, topics, max_res_url } }`。 */
  CHARACTER_URL: 'https://api.chub.ai/api/characters',
  /** 卡在 chub 站上的页面（「在 chub 查看」）。 */
  SITE_URL: 'https://chub.ai/characters',
  /** 库左栏「卡库」那一行写在计数位置的来源（ui-spec §9「库」：公开的来源写在计数的位置）。 */
  SOURCE_LABEL: 'chub.ai',
  /** 搜索结果里没给头像地址时按路径拼。 */
  AVATAR_URL: 'https://avatars.charhub.io/avatars',
  PAGE_SIZE: 24,
  /** 最多翻到第几页（再往后没人看，也挡住拿翻页刷上游）。 */
  MAX_PAGE: 50,
  QUERY_MAX_LENGTH: 100,
  /** `作者/卡名` 最长多少字。 */
  FULL_PATH_MAX_LENGTH: 200,
  /**
   * 浏览器递上来建卡的那张卡（`node`）当用户输入看：长文各格与整张卡（序列化后）沿用
   * 文件导入的 `TAVERN_CARD.MAX_FILE_BYTES`；下面是 chub 自己那几格短字段的上限。
   */
  NODE_LIMITS: {
    NAME: 200,
    TOPIC: 100,
    /** 标签、备选开场白各最多几条（落格时备选开场白还会再截到 20）。 */
    LIST_ITEMS: 200,
    URL: 2048,
  },
  /** 问 chub、取卡图的超时（浏览器与服务端同一个）。 */
  TIMEOUT_MS: 8000,
  /** chub 拒这个网络时 403 的正文（小写比对）。 */
  COUNTRY_BLOCK_TEXT: 'not available in your country',
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

/**
 * 卡库「标签 ▾」里列的标签（owner 2026-10-17 要做）：chub 上最常见的那几个，原样传给
 * 搜索的 `topics`（chub 的标签是英文，按原文显示）。
 */
export const CHUB_LIBRARY_TAGS = [
  'Female',
  'Male',
  'Anime',
  'Original Character',
  'Game Characters',
  'Fantasy',
  'Romance',
  'Roleplay',
  'Scenario',
  'Sci-Fi',
  'Horror',
  'Comedy',
  'Monster Girl',
  'Vtuber',
] as const

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

/**
 * 卡库失败的几种原因（前端按 `i18nKey` 说人话，`Errors.chubLibrary.*`）。除 `notFound`
 * 外都只在浏览器那一侧判（问 chub 的是浏览器）；服务端只在递上来的卡拼不出名字时报
 * `notFound`。
 */
export const CHUB_LIBRARY_ERRORS = {
  unavailable: {
    code: 'CHUB_UNAVAILABLE',
    i18nKey: 'errors.chubLibrary.unavailable',
    message: 'chub.ai did not answer. Try again in a moment.',
  },
  /** chub 的 403「not available in your country」：照实说是这个网络连不上。 */
  countryBlocked: {
    code: 'CHUB_COUNTRY_BLOCKED',
    i18nKey: 'errors.chubLibrary.countryBlocked',
    message: 'chub.ai is not available from this network.',
  },
  notFound: {
    code: 'CHUB_CARD_NOT_FOUND',
    httpStatus: 404,
    i18nKey: 'errors.chubLibrary.notFound',
    message: 'That card is no longer on chub.ai.',
  },
  /** 整张卡超过文件导入的上限（`TAVERN_CARD.MAX_FILE_BYTES`）。 */
  tooLarge: {
    code: 'CHUB_CARD_TOO_LARGE',
    i18nKey: 'errors.chubLibrary.tooLarge',
    message: 'That card is over 3 MB.',
  },
} as const

export type ChubLibraryErrorKind = keyof typeof CHUB_LIBRARY_ERRORS
