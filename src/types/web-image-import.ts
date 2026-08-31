/**
 * 联网搜图**确认转存**的 schema（P3-B 腿 B）。
 *
 * ── 请求体里为什么只有 URL 和几个来源字段 ──────────────────────────
 * ⛔ **没有、也不许有 base64**（台账 BG：Vercel 4.5MB 硬顶，一张 3.4MB 的图 base64
 * 之后单独就能顶爆一个请求）。客户端手里本来就只有一串第三方地址 —— 它连字节都
 * 没有过，服务端自己去取。所以这条请求永远是几百字节。
 *
 * ── 这几个来源字段不是装饰 ─────────────────────────────────────────
 * `pageUrl` / `domain` / `title` 原样写进 `Generation.snapshot`（现有 `Json?` 字段，
 * ⛔ 零迁移）。策略 C（导演内核边界 7）要求外部资源记来源/抓取时间；选型报告 §三
 * 也写明「落库不存来源信息即违约」。丢掉它们之后没有任何办法补回来 —— 库里那张图
 * 会变成一张来历不明的图。
 */

import { z } from 'zod'

import { WEB_IMAGE_IMPORT_LIMITS } from '@/constants/web-image-import'

export const WebImageImportRequestSchema = z.object({
  /**
   * 要转存的原图直链。
   * ⚠ 服务端仍会过一遍 `assertSafeUrl`（SSRF）—— schema 只保证它长得像 URL，
   * 「它指向哪」是另一回事（内网地址也是合法 URL）。
   */
  imageUrl: z.string().url(),
  /** 图片所在页 —— 来源快照的主要证据。 */
  pageUrl: z.string().url().optional(),
  domain: z
    .string()
    .trim()
    .max(WEB_IMAGE_IMPORT_LIMITS.maxDomainChars)
    .optional(),
  /** 页面标题；落库时当作这条素材的说明文字（prompt 字段）。 */
  title: z
    .string()
    .trim()
    .max(WEB_IMAGE_IMPORT_LIMITS.maxTitleChars)
    .optional(),
})

export type WebImageImportRequest = z.infer<typeof WebImageImportRequestSchema>

/**
 * 写进 `Generation.snapshot` 的那一小块。
 *
 * ⚠ 与 `LoraSourceSnapshotSchema` 同性质：**只写，不在读路径上被解析**。给它一份
 * schema 是为了让写入点有唯一的形状可对（而不是每个调用点自己攒一个对象字面量），
 * 不是为了在读的时候校验历史数据 —— 历史行里没有这一块，拿它去 parse 会全数失败。
 */
export const WebImageImportSourceSnapshotSchema = z.object({
  source: z.string(),
  imageUrl: z.string(),
  pageUrl: z.string().optional(),
  domain: z.string().optional(),
  /** 抓取时刻（ISO）—— 策略 C 点名要的那一项。 */
  retrievedAt: z.string(),
})

export type WebImageImportSourceSnapshot = z.infer<
  typeof WebImageImportSourceSnapshotSchema
>
