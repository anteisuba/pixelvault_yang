import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  analyzeOperatorReferences,
  reviewOperatorReferencePrompt,
} from './assistant-reference-analysis.service'
import type { ReferenceVisualProfile } from '@/types/assistant-reference-analysis'

const urls = ['https://cdn.test/character.png', 'https://cdn.test/style.png']
const profiles: ReferenceVisualProfile[] = urls.map((url, index) => ({
  url,
  identity: `Character ${index}`,
  pose: 'Standing',
  scene: 'White backdrop',
  style: {
    proportions: 'Stylized',
    contours: 'Clean',
    shading: 'Soft',
    materials: 'Matte',
    palette: 'Muted',
    lighting: 'Diffuse',
  },
  uncertainties: ['Hidden hand'],
}))
const brief = {
  summary: 'A recognizable character with the selected rendering style',
  assignments: urls.map((url, i) => ({
    url,
    roles: [i ? 'style' : 'identity'] as ('identity' | 'style')[],
    preserve: [i ? 'Rendering style' : 'Face and costume'],
    exclude: ['Background'],
  })),
  requirements: ['White background'],
  avoid: ['Forest'],
  uncertainties: [],
}
const input = {
  urls,
  cached: [],
  context: 'Use the first character, the second style, white background.',
  language: 'English',
}

describe('reference analysis', () => {
  it('sends multiple images together and binds visual facts by server-owned URL', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          images: profiles.map((facts, imageIndex) => ({
            ...facts,
            imageIndex,
          })),
        }),
      )
      .mockResolvedValueOnce(JSON.stringify(brief))
    const result = await analyzeOperatorReferences({ ...input, complete })
    expect(complete.mock.calls[0]?.[2]).toEqual(urls)
    expect(complete.mock.calls[0]?.[0]).toContain('NOT as generated results')
    expect(result?.profiles).toEqual(profiles)
    expect(result?.brief).toEqual(brief)
  })

  it('reorders cached profiles by current URL rather than reusing old image numbers', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify(brief))
    const result = await analyzeOperatorReferences({
      ...input,
      urls: [...urls].reverse(),
      cached: profiles,
      complete,
    })
    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete.mock.calls[0]?.[2]).toBeUndefined()
    expect(result?.profiles.map((item) => item.identity)).toEqual([
      'Character 1',
      'Character 0',
    ])
    expect(result?.brief.assignments[0]?.url).toBe(urls[0])
  })

  it('analyzes only replacement images and preserves evidence for unchanged images', async () => {
    const replacement = 'https://cdn.test/new-style.png'
    const complete = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({ images: [{ ...profiles[1], imageIndex: 0 }] }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          ...brief,
          assignments: [
            brief.assignments[0],
            { ...brief.assignments[1], url: replacement },
          ],
        }),
      )
    const result = await analyzeOperatorReferences({
      ...input,
      urls: [urls[0]!, replacement],
      cached: profiles,
      complete,
    })
    expect(complete.mock.calls[0]?.[2]).toEqual([replacement])
    expect(result?.profiles[0]).toEqual(profiles[0])
    expect(result?.profiles[1]?.url).toBe(replacement)
  })

  it.each([[0, 0], [0], [0, 2]])(
    'rejects missing, duplicate or out-of-range image mappings: %j',
    async (...indices) => {
      const complete = vi.fn().mockResolvedValue(
        JSON.stringify({
          images: indices.map((imageIndex) => ({
            ...profiles[0],
            imageIndex,
          })),
        }),
      )
      expect(await analyzeOperatorReferences({ ...input, complete })).toBeNull()
      expect(complete).toHaveBeenCalledTimes(1)
    },
  )

  it('refuses a brief assigning an unseen image', async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        ...brief,
        assignments: [
          { ...brief.assignments[0], url: 'https://unseen.test/image.png' },
          brief.assignments[1],
        ],
      }),
    )
    expect(
      await analyzeOperatorReferences({ ...input, cached: profiles, complete }),
    ).toBeNull()
  })

  it('checks the entire appended prompt and reports concrete conflicts without rewriting', async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        issues: ['Forest contradicts the requested white background.'],
      }),
    )
    const issues = await reviewOperatorReferencePrompt({
      analysis: { profiles, brief },
      prompt: 'Forest background, white background',
      context: input.context,
      modelHint: 'Natural language',
      complete,
    })
    expect(complete.mock.calls[0]?.[1]).toContain(
      'Forest background, white background',
    )
    expect(issues).toEqual([
      'Forest contradicts the requested white background.',
    ])
  })

  it('does not accept an unreadable review as a pass', async () => {
    const complete = vi.fn().mockResolvedValue('Looks good!')
    expect(
      await reviewOperatorReferencePrompt({
        analysis: { profiles, brief },
        prompt: 'White background',
        context: input.context,
        modelHint: '',
        complete,
      }),
    ).toBeNull()
  })
})
