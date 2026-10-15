import { describe, expect, it, vi } from 'vitest'

import { ASSISTANT_OPERATOR_CANVAS_LIMITS } from '@/constants/assistant-operator'
import {
  CINEMATIC_SHOT_GRAMMAR,
  VIDEO_PROMPT_WRITING_RULES,
} from '@/constants/cinematic-grammar'
import {
  getModelEnhanceHint,
  TAG_BASED_GENERATION_PROMPT_RULE,
} from '@/constants/model-strengths'
import { AI_MODELS } from '@/constants/models'
import { SEEDANCE_25_CONTROL_RULES } from '@/constants/seedance-prompt-plan'
import type { AssistantOperatorCanvasNode } from '@/types/assistant-operator'
import type { AssistantV3Transcript } from '@/types/assistant-v3'

vi.mock('server-only', () => ({}))

import {
  buildAssistantV3CanvasGuideSection,
  canvasGuideGap,
  parseGuideItem,
  renderAssistantV3ModelGuide,
} from './assistant-v3-guides.service'

const SEEDANCE = AI_MODELS.SEEDANCE_25_BYTEPLUS
const GPT_IMAGE = 'gpt-image-2'
const NOVELAI = AI_MODELS.NOVELAI_V45_FULL

function card(
  id: string,
  kind: string,
  model: string,
): AssistantOperatorCanvasNode {
  return { id, name: id, kind, model }
}

const BOARD = [
  card('v1', 'video', SEEDANCE),
  card('v2', 'video', SEEDANCE),
  card('i1', 'image', GPT_IMAGE),
]

describe('画布写法（P2 第二片）· 系统提示那一段', () => {
  it('每个型号一行提示，长的那几段 ⛔ 不进系统提示，只标去哪儿取', () => {
    const section = buildAssistantV3CanvasGuideSection(BOARD)
    expect(section).toContain(
      `- ${GPT_IMAGE}: ${getModelEnhanceHint(GPT_IMAGE)}`,
    )
    expect(section).toContain(
      `- ${SEEDANCE}: ${getModelEnhanceHint(SEEDANCE)} Full guide: read "guide:${SEEDANCE}".`,
    )
    expect(section).not.toContain(
      `${GPT_IMAGE}: ${getModelEnhanceHint(GPT_IMAGE)} Full guide`,
    )
    for (const long of [
      VIDEO_PROMPT_WRITING_RULES,
      CINEMATIC_SHOT_GRAMMAR,
      SEEDANCE_25_CONTROL_RULES,
    ])
      expect(section).not.toContain(long.slice(0, 40))
  })

  it('板上卡怎么排、怎么增减同型号的卡，这一段都逐字不变（缓存吃得到）', () => {
    const one = buildAssistantV3CanvasGuideSection(BOARD)
    const two = buildAssistantV3CanvasGuideSection([
      card('i9', 'image', GPT_IMAGE),
      ...BOARD.toReversed(),
    ])
    expect(two).toBe(one)
    expect(one.indexOf(`- ${GPT_IMAGE}:`)).toBeLessThan(
      one.indexOf(`- ${SEEDANCE}:`),
    )
  })

  it('型号多于上限：按卡数取前几种，其余只列名字、指去 read', () => {
    const cap = ASSISTANT_OPERATOR_CANVAS_LIMITS.maxDialectModels
    const extra = Array.from({ length: cap }, (_, index) =>
      card(`x${index}`, 'image', `rare-model-${index}`),
    )
    const section = buildAssistantV3CanvasGuideSection([...BOARD, ...extra])
    expect(section).toContain(`- ${SEEDANCE}:`)
    expect(section).toContain(`- ${GPT_IMAGE}:`)
    expect(section).toMatch(
      /- Also on the board: (rare-model-\d, )*rare-model-\d — read "guide:<model id>"/,
    )
  })

  it('板上没有型号：一个字都不给', () => {
    expect(buildAssistantV3CanvasGuideSection([])).toBe('')
  })
})

