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
