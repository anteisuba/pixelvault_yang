import { describe, expect, it } from 'vitest'

import type { CharacterLoraGroup } from '@/types'

import {
  characterAttributionIds,
  characterLorasToMount,
} from './character-lora-mount'

type Lora = CharacterLoraGroup['loras'][number]

function lora(
  id: string,
  lookId: string | null,
  baseModelFamily = 'illustrious',
): Lora {
  return {
    id,
    lookId,
    baseModelFamily,
    loraUrl: `https://cdn.test/${id}.safetensors`,
  } as unknown as Lora
}

describe('characterLorasToMount（从角色选 = 把她这套的都带上）', () => {
  const group = {
    loras: [
      lora('general', null),
      lora('battle-2', 'battle'),
      lora('daily', 'daily'),
      lora('battle-1', 'battle'),
      lora('other-family', null, 'flux'),
    ],
  }

  it('点的在前 → 同一套造型的 → 通用的；别的造型、别的底模家族不带；去重', () => {
    expect(
      characterLorasToMount(group, group.loras[3]!).map((item) => item.id),
    ).toEqual(['battle-1', 'battle-2', 'general'])
  })

  it('点的是通用的：只带通用的那几枚', () => {
    expect(
      characterLorasToMount(group, group.loras[0]!).map((item) => item.id),
    ).toEqual(['general'])
  })
})

describe('characterAttributionIds（LoRA 台出图记到她名下）', () => {
  const groups = [
    {
      characterCardId: 'lin',
      loras: [lora('lin-face', null), lora('shared', null)],
    },
    {
      characterCardId: 'denia',
      loras: [lora('denia-face', null), lora('shared', null)],
    },
  ]

  it('只属于一位的 LoRA 记她；被好几位共收的不记；地址相同也算同一个', () => {
    expect(
      characterAttributionIds(groups, [
        { id: 'shared', loraUrl: 'x' },
        { id: 'other-id', loraUrl: 'https://cdn.test/denia-face.safetensors' },
        { id: 'lin-face', loraUrl: 'y' },
      ]),
    ).toEqual(['denia', 'lin'])
  })

  it('一个都不是她们的：空', () => {
    expect(
      characterAttributionIds(groups, [{ id: 'random', loraUrl: 'z' }]),
    ).toEqual([])
  })
})
