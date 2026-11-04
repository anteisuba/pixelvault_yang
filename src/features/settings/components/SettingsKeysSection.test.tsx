/**
 * L2b：key 页连真 `ApiKeysProvider`（真 useApiKeys，体检结果读真 localStorage 缓存）、
 * 真 `useMonthlyUsage`、真 `QuickSetupDialog`，只假网络与路由跳转。
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
  getProviderLabel,
} from '@/constants/providers'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { fakeServer, message, renderWithApp } from '@/test/app-harness'
import {
  apiKeyRecord,
  fakeApiKeyRoutes,
  runIdleCallbacksNow,
} from '@/test/fake-routes'
import type { ApiKeyHealthStatus, UserApiKeyRecord } from '@/types'
import type { MonthlyUsageRow } from '@/types/usage'

import { SettingsKeysSection } from './SettingsKeysSection'

// 每例换一个登录用户：真 useApiKeys 的名单按用户缓存在模块里。
const auth = vi.hoisted(() => ({ userId: 'user_0' }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: auth.userId, isSignedIn: true, isLoaded: true }),
}))

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams(),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => navigation.search,
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace, push: vi.fn() }),
  usePathname: () => '/settings/keys',
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

const t = (key: string, values: Record<string, string> = {}) =>
  message(`Settings.keys.${key}`).replace(
    /\{(\w+)\}/g,
    (_, name: string) => values[name] ?? `{${name}}`,
  )
const providerName = (adapter: AI_ADAPTER_TYPES) =>
  getProviderLabel(getDefaultProviderConfig(adapter))

let userSeq = 0
beforeEach(() => {
  userSeq += 1
  auth.userId = `user_${userSeq}`
  navigation.replace.mockReset()
  navigation.search = new URLSearchParams()
  localStorage.clear()
  runIdleCallbacksNow()
})

async function mountWith(
  keys: UserApiKeyRecord[],
  health: Record<string, ApiKeyHealthStatus> = {},
  usage: MonthlyUsageRow[] = [],
) {
  const server = fakeApiKeyRoutes(fakeServer(), keys, { health, usage })
  const view = renderWithApp(<SettingsKeysSection />, {
    inner: ApiKeysProvider,
  })
  await waitFor(() =>
    expect(server.requests.map((r) => r.path)).toContain('/api/api-keys'),
  )
  return view
}

/** 行的可读快照：provider 名 + 状态一句。 */
function rowSummaries(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '')
    .filter(Boolean)
}

describe('SettingsKeysSection', () => {
  it('失效的排最前，再是配好的，最后未配置', async () => {
    await mountWith(
      [
        apiKeyRecord('fal-1', AI_ADAPTER_TYPES.FAL, 'fal.ai'),
        apiKeyRecord('openai-1', AI_ADAPTER_TYPES.OPENAI, 'OpenAI'),
      ],
      { 'fal-1': 'available', 'openai-1': 'failed' },
    )

    await waitFor(() =>
      expect(rowSummaries().some((text) => text.includes('OpenAI'))).toBe(true),
    )
    const summaries = rowSummaries()
    const openAiIndex = summaries.findIndex((text) => text.includes('OpenAI'))
    const falIndex = summaries.findIndex((text) => text.includes('fal.ai'))
    const unconfiguredIndex = summaries.findIndex((text) =>
      text.includes(t('status.unconfigured')),
    )

    expect(openAiIndex).toBeLessThan(falIndex)
    expect(falIndex).toBeLessThan(unconfiguredIndex)
    // OpenAI 那把没校验时间戳 —— 状态句退到不带时间的那一条。
    expect(summaries[openAiIndex]).toContain(t('status.invalid'))
  })

  it('失效行给「换一把」，未配置行给「配置」', async () => {
    await mountWith(
      [apiKeyRecord('openai-1', AI_ADAPTER_TYPES.OPENAI, 'OpenAI')],
      {
        'openai-1': 'failed',
      },
    )

    expect(await screen.findByText(t('replaceKey'))).toBeInTheDocument()
    expect(screen.getAllByText(t('configure')).length).toBeGreaterThan(0)
  })

  it('配好的一家能展开看每一把，展开后才有「再加一把」', async () => {
    await mountWith(
      [
        apiKeyRecord('fal-1', AI_ADAPTER_TYPES.FAL, 'personal', 'fal.ai'),
        apiKeyRecord('fal-2', AI_ADAPTER_TYPES.FAL, 'work', 'fal.ai'),
      ],
      { 'fal-1': 'available', 'fal-2': 'available' },
    )

    const toggle = await screen.findByRole('button', {
      name: t('toggleKeys', { provider: 'fal.ai' }),
    })
    expect(screen.queryByText(t('addAnother'))).toBeNull()

    fireEvent.click(toggle)

    expect(screen.getByText('personal')).toBeInTheDocument()
    expect(screen.getByText('work')).toBeInTheDocument()
    expect(screen.getByText(t('addAnother'))).toBeInTheDocument()
  })

  it('没有 key 时每家都是「未配置」，没有任何一行写着可用', async () => {
    await mountWith([])

    await waitFor(() =>
      expect(
        screen.getAllByText(t('status.unconfigured')).length,
      ).toBeGreaterThan(1),
    )
    expect(rowSummaries().join('')).not.toContain(t('status.healthy'))
  })

  it('本月花费只出现在有花费的那一家', async () => {
    await mountWith(
      [apiKeyRecord('fal-1', AI_ADAPTER_TYPES.FAL, 'fal.ai')],
      { 'fal-1': 'available' },
      [{ adapterType: 'fal', modelId: AI_MODELS.KLING_V3_PRO, requests: 12 }],
    )

    const spendSuffix = t('monthlySpend', { amount: '' }).trim()
    await waitFor(() =>
      expect(
        screen.getAllByText((text) => text.endsWith(spendSuffix)),
      ).toHaveLength(1),
    )
  })

  it('?setup= 带着 provider 进来就打开它的配置弹窗；关掉时去掉这个参数、留下 from', async () => {
    navigation.search = new URLSearchParams(
      `from=${encodeURIComponent('/studio/image')}&setup=${AI_ADAPTER_TYPES.OPENAI}`,
    )
    await mountWith([])

    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getAllByText(
        new RegExp(providerName(AI_ADAPTER_TYPES.OPENAI)),
      ).length,
    ).toBeGreaterThan(0)
    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        '/settings/keys?from=%2Fstudio%2Fimage',
      ),
    )
  })

  it('?setup= 写了不认识的 provider 时什么都不弹', async () => {
    navigation.search = new URLSearchParams('setup=not-a-provider')
    await mountWith([])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('没有 ?setup= 时不自己弹', async () => {
    await mountWith([])
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
