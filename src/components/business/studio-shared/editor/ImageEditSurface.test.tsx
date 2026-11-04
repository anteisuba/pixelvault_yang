import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { stubBrowserLayout } from '@/test/browser-stubs'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  settle,
} from '@/test/studio-harness'
import type { UserApiKeyRecord } from '@/types'

import { ImageEditSurface } from './ImageEditSurface'

/**
 * 编辑躯干 · 提取元素选哪把 key：真 `useImageEditModelOptions`、真 `ModelPickerPopover`、
 * 真 `QuickSetupDialog`、真 key 名单（`ApiKeysProvider`）；只假网络。
 * 「跑了」= 真发出 `POST /api/image/extract`；「弹了配置」= 真配置窗的标题。
 */

const auth = vi.hoisted(() => ({ userId: 'user-0', n: 0 }))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: auth.userId }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
}))

const T = (key: string) => text(`StudioImageEdit.${key}`)
const ok = (data: unknown) => Response.json({ success: true, data })
const GEMINI = 'gemini-3-pro-image'

function makeKey(
  modelId: string,
  adapterType: AI_ADAPTER_TYPES,
): UserApiKeyRecord {
  return {
    id: `${adapterType}-key`,
    modelId,
    adapterType,
    providerConfig: getDefaultProviderConfig(adapterType),
    label: 'Test key',
    maskedKey: 'test-****',
    isActive: true,
    createdAt: new Date('2026-01-01'),
  }
}

let server: ReturnType<typeof fakeStudioServer>
let savedKeys: Array<{ adapterType: string; modelId: string }>

/** `keys`：key 名单回什么；`'pending'` = 名单一直没回来。 */
function setup(keys: UserApiKeyRecord[] | 'pending' = []) {
  savedKeys = []
  const store = keys === 'pending' ? [] : [...keys]
  server = fakeStudioServer()
    .on('GET', API_ENDPOINTS.API_KEYS, () =>
      keys === 'pending' ? new Promise<Response>(() => {}) : ok(store),
    )
    .on('POST', API_ENDPOINTS.API_KEYS, async (request) => {
      const body = (await request.json()) as {
        adapterType: AI_ADAPTER_TYPES
        modelId: string
      }
      savedKeys.push({ adapterType: body.adapterType, modelId: body.modelId })
      const created = makeKey(body.modelId, body.adapterType)
      store.push(created)
      return ok(created)
    })
    .on('POST', `${API_ENDPOINTS.API_KEYS}/:id/verify`, (_r, { params }) =>
      params.then(({ id }) => ok({ id, status: 'available' })),
    )
    .on('POST', API_ENDPOINTS.IMAGE_EXTRACT, () =>
      ok({
        imageUrl: 'https://cdn.example.com/extracted.png',
        width: 512,
        height: 512,
      }),
    )
    .on('POST', API_ENDPOINTS.EXTRACTED_ELEMENTS, () => ok({ id: 'el-1' }))
}

beforeEach(() => {
  auth.n += 1
  auth.userId = `user-${auth.n}`
  stubBrowserLayout()
})
afterEach(() => vi.unstubAllGlobals())

async function renderExtraction() {
  renderWithStudio(
    <ImageEditSurface
      sourceUrl="https://cdn.example.com/original.png"
      defaultTask="extract-element"
      onApplied={() => true}
    />,
  )
  await settle()
  await settle()
}

const extractRequests = () =>
  server.requests.filter((r) => r.path === API_ENDPOINTS.IMAGE_EXTRACT)

const setupDialog = () => screen.queryByRole('dialog')

/** 在真配置窗里填 key、点验证，等它报「已保存」，再按 Esc 关掉（⛔ 真等它自己 1.5 秒后关）。 */
async function verifyInDialog() {
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText(text('QuickSetup.step2')), {
    target: { value: 'test-key-value' },
  })
  fireEvent.click(
    within(dialog).getByRole('button', { name: text('QuickSetup.verify') }),
  )
  await within(dialog).findAllByText(text('QuickSetup.saved'))
  fireEvent.keyDown(dialog, { key: 'Escape' })
  await waitFor(() => expect(setupDialog()).not.toBeInTheDocument())
}

