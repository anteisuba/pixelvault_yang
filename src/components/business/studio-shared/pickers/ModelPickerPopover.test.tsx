import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, within } from '@testing-library/react'

const navigation = vi.hoisted(() => ({ push: vi.fn() }))
/** key 名单回没回来 —— 默认回来了；「还不知道」那组用例自己改成 false。 */
const apiKeys = vi.hoisted(() => ({ hasLoaded: true }))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
  usePathname: () => '/studio/image',
}))

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      values
        ? `${namespace}.${key}(${JSON.stringify(values)})`
        : `${namespace}.${key}`,
}))

/** 缺 key 就地弹的配置窗 —— 只认它开没开、开给哪家，「验证」一键回调。 */
vi.mock('@/components/business/studio-shared/setup/QuickSetupDialog', () => ({
  QuickSetupDialog: ({
    modelId,
    adapterType,
    onVerified,
  }: {
    modelId: string
    adapterType: string
    onVerified?: (modelId: string, keyId: string) => void
  }) => (
    <div data-testid="quick-setup" data-adapter={adapterType}>
      <button type="button" onClick={() => onVerified?.(modelId, 'k1')}>
        verify
      </button>
    </div>
  ),
}))

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: vi.fn(() => ({
    keys: [],
    healthMap: {},
    isLoading: false,
    hasLoaded: apiKeys.hasLoaded,
  })),
}))

import type { StudioModelOption } from '@/types/model-option'
import {
  ModelPickerPopover,
  placeCanvasModelPopover,
} from '@/components/business/studio-shared/pickers/ModelPickerPopover'
import { StudioChipDensityProvider } from '@/components/business/studio-shared/primitives/tool-surface'
import { AI_MODELS } from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import {
  modelPickerGateKey,
  requestModelPickerOpen,
  resetModelPickerGate,
} from '@/lib/model-picker-gate'

function option(over: Partial<StudioModelOption>): StudioModelOption {
  const adapterType = over.adapterType ?? AI_ADAPTER_TYPES.FAL
  return {
    optionId: over.optionId ?? 'opt',
    modelId: over.modelId ?? 'model',
    displayLabel: over.displayLabel,
    adapterType,
    providerConfig:
      over.providerConfig ?? getDefaultProviderConfig(adapterType),
    requestCount: 1,
    isBuiltIn: true,
    sourceType: over.sourceType ?? 'workspace',
    keyId: over.keyId,
    providerKeyId: over.providerKeyId,
  }
}

/**
 * 真实目录 id：分组读 `MODEL_FAMILIES` / `MODEL_VARIANTS`，编造 id 只会走兜底。
 * Seedream 5.0 Pro 铺两条渠道（都配了 key），Lite 与 GPT Image 2 各只有一条且缺 key。
 */
const FIXTURE: StudioModelOption[] = [
  option({
    optionId: 'key:fal-1',
    modelId: AI_MODELS.SEEDREAM_50_PRO,
    displayLabel: 'Seedream 5.0 Pro',
    adapterType: AI_ADAPTER_TYPES.FAL,
    sourceType: 'saved',
    keyId: 'fal-1',
  }),
  option({
    optionId: 'workspace:seedream-5.0-pro-volcengine',
    modelId: AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE,
    displayLabel: 'Seedream 5.0 Pro（火山方舟）',
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerKeyId: 'volc-1',
  }),
  option({
    optionId: 'workspace:seedream-lite',
    modelId: AI_MODELS.SEEDREAM_50_LITE,
    displayLabel: 'Seedream 5.0 Lite',
    adapterType: AI_ADAPTER_TYPES.FAL,
  }),
  option({
    optionId: 'workspace:gpt-image-2',
    modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
    displayLabel: 'GPT Image 2',
    adapterType: AI_ADAPTER_TYPES.OPENAI,
  }),
]

/** 行是按 `data-model-key` 认的 —— 名与型号在行里是两格，⛔ 别按整段文字找。 */
function row(modelKey: string): HTMLElement {
  const el = document.querySelector(`[data-model-key="${modelKey}"]`)
  expect(el).not.toBeNull()
  return el as HTMLElement
}

function quickSetup(): HTMLElement | null {
  return screen.queryByTestId('quick-setup')
}

function channelPanel(): HTMLElement | null {
  return document.querySelector('[data-channel-panel]')
}

function openPicker(
  props: Partial<React.ComponentProps<typeof ModelPickerPopover>> = {},
) {
  const onChange = vi.fn()
  const view = render(
    <ModelPickerPopover
      options={FIXTURE}
      value={null}
      onChange={onChange}
      {...props}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /Common.selectModel/ }))
  return { onChange, ...view }
}

