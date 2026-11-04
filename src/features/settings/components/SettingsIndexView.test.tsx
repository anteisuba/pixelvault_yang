/**
 * L2b：手机「我的」一级列表连真 `ApiKeysProvider`、真 `useMyProfile`、真偏好行，只假网络。
 */
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { fakeServer, message, renderWithApp } from '@/test/app-harness'
import {
  apiKeyRecord,
  fakeApiKeyRoutes,
  runIdleCallbacksNow,
} from '@/test/fake-routes'
import type { ApiKeyHealthStatus, UserApiKeyRecord } from '@/types'

import { SettingsIndexView } from './SettingsIndexView'

const auth = vi.hoisted(() => ({ userId: 'user_0' }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: auth.userId, isSignedIn: true, isLoaded: true }),
  useClerk: () => ({ signOut: vi.fn() }),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/settings',
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

/** 「{count, plural, other {# 把失效}}」→ 「2 把失效」。 */
const invalidSummary = (count: number) =>
  message('Settings.keys.invalidSummary').replace(
    /^\{count, plural, other \{(.*)\}\}$/,
    (_, body: string) => body.replace('#', String(count)),
  )

let userSeq = 0
beforeEach(() => {
  userSeq += 1
  auth.userId = `user_${userSeq}`
  localStorage.clear()
  runIdleCallbacksNow()
})

async function renderIndex(
  keys: UserApiKeyRecord[] = [],
  health: Record<string, ApiKeyHealthStatus> = {},
) {
  const server = fakeApiKeyRoutes(fakeServer(), keys, { health }).on(
    'GET',
    '/api/users/me/profile',
    () =>
      Response.json({
        success: true,
        data: { username: 'yining', displayName: 'YINIG', avatarUrl: null },
      }),
  )
  const view = renderWithApp(<SettingsIndexView />, { inner: ApiKeysProvider })
  await waitFor(() =>
    expect(server.requests.map((r) => r.path)).toContain('/api/api-keys'),
  )
  return view
}

describe('SettingsIndexView（手机一级列表）', () => {
  it('API key 那一行写着有几把失效', async () => {
    await renderIndex(
      [
        apiKeyRecord('a', AI_ADAPTER_TYPES.FAL, 'fal.ai'),
        apiKeyRecord('b', AI_ADAPTER_TYPES.OPENAI, 'OpenAI'),
        apiKeyRecord('c', AI_ADAPTER_TYPES.GEMINI, 'Gemini'),
      ],
      { a: 'failed', b: 'failed', c: 'available' },
    )

    expect(await screen.findByText(invalidSummary(2))).toBeInTheDocument()
  })

  it('没有失效的就不写', async () => {
    await renderIndex([apiKeyRecord('a', AI_ADAPTER_TYPES.FAL, 'fal.ai')], {
      a: 'available',
    })

    expect(screen.queryByText(/把失效/)).toBeNull()
  })

  it('是手机的「我的」：资料、提示词、各节、偏好就地展开、退出放最后', async () => {
    const { container } = await renderIndex()

    expect(await screen.findByText('YINIG')).toBeInTheDocument()
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs).toEqual([
      '/u/me',
      '/library/prompts',
      '/settings/keys',
      '/settings/usage',
      '/settings/assistant',
      '/settings/connections',
      // 偏好行里的语言切换：三种语言各一个，留在本页换语言
      '/settings',
      '/settings',
      '/settings',
    ])
    expect(
      screen.getByRole('textbox', {
        name: message('Settings.preferences.displayName'),
      }),
    ).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    expect(buttons.at(-1)?.textContent).toContain(message('Settings.signOut'))
  })
})
