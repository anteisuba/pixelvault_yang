import { describe, expect, it } from 'vitest'
import { AdvancedParamsSchema } from './index'
import { NovelAiCharacterLayoutSchema } from './novelai'

const character = {
  prompt: 'girl, blue hair',
  negativePrompt: 'hat',
  position: { x: 0.2, y: 0.8 },
}
describe('NovelAI V5 character layout', () => {
  it('retains independent character prompts and placement through shared input parsing', () => {
    const novelAiLayout = { positioning: 'manual', characters: [character] }
    expect(AdvancedParamsSchema.parse({ novelAiLayout }).novelAiLayout).toEqual(
      novelAiLayout,
    )
  })
  it.each([
    [],
    Array.from({ length: 23 }, () => character),
    [{ ...character, prompt: '  ' }],
    [{ ...character, position: { x: 1.01, y: 0 } }],
    [{ ...character, position: { x: 0, y: -0.01 } }],
  ])('rejects invalid characters %j', (characters) => {
    expect(
      NovelAiCharacterLayoutSchema.safeParse({
        positioning: 'auto',
        characters,
      }).success,
    ).toBe(false)
  })
  it('accepts 22 characters and boundary coordinates', () => {
    expect(
      NovelAiCharacterLayoutSchema.safeParse({
        positioning: 'auto',
        characters: Array.from({ length: 22 }, () => ({
          ...character,
          position: { x: 0, y: 1 },
        })),
      }).success,
    ).toBe(true)
  })
})
