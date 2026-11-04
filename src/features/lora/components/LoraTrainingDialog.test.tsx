/**
 * 训练表单：真 `useLoraTraining`（图一张张传上去）、真 `ApiKeysProvider`、真
 * `QuickSetupDialog`、真素材库选择器（关着）。只假网络：key 名单走假服务器，
 * 训练那几跳在 api-client 边界上假。
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { fakeServer, renderWithApp } from '@/test/app-harness'
import {
  apiKeyRecord,
  fakeApiKeyRoutes,
  runIdleCallbacksNow,
} from '@/test/fake-routes'
import type { UserApiKeyRecord } from '@/types'

import { LoraTrainingForm } from './LoraTrainingDialog'

// P1-2 (Hard Rule 8): the training form's Submit button must never be
// disabled just because the user hasn't configured an API key yet —
// clicking it should open the same QuickSetupDialog as the provider
// buttons, mirroring the generate page's key-gate pattern.

vi.mock('next-intl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-intl')>()),
  useTranslations: (namespace: string) => {
    const t = (key: string, values?: Record<string, unknown>) => {
      const base = `${namespace}:${key}`
      if (!values) return base
      const interpolated = Object.entries(values)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(',')
      return `${base}(${interpolated})`
    }
    return Object.assign(t, { rich: t, has: () => true })
  },
}))

// 每例换一个登录用户：真 useApiKeys 的名单按用户缓存在模块里。
const auth = vi.hoisted(() => ({ userId: 'user_0' }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: auth.userId, isSignedIn: true, isLoaded: true }),
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/lora',
}))

const training = vi.hoisted(() => ({
  submit: vi.fn(),
  upload: vi.fn(),
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  listLoraTrainingJobsAPI: async () => ({ success: true, data: [] }),
  uploadLoraTrainingImageAPI: training.upload,
  submitLoraTrainingAPI: training.submit,
}))

let userSeq = 0
beforeEach(() => {
  userSeq += 1
  auth.userId = `user_${userSeq}`
  localStorage.clear()
  runIdleCallbacksNow()
  training.submit.mockReset()
  training.upload.mockReset()
  training.upload.mockImplementation(async (file: File) => ({
    success: true,
    data: {
      url: `https://cdn.test/${file.name}`,
      storageKey: `lora-training/${file.name}`,
    },
  }))
})

async function mountForm(keys: UserApiKeyRecord[] = []) {
  const server = fakeApiKeyRoutes(fakeServer(), keys)
  renderWithApp(<LoraTrainingForm />, { inner: ApiKeysProvider })
  await waitFor(() =>
    expect(server.requests.map((r) => r.path)).toContain('/api/api-keys'),
  )
  return server
}

/** 从文件选择框传 `count` 张图上去（真 useLoraTraining 一张一张传）。 */
async function addImages(count: number) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
  const files = Array.from(
    { length: count },
    (_, i) => new File([`img${i}`], `${i}.png`, { type: 'image/png' }),
  )
  fireEvent.change(input, { target: { files } })
  await waitFor(() =>
    expect(
      screen.getByText(
        new RegExp(`LoraTraining:imageCountWithMax\\(count=${count},`),
      ),
    ).toBeInTheDocument(),
  )
}

function fillValidForm() {
  fireEvent.change(
    screen.getByPlaceholderText('LoraTraining:namePlaceholder'),
    { target: { value: 'My Character' } },
  )
  fireEvent.change(
    screen.getByPlaceholderText('LoraTraining:triggerWordPlaceholder'),
    { target: { value: 'sks_character' } },
  )
}

const replicateKey = () =>
  apiKeyRecord('key-1', AI_ADAPTER_TYPES.REPLICATE, 'Replicate')

describe('LoraTrainingForm — P1-2 API key gate (Hard Rule 8)', () => {
  it('keeps Submit enabled (not disabled) when the form is valid but no provider has a key', async () => {
    await mountForm()
    await addImages(10)
    fillValidForm()

    expect(
      screen.getByRole('button', { name: 'LoraTraining:submit' }),
    ).not.toBeDisabled()
  })

  it('opens QuickSetupDialog for the selected provider on Submit click instead of silently no-op-ing', async () => {
    await mountForm()
    await addImages(10)
    fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: 'LoraTraining:submit' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText(/Replicate/).length).toBeGreaterThan(0)
    expect(training.submit).not.toHaveBeenCalled()
  })

  it('submits directly once a key exists for the selected provider', async () => {
    training.submit.mockResolvedValue({
      success: true,
      data: { job: { id: 'job-1' } },
    })
    await mountForm([replicateKey()])
    await addImages(10)
    fillValidForm()

    fireEvent.click(screen.getByRole('button', { name: 'LoraTraining:submit' }))

    await waitFor(() => expect(training.submit).toHaveBeenCalledTimes(1))
    expect(training.submit.mock.calls[0]?.[0]).toMatchObject({
      apiKeyId: 'key-1',
      name: 'My Character',
      triggerWord: 'sks_character',
    })
    expect(training.submit.mock.calls[0]?.[0].trainingImages).toHaveLength(10)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the no-key warning naming the currently selected provider, without pointing at a sidebar', async () => {
    await mountForm()

    expect(
      screen.getByText('LoraTraining:noApiKey(provider=Replicate)'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('LoraTraining:addApiKeyHint(provider=Replicate)'),
    ).toBeInTheDocument()
  })

  it('still disables Submit for real form-validity reasons (e.g. no images), independent of API key state', async () => {
    await mountForm([replicateKey()])
    fillValidForm()

    expect(
      screen.getByRole('button', { name: 'LoraTraining:submit' }),
    ).toBeDisabled()
  })
})

describe('LoraTrainingForm — D7⑥ image counter tone', () => {
  it('renders the 0/max counter in a neutral (muted) tone, not the warning color', async () => {
    await mountForm()

    const counter = screen.getByText(
      'LoraTraining:imageCountWithMax(count=0,max=50)',
    )
    expect(counter.className).toContain('text-muted-foreground')
    expect(counter.className).not.toContain('text-destructive')
  })

  it('renders a below-minimum but non-zero count in the warning color', async () => {
    await mountForm()
    await addImages(2)

    const counter = screen.getByText(
      'LoraTraining:imageCountWithMax(count=2,max=50)',
    )
    expect(counter.className).toContain('text-destructive')
  })
})
