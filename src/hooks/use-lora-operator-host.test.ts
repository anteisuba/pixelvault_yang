import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  STUDIO_OPERATOR_FACE_PILLS,
  STUDIO_OPERATOR_FACE_PILL_LIMIT,
} from '@/constants/studio-assistant-operator'
import {
  type LoraOperatorHostMount,
  type UseLoraOperatorHostInput,
  toLoraOperatorResults,
  useLoraOperatorHost,
} from '@/hooks/use-lora-operator-host'
import { __resetMinedPromptsCacheForTests } from '@/hooks/prompts/use-civitai-mined-prompts'
import {
  getOperatorState,
  resetOperatorThread,
} from '@/hooks/use-studio-operator-store'
import type { LoraAssetRecord } from '@/types'

/** 这一层验的是快照形状，不是词表 —— 桩成「回 key」就够（同工作台宿主那份）。 */
vi.mock('next-intl', () => ({
  /**
   * ⚠ 带值的键把值一起串出来：四张脸那一句（`face.*.context`）验的正是「值跟着
   * 宿主状态变」，回一个光秃秃的 key 会让那条断言恒真。
   */
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}|${Object.values(values).join('·')}` : key,
}))

/**
 * 来源图配方那条通道**只桩到 API 客户端那一层**：中间的模块级缓存与去重是这一组
 * 要验的东西本身，桩掉 hook 等于把它跳过去。
 */
const mineCivitaiLoraPromptsAPI = vi.fn()
/**
 * ⚠ 导入那一跳（一次确认链的第一步）也要桩：批收敛那一组验的正是「三次导入并发
 * 在飞、各自落地」，而真的去打 Civitai 既慢又拿不到可控的时序。
 */
const favoriteLoraAPI = vi.fn()
const ensureMountable = vi.fn(async () => true)
vi.mock('@/hooks/use-civitai-download-gate', () => ({
  useCivitaiDownloadGate: () => ({
    checkingVersionId: null,
    ensureMountable,
  }),
}))
vi.mock('@/lib/api-client/lora-assets', async (importOriginal) => ({
  // ⚠ 只换这两只：同一个模块里其余那些别的用例还在真的用。
  ...(await importOriginal<object>()),
  mineCivitaiLoraPromptsAPI: (...args: unknown[]) =>
    mineCivitaiLoraPromptsAPI(...args),
  favoriteLoraAPI: (...args: unknown[]) => favoriteLoraAPI(...args),
}))

/**
 * 装配台结果列 → 结果行卡（切片 3b）。
 *
 * ⚠ 钉的是**筛子**：地址还没回来的那些进了结果行卡就是一格永远加载不出来的灰块，
 * 而它看起来只是「有一张图特别慢」——这类失败没人会去查。
 */
describe('toLoraOperatorResults', () => {
  it('只收跑完且真有地址的那些，⛔ 不拿占位凑数', () => {
    expect(
      toLoraOperatorResults([
        { id: 'r-1', url: 'https://cdn.test/1.png', loraName: 'Ink Wash' },
        { id: 'r-2', url: '' },
        { id: 'r-3', url: '   ' },
        { id: '', url: 'https://cdn.test/4.png' },
        { id: 'r-5', url: 'https://cdn.test/5.png', loraName: null },
      ]),
    ).toEqual([
      { id: 'r-1', url: 'https://cdn.test/1.png', label: 'Ink Wash' },
      { id: 'r-5', url: 'https://cdn.test/5.png' },
    ])
  })

  it('一条都不合格时给空数组（结果行卡整块不渲染，⛔ 不做空占位）', () => {
    expect(toLoraOperatorResults([])).toEqual([])
    expect(toLoraOperatorResults([{ id: 'r-1', url: '' }])).toEqual([])
  })
})

/**
 * 快照里那三格触发词 / 推荐提示词（§3.1）。
 *
 * ⚠ 钉的是**真值从哪儿来**：`triggerEnabled` 只有 `LoraWorkbench` 的
 * `disabledTriggerIds` 知道，所以它沿入参进来。这个 hook 里一旦出现「按有没有
 * 触发词自己算一份」，用户点 chip 那一刻两份真相就分家了。
 */
describe('useLoraOperatorHost.buildSnapshot 的触发词三格', () => {
  function asset(overrides: Partial<LoraAssetRecord> = {}): LoraAssetRecord {
    return {
      id: 'lora-1',
      styleCode: 'ink-lines',
      name: 'Ink Lines',
      source: 'imported',
      type: 'style',
      baseModelFamily: 'illustrious',
      provider: 'civitai',
      triggerWord: 'ink lines',
      loraUrl: 'https://cdn.test/lora.safetensors',
      coverImageUrl: null,
      previewImageUrls: [],
      defaultScale: 0.8,
      isPublic: false,
      isOwn: false,
      createdAt: '2026-09-12T00:00:00.000Z',
      ...overrides,
    }
  }

  function hostInput(
    items: readonly LoraOperatorHostMount[],
  ): UseLoraOperatorHostInput {
    return {
      prompt: '',
      setPrompt: () => {},
      appendPrompt: () => {},
      negativePrompt: '',
      setNegativePrompt: () => {},
      base: {
        id: 'illustrious-xl',
        label: 'Illustrious XL',
        family: 'illustrious',
      },
      availableBases: [{ id: 'illustrious-xl', label: 'Illustrious XL' }],
      selectBase: () => {},
      stack: {
        items,
        push: () => {},
        setScale: () => {},
        remove: () => {},
      },
      imageUpload: {
        referenceEntries: [],
        maxImages: 2,
        addReferenceImage: () => {},
        removeReferenceImage: () => {},
      },
      open: false,
      setOpen: () => {},
    }
  }

  it('触发词空串归一成 null；推荐提示词照给', () => {
    const { result } = renderHook(() =>
      useLoraOperatorHost(
        hostInput([
          { asset: asset({ triggerWord: '' }) },
          {
            asset: asset({
              id: 'lora-2',
              triggerWord: 'ink lines',
              recommendedPrompt: 'ink lines, rainy street',
            }),
          },
        ]),
      ),
    )
    expect(
      result.current
        .buildSnapshot()
        .loras?.items.map((item) => [item.triggerWord, item.recommendedPrompt]),
    ).toEqual([
      [null, null],
      ['ink lines', 'ink lines, rainy street'],
    ])
  })

  it('snapshots the latest LoRA parameters and source recipe', () => {
    const input = hostInput([])
    input.loraParameters = {
      steps: 25,
      guidanceScale: 7,
      runnerSeed: '2092427729',
      runnerWidth: 672,
      runnerHeight: 984,
      runnerSampler: 'euler_ancestral',
      runnerScheduler: 'normal',
    }
    input.sourceRecipe = {
      imageUrl: 'https://cdn.test/source.png',
      source: 'model_version_image',
      prompt: 'Sue, cyan eyes',
      checkpoint: 'rinFlanimeIllustrious_v40',
      loraWeight: 0.9,
    }
    const { result, rerender } = renderHook(
      (props: UseLoraOperatorHostInput) => useLoraOperatorHost(props),
      { initialProps: input },
    )

    expect(result.current.buildSnapshot()).toMatchObject({
      loraParameters: input.loraParameters,
      sourceRecipe: input.sourceRecipe,
    })

    rerender({
      ...input,
      loraParameters: { steps: 30, runnerSeed: null },
      sourceRecipe: undefined,
    })
    expect(result.current.buildSnapshot().loraParameters).toEqual({
      steps: 30,
      runnerSeed: null,
    })
    expect(result.current.buildSnapshot().sourceRecipe).toBeUndefined()
  })

  it('delegates parameter changes to the latest workbench setter', () => {
    const input = hostInput([])
    const initialSetter = vi.fn()
    const latestSetter = vi.fn()
    input.setLoraParameters = initialSetter
    const { result, rerender } = renderHook(
      (props: UseLoraOperatorHostInput) => useLoraOperatorHost(props),
      { initialProps: input },
    )
    rerender({ ...input, setLoraParameters: latestSetter })

    result.current.apply.lora!.setParameters!({
      steps: 28,
      runnerSeed: null,
    })
    expect(latestSetter).toHaveBeenCalledWith({ steps: 28, runnerSeed: null })
    expect(initialSetter).not.toHaveBeenCalled()
  })

  it('chip 关着时 triggerEnabled=false；缺省是 true', () => {
    const { result } = renderHook(() =>
      useLoraOperatorHost(
        hostInput([
          { asset: asset(), triggerEnabled: false },
          { asset: asset({ id: 'lora-2' }) },
        ]),
      ),
    )
    expect(
      result.current.buildSnapshot().loras?.items.map((i) => i.triggerEnabled),
    ).toEqual([false, true])
  })

  it('推荐提示词超长时截断到 maxPromptChars', () => {
    const max = ASSISTANT_OPERATOR_LIMITS.maxPromptChars
    const { result } = renderHook(() =>
      useLoraOperatorHost(
        hostInput([
          { asset: asset({ recommendedPrompt: 'a'.repeat(max + 20) }) },
        ]),
      ),
    )
    expect(
      result.current.buildSnapshot().loras?.items[0]?.recommendedPrompt,
    ).toHaveLength(max)
  })
})

/**
 * 栈总权重护栏的**客户端那一半**（§5.2）——超预算插一条系统行。
 *
 * ⚠ 钉的是「插得进线程」：这条提醒的全部价值就是用户读得到它；只在服务端
 * observation 里说一句，界面上是助手把权重改了然后什么都没交代。
 */
describe('useLoraOperatorHost 的栈总权重护栏', () => {
  beforeEach(() => {
    resetOperatorThread()
  })

  function asset(overrides: Partial<LoraAssetRecord> = {}): LoraAssetRecord {
    return {
      id: 'lora-1',
      styleCode: 'ink-lines',
      name: 'Ink Lines',
      source: 'imported',
      type: 'style',
      baseModelFamily: 'illustrious',
      provider: 'civitai',
      triggerWord: 'ink lines',
      loraUrl: 'https://cdn.test/lora.safetensors',
      coverImageUrl: null,
      previewImageUrls: [],
      defaultScale: 0.8,
      isPublic: false,
      isOwn: false,
      createdAt: '2026-09-12T00:00:00.000Z',
      ...overrides,
    }
  }

  /** ⚠ 底模 id 取**目录里真有的那一条** —— 阈值是从目录条目上读的。 */
  function budgetInput(
    items: readonly LoraOperatorHostMount[],
  ): UseLoraOperatorHostInput {
    return {
      prompt: '',
      setPrompt: () => {},
      appendPrompt: () => {},
      negativePrompt: '',
      setNegativePrompt: () => {},
      base: {
        id: 'illustrious-hosted',
        label: 'Illustrious · NoobAI-XL',
        family: 'illustrious',
      },
      availableBases: [
        { id: 'illustrious-hosted', label: 'Illustrious · NoobAI-XL' },
      ],
      selectBase: () => {},
      stack: {
        items,
        push: () => {},
        setScale: () => {},
        remove: () => {},
      },
      imageUpload: {
        referenceEntries: [],
        maxImages: 2,
        addReferenceImage: () => {},
        removeReferenceImage: () => {},
      },
      open: false,
      setOpen: () => {},
    }
  }

  /** ⛔ 不用 `?.` 兜：那只手缺席时这几条断言会**空过**，而缺席本身就是回归。 */
  function setWeight(
    host: ReturnType<typeof useLoraOperatorHost>,
    loraId: string,
    weight: number,
  ) {
    const lora = host.apply.lora
    if (!lora) throw new Error('装配台宿主缺 apply.lora')
    lora.setWeight(loraId, weight)
  }

  function systemCodes() {
    return getOperatorState()
      .entries.filter((entry) => entry.kind === 'system')
      .map((entry) => [entry.code, entry.subject])
  }

  it('调完权重超预算时插一条系统行，subject 带总权重与阈值', () => {
    const { result } = renderHook(() =>
      useLoraOperatorHost(
        budgetInput([
          { asset: asset() },
          { asset: asset({ id: 'lora-2' }), scale: 0.8 },
        ]),
      ),
    )
    // 0.9（这一手）+ 0.8 = 1.7，非蒸馏底模的预算是 1.5。
    setWeight(result.current, 'lora-1', 0.9)
    expect(systemCodes()).toEqual([['loraWeightOverBudget', '1.7 / 1.5']])
  })

  it('还在预算内时一行都不插（⛔ 不逢改必念）', () => {
    const { result } = renderHook(() =>
      useLoraOperatorHost(budgetInput([{ asset: asset() }])),
    )
    setWeight(result.current, 'lora-1', 1.2)
    expect(systemCodes()).toEqual([])
  })

  it('静音的那把不进预算（与出图口径同一条）', () => {
    const { result } = renderHook(() =>
      useLoraOperatorHost(
        budgetInput([
          { asset: asset() },
          { asset: asset({ id: 'lora-2' }), scale: 1.4, enabled: false },
        ]),
      ),
    )
    setWeight(result.current, 'lora-1', 1.2)
    expect(systemCodes()).toEqual([])
  })
})

/**
 * 来源图提示词进快照（取材阶梯第二档的料）。
 *
 * ⭐ 钉的是**一条通道一份缓存**：装配台的「来源配方」与助手读的是同一个模块缓存，
 * 所以用户看过的那把助手立刻取得到，没看过的也只多一次请求。两份缓存的表现是
 * 同一把 LoRA 取两次，而助手拿到的那份可能比界面上看到的旧。
 */
describe('useLoraOperatorHost 的来源图提示词', () => {
  function civitaiAsset(
    overrides: Partial<LoraAssetRecord> = {},
  ): LoraAssetRecord {
    return {
      id: 'lora-1',
      styleCode: 'ink-lines',
      name: 'Ink Lines',
      source: 'imported',
      type: 'style',
      baseModelFamily: 'illustrious',
      provider: 'civitai',
      triggerWord: 'ink lines',
      loraUrl: 'https://cdn.test/lora.safetensors',
      coverImageUrl: null,
      previewImageUrls: [],
      defaultScale: 0.8,
      isPublic: false,
      isOwn: false,
      createdAt: '2026-09-12T00:00:00.000Z',
      modelId: 4242,
      modelVersionId: 99,
      fileHashAutoV3: 'abc123',
      ...overrides,
    }
  }

  function hostInput(
    items: readonly LoraOperatorHostMount[],
    open = true,
  ): UseLoraOperatorHostInput {
    return {
      prompt: '',
      setPrompt: () => {},
      appendPrompt: () => {},
      negativePrompt: '',
      setNegativePrompt: () => {},
      base: {
        id: 'illustrious-xl',
        label: 'Illustrious XL',
        family: 'illustrious',
      },
      availableBases: [{ id: 'illustrious-xl', label: 'Illustrious XL' }],
      selectBase: () => {},
      stack: { items, push: () => {}, setScale: () => {}, remove: () => {} },
      imageUpload: {
        referenceEntries: [],
        maxImages: 2,
        addReferenceImage: () => {},
        removeReferenceImage: () => {},
      },
      open,
      setOpen: () => {},
    }
  }

  beforeEach(() => {
    __resetMinedPromptsCacheForTests()
    mineCivitaiLoraPromptsAPI.mockReset()
    mineCivitaiLoraPromptsAPI.mockResolvedValue({
      success: true,
      data: {
        outfits: [
          { label: 'Outfit 1', prompt: 'ink lines, rooftop', sampleCount: 3 },
          { label: 'Outfit 2', prompt: 'ink lines, neon rain', sampleCount: 2 },
        ],
        totalSampled: 5,
      },
    })
  })

  it('没有缓存时取一次并缓存：重渲染 / 重新挂载都不再发第二次', async () => {
    const items = [{ asset: civitaiAsset() }]
    const first = renderHook(() => useLoraOperatorHost(hostInput(items)))
    await waitFor(() =>
      expect(mineCivitaiLoraPromptsAPI).toHaveBeenCalledTimes(1),
    )
    first.rerender()
    first.unmount()

    const { result } = renderHook(() => useLoraOperatorHost(hostInput(items)))
    expect(mineCivitaiLoraPromptsAPI).toHaveBeenCalledTimes(1)
    // 缓存命中 → 同步就读得到，⛔ 不等下一次往返。
    expect(
      result.current.buildSnapshot().loras?.items[0]?.sourcePrompts,
    ).toEqual(['ink lines, rooftop', 'ink lines, neon rain'])
  })

  it('面板没开时一次都不取（⛔ 不为没在用助手的人多发 Civitai 请求）', () => {
    renderHook(() =>
      useLoraOperatorHost(hostInput([{ asset: civitaiAsset() }], false)),
    )
    expect(mineCivitaiLoraPromptsAPI).not.toHaveBeenCalled()
  })

  it('没有 Civitai provenance 的那把：不取、空数组，⛔ 不拿别的凑', () => {
    const { result } = renderHook(() =>
      useLoraOperatorHost(
        hostInput([
          {
            asset: civitaiAsset({
              provider: 'huggingface',
              modelId: undefined,
              modelVersionId: undefined,
            }),
          },
        ]),
      ),
    )
    expect(mineCivitaiLoraPromptsAPI).not.toHaveBeenCalled()
    expect(
      result.current.buildSnapshot().loras?.items[0]?.sourcePrompts,
    ).toEqual([])
  })

  it('还没取回来的那一刻是空数组（⛔ 不阻塞发送、⛔ 不编一条）', () => {
    const { result } = renderHook(() =>
      useLoraOperatorHost(hostInput([{ asset: civitaiAsset() }])),
    )
    expect(
      result.current.buildSnapshot().loras?.items[0]?.sourcePrompts,
    ).toEqual([])
  })
})

/**
 * **推荐卡确认回来的那一批挂载：超预算只念一次**（lora-assistant §10.2.3
 * 客户端那一半）。
 *
 * 🔬 回归的形状：服务端在模型开口之前一口气发三条 `mount_lora` step，客户端逐条
 * 交给导入链 —— 三次导入并发在飞，从前各自落地时各报一行，而且前两行的总和比真相
 * 小（后面那几把还没落地）。一条日志说谎比没日志坏。
 */
describe('useLoraOperatorHost 的一批挂载只报一次超预算', () => {
  function asset(id: string, defaultScale: number): LoraAssetRecord {
    return {
      id,
      styleCode: id,
      name: `LoRA ${id}`,
      source: 'imported',
      type: 'style',
      baseModelFamily: 'illustrious',
      provider: 'civitai',
      triggerWord: '',
      loraUrl: `https://cdn.test/${id}.safetensors`,
      coverImageUrl: null,
      previewImageUrls: [],
      defaultScale,
      isPublic: false,
      isOwn: false,
      createdAt: '2026-09-12T00:00:00.000Z',
    }
  }

  /**
   * ⚠ **不带 `modelVersionId`**：那一格在就要先过 Civitai 下载闸，而这一组验的是
   * 批收敛，不是那道闸。
   */
  function importPayload(id: string) {
    return {
      name: `LoRA ${id}`,
      triggerWord: '',
      loraUrl: `https://cdn.test/${id}.safetensors`,
      type: 'style' as const,
      baseModelFamily: 'illustrious' as const,
      provider: 'civitai',
      sourceSnapshot: {
        source: 'civitai' as const,
        author: 'someone',
        license: {
          label: null,
          commercialUse: null,
          allowDerivatives: null,
          allowNoCredit: null,
          known: false,
        },
        pageUrl: `https://civitai.com/models/${id}`,
        revision: null,
        retrievedAt: '2026-09-12T00:00:00.000Z',
        fileSizeBytes: 1024,
        metadataCompleteness: 'complete' as const,
      },
    }
  }

  function hostInput(
    items: readonly LoraOperatorHostMount[],
  ): UseLoraOperatorHostInput {
    return {
      prompt: '',
      setPrompt: () => {},
      appendPrompt: () => {},
      negativePrompt: '',
      setNegativePrompt: () => {},
      base: {
        id: 'illustrious-hosted',
        label: 'Illustrious · NoobAI-XL',
        family: 'illustrious',
      },
      availableBases: [
        { id: 'illustrious-hosted', label: 'Illustrious · NoobAI-XL' },
      ],
      selectBase: () => {},
      stack: { items, push: () => {}, setScale: () => {}, remove: () => {} },
      imageUpload: {
        referenceEntries: [],
        maxImages: 2,
        addReferenceImage: () => {},
        removeReferenceImage: () => {},
      },
      open: false,
      setOpen: () => {},
    }
  }

  function mount(
    host: ReturnType<typeof useLoraOperatorHost>,
    candidateId: string,
    weight: number,
  ) {
    const lora = host.apply.lora
    if (!lora) throw new Error('装配台宿主缺 apply.lora')
    return lora.mount({
      candidateId,
      name: `LoRA ${candidateId}`,
      weight,
      triggerWords: [],
      importPayload: importPayload(candidateId),
    })
  }

  function budgetLines() {
    return getOperatorState().entries.flatMap((entry) =>
      entry.kind === 'system' && entry.code === 'loraWeightOverBudget'
        ? [entry.subject]
        : [],
    )
  }

  beforeEach(() => {
    resetOperatorThread()
    ensureMountable.mockReset().mockResolvedValue(true)
    favoriteLoraAPI.mockReset()
    favoriteLoraAPI.mockImplementation(
      async (payload: { loraUrl: string; name: string }) => {
        const id = payload.loraUrl.split('/').pop()?.split('.')[0] ?? 'x'
        return { success: true, data: asset(id, 0.8) }
      },
    )
  })

  it('returns the completed import and mount outcome', async () => {
    const input = hostInput([])
    const push = vi.fn()
    input.stack!.push = push
    const { result } = renderHook(() => useLoraOperatorHost(input))

    const outcome = await mount(result.current, 'c-1', 0.6)

    expect(outcome).toMatchObject({
      status: 'ok',
      imported: true,
      mounted: true,
      triggerWordsApplied: false,
      asset: { id: 'c-1' },
    })
    expect(push).toHaveBeenCalledWith(asset('c-1', 0.8), 0.6)
  })

  it('returns a download-gate failure without importing or mounting', async () => {
    ensureMountable.mockResolvedValue(false)
    const input = hostInput([])
    const push = vi.fn()
    input.stack!.push = push
    const { result } = renderHook(() => useLoraOperatorHost(input))

    const outcome = await result.current.apply.lora!.mount({
      candidateId: 'c-1',
      name: 'LoRA c-1',
      weight: 0.6,
      triggerWords: [],
      importPayload: { ...importPayload('c-1'), modelVersionId: 123 },
    })

    expect(outcome).toMatchObject({
      status: 'failed',
      imported: false,
      mounted: false,
      triggerWordsApplied: false,
    })
    expect(favoriteLoraAPI).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('returns the import failure instead of claiming the candidate mounted', async () => {
    favoriteLoraAPI.mockResolvedValueOnce({ success: false, error: 'nope' })
    const input = hostInput([])
    const push = vi.fn()
    input.stack!.push = push
    const { result } = renderHook(() => useLoraOperatorHost(input))

    expect(await mount(result.current, 'c-1', 0.6)).toMatchObject({
      status: 'failed',
      failedStep: 'import',
      error: 'nope',
      imported: false,
      mounted: false,
    })
    expect(push).not.toHaveBeenCalled()
  })

  it('keeps a mounted candidate undoable when applying its trigger words fails', async () => {
    const input = hostInput([])
    const remove = vi.fn()
    input.stack!.remove = remove
    input.appendPrompt = () => {
      throw new Error('Prompt write failed')
    }
    const { result } = renderHook(() => useLoraOperatorHost(input))

    const outcome = await result.current.apply.lora!.mount({
      candidateId: 'c-1',
      name: 'LoRA c-1',
      weight: 0.6,
      triggerWords: ['ink lines'],
      importPayload: {
        ...importPayload('c-1'),
        sourceSnapshot: {
          ...importPayload('c-1').sourceSnapshot,
          triggerSource: 'official',
        },
      },
    })

    expect(outcome).toMatchObject({
      status: 'failed',
      imported: true,
      mounted: true,
      triggerWordsApplied: false,
      error: 'Prompt write failed',
      asset: { id: 'c-1' },
    })
    result.current.apply.lora!.unmountByCandidateId('c-1')
    expect(remove).toHaveBeenCalledWith('c-1')
  })

  /** ⭐ 三把一起挂 = 一行，且那个数是**整批**的和（⛔ 不是最后一把 + 旧栈）。 */
  it('一轮三把只插一条超预算行，且总权重是三把之和', async () => {
    const { result } = renderHook(() => useLoraOperatorHost(hostInput([])))

    mount(result.current, 'c-1', 0.6)
    mount(result.current, 'c-2', 0.6)
    mount(result.current, 'c-3', 0.6)
    await waitFor(() => expect(budgetLines()).toHaveLength(1))

    // 0.6 × 3 = 1.8，非蒸馏底模的预算是 1.5。
    expect(budgetLines()).toEqual(['1.8 / 1.5'])
  })

  /** ⚠ 整批算完还在预算内就一行都不插（⛔ 不逢挂必念）。 */
  it('整批加起来没超时一行都不插', async () => {
    const { result } = renderHook(() => useLoraOperatorHost(hostInput([])))

    mount(result.current, 'c-1', 0.6)
    mount(result.current, 'c-2', 0.6)
    await waitFor(() => expect(favoriteLoraAPI).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(budgetLines()).toEqual([]))
  })

  /** ⚠ 挂不上的那几把不进总数：它们各自已经落了一行 `loraMountFailed`。 */
  it('导入失败的那一把不算进总权重', async () => {
    favoriteLoraAPI.mockImplementationOnce(async () => ({
      success: false,
      error: 'nope',
    }))
    const { result } = renderHook(() => useLoraOperatorHost(hostInput([])))

    mount(result.current, 'c-1', 1.2)
    mount(result.current, 'c-2', 1.2)
    await waitFor(() =>
      expect(
        getOperatorState().entries.some(
          (entry) =>
            entry.kind === 'system' && entry.code === 'loraMountFailed',
        ),
      ).toBe(true),
    )
    // 只剩落地的那一把（1.2）—— 还在预算内，⛔ 不拿一个没发生的权重凑超预算。
    expect(budgetLines()).toEqual([])
  })

  /** ⚠ 已经在台上的那几把照旧算进去（口径与出图一致）。 */
  it('栈上原有的那几把照样进总数', async () => {
    const { result } = renderHook(() =>
      useLoraOperatorHost(
        hostInput([{ asset: asset('lora-old', 0.8), scale: 1 }]),
      ),
    )

    mount(result.current, 'c-1', 0.6)
    await waitFor(() => expect(budgetLines()).toHaveLength(1))
    expect(budgetLines()).toEqual(['1.6 / 1.5'])
  })
})

