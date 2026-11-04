import type { ReactElement } from 'react'
import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { ASSISTANT_PROVIDER_ORDER } from '@/constants/assistant'
import {
  ASSISTANT_ROUTE_MODEL_AUTO,
  pickAutoAssistantRouteModel,
  type AssistantRouteModel,
} from '@/constants/assistant-persona'
import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'

/**
 * 文本模型 chip（v2 §4.5 · 画板 BCards「文本模型选择器展开」）的回归闸：
 *  ① 「自动」是**真选项**：排第一、默认打勾（`aria-checked`）。
 *  ② 九条模型**一条不少**，按厂商分组。
 *  ③ 选中即写 persona（持久化），⛔ 不是组件内存态 —— 刷新后靠回填的
 *     `value` 仍是所选那一档（本测试用重挂 + 新 `value` 模拟那次刷新）。
 *  ④ 缺 key 的模型不禁用，点它进 `QuickSetupDialog`（Hard Rule 8）。
 *  ⑤ 「自动」挑的是哪一档就写在 chip 上（owner 2026-10-15「全跟助手」），与服务端
 *     `resolveAssistantRoute` 是同一个函数；一把 key 都没有时点「自动」就地开
 *     `QuickSetupDialog`，配好才选上。
 */

/** 文案原样回 key；带 `{model}` 的那几句把型号拼在括号里，好断言 chip 写的是哪一档。 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { model?: string }) =>
    values?.model ? `${key}(${values.model})` : key,
}))

/**
 * 真的 `ApiKeysProvider` → 真的 `useLLMRoutePicker` → 真的 `QuickSetupDialog`；
 * 只假 api-client 上 key 那几条。
 * - `routeKeys.hasLoaded = false`：名单那一趟一直不回来。
 * - `routeKeys.none = true`：回来了，但一把 key 都没有。
 * - 默认：只有 OpenAI 一把（只给 OpenAI 那几条，其余走「待配置」）。
 */
const routeKeys = vi.hoisted(() => ({
  hasLoaded: true,
  none: false,
  userSeq: 0,
}))
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
    userId: `chip-user-${routeKeys.userSeq}`,
    isLoaded: true,
    isSignedIn: true,
  }),
}))

/** 绑过 key 的那几条 —— 只给 OpenAI 的那几条，其余走「待配置」。 */
const BOUND = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.filter(
  (model) =>
    model.adapterType === NODE_STUDIO_ASSISTANT_ROUTE_MODELS[0].adapterType,
)

import { ApiKeysProvider } from '@/contexts/api-keys-context'
import {
  apiKeyRecord,
  openQuickSetup,
  runIdleTasksImmediately,
  submitQuickSetup,
} from '@/test/api-keys'

import { StudioOperatorModelChip } from './StudioOperatorModelChip'

function render(ui: ReactElement) {
  return rtlRender(<ApiKeysProvider>{ui}</ApiKeysProvider>)
}

/** 名单回来了（`hasLoaded = false` 时一直不回来，什么都不等）。 */
async function keysSettled() {
  if (!routeKeys.hasLoaded) return
  await waitFor(() => expect(keysApi.list).toHaveBeenCalled())
  await act(async () => {})
}

function openMenu() {
  fireEvent.click(screen.getByTestId('operator-model-chip'))
}