function openCanvasPicker(
  props: Partial<React.ComponentProps<typeof ModelPickerPopover>> = {},
) {
  const onChange = vi.fn()
  const view = render(
    <StudioChipDensityProvider value="compact">
      <div className="react-flow">
        <div className="react-flow__node" data-id="node-a" />
        <div data-node-chrome="prompt-bar">
          <ModelPickerPopover
            options={FIXTURE}
            value={null}
            onChange={onChange}
            canvasNodeId="node-a"
            {...props}
          />
        </div>
      </div>
    </StudioChipDensityProvider>,
  )
  fireEvent.click(document.querySelector('[data-model-chip]') as HTMLElement)
  return { onChange, ...view }
}

beforeEach(() => {
  window.localStorage.clear()
  navigation.push.mockClear()
  apiKeys.hasLoaded = true
  // 「未选渠道」住模块级 store —— 不清就会漏进下一个用例。
  resetModelPickerGate()
})

describe('ModelPickerPopover — 未配置渠道就地弹配置窗', () => {
  it('直接点未配置的单渠道模型行时先不选中，就地弹配置窗，⛔ 不跳页', () => {
    const { onChange } = openPicker()
    fireEvent.click(row('gpt-image-2'))
    expect(onChange).not.toHaveBeenCalled()
    expect(navigation.push).not.toHaveBeenCalled()
    expect(quickSetup()).toHaveAttribute('data-adapter', 'openai')
    expect(window.localStorage.length).toBe(0)
  })

  it('配置窗验证通过后才选中这一行', () => {
    const { onChange } = openPicker()
    fireEvent.click(row('gpt-image-2'))
    fireEvent.click(screen.getByRole('button', { name: 'verify' }))
    expect(onChange).toHaveBeenCalledWith(FIXTURE[3])
  })

  it.each([
    ['saved', { sourceType: 'saved' as const, keyId: 'openai-key' }],
    ['provider key', { providerKeyId: 'openai-key' }],
    ['Runner', { adapterType: AI_ADAPTER_TYPES.RUNNER }],
  ])('%s 渠道直接选择仍然正常', (_label, ready) => {
    const readyOption = option({
      optionId: 'ready:model',
      modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      ...ready,
    })
    const { onChange } = openPicker({ options: [readyOption] })
    fireEvent.click(document.querySelector('[data-model-key]') as HTMLElement)
    expect(onChange).toHaveBeenCalledWith(readyOption)
    expect(quickSetup()).toBeNull()
  })

  it('记住过的渠道失去 key 后不能通过模型行重新选中', () => {
    const { onChange, rerender } = openPicker()
    fireEvent.mouseEnter(row('seedream-5.0-pro'))
    fireEvent.click(
      within(channelPanel() as HTMLElement).getAllByRole(
        'option',
      )[0] as HTMLElement,
    )
    expect(onChange).toHaveBeenCalledTimes(1)
    const memoryBefore = { ...window.localStorage }
    rerender(
      <ModelPickerPopover
        options={FIXTURE.map((item) =>
          item.optionId === 'key:fal-1'
            ? { ...item, sourceType: 'workspace', keyId: undefined }
            : item,
        )}
        value={null}
        onChange={onChange}
      />,
    )
    onChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /Common.selectModel/ }))
    fireEvent.click(row('seedream-5.0-pro'))
    expect(onChange).not.toHaveBeenCalled()
    expect(quickSetup()).toHaveAttribute('data-adapter', 'fal')
    expect({ ...window.localStorage }).toEqual(memoryBefore)
  })
})