/**
 * **装配台那张脸**（D7b ③ · owner 09-20 改口：核心是「用 LoRA 出对图」）。
 *
 * ⚠ 那一句 =「{底模} · 挂了 {n} 个」，随挂载栈实时刷；底模还没定出来时说
 * 「未选模型」，⛔ 不留一个空的 `· 挂了 3 个`。
 */
describe('useLoraOperatorHost 的 face（D7b ③）', () => {
  function faceInput(
    mounted: number,
    base: UseLoraOperatorHostInput['base'],
  ): UseLoraOperatorHostInput {
    return {
      prompt: '',
      setPrompt: () => {},
      appendPrompt: () => {},
      negativePrompt: '',
      setNegativePrompt: () => {},
      base,
      availableBases: [],
      selectBase: () => {},
      stack: {
        items: Array.from({ length: mounted }, (_, index) => ({
          asset: { id: `lora-${index}` } as unknown as LoraAssetRecord,
        })),
        push: () => {},
        setScale: () => {},
        remove: () => {},
      },
      imageUpload: {
        referenceEntries: [],
        maxImages: 2,
        addReferenceImage: () => {},
        removeReferenceImage: () => {},
      },
      open: false,
      setOpen: () => {},
    }
  }

  const BASE = {
    id: 'wai-illustrious-v15',
    label: 'WAI-Illustrious v15',
    family: 'illustrious',
  }

  it('那一句 =「{底模} · 挂了 {n} 个」，随挂载栈实时刷', () => {
    const { result, rerender } = renderHook(
      (props: UseLoraOperatorHostInput) => useLoraOperatorHost(props),
      { initialProps: faceInput(0, BASE) },
    )
    expect(result.current.face.contextLine()).toBe(
      'face.lora.context|WAI-Illustrious v15·0',
    )
    rerender(faceInput(3, BASE))
    expect(result.current.face.contextLine()).toBe(
      'face.lora.context|WAI-Illustrious v15·3',
    )
  })

  it('底模还没定出来时说「未选模型」，⛔ 不留一个空的前半句', () => {
    const { result } = renderHook(() => useLoraOperatorHost(faceInput(2, null)))
    expect(result.current.face.contextLine()).toBe(
      'face.lora.context|face.noModel·2',
    )
  })

  it('药丸来自装配台那张脸，数量 ≤ 封顶', () => {
    const { result } = renderHook(() => useLoraOperatorHost(faceInput(0, BASE)))
    expect(result.current.face.starterPills).toEqual(
      STUDIO_OPERATOR_FACE_PILLS[ASSISTANT_PROTOCOL_DOMAIN_IDS.lora].map(
        (id) => `face.pill.${id}`,
      ),
    )
    expect(result.current.face.starterPills.length).toBeLessThanOrEqual(
      STUDIO_OPERATOR_FACE_PILL_LIMIT,
    )
    expect(result.current.face.emptyLine).toBe('face.lora.empty')
    expect(result.current.face.inputPlaceholder).toBe('face.lora.placeholder')
  })
})