describe('StudioOperatorModelChip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    runIdleTasksImmediately()
    routeKeys.hasLoaded = true
    routeKeys.none = false
    routeKeys.userSeq += 1
    keysApi.list.mockImplementation(() =>
      routeKeys.hasLoaded
        ? Promise.resolve({
            success: true,
            data: routeKeys.none
              ? []
              : [
                  apiKeyRecord({
                    id: 'k1',
                    adapterType: BOUND[0].adapterType,
                    modelId: BOUND[0].modelId,
                  }),
                ],
          })
        : new Promise(() => {}),
    )
    keysApi.create.mockImplementation(async (input: { modelId: string }) => ({
      success: true,
      data: apiKeyRecord({ id: 'k-new', modelId: input.modelId }),
    }))
    keysApi.verify.mockResolvedValue({
      success: true,
      data: { status: 'available' },
    })
  })

  it('「自动」排第一、默认打勾，九条模型按厂商分组列全', async () => {
    render(
      <StudioOperatorModelChip
        value={ASSISTANT_ROUTE_MODEL_AUTO}
        onChange={vi.fn()}
      />,
    )
    await keysSettled()
    openMenu()

    const options = screen.getAllByRole('menuitemradio')
    expect(options).toHaveLength(NODE_STUDIO_ASSISTANT_ROUTE_MODELS.length + 1)
    expect(options[0]).toBe(screen.getByTestId('operator-model-option-auto'))
    expect(options[0]).toHaveAttribute('aria-checked', 'true')
    // chip 上写「自动」挑到的那一档，选项里那一行同样点名它 —— 两处说的是同一档。
    const picked = pickAutoAssistantRouteModel([BOUND[0].adapterType])!
    expect(screen.getByTestId('operator-model-chip')).toHaveTextContent(
      `autoResolved(${picked.label})`,
    )
    expect(
      screen.getByTestId('operator-model-option-auto-hint'),
    ).toHaveTextContent(`autoHintResolved(${picked.label})`)

    for (const model of NODE_STUDIO_ASSISTANT_ROUTE_MODELS) {
      expect(
        screen.getByTestId(`operator-model-option-${model.modelId}`),
      ).toBeInTheDocument()
    }
    // 分组标题 = 厂商，出现次数 = 不同 adapter 的个数。
    const adapters = new Set(
      NODE_STUDIO_ASSISTANT_ROUTE_MODELS.map((model) => model.adapterType),
    )
    expect(
      screen.getByTestId('operator-model-chip-menu').querySelectorAll('p'),
    ).toHaveLength(adapters.size)
  })

  it('手机（searchable）：卡顶搜索按模型名筛，「自动」让位，搜不到写一句', async () => {
    render(
      <StudioOperatorModelChip
        value={ASSISTANT_ROUTE_MODEL_AUTO}
        onChange={vi.fn()}
        searchable
      />,
    )
    await keysSettled()
    openMenu()
    const target = NODE_STUDIO_ASSISTANT_ROUTE_MODELS[0]
    fireEvent.change(screen.getByTestId('operator-model-search'), {
      target: { value: target.label },
    })
    expect(screen.queryByTestId('operator-model-option-auto')).toBeNull()
    expect(
      screen.getByTestId(`operator-model-option-${target.modelId}`),
    ).toBeInTheDocument()
    const others = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.filter(
      (model) =>
        !model.label.toLowerCase().includes(target.label.toLowerCase()),
    )
    for (const model of others) {
      expect(
        screen.queryByTestId(`operator-model-option-${model.modelId}`),
      ).toBeNull()
    }

    fireEvent.change(screen.getByTestId('operator-model-search'), {
      target: { value: 'zzz-no-such-model' },
    })
    expect(
      screen.getByTestId('operator-model-search-empty'),
    ).toBeInTheDocument()
  })

  it('桌面不传 searchable：没有搜索格', async () => {
    render(
      <StudioOperatorModelChip
        value={ASSISTANT_ROUTE_MODEL_AUTO}
        onChange={vi.fn()}
      />,
    )
    await keysSettled()
    openMenu()
    expect(screen.queryByTestId('operator-model-search')).toBeNull()
  })

  it('选中一个模型即写 persona，chip 上就地换成它', async () => {
    const onChange = vi.fn().mockResolvedValue(true)
    render(
      <StudioOperatorModelChip
        value={ASSISTANT_ROUTE_MODEL_AUTO}
        onChange={onChange}
      />,
    )
    await keysSettled()
    openMenu()

    const target = BOUND[1]
    fireEvent.click(
      screen.getByTestId(`operator-model-option-${target.modelId}`),
    )

    expect(onChange).toHaveBeenCalledWith(target.modelId)
    // 乐观：库里那一跳还没回来，chip 上已经是它。
    await waitFor(() =>
      expect(screen.getByTestId('operator-model-chip')).toHaveTextContent(
        target.label,
      ),
    )
  })

  it('刷新后仍是上次选的那一档 —— 回填的 persona 值说了算', async () => {
    const pinned = BOUND[2].modelId as AssistantRouteModel
    render(<StudioOperatorModelChip value={pinned} onChange={vi.fn()} />)

    expect(screen.getByTestId('operator-model-chip')).toHaveTextContent(
      BOUND[2].label,
    )
    await keysSettled()
    openMenu()
    expect(
      screen.getByTestId(`operator-model-option-${pinned}`),
    ).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('operator-model-option-auto')).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('存不上时把乐观显示撤回，⛔ 不留假选中', async () => {
    const onChange = vi.fn().mockResolvedValue(false)
    render(
      <StudioOperatorModelChip
        value={ASSISTANT_ROUTE_MODEL_AUTO}
        onChange={onChange}
      />,
    )
    await keysSettled()
    openMenu()
    fireEvent.click(
      screen.getByTestId(`operator-model-option-${BOUND[1].modelId}`),
    )

    await waitFor(() =>
      expect(screen.getByTestId('operator-model-chip')).toHaveTextContent(
        'auto',
      ),
    )
  })

  it('缺 key 的模型照列不禁用，点它进 QuickSetupDialog 而不是就地写', async () => {
    const onChange = vi.fn()
    render(
      <StudioOperatorModelChip
        value={ASSISTANT_ROUTE_MODEL_AUTO}
        onChange={onChange}
      />,
    )
    await keysSettled()
    openMenu()

    const locked = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
      (model) => !BOUND.some((bound) => bound.modelId === model.modelId),
    )!
    const option = screen.getByTestId(`operator-model-option-${locked.modelId}`)
    expect(option).not.toBeDisabled()
    fireEvent.click(option)

    expect(onChange).not.toHaveBeenCalled()
    expect(openQuickSetup()).toHaveTextContent(`title(${locked.label})`)
  })

  it('key 名单还没回来：不标「需要 key」，点了照常写 persona、⛔ 不弹配置', async () => {
    routeKeys.hasLoaded = false
    const onChange = vi.fn()
    render(
      <StudioOperatorModelChip
        value={ASSISTANT_ROUTE_MODEL_AUTO}
        onChange={onChange}
      />,
    )
    await keysSettled()
    openMenu()

    expect(screen.queryByText('needsKey')).not.toBeInTheDocument()
    const target = NODE_STUDIO_ASSISTANT_ROUTE_MODELS[1]
    fireEvent.click(
      screen.getByTestId(`operator-model-option-${target.modelId}`),
    )

    expect(onChange).toHaveBeenCalledWith(target.modelId)
    expect(openQuickSetup()).toBeNull()
  })

  it('「自动」挑的那一档写在 chip 上，与服务端是同一个函数（顺序里第一家配了 key 的默认档）', async () => {
    render(
      <StudioOperatorModelChip
        value={ASSISTANT_ROUTE_MODEL_AUTO}
        onChange={vi.fn()}
      />,
    )
    await keysSettled()

    // 只有 OpenAI 的 key → 「自动 · OpenAI GPT-6.1 Sol」。
    const picked = pickAutoAssistantRouteModel(
      BOUND.map((model) => model.adapterType),
    )!
    expect(picked.adapterType).toBe(BOUND[0].adapterType)
    expect(picked.modelId).toBe(BOUND[0].modelId)
    expect(screen.getByTestId('operator-model-chip')).toHaveTextContent(
      `autoResolved(${picked.label})`,
    )
  })

  it('key 名单还没回来：chip 只写「自动」，⛔ 不猜是哪一家', async () => {
    routeKeys.hasLoaded = false
    render(
      <StudioOperatorModelChip
        value={ASSISTANT_ROUTE_MODEL_AUTO}
        onChange={vi.fn()}
      />,
    )
    await keysSettled()

    expect(screen.getByTestId('operator-model-chip')).toHaveTextContent(
      /^auto$/,
    )
    openMenu()
    expect(
      screen.getByTestId('operator-model-option-auto-hint'),
    ).toHaveTextContent(/^autoHint$/)
  })

  it('一把 key 都没有：点「自动」就地开 QuickSetupDialog（顺序第一家的默认档），配好才选上「自动」', async () => {
    routeKeys.none = true
    const onChange = vi.fn().mockResolvedValue(true)
    const pinned = NODE_STUDIO_ASSISTANT_ROUTE_MODELS[1]!
      .modelId as AssistantRouteModel
    render(<StudioOperatorModelChip value={pinned} onChange={onChange} />)
    await keysSettled()
    openMenu()

    expect(
      screen.getByTestId('operator-model-option-auto-hint'),
    ).toHaveTextContent(/^autoHintNoKey$/)
    fireEvent.click(screen.getByTestId('operator-model-option-auto'))

    const setupModel = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
      (model) => model.adapterType === ASSISTANT_PROVIDER_ORDER[0],
    )!
    // ⛔ 还没配好就不选：不写 persona。
    expect(onChange).not.toHaveBeenCalled()
    expect(openQuickSetup()).toHaveTextContent(`title(${setupModel.label})`)

    // 在真弹窗里填 key、验证通过。
    submitQuickSetup('verify')
    await waitFor(() =>
      expect(keysApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ modelId: setupModel.modelId }),
      ),
    )

    // 配好了 → 选上的是「自动」，⛔ 不是刚配的那一档。
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(ASSISTANT_ROUTE_MODEL_AUTO),
    )
  })
})
