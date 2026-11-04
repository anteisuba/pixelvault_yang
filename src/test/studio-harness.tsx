/**
 * L2b：真 `StudioProvider`（真表单 reducer、真子 hook）给 hook / 组件测试用。
 *
 * 用法（每个测试文件自己写这三条 `vi.mock`——它们要在被测模块加载前生效）：
 *
 * ```ts
 * vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ userId: 'user-a', isLoaded: true, isSignedIn: true }) }))
 * vi.mock('@/i18n/navigation', () => ({ usePathname: () => '/studio/image', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
 * vi.mock('next/navigation', () => ({ usePathname: () => '/studio/image', useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
 * ```
 *
 * 然后 `studioServer()` 起假网络（Provider 挂上就会拉的几条先登记成空），
 * `renderHookWithApp(hook, { inner: StudioProvider })` 渲染。
 */
import { fakeServer } from '@/test/app-harness'
import type { useStudioForm } from '@/contexts/studio-context'
import { EMPTY_STUDIO_DRAFT } from '@/hooks/use-studio-draft'

const ok = (data: unknown) => Response.json({ success: true, data })

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
