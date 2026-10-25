import { renderAssistantV3ImageBoard } from '@/lib/assistant-v3-image-board'
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
