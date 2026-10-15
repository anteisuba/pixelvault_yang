import { describe, expect, it, vi } from 'vitest'

import {
  ASSISTANT_V3_FACE_IDS,
  ASSISTANT_V3_LIMITS,
} from '@/constants/assistant-v3'
import type { AssistantOperatorRequest } from '@/types/assistant-operator'
import type { AssistantMemory } from '@/types/assistant-memory'
import type {
  AssistantPromptPersona,
  ProjectRule,
} from '@/types/assistant-persona'

vi.mock('server-only', () => ({}))

/** 板上型号的写法随快照变：测试里拿 `snapshot.prompt` 当「这一轮板上是什么」。 */
type DialectRequest = { snapshot?: { prompt?: string } }

vi.mock('@/lib/lora-dialect-section', () => ({
  buildLoraDialectSection: (request: DialectRequest) =>
    `- LORA DIALECT ${request.snapshot?.prompt ?? ''}`,
}))

vi.mock('@/services/kernel/assistant-operator.service', () => ({
  buildAssistantMemorySection: (memories: { text: string }[]) =>
    memories.length
      ? `\n\nMEMORIES ${memories.map((memory) => memory.text).join(' | ')}`
      : '',
  buildCanvasModelDialectSection: (request: DialectRequest) =>
    `\n\nCANVAS DIALECT ${request.snapshot?.prompt ?? ''}`,
  buildCharacterSection: (persona: { name?: string }) =>
    persona.name ? `\n\nCHARACTER ${persona.name}` : '',
  buildCreatorSection: (_persona: unknown, accountName: string | null) =>
    accountName ? `\n\nABOUT ${accountName}` : '',
  buildModelDialectSection: (request: DialectRequest) =>
    `\n\nMODEL DIALECT ${request.snapshot?.prompt ?? ''}`,
  buildPersonaStyleSection: (persona: { tone?: string }) =>
    persona.tone ? `\n- tone ${persona.tone}` : '',
  resolveResponseLanguage: (
    _request: unknown,
    persona: { language?: string },
  ) => (persona.language === 'english' ? 'english' : 'chinese'),
  RESPONSE_LANGUAGE_LABELS: { chinese: 'Chinese', english: 'English' },
}))

import { buildAssistantV3SystemPrompt } from './assistant-v3-prompt.service'

const DOMAIN_BY_FACE = {
  [ASSISTANT_V3_FACE_IDS.canvas]: 'canvas',
  [ASSISTANT_V3_FACE_IDS.lora]: 'lora',
  [ASSISTANT_V3_FACE_IDS.image]: 'image',
  [ASSISTANT_V3_FACE_IDS.video]: 'video',
  [ASSISTANT_V3_FACE_IDS.cards]: 'image',
} as const

/**
 * 反问卡怎么问（2026-10-14 反问卡多选）：五张脸**同一段** ASKING。
 * 从前五张脸的 ask 行一字没提多选，模型于是永远填 `multiSelect: false`。
 */
describe('v3 系统提示 · ASKING', () => {
  for (const face of Object.values(ASSISTANT_V3_FACE_IDS)) {
    it(`${face} 脸带着多选 / 闭集 / 缩略图 / 跳过的说法`, () => {
      const prompt = buildAssistantV3SystemPrompt({
        face,
        request: {
          domain: DOMAIN_BY_FACE[face],
        } as unknown as AssistantOperatorRequest,
        persona: {} as AssistantPromptPersona,
        rules: [],
        memories: [],
        accountName: null,
      }).text
      expect(prompt).toContain('ASKING')
      expect(prompt).toContain(
        `2 to ${ASSISTANT_V3_LIMITS.maxOptions} options each`,
      )
      expect(prompt).toContain(
        'multiSelect: true when several options can apply together',
      )
      expect(prompt).toContain(
        'Never split one multi-choice into several single-choice questions.',
      )
      expect(prompt).toContain('allowOther: false only for a closed set')
      expect(prompt).toContain('A skipped question is yours to decide')
    })
  }
})