describe('ModelPickerPopover — 画布模型弹层', () => {
  it('候选先夹进安全区，再避开卡和提示词栏', () => {
    const safe = { left: 72, top: 64, right: 1424, bottom: 824 }
    expect(
      placeCanvasModelPopover({
        trigger: { x: 800, y: 220, width: 100, height: 28 },
        bar: { x: 700, y: 200, width: 300, height: 80 },
        card: { x: 350, y: 100, width: 300, height: 200 },
        safe,
        width: 300,
        height: 392,
      }),
    ).toMatchObject({ x: 800, y: 288 })
    expect(
      placeCanvasModelPopover({
        trigger: { x: 800, y: 550, width: 100, height: 28 },
        bar: { x: 300, y: 500, width: 640, height: 100 },
        card: { x: 450, y: 200, width: 300, height: 200 },
        safe,
        width: 300,
        height: 392,
      }),
    ).toMatchObject({ x: 948, y: 432 })
  })

  it('画布触发器实底28高、始终有字；弹层300宽、392高上限与搜索/底栏结构', () => {
    openCanvasPicker({ onManageChannels: vi.fn() })
    const chip = document.querySelector('[data-model-chip]') as HTMLElement
    const popup = document.querySelector(
      '[data-canvas-model-popover]',
    ) as HTMLElement
    expect(chip).toHaveAttribute('data-compact', 'true')
    expect(chip.className).toContain('h-7')
    expect(chip.textContent?.trim()).not.toBe('')
    expect(popup.className).toContain('w-75')
    expect(popup.className).toContain('max-h-98')
    expect(
      within(popup).getByPlaceholderText('ModelPicker.searchPlaceholder')
        .parentElement,
    ).toHaveClass('h-8.5')
    expect(
      within(popup).getByRole('button', { name: 'ModelPicker.manageChannels' }),
    ).toHaveClass('h-10')
  })

  it('系列组行只写型号，第二行是选中渠道及该渠道单价；缺 key 仍可点开配置窗', () => {
    const { onChange } = openCanvasPicker({ value: 'key:fal-1' })
    const pro = row('seedream-5.0-pro')
    expect(pro.textContent).toContain('5.0 Pro')
    expect(pro.textContent).not.toContain('Seedream')
    expect(pro.textContent).toContain('Common.unitPrice')
    expect(pro.parentElement?.querySelector('svg')).not.toBeNull()
    expect(pro).toHaveAttribute('aria-label', 'Seedream 5.0 Pro')
    const locked = row('gpt-image-2')
    expect(locked.textContent).toContain('ModelPicker.missingKeyConfigure')
    fireEvent.click(locked)
    expect(onChange).not.toHaveBeenCalled()
    expect(quickSetup()).toHaveAttribute('data-adapter', 'openai')
  })

  it('有厂商前缀的 GPT Image 组也只写型号；无固定单价如实写按用量计费', () => {
    const readyGpt = option({
      optionId: 'key:gpt',
      modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
      displayLabel: 'OpenAI GPT Image 2',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      sourceType: 'saved',
      keyId: 'gpt',
    })
    openCanvasPicker({
      options: [readyGpt],
      value: 'key:gpt',
    })
    const gpt = row('gpt-image-2')
    expect(gpt.textContent).toContain('2')
    expect(gpt.textContent).not.toContain('OpenAI GPT Image')
    expect(gpt.textContent).toContain('ModelPicker.usageBilled')
  })

  it('最近最多三行且写全名；多渠道行提供数量并可打开渠道价', () => {
    window.localStorage.setItem(
      'pv:model-picker:recent',
      JSON.stringify({
        default: [
          'seedream-5.0-pro',
          'seedream-5.0-lite',
          'gpt-image-2',
          'other',
        ],
      }),
    )
    openCanvasPicker()
    const recent = document.querySelector('[data-picker-recent]') as HTMLElement
    expect(within(recent).getAllByRole('option')).toHaveLength(3)
    expect(recent.textContent).toContain('Seedream 5.0 Pro')
    const pro = document.querySelector(
      '[data-picker-canvas-row][data-row-id="group:seedream-5.0-pro"]',
    ) as HTMLElement
    expect(pro.parentElement?.textContent).toContain(
      'ModelPicker.channelsCount',
    )
    fireEvent.click(
      pro.parentElement?.querySelector(
        '[data-picker-channel-trigger]',
      ) as HTMLElement,
    )
    const channels = within(channelPanel() as HTMLElement).getAllByRole(
      'option',
    )
    expect(channels).toHaveLength(2)
    expect(channels[0]?.textContent).toContain('Common.unitPrice')
  })

  it('多渠道行主体按自动选中的渠道选型号，行尾单独打开渠道面板', () => {
    const { onChange } = openCanvasPicker()
    const pro = row('seedream-5.0-pro')
    fireEvent.click(pro)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(['key:fal-1', 'workspace:seedream-5.0-pro-volcengine']).toContain(
      onChange.mock.calls[0]?.[0].optionId,
    )
    expect(window.localStorage.getItem('pv:model-picker:pending')).toBeNull()
  })

  it('选择后保持弹层 160ms，再开始收起', () => {
    vi.useFakeTimers()
    try {
      openCanvasPicker()
      fireEvent.click(row('seedream-5.0-pro'))
      const chip = document.querySelector('[data-model-chip]') as HTMLElement
      expect(chip).toHaveAttribute('data-active', 'true')
      act(() => vi.advanceTimersByTime(159))
      expect(chip).toHaveAttribute('data-active', 'true')
      act(() => vi.advanceTimersByTime(1))
      expect(chip).not.toHaveAttribute('data-active')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ModelPickerPopover — 行只有 模型 · 型号 · 价格', () => {
  /**
   * ⚠ 本条 2026-09-20 改口（owner 真机第 2 条，原话「有一个 NovelAI 的表示了，
   * 下面应该是版本号，不需要再重复」）：分组头已经写着厂商，行里**不再重复**它。
   */
  it('每个型号一行；头顶分组头写着厂商时行里只剩型号', () => {
    openPicker()
    const pro = row('seedream-5.0-pro')
    expect(pro.textContent).toContain('5.0 Pro')
    expect(pro.textContent).not.toContain('Seedream')
    // 省掉的只是眼睛看到的那一份 —— 读屏仍听得到完整的「哪一家的哪一版」。
    expect(pro).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Seedream'),
    )
    // 分组头自己还在。
    expect(
      Array.from(document.querySelectorAll('[data-picker-group]')).map(
        (node) => node.textContent,
      ),
    ).toContain('Seedream')
    // 渠道后缀的重复条目收敛成同一行。
    expect(screen.queryByText('Seedream 5.0 Pro（火山方舟）')).toBeNull()
    expect(screen.getAllByText('GPT Image').length).toBeGreaterThan(0)
  })

  it('搜索结果平铺、没有分组头 —— 行里把厂商名写回来', () => {
    openPicker()
    fireEvent.change(
      screen.getByPlaceholderText('ModelPicker.searchPlaceholder'),
      {
        target: { value: '5.0 pro' },
      },
    )

    const pro = row('seedream-5.0-pro')
    expect(pro.textContent).toContain('Seedream')
    expect(pro).not.toHaveAttribute('aria-label')
    // ⛔ 搜索态不画分组头（那才是行要自报家门的理由）。
    expect(document.querySelectorAll('[data-picker-group]')).toHaveLength(0)
  })

  it('多渠道但没选过 → 价格位写「—」', () => {
    openPicker()
    expect(row('seedream-5.0-pro').textContent).toContain(
      'ModelPicker.channelUnset',
    )
  })

  it('单渠道型号自动选中那一条，价格位直接写单价', () => {
    openPicker()
    // Lite 只有 fal 一条，但缺 key —— 缺 key 时价格位**不写字**。
    expect(row('seedream-5.0-lite').textContent).not.toContain('unitPrice')
    expect(row('seedream-5.0-lite').textContent).not.toContain(
      'ModelPicker.channelUnset',
    )
  })

  it('⛔ 行上不画状态点、不写渠道名、不写能力标', () => {
    openPicker()
    const pro = row('seedream-5.0-pro')
    expect(pro.querySelector('.bg-status-applied')).toBeNull()
    expect(pro.querySelector('.bg-status-warning')).toBeNull()
    expect(pro.textContent).not.toMatch(/fal|VolcEngine|火山/i)
  })
})

describe('ModelPickerPopover — 渠道面板', () => {
  it('hover 一行就把独立渠道面板摆到它旁边，每条写 点 · 名 · 价', () => {
    openPicker()
    expect(channelPanel()).toBeNull()
    fireEvent.mouseEnter(row('seedream-5.0-pro'))
    const panel = channelPanel()
    expect(panel).not.toBeNull()
    const rows = within(panel as HTMLElement).getAllByRole('option')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.querySelector('.bg-status-applied')).not.toBeNull()
    expect(rows[0]?.textContent).toContain('Common.unitPrice')
    // ⛔ 面板里没有对勾，选中只用底色。
    expect((panel as HTMLElement).querySelector('svg')).toBeNull()
  })

  it('单渠道型号的面板只有一行且已选中', () => {
    openPicker()
    fireEvent.mouseEnter(row('seedream-5.0-lite'))
    const rows = within(channelPanel() as HTMLElement).getAllByRole('option')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('data-channel-picked', 'true')
  })

  it('缺 key 的渠道是黄点，配了 key 的是绿点', () => {
    openPicker()
    fireEvent.mouseEnter(row('seedream-5.0-lite'))
    const locked = document.querySelector('[data-channel-has-key="false"]')
    expect(locked).not.toBeNull()
    expect(locked?.querySelector('.bg-status-warning')).not.toBeNull()
  })

  it('点一条渠道 = 选定 + 按型号记住，下次默认走它', () => {
    const { onChange } = openPicker()
    fireEvent.mouseEnter(row('seedream-5.0-pro'))
    const volc = within(channelPanel() as HTMLElement)
      .getAllByRole('option')
      .find((el) => /火山|VolcEngine/i.test(el.textContent ?? ''))
    fireEvent.click(volc as HTMLElement)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].optionId).toBe(
      'workspace:seedream-5.0-pro-volcengine',
    )
    expect(window.localStorage.getItem('pv:model-picker:channel')).toContain(
      'seedream-5.0-pro',
    )
  })
})

