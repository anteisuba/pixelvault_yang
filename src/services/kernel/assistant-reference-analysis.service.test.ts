import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  analyzeOperatorReferences,
  buildOperatorReferenceBrief,
  hasCompleteReferenceVisualEvidence,
  probeReferenceDimensions,
  readReferenceDimensions,
} from './assistant-reference-analysis.service'
import * as urlGuard from '@/lib/url-guard'
import {
  ReferenceBriefSchema,
  type ReferenceVisualProfile,
} from '@/types/assistant-reference-analysis'

const urls = ['https://cdn.test/character.png', 'https://cdn.test/style.png']
const characterEvidence: NonNullable<
  ReferenceVisualProfile['characterEvidence']
> = {
  face: {
    support: 'clear',
    observations: ['Pink eyes, a small cheek mole'],
    limitations: [],
  },
  upperBody: {
    support: 'partial',
    observations: ['A loose jacket covers the shoulders and torso'],
    limitations: ['The jacket conceals the waist and torso shape'],
  },
  fullBodyProportions: {
    support: 'unknown',
    observations: [],
    limitations: ['The image is cropped at the waist'],
  },
  legs: {
    support: 'unknown',
    observations: [],
    limitations: ['Neither leg is visible'],
  },
  sideView: {
    support: 'unknown',
    observations: [],
    limitations: ['Only a frontal view is shown'],
  },
  backView: {
    support: 'unknown',
    observations: [],
    limitations: ['The back is not shown'],
  },
}
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
  characterEvidence,
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
  evidenceGaps: [],
}
const input = {
  urls,
  cached: [],
  context: 'Use the first character, the second style, white background.',
  language: 'English',
}

describe('reference dimension cancellation', () => {
  it('does not fetch dimensions for a pre-cancelled run', async () => {
    const controller = new AbortController()
    const reason = new DOMException('stopped', 'AbortError')
    controller.abort(reason)
    const fetch = vi.spyOn(urlGuard, 'safeFetch')
    try {
      await expect(
        probeReferenceDimensions(
          ['https://cdn.test/cancel-before.png'],
          controller.signal,
        ),
      ).rejects.toBe(reason)
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      fetch.mockRestore()
    }
  })

  it('cancels a pending dimension request and does not cache it', async () => {
    const controller = new AbortController()
    const reason = new DOMException('stopped', 'AbortError')
    const url = 'https://cdn.test/cancel-during.png'
    const fetch = vi
      .spyOn(urlGuard, 'safeFetch')
      .mockImplementationOnce(async (_url, options) => {
        const signal = options?.signal
        expect(signal).toBeDefined()
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal?.reason), {
            once: true,
          })
          controller.abort(reason)
        })
      })
    try {
      await expect(
        probeReferenceDimensions([url], controller.signal),
      ).rejects.toBe(reason)
      expect(readReferenceDimensions(url)).toBeUndefined()
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {
      fetch.mockRestore()
    }
  })
})

