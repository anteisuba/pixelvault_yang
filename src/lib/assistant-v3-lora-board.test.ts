import { describe, expect, it } from 'vitest'

import {
  buildAssistantV3LoraHandles,
  renderAssistantV3LoraBoard,
  renderAssistantV3LoraItem,
} from './assistant-v3-lora-board'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'

const SNAPSHOT = {
  prompt: '1girl, snow',
  negativePrompt: 'lowres',
  model: { id: 'illustrious-runner', label: 'WAI-Illustrious-SDXL' },
  availableModels: [
    { id: 'illustrious-runner', label: 'WAI-Illustrious-SDXL' },
  ],
  loras: {
    items: [
      {
        id: 'cmg1abcd0000typhoeus',
        name: '提弗洛斯',
        weight: 1.2,
        enabled: true,
        family: 'Illustrious',
        compatible: true,
        triggerWord: 'typhoeus',
        triggerEnabled: false,
        recommendedPrompt: null,
        sourcePrompts: ['typhoeus, snow, warming hands'],
      },
      {
        id: 'cmg9zzzz0000tianliang',
        name: 'Tianliang style',
        weight: 1,
        enabled: true,
        family: 'Illustrious',
        compatible: true,
        triggerWord: null,
        triggerEnabled: true,
        recommendedPrompt: null,
        sourcePrompts: [],
      },
    ],
    baseFamily: 'Illustrious',
    minWeight: 0.1,
    maxWeight: 2,
  },
} as unknown as AssistantOperatorSnapshot

describe('LoRA 台的板子（v3 S6）', () => {
  const handles = buildAssistantV3LoraHandles(SNAPSHOT)

  it('挂着的 LoRA 用句柄、印出总权重与这台底模的上限、触发词在不在提示词里', () => {
    const board = renderAssistantV3LoraBoard({
      snapshot: SNAPSHOT,
      handles,
      attachedNames: [],
      latestUserText: '交给你调',
    })
    expect(board).toContain('enabled weights add up to 2.2')
    expect(board).toContain('this base model allows at most 2')
    expect(board).toMatch(/- lora-cmg1ab\S* 提弗洛斯 · weight 1\.2/)
    expect(board).toContain('trigger "typhoeus" (NOT in the prompt)')
    expect(board).toContain('Open on the left: no example picture.')
  })

  it('read：来源图提示词全文；认不出的名字回 null', () => {
    const id = 'cmg1abcd0000typhoeus'
    expect(
      renderAssistantV3LoraItem(handles.handleOf(id), SNAPSHOT, handles),
    ).toContain('source picture 1: "typhoeus, snow, warming hands"')
    expect(renderAssistantV3LoraItem('sample', SNAPSHOT, handles)).toBe(
      'No example picture is open on the left.',
    )
    expect(renderAssistantV3LoraItem('lora-nope', SNAPSHOT, handles)).toBeNull()
  })
})