describe('ModelPickerPopover — 没有「自动」', () => {
  it('点多渠道行只停在「未选渠道」，⛔ 不替他挑一条', () => {
    const { onChange } = openPicker()
    fireEvent.click(row('seedream-5.0-pro'))
    expect(onChange).not.toHaveBeenCalled()
    // 记下的是型号，不是渠道。
    expect(window.localStorage.getItem('pv:model-picker:pending')).toContain(
      'seedream-5.0-pro',
    )
    expect(window.localStorage.getItem('pv:model-picker:channel')).toBeNull()
  })

  it('记住过渠道之后，点同一行一步到位', () => {
    const { onChange } = openPicker()
    fireEvent.mouseEnter(row('seedream-5.0-pro'))
    fireEvent.click(
      within(channelPanel() as HTMLElement).getAllByRole(
        'option',
      )[0] as HTMLElement,
    )
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('触发器在「选了型号没选渠道」时写「先选渠道」', () => {
    openPicker()
    fireEvent.click(row('seedream-5.0-pro'))
    const chip = document.querySelector('[data-model-chip]')
    expect(chip?.getAttribute('data-status-tone')).toBe('warning')
    expect(chip?.textContent).toContain('ModelPicker.pickChannel')
  })

  it('触发器在缺 key 的选中型号上写「缺 key」', () => {
    render(
      <ModelPickerPopover
        options={FIXTURE}
        value="workspace:seedream-lite"
        onChange={vi.fn()}
      />,
    )
    const chip = document.querySelector('[data-model-chip]')
    expect(chip?.getAttribute('data-status-tone')).toBe('warning')
    expect(chip?.textContent).toContain('ModelPicker.missingKey')
  })

  it('触发器在渠道就绪时写单价', () => {
    render(
      <ModelPickerPopover
        options={FIXTURE}
        value="key:fal-1"
        onChange={vi.fn()}
      />,
    )
    const chip = document.querySelector('[data-model-chip]')
    expect(chip?.getAttribute('data-status-tone')).toBeNull()
    expect(chip?.textContent).toContain('Common.unitPrice')
  })
})

describe('ModelPickerPopover — 缺 key 渠道就地弹配置窗', () => {
  it('点黄点渠道时关闭弹层、不选中，也不记住缺 key 渠道', () => {
    const { onChange } = openPicker()
    fireEvent.mouseEnter(row('gpt-image-2'))
    fireEvent.click(
      within(channelPanel() as HTMLElement).getAllByRole(
        'option',
      )[0] as HTMLElement,
    )
    expect(quickSetup()).toHaveAttribute('data-adapter', 'openai')
    expect(onChange).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBe(0)
    expect(channelPanel()).toBeNull()
  })

  it('黄点渠道验证通过后选中，并按型号记住这条渠道', () => {
    const { onChange } = openPicker()
    fireEvent.mouseEnter(row('gpt-image-2'))
    fireEvent.click(
      within(channelPanel() as HTMLElement).getAllByRole(
        'option',
      )[0] as HTMLElement,
    )
    fireEvent.click(screen.getByRole('button', { name: 'verify' }))
    expect(onChange).toHaveBeenCalledWith(FIXTURE[3])
    expect(window.localStorage.length).toBeGreaterThan(0)
  })

  it('多选模式点未配置模型行时不切换选项，就地弹配置窗', () => {
    const onToggleOption = vi.fn()
    const { onChange } = openPicker({
      selectedOptionIds: new Set<string>(),
      onToggleOption,
    })
    fireEvent.click(row('gpt-image-2'))
    expect(onToggleOption).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(quickSetup()).toHaveAttribute('data-adapter', 'openai')
    expect(window.localStorage.length).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'verify' }))
    expect(onToggleOption).toHaveBeenCalledWith(FIXTURE[3])
  })
})

