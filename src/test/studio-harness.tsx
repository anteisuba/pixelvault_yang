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
// 测试底座要清角色卡的模块级缓存；这个缓存没从 `@/features/cards` 入口导出。
// eslint-disable-next-line no-restricted-imports
import {
  invalidateCardCache,
  makeCardCacheKey,
} from '@/features/cards/lib/card-cache'
import type { useStudioForm } from '@/contexts/studio-context'
import { EMPTY_STUDIO_DRAFT } from '@/hooks/use-studio-draft'
import type { AppLocale } from '@/i18n/routing'
import type { CharacterCardRecord } from '@/types'
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

/** 一张能直接塞进 `GET /api/character-cards` 回包的角色卡；按需覆盖字段。 */
export function characterCardFixture(
  overrides: Partial<CharacterCardRecord> & { id: string },
): CharacterCardRecord {
  return {
    name: overrides.id,
    tags: [],
    handle: null,
    looks: [],
    persona: null,
    workOverride: null,
    summary: null,
    tavern: null,
    chatUserRole: '',
    voiceCardId: null,
    pinnedFields: [],
    generationCount: 0,
    isFavorite: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  }
}

/**
 * 角色卡列表有模块级缓存（`card-cache`），跨用例会留着上一例的卡；
 * 要「首次加载」语义的用例在 `beforeEach` 里清掉。
 */
export function resetCharacterCardsCache() {
  invalidateCardCache(makeCardCacheKey('character'))
}

/** 假网络 + Provider 挂上就会拉的那几条（项目、角色卡、Civitai token）先回空。 */
export function studioServer() {
  return fakeServer()
    .on('GET', '/api/civitai-token', () => ok({ hasToken: false }))
    .on('GET', '/api/projects', () => ok([]))
    .on('GET', '/api/projects/:id/history', () =>
      ok({ generations: [], hasMore: false, nextCursor: null }),
    )
    .on('GET', '/api/character-cards', () =>
      ok({ items: [], total: 0, page: 1, limit: 50 }),
    )
}

/**
 * 「把这一句带去标签台」：和界面一样走真 action ——写提示词、点带过去、
 * 切到标签方言、到达后恢复草稿（带上携带的那一句）。
 */
export function carrySentenceToTags(
  dispatch: ReturnType<typeof useStudioForm>['dispatch'],
  sentence: string,
) {
  dispatch({ type: 'SET_PROMPT', payload: sentence })
  dispatch({
    type: 'TRANSFER_IMAGE_PROMPT',
    payload: { dialect: 'tags', optionId: 'nai-model' },
  })
  dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' })
  const { referenceImages: _references, ...draft } = EMPTY_STUDIO_DRAFT
  void _references
  dispatch({
    type: 'RESTORE_WORKSPACE_DRAFT',
    payload: { draft, applyTransfer: true },
  })
}
