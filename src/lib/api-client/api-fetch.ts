/**
 * 前台发请求的唯一入口：api-client 里**一律**用它，不直接用 `fetch`（eslint 拦）。
 *
 * ⭐ 自家 `/api/*` 回 401 时：让 Clerk 立刻续一张会话 token，再把同一个请求原样重发
 * 一次。会话 token 只活一分钟左右、靠浏览器定时续；标签页在后台、或助手想了一分钟才
 * 发请求时，带出去的常常是刚过期的那张（2026-10-29 真机：助手出图报「服务商返回：
 * Failed with status 404」—— 其实是门口 `auth.protect()` 把过期会话当成没登录，
 * 回了一个空的 404。门口现在回 401，见 `src/proxy.ts`）。
 * 续不上（真的登出了）就把那个 401 原样交回，调用方照常解析成「请登录后继续」。
 *
 * 不是自家 `/api` 的请求（R2 预签名上传、外链下载）原样透传，不碰会话。
 */

interface ClerkSessionLike {
  getToken: (options?: { skipCache?: boolean }) => Promise<string | null>
}

/** 同一时刻多个请求一起 401，只续一次。 */
let refreshing: Promise<boolean> | null = null

function refreshSession(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  const session = (
    window as unknown as { Clerk?: { session?: ClerkSessionLike | null } }
  ).Clerk?.session
  if (!session) return Promise.resolve(false)

  refreshing ??= session
    .getToken({ skipCache: true })
    .then(
      (token) => token !== null,
      () => false,
    )
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

function isOwnApi(input: RequestInfo | URL): boolean {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  if (raw.startsWith('/api/')) return true
  if (typeof window === 'undefined') return false
  try {
    const url = new URL(raw, window.location.origin)
    return (
      url.origin === window.location.origin && url.pathname.startsWith('/api/')
    )
  } catch {
    return false
  }
}

/** 请求体发出去之后还能不能再发一遍（流和 Request 对象的体只能读一次）。 */
function canResend(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (typeof Request !== 'undefined' && input instanceof Request) return false
  return !(
    typeof ReadableStream !== 'undefined' &&
    init?.body instanceof ReadableStream
  )
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // 原样转发实参个数（没传 init 就不传 undefined），调用方看到的与裸 fetch 一致。
  const send = () => (init === undefined ? fetch(input) : fetch(input, init))
  const response = await send()
  if (
    response.status !== 401 ||
    !isOwnApi(input) ||
    !canResend(input, init) ||
    init?.signal?.aborted
  ) {
    return response
  }
  if (!(await refreshSession())) return response
  return send()
}
