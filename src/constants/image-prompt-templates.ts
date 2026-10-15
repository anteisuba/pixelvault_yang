/**
 * 图片卡的 **`/` 模板**（node-canvas-v2 §3，A 方向 owner 2026-10-14）。
 *
 * 正文里打 `/` 选一个，正文开头多一颗模板 chip；**发送时**才把你写的那一句接进
 * 模板全文发出去，⛔ 模板文本进输入框、进版本记录。替代原来「画面」弹层里的
 * 九宫格开关（存量卡上的 `storyboardGrid: true` 读成 `grid3`）。
 *
 * - 宫格两档出**一张**，出完按 `gridSize` 自动切开（`useStoryboardGridSplit`）。
 * - `sequence4` 并行出**四张**，每张一拍，落进版本条（A1：批量进版本）。
 *
 * 用英文写：各家出图模型对英文版式指令最听话，你的原句照原样嵌在 `{story}`。
 */

import type { StoryboardGridSize } from '@/constants/storyboard-grid'

export const IMAGE_PROMPT_TEMPLATE_IDS = [
  'grid3',
  'grid2',
  'sequence4',
] as const
export type ImagePromptTemplateId = (typeof IMAGE_PROMPT_TEMPLATE_IDS)[number]

/**
 * 助手清掉模板用的值（它的载荷里 `null` 表示「不改这一格」，清掉要一个具名值）。
 * ⛔ 不落进卡：`set_params` 执行时把它换成「没有模板」。
 */
export const IMAGE_PROMPT_TEMPLATE_NONE = 'none'

/** 助手载荷与快照里 `promptTemplate` 的值域：三种模板 + 清掉。 */
export const IMAGE_PROMPT_TEMPLATE_CHOICES = [
  IMAGE_PROMPT_TEMPLATE_NONE,
  ...IMAGE_PROMPT_TEMPLATE_IDS,
] as const
export type ImagePromptTemplateChoice =
  (typeof IMAGE_PROMPT_TEMPLATE_CHOICES)[number]

interface ImagePromptTemplate {
  /** 这一枪发几张（钉死，张数 chip 跟着锁住）。 */
  readonly count: number
  /** 出完按几宫格切；不切的模板没有。 */
  readonly gridSize?: StoryboardGridSize
  /** `{story}` = 你写的那一句；`{shot}` / `{total}` 只有逐张出的模板用。 */
  readonly prompt: string
}

const SAME_LOOK =
  'Keep the same characters, costumes, art style, color grading and lighting throughout.'
const NO_TEXT = 'No text, captions, numbers, speech bubbles or frames anywhere.'

export const IMAGE_PROMPT_TEMPLATES: Record<
  ImagePromptTemplateId,
  ImagePromptTemplate
> = {
  grid3: {
    count: 1,
    gridSize: 3,
    prompt: [
      'A single image arranged as a 3×3 storyboard grid: nine sequential panels of equal size, read left to right, top to bottom, telling this story:',
      '{story}',
      `${SAME_LOOK} Vary the shot size across the panels (wide, medium, close-up, then pull back).`,
      `Separate the panels with thin plain white gutters. ${NO_TEXT}`,
    ].join('\n'),
  },
  grid2: {
    count: 1,
    gridSize: 2,
    prompt: [
      'A single image arranged as a 2×2 comic grid: four sequential panels of equal size, read left to right, top to bottom, telling this story in four beats (setup, development, turn, payoff):',
      '{story}',
      SAME_LOOK,
      `Separate the panels with thin plain white gutters. ${NO_TEXT}`,
    ].join('\n'),
  },
  sequence4: {
    count: 4,
    prompt: [
      'Shot {shot} of {total} from one continuous storyboard sequence telling this story:',
      '{story}',
      'Show only beat {shot} of {total} of the story, as a single full-frame cinematic shot.',
      `${SAME_LOOK} ${NO_TEXT}`,
    ].join('\n'),
  },
}