describe('画布写法 · read "guide:<型号>"', () => {
  it('认得出 guide: 前缀（大小写不论），别的照原路走', () => {
    expect(parseGuideItem(` guide:${SEEDANCE} `)).toBe(SEEDANCE)
    expect(parseGuideItem(`Guide:${GPT_IMAGE}`)).toBe(GPT_IMAGE)
    expect(parseGuideItem('guide:')).toBeNull()
    expect(parseGuideItem('vid-1a2b3c')).toBeNull()
  })

  it('视频型号的整份写法：提示 + 控制规则 + 视频写法 + 镜头语法', () => {
    const guide = renderAssistantV3ModelGuide(SEEDANCE, true)
    expect(guide.startsWith(`PROMPT GUIDE FOR ${SEEDANCE}\n`)).toBe(true)
    expect(guide).toContain(getModelEnhanceHint(SEEDANCE)!)
    expect(guide).toContain(SEEDANCE_25_CONTROL_RULES)
    expect(guide).toContain(VIDEO_PROMPT_WRITING_RULES)
    expect(guide).toContain(CINEMATIC_SHOT_GRAMMAR)
  })

  it('标签型号带标签写法，图片型号只有那一行', () => {
    expect(renderAssistantV3ModelGuide(NOVELAI, false)).toContain(
      TAG_BASED_GENERATION_PROMPT_RULE,
    )
    const image = renderAssistantV3ModelGuide(GPT_IMAGE, false)
    expect(image).toContain(getModelEnhanceHint(GPT_IMAGE)!)
    expect(image).not.toContain(VIDEO_PROMPT_WRITING_RULES.slice(0, 40))
  })
})

describe('画布写法 · 写词闸', () => {
  const board = (): AssistantV3Transcript => [
    { type: 'board', text: 'BOARD', images: [] },
  ]
  const assistant = (): AssistantV3Transcript[number] => ({
    type: 'assistant',
    text: '',
    calls: [],
  })
  const guideResult = (modelId: string): AssistantV3Transcript[number] => ({
    type: 'result',
    id: 'call-guide',
    tool: 'read',
    output: renderAssistantV3ModelGuide(modelId, true),
    error: false,
  })

  it('系统提示里那一行就够的型号：不拦', () => {
    expect(
      canvasGuideGap({
        modelId: GPT_IMAGE,
        video: false,
        nodes: BOARD,
        transcript: [...board(), assistant()],
      }),
    ).toBeNull()
  })

  it('视频型号没取过整份写法：拦下，给的就是那份写法', () => {
    const gap = canvasGuideGap({
      modelId: SEEDANCE,
      video: true,
      nodes: BOARD,
      transcript: [...board(), assistant()],
    })
    expect(gap).toBe(renderAssistantV3ModelGuide(SEEDANCE, true))
  })

  it('前面一步读过：放行；同一条回复里并排读的 ⛔ 不算（写的时候还没看到）', () => {
    expect(
      canvasGuideGap({
        modelId: SEEDANCE,
        video: true,
        nodes: BOARD,
        transcript: [
          ...board(),
          assistant(),
          guideResult(SEEDANCE),
          assistant(),
        ],
      }),
    ).toBeNull()
    expect(
      canvasGuideGap({
        modelId: SEEDANCE,
        video: true,
        nodes: BOARD,
        transcript: [...board(), assistant(), guideResult(SEEDANCE)],
      }),
    ).not.toBeNull()
  })

  it('这一轮刚换上、系统提示没列的型号：有提示就拦下给提示', () => {
    const gap = canvasGuideGap({
      modelId: GPT_IMAGE,
      video: false,
      nodes: [card('v1', 'video', SEEDANCE)],
      transcript: [...board(), assistant()],
    })
    expect(gap).toBe(renderAssistantV3ModelGuide(GPT_IMAGE, false))
  })

  it('没有任何写法的型号：不拦（拦了也给不出东西）', () => {
    expect(
      canvasGuideGap({
        modelId: 'some-unknown-model',
        video: false,
        nodes: BOARD,
        transcript: [...board(), assistant()],
      }),
    ).toBeNull()
  })
})
