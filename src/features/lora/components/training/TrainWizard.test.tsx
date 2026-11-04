/**
 * 训练向导壳：真表单（真 useLoraTraining）、真训练历史、真手机抽屉、真 `useIsMobile`。
 * 只假网络：key 名单走假服务器，训练任务列表在 api-client 边界上假。
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LORA_TRAINING_PRESETS } from '@/constants/lora'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { en } from '@/messages'
import { fakeServer, renderWithApp } from '@/test/app-harness'
import { fakeApiKeyRoutes, runIdleCallbacksNow } from '@/test/fake-routes'
import { DESKTOP_WIDTH, PHONE_WIDTH, setViewport } from '@/test/viewport'

import { TrainWizard } from './TrainWizard'

const auth = vi.hoisted(() => ({ userId: 'user_0' }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: auth.userId, isSignedIn: true, isLoaded: true }),
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/lora',
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  listLoraTrainingJobsAPI: async () => ({ success: true, data: [] }),
}))

const L = en.LoraTraining

let userSeq = 0
beforeEach(() => {
  userSeq += 1
  auth.userId = `user_${userSeq}`
  localStorage.clear()
  runIdleCallbacksNow()
  setViewport(DESKTOP_WIDTH)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function renderWizard() {
  const server = fakeApiKeyRoutes(fakeServer(), [])
  renderWithApp(<TrainWizard />, { locale: 'en', inner: ApiKeysProvider })
  await waitFor(() =>
    expect(server.requests.map((r) => r.path)).toContain('/api/api-keys'),
  )
}

describe('TrainWizard', () => {
  it('renders both steps plus the history rail on desktop', async () => {
    await renderWizard()

    expect(screen.getByText(L.presetRailTitle)).toBeInTheDocument()
    // ② 表单第一次进来是空态（选预设 / 传图两个入口）
    expect(
      await screen.findByRole('button', { name: L.emptyCtaPreset }),
    ).toBeInTheDocument()
    expect(screen.getByText(L.historyTitle)).toBeInTheDocument()
    expect(screen.getByText(L.historyOutputHint)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: L.mobileSheetTrigger }),
    ).toBeNull()
  })

  it('hands the picked preset down to the form', async () => {
    await renderWizard()
    const preset = LORA_TRAINING_PRESETS.find((p) => p.available)!

    fireEvent.click(
      document.querySelector(`[data-preset-id="${preset.id}"]`) as HTMLElement,
    )

    const name = (L as Record<string, unknown>)[
      preset.nameKey.replace(/^.*\./, '')
    ] as string
    expect(
      await screen.findByText(L.presetSelectedLabel.replace('{name}', name)),
    ).toBeInTheDocument()
  })

  it('scrolls step 1 back into view when the form asks for a preset', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    await renderWizard()

    fireEvent.click(
      await screen.findByRole('button', { name: L.emptyCtaPreset }),
    )
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'center' }),
    )
  })

  it('puts the form inside the sheet on mobile', async () => {
    setViewport(PHONE_WIDTH)
    await renderWizard()

    // 手机 sheet 是 `next/dynamic` 懒加载的（Vaul 不进桌面 SSR 载荷），
    // 第一帧只有占位，得等那次 import 落地。
    fireEvent.click(
      await screen.findByRole('button', { name: L.mobileSheetTrigger }),
    )
    const sheet = await screen.findByRole('dialog', {
      name: L.mobileSheetAriaLabel,
    })
    expect(
      within(sheet).getByRole('button', { name: L.emptyCtaPreset }),
    ).toBeInTheDocument()
    expect(screen.getByText(L.historyTitle)).toBeInTheDocument()
  })
})