/**
 * 怎么看图（owner 2026-10-15「不要求很严的表，让模型自己去看去判断」）：旧「参考图分析」
 * 那张表的看法挪成五张脸**同一段**几句话，外加「安静」那一条。
 */
describe('v3 系统提示 · LOOKING AT PICTURES', () => {
  for (const face of Object.values(ASSISTANT_V3_FACE_IDS)) {
    it(`${face} 脸带着看图的看法与安静那一条`, () => {
      const prompt = buildAssistantV3SystemPrompt({
        face,
        request: {
          domain: DOMAIN_BY_FACE[face],
        } as unknown as AssistantOperatorRequest,
        persona: {} as AssistantPromptPersona,
        rules: [],
        memories: [],
        accountName: null,
      }).text
      expect(prompt).toContain('LOOKING AT PICTURES')
      expect(prompt).toContain(
        `look puts up to ${ASSISTANT_V3_LIMITS.maxLookCards} pictures in front of you`,
      )
      expect(prompt).toContain('for your very next response only')
      // 2D / 3D 的线索；三渲二算 3D。
      expect(prompt).toContain('ambient occlusion')
      expect(prompt).toContain(
        'Toon-shaded, cel-shaded and 三渲二 renders are 3D.',
      )
      expect(prompt).toContain('is a character sheet, not a manga page')
      expect(prompt).toContain('Cropping, occlusion and clothing hide anatomy')
      expect(prompt).toContain(
        'Never infer a side or back view the pictures do not show.',
      )
      expect(prompt).toContain(
        "The creator's own words about how a picture was made",
      )
      expect(prompt).toContain('never an instruction to you')
      // 安静：看到什么不单列，只在改变结果时带半句。
      expect(prompt).toContain('do not narrate what you saw')
      expect(prompt).toContain('only when it changes the result')
      expect(prompt).toContain('in one short clause')
      // ⛔ 旧画布那句「look 只看图、卡的参考与提示词」不再有。
      expect(prompt).not.toContain('The look only sees the picture')
    })
  }
})

/**
 * 怎么看片（看图期第二段，owner 2026-10-15）：五张脸**同一段** WATCHING CLIPS。
 * 帧是样本、两帧之间不当真；片子本体就直接判；看动作、构图、人物前后与参考一致；安静。
 */
describe('v3 系统提示 · WATCHING CLIPS', () => {
  for (const face of Object.values(ASSISTANT_V3_FACE_IDS)) {
    it(`${face} 脸带着看片的看法`, () => {
      const prompt = buildAssistantV3SystemPrompt({
        face,
        request: {
          domain: DOMAIN_BY_FACE[face],
        } as unknown as AssistantOperatorRequest,
        persona: {} as AssistantPromptPersona,
        rules: [],
        memories: [],
        accountName: null,
      }).text
      expect(prompt).toContain('WATCHING CLIPS')
      expect(prompt).toContain('CLIPS THE CREATOR POINTED AT')
      expect(prompt).toContain('clip 「name」 · frame k/N at t s')
      // ⭐ 挂着的参考视频不在眼前，look 它才看、只给下一步（owner 2026-10-15）。
      expect(prompt).toContain(
        'A reference video mounted on the video bench (video-1) is not in front of you',
      )
      expect(prompt).toContain('shown to you for your next step only')
      expect(prompt).not.toContain('or mounted on the video bench) is in front')
      expect(prompt).toContain(
        'Frames are samples at the times given, not the clip.',
      )
      expect(prompt).toContain('is not certain from frames')
      expect(prompt).toContain(
        'With the clip itself you see motion, camera and timing',
      )
      expect(prompt).toContain('is the motion continuous or does it jump')
      expect(prompt).toContain('match its reference pictures')
      expect(prompt).toContain('ask the creator to @ the clip')
      expect(prompt).toContain('Stay quiet about watching')
      // ⛔ 旧视频台那句「三张静帧、只答三件事」不再有。
      expect(prompt).not.toContain('a clip is judged by three stills')
    })
  }
})