/** 打开模型胶囊，点 Gemini 那一行。 */
function pickGemini() {
  fireEvent.click(screen.getByRole('button', { name: /GPT Image/ }))
  const row = document.querySelector(`[data-model-key="${GEMINI}"]`)
  expect(row).not.toBeNull()
  fireEvent.click(row as HTMLElement)
}

describe('ImageEditSurface · 提取元素凭据选择', () => {
  it('没配 OpenAI 时点提取：就地弹 OpenAI 配置、⛔ 不发请求；配好再点就跑', async () => {
    setup()
    await renderExtraction()
    fireEvent.click(screen.getByRole('button', { name: T('extract.run') }))

    expect(setupDialog()).toHaveTextContent('GPT Image 2')
    expect(extractRequests()).toHaveLength(0)
    await verifyInDialog()
    expect(savedKeys).toEqual([
      { adapterType: AI_ADAPTER_TYPES.OPENAI, modelId: 'gpt-image-2' },
    ])

    fireEvent.click(screen.getByRole('button', { name: T('extract.run') }))
    await waitFor(() => expect(extractRequests()).toHaveLength(1))
  })

  it('配好 OpenAI 后换没配的 Gemini：弹 Gemini 配置，⛔ 沿用 OpenAI 那把去跑', async () => {
    setup([makeKey('gpt-image-2', AI_ADAPTER_TYPES.OPENAI)])
    await renderExtraction()
    pickGemini()

    await waitFor(() => expect(setupDialog()).toBeInTheDocument())
    await verifyInDialog()
    expect(savedKeys).toEqual([
      { adapterType: AI_ADAPTER_TYPES.GEMINI, modelId: GEMINI },
    ])
    expect(extractRequests()).toHaveLength(0)
  })

  it('切到已有对应凭据的 Gemini 后可直接提取', async () => {
    setup([
      makeKey('gpt-image-2', AI_ADAPTER_TYPES.OPENAI),
      makeKey(GEMINI, AI_ADAPTER_TYPES.GEMINI),
    ])
    await renderExtraction()
    pickGemini()
    expect(setupDialog()).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: T('extract.run') }))
    await waitFor(() => expect(extractRequests()).toHaveLength(1))
    const [, init] = vi
      .mocked(fetch)
      .mock.calls.find(([input]) =>
        String(input).includes(API_ENDPOINTS.IMAGE_EXTRACT),
      )!
    expect(JSON.parse(String(init?.body))).toMatchObject({
      modelId: GEMINI,
      prompt: 'clothing',
    })
    expect(setupDialog()).not.toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: T('extract.run') }),
      ).toBeEnabled(),
    )
  })

  it('key 名单还没回来：不知道缺不缺，照常提取、⛔ 不弹配置', async () => {
    setup('pending')
    await renderExtraction()
    fireEvent.click(screen.getByRole('button', { name: T('extract.run') }))

    await waitFor(() => expect(extractRequests()).toHaveLength(1))
    expect(setupDialog()).not.toBeInTheDocument()
  })

  it('同模型但不同 adapter 的已存凭据不能放行 Gemini', async () => {
    setup([
      makeKey('gpt-image-2', AI_ADAPTER_TYPES.OPENAI),
      { ...makeKey(GEMINI, AI_ADAPTER_TYPES.OPENAI), id: 'wrong-adapter' },
    ])
    await renderExtraction()
    pickGemini()

    await waitFor(() => expect(setupDialog()).toBeInTheDocument())
    await verifyInDialog()
    expect(savedKeys).toEqual([
      { adapterType: AI_ADAPTER_TYPES.GEMINI, modelId: GEMINI },
    ])
    expect(extractRequests()).toHaveLength(0)
  })
})