describe('ModelPickerPopover — key 名单还没回来', () => {
  /**
   * 名单回来之前选项上还没有 `providerKeyId` —— 那是「还不知道」，不是「缺 key」
   * （2026-10-07 真机：有 key 的 NovelAI 先挂了约 3 秒「缺 key」）。
   */
  const chip = () => document.querySelector('[data-model-chip]')
  const withLiteKey = FIXTURE.map((item) =>
    item.optionId === 'workspace:seedream-lite'
      ? { ...item, providerKeyId: 'fal-1' }
      : item,
  )

  it('有 key 的型号：名单回来前后触发器都不写「缺 key」', () => {
    apiKeys.hasLoaded = false
    const { rerender } = render(
      <ModelPickerPopover
        options={FIXTURE}
        value="workspace:seedream-lite"
        onChange={vi.fn()}
      />,
    )
    expect(chip()?.getAttribute('data-status-tone')).toBeNull()
    expect(chip()?.textContent).not.toContain('ModelPicker.missingKey')

    apiKeys.hasLoaded = true
    rerender(
      <ModelPickerPopover
        options={withLiteKey}
        value="workspace:seedream-lite"
        onChange={vi.fn()}
      />,
    )
    expect(chip()?.getAttribute('data-status-tone')).toBeNull()
    expect(chip()?.textContent).toContain('Common.unitPrice')
  })

  it('真缺 key 的型号：名单回来之后照旧写「缺 key」', () => {
    apiKeys.hasLoaded = false
    const { rerender } = render(
      <ModelPickerPopover
        options={FIXTURE}
        value="workspace:seedream-lite"
        onChange={vi.fn()}
      />,
    )
    expect(chip()?.textContent).not.toContain('ModelPicker.missingKey')

    apiKeys.hasLoaded = true
    rerender(
      <ModelPickerPopover
        options={FIXTURE}
        value="workspace:seedream-lite"
        onChange={vi.fn()}
      />,
    )
    expect(chip()?.getAttribute('data-status-tone')).toBe('warning')
    expect(chip()?.textContent).toContain('ModelPicker.missingKey')
  })

  it('渠道是灰点不是黄点，行尾先摆一条灰条（加载中 2026-10-08）', () => {
    apiKeys.hasLoaded = false
    openPicker()
    const pending = row('seedream-5.0-lite').querySelector(
      '[data-picker-price-pending]',
    )
    expect(pending).not.toBeNull()
    expect(pending?.className).not.toContain('animate-pulse')
    expect(row('seedream-5.0-lite').textContent).not.toContain(
      'ModelPicker.missingKey',
    )
    fireEvent.mouseEnter(row('seedream-5.0-lite'))
    const panel = channelPanel() as HTMLElement
    expect(panel.querySelector('.bg-muted-foreground\\/40')).not.toBeNull()
    expect(panel.querySelector('.bg-status-warning')).toBeNull()
  })

  it('画布行不写「缺 key · 点了去配置」', () => {
    apiKeys.hasLoaded = false
    openCanvasPicker()
    const gpt = row('gpt-image-2')
    expect(gpt.textContent).not.toContain('ModelPicker.missingKeyConfigure')
    expect(gpt).not.toHaveAttribute('data-missing-key')
  })

  it('点模型行 = 照常选，⛔ 不跳配置页', () => {
    apiKeys.hasLoaded = false
    const { onChange } = openPicker()
    fireEvent.click(row('gpt-image-2'))
    expect(onChange).toHaveBeenCalledWith(FIXTURE[3])
    expect(quickSetup()).toBeNull()
  })

  it('点渠道 = 照常选，⛔ 不跳配置页', () => {
    apiKeys.hasLoaded = false
    const { onChange } = openPicker()
    fireEvent.mouseEnter(row('gpt-image-2'))
    fireEvent.click(
      within(channelPanel() as HTMLElement).getAllByRole(
        'option',
      )[0] as HTMLElement,
    )
    expect(onChange).toHaveBeenCalledWith(FIXTURE[3])
    expect(navigation.push).not.toHaveBeenCalled()
  })
})

