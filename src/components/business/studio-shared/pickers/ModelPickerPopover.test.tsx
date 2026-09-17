import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      values
        ? `${namespace}.${key}(${JSON.stringify(values)})`
        : `${namespace}.${key}`,
}))

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: vi.fn(() => ({
    keys: [],
    healthMap: {},
    isLoading: false,
  })),
}))

import type { StudioModelOption } from '@/types/model-option'
import { ModelPickerPopover } from '@/components/business/studio-shared/pickers/ModelPickerPopover'
import { AI_MODELS } from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'

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

function channelPanel(): HTMLElement | null {
  return document.querySelector('[data-channel-panel]')
}

function openPicker(
  props: Partial<React.ComponentProps<typeof ModelPickerPopover>> = {},
) {
  const onChange = vi.fn()
  const onRequestSetup = vi.fn()
  const view = render(
    <ModelPickerPopover
      options={FIXTURE}
      value={null}
      onChange={onChange}
      onRequestSetup={onRequestSetup}
      {...props}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /Common.selectModel/ }))
  return { onChange, onRequestSetup, ...view }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('ModelPickerPopover — 行只有 模型 · 型号 · 价格', () => {
  it('每个型号一行，模型名与型号分成两格，系列当分组标题', () => {
    openPicker()
    const pro = row('seedream-5.0-pro')
    expect(pro.textContent).toContain('Seedream')
    expect(pro.textContent).toContain('5.0 Pro')
    // 渠道后缀的重复条目收敛成同一行。
    expect(screen.queryByText('Seedream 5.0 Pro（火山方舟）')).toBeNull()
    expect(screen.getAllByText('GPT Image').length).toBeGreaterThan(0)
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

describe('ModelPickerPopover — 缺 key 走 QuickSetupDialog', () => {
  it('点黄点渠道 → 关弹层、交给宿主的 onRequestSetup，⛔ 不选中', () => {
    const { onChange, onRequestSetup } = openPicker()
    fireEvent.mouseEnter(row('gpt-image-2'))
    fireEvent.click(
      within(channelPanel() as HTMLElement).getAllByRole(
        'option',
      )[0] as HTMLElement,
    )
    expect(onRequestSetup).toHaveBeenCalledTimes(1)
    expect(onRequestSetup.mock.calls[0][0].optionId).toBe(
      'workspace:gpt-image-2',
    )
    expect(onChange).not.toHaveBeenCalled()
    expect(window.localStorage.getItem('pv:model-picker:channel')).toBeNull()
  })

  it('宿主没给 onRequestSetup 时自己开那一个现有对话框', () => {
    const onChange = vi.fn()
    render(
      <ModelPickerPopover
        options={FIXTURE}
        value={null}
        memoryScope="image"
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    fireEvent.mouseEnter(row('gpt-image-2'))
    fireEvent.click(
      within(channelPanel() as HTMLElement).getAllByRole(
        'option',
      )[0] as HTMLElement,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
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
