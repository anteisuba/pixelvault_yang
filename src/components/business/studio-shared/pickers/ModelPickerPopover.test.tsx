import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// jsdom 没有 ResizeObserver / scrollIntoView，cmdk 两样都要。
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

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

import type { StudioModelOption } from '@/components/business/ModelSelector'
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
    freeTier: over.freeTier,
    sourceType: over.sourceType ?? 'workspace',
    keyId: over.keyId,
    providerKeyId: over.providerKeyId,
  }
}

/**
 * 真实目录 id：分组读 `MODEL_FAMILIES` / `MODEL_VARIANTS`，编造 id 只会走兜底。
 * Seedream 5.0 Pro 铺两条渠道（fal 与火山都能跑），Lite 走平台额度，GPT Image 2 缺 key。
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
    // 火山也配了 key（provider 级覆盖）—— 两条都能跑，自动规则这时比的是价。
    providerKeyId: 'volc-1',
  }),
  option({
    optionId: 'free:seedream-lite',
    modelId: AI_MODELS.SEEDREAM_50_LITE,
    displayLabel: 'Seedream 5.0 Lite',
    adapterType: AI_ADAPTER_TYPES.FAL,
    freeTier: true,
  }),
  option({
    optionId: 'workspace:gpt-image-2',
    modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
    displayLabel: 'GPT Image 2',
    adapterType: AI_ADAPTER_TYPES.OPENAI,
  }),
]

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

describe('ModelPickerPopover', () => {
  it('lists one row per model with the series as a heading', () => {
    openPicker()
    // 三条渠道后缀的假型号收敛成一行。
    expect(screen.getAllByText('Seedream 5.0 Pro')).toHaveLength(1)
    expect(screen.queryByText('Seedream 5.0 Pro（火山方舟）')).toBeNull()
    expect(screen.getByText('Seedream')).toBeInTheDocument()
    expect(screen.getByText('GPT Image')).toBeInTheDocument()
  })

  it('shows the auto-picked channel and its unit price on line two', () => {
    const { container } = openPicker()
    const metas = Array.from(
      container.ownerDocument.querySelectorAll('span.text-2xs'),
    ).map((el) => el.textContent ?? '')
    const proMeta = metas.find((text) => text.includes('fal'))
    expect(proMeta).toBeDefined()
    // 自动选中的渠道 + 单价都印在行上（单价查不到才隐藏）。
    expect(proMeta).toContain('Common.unitPrice.image')
  })

  it('greys out a model with no usable channel and routes it to QuickSetup', () => {
    const { onChange, onRequestSetup } = openPicker()
    fireEvent.click(screen.getByText('GPT Image 2'))
    expect(onRequestSetup).toHaveBeenCalledTimes(1)
    expect(onRequestSetup.mock.calls[0][0].optionId).toBe(
      'workspace:gpt-image-2',
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it('selects the auto-resolved channel when the model row is clicked', () => {
    const { onChange } = openPicker()
    fireEvent.click(screen.getByText('Seedream 5.0 Pro'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].optionId).toBe('key:fal-1')
  })

  it('filters by the search box across model, series and channel names', () => {
    openPicker()
    fireEvent.change(
      screen.getByPlaceholderText('ModelPicker.searchPlaceholder'),
      {
        target: { value: 'gpt' },
      },
    )
    expect(screen.getByText('GPT Image 2')).toBeInTheDocument()
    expect(screen.queryByText('Seedream 5.0 Pro')).toBeNull()
  })

  it('expands the channel radio list from the row-end "N 渠道" control', () => {
    openPicker()
    const toggle = screen.getByRole('button', {
      name: /ModelPicker.channelCount/,
    })
    expect(screen.queryByText('ModelPicker.autoRule')).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByText('ModelPicker.autoRule')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('remembers a manually picked channel and puts it in the chip title', () => {
    const { onChange, rerender } = openPicker()
    fireEvent.click(
      screen.getByRole('button', { name: /ModelPicker.channelCount/ }),
    )
    const volcRow = screen
      .getAllByText(/火山|VolcEngine/i)
      .find((el) => el.className.includes('flex-1'))
    expect(volcRow).toBeDefined()
    fireEvent.click(volcRow as HTMLElement)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].optionId).toBe(
      'workspace:seedream-5.0-pro-volcengine',
    )
    // 记忆落地：下一次这个型号默认走火山。
    expect(window.localStorage.getItem('pv:model-picker:channel')).toContain(
      'seedream-5.0-pro',
    )
    // 2026-09-10 owner 真机反馈第六条：手改过的渠道退到 `title` 上，
    // chip 上**只有型号名**（带上「· 渠道」会让栏底那一行出框）。
    rerender(
      <ModelPickerPopover
        options={FIXTURE}
        value="workspace:seedream-5.0-pro-volcengine"
        onChange={onChange}
      />,
    )
    const chip = screen.getByRole('button', { name: /Seedream 5.0 Pro/ })
    expect(chip.textContent).not.toMatch(/·/)
    expect(chip.getAttribute('title')).toMatch(/·/)
  })

  /**
   * owner 2026-09-10 真机反馈第五条：缺 key 的行点了应该弹配置，而不是挂上一个
   * 跑不了的模型。宿主给了 `onManageChannels`（画布四类卡）就开那个抽屉。
   */
  it('routes a needs-key row to the inline channel setup and never selects it', () => {
    const onManageChannels = vi.fn()
    const { onChange, onRequestSetup } = openPicker({ onManageChannels })
    fireEvent.click(screen.getByText('GPT Image 2'))
    expect(onManageChannels).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(onRequestSetup).not.toHaveBeenCalled()
    expect(window.localStorage.getItem('pv:model-picker:recent')).toBeNull()
  })

  it('keeps the panel open in multi-select mode and toggles instead of choosing', () => {
    const onToggleOption = vi.fn()
    const { onChange } = openPicker({
      selectedOptionIds: new Set<string>(),
      onToggleOption,
    })
    fireEvent.click(screen.getByText('Seedream 5.0 Pro'))
    expect(onToggleOption).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('Seedream 5.0 Lite')).toBeInTheDocument()
  })

  it('renders the manage-channels footer only when the host handles it', () => {
    const onManageChannels = vi.fn()
    openPicker({ onManageChannels })
    fireEvent.click(screen.getByText('ModelPicker.manageChannels'))
    expect(onManageChannels).toHaveBeenCalledTimes(1)
  })

  it('renders the panel body without a chip in inline mode', () => {
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
    expect(
      screen.queryByRole('button', { name: /Common.selectModel/ }),
    ).toBeNull()
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
    // 一条音效模型都没有 —— 整组不画。
    expect(screen.queryByText('ModelPicker.kinds.sfx')).toBeNull()
  })
})
