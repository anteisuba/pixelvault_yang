import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { fakeServer, renderWithApp } from '@/test/app-harness'
import { stubBrowserLayout } from '@/test/browser-stubs'
import { text } from '@/test/i18n-text'
import { settle } from '@/test/studio-harness'
import { DESKTOP_WIDTH, MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'
import type { UserApiKeyRecord } from '@/types'

import { Studio3DWorkspace } from './Studio3DWorkspace'

/**
 * 3D 台，全程真的：真 `useGenerate3D` / `useGenerateMultiView`、真 key 名单、真模型选择、
 * 真配置窗、真弹窗；只假网络（key 列表、`POST /api/generate-3d`）与屏宽。
 */

const auth = vi.hoisted(() => ({ userId: 'user-0', n: 0 }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: auth.userId }),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/3d',
  useRouter: () => ({ push: vi.fn() }),
}))

const T = (key: string) => text(`Model3DGenerate.${key}`)
const ok = (data: unknown) => Response.json({ success: true, data })

const RODIN_KEY: UserApiKeyRecord = {
  id: 'rodin-key',
  modelId: 'rodin-gen-2.5',
  adapterType: AI_ADAPTER_TYPES.HYPER3D_RODIN,
  providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.HYPER3D_RODIN),
  label: 'Rodin',
  maskedKey: 'rodin-****',
  isActive: true,
  createdAt: new Date('2026-01-01'),
}

let server: ReturnType<typeof fakeServer>
/** `keys`：名单回什么；`'pending'` = 一直没回来。 */
function setup(keys: UserApiKeyRecord[] | 'pending' = [RODIN_KEY]) {
  server = fakeServer()
    .on('GET', API_ENDPOINTS.API_KEYS, () =>
      keys === 'pending' ? new Promise<Response>(() => {}) : ok(keys),
    )
    .on('POST', API_ENDPOINTS.GENERATE_3D, () =>
      Response.json(
        { success: false, error: 'Provider timed out' },
        { status: 504 },
      ),
    )
}

beforeEach(() => {
  auth.n += 1
  auth.userId = `user-${auth.n}`
  stubBrowserLayout()
  setViewportWidth(DESKTOP_WIDTH)
})
afterEach(() => vi.unstubAllGlobals())

async function mount() {
  renderWithApp(
    <Studio3DWorkspace
      initialGenerations={[]}
      initialTotal={0}
      initialHasMore={false}
    />,
    { inner: ApiKeysProvider },
  )
  await settle()
  await settle()
}

const modeSelect = () =>
  screen.getByRole('combobox', { name: T('rodinModeLabel') })
const promptField = () =>
  screen.getByLabelText(new RegExp(T('rodinPromptLabel')))

function switchToText(prompt?: string) {
  fireEvent.change(modeSelect(), { target: { value: 'text' } })
  if (prompt !== undefined)
    fireEvent.change(promptField(), { target: { value: prompt } })
}

const generateRequests = () =>
  server.requests.filter((r) => r.path === API_ENDPOINTS.GENERATE_3D)

describe('Studio3DWorkspace 布局与生成', () => {
  it('格式放在外面，几何参数收进「高级设置」；没参考图时生成键不可点', async () => {
    setup()
    await mount()
    const advanced = screen
      .getByText(T('rodinAdvancedSectionLabel'))
      .closest('details')
    expect(advanced).not.toHaveAttribute('open')
    expect(advanced?.querySelector('#rodin-tapose')).not.toBeNull()
    expect(
      document.getElementById('rodin-format')?.closest('details'),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: T('selectImageToGenerate') }),
    ).toBeDisabled()
  })

  it('切输入模式不丢已写的文字，也不发生成', async () => {
    setup()
    await mount()
    switchToText('A ceramic vase')
    expect(
      screen.getByRole('button', { name: T('generateButton') }),
    ).toBeEnabled()

    fireEvent.change(modeSelect(), { target: { value: 'image' } })
    expect(
      screen.getByRole('button', { name: T('selectImageToGenerate') }),
    ).toBeDisabled()
    switchToText()
    expect(promptField()).toHaveValue('A ceramic vase')
    expect(generateRequests()).toHaveLength(0)
  })

  it('key 名单还没回来：不写「配置 API Key」，有输入就照常生成', async () => {
    setup('pending')
    await mount()
    expect(
      screen.queryByRole('button', { name: T('setupApiKeyButton') }),
    ).not.toBeInTheDocument()

    switchToText('A ceramic vase')
    fireEvent.click(screen.getByRole('button', { name: T('generateButton') }))
    await waitFor(() => expect(generateRequests()).toHaveLength(1))
    expect(
      screen.queryByLabelText(text('QuickSetup.step2')),
    ).not.toBeInTheDocument()
  })

  it('真缺 key：生成键换成「配置 API Key」，点了就地弹配置窗、⛔ 不发生成', async () => {
    setup([])
    await mount()
    const buttons = screen.getAllByRole('button', {
      name: T('setupApiKeyButton'),
    })
    fireEvent.click(buttons[buttons.length - 1]!)
    expect(
      await screen.findByLabelText(text('QuickSetup.step2')),
    ).toBeInTheDocument()
    expect(generateRequests()).toHaveLength(0)
  })

  it('窄屏：模型设置收进弹窗', async () => {
    setViewportWidth(MOBILE_WIDTH)
    setup()
    await mount()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: T('settingsTitle') }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(T('rodinModeLabel'))).toBeInTheDocument()
  })

  // 服务端回的英文原话经真错误分类落成这一语言的那句，⛔ 原样贴英文。
  it('生成失败：报分类后的原因，并告诉他输入与参数都还在', async () => {
    setup()
    await mount()
    switchToText('A ceramic vase')
    fireEvent.click(screen.getByRole('button', { name: T('generateButton') }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(text('Errors.generation.provider_timeout'))
    expect(alert).not.toHaveTextContent('Provider timed out')
    expect(alert).toHaveTextContent(T('draftPreserved'))
    expect(promptField()).toHaveValue('A ceramic vase')
  })
})
