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
import {
  SEEDANCE_20_CONTROL_RULES,
  SEEDANCE_25_CONTROL_RULES,
} from '@/constants/seedance-prompt-plan'
import type { AssistantOperatorCanvasNode } from '@/types/assistant-operator'

vi.mock('server-only', () => ({}))

import {
  buildAssistantV3CanvasGuideSection,
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

describe('画布写法 · 系统提示那一段（板上型号给整份）', () => {
  it('每个型号一行提示，板上有视频卡就带控制规则 + 视频写法 + 镜头语法', () => {
    const section = buildAssistantV3CanvasGuideSection(BOARD)
    expect(section).toContain(
      `- ${GPT_IMAGE}: ${getModelEnhanceHint(GPT_IMAGE)}`,
    )
    expect(section).toContain(`- ${SEEDANCE}: ${getModelEnhanceHint(SEEDANCE)}`)
    for (const long of [
      SEEDANCE_25_CONTROL_RULES,
      VIDEO_PROMPT_WRITING_RULES,
      CINEMATIC_SHOT_GRAMMAR,
    ])
      expect(section).toContain(long)
    // 长段各一份，⛔ 不按型号重复；⛔ 没有「先 read 再写」的闸话。
    expect(section.split(VIDEO_PROMPT_WRITING_RULES)).toHaveLength(2)
    expect(section).not.toContain('Full guide')
  })

  it('没有视频卡就没有视频写法；标签型号带标签写法', () => {
    const section = buildAssistantV3CanvasGuideSection([
      card('i1', 'image', GPT_IMAGE),
      card('i2', 'image', NOVELAI),
    ])
    expect(section).toContain(TAG_BASED_GENERATION_PROMPT_RULE)
    expect(section).not.toContain(VIDEO_PROMPT_WRITING_RULES.slice(0, 40))
    expect(section).not.toContain(CINEMATIC_SHOT_GRAMMAR.slice(0, 40))
  })

  it('Seedance 2.0 与 2.5 同在板上：两份控制规则都给', () => {
    const section = buildAssistantV3CanvasGuideSection([
      ...BOARD,
      card('v3', 'video', AI_MODELS.SEEDANCE_20_BYTEPLUS),
    ])
    expect(section).toContain(SEEDANCE_25_CONTROL_RULES)
    expect(section).toContain(SEEDANCE_20_CONTROL_RULES)
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

  it('型号多于上限：按卡数取前几种，其余只列名字、可以 read', () => {
    const cap = ASSISTANT_OPERATOR_CANVAS_LIMITS.maxDialectModels
    const extra = Array.from({ length: cap }, (_, index) =>
      card(`x${index}`, 'image', `rare-model-${index}`),
    )
    const section = buildAssistantV3CanvasGuideSection([...BOARD, ...extra])
    expect(section).toContain(`- ${SEEDANCE}:`)
    expect(section).toContain(`- ${GPT_IMAGE}:`)
    expect(section).toMatch(
      /- Also on the board: (rare-model-\d, )*rare-model-\d — read "guide:<model id>" for one's guide/,
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
