/**
 * 匿名请求的限流键：取调用方 IP。
 *
 * 部署在 Vercel：边缘会**覆写** `x-real-ip` / `x-forwarded-for`，客户端伪造不了
 * 第一跳。本地或别的环境没有这两个头时退回一个固定键 —— 宁可所有匿名请求共用一个
 * 桶，也不能因为取不到 IP 就不限。
 */
export function getClientIp(headers: Headers): string {
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || 'unknown'
}
