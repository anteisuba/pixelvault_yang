import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import {
  type LoraOperatorHostMount,
  type UseLoraOperatorHostInput,
  toLoraOperatorResults,
  useLoraOperatorHost,
} from '@/hooks/use-lora-operator-host'
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
