/**
 * 一张联网候选**能不能当生成输入**的判据（切片 3b）。
 *
 * ── ⚠ 这是一条启发式，**不是法律判断** ──────────────────────────────
 * 域名说不出版权归属：同一个站上既有官方发布的设定图，也有转载。这里做的只有
 * 一件事——把「站方自己写明不许拿去喂模型」和「整站都是无出处转载」这两类**先标
 * 出来**，让用户在按「选用」之前看得见。⛔ 它不构成授权，也不替用户承担判断：
 * 白名单上的图照样可能是别人的作品，未知档更是明说「不知道」。真正的许可要看
 * 图所在页自己怎么写。
 *
 * ── 三档，判据是「我们知道什么」而不是「有多安全」 ────────────────
 *  · `blocked` —— 站方明令禁 AI 训练/生成，或整站是无法溯源的转载聚合。
 *    候选照样**画出来**（用户点开原页去看是他的自由），但「选用」那颗按钮关掉。
 *  · `allowed` —— 官方 wiki / 官方社区 / 自由许可百科这类**发布方就是权利方**的站。
 *  · `unknownLicense` —— 其余全部。**可用**（互联网上绝大多数站都在这一档，
 *    默认拦下来等于把这个功能关掉），但格子上标一句「许可未知」。
 *
 * ⛔ 别把这张表做成「可信来源白名单」那种闸：`constants/web-image-import.ts` 头注
 * 里已经写过为什么通用图搜不做域名白名单——真正的闸是 SSRF / 魔数判型 / 字节上限 /
 * 强制 `isPublic:false`，那几道都还在。这张表管的是**说给用户听的那句话**。
 */

export const WEB_IMAGE_SOURCE_VERDICT_IDS = {
  /** 发布方就是权利方，看得见出处。 */
  allowed: 'allowed',
  /** 不知道是谁的——可用，但标出来。 */
  unknownLicense: 'unknownLicense',
  /** 站方禁 AI，或整站溯源不到原作者。 */
  blocked: 'blocked',
} as const

export const WEB_IMAGE_SOURCE_VERDICTS = [
  WEB_IMAGE_SOURCE_VERDICT_IDS.allowed,
  WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense,
  WEB_IMAGE_SOURCE_VERDICT_IDS.blocked,
] as const

export type WebImageSourceVerdict = (typeof WEB_IMAGE_SOURCE_VERDICTS)[number]

/**
 * 拿不来当生成输入的站。
 *
 * ⚠ 每一条都要写得出**为什么**——写不出理由的条目就是凭印象拉黑，而被拉黑的站
 * 上的图用户是真的按不下去那颗按钮的。
 * ⚠ `foo.*` 形式匹配任意 TLD 与任意子域（`de.pinterest.co.uk` 也算）。
 */
export const WEB_IMAGE_SOURCE_BLOCKLIST = [
  /** 站方 ToS 明令禁止把站上作品用于 AI 训练/生成。 */
  'artstation.com',
  /** 作品页带 NoAI 标记，站方对 AI 数据集是拒绝态度。 */
  'deviantart.com',
  /** 纯转载聚合：一张图在这里通常已经离原作者三四手，追不到出处。 */
  'pinterest.*',
  'pin.it',
  /** 授权制图库——未授权的原图本来就不该拿去当输入，缩略图上还压着水印。 */
  'gettyimages.*',
  'shutterstock.com',
  'istockphoto.com',
  'alamy.com',
] as const

/**
 * 发布方就是权利方的站——官方 wiki / 官方社区 / 自由许可百科。
 *
 * ⚠ 命中它只意味着「出处是清楚的」，⛔ 不意味着「随便用」：维基上的图各有各的
 * 许可，官方设定图也仍然是官方的。判定表上它与未知档的差别只有那一行小字。
 */
export const WEB_IMAGE_SOURCE_ALLOWLIST = [
  /** 自由许可百科与它的媒体库。 */
  'wikipedia.org',
  'wikimedia.org',
  /** 作品 wiki 的事实标准落点，图基本来自游戏/动画本体素材。 */
  'fandom.com',
  /** 库街区——库洛游戏（鸣潮 / 战双）官方社区，一手设定图就发在这儿。 */
  'kurobbs.com',
  /** 米哈游官方站与官方社区。 */
  'mihoyo.com',
  'hoyoverse.com',
  'hoyolab.com',
] as const

/** `www.` 只是个门牌，判定前先摘掉。 */
function normalizeHost(host: string): string {
  const lower = host.trim().toLowerCase()
  return lower.startsWith('www.') ? lower.slice(4) : lower
}

/**
 * `example.com` = 该域及其子域；`example.*` = 该二级标签配任意 TLD 与任意子域。
 *
 * ⚠ 用 `endsWith('.' + p)` 而不是 `includes(p)`：`notpinterest.com` 不该命中
 * `pinterest.*`，而 `includes` 会。
 */
function matchesPattern(host: string, pattern: string): boolean {
  if (pattern.endsWith('.*')) {
    const label = pattern.slice(0, -2)
    return (
      host === label ||
      host.startsWith(`${label}.`) ||
      host.includes(`.${label}.`)
    )
  }
  return host === pattern || host.endsWith(`.${pattern}`)
}

/**
 * 一个域名（或一条完整 URL）落在哪一档。
 *
 * ⚠ 取不到域名时按 `unknownLicense`——⛔ 不按 `blocked`：搜索引擎偶尔漏给 `domain`，
 * 把那些候选一律关掉，用户看到的是「这一行的按钮怎么全是灰的」，而原因与版权无关。
 */
export function judgeWebImageSource(
  hostOrUrl: string | null | undefined,
): WebImageSourceVerdict {
  if (!hostOrUrl) return WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense

  let host = hostOrUrl.trim()
  if (host.includes('/')) {
    try {
      host = new URL(host).hostname
    } catch {
      return WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense
    }
  }
  host = normalizeHost(host)
  if (!host) return WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense

  if (
    WEB_IMAGE_SOURCE_BLOCKLIST.some((pattern) => matchesPattern(host, pattern))
  ) {
    return WEB_IMAGE_SOURCE_VERDICT_IDS.blocked
  }
  if (
    WEB_IMAGE_SOURCE_ALLOWLIST.some((pattern) => matchesPattern(host, pattern))
  ) {
    return WEB_IMAGE_SOURCE_VERDICT_IDS.allowed
  }
  return WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense
}

/**
 * 这一档能不能当生成输入。
 *
 * ⚠ 只有 `blocked` 是不能——未知档**可以**。三档里唯一被禁的那一档写成一句谓词，
 * 是为了让服务端拒绝、客户端禁用、格子文案三处读的是同一句话。
 */
export function isWebImageSourceUsableAsInput(
  verdict: WebImageSourceVerdict,
): boolean {
  return verdict !== WEB_IMAGE_SOURCE_VERDICT_IDS.blocked
}
