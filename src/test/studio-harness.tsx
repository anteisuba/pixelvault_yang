/**
 * 工作台 L2b 底座：在 `app-harness` 上再包真 `ApiKeysProvider` + 真 `StudioProvider`，
 * 只假网络（`fakeServer`）。工作台一挂上就会去拉的几条接口（Civitai token、项目、
 * 未归档历史、角色卡、key 列表）先登记成「空的成功」，用例要别的回法就 `server.on` 盖掉。
 *
 * 用例要先摆好工作台状态（选模型、写提示词、开面板）时，用 `renderWithStudio` 回来的
 * `studio.current`（真 `useStudioContext()`）去 dispatch——走的是真 reducer。
 */
import { useLayoutEffect, type ReactElement, type ReactNode } from 'react'
import { act } from '@testing-library/react'

import { API_ENDPOINTS } from '@/constants/config'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { StudioProvider, useStudioContext } from '@/contexts/studio-context'
import type { AppLocale } from '@/i18n/routing'
import {
  fakeServer,
  renderHookWithApp,
  renderWithApp,
} from '@/test/app-harness'

export type StudioHandle = ReturnType<typeof useStudioContext>

const ok = (data: unknown) => Response.json({ success: true, data })

/** `fakeServer()` + 工作台挂载时的那几条接口回空。 */
export function fakeStudioServer() {
  return fakeServer()
    .on('GET', API_ENDPOINTS.CIVITAI_TOKEN, () => ok({ hasToken: false }))
    .on('GET', API_ENDPOINTS.PROJECTS, () => ok([]))
    .on('GET', `${API_ENDPOINTS.PROJECTS}/:id/history`, () =>
      ok({ generations: [], total: 0, hasMore: false }),
    )
    .on('GET', API_ENDPOINTS.CHARACTER_CARDS, () => ok([]))
    .on('GET', API_ENDPOINTS.API_KEYS, () => ok([]))
}

export function StudioProviders({ children }: { children: ReactNode }) {
  return (
    <ApiKeysProvider>
      <StudioProvider>{children}</StudioProvider>
    </ApiKeysProvider>
  )
}

interface StudioRenderOptions {
  locale?: AppLocale
}

/** 真工作台里渲染 `ui`；`studio.current` 是同一棵树里的真 `useStudioContext()`。 */
export function renderWithStudio(
  ui: ReactElement,
  options: StudioRenderOptions = {},
) {
  const studioRef = { current: null as unknown as StudioHandle }
  function Capture() {
    const ctx = useStudioContext()
    useLayoutEffect(() => {
      studioRef.current = ctx
    })
    return null
  }
  const view = renderWithApp(
    <>
      <Capture />
      {ui}
    </>,
    { locale: options.locale, inner: StudioProviders },
  )
  return { ...view, studio: studioRef }
}

export function renderHookWithStudio<T>(
  hook: () => T,
  options: StudioRenderOptions = {},
) {
  return renderHookWithApp(
    () => ({ value: hook(), studio: useStudioContext() }),
    { locale: options.locale, inner: StudioProviders },
  )
}

/** 让挂载时那几条请求跑完（微任务 + 0 拍）。 */
export async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
