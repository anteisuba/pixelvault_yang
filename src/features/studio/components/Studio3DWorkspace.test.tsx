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
  isDefault: false,
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

const promptField = () =>
  // 认输入框本身：手机圆键的无障碍名里也会带「请输入提示词」那句。
  screen.getByRole('textbox', { name: new RegExp(T('rodinPromptLabel')) })

/**
 * 桌面的输入模式是输入框里的一颗药丸（owner 2026-11-11 小样 5 选 B）：Radix 菜单按下就开，
 * 再点那一项。
 */
function pickMode(mode: 'text' | 'image') {
  const trigger = screen.getByRole('button', {
    name: new RegExp(`^${T('rodinModeLabel')}`),
  })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  fireEvent.click(
    screen.getByRole('menuitemradio', {
      name: T(mode === 'text' ? 'rodinModeTextLabel' : 'rodinModeImageLabel'),
    }),
  )
}

/** 桌面的参数（质量 / 格式 / 高级）收在「参数」那颗药丸的弹层里。 */
function openParams() {
  // 手机那颗「模型设置」药丸（开抽屉）也叫这个名字，同在 DOM 里（断点只靠 CSS 藏）；
  // 桌面参数药丸是弹层触发器，认 `aria-haspopup`。
  const trigger = screen
    .getAllByRole('button', { name: new RegExp(`^${T('settingsTitle')}`) })
    .find((button) => button.getAttribute('aria-haspopup') === 'dialog')
  if (!trigger) throw new Error('params trigger not found')
  fireEvent.click(trigger)
}

function switchToText(prompt?: string) {
  pickMode('text')
  if (prompt !== undefined)
    fireEvent.change(promptField(), { target: { value: prompt } })
}

const generateRequests = () =>
  server.requests.filter((r) => r.path === API_ENDPOINTS.GENERATE_3D)

describe('Studio3DWorkspace 布局与生成', () => {
  beforeEach(() => {
    // jsdom 没有 scrollIntoView；Radix 下拉打开时会调它。
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('格式在参数弹层里，几何参数再收进「高级设置」；没参考图时生成键不可点', async () => {
    setup()
    await mount()
    openParams()
    const advancedToggle = screen.getByRole('button', {
      name: T('rodinAdvancedSectionLabel'),
    })
    expect(advancedToggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('rodin-tapose')).toBeNull()
    expect(
      screen.getByRole('combobox', {
        name: T('rodinGeometryFileFormatLabel'),
      }),
    ).toHaveAttribute('id', 'rodin-format')
    expect(
      screen.getByRole('button', { name: T('selectImageToGenerate') }),
    ).toBeDisabled()

    fireEvent.click(advancedToggle)
    expect(advancedToggle).toHaveAttribute('aria-expanded', 'true')
    const region = document.getElementById(
      advancedToggle.getAttribute('aria-controls') ?? '',
    )
    expect(region?.querySelector('#rodin-tapose')).not.toBeNull()
    expect(region?.querySelector('#rodin-format')).toBeNull()
  })

  it('切输入模式不丢已写的文字，也不发生成', async () => {
    setup()
    await mount()
    switchToText('A ceramic vase')
    expect(
      screen.getByRole('button', { name: T('generateButton') }),
    ).toBeEnabled()

    pickMode('image')
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

  it('窄屏：输入卡上的「模型设置」药丸打开抽屉', async () => {
    setViewportWidth(MOBILE_WIDTH)
    setup()
    await mount()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const pill = screen
      .getAllByRole('button', { name: T('settingsTitle') })
      .find((button) => button.getAttribute('aria-haspopup') !== 'dialog')
    fireEvent.click(pill!)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(T('rodinModeLabel'))).toBeInTheDocument()
  })

  it('窄屏真缺 key：圆键上 ⛔ 写「API Key」，点了就地弹配置窗、⛔ 不发生成', async () => {
    setViewportWidth(MOBILE_WIDTH)
    setup([])
    await mount()
    const round = document.querySelector<HTMLButtonElement>(
      'button[data-studio-generate]',
    )
    expect(round).not.toBeNull()
    expect(round).toBeEnabled()
    expect(round?.getAttribute('aria-label')).not.toContain(
      T('setupApiKeyButton'),
    )
    fireEvent.click(round!)
    expect(
      await screen.findByLabelText(text('QuickSetup.step2')),
    ).toBeInTheDocument()
    expect(generateRequests()).toHaveLength(0)
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
