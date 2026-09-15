import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  analyzeOperatorReferences,
  buildDefaultReferenceBrief,
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
    renderingMedium: '3d_stylized' as const,
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

  it('forces a 2D/3D medium enum and spells out the discriminating evidence', async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        images: profiles.map((facts, imageIndex) => ({ ...facts, imageIndex })),
      }),
    )
    await analyzeOperatorReferences({ ...input, complete })
    const system = complete.mock.calls[0]?.[0] as string
    expect(system).toContain('renderingMedium')
    expect(system).toContain('2d_flat, 2d_painterly, 3d_stylized')
    // 判据本身必须在提示里：3D 看法线高光 / 连续曲面阴影，2D 看阶梯平涂 + 线稿。
    expect(system).toContain('follow surface normals')
    expect(system).toContain('stepped cel bands')
    // ⭐ 真机 bug 那一句：动漫脸 + 角色设定图版式**不**足以判成 3D。
    expect(system).toContain('anime face')
  })

  it('rejects fresh visual evidence whose renderingMedium is missing or off the enum', async () => {
    for (const renderingMedium of [undefined, 'cel_shaded']) {
      const complete = vi.fn().mockResolvedValue(
        JSON.stringify({
          images: profiles.map((profile, imageIndex) => ({
            ...profile,
            imageIndex,
            style: { ...profile.style, renderingMedium },
          })),
        }),
      )
      await expect(
        analyzeOperatorReferences({ ...input, complete }),
      ).rejects.toMatchObject({ stage: 'vision', reason: 'schema' })
    }
  })

  it('keeps a legacy cached profile that predates renderingMedium', async () => {
    const legacy = {
      ...profiles[1]!,
      style: { ...profiles[1]!.style, renderingMedium: undefined },
    }
    const complete = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ images: [{ ...profiles[0], imageIndex: 0 }] }),
      )
    const result = await analyzeOperatorReferences({
      ...input,
      cached: [legacy],
      complete,
    })
    expect(complete.mock.calls[0]?.[2]).toEqual([urls[0]])
    expect(result.profiles[1]).toEqual(legacy)
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
    // 事实段带着判定过的成像介质：简报读的就是它，⛔ 不靠 rendering 那句自由文本猜。
    expect(complete.mock.calls[0]?.[1]).toContain('3d_stylized')
    expect(complete.mock.calls[0]?.[0]).toContain('style.renderingMedium')
  })

  /**
   * ⭐ **真机复现（2026-09-12）**：简报那一跳的 JSON 走形 —— roles 写成
   * 「character / art style」这种自然语言、`uncertainties` 吐成一个字符串 ——
   * 原来一次没过就整轮抛，用户看到「提示词未修改」。现在先把 issue 回喂一次。
   */
  it('repairs a brief whose roles and uncertainties drifted off the schema', async () => {
    const indexed = brief.assignments.map(
      ({ url: _url, ...rest }, imageIndex) => ({
        ...rest,
        imageIndex,
      }),
    )
    const complete = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          ...brief,
          assignments: indexed.map((item, index) => ({
            ...item,
            roles: [index ? 'art style' : 'character'],
          })),
          uncertainties: 'none',
        }),
      )
      .mockResolvedValueOnce(JSON.stringify({ ...brief, assignments: indexed }))
    const result = await buildOperatorReferenceBrief({
      ...input,
      profiles,
      complete,
    })
    expect(complete).toHaveBeenCalledTimes(2)
    const repair = String(complete.mock.calls[1]?.[1])
    expect(repair).toContain('PREVIOUS REPLY REJECTED (schema)')
    expect(repair).toContain('assignments.0.roles.0')
    expect(repair).toContain('uncertainties')
    expect(result.assignments).toEqual(brief.assignments)
  })

  it('reports the rejected sample when the repair attempt also fails', async () => {
    const complete = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ assignments: [] }))
    await expect(
      buildOperatorReferenceBrief({ ...input, profiles, complete }),
    ).rejects.toMatchObject({
      stage: 'brief',
      reason: 'schema',
      sample: expect.stringContaining('assignments'),
    })
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('falls back to the sources the creator named, with no uncertainties to block the write', () => {
    expect(
      buildDefaultReferenceBrief({ profiles, activeIndices: [0] }),
    ).toMatchObject({
      uncertainties: [],
      requirements: [],
      assignments: [
        { url: urls[0], roles: ['content'], exclude: [] },
        {
          url: urls[1],
          roles: ['content'],
          exclude: ['Not named by the creator for this edit'],
        },
      ],
    })
    expect(
      buildDefaultReferenceBrief({ profiles, activeIndices: [] }).assignments,
    ).toEqual(
      profiles.map(({ url }) => ({
        url,
        roles: ['content'],
        preserve: [],
        exclude: [],
      })),
    )
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
      language: 'Chinese',
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
        language: 'Chinese',
        analysis: { profiles, brief },
        prompt: 'White background',
        context: input.context,
        modelHint: '',
        complete,
      }),
    ).toBeNull()
  })
})
