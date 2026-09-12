import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import {
  type LoraOperatorHostMount,
  type UseLoraOperatorHostInput,
  toLoraOperatorResults,
  useLoraOperatorHost,
} from '@/hooks/use-lora-operator-host'
import {
  getOperatorState,
  resetOperatorThread,
} from '@/hooks/use-studio-operator-store'
import type { LoraAssetRecord } from '@/types'

/** 这一层验的是快照形状，不是词表 —— 桩成「回 key」就够（同工作台宿主那份）。 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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
