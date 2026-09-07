/**
 * 联网搜图的**第二条腿**：用户点选一张候选之后，把它转存进自己的 R2（P3-B）。
 *
 * ── 为什么它不和 `web-search.ts` 住一起 ─────────────────────────────
 * 那份是「搜」，这份是「存」，而两者**故意分在两条链上**：搜索长在助手的工具环里
 * （服务端多步 LLM），转存长在一条普通 API 路由上（auth → Zod → service）。
 * 助手自己永远不落库 —— owner 2026-08-30 原话「用户确定了再落 R2」。工具环那边有
 * 一份 import 白名单（`assistant-operator.money-gate.test.ts`）挡着，让搜索模块
 * 顺手把上传模块也拖进去，那份白名单就白写了。
 *
 * ── 这里为什么不列「可信来源域名」白名单 ───────────────────────────
 * 通用图搜的结果来自整个互联网，域名白名单要么形同虚设、要么把它变成一个只能搜
 * 五个站的功能。真正的闸在别处，且都已存在：`assertSafeUrl` / `safeFetch`（SSRF）、
 * `detectTrustedImageMime`（拿 libvips 的魔数判型，⛔ 不信 content-type）、
 * 下面这个字节上限，以及**强制 `isPublic:false`**（选型报告 §四的硬闸：
 * 通用档导入的图不进公开画廊）。
 */

/**
 * 转存时的礼仪 UA。
 *
 * 🔬 选型报告实测：**wikimedia 对空 UA 直接 403**，带「项目名 + 联系方式」的 UA
 * 才 200。格式照抄 `RESEARCH_USER_AGENT`（MediaWiki 官方礼仪要求的那一种），
 * ⛔ **不伪装浏览器** —— 伪装是为了绕过对方的意愿，礼仪 UA 是为了让对方能找到我们。
 *
 * ⚠ 这个字符串会发给**任意第三方图床**，所以里面只能有项目自己的联系方式，
 * ⛔ 绝不能放用户的邮箱/账号。
 */
export const WEB_IMAGE_IMPORT_USER_AGENT =
  'PixelVaultImport/1.0 (https://github.com/pixelvault; user-directed image import)'

/**
 * 一张联网候选最多允许多少字节。
 *
 * 与 `USER_UPLOAD_MAX_BYTES`（15MB）**有意分开**：那个数是「用户自己选的文件」的
 * 业务上限，这个数管的是「从一个我们控制不了的域名下载回来的东西」。给 20MB 是
 * 因为搜索结果里常有 4K 原图，而它仍然是一个明确的上限 —— ⛔ 不能没有：
 * `uploadFromHttpToR2` 那条流式路径没有任何字节闸，一个 500MB 的地址就能把
 * serverless 函数的时间和 R2 的账单一起吃掉。
 */
export const WEB_IMAGE_IMPORT_MAX_BYTES = 20 * 1024 * 1024

/**
 * 来源快照里的 `source` 值 —— 写进 `Generation.snapshot`（现有 `Json?` 字段，
 * ⛔ 零迁移）。
 *
 * ⚠ 它记的是**这张图是从哪条召回路径来的**，不是图的版权方。策略 C（导演内核
 * 边界 7）要求记来源/抓取时间，这一条加上 `pageUrl` / `domain` / `retrievedAt`
 * 就是那份记录。将来接第二路召回（Wikimedia Commons / Met，见选型报告附录）时
 * 这里会多一个值，所以它是一张表不是一个字面量。
 */
export const WEB_IMAGE_IMPORT_SOURCE_IDS = {
  serper: 'serper',
} as const

export type WebImageImportSourceId =
  (typeof WEB_IMAGE_IMPORT_SOURCE_IDS)[keyof typeof WEB_IMAGE_IMPORT_SOURCE_IDS]

/**
 * 「这个地址返回的是一张**网页**」的判据（P3-D，拍板 22）。
 *
 * ⚠ 判的是 **content-type**，⛔ 不是扩展名（台账 BH：`/api/upload-image` 的产物
 * 一律 `.png` 后缀，按扩展名判型在本仓已经错过一次）。用户粘过来的地址十有八九
 * 是一个作品页 / 商品页，而不是原图直链 —— 那些页面的地址常常长得像图片
 * （`.../photo/12345`），只有 content-type 说得准。
 */
export const WEB_IMAGE_IMPORT_HTML_MIME_PREFIXES = [
  'text/html',
  'application/xhtml',
] as const

/**
 * 网页正文里往前扫多少字节去找 `og:image`。
 *
 * ⚠ 那两个 meta 标签按规范住在 `<head>` 里，而现代页面的 `<body>` 动辄几 MB ——
 * 全文扫是把一次正则跑在一个我们控制不了的字符串上。256KB 足够覆盖任何正常的
 * `<head>`，⛔ 别为了「万一有人把 meta 写在页尾」把它调大。
 */
export const WEB_IMAGE_IMPORT_HTML_SCAN_BYTES = 256 * 1024

/** 来源快照里几个字符串字段的长度上限（纯载荷护栏）。 */
export const WEB_IMAGE_IMPORT_LIMITS = {
  maxTitleChars: 200,
  maxDomainChars: 200,
} as const

