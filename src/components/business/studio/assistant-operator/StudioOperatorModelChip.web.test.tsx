import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  ASSISTANT_ROUTE_MODEL_AUTO,
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
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

/** 弹层原语换成直通：本测试问的是 chip 的选项与落库，不是 Radix 的锚定。 */
vi.mock('@/components/ui/responsive-popover', async () => {
  const React = await import('react')
  const Ctx = React.createContext<{
    open: boolean
    setOpen(next: boolean): void
  }>({ open: false, setOpen: () => {} })
  return {
    ResponsivePopover: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean
      onOpenChange(next: boolean): void
      children: React.ReactNode
    }) => (
      <Ctx.Provider value={{ open, setOpen: onOpenChange }}>
        {children}
      </Ctx.Provider>
    ),
    ResponsivePopoverTrigger: ({
      children,
    }: {
      children: React.ReactElement<{ onClick?: () => void }>
    }) => {
      const { open, setOpen } = React.useContext(Ctx)
      return React.cloneElement(children, { onClick: () => setOpen(!open) })
    },
    ResponsivePopoverContent: ({ children }: { children: React.ReactNode }) => {
      const { open } = React.useContext(Ctx)
      return open ? <div>{children}</div> : null
    },
  }
})

const quickSetup = vi.fn()
vi.mock('@/components/business/studio-shared/setup/QuickSetupDialog', () => ({
  QuickSetupDialog: (props: { open: boolean; modelId: string }) => {
    // ⚠ 开着才挂 —— 挂上本身就是「它开了」。
    quickSetup(props.modelId)
    return null
  },
}))

/** 绑过 key 的那几条 —— 只给 OpenAI 的四条，其余走「待配置」。 */
const BOUND = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.filter(
  (model) =>
    model.adapterType === NODE_STUDIO_ASSISTANT_ROUTE_MODELS[0].adapterType,
)
vi.mock('@/hooks/use-llm-route-picker', () => ({
  useLLMRoutePicker: () => ({
    savedRoutes: BOUND.map((model) => ({
      optionId: `llm-route:assistant:key:k1:${model.modelId}`,
      apiKeyId: 'k1',
      adapterType: model.adapterType,
      modelId: model.modelId,
      label: model.label,
      providerLabel: 'OpenAI',
      isSaved: true,
    })),
    lockedRoutes: [],
    allRoutes: [],
    healthMap: {},
  }),
}))

import { StudioOperatorModelChip } from './StudioOperatorModelChip'

function openMenu() {
  fireEvent.click(screen.getByTestId('operator-model-chip'))
}

describe('StudioOperatorModelChip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('「自动」排第一、默认打勾，九条模型按厂商分组列全', () => {
    render(
      <StudioOperatorModelChip
        value={ASSISTANT_ROUTE_MODEL_AUTO}
        onChange={vi.fn()}
      />,
    )
    openMenu()

    const options = screen.getAllByRole('menuitemradio')
    expect(options).toHaveLength(NODE_STUDIO_ASSISTANT_ROUTE_MODELS.length + 1)
    expect(options[0]).toBe(screen.getByTestId('operator-model-option-auto'))
    expect(options[0]).toHaveAttribute('aria-checked', 'true')
    // chip 上一份、选项里一份 —— 两处说的是同一档。
    expect(screen.getAllByText('auto')).toHaveLength(2)
    expect(screen.getByText('autoHint')).toBeInTheDocument()

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

  it('选中一个模型即写 persona，chip 上就地换成它', async () => {
    const onChange = vi.fn().mockResolvedValue(true)
    render(
      <StudioOperatorModelChip
        value={ASSISTANT_ROUTE_MODEL_AUTO}
        onChange={onChange}
      />,
    )
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

  it('刷新后仍是上次选的那一档 —— 回填的 persona 值说了算', () => {
    const pinned = BOUND[2].modelId as AssistantRouteModel
    render(<StudioOperatorModelChip value={pinned} onChange={vi.fn()} />)

    expect(screen.getByTestId('operator-model-chip')).toHaveTextContent(
      BOUND[2].label,
    )
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

  it('缺 key 的模型照列不禁用，点它进 QuickSetupDialog 而不是就地写', () => {
    const onChange = vi.fn()
    render(
      <StudioOperatorModelChip
        value={ASSISTANT_ROUTE_MODEL_AUTO}
        onChange={onChange}
      />,
    )
    openMenu()

    const locked = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
      (model) => !BOUND.some((bound) => bound.modelId === model.modelId),
    )!
    const option = screen.getByTestId(`operator-model-option-${locked.modelId}`)
    expect(option).not.toBeDisabled()
    fireEvent.click(option)

    expect(onChange).not.toHaveBeenCalled()
    expect(quickSetup).toHaveBeenLastCalledWith(locked.modelId)
  })
})
