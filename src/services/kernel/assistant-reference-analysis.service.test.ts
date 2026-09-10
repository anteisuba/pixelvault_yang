import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  analyzeOperatorReferences,
  buildOperatorReferenceBrief,
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
    rendering:
      'Stylized 3D NPR with volumetric hair and material-specific reflections',
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
  it('refreshes old evidence missing rendering while preserving complete cached evidence', async () => {
    const old = {
      ...profiles[0]!,
      style: { ...profiles[0]!.style, rendering: undefined },
    }
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        images: [{ ...profiles[0], imageIndex: 0 }],
      }),
    )
    const result = await analyzeOperatorReferences({
      ...input,
      cached: [old, profiles[1]!],
      complete,
    })
    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete.mock.calls[0]?.[2]).toEqual([urls[0]])
    expect(result?.profiles).toEqual(profiles)
  })

  it('rejects fresh visual evidence that omits rendering instead of accepting incomplete style facts', async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        images: profiles.map((profile, imageIndex) => ({
          ...profile,
          imageIndex,
          style: { ...profile.style, rendering: undefined },
        })),
      }),
    )
    await expect(
      analyzeOperatorReferences({ ...input, complete }),
    ).rejects.toMatchObject({
      stage: 'vision',
      reason: 'schema',
    })
  })

  it('returns verified visual evidence without requiring a creative brief', async () => {
    const complete = vi.fn().mockResolvedValueOnce(
      JSON.stringify({
        images: profiles.map((facts, imageIndex) => ({ ...facts, imageIndex })),
      }),
    )
    const result = await analyzeOperatorReferences({ ...input, complete })
    expect(complete).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ profiles, brief: null })
  })
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
    expect(result?.brief).toBeNull()
  })

  it('reorders cached profiles by current URL rather than reusing old image numbers', async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify(brief))
    const result = await analyzeOperatorReferences({
      ...input,
      urls: [...urls].reverse(),
      cached: profiles,
      complete,
    })
    expect(complete).not.toHaveBeenCalled()
    expect(result?.profiles.map((item) => item.identity)).toEqual([
      'Character 1',
      'Character 0',
    ])
    expect(result?.brief).toBeNull()
  })

  it('analyzes only replacement images and preserves evidence for unchanged images', async () => {
    const replacement = 'https://cdn.test/new-style.png'
    const complete = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({ images: [{ ...profiles[1], imageIndex: 1 }] }),
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
      await expect(
        analyzeOperatorReferences({ ...input, complete }),
      ).rejects.toMatchObject({ stage: 'vision', reason: 'image_mapping' })
      expect(complete).toHaveBeenCalledTimes(1)
    },
  )

  it('binds brief indices to server-owned URLs even with reordered output', async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        ...brief,
        assignments: brief.assignments
          .map(({ roles, preserve, exclude }, imageIndex) => ({
            roles,
            preserve,
            exclude,
            imageIndex,
          }))
          .reverse(),
      }),
    )
    const result = await buildOperatorReferenceBrief({
      ...input,
      profiles,
      complete,
    })
    expect(result.assignments).toEqual([...brief.assignments].reverse())
    expect(complete.mock.calls[0]?.[1]).not.toContain(urls[0])
  })

  it.each([[0, 0], [0], [0, 2]])(
    'rejects invalid brief indices %j',
    async (...indices) => {
      const complete = vi.fn().mockResolvedValue(
        JSON.stringify({
          ...brief,
          assignments: indices.map((imageIndex) => ({
            ...brief.assignments[0],
            imageIndex,
          })),
        }),
      )
      await expect(
        buildOperatorReferenceBrief({ ...input, profiles, complete }),
      ).rejects.toMatchObject({ stage: 'brief', reason: 'image_mapping' })
    },
  )

  it.each(['vision', 'brief'] as const)(
    'reports malformed JSON at the %s stage',
    async (stage) => {
      const complete = vi.fn().mockResolvedValue('not JSON')
      const call =
        stage === 'vision'
          ? analyzeOperatorReferences({ ...input, complete })
          : buildOperatorReferenceBrief({ ...input, profiles, complete })
      await expect(call).rejects.toMatchObject({ stage, reason: 'json' })
    },
  )

  it('reports invalid visual fields without logging model content', async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        images: [{ imageIndex: 0, identity: 'private text' }],
      }),
    )
    await expect(
      analyzeOperatorReferences({ ...input, complete }),
    ).rejects.toMatchObject({
      stage: 'vision',
      reason: 'schema',
      paths: expect.arrayContaining(['images.0.style:invalid_type']),
    })
  })

  it('inspects only image 3 and keeps its current index with two cached references', async () => {
    const third = 'https://cdn.test/third.png'
    const complete = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ images: [{ ...profiles[0], imageIndex: 2 }] }),
      )
    const result = await analyzeOperatorReferences({
      ...input,
      urls: [...urls, third],
      cached: profiles,
      imageIndices: [2],
      complete,
    })
    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete.mock.calls[0]?.[2]).toEqual([third])
    expect(complete.mock.calls[0]?.[1]).toContain('[2]')
    expect(result.profiles[2]?.url).toBe(third)
    expect(result.brief).toBeNull()
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
