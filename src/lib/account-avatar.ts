import { z } from 'zod'

/**
 * 账号头像的**两条规则**（ui-spec §9 Avatar ㉗，owner 11-04）——只此一份：
 *
 * 1. Clerk 自动生成的那张渐变小人**不算头像**：它是「这个人没传图」时 Clerk 自己画的，
 *    存进库里以后看起来像一张真头像（左下角那颗紫色小人就是它）。
 * 2. 没头像 → 浅灰底写名字第一个字（`accountInitial`）。
 *
 * ── Clerk 默认图怎么认 ─────────────────────────────────────────────
 * ⭐ 写入口（登录同步 · webhook · 头像刷新）认 Clerk 官方的 `hasImage` / `has_image`：
 *   `false` = Clerk 在替他画头像 → 存 `null`。这是唯一硬判据。
 * ⚠ 显示侧只拿得到库里那条地址：库里已经存着的默认图（11-04 之前同步进来的）
 *   靠地址认 —— `img.clerk.com/<base64url JSON>`，JSON 的 `type` 为 `default` 即默认图，
 *   用户自己传的 / OAuth 带来的是 `proxy`。⛔ 不去改库（本机连的就是生产库）。
 * ⛔ 认不出来（不是 Clerk 的地址、解不开）一律当真头像：宁可漏认一张默认图，
 *   也别把用户自己的图吞掉。
 */

const CLERK_IMAGE_HOST = 'img.clerk.com'

const ClerkImagePayloadSchema = z.object({ type: z.string() })

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** 这条地址是不是 Clerk 自动生成的默认头像（见文件头的判据）。 */
export function isClerkDefaultAvatarUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.hostname !== CLERK_IMAGE_HOST) return false
  const segment = parsed.pathname.split('/').find(Boolean)
  if (!segment) return false
  try {
    const payload = ClerkImagePayloadSchema.safeParse(
      JSON.parse(decodeBase64Url(segment)),
    )
    return payload.success && payload.data.type === 'default'
  } catch {
    return false
  }
}

/** 真正要画的那张图：没有 / 是 Clerk 默认图 → `null`（由渲染方画首字）。 */
export function accountAvatarSrc(
  url: string | null | undefined,
): string | null {
  if (!url) return null
  return isClerkDefaultAvatarUrl(url) ? null : url
}

/**
 * 写入口用：Clerk 说他有图才存地址（`hasImage` 是 Clerk 官方字段，见文件头）。
 */
export function clerkAvatarToStore(
  imageUrl: string | null | undefined,
  hasImage: boolean,
): string | null {
  return hasImage && imageUrl ? imageUrl : null
}

/** 名字第一个字（按字符不按 UTF-16 单元，emoji / 生僻字不劈半）；没名字 → `null`。 */
export function accountInitial(name: string | null | undefined): string | null {
  const first = Array.from(name?.trim() ?? '')[0]
  return first ? first.toUpperCase() : null
}