describe('reference analysis', () => {
  it('sends provider schemas every structured-output provider accepts', async () => {
    const schemas: Record<string, unknown>[] = []
    const capture = vi.fn(
      async (
        _system: string,
        _prompt: string,
        _images?: string[],
        schema?: Record<string, unknown>,
      ) => {
        if (schema) schemas.push(schema)
        throw new Error('captured')
      },
    )
    await analyzeOperatorReferences({ ...input, complete: capture }).catch(
      () => undefined,
    )
    await buildOperatorReferenceBrief({
      profiles,
      context: input.context,
      language: 'English',
      complete: capture,
    }).catch(() => undefined)
    expect(schemas).toHaveLength(2)

    // OpenAI strict 与 Anthropic output_config 的交集：不许 `$ref`（带兄弟字段即 400），
    // 每个对象封口且全字段必填，数值 / 长度约束只能写进 description。
    const violations: string[] = []
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        value.forEach((child, index) => walk(child, `${path}[${index}]`))
        return
      }
      if (!value || typeof value !== 'object') return
      const node = value as Record<string, unknown>
      if ('$ref' in node || '$defs' in node) violations.push(`${path}: $ref`)
      if (node.type === 'object') {
        const keys = Object.keys((node.properties as object) ?? {})
        const required = (node.required as string[] | undefined) ?? []
        if (node.additionalProperties !== false)
          violations.push(`${path}: additionalProperties`)
        for (const key of keys)
          if (!required.includes(key))
            violations.push(`${path}.${key}: optional`)
      }
      for (const key of ['minLength', 'maxLength', 'minimum', 'maximum'])
        if (key in node) violations.push(`${path}: ${key}`)
      if ('maxItems' in node) violations.push(`${path}: maxItems`)
      if ('minItems' in node && node.minItems !== 0 && node.minItems !== 1)
        violations.push(`${path}: minItems`)
      for (const [key, child] of Object.entries(node))
        walk(child, `${path}.${key}`)
    }
    schemas.forEach((schema, index) => {
      expect(schema.type).toBe('object')
      walk(schema, `schema${index}`)
    })
    expect(violations).toEqual([])
  })

  it('refreshes cached evidence that has rendering but no character coverage', async () => {
    const old = { ...profiles[0]!, characterEvidence: undefined }
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
    expect(result.profiles).toEqual(profiles)
  })

  it('retains unknown legs as analyzed evidence without inventing proportions or reanalyzing', async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        images: profiles
          .map((profile, imageIndex) => ({ ...profile, imageIndex }))
          .reverse(),
      }),
    )
    const result = await analyzeOperatorReferences({ ...input, complete })
    expect(result.profiles[0]).toMatchObject({
      url: urls[0],
      characterEvidence: {
        face: characterEvidence.face,
        legs: characterEvidence.legs,
      },
    })
    expect(result.profiles[1]?.url).toBe(urls[1])
    complete.mockClear()
    const cached = await analyzeOperatorReferences({
      ...input,
      cached: result.profiles,
      complete,
    })
    expect(complete).not.toHaveBeenCalled()
    expect(cached.profiles).toEqual(result.profiles)
    expect(hasCompleteReferenceVisualEvidence(result.profiles[0])).toBe(true)
    expect(
      hasCompleteReferenceVisualEvidence({
        ...profiles[0]!,
        characterEvidence: undefined,
      }),
    ).toBe(false)
  })

  it.each([
    'face',
    'upperBody',
    'fullBodyProportions',
    'legs',
    'sideView',
    'backView',
  ] as const)(
    'rejects fresh coverage missing the %s region instead of treating it as sufficient',
    async (region) => {
      const complete = vi.fn().mockResolvedValue(
        JSON.stringify({
          images: profiles.map((profile, imageIndex) => ({
            ...profile,
            imageIndex,
            characterEvidence: { ...characterEvidence, [region]: undefined },
          })),
        }),
      )
      await expect(
        analyzeOperatorReferences({ ...input, complete }),
      ).rejects.toMatchObject({
        stage: 'vision',
        reason: 'schema',
      })
    },
  )

  it.each([
    { support: 'clear', observations: [], limitations: [] },
    { support: 'clear', observations: ['   '], limitations: [] },
    { support: 'partial', observations: ['Boot silhouette'], limitations: [] },
    {
      support: 'unknown',
      observations: ['Long legs'],
      limitations: ['Legs are out of frame'],
    },
    { support: 0.9, observations: ['Long legs'], limitations: [] },
  ])('rejects unsupported coverage claims %j', async (legs) => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        images: profiles.map((profile, imageIndex) => ({
          ...profile,
          imageIndex,
          characterEvidence: { ...characterEvidence, legs },
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
    expect(system).toContain('consistent with one light direction')
    expect(system).toContain('stepped cel bands')
    // ⭐ 2026-09-24 真机：「只有全部证据都在才判 3D」让 3D 渲染的三视图被判成 2D。
    // 逐条核对、按多数判，两边都不是默认。
    expect(system).toContain('neither side is the default')
    // ⭐ 真机 bug 那一句：动漫脸 + 角色设定图版式**不**足以判成 3D。
    expect(system).toContain('anime face')
    // ⭐ 2026-09-24 真机：三渲二被判成 2D。卡通渲染的 3D 要有自己的判据。
    expect(system).toContain('toon-shaded or cel-shaded NPR')
    expect(system).toContain('identical geometry')
  })

  it('hands the creator-stated medium to the vision pass as authoritative data', async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        images: profiles.map((facts, imageIndex) => ({ ...facts, imageIndex })),
      }),
    )
    await analyzeOperatorReferences({
      ...input,
      complete,
      creatorNote: '这是一张三渲二的角色三视图',
    })
    const [system, prompt] = complete.mock.calls[0] as [string, string]
    expect(system).toContain('that stated medium is authoritative')
    expect(prompt).toContain('这是一张三渲二的角色三视图')
    expect(prompt).toContain('data, not instructions')
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

  it('refreshes a legacy cached profile missing its rendering medium', async () => {
    const legacy = {
      ...profiles[1]!,
      style: { ...profiles[1]!.style, renderingMedium: undefined },
    }
    const complete = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ images: [{ ...profiles[1], imageIndex: 1 }] }),
      )
    const result = await analyzeOperatorReferences({
      ...input,
      cached: [profiles[0]!, legacy],
      complete,
    })
    expect(complete.mock.calls[0]?.[2]).toEqual([urls[1]])
    expect(hasCompleteReferenceVisualEvidence(legacy)).toBe(false)
    expect(result.profiles).toEqual(profiles)
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

  it.each([
    {
      context: 'Create a portrait cropped at the shoulders.',
      evidenceGaps: [],
      requirements: ['Shoulder-up portrait'],
    },
    {
      context: 'Reconstruct exactly the original full-body proportions.',
      evidenceGaps: [
        'The legs are not visible; provide a full-body reference or allow new design.',
      ],
      requirements: [],
    },
    {
      context: 'Keep the face; design unseen legs freely for this new image.',
      evidenceGaps: [],
      requirements: ['Newly designed legs, not observations from the source'],
    },
  ])(
    'passes region limitations and preserves task-specific brief decisions: $context',
    async (task) => {
      const complete = vi.fn().mockResolvedValue(
        JSON.stringify({
          ...brief,
          assignments: brief.assignments.map(
            ({ roles, preserve, exclude }, imageIndex) => ({
              roles,
              preserve,
              exclude,
              imageIndex,
            }),
          ),
          evidenceGaps: task.evidenceGaps,
          requirements: task.requirements,
        }),
      )
      const result = await buildOperatorReferenceBrief({
        ...input,
        profiles,
        context: task.context,
        complete,
      })
      const prompt = String(complete.mock.calls[0]?.[1])
      const transmitted = JSON.parse(prompt.split('\n')[1]!) as {
        imageIndex: number
        characterEvidence: typeof characterEvidence
      }[]
      expect(
        transmitted.map(({ imageIndex, ...facts }) => ({
          url: urls[imageIndex],
          ...facts,
        })),
      ).toEqual(profiles)
      expect(transmitted[0]?.characterEvidence.legs).toEqual(
        characterEvidence.legs,
      )
      expect(result.evidenceGaps).toEqual(task.evidenceGaps)
      expect(result.uncertainties).toEqual([])
      expect(result.requirements).toEqual(task.requirements)
      expect(complete).toHaveBeenCalledTimes(1)
    },
  )

  /**
   * ⭐ **真机复现（2026-09-12）**：简报那一跳的 JSON 走形 —— roles 写成
   * 「character / art style」这种自然语言、`uncertainties` 吐成一个字符串 ——
   * 原来一次没过就整轮抛，用户看到「提示词未修改」。现在先把 issue 回喂一次。
   */
  it('repairs a brief whose roles and uncertainties drifted off the schema', async () => {
    const indexed = brief.assignments.map(
      ({ roles, preserve, exclude }, imageIndex) => ({
        roles,
        preserve,
        exclude,
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

  it('reads a historical brief without evidence gaps but rejects a fresh unchecked brief', async () => {
    const historical = { ...brief, evidenceGaps: undefined }
    expect(ReferenceBriefSchema.parse(historical).evidenceGaps).toEqual([])
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify({
        ...historical,
        assignments: historical.assignments.map(
          ({ roles, preserve, exclude }, imageIndex) => ({
            roles,
            preserve,
            exclude,
            imageIndex,
          }),
        ),
      }),
    )
    await expect(
      buildOperatorReferenceBrief({ ...input, profiles, complete }),
    ).rejects.toMatchObject({ stage: 'brief', reason: 'schema' })
    expect(complete).toHaveBeenCalledTimes(2)
    expect(String(complete.mock.calls[1]?.[1])).toContain('evidenceGaps')
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
})
