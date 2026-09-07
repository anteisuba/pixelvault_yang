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
 * ── 四档，判据是「我们知道什么」而不是「有多安全」 ────────────────
 *  · `blocked` —— 站方明令禁 AI 训练/生成，或整站是无法溯源的转载聚合。
 *    候选照样**画出来**（用户点开原页去看是他的自由），但「选用」那颗按钮关掉。
 *  · `hotlinkProtected` —— 版权说不上话，纯粹是**取不回来**（热链保护）。同样画出来、
 *    同样关掉按钮，但理由那一行说的是另一件事（2026-09-07 真机，见该档头注）。
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
  /**
   * 站方**技术上**就不让外部取这张图（Referer 强校验 / JS challenge）。
   *
   * ⭐ 由来（2026-09-07 真机）：16 个候选格里 4 个点「选用」变「重试」——
   * 这几张的共同点不是版权，是**热链保护**：直链在浏览器里能开（带着站内
   * Referer），我们的服务端一取就 403。让用户点下去再失败，等于把一次注定
   * 失败的往返写成了一颗看起来能按的按钮。
   * ⚠ 与 `blocked` 分开而不是并进去：那一档说的是「站方不许」，这一档说的是
   *   「取不回来」——⛔ 两句话不能互相冒充，用户按这句话决定要不要去别处找。
   */
  hotlinkProtected: 'hotlinkProtected',
} as const

