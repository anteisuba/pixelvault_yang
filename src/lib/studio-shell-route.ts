import {
  ROUTES,
  STUDIO_CONVERSATION_QUERY,
  studioConversationPath,
} from '@/constants/routes'
import {
  STUDIO_LIBRARY_CATEGORY_IDS,
  STUDIO_SHELL_PAGE_ROUTES,
  type StudioLibraryCategoryId,
  type StudioShellRouteKind,
} from '@/constants/studio-shell'

/**
 * `/studio` 外壳的地址规则（第 9f 步方向 E）。纯函数：`pathname` 是不带语言前缀的那一段
 * （next-intl 的 `usePathname()`）。
 */

const CONVERSATION_PREFIX = `${ROUTES.STUDIO_CONVERSATION}/`

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function studioShellRouteKind(pathname: string): StudioShellRouteKind {
  if (underPrefix(pathname, ROUTES.LIBRARY)) return 'library'
  if (
    pathname === ROUTES.STUDIO ||
    underPrefix(pathname, ROUTES.STUDIO_CONVERSATION)
  )
    return 'home'
  if (STUDIO_SHELL_PAGE_ROUTES.some((route) => underPrefix(pathname, route)))
    return 'page'
  return 'bench'
}

/** `/studio/c/<编号>` 里的编号；不是这条路 = `null`。 */
export function conversationIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith(CONVERSATION_PREFIX)) return null
  const raw = pathname.slice(CONVERSATION_PREFIX.length).split('/')[0]
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

/** 只有对话那一页：有编号去 `/studio/c/<编号>`，还没落过库就回首页。 */
export function studioConversationHref(sessionId: string | null): string {
  return sessionId ? studioConversationPath(sessionId) : ROUTES.STUDIO
}

/** 开着这段对话去某个台：`<台>?c=<编号>`（台地址自己带的参数原样留着）。 */
export function studioBenchHref(
  benchHref: string,
  sessionId: string | null,
): string {
  if (!sessionId) return benchHref
  const [path, query = ''] = benchHref.split('?')
  const params = new URLSearchParams(query)
  params.set(STUDIO_CONVERSATION_QUERY, sessionId)
  return `${path}?${params.toString()}`
}

/** `/library/<类>` 里那一类；不是库的地址（或类不认得）= `null`。 */
export function libraryCategoryFromPath(
  pathname: string,
): StudioLibraryCategoryId | null {
  if (!pathname.startsWith(`${ROUTES.LIBRARY}/`)) return null
  const raw = pathname.slice(ROUTES.LIBRARY.length + 1).split('/')[0]
  return STUDIO_LIBRARY_CATEGORY_IDS.find((id) => id === raw) ?? null
}

/** 外壳管的路由：`/studio/**` 与 `/library/**`（≥1024 全站侧栏让给外壳左栏）。 */
export function isStudioShellPath(pathname: string): boolean {
  return (
    underPrefix(pathname, ROUTES.STUDIO) ||
    underPrefix(pathname, ROUTES.LIBRARY)
  )
}