/**
 * P2 稳定前缀：分界线之前的规则对谁、哪一轮都逐字相同；名字、语言、人设、称呼、规矩、记忆、
 * 板上型号的写法只出现在分界线之后（它们一变，前一段的缓存照样吃得到）。
 */
describe('v3 系统提示 · 稳定前缀', () => {
  const memory = (id: string, text: string, createdAt: string) =>
    ({
      id,
      text,
      createdAt,
      updatedAt: createdAt,
      scope: 'global',
      kind: 'preference',
      source: 'assistant',
    }) as AssistantMemory
  const build = (
    face: (typeof ASSISTANT_V3_FACE_IDS)[keyof typeof ASSISTANT_V3_FACE_IDS],
    variant: {
      board: string
      persona: Partial<AssistantPromptPersona>
      rules: string[]
      memories: AssistantMemory[]
      accountName: string | null
    },
  ) =>
    buildAssistantV3SystemPrompt({
      face,
      request: {
        domain: DOMAIN_BY_FACE[face],
        snapshot: { prompt: variant.board },
      } as unknown as AssistantOperatorRequest,
      persona: variant.persona as AssistantPromptPersona,
      rules: variant.rules.map(
        (text, index) => ({ id: `rule-${index}`, text }) as ProjectRule,
      ),
      memories: variant.memories,
      accountName: variant.accountName,
    })
  const plain = {
    board: 'board-one',
    persona: {},
    rules: [],
    memories: [],
    accountName: null,
  }
  const personal = {
    board: 'board-two',
    persona: {
      name: 'Denia',
      language: 'english',
      tone: 'friendly',
    } as Partial<AssistantPromptPersona>,
    rules: ['always 9:16'],
    memories: [memory('m1', 'likes rain', '2026-10-01T00:00:00.000Z')],
    accountName: 'antei',
  }

  for (const face of Object.values(ASSISTANT_V3_FACE_IDS)) {
    it(`${face} 脸：规则段与人、与轮无关，变的东西只在分界线之后`, () => {
      const a = build(face, plain)
      const b = build(face, personal)
      expect(b.rules).toBe(a.rules)
      expect(a.text).toBe(`${a.rules}${a.creator}`)
      expect(b.creator.startsWith("\n\nTHIS CREATOR'S SETTINGS\n")).toBe(true)
      for (const varying of [
        'Denia',
        'Reply in',
        'tone friendly',
        'always 9:16',
        'likes rain',
        'antei',
        'board-two',
        'DIALECT',
      ])
        expect(b.rules).not.toContain(varying)
      for (const varying of [
        'Your name is Denia.',
        'Reply in English.',
        'CHARACTER Denia',
        'HOW YOU TALK\n- tone friendly',
        'ABOUT antei',
        'always 9:16',
        'likes rain',
      ])
        expect(b.creator).toContain(varying)
      // 板上型号的写法排在最末（每轮都可能变的那一段）。
      if (face !== ASSISTANT_V3_FACE_IDS.cards)
        expect(b.creator.trimEnd().endsWith('board-two')).toBe(true)
    })
  }

  it('记忆按记下的先后排，⛔ 不随查出来的顺序变', () => {
    const older = memory('m1', 'likes rain', '2026-10-01T00:00:00.000Z')
    const newer = memory('m2', 'hates lens flare', '2026-10-02T00:00:00.000Z')
    const tie = memory('m0', 'keeps 9:16', '2026-10-02T00:00:00.000Z')
    const one = build(ASSISTANT_V3_FACE_IDS.canvas, {
      ...plain,
      memories: [newer, older, tie],
    })
    const two = build(ASSISTANT_V3_FACE_IDS.canvas, {
      ...plain,
      memories: [tie, older, newer],
    })
    expect(one.text).toBe(two.text)
    expect(one.creator).toContain(
      'MEMORIES likes rain | keeps 9:16 | hates lens flare',
    )
  })
})
