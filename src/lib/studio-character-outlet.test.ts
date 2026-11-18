import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type {
  CharacterCardRecord,
  CharacterLookRecord,
  CharacterReferenceSlot,
} from '@/types'

import { previewStudioCharacterOutlet } from './studio-character-outlet'

function slot(id: string, isPrimary = false): CharacterReferenceSlot {
  return {
    id,
    role: 'identity',
    url: `https://cdn.test/${id}.png`,
    isPrimary,
  }
}

function look(
  id: string,
  slots: CharacterReferenceSlot[],
  isDefault = false,
): CharacterLookRecord {
  return {
    id,
    label: id,
    isDefault,
    description: null,
    tags: [],
    referenceSlots: slots,
  } as CharacterLookRecord
}

const card = (id: string, looks: CharacterLookRecord[]): CharacterCardRecord =>
  ({
    id,
    name: id,
    looks,
    persona: null,
    workOverride: null,
    summary: null,
    tavern: null,
    generationCount: 0,
  }) as CharacterCardRecord

const gemini = {
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  modelId: AI_MODELS.GEMINI_PRO_IMAGE,
  maxReferenceImages: 14,
  userReferenceCount: 0,
}

describe('previewStudioCharacterOutlet（输入框里角色带进来的图）', () => {
  it('没挑图 = 当前造型的图按总线排（主图在前）', () => {
    const lin = card('lin', [
      look('daily', [slot('a'), slot('b', true)], true),
      look('battle', [slot('c', true)]),
    ])
    const out = previewStudioCharacterOutlet(
      [lin],
      { imagePicks: {}, lookIds: {} },
      gemini,
    )
    expect(out.entries[0]?.picked).toBe(false)
    expect(out.entries[0]?.images.map((image) => image.pick)).toEqual([
      { slotId: 'b' },
      { slotId: 'a' },
    ])
  })

  it('选了别的造型 = 用那一套的图', () => {
    const lin = card('lin', [
      look('daily', [slot('a', true)], true),
      look('battle', [slot('c', true)]),
    ])
    const out = previewStudioCharacterOutlet(
      [lin],
      { imagePicks: {}, lookIds: { lin: 'battle' } },
      gemini,
    )
    expect(out.entries[0]?.images.map((image) => image.url)).toEqual([
      'https://cdn.test/c.png',
    ])
  })

  it('挑了图 = 按挑的顺序；用她出的那张没有 URL（调用方按生成 id 取缩略图）', () => {
    const lin = card('lin', [look('daily', [slot('a', true), slot('b')], true)])
    const out = previewStudioCharacterOutlet(
      [lin],
      {
        imagePicks: { lin: [{ generationId: 'g1' }, { slotId: 'b' }] },
        lookIds: {},
      },
      gemini,
    )
    expect(out.entries[0]?.picked).toBe(true)
    expect(out.entries[0]?.images).toEqual([
      { pick: { generationId: 'g1' }, url: null, isPrimary: false },
      {
        pick: { slotId: 'b' },
        url: 'https://cdn.test/b.png',
        isPrimary: false,
      },
    ])
  })

  it('配额用完 / 模型不收图 = 她这一枪一张图都不带（界面出「只带文字」）', () => {
    const lin = card('lin', [look('daily', [slot('a', true)], true)])
    const out = previewStudioCharacterOutlet(
      [lin],
      { imagePicks: {}, lookIds: {} },
      { ...gemini, maxReferenceImages: 0 },
    )
    expect(out.entries[0]?.images).toEqual([])
  })

  it('Gemini Pro 角色图最多 5 张（官方：总 14、人物 ≤5）', () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      slot(`s${index}`, index === 0),
    )
    const lin = card('lin', [look('daily', many, true)])
    const out = previewStudioCharacterOutlet(
      [lin],
      { imagePicks: {}, lookIds: {} },
      { ...gemini, maxCharacterReferenceImages: 5 },
    )
    expect(out.entries[0]?.images).toHaveLength(5)
  })

  it('NovelAI V4.5 + 开关 + 单角色 = 主图走精确参考；默认关就不送', () => {
    const lin = card('lin', [look('daily', [slot('a', true), slot('b')], true)])
    const base = {
      adapterType: AI_ADAPTER_TYPES.NOVELAI,
      modelId: AI_MODELS.NOVELAI_V45_FULL,
      maxReferenceImages: 1,
      userReferenceCount: 0,
    }
    const on = previewStudioCharacterOutlet(
      [lin],
      { imagePicks: {}, lookIds: {} },
      { ...base, novelAiPreciseReference: true },
    )
    expect(on.novelAiPreciseReference).toBe(true)
    expect(on.entries[0]?.images.map((image) => image.pick)).toEqual([
      { slotId: 'a' },
    ])

    const off = previewStudioCharacterOutlet(
      [lin],
      { imagePicks: {}, lookIds: {} },
      base,
    )
    expect(off.novelAiPreciseReference).toBe(false)
    expect(off.entries[0]?.images).toEqual([])
  })
})