describe('ModelPickerPopover — 其余契约', () => {
  it('搜索跨模型名、系列与渠道名过滤', () => {
    openPicker()
    fireEvent.change(
      screen.getByPlaceholderText('ModelPicker.searchPlaceholder'),
      { target: { value: 'gpt' } },
    )
    expect(
      document.querySelector('[data-model-key="gpt-image-2"]'),
    ).not.toBeNull()
    expect(
      document.querySelector('[data-model-key="seedream-5.0-pro"]'),
    ).toBeNull()
  })

  it('多选模式不关弹层，走 onToggleOption', () => {
    const onToggleOption = vi.fn()
    const { onChange } = openPicker({
      selectedOptionIds: new Set<string>(),
      onToggleOption,
    })
    fireEvent.mouseEnter(row('seedream-5.0-pro'))
    fireEvent.click(
      within(channelPanel() as HTMLElement).getAllByRole(
        'option',
      )[0] as HTMLElement,
    )
    expect(onToggleOption).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(
      document.querySelector('[data-model-key="seedream-5.0-lite"]'),
    ).not.toBeNull()
  })

  it('只在宿主接得住时渲染底部「配置渠道与 key…」', () => {
    const onManageChannels = vi.fn()
    openPicker({ onManageChannels })
    fireEvent.click(screen.getByText('ModelPicker.manageChannels'))
    expect(onManageChannels).toHaveBeenCalledTimes(1)
  })

  it('inline 模式只渲染面板本体，不渲染触发器', () => {
    render(
      <ModelPickerPopover
        options={FIXTURE}
        value={null}
        onChange={vi.fn()}
        inline
      />,
    )
    expect(
      screen.getByPlaceholderText('ModelPicker.searchPlaceholder'),
    ).toBeInTheDocument()
    expect(document.querySelector('[data-model-chip]')).toBeNull()
  })

  it('groupBy="kind" 把音频模型分成语音 / 配乐 / 音效三组（空组不画）', () => {
    render(
      <ModelPickerPopover
        options={[
          option({
            optionId: 'workspace:fish',
            modelId: AI_MODELS.FISH_AUDIO_S2_PRO,
            adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
          }),
          option({
            optionId: 'workspace:music',
            modelId: AI_MODELS.ELEVENLABS_MUSIC_V2,
            adapterType: AI_ADAPTER_TYPES.ELEVENLABS,
          }),
        ]}
        value={null}
        onChange={vi.fn()}
        groupBy="kind"
        inline
      />,
    )
    expect(screen.getByText('ModelPicker.kinds.speech')).toBeInTheDocument()
    expect(screen.getByText('ModelPicker.kinds.music')).toBeInTheDocument()
    expect(screen.queryByText('ModelPicker.kinds.sfx')).toBeNull()
  })
})