export const WEB_IMAGE_SOURCE_VERDICTS = [
  WEB_IMAGE_SOURCE_VERDICT_IDS.allowed,
  WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense,
  WEB_IMAGE_SOURCE_VERDICT_IDS.blocked,
  WEB_IMAGE_SOURCE_VERDICT_IDS.hotlinkProtected,
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
 * **热链保护**的站：图能在浏览器里看，服务端直取一律拒（切片 3b 续，2026-09-07）。
 *
 * ⚠ 判据是「**我们实际取不到**」，不是「这个站的图不该用」——⛔ 别把版权判断
 * 混进来，那是上面那张表的事。每一条都要写得出拒的是什么机制。
 * ⚠ 页面域与图床域**两个都写**：判定喂进来的是 `domain ?? pageUrl`（作品页域），
 * 而同一份判据在别处也可能拿到图床主机名 —— 两边都命中才不会分岔。
 * ⚠ 这张表**只增不猜**：拿不准的留在未知档，让用户去试。误标一条的代价是一张
 * 本来能用的图被我们提前关掉，而用户根本不知道它本来可以。
 */
export const WEB_IMAGE_SOURCE_HOTLINK_LIST = [
  /** pixiv：图床对非站内 Referer 一律 403，这是它最出名的一条规则。 */
  'pixiv.net',
  'pximg.net',
  /** 微博图床按 Referer 拒外链（换域也一样）。 */
  'weibo.com',
  'weibo.cn',
  'sinaimg.cn',
  /** 知乎图床同上。 */
  'zhihu.com',
  'zhimg.com',
  /** 小红书：图床带签名参数且校验来源。 */
  'xiaohongshu.com',
  'xhscdn.com',
  /** B 站图床（`hdslb`）对外链取图返回 403。 */
  'bilibili.com',
  'hdslb.com',
  /** Instagram / Facebook 的 CDN 走短时签名，服务端直取拿到的是过期链接。 */
  'instagram.com',
  'cdninstagram.com',
  'fbcdn.net',
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

/**
 * `www.` 只是个门牌，判定前先摘掉。
 *
 * ⚠ 导出是给 `constants/research.ts` 的证据分级用的（同一套「域名 → 这是谁」的
 * 读法），⛔ 别在第二处再抄一份 —— 两份 host 归一化迟早在 `www.` 这种小事上分岔。
 */
export function normalizeHostname(host: string): string {
  const lower = host.trim().toLowerCase()
  return lower.startsWith('www.') ? lower.slice(4) : lower
}

/**
 * `example.com` = 该域及其子域；`example.*` = 该二级标签配任意 TLD 与任意子域。
 *
 * ⚠ 用 `endsWith('.' + p)` 而不是 `includes(p)`：`notpinterest.com` 不该命中
 * `pinterest.*`，而 `includes` 会。
 */
export function matchesHostPattern(host: string, pattern: string): boolean {
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
  host = normalizeHostname(host)
  if (!host) return WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense

  if (
    WEB_IMAGE_SOURCE_BLOCKLIST.some((pattern) =>
      matchesHostPattern(host, pattern),
    )
  ) {
    return WEB_IMAGE_SOURCE_VERDICT_IDS.blocked
  }
  /**
   * ⚠ 热链档判在**白名单之前**：一个站完全可以既是官方社区、又对外链取图 403，
   * 而那时用户要读到的是「取不回来」而不是「出处清楚」——⛔ 后者会让他去点一颗
   * 注定失败的按钮。
   */
  if (
    WEB_IMAGE_SOURCE_HOTLINK_LIST.some((pattern) =>
      matchesHostPattern(host, pattern),
    )
  ) {
    return WEB_IMAGE_SOURCE_VERDICT_IDS.hotlinkProtected
  }
  if (
    WEB_IMAGE_SOURCE_ALLOWLIST.some((pattern) =>
      matchesHostPattern(host, pattern),
    )
  ) {
    return WEB_IMAGE_SOURCE_VERDICT_IDS.allowed
  }
  return WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense
}

/**
 * 这一档能不能当生成输入。
 *
 * ⚠ 不能的是两档：`blocked`（站方不许）与 `hotlinkProtected`（我们取不回来）。
 * 未知档**可以**。写成一句谓词是为了让服务端拒绝、客户端禁用、格子文案三处
 * 读的是同一句话。
 */
export function isWebImageSourceUsableAsInput(
  verdict: WebImageSourceVerdict,
): boolean {
  return (
    verdict !== WEB_IMAGE_SOURCE_VERDICT_IDS.blocked &&
    verdict !== WEB_IMAGE_SOURCE_VERDICT_IDS.hotlinkProtected
  )
}

/**
 * 不可用那两档各自的**说给用户听的那句话**（键相对 `StudioOperator` 命名空间）。
 *
 * ⚠ 写成**全档**的表而不是只列两条：`Record<WebImageSourceVerdict, …>` 让「verdict
 * 加了一档而文案没跟上」在编译期就红。可用的那两档填的是同一句兜底文案 ——
 * 它们根本走不到这行（按钮没禁用就不画这句），⛔ 别为此把表做成可选。
 */
export const WEB_IMAGE_SOURCE_NOT_USABLE_MESSAGE_KEYS: Record<
  WebImageSourceVerdict,
  string
> = {
  [WEB_IMAGE_SOURCE_VERDICT_IDS.allowed]: 'web.notUsable',
  [WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense]: 'web.notUsable',
  [WEB_IMAGE_SOURCE_VERDICT_IDS.blocked]: 'web.notUsable',
  [WEB_IMAGE_SOURCE_VERDICT_IDS.hotlinkProtected]: 'web.notUsableHotlink',
}

/**
 * 排序用的**来源优先级**（助手检索线，2026-09-06）。
 *
 * ⚠ 它与 `judgeWebImageSource` 是同一张表的两种读法，⛔ 不是第二张名单：
 * 那个函数答「这一张能不能按下选用」，这个答「先给用户看哪一张」。
 * 找角色官方设定图时，wiki / 官方社区那几张必须排在转载站前面 —— 不排的表现是
 * 候选行第一屏全是图床缩略图，用户以为「没找到官方图」而其实它在第三行。
 *
 * 数越小越靠前。`blocked` 排最后而**不是剔除**：用户照样有权点开原页去看
 * （与格子上「禁用而不是移除」是同一条纪律）。
 */
export function webImageSourceRank(
  hostOrUrl: string | null | undefined,
): number {
  const verdict = judgeWebImageSource(hostOrUrl)
  if (verdict === WEB_IMAGE_SOURCE_VERDICT_IDS.allowed) return 0
  if (verdict === WEB_IMAGE_SOURCE_VERDICT_IDS.unknownLicense) return 1
  return 2
}
