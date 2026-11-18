import { describe, expect, it } from 'vitest'

import { operatorTurnKnobOrigins } from '@/lib/studio-operator-confirm-origins'
import type { AssistantOperatorStep } from '@/types/assistant-operator'
import type { StudioOperatorThreadEntry } from '@/types/studio-assistant-operator'

/**
 * 确认卡「旧值 → 新值」里的旧值：只认**这一轮**（最后一句用户话之后）做成、没撤销的步，
 * 每颗取第一次动它之前的值。
 */

function step(overrides: Record<string, unknown>): AssistantOperatorStep {
  return overrides as unknown as AssistantOperatorStep
}

function stepEntry(
  id: string,
  overrides: Record<string, unknown>,
  undone = false,
): StudioOperatorThreadEntry {
  return {
    kind: 'step',
    id,
    runKey: 'run-1',
    undone,
    step: step({ id, title: id, status: 'done', ...overrides }),
  }
}

function userEntry(id: string): StudioOperatorThreadEntry {
  return { kind: 'user', id, text: '改一下', attachments: [] }
}

describe('operatorTurnKnobOrigins', () => {
  it('取每颗第一次动之前的值；同一颗改两次仍是最初那个', () => {
    const origins = operatorTurnKnobOrigins([
      userEntry('u1'),
      stepEntry('s1', {
        tool: 'set_specs',
        payload: { aspectRatio: '4:3', resolution: '2K' },
        inverse: { aspectRatio: '1:1', resolution: null },
      }),
      stepEntry('s2', {
        tool: 'set_specs',
        payload: { aspectRatio: '16:9', resolution: '2K' },
        inverse: { aspectRatio: '4:3', resolution: '2K' },
      }),
      stepEntry('s3', {
        tool: 'set_count',
        payload: { count: 4 },
        inverse: { count: 1 },
      }),
      stepEntry('s4', {
        tool: 'set_model',
        payload: { modelId: 'flux-2-flash' },
        inverse: { modelId: 'seedream-4' },
      }),
    ])
    expect(origins).toEqual({
      aspect: '1:1',
      resolution: null,
      count: '1',
      model: 'seedream-4',
    })
  })

  it('上一轮的步、撤销过的步、没做成的步都不算', () => {
    const origins = operatorTurnKnobOrigins([
      userEntry('u1'),
      stepEntry('old', {
        tool: 'set_count',
        payload: { count: 2 },
        inverse: { count: 1 },
      }),
      userEntry('u2'),
      stepEntry(
        'undone',
        {
          tool: 'set_model',
          payload: { modelId: 'flux-2-flash' },
          inverse: { modelId: 'seedream-4' },
        },
        true,
      ),
      stepEntry('failed', {
        tool: 'set_specs',
        status: 'error',
        payload: { aspectRatio: '16:9', resolution: '2K' },
        inverse: { aspectRatio: '1:1', resolution: null },
      }),
    ])
    expect(origins).toEqual({})
  })
})
