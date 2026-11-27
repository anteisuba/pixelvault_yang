import { describe, expect, it } from 'vitest'
import {
  compileTagPromptBatch,
  expandInlineDynamicSyntax,
  hasActiveDynamicCompilation,
  hasInlineDynamicSyntax,
  type TagPromptBlock,
} from './tag-prompt-blocks'

function makeBlock(overrides: Partial<TagPromptBlock> = {}): TagPromptBlock {
  return {
    id: 'b1',
    name: '服饰',
    target: 'positive',
    position: 'suffix',
    mode: 'fixed',
    enabled: true,
    locked: false,
    weight: 1,
    items: ['serafuku', 'maid', 'kimono'],
    cursor: 0,
    ...overrides,
  }
}

describe('tag-prompt-blocks', () => {
  it('detects and expands inline random/sequential dynamic syntax without touching legacy {tag} weight', () => {
    expect(hasInlineDynamicSyntax('1girl, {rain}')).toBe(false)
    expect(hasInlineDynamicSyntax('1girl, {red hair|silver hair}')).toBe(true)
    expect(hasInlineDynamicSyntax('1girl, ||day|night||')).toBe(true)

    expect(
      expandInlineDynamicSyntax('1girl, {rain}, {red hair|silver hair}', {
        rng: () => 0.9,
      }),
    ).toBe('1girl, {rain}, silver hair')

    expect(
      expandInlineDynamicSyntax(
        '1girl, ||day|night||, {>spring|summer|winter}',
        {
          sequenceIndex: 1,
          rng: () => 0.0,
        },
      ),
    ).toBe('1girl, day, summer')
  })

  it('compiles fixed, sequential, and random blocks with lock and native weight syntax', () => {
    const fixed = makeBlock({
      id: 'quality',
      mode: 'fixed',
      weight: 1.2,
      items: ['dramatic lighting', 'rim light'],
    })
    const seq = makeBlock({
      id: 'outfit',
      mode: 'sequential',
      items: ['serafuku', 'maid', 'kimono'],
      cursor: 0,
    })
    const lockedRandom = makeBlock({
      id: 'hair',
      mode: 'random',
      locked: true,
      items: ['red hair', 'silver hair'],
      cursor: 1,
    })
    const negBlock = makeBlock({
      id: 'neg',
      target: 'negative',
      mode: 'fixed',
      items: ['lowres', 'extra fingers'],
    })

    const batch = compileTagPromptBatch({
      basePositive: '1girl',
      baseNegative: 'blurry',
      blocks: [fixed, seq, lockedRandom, negBlock],
      count: 3,
      sequenceCounter: 0,
      rng: () => 0,
    })

    expect(batch.takes.map((take) => take.positive)).toEqual([
      '1girl, 1.2::dramatic lighting, rim light::, serafuku, silver hair',
      '1girl, 1.2::dramatic lighting, rim light::, maid, silver hair',
      '1girl, 1.2::dramatic lighting, rim light::, kimono, silver hair',
    ])
    expect(batch.takes[0]?.negative).toBe('blurry, lowres, extra fingers')
    expect(batch.nextBlocks.find((b) => b.id === 'outfit')?.cursor).toBe(0)
  })

  it('records the last rolled index on unlocked random blocks so locking freezes it', () => {
    const randomBlock = makeBlock({
      id: 'mood',
      mode: 'random',
      items: ['smile', 'blush', 'serious'],
      cursor: 0,
    })
    const batch = compileTagPromptBatch({
      basePositive: '1girl',
      baseNegative: '',
      blocks: [randomBlock],
      count: 1,
      sequenceCounter: 0,
      rng: () => 0.7, // index 2 -> 'serious'
    })
    expect(batch.takes[0]?.positive).toBe('1girl, serious')
    expect(batch.nextBlocks[0]?.cursor).toBe(2)
  })

  it('reports when dynamic compilation is active', () => {
    expect(
      hasActiveDynamicCompilation({
        basePositive: '1girl, rain',
        baseNegative: '',
        blocks: [makeBlock({ enabled: false })],
      }),
    ).toBe(false)
    expect(
      hasActiveDynamicCompilation({
        basePositive: '1girl, {rain|snow}',
        baseNegative: '',
        blocks: [],
      }),
    ).toBe(true)
    expect(
      hasActiveDynamicCompilation({
        basePositive: '1girl',
        baseNegative: '',
        blocks: [makeBlock({ enabled: true })],
      }),
    ).toBe(true)
  })

  it('supports prefix artist blocks and scales inner :: weights safely without illegal nesting', () => {
    const artistBlock = makeBlock({
      id: 'artists',
      name: '画师串',
      position: 'prefix',
      mode: 'fixed',
      weight: 1,
      items: ['0.9::artist:rella::', '0.6::artist:ask (askzy)::'],
    })
    const suffixBlock = makeBlock({
      id: 'mood',
      position: 'suffix',
      mode: 'fixed',
      items: ['rim light'],
    })
    const batch1 = compileTagPromptBatch({
      basePositive: '1girl, firefly (honkai: star rail)',
      baseNegative: '',
      blocks: [artistBlock, suffixBlock],
      count: 1,
      sequenceCounter: 0,
    })
    expect(batch1.takes[0]?.positive).toBe(
      '0.9::artist:rella::, 0.6::artist:ask (askzy)::, 1girl, firefly (honkai: star rail), rim light',
    )

    // 总权重倍率 0.5：按比例缩放内部权重且不嵌套 `::`
    const batchScaled = compileTagPromptBatch({
      basePositive: '1girl',
      baseNegative: '',
      blocks: [
        {
          ...artistBlock,
          weight: 0.5,
          items: [
            '1::artist:rella::',
            '0.8::artist:ask (askzy)::',
            'watercolor (medium)',
          ],
        },
      ],
      count: 1,
      sequenceCounter: 0,
    })
    expect(batchScaled.takes[0]?.positive).toBe(
      '0.5::artist:rella::, 0.4::artist:ask (askzy)::, 0.5::watercolor (medium)::, 1girl',
    )
  })
})
