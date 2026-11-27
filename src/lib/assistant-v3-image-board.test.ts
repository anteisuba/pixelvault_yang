import {
  renderAssistantV3ImageBoard,
  renderAssistantV3ImageItem,
} from '@/lib/assistant-v3-image-board'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'

const SNAPSHOT: AssistantOperatorSnapshot = {
  prompt: '1girl, rain',
  negativePrompt: '',
  model: { id: 'nai-diffusion-5-full', label: 'NovelAI Diffusion V5 Full' },
  availableModels: [
    { id: 'nai-diffusion-5-full', label: 'NovelAI Diffusion V5 Full' },
  ],
  references: { items: [], limit: 1 },
}

function board(capabilities: AssistantOperatorSnapshot['capabilities']) {
  return renderAssistantV3ImageBoard({
    snapshot: { ...SNAPSHOT, capabilities },
    attachedNames: [],
    latestUserText: '锁住这张的种子',
  })
}

describe('renderAssistantV3ImageBoard · model options', () => {
  /** 标签台那格种子（10-21 真机：助手说「这个工作台没有种子选项」）。 */
  it('prints the tag bench seed: random until set, then the locked number', () => {
    const seed = {
      key: 'seed',
      kind: 'seed' as const,
      value: null,
      range: { min: 0, max: 4294967295, step: 1 },
      available: true,
    }
    expect(board([seed])).toContain(
      '- seed: random every run (whole number 0–4294967295; same seed + same prompt and settings = same picture)',
    )
    expect(board([{ ...seed, value: 3513516593 }])).toContain(
      '- seed: 3513516593 (whole number',
    )
  })
})

describe('renderAssistantV3ImageBoard · results on the stage', () => {
  it('lists the latest batch by result-N and marks the selected one', () => {
    const text = renderAssistantV3ImageBoard({
      snapshot: {
        ...SNAPSHOT,
        results: [
          { url: 'https://cdn.test/a.png', label: '图_1701·malfoy' },
          {
            url: 'https://cdn.test/b.png',
            label: '图_1702·malfoy',
            selected: true,
          },
        ],
      },
      attachedNames: [],
      latestUserText: '这张怎么样',
    })
    expect(text).toContain(
      'result-1 "图_1701·malfoy", result-2 "图_1702·malfoy" (selected on the stage',
    )
  })
})

describe('renderAssistantV3ImageBoard · NovelAI Precise References', () => {
  it('renders precise-N items, contract rules, +5 Anlas each and separates Base Canvas', () => {
    const snapshot: AssistantOperatorSnapshot = {
      ...SNAPSHOT,
      novelAiPreciseReferences: {
        items: [
          {
            url: 'https://cdn.test/char.png',
            kind: 'character',
            strength: 1.5,
            preferSameOutfit: false,
            source: { type: 'card', cardId: 'card-1' },
          },
          {
            url: 'https://cdn.test/outfit.png',
            kind: 'outfit',
            strength: 1,
          },
        ],
        kinds: ['character', 'style', 'character&style', 'outfit'],
        maxCount: 16,
        strength: { min: 0, max: 5, step: 0.05, default: 1 },
        supportsPreferSameOutfit: true,
        canCombineWithInpaint: false,
        supportsMultiCharacter: true,
        anlasEach: 5,
      },
    }
    const text = renderAssistantV3ImageBoard({
      snapshot,
      attachedNames: [],
      latestUserText: '加强角色参考',
    })
    expect(text).toContain('Precise references (precise_references;')
    expect(text).toContain('+5 Anlas each')
    expect(text).toContain('kinds: character, style, character&style, outfit')
    expect(text).toContain('cannot combine with inpainting')
    expect(text).toContain(
      '- precise-1: character · strength 1.5 · preferSameOutfit false · from character card',
    )
    expect(text).toContain('- precise-2: outfit · strength 1')
    expect(text).toContain(
      'Base Canvas / img2img — distinct from Precise references',
    )
    expect(renderAssistantV3ImageItem('precise-1', snapshot)).toContain(
      'precise-1: character · strength 1.5 · preferSameOutfit false',
    )
    expect(renderAssistantV3ImageItem('precise-9', snapshot)).toBeNull()
  })
})
