import { useState } from 'react'
import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  SHOT_READ_DEFAULT_FIELDS,
  SHOT_READ_FIELD_IDS,
} from '@/constants/shot-reading'

/**
 * 拉片纸上「顺便读每一镜」那一格（H4b）的回归闸：
 *  ① 有 Gemini key：默认勾上，三样分开勾，最后一样勾着的取消不掉；取消 = 不读。
 *  ② 没 Gemini key：照列不禁用（Hard Rule 8），勾的那一下就地开 `QuickSetupDialog`，
 *     验过才勾上、用的是刚配好的那把。
 * 真的 `ApiKeysProvider` + 真的 `QuickSetupDialog`；只假 api-client 上 key 那几条。
 */

/** 文案原样回 key，好断言写的是哪一句。 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const scene = vi.hoisted(() => ({ gemini: true, userSeq: 0 }))
const keysApi = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  verify: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  listApiKeys: keysApi.list,
  createApiKey: keysApi.create,
  verifyApiKey: keysApi.verify,
  deleteApiKey: keysApi.remove,
}))
// ⚠ key 名单缓存按用户存：每例换一个 userId，免得读到上一例的名单。
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    userId: `shot-read-user-${scene.userSeq}`,
    isLoaded: true,
    isSignedIn: true,
  }),
}))

import { ApiKeysProvider } from '@/contexts/api-keys-context'
import {
  apiKeyRecord,
  openQuickSetup,
  runIdleTasksImmediately,
  submitQuickSetup,
} from '@/test/api-keys'

import {
  resolveShotPullRead,
  SHOT_PULL_READ_DRAFT,
  SHOT_READ_GEMINI_SETUP,
  ShotPullReadOption,
  useShotPullReadKey,
  type ShotPullReadChoice,
} from './ShotPullReadOption'

/** 与拉片纸同一种接法：草稿在宿主，key 由 `useShotPullReadKey` 挑。 */
function Host({
  onChoice,
}: {
  onChoice(choice: ShotPullReadChoice | null): void
}) {
  const [draft, setDraft] = useState(SHOT_PULL_READ_DRAFT)
  const keyId = useShotPullReadKey(draft)
  onChoice(resolveShotPullRead(draft, keyId))
  return (
    <ShotPullReadOption
      shotCount={12}
      draft={draft}
      keyId={keyId}
      onChange={setDraft}
    />
  )
}

function render() {
  const choices: (ShotPullReadChoice | null)[] = []
  rtlRender(
    <ApiKeysProvider>
      <Host onChoice={(choice) => choices.push(choice)} />
    </ApiKeysProvider>,
  )
  return { last: () => choices.at(-1) }
}

async function keysSettled() {
  await waitFor(() => expect(keysApi.list).toHaveBeenCalled())
  await act(async () => {})
}

const toggle = () =>
  screen.getByTestId('shot-pull-read-toggle') as HTMLInputElement
const field = (id: string) => screen.getByTestId(`shot-pull-read-field-${id}`)

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  runIdleTasksImmediately()
  scene.userSeq += 1
  scene.gemini = true
  keysApi.list.mockImplementation(async () => ({
    success: true,
    data: scene.gemini
      ? [
          apiKeyRecord({
            id: 'gem-1',
            adapterType: AI_ADAPTER_TYPES.GEMINI,
          }),
        ]
      : [apiKeyRecord({ id: 'oa-1', adapterType: AI_ADAPTER_TYPES.OPENAI })],
  }))
  keysApi.create.mockImplementation(async (input: { modelId: string }) => ({
    success: true,
    data: apiKeyRecord({
      id: 'gem-new',
      modelId: input.modelId,
      adapterType: AI_ADAPTER_TYPES.GEMINI,
    }),
  }))
  keysApi.verify.mockResolvedValue({
    success: true,
    data: { status: 'available' },
  })
})

describe('ShotPullReadOption', () => {
  it('有 Gemini key：默认勾上、用那把 key；单镜风格默认不勾', async () => {
    const { last } = render()
    await keysSettled()

    expect(toggle().checked).toBe(true)
    expect(screen.getByTestId('shot-pull-read').dataset.on).toBe('true')
    expect(last()).toEqual({
      apiKeyId: 'gem-1',
      fields: SHOT_READ_DEFAULT_FIELDS,
    })
    expect(field(SHOT_READ_FIELD_IDS.sizeMove)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(field(SHOT_READ_FIELD_IDS.look)).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.queryByTestId('shot-pull-read-no-key')).toBeNull()
  })

  it('三样分开勾；最后一样勾着的取消不掉；取消读镜 = 不读', async () => {
    const { last } = render()
    await keysSettled()

    fireEvent.click(field(SHOT_READ_FIELD_IDS.look))
    expect(last()?.fields).toEqual([
      SHOT_READ_FIELD_IDS.sizeMove,
      SHOT_READ_FIELD_IDS.description,
      SHOT_READ_FIELD_IDS.look,
    ])

    fireEvent.click(field(SHOT_READ_FIELD_IDS.sizeMove))
    fireEvent.click(field(SHOT_READ_FIELD_IDS.description))
    expect(last()?.fields).toEqual([SHOT_READ_FIELD_IDS.look])
    // 只剩一样：点它不动（一样都不读 = 不勾读镜）。
    fireEvent.click(field(SHOT_READ_FIELD_IDS.look))
    expect(last()?.fields).toEqual([SHOT_READ_FIELD_IDS.look])

    fireEvent.click(toggle())
    expect(toggle().checked).toBe(false)
    expect(last()).toBeNull()
    expect(
      screen.queryByTestId(`shot-pull-read-field-${SHOT_READ_FIELD_IDS.look}`),
    ).toBeNull()
  })

  it('没 Gemini key：照列不禁用、写一句；勾的那一下就地配 key，验过才勾上、用刚配的那把', async () => {
    scene.gemini = false
    const { last } = render()
    await keysSettled()

    expect(toggle().checked).toBe(false)
    expect(toggle().disabled).toBe(false)
    expect(screen.getByTestId('shot-pull-read-no-key')).toHaveTextContent(
      'noKey',
    )
    expect(last()).toBeNull()

    fireEvent.click(toggle())
    // ⛔ 还没配好就不勾。
    expect(toggle().checked).toBe(false)
    expect(openQuickSetup()).not.toBeNull()

    submitQuickSetup('verify')
    await waitFor(() =>
      expect(keysApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: SHOT_READ_GEMINI_SETUP?.modelId }),
      ),
    )
    await waitFor(() => expect(toggle().checked).toBe(true))
    expect(last()).toEqual({
      apiKeyId: 'gem-new',
      fields: SHOT_READ_DEFAULT_FIELDS,
    })
  })

  it('没 Gemini key、弹窗关掉：不勾，照样能只切镜落表', async () => {
    scene.gemini = false
    const { last } = render()
    await keysSettled()

    fireEvent.click(toggle())
    expect(openQuickSetup()).not.toBeNull()
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    })
    await waitFor(() => expect(openQuickSetup()).toBeNull())
    expect(toggle().checked).toBe(false)
    expect(last()).toBeNull()
    expect(keysApi.create).not.toHaveBeenCalled()
  })
})