describe('ModelPickerPopover — 未选渠道闸门', () => {
  it('待选型号按 (scope, gateId) 存，画布上一张卡挡不住另一张', () => {
    render(
      <ModelPickerPopover
        options={FIXTURE}
        value={null}
        memoryScope="image"
        gateId="node-a"
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(row('seedream-5.0-pro'))
    const raw = window.localStorage.getItem('pv:model-picker:pending')
    expect(raw).toContain('image:node-a')
    expect(raw).not.toContain('image:node-b')
  })

  it('生成键点「先选渠道」→ 这个选择器自己打开', () => {
    render(
      <ModelPickerPopover
        options={FIXTURE}
        value={null}
        memoryScope="image"
        gateId="node-a"
        onChange={vi.fn()}
      />,
    )
    expect(document.querySelector('[data-model-key]')).toBeNull()
    act(() => requestModelPickerOpen(modelPickerGateKey('image', 'node-a')))
    expect(document.querySelector('[data-model-key]')).not.toBeNull()
  })

  it('⛔ 别的宿主的请求叫不醒它', () => {
    render(
      <ModelPickerPopover
        options={FIXTURE}
        value={null}
        memoryScope="image"
        gateId="node-a"
        onChange={vi.fn()}
      />,
    )
    act(() => requestModelPickerOpen(modelPickerGateKey('image', 'node-b')))
    expect(document.querySelector('[data-model-key]')).toBeNull()
  })
})

/**
 * owner 2026-09-18 真机：Seedream 5.0 Pro 这类多渠道型号，指针从行往右挪向渠道
 * 面板的**途中**面板就关了，渠道根本点不到。收口两条一起上 —— 面板贴住列表右缘
 * （间距用 padding 撑，过渡区算进命中区）+ 离开整块之后延时再收。
 */
describe('ModelPickerPopover — 行 → 过渡区 → 渠道面板走得过去', () => {
  /** 面板外层：含过渡区的那层命中区。 */
  function panelHitArea(): HTMLElement {
    const panel = channelPanel()
    expect(panel).not.toBeNull()
    return (panel as HTMLElement).parentElement as HTMLElement
  }

  /** 「行 ∪ 过渡区 ∪ 面板」那一整块。 */
  function surface(): HTMLElement {
    return (document.querySelector('[data-model-key]') as HTMLElement).closest(
      '.relative',
    ) as HTMLElement
  }

  it('面板贴住列表右缘 —— 间距是 padding，⛔ 不是真空隙', () => {
    openPicker()
    fireEvent.mouseEnter(row('seedream-5.0-pro'))
    const hit = panelHitArea()
    expect(hit.className).toContain('left-full')
    expect(hit.className).toContain('pl-2')
    expect(hit.className).not.toMatch(/left-\[/)
  })

  it('指针经过渡区进入面板，面板全程不关', () => {
    vi.useFakeTimers()
    try {
      openPicker()
      fireEvent.mouseEnter(row('seedream-5.0-pro'))
      const hit = panelHitArea()
      // 行 → 过渡区：整块的 mouseleave 先响，但那只是**排期**，不是立刻关。
      fireEvent.mouseLeave(surface())
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(channelPanel()).not.toBeNull()
      // 过渡区 → 面板：命中区把定时器撤了。
      fireEvent.mouseEnter(hit)
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(channelPanel()).not.toBeNull()
      const volc = within(channelPanel() as HTMLElement)
        .getAllByRole('option')
        .find((el) => /火山|VolcEngine/i.test(el.textContent ?? ''))
      expect(volc).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('离开整块之后延时才收，延时不短于 150ms', () => {
    vi.useFakeTimers()
    try {
      openPicker()
      fireEvent.mouseEnter(row('seedream-5.0-pro'))
      fireEvent.mouseLeave(surface())
      act(() => {
        vi.advanceTimersByTime(150)
      })
      expect(channelPanel()).not.toBeNull()
      act(() => {
        vi.advanceTimersByTime(200)
      })
      expect(channelPanel()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('→ 开面板并把焦点落到第一条渠道，Esc 回到行', () => {
    openPicker()
    const pro = row('seedream-5.0-pro')
    fireEvent.focus(pro)
    fireEvent.keyDown(pro, { key: 'ArrowRight' })
    const first = within(channelPanel() as HTMLElement).getAllByRole(
      'option',
    )[0] as HTMLElement
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(channelPanel() as HTMLElement, { key: 'Escape' })
    expect(document.activeElement).toBe(pro)
  })
})

describe('ModelPickerPopover — 有历史记录时仍只显示厂商列表', () => {
  /** jsdom 量不出真实布局，按 `data-row-id` 提供行位置。 */
  function stubRowRects(tops: Record<string, number>) {
    return vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const top = tops[this.getAttribute('data-row-id') ?? ''] ?? 0
        return {
          top,
          left: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect
      })
  }

  function rowById(rowId: string): HTMLElement {
    const el = document.querySelector(`[data-row-id="${rowId}"]`)
    expect(el).not.toBeNull()
    return el as HTMLElement
  }

  /** 面板外层 —— `top` 写在它身上。 */
  function panelTop(): string {
    return ((channelPanel() as HTMLElement).parentElement as HTMLElement).style
      .top
  }

  beforeEach(() => {
    window.localStorage.setItem(
      'pv:model-picker:recent',
      JSON.stringify({ default: ['seedream-5.0-pro'] }),
    )
  })

  it('历史记录不产生最近分组或重复行', () => {
    openPicker()
    expect(screen.queryByText('ModelPicker.recent')).toBeNull()
    expect(
      document.querySelectorAll('[data-model-key="seedream-5.0-pro"]'),
    ).toHaveLength(1)
    expect(rowById('group:seedream-5.0-pro')).toBeInTheDocument()
    expect(document.querySelector('[data-row-id^="recent:"]')).toBeNull()
  })

  it('渠道面板对齐厂商列表中的行', () => {
    const rect = stubRowRects({
      'group:seedream-5.0-pro': 480,
    })
    try {
      openPicker()
      fireEvent.mouseEnter(rowById('group:seedream-5.0-pro'))
      expect(panelTop()).toBe('480px')
    } finally {
      rect.mockRestore()
    }
  })

  it('只有当前行带有激活标记', () => {
    openPicker()
    fireEvent.mouseEnter(rowById('group:seedream-5.0-pro'))
    const active = document.querySelectorAll('[data-row-active]')
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveAttribute('data-row-id', 'group:seedream-5.0-pro')
  })

  it('→ 打开渠道面板，Esc 回到厂商列表行', () => {
    openPicker()
    const grouped = rowById('group:seedream-5.0-pro')
    fireEvent.focus(grouped)
    fireEvent.keyDown(grouped, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(
      within(channelPanel() as HTMLElement).getAllByRole('option')[0],
    )
    fireEvent.keyDown(channelPanel() as HTMLElement, { key: 'Escape' })
    expect(document.activeElement).toBe(grouped)
  })

  it('记忆按裸型号存 —— ⛔ 复合行身份不许漏进 memory 层', () => {
    openPicker()
    fireEvent.mouseEnter(rowById('group:seedream-5.0-pro'))
    fireEvent.click(
      within(channelPanel() as HTMLElement).getAllByRole(
        'option',
      )[0] as HTMLElement,
    )
    const channel = window.localStorage.getItem('pv:model-picker:channel')
    expect(channel).toContain('"default:seedream-5.0-pro"')
    expect(channel).not.toContain('recent:')
    expect(window.localStorage.getItem('pv:model-picker:recent')).not.toContain(
      'recent:seedream',
    )
  })
})
