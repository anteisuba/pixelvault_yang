/**
 * L2b 界面集成测试底座（docs/references/testing.md「测试标准」）。
 *
 * - `renderWithApp` / `renderHookWithApp`：真组件 / 真 hook 包在真 next-intl 里，
 *   文案用 `src/messages` 的整份三语（⛔ 不手写一小份 MESSAGES：那样测不出缺译、
 *   也测不出界面上到底是哪句话）。
 * - `fakeServer()`：只假网络。替换全局 `fetch`，按「方法 + 路径」把请求交给处理函数；
 *   处理函数可以直接是用 `createApiRoute` 等工厂做的真路由，于是服务端怎么把错误
 *   序列化成 JSON、api-client 怎么解析、hook 怎么翻译，全是真代码。
 *   没登记的请求直接报错（不悄悄回 404）——漏了哪条请求一眼看到。
 */
import type { ComponentType, ReactElement, ReactNode } from 'react'
import { render, renderHook } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { NextRequest } from 'next/server'
import { vi } from 'vitest'

import type { AppLocale } from '@/i18n/routing'
import { MESSAGES } from '@/messages'

const ORIGIN = 'http://localhost:3000'

export function AppProviders({
  locale = 'zh',
  children,
}: {
  locale?: AppLocale
  children: ReactNode
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={MESSAGES[locale]}
      timeZone="Asia/Tokyo"
    >
      {children}
    </NextIntlClientProvider>
  )
}

interface AppRenderOptions {
  locale?: AppLocale
  /** 被测代码还要的真 Provider（如 `LoraStackProvider`），包在 next-intl 里面。 */
  inner?: ComponentType<{ children: ReactNode }>
}

function appWrapper({ locale = 'zh', inner: Inner }: AppRenderOptions) {
  return function AppWrapper({ children }: { children: ReactNode }) {
    return (
      <AppProviders locale={locale}>
        {Inner ? <Inner>{children}</Inner> : children}
      </AppProviders>
    )
  }
}

export function renderWithApp(
  ui: ReactElement,
  options: AppRenderOptions = {},
) {
  return render(ui, { wrapper: appWrapper(options) })
}

export function renderHookWithApp<T>(
  hook: () => T,
  options: AppRenderOptions = {},
) {
  return renderHook(hook, { wrapper: appWrapper(options) })
}

/** 某语言下某句文案的原文（用来断言「界面上就是这句」）。 */
export function message(path: string, locale: AppLocale = 'zh'): string {
  let node: unknown = MESSAGES[locale]
  for (const part of path.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[part]
  }
  if (typeof node !== 'string') throw new Error(`没有这句文案：${path}`)
  return node
}

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Response | Promise<Response>

interface RouteEntry {
  method: string
  pattern: RegExp
  keys: string[]
  handler: RouteHandler
}

/** `/api/assistant-skills/:id` → 正则 + 参数名。 */
function compilePath(path: string) {
  const keys: string[] = []
  const source = path.replace(/:(\w+)/g, (_, key: string) => {
    keys.push(key)
    return '([^/]+)'
  })
  return { pattern: new RegExp(`^${source}$`), keys }
}

export function fakeServer() {
  const routes: RouteEntry[] = []
  const requests: Array<{ method: string; path: string }> = []
  let offline = false

  const fetchFake = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (offline) throw new TypeError('Failed to fetch')
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        ORIGIN,
      )
      const method = (init?.method ?? 'GET').toUpperCase()
      requests.push({ method, path: url.pathname })
      for (const route of routes) {
        if (route.method !== method) continue
        const match = route.pattern.exec(url.pathname)
        if (!match) continue
        const params = Object.fromEntries(
          route.keys.map((key, index) => [
            key,
            decodeURIComponent(match[index + 1]!),
          ]),
        )
        return route.handler(new NextRequest(url, init as never), {
          params: Promise.resolve(params),
        })
      }
      throw new Error(`fakeServer：没登记 ${method} ${url.pathname}`)
    },
  )
  vi.stubGlobal('fetch', fetchFake)

  return {
    /** 登记一条路由；同一条再登记会被新的盖住（后登记的先匹配）。 */
    on(method: string, path: string, handler: RouteHandler) {
      routes.unshift({ method, ...compilePath(path), handler })
      return this
    },
    /** 断网：之后的请求都像浏览器那样抛 `TypeError: Failed to fetch`。 */
    goOffline() {
      offline = true
    },
    requests,
  }
}