/**
 * 转存失败的**原因码**（2026-09-07 真机）。
 *
 * ⭐ 由来：16 个候选格里 4 个点「选用」变「重试」，而界面上只有一句「这张图所在的
 * 站点不让我们下载它」—— 403、404、429、上游 500、超时、格式不对，六件不同的事
 * 说成同一句话。用户读不出「换一张」和「等一下再试」的区别，我们也读不出这条
 * 来源到底怎么了。
 *
 * ⚠ 每一档都要有**自己的下一步动作**，写不出下一步的档不该单独存在（那就是
 * `unreachable` 兜底那一档在干的活）。
 */
export const WEB_IMAGE_IMPORT_FAILURE_IDS = {
  /** 401 / 403 —— 站方拒了我们这次取图（热链保护 / 反爬）。 */
  forbidden: 'WEB_IMAGE_IMPORT_FORBIDDEN',
  /** 404 / 410 —— 这条直链已经不在了（搜索引擎的缓存比原站活得久）。 */
  notFound: 'WEB_IMAGE_IMPORT_NOT_FOUND',
  /** 429 —— 打得太密，等一下再试是有意义的。 */
  rateLimited: 'WEB_IMAGE_IMPORT_RATE_LIMITED',
  /** 5xx —— 对面站坏了，与这张图无关。 */
  serverError: 'WEB_IMAGE_IMPORT_SERVER_ERROR',
  /** 连不上 / 超时。 */
  timeout: 'WEB_IMAGE_IMPORT_TIMEOUT',
  /** 超过字节上限。 */
  tooLarge: 'WEB_IMAGE_IMPORT_TOO_LARGE',
  /** 其余全部 —— ⛔ 别让它长大：说得清的都该有自己的一档。 */
  unreachable: 'WEB_IMAGE_IMPORT_UNREACHABLE',
} as const

export type WebImageImportFailureId =
  (typeof WEB_IMAGE_IMPORT_FAILURE_IDS)[keyof typeof WEB_IMAGE_IMPORT_FAILURE_IDS]

/**
 * 原因码 → HTTP 状态 + 文案键。
 *
 * ⚠ 状态码**照搬上游的语义而不是原样透传**：站方的 404 对我们这条路由来说是
 * 「你给的这条来源取不到」（502 家族），⛔ 不能变成「这条 API 路由不存在」。
 * 唯一的例外是 429：那一档原样传下去，客户端的重试语义才对得上。
 */
export const WEB_IMAGE_IMPORT_FAILURES: Record<
  WebImageImportFailureId,
  { status: number; i18nKey: string }
> = {
  [WEB_IMAGE_IMPORT_FAILURE_IDS.forbidden]: {
    status: 502,
    i18nKey: 'errors.webImageImport.forbidden',
  },
  [WEB_IMAGE_IMPORT_FAILURE_IDS.notFound]: {
    status: 502,
    i18nKey: 'errors.webImageImport.notFound',
  },
  [WEB_IMAGE_IMPORT_FAILURE_IDS.rateLimited]: {
    status: 429,
    i18nKey: 'errors.webImageImport.rateLimited',
  },
  [WEB_IMAGE_IMPORT_FAILURE_IDS.serverError]: {
    status: 502,
    i18nKey: 'errors.webImageImport.serverError',
  },
  [WEB_IMAGE_IMPORT_FAILURE_IDS.timeout]: {
    status: 504,
    i18nKey: 'errors.webImageImport.timeout',
  },
  [WEB_IMAGE_IMPORT_FAILURE_IDS.tooLarge]: {
    status: 502,
    i18nKey: 'errors.webImageImport.tooLarge',
  },
  [WEB_IMAGE_IMPORT_FAILURE_IDS.unreachable]: {
    status: 502,
    i18nKey: 'errors.webImageImport.unreachable',
  },
}

/**
 * 从**取字节那一步抛出来的那句话**里读出原因码。
 *
 * ⚠ 判的是 `fetchAsBuffer` 自己造的两种句子（`Failed to fetch image (NNN): url`
 * 与 `... exceeds maximum size ...`）与 undici / AbortSignal 的超时名 ——
 * ⛔ 不是任意上游文案的模糊匹配：读不出来的一律落 `unreachable`，那才是诚实的
 * 「不知道」。
 * ⚠ 状态码用 `(\d{3})` 从括号里取：⛔ 别去 `includes('403')`，URL 里带 403 的
 * 路径是真的存在。
 */
export function classifyWebImageImportFailure(
  message: string,
): WebImageImportFailureId {
  if (message.includes('exceeds maximum size')) {
    return WEB_IMAGE_IMPORT_FAILURE_IDS.tooLarge
  }
  if (/timeout|timed out|aborted|ETIMEDOUT/i.test(message)) {
    return WEB_IMAGE_IMPORT_FAILURE_IDS.timeout
  }
  const status = Number.parseInt(
    /Failed to fetch image \((\d{3})\)/.exec(message)?.[1] ?? '',
    10,
  )
  if (Number.isFinite(status)) {
    if (status === 401 || status === 403) {
      return WEB_IMAGE_IMPORT_FAILURE_IDS.forbidden
    }
    if (status === 404 || status === 410) {
      return WEB_IMAGE_IMPORT_FAILURE_IDS.notFound
    }
    if (status === 429) return WEB_IMAGE_IMPORT_FAILURE_IDS.rateLimited
    if (status >= 500) return WEB_IMAGE_IMPORT_FAILURE_IDS.serverError
  }
  return WEB_IMAGE_IMPORT_FAILURE_IDS.unreachable
}
