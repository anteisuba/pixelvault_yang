import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// jsdom doesn't ship ResizeObserver or Element.scrollIntoView;
// cmdk (used by <Command/>) needs both.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

vi.mock('next-intl', () => ({
  // Values are echoed into the string so tests can assert on interpolated
  // counts (e.g. the provider row's "N 个模型").
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

import {
  BaseModelPickerPanel,
  deriveVariantLabels,
} from '@/components/business/studio-shared/pickers/BaseModelPickerPanel'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import { AI_MODELS } from '@/constants/models'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'

function makeOption(over: Partial<StudioModelOption>): StudioModelOption {
  return {
    optionId: over.optionId ?? 'opt-1',
    modelId: over.modelId ?? 'model-1',
    displayLabel: over.displayLabel,
    adapterType: over.adapterType ?? AI_ADAPTER_TYPES.OPENAI,
    providerConfig:
      over.providerConfig ?? getDefaultProviderConfig(AI_ADAPTER_TYPES.OPENAI),
    requestCount: over.requestCount ?? 1,
    isBuiltIn: over.isBuiltIn ?? false,
    freeTier: over.freeTier,
    sourceType: over.sourceType ?? 'workspace',
    keyId: over.keyId,
    keyLabel: over.keyLabel,
    maskedKey: over.maskedKey,
    providerKeyId: over.providerKeyId,
  }
}

/**
 * Real catalog ids on purpose: the three tiers read `MODEL_FAMILIES` /
 * `MODEL_VARIANTS`, so synthetic ids would silently exercise only the fallback
 * path. `displayLabel` stands in for the i18n label (which the next-intl mock
 * flattens to a message key).
 *
 * Shape: Seedance = 2 型号 (2.0 across fal + VolcEngine, 2.0 Fast on fal only),
 * Kling = 1 model. Reference endpoints are deliberately absent — those are
 * filtered out by the node's mode, not by this component.
 */
const SEEDANCE_FIXTURE: StudioModelOption[] = [
  {
    optionId: 'seedance-2.0-fal',
    modelId: AI_MODELS.SEEDANCE_20,
    displayLabel: 'Seedance 2.0',
    adapterType: AI_ADAPTER_TYPES.FAL,
  },
  {
    optionId: 'seedance-2.0-volcengine',
    modelId: AI_MODELS.SEEDANCE_20_VOLCENGINE,
    displayLabel: 'Seedance 2.0（火山方舟）',
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
  },
  {
    optionId: 'seedance-fast-fal',
    modelId: AI_MODELS.SEEDANCE_20_FAST,
    displayLabel: 'Seedance 2.0 Fast',
    adapterType: AI_ADAPTER_TYPES.FAL,
  },
  {
    optionId: 'kling-fal',
    modelId: AI_MODELS.KLING_V3_PRO,
    displayLabel: 'Kling 3.0 Pro',
    adapterType: AI_ADAPTER_TYPES.FAL,
  },
].map((o) =>
  makeOption({
    ...o,
    providerConfig: getDefaultProviderConfig(o.adapterType),
    sourceType: 'saved',
    keyId: `key-${o.adapterType}`,
  }),
)

describe('deriveVariantLabels', () => {
  const labelsOf = (variants: { variantKey: string; labels: string[] }[]) =>
    Object.fromEntries(deriveVariantLabels(variants))

  it('hoists the shared product name off a multi-channel 型号', () => {
    expect(
      labelsOf([
        {
          variantKey: 'seedance-2.5',
          labels: ['Seedance 2.5（火山方舟）', 'Seedance 2.5（参考·火山方舟）'],
        },
      ]),
    ).toEqual({ 'seedance-2.5': 'Seedance 2.5' })
  })

  it('prefers a member that already carries no qualifier', () => {
    expect(
      labelsOf([
        {
          variantKey: 'seedance-2.0',
          labels: [
            'Seedance 2.0（火山方舟）',
            'Seedance 2.0',
            'Seedance 2.0（参考端点）',
          ],
        },
      ]),
    ).toEqual({ 'seedance-2.0': 'Seedance 2.0' })
  })

  it('strips a single-member 型号 too, when the result stays unique', () => {
    // 视频节点按模式过滤之后，2.5 在「全能参考」档下只剩参考端点这一条。按条目数
    // 判就不削，「参考」这个词会漏到用户面前 —— 而它正是这套设计要消掉的概念。
    expect(
      labelsOf([
        { variantKey: 'seedance-2.0', labels: ['Seedance 2.0（参考端点）'] },
        {
          variantKey: 'seedance-2.5',
          labels: ['Seedance 2.5（参考，火山方舟）'],
        },
      ]),
    ).toEqual({
      'seedance-2.0': 'Seedance 2.0',
      'seedance-2.5': 'Seedance 2.5',
    })
  })

  it('keeps the qualifier when stripping would collide inside the 系列', () => {
    // 图片的 Seedream：fal 与火山各一条，削完同名 —— 一族里不许出现两行一样的字。
    expect(
      labelsOf([
        { variantKey: 'seedream-5.0-pro', labels: ['Seedream 5.0 Pro'] },
        {
          variantKey: 'seedream-5.0-pro-volc',
          labels: ['Seedream 5.0 Pro（火山方舟）'],
        },
      ]),
    ).toEqual({
      'seedream-5.0-pro': 'Seedream 5.0 Pro',
      'seedream-5.0-pro-volc': 'Seedream 5.0 Pro（火山方舟）',
    })
  })

  it('handles half-width parentheses and leaves plain names alone', () => {
    expect(
      labelsOf([
        {
          variantKey: 'v',
          labels: ['Seedance 2.5 (VolcEngine)', 'Seedance 2.5 (fal)'],
        },
        { variantKey: 'k', labels: ['快手可灵 3.0 Pro'] },
      ]),
    ).toEqual({ v: 'Seedance 2.5', k: '快手可灵 3.0 Pro' })
  })

  it('never returns an empty label', () => {
    expect(labelsOf([{ variantKey: 'x', labels: [] }])).toEqual({ x: '' })
    // 整条标签就是一个括注时，削完是空 —— 退回原文而不是留白。
    expect(
      labelsOf([{ variantKey: 'y', labels: ['（火山方舟）', '（fal）'] }]),
    ).toEqual({ y: '（fal）' })
  })
})

describe('BaseModelPickerPanel', () => {
  it('uses the Studio scrollbar treatment for the model list', () => {
    render(
      <BaseModelPickerPanel
        options={[]}
        value={null}
        onChange={vi.fn()}
        triggerEmptyLabel="Pick a model"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Pick a model' }))

    expect(screen.getByRole('dialog')).toHaveClass('studio-scrollbar')
  })

  it('renders trigger with custom empty label when nothing selected', () => {
    render(
      <BaseModelPickerPanel
        options={[]}
        value={null}
        onChange={vi.fn()}
        triggerEmptyLabel="Pick a model"
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Pick a model' }),
    ).toBeInTheDocument()
  })

  it('shows the selected model label in the trigger by default', () => {
    const opt = makeOption({
      optionId: 'opt-saved',
      modelId: 'gpt-image-2',
      sourceType: 'saved',
      keyId: 'k1',
      keyLabel: 'My personal key',
    })
    render(
      <BaseModelPickerPanel
        options={[opt]}
        value="opt-saved"
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText(/openaiGptImage2/)).toBeInTheDocument()
    expect(screen.queryByText('My personal key')).not.toBeInTheDocument()
  })

  it('can use key label as the primary label when requested', () => {
    const opt = makeOption({
      optionId: 'opt-saved',
      modelId: 'gpt-image-2',
      sourceType: 'saved',
      keyId: 'k1',
      keyLabel: 'My personal key',
    })
    render(
      <BaseModelPickerPanel
        options={[opt]}
        value="opt-saved"
        onChange={vi.fn()}
        savedOptionLabelMode="key"
      />,
    )
    expect(screen.getByText('My personal key')).toBeInTheDocument()
  })

  it('can use model label as the primary label for saved LLM routes', () => {
    const opt = makeOption({
      optionId: 'opt-llm',
      modelId: 'gpt-5.4-mini',
      displayLabel: 'OpenAI GPT-5.4 Mini',
      sourceType: 'saved',
      keyId: 'k1',
      keyLabel: 'seeddance-gpt',
    })

    render(
      <BaseModelPickerPanel
        options={[opt]}
        value="opt-llm"
        onChange={vi.fn()}
        savedOptionLabelMode="model"
      />,
    )

    expect(screen.getByText('OpenAI GPT-5.4 Mini')).toBeInTheDocument()
    expect(screen.queryByText('seeddance-gpt')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('seeddance-gpt · OpenAI')).toBeInTheDocument()
  })

  it('shows model label when no keyLabel (workspace/locked option selected)', () => {
    const opt = makeOption({
      optionId: 'opt-workspace',
      modelId: 'flux-pro',
      sourceType: 'workspace',
    })
    render(
      <BaseModelPickerPanel
        options={[opt]}
        value="opt-workspace"
        onChange={vi.fn()}
      />,
    )
    // tModels('flux-pro.label') under the mock returns 'Models.flux-pro.label'
    expect(screen.getByText(/flux-pro/)).toBeInTheDocument()
  })

  it('disables trigger when disabled prop is set', () => {
    render(
      <BaseModelPickerPanel
        options={[]}
        value={null}
        onChange={vi.fn()}
        disabled
      />,
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows all three groups in step 2, so the list matches the provider count', () => {
    // All three share the default OPENAI adapter → single provider → the picker
    // auto-skips step 1 into the provider's model list (step 2). Step 2 used to
    // drop the needs-key group once the provider had a usable route, which made
    // the drill-in render fewer rows than the provider row advertised. Every
    // counted model is now reachable; locked ones route to QuickSetupDialog.
    const saved = makeOption({
      optionId: 'opt-saved',
      modelId: 'model-saved',
      sourceType: 'saved',
      keyId: 'k1',
    })
    const platform = makeOption({
      optionId: 'opt-platform',
      modelId: 'model-free',
      sourceType: 'workspace',
      freeTier: true,
    })
    const locked = makeOption({
      optionId: 'opt-locked',
      modelId: 'model-locked',
      sourceType: 'workspace',
      freeTier: false,
    })

    render(
      <BaseModelPickerPanel
        options={[saved, platform, locked]}
        value={null}
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('QuickSetup.configuredKeys')).toBeInTheDocument()
    expect(screen.getByText('QuickSetup.platformQuota')).toBeInTheDocument()
    expect(screen.getByText('QuickSetup.needsKey')).toBeInTheDocument()
  })

  it('still lists the paid models of a free-quota provider the user has no key for', () => {
    // Gemini image / fal 3D shape: one free-tier model plus paid siblings and no
    // saved key. The free route alone used to satisfy the old suppression rule,
    // hiding the paid ones while the provider row still counted them.
    const free = makeOption({
      optionId: 'workspace:free-model',
      modelId: 'free-model',
      sourceType: 'workspace',
      freeTier: true,
    })
    const paid = makeOption({
      optionId: 'workspace:paid-model',
      modelId: 'paid-model',
      sourceType: 'workspace',
      freeTier: false,
    })

    render(
      <BaseModelPickerPanel
        options={[free, paid]}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText(/free-model/)).toBeInTheDocument()
    expect(screen.getByText(/paid-model/)).toBeInTheDocument()
  })

  it('falls back to showing locked models when the provider has no usable route', () => {
    // A single provider whose only model is locked still surfaces it (as a
    // fallback) so the list is never silently empty.
    const locked = makeOption({
      optionId: 'opt-locked',
      sourceType: 'workspace',
      freeTier: false,
    })

    render(
      <BaseModelPickerPanel
        options={[locked]}
        value={null}
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('QuickSetup.needsKey')).toBeInTheDocument()
  })

  it('drills into an unconfigured (needs-key) group from step 1, showing its locked models', () => {
    // Two distinct providers, neither with a family → step 1 falls back to
    // provider grouping and is shown, not auto-skipped. The DEEPSEEK provider is
    // entirely unconfigured: neither a saved key nor a free-tier platform route,
    // so it renders as "needs key". Clicking that row must drill in and surface
    // its locked models — not stay on step 1 or dismiss the popover.
    //
    // ⚠ DEEPSEEK carries TWO models on purpose: a group that collapses to a
    // single option renders as that option (see the collapse test below), which
    // would make this drill unobservable.
    const configured = makeOption({
      optionId: 'opt-openai-saved',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.OPENAI),
      sourceType: 'saved',
      keyId: 'k1',
    })
    const unconfigured = ['deepseek-model', 'deepseek-model-2'].map((modelId) =>
      makeOption({
        optionId: `opt-locked-${modelId}`,
        modelId,
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.DEEPSEEK),
        sourceType: 'workspace',
        freeTier: false,
      }),
    )

    render(
      <BaseModelPickerPanel
        options={[configured, ...unconfigured]}
        value={null}
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button'))

    // Step 1: group rows are shown; the group's models are not yet listed. The
    // row carries its own "needs key" badge, so that text alone doesn't
    // distinguish the steps — the model id does.
    const deepseekRow = screen.getByText(
      getDefaultProviderConfig(AI_ADAPTER_TYPES.DEEPSEEK).label,
    )
    expect(screen.queryByText(/deepseek-model/)).not.toBeInTheDocument()

    // Drill into the unconfigured group.
    fireEvent.click(deepseekRow)

    // Step 2: the popover stayed open and now lists the locked models under the
    // needs-key group. Those ids only render past step 1, so their presence
    // proves the drill-in. The needs-key *heading* coexists with the exiting
    // step-1 row's own needs-key badge during the cross-fade (popLayout keeps
    // the outgoing view mounted), so it can match more than once — assert at
    // least one is present.
    expect(screen.getAllByText('QuickSetup.needsKey').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/deepseek-model/)).toHaveLength(2)
  })

  it('omits a group when its bucket is empty', () => {
    const platform = makeOption({
      optionId: 'opt-platform',
      sourceType: 'workspace',
      freeTier: true,
    })
    render(
      <BaseModelPickerPanel
        options={[platform]}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    expect(
      screen.queryByText('QuickSetup.configuredKeys'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('QuickSetup.platformQuota')).toBeInTheDocument()
    expect(screen.queryByText('QuickSetup.needsKey')).not.toBeInTheDocument()
  })

  it('hides search input when enableSearch=false', () => {
    render(
      <BaseModelPickerPanel
        options={[]}
        value={null}
        onChange={vi.fn()}
        enableSearch={false}
        searchPlaceholder="Search models"
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    expect(
      screen.queryByPlaceholderText('Search models'),
    ).not.toBeInTheDocument()
  })

  it('shows search input by default', () => {
    render(
      <BaseModelPickerPanel
        options={[]}
        value={null}
        onChange={vi.fn()}
        searchPlaceholder="Search now"
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByPlaceholderText('Search now')).toBeInTheDocument()
  })

  it('lists every provider-key-covered model, not just the one with a key row', () => {
    // Regression: one fal key row bound to model-a used to leave model-b/model-c
    // in the locked bucket, which step 2 then hid entirely — the provider row
    // advertised 3 models and the drilled-in list showed 1.
    const keyedRoute = makeOption({
      optionId: 'key:k1',
      modelId: 'model-a',
      sourceType: 'saved',
      keyId: 'k1',
    })
    const covered = ['model-a', 'model-b', 'model-c'].map((modelId) =>
      makeOption({
        optionId: `workspace:${modelId}`,
        modelId,
        sourceType: 'workspace',
        providerKeyId: 'k1',
      }),
    )

    render(
      <BaseModelPickerPanel
        options={[keyedRoute, ...covered]}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('QuickSetup.configuredKeys')).toBeInTheDocument()
    expect(screen.queryByText('QuickSetup.needsKey')).not.toBeInTheDocument()
    // model-a's workspace twin is folded into its key route → 3 rows, not 4.
    expect(screen.getAllByText(/model-[abc]/)).toHaveLength(3)
  })

  it('counts a provider row by the rows its drill-in actually renders', () => {
    // The count and the list must not come from different arrays.
    const options = [
      makeOption({
        optionId: 'key:k1',
        modelId: 'model-a',
        sourceType: 'saved',
        keyId: 'k1',
      }),
      makeOption({
        optionId: 'workspace:model-a',
        modelId: 'model-a',
        sourceType: 'workspace',
        providerKeyId: 'k1',
      }),
      makeOption({
        optionId: 'workspace:model-b',
        modelId: 'model-b',
        sourceType: 'workspace',
        providerKeyId: 'k1',
      }),
      makeOption({
        optionId: 'workspace:deepseek-model',
        modelId: 'deepseek-model',
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.DEEPSEEK),
        sourceType: 'workspace',
      }),
    ]

    render(
      <BaseModelPickerPanel
        options={options}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    // 3 raw openai options → the row must advertise 2, the number of rows its
    // drill-in renders once the redundant workspace twin folds away.
    expect(
      screen.getByText('Common.modelCount({"count":2})'),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByText(getDefaultProviderConfig(AI_ADAPTER_TYPES.OPENAI).label),
    )
    expect(screen.getAllByText(/model-[ab]/)).toHaveLength(2)
  })

  it('keeps a free-tier route visible alongside its saved key twin', () => {
    // Dedupe must not take away the cheaper platform route for the same model.
    const saved = makeOption({
      optionId: 'key:k1',
      sourceType: 'saved',
      keyId: 'k1',
    })
    const free = makeOption({
      optionId: 'workspace:model-1',
      sourceType: 'workspace',
      freeTier: true,
    })

    render(
      <BaseModelPickerPanel
        options={[saved, free]}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('QuickSetup.configuredKeys')).toBeInTheDocument()
    expect(screen.getByText('QuickSetup.platformQuota')).toBeInTheDocument()
  })

  it('ticks the surviving row when the stored selection was a folded twin', () => {
    const saved = makeOption({
      optionId: 'key:k1',
      sourceType: 'saved',
      keyId: 'k1',
    })
    const twin = makeOption({
      optionId: 'workspace:model-1',
      sourceType: 'workspace',
      providerKeyId: 'k1',
    })

    render(
      <BaseModelPickerPanel
        options={[saved, twin]}
        value="workspace:model-1"
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    const rows = screen.getAllByRole('option')
    expect(rows).toHaveLength(1)
    expect(rows[0].querySelector('svg.lucide-check')).toBeTruthy()
  })

  it('drills 系列 → 型号 → 渠道 for models that carry a 型号 registry', () => {
    // Seedance holds two 型号 (2.0 with two channels, 2.0 Fast with one); Kling
    // holds one model. Before this change these four rows sat under TWO provider
    // headings (fal / VolcEngine) with Seedance split across both.
    render(
      <BaseModelPickerPanel
        options={SEEDANCE_FIXTURE}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    // Tier 1 — 系列. No concrete model label from the multi-model family shows
    // yet; Kling collapsed to its single model, which is a separate assertion.
    expect(screen.getByText('Seedance')).toBeInTheDocument()
    expect(screen.queryByText('Seedance 2.0')).not.toBeInTheDocument()

    // Tier 2 — 型号. "Seedance 2.0 Fast" exists only here (its single channel
    // makes it a leaf), so it is the marker for this step.
    fireEvent.click(screen.getByText('Seedance'))
    expect(screen.getByText('Seedance 2.0 Fast')).toBeInTheDocument()
    expect(
      screen.queryByText('Seedance 2.0（火山方舟）'),
    ).not.toBeInTheDocument()

    // Tier 3 — 渠道。这一层的行**只写公司名**（owner：「只留公司名字，比如 fal 和
    // 火山」）——型号已经由返回键交代过，再写一遍模型全名是同一句话说两遍。
    fireEvent.click(screen.getByText('Seedance 2.0'))
    expect(
      screen.getByText(
        getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE).label,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Seedance 2.0（火山方舟）'),
    ).not.toBeInTheDocument()
  })

  it('counts 型号 on a 系列 row and 渠道 on a 型号 row', () => {
    // The count must equal the rows the drill-in renders. Reporting Seedance's
    // four catalog entries as "4 models" is exactly the endpoint/channel
    // duplication this redesign removes.
    render(
      <BaseModelPickerPanel
        options={SEEDANCE_FIXTURE}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    // Scope the count to its own row: during the cross-fade the outgoing view
    // stays mounted, so a bare text match would also see the previous step's
    // count and pass for the wrong reason.
    const rowText = (label: string) =>
      screen.getByText(label).closest('[role="option"]')?.textContent ?? ''

    // 系列 "Seedance" advertises its two 型号 — not its four catalog entries.
    expect(rowText('Seedance')).toContain('Common.modelCount({"count":2})')

    fireEvent.click(screen.getByText('Seedance'))
    // 型号 "Seedance 2.0" advertises its two 渠道; the single-channel sibling
    // collapsed to a leaf and carries no count at all.
    expect(rowText('Seedance 2.0')).toContain(
      'Common.channelCount({"count":2})',
    )
    expect(rowText('Seedance 2.0 Fast')).not.toContain('Count(')
  })

  it('counts 渠道 on a 系列 row whose 型号 layer gets skipped', () => {
    // Caught on the real app: MiniMax has one 型号 across several stations, so
    // its 系列 row drills PAST 型号 straight into 渠道 — and was advertising
    // "1 model" above a list of four. The count has to follow the skip chain,
    // not the next layer down.
    const minimax = [
      [AI_MODELS.MINIMAX_H3, 'MiniMax H3', AI_ADAPTER_TYPES.FAL],
      [
        AI_MODELS.MINIMAX_H3_CN,
        'MiniMax H3（国内）',
        AI_ADAPTER_TYPES.VOLCENGINE,
      ],
    ].map(([modelId, displayLabel, adapterType]) =>
      makeOption({
        optionId: `mini-${adapterType}`,
        modelId,
        displayLabel,
        adapterType: adapterType as AI_ADAPTER_TYPES,
        providerConfig: getDefaultProviderConfig(
          adapterType as AI_ADAPTER_TYPES,
        ),
        sourceType: 'saved',
        keyId: `k-${adapterType}`,
      }),
    )

    render(
      <BaseModelPickerPanel
        options={[...SEEDANCE_FIXTURE, ...minimax]}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    const miniRow =
      screen.getByText('MiniMax').closest('[role="option"]')?.textContent ?? ''
    expect(miniRow).toContain('Common.channelCount({"count":2})')
    expect(miniRow).not.toContain('modelCount')
  })

  it('keeps the drilled-in view when the caller rebuilds the options array', () => {
    // The reset effect must fire only on closed→open. Callers rebuild `options`
    // on every render, so a naive dependency list would snap the view back to
    // 系列 mid-interaction — the "clicking a row exits instead of drilling in"
    // bug. Three layers make that failure worse, so it gets its own guard.
    const { rerender } = render(
      <BaseModelPickerPanel
        options={[...SEEDANCE_FIXTURE]}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('Seedance'))
    expect(screen.getAllByRole('button')).toHaveLength(2)

    // Fresh array identity, same contents.
    rerender(
      <BaseModelPickerPanel
        options={SEEDANCE_FIXTURE.map((o) => ({ ...o }))}
        value={null}
        onChange={vi.fn()}
      />,
    )

    // ⚠ Row presence can't decide this: popLayout keeps the outgoing 系列 view
    // mounted through the cross-fade, so both steps' rows are in the DOM either
    // way. The back affordance renders outside AnimatePresence and is driven by
    // `backTarget` alone — trigger + back means we are still one level down.
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByText('Seedance 2.0 Fast')).toBeInTheDocument()
  })

  it('selects directly when a 型号 has a single 渠道 (tier 3 skipped)', () => {
    const onChange = vi.fn()
    render(
      <BaseModelPickerPanel
        options={SEEDANCE_FIXTURE}
        value={null}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('Seedance'))
    fireEvent.click(screen.getByText('Seedance 2.0 Fast'))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].modelId).toBe(AI_MODELS.SEEDANCE_20_FAST)
  })

  it('selects directly when a 系列 collapses to one model (skips chain all the way)', () => {
    // Kling contributes a single option → tiers 2 and 3 both have one candidate,
    // so the tier-1 row IS that model: it shows the model label, not the family
    // name, and clicking it selects rather than drilling into an empty shell.
    const onChange = vi.fn()
    render(
      <BaseModelPickerPanel
        options={SEEDANCE_FIXTURE}
        value={null}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    expect(screen.queryByText('Kling')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Kling 3.0 Pro'))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].modelId).toBe(AI_MODELS.KLING_V3_PRO)
  })

  it('routes a collapsed row to setup when its single option needs a key', () => {
    const onRequestSetup = vi.fn()
    const onChange = vi.fn()
    render(
      <BaseModelPickerPanel
        options={[
          ...SEEDANCE_FIXTURE,
          makeOption({
            optionId: 'locked-veo',
            modelId: AI_MODELS.VEO_31,
            displayLabel: 'Veo 3.1',
            adapterType: AI_ADAPTER_TYPES.FAL,
            providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
            sourceType: 'workspace',
            freeTier: false,
          }),
        ]}
        value={null}
        onChange={onChange}
        onRequestSetup={onRequestSetup}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('Veo 3.1'))

    expect(onRequestSetup).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('goes back to 型号 from 渠道 when the 型号 layer was not skipped', () => {
    render(
      <BaseModelPickerPanel
        options={SEEDANCE_FIXTURE}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('Seedance'))
    fireEvent.click(screen.getByText('Seedance 2.0'))

    // Trigger + back button.
    const back = screen.getAllByRole('button')[1]
    fireEvent.click(back)

    // Landed on 型号, not 系列: the sibling 型号 is listed again.
    expect(screen.getByText('Seedance 2.0 Fast')).toBeInTheDocument()
  })

  it('goes back to 系列 from 渠道 when the 型号 layer was skipped', () => {
    // MiniMax has one 型号 across two stations → tier 2 is skipped on the way
    // down, so the return target must be tier 1, not a constant "one step up".
    const minimax = [
      makeOption({
        optionId: 'minimax-global',
        modelId: AI_MODELS.MINIMAX_H3,
        displayLabel: 'MiniMax H3',
        adapterType: AI_ADAPTER_TYPES.FAL,
        providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
        sourceType: 'saved',
        keyId: 'k-fal',
      }),
      makeOption({
        optionId: 'minimax-cn',
        modelId: AI_MODELS.MINIMAX_H3_CN,
        displayLabel: 'MiniMax H3（国内）',
        adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
        providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
        sourceType: 'saved',
        keyId: 'k-volc',
      }),
    ]

    render(
      <BaseModelPickerPanel
        options={[...SEEDANCE_FIXTURE, ...minimax]}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('MiniMax'))

    // Skipped straight into 渠道 —— 两个站都在，且行里写的是公司名。
    expect(
      screen.getByText(
        getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE).label,
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button')[1])
    // Back at 系列, not at an empty 型号 step.
    expect(screen.getByText('Seedance')).toBeInTheDocument()
  })

  it('offers no back affordance when every navigational layer was skipped', () => {
    // One 系列, one 型号, two 渠道 → the picker opens straight onto the channel
    // list and there is nowhere to return to.
    render(
      <BaseModelPickerPanel
        options={SEEDANCE_FIXTURE.filter((o) =>
          o.optionId.startsWith('seedance-2.0-'),
        )}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Seedance 2.0（火山方舟）')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('degrades to two layers for models with no 型号 registered', () => {
    // MODEL_VARIANTS only covers video today. Image models each become their own
    // 型号 → tier 2 lists them and tier 3 is skipped, which is exactly the
    // pre-change 厂商 → 模型 depth. There is no "video gets three, others get
    // two" branch anywhere — the depth falls out of the data.
    const onChange = vi.fn()
    const images = [
      ['flux-pro', AI_MODELS.FLUX_2_PRO, 'FLUX 2 Pro'],
      ['flux-flash', AI_MODELS.FLUX_2_FLASH, 'FLUX 2 Flash'],
      ['ideogram', AI_MODELS.IDEOGRAM_3, 'Ideogram 3'],
    ].map(([optionId, modelId, displayLabel]) =>
      makeOption({
        optionId,
        modelId,
        displayLabel,
        adapterType: AI_ADAPTER_TYPES.FAL,
        providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
        sourceType: 'saved',
        keyId: 'k-fal',
      }),
    )

    render(
      <BaseModelPickerPanel
        options={images}
        value={null}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    // Tier 1: the FLUX family plus Ideogram collapsed to its one model.
    expect(screen.getByText('FLUX')).toBeInTheDocument()
    expect(screen.getByText('Ideogram 3')).toBeInTheDocument()

    // Tier 2 is the last stop — clicking a model selects it, no third step.
    fireEvent.click(screen.getByText('FLUX'))
    fireEvent.click(screen.getByText('FLUX 2 Flash'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].modelId).toBe(AI_MODELS.FLUX_2_FLASH)
  })

  it('flat-searches across every layer', () => {
    render(
      <BaseModelPickerPanel
        options={SEEDANCE_FIXTURE}
        value={null}
        onChange={vi.fn()}
        searchPlaceholder="Search"
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    fireEvent.change(screen.getByPlaceholderText('Search'), {
      target: { value: 'seedance 2.0' },
    })

    // Search bypasses the hierarchy entirely: the VolcEngine channel is three
    // layers deep, and it shows up without any drilling.
    expect(screen.getByText('Seedance 2.0（火山方舟）')).toBeInTheDocument()
    expect(screen.queryByText('Kling 3.0 Pro')).not.toBeInTheDocument()
  })

  it('lets the caller rewrite ONLY the collapsed trigger label', () => {
    // 视频节点要触发器读「型号 · 渠道」而不带端点：模式已经说过一次「全能参考」了。
    // ⚠ 覆写不能波及列表项 —— 第三层的渠道行恰恰要能区分火山与 fal，这正是
    // `labelForOption`（触发器与列表项共用）用不上的原因。
    render(
      <BaseModelPickerPanel
        options={SEEDANCE_FIXTURE}
        value="seedance-2.0-volcengine"
        onChange={vi.fn()}
        triggerLabelForOption={({ variantLabel, channelLabel }) =>
          `${variantLabel} · ${channelLabel}`
        }
      />,
    )

    // 触发器：型号名（族内去重后的干净名）+ 渠道，原标签里的括注不出现。
    const trigger = screen.getByRole('button')
    expect(trigger).toHaveTextContent('Seedance 2.0 · VolcEngine')
    expect(trigger).not.toHaveTextContent('（火山方舟）')

    // 列表项**不受触发器覆写影响**：钻到第三层，行里是渠道名（那是第三层自己的
    // 规则），而不是触发器那套「型号 · 渠道」的拼法。
    fireEvent.click(trigger)
    fireEvent.click(screen.getByText('Seedance'))
    fireEvent.click(screen.getByText('Seedance 2.0'))
    const volcLabel = getDefaultProviderConfig(
      AI_ADAPTER_TYPES.VOLCENGINE,
    ).label
    expect(screen.getByText(volcLabel)).toBeInTheDocument()
    // ⚠ 断言必须**限定在列表里**：`Seedance 2.0 · VolcEngine` 本来就存在 —— 它正是
    // 触发器该显示的那串字。要守的是「它没有漏进列表项」。
    const rows = screen.getAllByRole('option')
    expect(
      rows.some((r) => r.textContent?.includes(`Seedance 2.0 · ${volcLabel}`)),
    ).toBe(false)
  })

  it('falls back to the option label when the caller passes no trigger override', () => {
    render(
      <BaseModelPickerPanel
        options={SEEDANCE_FIXTURE}
        value="seedance-2.0-volcengine"
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button')).toHaveTextContent(
      'Seedance 2.0（火山方舟）',
    )
  })

  it('shows the placeholder when the selection is not in the passed options', () => {
    // ⚠ 记一条容易误判的交互：`selectedOption` 是对**传进来的** options 解析的，而
    // `filterOption`（视频节点按模式收窄）是在到达本组件**之前**就过滤掉的。所以一旦
    // 选中的模型不属于当前模式，触发器读的是占位而不是那个模型名 —— 即使调用方的
    // `data.model` 还存着值。
    //
    // 这在视频节点里应当是瞬态：切档会把不兼容的模型清掉（§9.3）。若稳定复现出这个
    // 状态，说明清空那一步漏了，而不是这里显示错了。
    render(
      <BaseModelPickerPanel
        options={SEEDANCE_FIXTURE.filter((o) => o.optionId !== 'kling-fal')}
        value="kling-fal"
        onChange={vi.fn()}
        triggerLabelForOption={({ variantLabel, channelLabel }) =>
          `${variantLabel} · ${channelLabel}`
        }
      />,
    )
    expect(screen.getByRole('button')).toHaveTextContent('Common.selectModel')
  })

  it('uses the popover content as the scroll container', () => {
    render(
      <BaseModelPickerPanel
        options={[
          makeOption({ optionId: 'opt-1' }),
          makeOption({ optionId: 'opt-2' }),
        ]}
        value={null}
        onChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button'))

    const content = document.querySelector('[data-slot="popover-content"]')
    const list = document.querySelector('[data-slot="command-list"]')

    expect(content).toHaveClass('overflow-y-auto')
    expect(content).toHaveClass('touch-pan-y')
    expect(list).toHaveClass('max-h-none')
    expect(list).toHaveClass('overflow-y-visible')
  })
})
